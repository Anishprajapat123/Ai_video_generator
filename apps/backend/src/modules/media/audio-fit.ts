import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { AppError } from '../../common/errors/app-error.js';
import { matchPcmDuration, readPcmWav } from '../providers/audio-wav.js';

const tolerance = 0.02;

// Remotion ships a complete FFmpeg build with the local app. Prefer it so timing never depends on a system install.
function ffmpegPath() {
  const configured = process.env.FFMPEG_PATH;
  if (configured && existsSync(configured)) return configured;
  const base = path.resolve(__dirname, '../../../../../node_modules/@remotion');
  if (existsSync(base)) {
    for (const name of readdirSync(base)) {
      if (!name.startsWith('compositor-' + process.platform + '-' + process.arch)) continue;
      const candidate = path.join(base, name, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if (existsSync(candidate)) return candidate;
    }
  }
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

export async function runLocalFfmpeg(args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = []; let diagnostics = '';
    child.stdout.on('data', chunk => output.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Audio timing exceeded 30 seconds')); }, 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(output)) : reject(new Error(diagnostics || 'FFmpeg failed')); });
  });
}

async function inTempFolder<T>(action: (folder: string) => Promise<T>) {
  const folder = await mkdtemp(path.join(tmpdir(), 'studio-audio-'));
  try { return await action(folder); } finally { await rm(folder, { recursive: true, force: true }).catch(() => {}); }
}

async function toWav(audio: Buffer, mimeType: string) {
  if (mimeType === 'audio/wav') {
    // Most engines return plain 16-bit PCM. Anything richer is normalized by FFmpeg below.
    try { readPcmWav(audio); return audio; } catch { /* convert below */ }
  }
  return inTempFolder(async folder => {
    const extension = mimeType === 'audio/mpeg' ? '.mp3' : mimeType === 'audio/wav' ? '.wav' : '.audio';
    const input = path.join(folder, 'input' + extension); const output = path.join(folder, 'output.wav');
    await writeFile(input, audio);
    await runLocalFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', output]);
    return readFile(output);
  }).catch(() => { throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Narration audio could not be converted for timing'); });
}

// Pitch-preserving speech timing. A failed encoder never silently changes the voice pitch.
async function timeCompress(wav: Buffer, factor: number, channels: number, sampleRate: number) {
  try {
    // Older FFmpeg builds cap atempo at 2x, so chain stages for heavier compression.
    const stages: number[] = []; let remaining = factor;
    while (remaining > 2) { stages.push(2); remaining /= 2; }
    while (remaining < 0.5) { stages.push(0.5); remaining /= 0.5; }
    if (Math.abs(remaining - 1) > 0.000001) stages.push(remaining);
    return await inTempFolder(async folder => {
      const input = path.join(folder, 'input.wav'); const output = path.join(folder, 'output.wav');
      await writeFile(input, wav);
      await runLocalFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-filter:a', stages.map(stage => 'atempo=' + stage.toFixed(6)).join(','),
        '-ac', String(channels), '-ar', String(sampleRate), '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-fflags', '+bitexact', '-f', 'wav', output]);
      return readFile(output);
    });
  } catch {
    throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Narration timing failed. Original audio was kept; check the local FFmpeg setup.');
  }
}

export type FittedAudio = { audio: Buffer; mimeType: 'audio/wav'; duration: number; adjusted: boolean; speed: number };

// Fit spoken audio to the scene with pitch-preserving tempo; silence-only fixtures are padded directly.
export async function fitAudioDuration(audio: Buffer, mimeType: string, targetSeconds: number): Promise<FittedAudio> {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) throw AppError.badRequest('A scene needs a valid duration before narration can be generated');
  const wav = await toWav(audio, mimeType);
  const source = readPcmWav(wav);
  const sourceDuration = source.pcm.length / (source.sampleRate * source.channels * 2);
  if (!sourceDuration) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Narration audio is empty');
  let hasSpeech = false;
  for (let offset = 0; offset + 2 <= source.pcm.length; offset += 2) if (Math.abs(source.pcm.readInt16LE(offset)) > 4) { hasSpeech = true; break; }
  if (hasSpeech && Math.abs(sourceDuration - targetSeconds) > tolerance) {
    // Leave a tiny ending margin so sample rounding cannot cut the final spoken sound.
    const speed = sourceDuration / Math.max(targetSeconds * 0.99, targetSeconds - 0.08);
    const compressed = await timeCompress(wav, speed, source.channels, source.sampleRate);
    const exact = matchPcmDuration(compressed, targetSeconds);
    return { audio: exact.audio, mimeType: 'audio/wav', duration: exact.duration, adjusted: true, speed };
  }
  const exact = matchPcmDuration(wav, targetSeconds);
  return { audio: exact.audio, mimeType: 'audio/wav', duration: exact.duration, adjusted: sourceDuration < targetSeconds - tolerance, speed: 1 };
}
