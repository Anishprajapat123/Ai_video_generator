import { Request, Response, NextFunction } from 'express';
import { SessionModel } from '../../database/models/Session.model.js';
import { UserModel } from '../../database/models/User.model.js';
import { hashToken } from '../../modules/auth/session.service.js';
import { AppError } from '../errors/app-error.js';
export interface AuthUserPayload { userId: string; email: string; workspaceId: string; }
declare global { namespace Express { interface Request { user?: AuthUserPayload; sessionId?: string; } } }
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.auth_token;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw AppError.unauthorized();
    const session = await SessionModel.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    if (!session) throw AppError.unauthorized('Session expired', 'SESSION_EXPIRED');
    const user = await UserModel.findById(session.userId);
    if (!user || user.status !== 'active') throw AppError.unauthorized('Account unavailable');
    req.user = { userId: user.id, email: user.email, workspaceId: user.defaultWorkspaceId?.toString() || '' };
    req.sessionId = session.id;
    next();
  } catch (error) { next(error); }
}
