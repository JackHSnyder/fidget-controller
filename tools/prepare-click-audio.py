"""Decode a reference clip to temporary mono float32 PCM for check-click-audio.mjs.

Usage: python tools/prepare-click-audio.py <input.mp3> <output.f32>
Requires soundfile and numpy. The original recording is never added to src/.
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

source, target = map(Path, sys.argv[1:])
audio, sample_rate = sf.read(source, always_2d=True)
audio.mean(axis=1).astype('<f4').tofile(target)
print(f'{len(audio) / sample_rate:.3f} seconds, {sample_rate} Hz')
print(f'node tools/check-click-audio.mjs "{target}" {sample_rate}')
