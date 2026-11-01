// [streams] 탄천 지류 하도 깊이 (여수천·분당천·운중천 …). 데이터: public/corridor/streams.json (scripts/corridor/build-streams.mjs)
//   코리더가 켜지고 ?streams=0 이 아닐 때만 terrain.js 가 만든다. 없으면 terrain 은 예전과 완전히 같다.
//   높이 = min(탄천 본류, 각 지류). 지류 단면은 본류와 같은 꼴(제방 경사 → 둔치 → 물가 → 하상)이고 깊이만 얕다:
//     둔치 F = −D (하천별 근사, 1.6~3.8m), 수면 W = F − 0.4, 하상 B = F − 1.0
//   합류부: 받는 하천(탄천 또는 다른 지류) 띠에 들어가기 전 RAMP(60m) 동안 받는 하천 둔치 높이까지 서서히 깊어지고,
//   그 안에서는 받는 하천 둔치와 같은 높이(물길은 수면 리본만) → 제방을 깎고 내려가 본류 둔치를 건너 본류 수면에 닿는다.
//   sc[i] (0..1): 차도·건물이 덮는 곳(복개/암거)과 상류 끝에서 0 → 지면 높이 0 (차가 빠지지 않음)
import * as THREE from 'three';

const smoothstep = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

export function createStreams(S, { P, mainBase }) {
  const SP = S.meta.params;
  const list = S.streams.map((s) => ({ ...s, N: s.axis.length }));
  const byId = new Map(list.map((s) => [s.id, s]));
  // 받는 하천 먼저 (탄천 → 지류 → 지류의 지류)
  const depth = (s, k = 0) => (s.into && s.into !== 'tancheon' && byId.has(s.into) && k < 5 ? 1 + depth(byId.get(s.into), k + 1) : 0);
  list.sort((a, b) => depth(a) - depth(b));

  // ---- 축 투영 (하천별 격자를 한 맵에) ----
  const CELL = 20, grid = new Map();
  for (const s of list) {
    let mt = 0; for (const k of ['topL', 'topR']) for (const v of s.prof[k]) mt = Math.max(mt, v);
    const R = mt + SP.MARGIN + 2, ax = s.axis;
    s.segL = new Float32Array(s.N);
    for (let i = 0; i < s.N - 1; i++) {
      s.segL[i] = Math.hypot(ax[i + 1][0] - ax[i][0], ax[i + 1][1] - ax[i][1]) || 1e-6;
      const [x, z] = ax[i];
      for (let gx = Math.floor((x - R) / CELL); gx <= Math.floor((x + R) / CELL); gx++) for (let gz = Math.floor((z - R) / CELL); gz <= Math.floor((z + R) / CELL); gz++) {
        const k = gx + ',' + gz; let e = grid.get(k); if (!e) grid.set(k, (e = new Map()));
        let a = e.get(s); if (!a) e.set(s, (a = [])); a.push(i);
      }
    }
  }
  function projectOne(s, idxs, x, z) {
    const ax = s.axis; let best = null, bd = Infinity;
    for (const i of idxs) {
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
    const e = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); const idxs = e && e.get(s); if (!idxs) return 0;
    const q = projectOne(s, idxs, x, z); if (!q || q.end) return 0;
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
    const e = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!e) return;
    for (const [s, idxs] of e) { const q = projectOne(s, idxs, x, z); if (q && !q.end) fn(s, q); }
  }
  // 모든 지류의 최저 높이 (≤ 0)
  function height(x, z) {
    let h = 0;
    forEachNear(x, z, (s, q) => { const p = profOf(s, q); if (p.sc > 0 && Math.abs(q.d) < p.top) h = Math.min(h, hProfile(Math.abs(q.d), p) * p.sc); });
    return h;
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
  // 바닥 평면 사분할용: 원(cx,cz,rad)이 어떤 지류 띠(top + MARGIN) 에 닿을 수 있는지. 50m 격자 칸마다 그 칸 샘플의 최대 폭
  const NC = 50, nearCells = new Map();
  for (const s of list) for (let i = 0; i < s.N; i++) {
    const [x, z] = s.axis[i], k = Math.floor(x / NC) + ',' + Math.floor(z / NC);
    const reach = Math.max(s.prof.topL[i], s.prof.topR[i]) + SP.MARGIN + 2;
    if (!(nearCells.get(k) >= reach)) nearCells.set(k, reach);
  }
  let REACH = 0; for (const v of nearCells.values()) REACH = Math.max(REACH, v);
  function near(cx, cz, rad) {
    const r = rad + REACH;
    for (let gx = Math.floor((cx - r) / NC); gx <= Math.floor((cx + r) / NC); gx++) for (let gz = Math.floor((cz - r) / NC); gz <= Math.floor((cz + r) / NC); gz++) {
      const reach = nearCells.get(gx + ',' + gz); if (reach == null) continue;
      const dx = Math.max(gx * NC - cx, 0, cx - (gx + 1) * NC), dz = Math.max(gz * NC - cz, 0, cz - (gz + 1) * NC);
      if (Math.hypot(dx, dz) < rad + reach) return true;
    }
    return false;
  }

  // ---- 메시: 하천마다 단면 격자 + 수면 리본 (정점 색, 한 지오메트리) ----
  //   본류 메시와 겹치는 곳: 지류가 더 낮은(지배하는) 곳은 terrain.js 가 본류 삼각형을 빼고, 지류 메시는 2cm 위에 그려 z-fighting 없음
  function buildGeometry({ renderHeight, dominated, mainColor, colors: c }) {
    const pos = [], col = [], idx = [], tmp = new THREE.Color();
    // 단면이 구간별 직선(하상 → 물가 → 둔치 → 제방 → 지면)이라 꺾이는 점만 + 제방 색을 위해 둑마루 바로 안쪽 1열: 한쪽 7열
    //   [거리, 색] — 색은 정점 단위라 구간 경계 정점이 그 구간 색을 맡는다
    const colsFor = (toe, top, w) => {
      const wb = Math.max(0.3, w - 1), wt = Math.max(wb + 0.2, Math.min(toe - 0.3, w + 1.2));
      return [[0, c.cBed], [wb, c.cBed], [wt, c.cBank], [toe, c.cFlood], [Math.max(toe + 0.01, top - 0.05), c.cSlope], [top, c.cGround], [top + SP.MARGIN, c.cGround]];
    };
    let rowsN = 0, waterTris = 0;
    for (const s of list) {
      const ax = s.axis, N = s.N, pr = s.prof;
      const nrm = (i) => { const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; };
      // 행: ROW 샘플마다, sc 가 바뀌는 곳은 매 샘플. 지류가 본류보다 낮은 점이 하나라도 있는 행 ± 3행만
      const cand = [];
      const ROW = 3; // 6m 마다 (축은 이미 ±8m 로 매끈하게 만든 것)
      for (let i = 0; i < N; i++) if (i % ROW === 0 || i === N - 1 || s.sc[i] !== s.sc[Math.max(0, i - 1)] || s.sc[i] !== s.sc[Math.min(N - 1, i + 1)]) cand.push(i);
      const mkRow = (i, ox = 0, oz = 0) => {
        const [nx, nz] = nrm(i);
        const Ls = colsFor(pr.toeL[i], pr.topL[i], pr.wL[i]), Rs = colsFor(pr.toeR[i], pr.topR[i], pr.wR[i]);
        const ds = [...Ls.slice(1).reverse().map(([d, cc]) => [-d, cc]), ...Rs];
        let dom = false;
        const v = ds.map(([d, cc]) => { const x = ax[i][0] + ox + nx * d, z = ax[i][1] + oz + nz * d; if (!dom && dominated(x, z)) dom = true; return [x, z, cc]; });
        return { i, v, dom };
      };
      const rowData = cand.map((i) => mkRow(i));
      // 하류 끝 너머 2행(6m·12m): 합류부에서 본류 메시가 빠진 자리를 끝까지 덮음 (그 자리 높이는 본류 그대로)
      { const [tx, tz] = nrm(N - 1); for (const k of [1, 2]) { const r = mkRow(N - 1, -tz * 6 * k, tx * 6 * k); r.dom = false; rowData.push(r); } }
      const keep = rowData.map((r, k) => { for (let j = Math.max(0, k - 3); j <= Math.min(rowData.length - 1, k + 3); j++) if (rowData[j].dom) return true; return false; });
      let prev = -1;
      const C = rowData[0]?.v.length || 0;
      for (let k = 0; k < rowData.length; k++) {
        if (!keep[k]) { prev = -1; continue; }
        const { v } = rowData[k], base = pos.length / 3;
        for (const [x, z, cc] of v) {
          const h = renderHeight(x, z);
          pos.push(x, h > -0.02 ? 0.005 : h + 0.02, z);
          // 지류가 정하는 높이면 단면 색, 본류가 정하는 곳(합류부)이면 본류 메시와 같은 색
          tmp.copy(h > -0.02 ? c.cGround : dominated(x, z) ? cc : mainColor(x, z, h)); col.push(tmp.r, tmp.g, tmp.b);
        }
        if (prev >= 0) for (let j = 1; j < C; j++) { const a = prev + j - 1, b = a + 1, d = base + j - 1, e = d + 1; idx.push(a, d, b, b, d, e); }
        prev = base; rowsN++;
      }
      // 수면 리본: sc≈1 인 연속 구간. 합류 뒤(받는 하천 띠 안)는 그 지형 위 3cm, 본류 수면에 닿으면 끝
      let wprev = -1;
      for (let i = 0; i < N; i++) {
        const [x, z] = ax[i];
        const inRiver = s.into === 'tancheon' && mainBase(x, z) < P.WATER - 0.2;
        if (s.sc[i] < 0.99 || inRiver) { wprev = -1; continue; }
        if (i % 3 && i !== N - 1 && wprev >= 0 && s.sc[i + 1] >= 0.99) continue;
        const [nx, nz] = nrm(i), hl = pr.wL[i] + 0.3, hr = pr.wR[i] + 0.3;
        const y = s.iE >= 0 && i >= s.iE ? Math.max(renderHeight(x, z) + 0.03, P.WATER + 0.01) : s.W[i] + 0.02;
        const base = pos.length / 3;
        pos.push(x - nx * hl, y, z - nz * hl, x + nx * hr, y, z + nz * hr);
        col.push(c.cWater.r, c.cWater.g, c.cWater.b, c.cWater.r, c.cWater.g, c.cWater.b);
        if (wprev >= 0) { idx.push(wprev, base, wprev + 1, wprev + 1, base, base + 1); waterTris += 2; }
        wprev = base;
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.userData = { rows: rowsN, waterTris };
    return g;
  }

  return { list, height, covered, inBand, near, buildGeometry, stairs: S.stairs || [], bridges: S.bridges || [], params: SP };
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
