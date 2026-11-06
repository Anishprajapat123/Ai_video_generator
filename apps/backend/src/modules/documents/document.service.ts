import { spawn } from 'node:child_process';
import { AppError } from '../../common/errors/app-error.js';

let active = false;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export async function extractPdf(bytes: Buffer): Promise<{ text: string; pages: number; truncated: boolean }> {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw AppError.badRequest('Choose a valid PDF up to 5 MB.');
  }
  if (active) throw new AppError(429, 'QUOTA_EXCEEDED', 'Another PDF is being read. Try again shortly.');
  active = true;
  // Isolate parsing so malformed PDFs cannot block the API's event loop.
  const code = `
    const { PDFParse } = require(process.argv[1]);
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', async () => {
      const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)), isEvalSupported: false });
      try {
        const info = await parser.getInfo();
        if (info.total > 50) throw new Error('page-limit');
        const result = await parser.getText({ pageJoiner: '\\n' });
        const text = result.text.replace(/\\u0000/g, '').replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim();
        console.log('STUDIO_PDF_RESULT:' + JSON.stringify({ text: text.slice(0, 9000), pages: info.total, truncated: text.length > 9000 }));
      } catch (error) {
        console.log('STUDIO_PDF_RESULT:' + JSON.stringify({ error: error.message === 'page-limit' ? 'Use a PDF with 50 pages or fewer.' : 'Cannot read this PDF. Use an unencrypted PDF with selectable text.' }));
      } finally { await parser.destroy(); }
    });
  `;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--max-old-space-size=256', '-e', code, require.resolve('pdf-parse')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      const timer = setTimeout(() => { reject(new AppError(408, 'PROVIDER_TIMEOUT', 'PDF reading timed out. Try a smaller PDF.')); child.kill(); }, 15000);
      child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 100000) child.kill(); });
      child.stderr.resume();
      child.stdin.on('error', () => {});
      child.once('error', () => { clearTimeout(timer); reject(AppError.badRequest('Cannot start PDF reader.')); });
      child.once('close', () => {
        clearTimeout(timer);
        let result: { text: string; pages: number; truncated: boolean; error?: string };
        try { result = JSON.parse((output.split(/\r?\n/).find(line => line.startsWith('STUDIO_PDF_RESULT:')) || '').slice('STUDIO_PDF_RESULT:'.length)); }
        catch { reject(AppError.badRequest('Cannot read this PDF. Try a smaller, unencrypted document.')); return; }
        if (result.error) reject(AppError.badRequest(result.error));
        else if (!result.text || result.text.length < 5) reject(AppError.badRequest('No readable text found. Scanned PDFs need OCR; use a PDF with selectable text.'));
        else resolve({ text: result.text, pages: result.pages, truncated: result.truncated });
      });
      child.stdin.end(bytes);
    });
  } finally { active = false; }
}
