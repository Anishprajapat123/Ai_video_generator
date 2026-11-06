# Free hosted scene videos

Scene Media now offers **Generate scene video** for the selected scene. It sends the approved visual direction to the official `Lightricks/ltx-video-distilled` Hugging Face Space and saves the returned MP4 as the scene visual. The existing narration remains separate and plays once. No file upload from the user's computer is needed.

This is genuine text-to-video inference through a public demo, not a still-image export. Requests are anonymous, have no billing credentials, never call Inference Providers and never fall back to a paid service. The Space is shared: queues, anonymous quotas, outages and API changes can prevent generation. This integration is experimental, not a guaranteed production service.

`ENABLE_HOSTED_VIDEO=true` in `.env` enables the provider. It is enabled on this development machine; restart `npm.cmd run dev` after changing environment settings. No Hugging Face account or token was needed for the verified sample. No video model weights were downloaded.

Each request generates up to 8 seconds. Draft sizes are 448×256, 256×448, 384×384 and 384×480 for the supported aspect ratios. A shorter clip repeats to fill a longer scene in preview and final export. Final 720p encoding does not increase the generated detail. Generating unique continuous long scenes and maintaining character consistency are not implemented.

The job returns HTTP 202, persists progress and reconnects after page reload. One hosted request runs per database. Duplicate requests are rejected; jobs expire after approximately 11 minutes. The worker does not retry an uncertain submission automatically. Previous scene media is kept if generation, validation or stale-scene checks fail. Only the fixed Space origin and expected MP4 output paths can be downloaded, redirects are rejected, responses are bounded to 8 MB and the decoder checks dimensions, duration and H.264 format before saving.

Verified with synthetic content:

```powershell
npm.cmd run build
node scripts/verify-studio-flow.mjs --render --hosted-video
```

The check generated an actual hosted clip, saved it through the authenticated job API, retrieved it, recorded zero API cost, and rendered it with an audio track into a 720p MP4. It also verified duplicate rejection and changes during export. Test content and assets are cleaned afterward. Browser controls and artistic quality have not been manually verified.

References: [official demo](https://huggingface.co/spaces/Lightricks/ltx-video-distilled), [ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu), [Spaces APIs](https://huggingface.co/docs/hub/spaces-api-endpoints), [Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing).
