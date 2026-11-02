import { Request, Response, NextFunction } from 'express';
import { scriptService } from './script.service.js';
import { sendCreated, sendSuccess } from '../../common/utils/response.js';

export class ScriptController {
  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { prompt, language, tone, targetAudience, providerId } = req.body;

      const script = await scriptService.generateScript(projectId, req.user!.userId, {
        prompt,
        language,
        tone,
        targetAudience,
        providerId,
      });

      return sendCreated(res, { script });
    } catch (err) {
      next(err);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { scriptId } = req.params;
      const script = await scriptService.getScriptById(scriptId, req.user!.userId);
      return sendSuccess(res, { script });
    } catch (err) {
      next(err);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const { scriptId } = req.params;
      const script = await scriptService.approveScript(scriptId, req.user!.userId, req.body.expectedRevision);
      return sendSuccess(res, { script });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const script = await scriptService.updateScript(req.params.scriptId, req.user!.userId, req.body);
      return sendSuccess(res, { script });
    } catch (error) { next(error); }
  }
}

export const scriptController = new ScriptController();

