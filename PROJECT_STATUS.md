# Project status

Updated 5 November 2026.

## Current product

- Create Video now uses the approved Stitch “Create Video (Refined)” layout: source-mode controls, PDF reference dock, synopsis counter and production parameter cards. Existing model selection, draft restoration, permissions and background generation remain connected. Desktop and 390px layout checks use isolated browser fixtures without inference; the production frontend build passed.

Prompt or text-based PDF → script review → storyboard approval → generate scenes and narration → preview/export MP4.

- New Remotion scenes request custom vector illustrations and animation plans from Gemini. Generation consumes Gemini quota; saved-artwork preview, edits and MP4 export remain local.
- Solar-energy topics have illustrated sunlight, panel cells, inverter and home-power animations.
- New scenes default to ten seconds. Narration is fitted with preserved pitch; final audio and video end together.
- Local Piper supports English and Hindi. Optional KittenTTS English voices and explicitly configured ElevenLabs remain available.
- Google Flow and LTX are optional footage sources. Flow requires explicit credit approval; there are no automatic provider retries or paid fallbacks.
- Generate & export MP4 fills missing scenes and starts export after successful generation. Completed media is preserved on failure.
- Existing scenes have inline Visual, Narration and Captions controls with live preview. Remotion text/layout/diagram/theme/speed, clip trim/crop/speed/sound, per-scene voice/volume and caption styling are saved for export.
- Undo/redo retains ten saved scene states and their media. Provider selection never rebuilds scenes automatically; replacing visual edits requires confirmation. Narration text/voice edits invalidate only that recording.
- Custom scenes support eased object/group keyframes and camera pan/zoom, with local seek/add-pose controls. Gemini can design motion tracks for new scenes. Existing saved artwork stays compatible; manual motion edits consume no AI quota.
- Cookie sessions, CSRF, workspace permissions, revision checks and persistent generation status protect the workflow.
- Script, single-scene visual and narration requests now use persistent background jobs. Short status polls survive transient tunnel failures; persisted request IDs and server locks prevent duplicate submissions on reconnection.
- OpenRouter Gemma 4 31B and Nemotron 3.5 Super VL free endpoints support bounded team workflows with Gemini: draft/plan, review and at most one correction. The shared OpenRouter key was accepted by the authentication endpoint and both free model IDs were verified in the catalogue. Collaboration receipts appear on approved scripts and scene artwork. Live inference is reserved for the user's manual test. See `docs/ai-team.md`.
- Narration defaults prefer installed Piper LJ for English and Priyamvada for Hindi, with Pratham as an available Hindi fallback. Manual voice selections and existing scene recordings remain in place.

## Run

```powershell
npm.cmd run dev
```

Open http://localhost:3000. The launcher checks the local MongoDB replica set and starts the API and frontend. Existing `.env`, models, projects and generated media remain in place.

`npm.cmd run dev` also starts an installed Cloudflare quick tunnel and prints the public studio, Create Video and API health links. Use the printed public link for sign-in and generation while sharing; the API allows that origin. Keep the terminal and PC running. Quick-tunnel URLs change on restart. If the tunnel cannot start, the launcher falls back to local access. The frontend is explicitly bound to port 3000 so the backend's `PORT` setting cannot move it to port 5000.

## Review project

**Solar energy · 30-second demo** contains three illustrated ten-second scenes with local English narration and captions. Both exported streams are exactly 30 seconds, with 900 video frames at 30 fps.

Project: `6aeb03ec9538fc19934bfa63`.

Local review: http://localhost:3000/storyboards/6aeb03ec9538fc19934bfa7b/media.

The demo used a curated script, local Piper and Remotion; no Flow, LTX or Gemini generation requests were made.

## Removed complexity

- Local image generation, animation-selection menus, duplicate media controls and redundant guidance panels.
- Phone/LAN/tunnel npm commands, launcher, separate build cache, configuration exceptions and setup document.
- Completed one-off stereo/mono migration scripts, unused conversion helpers, the old proxy-timeout diagnostic and redundant single-scene demo generator.

Phone access was stopped. The app now uses the normal local development setup. Saved videos, voice models, projects and the review demo were retained.

Cleanup verification: production build, typecheck and all 58 current tests passed. The local app responds on port 3000; removed phone ports 3100/5100 are stopped. No generation credits were used.

Scene-editing verification: 61 tests passed, including real MongoDB save/history/access checks. Browser verification covered edit persistence, undo/redo, narrow-screen layout and non-silent Hindi playback. A local four-second MP4 checked trim, held frames, styled captions and original clip sound; both streams ended at exactly four seconds. No AI-generation credits were used.

Generative-design verification (5 November): 64 tests passed. A live Gemini 3.1 Flash Lite response produced a custom 12-object waterfall illustration, which rendered locally to a ten-second MP4. Numeric bounds and required geometry fields fixed repeated-digit output and omitted paths/dimensions. The configured default Gemini 3.5 Flash Lite returned 503 during verification; the scene screen now exposes configured visual-model alternatives. Live verification used Gemini API quota; no Flow requests were made. Caption timing and narration behavior remain unchanged.

## Limits and licensing

- Remotion creates programmed animations; realistic footage still needs an optional video provider.
- Legacy solar and generic artwork remain editable; new visual generation uses Gemini scene graphs rather than selecting those templates.
- Text-based PDF input is supported. OCR and PPTX input are not implemented.
- Caption timing is estimated, not word-aligned transcription.
- Local workers persist progress but are not a distributed production queue.
- Hindi Piper model cards list noncommercial dataset terms. Remotion has its own license. See [third-party notices](THIRD_PARTY_NOTICES.md).
- Flow account switching is manual in its dedicated Chrome window; studio login does not change the Google account.

## References

[README](README.md) · [Remotion](docs/remotion-explainers.md) · [Narration](docs/local-narration.md) · [Flow](docs/google-flow.md) · [Export](docs/local-video-export.md).

The root architecture/API/database documents retain the original planning baseline; current implementation notes identify deliberate differences.
