// [corridor] 탄천 하천 지형 연장 (수내·서현 → 잠실). public/corridor/tancheon.json (scripts/corridor/build-tancheon.mjs)
//   - 라이브 terrain.json 은 그대로 두고, 코리더가 켜졌을 때만 그 뒤에 축/단면을 이어 붙인 '합친 T' 를 만든다.
//     같은 createTerrain() 이 한 메시로 그리므로 정자 구간과 이음매가 없다. ?corridor=0 이면 이 파일은 쓰이지 않는다.
//   - 라이브 terrain.json 이 바뀌어 길이/끝점이 맞지 않으면 합치지 않고 라이브 그대로 쓴다(안전한 폴백).
import * as THREE from 'three';
import { flatGeo, fixNormalsUp } from '../world.js';

export function mergeTancheon(T, ext) {
  if (!T || !ext?.axis?.length) return T;
  const n = T.axis.length, last = T.axis[n - 1], m = ext.meta || {};
  if (m.liveAxisN !== n || !m.liveAxisLast || Math.hypot(m.liveAxisLast[0] - last[0], m.liveAxisLast[1] - last[1]) > 0.05) return T;
  const from = ext.from;
  const prof = {};
  for (const k of Object.keys(T.prof)) prof[k] = T.prof[k].slice(0, from).concat(ext.prof[k]);
  return { ...T, axis: T.axis.slice(0, from).concat(ext.axis), prof, stairs: (T.stairs || []).concat(ext.stairs || []), _corridorExt: { from, n: from + ext.axis.length } };
}

// 축 투영 + 단면 보간 (terrain.js 내부 profAt 과 같은 식) — 바닥 평면 구멍 판정용
export function coveredFn(terrain, T) {
  if (!terrain || !T) return () => false;
  const N = T.axis.length, P = T.prof, M = T.params.MARGIN;
  return (x, z) => {
    const q = terrain.project(x, z); if (!q || q.end) return false;
    const s = q.d < 0 ? 'L' : 'R', j = Math.min(N - 1, q.i + 1), top = P['top' + s][q.i] * (1 - q.t) + P['top' + s][j] * q.t;
    return Math.abs(q.d) < top + M;
  };
}

// 하천 구간을 비운 평면 (terrain.js holeyPlane 과 같은 사분할 방식). 축 근처 판정은 격자로 가속.
export function holeyGround(x0, z0, x1, z1, y, minCell, covered, axis) {
  const C = 200, cells = new Set();
  for (let i = 0; i < axis.length; i += 5) { const [x, z] = axis[i]; cells.add(Math.floor(x / C) + ',' + Math.floor(z / C)); }
  const nearAxis = (cx, cz, rad) => {
    const r = rad + 200;
    for (let gx = Math.floor((cx - r) / C); gx <= Math.floor((cx + r) / C); gx++) for (let gz = Math.floor((cz - r) / C); gz <= Math.floor((cz + r) / C); gz++) if (cells.has(gx + ',' + gz)) return true;
    return false;
  };
  const pos = [];
  const quad = (a, b, c, d) => pos.push(a, y, b, a, y, d, c, y, b, c, y, b, a, y, d, c, y, d);
  const rec = (a, b, c, d) => {
    const w = c - a, cx = (a + c) / 2, cz = (b + d) / 2, rad = Math.hypot(w, d - b) / 2;
    if (!nearAxis(cx, cz, rad)) return quad(a, b, c, d);
    if (w <= minCell) { if (![[a, b], [c, b], [a, d], [c, d], [cx, cz]].every(([x, z]) => covered(x, z))) quad(a, b, c, d); return; }
    rec(a, b, cx, cz); rec(cx, b, c, cz); rec(a, cz, cx, d); rec(cx, cz, c, d);
  };
  // 정사각형에 가까운 셀로 나눠 재귀
  const S = 512, nx = Math.max(1, Math.round((x1 - x0) / S)), nz = Math.max(1, Math.round((z1 - z0) / S)), sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) rec(x0 + i * sx, z0 + j * sz, x0 + (i + 1) * sx, z0 + (j + 1) * sz);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

// 탄천 수면 (라이브 정자 수면과 같은 색 #7ec3e6, 높이 = terrain WATER)
export function channelWaterMesh(water, terrain) {
  if (!water?.length || !terrain) return null;
  const g = flatGeo(water.map((w) => ({ ...w, h: terrain.params.WATER })), 0.04);
  if (!g) return null;
  fixNormalsUp(g);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#7ec3e6' }));
  m.receiveShadow = true; m.name = 'corridorTancheonWater';
  return m;
}
