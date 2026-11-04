// [migeum-npc] 미금역 일대 차량·보행 NPC 데이터: public/corridor/migeum/npc.json
//   drive : 미금 박스(migeum/index.json meta.box) 안 차도 그래프. 규칙은 scripts/corridor/build-drive.mjs 와 같다
//           (차도 종류·oneway·폭·차로 수, 터널·지하 제외). 단, 다음은 다르다:
//           ① 코리더 drive.json 에 이미 있는 OSM way(코리더 차량이 다니는 큰길 구간)는 넣지 않는다 → 같은 길에 차가 겹치지 않음
//           ② 고속도로(motorway·motorway_link)는 넣지 않는다(동네 길 위주)
//           ③ 박스 경계에서 잘라 경계 위에 노드를 만든다
//           portals: 코리더 차도와 만나는 노드 + 박스 경계 노드 → 런타임에서 '나가는 곳'(여기서 사라지고 다른 곳에 나타남)
//   walk  : 보도 지점 [x, z] — 보행 가능 길(차도면 가장자리 바깥 1.8m 양쪽, 보행로면 가운데) 위 20m 간격, 역 450m 안
//   stops : 1층 상가(commercial·retail 건물) 중심 [x, z] — 배달 오토바이 정차 후보
//   좌표는 코리더와 같은 로컬 미터(정자 원점). 실제 차량·사람 위치 데이터 아님(시뮬레이션)
//   사용: node scripts/corridor/build-migeum-npc.mjs [--out=public/corridor/migeum/npc.json]
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/migeum/npc.json'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const ROAD_W = { trunk: 16, primary: 16, secondary: 12, tertiary: 9, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6 };
const widthOf = (t) => { let w = ROAD_W[t.highway] ?? 4; const l = num(t.lanes); if (l && w >= 6) w = Math.max(w, l * 3.2); return w; };
const skipHw = (t) => (t.tunnel && t.tunnel !== 'no') || num(t.layer) < 0;
const CAR = new Set(Object.keys(ROAD_W));

const MG = J('public/corridor/migeum/index.json'), B = MG.meta.box;
const ST = MG.stations[0];
const raw = J('data/osm_migeum_raw.json');
const corr = new Set(J('public/corridor/drive.json').ways.map((w) => w.id));
const inB = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
// 선분 a→b 가 박스 경계를 지나는 점(안쪽 a, 바깥 b)
function edgePt(a, b) {
  let t = 1;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  for (const [d, p, lo, hi] of [[dx, a[0], B.x0, B.x1], [dz, a[1], B.z0, B.z1]]) {
    if (d > 0 && p + d * t > hi) t = (hi - p) / d;
    if (d < 0 && p + d * t < lo) t = (lo - p) / d;
  }
  return [a[0] + dx * t, a[1] + dz * t];
}

// ---------- 차도 그래프 ----------
const nodeIdx = new Map(), nodes = [], ways = [], portals = new Set();
const corrNodes = new Set();
for (const e of raw.elements) if (e.type === 'way' && corr.has(e.id) && e.nodes) for (const id of e.nodes) corrNodes.add(id);
const nid = (key, p) => { if (!nodeIdx.has(key)) { nodeIdx.set(key, nodes.length); nodes.push(p.map(r1)); } return nodeIdx.get(key); };
const stat = { osmWays: 0, skippedCorridor: 0, clipped: 0 };
const elems = raw.elements.filter((e) => e.type === 'way' && e.geometry && e.tags).sort((a, b) => a.id - b.id);
for (const e of elems) {
  const t = e.tags;
  if (!CAR.has(t.highway) || skipHw(t) || t.area === 'yes' || t.access === 'private' || t.access === 'no') continue;
  const P = e.geometry.map(proj);
  if (!P.some(inB)) continue;
  if (corr.has(e.id)) { stat.skippedCorridor++; continue; }
  stat.osmWays++;
  const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' ? 1 : t.oneway === '-1' ? -1 : 0;
  const base = { id: e.id, k: t.highway, w: r1(widthOf(t)), ow };
  if (t.name) base.name = t.name;
  if (t.bridge && t.bridge !== 'no') base.br = 1;
  if (num(t.lanes)) base.lanes = num(t.lanes);
  // 박스 안 연속 구간(run)마다 way 하나. 경계를 넘는 곳엔 경계 위 노드(포털)
  let run = [];
  const flush = () => { if (run.length >= 2) ways.push({ ...base, n: run }); run = []; };
  for (let i = 0; i < P.length; i++) {
    const p = P[i], id = e.nodes[i];
    if (inB(p)) {
      if (i > 0 && !inB(P[i - 1])) { const q = edgePt(p, P[i - 1]), j = nid(`b${e.id}:${i}a`, q); portals.add(j); run.push(j); stat.clipped++; }
      const j = nid(id, p); if (corrNodes.has(id)) portals.add(j);
      run.push(j);
    } else if (i > 0 && inB(P[i - 1])) { const q = edgePt(P[i - 1], p), j = nid(`b${e.id}:${i}b`, q); portals.add(j); run.push(j); stat.clipped++; flush(); }
  }
  flush();
}

// ---------- 보도 지점 · 상가 ----------
const tiles = Object.keys(MG.tiles).sort().map((k) => J(`public/corridor/migeum/tiles/${k}.json`));
const WALK_R = 450, STEP = 20, CARK = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'trunk', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link']);
const near = ([x, z]) => Math.hypot(x - ST.x, z - ST.z) < WALK_R;
const walk = [], seen = new Set();
const add = (x, z) => { const k = Math.round(x / 6) + ',' + Math.round(z / 6); if (seen.has(k) || !inB([x, z]) || !near([x, z])) return; seen.add(k); walk.push([r1(x), r1(z)]); };
for (const t of tiles) for (const r of t.r) {
  if (!r.walk || /motorway/.test(r.k)) continue;
  const car = CARK.has(r.k), off = car ? r.w / 2 + 1.8 : 0;
  let carry = 0;
  for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let s = carry; s < L; s += STEP) {
      const x = ax + ux * s, z = az + uz * s;
      if (off) { add(x - uz * off, z + ux * off); add(x + uz * off, z - ux * off); } else add(x, z);
    }
    carry = (carry - L) % STEP; if (carry < 0) carry += STEP;
  }
}
walk.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
const stops = [];
for (const t of tiles) for (const b of t.b) if ((b.k === 'commercial' || b.k === 'retail') && b.o?.length) {
  let x = 0, z = 0; for (const p of b.o) { x += p[0]; z += p[1]; } x /= b.o.length; z /= b.o.length;
  if (inB([x, z])) stops.push([r1(x), r1(z)]);
}
stops.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

const out = {
  meta: {
    attribution: '© OpenStreetMap contributors (ODbL)',
    note: '미금 차량·보행 NPC 시뮬레이션용(도로 그래프·보도 지점). 차량·사람 위치는 실제 데이터 아님',
    generated: new Date().toISOString(), source: { osm: MG.meta.source?.osm || null, corridorDrive: 'public/corridor/drive.json (way id 중복 제외)' },
    box: B, station: { x: ST.x, z: ST.z }, stats: { ...stat, nodes: nodes.length, ways: ways.length, portals: portals.size, walk: walk.length, stops: stops.length },
  },
  drive: { nodes, ways, portals: [...portals].sort((a, b) => a - b) },
  walk, stops,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('migeum npc.json', JSON.stringify(out.meta.stats), (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
