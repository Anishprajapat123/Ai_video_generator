# Local MP4 export

Preview and export share one Remotion composition; see `docs/remotion.md` for the file-by-file map. Preview plays it with `@remotion/player`, and export bundles and renders it with `@remotion/bundler` and `@remotion/renderer`. Scene titles now animate in with a Remotion spring and fade out with the scene transition.

Captioned output uses the approved scene narration and the scene's exact duration. Captions appear in preview and are burned into new MP4 exports when the project's `subtitlesEnabled` setting is true (the default). Silent scenes have no captions. Timing is estimated proportionally from the script; it is not word-aligned speech recognition. Preview offers SRT and WebVTT downloads with full-project timestamps. Existing MP4s must be regenerated to include captions.

The caption spring animation is adapted from MoneyPrinterTurbo; export also uses its explicit 192 kbps AAC setting. See `THIRD_PARTY_NOTICES.md` for the MIT notice. This adds no model downloads or paid service calls. Run `node scripts/verify-caption-render.mjs` to render landscape and portrait layout checks into ignored `storage/verification/captions`.

Open an approved storyboard's Media & Narration page. Generate a scene video for each scene, then generate fitting narration (or explicitly mark the scene silent). Preview, choose **Generate final video**, and use **Download video** when rendering completes.

Narration is fitted to each scene's exact duration when it is generated or uploaded, so the voice and video always end together. If an older project still shows a mismatch, the media page offers **Fit narration to scene length**; this re-encodes the existing voice track without re-synthesizing it and clears the previous export.

The export uses the same Remotion composition and timing builder as preview. It encodes H.264 video and AAC narration locally, without generation API calls. Output uses the project FPS and aspect ratio at 1280×720, 720×1280, 720×720 or 720×900. Export is limited to 600 seconds. Project resolution settings do not yet change export quality.

Run from the repository checkout with installed workspace dependencies and `npm.cmd run dev`. The renderer requires Chrome Headless Shell; this development machine has it installed. For a fresh installation, run:

```powershell
node -e "require('@remotion/renderer').ensureBrowser().then(r=>console.log(r.path))"
```

Jobs persist in MongoDB, with progress and one renderer reservation per database. Leaving the page does not cancel a running worker. A backend restart can interrupt jobs; timed-out jobs fail after approximately 31 minutes and require a new user request. This is a local worker, not a distributed production queue.

The worker serves only the snapshot's media over an ephemeral, token-protected loopback server. Final assets use authenticated workspace access. Changing a project or storyboard while rendering rejects the obsolete result. Failed exports do not replace an existing final asset; changing scene media invalidates its final-video reference. Temporary snapshots, bundles and render output are removed after completion or failure. A hard process crash can leave temporary job folders in `storage/renders`.

Verification:

```powershell
npm.cmd run build
node scripts/verify-studio-flow.mjs --render
```

Keep the frontend running for the flow check. It uses an isolated test database and synthetic content, renders real MP4 files, checks codecs/timing/download authorization and stale-input rejection, then removes its records and assets. No paid provider is called. Remotion's license terms still apply; see `THIRD_PARTY_NOTICES.md`.
