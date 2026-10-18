"""Create temporary cropped RGB inputs for the opt-in reference photo check.

Usage: python tools/prepare-photo-check.py <Camera Roll folder> <output JSON>
No original photographs are copied into the repository.
"""
import json
import sys
from pathlib import Path
from PIL import Image

folder, output = map(Path, sys.argv[1:])
frames = []
for suffix, box, expected in [
    ('39', (800, 310, 1280, 790), 'green'),
    ('41', (900, 290, 1340, 730), 'green'),
    ('45', (850, 275, 1310, 735), 'purple'),
    ('50', (810, 290, 1260, 740), 'pink'),
]:
    image = Image.open(folder / f'WIN_20261017_16_22_{suffix}_Pro.jpg').convert('RGBA')
    crop = image.crop(box).resize((48, 48), Image.Resampling.BILINEAR)
    side = box[2] - box[0]
    frames.append({'name': suffix, 'expected': expected, 'principalX': (image.width / 2 - box[0]) / side, 'principalY': (image.height / 2 - box[1]) / side, 'rgba': list(crop.tobytes())})
output.write_text(json.dumps(frames))
