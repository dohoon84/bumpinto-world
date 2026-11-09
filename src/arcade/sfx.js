// [arcade] 범핑팡 — 모바일 퍼즐급 WebAudio (레이어드 팝 · 치ptune/마림바 BGM · 컴프레서/리미터)
// 파일 샘플 없음(오리지널 합성). CC0 샘플 미사용.
const DEFAULT_LEVEL = () => {
  try { const p = window.__jj?.bgm?.player; return p ? { muted: !!p.muted, volume: p.volume ?? 1 } : { muted: false, volume: 1 }; } catch { return { muted: false, volume: 1 }; }
};
function loudness(level) { if (!level || level.muted) return 0; const v = Math.min(1, Math.max(0, Number(level.volume) || 0)); return 0.5 + 0.5 * v * v; }
const semi = (n, base = 523.25) => base * Math.pow(2, n / 12);

export function createArcadeSfx({
  getLevel = DEFAULT_LEVEL,
  sfxOff = (() => { try { return new URLSearchParams(location.search).get('rideSfx') === '0'; } catch { return false; } })(),
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
} = {}) {
  let ctx = null, master = null, sfxBus = null, bgmBus = null, noiseBuf = null;
  let localMute = false, bgmOn = false, urgent = false, fever = false, bgmTimer = 0, duckGain = null;

  const ac = () => {
    if (ctx || !AudioCtx || sfxOff) return ctx;
    try {
      ctx = new AudioCtx();
      // master → limiter(comp) → dest
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -10; lim.knee.value = 12; lim.ratio.value = 8; lim.attack.value = 0.002; lim.release.value = 0.12;
      master = ctx.createGain(); master.gain.value = 0.95;
      master.connect(lim); lim.connect(ctx.destination);

      duckGain = ctx.createGain(); duckGain.gain.value = 1;
      bgmBus = ctx.createGain(); bgmBus.gain.value = 0.55;
      bgmBus.connect(duckGain); duckGain.connect(master);

      sfxBus = ctx.createGain(); sfxBus.gain.value = 1;
      // short slapback delay for sparkle tail
      const delay = ctx.createDelay(0.3); delay.delayTime.value = 0.055;
      const fb = ctx.createGain(); fb.gain.value = 0.18;
      const dWet = ctx.createGain(); dWet.gain.value = 0.22;
      sfxBus.connect(master);
      sfxBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(dWet); dWet.connect(master);

      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
    return ctx;
  };
  const unlock = () => { const c = ac(); if (c && c.state !== 'running') try { c.resume()?.catch?.(() => {}); } catch { /* */ } };
  if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  const lvl = () => (localMute ? 0 : loudness(getLevel()));

  function duck(amount = 0.35, ms = 90) {
    if (!duckGain || !ctx) return;
    const t = ctx.currentTime;
    try {
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setValueAtTime(duckGain.gain.value, t);
      duckGain.gain.linearRampToValueAtTime(Math.max(0.15, 1 - amount), t + 0.02);
      duckGain.gain.linearRampToValueAtTime(1, t + ms / 1000);
    } catch { /* */ }
  }

  function tone(freq, dur, {
    type = 'sine', gain = 0.2, attack = 0.004, release = null, slide = 0, delay = 0, filter = 0, q = 1,
    dest = null, detune = 0,
  } = {}) {
    const c = ac(); if (!c) return; const g0 = lvl(); if (g0 <= 0) return;
    try {
      const t0 = c.currentTime + delay + 0.003;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.detune.value = detune;
      o.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
      const rel = release ?? Math.max(0.02, dur * 0.45);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * g0), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur));
      let node = o;
      if (filter) {
        const f = c.createBiquadFilter(); f.type = filter > 0 ? 'lowpass' : 'highpass';
        f.frequency.value = Math.abs(filter); f.Q.value = q; o.connect(f); node = f;
      }
      node.connect(g); g.connect(dest || sfxBus);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch { /* */ }
  }

  function noise(dur, { gain = 0.15, type = 'bandpass', freq = 2000, q = 1, delay = 0, sweep = 0, attack = 0.002 } = {}) {
    const c = ac(); if (!c || !noiseBuf) return; const g0 = lvl(); if (g0 <= 0) return;
    try {
      const t0 = c.currentTime + delay + 0.003;
      const s = c.createBufferSource(); s.buffer = noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
      if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * g0), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(sfxBus);
      s.start(t0, Math.random() * 0.4); s.stop(t0 + dur + 0.02);
    } catch { /* */ }
  }

  function stopBgm() {
    if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = 0; }
    bgmOn = false;
  }

  function startBgm() {
    const c = ac(); if (!c || bgmOn) return; if (lvl() <= 0) return;
    stopBgm();
    bgmOn = true;
    // bouncy marimba/chiptune: melody + bass + kick/hat
    const mel = [0, 4, 7, 4, 9, 7, 4, 2, 0, 2, 4, 7, 4, 0, -5, 0];
    const bass = [0, 0, 5, 5, -5, -5, 0, 7];
    const loop = () => {
      if (!bgmOn) return;
      const beat = fever ? 0.11 : urgent ? 0.13 : 0.18;
      const now = c.currentTime + 0.02;
      const g0 = lvl(); if (g0 <= 0) { bgmTimer = setTimeout(loop, 400); return; }
      try { bgmBus.gain.setTargetAtTime(0.5 * g0, c.currentTime, 0.05); } catch { /* */ }
      for (let i = 0; i < mel.length; i++) {
        const t = now + i * beat;
        // marimba-ish: sine + short triangle
        tone(semi(mel[i], 523.25), beat * 0.85, { type: 'sine', gain: 0.11, attack: 0.002, delay: t - c.currentTime, dest: bgmBus, filter: 4200 });
        tone(semi(mel[i], 523.25), beat * 0.5, { type: 'triangle', gain: 0.05, attack: 0.001, delay: t - c.currentTime, dest: bgmBus });
      }
      for (let i = 0; i < bass.length; i++) {
        const t = now + i * beat * 2;
        tone(semi(bass[i], 98), beat * 1.6, { type: 'triangle', gain: 0.14, attack: 0.01, delay: t - c.currentTime, dest: bgmBus, filter: 400 });
      }
      // drums
      for (let i = 0; i < 8; i++) {
        const t = now + i * beat * 2;
        // kick
        tone(120, 0.12, { type: 'sine', gain: 0.22, slide: 0.35, attack: 0.001, delay: t - c.currentTime, dest: bgmBus });
        // hat
        noise(0.04, { gain: 0.06, type: 'highpass', freq: 6000, q: 0.7, delay: t - c.currentTime + beat });
        if (fever) {
          tone(semi(12 + (i % 3), 880), 0.05, { type: 'sine', gain: 0.035, delay: t - c.currentTime + beat * 0.5, dest: bgmBus, filter: 6000 });
        }
      }
      bgmTimer = setTimeout(loop, mel.length * beat * 1000 - 30);
    };
    try { loop(); } catch (e) { console.warn('[arcade-sfx] bgm', e); bgmOn = false; }
  }

  return {
    setMuted(m) { localMute = !!m; if (localMute) stopBgm(); },
    get muted() { return localMute; },
    setUrgentBgm(on) { urgent = !!on; },
    setFever(on) { fever = !!on; },
    unlock,
    door() {
      tone(660, 0.12, { type: 'sine', gain: 0.1 });
      tone(990, 0.22, { type: 'triangle', gain: 0.08, delay: 0.08 });
      noise(0.08, { gain: 0.06, freq: 1800, type: 'bandpass' });
    },
    select() {
      tone(1046, 0.05, { type: 'sine', gain: 0.09, filter: 5000 });
      tone(1568, 0.04, { type: 'triangle', gain: 0.05, delay: 0.025 });
    },
    /** swap whoosh */
    swap() {
      noise(0.08, { gain: 0.1, type: 'bandpass', freq: 900, sweep: 2.5, q: 0.8 });
      tone(400, 0.09, { type: 'triangle', gain: 0.08, slide: 2.2, filter: 2400 });
    },
    /** invalid boing */
    deny() {
      tone(280, 0.1, { type: 'square', gain: 0.07, slide: 0.55, filter: 900 });
      tone(180, 0.14, { type: 'sine', gain: 0.08, delay: 0.05, slide: 0.7 });
    },
    /** layered pop — pitch rises one semitone per cascade step */
    match(combo = 1) {
      const step = Math.min(12, Math.max(1, combo | 0));
      const base = semi(step - 1, 523.25);
      duck(0.28 + step * 0.02, 70 + step * 8);
      // pitched pluck
      tone(base, 0.11, { type: 'triangle', gain: 0.18, attack: 0.001, filter: 5000 });
      tone(base * 2, 0.08, { type: 'sine', gain: 0.1, delay: 0.01 });
      // bubbly bloop
      tone(base * 0.75, 0.09, { type: 'sine', gain: 0.12, slide: 1.8, delay: 0.015 });
      // bright sparkle tail
      noise(0.07, { gain: 0.1, type: 'bandpass', freq: 3500 + step * 150, q: 2, sweep: 1.6 });
      tone(base * 3, 0.12, { type: 'sine', gain: 0.05, delay: 0.04, filter: 8000 });
    },
    cascade(n = 1) {
      for (let i = 0; i < Math.min(6, n); i++) {
        tone(semi(7 + i, 660), 0.06, { type: 'sine', gain: 0.07, delay: i * 0.032 });
      }
      if (n >= 3) this.stinger(n);
    },
    /** synth Great!/Excellent! jingles */
    stinger(n = 3) {
      const seq = n >= 5
        ? [[0, 0], [4, 0.07], [7, 0.14], [12, 0.22], [16, 0.3]]
        : n >= 3
          ? [[0, 0], [4, 0.08], [7, 0.16], [12, 0.24]]
          : [[0, 0], [7, 0.1]];
      for (const [s, d] of seq) tone(semi(s, 784), 0.14, { type: 'square', gain: 0.07, delay: d, filter: 2800 });
    },
    drop() {
      tone(220, 0.05, { type: 'triangle', gain: 0.06, slide: 0.7, filter: 800 });
      noise(0.03, { gain: 0.05, type: 'lowpass', freq: 600 });
    },
    land() {
      tone(180, 0.04, { type: 'sine', gain: 0.08, slide: 0.6 });
      noise(0.025, { gain: 0.04, type: 'lowpass', freq: 900 });
    },
    special() {
      // charge-up
      tone(200, 0.22, { type: 'sawtooth', gain: 0.08, slide: 4, filter: 2200, q: 2 });
      noise(0.2, { gain: 0.12, type: 'bandpass', freq: 1200, sweep: 3, q: 1 });
      tone(880, 0.15, { type: 'sine', gain: 0.1, delay: 0.18 });
    },
    lineBlast() {
      noise(0.18, { gain: 0.16, type: 'bandpass', freq: 800, sweep: 6, q: 0.6 });
      tone(600, 0.16, { type: 'sawtooth', gain: 0.09, slide: 3.5, filter: 3500 });
      tone(1200, 0.1, { type: 'square', gain: 0.05, delay: 0.05, filter: 4000 });
    },
    bomb() {
      duck(0.5, 140);
      tone(90, 0.28, { type: 'sine', gain: 0.28, slide: 0.35, attack: 0.001 });
      tone(55, 0.35, { type: 'triangle', gain: 0.18, delay: 0.02 });
      noise(0.22, { gain: 0.2, type: 'lowpass', freq: 500, sweep: 0.4 });
      noise(0.1, { gain: 0.1, type: 'highpass', freq: 3000, delay: 0.04 });
    },
    colorClear() {
      // magical glissando
      for (let i = 0; i < 10; i++) {
        tone(semi(i, 392), 0.12, { type: 'sine', gain: 0.06, delay: i * 0.035, filter: 5000 });
      }
      noise(0.25, { gain: 0.1, type: 'bandpass', freq: 2000, sweep: 2.5, q: 0.8 });
    },
    countdown(n) {
      const f = n === 1 ? 1046 : n === 2 ? 880 : 784;
      tone(f, 0.12, { type: 'square', gain: 0.12, filter: 3000 });
      noise(0.04, { gain: 0.06, freq: 2500, type: 'bandpass' });
    },
    startWhistle() {
      // Go! fanfare
      tone(784, 0.12, { type: 'square', gain: 0.12, filter: 3200 });
      tone(988, 0.12, { type: 'square', gain: 0.11, delay: 0.1, filter: 3200 });
      tone(1318, 0.22, { type: 'square', gain: 0.13, delay: 0.2, filter: 3600 });
      tone(1568, 0.18, { type: 'sine', gain: 0.08, delay: 0.28 });
      noise(0.08, { gain: 0.08, freq: 4000, delay: 0.2, type: 'bandpass' });
    },
    urgent() {
      tone(1400, 0.035, { type: 'square', gain: 0.055, filter: 4000 });
      // soft tick
      noise(0.02, { gain: 0.04, type: 'highpass', freq: 5000 });
    },
    timeUp() {
      tone(880, 0.15, { type: 'sine', gain: 0.12, slide: 1.4 });
      tone(660, 0.35, { type: 'square', gain: 0.1, delay: 0.12, slide: 0.45, filter: 1800 });
      tone(330, 0.4, { type: 'triangle', gain: 0.1, delay: 0.28 });
    },
    starDing() {
      tone(1568, 0.1, { type: 'sine', gain: 0.12 });
      tone(2349, 0.14, { type: 'triangle', gain: 0.08, delay: 0.04 });
      noise(0.05, { gain: 0.06, freq: 5000, type: 'bandpass' });
    },
    scoreTick() {
      tone(1200, 0.03, { type: 'sine', gain: 0.05, filter: 4000 });
    },
    fanfare(big = false) {
      const seq = [[0, 0], [4, 0.08], [7, 0.16], [12, 0.26], [16, 0.36]];
      for (const [s, d] of seq) tone(semi(s, 523), 0.22, { type: 'square', gain: 0.09, delay: d, filter: 2600 });
      if (big) for (let i = 0; i < 8; i++) tone(semi(12 + (i % 4), 784), 0.08, { type: 'sine', gain: 0.05, delay: 0.45 + i * 0.04 });
    },
    levelUp() {
      duck(0.55, 220);
      const seq = [[0, 0], [4, 0.07], [7, 0.14], [12, 0.22], [16, 0.32], [19, 0.42]];
      for (const [s, d] of seq) tone(semi(s, 523.25), 0.2, { type: 'square', gain: 0.11, delay: d, filter: 3200 });
      for (let i = 0; i < 10; i++) tone(semi(12 + i, 660), 0.08, { type: 'sine', gain: 0.05, delay: 0.35 + i * 0.03 });
      noise(0.25, { gain: 0.12, type: 'bandpass', freq: 1800, sweep: 2.5, q: 0.8 });
      this.timeRefill();
    },
    timeRefill() {
      tone(400, 0.25, { type: 'sine', gain: 0.1, slide: 2.5, filter: 3000 });
      tone(600, 0.2, { type: 'triangle', gain: 0.08, delay: 0.08, slide: 1.8 });
      noise(0.12, { gain: 0.07, type: 'bandpass', freq: 2400, sweep: 1.5 });
    },
    heartbeat() {
      tone(90, 0.08, { type: 'sine', gain: 0.14, slide: 0.55, attack: 0.001 });
      tone(70, 0.1, { type: 'triangle', gain: 0.08, delay: 0.12, slide: 0.6 });
    },
    startBgm, stopBgm,
  };
}
