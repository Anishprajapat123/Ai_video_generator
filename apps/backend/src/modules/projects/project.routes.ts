import { Router } from 'express';
import { z } from 'zod';
import { projectController } from './project.controller.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';

import { objectId, projectSettingsSchema } from '../../common/utils/validation.js';
const router = Router({ mergeParams: true });

const createProjectSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).optional(),
    creationType: z.enum(['prompt', 'script', 'document', 'image', 'audio', 'video', 'article', 'template']).default('prompt'),
    workspaceId: objectId.optional(),
    settings: projectSettingsSchema.optional(),
  }),
});

const updateProjectSchema = z.object({
  params: z.object({
    projectId: objectId,
  }),
  body: z.object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(['draft', 'archived']).optional(),
    settings: projectSettingsSchema.optional(),
  }),
});

router.use(requireAuth);
router.use((req, _res, next) => { try { for (const [key, value] of Object.entries(req.params)) { if (key.endsWith('Id')) objectId.parse(value); } next(); } catch (e) { next(e); } });

router.get('/', validate(z.object({ query: z.object({
    workspaceId: objectId.optional(), page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(['draft', 'processing', 'ready', 'rendering', 'completed', 'failed', 'archived']).optional(), search: z.string().max(200).optional(),
  }) })), projectController.list);
router.post('/', validate(createProjectSchema), projectController.create);
router.get('/:projectId', validate(z.object({ params: z.object({ projectId: objectId }) })), projectController.get);
router.patch('/:projectId', validate(updateProjectSchema), projectController.update);
router.delete('/:projectId', validate(z.object({ params: z.object({ projectId: objectId }) })), projectController.delete);

export default router;

