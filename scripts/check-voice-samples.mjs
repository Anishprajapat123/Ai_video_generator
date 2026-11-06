import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
const base = 'http://127.0.0.1:3000/api/v1';
const cookies = new Map();
const email = 'sample-check-' + randomBytes(8).toString('hex') + '@example.test';
const cookieHeader = () => [...cookies].map(([key, value]) => key + '=' + value).join('; ');
async function call(route, method = 'GET', body) {
  const csrf = method === 'GET' ? undefined : (await call('/auth/csrf')).data.csrfToken;
  const response = await fetch(base + route, { method, headers: { Cookie: cookieHeader(), Origin: process.env.FRONTEND_URL || 'http://localhost:3000', ...(csrf ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const item of response.headers.getSetCookie()) { const [key, ...value] = item.split(';')[0].split('='); cookies.set(key, value.join('=')); }
  const json = await response.json(); assert(response.ok, JSON.stringify(json)); return json;
}
try {
  await call('/auth/register', 'POST', { name: 'Voice sample check', email, password: randomBytes(16).toString('hex') });
  const list = (await call('/narration/voices')).data;
  for (const voice of list.voices) {
    assert(voice.previewUrl, 'Missing sample for ' + voice.name);
    const url = new URL(voice.previewUrl, base);
    const response = await fetch(url, { headers: { Cookie: cookieHeader() } });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200); assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert(url.searchParams.has('v'), 'Voice sample URL must change when the file changes');
    let energy = 0; for (let offset = 44; offset + 2 <= bytes.length; offset += 2) energy += bytes.readInt16LE(offset) ** 2;
    assert(energy > 10000, 'Silent sample');
    const range = await fetch(url, { headers: { Cookie: cookieHeader(), Range: 'bytes=0-1023' } });
    console.log(JSON.stringify({ voice: voice.id, status: response.status, type: response.headers.get('content-type'), bytes: bytes.length, rangeStatus: range.status, contentRange: range.headers.get('content-range') }));
    await range.arrayBuffer(); assert.equal(range.status, 206);
  }
} finally {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const user = await mongoose.connection.collection('users').findOne({ email });
  if (user) {
    await mongoose.connection.collection('sessions').deleteMany({ userId: user._id });
    await mongoose.connection.collection('workspacemembers').deleteMany({ userId: user._id });
    await mongoose.connection.collection('workspaces').deleteMany({ ownerId: user._id });
    await mongoose.connection.collection('users').deleteOne({ _id: user._id, email });
  }
  await mongoose.disconnect();
}
