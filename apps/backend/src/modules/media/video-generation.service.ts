import { GenerationJobModel } from '../../database/models/GenerationJob.model.js';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { sceneService } from '../scenes/scene.service.js';
import { mediaService } from './media.service.js';
import { providerManager } from '../providers/provider.manager.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';

export class VideoGenerationService {
  private readonly type = 'scene-hosted-video';
  private async expire() {
    await GenerationJobModel.updateMany({ jobType: this.type, status: { $in: ['queued', 'processing'] }, expiresAt: { $lt: new Date() } },
      { $set: { status: 'failed', error: 'The generation worker stopped or timed out. Start a new generation.', completedAt: new Date() }, $unset: { resourceKey: 1 } });
  }
  async start(sceneId: string, userId: string, expectedUpdatedAt: string, options: { providerId?: 'ltx-free' | 'flow-local'; maxCredits?: number } = {}) {
    const scene = await sceneService.getSceneById(sceneId, userId, true);
    const project = await requireProjectAccess(scene.projectId.toString(), userId, true);
    if (scene.updatedAt.toISOString() !== expectedUpdatedAt) throw AppError.conflict('Scene changed; reload before generating');
    if (!scene.visualDescription?.trim()) throw AppError.badRequest('Add visual direction in the storyboard first');
    if (!await StoryboardModel.exists({ _id: scene.storyboardId, status: 'approved' })) throw AppError.conflict('Approve the current storyboard first');
    const providerId = options.providerId || 'ltx-free';
    const maxCredits = providerId === 'flow-local' ? options.maxCredits || 0 : 0;
    if (providerId === 'flow-local' && (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 10)) throw AppError.badRequest('Flow credit spending is blocked. Approve a per-scene limit first.');
    const provider = providerManager.getProvider(providerId);
    if (!provider || !await provider.isAvailable()) throw new AppError(503, 'PROVIDER_DISABLED', 'Selected video provider is not enabled');
    await this.expire();
    // This index provides a cross-request/process reservation for video generation.
    await GenerationJobModel.collection.createIndex({ resourceKey: 1 }, { unique: true, partialFilterExpression: { resourceKey: { $type: 'string' } } });
    let job;
    try {
      job = await GenerationJobModel.create({ workspaceId: scene.workspaceId, projectId: scene.projectId, sceneId: scene._id, requestedBy: userId,
        providerId, aiModel: providerId === 'flow-local' ? 'Veo 3.1 - Lite' : 'LTX-Video-0.9.8-distilled', inputReference: { maxCredits, expectedUpdatedAt }, capability: 'video-generation', jobType: this.type, status: 'processing', progress: 0,
        startedAt: new Date(), expiresAt: new Date(Date.now() + 600000 + 60000), resourceKey: 'free-video-queue', maxAttempts: 1, attempts: 1 });
    } catch (error) { if ((error as { code?: number }).code === 11000) throw AppError.conflict('A video is already generating. Wait for it to finish.'); throw error; }
    void this.run(job.id, sceneId, userId, expectedUpdatedAt, scene.workspaceId.toString(), scene.projectId.toString(), scene.visualDescription, project.settings.aspectRatio, scene.duration, providerId, maxCredits);
    return job;
  }
  private async run(jobId: string, sceneId: string, userId: string, expected: string, workspaceId: string, projectId: string, prompt: string, aspectRatio: string, duration: number, providerId: string, maxCredits: number) {
    try {
      const response = await providerManager.execute({ userId, workspaceId, projectId, sceneId, capability: 'video-generation', input: { prompt, aspectRatio, duration }, options: { providerId, maxCredits, allowFallback: false,
        onExternalJob: async (externalJobId: string) => { await GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $set: { externalJobId } }); },
        onProgress: (progress: number) => { void GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $max: { progress } }).catch(() => {}); } } });
      const video = response.output?.video;
      const clipDuration = response.output?.duration;
      if (response.status !== 'completed' || !Buffer.isBuffer(video) || typeof clipDuration !== 'number' || !Number.isFinite(clipDuration) || clipDuration <= 0) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Provider returned no valid video');
      await GenerationJobModel.updateOne({ _id: jobId }, { $set: { progress: 95 } });
      const scene = await mediaService.upload(sceneId, userId, expected, 'visual', video, 'video/mp4', 'generated-scene-video.mp4', clipDuration as number | undefined, 'ai-generated');
      await GenerationJobModel.updateOne({ _id: jobId }, { $set: { status: 'completed', progress: 100, outputAssetIds: scene.visualAssetIds, completedAt: new Date() }, $unset: { resourceKey: 1 } });
    } catch (error) {
      await GenerationJobModel.updateOne({ _id: jobId }, { $set: { status: 'failed', error: error instanceof AppError ? error.message : 'Scene video generation failed. Reload before trying again.', completedAt: new Date() }, $unset: { resourceKey: 1 } }).catch(() => {});
    }
  }
  async get(jobId: string, userId: string) {
    const job = await GenerationJobModel.findOne({ _id: jobId, jobType: this.type });
    if (!job?.projectId) throw AppError.notFound('Generation job not found');
    await requireProjectAccess(job.projectId.toString(), userId);
    await this.expire();
    return GenerationJobModel.findById(jobId);
  }
  async active(projectId: string, userId: string) {
    await requireProjectAccess(projectId, userId); await this.expire();
    return GenerationJobModel.findOne({ projectId, jobType: this.type, status: 'processing' }).sort({ createdAt: -1 });
  }
}
export const videoGenerationService = new VideoGenerationService();
