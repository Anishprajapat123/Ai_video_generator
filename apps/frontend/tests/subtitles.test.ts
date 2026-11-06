import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitles, subtitleFile, subtitleScale } from '../lib/subtitles';
import { buildVideoPreview } from '../lib/video-preview';
import type { Project, Scene, MediaAsset } from '../lib/api';

test('captions preserve script text, cover measured narration and keep ordered frame boundaries', () => {
  const text = 'The river flows over a cliff. Water falls into a pool!';
  const cues = buildSubtitles(text, 4.27, 30);
  assert.equal(cues.map(cue => cue.text).join(' '), text);
  assert.equal(cues[0].startFrame, 0); assert.equal(cues.at(-1)?.endFrame, 128);
  cues.forEach((cue, i) => { assert(cue.endFrame > cue.startFrame); if (i) assert.equal(cue.startFrame, cues[i - 1].endFrame); });
  assert.deepEqual(buildSubtitles('', 3, 30), []);
  assert.equal(buildSubtitles('One. Two. Three.', .04, 30).length, 1);
});

test('subtitle downloads use correct timestamps and escape cue markup', () => {
  const cues = [{ text: '<water> & light', startFrame: 30, endFrame: 75 }];
  assert.match(subtitleFile(cues, 30, 'srt'), /00:00:01,000 --> 00:00:02,500/);
  assert.match(subtitleFile(cues, 30, 'vtt'), /^WEBVTT\n\n1\n00:00:01.000/);
  assert.match(subtitleFile(cues, 30, 'vtt'), /&lt;water&gt; &amp; light/);
  assert.equal(subtitleScale(1, 2), 1);
  for (let t = 0; t < .18; t += .01) assert(subtitleScale(t, 2) >= .05 && subtitleScale(t, 2) <= 1.35);
});

test('preview and export captions honor project setting, scene duration and silent scenes', () => {
  const project = { _id: 'p', storyboardId: 'b', title: 'Test', settings: { fps: 30, aspectRatio: '16:9', subtitlesEnabled: true } } as Project;
  const scene = { _id: 's', projectId: 'p', storyboardId: 'b', title: 'Test', sceneNumber: 1, duration: 5, narration: 'Test narration.', voiceAssetId: 'a', visualAssetIds: ['v'], narrationOptional: false, motionGraphics: [{ type: 'kinetic-title', properties: {} }], transition: { type: 'none', duration: 0 } } as Scene;
  const assets = [{ _id: 'v', type: 'video' }, { _id: 'a', type: 'audio', duration: 5 }] as MediaAsset[];
  // Captions follow the scene/video length because narration audio is fitted to that same length.
  assert.equal(buildVideoPreview(project, [scene], assets).scenes[0].subtitles.at(-1)?.endFrame, 150);
  assert.deepEqual(buildVideoPreview({ ...project, settings: { ...project.settings, subtitlesEnabled: false } }, [scene], assets).scenes[0].subtitles, []);
  assert.deepEqual(buildVideoPreview(project, [{ ...scene, narrationOptional: true }], assets).scenes[0].subtitles, []);
});
