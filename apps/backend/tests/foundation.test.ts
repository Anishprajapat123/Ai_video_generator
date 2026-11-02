import { test, TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { requireWorkspaceAccess } from '../src/common/utils/access.js';
import { WorkspaceMemberModel } from '../src/database/models/WorkspaceMember.model.js';
import { ProjectModel } from '../src/database/models/Project.model.js';
import { ScriptModel } from '../src/database/models/Script.model.js';
import { SceneModel } from '../src/database/models/Scene.model.js';
import { StoryboardModel } from '../src/database/models/Storyboard.model.js';
import { SessionModel } from '../src/database/models/Session.model.js';
import { UserModel } from '../src/database/models/User.model.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { createSession } from '../src/modules/auth/session.service.js';
import { RateLimitModel } from '../src/database/models/RateLimit.model.js';
import { scriptService } from '../src/modules/scripts/script.service.js';
import { storyboardService } from '../src/modules/storyboards/storyboard.service.js';
import { sceneService } from '../src/modules/scenes/scene.service.js';
import { AIProviderManager, providerManager } from '../src/modules/providers/provider.manager.js';
import { IAIProvider } from '../src/modules/providers/provider.interface.js';
import { AppError } from '../src/common/errors/app-error.js';
import { hashToken } from '../src/modules/auth/session.service.js';
import { parseEnvironment } from '../src/config/environment.js';
import { env } from '../src/config/env.js';
import { GeminiProvider } from '../src/modules/providers/adapters/gemini.adapter.js';
import { projectSettingsSchema, sceneUpdateSchema } from '../src/common/utils/validation.js';
import { scriptOutputSchema } from '../src/modules/providers/output.schemas.js';

const id = () => new mongoose.Types.ObjectId().toString();
const userId = id(), workspaceId = id(), projectId = id();
const request = { userId, workspaceId, projectId, capability: 'llm' as const, input: { prompt: 'Explain computers' } };
const noAccounting = async () => {};
const query = (value: unknown) => ({ session: async () => value });
const forbidden = (error: unknown) => error instanceof AppError && error.statusCode === 403;

test('workspace writes reject viewers and inactive members; reads allow active viewers', async t => {
  t.mock.method(WorkspaceMemberModel, 'findOne', async (filter: Record<string, unknown>) => {
    assert.equal(filter.status, 'active');
    return { role: 'viewer' };
  });
  await requireWorkspaceAccess(workspaceId, userId);
  await assert.rejects(requireWorkspaceAccess(workspaceId, userId, true), forbidden);
  t.mock.method(WorkspaceMemberModel, 'findOne', async () => null);
  await assert.rejects(requireWorkspaceAccess(workspaceId, userId), forbidden);
});

test('foreign users cannot read, approve, change or regenerate scripts, boards and scenes', async t => {
  const project = { _id: projectId, workspaceId };
  t.mock.method(ProjectModel, 'findOne', async () => project);
  t.mock.method(WorkspaceMemberModel, 'findOne', async () => null);
  t.mock.method(ScriptModel, 'findById', async () => ({ projectId }));
  t.mock.method(StoryboardModel, 'findById', async () => ({ projectId }));
  t.mock.method(SceneModel, 'findById', async () => ({ projectId }));
  const provider = t.mock.method(providerManager, 'execute', async () => { throw new Error('Provider must not be reached'); });
  for (const call of [
    () => scriptService.getScriptById(id(), userId), () => scriptService.approveScript(id(), userId),
    () => scriptService.generateScript(projectId, userId, { prompt: 'example prompt' }),
    () => storyboardService.getStoryboard(id(), userId), () => storyboardService.approveStoryboard(id(), userId),
    () => storyboardService.generateStoryboardFromScript(projectId, id(), userId),
    () => sceneService.listProjectScenes(projectId, userId), () => sceneService.getSceneById(id(), userId),
    () => sceneService.updateScene(id(), userId, { narration: 'changed' }),
    () => sceneService.regenerateScene(id(), userId, { narration: 'rewrite' }),
  ]) await assert.rejects(call(), forbidden);
  assert.equal(provider.mock.callCount(), 0);
});

test('storyboard refuses scripts from another project before writing anything', async t => {
  const project = { _id: projectId, workspaceId };
  t.mock.method(ProjectModel, 'findOne', () => ({ ...query(project), then: (resolve: (v: unknown) => unknown) => Promise.resolve(project).then(resolve) }));
  t.mock.method(WorkspaceMemberModel, 'findOne', async () => ({ role: 'owner' }));
  t.mock.method(mongoose.connection, 'transaction', async (callback: (session: unknown) => unknown) => callback({}));
  t.mock.method(ScriptModel, 'findOne', (filter: Record<string, unknown>) => { assert.equal(filter.projectId, projectId); assert.equal(filter.workspaceId, workspaceId); return query(null); });
  const writes = t.mock.method(StoryboardModel.prototype, 'save', async () => { throw new Error('Must not write'); });
  await assert.rejects(storyboardService.generateStoryboardFromScript(projectId, id(), userId), (error: unknown) => error instanceof AppError && error.statusCode === 404);
  assert.equal(writes.mock.callCount(), 0);
});

function provider(id: string, execute = async () => ({ providerId: id, status: 'completed' as const, output: {} })): IAIProvider {
  return { metadata: { id, name: id, enabled: true, priority: 1, capabilities: ['llm'] }, isAvailable: async () => true, execute };
}
test('provider selection never silently uses mocks or ignores explicit choices', async () => {
  const manager = new AIProviderManager([provider('mock-ai')], noAccounting);
  await assert.rejects(manager.execute(request), (e: unknown) => e instanceof AppError && e.code === 'PROVIDER_UNAVAILABLE');
  assert.equal((await manager.execute({ ...request, options: { providerId: 'mock-ai' } })).providerId, 'mock-ai');
  await assert.rejects(manager.execute({ ...request, options: { providerId: 'missing' } }), (e: unknown) => e instanceof AppError && e.code === 'PROVIDER_DISABLED');
  await assert.rejects(manager.execute({ ...request, capability: 'text-to-speech', options: { providerId: 'mock-ai' } }));
});
test('failed providers are recorded; authentication and accounting failures stop fallback', async () => {
  let calls = 0;
  const fallback = provider('fallback', async () => { calls++; return { providerId: 'fallback', status: 'completed', output: {} }; });
  const authFailure = provider('primary', async () => { throw new AppError(502, 'PROVIDER_AUTHENTICATION_FAILED', 'Bad credentials'); });
  const records: unknown[] = [];
  await assert.rejects(new AIProviderManager([authFailure, fallback], async e => { records.push(e); }).execute(request));
  assert.equal(calls, 0);
  assert.equal(records.length, 1);
  await assert.rejects(new AIProviderManager([provider('primary'), fallback], async () => { throw new Error('DB down'); }).execute(request));
  assert.equal(calls, 0);
});
test('script validation rejects empty output, duplicate IDs, invalid timing and unordered sections', () => {
  const section = { sectionId: 'one', heading: 'Heading', narration: 'Hello world', estimatedDuration: 10, order: 1 };
  assert.equal(scriptOutputSchema.safeParse({ title: 'test', sections: [section] }).success, true);
  for (const sections of [[], [section, section], [{ ...section, estimatedDuration: -1 }], [{ ...section, order: 2 }]]) {
    assert.equal(scriptOutputSchema.safeParse({ title: 'test', sections }).success, false);
  }
});
test('settings and scene validation reject unknown fields, invalid FPS, durations and arbitrary graphics', () => {
  for (const settings of [{ duration: -5 }, { fps: 999 }, { resolution: '8k' }, { arbitrary: true }]) assert.equal(projectSettingsSchema.safeParse(settings).success, false);
  for (const scene of [{}, { duration: 0 }, { workspaceId }, { title: '   ' }, { motionGraphics: [{ id: 'one', type: 'javascript', properties: { text: 'code' } }] }]) assert.equal(sceneUpdateSchema.safeParse(scene).success, false);
});
test('production environment rejects mocks, insecure frontend origins and invalid settings', () => {
  assert.throws(() => parseEnvironment({ NODE_ENV: 'production' }));
  assert.throws(() => parseEnvironment({ NODE_ENV: 'production', FRONTEND_URL: 'https://studio.example', ENABLE_MOCK_PROVIDER: 'true' }));
  assert.throws(() => parseEnvironment({ PORT: 'garbage' }));
  assert.throws(() => parseEnvironment({ FRONTEND_URL: 'https://studio.example/' }));
  assert.equal(parseEnvironment({ NODE_ENV: 'production', FRONTEND_URL: 'https://studio.example' }).isProd, true);
});

async function httpFixture(t: TestContext) {
  const server = createServer(createApp()).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1';
  const csrfResponse = await fetch(base + '/auth/csrf');
  const { data } = await csrfResponse.json() as { data: { csrfToken: string } };
  return { base, csrf: data.csrfToken, cookie: 'csrf_token=' + data.csrfToken };
}
test('HTTP rejects unsafe requests without CSRF and accepts only matching tokens and origins', async t => {
  const { base, csrf, cookie } = await httpFixture(t);
  let response = await fetch(base + '/auth/login', { method: 'POST' });
  assert.equal(response.status, 403);
  response = await fetch(base + '/auth/login', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, origin: 'https://attacker.example' } });
  assert.equal(response.status, 403);
  response = await fetch(base + '/auth/logout', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } });
  assert.equal(response.status, 401);
});
test('HTTP sessions reject expired and suspended accounts; logout invalidates token immediately', async t => {
  const { base, csrf, cookie } = await httpFixture(t);
  let valid = true;
  let status = 'active';
  const token = 'a'.repeat(64), sessionId = id();
  t.mock.method(SessionModel, 'findOne', async (filter: { tokenHash: string; expiresAt: { $gt: Date } }) => { assert.equal(filter.tokenHash, hashToken(token)); assert(filter.expiresAt.$gt instanceof Date); return valid ? { id: sessionId, userId } : null; });
  t.mock.method(UserModel, 'findById', async () => ({ id: userId, email: 'user@example.com', defaultWorkspaceId: workspaceId, status }));
  t.mock.method(SessionModel, 'deleteOne', async (filter: Record<string, unknown>) => { assert.equal(filter._id, sessionId); valid = false; return { deletedCount: 1 }; });
  const headers = { cookie: cookie + '; auth_token=' + token, 'x-csrf-token': csrf };
  assert.equal((await fetch(base + '/providers', { headers })).status, 200);
  status = 'suspended';
  assert.equal((await fetch(base + '/providers', { headers })).status, 401);
  status = 'active';
  assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(base + '/providers', { headers })).status, 401);
});
test('HTTP malformed JSON and invalid IDs return 400 with request IDs', async t => {
  const { base, csrf, cookie } = await httpFixture(t);
  const response = await fetch(base + '/auth/login', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  assert((await response.json() as any).error.requestId);
  t.mock.method(SessionModel, 'findOne', async () => ({ id: id(), userId }));
  t.mock.method(UserModel, 'findById', async () => ({ id: userId, email: 'user@example.com', defaultWorkspaceId: workspaceId, status: 'active' }));
  assert.equal((await fetch(base + '/scripts/not-an-object-id', { headers: { cookie: cookie + '; auth_token=' + 'a'.repeat(64) } })).status, 400);
});
test('HTTP login throttling persists atomically and returns Retry-After', async t => {
  const { base, csrf, cookie } = await httpFixture(t);
  t.mock.method(RateLimitModel, 'findOneAndUpdate', async () => ({ count: 11 }));
  const response = await fetch(base + '/auth/login', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 429);
  assert(Number(response.headers.get('retry-after')) > 0);
});
test('HTTP CSRF requests from other tabs reuse the cookie and preserve in-flight write tokens', async t => {
  const { base, csrf, cookie } = await httpFixture(t);
  const responses = await Promise.all([fetch(base + '/auth/csrf', { headers: { cookie } }), fetch(base + '/auth/csrf', { headers: { cookie } })]);
  for (const response of responses) {
    assert.equal((await response.json() as { data: { csrfToken: string } }).data.csrfToken, csrf);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  // Reaching authentication (401) rather than CSRF rejection (403) proves the earlier token remains usable.
  const write = await fetch(base + '/auth/logout', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } });
  assert.equal(write.status, 401);
});
test('session creation stores only a hash, and HTTP login never returns the raw token in JSON', async t => {
  let stored: Record<string, unknown> | undefined;
  t.mock.method(SessionModel, 'create', async (record: Record<string, unknown>) => { stored = record; return record; });
  const token = await createSession(userId);
  assert.equal(stored!.tokenHash, hashToken(token));
  assert(!JSON.stringify(stored).includes(token));
  const { base, csrf, cookie } = await httpFixture(t);
  t.mock.method(RateLimitModel, 'findOneAndUpdate', async () => ({ count: 1 }));
  t.mock.method(authService, 'login', async () => ({ user: { id: userId, name: 'Test User', email: 'user@example.com', defaultWorkspaceId: workspaceId }, token }));
  const response = await fetch(base + '/auth/login', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'user@example.com', password: 'test-password' }) });
  assert.equal(response.status, 200);
  assert(!JSON.stringify(await response.json()).includes(token));
  assert(response.headers.get('set-cookie')?.includes('HttpOnly'));
});
test('Gemini sends key in header, uses configured model and validates structured response', async t => {
  const previous = { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  env.GEMINI_API_KEY = 'test-key'; env.GEMINI_MODEL = 'test-model';
  t.after(() => { env.GEMINI_API_KEY = previous.key; env.GEMINI_MODEL = previous.model; });
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert(!String(url).includes('test-key'));
    assert(String(url).includes('test-model:generateContent'));
    assert.equal((init!.headers as Record<string, string>)['x-goog-api-key'], 'test-key');
    assert(init!.signal);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ narration: 'Updated narration' }) }] } }] }));
  });
  const result = await new GeminiProvider().execute({ ...request, input: { task: 'scene-rewrite' } });
  assert.equal(result.output?.narration, 'Updated narration');
  assert.equal(result.estimatedCost, undefined);
});
test('Gemini maps credential, rate limit, timeout and invalid JSON errors without leaking secrets', async t => {
  const previous = { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  env.GEMINI_API_KEY = 'test-secret'; env.GEMINI_MODEL = 'test-model';
  t.after(() => { env.GEMINI_API_KEY = previous.key; env.GEMINI_MODEL = previous.model; });
  for (const [status, code] of [[401, 'PROVIDER_AUTHENTICATION_FAILED'], [429, 'PROVIDER_RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE']] as const) {
    t.mock.method(globalThis, 'fetch', async () => new Response('test-secret', { status }));
    await assert.rejects(new GeminiProvider().execute(request), (e: unknown) => e instanceof AppError && e.code === code && !e.message.includes('test-secret'));
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('test-secret', 'TimeoutError'); });
  await assert.rejects(new GeminiProvider().execute(request), (e: unknown) => e instanceof AppError && e.code === 'PROVIDER_TIMEOUT');
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'invalid' }] } }] })));
  await assert.rejects(new GeminiProvider().execute(request), (e: unknown) => e instanceof AppError && e.code === 'PROVIDER_INVALID_RESPONSE');
});
