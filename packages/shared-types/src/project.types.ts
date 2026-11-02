export type CreationType =
  | 'prompt'
  | 'script'
  | 'document'
  | 'image'
  | 'audio'
  | 'video'
  | 'article'
  | 'template';

export type ProjectStatus =
  | 'draft'
  | 'processing'
  | 'ready'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'archived';

export interface ProjectSettings {
  duration: number; // in seconds
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  resolution: '720p' | '1080p' | '4k';
  fps: number;
  language: string;
  style: string;
  subtitlesEnabled: boolean;
  musicEnabled: boolean;
}

export interface Project {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  description?: string;
  creationType: CreationType;
  status: ProjectStatus;
  settings: ProjectSettings;
  scriptId?: string | null;
  storyboardId?: string | null;
  brandKitId?: string | null;
  currentVersionId?: string | null;
  thumbnailAssetId?: string | null;
  finalVideoAssetId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectDto {
  title: string;
  description?: string;
  creationType: CreationType;
  input?: {
    prompt?: string;
    scriptText?: string;
    documentAssetId?: string;
    url?: string;
  };
  settings?: Partial<ProjectSettings>;
}

export interface UpdateProjectDto {
  title?: string;
  description?: string;
  settings?: Partial<ProjectSettings>;
  status?: ProjectStatus;
}

