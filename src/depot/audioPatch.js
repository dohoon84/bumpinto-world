// [depot] 범창고 오리지널 합성 패치 — 파일 샘플 없음. Web Audio / OfflineAudioContext 로만 만듦.
//   BGM: 116 bpm, F장조, 일렉피아노·베이스·패드·가벼운 드럼의 창고형 마트 매장 음악.
//   SFX: PCM 버퍼로 구워 두었다가 재생(프레임마다 그래프를 새로 만들지 않음).
export const BGM_ID = 'aisle_sunshine';
export const BGM_TITLE = 'Aisle Sunshine';
export const BGM_BPM = 116;
export const BGM_BARS = 8; // 한 바퀴 길이(마디). A·B 두 프레이즈를 이어서 16마디 루프.

export const beatDur = (bpm = BGM_BPM) => 60 / bpm;
export const phraseDur = (bars = BGM_BARS, bpm = BGM_BPM) => bars * 4 * beatDur(bpm);

const F_MAJ = { F: 174.61, A: 220.00, C: 261.63, D: 146.83, Bb: 116.54, E: 164.81, G: 196.00, C3: 130.81, F2: 87.31, F3: 174.61, A3: 220, C4: 261.63, D3: 146.83, F4: 349.23, A4: 440, C5: 523.25, D4: 293.66, E4: 329.63, G4: 392, Bb3: 233.08, C3n: 130.81, G3: 196, E3: 164.81 };

function tone(ctx, dest, { t, freq, dur, type = 'sine', gain = 0.1, attack = 0.01, release = 0.08, slide = 0, detune = 0, filter = 0, q = 1 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.detune.value = detune || 0;
  o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + Math.max(0.003, attack));
  const relAt = t + Math.max(attack + 0.01, dur - release);
  g.gain.setValueAtTime(Math.max(0.0001, gain * 0.85), relAt);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter > 0 ? 'lowpass' : 'highpass';
    f.frequency.value = Math.abs(filter);
    f.Q.value = q;
    o.connect(f); node = f;
  }
  node.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(ctx, dest, noiseBuf, { t, dur, gain = 0.1, type = 'bandpass', freq = 2000, q = 1, sweep = 0, attack = 0.004 }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  const off = (t * 12.9898) % 0.8;
  s.start(t, off); s.stop(t + dur + 0.02);
}

function makeNoiseBuf(ctx, sec = 1.5) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** 일렉피아노: 사인 + 살짝 거친 모듈레이션, 짧은 타격 */
function ePiano(ctx, dest, { t, freq, dur, gain = 0.09 }) {
  tone(ctx, dest, { t, freq, dur, type: 'sine', gain, attack: 0.004, release: dur * 0.45, filter: 4200, q: 0.7 });
  tone(ctx, dest, { t, freq: freq * 2.005, dur: dur * 0.55, type: 'sine', gain: gain * 0.28, attack: 0.003, release: dur * 0.4, filter: 5000 });
  tone(ctx, dest, { t, freq, dur: dur * 0.2, type: 'triangle', gain: gain * 0.18, attack: 0.001, release: 0.08 });
}

function bassNote(ctx, dest, { t, freq, dur, gain = 0.16 }) {
  tone(ctx, dest, { t, freq, dur, type: 'triangle', gain, attack: 0.012, release: 0.08, filter: 420, q: 0.8 });
  tone(ctx, dest, { t, freq, dur: dur * 0.9, type: 'sine', gain: gain * 0.55, attack: 0.01, release: 0.1 });
}

function padChord(ctx, dest, freqs, { t, dur, gain = 0.03 }) {
  for (const f of freqs) {
    tone(ctx, dest, { t, freq: f, dur, type: 'sine', gain, attack: 0.25, release: 0.4, detune: -4 });
    tone(ctx, dest, { t, freq: f, dur, type: 'sine', gain: gain * 0.8, attack: 0.3, release: 0.4, detune: 5 });
  }
}

function kick(ctx, dest, { t, gain = 0.22 }) {
  tone(ctx, dest, { t, freq: 130, dur: 0.16, type: 'sine', gain, attack: 0.002, release: 0.12, slide: 0.32 });
}
function snare(ctx, dest, noiseBuf, { t, gain = 0.1 }) {
  noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.09, gain, type: 'bandpass', freq: 1800, q: 0.9, sweep: 0.7 });
  tone(ctx, dest, { t, freq: 220, dur: 0.07, type: 'triangle', gain: gain * 0.35, attack: 0.001, release: 0.05, slide: 0.6 });
}
function hat(ctx, dest, noiseBuf, { t, gain = 0.045, open = false }) {
  noiseBurst(ctx, dest, noiseBuf, { t, dur: open ? 0.1 : 0.035, gain, type: 'highpass', freq: 7000, q: 0.7 });
}
function shaker(ctx, dest, noiseBuf, { t, gain = 0.03 }) {
  noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.04, gain, type: 'bandpass', freq: 8000, q: 1.2, sweep: 1.15 });
}

// 8마디 코드: F | F | Dm | Dm | Bb | Bb | C | C  (마지막은 턴어라운드)
const CHORDS = [
  [F_MAJ.F3, F_MAJ.A3, F_MAJ.C4],
  [F_MAJ.F3, F_MAJ.A3, F_MAJ.C4],
  [F_MAJ.D3, F_MAJ.F3, F_MAJ.A3],
  [F_MAJ.D3, F_MAJ.F3, F_MAJ.A3],
  [F_MAJ.Bb, F_MAJ.D3, F_MAJ.F3],
  [F_MAJ.Bb, F_MAJ.D3, F_MAJ.F3],
  [F_MAJ.C3n, F_MAJ.E3, F_MAJ.G3],
  [F_MAJ.C3n, F_MAJ.E3, F_MAJ.G4 / 2],
];
const BASS = [F_MAJ.F2, F_MAJ.F2, F_MAJ.D3 / 2, F_MAJ.D3 / 2, F_MAJ.Bb / 2, F_MAJ.Bb / 2, F_MAJ.C3n, F_MAJ.C3n];

// 멜로디(16분음표 단위, 쉼은 0). 경쾌한 마트 매장 멜로디 두 프레이즈.
const MEL_A = [
  // bar1 F
  F_MAJ.A4, 0, F_MAJ.C5, F_MAJ.A4, F_MAJ.F4, 0, F_MAJ.A4, 0, F_MAJ.C5, 0, F_MAJ.D4 * 2, F_MAJ.C5, F_MAJ.A4, 0, 0, 0,
  // bar2 F
  F_MAJ.F4, 0, F_MAJ.A4, F_MAJ.C5, 0, F_MAJ.A4, F_MAJ.G4, 0, F_MAJ.F4, 0, F_MAJ.A4, 0, F_MAJ.C5, F_MAJ.A4, F_MAJ.F4, 0,
  // bar3 Dm
  F_MAJ.A4, 0, 0, F_MAJ.F4, F_MAJ.D4 * 2, 0, F_MAJ.F4, 0, F_MAJ.A4, F_MAJ.G4, F_MAJ.F4, 0, F_MAJ.D4 * 2, 0, 0, 0,
  // bar4 Dm
  F_MAJ.F4, 0, F_MAJ.A4, 0, F_MAJ.C5, F_MAJ.A4, F_MAJ.G4, 0, F_MAJ.F4, 0, 0, F_MAJ.E4, F_MAJ.F4, 0, F_MAJ.A4, 0,
  // bar5 Bb
  F_MAJ.Bb3 * 2, 0, F_MAJ.D4 * 2, F_MAJ.F4, 0, F_MAJ.D4 * 2, F_MAJ.F4, 0, F_MAJ.A4, 0, F_MAJ.F4, 0, F_MAJ.D4 * 2, 0, 0, 0,
  // bar6 Bb
  F_MAJ.F4, 0, F_MAJ.G4, F_MAJ.A4, 0, F_MAJ.F4, F_MAJ.D4 * 2, 0, F_MAJ.Bb3 * 2, 0, F_MAJ.D4 * 2, 0, F_MAJ.F4, F_MAJ.G4, F_MAJ.A4, 0,
  // bar7 C
  F_MAJ.G4, 0, F_MAJ.E4, F_MAJ.G4, F_MAJ.C5, 0, F_MAJ.A4, 0, F_MAJ.G4, 0, F_MAJ.E4, 0, F_MAJ.C5, F_MAJ.A4, F_MAJ.G4, 0,
  // bar8 C turnaround
  F_MAJ.G4, 0, F_MAJ.A4, F_MAJ.Bb3 * 2, F_MAJ.C5, 0, F_MAJ.A4, 0, F_MAJ.G4, 0, F_MAJ.E4, F_MAJ.F4, F_MAJ.G4, 0, 0, 0,
];
// B 프레이즈: 같은 화성, 멜로디를 한 옥타브 위로 답하며 살짝 변주
const MEL_B = MEL_A.map((f, i) => {
  if (!f) return 0;
  if ((i % 16) >= 12 && (i % 2) === 0) return f * (i % 32 < 16 ? 1 : 2 / 1); // keep most
  const lift = (i % 32) >= 16 && (i % 4) === 0 ? 2 : 1;
  return f * (lift === 2 && f < 600 ? 1 : 1);
});
// 실제 B: 끝 두 마디를 더 밝게
for (let i = 6 * 16; i < 8 * 16; i++) {
  if (MEL_A[i]) MEL_B[i] = MEL_A[i] * (i % 2 === 0 ? 1 : 1);
}
MEL_B[6 * 16 + 4] = F_MAJ.C5 * 1;
MEL_B[7 * 16 + 4] = F_MAJ.C5;
MEL_B[7 * 16 + 12] = F_MAJ.A4;
MEL_B[7 * 16 + 14] = F_MAJ.C5;

/**
 * 매장 BGM 을 dest 에 예약한다. 라이브·OfflineAudioContext 모두 사용.
 * phrase: 0 = A, 1 = B. bars 기본 8.
 */
export function scheduleDepotBgm(ctx, dest, { t0 = 0, bars = BGM_BARS, bpm = BGM_BPM, gain = 0.28, phrase = 0 } = {}) {
  const noiseBuf = makeNoiseBuf(ctx, 1.6);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.2; comp.attack.value = 0.01; comp.release.value = 0.18;
  const master = ctx.createGain(); master.gain.value = gain;
  const dry = ctx.createGain(); dry.gain.value = 0.92;
  // 아주 짧은 슬랩백 — 창고 천장 느낌
  const delay = ctx.createDelay(0.3); delay.delayTime.value = 0.085;
  const dw = ctx.createGain(); dw.gain.value = 0.16;
  master.connect(dry); dry.connect(comp);
  master.connect(delay); delay.connect(dw); dw.connect(comp);
  comp.connect(dest);

  const piano = ctx.createGain(); piano.gain.value = 1; piano.connect(master);
  const bassG = ctx.createGain(); bassG.gain.value = 1; bassG.connect(master);
  const padG = ctx.createGain(); padG.gain.value = 1; padG.connect(master);
  const drumG = ctx.createGain(); drumG.gain.value = 1; drumG.connect(master);

  const beat = beatDur(bpm);
  const sixteenth = beat / 4;
  const mel = phrase % 2 === 0 ? MEL_A : MEL_B;
  const nBars = Math.min(bars, 8);

  for (let b = 0; b < nBars; b++) {
    const tBar = t0 + b * 4 * beat;
    padChord(ctx, padG, CHORDS[b], { t: tBar, dur: 4 * beat - 0.05, gain: 0.028 });
    // 베이스: 각 박 뿌리, 2·4박은 5도
    const root = BASS[b];
    for (let q = 0; q < 4; q++) {
      const f = (q === 1 || q === 3) ? root * 1.5 : root;
      bassNote(ctx, bassG, { t: tBar + q * beat, freq: f, dur: beat * 0.88, gain: 0.15 });
    }
    // 멜로디 16분
    for (let i = 0; i < 16; i++) {
      const f = mel[b * 16 + i];
      if (!f) continue;
      const stacc = i % 4 === 3 ? 0.55 : 0.85;
      ePiano(ctx, piano, { t: tBar + i * sixteenth, freq: f, dur: sixteenth * stacc, gain: 0.09 });
    }
    // 드럼
    kick(ctx, drumG, { t: tBar, gain: 0.2 });
    kick(ctx, drumG, { t: tBar + 2 * beat, gain: 0.18 });
    if (b % 2 === 1) kick(ctx, drumG, { t: tBar + 3.5 * beat, gain: 0.1 }); // 살짝 싱코
    snare(ctx, drumG, noiseBuf, { t: tBar + beat, gain: 0.085 });
    snare(ctx, drumG, noiseBuf, { t: tBar + 3 * beat, gain: 0.09 });
    for (let i = 0; i < 8; i++) {
      hat(ctx, drumG, noiseBuf, { t: tBar + i * (beat / 2), gain: i % 2 ? 0.03 : 0.042, open: i === 7 && b % 2 === 1 });
    }
    for (let i = 0; i < 16; i++) {
      if (i % 2 === 1) shaker(ctx, drumG, noiseBuf, { t: tBar + i * sixteenth, gain: 0.022 });
    }
  }
  return { duration: nBars * 4 * beat, t0 };
}

/** OfflineAudioContext 로 8마디 프레이즈를 구워 AudioBuffer 로 반환 */
export async function bakeBgmPhrase(Offline, sampleRate, phrase = 0, bars = BGM_BARS) {
  const dur = phraseDur(bars) + 0.15;
  const off = new Offline(2, Math.ceil(dur * sampleRate), sampleRate);
  scheduleDepotBgm(off, off.destination, { t0: 0.02, bars, phrase, gain: 0.3 });
  return off.startRendering();
}

// ---------------- SFX: 순수 PCM 합성 (AudioBuffer) ----------------
function buf1(ctx, dur) {
  const n = Math.max(1, Math.ceil(dur * (ctx.sampleRate || 44100)));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate || 44100);
  return { buf, d: buf.getChannelData(0), sr: buf.sampleRate, n };
}
const rnd = (i) => {
  // 결정적 해시 노이즈(프리뷰 재현용). 라이브에서도 충분히 거칠다.
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const irnd = (i) => rnd(i) * 2 - 1;

function envADSR(t, dur, a, dec, s, r) {
  if (t <= 0) return 0;
  if (t < a) return t / a;
  if (t < a + dec) return 1 - (1 - s) * ((t - a) / dec);
  const relStart = Math.max(a + dec, dur - r);
  if (t < relStart) return s;
  if (t >= dur) return 0;
  return s * (1 - (t - relStart) / Math.max(1e-4, dur - relStart));
}

function mixTone(d, sr, { t0 = 0, freq, dur, gain = 0.2, type = 'sine', slide = 1, attack = 0.005, release = 0.05 }) {
  const n0 = Math.floor(t0 * sr);
  const n = Math.min(d.length, n0 + Math.ceil(dur * sr));
  const tau = 2 * Math.PI;
  for (let i = n0; i < n; i++) {
    const t = (i - n0) / sr;
    const p = t / dur;
    const f = freq * Math.pow(slide, p);
    const ph = tau * freq * (slide === 1 ? t : dur * (Math.pow(slide, p) - 1) / Math.log(slide) / (slide === 1 ? 1 : 1));
    // safer phase for slide
    let osc;
    const phase = (slide === 1)
      ? tau * freq * t
      : tau * freq * dur * (Math.pow(slide, p) - 1) / Math.log(Math.max(slide, 1e-6));
    const x = phase;
    if (type === 'square') osc = Math.sin(x) > 0 ? 1 : -1;
    else if (type === 'triangle') { const u = x / tau - Math.floor(x / tau + 0.25); osc = 4 * Math.abs(u - 0.5) - 1; }
    else if (type === 'saw') { const u = x / tau - Math.floor(x / tau); osc = 2 * u - 1; }
    else osc = Math.sin(x);
    void ph;
    d[i] += osc * gain * envADSR(t, dur, attack, 0.03, 0.75, release);
  }
}

function mixNoise(d, sr, { t0 = 0, dur, gain = 0.15, hp = 0, lp = 0, attack = 0.003, release = 0.04, seed = 1 }) {
  const n0 = Math.floor(t0 * sr);
  const n = Math.min(d.length, n0 + Math.ceil(dur * sr));
  let lpV = 0, hpV = 0, prev = 0;
  const lpa = lp ? Math.exp(-2 * Math.PI * lp / sr) : 0;
  const hpa = hp ? Math.exp(-2 * Math.PI * hp / sr) : 0;
  for (let i = n0; i < n; i++) {
    const t = (i - n0) / sr;
    let x = irnd(i * 13 + seed * 97);
    if (lp) { lpV = lpa * lpV + (1 - lpa) * x; x = lpV; }
    if (hp) { hpV = hpa * hpV + (1 - hpa) * x; x = x - hpV; }
    void prev;
    d[i] += x * gain * envADSR(t, dur, attack, 0.02, 0.7, release);
  }
}

function softClip(d, amt = 0.95) {
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    d[i] = amt * (x < 0 ? -1 : 1) * (1 - Math.exp(-Math.abs(x)));
  }
}

export const SFX_BAKE = {
  'cart-grab': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.28);
    mixNoise(d, sr, { dur: 0.08, gain: 0.22, hp: 400, lp: 1800, seed: 2 });
    mixTone(d, sr, { freq: 310, dur: 0.12, type: 'triangle', gain: 0.16, slide: 1.55, attack: 0.003 });
    mixTone(d, sr, { t0: 0.05, freq: 180, dur: 0.14, type: 'sine', gain: 0.1 });
    softClip(d); return buf;
  },
  'cart-release': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.3);
    mixNoise(d, sr, { dur: 0.1, gain: 0.16, hp: 200, lp: 900, seed: 3 });
    mixTone(d, sr, { freq: 240, dur: 0.16, type: 'triangle', gain: 0.14, slide: 0.65 });
    softClip(d); return buf;
  },
  'cart-bump': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.35);
    mixTone(d, sr, { freq: 90, dur: 0.18, type: 'sine', gain: 0.45, slide: 0.45, attack: 0.002 });
    mixTone(d, sr, { freq: 55, dur: 0.22, type: 'sine', gain: 0.28, slide: 0.6 });
    mixNoise(d, sr, { dur: 0.12, gain: 0.28, lp: 900, seed: 4 });
    mixNoise(d, sr, { t0: 0.02, dur: 0.08, gain: 0.12, hp: 2000, lp: 5000, seed: 5 }); // 철망 rattly
    softClip(d); return buf;
  },
  'cart-joint': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.08);
    mixNoise(d, sr, { dur: 0.04, gain: 0.16, hp: 800, lp: 3500, seed: 6, attack: 0.001, release: 0.03 });
    mixTone(d, sr, { freq: 420, dur: 0.035, type: 'triangle', gain: 0.06, slide: 0.8, attack: 0.001 });
    softClip(d); return buf;
  },
  'cart-roll': (ctx) => {
    // 1.2초 루프: 우레탄 바퀴 + 철망  rattling
    const { buf, d, sr } = buf1(ctx, 1.2);
    let lp = 0, hp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let x = irnd(i * 3 + 11);
      // 갈색 노이즈에 가깝게
      lp = lp * 0.98 + x * 0.02;
      hp = hp * 0.6 + (x - lp) * 0.4;
      const wob = 0.7 + 0.3 * Math.sin(t * 18.5) + 0.15 * Math.sin(t * 47);
      const grit = (irnd(i * 9 + 3) > 0.92 ? irnd(i + 99) * 0.25 : 0);
      d[i] = (lp * 0.85 + hp * 0.2 + grit) * 0.55 * wob;
    }
    // 루프 경계 페이드
    const fade = Math.floor(0.03 * sr);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] *= k; d[d.length - 1 - i] *= k;
    }
    softClip(d, 0.9); return buf;
  },
  'pick-cardboard': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.22);
    mixNoise(d, sr, { dur: 0.08, gain: 0.2, hp: 400, lp: 2500, seed: 7 });
    mixTone(d, sr, { freq: 180, dur: 0.1, type: 'sine', gain: 0.14, slide: 0.75 });
    mixNoise(d, sr, { t0: 0.02, dur: 0.06, gain: 0.1, hp: 2500, lp: 6000, seed: 8 });
    softClip(d); return buf;
  },
  'pick-bottle': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.25);
    mixTone(d, sr, { freq: 980, dur: 0.09, type: 'sine', gain: 0.12, slide: 1.05, attack: 0.002 });
    mixTone(d, sr, { freq: 1480, dur: 0.07, type: 'sine', gain: 0.06, t0: 0.015 });
    mixNoise(d, sr, { dur: 0.07, gain: 0.12, hp: 1200, lp: 4000, seed: 9 });
    mixTone(d, sr, { t0: 0.04, freq: 220, dur: 0.1, type: 'triangle', gain: 0.08 });
    softClip(d); return buf;
  },
  'pick-sack': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.28);
    mixNoise(d, sr, { dur: 0.16, gain: 0.22, hp: 1800, lp: 8000, seed: 10, attack: 0.005, release: 0.1 });
    // 바스락 진폭 변조
    for (let i = 0; i < d.length; i++) d[i] *= 0.55 + 0.45 * Math.abs(Math.sin(i / sr * 90 + rnd(i) * 2));
    mixTone(d, sr, { freq: 140, dur: 0.12, type: 'sine', gain: 0.08, slide: 0.8 });
    softClip(d); return buf;
  },
  'pick-egg': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.22);
    mixNoise(d, sr, { dur: 0.07, gain: 0.12, hp: 800, lp: 3500, seed: 11 }); // 펄프 트레이
    mixTone(d, sr, { freq: 620, dur: 0.06, type: 'triangle', gain: 0.08, slide: 1.2 });
    mixTone(d, sr, { t0: 0.03, freq: 880, dur: 0.05, type: 'sine', gain: 0.05 });
    softClip(d); return buf;
  },
  'pick-melon': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.28);
    mixTone(d, sr, { freq: 140, dur: 0.18, type: 'sine', gain: 0.22, slide: 0.7 });
    mixTone(d, sr, { freq: 90, dur: 0.16, type: 'triangle', gain: 0.1 });
    mixNoise(d, sr, { dur: 0.06, gain: 0.08, lp: 800, seed: 12 });
    softClip(d); return buf;
  },
  'pick-tray': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.2);
    mixNoise(d, sr, { dur: 0.08, gain: 0.12, hp: 3000, lp: 9000, seed: 13 }); // 스티로폼
    mixTone(d, sr, { freq: 740, dur: 0.07, type: 'triangle', gain: 0.07, slide: 1.3 });
    mixTone(d, sr, { t0: 0.04, freq: 200, dur: 0.08, type: 'sine', gain: 0.08 });
    softClip(d); return buf;
  },
  'place-light': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.22);
    mixTone(d, sr, { freq: 220, dur: 0.1, type: 'sine', gain: 0.16, slide: 0.7, attack: 0.002 });
    mixNoise(d, sr, { dur: 0.07, gain: 0.1, lp: 1200, seed: 14 });
    softClip(d); return buf;
  },
  'place-mid': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.28);
    mixTone(d, sr, { freq: 130, dur: 0.14, type: 'sine', gain: 0.24, slide: 0.55 });
    mixTone(d, sr, { freq: 70, dur: 0.16, type: 'sine', gain: 0.12 });
    mixNoise(d, sr, { dur: 0.09, gain: 0.14, lp: 900, seed: 15 });
    softClip(d); return buf;
  },
  'place-heavy': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.4);
    mixTone(d, sr, { freq: 80, dur: 0.22, type: 'sine', gain: 0.35, slide: 0.45, attack: 0.003 });
    mixTone(d, sr, { freq: 42, dur: 0.28, type: 'sine', gain: 0.2 });
    mixNoise(d, sr, { dur: 0.14, gain: 0.2, lp: 700, seed: 16 });
    mixNoise(d, sr, { t0: 0.04, dur: 0.1, gain: 0.08, hp: 2000, lp: 5000, seed: 17 });
    softClip(d); return buf;
  },
  'item-fall': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.55);
    mixTone(d, sr, { freq: 110, dur: 0.22, type: 'sine', gain: 0.3, slide: 0.4 });
    mixNoise(d, sr, { dur: 0.2, gain: 0.22, lp: 1400, seed: 18 });
    for (let k = 0; k < 5; k++) {
      mixNoise(d, sr, { t0: 0.08 + k * 0.06, dur: 0.06, gain: 0.12 - k * 0.015, hp: 1500, lp: 5000, seed: 20 + k });
      mixTone(d, sr, { t0: 0.09 + k * 0.06, freq: 500 + k * 120, dur: 0.05, type: 'triangle', gain: 0.05 });
    }
    softClip(d); return buf;
  },
  'item-wobble': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.45);
    mixTone(d, sr, { freq: 280, dur: 0.4, type: 'sine', gain: 0.07, slide: 0.85, attack: 0.04, release: 0.15 });
    mixTone(d, sr, { freq: 190, dur: 0.35, type: 'triangle', gain: 0.05, slide: 1.08, attack: 0.05 });
    mixNoise(d, sr, { dur: 0.3, gain: 0.05, hp: 600, lp: 1800, seed: 30, attack: 0.05, release: 0.12 });
    softClip(d); return buf;
  },
  'egg-crack': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.28);
    mixNoise(d, sr, { dur: 0.07, gain: 0.32, hp: 2000, lp: 8000, seed: 31, attack: 0.001, release: 0.04 });
    mixTone(d, sr, { freq: 2100, dur: 0.04, type: 'sine', gain: 0.1, slide: 0.6, attack: 0.001 });
    mixNoise(d, sr, { t0: 0.03, dur: 0.1, gain: 0.12, hp: 1500, lp: 5000, seed: 32 }); // 껍질 조각
    softClip(d); return buf;
  },
  'egg-splat': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.4);
    mixNoise(d, sr, { dur: 0.18, gain: 0.28, lp: 900, seed: 33, attack: 0.004, release: 0.12 });
    mixTone(d, sr, { freq: 160, dur: 0.16, type: 'sine', gain: 0.16, slide: 0.5 });
    mixNoise(d, sr, { t0: 0.05, dur: 0.16, gain: 0.12, hp: 400, lp: 1600, seed: 34, release: 0.1 });
    softClip(d); return buf;
  },
  'achievement': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.9);
    const seq = [F_MAJ.F4, F_MAJ.A4, F_MAJ.C5, F_MAJ.F4 * 2];
    seq.forEach((f, i) => {
      mixTone(d, sr, { t0: 0.02 + i * 0.09, freq: f, dur: 0.28, type: 'triangle', gain: 0.16, attack: 0.005, release: 0.15 });
      mixTone(d, sr, { t0: 0.02 + i * 0.09, freq: f * 2, dur: 0.22, type: 'sine', gain: 0.06 });
    });
    mixTone(d, sr, { t0: 0.38, freq: F_MAJ.A4 * 2, dur: 0.45, type: 'sine', gain: 0.08, release: 0.25 });
    softClip(d, 0.85); return buf;
  },
  'pa-chime': (ctx) => {
    // 딩동댕 — G5, C6, E6
    const { buf, d, sr } = buf1(ctx, 1.15);
    const notes = [783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      mixTone(d, sr, { t0: 0.05 + i * 0.22, freq: f, dur: 0.7 - i * 0.08, type: 'sine', gain: 0.2, attack: 0.008, release: 0.4 });
      mixTone(d, sr, { t0: 0.05 + i * 0.22, freq: f * 2, dur: 0.35, type: 'sine', gain: 0.05, attack: 0.01, release: 0.2 });
    });
    softClip(d, 0.8); return buf;
  },
  'staff-blip': (ctx) => {
    // 한 음절 분량. 피치·길이는 재생 시 playbackRate 로 조절
    const { buf, d, sr } = buf1(ctx, 0.12);
    mixTone(d, sr, { freq: 280, dur: 0.09, type: 'sine', gain: 0.22, attack: 0.008, release: 0.04 });
    mixTone(d, sr, { freq: 560, dur: 0.07, type: 'triangle', gain: 0.06, attack: 0.01 });
    softClip(d, 0.8); return buf;
  },
  'checkout-scan': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.12);
    mixTone(d, sr, { freq: 2350, dur: 0.085, type: 'square', gain: 0.1, attack: 0.001, release: 0.02 });
    mixTone(d, sr, { freq: 2390, dur: 0.07, type: 'sine', gain: 0.05 });
    softClip(d); return buf;
  },
  'checkout-belt': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.8);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = 0.08 * Math.sin(2 * Math.PI * 42 * t) + 0.04 * Math.sin(2 * Math.PI * 84 * t);
    }
    mixNoise(d, sr, { dur: 0.8, gain: 0.06, hp: 400, lp: 1800, seed: 40, attack: 0.05, release: 0.1 });
    const fade = Math.floor(0.04 * sr);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; }
    softClip(d); return buf;
  },
  'checkout-printer': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.55);
    for (let k = 0; k < 8; k++) mixNoise(d, sr, { t0: k * 0.055, dur: 0.03, gain: 0.12, hp: 1000, lp: 4000, seed: 50 + k, attack: 0.001, release: 0.015 });
    softClip(d); return buf;
  },
  'checkout-pay': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.35);
    mixTone(d, sr, { freq: 880, dur: 0.1, type: 'sine', gain: 0.12, attack: 0.004 });
    mixTone(d, sr, { t0: 0.09, freq: 1320, dur: 0.18, type: 'sine', gain: 0.14, release: 0.1 });
    softClip(d, 0.8); return buf;
  },
  'checkout-done': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.85);
    mixNoise(d, sr, { dur: 0.1, gain: 0.1, hp: 4000, lp: 8000, seed: 60 });
    mixTone(d, sr, { t0: 0.03, freq: 1567, dur: 0.22, type: 'triangle', gain: 0.14 });
    mixTone(d, sr, { t0: 0.12, freq: 2093, dur: 0.45, type: 'sine', gain: 0.14, release: 0.25 });
    mixTone(d, sr, { t0: 0.12, freq: 3136, dur: 0.35, type: 'sine', gain: 0.06, release: 0.2 });
    softClip(d, 0.8); return buf;
  },
  'freezer-hum': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 2.0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const buzz = 0.12 * Math.sin(2 * Math.PI * 60 * t) + 0.05 * Math.sin(2 * Math.PI * 120 * t) + 0.02 * Math.sin(2 * Math.PI * 180 * t);
      const air = irnd(i + 70) * 0.03;
      d[i] = buzz + air;
    }
    const fade = Math.floor(0.08 * sr);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; }
    softClip(d, 0.7); return buf;
  },
  'freezer-door': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.7);
    mixNoise(d, sr, { dur: 0.18, gain: 0.18, hp: 200, lp: 900, seed: 70, attack: 0.02, release: 0.1 }); // 밀폐  Rubbersuck
    mixTone(d, sr, { freq: 140, dur: 0.2, type: 'sine', gain: 0.1, slide: 0.6, attack: 0.02 });
    mixTone(d, sr, { t0: 0.22, freq: 420, dur: 0.12, type: 'triangle', gain: 0.06, slide: 1.4 }); // 문 열림
    mixNoise(d, sr, { t0: 0.2, dur: 0.15, gain: 0.08, hp: 800, lp: 3000, seed: 71 });
    softClip(d); return buf;
  },
  'ambient-hvac': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 4.0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const x = irnd(i * 2 + 5);
      lp = lp * 0.995 + x * 0.005;
      const t = i / sr;
      const slow = 0.85 + 0.15 * Math.sin(t * 0.7);
      d[i] = lp * 0.7 * slow + 0.02 * Math.sin(2 * Math.PI * 50 * t);
    }
    const fade = Math.floor(0.15 * sr);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; }
    softClip(d, 0.6); return buf;
  },
  'ambient-crowd': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 4.0);
    // 먼 군중: 포먼트처럼 두 개의 대역을 지나가는 노이즈
    let a = 0, b = 0;
    for (let i = 0; i < d.length; i++) {
      const x = irnd(i * 5 + 17);
      const t = i / sr;
      const f1 = 400 + 80 * Math.sin(t * 1.3);
      const f2 = 1200 + 150 * Math.sin(t * 0.9 + 1);
      const ca = Math.exp(-2 * Math.PI * f1 / sr), cb = Math.exp(-2 * Math.PI * f2 / sr);
      a = ca * a + (1 - ca) * x;
      b = cb * b + (1 - cb) * x;
      d[i] = (a * 0.55 + (x - b) * 0.2) * (0.7 + 0.3 * Math.sin(t * 0.35)) * 0.35;
    }
    const fade = Math.floor(0.2 * sr);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; }
    softClip(d, 0.5); return buf;
  },
  'elec-tv': (ctx) => {
    // 짧은  peep 데모 루프 (TV 벽, 아주 작게 재생)
    const { buf, d, sr } = buf1(ctx, 2.0);
    const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 392, 523.25];
    notes.forEach((f, i) => {
      mixTone(d, sr, { t0: i * 0.22, freq: f, dur: 0.2, type: 'square', gain: 0.04, attack: 0.01, release: 0.05 });
      mixTone(d, sr, { t0: i * 0.22, freq: f / 2, dur: 0.2, type: 'triangle', gain: 0.03 });
    });
    const fade = Math.floor(0.05 * sr);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; }
    softClip(d, 0.6); return buf;
  },
  'elec-fridge-open': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.55);
    mixNoise(d, sr, { dur: 0.2, gain: 0.16, hp: 150, lp: 700, seed: 80, attack: 0.03, release: 0.1 });
    mixTone(d, sr, { freq: 120, dur: 0.18, type: 'sine', gain: 0.1, slide: 0.55, attack: 0.02 });
    mixTone(d, sr, { t0: 0.18, freq: 900, dur: 0.08, type: 'sine', gain: 0.04 }); // 라이트 딸깍
    softClip(d); return buf;
  },
  'elec-fridge-close': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 0.4);
    mixTone(d, sr, { freq: 180, dur: 0.12, type: 'sine', gain: 0.16, slide: 0.5 });
    mixNoise(d, sr, { dur: 0.1, gain: 0.14, lp: 800, seed: 81 });
    mixTone(d, sr, { t0: 0.1, freq: 90, dur: 0.16, type: 'sine', gain: 0.12 });
    softClip(d); return buf;
  },
  'elec-washer': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 1.5);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const spin = 18 + 2 * Math.sin(t * 3);
      d[i] = 0.1 * Math.sin(2 * Math.PI * spin * t) + 0.05 * Math.sin(2 * Math.PI * spin * 2 * t) + irnd(i) * 0.03;
    }
    const fade = Math.floor(0.06 * sr);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; }
    softClip(d, 0.7); return buf;
  },
  'elec-vac': (ctx) => {
    const { buf, d, sr } = buf1(ctx, 1.2);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = 0.1 * Math.sin(2 * Math.PI * 110 * t) + 0.06 * Math.sin(2 * Math.PI * 220 * t) + irnd(i) * 0.08;
    }
    // 간단한 하이패스 느낌
    let prev = 0;
    for (let i = 0; i < d.length; i++) { const x = d[i]; d[i] = x - prev * 0.7; prev = x; }
    const fade = Math.floor(0.05 * sr);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; }
    softClip(d, 0.7); return buf;
  },
};

export const SFX_NAMES = Object.keys(SFX_BAKE);

/** 상품 kind/shape → 집기 재질 키 */
export function materialOf(p) {
  if (!p) return 'cardboard';
  if (p.kind === 'egg') return 'egg';
  if (p.kind === 'bottle' || p.shape === 'bottles' || p.id === 'water' || p.id === 'soda' || p.id === 'bottle') return 'bottle';
  if (p.kind === 'bag' || p.kind === 'soft' || p.shape === 'pillow' || p.shape === 'rolls') return 'sack';
  if (p.kind === 'round' || p.shape === 'sphere') return 'melon';
  if (p.kind === 'tray' || p.shape === 'tray') return 'tray';
  return 'cardboard';
}

export function placeBufForKg(kg) {
  const w = Number(kg) || 1;
  if (w >= 10) return 'place-heavy';
  if (w >= 3) return 'place-mid';
  return 'place-light';
}

/** 이벤트 이름 → 기본 버퍼(또는 특수 처리 키). 다른 스트림이 호출하는 공개 이름. */
export const EVENT_NAMES = Object.freeze([
  'cart-grab', 'cart-release', 'cart-bump', 'cart-joint',
  'item-pick', 'item-place', 'item-fall', 'item-wobble',
  'egg-crack', 'egg-splat',
  'staff-talk', 'achievement',
  'pa-chime',
  'freezer-door', 'freezer-hum',
  'checkout-scan', 'checkout-belt', 'checkout-printer', 'checkout-pay', 'checkout-done',
  'elec-tv', 'elec-fridge-open', 'elec-fridge-close', 'elec-washer', 'elec-vac',
]);

export const LOOP_EVENTS = new Set(['checkout-belt', 'elec-tv', 'elec-washer', 'elec-vac', 'freezer-hum']);

/** 16-bit PCM WAV (RIFF). AudioBuffer → Uint8Array */
export function encodeWav(audioBuffer) {
  const nCh = audioBuffer.numberOfChannels;
  const sr = audioBuffer.sampleRate;
  const n = audioBuffer.length;
  const bytes = n * nCh * 2;
  const out = new ArrayBuffer(44 + bytes);
  const v = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nCh * 2, true); v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, bytes, true);
  const chans = [];
  for (let c = 0; c < nCh; c++) chans.push(audioBuffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      let x = chans[c][i];
      if (x > 1) x = 1; else if (x < -1) x = -1;
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2;
    }
  }
  return new Uint8Array(out);
}

/** OfflineAudioContext 로 BGM·주요 SFX WAV 미리듣기 목록을 만든다. */
export async function renderDepotAudioPreviews(Offline, sampleRate = 44100) {
  if (!Offline) throw new Error('OfflineAudioContext 없음');
  const fakeCtx = { sampleRate, createBuffer: (c, n, s) => {
    // Offline 임시 컨텍스트의 createBuffer 를 쓰기 위해 짧은 더미 컨텍스트를 연다
    return new Offline(c, n, s).createBuffer(c, n, s);
  } };
  // 더미 Offline 으로 createBuffer 사용
  const maker = new Offline(1, 8, sampleRate);
  const out = [];
  const push = (name, buffer) => out.push({ name, buffer, wav: encodeWav(buffer) });

  const durA = phraseDur(BGM_BARS) + 0.15;
  const offA = new Offline(2, Math.ceil(durA * sampleRate), sampleRate);
  scheduleDepotBgm(offA, offA.destination, { t0: 0.02, bars: BGM_BARS, phrase: 0, gain: 0.3 });
  push('bgm-aisle-sunshine-a', await offA.startRendering());

  const offB = new Offline(2, Math.ceil(durA * sampleRate), sampleRate);
  scheduleDepotBgm(offB, offB.destination, { t0: 0.02, bars: BGM_BARS, phrase: 1, gain: 0.3 });
  push('bgm-aisle-sunshine-b', await offB.startRendering());

  const names = [
    'cart-grab', 'cart-release', 'cart-bump', 'cart-joint', 'cart-roll',
    'pick-cardboard', 'pick-bottle', 'pick-sack', 'pick-egg', 'pick-melon', 'pick-tray',
    'place-light', 'place-mid', 'place-heavy', 'item-fall', 'item-wobble',
    'egg-crack', 'egg-splat', 'achievement', 'pa-chime', 'staff-blip',
    'checkout-scan', 'checkout-belt', 'checkout-printer', 'checkout-pay', 'checkout-done',
    'freezer-hum', 'freezer-door', 'ambient-hvac', 'ambient-crowd',
    'elec-tv', 'elec-fridge-open', 'elec-fridge-close', 'elec-washer', 'elec-vac',
  ];
  for (const n of names) {
    const fn = SFX_BAKE[n];
    if (!fn) continue;
    push(n, fn(maker));
  }
  void fakeCtx;
  return out;
}
