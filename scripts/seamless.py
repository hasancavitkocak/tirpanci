"""Dev: make a nearly tileable texture tile cleanly: near each edge it fades into the picture moved by
half its size (whose edges meet seamlessly), so the left edge runs on into the right and the top into
the bottom. seamless.py <in> <out.jpg> [size] [band 0..0.5]"""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
band = float(sys.argv[4]) if len(sys.argv) > 4 else 0.12
im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
a = np.asarray(im, dtype=np.float32)
b = np.roll(a, (size // 2, size // 2), axis=(0, 1))
t = np.minimum(np.arange(size), size - 1 - np.arange(size)) / (size * band)
w1 = np.clip(t, 0, 1)
w1 = w1 * w1 * (3 - 2 * w1)
w = np.minimum(w1[:, None], w1[None, :])[..., None]
res = a * w + b * (1 - w)
Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)).save(out, quality=88)
r = np.asarray(Image.open(out), dtype=np.float32)
print(out, 'left-right %.1f top-bottom %.1f neighbour %.1f' % (np.abs(r[:, 0] - r[:, -1]).mean(), np.abs(r[0] - r[-1]).mean(), np.abs(r[:, 1:] - r[:, :-1]).mean()))
