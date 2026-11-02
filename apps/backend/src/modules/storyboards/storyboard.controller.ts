import { Request, Response, NextFunction } from 'express';
import { storyboardService } from './storyboard.service.js';
import { sendCreated, sendSuccess } from '../../common/utils/response.js';

export class StoryboardController {
  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { scriptId } = req.body;
      const storyboard = await storyboardService.generateStoryboardFromScript(projectId, scriptId, req.user!.userId);
      return sendCreated(res, { storyboard });
    } catch (err) {
      next(err);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { storyboardId } = req.params;
      const storyboard = await storyboardService.getStoryboard(storyboardId, req.user!.userId);
      return sendSuccess(res, { storyboard });
    } catch (err) {
      next(err);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const { storyboardId } = req.params;
      const storyboard = await storyboardService.approveStoryboard(storyboardId, req.user!.userId);
      return sendSuccess(res, { storyboard });
    } catch (err) {
      next(err);
    }
  }
}

export const storyboardController = new StoryboardController();

