export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'thumbnail' | 'other';
export type MediaSource = 'upload' | 'ai-generated' | 'stock' | 'template' | 'remotion-generated';

export interface MediaAsset {
  id: string;
  workspaceId: string;
  projectId?: string;
  sceneId?: string;
  uploadedBy: string;
  name: string;
  type: MediaType;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  storageProvider: 'local' | 's3';
  storageKey: string;
  source: MediaSource;
  sourceUrl?: string;
  status: 'pending' | 'ready' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

