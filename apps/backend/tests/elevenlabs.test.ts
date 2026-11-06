import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ElevenLabsProvider, pcmToWav } from '../src/modules/providers/adapters/elevenlabs.adapter.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';

test('ElevenLabs sends server-side credentials and produces WAV with measured duration', async t => {
  const key = env.ELEVENLABS_API_KEY; env.ELEVENLABS_API_KEY = 'secret-test';
  t.after(() => { env.ELEVENLABS_API_KEY = key; });
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal((init!.headers as Record<string, string>)['xi-api-key'], 'secret-test');
    assert(!String(url).includes('secret-test'));
    assert(String(url).includes('/voice123?output_format=pcm_22050'));
    const body = JSON.parse(String(init!.body));
    assert.equal(body.text, 'A clear narration.'); assert.equal(body.model_id, env.ELEVENLABS_MODEL);
    return new Response(Buffer.alloc(44100), { headers: { 'Content-Type': 'audio/pcm' } });
  });
  const result = await new ElevenLabsProvider().execute({ userId: 'user', workspaceId: 'workspace', capability: 'text-to-speech', input: { text: 'A clear narration.', voiceId: 'voice123' } });
  assert.equal(result.output!.duration, 1); assert.equal(result.usage!.characters, 18);
  const wav = result.output!.audio as Buffer;
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(40), 44100);
  assert.equal(wav.readUInt32LE(24), 22050); assert.equal(result.estimatedCost, undefined);
});

test('ElevenLabs voice listing sanitizes metadata and failures never expose credentials', async t => {
  const key = env.ELEVENLABS_API_KEY; env.ELEVENLABS_API_KEY = 'secret-test';
  t.after(() => { env.ELEVENLABS_API_KEY = key; });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ voices: [{ voice_id: 'voice123', name: 'Narrator', preview_url: 'https://example.com/sample.mp3', secret: 'hidden' }] })));
  assert.deepEqual(await new ElevenLabsProvider().voices(), [{ id: 'voice123', name: 'Narrator', previewUrl: 'https://example.com/sample.mp3' }]);
  for (const [status, code] of [[401, 'PROVIDER_AUTHENTICATION_FAILED'], [429, 'PROVIDER_RATE_LIMITED'], [402, 'QUOTA_EXCEEDED'], [503, 'PROVIDER_UNAVAILABLE']] as const) {
    t.mock.method(globalThis, 'fetch', async () => new Response('secret-test', { status }));
    await assert.rejects(new ElevenLabsProvider().voices(), (e: unknown) => e instanceof AppError && e.code === code && !e.message.includes('secret-test'));
  }
  assert.throws(() => pcmToWav(Buffer.alloc(3)));
});
