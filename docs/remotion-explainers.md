# Remotion explainers

New Remotion scenes use Gemini to design original, topic-specific vector illustrations, labels and motion from the approved narration and visual direction. Remotion renders the saved design locally. This creates animated explainers, not photorealistic AI footage; Flow and LTX remain optional footage sources.

Each explicit visual generation makes one Gemini request and records provider usage. The design is validated structured data: custom paths, shapes, text, colors and timed motion. No generated code, external assets or raw SVG markup runs. Preview, object edits, undo and MP4 export reuse the saved design without another Gemini request. Failed requests preserve previous artwork and do not silently substitute a template or retry another model.

The earlier curated solar demo and legacy concept/process/comparison artwork remain editable. New generations do not select those templates. Use **Generate custom visuals with Gemini** or **Redesign visuals with Gemini** and choose a configured **Visual design model**. The generation direction can request a specific mechanism or illustration. Save direction first; redesigning is explicit and uses API quota.

The primary Generate & export MP4 action fills missing media and starts local export once all scenes succeed. Errors retain completed scenes, and retries are explicit. If scenes are already ready, it exports them without regenerating their voices or visuals. Export progress remains visible after scene generation completes.

## Edit existing scenes

The scene media screen includes a live Remotion preview and three compact editing sections:

- **Visual:** switch between a saved generated clip and a Remotion explainer; edit heading, colors and animation speed. Generated objects expose labels, positions, dimensions and colors in an expandable editor. Legacy artwork retains its layout/diagram controls. For clips, adjust trim points, playback speed, fit, crop position, original sound and volume. Short clips hold their last frame when automatic fitting is off.
- **Narration:** edit text, choose a per-scene voice and set volume. Text or voice changes invalidate only that scene’s recording. Generate narration explicitly afterward; style and volume changes preserve the recording.
- **Captions:** show/hide, override text, adjust size, position and colors. Empty caption text follows narration. Timing remains estimated.

Draft changes preview immediately. **Save edits** persists them and clears the previous final-export link. **Discard edits** restores saved settings. **Undo/Redo** stores up to ten saved scene states and preserves their referenced media until history expires. Unsaved changes block generation and export.

Changing the generation provider or visual model does not rebuild anything. Redesigning explicitly replaces the visual plan after confirmation. Narration and caption settings survive. Flow still requires separate credit approval. Export renders the current saved edits through the same composition used by preview.

Scene duration, order and transitions remain in the existing storyboard editor. There is no additional editor route.

Custom artwork also supports [object/group keyframes and camera motion](motion-design.md), with seek controls and editable easing. These tracks preview and export locally.

## Timing

New storyboard scenes default to ten seconds. At 30 fps each scene is 300 frames. Existing approved projects retain their edited durations. To change an existing scene, edit its duration in the storyboard and approve it, then fit its narration.

Script prompts budget roughly 19–24 English or 16–20 Hindi words per ten-second scene. Local FFmpeg adjusts speech tempo while preserving pitch, then aligns PCM samples exactly to the timeline. A failed encoder reports an error instead of silently changing pitch. Old narration with a different duration is not export-ready; batch generation refits it without another synthesis request. Bulk fitting saves new per-scene assets through revision-checked transactions rather than mutating a shared audio file in place.

Piper first uses a moderate neural length-scale adjustment based on the selected voice's measured preview pace and the narration word count. Final fitting corrects residual timing instead of relying entirely on digital stretching. Actual voice quality should still be reviewed by listening.

## Thirty-second review project

The workspace contains **Solar energy · 30-second demo**, made from a clearly curated three-scene script. Each scene is ten seconds. It uses local Piper LJ narration, Remotion illustrations and captions; no AI text/footage requests were used. The saved project can be opened and downloaded in the local studio.

`node scripts/create-polished-demo.mjs EXISTING_PROJECT_ID` creates that review project in the reference project's owner/workspace. The command saves a manifest and reuses it on later runs rather than creating duplicates. It generates a new named sample project and does not replace the reference project.

Optional footage is played once with its rate matched to the scene length. Remotion renders the final video. AAC padding is finalized with FFmpeg so the audio and video streams end at the same frame boundary.

## Verification

```powershell
npm.cmd run build:backend
node scripts/create-polished-demo.mjs EXISTING_PROJECT_ID
```

The demo command uses local Piper and Remotion, makes no paid provider requests and creates a separate named sample project. Its ignored verification manifest identifies the saved MP4. Existing reference projects are preserved.

Remotion's own [license](https://www.remotion.dev/license) applies independently of Flow credits. Zero Flow usage does not remove the renderer's licensing requirements.
