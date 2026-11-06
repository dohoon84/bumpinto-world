// [bp24] 성남시청 길 건너 1층 편의점 → 우리 브랜드 'BUMP24'(예전 BP24, 코드 이름은 bp24 유지) (실제 GS25 자리, 간판/로고는 bumpinto 아이덴티티).
//   ?bp24=1 · ?bump24=1 일 때만. 기본 OFF → 플래그 없으면 월드는 그대로.
//   자리: 코리더 타일 3_-12, 공원 띠(x≈1608~1627) 서쪽 · 큰길(z≈-5778) 북쪽 모퉁이 상가 건물(중심 1601.1,-5752.8 · h17.3).
//   그 건물의 1층(0~GF m)을 비우고(mh=GF 사본 + 충돌용 nr 원본) 유리 상점을 끼운다.
//   draw call (가까이·밤): 외부 불투명 1 + 간판 1 + 유리 1 + 발광 1 + 바닥 빛 1 + 내부 1 + 상품 1 + 직원 2(몸·머리) = 9 (+그림자 1). 낮엔 발광·바닥 빛 0.
//   직원: createAvatar 모양을 정점색으로 굳혀 몸/머리 두 메시(숨쉬기 + 고개 돌리기). 실내 LOD 와 같이 숨음.
//   텍스처: 간판 1024×256 + 상품 512×256 캔버스 2장(≈1.7MB GPU, 밉맵 포함). 내부는 LOD 로 170m 밖에서 숨김.
import * as THREE from 'three';
import { nightFade, onNightTarget } from '../world/nightFade.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createAvatar } from '../entities/avatar.js';

// ?bp24=1 (= ?bump24=1) → 목록(bp24Locations.js BP24_LOCATIONS) · ?bp24=demo → 목록 + 데모 매장(BP24_DEMO) · 그 외 null
export function bp24Mode(search = typeof location !== 'undefined' ? location.search : '') {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const v = p.get('bp24') ?? p.get('bump24'); // [bump24] 새 이름 별칭
  return v === '1' ? 'list' : v === 'demo' ? 'demo' : null;
}
export const bp24Enabled = (search) => !!bp24Mode(search);

export const BP24_DEFAULTS = { gf: 4.4, maxW: 18, maxD: 11, minW: 3.5, minD: 3, matchR: 3 };
const GLASS_H = 3.3, FASCIA_OUT = 0.38;
const TS = 500;
const ROAD_KINDS = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'primary_link', 'secondary_link', 'trunk_link', 'living_street']);
const AXIS = { '-z': [0, -1], '+z': [0, 1], '-x': [-1, 0], '+x': [1, 0] };

const cen = (o) => { let x = 0, z = 0; for (const p of o) { x += p[0]; z += p[1]; } return [x / o.length, z / o.length]; };
export const bp24TileKey = (spec) => `${Math.floor(spec.match.x / TS)}_${Math.floor(spec.match.z / TS)}`;

// 볼록 껍질 → 최소 넓이 회전 사각형(OBB): { c:[x,z], u:[x,z], v:[x,z], hu, hv }
function hull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
export function footprintOBB(ring) {
  const h = hull(ring); let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-3) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], v = [-u[1], u[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of h) { const pu = q[0] * u[0] + q[1] * u[1], pv = q[0] * v[0] + q[1] * v[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area - 1e-6) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      best = { area, c: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv], u, v, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 };
    }
  }
  return best;
}
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); };
function roadDist(roads, x, z) {
  let d = Infinity;
  for (const r of roads || []) { if (!ROAD_KINDS.has(r.k)) continue; for (let i = 1; i < r.p.length; i++) d = Math.min(d, segDist(x, z, r.p[i - 1], r.p[i]) - (r.w || 6) / 2); }
  return d;
}

// 설정 한 줄 + 타일 JSON → 매장 틀(로컬 좌표: x 0..W 앞면 방향, z 0..D 안쪽, 옆 유리는 x=W)
//   spec: { id, name, match:{x,z,r?}, box?:{x0,x1,z0,z1}, front?:'-z'|'+z'|'-x'|'+x', side?: 축 | null(옆 유리 없음) | 'auto'(기본), gf?, maxW?, maxD? }
export function resolveBp24(spec, j) {
  const opt = { ...BP24_DEFAULTS, ...spec };
  const R = spec.match.r || opt.matchR;
  let bi = -1, bd = R;
  (j?.b || []).forEach((b, i) => { if (!b.o?.length || b.nr || b.mh) return; const [x, z] = cen(b.o); const d = Math.hypot(x - spec.match.x, z - spec.match.z); if (d < bd) { bd = d; bi = i; } });
  if (bi < 0) return null;
  const bld = j.b[bi], ring = bld.o;
  if ((bld.h || 0) < opt.gf + 2) return null; // 1층을 비우고도 위층이 남아야 함
  // 사각 틀: box(축 정렬, 직접 지정) 또는 외곽 OBB
  let F;
  if (spec.box) { const { x0, x1, z0, z1 } = spec.box; F = { c: [(x0 + x1) / 2, (z0 + z1) / 2], u: [1, 0], v: [0, 1], hu: (x1 - x0) / 2, hv: (z1 - z0) / 2 }; }
  else F = footprintOBB(ring);
  const sides = [ // 바깥 법선 n, 그 방향 반폭 h, 옆 방향 반폭 w
    { n: F.v, h: F.hv, w: F.hu }, { n: [-F.v[0], -F.v[1]], h: F.hv, w: F.hu },
    { n: F.u, h: F.hu, w: F.hv }, { n: [-F.u[0], -F.u[1]], h: F.hu, w: F.hv },
  ];
  for (const sd of sides) { const mx = F.c[0] + sd.n[0] * sd.h, mz = F.c[1] + sd.n[1] * sd.h; sd.road = Math.min(roadDist(j.r, mx + sd.n[0] * 1.5, mz + sd.n[1] * 1.5), roadDist(j.r, mx, mz)); }
  const pick = (ax) => { const t = AXIS[ax]; return sides.reduce((b, sd) => (sd.n[0] * t[0] + sd.n[1] * t[1] > (b ? b.n[0] * t[0] + b.n[1] * t[1] : -2) ? sd : b), null); };
  const front = spec.front ? pick(spec.front) : sides.reduce((b, sd) => (!b || sd.road < b.road - 0.5 || (Math.abs(sd.road - b.road) <= 0.5 && sd.w > b.w) ? sd : b), null);
  const adj = sides.filter((sd) => Math.abs(sd.n[0] * front.n[0] + sd.n[1] * front.n[1]) < 0.5);
  let side = null;
  if (spec.side && spec.side !== 'auto') side = pick(spec.side);
  else if (spec.side !== null) { const c = adj.reduce((b, sd) => (!b || sd.road < b.road ? sd : b), null); if (c && c.road < 16) side = c; }
  const b = [-front.n[0], -front.n[1]], a = [b[1], -b[0]]; // b: 안쪽, a: 앞면 따라 (a,위,b 오른손)
  const m = side && side.n[0] * a[0] + side.n[1] * a[1] < 0 ? -1 : 1;
  const ax = [a[0] * m, a[1] * m];
  const Wf = front.w * 2, Df = front.h * 2;
  const W = Math.min(Wf, opt.maxW), D = Math.min(Df, opt.maxD);
  if (W < opt.minW || D < opt.minD) return null;
  const shift = side ? Wf - W : (Wf - W) / 2;
  const o = [F.c[0] + front.n[0] * front.h - ax[0] * (front.w - shift), F.c[1] + front.n[1] * front.h - ax[1] * (front.w - shift)];
  const toL = (p) => [(p[0] - o[0]) * ax[0] + (p[1] - o[1]) * ax[1], (p[0] - o[0]) * b[0] + (p[1] - o[1]) * b[1]];
  const mat = new THREE.Matrix4().makeBasis(new THREE.Vector3(ax[0], 0, ax[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0], 0, b[1])).setPosition(o[0], 0, o[1]);
  return { id: spec.id, name: spec.name, bi, W, D, side: !!side, mirror: m < 0, gf: opt.gf, ring: ring.map(toL), mat, o, ax, b, center: [o[0] + ax[0] * W / 2 + b[0] * D / 2, o[1] + ax[1] * W / 2 + b[1] * D / 2] };
}

// 타일 JSON: 매장 건물마다 충돌용(nr) + 위층(mh=gf) 두 개로 나눈다. 원본 객체는 건드리지 않는다.
export function hollowBuildings(j, stores) {
  if (!stores.length) return j;
  const b = j.b.slice();
  for (const st of stores) { const src = j.b[st.bi]; b[st.bi] = { ...src, nr: 1, lm: 'bp24' }; b.push({ ...src, mh: st.gf, lm: 'bp24Upper' }); }
  return { ...j, b };
}

// ---------- 지오메트리 가방 (정점색 + uv, 한 메시로) ----------
const V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
class Bag {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; }
  // n: 바깥 법선, c: 중심, w/h: 크기, col: [r,g,b], uv: [u0,v0,u1,v1]
  quad(n, c, w, h, col, uv = null, up = null) {
    const u = up ? up.clone() : (Math.abs(n.y) > 0.9 ? new THREE.Vector3(0, 0, -n.y) : UP.clone());
    const r = new THREE.Vector3().crossVectors(u, n).normalize().multiplyScalar(w / 2);
    u.normalize().multiplyScalar(h / 2);
    const k = this.p.length / 3;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const [u0, v0, u1, v1] = uv || [0, 0, 0, 0];
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let q = 0; q < 4; q++) {
      V.copy(c).addScaledVector(r, pts[q][0]).addScaledVector(u, pts[q][1]);
      this.p.push(V.x, V.y, V.z); this.n.push(n.x, n.y, n.z); this.c.push(col[0], col[1], col[2]); this.uv.push(uvs[q][0], uvs[q][1]);
    }
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  // 축 정렬 상자. shade: 면별 명암(무광 재질용), skip: 생략할 면 문자열 'xXyYzZ'
  box(x0, y0, z0, x1, y1, z1, col, shade = false, skip = '') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const S = (f) => (shade ? col.map((v) => v * f) : col);
    if (!skip.includes('Y')) this.quad(new THREE.Vector3(0, 1, 0), new THREE.Vector3(cx, y1, cz), sx, sz, S(1));
    if (!skip.includes('y')) this.quad(new THREE.Vector3(0, -1, 0), new THREE.Vector3(cx, y0, cz), sx, sz, S(0.7));
    if (!skip.includes('X')) this.quad(new THREE.Vector3(1, 0, 0), new THREE.Vector3(x1, cy, cz), sz, sy, S(0.86));
    if (!skip.includes('x')) this.quad(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(x0, cy, cz), sz, sy, S(0.8));
    if (!skip.includes('Z')) this.quad(new THREE.Vector3(0, 0, 1), new THREE.Vector3(cx, cy, z1), sx, sy, S(0.9));
    if (!skip.includes('z')) this.quad(new THREE.Vector3(0, 0, -1), new THREE.Vector3(cx, cy, z0), sx, sy, S(0.94));
  }
  // 로컬 → 월드 행렬을 굽는다(거울이면 삼각형 감김을 뒤집음)
  geometry(mat = null, mirror = false) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const idx = this.i.slice(); if (mirror) for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
    g.setIndex(idx);
    if (mat) g.applyMatrix4(mat);
    return g;
  }
  mesh(mat, name) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; return m;
  }
}
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ---------- 캔버스 텍스처 ----------
const LOGO_B = 'M435 265H720C850 265 940 355 940 470C940 535 905 590 858 620C930 650 975 715 975 800C975 920 880 1010 740 1010H445C365 1010 308 950 308 870V390C308 320 360 265 435 265Z';
const LOGO_SEA = 'M300 1040L300 940L332 937C350 915 370 893 386 881C398 873 414 876 417 892C421 912 410 930 414 947C418 962 428 972 440 970C456 968 466 952 470 940C478 916 500 894 532 887C560 881 584 862 582 836C580 818 566 808 558 800C556 790 572 784 592 788C620 792 648 786 663 756C700 756 760 770 800 788C780 806 750 800 722 818C706 830 706 862 728 880C746 892 770 884 790 902C806 922 818 926 836 932C848 940 856 954 862 970L880 1040Z';
function drawLogo(ctx, x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 800, size / 800); ctx.translate(-241.5, -237.5);
  const B = new Path2D(LOGO_B);
  ctx.fillStyle = '#0072DD'; ctx.fill(B);
  ctx.save(); ctx.clip(B);
  ctx.beginPath(); ctx.arc(635, 1131, 413, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#CDE6FB'; ctx.fillRect(200, 700, 900, 400);
  ctx.fillStyle = '#1485E6'; ctx.fill(new Path2D(LOGO_SEA));
  ctx.restore();
  ctx.save(); ctx.clip(B);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 68; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(300, 654); ctx.lineTo(535, 654); ctx.bezierCurveTo(590, 654, 628, 628, 655, 588); ctx.lineTo(723, 472); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(723, 472, 97, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FF3B3B'; ctx.beginPath(); ctx.arc(723, 472, 52, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
const BRAND = ['BUMP', '24']; // [bump24] 간판 브랜드(코드 이름·플래그는 bp24 그대로)
const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Arial Black","Helvetica Neue",Arial,sans-serif';
function signPanel(ctx, x, y, w, h, { brackets = true, sub = true } = {}) {
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#13264a'); g.addColorStop(1, '#0a1630');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // 브랜드: 흰 'BUMP' + 로고 파랑 '24'. 꺾쇠 안쪽 폭(약 72%)에 들어가게 글자·로고 크기를 함께 줄인다
  let fs = Math.round(h * 0.6), ls = Math.round(h * 0.66);
  ctx.font = `900 ${fs}px ${FONT}`; ctx.textBaseline = 'middle';
  let wM = ctx.measureText(BRAND[0]).width, wA = ctx.measureText(BRAND[1]).width;
  const avail = w * (brackets ? 0.72 : 0.86), total0 = ls + h * 0.14 + wM + wA + fs * 0.04;
  if (total0 > avail) { const k = avail / total0; fs = Math.floor(fs * k); ls = Math.floor(ls * k); ctx.font = `900 ${fs}px ${FONT}`; wM = ctx.measureText(BRAND[0]).width; wA = ctx.measureText(BRAND[1]).width; }
  const total = ls + h * 0.14 + wM + wA + fs * 0.04;
  let cx = x + (w - total) / 2;
  drawLogo(ctx, cx, y + (h - ls) / 2, ls); cx += ls + h * 0.14;
  ctx.shadowColor = 'rgba(120,200,255,0.9)'; ctx.shadowBlur = h * 0.12;
  ctx.fillStyle = '#ffffff'; ctx.fillText(BRAND[0], cx, y + h * 0.53); cx += wM + fs * 0.04;
  ctx.fillStyle = '#3aa6ff'; ctx.fillText(BRAND[1], cx, y + h * 0.53);
  ctx.shadowBlur = 0;
  if (brackets) { // 대각선으로 마주 보는 ⌜ ⌟ 꺾쇠 (실제 매장의 위쪽 꺾쇠와 일부러 다르게)
    ctx.strokeStyle = '#38b6ff'; ctx.lineWidth = Math.max(3, h * 0.07); ctx.shadowColor = 'rgba(56,182,255,0.9)'; ctx.shadowBlur = h * 0.1;
    const m = h * 0.2, L = w * 0.09, H = h * 0.42;
    ctx.beginPath(); ctx.moveTo(x + m, y + m + H); ctx.lineTo(x + m, y + m); ctx.lineTo(x + m + L, y + m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - m, y + h - m - H); ctx.lineTo(x + w - m, y + h - m); ctx.lineTo(x + w - m - L, y + h - m); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (sub) { ctx.font = `700 ${Math.round(h * 0.13)}px ${FONT}`; ctx.fillStyle = 'rgba(205,230,251,0.75)'; ctx.textAlign = 'right'; ctx.fillText('bumpinto.world', x + w - h * 0.95, y + h * 0.84); ctx.textAlign = 'left'; }
}
// 간판 아틀라스 1024×256: 앞 띠(0,0,1024,112) · 옆 띠(0,128,512,112) · 돌출 간판(544,120,84,136) · 온장고(640,136,256,72)
const SIGN = { W: 1024, H: 256, front: [0, 0, 1024, 112], side: [0, 128, 512, 112], blade: [544, 120, 84, 136], hot: [640, 136, 256, 72] };
const rectUV = ([x, y, w, h], W, H, pad = 1) => [(x + pad) / W, 1 - (y + h - pad) / H, (x + w - pad) / W, 1 - (y + pad) / H];
function signTexture() {
  const cv = document.createElement('canvas'); cv.width = SIGN.W; cv.height = SIGN.H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a1630'; ctx.fillRect(0, 0, SIGN.W, SIGN.H);
  signPanel(ctx, ...SIGN.front);
  signPanel(ctx, ...SIGN.side, { sub: false });
  { // 돌출 간판: 흰 바탕 + 로고 + 세로로 BUMP / 24
    const [x, y, w, h] = SIGN.blade;
    ctx.fillStyle = '#f4f8fc'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#0072DD'; ctx.fillRect(x, y + h - 6, w, 6);
    const lg = 52; drawLogo(ctx, x + (w - lg) / 2, y + 5, lg);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 24px ${FONT}`; const k = Math.min(1, (w - 10) / ctx.measureText(BRAND[0]).width);
    ctx.font = `900 ${Math.floor(24 * k)}px ${FONT}`; ctx.fillStyle = '#0b1830'; ctx.fillText(BRAND[0], x + w / 2, y + lg + 22);
    ctx.font = `900 30px ${FONT}`; ctx.fillStyle = '#0072DD'; ctx.fillText(BRAND[1], x + w / 2, y + lg + 52);
    ctx.textAlign = 'left';
  }
  { // 온장고 머리판: 'BUMP 치킨' (주황 바탕 + 작은 로고, 흰 글씨에 진한 테두리 — 밝은 바탕에서 흐려 보이지 않게)
    const [x, y, w, h] = SIGN.hot;
    ctx.fillStyle = '#f07a12'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff3e0'; ctx.fillRect(x, y + h - 8, w, 8);
    const lg = h - 22; drawLogo(ctx, x + 6, y + 7, lg);
    const tx = x + lg + 14, room = x + w - 6 - tx, label = `${BRAND[0]} 치킨`;
    let fs = Math.round(h * 0.5); ctx.font = `900 ${fs}px ${FONT}`;
    const tw = ctx.measureText(label).width; if (tw > room) { fs = Math.floor(fs * room / tw); ctx.font = `900 ${fs}px ${FONT}`; }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, fs * 0.16); ctx.strokeStyle = '#7a3300'; ctx.strokeText(label, tx, y + h * 0.44);
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, tx, y + h * 0.44);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// 상품 아틀라스 512×256: 32px 줄 8개 (0~5 과자·라면 봉지, 6~7 음료병)
const PROD = { W: 512, H: 256, row: 32, rows: 8 };
const PACK = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#f06292', '#ffffff', '#6d4c41', '#00897b', '#c62828', '#ffb300', '#3949ab'];
function productTexture() {
  const cv = document.createElement('canvas'); cv.width = PROD.W; cv.height = PROD.H;
  const ctx = cv.getContext('2d');
  let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < PROD.rows; r++) {
    const y = r * PROD.row;
    ctx.fillStyle = '#f3f3f1'; ctx.fillRect(0, y, PROD.W, PROD.row);
    const bottles = r >= 6;
    for (let x = 1; x < PROD.W;) {
      const w = bottles ? 7 + rnd() * 5 : 12 + rnd() * 20, col = PACK[Math.floor(rnd() * PACK.length)];
      const top = bottles ? 4 + rnd() * 6 : 3 + rnd() * 9, ww = Math.min(w - 1.5, PROD.W - x);
      if (bottles) {
        ctx.fillStyle = 'rgba(180,220,235,0.9)'; ctx.fillRect(x + ww * 0.3, y + top - 3, ww * 0.4, 4);
        ctx.fillStyle = col; ctx.fillRect(x, y + top, ww, PROD.row - top - 3);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x, y + top + 8, ww, 6);
      } else {
        ctx.fillStyle = col; ctx.fillRect(x, y + top, ww, PROD.row - top - 3);
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + top + 3 + rnd() * 6, ww - 4, 4 + rnd() * 4);
      }
      x += w;
    }
    ctx.fillStyle = '#d9dde0'; ctx.fillRect(0, y + PROD.row - 3, PROD.W, 3); // 가격표 띠
    ctx.fillStyle = '#ffe14d'; for (let x = 6; x < PROD.W; x += 38 + rnd() * 30) ctx.fillRect(x, y + PROD.row - 3, 9, 3);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- 재질(모듈 공용 캐시 — 타일이 풀려도 유지, 작다) ----------
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const signTex = signTexture(), prodTex = productTexture();
  MAT = {
    ext: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    sign: new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe4f2', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    spill: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    int: new THREE.MeshBasicMaterial({ vertexColors: true }), // 실내는 자체 LED 조명 → 낮/밤 같은 밝기(조명 계산 없음)
    prod: new THREE.MeshBasicMaterial({ map: prodTex, vertexColors: true }),
  };
  return MAT;
}

// ---------- 빌드 ----------
// st: resolveBp24 결과. 로컬 좌표(x 0..W, z 0..D)로 가방들을 채워 돌려준다(행렬은 타일 단위로 구움)
function buildStore(st) {
  const { W, D, gf, side } = st;
  const x0 = 0, x1 = W, zf = 0, zb = D;
  const suv = (r) => { const q = rectUV(r, SIGN.W, SIGN.H); return st.mirror ? [q[2], q[1], q[0], q[3]] : q; }; // 거울 배치면 글자 좌우 되돌림
  const ext = new Bag(), glow = new Bag(), glass = new Bag(), sign = new Bag(), spill = new Bag(), int = new Bag(), prod = new Bag();
  const N = (x, y, z) => new THREE.Vector3(x, y, z), P = (x, y, z) => new THREE.Vector3(x, y, z);
  const STONE = hex('#c9ccd1'), DARK = hex('#2a2f36'), NAVY = hex('#0d1a33'), BLACK = hex('#16181c'), MULL = hex('#3b424b');

  // 1) 1층 바깥 벽: 건물 외곽 중 유리 두 면(남·동)을 뺀 나머지 변을 0~gf 로 막는다
  const ring = st.ring;
  let area = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.2) continue;
    let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; if (area > 0) { nx = -nx; nz = -nz; } // 바깥쪽
    // 유리 면과 겹치는 구간은 빼고 남는 조각만 벽으로(앞면: x 0..W, 옆면: z 0..D)
    const onFront = Math.abs(a[1] - zf) < 0.3 && Math.abs(b[1] - zf) < 0.3;
    const onSide = side && Math.abs(a[0] - x1) < 0.4 && Math.abs(b[0] - x1) < 0.4;
    const cut = onFront ? [0, x0, x1] : onSide ? [1, zf, zb + 0.3] : null;
    const pieces = [];
    if (!cut) pieces.push([0, 1]);
    else {
      const c0 = a[cut[0]], c1 = b[cut[0]], lo = Math.min(c0, c1), hi = Math.max(c0, c1), span = hi - lo || 1;
      const t = (v) => (c0 < c1 ? (v - c0) / span : (c0 - v) / span);
      if (lo < cut[1] - 0.05) pieces.push([t(lo), t(Math.min(hi, cut[1]))]);
      if (hi > cut[2] + 0.05) pieces.push([t(Math.max(lo, cut[2])), t(hi)]);
    }
    for (const [t0, t1] of pieces) {
      const ta = Math.min(t0, t1), tb = Math.max(t0, t1), l = (tb - ta) * L; if (l < 0.1) continue;
      const tm = (ta + tb) / 2, px = a[0] + (b[0] - a[0]) * tm, pz = a[1] + (b[1] - a[1]) * tm;
      ext.quad(N(nx, 0, nz), P(px + nx * 0.02, gf / 2, pz + nz * 0.02), l, gf, STONE);
    }
  }
  // 2) 간판 띠(앞·옆) + 아래 처마, 모퉁이 기둥, 앞면 기둥
  ext.box(x0 - 0.05, GLASS_H, zf - FASCIA_OUT, x1 + FASCIA_OUT, gf, zf + 0.25, NAVY);
  if (side) ext.box(x1 - 0.25, GLASS_H, zf - FASCIA_OUT, x1 + FASCIA_OUT, gf, zb, NAVY);
  ext.box(x0 - 0.05, gf, zf - FASCIA_OUT, x1 + FASCIA_OUT, gf + 0.06, side ? zb : zf + 0.25, DARK, false, 'y'); // 띠 위 마감
  ext.box(x1 - 0.55, 0, zf - 0.25, x1 + 0.2, GLASS_H, zf + 0.5, DARK); // 모퉁이 기둥
  ext.box(x0 - 0.05, 0, zf - 0.12, x0 + 0.45, GLASS_H, zf + 0.3, STONE); // 서쪽 끝 기둥
  ext.box(x0 + 0.45, 0, zf - 0.06, x1 - 0.55, 0.32, zf + 0.06, DARK); // 유리 밑 턱
  if (side) ext.box(x1 - 0.06, 0, zf + 0.5, x1 + 0.06, 0.32, zb, DARK);
  // 유리 + 멀리언
  const fx0 = x0 + 0.45, fx1 = x1 - 0.55;
  glass.quad(N(0, 0, -1), P((fx0 + fx1) / 2, (0.32 + GLASS_H) / 2, zf), fx1 - fx0, GLASS_H - 0.32, [1, 1, 1]);
  if (side) glass.quad(N(1, 0, 0), P(x1, (0.32 + GLASS_H) / 2, (zf + 0.5 + zb) / 2), zb - zf - 0.5, GLASS_H - 0.32, [1, 1, 1]);
  const nF = Math.round((fx1 - fx0) / 1.75);
  for (let k = 1; k < nF; k++) { const x = fx0 + ((fx1 - fx0) * k) / nF; ext.box(x - 0.04, 0.32, zf - 0.05, x + 0.04, GLASS_H, zf + 0.05, MULL); }
  ext.box(fx0, 2.55, zf - 0.05, fx1, 2.62, zf + 0.05, MULL); // 가로대
  if (side) {
    const nS = Math.round((zb - zf - 0.5) / 1.75);
    for (let k = 1; k < nS; k++) { const z = zf + 0.5 + ((zb - zf - 0.5) * k) / nS; ext.box(x1 - 0.05, 0.32, z - 0.04, x1 + 0.05, GLASS_H, z + 0.04, MULL); }
    ext.box(x1 - 0.05, 2.55, zf + 0.5, x1 + 0.05, 2.62, zb, MULL);
  }
  // 출입문(가운데 두 칸): 손잡이
  const dx = fx0 + ((fx1 - fx0) * Math.floor(nF / 2)) / nF;
  ext.box(dx - 0.2, 1.0, zf - 0.09, dx - 0.16, 1.5, zf - 0.05, hex('#c0c6cc'));
  ext.box(dx + 0.16, 1.0, zf - 0.09, dx + 0.2, 1.5, zf - 0.05, hex('#c0c6cc'));
  // 3) 간판 면(캔버스): 앞 9.0×1.0, 옆 4.6×1.0, 돌출 간판(모퉁이 기둥에서 앞으로)
  const sy = (GLASS_H + gf) / 2;
  const fw = Math.min(9.0, W * 0.6), fh = fw / 9.0; // 앞 간판: 폭에 맞춰 줄이되 비율 유지
  sign.quad(N(0, 0, -1), P((x0 + x1) / 2 - (W > 12 ? 0.6 : 0), GLASS_H + (gf - GLASS_H) / 2, zf - FASCIA_OUT - 0.01), fw, Math.min(1.0, fh * 1.0 + 0.0), [1, 1, 1], suv(SIGN.front));
  if (side && D >= 5) { const sw = Math.min(4.6, D * 0.45); sign.quad(N(1, 0, 0), P(x1 + FASCIA_OUT + 0.01, sy, (zf + zb) / 2 + 0.3), sw, sw / 4.6, [1, 1, 1], suv(SIGN.side)); }
  const bx = x1 - 0.17, bz = zf - 0.25 - 0.55, by = 2.45;
  ext.box(bx - 0.07, by - 0.62, bz - 0.5, bx + 0.07, by + 0.62, bz + 0.5, BLACK); // 돌출 간판 틀
  sign.quad(N(1, 0, 0), P(bx + 0.072, by, bz), 0.6, 0.97, [1, 1, 1], suv(SIGN.blade));
  sign.quad(N(-1, 0, 0), P(bx - 0.072, by, bz), 0.6, 0.97, [1, 1, 1], suv(SIGN.blade));
  // 간판 띠 아래 LED 줄(밤)
  glow.box(x0 + 0.3, GLASS_H - 0.05, zf - FASCIA_OUT + 0.02, x1 + 0.1, GLASS_H - 0.01, zf - FASCIA_OUT + 0.08, hex('#bfe6ff'));
  if (side) glow.box(x1 + FASCIA_OUT - 0.08, GLASS_H - 0.05, zf - 0.2, x1 + FASCIA_OUT - 0.02, GLASS_H - 0.01, zb - 0.2, hex('#bfe6ff'));
  // 4) 보도 볼라드(검은 기둥 + 흰 머리) + 낮은 난간
  const bol = [];
  const bxEnd = side ? x1 + 1.2 : x1 - 0.4;
  for (let x = x0 + 0.6; x <= bxEnd; x += 1.9) bol.push([x, zf - 1.7]);
  if (side) for (let z = zf - 1.7 + 1.9; z <= zb + 0.2; z += 1.9) bol.push([x1 + 1.3, z]);
  for (const [x, z] of bol) {
    ext.box(x - 0.09, 0, z - 0.09, x + 0.09, 0.95, z + 0.09, BLACK);
    glow.box(x - 0.08, 0.95, z - 0.08, x + 0.08, 1.07, z + 0.08, hex('#f4f8ff'));
    ext.box(x - 0.1, 1.07, z - 0.1, x + 0.1, 1.12, z + 0.1, BLACK, false, 'y');
  }
  ext.box(x0 + 0.6, 0.68, zf - 1.72, side ? x1 + 1.3 : bol[bol.length - 1][0], 0.72, zf - 1.68, BLACK);
  if (side) ext.box(x1 + 1.28, 0.68, zf - 1.7, x1 + 1.32, 0.72, zb + 0.2, BLACK);
  // 앞 보도 데크(밝은 타일 한 장 — 실제 매장 앞 테라스)
  ext.box(x0, 0, zf - 1.9, side ? x1 + 1.5 : x1, 0.04, zf, hex('#a9a39a'));
  if (side) ext.box(x1, 0, zf - 1.9, x1 + 1.5, 0.04, zb + 0.3, hex('#a9a39a'));
  // 밤 바닥 빛(가산 혼합: 가장자리 검정 = 투명)
  const spillStrip = (ax, az, bxx, bzz, nx, nz, len) => {
    const k = spill.p.length / 3, c0 = [0.2, 0.23, 0.26], c1 = [0, 0, 0];
    const pts = [[ax, az, c0], [bxx, bzz, c0], [bxx + nx * len, bzz + nz * len, c1], [ax + nx * len, az + nz * len, c1]];
    for (const [x, z, c] of pts) { spill.p.push(x, 0.06, z); spill.n.push(0, 1, 0); spill.c.push(...c); spill.uv.push(0, 0); }
    spill.i.push(k, k + 2, k + 1, k, k + 3, k + 2);
  };
  spillStrip(x0 + 0.4, zf - 0.05, x1, zf - 0.05, 0, -1, 4.2);
  if (side) spillStrip(x1 + 0.05, zf, x1 + 0.05, zb, 1, 0, 3.5);

  // 5) 실내 (자체 발광 정점색, LOD 로 멀면 숨김)
  const WH = hex('#f4f5f3'), WALL = hex('#eceeed'), FLOOR = hex('#e3e5e3'), CEIL = hex('#e9ebec'), LED = hex('#ffffff');
  const WIRE = hex('#dfe2e4'), WOOD = hex('#d2b48a'), TEAL = hex('#2aa6a8'), BLUE = hex('#1f6fd1'), FR = hex('#cfd6db');
  const ix0 = x0 + 0.1, ix1 = x1 - 0.1, iz0 = zf + 0.08, iz1 = zb - 0.15, ceil = GLASS_H - 0.05;
  // 바닥 타일(격자: 밝기 교대)
  for (let i = 0, x = ix0; x < ix1 - 0.01; x += 1.2, i++) for (let j = 0, z = iz0; z < iz1 - 0.01; z += 1.2, j++) {
    const xe = Math.min(ix1, x + 1.18), ze = Math.min(iz1, z + 1.18), f = (i + j) % 2 ? 1 : 0.965;
    int.quad(N(0, 1, 0), P((x + xe) / 2, 0.02, (z + ze) / 2), xe - x, ze - z, FLOOR.map((v) => v * f));
  }
  int.quad(N(0, -1, 0), P((ix0 + ix1) / 2, ceil, (iz0 + iz1) / 2), ix1 - ix0, iz1 - iz0, CEIL);
  int.quad(N(0, 0, -1), P((ix0 + ix1) / 2, ceil / 2, iz1), ix1 - ix0, ceil, WALL); // 뒷벽(안쪽 면)
  int.quad(N(1, 0, 0), P(ix0, ceil / 2, (iz0 + iz1) / 2), iz1 - iz0, ceil, WALL.map((v) => v * 0.95)); // 서쪽 벽
  int.quad(N(0, 0, -1), P((ix0 + ix1) / 2, 0.16, iz1 - 0.01), ix1 - ix0, 0.3, hex('#c9cdd0')); // 걸레받이
  // LED 선형 조명(앞뒤 방향 줄 4개)
  const nLed = Math.max(2, Math.round(W / 4));
  for (let k = 0; k < nLed; k++) { const u = 0.5 + (k - (nLed - 1) / 2) * (0.88 / nLed), x = ix0 + (ix1 - ix0) * u; int.box(x - 0.07, ceil - 0.05, iz0 + 0.5, x + 0.07, ceil, iz1 - 0.5, LED, false, 'Y'); }
  const kiosk = W < 9 || D < 6;
  const clerk = kiosk ? kioskLayout() : storeLayout();
  function storeLayout() {
  // 뒷벽 냉장 쇼케이스(청록 머리띠 + 유리문 + 음료), x 3.2 ~ 15.2
  const cz0 = iz1 - 0.75, cxa = ix0 + Math.min(3.2, W * 0.2), cxb = ix1 - 0.4;
  int.box(cxa, 0, cz0, cxb, 2.25, iz1, FR, true, 'Z');
  int.box(cxa, 2.25, cz0 - 0.05, cxb, 2.55, iz1, TEAL, true, 'Z');
  for (let y = 0.35, r = 6; y < 2.1; y += 0.42, r = r === 6 ? 7 : 6) prodFace(prod, N(0, 0, -1), (cxa + cxb) / 2, y + 0.16, cz0 - 0.02, cxb - cxa - 0.1, 0.34, r, cxa * 3 + y);
  for (let x = cxa; x < cxb - 0.1; x += 0.85) int.box(x - 0.03, 0.1, cz0 - 0.06, x + 0.03, 2.2, cz0 - 0.01, hex('#9aa3aa'));
  glass.quad(N(0, 0, -1), P((cxa + cxb) / 2, 1.2, cz0 - 0.07), cxb - cxa, 2.1, [1, 1, 1]);
  // 서쪽 벽 철망 선반(과자)
  if (iz1 - 0.8 - iz0 - 2.6 > 1.2) int.box(ix0, 0, iz0 + 2.6, ix0 + 0.5, 1.9, iz1 - 0.8, WIRE, true);
  if (iz1 - 0.8 - iz0 - 2.6 > 1.2) for (let y = 0.3; y < 1.8; y += 0.38) { int.box(ix0 + 0.5, y - 0.03, iz0 + 2.6, ix0 + 0.55, y, iz1 - 0.8, hex('#b9bec2')); prodFace(prod, N(1, 0, 0), ix0 + 0.52, y + 0.15, (iz0 + 2.6 + iz1 - 0.8) / 2, iz1 - 0.8 - iz0 - 2.6, 0.3, Math.floor(y * 7) % 6, y * 5); }
  // 가운데 곤돌라 3줄(앞뒤 방향, 흰 철망 + 양면 상품) — 계산대 자리를 위해 서쪽으로 1m
  const cxLen = Math.max(2.4, Math.min(3.9, W * 0.25)), cx1 = ix1 - 0.7, cx0 = cx1 - cxLen;
  for (let gu = 4.6; ix0 + gu + 0.34 < cx0 - 1.1 && iz1 - 1.35 - iz0 - 2.0 > 1.2; gu += 2.4) {
    const gx = ix0 + gu, ga = iz0 + 2.0, gb = iz1 - 1.35;
    int.box(gx - 0.32, 0, ga, gx + 0.32, 0.12, gb, hex('#cfd3d6'), true);
    int.box(gx - 0.03, 0.12, ga, gx + 0.03, 1.55, gb, WH, true);
    int.box(gx - 0.34, 1.55, ga - 0.02, gx + 0.34, 1.6, gb + 0.02, WIRE, true);
    for (const s of [-1, 1]) for (let y = 0.3, r = 0; y < 1.5; y += 0.36, r++) {
      int.box(Math.min(gx, gx + s * 0.34), y - 0.025, ga, Math.max(gx, gx + s * 0.34), y, gb, hex('#d4d8db'));
      prodFace(prod, N(s, 0, 0), gx + s * 0.3, y + 0.15, (ga + gb) / 2, gb - ga - 0.05, 0.3, (r + (s > 0 ? 3 : 0) + Math.round(gu)) % 6, gu * 11 + y * 3 + s);
    }
    int.box(gx - 0.34, 0.12, ga - 0.02, gx + 0.34, 1.6, ga, hex('#f0f0ee'), true); // 끝판
    for (let y = 0.35; y < 1.5; y += 0.38) prodFace(prod, N(0, 0, -1), gx, y + 0.12, ga - 0.03, 0.6, 0.26, (Math.round(gu) + Math.round(y * 3)) % 6, gu + y);
  }
  // 앞쪽(문 서쪽) 유리 뚜껑 냉동고 2대
  for (const [a, b] of [[ix0 + 3.9, ix0 + 5.5], [ix0 + 5.65, ix0 + 7.25]]) {
    if (b > Math.min(cx0 - 0.5, dx - 0.4)) continue;
    int.box(a, 0, iz0 + 0.6, b, 0.82, iz0 + 1.4, hex('#e8ecee'), true);
    prodFace(prod, N(0, 1, 0), (a + b) / 2, 0.84, iz0 + 1.0, b - a - 0.12, 0.66, 4, a, N(0, 0, -1));
    glass.quad(N(0, 1, 0), P((a + b) / 2, 0.9, iz0 + 1.0), b - a - 0.05, 0.76, [1, 1, 1], null, N(0, 0, -1));
  }
  // 검은 오픈 음료 냉장고(동쪽 유리 안, 뒤쪽)
  if (D >= 8.5) { const a = ix1 - 1.1, z0 = iz0 + 5.4, z1 = iz0 + 7.0;
    int.box(a, 0, z0, ix1 - 0.2, 1.95, z1, hex('#1b1d20'), true);
    for (let y = 0.4; y < 1.8; y += 0.38) prodFace(prod, N(-1, 0, 0), a - 0.01, y + 0.14, (z0 + z1) / 2, z1 - z0 - 0.16, 0.3, 6 + (Math.round(y * 3) % 2), y * 9); }
  // 왼쪽 앞: 커피 코너(나무 상판 + 커피머신)
  const px0 = ix0 + 0.6, px1 = ix0 + 3.4, pz0 = iz0 + 0.9, pz1 = iz0 + 1.6;
  if (W >= 12) {
  int.box(px0, 0, pz0, px1, 0.95, pz1, hex('#f2f2f0'), true);
  int.box(px0 - 0.05, 0.95, pz0 - 0.05, px1 + 0.05, 1.0, pz1 + 0.05, WOOD, true);
  int.box(px1 - 0.95, 1.0, pz0 + 0.1, px1 - 0.3, 1.6, pz0 + 0.6, hex('#1e2124'), true); // 커피머신
  int.box(px1 - 0.9, 1.38, pz0 + 0.09, px1 - 0.35, 1.52, pz0 + 0.1, hex('#d9a441'));
  int.box(px0 + 0.3, 1.0, pz0 + 0.2, px0 + 0.9, 1.12, pz0 + 0.5, hex('#ffffff'), true); // 컵·뚜껑
  }
  // 계산대(모퉁이 유리 안, 문을 바라봄): 흰 몸통 + 파란 띠 + 밝은 나무 상판
  const cz0c = iz0 + 2.0, cz1c = iz0 + 2.7, top = 1.0;
  int.box(cx0, 0, cz0c, cx1, top - 0.05, cz1c, hex('#f4f4f2'), true);
  int.box(cx0, 0.55, cz0c - 0.012, cx1, 0.63, cz0c, hex('#0072DD')); // 앞면 브랜드 띠
  int.box(cx0, 0, cz0c - 0.01, cx1, 0.1, cz0c, hex('#b9bec2')); // 걸레받이
  int.box(cx0 - 0.06, top - 0.05, cz0c - 0.08, cx1 + 0.06, top, cz1c + 0.06, WOOD, true);
  int.box(cx1 - 0.05, 0, cz1c, cx1 + 0.02, top, cz1c + 1.2, hex('#f4f4f2'), true); // 안쪽 칸막이
  // 온장 진열장(왼쪽 끝): 유리 상자 + 노란 불빛 + 튀김
  const hx0 = cx0 + 0.1, hx1 = cx0 + 1.0;
  if (cxLen >= 3) {
  int.box(hx0, top, cz0c + 0.08, hx1, top + 0.05, cz1c - 0.08, hex('#2a2d31'), true);
  int.box(hx0 + 0.02, top + 0.05, cz0c + 0.12, hx1 - 0.02, top + 0.5, cz1c - 0.1, hex('#ffd27a'), false, 'z');
  for (let k = 0; k < 4; k++) for (const yy of [top + 0.08, top + 0.29]) int.box(hx0 + 0.07 + k * 0.21, yy, cz0c + 0.16, hx0 + 0.24 + k * 0.21, yy + 0.08, cz0c + 0.4, hex(k % 2 ? '#c9781f' : '#e0a040'), true);
  int.box(hx0, top + 0.26, cz0c + 0.12, hx1, top + 0.275, cz1c - 0.1, hex('#d0d4d8'));
  glass.quad(N(0, 0, -1), P((hx0 + hx1) / 2, top + 0.28, cz0c + 0.1), hx1 - hx0, 0.5, [1, 1, 1]);
  int.box(hx0, top + 0.5, cz0c + 0.08, hx1, top + 0.55, cz1c - 0.08, hex('#2a2d31'), true);
  sign.quad(N(0, 0, -1), P((hx0 + hx1) / 2, top + 0.7, cz0c + 0.12), 0.9, 0.25, [1, 1, 1], suv(SIGN.hot)); // BUMP 치킨 머리판
  int.box(hx0 + 0.42, top + 0.55, cz0c + 0.14, hx0 + 0.48, top + 0.6, cz0c + 0.16, hex('#2a2d31'));
  }
  // POS 모니터(직원 쪽) + 손님 쪽 작은 화면 + 카드 단말기 + 라이터 진열대 + 봉투
  const mx = cx0 + Math.min(2.1, cxLen - 1.0);
  const pm = mx - 0.62; // POS 는 직원 왼쪽(밖에서 직원 얼굴이 가리지 않게)
  int.box(pm - 0.05, top, cz1c - 0.3, pm + 0.05, top + 0.2, cz1c - 0.2, hex('#3a3d42'));
  int.box(pm - 0.24, top + 0.18, cz1c - 0.33, pm + 0.24, top + 0.5, cz1c - 0.27, hex('#2a2d31'), true);
  int.box(pm - 0.21, top + 0.21, cz1c - 0.27, pm + 0.21, top + 0.47, cz1c - 0.265, hex('#8fc3f2'));
  int.box(pm - 0.14, top, cz0c + 0.12, pm + 0.14, top + 0.2, cz0c + 0.2, hex('#2a2d31'), true); // 손님 화면
  int.box(pm - 0.12, top + 0.03, cz0c + 0.115, pm + 0.12, top + 0.18, cz0c + 0.12, hex('#3aa6ff'));
  int.box(mx + 0.45, top, cz0c + 0.18, mx + 0.6, top + 0.06, cz0c + 0.36, hex('#1c1e21'), true); // 카드 단말기
  int.box(mx + 0.47, top + 0.06, cz0c + 0.2, mx + 0.58, top + 0.14, cz0c + 0.24, hex('#1c1e21'), true);
  int.box(mx + 0.48, top + 0.09, cz0c + 0.195, mx + 0.57, top + 0.13, cz0c + 0.2, hex('#9fd0a8'));
  if (cxLen >= 3.8) int.box(mx + 0.85, top, cz0c + 0.1, mx + 1.25, top + 0.2, cz0c + 0.3, hex('#e9ecef'), true); // 라이터 진열대
  if (cxLen >= 3.8) prodFace(prod, N(0, 0, -1), mx + 1.05, top + 0.12, cz0c + 0.095, 0.38, 0.14, 7, 41);
  int.box(cx1 - 0.45, top, cz1c - 0.45, cx1 - 0.1, top + 0.08, cz1c - 0.15, hex('#f8f8f6'), true); // 봉투 더미
  // 계산대 뒤 담배·상품 진열 벽(직원 등 뒤)
  int.box(cx0 + 0.6, 0, iz0 + 4.0, cx1, 2.5, iz0 + 4.3, hex('#d9dcdf'), true);
  int.box(cx0 + 0.6, 2.5, iz0 + 3.95, cx1, 2.75, iz0 + 4.3, hex('#0072DD'), true);
  for (let y = 1.15; y < 2.4; y += 0.3) prodFace(prod, N(0, 0, -1), (cx0 + 0.6 + cx1) / 2, y, iz0 + 3.99, cx1 - cx0 - 0.7, 0.24, Math.round(y * 10) % 6, y * 13);
  int.box(cx0 + 0.6, 0, iz0 + 3.6, cx1, 0.9, iz0 + 4.0, hex('#eef0f1'), true); // 아래 수납장
  // 파란 장바구니 더미(문 옆)
  for (let k = 0; k < 2; k++) { const x = dx + 0.7 + k * 0.5; int.box(x, 0, iz0 + 0.3, x + 0.42, 0.45, iz0 + 0.62, BLUE, true); int.box(x - 0.01, 0.43, iz0 + 0.29, x + 0.43, 0.46, iz0 + 0.63, hex('#174f99')); }
  // 직원: 계산대 뒤에 서서 문(남쪽 유리)을 바라봄
  const clerk = { x: mx + 0.05, z: iz0 + 3.25 };
  return clerk;
  }
  function kioskLayout() {
  // 작은 매장(키오스크): 뒤쪽에 계산대 + 직원, 뒷벽 선반, 옆벽 음료 냉장고
  const kz = Math.max(iz0 + 1.2, iz1 - 2.0), kx0 = ix0 + 0.4, kx1 = ix1 - 0.4, top = 1.0;
  int.box(kx0, 0, kz, kx1, top - 0.05, kz + 0.6, hex('#f4f4f2'), true);
  int.box(kx0, 0.55, kz - 0.012, kx1, 0.63, kz, hex('#0072DD'));
  int.box(kx0 - 0.06, top - 0.05, kz - 0.08, kx1 + 0.06, top, kz + 0.66, WOOD, true);
  const km = (kx0 + kx1) / 2;
  int.box(km - 0.75, top, kz + 0.3, km - 0.3, top + 0.42, kz + 0.36, hex('#2a2d31'), true); // POS
  int.box(km - 0.72, top + 0.05, kz + 0.29, km - 0.33, top + 0.39, kz + 0.295, hex('#8fc3f2'));
  int.box(km + 0.5, top, kz + 0.1, km + 0.65, top + 0.06, kz + 0.28, hex('#1c1e21'), true); // 카드 단말기
  if (kx1 - kx0 >= 2.4) {
    int.box(kx0 + 0.1, top, kz + 0.08, kx0 + 0.9, top + 0.5, kz + 0.55, hex('#ffd27a'), true); // 온장고
    glass.quad(N(0, 0, -1), P(kx0 + 0.5, top + 0.25, kz + 0.07), 0.8, 0.5, [1, 1, 1]);
    sign.quad(N(0, 0, -1), P(kx0 + 0.5, top + 0.65, kz + 0.1), 0.8, 0.22, [1, 1, 1], suv(SIGN.hot));
  }
  int.box(ix0 + 0.2, 0, iz1 - 0.35, ix1 - 0.2, 2.4, iz1, hex('#d9dcdf'), true, 'Z'); // 뒷벽 선반
  for (let y = 0.5; y < 2.3; y += 0.32) prodFace(prod, N(0, 0, -1), (ix0 + ix1) / 2, y, iz1 - 0.36, ix1 - ix0 - 0.5, 0.26, Math.round(y * 10) % 8, y * 7);
  if (kz - iz0 > 1.4) { int.box(ix0, 0, iz0 + 0.5, ix0 + 0.6, 1.9, kz - 0.2, hex('#1b1d20'), true); for (let y = 0.4; y < 1.8; y += 0.38) prodFace(prod, N(1, 0, 0), ix0 + 0.61, y + 0.14, (iz0 + 0.5 + kz - 0.2) / 2, kz - 0.7 - iz0, 0.3, 6 + (Math.round(y * 3) % 2), y * 9); }
  return { x: km + 0.05, z: Math.min(kz + 1.15, iz1 - 0.55) };
  }

  return { bags: { ext, sign, glass, glow, spill, int, prod }, clerk };
}

// ---------- 직원(게임 아바타 createAvatar 를 한 번 만들어 정점색 메시 2개로 굳힘: 몸 1 + 머리 1) ----------
let CLERK_SRC = null;
function clerkSource() {
  if (CLERK_SRC) return CLERK_SRC;
  const SHIRT = '#262a31';
  const a = createAvatar({ color: SHIRT, pants: '#22252b', skin: '#eac3a0', hair: 'short', gender: 'm', face: 'round', top: 'long' });
  const rig = a.userData.rig;
  // 조끼(로고 파랑): 몸통보다 살짝 큰 원통 + 앞 가운데 셔츠 띠 + 이름표 + 로고 점
  const add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); rig.add(m); return m; };
  const vest = add(new THREE.CylinderGeometry(0.262, 0.252, 0.6, 12), '#0072DD', 0, 1.06, 0); vest.scale.set(1.08, 1, 1.04);
  add(new THREE.BoxGeometry(0.1, 0.5, 0.03), SHIRT, 0, 1.1, 0.27);
  add(new THREE.BoxGeometry(0.11, 0.05, 0.02), '#f8f9fa', -0.14, 1.2, 0.27); // 이름표
  add(new THREE.BoxGeometry(0.055, 0.055, 0.02), '#ffffff', 0.13, 1.21, 0.268); // 로고 점(흰 바탕 + 빨간 핀)
  add(new THREE.BoxGeometry(0.03, 0.03, 0.02), '#ff3b3b', 0.13, 1.21, 0.275);
  // 팔: 계산대 위로 살짝 내민 자세
  a.userData.armL.rotation.x = -0.55; a.userData.armR.rotation.x = -0.55;
  a.updateMatrixWorld(true);
  const L = new THREE.Vector3(0.35, 0.8, 0.5).normalize(), n = new THREE.Vector3(), col = new THREE.Color();
  const body = [], head = [];
  const visible = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  a.traverse((o) => {
    if (!o.isMesh || !visible(o)) return;
    let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    col.copy(o.material.color);
    const nr = g.attributes.normal, cs = new Float32Array(nr.count * 3);
    for (let i = 0; i < nr.count; i++) { n.fromBufferAttribute(nr, i); const f = 0.62 + 0.42 * Math.max(0, n.dot(L)); cs[i * 3] = col.r * f; cs[i * 3 + 1] = col.g * f; cs[i * 3 + 2] = col.b * f; }
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    g.computeBoundingBox();
    const cy = (g.boundingBox.min.y + g.boundingBox.max.y) / 2;
    (cy > 1.45 ? head : body).push(g);
  });
  a.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial) { o.geometry.dispose(); o.material.dispose(); } }); // 여기서 만든 것만(아바타 공용 지오메트리·재질은 그대로)
  const merge = (list, dy) => { const g = mergeGeometries(list); for (const x of list) x.dispose(); if (dy) g.translate(0, dy, 0); g.computeBoundingSphere(); return g; };
  CLERK_SRC = { body: merge(body, 0), head: merge(head, -1.45) };
  return CLERK_SRC;
}
// 직원 InstancedMesh(몸·머리): 한 타일의 직원 전부 2 draw. base[i] = 직원 i 의 월드 행렬(거울 없음)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function clerkInstances(mat, base) {
  const src = clerkSource();
  const body = new THREE.InstancedMesh(src.body.clone(), mat, base.length); body.name = 'bp24ClerkBody';
  const head = new THREE.InstancedMesh(src.head.clone(), mat, base.length); head.name = 'bp24ClerkHead';
  body.frustumCulled = head.frustumCulled = false;
  const c = { body, head, base, phase: base.map((_, i) => i * 3.7) };
  animateClerks(c, 0);
  return c;
}
// 숨쉬기(몸 0.6% 위아래) + 9초마다 고개를 좌우로 천천히 돌림
function animateClerks(c, t0) {
  for (let i = 0; i < c.base.length; i++) {
    const t = t0 + c.phase[i];
    const br = Math.sin(t * 1.7) * 0.006;
    _s.set(1, 1 + br, 1); _m.compose(_v.set(0, 0, 0), _q.identity(), _s).premultiply(c.base[i]); c.body.setMatrixAt(i, _m);
    const cyc = t % 9, k = cyc < 2 ? 0 : cyc < 3.5 ? (cyc - 2) / 1.5 : cyc < 5.5 ? 1 : cyc < 7 ? 1 - (cyc - 5.5) / 1.5 : 0;
    const side = Math.floor(t / 9) % 2 ? -1 : 1, e = k * k * (3 - 2 * k);
    _q.setFromEuler(_e.set(0.05 * Math.sin(t * 0.6), side * 0.45 * e, 0, 'YXZ'));
    _m.compose(_v.set(0, 1.45 * (1 + br), 0), _q, _s.set(1, 1, 1)).premultiply(c.base[i]); c.head.setMatrixAt(i, _m);
  }
  c.body.instanceMatrix.needsUpdate = true; c.head.instanceMatrix.needsUpdate = true;
}

// 한 타일의 매장들을 재질별로 합친다: 외부 1 + 간판 1 + 유리 1 + 발광 1 + 바닥 빛 1 + 내부 1 + 상품 1 + 직원 2 = 9 (매장 수와 무관)
function buildTileStores(stores) {
  const M = mats();
  const geos = { ext: [], sign: [], glass: [], glow: [], spill: [], int: [], prod: [] }, clerks = [];
  for (const st of stores) {
    const r = buildStore(st);
    for (const k of Object.keys(geos)) { const g = r.bags[k].geometry(st.mat, st.mirror); if (g) geos[k].push(g); }
    const p = new THREE.Vector3(r.clerk.x, 0, r.clerk.z).applyMatrix4(st.mat);
    const face = Math.atan2(-st.b[0], -st.b[1]); // 앞(바깥) 쪽을 봄
    clerks.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face), new THREE.Vector3(1, 1, 1)));
  }
  const mk = (k, mat, name) => { if (!geos[k].length) return null; const g = mergeGeometries(geos[k]); for (const x of geos[k]) x.dispose(); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.name = name; return m; };
  const g = new THREE.Group(); g.name = 'bp24Stores';
  const exM = mk('ext', M.ext, 'bp24Exterior'); exM.castShadow = true; exM.receiveShadow = true; g.add(exM);
  const sgM = mk('sign', M.sign, 'bp24Sign'); g.add(sgM);
  const glM = mk('glass', M.glass, 'bp24Glass'); glM.renderOrder = 2; g.add(glM);
  const gwM = mk('glow', M.glow, 'bp24Glow'); g.add(gwM);
  const spM = mk('spill', M.spill, 'bp24Spill'); spM.renderOrder = 1; g.add(spM);
  // 실내 LOD: 매장들 중심에서 170m(+매장 간 퍼짐) 밖이면 실내·상품·직원을 그리지 않음
  const cx = stores.reduce((s, st) => s + st.center[0], 0) / stores.length, cz = stores.reduce((s, st) => s + st.center[1], 0) / stores.length;
  const spread = stores.reduce((s, st) => Math.max(s, Math.hypot(st.center[0] - cx, st.center[1] - cz)), 0);
  const inner = new THREE.Group(); inner.name = 'bp24Interior';
  inner.add(mk('int', M.int, 'bp24InteriorBody'), mk('prod', M.prod, 'bp24Products'));
  const clerk = clerkInstances(M.int, clerks); inner.add(clerk.body, clerk.head);
  const lod = new THREE.LOD(); lod.name = 'bp24InteriorLod';
  lod.position.set(cx, 1.5, cz);
  inner.position.set(-cx, -1.5, -cz); // 지오메트리는 월드 좌표 그대로
  lod.addLevel(inner, 0); lod.addLevel(new THREE.Object3D(), 170 + spread);
  g.add(lod);
  const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  const tris = [exM, sgM, glM, gwM, spM, inner.children[0], inner.children[1]].reduce((s, m) => s + tri(m), 0) + (tri(clerk.body) + tri(clerk.head)) * clerks.length;
  return { group: g, glow: gwM, spill: spM, clerk, inner, stats: { tris, stores: stores.length } };
}

// 상품 앞면 한 장: 아틀라스 줄 row 중 임의 구간(가로 길이에 비례)
function prodFace(bag, n, x, y, z, w, h, row, seed, up = null) {
  const r = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const span = Math.min(1, w / 5.0), u0 = r * (1 - span);
  const v1 = 1 - (row * PROD.row + 1) / PROD.H, v0 = 1 - ((row + 1) * PROD.row - 1) / PROD.H;
  const f = 0.92 + r * 0.08;
  bag.quad(n, new THREE.Vector3(x, y, z), w, h, [f, f, f], [u0, v0, u0 + span, v1], up);
}

// 코리더 연결: filter(key, j) 에서 그 타일 매장 건물 1층을 비우고, build(key) 에서 매장 그룹(타일 그룹에 붙어 같이 해제)
export function createBp24(locations = []) {
  const byTile = new Map();
  for (const spec of locations) { const k = bp24TileKey(spec); if (!byTile.has(k)) byTile.set(k, []); byTile.get(k).push(spec); }
  const resolved = new Map(), live = new Set();
  let stopNight = null, target = 0;
  const stats = { built: 0, stores: 0, skipped: [] };
  const api = {
    stats, keys: [...byTile.keys()],
    filter(key, j) {
      const specs = byTile.get(key); if (!specs || !j?.b?.length) return j;
      const list = [];
      for (const sp of specs) { const st = resolveBp24(sp, j); if (st) list.push(st); else if (!stats.skipped.includes(sp.id)) stats.skipped.push(sp.id); }
      resolved.set(key, list);
      return hollowBuildings(j, list);
    },
    build(key) {
      const list = resolved.get(key); if (!list?.length) return null;
      if (!stopNight) stopNight = onNightTarget((t) => { target = t; });
      const inst = buildTileStores(list); inst.key = key; inst.list = list;
      live.add(inst); stats.built++; stats.stores = [...live].reduce((s, i) => s + i.list.length, 0); stats.tris = inst.stats.tris;
      apply(inst, nightFade());
      return inst.group;
    },
    update() {
      if (!live.size) return;
      const k = nightFade(), t = performance.now() / 1000;
      for (const inst of live) {
        let o = inst.group; while (o.parent) o = o.parent;
        if (!o.isScene) { live.delete(inst); continue; } // 타일이 풀림
        apply(inst, k);
        if (inst.inner.visible) animateClerks(inst.clerk, t);
      }
    },
    get group() { for (const i of live) return i.group; return null; },
    get stores() { return [...live].flatMap((i) => i.list.map((st) => {
        const door = [st.o[0] + st.ax[0] * st.W / 2 - st.b[0] * 1.15, st.o[1] + st.ax[1] * st.W / 2 - st.b[1] * 1.15];
        const face = Math.atan2(-st.b[0], -st.b[1]); // 문 밖을 바라보는 yaw
        return { id: st.id, name: st.name, W: +st.W.toFixed(1), D: +st.D.toFixed(1), side: st.side, mirror: st.mirror, center: st.center, door, face, ax: st.ax, b: st.b, o: st.o };
      })); },
  };
  return api;
  function apply(inst, k) {
    const on = k > 0.001 || target > 0;
    inst.glow.visible = on; inst.spill.visible = on;
    MAT.glow.color.setScalar(0.25 + 0.95 * k);
    MAT.spill.color.setScalar(k);
    MAT.sign.color.setScalar(0.82 + 0.38 * k);
  }
}

// 단독 사용: 설정(하나 또는 배열) + 타일 JSON → { tile: 1층 비운 JSON, group, stores } (코리더 밖 데모·테스트용)
export function placeBP24(specs, tileJson) {
  const list = (Array.isArray(specs) ? specs : [specs]).map((sp) => resolveBp24(sp, tileJson)).filter(Boolean);
  if (!list.length) return { tile: tileJson, group: null, stores: [] };
  const inst = buildTileStores(list);
  return { tile: hollowBuildings(tileJson, list), group: inst.group, stores: list, update: (t = performance.now() / 1000) => animateClerks(inst.clerk, t) };
}
