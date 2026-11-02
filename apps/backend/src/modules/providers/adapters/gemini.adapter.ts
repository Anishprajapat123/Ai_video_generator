import { IAIProvider } from '../provider.interface.js';
import { ProviderMetadata, ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import { env } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';
import { sceneRewriteSchema, scriptOutputSchema } from '../output.schemas.js';

export class GeminiProvider implements IAIProvider {
  metadata: ProviderMetadata = {
    id: 'gemini', name: 'Google Gemini', capabilities: ['llm'],
    enabled: Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL), priority: 1,
  };
  async isAvailable() { return this.metadata.enabled; }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (!await this.isAvailable()) throw new AppError(503, 'PROVIDER_DISABLED', 'Configure GEMINI_API_KEY and GEMINI_MODEL');
    if (request.capability !== 'llm') throw AppError.badRequest('This adapter currently supports text generation only');
    const rewrite = request.input.task === 'scene-rewrite';
    const instruction = rewrite
      ? 'Return a JSON object with narration and/or visualDescription strings, matching the requested changes. Preserve fields that are not requested.'
      : 'Return a JSON video script with title and sections. Each section must have sectionId, heading, narration, estimatedDuration (seconds), order (starting at 1), and visualSuggestion. Use unique section IDs. Follow the supplied language, tone, audience, style and total duration. Maximum 50 sections and 600 total seconds.';
    const model = env.GEMINI_MODEL;
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ parts: [{ text: JSON.stringify(request.input) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 8192 },
        }),
      });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw new AppError(502, 'PROVIDER_AUTHENTICATION_FAILED', 'AI provider authentication failed');
        if (response.status === 429) throw new AppError(429, 'PROVIDER_RATE_LIMITED', 'AI provider rate limit reached');
        throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'AI provider request failed');
      }
      const json = await response.json().catch(() => { throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'AI returned an invalid response'); }) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const candidate = json.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'AI response was blocked or incomplete');
      const text = candidate.content?.parts?.map(p => p.text || '').join('');
      let output: unknown;
      try { output = JSON.parse(text || ''); } catch { throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'AI returned invalid JSON'); }
      const result = (rewrite ? sceneRewriteSchema : scriptOutputSchema).safeParse(output);
      if (!result.success) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'AI returned an invalid content structure');
      return { providerId: 'gemini', model, status: 'completed', output: result.data,
        usage: { inputTokens: json.usageMetadata?.promptTokenCount, outputTokens: json.usageMetadata?.candidatesTokenCount } };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new AppError(504, 'PROVIDER_TIMEOUT', 'AI provider timed out');
      throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'AI provider could not be reached');
    }
  }
}
