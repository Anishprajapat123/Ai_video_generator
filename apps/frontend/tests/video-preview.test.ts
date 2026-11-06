import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoPreview } from '../lib/video-preview';
import type { MediaAsset, Project, Scene } from '../lib/api';
import { sceneEditingDefaults } from '@ai-video-studio/shared-types';
import { visualPlanFixture } from '../../backend/tests/fixtures/visual-plan';

test('custom vector artwork is reused by preview/export and survives saved edits', () => {
  const edited = scene('custom', 1, 10);
  edited.motionGraphics = [{ type: 'remotion-explainer', properties: { points: ['Custom scene'] } }];
  edited.editing = { ...sceneEditingDefaults(edited), visualPlan: visualPlanFixture };
  assert.deepEqual(buildVideoPreview(project, [edited], videos).scenes[0].explainer?.visualPlan, visualPlanFixture);
});
const project = { _id: 'project', storyboardId: 'board', title: 'Solar energy', settings: { fps: 24, aspectRatio: '16:9' } } as Project;
const videos = [{ _id: 'v', type: 'video' }] as MediaAsset[];
const scene = (id: string, sceneNumber: number, duration: number): Scene => ({ _id: id, projectId: 'project', storyboardId: 'board', sceneNumber, title: id, narration: 'Sunlight reaches a panel. The panel produces electricity.', duration, narrationOptional: true, visualAssetIds: ['v'], motionGraphics: [{ type: 'kinetic-title', properties: { text: id, layout: 'key-points' } }], transition: { type: 'fade', duration: .5 } } as Scene);

test('saved clip edits drive preview and export with trim, crop, sound and caption controls', () => {
  const edited = scene('edited', 1, 10);
  edited.editing = { ...sceneEditingDefaults(edited), heading: 'New heading', clipStart: 2, clipEnd: 8, fitClipToScene: false, clipSpeed: 2, visualFit: 'contain', cropX: 20, cropY: 80, originalAudioMuted: false, originalVolume: .4, narrationVolume: .7, captionText: 'Custom caption', captionSize: 60, captionPosition: 'top', captionColor: '#ffcc00' };
  const rendered = buildVideoPreview(project, [edited], [{ ...videos[0], duration: 12 }]).scenes[0];
  assert.equal(rendered.title, 'New heading'); assert.equal(rendered.clipStart, 48); assert.equal(rendered.clipEnd, 192);
  assert.equal(rendered.videoPlaybackRate, 2); assert.equal(rendered.clipHoldFrame, 71);
  assert.equal(rendered.fit, 'contain'); assert.equal(rendered.cropX, 20); assert.equal(rendered.cropY, 80);
  assert.equal(rendered.originalAudioMuted, false); assert.equal(rendered.originalVolume, .4); assert.equal(rendered.narrationVolume, .7);
  assert.equal(rendered.subtitles[0].text, 'Custom caption'); assert.equal(rendered.captionStyle?.captionPosition, 'top');
  assert.equal(rendered.captionStyle?.captionSize, 60); assert.equal(rendered.captionStyle?.captionColor, '#ffcc00');
  edited.editing.fitClipToScene = true;
  assert.equal(buildVideoPreview(project, [edited], [{ ...videos[0], duration: 12 }]).scenes[0].videoPlaybackRate, .6);
  edited.editing.clipEnd = 13;
  assert.throws(() => buildVideoPreview(project, [edited], [{ ...videos[0], duration: 12 }]), /invalid clip trim/);
  edited.editing.clipEnd = 2.001;
  assert.throws(() => buildVideoPreview(project, [edited], [{ ...videos[0], duration: 12 }]), /at least one frame/);
});

test('saved Remotion edits take precedence over retained clips and preserve caption visibility', () => {
  const edited = scene('edited', 1, 10);
  edited.motionGraphics = [{ type: 'remotion-explainer', properties: { points: ['Old'], layout: 'concept' } }];
  edited.editing = { ...sceneEditingDefaults(edited), heading: 'Edited title', points: ['Updated'], background: '#123456', animationSpeed: 1.5, captionsEnabled: false, captionText: 'Hidden' };
  let rendered = buildVideoPreview(project, [edited], videos).scenes[0];
  assert.equal(rendered.explainer?.background, '#123456'); assert.equal(rendered.explainer?.animationSpeed, 1.5);
  assert.deepEqual(rendered.explainer?.points, ['Updated']); assert.equal(rendered.subtitles.length, 0);
  edited.editing.visualMode = 'clip';
  rendered = buildVideoPreview(project, [edited], videos).scenes[0];
  assert.equal(rendered.explainer, undefined); assert(rendered.visualUrl);
});

test('Remotion explainers render ten-second scenes without a footage asset', () => {
  const animated = { ...scene('explainer', 1, 10), visualAssetIds: [], motionGraphics: [{ type: 'remotion-explainer', properties: { layout: 'steps' as const, points: ['Sunlight arrives.', 'Electricity flows.'] } }] };
  const preview = buildVideoPreview(project, [animated], []);
  assert.equal(preview.durationInFrames, 240);
  assert.deepEqual(preview.scenes[0].explainer?.points, ['Sunlight arrives.', 'Electricity flows.']);
  assert.equal(preview.scenes[0].visualUrl, undefined);
});

test('video preview orders scenes, allocates complete frames and maps aspect ratios', () => {
  const result = buildVideoPreview(project, [scene('second', 2, 1.1), scene('first', 1, 2.2)], videos);
  assert.deepEqual(result.scenes.map(item => [item.id, item.from, item.durationInFrames]), [['first', 0, 53], ['second', 53, 27]]);
  assert.equal(result.durationInFrames, 80); assert.equal(result.width, 1920); assert.equal(result.height, 1080);
  const portrait = buildVideoPreview({ ...project, settings: { ...project.settings, aspectRatio: '9:16' } }, [scene('one', 1, 2)], videos);
  assert.equal(portrait.width, 1080); assert.equal(portrait.height, 1920);
});
test('video preview uses the scene length and never repeats a clip', () => {
  const narrated = { ...scene('one', 1, 2), narrationOptional: false, voiceAssetId: 'audio' };
  const audio = { _id: 'audio', type: 'audio', duration: 2 } as MediaAsset;
  assert.throws(() => buildVideoPreview(project, [narrated], videos), /needs a visual/);
  assert.equal(buildVideoPreview(project, [narrated], [...videos, audio]).scenes[0].audioUrl, '/api/v1/media/audio/content');
  assert.throws(() => buildVideoPreview(project, [narrated], [...videos, { ...audio, duration: 3 }]), /needs a visual/);
  // A clip longer than the scene also plays once and is trimmed by the scene boundary.
  const longClip = buildVideoPreview(project, [{ ...narrated, narrationOptional: true }], [{ ...(videos[0] as MediaAsset), duration: 4 }, audio]);
  assert.equal(longClip.scenes[0].durationInFrames, 48);
  assert.equal(longClip.scenes[0].videoPlaybackRate, 2, 'one clip is fitted to the timeline without looping');
  assert.equal(buildVideoPreview(project, [{ ...narrated, narrationOptional: true }], [...videos, audio]).scenes[0].audioUrl, undefined);
  assert.throws(() => buildVideoPreview(project, [{ ...narrated, storyboardId: 'old' }], [...videos, audio]), /scene plan changed/);
  assert.throws(() => buildVideoPreview(project, [scene('one', 1, 601)], videos), /600 seconds/);
});
