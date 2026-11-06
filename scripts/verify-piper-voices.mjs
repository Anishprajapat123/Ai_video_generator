import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { piperVoices, piperDirectory } from '../apps/backend/dist/modules/providers/adapters/piper-local.adapter.js';
import { parsePcmWav } from '../apps/backend/dist/modules/providers/audio-wav.js';
const root = path.resolve(import.meta.dirname, '..');
for (const voice of piperVoices) {
  const text = voice.language === 'hi' ? 'नमस्ते। यह आपकी वीडियो के लिए हिंदी आवाज़ का नमूना है। हम आपकी कहानी को आवाज़ देते हैं।' : 'Hello. This is a new English narration sample for your video. Your story deserves a clear voice.';
  const audio = await new Promise((resolve, reject) => {
    const child = spawn(path.resolve(root, process.platform === 'win32' ? '.tts-venv/Scripts/python.exe' : '.tts-venv/bin/python'), [path.join(root, 'scripts/piper-narration.py'), piperDirectory], { cwd: root, windowsHide: true });
    const chunks = []; let diagnostic = '';
    const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-1200); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('Piper synthesis failed: ' + voice.id + '\n' + diagnostic)); });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ voiceId: voice.id, text }));
  });
  const format = parsePcmWav(audio);
  let sum = 0; let peak = 0;
  for (let offset = 44; offset + 2 <= audio.length; offset += 2) { const value = audio.readInt16LE(offset) / 32768; sum += value * value; peak = Math.max(peak, Math.abs(value)); }
  const rms = Math.sqrt(sum / ((audio.length - 44) / 2));
  assert(format.duration > 1); assert(peak > .01 && rms > .001, 'Voice must not be silent');
  await writeFile(path.join(piperDirectory, 'sample-' + voice.id + '.wav'), audio);
  console.log(JSON.stringify({ voice: voice.id, language: voice.language, duration: format.duration, peak, rms, generated: true }));
}
