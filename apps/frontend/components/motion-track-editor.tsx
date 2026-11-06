'use client';

import { defaultVisualPose, sampleVisualMotion, type VisualKeyframe } from '@ai-video-studio/shared-types';

export function MotionTrackEditor({ label, frames = [], duration, timeMs, onChange }: { label: string; frames?: VisualKeyframe[]; duration: number; timeMs: number; onChange: (frames: VisualKeyframe[]) => void }) {
  function add() {
    const at = Math.max(0, Math.min(Math.round(duration * 1000), Math.round(timeMs)));
    const next = { ...sampleVisualMotion(frames, at), timeMs: at, easing: 'ease-in-out' as const };
    const base = frames.length || at === 0 ? frames : [{ ...defaultVisualPose, timeMs: 0, easing: 'linear' as const }];
    onChange([...base.filter(frame => frame.timeMs !== at), next].sort((a, b) => a.timeMs - b.timeMs));
  }
  function update(index: number, change: Partial<VisualKeyframe>) {
    onChange(frames.map((frame, i) => i === index ? { ...frame, ...change } : frame).sort((a, b) => a.timeMs - b.timeMs));
  }
  return <details className="motion-track-editor"><summary>{label} · {frames.length} keyframes</summary>
    <p className="media-hint">Offsets move the object from its saved position. Scale 100% and opacity 100% are normal. Seek in the preview, then add a pose.</p>
    <button type="button" className="secondary-button" disabled={frames.length >= 12} onClick={add}>Add keyframe at {(timeMs / 1000).toFixed(2)}s</button>
    {frames.map((frame, index) => <div className="scene-editor-fields" key={index}>
      <div className="scene-editor-row"><label>Time (seconds)<input type="number" min={0} max={duration} step=".1" value={frame.timeMs / 1000} onChange={event => update(index, { timeMs: Math.round(Number(event.target.value) * 1000) })} /></label>
        {(['x', 'y', 'scalePercent', 'rotation', 'opacity'] as const).map(key => <label key={key}>{({ x: 'X offset', y: 'Y offset', scalePercent: 'Scale (%)', rotation: 'Rotation (°)', opacity: 'Opacity (%)' })[key]}<input type="number" min={key === 'scalePercent' ? 20 : key === 'opacity' ? 0 : key === 'rotation' ? -360 : -2000} max={key === 'scalePercent' ? 400 : key === 'opacity' ? 100 : key === 'rotation' ? 360 : 2000} value={frame[key]} onChange={event => update(index, { [key]: Number(event.target.value) })} /></label>)}
      </div>
      <label>Easing<select value={frame.easing} onChange={event => update(index, { easing: event.target.value as VisualKeyframe['easing'] })}><option value="linear">Linear</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in and out</option></select></label>
      <button type="button" className="text-button danger" onClick={() => onChange(frames.filter((_, i) => i !== index))}>Remove keyframe</button>
    </div>)}
    {frames.length > 0 && <button type="button" className="text-button" onClick={() => onChange([])}>Clear this motion track</button>}
  </details>;
}
