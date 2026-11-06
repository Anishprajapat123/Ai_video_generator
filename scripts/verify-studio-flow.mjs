import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

// Isolated verification: never use the user's application database or provider keys.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ai_video_studio_flow_test?replicaSet=rs0';
process.env.ENABLE_MOCK_PROVIDER = 'true';
process.env.GEMINI_API_KEY = '';
process.env.GEMINI_MODEL = '';
process.env.FRONTEND_URL = 'http://localhost:3000';
const { createApp } = await import('../apps/backend/dist/app.js');
const { connectDatabase, disconnectDatabase } = await import('../apps/backend/dist/database/connection.js');
const { UserModel } = await import('../apps/backend/dist/database/models/User.model.js');
const { WorkspaceModel } = await import('../apps/backend/dist/database/models/Workspace.model.js');
const { WorkspaceMemberModel } = await import('../apps/backend/dist/database/models/WorkspaceMember.model.js');
const { ProjectModel } = await import('../apps/backend/dist/database/models/Project.model.js');
const { ScriptModel } = await import('../apps/backend/dist/database/models/Script.model.js');
const { SceneModel } = await import('../apps/backend/dist/database/models/Scene.model.js');
const { StoryboardModel } = await import('../apps/backend/dist/database/models/Storyboard.model.js');
const { SessionModel } = await import('../apps/backend/dist/database/models/Session.model.js');
const { UsageRecordModel } = await import('../apps/backend/dist/database/models/UsageRecord.model.js');
const { MediaAssetModel } = await import('../apps/backend/dist/database/models/MediaAsset.model.js');
const { GenerationJobModel } = await import('../apps/backend/dist/database/models/GenerationJob.model.js');
const { mediaDirectory } = await import('../apps/backend/dist/modules/media/media.service.js');
await connectDatabase();
const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const email = `flow-${new mongoose.Types.ObjectId()}@example.test`;
const password = 'Test1234';
const cookies = new Map();
async function call(path, method = 'GET', body) {
  const csrf = method === 'GET' ? undefined : (await call('/auth/csrf')).data.csrfToken;
  const response = await fetch(base + path, { method,
    headers: { Origin: process.env.FRONTEND_URL, Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '),
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [key, ...value] = cookie.split(';')[0].split('='); cookies.set(key, value.join('='));
  }
  return { status: response.status, ...await response.json() };
}
try {
  for (const route of ['/', '/create']) assert.equal((await fetch('http://localhost:3000' + route)).status, 200);
  console.log('PASS: frontend dashboard and Create Video routes respond.');
  const registered = await call('/auth/register', 'POST', { name: 'Flow Test', email, password });
  assert.equal(registered.status, 201);
  assert.equal((await call('/auth/logout', 'POST')).status, 200);
  assert.equal((await call('/auth/login', 'POST', { email, password })).status, 200);
  console.log('PASS: registration and login accept an 8-character password.');
  const workspaceId = (await call('/workspaces')).data.workspaces[0].workspace._id;
  const created = await call(`/workspaces/${workspaceId}/projects`, 'POST', {
    title: 'Solar Energy Explainer', creationType: 'prompt', settings: { duration: 60, aspectRatio: '16:9', language: 'en', style: 'animated-explainer' },
  });
  assert.equal(created.status, 201);
  const projectId = created.data.project._id;
  const generated = await call(`/projects/${projectId}/scripts/generate`, 'POST', {
    prompt: 'Explain solar energy in simple terms for beginners.', providerId: 'mock-ai', language: 'en',
  });
  assert.equal(generated.status, 201);
  assert(generated.data.script.title.startsWith('[MOCK]'));
  assert(generated.data.script.sections.length > 0);
  console.log('PASS: project creation and explicit mock script generation.');
  const edited = await call('/scripts/' + generated.data.script._id, 'PATCH', {
    title: generated.data.script.title,
    sections: generated.data.script.sections.map(section => ({ ...section, narration: section.narration + ' Reviewed.' })),
    expectedRevision: generated.data.script.__v || 0,
  });
  assert.equal(edited.status, 200);
  assert.equal((await call('/scripts/' + edited.data.script._id + '/approve', 'POST', { expectedRevision: generated.data.script.__v || 0 })).status, 409);
  const approved = await call('/scripts/' + edited.data.script._id + '/approve', 'POST', { expectedRevision: edited.data.script.__v || 0 });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.script.status, 'approved');
  assert.equal((await fetch('http://localhost:3000/scripts/' + edited.data.script._id)).status, 200);
  console.log('PASS: Script Review route, draft saving, stale-approval conflict and approval.');
  const planned = await call(`/projects/${projectId}/storyboards/generate`, 'POST', { scriptId: approved.data.script._id, reuseExisting: true });
  assert.equal(planned.status, 201);
  const storyboardId = planned.data.storyboard._id;
  const reused = await call(`/projects/${projectId}/storyboards/generate`, 'POST', { scriptId: approved.data.script._id, reuseExisting: true });
  assert.equal(reused.data.storyboard._id, storyboardId);
  const scene = (await call(`/projects/${projectId}/scenes`)).data.scenes[0];
  const sceneEdit = { title: 'Reviewed introduction', narration: 'A clear introduction to solar energy.', visualDescription: 'An understated diagram of sunlight reaching a solar panel.', duration: 14, transition: { type: 'fade', duration: 1 }, expectedUpdatedAt: scene.updatedAt };
  assert.equal((await call(`/scenes/${scene._id}`, 'PATCH', sceneEdit)).status, 200);
  assert.equal((await call(`/scenes/${scene._id}`, 'PATCH', sceneEdit)).status, 409);
  assert.equal((await call(`/storyboards/${storyboardId}/approve`, 'POST', { expectedRevision: planned.data.storyboard.__v || 0 })).status, 409);
  const latestBoard = (await call(`/storyboards/${storyboardId}`)).data.storyboard;
  const approvedBoard = await call(`/storyboards/${storyboardId}/approve`, 'POST', { expectedRevision: latestBoard.__v || 0 });
  assert.equal(approvedBoard.status, 200);
  assert.equal(approvedBoard.data.storyboard.status, 'approved');
  assert.equal((await fetch('http://localhost:3000/storyboards/' + storyboardId)).status, 200);
  console.log('PASS: Storyboard Review route, reuse, scene editing, stale edits/approval conflicts and storyboard approval.');
  assert.equal((await fetch('http://localhost:3000/storyboards/' + storyboardId + '/media')).status, 200);
  const uploadScene = (await call(`/projects/${projectId}/scenes`)).data.scenes[0];
  const csrfToken = (await call('/auth/csrf')).data.csrfToken;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=', 'base64');
  const upload = await fetch(base + `/scenes/${uploadScene._id}/media?kind=visual`, { method: 'POST', body: png, headers: {
    Origin: process.env.FRONTEND_URL, Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), 'Content-Type': 'image/png',
    'X-CSRF-Token': csrfToken, 'X-Upload-Name': 'test.png', 'X-Scene-Updated-At': uploadScene.updatedAt,
  } });
  assert.equal(upload.status, 200, await upload.clone().text());
  const uploadResult = (await upload.json()).data.scene;
  const assets = (await call(`/projects/${projectId}/media`)).data.assets;
  assert.equal(assets.length, 1);
  const assetResponse = await fetch(base + `/media/${assets[0]._id}/content`, { headers: { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } });
  assert.equal(assetResponse.status, 200);
  assert.deepEqual(Buffer.from(await assetResponse.arrayBuffer()), png);
  assert.equal((await fetch(base + `/media/${assets[0]._id}/content`)).status, 401);
  assert.equal((await call(`/scenes/${uploadScene._id}/media`, 'PATCH', { expectedUpdatedAt: uploadScene.updatedAt, remove: 'visual' })).status, 409);
  assert.equal((await call(`/scenes/${uploadScene._id}/media`, 'PATCH', { expectedUpdatedAt: uploadResult.updatedAt, narrationOptional: true })).status, 200);
  console.log('PASS: Media route, binary upload, protected playback, persisted assignment, stale-write conflict and silent-scene settings.');
  if (process.argv.includes('--local-narration')) {
    const voiceList = await call('/narration/voices');
    assert.equal(voiceList.status, 200); assert(['kitten-local', 'piper-local'].includes(voiceList.data.providerId));
    assert(voiceList.data.voices.length > 0);
    const sample = await fetch(new URL(voiceList.data.voices[0].previewUrl, base), { headers: { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } });
    assert.equal(sample.status, 200);
    const currentScene = (await call(`/scenes/${uploadScene._id}`)).data.scene;
    const narration = await call(`/scenes/${uploadScene._id}/narration/generate`, 'POST', { expectedUpdatedAt: currentScene.updatedAt, voiceId: voiceList.data.voices[0].id });
    assert.equal(narration.status, 200, JSON.stringify(narration));
    assert.equal(narration.data.scene.narrationOptional, false);
    const audioId = narration.data.scene.voiceAssetId;
    const playback = await fetch(base + `/media/${audioId}/content`, { headers: { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } });
    assert.equal(playback.status, 200);
    const narrationBytes = Buffer.from(await playback.arrayBuffer());
    assert.equal(narrationBytes.toString('ascii', 0, 4), 'RIFF');
    assert([1, 2].includes(narrationBytes.readUInt16LE(22)));
    assert(await UsageRecordModel.findOne({ sceneId: uploadScene._id, providerId: voiceList.data.providerId, status: 'success', estimatedCost: 0 }));
    console.log('PASS: Real local voices, protected sample playback, real CPU generation, saved narration, playback and zero API cost accounting.');
  }
  if (process.argv.includes('--render')) {
    const before = await call(`/projects/${projectId}/video-render`, 'POST', {});
    assert.equal(before.status, 400, JSON.stringify(before));
    // A saved generated-video fixture and local tone verify the encoder without new provider requests.
    await SceneModel.updateMany({ projectId }, { $set: { duration: 2, narrationOptional: true, visualAssetIds: [], motionGraphics: [] } });
    const clips = (await call(`/projects/${projectId}/scenes`)).data.scenes;
    if (process.argv.includes('--hosted-video')) {
      const videoStart = await call(`/scenes/${clips[0]._id}/video/generate`, 'POST', { expectedUpdatedAt: clips[0].updatedAt });
      assert.equal(videoStart.status, 202, JSON.stringify(videoStart));
      assert.equal((await call(`/projects/${projectId}/video-jobs/active`)).data.job._id, videoStart.data.job._id);
      assert.equal((await call(`/scenes/${clips[0]._id}/video/generate`, 'POST', { expectedUpdatedAt: clips[0].updatedAt })).status, 409);
      let generated;
      for (let attempt = 0; attempt < 330; attempt++) {
        const job = (await call('/video-jobs/' + videoStart.data.job._id)).data.job;
        if (attempt % 10 === 0) console.log('Free hosted video progress: ' + job.progress + '%');
        if (job.status !== 'processing') { generated = job; break; }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      assert.equal(generated?.status, 'completed', JSON.stringify(generated));
      const video = await MediaAssetModel.findById(generated.outputAssetIds[0]);
      assert.equal(video.type, 'video'); assert(video.duration > 0 && video.duration < 3);
      const retrieved = await fetch(base + `/media/${video.id}/content`, { headers: { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } });
      assert.equal(retrieved.status, 200); assert.equal(Buffer.from(await retrieved.arrayBuffer()).toString('ascii', 4, 8), 'ftyp');
      assert(await UsageRecordModel.findOne({ sceneId: clips[0]._id, providerId: 'ltx-free', estimatedCost: 0, status: 'success' }));
      assets[0] = { ...video.toObject(), _id: video.id };
      console.log('PASS: Real hosted LTX generation, duplicate rejection, saved moving clip, authenticated playback and zero-cost usage recording.');
    }
    if (!process.argv.includes('--hosted-video')) {
      const fixture = process.argv.find(value => value.startsWith('--video-fixture='))?.slice('--video-fixture='.length);
      if (!fixture) throw new Error('Video-only export check requires --video-fixture=PATH_TO_GENERATED_MP4 or --hosted-video');
      const { readFile, writeFile } = await import('node:fs/promises');
      const { randomUUID } = await import('node:crypto');
      const { getVideoMetadata } = await import('@remotion/renderer');
      const file = path.resolve(fixture); const bytes = await readFile(file); const metadata = await getVideoMetadata(file);
      assert.equal(bytes.toString('ascii', 4, 8), 'ftyp'); assert(metadata.durationInSeconds > 0);
      const storageKey = randomUUID(); await writeFile(path.join(mediaDirectory, storageKey), bytes);
      const fixtureAsset = await MediaAssetModel.create({ workspaceId, projectId, uploadedBy: (await UserModel.findOne({ email }))._id, name: 'generated-video-fixture.mp4', type: 'video', mimeType: 'video/mp4', size: bytes.length, duration: metadata.durationInSeconds, storageProvider: 'local', storageKey, source: 'ai-generated', status: 'ready' });
      assets[0] = { ...fixtureAsset.toObject(), _id: fixtureAsset.id };
    }
    await SceneModel.updateMany({ projectId }, { $set: { visualAssetIds: [assets[0]._id] } });
    const { writeFile } = await import('node:fs/promises');
    const { randomUUID } = await import('node:crypto');
    const wav = Buffer.alloc(44 + 3 * 24000 * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 0; i < 3 * 24000; i++) wav.writeInt16LE(Math.round(Math.sin(i / 24000 * Math.PI * 880) * 6000), 44 + i * 2);
    const key = randomUUID(); await writeFile(path.join(mediaDirectory, key), wav);
    const tone = await MediaAssetModel.create({ workspaceId, projectId, sceneId: clips[0]._id, uploadedBy: (await UserModel.findOne({ email }))._id, name: 'verification-tone.wav', type: 'audio', mimeType: 'audio/wav', size: wav.length, duration: 3, storageProvider: 'local', storageKey: key, source: 'ai-generated', status: 'ready' });
    await SceneModel.updateOne({ _id: clips[0]._id }, { $set: { voiceAssetId: tone._id, narrationOptional: false, visualAssetIds: [assets[0]._id] } });
    assert.equal((await call(`/projects/${projectId}/video-render`, 'POST', {})).status, 400);
    const fitted = await call(`/projects/${projectId}/media/fit-narration`, 'POST', {});
    assert.equal(fitted.status, 200); assert.equal(fitted.data.changed, true);
    const fittedScene = await SceneModel.findById(clips[0]._id);
    assert.equal(fittedScene.duration, 3); assert.equal(fittedScene.voiceAssetId.toString(), tone.id); assert.equal(fittedScene.visualAssetIds[0].toString(), assets[0]._id);
    const fittedBoard = (await call(`/storyboards/${storyboardId}`)).data.storyboard;
    assert.equal(fittedBoard.status, 'draft'); assert.equal(fittedBoard.totalDuration, clips.length * 2 + 1);
    assert.equal((await call(`/storyboards/${storyboardId}/approve`, 'POST', { expectedRevision: fittedBoard.__v })).status, 200);
    assert.equal((await call(`/projects/${projectId}/media/fit-narration`, 'POST', {})).data.changed, false);
    console.log('PASS: Fit narration extends short scenes, preserves media, synchronizes timing and requires storyboard reapproval.');
    const started = await call(`/projects/${projectId}/video-render`, 'POST', {});
    assert.equal(started.status, 202, JSON.stringify(started));
    assert.equal((await call(`/projects/${projectId}/video-render`, 'POST', {})).status, 409);
    let finished;
    for (let attempt = 0; attempt < 150; attempt++) {
      const job = (await call(`/projects/${projectId}/video-render`)).data.job;
      if (attempt % 5 === 0) console.log('Video export progress: ' + job.progress + '%');
      if (job.status !== 'processing') { finished = job; break; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.equal(finished?.status, 'completed', JSON.stringify(finished));
    const asset = await MediaAssetModel.findById(finished.assetId);
    assert.equal(asset.width, 1280); assert.equal(asset.height, 720);
    assert.equal((await call(`/projects/${projectId}`)).data.project.finalVideoAssetId, finished.assetId);
    const downloadPath = base + `/media/${finished.assetId}/download`;
    assert.equal((await fetch(downloadPath)).status, 401);
    const downloaded = await fetch(downloadPath, { headers: { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } });
    assert.equal(downloaded.status, 200); assert.match(downloaded.headers.get('content-disposition'), /attachment/);
    assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString('ascii', 4, 8), 'ftyp');
    const { getVideoMetadata } = await import('@remotion/renderer');
    const metadata = await getVideoMetadata(path.join(mediaDirectory, asset.storageKey));
    assert.equal(metadata.audioCodec, 'aac'); assert.equal(metadata.codec, 'h264'); assert(Math.abs(metadata.durationInSeconds - (clips.length * 2 + 1)) < .15);
    console.log('PASS: Real 720p H.264/AAC MP4, correct duration, audio track, duplicate rejection, project assignment and authenticated download.');
    const again = await call(`/projects/${projectId}/video-render`, 'POST', {});
    assert.equal(again.status, 202);
    const currentClip = (await call(`/projects/${projectId}/scenes`)).data.scenes[0];
    assert.equal((await call(`/scenes/${currentClip._id}/media`, 'PATCH', { expectedUpdatedAt: currentClip.updatedAt, narrationOptional: true })).status, 200);
    let stale;
    for (let attempt = 0; attempt < 150; attempt++) {
      stale = (await call(`/projects/${projectId}/video-render`)).data.job;
      if (stale.status !== 'processing') break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.equal(stale.status, 'failed'); assert.match(stale.error, /changed during export/);
    assert.equal((await call(`/projects/${projectId}`)).data.project.finalVideoAssetId, null);
    assert.equal(await MediaAssetModel.countDocuments({ projectId, source: 'remotion-generated' }), 1);
    console.log('PASS: Changes during rendering reject obsolete output and clear the final-video reference without replacing the saved video.');
  }
  const list = await call(`/workspaces/${workspaceId}/projects?limit=50`);
  const saved = list.data.projects.find(project => project._id === projectId);
  assert.equal(saved.scriptId, generated.data.script._id);
  assert.equal((await call('/scripts/' + saved.scriptId)).status, 200);
  assert.equal((await call('/auth/logout', 'POST')).status, 200);
  assert.equal((await call('/auth/me')).status, 401);
  console.log('PASS: dashboard project listing, saved script retrieval and session logout.');
} finally {
  const user = await UserModel.findOne({ email });
  if (user) {
    for (const project of await ProjectModel.find({ ownerId: user._id })) {
      for (const asset of await MediaAssetModel.find({ projectId: project._id })) await unlink(path.join(mediaDirectory, asset.storageKey)).catch(() => {});
      await MediaAssetModel.deleteMany({ projectId: project._id });
      await GenerationJobModel.deleteMany({ projectId: project._id });
      await SceneModel.deleteMany({ projectId: project._id });
      await StoryboardModel.deleteMany({ projectId: project._id });
      await ScriptModel.deleteMany({ projectId: project._id });
      await ProjectModel.deleteOne({ _id: project._id, ownerId: user._id });
    }
    await SessionModel.deleteMany({ userId: user._id });
    await UsageRecordModel.deleteMany({ userId: user._id });
    await WorkspaceMemberModel.deleteMany({ userId: user._id });
    await WorkspaceModel.deleteMany({ ownerId: user._id });
    await UserModel.deleteOne({ _id: user._id });
  }
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await disconnectDatabase();
}
