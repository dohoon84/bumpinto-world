// 정자 라이브맵 건물 외벽·지붕 색 -> public/jeongja-colours.json (작은 정적 파일, 건물 1채당 1줄)
//
// 원본(저장소에 커밋하지 않음):
//   브이월드 GIS건물통합정보 (국토교통부, 레이어 LT_C_BLDGINFO = dt_d010 캐시, 공공데이터포털 15083092)
//   이용허락: 공공누리 제1유형(출처표시). 화면/README 에 "브이월드 GIS건물통합정보 (국토교통부)" 출처 표시.
//   타일 캐시 폴더(타일당 {tile, fetched, source, n, features:[{id, g:GeoJSON(lon,lat), p:{속성}}]}) 를 --vworld 로 준다.
//   쓰는 속성: strct_code(구조), buld_prpos_code(주용도), use_confm_de(사용승인일), buld_nm(건물명; 수동 지정 확인용).
//   ※ 브이월드·건축물대장 어디에도 "외벽 마감재/색" 필드는 없다. 그래서 여기 색은 '추정'(vworld-estimate)이다.
//
// 실행:
//   node scripts/building-colours.mjs --vworld=/path/data/raw/vworld/dt_d010
//   (옵션) --world=public/jeongja.json --out=public/jeongja-colours.json
//          --mapillary=<mly_colours.json>  (나중에: 실제 사진에서 뽑은 색. [{idx, hex, ok:true}] 중 ok 만 반영)
//
// 규칙:
//   - 좌표는 게임과 같은 투영(정자역 기준 미터, x=동, z=남). 중심은 jeongja.json meta.center.
//   - 매칭: 우리 건물 풋프린트 안에 격자 점을 뿌려, 그 점을 가장 많이 덮는 브이월드 건물(겹침 ≥ 30%)의 속성을 쓴다.
//   - 팔레트(구조·용도·준공연도) 안에서 건물 인덱스 해시로 고르고, 작은 HSL 흔들림을 준다(결정적, 이웃끼리 다르게).
//   - 출처 우선순위(높은 것이 이김): manual > mapillary > vworld-estimate > k-fallback
//   - 키는 jeongja.json buildings 배열 인덱스 + 중심점(cx, cz). 런타임은 중심점으로 다시 확인해 어긋나면 버린다.
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const VW = arg('vworld'), WORLD = arg('world', 'public/jeongja.json'), OUT = arg('out', 'public/jeongja-colours.json'), MLY = arg('mapillary');
if (!VW) { console.error('usage: node scripts/building-colours.mjs --vworld=<dt_d010 타일 캐시 폴더>'); process.exit(1); }

const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const C = world.meta.center;
const kx = Math.cos((C.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (lon, lat) => [(lon - C.lon) * kx, -(lat - C.lat) * kz];
const OVERLAP = 0.3;

// 소스 코드 (파일 포맷의 일부: 순서 고정, 새 항목은 뒤에)
export const SRCS = ['k-fallback', 'vworld-estimate', 'manual', 'mapillary'];
const PRIORITY = { 'k-fallback': 0, 'vworld-estimate': 1, mapillary: 2, manual: 3 };

// --- 기하 ---
const centroid = (ring) => { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1]; } return [x / ring.length, z / ring.length]; };
function inRing(x, z, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
const inPoly = (x, z, outer, holes) => inRing(x, z, outer) && !(holes || []).some((h) => inRing(x, z, h));
const bboxOf = (ring) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return { x0, z0, x1, z1 }; };

// --- 브이월드 피처 읽기 (id 로 중복 제거) ---
const vw = new Map();
for (const f of fs.readdirSync(VW).filter((s) => s.endsWith('.json'))) {
  for (const ft of JSON.parse(fs.readFileSync(path.join(VW, f), 'utf8')).features || []) {
    if (vw.has(ft.id) || !ft.g) continue;
    const polys = ft.g.type === 'MultiPolygon' ? ft.g.coordinates : ft.g.type === 'Polygon' ? [ft.g.coordinates] : [];
    const parts = polys.map((pl) => ({ outer: pl[0].map((p) => proj(p[0], p[1])), holes: pl.slice(1).map((r) => r.map((p) => proj(p[0], p[1]))) })).filter((q) => q.outer.length >= 3);
    if (!parts.length) continue;
    const bb = bboxOf(parts.flatMap((q) => q.outer));
    if (bb.x1 < -1500 || bb.x0 > 1500 || bb.z1 < -1500 || bb.z0 > 1500) continue;
    vw.set(ft.id, { parts, bb, p: ft.p || {} });
  }
}
const vwList = [...vw.values()];
const CELL = 50, grid = new Map();
vwList.forEach((v, i) => {
  for (let gx = Math.floor(v.bb.x0 / CELL); gx <= Math.floor(v.bb.x1 / CELL); gx++)
    for (let gz = Math.floor(v.bb.z0 / CELL); gz <= Math.floor(v.bb.z1 / CELL); gz++) {
      const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    }
});

function matchBuilding(b) {
  const bb = bboxOf(b.o);
  const step = Math.max(0.5, Math.sqrt(Math.max(1, (bb.x1 - bb.x0) * (bb.z1 - bb.z0))) / 14);
  const cand = new Set();
  for (let gx = Math.floor(bb.x0 / CELL); gx <= Math.floor(bb.x1 / CELL); gx++)
    for (let gz = Math.floor(bb.z0 / CELL); gz <= Math.floor(bb.z1 / CELL); gz++) for (const i of grid.get(gx + ',' + gz) || []) cand.add(i);
  const cs = [...cand].filter((i) => { const v = vwList[i].bb; return v.x1 >= bb.x0 && v.x0 <= bb.x1 && v.z1 >= bb.z0 && v.z0 <= bb.z1; });
  const hits = new Map(); let total = 0;
  for (let x = bb.x0 + step / 2; x < bb.x1; x += step)
    for (let z = bb.z0 + step / 2; z < bb.z1; z += step) {
      if (!inPoly(x, z, b.o, b.holes)) continue;
      total++;
      for (const i of cs) if (vwList[i].parts.some((q) => inPoly(x, z, q.outer, q.holes))) hits.set(i, (hits.get(i) || 0) + 1);
    }
  let best = -1, bc = 0;
  for (const [i, n] of hits) if (n > bc) { bc = n; best = i; }
  const ov = total ? bc / total : 0;
  return ov >= OVERLAP ? { p: vwList[best].p, ov } : { p: null, ov };
}

// --- 색 유틸 (sRGB hex <-> HSL) ---
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const rgb2hex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
function rgb2hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// 결정적 해시 (인덱스 + 솔트) -> [0,1)
const hash = (i, salt) => { let x = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 40503)) >>> 0; x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0; x = Math.imul(x ^ (x >>> 13), 3266489917) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const pick = (arr, i, salt) => arr[Math.floor(hash(i, salt) * arr.length)];
function jitter(hex, i, amt = 1) {
  const [h, s, l] = rgb2hsl(hex2rgb(hex));
  return rgb2hex(hsl2rgb([(h + (hash(i, 11) - 0.5) * 0.02 * amt + 1) % 1, clamp01(s + (hash(i, 12) - 0.5) * 0.06 * amt), clamp01(l + (hash(i, 13) - 0.5) * 0.06 * amt)]));
}
const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, k) => v + (y[k] - v) * t)); };

// --- 팔레트 (실제 분당 거리 느낌: 채도 낮게) ---
const P = {
  brickRed: ['#ad7563', '#a36c5a', '#b58069', '#996656', '#a9775f'],
  brickBeige: ['#c6a98c', '#bb9e80', '#cdb497', '#c2aa90'],
  ivory: ['#e8dfcf', '#e2d7c4', '#ece5d7', '#dcd2bf', '#e5dccb'],
  stone: ['#c8bfaf', '#b9b0a2', '#d0c5b3', '#aca598', '#bfb5a5'],
  glass: ['#9aabb9', '#8c9dab', '#a4b0ba', '#adb7bf'],
  greyLight: ['#d5d5d1', '#c8c8c4', '#dcdad5', '#bebfbd'],
  greyDark: ['#8e9195', '#9da0a2', '#7f8286'],
  school: ['#c6a585', '#b98f6f', '#cfb293'],
  neutral: ['#cec7bb', '#beb7ab', '#c9c2b6'],
};
const ROOF = { concrete: ['#bcbab3', '#c5c2ba', '#b1afa8'], urethane: ['#9fb3a2', '#a8b8a9', '#95aa99'], dark: ['#8f9296', '#9a9da0'] };

// 매칭이 안 된 건물은 기존 k 색을 그대로 쓴다 (src/world.js BUILDING_COLOR 를 읽어서 항상 같게)
const K_COLOR = (() => {
  const src = fs.readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
  const body = src.match(/export const BUILDING_COLOR = \{([\s\S]*?)\};/)[1];
  return Object.fromEntries([...body.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => [m[1], m[2]]));
})();

function estimate(i, p) {
  const s = String(p.strct_code || ''), u = String(p.buld_prpos_code || '');
  const y = parseInt(String(p.use_confm_de || '').slice(0, 4), 10) || null;
  const masonry = s === '11' || s === '12' || s === '19';
  const steel = s === '31' || s === '32' || s === '42';
  let wall, roof = pick(ROOF.concrete, i, 3), rule;
  if (u === '14000' || (steel && u !== '01000' && u !== '02000')) { wall = pick(P.glass, i, 1); roof = pick(ROOF.dark, i, 3); rule = 'office/steel→glass'; }
  else if (u === '02000') {
    const low = (p.ground_floor_co || 99) <= 5; // 다세대·연립(저층 빌라): 1990s 분당은 벽돌 마감도 흔하다
    if (y && y >= 2005) { wall = pick(P.greyLight, i, 1); rule = '공동(2005+)→grey'; }
    else if (low && hash(i, 2) < 0.4) { wall = hash(i, 5) < 0.5 ? pick(P.brickBeige, i, 1) : pick(P.brickRed, i, 1); rule = '공동 저층(-2004)→brick'; }
    else { wall = pick(P.ivory, i, 1); rule = '공동→ivory'; }
  }
  else if (u === '01000') {
    if (masonry || !y || y < 2005) { wall = hash(i, 2) < 0.58 ? pick(P.brickRed, i, 1) : pick(P.brickBeige, i, 1); rule = masonry ? '조적→brick' : '단독·다가구(-2004)→brick'; }
    else { wall = hash(i, 2) < 0.65 ? pick(P.greyLight, i, 1) : pick(P.greyDark, i, 1); rule = '단독(2005+)→grey'; }
    if (hash(i, 4) < 0.45) roof = pick(ROOF.urethane, i, 3); // 다가구 옥상 녹색 우레탄 방수
  } else if (masonry) { wall = hash(i, 2) < 0.5 ? pick(P.brickRed, i, 1) : pick(P.brickBeige, i, 1); rule = '조적→brick'; }
  else if (u === '10000') { wall = pick(P.school, i, 1); rule = '교육→warm brick'; }
  else if (u === '03000' || u === '04000') {
    wall = (y && y >= 2005) ? (hash(i, 2) < 0.6 ? pick(P.greyLight, i, 1) : pick(P.greyDark, i, 1)) : pick(P.stone, i, 1);
    rule = y >= 2005 ? '근생(2005+)→grey' : '근생→stone';
  } else if (y && y >= 2005) { wall = hash(i, 2) < 0.6 ? pick(P.greyLight, i, 1) : pick(P.greyDark, i, 1); rule = '2005+→grey'; }
  else { wall = pick(P.neutral, i, 1); rule = 'other→neutral'; }
  return { wall: jitter(wall, i), roof: jitter(roof, i, 0.6), rule };
}

// --- 수동 지정 (실제 사진 근거가 있는 것만; 근거는 docs 주석과 PR 설명에 같이 적는다) ---
// match: 브이월드 buld_nm 이 같아야 적용 (인덱스가 바뀌어도 엉뚱한 건물에 칠하지 않도록)
const MANUAL = [
  // 네이버 그린팩토리 (정자동 178-1). 짙은 녹회색 유리 커튼월 + 회색 석재 저층부.
  //   근거 1: Wikimedia Commons "File:Naver HQ.jpg" (revi, CC BY 2.0 KR) — 유리 #526d6a/#486060, 석재 기단 #5b5b56 추출
  //   근거 2: Wikimedia Commons "File:서울 톨게이트 입갤 전에 NHN 본사 ^2 - panoramio.jpg" (이명민, CC BY 3.0) — 유리 #36493b/#374a3d
  //   (색 수치만 사용, 이미지는 쓰지 않음)
  { idx: 62, name: '네이버 그린팩토리', wall: '#557069', roof: '#7a7f7d', note: 'tower (dup footprint #884)' },
  { idx: 884, name: '네이버 그린팩토리', wall: '#557069', roof: '#7a7f7d', note: 'tower (dup footprint #62)' },
  { idx: 63, name: '네이버 그린팩토리', wall: '#77776f', roof: '#8a8b87', note: 'low wing, stone' },
];

// --- 실행 ---
const out = [], stats = { matched: 0, bySrc: {}, byRule: {} };
const mly = MLY ? new Map(JSON.parse(fs.readFileSync(MLY, 'utf8')).filter((r) => r.ok && /^#[0-9a-f]{6}$/i.test(r.hex)).map((r) => [r.idx, r])) : new Map();
world.buildings.forEach((b, i) => {
  if (!b.o || b.o.length < 3) return;
  const [cx, cz] = centroid(b.o);
  const m = matchBuilding(b);
  let e;
  if (m.p) { stats.matched++; e = { ...estimate(i, m.p), src: 'vworld-estimate' }; }
  else {
    const base = K_COLOR[b.k] || K_COLOR.yes; // 매칭 안 됨: 기존 k 색 (하얗게 바래지 않게만)
    e = { wall: jitter(base, i, 0.5), roof: jitter(mix(base, '#bcbab3', 0.5), i, 0.5), src: 'k-fallback', rule: 'unmatched→k' };
  }
  const cands = [e];
  const mm = mly.get(i); if (mm) cands.push({ wall: mm.hex, roof: e.roof, src: 'mapillary', rule: 'mapillary' });
  for (const o of MANUAL.filter((o) => o.idx === i)) {
    if (m.p?.buld_nm !== o.name) { console.warn(`manual #${i} (${o.name}) 건너뜀: 브이월드 이름 불일치 (${m.p?.buld_nm ?? 'none'})`); continue; }
    cands.push({ wall: o.wall, roof: o.roof, src: 'manual', rule: 'manual:' + o.name });
  }
  const best = cands.sort((a, b2) => PRIORITY[b2.src] - PRIORITY[a.src])[0];
  stats.bySrc[best.src] = (stats.bySrc[best.src] || 0) + 1;
  stats.byRule[best.rule] = (stats.byRule[best.rule] || 0) + 1;
  out.push([i, Math.round(cx * 10) / 10, Math.round(cz * 10) / 10, best.wall, best.roof, SRCS.indexOf(best.src)]);
});

const json = {
  meta: {
    v: 1, world: path.basename(WORLD), buildings: world.buildings.length, generated: new Date().toISOString().slice(0, 10),
    attribution: '건물 속성: 브이월드 GIS건물통합정보 (국토교통부, 공공누리 제1유형) — 외벽색은 구조·용도·사용승인연도로 추정',
    fields: ['idx', 'cx', 'cz', 'wall', 'roof', 'src'], srcs: SRCS, priority: 'manual > mapillary > vworld-estimate > k-fallback',
  },
  b: out,
};
fs.writeFileSync(OUT, JSON.stringify(json));
console.log(`buildings ${world.buildings.length} · vworld feats ${vwList.length} · matched ${stats.matched} · wrote ${out.length} -> ${OUT} (${fs.statSync(OUT).size} B)`);
console.log('by src', stats.bySrc);
console.log('by rule', stats.byRule);
