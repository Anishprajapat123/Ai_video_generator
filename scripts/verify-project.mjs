import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const full = process.argv.includes('--full');
// Local regression checks must never inherit real provider credentials.
const environment = { ...process.env, NODE_ENV: 'test', ENABLE_MOCK_PROVIDER: 'true',
  GEMINI_API_KEY: '', OPENROUTER_API_KEY: '', ELEVENLABS_API_KEY: '', MUAPI_API_KEY: '',
  MONGODB_TEST_URI: process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/ai_video_studio_test?replicaSet=rs0' };
if (!/_test$/.test(new URL(environment.MONGODB_TEST_URI).pathname)) throw new Error('Verification requires a database name ending in _test');
// npm supplies this path when invoked through npm.cmd run verify.
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const steps = [
  ['Typecheck', ['node', npmCli, 'run', 'typecheck']],
  ['Unit and MongoDB integration tests (mocked providers)', ['node', npmCli, 'test']],
  ['Production build', ['node', npmCli, 'run', 'build']],
  ...(full ? [
    ['Isolated local narration, browser editing, motion, visual QA and recovery', ['node', 'scripts/verify-local-browser.mjs']],
    ['Landscape and portrait caption renders', ['node', 'scripts/verify-caption-render.mjs']],
    ['Custom visuals, MP4 timing, clip trim/hold and audio', ['node', '--import', 'tsx', 'scripts/verify-video-render.ts']],
  ] : []),
];
const results = [];
let child;
process.once('SIGINT', () => { child?.kill(); process.exitCode = 130; });
try {
  for (const [name, command] of steps) {
    console.log('\n' + name);
    const started = Date.now();
    const code = await new Promise((resolve, reject) => {
      child = spawn(command[0] === 'node' ? process.execPath : command[0], command.slice(1), { cwd: root, env: { ...environment, NODE_ENV: name === 'Production build' ? 'production' : 'test' }, stdio: 'inherit', windowsHide: true });
      child.once('error', reject); child.once('close', resolve);
    });
    results.push({ name, passed: code === 0, seconds: Math.round((Date.now() - started) / 100) / 10 });
    if (code !== 0) throw new Error(name + ' failed. Remaining checks were not run.');
  }
  console.log('\nVerification passed. No Gemini or Flow generation requests.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  const folder = path.join(root, 'storage', 'verification');
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'latest-checks.json'), JSON.stringify({ date: new Date().toISOString(), full, results }, null, 2));
}
