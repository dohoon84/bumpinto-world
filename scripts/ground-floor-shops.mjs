// 정자 라이브맵 건물의 1층 상가 정보 -> public/jeongja-shops.json (작은 정적 파일)
//
// 원본(저장소에 커밋하지 않음):
//   소상공인시장진흥공단_상가(상권)정보 (공공데이터포털 파일데이터 15083033, 분기 갱신, 무료 · 이용허락범위 제한 없음)
//   https://www.data.go.kr/data/15083033/fileData.do 에서 zip(약 350 MB)을 받아
//   "소상공인시장진흥공단_상가(상권)정보_경기_YYYYMM.csv" 만 풀어 둔다. API 키는 필요 없다.
//
// 실행:
//   node scripts/ground-floor-shops.mjs --csv=/path/소상공인시장진흥공단_상가(상권)정보_경기_202609.csv
//   (옵션) --out=public/jeongja-shops.json --world=public/jeongja.json --osm=data/osm_raw_osmapi.json
//
// 규칙:
//   - 좌표는 게임과 같은 투영(scripts/convert.mjs: 정자역 기준 미터, x=동, z=남). 중심은 jeongja.json meta.center 를 쓴다.
//   - 층정보 = 1 인 업소만. 건물 풋프린트 안이거나 외곽선에서 10 m 이내면 그 건물에 붙인다.
//   - OSM shop/amenity 노드(level 없음/0/1)는 상가정보로 1층 업소가 없는 건물만 채운다.
//   - 키는 jeongja.json buildings 배열 인덱스. 런타임은 c(중심점)로 다시 확인해, jeongja.json 이 재생성돼 어긋나면 그 항목을 버린다.
import fs from 'node:fs';
import readline from 'node:readline';
import { cliArg as arg, loadWorld, inPolygon, bboxOf, bboxGrid, ringCentroid } from './lib/world-geo.mjs';

const CSV = arg('csv'), OUT = arg('out', 'public/jeongja-shops.json'), WORLD = arg('world', 'public/jeongja.json'), OSM = arg('osm', 'data/osm_raw_osmapi.json');
if (!CSV) { console.error('usage: node scripts/ground-floor-shops.mjs --csv=<상가(상권)정보_경기_YYYYMM.csv>'); process.exit(1); }

const { world, proj } = loadWorld(WORLD);
const { bbox: BB, bboxLocal: BL } = world.meta;
const inBox = (x, z) => x >= BL.x0 && x <= BL.x1 && z >= BL.z0 && z <= BL.z1;
const MATCH_M = 10;

// 카테고리 (인덱스가 파일 포맷의 일부: 순서를 바꾸지 말 것. 새 항목은 뒤에 추가)
export const CATS = ['cafe', 'restaurant', 'bar', 'bakery', 'convenience', 'retail', 'beauty', 'academy', 'real_estate', 'health', 'other'];
const CI = Object.fromEntries(CATS.map((c, i) => [c, i]));
function catSbiz(r) {
  const s = r['상권업종소분류명'], m = r['상권업종중분류명'], L = r['상권업종대분류명'];
  if (s === '카페') return 'cafe';
  if (s === '편의점') return 'convenience';
  if (s === '빵/도넛' || s === '제과점') return 'bakery';
  if (L === '음식' && (/주점/.test(m) || /주점|호프|바$/.test(s))) return 'bar';
  if (L === '음식') return 'restaurant';
  if (L === '보건의료') return 'health';
  if (/미용|네일|피부/.test(s) || /미용/.test(m)) return 'beauty';
  if (L === '교육') return 'academy';
  if (L === '부동산') return 'real_estate';
  if (L === '소매') return 'retail';
  return 'other';
}
function catOsm(t) {
  const a = t.amenity, s = t.shop;
  if (a === 'cafe') return 'cafe';
  if (s === 'convenience') return 'convenience';
  if (s === 'bakery') return 'bakery';
  if (a === 'bar' || a === 'pub') return 'bar';
  if (a === 'restaurant' || a === 'fast_food' || a === 'food_court' || a === 'ice_cream') return 'restaurant';
  if (['pharmacy', 'clinic', 'doctors', 'dentist', 'hospital'].includes(a) || t.healthcare) return 'health';
  if (['hairdresser', 'beauty', 'cosmetics'].includes(s)) return 'beauty';
  if (a === 'prep_school' || a === 'language_school' || t.office === 'educational_institution') return 'academy';
  if (s) return 'retail';
  return null;
}

// --- 건물 공간 인덱스 ---
const B = world.buildings;
const grid = bboxGrid(25);
B.forEach((b, i) => {
  const { x0, z0, x1, z1 } = bboxOf(b.o);
  grid.add({ x0: x0 - MATCH_M, z0: z0 - MATCH_M, x1: x1 + MATCH_M, z1: z1 + MATCH_M }, i);
});
function ringDist(x, z, r) {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[j], [bx, bz] = r[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
function locate(x, z) {
  const cand = grid.at(x, z);
  for (const i of cand) if (inPolygon(x, z, B[i].o, B[i].holes)) return { i, d: 0 };
  let best = null;
  for (const i of cand) { const d = ringDist(x, z, B[i].o); if (d <= MATCH_M && (!best || d < best.d)) best = { i, d }; }
  return best;
}

// --- CSV (모든 필드가 "..." 로 감싸진 형식, 내부 "" 이스케이프 지원) ---
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
const per = new Map(); // building idx -> [{cat, name, d}]
const stats = { rows: 0, inBox: 0, floor1: 0, matched: 0, inside: 0, osmFill: 0 };
let hdr = null;
const rl = readline.createInterface({ input: fs.createReadStream(CSV, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (let line of rl) {
  if (!hdr) { hdr = parseCsvLine(line.replace(/^\uFEFF/, '')); continue; }
  stats.rows++;
  // 빠른 bbox 사전 필터: 정자 근처 경도 문자열이 없으면 건너뜀
  if (!line.includes('127.1')) continue;
  const f = parseCsvLine(line); const r = {}; hdr.forEach((h, i) => { r[h] = f[i]; });
  const lat = +r['위도'], lon = +r['경도'];
  if (!(lat >= BB.s && lat <= BB.n && lon >= BB.w && lon <= BB.e)) continue;
  const [x, z] = proj(lat, lon); if (!inBox(x, z)) continue;
  stats.inBox++;
  const fl = (r['층정보'] || '').trim();
  if (fl !== '1' && fl !== '01') continue;
  stats.floor1++;
  const hit = locate(x, z); if (!hit) continue;
  stats.matched++; if (hit.d === 0) stats.inside++;
  const name = (r['상호명'] || '').trim(); if (!name) continue;
  if (!per.has(hit.i)) per.set(hit.i, []);
  per.get(hit.i).push({ cat: catSbiz(r), name, src: 's' });
}
if (!hdr || !stats.rows) { console.error('CSV 가 비었거나 형식이 다릅니다:', CSV); process.exit(1); }

// --- OSM 으로 빈 건물 채우기 ---
let osmPois = 0;
try {
  const osm = JSON.parse(fs.readFileSync(OSM, 'utf8'));
  const fill = new Map();
  for (const e of osm.elements) {
    if (e.type !== 'node' || !e.tags) continue;
    const t = e.tags, cat = catOsm(t); if (!cat) continue;
    const lv = t.level; if (lv != null && !['0', '1'].includes(String(lv).trim())) continue;
    const [x, z] = proj(e.lat, e.lon); if (!inBox(x, z)) continue;
    osmPois++;
    const hit = locate(x, z); if (!hit || per.has(hit.i)) continue;
    if (!fill.has(hit.i)) fill.set(hit.i, []);
    fill.get(hit.i).push({ cat, name: (t.name || t.brand || '').trim(), src: 'o' });
  }
  for (const [i, v] of fill) { per.set(i, v); stats.osmFill++; }
} catch (e) { console.warn('OSM 보충 생략:', e.message); }

// --- 건물별 요약 ---
const PRI = ['cafe', 'convenience', 'bakery', 'restaurant', 'bar', 'retail', 'beauty', 'health', 'academy', 'real_estate', 'other'];
const SHOW = new Set(['cafe', 'convenience', 'bakery', 'restaurant', 'bar', 'retail', 'beauty', 'health']); // 간판 이름 우선순위
const cleanName = (s) => s.replace(/\s*\(.*?\)\s*/g, '').replace(/(분당|정자|정자동|정자역|성남)?\s*(본점|직영점|분당점|정자점|정자역점|정자동점|점)$/, (m, a, b) => (b === '점' && !a ? m : '')).trim();
const rows = [];
const catCount = new Array(CATS.length).fill(0);
for (const [i, list] of [...per.entries()].sort((a, b) => a[0] - b[0])) {
  const cnt = new Map(); for (const s of list) cnt.set(s.cat, (cnt.get(s.cat) || 0) + 1);
  const main = [...cnt.entries()].sort((a, b) => b[1] - a[1] || PRI.indexOf(a[0]) - PRI.indexOf(b[0]))[0][0];
  const names = [];
  const ordered = [...list].sort((a, b) => (SHOW.has(b.cat) - SHOW.has(a.cat)) || (b.cat === main) - (a.cat === main) || a.name.length - b.name.length);
  for (const s of ordered) {
    const n = cleanName(s.name).slice(0, 14);
    if (n.length < 2 || names.includes(n)) continue;
    names.push(n); if (names.length >= 3) break;
  }
  const b = B[i];
  const [cx, cz] = ringCentroid(b.o).map(Math.round);
  catCount[CI[main]]++;
  rows.push([i, CI[main], list.length, cx, cz, names.join('|'), list[0].src === 'o' ? 1 : 0]);
}
const out = {
  meta: {
    v: 1,
    world: WORLD.split('/').pop(), buildings: B.length, matchM: MATCH_M,
    source: CSV.split('/').pop(), generated: new Date().toISOString().slice(0, 10),
    attribution: '소상공인시장진흥공단 상가(상권)정보 (공공데이터포털) · © OpenStreetMap contributors (ODbL)',
    cats: CATS,
    fields: ['idx', 'cat', 'count1F', 'cx', 'cz', 'names(|)', 'osmOnly'],
    stats: { ...stats, osmPois, shopBuildings: rows.length },
  },
  b: rows,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify(out.meta.stats));
console.log('categories:', Object.fromEntries(CATS.map((c, i) => [c, catCount[i]])));
console.log(OUT, fs.statSync(OUT).size, 'bytes');
