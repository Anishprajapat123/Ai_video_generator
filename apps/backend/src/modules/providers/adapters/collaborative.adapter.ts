import type { ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import type { IAIProvider } from '../provider.interface.js';
import { env } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';
import { agentReviewSchema, agentBriefSchema } from './openrouter.adapter.js';

export class CollaborativeProvider implements IAIProvider {
  metadata = { id: 'studio-team', name: 'AI team · Gemma + Gemini + Nemotron review', capabilities: ['llm' as const], enabled: env.AI_TEAM_ENABLED && Boolean(env.OPENROUTER_API_KEY.trim() && env.GEMINI_API_KEY.trim() && env.GEMINI_MODEL), priority: 0 };
  constructor(private readonly executeChild: (request: ProviderRequest) => Promise<ProviderResponse>) {}
  async isAvailable() { return this.metadata.enabled; }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.metadata.enabled) throw new AppError(503, 'PROVIDER_DISABLED', 'AI team requires OPENROUTER_API_KEY, configured Gemini and AI_TEAM_ENABLED=true');
    const visual = request.input.task === 'visual-plan';
    const stages: { role: string; providerId: string; model?: string }[] = [];
    const call = async (providerId: string, role: string, input: Record<string, unknown>) => {
      const response = await this.executeChild({ ...request, input: { ...input, agentRole: role }, options: { ...request.options, providerId, allowFallback: false } });
      stages.push({ role, providerId, model: response.model });
      return response;
    };
    let input = { ...request.input };
    if (visual) {
      const planned = await call('openrouter-gemma', 'creative-director', { ...input, task: 'agent-brief' });
      const brief = agentBriefSchema.safeParse(planned.output);
      if (!brief.success) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Creative director returned an invalid plan');
      input = { ...input, collaborationContext: brief.data };
    }
    const author = visual ? 'gemini' : 'openrouter-gemma';
    let candidate = await call(author, visual ? 'motion-designer' : 'scriptwriter', input);
    let review = agentReviewSchema.parse((await call('openrouter-nemotron', 'reviewer', { task: 'agent-review', originalRequest: request.input, candidate: candidate.output })).output);
    let revised = false;
    if (!review.approved) {
      revised = true;
      candidate = await call(author, 'revision', { ...input, previousCandidate: candidate.output, reviewFeedback: review.issues });
      review = agentReviewSchema.parse((await call('openrouter-nemotron', 'final-review', { task: 'agent-review', originalRequest: request.input, candidate: candidate.output })).output);
    }
    if (!review.approved) throw new AppError(422, 'PROVIDER_INVALID_RESPONSE', 'The AI review still found problems after one correction pass. Saved content is unchanged.', { issues: review.issues });
    return { providerId: 'studio-team', model: 'Gemma + ' + (visual ? 'Gemini + ' : '') + 'Nemotron', status: 'completed', output: candidate.output,
      collaboration: { stages, revised, summary: review.summary } };
  }
}
