// [corridor] 코리더 차량 NPC(택시·일반 차량)용 차도 그래프: public/corridor/drive.json
//   라이브 public/drive.json 과 같은 스키마·같은 규칙(scripts/convert-taxi-terrain.mjs: 차도 종류, oneway, 폭, 차로 수).
//   코리더 경계 안 · 상세 타일이 있는 칸에 걸친 차도만. 정자 bbox 안쪽 구간은 런타임에서 진입하지 않는다(라이브 택시 영역).
//   service/living_street 는 넣지 않는다(파일 크기, 스폰 가중치도 거의 0).
//   사용: node scripts/corridor/build-drive.mjs [--osm=../bumpinto-world/data/raw/osm_merged.json] [--out=public/corridor/drive.json]
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OSM = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/drive.json'));
const CENTER = { lat: 37.36650, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [(g.lon - CENTER.lon) * kx, -(g.lat - CENTER.lat) * kz];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const ROAD_W = { motorway: 16, trunk: 16, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6 };
const widthOf = (t) => { let w = ROAD_W[t.highway] ?? 4; const l = num(t.lanes); if (l && w >= 6) w = Math.max(w, l * 3.2); return w; };
const skipHw = (t) => (t.tunnel && t.tunnel !== 'no') || num(t.layer) < 0;
const CAR = new Set(Object.keys(ROAD_W));

const CI = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/corridor/index.json'), 'utf8'));
const LB = CI.meta.liveBox, B = CI.meta.bounds, TS = CI.meta.tileSize;
const inLive = ([x, z]) => x >= LB.x0 && x <= LB.x1 && z >= LB.z0 && z <= LB.z1;
const okPt = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1 && !!CI.tiles[`${Math.floor(x / TS)}_${Math.floor(z / TS)}`] && !inLive([x, z]);

const raw = JSON.parse(fs.readFileSync(OSM, 'utf8'));
const nodeIdx = new Map(), nodes = [], ways = [];
for (const e of raw.elements) {
  if (e.type !== 'way' || !e.geometry || !e.tags) continue;
  const t = e.tags;
  if (!CAR.has(t.highway) || skipHw(t) || t.area === 'yes' || t.access === 'private' || t.access === 'no') continue;
  const P = e.geometry.map(proj);
  if (!P.some(okPt)) continue;
  const n = e.nodes.map((id, i) => { if (!nodeIdx.has(id)) { nodeIdx.set(id, nodes.length); nodes.push(P[i].map(r1)); } return nodeIdx.get(id); });
  const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || (['motorway', 'motorway_link'].includes(t.highway) && t.oneway !== 'no') ? 1 : t.oneway === '-1' ? -1 : 0;
  const w = { id: e.id, k: t.highway, n, w: r1(widthOf(t)), ow };
  if (t.name) w.name = t.name;
  if (t.bridge && t.bridge !== 'no') w.br = 1;
  if (num(t.lanes)) w.lanes = num(t.lanes);
  ways.push(w);
}
fs.writeFileSync(OUT, JSON.stringify({ meta: { attribution: '© OpenStreetMap contributors (ODbL)', note: '코리더 차량 NPC 시뮬레이션용 차도 그래프. oneway 반영. 차량 위치는 실제 데이터 아님', generated: new Date().toISOString(), liveBox: LB }, nodes, ways }));
console.log('corridor drive.json', nodes.length, 'nodes', ways.length, 'ways', (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
