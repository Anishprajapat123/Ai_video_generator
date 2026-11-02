export type JobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'waiting-for-provider'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JobType =
  | 'content-understanding'
  | 'script-generation'
  | 'storyboard-generation'
  | 'image-generation'
  | 'video-generation'
  | 'voice-generation'
  | 'speech-to-text'
  | 'translation'
  | 'scene-render'
  | 'video-render';

export interface GenerationJob {
  id: string;
  workspaceId: string;
  projectId?: string;
  sceneId?: string;
  pipelineRunId?: string;
  requestedBy: string;
  providerId: string;
  model?: string;
  capability: string;
  jobType: JobType;
  status: JobStatus;
  progress: number;
  inputReference?: Record<string, unknown>;
  outputAssetIds?: string[];
  externalJobId?: string;
  attempts: number;
  maxAttempts: number;
  error?: string | null;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

