# The trimmer's engine from tirpan3-kaynak.wav (Freesound community "brushcutter in action", 70197,
# decoded from its mp3): idling at its end (37-40 s, firing 50 Hz, recorded quietly), a moment of part
# throttle (22.4-23.3 s, 100 Hz) and flat out cutting (8-12.5 s, 163 Hz). Three loops, each ended where
# its waveform best matches its start and joined with a crossfade (equal power, longer for the noisy ones); levels set so idle is quieter
# than flat out (as a trimmer is). Run from the repo root.
import numpy as np, wave
w = wave.open('assets-src/audio/tirpan3-kaynak.wav'); sr0 = w.getframerate()
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
a = (a[0::2][:len(a) // 2] + a[1::2][:len(a) // 2]) / 2
sr = sr0 // 2

def save(name, x, rms):
    x = x * rms / np.sqrt((x ** 2).mean())
    x = np.clip(x, -32000, 32000).astype(np.int16)
    o = wave.open(f'public/audio/{name}.wav', 'wb'); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(x.tobytes()); o.close()
    print(name, f'{len(x) / sr:.2f} s')

def loop(t0, t1, name, rms, xf=0.04):
    s0 = int(t0 * sr); n = int(xf * sr); head = a[s0:s0 + n]
    best, end = -1e18, int(t1 * sr)
    for e in range(int((t1 - 0.1) * sr), int((t1 + 0.1) * sr)):
        c = float(np.dot(a[e:e + n], head)) / (np.linalg.norm(a[e:e + n]) * np.linalg.norm(head) + 1e-9)
        if c > best: best, end = c, e
    body = a[s0:end].copy(); f = np.linspace(0, 1, n)
    # Equal power (the noisier loops do not line up wave for wave).
    body[:n] = body[:n] * np.sqrt(f) + a[end:end + n] * np.sqrt(1 - f)
    print(f'  {name}: join match {best:.3f}')
    save(name, body, rms)

loop(37.0, 40.0, 'tirpan_idle', 3200, xf=0.2)
loop(22.4, 23.3, 'tirpan_mid', 5000, xf=0.12)
loop(8.0, 12.5, 'tirpan_full', 7000, xf=0.08)
