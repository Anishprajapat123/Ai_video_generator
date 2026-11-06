import type { GenerativeVisualPlan } from './generative-visual.js';

export interface SceneEditing {
  visualPlan?: GenerativeVisualPlan;
  visualMode: 'remotion' | 'clip';
  visualFit: 'cover' | 'contain';
  heading: string;
  points: string[];
  layout: 'concept' | 'steps' | 'comparison';
  illustration: 'none' | 'sunlight' | 'panel' | 'home';
  diagramLabels: string[];
  background: string; accent: string; textColor: string; animationSpeed: number;
  clipStart: number; clipEnd: number | null; clipSpeed: number; fitClipToScene: boolean;
  cropX: number; cropY: number; originalAudioMuted: boolean; originalVolume: number;
  voiceId: string; narrationVolume: number;
  captionsEnabled: boolean; captionText: string; captionSize: number;
  captionPosition: 'top' | 'center' | 'bottom'; captionColor: string; captionBackground: string;
}

export function sceneEditingDefaults(scene: { title: string; visualFit?: 'cover' | 'contain'; editing?: Partial<SceneEditing>; motionGraphics?: { type: string; properties: Record<string, unknown> }[] }): SceneEditing {
  const graphic = scene.motionGraphics?.find(item => item.type === 'remotion-explainer');
  const properties = graphic?.properties || {};
  const solar = ['sunlight', 'panel', 'home'].includes(String(properties.illustration));
  const visualPlan = properties.visualPlan as GenerativeVisualPlan | undefined;
  const hindi = /[\u0900-\u097f]/u.test(scene.title);
  return {
    visualMode: graphic ? 'remotion' : 'clip', visualFit: scene.visualFit || 'cover', heading: scene.title,
    points: Array.isArray(properties.points) ? properties.points.slice(0, 3) as string[] : [scene.title],
    layout: properties.layout === 'steps' || properties.layout === 'comparison' ? properties.layout : 'concept',
    illustration: solar ? properties.illustration as SceneEditing['illustration'] : 'none',
    diagramLabels: hindi ? ['सूरज की रोशनी', 'सौर पैनल', 'घर की बिजली'] : ['Sunlight', 'Solar cells', 'Power for home'],
    background: visualPlan?.background || (solar ? '#f4f3ed' : '#101d2e'), accent: visualPlan?.accent || (solar ? '#4c8f6c' : '#8ee0ca'), textColor: visualPlan?.textColor || (solar ? '#17362f' : '#ffffff'), animationSpeed: 1,
    ...(visualPlan ? { visualPlan } : {}),
    clipStart: 0, clipEnd: null, clipSpeed: 1, fitClipToScene: true, cropX: 50, cropY: 50, originalAudioMuted: true, originalVolume: 1,
    voiceId: '', narrationVolume: 1, captionsEnabled: true, captionText: '', captionSize: 42, captionPosition: 'bottom', captionColor: '#ffffff', captionBackground: '#000000',
    ...scene.editing,
  };
}
