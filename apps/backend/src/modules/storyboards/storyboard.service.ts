import mongoose from 'mongoose';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { ScriptModel } from '../../database/models/Script.model.js';
import { SceneModel } from '../../database/models/Scene.model.js';
import { ProjectModel } from '../../database/models/Project.model.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';
import { wordsPerSecond } from '../providers/pacing.js';

// Estimate how long the narration actually takes to speak so the scene video is never shorter than its voice.
function spokenSeconds(text: string, language?: string) {
  const words = text.split(/\s+/u).filter(Boolean).length;
  return words / wordsPerSecond(language);
}

export class StoryboardService {
  async generateStoryboardFromScript(projectId: string, scriptId: string, userId: string, reuseExisting = false) {
    await requireProjectAccess(projectId, userId, true);
    return mongoose.connection.transaction(async session => {
      const project = await ProjectModel.findOne({ _id: projectId, deletedAt: null }).session(session);
      if (!project) throw AppError.notFound('Project not found');
      const script = await ScriptModel.findOne({ _id: scriptId, projectId, workspaceId: project.workspaceId }).session(session);
      if (!script) throw AppError.notFound('Script not found in this project');
      if (script.status !== 'approved') throw AppError.conflict('Approve the script before creating a storyboard');
      if (project.scriptId?.toString() !== scriptId) throw AppError.conflict('Only the current script can create a storyboard');
      if (!script.sections.length) throw AppError.badRequest('Script has no sections');
      if (reuseExisting && project.storyboardId) {
        const existing = await StoryboardModel.findOne({ _id: project.storyboardId, scriptId, status: { $ne: 'superseded' } }).session(session);
        if (existing) return existing;
      }
      const latest = await StoryboardModel.findOne({ projectId }).sort({ version: -1 }).session(session);
      const sceneIds = script.sections.map(() => new mongoose.Types.ObjectId());
      const summaries = script.sections.map((section, index) => ({
        sceneId: sceneIds[index].toString(), title: section.heading,
        description: section.visualSuggestion || 'Visual representation of ' + section.heading,
        // New scenes share a fixed ten-second timeline; narration is fitted to that timeline.
        duration: 10,
        order: index + 1, visualType: 'animation' as const, transition: 'fade',
      }));
      const totalDuration = summaries.reduce((sum, scene) => sum + scene.duration, 0);
      const storyboard = new StoryboardModel({ workspaceId: project.workspaceId, projectId, scriptId,
        version: (latest?.version || 0) + 1, title: project.title + ' - Storyboard', scenes: summaries, totalDuration, status: 'draft' });
      await storyboard.save({ session });
      let startTime = 0;
      await SceneModel.insertMany(summaries.map((scene, index) => {
        const start = startTime;
        startTime += scene.duration;
        return { _id: sceneIds[index], workspaceId: project.workspaceId, projectId, storyboardId: storyboard._id,
          sceneNumber: index + 1, title: scene.title, duration: scene.duration, narration: script.sections[index].narration,
          visualDescription: scene.description, visualAssetIds: [],
          motionGraphics: [],
          timeline: { startTime: start, endTime: startTime }, transition: { type: 'fade', duration: Math.min(1, scene.duration) }, status: 'draft' };
      }), { session });
      // Keep old scenes and boards as recoverable content; list endpoints use the active board.
      await StoryboardModel.updateMany({ projectId, _id: { $ne: storyboard._id } }, { $set: { status: 'superseded' } }, { session });
      project.storyboardId = storyboard._id;
      project.settings.duration = totalDuration;
      project.status = 'draft';
      project.finalVideoAssetId = null;
      await project.save({ session });
      return storyboard;
    });
  }
  async getStoryboard(storyboardId: string, userId: string, write = false) {
    const storyboard = await StoryboardModel.findById(storyboardId);
    if (!storyboard) throw AppError.notFound('Storyboard not found');
    await requireProjectAccess(storyboard.projectId.toString(), userId, write);
    return storyboard;
  }
  async approveStoryboard(storyboardId: string, userId: string, expectedRevision?: number) {
    const board = await this.getStoryboard(storyboardId, userId, true);
    return mongoose.connection.transaction(async session => {
      const current = await StoryboardModel.findById(storyboardId).session(session);
      const project = await ProjectModel.findOne({ _id: board.projectId, deletedAt: null }).session(session);
      if (!current || !project || project.storyboardId?.toString() !== storyboardId || current.status === 'superseded') throw AppError.conflict('Only the current storyboard can be approved');
      if (expectedRevision !== undefined && (current.get('__v') || 0) !== expectedRevision) throw AppError.conflict('Storyboard changed in another session; reload before approving');
      current.status = 'approved';
      await current.save({ session });
      project.status = 'ready';
      await project.save({ session });
      return current;
    });
  }
}
export const storyboardService = new StoryboardService();
