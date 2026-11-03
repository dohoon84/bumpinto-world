// [pangyo-link] 판교 확장 2단계 — 정자역 → 판교역 버스(OSM route relation 7090965, ref 8110) 경로 데이터
//
//   입력: ../bumpinto-world/data/raw/osm_merged.json (코리더 build-transit.mjs 와 같은 OSM 원본: 차도 그래프 + relation + 정류장 노드)
//         public/corridor/{index,base,transit}.json · tiles/* · pangyo/{index.json,tiles/*} · public/{transit,jeongja}.json
//   출력: public/corridor/pangyo/link.json
//     live      : 정자 bbox 안 조각(jz-sim.json 과 같은 형식 → src/transit/transit.js mergeSimExtra, ?bus=sim 일 때만)
//     corridor  : 코리더/판교 타일 위 조각 + 새 정류장(판교역.낙생육교.현대백화점) + 기존 정류장에 붙일 노선 번호
//     crossings : 경로가 지나는 탄천 다리의 공개 자료 높이(게임 값과 비교용 기록 — 지형/다리 형상은 바꾸지 않음)
//   경로: relation 의 정류장 순서(정자역→롯데백화점.수내역→서현역.AK플라자→이매촌한신→판교역.낙생육교)를 OSM 차도 그래프
//         (gbis-route.mjs, 일방통행 반영) 위에서 잇는다. relation 구성 way 가 아닌 선분은 비용 3배 → relation 길을 그대로 따른다.
//         마지막 정류장 뒤로는 relation 의 판교IC 방향 길을 게임에 그려진 도로 끝(판교 박스 안)까지 잇는다.
//         정자역에서 정차하도록 앞쪽에 같은 차로 80m 진입 구간을 붙인다(시뮬 정차 규칙: 경로 시작 8m 안 정류장은 안 섬).
//   방향: relation 은 한 방향(정자→판교→서울)뿐이라 반대 방향은 만들지 않는다(추정 경로를 지어내지 않음).
//   사용: node scripts/corridor/build-pangyo-link.mjs [--osm=...] [--out=public/corridor/pangyo/link.json]
import fs from 'node:fs';
import path from 'node:path';
import { buildRoadGraph, snapCandidates, routeSegs, chainPts } from './gbis-route.mjs';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OSM = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/pangyo/link.json'));
const C = path.join(ROOT, 'public/corridor');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const REL = 7090965;
const DISP_REF = 'G8110'; // [g8110] 화면 표기
const LEAD_IN = 80;

const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const plen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; };

const CI = readJSON(path.join(C, 'index.json')), PG = readJSON(path.join(C, 'pangyo/index.json'));
const CT = readJSON(path.join(C, 'transit.json')), JZT = readJSON(path.join(ROOT, 'public/transit.json'));
const LB = CI.meta.liveBox, B = CI.meta.bounds, TS = CI.meta.tileSize, PB = PG.box || PG.meta?.box;
const inLive = ([x, z]) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
const tileKey = ([x, z]) => `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;
const inPB = ([x, z]) => x >= PB.x0 && x <= PB.x1 && z >= PB.z0 && z <= PB.z1;
// 코리더 조각이 될 수 있는 곳: 정자 bbox 밖 · 코리더 범위 안 · (코리더 타일 칸) 또는 (판교 타일 칸이면서 판교 박스 안)
const ok = (p) => !inLive(p) && p[0] >= B.x0 && p[0] <= B.x1 && p[1] >= B.z0 && p[1] <= B.z1 && (!!CI.tiles[tileKey(p)] || (!!PG.tiles[tileKey(p)] && inPB(p)));

// ---------- 게임에 그려진 차도(연속성 확인용): 코리더 타일 + 판교 타일 + 탄천 띠(base.ch) + 정자 ----------
const FOOT = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway', 'corridor']);
export function loadDrawnRoads() {
  const roads = [];
  const add = (list, src) => { for (const r of list || []) if (!FOOT.has(r.k) && r.p?.length > 1) roads.push({ ...r, src }); };
  for (const k of Object.keys(CI.tiles)) { const f = path.join(C, 'tiles', k + '.json'); if (fs.existsSync(f)) add(readJSON(f).r, 'corridor'); }
  for (const k of Object.keys(PG.tiles)) { const f = path.join(C, 'pangyo/tiles', k + '.json'); if (fs.existsSync(f)) add(readJSON(f).r, 'pangyo'); }
  add(readJSON(path.join(C, 'base.json')).ch, 'tancheon');
  add(readJSON(path.join(ROOT, 'public/jeongja.json')).roads, 'jeongja');
  const G = new Map(), CELL = 50;
  roads.forEach((r, ri) => { for (let j = 1; j < r.p.length; j++) {
    const [ax, az] = r.p[j - 1], [bx, bz] = r.p[j];
    for (let x = Math.floor(Math.min(ax, bx) / CELL) - 1; x <= Math.floor(Math.max(ax, bx) / CELL) + 1; x++) for (let z = Math.floor(Math.min(az, bz) / CELL) - 1; z <= Math.floor(Math.max(az, bz) / CELL) + 1; z++) { const k = x + ',' + z; (G.get(k) || G.set(k, []).get(k)).push([ri, j]); }
  } });
  const near = (x, z) => {
    let best = null, bd = Infinity;
    for (const [ri, j] of G.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      const r = roads[ri], [ax, az] = r.p[j - 1], [bx, bz] = r.p[j], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d - r.w / 2 < bd) { bd = d - r.w / 2; best = r; }
    }
    return { road: best, gap: bd }; // gap: 도로 가장자리 밖으로 벗어난 거리(음수 = 도로 폭 안)
  };
  return { roads, near };
}

// ---------- 탄천 횡단 높이(공개 자료) — 게임 지형/다리 형상은 feat/tributary-depth 소관이라 여기서 바꾸지 않고 기록만 ----------
//   DEM 값은 다리 축 ±90m 단면 샘플(/workspace/bw-pangyo-link-data/sect*.py). DSM 은 지표면(다리 상판·식생 포함) 높이라
//   하도(물길) 값은 수면, 둑/진입로 값은 도로면에 가깝다. 수직 정확도: GLO-30 절대 오차 < 4m(90% LE), SRTM/ASTER ±(5~10)m.
export const CROSSINGS = [
  {
    name: '궁내교', osmWays: [186410712, 577591584], over: '탄천', at: [50, -735],
    public: { lengthM: 145, widthM: 46, structure: '중공 PC 슬래브교', built: 1993, source: '디지털성남문화대전 GC00100442 「궁내교」(https://www.grandculture.net/seongnam/toc/GC00100442) — 높이 항목 "145m"는 길이와 같은 값으로 표기 오류로 보고 쓰지 않음' },
    dem: { channelEl: [32.4, 34.0], bankEl: [40.0, 41.0], reliefM: [7, 8], source: 'Copernicus GLO-30 DSM (cop_N37E127, ESA/Airbus 2021 공개본) 단면 샘플' },
  },
  {
    name: '양현교', osmWays: [186410729, 856250627], over: '탄천', at: [1162, -2665],
    public: { heightM: 9, lengthM: 130, widthM: 41, effWidthM: 38, built: 1993, road: '지방도 57호(서현로)', source: '디지털성남문화대전 GC00101471 「양현교」(https://www.grandculture.net/seongnam/toc/GC00101471)' },
    dem: { channelEl: [27.8, 28.3], bankEl: [36.5, 37.4], reliefM: [8.5, 9.3], source: 'Copernicus GLO-30 DSM 단면 샘플(SRTM 30m 26~28 / 34~42, ASTER 30m 27~30 — OpenTopoData 참고값, 잡음 큼)' },
  },
];
export const CROSSING_NOTE = '게임 탄천 단면은 전 구간 하나의 근사값(src/world/terrain.js: 도로·둑 0, 둔치 FLOOR -6, 수면 -6.6, 바닥 -7.6 — tancheon meta 에 "측정값 아님"). 경로의 두 다리 상판은 도로 높이(0)로 둔다(DEM 에서도 진입로 ≈ 상판). 상판-하상 차: 게임 7.6m / 공개 자료 궁내교 DEM 7~8m, 양현교 높이 9m·DEM 8.5~9.3m → 양현교는 게임이 약 1.4m 얕다. 구간별 깊이 조정은 탄천 깊이(feat/tributary-depth) 쪽 결정이 필요해 이 브랜치에서는 바꾸지 않음.';

// ---------- 메인 ----------
function main() {
  const els = readJSON(OSM).elements;
  const rel = els.find((e) => e.type === 'relation' && e.id === REL);
  if (!rel) throw new Error(`relation ${REL} 없음`);
  const nodeById = new Map(els.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const memberWays = new Set(rel.members.filter((m) => m.type === 'way').map((m) => m.ref));
  const stopIds = rel.members.filter((m) => m.type === 'node').map((m) => m.ref);
  const BX = 300, near = ([x, z]) => x >= B.x0 - BX && x <= B.x1 + BX && z >= B.z0 - BX && z <= B.z1 + BX;
  const G = buildRoadGraph(els, proj, near);
  // relation 길 우선: relation way 이거나 같은 이름의 길(반대편 차도 포함)이 아니면 비용 3배.
  //   이 relation 의 way 들은 두 방향 차도가 섞여 있다(성남대로는 정자 방향, 서현로는 판교 구간만 서울 방향). 정류장(정차 쪽 차로) 순서가
  //   정자→판교 방향이므로 그 방향 일방통행 차도를 따라가야 하고, 그건 relation 에 없는 반대편 차도일 수 있다 → 이름 단위로 우대.
  const wayById = new Map(els.filter((e) => e.type === 'way').map((e) => [e.id, e]));
  const memberNames = new Set([...memberWays].map((id) => wayById.get(id)?.tags?.name).filter(Boolean));
  const onRelRoad = (wid) => memberWays.has(wid) || memberNames.has(wayById.get(wid)?.tags?.name);
  for (const s of G.segs) if (!onRelRoad(s.way)) s.cost *= 3;
  const drawn = loadDrawnRoads();

  // 정류장(relation 순서)
  const sts = stopIds.map((id) => { const n = nodeById.get(id); const [x, z] = proj(n); return { id, name: n.tags?.name || '', ref: n.tags?.ref || '', x, z, routeRef: n.tags?.route_ref || '' }; });
  // 끝점: 마지막 정류장 뒤 relation way 위, 게임에 그려진 도로가 이어지는 마지막 점(판교 박스 안)
  const last = sts[sts.length - 1];
  const tail = [];
  {
    const S = G.segs; let cand = snapCandidates(G, last.x, last.z)[0], si = cand.si, acc = 0;
    const seen = new Set();
    while (si != null && !seen.has(si) && acc < 1500) {
      seen.add(si); const s = S[si]; const p = [s.bx, s.bz];
      const nx = (G.out.get(s.b) || []).map((i) => S[i]).filter((n) => onRelRoad(n.way) && !(n.b === s.a));
      tail.push({ si, p }); acc += s.len;
      si = nx.sort((a, b) => (b.dx * s.dx + b.dz * s.dz) - (a.dx * s.dx + a.dz * s.dz))[0]?.i ?? null;
    }
  }
  // 그려진 도로 위 + ok() 인 마지막 꼭짓점 직전까지(1m 간격으로 검사)
  let endPt = null;
  for (let k = 0; k < tail.length; k++) {
    const s = G.segs[tail[k].si], n = Math.ceil(s.len);
    let stop = false;
    for (let i = 1; i <= n; i++) { const p = [s.ax + (s.bx - s.ax) * i / n, s.az + (s.bz - s.az) * i / n]; if (!ok(p) || drawn.near(p[0], p[1]).gap > 2) { stop = true; break; } endPt = { si: s.i, t: i / n, x: p[0], z: p[1] }; }
    if (stop) break;
  }
  // 끝은 그려진 도로 끝에서 15m 안쪽(버스가 도로 끝 너머로 사라지지 않게 페이드 여유)
  const way = [...sts.map((s) => ({ ...s, kind: 'stop' }))];

  // Viterbi (build-transit.mjs routeRun 과 같은 방식)
  const C = [];
  C[0] = snapCandidates(G, way[0].x, way[0].z).slice(0, 4).map((c) => ({ ...c, acc: c.score * 3 }));
  for (let i = 1; i < way.length; i++) {
    const straight = Math.hypot(way[i].x - way[i - 1].x, way[i].z - way[i - 1].z);
    const cur = [];
    for (const c of snapCandidates(G, way[i].x, way[i].z).slice(0, 4)) {
      let best = null;
      for (const pc of C[i - 1]) { const r = routeSegs(G, pc, c, straight * 4 + 1500); if (!r) continue; const acc = pc.acc + r.cost + c.score * 3; if (!best || acc < best.acc) best = { ...c, acc, prev: pc, chain: r.chain }; }
      if (best) cur.push(best);
    }
    if (!cur.length) throw new Error(`${way[i - 1].name} → ${way[i].name}: 차도 경로 없음`);
    C[i] = cur;
  }
  let c = C[C.length - 1].reduce((a, b) => (b.acc < a.acc ? b : a));
  const picks = [c]; while (c.prev) { c = c.prev; picks.push(c); } picks.reverse();
  // 꼬리(마지막 정류장 → endPt)
  const tailR = endPt ? routeSegs(G, picks[picks.length - 1], endPt, 3000) : null;

  const pts = [], stS = [];
  const add = (p) => { const l = pts[pts.length - 1]; if (!l || dist(l, p) > 0.3) pts.push([p[0], p[1]]); };
  // 진입 구간: 첫 정류장 선분을 거슬러 LEAD_IN m (같은 길 이름/가장 곧은 선분)
  {
    const S = G.segs; let s = S[picks[0].si], back = [[picks[0].x, picks[0].z]], acc = picks[0].t * s.len;
    back.push([s.ax, s.az]);
    while (acc < LEAD_IN) {
      const prevs = S.filter((q) => q.b === s.a && q.a !== s.b).sort((a, b) => (b.dx * s.dx + b.dz * s.dz) - (a.dx * s.dx + a.dz * s.dz));
      if (!prevs.length) break; s = prevs[0]; acc += s.len; back.push([s.ax, s.az]);
    }
    // LEAD_IN 에서 자르기
    const rev = back; let L = 0; const lead = [rev[0]];
    for (let i = 1; i < rev.length; i++) { const d = dist(rev[i - 1], rev[i]); if (L + d >= LEAD_IN) { const t = (LEAD_IN - L) / d; lead.push([rev[i - 1][0] + (rev[i][0] - rev[i - 1][0]) * t, rev[i - 1][1] + (rev[i][1] - rev[i - 1][1]) * t]); L = LEAD_IN; break; } lead.push(rev[i]); L += d; }
    for (const p of lead.reverse()) add(p);
  }
  stS.push(plen(pts));
  const legLog = [];
  for (let k = 1; k < picks.length; k++) {
    const leg = chainPts(G, picks[k - 1], picks[k], picks[k].chain);
    const sum = (f) => Math.round(picks[k].chain.filter((si) => f(G.segs[si].way)).reduce((a, si) => a + G.segs[si].len, 0));
    const roads = [...new Set(picks[k].chain.map((si) => wayById.get(G.segs[si].way)?.tags?.name || G.segs[si].k))];
    legLog.push({ from: way[k - 1].name, to: way[k].name, m: Math.round(plen(leg)), straight: Math.round(dist([way[k - 1].x, way[k - 1].z], [way[k].x, way[k].z])), relationWayM: sum((w) => memberWays.has(w)), sameNameM: sum((w) => !memberWays.has(w) && onRelRoad(w)), otherM: sum((w) => !onRelRoad(w)), roads });
    for (const p of leg) add(p);
    stS.push(plen(pts));
  }
  if (tailR) { for (const p of chainPts(G, picks[picks.length - 1], endPt, tailR.chain)) add(p); }

  // 그려진 도로 끝 15m 여유: 끝을 15m 당긴다
  const totalL = plen(pts);
  const trimTo = (p, L) => { const o = [p[0]]; let a = 0; for (let i = 1; i < p.length; i++) { const d = dist(p[i - 1], p[i]); if (a + d >= L) { const t = (L - a) / d; o.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]); return o; } o.push(p[i]); a += d; } return o; };
  const full = trimTo(pts, totalL - 15);

  // 조각: L(정자 bbox) / C(코리더·판교)
  const lab = (p) => (inLive(p) ? 'L' : ok(p) ? 'C' : 'X');
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
  const tidy = (a) => { const o = []; for (const p of a) { const q = [r1(p[0]), r1(p[1])]; const l = o[o.length - 1]; if (!l || dist(l, q) > 0.05) o.push(q); } return o; };
  for (const pc of pieces) { pc.pts = tidy(pc.pts); pc.L = plen(pc.pts); }
  const bad = pieces.filter((p) => p.k === 'X');
  if (bad.length) throw new Error('경로가 게임 범위 밖으로 나감: ' + bad.map((p) => `${p.pts[0]}…${p.pts.at(-1)}`).join(', '));

  const project1 = (p, x, z) => { let best = { d: Infinity, s: 0, dx: 1, dz: 0 }, a = 0; for (let i = 1; i < p.length; i++) { const [ax, az] = p[i - 1], [bx, bz] = p[i], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))), d = Math.hypot(ax + dx * t - x, az + dz * t - z); if (d < best.d) best = { d, s: a + t * L, dx: dx / L, dz: dz / L, px: ax + dx * t, pz: az + dz * t }; a += L; } return best; };
  // [g8110] 화면 표기 = G8110 (도훈님 결정 2026-11-03): OSM relation ref 는 '8110'(구형 태그)이지만 같은 정류장 노드 route_ref ·
  //   경기버스정보 인허가 목록(data/gbis_route_types.json)에는 G8110 만 있음. 내부 id(relation 7090965)·osmRef 는 그대로.
  const route = { id: REL, ref: DISP_REF, name: `${DISP_REF}번`, network: '', operator: '', type: JZT.refTypes?.[DISP_REF]?.type || JZT.refTypes?.[rel.tags.ref]?.type || 'express', src: 'osm', gbis: null, geom: 'osm-routed', osmRef: rel.tags.ref, confirmed: true, paths: [] };
  const corStops = new Map(CT.stops.map((s) => [s.id, s]));
  const aliasRefs = rel.tags.ref !== DISP_REF ? { [rel.tags.ref]: DISP_REF } : {}; // 정류장 route_ref 의 '8110' → G8110 하나로 (중복 칩 방지)
  const live = { routes: [{ ...route }], paths: [], aliasRefs }, corridor = { routes: [{ ...route }], paths: [], stops: [], addRoute: [], aliasRefs };
  const stopLog = [];
  for (const pc of pieces) {
    const stops = [];
    for (let k = 0; k < sts.length; k++) {
      const s = stS[k] - pc.s0; if (!(s > 8 && s < pc.L - 8)) continue;
      const st = sts[k], q = project1(pc.pts, st.x, st.z);
      if (pc.k === 'L') {
        const js = JZT.stops.find((x) => x.id === st.id); if (!js) { stopLog.push(`정자 정류장 없음 ${st.name}`); continue; }
        stops.push({ stop: js.id, s: r1(q.s) });
      } else {
        let so = corStops.get(st.id);
        if (!so) {
          const dx = st.x - q.px, dz = st.z - q.pz, dd = Math.hypot(dx, dz) || 1;
          so = { id: st.id, name: st.name, ref: st.ref, x: r1(st.x), z: r1(st.z), routes: [route.ref], rd: [r3(q.dx), r3(q.dz)], tr: [r3(dx / dd), r3(dz / dd)], rdist: r1(dd), osmName: st.name, src: 'osm', routeRef: st.routeRef };
          corridor.stops.push(so);
        } else if (!(so.routes || []).includes(route.ref)) corridor.addRoute.push(so.id);
        stops.push({ stop: so.id, s: r1(q.s) });
      }
      stopLog.push(`${pc.k} ${st.name} s=${q.s.toFixed(0)} d=${q.d.toFixed(1)}`);
    }
    const out = { route: REL, ref: route.ref, pts: pc.pts, len: Math.round(pc.L), stops, src: 'osm-relation', dir: 0 };
    (pc.k === 'L' ? live : corridor).paths.push(out);
  }
  // 연속성: 1m 간격으로 그려진 도로 가장자리에서 벗어난 거리
  let maxGap = -Infinity, at = null, gapsOver = 0, n = 0;
  for (const pc of pieces) for (let i = 1; i < pc.pts.length; i++) {
    const a = pc.pts[i - 1], b = pc.pts[i], L = dist(a, b);
    for (let s = 0; s < L; s += 1) { const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L, g = drawn.near(x, z).gap; n++; if (g > maxGap) { maxGap = g; at = [r1(x), r1(z)]; } if (g > 2) gapsOver++; }
  }
  const out = {
    meta: {
      generated: new Date().toISOString(),
      source: `OpenStreetMap relation ${REL} (type=route, route=bus, ref=${rel.tags.ref}) · 차도 그래프 ${path.relative(ROOT, OSM)} (ODbL)`,
      refNote: `OSM relation ref 는 "${rel.tags.ref}" 이지만 같은 OSM 정류장 노드들의 route_ref 와 경기버스정보 인허가 목록(data/gbis_route_types.json, 2026-10-27)에는 G8110(오리역↔국가인권위)만 있다 — 노선 번호 개편(8110 → G8110). 화면 표기는 G8110(도훈님 결정), 내부 id·osmRef 는 relation 그대로.`,
      direction: 'relation 한 방향(정자역→판교역→판교IC)만. 반대 방향은 OSM 에 없어 만들지 않음.',
      leadInM: LEAD_IN, tailTrimM: 15,
      legs: legLog, stops: stopLog,
      continuity: { samples: n, maxGapM: r1(maxGap), at, over2m: gapsOver },
      crossings: CROSSINGS, crossingNote: CROSSING_NOTE,
    },
    live, corridor,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(JSON.stringify({ legs: legLog, stops: stopLog, pieces: pieces.map((p) => [p.k, Math.round(p.L), p.pts[0], p.pts.at(-1)]), continuity: out.meta.continuity, newStops: corridor.stops.map((s) => s.name), addRoute: corridor.addRoute }, null, 1));
  console.log(path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(1) + 'KB');
}
if (import.meta.url === `file://${process.argv[1]}`) main();
