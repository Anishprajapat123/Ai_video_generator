import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneEditingDefaults } from '@ai-video-studio/shared-types';
import { sceneEditingSchema } from '../src/modules/media/scene-editing.js';

test('scene editor validates structured settings, colors, trim points and audio ranges', () => {
  const defaults = sceneEditingDefaults({ title: 'Scene' });
  assert.equal(sceneEditingSchema.safeParse(defaults).success, true);
  for (const changes of [{ clipStart: 4, clipEnd: 2 }, { accent: 'url(evil)' }, { narrationVolume: 2 }, { clipSpeed: 0 }, { cropX: 101 }, { unknown: true }, { diagramLabels: ['One'] }, { heading: '' }]) assert.equal(sceneEditingSchema.safeParse({ ...defaults, ...changes }).success, false, JSON.stringify(changes));
  assert.equal(sceneEditingSchema.safeParse({ ...defaults, clipStart: 2, clipEnd: 8, narrationVolume: 0 }).success, true);
});
