import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { OpenRouterProvider, openRouterModels } from '../src/modules/providers/adapters/openrouter.adapter.js';
import { CollaborativeProvider } from '../src/modules/providers/adapters/collaborative.adapter.js';
import { visualPlanFixture } from './fixtures/visual-plan.js';
import type { ProviderRequest } from '@ai-video-studio/shared-types';

const script = { title: 'Water cycle', sections: [{ sectionId: 'one', heading: 'Rain', narration: 'Water returns as rain.', estimatedDuration: 10, order: 1, visualSuggestion: 'Illustrate rainfall.' }] };
const request: ProviderRequest = { userId: 'user', workspaceId: 'workspace', capability: 'llm', input: { task: 'script-generation', prompt: 'Explain rain', duration: 10 } };
function configured(t: TestContext) {
  const saved = { key: env.OPENROUTER_API_KEY, gemini: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, enabled: env.AI_TEAM_ENABLED };
  env.OPENROUTER_API_KEY = 'secret-test-key'; env.GEMINI_API_KEY = 'test-gemini'; env.GEMINI_MODEL = 'test-model'; env.AI_TEAM_ENABLED = true;
  t.after(() => { env.OPENROUTER_API_KEY = saved.key; env.GEMINI_API_KEY = saved.gemini; env.GEMINI_MODEL = saved.model; env.AI_TEAM_ENABLED = saved.enabled; });
}
test('both OpenRouter adapters use fixed free model IDs and validate only final JSON content', async t => {
  configured(t);
  for (const id of Object.keys(openRouterModels) as (keyof typeof openRouterModels)[]) {
    const mock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer secret-test-key');
      const body = JSON.parse(String(init.body)); assert.equal(body.model, openRouterModels[id]); assert.equal(body.provider.allow_fallbacks, false); assert.equal(body.stream, false); assert.equal(body.reasoning.exclude, true);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(script), reasoning_details: [{ text: 'not public output' }] } }], usage: { prompt_tokens: 5, completion_tokens: 8 } });
    });
    const result = await new OpenRouterProvider(id).execute(request);
    assert.deepEqual(result.output, script); assert.equal(result.usage?.outputTokens, 8); assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
});
test('OpenRouter rate limits stop immediately without leaking provider bodies or switching models', async t => {
  configured(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('secret-test-key internal error', { status: 429 }));
  await assert.rejects(new OpenRouterProvider('openrouter-gemma').execute(request), (error: unknown) => error instanceof Error && /rate limit/.test(error.message) && !error.message.includes('secret-test-key'));
  assert.equal(mock.mock.callCount(), 1);
});
test('visual team shares Gemma planning, Gemini artwork and Nemotron feedback with one bounded revision', async t => {
  configured(t); const calls: ProviderRequest[] = []; let reviews = 0;
  const team = new CollaborativeProvider(async child => {
    calls.push(child);
    const providerId = String(child.options!.providerId);
    if (child.input.task === 'agent-brief') return { providerId, status: 'completed', output: { direction: 'Show rain as moving drops.', checks: ['Readable labels'] } };
    if (child.input.task === 'agent-review') return { providerId, status: 'completed', output: ++reviews === 1 ? { approved: false, issues: ['Improve contrast'], summary: 'Needs contrast correction' } : { approved: true, issues: [], summary: 'Plan approved' } };
    if (child.input.agentRole === 'revision') assert.deepEqual(child.input.reviewFeedback, ['Improve contrast']);
    assert(child.input.collaborationContext);
    return { providerId, status: 'completed', output: visualPlanFixture as unknown as Record<string, unknown> };
  });
  const result = await team.execute({ ...request, input: { task: 'visual-plan', narration: 'Water falls as rain.' } });
  assert.deepEqual(calls.map(call => call.options!.providerId), ['openrouter-gemma', 'gemini', 'openrouter-nemotron', 'gemini', 'openrouter-nemotron']);
  assert.equal(result.collaboration?.revised, true); assert.equal(result.collaboration?.stages.length, 5);
  assert.deepEqual(calls[2].input.candidate, visualPlanFixture);
});
test('team stops after one rejected correction and never starts an agent discussion loop', async t => {
  configured(t); let calls = 0;
  const team = new CollaborativeProvider(async child => {
    calls++;
    return { providerId: String(child.options!.providerId), status: 'completed', output: child.input.task === 'agent-review' ? { approved: false, issues: ['Timing is wrong'], summary: 'Rejected' } : script };
  });
  await assert.rejects(team.execute(request), /after one correction/); assert.equal(calls, 4);
});
