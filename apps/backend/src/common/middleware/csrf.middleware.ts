import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';
export function issueCsrfToken(req: Request, res: Response) {
  const existing = req.cookies?.csrf_token;
  const csrfToken = typeof existing === 'string' && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex');
  // Reuse the browser's valid token so one tab cannot invalidate another tab's write.
  if (csrfToken !== existing) res.cookie('csrf_token', csrfToken, { httpOnly: true, secure: env.secureCookies, sameSite: 'strict', path: '/api/v1' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { csrfToken } });
}
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies?.csrf_token;
  const header = req.get('x-csrf-token');
  const origin = req.get('origin');
  if ((origin && !env.allowedOrigins.includes(origin)) ||
      typeof cookie !== 'string' || !/^[a-f0-9]{64}$/.test(cookie) ||
      typeof header !== 'string' || !/^[a-f0-9]{64}$/.test(header) ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return next(AppError.forbidden('Invalid CSRF token or origin', 'CSRF_VALIDATION_FAILED'));
  }
  next();
}
