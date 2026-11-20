// [gentle-monster] 오브제용 작은 리그: 행렬 스택으로 부품을 쌓고, 한 번에 Builder 로 내보낸다.
import * as THREE from 'three';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
export const mat = (o = {}) => { _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)); };

const G = {
  sph: new THREE.SphereGeometry(1, 18, 12), sphL: new THREE.SphereGeometry(1, 10, 8), box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16), cylL: new THREE.CylinderGeometry(1, 1, 1, 8), cone: new THREE.CylinderGeometry(0, 1, 1, 14),
  disc: new THREE.CylinderGeometry(1, 1, 1, 32),
};
export const GEO = G;

export class Rig {
  constructor() { this.items = []; this.stack = [new THREE.Matrix4()]; }
  get top() { return this.stack[this.stack.length - 1]; }
  push(o) { this.stack.push(this.top.clone().multiply(mat(o))); return this; }
  pop() { this.stack.pop(); return this; }
  add(key, geo, o = {}) { this.items.push({ key, geo, m: this.top.clone().multiply(mat(o)), color: o.color }); return this; }
  /** 타원체 (반지름 rx,ry,rz) */
  ell(key, rx, ry, rz, o = {}) { return this.add(key, o.lo ? G.sphL : G.sph, { ...o, sx: rx, sy: ry, sz: rz }); }
  /** 박스 (w,h,d) */
  box(key, w, h, d, o = {}) { return this.add(key, G.box, { ...o, sx: w, sy: h, sz: d }); }
  /** 원기둥 (반지름 r, 높이 h) */
  cyl(key, r, h, o = {}) { return this.add(key, o.lo ? G.cylL : G.cyl, { ...o, sx: r, sy: h, sz: r }); }
  /** 두 점 a→b 를 잇는 원기둥(굵기 r0→r1) + 끝 구 */
  limb(key, a, b, r0, r1, o = {}) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_u, d.clone().normalize());
    const g = new THREE.CylinderGeometry(r1, r0, len, o.seg || 14, 1, !!o.open);
    const m = this.top.clone().multiply(new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    this.items.push({ key, geo: g, m, color: o.color, own: true });
    if (o.caps !== false) { this.ell(key, r0, r0, r0, { x: a[0], y: a[1], z: a[2], color: o.color, lo: true }); this.ell(key, r1, r1, r1, { x: b[0], y: b[1], z: b[2], color: o.color, lo: true }); }
    return this;
  }
  /** Builder 로 내보내기. root: 추가 변환(Matrix4) */
  emit(B, root = new THREE.Matrix4()) {
    for (const it of this.items) { const g = it.geo.clone(); g.applyMatrix4(root.clone().multiply(it.m)); B.add(it.key, g, { color: it.color }); g.dispose(); if (it.own) it.geo.dispose(); }
    return this;
  }
}

/** 값 노이즈(위치 해시) — 구겨진 크롬용 */
export function hash3(x, y, z) { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t); const u = s(xf), v = s(yf), w = s(zf); let r = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) r += hash3(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
  return r;
}
/** 지오메트리를 비색인으로 만들고 위치를 흔든 뒤 평면 법선 → 구겨진 호일 느낌 */
export function crumple(geo, amp = 0.04, freq = 3.2, seed = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = (vnoise(x * freq + seed, y * freq, z * freq) - 0.5) + 0.5 * (vnoise(x * freq * 2.3, y * freq * 2.3 + seed, z * freq * 2.3) - 0.5);
    const len = Math.hypot(x, y, z) || 1; // 중심에서 바깥으로(대략)
    p.setXYZ(i, x + (x / len) * n * amp * 2, y + n * amp * 2, z + (z / len) * n * amp * 2);
  }
  g.deleteAttribute('normal'); g.computeVertexNormals(); return g;
}
