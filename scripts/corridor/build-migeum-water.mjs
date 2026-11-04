// [migeum-water] 미금 박스 안 탄천: 띠(#17 마스크)에 빠졌던 길·다리 잇기 + 수면 → public/corridor/migeum/water.json
//
//   ?migeumwater=0 (또는 ?migeum=0) 이면 런타임이 이 파일을 읽지 않는다 → 지금(#17) 화면/동작 그대로.
//
//   배경: build-pangyo.mjs --region=migeum 은 탄천 제방 띠(라이브 terrain.json 축 + tancheon.json, 둑 위 topL/topR + 0.6m) 안에
//         아무것도 굽지 않는다(라이브 하도 지형이 보이게). 그래서 띠를 건너는 돌마교(OSM 186410768)와 둑·둔치 길 조각이 비어 있었고,
//         라이브 수면 폴리곤(jeongja.json)은 liveBox(z ≤ 939.6) 에서 끝나 미금 쪽 하도엔 물이 없었다(하상 색만).
//   1) ch: 그 빠진 조각 = build-pangyo 와 같은 규칙(같은 OSM 원본·도로 필터·폭 규칙·박스 자르기·중복 제거)에서 '띠 안이라 버린' 선분만.
//      코리더 base.ch(탄천 구간 도로)와 같은 형식 → 런타임이 base.ch 뒤에 붙여 terrain.annotate(다리 상판·교각·난간, 둔치 길 높이)
//      와 같은 리본 메시(chMesh)로 그린다(메시 +0). 이음: 양끝이 타일 도로의 OSM 노드와 같은 점.
//   2) water: OSM 탄천 수면(relation 9035438, 섬 = inner) ∩ 라이브 축 하도 띠(toeL/toeR, 둔치 끝) ∩ 미금 박스(북쪽은 liveBox z1 939.6 까지 →
//      라이브 수면과 이어짐). 런타임이 tancheon.json water 와 같은 수면 메시(corridorTancheonWater)에 합친다(메시 +0).
//   3) 수위: 라이브 상수(둑·상판 0 · 둔치 −6 · 수면 −6.6 · 하상 −7.6) 그대로 = 낙차 0.
//      근거(DEM, scripts/corridor/dem/sample-migeum-water.py): 미금 박스 축 50m 마다 둑 중앙값 − 수로 최저 중앙값 DEM_RELIEF_MED
//      vs 게임 둑→하상 7.6m — 차이가 DSM 잡음(같은 방법 궁내교 6.1m, PR #14 는 궁내교를 7.6m 일치로 봄) 안이라 낙차를 넣지 않음.
//      돌마교 공개 자료(디지털성남문화대전 GC00100698): 길이 102m · 폭 41.5m · 왕복 8차로 · 중공 PC 슬래브 · 1993. 높이 항목 없음.
//      OSM 다리 선분 길이 102.7m (공개 길이와 일치).
//   4) bank: 라이브 축 단면은 미금 박스에서 기본값(toe 40 · top 54m)이라 돌마교 서쪽 교대(축 +27m)·돌마로 접속부·금곡로가 비탈/둔치에 걸렸다.
//      띠 안 OSM 차도 + 미금 타일 차도(반폭을 축 법선으로 투영)가 있는 축 구간만 오른쪽(구미동) 둑 top 을 그 도로 안쪽으로,
//      toe 는 둔치 길(탄천 자전거도로 등) 바깥까지 유지. 런타임 applyMigeumBank 가 같은 축일 때만 prof 사본에 적용.
//   동막천(OSM 360439341): 미금 박스 안 점 0개(박스 남서쪽 밖, z > 2500 쪽에서 탄천 합류) → 다루지 않음.
//
//   사용: node scripts/corridor/build-migeum-water.mjs [--out=…]   (npm run corridor:migeumwater)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pc from 'polygon-clipping';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CORR = path.join(ROOT, 'public/corridor'), MDIR = path.join(CORR, 'migeum');
const arg = (k, d) => { const a = process.argv.find((v) => v.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(ROOT, arg('out', path.join(MDIR, 'water.json')));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;
const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const proj = (g) => [r1((g.lon - CENTER.lon) * kx), r1(-(g.lat - CENTER.lat) * kz)];
const BOX = { x0: -500, x1: 1000, z0: 1000, z1: 2500 }; // = build-pangyo.mjs MIGEUM_BOX
const OSM_BRIDGE = 186410768, OSM_RIVER = 9035438, OSM_DONGMAK = 360439341;
const PUBLIC_DOLMA = { name: '돌마교', lengthM: 102, widthM: 41.5, lanes: 8, structure: '중공 PC 슬래브', built: 1993, heightM: null, source: '디지털성남문화대전 GC00100698 「돌마교」(https://www.grandculture.net/seongnam/toc/GC00100698)' };
// DEM 단면 (Copernicus GLO-30 DSM) — sample-migeum-water.py 출력 (i 600..1100, 25 축점 = 50m 마다). DSM 이라 나무·건물·다리 섞임(참고값)
const DEM_RELIEF = [15.0, 12.0, 10.8, 7.9, 5.9, 7.8, 8.7, 8.0, 6.6, 6.7, 7.4, 6.6, 10.1, 6.5, 10.9, 11.2, 11.9, 9.6, 10.0, 5.0, 5.8];
const DEM_REF_GUNNAE = 6.1; // 같은 방법 궁내교(i 1977) — PR #14 는 궁내교 게임 7.6m 를 DEM 7~8m 와 일치로 봄
const GAME = { bankToBed: 7.6, WATER: -6.6 };
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const DEM_RELIEF_MED = median(DEM_RELIEF);
const LEVEL_TOL = 1.0; // m — DSM 잡음(궁내교 같은 방법 6.1 vs 7~8). 넘으면 빌드 중단(낙차를 따로 정해야 함)
if (Math.abs(DEM_RELIEF_MED - GAME.bankToBed) > LEVEL_TOL) throw new Error(`DEM 중앙값 ${DEM_RELIEF_MED} vs 게임 ${GAME.bankToBed} — 낙차 필요`);

// ---------- 기하 ----------
function pointInRing(x, z, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); }
const area = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % n]; a += x1 * z2 - x2 * z1; } return a / 2; };
const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
function cleanRing(pts) { const out = []; for (const p of pts) { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); } if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (a[0] === b[0] && a[1] === b[1]) out.pop(); } return out.length >= 3 ? out : null; }
const closeRing = (r) => { const o = r.map((p) => [p[0], p[1]]); const a = o[0], b = o[o.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) o.push([a[0], a[1]]); return o; };
const openRing = (r) => cleanRing(r.map(([x, z]) => [r1(x), r1(z)])) || [];
const key7 = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
function joinRings(segs) { // = build-pangyo.mjs
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

// ---------- 라이브 탄천 축 띠 (build-pangyo.mjs [migeum] STRIP 과 같은 계산) + 하도(둔치 끝 toe) 띠 ----------
const { mergeTancheon } = await import(pathToFileURL(path.join(ROOT, 'src/corridor/tancheon.js')).href);
const T0 = readJSON(path.join(ROOT, 'public/terrain.json'));
const T = mergeTancheon(T0, readJSON(path.join(CORR, 'tancheon.json')));
function band(fL, fR, pad) {
  const ax = T.axis, N = ax.length, left = [], right = [];
  for (let i = 0; i < N; i += 2) {
    const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
    right.push([ax[i][0] + nx * (fR[i] + pad), ax[i][1] + nz * (fR[i] + pad)]);
    left.push([ax[i][0] - nx * (fL[i] + pad), ax[i][1] - nz * (fL[i] + pad)]);
  }
  return pc.union([[closeRing([...right, ...left.reverse()])]]);
}
const STRIP = band(T.prof.topL, T.prof.topR, 0.6);
const TOE = band(T.prof.toeL, T.prof.toeR, 0);
const inStrip = (x, z) => STRIP.some((poly) => pointInRing(x, z, poly[0]) && !poly.slice(1).some((h) => pointInRing(x, z, h)));

// ---------- OSM ----------
const raw = readJSON(path.join(ROOT, 'data/osm_migeum_raw.json'));
const num = (v) => { if (v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const ROAD_W = { motorway: 18, trunk: 18, primary: 16, secondary: 12, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2.2, cycleway: 2.2, path: 2, steps: 2, track: 3, corridor: 2 };
const WALKABLE = new Set(['footway', 'pedestrian', 'path', 'living_street', 'residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'cycleway']);
const TUNNEL_OK = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
// 기존 타일 도로(코리더 + 미금): 같은 자리 중복 제거용 (build-pangyo dupSeg 와 같은 1.0m)
const cIndex = readJSON(path.join(CORR, 'index.json')), mIndex = readJSON(path.join(MDIR, 'index.json'));
const exSegs = [];
const tileRoads = [];
const addTile = (f) => { if (!fs.existsSync(f)) return; for (const r of readJSON(f).r || []) { tileRoads.push(r); } for (const r of readJSON(f).r || []) for (let i = 1; i < r.p.length; i++) exSegs.push([r.p[i - 1][0], r.p[i - 1][1], r.p[i][0], r.p[i][1], r.w]); };
for (const k of Object.keys(mIndex.tiles)) { addTile(path.join(MDIR, 'tiles', k + '.json')); if (cIndex.tiles[k]) addTile(path.join(CORR, 'tiles', k + '.json')); }
const nearEx = (x, z, w) => exSegs.some(([ax, az, bx, bz, ew]) => ew >= w - 2 && segDist(x, z, ax, az, bx, bz) <= 1.0);
function clipOne(B, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]; let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz], q = [a[0] - B.x0, B.x1 - a[0], a[1] - B.z0, B.z1 - a[1]];
  for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return null; continue; } const t = q[i] / p[i]; if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
  return t0 < t1 ? [t0, t1] : null;
}
const lerp = (a, b, t) => [r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t)];
const stat = { ways: 0, segs: 0, dup: 0, kept: 0 };
const ch = [];
for (const e of raw.elements) {
  const t = e.tags || {};
  if (!t.highway || e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
  const P = e.geometry.map(proj);
  let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const underpass = t.tunnel === 'yes' && TUNNEL_OK.has(t.highway) && L <= 400;
  if (t.tunnel && t.tunnel !== 'no' && !underpass) continue;
  if (!underpass && (num(t.layer) < 0 || t.level && num(t.level) < 0)) continue;
  if (['construction', 'proposed', 'platform', 'bus_stop', 'elevator', 'raceway', 'abandoned'].includes(t.highway)) continue;
  if (t.indoor === 'yes' || t.highway === 'corridor' || t.area === 'yes') continue;
  let w = ROAD_W[t.highway] ?? 4; const lanes = num(t.lanes); if (lanes && w >= 6) w = Math.max(w, lanes * 3.2);
  if (t.oneway === 'yes' && lanes) w = Math.max(ROAD_W[t.highway] ? Math.min(w, ROAD_W[t.highway]) : w, lanes * 3.3);
  const br = t.bridge && t.bridge !== 'no' ? 1 : 0;
  let cur = null; const flush = () => { if (cur && cur.length >= 2) { ch.push({ p: cur, w: r1(w), k: t.highway, ...(t.name ? { n: t.name } : {}), ...(br ? { br: 1 } : {}), walk: WALKABLE.has(t.highway) ? 1 : 0, osm: e.id }); } cur = null; };
  let hit = false;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], cl = clipOne(BOX, a, b);
    if (!cl) { flush(); continue; }
    const m = lerp(a, b, (cl[0] + cl[1]) / 2);
    if (!inStrip(m[0], m[1])) { flush(); continue; }
    stat.segs++;
    if (nearEx(a[0], a[1], w) && nearEx(b[0], b[1], w) && nearEx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w)) { stat.dup++; flush(); continue; }
    const A = cl[0] > 0 ? lerp(a, b, cl[0]) : a, B = cl[1] < 1 ? lerp(a, b, cl[1]) : b;
    if (cl[0] > 0) flush();
    if (!cur) cur = [A];
    cur.push(B); stat.kept++; hit = true;
    if (cl[1] < 1) flush();
  }
  flush(); if (hit) stat.ways++;
}
const bridge = ch.filter((r) => r.br);
if (!bridge.some((r) => r.osm === OSM_BRIDGE)) throw new Error('돌마교가 띠 조각에 없음');
const brLen = bridge.filter((r) => r.osm === OSM_BRIDGE).reduce((s, r) => s + r.p.slice(1).reduce((q, p, i) => q + Math.hypot(p[0] - r.p[i][0], p[1] - r.p[i][1]), 0), 0);

// ---------- 둑 위치(오른쪽 둑 = 축 d > 0, 구미동 쪽) ----------
// 라이브 축 단면은 미금 박스에서 기본값(둔치 끝 toe 40m · 둑 top 54m)이다. 그런데 OSM 은 돌마교 서쪽 끝(교대)이 축에서 27m,
// 그 앞 돌마로 접속부·금곡로(둑 위 도로)가 27–54m 에 있다 → 기본 단면이면 다리 끝이 둔치(−6m)에 걸리고 금곡로가 비탈(−1.6~−2.8m)로 내려간다.
// 그래서 띠 안 차도(ch 의 primary/secondary 점, 다리는 양끝 교대)가 있는 축 구간만 그 쪽 둑을 도로 바로 안쪽으로 당긴다:
//   top = min(기본, 도로 중심 d − 0.5)   toe = max(둔치 길(탄천 자전거도로 등 ch 보행·자전거길) 바깥 끝 + 0.5, min(기본 toe, top − 기본 비탈폭))
//   축 ±BANK_WIN 점(±약 30m) 안 근거의 최소/최대 → 앞뒤 BANK_TAPER 점으로 기본값까지 부드럽게. 근거 없는 축 구간·왼쪽 둑은 그대로.
const CAR = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'primary_link', 'secondary_link', 'tertiary_link']);
const FLOODPLAIN = new Set(['footway', 'cycleway', 'path']);
const BANK_WIN = 15, BANK_TAPER = 15, BANK_IDX = [560, 1180];
function axProject(x, z) {
  const ax = T.axis; let best = null;
  for (let i = BANK_IDX[0]; i < Math.min(BANK_IDX[1], ax.length - 1); i++) {
    const [x0, z0] = ax[i], dx = ax[i + 1][0] - x0, dz = ax[i + 1][1] - z0, L2 = dx * dx + dz * dz || 1e-9, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)), dist = Math.hypot(x0 + dx * t - x, z0 + dz * t - z);
    if (!best || dist < best.dist) best = { i: t < 0.5 ? i : i + 1, dist, d: -(dx * (z - z0) - dz * (x - x0)) / L, ux: dx / L, uz: dz / L };
  }
  return best;
}
// 근거 점: 2m 간격 + 그 점의 도로 방향 → 도로 반폭을 축 법선 방향으로 투영(축과 나란한 길 = 반폭 전부, 직각 = 0)
const dens = (p) => { const o = []; for (let i = 1; i < p.length; i++) { const [a, b] = [p[i - 1], p[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 2)); if (L < 0.05) continue; for (let k = 0; k <= n; k++) o.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, (b[0] - a[0]) / L, (b[1] - a[1]) / L]); } return o; };
const inBox = (x, z) => x >= BOX.x0 && x <= BOX.x1 && z >= BOX.z0 && z <= BOX.z1;
const bankEv = { R: [], L: [] }, flEv = { R: [], L: [] };
// 띠 조각(ch) 차도 + 미금 타일 차도(띠 밖이지만 반폭이 둑 안으로 들어오는 길) / 둔치 길 = ch 보행·자전거길
for (const [r, src] of [...ch.map((r) => [r, 'ch']), ...tileRoads.map((r) => [r, 'tile'])]) {
  const car = CAR.has(r.k), fl = src === 'ch' && FLOODPLAIN.has(r.k) && !r.br;
  if ((!car && !fl) || r.p.length < 2) continue;
  const pts = r.br ? [[...r.p[0], 0, 0], [...r.p[r.p.length - 1], 0, 0]] : dens(r.p);
  for (const [x, z, vx, vz] of pts) {
    if (!inBox(x, z)) continue;
    const q = axProject(x, z); if (!q) continue;
    const s = q.d >= 0 ? 'R' : 'L', ad = Math.abs(q.d), hwN = r.br ? 0 : (r.w / 2) * Math.abs(vx * q.ux + vz * q.uz);
    if (car && ad - hwN < T.prof['top' + s][q.i] + 0.6) bankEv[s].push({ i: q.i, d: ad - hwN - 0.5, osm: r.osm ?? null, src });
    if (fl) flEv[s].push({ i: q.i, d: ad + r.w / 2 + 0.5 });
  }
}
const bank = { idx: [], side: {} };
for (const s of ['R', 'L']) {
  if (!bankEv[s].length) continue;
  const top0 = T.prof['top' + s], toe0 = T.prof['toe' + s], w0 = T.prof['w' + s];
  const lo = Math.min(...bankEv[s].map((e) => e.i)) - BANK_WIN - BANK_TAPER, hi = Math.max(...bankEv[s].map((e) => e.i)) + BANK_WIN + BANK_TAPER;
  const raw = [];
  for (let i = lo; i <= hi; i++) {
    const ev = bankEv[s].filter((e) => Math.abs(e.i - i) <= BANK_WIN);
    raw.push(ev.length ? Math.min(top0[i], ...ev.map((e) => e.d)) : top0[i]);
  }
  // 근거 구간 밖 BANK_TAPER 점 동안 기본값으로 (근거 최솟값에서 선형) — 앞뒤 경계에서 단차 없음
  const top = raw.map((v, k) => { let m = v; for (let j = Math.max(0, k - BANK_TAPER); j <= Math.min(raw.length - 1, k + BANK_TAPER); j++) m = Math.min(m, raw[j] + (top0[lo + k] - raw[j]) * (Math.abs(j - k) / BANK_TAPER)); return r1(m); });
  const toe = top.map((tp, k) => {
    const i = lo + k, fl = flEv[s].filter((e) => Math.abs(e.i - i) <= 3).map((e) => e.d);
    let v = Math.min(toe0[i], tp - (top0[i] - toe0[i]));
    v = Math.max(v, w0[i] + 1.7, ...fl);
    return r1(Math.min(v, tp - 2));
  });
  const changed = top.some((v, k) => v !== top0[lo + k]);
  if (changed) bank.side[s] = { from: lo, top, toe, minTop: Math.min(...top), ev: [...new Set(bankEv[s].filter((e) => e.osm != null).map((e) => e.osm))], tilePts: bankEv[s].filter((e) => e.src === 'tile').length };
}
bank.axisN = T0.axis.length; bank.axisAt = Object.values(bank.side).map((b) => T0.axis[b.from]);
if ((T0.stairs || []).some((st) => Object.values(bank.side).some((b) => { const q = axProject(...st.top); return q && q.dist < 80 && q.i >= b.from && q.i < b.from + b.top.length; }))) throw new Error('둑 조정 구간에 라이브 계단이 있음');
if (Object.values(bank.side).some((b) => b.from + b.top.length > T0.axis.length)) throw new Error('둑 조정이 라이브 축 밖');

// ---------- 수면 ----------
const rel = raw.elements.find((e) => e.type === 'relation' && e.id === OSM_RIVER);
const ways = (inner) => rel.members.filter((m) => m.type === 'way' && (m.role === 'inner') === inner && m.geometry?.length).map((m) => m.geometry);
const outers = joinRings(ways(false)).map((r) => cleanRing(r.map(proj))).filter(Boolean);
const inners = joinRings(ways(true)).map((r) => cleanRing(r.map(proj))).filter(Boolean);
const riverMP = outers.map((o) => [closeRing(o), ...inners.filter((h) => pointInRing(...centroid(h), o)).map(closeRing)]);
const LZ1 = cIndex.meta.liveBox.z1; // 라이브 수면 폴리곤 남쪽 끝
const rect = [[[BOX.x0, LZ1], [BOX.x1, LZ1], [BOX.x1, BOX.z1], [BOX.x0, BOX.z1], [BOX.x0, LZ1]]];
const waterMP = pc.intersection(riverMP, TOE, rect);
const water = waterMP.map((poly) => ({ o: openRing(poly[0]), holes: poly.slice(1).map(openRing).filter((h) => h.length >= 3) })).filter((p) => p.o.length >= 3 && Math.abs(area(p.o)) > 1);
const areaOf = (mp) => mp.reduce((s, poly) => s + Math.abs(area(poly[0])) - poly.slice(1).reduce((q, h) => q + Math.abs(area(h)), 0), 0);
const riverInBox = areaOf(pc.intersection(riverMP, rect));
// 동막천: 박스 안 점이 있으면 중단(이 빌드는 다루지 않음)
const dm = raw.elements.find((e) => e.type === 'way' && e.id === OSM_DONGMAK);
const dmIn = dm ? dm.geometry.map(proj).filter(([x, z]) => x >= BOX.x0 && x <= BOX.x1 && z >= BOX.z0 && z <= BOX.z1).length : 0;
if (dmIn) throw new Error(`동막천 점 ${dmIn}개가 미금 박스 안 — 지류 하도를 따로 다뤄야 함`);

const out = {
  meta: {
    generated: new Date().toISOString(), osm_base: raw.osm3s?.timestamp_osm_base || null,
    attribution: '© OpenStreetMap contributors (ODbL) · Copernicus GLO-30 DEM (© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA)',
    note: '미금 박스 안 탄천 띠(#17 마스크)에 빠졌던 OSM 길·다리(ch) + 탄천 수면(water). ?migeumwater=0 / ?migeum=0 이면 미사용. 수위는 라이브 상수 그대로(낙차 0) — DEM 은 참고값',
    box: BOX, waterZ0: LZ1,
    level: { dz: 0, water: GAME.WATER, bankToBed: GAME.bankToBed, demReliefMedian: DEM_RELIEF_MED, demRelief: DEM_RELIEF, demRefGunnae: DEM_REF_GUNNAE, tol: LEVEL_TOL, source: 'scripts/corridor/dem/sample-migeum-water.py (Copernicus GLO-30 DSM cop_N37E127)' },
    dolma: { osm: OSM_BRIDGE, osmLenM: r1(brLen), public: PUBLIC_DOLMA },
    bank: { axisN: bank.axisN, axisAt: bank.axisAt, win: BANK_WIN, taper: BANK_TAPER, sides: Object.fromEntries(Object.entries(bank.side).map(([k, b]) => [k, { from: b.from, n: b.top.length, minTop: b.minTop, evidenceOsm: b.ev, tileEvidencePts: b.tilePts }])) },
    dongmak: { osm: OSM_DONGMAK, pointsInBox: 0, note: '박스 밖 — 다루지 않음' },
    stat: { ...stat, ch: ch.length, water: water.length, waterM2: Math.round(areaOf(waterMP)), riverInBoxM2: Math.round(riverInBox) },
  },
  ch, water, bank: Object.fromEntries(Object.entries(bank.side).map(([k, b]) => [k, { from: b.from, top: b.top, toe: b.toe }])),
};
fs.writeFileSync(OUT, JSON.stringify(out));
const byK = {}; for (const r of ch) byK[r.k + (r.br ? '(다리)' : '')] = (byK[r.k + (r.br ? '(다리)' : '')] || 0) + 1;
console.log(JSON.stringify({ ...out.meta.stat, bank: out.meta.bank.sides, byKind: byK, osmBridgeLen: r1(brLen), demMed: DEM_RELIEF_MED, kb: Math.round(fs.statSync(OUT).size / 1024) }));
