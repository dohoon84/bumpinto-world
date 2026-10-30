// [corridor] 탄천 하천 지형(깊이) 연장: 수내·서현 → 잠실(탄천 하류)까지 public/corridor/tancheon.json 생성
//
//   라이브 public/terrain.json(정자 구간)은 수정하지 않는다. 런타임(코리더 켜짐)에서만 라이브 축/단면 뒤에
//   이 파일의 축/단면을 이어 붙여 같은 createTerrain() 으로 한 메시를 만든다 → 정자와 이음매 없음.
//   - 축: 라이브와 같은 방식(탄천 OSM waterway 중심선, 2m 재샘플, ±50m 이동평균 3회). 라이브 축 인덱스 AX_JOIN 까지는
//         라이브 값 그대로, 그 뒤 150m 동안 오차를 흡수해 OSM 축으로 이어 감.
//   - 단면(toe/top/w): convert-taxi-terrain.mjs 와 같은 추정식. 둔치 경로 시드 = OSM '탄천 자전거길'(relation 27411)
//         + 이름이 탄천 자전거도로/길 인 경로(제방 위·출입로 제외), 수면 폭 = 탄천 riverbank 멀티폴리곤(relation 9035438),
//         상단(top) = 둔치가 아닌 도로·건물.
//         정자 bbox 에서 PROF_KEEP(m) 이상 떨어진 인덱스부터 교체(그 전은 라이브 값 그대로, 이후 300m 블렌드).
//   - 수면 폴리곤: riverbank ∩ 제방 띠, 정자 bbox 밖만 (라이브 수면과 겹치지 않음)
//   - 계단: 탄천 제방에 걸친 OSM highway=steps (라이브와 같은 stairFrom 식)
//
//   사용: node scripts/corridor/build-tancheon.mjs [--osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/tancheon.json]
import fs from 'node:fs';
import path from 'node:path';
import pc from 'polygon-clipping';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OSM = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/tancheon.json'));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const ROAD_W = { motorway: 16, trunk: 16, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, cycleway: 2.2, path: 2, steps: 2, track: 3, corridor: 2 };
const widthOf = (t) => { let w = ROAD_W[t.highway] ?? 4; const l = num(t.lanes); if (l && w >= 6) w = Math.max(w, l * 3.2); return w; };
const skipHw = (t) => (t.tunnel && t.tunnel !== 'no') || num(t.layer) < 0 || ['construction', 'proposed', 'platform', 'bus_stop', 'elevator'].includes(t.highway);

const T = readJSON(path.join(ROOT, 'public/terrain.json'));
const J = readJSON(path.join(ROOT, 'public/jeongja.json'));
const CI = readJSON(path.join(ROOT, 'public/corridor/index.json'));
const P = T.params, LB = J.meta.bboxLocal, BND = CI.meta.bounds;
const raw = readJSON(OSM);
const els = raw.elements;
const wayById = new Map(); for (const e of els) if (e.type === 'way') wayById.set(e.id, e);
const ways = els.filter((e) => e.type === 'way' && e.geometry && e.tags);

// ---------- 1) 축 ----------
const RIVER_REL = 19279176, BANK_REL = 9035438, BIKE_REL = 27411;
const rel = els.find((e) => e.type === 'relation' && e.id === RIVER_REL);
const main = rel.members.filter((m) => m.type === 'way' && m.geometry).sort((a, b) => b.geometry.length - a.geometry.length)[0];
let line = main.geometry.map(proj);
if (line[0][1] < line[line.length - 1][1]) line.reverse(); // 남(+z) → 북(-z), 라이브 축과 같은 방향
function resample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= L) { out.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]); s += step; }
    carry = L - (s - step);
  }
  return out;
}
let sm = resample(line, P.STEP);
for (let pass = 0; pass < 3; pass++) { const K = 25; sm = sm.map((_, i) => { let x = 0, z = 0, n = 0; for (let j = Math.max(0, i - K); j <= Math.min(sm.length - 1, i + K); j++) { x += sm[j][0]; z += sm[j][1]; n++; } return [x / n, z / n]; }); }
sm = resample(sm, P.STEP);

const NL = T.axis.length;
const AX_JOIN = NL - 121; // 라이브 끝 페이드(마지막 100 인덱스)가 시작되기 전
const J0 = T.axis[AX_JOIN];
let j0 = 0, bd = Infinity; for (let j = 0; j < sm.length; j++) { const d = Math.hypot(sm[j][0] - J0[0], sm[j][1] - J0[1]); if (d < bd) { bd = d; j0 = j; } }
// 끝: 코리더 경계 밖으로 나간 뒤 400m (그 사이 끝 페이드 200m)
let jEnd = sm.length - 1;
for (let j = j0; j < sm.length; j++) { const [x, z] = sm[j]; if (x < BND.x0 - 400 || z < BND.z0 - 400) { jEnd = j; break; } }
const tail = sm.slice(j0 + 1, jEnd + 1);
const dJ = [J0[0] - sm[j0][0], J0[1] - sm[j0][1]], BL = 75;
for (let k = 0; k < tail.length; k++) { const f = Math.max(0, 1 - (k + 1) / BL); tail[k] = [tail[k][0] + dJ[0] * f, tail[k][1] + dJ[1] * f]; }
const ax = T.axis.slice(0, AX_JOIN + 1).map((p) => [p[0], p[1]]).concat(resample([J0, ...tail], P.STEP).slice(1));
const N = ax.length;

// 단면 교체 시작 인덱스: 북쪽으로 가며 정자 bbox 에서 PROF_KEEP 이상 벗어난 첫 인덱스
const PROF_KEEP = 200;
let PROF_FROM = AX_JOIN;
for (let i = 0; i <= AX_JOIN; i++) { const [x, z] = ax[i]; if (z < LB.z0 - PROF_KEEP && i > NL / 2) { PROF_FROM = i; break; } }

// ---------- 축 투영 ----------
const CELL = 25, R = 160, grid = new Map();
for (let i = 0; i < N - 1; i++) {
  const [x, z] = ax[i];
  for (let gx = Math.floor((x - R) / CELL); gx <= Math.floor((x + R) / CELL); gx++) for (let gz = Math.floor((z - R) / CELL); gz <= Math.floor((z + R) / CELL); gz++) {
    const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
  }
}
function project(x, z) {
  const list = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
  let best = null;
  for (const i of list) {
    const [ax0, az0] = ax[i], [bx, bz] = ax[i + 1], dx = bx - ax0, dz = bz - az0, L2 = dx * dx + dz * dz;
    const t = ((x - ax0) * dx + (z - az0) * dz) / L2;
    const tc = Math.max(0, Math.min(1, t)), px = ax0 + dx * tc, pz = az0 + dz * tc, dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) { const L = Math.sqrt(L2); best = { i, t: tc, dist, d: (dx * (z - az0) - dz * (x - ax0)) / L * -1 }; }
  }
  return best;
}
const densify = (pts, step = 1) => { const o = []; for (let i = 1; i < pts.length; i++) { const [a0, b0] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - a0, bz - b0), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push([a0 + ((bx - a0) * k) / n, b0 + ((bz - b0) * k) / n]); } o.push(pts[pts.length - 1]); return o; };
const inLive = ([x, z]) => x >= LB.x0 - 5 && x <= LB.x1 + 5 && z >= LB.z0 - 5 && z <= LB.z1 + 5;
const want = (q) => q && q.i >= PROF_FROM - 10;
const bucket = () => Array.from({ length: N }, () => ({ L: [], R: [] }));
const lowerB = bucket(), streetB = bucket(), waterB = bucket();
function addPts(B, pts, hw) { for (const p of pts) { if (inLive(p)) continue; const q = project(p[0], p[1]); if (!want(q) || q.dist > 150) continue; (q.d < 0 ? B[q.i].L : B[q.i].R).push(Math.abs(q.d) + (B === streetB ? -hw : hw)); } }
const isPathKind = (k) => ['footway', 'cycleway', 'path', 'pedestrian', 'track'].includes(k);
const isBridge = (t) => t.bridge && t.bridge !== 'no';
const hwWays = ways.filter((e) => e.tags.highway && !skipHw(e.tags));

// 시드: 탄천 자전거길 relation + 이름 기반 (제방 위·출입로 제외)
const bike = els.find((e) => e.type === 'relation' && e.id === BIKE_REL);
const seedIds = new Set((bike?.members || []).filter((m) => m.type === 'way').map((m) => m.ref));
for (const e of hwWays) if (/^탄천\s*자전거(도로|길)$/.test(e.tags.name || '')) seedIds.add(e.id);
for (const id of [...seedIds]) { const e = wayById.get(id); const t = e?.tags || {}; if (!e?.geometry || isBridge(t) || /제방|출입로/.test(t.name || '') || !isPathKind(t.highway)) seedIds.delete(id); }

// 수면 폴리곤(멀티폴리곤 조립)
function assembleRings(members) {
  const segs = members.filter((m) => m.geometry?.length > 1).map((m) => m.geometry.map(proj));
  const rings = [];
  while (segs.length) {
    let cur = segs.shift(); let guard = 0;
    const same = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
    while (!same(cur[0], cur[cur.length - 1]) && guard++ < 1000) {
      const end = cur[cur.length - 1]; let k = segs.findIndex((s) => same(s[0], end)), rev = false;
      if (k < 0) { k = segs.findIndex((s) => same(s[s.length - 1], end)); rev = true; }
      if (k < 0) break;
      const s = segs.splice(k, 1)[0]; cur = cur.concat((rev ? s.reverse() : s).slice(1));
    }
    if (cur.length > 3) rings.push(cur);
  }
  return rings;
}
const bankRel = els.find((e) => e.type === 'relation' && e.id === BANK_REL);
const outer = assembleRings(bankRel.members.filter((m) => m.role === 'outer'));
const inner = assembleRings(bankRel.members.filter((m) => m.role === 'inner'));
for (const r of outer) addPts(waterB, densify(r, 1), 0);

const seedMax = { L: new Array(N).fill(0), R: new Array(N).fill(0) };
for (const id of seedIds) for (const p of densify(wayById.get(id).geometry.map(proj), 2)) { const q = project(...p); if (q && q.dist < 130) { const s = q.d < 0 ? 'L' : 'R'; for (let j = Math.max(0, q.i - 15); j < Math.min(N, q.i + 15); j++) seedMax[s][j] = Math.max(seedMax[s][j], Math.abs(q.d)); } }
const lowerIds = new Set(seedIds);
for (const e of hwWays) {
  const t = e.tags; if (lowerIds.has(e.id) || !isPathKind(t.highway) || isBridge(t)) continue;
  const ok = e.geometry.map(proj).every((p) => { const q = project(...p); return q && Math.abs(q.d) < seedMax[q.d < 0 ? 'L' : 'R'][q.i] - 0.5; });
  if (ok) lowerIds.add(e.id);
}
const rampIds = new Set();
for (const e of hwWays) {
  const t = e.tags; if (lowerIds.has(e.id) || !isPathKind(t.highway) || isBridge(t)) continue;
  const ins = e.geometry.map(proj).map((p) => { const q = project(...p); return !!q && Math.abs(q.d) < seedMax[q.d < 0 ? 'L' : 'R'][q.i] + 1; });
  if (ins.some(Boolean) && !ins.every(Boolean)) rampIds.add(e.id);
}
for (const e of hwWays) {
  const t = e.tags; if (t.highway === 'steps' || isBridge(t)) continue;
  const pts = densify(e.geometry.map(proj), 1), hw = widthOf(t) / 2;
  if (lowerIds.has(e.id)) addPts(lowerB, pts, hw + 0.8); else if (!rampIds.has(e.id)) addPts(streetB, pts, hw + 0.3);
}
for (const e of ways) if (e.tags.building) addPts(streetB, densify(e.geometry.map(proj), 1), 0.5);

// ---------- 2) 단면 (convert-taxi-terrain.mjs 와 같은 식) ----------
const est = {};
const WIN = 4;
for (const s of ['L', 'R']) {
  const toe = [], top = [], w = [];
  for (let i = 0; i < N; i++) {
    let mt = -Infinity, mw = -Infinity;
    for (let j = Math.max(0, i - WIN); j <= Math.min(N - 1, i + WIN); j++) { for (const v of lowerB[j][s]) mt = Math.max(mt, v); for (const v of waterB[j][s]) mw = Math.max(mw, v); }
    if (mw > 70) mw = -Infinity; // 합류부/저수지 등 비정상적으로 넓은 수면은 무시
    if (mw > -Infinity) mt = Math.max(mt, mw + 3);
    toe.push(mt > -Infinity && mt < 120 ? mt : NaN); w.push(mw > -Infinity ? mw : NaN);
  }
  for (let i = 0; i < N; i++) {
    let mn = Infinity; const tt = Number.isFinite(toe[i]) ? toe[i] : null;
    if (tt != null) for (let j = Math.max(0, i - WIN); j <= Math.min(N - 1, i + WIN); j++) for (const v of streetB[j][s]) if (v > tt - 1 && v < tt + 40) mn = Math.min(mn, v);
    top.push(tt == null ? NaN : Number.isFinite(mn) ? mn : tt + P.MAX_RUN);
  }
  const fill = (arr, def) => {
    const known = arr.map((v, i) => (Number.isFinite(v) && i >= PROF_FROM ? i : -1)).filter((i) => i >= 0);
    if (!known.length) return arr.map(() => def);
    let kp = 0;
    return arr.map((v, i) => {
      if (Number.isFinite(v) && i >= PROF_FROM) return v;
      while (kp < known.length && known[kp] < i) kp++;
      const prev = kp > 0 ? known[kp - 1] : null, next = kp < known.length ? known[kp] : null;
      if (prev != null && next != null && next - prev < 60) return arr[prev] + ((arr[next] - arr[prev]) * (i - prev)) / (next - prev);
      const k = prev != null && (next == null || i - prev < next - i) ? prev : next, f = Math.min(1, (Math.abs(i - k) * P.STEP) / 150);
      return arr[k] * (1 - f) + def * f;
    });
  };
  let Tt = fill(toe, P.DEF_TOE), U = fill(top, P.DEF_TOP), W = fill(w, P.DEF_W);
  const runFilt = (a, fn, K) => a.map((_, i) => fn(...a.slice(Math.max(0, i - K), i + K + 1)));
  const avg = (a, K) => a.map((_, i) => { const sl = a.slice(Math.max(0, i - K), i + K + 1); return sl.reduce((x, y) => x + y, 0) / sl.length; });
  Tt = avg(runFilt(Tt, Math.max, 3), 3); U = avg(runFilt(U, Math.min, 3), 3); W = avg(runFilt(W, Math.max, 3), 3);
  for (let i = 0; i < N; i++) { Tt[i] = Math.max(Tt[i], W[i] + 3); U[i] = Math.min(Math.max(U[i], Tt[i] + P.MIN_RUN), Tt[i] + P.MAX_RUN); }
  est['toe' + s] = Tt; est['top' + s] = U; est['w' + s] = W;
}
// 라이브 단면 → 추정 단면 블렌드 (PROF_FROM 부터 300m)
const prof = {}, BLEND = 150;
for (const k of Object.keys(T.prof)) {
  const liveAt = (i) => T.prof[k][Math.min(i, NL - 1)];
  prof[k] = [];
  for (let i = 0; i < N; i++) {
    if (i < PROF_FROM) { prof[k].push(T.prof[k][i]); continue; }
    const f = Math.min(1, (i - PROF_FROM) / BLEND);
    prof[k].push(r1(liveAt(PROF_FROM) * (1 - f) + est[k][i] * f));
  }
}
// toe/top 관계 보정(블렌드 후)
for (const s of ['L', 'R']) for (let i = PROF_FROM; i < N; i++) {
  prof['toe' + s][i] = r1(Math.max(prof['toe' + s][i], prof['w' + s][i] + 3));
  prof['top' + s][i] = r1(Math.min(Math.max(prof['top' + s][i], prof['toe' + s][i] + P.MIN_RUN), prof['toe' + s][i] + P.MAX_RUN));
}

// 차도 보호: 다리가 아닌 일반 차도가 제방 경사/둔치 안으로 들어오면 그 지점의 top 을 차도 가장자리로 당긴다
// (도로는 지면 높이 0 을 유지 — 둔치 안에 실제로 있는 차도(수면 근처)는 그대로 둔다)
const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified', 'living_street']);
let carClamp = 0;
for (const e of hwWays) {
  const t = e.tags; if (!CAR.has(t.highway) || isBridge(t) || lowerIds.has(e.id)) continue;
  const hw = widthOf(t) / 2 + 0.6;
  for (const p of densify(e.geometry.map(proj), 2)) {
    if (inLive(p)) continue;
    const q = project(p[0], p[1]); if (!q || q.i < PROF_FROM + 5) continue;
    const s = q.d < 0 ? 'L' : 'R', edge = Math.abs(q.d) - hw;
    for (let j = Math.max(PROF_FROM, q.i - 4); j <= Math.min(N - 1, q.i + 5); j++) {
      const top = prof['top' + s][j], w = prof['w' + s][j];
      if (edge >= top || edge < w + 5) continue; // 이미 밖이거나 실제로 물가(둔치 안) 도로
      prof['top' + s][j] = r1(edge);
      prof['toe' + s][j] = r1(Math.max(w + 3, Math.min(prof['toe' + s][j], edge - P.MIN_RUN)));
      if (prof['toe' + s][j] > edge - 1.5) prof['toe' + s][j] = r1(Math.max(w + 1.5, edge - 1.5));
      carClamp++;
    }
  }
}

// ---------- 3) 높이 함수 (런타임과 같은 식, 끝 페이드 포함) ----------
function hProfile(ad, toe, top, w) {
  if (ad >= top) return 0;
  if (ad >= toe) return P.FLOOR * (top - ad) / (top - toe);
  if (ad >= w + 1.2) return P.FLOOR;
  if (ad >= w - 1) return P.BED + ((P.FLOOR - P.BED) * (ad - (w - 1))) / 2.2;
  return P.BED;
}
const endFade = (i) => Math.min(1, Math.min(i, N - 1 - i) / 100);
function baseH(x, z) {
  const q = project(x, z); if (!q) return 0;
  const s = q.d < 0 ? 'L' : 'R', i = q.i, t = q.t, lerp = (k) => prof[k + s][i] * (1 - t) + prof[k + s][Math.min(N - 1, i + 1)] * t;
  if (Math.abs(q.d) >= lerp('top')) return 0;
  return hProfile(Math.abs(q.d), lerp('toe'), lerp('top'), lerp('w')) * endFade(i);
}

// ---------- 4) 계단 ----------
function stairFrom(A, B, meta) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  let tTop = null, tBot = null;
  for (let s = 0; s <= L + 6; s += 0.05) { const h = baseH(A[0] + ux * s, A[1] + uz * s); if (tTop == null && h < -0.05) tTop = Math.max(0, s - 0.05); if (tTop != null && h <= P.FLOOR + 0.05) { tBot = s; break; } }
  if (tTop == null || tBot == null || tBot - tTop < 2) return null;
  const Tp = [A[0] + ux * tTop, A[1] + uz * tTop], Bb = [A[0] + ux * tBot, A[1] + uz * tBot];
  const run = tBot - tTop, n = Math.max(Math.round(-P.FLOOR / 0.2), Math.min(Math.round(-P.FLOOR / 0.15), Math.round(run / 0.28)));
  return { ...meta, top: A.map(r2), bottom: B.map(r2), flight: [[...Tp.map(r2), 0], [...Bb.map(r2), P.FLOOR]], steps: n, riser: r2(-P.FLOOR / n), tread: r2((tBot - Tp.length * 0 - tTop) / n), w: 2.4, run: r1(tBot - tTop) };
}
const liveStairIds = new Set(T.stairs.map((s) => s.id).filter(Boolean));
const stairs = [];
for (const e of ways) {
  if (e.tags.highway !== 'steps' || liveStairIds.has(e.id)) continue;
  const pts = e.geometry.map(proj);
  if (pts.some(inLive)) continue;
  const q0 = project(...pts[0]); if (!q0 || q0.i < PROF_FROM) continue;
  const hs = pts.map((p) => baseH(...p));
  if (Math.min(...hs) > P.FLOOR + 0.5 || Math.max(...hs) < -0.5) continue;
  const [A, B] = hs[0] >= hs[hs.length - 1] ? [pts[0], pts[pts.length - 1]] : [pts[pts.length - 1], pts[0]];
  const s = stairFrom(A, [B[0] + (B[0] - A[0]) * 0.6, B[1] + (B[1] - A[1]) * 0.6], { id: e.id, osm: true, incline: e.tags.incline || '', name: `OSM steps ${e.id}` });
  if (s) { s.bottom = B.map(r2); stairs.push(s); }
}

// ---------- 5) 수면 폴리곤: riverbank ∩ 제방 띠(top) − 정자 bbox ----------
const left = [], right = [];
for (let i = PROF_FROM - 2; i < N; i++) {
  const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
  // d>0 = 진행방향 오른쪽 = (-dz, dx)*-1 ... project() 와 같은 부호: d = -(dx*(z-az) - dz*(x-ax)) → 오른쪽 법선 (dz, -dx)
  const nx = dz, nz = -dx, f = endFade(i);
  if (f < 0.5) continue;
  left.push([ax[i][0] - nx * prof.topL[i], ax[i][1] - nz * prof.topL[i]]);
  right.push([ax[i][0] + nx * prof.topR[i], ax[i][1] + nz * prof.topR[i]]);
}
const strip = [[...left, ...right.reverse(), left[0]]];
const liveRect = [[[LB.x0, LB.z0], [LB.x1, LB.z0], [LB.x1, LB.z1], [LB.x0, LB.z1], [LB.x0, LB.z0]]];
const closeR = (r) => { const o = r.slice(); const a = o[0], b = o[o.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) o.push([a[0], a[1]]); return o; };
let waterMP = outer.map((r) => [closeR(r)]);
waterMP = pc.union(...waterMP);
if (inner.length) waterMP = pc.difference(waterMP, ...inner.map((r) => [closeR(r)]));
waterMP = pc.difference(pc.intersection(waterMP, strip), liveRect);
const water = [];
for (const poly of waterMP) {
  const o = poly[0].map(([x, z]) => [r1(x), r1(z)]); o.pop();
  if (o.length < 3) continue;
  const holes = poly.slice(1).map((h) => { const r = h.map(([x, z]) => [r1(x), r1(z)]); r.pop(); return r; }).filter((h) => h.length >= 3);
  water.push(holes.length ? { o, holes } : { o });
}

// ---------- 출력 ----------
const out = {
  meta: {
    source: path.relative(ROOT, OSM), attribution: '© OpenStreetMap contributors (ODbL)', generated: new Date().toISOString(),
    note: '라이브 terrain.json 뒤에 이어 붙이는 탄천 축/단면(코리더 전용). 높이값은 라이브와 같은 근사(FLOOR/WATER/BED). 단면 폭은 OSM 둔치 경로·수면·도로·건물에서 추정',
    liveAxisN: NL, liveAxisLast: T.axis[NL - 1], from: PROF_FROM, axJoin: AX_JOIN, osm: { river: RIVER_REL, riverbank: BANK_REL, bikeRoute: BIKE_REL }, lowerWays: lowerIds.size, rampWays: rampIds.size,
  },
  from: PROF_FROM,
  axis: ax.slice(PROF_FROM).map((p) => p.map(r1)),
  prof: Object.fromEntries(Object.entries(prof).map(([k, v]) => [k, v.slice(PROF_FROM)])),
  stairs, water,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const stat = (k) => { const v = prof[k].slice(AX_JOIN); return `${k} ${Math.min(...v).toFixed(0)}..${Math.max(...v).toFixed(0)}`; };
console.log(JSON.stringify({ N, from: PROF_FROM, axJoin: AX_JOIN, joinOffset: r2(Math.hypot(...dJ)), end: ax[N - 1].map(r1), lengthKm: r2(((N - PROF_FROM) * P.STEP) / 1000), seeds: seedIds.size, lower: lowerIds.size, ramps: rampIds.size, stairs: stairs.length, carClamp, water: water.length, kb: Math.round(fs.statSync(OUT).size / 1024) }));
console.log(['toeL', 'topL', 'wL', 'toeR', 'topR', 'wR'].map(stat).join(' | '));
for (const z of [-1316, -2035, -3147, -4952, -7349, -9086, -11524, -13192, -14300]) { let bi = PROF_FROM; for (let i = PROF_FROM; i < N; i++) if (Math.abs(ax[i][1] - z) < Math.abs(ax[bi][1] - z)) bi = i; console.log('z', z, 'axis', ax[bi].map(r1), 'L', prof.toeL[bi], prof.topL[bi], prof.wL[bi], 'R', prof.toeR[bi], prof.topR[bi], prof.wR[bi]); }
