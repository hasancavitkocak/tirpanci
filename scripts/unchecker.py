"""Dev: strip a checkerboard baked into a generated picture (flood from the edges over light greys),
crop to what is left, scale to the given width, save as webp.
unchecker.py <in.png> <out.webp> <width> [--holes]: --holes clears enclosed patches of it too (not for
pictures with white clouds or the like inside)."""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, out, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGBA')
w, h = im.size
px = im.load()
bg = lambda p: max(p[:3]) - min(p[:3]) <= 14 and min(p[:3]) >= 185
seen = bytearray(w * h)
q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
if '--holes' in sys.argv:
    # Seed every large enough patch of the pattern (a few squares' worth of light grey in a block).
    q.extend((x, y) for y in range(0, h, 4) for x in range(0, w, 4) if all(bg(px[min(w - 1, x + dx), min(h - 1, y + dy)]) for dx in (0, 12, 24) for dy in (0, 12, 24)))
while q:
    x, y = q.popleft()
    i = y * w + x
    if seen[i]:
        continue
    seen[i] = 1
    if not bg(px[x, y]):
        continue
    px[x, y] = (0, 0, 0, 0)
    for X, Y in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= X < w and 0 <= Y < h and not seen[Y * w + X]:
            q.append((X, Y))
# Soften the cut edge, crop to the picture, scale.
a = im.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
im.putalpha(a)
im = im.crop(a.point(lambda v: 255 if v > 30 else 0).getbbox())
im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
im.save(out, quality=86, method=6)
print(out, im.size)
