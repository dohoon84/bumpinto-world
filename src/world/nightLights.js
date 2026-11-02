// [nightLights] 밤 조명 공용 도우미 (가로등 등 여러 기능이 같이 쓰는 작은 모듈)
//   - createNightFade(): evening.js 저녁 여부(weather.js 시간대 · ?hour · ?evening)를 몇 초에 걸쳐 따라가는 0..1 값.
//       코리더 건물 불빛(src/corridor/nightLights.js uNight)과 같은 방식·속도(기본 4초)라 같이 켜지고 꺼진다.
//   - lightPoolMaterial(): 실제 광원 없이 바닥에 깔리는 "불빛 웅덩이" 가산 혼합 재질(인스턴스 사각형용, 텍스처 없음).
//       uNight 로 밝기를 조절하고 안개 거리에서 자연스럽게 사라진다. 렌더러가 로그 깊이 버퍼를 쓰므로 logdepthbuf 청크 필수.
import * as THREE from 'three';
import { watchEvening } from '../evening.js';

/** 저녁 여부를 seconds 초에 걸쳐 따라가는 0..1 값. update(dt) 를 프레임마다 불러야 움직인다. */
export function createNightFade({ seconds = 4 } = {}) {
  let target = 0, ticks = 0;
  const fade = {
    value: 0,
    get on() { return target > 0.5; },
    update(dt) {
      ticks++;
      const v = fade.value;
      if (v !== target) fade.value = v + Math.sign(target - v) * Math.min(Math.abs(target - v), dt / seconds);
      return fade.value;
    },
    dispose() { stop(); },
  };
  // 첫 프레임 전에 정해진 상태는 페이드 없이 바로(밤에 입장하면 처음부터 켜져 있게)
  const stop = watchEvening((on) => { target = on ? 1 : 0; if (!ticks) fade.value = target; });
  return fade;
}

/**
 * 바닥 불빛 웅덩이 재질. 로컬 XZ 평면 사각형(-hx..hx, -hz..hz)에 초점(±focusX, 0) 두 개의 부드러운 타원 빛.
 * 초점이 하나면 focusX = 0. radius(X) · radiusZ 는 로컬 단위(인스턴스 배율이 곱해진다).
 * 빛은 가장자리로 갈수록 천천히 줄어(가우스 비슷한 꼴) 이웃 웅덩이와 겹치면 길을 따라 이어진 은은한 빛이 된다.
 */
export function lightPoolMaterial({ color = '#ffcf8a', intensity = 0.55, radius = 6, radiusZ = radius, focusX = 0 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uNight: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uRadius: { value: radius },
      uRadiusZ: { value: radiusZ },
      uFocus: { value: focusX },
      ...THREE.UniformsLib.fog,
    },
    vertexShader: /* glsl */ `
      varying vec2 vLocal;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vLocal = position.xz;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight, uIntensity, uRadius, uRadiusZ, uFocus;
      uniform vec3 uColor;
      varying vec2 vLocal;
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 inv = vec2(1.0 / uRadius, 1.0 / uRadiusZ);
        float d = min(length((vLocal - vec2(uFocus, 0.0)) * inv), length((vLocal + vec2(uFocus, 0.0)) * inv));
        // 가운데는 둥글고 가장자리는 길게 꼬리를 끄는 감쇠(d = 1 에서 0)
        float a = exp(-3.0 * d * d) * (1.0 - smoothstep(0.6, 1.0, d));
        float f = 1.0;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            f = exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            f = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
          #endif
        #endif
        gl_FragColor = vec4(uColor * (a * uIntensity * uNight * f), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  m.name = 'nightLightPool';
  return m;
}
