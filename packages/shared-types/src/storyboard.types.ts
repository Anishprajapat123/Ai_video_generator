export interface StoryboardSceneSummary {
  sceneId: string;
  title: string;
  description: string;
  duration: number;
  order: number;
  visualType: 'animation' | 'image' | 'video' | 'typography' | 'hybrid';
  transition: string;
}

export interface Storyboard {
  id: string;
  workspaceId: string;
  projectId: string;
  scriptId: string;
  version: number;
  title: string;
  scenes: StoryboardSceneSummary[];
  totalDuration: number;
  status: 'draft' | 'approved' | 'superseded';
  providerMetadata?: {
    providerId: string;
    model: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

