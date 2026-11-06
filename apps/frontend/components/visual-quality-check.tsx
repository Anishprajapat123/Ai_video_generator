'use client';

import { useMemo } from 'react';
import type { GenerativeVisualPlan } from '@ai-video-studio/shared-types';
import { auditVisualPlan } from '../lib/visual-qa';

export function VisualQualityCheck({ plan, duration, speed = 1, onSeek }: { plan: GenerativeVisualPlan; duration: number; speed?: number; onSeek?: (seconds: number) => void }) {
  const warnings = useMemo(() => auditVisualPlan(plan, duration, speed), [plan, duration, speed]);
  return <details className="visual-quality-check" open={warnings.length > 0}>
    <summary>Local visual check · {warnings.length ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'No sampled issues'}</summary>
    <p className="media-hint">Checks scene geometry and sampled motion. Label sizes are estimated; paths, captions, heading placement and visual quality still need preview. No AI requests. Warnings do not block export.</p>
    {warnings.length > 0 && <ul>{warnings.map(warning => <li key={warning.code + warning.elements.join(':')}><span>{warning.message}</span>{onSeek ? <button type="button" className="text-button" onClick={() => onSeek(warning.seconds)}>Inspect {warning.seconds.toFixed(1)}s</button> : <small>{warning.seconds.toFixed(1)}s</small>}</li>)}</ul>}
  </details>;
}
