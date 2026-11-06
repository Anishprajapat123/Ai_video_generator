import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
const uri = new URL(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_video_studio?replicaSet=rs0');
// Remote databases and custom ports are managed by their owner.
if (uri.protocol === 'mongodb:' && ['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname) && (!uri.port || uri.port === '27017')) {
  const listening = await new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 27017 });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
  if (listening) console.log('[Database] Local MongoDB is listening.');
  else {
    const candidates = process.platform === 'win32' ? [
      path.join(process.env.LOCALAPPDATA || '', 'Programs/DockerDesktop/resources/bin/docker.exe'),
      path.join(process.env.ProgramFiles || 'C:/Program Files', 'Docker/Docker/resources/bin/docker.exe'),
    ] : [];
    const docker = candidates.find(candidate => existsSync(candidate)) || 'docker';
    console.log('[Database] Starting the project MongoDB container...');
    const result = spawnSync(docker, ['compose', 'up', '-d', '--wait', 'mongodb'], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) {
      console.error('[Database] Open Docker Desktop, wait until it is running, then run npm.cmd run dev again. The studio cannot start without MongoDB.');
      process.exit(1);
    }
  }
}
