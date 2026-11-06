import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import { env } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IAIProvider } from '../provider.interface.js';
import { parsePcmWav } from '../audio-wav.js';

const root = path.resolve(__dirname, '../../../../../..');
export const kittenDirectory = () => path.resolve(root, env.LOCAL_TTS_MODEL_DIR);
const python = () => path.resolve(root, env.LOCAL_TTS_PYTHON);
const aliases = z.object({ voice_aliases: z.record(z.string()) });
let running = false;
export function wavDuration(audio: Buffer) {
  const format = parsePcmWav(audio);
  if (format.sampleRate !== 24000) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Local voice engine returned an unsupported sample rate');
  return format.duration;
}
export class KittenLocalProvider implements IAIProvider {
  metadata = { id: 'kitten-local', name: 'KittenTTS · Local CPU', capabilities: ['text-to-speech' as const], enabled: ['kitten-local', 'piper-local'].includes(env.NARRATION_PROVIDER), priority: 1 };
  async isAvailable() { return this.metadata.enabled && existsSync(python()) && existsSync(path.join(kittenDirectory(), 'kitten_tts_mini_v0_8.onnx')); }
  async voices() {
    if (!await this.isAvailable()) throw new AppError(503, 'PROVIDER_DISABLED', 'Set up the local voice engine first. See docs/local-narration.md.');
    const result = aliases.safeParse(JSON.parse(readFileSync(path.join(kittenDirectory(), 'config.json'), 'utf8')));
    if (!result.success) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Local voice configuration is invalid');
    return Object.keys(result.data.voice_aliases).filter(id => /^[a-zA-Z0-9_-]{1,100}$/.test(id)).map(id => ({ id, name: id + ' · English' + (result.data.voice_aliases[id].endsWith('-f') ? ' · Female' : result.data.voice_aliases[id].endsWith('-m') ? ' · Male' : ''),
      previewUrl: existsSync(path.join(kittenDirectory(), 'sample-' + id + '.wav')) ? '/api/v1/narration/voices/' + id + '/sample?v=' + statSync(path.join(kittenDirectory(), 'sample-' + id + '.wav')).mtimeMs : undefined }));
  }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.capability !== 'text-to-speech') throw AppError.badRequest('Local voice engine supports narration only');
    const input = z.object({ text: z.string().trim().min(1).max(10000), voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).parse(request.input);
    if (!(await this.voices()).some(voice => voice.id === input.voiceId)) throw AppError.badRequest('Choose an available local voice');
    if (running) throw new AppError(429, 'QUOTA_EXCEEDED', 'The local voice engine is busy. Wait for the current scene to finish.');
    running = true;
    const audio = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(python(), [path.join(root, 'scripts/local-narration.py'), kittenDirectory()], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks: Buffer[] = []; let bytes = 0; let failure: AppError | undefined;
      const timer = setTimeout(() => { failure = new AppError(504, 'PROVIDER_TIMEOUT', 'Local narration timed out. Try a shorter scene.'); child.kill(); }, env.PROVIDER_TIMEOUT_MS);
      child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) { failure = new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Local narration exceeded the audio size limit'); child.kill(); } else chunks.push(chunk); });
      child.stderr.resume(); // Never expose text, environment paths or library diagnostics to users.
      child.stdin.on('error', () => {});
      child.on('error', () => { clearTimeout(timer); reject(new AppError(503, 'PROVIDER_UNAVAILABLE', 'Local voice engine could not start. Check the local setup.')); });
      child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else if (code !== 0) reject(new AppError(502, 'PROVIDER_UNAVAILABLE', 'Local narration failed. Check local voice setup or shorten the scene.')); else resolve(Buffer.concat(chunks)); });
      child.stdin.end(JSON.stringify(input));
    }).finally(() => { running = false; });
    const duration = wavDuration(audio);
    if (!duration || duration > 170) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Generated scene narration is empty or too long');
    return { providerId: 'kitten-local', model: 'KittenML/kitten-tts-mini-0.8', status: 'completed', output: { audio, duration, mimeType: 'audio/wav' }, estimatedCost: 0, usage: { characters: input.text.length, durationSeconds: duration } };
  }
}
