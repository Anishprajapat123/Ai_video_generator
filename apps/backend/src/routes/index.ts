import { requireAuth } from '../common/middleware/auth.middleware.js';
import { objectId } from '../common/utils/validation.js';
import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import workspaceRoutes from '../modules/workspaces/workspace.routes.js';
import projectRoutes from '../modules/projects/project.routes.js';
import scriptRoutes from '../modules/scripts/script.routes.js';
import storyboardRoutes from '../modules/storyboards/storyboard.routes.js';
import sceneRoutes from '../modules/scenes/scene.routes.js';
import mediaRoutes from '../modules/media/media.routes.js';
import documentRoutes from '../modules/documents/document.routes.js';
import { providerManager } from '../modules/providers/provider.manager.js';
import { sendSuccess } from '../common/utils/response.js';

const router = Router();
router.param("workspaceId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });
router.param("projectId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });
router.param("scriptId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });
router.param("storyboardId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });
router.param("sceneId", (_req, _res, next, value) => { try { objectId.parse(value); next(); } catch (e) { next(e); } });

// Health check endpoint
router.get('/health', (_req, res) => {
  return sendSuccess(res, {
    status: 'ok',
    service: 'AI Video Studio API',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// Providers inspection endpoint
router.get('/providers', requireAuth, (_req, res) => {
  const providers = providerManager.listProviders();
  return sendSuccess(res, { providers });
});

// Module routes
router.use('/auth', authRoutes);
router.use('/workspaces/:workspaceId/projects', projectRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/projects', projectRoutes);
router.use('/', scriptRoutes);
router.use('/', storyboardRoutes);
router.use('/', sceneRoutes);
router.use('/', mediaRoutes);
router.use('/', documentRoutes);

export default router;

