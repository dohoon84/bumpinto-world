// [bump24game] BUMP24 매장 내부 전용 Scene (도시와 분리). 레퍼런스 사진(interior-1..6) 기준.
//   정적 가구는 재질별로 한 지오메트리에 굽고(정점색·AO 그라데이션), 상품은 아틀라스 UV를 구운 한 덩어리.
//   draw: 일반·금속·바닥·간판·데칼·유리·상품 + 직원 2 + 바구니 2 + 화살표 1 + 플레이어 아바타
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { clerkSource } from '../corridor/bp24.js';
import { SHAPES, productAtlasCached, ProductBatch, planLayout, singleProductGeometry } from './products.js';
import { buildSignAtlas, buildFloorTexture, R, uvr, tagRect } from './signs.js';
import { createBasket } from './basket.js';

export const STORE = { X0: -5, X1: 5, Z0: 0, Z1: 8, H: 3.0 };
const PR = 0.23; // 플레이어 반지름
const YAW_TRY = [0, 0.22, -0.22, 0.45, -0.45, 0.7, -0.7, 0.95, -0.95, 1.2, -1.2, 1.45, -1.45];
const WALK = 2.6, RUN = 3.9;

// ---------- 정점색 지오메트리 모음 ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3();
class Bag {
  constructor(rgba = false) { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.rgba = rgba; }
  _v(x, y, z, nx, ny, nz, col, u, v) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); if (this.rgba) this.c.push(col[3] ?? 1); this.u.push(u, v); }
  /** 사각형: 가운데 c, 법선 n, 위 up, 너비 w, 높이 h. colB=아래쪽 색(AO) */
  quad(c, n, up, w, h, col, uv = UVW, colB = col) {
    _r.crossVectors(up, n).normalize();
    const b = this.p.length / 3, hw = w / 2, hh = h / 2;
    const P = (sx, sy) => [c.x + _r.x * hw * sx + up.x * hh * sy, c.y + _r.y * hw * sx + up.y * hh * sy, c.z + _r.z * hw * sx + up.z * hh * sy];
    const corners = [[-1, -1, uv[0], uv[1], colB], [1, -1, uv[2], uv[1], colB], [1, 1, uv[2], uv[3], col], [-1, 1, uv[0], uv[3], col]];
    for (const [sx, sy, u, v, cc] of corners) { const q = P(sx, sy); this._v(q[0], q[1], q[2], n.x, n.y, n.z, cc, u, v); }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /** 축 정렬 상자. ao: 바닥 닿는 옆면 아래쪽 어둡게(0..1). skip: 'b' 아래, 't' 위, 'x+','x-','z+','z-' */
  box(x0, y0, z0, x1, y1, z1, hex, { ao = 0.32, skip = 'b', top = null } = {}) {
    const col = toC(hex), dark = ao && y0 < 0.06 ? col.map((v, k) => (k < 3 ? v * (1 - ao) : v)) : col;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const S = (k) => skip.split(' ').includes(k);
    if (!S('x+')) this.quad(_a.set(x1, cy, cz), V(1, 0, 0), UP, d, h, col, UVW, dark);
    if (!S('x-')) this.quad(_a.set(x0, cy, cz), V(-1, 0, 0), UP, d, h, col, UVW, dark);
    if (!S('z+')) this.quad(_a.set(cx, cy, z1), V(0, 0, 1), UP, w, h, col, UVW, dark);
    if (!S('z-')) this.quad(_a.set(cx, cy, z0), V(0, 0, -1), UP, w, h, col, UVW, dark);
    if (!S('t')) this.quad(_a.set(cx, y1, cz), V(0, 1, 0), V(0, 0, -1), w, d, top ? toC(top) : col.map((v, k) => (k < 3 ? Math.min(1, v * 1.04) : v)));
    if (!S('b')) this.quad(_a.set(cx, y0, cz), V(0, -1, 0), V(0, 0, 1), w, d, col);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, this.rgba ? 4 : 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : this.i);
    g.computeBoundingSphere();
    return g;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const UVW = uvr(R.WHITE, 3);
const _col = new THREE.Color();
function toC(hex, a = 1) { if (Array.isArray(hex)) return hex.length === 3 ? [...hex, a] : hex; _col.set(hex); return [_col.r, _col.g, _col.b, a]; }

// ---------- 내부 만들기 ----------
export function buildInterior({ renderer = null, storeId = 'seongnam-cityhall', storeName = 'BUMP24', dateKey, look = null, isMobile = false } = {}) {
  const layout = planLayout(storeId, dateKey);
  const rng = layout.rng;
  const sale = new Set(layout.saleIds);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1220');
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 60);

  // 환경광(바닥·유리·금속 반사) — RoomEnvironment 한 번 굽기
  let pmrem = null, envRT = null;
  try { const R0 = renderer; if (R0) { pmrem = new THREE.PMREMGenerator(R0); envRT = pmrem.fromScene(new RoomEnvironment(), 0.04); scene.environment = envRT.texture; scene.environmentIntensity = 0.55; } } catch { /* 환경맵 없이도 동작 */ }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(1.5, 6, 2.5); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdbe9ff, 0.35); fill.position.set(-3, 3, 6); scene.add(fill);

  const signAtlas = buildSignAtlas({ storeName, saleIds: layout.saleIds });
  const prodAtlas = productAtlasCached();
  const floorTex = buildFloorTexture(); floorTex.repeat.set(10 / 0.6, 8 / 0.6);

  const mat = {
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.65 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.16, metalness: 0.0, envMapIntensity: 1.3 }),
    sign: new THREE.MeshBasicMaterial({ map: signAtlas.tex, vertexColors: true, toneMapped: false }),
    decal: new THREE.MeshBasicMaterial({ map: signAtlas.tex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    glass: new THREE.MeshStandardMaterial({ color: '#d8eef7', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.95, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide }),
    prod: new THREE.MeshStandardMaterial({ map: prodAtlas.tex, roughness: 0.42, metalness: 0.02, envMapIntensity: 0.6 }),
    clerk: new THREE.MeshBasicMaterial({ vertexColors: true }),
    arrow: null,
  };
  mat.arrow = mat.decal.clone(); mat.arrow.depthTest = false;

  const lit = new Bag(), metal = new Bag(), sign = new Bag(), decal = new Bag(true), glass = new Bag();
  const batch = new ProductBatch();
  const obstacles = [];
  const facings = []; // { id, item, x, y, z, nx, nz, inst:[{s,c}], area, slow }
  const block = (x0, z0, x1, z1, h = 3) => obstacles.push([x0, z0, x1, z1, h]);
  const signQ = (c, n, up, w, h, rect, col = '#ffffff') => sign.quad(c, n, up, w, h, toC(col), uvr(rect));
  const decalQ = (c, n, up, w, h, rect, col, a) => decal.quad(c, n, up, w, h, toC(col, a), uvr(rect));
  const shadow = (x0, z0, x1, z1, a = 0.5, pad = 0.2) => decalQ(V((x0 + x1) / 2, 0.003, (z0 + z1) / 2), UP, V(0, 0, -1), x1 - x0 + pad * 2, z1 - z0 + pad * 2, R.SOFT, '#000000', a);
  const floorGlow = (x0, z0, x1, z1, col, a) => decalQ(V((x0 + x1) / 2, 0.004, (z0 + z1) / 2), UP, V(0, 0, -1), x1 - x0, z1 - z0, R.SOFT, col, a);
  const { X0, X1, Z0, Z1, H } = STORE;

  // ---------- 방: 바닥·벽·천장·LED ----------
  const floorGeo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0); floorGeo.rotateX(-Math.PI / 2); floorGeo.translate(0, 0, (Z0 + Z1) / 2);
  const WALL = '#eef1f4', BASE = '#8d96a1';
  // 뒷벽·왼벽·오른벽 (안쪽을 보게) + 걸레받이 + 바닥 AO 띠
  lit.quad(V(0, H / 2, Z1), V(0, 0, -1), UP, X1 - X0, H, toC(WALL), UVW, toC('#d9dee4'));
  lit.quad(V(X0, H / 2, 4), V(1, 0, 0), UP, Z1 - Z0, H, toC(WALL), UVW, toC('#d9dee4'));
  lit.quad(V(X1, H / 2, 4), V(-1, 0, 0), UP, Z1 - Z0, H, toC(WALL), UVW, toC('#d9dee4'));
  lit.box(X0, 0, Z0, X0 + 0.02, 0.1, Z1, BASE, { ao: 0 }); lit.box(X1 - 0.02, 0, Z0, X1, 0.1, Z1, BASE, { ao: 0 }); lit.box(X0, 0, Z1 - 0.02, X1, 0.1, Z1, BASE, { ao: 0 });
  for (const [c, n, w] of [[V(0, 0.2, Z1 - 0.03), V(0, 0, -1), 10], [V(X0 + 0.03, 0.2, 4), V(1, 0, 0), 8], [V(X1 - 0.03, 0.2, 4), V(-1, 0, 0), 8]]) decalQ(c, n, UP, w, 0.4, R.SHADE, '#000000', 0.22);
  // 천장 + 타일 줄눈 + LED 줄조명(통로 따라 z 방향) + 바닥 반사 줄
  lit.quad(V(0, H, 4), V(0, -1, 0), V(0, 0, 1), 10, 8, toC('#f3f5f7'));
  for (let x = -4.4; x < 5; x += 0.6) lit.quad(V(x, H - 0.002, 4), V(0, -1, 0), V(0, 0, 1), 0.012, 8, toC('#c9cfd6'));
  for (let z = 0.6; z < 8; z += 0.6) lit.quad(V(0, H - 0.002, z), V(0, -1, 0), V(0, 0, 1), 10, 0.012, toC('#c9cfd6'));
  const LEDX = [-3.35, -1.05, 1.05, 3.35];
  for (const x of LEDX) {
    lit.box(x - 0.07, H - 0.06, 0.7, x + 0.07, H - 0.001, 7.05, '#d7dce2', { ao: 0, skip: 'b t' });
    signQ(V(x, H - 0.062, 3.875), V(0, -1, 0), V(0, 0, 1), 0.1, 6.35, R.LED);
    decalQ(V(x, 0.005, 3.9), UP, V(0, 0, -1), 0.7, 6.6, R.STREAK, '#ffffff', 0.2);
  }
  lit.box(-4.2, H - 0.06, 1.0, 4.2, H - 0.001, 1.14, '#d7dce2', { ao: 0, skip: 'b t' }); signQ(V(0, H - 0.062, 1.07), V(0, -1, 0), V(0, 0, 1), 8.3, 0.1, R.LED);
  // 천장 돔 카메라·스피커
  metal.box(2.6, H - 0.12, 2.0, 2.76, H, 2.16, '#1e2228', { ao: 0 });
  // 앞벽: 아래판 + 창 + 문 + 위 벽 + 창밖 배경
  lit.box(X0, 0, -0.04, -0.8, 0.45, 0.02, '#e3e7eb', { ao: 0.15 }); lit.box(0.8, 0, -0.04, X1, 0.45, 0.02, '#e3e7eb', { ao: 0.15 });
  lit.quad(V(0, 2.7, 0.02), V(0, 0, 1), UP, 10, 0.6, toC(WALL));
  for (const x of [X0 + 0.03, -3.6, -2.2, -0.8, 0.8, 2.2, 3.6, X1 - 0.03]) metal.box(x - 0.035, 0.45, -0.04, x + 0.035, 2.4, 0.03, '#23272e', { ao: 0 });
  metal.box(X0, 2.36, -0.04, X1, 2.42, 0.03, '#23272e', { ao: 0 }); metal.box(X0, 0.42, -0.04, X1, 0.47, 0.03, '#23272e', { ao: 0 });
  for (const [a0, a1] of [[X0, -0.8], [0.8, X1]]) glass.quad(V((a0 + a1) / 2, 1.42, 0.0), V(0, 0, 1), UP, a1 - a0, 1.92, [1, 1, 1]);
  // 문(두 짝, 유리 + 검은 테 + 손잡이 + 당기세요 스티커)
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -0.78 : 0.02, xb = s < 0 ? -0.02 : 0.78;
    metal.box(xa, 0, -0.03, xb, 0.06, 0.03, '#23272e', { ao: 0 }); metal.box(xa, 2.22, -0.03, xb, 2.3, 0.03, '#23272e', { ao: 0 });
    metal.box(xa, 0, -0.03, xa + 0.05, 2.3, 0.03, '#23272e', { ao: 0 }); metal.box(xb - 0.05, 0, -0.03, xb, 2.3, 0.03, '#23272e', { ao: 0 });
    glass.quad(V((xa + xb) / 2, 1.14, 0), V(0, 0, 1), UP, xb - xa - 0.1, 2.16, [1, 1, 1]);
    metal.box(s < 0 ? -0.12 : 0.08, 0.85, 0.03, s < 0 ? -0.08 : 0.12, 1.35, 0.07, '#c7ccd2', { ao: 0 });
    decalQ(V((xa + xb) / 2, 1.18, 0.035), V(0, 0, 1), UP, 0.5, 0.125, R.DOOR, '#ffffff', 1);
  }
  signQ(V(0, 2.58, 0.04), V(0, 0, 1), UP, 0.5, 0.25, R.EXIT);
  // 창밖: 보도 + 밤거리 배경
  sign.quad(V(0, 0.001, -4.5), UP, V(0, 0, -1), 40, 9, toC('#262b33'), UVW);
  sign.quad(V(0, 0.002, -1.2), UP, V(0, 0, -1), 40, 2.4, toC('#3a3f48'), UVW); // 보도
  signQ(V(0, 3.2, -9), V(0, 0, 1), UP, 42, 13.2, R.STREET);
  // 입구 매트 + 바구니 더미 자리
  lit.box(-0.85, 0, 0.06, 0.85, 0.01, 0.95, '#56606b', { ao: 0 }); signQ(V(0, 0.016, 0.5), UP, V(0, 0, 1), 0.5, 0.5, R.LOGO, '#d8dde3');

  // ---------- 상품 진열 도우미 ----------
  const ROT = new THREE.Matrix4(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S1 = new THREE.Vector3(1, 1, 1), P3 = new THREE.Vector3();
  function put(item, x, y, z, ry, { rx = 0, rz = 0 } = {}) {
    E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E); M4.compose(P3.set(x, y, z), Q, S1);
    const s = batch.pos.length / 3; batch.add(item, M4); return { s, c: batch.pos.length / 3 - s };
  }
  const SMALL = new Set(['can', 'pet', 'soju', 'gimbap', 'ice', 'hot', 'pouch', 'wine']);
  /** 선반 한 줄: 앞선(ax,az)→(bx,bz), 높이 y, 바깥 법선(nx,nz). pool 에서 상품을 골라 여러 페이싱으로 채움 */
  function stockRow({ ax, az, bx, bz, y, nx, nz, maxH = 0.32, pool, rows = 1, stackMax = 2, slow = 0, area = 'shelf', tags = true, tilt = 0, inset = 0.02 }) {
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const ry = Math.atan2(nx, nz);
    let cur = 0.015, k = Math.floor(rng() * pool.length);
    while (cur < len - 0.06) {
      const item = pool[k++ % pool.length], S = SHAPES[item.shape];
      let n = SMALL.has(item.shape) ? 3 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 2);
      const gw = S.w + 0.006; n = Math.min(n, Math.floor((len - cur) / gw)); if (n < 1) break;
      const stack = Math.max(1, Math.min(stackMax, Math.floor(maxH / (S.h + 0.004))));
      const f = { id: `f${facings.length}`, item, nx, nz, inst: [], area, slow, x: 0, y: y + S.h * 0.5, z: 0 };
      const c0 = cur + (n * gw) / 2;
      f.x = ax + dx * c0 + nx * 0.02; f.z = az + dz * c0 + nz * 0.02;
      for (let r = rows - 1; r >= 0; r--) for (let i = 0; i < n; i++) for (let j = 0; j < stack; j++) {
        const along = cur + (i + 0.5) * gw + (rng() - 0.5) * 0.004, back = inset + S.d / 2 + r * (S.d + 0.01);
        f.inst.push(put(item, ax + dx * along - nx * back, y + j * (S.h + 0.002), az + dz * along - nz * back, ry + (rng() - 0.5) * 0.06, { rx: tilt }));
      }
      f.inst.reverse(); // 앞줄·위칸부터 집기
      facings.push(f);
      if (tags) {
        const isSale = sale.has(item.id);
        sign.quad(V(f.x - nx * 0.012, y - 0.022, f.z - nz * 0.012), V(nx, 0, nz), UP, 0.088, 0.03, toC('#ffffff'), uvr(tagRect(item.idx, isSale)));
        if (isSale) decalQ(V(f.x + dx * (n * gw / 2 - 0.03) + nx * 0.004, y + 0.04, f.z + dz * (n * gw / 2 - 0.03) + nz * 0.004), V(nx, 0, nz), UP, 0.085, 0.085, R.STICKER, '#ffffff', 1);
      }
      cur += n * gw + 0.012;
    }
  }
  const zonePool = (...zs) => zs.flatMap((z) => layout.byZone[z] || []);
  const rail = (ax, az, bx, bz, y, nx, nz, rect = R.RAIL) => {
    const len = Math.hypot(bx - ax, bz - az);
    sign.quad(V((ax + bx) / 2 + nx * 0.008, y - 0.022, (az + bz) / 2 + nz * 0.008), V(nx, 0, nz), UP, len, 0.04, toC('#ffffff'), uvr(rect, 2));
  };

  // ---------- 곤돌라 3개(양면, 1.65m) ----------
  const GX = [-2.1, 0, 2.1], GZ0 = 3.5, GZ1 = 6.1, GH = 1.65, LV = [0.11, 0.47, 0.83, 1.19];
  const faceSpec = [['ramen', 'ramen', 'ramen', 'snack'], ['snack', 'snack', 'snack', 'snack'], ['snack', 'ramen', 'snack', 'ramen'], ['pouch', 'pouch', 'ramen', 'snack'], ['ramen', 'snack', 'ramen', 'snack'], ['snack', 'pouch', 'snack', 'ramen']];
  GX.forEach((cx, gi) => {
    const x0 = cx - 0.45, x1 = cx + 0.45;
    block(x0, GZ0, x1, GZ1, 1.7);
    shadow(x0, GZ0, x1, GZ1, 0.55, 0.22);
    lit.box(x0 + 0.02, 0, GZ0, x1 - 0.02, 0.1, GZ1, '#5b636d', { ao: 0.1 }); // 받침
    lit.box(cx - 0.025, 0.1, GZ0, cx + 0.025, GH, GZ1, '#f4f6f8', { ao: 0 }); // 등판
    // 등판 구멍판 느낌: 아래쪽 어둡게(AO)
    for (const s of [-1, 1]) decalQ(V(cx + s * 0.027, 0.42, (GZ0 + GZ1) / 2), V(s, 0, 0), UP, GZ1 - GZ0, 0.64, R.SHADE, '#000000', 0.18);
    for (const z of [GZ0, GZ1]) lit.box(x0, 0, z - (z === GZ0 ? 0 : 0.03), x1, GH, z + (z === GZ0 ? 0.03 : 0), '#ffffff', { ao: 0.25 }); // 끝판
    lit.box(x0, GH - 0.02, GZ0, x1, GH + 0.03, GZ1, '#e7ebef', { ao: 0 }); // 윗덮개
    for (const s of [-1, 1]) {
      const fx = cx + s * 0.45, spec = faceSpec[gi * 2 + (s > 0 ? 1 : 0)];
      LV.forEach((y, li) => {
        metal.box(Math.min(cx + s * 0.03, fx), y - 0.025, GZ0 + 0.03, Math.max(cx + s * 0.03, fx), y, GZ1 - 0.03, '#e9edf1', { ao: 0 });
        rail(fx, GZ0 + 0.03, fx, GZ1 - 0.03, y, s, 0, li === 1 ? R.RAILY : R.RAIL);
        stockRow({ ax: fx, az: s > 0 ? GZ0 + 0.04 : GZ1 - 0.04, bx: fx, bz: s > 0 ? GZ1 - 0.04 : GZ0 + 0.04, y, nx: s, nz: 0, maxH: li === 3 ? 0.4 : 0.33, pool: zonePool(spec[li]), stackMax: 2 });
      });
    }
    // 매달린 통로 안내판 (곤돌라 앞끝 위)
    metal.box(cx - 0.006, 2.5, GZ0 + 0.5, cx + 0.006, H, GZ0 + 0.51, '#9aa1a9', { ao: 0 });
    lit.box(cx - 0.5, 2.2, GZ0 + 0.48, cx + 0.5, 2.48, GZ0 + 0.53, '#2a3340', { ao: 0 });
    signQ(V(cx, 2.34, GZ0 + 0.475), V(0, 0, -1), UP, 0.98, 0.26, R[`AISLE${gi}`]);
    signQ(V(cx, 2.34, GZ0 + 0.535), V(0, 0, 1), UP, 0.98, 0.26, R[`AISLE${gi}`]);
    // 앞끝판 포스터(오늘의 2배)
    if (gi !== 1) signQ(V(cx, 1.05, GZ0 - 0.002), V(0, 0, -1), UP, 0.78, 0.65, R.POSTER);
  });

  // ---------- 블랙 오픈 냉장고(가운데 곤돌라 앞) ----------
  {
    const x0 = -0.42, x1 = 0.42, z0 = 2.88, z1 = 3.48;
    block(x0, z0, x1, z1, 1.95); shadow(x0, z0, x1, z1, 0.5, 0.2); floorGlow(x0, z0 - 0.75, x1, z0, '#bfe6ff', 0.35);
    lit.box(x0, 0, z0 + 0.02, x1, 1.92, z1, '#16191e', { ao: 0, skip: 'b z-' });
    lit.box(x0, 0, z0, x1, 0.22, z0 + 0.6, '#16191e', { ao: 0.1, skip: 'b' });
    lit.box(x0, 1.58, z0, x1, 1.92, z0 + 0.1, '#16191e', { ao: 0, skip: 'b' });
    lit.box(x0, 0.22, z0, x0 + 0.04, 1.58, z1, '#16191e', { ao: 0 }); lit.box(x1 - 0.04, 0.22, z0, x1, 1.58, z1, '#16191e', { ao: 0 });
    signQ(V(0, 0.9, z1 - 0.03), V(0, 0, -1), UP, 0.76, 1.36, R.GLOW);
    signQ(V(0, 1.75, z0 - 0.002), V(0, 0, -1), UP, 0.82, 0.28, R.COLD);
    [0.25, 0.6, 0.95, 1.3].forEach((y) => {
      metal.box(x0 + 0.04, y - 0.02, z0 + 0.03, x1 - 0.04, y, z1 - 0.04, '#30353c', { ao: 0 });
      rail(x1 - 0.04, z0 + 0.03, x0 + 0.04, z0 + 0.03, y, 0, -1);
      stockRow({ ax: x1 - 0.05, az: z0 + 0.04, bx: x0 + 0.05, bz: z0 + 0.04, y, nx: 0, nz: -1, maxH: 0.32, pool: zonePool('drink', 'pouch'), rows: 1, stackMax: 1 });
    });
  }

  // ---------- 왼벽 아이스크림 냉동고(유리 뚜껑) + 앞쪽 섬 냉동고 ----------
  function chestFreezer(x0, z0, x1, z1, items) {
    block(x0, z0, x1, z1, 0.92); shadow(x0, z0, x1, z1, 0.5, 0.2);
    const h = 0.86;
    lit.box(x0, 0, z0, x1, h - 0.04, z1, '#f6f8fa', { ao: 0.4, skip: 'b t' });
    lit.box(x0 + 0.02, 0, z0 + 0.02, x1 - 0.02, 0.1, z1 - 0.02, '#4a525c', { ao: 0 });
    metal.box(x0 - 0.01, h - 0.05, z0 - 0.01, x1 + 0.01, h, z0 + 0.05, '#c9ced4', { ao: 0 }); metal.box(x0 - 0.01, h - 0.05, z1 - 0.05, x1 + 0.01, h, z1 + 0.01, '#c9ced4', { ao: 0 });
    metal.box(x0 - 0.01, h - 0.05, z0, x0 + 0.05, h, z1, '#c9ced4', { ao: 0 }); metal.box(x1 - 0.05, h - 0.05, z0, x1 + 0.01, h, z1, '#c9ced4', { ao: 0 });
    // 속(빛나는 통) — 바닥 + 4 안벽
    const ix0 = x0 + 0.05, ix1 = x1 - 0.05, iz0 = z0 + 0.05, iz1 = z1 - 0.05, by = 0.42;
    signQ(V((ix0 + ix1) / 2, by, (iz0 + iz1) / 2), UP, V(0, 0, -1), ix1 - ix0, iz1 - iz0, R.COOL, '#cfe9fb');
    sign.quad(V(ix0, (by + h) / 2, (iz0 + iz1) / 2), V(1, 0, 0), UP, iz1 - iz0, h - by, toC('#f4fbff'), uvr(R.COOL, 3), toC('#a9cfe6'));
    sign.quad(V(ix1, (by + h) / 2, (iz0 + iz1) / 2), V(-1, 0, 0), UP, iz1 - iz0, h - by, toC('#f4fbff'), uvr(R.COOL, 3), toC('#a9cfe6'));
    sign.quad(V((ix0 + ix1) / 2, (by + h) / 2, iz0), V(0, 0, 1), UP, ix1 - ix0, h - by, toC('#f4fbff'), uvr(R.COOL, 3), toC('#a9cfe6'));
    sign.quad(V((ix0 + ix1) / 2, (by + h) / 2, iz1), V(0, 0, -1), UP, ix1 - ix0, h - by, toC('#f4fbff'), uvr(R.COOL, 3), toC('#a9cfe6'));
    // 유리 뚜껑 2장(살짝 겹침) + 손잡이
    const mz = (z0 + z1) / 2;
    glass.quad(V((x0 + x1) / 2, h + 0.004, (z0 + mz) / 2 + 0.03), UP, V(0, 0, -1), x1 - x0 - 0.06, mz - z0 + 0.04, [1, 1, 1]);
    glass.quad(V((x0 + x1) / 2, h + 0.018, (mz + z1) / 2 - 0.03), UP, V(0, 0, -1), x1 - x0 - 0.06, z1 - mz + 0.04, [1, 1, 1]);
    metal.box((x0 + x1) / 2 - 0.2, h + 0.02, mz + 0.02, (x0 + x1) / 2 + 0.2, h + 0.035, mz + 0.05, '#aeb5bd', { ao: 0 });
    // 내용물: 눕힌 아이스크림(앞면이 위로) 2겹, 상품별 구역
    const per = Math.ceil((ix1 - ix0 - 0.02) / 0.066), alongX = ix1 - ix0 > iz1 - iz0;
    const L = alongX ? ix1 - ix0 : iz1 - iz0, Wd = alongX ? iz1 - iz0 : ix1 - ix0;
    const nAlong = Math.floor((L - 0.02) / 0.066), nAcross = Math.floor((Wd - 0.02) / 0.18);
    const groups = items.length, seg = Math.ceil(nAlong / groups);
    for (let g = 0; g < groups; g++) {
      const item = items[g];
      const f = { id: `f${facings.length}`, item, nx: 0, nz: 0, inst: [], area: 'freezer', slow: 0.05, x: 0, y: h, z: 0, top: true };
      for (let layer = 1; layer >= 0; layer--) for (let a = g * seg; a < Math.min(nAlong, (g + 1) * seg); a++) for (let b = 0; b < nAcross; b++) {
        const ua = 0.044 + a * 0.066 + (rng() - 0.5) * 0.012, ub = 0.02 + b * 0.18 + 0.17 + (rng() - 0.5) * 0.02;
        const x = alongX ? ix0 + ua : ix0 + ub, z = alongX ? iz0 + ub : iz0 + ua;
        const yaw = (alongX ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.35;
        f.inst.push(put(item, x, by + 0.03 + layer * 0.034, z, yaw, { rx: -Math.PI / 2 + (rng() - 0.5) * 0.15 }));
      }
      const ca = (g * seg + Math.min(nAlong, (g + 1) * seg)) / 2 * 0.066 + 0.03;
      f.x = alongX ? ix0 + ca : (ix0 + ix1) / 2; f.z = alongX ? (iz0 + iz1) / 2 : iz0 + ca;
      facings.push(f);
      if (sale.has(item.id)) decalQ(V(f.x, h + 0.03, f.z), UP, V(0, 0, -1), 0.12, 0.12, R.STICKER, '#ffffff', 1);
    }
    void per;
    return { x0, z0, x1, z1, h };
  }
  const ice = zonePool('freezer');
  {
    const fz = chestFreezer(-4.95, 4.7, -4.18, 6.2, ice);
    signQ(V(-4.18 + 0.003, 0.58, 5.45), V(1, 0, 0), UP, 1.3, 0.24, R.ICE);
    signQ(V(-4.985, 1.85, 5.45), V(1, 0, 0), UP, 0.9, 0.75, R.POSTER);
    void fz;
  }
  {
    chestFreezer(0.95, 1.55, 2.6, 2.3, [ice[2], ice[3], ice[0]]);
    signQ(V(1.775, 0.58, 1.548), V(0, 0, -1), UP, 1.3, 0.24, R.ICE);
  }

  // ---------- 오른벽 유리문 음료 냉장고(속 발광) ----------
  {
    const x0 = 4.25, x1 = 5.0, z0 = 0.9, z1 = 7.25, top = 2.3;
    block(x0, z0, x1, z1); floorGlow(x0 - 0.9, z0 + 0.1, x0, z1 - 0.1, '#cfeeff', 0.32);
    lit.box(x0, 0, z0, x1, 0.12, z1, '#1d2127', { ao: 0 });
    lit.box(x0, top, z0, x1, H, z1, '#1d2127', { ao: 0 });
    lit.box(x0, 0, z0, x1, top, z0 + 0.06, '#1d2127', { ao: 0 }); lit.box(x0, 0, z1 - 0.06, x1, top, z1, '#1d2127', { ao: 0 });
    signQ(V(4.93, (0.12 + top) / 2, (z0 + z1) / 2), V(-1, 0, 0), UP, z1 - z0 - 0.12, top - 0.12, R.GLOW);
    sign.quad(V(4.6, top - 0.005, (z0 + z1) / 2), V(0, -1, 0), V(1, 0, 0), z1 - z0, 0.06, toC('#ffffff'), uvr(R.LED)); // 안 LED
    signQ(V(x0 - 0.002, 2.62, (z0 + z1) / 2), V(-1, 0, 0), UP, z1 - z0 - 0.2, 0.42, R.BEV);
    const LVF = [0.14, 0.52, 0.9, 1.28, 1.66];
    const drinks = zonePool('drink');
    LVF.forEach((y, li) => {
      metal.box(x0 + 0.05, y - 0.02, z0 + 0.06, 4.92, y, z1 - 0.06, '#9aa3ad', { ao: 0 });
      rail(x0 + 0.06, z1 - 0.07, x0 + 0.06, z0 + 0.07, y, -1, 0);
      const pool = li >= 3 ? drinks.filter((p) => p.shape === 'pet') : li === 0 ? drinks.filter((p) => p.shape === 'pet') : drinks.filter((p) => p.shape === 'can');
      stockRow({ ax: x0 + 0.08, az: z1 - 0.1, bx: x0 + 0.08, bz: z0 + 0.1, y, nx: -1, nz: 0, maxH: 0.34, pool, rows: 1, stackMax: li === 1 ? 2 : 1, area: 'fridge', tags: true, inset: 0.03 });
    });
    const nd = 8, dw = (z1 - z0) / nd;
    for (let d = 0; d <= nd; d++) metal.box(x0 - 0.03, 0.12, z0 + d * dw - 0.025, x0 + 0.01, top, z0 + d * dw + 0.025, '#2a2f36', { ao: 0 });
    for (let d = 0; d < nd; d++) {
      glass.quad(V(x0 - 0.01, (0.12 + top) / 2, z0 + (d + 0.5) * dw), V(-1, 0, 0), UP, dw - 0.05, top - 0.12, [1, 1, 1]);
      metal.box(x0 - 0.06, 0.8, z0 + (d + 1) * dw - 0.1, x0 - 0.03, 1.55, z0 + (d + 1) * dw - 0.075, '#d5dade', { ao: 0 });
    }
  }

  // ---------- 뒷벽 냉장 케이스(청록 머리: 샐러드&디저트 / 와인·주류) ----------
  {
    const z0 = 7.25, z1 = 8.0, x0 = -4.95, xm = 1.8, x1 = 4.25;
    block(-5, z0, 5, z1); shadow(x0, z0, x1, z0 + 0.1, 0.45, 0.25);
    lit.box(x0, 0, z0, x1, 0.32, z1, '#3d454f', { ao: 0.1 });
    lit.box(x0, 1.92, z0 - 0.08, x1, 2.36, z1, '#f4f6f8', { ao: 0 });
    signQ(V((x0 + xm) / 2, 2.14, z0 - 0.082), V(0, 0, -1), UP, xm - x0 - 0.04, 0.4, R.TEAL);
    signQ(V((xm + x1) / 2, 2.14, z0 - 0.082), V(0, 0, -1), UP, x1 - xm - 0.04, 0.4, R.WINE);
    sign.quad(V((x0 + x1) / 2, 1.915, z0 + 0.1), V(0, -1, 0), V(0, 0, 1), x1 - x0, 0.05, toC('#ffffff'), uvr(R.LED));
    signQ(V((x0 + x1) / 2, 1.12, z1 - 0.04), V(0, 0, -1), UP, x1 - x0, 1.6, R.GLOW);
    for (const x of [x0, xm, x1]) lit.box(x - 0.03, 0.32, z0, x + 0.03, 1.92, z1, '#e6eaee', { ao: 0 });
    const LVB = [0.34, 0.74, 1.12, 1.5];
    LVB.forEach((y, li) => {
      metal.box(x0, y - 0.02, z0 + 0.02, x1, y, z1 - 0.08, '#c3cad1', { ao: 0 });
      rail(x0 + 0.04, z0 + 0.02, xm - 0.04, z0 + 0.02, y, 0, -1, li % 2 ? R.RAILY : R.RAIL); rail(xm + 0.04, z0 + 0.02, x1 - 0.04, z0 + 0.02, y, 0, -1);
      const fresh = zonePool('fresh');
      const pool = li === 0 ? fresh.filter((p) => p.shape === 'gimbap') : li === 1 ? fresh.filter((p) => p.shape === 'lunch') : li === 2 ? fresh.filter((p) => p.shape === 'gimbap') : zonePool('drink').filter((p) => p.shape === 'pet');
      const isLunch = li === 1;
      stockRow({ ax: xm - 0.05, az: z0 + 0.03, bx: x0 + 0.05, bz: z0 + 0.03, y, nx: 0, nz: -1, maxH: 0.34, pool, rows: 1, stackMax: isLunch ? 2 : 1, area: 'fresh', tilt: isLunch ? -0.45 : 0 });
      const alc = li >= 2 ? zonePool('premium') : zonePool('alcohol');
      stockRow({ ax: x1 - 0.05, az: z0 + 0.03, bx: xm + 0.05, bz: z0 + 0.03, y, nx: 0, nz: -1, maxH: 0.36, pool: alc, rows: 1, stackMax: 1, area: 'alcohol', slow: li >= 2 ? 0.12 : 0 });
    });
  }

  // ---------- 계산대(왼쪽 앞, +x 를 봄) + 직원 + 뒤 진열장(선물세트) ----------
  const COUNTER = { x0: -3.6, x1: -2.95, z0: 0.55, z1: 2.85, h: 1.0 };
  {
    const { x0, x1, z0, z1, h } = COUNTER;
    block(-5, 0.4, x1, 3.05, 2.1); shadow(x0, z0, x1, z1, 0.5, 0.18);
    lit.box(x0, 0, z0, x1, h - 0.04, z1, '#ffffff', { ao: 0.35, skip: 'b x+' });
    signQ(V(x1 + 0.001, (h - 0.04) / 2, (z0 + z1) / 2), V(1, 0, 0), UP, z1 - z0, h - 0.04, R.COUNTER);
    lit.box(x0 - 0.02, h - 0.04, z0 - 0.02, x1 + 0.04, h, z1 + 0.02, '#a8794e', { ao: 0, top: '#b98a5c' }); // 나무 상판
    lit.box(x1 - 0.02, 0, z0, x1 + 0.02, 0.08, z1, '#3d454f', { ao: 0 });
    // POS(직원 쪽 화면) + 손님 디스플레이 + 카드단말 + 스캐너 + 라이터·껌 진열
    lit.box(-3.5, h, 1.45, -3.3, h + 0.06, 1.85, '#2b3038', { ao: 0 });
    lit.box(-3.46, h + 0.06, 1.55, -3.42, h + 0.3, 1.75, '#2b3038', { ao: 0 });
    lit.box(-3.44, h + 0.22, 1.47, -3.36, h + 0.48, 1.83, '#1b1f25', { ao: 0 });
    signQ(V(-3.442, h + 0.35, 1.65), V(-1, 0, 0), UP, 0.32, 0.22, R.POS);
    signQ(V(-3.358, h + 0.35, 1.65), V(1, 0, 0), UP, 0.3, 0.16, R.CUST);
    lit.box(-3.12, h, 1.1, -3.02, h + 0.04, 1.26, '#1b1f25', { ao: 0 }); lit.box(-3.11, h + 0.04, 1.12, -3.03, h + 0.07, 1.24, '#2e343c', { ao: 0 });
    signQ(V(-3.07, h + 0.071, 1.17), UP, V(-1, 0, 0), 0.06, 0.05, R.COOL, '#8fd0ff');
    lit.box(-3.2, h, 2.0, -3.05, h + 0.06, 2.18, '#2e343c', { ao: 0 }); lit.box(-3.18, h + 0.06, 2.05, -3.08, h + 0.2, 2.12, '#2e343c', { ao: 0 });
    signQ(V(-3.13, h + 0.14, 2.042), V(0, 0, -1), UP, 0.08, 0.05, R.COOL, '#ff5a5a');
    // 계산대 위 라이터·껌 랙
    for (let i = 0; i < 12; i++) { const c = ['#ff3b3b', '#ffd400', '#3aa6ff', '#7dff9a', '#ff8ad8', '#ffffff'][i % 6]; lit.box(-3.55 + (i % 6) * 0.04, h, 2.45 + Math.floor(i / 6) * 0.06, -3.52 + (i % 6) * 0.04, h + 0.08, 2.49 + Math.floor(i / 6) * 0.06, c, { ao: 0 }); }
    // 비닐봉투 걸이
    lit.box(-3.58, h, 0.62, -3.3, h + 0.02, 0.8, '#e8ecf0', { ao: 0 });
    // 뒤 진열장(선물세트·와인) +x 를 봄
    const bx0 = -4.97, bx1 = -4.55;
    lit.box(bx0, 0, 0.42, bx1, 0.92, 3.0, '#ffffff', { ao: 0.3 });
    lit.box(bx0, 0.92, 0.42, bx0 + 0.04, 2.05, 3.0, '#eef1f4', { ao: 0 });
    lit.box(bx0, 2.0, 0.42, bx1 + 0.02, 2.08, 3.0, '#2a3340', { ao: 0 });
    signQ(V(bx0 + 0.01, 2.5, 1.7), V(1, 0, 0), UP, 0.62, 0.62, R.LOGO);
    [0.95, 1.3, 1.65].forEach((y, li) => {
      metal.box(bx0 + 0.04, y - 0.02, 0.45, bx1, y, 2.97, '#d0d5db', { ao: 0 });
      rail(bx1, 2.95, bx1, 0.45, y, 1, 0);
      stockRow({ ax: bx1 - 0.02, az: 2.92, bx: bx1 - 0.02, bz: 0.5, y, nx: 1, nz: 0, maxH: li === 2 ? 0.34 : 0.3, pool: li === 2 ? zonePool('premium') : zonePool('gift'), rows: 1, stackMax: 1, area: 'counter', slow: 0.38 });
    });
  }
  const clerkSrc = clerkSource();
  const clerkBody = new THREE.Mesh(clerkSrc.body, mat.clerk), clerkHead = new THREE.Mesh(clerkSrc.head, mat.clerk);
  const clerk = new THREE.Group(); clerk.add(clerkBody); clerkHead.position.y = 1.45; clerk.add(clerkHead);
  clerk.position.set(-4.12, 0, 1.65); clerk.rotation.y = Math.PI / 2; scene.add(clerk);
  decalQ(V(-4.12, 0.004, 1.65), UP, V(0, 0, -1), 0.8, 0.8, R.SOFT, '#000000', 0.45);

  // ---------- 커피·핫푸드 스테이션(왼벽, 계산대 뒤쪽) ----------
  {
    const x0 = -4.97, x1 = -4.35, z0 = 3.1, z1 = 4.6, h = 0.92;
    block(-5, z0, x1, z1, 1.65); shadow(x0, z0, x1, z1, 0.45, 0.15);
    lit.box(x0, 0, z0, x1, h - 0.04, z1, '#f2f2f0', { ao: 0.35 });
    lit.box(x0, h - 0.04, z0, x1 + 0.03, h, z1, '#a8794e', { ao: 0, top: '#b98a5c' });
    // 커피머신
    lit.box(-4.9, h, 3.2, -4.5, h + 0.52, 3.62, '#1e2126', { ao: 0 });
    metal.box(-4.6, h + 0.02, 3.28, -4.48, h + 0.05, 3.54, '#c9ced4', { ao: 0 });
    metal.box(-4.58, h + 0.24, 3.36, -4.5, h + 0.3, 3.46, '#c9ced4', { ao: 0 });
    signQ(V(-4.498, h + 0.42, 3.41), V(1, 0, 0), UP, 0.14, 0.08, R.COOL, '#7fd0ff');
    signQ(V(-4.965, 1.75, 3.45), V(1, 0, 0), UP, 0.36, 0.72, R.MENU);
    for (let i = 0; i < 4; i++) lit.box(-4.47, h + i * 0.07, 3.72, -4.39, h + 0.07 + i * 0.07, 3.8, '#ffffff', { ao: 0 }); // 컵
    // 핫케이스(유리 + 따뜻한 빛)
    const hz0 = 3.95, hz1 = 4.55;
    metal.box(-4.95, h, hz0, -4.42, h + 0.04, hz1, '#b8bec5', { ao: 0 });
    metal.box(-4.95, h + 0.52, hz0, -4.42, h + 0.56, hz1, '#b8bec5', { ao: 0 });
    signQ(V(-4.94, h + 0.28, (hz0 + hz1) / 2), V(1, 0, 0), UP, hz1 - hz0, 0.48, R.WARMGLOW);
    glass.quad(V(-4.42, h + 0.28, (hz0 + hz1) / 2), V(1, 0, 0), UP, hz1 - hz0, 0.48, [1, 1, 1]);
    signQ(V(-4.418, h + 0.66, (hz0 + hz1) / 2), V(1, 0, 0), UP, 0.6, 0.15, R.HOT);
    floorGlow(-4.35, hz0, -3.5, hz1, '#ffb347', 0.25);
    [h + 0.05, h + 0.28].forEach((y) => {
      metal.box(-4.9, y - 0.01, hz0 + 0.02, -4.46, y, hz1 - 0.02, '#c9ced4', { ao: 0 });
      stockRow({ ax: -4.5, az: hz1 - 0.03, bx: -4.5, bz: hz0 + 0.03, y, nx: 1, nz: 0, maxH: 0.22, pool: zonePool('hot'), rows: 1, stackMax: 1, area: 'hot', tags: false, slow: 0.25 });
    });
  }

  // ---------- 바구니 더미(문 옆) + 아이스 박스 ----------
  const BASKET_SPOT = { x: -1.38, z: 0.6, r: 1.05 };
  block(-1.65, 0.38, -1.1, 0.82, 0.55); shadow(-1.62, 0.4, -1.14, 0.8, 0.45, 0.08);
  const basket = createBasket();
  const stack = new THREE.Group();
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(basket.geometry, basket.material); m.position.set(0, 0.012 + i * 0.075, 0); m.rotation.y = (i % 2 ? 0.03 : -0.03); stack.add(m); }
  stack.position.set(BASKET_SPOT.x, 0, BASKET_SPOT.z); stack.rotation.y = 0.1; scene.add(stack);
  // 바구니 쌓은 6개는 같은 재질 → 실제로 6 draw 이므로 하나로 합침
  {
    const geos = stack.children.map((m) => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
    const merged = new THREE.Mesh(mergeAll(geos), basket.material); for (const g of geos) g.dispose();
    stack.clear(); stack.add(merged);
  }

  // ---------- 정적 메시 만들기 ----------
  const statics = [];
  const addMesh = (geo, m, name, order = 0) => { const me = new THREE.Mesh(geo, m); me.name = name; me.renderOrder = order; me.matrixAutoUpdate = false; me.updateMatrix(); scene.add(me); statics.push(me); return me; };
  addMesh(floorGeo, mat.floor, 'b24-floor');
  addMesh(lit.build(), mat.lit, 'b24-lit');
  addMesh(metal.build(), mat.metal, 'b24-metal');
  addMesh(sign.build(), mat.sign, 'b24-sign');
  const prodGeo = batch.build();
  const prodMesh = addMesh(prodGeo, mat.prod, 'b24-products');
  const prodOrig = Float32Array.from(prodGeo.attributes.position.array);
  addMesh(decal.build(), mat.decal, 'b24-decal', 2);
  addMesh(glass.build(), mat.glass, 'b24-glass', 3);

  // 집을 상품 화살표(카메라를 보는 사각형)
  const arrowGeo = new THREE.PlaneGeometry(0.16, 0.16); { const u = uvr(R.ARROW, 2), uv = arrowGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u[2] : u[0], uv.getY(i) ? u[3] : u[1]); }
  arrowGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(16).fill(1), 4));
  const arrow = new THREE.Mesh(arrowGeo, mat.arrow); arrow.renderOrder = 10; arrow.visible = false; scene.add(arrow);

  // ---------- 플레이어 ----------
  const me = createAvatar(look || { color: '#4f7cff', gender: 'm', hair: 'short' });
  me.position.set(-0.6, 0, 1.3); me.rotation.y = 0; scene.add(me);
  const shadowGeo = new THREE.PlaneGeometry(0.75, 0.75); shadowGeo.rotateX(-Math.PI / 2); { const u = uvr(R.SOFT, 2), uv = shadowGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u[2] : u[0], uv.getY(i) ? u[3] : u[1]); }
  shadowGeo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 16 }, (_, i) => (i % 4 === 3 ? 0.5 : 0)), 4));
  const meShadow = new THREE.Mesh(shadowGeo, mat.decal); meShadow.position.y = 0.005; meShadow.renderOrder = 2; scene.add(meShadow);
  // 바구니(손에 듦)
  basket.group.visible = false; scene.add(basket.group);
  let hasBasket = false;

  // ---------- 카메라 ----------
  const cam = { yaw: Math.PI, pitch: 0.5, dist: 3.0, shake: 0, mode: 'follow', lookIdle: 9, x: 0, y: 2.4, z: -1, tx: 0, ty: 1, tz: 1 };
  function camPreset() {
    const landscapePhone = isMobile && innerWidth > innerHeight;
    return landscapePhone ? { fov: 58, back: 3.2, up: 2.55, lead: 0.8 } : { fov: 55, back: 3.45, up: 2.6, lead: 0.7 };
  }
  function clampCam(x, z) {
    // 키 큰 가구(벽 냉장고·뒷 케이스·벽) 안으로는 들어가지 않게
    return [THREE.MathUtils.clamp(x, -4.72, 4.05), THREE.MathUtils.clamp(z, 0.32, 7.0)];
  }
  // 머리→카메라 선분이 가구(높이 h)를 지나면: 먼저 위로 올려 넘겨 보고, 그래도 막히면 앞으로 당김
  function segBlocked(ax, ay, az, bx, by, bz) {
    for (let i = 1; i <= 14; i++) {
      const t = i / 14, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (const [x0, z0, x1, z1, h] of obstacles) if (y < h + 0.12 && x > x0 - 0.08 && x < x1 + 0.08 && z > z0 - 0.08 && z < z1 + 0.08) return t;
    }
    return 0;
  }
  function unblock(ax, ay, az, bx, by, bz) {
    if (!segBlocked(ax, ay, az, bx, by, bz)) return [bx, by, bz];
    for (let y = by + 0.15; y <= H - 0.14; y += 0.15) if (!segBlocked(ax, ay, az, bx, y, bz)) return [bx, y, bz];
    const top = H - 0.14; let t = segBlocked(ax, ay, az, bx, top, bz);
    for (let k = 0; k < 6 && t; k++) { const f = Math.max(0.15, t - 0.08); bx = ax + (bx - ax) * f; bz = az + (bz - az) * f; t = segBlocked(ax, ay, az, bx, top, bz); }
    return [bx, top, bz];
  }
  function updateCamera(dt, snap = false) {
    const pr = camPreset();
    if (Math.abs(camera.fov - pr.fov) > 0.01) { camera.fov = pr.fov; camera.updateProjectionMatrix(); }
    if (camera.aspect !== innerWidth / innerHeight) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
    let px, py, pz, tx, ty, tz;
    if (cam.mode === 'checkout') {
      px = -0.95; py = 2.25; pz = 3.0; tx = -3.4; ty = 1.0; tz = 1.55;
    } else {
      // 가구에 가리면 가까운 3/4 각도로 카메라를 돌려 줌(사용자가 막 돌린 직후엔 높이로만 해결)
      const back = pr.back * cam.dist / 3.0, hy = pr.up + (cam.pitch - 0.5) * 1.2;
      if (cam.lookIdle > 0.5 || snap) {
        let best = null;
        for (const off of YAW_TRY) {
          const y = cam.yaw + off, bx = me.position.x + Math.sin(y) * back, bz = me.position.z + Math.cos(y) * back;
          const [qx, qz] = clampCam(bx, bz);
          if (Math.hypot(bx - qx, bz - qz) > 0.6) continue;
          if (!segBlocked(me.position.x, 1.35, me.position.z, qx, hy, qz)) { best = off; break; }
        }
        if (best) cam.yaw += snap ? best : best * Math.min(1, dt * 4);
      }
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      tx = me.position.x + fx * pr.lead; tz = me.position.z + fz * pr.lead; ty = 0.95;
      px = me.position.x - fx * back; pz = me.position.z - fz * back; py = pr.up + (cam.pitch - 0.5) * 1.2;
      [px, py, pz] = unblock(me.position.x, 1.35, me.position.z, px, py, pz);
      const [cx, cz] = clampCam(px, pz);
      // 벽·창 때문에 뒤로 못 가면 그만큼 위로 올리고 앞을 더 내려다봄 (항상 플레이어+바구니+선반이 보이게)
      const lost = Math.hypot(px - cx, pz - cz);
      px = cx; pz = cz; py = Math.min(H - 0.14, py + lost * 0.55); tx += fx * lost * 0.35; tz += fz * lost * 0.35;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    cam.x += (px - cam.x) * k; cam.y += (py - cam.y) * k; cam.z += (pz - cam.z) * k;
    cam.tx += (tx - cam.tx) * k; cam.ty += (ty - cam.ty) * k; cam.tz += (tz - cam.tz) * k;
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const s = cam.shake * cam.shake * 0.12, t = performance.now() / 1000;
    camera.position.set(cam.x + Math.sin(t * 61) * s, Math.min(H - 0.12, cam.y + Math.sin(t * 47) * s), cam.z + Math.cos(t * 53) * s);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }

  // ---------- 이동·충돌 ----------
  function blocked(x, z) {
    if (x < X0 + PR || x > X1 - PR || z < Z0 + 0.3 || z > Z1 - PR) return true;
    for (const [a, b, c, d] of obstacles) if (x > a - PR && x < c + PR && z > b - PR && z < d + PR) return true;
    return false;
  }
  function moveBy(dx, dz) {
    const p = me.position;
    if (!blocked(p.x + dx, p.z)) p.x += dx;
    if (!blocked(p.x, p.z + dz)) p.z += dz;
  }

  // ---------- 상품 집기(선반 정면 · 바닥) ----------
  const fwd = new THREE.Vector3();
  function nearestShelf(x = me.position.x, z = me.position.z) {
    const fx = Math.sin(me.rotation.y), fz = Math.cos(me.rotation.y);
    const hx = x + fx * 0.35, hz = z + fz * 0.35;
    let best = null, bs = Infinity;
    for (const f of facings) {
      if (!f.inst.length) continue;
      const dx = f.x - hx, dz = f.z - hz, d = Math.hypot(dx, dz);
      if (d > (f.top ? 0.95 : 0.85)) continue;
      if (!f.top && ((x - f.x) * f.nx + (z - f.z) * f.nz) < 0.05) continue; // 선반 앞에 있어야
      const facingDot = (f.x - x) * fx + (f.z - z) * fz;
      const sc = d - 0.25 * Math.sign(facingDot);
      if (sc < bs) { bs = sc; best = f; }
    }
    return best ? { id: best.id, facing: best, item: best.item, area: best.area, slow: best.slow, x: best.x, y: best.y, z: best.z } : null;
  }
  const pos = prodGeo.attributes.position;
  function hideInst(inst) { for (let i = inst.s; i < inst.s + inst.c; i++) pos.setXYZ(i, 0, -5, 0); }
  function pickFromShelf(sh) {
    const f = sh?.facing; if (!f || !f.inst.length) return null;
    const inst = f.inst.shift(); // 앞줄·위부터
    // 원래 자리(세계 좌표) — 집은 상품 중심
    let cx = 0, cy = 0, cz = 0; for (let i = inst.s; i < inst.s + inst.c; i++) { cx += prodOrig[i * 3]; cy += prodOrig[i * 3 + 1]; cz += prodOrig[i * 3 + 2]; }
    hideInst(inst); pos.needsUpdate = true;
    f.taken = (f.taken || 0) + 1;
    return { item: f.item, from: new THREE.Vector3(cx / inst.c, cy / inst.c, cz / inst.c) };
  }
  function restock() {
    pos.array.set(prodOrig); pos.needsUpdate = true;
    // 인스턴스 목록 다시 (집으며 shift 했으므로) — 처음 만든 목록을 복구
    for (const f of facings) { if (f._all) f.inst = f._all.slice(); f.taken = 0; }
  }
  for (const f of facings) f._all = f.inst.slice();

  // 날아가는 상품(선반→바구니, 바구니→바닥, 바구니→스캐너)
  const flights = [];
  const floorItems = [];
  const geoCache = new Map();
  const itemGeo = (item) => { if (!geoCache.has(item.id)) geoCache.set(item.id, singleProductGeometry(item)); return geoCache.get(item.id); };
  function flyToBasket(item, from, onLand) {
    const m = new THREE.Mesh(itemGeo(item), mat.prod); m.position.copy(from); scene.add(m);
    flights.push({ m, from: from.clone(), t: 0, dur: 0.32, to: 'basket', onLand, spin: (Math.random() - 0.5) * 8 });
  }
  function flyToScanner(item, onLand) {
    const m = new THREE.Mesh(itemGeo(item), mat.prod); basket.worldTop(m.position); scene.add(m);
    flights.push({ m, from: m.position.clone(), t: 0, dur: 0.28, to: 'scanner', onLand, spin: 4 });
  }
  function spillItems(list) {
    const o = new THREE.Vector3(); basket.worldTop(o);
    const fx = Math.sin(me.rotation.y), fz = Math.cos(me.rotation.y);
    list.forEach((item, i) => {
      const m = new THREE.Mesh(itemGeo(item), mat.prod); m.position.copy(o); m.position.y += 0.05 * i; m.scale.setScalar(1.35); scene.add(m);
      const a = (Math.random() - 0.5) * 3.4 + Math.atan2(fx, fz), sp = 1.4 + Math.random() * 1.8;
      const it = { m, item, v: new THREE.Vector3(Math.sin(a) * sp, 3.2 + Math.random() * 1.6, Math.cos(a) * sp), w: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 10 - 5, Math.random() * 14 - 7), rest: false, age: 0, bounces: 0 };
      floorItems.push(it);
    });
    cam.shake = 1;
  }
  function updateFloor(dt) {
    for (const it of floorItems) {
      if (it.rest) continue;
      it.age += dt;
      const p = it.m.position;
      it.v.y -= 9.8 * dt;
      p.addScaledVector(it.v, dt);
      it.m.rotation.x += it.w.x * dt; it.m.rotation.y += it.w.y * dt; it.m.rotation.z += it.w.z * dt;
      const floorY = 0.025;
      if (p.y < floorY) {
        p.y = floorY;
        if (Math.abs(it.v.y) > 0.6) { it.v.y = -it.v.y * 0.42; it.v.x *= 0.7; it.v.z *= 0.7; it.w.multiplyScalar(0.6); it.bounces++; it.onBounce?.(it); }
        else { it.v.y = 0; const sp = Math.hypot(it.v.x, it.v.z), ns = Math.max(0, sp - 3.2 * dt); it.v.x *= sp ? ns / sp : 0; it.v.z *= sp ? ns / sp : 0; it.w.set(it.v.z * 9, 0, -it.v.x * 9); if (ns < 0.03) { it.rest = true; it.m.rotation.x = Math.round(it.m.rotation.x / (Math.PI / 2)) * (Math.PI / 2); it.m.rotation.z = Math.PI / 2; p.y = floorY; } }
      }
      // 벽·가구에 튕김
      for (const [a, b, c, d, oh] of obstacles) if (p.y < oh && p.x > a && p.x < c && p.z > b && p.z < d) { const ex = Math.min(p.x - a, c - p.x), ez = Math.min(p.z - b, d - p.z); if (ex < ez) { p.x = p.x - a < c - p.x ? a - 0.01 : c + 0.01; it.v.x *= -0.4; } else { p.z = p.z - b < d - p.z ? b - 0.01 : d + 0.01; it.v.z *= -0.4; } }
      p.x = THREE.MathUtils.clamp(p.x, X0 + 0.1, X1 - 0.1); p.z = THREE.MathUtils.clamp(p.z, 0.15, Z1 - 0.1);
    }
  }
  function nearestFloorItem(x = me.position.x, z = me.position.z) {
    let best = null, bd = 0.85;
    for (const it of floorItems) { if (it.m.position.y > 0.4) continue; const d = Math.hypot(it.m.position.x - x, it.m.position.z - z); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  function pickupFloor(it) {
    const i = floorItems.indexOf(it); if (i < 0) return null;
    floorItems.splice(i, 1); scene.remove(it.m);
    return { item: it.item, from: it.m.position.clone() };
  }
  function clearFloor() { for (const it of floorItems) scene.remove(it.m); floorItems.length = 0; }
  function updateFlights(dt) {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i]; f.t += dt / f.dur;
      const k = Math.min(1, f.t), e = 1 - Math.pow(1 - k, 2);
      const to = new THREE.Vector3();
      if (f.to === 'basket') basket.worldTop(to); else to.set(-3.2, COUNTER.h + 0.12, 1.85);
      const peak = Math.max(f.from.y, to.y) + 0.35;
      f.m.position.set(f.from.x + (to.x - f.from.x) * e, (1 - k) * (1 - k) * f.from.y + 2 * (1 - k) * k * peak + k * k * to.y, f.from.z + (to.z - f.from.z) * e);
      f.m.rotation.y += f.spin * dt; f.m.rotation.x += f.spin * 0.4 * dt;
      const sc = f.to === 'scanner' ? 1 - k * 0.7 : 1 + Math.sin(k * Math.PI) * 0.35; f.m.scale.setScalar(sc);
      if (k >= 1) { scene.remove(f.m); flights.splice(i, 1); f.onLand?.(); }
    }
  }

  // ---------- 매 프레임 ----------
  let walkPhase = 0;
  function update(dt, { look = [0, 0, 0], axes = { f: 0, s: 0, run: false }, allowMove = true } = {}) {
    const [dy, dp, dz] = look;
    if (dy || dp) cam.lookIdle = 0; else cam.lookIdle += dt;
    cam.yaw += dy; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dp * 0.6, 0.25, 0.8); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + dz), 2.3, 4.0);
    let speed = 0;
    if (allowMove && (axes.f || axes.s)) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      let mx = fx * axes.f + rx * axes.s, mz = fz * axes.f + rz * axes.s; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      const sp = (axes.run ? RUN : WALK) * (basket.stunned > 0 ? 0.35 : 1) * Math.min(1, Math.hypot(axes.f, axes.s));
      moveBy(mx * sp * dt, mz * sp * dt); speed = sp;
      const target = Math.atan2(mx, mz); let d = target - me.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); me.rotation.y += d * Math.min(1, dt * 12);
      // 잠시 손을 안 대면 카메라가 천천히 뒤로 돎
      if (cam.lookIdle > 1.2 && axes.f > 0.2) { let dyaw = (me.rotation.y + Math.PI) - cam.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); cam.yaw += dyaw * Math.min(1, dt * 0.9); }
    }
    walkPhase += dt;
    animateAvatar(me, speed, dt);
    meShadow.position.set(me.position.x, 0.005, me.position.z);
    basket.update(dt, me, hasBasket);
    // 직원: 숨쉬기 + 플레이어 쪽 보기
    clerkBody.position.y = Math.sin(walkPhase * 1.6) * 0.006;
    const want = Math.atan2(me.position.x - clerk.position.x, me.position.z - clerk.position.z) - clerk.rotation.y;
    clerkHead.rotation.y += (THREE.MathUtils.clamp(Math.atan2(Math.sin(want), Math.cos(want)), -0.7, 0.7) - clerkHead.rotation.y) * Math.min(1, dt * 3);
    updateFlights(dt); updateFloor(dt);
    updateCamera(dt);
    const p = me.position;
    const nearBasket = !hasBasket && Math.hypot(p.x - BASKET_SPOT.x, p.z - BASKET_SPOT.z) < BASKET_SPOT.r;
    const shelf = hasBasket ? nearestShelf() : null;
    const floorIt = hasBasket ? nearestFloorItem() : null;
    const nearExit = p.z < 1.05 && Math.abs(p.x) < 0.95;
    const nearCounter = p.x < -2.2 && p.z > 0.5 && p.z < 2.9;
    // 화살표: 바닥 상품 > 선반
    const tgt = floorIt ? { x: floorIt.m.position.x, y: 0.12, z: floorIt.m.position.z } : shelf ? { x: shelf.x, y: shelf.facing.top ? 0.95 : shelf.y + 0.12, z: shelf.z } : null;
    arrow.visible = !!tgt && cam.mode === 'follow' && arrowOn;
    if (arrow.visible) { arrow.position.set(tgt.x, tgt.y + 0.16 + Math.abs(Math.sin(walkPhase * 5)) * 0.05, tgt.z); arrow.quaternion.copy(camera.quaternion); }
    return { nearBasket, shelf, floorItem: floorIt, nearExit, nearCounter, hasBasket, speed };
  }
  let arrowOn = true;

  function render(renderer) {
    renderer.render(scene, camera);
  }
  function setView(x, z, yaw, pitch = 0.5, dist = 3.0) { if (x != null) { me.position.x = x; me.position.z = z; } cam.yaw = yaw ?? cam.yaw; cam.pitch = pitch; cam.dist = dist; updateCamera(0, true); }
  function stats() {
    let tris = 0; scene.traverse((o) => { if (o.isMesh && o.geometry?.index) tris += o.geometry.index.count / 3; });
    return { facings: facings.length, products: batch.count, productVerts: prodGeo.attributes.position.count, tris: Math.round(tris), statics: statics.length };
  }
  updateCamera(0, true);

  return {
    scene, camera, cam, player: me, clerk, basket, layout, facings, obstacles, COUNTER, BASKET_SPOT,
    get hasBasket() { return hasBasket; },
    grabBasket() { hasBasket = true; basket.group.visible = true; stack.children[0].scale.y = 0.85; },
    dropBasket() { hasBasket = false; basket.group.visible = false; stack.children[0].scale.y = 1; },
    setArrow(on) { arrowOn = on; },
    setMode(m) { cam.mode = m; if (m === 'checkout') { me.position.set(-2.55, 0, 1.7); me.rotation.y = -Math.PI / 2; } updateCamera(0, true); },
    update, render, setView, stats, nearestShelf, pickFromShelf, restock,
    flyToBasket, flyToScanner, spillItems, nearestFloorItem, pickupFloor, clearFloor, floorItems, flights,
    shake(v = 1) { cam.shake = Math.max(cam.shake, v); },
    worldToScreen(v, out = { x: 0, y: 0 }) { const q = v.clone().project(camera); out.x = (q.x + 1) / 2 * innerWidth; out.y = (1 - q.y) / 2 * innerHeight; return out; },
    dispose() {
      for (const m of statics) m.geometry.dispose();
      arrowGeo.dispose(); shadowGeo.dispose(); stack.children[0]?.geometry.dispose();
      for (const g of geoCache.values()) g.dispose();
      for (const k of Object.keys(mat)) if (mat[k]) mat[k].dispose();
      signAtlas.tex.dispose(); floorTex.dispose(); envRT?.dispose(); pmrem?.dispose();
      basket.dispose();
      scene.clear();
    },
  };
}

function mergeAll(geos) {
  // 같은 속성 구성의 지오메트리를 한 덩어리로 (간단 병합)
  const out = new THREE.BufferGeometry(); const attrs = Object.keys(geos[0].attributes);
  for (const a of attrs) { const size = geos[0].attributes[a].itemSize; const arr = []; for (const g of geos) arr.push(...g.attributes[a].array); out.setAttribute(a, new THREE.Float32BufferAttribute(arr, size)); }
  if (geos[0].index) { const idx = []; let off = 0; for (const g of geos) { for (const i of g.index.array) idx.push(i + off); off += g.attributes.position.count; } out.setIndex(idx); }
  out.computeBoundingSphere(); return out;
}
