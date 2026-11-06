import { AppError } from '../../common/errors/app-error.js';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export function validateMediaBytes(bytes: Buffer, mime: string, kind: 'visual' | 'audio', generatedVideo = false) {
  if (!bytes.length || (!generatedVideo && bytes.length > MAX_UPLOAD_BYTES)) throw AppError.badRequest('Upload a nonempty file up to 8 MB');
  const ascii = (start: number, end: number) => bytes.toString('ascii', start, end);
  const matches: Record<string, boolean> = {
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/webp': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
    'video/mp4': ascii(4, 8) === 'ftyp' && !['avif', 'avis', 'heic', 'heix'].includes(ascii(8, 12)),
    'audio/mpeg': ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224),
    'audio/wav': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE',
  };
  if (!matches[mime] || (kind === 'audio') !== mime.startsWith('audio/')) throw AppError.badRequest('Unsupported file or file contents do not match its type');
  return mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'audio';
}
