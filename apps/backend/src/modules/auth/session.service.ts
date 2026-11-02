import { createHash, randomBytes } from 'node:crypto';
import { SessionModel } from '../../database/models/Session.model.js';
export const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await SessionModel.create({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + sessionLifetimeMs) });
  return token;
}
