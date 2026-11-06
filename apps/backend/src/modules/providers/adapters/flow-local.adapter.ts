import { existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { getVideoMetadata } from '@remotion/renderer';
import { z } from 'zod';
import type { ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import type { IAIProvider } from '../provider.interface.js';
import { env } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';

const root = path.resolve(__dirname, '../../../../../..');
const outputRoot = path.join(root, 'storage/flow-output');
const tokenFile = path.join(root, 'storage/flow-session/token');
const origin = 'http://127.0.0.1:8787';
const jobSchema = z.object({ id: z.string().min(1).max(100), status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']), files: z.array(z.string()).default([]), credits: z.number().finite().nonnegative().optional() });
const jobsSchema = z.object({ jobs: z.array(jobSchema) });
const statusSchema = z.object({ flow: z.object({ signedIn: z.boolean(), inProject: z.boolean(), credits_remaining: z.number().finite().optional() }), jobs: z.array(jobSchema).optional() });

export function requireFlowOutput(file: string, directory = outputRoot) {
  const relative = path.relative(path.resolve(directory), path.resolve(file));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.extname(file).toLowerCase() !== '.mp4') throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Flow returned an unexpected output file.');
  return path.resolve(file);
}

export async function readFlowClip(file: string) {
  const target = await realpath(requireFlowOutput(file));
  requireFlowOutput(target, await realpath(outputRoot));
  const info = await stat(target);
  if (!info.isFile() || info.size < 12) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Flow returned an empty or invalid video file.');
  const video = await readFile(target);
  if (video.toString('ascii', 4, 8) !== 'ftyp') throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Flow returned an invalid MP4.');
  const metadata = await getVideoMetadata(target);
  if (typeof metadata.durationInSeconds !== 'number' || !Number.isFinite(metadata.durationInSeconds) || metadata.durationInSeconds <= 0 || !metadata.width || !metadata.height) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Flow clip failed video validation.');
  return { video, width: metadata.width, height: metadata.height, duration: metadata.durationInSeconds };
}

export class FlowLocalProvider implements IAIProvider {
  metadata = { id: 'flow-local', name: 'Google Flow · local Chrome', capabilities: ['video-generation' as const], enabled: env.ENABLE_FLOW_VIDEO, priority: 10 };
  constructor(private request: typeof fetch = fetch, private token = () => readFile(tokenFile, 'utf8'), private loadClip = readFlowClip) {}
  async isAvailable() { return this.metadata.enabled && existsSync(tokenFile); }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.metadata.enabled) throw new AppError(503, 'PROVIDER_DISABLED', 'Google Flow is disabled.');
    if (request.capability !== 'video-generation' || request.options?.providerId !== 'flow-local') throw AppError.badRequest('Select Google Flow explicitly for video generation.');
    const input = z.object({ prompt: z.string().trim().min(1).max(6000), aspectRatio: z.enum(['16:9', '9:16']), duration: z.number().positive().max(600) }).parse(request.input);
    const maxCredits = request.options?.maxCredits;
    if (typeof maxCredits !== 'number' || !Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 10) throw AppError.badRequest('Flow credit spending is blocked. Explicitly approve a limit of 1–10 credits for this scene.');
    let submitted = false;
    const deadline = Date.now() + 10 * 60 * 1000;
    try {
      const secret = (await this.token()).trim();
      if (!/^[a-f0-9]{48}$/.test(secret)) throw new Error('Invalid bridge token');
      const call = async (method: string, body: unknown) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new AppError(504, 'PROVIDER_TIMEOUT', 'Flow timed out. Check the existing job before submitting another.');
        const response = await this.request(origin + '/api/' + method, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.min(45000, remaining)), headers: { 'Content-Type': 'application/json', 'x-flow-token': secret }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error('Bridge request failed');
        return response.json();
      };
      const health = await this.request(origin + '/api/health', { redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (!health.ok || (await health.json() as { name?: string }).name !== 'flow-mcp') throw new Error('Wrong bridge');
      const status = statusSchema.parse(await call('status', { detailed: true }));
      if (!status.flow?.signedIn || !status.flow?.inProject) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Sign in and open a project in the dedicated Flow Chrome window.');
      if (typeof status.flow.credits_remaining !== 'number' || !Number.isFinite(status.flow.credits_remaining) || status.flow.credits_remaining < maxCredits) throw new AppError(429, 'QUOTA_EXCEEDED', 'Flow has insufficient confirmed credits. No clip was submitted.');
      if (status.jobs?.some((job: { status: string }) => ['queued', 'running'].includes(job.status))) throw AppError.conflict('Flow already has an active job. Wait before generating again.');
      // Submission is never retried: a timeout may still have consumed credits.
      submitted = true;
      const started = jobsSchema.parse(await call('generate', { project: 'studio-' + (request.projectId || 'scene'), scenes: [{ prompt: input.prompt, type: 'video', model: 'Veo 3.1 - Lite', aspect_ratio: input.aspectRatio, variants: 1, max_credits: maxCredits, retries: 0, download_quality: 'original' }] }));
      const id = z.string().min(1).max(100).parse(started.jobs?.[0]?.id);
      if (typeof request.options?.onExternalJob === 'function') await request.options.onExternalJob(id);
      for (let attempt = 0; attempt < 28; attempt++) {
        const state = jobsSchema.parse(await call('wait', { job_ids: [id], timeout_seconds: 20 }));
        const job = state.jobs?.find((item: { id: string }) => item.id === id);
        if (!job) throw new Error('Flow job lost');
        if (['failed', 'cancelled'].includes(job.status)) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Flow could not finish this clip. Check the existing Flow job before trying again.');
        if (job.status === 'done') {
          if (job.credits !== undefined && job.credits > maxCredits) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Flow reported credits above the approved limit. Check the existing job before continuing.');
          const file = z.string().parse(job.files?.[0]);
          const clip = await this.loadClip(requireFlowOutput(file));
          const portrait = clip.height > clip.width;
          if (portrait !== (input.aspectRatio === '9:16')) throw new Error('Wrong aspect ratio');
          return { providerId: this.metadata.id, model: 'Veo 3.1 - Lite', status: 'completed', output: clip, usage: { durationSeconds: clip.duration, ...(Number.isFinite(job.credits) ? { credits: job.credits } : {}) } };
        }
        if (typeof request.options?.onProgress === 'function') request.options.onProgress(Math.min(85, 5 + attempt * 3));
      }
      throw new AppError(504, 'PROVIDER_TIMEOUT', 'Flow is still running. Check the existing job before submitting another.');
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', submitted ? 'Flow connection was interrupted. Check the existing Flow job before retrying; it may still finish.' : 'Start the local Flow connector and check its session before generating.');
    }
  }
}
