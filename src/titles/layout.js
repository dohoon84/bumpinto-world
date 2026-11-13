// 머리 위 칭호 화면 크기·획득 연출 배율. three 없음(테스트 가능).
export const OWN_REST_W_DESKTOP = 168; // CSS px, 간판(rowWidth) 목표
export const OWN_REST_W_MOBILE = 130;
export const REMOTE_W_NEAR = 100;
export const REMOTE_W_FAR = 68;
export const REMOTE_NEAR_D = 14;
export const EARN_PRESENT = 2.35; // 내 획득 연출은 평소 대비 이 배율
export const EARN_UP_MS = 280;
export const EARN_DOWN_MS = 550;
export const GAP_PT = 6;
export const CLEAR_PX = 8; // 칭호 발밑과 닉네임 사이
export const HUD_SAFE_DESKTOP = 88;
export const HUD_SAFE_MOBILE = 64;

export function easeOutCubic(u) {
  const x = Math.max(0, Math.min(1, u));
  return 1 - (1 - x) ** 3;
}

export function easeInOutCubic(u) {
  const x = Math.max(0, Math.min(1, u));
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

export function ownRestScale(rowWidthPt, mobile) {
  const target = mobile ? OWN_REST_W_MOBILE : OWN_REST_W_DESKTOP;
  const row = Math.max(1, Number(rowWidthPt) || 98);
  return Math.max(1, target / row);
}

export function remoteScale(rowWidthPt, dist, maxDist) {
  const row = Math.max(1, Number(rowWidthPt) || 98);
  const far = Math.max(Number(maxDist) || 80, REMOTE_NEAR_D + 1);
  const t = Math.max(0, Math.min(1, (Number(dist) - REMOTE_NEAR_D) / (far - REMOTE_NEAR_D)));
  const w = REMOTE_W_NEAR + (REMOTE_W_FAR - REMOTE_W_NEAR) * t;
  return Math.max(REMOTE_W_FAR, w) / row;
}

/** 내 획득 연출 배율(평소 대비). 움직임 줄이기면 1. */
export function earnPresentMul(tMs, durationMs, reduced) {
  if (reduced) return 1;
  const dur = Number(durationMs) || 0;
  const t = Math.max(0, Number(tMs) || 0);
  const P = EARN_PRESENT;
  if (t <= 0) return 1;
  if (t < EARN_UP_MS) return 1 + (P - 1) * easeOutCubic(t / EARN_UP_MS);
  if (dur && t >= dur) return 1;
  if (dur && t > dur - EARN_DOWN_MS) {
    const u = Math.min(1, Math.max(0, (t - (dur - EARN_DOWN_MS)) / EARN_DOWN_MS));
    return P + (1 - P) * easeInOutCubic(u);
  }
  return P;
}

export function worldScale({ local, rowWidthPt, mobile, dist, maxDist, earning, tMs, durationMs, reduced }) {
  const rest = local ? ownRestScale(rowWidthPt, mobile) : remoteScale(rowWidthPt, dist, maxDist);
  if (local && earning) return rest * earnPresentMul(tMs, durationMs, reduced);
  return rest;
}

/** 화면 높이에 맞게 연출 배율을 줄여 닉네임과 상단 HUD 사이에 들어가게 한다. */
export function fitWorldScale({ restScale, desired, minYpt = 0, maxYpt = 0, labelTop, mobile = false }) {
  const safe = mobile ? HUD_SAFE_MOBILE : HUD_SAFE_DESKTOP;
  const span = Number(maxYpt) - Number(minYpt);
  const avail = (Number(labelTop) - CLEAR_PX) - safe;
  const want = Number(desired);
  const rest = Number(restScale) || 1;
  if (!(span > 0) || !Number.isFinite(want)) return want;
  if (!(avail > 0)) return Math.min(want, rest);
  // 공간이 부족하면 평소 배율보다 줄여서라도 닉네임 위에 넣는다.
  const minS = Math.min(rest, 1) * 0.9;
  return Math.max(minS, Math.min(want, avail / span));
}

/** 칭호 원점(닉네임 위). y는 아래가 +다. 닉네임을 가리지 않는 쪽을 우선한다. */
export function placeOrigin({ labelX, labelTop, restScale, worldScale: ws, minYpt = 0, maxYpt = 0, mobile = false }) {
  const clear = CLEAR_PX;
  let oy = labelTop - clear - maxYpt * ws;
  const safe = mobile ? HUD_SAFE_MOBILE : HUD_SAFE_DESKTOP;
  const top = oy + minYpt * ws;
  if (top < safe) {
    const pushed = oy + (safe - top);
    const foot = pushed + maxYpt * ws;
    if (foot <= labelTop - 2) oy = pushed;
  }
  return { ox: labelX, oy };
}

export function isMobileDoc(doc = (typeof document !== 'undefined' ? document : null)) {
  try { if (doc?.body?.classList?.contains('mobile')) return true; } catch { /* */ }
  try {
    if (typeof window !== 'undefined' && window.innerHeight > 0 && window.innerHeight <= 500 && window.innerWidth <= 1000) return true;
  } catch { /* */ }
  return false;
}
