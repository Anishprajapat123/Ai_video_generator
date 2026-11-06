'use client';

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { sampleVisualMotion, type GenerativeVisualElement, type GenerativeVisualPlan } from '@ai-video-studio/shared-types';

function Element({ element: item, seconds, duration, speed, originalAccent, originalTextColor, originalBackground, background, accent, textColor }: { element: GenerativeVisualElement; seconds: number; duration: number; speed: number; originalAccent: string; originalTextColor: string; originalBackground: string; background: string; accent: string; textColor: string }) {
  const start = item.start || 0;
  const end = item.end ?? duration;
  if (seconds < start || seconds >= end) return null;
  const local = (seconds - start) * speed;
  const pose = sampleVisualMotion(item.keyframes, start * 1000 + local * 1000);
  const enter = item.keyframes?.length ? 1 : Math.min(1, local / .45);
  const progress = Math.min(1, local / Math.max(.1, end - start));
  const flow = item.motion === 'flow' ? local % 1.5 / 1.5 : progress;
  const dx = (item.moveX || 0) * flow;
  const dy = (item.moveY || 0) * flow + (item.motion === 'float' ? Math.sin(local * 2) * 6 : 0);
  const pulse = item.motion === 'pulse' ? 1 + Math.sin(local * 3) * .035 : 1;
  const themeColor = (value?: string) => value === originalAccent ? accent : value === originalTextColor ? textColor : value === originalBackground ? background : value;
  const fill = themeColor(item.fill);
  const draw = item.kind === 'path' && item.motion === 'draw';
  const stroke = themeColor(item.stroke);
  return <g opacity={enter * pose.opacity / 100} transform={`translate(${item.x + dx + pose.x} ${item.y + dy + pose.y}) rotate(${(item.rotation || 0) + pose.rotation} ${(item.width || 0) / 2} ${(item.height || 0) / 2}) translate(${(item.width || 0) / 2} ${(item.height || 0) / 2}) scale(${pulse * pose.scalePercent / 100}) translate(${-(item.width || 0) / 2} ${-(item.height || 0) / 2})`}>
    {item.kind === 'rect' && <rect width={item.width} height={item.height} rx={8} fill={fill} stroke={stroke} strokeWidth={item.strokeWidth || 0} />}
    {item.kind === 'ellipse' && <ellipse cx={(item.width || 0) / 2} cy={(item.height || 0) / 2} rx={(item.width || 0) / 2} ry={(item.height || 0) / 2} fill={fill} stroke={stroke} strokeWidth={item.strokeWidth || 0} />}
    {item.kind === 'path' && <path d={item.path} fill={fill} stroke={stroke} strokeWidth={item.strokeWidth || 0} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={draw ? 1 : undefined} strokeDashoffset={draw ? 1 - enter : undefined} />}
    {item.kind === 'text' && <text y={item.fontSize || 28} fill={fill} fontSize={item.fontSize || 28} fontFamily="Arial, sans-serif" fontWeight={600}>{item.text}</text>}
  </g>;
}

export function GenerativeVisual({ plan, title, background, textColor, accent, animationSpeed = 1 }: { plan: GenerativeVisualPlan; title: string; background: string; textColor: string; accent: string; animationSpeed?: number }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const duration = durationInFrames / fps;
  // Speed affects motion, while start/end windows remain anchored to narration seconds.
  const seconds = frame / fps;
  const heading = interpolate(frame, [0, Math.round(fps * .4)], [0, 1], { extrapolateRight: 'clamp' });
  const camera = sampleVisualMotion(plan.camera, seconds * animationSpeed * 1000);
  return <AbsoluteFill style={{ background, color: textColor, overflow: 'hidden' }}>
    <svg width="100%" height="100%" viewBox={`0 0 ${plan.width} ${plan.height}`} role="img" aria-label={plan.description}>
      <g opacity={camera.opacity / 100} transform={`translate(${plan.width / 2} ${plan.height / 2}) rotate(${camera.rotation}) scale(${camera.scalePercent / 100}) translate(${-plan.width / 2 - camera.x} ${-plan.height / 2 - camera.y})`}>
        {plan.elements.map(element => {
          const group = plan.groups?.find(item => item.id === element.groupId);
          const pose = sampleVisualMotion(group?.keyframes, seconds * animationSpeed * 1000);
          return <g key={element.id} data-motion-group={group?.id} opacity={pose.opacity / 100} transform={group ? `translate(${pose.x} ${pose.y}) translate(${group.pivotX} ${group.pivotY}) rotate(${pose.rotation}) scale(${pose.scalePercent / 100}) translate(${-group.pivotX} ${-group.pivotY})` : undefined}>
            <Element element={element} seconds={seconds} duration={duration} speed={animationSpeed} originalAccent={plan.accent} originalTextColor={plan.textColor} originalBackground={plan.background} background={background} accent={accent} textColor={textColor} />
          </g>;
        })}
      </g>
    </svg>
    <h2 style={{ position: 'absolute', top: '5%', left: '6%', width: '88%', margin: 0, fontFamily: 'Arial, sans-serif', fontWeight: 600, lineHeight: 1.15, fontSize: (height > width ? 64 : 70) * Math.min(width, height) / 1080, opacity: heading, overflowWrap: 'anywhere' }}>{title}</h2>
  </AbsoluteFill>;
}
