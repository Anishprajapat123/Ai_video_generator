import { z } from 'zod';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getVideoMetadata } from '@remotion/renderer';
import type { ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import type { IAIProvider } from '../provider.interface.js';
import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';

export const LTX_ORIGIN = 'https://lightricks-ltx-video-distilled.hf.space';
const endpoint = LTX_ORIGIN + '/gradio_api/call/text_to_video';
const maxBytes = 8 * 1024 * 1024;
export function ltxVideoUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('Missing video URL');
  const url = new URL(value);
  if (url.origin !== LTX_ORIGIN || url.username || url.password || url.search || url.hash || !/^\/gradio_api\/file=\/tmp\/gradio\/[a-f0-9]+\/[\w.-]+\.mp4$/.test(url.pathname)) throw new Error('Unexpected video URL');
  return url.href;
}
async function bounded(response: Response, limit: number) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > limit) throw new Error('Invalid response');
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > limit) throw new Error('Response too large'); parts.push(item.value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(parts);
}
export class LtxFreeProvider implements IAIProvider {
  metadata = { id: 'ltx-free', name: 'LTX Video · Free shared demo', capabilities: ['video-generation' as const], enabled: env.ENABLE_HOSTED_VIDEO, priority: 1 };
  constructor(private request: typeof fetch = fetch) {}
  async isAvailable() { return this.metadata.enabled; }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.metadata.enabled) throw new AppError(503, 'PROVIDER_DISABLED', 'Free hosted video is disabled');
    if (request.capability !== 'video-generation') throw AppError.badRequest('LTX supports video generation only');
    const input = z.object({ prompt: z.string().trim().min(1).max(6000), duration: z.number().positive().max(600), aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']) }).parse(request.input);
    const sizes = { '16:9': [256, 448], '9:16': [448, 256], '1:1': [384, 384], '4:5': [480, 384] };
    const [height, width] = sizes[input.aspectRatio];
    const signal = AbortSignal.timeout(10 * 60 * 1000);
    const options = { signal, redirect: 'error' as const };
    let folder: string | undefined;
    try {
      // Anonymous Space API only: no billing token, credit purchase or provider fallback.
      const submitted = await this.request(endpoint, { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [input.prompt, 'blurry, jittery, distorted', null, null, height, width, 'text-to-video', Math.min(8, Math.max(.3, input.duration)), 9, Math.floor(Math.random() * 2147483647), false, 1, false] }) });
      if (submitted.status === 429) throw new AppError(429, 'QUOTA_EXCEEDED', 'The free video quota or queue is full. Try later; no paid fallback is used.');
      const submission = JSON.parse((await bounded(submitted, 16384)).toString());
      if (!/^[a-f0-9]{32}$/.test(submission.event_id)) throw new Error('Invalid job');
      if (typeof request.options?.onProgress === 'function') request.options.onProgress(5);
      const response = await this.request(endpoint + '/' + submission.event_id, options);
      if (!response.ok || !response.body) throw new Error('Queue unavailable');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let output: unknown;
      try {
        while (true) {
          const item = await reader.read(); if (item.done) break;
          pending += decoder.decode(item.value, { stream: true }).replace(/\r/g, '');
          if (pending.length > 1024 * 1024) throw new Error('Queue response too large');
          let boundary;
          while ((boundary = pending.indexOf('\n\n')) >= 0) {
            const block = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
            const event = block.match(/^event:\s*(.+)$/m)?.[1];
            const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (event === 'error') throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The free video demo rejected the request or reached its quota. Try later; no paid fallback is used.');
            if (event === 'complete') { output = JSON.parse(data); break; }
          }
          if (output) break;
        }
      } finally { await reader.cancel().catch(() => {}); }
      const result = z.array(z.unknown()).parse(output);
      const file = z.object({ video: z.object({ url: z.string() }) }).parse(result[0]);
      const url = ltxVideoUrl(file.video.url);
      if (typeof request.options?.onProgress === 'function') request.options.onProgress(90);
      const video = await bounded(await this.request(url, options), maxBytes);
      if (video.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Invalid MP4');
      folder = await mkdtemp(path.join(os.tmpdir(), 'studio-ltx-'));
      const target = path.join(folder, 'clip.mp4'); await writeFile(target, video);
      const metadata = await getVideoMetadata(target);
      if (!metadata.durationInSeconds || metadata.durationInSeconds > 9 || metadata.width !== width || metadata.height !== height || metadata.codec !== 'h264') throw new Error('Invalid clip metadata');
      return { providerId: 'ltx-free', model: 'LTX-Video-0.9.8-distilled', status: 'completed', output: { video, width, height, duration: metadata.durationInSeconds }, estimatedCost: 0, usage: { durationSeconds: metadata.durationInSeconds } };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (signal.aborted) throw new AppError(504, 'PROVIDER_TIMEOUT', 'The free video queue timed out. Check quota and try later.');
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Free hosted video is unavailable or returned an invalid clip. Your previous visual is unchanged.');
    } finally { if (folder) { await unlink(path.join(folder, 'clip.mp4')).catch(() => {}); await rmdir(folder).catch(() => {}); } }
  }
}
