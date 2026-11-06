// Attach an already downloaded Flow clip without submitting another generation.
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../apps/backend/dist/config/env.js';
import { GenerationJobModel } from '../apps/backend/dist/database/models/GenerationJob.model.js';
import { SceneModel } from '../apps/backend/dist/database/models/Scene.model.js';
import { mediaService } from '../apps/backend/dist/modules/media/media.service.js';
import { readFlowClip } from '../apps/backend/dist/modules/providers/adapters/flow-local.adapter.js';

const [jobId, file] = process.argv.slice(2);
if (!mongoose.isValidObjectId(jobId) || !file) throw new Error('Usage: node scripts/recover-flow-video.mjs JOB_ID DOWNLOADED_MP4');
await mongoose.connect(env.MONGODB_URI);
try {
  const job = await GenerationJobModel.findOne({ _id: jobId, providerId: 'flow-local', jobType: 'scene-hosted-video' });
  if (!job?.sceneId || !job.projectId || !job.externalJobId) throw new Error('Saved Flow scene job not found');
  if (job.status === 'completed') { console.log('Clip already attached; no changes made.'); }
  else {
    if (job.status !== 'failed') throw new Error('Wait for the existing job to finish before recovery');
    const directory = path.resolve('storage/flow-output', 'studio-' + job.projectId.toString());
    const target = path.resolve(file);
    if (path.dirname(target) !== directory) throw new Error('Clip does not belong to this project output folder');
    const scene = await SceneModel.findOne({ _id: job.sceneId, projectId: job.projectId });
    if (!scene || !job.startedAt) throw new Error('Scene not found');
    const expected = job.inputReference?.expectedUpdatedAt;
    if (expected ? scene.updatedAt.toISOString() !== expected : scene.updatedAt > job.startedAt) throw new Error('Scene changed since generation; review it before importing this clip');
    const clip = await readFlowClip(target);
    const updated = await mediaService.upload(scene.id, job.requestedBy.toString(), scene.updatedAt.toISOString(), 'visual', clip.video, 'video/mp4', 'generated-scene-video.mp4', clip.duration, 'ai-generated');
    await GenerationJobModel.updateOne({ _id: job.id, status: 'failed' }, { $set: { status: 'completed', progress: 100, outputAssetIds: updated.visualAssetIds, error: null, completedAt: new Date() }, $unset: { resourceKey: 1 } });
    console.log(JSON.stringify({ recovered: true, sceneId: scene.id, bytes: clip.video.length, duration: clip.duration, newGenerations: 0 }));
  }
} finally { await mongoose.disconnect(); }
