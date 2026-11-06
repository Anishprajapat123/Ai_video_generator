import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSpokenText } from '../src/modules/providers/spoken-text.js';

test('speech preparation expands explicit acronyms without changing names, numbers or words containing them', () => {
  assert.equal(prepareSpokenText('AI uses a GPU and an API. Export MP4 at 3.5 Mbps.'), 'A I uses a G P U and an A P I. Export M P four at 3.5 Mbps.');
  assert.equal(prepareSpokenText('RAIL, OpenAI, api, API_client and APIs stay intact.'), 'RAIL, OpenAI, api, API_client and APIs stay intact.');
});
test('Hindi narration receives Hindi letter names while original source stays unchanged', () => {
  const source='AI और CPU की मदद से PDF पढ़ें।';
  assert.equal(prepareSpokenText(source,'hi-IN'),'ए आई और सी पी यू की मदद से पी डी एफ पढ़ें।');
  assert.equal(source,'AI और CPU की मदद से PDF पढ़ें।');
});
test('speech preparation preserves paragraph pauses and strips supported formatting only', () => {
  assert.equal(prepareSpokenText('# **Solar energy**\n\n- Read the [PDF](https://example.com/source)\n- Use `3.5` volts.'),'Solar energy.\n\nRead the P D F. Use 3.5 volts.');
  assert.equal(prepareSpokenText('पहला विचार\n\nदूसरा विचार','hi'),'पहला विचार।\n\nदूसरा विचार');
  assert.equal(prepareSpokenText('   '),'');
  assert.equal(prepareSpokenText('A sentence.\n\nAnother?'),'A sentence.\n\nAnother?');
});
