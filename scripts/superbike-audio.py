#!/usr/bin/env python3
# [superbike] 녹음 → 슈퍼바이크 RR 엔진음 (public/audio/superbike/*.{ogg,m4a}, 모노 32 kHz)
#   idle   : 공회전 녹음에서 잘라 끝↔처음을 등전력 크로스페이드한 루프
#   start  : 시동~스로틀 블립 (탈 때 1회)
#   launch : 출발해서 1단 끝(첫 변속)까지 (정지에서 출발할 때 1회)
#   (ride  : 시동→주행 녹음의 2단 구간을 편 루프. 지금은 파일로 내보내지 않고 start/launch 음량 기준으로만 쓴다)
#   gear1~5: 기어별 녹음(1~5단 가속) 각각에서 변속 사이 가속 구간을 골라 음높이를 펴서 만든 루프
#            게임은 현재 기어의 루프를 틀고 기어 안 회전 비율로 재생 속도를 조금만(±10% 안팎) 바꾼다. 6단은 gear5 재사용
# 사용: python3 scripts/superbike-audio.py <공회전.m4a> <시동→주행.m4a> [outdir]          → idle/start/launch
#       python3 scripts/superbike-audio.py --gears <1단> <2단> <3단> <4단> <5단> [outdir]  → gear1~5
# (numpy, scipy, ffmpeg 필요)
import sys, os, subprocess, numpy as np
from scipy import signal

SR = 32000
USAGE = 'usage: superbike-audio.py idle.m4a start-ride.m4a [outdir] | --gears g1.m4a g2.m4a g3.m4a g4.m4a g5.m4a [outdir]'
GEARS_MODE = len(sys.argv) > 1 and sys.argv[1] == '--gears'
ARGS = sys.argv[2:] if GEARS_MODE else sys.argv[1:]
if len(ARGS) < (5 if GEARS_MODE else 2):
    sys.exit(USAGE)
OUT_ARG = ARGS[5 if GEARS_MODE else 2] if len(ARGS) > (5 if GEARS_MODE else 2) else None
OUT = OUT_ARG or 'public/audio/superbike'
# 시동→주행 녹음 구간(초). 첫 변속(음높이 급락)과 블립 뒤 출발 지점에서 자른다.
START = (0.05, 1.88)
LAUNCH = (1.85, 4.12)
RIDE = (4.2, 6.1)
IDLE = (0.12, 3.0)
# 기어별 녹음에서 쓸 구간(초)과 음높이를 따라갈 대역(Hz). 앞뒤의 변속(음높이 급락)·감속은 뺀다.
#   1단 2.1 s: 0.25 s 변속 직후부터 끝까지 가파르게 상승 / 2단 3.4 s: 거의 일정하다가 2.3 s 부터 감속
#   3단 3.7 s: 0.5~3.2 s 상승, 3.3 s 변속 / 4단 4.7 s: 0.2~3.9 s 완만 상승, 4.0 s 변속 / 5단 6.9 s: 처음부터 길게 상승
GEAR_CUTS = [(0.35, 1.95, (470, 530)), (0.15, 2.3, (450, 500)), (0.6, 3.15, (400, 440)), (0.25, 3.85, (420, 450)), (2.0, 4.8, (150, 250))]


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
    fr, ts, S = signal.spectrogram(x, SR, nperseg=4096, noverlap=4096 - 800)  # 128 ms 창 → 하모닉이 갈라져 보임
    fs, prev = [], None
    for j in range(S.shape[1]):
        lo, hi = band if prev is None else (prev * 0.93, prev * 1.07)  # 첫 프레임만 대역에서 찾고, 이후엔 앞 프레임 근처를 따라감
        m = (fr > lo) & (fr < hi)
        prev = fr[m][S[m, j].argmax()]
        fs.append(prev)
    fs = np.array(fs)
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


def level(x, db):
    return x * min(10 ** ((db - rms_db(x)) / 20), 0.95 / np.abs(x).max())


def make_gears(paths):
    for g, (path, (a, b, band)) in enumerate(zip(paths, GEAR_CUTS), 1):
        y, f0, fa, fb = dechirp(cut(decode(path), a, b), band)
        y = level(loop(y, 0.3), -19)
        print(f'gear{g} {a}-{b}s pitch {fa:.0f}->{fb:.0f} Hz flattened to {f0:.0f} Hz')
        encode(f'gear{g}', y)


def make_base(idle_in, ride_in):
    idle_src, ride_src = decode(idle_in), decode(ride_in)
    idle = loop(cut(idle_src, quiet_point(idle_src, IDLE[0] + 0.08), quiet_point(idle_src, IDLE[1] - 0.08)), 0.3)
    s0, s1 = quiet_point(ride_src, START[0] + 0.08) if START[0] > 0.08 else START[0], quiet_point(ride_src, START[1])
    start = fades(cut(ride_src, s0, s1), 0.006, 0.15)
    l0, l1 = quiet_point(ride_src, LAUNCH[0]), quiet_point(ride_src, LAUNCH[1])
    launch = fades(cut(ride_src, l0, l1), 0.02, 0.2)
    ride, f0, fa, fb = dechirp(cut(ride_src, *RIDE))
    ride = loop(ride, 0.25)

    # 음량: 주행 루프 -19 dBFS(기어 루프와 같음), 공회전 -23 dBFS (RMS). 같은 녹음에서 나온 start/launch 는 그 주행 구간과 같은 배율
    g_ride = 10 ** ((-19 - rms_db(ride)) / 20)
    g_idle = 10 ** ((-23 - rms_db(idle)) / 20)
    peak = max(np.abs(x).max() * g_ride for x in (start, launch, ride))
    if peak > 0.95:
        g_ride *= 0.95 / peak
    idle *= min(g_idle, 0.95 / np.abs(idle).max())
    print(f'idle {len(idle) / SR:.2f}s  start {s0:.2f}-{s1:.2f}s  launch {l0:.2f}-{l1:.2f}s  ride {RIDE[0]}-{RIDE[1]}s pitch {fa:.0f}->{fb:.0f} Hz flattened to {f0:.0f} Hz')
    for name, x in (('idle', idle), ('start', start * g_ride), ('launch', launch * g_ride)):
        encode(name, x)


if GEARS_MODE:
    make_gears(ARGS[:5])
else:
    make_base(*ARGS[:2])
