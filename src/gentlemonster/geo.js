// [gentle-monster] 지오메트리 모으기 — 같은 재질로 쓰는 조각을 하나로 합쳐 draw 를 줄인다.
//   Builder.add(key, geometry, {x,y,z, rx,ry,rz, sx,sy,sz, color}) → 나중에 mesh(es, materials) 로 재질별 1 mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** 월드 좌표 기준 박스 투영 UV (콘크리트·바닥 무늬가 조각 크기와 상관없이 같은 밀도로 깔린다) */
export function projectUV(geo, scale = 2) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Builder {
  constructor() { this.parts = new Map(); this.uvScale = new Map(); this.tris = 0; }
  /** 재질 키마다 월드 투영 UV 크기(m) 지정. 지정 안 하면 원래 UV 유지 */
  project(key, scale) { this.uvScale.set(key, scale); return this; }
  add(key, geo, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    _p.set(o.x || 0, o.y || 0, o.z || 0);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const keep = new THREE.BufferGeometry();
    keep.setAttribute('position', g.attributes.position);
    keep.setAttribute('normal', g.attributes.normal);
    const us = this.uvScale.get(key);
    if (us) { projectUV(keep, us); } else keep.setAttribute('uv', g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (o.color != null) _c.set(o.color); else _c.set(0xffffff);
    const cnt = keep.attributes.position.count, col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    keep.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.dispose();
    let arr = this.parts.get(key); if (!arr) this.parts.set(key, arr = []);
    arr.push(keep); this.tris += cnt / 3;
    return this;
  }
  box(key, w, h, d, o = {}) { return this.add(key, new THREE.BoxGeometry(w, h, d), o); }
  cyl(key, rt, rb, h, o = {}, seg = 16) { return this.add(key, new THREE.CylinderGeometry(rt, rb, h, seg), o); }
  /** 반지름 r 원기둥 (cyl 은 rt,rb 따로) */
  cy(key, r, h, o = {}, seg = 16) { return this.add(key, new THREE.CylinderGeometry(r, r, h, seg), o); }
  sph(key, r, o = {}, ws = 14, hs = 10) { return this.add(key, new THREE.SphereGeometry(r, ws, hs), o); }
  cap(key, r, len, o = {}, seg = 10) { return this.add(key, new THREE.CapsuleGeometry(r, len, 3, seg), o); }
  tor(key, R, r, o = {}, rs = 8, ts = 24) { return this.add(key, new THREE.TorusGeometry(R, r, rs, ts), o); }
  /** 배열 [x,y,z, ...] 삼각형 목록 (정점색 고정) */
  tri(key, pts, color) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    g.computeVertexNormals();
    return this.add(key, g, { color });
  }
  /** 합쳐서 재질 키별 Mesh 배열 (parent 에 add 는 호출 쪽) */
  build(materials, { shadow = false } = {}) {
    const out = [];
    for (const [key, arr] of this.parts) {
      const mat = materials[key]; if (!mat) throw new Error('[gm] no material ' + key);
      const merged = arr.length === 1 ? arr[0] : mergeGeometries(arr, false);
      if (arr.length > 1) arr.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = 'gm-' + key; mesh.matrixAutoUpdate = false; mesh.userData.key = key;
      if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

/** 둥근 사각(superellipse) 평면 점 N개 + 바깥 법선 (CCW, y=0). a,b 반치수, n 지수(클수록 각진) */
export function ringShape(a, b, n = 5, N = 160) {
  const pts = [], nor = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), z = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push([x, z]);
  }
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i + N - 1) % N], p1 = pts[(i + 1) % N];
    const tx = p1[0] - p0[0], tz = p1[1] - p0[1], l = Math.hypot(tx, tz) || 1;
    nor.push([tz / l, -tx / l]);
  }
  // 호 길이
  const len = [0]; for (let i = 1; i <= N; i++) { const p0 = pts[i - 1], p1 = pts[i % N]; len.push(len[i - 1] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1])); }
  return { pts, nor, N, len, perim: len[N] };
}
/** 호 길이 s 에서의 (x,z,nx,nz) 보간 */
export function ringAt(r, s, off = 0) {
  s = ((s % r.perim) + r.perim) % r.perim;
  let lo = 0, hi = r.N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.len[m] <= s) lo = m; else hi = m; }
  const i0 = lo % r.N, i1 = (lo + 1) % r.N, f = (s - r.len[lo]) / Math.max(1e-6, r.len[lo + 1] - r.len[lo]);
  const x = r.pts[i0][0] + (r.pts[i1][0] - r.pts[i0][0]) * f, z = r.pts[i0][1] + (r.pts[i1][1] - r.pts[i0][1]) * f;
  let nx = r.nor[i0][0] + (r.nor[i1][0] - r.nor[i0][0]) * f, nz = r.nor[i0][1] + (r.nor[i1][1] - r.nor[i0][1]) * f;
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  return [x + nx * off, z + nz * off, nx, nz];
}

export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
