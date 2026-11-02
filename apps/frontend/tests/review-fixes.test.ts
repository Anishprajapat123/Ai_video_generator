import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyCreationDraft, persistCreationDraft, restoreCreationDraft } from '../lib/creation-draft';
import { allowLeavingEditor } from '../lib/leave-guard';
import { api, ApiError, type Project } from '../lib/api';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const project: Project = { _id: 'project-one', title: 'First video', status: 'draft', updatedAt: new Date().toISOString(),
  settings: { duration: 60, aspectRatio: '16:9', language: 'en', style: 'animated-explainer', resolution: '1080p', fps: 30 } };

test('a completed generation clears recovery state so the next creation starts a new project', async () => {
  const local = storage();
  const draft = { ...emptyCreationDraft, title: 'First video', prompt: 'Explain solar energy' };
  persistCreationDraft(local, 'draft', draft, project, false);
  const unfinished = await restoreCreationDraft(local, 'draft', new URLSearchParams(), async () => project);
  assert.equal(unfinished.project?._id, project._id);
  assert.equal(unfinished.draft.prompt, draft.prompt);
  persistCreationDraft(local, 'draft', draft, project, true);
  const next = await restoreCreationDraft(local, 'draft', new URLSearchParams(), async () => { throw new Error('Must not reload the completed project'); });
  assert.equal(next.project, null);
  assert.equal(next.draft.title, '');
  assert.equal(next.scriptId, null);
});
test('old completed recovery entries do not trap new creation, while explicit resume/regenerate still work', async () => {
  const local = storage();
  const complete = { ...project, scriptId: 'script-one' };
  persistCreationDraft(local, 'draft', { ...emptyCreationDraft, title: 'Old draft' }, complete, false);
  const fresh = await restoreCreationDraft(local, 'draft', new URLSearchParams(), async () => complete);
  assert.equal(fresh.project, null);
  assert.equal(local.getItem('draft'), null);
  const resumed = await restoreCreationDraft(local, 'draft', new URLSearchParams('project=project-one'), async () => complete);
  assert.equal(resumed.scriptId, 'script-one');
  const regenerated = await restoreCreationDraft(local, 'draft', new URLSearchParams('project=project-one&regenerate=1'), async () => complete);
  assert.equal(regenerated.project?._id, 'project-one');
  assert.equal(regenerated.scriptId, null);
});
test('sign-out guard blocks unsaved edits when canceled and all departures during a save', () => {
  let logouts = 0, prompts = 0;
  const signOut = (dirty: boolean, pending: boolean, accept: boolean) => {
    if (!allowLeavingEditor(dirty, pending, () => { prompts++; return accept; })) return;
    logouts++;
  };
  signOut(true, false, false);
  assert.equal(logouts, 0);
  signOut(true, true, true);
  assert.equal(logouts, 0);
  assert.equal(prompts, 1);
  signOut(true, false, true);
  assert.equal(logouts, 1);
  signOut(false, false, false);
  assert.equal(logouts, 2);
  assert.equal(prompts, 2);
});
test('parallel API writes share initialization and each carries the CSRF header', async t => {
  let csrfCalls = 0, writes = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/csrf')) { csrfCalls++; return Response.json({ success: true, data: { csrfToken: 'token' } }); }
    writes++;
    assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'token');
    return Response.json({ success: true, data: { saved: true } });
  });
  await Promise.all([api('/one', { method: 'PATCH' }), api('/two', { method: 'PATCH' })]);
  assert.equal(csrfCalls, 1);
  assert.equal(writes, 2);
});
test('API retries only pre-handler CSRF failures and does not retry other denied writes', async t => {
  let writes = 0, businessMutations = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/auth/csrf')) return Response.json({ success: true, data: { csrfToken: 'token' } });
    writes++;
    if (writes === 1) return Response.json({ success: false, error: { code: 'CSRF_VALIDATION_FAILED' } }, { status: 403 });
    businessMutations++;
    return Response.json({ success: true, data: { saved: true } });
  });
  await api('/one', { method: 'PATCH' });
  assert.equal(writes, 2);
  assert.equal(businessMutations, 1);
  let deniedWrites = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/auth/csrf')) return Response.json({ success: true, data: { csrfToken: 'token' } });
    deniedWrites++;
    return Response.json({ success: false, error: { code: 'RESOURCE_ACCESS_DENIED' } }, { status: 403 });
  });
  await assert.rejects(api('/one', { method: 'PATCH' }), (error: unknown) => error instanceof ApiError && error.code === 'RESOURCE_ACCESS_DENIED');
  assert.equal(deniedWrites, 1);
});
