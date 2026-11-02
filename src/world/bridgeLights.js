// [bridgeLights] 저녁 다리 조명 (참고: 탄천 다리 야경 — 난간 기둥마다 짧은 세로 LED(청록→보라→분홍 그라데이션),
//   상판 옆면 연분홍빛 흰 LED 띠, 상판 밑·교각은 따뜻한 흰빛, 수면에 비친 색 번짐)
//   - 진짜 조명 없음: 가산(additive) 발광 사각형만, 전부 BufferGeometry 하나 + ShaderMaterial 하나 → 그리기 1번
//   - 본류(탄천) 차도교·신기교 = major(난간 LED 기둥 + 상판 띠 + 상판 밑 + 교각 + 수면 반사),
//     지류 다리·보행교 = minor(상판 띠 + 보행교 손잡이 LED + 옅은 수면 반사, 가까이서만)
//   - 밝기 = nightFade()(저녁에 4초 페이드) × 거리 페이드(major 900m, minor 260m). 꺼지면 visible=false
//   - ?bridgeLights=0 이면 만들지 않음
import * as THREE from 'three';
import { nightFade, onNightTarget } from './nightFade.js';

export const BRIDGE_LIGHTS_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('bridgeLights') !== '0';

// kind: 0 꽉 찬 발광, 1 둥근 번짐, 2 아래→위로 옅어짐(교각 업라이트), 3 가운데 띠 번짐(v 방향), 4 수면 반사(띠 + 물결)
// game.js 렌더러가 logarithmicDepthBuffer 라서 logdepthbuf 청크가 없으면 깊이가 안 맞아 전부 가려짐
const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 color; attribute vec2 aUv; attribute vec2 aKF;
uniform float uFade;
varying vec3 vC; varying vec2 vUv; varying float vK; varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float d = distance(w.xyz, cameraPosition);
  float far = aKF.y;
  // 멀어지면 가는 LED 는 픽셀보다 작아지므로 번짐(1·3·4)을 키워서 멀리서도 색이 읽히게
  float soft = (aKF.x > 0.5 && aKF.x < 1.5) || (aKF.x > 2.5) ? 1.0 : 0.0;
  float boost = 1.0 + soft * 2.2 * smoothstep(30.0, 220.0, d);
  vC = color * uFade * boost * (1.0 - smoothstep(far * 0.7, far, d));
  vUv = aUv; vK = aKF.x; vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const FS = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uTime;
varying vec3 vC; varying vec2 vUv; varying float vK; varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  float a = 1.0;
  if (vK > 0.5 && vK < 1.5) { float r = length(vUv * 2.0 - 1.0); a = pow(max(0.0, 1.0 - r), 2.2); }
  else if (vK > 1.5 && vK < 2.5) { a = pow(1.0 - vUv.y, 1.6) * sin(3.14159 * vUv.x); }
  else if (vK > 2.5 && vK < 3.5) { float e = 1.0 - abs(vUv.y * 2.0 - 1.0); a = e * e * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x); }
  else if (vK > 3.5) {
    float e = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float rip = 0.55 + 0.45 * sin(vW.x * 1.7 + vW.z * 2.3 + uTime * 1.3) * sin(vW.x * 0.9 - vW.z * 1.1 - uTime * 0.8);
    a = e * e * rip * smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC * a, 1.0);
}`;

const FAR = { major: 900, minor: 260 };

// pieces: [{ x0,z0,h0, x1,z1,h1, W, th, foot, tier:'major'|'minor', s0(다리 시작부터 거리), seed }]
// piers:  [{ x, z, g(바닥), top, pw, yaw, tier }]
// waterAt(x,z) -> 수면 높이 또는 null
export function buildBridgeLights(scene, { pieces, piers, waterAt }) {
  if (!BRIDGE_LIGHTS_ON || !pieces.length) return null;
  const pos = [], col = [], uv = [], kf = [], idx = [];
  const c = new THREE.Color();
  function quad(p, rgb, k, far) { // p: 4 꼭짓점 [x,y,z], uv (0,0)(1,0)(1,1)(0,1)
    const b = pos.length / 3;
    const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) { pos.push(...p[i]); col.push(rgb[0], rgb[1], rgb[2]); uv.push(...U[i]); kf.push(k, far); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const rgbOf = (hex, k) => { c.set(hex); return [c.r * k, c.g * k, c.b * k]; };
  const hueRGB = (h, k) => { c.setHSL(h, 1, 0.62); return [c.r * k, c.g * k, c.b * k]; };
  // 참고 사진 색: 청록(0.5) → 파랑보라(0.72) → 보라분홍(0.86), 다리마다 시작 위상 다름
  const barHue = (s, seed) => 0.5 + 0.36 * (0.5 + 0.5 * Math.sin(s / 16 + seed * 6.28));
  const FASCIA = '#ffdcd2', WARM = '#ffd2a0', RAIL = '#bff3ff';

  for (const q of pieces) {
    const dx = q.x1 - q.x0, dz = q.z1 - q.z0, L = Math.hypot(dx, dz); if (L < 0.3) continue;
    const ux = dx / L, uz = dz / L, rx = -uz, rz = ux, far = FAR[q.tier], major = q.tier === 'major';
    const P = (u, side, off, y) => { const t = u / L; return [q.x0 + ux * u + rx * side * off, q.h0 + (q.h1 - q.h0) * t + y, q.z0 + uz * u + rz * side * off]; };
    const hw = q.W / 2;
    for (const side of [-1, 1]) {
      // 상판 옆면 LED 띠 (상판 아래 모서리 근처) + 번짐
      const yF = 0.06 - Math.min(q.th, 1.1) + 0.18, oF = hw + 0.03;
      quad([P(0, side, oF, yF - 0.06), P(L, side, oF, yF - 0.06), P(L, side, oF, yF + 0.06), P(0, side, oF, yF + 0.06)], rgbOf(FASCIA, major ? 1.15 : 0.75), 0, far);
      quad([P(0, side, oF + 0.02, yF - 0.7), P(L, side, oF + 0.02, yF - 0.7), P(L, side, oF + 0.02, yF + 0.7), P(0, side, oF + 0.02, yF + 0.7)], rgbOf(FASCIA, major ? 0.38 : 0.2), 3, far);
      if (major) {
        // 난간 바깥면 세로 LED 기둥 (2.4m 간격) + 둥근 번짐
        const oB = hw + 0.08, y0 = q.foot ? 0.2 : 0.12, y1 = q.foot ? 0.95 : 0.68;
        for (let u = 1.2 - ((q.s0 || 0) % 2.4); u < L; u += 2.4) {
          if (u < 0.1) continue;
          const rgb = hueRGB(barHue((q.s0 || 0) + u, q.seed), 1.6), glow = hueRGB(barHue((q.s0 || 0) + u, q.seed), 0.55);
          quad([P(u - 0.11, side, oB, y0), P(u + 0.11, side, oB, y0), P(u + 0.11, side, oB, y1), P(u - 0.11, side, oB, y1)], rgb, 0, far);
          const ym = (y0 + y1) / 2;
          quad([P(u - 1.0, side, oB + 0.02, ym - 1.0), P(u + 1.0, side, oB + 0.02, ym - 1.0), P(u + 1.0, side, oB + 0.02, ym + 1.0), P(u - 1.0, side, oB + 0.02, ym + 1.0)], glow, 1, far);
        }
      } else if (q.foot) {
        // 보행교 손잡이 아래 LED 줄 (난간 안쪽, 옅게)
        const oR = hw - 0.18, yR = 0.88;
        quad([P(0, side, oR, yR - 0.03), P(L, side, oR, yR - 0.03), P(L, side, oR, yR + 0.03), P(0, side, oR, yR + 0.03)], rgbOf(RAIL, 0.55), 0, far);
        quad([P(0, side, oR, yR - 0.35), P(L, side, oR, yR - 0.35), P(L, side, oR, yR + 0.35), P(0, side, oR, yR + 0.35)], rgbOf(RAIL, 0.12), 3, far);
      }
      // 수면 반사: 물 위 구간(4m 조각)에만, 다리 옆선에서 바깥으로 4m 띠
      const step = 4;
      for (let u = 0; u < L; u += step) {
        const u1 = Math.min(L, u + step), um = (u + u1) / 2, pm = P(um, side, hw + 2, 0), wy = waterAt(pm[0], pm[2]);
        if (wy == null) continue;
        const rgb = major ? hueRGB(barHue((q.s0 || 0) + um, q.seed), 0.3) : rgbOf(FASCIA, 0.14);
        const a0 = P(u, side, hw - 0.5, 0), a1 = P(u1, side, hw - 0.5, 0), b1 = P(u1, side, hw + (major ? 5 : 3), 0), b0 = P(u, side, hw + (major ? 5 : 3), 0);
        for (const v of [a0, a1, b1, b0]) v[1] = wy + 0.04;
        // uv.y 0..1 가 안→밖: 가운데가 가장 밝게 (띠)
        quad([a0, a1, b1, b0], rgb, 4, far);
      }
    }
    if (major) {
      // 상판 밑 따뜻한 빛 (아래를 향한 면, 폭 방향 가운데 밝게)
      const yU = 0.06 - q.th - 0.03;
      quad([P(0, -1, hw, yU), P(L, -1, hw, yU), P(L, 1, hw, yU), P(0, 1, hw, yU)].map((v) => v), rgbOf(WARM, 0.22), 3, far);
    }
  }
  for (const p of piers) {
    const far = FAR[p.tier], k = p.tier === 'major' ? 0.55 : 0.25, h = p.top - p.g, half = p.pw / 2 + 0.03;
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    // 교각 네 면, 아래에서 위로 옅어지는 업라이트
    for (const [fx, fz, tx, tz] of [[1, 0, 0, 1], [-1, 0, 0, -1], [0, 1, -1, 0], [0, -1, 1, 0]]) {
      const nx = fx * cy + fz * sy, nz = -fx * sy + fz * cy, ex = tx * cy + tz * sy, ez = -tx * sy + tz * cy;
      const cx = p.x + nx * half, cz = p.z + nz * half;
      const y0 = p.g - 0.1, y1 = p.g + Math.min(h, 7);
      quad([[cx - ex * half, y0, cz - ez * half], [cx + ex * half, y0, cz + ez * half], [cx + ex * half, y1, cz + ez * half], [cx - ex * half, y1, cz - ez * half]], rgbOf(WARM, k), 2, far);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKF', new THREE.Float32BufferAttribute(kf, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  // GPU 에 올린 뒤 CPU 쪽 배열은 버림 (레이캐스트/재업로드 없음) → 힙 절약
  const drop = function () { this.array = null; };
  for (const a of Object.values(g.attributes)) a.onUpload(drop);
  g.index.onUpload(drop);
  // 아래 onBeforeRender 클로저가 이 함수 스코프를 붙잡으므로 임시 JS 배열은 비워 둠
  pos.length = col.length = uv.length = kf.length = idx.length = 0;
  const uniforms = { uFade: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'bridge-lights'; mesh.renderOrder = 2; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.onBeforeRender = () => {
    const f = nightFade(); uniforms.uFade.value = f; uniforms.uTime.value = performance.now() / 1000;
    if (f <= 0.001) mesh.visible = false;
  };
  onNightTarget((t) => { if (t > 0) mesh.visible = true; });
  scene.add(mesh);
  return { mesh, quads: g.index.count / 6 };
}
