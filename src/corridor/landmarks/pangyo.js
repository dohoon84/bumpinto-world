// [pangyo] 판교역 일대 랜드마크 (확장 1단계, 데이터: public/corridor/pangyo/index.json ← scripts/corridor/build-pangyo.mjs)
//   - 현대백화점(일반 매스, 로고·전용 서체·브랜드 색 없음): OSM building:part 높이 그대로 + 띠 장식·쇼윈도·입구 캐노피·'현대백화점' 글자 표지
//   - 알파돔시티 타워 4동: OSM 높이 그대로 유리 커튼월(정자 office 파사드·야간 창 불빛 공유) + 세로 핀·포디움 캐노피·옥상 크라운
//   - 판교역 광장 데크: OSM 외곽(높이 태그 없음 → 2층 높이 5.4–6.4m 로 표현) + 기둥·난간
//   - 지하철 출입구 4곳: OSM 출입구 노드 위치/번호, 방향 = 가까운 보행로. 유리 캐노피 + 노선색 띠 + 번호판
//   모델은 해당 상세 타일이 빌드될 때 그 타일 그룹에 붙고 타일과 함께 해제된다(멀리선 LOD 상자). 재질은 모듈 공유,
//   정점 색으로 합쳐 랜드마크 묶음당 draw 3~6 (+ 야간 발광 1, 낮에는 숨김).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toShape } from '../../world.js';
import { buildingMeshes, vcMat, paint } from '../tileMesh.js';
import { watchEvening } from '../../evening.js';

const LINE_COLOR = { 신분당선: '#d4003b', 경강선: '#0054a6' };
const C = {
  stone: '#d8ccb8', stoneDark: '#bfb29c', reveal: '#a99c86', shopGlass: '#3e5566', cornice: '#efe8dc', canopy: '#5d646e',
  fin: '#dfe6ee', crown: '#eef2f6', mech: '#9aa3ad', podium: '#41586a', deckSide: '#9c9a96', deckTop: '#a8896b', rail: '#c9dbe4', column: '#c3c0ba',
  frame: '#4a525c', plate: '#1d2a44',
};

// ---------- 공유 재질 / 텍스처 (모듈 1회) ----------
let glassMat = null, glowMat = null, signMat = null, plateMat = null;
const glass = () => (glassMat ||= new THREE.MeshLambertMaterial({ color: '#bfe3f0', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
const glow = () => (glowMat ||= new THREE.MeshBasicMaterial({ color: '#ffe3ad' }));
function canvasMat(w, h, draw) {
  if (typeof document === 'undefined') return new THREE.MeshBasicMaterial({ color: '#2f343b' }); // node 테스트
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: tex });
}
// 상호 글자만 쓴 중립 표지 (로고·전용 서체·브랜드 색 없음, 게임 공통 표지 색) — 256×64 한 장
const sign = () => (signMat ||= canvasMat(256, 64, (x) => {
  x.fillStyle = '#2f343b'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#f4efe6'; x.textAlign = 'center'; x.font = 'bold 34px sans-serif'; x.fillText('현대백화점', 128, 38, 236);
  x.font = '13px sans-serif'; x.fillText('HYUNDAI DEPARTMENT STORE', 128, 56, 236);
}));
// 출구 번호판 아틀라스: 1~8 번 (64px 칸)
const PLATE_N = 8;
const plate = () => (plateMat ||= canvasMat(64 * PLATE_N, 64, (x) => {
  for (let i = 0; i < PLATE_N; i++) {
    x.fillStyle = C.plate; x.fillRect(i * 64, 0, 64, 64);
    x.fillStyle = '#f5b800'; x.beginPath(); x.arc(i * 64 + 32, 32, 24, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1d2a44'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText(String(i + 1), i * 64 + 32, 44);
  }
}));

// ---------- 지오메트리 도우미 (정점 색, 비인덱스로 통일해 한 번에 합침) ----------
const flatten = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); if (n.attributes.uv) n.deleteAttribute('uv'); return n; };
function Bag() {
  const list = [];
  return {
    list,
    push(g, color = null) { const f = flatten(g); list.push(color ? paint(f, color) : f); return this; }, // color 없으면 이미 칠한 정점 색 유지
    box(cx, cy, cz, sx, sy, sz, rotY, color) { const g = new THREE.BoxGeometry(sx, sy, sz); if (rotY) g.rotateY(rotY); g.translate(cx, cy, cz); return this.push(g, color); },
    mesh(mat, name) {
      if (!list.length) return null;
      const g = mergeGeometries(list); for (const x of list) x.dispose(); list.length = 0;
      const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = m.receiveShadow = true; return m;
    },
  };
}
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % n]; a += x1 * z2 - x2 * z1; } return a / 2; };
const ringCenter = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
// 링 변 목록: 중점·길이·각도·바깥 법선 (링 방향 무관)
export function edges(ring, minLen = 0.8) {
  const s = Math.sign(ringArea(ring)) || 1, out = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < minLen) continue;
    // ringArea > 0 이면 (dz, -dx)/L 가 바깥 법선 (예: (0,0)→(1,0)→(1,1)→(0,1) 은 면적 +1, 첫 변 법선 (0,-1))
    const nx = (dz / L) * s, nz = (-dx / L) * s;
    out.push({ ax, az, bx, bz, mx: (ax + bx) / 2, mz: (az + bz) / 2, L, ang: Math.atan2(dz, dx), nx, nz });
  }
  return out;
}
// 변마다 얇은 띠(상자): 외벽 장식/난간/쇼윈도
function band(bag, ring, y0, y1, out, depth, color, { minLen = 0.8 } = {}) {
  for (const e of edges(ring, minLen)) {
    bag.box(e.mx + e.nx * out, (y0 + y1) / 2, e.mz + e.nz * out, e.L + depth, y1 - y0, depth, -e.ang, color);
  }
}
function extrude(ring, holes, y0, y1) {
  const g = new THREE.ExtrudeGeometry(toShape(ring, holes || []), { depth: Math.max(0.1, y1 - y0), bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}
// 정점 색: 윗면/아랫면/옆면 다르게
function paintFaces(g, top, side, bottom = side) {
  const n = g.attributes.normal, a = new Float32Array(n.count * 3), ct = new THREE.Color(top), cs = new THREE.Color(side), cb = new THREE.Color(bottom);
  for (let i = 0; i < n.count; i++) { const y = n.getY(i), c = y > 0.5 ? ct : y < -0.5 ? cb : cs; a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const shrink = (ring, k) => { const [cx, cz] = ringCenter(ring); return ring.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]); };
// 오목하지 않은 단순 링에서 '바깥 방향 d 만큼' 근사 확장 (중심 기준 비례) — 캐노피/크라운 용
const grow = (ring, d) => { const r = Math.sqrt(Math.abs(ringArea(ring)) / Math.PI) || 1; return shrink(ring, 1 + d / r); };

// ---------- 백화점 ----------
function buildDept(l, { towards }) {
  const g = new THREE.Group(); g.name = 'pangyoDept';
  const bag = Bag(), lit = Bag();
  const parts = l.parts.slice().sort((a, b) => a.h - b.h);
  for (const p of parts) {
    const y0 = p.mh || 0, h = p.h;
    bag.push(paintFaces(extrude(p.o, p.holes, y0, h), C.stoneDark, C.stone));
    if (y0 < 1) { // 1층 쇼윈도(어두운 유리) + 밤 불빛
      band(bag, p.o, 0.3, 5.2, 0.12, 0.2, C.shopGlass, { minLen: 3 });
      band(lit, p.o, 0.6, 4.8, 0.25, 0.05, '#ffffff', { minLen: 3 });
    }
    for (let y = 9.5; y < h - 2; y += 4.8) band(bag, p.o, y, y + 0.45, 0.18, 0.25, C.reveal, { minLen: 2 }); // 층 띠
    band(bag, p.o, h - 1.3, h + 0.4, 0.35, 0.5, C.cornice, { minLen: 1 }); // 코니스
  }
  // 입구 캐노피: 역 방향(towards)을 보는 1층 변 중 긴 것들
  const tallest = parts[parts.length - 1];
  for (const p of parts) for (const e of edges(p.o, 12)) {
    const tx = towards.x - e.mx, tz = towards.z - e.mz, L = Math.hypot(tx, tz) || 1;
    if ((e.nx * tx + e.nz * tz) / L < 0.6) continue;
    const w = Math.min(e.L * 0.6, 24);
    bag.box(e.mx + e.nx * 2.2, 5.6, e.mz + e.nz * 2.2, w, 0.45, 4.4, -e.ang, C.canopy);
    lit.box(e.mx + e.nx * 2.2, 5.33, e.mz + e.nz * 2.2, w - 1, 0.06, 3.6, -e.ang, '#ffffff');
  }
  // 표지 '현대백화점': 가장 높은 동의 역 쪽 긴 변, 위에서 6m
  let best = null, bs = -Infinity;
  for (const e of edges(tallest.o, 10)) { const tx = towards.x - e.mx, tz = towards.z - e.mz, d = (e.nx * tx + e.nz * tz) / (Math.hypot(tx, tz) || 1); if (d > bs) { bs = d; best = e; } }
  if (best) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), sign()); // 평면 +z 를 바깥 법선 쪽으로(lookAt)
    m.position.set(best.mx + best.nx * 0.5, tallest.h - 6, best.mz + best.nz * 0.5);
    m.lookAt(best.mx + best.nx * 10, tallest.h - 6, best.mz + best.nz * 10);
    m.name = 'pangyoDeptSign'; g.add(m);
  }
  const body = bag.mesh(vcMat(), 'pangyoDeptBody'); if (body) g.add(body);
  const night = lit.mesh(glow(), 'pangyoDeptGlow'); if (night) { night.castShadow = night.receiveShadow = false; g.add(night); }
  return { group: g, night };
}

// ---------- 알파돔시티 타워 ----------
function buildTowers(l, { seed }) {
  const g = new THREE.Group(); g.name = 'pangyoTowers';
  // 벽·지붕은 코리더 타일과 같은 경로(office 파사드 + 야간 창 불빛 셰이더 공유)
  for (const m of buildingMeshes(l.parts.map((p) => ({ o: p.o, holes: p.holes, h: p.h, mh: 0, k: 'office' })), seed)) g.add(m);
  const bag = Bag(), lit = Bag();
  for (const p of l.parts) {
    const h = p.h;
    band(bag, p.o, 0, 7.6, 0.15, 0.2, C.podium, { minLen: 2 }); // 포디움(로비 유리)
    band(lit, p.o, 0.5, 7.0, 0.3, 0.05, '#ffffff', { minLen: 4 });
    // 포디움 캐노피(차양): 근사 확장 링 슬래브
    bag.push(paintFaces(extrude(grow(p.o, 2.2), [], 7.6, 8.1), C.fin, C.fin, C.canopy));
    // 세로 핀: 변을 따라 4.8m 간격
    for (const e of edges(p.o, 4)) {
      const n = Math.floor(e.L / 4.8);
      for (let i = 1; i < n; i++) {
        const t = i / n, x = e.ax + (e.bx - e.ax) * t + e.nx * 0.35, z = e.az + (e.bz - e.az) * t + e.nz * 0.35;
        bag.box(x, (8.1 + h) / 2, z, 0.28, h - 8.1, 0.7, -e.ang, C.fin);
      }
    }
    // 옥상 크라운(난간 벽) + 기계실
    band(bag, p.o, h, h + 3.2, 0.1, 0.35, C.crown, { minLen: 1 });
    band(lit, p.o, h + 2.6, h + 3.0, 0.32, 0.05, '#ffffff', { minLen: 4 });
    bag.push(paintFaces(extrude(shrink(p.o, 0.45), [], h, h + 4.5), '#8d959e', C.mech));
  }
  const body = bag.mesh(vcMat(), 'pangyoTowerDetail'); if (body) g.add(body);
  const night = lit.mesh(glow(), 'pangyoTowerGlow'); if (night) { night.castShadow = night.receiveShadow = false; g.add(night); }
  return { group: g, night };
}

// ---------- 광장 데크 ----------
function buildDeck(l) {
  const g = new THREE.Group(); g.name = 'pangyoDeck';
  const bag = Bag(), lit = Bag();
  for (const p of l.parts) {
    const y0 = p.mh, y1 = p.h; // OSM layer=1, 높이 없음 → 5.4–6.4m (build-pangyo.mjs DECK)
    bag.push(paintFaces(extrude(p.o, p.holes, y0, y1), C.deckTop, C.deckSide, C.deckSide)); // OSM roof:colour 갈색 · building:colour 회색
    // 난간은 데크 가장자리 안쪽: 외곽 링은 바깥 법선 반대(-), 구멍 링은 구멍 바깥(= 데크 쪽, +)
    for (const [r, sd] of [[p.o, -1], ...(p.holes || []).map((h) => [h, 1])]) {
      band(bag, r, y1, y1 + 1.1, 0.15 * sd, 0.08, C.rail, { minLen: 0.8 }); // 유리 난간(불투명 연색 — 투명 정렬 비용 없이)
      band(bag, r, y1 + 1.1, y1 + 1.2, 0.15 * sd, 0.14, '#7d8a94', { minLen: 0.8 }); // 손잡이
      band(lit, r, y0 - 0.06, y0 - 0.02, 0.6 * sd, 0.6, '#ffffff', { minLen: 2 }); // 데크 밑 간접등
    }
    // 기둥: 데크 안쪽 12m 격자 (가장자리 2m 안)
    const xs = p.o.map((q) => q[0]), zs = p.o.map((q) => q[1]);
    const inside = (x, z) => inRing(x, z, p.o) && !(p.holes || []).some((h) => inRing(x, z, h));
    const edgeD = (x, z) => Math.min(...[p.o, ...(p.holes || [])].flatMap((r) => r.map((a, i) => segD(x, z, a, r[(i + 1) % r.length]))));
    for (let x = Math.min(...xs) + 6; x < Math.max(...xs); x += 12) for (let z = Math.min(...zs) + 6; z < Math.max(...zs); z += 12) {
      if (!inside(x, z) || edgeD(x, z) < 2.5) continue;
      const c = new THREE.CylinderGeometry(0.42, 0.42, y0, 10); c.translate(x, y0 / 2, z); bag.push(c, C.column);
    }
  }
  const body = bag.mesh(vcMat(), 'pangyoDeckBody'); if (body) g.add(body);
  const night = lit.mesh(glow(), 'pangyoDeckGlow'); if (night) { night.castShadow = night.receiveShadow = false; g.add(night); }
  return { group: g, night };
}
function inRing(x, z, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }
function segD(px, pz, [ax, az], [bx, bz]) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); }

// ---------- 지하철 출입구 ----------
//   캐노피 3.4 × 7.5m, 길이 방향 = 가까운 보행로 방향(dir). 뒤쪽 벽 + 양옆 유리 + 지붕 유리, 앞 이마에 노선색 띠·번호판
function buildEntrances(l) {
  const g = new THREE.Group(); g.name = 'pangyoEntrances';
  const bag = Bag(), gl = Bag(), lit = Bag();
  const plates = [];
  const lines = l.lines || [];
  for (const e of l.entrances || []) {
    if (e.indoor) continue; // 건물 안 출입구는 건물이 덮음
    const W = 3.4, Lh = 7.5, H = 3.1;
    const ca = Math.cos(e.dir), sa = Math.sin(e.dir);
    const at = (u, v) => [e.x + ca * u - sa * v, e.z + sa * u + ca * v]; // u = 길이(보행로 방향), v = 폭
    const rot = -e.dir;
    for (const [u, v] of [[-Lh / 2, -W / 2], [-Lh / 2, W / 2], [Lh / 2, -W / 2], [Lh / 2, W / 2]]) { const [x, z] = at(u, v); bag.box(x, H / 2, z, 0.16, H, 0.16, rot, C.frame); }
    { const [x, z] = at(0, 0); bag.box(x, H + 0.12, z, Lh + 0.4, 0.24, W + 0.4, rot, C.frame); gl.box(x, H + 0.3, z, Lh, 0.06, W, rot, '#ffffff'); lit.box(x, H - 0.03, z, Lh - 0.6, 0.04, W - 0.8, rot, '#ffffff'); }
    { const [x, z] = at(-Lh / 2, 0); bag.box(x, H / 2, z, 0.2, H, W, rot, C.frame); } // 뒤 벽
    for (const s of [-1, 1]) { const [x, z] = at(0, (s * W) / 2); gl.box(x, H / 2 + 0.2, z, Lh, H - 0.4, 0.05, rot, '#ffffff'); }
    // 앞 이마 띠: 노선색 (신분당선 / 경강선)
    lines.slice(0, 2).forEach((ln, i) => { const [x, z] = at(Lh / 2 + 0.12, 0); bag.box(x, H + 0.55 + i * 0.32, z, 0.12, 0.3, W + 0.4, rot, LINE_COLOR[ln] || '#f5a200'); });
    // 바닥(계단 입구 어둡게)
    { const [x, z] = at(0.3, 0); bag.box(x, 0.06, z, Lh - 1.2, 0.08, W - 0.6, rot, '#3a3f46'); }
    const n = Math.max(1, Math.min(PLATE_N, parseInt(e.ref, 10) || 1));
    plates.push({ x: at(Lh / 2 + 0.2, 0), rot, n, y: H + 1.35 });
  }
  const body = bag.mesh(vcMat(), 'pangyoEntranceFrame'); if (body) g.add(body);
  const gm = gl.mesh(glass(), 'pangyoEntranceGlass'); if (gm) { gm.castShadow = false; gm.renderOrder = 2; g.add(gm); }
  if (plates.length) { // 번호판: 한 장 아틀라스, 한 메시
    const geos = plates.map(({ x: [px, pz], rot, n, y }) => {
      const q = new THREE.PlaneGeometry(1.1, 1.1); const uv = q.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (n - 1 + uv.getX(i)) / PLATE_N);
      q.rotateY(rot + Math.PI / 2); q.translate(px, y, pz); return q;
    });
    const m = new THREE.Mesh(mergeGeometries(geos), plate()); geos.forEach((q) => q.dispose()); m.name = 'pangyoExitPlates'; g.add(m);
  }
  const night = lit.mesh(glow(), 'pangyoEntranceGlow'); if (night) { night.castShadow = night.receiveShadow = false; g.add(night); }
  return { group: g, night };
}

const BUILDERS = { pangyoDept: buildDept, pangyoTowers: buildTowers, pangyoDeck: buildDeck, pangyoEntrances: buildEntrances };
const TS = 500;
const tileKeyOf = (l) => { const p = l.pos || l.entrances?.[0]; return `${Math.floor(p.x / TS)}_${Math.floor(p.z / TS)}`; };

// 판교 랜드마크: 타일 키별로 모아 두었다가 그 타일 상세가 빌드되면 build(key) 가 그룹을 돌려준다(타일 그룹에 붙여 같이 해제)
export function createPangyoLandmarks(pg, { overlay = null } = {}) {
  const byTile = new Map();
  const station = pg?.stations?.[0];
  const towards = station ? { x: station.x, z: station.z } : { x: 0, z: 0 };
  for (const l of pg?.landmarks || []) {
    if (!BUILDERS[l.model]) continue;
    const k = tileKeyOf(l); if (!byTile.has(k)) byTile.set(k, []); byTile.get(k).push(l);
    if (overlay && l.label && l.pos) {
      const icon = l.model === 'pangyoDept' ? '🏬' : l.model === 'pangyoDeck' ? '🚉' : '🏢';
      const y = l.pos.y + (l.model === 'pangyoDeck' ? 6 : 10);
      overlay.add({ cls: 'label landmark', text: `${icon} ${l.label.ko} ${l.label.en}`, getPos: () => new THREE.Vector3(l.pos.x, y, l.pos.z), maxDist: l.model === 'pangyoDeck' ? 400 : 1600, minDist: 25 });
    }
  }
  const nights = new Set(); // 야간 발광 메시 (낮에는 visible=false → draw 0)
  const attached = (o) => { while (o.parent) o = o.parent; return o.isScene; };
  let on = false;
  watchEvening((v) => { on = v; for (const m of nights) { if (!attached(m)) nights.delete(m); else m.visible = v; } });
  const stats = { built: 0 };
  return {
    keys: [...byTile.keys()],
    stats,
    build(key) {
      const list = byTile.get(key); if (!list) return null;
      const g = new THREE.Group(); g.name = 'pangyoLandmarks:' + key;
      for (const l of list) {
        const r = BUILDERS[l.model](l, { towards, seed: 7919 });
        g.add(r.group);
        if (r.night) { r.night.visible = on; nights.add(r.night); }
      }
      stats.built++;
      return g;
    },
  };
}
