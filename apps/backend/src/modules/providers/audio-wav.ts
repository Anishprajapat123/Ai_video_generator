import { AppError } from '../../common/errors/app-error.js';

export function parsePcmWav(audio: Buffer) {
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE' || audio.toString('ascii', 12, 16) !== 'fmt ' || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || ![1, 2].includes(audio.readUInt16LE(22)) || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data' || audio.readUInt32LE(40) !== audio.length - 44) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Voice engine returned invalid PCM WAV audio');
  const channels = audio.readUInt16LE(22); const sampleRate = audio.readUInt32LE(24);
  if (sampleRate < 8000 || sampleRate > 96000 || audio.readUInt32LE(28) !== sampleRate * channels * 2 || audio.readUInt16LE(32) !== channels * 2) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Voice engine returned invalid WAV format');
  return { channels, sampleRate, duration: (audio.length - 44) / (sampleRate * channels * 2) };
}

// Tolerant reader for WAVs produced by voice engines or FFmpeg (extra chunks, metadata, etc.).
export function readPcmWav(audio: Buffer) {
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Audio file is not a PCM WAV');
  let offset = 12; let channels = 0; let sampleRate = 0; let pcm: Buffer | null = null;
  while (offset + 8 <= audio.length) {
    const id = audio.toString('ascii', offset, offset + 4); const size = audio.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > audio.length) break;
    if (id === 'fmt ') {
      if (audio.readUInt16LE(start) !== 1 || audio.readUInt16LE(start + 14) !== 16) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Only 16-bit PCM audio is supported');
      channels = audio.readUInt16LE(start + 2); sampleRate = audio.readUInt32LE(start + 4);
    }
    if (id === 'data') pcm = audio.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!pcm || ![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Audio file has no usable PCM stream');
  return { channels, sampleRate, pcm };
}

export function buildPcmWav(pcm: Buffer, channels: number, sampleRate: number) {
  if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000 || pcm.length % (channels * 2)) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Cannot build an invalid WAV file');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Pad with silence or trim trailing samples so the file lasts exactly the requested time.
export function matchPcmDuration(audio: Buffer, targetSeconds: number) {
  const { pcm, channels, sampleRate } = readPcmWav(audio);
  const frames = Math.max(1, Math.round(targetSeconds * sampleRate));
  const bytes = frames * channels * 2;
  let next: Buffer;
  if (pcm.length >= bytes) next = pcm.subarray(0, bytes);
  else { next = Buffer.alloc(bytes); pcm.copy(next); }
  return { audio: buildPcmWav(next, channels, sampleRate), duration: frames / sampleRate, channels, sampleRate };
}
