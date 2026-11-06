import { IAIProvider } from '../provider.interface.js';
import { ProviderMetadata, ProviderRequest, ProviderResponse } from '@ai-video-studio/shared-types';
import { env } from '../../../config/env.js';
import { AppError } from '../../../common/errors/app-error.js';
import { sceneRewriteSchema, scriptOutputSchema, geminiResponseSchema } from '../output.schemas.js';
import { maxWordsFor, pacingInstruction, wordsPerSecond } from '../pacing.js';
import { visualPlanSchema, visualPlanResponseSchema, visualPlanInstruction } from '../visual-plan.schema.js';

export class GeminiProvider implements IAIProvider {
  metadata: ProviderMetadata;
  constructor(private readonly selectedModel?: string) {
    this.metadata = {
      id: selectedModel ? 'gemini:' + selectedModel : 'gemini',
      name: 'Google Gemini · ' + (selectedModel || env.GEMINI_MODEL || 'not configured'),
      capabilities: ['llm'], enabled: Boolean(env.GEMINI_API_KEY && (selectedModel || env.GEMINI_MODEL)),
      priority: selectedModel ? 2 : 1,
    };
  }
  async isAvailable() { return this.metadata.enabled; }
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    if (!await this.isAvailable()) throw new AppError(503, 'PROVIDER_DISABLED', 'Configure GEMINI_API_KEY and GEMINI_MODEL');
    if (request.capability !== 'llm') throw AppError.badRequest('This adapter currently supports text generation only');
    const rewrite = request.input.task === 'scene-rewrite';
    const visual = request.input.task === 'visual-plan';
    const changes = request.input.instructions as { narration?: unknown; visual?: unknown } | undefined;
    const rewriteFields = [...(changes?.narration ? ['narration'] : []), ...(changes?.visual ? ['visualDescription'] : [])];
    const language = typeof request.input.language === 'string' ? request.input.language : undefined;
    const sceneSeconds = typeof request.input.durationSeconds === 'number' ? request.input.durationSeconds : undefined;
    const totalSeconds = typeof request.input.duration === 'number' ? request.input.duration : undefined;
    const requestedWords = typeof request.input.maxWords === 'number' ? request.input.maxWords : undefined;
    const rate = wordsPerSecond(language);
    const pacing = pacingInstruction(language);
    const sceneBudget = changes?.narration && sceneSeconds ? `This scene's video lasts exactly ${sceneSeconds} seconds, so the narration must be at most ${requestedWords ?? maxWordsFor(sceneSeconds, language)} words and must finish within ${sceneSeconds} seconds when spoken.` : '';
    const scriptBudget = totalSeconds ? ` Use ${Math.max(1, Math.min(50, Math.round(totalSeconds / 10)))} sections, each exactly 10 seconds. Keep each narration around ${Math.floor(rate * 8)} to ${Math.floor(rate * 10)} words, including natural pauses. Each section estimatedDuration must be 10.` : ' Each section must be exactly 10 seconds, with brief narration that fills that duration naturally.';
    const instruction = visual ? visualPlanInstruction : rewrite
      ? `Return a JSON object with narration and/or visualDescription strings, matching the requested changes. Preserve fields that are not requested. ${pacing} ${sceneBudget}`
      : `Return a JSON video script with title and sections. Each section must have sectionId, heading, narration, estimatedDuration (seconds), order (starting at 1), and visualSuggestion. Use unique section IDs. Follow the supplied language, tone, audience, style and total duration. Maximum 50 sections and 600 total seconds. ${pacing} Every narration must fit its estimatedDuration (at most estimatedDuration × ${rate} words).${scriptBudget}`;
    const model = this.selectedModel || env.GEMINI_MODEL;
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction + ' If collaborationContext or reviewFeedback is supplied, incorporate its concrete guidance while preserving the original request, language, narration and timing.' }] },
          contents: [{ parts: [{ text: JSON.stringify(request.input) }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: visual ? visualPlanResponseSchema : geminiResponseSchema(rewrite, rewriteFields), temperature: 0.7, maxOutputTokens: visual ? 16384 : 8192, ...(visual && /^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) },
        }),
      });
      if (!response.ok) {
        if (response.status === 404) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'This Gemini model is unavailable for this account. Select another model in Advanced settings.');
        if (response.status === 400) throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'Gemini rejected the request settings. Check the configured model supports JSON text generation.');
        if ([401, 403].includes(response.status)) throw new AppError(502, 'PROVIDER_AUTHENTICATION_FAILED', 'AI provider authentication failed');
        if (response.status === 429) throw new AppError(429, 'PROVIDER_RATE_LIMITED', 'AI provider rate limit reached');
        if ([500, 502, 503, 504].includes(response.status)) throw new AppError(502, 'PROVIDER_UNAVAILABLE', `Gemini is temporarily unavailable (HTTP ${response.status}, model ${model}). Select another model in Advanced settings or try later.`);
        throw new AppError(502, 'PROVIDER_UNAVAILABLE', `Gemini rejected the request (HTTP ${response.status}, model ${model}).`);
      }
      const json = await response.json().catch(() => { throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'AI returned an invalid response'); }) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const candidate = json.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', visual ? `Gemini visual design was incomplete (${candidate?.finishReason || 'no candidate'}, model ${model}). Previous scene is unchanged.` : 'AI response was blocked or incomplete');
      const text = candidate.content?.parts?.map(p => p.text || '').join('');
      let output: unknown;
      try { output = JSON.parse(text || ''); } catch { throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', 'AI returned invalid JSON'); }
      const result = (visual ? visualPlanSchema : rewrite ? sceneRewriteSchema : scriptOutputSchema).safeParse(output);
      if (!result.success) {
        // Return only schema field paths/codes, never generated text or credentials.
        const issues = result.error.issues.slice(0, 8).map(issue => ({ field: issue.path.join('.') || (rewrite ? 'scene' : 'script'), code: issue.code }));
        throw new AppError(502, 'PROVIDER_INVALID_RESPONSE', `AI response failed validation for: ${[...new Set(issues.map(issue => issue.field))].join(', ')}. Your saved content is unchanged.`, { model, issues });
      }
      return { providerId: this.metadata.id, model, status: 'completed', output: result.data,
        usage: { inputTokens: json.usageMetadata?.promptTokenCount, outputTokens: json.usageMetadata?.candidatesTokenCount } };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new AppError(504, 'PROVIDER_TIMEOUT', 'AI provider timed out');
      throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'AI provider could not be reached');
    }
  }
}

export function configuredGeminiProviders(): GeminiProvider[] {
  // Each choice is an explicit provider, preserving routing and per-model usage records.
  const alternatives = [...new Set(env.GEMINI_ALTERNATE_MODELS.split(',').filter(model => model && model !== env.GEMINI_MODEL))];
  return [new GeminiProvider(), ...alternatives.map(model => new GeminiProvider(model))];
}
