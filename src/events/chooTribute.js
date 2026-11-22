// [choo-tribute] 추성훈 선수 은퇴 헌정 드론쇼. 밤하늘에만 뜸.
//   "추성훈 선수, 그동안 수고하셨습니다" 글자 + 글러브 실루엣을 LED 점(Points 1)으로 그리고,
//   가끔 작은 불꽃(Points 1)이 옆에서 터진다. 드로우 최대 2.
//   얼굴·사진·블랙컴뱃 로고는 쓰지 않는다.
//   표시: TRIBUTE_ENABLED 이고 2026-11-30 23:59:59 KST 까지. ?tribute=1 강제, ?tribute=0 숨김.
//   낮에는 숨기고, 해 질 녘/아침에 evening.js 페이드를 따라 켜지고 꺼진다.
import * as THREE from 'three';
import { createNightFade } from '../world/nightLights.js';
import { unpackTributeDots, TRIBUTE_DOT_COUNT } from './chooTributeDots.js';

export const TRIBUTE_ENABLED = true;
export const TRIBUTE_UNTIL_MS = Date.parse('2026-11-30T23:59:59+09:00');

const DIST = 420;     // 카메라 전방 수평 거리(m)
const HEIGHT = 420;   // 카메라보다 위로(m) ≈ 41°, 고층 빌딩 위 하늘
const BOB = 3.6;
const FW_N = 180;
const FW_LIFE = 2.4;

function tributeParam() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('tribute');
  if (q == null || q === '') return null;
  if (q === '0' || q === 'off' || q === 'no') return false;
  if (q === '1' || q === 'on' || q === 'yes') return true;
  return null;
}

/** 날짜·플래그·URL 만 본다. 밤낮 여부는 호출 쪽에서 페이드로 처리. */
export function tributeWanted(now = Date.now()) {
  const p = tributeParam();
  if (p === false) return false;
  if (p === true) return true;
  return TRIBUTE_ENABLED && now <= TRIBUTE_UNTIL_MS;
}

function hash01(i, salt = 0) {
  let n = (i + 1) * 374761393 + salt * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,245,1)');
  g.addColorStop(0.16, 'rgba(255,230,160,0.9)');
  g.addColorStop(0.4, 'rgba(255,180,80,0.22)');
  g.addColorStop(0.7, 'rgba(255,150,50,0.05)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const VS = /* glsl */ `
  attribute float aPhase;
  attribute float aAlpha;
  uniform float uTime, uNight, uSize, uScale;
  varying vec3 vC;
  varying float vA;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    float tw = 0.74 + 0.26 * sin(uTime * 2.3 + aPhase);
    vA = aAlpha * uNight * tw;
    vC = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vA > 0.01 ? clamp(uSize * uScale / max(-mv.z, 1.0), 1.4, 36.0) : 0.0;
    #include <logdepthbuf_vertex>
  }
`;

const FS = /* glsl */ `
  uniform sampler2D uGlow;
  varying vec3 vC;
  varying float vA;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec4 s = texture2D(uGlow, gl_PointCoord);
    float g = s.a * s.r;
    if (g < 0.01 || vA < 0.01) discard;
    gl_FragColor = vec4(vC * (g * vA * 1.15), 1.0);
  }
`;

function makeMat(tex, size) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uSize: { value: size },
      uScale: { value: 720 },
      uGlow: { value: tex },
    },
    vertexShader: VS,
    fragmentShader: FS,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
}

function makeFormation(tex) {
  const { x, y, kind, n } = unpackTributeDots();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const alpha = new Float32Array(n);
  const TEXT = [1.0, 0.88, 0.55];
  const GLOVE = [1.0, 0.64, 0.26];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x[i];
    pos[i * 3 + 1] = y[i];
    pos[i * 3 + 2] = (hash01(i, 3) - 0.5) * 2.4;
    const c = kind[i] ? GLOVE : TEXT;
    const jig = 0.92 + hash01(i, 9) * 0.16;
    col[i * 3] = c[0] * jig;
    col[i * 3 + 1] = c[1] * jig;
    col[i * 3 + 2] = c[2] * jig;
    phase[i] = hash01(i, 1) * Math.PI * 2;
    alpha[i] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = makeMat(tex, 6.5);
  const pts = new THREE.Points(geo, mat);
  pts.name = 'choo-tribute-drones';
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  pts.matrixAutoUpdate = true;
  return { pts, mat, n };
}

function makeFireworks(tex) {
  const pos = new Float32Array(FW_N * 3);
  const col = new Float32Array(FW_N * 3);
  const phase = new Float32Array(FW_N);
  const alpha = new Float32Array(FW_N);
  const vel = new Float32Array(FW_N * 3);
  const age = new Float32Array(FW_N);
  const life = new Float32Array(FW_N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = makeMat(tex, 14);
  const pts = new THREE.Points(geo, mat);
  pts.name = 'choo-tribute-sparks';
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.visible = false;
  let live = 0;
  function burst() {
    // 글러브 위·글자 사이 쪽에서 작게 터짐
    const cx = -40 + (Math.random() - 0.5) * 90;
    const cy = 18 + (Math.random() - 0.5) * 28;
    const cz = (Math.random() - 0.5) * 6;
    const pal = [[1, 0.85, 0.45], [1, 0.7, 0.25], [1, 0.95, 0.8], [1, 0.55, 0.2]];
    const c = pal[(Math.random() * pal.length) | 0];
    const c2 = pal[(Math.random() * pal.length) | 0];
    const sp = 22 + Math.random() * 16;
    for (let i = 0; i < FW_N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - u * u));
      const v = sp * (0.7 + Math.random() * 0.4);
      pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz;
      vel[i * 3] = Math.cos(a) * s * v;
      vel[i * 3 + 1] = u * v * 0.85 + 4;
      vel[i * 3 + 2] = Math.sin(a) * s * v;
      const cc = i % 3 ? c : c2;
      col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2];
      age[i] = 0;
      life[i] = FW_LIFE * (0.7 + Math.random() * 0.4);
      alpha[i] = 1;
      phase[i] = Math.random() * 6.3;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    pts.visible = true;
    live = FW_N;
  }
  function update(dt) {
    if (live <= 0) { pts.visible = false; return; }
    live = 0;
    const drag = Math.pow(0.42, dt);
    for (let i = 0; i < FW_N; i++) {
      if (alpha[i] <= 0) continue;
      age[i] += dt;
      const f = age[i] / life[i];
      if (f >= 1) { alpha[i] = 0; continue; }
      live++;
      vel[i * 3] *= drag;
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag - 10 * dt;
      vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      alpha[i] = (1 - f) * (f < 0.55 ? 1 : 0.55 + 0.45 * Math.sin(age[i] * 28));
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    pts.visible = live > 0;
  }
  return { pts, mat, burst, update, get live() { return live; } };
}

/**
 * @param {{ scene: THREE.Scene }} opts
 * @returns {{ update: Function, dispose: Function, burst: Function, stats: Function, group: THREE.Group }}
 */
export function createChooTribute({ scene }) {
  const group = new THREE.Group();
  group.name = 'choo-tribute';
  group.visible = false;
  group.frustumCulled = false;

  const tex = glowTexture();
  const form = makeFormation(tex);
  const fw = makeFireworks(tex);
  group.add(form.pts);
  group.add(fw.pts);
  scene.add(group);

  const fade = createNightFade({ seconds: 5.5 });
  const fwd = new THREE.Vector3();
  const smooth = new THREE.Vector3(0, 0, 1);
  const look = new THREE.Vector3();
  let inited = false;
  let time = 0;
  let nextBurst = 40 + Math.random() * 20; // 첫 불꽃은 40~60초 뒤, 스크린샷은 글자가 먼저
  let allowed = tributeWanted();

  let ticks = 0;
  function place(camera, dt) {
    ticks++;
    camera.updateMatrixWorld?.();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
    else fwd.normalize();
    // 크게 돌아서면 바로 따라가고, 조금만 돌면 부드럽게 (하늘 글자가 카메라 뒤로 남는 일 방지)
    const ang = inited ? smooth.angleTo(fwd) : 10;
    if (!inited || ang > 0.4) smooth.copy(fwd);
    else {
      const k = 1 - Math.exp(-Math.max(dt, 0) * 2.8);
      smooth.lerp(fwd, k);
      if (smooth.lengthSq() < 1e-8) smooth.copy(fwd);
      else smooth.normalize();
    }
    inited = true;
    const bob = Math.sin(time * 0.62) * BOB;
    group.position.set(
      camera.position.x + smooth.x * DIST,
      camera.position.y + HEIGHT + bob,
      camera.position.z + smooth.z * DIST,
    );
    look.set(camera.position.x, group.position.y, camera.position.z);
    group.lookAt(look);
  }

  function update(dt, camera, mode) {
    allowed = tributeWanted();
    fade.update(dt);
    time += dt;
    const night = fade.value;
    const show = allowed && night > 0.01 && mode !== 'overview' && camera;
    if (!show) {
      group.visible = false;
      fw.pts.visible = false;
      return;
    }
    group.visible = true;
    form.mat.uniforms.uNight.value = night;
    form.mat.uniforms.uTime.value = time;
    fw.mat.uniforms.uNight.value = night;
    fw.mat.uniforms.uTime.value = time;
    place(camera, dt);
    if (night > 0.6) {
      nextBurst -= dt;
      if (nextBurst <= 0) {
        fw.burst();
        nextBurst = 32 + Math.random() * 28; // 32~60초
      }
    }
    fw.update(dt);
  }

  function dispose() {
    scene.remove(group);
    form.pts.geometry.dispose();
    form.mat.dispose();
    fw.pts.geometry.dispose();
    fw.mat.dispose();
    tex.dispose();
    fade.dispose();
  }

  function stats() {
    return {
      allowed,
      visible: group.visible,
      night: fade.value,
      dots: TRIBUTE_DOT_COUNT,
      sparks: fw.live,
      draws: group.visible ? (fw.pts.visible ? 2 : 1) : 0,
      until: TRIBUTE_UNTIL_MS,
      pos: group.position.toArray(),
      fwd: smooth.toArray(),
      ticks,
    };
  }

  return { update, dispose, burst: () => fw.burst(), stats, group, wanted: tributeWanted };
}
