"""Generate local Piper narration; read JSON stdin and write PCM WAV stdout."""
import contextlib
import io
import json
from pathlib import Path
import sys
import wave

request = json.loads(sys.stdin.buffer.read(50000).decode('utf-8'))
models = {'piper-english': 'en_US-ljspeech-high', 'piper-pratham': 'hi_IN-pratham-medium', 'piper-priyamvada': 'hi_IN-priyamvada-medium'}
model = models[request['voiceId']]
text = request['text'].strip()
if not text or len(text) > 10000:
    raise ValueError('Narration must contain 1 to 10000 characters')
output = io.BytesIO()
with contextlib.redirect_stdout(sys.stderr):
    from piper import PiperVoice, SynthesisConfig
    voice = PiperVoice.load(str(Path(sys.argv[1]).resolve() / (model + '.onnx')))
    with wave.open(output, 'wb') as wav:
        length_scale = float(request.get('lengthScale', 1.0))
        if not 0.8 <= length_scale <= 1.35:
            raise ValueError('Invalid voice pacing')
        voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=length_scale))
sys.stdout.buffer.write(output.getvalue())
