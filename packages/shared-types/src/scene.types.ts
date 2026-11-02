export interface MotionGraphicElement {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  animation?: {
    type: string;
    duration: number;
    delay?: number;
  };
}

export interface SceneTimeline {
  startTime: number;
  endTime: number;
}

export interface SceneTransition {
  type: 'fade' | 'slide-left' | 'slide-right' | 'wipe' | 'none';
  duration: number;
}

export interface Scene {
  id: string;
  workspaceId: string;
  projectId: string;
  storyboardId?: string;
  sceneNumber: number;
  title: string;
  duration: number;
  narration?: string;
  visualDescription?: string;
  visualAssetIds: string[];
  voiceAssetId?: string | null;
  subtitleId?: string | null;
  motionGraphics: MotionGraphicElement[];
  timeline: SceneTimeline;
  transition: SceneTransition;
  status: 'draft' | 'pending' | 'ready' | 'rendering' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

