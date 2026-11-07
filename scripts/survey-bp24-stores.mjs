// 게임 안에 있는 지역마다 1층 편의점을 모아 docs/bump24-stores.md · csv 를 만든다.
//   정자: public/jeongja-shops.json (소상공인 상가정보, 층=1, cat=편의점) + OSM 빈칸
//   판교·미금·스타베이스·정자 OSM: data/osm_*.json 의 shop=convenience
//   코리더(수내~잠실): 저장 OSM 이 정자 상자 밖이면 Overpass
//   좌표·가능 여부는 게임 건물(jeongja.json, corridor/pangyo/migeum 타일, starbase.json)에 붙여 resolveBp24 로 판정
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, inPolygon, bboxOf, bboxGrid } from './lib/world-geo.mjs';
import { resolveBp24 } from '../src/corridor/bp24.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const jeongja = read('public/jeongja.json');
const C = jeongja.meta.center;
const kx = Math.cos((C.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (lat, lon) => [(lon - C.lon) * kx, -(lat - C.lat) * kz];
const sb = read('public/starbase.json');
const SC = sb.meta.center;
const skx = Math.cos((SC.lat * Math.PI) / 180) * 111320, skz = 110540;
const projSb = (lat, lon) => [(lon - SC.lon) * skx, -(lat - SC.lat) * skz];

const stationList = [
  { id: 'jeongja', ko: '정자', x: 0, z: 0 },
  { id: 'sunae', ko: '수내', x: 522, z: -1316.5 },
  { id: 'seohyeon', ko: '서현', x: 1325.3, z: -2035 },
  { id: 'imae', ko: '이매', x: 1766.8, z: -3147.1 },
  { id: 'pangyo', ko: '판교', x: 264.7, z: -3100.4 },
  { id: 'yatap', ko: '야탑', x: 1801.3, z: -4952.2 },
  { id: 'moran', ko: '모란', x: 1837.6, z: -7348.7 },
  { id: 'taepyeong', ko: '태평', x: 1715.5, z: -8092.6 },
  { id: 'gachon', ko: '가천대', x: 1625.3, z: -9086.4 },
  { id: 'bokjeong', ko: '복정', x: 1625.3, z: -11523.8 },
  { id: 'jangji', ko: '장지', x: 1567.8, z: -12423.6 },
  { id: 'munjeong', ko: '문정', x: 1253.7, z: -13191.8 },
  { id: 'garak', ko: '가락시장', x: 910.4, z: -13931.4 },
  { id: 'songpa', ko: '송파', x: 338.9, z: -14726.1 },
  { id: 'seokchon', ko: '석촌', x: -109.7, z: -15343 },
  { id: 'jamsil', ko: '잠실', x: -726.4, z: -16218.4 },
  { id: 'migeum', ko: '미금', x: 58.9, z: 1845 },
];

function regionOf(x, z, world) {
  if (world === 'starbase') return 'Starbase';
  if (world === 'pangyo') return '판교';
  if (world === 'migeum') return '미금';
  let best = null, bd = 450;
  for (const s of stationList) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (world === 'jeongja') return '정자';
  let near = stationList[0], nd = Infinity;
  for (const s of stationList) { const d = Math.hypot(s.x - x, s.z - z); if (d < nd) { nd = d; near = s; } }
  if (!best) return nd < 1500 ? near.ko : '코리더';
  if (best.id === 'yatap' && Math.hypot(x - 1601, z + 5753) < 400) return '야탑/성남시청';
  if (best.id === 'jamsil') return '잠실';
  if (best.ko === '미금' && z > 2100) return '청솔/탄천';
  return best.ko;
}

function indexBuildings(list, world) {
  const grid = bboxGrid(40);
  list.forEach((b, i) => {
    if (!b.o || b.o.length < 3 || b.mh) return;
    const bb = bboxOf(b.o);
    grid.add(bb, i);
  });
  return { list, grid, world };
}
function matchBuilding(idx, x, z) {
  let inside = null, near = null, nd = 12;
  for (const i of idx.grid.at(x, z).concat(idx.grid.near({ x0: x - 12, z0: z - 12, x1: x + 12, z1: z + 12 }))) {
    const b = idx.list[i];
    if (!b?.o) continue;
    if (inPolygon(x, z, b.o, b.holes)) { inside = i; break; }
    const bb = bboxOf(b.o);
    const cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
    const d = Math.hypot(cx - x, cz - z);
    if (d < nd) { nd = d; near = i; }
  }
  const i = inside != null ? inside : near;
  if (i == null) return null;
  const b = idx.list[i];
  const bb = bboxOf(b.o);
  return { i, b, inside: inside != null, w: +(bb.x1 - bb.x0).toFixed(1), d: +(bb.z1 - bb.z0).toFixed(1), h: b.h || 0 };
}

function loadTiles(dir, world) {
  const buildings = [], roads = [];
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return indexBuildings(buildings, world);
  for (const f of fs.readdirSync(base)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
    for (const b of j.b || []) buildings.push(b);
    for (const r of j.r || []) roads.push(r);
  }
  const idx = indexBuildings(buildings, world);
  idx.roads = roads;
  return idx;
}

const worlds = {
  jeongja: { ...indexBuildings(jeongja.buildings, 'jeongja'), roads: jeongja.roads, proj },
  pangyo: loadTiles('public/corridor/pangyo/tiles', 'pangyo'),
  migeum: loadTiles('public/corridor/migeum/tiles', 'migeum'),
  corridor: loadTiles('public/corridor/tiles', 'corridor'),
  starbase: { ...indexBuildings(sb.buildings, 'starbase'), roads: sb.roads, proj: projSb },
};
worlds.pangyo.proj = proj;
worlds.migeum.proj = proj;
worlds.corridor.proj = proj;
worlds.jeongja.proj = proj;

function osmNodes(file, projFn) {
  const j = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const els = j.elements || [];
  const out = [];
  for (const e of els) {
    if (e.type !== 'node' || e.tags?.shop !== 'convenience' || e.lat == null) continue;
    const [x, z] = projFn(e.lat, e.lon);
    out.push({
      name: e.tags.name || e.tags.brand || 'convenience',
      brand: e.tags.brand || '',
      addr: [e.tags['addr:street'], e.tags['addr:housenumber']].filter(Boolean).join(' ') || '',
      lat: e.lat, lon: e.lon, x, z,
      source: `OSM node ${e.id} shop=convenience (${path.basename(file)})`,
      level: e.tags.level || '',
    });
  }
  return out;
}

const rows = [];
const shops = read('public/jeongja-shops.json');
for (const rec of shops.b) {
  const [idx, cat, count, cx, cz, names, osmOnly] = rec;
  if (cat !== 4) continue;
  rows.push({
    region: '', world: 'jeongja', name: String(names).split('|')[0], names: String(names),
    addr: '', x: cx, z: cz, bi: idx, inside: true,
    source: `public/jeongja-shops.json idx ${idx} (소상공인 상가정보 ${shops.meta.source}, 층=1, cat=편의점${osmOnly ? ', OSM 보충' : ''})`,
    floor: '상가정보 층=1',
  });
}
for (const [file, world] of [
  ['data/osm_raw_osmapi.json', 'jeongja'],
  ['data/osm_pangyo_raw.json', 'pangyo'],
  ['data/osm_migeum_raw.json', 'migeum'],
  ['data/osm_starbase_raw.json', 'starbase'],
]) {
  for (const n of osmNodes(file, worlds[world].proj)) {
    rows.push({ ...n, world, floor: n.level ? `OSM level=${n.level}` : 'OSM shop=convenience (level 태그 없음 → 1층으로 봄)', bi: null, inside: false });
  }
}

let overpassNote = '';
const boxes = [
  ['코리더', '37.36,127.09,37.52,127.14', proj, 'corridor'],
  ['판교', '37.38,127.09,37.41,127.13', proj, 'pangyo'],
  ['미금', '37.33,127.09,37.37,127.13', proj, 'migeum'],
  ['Starbase', '25.97,-97.21,26.01,-97.14', projSb, 'starbase'],
];
const notes = [];
for (const [label, bbox, pr, world] of boxes) {
  try {
    const q = `[out:json][timeout:40];(node["shop"="convenience"](${bbox});way["shop"="convenience"](${bbox}););out center;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'bumpinto-world-survey/1.0', Accept: 'application/json' },
      body: 'data=' + encodeURIComponent(q),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    let added = 0;
    for (const e of j.elements || []) {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      if (lat == null) continue;
      const [x, z] = pr(lat, lon);
      if (rows.some((r) => Math.hypot(r.x - x, r.z - z) < 18)) continue;
      rows.push({
        name: e.tags?.name || e.tags?.brand || 'convenience',
        brand: e.tags?.brand || '',
        addr: [e.tags?.['addr:street'], e.tags?.['addr:housenumber']].filter(Boolean).join(' '),
        lat, lon, x, z, world, bi: null, inside: false,
        source: `Overpass ${e.type} ${e.id} shop=convenience (${label} bbox ${bbox}, ${new Date().toISOString().slice(0, 10)})`,
        floor: e.tags?.level ? `OSM level=${e.tags.level}` : 'OSM shop=convenience (level 태그 없음)',
      });
      added++;
    }
    notes.push(`${label} Overpass ${j.elements?.length || 0}개 중 신규 ${added}`);
  } catch (e) {
    notes.push(`${label} Overpass 실패 (${e.message})`);
  }
}
overpassNote = notes.join('. ') + '.';

function judge(row) {
  const worldsTry = row.world === 'corridor' ? ['corridor', 'jeongja', 'pangyo', 'migeum'] : [row.world];
  let hit = null, used = row.world;
  for (const w of worldsTry) {
    const m = matchBuilding(worlds[w], row.x, row.z);
    if (m && (m.inside || !hit)) { hit = m; used = w; if (m.inside) break; }
  }
  row.world = used;
  row.region = regionOf(row.x, row.z, used);
  if (!hit) { row.feasible = 'no'; row.reason = '반경 12m 안에 게임 건물 없음'; return; }
  row.bi = hit.i; row.bw = hit.w; row.bd = hit.d; row.bh = hit.h; row.inside = hit.inside;
  if ((hit.h || 0) < 6.4) { row.feasible = 'no'; row.reason = `건물 높이 ${hit.h}m — 1층(4.4m)을 비우면 위층이 2m 안 됨`; return; }
  const tile = { b: [hit.b], r: worlds[used].roads || [] };
  const [cx, cz] = [(bboxOf(hit.b.o).x0 + bboxOf(hit.b.o).x1) / 2, (bboxOf(hit.b.o).z0 + bboxOf(hit.b.o).z1) / 2];
  let st = null;
  try { st = resolveBp24({ id: 't', name: 't', match: { x: cx, z: cz, r: 30 } }, tile); } catch (e) { row.feasible = 'no'; row.reason = 'resolve 오류 ' + e.message; return; }
  if (!st) { row.feasible = 'no'; row.reason = `틀이 안 나옴 (폭 ${hit.w}m · 깊이 ${hit.d}m, 최소 3.5×3)`; return; }
  row.storeW = +st.W.toFixed(1); row.storeD = +st.D.toFixed(1);
  row.cx = +cx.toFixed(1); row.cz = +cz.toFixed(1);
  row.door = st.ax ? [+(st.o[0] + st.ax[0] * st.W / 2 - st.b[0] * 1.15).toFixed(1), +(st.o[1] + st.ax[1] * st.W / 2 - st.b[1] * 1.15).toFixed(1)] : [row.x, row.z];
  let roadD = Infinity;
  for (const rd of worlds[used].roads || []) {
    const w = (rd.w || 6) / 2;
    const p = rd.p || [];
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], az = p[i - 1][1], bx = p[i][0], bz = p[i][1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((row.door[0] - ax) * dx + (row.door[1] - az) * dz) / L2));
      roadD = Math.min(roadD, Math.hypot(ax + dx * t - row.door[0], az + dz * t - row.door[1]) - w);
    }
  }
  row.recess = roadD < 1.2 ? 1.55 : 0;
  if (row.recess) row.reason += ' · 차도에 붙음(앞면 1.55m 들임)';
  row.feasible = 'yes';
  row.reason = `폭 ${row.storeW}m · 깊이 ${row.storeD}m · 높이 ${hit.h}m · ${hit.inside ? '풋프린트 안' : '외곽 12m'}`;
}

for (const r of rows) judge(r);

rows.sort((a, b) => a.region.localeCompare(b.region, 'ko') || a.x - b.x);
const kept = [];
for (const r of rows) {
  if (r.feasible !== 'yes') { kept.push(r); continue; }
  const clash = kept.find((k) => k.feasible === 'yes' && k.world === r.world && (k.bi === r.bi || Math.hypot(k.x - r.x, k.z - r.z) < 40));
  if (clash) { r.feasible = 'no'; r.reason = `중복 — ${clash.name} 과 같은 건물 또는 40m 이내`; }
  kept.push(r);
}

const esc = (s) => String(s ?? '').replaceAll('"', '""');
const cols = ['region', 'name', 'addr', 'world', 'building', 'x', 'z', 'floor', 'feasible', 'reason', 'source'];
const csv = [cols.join(',')].concat(kept.map((r) => [r.region, r.name, r.addr, r.world, r.bi ?? '', r.x?.toFixed?.(1) || r.x, r.z?.toFixed?.(1) || r.z, r.floor, r.feasible, r.reason, r.source].map((v) => `"${esc(v)}"`).join(','))).join('\n');
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/bump24-stores.csv'), csv + '\n');

const yes = kept.filter((r) => r.feasible === 'yes');
const by = new Map();
for (const r of kept) { if (!by.has(r.region)) by.set(r.region, []); by.get(r.region).push(r); }
let md = `# BUMP24 입점 후보 — 1층 편의점 조사\n\n`;
md += `게임 지역: 열린 월드 정자·Starbase, 코리더 본선(수내·서현·이매·야탑·모란·태평·가천대·복정·장지·문정·가락시장·송파·석촌·잠실), 지선 판교·미금. 수내~잠실 탄천 구간과 청솔(미금 남쪽 상가)은 그 건물 좌표가 미금·코리더 타일에 있으면 같은 목록에 들어간다.\n\n`;
md += `${overpassNote}\n\n`;
md += `가능 ${yes.length}곳 / 전체 ${kept.length}곳. 같은 건물 또는 40m 이내는 하나만 남겼다. 가능 여부는 \`resolveBp24\` (최소 3.5×3m, 위층 2m).\n\n`;
md += `| 지역 | 상호 | 주소 | 월드 | 건물 | x | z | 1층 근거 | 가능 | 이유 |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of kept) {
  md += `| ${r.region} | ${r.name} | ${r.addr || '—'} | ${r.world} | ${r.bi ?? '—'} | ${Number(r.x).toFixed(1)} | ${Number(r.z).toFixed(1)} | ${r.floor} | ${r.feasible} | ${r.reason} |\n`;
}
md += `\n## 출처\n\n`;
for (const r of kept) md += `- ${r.region} ${r.name}: ${r.source}\n`;
fs.writeFileSync(path.join(root, 'docs/bump24-stores.md'), md);
const outDir = process.env.OUT || 'artifacts';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outDir + '/bump24-stores.md', md);
fs.writeFileSync(outDir + '/bump24-stores.csv', csv + '\n');
const feas = yes.map((r) => ({ region: r.region, name: r.name, world: r.world, bi: r.bi, x: r.cx, z: r.cz, door: r.door, recess: r.recess || 0, W: r.storeW, D: r.storeD }));
fs.writeFileSync('/tmp/bp24-feasible.json', JSON.stringify(feas, null, 2));
console.log('rows', kept.length, 'yes', yes.length);
console.log(yes.map((r) => `${r.region}\t${r.name}\t${r.world}#${r.bi}\t${r.storeW}x${r.storeD}`).join('\n'));
