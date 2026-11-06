import { z } from 'zod';
export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid resource ID');
export const projectSettingsSchema = z.object({
  duration: z.number().finite().positive().max(600).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']).optional(),
  resolution: z.enum(['720p', '1080p', '4k']).optional(),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional(),
  language: z.string().trim().min(2).max(30).optional(),
  style: z.string().trim().min(1).max(100).optional(),
  subtitlesEnabled: z.boolean().optional(), musicEnabled: z.boolean().optional(),
}).strict();
export const sceneUpdateSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  narration: z.string().max(10000).optional(),
  visualDescription: z.string().max(5000).optional(),
  duration: z.number().finite().positive().max(600).optional(),
  transition: z.object({ type: z.enum(['fade', 'slide-left', 'slide-right', 'wipe', 'none']), duration: z.number().finite().min(0).max(10) }).strict().optional(),
  motionGraphics: z.array(z.object({ id: z.string().min(1).max(100), type: z.enum(['kinetic-title']),
    properties: z.object({ text: z.string().max(1000) }).strict(),
    animation: z.object({ type: z.enum(['fade', 'slide', 'none']), duration: z.number().finite().min(0).max(600), delay: z.number().finite().min(0).max(600).optional() }).strict().optional(),
  }).strict()).max(100).optional(),
}).strict().refine(v => Object.keys(v).some(key => key !== 'expectedUpdatedAt'), 'Provide at least one scene change');
