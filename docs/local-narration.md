# Free local narration

## Current replacement samples: Piper English and Hindi

The active installation uses `NARRATION_PROVIDER=piper-local`. The selector offers LJ (English), Pratham (Hindi male) and Priyamvada (Hindi female). All three samples are newly synthesized with Piper, not renamed Kitten samples. Existing scene narration is retained. Hindi voices read Hindi text; they do not translate English scripts. Both individual narration and Generate All use the selected voice without a paid fallback.

```powershell
.tts-venv/Scripts/python.exe -m pip install piper-tts==1.8.0
.tts-venv/Scripts/python.exe -m piper.download_voices --download-dir storage/voices en_US-ljspeech-high hi_IN-pratham-medium hi_IN-priyamvada-medium
npm.cmd run build:backend
node scripts/verify-piper-voices.mjs
```

Set `NARRATION_PROVIDER=piper-local` and restart the API. The existing `LOCAL_TTS_PYTHON` setting selects the isolated interpreter. Piper models and samples live in `storage/voices`. No network is used during synthesis.

The Piper engine is GPL-3.0-or-later. The LJ dataset is public domain. Both selected Hindi model cards list CC BY-NC-SA 4.0 dataset terms; they are free local options with noncommercial terms, not an unrestricted commercial voice license. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Optional original KittenTTS setup

Uses KittenTTS mini 0.8, one of the CPU engines documented by [VoiceStudio](https://github.com/debpalash/VoiceStudio/blob/main/docs/engines/kittentts.md). This integration calls the upstream KittenML engine directly; it does not install or embed the VoiceStudio app. No API key, reference recording, user audio upload or GPU is required.

Eight English presets: Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki and Leo. Preview samples and scene narration are generated locally. The original 24 kHz mono PCM WAV output is preserved without stereo duplication. Other languages are not supported by this engine. Inference loads local files, uses offline mode, caps token lengths and output size, and has a backend timeout. Scene audio remains subject to timing checks; generation does not automatically change approved scene durations.

## Setup (Windows, Python 3.12)

Run from the repository root using an installed Python interpreter:

```powershell
python -m venv .tts-venv
.tts-venv/Scripts/python.exe -m pip install -r scripts/requirements-local-tts.txt
.tts-venv/Scripts/python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('KittenML/kitten-tts-mini-0.8', local_dir='storage/voices/kitten', allow_patterns=['*.json','*.onnx','*.npz','README.md','LICENSE*'])"
npm.cmd run build:backend
node scripts/verify-local-voices.mjs
```

Set in `.env` and restart the backend:

```dotenv
NARRATION_PROVIDER=kitten-local
LOCAL_TTS_PYTHON=.tts-venv/Scripts/python.exe
LOCAL_TTS_MODEL_DIR=storage/voices/kitten
PROVIDER_TIMEOUT_MS=120000
```

On Linux/macOS, use `.tts-venv/bin/python`. Paths resolve from the repository root regardless of backend launch directory. The current Windows test uses the existing bundled Python to create an isolated environment; nothing changes the system Python installation.

Open an approved storyboard → Add media & narration → Narration & audio. Select a voice, listen to its sample and generate narration. The selected provider is explicit; no paid fallback occurs. Set `NARRATION_PROVIDER=elevenlabs` to deliberately use the hosted integration instead.

The batch generator offers the same eight voices. Voice labels show the model's male/female presets. Samples and saved narration use plain browser audio controls; press their Play triangle. Custom Listen buttons, Web Audio routing and automatic volume changes have been removed. Sample regeneration saves original mono WAVs and checks non-silent output. `node scripts/verify-browser-audio.mjs --local-narration` checks native playback and freshly saved narration in a headless browser. This verifies playback state and decoded signal, not hardware audibility.

If playback stops working after a file repair, use Reload audio, then press Play. It creates a new player with a fresh source URL. Sample URLs also include their file timestamp; authenticated media responses disable caching. Playback status shows whether the actual player is muted, buffering or playing and its volume. Open audio directly can isolate the page controls from file playback.


## Sources and licensing

- [KittenTTS](https://github.com/KittenML/KittenTTS), Apache-2.0 code.
- [Selected mini 0.8 model card](https://huggingface.co/KittenML/kitten-tts-mini-0.8), declares Apache-2.0.
- Dependencies retain their own licenses, including the eSpeak phonemizer; preserve applicable notices if distributing them.

Models, samples and `.tts-venv` are ignored by Git. Model weights need a one-time download; no network requests are made by the inference helper. Full-video composition/export is separate.
