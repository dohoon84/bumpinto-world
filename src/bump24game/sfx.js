// [bump24game] WebAudio 합성 효과음. BGM 음소거·볼륨·?rideSfx=0 을 그대로 따름.
const DEFAULT_LEVEL = () => {
  try {
    const p = window.__jj?.bgm?.player;
    return p ? { muted: !!p.muted, volume: p.volume ?? 1 } : { muted: false, volume: 1 };
  } catch { return { muted: false, volume: 1 }; }
};

function loudness(level) {
  if (!level || level.muted) return 0;
  const v = Math.min(1, Math.max(0, Number(level.volume) || 0));
  return 0.45 + 0.55 * v * v;
}

export function createBump24Sfx({
  getLevel = DEFAULT_LEVEL,
  sfxOff = (() => { try { return new URLSearchParams(location.search).get('rideSfx') === '0'; } catch { return false; } })(),
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
} = {}) {
  let ctx = null;
  const ac = () => {
    if (ctx || !AudioCtx || sfxOff) return ctx;
    try { ctx = new AudioCtx(); } catch { ctx = null; }
    return ctx;
  };
  const unlock = () => {
    const c = ac();
    if (c && c.state !== 'running') try { c.resume()?.catch?.(() => {}); } catch { /* */ }
  };
  if (typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  function tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.008, release = 0.08, slide = 0, delay = 0 } = {}) {
    const c = ac(); if (!c) return;
    const g0 = loudness(getLevel()); if (g0 <= 0) return;
    const t0 = c.currentTime + delay + 0.01;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * g0, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + release);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /* */ } };
  }

  function noise(dur, { gain = 0.15, attack = 0.005, release = 0.12, filterFreq = 1800, delay = 0, type = 'bandpass', Q = 0.8 } = {}) {
    const c = ac(); if (!c) return;
    const g0 = loudness(getLevel()); if (g0 <= 0) return;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = Q;
    const g = c.createGain();
    const t0 = c.currentTime + delay + 0.01;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * g0, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur + release);
  }

  return {
    unlock,
    pickup(combo = 1) {
      const pitch = 520 + Math.min(10, combo) * 55;
      tone(pitch, 0.09, { type: 'triangle', gain: 0.18, slide: 120 });
      tone(pitch * 1.5, 0.06, { type: 'sine', gain: 0.08, delay: 0.02 });
    },
    spill() {
      noise(0.35, { gain: 0.28, filterFreq: 900, type: 'lowpass' });
      noise(0.22, { gain: 0.18, filterFreq: 2400, type: 'bandpass', delay: 0.04 });
      tone(180, 0.18, { type: 'square', gain: 0.06, slide: -80 });
    },
    tick() { tone(880, 0.05, { type: 'square', gain: 0.1 }); },
    countdown(n) {
      if (n <= 0) {
        tone(660, 0.12, { type: 'sawtooth', gain: 0.14 });
        tone(990, 0.18, { type: 'triangle', gain: 0.12, delay: 0.08 });
        tone(1320, 0.22, { type: 'sine', gain: 0.1, delay: 0.16 });
      } else tone(440 + (4 - n) * 80, 0.12, { type: 'square', gain: 0.12 });
    },
    startWhistle() {
      tone(1400, 0.28, { type: 'sine', gain: 0.14, slide: 400 });
      tone(1800, 0.2, { type: 'triangle', gain: 0.08, delay: 0.1 });
    },
    urgent() { tone(1100, 0.04, { type: 'square', gain: 0.08 }); },
    scan() {
      tone(2100, 0.04, { type: 'square', gain: 0.1 });
      tone(2600, 0.05, { type: 'sine', gain: 0.08, delay: 0.03 });
    },
    kaching() {
      tone(880, 0.08, { type: 'triangle', gain: 0.16 });
      tone(1320, 0.14, { type: 'sine', gain: 0.14, delay: 0.05 });
      tone(1760, 0.2, { type: 'sine', gain: 0.1, delay: 0.12 });
      noise(0.08, { gain: 0.06, filterFreq: 4000, type: 'highpass', delay: 0.05 });
    },
    fanfare() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.12, delay: i * 0.08 }));
      tone(1318, 0.35, { type: 'sine', gain: 0.1, delay: 0.35 });
    },
    basketGrab() { tone(320, 0.1, { type: 'triangle', gain: 0.12, slide: 80 }); },
    door() { tone(240, 0.15, { type: 'sine', gain: 0.1 }); noise(0.12, { gain: 0.08, filterFreq: 600, type: 'lowpass' }); },
  };
}
