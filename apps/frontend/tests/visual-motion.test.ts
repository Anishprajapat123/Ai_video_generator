import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultVisualPose, sampleVisualMotion, visualEase, visualMotionFitsDuration, type VisualKeyframe } from '@ai-video-studio/shared-types';
import { visualPlanFixture } from '../../backend/tests/fixtures/visual-plan';

const start: VisualKeyframe = { ...defaultVisualPose, timeMs: 0, easing: 'linear' };
const end: VisualKeyframe = { ...start, timeMs: 1000, x: 100, y: 60, scalePercent: 150, rotation: 90, opacity: 50 };
test('motion seeks deterministically and clamps outside keyframe boundaries', () => {
  assert.deepEqual(sampleVisualMotion([], 200), defaultVisualPose);
  assert.deepEqual(sampleVisualMotion([start, end], 500), { x: 50, y: 30, scalePercent: 125, rotation: 45, opacity: 75 });
  assert.equal(sampleVisualMotion([start, end], -100).x, 0);
  assert.equal(sampleVisualMotion([start, end], 2000).x, 100);
  const later = sampleVisualMotion([start, end], 750);
  sampleVisualMotion([start, end], 200);
  assert.deepEqual(sampleVisualMotion([start, end], 750), later);
});
test('easing changes movement without changing endpoints or overshooting', () => {
  assert.equal(visualEase(.5, 'ease-in-out'), .5);
  assert(visualEase(.25, 'ease-in') < .25); assert(visualEase(.25, 'ease-out') > .25);
  for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) { assert.equal(visualEase(0, easing), 0); assert.equal(visualEase(1, easing), 1); }
});
test('duration checks include camera, group and individual object tracks', () => {
  assert(visualMotionFitsDuration(visualPlanFixture, 1));
  for (const plan of [{ ...visualPlanFixture, camera: [start, end] }, { ...visualPlanFixture, groups: [{ id: 'group', pivotX: 0, pivotY: 0, keyframes: [start, end] }] }, { ...visualPlanFixture, elements: visualPlanFixture.elements.map(element => ({ ...element, keyframes: [start, end] })) }]) { assert(visualMotionFitsDuration(plan, 1)); assert.equal(visualMotionFitsDuration(plan, .5), false); }
});
