import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';

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
const { SessionModel } = await import('../apps/backend/dist/database/models/Session.model.js');
const { UsageRecordModel } = await import('../apps/backend/dist/database/models/UsageRecord.model.js');
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
