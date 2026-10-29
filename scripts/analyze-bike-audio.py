# [bikeaudio] 합성 배기음 검증: 디코드 길이/루프 이음새/RMS/피크/점화 간격 + 스펙트로그램 PNG. 사용: python3 scripts/synth-bike-audio.py && python3 scripts/analyze-bike-audio.py [outdir]
import subprocess, numpy as np, json, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from scipy import signal
import sys, os
SR = 44100; OUT = sys.argv[1] if len(sys.argv) > 1 else 'audio-report'; os.makedirs(OUT, exist_ok=True); res = {}
def dec(p):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', p, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True)
    return np.frombuffer(r.stdout, np.int16) / 32768
for name, rpm in (('bike_idle', 960), ('bike_ride', 2910)):
    r = {}
    for ext in ('ogg', 'mp3'):
        x = dec(f'public/audio/{name}.{ext}')
        d = np.abs(np.diff(x))
        r[ext] = dict(samples=len(x), dur=round(len(x) / SR, 4), rms_db=round(20 * np.log10(np.sqrt((x ** 2).mean())), 2),
                      peak_db=round(20 * np.log10(np.abs(x).max()), 2), loop_jump=round(abs(x[0] - x[-1]), 5),
                      median_step=round(float(np.median(d)), 5), p99_step=round(float(np.percentile(d, 99)), 5))
        if ext == 'ogg': xo = x
    # 루프 이음새: 끝 0.25s + 처음 0.25s 붙여 보기
    seam = np.concatenate([xo[-int(.25 * SR):], xo[:int(.25 * SR)]])
    # 점화 간격 검출 (엔벌로프 피크)
    env = signal.sosfiltfilt(signal.butter(2, 120, 'low', fs=SR, output='sos'), np.abs(xo))
    minsep = int(SR * 60 / rpm * (300 / 360) * 0.6)
    pk, _ = signal.find_peaks(env, distance=minsep, prominence=env.max() * 0.08)
    ioi = np.diff(pk) / SR * 1000
    ev = np.load(f'/tmp/{name}_events.npy'); gt = np.diff(np.sort(ev[:, 0])) / SR * 1000
    exp315, exp405 = 60000 / rpm * 315 / 360, 60000 / rpm * 405 / 360
    r['firing'] = dict(expected_ms=[round(exp315, 1), round(exp405, 1)], synth_gap_ms_mean_short=round(gt[gt < (exp315 + exp405) / 2].mean(), 1),
                       synth_gap_ms_mean_long=round(gt[gt >= (exp315 + exp405) / 2].mean(), 1),
                       detected_peaks=len(pk), detected_gap_ms_p25_p75=[round(np.percentile(ioi, 25), 1), round(np.percentile(ioi, 75), 1)])
    res[name] = r
    fig, ax = plt.subplots(4, 1, figsize=(11, 12), gridspec_kw=dict(height_ratios=[3, 1.4, 1.4, 1.4]))
    f, tt, S = signal.spectrogram(xo, SR, nperseg=4096, noverlap=3584)
    ax[0].pcolormesh(tt, f, 10 * np.log10(S + 1e-12), shading='auto', cmap='magma', vmin=-110); ax[0].set_ylim(0, 3000)
    ax[0].set_title(f'{name}.ogg spectrogram (0-3 kHz)  rpm≈{rpm}'); ax[0].set_ylabel('Hz')
    w = int(0.6 * SR); ax[1].plot(np.arange(w) / SR * 1000, xo[:w], lw=.6); ax[1].plot(np.arange(w) / SR * 1000, env[:w] * 3, 'r', lw=1)
    for p in pk[pk < w]: ax[1].axvline(p / SR * 1000, color='g', alpha=.4)
    ax[1].set_title('first 600 ms waveform + envelope (green = detected firing pulses)'); ax[1].set_xlabel('ms')
    ax[2].hist(ioi, bins=60, color='tab:purple'); [ax[2].axvline(v, color='k', ls='--') for v in (exp315, exp405)]
    ax[2].set_title(f'inter-pulse intervals (ms) — dashed = 315° {exp315:.1f} / 405° {exp405:.1f}')
    ax[3].plot((np.arange(len(seam)) - len(seam) // 2) / SR * 1000, seam, lw=.6); ax[3].axvline(0, color='r')
    ax[3].set_title(f'loop seam (end→start), |jump|={r["ogg"]["loop_jump"]} vs median step {r["ogg"]["median_step"]}'); ax[3].set_xlabel('ms around loop point')
    plt.tight_layout(); plt.savefig(f'{OUT}/spectrogram_{name}.png', dpi=80); plt.close()
print(json.dumps(res, indent=1))
