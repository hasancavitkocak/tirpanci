"""Dev: fill a cut-out picture's transparent edges with its own colours spread outwards (blurred, a
little darker and misty), so a map painted as an island covers the whole frame.
fill-edges.py <in.webp> <out.webp>"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
a = np.asarray(im, dtype=np.float32) / 255
rgb, alpha = a[..., :3], a[..., 3:4]
fill = np.zeros_like(rgb)
have = np.zeros_like(alpha)
# Coarser and coarser blurs of the premultiplied colour, each filling what the finer ones left.
for r in (6, 14, 30, 60, 120, 240):
    pm = Image.fromarray((rgb * alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    al = Image.fromarray((alpha[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    pm = np.asarray(pm, dtype=np.float32) / 255
    al = np.asarray(al, dtype=np.float32)[..., None] / 255
    c = pm / np.maximum(al, 1e-4)
    w = np.clip(al * 4, 0, 1) * (1 - have)
    fill += c * w
    have += w
fill = fill / np.maximum(have, 1e-4)
# Further from the painting: darker, then misty.
far = 1 - alpha
fill = fill * (1 - 0.25 * far) + np.array([0.80, 0.84, 0.82]) * 0.18 * far
res = rgb * alpha + fill * (1 - alpha)
Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8)).save(out, quality=84, method=6)
print(out)
