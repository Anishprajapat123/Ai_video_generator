import mongoose from 'mongoose';
import { ScriptModel } from '../../database/models/Script.model.js';
import { ProjectModel } from '../../database/models/Project.model.js';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { providerManager } from '../providers/provider.manager.js';
import { scriptOutputSchema } from '../providers/output.schemas.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';

export class ScriptService {
  async generateScript(projectId: string, userId: string, params: { prompt: string; language?: string; tone?: string; targetAudience?: string; providerId?: string }) {
    const initial = await requireProjectAccess(projectId, userId, true);
    const response = await providerManager.execute({ userId, workspaceId: initial.workspaceId.toString(), projectId, capability: 'llm',
      input: { task: 'script-generation', prompt: params.prompt, language: params.language || initial.settings.language,
        tone: params.tone || 'educational', targetAudience: params.targetAudience || 'general', duration: initial.settings.duration, style: initial.settings.style },
      options: { providerId: params.providerId } });
    const parsed = scriptOutputSchema.safeParse(response.output);
    if (response.status !== 'completed' || !parsed.success) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'AI returned an invalid script');
    // External calls happen outside the short database transaction.
    await requireProjectAccess(projectId, userId, true);
    return mongoose.connection.transaction(async session => {
      const project = await ProjectModel.findOne({ _id: projectId, deletedAt: null }).session(session);
      if (!project) throw AppError.notFound('Project not found');
      if (project.updatedAt.getTime() !== initial.updatedAt.getTime()) throw AppError.conflict('Project changed during generation; retry with the latest settings');
      const latest = await ScriptModel.findOne({ projectId }).sort({ version: -1 }).session(session);
      const output = parsed.data;
      const script = new ScriptModel({ workspaceId: project.workspaceId, projectId, version: (latest?.version || 0) + 1,
        ...output, language: params.language || project.settings.language, tone: params.tone || 'educational', targetAudience: params.targetAudience || 'general',
        totalWordCount: output.sections.reduce((sum, s) => sum + s.narration.split(/\s+/u).filter(Boolean).length, 0),
        estimatedDuration: output.sections.reduce((sum, s) => sum + s.estimatedDuration, 0), status: 'draft',
        providerMetadata: { providerId: response.providerId, model: response.model || 'default' }, createdBy: userId });
      await script.save({ session });
      await ScriptModel.updateMany({ projectId, _id: { $ne: script._id } }, { $set: { status: 'superseded' } }, { session });
      await StoryboardModel.updateMany({ projectId }, { $set: { status: 'superseded' } }, { session });
      project.scriptId = script._id;
      project.storyboardId = null;
      project.finalVideoAssetId = null;
      project.status = 'draft';
      await project.save({ session });
      return script;
    });
  }
  async getScriptById(scriptId: string, userId: string, write = false) {
    const script = await ScriptModel.findById(scriptId);
    if (!script) throw AppError.notFound('Script not found');
    await requireProjectAccess(script.projectId.toString(), userId, write);
    return script;
  }
  async updateScript(scriptId: string, userId: string, input: {
    title: string; sections: import('../../database/models/Script.model.js').IScriptSection[]; expectedRevision: number;
  }) {
    const original = await this.getScriptById(scriptId, userId, true);
    const content = scriptOutputSchema.parse(input);
    return mongoose.connection.transaction(async session => {
      let script = await ScriptModel.findById(scriptId).session(session);
      const project = await ProjectModel.findOne({ _id: original.projectId, deletedAt: null }).session(session);
      if (!script || !project || project.scriptId?.toString() !== scriptId || script.status === 'superseded') throw AppError.conflict('Only the current script can be edited');
      if ((script.get('__v') || 0) !== input.expectedRevision) throw AppError.conflict('Script changed in another session. Reload before saving.');
      if (script.status === 'approved') {
        // Approved content remains recoverable; editing creates a new draft version.
        const previous = script;
        const latest = await ScriptModel.findOne({ projectId: project._id }).sort({ version: -1 }).session(session);
        script = new ScriptModel({ workspaceId: previous.workspaceId, projectId: previous.projectId,
          version: (latest?.version || previous.version) + 1, language: previous.language, tone: previous.tone,
          targetAudience: previous.targetAudience, providerMetadata: previous.providerMetadata, createdBy: userId });
        previous.status = 'superseded';
        await previous.save({ session });
      }
      script.title = content.title;
      script.sections = content.sections;
      script.totalWordCount = content.sections.reduce((sum, section) => sum + section.narration.split(/\s+/u).filter(Boolean).length, 0);
      script.estimatedDuration = content.sections.reduce((sum, section) => sum + section.estimatedDuration, 0);
      script.status = 'draft';
      await script.save({ session });
      await StoryboardModel.updateMany({ projectId: project._id }, { $set: { status: 'superseded' } }, { session });
      project.scriptId = script._id;
      project.storyboardId = null;
      project.finalVideoAssetId = null;
      project.status = 'draft';
      project.markModified('scriptId');
      await project.save({ session });
      return script;
    });
  }
  async approveScript(scriptId: string, userId: string, expectedRevision?: number) {
    const original = await this.getScriptById(scriptId, userId, true);
    return mongoose.connection.transaction(async session => {
      const script = await ScriptModel.findById(scriptId).session(session);
      const project = await ProjectModel.findOne({ _id: original.projectId, deletedAt: null }).session(session);
      if (!script || !project || project.scriptId?.toString() !== scriptId || script.status === 'superseded') throw AppError.conflict('Only the current script can be approved');
      if (expectedRevision !== undefined && (script.get('__v') || 0) !== expectedRevision) throw AppError.conflict('Script changed in another session. Reload before approving.');
      scriptOutputSchema.parse({ title: script.title, sections: script.sections });
      script.status = 'approved';
      await script.save({ session });
      project.markModified('scriptId');
      await project.save({ session });
      return script;
    });
  }
}
export const scriptService = new ScriptService();
