import type { MediaAsset, Scene } from './api';

export function preferredNarrationVoice(voices: { id: string; language?: string }[], language: string) {
  const hindi = /^hi(?:[-_]|$)/i.test(language);
  const preferred = hindi ? ['piper-priyamvada', 'piper-pratham'] : ['piper-english'];
  return preferred.find(id => voices.some(voice => voice.id === id)) || voices.find(voice => voice.language === (hindi ? 'hi' : language))?.id || voices[0]?.id || '';
}

export function sceneMedia(scene: Scene, assets: MediaAsset[]) {
  const visual = assets.find(asset => asset.type === 'video' && scene.visualAssetIds?.includes(asset._id));
  const audio = assets.find(asset => asset._id === scene.voiceAssetId);
  const explainer = scene.motionGraphics?.find(item => item.type === 'remotion-explainer' && Array.isArray(item.properties.points) && item.properties.points.length > 0);
  // Stored tracks can predate a scene edit; only matching audio is ready for export.
  const timing = Boolean(scene.narrationOptional || (audio?.duration && Math.abs(audio.duration - scene.duration) <= 0.05));
  const selectedExplainer = scene.editing?.visualMode === 'clip' ? undefined : explainer;
  const hasVisual = Boolean(selectedExplainer || (scene.editing?.visualMode !== 'remotion' && visual));
  const ready = hasVisual && timing;
  return { visual, audio, explainer: selectedExplainer, timing, ready, hasVisual };
}

// One scene plays one clip once for exactly the planned duration. Narration is fitted to the same length.
export function sceneDuration(scene: Scene, _assets?: MediaAsset[]) {
  return scene.duration;
}
export const mediaUrl = (asset: MediaAsset) => '/api/v1/media/' + asset._id + '/content';
