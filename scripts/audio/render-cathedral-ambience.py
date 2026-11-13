#!/usr/bin/env python3
# [cathedral-bgm] 명동성당 실내 배경음 — 직접 합성(저작권 있는 음원 없음). 64초 이음매 없는 반복.
#   부드러운 오르간 패드(8'·4' 플루트 배음) + 'ah' 합창(포먼트 가산 합성, 비브라토) + 아주 먼 발소리 + 실내 잡음
#   → 만든 성당 잔향(IR: 초기 반사 + 대역별 감쇠, RT60 ≈ 5 s)을 원형 합성곱으로 입혀 끝과 처음이 이어진다.
#   python3 scripts/audio/render-cathedral-ambience.py out.wav   (그다음 ffmpeg 로 webm/mp3/ogg)
import sys
import numpy as np
from scipy.signal import butter, sosfilt, sosfreqz

SR = 44100
CH = 8.0                      # 화음 하나 길이(초)
PROG = [                      # F장조, 느린 진행 (MIDI)
    [41, 48, 57, 64, 67],     # Fadd9
    [38, 45, 53, 57, 64],     # Dm9
    [34, 41, 50, 57, 60],     # Bbmaj7(9)
    [36, 43, 53, 55, 62],     # Csus4(9)
    [33, 45, 53, 60, 64],     # F/A
    [31, 43, 50, 58, 65],     # Gm7
    [34, 46, 53, 57, 62],     # Bbmaj7
    [36, 43, 52, 55, 64],     # C
]
L = int(SR * CH * len(PROG))  # 64 s
rng = np.random.default_rng(1898)
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)
out = np.zeros((2, L))


def circ_filter(x, sos):
    """영위상(|H|²) 필터를 FFT 로 — 원형이라 반복 이음매가 생기지 않는다"""
    n = x.shape[-1]
    _, h = sosfreqz(sos, worN=n // 2 + 1, fs=SR)
    return np.fft.irfft(np.fft.rfft(x, axis=-1) * (np.abs(h) ** 2), n=n, axis=-1)


def add_wrapped(buf, start, sig, pan=0.0):
    """sig(mono) 를 start 샘플부터 원형으로 더한다 (pan -1..1, 등전력)"""
    n = len(sig)
    idx = (start + np.arange(n)) % L
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    np.add.at(buf[0], idx, sig * gl)
    np.add.at(buf[1], idx, sig * gr)


def env(n, att, rel, hold_end):
    t = np.arange(n) / SR
    e = np.clip(t / att, 0, 1) ** 2 * (3 - 2 * np.clip(t / att, 0, 1))
    r = np.clip((t - hold_end) / rel, 0, 1)
    return e * (1 - r * r * (3 - 2 * r))


# ---- 오르간 패드 ----
PRE, TAIL = 2.0, 3.5
for ci, ch in enumerate(PROG):
    n = int(SR * (CH + PRE + TAIL)); t = np.arange(n) / SR
    e = env(n, 2.6, 3.2, CH + PRE - 0.4)
    swell = 0.85 + 0.15 * np.sin(2 * np.pi * (t / (CH + PRE + TAIL)) * 0.5 + ci)
    for k, m in enumerate(ch):
        f = mtof(m); sig = np.zeros(n)
        bass = k == 0
        for h, a in ((1, 1.0), (2, 0.42 if bass else 0.3), (3, 0.1), (4, 0.07 if not bass else 0.12)):
            if f * h > 5000: continue
            for det in (-0.9, 0.9):  # 두 파이프 살짝 어긋나게(코러스)
                ph = rng.uniform(0, 2 * np.pi)
                sig += a * np.sin(2 * np.pi * f * h * (1 + det / 1731) * t + ph)
        amp = (0.2 if bass else 0.3) / (1 + max(0, m - 64) / 30)
        add_wrapped(out, int(SR * (ci * CH - PRE)) , sig * e * swell * amp * 0.11, pan=(k - 2) * 0.22)

# ---- 'ah' 합창 (위 세 음, 화음마다 다른 세기) ----
FORM = [(750, 90, 1.0), (1150, 120, 0.6), (2600, 170, 0.28), (3300, 220, 0.12)]
def formant(fr):
    return sum(a * np.exp(-0.5 * ((fr - F) / bw) ** 2) for F, bw, a in FORM) + 0.04
CHOIR_LV = [0.7, 0.45, 0.85, 0.55, 0.75, 0.5, 0.9, 0.6]
for ci, ch in enumerate(PROG):
    n = int(SR * (CH + PRE + TAIL)); t = np.arange(n) / SR
    e = env(n, 3.4, 3.6, CH + PRE - 0.2)
    for k, m in enumerate(ch[2:]):
        f0 = mtof(m + 12 if m < 55 else m)  # 너무 낮은 음은 한 옥타브 위로(여성 합창 음역)
        for v in range(3):
            det = (v - 1) * 5.5 / 1731
            vib = 0.0028 * np.sin(2 * np.pi * (4.6 + rng.uniform(-0.4, 0.4)) * t + rng.uniform(0, 6.3)) * np.clip((t - 1.2) / 2.0, 0, 1)
            drift = 0.001 * np.sin(2 * np.pi * 0.07 * t + rng.uniform(0, 6.3))
            inst = f0 * (1 + det + vib + drift)
            phase = 2 * np.pi * np.cumsum(inst) / SR
            sig = np.zeros(n)
            for h in range(1, 40):
                fr = f0 * h
                if fr > 4500: break
                sig += formant(fr) / h ** 0.6 * np.sin(h * phase + rng.uniform(0, 6.3))
            breath = rng.standard_normal(n)
            sig += 0.015 * sosfilt(butter(2, [700, 2800], 'band', fs=SR, output='sos'), breath)
            add_wrapped(out, int(SR * (ci * CH - PRE + 0.6 + v * 0.25)), sig * e * CHOIR_LV[ci] * 0.05, pan=(k - 1) * 0.5 + (v - 1) * 0.15)

# ---- 아주 먼 발소리 (돌바닥, 낮고 둔하게) ----
lp = butter(2, 380, 'low', fs=SR, output='sos')
tstep = 3.0
while tstep < 60:
    nsteps = int(rng.integers(4, 8)); pan = rng.uniform(-0.8, 0.8); gap = rng.uniform(0.52, 0.62)
    for s in range(nsteps):
        nn = int(SR * 0.09); tt = np.arange(nn) / SR
        burst = rng.standard_normal(nn) * np.exp(-tt / 0.018) + 0.6 * np.sin(2 * np.pi * 95 * tt) * np.exp(-tt / 0.03)
        burst = sosfilt(lp, burst)
        lv = 0.010 * (0.8 + 0.4 * rng.random()) * np.sin(np.pi * (s + 0.5) / nsteps)
        add_wrapped(out, int(SR * (tstep + s * gap)), burst * lv, pan=pan + s * 0.03)
    tstep += rng.uniform(11, 17)

# ---- 실내 잡음 (아주 낮은 웅웅거림) ----
room = circ_filter(rng.standard_normal((2, L)), butter(2, [80, 300], 'band', fs=SR, output='sos'))
out += room * 0.002

# ---- 성당 잔향 IR ----
ir_len = int(SR * 6.5)
t = np.arange(ir_len) / SR
ir = np.zeros((2, ir_len))
bands = [(None, 250, 4.6), (250, 2000, 4.4), (2000, None, 2.4)]
for c in range(2):
    noise = rng.standard_normal(ir_len)
    tail = np.zeros(ir_len)
    for lo, hi, rt in bands:
        if lo is None: sos = butter(2, hi, 'low', fs=SR, output='sos')
        elif hi is None: sos = butter(2, lo, 'high', fs=SR, output='sos')
        else: sos = butter(2, [lo, hi], 'band', fs=SR, output='sos')
        tail += sosfilt(sos, noise) * np.exp(-6.91 * t / rt)
    pre = int(SR * 0.035)
    tail[:pre] = 0
    tail[pre:pre + int(SR * 0.08)] *= np.linspace(0, 1, int(SR * 0.08))
    for d, a in ((0.019, 0.5), (0.031, 0.42), (0.047, 0.35), (0.063, 0.3), (0.081, 0.25)):
        ir[c, int(SR * (d + 0.004 * c * rng.random()))] += a * (1 if rng.random() > 0.5 else -1)
    ir[c] += tail * 0.22
    ir[c] /= np.sqrt((ir[c] ** 2).sum())

wet = np.zeros_like(out)
for c in range(2):
    irp = np.zeros(L); irp[:ir_len] = ir[c]
    wet[c] = np.fft.irfft(np.fft.rfft(out[c]) * np.fft.rfft(irp), n=L)  # 원형 합성곱 → 끝이 처음으로 이어짐
mix = 0.32 * out + 0.9 * wet
mix = circ_filter(mix, butter(2, 70, 'high', fs=SR, output='sos'))
mix = circ_filter(mix, butter(1, 7000, 'low', fs=SR, output='sos'))
# 크기: 평균 ≈ −19 dBFS (게임 BGM ≈ −14 보다 조용하게), 정점 −1 dB 안쪽
rms = np.sqrt((mix ** 2).mean()); mix *= 10 ** (-19 / 20) / rms
pk = np.abs(mix).max(); lim = 10 ** (-1.5 / 20)
if pk > lim: mix = np.tanh(mix / lim) * lim
pcm = (np.clip(mix, -1, 1).T * 32767).astype('<i2')
import wave
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'cathedral.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('rendered', L / SR, 's  rms dB', round(20 * np.log10(np.sqrt((mix ** 2).mean())), 1), 'peak dB', round(20 * np.log10(np.abs(mix).max()), 1))
