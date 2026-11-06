import mongoose from 'mongoose';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { env } from '../apps/backend/dist/config/env.js';
import { ProjectModel } from '../apps/backend/dist/database/models/Project.model.js';
import { ScriptModel } from '../apps/backend/dist/database/models/Script.model.js';
import { GenerationJobModel } from '../apps/backend/dist/database/models/GenerationJob.model.js';
import { MediaAssetModel } from '../apps/backend/dist/database/models/MediaAsset.model.js';
import { projectService } from '../apps/backend/dist/modules/projects/project.service.js';
import { storyboardService } from '../apps/backend/dist/modules/storyboards/storyboard.service.js';
import { mediaBatchService } from '../apps/backend/dist/modules/media/media-batch.service.js';

// A clearly named sample project, built from a curated script with local voices/graphics only.
const baseId = process.argv[2];
if (!mongoose.isValidObjectId(baseId)) throw new Error('Pass an existing project ID to choose its owner/workspace');
const manifest = 'storage/verification/polished-demo-' + baseId + '.json';
await mongoose.connect(env.MONGODB_URI);
try {
  const base = await ProjectModel.findOne({ _id: baseId, deletedAt: null });
  if (!base) throw new Error('Workspace reference project not found');
  let prior;
  try { prior = JSON.parse(await readFile(manifest, 'utf8')); } catch {}
  if (prior && await ProjectModel.exists({ _id: prior.projectId, workspaceId: base.workspaceId, ownerId: base.ownerId, deletedAt: null })) {
    console.log(JSON.stringify({ reused: true, ...prior }));
  } else {
    const sections = [
      { sectionId: 'light', heading: 'Energy from sunlight', narration: 'Sunlight carries energy from the sun. When these rays reach a solar panel, its silicon cells absorb the light and begin producing electricity.', visualSuggestion: 'Animate light rays travelling from the sun to a solar panel.', order: 1, estimatedDuration: 10 },
      { sectionId: 'cells', heading: 'Inside the solar cell', narration: 'Inside each solar cell, absorbed light frees electrons. Their movement creates direct current, which travels through wires toward an inverter for conversion.', visualSuggestion: 'Show moving electrons across solar panel cells and along a circuit.', order: 2, estimatedDuration: 10 },
      { sectionId: 'home', heading: 'Powering your home', narration: 'The inverter changes direct current into alternating current. This electricity can power household lights and appliances, helping a home use energy from sunlight.', visualSuggestion: 'Animate power flowing from a solar panel into a house, lighting its windows.', order: 3, estimatedDuration: 10 },
    ];
    const userId = base.ownerId.toString();
    const project = await projectService.createProject(base.workspaceId.toString(), userId, { title: 'Solar energy · 30-second demo', creationType: 'prompt', settings: { duration: 30, fps: 30, aspectRatio: '16:9', language: 'en', subtitlesEnabled: true } });
    const script = await ScriptModel.create({ workspaceId: base.workspaceId, projectId: project._id, createdBy: base.ownerId, version: 1, title: project.title, language: 'en', tone: 'educational', targetAudience: 'General audience', sections, totalWordCount: sections.reduce((sum, item) => sum + item.narration.split(/\s+/u).length, 0), estimatedDuration: 30, status: 'approved' });
    project.scriptId = script._id; await project.save();
    const board = await storyboardService.generateStoryboardFromScript(project.id, script.id, userId);
    await storyboardService.approveStoryboard(board.id, userId);
    const batch = await mediaBatchService.start(project.id, userId, { storyboardId: board.id, voiceId: 'piper-english', providerId: 'remotion', maxCredits: 0, autoExport: true });
    const info = { projectId: project.id, storyboardId: board.id, batchId: batch.id, studioPath: '/storyboards/' + board.id + '/media' };
    await mkdir('storage/verification', { recursive: true }); await writeFile(manifest, JSON.stringify(info));
    console.log(JSON.stringify({ created: true, ...info }));
    let last = '';
    for (;;) {
      const current = await GenerationJobModel.findById(batch.id);
      const rendering = current?.inputReference?.exportJobId ? await GenerationJobModel.findById(current.inputReference.exportJobId) : null;
      const state = JSON.stringify({ scenes: current?.status, mediaProgress: current?.progress, export: rendering?.status, exportProgress: rendering?.progress });
      if (state !== last) { console.log(state); last = state; }
      if (current?.status === 'failed') throw new Error(current.error || 'Sample generation failed');
      if (rendering?.status === 'failed') throw new Error(rendering.error || 'Sample export failed');
      if (rendering?.status === 'completed') {
        const asset = await MediaAssetModel.findById(rendering.outputAssetIds[0]);
        const complete = { ...info, assetId: asset.id, duration: asset.duration, downloadPath: '/api/v1/media/' + asset.id + '/download', storageKey: asset.storageKey };
        await writeFile(manifest, JSON.stringify(complete)); console.log(JSON.stringify({ complete: true, ...complete })); break;
      }
      await delay(500);
    }
  }
} finally { await mongoose.disconnect(); }
