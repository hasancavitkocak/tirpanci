# The tractor's start (public/audio/traktor_start.wav) from traktor-mars-kaynak.wav (Freesound 163752,
# "starting a tractor", decoded from its mp3): the starter cranking (0.75-1.9 s), the engine catching and
# its first rough beats, up to 4.2 s (its last 1.2 s fading out under the idle loop coming in). Made to run into the idle loop (traktor_idle.wav, from another
# tractor): sped up so its idle (18.6 Hz) fires as the loop's (21.2 Hz), its tone matched to the loop's
# (this one was recorded close and thin: the two recordings' average spectra compared, the difference
# filtered in, within -20..+18 dB, the top rolled off), its idle as loud as the loop, its loudest beats
# softly limited. Run from the repo root.
import numpy as np, wave

def load(p):
    w = wave.open(p); sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
    if w.getnchannels() > 1: a = a.reshape(-1, w.getnchannels()).mean(1)
    return a, sr

m, sr0 = load('assets-src/audio/traktor-mars-kaynak.wav')
idle, sr = load('public/audio/traktor_idle.wav')
# Sped up 21.2 / 18.6 while going down to the loop's 22050 Hz.
k = 21.2 / 18.6
t = np.arange(0, len(m) / sr0 / k, 1 / sr)
m = np.interp(t * k * sr0, np.arange(len(m)), m)

def spectrum(x, n=8192):
    w = np.hanning(n)
    return np.mean([np.abs(np.fft.rfft(x[i:i + n] * w)) for i in range(0, len(x) - n, n // 2)], axis=0)

# Its steady idle (from 11 s as recorded) against the loop's.
steady = m[int(11 / k * sr):]
f = np.fft.rfftfreq(8192, 1 / sr)
ratio = spectrum(idle) / (spectrum(steady) + 1e-6)
# Smoothed over a third of an octave, limited.
g = np.empty_like(ratio)
for i, fi in enumerate(f):
    sel = (f >= fi / 2 ** (1 / 6)) & (f <= fi * 2 ** (1 / 6))
    g[i] = np.sqrt(np.mean(ratio[sel] ** 2)) if sel.any() else 1
g = np.clip(g, 10 ** (-20 / 20), 10 ** (18 / 20))
g[f < 25] = 0
# (Its rough first beats hiss more than its steady idle: the top rolled off above 2.5 kHz too.)
g /= 1 + (f / 2500) ** 2

def eq(x):
    n = 1 << int(np.ceil(np.log2(len(x) + 8192)))
    X = np.fft.rfft(x, n)
    G = np.interp(np.fft.rfftfreq(n, 1 / sr), f, g)
    return np.fft.irfft(X * G, n)[:len(x)]

clip = eq(m[int(0.65 / k * sr):int(4.2 / k * sr)])
level = np.sqrt((idle ** 2).mean()) / np.sqrt((eq(steady[:sr * 6]) ** 2).mean())
clip *= level
fi = int(0.02 * sr); fo = int(1.2 * sr)
clip[:fi] *= np.linspace(0, 1, fi)
# Equal power against the idle's rise (TRACTOR_FILES.blend).
clip[-fo:] *= np.cos(np.linspace(0, 1, fo) * np.pi / 2)
# Its loudest cranking beats eased under full scale (a soft limit, not clipped).
x = (np.tanh(clip / 26000) * 26000).astype(np.int16)
o = wave.open('public/audio/traktor_start.wav', 'wb'); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(x.tobytes()); o.close()
print(f'traktor_start {len(x) / sr:.2f} s, peak {abs(x).max()}, gain {20 * np.log10(level):.1f} dB')
