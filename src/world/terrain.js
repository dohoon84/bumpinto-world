// [terrain] 탄천 저수로/둔치 고도 + 제방(둑) + 계단 + 징검다리 + 다리 구조물
//   데이터: public/terrain.json (scripts/convert-taxi-terrain.mjs 로 생성)
//   기준 높이(근사값, 실측 아님): 도로/제방 위 = 0m, 둔치(산책로·자전거길) = params.FLOOR(-6m), 수면 = WATER(-6.6m), 하상 = BED(-7.6m)
//
//   공개 API
//     baseHeight(x, z)            지형(제방/둔치/하상) 높이 — 다리/계단 제외
//     renderHeight(x, z)          메시에 쓰는 높이 (계단 자리만 살짝 깎음) — world.js 가 data.heightAt 으로 사용
//     getGroundHeight(x, z, refY) 걸을 수 있는 표면 높이 (= groundY). 계단은 한 칸씩 계단식, 다리 상판은 refY 근처일 때만 선택,
//                                 징검다리 돌 줄 위는 돌 윗면(수면 + 0.14m)
//     getVehicleHeight(x, z, refY) 차량용 높이 — 다리 상판을 끝/옆 여유까지 이어서 따라감(refY 보다 V_UP(0.6m, 보행자 한 걸음과 같음) 넘게 높은 상판은 무시)
//     canMove(x0, z0, y0, x1, z1) 플레이어 이동 판정 -> 새 y 또는 null(막힘: 가파른 제방, 다리 난간 밖, 큰 단차)
//     annotate(data)              buildWorld 전에 호출: 도로 점에 높이(p[2]) 부여, 수면 높이, 하천 안 공원 폴리곤 분리
//     build(scene, world, overlay) buildWorld 후 호출: 바닥 평면 구멍 + 하천 지형 메시 + 계단 + 징검다리 + 다리 구조물 + 저녁 다리 조명(bridgeLights.js)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addInstancedTrees } from './trees.js';
import { createStreams } from './streams.js';
import { buildBridgeLights } from './bridgeLights.js';

const MAX_STEP = 0.5;      // 한 번에 오르내릴 수 있는 단차(m)
const MAX_GRADE = 0.4;     // 계단/다리 밖에서 걸을 수 있는 최대 경사 (약 22°) — 탄천 제방은 대부분 이보다 가팔라서 막힘
// 보행·자전거 다리(차 없음): 상판 폭 = OSM 기본 폭(보도 2.2m) × FOOT_DECK. 옆 다리(차도교 옆 보도교 등)와 겹치면 그 앞까지만
const FOOT = new Set(['footway', 'cycleway', 'path', 'pedestrian']);
const FOOT_DECK = 3;
// 징검다리 돌 (한국 하천 징검다리 크기 근사): 진행 방향 길이 along, 옆 폭 across, 돌 간격 pitch(중심 간), 윗면 = 수면 + up
//   OSM 선을 양쪽으로 ext 까지 늘려서 지형이 윗면보다 낮은 구간(물·물가)에만 놓는다
const STONE = { along: 0.6, across: 0.9, pitch: 0.95, up: 0.14, ext: 4 };
const FORD_APRON = 1.0; // 돌 줄 옆 이 폭까지는 물가 경사 제한 없이 걸어서 돌로 오르내림
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
  // [globe-startup] project() 는 지형 메시·제방 판정에서 수십만 번 불린다(입장 로딩의 가장 큰 단일 비용).
  //   결과는 그대로 두고 내부 루프만 가볍게: 세그먼트 좌표를 평평한 배열로, 거리 비교는 제곱으로, 결과 객체는 마지막에 한 번만.
  const SX = new Float64Array(N), SZ = new Float64Array(N), SDX = new Float64Array(N), SDZ = new Float64Array(N), SL2 = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) { SX[i] = ax[i][0]; SZ[i] = ax[i][1]; SDX[i] = ax[i + 1][0] - SX[i]; SDZ[i] = ax[i + 1][1] - SZ[i]; SL2[i] = SDX[i] * SDX[i] + SDZ[i] * SDZ[i]; }
  function project(x, z) {
    const list = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
    let bi = -1, bt = 0, btc = 0, bd2 = Infinity;
    for (let k = 0, n = list.length; k < n; k++) {
      const i = list[k], ax0 = SX[i], az0 = SZ[i], dx = SDX[i], dz = SDZ[i];
      const t = ((x - ax0) * dx + (z - az0) * dz) / SL2[i];
      const tc = t < 0 ? 0 : t > 1 ? 1 : t, ex = x - (ax0 + dx * tc), ez = z - (az0 + dz * tc), d2 = ex * ex + ez * ez;
      if (d2 < bd2) { bd2 = d2; bi = i; bt = t; btc = tc; }
    }
    if (bi < 0) return null;
    const ax0 = SX[bi], az0 = SZ[bi], dx = SDX[bi], dz = SDZ[bi];
    return { i: bi, t: btc, dist: Math.hypot(x - (ax0 + dx * btc), z - (az0 + dz * btc)), d: -(dx * (z - az0) - dz * (x - ax0)) / segL[bi], end: (bt < -0.05 && bi === 0) || (bt > 1.05 && bi === N - 2) };
  }
  const profAt = (q) => {
    const s = q.d < 0 ? 'L' : 'R', i = q.i, j = Math.min(N - 1, i + 1), t = q.t;
    const f = (k) => prof[k + s][i] * (1 - t) + prof[k + s][j] * t;
    return { toe: f('toe'), top: f('top'), w: f('w') };
  };
  // [pangyo-water] dz: 본류 낙차(둑 대비, ≤ 0) — 둔치·물가·하상을 같이 내림. 없으면 0 (FLOOR + 0 === FLOOR → 예전과 같은 값)
  function hProfile(ad, toe, top, w, dz = 0) {
    const F = FLOOR + dz, B = BED + dz;
    if (ad >= top) return 0;
    if (ad >= toe) return F * (top - ad) / (top - toe);
    if (ad >= w + 1.2) return F;
    if (ad >= w - 1) return B + ((F - B) * (ad - (w - 1))) / 2.2;
    return B;
  }
  // [pangyo-water] 정자→판교 탄천 수위: T.mainDrop { from, dz[] } (합친 축 점마다, src/corridor/pangyoWater.js). ?pangyowater=0 이면 없음
  const MD = T.mainDrop || null;
  const dzI = (i) => { const k = i - MD.from; return k >= 0 && k < MD.dz.length ? MD.dz[k] : 0; };
  const dzQ = MD ? (q) => dzI(q.i) * (1 - q.t) + dzI(q.i + 1) * q.t : () => 0;
  function mainDrop(x, z) { if (!MD) return 0; const q = project(x, z); return q && !q.end ? dzQ(q) : 0; }
  const floorAt = (x, z) => FLOOR + mainDrop(x, z), mainWater = (x, z) => WATER + mainDrop(x, z);
  const dropBox = MD ? ax.slice(MD.from, MD.from + MD.dz.length).reduce((b, [x, z]) => [Math.min(b[0], x - 150), Math.min(b[1], z - 150), Math.max(b[2], x + 150), Math.max(b[3], z + 150)], [Infinity, Infinity, -Infinity, -Infinity]) : null;
  const endFade = (i) => Math.min(1, Math.min(i, N - 1 - i) / 100); // 축 양 끝 200m 에서 서서히 지면으로 (bbox 에서 2km+ 떨어진 곳)
  function mainBase(x, z) {
    const q = project(x, z); if (!q || q.end) return 0;
    const p = profAt(q); if (Math.abs(q.d) >= p.top) return 0;
    return hProfile(Math.abs(q.d), p.toe, p.top, p.w, dzQ(q)) * endFade(q.i);
  }
  // [streams] 지류 하도(T.streams, ?streams=0 이면 없음): 높이 = min(본류, 지류). 없으면 본류 그대로
  const streams = T.streams ? createStreams(T.streams, MD ? { P, mainBase, mainFloor: floorAt, mainWater } : { P, mainBase }) : null;
  const baseHeight = streams ? (x, z) => { const a = mainBase(x, z), b = streams.height(x, z); return b < a ? b : a; } : mainBase;

  // ---- 계단 ----
  const mkStair = (s, k) => {
    const [a, b] = s.flight, L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    return { ...s, k, ax: a[0], az: a[1], h0: a[2], h1: b[2], L, ux, uz, n: s.steps, hw: s.w / 2 };
  };
  // [pangyo-water] 본류 계단 아래 끝(둔치)도 낙차만큼 내리고 단 수를 비례로 늘림
  const dropStair = (s) => {
    const [a, b] = s.flight, d = mainDrop(b[0], b[1]);
    if (!(d < 0 && b[2] < 0)) return s;
    const steps = Math.round((s.steps * (b[2] + d)) / b[2]);
    return { ...s, flight: [a, [b[0], b[1], b[2] + d]], steps, riser: +((a[2] - b[2] - d) / steps).toFixed(3) };
  };
  const stairs = (T.stairs || []).map((s, k) => mkStair(MD ? dropStair(s) : s, k));
  // 지류 계단: 높이·메시에는 쓰지만 탄천 산책 경로(riversideRoute/bankPath, export stairs)에는 넣지 않음
  const streamStairs = (streams ? streams.stairs : []).map((s, k) => mkStair(s, stairs.length + k));
  const allStairs = stairs.concat(streamStairs);
  const stairGrid = new SegGrid(20);
  for (const s of allStairs) stairGrid.add(s, Math.min(s.ax, s.ax + s.ux * s.L) - 4, Math.min(s.az, s.az + s.uz * s.L) - 4, Math.max(s.ax, s.ax + s.ux * s.L) + 4, Math.max(s.az, s.az + s.uz * s.L) + 4);
  const stairLocal = (s, x, z) => { const rx = x - s.ax, rz = z - s.az; return [rx * s.ux + rz * s.uz, -rx * s.uz + rz * s.ux]; };
  const stairLinear = (s, u) => s.h0 + (s.h1 - s.h0) * Math.max(0, Math.min(1, u / s.L));
  const stairStep = (s, u) => u <= 0 ? s.h0 : u >= s.L ? s.h1 : s.h0 + ((s.h1 - s.h0) * (Math.floor((u / s.L) * s.n) + 0.5)) / s.n;
  function stairAt(x, z, pad = 0) {
    for (const s of stairGrid.query(x, z)) { const [u, v] = stairLocal(s, x, z); if (u >= -0.25 && u <= s.L + 0.25 && Math.abs(v) <= s.hw + pad) return { s, u, v }; }
    return null;
  }
  // ---- 징검다리 (streams.json fords: OSM ford=stepping_stones, 지류) ----
  //   걷기: 돌 줄(폭 STONE.across) 안에서는 높이 = max(지형, 돌 윗면), 경사 제한 없음 → 물가 경사를 지나 돌을 밟고 건넘.
  //   줄 밖 물은 예전대로(물가 경사·하상 단차로 막힘). 돌 사이 틈(~0.35m)은 한 걸음이라 윗면 높이로 이어 걷는다
  const fords = [], fordGrid = new SegGrid(20);
  for (const f of streams ? streams.fords : []) {
    const a = f.p[0], b = f.p[f.p.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, T = L + 2 * STONE.ext;
    const at = (u) => [a[0] + ux * (u - STONE.ext), a[1] + uz * (u - STONE.ext)];
    let um = 0, gm = Infinity;
    for (let u = 0; u <= T; u += 0.1) { const g = baseHeight(...at(u)); if (g < gm) { gm = g; um = u; } }
    const wy = streams.waterAt(...at(um)); if (wy == null) continue;
    const top = wy + STONE.up, wet = (u) => baseHeight(...at(u)) < top - 0.05;
    let u0 = um, u1 = um;
    while (u0 > 0 && wet(u0 - 0.1)) u0 -= 0.1;
    while (u1 < T && wet(u1 + 0.1)) u1 += 0.1;
    const n = Math.max(1, Math.round((u1 - u0) / STONE.pitch)), step = (u1 - u0) / n, stones = [];
    for (let k = 0; k < n; k++) { const [x, z] = at(u0 + step * (k + 0.5)); stones.push([x, z]); }
    const [ax0, az0] = at(u0 - 0.5), [bx0, bz0] = at(u1 + 0.5), hw = STONE.across / 2 + 0.15; // 걷는 반폭 0.6m = 돌 반폭 + 발 걸침
    const item = { ax: ax0, az: az0, bx: bx0, bz: bz0, hw, h: top, yaw: Math.atan2(ux, uz), stones, osm: f.osm, river: f.river };
    fords.push(item);
    { const r = hw + FORD_APRON; fordGrid.add(item, Math.min(ax0, bx0) - r, Math.min(az0, bz0) - r, Math.max(ax0, bx0) + r, Math.max(az0, bz0) + r); }
  }
  function fordAt(x, z, pad = 0) { // pad: 줄 옆 여유(물가 경사 '진입로' 판정용)
    for (const f of fordGrid.query(x, z)) {
      const dx = f.bx - f.ax, dz = f.bz - f.az, L2 = dx * dx + dz * dz, t = ((x - f.ax) * dx + (z - f.az) * dz) / L2;
      if (t >= 0 && t <= 1 && Math.abs((x - f.ax) * dz - (z - f.az) * dx) / Math.sqrt(L2) <= f.hw + pad) return f;
    }
    return null;
  }
  function renderHeight(x, z) {
    const h = baseHeight(x, z); if (h === 0 && !allStairs.length) return 0;
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
  // [cityhall] raised plaza surfaces (deck/tiers) at y≈0 — addGroundExtra(fn)
  // fn(x,z,refY,baseH) -> surface Y or null. Highest reachable within MAX_STEP wins.
  const groundExtras = [];
  function addGroundExtra(fn) {
    if (typeof fn !== 'function') return () => {};
    groundExtras.push(fn);
    return () => { const i = groundExtras.indexOf(fn); if (i >= 0) groundExtras.splice(i, 1); };
  }
  function getGroundHeight(x, z, refY = Infinity) {
    let h; const st = stairAt(x, z);
    h = st ? stairStep(st.s, st.u) : baseHeight(x, z);
    if (fords.length) { const f = fordAt(x, z); if (f && f.h > h && f.h <= refY + MAX_STEP + 0.1) h = f.h; }
    if (h < -0.05) for (const d of deckGrid.query(x, z)) {
      const s = deckSample(d, x, z);
      if (!s || s.h <= h || s.h > refY + MAX_STEP + 0.1) continue;
      h = s.h;
    }
    for (const fn of groundExtras) {
      const e = fn(x, z, refY, h);
      if (e == null || !(e > h) || e > refY + MAX_STEP + 0.1) continue;
      h = e;
    }
    return h;
  }
  // [vehicle-h] 차량 전용 높이: 차는 다리 상판을 끊김 없이 따라간다(보행자 getGroundHeight 는 그대로 — 다리 밑 둔치 걷기 유지).
  //   - 상판 판정 범위를 옆으로 V_PAD, 양 끝으로 V_EXT 만큼 넓힌다 → 상판 시작 직전 낮아진 제방(차선 오프셋 쪽)에서 빠지지 않음
  //   - refY(지금 차 높이)보다 V_UP(0.6m) 넘게 높은 상판은 무시 → 둔치(-6m)를 달리는 차는 다리 밑을 그대로 지나감
  //   - 지형이 0m(제방 위·평지)인 곳은 상판을 보지 않으므로 정자 평지 도로에서는 getGroundHeight 와 같다
  //   - 끝 연장 V_EXT 뒤로 V_RAMP_L 동안은 경사 V_RAMP 로 천천히 내려가는 가상 경사로(제방이 상판 끝보다 더 멀리 낮아진 곳에서도 뚝 떨어지지 않음)
  const V_UP = 0.6, V_PAD = 2.0, V_EXT = 10, V_RAMP = 0.12, V_RAMP_L = 30;
  let vGrid = null, vGridN = -1;
  function vehicleGrid() {
    if (vGrid && vGridN === decks.length) return vGrid;
    vGrid = new SegGrid(20); vGridN = decks.length;
    for (const d of decks) {
      const dx = d.bx - d.ax, dz = d.bz - d.az, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, pad = d.hw + V_PAD + 0.5;
      const E = V_EXT + V_RAMP_L, x0 = d.ax - ux * E, z0 = d.az - uz * E, x1 = d.bx + ux * E, z1 = d.bz + uz * E;
      vGrid.add(d, Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad);
    }
    return vGrid;
  }
  function deckSampleV(d, x, z) {
    const x0 = d.ax, z0 = d.az, dx = d.bx - x0, dz = d.bz - z0, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const tr = ((x - x0) * dx + (z - z0) * dz) / L2;
    const out = Math.max(-tr * L, (tr - 1) * L); // 상판 끝 밖으로 나간 거리(안쪽이면 음수)
    if (out > V_EXT + V_RAMP_L) return null;
    const t = Math.max(0, Math.min(1, tr));
    const hw = d.hw0 != null ? d.hw0 + (d.hw1 - d.hw0) * t : d.hw;
    const lat = Math.abs((x - x0) * dz - (z - z0) * dx) / L; // 상판 중심선까지 옆 거리(끝 연장 구간 포함)
    if (lat > hw + V_PAD) return null;
    return (d.h0 != null ? d.h0 + (d.h1 - d.h0) * t : d.h) - Math.max(0, out - V_EXT) * V_RAMP;
  }
  function getVehicleHeight(x, z, refY = Infinity) {
    let h = getGroundHeight(x, z, refY);
    if (h < -0.001) for (const d of vehicleGrid().query(x, z)) {
      const dh = deckSampleV(d, x, z);
      if (dh == null || dh <= h || dh > refY + V_UP) continue;
      h = dh;
    }
    return h;
  }
  const grade = (x, z) => { const e = 0.4; return Math.hypot(baseHeight(x + e, z) - baseHeight(x - e, z), baseHeight(x, z + e) - baseHeight(x, z - e)) / (2 * e); };
  // 수면 높이(바닥이 물에 잠긴 곳만): 지류 = 지류 수면, 본류 수로 = WATER. 물 밖이면 null
  function waterSurface(x, z) {
    const g = baseHeight(x, z);
    const w = streams ? streams.waterAt(x, z) : null; if (w != null && g < w - 0.02) return w;
    const W = MD ? mainWater(x, z) : WATER; // [pangyo-water]
    return g < W - 0.02 && mainBase(x, z) < W - 0.02 ? W : null;
  }
  const submerged = (x, z, y) => { const w = waterSurface(x, z); return w != null && y < w - 0.02; };
  function canMove(x0, z0, y0, x1, z1) {
    // 물속에 빠져 있으면(예전 버전·순간이동) 더 깊어지지 않는 쪽으로는 경사·단차(1m까지) 무시하고 올라와 빠져나오게
    if (submerged(x0, z0, y0)) { const h = getGroundHeight(x1, z1, y0 + 1); return h >= y0 - 0.01 && h <= y0 + 1 ? h : null; }
    const h1 = getGroundHeight(x1, z1, y0);
    if (Math.abs(h1 - y0) > MAX_STEP) return null;
    if (stairAt(x1, z1) || fordAt(x1, z1)) return h1;
    const d = deckAt(x1, z1); if (d && Math.abs(d.h - h1) < 0.01) return h1;
    if (submerged(x1, z1, h1)) return null; // 물속(수면 아래 바닥)으로는 못 들어감 = 다른 물가와 같음
    if (fords.length && fordAt(x1, z1, FORD_APRON)) return h1; // 징검다리 양 끝 물가 경사(줄 옆 1m)는 비스듬히 와도 오르내림 (물속은 위에서 막힘)
    const g1 = grade(x1, z1);
    if (g1 > MAX_GRADE) {
      // 이미 경사면 위에 서 있으면(순간이동 등) 내려가는 방향만 허용해서 빠져나올 수 있게.
      // 돌·다리·계단 위(y0 가 지형보다 높음)에서는 아래 경사가 가팔라도 이 예외를 안 씀 → 징검다리 옆 물가로 미끄러져 내려가지 않음
      if (!(grade(x0, z0) > MAX_GRADE && Math.abs(y0 - baseHeight(x0, z0)) < 0.05 && h1 <= y0 + 0.01)) return null;
    }
    return h1;
  }


  // ---- buildWorld 전 데이터 주석 ----
  const corridorParks = [];
  const densify = (pts, step) => { const o = []; for (let i = 1; i < pts.length; i++) { const [ax0, az0] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax0, bz - az0), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push([ax0 + ((bx - ax0) * k) / n, az0 + ((bz - az0) * k) / n]); } o.push(pts[pts.length - 1].slice(0, 2)); return o; };
  // 다리가 아닌 길: 지형 높이를 점마다 붙임 (높이가 변하는 곳만 1.5m 로 촘촘하게, 나머지는 원래 점 유지)
  function liftRoad(r) {
    const dense = densify(r.p, 1.5), hs = dense.map(([x, z]) => renderHeight(x, z));
    if (hs.every((h) => h === 0)) return;
    const out = [];
    for (let i = 0; i < dense.length; i++) {
      const keep = i === 0 || i === dense.length - 1 || hs[i] !== 0 || hs[i - 1] !== 0 || hs[i + 1] !== 0 || r.p.some((p) => p[0] === dense[i][0] && p[1] === dense[i][1]);
      if (keep) out.push([dense[i][0], dense[i][1], hs[i]]);
    }
    r.p = out;
  }
  // [streams] 코리더 타일 길(이미 annotate 된 데이터 밖)용. 지류가 없으면 아무것도 안 함 → 정자/기존 타일 동일
  function liftRoads(roads) { if (!streams) return; for (const r of roads) if (!r.br && r.p.length >= 2 && r.p[0].length < 3) liftRoad(r); }
  // 수로 선(waterway 리본) 높이: 본류 규칙 그대로(h < -0.5 → 본류 수면), 지류 띠 안이면 그 지형 바로 아래(리본은 지류 메시의 수면이 대신 그림)
  function waterLineY(x, z) {
    if (streams && streams.inBand(x, z)) { const m = mainBase(x, z); if (!(m < -0.5)) return renderHeight(x, z) - 0.08; }
    return baseHeight(x, z) < -0.5 ? (MD ? mainWater(x, z) : WATER) - 0.005 : 0; // [pangyo-water]
  }
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
    // 보행교 폭: 나란한 옆 다리(이번 데이터 + 이미 만든 상판)와 겹치지 않는 만큼만 넓힘 (차도교 옆 보도교는 그대로)
    const brSegs = decks.filter((q) => q.road && !q.road.arch).map((q) => ({ ...q, foot: FOOT.has(q.road.k) }));
    for (const r of d.roads) if (r.br && !isSingi(r)) for (let i = 1; i < r.p.length; i++) brSegs.push({ ax: r.p[i - 1][0], az: r.p[i - 1][1], bx: r.p[i][0], bz: r.p[i][1], hw: r.w / 2 + 0.15, foot: FOOT.has(r.k), road: r });
    function footDeckW(r) {
      let half = (r.w * FOOT_DECK) / 2;
      for (let i = 1; i < r.p.length; i++) {
        const [x0, z0] = r.p[i - 1], [x1, z1] = r.p[i], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
        for (let u = 0; u <= L; u += 1) {
          const x = x0 + ux * u, z = z0 + uz * u; if (baseHeight(x, z) > -0.3) continue; // 하천 위(상판이 그려지는 곳)만
          for (const o of brSegs) {
            if (o.road === r) continue;
            const dx = o.bx - o.ax, dz = o.bz - o.az, M = Math.hypot(dx, dz); if (M < 0.5 || Math.abs((dx * ux + dz * uz) / M) < 0.8) continue;
            const t = ((x - o.ax) * dx + (z - o.az) * dz) / (M * M); if (t <= 0 || t >= 1) continue;
            const lat = Math.abs((x - o.ax) * dz - (z - o.az) * dx) / M; if (lat < 0.5) continue;
            half = Math.min(half, o.foot ? lat / 2 : lat - o.hw - 0.3);
          }
        }
      }
      return Math.max(r.w, Math.round(2 * half * 10) / 10);
    }
    for (const r of d.roads) {
      if (r.br) {
        if (isSingi(r)) { shapeSingi(r); continue; }
        const dense = densify(r.p, 2), hs = dense.map(([x, z]) => baseHeight(x, z));
        if (Math.min(...hs) > -0.3) continue;
        const ends = [baseHeight(...r.p[0]), baseHeight(...r.p[r.p.length - 1])];
        const h = Math.max(...ends) > FLOOR / 2 ? 0 : (MD ? Math.max(...r.p.map(([x, z]) => floorAt(x, z))) : FLOOR) + 0.4; // 제방 위끼리 잇는 다리 = 도로 높이, 둔치끼리 = 낮은 보도교 ([pangyo-water] 둔치 = 낙차 반영)
        r.p = r.p.map(([x, z]) => [x, z, h]); r.deckH = h;
        // 상판 폭 deckW (리본은 OSM 폭 r.w 그대로). 걷는 반폭: 예전 r.w/2 + 0.15, 넓힌 보행교는 난간 안쪽(난간 두께 0.22 + 몸 여유)까지
        const foot = FOOT.has(r.k); r.deckW = foot ? footDeckW(r) : r.w;
        const hw = Math.max(r.w / 2 + 0.15, r.deckW / 2 - 0.3);
        for (let i = 1; i < r.p.length; i++) {
          const [x0, z0] = r.p[i - 1], [x1, z1] = r.p[i], item = { ax: x0, az: z0, bx: x1, bz: z1, hw, h, road: r };
          decks.push(item); deckGrid.add(item, Math.min(x0, x1) - hw, Math.min(z0, z1) - hw, Math.max(x0, x1) + hw, Math.max(z0, z1) + hw);
        }
        continue;
      }
      liftRoad(r);
    }
    for (const w of d.water) {
      const hs = w.o.map(([x, z]) => baseHeight(x, z));
      if (hs.filter((h) => h < FLOOR + 0.5).length > hs.length * 0.5) w.h = WATER; // 탄천 수면 폴리곤 -> 수면 높이로
    }
    for (const l of d.waterLines) {
      const dense = densify(l.p, 4);
      l.p = dense.map(([x, z]) => [x, z, waterLineY(x, z)]);
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
    const coveredMain = (x, z) => { const q = project(x, z); if (!q || q.end) return false; const p = profAt(q); return Math.abs(q.d) < p.top + MARGIN; };
    const covered = streams ? (x, z) => coveredMain(x, z) || streams.covered(x, z) : coveredMain;
    const axS = ax.filter((_, i) => i % 5 === 0);
    const nearMain = (x, z, r) => { const lim = (r + 140) ** 2; for (const [px, pz] of axS) if ((px - x) ** 2 + (pz - z) ** 2 < lim) return true; return false; };
    function holeyPlane(x0, z0, x1, z1, y, minCell) {
      const pos = [];
      const quad = (a, b, c, d) => pos.push(a, y, b, a, y, d, c, y, b, c, y, b, a, y, d, c, y, d);
      // 돌려주는 값: 구멍 없이 다 채워졌나. [streams] 지류 때문에만 쪼갠 셀은 네 조각이 다 채워지면 한 장으로 되돌림
      // (평면이라 모양 그대로, 본류 근처 격자는 streams=0 과 똑같이)
      const rec = (a, b, c, d) => {
        const w = c - a, cx = (a + c) / 2, cz = (b + d) / 2, rad = Math.hypot(w, d - b) / 2;
        const main = nearMain(cx, cz, rad);
        if (!main && !(streams && streams.near(cx, cz, rad))) { quad(a, b, c, d); return true; }
        if (w <= minCell) { if ([[a, b], [c, b], [a, d], [c, d], [cx, cz]].every(([x, z]) => covered(x, z))) return false; quad(a, b, c, d); return true; }
        const start = pos.length;
        const full = rec(a, b, cx, cz) & rec(cx, b, c, cz) & rec(a, cz, cx, d) & rec(cx, cz, c, d);
        if (full && !main) { pos.length = start; quad(a, b, c, d); }
        return !!full;
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
        else if (ad > p.toe + 0.01) { const pk = parkAt(x, z); c = ((FLOOR + (MD ? dzI(i) : 0)) / (p.top - p.toe) < -1.0) ? cWall : pk && pk.p.k !== 'grass' ? tmpc.copy(cSlope).lerp(pk.col, 0.5) : cSlope; }
        else if (ad > p.w + 1.2) { const pk = parkAt(x, z); c = pk ? pk.col : cFlood; }
        else if (ad > p.w - 1) c = cBank; else c = cBed;
        col.push(c.r, c.g, c.b);
      }
    }
    // [streams] 본류 메시 색 규칙을 임의 점에서 (합류부 쪼갠 사각형 · 지류 메시의 본류 구간 정점)
    const mainColor = (x, z, h) => {
      const q = project(x, z), p = q && !q.end ? profAt(q) : null, ad = q ? Math.abs(q.d) : 0;
      if (!p || h > -0.02) return inBox(x, z) ? cBlock : cGround;
      if (ad > p.toe + 0.01) { const pk = parkAt(x, z); return (FLOOR + dzQ(q)) / (p.top - p.toe) < -1.0 ? cWall : pk && pk.p.k !== 'grass' ? tmpc.copy(cSlope).lerp(pk.col, 0.5) : cSlope; }
      if (ad > p.w + 1.2) { const pk = parkAt(x, z); return pk ? pk.col : cFlood; }
      return ad > p.w - 1 ? cBank : cBed;
    };
    // [streams] 지류가 본류보다 낮은(지배하는) 점이 걸린 사각형은 빼고 지류 메시가 그림 (합류부)
    const dominated = streams ? (x, z) => { const s = streams.height(x, z); return s < -0.02 && s < mainBase(x, z) - 0.02; } : null;
    // 네 모서리(xz) 사각형의 9점(모서리·변 중점·중심) 중 하나라도 지배되면 true
    const domPts = (q) => [...q, [(q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2], [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2], [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2], [(q[3][0] + q[1][0]) / 2, (q[3][1] + q[1][1]) / 2], [(q[3][0] + q[2][0]) / 2, (q[3][1] + q[2][1]) / 2]].some(([x, z]) => dominated(x, z));
    const SUB = 4;
    let droppedQuads = 0, subQuads = 0;
    for (let r = 1; r < rows.length; r++) for (let c = 1; c < C; c++) {
      const a = (r - 1) * C + c - 1, b = a + 1, d = r * C + c - 1, e = d + 1;
      const q = [a, b, d, e].map((k) => [pos[k * 3], pos[k * 3 + 2]]);
      if (!dominated || !domPts(q)) { idx.push(a, d, b, b, d, e); continue; }
      // 지배된 사각형: SUB×SUB 로 쪼개 지배 안 된 조각만 본류 높이·색으로 남김 (지류 메시 가장자리와 틈 없게)
      droppedQuads++;
      const at = (u, v) => [q[0][0] * (1 - u) * (1 - v) + q[1][0] * u * (1 - v) + q[2][0] * (1 - u) * v + q[3][0] * u * v, q[0][1] * (1 - u) * (1 - v) + q[1][1] * u * (1 - v) + q[2][1] * (1 - u) * v + q[3][1] * u * v];
      // 정점은 남는 조각이 쓰는 것만 만든다 (지배된 조각이 대부분이라 25점 다 만들면 버퍼만 큼)
      const xz = [], vid = new Int32Array((SUB + 1) * (SUB + 1)).fill(-1);
      for (let j = 0; j <= SUB; j++) for (let k = 0; k <= SUB; k++) xz.push(at(k / SUB, j / SUB));
      const V = (j, k) => {
        const n = j * (SUB + 1) + k;
        if (vid[n] < 0) { const [x, z] = xz[n], h = renderHeight(x, z), cc = mainColor(x, z, h); vid[n] = pos.length / 3; pos.push(x, h > -0.02 ? 0.005 : h, z); col.push(cc.r, cc.g, cc.b); }
        return vid[n];
      };
      for (let j = 0; j < SUB; j++) for (let k = 0; k < SUB; k++) {
        if (domPts([xz[j * (SUB + 1) + k], xz[j * (SUB + 1) + k + 1], xz[(j + 1) * (SUB + 1) + k], xz[(j + 1) * (SUB + 1) + k + 1]])) continue;
        const sa = V(j, k), sb = V(j, k + 1), sd = V(j + 1, k), se = V(j + 1, k + 1);
        idx.push(sa, sd, sb, sb, sd, se); subQuads++;
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.setIndex(idx); cg.computeVertexNormals();
    // 축 방향에 따라 삼각형 감김이 뒤집힐 수 있으니 양면
    const channel = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    channel.receiveShadow = true; channel.name = 'tancheon-terrain'; scene.add(channel);
    // [streams] 지류 하도 + 수면 (메시 1개, 본류와 같은 재질 종류)
    let streamMesh = null;
    if (streams) {
    const sg = streams.buildGeometry({ renderHeight, mainBase, dominated, mainColor, colors: { cGround, cFlood, cSlope, cBank, cBed, cWater: new THREE.Color('#7ec3e6') } });
      if (sg) {
        streamMesh = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        streamMesh.receiveShadow = true; streamMesh.name = 'stream-terrain'; scene.add(streamMesh);
        Object.assign(streamMesh.userData, { droppedMainQuads: droppedQuads, mainSubQuads: subQuads });
      }
    }

    // 3) 계단 (디딤판 + 옆벽 + 난간)
    const tread = [], cheek = [], rail = [];
    const box = (arr, w, h, l, x, y, z, yaw, pitch = 0) => { const g = new THREE.BoxGeometry(w, h, l); if (pitch) g.rotateX(pitch); g.rotateY(yaw); g.translate(x, y, z); arr.push(g); };
    const cyl = (arr, r, len, x0, y0, z0, x1, y1, z1) => {
      const g = new THREE.CylinderGeometry(r, r, len, 6), v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); arr.push(g);
    };
    for (const s of allStairs) {
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
      if (overlay) { const [lx, lz] = W(s.L * 0.15, 0); overlay.add({ cls: 'label stairs', text: `🪜 ${s.river || '탄천'} 계단${s.osm ? '' : ' (위치 근사)'}`, getPos: () => new THREE.Vector3(lx, s.h0 + 2.6, lz), maxDist: 55 }); }
    }
    const addMerged = (arr, color, cast = true) => { if (!arr.length) return null; const m = new THREE.Mesh(mergeGeometries(arr), new THREE.MeshLambertMaterial({ color })); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
    addMerged(tread, '#d3cdc0'); addMerged(cheek, '#b4aea2'); addMerged(rail, '#5f6b78');

    // 3b) 징검다리 돌: 칠각 기둥 하나를 InstancedMesh 로 (그리기 1번). 윗면 평평, 밑은 하상까지
    let stoneMesh = null;
    const nStones = fords.reduce((n, f) => n + f.stones.length, 0);
    if (nStones) {
      const g = new THREE.CylinderGeometry(0.5, 0.56, 1, 7, 1); g.translate(0, -0.5, 0); // 윗면 y = 0
      stoneMesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), nStones);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), cc = new THREE.Color();
      let k = 0, sd2 = 7; const rr = () => ((sd2 = (sd2 * 16807) % 2147483647) / 2147483647);
      for (const f of fords) for (const [x, z] of f.stones) {
        const depth = f.h - baseHeight(x, z) + 0.3;
        e.set(0, f.yaw + (rr() - 0.5) * 0.3, 0); q.setFromEuler(e);
        m.compose(v.set(x, f.h, z), q, sc.set(STONE.across * (0.92 + rr() * 0.16), depth, STONE.along * (0.92 + rr() * 0.16)));
        stoneMesh.setMatrixAt(k, m); stoneMesh.setColorAt(k, cc.set('#a29d92').offsetHSL(0, 0, (rr() - 0.5) * 0.08)); k++;
      }
      stoneMesh.castShadow = false; stoneMesh.receiveShadow = true; // 그림자 패스 없음 → 그리기 1번
      stoneMesh.instanceMatrix.needsUpdate = true; stoneMesh.computeBoundingSphere();
      stoneMesh.name = 'stepping-stones'; scene.add(stoneMesh);
      if (overlay) for (const f of fords) { const lx = (f.ax + f.bx) / 2, lz = (f.az + f.bz) / 2; overlay.add({ cls: 'label stairs', text: `🪨 ${f.river} 징검다리`, getPos: () => new THREE.Vector3(lx, f.h + 2.2, lz), maxDist: 45 }); }
    }

    // 4) 다리 구조물: 상판 두께 + 교각 + 난간 (도로 리본은 world.js 가 그대로 그림)
    const slab = [], pier = [], para = [];
    const bridgeRoads = [...new Set(decks.map((d) => d.road).filter(Boolean))];
    // [bridgeLights] 저녁 조명용 상판 조각/교각 기록. 본류(탄천) 차도교·신기교 = major, 지류 다리·보행교 = minor
    const lightPieces = [], lightPiers = [];
    const overMain = (r) => { // 탄천 본류 둔치/수로 위를 지나는가 (지류만 건너는 다리는 false)
      for (let i = 1; i < r.p.length; i++) {
        const [x0, z0] = r.p[i - 1], [x1, z1] = r.p[i], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2);
        for (let k = 0; k <= n; k++) if (mainBase(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n) < FLOOR + 0.5) return true;
      }
      return false;
    };
    const lightTier = (r) => ((!FOOT.has(r.k) || r.arch) && overMain(r) ? 'major' : 'minor');
    const lightSeed = (r) => { const m = r.p[0]; return (((Math.round(m[0]) * 73856093) ^ (Math.round(m[1]) * 19349663)) >>> 0) / 4294967296; };
    function buildArched(r) {
      const th = 0.5, pts = r.p, cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      for (let i = 1; i < pts.length; i++) {
        const [x0, z0, h0, w0] = pts[i - 1], [x1, z1, h1, w1] = pts[i];
        const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.05) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(ux, uz), rx = -uz, rz = ux;
        const hm = (h0 + h1) / 2, wm = ((w0 || r.w) + (w1 || r.w)) / 2;
        if (!(baseHeight(x0, z0) < hm - 0.4 || baseHeight(x1, z1) < hm - 0.4)) continue;
        const slope = Math.hypot(L, h1 - h0), pitch = Math.atan2(h0 - h1, L);
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        box(slab, wm, th, slope + 0.12, mx, hm + 0.06 - th / 2, mz, yaw, pitch);
        lightPieces.push({ x0, z0, h0, x1, z1, h1, W: wm, th, foot: true, tier: lightTier(r), s0: cum[i - 1], seed: lightSeed(r) });
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
            for (const k of spots) { box(pier, 0.7, top - g + 0.5, 0.7, x + rx * k * w, (top + g - 0.5) / 2, z + rz * k * w, yaw); lightPiers.push({ x: x + rx * k * w, z: z + rz * k * w, g, top, pw: 0.7, yaw, tier: lightTier(r) }); }
          }
          next += 22;
        }
        dist += L;
      }
    }
    for (const r of bridgeRoads) {
      if (r.arch) { buildArched(r); continue; }
      const foot = FOOT.has(r.k), th = foot ? 0.5 : 1.1, h = r.deckH, W = r.deckW || r.w, tier = lightTier(r), seed = lightSeed(r);
      let sAcc = 0;
      for (let i = 1; i < r.p.length; i++) {
        const [x0, z0] = r.p[i - 1], [x1, z1] = r.p[i], L = Math.hypot(x1 - x0, z1 - z0), s0 = sAcc; sAcc += L; if (L < 0.2) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(ux, uz), rx = -uz, rz = ux;
        // 하천 위(지면이 낮은 구간)만 상판/난간 — 제방 위 도로 구간엔 안 그림
        // [pangyo-water] 낮은 보도교(h<FLOOR/2): 둔치 높이가 구간마다 달라 그 자리 둔치(floorAt) 기준 — 꺼지면 예전 식
        const spans = []; let st0 = null;
        for (let u = 0; u <= L + 0.01; u += 1) { const qx = x0 + ux * u, qz = z0 + uz * u, low = MD && h < FLOOR / 2 ? baseHeight(qx, qz) < floorAt(qx, qz) - 0.01 : baseHeight(qx, qz) < h - 0.4; if (low && st0 == null) st0 = u; if (!low && st0 != null) { spans.push([st0, u]); st0 = null; } }
        if (st0 != null) spans.push([st0, L]);
        for (let [u0, u1] of spans) {
          u0 = Math.max(0, u0 - 1.5); u1 = Math.min(L, u1 + 1.5); const l = u1 - u0, mx = x0 + ux * (u0 + u1) / 2, mz = z0 + uz * (u0 + u1) / 2;
          box(slab, W, th, l, mx, h + 0.06 - th / 2, mz, yaw);
          lightPieces.push({ x0: x0 + ux * u0, z0: z0 + uz * u0, h0: h, x1: x0 + ux * u1, z1: z0 + uz * u1, h1: h, W, th, foot, tier, s0: s0 + u0, seed });
          for (const side of [-1, 1]) box(para, 0.22, foot ? 1.0 : 0.7, l, mx + rx * side * (W / 2 - 0.05), h + (foot ? 0.55 : 0.4), mz + rz * side * (W / 2 - 0.05), yaw);
        }
        // 교각: 하천 안쪽에서 약 22m 간격
        for (let s = 11; s < L; s += 22) {
          const px = x0 + ux * s, pz = z0 + uz * s, g = baseHeight(px, pz), top = h + 0.06 - th;
          if (g > top - 1.5) continue;
          const pw = foot ? 0.6 : 1.4, offs = W > 6 ? [0, -0.33, 0.33] : [0];
          for (const k of offs) { box(pier, pw, top - g + 0.5, pw, px + rx * k * W, (top + g - 0.5) / 2, pz + rz * k * W, yaw); lightPiers.push({ x: px + rx * k * W, z: pz + rz * k * W, g, top, pw, yaw, tier }); }
        }
      }
    }
    addMerged(slab, '#b9bcbf'); addMerged(pier, '#a7aaad'); addMerged(para, '#d5d8db');
    // 4b) 저녁 다리 조명 (가산 발광 사각형 한 메시). 수면: 본류 수로 안 = WATER, 지류 = 지류 수면
    const waterSurf = (x, z) => {
      const W = MD ? mainWater(x, z) : WATER; if (mainBase(x, z) < W - 0.05) return W; // [pangyo-water] 본류 수면 = 낙차 반영 (bridgeLights.js 는 그대로)
      const w = streams ? streams.waterAt(x, z) : null; return w != null && baseHeight(x, z) < w ? w : null;
    };
    const bridgeLights = buildBridgeLights(scene, { pieces: lightPieces, piers: lightPiers, waterAt: waterSurf });

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
    return { channel, streamMesh, stoneMesh, bridgeLights, treeCount: tp.length };
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
  return { params: P, baseHeight, renderHeight, getGroundHeight, groundY: getGroundHeight, getVehicleHeight, vehicleY: getVehicleHeight, deckAt, canMove, annotate, liftRoads, waterLineY, streams, build, stairs, decks, addDeckSegment, addGroundExtra, project, riversideRoute, bankPath, stairAt, fords, fordAt, grade, waterSurface, mainDrop: MD ? mainDrop : null, mainDropBox: dropBox, floorAt, mainWater };
}
