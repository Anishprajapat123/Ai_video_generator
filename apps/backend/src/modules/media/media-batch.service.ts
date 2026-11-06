import { setTimeout as delay } from 'node:timers/promises';
import { GenerationJobModel } from '../../database/models/GenerationJob.model.js';
import { SceneModel } from '../../database/models/Scene.model.js';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { MediaAssetModel } from '../../database/models/MediaAsset.model.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { mediaService } from './media.service.js';
import { videoGenerationService } from './video-generation.service.js';
import { videoRenderService } from './video-render.service.js';

type VisualProvider = 'remotion' | 'ltx-free' | 'flow-local';
type Step = 'waiting' | 'generating' | 'ready' | 'failed';
export type BatchScene = { sceneId: string; title: string; expectedUpdatedAt: string; narration: Step; visual: Step; error?: string };
type Options = { storyboardId: string; voiceId: string; providerId: VisualProvider; visualProviderId?: string; maxCredits: number; retryJobId?: string; autoExport?: boolean };
type BatchState = Options & { scenes: BatchScene[]; reservedCredits: number; exportJobId?: string; exportError?: string };
const jobType = 'scene-media-batch';

export function requireBatchBudget(providerId: VisualProvider, missingVisuals: number, approved: number) {
  const required = providerId === 'flow-local' ? missingVisuals * 10 : 0;
  if (approved !== required) throw AppError.badRequest('Approve exactly ' + required + ' total Flow credits for the missing visuals.');
  return required;
}

export class MediaBatchService {
  private async expire() {
    await GenerationJobModel.updateMany({ jobType, status: 'processing', expiresAt: { $lt: new Date() } },
      { $set: { status: 'failed', error: 'Batch worker stopped. Check saved media before retrying.', completedAt: new Date() }, $unset: { resourceKey: 1 } });
  }
  async latest(projectId: string, userId: string) {
    await requireProjectAccess(projectId, userId);
    await this.expire();
    return GenerationJobModel.findOne({ projectId, jobType }).sort({ createdAt: -1 });
  }
  async get(jobId: string, userId: string) {
    const job = await GenerationJobModel.findOne({ _id: jobId, jobType });
    if (!job?.projectId) throw AppError.notFound('Media batch not found');
    await requireProjectAccess(job.projectId.toString(), userId);
    await this.expire();
    return GenerationJobModel.findById(jobId);
  }
  async start(projectId: string, userId: string, options: Options) {
    const project = await requireProjectAccess(projectId, userId, true);
    if (project.storyboardId?.toString() !== options.storyboardId || !await StoryboardModel.exists({ _id: options.storyboardId, projectId, status: 'approved' })) throw AppError.conflict('Approve the current storyboard first');
    let retryIds: Set<string> | undefined;
    if (options.retryJobId) {
      const previous = await GenerationJobModel.findOne({ _id: options.retryJobId, projectId, jobType, status: 'failed' });
      if (!previous || previous.inputReference?.storyboardId !== options.storyboardId) throw AppError.badRequest('No failed batch for this storyboard');
      retryIds = new Set((previous.inputReference.scenes as BatchScene[]).filter(scene => scene.narration !== 'ready' || scene.visual !== 'ready').map(scene => scene.sceneId));
    }
    const scenes = await SceneModel.find({ projectId, storyboardId: options.storyboardId }).sort({ sceneNumber: 1 });
    const assets = await MediaAssetModel.find({ projectId, status: 'ready' }).select('_id type duration');
    const ready = (id: unknown, types: string[]) => assets.some(asset => asset.id === String(id) && types.includes(asset.type));
    const planned: BatchScene[] = scenes.filter(scene => !retryIds || retryIds.has(scene.id)).map(scene => ({
      sceneId: scene.id, title: scene.title, expectedUpdatedAt: scene.updatedAt.toISOString(),
      narration: scene.narrationOptional || assets.some(asset => asset.id === String(scene.voiceAssetId) && asset.type === 'audio' && typeof asset.duration === 'number' && Math.abs(asset.duration - scene.duration) <= 0.05) ? 'ready' : 'waiting',
      visual: (scene.editing?.visualMode !== 'clip' && scene.motionGraphics.some(item => item.type === 'remotion-explainer')) || (scene.editing?.visualMode !== 'remotion' && scene.visualAssetIds.some(id => ready(id, ['video']))) ? 'ready' : 'waiting',
    }));
    if (!planned.some(scene => scene.narration === 'waiting' || scene.visual === 'waiting')) throw AppError.badRequest('No missing media to generate');
    if (planned.some(scene => scene.narration === 'waiting') && !['kitten-local', 'piper-local'].includes(env.NARRATION_PROVIDER)) throw AppError.badRequest('Batch narration requires a free local provider');
    requireBatchBudget(options.providerId, planned.filter(scene => scene.visual === 'waiting').length, options.maxCredits);
    if (options.providerId === 'flow-local' && !['16:9', '9:16'].includes(project.settings.aspectRatio)) throw AppError.badRequest('Flow supports landscape and portrait projects only');
    await this.expire();
    await GenerationJobModel.collection.createIndex({ resourceKey: 1 }, { unique: true, partialFilterExpression: { resourceKey: { $type: 'string' } } });
    let job;
    try {
      job = await GenerationJobModel.create({ workspaceId: project.workspaceId, projectId, requestedBy: userId, providerId: options.providerId,
        capability: 'media-batch', jobType, status: 'processing', progress: 0, attempts: 1, maxAttempts: 1,
        inputReference: { ...options, scenes: planned, reservedCredits: 0 }, resourceKey: 'media-batch:' + projectId,
        startedAt: new Date(), expiresAt: new Date(Date.now() + 120000) });
    } catch (error) { if ((error as { code?: number }).code === 11000) throw AppError.conflict('A media batch is already running for this project'); throw error; }
    void this.run(job.id, projectId, userId, { ...options, scenes: planned, reservedCredits: 0 }).catch(async () => {
      await GenerationJobModel.updateOne({ _id: job.id, status: 'processing' }, { $set: { status: 'failed', error: 'Batch interrupted. Check saved media before retrying.', completedAt: new Date() }, $unset: { resourceKey: 1 } }).catch(() => {});
    });
    return job;
  }
  private async run(jobId: string, projectId: string, userId: string, state: BatchState) {
    const save = async () => {
      const done = state.scenes.reduce((sum, scene) => sum + Number(['ready', 'failed'].includes(scene.narration)) + Number(['ready', 'failed'].includes(scene.visual)), 0);
      await GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $set: { inputReference: state, progress: Math.floor(done / (state.scenes.length * 2) * 100), expiresAt: new Date(Date.now() + 120000) } });
    };
    // Heartbeat distinguishes a long provider call from a stopped worker; no jobs are retried automatically.
    const heartbeat = setInterval(() => { void GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $set: { expiresAt: new Date(Date.now() + 120000) } }).catch(() => {}); }, 30000);
    try {
      for (const item of state.scenes) {
        for (const step of ['narration', 'visual'] as const) {
          if (item[step] === 'ready') continue;
          try {
            const project = await requireProjectAccess(projectId, userId, true);
            const scene = await SceneModel.findOne({ _id: item.sceneId, projectId, storyboardId: state.storyboardId });
            if (project.storyboardId?.toString() !== state.storyboardId || !scene || scene.updatedAt.toISOString() !== item.expectedUpdatedAt || !await StoryboardModel.exists({ _id: state.storyboardId, status: 'approved' })) throw AppError.conflict('Storyboard or scene changed. Review before retrying.');
            item[step] = 'generating'; await save();
            if (step === 'narration') {
              const existing = scene.voiceAssetId && await MediaAssetModel.exists({ _id: scene.voiceAssetId, projectId, type: 'audio', status: 'ready' });
              const updated = existing ? await mediaService.fitSceneNarration(item.sceneId, userId, item.expectedUpdatedAt) : await mediaService.generateNarration(item.sceneId, userId, item.expectedUpdatedAt, scene.editing?.voiceId || state.voiceId);
              item.expectedUpdatedAt = updated.updatedAt.toISOString();
            } else if (state.providerId === 'remotion') {
              const updated = await mediaService.generateExplainer(item.sceneId, userId, item.expectedUpdatedAt, false, state.visualProviderId);
              item.expectedUpdatedAt = updated.updatedAt.toISOString();
            } else {
              const service = videoGenerationService;
              if (state.providerId === 'flow-local') {
                if (state.reservedCredits + 10 > state.maxCredits) throw AppError.badRequest('Approved Flow batch budget exhausted');
                // Reserve before submitting. Failed or uncertain requests never recycle approved credits.
                state.reservedCredits += 10; await save();
              }
              const child = await service.start(item.sceneId, userId, item.expectedUpdatedAt,
                { providerId: state.providerId, maxCredits: state.providerId === 'flow-local' ? 10 : 0 });
              for (;;) {
                const result = await service.get(child.id, userId);
                if (!result || result.status === 'failed') throw AppError.badRequest(result?.error || 'Visual generation failed');
                if (result.status === 'completed') break;
                await delay(1000);
              }
            }
            item[step] = 'ready';
          } catch (error) { item[step] = 'failed'; item.error = (step === 'narration' ? 'Narration: ' : 'Visual: ') + (error instanceof AppError ? error.message : 'Generation failed. Check saved media before retrying.'); }
          await save();
        }
      }
      const failed = state.scenes.some(scene => scene.narration === 'failed' || scene.visual === 'failed');
      if (!failed && state.autoExport) {
        try { const exported = await videoRenderService.start(projectId, userId); state.exportJobId = exported?._id; }
        catch (error) { state.exportError = error instanceof AppError ? error.message : 'Export could not start. Your completed scenes are saved; retry Export MP4.'; }
      }
      await GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $set: { status: failed || state.exportError ? 'failed' : 'completed', progress: 100, inputReference: state,
        error: failed ? 'Some media failed. Completed assets are saved. Retry failed scenes when ready.' : state.exportError || null, completedAt: new Date() }, $unset: { resourceKey: 1 } });
    } finally { clearInterval(heartbeat); }
  }
}
export const mediaBatchService = new MediaBatchService();
