import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'storage/voices/kitten');
const config = JSON.parse(await readFile(path.join(directory, 'config.json'), 'utf8'));
for (const voice of Object.keys(config.voice_aliases)) {
  const start = Date.now();
  const audio = await new Promise((resolve, reject) => {
    const child = spawn(path.join(root, '.tts-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), [path.join(root, 'scripts/local-narration.py'), directory], { windowsHide: true, cwd: root });
    const chunks = []; const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.resume();
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('Voice synthesis failed: ' + voice)); });
    child.stdin.end(JSON.stringify({ text: 'Waterfalls form when rivers flow over steep cliffs. This is a sample of my narration voice.', voiceId: voice }));
  });
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF'); assert.equal(audio.readUInt32LE(24), 24000);
  const duration = (audio.length - 44) / 48000;
  assert(duration > 1 && duration < 30);
  let energy = 0; for (let offset = 44; offset < audio.length; offset += 2) energy += audio.readInt16LE(offset) ** 2;
  assert(energy / ((audio.length - 44) / 2) > 100, 'Generated voice must not be silent');
  await writeFile(path.join(directory, 'sample-' + voice + '.wav'), audio);
  console.log(`PASS ${voice}: ${duration.toFixed(1)}s audio in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}
