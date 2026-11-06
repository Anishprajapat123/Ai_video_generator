# AI Video Studio

Routine checks: `npm.cmd run verify`. Full local browser/audio/render checks: `npm.cmd run verify:full`. No Gemini or Flow generation calls. See [testing](docs/testing.md).

Create explainers from a prompt or text-based PDF. Review the script and storyboard, generate scene video clips and narration, preview with captions, then export an MP4.

## Run locally

Use Node.js 22.13+ and npm. MongoDB must run as a replica set for transactions.

1. Run `npm.cmd ci`.
2. Copy `.env.example` to `.env` only if you do not already have one.
3. Configure `GEMINI_API_KEY` and `GEMINI_MODEL`. Add optional model choices with `GEMINI_ALTERNATE_MODELS`.
4. Open Docker Desktop and run `npm.cmd run dev`. The launcher starts the local MongoDB container and both app services.
5. Open [localhost:3000](http://localhost:3000). Register or sign in.

Press Ctrl+C to stop the app. Database data persists in Docker's volume. The app stores generated media under `storage/`.

The frontend proxies `/api/v1` to `http://127.0.0.1:5000`. API health: [localhost:3000/api/v1/health](http://localhost:3000/api/v1/health).

## Generation

Optional [AI team setup](docs/ai-team.md): one `OPENROUTER_API_KEY` connects Gemma writing/planning, Gemini motion design and Nemotron plan review, with at most one correction pass.

- Scripts: Gemini with explicit model selection and validated structured output. Google account quotas/billing apply.
- Narration: [local Piper voices](docs/local-narration.md), English and Hindi without API credits. ElevenLabs remains an optional configured provider.
- Default videos: [Gemini-designed Remotion explainers](docs/remotion-explainers.md). Gemini designs custom vector artwork per scene using API quota; preview, editing and MP4 rendering reuse it locally. New scenes default to ten seconds with matching narration.
- Optional footage: [free shared LTX demo](docs/hosted-video.md), subject to queues and quotas.
- Optional videos: [Google Flow through local Chrome](docs/google-flow.md), explicit per-scene credit approval, at most 10 credits and no automatic retries.
- Documents: [PDF import](docs/pdf-to-video.md), selectable text only.
- Export: [local H.264/AAC MP4](docs/local-video-export.md), with estimated captions and SRT/VTT downloads.

Local models require the linked setup steps. Generation never silently downloads models or switches to a paid provider. Existing media is retained when replacement generation fails.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run build
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27017/ai_video_studio_test?replicaSet=rs0'
npm.cmd test
```

The tests use synthetic content and do not call paid providers. Integration tests require a dedicated database name ending in `_test`. Optional real generation/render checks are documented in the setup guides.

## Structure

- `apps/frontend`: Next.js studio, review screens, preview and shared video composition.
- `apps/backend`: Express API, MongoDB persistence, generation and render workers.
- `packages/shared-types`: API/domain contracts.
- `scripts`: development setup, local generation, renderer and verification tools.
- `docs`: setup and supported limits.
- `design/stitch`: approved design references.

Authentication uses opaque HttpOnly session cookies and CSRF protection. Active owner/admin/editor membership is required for writes. Viewers can read. Production requires HTTPS and explicit database index creation. Local workers are not a distributed production queue.

See [current status](PROJECT_STATUS.md) and [third-party notices](THIRD_PARTY_NOTICES.md). Root specification documents describe the original design; current implementation details are in the status and setup guides.
