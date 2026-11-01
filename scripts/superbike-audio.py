#!/usr/bin/env python3
# [superbike] 녹음 2개 → 슈퍼바이크 RR 엔진음 4개 (public/audio/superbike/*.{ogg,m4a}, 모노 32 kHz)
#   idle   : 공회전 녹음에서 잘라 끝↔처음을 등전력 크로스페이드한 루프
#   start  : 시동~스로틀 블립 (탈 때 1회)
#   launch : 출발해서 1단 끝(첫 변속)까지 (정지에서 출발할 때 1회)
#   ride   : 2단 가속 구간을 음높이가 일정하게 펴서(de-chirp) 만든 루프 — 게임에서 속도·기어로 재생 속도를 바꾼다
# 사용: python3 scripts/superbike-audio.py <공회전.m4a> <시동→주행.m4a> [outdir]   (numpy, scipy, ffmpeg 필요)
import sys, os, subprocess, numpy as np
from scipy import signal

SR = 32000
if len(sys.argv) < 3:
    sys.exit(__doc__ or 'usage: superbike-audio.py idle.m4a start-ride.m4a [outdir]')
IDLE_IN, RIDE_IN = sys.argv[1], sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else 'public/audio/superbike'
# 시동→주행 녹음 구간(초). 첫 변속(음높이 급락)과 블립 뒤 출발 지점에서 자른다.
START = (0.05, 1.88)
LAUNCH = (1.85, 4.12)
RIDE = (4.2, 6.1)
IDLE = (0.12, 3.0)


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    sos = np.vstack([signal.butter(2, 35, 'highpass', fs=SR, output='sos'), signal.butter(4, 9000, 'lowpass', fs=SR, output='sos')])
    return signal.sosfiltfilt(sos, x)


def cut(x, a, b):
    return x[int(a * SR):int(b * SR)].copy()


def quiet_point(x, t, span=0.08):
    """t 근처(±span)에서 20 ms 에너지가 가장 낮은 곳 (자르는 자리)"""
    w = int(0.02 * SR)
    lo, hi = int((t - span) * SR), int((t + span) * SR)
    e = np.convolve(x[lo:hi] ** 2, np.ones(w) / w, 'same')
    return (lo + int(e.argmin())) / SR


def fades(x, fin=0.01, fout=0.12):
    n1, n2 = int(fin * SR), int(fout * SR)
    x[:n1] *= np.sin(np.linspace(0, np.pi / 2, n1)) ** 2
    x[-n2:] *= np.cos(np.linspace(0, np.pi / 2, n2)) ** 2
    return x


def loop(x, xf=0.25):
    """끝 xf 초를 앞에 등전력 크로스페이드해서 붙인다 → 마지막 샘플 다음이 자연스럽게 첫 샘플로 이어짐"""
    n = int(xf * SR)
    head, tail = x[:n], x[-n:]
    t = np.linspace(0, np.pi / 2, n)
    y = x[:-n].copy()
    y[:n] = head * np.sin(t) + tail * np.cos(t)
    return y


def dechirp(x, band=(250, 520)):
    """구간 안에서 회전수가 오르는 음높이를 직선으로 추정하고, 일정한 음높이가 되도록 시간축을 다시 잰다"""
    w, hop = int(0.08 * SR), int(0.05 * SR)
    ts, fs = [], []
    for i in range(0, len(x) - w, hop):
        s = x[i:i + w] * np.hanning(w)
        sp = np.abs(np.fft.rfft(s, 8 * w))
        fr = np.fft.rfftfreq(8 * w, 1 / SR)
        m = (fr > band[0]) & (fr < band[1])
        ts.append((i + w / 2) / SR)
        fs.append(fr[m][sp[m].argmax()])
    ts, fs = np.array(ts), np.array(fs)
    k, c = np.polyfit(ts, np.log(fs), 1)
    for _ in range(2):  # 하모닉 오인식(튀는 점)은 빼고 다시 맞춤
        ok = np.abs(np.log(fs) - (k * ts + c)) < 0.12
        k, c = np.polyfit(ts[ok], np.log(fs[ok]), 1)
    t = np.arange(len(x)) / SR
    f = np.exp(k * t + c)
    f0 = float(np.exp(c + k * t[-1] / 2))
    u = np.concatenate([[0], np.cumsum(f[1:] / f0) / SR])  # 출력 시간 u(t)
    uo = np.arange(0, u[-1], 1 / SR)
    y = np.interp(np.interp(uo, u, t) * SR, np.arange(len(x)), x)
    return y, f0, float(np.exp(c)), float(np.exp(k * t[-1] + c))


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def encode(name, x):
    os.makedirs(OUT, exist_ok=True)
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    for ext, codec in (('ogg', ['-c:a', 'libvorbis', '-q:a', '2']), ('m4a', ['-c:a', 'aac', '-b:a', '56k', '-movflags', '+faststart'])):
        path = f'{OUT}/{name}.{ext}'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', *codec, '-map_metadata', '-1', path], input=pcm, check=True)
        print(f'  {path}  {os.path.getsize(path) / 1024:.1f} KB  {len(x) / SR:.2f} s')


idle_src, ride_src = decode(IDLE_IN), decode(RIDE_IN)
idle = loop(cut(idle_src, quiet_point(idle_src, IDLE[0] + 0.08), quiet_point(idle_src, IDLE[1] - 0.08)), 0.3)
s0, s1 = quiet_point(ride_src, START[0] + 0.08) if START[0] > 0.08 else START[0], quiet_point(ride_src, START[1])
start = fades(cut(ride_src, s0, s1), 0.006, 0.15)
l0, l1 = quiet_point(ride_src, LAUNCH[0]), quiet_point(ride_src, LAUNCH[1])
launch = fades(cut(ride_src, l0, l1), 0.02, 0.2)
ride, f0, fa, fb = dechirp(cut(ride_src, *RIDE))
ride = loop(ride, 0.25)

# 음량: 주행 루프 -19 dBFS, 공회전 -23 dBFS (RMS). 같은 녹음에서 나온 start/launch 는 주행과 같은 배율
g_ride = 10 ** ((-19 - rms_db(ride)) / 20)
g_idle = 10 ** ((-23 - rms_db(idle)) / 20)
peak = max(np.abs(x).max() * g_ride for x in (start, launch, ride))
if peak > 0.95:
    g_ride *= 0.95 / peak
idle *= min(g_idle, 0.95 / np.abs(idle).max())
print(f'idle {len(idle) / SR:.2f}s  start {s0:.2f}-{s1:.2f}s  launch {l0:.2f}-{l1:.2f}s  ride {RIDE[0]}-{RIDE[1]}s pitch {fa:.0f}->{fb:.0f} Hz flattened to {f0:.0f} Hz')
for name, x in (('idle', idle), ('start', start * g_ride), ('launch', launch * g_ride), ('ride', ride * g_ride)):
    encode(name, x)
