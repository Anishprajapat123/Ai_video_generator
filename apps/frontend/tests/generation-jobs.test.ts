import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../lib/api';

test('generation submits once and survives failed status polls without generating again', async t => {
  let submissions = 0; let polls = 0;
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => setImmediate(callback));
  t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    if (url.endsWith('/auth/csrf')) return Response.json({ success: true, data: { csrfToken: 'token' } });
    if (url.endsWith('/jobs')) {
      submissions++; assert(new Headers(options?.headers).get('X-Generation-Request'));
      return Response.json({ success: true, data: { job: { _id: 'saved-job' } } }, { status: 202 });
    }
    assert(url.endsWith('/content-jobs/saved-job'));
    if (++polls === 1) return new Response('Temporary tunnel failure', { status: 502 });
    return Response.json({ success: true, data: { job: polls === 2 ? { status: 'processing' } : { status: 'completed', result: { scene: { _id: 'scene' } } } } });
  });
  const options = { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: 'revision' }) };
  const [first, second] = await Promise.all([api('/scenes/scene/explainer/generate', options), api('/scenes/scene/explainer/generate', options)]);
  assert.deepEqual(first, { scene: { _id: 'scene' } }); assert.deepEqual(second, first);
  assert.equal(submissions, 1); assert.equal(polls, 3);
});

test('lost submission responses reuse the persisted request ID on explicit reconnection', async t => {
  const memory = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) || null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const ids: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    if (url.endsWith('/auth/csrf')) return Response.json({ success: true, data: { csrfToken: 'token' } });
    if (url.endsWith('/jobs')) {
      ids.push(new Headers(options?.headers).get('X-Generation-Request')!);
      if (ids.length === 1) throw new TypeError('Connection dropped after submit');
      return Response.json({ success: true, data: { job: { _id: 'existing-job' } } });
    }
    return Response.json({ success: true, data: { job: { status: 'completed', result: { script: { _id: 'script' } } } } });
  });
  const options = { method: 'POST', body: JSON.stringify({ prompt: 'Explain waterfalls' }) };
  await assert.rejects(api('/projects/project/scripts/generate', options), (error: unknown) => error instanceof ApiError && error.status === 0);
  assert.deepEqual(await api('/projects/project/scripts/generate', options), { script: { _id: 'script' } });
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); assert.equal(memory.size, 0);
});
