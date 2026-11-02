import { ProviderMetadata, ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';

export interface IAIProvider {
  metadata: ProviderMetadata;
  isAvailable(): Promise<boolean>;
  execute(request: ProviderRequest): Promise<ProviderResponse>;
}

