// [econ-ui] 코인 효과음 판단(순수 함수, node 테스트용) — 재생은 coinSound.js
export const THROTTLE_MS = 400;
export const SHORT_KINDS = Object.freeze(['travel', 'board']);
export const FULL_GAIN = 0.6, SHORT_GAIN = 0.4, SHORT_SEC = 0.6, SHORT_FADE = 0.18;
export const loudness = (v) => (v <= 0 ? 0 : 0.45 + 0.55 * Math.min(1, v));

/** 순수 판단(테스트용): 지금 울릴지 · 어떤 모양으로 */
export function coinPlan(kind, { now, lastAt = -Infinity, level = { muted: false, volume: 1 }, sfxOff = false } = {}) {
  if (sfxOff) return { play: false, why: 'sfx-off' };
  const v = Math.min(1, Math.max(0, Number(level?.volume ?? 1)));
  if (level?.muted || v <= 0) return { play: false, why: 'muted' };
  if (now - lastAt < THROTTLE_MS) return { play: false, why: 'throttled' };
  const short = SHORT_KINDS.includes(kind);
  return { play: true, short, gain: +(loudness(v) * (short ? SHORT_GAIN : FULL_GAIN)).toFixed(3), dur: short ? SHORT_SEC : null };
}

