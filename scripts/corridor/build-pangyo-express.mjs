// [pangyo-express] 판교 확장 3단계 — 판교IC고가차도 → 판교IC(판교TG) → 경부고속도로 서울 방향 합류
//
//   입력: data/osm_pangyo_express.json  (OSM API 0.6 /map 발췌, ODbL — 선형·차로 수·bridge/layer/tunnel 태그·요금소/게이트 노드)
//         data/dem_pangyo_express.json  (Copernicus GLO-30 DEM 단면 샘플 — 참고 기록, scripts/corridor/sample-dem-express.py)
//         public/corridor/pangyo/link.json (2단계 G8110 코리더 경로: 버스를 여기서 이어 붙임)
//         public/corridor/{tiles,lod}/* · pangyo/{tiles,lod}/*  (판교 박스 안 평면 고가차도 리본 → 숨길 목록)
//   출력: public/corridor/pangyo/express.json
//     lines  : 만들 도로(경로 램프·고가차도 양방향·경부 본선 합류 구간 상/하행) — 5m 간격 [x, z, y] + 폭 + bridge 구간
//     toll   : 판교TG 지붕(OSM building=roof way 316570793 윤곽) · 부스 섬(OSM lanes 로 배치) · 하이패스 게이트(OSM toll_gantry 노드)
//     bus    : G8110 코리더 경로 끝(판교 박스 경계) → 램프 → TG → 합류점 → 경부 본선 350m 연장점, 끝에서 서서 사라짐(endStop)
//     hide   : 판교 타일의 평면(0m) 고가차도 리본 서명 — ?pangyoexpress 켜지면 이 리본만 빼고 높이 있는 리본으로 대신 그림
//   높이 규칙(게임 기준면 = 판교 타일 도로 0m, 실제 표고는 쓰지 않음 — DEM 은 meta.dem 에 비교 기록):
//     - 우리 길이 OSM layer 로 다른 길/물길 위를 지나면(우리 layer > 상대 layer) 그 교차점에서 상판 윗면 = 시설한계 4.5m(도로의 구조·시설
//       기준에 관한 규칙 제18조, 차도 높이 4.5m 이상) + 상판 두께 1.5m(기본값, 실측 아님) = 6.0m. 교차 도로 폭만큼 평탄부.
//     - 상대가 터널(tunnel=yes, 예: 화랑지하차도·경강선 공사 구간)이면 높이에 영향 없음. 그 밖은 종단경사 5%(기본값, 실측 아님)로 내려와 0m 에 닿음. 0.6m 넘게 뜬 비교량 구간은 옹벽(흙쌓기)으로 그린다.
//     - 상대가 우리 위를 지나면(상대 layer > 우리) 우리는 0m 그대로, 그 구조물은 만들지 않고 meta.overhead 에 기록만.
//     - 본선(경부)·램프 합류점은 본선 높이에 맞춘다.
//   사용: node scripts/corridor/build-pangyo-express.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const C = path.join(ROOT, 'public/corridor');
const OUT = path.join(C, 'pangyo/express.json');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (n) => [(n.lon - CENTER.lon) * kx, -(n.lat - CENTER.lat) * kz];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const RULE = {
  clearance: 4.5, // 도로의 구조·시설 기준에 관한 규칙 제18조(시설한계): 차도 시설한계 높이 4.5m
  deck: 1.5,      // 상판 두께 기본값(실측 아님)
  grade: 0.05,    // 종단경사 기본값 5%(실측 아님)
  step: 5,        // 표본 간격(m)
  mainAfter: 350, // 합류점 뒤 본선 길이
  mainBefore: 250, // 합류점 앞 본선 길이(상행) — 양 끝은 단면이 0m 에 닿는 곳까지 늘림(공중에서 끊기지 않게)
  tailTrim: 15,
};
const ROAD_W = { motorway: 18, motorway_link: 7, primary: 16, secondary: 12, tertiary: 9 }; // build-pangyo.mjs 와 같은 폭 규칙
const num = (v) => (v == null ? null : parseFloat(String(v).split(';')[0]));
function widthOf(t) {
  let w = ROAD_W[t.highway] ?? 7; const lanes = num(t.lanes);
  if (lanes && t.oneway === 'yes') w = Math.max(t.highway === 'motorway' ? w : 0, lanes * 3.3) || w;
  return w;
}
const layerOf = (t) => (t.layer != null ? parseInt(t.layer, 10) || 0 : t.bridge && t.bridge !== 'no' ? 1 : t.tunnel && t.tunnel !== 'no' ? -1 : 0);

const D = readJSON(path.join(ROOT, 'data/osm_pangyo_express.json'));
const DEM = readJSON(path.join(ROOT, 'data/dem_pangyo_express.json'));
const N = new Map(D.nodes.map((n) => [n.id, n])), W = new Map(D.ways.map((w) => [w.id, w]));
const G = D.groups;

// 웨이 목록 → 이어진 선 (점마다 way id)
function chain(ids) {
  const pts = [];
  for (const id of ids) {
    const w = W.get(id);
    w.nodes.forEach((nid, i) => {
      const p = proj(N.get(nid));
      if (pts.length && i === 0) { pts[pts.length - 1].nid = nid; return; } // 이음 노드
      pts.push({ x: p[0], z: p[1], way: id, nid });
    });
  }
  // 점의 way = 그 점에서 다음 점으로 가는 선분의 way
  for (let i = 0; i < pts.length - 1; i++) pts[i].segWay = pts[i + 1].way;
  pts[pts.length - 1].segWay = pts[pts.length - 1].way;
  let s = 0; pts.forEach((p, i) => { if (i) s += dist([p.x, p.z], [pts[i - 1].x, pts[i - 1].z]); p.s = s; });
  return pts;
}
// 선 위 s 지점
function at(pts, s) {
  let i = 1; while (i < pts.length - 1 && pts[i].s < s) i++;
  const a = pts[i - 1], b = pts[i], L = b.s - a.s || 1, t = Math.max(0, Math.min(1, (s - a.s) / L));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, way: a.segWay, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L };
}
function project(pts, x, z) {
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)), d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < best.d) best = { d, s: a.s + t * Math.sqrt(L2) };
  }
  return best;
}
function slice(pts, s0, s1) {
  const out = [{ ...at(pts, s0), s: s0 }];
  for (const p of pts) if (p.s > s0 + 0.01 && p.s < s1 - 0.01) out.push({ x: p.x, z: p.z, way: p.segWay, s: p.s });
  out.push({ ...at(pts, s1), s: s1 });
  out.forEach((p, i) => { p.segWay = i < out.length - 1 ? out[i].way : out[i].way; });
  const b = out[0].s; for (const p of out) p.s -= b;
  return out;
}
function segX(a, b, c, d) {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]); if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den, u = -((a[0] - b[0]) * (a[1] - c[1]) - (a[1] - b[1]) * (a[0] - c[0])) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { t, u } : null;
}
// 다른 선(교차 웨이 · 다른 built 선)과의 교차점: {s, other, layerSelf, layerOther, sin, wOther}
function crossings(line, others) {
  const out = [];
  for (const o of others) {
    const ow = W.get(o.id), op = ow.nodes.map((n) => N.get(n)).filter(Boolean).map(proj);
    for (let i = 1; i < line.length; i++) {
      const a = [line[i - 1].x, line[i - 1].z], b = [line[i].x, line[i].z];
      for (let j = 1; j < op.length; j++) {
        const h = segX(a, b, op[j - 1], op[j]); if (!h) continue;
        const sw = W.get(line[i - 1].segWay).tags, ot = ow.tags;
        const ux = (b[0] - a[0]) / dist(a, b), uz = (b[1] - a[1]) / dist(a, b), vx = (op[j][0] - op[j - 1][0]) / dist(op[j - 1], op[j]), vz = (op[j][1] - op[j - 1][1]) / dist(op[j - 1], op[j]);
        out.push({ s: line[i - 1].s + h.t * (line[i].s - line[i - 1].s), at: [r1(a[0] + (b[0] - a[0]) * h.t), r1(a[1] + (b[1] - a[1]) * h.t)], id: o.id, name: ot.name || ot.ref || ot.highway || ot.waterway || ot.railway, kind: ot.highway || ot.waterway || ot.railway, Ls: layerOf(sw), Lo: layerOf(ot), selfBridge: !!sw.bridge && sw.bridge !== 'no', otherTunnel: !!ot.tunnel && ot.tunnel !== 'no', sin: Math.abs(ux * vz - uz * vx), wo: ot.highway ? widthOf(ot) : ot.waterway ? 6 : 8 });
      }
    }
  }
  return out.sort((a, b) => a.s - b.s);
}
// 높이 단면: 앵커(평탄부)에서 경사 grade 로 내려오는 포락선 → 0 이하 자름 → 20m 이동평균으로 꺾임 다듬기
function profile(line, anchors) {
  const L = line[line.length - 1].s, n = Math.max(2, Math.ceil(L / RULE.step)), ys = [];
  for (let k = 0; k <= n; k++) {
    const s = (L * k) / n; let y = 0;
    for (const a of anchors) y = Math.max(y, a.H - RULE.grade * Math.max(0, Math.abs(s - a.s) - a.half));
    ys.push(y);
  }
  let sm = ys;
  for (let pass = 0; pass < 2; pass++) sm = sm.map((_, k) => { let a = 0, c = 0; for (let j = k - 2; j <= k + 2; j++) if (j >= 0 && j < sm.length) { a += sm[j]; c++; } return a / c; });
  // 다듬은 값과 원래 포락선 중 큰 값(둘 다 경사 ≤ grade 라 결과도 ≤ grade, 평탄부·시설한계는 그대로), 끝점은 앵커 값 그대로
  return sm.map((y, k) => (k === 0 || k === n ? ys[k] : Math.max(y, ys[k])));
}
function anchorsOf(cx) {
  const top = RULE.clearance + RULE.deck, A = [], over = [], under = [], tunnels = [];
  for (const c of cx) {
    if (c.otherTunnel) { (c.Lo > c.Ls ? under : tunnels).push(c); continue; } // 지하(터널) 아래로 지나는 길은 시설한계와 무관
    if (c.Ls > c.Lo && (c.kind !== 'stream' && c.kind !== 'river' && c.kind !== 'canal' ? true : c.selfBridge)) {
      const half = (c.wo / 2 + 2) / Math.max(0.35, c.sin);
      A.push({ s: c.s, H: top, half }); over.push(c);
    } else if (c.Lo > c.Ls) under.push(c);
  }
  return { A, over, under, tunnels };
}
function sampleLine(line, ys) {
  const L = line[line.length - 1].s, n = ys.length - 1, out = [];
  for (let k = 0; k <= n; k++) {
    const s = (L * k) / n, p = at(line, s), t = W.get(p.way).tags;
    out.push([r1(p.x), r1(p.z), r2(ys[k]), r1(widthOf(t)), t.bridge && t.bridge !== 'no' ? 1 : 0]);
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const crossOthers = G.crossing.map((id) => ({ id }));
  // --- 본선 상행(경부 서울 방향): 합류 노드 734789416 앞 250m ~ 뒤 350m
  const MERGE = 734789416;
  const nbAll = chain(G.mainNB), mi = nbAll.findIndex((p) => p.nid === MERGE), sM = nbAll[mi].s;
  // 본선 끝이 공중에서 잘리지 않게: 앞뒤로 EXT 까지 늘려 단면을 구한 뒤, 정한 구간 밖에서 처음 0m 가 되는 곳까지만 남김
  const EXT = 200, crossAll = G.crossing.map((id) => ({ id }));
  function landed(all, s0, s1, others) {
    const a = Math.max(0, s0 - EXT), b = Math.min(all[all.length - 1].s, s1 + EXT), l = slice(all, a, b);
    const ys = profile(l, anchorsOf(crossings(l, others)).A), L = l[l.length - 1].s, k = (s) => Math.round((s / L) * (ys.length - 1));
    let i0 = k(s0 - a), i1 = k(s1 - a); while (i0 > 0 && ys[i0] > 0.02) i0--; while (i1 < ys.length - 1 && ys[i1] > 0.02) i1++;
    return [a + (i0 / (ys.length - 1)) * L, a + (i1 / (ys.length - 1)) * L];
  }
  const ebIds = G.eb.map((id) => ({ id })), rtIds = G.route.map((id) => ({ id }));
  const [n0, n1] = landed(nbAll, sM - RULE.mainBefore, sM + RULE.mainAfter, crossAll.concat(G.mainSB.map((id) => ({ id })), rtIds, ebIds));
  const nb = slice(nbAll, n0, n1), sMerge = sM - n0;
  const sbAll = chain(G.mainSB);
  const pa = project(sbAll, nbAll[mi].x, nbAll[mi].z);
  const pb0 = project(sbAll, at(nbAll, sM - RULE.mainBefore).x, at(nbAll, sM - RULE.mainBefore).z), pb1 = project(sbAll, at(nbAll, sM + RULE.mainAfter).x, at(nbAll, sM + RULE.mainAfter).z);
  // 하행은 반대 방향 연결로(eb) 분기점(eb 첫 노드) 뒤 80m 까지는 있어야 함
  const di = sbAll.findIndex((p) => p.nid === W.get(G.eb[0]).nodes[0]), sDiv = di >= 0 ? sbAll[di].s + 80 : 0;
  const [q0s, q1s] = landed(sbAll, Math.min(pb0.s, pb1.s), Math.max(pb0.s, pb1.s, sDiv), crossAll.concat(G.mainNB.map((id) => ({ id })), rtIds, ebIds));
  const sb = slice(sbAll, q0s, q1s); void pa;
  const route = chain(G.route), eb = chain(G.eb);
  const lines = { route, eb, mainNB: nb, mainSB: sb };
  // 다른 built 선도 교차 상대로(본선 ↔ 램프 입체교차) — 같은 노드를 공유하는 합류/분기점은 교차가 아님
  const builtOthers = (self) => Object.entries(lines).filter(([k]) => k !== self).flatMap(([, l]) => [...new Set(l.map((p) => p.segWay))]).map((id) => ({ id }));
  const meta = { lines: {} }, out = { lines: [] };
  const yAt = {};
  for (const key of ['mainNB', 'mainSB', 'eb', 'route']) {
    const line = lines[key];
    const cx = crossings(line, crossOthers.concat(builtOthers(key))).filter((c) => !(key === 'route' && Math.abs(c.s - line[line.length - 1].s) < 3));
    const { A, over, under, tunnels } = anchorsOf(cx);
    if (key === 'route') A.push({ s: line[line.length - 1].s, H: yAt.merge, half: 0 }); // 합류점 = 본선 높이
    const ys = profile(line, A);
    if (key === 'mainNB') yAt.merge = ys[Math.round((sMerge / line[line.length - 1].s) * (ys.length - 1))];
    const pts = sampleLine(line, ys);
    // 시설한계 확인: 우리 아래로 지나는 교차점에서 상판 밑(윗면 - 두께) 높이
    const clear = over.map((c) => { const k = Math.round((c.s / line[line.length - 1].s) * (ys.length - 1)); return { name: c.name, id: c.id, s: Math.round(c.s), at: c.at, deckTop: r2(ys[k]), clearance: r2(ys[k] - RULE.deck) }; });
    // 교각: bridge 구간, 상판 밑 1m 넘게 뜬 곳에 25m 간격(교차 도로/물길 평탄부 안은 피함 — 경간 기본값, 실측 아님)
    const piers = [], Ln = line[line.length - 1].s, nn = pts.length - 1;
    let lastS = -1e9;
    for (let k2 = 0; k2 <= nn; k2++) {
      const s2 = (Ln * k2) / nn, [x, z, y, w, br] = pts[k2];
      if (!br || y - RULE.deck < 1 || s2 - lastS < 25 || A.some((a) => Math.abs(s2 - a.s) < a.half + 3)) continue;
      const q = at(line, s2); piers.push([x, z, r2(y - RULE.deck), r2(Math.atan2(q.dx, q.dz)), w]); lastS = s2;
    }
    out.lines.push({ id: key, piers, role: key === 'route' ? 'bus' : key.startsWith('main') ? 'mainline' : 'ramp', ways: [...new Set(line.map((p) => p.segWay))], k: key.startsWith('main') ? 'motorway' : 'motorway_link', pts });
    meta.lines[key] = { lengthM: Math.round(line[line.length - 1].s), ways: [...new Set(line.map((p) => p.segWay))].map((id) => { const t = W.get(id).tags; return [id, t.name || '', t.highway, t.lanes || '', t.bridge || '', t.layer || '']; }), over: clear, tunnelsBelow: tunnels.map((c) => ({ name: c.name, id: c.id, s: Math.round(c.s) })), overhead: under.map((c) => ({ name: c.name, id: c.id, layer: c.Lo, s: Math.round(c.s), at: c.at })), maxY: r2(Math.max(...ys)) };
  }
  // --- 판교TG
  const roof = W.get(G.tollRoof[0]), ring = roof.nodes.map((n) => proj(N.get(n))).map(([x, z]) => [r1(x), r1(z)]);
  const tn = (id) => { const n = N.get(id); return { id, at: proj(n).map(r1), tags: n.tags }; };
  const booth = tn(7981145727), gantries = [tn(7981145730), tn(7981145735)];
  const onRoute = (p) => { const best = ['route', 'eb'].map((k) => ({ k, q: project(lines[k], p[0], p[1]) })).sort((a, b) => a.q.d - b.q.d)[0]; const a = at(lines[best.k], best.q.s); return { line: best.k, s: best.q.s, d: best.q.d, dx: a.dx, dz: a.dz, w: widthOf(W.get(a.way).tags), way: a.way }; };
  const toll = {
    roof: { ring, way: roof.id, underside: 5.5, thick: 1.2, note: 'OSM building=roof 윤곽. 높이는 기본값(밑면 5.5m ≥ 시설한계 4.5m, 두께 1.2m) — OSM 에 height 없음' },
    // 부스 섬: 지붕(OSM 윤곽) 긴 축과 각 방향 차도(route·eb)가 만나는 곳에, 차로 경계마다 하나(섬 수 = OSM lanes + 1), 차로 폭 3.3m(폭 규칙과 같음)
    booths: (() => {
      const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cz = ring.reduce((a, p) => a + p[1], 0) / ring.length;
      let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of ring) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
      const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ax = [Math.cos(th), Math.sin(th)];
      const ext = Math.max(...ring.map(([x, z]) => Math.abs((x - cx) * ax[0] + (z - cz) * ax[1])));
      const A0 = [cx - ax[0] * ext, cz - ax[1] * ext], A1 = [cx + ax[0] * ext, cz + ax[1] * ext];
      const sets = [];
      for (const key of ['route', 'eb']) {
        const l = lines[key];
        for (let i = 1; i < l.length; i++) {
          const h = segX([l[i - 1].x, l[i - 1].z], [l[i].x, l[i].z], A0, A1); if (!h) continue;
          const sx = l[i - 1].s + h.t * (l[i].s - l[i - 1].s), q = at(l, sx), lanes = num(W.get(q.way).tags.lanes) || 1;
          sets.push({ line: key, at: [r1(q.x), r1(q.z)], dir: [r2(q.dx), r2(q.dz)], lanes, way: q.way });
        }
      }
      return { sets, axis: [A0.map(r1), A1.map(r1)], osmBooth: booth.id, laneW: 3.3, island: [1.6, 12, 2.4], note: '섬 크기(폭 1.6 · 길이 12 · 부스 높이 2.4m)는 기본값, 섬 수는 OSM lanes + 1' };
    })(),
    gantries: gantries.map((g) => { const q = onRoute(g.at); return { at: g.at, osm: g.id, line: q.line, dir: [r2(q.dx), r2(q.dz)], span: r1(q.w + 4), h: 6.5, note: '게이트 높이 6.5m 기본값' }; }),
    note: '일반형 요금소(회사 표지·로고 없음). 위치·윤곽은 OSM, 치수는 기본값',
  };
  // --- 버스: link.json 코리더 G8110 경로 끝 → 합류 → 본선 350m
  const LK = readJSON(path.join(C, 'pangyo/link.json'));
  const cp = LK.corridor.paths.find((p) => p.route === 7090965);
  const end = cp.pts[cp.pts.length - 1], q0 = project(route, end[0], end[1]);
  const ext = [];
  for (const p of route) if (p.s > q0.s + 0.5) ext.push([r1(p.x), r1(p.z)]);
  for (const p of nb) if (p.s > sMerge + 0.5 && p.s <= sMerge + RULE.mainAfter) ext.push([r1(p.x), r1(p.z)]);
  { const e = at(nb, sMerge + RULE.mainAfter); ext.push([r1(e.x), r1(e.z)]); }
  // 끝 15m 당김
  let L = 0; const cum = [0]; const all = [end, ...ext]; for (let i = 1; i < all.length; i++) cum.push((L += dist(all[i - 1], all[i])));
  const keep = []; for (let i = 1; i < all.length; i++) if (cum[i] < L - RULE.tailTrim) keep.push(all[i]);
  { const target = L - RULE.tailTrim; let i = 1; while (cum[i] < target) i++; const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1]); keep.push([r1(all[i - 1][0] + (all[i][0] - all[i - 1][0]) * t), r1(all[i - 1][1] + (all[i][1] - all[i - 1][1]) * t)]); }
  const bus = { route: 7090965, from: end, append: keep, addM: Math.round(L - RULE.tailTrim), startGapM: r1(q0.d), endStop: true, note: '판교 박스 경계(2단계 경로 끝)에서 이어 붙임. 본선 합류 뒤 350m 지점(끝 15m 당김)에서 서서 사라짐 — 정류장 아님(OSM 정류장 없음)' };
  // --- 숨길 평면 리본: 판교/코리더 타일에서 우리 선(route/eb) 위에 전부 놓인 motorway_link 리본
  const hide = [];
  const onBuilt = (x, z) => ['route', 'eb'].some((k) => project(lines[k], x, z).d < 4);
  const PG = readJSON(path.join(C, 'pangyo/index.json'));
  for (const kind of ['tiles', 'lod']) for (const key of Object.keys(PG.tiles)) for (const dir of ['pangyo/', '']) {
    const f = path.join(C, dir + kind, key + '.json'); if (!fs.existsSync(f)) continue;
    const j = readJSON(f);
    for (const r0 of j.r || []) {
      // lod 길은 [폭, 종류번호, [x,z,x,z…], br] 형식
      const r = Array.isArray(r0) ? { k: 'motorway_link', w: r0[0], p: r0[2].reduce((o, v, i) => (i % 2 ? o[o.length - 1].push(v) : o.push([v]), o), []), lod: r0[1] } : r0;
      if (r.k !== 'motorway_link' || !r.p?.length) continue;
      const pts = []; for (let i = 0; i < r.p.length; i++) { pts.push(r.p[i]); if (i) for (let t = 0.25; t < 1; t += 0.25) pts.push([r.p[i - 1][0] + (r.p[i][0] - r.p[i - 1][0]) * t, r.p[i - 1][1] + (r.p[i][1] - r.p[i - 1][1]) * t]); }
      if (pts.every(([x, z]) => onBuilt(x, z))) hide.push({ kind, key, k: r.k, n: r.n || '', a: r.p[0].slice(0, 2), b: r.p[r.p.length - 1].slice(0, 2), np: r.p.length, ...(r.lod != null ? { lk: r.lod } : {}) });
    }
  }
  // 판교 박스(타일이 이미 도로를 그리는 곳)에서 높이 0 이고 숨긴 리본 밖이면 우리 리본은 안 그림(겹침 방지)
  const PB = PG.meta?.boxes || [PG.meta?.box];
  const inPB = (x, z) => PB.some((b) => b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  const hiddenNear = (x, z) => hide.some((h) => { const seg = [h.a, h.b]; return dist([x, z], h.a) < 1e9 && onSegNear(x, z, h); });
  function onSegNear(x, z, h) { // 숨긴 리본 a–b 사이(직선 근사 대신 선 위 투영)
    for (const k of ['route', 'eb']) { const l = lines[k], qa = project(l, ...h.a), qb = project(l, ...h.b), q = project(l, x, z); if (qa.d < 4 && qb.d < 4 && q.d < 1 && q.s >= Math.min(qa.s, qb.s) - 1 && q.s <= Math.max(qa.s, qb.s) + 1) return true; }
    return false;
  }
  for (const l of out.lines) l.draw = l.pts.map(([x, z, y]) => (y > 0.02 || !inPB(x, z) || hiddenNear(x, z) ? 1 : 0));
  const res = {
    meta: {
      generated: new Date().toISOString().slice(0, 10),
      source: `${D.source} · fetched ${D.fetched} · ${D.license}`,
      rule: RULE,
      heightRule: '게임 기준면 0m(판교 타일 도로) 위 상대 높이. 우리 길이 OSM layer 로 위를 지나는 교차점에서 상판 윗면 = 4.5m(도로의 구조·시설 기준에 관한 규칙 제18조 시설한계) + 상판 1.5m(기본값) = 6.0m, 그 밖은 5%(기본값)로 0m 까지. 상대가 위를 지나면 0m 그대로(그 구조물은 안 만듦)',
      widthRule: 'build-pangyo.mjs 와 같은 폭 규칙: motorway 18m, 일방 lanes×3.3m, lanes 없는 연결로 7m',
      dem: { source: DEM.source, accuracy: DEM.accuracy, routeEl: [DEM.route[0][1], DEM.route[DEM.route.length - 1][1]], routeMin: Math.min(...DEM.route.map((r) => r[1])), routeMax: Math.max(...DEM.route.map((r) => r[1])), note: '판교역 쪽 시작 ≈54m, 합류점 ≈57~59m(DSM, 상판 포함 가능). 2km 에 +4m 안팎이라 게임은 판교 타일과 같은 평면 기준(0m)을 유지 — 절대 표고는 반영 안 함' },
      lines: meta.lines,
      omitted: '우리 위로 지나는 구조물(수도권제1순환고속도로·제2경인고속도로·낙생고가차도 등, meta.lines.*.overhead)과 판교IC 의 다른 연결로는 만들지 않음. 경부 본선은 합류점 앞 250m ~ 뒤 350m 만.',
    },
    lines: out.lines, toll, bus, hide,
  };
  const json = JSON.stringify(res);
  if (check) {
    const cur = fs.existsSync(OUT) ? readJSON(OUT) : null; cur && (cur.meta.generated = res.meta.generated);
    const same = cur && JSON.stringify(cur) === json; console.log(same ? 'express.json up to date' : 'express.json differs'); process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(OUT, json);
  console.log(JSON.stringify({ lines: Object.fromEntries(Object.entries(meta.lines).map(([k, v]) => [k, { L: v.lengthM, maxY: v.maxY, over: v.over.map((o) => `${o.name}@${o.s}:${o.clearance}`), overhead: v.overhead.map((o) => `${o.name}@${o.s}`) }])), hide: hide.map((h) => `${h.kind}/${h.key} ${h.n}`), bus: { addM: bus.addM, gap: bus.startGapM, n: keep.length }, toll: { booths: toll.booths.sets.map((b) => b.line + ':' + b.lanes), gantries: toll.gantries.map((g) => g.line) } }, null, 1));
  console.log(path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(1) + 'KB');
}
if (import.meta.url === `file://${process.argv[1]}`) main();
