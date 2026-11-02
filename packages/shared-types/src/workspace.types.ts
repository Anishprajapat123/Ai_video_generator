export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type WorkspaceType = 'personal' | 'team' | 'enterprise';

export interface WorkspaceSettings {
  defaultLanguage: string;
  defaultAspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  defaultResolution: '720p' | '1080p' | '4k';
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  type: WorkspaceType;
  status: 'active' | 'archived';
  settings: WorkspaceSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: 'active' | 'invited' | 'suspended';
  joinedAt?: Date;
  createdAt: Date;
}

