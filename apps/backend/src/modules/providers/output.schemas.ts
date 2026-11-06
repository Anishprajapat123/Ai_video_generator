import { z } from 'zod';

// Gemini accepts this OpenAPI subset; Zod below enforces all bounds and invariants.
const scriptResponseSchema = {
  type: 'OBJECT',
  required: ['title', 'sections'],
  properties: {
    title: { type: 'STRING' },
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['sectionId', 'heading', 'narration', 'estimatedDuration', 'order', 'visualSuggestion'],
        properties: {
          sectionId: { type: 'STRING', description: 'A unique section identifier.' },
          heading: { type: 'STRING' },
          narration: { type: 'STRING', description: 'Spoken narration, kept within its duration budget (about 2.4 words per second for English, 2 for Indic languages).' },
          estimatedDuration: { type: 'NUMBER', description: 'Positive duration in seconds, not a string. It must fit the narration at the requested speaking pace and section durations must sum to the project total.' },
          order: { type: 'INTEGER', description: 'Sequential position starting at 1, matching array order.' },
          visualSuggestion: { type: 'STRING' },
          keyMessage: { type: 'STRING' },
        },
      },
    },
  },
};

export function geminiResponseSchema(rewrite: boolean, rewriteFields: string[] = ['narration']): Record<string, unknown> {
  if (!rewrite) return scriptResponseSchema;
  return {
    type: 'OBJECT',
    required: rewriteFields.length ? rewriteFields : ['narration'],
    properties: { narration: { type: 'STRING' }, visualDescription: { type: 'STRING' } },
  };
}

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
    ctx.addIssue({ code: 'custom', path: ['sections'], message: 'Section IDs must be unique and order must be sequential' });
  }
  if (value.sections.reduce((sum, s) => sum + s.estimatedDuration, 0) > 600) {
    ctx.addIssue({ code: 'custom', path: ['sections'], message: 'Script exceeds the 600 second project limit' });
  }
});
export const sceneRewriteSchema = z.object({
  narration: z.string().trim().min(1).max(10000).optional(),
  visualDescription: z.string().trim().min(1).max(5000).optional(),
}).refine(v => v.narration !== undefined || v.visualDescription !== undefined, 'Empty scene rewrite');
