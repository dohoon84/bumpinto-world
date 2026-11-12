// [depot-live] 신선 코너 3D 소품: 로우폴리 물고기·꽃게·새우·조개(수조·얼음 진열대) · 낱개 과일·채소(청과 빈)
//   모두 InstancedMesh — 종류(지오메트리)마다 1 드로콜, 색은 인스턴스 색. 물고기 헤엄은 버텍스 셰이더(aSwim)라 CPU 일 없음.
//   공유 재질 seaMat(투톤: 등 = 인스턴스 색, 배 = 은백색) · produceMat(인스턴스 색 + 약한 자체광). 물은 코스틱 셰이더.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const fxTime = { value: 0 }; // stock.tick 에서 올림

// 지오메트리 → 비인덱스 + color(r = 밝기, g = 배 은색 섞기) 속성
function shaded(g, fn) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.deleteAttribute('uv');
  const p = n.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, b] = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = r; c[i * 3 + 1] = b; c[i * 3 + 2] = 0; }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return n;
}
const tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pts.length * 2).fill(0), 2)); return g; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 물고기: 길이 1 (머리 +x, 꼬리 -x), 옆으로 납작
function fishGeo() {
  const body = new THREE.SphereGeometry(0.5, 10, 6); body.scale(1, 0.36, 0.15);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const k = x < 0 ? 1 + x * 1.1 : 1; p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * k); }
  body.computeVertexNormals();
  const tail = tri([[-0.42, 0, 0], [-0.7, 0.2, 0], [-0.6, 0, 0], [-0.42, 0, 0], [-0.6, 0, 0], [-0.7, -0.2, 0]]);
  const fin = tri([[0.16, 0.15, 0], [-0.26, 0.12, 0], [-0.08, 0.27, 0]]);
  const eyeL = new THREE.SphereGeometry(0.038, 5, 3); eyeL.translate(0.34, 0.045, 0.052);
  const eyeR = new THREE.SphereGeometry(0.038, 5, 3); eyeR.translate(0.34, 0.045, -0.052);
  const parts = [
    shaded(body, (x, y) => [0.62 + 0.25 * sstep(-0.1, 0.12, -y), sstep(0.02, -0.1, y)]),
    shaded(tail, () => [0.55, 0]), shaded(fin, () => [0.5, 0]),
    shaded(eyeL, () => [0.06, 0]), shaded(eyeR, () => [0.06, 0]),
  ];
  return mergeGeometries(parts);
}
// 꽃게: 등딱지 폭 1 (±x 다리, +z 집게)
function crabGeo() {
  const parts = [];
  const shell = new THREE.SphereGeometry(0.5, 10, 5); shell.scale(1, 0.38, 0.62); shell.translate(0, 0.17, 0);
  parts.push(shaded(shell, (x, y) => [0.78 + 0.12 * Math.abs(x), y < 0.12 ? 0.55 : 0]));
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const leg = new THREE.BoxGeometry(0.42, 0.045, 0.05); leg.translate(0.21, 0, 0);
    leg.rotateZ(-0.45); leg.rotateY(s > 0 ? (k - 1.5) * 0.38 : Math.PI - (k - 1.5) * 0.38);
    leg.translate(s * 0.4, 0.14, (k - 1.5) * 0.14 - 0.05);
    parts.push(shaded(leg, () => [0.7, 0]));
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.06, 0.05, 0.3); arm.rotateY(s * 0.5); arm.translate(s * 0.28, 0.14, 0.38); parts.push(shaded(arm, () => [0.7, 0]));
    const claw = new THREE.SphereGeometry(0.1, 6, 4); claw.scale(0.8, 0.6, 1.4); claw.translate(s * 0.36, 0.15, 0.56); parts.push(shaded(claw, () => [0.9, 0]));
  }
  return mergeGeometries(parts);
}
// 새우: 굽은 몸통 마디 4개 + 꼬리 부채 (길이 ~1)
function shrimpGeo() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = 0.2 + i * 0.5, r = 0.11 - i * 0.017;
    const s = new THREE.SphereGeometry(r, 5, 3); s.scale(1.5, 1, 0.85); s.rotateZ(a + Math.PI / 2);
    s.translate(Math.cos(a) * 0.32 + 0.1, Math.sin(a) * 0.32, 0); parts.push(shaded(s, (x, y) => [(i === 0 ? 0.62 : 0.82) + 0.18 * sstep(-0.2, 0.3, y) - 0.1 * (i % 2), 0])); // 마디마다 명암
  }
  const a = 2.0 + 0.25, tx = Math.cos(a) * 0.32 + 0.1, ty = Math.sin(a) * 0.32;
  parts.push(shaded(tri([[tx, ty, 0], [tx - 0.24, ty - 0.1, 0.1], [tx - 0.24, ty - 0.1, -0.1]]), () => [0.45, 0])); // 꼬리 부채 (진하게)
  const head = new THREE.ConeGeometry(0.1, 0.25, 4); head.rotateZ(-Math.PI / 2 - 0.2); head.translate(0.52, 0.0, 0); parts.push(shaded(head, () => [0.55, 0])); // 머리 (회색빛)
  return mergeGeometries(parts);
}
// 조개·전복·자갈 돌: 납작한 공 (폭 1)
function clamGeo() {
  const g = new THREE.SphereGeometry(0.5, 6, 3); g.scale(1, 0.42, 0.8);
  return shaded(g, (x, y) => [0.65 + 0.35 * sstep(-0.1, 0.2, y) - 0.12 * (Math.abs(Math.sin(x * 18)) > 0.7 ? 1 : 0), 0]);
}

// 재질: 투톤 + 헤엄 (aSwim > 0 이면 꼬리 흔들고 앞뒤로 살짝 오감)
export function makeSeaMat() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = fxTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float aSwim;\n' + sh.vertexShader
      .replace('#include <color_vertex>', `vColor = vec4(1.0);
#ifdef USE_INSTANCING_COLOR
  vColor.rgb = mix(instanceColor.rgb, vec3(0.92, 0.92, 0.9), color.g) * color.r;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  if (aSwim > 0.0) {
    float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7 + instanceMatrix[3].y * 5.3;
    float tl = smoothstep(0.15, -0.7, position.x);
    transformed.z += sin(uTime * 4.2 + ph - position.x * 5.0) * 0.12 * tl * aSwim;
    transformed.x += sin(uTime * 0.35 + ph) * 0.45 * aSwim;
    transformed.y += sin(uTime * 0.6 + ph * 1.3) * 0.12 * aSwim;
  }`);
  };
  m.customProgramCacheKey = () => 'depot-sea-swim';
  return m;
}

export const SEA_GEO = { fish: fishGeo, crab: crabGeo, shrimp: shrimpGeo, clam: clamGeo };

// 인스턴스 목록 [{x,y,z, s:[sx,sy,sz], rx, ry, rz, color, swim}] → InstancedMesh
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
export function instanced(geo, mat, list, { swim = false } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const sw = new Float32Array(list.length);
  list.forEach((it, i) => {
    _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    const s = it.s; _s.set(s[0], s[1] ?? s[0], s[2] ?? s[0]);
    im.setMatrixAt(i, _m.compose(_p.set(it.x, it.y, it.z), _q, _s));
    im.setColorAt(i, _c.setHex(it.color));
    sw[i] = it.swim || 0;
  });
  if (swim || mat.customProgramCacheKey?.() === 'depot-sea-swim') geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(sw, 1));
  im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// 수조 물: 옅은 청록 + 움직이는 물결빛(코스틱) — 월드 좌표 사인 합으로 밝은 줄무늬
export function makeWaterMat() {
  const m = new THREE.MeshLambertMaterial({ color: 0x3aa8d0, emissive: 0x0a4058, transparent: true, opacity: 0.3, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = fxTime;
    sh.vertexShader = 'varying vec3 vW;\nvarying float vUp;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vUp = abs(normal.y);');
    sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vW;\nvarying float vUp;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
  float cc = sin(vW.x * 11.0 + uTime * 1.3 + sin(vW.z * 7.0 + uTime)) + sin(vW.z * 9.0 - uTime * 1.1 + sin(vW.y * 6.0 + vW.x * 4.0 - uTime * 0.8));
  float ca = smoothstep(1.1, 1.9, cc) * mix(0.18, 1.0, vUp); // 수면에서 또렷, 유리 쪽 옆면은 옅게
  outgoingLight += vec3(0.32, 0.5, 0.55) * ca;
  diffuseColor.a = clamp(diffuseColor.a + ca * 0.18, 0.0, 1.0);
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'depot-water-caustic';
  return m;
}

// 자갈 바닥 텍스처
export function gravelTex(ct) {
  const t = ct(256, 128, (g) => {
    g.fillStyle = '#6a6258'; g.fillRect(0, 0, 256, 128);
    for (let k = 0; k < 900; k++) {
      const v = 90 + Math.random() * 110 | 0, w = 3 + Math.random() * 6;
      g.fillStyle = `rgb(${v + 12},${v + 4},${v - 8})`;
      g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 128, w, w * (0.6 + Math.random() * 0.3), Math.random() * 3, 0, 7); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ===== 과일·채소 =====
// 작은 것(사과·귤·양파·감자·포도송이·바나나 손가락·배추) = 매끈한 20면체, 큰 것(수박) = 80면체 + 줄무늬 정점 색
export function produceGeos() {
  const small = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute('uv').deleteAttribute('normal')); small.computeVertexNormals();
  const big0 = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('uv').deleteAttribute('normal')); big0.computeVertexNormals();
  const p = big0.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getY(i)); const st = Math.sin(a * 7 + p.getX(i) * 2.5) > 0.25 ? 0.55 : 1; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = st; }
  big0.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const sc = new Float32Array(small.attributes.position.count * 3).fill(1);
  small.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  return { small, big: big0 };
}
export function makeProduceMat() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => { // 매장 조명이 위·옆에서만 와서 아래쪽이 새까매지지 않게 바탕 빛을 조금
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * 0.2;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'depot-produce';
  return m;
}
// 빈 하나에 낱개를 둔덕 모양으로 쌓은 목록 (cx,cz 빈 중심, 윗면 y0, 둔덕 반지름 rx·ry·rz)
const PRODUCE = {
  apple: { r: 0.048, sc: [1, 0.92, 1], cols: [0xc8322a, 0xb02420, 0xd8483a, 0xa8301e, 0xc04a2a, 0x9a2a1c] },
  mandarin: { r: 0.042, sc: [1, 0.85, 1], cols: [0xf08a1a, 0xf59a2a, 0xe87a12] },
  onion: { r: 0.046, sc: [1, 0.92, 1], cols: [0xc89a5a, 0xb8854a, 0xd8aa6a] },
  potato: { r: 0.046, sc: [1.35, 0.75, 1], cols: [0xb89060, 0xa8804e, 0xc49c6a] },
  grape: { r: 0.06, sc: [0.85, 1.25, 0.85], cols: [0x9ac84a, 0x8ab83a, 0x5a2a5a, 0xa8d058] },
  banana: { r: 0.04, sc: [2.4, 0.85, 0.95], cols: [0xf2c81e, 0xe8c020, 0xf6d23a], bunch: 4 },
  cabbage: { r: 0.09, sc: [1, 1, 2.1], cols: [0xc8dca0, 0xb8d090, 0xd8e8b0] },
  melon: { r: 0.13, sc: [1.12, 1, 1], cols: [0x3a8a3a, 0x2f7a32, 0x449a40], big: true },
};
export const MOUND_TINT = { apple: 0x7a2018, mandarin: 0xa85a10, onion: 0x8a6a3a, potato: 0x7a5a38, grape: 0x5a7a2a, banana: 0xa88a18, cabbage: 0x8aa070, melon: 0x205a22 };
export function producePile(id, cx, cz, { y0 = 0.7, rx = 1.35, ry = 0.5, rz = 0.9, hx = 1.6, hz = 0.98, density = 1, seed = 0 } = {}) {
  const P = PRODUCE[id]; if (!P) return { big: [], small: [] };
  const out = [], h = (x) => { const v = Math.sin(x * 12.9898 + seed * 7.13 + 78.233) * 43758.5453; return v - Math.floor(v); };
  const sp = P.r * 2 * Math.max(P.sc[0], P.sc[2]) * 0.62 / Math.sqrt(density) * (P.bunch ? 1.6 : 1) + P.r * 0.6;
  let k = 0;
  for (let x = -hx + sp / 2; x < hx; x += sp) for (let z = -hz + sp / 2; z < hz; z += sp * 0.88) {
    k++;
    const jx = x + (h(k) - 0.5) * sp * 0.6, jz = z + (h(k + 0.5) - 0.5) * sp * 0.6;
    const e = (jx / rx) ** 2 + (jz / rz) ** 2;
    const y = y0 + (e < 1 ? ry * Math.sqrt(1 - e) : 0) + P.r * P.sc[1] * 0.55;
    const color = P.cols[Math.floor(h(k + 0.25) * P.cols.length)];
    if (P.bunch) { // 바나나 송이: 손가락 4개를 부채꼴로
      const ry0 = h(k + 0.75) * Math.PI * 2;
      for (let f = 0; f < P.bunch; f++) out.push({ x: cx + jx + Math.cos(ry0 + 1.57) * (f - 1.5) * P.r * 0.9, y: y + f * 0.004, z: cz + jz - Math.sin(ry0 + 1.57) * (f - 1.5) * P.r * 0.9, s: P.sc.map((v) => v * P.r), ry: ry0 + (f - 1.5) * 0.12, rz: 0.25, color });
    } else out.push({ x: cx + jx, y, z: cz + jz, s: P.sc.map((v) => v * P.r * (0.9 + h(k + 0.6) * 0.2)), ry: h(k + 0.9) * 6.28, rx: (h(k + 0.3) - 0.5) * 0.5, color });
  }
  return P.big ? { big: out, small: [] } : { big: [], small: out };
}

