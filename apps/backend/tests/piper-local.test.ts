import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PiperLocalProvider, piperVoices, piperLengthScale } from '../src/modules/providers/adapters/piper-local.adapter.js';
import { env } from '../src/config/env.js';
import type { ProviderRequest } from '@ai-video-studio/shared-types';

test('Piper neural pacing uses the voice rate and keeps adjustments moderate', () => {
  const text = Array(24).fill('word').join(' ');
  assert(Math.abs(piperLengthScale('piper-english', text, 10) - 1.1583) < .001);
  assert.equal(piperLengthScale('piper-english', 'hello', 10), 1.35);
  assert.equal(piperLengthScale('piper-english', text), 1);
  assert.equal(piperLengthScale('piper-english', Array(100).fill('word').join(' '), 10), .8);
});

test('Piper exposes distinct English and Hindi voice IDs, and rejects unlisted models before synthesis', async t => {
  assert.equal(piperVoices.filter(voice => voice.language === 'hi').length, 2);
  assert.equal(new Set(piperVoices.map(voice => voice.id)).size, piperVoices.length);
  const provider = new PiperLocalProvider();
  t.mock.method(provider, 'voices', async () => piperVoices);
  const request = { capability: 'text-to-speech', input: { text: 'नमस्ते', voiceId: '../../model' } } as unknown as ProviderRequest;
  await assert.rejects(provider.execute(request), /installed Piper voice/);
});

test('Piper missing interpreter does not advertise usable voices', async t => {
  const previous = env.LOCAL_TTS_PYTHON;
  env.LOCAL_TTS_PYTHON = 'missing-piper-python';
  t.after(() => { env.LOCAL_TTS_PYTHON = previous; });
  const provider = new PiperLocalProvider();
  assert.equal(await provider.isAvailable(), false);
  await assert.rejects(provider.voices(), /Set up/);
});
