// [corridor] 롯데월드타워 야간 LED 쇼 (태극기 + 색 변주). 실제 조명/블룸 없음 — 기존 타워 재질의 emissive 를 셰이더 패턴으로 바꾸고,
//   멀리서도 보이도록 같은 패턴의 저폴리 원경 메시(가산 혼합, 1 드로우콜)를 하나 둔다.
//   - 패턴(약 18초씩, 3초 크로스페이드): ① 흰 바탕 태극기(빨강·파랑 태극, 검은 4괘)  ② 빨강/파랑 띠가 천천히 오르는 변주
//     ③ 어두운 외벽 + 따뜻한 창 + 큰 태극 — 모든 패턴에서 크라운은 파란 격자, 꼭대기는 빨강
//   - 저녁/밤(evening.js)이 되면 4초에 걸쳐 켜지고 꺼진다(팝 없음)
//   - 원경 메시: 장면 안개와 같은 비율로 페이드인(가까운 타워의 발광이 안개에 묻히는 만큼 더해짐 → 거리 전환이 매끄러움),
//     카메라 원거리 평면(5km) 밖이면 같은 시선 방향 4km 지점으로 축소 이동(각크기 동일)해서 복정·송파에서도 보인다.
//   - 문자/로고 없음. 각 면에 같은 태극기(바깥에서 봐서 뒤집히지 않게 면마다 좌우 축을 잡음)
import * as THREE from 'three';

export const LED_GLSL = /* glsl */ `
uniform float uLedT;
uniform vec3 uLedW;
uniform float uLedOcc, uLedH, uLedBH, uLedOH, uLedTH, uLedFH;
float ledHalf(float y) { float t = clamp(y / uLedOcc, 0.0, 1.0); return uLedBH - (uLedBH - uLedOH) * pow(t, 1.55); }
float ledHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ledTrigram(vec2 q, vec2 c, vec3 brk) {
  vec2 d = normalize(c); vec2 r = q - c; float a = dot(r, d), b = dot(r, vec2(-d.y, d.x));
  const float pitch = 0.17, th = 0.11, hl = 0.25, gap = 0.04;
  if (abs(b) > hl || abs(a) > pitch * 1.5) return 0.0;
  float k = floor(a / pitch + 1.5); float f = a - (k - 1.0) * pitch;
  if (abs(f) > th * 0.5) return 0.0;
  float br = k < 0.5 ? brk.x : (k < 1.5 ? brk.y : brk.z);
  if (br > 0.5 && abs(b) < gap) return 0.0;
  return 1.0;
}
// 태극: R 반지름, 빨강 위(왼쪽 위), 파랑 아래 — 경계축 56.31° 기울기(국기 규격)
vec3 ledTaeguk(vec2 q, float R, out float inside) {
  inside = step(length(q), R);
  vec2 ax = vec2(0.5547, 0.8321); float u = dot(q, ax), v = dot(q, vec2(-ax.y, ax.x));
  float red = step(0.0, v);
  if (length(vec2(u + R * 0.5, v)) < R * 0.5) red = 1.0;
  if (length(vec2(u - R * 0.5, v)) < R * 0.5) red = 0.0;
  return mix(vec3(0.0, 0.28, 0.85), vec3(0.95, 0.08, 0.14), red);
}
// p: 타워 로컬 좌표, win: 창문 발광(근경=텍스처, 원경=절차) → 몸체 LED 색
vec3 ledBody(vec3 p, vec3 win) {
  float y = p.y;
  // 면 판정 + 바깥에서 본 오른쪽 축
  float X = abs(p.x) >= abs(p.z) ? (p.x > 0.0 ? -p.z : p.z) : (p.z > 0.0 ? p.x : -p.x);
  // LED 픽셀 격자(층·멀리언)
  float px = step(0.16, fract(X / 1.55)) * step(0.22, fract(y / uLedFH));
  float pix = 0.35 + 0.65 * px;
  // 면 폭이 좁아(≈60m) 국기를 세로로 2.4배 늘여 몸체 중간(약 170m)을 채운다 — 멀리서도 읽히게
  float yC = uLedOcc * 0.4, k = ledHalf(yC) / 1.15;
  vec2 q = vec2(X / k, (y - yC) / (k * 2.4));
  vec2 q3 = vec2(X, y - yC) / k;
  // ① 태극기
  vec3 c1 = win * 0.55;
  if (abs(q.y) < 1.3) {
    float ins; vec3 tg = ledTaeguk(q, 0.5, ins);
    float tri = ledTrigram(q, vec2(-1.04, 0.69), vec3(0.0)) + ledTrigram(q, vec2(1.04, -0.69), vec3(1.0))
              + ledTrigram(q, vec2(1.04, 0.69), vec3(1.0, 0.0, 1.0)) + ledTrigram(q, vec2(-1.04, -0.69), vec3(0.0, 1.0, 0.0));
    c1 = ins > 0.5 ? tg : (tri > 0.5 ? vec3(0.0) : vec3(0.92, 0.93, 0.95));
  }
  // ② 빨강/파랑 띠 (위로 천천히), 금빛 창 점
  float h = y / uLedOcc;
  float band = fract(h * 4.0 - uLedT * 0.025);
  vec3 c2 = band < 0.5 ? vec3(0.9, 0.06, 0.12) : vec3(0.05, 0.25, 0.9);
  c2 = mix(c2, vec3(1.0, 0.78, 0.35), clamp(dot(win, vec3(0.33)) - 0.25, 0.0, 1.0) * 0.6);
  // ③ 어두운 외벽 + 따뜻한 창 + 큰 태극
  float ins3; vec3 tg3 = ledTaeguk(q3, 0.72, ins3);
  vec3 c3 = mix(win * 0.8, tg3, ins3);
  vec3 c = c1 * uLedW.x + c2 * uLedW.y + c3 * uLedW.z;
  return c * pix;
}
// 크라운: 파란 격자, 꼭대기 빨강 (v = 크라운 높이 0..1)
vec3 ledCrown(float v) {
  vec3 blue = vec3(0.1, 0.35, 1.0), red = vec3(1.0, 0.08, 0.1);
  float pulse = 0.8 + 0.2 * sin(uLedT * 0.8 - v * 6.0);
  return mix(blue * pulse, red, smoothstep(0.6, 0.66, v));
}
`;

const PERIOD = 18, FADE = 3, N = 3;
export function ledUniforms(P) {
  return {
    uLedT: { value: 0 }, uLedW: { value: new THREE.Vector3(1, 0, 0) }, uLed: { value: 0 },
    uLedOcc: { value: P.occ }, uLedH: { value: P.height }, uLedBH: { value: P.baseHalf }, uLedOH: { value: P.occHalf }, uLedTH: { value: P.topHalf }, uLedFH: { value: P.occ / P.floors },
  };
}
// 패턴 가중치(크로스페이드)
export function ledWeights(t, out) {
  const ph = t / PERIOD, i = Math.floor(ph) % N, f = (ph % 1) * PERIOD, w = [0, 0, 0];
  const k = f > PERIOD - FADE ? (f - (PERIOD - FADE)) / FADE : 0, s = k * k * (3 - 2 * k);
  w[i] = 1 - s; w[(i + 1) % N] = s;
  return out.set(w[0], w[1], w[2]);
}

// 기존 MeshStandardMaterial 에 LED 패치 (body: 창 텍스처 발광을 LED 로, crown: 파란 격자/빨간 꼭대기)
export function patchLed(mat, U, kind) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLedPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLedPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLedPos;\nuniform float uLed;\n' + LED_GLSL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (kind === 'body'
        ? 'if (uLed > 0.001) totalEmissiveRadiance = mix(totalEmissiveRadiance, ledBody(vLedPos, totalEmissiveRadiance), uLed);'
        : 'if (uLed > 0.001) totalEmissiveRadiance = mix(totalEmissiveRadiance, ledCrown(clamp((vLedPos.y - uLedOcc) / (uLedH - uLedOcc), 0.0, 1.0)) * ' + (kind === 'glass' ? '0.55' : '1.0') + ', uLed);'));
  };
  mat.customProgramCacheKey = () => 'lotteLed-' + kind;
  mat.needsUpdate = true;
}

// 원경 메시: 단면 링(몸체 5층마다 + 크라운) 로프트, 가산 혼합 셰이더
export function buildLedFar(P, section, profile, seamAt, crownHalf, U) {
  const ys = []; for (let y = 0; y <= P.occ; y += (P.occ / P.floors) * 5) ys.push(y); if (ys[ys.length - 1] < P.occ) ys.push(P.occ);
  const crownH = P.height - P.occ; for (let j = 1; j <= 8; j++) ys.push(P.occ + (crownH * j) / 8);
  const pos = [], idx = []; let nPer = 0;
  for (const y of ys) {
    const h = (y <= P.occ ? profile(y, P) : crownHalf((y - P.occ) / crownH)) + 0.6;
    const s = section(h, h * 0.42, y <= P.occ ? seamAt(y) : 0.01, y <= P.occ ? 1.5 : 0.01); nPer = s.length;
    for (const p of s) pos.push(p.x, y, p.z);
  }
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < nPer; i++) { const a = j * nPer + i, b = j * nPer + ((i + 1) % nPer); idx.push(a, b, b + nPer, a, b + nPer, a + nPer); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uFar: { value: 0 } },
    vertexShader: 'varying vec3 vLedPos; void main(){ vLedPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vLedPos; uniform float uFar;\n' + LED_GLSL + `
      void main(){
        vec3 c;
        if (vLedPos.y > uLedOcc) { float v = (vLedPos.y - uLedOcc) / (uLedH - uLedOcc); c = ledCrown(v) * 0.85; }
        else {
          float X = abs(vLedPos.x) >= abs(vLedPos.z) ? vLedPos.z : vLedPos.x;
          vec2 cell = floor(vec2(X / 1.55, vLedPos.y / uLedFH));
          float r = ledHash(cell); vec3 win = r < 0.6 ? mix(vec3(1.0, 0.85, 0.6), vec3(0.8, 0.88, 1.0), step(0.45, r)) * (0.5 + r * 0.6) : vec3(0.0);
          c = ledBody(vLedPos, win);
        }
        gl_FragColor = vec4(c * uFar, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'lotte-led-far'; mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  // 렌더 직전에 카메라 거리로 페이드/축소 이동 (onBeforeRender 는 modelViewMatrix 계산 전에 불린다)
  const wp = new THREE.Vector3(), cp = new THREE.Vector3(), m = new THREE.Matrix4(), sc = new THREE.Vector3();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const parent = mesh.parent; if (!parent) return;
    parent.updateWorldMatrix(true, false);
    wp.setFromMatrixPosition(parent.matrixWorld); cp.setFromMatrixPosition(camera.matrixWorld);
    const d = Math.hypot(wp.x - cp.x, wp.z - cp.z);
    const fog = scene.fog, f = fog?.isFog ? THREE.MathUtils.smoothstep(d, fog.near, fog.far) : 0;
    mat.uniforms.uFar.value = U.uLed.value * f * (1 - 0.45 * THREE.MathUtils.smoothstep(d, 3000, 16000));
    const MAXD = Math.min(4000, camera.far * 0.8), dd = wp.distanceTo(cp);
    m.copy(parent.matrixWorld);
    if (dd > MAXD) { const s = MAXD / dd; sc.setScalar(s); const np = cp.clone().lerp(wp, s); m.scale(sc); m.setPosition(np); }
    mesh.matrixWorld.copy(m);
  };
  mesh.matrixAutoUpdate = false;
  return mesh;
}
