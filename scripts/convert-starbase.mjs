// Starbase, TX (Boca Chica) OSM 원본 -> public/starbase.json 변환기
// 좌표계: Starbase village 노드(25.9915, -97.1830) 기준 미터 단위. x = 동쪽(+), z = 남쪽(+)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CENTER = { lat: 25.9915, lon: -97.1830 }; // OSM place=village node 151500265 'Starbase'
const BBOX = { s: 25.980, w: -97.200, n: 26.000, e: -97.140 };
const LEVEL_H = 3.2;
const DEFAULT_LEVELS = 3;
const RAW_JSON = 'data/osm_starbase_raw.json';

function loadRaw() {
  if (!fs.existsSync(RAW_JSON)) {
    const xmlFiles = fs.readdirSync('data/sb').filter((f) => f.endsWith('.xml')).map((f) => `data/sb/${f}`);
    if (!xmlFiles.length) throw new Error('data/sb/*.xml 파일이 없습니다.');
    execFileSync('python3', ['scripts/osmxml_to_overpass.py', RAW_JSON, ...xmlFiles], { stdio: 'inherit' });
  }
  const d = JSON.parse(fs.readFileSync(RAW_JSON, 'utf8'));
  return { d, f: RAW_JSON };
}

const { d: raw, f: srcFile } = loadRaw();
console.log('source:', srcFile, raw.elements.length, 'elements');

const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320;
const kz = 110540;
const r1 = (v) => Math.round(v * 10) / 0.1 / 100;
const proj = (g) => [Math.round((g.lon - CENTER.lon) * kx * 10) / 10, Math.round(-(g.lat - CENTER.lat) * kz * 10) / 10];

const area = (ring) => {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
};
const centroid = (ring) => {
  let x = 0, z = 0;
  ring.forEach((p) => { x += p[0]; z += p[1]; });
  return [Math.round((x / ring.length) * 10) / 10, Math.round((z / ring.length) * 10) / 10];
};
function cleanRing(pts) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }
  return out.length >= 3 ? out : null;
}
const key = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;

function joinRings(segs) {
  segs = segs.filter((s) => s && s.length > 1).map((s) => s.slice());
  const rings = [];
  while (segs.length) {
    let cur = segs.shift();
    let progress = true;
    while (key(cur[0]) !== key(cur[cur.length - 1]) && progress) {
      progress = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = key(cur[cur.length - 1]);
        if (key(s[0]) === end) cur = cur.concat(s.slice(1));
        else if (key(s[s.length - 1]) === end) cur = cur.concat(s.slice().reverse().slice(1));
        else if (key(s[s.length - 1]) === key(cur[0])) cur = s.concat(cur.slice(1));
        else if (key(s[0]) === key(cur[0])) cur = s.slice().reverse().concat(cur.slice(1));
        else continue;
        segs.splice(i, 1); progress = true; break;
      }
    }
    if (key(cur[0]) === key(cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}

function polygonsOf(e) {
  if (e.type === 'way') {
    const g = e.geometry;
    if (!g || g.length < 4 || key(g[0]) !== key(g[g.length - 1])) return [];
    const r = cleanRing(g.map(proj));
    return r ? [{ outer: r, holes: [] }] : [];
  }
  if (e.type === 'relation') {
    const outers = joinRings(e.members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => m.geometry)).map((r) => cleanRing(r.map(proj))).filter(Boolean);
    const inners = joinRings(e.members.filter((m) => m.type === 'way' && m.role === 'inner').map((m) => m.geometry)).map((r) => cleanRing(r.map(proj))).filter(Boolean);
    return outers.map((o, i) => ({ outer: o, holes: i === 0 ? inners : [] }));
  }
  return [];
}
const num = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const [bx0, bz1] = proj({ lat: BBOX.s, lon: BBOX.w });
const [bx1, bz0] = proj({ lat: BBOX.n, lon: BBOX.e });
function clipRect(ring) {
  const round1 = (v) => Math.round(v * 10) / 10;
  const edges = [
    [(p) => p[0] >= bx0, (a, b) => { const t = (bx0 - a[0]) / (b[0] - a[0]); return [bx0, round1(a[1] + t * (b[1] - a[1]))]; }],
    [(p) => p[0] <= bx1, (a, b) => { const t = (bx1 - a[0]) / (b[0] - a[0]); return [bx1, round1(a[1] + t * (b[1] - a[1]))]; }],
    [(p) => p[1] >= bz0, (a, b) => { const t = (bz0 - a[1]) / (b[1] - a[1]); return [round1(a[0] + t * (b[0] - a[0])), bz0]; }],
    [(p) => p[1] <= bz1, (a, b) => { const t = (bz1 - a[1]) / (b[1] - a[1]); return [round1(a[0] + t * (b[0] - a[0])), bz1]; }],
  ];
  let pts = ring;
  for (const [inside, inter] of edges) {
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur)) { if (!inside(prev)) res.push(inter(prev, cur)); res.push(cur); }
      else if (inside(prev)) res.push(inter(prev, cur));
    }
    pts = res;
    if (!pts.length) break;
  }
  return cleanRing(pts);
}
const clipPoly = (poly) => {
  const o = clipRect(poly.outer);
  if (!o) return null;
  return { outer: o, holes: poly.holes.map(clipRect).filter(Boolean) };
};

const out = {
  meta: {
    center: CENTER, bbox: BBOX, bboxLocal: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 }, levelHeight: LEVEL_H, defaultLevels: DEFAULT_LEVELS,
    source: srcFile, generated: new Date().toISOString(),
    attribution: '© OpenStreetMap contributors (ODbL)',
  },
  station: { x: 0, z: 0, name: 'Starbase' },
  buildings: [], roads: [], water: [], waterLines: [], parks: [], labels: [],
  gantries: [], // [tower]
};
const stats = { height: 0, levels: 0, default: 0, override: 0 };

const ROAD_W = { motorway: 16, trunk: 16, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, cycleway: 2.2, path: 2, steps: 2, track: 3, corridor: 2 };
const WALKABLE = new Set(['footway', 'pedestrian', 'path', 'living_street', 'residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'cycleway']);
const LANDMARK = /Integration Tower|^Mega ?Bay|Gigabay|Starfactory|Starhopper|City Hall|Astropub|^Pad 2$|Raptor Nest/;
const IGNORE_HEIGHT = new Set([1549519359]); // Flame Trench OSM height tag fix

for (const e of raw.elements) {
  const t = e.tags || {};
  if (e.type === 'node') continue;
  if (t.building || t['building:part']) {
    if (t.building === 'roof' && !t.height) continue;
    let h = num(t.height), src = 'height';
    if (IGNORE_HEIGHT.has(e.id)) { h = null; stats.override++; }
    const lv = num(t['building:levels']);
    if (!h || h < 2) {
      if (lv) { h = lv * LEVEL_H; src = 'levels'; }
      else { h = (['house', 'garage', 'shed', 'kiosk', 'hut'].includes(t.building) ? 1 : DEFAULT_LEVELS) * LEVEL_H; src = 'default'; }
    }
    let minH = num(t.min_height) || (num(t['building:min_level']) || 0) * LEVEL_H;
    for (const poly of polygonsOf(e)) {
      if (Math.abs(area(poly.outer)) < 4) continue;
      stats[src]++;
      const b = { o: poly.outer, h: Math.round(h * 10) / 10, k: t.building || 'yes', s: src };
      if (poly.holes.length) b.holes = poly.holes;
      if (minH) b.mh = Math.round(minH * 10) / 10;
      if (t.name) b.n = t.name;
      if (['tower', 'storage_tank'].includes(t.man_made) || t.ref === 'OLM 2' || t['construction:aeroway'] === 'flame_trench') {
        b.id = e.id;
        if (t.man_made) b.mm = t.man_made;
        if (t.ref) b.ref = t.ref;
        if (t['construction:aeroway'] === 'flame_trench') b.ft = 1;
      }
      out.buildings.push(b);
      if (t.name && LANDMARK.test(t.name)) {
        const c = centroid(poly.outer);
        out.labels.push({ x: c[0], z: c[1], y: Math.round((h + 4) * 10) / 10, text: t.name, kind: 'landmark' });
      }
    }
    continue;
  }
  if (t.man_made === 'gantry' && e.type === 'way' && e.geometry) {
    out.gantries.push({ id: e.id, p: e.geometry.map(proj) });
    continue;
  }
  if (t.highway && e.type === 'way' && e.geometry) {
    if (t.tunnel && t.tunnel !== 'no') continue;
    if (num(t.layer) < 0) continue;
    if (['construction', 'proposed', 'platform', 'bus_stop', 'elevator'].includes(t.highway)) continue;
    let w = ROAD_W[t.highway] ?? 4;
    const lanes = num(t.lanes);
    if (lanes && w >= 6) w = Math.max(w, lanes * 3.2);
    const pts = e.geometry.map(proj);
    if (t.area === 'yes') { const r = cleanRing(pts); if (r) out.parks.push({ o: r, k: 'plaza' }); continue; }
    const road = { p: pts, w: Math.round(w * 10) / 10, k: t.highway };
    if (t.name) road.n = t.name;
    if (WALKABLE.has(t.highway)) road.walk = 1;
    if (t.bridge && t.bridge !== 'no') road.br = 1;
    out.roads.push(road);
    continue;
  }
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir') {
    for (const poly of polygonsOf(e).map(clipPoly).filter(Boolean)) out.water.push({ o: poly.outer, holes: poly.holes });
    continue;
  }
  if (t.waterway && e.type === 'way' && e.geometry) {
    const w = t.waterway === 'river' ? 30 : t.waterway === 'stream' ? 6 : 3;
    out.waterLines.push({ p: e.geometry.map(proj), w, n: t.name });
    continue;
  }
  const parkKind = ['park', 'garden', 'playground', 'pitch', 'recreation_ground'].includes(t.leisure) ? t.leisure
    : ['grass', 'park', 'recreation_ground', 'forest', 'meadow', 'village_green'].includes(t.landuse) ? t.landuse
    : ['wood', 'scrub', 'grassland'].includes(t.natural) ? t.natural : null;
  if (parkKind) {
    for (const poly of polygonsOf(e).map(clipPoly).filter(Boolean)) out.parks.push({ o: poly.outer, holes: poly.holes, k: parkKind, n: t.name });
  }
}

// 멕시코만: coastline way 들을 이어 bbox 동쪽 경계와 닫아 바다 폴리곤 생성
{
  const segs = raw.elements.filter((e) => e.type === 'way' && e.tags?.natural === 'coastline' && e.geometry).map((e) => e.geometry);
  const [line] = [(() => {
    let cur = segs.shift();
    while (segs.length) {
      const i = segs.findIndex((s) => key(s[0]) === key(cur[cur.length - 1]) || key(s[s.length - 1]) === key(cur[0]));
      if (i < 0) break;
      const s2 = segs.splice(i, 1)[0];
      cur = key(s2[0]) === key(cur[cur.length - 1]) ? cur.concat(s2.slice(1)) : s2.concat(cur.slice(1));
    }
    return cur;
  })()];
  if (line) {
    const pts = line.map(proj);
    const sea = clipRect(pts.concat([[bx1 + 2000, pts[pts.length - 1][1]], [bx1 + 2000, pts[0][1]]]));
    if (sea) out.water.push({ o: sea, holes: [], k: 'sea' });
  }
}

const marks = [];
for (const l of out.labels.filter((l) => l.kind === 'landmark')) {
  if (!marks.some((m) => m.text === l.text)) marks.push(l);
}
out.labels = [...marks];
out.labels.push({ x: 0, z: 0, text: 'Gulf (Boca Chica Beach)', kind: 'water', auto: 'sea' });
const tc = out.water.filter((w) => w.k === 'sea').flatMap((w) => w.o).filter((p) => p[0] > 3500);
if (tc.length) {
  const p = tc.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
  const l = out.labels.find((l) => l.auto);
  l.x = p[0]; l.z = p[1]; delete l.auto;
} else {
  out.labels.pop();
}

out.meta.stats = { ...stats, buildings: out.buildings.length, roads: out.roads.length, water: out.water.length, waterLines: out.waterLines.length, parks: out.parks.length, labels: out.labels.length };
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/starbase.json', JSON.stringify(out));
console.log(out.meta.stats, 'station', out.station, (fs.statSync('public/starbase.json').size / 1024).toFixed(0) + 'KB');
