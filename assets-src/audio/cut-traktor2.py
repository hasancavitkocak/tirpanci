# Cuts the tractor's engine from traktor2-kaynak.wav (Freesound community "diesel tractor 2", 55064,
# decoded from its mp3): it idles steadily for 22 s (firing 21.2 Hz), runs at 29.8 Hz over 48-56 s and
# at 41.2 Hz over 66-74 s. Three loops (idle, mid, high), each ended where its waveform best matches its
# start and joined there with a short crossfade (no seam, no phasing); and its start: the drawn starter
# (traktor2-mars.raw, 22050 Hz, rendered from src/audio/diesel.ts) running into the idle.
# Run from the repo root.
import numpy as np, wave
w = wave.open('assets-src/audio/traktor2-kaynak.wav'); sr0 = w.getframerate()
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
# Down to 22050 Hz (low-passed first by averaging pairs).
a = (a[0::2][:len(a) // 2] + a[1::2][:len(a) // 2]) / 2
sr = sr0 // 2
K = 7000 / np.sqrt((a[int(2 * sr):int(20 * sr)] ** 2).mean())

def save(name, x):
    x = np.clip(x * K, -32000, 32000).astype(np.int16)
    o = wave.open(f'public/audio/{name}.wav', 'wb'); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(x.tobytes()); o.close()
    print(name, f'{len(x) / sr:.2f} s')

def loop(t0, t1, name, xf=0.06):
    s0 = int(t0 * sr)
    n = int(xf * sr)
    head = a[s0:s0 + n]
    # The end near t1 whose next samples best match the loop's start.
    best, end = -1e18, int(t1 * sr)
    for e in range(int((t1 - 0.15) * sr), int((t1 + 0.15) * sr)):
        c = float(np.dot(a[e:e + n], head)) / (np.linalg.norm(a[e:e + n]) * np.linalg.norm(head) + 1e-9)
        if c > best:
            best, end = c, e
    body = a[s0:end].copy()
    f = np.linspace(0, 1, n)
    # The run past the end fades into the start.
    body[:n] = body[:n] * f + a[end:end + n] * (1 - f)
    print(f'  {name}: join match {best:.3f}')
    save(name, body)

loop(4.0, 14.0, 'traktor_idle')
loop(48.5, 55.5, 'traktor_mid')
loop(66.5, 73.5, 'traktor_rev')
# The start: the starter cranking, the engine caught at 1.1 s and idling.
st = np.frombuffer(open('assets-src/audio/traktor2-mars.raw', 'rb').read(), dtype=np.int16).astype(float) / K
cat = int(1.1 * sr)
idle = a[int(1.0 * sr):int(1.0 * sr) + int(1.6 * sr)].copy()
fi = np.linspace(0, 1, int(0.15 * sr))
idle[:len(fi)] *= fi
out = np.zeros(cat + len(idle))
out[:len(st)] += st[:len(out)]
out[cat:] += idle
save('traktor_start', out)
