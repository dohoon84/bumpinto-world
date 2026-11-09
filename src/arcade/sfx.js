// [arcade] 범핑팡 — 귀여운 WebAudio 합성 SFX + 경쾌 BGM (오리지널, 파일 음원 없음)
const DEFAULT_LEVEL = () => {
  try { const p = window.__jj?.bgm?.player; return p ? { muted: !!p.muted, volume: p.volume ?? 1 } : { muted: false, volume: 1 }; } catch { return { muted: false, volume: 1 }; }
};
function loudness(level) { if (!level || level.muted) return 0; const v = Math.min(1, Math.max(0, Number(level.volume) || 0)); return 0.45 + 0.55 * v * v; }

export function createArcadeSfx({
  getLevel = DEFAULT_LEVEL,
  sfxOff = (() => { try { return new URLSearchParams(location.search).get('rideSfx') === '0'; } catch { return false; } })(),
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
} = {}) {
  let ctx = null, bus = null, noiseBuf = null, localMute = false, bgmNodes = null, bgmOn = false, urgent = false, bgmTimer = 0;
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
    try {
      const t0 = c.currentTime + delay + 0.005;
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.detune.value = detune;
      o.frequency.setValueAtTime(Math.max(30, freq), t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * g0), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = o; if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
      node.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch { /* audio graph race */ }
  }
  function noise(dur, { gain = 0.2, type = 'bandpass', freq = 2000, q = 1, delay = 0, sweep = 0, attack = 0.002 } = {}) {
    const c = ac(); if (!c || !noiseBuf) return; const g0 = level(); if (g0 <= 0) return;
    try {
      const t0 = c.currentTime + delay + 0.005;
      const s = c.createBufferSource(); s.buffer = noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
      if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t0 + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * g0), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(bus); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
    } catch { /* */ }
  }
  const hz = (semi, base = 523.25) => base * Math.pow(2, semi / 12);

  function stopBgm() {
    if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = 0; }
    if (!bgmNodes) { bgmOn = false; return; }
    try { bgmNodes.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch { /* */ } }); } catch { /* */ }
    bgmNodes = null; bgmOn = false;
  }

  /** 귀여운 8비트풍 펜타토닉 루프 — urgent 시 템포↑ */
  function startBgm() {
    const c = ac(); if (!c || bgmOn) return; const g0 = level(); if (g0 <= 0) return;
    stopBgm();
    const notes = [0, 2, 4, 7, 4, 2, 0, 7, 4, 7, 9, 7, 4, 2, 0, -5];
    const master = c.createGain(); master.gain.value = 0.05 * g0; master.connect(bus);
    const nodes = [master];
    bgmOn = true;
    const loop = () => {
      if (!bgmOn) return;
      const beat = urgent ? 0.14 : 0.2;
      const now = c.currentTime;
      for (let i = 0; i < notes.length; i++) {
        try {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'square'; o.frequency.value = hz(notes[i], 262);
          const t = now + i * beat;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.65, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.8);
          o.connect(g); g.connect(master); o.start(t); o.stop(t + beat);
          nodes.push(o, g);
        } catch { /* */ }
      }
      for (let i = 0; i < 4; i++) {
        try {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'triangle'; o.frequency.value = hz(i % 2 ? -5 : -12, 131);
          const t = now + i * beat * 4;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 3.2);
          o.connect(g); g.connect(master); o.start(t); o.stop(t + beat * 4);
          nodes.push(o, g);
        } catch { /* */ }
      }
      // cute sparkle every other bar
      try {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = hz(19, 523);
        const t = now + beat * 8;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.15); nodes.push(o, g);
      } catch { /* */ }
      bgmNodes = nodes;
      bgmTimer = setTimeout(loop, notes.length * beat * 1000 - 20);
    };
    try { loop(); } catch (e) { console.warn('[arcade-sfx] bgm', e); bgmOn = false; }
  }

  return {
    setMuted(m) { localMute = !!m; if (localMute) stopBgm(); },
    get muted() { return localMute; },
    setUrgentBgm(on) { urgent = !!on; },
    unlock,
    door() { tone(880, 0.2, { type: 'sine', gain: 0.12 }); tone(1320, 0.35, { type: 'sine', gain: 0.1, delay: 0.12 }); },
    select() { tone(990, 0.05, { type: 'sine', gain: 0.09, filter: 4000 }); tone(1320, 0.04, { type: 'triangle', gain: 0.05, delay: 0.03 }); },
    swap() { tone(520, 0.06, { type: 'triangle', gain: 0.1 }); tone(780, 0.08, { type: 'triangle', gain: 0.08, delay: 0.04 }); },
    deny() { tone(220, 0.08, { type: 'square', gain: 0.07, filter: 900 }); tone(160, 0.12, { type: 'square', gain: 0.06, delay: 0.07, filter: 700 }); },
    match(combo = 1) {
      const step = Math.min(10, combo);
      const base = 523 + step * 55; // rising pitch per combo
      noise(0.05, { gain: 0.12, freq: 2800 + step * 120, q: 1.1 });
      tone(base, 0.09, { type: 'sine', gain: 0.2, slide: 1.5 });
      tone(base * 1.5, 0.12, { type: 'triangle', gain: 0.09, delay: 0.025 });
      if (combo >= 3) tone(base * 2, 0.16, { type: 'sine', gain: 0.07, delay: 0.05 });
    },
    cascade(n = 1) { for (let i = 0; i < Math.min(6, n); i++) tone(700 + i * 100, 0.06, { type: 'sine', gain: 0.07, delay: i * 0.035 }); },
    special() {
      noise(0.18, { gain: 0.18, freq: 1600, q: 0.8, sweep: 2.2 });
      tone(392, 0.22, { type: 'triangle', gain: 0.1, slide: 2.0, filter: 2400 });
      tone(784, 0.28, { type: 'square', gain: 0.07, delay: 0.06, filter: 3200 });
      tone(1175, 0.15, { type: 'sine', gain: 0.06, delay: 0.14 });
    },
    countdown(n) { tone(n === 1 ? 1046 : n === 2 ? 880 : 784, 0.14, { type: 'square', gain: 0.11, filter: 2800 }); },
    startWhistle() { tone(1400, 0.28, { type: 'sine', gain: 0.13, slide: 1.35 }); tone(1800, 0.18, { type: 'triangle', gain: 0.08, delay: 0.12 }); },
    urgent() { tone(1200, 0.04, { type: 'square', gain: 0.07, filter: 3600 }); },
    timeUp() { tone(660, 0.45, { type: 'square', gain: 0.11, slide: 0.5, filter: 1800 }); tone(330, 0.35, { type: 'triangle', gain: 0.08, delay: 0.2 }); },
    fanfare(big = false) {
      const seq = [[0, 0], [4, 0.09], [7, 0.18], [12, 0.3]];
      for (const [s, d] of seq) tone(hz(s), 0.26, { type: 'square', gain: 0.08, delay: d, filter: 2600 });
      if (big) for (let i = 0; i < 6; i++) tone(hz(12 + i), 0.09, { type: 'sine', gain: 0.05, delay: 0.42 + i * 0.045 });
    },
    startBgm, stopBgm,
  };
}
