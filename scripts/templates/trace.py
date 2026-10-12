"""Turns Card Conjurer frame renders (from renderFrames.ts) into line-art templates.

Each template is opaque white with black outlines, and transparent where the art shows through.

Usage: python scripts/templates/trace.py <framesDir> <templatesDir>
Requires numpy and Pillow.
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

# Masks whose outline is not part of the drawing (the border is dropped, like in the original templates)
SKIP_MASKS = re.compile(r'Border|Borderless|Frame$|Text_Boxes|Multicolor', re.I)

# Text areas the frame leaves see-through (planeswalker abilities): keep them opaque below this height
FILL_BELOW = {'PlaneswalkerRegular': 0.58}

# Masks filled dark because Card Conjurer writes white text on them (planeswalker loyalty)
FILL_DARK = {'PlaneswalkerRegular': ['Loyalty']}


def load(path):
    return np.asarray(Image.open(path).convert('RGBA'))


def sobel(x):
    p = np.pad(x, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    return np.hypot(gx, gy)


def blur(arr, radius):
    image = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)


def trace(frame_path, mask_paths, border_path=None, fill_below=None, dark_paths=(), extra_paths=(), threshold=90, smoothing=2.0):
    im = load(frame_path).astype(np.float32)
    h, w = im.shape[:2]
    alpha = im[..., 3] / 255
    lum = 0.299 * im[..., 0] + 0.587 * im[..., 1] + 0.114 * im[..., 2]

    # Black outer border: from the pack's Border mask if any, else dark pixels near the card edge
    if border_path:
        border = load(border_path)[..., 3] > 127
    else:
        yy, xx = np.mgrid[0:h, 0:w]
        near_edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) < 0.045 * min(w, h)
        border = near_edge & (lum < 60) & (alpha > 0.5)
    # Extra elements (e.g. the P/T box) can overlap the border and must survive its removal
    for extra_path in extra_paths:
        border &= ~(load(extra_path)[..., 3] > 127)
    solid = (alpha > 0.05) & ~border

    # Smooth the frame texture away so only the structural lines remain
    flat = blur(np.where(solid, lum, 255.0), smoothing)
    edge = np.maximum(sobel(flat), sobel(blur(solid * 255.0, 1.0)) * 1.5)

    # Region outlines from the pack's masks (title/type/rules boxes, pinlines...).
    # Extra elements sit on top (listed topmost first), so they hide the outlines of whatever is below them.
    extras = [load(p)[..., 3] > 127 for p in extra_paths]
    for mask_path in mask_paths:
        mask = load(mask_path)[..., 3].astype(np.float32)
        mask_edge = sobel(blur(mask * ~border, 1.0)) * 1.5
        above = extras[:extra_paths.index(mask_path)] if mask_path in extra_paths else extras
        if above:
            # Shrink the cover a little so the covering element keeps its own outline
            cover = Image.fromarray((np.any(above, axis=0) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7))
            mask_edge[np.asarray(cover) > 0] = 0
        edge = np.maximum(edge, mask_edge)

    ink = np.clip((edge - threshold) / 150, 0, 1)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = (255 * (1 - ink))[..., None].astype(np.uint8)

    # Art windows (holes inside the frame) are transparent, everything else is opaque
    hole = (alpha <= 0.05) & ~border
    if fill_below is not None:
        hole[int(fill_below * h):, :] = False
    out[..., 3] = np.where(hole & (ink < 0.2), 0, 255)
    for dark_path in dark_paths:
        out[load(dark_path)[..., 3] > 127] = (30, 30, 30, 255)
    return out


def main():
    frames_dir, templates_dir = sys.argv[1], sys.argv[2]
    with open(os.path.join(frames_dir, 'manifest.json')) as f:
        manifest = json.load(f)

    for name, info in manifest.items():
        pack = info['pack']
        masks = [os.path.join(frames_dir, m) for m in info['masks']]
        mask_name = lambda m: m.split('__mask_')[1][:-4]
        border = next((m for m in masks if mask_name(m) == 'Border'), None)
        drawn = [m for m in masks if not SKIP_MASKS.search(mask_name(m))]
        extras = [m for m in masks if mask_name(m).startswith('Extra_')]
        dark = [m for m in masks if mask_name(m) in FILL_DARK.get(pack, [])]
        template = trace(os.path.join(frames_dir, f'{name}.png'), drawn, border, FILL_BELOW.get(pack), dark, extras)
        Image.fromarray(template).save(os.path.join(templates_dir, f'{name}.png'), optimize=True)
        print(f'Traced {name}')


if __name__ == '__main__':
    main()
