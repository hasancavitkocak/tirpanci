# The trimmer's red plastic made orange (the back-pack one is orange already) (as the starter panel and buttons drawn for it): in each model's
# base colour texture, the saturated red pixels turned to orange (hue 0 -> 24 degrees), their lightness
# and shading kept; black, grey, metal and the rest untouched. The red originals are kept in
# assets-src/modeller/kirmizi. Usage (repo root): python recolor-orange.py name [name ...]
import colorsys, io, json, shutil, struct, sys
import numpy as np
from PIL import Image

HUE = 24 / 360

def recolor(img):
    a = np.asarray(img.convert('RGB')).astype(float) / 255
    mx = a.max(2); mn = a.min(2); sat = (mx - mn) / (mx + 1e-6)
    # Hue of each pixel (red near 0 / 1).
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    # Fully within 18 degrees of red (the models' reds spread over 0-15), fading out by 30.
    dist = np.minimum(h, 1 - h) * 360
    redness = np.clip((30 - dist) / 12, 0, 1) * np.clip((sat - 0.3) / 0.2, 0, 1) * np.clip((mx - 0.15) / 0.1, 0, 1)
    # Orange of the same value and saturation, a little brighter (orange reads lighter than red).
    v = np.minimum(1, mx * 1.08); s = sat
    i = np.floor(HUE * 6); f = HUE * 6 - i
    p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    org = np.stack([v, t, p], -1)  # hue 24 deg lies in the first sextant (r = v, g = t, b = p)
    out = a * (1 - redness[..., None]) + org * redness[..., None]
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)), redness.mean()

def run(name):
    path = f'public/models/{name}.glb'
    keep = f'assets-src/modeller/kirmizi/{name}.glb'
    try:
        open(keep, 'rb').close()
    except FileNotFoundError:
        shutil.copy(path, keep)
    b = open(keep, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl])
    bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]; bin_ = b[28 + jl:28 + jl + bl]
    base = {j['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source'] for m in j['materials'] if 'baseColorTexture' in m.get('pbrMetallicRoughness', {})}
    new = {}
    for i in base:
        bv = j['bufferViews'][j['images'][i]['bufferView']]
        o = bv.get('byteOffset', 0)
        img, share = recolor(Image.open(io.BytesIO(bin_[o:o + bv['byteLength']])))
        out = io.BytesIO(); img.save(out, 'JPEG', quality=90)
        new[j['images'][i]['bufferView']] = out.getvalue()
        j['images'][i]['mimeType'] = 'image/jpeg'
        print(name, 'image', i, f'{share * 100:.0f}% turned orange')
    chunks = []; off = 0
    for k, bv in enumerate(j['bufferViews']):
        o = bv.get('byteOffset', 0)
        data = new.get(k, bin_[o:o + bv['byteLength']])
        pad = (-off) % 4; chunks.append(b'\0' * pad); off += pad
        bv['byteOffset'] = off; bv['byteLength'] = len(data); chunks.append(data); off += len(data)
    nb = b''.join(chunks); nb += b'\0' * ((-len(nb)) % 4)
    j['buffers'][0]['byteLength'] = len(nb)
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(nb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(nb), 0x004E4942) + nb
    open(path, 'wb').write(glb)

for n in sys.argv[1:]:
    run(n)
