// [econ-ui] 보상(bum) 받을 때 코인 효과음 (?ui=v2 PC 경제 UI). 모바일 브랜치도 이 파일의 createCoinSound / coinSound.play 를 그대로 쓰면 된다.
//   - 소리: assets/sfx/coin-reward.{ogg,m4a} (1.65 s, mono). 버스 효과음과 같은 방식: canPlayType 으로 ogg 우선, 안 되면 m4a · 버퍼는 한 번만 받아 디코드해서 재사용
//   - 잠금 해제: 첫 pointerdown/keydown 에서 AudioContext 를 만들고 resume (지하철 안내 방송 src/subway/voice.js 와 같은 방식, iOS 는 사용자 입력 뒤에만 소리)
//   - 볼륨·음소거: 게임 효과음 규칙 그대로 = BGM 미니 플레이어의 음소거·볼륨(window.__jj.bgm.player) · 볼륨 → 0.45 + 0.55 × v (voice.js loudness 와 같은 식)
//     ?bgm=0 이면 볼륨 1 · ?rideSfx=0(효과음 끔)이면 소리 없음
//   - full = 할 일·업적·웰컴·베타, short = 이동·게시판(0.6 s 에서 페이드아웃 + 작게)
//   - 겹침 방지: 마지막으로 소리 낸 뒤 THROTTLE_MS(400 ms) 안에 온 요청은 건너뜀(한 번만 울림)
import ogg from './assets/sfx/coin-reward.ogg?url';
import m4a from './assets/sfx/coin-reward.m4a?url';

import { coinPlan, SHORT_FADE } from './coinPlan.js';
export { coinPlan, THROTTLE_MS, SHORT_KINDS, loudness } from './coinPlan.js';

export function createCoinSound({
  getLevel = () => { try { const p = window.__jj?.bgm?.player; return p ? { muted: p.muted, volume: p.volume } : { muted: false, volume: 1 }; } catch { return { muted: false, volume: 1 }; } },
  sfxOff = (() => { try { return new URLSearchParams(location.search).get('rideSfx') === '0'; } catch { return false; } })(),
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
  target = typeof window !== 'undefined' ? window : null,
  url = (() => { try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? ogg : m4a; } catch { return m4a; } })(),
  now = () => performance.now(),
} = {}) {
  let ctx = null, buf = null, loading = null, lastAt = -Infinity, pending = null;
  const log = [];
  const ac = () => { if (ctx || !AudioCtx || sfxOff) return ctx; try { ctx = new AudioCtx(); } catch { ctx = null; } return ctx; };
  function load() {
    if (loading || sfxOff) return loading;
    const c = ac(); if (!c || typeof fetch !== 'function') return null;
    loading = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p?.then) p.then(res, rej); }))
      .then((b) => { buf = b; if (pending && now() - pending.t < 1000) start(pending.plan); pending = null; })
      .catch((e) => { console.warn('[econ-ui] coin sound load failed', e?.message || e); });
    return loading;
  }
  function unlock() {
    const c = ac(); if (!c) return;
    if (c.state !== 'running') { try { c.resume()?.catch?.(() => {}); } catch { /* noop */ } }
    load();
  }
  const onGesture = () => unlock();
  if (!sfxOff && target?.addEventListener) for (const ev of ['pointerdown', 'keydown']) target.addEventListener(ev, onGesture, { capture: true, passive: true });
  function start(plan) {
    const c = ctx; if (!c || !buf) return false;
    try {
      if (c.state === 'suspended') c.resume()?.catch?.(() => {});
      const src = c.createBufferSource(), g = c.createGain(), t0 = c.currentTime + 0.01;
      src.buffer = buf; src.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(plan.gain, t0);
      if (plan.dur) { g.gain.setValueAtTime(plan.gain, t0 + plan.dur - SHORT_FADE); g.gain.linearRampToValueAtTime(0.0001, t0 + plan.dur); src.start(t0); src.stop(t0 + plan.dur + 0.02); } else src.start(t0);
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* noop */ } };
      return true;
    } catch { return false; }
  }
  return {
    /** kind: RewardEvent.kind ('quest'|'achievement'|'welcome'|'beta' = 전체, 'travel'|'board' = 짧게). 울렸으면 true */
    play(kind = 'quest') {
      const t = now(), plan = coinPlan(kind, { now: t, lastAt, level: getLevel(), sfxOff });
      log.push({ t: Math.round(t), kind, ...plan }); if (log.length > 50) log.splice(0, 25);
      if (!plan.play) return false;
      lastAt = t;
      if (!buf) { pending = { t, plan }; load(); return false; } // 첫 입력 전이거나 아직 디코드 중 → 1초 안에 준비되면 그때 1번
      return start(plan);
    },
    unlock,
    get ready() { return !!buf; },
    get state() { return ctx?.state || null; },
    debug: () => log.slice(),
  };
}

let one = null;
/** 경제 UI 공용 하나(버퍼·AudioContext 1개) */
export const coinSound = { play: (kind) => (one ||= createCoinSound()).play(kind), get: () => (one ||= createCoinSound()) };
