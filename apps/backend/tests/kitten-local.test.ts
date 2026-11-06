import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wavDuration, KittenLocalProvider } from '../src/modules/providers/adapters/kitten-local.adapter.js';
import { pcmToWav } from '../src/modules/providers/adapters/elevenlabs.adapter.js';
import { env } from '../src/config/env.js';

test('local voice duration is measured from validated mono 24 kHz PCM WAV', () => {
  const { audio } = pcmToWav(Buffer.alloc(48000), 24000);
  assert.equal(wavDuration(audio), 1);
  assert.throws(() => wavDuration(Buffer.from('invalid audio')));
  const bad = Buffer.from(audio); bad.writeUInt32LE(4000, 40);
  assert.throws(() => wavDuration(bad));
  assert.throws(() => wavDuration(pcmToWav(Buffer.alloc(44100), 22050).audio));
});
test('local voice setup errors do not advertise fictitious preset availability', async t => {
  const previous = env.LOCAL_TTS_PYTHON; env.LOCAL_TTS_PYTHON = 'missing-local-python';
  t.after(() => { env.LOCAL_TTS_PYTHON = previous; });
  const provider = new KittenLocalProvider();
  assert.equal(await provider.isAvailable(), false);
  await assert.rejects(provider.voices(), /Set up the local voice engine/);
});
