// [schoolzone] 이미 구운 월드(정자·코리더·판교·미금)에서 학교 건물·차도·횡단보도·이름을 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import { YATAP_NAME } from '../../src/corridor/schoolZonePlan.js';

const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (lat, lon) => [(lon - CENTER.lon) * kx, -(lat - CENTER.lat) * kz];

function read(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function walkTiles(dir, buildings, roads) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const t = read(path.join(dir, f));
    for (const b of t.b || []) if (b.k === 'school' || b.k === 'kindergarten') buildings.push(b);
    for (const r of t.r || []) if (r.p?.length >= 2) roads.push(r);
  }
}

function osmNames(file) {
  if (!fs.existsSync(file)) return [];
  const j = read(file);
  const out = [];
  for (const e of j.elements || []) {
    const t = e.tags || {};
    if (t.amenity !== 'school' && t.amenity !== 'kindergarten') continue;
    const name = t['name:ko'] || t.name || '';
    if (!name || /운동장|급식|본관/.test(name)) continue;
    let lat = e.lat, lon = e.lon;
    if (lat == null && Array.isArray(e.geometry)) {
      let slat = 0, slon = 0, n = 0;
      for (const g of e.geometry) if (g?.lat != null) { slat += g.lat; slon += g.lon; n++; }
      if (n) { lat = slat / n; lon = slon / n; }
    }
    if (lat == null) continue;
    const [x, z] = proj(lat, lon);
    out.push({ x, z, name });
  }
  return out;
}

export function loadSchoolWorld(root) {
  const buildings = [], roads = [];
  const jj = read(path.join(root, 'public/jeongja.json'));
  for (const b of jj.buildings || []) if (b.k === 'school' || b.k === 'kindergarten') buildings.push(b);
  for (const r of jj.roads || []) if (r.p?.length >= 2) roads.push(r);
  walkTiles(path.join(root, 'public/corridor/tiles'), buildings, roads);
  walkTiles(path.join(root, 'public/corridor/pangyo/tiles'), buildings, roads);
  walkTiles(path.join(root, 'public/corridor/migeum/tiles'), buildings, roads);
  const base = read(path.join(root, 'public/corridor/base.json'));
  const transit = read(path.join(root, 'public/transit.json'));
  const crossings = [...(base.crossings || []), ...(transit.crossings || [])];
  const names = [
    YATAP_NAME,
    ...osmNames(path.join(root, 'data/osm_raw_osmapi.json')),
    ...osmNames(path.join(root, 'data/osm_raw.json')),
    ...osmNames(path.join(root, 'data/osm_pangyo_raw.json')),
    ...osmNames(path.join(root, 'data/osm_migeum_raw.json')),
  ];
  for (const l of jj.labels || []) {
    if (/초등학교|유치원|어린이집/.test(l.text || '')) names.push({ x: l.x, z: l.z, name: l.text });
  }
  return { buildings, roads, crossings, names };
}
