import { Router } from 'express';
import { z } from 'zod';
import { storyboardController } from './storyboard.controller.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';

import { objectId } from '../../common/utils/validation.js';
const router = Router();
router.param("projectId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });
router.param("storyboardId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });

const generateStoryboardSchema = z.object({
  params: z.object({
    projectId: objectId,
  }),
  body: z.object({
    scriptId: objectId,
    reuseExisting: z.boolean().optional(),
  }),
});

router.use(requireAuth);

router.post('/projects/:projectId/storyboards/generate', validate(generateStoryboardSchema), storyboardController.generate);
router.get('/storyboards/:storyboardId', storyboardController.get);
router.post('/storyboards/:storyboardId/approve', validate(z.object({
  params: z.object({ storyboardId: objectId }),
  body: z.object({ expectedRevision: z.number().int().nonnegative().optional() }).default({}),
})), storyboardController.approve);

export default router;

