// [depot] 카트 짐 배치·집기 판정 (DOM·THREE 없음 — node 테스트 scripts/test-depot-cart.mjs 가 그대로 씀)
//   · 상자 겹침은 '보이는 크기 그대로'(p.size)의 회전된 상자 → 축 정렬 AABB 로 판정 (물리 포대 모양처럼 줄인 크기 X)
//   · 놓을 자리: 가리킨 곳에서 겹치는 짐 위로 쌓고, 천장(층별 한계)을 넘으면 같은 층 안 다른 빈자리를 찾고, 없으면 full
//   · 집기: 레이를 상품마다 자기 상자(OBB)에 쏴서 가장 가까운 것 하나

/** 쿼터니언 {x,y,z,w} 로 돌린 크기 size 상자를 중심 c 에 놓았을 때의 AABB */
export function orientedAabb(c, q, size, pad = 0) {
  const { x, y, z, w } = q, hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  // 회전 행렬 (열 = 로컬 축)
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m02 = 2 * (x * z + y * w);
  const m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * w);
  const m20 = 2 * (x * z - y * w), m21 = 2 * (y * z + x * w), m22 = 1 - 2 * (x * x + y * y);
  const ex = Math.abs(m00) * hx + Math.abs(m01) * hy + Math.abs(m02) * hz + pad;
  const ey = Math.abs(m10) * hx + Math.abs(m11) * hy + Math.abs(m12) * hz + pad;
  const ez = Math.abs(m20) * hx + Math.abs(m21) * hy + Math.abs(m22) * hz + pad;
  return { x0: c.x - ex, x1: c.x + ex, y0: c.y - ey, y1: c.y + ey, z0: c.z - ez, z1: c.z + ez };
}
/** 카트 속 짐 하나의 AABB (물리 몸체 위치·자세 + 보이는 크기) */
export const itemAabb = (it) => orientedAabb(it.body.position, it.body.quaternion, it.size || it.p.size);
export const overlapXZ = (a, b, e = 0.001) => a.x0 < b.x1 - e && a.x1 > b.x0 + e && a.z0 < b.z1 - e && a.z1 > b.z0 + e;
/** 3D AABB 겹침 깊이 (가장 얕은 축, m) — 0 이하면 안 겹침 */
export const overlapDepth = (a, b) => Math.min(a.x1 - b.x0, b.x1 - a.x0, a.y1 - b.y0, b.y1 - a.y0, a.z1 - b.z0, b.z1 - a.z0);

/** 발자국 fp(XZ 사각형)를 base 높이에서 시작해, 겹치는 짐 위로 올림 → 바닥 y */
export function stackY(fp, h, base, obs) {
  let y = base;
  for (let k = 0; k < 48; k++) {
    let moved = false;
    for (const o of obs) if (overlapXZ(fp, o) && o.y0 < y + h - 0.001 && o.y1 > y + 0.001) { y = o.y1 + 0.0005; moved = true; }
    if (!moved) break;
  }
  return y;
}

/**
 * 놓을 자리 찾기.
 *  hx,hz,h: 놓을 상품의 반폭·반깊이·높이 (회전 반영된 AABB) · x,z: 가리킨 곳 · base: 받침 높이 · obs: 짐 AABB 들
 *  ceil: 이 층에서 상품 윗면이 넘으면 안 되는 높이 · region: 다른 자리를 찾을 범위 {x0,x1,z0,z1} (상품 중심이 아니라 발자국 기준)
 *  → { x, z, y(바닥), top, moved(가리킨 곳에서 옮겼나), full(어디에도 안 들어감) }
 */
export function findSpot({ hx, hz, h, x, z, base, obs, ceil = Infinity, region = null, step = 0.05, gap = 0.004 }) {
  // gap: 놓을 때 살짝 띄우는 높이(interior 는 +3 mm)까지 넣고 틈을 잼 — 위에 걸친 짐 밑으로 밀어 넣을 때도 안 박히게
  const at = (cx, cz) => { const fp = { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz }; const y = stackY(fp, h + gap, base, obs); return { x: cx, z: cz, y, top: y + h, fp }; };
  const first = at(x, z);
  if (first.top <= ceil + 1e-6) return { ...first, moved: false, full: false };
  if (!region) return { ...first, moved: false, full: true };
  // 같은 층 안 빈자리: 가장 낮게 놓이는 곳 → 같으면 가리킨 곳에 가까운 곳
  const xs = [], zs = [];
  const lx0 = region.x0 + hx, lx1 = region.x1 - hx, lz0 = region.z0 + hz, lz1 = region.z1 - hz;
  if (lx1 < lx0 - 1e-6 || lz1 < lz0 - 1e-6) return { ...first, moved: false, full: true }; // 상품이 층보다 큼
  for (let v = lx0; v <= lx1 + 1e-6; v += step) xs.push(Math.min(v, lx1)); if (xs[xs.length - 1] < lx1 - 1e-6) xs.push(lx1);
  for (let v = lz0; v <= lz1 + 1e-6; v += step) zs.push(Math.min(v, lz1)); if (zs[zs.length - 1] < lz1 - 1e-6) zs.push(lz1);
  let best = null;
  for (const cx of xs) for (const cz of zs) {
    const s = at(cx, cz); if (s.top > ceil + 1e-6) continue;
    const d = Math.hypot(cx - x, cz - z);
    if (!best || s.y < best.y - 0.01 || (Math.abs(s.y - best.y) <= 0.01 && d < best.d)) best = { ...s, d };
  }
  if (!best) return { ...first, moved: false, full: true };
  return { x: best.x, z: best.z, y: best.y, top: best.top, fp: best.fp, moved: true, full: false };
}

/** 레이(원점 o, 단위 방향 d) ↔ 회전 상자(중심 c, 쿼터니언 q, 크기 size) — 맞으면 거리, 아니면 null */
export function rayObb(o, d, c, q, size) {
  // 레이를 상자 로컬로: R^T (o - c), R^T d
  const { x, y, z, w } = q;
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m02 = 2 * (x * z + y * w);
  const m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * w);
  const m20 = 2 * (x * z - y * w), m21 = 2 * (y * z + x * w), m22 = 1 - 2 * (x * x + y * y);
  const px = o.x - c.x, py = o.y - c.y, pz = o.z - c.z;
  const lo = [m00 * px + m10 * py + m20 * pz, m01 * px + m11 * py + m21 * pz, m02 * px + m12 * py + m22 * pz];
  const ld = [m00 * d.x + m10 * d.y + m20 * d.z, m01 * d.x + m11 * d.y + m21 * d.z, m02 * d.x + m12 * d.y + m22 * d.z];
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const hh = size[i] / 2;
    if (Math.abs(ld[i]) < 1e-9) { if (lo[i] < -hh || lo[i] > hh) return null; continue; }
    let a = (-hh - lo[i]) / ld[i], b = (hh - lo[i]) / ld[i]; if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
  }
  return t0;
}

/** 후보들 [{dist, ...}] 중 가장 가까운 것 (거리 null·far 넘는 것 제외) */
export function nearestHit(cands, far = Infinity) {
  let best = null;
  for (const c of cands) if (c && c.dist != null && c.dist <= far && (!best || c.dist < best.dist)) best = c;
  return best;
}
