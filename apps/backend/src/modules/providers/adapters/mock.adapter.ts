import { IAIProvider } from '../provider.interface.js';
import { ProviderMetadata, ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';

export class MockAIProvider implements IAIProvider {
  public metadata: ProviderMetadata = {
    id: 'mock-ai',
    name: 'Mock AI Studio Provider',
    capabilities: ['llm'],
    enabled: true,
    priority: 99,
  };

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    const capability = request.capability;
    const input = request.input;

    if (capability !== 'llm') throw new Error('Unsupported mock capability');
    if (input.task === 'scene-rewrite') {
      return { providerId: 'mock-ai', model: 'mock-fast-v1', status: 'completed', output: { narration: '[MOCK] Rewritten narration', visualDescription: '[MOCK] Rewritten visual description' }, estimatedCost: 0 };
    }
    if (capability === 'llm') {
      const prompt = (input.prompt as string) || 'Explain Artificial Intelligence';

      return {
        providerId: this.metadata.id,
        model: 'mock-fast-v1',
        status: 'completed',
        output: {
          title: `[MOCK] Video Script: ${prompt.slice(0, 40)}`,
          sections: [
            {
              sectionId: 'sec_001',
              heading: 'The Hook',
              narration: `Welcome to this exploration of ${prompt}. In the next two minutes, we will unpack the core fundamentals.`,
              estimatedDuration: 15,
              order: 1,
            },
            {
              sectionId: 'sec_002',
              heading: 'The Core Concept',
              narration: `At its foundation, this technology processes structured patterns to produce actionable insights at superhuman speeds.`,
              estimatedDuration: 25,
              order: 2,
            },
            {
              sectionId: 'sec_003',
              heading: 'Real-World Application',
              narration: `From automated pipelines to intelligent assistants, this transforms everyday workflows across industries.`,
              estimatedDuration: 20,
              order: 3,
            },
            {
              sectionId: 'sec_004',
              heading: 'Summary & Next Steps',
              narration: `Thank you for watching. Subscribe and stay tuned for the next deep dive.`,
              estimatedDuration: 10,
              order: 4,
            },
          ],
          totalWordCount: 120,
          estimatedDuration: 70,
        },
        usage: {
          inputTokens: 120,
          outputTokens: 250,
        },
        estimatedCost: 0,
      };
    }

    throw new Error('Unsupported mock request');
  }
}

