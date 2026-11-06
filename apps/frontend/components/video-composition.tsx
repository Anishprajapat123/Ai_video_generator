'use client';

import { AbsoluteFill, Freeze, Html5Audio, Html5Video, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PreviewScene, VideoPreviewData } from '../lib/video-preview';
import { subtitleScale } from '../lib/subtitles';
import { ExplainerVisual } from './explainer-visual';

// Scene titles are animated by Remotion: a spring-in lower third that leaves before the next scene.
function SceneTitle({ title, durationInFrames }: { title: string; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;
  const holdFrames = Math.min(Math.round(fps * 3), Math.round(durationInFrames * .5));
  const exitFrames = Math.max(1, Math.round(fps * .45));
  if (!title.trim() || holdFrames < 8) return null;
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 130, mass: .7 } });
  const exit = interpolate(frame, [holdFrames - exitFrames, holdFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = Math.min(enter, exit);
  const translate = interpolate(enter, [0, 1], [-18 * scale, 0]);
  return <div style={{ position: 'absolute', top: '6%', left: '6%', maxWidth: '76%', display: 'flex', alignItems: 'stretch', gap: 12 * scale, opacity, transform: `translateY(${translate}px)`, pointerEvents: 'none' }}>
    <span style={{ width: 5 * scale, borderRadius: 99, background: '#c8d18f', flexShrink: 0 }} />
    <span style={{ background: 'rgba(16,18,14,.82)', color: '#f7f7ef', padding: `${9 * scale}px ${18 * scale}px`, borderRadius: 8 * scale, fontSize: 34 * scale, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-.01em', overflowWrap: 'anywhere' }}>{title}</span>
  </div>;
}

function VideoScene({ scene }: { scene: PreviewScene }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;
  const transitionFrames = Math.min(Math.round(scene.transition.duration * fps), Math.floor(scene.durationInFrames / 3));
  const progress = interpolate(frame, [0, Math.max(1, transitionFrames)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = scene.transition.type === 'fade'
    ? interpolate(frame, [Math.max(0, scene.durationInFrames - transitionFrames), scene.durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const entrance = scene.transition.type === 'slide-left' ? `translateX(${(1 - progress) * width}px)` : scene.transition.type === 'slide-right' ? `translateX(${-(1 - progress) * width}px)` : undefined;
  const caption = scene.subtitles.find(cue => frame >= cue.startFrame && frame < cue.endFrame);
  const hold = scene.clipHoldFrame !== undefined && frame > scene.clipHoldFrame;
  const position = scene.captionStyle?.captionPosition || 'bottom';
  return <AbsoluteFill style={{ background: '#181d18', overflow: 'hidden', fontFamily: 'Arial, sans-serif' }}>
    <AbsoluteFill style={{ opacity: scene.transition.type === 'fade' ? Math.min(progress, fadeOut) : 1, transform: entrance, clipPath: scene.transition.type === 'wipe' ? `inset(0 ${(1 - progress) * 100}% 0 0)` : undefined }}>
      {scene.explainer ? <ExplainerVisual title={scene.title} {...scene.explainer} /> : scene.visualUrl
        ? <Freeze frame={scene.clipHoldFrame || 0} active={hold}><Html5Video src={scene.visualUrl} trimBefore={scene.clipStart} trimAfter={scene.clipEnd} playbackRate={scene.videoPlaybackRate || 1} muted={(scene.originalAudioMuted ?? true) || hold} volume={scene.originalVolume ?? 1} style={{ width: '100%', height: '100%', objectFit: scene.fit, objectPosition: `${scene.cropX ?? 50}% ${scene.cropY ?? 50}%` }} /></Freeze>
        : <AbsoluteFill style={{ background: 'linear-gradient(135deg, #1f241d 0%, #2d3328 55%, #171b16 100%)' }} />}
    </AbsoluteFill>
    {!scene.explainer && <SceneTitle title={scene.title} durationInFrames={scene.durationInFrames} />}
    {caption && <div data-subtitle style={{ position: 'absolute', ...(position === 'bottom' ? { bottom: '5%' } : { top: position === 'top' ? '5%' : '50%' }), left: '7%', width: '86%', textAlign: 'center', pointerEvents: 'none', transform: `${position === 'center' ? 'translateY(-50%) ' : ''}scale(${subtitleScale((frame - caption.startFrame) / fps, (caption.endFrame - caption.startFrame) / fps)})` }}><span style={{ display: 'inline-block', maxWidth: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: (scene.captionStyle?.captionBackground || '#000000') + 'd6', color: scene.captionStyle?.captionColor || '#fff', padding: `${14 * scale}px ${24 * scale}px`, borderRadius: 12 * scale, fontSize: (scene.captionStyle?.captionSize ?? 42) * scale, lineHeight: 1.35, fontWeight: 600 }}>{caption.text}</span></div>}
    {scene.audioUrl && <Html5Audio src={scene.audioUrl} volume={scene.narrationVolume ?? 1} />}
  </AbsoluteFill>;
}

export function VideoComposition({ video }: { video: VideoPreviewData }) {
  return <AbsoluteFill style={{ background: '#181d18' }}>{video.scenes.map(scene => <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames} name={scene.title}><VideoScene scene={scene} /></Sequence>)}</AbsoluteFill>;
}
