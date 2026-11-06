import { test } from 'node:test';
import { preferredNarrationVoice } from '../lib/media';

test('narration defaults prefer installed Piper voices matching English or Hindi', () => {
  const voices = [{ id: 'kitten', language: 'en' }, { id: 'piper-english', language: 'en' }, { id: 'piper-pratham', language: 'hi' }, { id: 'piper-priyamvada', language: 'hi' }];
  assert.equal(preferredNarrationVoice(voices, 'en'), 'piper-english');
  assert.equal(preferredNarrationVoice(voices, 'hi-IN'), 'piper-priyamvada');
  assert.equal(preferredNarrationVoice(voices.filter(voice => voice.id !== 'piper-priyamvada'), 'hi'), 'piper-pratham');
  assert.equal(preferredNarrationVoice([], 'en'), '');
});
import assert from 'node:assert/strict';
import { sceneMedia, sceneDuration } from '../lib/media';
import type { Scene, MediaAsset } from '../lib/api';

test('scene media readiness requires assigned media and valid narration or explicit silence', () => {
  const scene = { duration: 10, visualAssetIds: ['image'], voiceAssetId: 'audio' } as Scene;
  const image = { _id: 'image', type: 'video' } as MediaAsset;
  const audio = { _id: 'audio', type: 'audio', duration: 10 } as MediaAsset;
  assert.equal(sceneMedia(scene, [image, audio]).ready, true);
  assert.equal(sceneMedia(scene, [{ ...image, type: 'image' }, audio]).ready, false, 'An image is not a generated video');
  assert.equal(sceneMedia(scene, [audio]).ready, false);
  assert.equal(sceneMedia(scene, [image]).ready, false);
  assert.equal(sceneMedia(scene, [image, { ...audio, duration: undefined }]).ready, false);
  assert.equal(sceneMedia({ ...scene, narrationOptional: true }, [image]).ready, true);
  assert.equal(sceneMedia({ ...scene, narrationOptional: true, visualAssetIds: [], motionGraphics: [{ type: 'kinetic-title', properties: { text: 'Title' } }] }, []).ready, false);
  // A changed scene needs its stored narration refitted before export.
  assert.equal(sceneMedia({ ...scene, duration: 5 }, [image, audio]).ready, false);
});

test('scene duration is exactly the planned scene length', () => {
  const scene = { duration: 4, visualAssetIds: ['clip'], voiceAssetId: 'audio' } as Scene;
  const clip = { _id: 'clip', type: 'video', duration: 6 } as MediaAsset;
  const audio = { _id: 'audio', type: 'audio', duration: 10 } as MediaAsset;
  assert.equal(sceneDuration(scene, [clip, audio]), 4);
  assert.equal(sceneDuration({ ...scene, duration: 12 }, [clip, audio]), 12);
  assert.equal(sceneDuration({ ...scene, narrationOptional: true }, [clip, audio]), 4);
  assert.equal(sceneDuration(scene, [clip]), 4);
});
