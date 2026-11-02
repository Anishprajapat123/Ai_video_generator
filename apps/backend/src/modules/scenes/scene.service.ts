import mongoose from 'mongoose';
import { SceneModel, ISceneDocument } from '../../database/models/Scene.model.js';
import { ProjectModel } from '../../database/models/Project.model.js';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { providerManager } from '../providers/provider.manager.js';
import { sceneRewriteSchema } from '../providers/output.schemas.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';

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
      if (expectedUpdatedAt && scene.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw AppError.conflict('Scene changed during generation; retry with the latest content');
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
  async regenerateScene(sceneId: string, userId: string, instructions?: { narration?: string; visual?: string; providerId?: string }) {
    const scene = await this.getSceneById(sceneId, userId, true);
    if (!instructions?.narration && !instructions?.visual) throw AppError.badRequest('Provide narration or visual instructions');
    const response = await providerManager.execute({ userId, workspaceId: scene.workspaceId.toString(), projectId: scene.projectId.toString(), sceneId,
      capability: 'llm', input: { task: 'scene-rewrite', narration: scene.narration, visualDescription: scene.visualDescription, instructions },
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
