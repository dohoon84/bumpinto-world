// [myeongdong] 병합용 지오메트리 누적기. 위치·법선·UV·색을 배열로 모았다가 BufferGeometry 하나로 만든다.
import * as THREE from 'three';

export class GeoBuf {
  constructor({ uv = true, color = false } = {}) {
    this.p = []; this.n = []; this.uv = uv ? [] : null; this.c = color ? [] : null; this.i = [];
  }
  get count() { return this.p.length / 3; }
  /** 사각형 a,b,c,d (반시계, 앞면) + uv [u0,v0,u1,v1] (a=좌하, b=우하, c=우상, d=좌상) */
  quad(a, b, c, d, uvr = [0, 0, 1, 1], col = null, nrm = null) {
    const base = this.count;
    let nx, ny, nz;
    if (nrm) [nx, ny, nz] = nrm;
    else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    }
    for (const q of [a, b, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); }
    if (this.uv) {
      const [u0, v0, u1, v1] = uvr;
      this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    }
    if (this.c) { const cc = col || [1, 1, 1]; for (let k = 0; k < 4; k++) this.c.push(cc[0], cc[1], cc[2]); }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return base;
  }
  /** 축 정렬 상자를 (cx,cy,cz) 중심, 크기 (sx,sy,sz), y축 회전 ry 로 */
  box(cx, cy, cz, sx, sy, sz, ry = 0, uvr = [0, 0, 1, 1], col = null, faces = 63) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const v = [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz)];
    if (faces & 1) this.quad(v[0], v[1], v[2], v[3], uvr, col); // +z
    if (faces & 2) this.quad(v[4], v[5], v[6], v[7], uvr, col); // -z
    if (faces & 4) this.quad(v[1], v[4], v[7], v[2], uvr, col); // +x
    if (faces & 8) this.quad(v[5], v[0], v[3], v[6], uvr, col); // -x
    if (faces & 16) this.quad(v[3], v[2], v[7], v[6], uvr, col); // +y
    if (faces & 32) this.quad(v[5], v[4], v[1], v[0], uvr, col); // -y
  }
  /** 임의 삼각형 묶음(위치 배열 + 인덱스)을 그대로 붙인다 */
  raw(pos, idx, nrm, uv = null, col = null) {
    const base = this.count;
    for (let k = 0; k < pos.length; k++) this.p.push(pos[k]);
    for (let k = 0; k < nrm.length; k++) this.n.push(nrm[k]);
    if (this.uv) { if (uv) for (const u of uv) this.uv.push(u); else for (let k = 0; k < pos.length / 3; k++) this.uv.push(0, 0); }
    if (this.c) { for (let k = 0; k < pos.length / 3; k++) { const cc = col ? (typeof col === 'function' ? col(k) : col) : [1, 1, 1]; this.c.push(cc[0], cc[1], cc[2]); } }
    for (const i of idx) this.i.push(base + i);
  }
  build() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const n = this.count;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export const hex3 = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** 2D 칸 격자 (cell m). add(item, x0,z0,x1,z1) · query(x,z) → 그 칸의 항목 */
export class CellGrid {
  constructor(cell = 20) { this.cell = cell; this.m = new Map(); }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
      const k = this.key(i, j); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(item);
    }
  }
  query(x, z) { return this.m.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || EMPTY; }
}
const EMPTY = [];

export function hash01(a, b = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
