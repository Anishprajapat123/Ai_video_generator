import { ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import { z } from 'zod';
import { env } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IAIProvider } from '../provider.interface.js';

export function pcmToWav(pcm: Buffer, sampleRate = 22050) {
  if (!pcm.length || pcm.length % 2 || pcm.length > 8 * 1024 * 1024 - 44) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Voice provider returned invalid or oversized audio');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return { audio: Buffer.concat([header, pcm]), duration: pcm.length / (sampleRate * 2) };
}
export class ElevenLabsProvider implements IAIProvider {
  metadata = { id: 'elevenlabs', name: 'ElevenLabs', capabilities: ['text-to-speech' as const], enabled: Boolean(env.ELEVENLABS_API_KEY.trim()), priority: 1 };
  async isAvailable() { return this.metadata.enabled; }
  private async request(url: string, body?: unknown) {
    if (!await this.isAvailable()) throw new AppError(503, 'PROVIDER_DISABLED', 'Configure ELEVENLABS_API_KEY and restart the backend');
    try {
      const response = await fetch('https://api.elevenlabs.io' + url, { method: body ? 'POST' : 'GET',
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY.trim(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS) });
      if ([401, 403].includes(response.status)) throw new AppError(502, 'PROVIDER_AUTHENTICATION_FAILED', 'ElevenLabs rejected the key or its permissions');
      if (response.status === 429) throw new AppError(429, 'PROVIDER_RATE_LIMITED', 'ElevenLabs quota or request limit reached');
      if (response.status === 402) throw new AppError(402, 'QUOTA_EXCEEDED', 'ElevenLabs credits are unavailable');
      if (!response.ok) throw new AppError(502, 'PROVIDER_UNAVAILABLE', `ElevenLabs rejected the request (HTTP ${response.status}). Check voice and model access.`);
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) throw new AppError(504, 'PROVIDER_TIMEOUT', 'ElevenLabs timed out. Credits may have been used; check your provider history before retrying.');
      throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'Cannot reach ElevenLabs');
    }
  }
  async voices() {
    const response = await this.request('/v2/voices?page_size=100');
    const schema = z.object({ voices: z.array(z.object({ voice_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), name: z.string(), preview_url: z.string().url().nullable().optional() })) });
    const result = schema.safeParse(await response.json().catch(() => null));
    if (!result.success) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'ElevenLabs returned an invalid voice list');
    return result.data.voices.map(voice => ({ id: voice.voice_id, name: voice.name, previewUrl: voice.preview_url?.startsWith('https://') ? voice.preview_url : undefined }));
  }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.capability !== 'text-to-speech') throw AppError.badRequest('ElevenLabs adapter supports narration only');
    const input = z.object({ text: z.string().trim().min(1).max(10000), voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).parse(request.input);
    const response = await this.request('/v1/text-to-speech/' + input.voiceId + '?output_format=pcm_22050', { text: input.text, model_id: env.ELEVENLABS_MODEL });
    const reader = response.body?.getReader();
    if (!reader) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'ElevenLabs returned no audio');
    const chunks: Buffer[] = []; let length = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength;
        if (length > 8 * 1024 * 1024 - 44) { await reader.cancel(); throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Generated narration exceeds the scene audio limit'); }
        chunks.push(Buffer.from(chunk.value)); }
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'ElevenLabs audio transfer was interrupted. Check provider history before retrying.'); }
    const { audio, duration } = pcmToWav(Buffer.concat(chunks));
    return { providerId: 'elevenlabs', model: env.ELEVENLABS_MODEL, status: 'completed', output: { audio, duration, mimeType: 'audio/wav' }, usage: { characters: input.text.length, durationSeconds: duration } };
  }
}
