// [bungeo] 정자역 광장 우체통 앞 보도의 붕어빵 포장마차 (추운 달에만)
//   위치: 광장 공원 동쪽 끝(x≈-51.5)과 성남대로 자전거길(x≈-40.3) 사이 넓은 보도. 우체통(-54.2, 38.5) 남동쪽.
//         광장 E-W 산책로(z≈42.8)·계단(z 11.5~23)·자전거길·가로등(x≈-35)·횡단보도(성남대로 z≈43.7)는 비켜 선다.
//   그리기(가까이 있을 때): 포장마차 1 (꼭짓점 색 + 밤 발광 속성을 하나로 합친 메시) · 간판 1 · 김 1 · 바닥 불빛 웅덩이 1(저녁만)
//         + 손님/사장님 아바타는 entities/avatarCrowd.js 인스턴싱(부품 종류 수 ≈ 11). 실제 광원 없음. 카메라 140 m 밖·전체 지도에선 숨김.
//   밤: world/nightLights.js createNightFade (가로등·건물 불빛과 같은 저녁 판정·4초 페이드) → 천막 속 주황 불빛·백열전구·간판·바닥 웅덩이.
//   줄: world/bungeoQueue.js (최대 10명, 3~7초 대기, 랜덤 도착). 시즌: 서울 날짜 11~3월. ?bungeo=0 끔 · ?bungeo=1 강제로 켬.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { buildCrowd } from '../entities/avatarCrowd.js';
import { Bubble } from '../overlay.js';
import { tr, onLangChange } from '../i18n.js';
import { createNightFade, lightPoolMaterial } from './nightLights.js';
import { createBungeoQueue, bungeoActive, bungeoMode, BUNGEO_MAX } from './bungeoQueue.js';

// ---------- 배치 (정자 로컬 좌표, m) ----------
export const BUNGEO_STALL = { x: -49.6, z: 36.0, yaw: Math.PI / 2 }; // 로컬 +z(손님 쪽) → 월드 +x(보도 쪽)
const SLOT0 = { x: -48.35, z: 36.0 };           // 계산대 앞
const LINE_X = -47.95, LINE_Z0 = 34.6, GAP = 0.85; // 1번 자리부터 남쪽(-z)으로
const LANE_X = -45.8;                            // 오가는 손님 통로(줄에서 2 m 떨어진 보도 가운데)
const SPAWNS = [
  [{ x: -45.6, z: 6.0 }],                                  // 남쪽 보도에서
  [{ x: -45.6, z: 62.0 }, { x: LANE_X, z: 44.0 }],          // 북쪽 보도에서
  [{ x: -66.0, z: 42.9 }, { x: -46.4, z: 42.9 }],           // 광장 산책로(서쪽)에서
];
const EXITS = [
  [{ x: LANE_X, z: 35.6 }, { x: LANE_X, z: 8.0 }],
  [{ x: LANE_X, z: 37.6 }, { x: LANE_X, z: 60.0 }],
  [{ x: LANE_X, z: 37.6 }, { x: -46.4, z: 42.9 }, { x: -68.0, z: 42.9 }],
];
const VIS_R = 140;      // 카메라가 이보다 멀면 숨기고 멈춤
const TALK_R = 4.2;     // 사장님 말풍선 거리
const POOL = BUNGEO_MAX + 4; // 줄 10 + 떠나는 손님 몇 명
const RECHECK = 300;    // 계절 다시 보기(초)

export function bungeoSlot(i) {
  if (i <= 0) return { x: SLOT0.x, z: SLOT0.z, yaw: -Math.PI / 2 };
  return { x: LINE_X, z: LINE_Z0 - GAP * (i - 1), yaw: 0.12 };
}

// ---------- 포장마차 지오메트리 ----------
const tmpC = new THREE.Color();
function part(g, color, glow = 0) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  tmpC.set(color);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), e = new Float32Array(n).fill(glow);
  for (let i = 0; i < n; i++) { c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(e, 1));
  return g;
}
const box = (w, h, d, x, y, z, color, glow = 0, rx = 0, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  return part(g.translate(x, y, z), color, glow);
};
const cyl = (r0, r1, h, seg, x, y, z, color, glow = 0, rz = 0, rx = 0) => {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  return part(g.translate(x, y, z), color, glow);
};
function fish(x, y, z, ry, color, glow = 0.08, s = 1) {
  const body = new THREE.SphereGeometry(1, 7, 5).scale(0.085 * s, 0.028 * s, 0.05 * s).rotateY(ry).translate(x, y, z);
  const tail = new THREE.ConeGeometry(0.04 * s, 0.07 * s, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.35).translate(-0.1 * s, 0, 0).rotateY(ry).translate(x, y, z);
  return [part(body, color, glow), part(tail, color, glow)];
}

export function buildStallGeometry() {
  const P = [];
  const TARP = '#f76707', TARP_D = '#e8590c', RED = '#c92a2a', STEEL = '#ced4da', STEEL_D = '#868e96', IRON = '#2b2f33', GOLD = '#d9902b', GOLD_D = '#b86b1a', KRAFT = '#c8a165';
  // 수레: 몸통 · 상판 · 바퀴 · 가스통
  P.push(box(2.2, 0.78, 1.0, 0, 0.5, 0, STEEL, 0.18));
  P.push(box(2.1, 0.5, 0.02, 0, 0.55, 0.51, '#e9ecef', 0.32)); // 앞판(밝은 면, 밤에 불빛 받음)
  P.push(box(2.32, 0.05, 1.12, 0, 0.92, 0, STEEL_D));
  for (const x of [-0.75, 0.75]) for (const z of [-0.53, 0.53]) P.push(cyl(0.17, 0.17, 0.06, 10, x, 0.17, z, '#343a40', 0, 0, Math.PI / 2));
  P.push(cyl(0.14, 0.14, 0.42, 8, 0.75, 0.21, -0.75, '#1971c2'));
  // 붕어빵 틀(무쇠 판) + 구워지는 붕어빵 2줄 × 4
  P.push(box(1.05, 0.12, 0.62, -0.45, 1.0, -0.05, IRON, 0.05));
  P.push(box(1.08, 0.03, 0.66, -0.45, 1.075, -0.05, '#495057'));
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = -0.82 + c * 0.25, z = -0.2 + r * 0.3;
    P.push(box(0.21, 0.012, 0.12, x, 1.093, z, '#16181a'));
    P.push(...fish(x, 1.11, z, 0, (r + c) % 3 ? GOLD : GOLD_D, 0.12));
  }
  // 손잡이(틀 뒤집는 막대)
  P.push(box(0.03, 0.03, 0.34, -0.95, 1.14, 0.38, '#212529'));
  // 진열판 + 쌓인 붕어빵 + 종이봉투
  P.push(box(0.85, 0.05, 0.55, 0.55, 0.98, 0.02, '#adb5bd', 0.3));
  const pile = [[0.32, 0.1, 0.3], [0.5, 0.12, -0.3], [0.68, 0.06, 0.2], [0.42, -0.1, 1.1], [0.6, -0.12, -0.9], [0.78, -0.06, 0.1], [0.5, 0.0, 0.9], [0.66, 0.08, -1.2]];
  pile.forEach(([x, z, ry], i) => P.push(...fish(x, 1.03 + (i > 5 ? 0.03 : 0), z, ry, i % 2 ? GOLD : GOLD_D, 0.15, 1.1)));
  for (let i = 0; i < 3; i++) P.push(box(0.16, 0.2, 0.09, 0.98 - i * 0.04, 1.05 + i * 0.002, 0.36 - i * 0.1, KRAFT, 0.1, 0, 0.2 * i));
  // 천막: 기둥 4 · 경사 지붕 2장 · 뒤/옆 가림막 · 앞 말아 올린 천 · 빨간 띠
  for (const x of [-1.45, 1.45]) for (const z of [-1.05, 1.05]) P.push(box(0.06, 2.3, 0.06, x, 1.15, z, '#495057'));
  for (const s of [-1, 1]) P.push(box(3.15, 0.05, 1.32, 0, 2.47, s * 0.6, s > 0 ? TARP : TARP_D, 0.55, s * 0.3));
  P.push(box(3.0, 1.7, 0.04, 0, 1.4, -1.08, TARP_D, 0.6));
  for (const x of [-1.47, 1.47]) P.push(box(0.04, 1.75, 1.0, x, 1.37, -0.56, TARP, 0.6));
  P.push(cyl(0.09, 0.09, 3.1, 8, 0, 2.2, 1.1, TARP_D, 0.35, Math.PI / 2));
  P.push(box(3.12, 0.16, 0.03, 0, 2.05, 1.12, RED, 0.45));
  P.push(box(3.12, 0.16, 0.03, 0, 2.05, -1.12, RED, 0.45));
  // 간판 받침(지붕 꼭대기 위 얇은 상자 · 간판 테두리)
  P.push(box(0.05, 0.2, 0.05, -0.4, 2.72, 0, '#495057'), box(0.05, 0.2, 0.05, 0.4, 2.72, 0, '#495057'));
  P.push(box(1.1, 0.45, 0.06, 0, 2.98, 0, '#c92a2a', 0.5));
  // 백열전구 2개(밤에 가장 밝음) + 전선
  for (const x of [-0.55, 0.55]) {
    P.push(box(0.012, 0.4, 0.012, x, 2.32, 0.15, '#212529'));
    P.push(part(new THREE.SphereGeometry(0.085, 8, 6).translate(x, 2.07, 0.15), '#fff0b8', 1.0));
  }
  const g = mergeGeometries(P, false);
  P.forEach((p) => p.dispose());
  return g;
}

/** 꼭짓점 색 Lambert + 'glow' 속성 × uNight 만큼 자기 발광(천막 안 불빛). 셰이더 청크만 덧붙임 */
export function stallMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uNight = { value: 0 };
  m.userData.uNight = uNight;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uNight * 1.25 + vec3(1.0, 0.55, 0.18) * vGlow * vGlow * uNight * 0.55;');
  };
  m.customProgramCacheKey = () => 'bungeoStall';
  return m;
}

function signTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff4e0'; ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#c92a2a'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, 244, 84);
  ctx.fillStyle = '#c92a2a';
  ctx.font = '900 58px "Pretendard", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('붕어빵', 128, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function steamTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const ctx = cv.getContext('2d');
  const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

// ---------- 사람 ----------
const COATS = ['#2f3e46', '#7b2d26', '#3d405b', '#5c4033', '#1d3557', '#6d597a', '#264653', '#8d6e63', '#495057', '#9c6644', '#283618', '#b5838d'];
const PANTS = ['#2d3436', '#3b4252', '#212529', '#4a4e69', '#343a40'];
const SKINS = ['#f2d0b0', '#f6d7c3', '#e8c4a8', '#d7a888', '#c4926e'];
const HATS = ['#c92a2a', '#2b2d42', '#e9c46a', '#495057'];
// 부품 종류를 줄이려고(인스턴싱 draw call) 둥근 얼굴 · 긴 소매 · 짧은/긴/묶은 머리만. 털모자는 사장님 모자와 같은 부품.
function customerLook(r) {
  const pick = (a) => a[Math.floor(r() * a.length)], f = r() < 0.5;
  const look = { color: pick(COATS), pants: pick(PANTS), skin: pick(SKINS), gender: f ? 'f' : 'm', face: 'round', top: 'long', hair: f ? pick(['long', 'pony', 'short']) : 'short' };
  if (r() < 0.3) look.bag = pick(['#2d3436', '#8e6e53', '#636e72']);
  if (r() < 0.3) look.hat = pick(HATS);
  if (r() < 0.12) look.scale = 0.82; // 아이
  return look;
}
const PAPER_BAG = new THREE.BoxGeometry(0.17, 0.22, 0.09);
const PAPER_MAT = new THREE.MeshLambertMaterial({ color: '#c8a165' });
function addPaperBag(av) {
  const bag = new THREE.Mesh(PAPER_BAG, PAPER_MAT);
  bag.position.set(0.0, -0.72, 0.1);
  bag.visible = false;
  av.userData.armR.add(bag);
  av.userData.paperBag = bag;
  return bag;
}

const OWNER_LINES = [
  ['따끈따끈해요~ 🐟', 'Nice and warm~ 🐟'],
  ['팥이랑 슈크림 있어요!', 'Red bean or custard!'],
  ['갓 구운 거 드릴게요~', 'Fresh off the griddle for you~'],
  ['줄 서 주시면 금방 나와요!', 'Line up — it’s almost ready!'],
  ['추운데 하나 드시고 가요~', 'Cold out! Grab a warm one~'],
];

function stepToward(o, tx, tz, speed, dt) {
  const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  const s = Math.min(d, speed * dt);
  o.x += (dx / d) * s; o.z += (dz / d) * s;
  o.wantYaw = Math.atan2(dx, dz);
  return d - s;
}
const turn = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export function mountBungeoStall({ scene, overlay = null, terrain = null, params = null, rng = Math.random, now = () => new Date() } = {}) {
  const flag = params?.get?.('bungeo') ?? null;
  if (bungeoMode(flag) === 'off') return null;
  let built = null, acc = RECHECK, disposed = false;
  const gy = (x, z) => (terrain ? terrain.getGroundHeight(x, z, 0) : 0);

  function build() {
    const root = new THREE.Group(); root.name = 'bungeoStall';
    scene.add(root);
    const S = BUNGEO_STALL, y0 = gy(S.x, S.z);
    // 포장마차 본체 (1 draw + 그림자)
    const mat = stallMaterial();
    const stall = new THREE.Mesh(buildStallGeometry(), mat);
    stall.castShadow = true; stall.receiveShadow = true;
    stall.position.set(S.x, y0, S.z); stall.rotation.y = S.yaw;
    root.add(stall);
    // 간판: 지붕 위 앞·뒤 두 면 (한 메시, 1 draw). 받침대는 본체 지오메트리에 있음
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(), color: '#d9d9d9' });
    const front = new THREE.PlaneGeometry(1.05, 0.4).translate(0, 2.98, 0.04);
    const back = new THREE.PlaneGeometry(1.05, 0.4).rotateY(Math.PI).translate(0, 2.98, -0.04);
    const signGeo = mergeGeometries([front, back]); front.dispose(); back.dispose();
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.copy(stall.position); sign.rotation.y = S.yaw;
    root.add(sign);
    // 바닥 불빛 웅덩이 (저녁에만 보임)
    const poolMat = lightPoolMaterial({ color: '#ffb066', intensity: 1.05, radius: 1, radiusZ: 1 });
    const poolGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    poolGeo.deleteAttribute('uv'); poolGeo.deleteAttribute('normal');
    const pool = new THREE.InstancedMesh(poolGeo, poolMat, 1);
    pool.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(S.x + 0.6, y0 + 0.04, S.z - 1.2), new THREE.Quaternion(), new THREE.Vector3(4.2, 1, 5.6)));
    pool.frustumCulled = false; pool.visible = false; pool.renderOrder = 1;
    root.add(pool);
    // 김 (점 12개, 1 draw)
    const NSTEAM = 12;
    const steamPos = new Float32Array(NSTEAM * 3), steamCol = new Float32Array(NSTEAM * 4);
    const steamGeo = new THREE.BufferGeometry();
    steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
    steamGeo.setAttribute('color', new THREE.BufferAttribute(steamCol, 4));
    const steamMat = new THREE.PointsMaterial({ size: 0.42, map: steamTexture(), transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true });
    const steam = new THREE.Points(steamGeo, steamMat);
    steam.frustumCulled = false;
    steam.position.copy(stall.position); steam.rotation.y = S.yaw;
    root.add(steam);
    const puffs = Array.from({ length: NSTEAM }, (_, i) => ({ t: i / NSTEAM, x: -0.85 + rng() * 0.8, z: -0.3 + rng() * 0.5, w: rng() * 6 }));

    // 백열전구 번짐(밤에만, 가산 혼합 점 3개 · 1 draw): 전구 2개 + 천막 안 은은한 불빛
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.55, 2.07, 0.15, 0.55, 2.07, 0.15, 0, 1.55, 0.1], 3));
    haloGeo.setAttribute('hsize', new THREE.Float32BufferAttribute([1, 1, 2.6], 1));
    const haloMat = new THREE.PointsMaterial({ size: 0.95, map: steamMat.map, color: '#ffb35c', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    haloMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float hsize;')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * hsize;');
    };
    haloMat.customProgramCacheKey = () => 'bungeoHalo';
    const halo = new THREE.Points(haloGeo, haloMat);
    halo.frustumCulled = false; halo.visible = false; halo.renderOrder = 2;
    halo.position.copy(stall.position); halo.rotation.y = S.yaw;
    root.add(halo);

    // 사람: 사장님 + 손님 풀(인스턴싱)
    // 그림자는 큰 부품(몸통·다리)만 — 그림자 패스 draw call 을 줄임
    const crowd = buildCrowd(root, { name: 'bungeoCrowd', cast: (P) => P.geo.boundingSphere.radius > 0.3 });
    const owner = createAvatar({ color: '#f1f3f5', pants: '#343a40', skin: '#e8c4a8', gender: 'm', face: 'round', hair: 'short', top: 'long', hat: '#c92a2a' });
    const ownerBag = addPaperBag(owner);
    const ownerParts = crowd.register(owner);
    const ownerPos = { x: S.x - 0.75, z: S.z, yaw: Math.PI / 2 };
    owner.position.set(ownerPos.x, y0, ownerPos.z); owner.rotation.y = ownerPos.yaw;
    const people = [];
    for (let i = 0; i < POOL; i++) {
      const av = createAvatar(customerLook(rng));
      addPaperBag(av);
      people.push({ av, parts: crowd.register(av), qid: 0, mode: 'free', path: [], x: 0, z: 0, yaw: 0, wantYaw: 0, speed: 1.2, jx: 0, jy: 0, v: 0 });
    }
    crowd.finalize();

    const queue = createBungeoQueue({ rng });
    const byQid = new Map();
    const take = () => people.find((p) => p.mode === 'free') || null;
    const place = (p, x, z, yaw) => { p.x = x; p.z = z; p.yaw = p.wantYaw = yaw; };
    function seat(m, arrived) {
      const p = take(); if (!p) return null;
      p.qid = m.id; p.mode = 'queue'; p.path = []; p.speed = 1.05 + rng() * 0.35;
      p.jx = (rng() - 0.5) * 0.22; p.jy = (rng() - 0.5) * 0.5; p.av.userData.paperBag.visible = false;
      byQid.set(m.id, p);
      if (arrived) { const s = bungeoSlot(queue.slotOf(m.id)); place(p, s.x + (queue.slotOf(m.id) ? p.jx : 0), s.z, s.yaw + p.jy * 0.4); }
      else {
        const route = SPAWNS[Math.floor(rng() * SPAWNS.length)];
        place(p, route[0].x, route[0].z, 0);
        p.path = route.slice(1).map((q) => ({ ...q }));
        // 통로로 와서 줄 끝 옆에서 꺾어 들어온다
        p.path.push({ x: LANE_X, z: bungeoSlot(queue.slotOf(m.id)).z });
      }
      return p;
    }
    for (const m of queue.prefill()) seat(m, true);

    // 라벨 · 사장님 말풍선
    let label = null, bubble = null, offLang = null, talkCd = 1.2, lineI = Math.floor(rng() * OWNER_LINES.length);
    const ownerHead = new THREE.Vector3(ownerPos.x, y0 + 2.15, ownerPos.z);
    if (overlay) {
      const labelText = () => tr('🐟 붕어빵 포장마차', '🐟 Bungeoppang stall');
      label = overlay.add({ cls: 'label shop', text: labelText(), getPos: () => new THREE.Vector3(S.x, y0 + 3.75, S.z), maxDist: 95, minDist: 0 });
      bubble = new Bubble(overlay, 'npc', () => ownerHead, { getName: () => tr('붕어빵 사장님', 'Bungeoppang owner'), color: '#e8590c' });
      offLang = onLangChange(() => { label.el.textContent = labelText(); });
    }

    const night = createNightFade();
    const ownerAnim = { flip: 0, hand: 0, cd: 1.5 };
    let shown = true, t = 0;
    const stats = { visible: true, queue: 0, coming: 0, leaving: 0, served: 0, night: 0 };

    function setShown(v) {
      if (v === shown) return;
      shown = v; root.visible = v;
      if (label) label.hidden = !v;
    }

    function updatePeople(dt) {
      const events = queue.update(dt);
      for (const e of events) {
        if (e.type === 'join') seat(queue.members.find((m) => m.id === e.id), false);
        else if (e.type === 'hand') { ownerAnim.hand = 0.9; ownerBag.visible = true; }
        else if (e.type === 'served') {
          const p = byQid.get(e.id); byQid.delete(e.id);
          ownerBag.visible = false;
          if (p) {
            p.mode = 'leaving'; p.av.userData.paperBag.visible = true;
            p.path = EXITS[Math.floor(rng() * EXITS.length)].map((q) => ({ ...q }));
            p.linger = 0.35;
          }
        }
      }
      // 줄 자리 → 걷기 목표
      for (const p of people) {
        if (p.mode === 'free') continue;
        let moving = 0;
        if (p.mode === 'queue') {
          const i = queue.slotOf(p.qid);
          const s = bungeoSlot(i);
          const tx = s.x + (i ? p.jx : 0), tz = s.z;
          if (p.path.length) {
            const w = p.path[0];
            if (p.path.length === 1) w.z = tz; // 오는 동안 줄이 줄면 꺾는 지점도 따라 당김
            if (stepToward(p, w.x, w.z, p.speed, dt) < 0.05) p.path.shift();
            moving = p.speed;
          } else {
            const left = stepToward(p, tx, tz, p.speed * 0.8, dt);
            if (left > 0.03) moving = p.speed * 0.8;
            else { p.wantYaw = s.yaw + p.jy * 0.4; const m = queue.members[i]; if (m && !m.arrived) queue.arrive(p.qid); }
          }
        } else if (p.mode === 'leaving') {
          if (p.linger > 0) { p.linger -= dt; p.wantYaw = Math.PI / 2; }
          else if (p.path.length) {
            if (stepToward(p, p.path[0].x, p.path[0].z, p.speed, dt) < 0.05) p.path.shift();
            moving = p.speed;
          } else { p.mode = 'free'; p.av.userData.paperBag.visible = false; continue; }
        }
        p.yaw = turn(p.yaw, p.wantYaw, Math.min(1, dt * (moving ? 8 : 4)));
        p.v = moving;
      }
    }

    function animateOwner(dt) {
      const u = owner.userData;
      animateAvatar(owner, 0, dt);
      ownerAnim.cd -= dt;
      if (ownerAnim.cd <= 0 && ownerAnim.flip <= 0) { ownerAnim.flip = 1.6; ownerAnim.cd = 2.5 + rng() * 3; }
      if (ownerAnim.hand > 0) {
        ownerAnim.hand -= dt;
        u.armR.rotation.x = -1.35; u.armL.rotation.x = -1.2;
        u.rig.rotation.x = 0.08;
      } else if (ownerAnim.flip > 0) {
        ownerAnim.flip -= dt;
        // 붕어빵 틀 뒤집기: 오른팔을 들었다 탁 내림
        const k = Math.sin((1.6 - ownerAnim.flip) * 7.5);
        u.armR.rotation.x = -0.95 + k * 0.45; u.armR.rotation.z = (u.armRz ?? 0) + 0.25;
        u.armL.rotation.x = -0.75;
        u.head.rotation.x = 0.25;
      } else {
        u.armR.rotation.x = -0.7; u.armL.rotation.x = -0.6; u.head.rotation.x = 0.15;
      }
    }

    function updateSteam(dt) {
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        p.t += dt * 0.42;
        if (p.t >= 1) { p.t -= 1; p.x = -0.85 + rng() * 0.8; p.z = -0.3 + rng() * 0.5; }
        const k = p.t;
        steamPos[i * 3] = p.x + Math.sin(t * 1.3 + p.w) * 0.08 * k;
        steamPos[i * 3 + 1] = 1.15 + k * 0.95;
        steamPos[i * 3 + 2] = p.z + k * 0.12;
        const a = Math.sin(Math.PI * k) * 0.55;
        steamCol[i * 4] = steamCol[i * 4 + 1] = steamCol[i * 4 + 2] = 1; steamCol[i * 4 + 3] = a;
      }
      steamGeo.attributes.position.needsUpdate = true;
      steamGeo.attributes.color.needsUpdate = true;
    }

    function update(dt, playerPos, camera, mode) {
      t += dt;
      const nv = night.update(dt);
      const camD = camera ? Math.hypot(camera.position.x - S.x, camera.position.z - S.z) : 0;
      setShown(mode !== 'overview' && camD < VIS_R);
      if (!shown) return;
      dt = Math.min(dt, 0.1);
      // 밤 불빛
      mat.userData.uNight.value = nv;
      poolMat.uniforms.uNight.value = nv;
      pool.visible = halo.visible = nv > 0.01;
      haloMat.opacity = nv * (0.85 + Math.sin(t * 9.0) * 0.04 + Math.sin(t * 2.3) * 0.05); // 전구 살짝 일렁임
      signMat.color.setScalar(0.85 + nv * 0.55);
      steamMat.opacity = 0.8 + nv * 0.2;
      updatePeople(dt);
      updateSteam(dt);
      animateOwner(dt);
      // 인스턴싱에 쓰기
      crowd.begin();
      const far = camD > 55;
      crowd.add(owner, ownerParts, far);
      let coming = 0, leaving = 0;
      for (const p of people) {
        if (p.mode === 'free') continue;
        if (p.mode === 'leaving') leaving++; else if (p.path.length) coming++;
        p.av.position.set(p.x, gy(p.x, p.z), p.z);
        p.av.rotation.y = p.yaw;
        animateAvatar(p.av, p.v, dt);
        const u = p.av.userData;
        if (u.paperBag.visible) { u.armR.rotation.x = -0.55; } // 봉투 든 손
        else if (!p.v && p.mode === 'queue') { u.armL.rotation.x = -0.15; u.armR.rotation.x = -0.15; } // 주머니 손
        crowd.add(p.av, p.parts, far);
      }
      crowd.end();
      // 사장님 말풍선 (가까이 오면 가끔)
      if (bubble) {
        bubble.tick();
        talkCd -= dt;
        if (playerPos && talkCd <= 0 && Math.hypot(playerPos.x - ownerPos.x, playerPos.z - ownerPos.z) < TALK_R) {
          const [ko, en] = OWNER_LINES[lineI++ % OWNER_LINES.length];
          bubble.say(tr(ko, en), 3800);
          talkCd = 9 + rng() * 5;
        }
      }
      stats.queue = queue.length; stats.coming = coming; stats.leaving = leaving; stats.served = queue.stats.served; stats.night = +nv.toFixed(2);
    }

    function dispose() {
      scene.remove(root);
      // 아바타 부품 지오메트리는 avatar.js 공용이라 버리지 않는다. 여기서 만든 것만 해제
      stall.geometry.dispose(); signGeo.dispose(); poolGeo.dispose(); steamGeo.dispose(); haloGeo.dispose(); haloMat.dispose();
      mat.dispose(); signMat.map?.dispose(); signMat.dispose(); poolMat.dispose(); steamMat.map?.dispose(); steamMat.dispose();
      for (const P of crowd.parts.values()) { P.im?.dispose?.(); if (P.lam) P.im?.material?.dispose?.(); }
      if (label) overlay.remove(label);
      if (bubble) overlay.remove(bubble.item);
      offLang?.(); night.dispose();
    }

    // 충돌: 수레 + 천막 기둥 사각형(월드 x·z)
    const hx = 1.15, hz = 1.55; // 천막 깊이(로컬 z)·폭(로컬 x) 절반 → 월드 x·z
    const blocks = (x, z) => Math.abs(x - S.x) < hx && Math.abs(z - S.z) < hz;

    return { root, queue, people, owner, bubble, update, dispose, blocks, stats, get shown() { return shown; } };
  }

  function wanted() { return bungeoActive(flag, now()); }

  const api = {
    get active() { return !!built; },
    get stats() { return built ? { ...built.stats, active: true, members: built.queue.length, targetLen: built.queue.targetLen } : { active: false }; },
    get debug() { return built; },
    blocks(x, z) { return !!built && built.blocks(x, z); },
    update(dt, playerPos, camera, mode) {
      if (disposed) return;
      acc += dt;
      if (acc >= RECHECK) {
        acc = 0;
        const want = wanted();
        if (want && !built) built = build();
        else if (!want && built) { built.dispose(); built = null; }
      }
      built?.update(dt, playerPos, camera, mode);
    },
    dispose() { disposed = true; built?.dispose(); built = null; },
  };
  return api;
}
