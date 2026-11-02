import { requireWorkspaceAccess, requireProjectAccess } from '../../common/utils/access.js';
import { ProjectModel, IProjectDocument } from '../../database/models/Project.model.js';
import { CreateProjectDto, UpdateProjectDto } from '@ai-video-studio/shared-types';
import { AppError } from '../../common/errors/app-error.js';

export class ProjectService {
  private async verifyWorkspaceAccess(workspaceId: string, userId: string, requiredRole: 'viewer' | 'editor' = 'editor') {
    return requireWorkspaceAccess(workspaceId, userId, requiredRole === 'editor');
  }

  async listWorkspaceProjects(
    workspaceId: string,
    userId: string,
    options: { page?: number; limit?: number; status?: string; search?: string }
  ) {
    await this.verifyWorkspaceAccess(workspaceId, userId, 'viewer');

    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { workspaceId, deletedAt: null };
    if (options.status) {
      query.status = options.status;
    }
    if (options.search) {
      query.title = { $regex: options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const [projects, total] = await Promise.all([
      ProjectModel.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      ProjectModel.countDocuments(query),
    ]);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProjectById(projectId: string, userId: string): Promise<IProjectDocument> {
    return requireProjectAccess(projectId, userId);
  }

  async createProject(workspaceId: string, userId: string, dto: CreateProjectDto): Promise<IProjectDocument> {
    await this.verifyWorkspaceAccess(workspaceId, userId, 'editor');

    const project = new ProjectModel({
      workspaceId,
      ownerId: userId,
      title: dto.title,
      description: dto.description,
      creationType: dto.creationType,
      status: 'draft',
      settings: {
        duration: dto.settings?.duration || 60,
        aspectRatio: dto.settings?.aspectRatio || '16:9',
        resolution: dto.settings?.resolution || '1080p',
        fps: dto.settings?.fps || 30,
        language: dto.settings?.language || 'en',
        style: dto.settings?.style || 'animated-explainer',
        subtitlesEnabled: dto.settings?.subtitlesEnabled ?? true,
        musicEnabled: dto.settings?.musicEnabled ?? true,
      },
    });

    await project.save();
    return project;
  }

  async updateProject(projectId: string, userId: string, dto: UpdateProjectDto): Promise<IProjectDocument> {
    const project = await this.getProjectById(projectId, userId);
    await this.verifyWorkspaceAccess(project.workspaceId.toString(), userId, 'editor');

    if (dto.title !== undefined) project.title = dto.title;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.status !== undefined && !['draft', 'archived'].includes(dto.status)) throw AppError.badRequest('Job status cannot be changed directly');
    if (dto.status !== undefined) project.status = dto.status;
    if (dto.settings) {
      if (project.storyboardId && dto.settings.duration !== undefined && dto.settings.duration !== project.settings.duration) {
        throw AppError.badRequest('Change scene durations to update an existing storyboard duration');
      }
      project.settings = { ...project.settings, ...dto.settings };
      project.finalVideoAssetId = null;
      project.status = 'draft';
    }

    await project.save();
    return project;
  }

  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await this.getProjectById(projectId, userId);
    await this.verifyWorkspaceAccess(project.workspaceId.toString(), userId, 'editor');

    // Retain dependencies until a storage-aware cleanup workflow can safely purge them.
    project.deletedAt = new Date();
    await project.save();
  }
}

export const projectService = new ProjectService();

