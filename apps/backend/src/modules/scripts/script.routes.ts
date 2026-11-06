import { Router } from 'express';
import { z } from 'zod';
import { scriptController } from './script.controller.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { scriptOutputSchema } from '../providers/output.schemas.js';

import { objectId } from '../../common/utils/validation.js';
import { contentJobService } from '../media/content-job.service.js';
import { sendAccepted, sendSuccess } from '../../common/utils/response.js';
const router = Router();
router.param("projectId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });
router.param("scriptId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });

const generateScriptSchema = z.object({
  params: z.object({
    projectId: objectId,
  }),
  body: z.object({
    prompt: z.string().trim().min(5).max(10000),
    language: z.string().trim().min(1).max(100).optional(),
    tone: z.string().trim().min(1).max(100).optional(),
    targetAudience: z.string().trim().min(1).max(100).optional(),
    providerId: z.string().trim().min(1).max(100).optional(),
  }),
});

router.use(requireAuth);
router.get('/projects/:projectId/content-jobs/latest', async (req, res, next) => {
  try { return sendSuccess(res, { job: await contentJobService.latest(req.params.projectId, req.user!.userId) }); } catch (error) { next(error); }
});
router.post('/projects/:projectId/scripts/jobs', validate(generateScriptSchema), rateLimit('generation', 20, 60 * 60 * 1000, true), async (req, res, next) => {
  try { return sendAccepted(res, { job: await contentJobService.start('script', req.params.projectId, req.user!.userId, z.string().uuid().parse(req.get('X-Generation-Request')), req.body) }); } catch (error) { next(error); }
});
router.get('/content-jobs/:jobId', async (req, res, next) => {
  try { return sendSuccess(res, { job: await contentJobService.get(objectId.parse(req.params.jobId), req.user!.userId) }); } catch (error) { next(error); }
});

router.post('/projects/:projectId/scripts/generate', validate(generateScriptSchema), rateLimit('generation', 20, 60 * 60 * 1000, true), scriptController.generate);
router.get('/scripts/:scriptId', scriptController.get);
router.patch('/scripts/:scriptId', validate(z.object({
  params: z.object({ scriptId: objectId }),
  body: scriptOutputSchema.and(z.object({ expectedRevision: z.number().int().nonnegative() })),
})), scriptController.update);
router.post('/scripts/:scriptId/approve', validate(z.object({
  params: z.object({ scriptId: objectId }),
  body: z.object({ expectedRevision: z.number().int().nonnegative().optional() }).default({}),
})), scriptController.approve);

export default router;

