import { z } from 'zod';

const color = z.string().regex(/^(#[a-fA-F0-9]{6}|none)$/);
export const visualKeyframeSchema = z.object({
  timeMs: z.number().int().min(0).max(600000),
  x: z.number().finite().min(-2000).max(2000), y: z.number().finite().min(-2000).max(2000),
  scalePercent: z.number().finite().min(20).max(400), rotation: z.number().finite().min(-360).max(360),
  opacity: z.number().finite().min(0).max(100), easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']),
}).strict();
const track = z.array(visualKeyframeSchema).max(12).refine(frames => frames.every((frame, index) => index === 0 || frame.timeMs > frames[index - 1].timeMs), 'Keyframe times must be unique and increasing');
const group = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/), pivotX: z.number().finite().min(-2000).max(2000), pivotY: z.number().finite().min(-2000).max(2000), keyframes: track }).strict();
export const visualElementSchema = z.object({
  groupId: z.string().regex(/^[a-zA-Z0-9_-]{0,60}$/).optional(), keyframes: track.optional(),
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/), kind: z.enum(['rect', 'ellipse', 'path', 'text']),
  x: z.number().finite().min(-2000).max(2000), y: z.number().finite().min(-2000).max(2000),
  width: z.number().finite().positive().max(2000).optional(), height: z.number().finite().positive().max(2000).optional(),
  fill: color, stroke: color.optional(), strokeWidth: z.number().finite().min(0).max(20).optional(),
  path: z.string().max(12000).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-\seE]*$/).optional(),
  text: z.string().max(100).optional(), fontSize: z.number().finite().min(16).max(80).optional(),
  rotation: z.number().finite().min(-360).max(360).optional(),
  start: z.number().finite().min(0).max(600).optional(), end: z.number().finite().positive().max(600).optional(),
  motion: z.enum(['still', 'draw', 'float', 'pulse', 'flow']).optional(),
  moveX: z.number().finite().min(-1000).max(1000).optional(), moveY: z.number().finite().min(-1000).max(1000).optional(),
}).strict().superRefine((element, ctx) => {
  if (['rect', 'ellipse'].includes(element.kind) && (!element.width || !element.height)) ctx.addIssue({ code: 'custom', path: ['width'], message: 'Shapes need width and height' });
  if (element.kind === 'text' && !element.text?.trim()) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Text must not be empty' });
  if (element.kind === 'path' && !/^\s*[Mm]/.test(element.path || '')) ctx.addIssue({ code: 'custom', path: ['path'], message: 'Paths must begin with a move command' });
  if (element.end !== undefined && element.end <= (element.start || 0)) ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must follow start' });
});
export const visualPlanSchema = z.object({
  groups: z.array(group).max(12).optional(), camera: track.optional(),
  version: z.literal(1), width: z.number().int().min(500).max(2000), height: z.number().int().min(500).max(2000),
  background: z.string().regex(/^#[a-fA-F0-9]{6}$/), accent: z.string().regex(/^#[a-fA-F0-9]{6}$/), textColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  description: z.string().trim().min(1).max(1500), elements: z.array(visualElementSchema).min(6).max(70),
}).strict().superRefine((plan, ctx) => {
  const groupIds = new Set(plan.groups?.map(item => item.id));
  if (groupIds.size !== (plan.groups?.length || 0)) ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Group IDs must be unique' });
  if (plan.elements.some(element => element.groupId && !groupIds.has(element.groupId))) ctx.addIssue({ code: 'custom', path: ['elements'], message: 'An object refers to a missing group' });
  if (new Set(plan.elements.map(element => element.id)).size !== plan.elements.length) ctx.addIssue({ code: 'custom', path: ['elements'], message: 'Element IDs must be unique' });
  if (!plan.elements.some(element => element.kind === 'path' || element.kind === 'ellipse')) ctx.addIssue({ code: 'custom', path: ['elements'], message: 'Include custom illustration geometry' });
});

// Gemini's structured-output schema describes the same data without executable markup.
const integer = (minimum: number, maximum: number) => ({ type: 'INTEGER', minimum, maximum });
const frameFields = ['timeMs', 'x', 'y', 'scalePercent', 'rotation', 'opacity', 'easing'];
const responseTrack = { type: 'ARRAY', items: { type: 'OBJECT', required: frameFields, propertyOrdering: frameFields, properties: {
  timeMs: integer(0, 600000), x: integer(-2000, 2000), y: integer(-2000, 2000), scalePercent: integer(20, 400), rotation: integer(-360, 360), opacity: integer(0, 100), easing: { type: 'STRING', enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] },
} } };
const elementFields = ['id', 'kind', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'path', 'text', 'fontSize', 'rotation', 'start', 'end', 'motion', 'moveX', 'moveY', 'groupId', 'keyframes'];
export const visualPlanResponseSchema = {
  type: 'OBJECT', required: ['version', 'width', 'height', 'background', 'accent', 'textColor', 'description', 'elements', 'groups', 'camera'],
  properties: {
    camera: responseTrack,
    groups: { type: 'ARRAY', items: { type: 'OBJECT', required: ['id', 'pivotX', 'pivotY', 'keyframes'], properties: { id: { type: 'STRING' }, pivotX: integer(-2000, 2000), pivotY: integer(-2000, 2000), keyframes: responseTrack } } },
    version: integer(1, 1), width: integer(500, 2000), height: integer(500, 2000),
    background: { type: 'STRING' }, accent: { type: 'STRING' }, textColor: { type: 'STRING' }, description: { type: 'STRING' },
    elements: { type: 'ARRAY', items: { type: 'OBJECT', required: elementFields, propertyOrdering: elementFields, properties: {
      groupId: { type: 'STRING' }, keyframes: responseTrack,
      id: { type: 'STRING' }, kind: { type: 'STRING', enum: ['rect', 'ellipse', 'path', 'text'] },
      x: integer(-2000, 2000), y: integer(-2000, 2000), width: integer(1, 2000), height: integer(1, 2000),
      fill: { type: 'STRING' }, stroke: { type: 'STRING' }, strokeWidth: integer(0, 20), path: { type: 'STRING' }, text: { type: 'STRING' }, fontSize: integer(16, 80), rotation: integer(-360, 360),
      start: integer(0, 600), end: integer(1, 600), motion: { type: 'STRING', enum: ['still', 'draw', 'float', 'pulse', 'flow'] }, moveX: integer(-1000, 1000), moveY: integer(-1000, 1000),
    } } },
  },
};

export const visualPlanInstruction = `You are a scientific illustrator and motion designer. Design ORIGINAL vector artwork for this exact scene's narration. Return only the specified JSON scene graph. Build recognizable topic-specific objects from custom SVG paths, ellipses and rectangles: landscapes, mechanisms, organisms, molecules, machines, maps or other relevant diagrams. Never return generic bullet cards, a stock template, unrelated solar imagery, invented statistics, external URLs, code or SVG markup. Explain the actual mechanism visually with meaningful motion and arrows.
Use keyframes for purposeful staged movement. Each keyframe has timeMs (milliseconds from scene start), x/y OFFSETS, scalePercent (100=normal), rotation (degrees), opacity (0-100), and easing (linear/ease-in/ease-out/ease-in-out). Times must increase, stay inside scene duration, and each track has at most 12 frames. Use empty keyframes arrays for static objects. Use groups to move related objects together: group has id, pivotX/pivotY in canvas coordinates and keyframes; each object's groupId is that id or empty string. Preserve object coordinates when grouping. Use at most 12 groups. Camera keyframes pan the view by x/y (positive pan moves artwork left/up), zoom around canvas center and rotate; heading/captions stay fixed. Keep camera subtle (100-110 percent), keep labels visible, and use [] when camera motion would harm clarity. Return groups and camera arrays even if empty. Do not combine large procedural movement with keyframes on the same object. Prefer ease-in-out for transitions and linear for constant flow.
Aim for a polished editorial illustration: balanced centered composition, layered geometry, a restrained palette, readable labels of at most five words, and meaningful visual detail. Avoid large empty areas, paragraph captions, decorative slide cards or repeating the narration as text. Heading and subtitles are rendered separately. Keep structural objects anchored; apply flow only to small particles, arrows or highlights over a static base, never translate an entire waterfall, pipe, building or landscape to imply flow.
Use the supplied canvas width/height exactly. Reserve top 15% for the separately rendered heading and bottom 18% for captions. Keep artwork inside the remaining area with margins of 6%. At least 6 and at most 45 elements; aim for 12-28 carefully composed elements. Keep paths compact (at most 1200 characters each) and round coordinates to integers. Array order is back to front. Each element x/y is its TOP-LEFT origin; path coordinates are relative to that origin; ellipse width/height are full diameters. Text x/y is its top-left; max 100 characters, split long labels into separate text elements. Font sizes 20-48; use readable contrast, prevent overlapping labels, and match the supplied language. Reuse sharedPalette if provided so the project stays visually consistent.
EVERY element MUST include all schema fields, even when irrelevant. Use these defaults for unused fields: width=1, height=1, stroke=none, strokeWidth=0, path=empty string, text=empty string, fontSize=28, rotation=0, start=0, end=scene duration, motion=still, moveX=0, moveY=0. For rect and ellipse supply their actual width AND height. For path supply an actual SVG d string starting M, using ONLY M L H V C S Q T A Z commands and numbers, no markup. For text supply text and fontSize. Colors are six-digit hex or none; background/accent/textColor must be hex. Unique alphanumeric/underscore/hyphen IDs. StrokeWidth 0-20, rotation -360..360. Start/end are whole SECONDS within scene duration; end must follow start. At least one object should animate: motion draw (paths reveal), float/pulse (subtle continuous motion), flow (particles moving repeatedly by moveX/moveY) or still. moveX/moveY also set one-time travel for still/draw. Use restrained, coordinated timing. Version is 1. Description briefly explains what the scene depicts. Preserve scientific accuracy. Do not repeat the heading in the illustration.`;
