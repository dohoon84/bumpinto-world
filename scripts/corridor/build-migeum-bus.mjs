// [migeum-bus] 미금역 일대 버스(시뮬 전용) — 판교 PR #10(build-pangyo-link.mjs)과 같은 방식: GBIS 정류소 순서 + OSM 차도 최단 경로
//
//   입력: data/gbis_migeum_stations.json  (scripts/corridor/fetch-gbis-routes.mjs --want=… 로 받은 GBIS getBusRouteStationListv2 스냅샷)
//         ../bumpinto-world/data/raw/osm_merged.json + data/osm_migeum_raw.json (OSM 차도, ODbL)
//         public/corridor/{index,transit,jz-sim}.json · pangyo/link.json · migeum/{index.json,tiles/*} · public/{transit,jeongja}.json
//   출력: public/corridor/migeum/bus.json
//     live     : 정자 bbox 안 조각 → src/game.js 가 ?bus=sim 일 때만 덧붙임(mergeMigeumBus)
//     corridor : 정자 bbox 밖(코리더 + 미금 9칸) 조각 + 새 정류장 + 기존 정류장에 더할 노선 번호 → corridor life 가 덧붙임
//   범위: 정류소 중 '남쪽 영역'(정자 bbox ∪ 정자 bbox 남쪽(z ≥ liveBox.z1)의 코리더 타일 ∪ 미금 박스) 안에서 연속이고 미금 박스 정류소를
//         하나 이상 포함하는 구간만. 구간 앞/뒤는 바깥 정류소 쪽으로 이어서 영역 경계에서 자른다
//         (정자 bbox 경계 = 기존 정자/코리더 경로와 이어지는 곳, 미금 박스 바깥 = 게임 범위 밖 → 15m 안쪽에서 끝).
//   기존 경로와 겹침: 같은 번호·같은 방향 기존 경로가 새 조각을 90% 이상 덮으면 새 조각은 'skipIf'(기존 그대로),
//         새 조각이 기존 경로를 80% 이상 덮으면 'replace'(그 자리에 새 조각, 경로 번호 유지). 런타임에서 그 기존 경로가 있을 때만 적용.
//         → ?migeumbus=0 / ?migeum=0 이면 이 파일을 읽지 않으므로 기존 정자/판교/코리더 버스 데이터는 그대로.
//   사용: node scripts/corridor/build-migeum-bus.mjs [--gbis=data/gbis_migeum_stations.json] [--out=public/corridor/migeum/bus.json]
import fs from 'node:fs';
import path from 'node:path';
import { buildRoadGraph, snapCandidates, routeSegs, chainPts } from './gbis-route.mjs';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OSM = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OSM_MG = path.resolve(ROOT, arg('osmMigeum', 'data/osm_migeum_raw.json'));
const GBIS = path.resolve(ROOT, arg('gbis', 'data/gbis_migeum_stations.json'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/migeum/bus.json'));
const C = path.join(ROOT, 'public/corridor');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const LEAD_IN = 80, TAIL_OUT = 40, EDGE_TRIM = 15, MIN_PIECE = 150;

const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const plen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; };
const normN = (s) => String(s || '').replace(/[\s().·]/g, '').replace(/마을$/, '');

const CI = readJSON(path.join(C, 'index.json')), MG = readJSON(path.join(C, 'migeum/index.json'));
const CT = readJSON(path.join(C, 'transit.json')), JZS = readJSON(path.join(C, 'jz-sim.json')), LINK = readJSON(path.join(C, 'pangyo/link.json'));
const JZT = readJSON(path.join(ROOT, 'public/transit.json'));
const LB = CI.meta.liveBox, B = CI.meta.bounds, TS = CI.meta.tileSize, MB = MG.meta.box;
const inLive = ([x, z]) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
const tileKey = ([x, z]) => `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;
const okOld = (p) => !inLive(p) && p[0] >= B.x0 && p[0] <= B.x1 && p[1] >= B.z0 && p[1] <= B.z1 && !!CI.tiles[tileKey(p)];
const inMB = ([x, z]) => x >= MB.x0 && x <= MB.x1 && z >= MB.z0 && z <= MB.z1;
const inR = (p) => inLive(p) || (p[1] >= LB.z1 && (okOld(p) || inMB(p)));
const lab = (p) => (inLive(p) ? 'L' : inR(p) ? 'C' : 'X');

// ---------- 게임에 그려진 차도(연속성 확인용): 코리더 타일 + 미금 타일 + 탄천 띠 + 정자 ----------
const FOOT = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway', 'corridor', 'service']);
export function loadDrawnRoads() {
  const roads = [];
  const add = (list) => { for (const r of list || []) if (!FOOT.has(r.k) && r.p?.length > 1) roads.push(r); };
  for (const k of Object.keys(CI.tiles)) { const f = path.join(C, 'tiles', k + '.json'); if (fs.existsSync(f)) add(readJSON(f).r); }
  for (const k of Object.keys(MG.tiles)) { const f = path.join(C, 'migeum/tiles', k + '.json'); if (fs.existsSync(f)) add(readJSON(f).r); }
  add(readJSON(path.join(C, 'base.json')).ch);
  add(readJSON(path.join(ROOT, 'public/jeongja.json')).roads);
  const G = new Map(), CELL = 50;
  roads.forEach((r, ri) => { for (let j = 1; j < r.p.length; j++) {
    const [ax, az] = r.p[j - 1], [bx, bz] = r.p[j];
    for (let x = Math.floor(Math.min(ax, bx) / CELL) - 1; x <= Math.floor(Math.max(ax, bx) / CELL) + 1; x++) for (let z = Math.floor(Math.min(az, bz) / CELL) - 1; z <= Math.floor(Math.max(az, bz) / CELL) + 1; z++) { const k = x + ',' + z; (G.get(k) || G.set(k, []).get(k)).push([ri, j]); }
  } });
  return (x, z) => {
    let bd = Infinity;
    for (const [ri, j] of G.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      const r = roads[ri], [ax, az] = r.p[j - 1], [bx, bz] = r.p[j], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d - (r.w || 6) / 2 < bd) bd = d - (r.w || 6) / 2;
    }
    return bd;
  };
}

// 점 → 폴리라인 투영
const project1 = (p, x, z) => { let best = { d: Infinity, s: 0, dx: 1, dz: 0 }, a = 0; for (let i = 1; i < p.length; i++) { const [ax, az] = p[i - 1], [bx, bz] = p[i], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))), d = Math.hypot(ax + dx * t - x, az + dz * t - z); if (d < best.d) best = { d, s: a + t * L, dx: dx / L, dz: dz / L, px: ax + dx * t, pz: az + dz * t }; a += L; } return best; };
const sample = (p, step = 4) => { const o = []; for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i], L = dist(a, b), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) o.push({ x: a[0] + (b[0] - a[0]) * k / n, z: a[1] + (b[1] - a[1]) * k / n, dx: (b[0] - a[0]) / (L || 1), dz: (b[1] - a[1]) / (L || 1) }); } const l = p[p.length - 1]; o.push({ x: l[0], z: l[1], dx: o.at(-1)?.dx ?? 1, dz: o.at(-1)?.dz ?? 0 }); return o; };
// A 의 표본 중 B 위 8m 안·같은 방향인 비율
const cover = (A, Bp) => { const s = sample(A); let n = 0; for (const q of s) { const pr = project1(Bp, q.x, q.z); if (pr.d < 8 && pr.dx * q.dx + pr.dz * q.dz > 0.5) n++; } return n / s.length; };
const subRange = (p, a, b) => { const o = []; let acc = 0; const at = (i, t) => [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; for (let i = 1; i < p.length; i++) { const d = dist(p[i - 1], p[i]); const s0 = acc, s1 = acc + d; if (s1 >= a && s0 <= b) { if (!o.length) o.push(at(i, d ? Math.max(0, (a - s0) / d) : 0)); if (s1 <= b) o.push(p[i]); else { o.push(at(i, (b - s0) / d)); break; } } acc = s1; } return o; };
const trimTo = (p, L) => { const o = [p[0]]; let a = 0; for (let i = 1; i < p.length; i++) { const d = dist(p[i - 1], p[i]); if (a + d >= L) { const t = (L - a) / d; o.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]); return o; } o.push(p[i]); a += d; } return o; };
const tidy = (a) => { const o = []; for (const p of a) { const q = [r1(p[0]), r1(p[1])]; const l = o[o.length - 1]; if (!l || dist(l, q) > 0.05) o.push(q); } return o; };
// 라벨(L/C/X) 바뀌는 곳에서 이분법으로 정확히 자른 조각
function splitPieces(full) {
  const pieces = []; let cur = null, acc = 0;
  const start = (k, p, s) => { cur = { k, pts: [p], s0: s }; pieces.push(cur); };
  start(lab(full[0]), full[0], 0);
  for (let i = 1; i < full.length; i++) {
    const a = full[i - 1], b = full[i], L = dist(a, b), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 1; k <= n; k++) {
      const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], s = acc + (L * k) / n, kk = lab(p);
      if (kk !== cur.k) {
        let lo = [a[0] + ((b[0] - a[0]) * (k - 1)) / n, a[1] + ((b[1] - a[1]) * (k - 1)) / n], hi = p;
        for (let it = 0; it < 20; it++) { const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]; if (lab(m) === lab(lo)) lo = m; else hi = m; }
        const q = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], sq = s - dist(q, p);
        cur.pts.push(q); cur.s1 = sq; start(kk, q, sq);
      }
    }
    cur.pts.push(b); acc += L;
  }
  cur.s1 = acc;
  for (const pc of pieces) { pc.pts = tidy(pc.pts); pc.L = plen(pc.pts); }
  return pieces;
}

function main() {
  const GB = readJSON(GBIS);
  const els = readJSON(OSM).elements;
  const seen = new Set(els.filter((e) => e.type === 'way').map((e) => e.id));
  for (const e of readJSON(OSM_MG).elements) if (e.type === 'way' && e.tags?.highway && !seen.has(e.id)) els.push(e);
  const near = ([x, z]) => x >= -2500 && x <= 3500 && z >= LB.z0 - 2500 && z <= MB.z1 + 600;
  const G = buildRoadGraph(els, proj, near);
  const wayById = new Map(els.filter((e) => e.type === 'way').map((e) => [e.id, e]));
  const gap = loadDrawnRoads();
  // 그래프 위 가장 가까운 점(정류소가 OSM 범위 밖이면 범위 끝 쪽 차도) — 구간 밖 정류소 방향 잇기에만 씀
  const nearestOnGraph = (x, z, R) => { let c = snapCandidates(G, x, z, 80); if (c.length) return c[0]; let best = null; for (const s of G.segs) { const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len)), px = s.ax + (s.bx - s.ax) * t, pz = s.az + (s.bz - s.az) * t, d = Math.hypot(px - x, pz - z); if (d < R && (!best || d < best.d)) best = { si: s.i, t, d, x: px, z: pz, score: d }; } return best; };

  // 구간 밖 정류소가 차도 그래프(OSM 범위) 밖이면: 영역(inR) 끝 40m 안쪽 차도 점 중 그 정류소 쪽에 가까운 것으로 잇는다(추정)
  const edgeTargets = G.segs.filter((s) => { const m = [(s.ax + s.bx) / 2, (s.az + s.bz) / 2]; if (!inR(m) || inLive(m)) return false; return ['x0', 'x1', 'z1'].some((k) => Math.abs((k[0] === 'x' ? m[0] : m[1]) - MB[k]) < 40) && (s.k !== 'residential' && s.k !== 'unclassified'); });
  const towardEdge = (from, x, z, outward) => {
    const cands = edgeTargets.map((s) => ({ s, d: Math.hypot((s.ax + s.bx) / 2 - x, (s.az + s.bz) / 2 - z) })).sort((a, b) => a.d - b.d).slice(0, 12);
    let best = null;
    for (const { s, d } of cands) {
      const c = { si: s.i, t: 0.5, x: (s.ax + s.bx) / 2, z: (s.az + s.bz) / 2 };
      const r = outward ? routeSegs(G, from, c, 6000) : routeSegs(G, c, from, 6000);
      if (!r) continue;
      const sc = r.cost + d;
      if (!best || sc < best.sc) best = { c, r, sc };
    }
    return best;
  };
  const livePool = JZT.stops.map((s) => ({ s, refs: String(s.ref || '').split(';') }));
  const corPool = [...CT.stops, ...(LINK.corridor?.stops || [])].map((s) => ({ s, refs: String(s.ref || '').split(';') }));
  const matchStop = (pool, g, gx, gz) => {
    const cand = pool.map(({ s, refs }) => ({ s, d: Math.hypot(s.x - gx, s.z - gz), byRef: !!g.no && refs.includes(g.no), byName: normN(s.name) === normN(g.name) }))
      .filter((c) => (c.byRef && c.d < 80) || (c.byName && c.d < 45)).sort((a, b) => (b.byRef - a.byRef) || (a.d - b.d));
    return cand[0] || null;
  };
  const existing = { live: [...JZT.paths.map((p) => ({ p, from: 'public/transit.json' })), ...JZS.paths.map((p) => ({ p, from: 'corridor/jz-sim.json' })), ...(LINK.live?.paths || []).map((p) => ({ p, from: 'corridor/pangyo/link.json live' }))],
    corridor: [...CT.paths.map((p) => ({ p, from: 'corridor/transit.json' })), ...(LINK.corridor?.paths || []).map((p) => ({ p, from: 'corridor/pangyo/link.json corridor' }))] };
  const refEq = (a, b) => a === b || (a === 'G8110' && b === '8110') || (a === '8110' && b === 'G8110');

  const out = { live: { routes: [], paths: [] }, corridor: { routes: [], paths: [], stops: [], addRoute: [] } };
  const report = [];
  for (const GR of GB.routes) {
    const ref = GR.ref, village = GR.routeTypeName === '마을버스';
    const typ = village ? 'village' : /직행좌석/.test(GR.routeTypeName) ? 'express' : 'city';
    const short = village ? '마을' : /직행좌석/.test(GR.routeTypeName) ? '직좌' : '일반';
    const ctR = CT.routes.find((r) => r.ref === ref), lvR = [...JZT.routes, ...JZS.routes, ...(LINK.live?.routes || [])].find((r) => refEq(r.ref, ref)) || (ref === 'G8110' ? LINK.live?.routes?.[0] : null);
    const base = { ref, name: `${ref}번`, network: '', operator: '', type: typ, src: 'gbis', gbis: `${short} · ${GR.adminName.replace('경기도 ', '')} · ${GR.start}↔${GR.end}`, gbisRouteId: GR.routeId, geom: 'gbis-routed', confirmed: true };
    const corRoute = { ...base, id: ctR?.id ?? (ref === 'G8110' ? LINK.corridor.routes[0].id : `gbis-${GR.routeId}`) };
    const liveRoute = { ...base, id: lvR?.id ?? `gbis-${GR.routeId}` };
    const rep = { ref, routeId: GR.routeId, routeTypeName: GR.routeTypeName, adminName: GR.adminName, start: GR.start, end: GR.end, gbisStations: GR.stations.length, dirs: [] };
    report.push(rep);
    const ti = GR.stations.findIndex((s) => s.seq === GR.turnSeq);
    const dirs = [GR.stations.slice(0, ti + 1), GR.stations.slice(ti)];
    let usedLive = false, usedCor = false;
    dirs.forEach((list, dir) => {
      const P = list.map((s) => { const [x, z] = proj(s); return { g: s, x, z, R: inR([x, z]), M: inMB([x, z]) }; });
      // 남쪽 영역 안 연속 구간 중 미금 박스 정류소가 있는 것
      const runs = []; let cur = null;
      P.forEach((q, i) => { if (q.R) { if (!cur) runs.push(cur = { i0: i, i1: i }); else cur.i1 = i; } else cur = null; });
      for (const run of runs.filter((r) => P.slice(r.i0, r.i1 + 1).some((q) => q.M))) {
        const sts = P.slice(run.i0, run.i1 + 1);
        const prev = P[run.i0 - 1], next = P[run.i1 + 1];
        const drep = { dir, gbisSeq: [sts[0].g.seq, sts.at(-1).g.seq], stopsInArea: sts.map((q) => `${q.g.seq} ${q.g.name}${q.g.no ? ' ' + q.g.no : ''}`), prev: prev ? `${prev.g.seq} ${prev.g.name}` : null, next: next ? `${next.g.seq} ${next.g.name}` : null, legs: [], pieces: [], cuts: [], stops: [] };
        rep.dirs.push(drep);
        // Viterbi (build-transit.mjs / build-pangyo-link.mjs 와 같은 방식)
        const VC = [];
        VC[0] = snapCandidates(G, sts[0].x, sts[0].z).slice(0, 4).map((c) => ({ ...c, acc: c.score * 3 }));
        if (!VC[0].length) throw new Error(`${ref} ${sts[0].g.name}: 차도 후보 없음`);
        for (let i = 1; i < sts.length; i++) {
          const straight = Math.hypot(sts[i].x - sts[i - 1].x, sts[i].z - sts[i - 1].z), cc = [];
          for (const c of snapCandidates(G, sts[i].x, sts[i].z).slice(0, 4)) {
            let best = null;
            for (const pc of VC[i - 1]) { const r = routeSegs(G, pc, c, straight * 4 + 1500); if (!r) continue; const acc = pc.acc + r.cost + c.score * 3; if (!best || acc < best.acc) best = { ...c, acc, prev: pc, chain: r.chain }; }
            if (best) cc.push(best);
          }
          if (!cc.length) throw new Error(`${ref} dir${dir} ${sts[i - 1].g.name} → ${sts[i].g.name}: 차도 경로 없음`);
          VC[i] = cc;
        }
        let pk = VC[VC.length - 1].reduce((a, b) => (b.acc < a.acc ? b : a));
        const picks = [pk]; while (pk.prev) { pk = pk.prev; picks.push(pk); } picks.reverse();
        const pts = [], stS = [];
        const add = (p) => { const l = pts[pts.length - 1]; if (!l || dist(l, p) > 0.3) pts.push([p[0], p[1]]); };
        // 앞: 이전 정류소(영역 밖)에서 첫 정류소까지 경로의 영역 안 부분. 이전 정류소가 없으면(기점) 같은 차로 LEAD_IN m
        let headCut = null;
        if (prev) {
          const pc = nearestOnGraph(prev.x, prev.z, 700);
          const r = pc ? routeSegs(G, pc, picks[0], dist([prev.x, prev.z], [sts[0].x, sts[0].z]) * 4 + 2500) : null;
          if (r) { const hp = chainPts(G, pc, picks[0], r.chain); let k = hp.length - 1; while (k > 0 && inR(hp[k - 1])) k--; const seg = hp.slice(Math.max(0, k - 1)); for (const p of seg) add(p); headCut = 'prev'; }
          else { const e = towardEdge(picks[0], prev.x, prev.z, false); if (e) { for (const p of chainPts(G, e.c, picks[0], e.r.chain)) add(p); headCut = 'prev'; drep.cuts.push(`시작: 이전 정류소 ${prev.g.name}(${Math.round(prev.x)},${Math.round(prev.z)})가 차도 자료 범위 밖 → 그쪽 게임 범위 끝 차도에서 시작(추정)`); } }
        }
        if (!headCut) {
          const S = G.segs; let s = S[picks[0].si], bk = [[picks[0].x, picks[0].z], [s.ax, s.az]], acc = picks[0].t * s.len;
          while (acc < LEAD_IN) { const prevs = S.filter((q) => q.b === s.a && q.a !== s.b).sort((a, b) => (b.dx * s.dx + b.dz * s.dz) - (a.dx * s.dx + a.dz * s.dz)); if (!prevs.length) break; s = prevs[0]; acc += s.len; bk.push([s.ax, s.az]); }
          let Lb = 0; const lead = [bk[0]];
          for (let i = 1; i < bk.length; i++) { const d = dist(bk[i - 1], bk[i]); if (Lb + d >= LEAD_IN) { const t = (LEAD_IN - Lb) / d; lead.push([bk[i - 1][0] + (bk[i][0] - bk[i - 1][0]) * t, bk[i - 1][1] + (bk[i][1] - bk[i - 1][1]) * t]); break; } lead.push(bk[i]); Lb += d; }
          for (const p of lead.reverse()) add(p);
          headCut = 'lead-in';
        }
        stS.push(project1(pts.length > 1 ? pts : [pts[0], [picks[0].x, picks[0].z]], picks[0].x, picks[0].z).s);
        add([picks[0].x, picks[0].z]); stS[0] = plen(pts);
        for (let k = 1; k < picks.length; k++) {
          const leg = chainPts(G, picks[k - 1], picks[k], picks[k].chain);
          drep.legs.push({ from: sts[k - 1].g.name, to: sts[k].g.name, m: Math.round(plen(leg)), straight: Math.round(dist([sts[k - 1].x, sts[k - 1].z], [sts[k].x, sts[k].z])), roads: [...new Set(picks[k].chain.map((si) => wayById.get(G.segs[si].way)?.tags?.name || G.segs[si].k))] });
          for (const p of leg) add(p);
          stS.push(plen(pts));
        }
        // 뒤: 다음 정류소(영역 밖) 쪽으로 영역 경계까지
        let tailCut = 'last-stop';
        if (next) {
          const tc = nearestOnGraph(next.x, next.z, 700), last = picks[picks.length - 1];
          const r = tc ? routeSegs(G, last, tc, dist([next.x, next.z], [sts.at(-1).x, sts.at(-1).z]) * 4 + 2500) : null;
          if (r) { const tp = chainPts(G, last, tc, r.chain); for (let i = 1; i < tp.length; i++) { add(tp[i]); if (!inR(tp[i])) break; } tailCut = 'next'; }
          else { const e = towardEdge(last, next.x, next.z, true); if (e) { for (const p of chainPts(G, last, e.c, e.r.chain)) add(p); tailCut = 'next'; drep.cuts.push(`끝: 다음 정류소 ${next.g.name}(${Math.round(next.x)},${Math.round(next.z)})가 차도 자료 범위 밖 → 그쪽 게임 범위 끝 차도까지(추정)`); } }
        }
        if (!next) { // 종점: 마지막 정류장에 서도록 같은 차로로 TAIL_OUT m 더(시뮬 정차 규칙: 경로 끝 8m 안 정류장은 안 섬)
          const S = G.segs, last = picks[picks.length - 1]; let sg = S[last.si], acc = (1 - last.t) * sg.len; add([sg.bx, sg.bz]);
          while (acc < TAIL_OUT) { const nx = (G.out.get(sg.b) || []).map((i) => S[i]).filter((q) => q.b !== sg.a).sort((a, b) => (b.dx * sg.dx + b.dz * sg.dz) - (a.dx * sg.dx + a.dz * sg.dz)); if (!nx.length) break; sg = nx[0]; acc += sg.len; add([sg.bx, sg.bz]); }
          const over = acc - TAIL_OUT; if (over > 0) { const L0 = plen(pts); pts.splice(0, pts.length, ...trimTo(pts, L0 - over)); }
          tailCut = 'terminus';
        }
        // 영역 밖으로 나간 끝부분 잘라내기 + 게임 범위 끝(미금 박스 바깥)이면 15m 안쪽
        const pieces0 = splitPieces(pts);
        // 첫/끝 X 조각 제거
        while (pieces0.length && pieces0[0].k === 'X') pieces0.shift();
        while (pieces0.length && pieces0.at(-1).k === 'X') pieces0.pop();
        for (const pc of pieces0) if (pc.k === 'X') drep.cuts.push(`중간 영역 밖 ${Math.round(pc.L)}m (${pc.pts[0]}…${pc.pts.at(-1)}) — 그 사이는 그리지 않음`);
        const pieces = [];
        const onLiveEdge = ([x, z]) => x >= LB.x0 - 1 && x <= LB.x1 + 1 && z >= LB.z0 - 1 && z <= LB.z1 + 1 && (Math.abs(x - LB.x0) < 0.5 || Math.abs(x - LB.x1) < 0.5 || Math.abs(z - LB.z0) < 0.5 || Math.abs(z - LB.z1) < 0.5);
        const kept = pieces0.filter((p) => p.k !== 'X');
        for (const pc0 of kept) {
          if (pc0.k === 'L') { pieces.push(pc0); continue; }
          // 코리더/미금 조각: 게임에 그려진 차도(가장자리 2m) 밖 구간은 뺀다 — 끝부분은 길이와 상관없이, 중간은 10m 이상일 때
          //   (예: 탄천 띠 위 돌마교는 미금 타일·탄천 다리 목록에 없어 하도 높이(-6m 대)로 떨어지므로 그 앞뒤에서 자름)
          //   자른 쪽 끝과 게임 범위 끝(정자 bbox 경계가 아닌 끝)은 15m 더 안쪽에서 끝(버스가 페이드)
          const sm = []; { let acc = 0; for (let i = 1; i < pc0.pts.length; i++) { const A = pc0.pts[i - 1], Bq = pc0.pts[i], L = dist(A, Bq), n = Math.max(1, Math.ceil(L)); for (let k = 0; k < n; k++) sm.push({ s: acc + L * k / n, off: gap(A[0] + (Bq[0] - A[0]) * k / n, A[1] + (Bq[1] - A[1]) * k / n) > 2 }); acc += L; } sm.push({ s: acc, off: gap(...pc0.pts.at(-1)) > 2 }); }
          const runs = []; let r0 = null;
          sm.forEach((q, i) => { if (q.off) { if (r0 == null) r0 = i; } else if (r0 != null) { runs.push([r0, i - 1]); r0 = null; } }); if (r0 != null) runs.push([r0, sm.length - 1]);
          const offRuns = runs.filter(([i, j]) => i === 0 || j === sm.length - 1 || sm[j].s - sm[i].s >= 10).map(([i, j]) => [sm[i].s, sm[j].s]);
          const iv = []; let at = 0;
          for (const [x0, x1] of offRuns) { if (x0 > at) iv.push([at, x0, at > 0]); at = x1; }
          if (at < pc0.L) iv.push([at, pc0.L, at > 0]);
          for (const [x0, x1] of offRuns) if (x1 - x0 > 1) { const pa = subRange(pc0.pts, x0, x1); drep.cuts.push(`그려진 차도 밖 ${Math.round(x1 - x0)}m 제외 (${tidy([pa[0]])[0]}…${tidy([pa.at(-1)])[0]})`); }
          const startEdge = pc0 === kept[0] && headCut === 'prev' && !onLiveEdge(pc0.pts[0]), endEdge = pc0 === kept.at(-1) && tailCut === 'next' && !onLiveEdge(pc0.pts.at(-1));
          iv.forEach(([x0, x1, cutStart], ii) => {
            const cutEnd = x1 < pc0.L - 0.01;
            const a0 = x0 + ((cutStart || (x0 === 0 && startEdge)) ? EDGE_TRIM : 0), a1 = x1 - ((cutEnd || endEdge) ? EDGE_TRIM : 0);
            if (a1 - a0 < 1) return;
            const sub = tidy(subRange(pc0.pts, a0, a1));
            pieces.push({ k: 'C', pts: sub, s0: pc0.s0 + a0, L: plen(sub) });
          });
          if (startEdge) drep.cuts.push(`시작: 게임 범위 경계 ${pc0.pts[0]} (이전 정류소 ${prev?.g.name ?? '-'} 방향) — 15m 안쪽에서 시작`);
          if (endEdge) drep.cuts.push(`끝: 게임 범위 경계 ${pc0.pts.at(-1)} (다음 정류소 ${next?.g.name ?? '-'} 방향) — 15m 안쪽에서 끝`);
        }
        for (const pc of pieces) {
          const sys = pc.k === 'L' ? 'live' : 'corridor';
          if (pc.L < MIN_PIECE) { drep.pieces.push({ k: pc.k, m: Math.round(pc.L), result: `짧아서 뺌(<${MIN_PIECE}m)` }); continue; }
          const stops = [];
          for (let k = 0; k < sts.length; k++) {
            const s = stS[k] - pc.s0; if (!(s > 8 && s < pc.L - 8)) continue;
            const st = sts[k], q = project1(pc.pts, st.x, st.z);
            if (sys === 'live') {
              const m = matchStop(livePool, st.g, st.x, st.z);
              if (!m) { drep.stops.push(`L ${st.g.name}: 정자 정류장 없음(정차 안 함)`); continue; }
              stops.push({ stop: m.s.id, s: r1(q.s) }); drep.stops.push(`L ${st.g.name} → 기존 ${m.s.id} (${m.byRef ? '번호' : '이름'}, ${r1(m.d)}m)`);
            } else {
              // 기존 코리더 정류장은 번호/이름으로, 이번에 새로 만든 정류장은 같은 GBIS 정류소(stationId)일 때만 같이 쓴다(길 건너편 같은 이름 정류소는 따로)
              const mine = out.corridor.stops.find((s) => s.gbisId === st.g.id);
              const m = mine ? { s: mine, d: 0, byRef: true } : matchStop(corPool, st.g, st.x, st.z);
              let so = m?.s;
              if (!so) {
                const dx = st.x - q.px, dz = st.z - q.pz, dd = Math.hypot(dx, dz) || 1;
                so = { id: 'g' + st.g.id, gbisId: st.g.id, name: st.g.name, ref: st.g.no || '', x: r1(st.x), z: r1(st.z), routes: [ref], rd: [r3(q.dx), r3(q.dz)], tr: [r3(dx / dd), r3(dz / dd)], rdist: r1(dd), src: 'gbis' };
                out.corridor.stops.push(so); drep.stops.push(`C ${st.g.name} → 새 정류장 ${so.id} (GBIS 좌표, 차로에서 ${r1(dd)}m)`);
              } else {
                if (out.corridor.stops.includes(so)) { if (!so.routes.includes(ref)) so.routes.push(ref); }
                else if (!(so.routes || []).includes(ref) && !out.corridor.addRoute.some(([id, r]) => id === so.id && r === ref)) out.corridor.addRoute.push([so.id, ref]);
                drep.stops.push(`C ${st.g.name} → ${out.corridor.stops.includes(so) ? '새' : '기존'} ${so.id} (${m.byRef ? '번호' : '이름'}, ${r1(m.d)}m)`);
              }
              stops.push({ stop: so.id, s: r1(q.s) });
            }
          }
          if (sys === 'corridor' && !stops.length && !onLiveEdge(pc.pts[0]) && !onLiveEdge(pc.pts.at(-1))) { drep.pieces.push({ k: pc.k, m: Math.round(pc.L), from: pc.pts[0], to: pc.pts.at(-1), result: '정류장 없고 정자 경계와도 안 이어져서 뺌' }); continue; }
          const P2 = { route: sys === 'live' ? liveRoute.id : corRoute.id, ref, pts: pc.pts, len: Math.round(pc.L), stops, src: 'gbis-routed', dir };
          const skipIf = [], replace = [];
          for (const { p: E, from } of existing[sys]) {
            if (!refEq(E.ref, ref)) continue;
            const cN = cover(P2.pts, E.pts), sameEnds = dist(P2.pts[0], E.pts[0]) < 10 && dist(P2.pts.at(-1), E.pts.at(-1)) < 10;
            // 기존 경로가 거의 다 덮거나, 양 끝이 같고(정자 bbox 경계↔경계) 60% 이상 겹치면 기존 것 유지(OSM 형상 경로와 길 일부만 다른 경우)
            // 단, 새 조각의 정자 bbox 경계 끝(코리더 조각과 이어지는 곳)에 기존 경로 끝이 10m 안에 없으면 이어 타기가 안 되므로 유지하지 않음
            const edgeOk = [P2.pts[0], P2.pts.at(-1)].every((q, i) => !onLiveEdge(q) || dist(q, i ? E.pts.at(-1) : E.pts[0]) < 10);
            if ((cN >= 0.9 || (sameEnds && cN >= 0.6)) && edgeOk) { skipIf.push({ from, a: E.pts[0], b: E.pts.at(-1), coverNew: r3(cN) }); continue; }
            const cE = cover(E.pts, P2.pts); if (cE >= 0.8) replace.push({ from, a: E.pts[0], b: E.pts.at(-1), coverOld: r3(cE), coverNew: r3(cN) });
            else if (cN > 0.2 || cE > 0.2) drep.cuts.push(`겹침 주의: ${from} ${E.ref} ${E.pts[0]}…${E.pts.at(-1)} 새 조각 덮음 ${r3(cN)} / 기존 덮음 ${r3(cE)}`);
          }
          if (skipIf.length) P2.skipIf = skipIf.map(({ a, b }) => [a, b]);
          if (replace.length) P2.replace = replace.map(({ a, b }) => [a, b]);
          // 연속성(그려진 차도 가장자리 밖 거리)
          let mx = -Infinity, n = 0, over = 0, maxAt = null;
          for (const q of sample(pc.pts, 1)) { const g = gap(q.x, q.z); n++; if (g > mx) { mx = Math.min(g, 999); maxAt = [r1(q.x), r1(q.z)]; } if (g > 2) over++; }
          drep.pieces.push({ k: pc.k, m: Math.round(pc.L), from: pc.pts[0], to: pc.pts.at(-1), stops: stops.length, result: skipIf.length ? `기존 경로가 덮음 → 기존 유지(${skipIf.map((s) => s.from).join(', ')})` : replace.length ? `기존 경로 대체(${replace.map((s) => `${s.from} ${s.a}…${s.b} 기존 ${s.coverOld}`).join(', ')})` : '새 경로', gapMaxM: r1(mx), gapAt: maxAt, over2m: over, samples: n });
          out[sys].paths.push(P2);
          if (sys === 'live') usedLive = true; else usedCor = true;
        }
      }
    });
    if (usedLive) out.live.routes.push(liveRoute);
    if (usedCor) out.corridor.routes.push(corRoute);
  }
  const bus = {
    meta: {
      generated: new Date().toISOString(),
      source: `${GB.source} · fetched ${GB.fetched} (${path.relative(ROOT, GBIS)}) · 차도 ${path.relative(ROOT, OSM)} + ${path.relative(ROOT, OSM_MG)} (OpenStreetMap, ODbL)`,
      geometry: 'GBIS 정류소 목록에는 노선 형상이 없음 → 정류소 사이를 OSM 차도 그래프(gbis-route.mjs: 일방통행·진행 방향 차로) 위 최단 경로로 이은 추정 경로',
      area: { liveBox: LB, migeumBox: MB, rule: '정자 bbox ∪ (z ≥ liveBox.z1 이고 코리더 타일 또는 미금 박스) 안에서 연속이고 미금 박스 정류소를 포함하는 구간' },
      stopRule: '정자 bbox 안: public/transit.json 정류장(번호 80m / 이름 45m 안)만 · 밖: 코리더 정류장(같은 규칙) 없으면 GBIS 좌표로 새 정류장(id g+stationId)',
      overlapRule: 'skipIf: 같은 번호·방향 기존 경로가 새 조각을 ≥90% 덮으면 기존 유지 · replace: 새 조각이 기존 경로를 ≥80% 덮으면 그 자리(경로 번호)에 새 조각 — 런타임에 그 기존 경로가 있을 때만',
      edgeTrimM: EDGE_TRIM, minPieceM: MIN_PIECE,
      routes: report,
    },
    ...out,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bus));
  console.log(JSON.stringify(report, null, 1));
  console.log('live paths', out.live.paths.length, 'corridor paths', out.corridor.paths.length, 'new stops', out.corridor.stops.length, 'addRoute', out.corridor.addRoute.length);
  console.log(path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(1) + 'KB');
}
if (import.meta.url === `file://${process.argv[1]}`) main();
