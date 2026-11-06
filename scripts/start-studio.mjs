import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
async function listening(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}
try {
  const apiPort = Number(process.env.PORT || 5000);
  for (const port of [3000, apiPort]) {
    if (await listening(port)) throw new Error(`Port ${port} is already in use. Stop the existing studio with Ctrl+C, then run npm.cmd run dev again.`);
  }
  const database = spawnSync(process.execPath, ['scripts/ensure-dev-database.mjs'], {cwd:root,stdio:'inherit',windowsHide:true});
  if (database.status !== 0) throw new Error('Database startup failed.');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Start with npm.cmd run dev.');
  const build = spawnSync(process.execPath, [npmCli,'run','build:types'], {cwd:root,stdio:'inherit',windowsHide:true});
  if (build.status !== 0) throw new Error('Shared types build failed.');
  const candidates = process.platform === 'win32' ? [
    path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'cloudflared/cloudflared.exe'),
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'cloudflared/cloudflared.exe'),
  ] : [];
  const executable = candidates.find(existsSync) || 'cloudflared';
  console.log('[Share] Starting a free Cloudflare tunnel…');
  const tunnel = spawn(executable, ['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:3000'], {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  children.push(tunnel);
  let publicUrl;
  try {
    publicUrl = await new Promise((resolve,reject) => {
      let output = '';
      const deadline = setTimeout(() => reject(new Error('Tunnel startup timed out.')),30000);
      const read = chunk => {
        output = (output + chunk.toString()).slice(-16000);
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) { clearTimeout(deadline); resolve(match[0]); }
      };
      tunnel.stdout.on('data',read);tunnel.stderr.on('data',read);
      tunnel.once('error',error=>{clearTimeout(deadline);reject(error);});
      tunnel.once('exit',()=>{clearTimeout(deadline);reject(new Error('Cloudflare tunnel exited.'));});
    });
  } catch (error) {
    tunnel.kill();
    console.warn('[Share] Public link unavailable: '+error.message+' Local studio will still start.');
  }
  await mkdir(path.join(root,'storage/share'),{recursive:true});
  await writeFile(path.join(root,'storage/share/current.json'),JSON.stringify({url:publicUrl || null,frontendPort:3000,apiPort}));
  const origin = publicUrl || 'http://localhost:3000';
  console.log('\nStudio links (available once Web and API are ready):');
  console.log('  Local:        http://localhost:3000');
  if (publicUrl) {
    console.log('  Public:       '+publicUrl);
    console.log('  Create video: '+publicUrl+'/create');
    console.log('  Use the public link to sign in and generate. Keep this terminal and PC on.');
    console.log('  The free public link changes on restart.');
  }
  console.log('  API health:   '+origin+'/api/v1/health\n');
  const app = spawn(process.execPath, [path.join(root,'node_modules/concurrently/dist/bin/index.js'),'--kill-others','--names','API,Web','npm:dev:backend','npm:dev:frontend'], {
    cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,NODE_ENV:'development',FRONTEND_URL:origin,BACKEND_URL:`http://127.0.0.1:${apiPort}`},
  });
  children.push(app);
  app.once('error',error=>{console.error(error.message);stop(1);});
  app.once('exit',code=>stop(code || 0));
  tunnel.once('exit',()=>{if(publicUrl && !stopping) console.warn('[Share] Tunnel stopped. Restart npm.cmd run dev for a new public link.');});
} catch (error) { console.error('[Studio] '+error.message);stop(1); }
