import express from 'express';
import path from 'node:path';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, getVideoMetadata } from '@remotion/renderer';
import { buildVideoPreview } from '../apps/frontend/lib/video-preview';
import { runLocalFfmpeg } from '../apps/backend/src/modules/media/audio-fit';

async function main() {
const folder = path.resolve(process.argv[2]);
const input = JSON.parse(await readFile(path.join(folder, 'input.json'), 'utf8'));
const video = buildVideoPreview(input.project, input.scenes, input.assets);
const dimensions: Record<string, [number, number]> = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:5': [720, 900] };
[video.width, video.height] = dimensions[input.project.settings.aspectRatio];
const token = randomUUID();
const app = express();
app.get('/' + token + '/:id', (req, res) => {
  const asset = input.assets.find((item: { _id: string }) => item._id === req.params.id);
  if (!asset || !/^[a-f0-9-]{36}$/.test(asset.storageKey)) { res.sendStatus(404); return; }
  res.type(asset.mimeType).sendFile(path.join(input.mediaDirectory, asset.storageKey));
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Cannot start local media server');
for (const scene of video.scenes) for (const key of ['visualUrl', 'audioUrl'] as const) {
  if (scene[key]) scene[key] = scene[key]!.replace('/api/v1/media/', `http://127.0.0.1:${address.port}/${token}/`).replace('/content', '');
}
const progress = (value: number) => process.stdout.write(JSON.stringify({ progress: value }) + '\n');
try {
  const serveUrl = await bundle({ entryPoint: path.resolve('apps/frontend/render/index.tsx'), outDir: path.join(folder, 'bundle'), publicDir: null, onProgress: value => progress(Math.floor(value / 10)) });
  const composition = await selectComposition({ serveUrl, id: 'StudioVideo', inputProps: { video } });
  const outputLocation = path.join(folder, 'output.mp4');
  // MoneyPrinterTurbo explicitly uses 192 kbps AAC to avoid low-quality defaults.
  await renderMedia({ composition, serveUrl, inputProps: { video }, codec: 'h264', audioCodec: 'aac', audioBitrate: '192k', pixelFormat: 'yuv420p', outputLocation, concurrency: 2, x264Preset: 'fast', onProgress: event => progress(10 + Math.floor(event.progress * 85)) });
  if ((await getVideoMetadata(outputLocation)).audioCodec) {
    // AAC packet padding can outlast the last frame. Finalize the audio timeline without re-encoding video.
    const exactOutput = path.join(folder, 'exact-timing.mp4');
    const seconds = video.durationInFrames / video.fps;
    await runLocalFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', outputLocation, '-t', String(seconds), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-af', 'apad,atrim=duration=' + seconds, '-movflags', '+faststart', exactOutput]);
    await rename(exactOutput, outputLocation);
  }
  const metadata = await getVideoMetadata(outputLocation);
  if (metadata.width !== video.width || metadata.height !== video.height || metadata.durationInSeconds === null || Math.abs(metadata.durationInSeconds - video.durationInFrames / video.fps) > .15 || (video.scenes.some(scene => scene.audioUrl) && metadata.audioCodec !== 'aac')) throw new Error('Rendered video failed validation');
  await writeFile(path.join(folder, 'result.json'), JSON.stringify({ width: metadata.width, height: metadata.height, duration: metadata.durationInSeconds }));
} finally { server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
