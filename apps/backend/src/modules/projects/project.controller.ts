import { Request, Response, NextFunction } from 'express';
import { projectService } from './project.service.js';
import { sendCreated, sendSuccess } from '../../common/utils/response.js';

export class ProjectController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = req.params.workspaceId || (req.query.workspaceId as string) || req.user!.workspaceId;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await projectService.listWorkspaceProjects(workspaceId, req.user!.userId, {
        page,
        limit,
        status,
        search,
      });

      return sendSuccess(res, { projects: result.projects, pagination: result.pagination }, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const project = await projectService.getProjectById(projectId, req.user!.userId);
      return sendSuccess(res, { project });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = req.params.workspaceId || req.body.workspaceId || req.user!.workspaceId;
      const project = await projectService.createProject(workspaceId, req.user!.userId, req.body);
      return sendCreated(res, { project });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const project = await projectService.updateProject(projectId, req.user!.userId, req.body);
      return sendSuccess(res, { project });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      await projectService.deleteProject(projectId, req.user!.userId);
      return sendSuccess(res, { message: 'Project deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export const projectController = new ProjectController();

