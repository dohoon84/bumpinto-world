// [toon] 정자역 주변만 툰(셀 셰이딩)으로 보이게 한다. 기본 켜짐, ?toon=0 이면 끈다.
//   건물 벽·지붕은 지역 단위로 한 메시에 합쳐져 있어서 MeshToonMaterial 로 통째로 바꾸면
//   반경 밖까지 바뀐다. 그래서 기존 Lambert/Phong/Standard 셰이더에 월드 좌표 마스크를 넣는다.
//   창 불빛(emissive)·가로등 웅덩이(ShaderMaterial, 가산 혼합)는 건드리지 않는다.
import * as THREE from 'three';

export const TOON_RADIUS = 300; // m, 정자역 광장과 주변 블록. 정자 bbox(~600 m)보다 좁아 경계가 보인다
export const TOON_FADE = 50;    // m, 250~350 m 에서 서서히 원래 그림으로

const TOON_U = {
  uToonCenter: { value: new THREE.Vector2(0, 0) },
  uToonRadius: { value: TOON_RADIUS },
  uToonFade: { value: TOON_FADE },
};

const OK = new Set(['MeshLambertMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial', 'MeshPhysicalMaterial']);

export function toonEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('toon') !== '0';
}

export function toonCenter() {
  return TOON_U.uToonCenter.value;
}

export function applyToonMaterial(mat) {
  if (!mat || mat.userData?.toonPatched) return mat;
  if (Array.isArray(mat)) {
    for (const m of mat) applyToonMaterial(m);
    return mat;
  }
  if (!OK.has(mat.type)) return mat;
  if (mat.blending === THREE.AdditiveBlending || mat.fog === false) return mat;
  const pre = Object.hasOwn(mat, 'onBeforeCompile') ? mat.onBeforeCompile : null;
  const prevKey = Object.hasOwn(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, renderer) => {
    pre?.(sh, renderer);
    injectToon(sh);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : (mat.type || '')) + '|toon-v2';
  mat.userData = mat.userData || {};
  mat.userData.toonPatched = true;
  mat.needsUpdate = true;
  return mat;
}

function injectToon(sh) {
  if (sh.fragmentShader.includes('bwToonShade')) return;
  if (!sh.fragmentShader.includes('#include <lights_fragment_end>')) return;
  Object.assign(sh.uniforms, TOON_U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vToonWorld;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvToonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vToonWorld;
uniform vec2 uToonCenter;
uniform float uToonRadius;
uniform float uToonFade;
float bwToonShade(float s) {
  // s = (이미 albedo가 곱해진 조명) / albedo ≈ 낮에 대략 0.6~2.2 이라 0~1로 접어 4단 명암을 먹인다.
  float n = clamp(s * 0.55, 0.0, 1.2);
  if (n < 0.16) return 0.14; // 밤·깊은 그림자. 완전 검정은 피함
  if (n < 0.40) return 0.36;
  if (n < 0.66) return 0.62;
  if (n < 0.88) return 0.84;
  return 1.08;
}
`,
    );
  const warm = `
{
  float toonMaskW = 1.0 - smoothstep(uToonRadius - uToonFade, uToonRadius + uToonFade, length(vToonWorld.xz - uToonCenter));
  if (toonMaskW > 0.001) {
    vec3 warmCol = min(diffuseColor.rgb * vec3(1.10, 1.01, 0.88) + vec3(0.035, 0.016, 0.0), vec3(1.10));
    diffuseColor.rgb = mix(diffuseColor.rgb, warmCol, toonMaskW);
  }
}
`;
  if (sh.fragmentShader.includes('#include <color_fragment>')) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + warm);
  } else if (sh.fragmentShader.includes('#include <lights_lambert_fragment>')) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_lambert_fragment>', warm + '\n#include <lights_lambert_fragment>');
  } else if (sh.fragmentShader.includes('#include <lights_fragment_begin>')) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', warm + '\n#include <lights_fragment_begin>');
  }
  sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
{
  float toonMask = 1.0 - smoothstep(uToonRadius - uToonFade, uToonRadius + uToonFade, length(vToonWorld.xz - uToonCenter));
  if (toonMask > 0.001) {
    vec3 lit = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
    float lum = dot(lit, vec3(0.2126, 0.7152, 0.0722));
    float albedoLum = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.05);
    float shade = lum / albedoLum;
    float n = clamp(shade * 0.55, 0.0, 1.2);
    float q = bwToonShade(shade);
    float k = q / max(n, 1e-5);
    reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, reflectedLight.directDiffuse * k, toonMask);
    reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, reflectedLight.indirectDiffuse * k, toonMask);
    reflectedLight.directSpecular = mix(reflectedLight.directSpecular, reflectedLight.directSpecular * 0.25, toonMask);
    reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, reflectedLight.indirectSpecular * 0.25, toonMask);
  }
}
`,
    );
}

export function applyToonToObject(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) return;
    const mats = [].concat(o.material).filter(Boolean);
    for (const m of mats) {
      if (m.userData?.toonPatched) continue;
      applyToonMaterial(m);
      if (m.userData?.toonPatched) n++;
    }
  });
  return n;
}

export function installToonStyle({ scene, station } = {}) {
  if (station && Number.isFinite(station.x) && Number.isFinite(station.z)) {
    TOON_U.uToonCenter.value.set(station.x, station.z);
  }
  const n = applyToonToObject(scene);
  return { materials: n, radius: TOON_RADIUS, fade: TOON_FADE, center: { x: TOON_U.uToonCenter.value.x, z: TOON_U.uToonCenter.value.y } };
}
