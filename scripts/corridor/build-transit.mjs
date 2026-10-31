// [corridor] 수내 → 롯데 코리더 버스 데이터: public/corridor/transit.json
//
//   라이브 public/transit.json(정자 bbox)은 건드리지 않는다. 코리더 버스는 정자 bbox 바깥 구간만 다룬다.
//   - 노선 형상: 프로토타입 world/transit.json 의 OSM 노선 형상(route relation 멤버 way). 각 노선은 OSM 원본
//     (osm_merged.json)의 type=route, route=bus relation 과 id·ref 가 같을 때만 '확인됨'(ref 표기).
//     ref 가 없는 relation(예: 고속버스)은 일반 표기('고속버스' 등)로만 보여 준다.
//   - 경로는 정자 bbox 바깥 · 코리더 경계 안 · 상세 타일이 있는 칸 위로만 자르고 150m 미만 조각은 버린다.
//   - 정류장: OSM highway=bus_stop / public_transport=platform 노드 좌표(라이브와 같은 투영)를 그대로 쓴다.
//
//   사용: node scripts/corridor/build-transit.mjs [--proto=../bumpinto-world/public/world/transit.json]
//          [--osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/transit.json]
import fs from 'node:fs';
import path from 'node:path';
import { buildRoadGraph, snapCandidates, routeSegs, chainPts } from './gbis-route.mjs';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PROTO = path.resolve(ROOT, arg('proto', '../bumpinto-world/public/world/transit.json'));
const OSM = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/transit.json'));
const GBIS = path.resolve(ROOT, arg('gbis', 'data/gbis_route_stations.json')); // [bus-net] scripts/corridor/fetch-gbis-routes.mjs
const JZ_OUT = path.resolve(ROOT, arg('jzout', 'public/corridor/jz-sim.json')); // [bus-net] 정자 ?bus=sim 전용 추가 경로
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const refTypes0 = {}; // [bus-net] GBIS 노선 refTypes 보충
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];

const CI = readJSON(path.join(ROOT, 'public/corridor/index.json'));
const LB = CI.meta.liveBox, B = CI.meta.bounds, TS = CI.meta.tileSize;
const P = readJSON(PROTO);
const els = readJSON(OSM).elements;
const relById = new Map(), nodeById = new Map();
for (const e of els) {
  if (e.type === 'relation' && e.tags?.type === 'route' && e.tags?.route === 'bus') relById.set(e.id, e);
  else if (e.type === 'node') nodeById.set(e.id, e);
}

const inLive = ([x, z], m = 0) => x >= LB.x0 - m && x <= LB.x1 + m && z >= LB.z0 - m && z <= LB.z1 + m;
const inBounds = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
const hasTile = ([x, z]) => !!CI.tiles[`${Math.floor(x / TS)}_${Math.floor(z / TS)}`];
const ok = (p) => !inLive(p) && inBounds(p) && hasTile(p);

// ---- 노선 확인 ----
const GENERIC = { express: '고속버스', intercity: '시외버스', M: '광역급행버스', city: '시내버스', village: '마을버스' };
const routes = [], keepRoute = new Map();
let unconfirmed = 0;
for (const r of P.routes) {
  const rel = relById.get(r.id);
  if (!rel || r.geom !== 'osm') { unconfirmed++; continue; }
  const osmRef = rel.tags.ref?.trim();
  const confirmed = !!osmRef && osmRef === r.ref;
  const out = { ...r, paths: [], osmRef: osmRef || null, confirmed };
  if (!confirmed) { out.ref = GENERIC[r.type] || '버스'; out.name = out.ref; out.generic = true; delete out.gbis; }
  keepRoute.set(r.id, out);
}

// ---- 경로 자르기: 선분 단위로 ok 판정(1m 간격 샘플) 후 연속 구간만 ----
function cut(pts) {
  const runs = []; let cur = [];
  const push = (p) => { const l = cur[cur.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.05) cur.push([r1(p[0]), r1(p[1])]); };
  const close = () => { if (cur.length > 1) runs.push(cur); cur = []; };
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 1) continue;
      const p = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
      if (ok(p)) { if (k === 0 || k === n || !cur.length) push(p); } else close();
    }
    if (cur.length && ok(pts[i])) push(pts[i]);
  }
  close();
  return runs;
}
const lenOf = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
function project(p, x, z) {
  let best = { d: Infinity, s: 0 }, acc = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best.d) best = { d, s: acc + t * L };
    acc += L;
  }
  return best;
}

// ---- 정류장: OSM 노드 좌표 ----
const stopsAll = new Map();
let stopMoved = 0;
for (const s of P.stops) {
  const n = nodeById.get(s.id); if (!n) continue;
  const [x, z] = proj(n);
  if (Math.hypot(x - s.x, z - s.z) > 1) stopMoved++;
  stopsAll.set(s.id, { ...s, x: r1(x), z: r1(z), osmName: n.tags?.name || null });
}

const paths = [], usedStops = new Set();
// [bus-net] GBIS 정류소 순서로 다시 이을 노선은 OSM 조각 형상을 쓰지 않는다(아래 GBIS 단계가 대신 만든다)
const GB = fs.existsSync(GBIS) ? readJSON(GBIS) : null;
const GB_REFS = new Set((GB?.routes || []).map((r) => r.ref));
for (const p of P.paths) {
  const r = keepRoute.get(p.route); if (!r) continue;
  if (r.confirmed && GB_REFS.has(r.ref)) continue;
  for (const run of cut(p.pts)) {
    const L = lenOf(run); if (L < 150) continue;
    const stops = [];
    for (const st of p.stops || []) {
      const s = stopsAll.get(st.stop); if (!s || !ok([s.x, s.z])) continue;
      const q = project(run, s.x, s.z);
      if (q.d < 30 && q.s > 8 && q.s < L - 8) stops.push({ stop: s.id, s: Math.round(q.s * 10) / 10 });
    }
    stops.sort((a, b) => a.s - b.s);
    const id = paths.length;
    paths.push({ id, route: r.id, ref: r.ref, pts: run, len: Math.round(L), stops, src: p.id });
    r.paths.push(id);
    for (const st of stops) usedStops.add(st.stop);
  }
}

// ---- [bus-net] GBIS 정류소 순서 → 차도 그래프 경로 (220 · 9407 · 7007-1 · 380) ----
//   정류소(경기버스정보 좌표)를 진행 방향 차로에 붙이고 정류소 사이를 OSM 차도 위 최단(도로 등급·회전 비용) 경로로 잇는다.
//   코리더 타일 위 · 정자 bbox 밖 구간 → 코리더 경로. 정자 bbox 안 구간은
//     - 같은 번호의 정자 경로(public/transit.json)가 이미 덮으면 그 끝점에 정확히 이어 붙이고(정자↔코리더 연속 탑승용),
//     - 없으면 정자 ?bus=sim 전용 추가 경로(public/corridor/jz-sim.json)로 낸다. 실시간 모드(기본)는 이 파일을 읽지 않는다.
const JZT = readJSON(path.join(ROOT, 'public/transit.json'));
const jzSim = { meta: { note: '정자 ?bus=sim 전용 추가 버스 경로(GBIS 정류소 순서 → OSM 차도). 실시간 모드(기본)에서는 읽지 않는다.', source: GB?.source || null, fetched: GB?.fetched || null }, routes: [], paths: [] };
const gbLog = [], newStops = [];
if (GB) {
  const BX = 300, nearB = ([x, z]) => x >= B.x0 - BX && x <= B.x1 + BX && z >= B.z0 - BX && z <= B.z1 + BX;
  const G = buildRoadGraph(els, proj, nearB);
  const covered = (p) => inLive(p) || ok(p);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const plen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; };
  const jzStops = JZT.stops.map((s) => ({ ...s }));
  const matchStop = (list, st, x, z) => {
    const byRef = st.no ? list.filter((s) => (s.ref || '').split(';').includes(st.no) && Math.hypot(s.x - x, s.z - z) < 80) : [];
    if (byRef.length) return byRef.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    return list.find((s) => s.name === st.name && Math.hypot(s.x - x, s.z - z) < 40) || null;
  };
  const corList = [...stopsAll.values()];
  // 같은 번호 정자 경로 (방향 포함) — 덮는지 판정·끝점 연결용
  const jzPathsOf = (ref) => JZT.paths.filter((p) => p.ref === ref);
  const nearPath = (p, x, z) => { let best = { d: Infinity }; for (let i = 1; i < p.pts.length; i++) { const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z); if (d < best.d) best = { d, dx: dx / Math.sqrt(L2), dz: dz / Math.sqrt(L2) }; } return best; };
  const onEdgeLB = ([x, z]) => Math.min(Math.abs(x - LB.x0), Math.abs(x - LB.x1), Math.abs(z - LB.z0), Math.abs(z - LB.z1)) < 1.5;

  for (const R of GB.routes) {
    let route = [...keepRoute.values()].find((r) => r.ref === R.ref && r.confirmed);
    const jr = JZT.routes.find((r) => r.ref === R.ref), rt = P.refTypes?.[R.ref] || JZT.refTypes?.[R.ref] || {};
    if (!route) {
      route = { id: jr?.id ?? `gbis-${R.routeId}`, ref: R.ref, name: jr?.name || `${R.ref}번`, network: jr?.network || '', operator: jr?.operator || '', type: jr?.type || rt.type || 'city', src: 'gbis', gbis: jr?.gbis || rt.gbis || null, paths: [], osmRef: null, confirmed: true };
      keepRoute.set(route.id, route);
    }
    route.geom = 'gbis-routed'; route.gbisRouteId = R.routeId;
    if (!refTypes0[R.ref] && (rt.type || jr?.type)) refTypes0[R.ref] = rt.type ? rt : { type: jr.type, src: 'gbis', gbis: jr.gbis };
    const turn = R.turnSeq ?? Infinity;
    const dirs = [R.stations.filter((s) => s.seq <= turn), R.stations.filter((s) => s.seq >= turn)];
    dirs.forEach((list, dir) => {
      const sts = list.map((s) => { const [x, z] = proj({ lat: s.lat, lon: s.lon }); return { ...s, x, z }; });
      let run = []; const runs = [];
      for (const s of sts) { if (covered([s.x, s.z])) run.push(s); else { if (run.length >= 2) runs.push(run); run = []; } }
      if (run.length >= 2) runs.push(run);
      for (const rn of runs) routeRun(R, route, dir, rn);
    });
  }

  function routeRun(R, route, dir, rn) {
    // Viterbi: 정류소마다 후보 선분 4개, 다음 정류소 후보까지 경로 비용 + 붙임 점수
    let i0 = 0;
    while (i0 < rn.length - 1) {
      const C = [], back = [];
      let i = i0;
      C[i] = snapCandidates(G, rn[i].x, rn[i].z).slice(0, 4).map((c) => ({ ...c, acc: c.score * 3 }));
      if (!C[i].length) { gbLog.push(`  ! ${R.ref} ${rn[i].name}: 근처 차도 없음`); i0++; continue; }
      for (i = i0 + 1; i < rn.length; i++) {
        const straight = Math.hypot(rn[i].x - rn[i - 1].x, rn[i].z - rn[i - 1].z);
        const cand = snapCandidates(G, rn[i].x, rn[i].z).slice(0, 4);
        const cur = [];
        for (const c of cand) {
          let best = null;
          for (const pc of C[i - 1]) {
            const r = routeSegs(G, pc, c, straight * 3 + 800); if (!r) continue;
            const acc = pc.acc + r.cost + c.score * 3;
            if (!best || acc < best.acc) best = { ...c, acc, prev: pc, chain: r.chain, rc: r.cost };
          }
          if (best) cur.push(best);
        }
        if (!cur.length) { gbLog.push(`  ! ${R.ref} 방향${dir} ${rn[i - 1].name} → ${rn[i].name}: 차도 경로 없음 → 여기서 끊음`); break; }
        C[i] = cur;
      }
      const iEnd = i - 1;
      if (iEnd > i0) emitRun(R, route, dir, rn.slice(i0, iEnd + 1), C.slice(i0, iEnd + 1));
      i0 = iEnd + 1;
    }
  }

  function emitRun(R, route, dir, rn, C) {
    // 역추적
    let c = C[C.length - 1].reduce((a, b) => (b.acc < a.acc ? b : a));
    const picks = [c]; while (c.prev) { c = c.prev; picks.push(c); } picks.reverse();
    const pts = [], stS = [];
    const add = (p) => { const l = pts[pts.length - 1]; if (!l || dist(l, p) > 0.3) pts.push([p[0], p[1]]); };
    add([picks[0].x, picks[0].z]); stS.push(0);
    for (let k = 1; k < picks.length; k++) {
      const leg = chainPts(G, picks[k - 1], picks[k], picks[k].chain);
      const straight = Math.hypot(rn[k].x - rn[k - 1].x, rn[k].z - rn[k - 1].z), L = plen(leg);
      if (L > straight * 1.9 + 150) gbLog.push(`  ~ ${R.ref} 방향${dir} ${rn[k - 1].name} → ${rn[k].name}: 도로 ${L.toFixed(0)}m / 직선 ${straight.toFixed(0)}m`);
      for (const p of leg) add(p);
      stS.push(plen(pts));
    }
    // 2m 간격으로 C(코리더)/L(정자)/X(밖) 라벨 → 조각
    const lab = (p) => (inLive(p) ? 'L' : ok(p) ? 'C' : 'X');
    const pieces = []; let cur = null, acc = 0;
    const start = (k, p, s) => { cur = { k, pts: [p], s0: s }; pieces.push(cur); };
    start(lab(pts[0]), pts[0], 0);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = dist(a, b), n = Math.max(1, Math.ceil(L / 2));
      for (let k = 1; k <= n; k++) {
        const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], s = acc + (L * k) / n, kk = lab(p);
        if (kk !== cur.k) {
          // 경계점(정자 bbox 경계는 이분법으로 0.05m 까지)
          let lo = [a[0] + ((b[0] - a[0]) * (k - 1)) / n, a[1] + ((b[1] - a[1]) * (k - 1)) / n], hi = p;
          if (cur.k === 'L' || kk === 'L') for (let it = 0; it < 20; it++) { const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]; if (inLive(m) === inLive(lo)) lo = m; else hi = m; }
          const q = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], sq = s - dist(q, p);
          cur.pts.push(q); cur.s1 = sq; start(kk, q, sq);
        }
      }
      cur.pts.push(b); acc += L;
    }
    cur.s1 = acc;
    const stopsIn = (pc) => rn.map((st, k) => ({ st, s: stS[k] - pc.s0 })).filter((q) => q.s > 8 && q.s < pc.s1 - pc.s0 - 8);
    const tidy = (a) => { const o = []; for (const p of a) { const q = [r1(p[0]), r1(p[1])]; const l = o[o.length - 1]; if (!l || dist(l, q) > 0.05) o.push(q); } return o; };
    pieces.forEach((pc, k) => { pc.pts = tidy(pc.pts); pc.L = plen(pc.pts); pc.prev = pieces[k - 1]; pc.next = pieces[k + 1]; });
    // 정자 bbox 안 조각: 같은 번호 정자 경로가 덮는지
    for (const pc of pieces.filter((p) => p.k === 'L')) {
      const jp = jzPathsOf(R.ref); let hit = 0, n = 0;
      for (let s = 1; s < pc.pts.length; s++) {
        const [ax, az] = pc.pts[s - 1], [x, z] = pc.pts[s], L = Math.hypot(x - ax, z - az); if (L < 0.5) continue;
        n++; if (jp.some((p) => { const q = nearPath(p, x, z); return q.d < 20 && (q.dx * (x - ax) + q.dz * (z - az)) / L > 0.5; })) hit++; // 같은 방향만
      }
      pc.cover = n ? hit / n : 0;
      if (pc.cover >= 0.75) {
        // 들어가는 점 = 정자 경로 시작점, 나오는 점 = 정자 경로 끝점(bbox 경계 위)에 맞춘다
        const entry = pc.pts[0], exit = pc.pts[pc.pts.length - 1];
        const st = jp.map((p) => p.pts[0]).filter((q) => onEdgeLB(q) && dist(q, entry) < 45).sort((a, b) => dist(a, entry) - dist(b, entry))[0];
        const en = jp.map((p) => p.pts[p.pts.length - 1]).filter((q) => onEdgeLB(q) && dist(q, exit) < 45).sort((a, b) => dist(a, exit) - dist(b, exit))[0];
        if (st && pc.prev?.k === 'C') pc.prev.pts[pc.prev.pts.length - 1] = [...st];
        if (en && pc.next?.k === 'C') pc.next.pts[0] = [...en];
        pc.link = { entry: st || null, exit: en || null };
      }
    }
    const tag = `${R.ref} 방향${dir}(${rn[0].name}→${rn[rn.length - 1].name})`;
    const made = [];
    for (const pc of pieces) {
      if (pc.k === 'C' && pc.L >= 150) {
        const stops = [];
        for (const { st, s } of stopsIn(pc)) {
          let so = matchStop(corList, st, st.x, st.z);
          if (so && !ok([so.x, so.z])) so = null;
          if (!so) so = newStops.find((q) => q.gbisId === st.id) || null;
          if (!so) {
            const pq = samplePts(pc.pts, s), dx = pq.x - st.x, dz = pq.z - st.z, dd = Math.hypot(dx, dz) || 1;
            so = { id: `g${st.id}`, gbisId: st.id, name: st.name, ref: st.no || '', x: r1(st.x), z: r1(st.z), routes: [], rd: [r3(pq.dx), r3(pq.dz)], tr: dd > 0.5 ? [r3(dx / dd), r3(dz / dd)] : [r3(pq.dz), r3(-pq.dx)], rdist: r1(dd), src: 'gbis' };
            newStops.push(so); stopsAll.set(so.id, so);
          }
          if (!(so.routes || []).includes(R.ref)) so.routes = [...(so.routes || []), R.ref];
          stops.push({ stop: so.id, s: Math.round(s * 10) / 10 });
          usedStops.add(so.id);
        }
        const id = paths.length;
        paths.push({ id, route: route.id, ref: R.ref, pts: pc.pts, len: Math.round(pc.L), stops, src: 'gbis', dir });
        route.paths.push(id);
        made.push(`코리더#${id} ${(pc.L / 1000).toFixed(2)}km 정류장${stops.length}`);
      } else if (pc.k === 'L') {
        if (pc.cover >= 0.75) { made.push(`정자 기존 경로가 덮음(${Math.round(pc.cover * 100)}%) 연결 ${pc.link.entry ? '진입✓' : '진입-'} ${pc.link.exit ? '진출✓' : '진출-'}`); continue; }
        if (pc.L < 100) continue;
        const stops = [];
        for (const { st, s } of stopsIn(pc)) { const so = matchStop(jzStops, st, st.x, st.z); if (so) stops.push({ stop: so.id, s: Math.round(s * 10) / 10 }); else gbLog.push(`  · ${R.ref} 정자 안 정류장 매칭 없음: ${st.name} ${st.no}`); }
        jzSim.paths.push({ route: route.id, ref: R.ref, pts: pc.pts, len: Math.round(pc.L), stops, src: 'gbis', dir });
        if (!jzSim.routes.some((r) => r.ref === R.ref)) { const { paths: _p, ...rest } = route; const jr2 = JZT.routes.find((r) => r.ref === R.ref); jzSim.routes.push(jr2 ? { ...jr2, paths: [] } : { ...rest, paths: [] }); }
        made.push(`정자 sim 추가 ${(pc.L / 1000).toFixed(2)}km 정류장${stops.length}`);
      }
    }
    gbLog.push(`${tag}: 정류소 ${rn.length} · ${made.join(' · ') || '(코리더 조각 없음)'}`);
  }
}
function samplePts(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + L >= s || i === pts.length - 1) { const t = L ? Math.min(1, (s - acc) / L) : 0, dx = (pts[i][0] - pts[i - 1][0]) / (L || 1), dz = (pts[i][1] - pts[i - 1][1]) / (L || 1); return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, dx, dz }; } acc += L; }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}

const outRoutes = [...keepRoute.values()].filter((r) => r.paths.length);
const refs = new Set(outRoutes.filter((r) => r.confirmed).map((r) => r.ref));
// 경로가 지나지 않는 정류장도(정자 bbox 밖·타일 위) 두되, 노선 표시는 OSM route_ref 그대로
const stops = [...stopsAll.values()].filter((s) => ok([s.x, s.z]) && (usedStops.has(s.id) || (s.routes || []).length));
const refTypes = {};
for (const s of stops) for (const ref of s.routes || []) if (P.refTypes?.[ref]) refTypes[ref] = P.refTypes[ref];
for (const r of outRoutes) if (P.refTypes?.[r.ref]) refTypes[r.ref] = P.refTypes[r.ref];
for (const [k, v] of Object.entries(refTypes0)) if (!refTypes[k]) refTypes[k] = v;

const out = {
  meta: {
    generated: new Date().toISOString(),
    osm_base: P.meta?.osm_base || null,
    note: '버스 위치는 시뮬레이션(실시간 프록시가 응답하면 실제 위치). 노선 번호는 OSM route relation(type=route, route=bus)의 ref 와 일치할 때만 표기.',
    liveBox: LB,
    stats: { protoRoutes: P.routes.length, routes: outRoutes.length, confirmed: outRoutes.filter((r) => r.confirmed).length, generic: outRoutes.filter((r) => !r.confirmed).length, unconfirmedDropped: unconfirmed, paths: paths.length, km: Math.round(paths.reduce((a, p) => a + p.len, 0) / 100) / 10, stops: stops.length, stopsOnPaths: usedStops.size, stopMoved, refs: refs.size },
  },
  routes: outRoutes.map(({ paths: ps, ...r }) => ({ ...r, paths: ps })),
  paths, stops, refTypes,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify(out.meta.stats), (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
if (GB) {
  fs.writeFileSync(JZ_OUT, JSON.stringify(jzSim));
  console.log('[bus-net] GBIS 노선\n' + gbLog.join('\n'));
  console.log(`[bus-net] 새 정류장(GBIS 좌표) ${newStops.length} · 정자 sim 추가 경로 ${jzSim.paths.length} → ${path.relative(ROOT, JZ_OUT)} ${(fs.statSync(JZ_OUT).size / 1024).toFixed(1)}KB`);
}
