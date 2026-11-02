import { z } from 'zod';

export const sectionSchema = z.object({
  sectionId: z.string().min(1).max(100),
  heading: z.string().trim().min(1).max(300),
  narration: z.string().trim().min(1).max(10000),
  estimatedDuration: z.number().finite().positive().max(600),
  order: z.number().int().positive(),
  visualSuggestion: z.string().max(5000).optional(),
  keyMessage: z.string().max(1000).optional(),
});
export const scriptOutputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  sections: z.array(sectionSchema).min(1).max(50),
}).superRefine((value, ctx) => {
  if (new Set(value.sections.map(s => s.sectionId)).size !== value.sections.length ||
      value.sections.some((s, i) => s.order !== i + 1)) {
    ctx.addIssue({ code: 'custom', message: 'Section IDs must be unique and order must be sequential' });
  }
  if (value.sections.reduce((sum, s) => sum + s.estimatedDuration, 0) > 600) {
    ctx.addIssue({ code: 'custom', message: 'Script exceeds the 600 second project limit' });
  }
});
export const sceneRewriteSchema = z.object({
  narration: z.string().trim().min(1).max(10000).optional(),
  visualDescription: z.string().trim().min(1).max(5000).optional(),
}).refine(v => v.narration !== undefined || v.visualDescription !== undefined, 'Empty scene rewrite');
