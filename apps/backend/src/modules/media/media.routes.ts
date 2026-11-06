import express, { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { objectId } from '../../common/utils/validation.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { sendSuccess, sendAccepted } from '../../common/utils/response.js';
import { MediaAssetModel } from '../../database/models/MediaAsset.model.js';
import { AppError } from '../../common/errors/app-error.js';
import { mediaDirectory, mediaService } from './media.service.js';
import { ElevenLabsProvider } from '../providers/adapters/elevenlabs.adapter.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { KittenLocalProvider, kittenDirectory } from '../providers/adapters/kitten-local.adapter.js';
import { PiperLocalProvider, piperDirectory } from '../providers/adapters/piper-local.adapter.js';
import { env } from '../../config/env.js';
import { videoGenerationService } from './video-generation.service.js';
import { videoRenderService } from './video-render.service.js';
import { mediaBatchService } from './media-batch.service.js';
import { sceneEditingSchema } from './scene-editing.js';
import { contentJobService } from './content-job.service.js';
const router = Router();
router.use(requireAuth);
const timestamp = z.string().datetime();
const visualProvider = z.string().regex(/^(?:gemini(?::[a-zA-Z0-9.-]+)?|openrouter-gemma|openrouter-nemotron|studio-team)$/);
router.post('/scenes/:sceneId/explainer/jobs', rateLimit('visual-plan', 30, 60 * 60 * 1000, true), async (req, res, next) => {
  try {
    const body = z.object({ expectedUpdatedAt: timestamp, replaceEdits: z.boolean().optional(), visualProviderId: visualProvider.optional() }).strict().parse(req.body);
    return sendAccepted(res, { job: await contentJobService.start('visual', objectId.parse(req.params.sceneId), req.user!.userId, z.string().uuid().parse(req.get('X-Generation-Request')), body) });
  } catch (error) { next(error); }
});
router.post('/scenes/:sceneId/narration/jobs', rateLimit('narration', 20, 60 * 60 * 1000, true), async (req, res, next) => {
  try {
    const body = z.object({ expectedUpdatedAt: timestamp, voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict().parse(req.body);
    return sendAccepted(res, { job: await contentJobService.start('narration', objectId.parse(req.params.sceneId), req.user!.userId, z.string().uuid().parse(req.get('X-Generation-Request')), body) });
  } catch (error) { next(error); }
});
router.patch('/scenes/:sceneId/editor', async (req, res, next) => {
  try {
    const body = z.object({ expectedUpdatedAt: timestamp, editing: sceneEditingSchema, narration: z.string().max(10000), visualDescription: z.string().max(5000) }).strict().parse(req.body);
    return sendSuccess(res, { scene: await mediaService.saveEditing(objectId.parse(req.params.sceneId), req.user!.userId, body.expectedUpdatedAt, body.editing, body.narration, body.visualDescription) });
  } catch (error) { next(error); }
});
router.post('/scenes/:sceneId/editor/:action', async (req, res, next) => {
  try {
    const body = z.object({ expectedUpdatedAt: timestamp }).strict().parse(req.body);
    const action = z.enum(['undo', 'redo']).parse(req.params.action);
    return sendSuccess(res, { scene: await mediaService.editingHistory(objectId.parse(req.params.sceneId), req.user!.userId, body.expectedUpdatedAt, action === 'redo') });
  } catch (error) { next(error); }
});
router.post('/scenes/:sceneId/explainer/generate', rateLimit('visual-plan', 30, 60 * 60 * 1000, true), async (req, res, next) => {
  try {
    const body = z.object({ expectedUpdatedAt: timestamp, replaceEdits: z.boolean().optional(), visualProviderId: visualProvider.optional() }).strict().parse(req.body);
    return sendSuccess(res, { scene: await mediaService.generateExplainer(objectId.parse(req.params.sceneId), req.user!.userId, body.expectedUpdatedAt, body.replaceEdits, body.visualProviderId) });
  } catch (error) { next(error); }
});
router.post('/projects/:projectId/media-batches', rateLimit('media-batch', 10, 60 * 60 * 1000, true), async (req, res, next) => {
  try {
    const body = z.object({ storyboardId: objectId, voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), providerId: z.enum(['remotion', 'ltx-free', 'flow-local']), visualProviderId: visualProvider.optional(), maxCredits: z.number().int().min(0).max(1000), retryJobId: objectId.optional(), autoExport: z.boolean().optional() }).strict().parse(req.body);
    return sendAccepted(res, { job: await mediaBatchService.start(objectId.parse(req.params.projectId), req.user!.userId, body) });
  } catch (error) { next(error); }
});
router.get('/projects/:projectId/media-batches/latest', async (req, res, next) => {
  try { return sendSuccess(res, { job: await mediaBatchService.latest(objectId.parse(req.params.projectId), req.user!.userId) }); } catch (error) { next(error); }
});
router.get('/media-batches/:jobId', async (req, res, next) => {
  try { return sendSuccess(res, { job: await mediaBatchService.get(objectId.parse(req.params.jobId), req.user!.userId) }); } catch (error) { next(error); }
});
router.post('/scenes/:sceneId/video/generate', rateLimit('hosted-video', 10, 60 * 60 * 1000, true), async (req, res, next) => {
  try { const body = z.object({ expectedUpdatedAt: timestamp, providerId: z.enum(['ltx-free', 'flow-local']).optional(), maxCredits: z.number().int().min(0).max(10).optional() }).strict().parse(req.body); return sendAccepted(res, { job: await videoGenerationService.start(objectId.parse(req.params.sceneId), req.user!.userId, body.expectedUpdatedAt, body) }); } catch (e) { next(e); }
});
router.get('/video-jobs/:jobId', async (req, res, next) => {
  try { return sendSuccess(res, { job: await videoGenerationService.get(objectId.parse(req.params.jobId), req.user!.userId) }); } catch (e) { next(e); }
});
router.get('/projects/:projectId/video-jobs/active', async (req, res, next) => {
  try { return sendSuccess(res, { job: await videoGenerationService.active(objectId.parse(req.params.projectId), req.user!.userId) }); } catch (e) { next(e); }
});
router.post('/projects/:projectId/media/fit-narration', async (req, res, next) => {
  try { z.object({}).strict().parse(req.body); return sendSuccess(res, await mediaService.fitNarration(objectId.parse(req.params.projectId), req.user!.userId)); } catch (e) { next(e); }
});
router.post('/projects/:projectId/video-render', rateLimit('video-render', 20, 60 * 60 * 1000, true), async (req, res, next) => {
  try { z.object({}).strict().parse(req.body); return sendAccepted(res, { job: await videoRenderService.start(objectId.parse(req.params.projectId), req.user!.userId) }); } catch (e) { next(e); }
});
router.get('/projects/:projectId/video-render', async (req, res, next) => {
  try { return sendSuccess(res, { job: await videoRenderService.latest(objectId.parse(req.params.projectId), req.user!.userId) }); } catch (e) { next(e); }
});
router.get('/media/:assetId/download', async (req, res, next) => {
  try {
    const asset = await MediaAssetModel.findById(objectId.parse(req.params.assetId));
    if (!asset?.projectId || asset.status !== 'ready' || asset.source !== 'remotion-generated') throw AppError.notFound('Video not found');
    await requireProjectAccess(asset.projectId.toString(), req.user!.userId);
    if (asset.storageProvider !== 'local' || !/^[a-f0-9-]{36}$/.test(asset.storageKey)) throw AppError.notFound('Video unavailable');
    res.download(path.join(mediaDirectory, asset.storageKey), 'generated-video.mp4', error => { if (error) next(AppError.notFound('Video file unavailable')); });
  } catch (e) { next(e); }
});
// All free local voices are listed together; the ID prefix and sample file map each voice to its engine.
async function localVoiceCatalog() {
  const engines = [new KittenLocalProvider(), new PiperLocalProvider()];
  const results = await Promise.allSettled(engines.map(provider => provider.voices()));
  const voices = results.flatMap((result, index) => result.status === 'fulfilled' ? result.value.map(voice => ({ ...voice, directory: index === 1 ? piperDirectory : kittenDirectory() })) : []);
  if (!voices.length && results.every(result => result.status === 'rejected')) throw results[0].reason;
  return voices;
}
router.get('/narration/voices', async (_req, res, next) => {
  try {
    const providerId = env.NARRATION_PROVIDER;
    if (providerId === 'elevenlabs') return sendSuccess(res, { providerId, voices: await new ElevenLabsProvider().voices() });
    return sendSuccess(res, { providerId, voices: (await localVoiceCatalog()).map(({ directory, ...voice }) => voice) });
  } catch (e) { next(e); }
});
router.get('/narration/voices/:voiceId/sample', async (req, res, next) => {
  try {
    const voiceId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).safeParse(req.params.voiceId);
    if (!voiceId.success) throw AppError.notFound('Voice sample not available');
    const voice = (await localVoiceCatalog()).find(item => item.id === voiceId.data && item.previewUrl);
    if (!voice) throw AppError.notFound('Voice sample not available');
    res.set('Cache-Control', 'private, no-store');
    res.type('audio/wav').sendFile(path.join(voice.directory, 'sample-' + voice.id + '.wav'), { cacheControl: false }, error => { if (error) next(AppError.notFound('Voice sample not available')); });
  } catch (error) { next(error); }
});
router.post('/scenes/:sceneId/narration/generate', rateLimit('narration', 20, 60 * 60 * 1000, true), async (req, res, next) => {
  try {
    const body = z.object({ expectedUpdatedAt: timestamp, voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict().parse(req.body);
    return sendSuccess(res, { scene: await mediaService.generateNarration(objectId.parse(req.params.sceneId), req.user!.userId, body.expectedUpdatedAt, body.voiceId) });
  } catch (e) { next(e); }
});
router.get('/projects/:projectId/media', async (req, res, next) => {
  try { return sendSuccess(res, { assets: await mediaService.list(objectId.parse(req.params.projectId), req.user!.userId) }); } catch (e) { next(e); }
});
router.post('/scenes/:sceneId/media', express.raw({ type: ['image/*', 'video/*', 'audio/*'], limit: '8mb' }), async (req, res, next) => {
  try {
    const sceneId = objectId.parse(req.params.sceneId);
    const kind = z.enum(['visual', 'audio']).parse(req.query.kind);
    const expected = timestamp.parse(req.get('X-Scene-Updated-At'));
    const name = z.string().trim().min(1).max(255).parse(decodeURIComponent(req.get('X-Upload-Name') || 'upload'));
    if (!Buffer.isBuffer(req.body)) throw AppError.badRequest('Send a supported image, video or audio file');
    const duration = req.get('X-Media-Duration') ? z.coerce.number().positive().max(600).parse(req.get('X-Media-Duration')) : undefined;
    const scene = await mediaService.upload(sceneId, req.user!.userId, expected, kind, req.body, (req.get('Content-Type') || '').split(';')[0], name, duration);
    return sendSuccess(res, { scene });
  } catch (e) { next(e); }
});
router.patch('/scenes/:sceneId/media', async (req, res, next) => {
  try {
    const body = z.object({ expectedUpdatedAt: timestamp, narrationOptional: z.boolean().optional(), visualFit: z.enum(['cover', 'contain']).optional(), remove: z.enum(['visual', 'audio']).optional() }).strict().parse(req.body);
    return sendSuccess(res, { scene: await mediaService.settings(objectId.parse(req.params.sceneId), req.user!.userId, body) });
  } catch (e) { next(e); }
});
router.get('/media/:assetId/content', async (req, res, next) => {
  try {
    const asset = await MediaAssetModel.findById(objectId.parse(req.params.assetId));
    if (!asset || !asset.projectId || asset.status !== 'ready') throw AppError.notFound('Media not found');
    await requireProjectAccess(asset.projectId.toString(), req.user!.userId);
    if (asset.storageProvider !== 'local' || !/^[a-f0-9-]{36}$/.test(asset.storageKey)) throw AppError.notFound('Media not available');
    res.type(asset.mimeType);
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(path.join(mediaDirectory, asset.storageKey), { cacheControl: false }, error => { if (error) next(AppError.notFound('Media file not available')); });
  } catch (e) { next(e); }
});
export default router;
