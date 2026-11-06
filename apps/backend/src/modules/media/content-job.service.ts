import { createHash } from 'node:crypto';
import { GenerationJobModel } from '../../database/models/GenerationJob.model.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';
import { sceneService } from '../scenes/scene.service.js';
import { scriptService } from '../scripts/script.service.js';
import { mediaService } from './media.service.js';

type Kind = 'script' | 'visual' | 'narration';
type Input = { prompt?: string; language?: string; tone?: string; targetAudience?: string; providerId?: string; expectedUpdatedAt?: string; replaceEdits?: boolean; visualProviderId?: string; voiceId?: string };
const jobType = 'content-generation';
export class ContentJobService {
  async latest(projectId: string, userId: string) {
    await requireProjectAccess(projectId, userId);
    const job = await GenerationJobModel.findOne({ projectId, jobType }).sort({ createdAt: -1 });
    return job ? this.get(job.id, userId) : null;
  }
  async start(kind: Kind, resourceId: string, userId: string, requestId: string, input: Input) {
    const scene = kind === 'script' ? null : await sceneService.getSceneById(resourceId, userId, true);
    const project = await requireProjectAccess(scene ? String(scene.projectId) : resourceId, userId, true);
    const fingerprint = createHash('sha256').update(JSON.stringify({ kind, resourceId, input })).digest('hex');
    await GenerationJobModel.updateMany({ jobType, status: 'processing', expiresAt: { $lt: new Date() } }, { $set: { status: 'failed', error: 'The generation worker stopped. Check saved project content before starting again.', completedAt: new Date() }, $unset: { resourceKey: 1 } });
    const previous = await GenerationJobModel.findOne({ jobType, requestedBy: userId, 'inputReference.requestId': requestId });
    if (previous) {
      if (previous.inputReference?.fingerprint !== fingerprint) throw AppError.conflict('Generation request ID was reused with different settings');
      return { _id: previous.id };
    }
    if (scene && scene.updatedAt.toISOString() !== input.expectedUpdatedAt) throw AppError.conflict('Scene changed; reload before generating');
    // Serialize content generation per project, including requests arriving from another tab.
    const resourceKey = 'content-generation:' + project.id;
    const active = await GenerationJobModel.findOne({ jobType, resourceKey, status: 'processing' });
    if (active) {
      if (active.inputReference?.fingerprint === fingerprint) return { _id: active.id };
      throw AppError.conflict('Generation is already running for this project. Wait for it to finish.');
    }
    await GenerationJobModel.collection.createIndex({ resourceKey: 1 }, { unique: true, partialFilterExpression: { resourceKey: { $type: 'string' } } });
    await GenerationJobModel.collection.createIndex({ requestedBy: 1, jobType: 1, 'inputReference.requestId': 1 }, { unique: true, partialFilterExpression: { 'inputReference.requestId': { $type: 'string' } } });
    let job;
    try {
      job = await GenerationJobModel.create({ workspaceId: project.workspaceId, projectId: project._id, ...(scene ? { sceneId: scene._id } : {}), requestedBy: userId,
        providerId: input.visualProviderId || input.providerId || (kind === 'narration' ? 'narration' : 'gemini'), capability: kind === 'narration' ? 'text-to-speech' : 'llm', jobType, status: 'processing', progress: 0,
        inputReference: { requestId, fingerprint, kind }, resourceKey, attempts: 1, maxAttempts: 1, startedAt: new Date(), expiresAt: new Date(Date.now() + 10 * 60000) });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const existing = await GenerationJobModel.findOne({ jobType, projectId: project._id, 'inputReference.fingerprint': fingerprint, $or: [{ 'inputReference.requestId': requestId }, { resourceKey }] });
        if (existing) return { _id: existing.id };
        throw AppError.conflict('Generation is already running for this project');
      }
      throw error;
    }
    // Resolve the HTTP request before waiting on Gemini or local speech synthesis.
    void this.run(job.id, kind, resourceId, userId, input).catch(error => console.error('Content job persistence failed:', error instanceof Error ? error.name : 'unknown'));
    return { _id: job.id };
  }
  private async run(jobId: string, kind: Kind, resourceId: string, userId: string, input: Input) {
    try {
      const result = kind === 'script'
        ? await scriptService.generateScript(resourceId, userId, { ...input, prompt: input.prompt! })
        : kind === 'visual'
          ? await mediaService.generateExplainer(resourceId, userId, input.expectedUpdatedAt!, input.replaceEdits, input.visualProviderId)
          : await mediaService.generateNarration(resourceId, userId, input.expectedUpdatedAt!, input.voiceId!);
      await GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $set: { status: 'completed', progress: 100, completedAt: new Date(), 'inputReference.resultId': result.id }, $unset: { resourceKey: 1 } });
    } catch (error) {
      await GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $set: { status: 'failed', error: error instanceof AppError ? error.message : 'Generation failed. Saved content is unchanged; check your project before retrying.', completedAt: new Date() }, $unset: { resourceKey: 1 } });
    }
  }
  async get(jobId: string, userId: string) {
    const job = await GenerationJobModel.findOne({ _id: jobId, jobType });
    if (!job?.projectId) throw AppError.notFound('Generation job not found');
    await requireProjectAccess(String(job.projectId), userId);
    if (job.status === 'processing' && job.expiresAt && job.expiresAt < new Date()) {
      await GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $set: { status: 'failed', error: 'The generation worker stopped. Check saved project content before retrying.', completedAt: new Date() }, $unset: { resourceKey: 1 } });
      return { _id: job.id, requestId: job.inputReference?.requestId, kind: job.inputReference?.kind, sceneId: job.sceneId?.toString(), status: 'failed', error: 'The generation worker stopped. Check saved project content before retrying.' };
    }
    const id = job.inputReference?.resultId as string | undefined;
    const result = job.status === 'completed' && id ? job.inputReference?.kind === 'script'
      ? { script: await scriptService.getScriptById(id, userId) }
      : { scene: await sceneService.getSceneById(id, userId) } : undefined;
    return { _id: job.id, requestId: job.inputReference?.requestId, kind: job.inputReference?.kind, sceneId: job.sceneId?.toString(), status: job.status, error: job.error, result };
  }
}
export const contentJobService = new ContentJobService();
