// [pangyo-deck-lights] 판교역 광장 데크 가장자리 야간 조명 (참고: 판교역 광장 데크 야경 사진)
//   - 데크 바깥 테두리를 따라 위·아래 청록 LED 줄, 그 사이 유리 난간 패널은 분홍·보라·흰빛이 촘촘히 켜지고 천천히 색이 흐름, 데크 밑면은 은은한 빛
//   - 진짜 조명 없음: 가산 발광 면 + 절차적 셰이더 패턴. 메시 1개(BufferGeometry 하나 + ShaderMaterial 하나) → 밤에만 draw +1, 낮엔 visible=false(0)
//   - 데크 외곽·높이는 공유 데이터(pangyo/index.json 의 pangyoDeck landmark parts: o·holes·mh·h) — landmarks/pangyo.js buildDeck 과 같은 원본
//   - 켜짐 = 저녁 스위치(evening.js) 를 world/nightFade.js 가 4초에 걸쳐 따라가는 값. 애니메이션 = uTime 유니폼 하나
//   - 타일 상세 그룹에 붙어 같이 생기고 해제(멀리 LOD 상자일 땐 없음). 거리 페이드 FAR
//   - ?pangyodeckled=0 이면 만들지 않음 (?pangyo=0 이면 판교 랜드마크 자체가 없음). 로고·광고 문구 없음
import * as THREE from 'three';
import { nightFade, nightTarget, onNightTarget } from '../../world/nightFade.js';

export function pangyoDeckLightsEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  return q.get('pangyodeckled') !== '0' && q.get('pangyo') !== '0';
}

export const DECK_LIGHTS = {
  FAR: 1100, // 이 거리에서 완전히 꺼짐 (70% 부터 페이드)
  SEG: 6, // 테두리 조각 최대 길이(m) — 거리 페이드가 정점 단위라 너무 길면 안 됨
  OUT: 0.06, // 데크 옆면/난간 바깥으로 띄우는 거리(m, z-fighting 방지)
  UNDER_W: 5, // 밑면 은은한 빛 폭(m, 가장자리에서 안쪽으로)
};

// kind: 0 청록 LED 줄 · 1 다색 패널 · 2 줄 주변 번짐(halo) · 3 밑면 빛
const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 aSV; attribute float aK;
uniform float uFade; uniform float uFar;
varying vec2 vSV; varying float vK; varying float vB;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float d = distance(w.xyz, cameraPosition);
  // 멀어지면 가는 줄이 픽셀보다 얇아지므로 번짐(2)을 키워 색이 읽히게
  float boost = aK > 1.5 && aK < 2.5 ? 1.0 + 1.6 * smoothstep(40.0, 400.0, d) : 1.0;
  vB = uFade * boost * (1.0 - smoothstep(uFar * 0.7, uFar, d));
  vSV = aSV; vK = aK;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const FS = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uTime;
varying vec2 vSV; varying float vK; varying float vB;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
const vec3 TEAL = vec3(0.25, 1.0, 0.92);
vec3 pal(float t) { // 분홍 → 보라 → 흰빛 → 분홍 (참고 사진 패널 색)
  t = fract(t);
  vec3 pink = vec3(1.0, 0.22, 0.62), purple = vec3(0.58, 0.22, 1.0), white = vec3(1.0, 0.9, 0.97);
  return t < 0.45 ? mix(pink, purple, t / 0.45) : t < 0.8 ? mix(purple, white, smoothstep(0.62, 0.8, t)) : mix(white, pink, (t - 0.8) / 0.2);
}
void main() {
  #include <logdepthbuf_fragment>
  float s = vSV.x, v = vSV.y;
  vec3 c;
  if (vK < 0.5) { // LED 줄: 아주 느린 밝기 물결
    c = TEAL * (1.35 + 0.25 * sin(s * 0.08 - uTime * 0.6));
  } else if (vK < 1.5) { // 패널: 1.5m 칸(사이 어두운 프레임) 안에 촘촘한 점등 + 칸마다 다른 색이 천천히 흐름
    float pi = floor(s / 1.5), ps = fract(s / 1.5);
    float frame = smoothstep(0.0, 0.05, ps) * smoothstep(1.0, 0.95, ps) * smoothstep(0.0, 0.06, v) * smoothstep(1.0, 0.94, v);
    vec2 cell = vec2(floor(s / 0.25), floor(v * 8.0));
    vec2 f = vec2(fract(s / 0.25), fract(v * 8.0)) - 0.5;
    float tw = 0.55 + 0.45 * sin(uTime * (0.7 + h2(cell) * 0.9) + h2(cell + 7.0) * 6.28);
    float dotv = smoothstep(0.5, 0.15, length(f)) * tw;
    vec3 col = pal(h1(pi) * 0.35 + s * 0.006 - uTime * 0.035 + v * 0.12);
    c = col * (0.35 + 1.25 * dotv) * frame;
  } else if (vK < 2.5) { // 번짐: 가운데(v=0.5)가 밝고 위아래로 사라짐
    float e = 1.0 - abs(v * 2.0 - 1.0);
    c = mix(TEAL, pal(s * 0.006 - uTime * 0.035), 0.55) * 0.32 * e * e;
  } else { // 밑면: 가장자리(v=0)에서 안쪽으로 옅어지는 연보라 흰빛
    c = vec3(0.85, 0.78, 1.0) * 0.7 * pow(1.0 - v, 1.6);
  }
  c *= vB;
  if (max(c.r, max(c.g, c.b)) < 0.003) discard;
  gl_FragColor = vec4(c, 1.0);
}`;

// 재질·유니폼·저녁 구독은 모듈에 하나 (타일이 다시 빌드돼도 늘지 않음). 타일 dispose 는 지오메트리만 정리하므로
//   메시별 구독을 두면 새어 나간다 → 살아 있는 메시 집합을 저녁 전환 때 정리(씬에서 떨어진 것은 뺀다)
let S = null;
const live = new Set();
const attached = (o) => { while (o.parent) o = o.parent; return !!o.isScene; };
function shared() {
  if (S) return S;
  const uniforms = { uFade: { value: 0 }, uTime: { value: 0 }, uFar: { value: DECK_LIGHTS.FAR } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  mat.name = 'pangyoDeckLights';
  S = { uniforms, mat };
  onNightTarget((t) => { for (const m of live) { if (!attached(m)) { live.delete(m); continue; } if (t > 0) m.visible = true; } });
  return S;
}
function onBefore() {
  const f = nightFade(); S.uniforms.uFade.value = f; S.uniforms.uTime.value = (performance.now() / 1000) % 3600;
  if (f <= 0.001 && nightTarget() === 0) this.visible = false; // 꺼지는 페이드가 끝나면 숨김 → draw 0
}

const areaOf = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

// 데크 테두리 조각: [{ ax, az, bx, bz, nx, nz(바깥 법선), s0(둘레 누적 거리), L }]
//   바깥 링은 데크 바깥, 구멍 링은 구멍 쪽(= 데크 없는 쪽)이 '바깥'
export function deckEdges(part, seg = DECK_LIGHTS.SEG) {
  const out = [];
  const rings = [[part.o, 1], ...(part.holes || []).map((h) => [h, -1])];
  for (const [r, sign] of rings) {
    if (!r || r.length < 3) continue;
    const ccw = areaOf(r) > 0 ? 1 : -1;
    let s = 0;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      // x-z 평면 면적 > 0 이면 (dz, -dx) 가 바깥
      const k = ccw * sign, nx = (dz / L) * k, nz = (-dx / L) * k;
      const n = Math.max(1, Math.ceil(L / seg));
      for (let j = 0; j < n; j++) {
        const t0 = j / n, t1 = (j + 1) / n;
        out.push({ ax: ax + dx * t0, az: az + dz * t0, bx: ax + dx * t1, bz: az + dz * t1, nx, nz, s0: s + L * t0, L: L / n });
      }
      s += L;
    }
  }
  return out;
}

// l: pangyoDeck landmark (parts: [{ o, holes, mh, h }]) → THREE.Mesh 또는 null
export function buildPangyoDeckLights(l, { enabled = pangyoDeckLightsEnabled() } = {}) {
  if (!enabled || !l?.parts?.length) return null;
  const pos = [], sv = [], kk = [], idx = [];
  const quad = (p, s, k) => { // p: 4 점 (0,0)(1,0)(1,1)(0,1) 순, s: [s0, s1]
    const b = pos.length / 3, V = [0, 0, 1, 1], S = [s[0], s[1], s[1], s[0]];
    for (let i = 0; i < 4; i++) { pos.push(...p[i]); sv.push(S[i], V[i]); kk.push(k); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const { OUT, UNDER_W } = DECK_LIGHTS;
  for (const p of l.parts) {
    if (!(p.o?.length >= 3) || !Number.isFinite(p.h)) continue;
    const y0 = Number.isFinite(p.mh) ? p.mh : p.h - 1, y1 = p.h;
    // 세로 배치: 패널 = 상판 옆면 위쪽 + 유리 난간(buildDeck: 상판 위 1.1m), 그 위·아래 청록 줄
    const pa = Math.max(y0 + 0.3, y1 - 0.85), pb = y1 + 1.05, LT = 0.07;
    for (const e of deckEdges(p)) {
      const s = [e.s0, e.s0 + e.L];
      const at = (x, z, o, y) => [x + e.nx * o, y, z + e.nz * o];
      const wall = (o, ya, yb, k) => quad([at(e.ax, e.az, o, ya), at(e.bx, e.bz, o, ya), at(e.bx, e.bz, o, yb), at(e.ax, e.az, o, yb)], s, k);
      wall(OUT, pa, pb, 1); // 다색 패널
      wall(OUT + 0.01, pa - LT * 2, pa - LT * 0.4, 0); // 아래 청록 줄
      wall(OUT + 0.01, pb + LT * 0.4, pb + LT * 2, 0); // 위 청록 줄
      wall(OUT + 0.02, pa - 0.55, pa + 0.25, 2); // 아래 줄 번짐
      wall(OUT + 0.02, pb - 0.25, pb + 0.55, 2); // 위 줄 번짐
      // 밑면: 가장자리 → 안쪽 UNDER_W, 아래를 향함
      const yu = y0 - 0.04;
      quad([at(e.ax, e.az, -0.05, yu), at(e.bx, e.bz, -0.05, yu), at(e.bx, e.bz, -UNDER_W, yu), at(e.ax, e.az, -UNDER_W, yu)], s, 3);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSV', new THREE.Float32BufferAttribute(sv, 2));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(kk, 1));
  g.setIndex(idx); // 정점 6만 넘으면 three 가 Uint32 로
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, shared().mat);
  mesh.name = 'pangyoDeckLights'; mesh.renderOrder = 2; mesh.castShadow = mesh.receiveShadow = false;
  mesh.visible = nightTarget() > 0 || nightFade() > 0.001;
  mesh.onBeforeRender = onBefore;
  live.add(mesh);
  mesh.userData.quads = idx.length / 6;
  return mesh;
}
