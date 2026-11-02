import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { requireWorkspaceAccess } from '../../common/utils/access.js';
import { WorkspaceModel } from '../../database/models/Workspace.model.js';
import { WorkspaceMemberModel } from '../../database/models/WorkspaceMember.model.js';
import { AppError } from '../../common/errors/app-error.js';

export class WorkspaceService {
  async listUserWorkspaces(userId: string) {
    const memberships = await WorkspaceMemberModel.find({ userId, status: 'active' }).populate('workspaceId');
    return memberships.map((m) => ({
      workspace: m.workspaceId,
      role: m.role,
    }));
  }

  async getWorkspaceById(workspaceId: string, userId: string) {
    const membership = await requireWorkspaceAccess(workspaceId, userId);

    const workspace = await WorkspaceModel.findById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found');
    }

    return { workspace, role: membership.role };
  }

  async createWorkspace(userId: string, name: string, type: 'personal' | 'team' = 'personal') {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${randomUUID()}`;
    const workspace = new WorkspaceModel({
      name,
      slug,
      ownerId: userId,
      type,
    });
    return mongoose.connection.transaction(async (session) => {
    await workspace.save({ session });

    const member = new WorkspaceMemberModel({
      workspaceId: workspace._id,
      userId,
      role: 'owner',
    });
    await member.save({ session });

    return workspace;
    });
  }
}

export const workspaceService = new WorkspaceService();

