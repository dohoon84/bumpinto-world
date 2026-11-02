// [streams] 탄천 지류(여수천·분당천·운중천 등) 하도 깊이: public/corridor/streams.json 생성
//
//   코리더 전용 추가 데이터. 런타임에서 ?streams=0 이면 이 파일을 읽지 않으므로 기존 화면/동작은 그대로다.
//   라이브 정자 bbox(+60m) 안에는 지류를 만들지 않는다.
//   - 축: OSM waterway=stream|river (탄천·한강 제외, tunnel=culvert 구간 제외) 를 2m 재샘플 + ±8m 이동평균 2회.
//         코리더 타일이 있는 곳만, 열린 구간 길이 60m 이상.
//   - 단면(toe/top/w, 좌우): build-tancheon.mjs 와 같은 생각을 지류 크기로 줄인 추정
//       w(수면 반폭)  = 축을 덮는 OSM 수면 폴리곤(natural=water + water=stream|river, waterway=riverbank)의 가장자리, 없으면 기본값
//       toe(둔치 끝)  = OSM highway=steps 의 아래 끝 / 축과 나란한 둔치 산책로·자전거길(이름에 하천명 또는 계단 아래 끝보다 안쪽)
//       top(제방 위) = OSM steps 의 위 끝, 없으면 toe + 깊이×1.6. 차도·건물·보도 가장자리 밖으로는 넘지 않음(차도/건물 보호)
//     OSM 에 폭(width)·깊이 태그가 없으므로 깊이(D)는 하도 폭에서 근사: D = clamp(0.6 + 0.08×(topL+topR), 1.6, 3.8) m
//     (실측 아님 — 탄천 FLOOR -6m 보다 얕게). 수면 = 둔치 −0.4m, 하상 = 둔치 −1.0m.
//   - 합류부: 런타임에서 받는 하천(탄천/다른 지류)의 둔치 높이까지 마지막 60m 동안 서서히 깊어짐 (terrain.js)
//   - 다리 아닌 차도·건물이 하천을 가로지르면(복개/암거) 그 폭만큼 하도를 메움(fill) → 차가 빠지지 않음
//   - 다리: 코리더 타일 도로 중 br=1 이고 하도를 건너는 것 → 런타임 annotate 로 상판(0m)+상판 두께/교각/난간
//   - 계단: 지류 제방에 걸친 OSM highway=steps
//   - 징검다리: OSM ford=stepping_stones 선 중 지류 물길을 건너는 것 (돌·높이는 런타임)
//   - 타일 교체 데이터: 하도 띠(top+0.3m)를 뺀 바닥/공원/물 폴리곤 (상세 타일·LOD 타일) — 평면 레이어가 하도를 덮지 않게
//
//   사용: node scripts/corridor/build-streams.mjs [--osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/streams.json]
import fs from 'node:fs';
import path from 'node:path';
import pc from 'polygon-clipping';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OSM = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/streams.json'));
const CDIR = path.join(ROOT, 'public/corridor');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const ROAD_W = { motorway: 16, trunk: 16, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, cycleway: 2.2, path: 2, steps: 2, track: 3, corridor: 2 };
const widthOf = (t) => { let w = ROAD_W[t.highway] ?? 4; const l = num(t.lanes); if (l && w >= 6) w = Math.max(w, l * 3.2); return w; };
const skipHw = (t) => (t.tunnel && t.tunnel !== 'no') || num(t.layer) < 0 || ['construction', 'proposed', 'platform', 'bus_stop', 'elevator'].includes(t.highway);
const isBridge = (t) => t.bridge && t.bridge !== 'no';
const PATH_KINDS = new Set(['footway', 'cycleway', 'path', 'pedestrian', 'track', 'bridleway']);
const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service']);

// 파라미터 (런타임 terrain.js 와 공유: streams.json meta.params)
const SP = { STEP: 2, MIN_W: 1.2, DEF_W: 2.0, DEF_W_NAMED: 3.0, MAX_W: 12, MIN_RUN: 2.0, RUN_K: 1.6, MAX_TOP: 34, D_MIN: 1.6, D_MAX: 3.8, WATER_D: 0.4, BED_D: 1.0, MARGIN: 12, RAMP: 60, FADE: 24 };

const CI = readJSON(path.join(CDIR, 'index.json'));
const TAN = readJSON(path.join(CDIR, 'tancheon.json'));
const T = readJSON(path.join(ROOT, 'public/terrain.json'));
const LIVE = CI.meta.liveBox, TS = CI.meta.tileSize;
const inLive = ([x, z], pad = 60) => x >= LIVE.x0 - pad && x <= LIVE.x1 + pad && z >= LIVE.z0 - pad && z <= LIVE.z1 + pad;
const tileKeys = new Set(Object.keys(CI.tiles));
const inTiles = ([x, z]) => tileKeys.has(Math.floor(x / TS) + '_' + Math.floor(z / TS));

const raw = readJSON(OSM);
const els = raw.elements;
const ways = els.filter((e) => e.type === 'way' && e.geometry && e.tags);

// ---------- 공용 ----------
function resample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= L) { out.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1], o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push(last);
  return out;
}
const densify = (pts, step = 1) => { const o = []; for (let i = 1; i < pts.length; i++) { const [a0, b0] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - a0, bz - b0), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push([a0 + ((bx - a0) * k) / n, b0 + ((bz - b0) * k) / n]); } o.push(pts[pts.length - 1]); return o; };
function makeProjector(ax, R = 60) {
  const N = ax.length, CELL = 20, grid = new Map();
  for (let i = 0; i < N - 1; i++) {
    const [x, z] = ax[i];
    for (let gx = Math.floor((x - R) / CELL); gx <= Math.floor((x + R) / CELL); gx++) for (let gz = Math.floor((z - R) / CELL); gz <= Math.floor((z + R) / CELL); gz++) {
      const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    }
  }
  return (x, z) => {
    const list = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
    let best = null;
    for (const i of list) {
      const [ax0, az0] = ax[i], [bx, bz] = ax[i + 1], dx = bx - ax0, dz = bz - az0, L2 = dx * dx + dz * dz || 1;
      const t = ((x - ax0) * dx + (z - az0) * dz) / L2;
      const tc = Math.max(0, Math.min(1, t)), px = ax0 + dx * tc, pz = az0 + dz * tc, dist = Math.hypot(x - px, z - pz);
      if (!best || dist < best.dist) best = { i, t: tc, dist, d: -(dx * (z - az0) - dz * (x - ax0)) / Math.sqrt(L2), end: (t < -0.05 && i === 0) || (t > 1.05 && i === N - 2), tx: dx / Math.sqrt(L2), tz: dz / Math.sqrt(L2) };
    }
    return best;
  };
}

// 탄천 본류 축 + top (합류 판정용): 라이브 축 앞부분 + 코리더 연장
const mainAx = T.axis.slice(0, TAN.from).concat(TAN.axis);
const mainTop = { L: T.prof.topL.slice(0, TAN.from).concat(TAN.prof.topL), R: T.prof.topR.slice(0, TAN.from).concat(TAN.prof.topR) };
const mainProj = makeProjector(mainAx, 160);
const mainTopAt = (x, z) => { const q = mainProj(x, z); if (!q || q.end) return null; return { q, top: mainTop[q.d < 0 ? 'L' : 'R'][q.i] }; };

// ---------- 1) 하천 선택 + 열린 구간 ----------
const NAME_SKIP = /^(탄천|한강)$/;
const isCulvert = (t) => t.tunnel && t.tunnel !== 'no';
const streamWays = ways.filter((e) => ['stream', 'river'].includes(e.tags.waterway) && !NAME_SKIP.test(e.tags.name || '') && !isCulvert(e.tags));
// 같은 이름(없으면 id) 끼리 끝점이 이어지면 하나로 합침
const groups = new Map();
for (const e of streamWays) { const k = e.tags.name || 'id' + e.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
const chains = [];
for (const [name, list] of groups) {
  const segs = list.map((e) => ({ ids: [e.id], p: e.geometry.map(proj) }));
  while (segs.length) {
    const cur = segs.shift(); let grew = true;
    while (grew) {
      grew = false;
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        if (same(cur.p[cur.p.length - 1], s.p[0])) { cur.p = cur.p.concat(s.p.slice(1)); cur.ids.push(...s.ids); segs.splice(k, 1); grew = true; break; }
        if (same(s.p[s.p.length - 1], cur.p[0])) { cur.p = s.p.concat(cur.p.slice(1)); cur.ids.unshift(...s.ids); segs.splice(k, 1); grew = true; break; }
      }
    }
    chains.push({ name: name.startsWith('id') ? '' : name, ...cur });
  }
}
// 코리더 타일 안 + 라이브 밖인 연속 구간만
const pieces = [];
for (const c of chains) {
  const pts = densify(c.p, 2);
  let run = [];
  const flush = () => { if (run.length >= 2) { let L = 0; for (let i = 1; i < run.length; i++) L += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]); if (L >= 60) pieces.push({ ...c, p: run }); } run = []; };
  for (const p of pts) { if (inTiles(p) && !inLive(p)) run.push(p); else flush(); }
  flush();
}

// ---------- 2) 장애물/근거 수집 ----------
const hwWays = ways.filter((e) => e.tags.highway && !skipHw(e.tags));
const waterPolys = ways.filter((e) => e.geometry.length > 3 && ((e.tags.natural === 'water' && ['stream', 'river', 'canal', undefined].includes(e.tags.water)) || e.tags.waterway === 'riverbank'))
  .map((e) => ({ id: e.id, ring: e.geometry.map(proj) }));
const buildings = ways.filter((e) => e.tags.building && e.geometry.length >= 3).map((e) => ({ id: e.id, ring: e.geometry.map(proj) }));
const pointInRing = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
const bboxOf = (pts) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of pts) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return [a, b, c, d]; };
for (const w of waterPolys) w.bb = bboxOf(w.ring);
for (const b of buildings) b.bb = bboxOf(b.ring);
for (const e of hwWays) e._p = e.geometry.map(proj), e._bb = bboxOf(e._p);

const runFilt = (a, fn, K) => a.map((_, i) => fn(...a.slice(Math.max(0, i - K), i + K + 1)));
const avg = (a, K) => a.map((_, i) => { const sl = a.slice(Math.max(0, i - K), i + K + 1); return sl.reduce((x, y) => x + y, 0) / sl.length; });
const smoothstep = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// ---------- 3) 하천별 축/단면 ----------
const streams = [], stairsOut = [], log = [];
for (const pc0 of pieces) {
  let sm = resample(pc0.p, SP.STEP);
  if (sm.length < 8) continue;
  for (let pass = 0; pass < 2; pass++) { const K = 4; sm = sm.map((p, i) => { if (i === 0 || i === sm.length - 1) return p; let x = 0, z = 0, n = 0; for (let j = Math.max(0, i - K); j <= Math.min(sm.length - 1, i + K); j++) { x += sm[j][0]; z += sm[j][1]; n++; } return [x / n, z / n]; }); }
  sm = resample(sm, SP.STEP);
  const ax = sm, N = ax.length, project = makeProjector(ax, 60);
  const bb = bboxOf(ax), near = (b, pad) => b[2] >= bb[0] - pad && b[0] <= bb[2] + pad && b[3] >= bb[1] - pad && b[1] <= bb[3] + pad;
  const B = () => Array.from({ length: N }, () => ({ L: [], R: [] }));
  const waterB = B(), toeB = B(), topB = B(), obsB = B();
  const fill = new Uint8Array(N);
  const side = (q) => (q.d < 0 ? 'L' : 'R');
  // 수면: 축 점이 폴리곤 안이면 좌우로 가장자리까지 광선
  const wp = waterPolys.filter((w) => near(w.bb, 30));
  for (let i = 0; i < N; i += 2) {
    const [x, z] = ax[i], a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
    const poly = wp.find((w) => pointInRing(x, z, w.ring)); if (!poly) continue;
    for (const [s, sg] of [['R', 1], ['L', -1]]) { let d = 0; while (d < 40 && pointInRing(x + nx * sg * (d + 0.5), z + nz * sg * (d + 0.5), poly.ring)) d += 0.5; if (d < 40) waterB[i][s].push(d); }
  }
  // 계단: 양 끝이 하천 근처(35m), 높이 차 = 축까지 거리 차
  const stepsWays = hwWays.filter((e) => e.tags.highway === 'steps' && near(e._bb, 40));
  const stepList = [];
  for (const e of stepsWays) {
    const p = e._p, qa = project(...p[0]), qb = project(...p[p.length - 1]);
    if (!qa || !qb || qa.end || qb.end || qa.dist > 35 || qb.dist > 35 || Math.sign(qa.d) !== Math.sign(qb.d)) continue;
    const [lo, hi] = Math.abs(qa.d) < Math.abs(qb.d) ? [qa, qb] : [qb, qa];
    if (Math.abs(hi.d) - Math.abs(lo.d) < 3) continue;
    const s = side(lo);
    for (let j = Math.max(0, lo.i - 6); j <= Math.min(N - 1, lo.i + 6); j++) { toeB[j][s].push(Math.abs(lo.d) + 0.5); topB[j][s].push(Math.abs(hi.d)); }
    stepList.push({ e, lo, hi, top: Math.abs(qa.d) < Math.abs(qb.d) ? p[p.length - 1] : p[0], bot: Math.abs(qa.d) < Math.abs(qb.d) ? p[0] : p[p.length - 1] });
  }
  // 둔치 경로: 축과 나란하고(방향 0.85+) 계단 아래끝보다 안쪽 또는 이름에 하천명/자전거
  const stemName = (pc0.name || '').replace(/\s/g, '');
  const pathWays = hwWays.filter((e) => PATH_KINDS.has(e.tags.highway) && !isBridge(e.tags) && near(e._bb, 30));
  const lowerIds = new Set(), parIds = new Set();
  for (const e of pathWays) {
    const pts = densify(e._p, 2); let par = 0, tot = 0, maxD = 0, ok = true;
    for (let k = 1; k < pts.length; k++) {
      const q = project(...pts[k]); if (!q || q.end || q.dist > 45) { ok = false; break; }
      const dx = pts[k][0] - pts[k - 1][0], dz = pts[k][1] - pts[k - 1][1], L = Math.hypot(dx, dz) || 1;
      if (Math.abs((dx * q.tx + dz * q.tz) / L) > 0.85) par++; tot++; maxD = Math.max(maxD, q.dist);
    }
    if (!tot) continue;
    if (par / tot >= 0.6) parIds.add(e.id);
    if (!ok || maxD > 26) continue;
    const named = stemName && (e.tags.name || '').replace(/\s/g, '').includes(stemName);
    const q0 = project(...pts[Math.floor(pts.length / 2)]); if (!q0) continue; const s = side(q0);
    const stepToe = Math.max(-Infinity, ...toeB[q0.i][s]);
    if ((named && par / tot >= 0.5) || (par / tot >= 0.6 && Number.isFinite(stepToe) && maxD <= stepToe + 1)) lowerIds.add(e.id);
  }
  // 둔치 경로 점 중 축과 나란한 구간만 toe 근거 (제방 위로 올라가는 끝 경사로는 제외)
  for (const e of pathWays) if (lowerIds.has(e.id)) {
    const hw = widthOf(e.tags) / 2, pts = densify(e._p, 1);
    for (let k = 1; k < pts.length; k++) {
      const q = project(...pts[k]); if (!q || q.end || q.dist > 20) continue;
      const dx = pts[k][0] - pts[k - 1][0], dz = pts[k][1] - pts[k - 1][1], L = Math.hypot(dx, dz) || 1;
      if (Math.abs((dx * q.tx + dz * q.tz) / L) > 0.92) toeB[q.i][side(q)].push(q.dist + hw + 0.8);
    }
  }
  // 장애물: 다리 아닌 차도/보도(둔치 경로·계단 제외) 발자국, 건물 테두리. 수면까지 들어오면(=가로지름) 메움
  const crossRoads = [];
  for (const e of hwWays) {
    if (!near(e._bb, 40) || isBridge(e.tags) || lowerIds.has(e.id) || e.tags.highway === 'steps') continue;
    if (PATH_KINDS.has(e.tags.highway) && !parIds.has(e.id)) continue; // 하도를 가로지르는/내려가는 보도(징검다리·접근로)는 지형을 따라감
    const car = CAR.has(e.tags.highway), hw = widthOf(e.tags) / 2 + (car ? 0.6 : 0.3);
    const pts = densify(e._p, 1);
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, rx = -(b[1] - a[1]) / L, rz = (b[0] - a[0]) / L;
      for (let v = -hw; v <= hw + 0.01; v += Math.max(0.5, hw / 3)) {
        const x = pts[k][0] + rx * v, z = pts[k][1] + rz * v, q = project(x, z); if (!q || q.end || q.dist > 45) continue;
        if (q.dist < SP.MIN_W + 1.5) { if (car) { fill[q.i] = 1; crossRoads.push(e.id); } continue; } // 보도가 물을 건너는 곳(징검다리 등)은 그대로 둔치 높이
        obsB[q.i][side(q)].push(q.dist - 0.3);
      }
    }
  }
  for (const b of buildings) {
    if (!near(b.bb, 40)) continue;
    for (const p of densify(b.ring, 1)) { const q = project(...p); if (!q || q.end || q.dist > 45) continue; obsB[q.i][side(q)].push(q.dist - 0.8); }
    // 건물이 축을 덮으면(복개) 메움
    for (let i = 0; i < N; i++) if (ax[i][0] >= b.bb[0] && ax[i][0] <= b.bb[2] && ax[i][1] >= b.bb[1] && ax[i][1] <= b.bb[3] && pointInRing(ax[i][0], ax[i][1], b.ring)) fill[i] = 1;
  }
  // 다리 끝(교대): 다리 상판 끝 밖은 지면 — 하도 top 을 상판 끝 안쪽으로
  const bridgeWays = hwWays.filter((e) => isBridge(e.tags) && near(e._bb, 40));
  for (const e of bridgeWays) {
    const p = e._p;
    for (const end of [p[0], p[p.length - 1]]) { const q = project(...end); if (q && !q.end && q.dist < 45 && q.dist > SP.MIN_W + 1) for (let j = Math.max(0, q.i - 4); j <= Math.min(N - 1, q.i + 4); j++) obsB[j][side(q)].push(q.dist - 0.3); }
  }
  // 이름 있는 하천인지(기본 폭)
  const defW = pc0.name ? SP.DEF_W_NAMED : SP.DEF_W;
  const prof = {}; let topSum = 0;
  for (const s of ['L', 'R']) {
    const WIN = 4;
    const W = [], Tt = [], U = [];
    for (let i = 0; i < N; i++) {
      let mw = -Infinity, mt = -Infinity, mu = -Infinity;
      for (let j = Math.max(0, i - WIN); j <= Math.min(N - 1, i + WIN); j++) { for (const v of waterB[j][s]) mw = Math.max(mw, v); for (const v of toeB[j][s]) mt = Math.max(mt, v); for (const v of topB[j][s]) mu = Math.max(mu, v); }
      W.push(Number.isFinite(mw) ? Math.min(SP.MAX_W, Math.max(SP.MIN_W, mw)) : NaN); Tt.push(mt); U.push(mu);
    }
    // 수면 폭: 알려진 값 사이 보간, 없으면 기본
    const known = W.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    let Wf = W.map((v, i) => {
      if (Number.isFinite(v)) return v;
      let p = -1, n = -1; for (const k of known) { if (k < i) p = k; else { n = k; break; } }
      if (p >= 0 && n >= 0 && n - p < 80) return W[p] + ((W[n] - W[p]) * (i - p)) / (n - p);
      const k = p >= 0 && (n < 0 || i - p < n - i) ? p : n; if (k < 0) return defW;
      const f = Math.min(1, (Math.abs(i - k) * SP.STEP) / 60); return W[k] * (1 - f) + defW * f;
    });
    Wf = avg(runFilt(Wf, Math.max, 2), 3);
    // toe: 계단 아래끝/둔치 경로가 있으면 그 값(근처로 보간), 없으면 수면 + 1.5
    let toe = Tt.map((v, i) => (Number.isFinite(v) ? Math.max(v, Wf[i] + 1.5) : NaN));
    const kt = toe.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    toe = toe.map((v, i) => {
      if (Number.isFinite(v)) return v;
      let p = -1, n = -1; for (const k of kt) { if (k < i) p = k; else { n = k; break; } }
      const base = Wf[i] + 1.5;
      if (p >= 0 && n >= 0 && n - p < 60) return Math.max(base, toe[p] + ((toe[n] - toe[p]) * (i - p)) / (n - p));
      const k = p >= 0 && (n < 0 || i - p < n - i) ? p : n; if (k < 0) return base;
      const f = Math.min(1, (Math.abs(i - k) * SP.STEP) / 40); return Math.max(base, toe[k] * (1 - f) + base * f);
    });
    toe = avg(runFilt(toe, Math.max, 2), 3);
    U.forEach((v, i) => { if (Number.isFinite(v)) topSum += 0; });
    prof['w' + s] = Wf; prof['toe' + s] = toe; prof['_top' + s] = U;
  }
  // 깊이: 하도 폭(계단 위끝 있으면 그것, 없으면 toe + 기본 경사폭)으로 근사
  const topEst = (s, i, D) => (Number.isFinite(prof['_top' + s][i]) ? prof['_top' + s][i] : prof['toe' + s][i] + D * SP.RUN_K);
  let wsum = 0; for (let i = 0; i < N; i++) wsum += topEst('L', i, 2.5) + topEst('R', i, 2.5);
  const D = r1(Math.max(SP.D_MIN, Math.min(SP.D_MAX, 0.6 + 0.08 * (wsum / N))));
  let clampN = 0;
  for (const s of ['L', 'R']) {
    let top = []; for (let i = 0; i < N; i++) top.push(Math.min(SP.MAX_TOP, Math.max(topEst(s, i, D), prof['toe' + s][i] + SP.MIN_RUN)));
    top = avg(runFilt(top, Math.max, 2), 2);
    // 장애물로 top 제한 (이웃 ±2 샘플)
    for (let i = 0; i < N; i++) {
      let lim = Infinity; for (let j = Math.max(0, i - 2); j <= Math.min(N - 1, i + 2); j++) for (const v of obsB[j][s]) lim = Math.min(lim, v);
      if (lim < top[i]) { top[i] = lim; clampN++; }
    }
    const toe = prof['toe' + s], w = prof['w' + s];
    for (let i = 0; i < N; i++) {
      // 관계 유지: w ≥ MIN_W, toe ≥ w+1.2, top ≥ toe+1 (장애물이 너무 가까우면 단면을 좁힘)
      if (top[i] < toe[i] + SP.MIN_RUN) toe[i] = Math.max(w[i] + 1.2, top[i] - SP.MIN_RUN);
      if (top[i] < toe[i] + 1) { toe[i] = Math.max(SP.MIN_W + 1.2, top[i] - 1); w[i] = Math.max(SP.MIN_W, Math.min(w[i], toe[i] - 1.2)); }
      if (top[i] < SP.MIN_W + 2.2) fill[i] = 1; // 너무 좁음 → 메움
    }
    prof['top' + s] = top; delete prof['_top' + s];
  }
  // fill/끝 페이드 스케일
  const fl = Array.from(fill); for (let i = 0; i < N; i++) if (fill[i]) for (let j = Math.max(0, i - 1); j <= Math.min(N - 1, i + 1); j++) fl[j] = 1; // 차도 폭 + 2m
  const sc = new Array(N).fill(1), FN = SP.FADE / SP.STEP;
  for (let i = 0; i < N; i++) {
    let dist = Infinity; for (let j = Math.max(0, i - FN); j <= Math.min(N - 1, i + FN); j++) if (fl[j]) dist = Math.min(dist, Math.abs(j - i));
    let s = fl[i] ? 0 : Number.isFinite(dist) ? Math.min(1, (dist - 0.5) / 2) : 1; // 메움 경계 2샘플(4m)
    sc[i] = Math.max(0, s);
  }
  // 상류 끝 페이드(FADE m). 하류 끝은 합류부(받는 하천) 또는 타일 경계
  const endIn = mainTopAt(...ax[N - 1]);
  let into = null;
  if (endIn && endIn.q.dist < endIn.top + 5) into = 'tancheon';
  for (let i = 0; i < Math.min(N, FN); i++) sc[i] = Math.min(sc[i], smoothstep(i / FN));
  if (!into) for (let i = 0; i < Math.min(N, FN); i++) sc[N - 1 - i] = Math.min(sc[N - 1 - i], smoothstep(i / FN));
  if (sc.filter((v) => v > 0.5).length * SP.STEP < 80) continue; // 열린 구간이 너무 짧음(대부분 복개)
  const id0 = String(pc0.ids[0]), id = streams.some((o) => o.id === id0) ? id0 + '-' + streams.filter((o) => String(o.id).startsWith(id0)).length : id0; // 같은 하천이 코리더 밖에서 끊겨 조각나면 접미사
  streams.push({ id, name: pc0.name, osm: pc0.ids, D, into, axis: ax, prof, sc, crossRoads: [...new Set(crossRoads)], lower: lowerIds.size, steps: stepList, clampN });
}
// 겹치는 중복 물길(같은 하천을 다른 way 로 또 그린 것: 축의 80% 이상이 더 긴 지류 축 5m 안) 제거
for (let k = streams.length - 1; k >= 0; k--) {
  const s = streams[k];
  const o = streams.find((o) => o !== s && o.axis.length > s.axis.length && s.axis.filter((p, i) => i % 5 === 0 && o.axis.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 5)).length >= 0.8 * Math.ceil(s.axis.length / 5));
  if (o) { console.log(`  drop ${s.id} (${s.name || '이름 없음'}): duplicates ${o.id}`); streams.splice(k, 1); }
}
// 다른 지류로 들어가는 지류 (끝점이 다른 지류 축 15m 안)
for (const s of streams) {
  if (s.into) continue;
  const end = s.axis[s.axis.length - 1];
  for (const o of streams) {
    if (o === s) continue;
    let best = Infinity; for (const p of o.axis) best = Math.min(best, Math.hypot(p[0] - end[0], p[1] - end[1]));
    if (best < 15) { s.into = o.id; break; }
  }
  if (!s.into) { const FN = SP.FADE / SP.STEP, N = s.axis.length; for (let i = 0; i < Math.min(N, FN); i++) s.sc[N - 1 - i] = Math.min(s.sc[N - 1 - i], smoothstep(i / FN)); }
}

// ---------- 4) 높이 (런타임 terrain.js 의 지류 식과 같음 — 합류 램프 제외, 계단/띠 계산용) ----------
function streamH(s) {
  const P = s.prof, N = s.axis.length, project = makeProjector(s.axis, 60);
  return (x, z) => {
    const q = project(x, z); if (!q || q.end) return 0;
    const sd = q.d < 0 ? 'L' : 'R', j = Math.min(N - 1, q.i + 1), t = q.t, f = (k) => P[k + sd][q.i] * (1 - t) + P[k + sd][j] * t;
    const top = f('top'), toe = f('toe'), w = f('w'), ad = Math.abs(q.d), sc = s.sc[q.i] * (1 - t) + s.sc[j] * t;
    if (ad >= top || sc <= 0) return 0;
    const F = -s.D, Bd = F - SP.BED_D;
    let h; if (ad >= toe) h = F * (top - ad) / (top - toe); else if (ad >= w + 1.2) h = F; else if (ad >= w - 1) h = Bd + ((F - Bd) * (ad - (w - 1))) / 2.2; else h = Bd;
    return h * sc;
  };
}
// 계단 (build-tancheon stairFrom 과 같은 식, 바닥 = 지류 둔치)
for (const s of streams) {
  const H = streamH(s), F = -s.D;
  for (const st of s.steps) {
    const A = st.top, Bt = st.bot, Bx = [Bt[0] + (Bt[0] - A[0]) * 0.6, Bt[1] + (Bt[1] - A[1]) * 0.6];
    const L = Math.hypot(Bx[0] - A[0], Bx[1] - A[1]), ux = (Bx[0] - A[0]) / L, uz = (Bx[1] - A[1]) / L;
    let tTop = null, tBot = null;
    for (let u = 0; u <= L + 4; u += 0.05) { const h = H(A[0] + ux * u, A[1] + uz * u); if (tTop == null && h < -0.05) tTop = Math.max(0, u - 0.05); if (tTop != null && h <= F + 0.05) { tBot = u; break; } }
    if (tTop == null || tBot == null || tBot - tTop < 1.5) continue;
    const Tp = [A[0] + ux * tTop, A[1] + uz * tTop], Bb = [A[0] + ux * tBot, A[1] + uz * tBot];
    const n = Math.max(3, Math.round(-F / 0.17));
    stairsOut.push({ id: st.e.id, osm: true, river: s.name || '지류', name: `OSM steps ${st.e.id}`, top: A.map(r2), bottom: Bt.map(r2), flight: [[...Tp.map(r2), 0], [...Bb.map(r2), F]], steps: n, riser: r2(-F / n), tread: r2((tBot - tTop) / n), w: 2.4, run: r1(tBot - tTop) });
  }
}

// ---------- 5) 다리: 코리더 타일 도로 중 br=1 이고 지류 하도를 건너는 것 ----------
const Hs = streams.map(streamH);
const Hall = (x, z) => { let h = 0; for (const H of Hs) h = Math.min(h, H(x, z)); return h; };
const bridges = [], seenBr = new Set();
const tileFiles = fs.readdirSync(path.join(CDIR, 'tiles')).filter((f) => f.endsWith('.json'));
const allBB = streams.map((s) => { const b = bboxOf(s.axis); return [b[0] - 50, b[1] - 50, b[2] + 50, b[3] + 50]; });
const nearAny = (x0, z0, x1, z1) => allBB.some((b) => x1 >= b[0] && x0 <= b[2] && z1 >= b[1] && z0 <= b[3]);
const tilesTouched = [];
for (const f of tileFiles) {
  const key = f.replace('.json', ''), [tx, tz] = key.split('_').map(Number), x0 = tx * TS, z0 = tz * TS;
  if (!nearAny(x0, z0, x0 + TS, z0 + TS)) continue;
  tilesTouched.push(key);
  const t = readJSON(path.join(CDIR, 'tiles', f));
  for (const r of t.r) {
    if (!r.br || r.p.length < 2) continue;
    const hs = densify(r.p, 1).map(([x, z]) => Hall(x, z));
    if (Math.min(...hs) > -0.3) continue;
    const k = r.p.map((p) => p.map(r1).join(',')).join(';'); if (seenBr.has(k)) continue; seenBr.add(k);
    bridges.push({ p: r.p.map(([x, z]) => [r1(x), r1(z)]), w: r.w, k: r.k, br: 1, ...(r.n ? { n: r.n } : {}) });
  }
}

// ---------- 5b) 징검다리: OSM ford=stepping_stones (또는 surface=stepping_stones) 중 지류 물길을 건너는 것 ----------
//   선만 내보내고 돌 자리·높이는 런타임(terrain.js)이 지형·수면에서 정한다. OSM 에 근거 없는 곳엔 만들지 않음
const isStones = (t) => t.ford === 'stepping_stones' || t.surface === 'stepping_stones' || t.highway === 'stepping_stones';
const fords = [];
for (const e of ways) {
  if (!isStones(e.tags) || isBridge(e.tags)) continue;
  const p = e.geometry.map(proj);
  if (p.some((q) => inLive(q))) continue;
  // 둔치(−D)보다 0.2m 넘게 낮은 점(물가·하상)이 있는 하천
  let best = -1, bh = 0;
  for (const [x, z] of densify(p, 0.5)) streams.forEach((s, k) => { const h = Hs[k](x, z); if (h < -s.D - 0.2 && h < bh) { bh = h; best = k; } });
  if (best < 0) continue;
  fords.push({ osm: e.id, river: streams[best].name || '지류', p: p.map((q) => q.map(r2)) });
}
console.log(`fords: ${fords.map((f) => `${f.osm} ${f.river}`).join(', ') || 'none'}`);

// ---------- 6) 하도 띠 폴리곤 → 타일/LOD 평면 레이어 교체 ----------
// Douglas–Peucker (띠 가장자리 단순화 → 잘린 폴리곤 점 수 감소)
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); const [ax0, az0] = pts[a], [bx, bz] = pts[b], L = Math.hypot(bx - ax0, bz - az0) || 1;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax0) * (az0 - pts[i][1]) - (ax0 - pts[i][0]) * (bz - az0)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function stripPolys(s, pad) {
  const out = [], N = s.axis.length; let L = [], R = [];
  const flush = () => { if (L.length >= 2) { const l = dp(L, 0.25), r = dp(R, 0.25); out.push([[...l, ...r.reverse(), l[0]]]); } L = []; R = []; };
  for (let i = 0; i < N; i++) {
    if (s.sc[i] <= 0) { flush(); continue; }
    const a = s.axis[Math.max(0, i - 1)], b = s.axis[Math.min(N - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;
    const tl = s.prof.topL[i] + pad, tr = s.prof.topR[i] + pad;
    L.push([s.axis[i][0] - nx * tl, s.axis[i][1] - nz * tl]); R.push([s.axis[i][0] + nx * tr, s.axis[i][1] + nz * tr]);
    if (L.length >= 200) { const lastL = L[L.length - 1], lastR = R[R.length - 1]; flush(); L.push(lastL); R.push(lastR); }
  }
  flush();
  return out;
}
let STRIP = [];
for (const s of streams) STRIP = STRIP.length ? pc.union(STRIP, ...stripPolys(s, 0.3)) : pc.union(...stripPolys(s, 0.3));
const close = (r) => { const o = r.map(([x, z]) => [x, z]); const a = o[0], b = o[o.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) o.push([a[0], a[1]]); return o; };
const fromMP = (mp) => mp.map((poly) => { const o = poly[0].slice(0, -1).map(([x, z]) => [r1(x), r1(z)]); const holes = poly.slice(1).map((h) => h.slice(0, -1).map(([x, z]) => [r1(x), r1(z)])).filter((h) => h.length >= 3); return { o, holes }; }).filter((p) => p.o.length >= 3);
const cut = (p) => { const mp = pc.difference([close(p.o), ...(p.holes || []).map(close)], STRIP); return fromMP(mp); };
const touches = (p) => { const b = bboxOf(p.o); return nearAny(b[0], b[1], b[2], b[3]); };
const tilesOut = {}, lodOut = {};
const unflat = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
const flat = (r) => r.flatMap(([x, z]) => [x, z]);
let cutCount = 0;
// 교체 데이터는 바뀐 폴리곤만 [원래 인덱스, [잘린 조각...]] 으로 저장 (런타임 applyTileCuts)
for (const key of tilesTouched) {
  const t = readJSON(path.join(CDIR, 'tiles', key + '.json'));
  const rep = {};
  for (const fld of ['floor', 'parks', 'water']) {
    const ch = [];
    (t[fld] || []).forEach((p, idx) => {
      if (!touches(p)) return;
      const c = cut(p);
      if (c.length === 1 && JSON.stringify([c[0].o, c[0].holes]) === JSON.stringify([p.o, p.holes || []])) return;
      cutCount++; ch.push([idx, c]);
    });
    if (ch.length) rep[fld] = ch;
  }
  if (Object.keys(rep).length) tilesOut[key] = rep;
  const lf = path.join(CDIR, 'lod', key + '.json');
  if (fs.existsSync(lf)) {
    const L = readJSON(lf), lrep = {};
    const cutRings = (rings) => { const p = { o: unflat(rings[0]), holes: rings.slice(1).map(unflat) }; if (!touches(p)) return null; const c = cut(p).map((q) => [flat(q.o), ...q.holes.map(flat)]); return JSON.stringify(c) === JSON.stringify([rings]) ? null : c; };
    for (const [fld, off] of [['f', 0], ['p', 1], ['w', 0]]) {
      const ch = [];
      (L[fld] || []).forEach((item, idx) => { const c = cutRings(off ? item.slice(1) : item); if (c) ch.push([idx, c]); });
      if (ch.length) lrep[fld] = ch;
    }
    if (Object.keys(lrep).length) lodOut[key] = lrep;
  }
}

// ---------- 탄천 본류의 빠진 다리 ----------
// OSM bridge=* 길 중 탄천 본류 띠 깊숙이(축에서 top·0.4 안) 지나가는데 base.ch(탄천 구간 도로)에도 타일에도 없는 것.
// 리본 + 상판은 런타임이 base.ch 와 같은 방식으로 그린다(지류 플래그와 같이 켜짐). 폭은 지류 쪽과 같은 widthOf(태그)
const BASE = readJSON(path.join(CDIR, 'base.json'));
const tileRoadsAt = new Map();
const tileHas = (key, p) => {
  if (!tileRoadsAt.has(key)) { const f = path.join(CDIR, 'tiles', key + '.json'); tileRoadsAt.set(key, fs.existsSync(f) ? readJSON(f).r : []); }
  return tileRoadsAt.get(key).some((r) => r.p.some(([x, z]) => p.some(([a, b]) => Math.hypot(a - x, b - z) < 3)));
};
const mainBridges = [];
for (const e of ways) {
  if (!e.tags.highway || !e.tags.bridge || e.tags.bridge === 'no' || e.tags.tunnel) continue;
  const p = e.geometry.map(proj).map((q) => q.map(r1));
  if (!p.every(inTiles) || p.some((q) => inLive(q, 0))) continue;
  if (!densify(p, 2).some(([x, z]) => { const m = mainTopAt(x, z); return m && m.q.dist < m.top * 0.4; })) continue;
  if (BASE.ch.some((r) => r.p.some(([x, z]) => p.some(([a, b]) => Math.hypot(a - x, b - z) < 3)))) continue;
  const key = Math.floor(p[0][0] / TS) + '_' + Math.floor(p[0][1] / TS);
  if (tileHas(key, p)) continue;
  mainBridges.push({ p, w: r1(widthOf(e.tags)), k: e.tags.highway, br: 1, osm: e.id, ...(e.tags.name ? { n: e.tags.name } : {}) });
}
console.log(`main bridges added: ${mainBridges.map((b) => `${b.osm} ${b.k} ${b.n || ''}`).join(', ')}`);

// ---------- 출력 ----------
const rp = (a) => a.map((v) => r1(v));
const out = {
  meta: {
    source: path.relative(ROOT, OSM), attribution: '© OpenStreetMap contributors (ODbL)', generated: new Date().toISOString(),
    note: '탄천 지류 하도(코리더 전용, ?streams=0 이면 미사용). 깊이 D 는 하도 폭에서 근사(OSM 깊이/폭 태그 없음). 단면은 OSM 수면 폴리곤·계단·둔치 경로·차도·건물에서 추정',
    params: SP, liveBox: LIVE,
  },
  streams: streams.map((s) => ({ id: s.id, name: s.name, osm: s.osm, D: s.D, into: s.into, axis: s.axis.map((p) => p.map(r1)), prof: Object.fromEntries(Object.entries(s.prof).map(([k, v]) => [k, rp(v)])), sc: s.sc.map(r2) })),
  stairs: stairsOut, bridges, mainBridges, fords, tiles: tilesOut, lod: lodOut,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
for (const s of streams) {
  const N = s.axis.length, m = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`${String(s.id).padEnd(11)} ${(s.name || '(이름없음)').padEnd(6)} L=${(N * 2 / 1000).toFixed(2)}km D=${s.D} into=${s.into} w=${m(s.prof.wL)}/${m(s.prof.wR)} toe=${m(s.prof.toeL)}/${m(s.prof.toeR)} top=${m(s.prof.topL)}/${m(s.prof.topR)} fill=${s.sc.filter((v) => v === 0).length} steps=${s.steps.length} lower=${s.lower} clamp=${s.clampN} start=${s.axis[0].map(Math.round)} end=${s.axis[N - 1].map(Math.round)}`);
}
console.log(JSON.stringify({ streams: streams.length, stairs: stairsOut.length, bridges: bridges.length, fords: fords.length, tiles: Object.keys(tilesOut).length, lod: Object.keys(lodOut).length, cutPolys: cutCount, kb: Math.round(fs.statSync(OUT).size / 1024) }));
