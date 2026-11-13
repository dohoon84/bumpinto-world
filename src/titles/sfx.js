// [weekly-titles] 획득 연출 효과음 7종. 파일 없이 WebAudio 합성(sfx.md 레시피).
const DEFAULT_LEVEL = () => {
  try { const p = window.__jj?.bgm?.player; return p ? { muted: !!p.muted, volume: p.volume ?? 1 } : { muted: false, volume: 1 }; } catch { return { muted: false, volume: 1 }; }
};
function loudness(level) { if (!level || level.muted) return 0; const v = Math.min(1, Math.max(0, Number(level.volume) || 0)); return 0.5 + 0.5 * v * v; }
const HZ = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.50, D5: 587.33, Fs5: 739.99, A5: 880.00, A4: 440.00, Cs5: 554.37 };

export function createTitleSfx({
  getLevel = DEFAULT_LEVEL,
  sfxOff = (() => { try { return new URLSearchParams(location.search).get('rideSfx') === '0'; } catch { return false; } })(),
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
} = {}) {
  let ctx = null, master = null, sfxBus = null, noiseBuf = null, duckGain = null;
  let localMute = false;
  let myPlaying = 0, otherPlaying = 0;

  const ac = () => {
    if (ctx || !AudioCtx || sfxOff) return ctx;
    try {
      ctx = new AudioCtx();
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -10; lim.knee.value = 12; lim.ratio.value = 8; lim.attack.value = 0.002; lim.release.value = 0.12;
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(lim); lim.connect(ctx.destination);
      duckGain = ctx.createGain(); duckGain.gain.value = 1;
      duckGain.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1;
      const delay = ctx.createDelay(0.3); delay.delayTime.value = 0.05;
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

  function duckBgm() {
    try {
      const p = window.__jj?.bgm;
      if (p?.setDuck) { p.setDuck(true); setTimeout(() => { try { p.setDuck(false); } catch { /* */ } }, 150); }
    } catch { /* */ }
    if (!duckGain || !ctx) return;
    const t = ctx.currentTime;
    try {
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setValueAtTime(duckGain.gain.value, t);
      duckGain.gain.linearRampToValueAtTime(10 ** (-4 / 20), t + 0.02);
      duckGain.gain.linearRampToValueAtTime(1, t + 0.15);
    } catch { /* */ }
  }

  function tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.004, release = null, slideTo = 0, delay = 0, filter = 0, q = 1, dest = null, detune = 0, decay = null, sustain = 0 } = {}) {
    const c = ac(); if (!c) return; const g0 = lvl(); if (g0 <= 0) return;
    try {
      const t0 = c.currentTime + delay + 0.003;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.detune.value = detune;
      o.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * g0), t0 + attack);
      const hold = decay != null ? t0 + attack + decay : t0 + Math.max(attack + 0.01, dur * 0.4);
      if (sustain > 0 && decay != null) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * g0 * sustain), hold);
      const rel = release ?? Math.max(0.02, dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur, (decay || 0) + rel));
      let node = o;
      if (filter) {
        const f = c.createBiquadFilter(); f.type = filter > 0 ? 'lowpass' : 'highpass';
        f.frequency.value = Math.abs(filter); f.Q.value = q; o.connect(f); node = f;
      }
      node.connect(g); g.connect(dest || sfxBus);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch { /* */ }
  }

  function noise(dur, { gain = 0.15, type = 'bandpass', freq = 2000, q = 1, delay = 0, sweepTo = 0, attack = 0.002, dest = null } = {}) {
    const c = ac(); if (!c || !noiseBuf) return; const g0 = lvl(); if (g0 <= 0) return;
    try {
      const t0 = c.currentTime + delay + 0.003;
      const s = c.createBufferSource(); s.buffer = noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * g0), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(dest || sfxBus);
      s.start(t0, Math.random() * 0.4); s.stop(t0 + dur + 0.02);
    } catch { /* */ }
  }

  const peak = (db) => 0.22 * (10 ** (db / 20)); // 상대 피크. UI 보상음을 0 dB 로 본 값

  function playId(id, { playbackRate = 1, other = false } = {}) {
    if (sfxOff) return;
    ac();
    const gMul = other ? 10 ** (-12 / 20) : 1;
    if (id === 'title_merge_pop') {
      const f0 = 620 * (playbackRate || 1), f1 = 1050 * (playbackRate || 1);
      tone(f0, 0.09, { type: 'sine', gain: peak(-8) * gMul, attack: 0.002, slideTo: f1, release: 0.035 });
      tone(f0 * 2, 0.09, { type: 'triangle', gain: peak(-8) * gMul * 10 ** (-12 / 20), attack: 0.002, slideTo: f1 * 2, release: 0.035 });
      noise(0.005, { gain: peak(-8) * gMul * 10 ** (-18 / 20), type: 'highpass', freq: 4000, attack: 0.001 });
      return;
    }
    if (id === 'title_merge_whoosh') {
      noise(0.16, { gain: peak(-12) * gMul, type: 'bandpass', freq: 800, q: 1.2, sweepTo: 3000, attack: 0.06 });
      return;
    }
    if (id === 'title_merge_burst') {
      tone(180, 0.35, { type: 'sine', gain: peak(-4) * gMul, attack: 0.002, slideTo: 90, release: 0.06 });
      const notes = [1046.5, 1318.51, 1567.98]; // C6 E6 G6
      notes.forEach((f, i) => tone(f, 0.23, { type: 'triangle', gain: peak(-4) * gMul * 10 ** (-6 / 20), attack: 0.002, delay: i * 0.04, release: 0.08 }));
      return;
    }
    if (id === 'title_sign_on') {
      [0, 0.12, 0.24].forEach((d) => noise(0.008, { gain: peak(-10) * gMul, type: 'highpass', freq: 3000, attack: 0.001, delay: d }));
      tone(120, 0.30, { type: 'square', gain: peak(-10) * gMul * 0.7, attack: 0.04, release: 0.12, filter: 1200, q: 0.8 });
      tone(240, 0.30, { type: 'square', gain: peak(-10) * gMul * 0.35, attack: 0.04, release: 0.12, filter: 1200 });
      return;
    }
    const fanfares = {
      title_fanfare_gold: { notes: [HZ.C5, HZ.E5, HZ.G5, HZ.C6], gap: 0.11, sparkle: 4, lastR: 0.35, db: -2 },
      title_fanfare_silver: { notes: [HZ.D5, HZ.Fs5, HZ.A5], gap: 0.12, sparkle: 2, lastR: 0.35, db: -3 },
      title_fanfare_bronze: { notes: [HZ.A4, HZ.Cs5, HZ.E5], gap: 0.12, sparkle: 0, lastR: 0.25, db: -4, triangleLead: true },
    };
    const ff = fanfares[id];
    if (!ff) return;
    duckBgm();
    ff.notes.forEach((f, i) => {
      const last = i === ff.notes.length - 1;
      const dur = last ? 0.55 : 0.16;
      const lead = ff.triangleLead ? 'triangle' : 'square';
      tone(f, dur, { type: lead, gain: peak(ff.db) * gMul * (ff.triangleLead ? 1 : 0.7), attack: 0.004, delay: i * ff.gap, release: last ? ff.lastR : 0.04, filter: 5000 });
      tone(f / 2, dur, { type: 'triangle', gain: peak(ff.db) * gMul * 10 ** (-8 / 20), attack: 0.004, delay: i * ff.gap, release: last ? ff.lastR : 0.04 });
    });
    if (ff.sparkle) {
      const tStart = (ff.notes.length - 1) * ff.gap;
      for (let i = 0; i < ff.sparkle; i++) tone(2093, 0.05, { type: 'sine', gain: peak(ff.db) * gMul * 10 ** (-14 / 20), attack: 0.002, delay: tStart + i * 0.06, release: 0.04 });
    }
  }

  function canStart(other) {
    if (other) return otherPlaying < 1 && myPlaying <= 1;
    return myPlaying < 1;
  }

  return {
    unlock,
    mute(v) { localMute = !!v; },
    play(id, opts = {}) { playId(id, opts); },
    beginEarn({ other = false } = {}) {
      if (!canStart(other)) return false;
      if (other) otherPlaying += 1; else myPlaying += 1;
      return true;
    },
    endEarn({ other = false } = {}) {
      if (other) otherPlaying = Math.max(0, otherPlaying - 1);
      else myPlaying = Math.max(0, myPlaying - 1);
    },
    schedule(cues, { other = false, reduced = false, onStop } = {}) {
      if (!this.beginEarn({ other })) return { stop() {} };
      const timers = [];
      const list = reduced ? (cues || []).filter((c) => /fanfare/.test(c.id || c.file)).slice(0, 1).map((c) => ({ ...c, t: 0 })) : (cues || []);
      for (const c of list) {
        const delay = Math.max(0, Number(c.t) || 0);
        const tid = setTimeout(() => playId(c.file || c.id, { playbackRate: c.playbackRate || 1, other }), delay);
        timers.push(tid);
      }
      const endAt = list.reduce((m, c) => Math.max(m, (Number(c.t) || 0) + 1000), 0) + 200;
      const endTid = setTimeout(() => { this.endEarn({ other }); onStop?.(); }, endAt);
      timers.push(endTid);
      const self = this;
      return {
        stop() {
          for (const id of timers) clearTimeout(id);
          self.endEarn({ other });
        },
      };
    },
  };
}
