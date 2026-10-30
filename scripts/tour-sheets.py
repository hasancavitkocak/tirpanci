# Dev: a tour's pictures (scripts/tour.mjs) two by two on sheets, each with its label, to go through.
# With a previous run: each picture beside the same step of that run (before | now).
# Usage: python scripts/tour-sheets.py test-output/tour/<run> [test-output/tour/<previous run>]
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

run = sys.argv[1]
prev = sys.argv[2] if len(sys.argv) > 2 else None
W, H, BAR = 874, 402, 26
data = json.load(open(os.path.join(run, 'shots.json'), encoding='utf8'))
before = {}
if prev:
    for s in json.load(open(os.path.join(prev, 'shots.json'), encoding='utf8'))['shots']:
        before[s['label']] = os.path.join(prev, s['file'])
try:
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 17)
except OSError:
    font = ImageFont.load_default()

def cell(path, label):
    c = Image.new('RGB', (W, H + BAR), '#222')
    if path and os.path.exists(path):
        im = Image.open(path).convert('RGB')
        im.thumbnail((W, H))
        c.paste(im, ((W - im.width) // 2, BAR + (H - im.height) // 2))
    ImageDraw.Draw(c).text((8, 3), label, fill='#ffeb3b', font=font)
    return c

cells = []
for s in data['shots']:
    now = os.path.join(run, s['file'])
    if prev:
        cells.append(cell(before.get(s['label']), 'ÖNCE: ' + s['label']))
        cells.append(cell(now, 'ŞİMDİ: ' + s['label']))
    else:
        cells.append(cell(now, f"{s['file'][:3]} {s['label']}"))
out = os.path.join(run, 'sheets' if not prev else 'sheets-vs')
os.makedirs(out, exist_ok=True)
for i in range(0, len(cells), 4):
    sheet = Image.new('RGB', (W * 2, (H + BAR) * 2), '#111')
    for k, c in enumerate(cells[i:i + 4]):
        sheet.paste(c, ((k % 2) * W, (k // 2) * (H + BAR)))
    sheet.save(os.path.join(out, f'{i // 4 + 1:02d}.png'))
print(f'{(len(cells) + 3) // 4} sheets in {out}')
