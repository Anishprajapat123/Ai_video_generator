# Third-party notices

## Local Piper narration

Optional local narration uses [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), GPL-3.0-or-later, through the separately installed Python package. Its dependencies retain their own licenses. The model files are separate from the engine license.

- English LJ Speech high: [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD) identifies the LJ Speech dataset as public domain.
- Hindi Pratham medium and Priyamvada medium: their [Pratham](https://huggingface.co/rhasspy/piper-voices/blob/main/hi/hi_IN/pratham/medium/MODEL_CARD) and [Priyamvada](https://huggingface.co/rhasspy/piper-voices/blob/main/hi/hi_IN/priyamvada/medium/MODEL_CARD) cards list CC BY-NC-SA 4.0 dataset terms. These Hindi models are not an unrestricted commercial voice offering. Review the applicable model/data terms before commercial distribution or service use. Copies of the cards are saved beside the downloaded local models.

No VoiceStudio app code was copied for this provider. Piper synthesis uses its documented Python API; no paid service or uploaded reference voice is required.

## Optional local Google Flow connector

The studio launcher can invoke a separately installed [GTAI-1/flow-mcp](https://github.com/GTAI-1/flow-mcp) checkout in ignored local storage. No upstream source or dependencies are bundled in this repository. The pinned package metadata declares ISC; no standalone license file was found at that commit. Its local dependency updates and Google account/session setup are described in `docs/google-flow.md`. Google Flow service terms and credit limits apply separately.

## Awesome LLM Apps reference

The PDF-to-script feature follows the document-grounded generation approach demonstrated by [Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/rag_tutorials/local_rag_agent), an Apache-2.0 repository. This project uses its own TypeScript implementation; no upstream source files, sample PDFs, Ollama models, Agno service or Qdrant database are bundled. PDF extraction uses the separately installed `pdf-parse` package and its dependencies, which retain their distributed licenses. This is bounded single-document context, not a persistent vector-search/RAG service.

## MoneyPrinterTurbo

The caption entrance animation in `apps/frontend/lib/subtitles.ts` is adapted from `_get_subtitle_spring_scale` in [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/app/services/video.py). The renderer adopts its explicit 192 kbps AAC output setting. Estimated script timing, Remotion overlay and SRT/VTT downloads are this project's implementation. No Whisper model, stock footage or paid provider is bundled.

MIT License

Copyright (c) 2024 Harry

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Hosted LTX video inference

The optional hosted-video provider invokes the public [Lightricks LTX Video distilled demo](https://huggingface.co/spaces/Lightricks/ltx-video-distilled) through its Gradio API. No demo source code or video model weights are bundled. Hugging Face service terms and Lightricks model/output terms apply separately; invoking the API does not relicense the model or its outputs under another dependency's license. The integration uses anonymous shared-demo access with quotas, without billing tokens or paid fallback.

## Remotion and local rendering

Preview and MP4 export use Remotion, Player, Bundler and Renderer version 4.0.540. Remotion retains its own [license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md); the upstream MIT notice below does not apply to it. The locally installed Chrome Headless Shell and renderer binaries retain their respective bundled licenses. These tools run the project's own scene composition; no video-generation service is called.

## Open Generative AI

The removed local-image sampling implementation was adapted from `electron/lib/localInferenceRuntime.js` in [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI). Local image generation is no longer part of the app. No Electron UI or paid API integration is included.

MIT License

Copyright (c) 2026 Open Generative AI Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The separately downloaded stable-diffusion.cpp engine, its dependencies and DreamShaper model retain their own licenses. The repository's MIT license does not relicense those files or model weights. See their upstream distributions and model card before redistribution.
