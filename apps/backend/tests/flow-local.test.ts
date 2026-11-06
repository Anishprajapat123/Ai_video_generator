import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FlowLocalProvider, requireFlowOutput } from '../src/modules/providers/adapters/flow-local.adapter.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';

const request = { userId: 'user', workspaceId: 'workspace', projectId: 'project', capability: 'video-generation' as const, input: { prompt: 'A river flowing over a rocky cliff.', aspectRatio: '16:9', duration: 8 }, options: { providerId: 'flow-local', maxCredits: 10 } };
const token = 'a'.repeat(48);
const clip = { video: Buffer.from('local-test-fixture'), width: 1280, height: 720, duration: 8 };

test('Flow blocks missing consent and unsafe outputs before any request or file load', async t => {
  const previous = env.ENABLE_FLOW_VIDEO; env.ENABLE_FLOW_VIDEO = true; t.after(() => { env.ENABLE_FLOW_VIDEO = previous; });
  let calls = 0;
  const provider = new FlowLocalProvider(async () => { calls++; throw new Error('Must not call Flow'); }, async () => token, async () => clip);
  for (const maxCredits of [undefined, 0, -1, 11, 1.5]) await assert.rejects(provider.execute({ ...request, options: { providerId: 'flow-local', maxCredits } }), /spending is blocked/);
  await assert.rejects(provider.execute({ ...request, options: { maxCredits: 10 } }), /explicitly/);
  await assert.rejects(provider.execute({ ...request, input: { ...request.input, aspectRatio: '1:1' } }));
  assert.equal(calls, 0);
  const directory = path.resolve('storage/flow-output');
  assert.throws(() => requireFlowOutput(path.resolve('storage/flow-session/token')), /unexpected/);
  assert.throws(() => requireFlowOutput(path.join(directory, '../outside.mp4')), /unexpected/);
  assert.throws(() => requireFlowOutput(path.join(directory, 'clip.txt')), /unexpected/);
  assert.equal(requireFlowOutput(path.join(directory, 'project/clip.mp4')), path.join(directory, 'project/clip.mp4'));
});

test('Flow submits once with a fixed credit cap, polls and returns the downloaded clip', async t => {
  const previous = env.ENABLE_FLOW_VIDEO; env.ENABLE_FLOW_VIDEO = true; t.after(() => { env.ENABLE_FLOW_VIDEO = previous; });
  const calls: string[] = []; let polls = 0; let externalId = '';
  const file = path.resolve('storage/flow-output/project/scene-01.mp4');
  const provider = new FlowLocalProvider(async (url, init) => {
    const target = String(url); calls.push(target);
    assert(target.startsWith('http://127.0.0.1:8787/api/')); assert.equal(init?.redirect, 'error');
    if (target.endsWith('/health')) return Response.json({ name: 'flow-mcp' });
    assert.equal((init!.headers as Record<string, string>)['x-flow-token'], token);
    if (target.endsWith('/status')) return Response.json({ flow: { signedIn: true, inProject: true, credits_remaining: 40 }, jobs: [] });
    if (target.endsWith('/generate')) {
      const body = JSON.parse(init!.body as string); const scene = body.scenes[0];
      assert.equal(body.scenes.length, 1); assert.equal(scene.max_credits, 10); assert.equal(scene.variants, 1); assert.equal(scene.retries, 0); assert.equal(scene.model, 'Veo 3.1 - Lite');
      return Response.json({ jobs: [{ id: 'flow-job', status: 'queued', files: [] }] });
    }
    polls++;
    assert.deepEqual(JSON.parse(init!.body as string).job_ids, ['flow-job']);
    return Response.json({ jobs: [{ id: 'flow-job', status: polls === 1 ? 'running' : 'done', files: polls === 1 ? [] : [file], credits: 10 }] });
  }, async () => token, async output => { assert.equal(output, file); return clip; });
  const result = await provider.execute({ ...request, options: { ...request.options, onExternalJob: async (id: string) => { externalId = id; } } });
  assert.equal(externalId, 'flow-job'); assert.equal(result.providerId, 'flow-local'); assert.equal(result.usage?.credits, 10); assert.equal(result.output?.video, clip.video);
  assert.equal(calls.filter(url => url.endsWith('/generate')).length, 1);
});

test('Flow quota and uncertain submissions never retry or expose bridge credentials', async t => {
  const previous = env.ENABLE_FLOW_VIDEO; env.ENABLE_FLOW_VIDEO = true; t.after(() => { env.ENABLE_FLOW_VIDEO = previous; });
  let submitted = 0; let credits = 0;
  const provider = new FlowLocalProvider(async url => {
    const target = String(url);
    if (target.endsWith('/health')) return Response.json({ name: 'flow-mcp' });
    if (target.endsWith('/status')) return Response.json({ flow: { signedIn: true, inProject: true, credits_remaining: credits }, jobs: [] });
    submitted++; throw new Error(token);
  }, async () => token, async () => clip);
  await assert.rejects(provider.execute(request), (error: unknown) => error instanceof AppError && error.code === 'QUOTA_EXCEEDED');
  assert.equal(submitted, 0);
  credits = 40;
  await assert.rejects(provider.execute(request), (error: unknown) => error instanceof AppError && /may still finish/.test(error.message) && !error.message.includes(token));
  assert.equal(submitted, 1);
});
