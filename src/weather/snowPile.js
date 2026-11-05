// [snowpile] v2 — 과장된 적설 미리보기 (?snowpile 없으면 완전 무동작)
//   - 재질 onBeforeCompile: 월드 법선 y 로 윗면에 흰 눈 (기존 OBC·night/colours 체이닝)
//   - mergeStatic 이후 install() 로 최종 재질만 패치 → draw call 유지
//   - 창백한 teal-grey 하늘/안개, Points 원형 눈송이 (라인 눈 대체)
//   - Starbase 스킵. 물·노란 차선 제외.
import * as THREE from 'three';

const ACCUM_PER_S = 0.45;
const MELT_PER_S = 0.1;

const COL = {
  ground: new THREE.Color('#ffffff'),
  park: new THREE.Color('#ffffff'),
  plaza: new THREE.Color('#fbfdff'),
  road: new THREE.Color('#e8eef3'), // 도로는 살짝 회색 — 차선 힌트
  foliage: new THREE.Color('#ffffff'),
  roof: new THREE.Color('#f6fafd'),
  prop: new THREE.Color('#eef3f7'),
  generic: new THREE.Color('#f2f6fa'),
};

const SKY_TOP = new THREE.Color('#a9c2bf');
const SKY_BOT = new THREE.Color('#dfe8ea');
const FOG_COL = new THREE.Color('#b7ccc9');
const NIGHT_SKY_TOP = new THREE.Color('#1a2a32');
const NIGHT_SKY_BOT = new THREE.Color('#2c3e48');
const NIGHT_FOG = new THREE.Color('#24343c');

function parseOpt(search = typeof location !== 'undefined' ? location.search : '') {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  if (!q.has('snowpile')) return { enabled: false, force: null, ramp: false };
  const raw = (q.get('snowpile') ?? '').trim().toLowerCase();
  if (raw === '' || raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
      || raw === 'ramp' || raw === 'auto' || raw === 'live') {
    return { enabled: true, force: null, ramp: true };
  }
  if (raw === 'full' || raw === 'max') return { enabled: true, force: 1, ramp: false };
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') {
    return { enabled: false, force: null, ramp: false };
  }
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n <= 0) return { enabled: false, force: null, ramp: false };
    return { enabled: true, force: Math.min(1, n), ramp: false };
  }
  return { enabled: false, force: null, ramp: false };
}

function underRig(o) {
  for (let p = o; p; p = p.parent) if (p.userData?.rig) return true;
  return false;
}

function isWaterish(mat, mesh) {
  const n = `${mesh?.name || ''} ${mesh?.parent?.name || ''}`.toLowerCase();
  if (/water|stream-terrain|main-water|fountain-pool|pool2|수면/.test(n)) return true;
  if (mat.userData?.snowPile === 'skip' || mat.userData?.noSnow) return true;
  if (!mat.color || mat.vertexColors) return false;
  const hex = mat.color.getHexString();
  // 탄천·분수 물, 노란 차선
  if (hex === '7ec3e6' || hex === '4fc3e8' || hex === 'f2d36b' || hex === 'f5a200') return true;
  if (hex === 'e6f8ff' || hex === '7ce8ff') return true; // fountain spray-ish
  return false;
}

function classify(mat, mesh) {
  const tagged = mat.userData?.snowPile;
  if (tagged === 'skip' || tagged === 'water') return null;
  if (tagged && tagged !== 'generic') return tagged;
  if (isWaterish(mat, mesh)) return null;
  const n = `${mesh?.name || ''} ${mesh?.parent?.name || ''}`.toLowerCase();
  if (/crown|leaf|foliage|tree/.test(n)) return 'foliage';
  if (mesh?.isInstancedMesh && mat.flatShading && mat.color && mat.color.getHexString() === 'ffffff') return 'foliage';
  if (/trunk/.test(n)) return 'prop';
  if (mat.vertexColors && /roof|channel|stream|terrain/.test(n)) {
    if (/channel|stream|terrain/.test(n)) return 'ground'; // 제방·수로 지형도 윗면 눈
    return 'roof';
  }
  if (mat.vertexColors) return 'roof'; // 병합 지붕
  if (/road|street|asphalt/.test(n)) return 'road';
  if (/park|grass|green/.test(n)) return 'park';
  if (/plaza|pavement|pad/.test(n)) return 'plaza';
  if (/ground|block/.test(n)) return 'ground';
  return tagged || 'generic';
}

function patchSnowShader(mat, mode, sharedU) {
  if (mat.userData.__snowPilePatched) return;
  mat.userData.__snowPilePatched = true;
  const snowCol = (COL[mode] || COL.generic).clone();
  const strength = mode === 'road' ? 0.92 : mode === 'foliage' ? 1.0 : mode === 'prop' ? 0.75 : 1.0;
  const foliage = mode === 'foliage' ? 1 : 0;
  const soft = mode === 'ground' || mode === 'park' || mode === 'plaza' ? 1 : 0;

  const prev = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile : null;
  const prevKey = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey.bind(mat) : null;

  mat.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    Object.assign(shader.uniforms, sharedU);
    shader.uniforms.uSnowCol = { value: snowCol };
    shader.uniforms.uSnowStrength = { value: strength };
    shader.uniforms.uSnowFoliage = { value: foliage };
    shader.uniforms.uSnowSoft = { value: soft };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSnowWN;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
{
  vec3 snowN = objectNormal;
  #ifdef USE_INSTANCING
    snowN = mat3(instanceMatrix) * snowN;
  #endif
  vSnowWN = normalize(mat3(modelMatrix) * snowN);
}`,
      );

    // diffuseColor 가 확정된 뒤(맵·버텍스색 포함), 조명 직전에 눈을 섞는다
    const injectEarly = /* glsl */`
#ifndef SNOWPILE_SKIP
{
  float up = vSnowWN.y;
  float mask = smoothstep(0.02, 0.55, up);
  mask = pow(clamp(mask, 0.0, 1.0), 0.45);
  float nz = fract(sin(dot(vSnowWN.xz * 37.0 + vSnowWN.y * 11.0, vec2(12.9898, 78.233))) * 43758.5453);
  mask *= mix(0.88, 1.0, nz);
  if (uSnowSoft > 0.5) mask = max(mask, 0.94 * uSnow);
  float cov = clamp(mask * uSnow * uSnowStrength, 0.0, 1.0);
  snowPileCov = cov;

  if (uSnowFoliage > 0.5) {
    float under = smoothstep(0.5, -0.2, up);
    vec3 winterLeaf = mix(diffuseColor.rgb, vec3(0.14, 0.22, 0.13), uSnow * 0.9 * under);
    float g = dot(winterLeaf, vec3(0.299, 0.587, 0.114));
    winterLeaf = mix(winterLeaf, vec3(g * 0.85), uSnow * 0.6);
    diffuseColor.rgb = mix(winterLeaf, uSnowCol, cov);
  } else {
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowCol, cov);
  }
}
#endif
`;

    const injectLate = /* glsl */`
#ifndef SNOWPILE_SKIP
  float snowLit = mix(0.98, 0.72, uSnowNight);
  outgoingLight = mix(outgoingLight, uSnowCol * snowLit, snowPileCov * (0.78 + 0.22 * uSnow) * mix(1.0, 0.82, uSnowNight));
#endif
`;

    const commonDecl = `#include <common>
varying vec3 vSnowWN;
uniform float uSnow;
uniform vec3 uSnowCol;
uniform float uSnowStrength;
uniform float uSnowFoliage;
uniform float uSnowSoft;
uniform float uSnowNight;
float snowPileCov;`;

    if (shader.fragmentShader.includes('#include <color_fragment>')) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', commonDecl)
        .replace('#include <color_fragment>', `#include <color_fragment>
${injectEarly}`);
      if (shader.fragmentShader.includes('#include <opaque_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `${injectLate}
#include <opaque_fragment>`,
        );
      } else if (shader.fragmentShader.includes('#include <output_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <output_fragment>',
          `${injectLate}
#include <output_fragment>`,
        );
      }
    } else {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', commonDecl)
        .replace('#include <lights_lambert_fragment>', `${injectEarly}
#include <lights_lambert_fragment>`);
      if (shader.fragmentShader.includes('#include <opaque_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `${injectLate}
#include <opaque_fragment>`,
        );
      }
    }
  };

  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : (mat.uuid || 'mat')}|snowV2d|${mode}`;
  mat.needsUpdate = true;
}

function makeFlakes(scene, count) {
  const n = count;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 50;
    pos[i * 3 + 1] = Math.random() * 28;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    size[i] = 0.9 + Math.random() * 2.2;
    phase[i] = Math.random() * Math.PI * 2;
    alpha[i] = 0.45 + Math.random() * 0.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: typeof devicePixelRatio !== 'undefined' ? Math.min(devicePixelRatio, 2) : 1 },
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */`
uniform float uTime;
uniform float uPixelRatio;
attribute float aSize;
attribute float aPhase;
attribute float aAlpha;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime + aPhase;
  p.x += sin(t * 0.9 + aPhase) * 1.4;
  p.z += cos(t * 0.7 + aPhase * 1.3) * 1.1;
  p.y -= fract(t * 0.06 + aPhase * 0.1) * 28.0;
  if (p.y < 0.0) p.y += 28.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(0.8, -mv.z);
  gl_PointSize = aSize * uPixelRatio * (320.0 / dist);
  vAlpha = aAlpha * smoothstep(55.0, 12.0, dist);
}
`,
    fragmentShader: /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(uColor, soft * vAlpha * uOpacity);
}
`,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'snowpile-flakes';
  points.visible = false;
  points.renderOrder = 3;
  scene.add(points);
  return { points, mat, n, half: 25 };
}

/**
 * @param {object} opts
 */
export function mountSnowPile({
  world,
  scene,
  region,
  params,
  getPrecipKind,
  atmosphere = null,
  camera = null,
  mobile = false,
  getHidden = null, // () => true 이면 눈송이 숨김 (지하철 내부 등)
}) {
  const opt = parseOpt(params || (typeof location !== 'undefined' ? location.search : ''));
  const noop = {
    enabled: false, amount: 0, entries: [], patched: 0, opt,
    update() {}, install() {}, setAmount() {},
  };
  if (!opt.enabled) return noop;
  if (region?.id === 'starbase') return { ...noop, skipped: 'starbase', opt };

  const sharedU = {
    uSnow: { value: 0 },
    uSnowNight: { value: 0 },
  };

  const flakeCount = mobile ? 400 : 1000;
  const flakes = makeFlakes(scene, flakeCount);

  let amount = opt.force != null ? opt.force : 0;
  sharedU.uSnow.value = amount;
  let patched = [];
  let installed = false;
  let time = 0;

  // 하늘 리페인트용 버퍼
  const topC = new THREE.Color();
  const botC = new THREE.Color();
  const tmp = new THREE.Color();

  function paintSky(skyGeo, top, bot) {
    if (!skyGeo?.attributes?.position || !skyGeo?.attributes?.color) return;
    const p = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, p.getY(i) / 3000);
      tmp.copy(bot).lerp(top, Math.pow(t, 0.6));
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  }

  function applyAtmosphere(a) {
    if (!atmosphere || !scene || a < 0.001) {
      if (atmosphere) atmosphere.state.softSnow = false;
      return;
    }
    atmosphere.state.softSnow = true;
    const night = !!atmosphere.state.evening;
    const k = Math.min(1, a * 1.15);
    topC.copy(night ? NIGHT_SKY_TOP : SKY_TOP);
    botC.copy(night ? NIGHT_SKY_BOT : SKY_BOT);
    // 기존 하늘에 덮어쓰기
    const skyMesh = scene.children.find((c) => c.isMesh && c.geometry?.attributes?.color && c.material?.side === THREE.BackSide);
    if (skyMesh) paintSky(skyMesh.geometry, topC, botC);
    if (scene.fog) {
      scene.fog.color.copy(night ? NIGHT_FOG : FOG_COL);
      const mode = atmosphere.state; // unused — use getMode via fog defaults
      const follow = true;
      // denser fog
      scene.fog.near = (follow ? 80 : 400) * (night ? 0.7 : 1);
      scene.fog.far = (follow ? 520 : 1400) * (1.15 - 0.45 * k);
    }
    scene.background.copy(botC);
    // hemi/sun cooler — found as scene lights named or via atmosphere
  }


  function install() {
    if (installed || !scene) return { patched: 0 };
    installed = true;
    const seen = new Set();
    const list = [];
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (underRig(o)) return;
      if (o.name === 'snowpile-flakes' || o.name === 'moon') return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        if (!(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial || m.isMeshBasicMaterial)) continue;
        if (m.isMeshBasicMaterial && (m.fog === false || m.transparent)) continue; // UI·달·스프레이
        if (m.transparent && m.opacity < 0.5) continue;
        const mode = classify(m, o);
        if (!mode) continue;
        seen.add(m);
        patchSnowShader(m, mode, sharedU);
        list.push({ mat: m, mode });
      }
    });
    // world 태깅 재질 보강 (traverse 누락 대비)
    for (const e of world?.snowPileEntries || []) {
      if (!e?.mat || seen.has(e.mat)) continue;
      const mode = e.kind || 'ground';
      if (mode === 'skip') continue;
      seen.add(e.mat);
      patchSnowShader(e.mat, mode, sharedU);
      list.push({ mat: e.mat, mode });
    }
    patched = list;
    sharedU.uSnow.value = amount;
    return { patched: list.length };
  }

  function setAmount(a) {
    amount = Math.max(0, Math.min(1, a));
    sharedU.uSnow.value = amount;
  }


  // lights: capture base once, re-lerp each frame (no stack)
  const lightBase = [];
  function captureLights() {
    lightBase.length = 0;
    for (const o of scene.children) {
      if (o.isHemisphereLight) {
        lightBase.push({ o, color: o.color.clone(), ground: o.groundColor.clone(), intensity: o.intensity, kind: 'hemi' });
      } else if (o.isDirectionalLight && o.name !== 'moonlight') {
        lightBase.push({ o, color: o.color.clone(), intensity: o.intensity, kind: 'dir' });
      }
    }
  }
  captureLights();

  function applyLights(a) {
    for (const L of lightBase) {
      if (L.kind === 'hemi') {
        L.o.color.copy(L.color).lerp(new THREE.Color('#d5e2e6'), a * 0.5);
        L.o.groundColor.copy(L.ground).lerp(new THREE.Color('#8a9b9f'), a * 0.45);
      } else {
        L.o.color.copy(L.color).lerp(new THREE.Color('#e8eef2'), a * 0.3);
        L.o.intensity = L.intensity * (1 - 0.08 * a);
      }
    }
  }

  
  function update(dt, cam) {
    time += dt || 0;
    if (opt.force != null) {
      if (amount !== opt.force) setAmount(opt.force);
    } else {
      const kind = getPrecipKind?.() || 'clear';
      const snowing = kind === 'snow';
      const next = snowing
        ? Math.min(1, amount + (dt || 0) * ACCUM_PER_S)
        : Math.max(0, amount - (dt || 0) * MELT_PER_S);
      if (Math.abs(next - amount) > 1e-4) setAmount(next);
    }
    sharedU.uSnow.value = amount;
    sharedU.uSnowNight.value = (atmosphere?.state?.evening) ? 1 : 0;
    applyAtmosphere(amount);
    applyLights(amount);
    const hide = getHidden?.() || amount < 0.02;
    flakes.points.visible = !hide && amount > 0.02;
    flakes.mat.uniforms.uTime.value = time;
    flakes.mat.uniforms.uOpacity.value = Math.min(1, 0.35 + amount * 0.85);
    const c = cam || camera;
    if (c && flakes.points.visible) {
      flakes.points.position.set(c.position.x, Math.max(0, c.position.y - 2), c.position.z);
    }
    return amount;
  }

  return {
    enabled: true,
    get amount() { return amount; },
    get patched() { return patched.length; },
    get entries() { return patched; },
    opt,
    flakeCount,
    install,
    update,
    setAmount,
    sharedU,
  };
}

export { parseOpt as parseSnowPileOpt };
