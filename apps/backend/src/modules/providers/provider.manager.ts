import { IAIProvider } from './provider.interface.js';
import { GeminiProvider } from './adapters/gemini.adapter.js';
import { MockAIProvider } from './adapters/mock.adapter.js';
import { ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { randomUUID } from 'node:crypto';
import { UsageRecordModel } from '../../database/models/UsageRecord.model.js';

type UsageEvent = { request: ProviderRequest; providerId: string; requestId: string; response?: ProviderResponse };
async function recordUsage(event: UsageEvent) {
  const { request, response } = event;
  await UsageRecordModel.create({ userId: request.userId, workspaceId: request.workspaceId, projectId: request.projectId,
    sceneId: request.sceneId, providerId: event.providerId, requestId: event.requestId, capability: request.capability,
    model: response?.model, usage: response?.usage, estimatedCost: response?.estimatedCost, status: response ? 'success' : 'failed' });
}

export class AIProviderManager {
  private providers = new Map<string, IAIProvider>();
  constructor(providers: IAIProvider[] = [new GeminiProvider(), ...(env.ENABLE_MOCK_PROVIDER ? [new MockAIProvider()] : [])], private recorder: (event: UsageEvent) => Promise<void> = recordUsage) {
    for (const provider of providers) this.register(provider);
  }
  register(provider: IAIProvider) { this.providers.set(provider.metadata.id, provider); }
  getProvider(id: string) { return this.providers.get(id); }
  listProviders() { return [...this.providers.values()].map(p => p.metadata); }
  private async executeRecorded(provider: IAIProvider, request: ProviderRequest) {
    const requestId = randomUUID();
    let response: ProviderResponse;
    try { response = await provider.execute(request); }
    catch (error) {
      try { await this.recorder({ request, requestId, providerId: provider.metadata.id }); }
      catch { throw new AppError(503, 'QUOTA_EXCEEDED', 'Could not record provider usage; generation stopped'); }
      throw error;
    }
    // Accounting failures must not cause another paid provider call.
    try { await this.recorder({ request, requestId, providerId: provider.metadata.id, response }); }
    catch { throw new AppError(503, 'QUOTA_EXCEEDED', 'Could not record provider usage; generation stopped'); }
    return response;
  }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    const requested = request.options?.providerId;
    if (requested !== undefined) {
      if (typeof requested !== 'string') throw AppError.badRequest('Invalid provider ID');
      const provider = this.providers.get(requested);
      if (!provider || !provider.metadata.enabled) throw new AppError(503, 'PROVIDER_DISABLED', 'Requested provider is disabled');
      if (!provider.metadata.capabilities.includes(request.capability)) throw AppError.badRequest('Provider does not support this capability');
      if (!await provider.isAvailable()) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Requested provider is unavailable');
      return this.executeRecorded(provider, request);
    }
    // Mocks must always be explicitly selected, even in development.
    const candidates = [...this.providers.values()].filter(p => p.metadata.id !== 'mock-ai' && p.metadata.enabled && p.metadata.capabilities.includes(request.capability))
      .sort((a, b) => a.metadata.priority - b.metadata.priority);
    let lastError: unknown;
    for (const provider of candidates) {
      if (!await provider.isAvailable()) continue;
      try { return await this.executeRecorded(provider, request); }
      catch (error) {
        lastError = error;
        // Further requests need an explicit routing decision: a timeout may already have consumed credits.
        if (request.options?.allowFallback !== true || !(error instanceof AppError) ||
            ['PROVIDER_AUTHENTICATION_FAILED', 'PROVIDER_TIMEOUT', 'QUOTA_EXCEEDED'].includes(error.code)) throw error;
      }
    }
    if (lastError instanceof AppError) throw lastError;
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'No configured AI provider could complete this request');
  }
}
export const providerManager = new AIProviderManager();
