import type { VisualKeyframe, VisualEasing, GenerativeVisualPlan } from './generative-visual.js';

export const defaultVisualPose: Omit<VisualKeyframe, 'timeMs' | 'easing'> = { x: 0, y: 0, scalePercent: 100, rotation: 0, opacity: 100 };
export function visualEase(progress: number, easing: VisualEasing) {
  const t = Math.max(0, Math.min(1, progress));
  if (easing === 'ease-in') return t * t * t;
  if (easing === 'ease-out') return 1 - (1 - t) ** 3;
  if (easing === 'ease-in-out') return t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return t;
}
/** Frame-derived sampling is identical during browser preview, seeking and MP4 rendering. */
export function sampleVisualMotion(frames: VisualKeyframe[] | undefined, timeMs: number): typeof defaultVisualPose {
  if (!frames?.length) return { ...defaultVisualPose };
  const pose = (frame: VisualKeyframe) => ({ x: frame.x, y: frame.y, scalePercent: frame.scalePercent, rotation: frame.rotation, opacity: frame.opacity });
  if (timeMs <= frames[0].timeMs) return pose(frames[0]);
  const last = frames[frames.length - 1];
  if (timeMs >= last.timeMs) return pose(last);
  const right = frames.findIndex(frame => frame.timeMs > timeMs);
  const before = frames[right - 1]; const after = frames[right];
  const t = visualEase((timeMs - before.timeMs) / (after.timeMs - before.timeMs), after.easing);
  return { x: before.x + (after.x - before.x) * t, y: before.y + (after.y - before.y) * t,
    scalePercent: before.scalePercent + (after.scalePercent - before.scalePercent) * t,
    rotation: before.rotation + (after.rotation - before.rotation) * t,
    opacity: before.opacity + (after.opacity - before.opacity) * t };
}

export function visualMotionFitsDuration(plan: GenerativeVisualPlan, seconds: number) {
  return [plan.camera || [], ...(plan.groups || []).map(group => group.keyframes), ...plan.elements.map(element => element.keyframes || [])].every(track => track.every(frame => frame.timeMs <= Math.round(seconds * 1000)));
}
