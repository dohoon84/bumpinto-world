// [corridor] 저녁 건물 불빛. 기본(?nightLights≠0): 라이브 정자 world.js 벽과 코리더 타일이 이 셰이더를 같이 쓰고
//   windowLights.js 사각 창 메시(+1 draw)는 만들지 않는다. ?nightLights=0 이면 예전 그대로(코리더 전용, 정자 쪽 컷, windowLights 사용).
//   - 상세 타일: 라이브 파사드 재질을 코리더 전용으로 복제(텍스처 공유)해 emissive 셰이더 패치 → 드로우콜 증가 없음
//       · 상가(commercial/retail, 낮은 일반 건물 일부): 1층 쇼윈도 따뜻한 빛
//       · 아파트/주거: 창 일부(건물마다 고정 시드) 따뜻한 빛 위주, 사무실: 차가운 빛 위주 + 일부 창 TV 같은 깜빡임
//   - LOD 타일: 벽에 점 무늬 불빛(멀어지면 평균 밝기로 수렴해 반짝임 없음)
//   - 밤 정도 uNight(0..1): evening.js 저녁 여부를 4초에 걸쳐 따라감. ?cnight=0 이면 코리더 타일 불빛 끔(v2 정자 불빛은 ?nightLights=0 으로 끔).
import * as THREE from 'three';
import { watchEvening } from '../evening.js';
import { isDoosan, DOOSAN_GLSL, doosanUniforms } from '../world/doosanNight.js';

const QS = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
// [night-buildings] 새 야간 창 불빛(정자 라이브 포함, 층·건물별 점등률, 랜드마크). ?nightLights=0 → 예전 동작 그대로
export const NIGHT_V2 = !QS || QS.get('nightLights') !== '0';
export const NIGHT_ON = !QS || QS.get('cnight') !== '0'; // 코리더 타일 불빛 (예전 플래그 유지)
const U = { uNight: { value: 0 }, uNT: { value: 0 } };
let target = 0, watching = false;
let cutZ = -Infinity; // 이 z 보다 남쪽(정자 쪽) 건물은 불빛 없음 (v2 에선 정자도 같은 셰이더라 컷 없음)
export function setNightCut(z) { cutZ = NIGHT_V2 ? Infinity : z; }
export const nightCut = () => cutZ;
function ensureWatch() { if (!watching) { watching = true; watchEvening((on) => { target = on ? 1 : 0; }); } }
function step(dt) {
  const v = U.uNight.value; U.uNight.value = v + Math.sign(target - v) * Math.min(Math.abs(target - v), dt / 4);
  U.uNT.value += dt;
}
// v2: 재질 onBeforeRender 에서 벽시계로 진행 → ?corridor=0 이어도 정자 불빛이 페이드된다 (한 프레임에 여러 번 불려도 dt≈0)
let lastT = 0;
function tickNight() {
  const t = performance.now() / 1000, dt = lastT ? Math.min(0.25, t - lastT) : 0;
  lastT = t; if (dt > 0) step(dt);
}
export function updateNight(dt) {
  if (!watching) return;
  if (NIGHT_V2) tickNight(); else step(dt);
}
export const nightUniforms = U;

// 종류 코드: 0 없음, 1 주거, 2 사무실, 3 상가, 4 기타(학교·공공·일반), 5 두산타워(랜드마크 전용 무늬, v2)
export function nightKind(b) {
  if (NIGHT_V2 && isDoosan(b)) return 5;
  const k = b.k;
  if (k === 'apartments' || k === 'residential' || k === 'dormitory' || k === 'house') return 1;
  if (k === 'office') return 2;
  if (k === 'commercial' || k === 'retail' || k === 'supermarket' || k === 'kiosk') return 3;
  return 4;
}
export function nightSeed(b) {
  let x = 0, z = 0; for (const p of b.o) { x += p[0]; z += p[1]; } x /= b.o.length; z /= b.o.length;
  let n = Math.imul(Math.round(x * 2), 374761393) ^ Math.imul(Math.round(z * 2), 668265263);
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return { seed: ((n ^ (n >>> 15)) >>> 0) / 4294967296, z };
}

const GLSL = /* glsl */ `
uniform float uNight, uNT;
float nlHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
// 창 하나의 불빛: id=(창 열, 층, 시드), kind 별 확률/색, 일부 깜빡임
vec3 nlWindow(vec3 id, float kind) {
  float h = nlHash(id), h2 = nlHash(id + 17.3), h3 = nlHash(id + 41.9);
  float kind_ = floor(kind + 0.5); kind = kind_;
  float p = kind < 1.5 ? 0.36 : kind < 2.5 ? 0.22 : kind < 3.5 ? 0.16 : 0.1;
  if (h > p) return vec3(0.0);
  float cool = kind > 1.5 && kind < 2.5 ? 0.65 : 0.2;
  vec3 c = h2 < cool ? vec3(0.72, 0.84, 1.0) : mix(vec3(1.0, 0.74, 0.42), vec3(1.0, 0.86, 0.62), h3);
  float lv = 0.55 + 0.45 * h3;
  if (h2 > 0.93) lv *= 0.55 + 0.45 * step(0.4, fract(sin(floor(uNT * 1.6 + h * 40.0) * 12.9898 + h * 78.2) * 43758.5)); // TV 깜빡임
  return c * lv;
}
`;

// [night-buildings] v2: 건물마다 점등률 40–70 %, 층 단위로 통째 켜짐/꺼짐, 2700–3500K 백열색 + 일부 사무실 백색
const GLSL_V2 = /* glsl */ `
uniform float uNight, uNT;
float nlHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
vec3 nlWindow(vec3 id, float kind) {
  kind = floor(kind + 0.5);
  float ratio = 0.40 + 0.30 * nlHash(vec3(id.z, 3.7, 11.1));
  float fl = nlHash(vec3(id.z, id.y, 5.3));
  bool work = kind > 1.5 && kind < 3.5;
  if (fl < (work ? 0.14 : 0.08)) return vec3(0.0);                      // 통째로 꺼진 층
  float h = nlHash(id), h2 = nlHash(id + 17.3), h3 = nlHash(id + 41.9);
  if (fl < (work ? 0.84 : 0.93) && h > ratio) return vec3(0.0);          // 그 외 층은 창마다 ratio
  float cool = kind > 1.5 && kind < 2.5 ? 0.35 : kind > 2.5 && kind < 3.5 ? 0.2 : 0.08;
  float tone = kind > 1.5 && kind < 2.5 ? fract(fl * 7.13) : h2;          // 사무실은 층마다 같은 색
  vec3 c = tone < cool ? vec3(0.80, 0.88, 1.0) : mix(vec3(1.0, 0.48, 0.15), vec3(1.0, 0.64, 0.32), h3);
  float lv = 0.5 + 0.35 * h3;
  if (kind < 1.5 && h2 > 0.94) lv *= 0.55 + 0.45 * step(0.4, fract(sin(floor(uNT * 1.6 + h * 40.0) * 12.9898 + h * 78.2) * 43758.5)); // TV 깜빡임
  return c * lv;
}
`;
const NL = NIGHT_V2 ? GLSL_V2 + DOOSAN_GLSL : GLSL;

const RECT = { // 파사드 텍스처(world.js paintFacade)의 창 위치 [u0,u1,v0,v1], 좌우 2창
  office: [0.06, 0.47, 0.19, 0.94], commercial: [0.125, 0.48, 0.36, 0.86], residential: [0.125, 0.41, 0.33, 0.86],
  house: [0.125, 0.34, 0.47, 0.78], school: [0.125, 0.48, 0.33, 0.83], public: [0.125, 0.34, 0.32, 0.86], yes: [0.125, 0.41, 0.33, 0.86],
};
const cache = new Map();
// 상세 타일/정자 벽 재질: 파사드 재질 복제 + 불빛. aNL = (시드, 종류, 1층 상가 여부)
// base 에 onBeforeCompile 이 있으면(정자 [colours] 틴트) 이어 붙인다 — clone() 은 onBeforeCompile 을 복사하지 않음.
// id: 캐시/프로그램 키 (기본 key). live=true 는 정자 쪽 (v2 전용).
export function nightFacade(base, key, { id = key, live = false } = {}) {
  if (live ? !NIGHT_V2 : !NIGHT_ON) return base;
  ensureWatch();
  if (cache.has(id)) return cache.get(id);
  const m = base.clone(); m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 1;
  const r = RECT[key] || RECT.yes;
  const pre = Object.hasOwn(base, 'onBeforeCompile') ? base.onBeforeCompile : null;
  const preKey = Object.hasOwn(base, 'customProgramCacheKey') ? base.customProgramCacheKey() : '';
  const lm = NIGHT_V2; // 랜드마크(두산) 분기: 월드 좌표·법선이 필요
  m.onBeforeCompile = (sh, renderer) => {
    pre?.(sh, renderer);
    Object.assign(sh.uniforms, U, lm ? doosanUniforms : {});
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aNL; varying vec3 vNL; varying vec2 vNLUv;' + (lm ? ' varying vec3 vNLP, vNLN;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNL = aNL; vNLUv = uv;' + (lm ? ' vNLP = (modelMatrix * vec4(position, 1.0)).xyz; vNLN = normal;' : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vNL; varying vec2 vNLUv;' + (lm ? ' varying vec3 vNLP, vNLN;' : '') + '\n' + NL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance = vec3(0.0);${lm ? `
      if (vNL.y > 4.5) { vec3 dc = diffuseColor.rgb; totalEmissiveRadiance = nlDoosan(vNLP, vNLN, dc) * uNight; diffuseColor.rgb = dc; } else` : ''}
      if (uNight > 0.001 && vNL.y > 0.5) {
        vec2 cell = floor(vNLUv + 1e-4), f = vNLUv - cell; // 시드는 정수로 양자화(보간 오차로 창 안이 지글거리지 않게)
        float right = step(0.5, f.x); float fx = right > 0.5 ? 1.0 - f.x : f.x;
        vec3 e = vec3(0.0);
        if (vNL.z > 0.5 && cell.y < 0.5) { // 1층 쇼윈도
          float m = step(0.06, f.x) * step(f.x, 0.94) * step(0.06, f.y) * step(f.y, 0.78);
          float sh = nlHash(vec3(cell.x, 3.0, floor(vNL.x * 997.0 + 0.5)));
          e = m * (sh < 0.82 ? mix(vec3(1.0, 0.78, 0.48), vec3(1.0, 0.92, 0.75), sh) * (0.85 + 0.3 * f.y) : vec3(0.0));
        } else if (fx > ${r[0].toFixed(3)} && fx < ${r[1].toFixed(3)} && f.y > ${r[2].toFixed(3)} && f.y < ${r[3].toFixed(3)}) {
          e = nlWindow(vec3(cell.x * 2.0 + right, cell.y, floor(vNL.x * 997.0 + 0.5)), vNL.y);
        }
        totalEmissiveRadiance = e * uNight;
      }`);
  };
  if (NIGHT_V2) m.onBeforeRender = tickNight;
  m.customProgramCacheKey = () => (NIGHT_V2 ? 'night2-' : 'corridorNight-') + key + (preKey ? '|' + preKey : '');
  cache.set(id, m);
  return m;
}

// LOD 건물 재질: 정점 색 + 점 무늬 불빛. aNL = (벽 따라 거리 m, 시드, 종류)
let lodMat = null;
export function nightLodMaterial(base) {
  if (!NIGHT_ON) return base;
  ensureWatch();
  if (lodMat) return lodMat;
  const m = base.clone(); m.emissive = new THREE.Color(0xffffff);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aNL; varying vec3 vNL; varying float vNLy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNL = aNL; vNLy = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vNL; varying float vNLy;\n' + (NIGHT_V2 ? GLSL_V2 : GLSL))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance = vec3(0.0);
      if (uNight > 0.001 && vNL.z > 0.5) {
        vec2 g = vec2(vNL.x / 1.6, vNLy / 3.2), cell = floor(g), f = fract(g);
        float dot_ = step(0.3, f.x) * step(f.x, 0.7) * step(0.35, f.y) * step(f.y, 0.75);
        vec3 e = nlWindow(vec3(cell, floor(vNL.y * 997.0 + 0.5)), vNL.z) * dot_;
        if (vNL.z > 2.5 && cell.y < 0.5) e = vec3(1.0, 0.8, 0.5) * 0.8 * step(0.1, f.y) * step(f.y, 0.8);
        float blur = smoothstep(0.35, 0.9, max(fwidth(g.x), fwidth(g.y)));
        ${NIGHT_V2 ? `float avg = 0.075; vec3 avgC = vec3(1.0, 0.62, 0.32);` : `float avg = vNL.z < 1.5 ? 0.09 : vNL.z < 2.5 ? 0.06 : 0.045; vec3 avgC = vec3(1.0, 0.82, 0.6);`}
        e = mix(e, avgC * avg, blur);
        totalEmissiveRadiance = e * uNight;
      }`);
  };
  if (NIGHT_V2) m.onBeforeRender = tickNight;
  m.customProgramCacheKey = () => (NIGHT_V2 ? 'night2Lod' : 'corridorNightLod');
  lodMat = m;
  return m;
}
