// [xmas] 컨셉 B "빛의 원뿔". 짙은 8각 심 + 흰 와이어 20가닥 + 금 리본 3바퀴 + 꼭대기 별.
//   기본 켬. ?xmas=0 끄기. ?xmas=auto 는 KST 12/1–12/26 (xmasSeason.js).
//   전구·후광은 인스턴스/포인트 + 시간 유니폼. 블룸 없음.
//   주변 광(?xmasglow=0 이면 끔): 반지름 28m 바닥 빛, 원뿔 옆 빌보드 광기둥, 데스크톱만 PointLight 하나(그림자 없음).
//   전체는 약 340m, 후광은 약 720m, 그 밖 몸체·별은 약 1100m까지. 모바일은 전구를 디자이너 간격(400개)으로 줄인다.
//   충돌은 심 원뿔(반지름 5.2m)만. 바깥 와이어(바닥 링 반지름 8m) 아래는 지나갈 수 있다.
//   미금역 출구 공원은 폭이 약 14m라 지름 16m 링이 도로·건물에 겹친다. 200m 안에도 빈 원이 없어 트리를 두지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNightFade } from './nightLights.js';
import { isMobileMode } from '../mobile/flag.js';
import { xmasActive, xmasGlowEnabled, xmasMode } from './xmasSeason.js';

const BUILD_M = 520;
const FULL_M = 340;
const HALO_M = 720;
const HIDE_M = 1100;
const DROP_M = 1400;
const CONE_R = 5.2;

// 분수 패드(반지름 8.8, -74, 25)와 느티나무 열(x≈-90) 사이는 약 4m뿐이라 폭 18m가 안 들어간다.
// 가로수 서쪽 포장, 분수에서 약 30m. 건물·도로·무대와 떨어짐.
const JEONGJA = { id: 'jeongja', x: -104, z: 22, yaw: 0.35 };
// 스폰(0,0) 앞 제안 (-20, 25)는 건물 벽까지 6.7m. 빈 모래밭.
const STARBASE = { id: 'starbase', x: -32, z: 40, yaw: 0.8 };
// 잔디 폴리곤 중심. 링은 잔디 밖으로 포장까지 나가지만 타워 벽(약 14m)과 가림막 밖.
const JAMSIL = { id: 'jamsil', x: -515, z: -16201, yaw: -0.4 };

const SPEC = {
  H: 27, baseY: 1, R: 8, coreR: 5.4, coreH: 24.5,
  strands: 20,
  day: { core: '#1F5E43', wire: '#F4F1E8', ribbon: '#E8B23A', plinth: '#E9E4DA', nightCore: '#123D2C', nightWire: '#8A8578' },
};

const BULB_COLORS = ['#FFE2A8', '#FF4D5E', '#FFC24A', '#3DFF8A', '#6EB6FF', '#FF7AD9', '#FFFFFF', '#FFE2A8'];

const LIGHT_FN = /* glsl */`
float xmasLight(float along, float ang, float phase, float spark, float night, float time) {
  float wave = 0.5 + 0.5 * sin((1.0 - along) * 14.0 - time * 2.6 + phase * 0.2);
  float crest = smoothstep(0.25, 0.95, wave);
  float rib = ang - along * 18.85 - time * 1.15;
  float chase = smoothstep(0.85, 0.0, abs(mod(rib + 3.14159, 6.28318) - 3.14159));
  float tw = pow(max(0.0, sin(time * (2.4 + spark * 2.0) + phase)), 10.0);
  float sparkle = mix(1.0, 0.45 + tw * 1.35, step(0.62, spark));
  float k = mix(0.78, 1.22, crest) * mix(0.92, 1.4, chase) * sparkle;
  float sweep = smoothstep(0.0, 0.06, fract(time * 0.085)) * smoothstep(0.28, 0.12, fract(time * 0.085));
  k *= mix(1.0, 1.25, sweep * night);
  float damp = mix(0.35, 1.0, night);
  return mix(1.0, k, damp);
}
vec3 xmasSweep(vec3 base, float night, float time) {
  float sweep = smoothstep(0.0, 0.05, fract(time * 0.085)) * smoothstep(0.22, 0.1, fract(time * 0.085));
  vec3 hue = 0.55 + 0.45 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fract(time * 0.085)));
  return mix(base, hue, sweep * night * 0.72);
}
`;

let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  rad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rad.addColorStop(0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeStarGeometry(R = 2, r = 0.82, depth = 0.45) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r : R;
    if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

function buildModel(mobile, glow) {
  const S = SPEC;
  const spacing = mobile ? 1.35 : 0.88;
  const apex = new THREE.Vector3(0, S.baseY + S.H, 0);
  const bulbs = [];

  const wires = [];
  for (let i = 0; i < S.strands; i++) {
    const a = (i / S.strands) * Math.PI * 2;
    const foot = new THREE.Vector3(Math.cos(a) * S.R, S.baseY, Math.sin(a) * S.R);
    const len = foot.distanceTo(apex);
    const bg = new THREE.BoxGeometry(0.09, len, 0.09);
    bg.deleteAttribute('uv');
    const mid = foot.clone().add(apex).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), apex.clone().sub(foot).normalize());
    bg.applyQuaternion(q);
    bg.translate(mid.x, mid.y, mid.z);
    wires.push(bg);
    const n = Math.max(8, Math.floor(len / spacing));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const p = foot.clone().lerp(apex, f);
      bulbs.push({
        p, s: 1 - f * 0.35, along: f, ang: a,
        color: BULB_COLORS[(i * 3 + k) % BULB_COLORS.length],
        spark: ((i * 17 + k * 5) % 10) / 10,
        phase: ((i * 19 + k * 7) % 32) / 32 * Math.PI * 2,
        halo: 2.05,
      });
    }
  }
  if (!mobile) {
    const turns = 3;
    for (let k = 0; k < 72; k++) {
      const f = (k + 0.5) / 72;
      const y = S.baseY + 1.2 + f * (S.H - 3.5);
      const rad = S.R * (1 - (y - S.baseY) / S.H) + 0.35;
      const a = f * turns * Math.PI * 2;
      bulbs.push({
        p: new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad),
        s: 0.85, along: (y - S.baseY) / S.H, ang: a,
        color: k % 4 === 0 ? '#FFFFFF' : '#FFC24A',
        spark: 0.2, phase: f * Math.PI * 4, halo: 1.7,
      });
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      bulbs.push({
        p: new THREE.Vector3(Math.cos(a) * S.R, S.baseY + 0.35, Math.sin(a) * S.R),
        s: 0.7, along: 0.02, ang: a,
        color: BULB_COLORS[i % BULB_COLORS.length],
        spark: i % 3 === 0 ? 0.9 : 0.3, phase: a, halo: 1.8,
      });
    }
  }

  const wireGeo = mergeGeometries(wires);
  for (const w of wires) w.dispose();
  const wireMat = new THREE.MeshLambertMaterial({ color: S.day.wire });
  const coreMat = new THREE.MeshLambertMaterial({ color: S.day.core, flatShading: true });
  const plinthMat = new THREE.MeshLambertMaterial({ color: S.day.plinth, flatShading: true });
  const ringMat = new THREE.MeshLambertMaterial({ color: S.day.ribbon, emissive: '#C98A1E', emissiveIntensity: 0 });
  const ribbonMat = new THREE.MeshLambertMaterial({
    color: S.day.ribbon, emissive: '#C98A1E', emissiveIntensity: 0, side: THREE.DoubleSide, flatShading: true,
  });

  const rb = { turns: 3, width: 0.9, seg: 120 };
  const pos = []; const idx = [];
  for (let k = 0; k <= rb.seg; k++) {
    const f = k / rb.seg;
    const y = S.baseY + 1.2 + f * (S.H - 3.5);
    const rad = S.R * (1 - (y - S.baseY) / S.H) + 0.2;
    const a = f * rb.turns * Math.PI * 2;
    const c = Math.cos(a); const s = Math.sin(a);
    const hw = (rb.width / 2) * (1 - f * 0.4);
    pos.push(c * (rad + hw * 0.31), y - hw, s * (rad + hw * 0.31), c * (rad - hw * 0.31), y + hw, s * (rad - hw * 0.31));
    if (k < rb.seg) { const j = k * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ribbonGeo.setIndex(idx);
  ribbonGeo.computeVertexNormals();

  const n = bulbs.length;
  const bulbGeo = new THREE.OctahedronGeometry(0.2, 0);
  const aAlong = new Float32Array(n);
  const aAng = new Float32Array(n);
  const aPhase = new Float32Array(n);
  const aSpark = new Float32Array(n);
  const aColor = new Float32Array(n * 3);
  const matrices = [];
  const col = new THREE.Color();
  const dummy = new THREE.Object3D();
  bulbs.forEach((b, i) => {
    dummy.position.copy(b.p);
    dummy.scale.setScalar(b.s);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
    aAlong[i] = b.along;
    aAng[i] = b.ang;
    aPhase[i] = b.phase;
    aSpark[i] = b.spark;
    col.set(b.color);
    aColor[i * 3] = col.r; aColor[i * 3 + 1] = col.g; aColor[i * 3 + 2] = col.b;
  });
  bulbGeo.setAttribute('aAlong', new THREE.InstancedBufferAttribute(aAlong, 1));
  bulbGeo.setAttribute('aAng', new THREE.InstancedBufferAttribute(aAng, 1));
  bulbGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  bulbGeo.setAttribute('aSpark', new THREE.InstancedBufferAttribute(aSpark, 1));
  bulbGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));

  const uTime = { value: 0 };
  const uNight = { value: 0 };
  const bulbMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uNight, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      attribute float aAlong; attribute float aAng; attribute float aPhase; attribute float aSpark; attribute vec3 aColor;
      varying vec3 vColor;
      uniform float uTime; uniform float uNight;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      ${LIGHT_FN}
      void main() {
        float k = xmasLight(aAlong, aAng, aPhase, aSpark, uNight, uTime);
        vColor = xmasSweep(aColor, uNight, uTime) * k * mix(0.9, 1.35, uNight);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(vColor, 1.0);
        #include <fog_fragment>
      }`,
    toneMapped: false,
    fog: true,
  });

  const hPos = new Float32Array((n + 0) * 3);
  const hAlong = new Float32Array(n);
  const hAng = new Float32Array(n);
  const hPhase = new Float32Array(n);
  const hSpark = new Float32Array(n);
  const hColor = new Float32Array(n * 3);
  const hSize = new Float32Array(n);
  bulbs.forEach((b, i) => {
    hPos[i * 3] = b.p.x; hPos[i * 3 + 1] = b.p.y; hPos[i * 3 + 2] = b.p.z;
    hAlong[i] = b.along; hAng[i] = b.ang; hPhase[i] = b.phase; hSpark[i] = b.spark;
    hColor[i * 3] = aColor[i * 3]; hColor[i * 3 + 1] = aColor[i * 3 + 1]; hColor[i * 3 + 2] = aColor[i * 3 + 2];
    hSize[i] = mobile ? b.halo * 0.72 : b.halo;
  });
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(hPos, 3));
  haloGeo.setAttribute('aAlong', new THREE.BufferAttribute(hAlong, 1));
  haloGeo.setAttribute('aAng', new THREE.BufferAttribute(hAng, 1));
  haloGeo.setAttribute('aPhase', new THREE.BufferAttribute(hPhase, 1));
  haloGeo.setAttribute('aSpark', new THREE.BufferAttribute(hSpark, 1));
  haloGeo.setAttribute('aColor', new THREE.BufferAttribute(hColor, 3));
  haloGeo.setAttribute('aSize', new THREE.BufferAttribute(hSize, 1));
  const uScale = { value: 400 };
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uNight, uScale, uMap: { value: haloTexture() }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      attribute float aAlong; attribute float aAng; attribute float aPhase; attribute float aSpark; attribute float aSize; attribute vec3 aColor;
      varying vec3 vColor;
      uniform float uTime; uniform float uNight; uniform float uScale;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      ${LIGHT_FN}
      void main() {
        float k = xmasLight(aAlong, aAng, aPhase, aSpark, uNight, uTime);
        vColor = xmasSweep(aColor, uNight, uTime) * k;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * (uScale / max(1.5, -mvPosition.z)) * mix(0.85, 1.15, k);
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying vec3 vColor;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(uMap, gl_PointCoord).a;
        if (a < 0.03) discard;
        gl_FragColor = vec4(vColor * a, a * 0.92);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });

  const starGeoA = makeStarGeometry();
  const starGeoB = starGeoA.clone();
  starGeoB.rotateY(Math.PI / 2);
  const starGeo = mergeGeometries([starGeoA, starGeoB]);
  starGeoA.dispose(); starGeoB.dispose();
  const starMat = new THREE.MeshLambertMaterial({ color: '#F6C445', emissive: '#FFC93C', emissiveIntensity: 0.25, flatShading: true });

  const rayPos = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = Math.cos(a); const s = Math.sin(a);
    const len = 3.4; const w = 0.16;
    rayPos.push(0, 0, 0, c * len, s * len, w, c * len, s * len, -w);
  }
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(rayPos, 3));
  const rayMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uNight, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      varying float vD;
      uniform float uTime; uniform float uNight;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vD = length(position.xy);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying float vD;
      uniform float uTime; uniform float uNight;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float pulse = 0.65 + 0.35 * sin(uTime * 2.2);
        float a = (1.0 - smoothstep(0.2, 3.4, vD)) * pulse * mix(0.15, 0.85, uNight);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.35) * a, a);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });

  const starY = apex.y + 1.5;
  const starHaloGeo = new THREE.BufferGeometry();
  starHaloGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, starY, 0], 3));
  const starHaloMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uNight, uScale, uMap: { value: haloTexture() }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uNight; uniform float uScale;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float pulse = 0.82 + 0.18 * sin(uTime * 2.1);
        gl_PointSize = 9.5 * pulse * (uScale / max(1.5, -mvPosition.z));
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uNight;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(uMap, gl_PointCoord).a * mix(0.25, 1.0, uNight);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(1.0, 0.84, 0.35) * a, a);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });

  const glowMat = new THREE.MeshBasicMaterial({
    map: groundTexture(), color: '#FFC874', transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const glowGeo = new THREE.PlaneGeometry(26, 26);

  const dayCore = new THREE.Color(S.day.core);
  const nightCore = new THREE.Color(S.day.nightCore);
  const dayWire = new THREE.Color(S.day.wire);
  const nightWire = new THREE.Color(S.day.nightWire);
  const wash = new THREE.Color('#ffc874');

  let poolGeo = null; let poolMat = null; let shaftGeo = null; let shaftMat = null; let shaftMatrices = null;
  if (glow) {
    poolGeo = new THREE.PlaneGeometry(56, 56);
    poolMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: wash }, uNight, uTime, ...THREE.UniformsLib.fog },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        #include <common>
        #include <fog_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform vec3 uColor; uniform float uNight; uniform float uTime;
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float disc = exp(-2.6 * r * r) * (1.0 - smoothstep(0.62, 1.0, r));
          float pulse = 0.84 + 0.16 * sin(uTime * 1.6);
          float a = disc * pulse * mix(0.04, 0.55, uNight);
          float fogF = 1.0;
          #ifdef USE_FOG
            fogF = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor = vec4(uColor * a * fogF, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    shaftGeo = new THREE.PlaneGeometry(1, 1);
    shaftGeo.translate(0, 0.5, 0);
    shaftMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: wash }, uNight, uTime, ...THREE.UniformsLib.fog },
      vertexShader: /* glsl */`
        varying float vH;
        #include <common>
        #include <fog_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vH = position.y;
          vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
          mvPosition.x += position.x * 3.2;
          mvPosition.y += position.y * 24.0;
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        varying float vH;
        uniform vec3 uColor; uniform float uNight; uniform float uTime;
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float shaft = smoothstep(0.0, 0.15, vH) * (1.0 - smoothstep(0.45, 1.0, vH));
          float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + vH * 4.0);
          float a = shaft * pulse * mix(0.02, 0.28, uNight);
          float fogF = 1.0;
          #ifdef USE_FOG
            fogF = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor = vec4(uColor * a * fogF, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    });
    shaftMatrices = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 5.6, 0.2, Math.sin(a) * 5.6);
      dummy.updateMatrix();
      shaftMatrices.push(dummy.matrix.clone());
    }
  }

  return {
    wireGeo, wireMat, coreMat, plinthMat, ringMat, ribbonMat, ribbonGeo,
    bulbGeo, bulbMat, matrices, bulbCount: n,
    haloGeo, haloMat, uScale,
    starGeo, starMat, rayGeo, rayMat, starHaloGeo, starHaloMat, starY,
    glowGeo, glowMat, uTime, uNight, dayCore, nightCore, dayWire, nightWire, wash,
    poolGeo, poolMat, shaftGeo, shaftMat, shaftMatrices, glow,
    apexY: apex.y,
  };
}

function spawnTree(kit, spot, y, { glow = false, lamp = false } = {}) {
  const group = new THREE.Group();
  group.name = 'xmas-tree';
  group.userData.perfNoInstance = true;
  group.position.set(spot.x, y, spot.z);
  group.rotation.y = spot.yaw || 0;

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(SPEC.R + 0.6, SPEC.R + 0.9, 0.5, 16), kit.plinthMat);
  plinth.position.y = 0.25;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  plinth.name = 'xmas-plinth';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(SPEC.R, 0.18, 4, 32), kit.ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = SPEC.baseY;
  ring.name = 'xmas-ring';
  const core = new THREE.Mesh(new THREE.ConeGeometry(SPEC.coreR, SPEC.coreH, 8, 3), kit.coreMat);
  core.position.y = SPEC.baseY + SPEC.coreH / 2;
  core.castShadow = true;
  core.receiveShadow = true;
  core.name = 'xmas-core';
  const wires = new THREE.Mesh(kit.wireGeo, kit.wireMat);
  wires.name = 'xmas-wires';
  const ribbon = new THREE.Mesh(kit.ribbonGeo, kit.ribbonMat);
  ribbon.name = 'xmas-ribbon';
  group.add(plinth, ring, core, wires, ribbon);

  const bulbs = new THREE.InstancedMesh(kit.bulbGeo.clone(), kit.bulbMat, kit.bulbCount);
  bulbs.name = 'xmas-bulbs';
  bulbs.frustumCulled = false;
  kit.matrices.forEach((m, i) => bulbs.setMatrixAt(i, m));
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(bulbs);

  const halos = new THREE.Points(kit.haloGeo, kit.haloMat);
  halos.name = 'xmas-halos';
  halos.frustumCulled = false;
  halos.visible = false;
  halos.onBeforeRender = (renderer) => { kit.uScale.value = (renderer.domElement?.height || 800) * 0.5; };
  group.add(halos);

  const starPivot = new THREE.Group();
  starPivot.name = 'xmas-star';
  starPivot.position.y = kit.starY;
  const star = new THREE.Mesh(kit.starGeo, kit.starMat);
  const rays = new THREE.Mesh(kit.rayGeo, kit.rayMat);
  rays.name = 'xmas-rays';
  rays.renderOrder = 2;
  starPivot.add(star, rays);
  group.add(starPivot);

  const starHalo = new THREE.Points(kit.starHaloGeo, kit.starHaloMat);
  starHalo.name = 'xmas-star-halo';
  starHalo.frustumCulled = false;
  starHalo.visible = false;
  group.add(starHalo);

  const glowMesh = new THREE.Mesh(kit.glowGeo, kit.glowMat);
  glowMesh.rotation.x = -Math.PI / 2;
  glowMesh.position.y = 0.05;
  glowMesh.name = 'xmas-glow';
  glowMesh.visible = false;
  glowMesh.renderOrder = 1;
  group.add(glowMesh);

  let pool = null; let shafts = null; let point = null;
  if (glow && kit.poolGeo) {
    pool = new THREE.Mesh(kit.poolGeo, kit.poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    pool.name = 'xmas-wash';
    pool.visible = false;
    pool.renderOrder = 1;
    pool.frustumCulled = false;
    group.add(pool);
    shafts = new THREE.InstancedMesh(kit.shaftGeo, kit.shaftMat, kit.shaftMatrices.length);
    shafts.name = 'xmas-shafts';
    shafts.frustumCulled = false;
    shafts.renderOrder = 2;
    kit.shaftMatrices.forEach((m, i) => shafts.setMatrixAt(i, m));
    shafts.instanceMatrix.needsUpdate = true;
    shafts.visible = false;
    group.add(shafts);
    if (lamp) {
      point = new THREE.PointLight('#ffc874', 0, 42, 2);
      point.position.set(0, 6.5, 0);
      point.castShadow = false;
      point.name = 'xmas-lamp';
      group.add(point);
    }
  }

  return { id: spot.id, x: spot.x, z: spot.z, group, bulbs, halos, rays, starHalo, glow: glowMesh, pool, shafts, point, starPivot };
}

export function xmasSpots({ regionId, corridor = false } = {}) {
  if (regionId === 'starbase') return [STARBASE];
  if (regionId !== 'jeongja') return [];
  const list = [JEONGJA];
  if (corridor) list.push(JAMSIL);
  return list;
}

export function mountXmasTrees({ scene, region = null, terrain = null, params = null, corridor = null } = {}) {
  const flag = params?.get?.('xmas') ?? null;
  const mode = xmasMode(flag);
  const noop = { enabled: false, mode, spots: [], blocks: () => false, update() {}, places: () => [], dispose() {} };
  if (!xmasActive(flag) || !scene) return noop;
  const spots = xmasSpots({ regionId: region?.id, corridor: !!corridor });
  if (!spots.length) return noop;

  const night = createNightFade({ seconds: 4 });
  const mobile = typeof location !== 'undefined' && isMobileMode();
  const glowOn = xmasGlowEnabled(params?.get?.('xmasglow'));
  const lampOn = glowOn && !mobile;
  let kit = null;
  const built = new Map();
  let elapsed = 0;
  const groundY = (x, z) => (terrain ? terrain.getGroundHeight(x, z, 0) : 0) || 0;

  function ensureKit() {
    if (!kit) kit = buildModel(mobile, glowOn);
    return kit;
  }

  function despawn(rec) {
    scene.remove(rec.group);
    rec.bulbs.geometry.dispose();
    rec.bulbs.dispose();
    rec.group.traverse((o) => {
      if (o.geometry && o.geometry !== kit?.wireGeo && o.geometry !== kit?.ribbonGeo && o.geometry !== kit?.haloGeo && o.geometry !== kit?.starGeo && o.geometry !== kit?.rayGeo && o.geometry !== kit?.starHaloGeo && o.geometry !== kit?.glowGeo && o.geometry !== kit?.poolGeo && o.geometry !== kit?.shaftGeo) {
        if (o !== rec.bulbs) o.geometry.dispose();
      }
    });
    built.delete(rec.id);
  }

  function applyNight(k, t) {
    const n = k.uNight.value;
    k.coreMat.color.copy(k.dayCore).lerp(k.nightCore, n);
    k.wireMat.color.copy(k.dayWire).lerp(k.nightWire, n);
    const glow = n * (0.75 + 0.25 * Math.sin(t * 1.6));
    k.ribbonMat.emissiveIntensity = glow;
    k.ringMat.emissiveIntensity = glow * 0.85;
    const pulse = 0.9 + 0.1 * Math.sin(t * 2.1);
    k.starMat.emissiveIntensity = (0.25 + n * 1.55) * pulse;
    k.glowMat.opacity = 0.62 * n;
    if (k.poolMat) {
      const f = ((t * 0.085) % 1 + 1) % 1;
      const open = f <= 0.05 ? f / 0.05 : f >= 0.22 ? 0 : f <= 0.1 ? 1 : (0.22 - f) / 0.12;
      const sweep = Math.max(0, Math.min(1, open));
      const tau = Math.PI * 2;
      k.wash.setRGB(
        0.55 + 0.45 * Math.cos(tau * f),
        0.55 + 0.45 * Math.cos(tau * (f + 0.33)),
        0.55 + 0.45 * Math.cos(tau * (f + 0.67)),
      );
      k.wash.lerp(new THREE.Color('#ffc874'), 1 - sweep * n * 0.85);
      k.poolMat.uniforms.uColor.value.copy(k.wash);
      k.shaftMat.uniforms.uColor.value.copy(k.wash);
    }
  }

  function update(dt, camera) {
    const step = Math.min(0.05, dt || 0);
    elapsed += step;
    const fade = night.update(step);
    const k = kit;
    if (k) {
      k.uTime.value = elapsed;
      k.uNight.value = fade;
      applyNight(k, elapsed);
    }
    if (!camera) return;
    const cx = camera.position.x; const cz = camera.position.z;
    for (const spot of spots) {
      const d = Math.hypot(cx - spot.x, cz - spot.z);
      let rec = built.get(spot.id);
      if (!rec && d < BUILD_M) {
        rec = spawnTree(ensureKit(), spot, groundY(spot.x, spot.z), { glow: glowOn, lamp: lampOn });
        scene.add(rec.group);
        built.set(spot.id, rec);
      } else if (rec && d > DROP_M) {
        despawn(rec);
        continue;
      }
      if (!rec) continue;
      const show = d < HIDE_M;
      rec.group.visible = show;
      if (!show) continue;
      rec.bulbs.visible = d < FULL_M;
      rec.rays.visible = d < FULL_M;
      rec.halos.visible = d < HALO_M && fade > 0.04;
      rec.glow.visible = d < FULL_M && fade > 0.04;
      if (rec.pool) rec.pool.visible = d < FULL_M && fade > 0.02;
      if (rec.shafts) rec.shafts.visible = d < 220 && fade > 0.08;
      if (rec.point) rec.point.intensity = fade * 700 * (0.85 + 0.15 * Math.sin(elapsed * 1.6));
      if (rec.point && k) rec.point.color.copy(k.wash);
      rec.starHalo.visible = fade > 0.04;
      rec.starPivot.rotation.y = elapsed * 0.25;
    }
  }

  function blocks(x, z) {
    for (const rec of built.values()) {
      if (!rec.group.parent) continue;
      if (Math.hypot(x - rec.x, z - rec.z) < CONE_R) return true;
    }
    return false;
  }

  return {
    enabled: true,
    mode,
    spots,
    mobile,
    glow: glowOn,
    blocks,
    update,
    get built() { return built.size; },
    get bulbs() { return kit?.bulbCount || 0; },
    places() {
      return [...built.values()].map((r) => ({
        id: r.id, x: r.x, y: +r.group.position.y.toFixed(2), z: r.z, visible: r.group.visible,
      }));
    },
    dispose() {
      night.dispose();
      for (const rec of [...built.values()]) despawn(rec);
      kit = null;
    },
  };
}
