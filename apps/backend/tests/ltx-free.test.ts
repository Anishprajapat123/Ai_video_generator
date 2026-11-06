import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LTX_ORIGIN, LtxFreeProvider, ltxVideoUrl } from '../src/modules/providers/adapters/ltx-free.adapter.js';
import { AppError } from '../src/common/errors/app-error.js';

const request = { userId: 'user', workspaceId: 'workspace', capability: 'video-generation' as const, input: { prompt: 'A waterfall with moving water.', duration: 12, aspectRatio: '16:9' } };
test('hosted video accepts only the fixed demo file origin and MP4 output paths', () => {
  const valid = LTX_ORIGIN + '/gradio_api/file=/tmp/gradio/abcdef/output_42.mp4';
  assert.equal(ltxVideoUrl(valid), valid);
  for (const url of ['http://127.0.0.1/secret.mp4', 'https://example.com/video.mp4', valid + '?token=secret', LTX_ORIGIN + '/gradio_api/file=/etc/passwd', LTX_ORIGIN + '/gradio_api/file=/tmp/gradio/abcdef/a.html']) assert.throws(() => ltxVideoUrl(url));
});
test('hosted video uses anonymous Space API only and stops at quota errors', async () => {
  let calls = 0;
  const provider = new LtxFreeProvider(async (url, options) => {
    calls++; assert.equal(String(url), LTX_ORIGIN + '/gradio_api/call/text_to_video');
    assert.equal(new Headers(options?.headers).has('Authorization'), false); assert.equal(options?.redirect, 'error');
    const body = JSON.parse(String(options?.body)); assert.equal(body.data[6], 'text-to-video'); assert.equal(body.data[7], 8);
    return new Response('private upstream details', { status: 429 });
  });
  provider.metadata.enabled = true;
  await assert.rejects(provider.execute(request), (error: unknown) => error instanceof AppError && error.code === 'QUOTA_EXCEEDED' && !error.message.includes('private'));
  assert.equal(calls, 1);
});
test('hosted video handles split SSE errors without fetching output or exposing provider details', async () => {
  let calls = 0;
  const provider = new LtxFreeProvider(async () => {
    calls++;
    if (calls === 1) return Response.json({ event_id: 'a'.repeat(32) });
    return new Response(new ReadableStream({ start(controller) { for (const part of ['event: hea', 'rtbeat\ndata: null\n\nevent: er', 'ror\ndata: "private upstream error"\n\n']) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }));
  });
  provider.metadata.enabled = true;
  await assert.rejects(provider.execute(request), (error: unknown) => error instanceof AppError && error.code === 'PROVIDER_UNAVAILABLE' && !error.message.includes('private'));
  assert.equal(calls, 2);
});
