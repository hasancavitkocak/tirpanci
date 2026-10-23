"""Build the hazelnut bush textures from the reference photo (assets-src/findik-ocagi-referans.png).

- public/textures/ocak-yaprak.png: 1024x1024 atlas of 4 leaf clusters (2x2), white background keyed
  to transparency, edges softened so the cards don't look square.
- public/textures/ocak-kabuk.png: 128x512 tileable bark strip taken from one stem.

Usage: python scripts/make-bush-textures.py
"""
import os

import numpy as np
from PIL import Image

SRC = 'assets-src/findik-ocagi-referans.png'
OUT = 'public/textures'
os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGB')

# Crown regions whose outline opens onto the white background (left, top, right, right-centre with nuts).
CELLS = [
    (400, 15, 860, 400),
    (10, 250, 410, 650),
    (850, 250, 1250, 650),
    (520, 300, 900, 690),
]
CELL = 512


def key_white(rgb: np.ndarray) -> np.ndarray:
    """Alpha from distance to white: background (and gaps between leaves) becomes transparent."""
    lo = rgb.min(axis=2).astype(np.float32)
    sat = (rgb.max(axis=2).astype(np.float32) - lo)
    a = np.clip((255 - lo - 22) / 40, 0, 1)
    # Pale but saturated pixels (sunlit leaves) stay opaque.
    a = np.maximum(a, np.clip((sat - 40) / 30, 0, 1))
    return a


def soft_edge(n: int, seed: int) -> np.ndarray:
    """Round mask with a ragged edge, so a card has no visible square border."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    r = np.sqrt(x * x + y * y)
    ang = np.arctan2(y, x)
    wobble = sum(rng.uniform(0.02, 0.05) * np.sin(k * ang + rng.uniform(0, 6.28)) for k in (3, 5, 9, 13))
    return np.clip((0.97 + wobble - r) / 0.12, 0, 1)


def box_blur(x: np.ndarray, r: int) -> np.ndarray:
    """Separable box blur of a 2D float array (edge-clamped)."""
    k = 2 * r + 1
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(x, pad, mode='edge'), axis=axis)
        x = (np.take(c, range(k, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - k), axis=axis)) / k
    return x


def bleed(rgb: np.ndarray, a: np.ndarray) -> np.ndarray:
    """Spread leaf colour into transparent pixels so mipmaps don't show white halos."""
    out = rgb.astype(np.float32)
    w = a.copy()
    acc = out * w[..., None]
    for radius in (2, 6, 16, 40):
        num = np.stack([box_blur(acc[..., c], radius) for c in range(3)], axis=2)
        den = box_blur(w, radius)
        fill = num / np.maximum(den[..., None], 1e-4)
        hole = (w < 0.5)[..., None]
        out = np.where(hole, fill, out)
    return out


atlas = np.zeros((CELL * 2, CELL * 2, 4), np.uint8)
for i, box in enumerate(CELLS):
    crop = im.crop(box).resize((CELL, CELL), Image.LANCZOS)
    rgb = np.asarray(crop)
    a = key_white(rgb) * soft_edge(CELL, i + 1)
    col = bleed(rgb, a)
    cell = np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)
    cy, cx = divmod(i, 2)
    atlas[cy * CELL:(cy + 1) * CELL, cx * CELL:(cx + 1) * CELL] = cell
Image.fromarray(atlas, 'RGBA').save(f'{OUT}/ocak-yaprak.png', optimize=True)

# Bark: a narrow strip down the middle of one stem, widened and made to tile vertically.
strip = im.crop((606, 700, 622, 1060)).resize((128, 512), Image.BICUBIC)
s = np.asarray(strip).astype(np.float32)
# Even out the light across the strip (it is a round stem) and blend the ends for vertical tiling.
s = s * (s.mean() / np.maximum(s.mean(axis=(0, 2), keepdims=True), 1))
n = 48
for k in range(n):
    t = k / n
    s[k] = s[k] * t + s[-n + k] * (1 - t)
s = s[:-n]
Image.fromarray(np.clip(s, 0, 255).astype(np.uint8)).resize((128, 512)).save(f'{OUT}/ocak-kabuk.png', optimize=True)
print('ok', atlas.shape)
