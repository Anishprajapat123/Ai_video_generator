import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { extractPdf, MAX_PDF_BYTES } from '../src/modules/documents/document.service.js';
import { SessionModel } from '../src/database/models/Session.model.js';
import { UserModel } from '../src/database/models/User.model.js';
import { WorkspaceMemberModel } from '../src/database/models/WorkspaceMember.model.js';
import { RateLimitModel } from '../src/database/models/RateLimit.model.js';

function pdf(text: string) {
  const lines = text.match(/.{1,70}/g) || [''];
  const content = `BT /F1 6 Tf 40 750 Td 4 TL ${lines.map(line => '(' + line.replace(/[()\\]/g, '\\$&') + ') Tj T*').join(' ')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
}

test('PDF extraction reads real text, bounds output and rejects malformed or image-only documents', async () => {
  const result = await extractPdf(pdf('Waterfalls form where rivers flow over steep cliffs.'));
  assert.match(result.text, /Waterfalls form/); assert.equal(result.pages, 1); assert.equal(result.truncated, false);
  const long = await extractPdf(pdf('Waterfall '.repeat(1100)));
  assert.equal(long.text.length, 9000); assert.equal(long.truncated, true);
  await assert.rejects(extractPdf(Buffer.from('Not a PDF')), /valid PDF/);
  await assert.rejects(extractPdf(Buffer.alloc(MAX_PDF_BYTES + 1)), /valid PDF/);
  await assert.rejects(extractPdf(Buffer.from('%PDF-broken')), /Cannot read/);
  await assert.rejects(extractPdf(pdf('')), /No readable text/);
});

test('PDF HTTP import requires CSRF, authentication and active workspace editor access', async t => {
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const route = base + '/workspaces/111111111111111111111111/documents/extract';
  const csrfBody = await (await fetch(base + '/auth/csrf')).json() as { data: { csrfToken: string } };
  const csrf = csrfBody.data.csrfToken;
  const headers = { cookie: `csrf_token=${csrf}; auth_token=${'a'.repeat(64)}`, 'x-csrf-token': csrf, 'Content-Type': 'application/pdf' };
  const body = pdf('Waterfalls form where rivers cross steep cliffs.');
  assert.equal((await fetch(route, { method: 'POST', body })).status, 403);
  t.mock.method(SessionModel, 'findOne', async () => null);
  assert.equal((await fetch(route, { method: 'POST', headers, body })).status, 401);
  t.mock.method(SessionModel, 'findOne', async () => ({ id: 'session', userId: '222222222222222222222222' }));
  t.mock.method(UserModel, 'findById', async () => ({ id: '222222222222222222222222', status: 'active', email: 'test@example.test' }));
  let role: string | null = 'viewer';
  t.mock.method(WorkspaceMemberModel, 'findOne', async () => role ? { role } : null);
  assert.equal((await fetch(route, { method: 'POST', headers, body })).status, 403);
  role = null;
  assert.equal((await fetch(route, { method: 'POST', headers, body })).status, 403);
  role = 'editor';
  t.mock.method(RateLimitModel, 'findOneAndUpdate', async () => ({ count: 1 }));
  const response = await fetch(route, { method: 'POST', headers, body });
  assert.equal(response.status, 200); assert.match((await response.json() as { data: { text: string } }).data.text, /Waterfalls/);
  assert.equal((await fetch(route, { method: 'POST', headers, body: Buffer.from('invalid') })).status, 400);
});
