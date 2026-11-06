import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('storage/verification/captions');
await mkdir(folder, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('apps/frontend/render/index.tsx'), outDir: path.join(folder, 'bundle'), publicDir: null });
for (const [name, width, height] of [['landscape', 1280, 720], ['portrait', 720, 1280]]) {
  const video = { title: 'Caption verification', fps: 30, width, height, durationInFrames: 120, scenes: [{ id: 'check', title: 'How waterfalls form', narration: 'A river flows over a cliff.', from: 0, durationInFrames: 120, layout: 'title', fit: 'cover', transition: { type: 'none', duration: 0 }, subtitles: [{ text: 'Water falls over a steep cliff and gathers in the pool below.', startFrame: 0, endFrame: 90 }] }] };
  const composition = await selectComposition({ serveUrl, id: 'StudioVideo', inputProps: { video } });
  const output = path.join(folder, name + '.png');
  await renderStill({ composition, serveUrl, inputProps: { video }, frame: 30, output, imageFormat: 'png' });
  console.log(output);
}
