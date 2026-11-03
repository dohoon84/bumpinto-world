// [pangyo] 판교역 일대 (확장 1단계) 데이터 생성 — OSM(Overpass) 원본 → public/corridor/pangyo/*
//
//   입력: data/osm_pangyo_raw.json (data/query_pangyo.overpassql, --fetch 로 다시 받음), public/corridor/{index,base,streams}.json + tiles/*
//   출력: public/corridor/pangyo/index.json   박스·타일 목록·역(판교)·랜드마크(백화점·알파돔시티 타워·광장 데크·출입구)·통계
//         public/corridor/pangyo/tiles/X_Z.json mode=new : 새 타일(코리더에 없던 칸) 전체
//                                              mode=add : 기존 코리더 타일에 덧붙일 것만 (런타임이 원본 뒤에 이어 붙임 → 원본 항목/순서 그대로)
//         public/corridor/pangyo/lod/X_Z.json   같은 규칙의 원경 데이터
//   규칙: 높이·도로 폭·공원 종류는 프로토타입 bake.mjs 와 같게(OSM height → building:levels×3.2 → 용도/면적 기본 층수).
//         기존 코리더 타일 내용이 우선: 이미 있는 건물(중심점 포함 판정)·도로(같은 선분 1m 이내)는 다시 넣지 않는다.
//         기존 타일 칸에는 그 타일 바닥(floor) 안에만 덧붙인다(탄천 등 라이브 띠를 침범하지 않게).
//   사용: node scripts/corridor/build-pangyo.mjs [--fetch] [--raw=data/osm_pangyo_raw.json] [--out=public/corridor/pangyo]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pc from 'polygon-clipping';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CORR = path.resolve(ROOT, arg('corridor', 'public/corridor'));
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/pangyo'));
const RAW = path.resolve(ROOT, arg('raw', 'data/osm_pangyo_raw.json'));
// [ncsoft] 엔씨소프트 R&D센터 덧박스용 원본(작은 bbox, data/query_pangyo_ncsoft.overpassql). 1단계 원본에 없는 요소만 덧붙인다(같은 id 는 1단계 판 유지)
const RAW_NC = path.resolve(ROOT, arg('rawNc', 'data/osm_pangyo_ncsoft_raw.json'));
if (process.argv.includes('--fetch')) {
  execFileSync('bash', [path.join(ROOT, 'data/fetch.sh'), 'query_pangyo.overpassql', path.basename(RAW)], { stdio: 'inherit' });
  execFileSync('bash', [path.join(ROOT, 'data/fetch.sh'), 'query_pangyo_ncsoft.overpassql', path.basename(RAW_NC)], { stdio: 'inherit' });
}
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const raw = readJSON(RAW);
const rawNc = fs.existsSync(RAW_NC) ? readJSON(RAW_NC) : null;
if (rawNc) { const have = new Set(raw.elements.map((e) => e.type + e.id)); for (const e of rawNc.elements) if (!have.has(e.type + e.id)) raw.elements.push(e); }
const cIndex = readJSON(path.join(CORR, 'index.json'));
const cBase = readJSON(path.join(CORR, 'base.json'));
const cStreams = fs.existsSync(path.join(CORR, 'streams.json')) ? readJSON(path.join(CORR, 'streams.json')) : null;
const TS = cIndex.meta.tileSize;

// ---------- 투영 (정자역 원점, scripts/lib/geo.mjs 와 같음) ----------
const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [r1((g.lon - CENTER.lon) * kx), r1(-(g.lat - CENTER.lat) * kz)];

// ---------- 판교 박스 (게임 좌표, m) : 판교역·알파돔시티·백화점 ± 500m 남짓. 2단계(정자→판교 연결 도로)는 별도 ----------
export const BOX = { x0: -250, x1: 1000, z0: -3500, z1: -2500 };
// [ncsoft] 엔씨소프트 R&D센터(대왕판교로644번길 12, OSM w694434545 외 부분 4개: x -45..88, z -3668..-3600)는 BOX 남쪽 밖 →
//   건물 둘레만 덮는 작은 덧박스(BOX 아래 변에 붙음 → 바닥 이어짐). 같은 ?pangyo=0 로 꺼짐. 1단계 박스 내용은 그대로
// [ncsoft-roads] 덧박스를 HQ 둘레 도로 고리까지 넓힘: 서 대왕판교로(x≈-120..-175) · 북 대왕판교로644번길(z≈-3685) · 동 판교역로(x≈117) 가
//   BOX(z -3500) 쪽 도로망과 끊기지 않게. 원본 data/osm_pangyo_ncsoft_raw.json 의 bbox(x≈-208..234, z≈-3537..-3813) 안.
//   덧박스 바깥 변에서 잘리는 도로는 가까운 OSM 교차 노드(≤ 80m 뒤)까지 되돌려 끝냄 → 허공에 잘린 끝 없음(아래 trimToJunction)
export const NC_BOX = { x0: -180, x1: 125, z0: -3700, z1: -3500 };
const BOXES = [BOX, NC_BOX];
const inB = (B, x, z, m = 0) => x >= B.x0 - m && x <= B.x1 + m && z >= B.z0 - m && z <= B.z1 + m;
const inBox = (x, z, m = 0) => BOXES.some((B) => inB(B, x, z, m));
const tileOf = (x, z) => `${Math.floor(x / TS)}_${Math.floor(z / TS)}`;
const CELLS = [];
for (const B of BOXES) for (let tx = Math.floor(B.x0 / TS); tx < Math.ceil(B.x1 / TS); tx++) for (let tz = Math.floor(B.z0 / TS); tz < Math.ceil(B.z1 / TS); tz++) if (!CELLS.includes(`${tx}_${tz}`)) CELLS.push(`${tx}_${tz}`);
const LEVEL_H = 3.2;

// ---------- 기하 유틸 ----------
const area = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % n]; a += x1 * z2 - x2 * z1; } return a / 2; };
const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
function pointInRing(x, z, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }
const inPoly = (x, z, o, holes = []) => pointInRing(x, z, o) && !holes.some((h) => pointInRing(x, z, h));
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); }
function cleanRing(pts) {
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); }
  if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (a[0] === b[0] && a[1] === b[1]) out.pop(); }
  return out.length >= 3 ? out : null;
}
function dp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; for (let i = a + 1; i < b; i++) { const d = segDist(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]); if (d > md) { md = d; mi = i; } } if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const dpRing = (r, eps) => { if (r.length < 5) return r; const o = dp([...r, r[0]], eps); o.pop(); return o.length >= 3 ? o : r; };
const closeRing = (r) => { const o = r.map((p) => [p[0], p[1]]); const a = o[0], b = o[o.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) o.push([a[0], a[1]]); return o; };
const openRing = (r) => cleanRing(r.map(([x, z]) => [r1(x), r1(z)])) || [];
const rectGeom = (x0, z0, x1, z1) => [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]];
const toPolys = (mp) => mp.map((poly) => ({ o: openRing(poly[0]), holes: poly.slice(1).map(openRing).filter((h) => h.length >= 3) })).filter((p) => p.o.length >= 3 && Math.abs(area(p.o)) > 0.5);
const flat = (pts) => pts.flatMap(([x, z]) => [x, z]);
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
const num = (v) => { if (v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
class Grid {
  constructor(c = 40) { this.c = c; this.m = new Map(); }
  add(it, x0, z0, x1, z1) { const c = this.c; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const k = i * 100000 + j; let L = this.m.get(k); if (!L) this.m.set(k, (L = [])); L.push(it); } }
  q(x, z) { return this.m.get(Math.floor(x / this.c) * 100000 + Math.floor(z / this.c)) || []; }
}
const bboxOf = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return [a, b, c, d]; };

// ---------- 기존 코리더 (우선) ----------
const streamTiles = new Set([...Object.keys(cStreams?.tiles || {}), ...Object.keys(cStreams?.lod || {})]);
const existing = {}; // 박스 칸 ± 1칸의 기존 타일
for (const k of Object.keys(cIndex.tiles)) {
  const t = cIndex.tiles[k];
  if (BOXES.every((B) => t.x0 + TS < B.x0 - TS || t.x0 > B.x1 + TS || t.z0 + TS < B.z0 - TS || t.z0 > B.z1 + TS)) continue;
  existing[k] = readJSON(path.join(CORR, 'tiles', k + '.json'));
}
for (const k of CELLS) if (cIndex.tiles[k] && streamTiles.has(k)) throw new Error(`타일 ${k} 에 streams.json 하도 컷이 있음 — 덧붙이기 순서가 바뀔 수 있어 박스를 조정해야 함`);
const cellMode = Object.fromEntries(CELLS.map((k) => [k, cIndex.tiles[k] ? 'add' : 'new']));
// 덧붙일 수 있는 곳: 박스 안 + (기존 칸이면 그 타일 바닥 폴리곤 안)
function allowed(x, z) {
  const k = tileOf(x, z);
  if (!existing[k]) return true; // 박스 밖 빈 칸(경계를 살짝 넘는 건물 꼭짓점) 또는 새 칸
  if (cellMode[k] !== 'add') return false; // 박스 밖 기존 타일은 건드리지 않음
  return (existing[k].floor || []).some((f) => inPoly(x, z, f.o, f.holes));
}
const exB = new Grid(40), exR = new Grid(20), exP = [];
for (const t of Object.values(existing)) {
  for (const b of t.b) { const c = centroid(b.o); const it = { o: b.o, c }; const bb = bboxOf(b.o); exB.add(it, ...bb); }
  for (const r of t.r) for (let i = 1; i < r.p.length; i++) { const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i]; exR.add({ ax, az, bx, bz, w: r.w }, Math.min(ax, bx) - 2, Math.min(az, bz) - 2, Math.max(ax, bx) + 2, Math.max(az, bz) + 2); }
  for (const p of t.parks || []) exP.push(p);
}

// ---------- 랜드마크 지정 (OSM id) ----------
//   백화점: 판교역 남쪽 대형 상업시설(relation 외곽 + building:part 4개). 로고·전용 서체·브랜드 색 없이 일반 매스 + '현대백화점' 글자 표지로 그린다.
//   알파돔시티 타워 4동: 판교역 광장 데크를 둘러싼 업무 타워. 데크: building=yes layer=1 (높이 태그 없음 → 2층 높이 보행 데크로 표현)
const LM_DEPT = new Set(['r6490334', 'w437195296', 'w437195297', 'w437195298', 'w437195299']);
const LM_TOWERS = new Set(['w1087134311', 'w1087134310', 'w659687063', 'w659687065']);
const LM_DECK = 'w1468711684';
// [ncsoft] 엔씨소프트 R&D센터: OSM 에 이름 붙은 w694434545(32–58m) + 같은 단지 building 겹층 4개(포디움 0–8 · 서동 8–40 · 동동 8–32 · 서쪽 40–48)
const LM_NC = new Set(['w694434544', 'w478539437', 'w478539439', 'w694434545', 'w694434546']);
// 데크 높이 (2026-11-03 도훈님 결정, deck-v2): 상판 10–12m = '3~4층 높이'. 실측(측량) 값은 없음 — 근거는 층수 서술뿐:
//   - 연합뉴스 2021-11-17 (https://www.yna.co.kr/view/AKR20211117112000061), 한겨레 (https://www.hani.co.kr/arti/economy/property/1021511.html),
//     경인일보 (https://www.kyeongin.com/article/1539230), KIRA 월간 2024-09 (https://kiramonthly.com/2073), 희림 (https://heerim.com/kr/project/project_view.php?idx=649):
//     컬처밸리 = '지상 3층 실내 통로 + 4층 옥외 통로'. 층수 → m 는 게임 표현값(하단 10m · 상판 12m, 슬래브 2m).
//   - VWorld GIS건물통합정보(dt_d010, 2026-10-05): 데크/광장 필지 hg=0·층수 0. OSM w1468711684: building=yes layer=1, 높이 태그 없음.
//   - 엘리베이터: OSM highway=elevator 노드 3개(data/osm_pangyo_deck_elevators.json) — 데크와 지상을 잇는 곳. OSM 에 데크 계단(highway=steps)은 없음.
const DECK = { mh: 10, h: 12 }; // 데크 아래(1층 광장) 걸어 다닐 수 있게 하단 10m (충돌 제외 기준 mh ≥ 2.5)
const ELEV = path.resolve(ROOT, 'data/osm_pangyo_deck_elevators.json');

// ---------- 1) 건물 (bake.mjs 규칙) ----------
function defaultLevels(t, a) {
  const b = t.building || t['building:part'] || 'yes';
  if (/apartments/.test(b)) return [15, 'default:apartments'];
  if (/^(house|detached|semidetached_house|terrace|bungalow)$/.test(b)) return [2, 'default:house'];
  if (/garage|garages|shed|kiosk|hut|toilets|roof|carport|service|container/.test(b)) return [1, 'default:small'];
  if (/industrial|warehouse|factory/.test(b)) return [2, 'default:industrial'];
  if (/school|university|college/.test(b)) return [4, 'default:school'];
  if (/hospital/.test(b)) return [7, 'default:hospital'];
  if (/office/.test(b)) return [8, 'default:office'];
  if (/commercial|retail/.test(b)) return [a > 3000 ? 6 : 4, 'default:commercial'];
  if (/residential/.test(b)) return [4, 'default:residential'];
  return [a < 120 ? 2 : a < 500 ? 3 : a < 2000 ? 4 : 5, 'default:area'];
}
const stat = { osmBuildings: 0, height: 0, levels: 0, default: 0, outlines: 0, dupExisting: 0, outsideAllowed: 0, landmark: 0 };
const buildings = [];
for (const e of raw.elements) {
  const t = e.tags || {};
  if (!(t.building || t['building:part']) || e.type === 'node') continue;
  if (t.building === 'no' && !t['building:part']) continue;
  if (/construction|proposed|demolished/.test(t.building || '') && !t.height && !t['building:levels']) continue;
  const id = `${e.type[0]}${e.id}`;
  for (const poly of polygonsOf(e)) {
    const a = Math.abs(area(poly.outer)); if (a < 6) continue;
    const c = centroid(poly.outer); if (!inBox(c[0], c[1])) continue;
    let h = num(t.height), src = 'osm:height';
    const lv = num(t['building:levels']);
    if (!h || h < 2) { if (lv) { h = lv * LEVEL_H + (lv > 3 ? 1.5 : 0.6); src = 'osm:levels'; } else { const [L, s] = defaultLevels(t, a); h = L * LEVEL_H + 0.6; src = s; } }
    let mh = num(t.min_height) ?? (num(t['building:min_level']) ? num(t['building:min_level']) * LEVEL_H : 0);
    if (t.building === 'roof' || t['building:part'] === 'roof') { if (!t.min_height && !t['building:min_level']) { mh = Math.max(0, h - 0.6); if (h < 3) h = 4.5, mh = 3.9; } }
    if (id === LM_DECK) { h = DECK.h; mh = DECK.mh; src = 'landmark:deck'; }
    if (mh >= h) mh = Math.max(0, h - 1);
    const part = !!t['building:part'] && t['building:part'] !== 'no' && (!t.building || LM_DEPT.has(id) && e.type === 'way');
    buildings.push({ id, o: poly.outer, holes: poly.holes, h: r1(h), mh: r1(mh), k: t.building && t.building !== 'yes' || !t['building:part'] ? (t.building || 'yes') : 'part:' + t['building:part'], s: src, a, c, n: t.name, part });
  }
}
// building:part 가 있는 외곽선은 렌더 생략(Simple 3D Buildings), 충돌만 유지 — bake.mjs 와 같음
{
  const parts = buildings.filter((b) => b.part);
  for (const b of buildings) if (!b.part && parts.some((p) => p !== b && pointInRing(p.c[0], p.c[1], b.o))) { b.outline = 1; stat.outlines++; }
}
const lmOf = (b) => (LM_DEPT.has(b.id) ? 'pangyo-dept' : LM_TOWERS.has(b.id) ? 'alphadom-towers' : b.id === LM_DECK ? 'pangyo-deck' : LM_NC.has(b.id) ? 'ncsoft-rnd' : null);
const addB = {};
const defaultList = [];
for (const b of buildings) {
  const bb = bboxOf(b.o);
  const dup = exB.q(b.c[0], b.c[1]).some((x) => pointInRing(b.c[0], b.c[1], x.o)) || [[bb[0], bb[1]], [bb[2], bb[3]], b.c].some(([x, z]) => exB.q(x, z).some((e) => e.c[0] > bb[0] && e.c[0] < bb[2] && e.c[1] > bb[1] && e.c[1] < bb[3] && pointInRing(e.c[0], e.c[1], b.o)));
  if (dup) { stat.dupExisting++; continue; }
  if (!allowed(b.c[0], b.c[1]) || !b.o.every(([x, z]) => allowed(x, z))) { stat.outsideAllowed++; continue; }
  const lm = lmOf(b);
  const rec = { o: b.o.map(([x, z]) => [x, z]), h: b.h, k: b.k };
  if (b.mh > 0) rec.mh = b.mh;
  if (b.s.startsWith('default')) rec.s = 'default';
  if (b.holes?.length) rec.holes = b.holes;
  if (b.outline || lm) rec.nr = 1; // 랜드마크는 전용 모델이 그림(충돌은 유지, 데크는 mh 10 이라 충돌 제외)
  if (lm) { rec.lm = lm; stat.landmark++; }
  rec.id = b.id;
  (addB[tileOf(b.c[0], b.c[1])] ||= []).push(rec);
  stat.osmBuildings++;
  if (b.s.startsWith('osm:height')) stat.height++; else if (b.s.startsWith('osm:levels')) stat.levels++; else if (b.s.startsWith('default')) { stat.default++; if (!b.outline) defaultList.push({ id: b.id, k: b.k, h: b.h, rule: b.s, a: Math.round(b.a), x: r1(b.c[0]), z: r1(b.c[1]), ...(b.n ? { n: b.n } : {}) }); }
}

// ---------- 2) 도로 (bake.mjs 규칙) ----------
const ROAD_W = { motorway: 18, trunk: 18, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, cycleway: 2.2, path: 2, steps: 2, track: 3, corridor: 2 };
const WALKABLE = new Set(['footway', 'pedestrian', 'path', 'living_street', 'residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'cycleway']);
const TUNNEL_OK = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const chains = [], plazas = [];
for (const e of raw.elements) {
  const t = e.tags || {};
  if (!t.highway || e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
  const pts = e.geometry.map(proj);
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const underpass = t.tunnel === 'yes' && TUNNEL_OK.has(t.highway) && L <= 400;
  if (t.tunnel && t.tunnel !== 'no' && !underpass) continue;
  if (!underpass && (num(t.layer) < 0 || t.level && num(t.level) < 0)) continue;
  if (['construction', 'proposed', 'platform', 'bus_stop', 'elevator', 'raceway', 'abandoned'].includes(t.highway)) continue;
  if (t.indoor === 'yes' || t.highway === 'corridor') continue;
  let w = ROAD_W[t.highway] ?? 4; const lanes = num(t.lanes); if (lanes && w >= 6) w = Math.max(w, lanes * 3.2);
  if (t.oneway === 'yes' && lanes) w = Math.max(ROAD_W[t.highway] ? Math.min(w, ROAD_W[t.highway]) : w, lanes * 3.3);
  if (t.area === 'yes') { const r = cleanRing(pts); if (r) plazas.push({ o: r, holes: [], k: 'plaza' }); continue; }
  chains.push({ p: pts, w: r1(w), k: t.highway, n: t.name, walk: WALKABLE.has(t.highway) ? 1 : 0, br: t.bridge && t.bridge !== 'no' ? 1 : 0, id: e.id });
}
const DUP = 1.0;
function nearEx(x, z, w) { for (const it of exR.q(x, z)) if (it.w >= w - 2 && segDist(x, z, it.ax, it.az, it.bx, it.bz) <= DUP) return true; return false; }
const dupSeg = (a, b, w) => nearEx(a[0], a[1], w) && nearEx(b[0], b[1], w) && nearEx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w);
function clipOne(B, a, b) { // Liang–Barsky → 박스 B 안 [t0,t1] 또는 null
  const dx = b[0] - a[0], dz = b[1] - a[1]; let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz], q = [a[0] - B.x0, B.x1 - a[0], a[1] - B.z0, B.z1 - a[1]];
  for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return null; continue; } const t = q[i] / p[i]; if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
  return t0 < t1 ? [t0, t1] : null;
}
// 박스 합집합 안 구간: 박스별 구간을 이어 붙이고(맞닿으면 하나로) 가장 긴 구간 — 덧박스가 BOX 변에 붙어 있어 보통 한 구간
function clipBox(a, b) {
  const iv = BOXES.map((B) => clipOne(B, a, b)).filter(Boolean).sort((u, v) => u[0] - v[0]);
  if (!iv.length) return null;
  const m = [iv[0].slice()];
  for (const [t0, t1] of iv.slice(1)) { const l = m[m.length - 1]; if (t0 <= l[1] + 1e-9) l[1] = Math.max(l[1], t1); else m.push([t0, t1]); }
  return m.reduce((x, y) => (y[1] - y[0] > x[1] - x[0] ? y : x));
}
const lerp = (a, b, t) => [r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t)];
const rstat = { segs: 0, dropDup: 0, dropMask: 0, clipped: 0 };
const runs = [];
for (const c of chains) {
  const P = c.p, seg = [];
  for (let i = 1; i < P.length; i++) {
    rstat.segs++;
    const a = P[i - 1], b = P[i], cl = clipBox(a, b);
    if (!cl) { seg.push({ t: 'out' }); continue; }
    if (dupSeg(a, b, c.w)) { seg.push({ t: 'dup' }); rstat.dropDup++; continue; }
    const m = lerp(a, b, (cl[0] + cl[1]) / 2);
    if (!allowed(m[0], m[1])) { seg.push({ t: 'out' }); rstat.dropMask++; continue; }
    if (cl[0] > 0 || cl[1] < 1) rstat.clipped++;
    seg.push({ t: 'keep', cl });
  }
  let cur = null;
  const flush = () => { if (cur && cur.pts.length >= 2) runs.push(cur); cur = null; };
  for (let i = 1; i < P.length; i++) {
    const s = seg[i - 1], a = P[i - 1], b = P[i];
    if (s.t === 'keep') {
      const A = s.cl[0] > 0 ? lerp(a, b, s.cl[0]) : a, B = s.cl[1] < 1 ? lerp(a, b, s.cl[1]) : b;
      if (s.cl[0] > 0) flush();
      if (!cur) { cur = { c, pts: [], head: 0, tail: 0, cutHead: s.cl[0] > 0 ? 1 : 0, cutTail: 0 }; if (i >= 2 && seg[i - 2].t === 'dup') { cur.pts.push(P[i - 2]); cur.head = 1; } cur.pts.push(A); }
      cur.pts.push(B);
      if (s.cl[1] < 1) { cur.cutTail = 1; flush(); }
      continue;
    }
    if (cur && s.t === 'dup') { cur.pts.push(b); cur.tail = 1; } // 기존 도로 위로 꼭짓점 하나 겹쳐 이음
    flush();
  }
  flush();
}
// [ncsoft-roads] 덧박스(NC_BOX) 바깥 변에서 잘린 끝 → 가장 가까운 OSM 교차 노드(다른 길과 공유하는 꼭짓점, 80m 안)까지 되돌림
//   (BOX 변 · BOX 와 맞닿은 변은 1단계 그대로). 교차 노드를 못 찾으면 그대로 둔다(공원 속 보행로 등 지면 높이라 허공 아님)
const NC_ONLY = (x, z) => z < BOX.z0 - 0.1 && (Math.abs(x - NC_BOX.x0) < 0.25 || Math.abs(x - NC_BOX.x1) < 0.25 || Math.abs(z - NC_BOX.z0) < 0.25);
const nodeUse = new Map();
for (const e of raw.elements) if (e.type === 'way' && e.tags?.highway && e.nodes) for (const id of new Set(e.nodes)) nodeUse.set(id, (nodeUse.get(id) || 0) + 1);
const jPts = new Set();
for (const e of raw.elements) if (e.type === 'way' && e.tags?.highway && e.nodes && e.geometry) e.nodes.forEach((id, i) => { if (nodeUse.get(id) > 1 && e.geometry[i]) jPts.add(proj(e.geometry[i]).join(',')); });
rstat.trimmed = 0; rstat.trimDrop = 0;
function trimToJunction(run) {
  for (const end of ['cutTail', 'cutHead']) {
    if (!run[end]) continue;
    const P = end === 'cutTail' ? run.pts : run.pts.slice().reverse(), last = P[P.length - 1];
    if (!NC_ONLY(last[0], last[1])) continue;
    let L = 0, k = -1;
    for (let i = P.length - 2; i >= 0; i--) { L += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (L > 80) break; if (jPts.has(P[i].join(','))) { k = i; break; } }
    if (k < 0) continue;
    const Q = P.slice(0, k + 1); rstat.trimmed++;
    run.pts = end === 'cutTail' ? Q : Q.reverse();
  }
  return run.pts.length >= 2;
}
for (let i = runs.length - 1; i >= 0; i--) if (!trimToJunction(runs[i])) { runs.splice(i, 1); rstat.trimDrop++; }
const rec = (c, pts) => { const o = { p: pts.map(([x, z]) => [x, z]), w: c.w, k: c.k }; if (c.n) o.n = c.n; if (c.br) o.br = 1; if (c.walk) o.walk = 1; return o; };
const addR = {};
for (const run of runs) {
  const P = run.pts; let start = 0, curKey = tileOf((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2);
  const emit = (s, e, key) => {
    const a = Math.max(0, s - 1), b = Math.min(P.length - 1, e + 1);
    const o = rec(run.c, P.slice(a, b + 1));
    const oh = (s - a) + (s === 0 ? run.head : 0), ot = (b - e) + (e === P.length - 1 ? run.tail : 0);
    if (oh || ot) o.o = [oh, ot];
    (addR[key] ||= []).push(o);
  };
  for (let i = 1; i < P.length - 1; i++) {
    const key = tileOf((P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    if (key !== curKey) { emit(start, i, curKey); start = i; curKey = key; }
  }
  emit(start, P.length - 1, curKey);
}
for (const k of Object.keys(addR)) if (!cellMode[k]) throw new Error('박스 밖 도로 조각 ' + k);

// ---------- 3) 공원 · 광장 · 물 ----------
const LIVE_PARK_KINDS = new Set(['park', 'garden', 'playground', 'pitch', 'recreation_ground', 'grass', 'forest', 'meadow', 'village_green', 'wood', 'scrub', 'grassland', 'plaza']);
const PARKS = { leisure: ['park', 'garden', 'playground', 'pitch', 'recreation_ground'], landuse: ['grass', 'park', 'recreation_ground', 'forest', 'meadow', 'village_green'], natural: ['wood', 'scrub', 'grassland'] };
const parks = [...plazas], water = [], waterLines = [];
for (const e of raw.elements) {
  const t = e.tags || {}; if (e.type === 'node' || t.building) continue;
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') { for (const p of polygonsOf(e)) water.push({ o: p.outer, holes: p.holes }); continue; }
  if (t.waterway && e.type === 'way' && e.geometry && ['river', 'stream', 'canal'].includes(t.waterway) && !(t.tunnel && t.tunnel !== 'no')) { waterLines.push({ p: e.geometry.map(proj), w: t.waterway === 'river' ? 40 : t.waterway === 'canal' ? 8 : 5 }); continue; }
  let pk = null;
  for (const [tk, list] of Object.entries(PARKS)) if (list.includes(t[tk])) pk = t[tk];
  if (pk && LIVE_PARK_KINDS.has(pk)) for (const p of polygonsOf(e)) parks.push({ o: p.outer, holes: p.holes, k: pk });
}
// 광장 데크 아래 1층 바닥: 데크 외곽을 포장 광장으로 (데크 자체는 랜드마크 모델)
const deckB = buildings.find((b) => b.id === LM_DECK);
if (deckB) parks.push({ o: deckB.o, holes: [], k: 'plaza', deck: 1 });
// 칸별 허용 영역 (기존 칸 = 그 타일 바닥 ∩ 박스, 새 칸 = 칸 ∩ 박스)
const cellGeom = {};
for (const k of CELLS) {
  const [tx, tz] = k.split('_').map(Number);
  const rects = BOXES.map((B) => [Math.max(tx * TS, B.x0), Math.max(tz * TS, B.z0), Math.min((tx + 1) * TS, B.x1), Math.min((tz + 1) * TS, B.z1)]).filter(([a, b, c, d]) => c > a && d > b).map((r) => rectGeom(...r));
  const rect = rects.length > 1 ? pc.union(...rects) : rects[0];
  cellGeom[k] = cellMode[k] === 'new' ? [rect] : pc.intersection([rect], ...(existing[k].floor || []).map((f) => [closeRing(f.o), ...(f.holes || []).map(closeRing)]));
}
const exParkGrid = new Grid(60); for (const p of exP) exParkGrid.add(p, ...bboxOf(p.o));
function distribute(polys, field, isDup = () => false) {
  const out = {}; let n = 0;
  for (const p of polys) {
    const g = [closeRing(p.o), ...(p.holes || []).map(closeRing)];
    const bb = bboxOf(p.o);
    for (const k of CELLS) {
      const [tx, tz] = k.split('_').map(Number);
      if (bb[2] < tx * TS || bb[0] > (tx + 1) * TS || bb[3] < tz * TS || bb[1] > (tz + 1) * TS) continue;
      let gi; try { gi = pc.intersection([g], cellGeom[k]); } catch { continue; }
      for (const q of toPolys(gi)) { if (isDup(q)) continue; ((out[k] ||= {})[field] ||= []).push({ ...q, ...(p.k ? { k: p.k } : {}) }); n++; }
    }
  }
  return { out, n };
}
const parkDup = (q) => { const c = centroid(q.o); return exParkGrid.q(c[0], c[1]).some((e) => inPoly(c[0], c[1], e.o, e.holes)); };
const P = distribute(parks, 'parks', parkDup), W = distribute(water, 'water');
const wlOut = {};
for (const l of waterLines) {
  let cur = [];
  const flush = () => { if (cur.length >= 2) { const m = cur[Math.floor(cur.length / 2)]; const k = tileOf(m[0], m[1]); if (cellMode[k]) (wlOut[k] ||= []).push({ p: cur, w: l.w }); } cur = []; };
  for (const p of l.p) { if (inBox(p[0], p[1]) && allowed(p[0], p[1])) cur.push(p); else flush(); }
  flush();
}

// ---------- 4) 역 · 출입구 · 랜드마크 ----------
const nodes = raw.elements.filter((e) => e.type === 'node');
const stNodes = nodes.filter((e) => e.tags?.railway === 'station' || e.tags?.public_transport === 'station').filter((e) => /판교/.test(e.tags?.name || '') && inBox(...proj(e)));
if (!stNodes.length) throw new Error('판교역 노드 없음');
// 노선: 역 노드 태그로 판별 (경강선 = description/노선 태그, 신분당선 = 운영사 네오트랜스 — 이 구간 신분당선 운영사)
const LINE_OF = (t) => (/경강/.test(`${t.description || ''} ${t.line || ''} ${t.name || ''}`) || /^K\d+/.test(t.ref || '') ? '경강선' : /신분당|네오트랜스|NEO TRANS/i.test(`${t.line || ''} ${t.operator || ''} ${t['operator:en'] || ''}`) ? '신분당선' : null);
const stLines = [...new Set(stNodes.map((e) => LINE_OF(e.tags)).filter(Boolean))].sort((a, b) => (a === '신분당선' ? -1 : b === '신분당선' ? 1 : 0));
const sp = stNodes.map(proj);
const allRendered = buildings.filter((b) => b.id !== LM_DECK && !b.outline);
const footways = chains.filter((c) => ['footway', 'pedestrian', 'path', 'steps'].includes(c.k));
const exits = nodes.filter((e) => e.tags?.railway === 'subway_entrance' || e.tags?.railway === 'train_station_entrance').map((e) => {
  const [x, z] = proj(e);
  // 입구 방향: 가장 가까운 보행로 선분 방향 (데이터 기반). 건물 안(지하 연결 통로) 입구는 캐노피 없이 표지만
  let best = null, bd = Infinity;
  for (const c of footways) for (let i = 1; i < c.p.length; i++) { const d = segDist(x, z, ...c.p[i - 1], ...c.p[i]); if (d < bd) { bd = d; best = [c.p[i - 1], c.p[i]]; } }
  const dir = best ? Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) : 0;
  const inside = allRendered.find((b) => inPoly(x, z, b.o, b.holes));
  return { x, z, ref: e.tags.ref || '', osm: e.id, dir: +dir.toFixed(3), ...(inside ? { indoor: inside.id } : {}) };
}).filter((e) => inBox(e.x, e.z)).sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'en', { numeric: true }));
// 역 표지판(stationSign: 기둥+판 x-0.3..+0.3, 자체 캐노피 x+2.5..+7.5 · z±3.5) 자리: 출구 둘레에서 건물·데크·차도·다른 출입구와 안 겹치는 첫 점
//   (런타임 placeSign 은 기존처럼 그 점부터 나선 탐색 — 여기선 판교 출입구 캐노피/데크와 겹치지 않게만 고름. 배치 규칙일 뿐 데이터 아님)
const signAt = (() => {
  const solids = buildings.filter((b) => !b.outline);
  const drive = chains.filter((c) => !c.walk);
  const clear = (x, z) => [[-0.5, -3.7], [-0.5, 3.7], [7.7, -3.7], [7.7, 3.7], [3.6, 0], [0, 0]].every(([dx, dz]) => {
    const px = x + dx, pz = z + dz;
    return inBox(px, pz) && !solids.some((b) => inPoly(px, pz, b.o, b.holes)) && !exits.some((e) => Math.hypot(e.x - px, e.z - pz) < 6.5)
      && !drive.some((c) => c.p.some((q, i) => i && segDist(px, pz, ...c.p[i - 1], ...q) < c.w / 2 + 1));
  });
  for (const e of exits) for (const r of [10, 14, 18, 24]) for (let a = 0; a < 16; a++) { const x = r1(e.x + Math.cos((a * Math.PI) / 8) * r), z = r1(e.z + Math.sin((a * Math.PI) / 8) * r); if (clear(x, z)) return { x, z }; }
  return null;
})();
const station = { id: 'pangyo', name: '판교', nameEn: 'Pangyo', lines: stLines.length ? stLines : ['신분당선'], x: r1(sp.reduce((s, p) => s + p[0], 0) / sp.length), z: r1(sp.reduce((s, p) => s + p[1], 0) / sp.length), exits: exits.map(({ x, z, ref }) => ({ x, z, ...(ref ? { ref } : {}) })), ...(signAt ? { signAt } : {}), osm: stNodes.map((e) => e.id) };

const lmParts = (lm) => buildings.filter((b) => lmOf(b) === lm && !b.outline).map((b) => ({ id: b.id, o: b.o, ...(b.holes?.length ? { holes: b.holes } : {}), h: b.h, mh: b.mh || 0, ...(b.n ? { n: b.n } : {}), s: b.s }));
const centerOf = (parts) => { const all = parts.flatMap((p) => p.o); const bb = bboxOf(all); return { x: r1((bb[0] + bb[2]) / 2), z: r1((bb[1] + bb[3]) / 2), y: Math.max(...parts.map((p) => p.h)) }; };
const dept = lmParts('pangyo-dept'), towers = lmParts('alphadom-towers'), deck = deckB ? [{ id: deckB.id, o: deckB.o, holes: deckB.holes, h: DECK.h, mh: DECK.mh, s: 'landmark:deck' }] : [];
// [ncsoft] 층수: OSM building:levels(꼭대기 층 번호) − building:min_level → 층 띠 간격 = (height − min_height) / 층수 (태그 값 그대로)
const ncTags = new Map(raw.elements.filter((e) => LM_NC.has(`${e.type[0]}${e.id}`)).map((e) => [`${e.type[0]}${e.id}`, e.tags || {}]));
const nc = lmParts('ncsoft-rnd').map((p) => { const t = ncTags.get(p.id) || {}, lv = num(t['building:levels']), ml = num(t['building:min_level']) || 0; return { ...p, fl: lv && lv > ml ? lv - ml : null }; });
if (dept.length !== 4 || towers.length !== 4 || deck.length !== 1 || nc.length !== 5) throw new Error(`랜드마크 매칭 실패 dept=${dept.length} towers=${towers.length} deck=${deck.length} ncsoft=${nc.length}`);
// 데크 안쪽 빈 곳(선큰 광장) — OSM 링의 구멍이 없으면 외곽 자체의 오목한 X 모양이라 중심 원형 마당을 가정하지 않는다
const plazaPed = plazas.filter((p) => inBox(...centroid(p.o)));
// [deck-v2] OSM 엘리베이터 노드: 데크 외곽 안 또는 가장자리 6m 안인 것만 (지상 → 데크 상판)
function deckElevators() {
  if (!deckB || !fs.existsSync(ELEV)) return [];
  const ring = deckB.o, inR = (x, z) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
  const edge = (x, z) => Math.min(...ring.map((a, i) => { const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); }));
  return readJSON(ELEV).elements.map((n) => { const [x, z] = proj(n); return { osm: n.id, x: r1(x), z: r1(z), inside: inR(x, z) }; }).filter((e) => e.inside || edge(e.x, e.z) < 6).map(({ osm, x, z, inside }) => ({ osm, x, z, inside }));
}
const landmarks = [
  { id: 'pangyo-dept', model: 'pangyoDept', label: { ko: '현대백화점', en: 'Hyundai Department Store' }, pos: centerOf(dept), parts: dept },
  { id: 'alphadom-towers', model: 'pangyoTowers', label: { ko: '알파돔시티', en: 'Alphadom City' }, pos: centerOf(towers.concat(deck)), parts: towers },
  { id: 'pangyo-deck', model: 'pangyoDeck', label: { ko: '판교역 광장', en: 'Pangyo Station Plaza' }, pos: { ...centerOf(deck), y: DECK.h }, parts: deck, elevators: deckElevators() },
  { id: 'pangyo-entrances', model: 'pangyoEntrances', entrances: exits, lines: station.lines },
  // 이름 표지·라벨 없음(도훈님 결정) · 로고 없음
  { id: 'ncsoft-rnd', model: 'ncsoftRnd', osm: 'w694434545', pos: centerOf(nc), parts: nc },
];

// ---------- 5) 쓰기 ----------
const KR = cBase.roadKinds, KB = cBase.buildingKinds;
const LOD_ROAD = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service']);
const bkIdx = (k) => { const i = KB.indexOf(k); return i >= 0 ? i : KB.indexOf(k.startsWith('part:') ? 'part:yes' : 'yes'); };
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'tiles'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'lod'), { recursive: true });
const tiles = {}; let bytes = 0;
for (const k of CELLS) {
  const [tx, tz] = k.split('_').map(Number);
  const mode = cellMode[k];
  const b = (addB[k] || []).map(({ id, ...r }) => r);
  const t = { b, r: addR[k] || [], parks: P.out[k]?.parks || [], water: W.out[k]?.water || [], floor: mode === 'new' ? toPolys(cellGeom[k][0] ? cellGeom[k] : []) : [], wl: wlOut[k] || [] };
  if (!t.b.length && !t.r.length && !t.floor.length) continue;
  const L = { b: [], r: [], f: [], p: [], w: [] };
  for (const x of addB[k] || []) {
    if (x.nr && !x.lm || x.lm === 'pangyo-deck') continue;
    if (Math.abs(area(x.o)) < 60 && x.h < 12) continue;
    L.b.push([x.h, x.mh || 0, bkIdx(x.k), flat(dpRing(x.o, 1.2))]);
  }
  for (const r of t.r) {
    if (!LOD_ROAD.has(r.k) || r.w < 3 || KR.indexOf(r.k) < 0) continue;
    const p = r.p.length > 3 ? [r.p[0], ...dp(r.p.slice(1, -1), 1.5), r.p[r.p.length - 1]] : r.p;
    L.r.push([r.w, KR.indexOf(r.k), flat(p), r.br ? 1 : 0]);
  }
  for (const f of t.floor) L.f.push([flat(dpRing(f.o, 1)), ...(f.holes || []).map((h) => flat(dpRing(h, 1)))]);
  for (const p of t.parks) L.p.push([p.k, flat(dpRing(p.o, 2)), ...(p.holes || []).map((h) => flat(dpRing(h, 2)))]);
  for (const w of t.water) L.w.push([flat(dpRing(w.o, 2)), ...(w.holes || []).map((h) => flat(dpRing(h, 2)))]);
  const s = JSON.stringify(t); bytes += s.length;
  fs.writeFileSync(path.join(OUT, 'tiles', k + '.json'), s);
  fs.writeFileSync(path.join(OUT, 'lod', k + '.json'), JSON.stringify(L));
  tiles[k] = { x0: tx * TS, z0: tz * TS, nb: t.b.length, nr: t.r.length, mode };
}
const index = {
  meta: {
    name: 'Pangyo station area (stage 1)', tileSize: TS, box: BOX, boxes: BOXES, generated: new Date().toISOString(),
    source: { osm: `Overpass API (osm_base ${raw.osm3s?.timestamp_osm_base || '?'})`, query: 'data/query_pangyo.overpassql', corridor: cIndex.meta.generated },
    attribution: '© OpenStreetMap contributors (ODbL)',
    heightRule: 'OSM height → building:levels×3.2(+1.5 if >3F, else +0.6) → default levels by type/area (scripts/bake.mjs defaultLevels); deck = 10–12 m from press descriptions "3~4층 높이" (no measured survey value: VWorld dt_d010 hg=0 on all deck/plaza parcels, OSM no height tags)',
    stats: { ...stat, ...rstat, runs: runs.length, parks: P.n, water: W.n, tiles: Object.keys(tiles).length, tileKB: Math.round(bytes / 1024) },
    defaultHeights: defaultList,
  },
  tiles, stations: [station], landmarks,
};
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(JSON.stringify({ stats: index.meta.stats, tiles, station: { ...station, exits: station.exits.length }, exits: exits.map((e) => [e.ref, e.x, e.z, e.indoor || '']) }, null, 1));
