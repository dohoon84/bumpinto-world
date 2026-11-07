// [snowfx] 떨어지는 눈송이. 기본 켬. ?snowfx=0|off|false 이면 weather.js 가 예전 짧은 선분 눈을 그대로 그린다.
//   비(LineSegments)는 건드리지 않는다. 눈일 때만 Points 한 번.
//   가까이 클수록·멀수록 작고 옅다. 가까운 일부만 여섯 갈래 결정. 바람은 비와 같은 계수.
//   안개·로그 깊이 버퍼를 탄다. 지하철 안은 바깥 씬을 그리지 않으므로 비와 같이 안 보인다.
import * as THREE from 'three';
import { isMobileMode } from '../mobile/flag.js';

const RADIUS = 30;
const HEIGHT = 16;

export function snowFxEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const v = (q.get('snowfx') ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'off' || v === 'false' || v === 'no');
}

const VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
varying float vAlpha;
varying float vKind;
varying float vSize;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
uniform float uPixelRatio;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = max(1.15, -mvPosition.z);
  float size = aSize * uPixelRatio * (36.0 / dist);
  gl_PointSize = clamp(size, 1.8, 26.0);
  vSize = gl_PointSize;
  vKind = aKind;
  float depthFade = smoothstep(36.0, 8.0, dist);
  float closeFade = smoothstep(1.05, 2.1, dist);
  vAlpha = aAlpha * depthFade * closeFade;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vKind;
varying float vSize;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord - vec2(0.5);
  float r = length(p);
  float soft = smoothstep(0.5, 0.05, r);
  float ang = atan(p.y, p.x);
  float sector = 1.04719755;
  float fold = abs(mod(ang + sector * 0.5, sector) - sector * 0.5);
  float arm = smoothstep(0.20, 0.015, fold) * smoothstep(0.50, 0.05, r);
  float branch = smoothstep(0.055, 0.0, abs(r - 0.24)) * smoothstep(0.30, 0.04, fold);
  float core = smoothstep(0.15, 0.0, r);
  float crystal = clamp(core * 1.05 + arm * 0.92 + branch * 0.5, 0.0, 1.0);
  float useX = step(0.5, vKind) * smoothstep(10.0, 16.0, vSize);
  float alpha = mix(soft, max(crystal, soft * 0.25), useX) * vAlpha * uOpacity;
  if (alpha < 0.03) discard;
  float spark = smoothstep(0.14, 0.0, r);
  vec3 col = mix(uColor, vec3(1.0), spark * mix(0.25, 0.55, useX));
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

function makeFlake(i, nCrystal) {
  const crystal = i < nCrystal;
  const large = crystal || i % 11 === 0;
  return {
    ax: 0, ay: -999, az: 0,
    vy: 0.42 + Math.random() * 0.7,
    phase: Math.random() * Math.PI * 2,
    amp: (large ? 0.45 : 0.22) + Math.random() * (large ? 0.7 : 0.55),
    freq: 0.32 + Math.random() * 0.5,
    windK: 0.55 + Math.random() * 0.7,
    size: large ? 4.2 + Math.random() * 2.2 : 1.7 + Math.random() * 2.3,
    alpha: crystal ? 0.72 + Math.random() * 0.28 : 0.38 + Math.random() * 0.45,
    kind: crystal ? 1 : 0,
    on: false,
  };
}

/**
 * @param {THREE.Scene} scene
 * @param {{ mobile?: boolean, search?: string }} [opts]
 */
export function createSnowflakes(scene, opts = {}) {
  const mobile = opts.mobile ?? (typeof location !== 'undefined' && isMobileMode());
  const n = mobile ? 280 : 640;
  const nCrystal = Math.round(n * (mobile ? 0.08 : 0.12));
  const flakes = Array.from({ length: n }, (_, i) => makeFlake(i, nCrystal));
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const kind = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3 + 1] = -9999;
    size[i] = flakes[i].size;
    alpha[i] = flakes[i].alpha;
    kind[i] = flakes[i].kind;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#f7fbff') },
      uOpacity: { value: 0.9 },
      uPixelRatio: { value: typeof devicePixelRatio !== 'undefined' ? Math.min(devicePixelRatio, 2) : 1 },
      ...THREE.UniformsLib.fog,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'snowflakes';
  points.frustumCulled = false;
  points.renderOrder = 2;
  points.visible = false;
  scene.add(points);

  function reseed(f, cam) {
    const a = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * RADIUS;
    f.ax = cam.x + Math.cos(a) * rad;
    f.az = cam.z + Math.sin(a) * rad;
    f.ay = cam.y + 1.2 + Math.random() * HEIGHT;
    f.on = true;
  }

  function hide() {
    points.visible = false;
  }

  function update(dt, cam, windSpeed, amount) {
    const show = amount > 0.02 && cam;
    points.visible = !!show;
    if (!show) return;
    const step = Math.min(dt || 0, 0.05);
    const wind = (windSpeed || 0) * 0.04;
    const active = Math.max(1, Math.floor(n * Math.min(1, amount)));
    mat.uniforms.uOpacity.value = 0.72 + 0.28 * Math.min(1, amount);
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const f = flakes[i];
      if (i >= active) {
        pos[o + 1] = -9999;
        f.on = false;
        continue;
      }
      if (!f.on) reseed(f, cam);
      f.phase += step * f.freq * Math.PI * 2;
      f.ax += wind * f.windK * step;
      f.az += wind * 0.28 * f.windK * step;
      f.ay -= f.vy * step;
      const dx = f.ax - cam.x;
      const dz = f.az - cam.z;
      if (f.ay < cam.y - 2.4 || dx * dx + dz * dz > (RADIUS + 4) * (RADIUS + 4)) reseed(f, cam);
      pos[o] = f.ax + Math.sin(f.phase) * f.amp;
      pos[o + 1] = f.ay;
      pos[o + 2] = f.az + Math.cos(f.phase * 0.81 + 0.6) * f.amp * 0.72;
    }
    geo.attributes.position.needsUpdate = true;
  }

  return {
    points,
    count: n,
    hide,
    update,
    dispose() {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    },
  };
}
