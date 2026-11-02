import { Router } from 'express';
import { z } from 'zod';
import { workspaceController } from './workspace.controller.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';

import { objectId } from '../../common/utils/validation.js';
const router = Router();
router.param('workspaceId', (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });

const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    type: z.enum(['personal', 'team']).optional(),
  }),
});

router.use(requireAuth);

router.get('/', workspaceController.list);
router.post('/', validate(createWorkspaceSchema), workspaceController.create);
router.get('/:workspaceId', workspaceController.get);

export default router;

