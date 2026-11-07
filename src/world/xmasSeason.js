// [xmas] 크리스마스 트리 노출.
//   기본은 켜짐(이 브랜치 리뷰용 — 날짜와 무관). ?xmas=0|off|false 이면 트리를 만들지 않는다.
//   ?xmas=auto|season 이면 서울 날짜 12월 1일~26일만 켠다.

export function xmasMode(value) {
  const v = value == null ? '' : String(value).trim().toLowerCase();
  if (v === '0' || v === 'off' || v === 'false' || v === 'no') return 'off';
  if (v === 'auto' || v === 'season' || v === 'window') return 'auto';
  return 'on';
}

/** Asia/Seoul 연·월·일 */
export function seoulYmd(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(date);
    const n = (type) => Number(parts.find((p) => p.type === type)?.value);
    const y = n('year'); const m = n('month'); const d = n('day');
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
  } catch { /* Intl 없음 */ }
  const k = new Date(date.getTime() + 9 * 3600e3);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}

/** 12/1 ~ 12/26 (KST, 양 끝 포함) */
export function inXmasWindow(date = new Date()) {
  const { m, d } = seoulYmd(date);
  return m === 12 && d >= 1 && d <= 26;
}

export function xmasActive(value, date = new Date()) {
  const mode = xmasMode(value);
  if (mode === 'off') return false;
  if (mode === 'auto') return inXmasWindow(date);
  return true;
}

/** 정자 분수대 중심. 겨울(트리 켜짐)에는 이 자리에 트리를 두고 분수를 치운다. */
export const JEONGJA_FOUNTAIN = { x: -74, z: 25 };
export const XMAS_BLOCK_R = 5.2;
/** 받침·와이어 링이 닿는 바닥. 이 안쪽의 앉는 자리는 트리와 겹친다. */
export const XMAS_FOOT_R = 9;

export function jeongjaTreeSpot() {
  return { id: 'jeongja', x: JEONGJA_FOUNTAIN.x, z: JEONGJA_FOUNTAIN.z, yaw: 0.4 };
}

/** 트리가 켜져 있으면 분수대(메시·물·충돌·턱 앉기)를 끈다. */
export function fountainSuppressed(xmasValue, date = new Date()) {
  return xmasActive(xmasValue, date);
}

export function distToJeongjaTree(x, z, tree = JEONGJA_FOUNTAIN) {
  return Math.hypot(x - tree.x, z - tree.z);
}

export function overlapsTreeFoot(x, z, tree = JEONGJA_FOUNTAIN, r = XMAS_FOOT_R) {
  return distToJeongjaTree(x, z, tree) < r;
}

/** 트리 바닥 안으로 생긴 자리(비둘기 등)를 링 밖으로 민다. */
export function pushOutOfTree(x, z, tree = JEONGJA_FOUNTAIN, r = XMAS_FOOT_R) {
  const dx = x - tree.x;
  const dz = z - tree.z;
  const d = Math.hypot(dx, dz);
  if (d >= r) return { x, z, moved: false };
  const k = (r + 0.4) / (d || 1);
  if (d < 1e-4) return { x: tree.x + r + 0.4, z: tree.z, moved: true };
  return { x: tree.x + dx * k, z: tree.z + dz * k, moved: true };
}

/** 트리 주변 빛. 기본 켬. ?xmasglow=0|off|false 이면 트리만 남고 주변 광은 없다. */
export function xmasGlowEnabled(value) {
  const v = value == null ? '' : String(value).trim().toLowerCase();
  return !(v === '0' || v === 'off' || v === 'false' || v === 'no');
}
