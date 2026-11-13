// [myeongdong] 명동대성당 (1898, 고딕 벽돌 성당). OSM way/210335697 외곽선에서 축(제대 → 정면)을 잡아 절차적으로 짓는다.
// [myeongdong-cathedral] 랜드마크 재건: 외곽선 그대로 — 정면으로 튀어나온 종탑(11.5 m 폭) · 5칸 신랑+측랑 · 익랑(장미창 박공) ·
//   주보랑이 도는 둥근 후진. 붉은 벽돌 + 회색 벽돌 띠·모서리 버트레스(층마다 회색 갓) · 첨두 정문(아치 3겹 + 박공) ·
//   장미창 · 시계 · 종루 루버 쌍창 · 네 모서리 소첨탑 · 팔각 첨탑(지붕창 4) + 금 십자가.
//   창은 벽에 덧댄 창틀 + 바깥 유리(스테인드글라스 아틀라스, 밤에 켜짐). 정문은 실제로 뚫려 있고 안(myeongdongCathedralInterior)으로 들어간다.
//   draw: 벽돌 1 · 회색 장식 1 · 지붕/첨탑 1 · 금 1 · 창틀 1 · 바깥 유리 1 (+ 광장)
import * as THREE from 'three';
import { GeoBuf, pointInRing, distToSeg, hex3 } from './myeongdongGeo.js';
import { glassAtlas } from './myeongdongGlass.js';
import { createCathedralInterior } from './myeongdongCathedralInterior.js';

function brickCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6e3426'; g.fillRect(0, 0, 512, 512);
  let s = 23; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bh = 16, bw = 48;
  for (let y = 0; y < 512; y += bh) for (let x = -((y / bh) % 2) * bw / 2; x < 512; x += bw) {
    const l = 31 + r() * 11, h = 8 + r() * 9, grey = r() < 0.05;
    g.fillStyle = grey ? `hsl(30,6%,${46 + r() * 10}%)` : `hsl(${h},${42 + r() * 16}%,${l}%)`; g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
  }
  // 회색 벽돌 줄 (명동성당 특유의 회색 벽돌 띠, 4 m 마다 두 줄)
  for (const y of [240, 256]) for (let x = -(y / bh % 2) * bw / 2; x < 512; x += bw) { g.fillStyle = `hsl(35,5%,${52 + r() * 8}%)`; g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3); }
  return c;
}
function emissiveCanvas(src) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.globalAlpha = 0.3; g.drawImage(src, 0, 0); g.globalAlpha = 1;
  return c;
}
function slateCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f4549'; g.fillRect(0, 0, 256, 256);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 256; y += 16) for (let x = -((y / 16) % 2) * 8; x < 256; x += 16) { g.fillStyle = `hsl(200,6%,${30 + r() * 14}%)`; g.beginPath(); g.moveTo(x + 1, y + 1); g.lineTo(x + 15, y + 1); g.lineTo(x + 15, y + 11); g.quadraticCurveTo(x + 8, y + 17, x + 1, y + 11); g.closePath(); g.fill(); }
  return c;
}
function graniteCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#a9a59e'; g.fillRect(0, 0, 256, 256);
  let s = 41; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
    const l = 70 + r() * 9; g.fillStyle = `hsl(36,${5 + r() * 5}%,${l}%)`; g.fillRect(x + 1.5, y + 1.5, 61, 61);
    for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.06})`; g.fillRect(x + r() * 62, y + r() * 62, 1.5, 1.5); }
  }
  g.fillStyle = 'rgba(120,70,50,.35)'; g.fillRect(0, 124, 256, 8);
  return c;
}
const tex = (c, rep = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
// 밤 가짜 조명 텍스처 (실제 라이트·그림자 없음). 바닥 원형 웅덩이 + 정면 아래에서 올라오는 빛.
function poolCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,232,196,1)'); r.addColorStop(0.35, 'rgba(255,200,130,0.55)');
  r.addColorStop(0.72, 'rgba(255,170,90,0.12)'); r.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return c;
}
function washCanvas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const v = g.createLinearGradient(0, 128, 0, 0); // v=0 바닥이 밝고, 위로 갈수록 사라짐
  v.addColorStop(0, 'rgba(255,220,170,1)'); v.addColorStop(0.4, 'rgba(255,190,130,0.4)'); v.addColorStop(1, 'rgba(255,170,100,0)');
  g.fillStyle = v; g.fillRect(0, 0, 64, 128);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.18, 'rgba(0,0,0,0)'); h.addColorStop(0.82, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 128);
  return c;
}
const nightGlowMat = (map) => new THREE.MeshBasicMaterial({
  map, color: '#ffd9a0', vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
  blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
});

export function createMyeongdongCathedral({ parent, data, land, overlay, atlas = null }) {
  const o = data.cathedral?.o;
  const g = new THREE.Group(); g.name = 'myeongdong-cathedral'; parent.add(g);
  const noop = { setNight() {}, isBlocked: () => false, floorY: () => null, info: null, tickPlayer() {}, camInside: () => false };
  if (!o || o.length < 3 || typeof document === 'undefined') return noop;

  // ---- 축: PCA ----
  let cx = 0, cz = 0; for (const p of o) { cx += p[0]; cz += p[1]; } cx /= o.length; cz /= o.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of o) { const dx = x - cx, dz = z - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let ax = Math.cos(ang), az = Math.sin(ang);
  const proj = (p) => [(p[0] - cx) * ax + (p[1] - cz) * az, -(p[0] - cx) * az + (p[1] - cz) * ax];
  let us = o.map(proj);
  let uMin = Math.min(...us.map((q) => q[0])), uMax = Math.max(...us.map((q) => q[0]));
  // 둥근 쪽(점이 많은 끝) = 후진(제대). 정면은 반대편
  const nearMin = us.filter((q) => q[0] < uMin + 7).length, nearMax = us.filter((q) => q[0] > uMax - 7).length;
  if (nearMin < nearMax) { ax = -ax; az = -az; us = o.map(proj); uMin = Math.min(...us.map((q) => q[0])); uMax = Math.max(...us.map((q) => q[0])); }
  const vs = us.map((q) => q[1]);
  const vMid = (Math.min(...vs) + Math.max(...vs)) / 2;
  const Wd = Math.min(31, Math.max(20, Math.max(...vs) - Math.min(...vs)));
  const W = (u, v) => [cx + ax * u - az * (v + vMid), cz + az * u + ax * (v + vMid)];
  const toUV = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * ax + dz * az, -dx * az + dz * ax - vMid]; };
  let base = -Infinity; for (const [x, z] of o) base = Math.max(base, land.heightAt(x, z));
  base -= 0.2;
  const Y = (y) => base + y;
  const FL = (land.hill?.top ?? base + 0.2) + 0.16; // 실내 바닥(절대 높이) = 광장 포장 높이

  // ---- 평면 (외곽선에서): 후진 끝 uA · 후진 중심 uC · 익랑 끝 uT · 몸채 정면 uBF · 종탑 정면 uF ----
  const uA = uMin, uF = uMax, hw = Wd / 2;
  // 종탑: 외곽선에서 몸채보다 좁게 튀어나온 부분 (없으면 8.4 m)
  const wideU = us.filter((q) => Math.abs(q[1] - vMid) > hw * 0.6).map((q) => q[0]);
  let uBF = wideU.length ? Math.max(...wideU) : uF - 8.4;
  if (uF - uBF < 6 || uF - uBF > 16) uBF = uF - 8.4;
  const towerV = us.filter((q) => q[0] > uBF + 1).map((q) => Math.abs(q[1] - vMid));
  const TWh = Math.min(6.2, Math.max(4.2, towerV.length ? Math.max(...towerV) : 4.2));
  const TW = TWh * 2, tu = (uBF + uF) / 2;
  const uC = uA + hw, uT = uC + 8;
  const NB = Math.max(3, Math.round((uBF - uT) / 5)), BAY = (uBF - uT) / NB;
  const bayU = (i) => uT + BAY * i; // 칸 경계 (i = 0..NB)
  const nHWx = 7.0; // 신랑 바깥 반폭
  const AISLE_H = 10.5, AISLE_ROOF = 13.5, NAVE_H = 19, RIDGE = 25.5, T_H = 28, SP_H = 46.5;
  const AMB_H = 8.6, AMB_ROOF = 11.8, TR_RIDGE = NAVE_H + 4.4 * (RIDGE - NAVE_H) / (nHWx + 0.4);
  const SLOPE_A = (AISLE_ROOF - AISLE_H) / (hw - nHWx);
  const aisleRoofAt = (v) => AISLE_H + (hw - Math.abs(v)) * SLOPE_A;

  const brick = new GeoBuf({ uv: true }), trim = new GeoBuf({ uv: false, color: true }), roof = new GeoBuf({ uv: true, color: true });
  const gold = new GeoBuf({ uv: false }), frames = new GeoBuf({ uv: true }), glass = new GeoBuf({ uv: true });
  const GA = glassAtlas();
  const C_GREY = hex3('#aaa69e'), C_GREY_D = hex3('#8d8981'), C_STONE = hex3('#c3beb3'), C_DARK = hex3('#2a2624'), C_DOOR = hex3('#5a3424'), C_SLATE = [1, 1, 1], C_SPIRE = hex3('#8fa3a0');
  const wn = (nU, nV) => [ax * nU - az * nV, az * nU + ax * nV]; // 축 방향 → 세계 방향
  const rotFor = (nU, nV) => { const [x, z] = wn(nU, nV); return Math.atan2(x, z); }; // box 로컬 +z → (nU,nV)
  const ry0 = rotFor(1, 0);

  /** 평면 벽: a→b (축 좌표) 선 위, 윤곽 [s,y] (s = a 에서 b 쪽 거리 m) + 구멍, 바깥 법선 (nU,nV). 벽돌 uv 4 m */
  function face(buf, a, b, contour, holes, nU, nV, off = 0, uvM = 4, col = null, uvr = null) {
    const pa = W(a[0], a[1]), pb = W(b[0], b[1]);
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1, dx = (pb[0] - pa[0]) / len, dz = (pb[1] - pa[1]) / len;
    const [nx, nz] = wn(nU, nV);
    const C = contour.map(([s, y]) => new THREE.Vector2(s, y));
    if (THREE.ShapeUtils.isClockWise(C)) C.reverse();
    const H = (holes || []).map((h) => { const q = h.map(([s, y]) => new THREE.Vector2(s, y)); if (!THREE.ShapeUtils.isClockWise(q)) q.reverse(); return q; });
    const tris = THREE.ShapeUtils.triangulateShape(C, H);
    const all = C.concat(...H);
    const pos = [], nrm = [], uv = [], idx = [];
    for (const p of all) {
      pos.push(pa[0] + dx * p.x + nx * off, Y(p.y), pa[1] + dz * p.x + nz * off); nrm.push(nx, 0, nz);
      if (uvr) uv.push(uvr[0] + (uvr[2] - uvr[0]) * p.x / len, uvr[1] + (uvr[3] - uvr[1]) * p.y); else uv.push(p.x / uvM, p.y / uvM);
    }
    const flip = (-dz * nx + dx * nz) < 0; // (d × up) 이 바깥과 반대면 감기 뒤집기
    for (const t of tris) if (flip) idx.push(t[0], t[2], t[1]); else idx.push(t[0], t[1], t[2]);
    buf.raw(pos, idx, nrm, buf.uv ? uv : null, col);
  }
  const rectC = (L, y0, y1) => [[0, y0], [L, y0], [L, y1], [0, y1]];
  const dist2 = (a, b) => { const p = W(a[0], a[1]), q = W(b[0], b[1]); return Math.hypot(q[0] - p[0], q[1] - p[1]); };
  /** 직사각 벽 (a→b, y0..y1) */
  const wallR = (buf, a, b, y0, y1, nU, nV, off = 0) => face(buf, a, b, rectC(dist2(a, b), y0, y1), null, nU, nV, off);
  /** 벽에 붙는 창: 중심 (u,v), 바깥 법선 (nU,nV), 폭 w, 아래 y0 위 y1. frameCell/glassCell(+k) */
  function windowAt(u, v, nU, nV, w, y0, y1, glassCell, k, frameCell, fpad = 0.22) {
    const tU = nV, tV = -nU; // 바깥에서 볼 때 왼→오 (거울 글씨 방지)
    const a = [u - tU * (w / 2 + fpad), v - tV * (w / 2 + fpad)], b = [u + tU * (w / 2 + fpad), v + tV * (w / 2 + fpad)];
    if (frameCell) face(frames, a, b, rectC(w + fpad * 2, y0 - fpad * 0.6, y1 + fpad), null, nU, nV, 0.05, 4, null, GA.cell(frameCell));
    const a2 = [u - tU * w / 2, v - tV * w / 2], b2 = [u + tU * w / 2, v + tV * w / 2];
    if (glassCell) face(glass, a2, b2, rectC(w, y0, y1), null, nU, nV, 0.09, 4, null, cellY(GA.cell(glassCell, k), y0, y1));
  }
  // face() 의 uvr 는 v 를 y(m) 로 곱하므로 세로를 (y-y0)/(y1-y0) 로 맞춘 칸 uv 로 바꾼다
  function cellY(c, y0, y1) { const B = (c[3] - c[1]) / (y1 - y0), A = c[1] - B * y0; return [c[0], A, c[2], A + B]; }
  function roundWin(u, v, nU, nV, r, yc, glassCell, k) {
    const tU = nV, tV = -nU;
    face(frames, [u - tU * (r + 0.3), v - tV * (r + 0.3)], [u + tU * (r + 0.3), v + tV * (r + 0.3)], rectC(2 * r + 0.6, yc - r - 0.3, yc + r + 0.3), null, nU, nV, 0.05, 4, null, cellY(GA.cell('frameRose'), yc - r - 0.3, yc + r + 0.3));
    face(glass, [u - tU * r, v - tV * r], [u + tU * r, v + tV * r], rectC(2 * r, yc - r, yc + r), null, nU, nV, 0.09, 4, null, cellY(GA.cell(glassCell, k), yc - r, yc + r));
  }
  /** 회색 띠(돌림띠): a→b 를 따라 높이 y, 두께 h, 튀어나옴 d */
  function band(a, b, y, h, d, nU, nV, col = C_GREY) {
    const pa = W(a[0], a[1]), pb = W(b[0], b[1]); const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const [nx, nz] = wn(nU, nV);
    const mx = (pa[0] + pb[0]) / 2 + nx * d / 2, mz = (pa[1] + pb[1]) / 2 + nz * d / 2;
    trim.box(mx, Y(y), mz, L + d * 2, h, d + 0.02, Math.atan2(nx, nz), undefined, col);
  }
  /** 버트레스: 벽 위 (u,v), 바깥 (nU,nV), 폭 w, 단(높이·깊이) 목록 → 벽돌 몸통 + 회색 경사 갓 */
  function buttress(u, v, nU, nV, w, steps, pinnacle = 0) {
    const ry = rotFor(nU, nV); let y0 = 0;
    for (const [y1, d] of steps) {
      const [x, z] = W(u + nU * d / 2, v + nV * d / 2);
      brick.box(x, Y((y0 + y1) / 2), z, w, y1 - y0, d, ry, [0, 0, w / 4, (y1 - y0) / 4]);
      const [x2, z2] = W(u + nU * (d / 2 + 0.03), v + nV * (d / 2 + 0.03));
      trim.box(x2, Y(y1 - 0.12), z2, w + 0.1, 0.3, d + 0.12, ry, undefined, C_GREY);
      y0 = y1;
    }
    if (pinnacle) {
      const d = steps[steps.length - 1][1], [x, z] = W(u + nU * d / 2, v + nV * d / 2);
      trim.box(x, Y(y0 + pinnacle * 0.25), z, w * 0.6, pinnacle * 0.5, w * 0.6, ry, undefined, C_STONE);
      cone(trim, x, Y(y0 + pinnacle * 0.5), z, w * 0.42, pinnacle * 0.75, 4, ry + Math.PI / 4, C_STONE);
    }
  }
  function cone(buf, x, y, z, r, h, seg, rot, col) {
    const c = new THREE.ConeGeometry(r, h, seg, 1, true); c.rotateY(rot); c.translate(x, y + h / 2, z);
    const ng = c.toNonIndexed(); ng.computeVertexNormals();
    const p = Array.from(ng.attributes.position.array);
    buf.raw(p, p.map((_, k) => k).slice(0, p.length / 3), Array.from(ng.attributes.normal.array), buf.uv ? Array.from(ng.attributes.uv.array) : null, col);
    c.dispose(); ng.dispose();
  }
  function cyl(buf, x, y, z, r0, r1, h, seg, col) {
    const c = new THREE.CylinderGeometry(r1, r0, h, seg, 1, true); c.translate(x, y + h / 2, z);
    buf.raw(Array.from(c.attributes.position.array), Array.from(c.index.array), Array.from(c.attributes.normal.array), buf.uv ? Array.from(c.attributes.uv.array) : null, col);
    c.dispose();
  }
  /** 뾰족 아치 점들 (s = 가로 −r..r, y): 두 원(반지름 1.25r) */
  function pointedArch(r, y0, n = 12) {
    const R = r * 1.25, tm = Math.acos((R - r) / R), L = [];
    for (let k = 0; k <= n; k++) { const t = (k / n) * tm; L.push([(R - r) - R * Math.cos(t), y0 + R * Math.sin(t)]); }
    return L.concat(L.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  }
  /** 첨두 아치 띠 (정문 아치 겹): 정면(u = uFace, +u 바깥) 위 반폭 r, 기둥머리 y0, 튀어나옴 d, 띠 두께 t. 아래 기둥까지 내린다 */
  function archBand(uFace, r, y0, d, t, col) {
    const P = [[-r, 0.2], [-r, y0], ...pointedArch(r, y0).slice(1, -1), [r, y0], [r, 0.2]];
    const Q = (v, y, du) => { const [x, z] = W(uFace + du, v); return [x, Y(y), z]; };
    for (let k = 0; k < P.length - 1; k++) {
      const [s0, y0a] = P[k], [s1, y1a] = P[k + 1];
      const L = Math.hypot(s1 - s0, y1a - y0a) || 1, nx = -(y1a - y0a) / L * t / 2, ny = (s1 - s0) / L * t / 2; // 띠 폭 방향
      const o0 = [s0 - nx, y0a - ny], o1 = [s1 - nx, y1a - ny], i0 = [s0 + nx, y0a + ny], i1 = [s1 + nx, y1a + ny];
      const F = (p) => Q(p[0], p[1], d), B = (p) => Q(p[0], p[1], 0);
      trim.quad(F(o0), F(o1), F(i1), F(i0), undefined, col);
      trim.quad(B(o1), B(o0), F(o0), F(o1), undefined, col); trim.quad(B(i0), B(i1), F(i1), F(i0), undefined, col);
    }
  }

  // ================= 몸채 =================
  // 측랑 옆벽 + 창(칸마다) + 버트레스
  for (const s of [-1, 1]) {
    wallR(brick, [uT, s * hw], [uBF, s * hw], 0, AISLE_H, 0, s);
    band([uT, s * hw], [uBF, s * hw], 1.5, 0.28, 0.18, 0, s);
    band([uT, s * hw], [uBF, s * hw], AISLE_H - 0.1, 0.4, 0.3, 0, s, C_GREY_D);
    for (let i = 0; i < NB; i++) {
      const um = bayU(i + 0.5);
      windowAt(um, s * hw, 0, s, 3.0, 2.1, 8.5, 'pair', i * 2 + (s > 0 ? 1 : 0), 'framePair');
      windowAt(um, s * nHWx, 0, s, 2.6, 14.3, 17.9, 'cler', i, 'framePair', 0.18);
    }
    for (let i = 1; i < NB; i++) buttress(bayU(i), s * hw, 0, s, 1.1, [[6.2, 1.25], [AISLE_H + 0.8, 0.8]], 3.4);
    buttress(uBF - 0.55, s * hw, 0, s, 1.1, [[6.2, 1.25], [AISLE_H + 0.8, 0.8]], 3.4);
    // 고측창 벽 + 처마 돌림띠
    wallR(brick, [uT, s * nHWx], [uBF, s * nHWx], AISLE_ROOF - 0.3, NAVE_H, 0, s);
    band([uC, s * nHWx], [uBF, s * nHWx], NAVE_H - 0.15, 0.45, 0.32, 0, s, C_GREY_D);
    for (let i = 0; i <= NB; i++) { const [x, z] = W(bayU(i), s * (nHWx + 0.25)); brick.box(x, Y((AISLE_ROOF + NAVE_H) / 2), z, 0.7, NAVE_H - AISLE_ROOF, 0.5, ry0, [0, 0, 0.2, 1.4]); }
    // 측랑 지붕 (한쪽 경사)
    const q = [[uT, s * (hw + 0.35), AISLE_H - 0.05], [uBF + 0.3, s * (hw + 0.35), AISLE_H - 0.05], [uBF + 0.3, s * nHWx, AISLE_ROOF], [uT, s * nHWx, AISLE_ROOF]];
    roofQuad(q, s > 0 ? 1 : -1);
  }
  function roofQuad(q, flipHint, col = C_SLATE) {
    const P = q.map(([u, v, y]) => { const [x, z] = W(u, v); return [x, Y(y), z]; });
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const L1 = Math.hypot(...e1), L2 = Math.hypot(...e2);
    const uvr = [0, 0, L1 / 3, L2 / 3];
    if (ny > 0) roof.quad(P[0], P[1], P[2], P[3], uvr, col); else roof.quad(P[1], P[0], P[3], P[2], uvr, col);
    void flipHint;
  }
  function roofTri(a, b, c, col = C_SLATE) {
    const P = [a, b, c].map(([u, v, y]) => { const [x, z] = W(u, v); return [x, Y(y), z]; });
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    let ord = [0, 1, 2]; if (n[1] < 0) { ord = [0, 2, 1]; n = n.map((x) => -x); }
    const L = Math.hypot(...n) || 1; n = n.map((x) => x / L);
    const pos = []; for (const k of ord) pos.push(...P[k]);
    roof.raw(pos, [0, 1, 2], [...n, ...n, ...n], [0, 0, Math.hypot(...e1) / 3, 0, 0, Math.hypot(...e2) / 3], col);
  }
  // 신랑 지붕 (교차부 ~ 정면)
  roofQuad([[uC, -(nHWx + 0.45), NAVE_H - 0.05], [uBF + 0.5, -(nHWx + 0.45), NAVE_H - 0.05], [uBF + 0.5, 0, RIDGE], [uC, 0, RIDGE]]);
  roofQuad([[uC, nHWx + 0.45, NAVE_H - 0.05], [uBF + 0.5, nHWx + 0.45, NAVE_H - 0.05], [uBF + 0.5, 0, RIDGE], [uC, 0, RIDGE]]);
  // 신랑 정면 박공 (탑 양옆으로 보이는 부분)
  face(brick, [uBF, -nHWx], [uBF, nHWx], [[0, AISLE_ROOF], [nHWx * 2, AISLE_ROOF], [nHWx * 2, NAVE_H], [nHWx, RIDGE], [0, NAVE_H]], null, 1, 0);
  // 측랑 정면 (탑 양옆): 작은 문 + 작은 창 + 모서리 버트레스
  for (const s of [-1, 1]) {
    const a = [uBF, s * TWh], b = [uBF, s * hw], L = hw - TWh;
    face(brick, a, b, [[0, 0], [L, 0], [L, AISLE_H], [hw - nHWx > 0 ? L - (hw - nHWx) : L, AISLE_ROOF], [0, AISLE_ROOF]], null, 1, 0);
    const vm = s * (TWh + L * 0.5);
    windowAt(uBF, vm, 1, 0, 1.3, 4.6, 8.9, 'one', s > 0 ? 1 : 0, 'frameOne', 0.2);
    // 옆문 (닫힌 나무문 + 첨두 테)
    face(trim, [uBF, vm - s * 0.9], [uBF, vm + s * 0.9], [[0, 0], [1.8, 0], [1.8, 2.6], [0.9, 3.5], [0, 2.6]], null, 1, 0, 0.06, 4, C_STONE);
    face(trim, [uBF, vm - s * 0.7], [uBF, vm + s * 0.7], [[0, 0], [1.4, 0], [1.4, 2.5], [0.7, 3.2], [0, 2.5]], null, 1, 0, 0.1, 4, C_DOOR);
    band(a, b, 1.5, 0.28, 0.18, 1, 0);
    band(a, b, AISLE_H - 0.1, 0.4, 0.3, 1, 0, C_GREY_D);
    buttress(uBF, s * (hw - 0.55), 1, 0, 1.1, [[5.5, 1.3], [AISLE_H + 0.8, 0.8]], 3.4);
  }

  // ================= 익랑 (교차부 · 장미창 박공) =================
  for (const s of [-1, 1]) {
    const tl = uT - uC; // 8 m
    face(brick, [uC, s * hw], [uT, s * hw], [[0, 0], [tl, 0], [tl, NAVE_H], [tl / 2, TR_RIDGE - 0.3], [0, NAVE_H]], null, 0, s);
    windowAt((uC + uT) / 2, s * hw, 0, s, 3.4, 2.0, 8.6, 'triple', 0, null);
    face(frames, [uC + 2.1, s * hw], [uT - 2.1, s * hw], rectC(tl - 4.2, 1.7, 8.9), null, 0, s, 0.05, 4, null, cellY(GA.cell('framePair'), 1.7, 8.9));
    roundWin((uC + uT) / 2, s * hw, 0, s, 2.7, 13.6, 'rose', s > 0 ? 1 : 0);
    band([uC, s * hw], [uT, s * hw], 1.5, 0.28, 0.18, 0, s);
    band([uC, s * hw], [uT, s * hw], 10.2, 0.32, 0.22, 0, s);
    band([uC, s * hw], [uT, s * hw], NAVE_H - 0.15, 0.45, 0.32, 0, s, C_GREY_D);
    // 박공 끝 금 십자가 + 모서리 버트레스(소첨탑)
    { const [x, z] = W((uC + uT) / 2, s * (hw + 0.1)); gold.box(x, Y(TR_RIDGE + 0.7), z, 0.14, 1.4, 0.14, ry0); gold.box(x, Y(TR_RIDGE + 0.95), z, 0.14, 0.14, 0.8, ry0); }
    for (const u of [uC + 0.55, uT - 0.55]) buttress(u, s * hw, 0, s, 1.1, [[7, 1.3], [14, 0.9], [NAVE_H + 0.5, 0.6]], 4.2);
    // 익랑 옆벽 (측랑 지붕 위 / 주보랑 지붕 위)
    face(brick, [uT, s * nHWx], [uT, s * hw], [[0, AISLE_ROOF], [hw - nHWx, AISLE_H], [hw - nHWx, NAVE_H], [0, NAVE_H]], null, 1, 0);
    face(brick, [uC, s * nHWx], [uC, s * hw], [[0, AMB_ROOF - 0.3], [hw - nHWx, AMB_H - 0.3], [hw - nHWx, NAVE_H], [0, NAVE_H]], null, -1, 0);
    band([uT, s * nHWx], [uT, s * hw], NAVE_H - 0.15, 0.45, 0.32, 1, 0, C_GREY_D);
    band([uC, s * nHWx], [uC, s * hw], NAVE_H - 0.15, 0.45, 0.32, -1, 0, C_GREY_D);
    // 익랑 지붕 (v 방향 용마루)
    const ue0 = uC - 0.4, ue1 = uT + 0.4, um = (uC + uT) / 2;
    roofQuad([[ue0, s * nHWx, NAVE_H - 0.05], [ue0, s * (hw + 0.4), NAVE_H - 0.05], [um, s * (hw + 0.4), TR_RIDGE], [um, s * nHWx, TR_RIDGE]]);
    roofQuad([[ue1, s * nHWx, NAVE_H - 0.05], [ue1, s * (hw + 0.4), NAVE_H - 0.05], [um, s * (hw + 0.4), TR_RIDGE], [um, s * nHWx, TR_RIDGE]]);
  }

  // ================= 후진 (주보랑 + 높은 후진) =================
  const NO = 6, NI = 5;
  const apsePt = (r, k, n) => { const a = Math.PI / 2 + (k / n) * Math.PI; return [uC + Math.cos(a) * r, Math.sin(a) * r]; };
  for (let k = 0; k < NO; k++) {
    const a = apsePt(hw, k, NO), b = apsePt(hw, k + 1, NO), mu = (a[0] + b[0]) / 2 - uC, mv = (a[1] + b[1]) / 2, ml = Math.hypot(mu, mv);
    wallR(brick, a, b, 0, AMB_H, mu / ml, mv / ml);
    band(a, b, 1.5, 0.28, 0.18, mu / ml, mv / ml); band(a, b, AMB_H - 0.1, 0.35, 0.26, mu / ml, mv / ml, C_GREY_D);
    windowAt(uC + mu, mv, mu / ml, mv / ml, 1.3, 2.2, 6.9, 'one', k, 'frameOne', 0.2);
    if (k > 0) { const am = Math.atan2(a[1], a[0] - uC); buttress(a[0], a[1], Math.cos(am), Math.sin(am), 1.0, [[5, 1.2], [AMB_H + 0.6, 0.75]], 2.8); }
  }
  { // 주보랑 지붕: 바깥 hw(AMB_H) → 안 nHWx(AMB_ROOF) 링
    const n = 12;
    for (let k = 0; k < n; k++) {
      const p0 = apsePt(hw + 0.35, k, n), p1 = apsePt(hw + 0.35, k + 1, n), q0 = apsePt(nHWx, k, n), q1 = apsePt(nHWx, k + 1, n);
      roofQuad([[p0[0], p0[1], AMB_H - 0.05], [p1[0], p1[1], AMB_H - 0.05], [q1[0], q1[1], AMB_ROOF], [q0[0], q0[1], AMB_ROOF]]);
    }
  }
  for (let k = 0; k < NI; k++) {
    const a = apsePt(nHWx, k, NI), b = apsePt(nHWx, k + 1, NI), mu = (a[0] + b[0]) / 2 - uC, mv = (a[1] + b[1]) / 2, ml = Math.hypot(mu, mv);
    wallR(brick, a, b, AMB_ROOF - 0.4, NAVE_H, mu / ml, mv / ml);
    band(a, b, NAVE_H - 0.15, 0.45, 0.32, mu / ml, mv / ml, C_GREY_D);
    windowAt(uC + mu, mv, mu / ml, mv / ml, 1.5, 12.4, 17.8, 'apse', k + 1, 'frameOne', 0.2);
    // 후진 지붕 (반 원뿔 → 꼭짓점)
    roofTri([a[0] + (a[0] - uC) * 0.06, a[1] * 1.06, NAVE_H - 0.05], [b[0] + (b[0] - uC) * 0.06, b[1] * 1.06, NAVE_H - 0.05], [uC, 0, RIDGE]);
  }
  { const [x, z] = W(uC - 0.2, 0); gold.box(x, Y(RIDGE + 0.9), z, 0.15, 1.8, 0.15, ry0); gold.box(x, Y(RIDGE + 1.25), z, 0.15, 0.15, 0.9, ry0); }

  // ================= 종탑 =================
  const ST = 19.5, IN = 0.45; // 종루 단 시작 높이 · 들여쌓기
  const DW = 1.6, DH = 4.8; // 정문 반폭·높이 (실제 구멍)
  // 1단(0..ST): 정면은 정문 구멍
  face(brick, [uF, -TWh], [uF, TWh], [[0, 0], [TWh - DW, 0], [TWh - DW, DH], [TWh + DW, DH], [TWh + DW, 0], [TW, 0], [TW, ST], [0, ST]], null, 1, 0);
  for (const s of [-1, 1]) wallR(brick, [uBF, s * TWh], [uF, s * TWh], 0, ST, 0, s);
  wallR(brick, [uBF, -TWh], [uBF, TWh], AISLE_ROOF, T_H, -1, 0);
  // 2단(종루)
  const tw2 = TWh - IN;
  wallR(brick, [uF - IN, -tw2], [uF - IN, tw2], ST, T_H, 1, 0);
  for (const s of [-1, 1]) wallR(brick, [uBF + IN, s * tw2], [uF - IN, s * tw2], ST, T_H, 0, s);
  // 띠: 1단 아래·중간·위, 종루 위 처마
  const ringBand = (y, h, d, inset, col = C_GREY) => {
    const t = TWh - inset;
    band([uF - inset, -t], [uF - inset, t], y, h, d, 1, 0, col);
    for (const s of [-1, 1]) band([uBF + inset, s * t], [uF - inset, s * t], y, h, d, 0, s, col);
  };
  for (const s of [-1, 1]) { band([uF, s * TWh], [uF, s * (DW + 0.9)], 1.5, 0.3, 0.2, 1, 0); band([uBF, s * TWh], [uF, s * TWh], 1.5, 0.3, 0.2, 0, s); }
  ringBand(9.6, 0.32, 0.22, 0); ringBand(ST - 0.1, 0.5, 0.5, 0, C_GREY_D); ringBand(T_H - 0.4, 0.8, 0.45, IN, C_GREY_D);
  // 정문 깊이(벽 두께 0.9 m): 옆·위 안쪽 면
  { const d = 0.9; for (const s of [-1, 1]) { const [x, z] = W(uF - d / 2, s * (DW + 0.06)); trim.box(x, Y(DH / 2), z, 0.12, DH, d, ry0, undefined, C_STONE); }
    const [x, z] = W(uF - d / 2, 0); trim.box(x, Y(DH + 0.06), z, DW * 2 + 0.24, 0.12, d, ry0, undefined, C_STONE); }
  // 정문 아치 3겹 + 팀파눔 + 박공(윔페르그) + 양옆 소첨탑
  for (let i = 0; i < 3; i++) archBand(uF, DW + 0.25 + i * 0.32, DH, 0.12 + i * 0.14, 0.3, i === 1 ? C_GREY_D : C_STONE);
  face(trim, [uF, -DW - 0.1], [uF, DW + 0.1], (() => { const R = (DW + 0.1) * 1.25, r = DW + 0.1, n = 12, P = [[0, DH], [2 * r, DH]]; for (let k = n; k >= 0; k--) { const a = Math.PI - (k / n) * Math.acos((R - r) / R); P.push([2 * r - (R - r + R * Math.cos(a) + r), DH + R * Math.sin(a)]); } return P; })(), null, 1, 0, 0.08, 4, hex3('#b5ae9f'));
  face(trim, [uF, -3.1], [uF, 3.1], [[0, DH + 0.2], [6.2, DH + 0.2], [3.1, DH + 5.6]], null, 1, 0, 0.03, 4, C_STONE);
  face(trim, [uF, -2.7], [uF, 2.7], [[0, DH + 0.4], [5.4, DH + 0.4], [2.7, DH + 5.1]], null, 1, 0, 0.05, 4, C_GREY_D);
  for (const s of [-1, 1]) { const [x, z] = W(uF + 0.4, s * 3.25); trim.box(x, Y(3.4), z, 0.5, 6.8, 0.6, ry0, undefined, C_STONE); cone(trim, x, Y(6.8), z, 0.36, 3.2, 4, ry0 + Math.PI / 4, C_STONE); }
  // 문짝 (안쪽으로 활짝 열린 나무문 2짝)
  for (const s of [-1, 1]) { const hu = uF - 0.9 - 0.75, [x, z] = W(hu, s * (DW - 0.08)); trim.box(x, Y(DH / 2 - 0.05), z, 0.1, DH - 0.1, 1.5, ry0, undefined, C_DOOR); }
  // 장미창 · 시계 · 옆 긴 창
  roundWin(uF, 0, 1, 0, 2.9, 13.4, 'rose', 0);
  face(frames, [uF, -1.2], [uF, 1.2], rectC(2.4, 16.75, 19.15), null, 1, 0, 0.08, 4, null, cellY(GA.cell('clock'), 16.75, 19.15));
  for (const s of [-1, 1]) { windowAt(tu, s * TWh, 0, s, 1.4, 10.6, 17.4, 'one', s > 0 ? 0 : 1, 'frameOne', 0.2); windowAt(tu, s * TWh, 0, s, 1.1, 3.0, 7.6, 'one', 1, 'frameOne', 0.2); }
  // 종루 루버 쌍창 (네 면)
  for (const dv of [-1.15, 1.15]) {
    face(frames, [uF - IN, dv - 0.75], [uF - IN, dv + 0.75], rectC(1.5, 20.6, 26.6), null, 1, 0, 0.05, 4, null, cellY(GA.cell('louver'), 20.6, 26.6));
    face(frames, [uBF + IN, dv - 0.75], [uBF + IN, dv + 0.75], rectC(1.5, 20.6, 26.6), null, -1, 0, 0.05, 4, null, cellY(GA.cell('louver'), 20.6, 26.6));
    for (const s of [-1, 1]) face(frames, [tu + dv - 0.75, s * tw2], [tu + dv + 0.75, s * tw2], rectC(1.5, 20.6, 26.6), null, 0, s, 0.05, 4, null, cellY(GA.cell('louver'), 20.6, 26.6));
  }
  // 모서리 버트레스 (정면·옆 두 방향, 3단) + 소첨탑 4
  for (const [cu, cv] of [[uF, -TWh], [uF, TWh], [uBF, -TWh], [uBF, TWh]]) {
    const su = cu === uF ? 1 : -1, sv = Math.sign(cv);
    if (su > 0) buttress(cu, cv - sv * 0.55, 1, 0, 1.1, [[8, 1.0], [14, 0.7], [ST, 0.42]]);
    buttress(cu - su * 0.55, cv, 0, sv, 1.1, [[8, 1.0], [14, 0.7], [ST, 0.42]]);
    const [x, z] = W(cu - su * (IN + 0.35), cv - sv * (IN + 0.35));
    cyl(trim, x, Y(T_H), z, 0.5, 0.5, 2.4, 8, C_STONE);
    trim.box(x, Y(T_H + 2.5), z, 1.15, 0.22, 1.15, ry0, undefined, C_GREY_D);
    cone(trim, x, Y(T_H + 2.6), z, 0.62, 5.4, 8, Math.PI / 8, C_STONE);
    gold.box(x, Y(T_H + 8.2), z, 0.1, 0.5, 0.1, ry0);
  }
  // 팔각 첨탑 + 지붕창 4 + 모서리 갈빗대
  const tc = W(tu, 0), SR = 3.9;
  {
    const sp = new THREE.ConeGeometry(SR, SP_H - T_H, 8, 6, true);
    sp.rotateY(Math.PI / 8 + ry0); sp.translate(tc[0], Y(T_H + (SP_H - T_H) / 2), tc[1]);
    const ng = sp.toNonIndexed(); ng.computeVertexNormals();
    const p = Array.from(ng.attributes.position.array);
    roof.raw(p, p.map((_, k) => k).slice(0, p.length / 3), Array.from(ng.attributes.normal.array), Array.from(ng.attributes.uv.array).map((v, i) => (i % 2 ? v * 7 : v * 5)), C_SPIRE);
    sp.dispose(); ng.dispose();
    for (let k = 0; k < 8; k++) { // 갈빗대(회색 띠)
      const a = Math.PI / 8 + ry0 + (k / 8) * Math.PI * 2 + Math.PI / 8 * 0; const ex = Math.sin(a) * SR, ez = Math.cos(a) * SR;
      const L = Math.hypot(SR, SP_H - T_H), tilt = Math.atan2(SR, SP_H - T_H);
      const gq = new THREE.BoxGeometry(0.16, L, 0.16); gq.rotateX(-tilt); gq.rotateY(a); gq.translate(tc[0] + ex / 2, Y(T_H + (SP_H - T_H) / 2), tc[1] + ez / 2);
      const n2 = gq.toNonIndexed(); n2.computeVertexNormals(); const pp = Array.from(n2.attributes.position.array);
      trim.raw(pp, pp.map((_, i) => i).slice(0, pp.length / 3), Array.from(n2.attributes.normal.array), null, C_GREY);
      gq.dispose(); n2.dispose();
    }
    trim.box(tc[0], Y(T_H + 0.2), tc[1], tw2 * 2 + 0.3, 0.4, tw2 * 2 + 0.3, ry0, undefined, C_GREY_D);
    // 지붕창(루카른): 네 방향 작은 박공
    for (const [nU, nV] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const du = nU * (SR - 1.0), dv = nV * (SR - 1.0), [x, z] = W(tu + du, dv), ry = rotFor(nU, nV);
      brick.box(x, Y(T_H + 2.2), z, 1.5, 2.6, 1.6, ry, [0, 0, 0.4, 0.6]);
      const fu = tu + nU * (SR - 0.18), fv = nV * (SR - 0.18);
      face(frames, [fu - nV * 0.5, fv + nU * 0.5], [fu + nV * 0.5, fv - nU * 0.5], rectC(1.0, T_H + 1.2, T_H + 3.3), null, nU, nV, 0.02, 4, null, cellY(GA.cell('louver'), T_H + 1.2, T_H + 3.3));
      // 박공 지붕 (두 경사)
      for (const sd of [-1, 1]) {
        const tU = -nV * sd, tV = nU * sd; // 옆 방향
        roofQuad([[tu + nU * (SR - 1.9) + tU * 0.0, nV * (SR - 1.9) + tV * 0.0, T_H + 4.6], [tu + nU * (SR + 0.1), nV * (SR + 0.1), T_H + 4.6], [tu + nU * (SR + 0.1) + tU * 0.95, nV * (SR + 0.1) + tV * 0.95, T_H + 3.4], [tu + nU * (SR - 1.9) + tU * 0.95, nV * (SR - 1.9) + tV * 0.95, T_H + 3.4]], 0, C_SPIRE);
      }
      face(brick, [fu - nV * 0.8, fv + nU * 0.8], [fu + nV * 0.8, fv - nU * 0.8], [[0, T_H + 3.45], [1.6, T_H + 3.45], [0.8, T_H + 4.6]], null, nU, nV, 0.0);
    }
  }
  // 금 십자가 + 공
  gold.box(tc[0], Y(SP_H + 1.7), tc[1], 0.24, 3.4, 0.24, ry0);
  gold.box(tc[0], Y(SP_H + 2.4), tc[1], 0.24, 0.24, 1.7, ry0);
  { const s2 = new THREE.SphereGeometry(0.32, 10, 6); s2.translate(tc[0], Y(SP_H + 0.1), tc[1]); gold.raw(Array.from(s2.attributes.position.array), Array.from(s2.index.array), Array.from(s2.attributes.normal.array)); s2.dispose(); }

  // ---- 재질 ----
  const bc = brickCanvas();
  const brickMat = new THREE.MeshLambertMaterial({ map: tex(bc), emissive: '#ffb070', emissiveMap: tex(emissiveCanvas(bc)), emissiveIntensity: 0 });
  const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffd9a8', emissiveIntensity: 0, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshLambertMaterial({ map: tex(slateCanvas()), vertexColors: true, color: '#8a989c', side: THREE.DoubleSide });
  const goldMat = new THREE.MeshLambertMaterial({ color: '#d9ab4c', emissive: '#ffcf70', emissiveIntensity: 0.18 });
  const glassTex = tex(GA.canvas, false);
  const frameMat = new THREE.MeshLambertMaterial({ map: glassTex, alphaTest: 0.5, emissive: '#ffd9a8', emissiveIntensity: 0 });
  const glassExtMat = new THREE.MeshLambertMaterial({ map: glassTex, alphaTest: 0.5, color: '#6d7484', emissive: '#ffffff', emissiveMap: glassTex, emissiveIntensity: 0.08 });
  const meshes = [];
  for (const [buf, mat, nm, shadow] of [[brick, brickMat, 'brick', true], [trim, trimMat, 'trim', true], [roof, roofMat, 'roof', true], [gold, goldMat, 'gold', false], [frames, frameMat, 'frames', false], [glass, glassExtMat, 'glass', false]]) {
    const geo = buf.build(); if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); m.name = 'myeongdong-cathedral-' + nm; m.castShadow = shadow; m.receiveShadow = shadow;
    g.add(m); meshes.push(m);
  }
  let nightV = 0;

  // ---- [myeongdong-detail] 정면 광장: 화강암 판석 포장 + 앞 계단 + 낮은 담 + 나무·벤치·성모상 + 입구 문(간판) + 등 ----
  //   땅 높이(myeongdongLand hill.plaza)가 광장을 평평하게, 계단 자리를 곧은 경사로 만든다. 여기선 그 위에 덮기만 한다.
  //   draw: 포장 1 · 소품(담·계단·나무·벤치·문) 1 · 간판 1 · 등 1 · 밤 바닥 웅덩이 1 · 정면 업라이트 1
  const PL = land.hill?.plaza, F = land.hill?.frame;
  const blockers = []; // 축 좌표 사각형 { u0, u1, v0, v1 }
  let lampMat = null, signMat = null, plazaMat = null, poolMat = null, washMat = null, poolMesh = null, washMesh = null;
  if (PL && F) {
    const top = land.hill.top;
    const H = (u, v) => { const [x, z] = F.W(u, v); return land.heightAt(x, z); };
    const P3 = (u, v, y) => { const [x, z] = F.W(u, v); return [x, y, z]; };
    const ry = Math.atan2(F.ax, F.az); // box 로컬 +z → 축 +u
    // 포장: 2 m 격자를 광장 사각형 + 앞 경사로
    {
      const pos = [], nrm = [], uv = [], idx = [];
      const uE = PL.u1 + PL.stairRun + 3; // 계단 양옆 경사면도 포장(오르막 진입로)
      const nu = Math.ceil((uE - PL.u0) / 2), nv = Math.ceil((PL.v1 - PL.v0) / 2);
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = PL.u0 + (uE - PL.u0) * i / nu, v = PL.v0 + (PL.v1 - PL.v0) * j / nv;
        const [x, z] = F.W(u, v);
        pos.push(x, land.heightAt(x, z) + 0.16, z); nrm.push(0, 1, 0); uv.push((u - PL.u0) / 6, (v - PL.v0) / 6);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a0 = j * (nu + 1) + i, b0 = a0 + 1, c0 = a0 + nu + 1, d0 = c0 + 1; idx.push(a0, b0, c0, b0, d0, c0); }
      // 앞면이 위(+y)를 보게 감기 순서 확인
      const t0 = [pos[0], pos[2]], t1 = [pos[3], pos[5]], t2 = [pos[(nu + 1) * 3], pos[(nu + 1) * 3 + 2]];
      const up = (t1[1] - t0[1]) * (t2[0] - t0[0]) - (t1[0] - t0[0]) * (t2[1] - t0[1]);
      if (up < 0) for (let k = 0; k < idx.length; k += 3) { const tmp = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tmp; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeBoundingSphere();
      plazaMat = new THREE.MeshLambertMaterial({ map: tex(graniteCanvas()), emissive: '#ffd9a0', emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const pm = new THREE.Mesh(geo, plazaMat);
      pm.name = 'myeongdong-cathedral-plaza'; pm.receiveShadow = true; g.add(pm); meshes.push(pm);
    }
    const props = new GeoBuf({ uv: false, color: true });
    const stoneC = hex3('#b9b4aa'), stoneD = hex3('#9d988e'), brickC = hex3('#7d3d2b'), capC = hex3('#c8c2b6'), ironC = hex3('#2b2d31');
    const pbox = (u, v, y, su, sy, sv, col) => { const [x, z] = F.W(u, v); props.box(x, y, z, sv, sy, su, ry, undefined, col); };
    // 앞 계단 (u1 → u1+run, 폭 sv0..sv1): 디딤판 + 챌판, 양옆 돌난간
    const yTop = top, yBot = H(PL.u1 + PL.stairRun + 0.5, (PL.sv0 + PL.sv1) / 2);
    const N = Math.max(8, Math.round((yTop - yBot) / 0.17)), run = PL.stairRun / N, rise = (yTop - yBot) / N;
    const sw = PL.sv1 - PL.sv0, sc = (PL.sv0 + PL.sv1) / 2;
    for (let k = 0; k < N; k++) {
      const u = PL.u1 + run * (k + 0.5), yT = yTop - rise * (k + 1) + 0.12;
      pbox(u, sc, yT - 0.25, run + 0.02, 0.5, sw, k % 2 ? stoneC : stoneD);
      for (const sv of [PL.sv0 - 0.25, PL.sv1 + 0.25]) pbox(u, sv, yT + 0.2, run + 0.02, 1.4, 0.5, capC);
    }
    for (const sv of [PL.sv0 - 0.25, PL.sv1 + 0.25]) blockers.push({ u0: PL.u1, u1: PL.u1 + PL.stairRun, v0: sv - 0.3, v1: sv + 0.3 });
    // 앞 낮은 담(벽돌 + 돌 갓) — 계단 자리만 비운다. 왼쪽(v0) 옆은 비탈길(OSM service)이라 연다
    const wallRun = (v0, v1) => {
      if (v1 - v0 < 0.5) return;
      const vc = (v0 + v1) / 2, y = H(PL.u1 - 0.3, vc);
      pbox(PL.u1 - 0.3, vc, y + 0.3, 0.45, 0.8, v1 - v0, brickC);
      pbox(PL.u1 - 0.3, vc, y + 0.74, 0.55, 0.08, v1 - v0 + 0.05, capC);
      blockers.push({ u0: PL.u1 - 0.6, u1: PL.u1, v0, v1 });
    };
    wallRun(PL.v0, PL.sv0 - 0.5); wallRun(PL.sv1 + 0.5, PL.v1);
    // 오른쪽 담(건물 쪽)
    { const uc = (PL.u0 + 6 + PL.u1) / 2, L = PL.u1 - PL.u0 - 6, y = H(uc, PL.v1 + 0.2); pbox(uc, PL.v1 + 0.2, y + 0.3, L, 0.8, 0.45, brickC); pbox(uc, PL.v1 + 0.2, y + 0.74, L + 0.05, 0.08, 0.55, capC); blockers.push({ u0: PL.u0 + 6, u1: PL.u1, v0: PL.v1, v1: PL.v1 + 0.5 }); }
    // 나무 (양옆 줄 + 비탈)
    const trees = [];
    for (let u = PL.u0 + 8; u < PL.u1 - 2; u += 7) { trees.push([u, PL.v0 + 2.2]); trees.push([u, PL.v1 - 1.6]); }
    for (let u = PL.u1 + 4; u < PL.u1 + 16; u += 6) { trees.push([u, PL.sv0 - 6]); trees.push([u, PL.sv1 + 5]); }
    trees.forEach(([u, v], i) => {
      const y = H(u, v), [x, z] = F.W(u, v);
      props.box(x, y + 1.3, z, 0.32, 2.6, 0.32, ry, undefined, hex3('#5a3d2b'));
      const greens = ['#3f7a3a', '#4f8f45', '#5f9a4a', '#3b6e3f'];
      for (const [dy, r0, dx] of [[3.4, 1.9, 0], [4.6, 1.4, 0.4], [3.9, 1.3, -0.7]]) {
        const ico = new THREE.IcosahedronGeometry(r0, 0); ico.translate(x + dx * F.az, y + dy, z - dx * F.ax);
        const ng = ico.toNonIndexed(); ng.computeVertexNormals();
        const pp = Array.from(ng.attributes.position.array), ii = pp.map((_, k) => k).slice(0, pp.length / 3);
        props.raw(pp, ii, Array.from(ng.attributes.normal.array), null, hex3(greens[(i + Math.round(dy)) % greens.length]));
        ico.dispose(); ng.dispose();
      }
      blockers.push({ u0: u - 0.35, u1: u + 0.35, v0: v - 0.35, v1: v + 0.35 });
    });
    // 벤치 (양옆, 광장 쪽을 보게)
    for (let u = PL.u0 + 11.5; u < PL.u1 - 4; u += 14) for (const [v, side] of [[PL.v0 + 3.6, 1], [PL.v1 - 3.0, -1]]) {
      const y = H(u, v);
      pbox(u, v, y + 0.45, 1.8, 0.08, 0.45, hex3('#8a5a3b'));
      pbox(u, v - side * 0.22, y + 0.75, 1.8, 0.5, 0.07, hex3('#8a5a3b'));
      for (const du of [-0.75, 0.75]) pbox(u + du, v, y + 0.22, 0.08, 0.45, 0.4, ironC);
      blockers.push({ u0: u - 0.95, u1: u + 0.95, v0: v - 0.3, v1: v + 0.3 });
    }
    // 성모상 (광장 왼쪽 앞, 받침 + 흰 상)
    {
      const u = PL.u1 - 7, v = PL.v0 + 8, y = H(u, v), [x, z] = F.W(u, v);
      pbox(u, v, y + 0.6, 1.3, 1.2, 1.3, stoneD); pbox(u, v, y + 1.25, 1.5, 0.1, 1.5, capC);
      const robe = new THREE.CylinderGeometry(0.22, 0.42, 1.7, 8); robe.translate(x, y + 2.15, z);
      const head = new THREE.IcosahedronGeometry(0.17, 1); head.translate(x, y + 3.13, z);
      for (const gg of [robe, head]) { const ng = gg.toNonIndexed(); ng.computeVertexNormals(); const pp = Array.from(ng.attributes.position.array); props.raw(pp, pp.map((_, k) => k).slice(0, pp.length / 3), Array.from(ng.attributes.normal.array), null, hex3('#f3f1ec')); gg.dispose(); ng.dispose(); }
      blockers.push({ u0: u - 0.8, u1: u + 0.8, v0: v - 0.8, v1: v + 0.8 });
    }
    // 입구 문 (계단 아래 길가): 벽돌 기둥 2 + 철 들보 + 간판
    const gateU = PL.u1 + PL.stairRun + 1.6, gy = H(gateU, sc);
    const gL = PL.sv0 - 1.0, gR = PL.sv1 + 1.0;
    for (const v of [gL, gR]) { pbox(gateU, v, gy + 1.7, 0.9, 3.4, 0.9, brickC); pbox(gateU, v, gy + 3.5, 1.1, 0.2, 1.1, capC); blockers.push({ u0: gateU - 0.5, u1: gateU + 0.5, v0: v - 0.5, v1: v + 0.5 }); }
    pbox(gateU, sc, gy + 4.05, 0.25, 0.22, gR - gL + 0.9, ironC);
    pbox(gateU, sc, gy + 3.45, 0.2, 0.08, gR - gL - 0.6, ironC);
    // 등 (기둥은 소품, 머리는 밤에 켜지는 등 메시)
    const lampBuf = new GeoBuf({ uv: false, color: false });
    const lampAt = (u, v) => { const y = H(u, v); pbox(u, v, y + 1.6, 0.12, 3.2, 0.12, ironC); const [x, z] = F.W(u, v); lampBuf.box(x, y + 3.35, z, 0.36, 0.42, 0.36, ry); };
    for (let u = PL.u0 + 5; u < PL.u1; u += 10) { lampAt(u, PL.v0 + 0.8); lampAt(u, PL.v1 - 0.8); }
    for (const v of [gL, gR]) { const [x, z] = F.W(gateU, v); lampBuf.box(x, gy + 3.85, z, 0.4, 0.5, 0.4, ry); }
    const propsMesh = new THREE.Mesh(props.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    propsMesh.name = 'myeongdong-cathedral-props'; propsMesh.castShadow = false; propsMesh.receiveShadow = true; g.add(propsMesh); meshes.push(propsMesh);
    lampMat = new THREE.MeshBasicMaterial({ color: '#8a8478' });
    const lm = new THREE.Mesh(lampBuf.build(), lampMat); lm.name = 'myeongdong-cathedral-lamps'; g.add(lm);
    // 간판 (양면, 아틀라스)
    if (atlas?.texture) {
      const sb = new GeoBuf({ uv: true, color: false });
      const uvr = atlas.uv('cathSign'), y0 = gy + 3.55, y1 = gy + 4.6;
      // 보는 사람 기준 왼쪽→오른쪽(오른쪽 = (nz, -nx)), 양면
      for (const sgn of [1, -1]) {
        const nx = F.ax * sgn, nz = F.az * sgn, [mx, mz] = F.W(gateU + 0.14 * sgn, sc), hw = (gR - gL - 1.2) / 2;
        sb.quad([mx - nz * hw, y0, mz + nx * hw], [mx + nz * hw, y0, mz - nx * hw], [mx + nz * hw, y1, mz - nx * hw], [mx - nz * hw, y1, mz + nx * hw], uvr, null, [nx, 0, nz]);
      }
      signMat = new THREE.MeshLambertMaterial({ map: atlas.texture, emissive: '#ffffff', emissiveMap: atlas.texture, emissiveIntensity: 0.25 });
      const sm = new THREE.Mesh(sb.build(), signMat); sm.name = 'myeongdong-cathedral-sign'; g.add(sm);
    }
    // ---- 밤 가짜 조명: 등 밑·계단·정면 앞 바닥 웅덩이 1메시 + 벽돌 정면 업라이트 1메시 (실제 Light 없음)
    {
      const poolBuf = new GeoBuf({ uv: true, color: true });
      const ux = F.ax, uz = F.az, vx = -F.az, vz = F.ax;
      const poolAt = (u, v, r = 3.5, col = [1, 0.86, 0.58]) => {
        const [x, z] = F.W(u, v), y = land.heightAt(x, z) + 0.22;
        poolBuf.quad(
          [x - ux * r - vx * r, y, z - uz * r - vz * r],
          [x + ux * r - vx * r, y, z + uz * r - vz * r],
          [x + ux * r + vx * r, y, z + uz * r + vz * r],
          [x - ux * r + vx * r, y, z - uz * r + vz * r],
          [0, 0, 1, 1], col, [0, 1, 0],
        );
      };
      for (let u = PL.u0 + 5; u < PL.u1; u += 10) { poolAt(u, PL.v0 + 0.8, 3.6); poolAt(u, PL.v1 - 0.8, 3.6); }
      for (const v of [gL, gR]) poolAt(gateU, v, 3.3, [1, 0.88, 0.62]);
      for (let k = 0; k < 4; k++) poolAt(PL.u1 + PL.stairRun * (0.15 + k * 0.24), sc, 2.7, [1, 0.84, 0.55]);
      poolAt(PL.u0 + 5, (PL.v0 + PL.v1) / 2, 8.5, [1, 0.82, 0.55]); // 정면 앞 넓은 바닥 빛
      for (let u = PL.u0 + 14; u < PL.u1 - 2; u += 11) poolAt(u, (PL.sv0 + PL.sv1) / 2, 3.8, [1, 0.83, 0.54]);
      poolMat = nightGlowMat(tex(poolCanvas(), false));
      poolMesh = new THREE.Mesh(poolBuf.build(), poolMat);
      poolMesh.name = 'myeongdong-cathedral-pools'; poolMesh.visible = false; g.add(poolMesh);
      const washBuf = new GeoBuf({ uv: true, color: true });
      const facadeWash = (u, v0, v1, y0, y1, out = 0.2, col = [1, 0.84, 0.58]) => {
        const p0 = W(u, v0), p1 = W(u, v1), ox = ax * out, oz = az * out;
        washBuf.quad(
          [p0[0] + ox, Y(y0), p0[1] + oz], [p1[0] + ox, Y(y0), p1[1] + oz],
          [p1[0] + ox, Y(y1), p1[1] + oz], [p0[0] + ox, Y(y1), p0[1] + oz],
          [0, 0, 1, 1], col, [ax, 0, az],
        );
      };
      facadeWash(uF + 0.04, -TW / 2, TW / 2, 0.15, T_H - 1.5, 0.22); // 종탑 정면
      for (const s of [-1, 1]) facadeWash(uBF - 0.12, s * TW / 2, s * hw, 0.15, AISLE_H + 0.8, 0.2); // 측랑 정면
      // 종탑·측랑 옆면도 아래만 살짝 (광장에서 옆 실루엣이 덜 어둡게)
      for (const s of [-1, 1]) {
        const p0 = W(tu - TW / 2, s * TW / 2), p1 = W(tu + TW / 2, s * TW / 2);
        const ox = -az * s * 0.18, oz = ax * s * 0.18;
        washBuf.quad(
          [p0[0] + ox, Y(0.15), p0[1] + oz], [p1[0] + ox, Y(0.15), p1[1] + oz],
          [p1[0] + ox, Y(T_H * 0.55), p1[1] + oz], [p0[0] + ox, Y(T_H * 0.55), p0[1] + oz],
          [0, 0, 1, 1], [1, 0.8, 0.52], [-az * s, 0, ax * s],
        );
      }
      washMat = nightGlowMat(tex(washCanvas(), false));
      washMesh = new THREE.Mesh(washBuf.build(), washMat);
      washMesh.name = 'myeongdong-cathedral-wash'; washMesh.visible = false; g.add(washMesh);
    }
    console.info(`[myeongdong] cathedral plaza ${(PL.u1 - PL.u0).toFixed(0)}×${(PL.v1 - PL.v0).toFixed(0)} m, stairs ${N} × ${rise.toFixed(2)} m, top=${top.toFixed(1)} bottom=${yBot.toFixed(1)}`);
  }

  if (overlay) {
    overlay.add({ cls: 'label landmark', text: '⛪ 명동대성당 Myeongdong Cathedral · 1898', getPos: () => new THREE.Vector3(tc[0], Y(SP_H + 6), tc[1]), maxDist: 3200, minDist: 25 });
  }

  // ================= 실내 (들어갈 수 있다) =================
  //   몸채·익랑·후진·종탑 아래(현관)는 걸어 다니는 바닥. 벽 띠(바깥 외곽선 ~ 실내 면)만 막고, 정문 구멍(|v| < DW)으로 드나든다.
  const L = { W, toUV, Y, base, FL, uA, uC, uT, uBF, uF, hw, nHWx, TWh, NB, BAY, DW, DH, ax, az, AISLE_H, NAVE_H, T_H };
  const inner = createCathedralInterior({ parent: g, L, glassTex, atlas: GA });
  const ringO = o;
  const IHW = hw - 0.7, ITW = TWh - 0.7, IAR = nHWx - 0.6; // 실내 면 (벽 두께 0.6–0.7 m)
  /** 실내 걷는 바닥인가 (반경 r 만큼 벽에서 떨어져) */
  function inWalk(u, v, r = 0) {
    if (u >= uC && u <= uBF - 0.6 - r && Math.abs(v) <= IHW - r) return true; // 몸채 + 익랑
    if (u > uBF - 0.6 - r && u <= uF - 0.9 - r && Math.abs(v) <= ITW - r) return u > uBF - 0.6 - r && (Math.abs(v) <= ITW - r); // 종탑 아래 현관
    if (u < uC && Math.hypot(u - uC, v) <= IAR * Math.cos(Math.PI / 10) - r) return true; // 후진 (다각형 안쪽 원)
    return false;
  }
  function inDoor(u, v, r = 0) { return u > uF - 1.2 && u < uF + 0.6 && Math.abs(v) <= DW - r; }
  /** 건물 몸 (바깥 외곽): 외곽선 또는 지은 몸채 */
  function inHull(u, v, r = 0) {
    if (u >= uC - r && u <= uBF + r && Math.abs(v) <= hw + r) return true;
    if (u >= uBF - r && u <= uF + r && Math.abs(v) <= TWh + r) return true;
    if (u < uC && Math.hypot(u - uC, v) <= hw + r) return true;
    return false;
  }
  let lastInside = false;
  return {
    group: g,
    info: { x: tc[0], z: tc[1], top: Y(SP_H), facade: W(uF + 12, 0), axis: [ax, az], door: W(uF, 0), nave: W((uT + uBF) / 2, 0), apse: W(uC - 2, 0), floor: FL, frame: { uC, uT, uBF, uF, hw, TWh, NB, BAY } },
    interior: inner,
    /** 축 좌표 → 세계 (샷 스크립트용) */
    at: (u, v) => W(u, v),
    uv: (x, z) => toUV(x, z),
    isBlocked(x, z, r = 0.4) {
      if (Math.hypot(x - cx, z - cz) > (uMax - uMin) + 70) return false;
      const [u, v] = toUV(x, z);
      if (inWalk(u, v, r)) return inner.isBlocked(u, v, r);
      if (inDoor(u, v, r)) return false;
      if (inHull(u, v, r) || pointInRing(x, z, ringO)) return true;
      const F = land.hill?.frame;
      if (F && blockers.length) { const [pu, pv] = F.uv(x, z); for (const b of blockers) if (pu > b.u0 - r && pu < b.u1 + r && pv > b.v0 - r && pv < b.v1 + r) return true; }
      for (let i = 0; i < ringO.length; i++) { const a = ringO[i], b = ringO[(i + 1) % ringO.length]; if (distToSeg(x, z, a[0], a[1], b[0], b[1]) < r) return true; }
      return false;
    },
    floorY(x, z) {
      const [u, v] = toUV(x, z);
      if (inWalk(u, v, -0.3) || inDoor(u, v, -0.3)) return FL + inner.floorAt(u, v);
      return null;
    },
    /** 카메라 점이 실내 공간 안인가 (플레이어가 안에 있을 때 붐을 줄인다) */
    camInside(x, z, y) {
      const [u, v] = toUV(x, z);
      if (!inWalk(u, v, -0.25)) return false;
      return y < FL + inner.ceilAt(u, v) - 0.35 && y > FL + 0.2;
    },
    playerInside(x, z) { const [u, v] = toUV(x, z); return inWalk(u, v, -0.2) || inDoor(u, v, -0.2); },
    tickPlayer(dt, player, sky) {
      const p = player?.position; if (!p) return;
      const [u, v] = toUV(p.x, p.z);
      const near = inWalk(u, v, -0.3) || (u > uF - 2 && u < uF + 26 && Math.abs(v) < 10);
      inner.setVisible(near);
      const inside = inWalk(u, v, -0.3);
      if (inside !== lastInside) { lastInside = inside; if (overlay) overlay.hideLabels = inside; }
      if (near) inner.update(dt, sky, nightV);
    },
    get inside() { return lastInside; },
    setNight(v) {
      nightV = v;
      brickMat.emissiveIntensity = v * 0.75;
      trimMat.emissiveIntensity = v * 0.35;
      frameMat.emissiveIntensity = v * 0.3;
      glassExtMat.emissiveIntensity = 0.08 + v * 1.25;
      goldMat.emissiveIntensity = 0.18 + v * 0.9;
      roofMat.color.set(v > 0.5 ? '#4a5559' : '#8a989c');
      if (lampMat) lampMat.color.set(v > 0.5 ? '#ffe7b8' : '#8a8478');
      if (signMat) signMat.emissiveIntensity = 0.25 + v * 0.8;
      if (plazaMat) plazaMat.emissiveIntensity = v * 0.14;
      const on = v > 0.02;
      if (poolMat) { poolMat.opacity = v * 0.9; if (poolMesh) poolMesh.visible = on; }
      if (washMat) { washMat.opacity = v * 0.7; if (washMesh) washMesh.visible = on; }
    },
  };
}
