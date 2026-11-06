# Collaborative AI models

Add one key to the existing `.env` entry, then restart the API:

```dotenv
OPENROUTER_API_KEY=your_key_here
OPENROUTER_TIMEOUT_MS=90000
AI_TEAM_ENABLED=true
```

The same OpenRouter key enables these fixed model IDs:

- `google/gemma-4-31b-it:free` — writing, planning and corrections.
- `nvidia/nemotron-3.5-super-vl:free` — structured plan review. This is a general multimodal model, not a dedicated content-safety classifier.

Existing Gemini configuration supplies motion design. Both configured Gemini versions remain available. No extra SDK, local model download or second OpenRouter key is needed.

## Workflow

When both services are configured and team mode is enabled, **Configured default** uses the team for new scripts. The scene screen initially selects the team for new visual generation. Individual model choices remain available and bypass collaboration when selected explicitly.

Scripts: Gemma drafts → Nemotron reviews → if needed, Gemma corrects once → Nemotron reviews once more. Maximum four requests.

Visuals: Gemma creates a creative brief → Gemini designs artwork and motion → Nemotron reviews the scene graph → if needed, Gemini corrects once → Nemotron reviews once more. Maximum five requests.

The supervisor passes validated public outputs, the original task and concrete correction requests between models. It does not expose or store private reasoning. Failed review or provider errors stop the workflow before changing saved content. It never starts an open-ended agent discussion or silently substitutes a paid model.

Each model call is recorded through the existing usage recorder. Approved artifacts store a collaboration receipt listing roles, providers, models, whether a correction was required and the final review summary. Script and scene screens display the receipt. Preview, editing and export reuse approved artwork without calling the team again.

The team reviews plans, not rendered frames, and does not independently verify external facts. Existing local render/audio checks remain separate. Research tools, dedicated safety classifiers and video-frame vision QA are not introduced by this integration.

## Quotas and data

The two OpenRouter adapters request only their fixed `:free` endpoints with provider fallback disabled. Free services have availability and rate limits; Gemini still uses its configured quota. See the [Gemma endpoint](https://openrouter.ai/google/gemma-4-31b-it:free), [Nemotron endpoint](https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free), and their current terms. NVIDIA's free endpoint includes a data-processing notice; do not submit confidential or personal content to it.

## Verification

`npm.cmd run verify` uses mocked OpenRouter responses. It checks fixed model routing, credential handling, final JSON validation, rate-limit handling, structured handoffs and the one-correction limit. No live API requests are included. Actual account access can only be checked after a key is supplied.
