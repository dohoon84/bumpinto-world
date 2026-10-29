#!/usr/bin/env python3
# [bikeaudio] Admin Cruiser 배기음 합성기 — 샘플/녹음 없이 수식으로 생성 (저작권 이슈 없음)
# 45° V-twin: 크랭크 0°/315° 점화 → 315°·405° 불균등 간격 ("potato-potato")
# 루프는 '원형 버퍼'에서 생성: 정수 사이클 수 + 주기적 변조 + 순환 필터링 → 루프 경계 완전 연속
# 사용: python3 scripts/synth-bike-audio.py [outdir]   (numpy, scipy, ffmpeg 필요)
import sys, os, json, subprocess, numpy as np
from scipy import signal
SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/audio'

def circ_sos(sos, x):
    """IIR 필터를 원형(주기) 신호로 적용: 두 바퀴 돌려 정상상태의 두 번째 바퀴만 사용"""
    return signal.sosfilt(sos, np.concatenate([x, x, x]))[2 * len(x):]

def bp(f, q):  # 대역통과(공명) 2차
    return signal.butter(1, [f / (1 + 0.5 / q), f * (1 + 0.5 / q)], 'bandpass', fs=SR, output='sos')

def synth(name, rpm, dur, seed, P):
    rng = np.random.default_rng(seed)
    N = int(SR * dur)
    cyc_per_s = round(rpm / 120 * dur) / dur          # 4행정: 2회전=1사이클, 루프 안에 정수 사이클
    rpm = cyc_per_s * 120
    t = np.arange(N) / SR
    # 느린 회전수 흔들림 — 루프 길이에 정수 주기인 사인만 사용해 위상 누적이 정확히 정수가 되게
    wob = sum(a * np.sin(2 * np.pi * k * t / dur + ph) for k, a, ph in P['wobble'])
    phase = np.cumsum(cyc_per_s * (1 + wob)) / SR      # 사이클 단위 위상
    phase *= round(phase[-1]) / phase[-1]
    x = np.zeros(N); env = np.zeros(N)
    events = []
    for cyl, off in ((0, 0.0), (1, 315 / 720)):        # 앞 실린더 0°, 뒤 실린더 315°
        ks = np.arange(int(round(phase[-1])))  # 정확히 정수 사이클 (마지막=처음과 겹치지 않게)
        idx = np.searchsorted(phase, ks + off)
        for i in idx:
            if i >= N: continue
            j = int(round(i + rng.normal(0, P['tjit'] * SR))) % N
            a = P['cyl_amp'][cyl] * (1 + rng.normal(0, P['ajit']))
            if rng.random() < P['weak_p']: a *= rng.uniform(0.45, 0.7)   # 가끔 약한 폭발 (공회전 럼프)
            events.append((j, a, cyl))
    L = int(SR * P['plen'])
    tt = np.arange(L) / SR
    tau = P['tau']
    bump = (tt / tau) * np.exp(1 - tt / tau)             # 압력 펄스
    reb = (tt / (tau * 3)) * np.exp(1 - tt / (tau * 3))  # 완만한 부압(리바운드) → DC 0
    kern = bump - reb * bump.sum() / reb.sum()
    nenv = np.exp(-tt / P['ntau'])
    for j, a, cyl in events:
        nb = rng.normal(0, 1, L) * nenv * P['noise']
        p = a * (kern + nb)
        ids = (j + np.arange(L)) % N
        np.add.at(x, ids, p)
        np.add.at(env, ids, a * np.exp(-tt / 0.02))
    # 머플러/배관 공명 포먼트 + 저역 통과 (디지털 버즈 억제)
    y = P['direct'] * circ_sos(signal.butter(2, P['lp'], 'low', fs=SR, output='sos'), x)
    for f, q, g in P['formants']:
        y += g * circ_sos(bp(f, q), x)
    # 낮은 럼블: 저역 노이즈를 점화 엔벌로프로 변조
    rum = circ_sos(signal.butter(2, P['rum_f'], 'low', fs=SR, output='sos'), rng.normal(0, 1, N))
    envs = circ_sos(signal.butter(1, 25, 'low', fs=SR, output='sos'), env)
    y = y / (np.abs(y).max() + 1e-9) + P['rum'] * rum / (np.abs(rum).max() + 1e-9) * (0.4 + envs / (envs.max() + 1e-9))
    # 부드러운 포화(스로틀 하중 → 굵은 배음), 마무리 필터
    d = P['drive']
    y = np.tanh(d * y / np.abs(y).max()) / np.tanh(d)
    y = circ_sos(signal.butter(2, 28, 'high', fs=SR, output='sos'), y)
    y = circ_sos(signal.butter(4, P['final_lp'], 'low', fs=SR, output='sos'), y)
    return y, rpm, sorted(events)

IDLE = dict(wobble=[(1, 0.012, 0.3), (3, 0.006, 1.1), (7, 0.004, 2.0)], tjit=0.0009, ajit=0.12, weak_p=0.06,
            cyl_amp=(1.0, 0.86), plen=0.09, tau=0.0028, ntau=0.006, noise=0.18,
            direct=0.35, lp=650, formants=[(62, 1.6, 1.0), (118, 2.5, 0.65), (230, 3.5, 0.32), (470, 4, 0.12)],
            rum_f=70, rum=0.22, drive=1.6, final_lp=2600)
RIDE = dict(wobble=[(1, 0.006, 0.7), (2, 0.004, 2.4), (5, 0.003, 0.2)], tjit=0.00035, ajit=0.07, weak_p=0.0,
            cyl_amp=(1.0, 0.92), plen=0.06, tau=0.0022, ntau=0.009, noise=0.32,
            direct=0.5, lp=1300, formants=[(78, 1.4, 1.0), (150, 2.2, 0.8), (300, 3, 0.5), (620, 3.5, 0.28), (1150, 4, 0.12)],
            rum_f=110, rum=0.3, drive=2.6, final_lp=3500)

def lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-stream_loop', '2', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(r.rsplit('I:', 1)[1].split('LUFS')[0])

def write_wav(path, y):
    from scipy.io import wavfile
    wavfile.write(path, SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name, rpm, dur, seed, P in (('bike_idle', 960, 4.0, 11, IDLE), ('bike_ride', 2900, 4.0, 23, RIDE)):
        y, rpm, ev = synth(name, rpm, dur, seed, P)
        tmp = f'/tmp/{name}.wav'
        y = y / np.abs(y).max() * 10 ** (-1.5 / 20)                # 우선 피크 -1.5 dBFS (인코딩 오버슈트 여유 → 최종 ≤ -1 dBFS)
        write_wav(tmp, y); L0 = lufs(tmp)
        g = 10 ** ((-14 - L0) / 20)
        if g > 1:  # -14 LUFS 까지 올리되, 넘치는 피크는 부드러운 리미터(tanh)로 -1.5 dBFS 이하
            ceil = 10 ** (-1.5 / 20); z = y * g
            y = np.where(np.abs(z) > 0.6 * ceil, np.sign(z) * (0.6 * ceil + 0.4 * ceil * np.tanh((np.abs(z) - 0.6 * ceil) / (0.4 * ceil))), z)
        else:
            y = y * g
        write_wav(tmp, y)
        meta[name] = dict(rpm=round(rpm, 1), dur=dur, events=len(ev), lufs_before=round(L0, 2), lufs=round(lufs(tmp), 2),
                          peak_dbfs=round(20 * np.log10(np.abs(y).max()), 2))
        np.save(f'/tmp/{name}_events.npy', np.array([(j, a, c) for j, a, c in ev]))
        for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '2']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', '80k'])):
            subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-ar', str(SR), *args, f'{OUT}/{name}.{ext}'], check=True)
    print(json.dumps(meta, indent=1))
