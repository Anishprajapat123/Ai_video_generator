import { Router } from 'express';
import { sceneController } from './scene.controller.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';

import { z } from 'zod';
import { validate } from '../../common/middleware/validate.middleware.js';
import { objectId, sceneUpdateSchema } from '../../common/utils/validation.js';
const router = Router();
router.param("projectId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });
router.param("sceneId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });

router.use(requireAuth);

router.get('/projects/:projectId/scenes', sceneController.list);
router.get('/scenes/:sceneId', sceneController.get);
router.patch('/scenes/:sceneId', validate(z.object({ params: z.object({ sceneId: objectId }), body: sceneUpdateSchema })), sceneController.update);
router.delete('/scenes/:sceneId', validate(z.object({ params: z.object({ sceneId: objectId }) })), sceneController.delete);
router.post('/scenes/:sceneId/regenerate', validate(z.object({ params: z.object({ sceneId: objectId }), body: z.object({ instructions: z.object({ narration: z.string().trim().min(1).max(2000).optional(), visual: z.string().trim().min(1).max(2000).optional(), providerId: z.string().max(100).optional() }).strict().refine(v => Boolean(v.narration || v.visual), 'Provide rewrite instructions') }).strict() })), rateLimit('generation', 20, 60 * 60 * 1000, true), sceneController.regenerate);

export default router;

