import { z } from 'zod';
import type { ISceneDocument, SceneSnapshot } from '../../database/models/Scene.model.js';
import { visualPlanSchema } from '../providers/visual-plan.schema.js';

const color = z.string().regex(/^#[a-fA-F0-9]{6}$/, 'Use a six-digit hex color');
export const sceneEditingSchema = z.object({
  visualPlan: visualPlanSchema.optional(),
  visualMode: z.enum(['remotion', 'clip']), visualFit: z.enum(['cover', 'contain']), heading: z.string().trim().min(1).max(180),
  points: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  layout: z.enum(['concept', 'steps', 'comparison']), illustration: z.enum(['none', 'sunlight', 'panel', 'home']),
  diagramLabels: z.array(z.string().trim().min(1).max(60)).length(3),
  background: color, accent: color, textColor: color, animationSpeed: z.number().finite().min(.5).max(2),
  clipStart: z.number().finite().min(0), clipEnd: z.number().finite().positive().nullable(),
  clipSpeed: z.number().finite().min(.25).max(4), fitClipToScene: z.boolean(),
  cropX: z.number().finite().min(0).max(100), cropY: z.number().finite().min(0).max(100),
  originalAudioMuted: z.boolean(), originalVolume: z.number().finite().min(0).max(1),
  voiceId: z.string().regex(/^[a-zA-Z0-9_-]{0,100}$/), narrationVolume: z.number().finite().min(0).max(1),
  captionsEnabled: z.boolean(), captionText: z.string().max(10000), captionSize: z.number().finite().min(18).max(80),
  captionPosition: z.enum(['top', 'center', 'bottom']), captionColor: color, captionBackground: color,
}).strict().refine(value => value.clipEnd === null || value.clipEnd > value.clipStart, { path: ['clipEnd'], message: 'Clip end must follow clip start' });

export function snapshotScene(scene: ISceneDocument): SceneSnapshot {
  return {
    title: scene.title, narration: scene.narration, visualDescription: scene.visualDescription,
    visualAssetIds: [...scene.visualAssetIds], voiceAssetId: scene.voiceAssetId,
    narrationOptional: scene.narrationOptional, visualFit: scene.visualFit,
    motionGraphics: structuredClone(scene.toObject().motionGraphics || []),
    editing: structuredClone(scene.editing || {}),
  };
}
