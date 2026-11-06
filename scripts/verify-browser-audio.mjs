import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { openBrowser } from '@remotion/renderer';
import { readFile } from 'node:fs/promises';
dotenv.config();
const origin = process.env.FRONTEND_URL || 'http://localhost:3000';
const cookies = new Map();
const email = 'browser-audio-' + randomBytes(8).toString('hex') + '@example.test';
let browser; let projectId;
async function call(route, method = 'GET', body) {
  const csrf = method === 'GET' ? null : (await call('/auth/csrf')).csrfToken;
  const response = await fetch(origin + '/api/v1' + route, { method, headers: { Cookie: [...cookies].map(([k,v]) => k + '=' + v).join('; '), Origin: process.env.FRONTEND_URL || 'http://localhost:3000', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const [key, ...value] = cookie.split(';')[0].split('='); cookies.set(key, value.join('=')); }
  const json = await response.json(); assert(response.ok, JSON.stringify(json)); return json.data;
}
try {
  await mongoose.connect(process.env.MONGODB_URI);
  await call('/auth/register', 'POST', { name: 'Browser audio check', email, password: randomBytes(16).toString('hex') });
  const workspaceId = (await call('/workspaces')).workspaces[0].workspace._id;
  const catalog = await call('/narration/voices');
  if (process.argv.includes('--local-narration')) assert(['piper-local', 'kitten-local'].includes(catalog.providerId), 'Browser verification requires a local narration provider; paid synthesis is not allowed');
  const selectedVoice = process.argv.includes('--hindi') ? catalog.voices.find(voice => voice.id === 'piper-pratham') : catalog.voices[0];
  assert(selectedVoice?.previewUrl, 'Test voice sample must be available');
  const project = (await call('/workspaces/' + workspaceId + '/projects', 'POST', { title: 'Browser audio verification', creationType: 'prompt', settings: { duration: 20, aspectRatio: '16:9', language: 'en', style: 'animated-explainer' } })).project;
  projectId = new mongoose.Types.ObjectId(project._id);
  const boardId = new mongoose.Types.ObjectId(); const sceneId = new mongoose.Types.ObjectId(); const now = new Date();
  const db = mongoose.connection.db;
  await db.collection('storyboards').insertOne({ _id: boardId, projectId, workspaceId: new mongoose.Types.ObjectId(workspaceId), scriptId: new mongoose.Types.ObjectId(), title: 'Audio check', status: 'approved', version: 1, __v: 0, totalDuration: 20, scenes: [], createdAt: now, updatedAt: now });
  await db.collection('scenes').insertOne({ _id: sceneId, projectId, storyboardId: boardId, workspaceId: new mongoose.Types.ObjectId(workspaceId), sceneNumber: 1, title: 'Audio check', duration: 20, narration: 'A synthetic browser audio test.', visualDescription: 'Test animation', visualAssetIds: [], voiceAssetId: null, narrationOptional: true, visualFit: 'cover', motionGraphics: [{id:'fixture',type:'remotion-explainer',properties:{points:['Fixture scene'],layout:'concept'}}], timeline: { startTime: 0, endTime: 20 }, transition: { type: 'none', duration: 0 }, status: 'draft', createdAt: now, updatedAt: now });
  await db.collection('projects').updateOne({ _id: projectId }, { $set: { storyboardId: boardId, status: 'ready' } });
  const planPath = process.argv.find(value => value.startsWith('--visual-plan='))?.slice('--visual-plan='.length);
  if (planPath) {
    const visualPlan = JSON.parse(await readFile(planPath, 'utf8'));
    await db.collection('scenes').updateOne({ _id: sceneId }, { $set: { editing: { visualPlan, visualMode: 'remotion' } } });
  }
  if (process.argv.includes('--hindi')) {
    await db.collection('scenes').updateOne({ _id: sceneId }, { $set: { narration: 'नमस्ते। यह स्थानीय हिंदी आवाज़ की जाँच है। आपकी कहानी अब हिंदी में सुनी जा सकती है।' } });
    await db.collection('projects').updateOne({ _id: projectId }, { $set: { 'settings.language': 'hi' } });
  }
  if (process.argv.includes('--local-narration')) await call('/scenes/' + sceneId + '/narration/generate', 'POST', { expectedUpdatedAt: now.toISOString(), voiceId: selectedVoice.id });
  browser = await openBrowser('chrome');
  const page = await browser.newPage({ context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {} });
  await page._client().send('Network.setCookies', { cookies: [...cookies].map(([name, value]) => ({ name, value, url: origin, path: '/' })) });
  await page.goto({ url: origin + '/storyboards/' + boardId + '/media', timeout: 30000 });
  await page._client().send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (let i = 0; i < 100; i++) { if (await page.evaluate(() => Boolean(document.querySelector('.voice-sample-player audio')))) break; await new Promise(resolve => setTimeout(resolve, 200)); }
  await page._client().send('Runtime.evaluate', { expression: "document.querySelector('.voice-sample-player audio').play()", userGesture: true });
  await new Promise(resolve => setTimeout(resolve, 700));
  const native = await page.evaluate(() => {
    const audio = document.querySelector('.voice-sample-player audio');
    return { exists: Boolean(audio), paused: audio?.paused, muted: audio?.muted, volume: audio?.volume, time: audio?.currentTime, readyState: audio?.readyState };
  });
  console.log('Native narration playback:', JSON.stringify(native));
  assert(native.exists); assert.equal(native.paused, false); assert.equal(native.muted, false); assert.equal(native.volume, 1); assert(native.time > 0); assert(native.readyState >= 2);
  const simpleUi = await page.evaluate(() => ({ providers: document.querySelectorAll('select[aria-label="Video provider"]').length, voices: document.querySelectorAll('select[aria-label="Narration voice"]').length, images: /DreamShaper|Generate scene image|Scene animation/.test(document.body.textContent), overflow: document.documentElement.scrollWidth > window.innerWidth }));
  assert.equal(simpleUi.providers, 1); assert.equal(simpleUi.voices, 1); assert.equal(simpleUi.images, false); assert.equal(simpleUi.overflow, false);
  console.log('Compact phone video screen:', JSON.stringify(simpleUi));
  assert.equal(await page.evaluate(() => document.querySelector('select[aria-label="Video provider"]').value), 'remotion');
  const previousSource = await page.evaluate(() => document.querySelector('.voice-sample-player audio').src);
  await page.evaluate(() => document.querySelector('.voice-sample-player button').click());
  await new Promise(resolve => setTimeout(resolve, 200));
  const reloaded = await page.evaluate(() => {
    const audio = document.querySelector('.voice-sample-player audio');
    return { src: audio.src, paused: audio.paused, time: audio.currentTime };
  });
  assert.notEqual(reloaded.src, previousSource); assert.match(reloaded.src, /playback=/); assert.equal(reloaded.paused, true); assert.equal(reloaded.time, 0);
  await page._client().send('Runtime.evaluate', { expression: "document.querySelector('.voice-sample-player audio').play()", userGesture: true });
  await new Promise(resolve => setTimeout(resolve, 700));
  const resumed = await page.evaluate(() => ({ paused: document.querySelector('.voice-sample-player audio').paused, status: document.querySelector('.voice-sample-player [role="status"]').textContent }));
  assert.equal(resumed.paused, false); assert.match(resumed.status, /Playing.*100%/);
  console.log('Fresh player after Reload audio:', JSON.stringify(resumed));
  const decoded = await page.evaluate(async () => {
    const r = await fetch(document.querySelector('.voice-sample-player audio').src, { credentials: 'include' }); const bytes = await r.arrayBuffer();
    const context = new AudioContext(); const buffer = await context.decodeAudioData(bytes);
    let peak = 0, sum = 0; const channel = buffer.getChannelData(0);
    for (const value of channel) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
    await context.close(); return { status: r.status, duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, peak, rms: Math.sqrt(sum / channel.length) };
  });
  console.log('Browser decoder:', JSON.stringify(decoded)); assert.equal(decoded.channels, 1); assert(decoded.peak > .01); assert(decoded.rms > .001);
  if (process.argv.includes('--local-narration')) {
    await page._client().send('Runtime.evaluate', { expression: "document.querySelector('.media-audio audio').play()", userGesture: true });
    await new Promise(resolve => setTimeout(resolve, 700));
    const saved = await page.evaluate(() => {
      const audio = document.querySelector('.media-audio audio');
      return { paused: audio?.paused, muted: audio?.muted, volume: audio?.volume, time: audio?.currentTime, error: audio?.error?.message };
    });
    console.log('Saved narration playback:', JSON.stringify(saved));
    assert.equal(saved.paused, false); assert.equal(saved.muted, false); assert.equal(saved.volume, 1); assert(saved.time > 0); assert.equal(saved.error, undefined);
  }
  console.log('PASS: Native audio controls play original mono narration with a non-silent decoded signal. Hardware audibility is not measured.');
  // Saved fixture artwork is used here so browser verification never sends Gemini requests.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await page.evaluate(() => document.body.textContent.includes('EXPLAINED') || Boolean(document.querySelector('.scene-inline-editor svg[role="img"]')))) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const remotion = await page.evaluate(() => ({ visible: document.body.textContent.includes('EXPLAINED') || Boolean(document.querySelector('.scene-inline-editor svg[role="img"]')), overflow: document.documentElement.scrollWidth > window.innerWidth }));
  assert.equal(remotion.visible, true); assert.equal(remotion.overflow, false);
  console.log('Remotion default stage on phone:', JSON.stringify(remotion));
  if (process.argv.includes('--editor')) {
    const before = (await call('/projects/' + projectId + '/scenes')).scenes[0];
    const source = before.voiceAssetId;
    const setField = async (label, value) => page.evaluate((label, value) => {
      const element = [...document.querySelectorAll('.scene-editor-fields label')].find(item => item.firstChild?.textContent === label)?.querySelector('input,textarea,select');
      if (!element) throw new Error('Missing field: ' + label);
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, label, value);
    const click = async text => page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent === text);
      if (!button || button.disabled) throw new Error('Unavailable button: ' + text);
      button.click();
    }, text);
    async function waitFor(predicate) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for scene edit: ' + await page.evaluate(() => document.querySelector('.media-feedback')?.textContent));
    }
    await setField('Heading', 'Edited in browser');
    await waitFor(() => page.evaluate(() => [...document.querySelectorAll('button')].find(item => item.textContent === 'Save edits')?.disabled === false));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(item => ['Generate custom visuals with Gemini', 'Redesign visuals with Gemini'].includes(item.textContent)).disabled), true, 'unsaved edits block rebuild');
    await click('Save edits');
    await waitFor(async () => (await call('/projects/' + projectId + '/scenes')).scenes[0].editing?.heading === 'Edited in browser');
    await waitFor(() => page.evaluate(() => [...document.querySelectorAll('button')].find(item => item.textContent === 'Undo')?.disabled === false));
    assert.equal((await call('/projects/' + projectId + '/scenes')).scenes[0].voiceAssetId, source);
    await click('Undo');
    await waitFor(async () => (await call('/projects/' + projectId + '/scenes')).scenes[0].editing?.heading !== 'Edited in browser');
    await waitFor(() => page.evaluate(() => [...document.querySelectorAll('button')].find(item => item.textContent === 'Redo')?.disabled === false));
    await click('Redo');
    await waitFor(async () => (await call('/projects/' + projectId + '/scenes')).scenes[0].editing?.heading === 'Edited in browser');
    // The database can finish before the UI refresh. Wait until its save/navigation guard clears.
    await waitFor(() => page.evaluate(() => [...document.querySelectorAll('button')].find(item => item.textContent === 'Undo')?.disabled === false));
    await page.goto({ url: origin + '/storyboards/' + boardId + '/media', timeout: 30000 });
    await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.scene-editor-fields label')].find(item => item.firstChild?.textContent === 'Heading')?.querySelector('input')?.value === 'Edited in browser'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    console.log('PASS: Inline edits save, preserve narration, undo/redo and survive reload on narrow screens.');
    if (process.argv.includes('--motion')) {
      await page.evaluate(() => {
        const camera = [...document.querySelectorAll('.motion-track-editor')].find(item => item.querySelector('summary')?.textContent.startsWith('Camera pan'));
        if (!camera) throw new Error('Custom artwork is required for motion checks; pass --visual-plan=PATH');
        camera.open = true;
        camera.querySelector('button').click();
      });
      await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.scene-editor-fields label')].some(item => item.firstChild?.textContent === 'Scale (%)')));
      await setField('Scale (%)', '110');
      await click('Save edits');
      await waitFor(async () => (await call('/projects/' + projectId + '/scenes')).scenes[0].editing?.visualPlan?.camera?.[0]?.scalePercent === 110);
      await waitFor(() => page.evaluate(() => [...document.querySelectorAll('button')].find(item => item.textContent === 'Undo')?.disabled === false));
      await page.goto({ url: origin + '/storyboards/' + boardId + '/media', timeout: 30000 });
      await waitFor(() => page.evaluate(() => document.querySelector('.scene-inline-editor svg[role="img"] > g')?.getAttribute('transform')?.includes('scale(1.1)')));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      console.log('PASS: Camera keyframes edit, persist and drive the live SVG after reload.');
    }
  }
} finally {
  if (browser) await browser.close({ silent: true });
  const db = mongoose.connection.db;
  const user = db && await db.collection('users').findOne({ email });
  if (user) {
    if (projectId) {
      const { unlink } = await import('node:fs/promises');
      const { default: path } = await import('node:path');
      for (const asset of await db.collection('mediaassets').find({ projectId }).toArray()) {
        if (/^[a-f0-9-]{36}$/.test(asset.storageKey)) await unlink(path.resolve(process.env.LOCAL_STORAGE_PATH || 'storage', 'media', asset.storageKey)).catch(() => {});
      }
      await db.collection('mediaassets').deleteMany({ projectId });
      await db.collection('usagerecords').deleteMany({ projectId });
      for (const collection of ['scenes', 'storyboards']) await db.collection(collection).deleteMany({ projectId }); await db.collection('projects').deleteOne({ _id: projectId, ownerId: user._id });
    }
    await db.collection('sessions').deleteMany({ userId: user._id }); await db.collection('workspacemembers').deleteMany({ userId: user._id }); await db.collection('workspaces').deleteMany({ ownerId: user._id }); await db.collection('users').deleteOne({ _id: user._id, email });
  }
  await mongoose.disconnect();
}
