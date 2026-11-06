# How Remotion is used

Remotion is the video engine for both the live preview and the exported MP4. There is no second composition: preview and export run the same React components, so what you see in the Player is what the renderer encodes.

## Where each piece lives

| Piece | File | Role |
| --- | --- | --- |
| Composition | `apps/frontend/components/video-composition.tsx` | Scenes, clips, narration, transitions, animated scene titles and captions. Every scene is a Remotion `Sequence`. |
| Preview | `apps/frontend/components/video-preview.tsx` | `@remotion/player` renders the composition live in the media page dialog. |
| Render entry | `apps/frontend/render/index.tsx` | Registers the `StudioVideo` composition with `registerRoot` and `Composition`, including dynamic duration, FPS and dimensions. |
| Render worker | `scripts/render-final-video.ts` | Bundles the entry with `@remotion/bundler`, selects the composition, renders H.264/AAC with `@remotion/renderer`, and validates the output. |
| Export job | `apps/backend/src/modules/media/video-render.service.ts` | Starts the worker, stores progress, and saves the resulting `remotion-generated` asset. |
| Timeline data | `apps/frontend/lib/video-preview.ts` | Turns scenes and assets into frame-accurate composition props shared by preview and export. |

## What Remotion renders

- Scene clips (`Html5Video`) trimmed to the scene's exact duration.
- Saved narration (`Html5Audio`), already fitted to the scene length.
- Transitions: fade in/out, slide left/right and wipe.
- Animated scene titles: a spring-driven lower third using `spring()` and `interpolate()`.
- Captions: estimated word timing with the caption spring animation, burned into the MP4 when enabled.
- Frame-accurate layout for 16:9, 9:16, 1:1 and 4:5 projects.

## Runtime flow

1. Media page builds props with `buildVideoPreview`.
2. **Preview in Remotion** passes those props to the Player.
3. **Export MP4 with Remotion** creates a render job; the backend spawns the worker.
4. The worker serves snapshot media over a token-protected loopback URL, bundles the composition, renders, verifies duration/resolution/audio codec, and saves the asset.
5. The media page shows `Remotion render · N%` while the job runs.

## Verifying

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
node scripts/verify-studio-flow.mjs --render
```

The flow check renders real MP4s and validates codecs, timing, downloads and stale-input rejection. See `docs/local-video-export.md` for renderer setup and limits, and `THIRD_PARTY_NOTICES.md` for licensing.
