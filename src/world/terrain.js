// [terrain] 탄천 저수로/둔치 고도 + 제방(둑) + 계단 + 다리 구조물
//   데이터: public/terrain.json (scripts/convert-taxi-terrain.mjs 로 생성)
//   기준 높이(근사값, 실측 아님): 도로/제방 위 = 0m, 둔치(산책로·자전거길) = params.FLOOR(-6m), 수면 = WATER(-6.6m), 하상 = BED(-7.6m)
//
//   공개 API
//     baseHeight(x, z)            지형(제방/둔치/하상) 높이 — 다리/계단 제외
//     renderHeight(x, z)          메시에 쓰는 높이 (계단 자리만 살짝 깎음) — world.js 가 data.heightAt 으로 사용
//     getGroundHeight(x, z, refY) 걸을 수 있는 표면 높이 (= groundY). 계단은 한 칸씩 계단식, 다리 상판은 refY 근처일 때만 선택
//     canMove(x0, z0, y0, x1, z1) 플레이어 이동 판정 -> 새 y 또는 null(막힘: 가파른 제방, 다리 난간 밖, 큰 단차)
//     annotate(data)              buildWorld 전에 호출: 도로 점에 높이(p[2]) 부여, 수면 높이, 하천 안 공원 폴리곤 분리
//     build(scene, world, overlay) buildWorld 후 호출: 바닥 평면 구멍 + 하천 지형 메시 + 계단 + 다리 구조물
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addInstancedTrees } from './trees.js';

const MAX_STEP = 0.5;      // 한 번에 오르내릴 수 있는 단차(m)
const MAX_GRADE = 0.4;     // 계단/다리 밖에서 걸을 수 있는 최대 경사 (약 22°) — 탄천 제방은 대부분 이보다 가팔라서 막힘
const PARK_COLOR = { park: '#a8d59a', garden: '#b2dc9f', playground: '#c6e2a0', pitch: '#9fd08c', grass: '#b5dda3', forest: '#86bf7c', wood: '#86bf7c', scrub: '#9cc78a', meadow: '#bfe0a8', recreation_ground: '#b0d89c' };

function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
class SegGrid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  add(item, x0, z0, x1, z1) { const c = this.cell; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const k = i + ',' + j; if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(item); } }
  query(x, z) { return this.map.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)) || []; }
}

export function createTerrain(T, data) {
  const P = T.params, ax = T.axis, N = ax.length, prof = T.prof;
  const { FLOOR, WATER, BED, MARGIN } = P;
  const bb = data.meta.bboxLocal;
  // ---- 축 투영 (convert-taxi-terrain.mjs 의 project() 와 동일) ----
  const CELL = 25, R = 160, grid = new Map();
  for (let i = 0; i < N - 1; i++) {
    const [x, z] = ax[i];
    for (let gx = Math.floor((x - R) / CELL); gx <= Math.floor((x + R) / CELL); gx++) for (let gz = Math.floor((z - R) / CELL); gz <= Math.floor((z + R) / CELL); gz++) {
      const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    }
  }
  const segL = []; for (let i = 0; i < N - 1; i++) segL.push(Math.hypot(ax[i + 1][0] - ax[i][0], ax[i + 1][1] - ax[i][1]));
  function project(x, z) {
    const list = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
    let best = null, bd = Infinity;
    for (const i of list) {
      const ax0 = ax[i][0], az0 = ax[i][1], dx = ax[i + 1][0] - ax0, dz = ax[i + 1][1] - az0, L2 = dx * dx + dz * dz;
      const t = ((x - ax0) * dx + (z - az0) * dz) / L2;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t, px = ax0 + dx * tc, pz = az0 + dz * tc, dist = Math.hypot(x - px, z - pz);
      if (dist < bd) { bd = dist; best = { i, t: tc, dist, d: -(dx * (z - az0) - dz * (x - ax0)) / segL[i], end: (t < -0.05 && i === 0) || (t > 1.05 && i === N - 2) }; }
    }
    return best;
  }
  const profAt = (q) => {
    const s = q.d < 0 ? 'L' : 'R', i = q.i, j = Math.min(N - 1, i + 1), t = q.t;
    const f = (k) => prof[k + s][i] * (1 - t) + prof[k + s][j] * t;
    return { toe: f('toe'), top: f('top'), w: f('w') };
  };
  function hProfile(ad, toe, top, w) {
    if (ad >= top) return 0;
    if (ad >= toe) return FLOOR * (top - ad) / (top - toe);
    if (ad >= w + 1.2) return FLOOR;
    if (ad >= w - 1) return BED + ((FLOOR - BED) * (ad - (w - 1))) / 2.2;
    return BED;
  }
  const endFade = (i) => Math.min(1, Math.min(i, N - 1 - i) / 100); // 축 양 끝 200m 에서 서서히 지면으로 (bbox 에서 2km+ 떨어진 곳)
  function baseHeight(x, z) {
    const q = project(x, z); if (!q || q.end) return 0;
    const p = profAt(q); if (Math.abs(q.d) >= p.top) return 0;
    return hProfile(Math.abs(q.d), p.toe, p.top, p.w) * endFade(q.i);
  }

  // ---- 계단 ----
  const stairs = (T.stairs || []).map((s, k) => {
    const [a, b] = s.flight, L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    return { ...s, k, ax: a[0], az: a[1], h0: a[2], h1: b[2], L, ux, uz, n: s.steps, hw: s.w / 2 };
  });
  const stairGrid = new SegGrid(20);
  for (const s of stairs) stairGrid.add(s, Math.min(s.ax, s.ax + s.ux * s.L) - 4, Math.min(s.az, s.az + s.uz * s.L) - 4, Math.max(s.ax, s.ax + s.ux * s.L) + 4, Math.max(s.az, s.az + s.uz * s.L) + 4);
  const stairLocal = (s, x, z) => { const rx = x - s.ax, rz = z - s.az; return [rx * s.ux + rz * s.uz, -rx * s.uz + rz * s.ux]; };
  const stairLinear = (s, u) => s.h0 + (s.h1 - s.h0) * Math.max(0, Math.min(1, u / s.L));
  const stairStep = (s, u) => u <= 0 ? s.h0 : u >= s.L ? s.h1 : s.h0 + ((s.h1 - s.h0) * (Math.floor((u / s.L) * s.n) + 0.5)) / s.n;
  function stairAt(x, z, pad = 0) {
    for (const s of stairGrid.query(x, z)) { const [u, v] = stairLocal(s, x, z); if (u >= -0.25 && u <= s.L + 0.25 && Math.abs(v) <= s.hw + pad) return { s, u, v }; }
    return null;
  }
  function renderHeight(x, z) {
    const h = baseHeight(x, z); if (h === 0 && !stairs.length) return 0;
    const st = stairAt(x, z, 0.4); if (st) return Math.min(h, stairLinear(st.s, st.u) - 0.1);
    return h;
  }
  // ---- 다리 상판 (annotate 에서 채움) ----
  const decks = [], deckGrid = new SegGrid(20);
  // hw0/hw1·h0/h1 이 있으면 구간을 따라 폭과 높이를 보간 (신기교 아치). 없으면 평평한 상판
  function deckSample(d, x, z) {
    const x0 = d.ax, z0 = d.az, dx = d.bx - x0, dz = d.bz - z0, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
    const hw = d.hw0 != null ? d.hw0 + (d.hw1 - d.hw0) * t : d.hw;
    if (Math.hypot(x0 + dx * t - x, z0 + dz * t - z) > hw) return null;
    const h = d.h0 != null ? d.h0 + (d.h1 - d.h0) * t : d.h;
    return { h, hw, t };
  }
  function deckAt(x, z) {
    let best = null;
    for (const d of deckGrid.query(x, z)) {
      const s = deckSample(d, x, z);
      if (s && (!best || s.h > best.h)) best = s;
    }
    return best;
  }
  function addDeckSegment({ ax: x0, az: z0, bx: x1, bz: z1, hw = 1.6, hw0 = null, hw1 = null, h = -6.0, h0 = null, h1 = null }) {
    const pad = Math.max(hw, hw0 || 0, hw1 || 0);
    const item = { ax: x0, az: z0, bx: x1, bz: z1, hw: pad, hw0, hw1, h, h0, h1, custom: true };
    decks.push(item);
    deckGrid.add(item, Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad);
    return item;
  }
  // 걸을 수 있는 표면 높이. refY(현재 높이)보다 너무 높은 다리 상판은 무시 -> 다리 밑 둔치를 걸을 수 있음
  function getGroundHeight(x, z, refY = Infinity) {
    let h; const st = stairAt(x, z);
    h = st ? stairStep(st.s, st.u) : baseHeight(x, z);
    if (h < -0.05) for (const d of deckGrid.query(x, z)) {
      const s = deckSample(d, x, z);
      if (!s || s.h <= h || s.h > refY + MAX_STEP + 0.1) continue;
      h = s.h;
    }
    return h;
  }
  const grade = (x, z) => { const e = 0.4; return Math.hypot(baseHeight(x + e, z) - baseHeight(x - e, z), baseHeight(x, z + e) - baseHeight(x, z - e)) / (2 * e); };
  function canMove(x0, z0, y0, x1, z1) {
    const h1 = getGroundHeight(x1, z1, y0);
    if (Math.abs(h1 - y0) > MAX_STEP) return null;
    if (stairAt(x1, z1)) return h1;
    const d = deckAt(x1, z1); if (d && Math.abs(d.h - h1) < 0.01) return h1;
    const g1 = grade(x1, z1);
    if (g1 > MAX_GRADE) {
      // 이미 경사면 위에 있으면(순간이동 등) 내려가는 방향만 허용해서 빠져나올 수 있게
      if (!(grade(x0, z0) > MAX_GRADE && h1 <= y0 + 0.01)) return null;
    }
    return h1;
  }

  // ---- buildWorld 전 데이터 주석 ----
  const corridorParks = [];
  const densify = (pts, step) => { const o = []; for (let i = 1; i < pts.length; i++) { const [ax0, az0] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax0, bz - az0), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push([ax0 + ((bx - ax0) * k) / n, az0 + ((bz - az0) * k) / n]); } o.push(pts[pts.length - 1].slice(0, 2)); return o; };
  function annotate(d) {
    d.heightAt = renderHeight;
    // 신기교(OSM 1229714855): 성남대로–황새울로 사이 탄천 보행교. 폭은 보도 기본 2.2m의 5배.
    // 양 끝은 제방 위 보도(0m)에 맞추고, 중앙만 1.5m 올라가는 완만한 아치. 끝 14m는 기존 보도 폭으로 좁힌다.
    const SINGI = { full: 11, end: 2.2, taper: 14, arch: 1.5 };
    const smoothstep = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
    function isSingi(r) {
      if (r.k !== 'footway' || r.p.length < 2) return false;
      const a = r.p[0], b = r.p[r.p.length - 1];
      const near = (p, x, z) => Math.hypot(p[0] - x, p[1] - z) < 4;
      return (near(a, 122.2, 42.3) && near(b, 5.6, 43.7)) || (near(b, 122.2, 42.3) && near(a, 5.6, 43.7));
    }
    function shapeSingi(r) {
      const a = r.p[0], b = r.p[r.p.length - 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = Math.max(2, Math.ceil(L / 2));
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, s = t * L, u = Math.min(s, L - s);
        const x = k === 0 ? a[0] : k === n ? b[0] : a[0] + (b[0] - a[0]) * t;
        const z = k === 0 ? a[1] : k === n ? b[1] : a[1] + (b[1] - a[1]) * t;
        const w = SINGI.end + (SINGI.full - SINGI.end) * (u >= SINGI.taper ? 1 : smoothstep(u / SINGI.taper));
        const h = SINGI.arch * Math.sin(Math.PI * t) ** 2;
        pts.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(h * 1000) / 1000, Math.round(w * 1000) / 1000]);
      }
      r.p = pts; r.w = SINGI.full; r.deckH = SINGI.arch; r.arch = 1;
      for (let i = 1; i < pts.length; i++) {
        const [x0, z0, h0, w0] = pts[i - 1], [x1, z1, h1, w1] = pts[i];
        const hw0 = w0 / 2 + 0.15, hw1 = w1 / 2 + 0.15, pad = Math.max(hw0, hw1);
        const item = { ax: x0, az: z0, bx: x1, bz: z1, hw: pad, hw0, hw1, h: Math.max(h0, h1), h0, h1, road: r };
        decks.push(item); deckGrid.add(item, Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad);
      }
    }
    for (const r of d.roads) {
      if (r.br) {
        if (isSingi(r)) { shapeSingi(r); continue; }
        const dense = densify(r.p, 2), hs = dense.map(([x, z]) => baseHeight(x, z));
        if (Math.min(...hs) > -0.3) continue;
        const ends = [baseHeight(...r.p[0]), baseHeight(...r.p[r.p.length - 1])];
        const h = Math.max(...ends) > FLOOR / 2 ? 0 : FLOOR + 0.4; // 제방 위끼리 잇는 다리 = 도로 높이, 둔치끼리 = 낮은 보도교
        r.p = r.p.map(([x, z]) => [x, z, h]); r.deckH = h;
        for (let i = 1; i < r.p.length; i++) {
          const [x0, z0] = r.p[i - 1], [x1, z1] = r.p[i], hw = r.w / 2 + 0.15, item = { ax: x0, az: z0, bx: x1, bz: z1, hw, h, road: r };
          decks.push(item); deckGrid.add(item, Math.min(x0, x1) - hw, Math.min(z0, z1) - hw, Math.max(x0, x1) + hw, Math.max(z0, z1) + hw);
        }
        continue;
      }
      const dense = densify(r.p, 1.5), hs = dense.map(([x, z]) => renderHeight(x, z));
      if (hs.every((h) => h === 0)) continue;
      // 높이가 변하는 곳만 촘촘하게, 나머지는 원래 점 유지
      const out = [];
      for (let i = 0; i < dense.length; i++) {
        const keep = i === 0 || i === dense.length - 1 || hs[i] !== 0 || hs[i - 1] !== 0 || hs[i + 1] !== 0 || r.p.some((p) => p[0] === dense[i][0] && p[1] === dense[i][1]);
        if (keep) out.push([dense[i][0], dense[i][1], hs[i]]);
      }
      r.p = out;
    }
    for (const w of d.water) {
      const hs = w.o.map(([x, z]) => baseHeight(x, z));
      if (hs.filter((h) => h < FLOOR + 0.5).length > hs.length * 0.5) w.h = WATER; // 탄천 수면 폴리곤 -> 수면 높이로
    }
    for (const l of d.waterLines) {
      const dense = densify(l.p, 4);
      l.p = dense.map(([x, z]) => { const h = baseHeight(x, z); return [x, z, h < -0.5 ? WATER - 0.005 : 0]; });
    }
    d.parks = d.parks.filter((p) => {
      const inC = densify(p.o.concat([p.o[0]]), 3).some(([x, z]) => baseHeight(x, z) < -0.3);
      if (inC) corridorParks.push(p);
      return !inC;
    });
  }

  // ---- 메시 ----
  function build(scene, world, overlay) {
    const inBox = (x, z) => x >= bb.x0 && x <= bb.x1 && z >= bb.z0 && z <= bb.z1;
    // 1) 바닥 평면(world.ground / world.block)을 하천 구간만 비운 격자로 교체
    const covered = (x, z) => { const q = project(x, z); if (!q || q.end) return false; const p = profAt(q); return Math.abs(q.d) < p.top + MARGIN; };
    const axS = ax.filter((_, i) => i % 5 === 0);
    const nearAxis = (x, z, r) => { const lim = (r + 140) ** 2; for (const [px, pz] of axS) if ((px - x) ** 2 + (pz - z) ** 2 < lim) return true; return false; };
    function holeyPlane(x0, z0, x1, z1, y, minCell) {
      const pos = [];
      const quad = (a, b, c, d) => pos.push(a, y, b, a, y, d, c, y, b, c, y, b, a, y, d, c, y, d);
      const rec = (a, b, c, d) => {
        const w = c - a, cx = (a + c) / 2, cz = (b + d) / 2, rad = Math.hypot(w, d - b) / 2;
        if (!nearAxis(cx, cz, rad)) return quad(a, b, c, d);
        if (w <= minCell) { if (![[a, b], [c, b], [a, d], [c, d], [cx, cz]].every(([x, z]) => covered(x, z))) quad(a, b, c, d); return; }
        rec(a, b, cx, cz); rec(cx, b, c, cz); rec(a, cz, cx, d); rec(cx, cz, c, d);
      };
      const S = Math.max(x1 - x0, z1 - z0), nx = Math.ceil((x1 - x0) / (S / 4)), nz = Math.ceil((z1 - z0) / (S / 4));
      const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        // 셀을 정사각형에 가깝게 쪼개서 재귀
        const a = x0 + i * sx, b = z0 + j * sz, k = Math.max(1, Math.round(sx / sz));
        for (let m = 0; m < k; m++) rec(a + (m * sx) / k, b, a + ((m + 1) * sx) / k, b + sz);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const n = new Float32Array(pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      return g;
    }
    if (world.ground) { world.ground.geometry.dispose(); world.ground.geometry = holeyPlane(-3000, -3000, 3000, 3000, 0, 8); world.ground.rotation.set(0, 0, 0); world.ground.position.set(0, 0, 0); }
    if (world.block) { world.block.geometry.dispose(); world.block.geometry = holeyPlane(bb.x0, bb.z0, bb.x1, bb.z1, 0.01, 6); world.block.rotation.set(0, 0, 0); world.block.position.set(0, 0, 0); }

    // 2) 하천 지형 메시 (축을 따라가는 단면 격자)
    const cBlock = new THREE.Color('#ebe4d4'), cGround = new THREE.Color('#efe9dc'), cFlood = new THREE.Color('#c3d59c'), cSlope = new THREE.Color('#8fc07a'), cWall = new THREE.Color('#aaa596'), cBank = new THREE.Color('#bcae86'), cBed = new THREE.Color('#74b2d3');
    const parkCols = corridorParks.map((p) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of p.o) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return { p, a, b, c, d, col: new THREE.Color(PARK_COLOR[p.k] || '#b5dda3') }; });
    const parkAt = (x, z) => { for (const q of parkCols) if (x >= q.a && x <= q.c && z >= q.b && z <= q.d && pointInRing(x, z, q.p.o) && !(q.p.holes || []).some((h) => pointInRing(x, z, h))) return q; return null; };
    const rows = [];
    for (let i = 0; i < N; i++) { const [x, z] = ax[i], near = x > bb.x0 - 250 && x < bb.x1 + 250 && z > bb.z0 - 250 && z < bb.z1 + 250; if (near || i % 4 === 0 || i === N - 1) rows.push(i); }
    const lin = (a, b, n) => Array.from({ length: n }, (_, k) => a + ((b - a) * (k + 1)) / (n + 1));
    const colsFor = (toe, top, w) => {
      const wb = Math.max(1, w - 1), wt = Math.min(toe - 0.5, w + 1.2);
      return [0, wb * 0.5, wb, wt, ...lin(wt, toe, 10), toe, ...lin(toe, top, 14), top, top + 1, top + 4, top + 12, top + MARGIN];
    };
    const pos = [], col = [], idx = []; let C = 0;
    const tmpc = new THREE.Color();
    for (const i of rows) {
      const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, nx = dz, nz = -dx; // d>0 방향
      const L_ = colsFor(prof.toeL[i], prof.topL[i], prof.wL[i]), R_ = colsFor(prof.toeR[i], prof.topR[i], prof.wR[i]);
      const ds = [...L_.slice(1).reverse().map((v) => -v), ...R_];
      C = ds.length;
      for (const d of ds) {
        const x = ax[i][0] + nx * d, z = ax[i][1] + nz * d;
        const h = renderHeight(x, z), ad = Math.abs(d), p = d < 0 ? { toe: prof.toeL[i], top: prof.topL[i], w: prof.wL[i] } : { toe: prof.toeR[i], top: prof.topR[i], w: prof.wR[i] };
        pos.push(x, h > -0.02 ? 0.005 : h, z);
        let c;
        if (h > -0.02) c = inBox(x, z) ? cBlock : cGround;
        else if (ad > p.toe + 0.01) { const pk = parkAt(x, z); c = (FLOOR / (p.top - p.toe) < -1.0) ? cWall : pk && pk.p.k !== 'grass' ? tmpc.copy(cSlope).lerp(pk.col, 0.5) : cSlope; }
        else if (ad > p.w + 1.2) { const pk = parkAt(x, z); c = pk ? pk.col : cFlood; }
        else if (ad > p.w - 1) c = cBank; else c = cBed;
        col.push(c.r, c.g, c.b);
      }
    }
    for (let r = 1; r < rows.length; r++) for (let c = 1; c < C; c++) {
      const a = (r - 1) * C + c - 1, b = a + 1, d = r * C + c - 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.setIndex(idx); cg.computeVertexNormals();
    // 축 방향에 따라 삼각형 감김이 뒤집힐 수 있으니 양면
    const channel = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    channel.receiveShadow = true; channel.name = 'tancheon-terrain'; scene.add(channel);

    // 3) 계단 (디딤판 + 옆벽 + 난간)
    const tread = [], cheek = [], rail = [];
    const box = (arr, w, h, l, x, y, z, yaw, pitch = 0) => { const g = new THREE.BoxGeometry(w, h, l); if (pitch) g.rotateX(pitch); g.rotateY(yaw); g.translate(x, y, z); arr.push(g); };
    const cyl = (arr, r, len, x0, y0, z0, x1, y1, z1) => {
      const g = new THREE.CylinderGeometry(r, r, len, 6), v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); arr.push(g);
    };
    for (const s of stairs) {
      const yaw = Math.atan2(s.ux, s.uz), td = s.L / s.n, rx = -s.uz, rz = s.ux; // rx,rz = 옆 방향
      const W = (u, v) => [s.ax + s.ux * u + rx * v, s.az + s.uz * u + rz * v];
      for (let k = 0; k < s.n; k++) {
        const u = (k + 0.5) * td, h = stairStep(s, u), [x, z] = W(u, 0);
        box(tread, s.w, 1.0, td + 0.02, x, h - 0.5, z, yaw);
      }
      // 위/아래 참(landing)
      { const [x, z] = W(-0.6, 0); box(tread, s.w, 0.3, 1.2, x, s.h0 - 0.14, z, yaw); }
      { const [x, z] = W(s.L + 0.8, 0); box(tread, s.w, 0.3, 1.6, x, s.h1 - 0.13, z, yaw); }
      const slopeLen = Math.hypot(s.L, s.h1 - s.h0), pitch = Math.atan2(s.h0 - s.h1, s.L);
      for (const side of [-1, 1]) {
        const v = side * (s.hw + 0.12), [cx, cz] = W(s.L / 2, v);
        box(cheek, 0.24, 0.9, slopeLen, cx, (s.h0 + s.h1) / 2 - 0.15, cz, yaw, pitch);
        // 난간: 기둥 + 손잡이
        const postH = 0.95, nPost = Math.max(2, Math.round(s.L / 1.6));
        for (let k = 0; k <= nPost; k++) { const u = (s.L * k) / nPost, [x, z] = W(u, v), h = stairLinear(s, u) + 0.3; cyl(rail, 0.035, postH, x, h, z, x, h + postH, z); }
        const [x0, z0] = W(0, v), [x1, z1] = W(s.L, v);
        cyl(rail, 0.04, slopeLen, x0, s.h0 + 0.3 + postH, z0, x1, s.h1 + 0.3 + postH, z1);
        const [xt, zt] = W(-1.0, v), [xb, zb] = W(s.L + 1.2, v);
        cyl(rail, 0.04, 1.0, xt, s.h0 + 0.3 + postH, zt, x0, s.h0 + 0.3 + postH, z0);
        cyl(rail, 0.04, 1.2, x1, s.h1 + 0.3 + postH, z1, xb, s.h1 + 0.3 + postH, zb);
        cyl(rail, 0.035, postH, xt, s.h0, zt, xt, s.h0 + 0.3 + postH, zt); cyl(rail, 0.035, postH + 0.3, xb, s.h1, zb, xb, s.h1 + 0.3 + postH, zb);
      }
      if (overlay) { const [lx, lz] = W(s.L * 0.15, 0); overlay.add({ cls: 'label stairs', text: `🪜 탄천 계단${s.osm ? '' : ' (위치 근사)'}`, getPos: () => new THREE.Vector3(lx, s.h0 + 2.6, lz), maxDist: 55 }); }
    }
    const addMerged = (arr, color, cast = true) => { if (!arr.length) return null; const m = new THREE.Mesh(mergeGeometries(arr), new THREE.MeshLambertMaterial({ color })); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
    addMerged(tread, '#d3cdc0'); addMerged(cheek, '#b4aea2'); addMerged(rail, '#5f6b78');

    // 4) 다리 구조물: 상판 두께 + 교각 + 난간 (도로 리본은 world.js 가 그대로 그림)
    const slab = [], pier = [], para = [];
    const bridgeRoads = [...new Set(decks.map((d) => d.road).filter(Boolean))];
    function buildArched(r) {
      const th = 0.5, pts = r.p;
      for (let i = 1; i < pts.length; i++) {
        const [x0, z0, h0, w0] = pts[i - 1], [x1, z1, h1, w1] = pts[i];
        const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.05) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(ux, uz), rx = -uz, rz = ux;
        const hm = (h0 + h1) / 2, wm = ((w0 || r.w) + (w1 || r.w)) / 2;
        if (!(baseHeight(x0, z0) < hm - 0.4 || baseHeight(x1, z1) < hm - 0.4)) continue;
        const slope = Math.hypot(L, h1 - h0), pitch = Math.atan2(h0 - h1, L);
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        box(slab, wm, th, slope + 0.12, mx, hm + 0.06 - th / 2, mz, yaw, pitch);
        for (const side of [-1, 1]) box(para, 0.22, 1.0, slope + 0.08, mx + rx * side * (wm / 2 - 0.05), hm + 0.55, mz + rz * side * (wm / 2 - 0.05), yaw, pitch);
      }
      let dist = 0, next = 11;
      for (let i = 1; i < pts.length; i++) {
        const [x0, z0, h0, w0] = pts[i - 1], [x1, z1, h1, w1] = pts[i];
        const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.05) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(ux, uz), rx = -uz, rz = ux;
        while (next <= dist + L + 0.01) {
          const u = Math.max(0, Math.min(1, (next - dist) / L));
          const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u, h = h0 + (h1 - h0) * u, w = (w0 || r.w) + ((w1 || r.w) - (w0 || r.w)) * u;
          const g = baseHeight(x, z), top = h + 0.06 - th;
          if (g < top - 1.5) {
            const spots = w > 6 ? [0, -0.28, 0.28] : [0];
            for (const k of spots) box(pier, 0.7, top - g + 0.5, 0.7, x + rx * k * w, (top + g - 0.5) / 2, z + rz * k * w, yaw);
          }
          next += 22;
        }
        dist += L;
      }
    }
    for (const r of bridgeRoads) {
      if (r.arch) { buildArched(r); continue; }
      const foot = ['footway', 'cycleway', 'path', 'pedestrian'].includes(r.k), th = foot ? 0.5 : 1.1, h = r.deckH;
      for (let i = 1; i < r.p.length; i++) {
        const [x0, z0] = r.p[i - 1], [x1, z1] = r.p[i], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(ux, uz), rx = -uz, rz = ux;
        // 하천 위(지면이 낮은 구간)만 상판/난간 — 제방 위 도로 구간엔 안 그림
        const spans = []; let st0 = null;
        for (let u = 0; u <= L + 0.01; u += 1) { const low = baseHeight(x0 + ux * u, z0 + uz * u) < h - 0.4; if (low && st0 == null) st0 = u; if (!low && st0 != null) { spans.push([st0, u]); st0 = null; } }
        if (st0 != null) spans.push([st0, L]);
        for (let [u0, u1] of spans) {
          u0 = Math.max(0, u0 - 1.5); u1 = Math.min(L, u1 + 1.5); const l = u1 - u0, mx = x0 + ux * (u0 + u1) / 2, mz = z0 + uz * (u0 + u1) / 2;
          box(slab, r.w, th, l, mx, h + 0.06 - th / 2, mz, yaw);
          for (const side of [-1, 1]) box(para, 0.22, foot ? 1.0 : 0.7, l, mx + rx * side * (r.w / 2 - 0.05), h + (foot ? 0.55 : 0.4), mz + rz * side * (r.w / 2 - 0.05), yaw);
        }
        // 교각: 하천 안쪽에서 약 22m 간격
        for (let s = 11; s < L; s += 22) {
          const px = x0 + ux * s, pz = z0 + uz * s, g = baseHeight(px, pz), top = h + 0.06 - th;
          if (g > top - 1.5) continue;
          box(pier, foot ? 0.6 : 1.4, top - g + 0.5, foot ? 0.6 : 1.4, px, (top + g - 0.5) / 2, pz, yaw);
          if (!foot && r.w > 6) for (const side of [-1, 1]) box(pier, 1.4, top - g + 0.5, 1.4, px + rx * side * r.w * 0.33, (top + g - 0.5) / 2, pz + rz * side * r.w * 0.33, yaw);
        }
      }
    }
    addMerged(slab, '#b9bcbf'); addMerged(pier, '#a7aaad'); addMerged(para, '#d5d8db');

    // 5) 제방 숲(OSM forest 폴리곤) 나무 — 지형 높이에 맞춰
    const tp = []; let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (const q of parkCols) {
      if (!['forest', 'wood', 'scrub'].includes(q.p.k)) continue;
      for (let x = q.a; x < q.c; x += 7) for (let z = q.b; z < q.d; z += 7) {
        const px = x + rnd() * 5, pz = z + rnd() * 5;
        if (pointInRing(px, pz, q.p.o) && !stairAt(px, pz, 2) && !deckAt(px, pz) && !world.onRoad(px, pz)) tp.push([px, pz]);
      }
    }
    if (tp.length) {
      addInstancedTrees(scene, tp, {
        rnd,
        crownRadius: 2.0,
        crownY: 4.6,
        trunkTop: 0.18,
        trunkBottom: 0.25,
        trunkHeight: 3.4,
        trunkColor: '#7d5f45',
        scaleMin: 0.7,
        scaleSpan: 0.5,
        getY: baseHeight,
      });
    }
    return { channel, treeCount: tp.length };
  }

  // NPC 산책 경로: 도로 -> 계단 -> 둔치를 따라 강변으로 (가까운 계단 기준)
  function riversideRoute(x, z, len = 140) {
    const s = stairs.slice().sort((a, b) => Math.hypot(a.ax - x, a.az - z) - Math.hypot(b.ax - x, b.az - z))[0]; if (!s) return null;
    const A = [s.ax - s.ux * 8, s.az - s.uz * 8], T0 = [s.ax, s.az], B = [s.ax + s.ux * (s.L + 1.5), s.az + s.uz * (s.L + 1.5)];
    const q = project(B[0], B[1]); if (!q) return [A, T0, B];
    const pts = [A, T0, B];
    for (let k = 1; k * 2 < len; k++) {
      const i = Math.min(N - 2, q.i + k), a = ax[i], b = ax[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      const p = [a[0] + dz * q.d, a[1] - dx * q.d];
      if (k % 3 === 0) pts.push(p);
    }
    return pts;
  }
  // 둔치 산책로. lane 은 강 축에서 바깥으로 더 띄운 거리(m).
  function bankPath(x, z, lane = 0) {
    const s = stairs.slice().sort((a, b) => Math.hypot(a.ax - x, a.az - z) - Math.hypot(b.ax - x, b.az - z))[0];
    if (!s) return null;
    const B = [s.ax + s.ux * (s.L + 1.5), s.az + s.uz * (s.L + 1.5)];
    const q = project(B[0], B[1]);
    if (!q) return null;
    const sign = q.d < 0 ? -1 : 1;
    const d = q.d + sign * lane;
    const pts = [];
    const i0 = Math.max(2, q.i - 70);
    const i1 = Math.min(N - 4, q.i + 70);
    for (let i = i0; i <= i1; i += 2) {
      const a = ax[i], b = ax[Math.min(N - 1, i + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      pts.push([a[0] + dz * d, a[1] - dx * d]);
    }
    return pts.length > 6 ? pts : null;
  }
  return { params: P, baseHeight, renderHeight, getGroundHeight, groundY: getGroundHeight, canMove, annotate, build, stairs, decks, addDeckSegment, project, riversideRoute, bankPath, stairAt, grade };
}
