// [myeongdong] 명동대성당 (1898, 고딕 벽돌 성당). OSM way/210335697 외곽선에서 축(제대 → 정면)을 잡아
//   신랑(nave)·측랑·후진(apse)·정면 종탑과 팔각 첨탑(약 45 m)·버트레스·첨두창을 절차적으로 짓는다.
//   재질 5개(창 벽돌·민 벽돌·지붕·첨탑 돌·금 십자가) = draw 5. 밤에는 창(스테인드글라스)과 벽돌 조명이 켜진다.
import * as THREE from 'three';
import { GeoBuf, pointInRing, distToSeg, hex3 } from './myeongdongGeo.js';

function brickCanvas(win) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#7a3b2a'; g.fillRect(0, 0, 512, 512);
  let s = win ? 11 : 23; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bh = 12, bw = 34;
  for (let y = 0; y < 512; y += bh) for (let x = -((y / bh) % 2) * bw / 2; x < 512; x += bw) {
    const l = 30 + r() * 12, h = 10 + r() * 8;
    g.fillStyle = `hsl(${h},${45 + r() * 15}%,${l}%)`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
  }
  // 회색 돌 띠 (명동성당 벽돌 + 회색 벽돌 줄무늬)
  g.fillStyle = '#9a958c';
  for (const y of [96, 300, 470]) g.fillRect(0, y, 512, 10);
  if (win) {
    // 첨두아치 창
    const x0 = 196, w = 120, top = 70, bot = 440;
    g.fillStyle = '#b8b1a6';
    g.beginPath(); g.moveTo(x0 - 10, bot + 10); g.lineTo(x0 - 10, top + 70); g.quadraticCurveTo(x0 - 10, top - 14, x0 + w / 2, top - 22); g.quadraticCurveTo(x0 + w + 10, top - 14, x0 + w + 10, top + 70); g.lineTo(x0 + w + 10, bot + 10); g.closePath(); g.fill();
    const grd = g.createLinearGradient(0, top, 0, bot);
    grd.addColorStop(0, '#2b4fa8'); grd.addColorStop(0.35, '#7a2a7c'); grd.addColorStop(0.7, '#1f6f8b'); grd.addColorStop(1, '#a8332a');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x0, bot); g.lineTo(x0, top + 70); g.quadraticCurveTo(x0, top, x0 + w / 2, top - 8); g.quadraticCurveTo(x0 + w, top, x0 + w, top + 70); g.lineTo(x0 + w, bot); g.closePath(); g.fill();
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x0 + w / 2, top - 6); g.lineTo(x0 + w / 2, bot); g.stroke();
    for (let y = top + 60; y < bot; y += 46) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
    for (let k = 0; k < 70; k++) { g.fillStyle = `hsla(${r() * 360},80%,60%,.5)`; g.fillRect(x0 + r() * w, top + 30 + r() * (bot - top - 30), 6, 6); }
  }
  return c;
}
function emissiveCanvas(src, win) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.globalAlpha = win ? 0.22 : 0.3; g.drawImage(src, 0, 0); g.globalAlpha = 1;
  if (win) {
    // 창만 밝게 (같은 모양을 한 번 더)
    const x0 = 196, w = 120, top = 70, bot = 440;
    g.save();
    g.beginPath(); g.moveTo(x0, bot); g.lineTo(x0, top + 70); g.quadraticCurveTo(x0, top, x0 + w / 2, top - 8); g.quadraticCurveTo(x0 + w, top, x0 + w, top + 70); g.lineTo(x0 + w, bot); g.closePath(); g.clip();
    g.drawImage(src, 0, 0);
    g.fillStyle = 'rgba(255,210,140,.35)'; g.fillRect(0, 0, 512, 512);
    g.restore();
  }
  return c;
}
function slateCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f4549'; g.fillRect(0, 0, 256, 256);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 256; y += 16) for (let x = -((y / 16) % 2) * 8; x < 256; x += 16) { g.fillStyle = `hsl(200,6%,${22 + r() * 10}%)`; g.fillRect(x + 1, y + 1, 14, 14); }
  return c;
}
function graniteCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#a9a59e'; g.fillRect(0, 0, 256, 256);
  let s = 41; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // 큰 판석(6 m 를 4×4 → 1.5 m 판) + 가운데 띠
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
  const noop = { setNight() {}, isBlocked: () => false, floorY: () => null, info: null };
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
  const Wd = Math.min(30, Math.max(20, Math.max(...vs) - Math.min(...vs)));
  const W = (u, v) => [cx + ax * u - az * (v + vMid), cz + az * u + ax * (v + vMid)];
  let base = -Infinity; for (const [x, z] of o) base = Math.max(base, land.heightAt(x, z));
  base -= 0.2;

  const L = uMax - uMin;
  const uA = uMin, uF = uMax; // 후진 끝, 정면 끝
  const hw = Wd / 2, naveHW = 6.2;
  const AISLE_H = 10, NAVE_H = 18.5, RIDGE = 24.5;
  const TW = 8.4, T_H = 27, SP_H = 45.5;
  const bWin = new GeoBuf(), bPlain = new GeoBuf(), roof = new GeoBuf(), stone = new GeoBuf(), gold = new GeoBuf();
  const Y = (y) => base + y;

  // 벽: (u0,v0)→(u1,v1) 바깥쪽 법선이 (cu,cv) 반대쪽을 보게
  function wall(buf, u0, v0, u1, v1, y0, y1, bay = 5, cu = (uA + uF) / 2, cv = 0) {
    let p0 = W(u0, v0), p1 = W(u1, v1);
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, c = W(cu, cv);
    // 오른손: (p1-p0) × up → 바깥
    const nx = (p1[1] - p0[1]), nz = -(p1[0] - p0[0]);
    if (nx * (mx - c[0]) + nz * (mz - c[1]) < 0) [p0, p1] = [p1, p0];
    const reps = Math.max(1, Math.round(len / bay));
    buf.quad([p1[0], Y(y0), p1[1]], [p0[0], Y(y0), p0[1]], [p0[0], Y(y1), p0[1]], [p1[0], Y(y1), p1[1]], [0, 0, reps, 1]);
  }
  function gable(buf, u0, u1, halfW, yE, yR, vC = 0) {
    // 박공 지붕: u 방향 용마루
    const a = W(u0, vC - halfW), b = W(u1, vC - halfW), c = W(u1, vC), d = W(u0, vC);
    const e = W(u0, vC + halfW), f = W(u1, vC + halfW);
    const rep = (u1 - u0) / 3;
    const q1 = [[a[0], Y(yE), a[1]], [b[0], Y(yE), b[1]], [c[0], Y(yR), c[1]], [d[0], Y(yR), d[1]]];
    const q2 = [[f[0], Y(yE), f[1]], [e[0], Y(yE), e[1]], [d[0], Y(yR), d[1]], [c[0], Y(yR), c[1]]];
    for (const q of [q1, q2]) {
      const ux = q[1][0] - q[0][0], uz = q[1][2] - q[0][2];
      const vx = q[3][0] - q[0][0], vz = q[3][2] - q[0][2];
      if (uz * vx - ux * vz > 0) buf.quad(q[0], q[1], q[2], q[3], [0, 0, rep, 2]); else buf.quad(q[1], q[0], q[3], q[2], [0, 0, rep, 2]);
    }
  }
  function gableEnd(buf, u, halfW, yE, yR, outSign, vC = 0) {
    const a = W(u, vC - halfW), b = W(u, vC + halfW), c = W(u, vC);
    const tri = [[a[0], Y(yE), a[1]], [b[0], Y(yE), b[1]], [c[0], Y(yR), c[1]]];
    const n0 = [ax * outSign, 0, az * outSign];
    const ux = tri[1][0] - tri[0][0], uz = tri[1][2] - tri[0][2], vx = tri[2][0] - tri[0][0], vy = tri[2][1] - tri[0][1], vz = tri[2][2] - tri[0][2];
    const nx = 0 * vz - uz * vy, nz = ux * vy - 0 * vx;
    const ord = nx * n0[0] + nz * n0[2] >= 0 ? [0, 1, 2] : [0, 2, 1];
    const pos = []; for (const k of ord) pos.push(...tri[k]);
    buf.raw(pos, [0, 1, 2], [n0[0], 0, n0[2], n0[0], 0, n0[2], n0[0], 0, n0[2]], [0, 0, 1, 0, 0.5, 1]);
  }

  // ---- 측랑(아랫단) ----
  const uBody0 = uA + hw, uBody1 = uF - TW;
  for (const s of [-1, 1]) wall(bWin, uBody0, s * hw, uBody1, s * hw, 0, AISLE_H, 5);
  // 측랑 지붕(한쪽 경사)
  for (const s of [-1, 1]) {
    const p = [W(uBody0, s * hw), W(uBody1, s * hw), W(uBody1, s * naveHW), W(uBody0, s * naveHW)];
    const q = [[p[0][0], Y(AISLE_H), p[0][1]], [p[1][0], Y(AISLE_H), p[1][1]], [p[2][0], Y(AISLE_H + 3.2), p[2][1]], [p[3][0], Y(AISLE_H + 3.2), p[3][1]]];
    const ux = q[1][0] - q[0][0], uz = q[1][2] - q[0][2], vx = q[3][0] - q[0][0], vz = q[3][2] - q[0][2];
    if (uz * vx - ux * vz > 0) roof.quad(q[0], q[1], q[2], q[3], [0, 0, 8, 2]); else roof.quad(q[1], q[0], q[3], q[2], [0, 0, 8, 2]);
  }
  // ---- 신랑(높은 벽 · 고측창) ----
  for (const s of [-1, 1]) wall(bWin, uBody0 - 2, s * naveHW, uBody1, s * naveHW, AISLE_H, NAVE_H, 5);
  gable(roof, uBody0 - 2, uBody1 + 0.4, naveHW + 0.5, NAVE_H, RIDGE);
  gableEnd(bPlain, uBody1 + 0.4, naveHW + 0.5, NAVE_H, RIDGE, 1);
  // ---- 후진: 반 십각형 두 단 ----
  const N = 6;
  const ring = (r, y0, y1, buf) => {
    for (let k = 0; k < N; k++) {
      const a0 = Math.PI / 2 + (k / N) * Math.PI, a1 = Math.PI / 2 + ((k + 1) / N) * Math.PI;
      wall(buf, uBody0 + Math.cos(a0) * r, Math.sin(a0) * r, uBody0 + Math.cos(a1) * r, Math.sin(a1) * r, y0, y1, 4.5, uBody0, 0);
    }
  };
  ring(hw, 0, AISLE_H, bWin);
  ring(naveHW, AISLE_H, NAVE_H, bWin);
  // 후진 지붕: 원뿔(반쪽) + 아랫단 경사 링
  {
    const apex = W(uBody0, 0); const pos = [], nrm = [], idx = [], uv = [];
    for (let k = 0; k <= N; k++) {
      const a = Math.PI / 2 + (k / N) * Math.PI, p = W(uBody0 + Math.cos(a) * (naveHW + 0.4), Math.sin(a) * (naveHW + 0.4));
      pos.push(p[0], Y(NAVE_H), p[1]); nrm.push(Math.cos(a) * ax - Math.sin(a) * az, 0.6, Math.cos(a) * az + Math.sin(a) * ax); uv.push(k, 0);
    }
    pos.push(apex[0], Y(RIDGE), apex[1]); nrm.push(0, 1, 0); uv.push(N / 2, 3);
    for (let k = 0; k < N; k++) idx.push(k + 1, k, N + 1);
    roof.raw(pos, idx, nrm, uv);
    const pos2 = [], nrm2 = [], idx2 = [], uv2 = [];
    for (let k = 0; k <= N; k++) {
      const a = Math.PI / 2 + (k / N) * Math.PI;
      const po = W(uBody0 + Math.cos(a) * (hw + 0.3), Math.sin(a) * (hw + 0.3)), pi = W(uBody0 + Math.cos(a) * naveHW, Math.sin(a) * naveHW);
      pos2.push(po[0], Y(AISLE_H), po[1], pi[0], Y(AISLE_H + 3.2), pi[1]);
      const nx = Math.cos(a) * ax - Math.sin(a) * az, nz = Math.cos(a) * az + Math.sin(a) * ax;
      nrm2.push(nx, 0.8, nz, nx, 0.8, nz); uv2.push(k, 0, k, 1);
    }
    for (let k = 0; k < N; k++) { const a = k * 2; idx2.push(a + 2, a, a + 1, a + 2, a + 1, a + 3); }
    roof.raw(pos2, idx2, nrm2, uv2);
  }
  // ---- 버트레스 (측랑 벽 바깥) ----
  for (const s of [-1, 1]) for (let u = uBody0 + 2.5; u < uBody1 - 1; u += 5) {
    const p = W(u, s * (hw + 0.55));
    const rot = Math.atan2(-az, ax);
    bPlain.box(p[0], Y(AISLE_H / 2 + 0.6), p[1], 1.0, AISLE_H + 1.2, 1.1, rot, [0, 0, 0.3, 2.2]);
    stone.box(p[0], Y(AISLE_H + 1.9), p[1], 0.7, 1.6, 0.7, rot, [0, 0, 1, 1]);
  }
  // ---- 정면 종탑 + 팔각 첨탑 ----
  const tu = uF - TW / 2;
  const tc = W(tu, 0);
  const rotT = Math.atan2(-az, ax);
  // 탑 몸통 4면 (아래는 민 벽돌, 종루 단은 창)
  for (const [u0, v0, u1, v1] of [[tu - TW / 2, -TW / 2, tu + TW / 2, -TW / 2], [tu + TW / 2, -TW / 2, tu + TW / 2, TW / 2], [tu + TW / 2, TW / 2, tu - TW / 2, TW / 2], [tu - TW / 2, TW / 2, tu - TW / 2, -TW / 2]]) {
    wall(bPlain, u0, v0, u1, v1, 0, T_H - 8, 4.2, tu, 0);
    wall(bWin, u0, v0, u1, v1, T_H - 8, T_H, 4.2, tu, 0);
  }
  // 정면 양옆 낮은 벽(측랑 정면)
  for (const s of [-1, 1]) wall(bWin, uF - 0.2, s * TW / 2, uF - 0.2, s * hw, 0, AISLE_H, 5, uF - 10, 0);
  for (const s of [-1, 1]) wall(bPlain, uBody1, s * hw, uF - 0.2, s * hw, 0, AISLE_H, 5);
  // 탑 모서리 작은 첨탑 4
  for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = W(tu + du * (TW / 2 - 0.3), dv * (TW / 2 - 0.3));
    stone.box(p[0], Y(T_H + 0.9), p[1], 0.9, 1.8, 0.9, rotT);
    const cone = new THREE.ConeGeometry(0.55, 3.4, 4, 1); cone.rotateY(Math.PI / 4 + rotT); cone.translate(p[0], Y(T_H + 3.5), p[1]);
    stone.raw(Array.from(cone.attributes.position.array), Array.from(cone.index.array), Array.from(cone.attributes.normal.array), Array.from(cone.attributes.uv.array));
    cone.dispose();
  }
  // 탑 위 난간 + 팔각 첨탑
  stone.box(tc[0], Y(T_H + 0.25), tc[1], TW + 0.6, 0.5, TW + 0.6, rotT, [0, 0, 3, 0.2]);
  {
    const sp = new THREE.ConeGeometry(TW * 0.42, SP_H - T_H, 8, 1, true);
    sp.rotateY(Math.PI / 8 + rotT); sp.translate(tc[0], Y(T_H + (SP_H - T_H) / 2), tc[1]);
    stone.raw(Array.from(sp.attributes.position.array), Array.from(sp.index.array), Array.from(sp.attributes.normal.array), Array.from(sp.attributes.uv.array).map((v, i) => (i % 2 ? v * 6 : v * 4)));
    sp.dispose();
  }
  // 금 십자가
  gold.box(tc[0], Y(SP_H + 1.4), tc[1], 0.22, 3.0, 0.22, rotT);
  gold.box(tc[0], Y(SP_H + 1.9), tc[1], 1.5, 0.22, 0.22, rotT);
  { const p = W(uBody0 + 0.3, 0); gold.box(p[0], Y(RIDGE + 1), p[1], 0.15, 1.6, 0.15, rotT); gold.box(p[0], Y(RIDGE + 1.3), p[1], 0.8, 0.15, 0.15, rotT); }
  // 정문(첨두 아치 문) + 장미창
  {
    const fp = W(uF + 0.06, 0); const nx = ax, nz = az; // 정면 바깥 법선 = +axis
    const rX = -az, rZ = ax;
    const dW = 2.4, dH = 5.2;
    gold.quad([fp[0] + rX * dW / 2, Y(0.1), fp[1] + rZ * dW / 2], [fp[0] - rX * dW / 2, Y(0.1), fp[1] - rZ * dW / 2], [fp[0] - rX * dW / 2, Y(dH), fp[1] - rZ * dW / 2], [fp[0] + rX * dW / 2, Y(dH), fp[1] + rZ * dW / 2], [0, 0, 1, 1], null, [nx, 0, nz]);
    const rp = W(uF + 0.08, 0);
    const disc = new THREE.CircleGeometry(1.7, 20);
    const m4 = new THREE.Matrix4().makeRotationY(Math.atan2(nx, nz)); disc.applyMatrix4(m4); disc.translate(rp[0], Y(T_H - 12), rp[1]);
    bWin.raw(Array.from(disc.attributes.position.array), Array.from(disc.index.array), Array.from(disc.attributes.normal.array), Array.from(disc.attributes.uv.array).map((v, i) => (i % 2 ? 0.25 + v * 0.5 : 0.4 + v * 0.2)));
    disc.dispose();
  }

  // ---- 재질 ----
  const winC = brickCanvas(true), plainC = brickCanvas(false);
  const winMat = new THREE.MeshLambertMaterial({ map: tex(winC), emissive: '#ffb070', emissiveMap: tex(emissiveCanvas(winC, true)), emissiveIntensity: 0 });
  const plainMat = new THREE.MeshLambertMaterial({ map: tex(plainC), emissive: '#ffb070', emissiveMap: tex(emissiveCanvas(plainC, false)), emissiveIntensity: 0 });
  const roofMat = new THREE.MeshLambertMaterial({ map: tex(slateCanvas()), color: '#7c8a8f', side: THREE.DoubleSide });
  const stoneMat = new THREE.MeshLambertMaterial({ map: tex(slateCanvas()), color: '#a9b4b2', side: THREE.DoubleSide, emissive: '#ffd9a8', emissiveIntensity: 0 });
  const goldMat = new THREE.MeshLambertMaterial({ color: '#d4a64a', emissive: '#ffcf70', emissiveIntensity: 0.15 });
  const meshes = [];
  for (const [buf, mat, nm] of [[bWin, winMat, 'win'], [bPlain, plainMat, 'brick'], [roof, roofMat, 'roof'], [stone, stoneMat, 'stone'], [gold, goldMat, 'gold']]) {
    const geo = buf.build(); if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); m.name = 'myeongdong-cathedral-' + nm; m.castShadow = true; m.receiveShadow = true;
    g.add(m); meshes.push(m);
  }

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
      for (const s of [-1, 1]) facadeWash(uF - 0.12, s * TW / 2, s * hw, 0.15, AISLE_H + 0.8, 0.2); // 측랑 정면
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
  const ringO = o;
  return {
    group: g,
    info: { x: tc[0], z: tc[1], top: Y(SP_H), facade: W(uF + 12, 0), axis: [ax, az] },
    isBlocked(x, z, r = 0.4) {
      if (Math.hypot(x - cx, z - cz) > L + 70) return false;
      if (pointInRing(x, z, ringO)) return true;
      if (F && blockers.length) { const [u, v] = F.uv(x, z); for (const b of blockers) if (u > b.u0 - r && u < b.u1 + r && v > b.v0 - r && v < b.v1 + r) return true; }
      for (let i = 0; i < ringO.length; i++) { const a = ringO[i], b = ringO[(i + 1) % ringO.length]; if (distToSeg(x, z, a[0], a[1], b[0], b[1]) < r) return true; }
      return false;
    },
    floorY: () => null,
    setNight(v) {
      winMat.emissiveIntensity = v * 1.35;
      plainMat.emissiveIntensity = v * 0.9;
      stoneMat.emissiveIntensity = v * 0.35;
      goldMat.emissiveIntensity = 0.15 + v * 0.9;
      roofMat.color.set(v > 0.5 ? '#4a5559' : '#7c8a8f');
      if (lampMat) lampMat.color.set(v > 0.5 ? '#ffe7b8' : '#8a8478');
      if (signMat) signMat.emissiveIntensity = 0.25 + v * 0.8;
      if (plazaMat) plazaMat.emissiveIntensity = v * 0.14;
      const on = v > 0.02;
      if (poolMat) { poolMat.opacity = v * 0.9; if (poolMesh) poolMesh.visible = on; }
      if (washMat) { washMat.opacity = v * 0.7; if (washMesh) washMesh.visible = on; }
    },
  };
}
