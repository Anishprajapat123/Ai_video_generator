import express, { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { requireWorkspaceAccess } from '../../common/utils/access.js';
import { objectId } from '../../common/utils/validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { AppError } from '../../common/errors/app-error.js';
import { extractPdf } from './document.service.js';

const router = Router();
router.post('/workspaces/:workspaceId/documents/extract', requireAuth,
  async (req, _res, next) => {
    try { await requireWorkspaceAccess(objectId.parse(req.params.workspaceId), req.user!.userId, true); next(); } catch (error) { next(error); }
  }, rateLimit('document-extraction', 20, 60 * 60 * 1000, true),
  express.raw({ type: 'application/pdf', limit: '5mb' }), async (req, res, next) => {
    try {
      if (!req.is('application/pdf') || !Buffer.isBuffer(req.body)) throw AppError.badRequest('Send a PDF file.');
      return sendSuccess(res, await extractPdf(req.body));
    } catch (error) { next(error); }
  });
export default router;
