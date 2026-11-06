import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaBytes, MAX_UPLOAD_BYTES } from '../src/modules/media/media.validation.js';
import { buildPcmWav, matchPcmDuration, readPcmWav } from '../src/modules/providers/audio-wav.js';
import { fitAudioDuration } from '../src/modules/media/audio-fit.js';
import { maxWordsFor, wordsPerSecond } from '../src/modules/providers/pacing.js';

test('media uploads reject executable, mismatched, empty, oversized and cross-kind content', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal(validateMediaBytes(png, 'image/png', 'visual'), 'image');
  for (const [bytes, mime, kind] of [
    [Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png', 'visual'],
    [png, 'image/png', 'audio'], [png, 'image/svg+xml', 'visual'],
    [Buffer.alloc(0), 'image/png', 'visual'], [Buffer.alloc(MAX_UPLOAD_BYTES + 1), 'image/png', 'visual'],
    [Buffer.from('000000186674797061766966', 'hex'), 'video/mp4', 'visual'],
  ] as const) assert.throws(() => validateMediaBytes(bytes, mime, kind));
});

test('generated MP4s above the upload cap retain content validation without a size cap', () => {
  const clip = Buffer.alloc(MAX_UPLOAD_BYTES + 1024);
  clip.write('ftyp', 4); clip.write('isom', 8);
  assert.equal(validateMediaBytes(clip, 'video/mp4', 'visual', true), 'video');
  assert.throws(() => validateMediaBytes(clip, 'video/mp4', 'visual'));
  clip.fill(0, 0, 12);
  assert.throws(() => validateMediaBytes(clip, 'video/mp4', 'visual', true));
});

test('narration is padded or trimmed to the exact scene duration', async () => {
  const sampleRate = 24000;
  const wav = buildPcmWav(Buffer.alloc(sampleRate * 2), 1, sampleRate); // one second of mono PCM
  const padded = await fitAudioDuration(wav, 'audio/wav', 2.5);
  assert.equal(padded.mimeType, 'audio/wav');
  assert.ok(Math.abs(padded.duration - 2.5) < 1e-9, 'padded duration matches the scene');
  assert.equal(readPcmWav(padded.audio).pcm.length, Math.round(2.5 * sampleRate) * 2);
  const trimmed = matchPcmDuration(wav, 0.5);
  assert.ok(Math.abs(trimmed.duration - 0.5) < 1e-9, 'trimmed duration matches the scene');
  assert.equal(readPcmWav(trimmed.audio).pcm.length, Math.round(0.5 * sampleRate) * 2);
});

test('narration word budgets follow the speaking pace of each language', () => {
  assert.equal(wordsPerSecond('en'), 2.4);
  assert.equal(wordsPerSecond('hi-IN'), 2);
  assert.equal(maxWordsFor(10, 'en'), 24);
  assert.equal(maxWordsFor(10, 'hi'), 20);
  assert.equal(maxWordsFor(0, 'en'), 0);
});
