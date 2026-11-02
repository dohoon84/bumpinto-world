// [streams] 탄천 지류 하도 깊이 (여수천·분당천·운중천 …). 데이터: public/corridor/streams.json (scripts/corridor/build-streams.mjs)
//   코리더가 켜지고 ?streams=0 이 아닐 때만 terrain.js 가 만든다. 없으면 terrain 은 예전과 완전히 같다.
//   높이 = min(탄천 본류, 각 지류). 지류 단면은 본류와 같은 꼴(제방 경사 → 둔치 → 물가 → 하상)이고 깊이만 얕다:
//     둔치 F = −D (하천별 근사, 1.6~3.8m), 수면 W = F − 0.4, 하상 B = F − 1.0
//   합류부: 받는 하천(탄천 또는 다른 지류) 띠에 들어가기 전 RAMP(60m) 동안 받는 하천 둔치 높이까지 서서히 깊어지고,
//   그 안에서는 받는 하천 둔치와 같은 높이(물길은 수면 리본만) → 제방을 깎고 내려가 본류 둔치를 건너 본류 수면에 닿는다.
//   sc[i] (0..1): 차도·건물이 덮는 곳(복개/암거)과 상류 끝에서 0 → 지면 높이 0 (차가 빠지지 않음)
import * as THREE from 'three';

const smoothstep = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// 행 줄이기 (축을 따라 늘어선 단면 행 rows[a..b], 행마다 C 정점 p(xyz)·cl(rgb)). 남길 행 번호 배열을 돌려줌.
//   a 에서 시작해 갈 수 있는 가장 먼 행까지 한 칸으로: 사이 행의 정점 j 가 (a_j → b_j) 선분에서 수평 tolXZ·높이 tolY 안,
//   색은 a 와 같고, 칸 길이(가운데 정점 기준) ≤ maxSpan. lock 행은 항상 남김. a, b 도 남김.
//   edgeIn: 맨 바깥 두 열(0, C−1)은 선분이 안쪽(축 쪽)으로 edgeIn 넘게 들어오면 안 됨 — 바닥 평면 구멍을 덮는 가장자리라
//   (바깥쪽으로 나가는 건 EDGE_OUT 까지 허용: 평평한 0.005m 띠가 조금 더 겹칠 뿐)
const EDGE_OUT = 0.6;
function simplifyRows(rows, a, b, C, tolXZ, tolY, maxSpan, edgeIn = -1) {
  const mid = (C >> 1) * 3;
  const spanOk = (ra, rb) => {
    const A = rows[ra].p, B = rows[rb].p;
    if (Math.hypot(B[mid] - A[mid], B[mid + 2] - A[mid + 2]) > maxSpan) return false;
    for (let k = ra + 1; k <= rb; k++) { const ca = rows[ra].cl, ck = rows[k].cl; for (let j = 0; j < C * 3; j++) if (Math.abs(ck[j] - ca[j]) > 1e-4) return false; }
    for (let k = ra + 1; k < rb; k++) {
      const Q = rows[k].p;
      for (let j = 0; j < C * 3; j += 3) {
        const ex = B[j] - A[j], ez = B[j + 2] - A[j + 2], L2 = ex * ex + ez * ez;
        if (L2 < 1e-8) return false;
        const qx = Q[j] - A[j], qz = Q[j + 2] - A[j + 2], u = (qx * ex + qz * ez) / L2;
        if (u < 0 || u > 1) return false;
        if (edgeIn >= 0 && (j === 0 || j === (C - 1) * 3)) {
          // 안쪽 = 옆 열 쪽. (선분 위 점 − Q) 가 안쪽으로 얼마나 들어왔나
          const n = j === 0 ? 3 : -3, ix = Q[j + n] - Q[j], iz = Q[j + n + 2] - Q[j + 2], il = Math.hypot(ix, iz) || 1;
          const inward = ((A[j] + ex * u - Q[j]) * ix + (A[j + 2] + ez * u - Q[j + 2]) * iz) / il;
          if (inward > edgeIn || -inward > EDGE_OUT) return false;
        } else if (Math.abs(qx * ez - qz * ex) / Math.sqrt(L2) > tolXZ) return false;
        if (Math.abs(Q[j + 1] - (A[j + 1] + (B[j + 1] - A[j + 1]) * u)) > tolY) return false;
      }
    }
    return true;
  };
  const out = [a];
  for (let s = a; s < b;) {
    let e = s + 1;
    while (e < b && !rows[e].lock && spanOk(s, e + 1)) e++;
    out.push(e); s = e;
  }
  return out;
}

export function createStreams(S, { P, mainBase }) {
  const SP = S.meta.params;
  const list = S.streams.map((s) => ({ ...s, N: s.axis.length }));
  const byId = new Map(list.map((s) => [s.id, s]));
  // 받는 하천 먼저 (탄천 → 지류 → 지류의 지류)
  const depth = (s, k = 0) => (s.into && s.into !== 'tancheon' && byId.has(s.into) && k < 5 ? 1 + depth(byId.get(s.into), k + 1) : 0);
  list.sort((a, b) => depth(a) - depth(b));

  // ---- 축 투영: 하천마다 자기 bbox 의 20m 격자(CSR, 타입 배열). 칸 → 그 칸에서 R 안에 있는 구간 번호 ----
  const CELL = 20;
  for (const s of list) {
    let mt = 0; for (const k of ['topL', 'topR']) for (const v of s.prof[k]) mt = Math.max(mt, v);
    const R = mt + SP.MARGIN + 2, ax = s.axis, N = s.N;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ax) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const gx0 = Math.floor((x0 - R) / CELL), gz0 = Math.floor((z0 - R) / CELL), nx = Math.floor((x1 + R) / CELL) - gx0 + 1, nz = Math.floor((z1 + R) / CELL) - gz0 + 1;
    s.segL = new Float32Array(N);
    for (let i = 0; i < N - 1; i++) s.segL[i] = Math.hypot(ax[i + 1][0] - ax[i][0], ax[i + 1][1] - ax[i][1]) || 1e-6;
    // 두 번 돌기: 칸별 개수 → 시작 위치 → 채우기 (구간 순서는 예전 Map 배열과 같음: i 오름차순)
    const start = new Uint32Array(nx * nz + 1);
    const eachCell = (i, fn) => { const [x, z] = ax[i]; for (let gx = Math.floor((x - R) / CELL); gx <= Math.floor((x + R) / CELL); gx++) for (let gz = Math.floor((z - R) / CELL); gz <= Math.floor((z + R) / CELL); gz++) fn((gx - gx0) * nz + (gz - gz0)); };
    for (let i = 0; i < N - 1; i++) eachCell(i, (c) => start[c + 1]++);
    for (let c = 0; c < nx * nz; c++) start[c + 1] += start[c];
    const segs = new Uint16Array(start[nx * nz]), fill = start.slice(0, nx * nz);
    for (let i = 0; i < N - 1; i++) eachCell(i, (c) => { segs[fill[c]++] = i; });
    s.grid = { gx0, gz0, nx, nz, start, segs };
  }
  // (x, z) 가 든 칸 번호 (구간 범위 start[c] .. start[c + 1]) — bbox 밖이거나 빈 칸이면 -1
  function cellOf(s, x, z) {
    const G = s.grid, gx = Math.floor(x / CELL) - G.gx0, gz = Math.floor(z / CELL) - G.gz0;
    if (gx < 0 || gz < 0 || gx >= G.nx || gz >= G.nz) return -1;
    const c = gx * G.nz + gz;
    return G.start[c] < G.start[c + 1] ? c : -1;
  }
  function projectOne(s, c, x, z) {
    const ax = s.axis, { segs, start } = s.grid; let best = null, bd = Infinity;
    for (let k = start[c], kE = start[c + 1]; k < kE; k++) {
      const i = segs[k];
      const ax0 = ax[i][0], az0 = ax[i][1], dx = ax[i + 1][0] - ax0, dz = ax[i + 1][1] - az0, L2 = dx * dx + dz * dz || 1e-9;
      const t = ((x - ax0) * dx + (z - az0) * dz) / L2;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t, px = ax0 + dx * tc, pz = az0 + dz * tc, dist = Math.hypot(x - px, z - pz);
      if (dist < bd) { bd = dist; best = { i, t: tc, dist, d: -(dx * (z - az0) - dz * (x - ax0)) / s.segL[i], end: (t < -0.05 && i === 0) || (t > 1.05 && i === s.N - 2) }; }
    }
    return best;
  }
  const lerpA = (a, q, N) => a[q.i] * (1 - q.t) + a[Math.min(N - 1, q.i + 1)] * q.t;
  function profOf(s, q) {
    const sd = q.d < 0 ? 'L' : 'R', p = s.prof;
    return { toe: lerpA(p['toe' + sd], q, s.N), top: lerpA(p['top' + sd], q, s.N), w: lerpA(p['w' + sd], q, s.N), sc: lerpA(s.sc, q, s.N), F: lerpA(s.F, q, s.N), B: lerpA(s.B, q, s.N) };
  }
  function hProfile(ad, p) {
    if (ad >= p.top) return 0;
    if (ad >= p.toe) return (p.F * (p.top - ad)) / (p.top - p.toe);
    if (ad >= p.w + 1.2) return p.F;
    if (ad >= p.w - 1) return p.B + ((p.F - p.B) * (ad - (p.w - 1))) / 2.2;
    return p.B;
  }
  // 하천 하나의 높이 (levels 계산 전에는 쓰지 않음)
  function heightOne(s, x, z) {
    const c = cellOf(s, x, z); if (c < 0) return 0;
    const q = projectOne(s, c, x, z); if (!q || q.end) return 0;
    const p = profOf(s, q); if (p.sc <= 0 || Math.abs(q.d) >= p.top) return 0;
    return hProfile(Math.abs(q.d), p) * p.sc;
  }

  // ---- 단면 높이(F/W/B) + 합류 램프 ----
  const RN = Math.round(SP.RAMP / SP.STEP);
  for (const s of list) {
    const N = s.N, F = (s.F = new Float32Array(N)), W = (s.W = new Float32Array(N)), B = (s.B = new Float32Array(N));
    const recv = s.into === 'tancheon' ? { h: mainBase, F: () => P.FLOOR } : s.into && byId.get(s.into)?.F ? (() => {
      const r = byId.get(s.into);
      return { h: (x, z) => heightOne(r, x, z), F: (x, z) => { let bi = 0, bd = Infinity; r.axis.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; bi = i; } }); return r.F[bi]; } };
    })() : null;
    let iE = -1;
    if (recv) for (let i = 0; i < N; i++) if (recv.h(s.axis[i][0], s.axis[i][1]) < -0.05) { iE = i; break; }
    // 합류 직전이 복개(암거)면 램프 없이 그 하천 깊이 그대로 끝남 (sc 가 0 으로 메움)
    if (iE >= 0) for (let i = Math.max(0, iE - 10); i <= Math.min(N - 1, iE + 5); i++) if (s.sc[i] < 0.99) { iE = -1; break; }
    const FT = iE >= 0 ? Math.min(-s.D, recv.F(...s.axis[iE])) : -s.D;
    s.iE = iE;
    for (let i = 0; i < N; i++) {
      const f = iE < 0 ? 0 : smoothstep((i - (iE - RN)) / RN);
      F[i] = -s.D + (FT + s.D) * f;
      W[i] = F[i] - (SP.WATER_D + (0.02 - SP.WATER_D) * f);
      B[i] = F[i] - (SP.BED_D + (0.05 - SP.BED_D) * f);
    }
  }

  // ---- 공개 함수 ----
  function forEachNear(x, z, fn) {
    for (const s of list) { const c = cellOf(s, x, z); if (c < 0) continue; const q = projectOne(s, c, x, z); if (q && !q.end) fn(s, q); }
  }
  // 모든 지류의 최저 높이 (≤ 0)
  function height(x, z) {
    let h = 0;
    forEachNear(x, z, (s, q) => { const p = profOf(s, q); if (p.sc > 0 && Math.abs(q.d) < p.top) h = Math.min(h, hProfile(Math.abs(q.d), p) * p.sc); });
    return h;
  }
  // 수면 높이(수면 리본과 같은 W + 0.02). 메우지 않은 지류의 물가(w + 1.2) 안일 때만, 아니면 null
  function waterAt(x, z) {
    let y = null;
    forEachNear(x, z, (s, q) => { const p = profOf(s, q); if (p.sc > 0.99 && Math.abs(q.d) < p.w + 1.2) { const w = lerpA(s.W, q, s.N) + 0.02; if (y == null || w < y) y = w; } });
    return y;
  }
  // 바닥 평면 구멍 (top + MARGIN, 메운 곳 제외)
  function covered(x, z) {
    let c = false;
    forEachNear(x, z, (s, q) => { if (c) return; const p = profOf(s, q); if (p.sc > 0.01 && Math.abs(q.d) < p.top + SP.MARGIN) c = true; });
    return c;
  }
  // 하도 띠 안(top 안)
  function inBand(x, z) {
    let c = false;
    forEachNear(x, z, (s, q) => { if (c) return; const p = profOf(s, q); if (p.sc > 0.01 && Math.abs(q.d) < p.top) c = true; });
    return c;
  }
  // 바닥 평면 사분할용: 원(cx, cz, rad)이 어떤 지류 띠(top + MARGIN, 메운 곳 제외)에 닿을 수 있는지.
  //   보수적 판정: false 면 그 원 안에 covered() 점이 없다 → 그 칸은 쪼개지 않고 사각형 1개로 둔다.
  //   1) 50m 칸 근사(칸 샘플의 최대 폭)로 거르고, 2) 작은 원은 축 구간까지의 실제 거리로 다시 본다
  //      → 띠 가장자리를 지나는 칸만 minCell 까지 쪼개짐 (예전엔 띠 둘레 50~70m 를 다 잘게 쪼갬)
  const NC = 50, nearCells = new Map();
  for (const s of list) for (let i = 0; i < s.N; i++) {
    const [x, z] = s.axis[i], k = Math.floor(x / NC) + ',' + Math.floor(z / NC);
    const reach = Math.max(s.prof.topL[i], s.prof.topR[i]) + SP.MARGIN + 2;
    if (!(nearCells.get(k) >= reach)) nearCells.set(k, reach);
  }
  let REACH = 0; for (const v of nearCells.values()) REACH = Math.max(REACH, v);
  function nearCoarse(cx, cz, rad) {
    const r = rad + REACH;
    for (let gx = Math.floor((cx - r) / NC); gx <= Math.floor((cx + r) / NC); gx++) for (let gz = Math.floor((cz - r) / NC); gz <= Math.floor((cz + r) / NC); gz++) {
      const reach = nearCells.get(gx + ',' + gz); if (reach == null) continue;
      const dx = Math.max(gx * NC - cx, 0, cx - (gx + 1) * NC), dz = Math.max(gz * NC - cz, 0, cz - (gz + 1) * NC);
      if (Math.hypot(dx, dz) < rad + reach) return true;
    }
    return false;
  }
  // 구간 i 가 덮을 수 있는 최대 거리 (구간 양끝 top 최대 + MARGIN) × 꺾임 여유 + 1m. sc 가 둘 다 ≤ 0.01(메움)이면 −1
  //   covered 는 고른 구간 직선까지의 수직 거리 |d| 로 재므로, 꺾이는 점 바깥쪽 쐐기에선 실제 거리가 |d| / cos(꺾임) 까지 클 수 있음
  for (const s of list) {
    const ax = s.axis, N = s.N, pr = s.prof; let turn = 0;
    for (let i = 1; i < N - 1; i++) {
      const ux = ax[i][0] - ax[i - 1][0], uz = ax[i][1] - ax[i - 1][1], vx = ax[i + 1][0] - ax[i][0], vz = ax[i + 1][1] - ax[i][1];
      turn = Math.max(turn, Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz)));
    }
    const bend = 1 / Math.cos(Math.min(turn, 1.2));
    s.segReach = new Float32Array(Math.max(0, N - 1));
    for (let i = 0; i < N - 1; i++) s.segReach[i] = Math.max(s.sc[i], s.sc[i + 1]) > 0.01 ? (Math.max(pr.topL[i], pr.topR[i], pr.topL[i + 1], pr.topR[i + 1]) + SP.MARGIN) * bend + 1 : -1;
  }
  const FINE = 64; // 이보다 큰 원은 근사만 (어차피 더 쪼개짐)
  function near(cx, cz, rad) {
    if (!nearCoarse(cx, cz, rad)) return false;
    if (rad > FINE) return true;
    for (const s of list) {
      const G = s.grid, ax = s.axis;
      const ga = Math.max(0, Math.floor((cx - rad) / CELL) - G.gx0), gb = Math.min(G.nx - 1, Math.floor((cx + rad) / CELL) - G.gx0);
      const ha = Math.max(0, Math.floor((cz - rad) / CELL) - G.gz0), hb = Math.min(G.nz - 1, Math.floor((cz + rad) / CELL) - G.gz0);
      for (let gx = ga; gx <= gb; gx++) for (let gz = ha; gz <= hb; gz++) {
        const c = gx * G.nz + gz;
        for (let k = G.start[c], kE = G.start[c + 1]; k < kE; k++) {
          const i = G.segs[k], r = s.segReach[i]; if (r < 0) continue;
          const x0 = ax[i][0], z0 = ax[i][1], dx = ax[i + 1][0] - x0, dz = ax[i + 1][1] - z0;
          const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cz - z0) * dz) / (dx * dx + dz * dz || 1e-9)));
          if (Math.hypot(cx - x0 - dx * t, cz - z0 - dz * t) < rad + r) return true;
        }
      }
    }
    return false;
  }

  // ---- 메시: 하천마다 단면 격자 + 수면 리본 (정점 색, 한 지오메트리) ----
  //   본류 메시와 겹치는 곳: 지류가 더 낮은(지배하는) 곳은 terrain.js 가 본류 삼각형을 빼고, 지류 메시는 2cm 위에 그려 z-fighting 없음
  //   행 줄이기: 단면이 축을 따라 거의 그대로인 구간(곧은 하도, 평평한 하상·둔치·지면)은 사이 행을 뺀다.
  //     뺀 행의 모든 정점이 남은 두 행을 잇는 선분에서 수평 TOL_XZ, 높이 TOL_Y 안이고 색이 같을 때만. 한 칸은 MAX_SPAN 까지.
  //     본류 띠·다른 지류 띠·계단에 걸린 행은 그대로 둔다(겹치는 메시와 높이가 어긋나지 않게).
  //   맨 바깥 열은 top + MARGIN + EDGE_PAD 에 두고, 줄인 선분이 원래 정점보다 EDGE_IN 넘게 안쪽으로 못 들어오게:
  //     바닥 구멍(top + MARGIN 안)을 덮는 가장자리가 줄이기 전보다 항상 EDGE_PAD − EDGE_IN 만큼 더 바깥
  const TOL_XZ = 0.2, TOL_Y = 0.05, MAX_SPAN = 48, EDGE_PAD = 0.5, EDGE_IN = 0.4, W_TOL_XZ = 0.08, W_TOL_Y = 0.02;
  function buildGeometry({ renderHeight, dominated, mainColor, colors: c }) {
    const pos = [], col = [], idx = [], tmp = new THREE.Color();
    // 단면이 구간별 직선(하상 → 물가 → 둔치 → 제방 → 지면)이라 꺾이는 점만 + 제방 색을 위해 둑마루 바로 안쪽 1열: 한쪽 7열
    //   [거리, 색] — 색은 정점 단위라 구간 경계 정점이 그 구간 색을 맡는다
    const colsFor = (toe, top, w) => {
      const wb = Math.max(0.3, w - 1), wt = Math.max(wb + 0.2, Math.min(toe - 0.3, w + 1.2));
      return [[0, c.cBed], [wb, c.cBed], [wt, c.cBank], [toe, c.cFlood], [Math.max(toe + 0.01, top - 0.05), c.cSlope], [top, c.cGround], [top + SP.MARGIN + EDGE_PAD, c.cGround]];
    };
    // 다른 하천(본류·다른 지류)이나 계단이 높이를 정하거나, 다른 지류 메시가 덮는 점
    const foreign = (s, x, z, h) => {
      if (mainBase(x, z) < 0 || h < heightOne(s, x, z) - 1e-4) return true;
      let o = false;
      forEachNear(x, z, (s2, q) => { if (o || s2 === s) return; const p = profOf(s2, q); if (p.sc > 0.01 && Math.abs(q.d) < p.top + SP.MARGIN) o = true; });
      return o;
    };
    const emit = (rows, ks, C) => {
      let prev = -1;
      for (const k of ks) {
        const { p, cl } = rows[k], base = pos.length / 3;
        for (let j = 0; j < C * 3; j++) { pos.push(p[j]); col.push(cl[j]); }
        if (prev >= 0) for (let j = 1; j < C; j++) { const a = prev + j - 1, b = a + 1, d = base + j - 1, e = d + 1; idx.push(a, d, b, b, d, e); }
        prev = base;
      }
      return ks.length;
    };
    let rowsN = 0, rowsIn = 0, waterTris = 0;
    for (const s of list) {
      const ax = s.axis, N = s.N, pr = s.prof;
      const nrm = (i) => { const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; };
      // 행 후보: ROW 샘플마다, sc 가 바뀌는 곳은 매 샘플. 지류가 본류보다 낮은 점이 하나라도 있는 행 ± 3행만
      const cand = [];
      const ROW = 3; // 6m 마다 (축은 이미 ±8m 로 매끈하게 만든 것)
      for (let i = 0; i < N; i++) if (i % ROW === 0 || i === N - 1 || s.sc[i] !== s.sc[Math.max(0, i - 1)] || s.sc[i] !== s.sc[Math.min(N - 1, i + 1)]) cand.push(i);
      const mkRow = (i, ox = 0, oz = 0) => {
        const [nx, nz] = nrm(i);
        const Ls = colsFor(pr.toeL[i], pr.topL[i], pr.wL[i]), Rs = colsFor(pr.toeR[i], pr.topR[i], pr.wR[i]);
        const ds = [...Ls.slice(1).reverse().map(([d, cc]) => [-d, cc]), ...Rs];
        const p = new Float32Array(ds.length * 3), cl = new Float32Array(ds.length * 3);
        let dom = false, lock = false;
        ds.forEach(([d, cc], j) => {
          const x = ax[i][0] + ox + nx * d, z = ax[i][1] + oz + nz * d, h = renderHeight(x, z), dm = dominated(x, z);
          if (dm) dom = true;
          if (!lock && foreign(s, x, z, h)) lock = true;
          p[j * 3] = x; p[j * 3 + 1] = h > -0.02 ? 0.005 : h + 0.02; p[j * 3 + 2] = z;
          // 지류가 정하는 높이면 단면 색, 본류가 정하는 곳(합류부)이면 본류 메시와 같은 색
          tmp.copy(h > -0.02 ? c.cGround : dm ? cc : mainColor(x, z, h)); cl[j * 3] = tmp.r; cl[j * 3 + 1] = tmp.g; cl[j * 3 + 2] = tmp.b;
        });
        return { p, cl, dom, lock };
      };
      const rowData = cand.map((i) => mkRow(i));
      // 하류 끝 너머 2행(6m·12m): 합류부에서 본류 메시가 빠진 자리를 끝까지 덮음 (그 자리 높이는 본류 그대로)
      { const [tx, tz] = nrm(N - 1); for (const k of [1, 2]) { const r = mkRow(N - 1, -tz * 6 * k, tx * 6 * k); r.dom = false; r.lock = true; rowData.push(r); } }
      const keep = rowData.map((r, k) => { for (let j = Math.max(0, k - 3); j <= Math.min(rowData.length - 1, k + 3); j++) if (rowData[j].dom) return true; return false; });
      // 잠긴 행 바로 옆 행도 잠금 (겹침 구간 경계가 줄인 칸 안으로 들어가지 않게)
      const locked = rowData.map((r, k) => r.lock || rowData[k - 1]?.lock || rowData[k + 1]?.lock);
      rowData.forEach((r, k) => { r.lock = locked[k]; });
      const C = rowData[0]?.p.length / 3 || 0;
      for (let k = 0; k < rowData.length; k++) {
        if (!keep[k]) continue;
        let e = k; while (e + 1 < rowData.length && keep[e + 1]) e++;
        rowsIn += e - k + 1;
        rowsN += emit(rowData, simplifyRows(rowData, k, e, C, TOL_XZ, TOL_Y, MAX_SPAN, EDGE_IN), C);
        k = e;
      }
      // 수면 리본: sc≈1 인 연속 구간. 합류 뒤(받는 하천 띠 안)는 그 지형 위 3cm, 본류 수면에 닿으면 끝
      const wRows = [];
      const flush = () => { if (wRows.length >= 2) waterTris += 2 * (emit(wRows, simplifyRows(wRows, 0, wRows.length - 1, 2, W_TOL_XZ, W_TOL_Y, MAX_SPAN), 2) - 1); wRows.length = 0; };
      const wc = new Float32Array([c.cWater.r, c.cWater.g, c.cWater.b, c.cWater.r, c.cWater.g, c.cWater.b]);
      for (let i = 0; i < N; i++) {
        const [x, z] = ax[i];
        const inRiver = s.into === 'tancheon' && mainBase(x, z) < P.WATER - 0.2;
        if (s.sc[i] < 0.99 || inRiver) { flush(); continue; }
        if (i % 3 && i !== N - 1 && wRows.length && s.sc[i + 1] >= 0.99) continue;
        const [nx, nz] = nrm(i), hl = pr.wL[i] + 0.3, hr = pr.wR[i] + 0.3;
        const y = s.iE >= 0 && i >= s.iE ? Math.max(renderHeight(x, z) + 0.03, P.WATER + 0.01) : s.W[i] + 0.02;
        wRows.push({ p: new Float32Array([x - nx * hl, y, z - nz * hl, x + nx * hr, y, z + nz * hr]), cl: wc, lock: false });
      }
      flush();
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.userData = { rows: rowsN, rowsIn, waterTris };
    return g;
  }

  return { list, height, covered, inBand, near, waterAt, buildGeometry, stairs: S.stairs || [], bridges: S.bridges || [], fords: S.fords || [], params: SP };
}

// 코리더 타일/LOD 평면 레이어 교체 (하도 띠를 뺀 폴리곤) — build-streams.mjs 의 [원래 인덱스, 조각들]
export function applyTileCuts(j, rep, kind) {
  if (!j || !rep) return j;
  for (const [fld, list] of Object.entries(rep)) {
    const arr = j[fld]; if (!Array.isArray(arr)) continue;
    const m = new Map(list), out = [];
    arr.forEach((item, i) => {
      if (!m.has(i)) { out.push(item); return; }
      for (const piece of m.get(i)) {
        if (kind === 'lod') out.push(fld === 'p' ? [item[0], ...piece] : piece);
        else out.push({ ...item, o: piece.o, holes: piece.holes });
      }
    });
    j[fld] = out;
  }
  return j;
}
