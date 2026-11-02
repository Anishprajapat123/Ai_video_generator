import { Request, Response, NextFunction } from 'express';
import { sceneService } from './scene.service.js';
import { sendSuccess } from '../../common/utils/response.js';

export class SceneController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const scenes = await sceneService.listProjectScenes(projectId, req.user!.userId);
      return sendSuccess(res, { scenes });
    } catch (err) {
      next(err);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { sceneId } = req.params;
      const scene = await sceneService.getSceneById(sceneId, req.user!.userId);
      return sendSuccess(res, { scene });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { sceneId } = req.params;
      const scene = await sceneService.updateScene(sceneId, req.user!.userId, req.body);
      return sendSuccess(res, { scene });
    } catch (err) {
      next(err);
    }
  }

  async regenerate(req: Request, res: Response, next: NextFunction) {
    try {
      const { sceneId } = req.params;
      const scene = await sceneService.regenerateScene(sceneId, req.user!.userId, req.body.instructions);
      return sendSuccess(res, { scene });
    } catch (err) {
      next(err);
    }
  }
}

export const sceneController = new SceneController();

