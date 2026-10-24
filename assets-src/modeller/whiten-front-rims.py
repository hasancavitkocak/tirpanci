# The tractor's front tyres (public/models/traktor_teker_on.glb, from traktor_teker_on-krem.glb): their
# cream rims painted white as the rear ones (traktor_teker_arka.glb). Run from the repo root.
import io, json, struct
import numpy as np
from PIL import Image

def read(p):
    b = open(p, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
    return j, b[28 + jl:28 + jl + bl]

def image(j, bin_, i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    o = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(bin_[o:o + bv['byteLength']])).convert('RGB')

def base_index(j):
    return j['textures'][j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']

rj, rbin = read('public/models/traktor_teker_arka.glb')
rear = np.asarray(image(rj, rbin, base_index(rj))).astype(float)
white = rear[rear.mean(2) > 150].mean(0)

j, bin_ = read('assets-src/modeller/traktor_teker_on-krem.glb')
bi = base_index(j)
a = np.asarray(image(j, bin_, bi)).astype(float)
lum = a.mean(2)
sat = a.max(2) - a.min(2)
# The rim: the bright, yellowish parts (the rubber is dark and grey).
rim = (lum > 85) & (a[..., 0] > a[..., 2])
k = np.clip((lum - 70) / 40, 0, 1)[..., None] * rim[..., None]
cream = a[(lum > 120) & rim].mean(0)
# Grey of the same shading, scaled so the cream's mean lands on the rear rims' white.
grey = (lum / cream.mean())[..., None] * white[None, None, :]
out = np.clip(a * (1 - k) + grey * k, 0, 255).astype(np.uint8)
buf = io.BytesIO()
Image.fromarray(out).save(buf, 'JPEG', quality=90)
new = buf.getvalue()

# Rebuild the binary chunk with the new image in its buffer view.
target = j['images'][bi]['bufferView']
chunks = []
off = 0
for i, bv in enumerate(j['bufferViews']):
    o = bv.get('byteOffset', 0)
    data = new if i == target else bin_[o:o + bv['byteLength']]
    pad = (-off) % 4
    chunks.append(b'\0' * pad)
    off += pad
    bv['byteOffset'] = off
    bv['byteLength'] = len(data)
    chunks.append(data)
    off += len(data)
nb = b''.join(chunks)
nb += b'\0' * ((-len(nb)) % 4)
j['buffers'][0]['byteLength'] = len(nb)
js = json.dumps(j, separators=(',', ':')).encode()
js += b' ' * ((-len(js)) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(nb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(nb), 0x004E4942) + nb
open('public/models/traktor_teker_on.glb', 'wb').write(glb)
Image.fromarray(out).resize((256, 256)).save('test-output/tex/front-white.png')
print('cream', cream.round(), '-> white', white.round(), 'rim share', round(rim.mean(), 2))
