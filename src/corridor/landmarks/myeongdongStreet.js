// [myeongdong] 명동 거리 꾸밈: 1층 쇼윈도 + 간판(가로·세로 돌출) + 네온 띠 + 밤 빛 번짐, 가운데 노점 행렬, 가로등, 골목 위 전구 줄, 사람.
//   draw: 간판/쇼윈도/노점메뉴 1 · 빛 번짐 1 · 노점 몸체 1 + 차양 1 · 가로등 1 · 빛 점 2 · 전선 1 · 사람 2 = 10 남짓
import * as THREE from 'three';
import { GeoBuf, hex3, CellGrid, distToSeg, mulberry, hash01, pointInRing } from './myeongdongGeo.js';
import { SHOP_SIGNS, V_SIGNS, STALL_MENUS } from './myeongdongAtlas.js';

const COSMETIC = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 33]);
const NON_COS = SHOP_SIGNS.map((_, i) => i).filter((i) => !COSMETIC.has(i));
const COS = [...COSMETIC];
const STALL_STREETS = new Set(['명동8길', '명동길', '명동10길']);
const WALK_KINDS = new Set(['residential', 'pedestrian', 'living_street', 'service', 'footway', 'unclassified']);
const CAR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link']);

function glowTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function spillTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  const r = g.createLinearGradient(0, 64, 0, 0); // v=0(벽) 밝음 → v=1(바깥) 0
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 8, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 수직 사각형: 바닥 가운데 (x,y,z), 바깥 법선 (nx,nz), 너비 w, 높이 h */
function wallQuad(buf, x, y, z, nx, nz, w, h, uv, col = null) {
  const rx = nz, rz = -nx; // 보는 사람 오른쪽
  const hw = w / 2;
  buf.quad([x - rx * hw, y, z - rz * hw], [x + rx * hw, y, z + rz * hw], [x + rx * hw, y + h, z + rz * hw], [x - rx * hw, y + h, z - rz * hw], uv, col, [nx, 0, nz]);
}

function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function along(pts, cum, s) {
  let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
  const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, tx, tz];
}

function personGeos() {
  const body = new GeoBuf({ uv: false, color: true });
  body.box(0, 0.42, 0, 0.3, 0.84, 0.2, 0, undefined, [0.32, 0.32, 0.36]); // 다리
  body.box(0, 1.15, 0, 0.44, 0.62, 0.26, 0, undefined, [1, 1, 1]);       // 몸통(옷색 = instanceColor)
  body.box(0.27, 1.05, 0, 0.1, 0.55, 0.12, 0, undefined, [1, 1, 1]);      // 팔
  body.box(-0.27, 1.05, 0, 0.1, 0.55, 0.12, 0, undefined, [1, 1, 1]);
  const head = new GeoBuf({ uv: false, color: true });
  const sg = new THREE.SphereGeometry(0.13, 8, 6);
  const p = sg.attributes.position.array, n = sg.attributes.normal.array;
  const pos = []; for (let i = 0; i < p.length; i += 3) pos.push(p[i], p[i + 1] + 1.6, p[i + 2]);
  head.raw(pos, Array.from(sg.index.array), Array.from(n), null, (k) => (p[k * 3 + 1] > 0.05 ? [0.12, 0.09, 0.07] : [0.93, 0.76, 0.62]));
  sg.dispose();
  return { body: body.build(), head: head.build() };
}

export async function createMyeongdongStreet({ parent, data, land, atlas, ways, blds, roadAt, bldAt, station, tick }) {
  const { heightAt } = land;
  const g = new THREE.Group(); g.name = 'myeongdong-street'; parent.add(g);
  const signBuf = new GeoBuf({ uv: true, color: false });
  const spillBuf = new GeoBuf({ uv: true, color: true });
  const cosmeticsShops = [];
  const rnd = mulberry(20261113);
  const U = (n) => atlas.uv(n);
  const neonKeys = ['pink', 'cyan', 'violet', 'green', 'yellow', 'white', 'orange', 'red'];

  // ---------- 1) 1층 쇼윈도 · 간판 ----------
  let nFront = 0, nSign = 0, nBlade = 0;
  const pickSign = (r, cosBias) => (r() < cosBias ? COS[Math.floor(r() * COS.length)] : NON_COS[Math.floor(r() * NON_COS.length)]);
  for (const b of blds) {
    if (!b.inBox) continue;
    const o = b.o, r = mulberry(b.id % 2147483647);
    const core = b.cx > -11230 && b.cx < -10720 && b.cz > -21990 && b.cz < -21455; // 명동 쇼핑 블록
    for (let i = 0; i < o.length; i++) {
      const a = o[i], c = o[(i + 1) % o.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 3.2) continue;
      const tx = (c[0] - a[0]) / L, tz = (c[1] - a[1]) / L;
      let nx = tz, nz = -tx;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (pointInRing(mx + nx * 0.3, mz + nz * 0.3, o)) { nx = -nx; nz = -nz; }
      if (bldAt(mx + nx * 1.6, mz + nz * 1.6)) continue; // 옆 건물에 붙은 벽
      const w = roadAt(mx + nx * 4.5, mz + nz * 4.5, 1.5) || roadAt(mx + nx * 8, mz + nz * 8, 0.5);
      if (!w) continue;
      const big = CAR.has(w.k);
      if (!core && !big && r() < 0.35) continue;
      const nb = Math.max(1, Math.round(L / 5.2)), bw = L / nb;
      const cosBias = core ? 0.62 : 0.3;
      for (let k = 0; k < nb; k++) {
        const t = (k + 0.5) * bw;
        const px = a[0] + tx * t, pz = a[1] + tz * t;
        const gy = heightAt(px + nx * 0.8, pz + nz * 0.8);
        const fx = px + nx * 0.05, fz = pz + nz * 0.05;
        const blank = r() < (core ? 0.06 : 0.22);
        if (!blank) {
          wallQuad(signBuf, fx, gy - 0.15, fz, nx, nz, bw - 0.25, 3.35, U('front' + Math.floor(r() * 16)));
          nFront++;
          // 빛 번짐 (밤에 거리 바닥으로)
          const sx = px + nx * 0.2, sz = pz + nz * 0.2, rx = nz, rz = -nx, hw = (bw - 0.2) / 2, D = 3.4;
          const y0 = gy + 0.16;
          const ca = hex3(['#fff4e0', '#ffe3f1', '#e4f7ff', '#fff9d6'][Math.floor(r() * 4)]);
          spillBuf.quad([sx + rx * hw, y0, sz + rz * hw], [sx - rx * hw, y0, sz - rz * hw], [sx - rx * hw + nx * D, y0, sz - rz * hw + nz * D], [sx + rx * hw + nx * D, y0, sz + rz * hw + nz * D], [0, 0, 1, 1], ca, [0, 1, 0]);
        }
        if (!blank && r() < 0.9) {
          const si = pickSign(r, cosBias);
          const sy = gy + 3.3, sh = 1.05;
          wallQuad(signBuf, px + nx * 0.42, sy, pz + nz * 0.42, nx, nz, bw - 0.15, sh, U('h' + si));
          // 간판 밑면 (어두운 판)
          const rx = nz, rz = -nx, hw = (bw - 0.15) / 2;
          signBuf.quad([px - rx * hw, sy, pz - rz * hw], [px + rx * hw, sy, pz + rz * hw], [px + rx * hw + nx * 0.42, sy, pz + rz * hw + nz * 0.42], [px - rx * hw + nx * 0.42, sy, pz - rz * hw + nz * 0.42], U('c-dark'), null, [0, -1, 0]);
          // 네온 띠
          if (r() < 0.6) wallQuad(signBuf, px + nx * 0.44, sy - 0.1, pz + nz * 0.44, nx, nz, bw - 0.15, 0.07, U('neon-' + neonKeys[Math.floor(r() * neonKeys.length)]));
          nSign++;
          if (COSMETIC.has(si) && core) cosmeticsShops.push({ x: +(px + nx * 2.2).toFixed(1), z: +(pz + nz * 2.2).toFixed(1), face: Math.atan2(-nx, -nz), sign: SHOP_SIGNS[si][1] });
        }
      }
      // 위층 가로 간판 (명동 특유의 층층 간판)
      const upFloors = Math.floor((b.top - heightAt(mx, mz) - 4.6) / 3.4);
      if (upFloors >= 1 && L >= 5) {
        for (let f = 1; f <= Math.min(upFloors, core ? 5 : 2); f++) {
          if (r() > (core ? 0.55 : 0.25)) continue;
          const span = L * (0.5 + r() * 0.4), off = (L - span) * r();
          const px = a[0] + tx * (off + span / 2), pz = a[1] + tz * (off + span / 2);
          const gy = heightAt(mx + nx, mz + nz);
          wallQuad(signBuf, px + nx * 0.12, gy + 3.4 * f + 1.6, pz + nz * 0.12, nx, nz, span, 1.2, U('h' + pickSign(r, cosBias)));
          nSign++;
        }
      }
      // 세로 돌출 간판
      const floors = Math.floor((b.top - heightAt(mx, mz)) / 3.4);
      if (floors >= 3 && L >= 5 && r() < (core ? 0.7 : 0.35)) {
        const end = r() < 0.5 ? 0.6 : L - 0.6;
        const ex = a[0] + tx * end, ez = a[1] + tz * end;
        const gy = heightAt(ex + nx, ez + nz);
        const h = Math.min(10, (floors - 1.6) * 3.4), y0 = gy + 4.7;
        const vi = Math.floor(r() * V_SIGNS.length);
        const cx = ex + nx * 0.68, cz = ez + nz * 0.68;
        // 양면: 법선 = ±(벽 방향)
        wallQuad(signBuf, cx + tx * 0.09, y0, cz + tz * 0.09, tx, tz, 0.95, h, U('v' + vi));
        wallQuad(signBuf, cx - tx * 0.09, y0, cz - tz * 0.09, -tx, -tz, 0.95, h, U('v' + vi));
        wallQuad(signBuf, cx + nx * 0.475, y0, cz + nz * 0.475, nx, nz, 0.18, h, U('neon-' + neonKeys[Math.floor(r() * neonKeys.length)]));
        nBlade++;
      }
    }
    await tick?.('md-signs');
  }

  // ---------- 2) 노점 행렬 (명동8길·명동길·명동10길 가운데) ----------
  const stallSpots = [];
  const block = new CellGrid(16);
  const blockers = [];
  for (const w of ways) {
    if (!STALL_STREETS.has(w.n)) continue;
    const pts = w.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    for (let s = 6; s < L - 6; s += 8.5) {
      const [x, z, tx, tz] = along(pts, cum, s);
      if (!land.inBox(x, z, -20)) continue;
      if (roadAt(x, z, 9, CAR)) continue; // 퇴계로·을지로 입구는 비운다
      // 교차로(다른 이름 길이 7 m 안)는 비운다
      let jn = false;
      for (const q of ways) {
        if (q === w || q.n === w.n || q.k === 'footway' || q.k === 'steps') continue;
        for (let i = 1; i < q.pts.length && !jn; i++) if (distToSeg(x, z, q.pts[i - 1][0], q.pts[i - 1][1], q.pts[i][0], q.pts[i][1]) < 7) jn = true;
        if (jn) break;
      }
      if (jn) continue;
      if (bldAt(x, z, 2.2)) continue;
      if (station?.near?.(x, z, 6)) continue;
      stallSpots.push({ x, z, tx, tz, w, menu: Math.floor(hash01(Math.round(x * 10), Math.round(z * 10)) * STALL_MENUS.length) });
    }
  }
  const stallN = stallSpots.length;
  const bodyBuf = new GeoBuf({ uv: false, color: true });
  bodyBuf.box(0, 0.8, 0, 2.5, 0.9, 1.3, 0, undefined, hex3('#c4c9cf'));
  bodyBuf.box(0, 1.28, 0, 2.62, 0.06, 1.46, 0, undefined, hex3('#e3e6ea'));
  bodyBuf.box(-0.55, 1.36, 0, 1.0, 0.1, 0.9, 0, undefined, hex3('#2b2d31'));
  for (const sx of [-1.05, 1.05]) for (const sz of [-0.55, 0.55]) bodyBuf.box(sx, 0.17, sz, 0.3, 0.3, 0.12, 0, undefined, hex3('#1c1c1f'));
  for (const sx of [-1.25, 1.25]) for (const sz of [-0.68, 0.68]) bodyBuf.box(sx, 1.95, sz, 0.05, 1.3, 0.05, 0, undefined, hex3('#8d939b'));
  const canBuf = new GeoBuf({ uv: false, color: true });
  canBuf.box(0, 2.62, 0, 3.0, 0.08, 1.95, 0, undefined, [1, 1, 1]);
  for (const sz of [-0.97, 0.97]) canBuf.box(0, 2.48, sz, 3.0, 0.24, 0.03, 0, undefined, [0.86, 0.86, 0.86]);
  const stallMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const canMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0 });
  const stallBody = new THREE.InstancedMesh(bodyBuf.build(), stallMat, Math.max(1, stallN));
  const stallCan = new THREE.InstancedMesh(canBuf.build(), canMat, Math.max(1, stallN));
  stallBody.name = 'myeongdong-stall-body'; stallCan.name = 'myeongdong-stall-canopy';
  const canCols = ['#d62828', '#1d4e89', '#2a9d8f', '#f4a261', '#e76f51', '#8338ec', '#ff006e', '#ffbe0b'].map((c) => new THREE.Color(c));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S1 = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
  const bulbs = [], bulbCols = [];
  const vendors = [];
  stallSpots.forEach((st, i) => {
    const gy = heightAt(st.x, st.z);
    const ry = Math.atan2(-st.tz, st.tx);
    Q.setFromAxisAngle(Y, ry); V.set(st.x, gy, st.z);
    M.compose(V, Q, S1); stallBody.setMatrixAt(i, M); stallCan.setMatrixAt(i, M);
    stallCan.setColorAt(i, canCols[i % canCols.length]);
    // 메뉴판(양쪽) · 음식 판 · 전구 — 아틀라스 메시에 붙인다
    const nx = -st.tz, nz = st.tx; // 길 오른쪽(로컬 +z 쪽 = 노점 옆면)
    for (const s of [1, -1]) {
      wallQuad(signBuf, st.x + nx * s * 0.99, gy + 2.66, st.z + nz * s * 0.99, nx * s, nz * s, 2.2, 0.62, U('menu' + st.menu));
    }
    const fy = gy + 1.32, hw = 0.55, hd = 0.36, cx = st.x + st.tx * 0.55, cz = st.z + st.tz * 0.55;
    signBuf.quad([cx - st.tx * hw + nx * hd, fy, cz - st.tz * hw + nz * hd], [cx + st.tx * hw + nx * hd, fy, cz + st.tz * hw + nz * hd], [cx + st.tx * hw - nx * hd, fy, cz + st.tz * hw - nz * hd], [cx - st.tx * hw - nx * hd, fy, cz - st.tz * hw - nz * hd], U('food' + (st.menu % 6)), null, [0, 1, 0]);
    for (const k of [-1, 0, 1]) { bulbs.push(st.x + st.tx * k * 0.95, gy + 2.36, st.z + st.tz * k * 0.95); bulbCols.push(1, 0.82, 0.55); }
    // 장수(노점 주인) — 한쪽 옆
    vendors.push([st.x - nx * 0.95 + st.tx * 0.6, st.z - nz * 0.95 + st.tz * 0.6, Math.atan2(nx, nz)]);
    const blk = { x: st.x, z: st.z, tx: st.tx, tz: st.tz, hl: 1.4, hd: 0.8 };
    blockers.push(blk); block.add(blk, st.x - 2, st.z - 2, st.x + 2, st.z + 2);
  });
  stallBody.instanceMatrix.needsUpdate = true; stallCan.instanceMatrix.needsUpdate = true;
  if (stallCan.instanceColor) stallCan.instanceColor.needsUpdate = true;
  stallBody.count = stallN; stallCan.count = stallN;
  stallBody.computeBoundingSphere(); stallCan.computeBoundingSphere();
  if (stallN) g.add(stallBody, stallCan);
  await tick?.('md-stalls');

  // ---------- 3) 골목 위 전구 줄 (지그재그) ----------
  const lineP = [];
  for (const w of ways) {
    if (!STALL_STREETS.has(w.n) && w.n !== '명동2길' && w.n !== '명동8나길') continue;
    const pts = w.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    for (let s = 4; s < L - 8; s += 11) {
      const [x0, z0, tx0, tz0] = along(pts, cum, s);
      const [x1, z1, tx1, tz1] = along(pts, cum, s + 7);
      if (!land.inBox(x0, z0, -10) || roadAt(x0, z0, 6, CAR)) continue;
      const hw = w.w / 2 + 1.4;
      const A = [x0 - tz0 * hw, z0 + tx0 * hw], Bp = [x1 + tz1 * hw, z1 - tx1 * hw];
      const ya = heightAt(A[0], A[1]) + 6.3, yb = heightAt(Bp[0], Bp[1]) + 6.3;
      const D = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), n = Math.max(4, Math.round(D / 0.75));
      let prev = null;
      const warm = hash01(Math.round(x0), Math.round(z0)) < 0.65;
      for (let k = 0; k <= n; k++) {
        const t = k / n, sag = Math.sin(t * Math.PI) * 0.9;
        const p = [A[0] + (Bp[0] - A[0]) * t, ya + (yb - ya) * t - sag, A[1] + (Bp[1] - A[1]) * t];
        if (prev) lineP.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
        prev = p;
        if (k > 0 && k < n) {
          bulbs.push(p[0], p[1] - 0.08, p[2]);
          if (warm) bulbCols.push(1, 0.8, 0.5);
          else { const c = new THREE.Color().setHSL((k * 0.13 + t) % 1, 0.9, 0.62); bulbCols.push(c.r, c.g, c.b); }
        }
      }
    }
  }
  const glowTex = glowTexture();
  let wires = null;
  if (lineP.length) {
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lineP, 3));
    wires = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#1d1f24' }));
    wires.name = 'myeongdong-festoon-wires'; g.add(wires);
  }
  const bulbGeo = new THREE.BufferGeometry();
  bulbGeo.setAttribute('position', new THREE.Float32BufferAttribute(bulbs, 3));
  bulbGeo.setAttribute('color', new THREE.Float32BufferAttribute(bulbCols, 3));
  const bulbMat = new THREE.PointsMaterial({ size: 0.55, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, toneMapped: false });
  const bulbPts = new THREE.Points(bulbGeo, bulbMat); bulbPts.name = 'myeongdong-bulbs'; g.add(bulbPts);
  await tick?.('md-festoons');

  // ---------- 4) 가로등 (차도변) ----------
  const lampSpots = [];
  for (const w of ways) {
    if (!CAR.has(w.k)) continue;
    const pts = w.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    const sides = w.ow ? [1] : [1, -1];
    for (let s = 10; s < L; s += 32) {
      const [x, z, tx, tz] = along(pts, cum, s);
      if (!land.inApron(x, z, -4)) continue;
      for (const sd of sides) {
        const off = sd * (w.w / 2 + 1.0);
        const lx = x - tz * off, lz = z + tx * off;
        if (bldAt(lx, lz, 0.6) || roadAt(lx, lz, 0.2, CAR)) continue;
        lampSpots.push([lx, lz, Math.atan2(sd * tz, -sd * tx)]);
      }
    }
  }
  const lampBuf = new GeoBuf({ uv: false, color: true });
  lampBuf.box(0, 4.2, 0, 0.18, 8.4, 0.18, 0, undefined, hex3('#4a4f57'));
  lampBuf.box(0, 8.3, 0.85, 0.12, 0.12, 1.8, 0, undefined, hex3('#4a4f57'));
  lampBuf.box(0, 8.2, 1.7, 0.36, 0.16, 0.7, 0, undefined, hex3('#d7dbe0'));
  const lampMesh = new THREE.InstancedMesh(lampBuf.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, lampSpots.length));
  lampMesh.name = 'myeongdong-lamps';
  const lampGlowP = [];
  lampSpots.forEach(([x, z, ry], i) => {
    const gy = heightAt(x, z);
    Q.setFromAxisAngle(Y, ry); V.set(x, gy, z); M.compose(V, Q, S1); lampMesh.setMatrixAt(i, M);
    lampGlowP.push(x + Math.sin(ry) * 1.7, gy + 8.05, z + Math.cos(ry) * 1.7);
  });
  lampMesh.count = lampSpots.length; lampMesh.instanceMatrix.needsUpdate = true; lampMesh.computeBoundingSphere();
  if (lampSpots.length) g.add(lampMesh);
  const lgGeo = new THREE.BufferGeometry(); lgGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampGlowP, 3));
  const lampGlowMat = new THREE.PointsMaterial({ size: 5.5, map: glowTex, color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
  const lampGlow = new THREE.Points(lgGeo, lampGlowMat); lampGlow.name = 'myeongdong-lamp-glow'; lampGlow.visible = false; g.add(lampGlow);

  // ---------- 5) 간판 메시 (아틀라스 1장) + 빛 번짐 ----------
  const signMat = new THREE.MeshLambertMaterial({ map: atlas.texture, emissive: '#ffffff', emissiveMap: atlas.texture, emissiveIntensity: 0.32 });
  const signGeo = signBuf.build();
  const signs = signGeo ? new THREE.Mesh(signGeo, signMat) : null;
  if (signs) { signs.name = 'myeongdong-signs'; g.add(signs); }
  const spillMat = new THREE.MeshBasicMaterial({ map: spillTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const spillGeo = spillBuf.build();
  const spill = spillGeo ? new THREE.Mesh(spillGeo, spillMat) : null;
  if (spill) { spill.name = 'myeongdong-spill'; spill.visible = false; g.add(spill); }
  await tick?.('md-signmesh');

  // ---------- 6) 사람 (관광객·쇼핑객) ----------
  const paths = [];
  for (const w of ways) {
    if (!w.pts.some(([x, z]) => land.inBox(x, z, -15))) continue;
    if (WALK_KINDS.has(w.k) || w.k === 'pedestrian') {
      const L = polyLen(w.pts); if (L < 12) continue;
      const weight = (STALL_STREETS.has(w.n) ? 5 : w.n && /명동/.test(w.n) ? 2.5 : 1) * L;
      paths.push({ pts: w.pts, w: Math.max(2, w.w), weight, stall: STALL_STREETS.has(w.n) });
    } else if (CAR.has(w.k)) {
      for (const sd of [-1, 1]) {
        const off = offsetPts(w.pts, sd * (w.w / 2 + 1.7));
        const L = polyLen(off); if (L < 12) continue;
        paths.push({ pts: off, w: 1.6, weight: L * 0.6, stall: false });
      }
    }
  }
  for (const p of paths) { p.cum = [0]; for (let i = 1; i < p.pts.length; i++) p.cum.push(p.cum[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1])); p.L = p.cum[p.cum.length - 1]; }
  const totalW = paths.reduce((s, p) => s + p.weight, 0);
  const mobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || /mobile/i.test(location.search));
  const NP = paths.length ? (mobile ? 170 : 320) : 0;
  const peds = [];
  for (let i = 0; i < NP; i++) {
    let r = rnd() * totalW, p = paths[0];
    for (const q of paths) { r -= q.weight; if (r <= 0) { p = q; break; } }
    let lat = (rnd() * 2 - 1) * Math.max(0.2, p.w / 2 - 0.8);
    if (p.stall && Math.abs(lat) < 1.6) lat = Math.sign(lat || 1) * (1.6 + rnd() * Math.max(0.2, p.w / 2 - 2.2));
    peds.push({ p, s: rnd() * p.L, dir: rnd() < 0.5 ? 1 : -1, lat, v: 0.85 + rnd() * 0.6, ph: rnd() * 6.28, stop: 0 });
  }
  const pg = personGeos();
  const total = NP + vendors.length;
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const headMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const pBody = new THREE.InstancedMesh(pg.body, bodyMat, Math.max(1, total));
  const pHead = new THREE.InstancedMesh(pg.head, headMat, Math.max(1, total));
  pBody.name = 'myeongdong-people'; pHead.name = 'myeongdong-people-heads';
  const clothes = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557', '#ffb703', '#2a9d8f', '#e9c46a', '#f4a261', '#ffffff', '#222222', '#b5838d', '#6d6875', '#8ecae6', '#ff006e', '#3a86ff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < total; i++) pBody.setColorAt(i, clothes[Math.floor(rnd() * clothes.length)]);
  vendors.forEach(([x, z, ry], k) => {
    const i = NP + k; Q.setFromAxisAngle(Y, ry); V.set(x, heightAt(x, z), z); M.compose(V, Q, S1);
    pBody.setMatrixAt(i, M); pHead.setMatrixAt(i, M); pBody.setColorAt(i, new THREE.Color('#f8f9fa'));
  });
  pBody.count = pHead.count = total;
  if (pBody.instanceColor) pBody.instanceColor.needsUpdate = true;
  // 넓은 경계(사람이 움직여도 컬링되지 않게)
  const bs = new THREE.Sphere(new THREE.Vector3((land.bounds.x0 + land.bounds.x1) / 2, 10, (land.bounds.z0 + land.bounds.z1) / 2), 700);
  pBody.boundingSphere = bs; pHead.boundingSphere = bs;
  if (total) g.add(pBody, pHead);

  function updatePeds(dt, pp) {
    if (!NP) return;
    if (pp && Math.hypot(Math.max(0, land.bounds.x0 - pp.x, pp.x - land.bounds.x1), Math.max(0, land.bounds.z0 - pp.z, pp.z - land.bounds.z1)) > 700) return;
    const d = Math.min(0.1, dt);
    for (let i = 0; i < NP; i++) {
      const q = peds[i];
      if (q.stop > 0) q.stop -= d;
      else {
        q.s += q.dir * q.v * d;
        if (q.s < 0) { q.s = 0; q.dir = 1; } else if (q.s > q.p.L) { q.s = q.p.L; q.dir = -1; }
        if (rnd() < d * 0.02) q.stop = 1 + rnd() * 3; // 구경하느라 멈춤
      }
      q.ph += d * q.v * 7;
      const [x, z, tx, tz] = along(q.p.pts, q.p.cum, q.s);
      const px = x - tz * q.lat, pz = z + tx * q.lat;
      const bob = q.stop > 0 ? 0 : Math.abs(Math.sin(q.ph)) * 0.05;
      Q.setFromAxisAngle(Y, Math.atan2(tx * q.dir, tz * q.dir));
      V.set(px, heightAt(px, pz) + bob, pz); M.compose(V, Q, S1);
      pBody.setMatrixAt(i, M); pHead.setMatrixAt(i, M);
    }
    pBody.instanceMatrix.needsUpdate = true; pHead.instanceMatrix.needsUpdate = true;
  }
  updatePeds(0.016, null);
  vendors.forEach(() => {});

  function isBlocked(x, z, r = 0.4) {
    for (const b of block.query(x, z)) {
      const dx = x - b.x, dz = z - b.z;
      const u = Math.abs(dx * b.tx + dz * b.tz), v = Math.abs(-dx * b.tz + dz * b.tx);
      if (u < b.hl + r && v < b.hd + r) return true;
    }
    return false;
  }

  return {
    group: g,
    cosmeticsShops,
    stallSpots: stallSpots.map((s) => ({ x: +s.x.toFixed(1), z: +s.z.toFixed(1), menu: STALL_MENUS[s.menu][1] })),
    isBlocked,
    setNight(v) {
      signMat.emissiveIntensity = 0.32 + v * 0.9;
      signMat.color.setScalar(1 - v * 0.35);
      spillMat.opacity = v * 0.5; if (spill) spill.visible = v > 0.02;
      bulbMat.opacity = 0.35 + v * 0.65; bulbMat.size = 0.55 + v * 0.35;
      lampGlowMat.opacity = v * 0.8; lampGlow.visible = v > 0.02;
      canMat.emissiveIntensity = v * 0.22;
      stallMat.color.setScalar(1 - v * 0.25);
      bodyMat.color.setScalar(1 - v * 0.3); headMat.color.setScalar(1 - v * 0.3);
    },
    update(dt, pp) { updatePeds(dt, pp); },
    stats() { return { fronts: nFront, signs: nSign, blades: nBlade, stalls: stallN, lamps: lampSpots.length, bulbs: bulbs.length / 3, peds: NP, signVerts: signGeo ? signGeo.attributes.position.count : 0 }; },
  };
}

function offsetPts(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    return [p[0] - tz * off, p[1] + tx * off];
  });
}
