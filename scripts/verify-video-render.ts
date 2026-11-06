import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { getVideoMetadata } from '@remotion/renderer';
import { pcmToWav } from '../apps/backend/src/modules/providers/adapters/elevenlabs.adapter';
import { runLocalFfmpeg } from '../apps/backend/src/modules/media/audio-fit';
import { visualPlanFixture } from '../apps/backend/tests/fixtures/visual-plan';
import { defaultVisualPose, type GenerativeVisualPlan, type VisualKeyframe } from '@ai-video-studio/shared-types';

async function main() {
  const folder = path.resolve('storage/verification/video-regression');
  await mkdir(folder, { recursive: true });
  const key = randomUUID();
  const pcm = Buffer.alloc(22050 * 2 * 2);
  for (let sample = 0; sample < pcm.length / 2; sample++) pcm.writeInt16LE(Math.round(Math.sin(sample / 22050 * Math.PI * 2 * 440) * 6000), sample * 2);
  const wav = pcmToWav(pcm).audio;
  await writeFile(path.join(folder, key), wav);
  const project = { _id: 'verification', storyboardId: 'board', title: 'Automated render check', settings: { fps: 30, aspectRatio: '16:9' } };
  const first: VisualKeyframe = { ...defaultVisualPose, timeMs: 0, easing: 'linear' };
  const last: VisualKeyframe = { ...first, timeMs: 2000, easing: 'ease-in-out' };
  const motionPlan: GenerativeVisualPlan = { ...visualPlanFixture, camera: [first, { ...last, scalePercent: 106 }], groups: [{ id: 'cloud-group', pivotX: 450, pivotY: 260, keyframes: [first, { ...last, x: 60, rotation: 5 }] }], elements: visualPlanFixture.elements.map(element => element.id === 'cloud' ? { ...element, groupId: 'cloud-group' } : element.id === 'label' ? { ...element, keyframes: [{ ...first, opacity: 0 }, { ...last, opacity: 100 }] } : element) };
  const scene = { _id: 'custom', projectId: project._id, storyboardId: 'board', sceneNumber: 1, title: 'Custom vector artwork', narration: 'Local audio verification', duration: 2, narrationOptional: false, voiceAssetId: 'voice', visualAssetIds: [], transition: { type: 'none', duration: 0 }, motionGraphics: [{ type: 'remotion-explainer', properties: { points: ['Generated geometry'], visualPlan: motionPlan } }], editing: { captionText: 'Saved caption', captionPosition: 'top', captionColor: '#ffcc00' } };
  const assets: Record<string, unknown>[] = [{ _id: 'voice', type: 'audio', duration: 2, mimeType: 'audio/wav', storageKey: key }];
  async function render(scenes: unknown[]) {
    await writeFile(path.join(folder, 'input.json'), JSON.stringify({ project, scenes, assets, mediaDirectory: folder }));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/render-final-video.ts', folder], { windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'] });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Render check exceeded three minutes')); }, 180000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Render check failed')); });
    });
  }
  await render([scene]);
  const source = randomUUID();
  await copyFile(path.join(folder, 'output.mp4'), path.join(folder, source));
  assets.push({ _id: 'clip', type: 'video', duration: 2, mimeType: 'video/mp4', storageKey: source });
  await render([scene, { ...scene, _id: 'trim', sceneNumber: 2, title: 'Trim and hold', voiceAssetId: null, narrationOptional: true, motionGraphics: [], visualAssetIds: ['clip'], editing: { visualMode: 'clip', clipStart: .25, clipEnd: 1.25, fitClipToScene: false, clipSpeed: 1, originalAudioMuted: false, originalVolume: .5 } }]);
  const output = path.join(folder, 'output.mp4');
  const metadata = await getVideoMetadata(output);
  assert(Math.abs((metadata.durationInSeconds || 0) - 4) < .05);
  assert.equal(metadata.width, 1280); assert.equal(metadata.height, 720); assert.equal(metadata.audioCodec, 'aac');
  const audio = await runLocalFfmpeg(['-v', 'error', '-i', output, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1']);
  let offset = 12;
  while (offset + 8 <= audio.length && audio.toString('ascii', offset, offset + 4) !== 'data') offset += 8 + audio.readUInt32LE(offset + 4);
  assert(offset + 8 < audio.length, 'Decoded audio contains PCM samples');
  const samples = audio.subarray(offset + 8);
  function rms(from: number, to: number) {
    let sum = 0; let count = 0;
    for (let i = Math.round(from * 32000); i + 1 < Math.min(samples.length, to * 32000); i += 2) { sum += (samples.readInt16LE(i) / 32768) ** 2; count++; }
    return Math.sqrt(sum / count);
  }
  assert(rms(.2, 1.8) > .01, 'Narration signal is non-silent');
  assert(rms(2.2, 2.8) > .01, 'Trimmed original clip sound plays');
  assert(rms(3.2, 3.8) < .001, 'Held final frame does not repeat clip sound');
  console.log('PASS: Custom vector scene with eased camera/group/object tracks, captions, four-second MP4, narration, clip trim and silent held frame.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
