import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visualPlanFixture } from './fixtures/visual-plan.js';
import { visualPlanSchema } from '../src/modules/providers/visual-plan.schema.js';
import { GeminiProvider } from '../src/modules/providers/adapters/gemini.adapter.js';
import { env } from '../src/config/env.js';
import { defaultVisualPose } from '@ai-video-studio/shared-types';

test('motion plans reject invalid groups, duplicate times and unsafe transforms', () => {
  const frame = { ...defaultVisualPose, timeMs: 0, easing: 'linear' };
  for (const plan of [{ ...visualPlanFixture, camera: [frame, frame] }, { ...visualPlanFixture, camera: [{ ...frame, scalePercent: 0 }] }, { ...visualPlanFixture, elements: visualPlanFixture.elements.map(element => ({ ...element, groupId: 'missing' })) }]) assert.equal(visualPlanSchema.safeParse(plan).success, false);
  assert(visualPlanSchema.safeParse({ ...visualPlanFixture, camera: [frame, { ...frame, timeMs: 10000, scalePercent: 106 }], groups: [{ id: 'water', pivotX: 800, pivotY: 450, keyframes: [frame] }], elements: visualPlanFixture.elements.map(element => ({ ...element, groupId: 'water' })) }).success);
});

test('custom visual designs reject executable markup, duplicate IDs and incomplete shapes', () => {
  assert(visualPlanSchema.safeParse(visualPlanFixture).success);
  for (const element of [{ ...visualPlanFixture.elements[1], path: '<svg onload=alert(1)>' }, { ...visualPlanFixture.elements[0], width: undefined }, { ...visualPlanFixture.elements[0], fill: 'url(https://example.test)' }, { ...visualPlanFixture.elements[0], onclick: 'bad' }, { ...visualPlanFixture.elements[0], end: 2, start: 3 }]) assert.equal(visualPlanSchema.safeParse({ ...visualPlanFixture, elements: [element, ...visualPlanFixture.elements.slice(1)] }).success, false);
  assert.equal(visualPlanSchema.safeParse({ ...visualPlanFixture, elements: [...visualPlanFixture.elements, visualPlanFixture.elements[0]] }).success, false);
});

test('Gemini visual planning requests structured artwork and validates its response', async t => {
  const key = env.GEMINI_API_KEY; const model = env.GEMINI_MODEL;
  env.GEMINI_API_KEY = 'test-key'; env.GEMINI_MODEL = 'test-model';
  t.after(() => { env.GEMINI_API_KEY = key; env.GEMINI_MODEL = model; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init.body));
    assert.match(body.systemInstruction.parts[0].text, /ORIGINAL vector artwork/);
    assert(body.generationConfig.responseSchema.properties.elements);
    const fields = body.generationConfig.responseSchema.properties.elements.items;
    assert.equal(fields.properties.width.maximum, 2000, 'bounded integers prevent repeated-digit decoding');
    assert(fields.required.includes('height')); assert(fields.required.includes('path'));
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(visualPlanFixture) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 } }));
  });
  const response = await new GeminiProvider().execute({ userId: 'user', workspaceId: 'workspace', capability: 'llm', input: { task: 'visual-plan', title: 'Water cycle' } });
  assert.deepEqual(response.output, visualPlanFixture); assert.equal(response.usage?.outputTokens, 200); assert.equal(calls, 1);
});
