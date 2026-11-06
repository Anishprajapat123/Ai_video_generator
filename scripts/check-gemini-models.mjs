import 'dotenv/config';

async function main() {
  if (process.argv.includes('--script')) {
    const { GeminiProvider } = await import('../apps/backend/dist/modules/providers/adapters/gemini.adapter.js');
    const alternate = process.argv.includes('--alternate') ? process.env.GEMINI_ALTERNATE_MODELS?.split(',')[0] : undefined;
    const rewrite = process.argv.includes('--rewrite');
    const result = await new GeminiProvider(alternate).execute({
      userId: 'verification', workspaceId: 'verification', capability: 'llm',
      input: rewrite
        ? { task: 'scene-rewrite', narration: 'Water flows over a cliff.', visualDescription: 'A waterfall.', instructions: { visual: 'Describe a river flowing over a rocky cliff.' } }
        : { task: 'script-generation', prompt: 'Explain how waterfalls form in two short sections.', language: 'en', duration: 20, style: 'animated-explainer', tone: 'educational', targetAudience: 'general' },
    });
    console.log(JSON.stringify({ model: result.model, status: result.status, validatedSections: result.output?.sections?.length, validatedVisualRewrite: rewrite ? Boolean(result.output?.visualDescription) : undefined }));
    return;
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Model listing failed (HTTP ' + response.status + ').');
  const body = await response.json();
  console.log(JSON.stringify(body.models?.filter(model => model.supportedGenerationMethods?.includes('generateContent')).map(model => ({ name: model.name, displayName: model.displayName }))));
}

main().catch(error => {
  console.error('Gemini verification failed:', error.code || error.name || 'Error', error.message, JSON.stringify(error.details || {}));
  process.exitCode = 1;
});
