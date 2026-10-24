"""Dev: a wide horizon picture made into the sky dome's equirectangular panorama (4096x2048): the
picture and its mirror side by side so it goes round seamlessly, the sky above carried up to a deeper
blue at the top, the green below carried down. make-panorama.py <in> <out.jpg> [eye row 0..1]"""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
eye = float(sys.argv[3]) if len(sys.argv) > 3 else 0.69
W, H = 4096, 2048
im = Image.open(src).convert('RGB')
band = Image.new('RGB', (im.width * 2, im.height))
band.paste(im, (0, 0))
band.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (im.width, 0))
bh = round(band.height * W / band.width)
band = np.asarray(band.resize((W, bh), Image.LANCZOS), dtype=np.float32)
top = round(H / 2 - eye * bh)
pano = np.zeros((H, W, 3), np.float32)
pano[top:top + bh] = band
# Sky: the band's top row (smoothed across) fading up to a deeper blue.
sky = band[:6].mean(0)
sky = np.asarray(Image.fromarray(sky[None].astype(np.uint8)).resize((W // 64, 1), Image.BILINEAR).resize((W, 1), Image.BILINEAR), np.float32)[0]
zen = np.array([40, 110, 210], np.float32)
for y in range(top):
    t = (1 - y / top) ** 1.4
    pano[y] = sky * (1 - t) + zen * t
# Below: the band's bottom green.
pano[top + bh:] = band[-6:].mean((0, 1))
Image.fromarray(np.clip(pano, 0, 255).astype(np.uint8)).save(out, quality=86)
print(out, 'band rows', top, top + bh)
