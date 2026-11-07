// [titles] 획득 팡파르. 오실레이터·잡음으로 직접 만든 짧은 곡이라 샘플을 쓰지 않는다.
//   음량·음소거는 BGM 미니 플레이어(window.__jj.bgm) 와 ?rideSfx=0 을 따른다.

const STEPS = {
  bronze: [523.25, 659.25, 783.99],
  silver: [523.25, 659.25, 783.99, 1046.5],
  gold: [523.25, 659.25, 783.99, 1046.5, 1318.5],
  event: [493.88, 659.25, 880, 1174.7],
  legendary: [392, 493.88, 587.33, 783.99, 987.77, 1174.7, 1568],
};

/** 등급별 음표. 테스트가 길이·순서를 고정한다. */
export function fanfareNotes(grade = 'gold') {
  const freqs = STEPS[grade] || STEPS.gold;
  const notes = freqs.map((f, i) => ({
    f, t: i * 0.11, dur: 0.55, type: i % 2 ? 'triangle' : 'sine', gain: grade === 'legendary' ? 0.16 : 0.14,
  }));
  const pad = grade === 'legendary' ? 196 : grade === 'bronze' ? 220 : 261.63;
  const padDur = grade === 'legendary' ? 2.8 : grade === 'gold' || grade === 'event' ? 2.3 : 1.7;
  notes.push({ f: pad, t: 0, dur: padDur, type: 'sine', gain: 0.07, pad: true });
  return notes;
}

function defaultLevel() {
  try {
    const p = window.__jj?.bgm?.player;
    return p ? { muted: !!p.muted, volume: Number(p.volume) } : { muted: false, volume: 1 };
  } catch {
    return { muted: false, volume: 1 };
  }
}

export function createTitleSound({
  getLevel = defaultLevel,
  sfxOff = false,
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
  duck = (on) => { try { window.__jj?.bgm?.setDuck?.(!!on); } catch { /* 없음 */ } },
} = {}) {
  let ctx = null;
  const ac = () => {
    if (ctx || !AudioCtx || sfxOff) return ctx;
    try { ctx = new AudioCtx(); } catch { ctx = null; }
    return ctx;
  };
  function unlock() {
    const c = ac();
    if (c && c.state !== 'running') { try { c.resume()?.catch?.(() => {}); } catch { /* noop */ } }
  }
  if (!sfxOff && typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  function masterGain() {
    const lv = getLevel() || { muted: false, volume: 1 };
    if (sfxOff || lv.muted) return 0;
    const v = Number.isFinite(lv.volume) ? Math.min(1, Math.max(0, lv.volume)) : 1;
    return 0.45 + 0.55 * v;
  }
  function noise(c, t0, dur, gain, freq) {
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  function tone(c, note, t0, mul) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = note.type;
    o.frequency.value = note.f;
    const start = t0 + note.t;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, note.gain * mul), start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
    o.connect(g); g.connect(c.destination);
    o.start(start); o.stop(start + note.dur + 0.02);
  }
  function playAcquire(grade = 'gold') {
    const mul = masterGain();
    if (mul <= 0) return false;
    const c = ac();
    if (!c) return false;
    try { if (c.state !== 'running') c.resume()?.catch?.(() => {}); } catch { /* noop */ }
    const t0 = c.currentTime + 0.02;
    for (const note of fanfareNotes(grade)) tone(c, note, t0, mul);
    noise(c, t0, grade === 'legendary' ? 1.8 : 1.15, 0.05 * mul, grade === 'legendary' ? 2800 : 2200);
    noise(c, t0 + 0.35, 0.4, 0.04 * mul, 5400);
    duck(true);
    const hold = (fanfareNotes(grade).find((n) => n.pad)?.dur || 1.8) * 1000 + 200;
    setTimeout(() => duck(false), hold);
    return true;
  }
  function playClick() {
    const mul = masterGain();
    if (mul <= 0) return false;
    const c = ac();
    if (!c) return false;
    tone(c, { f: 880, t: 0, dur: 0.12, type: 'sine', gain: 0.08 }, c.currentTime + 0.01, mul);
    return true;
  }
  return { playAcquire, playClick, unlock };
}
