import { Router } from 'express';
import { z } from 'zod';
import { authController } from './auth.controller.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';

import { issueCsrfToken } from '../../common/middleware/csrf.middleware.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
const router = Router();
router.get('/csrf', issueCsrfToken);

const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes'),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(1024),
  }),
});

router.post('/register', (req, res, next) => {
  if (!env.allowRegistration) return next(AppError.forbidden('Registration is closed. Sign in with your existing studio account.'));
  next();
}, rateLimit('register', 5, 15 * 60 * 1000), validate(registerSchema), authController.register);
router.post('/login', rateLimit('login', 10, 15 * 60 * 1000), validate(loginSchema), authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/logout', requireAuth, authController.logout);

export default router;

