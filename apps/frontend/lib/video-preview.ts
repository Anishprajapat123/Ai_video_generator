import type { MediaAsset, Project, Scene } from './api';
import { mediaUrl, sceneDuration, sceneMedia } from './media';
import { buildSubtitles, type SubtitleCue } from './subtitles';
import { sceneEditingDefaults, visualMotionFitsDuration, type SceneEditing, type GenerativeVisualPlan } from '@ai-video-studio/shared-types';

export type PreviewScene = {
  id: string; title: string; narration: string; from: number; durationInFrames: number;
  visualUrl?: string; visualType?: 'video'; audioUrl?: string;
  videoPlaybackRate?: number;
  clipStart?: number; clipEnd?: number; clipHoldFrame?: number;
  cropX?: number; cropY?: number; originalAudioMuted?: boolean; originalVolume?: number;
  narrationVolume?: number;
  captionStyle?: Pick<SceneEditing, 'captionSize' | 'captionPosition' | 'captionColor' | 'captionBackground'>;
  explainer?: { layout: 'concept' | 'steps' | 'comparison'; points: string[]; illustration?: 'sunlight' | 'panel' | 'home'; background?: string; accent?: string; textColor?: string; animationSpeed?: number; diagramLabels?: string[]; visualPlan?: GenerativeVisualPlan };
  fit: 'cover' | 'contain'; transition: Scene['transition'];
  subtitles: SubtitleCue[];
};
export type VideoPreviewData = { title: string; fps: number; width: number; height: number; durationInFrames: number; scenes: PreviewScene[] };

export function buildVideoPreview(project: Project, scenes: Scene[], assets: MediaAsset[]): VideoPreviewData {
  const fps = project.settings.fps;
  if (![24, 25, 30, 60].includes(fps)) throw new Error('Choose a supported project frame rate.');
  const dimensions: Record<string, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
  const size = dimensions[project.settings.aspectRatio];
  if (!size) throw new Error('Choose a supported project aspect ratio.');
  if (!scenes.length) throw new Error('Add storyboard scenes before previewing.');
  const ids = new Set<string>(); let frame = 0; let seconds = 0;
  const clips = [...scenes].sort((a, b) => a.sceneNumber - b.sceneNumber).map(scene => {
    if (ids.has(scene._id) || scene.projectId !== project._id || scene.storyboardId !== project.storyboardId) throw new Error('The scene plan changed. Reload before previewing.');
    ids.add(scene._id);
    if (!Number.isFinite(scene.duration) || scene.duration <= 0) throw new Error('A scene has an invalid duration.');
    const media = sceneMedia(scene, assets);
    if (!media.ready) throw new Error('Scene ' + scene.sceneNumber + ' needs a visual and narration, or an explicit silent setting.');
    // The scene duration is fixed; the clip plays once and narration is fitted to the same length.
    const duration = sceneDuration(scene, assets);
    const edit = sceneEditingDefaults(scene);
    if (edit.visualPlan && !visualMotionFitsDuration(edit.visualPlan, duration)) throw new Error('Scene ' + scene.sceneNumber + ' keyframes must fit inside its duration');
    const end = edit.clipEnd ?? media.visual?.duration;
    const available = end ? end - edit.clipStart : duration;
    if (!media.explainer && (available <= 0 || (media.visual?.duration && (edit.clipStart >= media.visual.duration || (end && end > media.visual.duration + .01))))) throw new Error('Scene ' + scene.sceneNumber + ' has invalid clip trim points');
    const startFrame = Math.round(edit.clipStart * fps);
    const endFrame = end ? Math.round(end * fps) : undefined;
    const sourceFrames = endFrame === undefined ? Math.round(available * fps) : endFrame - startFrame;
    if (!media.explainer && sourceFrames < 1) throw new Error('Scene ' + scene.sceneNumber + ' trim must include at least one frame');
    const rate = edit.fitClipToScene ? sourceFrames / fps / duration : edit.clipSpeed;
    const captionsEnabled = scene.editing?.captionsEnabled ?? project.settings.subtitlesEnabled !== false;
    const clip: PreviewScene = { id: scene._id, title: edit.heading, narration: scene.narration || '', from: frame,
      durationInFrames: Math.ceil(duration * fps), fit: edit.visualFit, transition: scene.transition,
      subtitles: captionsEnabled && Boolean(edit.captionText || (!scene.narrationOptional && media.audio?.duration))
        ? buildSubtitles(edit.captionText || scene.narration || '', duration, fps) : [],
      captionStyle: edit, cropX: edit.cropX, cropY: edit.cropY, originalAudioMuted: edit.originalAudioMuted, originalVolume: edit.originalVolume, narrationVolume: edit.narrationVolume,
      ...(media.visual ? { visualUrl: mediaUrl(media.visual), visualType: media.visual.type as 'video' } : {}),
      ...(media.visual ? { videoPlaybackRate: rate, clipStart: startFrame, clipEnd: endFrame, clipHoldFrame: Math.max(1, Math.ceil(sourceFrames / rate)) - 1 } : {}),
      ...(media.explainer ? { explainer: { layout: edit.layout, points: edit.points, illustration: edit.illustration === 'none' ? undefined : edit.illustration, background: edit.background, accent: edit.accent, textColor: edit.textColor, animationSpeed: edit.animationSpeed, diagramLabels: edit.diagramLabels, visualPlan: edit.visualPlan } } : {}),
      ...(!scene.narrationOptional && media.audio ? { audioUrl: mediaUrl(media.audio) } : {}),
    };
    frame += clip.durationInFrames; seconds += duration;
    return clip;
  });
  if (seconds > 600) throw new Error('Preview is limited to 600 seconds.');
  return { title: project.title, fps, width: size[0], height: size[1], durationInFrames: frame, scenes: clips };
}
