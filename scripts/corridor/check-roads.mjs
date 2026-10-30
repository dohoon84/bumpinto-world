// [corridor] 도로 연속성 검사 — 실제 렌더 지오메트리(world.js ribbonGeo)로 만든 삼각형 합집합에 대해 점 포함 검사.
//   1) 경로: 정자역 → 롯데월드타워 (성남대로·송파대로 우선 최단 경로), 5m 간격, 차로 폭 오프셋 0 / ±0.45 / ±0.9 × 반폭
//   2) 타일 경계: 타일로 나뉜 조각의 이음매 ±2 세그먼트를 0.5m 간격, ±0.9 반폭으로
//   3) 교차로: 차도 3갈래 이상 노드에서 각 도로 반폭 0.9 원 + 진입 6m 구간
//   4) 라이브/코리더 경계: 라이브 bbox 에서 잘리거나 라이브 도로와 겹친 조각의 이음매
// 사용: node scripts/corridor/check-roads.mjs [--dir=public/corridor] [--out=/tmp/check-roads.json]
import fs from 'node:fs';
import path from 'node:path';
import { ribbonGeo } from '../../src/world.js';
import { createTerrain } from '../../src/world/terrain.js';
import { mergeTancheon } from '../../src/corridor/tancheon.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const DIR = arg('dir', 'public/corridor'), OUT = arg('out', '');
const CAR = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link']);
const live = JSON.parse(fs.readFileSync('public/jeongja.json', 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base.json'), 'utf8'));
const LB = index.meta.liveBox;
// [corridor] 탄천 지형(라이브 + 연장): 경로가 하천 지형 아래로 꺼지지 않는지(다리 = 상판 높이) 확인용
const T0 = JSON.parse(fs.readFileSync('public/terrain.json', 'utf8'));
const tanF = path.join(DIR, 'tancheon.json');
const TT = fs.existsSync(tanF) ? mergeTancheon(T0, JSON.parse(fs.readFileSync(tanF, 'utf8'))) : T0;
const terr = createTerrain(TT, live);
const chA = base.ch.map((r) => ({ ...r, p: r.p.map((q) => q.slice()) }));
terr.annotate({ roads: chA, water: [], waterLines: [], parks: [] });
const brSegs = [];
for (const r of chA) if (r.br) for (let i = 1; i < r.p.length; i++) brSegs.push([r.p[i - 1][0], r.p[i - 1][1], r.p[i][0], r.p[i][1], r.w / 2 + 1]);
const onBridge = (x, z) => brSegs.some(([ax, az, bx, bz, hw]) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(ax + dx * t - x, az + dz * t - z) < hw; });

const roads = []; // { src: live|tile|ch, key, k, w, p, o }
for (const r of live.roads) if (CAR.has(r.k) && r.p.length >= 2) roads.push({ src: 'live', k: r.k, w: r.w, p: r.p, n: r.n });
for (const r of base.ch) if (CAR.has(r.k) && r.p.length >= 2) roads.push({ src: 'ch', k: r.k, w: r.w, p: r.p, n: r.n, o: r.o });
for (const key of Object.keys(index.tiles)) {
  const t = JSON.parse(fs.readFileSync(path.join(DIR, 'tiles', key + '.json'), 'utf8'));
  for (const r of t.r) if (CAR.has(r.k) && r.p.length >= 2) roads.push({ src: 'tile', key, k: r.k, w: r.w, p: r.p, n: r.n, o: r.o });
}
const lodRoads = [];
for (const key of Object.keys(index.tiles)) {
  const f = path.join(DIR, 'lod', key + '.json'); if (!fs.existsSync(f)) continue;
  const L = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [w, ki, fl] of L.r) { const p = []; for (let i = 0; i < fl.length; i += 2) p.push([fl[i], fl[i + 1]]); lodRoads.push({ src: 'lod', key, k: base.roadKinds[ki], w, p }); }
}

// ---------- 삼각형 격자 ----------
function triIndex(list, cell = 8) {
  const T = [], grid = new Map();
  for (const r of list) {
    const g = ribbonGeo(r.p, r.w, 0), P = g.attributes.position.array, I = g.index.array;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const t = [P[a], P[a + 2], P[b], P[b + 2], P[c], P[c + 2]], id = T.length; T.push(t);
      const x0 = Math.floor(Math.min(t[0], t[2], t[4]) / cell), x1 = Math.floor(Math.max(t[0], t[2], t[4]) / cell);
      const z0 = Math.floor(Math.min(t[1], t[3], t[5]) / cell), z1 = Math.floor(Math.max(t[1], t[3], t[5]) / cell);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(id); }
    }
    g.dispose();
  }
  const inTri = (px, pz, t) => {
    const [ax, az, bx, bz, cx, cz] = t;
    const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz), d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
    const e = 1e-7, neg = d1 < -e || d2 < -e || d3 < -e, pos = d1 > e || d2 > e || d3 > e;
    return !(neg && pos);
  };
  return { count: T.length, covered(x, z) { const l = grid.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell)); if (l) for (const id of l) if (inTri(x, z, T[id])) return true; return false; } };
}
console.time('index');
const detailIdx = triIndex(roads);
const lodIdx = triIndex(roads.filter((r) => r.src !== 'tile').concat(lodRoads));
console.timeEnd('index');

// ---------- 1) 경로 ----------
const K = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
const nodes = new Map(); const node = (x, z) => { const k = K(x, z); let n = nodes.get(k); if (!n) nodes.set(k, (n = { k, x, z, e: [] })); return n; };
const PREF = new Set(['성남대로', '송파대로']);
for (const r of roads) {
  const f = PREF.has(r.n) ? 1 : ['primary', 'trunk', 'secondary'].includes(r.k) ? 1.6 : 3;
  for (let i = 1; i < r.p.length; i++) {
    const a = node(r.p[i - 1][0], r.p[i - 1][1]), b = node(r.p[i][0], r.p[i][1]), L = Math.hypot(b.x - a.x, b.z - a.z);
    a.e.push({ to: b, c: L * f, w: r.w, n: r.n }); b.e.push({ to: a, c: L * f, w: r.w, n: r.n });
  }
}
// 이어지지 않은 끝점(라이브 bbox 절단점 등)은 가까운 점과 가상 간선(비용 ×20) — 실제로 틈이 있으면 표본 검사에서 드러난다
const ng = new Map(), NC = 12; for (const n of nodes.values()) { const k = Math.floor(n.x / NC) + ',' + Math.floor(n.z / NC); (ng.get(k) || ng.set(k, []).get(k)).push(n); }
let virt = 0;
for (const n of nodes.values()) {
  if (n.e.length !== 1) continue;
  let best = null, bd = 25;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const m of ng.get(Math.floor(n.x / NC) + i + ',' + (Math.floor(n.z / NC) + j)) || []) {
    if (m === n || m === n.e[0].to) continue; const d = Math.hypot(m.x - n.x, m.z - n.z); if (d < bd) { bd = d; best = m; }
  }
  if (best) { const w = n.e[0].w; n.e.push({ to: best, c: bd * 20 + 5, w, virt: 1 }); best.e.push({ to: n, c: bd * 20 + 5, w, virt: 1 }); virt++; }
}
const nearestNode = (x, z) => { let b = null, bd = Infinity; for (const n of nodes.values()) { if (n.e.every((e) => e.w < 15)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = n; } } return b; };
function dijkstra(s, t) {
  const dist = new Map([[s, 0]]), prev = new Map(), done = new Set();
  const heap = [[0, s]];
  const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, n] = pop(); if (done.has(n)) continue; done.add(n); if (n === t) break;
    for (const e of n.e) { const nd = d + e.c; if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, [n, e]); push(nd, e.to); } }
  }
  const out = []; let c = t; while (c && c !== s) { const p = prev.get(c); if (!p) return null; out.push({ a: p[0], b: c, e: p[1] }); c = p[0]; }
  return out.reverse();
}
const tower = index.landmarks.find((l) => l.id === 'lotte-world-tower'); const tp = tower.fit || tower.pos;
const S = nearestNode(live.station.x, live.station.z), E = nearestNode(tp.x, tp.z);
const route = dijkstra(S, E);
const res = { route: null, seams: null, junctions: null, liveSeam: null };
if (!route) { console.log('ROUTE NOT FOUND'); process.exit(1); }
{
  let len = 0, gaps = [], lodGaps = 0, samples = 0, virtUsed = 0, named = 0, sunk = [], onDeck = 0;
  let carry = 0;
  for (const { a, b, e } of route) {
    const L = Math.hypot(b.x - a.x, b.z - a.z); if (e.virt) virtUsed++;
    if (PREF.has(e.n)) named += L;
    const ux = (b.x - a.x) / (L || 1), uz = (b.z - a.z) / (L || 1), nx = -uz, nz = ux, hw = e.w / 2;
    for (let s = carry; s <= L; s += 5) {
      const x = a.x + ux * s, z = a.z + uz * s; samples++;
      if (terr.baseHeight(x, z) < -0.3) { if (onBridge(x, z)) onDeck++; else sunk.push([+x.toFixed(1), +z.toFixed(1)]); }
      for (const f of [0, 0.45, -0.45, 0.9, -0.9]) {
        const px = x + nx * hw * f, pz = z + nz * hw * f;
        if (!detailIdx.covered(px, pz)) gaps.push([+px.toFixed(1), +pz.toFixed(1), f]);
        if (!lodIdx.covered(px, pz)) lodGaps++;
      }
      carry = s + 5 - L;
    }
    len += L;
  }
  res.route = { lengthM: Math.round(len), samples, points: samples * 5, gaps: gaps.length, gapList: gaps.slice(0, 30), lodGaps, virtualEdgesUsed: virtUsed, seongnamSongpaShare: +(named / len).toFixed(3), tancheonAxis: TT.axis.length, overChannelOnDeck: onDeck, sunk: sunk.length, sunkList: sunk.slice(0, 20), from: [S.x, S.z], to: [E.x, E.z] };
}

// ---------- 2) 타일 경계 / 4) 라이브 경계 ----------
// 실패 점은 "이음매를 없앤(조각을 이어 붙인) 같은 도로"의 ribbon 으로 다시 검사한다.
//   그 ribbon 도 못 덮으면 = 원래 OSM 선형의 급커브에서 ribbonGeo 가 만드는 고유 노치(라이브 정자에도 같은 모양) → inherent
//   이어 붙인 ribbon 은 덮는데 실제 합집합이 못 덮으면 = 분할이 만든 균열 → crack
const vIndex = new Map(); // 정점 → [{ r, i }]
for (const r of roads) for (let i = 0; i < r.p.length; i++) { const k = K(r.p[i][0], r.p[i][1]); (vIndex.get(k) || vIndex.set(k, []).get(k)).push({ r, i }); }
function mergedAround(r, side) {
  // side 'h': r.p[0], r.p[1] 을 연속으로 가진 다른 조각 q → q.p[..j(p1)] + r.p[2..]
  const P = side === 'h' ? r.p : [...r.p].reverse();
  const [a, b] = [P[0], P[1]];
  for (const { r: q, i } of vIndex.get(K(a[0], a[1])) || []) {
    if (q === r) continue;
    const Q = q.p;
    if (i + 1 < Q.length && K(Q[i + 1][0], Q[i + 1][1]) === K(b[0], b[1])) return { pts: Q.slice(0, i + 2).concat(P.slice(2)), q };
    if (i - 1 >= 0 && K(Q[i - 1][0], Q[i - 1][1]) === K(b[0], b[1])) return { pts: [...Q].reverse().slice(0, Q.length - i + 1).concat(P.slice(2)), q };
  }
  return null;
}
function localIdx(pts, w) { return triIndex([{ p: pts, w }], 4); }
function seamCheck(r, i0, i1, ref) {
  let crack = 0, inherent = 0, n = 0;
  for (let i = Math.max(1, i0); i <= Math.min(r.p.length - 1, i1); i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, hw = r.w / 2;
    for (let s = 0; s <= L; s += 0.5) for (const f of [0, 0.9, -0.9]) {
      n++; const x = ax + ux * s - uz * hw * f, z = az + uz * s + ux * hw * f;
      if (detailIdx.covered(x, z)) continue;
      if (ref && ref.covered(x, z)) crack++; else inherent++;
    }
  }
  return { crack, inherent, n };
}
const inLive = (x, z) => x >= LB.x0 - 1 && x <= LB.x1 + 1 && z >= LB.z0 - 1 && z <= LB.z1 + 1;
{
  const acc = { tile: { seams: 0, points: 0, cracks: 0, inherentNotchPts: 0, noRef: 0, where: [] }, live: { seams: 0, points: 0, cracks: 0, inherentNotchPts: 0, clipped: 0, overlap: 0, noRef: 0, where: [] } };
  for (const r of roads) {
    if (r.src === 'live' || r.w < 3) continue;
    const [oh, ot] = r.o || [0, 0], last = r.p.length - 1;
    for (const [i, side, ov] of [[oh, 'h', oh], [last - ot, 't', ot]]) {
      const end = side === 'h' ? r.p[0] : r.p[last];
      let atLive = inLive(end[0], end[1]) || inLive(r.p[i][0], r.p[i][1]);
      if (!ov && !atLive) continue;
      const mm = ov ? mergedAround(r, side) : null, m = mm?.pts || null;
      if (mm?.q.src === 'live') atLive = true;
      const A = atLive ? acc.live : acc.tile;
      A.seams++;
      if (atLive) { if (ov) A.overlap++; else A.clipped++; }
      if (ov && !m) A.noRef++;
      // 겹침 없는 라이브 경계(bbox 절단점): 절단점에서 라이브 쪽 1m 연장선을 기준으로 삼는다
      let refPts = m;
      if (!refPts && atLive) {
        const P = side === 'h' ? r.p : [...r.p].reverse(), [x0, z0] = P[0], [x1, z1] = P[1], L = Math.hypot(x1 - x0, z1 - z0) || 1;
        refPts = [[x0 - ((x1 - x0) / L) * 1, z0 - ((z1 - z0) / L) * 1], ...P];
      }
      const ref = refPts ? localIdx(refPts, r.w) : null;
      const c = seamCheck(r, i - 2, i + 2, ref);
      A.points += c.n; A.inherentNotchPts += c.inherent;
      if (c.crack) { A.cracks++; A.where.push([...r.p[i].slice(0, 2), c.crack]); }
    }
  }
  acc.tile.where = acc.tile.where.slice(0, 20); acc.live.where = acc.live.where.slice(0, 20);
  res.seams = acc.tile; res.liveSeam = acc.live;
}

// ---------- 3) 교차로 ----------
// (a) 3갈래 이상 노드: 반지름 0.9 × (가장 좁은 진입 도로 반폭) 원판 32점
// (b) T 자 근접: 코리더 조각 끝점이 다른 도로 중심선 3m 안에 있으면 끝점→투영점 구간을 반폭 0.9 로 채워졌는지
{
  const deg = new Map();
  for (const r of roads) {
    if (r.w < 3) continue;
    for (let i = 0; i < r.p.length; i++) {
      const [x, z] = r.p[i]; if (inLive(x, z)) continue;
      const k = K(x, z); let d = deg.get(k); if (!d) deg.set(k, (d = { x, z, set: new Set(), minHw: Infinity }));
      d.minHw = Math.min(d.minHw, r.w / 2);
      for (const j of [i - 1, i + 1]) if (j >= 0 && j < r.p.length) d.set.add(K(r.p[j][0], r.p[j][1]));
    }
  }
  let junctions = 0, holes = 0, pts = 0; const where = [];
  for (const d of deg.values()) {
    if (d.set.size < 3) continue;
    junctions++; let bad = 0;
    for (const rr of [0.3, 0.6, 0.9]) for (let a = 0; a < 16; a++) { pts++; const t = (a / 16) * Math.PI * 2; if (!detailIdx.covered(d.x + Math.cos(t) * d.minHw * rr, d.z + Math.sin(t) * d.minHw * rr)) bad++; }
    if (bad) { holes++; where.push([d.x, d.z, bad]); }
  }
  // (b)
  const segGrid = new Map(), SC = 10;
  for (const r of roads) for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
    for (let gx = Math.floor(Math.min(ax, bx) / SC) - 1; gx <= Math.floor(Math.max(ax, bx) / SC) + 1; gx++) for (let gz = Math.floor(Math.min(az, bz) / SC) - 1; gz <= Math.floor(Math.max(az, bz) / SC) + 1; gz++) { const k = gx + ',' + gz; (segGrid.get(k) || segGrid.set(k, []).get(k)).push([r, i]); }
  }
  let tees = 0, teeHoles = 0; const teeWhere = [];
  for (const r of roads) {
    if (r.src === 'live' || r.w < 3) continue;
    for (const P of [r.p[0], r.p[r.p.length - 1]]) {
      const [x, z] = P; if (inLive(x, z)) continue;
      if ((vIndex.get(K(x, z)) || []).length > 1) continue; // 다른 도로와 정점 공유 = (a) 에서 검사
      let best = null, bd = 3;
      for (const [q, i] of segGrid.get(Math.floor(x / SC) + ',' + Math.floor(z / SC)) || []) {
        if (q === r) continue;
        const [ax, az] = q.p[i - 1], [bx, bz] = q.p[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
        if (d < bd && d > 0.05) { bd = d; best = [px, pz]; }
      }
      if (!best) continue;
      tees++; let bad = 0;
      const L = Math.hypot(best[0] - x, best[1] - z), ux = (best[0] - x) / L, uz = (best[1] - z) / L, hw = r.w / 2;
      for (let s = 0; s <= L; s += 0.25) for (const f of [0, 0.6, -0.6]) { pts++; if (!detailIdx.covered(x + ux * s - uz * hw * f, z + uz * s + ux * hw * f)) bad++; }
      if (bad) { teeHoles++; teeWhere.push([x, z, bad]); }
    }
  }
  res.junctions = { junctions, holes, tees, teeHoles, points: pts, where: where.slice(0, 20), teeWhere: teeWhere.slice(0, 20) };
}
res.meta = { roads: roads.length, lodRoads: lodRoads.length, detailTris: detailIdx.count, lodTris: lodIdx.count, virtualEdges: virt };
console.log(JSON.stringify(res, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
const fail = res.route.sunk + res.route.gaps + res.seams.cracks + res.junctions.holes + res.junctions.teeHoles + res.liveSeam.cracks;
process.exit(fail ? 2 : 0);
