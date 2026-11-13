// 보스 BGM · 스킬 효과음 · 레벨업 스팅의 자리.
// 에셋이 없으면 WebAudio 로 짧은 자리를 채운다. 나중에 같은 이름으로 파일을 갈아끼우면 된다.
// playBgm('boss'|'peace'|'none'), playSfx(name), playSting('levelup').

const NOTES = {
  C2: 65.41, G2: 98.0, D3: 146.83, F3: 174.61, G3: 196.0, A3: 220.0, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440,
};

export function createRaidAudio() {
  let ctx = null;
  let master = null;
  let music = null;
  let muted = false;
  let mode = 'none';
  let nextBeat = 0;
  let step = 0;
  const bossScale = [NOTES.C2, NOTES.G2, NOTES.D3, NOTES.G2, NOTES.F3, NOTES.C2, NOTES.A3, NOTES.G2];

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    music = ctx.createGain();
    music.gain.value = 0.0;
    music.connect(master);
    return ctx;
  }

  function envGain(t, a, d, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }

  function tone(freq, t, dur, type, peak, dest, filterFreq) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = envGain(t, 0.02, dur, peak);
    if (filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      o.connect(f);
      f.connect(g);
    } else o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(t, dur, peak, dest, freq) {
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 900;
    f.Q.value = 0.7;
    const g = envGain(t, 0.005, dur, peak);
    src.connect(f);
    f.connect(g);
    g.connect(dest || master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function scheduleBoss(t) {
    const bass = bossScale[step % bossScale.length];
    tone(bass, t, 0.42, 'triangle', 0.11, music, 420);
    tone(bass * 2, t, 0.18, 'sine', 0.04, music, 900);
    if (step % 2 === 0) noise(t, 0.05, 0.03, music, 1800);
    if (step % 4 === 0) tone(NOTES.G3, t, 0.3, 'sine', 0.035, music, 1400);
    step += 1;
  }

  function schedulePeace(t) {
    const seq = [NOTES.C4, NOTES.E4, NOTES.G4, NOTES.A4];
    tone(seq[step % seq.length], t, 0.7, 'sine', 0.04, music, 1600);
    if (step % 4 === 0) tone(NOTES.C2, t, 0.8, 'triangle', 0.05, music, 300);
    step += 1;
  }

  return {
    get muted() { return muted; },
    unlock() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') ac.resume();
    },
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.7;
    },
    playBgm(next) {
      ensure();
      if (!ctx) return;
      mode = next;
      step = 0;
      const now = ctx.currentTime;
      nextBeat = now + 0.05;
      const target = next === 'none' ? 0 : next === 'peace' ? 0.55 : 0.9;
      music.gain.cancelScheduledValues(now);
      music.gain.setValueAtTime(music.gain.value, now);
      music.gain.linearRampToValueAtTime(target, now + (next === 'none' ? 0.4 : 1.2));
    },
    playSfx(name) {
      const ac = ensure();
      if (!ac || muted) return;
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime + 0.01;
      if (name === 'slash') {
        noise(t, 0.16, 0.2, master, 1400);
        tone(520, t, 0.12, 'sawtooth', 0.05, master, 1800);
      } else if (name === 'charge') {
        noise(t, 0.22, 0.22, master, 400);
        tone(180, t, 0.18, 'square', 0.06, master, 500);
      } else if (name === 'shout') {
        tone(220, t, 0.28, 'sawtooth', 0.07, master, 700);
        tone(330, t + 0.04, 0.22, 'triangle', 0.05, master, 900);
      } else if (name === 'spin') {
        noise(t, 0.28, 0.18, master, 1000);
        tone(640, t, 0.2, 'sawtooth', 0.05, master, 2000);
      } else if (name === 'dodge') {
        noise(t, 0.1, 0.12, master, 600);
      } else if (name === 'hit') {
        noise(t, 0.08, 0.16, master, 300);
        tone(140, t, 0.09, 'square', 0.05, master, 400);
      } else if (name === 'hurt') {
        tone(110, t, 0.16, 'sawtooth', 0.06, master, 280);
      } else if (name === 'wind') {
        noise(t, 0.55, 0.12, master, 500);
        tone(90, t, 0.4, 'triangle', 0.05, master, 240);
      } else if (name === 'slam') {
        noise(t, 0.2, 0.22, master, 180);
        tone(70, t, 0.25, 'sine', 0.08, master, 200);
      } else if (name === 'transform') {
        tone(440, t, 0.35, 'sine', 0.05, master, 2000);
        tone(660, t + 0.08, 0.4, 'triangle', 0.04, master, 2200);
      } else if (name === 'warn') {
        tone(494, t, 0.16, 'square', 0.08, master, 1200);
        tone(740, t + 0.1, 0.28, 'triangle', 0.07, master, 1800);
      } else if (name === 'ui') {
        tone(880, t, 0.08, 'sine', 0.04, master, 2400);
      } else if (name === 'ice') {
        tone(880, t, 0.16, 'sine', 0.06, master, 2800);
        noise(t, 0.12, 0.08, master, 2200);
      } else if (name === 'holy') {
        tone(660, t, 0.2, 'triangle', 0.06, master, 2000);
        tone(990, t + 0.05, 0.18, 'sine', 0.04, master, 2400);
      } else if (name === 'arrow') {
        noise(t, 0.08, 0.1, master, 1600);
        tone(740, t, 0.08, 'square', 0.03, master, 1800);
      } else if (name === 'dagger') {
        noise(t, 0.07, 0.14, master, 1800);
        tone(420, t, 0.06, 'sawtooth', 0.04, master, 1400);
      }
    },
    playSting(name) {
      const ac = ensure();
      if (!ac || muted || name !== 'levelup') return;
      const t = ac.currentTime + 0.02;
      tone(NOTES.C4, t, 0.18, 'triangle', 0.07, master, 2400);
      tone(NOTES.E4, t + 0.12, 0.18, 'triangle', 0.07, master, 2400);
      tone(NOTES.G4, t + 0.24, 0.28, 'triangle', 0.08, master, 2400);
      tone(NOTES.C4 * 2, t + 0.36, 0.4, 'sine', 0.06, master, 2800);
    },
    tick() {
      if (!ctx || mode === 'none') return;
      const horizon = ctx.currentTime + 0.25;
      const gap = mode === 'peace' ? 0.55 : 0.32;
      while (nextBeat < horizon) {
        if (mode === 'boss') scheduleBoss(nextBeat);
        else if (mode === 'peace') schedulePeace(nextBeat);
        nextBeat += gap;
      }
    },
  };
}
