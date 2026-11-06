import mongoose from 'mongoose';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { SceneModel, ISceneDocument } from '../../database/models/Scene.model.js';
import { ProjectModel } from '../../database/models/Project.model.js';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { MediaAssetModel } from '../../database/models/MediaAsset.model.js';
import { GenerationJobModel } from '../../database/models/GenerationJob.model.js';
import { providerManager } from '../providers/provider.manager.js';
import { sceneRewriteSchema } from '../providers/output.schemas.js';
import { maxWordsFor } from '../providers/pacing.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';
import { mediaDirectory } from '../../common/utils/storage.js';

export type SceneUpdates = Pick<Partial<ISceneDocument>, 'title' | 'narration' | 'visualDescription' | 'duration' | 'transition' | 'motionGraphics'>;
export class SceneService {
  async listProjectScenes(projectId: string, userId: string) {
    const project = await requireProjectAccess(projectId, userId);
    if (!project.storyboardId) return [];
    return SceneModel.find({ projectId, storyboardId: project.storyboardId }).sort({ sceneNumber: 1 });
  }
  async getSceneById(sceneId: string, userId: string, write = false) {
    const scene = await SceneModel.findById(sceneId);
    if (!scene) throw AppError.notFound('Scene not found');
    const project = await requireProjectAccess(scene.projectId.toString(), userId, write);
    if (write && project.storyboardId?.toString() !== scene.storyboardId?.toString()) throw AppError.conflict('Historical scenes cannot be edited');
    return scene;
  }
  async updateScene(sceneId: string, userId: string, updates: SceneUpdates, expectedUpdatedAt?: Date) {
    const original = await this.getSceneById(sceneId, userId, true);
    return mongoose.connection.transaction(async session => {
      const scene = await SceneModel.findById(sceneId).session(session);
      const project = await ProjectModel.findOne({ _id: original.projectId, deletedAt: null }).session(session);
      if (!scene || !project || project.storyboardId?.toString() !== scene.storyboardId?.toString()) throw AppError.conflict('Scene is no longer current');
      if (expectedUpdatedAt && scene.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw AppError.conflict('Scene changed in another session; reload before saving');
      for (const key of ['title', 'narration', 'visualDescription', 'duration', 'transition', 'motionGraphics'] as const) {
        if (updates[key] !== undefined) (scene as unknown as Record<string, unknown>)[key] = updates[key];
      }
      if (scene.transition.duration > scene.duration) throw AppError.badRequest('Transition cannot exceed scene duration');
      if (updates.narration !== undefined && updates.narration !== original.narration) { scene.voiceAssetId = null; scene.subtitleId = null; }
      if (updates.visualDescription !== undefined && updates.visualDescription !== original.visualDescription) scene.visualAssetIds = [];
      scene.status = 'draft';
      await scene.save({ session });
      const scenes = await SceneModel.find({ projectId: project._id, storyboardId: project.storyboardId }).sort({ sceneNumber: 1 }).session(session);
      let time = 0;
      for (const item of scenes) {
        item.timeline = { startTime: time, endTime: time + item.duration };
        time += item.duration;
        await item.save({ session });
      }
      if (time > 600) throw AppError.badRequest('Project exceeds the 600 second limit');
      const board = await StoryboardModel.findById(project.storyboardId).session(session);
      if (!board) throw AppError.conflict('Storyboard is missing');
      board.scenes = scenes.map(s => ({ sceneId: s.id, title: s.title, description: s.visualDescription || s.title,
        duration: s.duration, order: s.sceneNumber, visualType: 'animation' as const, transition: s.transition.type }));
      board.totalDuration = time;
      board.status = 'draft';
      await board.save({ session });
      project.settings.duration = time;
      project.status = 'draft';
      project.finalVideoAssetId = null;
      await project.save({ session });
      return scenes.find(s => s.id === sceneId)!;
    });
  }
  async deleteScene(sceneId: string, userId: string) {
    const original = await this.getSceneById(sceneId, userId, true);
    const busy = await GenerationJobModel.exists({ projectId: original.projectId, status: { $in: ['queued', 'processing'] }, jobType: { $in: ['scene-media-batch', 'project-video-render', 'scene-hosted-video'] } });
    if (busy) throw AppError.conflict('Wait for the current generation or export to finish before deleting a scene');
    const files = await mongoose.connection.transaction(async session => {
      const scene = await SceneModel.findById(sceneId).session(session);
      const project = await ProjectModel.findOne({ _id: original.projectId, deletedAt: null }).session(session);
      if (!scene || !project || project.storyboardId?.toString() !== scene.storyboardId?.toString()) throw AppError.conflict('Scene is no longer current');
      const remaining = await SceneModel.countDocuments({ projectId: project._id, storyboardId: project.storyboardId }).session(session);
      if (remaining <= 1) throw AppError.badRequest('A storyboard needs at least one scene');
      const states = [scene, ...(scene.editHistory || []), ...(scene.editRedo || [])];
      const ids = states.flatMap(state => [...state.visualAssetIds, ...(state.voiceAssetId ? [state.voiceAssetId] : [])]);
      // Assets can be reused by other scenes; only remove media no other scene points at.
      const others = await SceneModel.find({ _id: { $ne: scene._id }, projectId: project._id,
        $or: [{ visualAssetIds: { $in: ids } }, { voiceAssetId: { $in: ids } }, { 'editHistory.visualAssetIds': { $in: ids } }, { 'editHistory.voiceAssetId': { $in: ids } }, { 'editRedo.visualAssetIds': { $in: ids } }, { 'editRedo.voiceAssetId': { $in: ids } }] }).session(session);
      const shared = new Set(others.flatMap(item => [item, ...(item.editHistory || []), ...(item.editRedo || [])].flatMap(state => [...state.visualAssetIds.map(String), ...(state.voiceAssetId ? [String(state.voiceAssetId)] : [])])));
      const assets = await MediaAssetModel.find({ _id: { $in: ids.filter(id => !shared.has(id.toString())) } }).session(session);
      await MediaAssetModel.deleteMany({ _id: { $in: assets.map(asset => asset._id) } }).session(session);
      await SceneModel.deleteOne({ _id: scene._id }).session(session);
      const scenes = await SceneModel.find({ projectId: project._id, storyboardId: project.storyboardId }).sort({ sceneNumber: 1 }).session(session);
      let time = 0;
      for (const [index, item] of scenes.entries()) {
        item.sceneNumber = index + 1;
        item.timeline = { startTime: time, endTime: time + item.duration };
        time += item.duration;
        await item.save({ session });
      }
      const board = await StoryboardModel.findById(project.storyboardId).session(session);
      if (!board) throw AppError.conflict('Storyboard is missing');
      board.scenes = scenes.map(item => ({ sceneId: item.id, title: item.title, description: item.visualDescription || item.title,
        duration: item.duration, order: item.sceneNumber, visualType: 'animation' as const, transition: item.transition.type }));
      board.totalDuration = time;
      board.status = 'draft';
      await board.save({ session });
      project.settings.duration = time;
      project.status = 'draft';
      project.finalVideoAssetId = null;
      await project.save({ session });
      return assets.map(asset => asset.storageKey);
    });
    for (const key of files) if (/^[a-f0-9-]{36}$/.test(key)) await unlink(path.join(mediaDirectory, key)).catch(() => {});
  }
  async regenerateScene(sceneId: string, userId: string, instructions?: { narration?: string; visual?: string; providerId?: string }) {
    const scene = await this.getSceneById(sceneId, userId, true);
    if (!instructions?.narration && !instructions?.visual) throw AppError.badRequest('Provide narration or visual instructions');
    const project = await ProjectModel.findById(scene.projectId).select('settings.language');
    const language = project?.settings.language;
    const response = await providerManager.execute({ userId, workspaceId: scene.workspaceId.toString(), projectId: scene.projectId.toString(), sceneId,
      capability: 'llm', input: { task: 'scene-rewrite', narration: scene.narration, visualDescription: scene.visualDescription, instructions,
        language, durationSeconds: scene.duration, maxWords: maxWordsFor(scene.duration, language) },
      options: { providerId: instructions.providerId } });
    const parsed = sceneRewriteSchema.safeParse(response.output);
    if (response.status !== 'completed' || !parsed.success || (instructions.narration && !parsed.data.narration) || (instructions.visual && !parsed.data.visualDescription)) {
      throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Provider did not return the requested scene changes');
    }
    return this.updateScene(sceneId, userId, {
      ...(instructions.narration ? { narration: parsed.data.narration } : {}),
      ...(instructions.visual ? { visualDescription: parsed.data.visualDescription } : {}),
    }, scene.updatedAt);
  }
}
export const sceneService = new SceneService();
