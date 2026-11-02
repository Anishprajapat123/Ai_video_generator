import { WorkspaceMemberModel } from '../../database/models/WorkspaceMember.model.js';
import { ProjectModel } from '../../database/models/Project.model.js';
import { AppError } from '../errors/app-error.js';
export async function requireWorkspaceAccess(workspaceId: string, userId: string, write = false) {
  const member = await WorkspaceMemberModel.findOne({ workspaceId, userId, status: 'active' });
  if (!member || (write && member.role === 'viewer')) throw AppError.forbidden('You do not have permission for this workspace operation');
  return member;
}
export async function requireProjectAccess(projectId: string, userId: string, write = false) {
  const project = await ProjectModel.findOne({ _id: projectId, deletedAt: null });
  if (!project) throw AppError.notFound('Project not found');
  await requireWorkspaceAccess(project.workspaceId.toString(), userId, write);
  return project;
}
