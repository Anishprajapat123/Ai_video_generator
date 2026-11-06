import mongoose from 'mongoose';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { sceneService } from '../scenes/scene.service.js';
import { SceneModel, ISceneDocument } from '../../database/models/Scene.model.js';
import { MediaAssetModel } from '../../database/models/MediaAsset.model.js';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { ProjectModel } from '../../database/models/Project.model.js';
import { GenerationJobModel } from '../../database/models/GenerationJob.model.js';
import { AppError } from '../../common/errors/app-error.js';
import { validateMediaBytes } from './media.validation.js';
import { providerManager } from '../providers/provider.manager.js';
import { fitAudioDuration } from './audio-fit.js';
import { mediaDirectory } from '../../common/utils/storage.js';
import { sceneEditingSchema, snapshotScene } from './scene-editing.js';
import type { SceneEditing } from '@ai-video-studio/shared-types';
import { visualMotionFitsDuration } from '@ai-video-studio/shared-types';
import { visualPlanSchema } from '../providers/visual-plan.schema.js';

export { mediaDirectory };
const fitTolerance = 0.05;
const storageKeyPattern = /^[a-f0-9-]{36}$/;
export class MediaService {
  private planning = new Set<string>();
  async generateExplainer(sceneId: string, userId: string, expectedUpdatedAt: string, replaceEdits = false, visualProviderId = 'gemini') {
    const current = await sceneService.getSceneById(sceneId, userId, true);
    if (current.updatedAt.toISOString() !== expectedUpdatedAt) throw AppError.conflict('Scene changed; reload before generating visuals');
    if ((current.editing?.heading || current.editing?.visualPlan) && !replaceEdits) throw AppError.conflict('This scene has saved edits. Confirm replacing visual edits before rebuilding.');
    const project = await ProjectModel.findOne({ _id: current.projectId, storyboardId: current.storyboardId, deletedAt: null });
    if (!project || !await StoryboardModel.exists({ _id: current.storyboardId, status: 'approved' })) throw AppError.conflict('Approve the current storyboard first');
    if (this.planning.has(sceneId)) throw AppError.conflict('Visual design is already running for this scene');
    this.planning.add(sceneId);
    try {
      const dimensions: Record<string, [number, number]> = { '16:9': [1600, 900], '9:16': [900, 1600], '1:1': [1000, 1000], '4:5': [1000, 1250] };
      const [width, height] = dimensions[project.settings.aspectRatio];
      const reference = await SceneModel.findOne({ projectId: current.projectId, storyboardId: current.storyboardId, _id: { $ne: current._id }, 'editing.visualPlan': { $exists: true } }).select('editing.visualPlan');
      const sharedPalette = reference?.editing?.visualPlan ? { background: reference.editing.visualPlan.background, accent: reference.editing.visualPlan.accent, textColor: reference.editing.visualPlan.textColor } : undefined;
      const result = await providerManager.execute({ userId, workspaceId: String(current.workspaceId), projectId: String(current.projectId), sceneId, capability: 'llm',
        input: { task: 'visual-plan', title: current.title, narration: current.narration || '', direction: current.visualDescription || '', projectTitle: project.title, language: project.settings.language, durationSeconds: current.duration, canvas: { width, height }, sharedPalette },
        options: { providerId: visualProviderId, allowFallback: false } });
      const parsed = visualPlanSchema.safeParse(result.output);
      if (!parsed.success) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Gemini returned an invalid visual design. Previous scene is unchanged.');
      const plan = parsed.data;
      if (plan.width !== width || plan.height !== height || !visualMotionFitsDuration(plan, current.duration) || plan.elements.some(element => (element.start || 0) >= current.duration || (element.end || 0) > current.duration)) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Gemini returned incorrect canvas dimensions or scene timing. Previous scene is unchanged.');
      return await this.change(sceneId, userId, expectedUpdatedAt, async scene => {
        scene.motionGraphics = [{ id: 'remotion-' + scene.id, type: 'remotion-explainer', properties: { points: [scene.title], visualPlan: plan, ...(result.collaboration ? { collaboration: result.collaboration } : {}) } }];
        scene.editing = { ...scene.editing, visualMode: 'remotion', visualPlan: plan, heading: scene.title, background: plan.background, accent: plan.accent, textColor: plan.textColor, animationSpeed: 1, illustration: 'none' };
      });
    } finally { this.planning.delete(sceneId); }
  }
  async saveEditing(sceneId: string, userId: string, expected: string, editing: SceneEditing, narration: string, direction: string) {
    const validated = sceneEditingSchema.parse(editing);
    return this.change(sceneId, userId, expected, async scene => {
      if (validated.visualPlan && !visualMotionFitsDuration(validated.visualPlan, scene.duration)) throw AppError.badRequest('Keyframes must fit inside the scene duration');
      const clip = await MediaAssetModel.findOne({ _id: { $in: scene.visualAssetIds }, projectId: scene.projectId, type: 'video', status: 'ready' });
      if (validated.visualMode === 'clip' && clip?.duration && (validated.clipStart >= clip.duration || (validated.clipEnd !== null && validated.clipEnd > clip.duration + .01))) throw AppError.badRequest('Trim points must stay inside the saved clip');
      if (validated.visualMode === 'clip' && clip?.duration) {
        const project = await ProjectModel.findById(scene.projectId).select('settings.fps');
        const fps = project?.settings.fps || 30;
        if (Math.round((validated.clipEnd ?? clip.duration) * fps) <= Math.round(validated.clipStart * fps)) throw AppError.badRequest('Clip trim must include at least one frame');
      }
      const changedVoice = validated.voiceId !== (scene.editing?.voiceId || '');
      if (narration !== (scene.narration || '') || changedVoice) scene.voiceAssetId = null;
      scene.narration = narration; scene.visualDescription = direction; scene.editing = validated; scene.visualFit = validated.visualFit;
    });
  }
  async editingHistory(sceneId: string, userId: string, expected: string, redo = false) {
    return this.change(sceneId, userId, expected, async scene => {
      const source = redo ? scene.editRedo : scene.editHistory;
      const previous = source.pop();
      if (!previous) throw AppError.badRequest(redo ? 'Nothing to redo' : 'Nothing to undo');
      const ids = [...previous.visualAssetIds, ...(previous.voiceAssetId ? [previous.voiceAssetId] : [])];
      if (await MediaAssetModel.countDocuments({ _id: { $in: ids }, projectId: scene.projectId, status: 'ready' }) !== new Set(ids.map(String)).size) throw AppError.conflict('A previous media file is no longer available');
      const destination = redo ? scene.editHistory : scene.editRedo;
      destination.push(snapshotScene(scene));
      for (const key of ['title', 'narration', 'visualDescription', 'visualAssetIds', 'voiceAssetId', 'narrationOptional', 'visualFit', 'motionGraphics', 'editing'] as const) scene.set(key, previous[key]);
      scene.markModified('editing'); scene.markModified('motionGraphics');
    }, false);
  }
  async fitSceneNarration(sceneId: string, userId: string, expectedUpdatedAt: string) {
    const scene = await sceneService.getSceneById(sceneId, userId, true);
    if (scene.updatedAt.toISOString() !== expectedUpdatedAt) throw AppError.conflict('Scene changed; reload before fitting narration');
    const asset = await MediaAssetModel.findOne({ _id: scene.voiceAssetId, projectId: scene.projectId, type: 'audio', status: 'ready', storageProvider: 'local' });
    if (!asset || !storageKeyPattern.test(asset.storageKey)) throw AppError.badRequest('Generate narration for this scene first');
    const bytes = await readFile(path.join(mediaDirectory, asset.storageKey));
    return this.upload(sceneId, userId, expectedUpdatedAt, 'audio', bytes, asset.mimeType, asset.name, asset.duration, 'ai-generated');
  }
  // Re-encode existing narration tracks so every scene's voice lasts exactly as long as its video.
  async fitNarration(projectId: string, userId: string) {
    const { requireProjectAccess } = await import('../../common/utils/access.js');
    await requireProjectAccess(projectId, userId, true);
    const busy = await GenerationJobModel.exists({ projectId, status: { $in: ['queued', 'processing'] }, jobType: { $in: ['scene-media-batch', 'project-video-render', 'scene-hosted-video'] } });
    if (busy) throw AppError.conflict('Wait for the current generation or export to finish before fitting narration');
    const project = await ProjectModel.findOne({ _id: projectId, deletedAt: null });
    const board = project && await StoryboardModel.findOne({ _id: project.storyboardId, status: 'approved' });
    if (!project || !board) throw AppError.conflict('Approve the current storyboard first');
    const scenes = await SceneModel.find({ projectId, storyboardId: board._id }).sort({ sceneNumber: 1 });
    const ids = scenes.map(scene => scene.voiceAssetId).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const assets = ids.length ? await MediaAssetModel.find({ _id: { $in: ids }, projectId, workspaceId: project.workspaceId, type: 'audio', status: 'ready' }) : [];
    let fitted = 0; const failed: number[] = [];
    for (const scene of scenes) {
      if (scene.narrationOptional || !scene.voiceAssetId) continue;
      const asset = assets.find(item => scene.voiceAssetId!.equals(item._id as mongoose.Types.ObjectId));
      if (!asset || typeof asset.duration !== 'number' || Math.abs(asset.duration - scene.duration) <= fitTolerance) continue;
      try { await this.fitSceneNarration(scene.id, userId, scene.updatedAt.toISOString()); fitted++; }
      catch { failed.push(scene.sceneNumber); }
    }
    return { storyboardId: board.id, fitted, failed, changed: fitted > 0 };
  }
  private generating = new Set<string>();
  // All free local voices coexist in one catalog; the voice ID identifies which engine owns it.
  private narrationProvider(voiceId: string) {
    if (voiceId.startsWith('piper-')) return 'piper-local';
    return env.NARRATION_PROVIDER === 'piper-local' ? 'kitten-local' : env.NARRATION_PROVIDER;
  }
  async generateNarration(sceneId: string, userId: string, expectedUpdatedAt: string, voiceId: string) {
    if (this.generating.has(sceneId)) throw AppError.conflict('Narration is already generating for this scene');
    const scene = await sceneService.getSceneById(sceneId, userId, true);
    if (scene.updatedAt.toISOString() !== expectedUpdatedAt) throw AppError.conflict('Scene changed; reload before generating');
    if (!scene.narration?.trim()) throw AppError.badRequest('Add narration to the storyboard first');
    const providerId = this.narrationProvider(voiceId);
    if (providerId === 'kitten-local') {
      const project = await ProjectModel.findById(scene.projectId);
      if (!project || !/^(en([_-].*)?|english)$/i.test(project.settings.language)) throw AppError.badRequest('Local voices support English only. Use an English project or configure a multilingual narration provider.');
    }
    const board = await StoryboardModel.findOne({ _id: scene.storyboardId, status: 'approved' });
    if (!board) throw AppError.conflict('Approve the current storyboard first');
    if (this.generating.has(sceneId)) throw AppError.conflict('Narration is already generating for this scene');
    this.generating.add(sceneId);
    try {
      const result = await providerManager.execute({ userId, workspaceId: scene.workspaceId.toString(), projectId: scene.projectId.toString(), sceneId,
        capability: 'text-to-speech', input: { text: scene.narration, voiceId, targetDurationSeconds: scene.duration }, options: { providerId, allowFallback: false } });
      const { audio, duration } = result.output || {};
      if (!Buffer.isBuffer(audio) || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 600) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Voice provider returned invalid narration');
      return await this.upload(sceneId, userId, expectedUpdatedAt, 'audio', audio, 'audio/wav', 'scene-' + scene.sceneNumber + '-narration.wav', duration, 'ai-generated', voiceId);
    } finally { this.generating.delete(sceneId); }
  }
  async list(projectId: string, userId: string) {
    const { requireProjectAccess } = await import('../../common/utils/access.js');
    await requireProjectAccess(projectId, userId);
    return MediaAssetModel.find({ projectId, status: 'ready' }).select('-storageKey');
  }
  async change(sceneId: string, userId: string, expectedUpdatedAt: string, action: (scene: ISceneDocument, session: mongoose.ClientSession) => Promise<void>, remember = true) {
    await sceneService.getSceneById(sceneId, userId, true);
    let pruned: mongoose.Types.ObjectId[] = [];
    const updated = await mongoose.connection.transaction(async session => {
      const scene = await SceneModel.findById(sceneId).session(session);
      if (!scene || scene.updatedAt.toISOString() !== expectedUpdatedAt) throw AppError.conflict('Scene changed; reload before saving media');
      const project = await ProjectModel.findOne({ _id: scene.projectId, storyboardId: scene.storyboardId, deletedAt: null }).session(session);
      const board = await StoryboardModel.findOne({ _id: scene.storyboardId, status: 'approved' }).session(session);
      if (!project || !board) throw AppError.conflict('Approve the current storyboard before adding media');
      if (remember) {
        const history = [...(scene.editHistory || []), snapshotScene(scene)];
        const discarded = [...history.slice(0, -10), ...(scene.editRedo || [])];
        pruned = discarded.flatMap(item => [...item.visualAssetIds, ...(item.voiceAssetId ? [item.voiceAssetId] : [])]);
        scene.editHistory = history.slice(-10); scene.editRedo = [];
      }
      await action(scene, session);
      scene.status = 'draft';
      await scene.save({ session });
      // Serialize media changes against storyboard edits/regeneration.
      board.markModified('status'); await board.save({ session });
      project.finalVideoAssetId = null; project.markModified('finalVideoAssetId'); await project.save({ session });
      return scene;
    });
    await this.discard(pruned).catch(() => {});
    return updated;
  }
  async upload(sceneId: string, userId: string, expectedUpdatedAt: string, kind: 'visual' | 'audio', bytes: Buffer, mimeType: string, name: string, duration?: number, source: 'upload' | 'ai-generated' = 'upload', voiceId?: string) {
    const current = await sceneService.getSceneById(sceneId, userId, true);
    const generatedVideo = source === 'ai-generated' && kind === 'visual' && mimeType === 'video/mp4';
    const type = validateMediaBytes(bytes, mimeType, kind, generatedVideo);
    if (type !== 'image' && (!duration || !Number.isFinite(duration) || duration <= 0 || (!generatedVideo && duration > 600))) throw AppError.badRequest('A playable audio or video file with valid duration is required');
    // Narration is always the exact length of its scene, whether it was recorded, uploaded or synthesized.
    let storedBytes = bytes; let storedMime = mimeType; let storedDuration = duration;
    if (kind === 'audio') {
      const fitted = await fitAudioDuration(bytes, mimeType, current.duration);
      storedBytes = fitted.audio; storedMime = fitted.mimeType; storedDuration = fitted.duration;
    }
    const storageKey = randomUUID();
    const filePath = path.join(mediaDirectory, storageKey);
    await mkdir(mediaDirectory, { recursive: true });
    await writeFile(filePath, storedBytes, { flag: 'wx' });
    let previous: mongoose.Types.ObjectId[] = [];
    let scene: ISceneDocument;
    try {
      scene = await this.change(sceneId, userId, expectedUpdatedAt, async (scene, session) => {
        previous = [...scene.visualAssetIds, ...(scene.voiceAssetId ? [scene.voiceAssetId] : [])];
        const [asset] = await MediaAssetModel.create([{ workspaceId: scene.workspaceId, projectId: scene.projectId, sceneId: scene._id,
          uploadedBy: userId, name, type, mimeType: storedMime, size: storedBytes.length, duration: storedDuration, storageProvider: 'local', storageKey, source, status: 'ready' }], { session });
        if (kind === 'visual') { scene.visualAssetIds = [asset._id as mongoose.Types.ObjectId]; scene.motionGraphics = []; scene.editing = { ...scene.editing, visualMode: 'clip', clipStart: 0, clipEnd: null }; }
        else { scene.voiceAssetId = asset._id as mongoose.Types.ObjectId; scene.narrationOptional = false; if (voiceId) scene.editing = { ...scene.editing, voiceId }; }
      });
    } catch (error) { await unlink(filePath).catch(() => {}); throw error; }
    // Replaced media is no longer referenced by this scene; delete it unless another scene shares it.
    await this.discard(previous).catch(() => {});
    return scene;
  }
  async settings(sceneId: string, userId: string, body: { expectedUpdatedAt: string; narrationOptional?: boolean; visualFit?: 'cover' | 'contain'; remove?: 'visual' | 'audio' }) {
    const removed: mongoose.Types.ObjectId[] = [];
    const scene = await this.change(sceneId, userId, body.expectedUpdatedAt, async scene => {
      if (body.narrationOptional !== undefined) scene.narrationOptional = body.narrationOptional;
      if (body.visualFit) scene.visualFit = body.visualFit;
      if (body.remove === 'visual') { removed.push(...scene.visualAssetIds); scene.visualAssetIds = []; scene.motionGraphics = []; }
      if (body.remove === 'audio' && scene.voiceAssetId) { removed.push(scene.voiceAssetId); scene.voiceAssetId = null; }
    });
    await this.discard(removed);
    return scene;
  }
  // Removed or replaced media is deleted only when no other scene still uses it.
  private async discard(ids: mongoose.Types.ObjectId[]) {
    if (!ids.length) return;
    const otherScenes = await SceneModel.find({ $or: [{ visualAssetIds: { $in: ids } }, { voiceAssetId: { $in: ids } }, { 'editHistory.visualAssetIds': { $in: ids } }, { 'editHistory.voiceAssetId': { $in: ids } }, { 'editRedo.visualAssetIds': { $in: ids } }, { 'editRedo.voiceAssetId': { $in: ids } }] }).select('visualAssetIds voiceAssetId editHistory editRedo');
    const shared = new Set(otherScenes.flatMap(scene => [scene, ...(scene.editHistory || []), ...(scene.editRedo || [])].flatMap(state => [...state.visualAssetIds.map(String), ...(state.voiceAssetId ? [String(state.voiceAssetId)] : [])])));
    const assets = await MediaAssetModel.find({ _id: { $in: ids.filter(id => !shared.has(id.toString())) } });
    if (!assets.length) return;
    await MediaAssetModel.deleteMany({ _id: { $in: assets.map(asset => asset._id) } });
    for (const asset of assets) if (/^[a-f0-9-]{36}$/.test(asset.storageKey)) await unlink(path.join(mediaDirectory, asset.storageKey)).catch(() => {});
  }
}
export const mediaService = new MediaService();
