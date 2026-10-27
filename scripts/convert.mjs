// OSM 원본(JSON, Overpass 'out geom' 형식) -> 정적 사이트용 로컬 좌표 JSON 변환기
// 좌표계: 정자역 기준 미터 단위. x = 동쪽(+), z = 남쪽(+)  (three.js 기본 좌표계에 맞춤)
import fs from 'node:fs';

const CENTER = { lat: 37.36650, lon: 127.10835 }; // 정자역 (Nominatim: node 5881432712 / 7908597461 사이)
const LEVEL_H = 3.2;
const DEFAULT_LEVELS = 3;

// 기본: OSM 공식 API(/map, 실시간) 데이터 우선 — 응답한 Overpass 미러가 몇 달 지난 스냅샷이었음.
// SOURCE=overpass npm run convert 로 Overpass 원본(data/osm_raw.json) 사용 가능
function loadRaw() {
  const order = process.env.SOURCE === 'overpass' ? ['data/osm_raw.json', 'data/osm_raw_osmapi.json'] : ['data/osm_raw_osmapi.json', 'data/osm_raw.json'];
  for (const f of order) {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (d.elements?.length > 100) return { d, f };
    } catch {}
  }
  throw new Error('OSM 원본 데이터가 없습니다. npm run fetch-osm 먼저 실행하세요.');
}
const { d: raw, f: srcFile } = loadRaw();
// 탄천 수면 멀티폴리곤(relation 9035438)은 bbox 밖까지 이어지므로 /relation/full 로 받은 완전한 버전으로 교체
try {
  const full = JSON.parse(fs.readFileSync('data/osm_raw_osmapi.json', 'utf8')).elements.find((e) => e.type === 'relation' && e.id === 9035438);
  if (full) { raw.elements = raw.elements.filter((e) => !(e.type === 'relation' && e.id === 9035438)); raw.elements.push(full); }
} catch {}
const BBOX = { s: 37.3580, w: 127.1015, n: 37.3720, e: 127.1151 };
console.log('source:', srcFile, raw.elements.length, 'elements');

const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320;
const kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [r1((g.lon - CENTER.lon) * kx), r1(-(g.lat - CENTER.lat) * kz)];

const area = (ring) => { let a = 0; for (let i = 0, n = ring.length; i < n; i++) { const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % n]; a += x1 * z2 - x2 * z1; } return a / 2; };
const centroid = (ring) => { let x = 0, z = 0; ring.forEach((p) => { x += p[0]; z += p[1]; }); return [r1(x / ring.length), r1(z / ring.length)]; };
function cleanRing(pts) {
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); }
  if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (a[0] === b[0] && a[1] === b[1]) out.pop(); }
  return out.length >= 3 ? out : null;
}
const key = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
// 멀티폴리곤 멤버 way 들을 이어서 닫힌 링으로 조립
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
// 각 요소 -> [{outer, holes}] 폴리곤 리스트
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
const num = (v) => { if (v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

// bbox(로컬 미터) 사각형으로 폴리곤 클리핑 (Sutherland–Hodgman)
const [bx0, bz1] = proj({ lat: BBOX.s, lon: BBOX.w }), [bx1, bz0] = proj({ lat: BBOX.n, lon: BBOX.e });
function clipRect(ring) {
  const edges = [[(p) => p[0] >= bx0, (a, b) => { const t = (bx0 - a[0]) / (b[0] - a[0]); return [bx0, r1(a[1] + t * (b[1] - a[1]))]; }],
    [(p) => p[0] <= bx1, (a, b) => { const t = (bx1 - a[0]) / (b[0] - a[0]); return [bx1, r1(a[1] + t * (b[1] - a[1]))]; }],
    [(p) => p[1] >= bz0, (a, b) => { const t = (bz0 - a[1]) / (b[1] - a[1]); return [r1(a[0] + t * (b[0] - a[0])), bz0]; }],
    [(p) => p[1] <= bz1, (a, b) => { const t = (bz1 - a[1]) / (b[1] - a[1]); return [r1(a[0] + t * (b[0] - a[0])), bz1]; }]];
  let pts = ring;
  for (const [inside, inter] of edges) {
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur)) { if (!inside(prev)) res.push(inter(prev, cur)); res.push(cur); }
      else if (inside(prev)) res.push(inter(prev, cur));
    }
    pts = res; if (!pts.length) break;
  }
  return cleanRing(pts);
}
const clipPoly = (poly) => { const o = clipRect(poly.outer); if (!o) return null; return { outer: o, holes: poly.holes.map(clipRect).filter(Boolean) }; };

const out = {
  meta: {
    center: CENTER, bbox: BBOX, bboxLocal: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 }, levelHeight: LEVEL_H, defaultLevels: DEFAULT_LEVELS,
    source: srcFile, generated: new Date().toISOString(),
    attribution: '© OpenStreetMap contributors (ODbL)',
  },
  station: { x: 0, z: 0, name: '정자역' },
  buildings: [], roads: [], water: [], waterLines: [], parks: [], labels: [],
};
const stats = { height: 0, levels: 0, default: 0 };

const ROAD_W = { motorway: 16, trunk: 16, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, cycleway: 2.2, path: 2, steps: 2, track: 3, corridor: 2 };
const WALKABLE = new Set(['footway', 'pedestrian', 'path', 'living_street', 'residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'cycleway']);
const LANDMARK = /네이버|NAVER|두산타워|SK-U|금융결제원|폴라리스|행정복지센터|이마트|스타벅스|백현중학교|킨스타워|젤존타워1|푸르지오시티오피스텔/;
const GENERIC_NAME = /^(본관|별관|관리동|[A-D]|[0-9]{2,4}|[0-9]{2,4}동)$/;
const CAR_SHOP = /주유소|충전소|서비스\s*센터|전시장|자동차/;
const APT_NAME = /아파트|오피스텔|아이파크|위브|팰리스|파크|헤리츠|푸르지오|파라곤|쉐르빌|이데나|마을/;
const LABEL_PRI = { landmark: 80, school: 70, public: 60, apt: 55, plaza: 40, mart: 20, shop: 20, academy: 20, cafe: 10 };
const labelCands = [];
const properName = (name) => { const s = (name || '').trim(); return s.length >= 2 && !GENERIC_NAME.test(s); };
const normName = (s) => String(s).replace(/\s+/g, '');
function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// 회사 랜드마크와 같은 이름표. 동 번호(101, 301동)는 단지 이름이 아니라서 뺀다.
function insidePoint(ring) {
  const [cx, cz] = centroid(ring);
  if (cx >= bx0 && cx <= bx1 && cz >= bz0 && cz <= bz1) return [cx, cz];
  const inn = ring.filter(([x, z]) => x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1);
  if (!inn.length) return null;
  let x = 0, z = 0;
  for (const p of inn) { x += p[0]; z += p[1]; }
  return [r1(x / inn.length), r1(z / inn.length)];
}
function classifyPlace(t) {
  const name = t.name || '';
  if (!properName(name) || /급식실|화장실/.test(name)) return null;
  if (LANDMARK.test(name)) return 'landmark';
  if (t.amenity === 'school' || t.building === 'school' || /(초등학교|중학교|고등학교|대학교)$/.test(name)) return 'school';
  if (t.amenity === 'kindergarten' || t.building === 'kindergarten' || /유치원|어린이집/.test(name)) return 'public';
  if (['townhall', 'police', 'post_office', 'library', 'community_centre'].includes(t.amenity) || t.building === 'public' || /행정복지센터|경찰서|우체국|도서관|주민센터|관리사무소/.test(name)) return 'public';
  if (t.landuse === 'residential') return 'apt';
  if ((t.building === 'apartments' || t.building === 'residential') && APT_NAME.test(name)) return 'apt';
  if ((t.building === 'commercial' || t.building === 'retail' || /프라자|상가/.test(name)) && !CAR_SHOP.test(name) && t.amenity !== 'fuel') return 'plaza';
  return null;
}
function pushLabel(o) { if (properName(o.text)) labelCands.push(o); }

for (const e of raw.elements) {
  const t = e.tags || {};
  if (e.type === 'node') {
    if (t.railway === 'station' && t.name === '정자') {
      // 두 역 노드 평균을 역 위치로 사용
      const p = proj(e); out.station._acc = (out.station._acc || []).concat([p]);
    }
    const p = proj(e);
    if (t.amenity === 'cafe' && t.name) pushLabel({ x: p[0], z: p[1], text: t.name, kind: 'cafe' });
    if (t.shop === 'convenience' || t.shop === 'supermarket' || t.shop === 'variety_store') {
      const text = t.name || t.brand;
      if (text) pushLabel({ x: p[0], z: p[1], text, kind: t.shop === 'convenience' ? 'shop' : 'mart' });
    }
    if (t.office === 'educational_institution' && t.name) pushLabel({ x: p[0], z: p[1], text: t.name, kind: 'academy' });
    if (['school', 'kindergarten', 'townhall', 'police', 'post_office', 'library', 'community_centre'].includes(t.amenity) || t.building === 'apartments' || t.building === 'residential' || t.building === 'public') {
      const kind = classifyPlace(t);
      if (kind) pushLabel({ x: p[0], z: p[1], text: t.name, kind, y: kind === 'apt' ? 24 : 12, area: 1 });
    }
    continue;
  }
  if (t.building || t['building:part']) {
    if (t.building === 'roof' && !t.height) continue;
    let h = num(t.height), src = 'height';
    const lv = num(t['building:levels']);
    if (!h || h < 2) { if (lv) { h = lv * LEVEL_H; src = 'levels'; } else { h = (['house', 'garage', 'shed', 'kiosk', 'hut'].includes(t.building) ? 1 : DEFAULT_LEVELS) * LEVEL_H; src = 'default'; } }
    let minH = num(t.min_height) || (num(t['building:min_level']) || 0) * LEVEL_H;
    for (const poly of polygonsOf(e)) {
      if (Math.abs(area(poly.outer)) < 4) continue;
      stats[src]++;
      const b = { o: poly.outer, h: r1(h), k: t.building || 'yes', s: src };
      if (poly.holes.length) b.holes = poly.holes;
      if (minH) b.mh = r1(minH);
      if (t.name) b.n = t.name;
      out.buildings.push(b);
      const kind = classifyPlace(t);
      if (kind) { const c = centroid(poly.outer); pushLabel({ x: c[0], z: c[1], y: r1(h + 4), text: t.name, kind, area: Math.abs(area(poly.outer)) }); }
    }
    continue;
  }
  if (!t.highway && (t.landuse === 'residential' || ['school', 'kindergarten', 'townhall', 'police', 'post_office', 'library', 'community_centre'].includes(t.amenity))) {
    const kind = classifyPlace(t);
    if (kind) {
      for (const poly of polygonsOf(e)) {
        const a = Math.abs(area(poly.outer));
        if (a < 200) continue;
        const c = insidePoint(poly.outer);
        if (!c) continue;
        pushLabel({ x: c[0], z: c[1], text: t.name, kind, ring: poly.outer, area: a });
      }
    }
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
    const road = { p: pts, w: r1(w), k: t.highway };
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
  if (parkKind) { for (const poly of polygonsOf(e).map(clipPoly).filter(Boolean)) out.parks.push({ o: poly.outer, holes: poly.holes, k: parkKind, n: t.name }); }
}
if (out.station._acc) { const a = out.station._acc; out.station.x = r1(a.reduce((s, p) => s + p[0], 0) / a.length); out.station.z = r1(a.reduce((s, p) => s + p[1], 0) / a.length); delete out.station._acc; }
const inMap = (x, z) => x >= bx0 - 40 && x <= bx1 + 40 && z >= bz0 - 40 && z <= bz1 + 40;
const poiKinds = new Set(['cafe', 'shop', 'mart', 'academy']);
const groups = new Map();
const pois = [];
for (const c of labelCands) {
  if (!Number.isFinite(c.x) || !inMap(c.x, c.z)) continue;
  if (poiKinds.has(c.kind)) { pois.push(c); continue; }
  const key = normName(c.text);
  const w = c.area || 1;
  const g = groups.get(key);
  if (!g) groups.set(key, { ...c, w, sx: c.x * w, sz: c.z * w, rings: c.ring ? [c.ring] : [] });
  else {
    g.w += w; g.sx += c.x * w; g.sz += c.z * w;
    if (c.ring) g.rings.push(c.ring);
    if ((LABEL_PRI[c.kind] || 0) > (LABEL_PRI[g.kind] || 0)) g.kind = c.kind;
    if (c.y != null && (g.y == null || c.y > g.y)) g.y = c.y;
    g.x = r1(g.sx / g.w); g.z = r1(g.sz / g.w);
  }
}
for (const g of groups.values()) {
  if (g.rings.length) {
    let max = 0;
    for (const ring of g.rings) for (const b of out.buildings) {
      const c = centroid(b.o);
      if (pointInRing(c[0], c[1], ring)) max = Math.max(max, b.h || 0);
    }
    if (max > 0) g.y = r1(Math.max(g.y || 0, max + 4));
  }
  if (g.y == null) g.y = g.kind === 'apt' ? 22 : 14;
  g.x = r1(g.sx / g.w); g.z = r1(g.sz / g.w);
}
const poiKept = [];
for (const c of pois) {
  if (poiKept.some((p) => p.kind === c.kind && normName(p.text) === normName(c.text) && Math.hypot(p.x - c.x, p.z - c.z) < 35)) continue;
  poiKept.push({ x: r1(c.x), z: r1(c.z), text: c.text, kind: c.kind });
}
// 카페 라벨은 너무 많으면 역 근처 몇 개만. 편의점·학원·마트는 개수가 적어 거리로만 거른다.
const cafes = poiKept.filter((l) => l.kind === 'cafe').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 6);
const places = [...groups.values()].map((g) => ({ x: g.x, z: g.z, y: g.y, text: g.text, kind: g.kind, area: Math.round(g.w) }));
out.labels = [...places, ...cafes, ...poiKept.filter((l) => l.kind !== 'cafe')];
out.labels.push({ x: 0, z: 0, text: '탄천', kind: 'water', auto: 'tancheon' });
// 탄천 라벨: 탄천 waterway 중심선 중 역과 가장 가까운 점
const tc = out.waterLines.filter((w) => w.n === '탄천').flatMap((w) => w.p);
if (tc.length) { const p = tc.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0]; const l = out.labels.find((l) => l.auto); l.x = p[0]; l.z = p[1]; delete l.auto; } else out.labels.pop();
out.meta.stats = { ...stats, buildings: out.buildings.length, roads: out.roads.length, water: out.water.length, waterLines: out.waterLines.length, parks: out.parks.length, labels: out.labels.length };
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/jeongja.json', JSON.stringify(out));
const kindCount = {};
for (const l of out.labels) kindCount[l.kind] = (kindCount[l.kind] || 0) + 1;
console.log(out.meta.stats, 'station', out.station, (fs.statSync('public/jeongja.json').size / 1024).toFixed(0) + 'KB');
console.log('label kinds', kindCount);
