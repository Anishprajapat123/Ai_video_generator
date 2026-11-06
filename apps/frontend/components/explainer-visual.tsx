'use client';

import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SolarExplainer } from './solar-explainer';
import type { GenerativeVisualPlan } from '@ai-video-studio/shared-types';
import { GenerativeVisual } from './generative-visual';

export type ExplainerVisualProps = { title: string; points: string[]; layout: 'concept' | 'steps' | 'comparison'; illustration?: 'sunlight' | 'panel' | 'home'; background?: string; accent?: string; textColor?: string; animationSpeed?: number; diagramLabels?: string[]; visualPlan?: GenerativeVisualPlan };

export function ExplainerVisual({ title, points, layout, illustration, background = '#101d2e', accent = '#8ee0ca', textColor = '#ffffff', animationSpeed = 1, diagramLabels, visualPlan }: ExplainerVisualProps) {
  const frame = useCurrentFrame() * animationSpeed;
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;
  const portrait = height > width;
  const items = points.slice(0, layout === 'comparison' ? 2 : 3);
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  const titleEnter = spring({ frame, fps, config: { damping: 20 } });
  if (visualPlan) return <GenerativeVisual plan={visualPlan} title={title} background={background} accent={accent} textColor={textColor} animationSpeed={animationSpeed} />;
  if (illustration) return <SolarExplainer title={title} stage={illustration} background={background} accent={accent} textColor={textColor} animationSpeed={animationSpeed} diagramLabels={diagramLabels} />;
  return <AbsoluteFill style={{ background, color: textColor, fontFamily: 'Arial, sans-serif', padding: 70 * scale, paddingBottom: 230 * scale, overflow: 'hidden' }}>
    <div style={{ position: 'absolute', width: width * .7, height: width * .7, borderRadius: '50%', border: `2px solid ${accent}33`, right: -width * .35, top: -width * .2, transform: `rotate(${frame / fps * 10}deg)`, boxShadow: `0 0 160px ${accent}22` }} />
    <div style={{ fontSize: 20 * scale, letterSpacing: '.2em', color: accent, marginBottom: 24 * scale }}>EXPLAINED</div>
    <h2 style={{ margin: 0, fontSize: (portrait ? 64 : 70) * scale, lineHeight: 1.15, maxWidth: '95%', opacity: titleEnter, transform: `translateY(${(1 - titleEnter) * 24 * scale}px)`, overflowWrap: 'anywhere' }}>{title}</h2>
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: portrait || layout === 'steps' ? 'column' : 'row', alignItems: 'stretch', justifyContent: 'center', gap: 24 * scale, marginTop: 50 * scale }}>
      {items.map((point, index) => {
        const enter = spring({ frame: frame - Math.round(fps * (.6 + index * .65)), fps, config: { damping: 18, stiffness: 110 } });
        const active = progress >= (index + .25) / Math.max(1, items.length);
        return <div key={index} style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: layout === 'concept' && !portrait ? 'column' : 'row', alignItems: 'center', gap: 22 * scale, background: active ? accent + '38' : '#ffffff10', border: `1px solid ${accent}60`, borderRadius: (layout === 'concept' ? 36 : 20) * scale, padding: 26 * scale, opacity: enter, transform: `translateY(${(1 - enter) * 42 * scale}px) scale(${.94 + .06 * enter})` }}>
          <span style={{ width: 54 * scale, height: 54 * scale, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: accent, color: background, fontSize: 26 * scale, fontWeight: 700 }}>{index + 1}</span>
          <div style={{ fontSize: (portrait ? 31 : layout === 'steps' ? 34 : 31) * scale, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{point}</div>
          {index < items.length - 1 && layout !== 'comparison' && <span style={{ position: 'absolute', color: accent, fontSize: 26 * scale, ...(portrait || layout === 'steps' ? { bottom: -29 * scale, left: '48%' } : { right: -23 * scale, top: '45%' }) }}>{portrait || layout === 'steps' ? '↓' : '→'}</span>}
        </div>;
      })}
    </div>
    <div style={{ position: 'absolute', left: '6%', right: '6%', bottom: '3%', height: 5 * scale, background: '#ffffff18', borderRadius: 20 }}><div style={{ width: `${progress * 100}%`, height: '100%', background: accent, borderRadius: 20 }} /></div>
  </AbsoluteFill>;
}
