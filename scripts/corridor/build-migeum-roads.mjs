// [migeum-roads] 미금 박스 차도 그래프 '하나' (#24 택시·코리더 차량 연장 · #26 미금 차량 NPC 가 같이 씀): public/corridor/migeum/roads.json
//   OSM data/osm_migeum_raw.json 의 차도를 build-drive.mjs 와 같은 규칙(차도 종류·oneway·폭·차로 수, 터널·지하·area·private 제외)으로 굽고,
//   way 조각마다 '누가 그 길을 달리는지(own)'를 하나만 정한다. 같은 차로를 두 시스템 차량이 나눠 쓰지 않게 하는 규칙:
//     c : 코리더 drive.json 에 이미 있는 OSM way(성남대로 북쪽·미금로 일부 등). 코리더 차량(CorridorCars) 몫. 런타임은 drive.json 원본을 쓰고
//         여기 조각은 미금 그래프의 '이음(포털)'과 테스트용 기하로만 쓴다.
//     x : 미금 연장 — drive.json 에 없는 primary/secondary 중 미금역에서 DRIVE_R(320m) 안 구간(+ 반경 밖 바로 이웃 점 1개, #24 규칙 그대로).
//         돌마로·성남대로 남쪽 7 way. ?migeumtaxi 가 켜져 있으면(기본) 코리더 차량 그래프에 덧붙어 코리더 차량·택시 몫,
//         ?migeumtaxi=0 이면 미금 차량 NPC 몫으로 넘어간다(어느 쪽이든 한 시스템만).
//     m : 그 밖의 박스 안 차도(같은 way 의 320m 밖 나머지 포함). 미금 차량 NPC(MigeumCars) 몫.
//   고속도로(motorway·motorway_link)는 drive.json 에 없는 한 넣지 않는다(어느 쪽도 안 달림).
//   박스 경계에서 자른 곳의 노드는 edge 에 적는다. 미금 그래프의 포털 = edge ∪ (코리더 몫 조각과 공유하는 노드) → 런타임(migeumRoads.js)에서 계산.
//   좌표는 코리더와 같은 로컬 미터(정자 원점, 0.1m). 노드는 OSM node id 로 하나(박스 경계 점은 'b{way}:{i}{a|b}').
//   사용: node scripts/corridor/build-migeum-roads.mjs [--check] [--out=...]   (--check: 커밋된 파일 = 빌드 결과인지만 확인)
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const ROADS_OUT = 'public/corridor/migeum/roads.json';
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
// build-drive.mjs / build-migeum-npc.mjs 와 같은 폭 표
const ROAD_W = { trunk: 16, primary: 16, secondary: 12, tertiary: 9, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6 };
const widthOf = (t) => { let w = ROAD_W[t.highway] ?? 4; const l = num(t.lanes); if (l && w >= 6) w = Math.max(w, l * 3.2); return w; };
const skipHw = (t) => (t.tunnel && t.tunnel !== 'no') || num(t.layer) < 0;
export const ROADS_RULE = { EXT_KINDS: ['primary', 'secondary'], DRIVE_R: 320, CAR: Object.keys(ROAD_W) };

export function buildMigeumRoads() {
  const MG = J('public/corridor/migeum/index.json'), B = MG.meta.box;
  const ST = MG.stations.find((s) => s.name === '미금') || MG.stations[0];
  const raw = J('data/osm_migeum_raw.json');
  const cd = J('public/corridor/drive.json');
  const corr = new Map(cd.ways.map((w) => [w.id, w]));
  const inB = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
  const inR = ([x, z]) => Math.hypot(x - ST.x, z - ST.z) <= ROADS_RULE.DRIVE_R;
  function edgePt(a, b) { // 선분 a→b 가 박스 경계를 지나는 점(안쪽 a, 바깥 b) — build-migeum-npc.mjs 와 같음
    let t = 1; const dx = b[0] - a[0], dz = b[1] - a[1];
    for (const [d, p, lo, hi] of [[dx, a[0], B.x0, B.x1], [dz, a[1], B.z0, B.z1]]) { if (d > 0 && p + d * t > hi) t = (hi - p) / d; if (d < 0 && p + d * t < lo) t = (lo - p) / d; }
    return [a[0] + dx * t, a[1] + dz * t];
  }
  const nodeIdx = new Map(), nodes = [], ways = [], edge = new Set();
  const nid = (key, p) => { if (!nodeIdx.has(key)) { nodeIdx.set(key, nodes.length); nodes.push(p.map(r1)); } return nodeIdx.get(key); };
  const stat = { c: 0, x: 0, m: 0, clipped: 0 };
  // 점 i0..i1 구간을 way 조각으로. clip: 박스 경계에서 자르고 경계 점 노드를 만든다
  function emit(e, P, i0, i1, base, clip) {
    let run = [];
    const flush = () => { if (run.length >= 2) { ways.push({ ...base, n: run }); stat[base.own]++; } run = []; };
    for (let i = i0; i <= i1; i++) {
      const p = P[i], id = e.nodes[i];
      if (!clip) { run.push(nid(id, p)); continue; }
      if (inB(p)) {
        if (i > i0 && !inB(P[i - 1])) { const j = nid(`b${e.id}:${i}a`, edgePt(p, P[i - 1])); edge.add(j); run.push(j); stat.clipped++; }
        run.push(nid(id, p));
      } else if (i > i0 && inB(P[i - 1])) { const j = nid(`b${e.id}:${i}b`, edgePt(P[i - 1], p)); edge.add(j); run.push(j); stat.clipped++; flush(); }
    }
    flush();
  }
  for (const e of raw.elements) { // OSM 파일 순서 그대로(#24 연장 노드 순서와 같게)
    if (e.type !== 'way' || !e.geometry || !e.tags || !e.nodes) continue;
    const t = e.tags, P = e.geometry.map(proj);
    const cw = corr.get(e.id);
    if (cw) { // c: 코리더 몫 — 폭·종류·방향은 drive.json 값
      if (!P.some(inB)) continue;
      const base = { id: e.id, k: cw.k, w: cw.w, ow: cw.ow, own: 'c' }; if (cw.name) base.name = cw.name; if (cw.br) base.br = 1;
      emit(e, P, 0, P.length - 1, base, true); continue;
    }
    if (!ROADS_RULE.CAR.includes(t.highway) || skipHw(t) || t.area === 'yes' || t.access === 'private' || t.access === 'no') continue;
    const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' ? 1 : t.oneway === '-1' ? -1 : 0;
    const mk = (own) => { const b = { id: e.id, k: t.highway, w: r1(widthOf(t)), ow, own }; if (t.name) b.name = t.name; if (t.bridge && t.bridge !== 'no') b.br = 1; if (num(t.lanes)) b.lanes = num(t.lanes); return b; };
    // 구간(i-1→i)마다 x/m. x = 두 끝점 모두 'keep'(반경 안이거나 반경 안 점의 이웃) — #24 build-migeum-taxibike.mjs 와 같은 규칙
    const segOwn = [null];
    if (ROADS_RULE.EXT_KINDS.includes(t.highway)) {
      const keep = P.map((p, i) => inR(p) || (i > 0 && inR(P[i - 1])) || (i < P.length - 1 && inR(P[i + 1])));
      for (let i = 1; i < P.length; i++) segOwn.push(keep[i - 1] && keep[i] ? 'x' : 'm');
    } else for (let i = 1; i < P.length; i++) segOwn.push('m');
    if (!segOwn.includes('x') && !P.some(inB)) continue;
    for (let i = 1; i < P.length;) { // 같은 owner 구간을 이어 조각 하나
      let j = i; while (j + 1 < P.length && segOwn[j + 1] === segOwn[i]) j++;
      const own = segOwn[i];
      if (own === 'x') { if (!P.slice(i - 1, j + 1).every(inB)) throw new Error(`연장 way ${e.id} 가 박스 밖`); emit(e, P, i - 1, j, mk('x'), false); }
      else emit(e, P, i - 1, j, mk('m'), true); // 박스 밖 구간은 조각이 생기지 않음
      i = j + 1;
    }
  }
  return {
    meta: {
      attribution: '© OpenStreetMap contributors (ODbL)',
      note: '미금 박스 차도 그래프(OSM). own: c=코리더 drive.json · x=미금 연장(?migeumtaxi 켜짐: 코리더 차량, 꺼짐: 미금 차량 NPC) · m=미금 차량 NPC. 규칙은 scripts/corridor/build-migeum-roads.mjs 머리말',
      source: { osm: 'data/osm_migeum_raw.json', corridorDrive: 'public/corridor/drive.json' },
      rule: { DRIVE_R: ROADS_RULE.DRIVE_R, EXT_KINDS: ROADS_RULE.EXT_KINDS },
      box: B, station: { name: ST.name, x: ST.x, z: ST.z },
      stats: { nodes: nodes.length, ways: ways.length, ...stat, edge: edge.size },
    },
    nodes, ways, edge: [...edge].sort((a, b) => a - b),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const out = JSON.stringify(buildMigeumRoads());
  const file = path.resolve(ROOT, arg('out', ROADS_OUT));
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(file, 'utf8') !== out) { console.error('migeum/roads.json 이 빌드 결과와 다름'); process.exit(1); }
    console.log('migeum/roads.json ok');
  } else { fs.writeFileSync(file, out); console.log(path.relative(ROOT, file), (out.length / 1024).toFixed(1) + 'KB', JSON.stringify(JSON.parse(out).meta.stats)); }
}
