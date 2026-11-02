// [playgrounds] 놀이터 베이크 공통 평면 기하 (build-playgrounds.mjs · playground-land.mjs)
//   좌표: 게임 로컬 미터 (x = 동, z = 남). 다각형 = [[x, z], ...] (닫는 점 없음)
import { inRing } from '../../lib/world-geo.mjs';

export const area = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s) / 2; };
export const centroid = (r) => { let x = 0, z = 0, a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; x += (r[j][0] + r[i][0]) * f; z += (r[j][1] + r[i][1]) * f; a += f; } return Math.abs(a) < 1e-9 ? r[0] : [x / (3 * a), z / (3 * a)]; };
export const perimeter = (r) => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0);

function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** 최소 면적 외접 사각형: ang = 긴 변 방향(x→z 라디안), [u0,u1]×[v0,v1] = 그 축으로 잰 범위 */
export function minRect(ring) {
  const h = hull(ring); let best = null;
  for (let i = 0; i < h.length; i++) {
    const [ax, az] = h[i], [bx, bz] = h[(i + 1) % h.length];
    const ang = Math.atan2(bz - az, bx - ax), c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of h) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, ang, u0, u1, v0, v1 };
  }
  const { ang, u0, u1, v0, v1 } = best;
  return (u1 - u0) >= (v1 - v0) ? { ang, u0, u1, v0, v1 } : { ang: ang + Math.PI / 2, u0: v0, u1: v1, v0: -u1, v1: -u0 };
}
// three.js rotation.y = ry 일 때 로컬 (lx, lz) → 월드: x = lx cosR + lz sinR, z = -lx sinR + lz cosR
export const toWorld = (cx, cz, ry, lx, lz) => [cx + lx * Math.cos(ry) + lz * Math.sin(ry), cz - lx * Math.sin(ry) + lz * Math.cos(ry)];
export const rectPoly = (cx, cz, ry, hx, hz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => toWorld(cx, cz, ry, a, b));
export const square = (x, z, h) => [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
export function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
export const ringsCross = (A, B) => { for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segX(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true; return false; };
export const polysOverlap = (A, B) => ringsCross(A, B) || A.some(([x, z]) => inRing(x, z, B)) || B.some(([x, z]) => inRing(x, z, A));
export const ptSeg = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); };
/** 점에서 다각형 경계까지 거리 */
export const ptRing = (x, z, r) => { let d = Infinity; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; d = Math.min(d, ptSeg(x, z, p[0], p[1], q[0], q[1])); } return d; };
/** 선분 a-b 와 다각형 P 사이 거리 (겹치면 0) */
export function segPolyDist(a, b, P) {
  if (inRing(a[0], a[1], P) || inRing(b[0], b[1], P)) return 0;
  const n = P.length;
  for (let i = 0; i < n; i++) if (segX(a, b, P[i], P[(i + 1) % n])) return 0;
  let d = Infinity;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n];
    d = Math.min(d, ptSeg(p[0], p[1], a[0], a[1], b[0], b[1]), ptSeg(a[0], a[1], p[0], p[1], q[0], q[1]), ptSeg(b[0], b[1], p[0], p[1], q[0], q[1]));
  }
  return d;
}
/** 다각형 P 가 outer 안(경계 교차 없음, 구멍과 안 겹침)이고 꼭짓점이 경계에서 inset 이상 떨어졌는지 */
export function insidePoly(P, outer, holes = [], inset = 0) {
  if (!P.every(([x, z]) => inRing(x, z, outer) && (inset <= 0 || ptRing(x, z, outer) >= inset))) return false;
  if (ringsCross(P, outer)) return false;
  for (const h of holes) if (polysOverlap(P, h)) return false;
  return true;
}
/** 결정론 난수 (문자열 시드) */
export function seeded(str) {
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = (h >>> 0) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
