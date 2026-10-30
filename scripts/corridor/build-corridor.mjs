// 정자 → 롯데월드타워 코리더 데이터 생성 (public/corridor/*)
//
//   입력 1: 코리더 베이크 결과(500m 타일). scripts/corridor/README.md 참고 — 기본 경로 data/corridor/world
//           (index.json, base.json, transit.json, tiles/X_Z.json). 원본 OSM/Vworld 를 굽는 단계는 키가 필요하지만
//           이 스크립트와 런타임은 키가 필요 없다. 결과(public/corridor)는 커밋해서 배포한다.
//   입력 2: 라이브 정자 데이터 public/jeongja.json, public/transit.json, public/terrain.json (수정하지 않음)
//
//   원칙
//   - 라이브 정자 bbox 안은 라이브가 소유: 코리더 건물/공원/물/바닥/횡단보도는 넣지 않는다. 도로는 bbox 경계에서 자른다.
//   - 라이브 도로가 bbox 밖까지 이어지는 구간(같은 OSM 도로)은 라이브가 그리므로 코리더에서 뺀다(겹침 0.6m 이내).
//   - 탄천 하천 지형(terrain.json) 구간: 바닥/공원/물 폴리곤은 제방 경사(top) 안쪽을 빼고, 그 구간에 닿는 도로는
//     base.ch 로 모아 런타임에 terrain.annotate 로 높이·다리 상판을 라이브와 똑같이 처리한다.
//   - 도로 조각은 타일·잘림 경계마다 이웃 꼭짓점 하나를 겹쳐(overlap) 리본 단면이 이음점에서 정확히 같게 만든다.
//
//   사용: node scripts/corridor/build-corridor.mjs [--src=data/corridor/world] [--out=public/corridor]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pc from 'polygon-clipping';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SRC = path.resolve(ROOT, arg('src', 'data/corridor/world'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor'));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const pIndex = readJSON(path.join(SRC, 'index.json'));
const pBase = readJSON(path.join(SRC, 'base.json'));
const pTransit = readJSON(path.join(SRC, 'transit.json'));
const pTiles = {};
for (const k of Object.keys(pIndex.tiles)) pTiles[k] = readJSON(path.join(SRC, 'tiles', k + '.json'));
const live = readJSON(path.join(ROOT, 'public/jeongja.json'));
const liveTransit = readJSON(path.join(ROOT, 'public/transit.json'));
const T0 = readJSON(path.join(ROOT, 'public/terrain.json'));
// 탄천 연장(수내→잠실, scripts/corridor/build-tancheon.mjs 결과). 있으면 런타임과 똑같이 라이브 축 뒤에 이어 붙여 띠/하천 판정에 쓴다.
const TANCHEON = path.resolve(ROOT, arg('tancheon', path.join(OUT, 'tancheon.json')));
const tancheonStr = fs.existsSync(TANCHEON) ? fs.readFileSync(TANCHEON, 'utf8') : null;
const { createTerrain } = await import(pathToFileURL(path.join(ROOT, 'src/world/terrain.js')).href);
const { mergeTancheon } = await import(pathToFileURL(path.join(ROOT, 'src/corridor/tancheon.js')).href);
const T = tancheonStr ? mergeTancheon(T0, JSON.parse(tancheonStr)) : T0;
if (tancheonStr && T === T0) throw new Error('tancheon.json 이 현재 public/terrain.json 과 맞지 않음 — build-tancheon.mjs 를 다시 실행');
const terrain = createTerrain(T, live);
const TS = pIndex.meta.tileSize;
const r1 = (v) => Math.round(v * 10) / 10;
const LB = live.meta.bboxLocal;
const inLive = (x, z) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;

// ---------- 공간 유틸 ----------
function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
class Grid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  add(item, x0, z0, x1, z1) { const c = this.cell; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const k = i * 100000 + j; let L = this.map.get(k); if (!L) this.map.set(k, (L = [])); L.push(item); } }
  query(x, z) { return this.map.get(Math.floor(x / this.cell) * 100000 + Math.floor(z / this.cell)) || []; }
}
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
function dp(pts, eps) { // Douglas–Peucker (열린 선)
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]); if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const dpRing = (r, eps) => { if (r.length < 5) return r; const o = dp([...r, r[0]], eps); o.pop(); return o.length >= 3 ? o : r; };
const openRing = (r) => { const o = r.map(([x, z]) => [r1(x), r1(z)]); if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop(); const out = []; for (const p of o) { const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); } return out; };
const closeRing = (r) => { const o = r.map((p) => [p[0], p[1]]); const a = o[0], b = o[o.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) o.push([a[0], a[1]]); return o; };

// ---------- 라이브 소유 영역(LIVE_MASK) = 정자 bbox ∪ 탄천 제방 경사(top) 띠 ----------
const ax = T.axis, prof = T.prof, N = ax.length;
const left = [], right = [];
for (let i = 0; i < N; i += 2) {
  const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; // d>0 방향 (terrain.js project 와 같은 부호)
  const pad = 0.6;
  right.push([ax[i][0] + nx * (prof.topR[i] + pad), ax[i][1] + nz * (prof.topR[i] + pad)]);
  left.push([ax[i][0] - nx * (prof.topL[i] + pad), ax[i][1] - nz * (prof.topL[i] + pad)]);
}
const stripRing = closeRing([...right, ...left.reverse()]);
const strip = pc.union([[stripRing]]);
const liveRect = [[[LB.x0, LB.z0], [LB.x1, LB.z0], [LB.x1, LB.z1], [LB.x0, LB.z1], [LB.x0, LB.z0]]];
const LIVE_MASK = pc.union(liveRect, strip);
const stripRings = strip.map((poly) => poly.map((r) => r));
const inStrip = (x, z) => stripRings.some((poly) => pointInRing(x, z, poly[0]) && !poly.slice(1).some((h) => pointInRing(x, z, h)));
const inMask = (x, z) => inLive(x, z) || inStrip(x, z);
const chan = (x, z) => terrain.baseHeight(x, z) < -0.05; // 하천 지형 위(제방 경사·둔치·하상)

const toPolys = (mp) => mp.map((poly) => ({ o: openRing(poly[0]), holes: poly.slice(1).map(openRing).filter((h) => h.length >= 3) })).filter((p) => p.o.length >= 3 && Math.abs(area(p.o)) > 0.5);
const geomOf = (p) => [closeRing(p.o), ...(p.holes || []).filter((h) => h.length >= 3).map(closeRing)];
const tileRect = (tx, tz) => [[[tx * TS, tz * TS], [(tx + 1) * TS, tz * TS], [(tx + 1) * TS, (tz + 1) * TS], [tx * TS, (tz + 1) * TS], [tx * TS, tz * TS]]];
const tileKeys = Object.keys(pIndex.tiles);
const tileOf = (x, z) => `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;

// 폴리곤(공원/물) → (LIVE_MASK 밖) → 타일별로 잘라 배분
function distribute(polys, field, keyOf) {
  const out = {};
  for (const p of polys) {
    let g;
    try { g = pc.difference([geomOf(p)], LIVE_MASK); } catch { continue; }
    if (!g.length) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const poly of g) for (const [x, z] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) for (let tz = Math.floor(z0 / TS); tz <= Math.floor(z1 / TS); tz++) {
      const key = `${tx}_${tz}`; if (!pTiles[key]) continue;
      let gi; try { gi = pc.intersection(g, tileRect(tx, tz)); } catch { continue; }
      for (const q of toPolys(gi)) ((out[key] ||= {})[field] ||= []).push(keyOf ? { ...q, k: keyOf(p) } : q);
    }
  }
  return out;
}

// ---------- 공원 / 물 ----------
const LIVE_PARK_KINDS = new Set(['park', 'garden', 'playground', 'pitch', 'recreation_ground', 'grass', 'forest', 'meadow', 'village_green', 'wood', 'scrub', 'grassland', 'plaza']);
const allParks = [...pBase.parks, ...Object.values(pTiles).flatMap((t) => t.parks || [])].filter((p) => LIVE_PARK_KINDS.has(p.k) && p.o?.length >= 3);
// 같은 공원이 base/타일에 중복될 수 있어 링 키로 dedupe
const seenPark = new Set();
const parks = allParks.filter((p) => { const k = p.k + '|' + p.o.slice(0, 3).map((q) => q.join(',')).join(';') + '|' + p.o.length; if (seenPark.has(k)) return false; seenPark.add(k); return true; });
// 탄천 띠 안쪽 공원: 지형 메시 채색용(라이브 annotate 의 corridorParks 와 같은 역할)
const chParks = [];
for (const p of parks) {
  if (inLive(...centroid(p.o))) continue;
  let g; try { g = pc.difference(pc.intersection([geomOf(p)], strip), liveRect); } catch { continue; }
  for (const q of toPolys(g)) if (q.o.some(([x, z]) => chan(x, z))) chParks.push({ ...q, k: p.k });
}
const parkOut = distribute(parks, 'parks', (p) => p.k);
const allWater = [...pBase.water, ...Object.values(pTiles).flatMap((t) => t.water || [])];
const waterOut = distribute(allWater, 'water');

// ---------- 바닥(block) ----------
const floorOut = {};
for (const key of tileKeys) {
  const [tx, tz] = key.split('_').map(Number);
  const g = pc.difference(tileRect(tx, tz), LIVE_MASK);
  const polys = toPolys(g);
  if (polys.length) floorOut[key] = polys;
}

// ---------- 건물 ----------
const liveB = new Grid(40);
for (const b of live.buildings) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of b.o) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } liveB.add(b, x0, z0, x1, z1); }
const bOut = {}, stat = { bIn: 0, bDup: 0, bStrip: 0, b: 0 };
for (const [key, t] of Object.entries(pTiles)) {
  for (const b of t.b) {
    const o = openRing(b.o); if (o.length < 3) continue;
    const c = centroid(o);
    if (inLive(c[0], c[1])) { stat.bIn++; continue; }
    if (liveB.query(c[0], c[1]).some((l) => pointInRing(c[0], c[1], l.o)) || o.some(([x, z]) => liveB.query(x, z).some((l) => { const lc = centroid(l.o); return pointInRing(lc[0], lc[1], o); }))) { stat.bDup++; continue; }
    if (inStrip(c[0], c[1])) { stat.bStrip++; continue; }
    const rec = { o, h: r1(b.h) };
    if (b.holes?.length) rec.holes = b.holes.map(openRing).filter((h) => h.length >= 3);
    rec.k = b.k || 'yes';
    if (b.mh) rec.mh = r1(b.mh);
    if (b.s === 'default') rec.s = 'default';
    if (b.hide || b.outline) rec.nr = 1; // 그리지 않음(랜드마크 모델·부분 건물로 대체) — 충돌은 유지
    if (b.lm) rec.lm = b.lm;
    (bOut[key] ||= []).push(rec); stat.b++;
  }
}

// ---------- 도로 ----------
// 1) 타일 조각을 원래 길(way) 단위 체인으로 다시 잇기
const sig = (r) => [r.k, r.w, r.n || '', r.br ? 1 : 0, r.walk ? 1 : 0].join('|');
const pk = (p) => p[0] + ',' + p[1];
const pieces = [];
for (const [key, t] of Object.entries(pTiles)) for (const r of t.r) if (r.p.length >= 2) pieces.push({ key, r, s: sig(r), used: false, next: null, prev: null });
const byStart = new Map();
for (const q of pieces) { const k = q.s + '@' + pk(q.r.p[0]); (byStart.get(k) || byStart.set(k, []).get(k)).push(q); }
for (const q of pieces) {
  const c = (byStart.get(q.s + '@' + pk(q.r.p[q.r.p.length - 1])) || []).filter((o) => o !== q && o.key !== q.key && !o.prev);
  if (c.length === 1) { q.next = c[0]; c[0].prev = q; }
}
const chains = [];
for (const q of pieces) {
  if (q.prev || q.used) continue;
  let cur = q; const pts = []; const r = q.r;
  while (cur && !cur.used) { cur.used = true; for (const p of cur.r.p) { const l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push([p[0], p[1]]); } cur = cur.next; }
  chains.push({ k: r.k, w: r.w, n: r.n, br: r.br ? 1 : 0, walk: r.walk ? 1 : 0, p: pts });
}
for (const q of pieces) if (!q.used) { q.used = true; chains.push({ k: q.r.k, w: q.r.w, n: q.r.n, br: q.r.br ? 1 : 0, walk: q.r.walk ? 1 : 0, p: q.r.p.map((p) => [p[0], p[1]]) }); }

// 2) 라이브 도로와 겹치는 구간 / bbox 안 구간 표시
const liveRoadGrid = new Grid(20);
live.roads.forEach((r, ri) => { for (let i = 1; i < r.p.length; i++) { const [ax0, az0] = r.p[i - 1], [bx, bz] = r.p[i], m = 1; liveRoadGrid.add({ ri, ax: ax0, az: az0, bx, bz, w: r.w }, Math.min(ax0, bx) - m, Math.min(az0, bz) - m, Math.max(ax0, bx) + m, Math.max(az0, bz) + m); } });
const DUP = 0.6;
function nearLive(x, z, w) { const s = new Set(); for (const it of liveRoadGrid.query(x, z)) if (it.w >= w - 0.01 && segDist(x, z, it.ax, it.az, it.bx, it.bz) <= DUP) s.add(it.ri); return s; }
function dupSeg(a, b, w) {
  const A = nearLive(a[0], a[1], w); if (!A.size) return false;
  const B = nearLive(b[0], b[1], w); if (!B.size) return false;
  const M = nearLive((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w);
  for (const ri of A) if (B.has(ri) && M.has(ri)) return true;
  return false;
}
// 선분을 bbox 경계로 자르기(Liang–Barsky) → bbox 밖 부분 [t0,t1] 목록
function outsideParts(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz], q = [a[0] - LB.x0, LB.x1 - a[0], a[1] - LB.z0, LB.z1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return [[0, 1]]; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  if (t0 >= t1) return [[0, 1]]; // bbox 와 안 만남
  const out = [];
  if (t0 > 1e-6) out.push([0, t0]);
  if (t1 < 1 - 1e-6) out.push([t1, 1]);
  return out;
}
const lerp = (a, b, t) => [r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t)];
// 체인 → 유지 구간(run). run.pts 는 겹침 꼭짓점을 포함. {pts, ext0, ext1} ext=앞/뒤에 겹침으로 붙인 꼭짓점 수
const runs = []; const rstat = { segs: 0, dropDup: 0, dropLive: 0, clipped: 0 };
for (const c of chains) {
  const P = c.p; const n = P.length;
  // 세그먼트별: 'keep' | 'dup' | 'live' | {clip:[parts]}
  const seg = [];
  for (let i = 1; i < n; i++) {
    rstat.segs++;
    const a = P[i - 1], b = P[i];
    if (inLive(a[0], a[1]) && inLive(b[0], b[1])) { seg.push({ t: 'live' }); rstat.dropLive++; continue; }
    if (dupSeg(a, b, c.w)) { seg.push({ t: 'dup' }); rstat.dropDup++; continue; }
    const parts = outsideParts(a, b);
    if (parts.length === 1 && parts[0][0] === 0 && parts[0][1] === 1) { seg.push({ t: 'keep' }); continue; }
    rstat.clipped++; seg.push({ t: 'clip', parts });
  }
  // run 만들기
  let cur = null;
  const flush = () => { if (cur && cur.pts.length >= 2) runs.push(cur); cur = null; };
  for (let i = 1; i < n; i++) {
    const s = seg[i - 1], a = P[i - 1], b = P[i];
    if (s.t === 'keep') {
      if (!cur) {
        cur = { c, pts: [], head: 0, tail: 0 };
        // 앞쪽이 라이브 중복 구간이면 꼭짓점 하나 겹치기
        if (i >= 2 && seg[i - 2].t === 'dup') { cur.pts.push(P[i - 2]); cur.head = 1; }
        cur.pts.push(a);
      }
      cur.pts.push(b);
      continue;
    }
    if (s.t === 'clip') {
      for (const [t0, t1] of s.parts) {
        const A = t0 === 0 ? a : lerp(a, b, t0), B = t1 === 1 ? b : lerp(a, b, t1);
        if (t0 === 0) { if (!cur) { cur = { c, pts: [], head: 0, tail: 0 }; if (i >= 2 && seg[i - 2].t === 'dup') { cur.pts.push(P[i - 2]); cur.head = 1; } cur.pts.push(A); } cur.pts.push(B); if (t1 !== 1) flush(); }
        else { flush(); cur = { c, pts: [A, B], head: 0, tail: 0 }; if (t1 !== 1) flush(); }
      }
      continue;
    }
    // dup / live: 끊기. dup 이면 꼭짓점 하나 겹쳐서 끝냄
    if (cur) { if (s.t === 'dup') { cur.pts.push(b); cur.tail = 1; } flush(); }
  }
  flush();
}

// 3) 하천 지형에 닿는 run → base.ch (런타임 terrain.annotate), 나머지 → 타일 조각
function densify(pts, step) { const o = []; for (let i = 1; i < pts.length; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]); } o.push(pts[pts.length - 1]); return o; }
const rec = (c, pts) => { const o = { p: pts.map(([x, z]) => [x, z]), w: c.w, k: c.k }; if (c.n) o.n = c.n; if (c.br) o.br = 1; if (c.walk) o.walk = 1; return o; };
const ch = [], rOut = {}; let chCount = 0;
for (const run of runs) {
  const touches = densify(run.pts, 2).some(([x, z]) => chan(x, z));
  if (touches) { const o = rec(run.c, run.pts); if (run.head || run.tail) o.o = [run.head, run.tail]; ch.push(o); chCount++; continue; }
  // 타일 분할: 세그먼트 중점 기준, 조각마다 앞뒤 꼭짓점 하나 겹침
  const P = run.pts; let start = 0, curKey = tileOf((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2);
  const emit = (s, e, key) => { // 세그먼트 s..e-1 (점 s..e)
    const a = Math.max(0, s - 1), b = Math.min(P.length - 1, e + 1);
    const o = rec(run.c, P.slice(a, b + 1));
    // o = [앞, 뒤] 겹침 세그먼트 수(이웃 타일/라이브 도로 위에 겹쳐 놓은 구간 — 가로수·판정에서 제외)
    const oh = (s - a) + (s === 0 ? run.head : 0), ot = (b - e) + (e === P.length - 1 ? run.tail : 0);
    if (oh || ot) o.o = [oh, ot];
    (rOut[key] ||= []).push(o);
  };
  for (let i = 1; i < P.length - 1; i++) {
    const key = tileOf((P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    if (key !== curKey) { emit(start, i, curKey); start = i; curKey = key; }
  }
  emit(start, P.length - 1, curKey);
}
// 겹침 꼭짓점은 같은 run 안에서만 붙이므로 run 경계(타일 밖으로 나간 조각)는 그대로. 타일 키가 없는 곳은 가장 가까운 타일로.
for (const key of Object.keys(rOut)) if (!pTiles[key]) {
  const [tx, tz] = key.split('_').map(Number); let best = null, bd = Infinity;
  for (const k of tileKeys) { const [x, z] = k.split('_').map(Number); const d = Math.hypot(x - tx, z - tz); if (d < bd) { bd = d; best = k; } }
  (rOut[best] ||= []).push(...rOut[key]); delete rOut[key];
}

// ---------- 물길 중심선(하천) — 탄천은 라이브가 전 구간 그림 ----------
const wlOut = {};
for (const l of pBase.waterLines) {
  if (l.n === '탄천') continue;
  const w = l.w >= 30 ? 8 : 6;
  let cur = [];
  const flush = () => { if (cur.length >= 2) { for (let i = 0; i < cur.length - 1; i += 40) { const part = cur.slice(i, Math.min(cur.length, i + 41)); const m = part[Math.floor(part.length / 2)]; const key = tileOf(m[0], m[1]); if (pTiles[key]) (wlOut[key] ||= []).push({ p: part.map(([x, z]) => [r1(x), r1(z)]), w }); } } cur = []; };
  for (const p of l.p) { if (inMask(p[0], p[1])) flush(); else cur.push(p); }
  flush();
}

// ---------- 횡단보도 ----------
const liveX = liveTransit.crossings;
const crossings = pTransit.crossings.filter((c) => {
  if (inLive(c.x, c.z)) return false;
  if (liveX.some((l) => Math.hypot(l.x - c.x, l.z - c.z) < 8)) return false;
  const [dx, dz] = c.dir, nx = -dz, nz = dx, half = c.w / 2 + 3;
  for (const s of [-1, 0, 1]) if (terrain.baseHeight(c.x + nx * s * half, c.z + nz * s * half) !== 0 || terrain.baseHeight(c.x + dx * s * 4, c.z + dz * s * 4) !== 0) return false;
  return true;
}).map((c) => ({ x: c.x, z: c.z, dir: [+c.dir[0].toFixed(3), +c.dir[1].toFixed(3)], w: c.w, ...(c.sig ? { sig: 1 } : {}), ...(c.cl != null ? { cl: c.cl } : {}), ...(c.g ? { g: 1 } : {}) }));

// ---------- LOD (멀리 보이는 단순 형상) ----------
const KINDS = [...new Set([...Object.values(rOut).flat(), ...ch].map((r) => r.k))].sort();
const BKINDS = [...new Set(Object.values(bOut).flat().map((b) => b.k))].sort();
const LOD_ROAD = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service']);
const flat = (pts) => pts.flatMap(([x, z]) => [x, z]);
const lod = {};
for (const key of tileKeys) {
  const L = { b: [], r: [], f: [], p: [], w: [] };
  for (const b of bOut[key] || []) {
    if (b.nr) continue;
    const a = Math.abs(area(b.o));
    if (a < 60 && b.h < 12) continue;
    L.b.push([b.h, b.mh || 0, BKINDS.indexOf(b.k), flat(dpRing(b.o, 1.2))]);
  }
  for (const r of rOut[key] || []) {
    if (!LOD_ROAD.has(r.k) || r.w < 3) continue;
    const p = r.p.length > 3 ? [r.p[0], ...dp(r.p.slice(1, -1), 1.5), r.p[r.p.length - 1]] : r.p;
    L.r.push([r.w, KINDS.indexOf(r.k), flat(p), r.br ? 1 : 0]);
  }
  for (const f of floorOut[key] || []) L.f.push([flat(dpRing(f.o, 1)), ...(f.holes || []).map((h) => flat(dpRing(h, 1)))]);
  for (const p of parkOut[key]?.parks || []) L.p.push([p.k, flat(dpRing(p.o, 2)), ...(p.holes || []).map((h) => flat(dpRing(h, 2)))]);
  for (const w of waterOut[key]?.water || []) L.w.push([flat(dpRing(w.o, 2)), ...(w.holes || []).map((h) => flat(dpRing(h, 2)))]);
  lod[key] = L;
}

// ---------- 역 / 랜드마크 ----------
const STATION_EN = { sunae: 'Sunae', seohyeon: 'Seohyeon', imae: 'Imae', yatap: 'Yatap', moran: 'Moran', taepyeong: 'Taepyeong', gachon: 'Gachon Univ.', bokjeong: 'Bokjeong', jangji: 'Jangji', munjeong: 'Munjeong', garak: 'Garak Market', songpa: 'Songpa', seokchon: 'Seokchon', jamsil: 'Jamsil' };
const stations = pIndex.stations.filter((s) => s.id !== 'jeongja').map((s) => ({ id: s.id, name: s.name, nameEn: STATION_EN[s.id] || s.id, lines: s.lines.split(' · '), x: s.x, z: s.z, exits: (s.exits || []).slice(0, 12).map((e) => ({ x: e.x, z: e.z, ...(e.ref ? { ref: e.ref } : {}) })) }));
const landmarks = pIndex.landmarks.filter((l) => l.pos || l.fit).map((l) => ({ id: l.id, label: l.label || null, model: l.model || null, params: l.params || null, fit: l.fit || null, pos: l.pos || null, hide: l.hide || null }));

// ---------- 쓰기 ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'tiles'), { recursive: true });
if (tancheonStr) fs.writeFileSync(path.join(OUT, 'tancheon.json'), tancheonStr);
const tiles = {}; let tileBytes = 0;
for (const key of tileKeys) {
  const t = { b: bOut[key] || [], r: rOut[key] || [], parks: parkOut[key]?.parks || [], water: waterOut[key]?.water || [], floor: floorOut[key] || [], wl: wlOut[key] || [] };
  if (!t.b.length && !t.r.length && !t.floor.length && !t.parks.length && !t.water.length) continue;
  const s = JSON.stringify(t); tileBytes += s.length;
  fs.writeFileSync(path.join(OUT, 'tiles', key + '.json'), s);
  const [tx, tz] = key.split('_').map(Number);
  tiles[key] = { x0: tx * TS, z0: tz * TS, nb: t.b.length, nr: t.r.length };
}
const xs = Object.values(tiles).map((t) => t.x0), zs = Object.values(tiles).map((t) => t.z0);
const bounds = { x0: Math.min(...xs), x1: Math.max(...xs) + TS, z0: Math.min(...zs), z1: Math.max(...zs) + TS };
const base = { roadKinds: KINDS, buildingKinds: BKINDS, ch, chParks, crossings };
fs.mkdirSync(path.join(OUT, 'lod'), { recursive: true });
let lodBytes = 0;
for (const key of Object.keys(tiles)) { const s = JSON.stringify(lod[key]); lodBytes += s.length; fs.writeFileSync(path.join(OUT, 'lod', key + '.json'), s); }
const index = {
  meta: {
    name: 'Jeongja → Lotte World Tower corridor', tileSize: TS, liveBox: LB, bounds,
    generated: new Date().toISOString(),
    source: { corridorBake: pIndex.meta.generated, live: live.meta.generated },
    // 건물 높이 일부는 Vworld GIS건물통합정보(국토교통부)에서 보정됨 → 출처 표기 (이용 조건은 브이월드 약관 확인 필요)
    attribution: (pIndex.meta.sources?.attribution || '© OpenStreetMap contributors (ODbL)') + (pIndex.meta.sources?.vworld ? ' · 건물 높이: 브이월드 GIS건물통합정보 (국토교통부)' : ''),
    stats: { ...stat, ...rstat, tancheonAxis: T.axis.length, runs: runs.length, chRoads: chCount, chParks: chParks.length, crossings: crossings.length, tiles: Object.keys(tiles).length, tileMB: +(tileBytes / 1e6).toFixed(2) },
  },
  stations, landmarks, tiles,
};
const baseStr = JSON.stringify(base);
index.meta.stats.baseMB = +(baseStr.length / 1e6).toFixed(2);
index.meta.stats.lodMB = +(lodBytes / 1e6).toFixed(2);
fs.writeFileSync(path.join(OUT, 'base.json'), baseStr);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(JSON.stringify(index.meta.stats, null, 1));
