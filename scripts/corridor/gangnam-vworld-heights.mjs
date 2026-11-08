// 강남 9칸 OSM 건물 ← 브이월드 GIS건물통합정보(dt_d010) 높이 표.
//
// 원본 타일 JSON 은 이 저장소에 넣지 않는다 (scripts/building-colours.mjs 와 같음:
//   브이월드 캐시는 --vworld= 폴더로만 넘기고 커밋하지 않음). 커밋하는 것은
//   OSM 건물 id → 높이 한 줄짜리 파생 표뿐.
//
//   node scripts/corridor/gangnam-vworld-heights.mjs --vworld=/path/to/9-jsons
//
// 매칭: 풋프린트 IoU(polygon-clipping). IoU 가 약하면 중심점이 상대 다각형 안이고
// 면적비가 비슷한 경우만. 점수가 비슷한 후보의 높이가 크게 다르면 건너뛴다(추측 안 함).
// 높이: hg 가 유효하면 hg, 아니면 ground_floor_co (m 환산은 build-pangyo 의 층고).
// OSM height(≥2m) 가 이미 있으면 표에 넣지 않는다 — 빌드가 OSM 을 유지한다.
import fs from 'node:fs';
import path from 'node:path';
import pc from 'polygon-clipping';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const VW = arg('vworld');
const OUT = path.resolve(ROOT, arg('out', 'data/gangnam_vworld_heights.json'));
const RAW = path.resolve(ROOT, arg('raw', 'data/osm_gangnam_raw.json'));
if (!VW) { console.error('usage: node scripts/corridor/gangnam-vworld-heights.mjs --vworld=<dt_d010 타일 폴더>'); process.exit(1); }

const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [r1((g.lon - CENTER.lon) * kx), r1(-(g.lat - CENTER.lat) * kz)];
const projLL = (lon, lat) => [r1((lon - CENTER.lon) * kx), r1(-(lat - CENTER.lat) * kz)];
const GANGNAM_BOX = { x0: -7500, x1: -6000, z0: -15500, z1: -14000 };
const inBox = (x, z, m = 0) => x >= GANGNAM_BOX.x0 - m && x <= GANGNAM_BOX.x1 + m && z >= GANGNAM_BOX.z0 - m && z <= GANGNAM_BOX.z1 + m;

const area = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % n]; a += x1 * z2 - x2 * z1; } return a / 2; };
const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
function pointInRing(x, z, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }
const inPoly = (x, z, o, holes = []) => pointInRing(x, z, o) && !holes.some((h) => pointInRing(x, z, h));
function cleanRing(pts) {
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); }
  if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (a[0] === b[0] && a[1] === b[1]) out.pop(); }
  return out.length >= 3 ? out : null;
}
const key7 = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
function joinRings(segs) {
  segs = segs.filter((s) => s && s.length > 1).map((s) => s.slice());
  const rings = [];
  while (segs.length) {
    let cur = segs.shift(), progress = true;
    while (key7(cur[0]) !== key7(cur[cur.length - 1]) && progress) {
      progress = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = key7(cur[cur.length - 1]);
        if (key7(s[0]) === end) cur = cur.concat(s.slice(1));
        else if (key7(s[s.length - 1]) === end) cur = cur.concat(s.slice().reverse().slice(1));
        else if (key7(s[s.length - 1]) === key7(cur[0])) cur = s.concat(cur.slice(1));
        else if (key7(s[0]) === key7(cur[0])) cur = s.slice().reverse().concat(cur.slice(1));
        else continue;
        segs.splice(i, 1); progress = true; break;
      }
    }
    if (key7(cur[0]) === key7(cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}
function polygonsOf(e) {
  if (e.type === 'way') {
    const g = e.geometry; if (!g || g.length < 4 || key7(g[0]) !== key7(g[g.length - 1])) return [];
    const r = cleanRing(g.map(proj)); return r ? [{ outer: r, holes: [] }] : [];
  }
  if (e.type === 'relation') {
    const ways = (role) => e.members.filter((m) => m.type === 'way' && (role === 'inner' ? m.role === 'inner' : m.role !== 'inner') && m.geometry?.length);
    const outers = joinRings(ways('outer').map((m) => m.geometry)).map((r) => cleanRing(r.map(proj))).filter(Boolean);
    const inners = joinRings(ways('inner').map((m) => m.geometry)).map((r) => cleanRing(r.map(proj))).filter(Boolean);
    return outers.map((o) => ({ outer: o, holes: inners.filter((h) => pointInRing(...centroid(h), o)) }));
  }
  return [];
}
const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const bboxOf = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return [a, b, c, d]; };

// hg: 0 이하는 측정값 없음. 2m 미만·300m 초과는 이 박스에서 비현실(실측 최대 202.65m)이라 버린다.
const HG_MIN = 2, HG_MAX = 300, FL_MAX = 60;
function classify(p) {
  const hg = num(p.hg), fl = num(p.ground_floor_co);
  const absurd = [];
  if (hg != null && hg > 0 && (hg < HG_MIN || hg > HG_MAX)) absurd.push({ field: 'hg', value: hg });
  if (fl != null && fl > FL_MAX) absurd.push({ field: 'ground_floor_co', value: fl });
  const hgOk = hg != null && hg >= HG_MIN && hg <= HG_MAX;
  const flOk = fl != null && fl >= 1 && fl <= FL_MAX;
  return { hg: hgOk ? r1(hg) : null, fl: flOk ? fl : null, absurd, hgRaw: hg, flRaw: fl };
}

const close = (r) => { const o = r.map((p) => [p[0], p[1]]); const a = o[0], b = o[o.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) o.push(a); return o; };
const asMp = (o, holes) => [[close(o), ...holes.map(close)]];
function mpArea(mp) {
  let s = 0;
  for (const poly of mp || []) {
    if (!poly?.length) continue;
    let v = Math.abs(area(poly[0]));
    for (let i = 1; i < poly.length; i++) v -= Math.abs(area(poly[i]));
    if (v > 0) s += v;
  }
  return s;
}
function overlap(osm, vw) {
  let inter = 0, clipOk = false;
  try {
    inter = mpArea(pc.intersection(asMp(osm.o, osm.holes), asMp(vw.o, vw.holes)));
    clipOk = true;
  } catch { /* 자기교차 링 — 아래 표본 */ }
  if (!clipOk) {
    const [x0, z0, x1, z1] = osm.bb;
    const step = Math.max(1.2, Math.sqrt(Math.max(osm.a, 1)) / 16);
    let hit = 0, tot = 0;
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      if (!inPoly(x, z, osm.o, osm.holes)) continue;
      tot++; if (inPoly(x, z, vw.o, vw.holes)) hit++;
    }
    inter = tot ? osm.a * (hit / tot) : 0;
  }
  const uni = osm.a + vw.a - inter;
  const iou = uni > 0.5 ? inter / uni : 0;
  return {
    iou, inter,
    covOsm: osm.a > 0 ? inter / osm.a : 0,
    covVw: vw.a > 0 ? inter / vw.a : 0,
    ratio: osm.a > 0 ? vw.a / osm.a : 99,
  };
}

// ---------- 브이월드 ----------
const vwSeen = new Map();
const ignoredAbsurd = [];
let rawN = 0, hgNonPositive = 0, floorsOnly = 0, neither = 0;
for (const f of fs.readdirSync(VW).filter((s) => s.endsWith('.json')).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(VW, f), 'utf8'));
  for (const ft of doc.features || []) {
    rawN++;
    if (vwSeen.has(ft.id) || !ft.g) continue;
    const polys = ft.g.type === 'MultiPolygon' ? ft.g.coordinates : ft.g.type === 'Polygon' ? [ft.g.coordinates] : [];
    const parts = [];
    for (const pl of polys) {
      if (!pl?.[0] || pl[0].length < 4) continue;
      const outer = cleanRing(pl[0].map(([lon, lat]) => projLL(lon, lat)));
      if (!outer) continue;
      const holes = pl.slice(1).map((ring) => cleanRing(ring.map(([lon, lat]) => projLL(lon, lat)))).filter(Boolean);
      parts.push({ o: outer, holes });
    }
    if (!parts.length) continue;
    const cls = classify(ft.p || {});
    for (const a of cls.absurd) {
      ignoredAbsurd.push({ id: ft.id, name: ft.p?.buld_nm || '', ...a });
      console.warn(`무시 ${a.field}=${a.value} id=${ft.id} ${ft.p?.buld_nm || ''}`);
    }
    if (!(cls.hgRaw > 0)) hgNonPositive++;
    if (!cls.hg && cls.fl) floorsOnly++;
    if (!cls.hg && !cls.fl) neither++;
    const o = parts[0].o;
    const bb = bboxOf(o);
    const c = centroid(o);
    if (!inBox(c[0], c[1], 40) && (bb[2] < GANGNAM_BOX.x0 - 20 || bb[0] > GANGNAM_BOX.x1 + 20 || bb[3] < GANGNAM_BOX.z0 - 20 || bb[1] > GANGNAM_BOX.z1 + 20)) continue;
    vwSeen.set(ft.id, { id: String(ft.id), o, holes: parts[0].holes, a: Math.abs(area(o)), bb, c, name: ft.p?.buld_nm || '', ...cls });
  }
}
const vwList = [...vwSeen.values()];
class Grid {
  constructor(c = 40) { this.c = c; this.m = new Map(); }
  add(i, bb) { const c = this.c; for (let x = Math.floor(bb[0] / c); x <= Math.floor(bb[2] / c); x++) for (let z = Math.floor(bb[1] / c); z <= Math.floor(bb[3] / c); z++) { const k = x + ',' + z; let L = this.m.get(k); if (!L) this.m.set(k, (L = [])); L.push(i); } }
  near(bb) { const s = new Set(); const c = this.c; for (let x = Math.floor(bb[0] / c); x <= Math.floor(bb[2] / c); x++) for (let z = Math.floor(bb[1] / c); z <= Math.floor(bb[3] / c); z++) for (const i of this.m.get(x + ',' + z) || []) s.add(i); return s; }
}
const grid = new Grid(50);
vwList.forEach((v, i) => grid.add(i, v.bb));

function acceptable(m) {
  if (m.iou >= 0.22) return true;
  if (m.covOsm >= 0.55 && m.ratio >= 0.25 && m.ratio <= 4) return true;
  if (m.mutual && m.ratio >= 0.4 && m.ratio <= 2.8 && m.iou >= 0.06) return true;
  if ((m.osmCin || m.vwCin) && m.ratio >= 0.5 && m.ratio <= 2 && m.covOsm >= 0.35) return true;
  return false;
}
const scoreOf = (m) => m.iou * 2 + m.covOsm * 0.45 + (m.mutual ? 0.12 : 0);

// ---------- OSM 건물 (build-pangyo.mjs --region=gangnam 과 같은 필터) ----------
const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const osm = [];
const polyCount = new Map();
for (const e of raw.elements) {
  const t = e.tags || {};
  if (!(t.building || t['building:part']) || e.type === 'node') continue;
  if (t.building === 'no' && !t['building:part']) continue;
  if (/construction|proposed|demolished/.test(t.building || '') && !t.height && !t['building:levels']) continue;
  if ((num(t.layer) != null && num(t.layer) < 0) || t.location === 'underground') continue;
  const id = `${e.type[0]}${e.id}`;
  const h = num(t.height);
  const osmHeight = !!(h && h >= 2);
  for (const poly of polygonsOf(e)) {
    const a = Math.abs(area(poly.outer)); if (a < 6) continue;
    const c = centroid(poly.outer); if (!inBox(c[0], c[1])) continue;
    const bb = bboxOf(poly.outer);
    polyCount.set(id, (polyCount.get(id) || 0) + 1);
    osm.push({ id, o: poly.outer, holes: poly.holes, a, c, bb, name: t.name || '', osmHeight, levels: num(t['building:levels']) });
  }
}

const stat = { osmPolys: osm.length, matched: 0, applied: 0, osmWins: 0, ambiguous: 0, noUsable: 0, unmatched: 0, byHg: 0, byFloors: 0, method: { iou: 0, cover: 0, centroid: 0 } };
const grouped = new Map();
const ambiguousLog = [];
for (const b of osm) {
  const cand = [];
  for (const i of grid.near(b.bb)) {
    const v = vwList[i];
    if (v.bb[2] < b.bb[0] || v.bb[0] > b.bb[2] || v.bb[3] < b.bb[1] || v.bb[1] > b.bb[3]) continue;
    const m = overlap(b, v);
    m.osmCin = inPoly(b.c[0], b.c[1], v.o, v.holes);
    m.vwCin = inPoly(v.c[0], v.c[1], b.o, b.holes);
    m.mutual = m.osmCin && m.vwCin;
    m.v = v;
    m.score = scoreOf(m);
    if (m.inter < 1 && !m.osmCin && !m.vwCin) continue;
    cand.push(m);
  }
  cand.sort((a, c) => c.score - a.score);
  const ok = cand.filter(acceptable);
  if (!ok.length) { stat.unmatched++; continue; }
  const best = ok[0], second = ok[1];
  const hv = (v) => v.hg ?? (v.fl != null ? v.fl * 3.2 : null);
  if (second && second.score > best.score * 0.85) {
    const h1 = hv(best.v), h2 = hv(second.v);
    if (h1 && h2 && Math.abs(h1 - h2) / Math.max(h1, h2) > 0.4) {
      stat.ambiguous++;
      if (ambiguousLog.length < 12) ambiguousLog.push({ id: b.id, name: b.name, a: best.v.name, ha: h1, b: second.v.name, hb: h2, sa: +best.score.toFixed(3), sb: +second.score.toFixed(3) });
      continue;
    }
  }
  stat.matched++;
  if (!best.v.hg && !best.v.fl) { stat.noUsable++; continue; }
  const method = best.iou >= 0.22 ? 'iou' : best.covOsm >= 0.55 ? 'cover' : 'centroid';
  stat.method[method]++;
  if (b.osmHeight) { stat.osmWins++; continue; }
  const src = best.v.hg ? 'hg' : 'fl';
  const val = best.v.hg ? best.v.hg : best.v.fl;
  if (src === 'hg') stat.byHg++; else stat.byFloors++;
  stat.applied++;
  const row = { id: b.id, cx: r1(b.c[0]), cz: r1(b.c[1]), src, val, vw: best.v.id, name: b.name, vwName: best.v.name, method };
  const g = grouped.get(b.id) || []; g.push(row); grouped.set(b.id, g);
}

const rows = [];
let split = 0;
for (const [id, list] of grouped) {
  const same = list.length === polyCount.get(id) && list.every((r) => r.vw === list[0].vw && r.src === list[0].src && r.val === list[0].val);
  if (same) rows.push([id, list[0].src, list[0].val, list[0].vw]);
  else { split++; for (const r of list) rows.push([`${id}@${r.cx},${r.cz}`, r.src, r.val, r.vw]); }
}
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const doc = {
  meta: {
    v: 1,
    region: 'gangnam',
    source: 'vworld NED WFS getBldgisSpceWFS typename dt_d010 (GIS건물통합정보), EPSG:4326',
    attribution: '건물 높이: 국토교통부 브이월드 GIS건물통합정보 (공공누리 제1유형: 출처표시), https://www.data.go.kr/data/15083092/fileData.do',
    raw: '커밋하지 않음. 타일 캐시(-15..-13 × -31..-29)는 --vworld= 로만 넘긴다. 이 파일은 OSM id → 높이 파생 표.',
    levelH: 3.2,
    floorFormula: 'ground_floor_co × 3.2 (+1.5 if >3F, else +0.6) — scripts/corridor/build-pangyo.mjs LEVEL_H 와 같은 식',
    priority: 'OSM height ≥ 2m > vw hg > vw ground_floor_co × LEVEL_H > OSM building:levels × LEVEL_H > defaultLevels',
    match: 'IoU ≥ 0.22, 또는 OSM 면적의 55% 이상을 덮고 면적비 0.25–4, 또는 중심점 상호 포함 + 면적비 0.4–2.8. 상위 두 후보 점수 차가 작고 높이가 40% 넘게 다르면 버림.',
    hgFilter: `hg < ${HG_MIN} 또는 hg > ${HG_MAX} 무시. hg ≤ 0 은 값 없음(층수로 넘어감). 지상층수 > ${FL_MAX} 무시.`,
    columns: ['osmId', 'src hg|fl', 'hg(m) 또는 ground_floor_co', 'vworld gis id'],
    counts: {
      vworldFeatures: rawN,
      vworldUnique: vwSeen.size,
      hgNonPositive,
      floorsOnly,
      neitherUsable: neither,
      hgAbsurd: ignoredAbsurd.length,
      osmPolys: stat.osmPolys,
      ...stat,
      splitIds: split,
      rows: rows.length,
    },
    ignoredAbsurd,
  },
  rows,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc));
console.log(JSON.stringify({ out: path.relative(ROOT, OUT), bytes: fs.statSync(OUT).size, counts: doc.meta.counts, absurd: ignoredAbsurd, ambiguous: ambiguousLog }, null, 1));

const named = [...grouped.values()].flat().filter((r) => r.name || r.vwName).sort((a, b) => (b.src === 'hg' ? b.val : b.val * 3.2) - (a.src === 'hg' ? a.val : a.val * 3.2));
console.log('tall supplements', named.slice(0, 18).map((r) => `${r.id} ${r.name || '-'} ← ${r.vwName || '-'} ${r.src} ${r.val} (${r.method})`).join('\n'));
