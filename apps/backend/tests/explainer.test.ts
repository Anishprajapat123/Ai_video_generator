import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainerPlan } from '../src/modules/media/explainer.js';
import { buildPcmWav, readPcmWav } from '../src/modules/providers/audio-wav.js';
import { fitAudioDuration } from '../src/modules/media/audio-fit.js';

test('Remotion plans keep script content and choose a relevant layout without inventing statistics', () => {
  const plan = explainerPlan('How solar panels work', 'Sunlight reaches a panel. Electrons move. Electricity flows.');
  assert.equal(plan.properties.layout, 'steps');
  assert.deepEqual(plan.properties.points, ['Sunlight reaches a panel.', 'Electrons move.', 'Electricity flows.']);
  assert.equal(explainerPlan('Solar versus coal', 'Solar is renewable. Coal is mined.').properties.layout, 'comparison');
  assert.equal(explainerPlan('ऊर्जा', 'सूर्य से ऊर्जा मिलती है। इससे बिजली बनती है।').properties.points.length, 2);
  assert.equal(explainerPlan('Energy from sunlight', 'Light reaches a solar panel.').properties.illustration, 'sunlight');
  assert.equal(explainerPlan('Inside a solar cell', 'Electrons move and create direct current.').properties.illustration, 'panel');
  assert.equal(explainerPlan('Inside the solar cell', 'Current travels toward an inverter for conversion.').properties.illustration, 'panel');
  assert.equal(explainerPlan('Powering your home', 'Solar electricity powers the house.').properties.illustration, 'home');
  assert.equal(explainerPlan('A healthy forest', 'Trees provide shelter.').properties.illustration, undefined);
});

test('real tempo fitting preserves pitch while extending speech to exactly ten seconds', async () => {
  const rate = 24000; const pcm = Buffer.alloc(rate * 2 * 6);
  for (let frame = 0; frame < rate * 6; frame++) pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * frame / rate) * 8000), frame * 2);
  const fitted = await fitAudioDuration(buildPcmWav(pcm, 1, rate), 'audio/wav', 10);
  const result = readPcmWav(fitted.audio);
  assert.equal(fitted.duration, 10); assert.equal(result.pcm.length, rate * 2 * 10);
  let crossings = 0;
  for (let frame = rate; frame < rate * 2; frame++) if (result.pcm.readInt16LE((frame - 1) * 2) <= 0 && result.pcm.readInt16LE(frame * 2) > 0) crossings++;
  assert(Math.abs(crossings - 440) <= 3, 'tempo fitting must not change voice pitch');
});
