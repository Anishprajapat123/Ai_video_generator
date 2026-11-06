import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import type { IAIProvider } from '../provider.interface.js';
import { env } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';
import { parsePcmWav } from '../audio-wav.js';

const root = path.resolve(__dirname, '../../../../../..');
export const piperDirectory = path.resolve(root, 'storage/voices');
export const piperVoices = [
  { id: 'piper-english', name: 'LJ · English · Female', model: 'en_US-ljspeech-high', language: 'en' },
  { id: 'piper-pratham', name: 'Pratham · हिन्दी · Male', model: 'hi_IN-pratham-medium', language: 'hi' },
  { id: 'piper-priyamvada', name: 'Priyamvada · हिन्दी · Female', model: 'hi_IN-priyamvada-medium', language: 'hi' },
];
let running = false;
// Measured from the installed preview sentences; guide neural pacing before the final small tempo correction.
export function piperLengthScale(voiceId: string, text: string, targetSeconds?: number) {
  const rates: Record<string, number> = { 'piper-english': 2.78, 'piper-pratham': 2.88, 'piper-priyamvada': 2.34 };
  const words = text.trim().split(/\s+/u).filter(Boolean).length;
  if (!targetSeconds || !words || !rates[voiceId]) return 1;
  return Math.max(0.8, Math.min(1.35, targetSeconds * rates[voiceId] / words));
}
export class PiperLocalProvider implements IAIProvider {
  metadata = { id: 'piper-local', name: 'Piper · Local English & Hindi', capabilities: ['text-to-speech' as const], enabled: ['kitten-local', 'piper-local'].includes(env.NARRATION_PROVIDER), priority: 1 };
  async isAvailable() { return this.metadata.enabled && existsSync(path.resolve(root, env.LOCAL_TTS_PYTHON)) && piperVoices.some(voice => existsSync(path.join(piperDirectory, voice.model + '.onnx')) && existsSync(path.join(piperDirectory, voice.model + '.onnx.json'))); }
  async voices() {
    if (!await this.isAvailable()) throw new AppError(503, 'PROVIDER_DISABLED', 'Set up the local Piper voice models first');
    return piperVoices.filter(voice => existsSync(path.join(piperDirectory, voice.model + '.onnx')) && existsSync(path.join(piperDirectory, voice.model + '.onnx.json'))).map(voice => {
      const sample = path.join(piperDirectory, 'sample-' + voice.id + '.wav');
      return { id: voice.id, name: voice.name, language: voice.language, previewUrl: existsSync(sample) ? '/api/v1/narration/voices/' + voice.id + '/sample?v=' + statSync(sample).mtimeMs : undefined };
    });
  }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.capability !== 'text-to-speech') throw AppError.badRequest('Piper supports narration only');
    const input = z.object({ text: z.string().trim().min(1).max(10000), voiceId: z.string(), targetDurationSeconds: z.number().positive().max(600).optional() }).parse(request.input);
    const voice = (await this.voices()).find(item => item.id === input.voiceId);
    if (!voice) throw AppError.badRequest('Choose an installed Piper voice');
    if (running) throw AppError.conflict('Local narration is busy; wait for the current scene');
    running = true;
    const audio = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(path.resolve(root, env.LOCAL_TTS_PYTHON), [path.join(root, 'scripts/piper-narration.py'), piperDirectory], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks: Buffer[] = []; let bytes = 0; let failure: AppError | undefined;
      const timer = setTimeout(() => { failure = new AppError(504, 'PROVIDER_TIMEOUT', 'Local narration timed out'); child.kill(); }, env.PROVIDER_TIMEOUT_MS);
      child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) { failure = AppError.badRequest('Narration is too long; split it into shorter scenes'); child.kill(); } else chunks.push(chunk); });
      child.stderr.resume(); child.stdin.on('error', () => {});
      child.on('error', () => { clearTimeout(timer); reject(new AppError(503, 'PROVIDER_UNAVAILABLE', 'Local Piper engine could not start')); });
      child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else if (code !== 0) reject(new AppError(502, 'PROVIDER_UNAVAILABLE', 'Local Piper narration failed')); else resolve(Buffer.concat(chunks)); });
      child.stdin.end(JSON.stringify({ ...input, lengthScale: piperLengthScale(input.voiceId, input.text, input.targetDurationSeconds) }));
    }).finally(() => { running = false; });
    const { duration } = parsePcmWav(audio);
    let peak = 0; for (let offset = 44; offset + 2 <= audio.length; offset += 2) peak = Math.max(peak, Math.abs(audio.readInt16LE(offset)));
    if (duration <= 0 || peak < 4) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Piper returned empty or silent narration');
    return { providerId: 'piper-local', model: piperVoices.find(item => item.id === voice.id)!.model, status: 'completed', output: { audio, duration, mimeType: 'audio/wav' }, estimatedCost: 0, usage: { characters: input.text.length, durationSeconds: duration } };
  }
}
