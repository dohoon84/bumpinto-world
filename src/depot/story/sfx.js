// [depot-story] 소리 신호 (audio-cues.json) — 이미 있는 이름은 depot audio.play 로, 새 효과음·스팅어는 여기서 짧게 합성.
//   ?depotSfx=0 / ?rideSfx=0 이면 합성음도 끔. 볼륨은 월드 오디오 레벨(getLevel)을 따름. 대화 중 BGM 덕킹은 bgm 플레이어 볼륨이 있으면 -9 dB.
import CUES from './data/audio-cues.json';

const EXISTING = new Set(CUES.existing?.audioPlay || []);
const ALIAS = { 'checkout-scan': 'checkout-scan', 'item-wobble': 'item-wobble' };
// 합성 레시피: [주파수 Hz, 시작 s, 길이 s, 파형, 게인]
const SYN = {
  'pa-ding': [[784, 0, 0.35, 'sine', 0.2], [659, 0.3, 0.35, 'sine', 0.2], [523, 0.6, 0.6, 'sine', 0.2]], // 딩동댕 (대본 방송 — audio 의 pa-chime 은 안내 방송 상자까지 띄워서 따로 둠)
  'toast-pop': [[880, 0, 0.06, 'sine', 0.12]],
  'mission-chip': [[660, 0, 0.09, 'triangle', 0.2], [990, 0.1, 0.12, 'triangle', 0.2]],
  'recall-call': [[1200, 0, 0.12, 'sine', 0.18], [1600, 0.13, 0.18, 'sine', 0.18], [900, 0.36, 0.1, 'square', 0.08]],
  'missed-stamp': [[110, 0, 0.18, 'sine', 0.3]],
  'ui-mode-pick': [[520, 0, 0.05, 'triangle', 0.16]],
  'ui-pause': [[440, 0, 0.06, 'triangle', 0.12]],
  'stinger.success': [[523, 0, 0.14, 'triangle', 0.22], [659, 0.14, 0.14, 'triangle', 0.22], [784, 0.28, 0.14, 'triangle', 0.22], [1047, 0.42, 0.5, 'triangle', 0.24]],
  'stinger.partial': [[659, 0, 0.2, 'triangle', 0.2], [587, 0.22, 0.4, 'triangle', 0.18]],
  'stinger.comicfail': [[392, 0, 0.3, 'sawtooth', 0.1], [370, 0.32, 0.3, 'sawtooth', 0.1], [349, 0.64, 0.3, 'sawtooth', 0.1], [330, 0.96, 0.7, 'sawtooth', 0.1]],
  'stinger.spotted': [[98, 0, 0.5, 'sine', 0.35], [233, 0.05, 0.6, 'triangle', 0.12]],
  'stinger.daycard': [[196, 0, 0.5, 'sawtooth', 0.05], [392, 0.45, 0.25, 'triangle', 0.18], [494, 0.45, 0.25, 'triangle', 0.14], [587, 0.45, 0.6, 'triangle', 0.14]],
  'stinger.stamp': [[90, 0, 0.16, 'sine', 0.4], [1568, 0.18, 0.4, 'sine', 0.1]],
  'motif.beomsuk': [[180, 0, 0.06, 'square', 0.08], [523, 0.08, 0.12, 'triangle', 0.18], [392, 0.22, 0.18, 'triangle', 0.18]],
  'motif.beomi': [[784, 0, 0.08, 'triangle', 0.16], [988, 0.09, 0.08, 'triangle', 0.16], [1175, 0.18, 0.14, 'triangle', 0.16]],
  'motif.halmeoni': [[1319, 0, 0.3, 'sine', 0.12], [1047, 0.25, 0.3, 'sine', 0.12], [880, 0.5, 0.45, 'sine', 0.12]],
  'grab-bump': [[160, 0, 0.08, 'square', 0.12]],
  // v0.5 새 소리 (절차 합성) — 'noise' 는 필터 건 잡음(주파수 = 대역 중심)
  'stinger.nextday': [[392, 0, 0.18, 'triangle', 0.18], [523, 0.16, 0.18, 'triangle', 0.18], [659, 0.32, 0.18, 'triangle', 0.18], [784, 0.5, 0.7, 'triangle', 0.2], [196, 0.5, 0.9, 'sine', 0.16], [1568, 0.62, 0.5, 'sine', 0.05]],
  'pan-sizzle': [[3200, 0, 1.4, 'noise', 0.16], [6000, 0.05, 1.2, 'noise', 0.07], [180, 0, 0.12, 'sine', 0.08]],
  'sticker-peel': [[2400, 0, 0.18, 'noise', 0.22], [900, 0.02, 0.12, 'sawtooth', 0.04], [1400, 0.12, 0.05, 'noise', 0.12]],
  'timer-tick': [[2000, 0, 0.03, 'square', 0.1], [1500, 0.5, 0.03, 'square', 0.07]],
  'motif.spy': [[147, 0, 0.16, 'triangle', 0.22], [175, 0.2, 0.16, 'triangle', 0.22], [208, 0.4, 0.16, 'triangle', 0.2], [196, 0.62, 0.4, 'triangle', 0.2], [622, 0.62, 0.35, 'sine', 0.06]],
  'door-chime': [[1319, 0, 0.6, 'sine', 0.14], [988, 0.22, 0.8, 'sine', 0.13], [2637, 0, 0.2, 'sine', 0.03]],
  'chalk-scribble': [[3800, 0, 0.12, 'noise', 0.14], [3400, 0.16, 0.1, 'noise', 0.12], [4200, 0.3, 0.16, 'noise', 0.14], [3600, 0.5, 0.08, 'noise', 0.1]],
  'bgm.errand': [[523, 0, 0.12, 'triangle', 0.14], [659, 0.12, 0.12, 'triangle', 0.14], [784, 0.24, 0.12, 'triangle', 0.14], [1047, 0.36, 0.3, 'triangle', 0.14]], // 곡 들어갈 때 짧은 신호 (곡 자체는 아래 MOODS)
  arrive: [[784, 0, 0.1, 'triangle', 0.18], [1175, 0.09, 0.22, 'triangle', 0.18], [1568, 0.2, 0.3, 'sine', 0.08]],
  'kid-giggle': [[1400, 0, 0.05, 'sine', 0.08], [1600, 0.07, 0.05, 'sine', 0.08], [1500, 0.14, 0.06, 'sine', 0.08]],
  'kid-cry': [[880, 0, 0.22, 'triangle', 0.07], [740, 0.2, 0.3, 'triangle', 0.07], [820, 0.55, 0.18, 'triangle', 0.05]], // E12 꼬마가 놀람(말소리 없이, 작게)
  'sample-tray': [[3100, 0, 0.05, 'triangle', 0.07], [3600, 0.08, 0.05, 'triangle', 0.06], [2800, 0.15, 0.08, 'triangle', 0.05], [5000, 0, 0.04, 'noise', 0.05]], // 시식 이쑤시개·접시 달그락 (d5_072)
  'mop-squeak': [[1400, 0, 0.12, 'sawtooth', 0.04], [1750, 0.1, 0.1, 'sawtooth', 0.04], [1500, 0.26, 0.14, 'sawtooth', 0.035]], // 대걸레 끽끽 (E04 정리)
  // v0.6 새 소리 (audio-cues.json newSfxV06)
  'tissue-tumble': [[420, 0, 0.16, 'noise', 0.26], [120, 0, 0.12, 'sine', 0.16], [380, 0.3, 0.16, 'noise', 0.24], [110, 0.3, 0.12, 'sine', 0.14], [460, 0.62, 0.16, 'noise', 0.22], [100, 0.62, 0.12, 'sine', 0.13], [400, 0.98, 0.16, 'noise', 0.2], [440, 1.3, 0.16, 'noise', 0.16], [90, 1.3, 0.12, 'sine', 0.1], [420, 1.6, 0.2, 'noise', 0.12]], // 보들범 팩 푹-푹-푹 1.8초
  'speed-warn': [[1760, 0, 0.12, 'square', 0.06], [1760, 0.2, 0.12, 'square', 0.06]], // 아기 의자 과속 삐삐 0.4초
  'suspicion-rise': [[294, 0, 0.18, 'square', 0.05], [349, 0.16, 0.18, 'square', 0.05], [415, 0.32, 0.3, 'square', 0.05], [208, 0, 0.5, 'triangle', 0.06]], // 미행 의심 상승(클라리넷 느낌)
  'camera-shutter': [[4200, 0, 0.04, 'noise', 0.3], [2600, 0.07, 0.06, 'noise', 0.24], [2637, 0.1, 0.2, 'sine', 0.06]], // 휴대폰 찰칵 + 플래시 핑 0.3초
  'stinger.reveal': [[147, 0, 0.35, 'sawtooth', 0.09], [175, 0.32, 0.35, 'sawtooth', 0.09], [208, 0.64, 0.35, 'sawtooth', 0.09], [294, 0.98, 1.0, 'sawtooth', 0.1], [587, 0.98, 1.0, 'triangle', 0.08], [1175, 1.2, 0.8, 'sine', 0.04], [73, 0.98, 1.0, 'sine', 0.22]], // 정체 공개 2초
  'lava-hiss': [[5200, 0, 0.5, 'noise', 0.14], [2400, 0.02, 0.3, 'noise', 0.06]], // 바퀴가 선 밖 치익
  // v0.7 대본·사건이 '기존 이름'으로 쓰지만 audio.play 에 없는 소리 (절차 합성)
  'applause': [[2400, 0, 0.5, 'noise', 0.16], [3000, 0.2, 0.6, 'noise', 0.14], [2200, 0.45, 0.7, 'noise', 0.16], [2800, 0.8, 0.7, 'noise', 0.13], [2500, 1.2, 0.8, 'noise', 0.11], [2600, 1.7, 0.6, 'noise', 0.07]], // 박수 2초
  'forklift-beep': [[1050, 0, 0.22, 'square', 0.06], [1050, 0.45, 0.22, 'square', 0.06], [1050, 0.9, 0.22, 'square', 0.05]], // 지게차 후진음 삐-삐-삐
  'freezer-alarm': [[1480, 0, 0.12, 'square', 0.06], [1245, 0.15, 0.12, 'square', 0.06], [1480, 0.3, 0.12, 'square', 0.06]], // E09 녹음 90%↑
  'rain-roof': [[700, 0, 1.6, 'noise', 0.03]], // 새벽 바람 (아주 낮게)
  // v0.7 새 소리 (audio-cues.json newSfxV07) — 6·7일차
  'race-countdown': [[880, 0, 0.16, 'square', 0.09], [880, 0.6, 0.16, 'square', 0.09], [880, 1.2, 0.16, 'square', 0.09], [1760, 1.8, 0.55, 'square', 0.1], [1320, 1.8, 0.6, 'triangle', 0.08]], // 삑-삑-삑-뽀옹 2.4초
  'lap-bell': [[1568, 0, 0.7, 'sine', 0.16], [3136, 0, 0.35, 'sine', 0.05], [2349, 0.01, 0.5, 'sine', 0.04]], // 핸드벨 땡 (마지막 바퀴는 index.js 가 두 번)
  'flashlight-click': [[3200, 0, 0.03, 'noise', 0.26], [1900, 0.07, 0.04, 'noise', 0.2]], // 손전등 딸깍 0.15초
  'forklift-spot': [[1320, 0, 0.13, 'square', 0.08], [1320, 0.2, 0.13, 'square', 0.08], [72, 0.42, 0.38, 'sine', 0.38], [160, 0.42, 0.1, 'noise', 0.2]], // 경고음 + 쿵 0.8초
  'gold-box-open': [[320, 0, 0.22, 'noise', 0.2], [1568, 0.3, 0.45, 'sine', 0.08], [2093, 0.45, 0.45, 'sine', 0.07], [2637, 0.6, 0.5, 'sine', 0.06], [4200, 0.95, 0.6, 'noise', 0.07]], // 뚜껑 + 반짝 + 종이 바스락 1.6초
  'melt-drip': [[1250, 0, 0.05, 'sine', 0.12], [640, 0.04, 0.09, 'sine', 0.08]], // 녹음 +5%마다 똑
  'tablet-tap': [[2600, 0, 0.025, 'noise', 0.2], [2700, 0.14, 0.025, 'noise', 0.17]], // 감사관 태블릿 톡톡
  'check-stamp': [[118, 0, 0.14, 'sine', 0.36], [900, 0, 0.05, 'noise', 0.22]], // 고무도장 탁
  'gold-stamp': [[90, 0, 0.16, 'sine', 0.38], [1568, 0.1, 0.35, 'sine', 0.07], [90, 0.55, 0.16, 'sine', 0.38], [1760, 0.65, 0.35, 'sine', 0.07], [90, 1.1, 0.16, 'sine', 0.38], [1976, 1.2, 0.35, 'sine', 0.07], [90, 1.65, 0.18, 'sine', 0.42], [2093, 1.75, 0.8, 'sine', 0.09], [6000, 1.8, 0.5, 'noise', 0.05]], // 금도장 쾅 ×4 + 반짝
  'pa-sniff': [[1800, 0, 0.22, 'noise', 0.1], [1500, 0.45, 0.32, 'noise', 0.1]], // 방송 너머 훌쩍 (말소리 없음)
  'phone-buzz': [[148, 0, 0.36, 'sawtooth', 0.06], [148, 0.5, 0.36, 'sawtooth', 0.06]], // 휴대폰 진동
  'motif.auditor': [[2000, 0, 0.02, 'square', 0.08], [2000, 0.5, 0.02, 'square', 0.08], [2000, 1.0, 0.02, 'square', 0.08], [2000, 1.5, 0.02, 'square', 0.08], [117, 0, 1.9, 'sawtooth', 0.05], [175, 0.5, 1.4, 'sawtooth', 0.04], [156, 1.2, 0.8, 'sawtooth', 0.04]], // 메트로놈 틱 + 바순 2초
  'stinger.finale': [[523, 0, 0.55, 'triangle', 0.16], [659, 0.55, 0.55, 'triangle', 0.16], [784, 1.1, 0.55, 'triangle', 0.16], [880, 1.65, 0.6, 'triangle', 0.16], [784, 2.3, 0.7, 'triangle', 0.15], [1047, 3.0, 1.0, 'triangle', 0.16], [262, 0, 3.8, 'sine', 0.08], [2093, 3.0, 1.0, 'sine', 0.06]], // Aisle Sunshine 첫 소절 느리게 + 종 4초
};

export function createStorySfx({ audio, getLevel }) {
  const off = (() => { try { const q = new URLSearchParams(location.search); return q.get('depotSfx') === '0' || q.get('rideSfx') === '0'; } catch { return false; } })();
  let ctx = null, duckTok = 0, duckSaved = null;
  const bgmOff = (() => { try { return new URLSearchParams(location.search).get('bgm') === '0'; } catch { return false; } })();
  const level = () => { try { const l = getLevel?.(); if (!l) return 0.55; return l.muted ? 0 : (l.volume ?? 0.55); } catch { return 0.55; } };
  function synth(name) {
    const rec = SYN[name]; if (!rec || off) return false;
    const v = level(); if (v <= 0) return false;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume?.();
      const t0 = ctx.currentTime + 0.01;
      for (const [f, at, len, type, g] of rec) {
        if (type === 'noise') { noiseHit(f, t0 + at, len, g * v, ctx.destination); continue; }
        const o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t0 + at);
        gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(Math.max(0.001, g * v), t0 + at + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(gn); gn.connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
      }
      return true;
    } catch { return false; }
  }
  let noiseBuf = null;
  function noiseHit(freq, at, len, gain, dest) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
    gn.gain.setValueAtTime(0.0001, at); gn.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), at + 0.01);
    for (let k = 1; k < 5; k++) gn.gain.linearRampToValueAtTime(Math.max(0.001, gain * (0.45 + Math.random() * 0.55)), at + len * k / 5); // 지글지글·사각사각 떨림
    gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(bp); bp.connect(gn); gn.connect(dest); src.start(at, Math.random() * 0.5); src.stop(at + len + 0.05);
  }
  // ---------- BGM 분위기 (대본 노드 bgm) ----------
  //   bgm.shop = 매장 곡(Aisle Sunshine) 그대로 · hold = 바꾸지 않음 · 나머지는 매장 곡을 낮추고(1.2초 크로스페이드) 짧은 절차 합성 고리를 얹음.
  const MOODS = {
    'bgm.errand': { bpm: 120, mul: 0.35, wave: 'triangle', g: 0.07, notes: [0, 4, 7, 12, 7, 4, 2, 5, 9, 14, 9, 5], root: 523, bass: [0, -5, -3, -7], bassG: 0.08 },
    'bgm.emotional': { bpm: 66, mul: 0.25, wave: 'sine', g: 0.07, notes: [0, 7, 12, 16, -3, 4, 9, 12, -7, 0, 5, 9, -5, 2, 7, 11], root: 392, bass: [0, -3, -7, -5], bassG: 0.06, len: 1.6 },
    'bgm.tailing': { bpm: 92, mul: 0.3, wave: 'square', g: 0.035, notes: [0, null, 3, null, 0, 5, null, 3, 0, null, -2, null, 0, null, 3, 6], root: 294, bass: [0, 0, 3, -2], bassG: 0.1 },
    'bgm.timesale': { bpm: 148, mul: 0.3, wave: 'square', g: 0.045, notes: [0, 0, 7, 0, 12, 0, 7, 10, 0, 0, 7, 0, 12, 14, 12, 10], root: 440, bass: [0, 0, 5, 7], bassG: 0.1, hat: true },
    'bgm.closing': { bpm: 76, mul: 0.4, wave: 'sine', g: 0.06, notes: [12, 7, 4, 0, 5, 9, 12, 9, 7, 4, 2, 7, 0, null, null, null], root: 659, bass: [0, -5, -3, -5], bassG: 0.05, len: 0.9 },
    'bgm.lava': { bpm: 120, mul: 0.35, wave: 'triangle', g: 0.05, notes: [0, 7, 3, 7, 0, 7, 5, 8, 0, 7, 3, 7, 10, 8, 7, 5], root: 330, bass: [0, 0, -4, -2], bassG: 0.09, hat: true }, // 막장 방송 '바닥은 용암'
    'bgm.cartrace': { bpm: 160, mul: 0.3, wave: 'square', g: 0.04, notes: [0, 7, 12, 7, 0, 7, 12, 14, 0, 7, 12, 7, 15, 14, 12, 10], root: 392, bass: [0, 0, 5, 7], bassG: 0.1, hat: true }, // 6일차 마감 후 경주
    'bgm.dawn': { bpm: 70, mul: 0.15, wave: 'sine', g: 0.05, notes: [0, null, 7, null, 3, null, 10, null, 0, null, 5, null, 3, null, null, null], root: 330, bass: [0, -4], bassG: 0.05, len: 1.4 }, // 새벽 3시 (작게)
    'bgm.legend': { bpm: 84, mul: 0.3, wave: 'triangle', g: 0.06, notes: [0, 4, 7, 11, 12, 11, 7, 4, 5, 9, 12, 16, 14, 12, 9, 7], root: 523, bass: [0, -3, -7, -5], bassG: 0.06, len: 1.1 },
    'bgm.audit': { bpm: 96, mul: 0.4, wave: 'triangle', g: 0.045, notes: [0, null, 0, null, 3, null, 0, null, -2, null, 0, null, 5, 3, 0, null], root: 247, bass: [0, 0, -2, -5], bassG: 0.08 }, // 7일차 감사 (메트로놈 느낌)
    'bgm.tension': { bpm: 104, mul: 0.6, wave: 'triangle', g: 0.04, notes: [0, null, 0, null, 1, null, 0, null], root: 196, bass: [0, 1], bassG: 0.06 },
  };
  let mood = null, moodTimer = 0, moodBus = null, step = 0, nextT = 0;
  function setBgmMul(k) { try { audio?.setBgmMul?.(k, 1.2); } catch { /* */ } }
  function bgm(id) {
    if (!id || id === 'hold' || off || bgmOff) return;
    if (id === 'bgm.shop' || !MOODS[id]) { stopMood(); setBgmMul(1); return; }
    if (mood === MOODS[id]) return;
    try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    stopMood(true); mood = MOODS[id]; step = 0; nextT = ctx.currentTime + 0.3;
    moodBus = ctx.createGain(); moodBus.gain.setValueAtTime(0.0001, ctx.currentTime); moodBus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2); moodBus.connect(ctx.destination);
    setBgmMul(mood.mul);
    clearInterval(moodTimer); moodTimer = setInterval(schedule, 120);
  }
  function stopMood(keepMul) {
    clearInterval(moodTimer); moodTimer = 0;
    if (moodBus && ctx) { const b = moodBus; try { b.gain.cancelScheduledValues(ctx.currentTime); b.gain.setValueAtTime(b.gain.value, ctx.currentTime); b.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.2); } catch { /* */ } setTimeout(() => { try { b.disconnect(); } catch { /* */ } }, 1400); }
    moodBus = null; mood = null; if (!keepMul) setBgmMul(1);
  }
  function schedule() {
    if (!mood || !ctx || !moodBus) return;
    const v = level() * (duckSaved != null ? 0.4 : 1); const sp = 60 / mood.bpm / 2;
    while (nextT < ctx.currentTime + 0.4) {
      const n = mood.notes[step % mood.notes.length];
      if (n != null && v > 0) note(mood.root * 2 ** (n / 12), nextT, (mood.len || 0.8) * sp * 2, mood.wave, mood.g * v);
      if (step % 4 === 0 && v > 0) note(mood.root / 4 * 2 ** (mood.bass[(step / 4 | 0) % mood.bass.length] / 12), nextT, sp * 3.2, 'triangle', mood.bassG * v);
      if (mood.hat && v > 0) noiseHit(8000, nextT, 0.04, (step % 2 ? 0.03 : 0.05) * v, moodBus);
      step++; nextT += sp;
    }
  }
  function note(f, at, len, type, g) {
    const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at);
    gn.gain.setValueAtTime(0.0001, at); gn.gain.exponentialRampToValueAtTime(Math.max(0.001, g), at + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(gn); gn.connect(moodBus); o.start(at); o.stop(at + len + 0.05);
  }
  /** cue: 'pa-chime' | 'toast-pop' | 'stinger.success|comicfail' (첫 이름) | 'item-place {kg}' (이름만) */
  function cue(name, opts = {}) {
    if (!name) return false;
    const n = String(name).split(/[|\s(]/)[0];
    if (EXISTING.has(n) || ALIAS[n]) { try { return !!audio?.play(ALIAS[n] || n, opts); } catch { return false; } }
    return synth(n);
  }
  /** 대화창 열림 동안 BGM -9 dB (플레이어가 볼륨 API 를 가질 때만) */
  function duck(on) {
    try {
      const pl = window.__jj?.bgm?.player; if (!pl || typeof pl.getVolume !== 'function' || typeof pl.setVolume !== 'function') return;
      const tok = ++duckTok;
      if (on) { if (duckSaved == null) duckSaved = pl.getVolume(); pl.setVolume(Math.round(duckSaved * 0.355)); }
      else setTimeout(() => { if (tok === duckTok && duckSaved != null) { pl.setVolume(duckSaved); duckSaved = null; } }, 400);
    } catch { /* BGM 없음 */ }
  }
  return { cue, synth, duck, bgm, get mood() { return Object.keys(MOODS).find((k) => MOODS[k] === mood) || null; }, dispose() { try { stopMood(); if (duckSaved != null) duck(false); ctx?.close(); } catch { /* */ } ctx = null; } };
}
