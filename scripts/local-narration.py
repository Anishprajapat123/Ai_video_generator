"""CPU narration using the KittenTTS 0.8 engine documented by VoiceStudio.

Reads one JSON request from stdin and writes a PCM WAV to stdout. Models must
already exist locally: inference never downloads files or needs an API key.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import wave

os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('OMP_NUM_THREADS', '2')


def main():
    request = json.loads(sys.stdin.buffer.read(50000).decode('utf-8'))
    text = request['text'].strip()
    if not text or len(text) > 10000:
        raise ValueError('Narration must contain 1 to 10000 characters')
    directory = Path(sys.argv[1]).resolve()
    with open(directory / 'config.json', encoding='utf-8') as file:
        config = json.load(file)
    voice = request['voiceId']
    if voice not in config['voice_aliases']:
        raise ValueError('Unknown preset voice')
    # Third-party status output must never corrupt the binary audio stream.
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        from kittentts.onnx_model import KittenTTS_1_Onnx
        engine = KittenTTS_1_Onnx(str(directory / config['model_file']), str(directory / config['voices']),
                                config.get('speed_priors', {}), config['voice_aliases'])
        text = engine.preprocessor(text)
        # Measure the actual phoneme tokens before inference (512-token ONNX cap).
        def synthesize(part):
            inputs = engine._prepare_inputs(part, voice, 1.0)
            if inputs['input_ids'].shape[1] > 500:
                words = part.split()
                if len(words) < 2:
                    raise ValueError('A word exceeds the narration token limit')
                middle = len(words) // 2
                return synthesize(' '.join(words[:middle])) + synthesize(' '.join(words[middle:]))
            samples = engine.session.run(None, inputs)[0].reshape(-1)[:-5000]
            return [samples]
        samples = np.concatenate(synthesize(text))
        if not samples.size or samples.size > 24000 * 170 or not np.isfinite(samples).all():
            raise ValueError('Generated audio is invalid or too long')
        pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes()
    output = io.BytesIO()
    with wave.open(output, 'wb') as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(24000)
        file.writeframes(pcm)
    sys.stdout.buffer.write(output.getvalue())


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Local narration failed: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
