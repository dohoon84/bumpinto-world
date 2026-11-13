// [myeongdong] 명동대성당 (1898, 고딕 벽돌 성당). OSM way/210335697 외곽선에서 축(제대 → 정면)을 잡아
//   신랑(nave)·측랑·후진(apse)·정면 종탑과 팔각 첨탑(약 45 m)·버트레스·첨두창을 절차적으로 짓는다.
//   재질 5개(창 벽돌·민 벽돌·지붕·첨탑 돌·금 십자가) = draw 5. 밤에는 창(스테인드글라스)과 벽돌 조명이 켜진다.
import * as THREE from 'three';
import { GeoBuf, pointInRing, distToSeg } from './myeongdongGeo.js';

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
const tex = (c, rep = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };

export function createMyeongdongCathedral({ parent, data, land, overlay }) {
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

  // ---- 앞마당 포장 (성당 정면 광장) ----
  {
    const buf = new GeoBuf({ uv: true, color: true });
    const pos = [], nrm = [], uv = [], idx = [];
    const R = 16, n = 18, c = W(uF + 11, 0);
    pos.push(c[0], land.heightAt(c[0], c[1]) + 0.13, c[1]); nrm.push(0, 1, 0); uv.push(0.5, 0.5);
    for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2, x = c[0] + Math.cos(a) * R, z = c[1] + Math.sin(a) * R * 0.75; pos.push(x, land.heightAt(x, z) + 0.13, z); nrm.push(0, 1, 0); uv.push(x / 3, z / 3); }
    for (let k = 1; k <= n; k++) idx.push(0, k + 1, k);
    buf.raw(pos, idx, nrm, uv, [0.86, 0.82, 0.76]);
    const geo = buf.build();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.name = 'myeongdong-cathedral-plaza'; g.add(m); meshes.push(m);
  }

  if (overlay) {
    overlay.add({ cls: 'label landmark', text: '⛪ 명동대성당 Myeongdong Cathedral · 1898', getPos: () => new THREE.Vector3(tc[0], Y(SP_H + 6), tc[1]), maxDist: 3200, minDist: 25 });
  }
  const ringO = o;
  return {
    group: g,
    info: { x: tc[0], z: tc[1], top: Y(SP_H), facade: W(uF + 12, 0), axis: [ax, az] },
    isBlocked(x, z, r = 0.4) {
      if (Math.hypot(x - cx, z - cz) > L) return false;
      if (pointInRing(x, z, ringO)) return true;
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
    },
  };
}
