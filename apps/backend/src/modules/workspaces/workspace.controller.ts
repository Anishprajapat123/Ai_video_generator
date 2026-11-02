import { Request, Response, NextFunction } from 'express';
import { workspaceService } from './workspace.service.js';
import { sendCreated, sendSuccess } from '../../common/utils/response.js';

export class WorkspaceController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaces = await workspaceService.listUserWorkspaces(req.user!.userId);
      return sendSuccess(res, { workspaces });
    } catch (err) {
      next(err);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { workspaceId } = req.params;
      const result = await workspaceService.getWorkspaceById(workspaceId, req.user!.userId);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, type } = req.body;
      const workspace = await workspaceService.createWorkspace(req.user!.userId, name, type);
      return sendCreated(res, { workspace });
    } catch (err) {
      next(err);
    }
  }
}

export const workspaceController = new WorkspaceController();

