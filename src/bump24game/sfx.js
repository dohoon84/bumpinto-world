// [bump24game] WebAudio 합성 효과음 (파일 없음). BGM 음소거·볼륨 + 매장 안 음소거 버튼 + ?rideSfx=0 을 따름.
const DEFAULT_LEVEL = () => {
  try { const p = window.__jj?.bgm?.player; return p ? { muted: !!p.muted, volume: p.volume ?? 1 } : { muted: false, volume: 1 }; } catch { return { muted: false, volume: 1 }; }
};
function loudness(level) { if (!level || level.muted) return 0; const v = Math.min(1, Math.max(0, Number(level.volume) || 0)); return 0.45 + 0.55 * v * v; }

export function createBump24Sfx({
  getLevel = DEFAULT_LEVEL,
  sfxOff = (() => { try { return new URLSearchParams(location.search).get('rideSfx') === '0'; } catch { return false; } })(),
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
} = {}) {
  let ctx = null, bus = null, noiseBuf = null, localMute = false;
  const ac = () => {
    if (ctx || !AudioCtx || sfxOff) return ctx;
    try {
      ctx = new AudioCtx();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
    return ctx;
  };
  const unlock = () => { const c = ac(); if (c && c.state !== 'running') try { c.resume()?.catch?.(() => {}); } catch { /* */ } };
  if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  const level = () => (localMute ? 0 : loudness(getLevel()));

  function tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, slide = 0, delay = 0, filter = 0, detune = 0 } = {}) {
    const c = ac(); if (!c) return; const g0 = level(); if (g0 <= 0) return;
    const t0 = c.currentTime + delay + 0.005;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * g0, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o; if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, { gain = 0.2, type = 'bandpass', freq = 2000, q = 1, delay = 0, sweep = 0, attack = 0.002 } = {}) {
    const c = ac(); if (!c) return; const g0 = level(); if (g0 <= 0) return;
    const t0 = c.currentTime + delay + 0.005;
    const s = c.createBufferSource(); s.buffer = noiseBuf; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * g0, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const hz = (semi, base = 523.25) => base * Math.pow(2, semi / 12);

  return {
    setMuted(m) { localMute = !!m; }, get muted() { return localMute; },
    /** 담기: 포장 바스락 + 뽁 + 콤보 따라 음 올라감 */
    pickup(combo = 1) {
      const s = PENTA[Math.min(PENTA.length - 1, Math.max(0, combo - 1))];
      noise(0.07, { gain: 0.12, freq: 3800, q: 0.8 });
      tone(hz(s, 392), 0.09, { type: 'sine', gain: 0.32, slide: 1.9 });
      tone(hz(s + 12, 392), 0.12, { type: 'triangle', gain: 0.12, delay: 0.035 });
      if (combo >= 5) tone(hz(s + 19, 392), 0.16, { type: 'sine', gain: 0.08, delay: 0.07 });
    },
    sale() { tone(1318, 0.08, { type: 'square', gain: 0.07, filter: 3000 }); tone(1760, 0.14, { type: 'square', gain: 0.07, delay: 0.06, filter: 3000 }); },
    /** 넘침: 쿵 + 와르르(여러 개 딸그락) */
    spill() {
      tone(120, 0.3, { type: 'sine', gain: 0.5, slide: 0.4 });
      noise(0.35, { gain: 0.3, type: 'lowpass', freq: 1400, q: 0.7, sweep: 0.3 });
      for (let i = 0; i < 9; i++) { const d = 0.05 + i * 0.045 + Math.random() * 0.03; noise(0.05, { gain: 0.2 - i * 0.015, freq: 2500 + Math.random() * 3000, q: 6, delay: d }); tone(700 + Math.random() * 900, 0.05, { type: 'triangle', gain: 0.06, delay: d }); }
    },
    bounce(v = 1) { noise(0.04, { gain: 0.08 * v, freq: 1800 + Math.random() * 1500, q: 5 }); },
    /** 카운트다운 째깍(5~1) — 마지막은 높게 */
    countdown(n) {
      if (n <= 0) return;
      tone(n === 1 ? 1046 : 784, 0.16, { type: 'square', gain: 0.12, filter: 2600 });
      tone(n === 1 ? 2093 : 1568, 0.06, { type: 'sine', gain: 0.06 });
      noise(0.03, { gain: 0.08, freq: 6000, q: 2 });
    },
    tick() { tone(1800, 0.03, { type: 'square', gain: 0.05, filter: 4000 }); },
    /** 시작 호루라기(떨림) */
    startWhistle() {
      const c = ac(); if (!c) return; const g0 = level(); if (g0 <= 0) return;
      const t0 = c.currentTime + 0.01, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(2400, t0); o.frequency.linearRampToValueAtTime(2800, t0 + 0.08);
      lfo.frequency.value = 38; lg.gain.value = 140; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22 * g0, t0 + 0.02); g.gain.setValueAtTime(0.22 * g0, t0 + 0.42); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g); g.connect(bus); o.start(t0); lfo.start(t0); o.stop(t0 + 0.62); lfo.stop(t0 + 0.62);
      noise(0.5, { gain: 0.05, freq: 3000, q: 1 });
    },
    /** 마지막 5초 째깍(빨라짐) */
    urgent(k = 0) { tone(k % 2 ? 1250 : 980, 0.05, { type: 'square', gain: 0.09, filter: 3500 }); },
    /** 스캐너 삑 */
    scan(i = 0) { tone(2350 + (i % 2) * 40, 0.085, { type: 'square', gain: 0.1, filter: 5000 }); },
    /** 계산 완료 카칭 */
    kaching() {
      noise(0.12, { gain: 0.18, freq: 5200, q: 3 });
      tone(1567, 0.25, { type: 'triangle', gain: 0.18, delay: 0.02 }); tone(2093, 0.5, { type: 'sine', gain: 0.16, delay: 0.09 }); tone(3136, 0.4, { type: 'sine', gain: 0.07, delay: 0.09 });
      for (let i = 0; i < 5; i++) tone(4000 + i * 350, 0.06, { type: 'sine', gain: 0.03, delay: 0.12 + i * 0.03 });
    },
    printer() { for (let i = 0; i < 6; i++) noise(0.03, { gain: 0.05, freq: 1200 + (i % 2) * 400, q: 4, delay: i * 0.04 }); },
    /** 결과 팡파르 (신기록이면 더 화려하게) */
    fanfare(big = false) {
      const seq = [[0, 0], [4, 0.12], [7, 0.24], [12, 0.38]];
      for (const [s, d] of seq) { tone(hz(s), 0.32, { type: 'square', gain: 0.07, delay: d, filter: 2400 }); tone(hz(s), 0.32, { type: 'triangle', gain: 0.12, delay: d }); }
      for (const s of [0, 4, 7, 12]) tone(hz(s), 1.0, { type: 'sawtooth', gain: 0.04, delay: 0.52, filter: 1800, detune: s * 2 });
      if (big) for (let i = 0; i < 8; i++) tone(hz(24 + PENTA[i % 5]), 0.1, { type: 'sine', gain: 0.05, delay: 0.6 + i * 0.06 });
    },
    timeUp() { tone(880, 0.45, { type: 'square', gain: 0.12, slide: 0.5, filter: 2000 }); tone(440, 0.6, { type: 'sawtooth', gain: 0.06, slide: 0.5, filter: 1200, delay: 0.05 }); },
    basketGrab() { noise(0.08, { gain: 0.14, freq: 900, q: 1.5 }); tone(330, 0.1, { type: 'triangle', gain: 0.12, slide: 1.5 }); },
    door() { tone(1318, 0.35, { type: 'sine', gain: 0.12 }); tone(1046, 0.5, { type: 'sine', gain: 0.12, delay: 0.22 }); }, // 편의점 문 딩동
    deny() { tone(220, 0.12, { type: 'square', gain: 0.07, filter: 900 }); },
  };
}
