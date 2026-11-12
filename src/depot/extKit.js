// [depot-ext] 정적 메시 조립기 — 부품(박스·원기둥·구·평면 다각형)을 정점 색으로 칠해 한 지오메트리로 합친다 → 재질 1개 = draw call 1개.
//   glow 속성(0..1)인 부품(가로등 머리·간판 테두리 LED 등)은 밤 값(uNight)만큼 스스로 빛난다. 텍스처 없음.
//   quads(): 아틀라스 텍스처 사각형(간판·현수막·바닥 글씨)을 한 지오메트리로.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
export function kit() {
  const parts = [];
  const push = (g, color, glow = 0) => {
    const geo = g.index ? g.toNonIndexed() : g; if (geo !== g) g.dispose();
    geo.deleteAttribute('uv'); if (!geo.attributes.normal) geo.computeVertexNormals();
    const n = geo.attributes.position.count, col = new Float32Array(n * 3), gl = new Float32Array(n).fill(glow);
    _c.set(color); for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    parts.push(geo); return geo;
  };
  const K = {
    get count() { return parts.length; },
    box(w, h, d, x, y, z, color, { ry = 0, glow = 0 } = {}) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return push(g, color, glow); },
    cyl(r0, r1, h, x, y, z, color, { seg = 8, glow = 0 } = {}) { const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1); g.translate(x, y, z); return push(g, color, glow); },
    sphere(r, x, y, z, color, { ws = 8, hs = 6, glow = 0, sy = 1 } = {}) { const g = new THREE.SphereGeometry(r, ws, hs); if (sy !== 1) g.scale(1, sy, 1); g.translate(x, y, z); return push(g, color, glow); },
    cone(r, h, x, y, z, color, { seg = 7 } = {}) { const g = new THREE.ConeGeometry(r, h, seg); g.translate(x, y, z); return push(g, color); },
    // 막대 a→b (단면 r×r)
    bar(a, b, r, color, { glow = 0 } = {}) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(); if (L < 1e-4) return null;
      const g = new THREE.BoxGeometry(r, r, L);
      const m = new THREE.Matrix4().lookAt(A, B, Math.abs(d.y) / L > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      m.setPosition(A.add(B).multiplyScalar(0.5)); g.applyMatrix4(m); return push(g, color, glow);
    },
    // 바닥 평면 다각형 [[x,z],...] (반시계/시계 상관없이 위를 보게)
    poly(pts, y, color, { glow = 0 } = {}) {
      const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
      const nz = g.attributes.normal; if (nz.getY(0) < 0) { g.scale(1, -1, 1); g.translate(0, 2 * y, 0); }
      for (let i = 0; i < nz.count; i++) nz.setXYZ(i, 0, 1, 0);
      return push(g, color, glow);
    },
    rect(x0, z0, x1, z1, y, color, o) { return K.poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, color, o); },
    // 선분 띠(바닥 페인트) a→b, 폭 w
    stripe(ax, az, bx, bz, w, y, color) { const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2; return K.poly([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], y, color); },
    geometry() { if (!parts.length) return null; const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); parts.length = 0; g.computeBoundingSphere(); g.computeBoundingBox(); return g; },
  };
  return K;
}

/** 정점 색 + glow(밤) Lambert. uniforms.uNight.value 로 밝힌다. */
export function kitMaterial({ name = 'depot-ext-kit', flat = false, offset = 0 } = {}) {
  const night = { value: 0 };
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: flat });
  if (offset) { m.polygonOffset = true; m.polygonOffsetFactor = offset; m.polygonOffsetUnits = offset * 2; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;').replace('#include <color_vertex>', '#include <color_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * (0.25 + uNight * 1.25);');
  };
  m.customProgramCacheKey = () => 'depot-ext-kit-v1';
  m.name = name; m.userData.night = night;
  return m;
}

/** 아틀라스 사각형 모음. face(center, right(반폭 벡터), up(반높이 벡터), slot) — 앞면 = right × up 쪽. */
export function quads() {
  const pos = [], uv = [], nor = [], idx = [];
  const Q = {
    get count() { return idx.length / 6; },
    face(c, r, u, s, { flipU = false } = {}) {
      const k = pos.length / 3;
      const p = (a, b) => pos.push(c[0] + r[0] * a + u[0] * b, c[1] + r[1] * a + u[1] * b, c[2] + r[2] * a + u[2] * b);
      p(-1, -1); p(1, -1); p(1, 1); p(-1, 1);
      const [u0, u1] = flipU ? [s.u1, s.u0] : [s.u0, s.u1];
      uv.push(u0, s.v0, u1, s.v0, u1, s.v1, u0, s.v1);
      const n = new THREE.Vector3(...r).cross(new THREE.Vector3(...u)).normalize();
      for (let i = 0; i < 4; i++) nor.push(n.x, n.y, n.z);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    },
    // 세로 간판: 가운데 (x,y,z), 폭 w, 높이 h, 바라보는 방향 yaw (0 = +z, π = −z(북))
    sign(x, y, z, w, h, yaw, s, o) { const rx = Math.cos(yaw), rz = -Math.sin(yaw); Q.face([x, y, z], [rx * w / 2, 0, rz * w / 2], [0, h / 2, 0], s, o); },
    // 바닥 글씨: 가운데, 폭 w, 길이 l, 글자 위쪽이 가리키는 방향 heading(라디안, 0 = +z)
    decal(x, y, z, w, l, heading, s) { const fx = Math.sin(heading), fz = Math.cos(heading); Q.face([x, y, z], [-fz * w / 2, 0, fx * w / 2], [fx * l / 2, 0, fz * l / 2], s); },
    geometry() {
      if (!idx.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setIndex(idx); g.computeBoundingSphere(); return g;
    },
  };
  return Q;
}
