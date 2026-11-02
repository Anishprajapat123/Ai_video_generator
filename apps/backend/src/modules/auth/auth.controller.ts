import { Request, Response, NextFunction } from 'express';
import { createSession, sessionLifetimeMs } from './session.service.js';
import { SessionModel } from '../../database/models/Session.model.js';
import { authService } from './auth.service.js';
import { sendCreated, sendSuccess } from '../../common/utils/response.js';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password } = req.body;
      const result = await authService.register(name, email, password);

      const token = await createSession(result.user.id);
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: sessionLifetimeMs,
        path: '/api/v1',
      });

      return sendCreated(res, result);
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: sessionLifetimeMs,
        path: '/api/v1',
      });

      const { token: _token, ...data } = result;
      return sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.getMe(req.user!.userId);
      return sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
    await SessionModel.deleteOne({ _id: req.sessionId, userId: req.user!.userId });
    res.clearCookie('auth_token', { path: '/api/v1' });
    return sendSuccess(res, { message: 'Logged out successfully' });
    } catch (error) { next(error); }
  }
}

export const authController = new AuthController();

