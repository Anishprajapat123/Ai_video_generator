import mongoose from 'mongoose';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, copyFile, stat, unlink, rm } from 'node:fs/promises';
import { GenerationJobModel, type IGenerationJobDocument } from '../../database/models/GenerationJob.model.js';
import { StoryboardModel } from '../../database/models/Storyboard.model.js';
import { SceneModel } from '../../database/models/Scene.model.js';
import { ProjectModel } from '../../database/models/Project.model.js';
import { MediaAssetModel } from '../../database/models/MediaAsset.model.js';
import { requireProjectAccess } from '../../common/utils/access.js';
import { AppError } from '../../common/errors/app-error.js';
import { visualMotionFitsDuration } from '@ai-video-studio/shared-types';
import { mediaDirectory } from './media.service.js';

const jobType = 'project-video-render';
const root = path.resolve(__dirname, '../../../../..');
const timeout = 30 * 60 * 1000;
const dto = (job: IGenerationJobDocument | null) => job ? { _id: job.id, status: job.status, progress: job.progress, error: job.error, assetId: job.outputAssetIds[0]?.toString() } : null;
export class VideoRenderService {
  async latest(projectId: string, userId: string) {
    await requireProjectAccess(projectId, userId);
    await GenerationJobModel.updateMany({ jobType, status: 'processing', expiresAt: { $lt: new Date() } }, { $set: { status: 'failed', error: 'The video worker stopped or timed out. Generate again.', completedAt: new Date() }, $unset: { resourceKey: 1 } });
    return dto(await GenerationJobModel.findOne({ projectId, jobType }).sort({ createdAt: -1 }));
  }
  async start(projectId: string, userId: string) {
    await this.latest(projectId, userId);
    const project = await requireProjectAccess(projectId, userId, true);
    const board = await StoryboardModel.findOne({ _id: project.storyboardId, projectId, status: 'approved' });
    if (!board) throw AppError.conflict('Approve the current storyboard before exporting');
    const scenes = await SceneModel.find({ projectId, storyboardId: board._id }).sort({ sceneNumber: 1 });
    const ids = scenes.flatMap(scene => [...scene.visualAssetIds, ...(scene.narrationOptional || !scene.voiceAssetId ? [] : [scene.voiceAssetId])]);
    const assets = await MediaAssetModel.find({ _id: { $in: ids }, projectId, workspaceId: project.workspaceId, status: 'ready', storageProvider: 'local' });
    const total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
    if (!scenes.length || total > 600) throw AppError.badRequest('Export requires scenes totaling at most 600 seconds');
    for (const scene of scenes) {
      if (scene.editing?.visualPlan && !visualMotionFitsDuration(scene.editing.visualPlan, scene.duration)) throw AppError.badRequest('Scene keyframes must fit inside its duration before exporting');
      const visual = assets.find(asset => scene.visualAssetIds.some(id => id.equals(asset._id as mongoose.Types.ObjectId)) && asset.type === 'video');
      const audio = assets.find(asset => scene.voiceAssetId?.equals(asset._id as mongoose.Types.ObjectId) && asset.type === 'audio');
      // The scene duration is the single source of truth: clips play once and narration is fitted to it exactly.
      const explainer = scene.editing?.visualMode !== 'clip' && scene.motionGraphics.some(item => item.type === 'remotion-explainer' && Array.isArray(item.properties.points) && item.properties.points.length > 0);
      const hasClip = scene.editing?.visualMode !== 'remotion' && Boolean(visual);
      if ((!hasClip && !explainer) || (!scene.narrationOptional && (!audio || typeof audio.duration !== 'number' || Math.abs(audio.duration - scene.duration) > 0.05))) throw AppError.badRequest('Complete every scene and fit its narration before exporting');
      if (!explainer && visual?.duration && ((scene.editing?.clipStart || 0) >= visual.duration || (scene.editing?.clipEnd !== undefined && scene.editing.clipEnd !== null && scene.editing.clipEnd > visual.duration + .01))) throw AppError.badRequest('Trim points must stay inside the saved clip');
    }
    for (const asset of assets) if (!/^[a-f0-9-]{36}$/.test(asset.storageKey)) throw AppError.badRequest('A scene asset is unavailable');
    await GenerationJobModel.collection.createIndex({ resourceKey: 1 }, { unique: true, partialFilterExpression: { resourceKey: { $type: 'string' } } });
    let job;
    try { job = await GenerationJobModel.create({ workspaceId: project.workspaceId, projectId, requestedBy: userId, providerId: 'remotion', capability: 'video-composition', jobType, status: 'processing', progress: 0, resourceKey: 'local-video-render', startedAt: new Date(), expiresAt: new Date(Date.now() + timeout + 60000), attempts: 1, maxAttempts: 1 }); }
    catch (error) { if ((error as { code?: number }).code === 11000) throw AppError.conflict('A video is already rendering. Wait for it to finish.'); throw error; }
    const input = JSON.stringify({ project, scenes, assets, mediaDirectory });
    void this.run(job.id, projectId, userId, project.updatedAt.toISOString(), board.id, board.__v, input);
    return dto(job);
  }
  private async run(jobId: string, projectId: string, userId: string, revision: string, boardId: string, boardVersion: number, input: string) {
    const folder = path.resolve(mediaDirectory, '..', 'renders', jobId);
    const key = randomUUID(); const destination = path.join(mediaDirectory, key);
    try {
      await mkdir(folder, { recursive: true }); await writeFile(path.join(folder, 'input.json'), input, { flag: 'wx' });
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/render-final-video.ts'), folder], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let lines = ''; let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill(); }, timeout);
        child.stdout.on('data', chunk => { lines += chunk.toString(); const parts = lines.split('\n'); lines = parts.pop() || ''; for (const line of parts) { try { const value = JSON.parse(line).progress; if (Number.isFinite(value)) void GenerationJobModel.updateOne({ _id: jobId, status: 'processing' }, { $max: { progress: Math.min(95, Math.max(0, value)) } }).catch(() => {}); } catch {} } });
        let diagnostics = '';
        child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-6000); });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', code => { clearTimeout(timer); if (code === 0 && !timedOut) resolve(); else { console.error('Local video renderer failed:', diagnostics); reject(new Error('Local renderer failed')); } });
      });
      const result = JSON.parse(await readFile(path.join(folder, 'result.json'), 'utf8'));
      await mkdir(mediaDirectory, { recursive: true }); await copyFile(path.join(folder, 'output.mp4'), destination);
      const file = await stat(destination);
      await requireProjectAccess(projectId, userId, true);
      await mongoose.connection.transaction(async session => {
        const project = await ProjectModel.findOne({ _id: projectId, deletedAt: null, storyboardId: boardId }).session(session);
        const board = await StoryboardModel.findOne({ _id: boardId, status: 'approved', __v: boardVersion }).session(session);
        const job = await GenerationJobModel.findOne({ _id: jobId, status: 'processing' }).session(session);
        if (!project || !board || !job || project.updatedAt.toISOString() !== revision) throw AppError.conflict('Your project changed during export. Generate the current version again.');
        const [asset] = await MediaAssetModel.create([{ workspaceId: project.workspaceId, projectId, uploadedBy: userId, name: 'generated-video.mp4', type: 'video', mimeType: 'video/mp4', size: file.size, width: result.width, height: result.height, duration: result.duration, storageProvider: 'local', storageKey: key, source: 'remotion-generated', status: 'ready' }], { session });
        project.finalVideoAssetId = asset._id as mongoose.Types.ObjectId; project.status = 'completed'; await project.save({ session });
        job.status = 'completed'; job.progress = 100; job.outputAssetIds = [asset._id as mongoose.Types.ObjectId]; job.completedAt = new Date(); job.resourceKey = undefined; await job.save({ session });
      });
    } catch (error) {
      await unlink(destination).catch(() => {});
      await GenerationJobModel.updateOne({ _id: jobId }, { $set: { status: 'failed', error: error instanceof AppError ? error.message : 'Local video export failed. Check the renderer installation and try again.', completedAt: new Date() }, $unset: { resourceKey: 1 } }).catch(() => {});
    } finally {
      const renderRoot = path.resolve(mediaDirectory, '..', 'renders');
      if (/^[a-f0-9]{24}$/.test(jobId) && path.dirname(folder) === renderRoot) await rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }
}
export const videoRenderService = new VideoRenderService();
