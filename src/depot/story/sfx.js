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
  'kid-giggle': [[1400, 0, 0.05, 'sine', 0.08], [1600, 0.07, 0.05, 'sine', 0.08], [1500, 0.14, 0.06, 'sine', 0.08]],
};

export function createStorySfx({ audio, getLevel }) {
  const off = (() => { try { const q = new URLSearchParams(location.search); return q.get('depotSfx') === '0' || q.get('rideSfx') === '0'; } catch { return false; } })();
  let ctx = null, duckTok = 0, duckSaved = null;
  const level = () => { try { const l = getLevel?.(); if (!l) return 0.55; return l.muted ? 0 : (l.volume ?? 0.55); } catch { return 0.55; } };
  function synth(name) {
    const rec = SYN[name]; if (!rec || off) return false;
    const v = level(); if (v <= 0) return false;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume?.();
      const t0 = ctx.currentTime + 0.01;
      for (const [f, at, len, type, g] of rec) {
        const o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t0 + at);
        gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(Math.max(0.001, g * v), t0 + at + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(gn); gn.connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
      }
      return true;
    } catch { return false; }
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
  return { cue, synth, duck, dispose() { try { if (duckSaved != null) duck(false); ctx?.close(); } catch { /* */ } ctx = null; } };
}
