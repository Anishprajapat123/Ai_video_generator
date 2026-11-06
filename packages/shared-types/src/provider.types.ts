export type ProviderCapability =
  | 'llm'
  | 'document-understanding'
  | 'image-generation'
  | 'video-generation'
  | 'text-to-speech'
  | 'speech-to-text'
  | 'translation'
  | 'music-generation'
  | 'sound-effects';

export interface ProviderMetadata {
  id: string;
  name: string;
  capabilities: ProviderCapability[];
  enabled: boolean;
  priority: number;
}

export interface ProviderRequest {
  userId: string;
  workspaceId: string;
  projectId?: string;
  sceneId?: string;
  capability: ProviderCapability;
  model?: string;
  input: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface ProviderResponse {
  collaboration?: { stages: { role: string; providerId: string; model?: string }[]; revised: boolean; summary: string };
  providerId: string;
  model?: string;
  status: 'completed' | 'processing';
  output?: Record<string, unknown>;
  externalJobId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    characters?: number;
    durationSeconds?: number;
    credits?: number;
  };
  estimatedCost?: number;
}

export interface AIProviderContract {
  metadata: ProviderMetadata;
  isAvailable(): Promise<boolean>;
  execute(request: ProviderRequest): Promise<ProviderResponse>;
}

