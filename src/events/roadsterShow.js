// [roadster] 'Roadster Jump Show' — 2026-10-15 로드스터 공개 시연(SpaceX McGregor, TX) 오마주 이벤트를 스타베이스에 배치
// 공개 보도(CNBC/Reuters/Car and Driver/CNN) 기반 안무: 카운트다운 -> 가속 -> 곡선 램프(흡착으로 거꾸로 매달림) -> 이탈·공중 플립/트위스트
// -> 에어 스러스터 호버 하강·착지 -> 주차 차량 줄 점프(트위스트) -> 0-60 mph 가속(주장 수치 0.8 s 표시)
// 모든 동작은 시간 t(초)의 결정적 함수(키프레임/곡선). 실제 물리 시뮬레이션 아님.
import * as THREE from 'three';
import { createRoadster, setRoadsterFx, createParkedCar } from '../entities/roadsterModel.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';

// 무대 위치(로컬 미터, x=동, z=남). 발사장 통합타워에서 남쪽 ~350 m, 건물/도로/수면과 겹치지 않는 빈 땅 (scripts 의 빈땅 탐색으로 확인)
export const STAGE = { x: 2730, z: -280, rotY: 0 };
const R = 10;            // 루프 램프 반경 (상단 높이 20 m)
const DUR = 46;          // 쇼 길이(초)
const CLAIM_060 = 0.8;   // 공개 시연에서 주장된 0-60 mph (약 0.8~1 s)
const G_Y = 0.08;        // 노면 페인트(y 0.06, 공원 폴리곤 0.025 위)만큼 차를 띄움

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (u) => u * u * (3 - 2 * u);
const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const cosEase = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
// 3차 Hermite: 시작/끝 위치(0..D)와 속도(v0,v1 [m/s]), 구간 길이 T
const herm = (u, D, v0, v1, T) => D * (3 * u * u - 2 * u ** 3) + v0 * T * (u ** 3 - 2 * u * u + u) + v1 * T * (u ** 3 - u * u);
const bez = (u, a, b, c, d) => { const m = 1 - u; return new THREE.Vector3().addScaledVector(a, m * m * m).addScaledVector(b, 3 * m * m * u).addScaledVector(c, 3 * m * u * u).addScaledVector(d, u * u * u); };
const qY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const qX = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qZ = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const HEAD_X = Math.PI / 2;  // 차 앞(+z)을 +x 로
const HEAD_NX = -Math.PI / 2; // -x 로

// 무대 레이아웃(무대 로컬): 진입로 x -62..0 (z=0, +x 방향) -> 루프 (0..10, y 0..20) -> 이탈/호버 착지 패드 (-30, 18)
// -> 점프 레인 x=-30, 주차 차량 z 50..62 -> 드래그 스트립 z 95..200 / 관중석 x 10..18, z 40..120
const START_X = -60, PAD = new THREE.Vector3(-30, 0, 18), ROW_Z = [50, 53, 56, 59, 62], DRAG_Z = 95;
const ACC = 26.8224 / CLAIM_060; // 60 mph = 26.82 m/s

// t -> 차 자세 {p, q, rear, down, suction, phase, odo, bounce, mph, timer}
function poseAt(t) {
  const o = { p: new THREE.Vector3(), q: new THREE.Quaternion(), rear: 0, down: 0, suction: 0, odo: 0, bounce: 0, mph: null, timer: null, phase: '' };
  if (t < 5) { // 카운트다운
    o.p.set(START_X, G_Y, 0); o.q.copy(qY(HEAD_X)); o.rear = t > 3.6 ? 0.25 : 0; o.phase = t < 4 ? 'Countdown' : 'GO!';
    o.count = t < 1 ? '' : t < 4 ? String(3 - Math.floor(t - 1)) : 'GO';
  } else if (t < 9) { // 가속 진입 (Hermite: 0 -> 20 m/s, 60 m)
    const u = seg(t, 5, 9); const s = 100 * u * u - 40 * u ** 3;
    o.p.set(START_X + s, G_Y, 0); o.q.copy(qY(HEAD_X)); o.rear = 1; o.odo = s; o.phase = 'Launch run — rear air thrusters'; o.count = t < 5.6 ? 'GO' : '';
  } else if (t < 12.5) { // 루프 램프: φ 0 -> π, 꼭대기에서 흡착으로 거꾸로 정지에 가깝게 매달림
    let phi;
    if (t < 11.5) { const u = seg(t, 9, 11.5), D = 0.97 * Math.PI; phi = herm(u, D, 2, 0.1, 2.5) ; }
    else phi = 0.97 * Math.PI + 0.03 * Math.PI * seg(t, 11.5, 12.5);
    const r = R - 0.16; // 차체가 곡면 현(chord)을 벗어나 데크로 파고들지 않도록 (L²/8R 보정)
    o.p.set(r * Math.sin(phi), R - r * Math.cos(phi), 0);
    const f = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0), up = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    o.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, f), up, f));
    o.suction = smooth(seg(t, 9, 9.6)) * (1 - seg(t, 12.3, 12.5)); o.rear = 0.6 * (1 - seg(t, 9, 10.2)); o.odo = 60 + phi * R;
    o.phase = phi > 2.6 ? 'Upside down — suction hold' : 'Curved ramp — suction on';
  } else if (t < 16) { // 이탈(vault) + 플립 + 트위스트, 정지 상태로 호버 시작점 도달
    const u = cosEase(seg(t, 12.5, 16));
    o.p.copy(bez(u, new THREE.Vector3(0, 2 * R - 0.16, 0), new THREE.Vector3(-8, 2 * R - 2.5, 0.5), new THREE.Vector3(-28, 2 * R - 3, 12), new THREE.Vector3(PAD.x, 10, PAD.z)));
    const roll = Math.PI * (1 + smoother(seg(t, 12.6, 15.0)));      // 반 바퀴 트위스트(뒤집힘 -> 정상)
    const pitch = -2 * Math.PI * smoother(seg(t, 12.9, 15.5));       // 한 바퀴 백플립
    const yaw = HEAD_NX + (0 - HEAD_NX) * smooth(seg(t, 13, 15.8));   // -x -> +z 로 방향 전환
    o.q.copy(qY(yaw)).multiply(qX(pitch)).multiply(qZ(roll));
    o.rear = 0.9 * (1 - seg(t, 12.5, 14)); o.down = smooth(seg(t, 14.2, 15.6)); o.odo = 60 + Math.PI * R;
    o.phase = t < 13.2 ? 'Vault off the ramp' : 'Mid-air flip + twist';
  } else if (t < 21.5) { // 호버 하강 (하부 스러스터)
    const u = seg(t, 16, 21);
    o.p.set(PAD.x + 0.25 * Math.sin(t * 1.7) * (1 - u), 10 * (1 - cosEase(u)) + G_Y, PAD.z + 0.2 * Math.sin(t * 2.3) * (1 - u));
    o.q.copy(qX(0.03 * Math.sin(t * 2.1) * (1 - u))).multiply(qZ(0.04 * Math.sin(t * 1.6) * (1 - u)));
    o.down = t < 21 ? 0.75 + 0.2 * (1 - u) : 0.75 * (1 - seg(t, 21, 21.4));
    o.bounce = t > 21 ? -0.1 * Math.exp(-(t - 21) * 6) * Math.cos((t - 21) * 18) : 0;
    o.phase = t < 21 ? 'Thruster hover descent' : 'Touchdown';
  } else if (t < 25) { // 점프 레인 가속 (0 -> 14 m/s, 20 m)
    const u = seg(t, 21.5, 25); const s = 18 * u * u + 2 * u ** 3;
    o.p.set(PAD.x, G_Y, PAD.z + s); o.q.identity(); o.rear = 0.8 * smooth(seg(t, 21.5, 22.2)); o.odo = 200 + s; o.phase = 'Run-up to the car-row jump';
  } else if (t < 27.6) { // 주차 차량 5대 위 점프 + 360° 트위스트
    const u = seg(t, 25, 27.6);
    o.p.set(PAD.x, G_Y + 4 * 9 * u * (1 - u), 38 + 38 * u);
    o.q.copy(qY(2 * Math.PI * smoother(u))).multiply(qX(-0.25 * (1 - 2 * u)));
    o.down = Math.sin(Math.PI * u) * 0.9 + 0.2; o.rear = 0.5 * (1 - u); o.odo = 220 + 38 * u; o.phase = 'Thruster jump over the parked cars';
  } else if (t < 30) { // 착지 후 감속 정지 (z 76 -> 95)
    const u = seg(t, 27.6, 30); const s = -2.96 * u ** 3 - 13.08 * u * u + 35.04 * u;
    o.p.set(PAD.x, G_Y, 76 + s); o.q.identity(); o.down = 0.5 * (1 - seg(t, 27.6, 27.9)); o.odo = 258 + s;
    o.bounce = -0.12 * Math.exp(-(t - 27.6) * 6) * Math.cos((t - 27.6) * 18); o.phase = 'Landing';
  } else { // 0-60 mph 런
    let s = 0, v = 0; const t0 = 33, t1 = t0 + CLAIM_060, t2 = t1 + 0.8, t3 = t2 + 3.6;
    const v1 = ACC * CLAIM_060, s1 = 0.5 * ACC * CLAIM_060 ** 2, a2 = 10, v2 = v1 + a2 * 0.8, s2 = s1 + v1 * 0.8 + 0.5 * a2 * 0.64;
    if (t < t0) { s = 0; v = 0; }
    else if (t < t1) { const d = t - t0; s = 0.5 * ACC * d * d; v = ACC * d; }
    else if (t < t2) { const d = t - t1; s = s1 + v1 * d + 0.5 * a2 * d * d; v = v1 + a2 * d; }
    else if (t < t3) { const u = seg(t, t2, t3), T = 3.6; s = s2 + herm(u, v2 * T / 2, v2, 0, T); v = v2 * (1 - u); }
    else { s = s2 + v2 * 3.6 / 2; v = 0; }
    o.p.set(PAD.x, G_Y, DRAG_Z + s); o.q.identity(); o.odo = 300 + s;
    o.rear = t < t0 ? 0.15 + 0.1 * Math.sin(t * 9) ** 2 : t < t2 ? 1 : 0;
    o.mph = Math.min(v, 99) * 2.23694;
    o.timer = t < t0 ? 0 : Math.min(t - t0, CLAIM_060);
    o.done060 = t >= t1;
    o.phase = t < t0 ? '0–60 mph run — ready' : t < t3 ? '0–60 mph run' : 'Show complete — thanks for watching!';
    if (t < t0 && t > 30.5) o.count = String(Math.ceil(t0 - t));
  }
  return o;
}

// 시네마틱 카메라 (무대 로컬, t 의 순수 함수 + 컷 사이 1 s 블렌드)
const SHOTS = [
  [0, (c) => [new THREE.Vector3(-44, 5, 19), new THREE.Vector3(-60, 2, -2)]],
  [5, (c) => [new THREE.Vector3(c.x - 7, 3.2, 15), c.clone().add(new THREE.Vector3(5, 1, 0))]],
  [8.6, (c) => [new THREE.Vector3(-6, 10, 42), c.clone().multiplyScalar(0.55).add(new THREE.Vector3(-3, 11, 2).multiplyScalar(0.45))]],
  [16.3, (c) => [new THREE.Vector3(-15, 4.5, 33), c.clone().add(new THREE.Vector3(0, 1, 0))]],
  [21.5, (c) => [new THREE.Vector3(-54, 2.4, 42), new THREE.Vector3(-30, c.y * 0.5 + 2.5, THREE.MathUtils.clamp(c.z, 36, 78))]],
  [30, (c) => [new THREE.Vector3(-19, 2.6, c.z - 10), c.clone().add(new THREE.Vector3(0, 1, 5))]],
  [38.5, (c) => [new THREE.Vector3(30, 34, 235), new THREE.Vector3(-20, 8, 70)]],
];
function camAt(t, c) {
  let i = 0; while (i + 1 < SHOTS.length && t >= SHOTS[i + 1][0]) i++;
  const [p, l] = SHOTS[i][1](c);
  const k = i > 0 ? smooth(seg(t, SHOTS[i][0], SHOTS[i][0] + 1.0)) : 1;
  if (k < 1) { const [pp, lp] = SHOTS[i - 1][1](c); p.copy(pp.lerp(p, k)); l.copy(lp.lerp(l, k)); }
  return [p, l];
}

function boardTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  let last = '';
  const draw = (big, small, accent = '#7fe3ff') => {
    const key = big + '|' + small; if (key === last) return; last = key;
    const x = cv.getContext('2d');
    x.fillStyle = '#0d1117'; x.fillRect(0, 0, 1024, 512);
    x.fillStyle = accent; x.fillRect(0, 0, 1024, 18); x.fillRect(0, 494, 1024, 18);
    x.fillStyle = '#9fb3c8'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.fillText('ROADSTER JUMP SHOW · STARBASE', 512, 82);
    x.fillStyle = '#ffffff'; x.font = `bold ${big.length > 6 ? 150 : 250}px sans-serif`; x.fillText(big, 512, big.length > 6 ? 320 : 360);
    x.fillStyle = '#c9d6e3'; x.font = '40px sans-serif'; x.fillText(small, 512, 456);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

function buildStage() {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: '#68737f', side: THREE.DoubleSide });
  const rail = new THREE.MeshLambertMaterial({ color: '#e9edf1', side: THREE.DoubleSide });
  const asphalt = new THREE.MeshLambertMaterial({ color: '#4a4f57' });
  const paint = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  // 루프 램프 데크: 내면(r=R, 주행면)~외면(r=R+0.45), 폭 5 m + 안쪽 가드레일
  const N = 80, hw = 2.6, ARC = Math.PI + 0.25;
  const ring = (r, a) => [r * Math.sin(a), R - r * Math.cos(a)];
  const strip = (fn) => { const pos = [], idx = []; for (let i = 0; i <= N; i++) { const a = (ARC * i) / N; for (const v of fn(a)) pos.push(...v); if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); b.setIndex(idx); b.computeVertexNormals(); return b; };
  const deck = [
    strip((a) => { const [x, y] = ring(R, a); return [[x, y, -hw], [x, y, hw]]; }),
    strip((a) => { const [x, y] = ring(R + 0.45, a); return [[x, y, -hw], [x, y, hw]]; }),
    ...[-hw, hw].map((z) => strip((a) => { const [x0, y0] = ring(R - 0.35, a), [x1, y1] = ring(R + 0.45, a); return [[x0, y0, z], [x1, y1, z]]; })),
  ];
  deck.forEach((d, i) => { const m = new THREE.Mesh(d, i === 0 ? asphalt : i === 1 ? steel : rail); m.castShadow = m.receiveShadow = true; g.add(m); });
  // 흡착 레일 표시(주행면 중앙의 시안 라인)
  const lineG = strip((a) => { const [x, y] = ring(R - 0.01, a); return [[x, y, -0.12], [x, y, 0.12]]; });
  g.add(new THREE.Mesh(lineG, new THREE.MeshBasicMaterial({ color: '#4cc9f0', side: THREE.DoubleSide })));
  // 지지 기둥/트러스 (데크 폭 밖 z=±3.1 에 세워 데크와 겹치지 않음)
  const legG = new THREE.CylinderGeometry(0.16, 0.22, 1, 8);
  for (let d = 15; d <= 195; d += 15) {
    const a = (d * Math.PI) / 180, [x, y] = ring(R + 0.45, a);
    if (y < 0.8) continue;
    for (const z of [-3.2]) { const l = new THREE.Mesh(legG, steel); l.scale.y = y; l.position.set(x, y / 2, z); l.castShadow = true; g.add(l); }
    const [bx, by] = ring(R + 0.6, a); const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 6.0), steel); beam.position.set(bx, by, -0.2); g.add(beam);
  }
  // 진입로/점프 레인/드래그 스트립(지면 페인트)
  const flat = (x0, x1, z0, z1, mat, y = 0.06) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; g.add(m); return m; };
  flat(-70, 0.5, -3.2, 3.2, asphalt);
  flat(-34.5, -25.5, 8, 205, asphalt);
  flat(START_X - 0.3, START_X + 0.3, -3, 3, paint, 0.07);
  flat(-34.3, -25.7, DRAG_Z - 0.3, DRAG_Z + 0.3, paint, 0.07);
  flat(-34.3, -25.7, DRAG_Z + 10.7, DRAG_Z + 11.1, new THREE.MeshBasicMaterial({ color: '#4cc9f0' }), 0.07); // 60 mph 지점(주장값 기준)
  for (let z = 105; z < 200; z += 8) flat(-30.15, -29.85, z, z + 4, paint, 0.07);
  // 호버 착지 패드
  const pad = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.2, 40), paint); pad.rotation.x = -Math.PI / 2; pad.position.set(PAD.x, 0.075, PAD.z); g.add(pad);
  const padIn = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), new THREE.MeshLambertMaterial({ color: '#2f3640' })); padIn.rotation.x = -Math.PI / 2; padIn.position.set(PAD.x, 0.07, PAD.z); g.add(padIn);
  // 주차 차량 줄 (점프 방향과 직각으로 나란히)
  const COLORS = ['#3a6ea5', '#b23a48', '#6c757d', '#2a9d8f', '#e9c46a'];
  ROW_Z.forEach((z, i) => { const c = createParkedCar(COLORS[i]); c.position.set(PAD.x, 0, z); c.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2; g.add(c); });
  // 관중석(3단 스탠드) + 펜스
  const stand = new THREE.MeshLambertMaterial({ color: '#c8ccd2' });
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(6 - 2 * k, 0.5 * (k + 1), 80), stand); b.position.set(15 + k, 0.25 * (k + 1), 80); b.castShadow = b.receiveShadow = true; g.add(b); }
  const fence = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 100), rail); fence.position.set(8, 0.55, 80); g.add(fence);
  // 전광판 2개(카운트다운/타이머) — 같은 캔버스 텍스처
  const board = boardTexture();
  const mkBoard = (x, z, faceX, faceZ, w = 16) => {
    const b = new THREE.Group();
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: board.tex })); scr.position.y = 3 + w / 4; b.add(scr);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, w / 2 + 0.6, 0.4), steel); back.position.set(0, 3 + w / 4, -0.25); b.add(back);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), steel); p.position.set(s * w * 0.35, 1.5, -0.25); b.add(p); }
    b.position.set(x, 0, z); b.lookAt(faceX, 0, faceZ); g.add(b); return b;
  };
  mkBoard(-50, 100, 20, 100);         // 드래그 스트립 서쪽, 관중석을 향함
  mkBoard(-70, -10, -44, 19, 10);     // 출발선 뒤, 카운트다운 카메라를 향함
  // 관중
  const crowd = [];
  const SHIRTS = ['#4f7cff', '#ff6b6b', '#20c997', '#f59f00', '#845ef7', '#e64980', '#ffffff', '#222831'];
  for (let i = 0; i < 30; i++) {
    const k = i % 3, a = createAvatar({ color: SHIRTS[(i * 5) % SHIRTS.length], hat: i % 4 === 0 ? '#ffd166' : null });
    a.position.set(13 + k * 2 + 0.5, 0.5 * (k + 1), 46 + ((i * 7.3) % 68)); a.rotation.y = -Math.PI / 2; g.add(a); crowd.push(a);
  }
  return { g, board, crowd };
}

export function createRoadsterShow({ scene, overlay, player, camera, sun, params }) {
  const stage = buildStage();
  stage.g.position.set(STAGE.x, 0, STAGE.z); stage.g.rotation.y = STAGE.rotY;
  scene.add(stage.g);
  const car = createRoadster(); stage.g.add(car);
  stage.g.updateMatrixWorld(true);
  const toWorld = (v) => v.clone().applyMatrix4(stage.g.matrixWorld);
  overlay.add({ cls: 'label landmark', text: '🚀 Roadster Jump Show', getPos: () => toWorld(new THREE.Vector3(-30, 26, 60)), maxDist: 2500, minDist: 60 });

  // UI (영문)
  const css = document.createElement('style');
  css.textContent = `#rs-hud{position:fixed;top:56px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000a;z-index:5}
#rs-hud .t{font-size:13px;letter-spacing:.08em;opacity:.85}#rs-hud .p{font-size:20px;font-weight:700;margin-top:2px}
#rs-hud .c{font-size:120px;font-weight:900;line-height:1}#rs-timer{display:none;margin-top:6px;background:#0d1117d9;border:2px solid #4cc9f0;border-radius:12px;padding:8px 18px}
#rs-timer .v{font-size:56px;font-weight:900;font-variant-numeric:tabular-nums}#rs-timer .n{font-size:13px;color:#9fdcf0}
#rs-btns{position:fixed;right:12px;top:100px;display:flex;flex-direction:column;gap:6px;z-index:6}#rs-btns button{font:13px system-ui;padding:6px 10px;border-radius:8px;border:0;background:#fffe;cursor:pointer;box-shadow:0 1px 4px #0003}`;
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'rs-hud';
  hud.innerHTML = `<div class="t">ROADSTER JUMP SHOW · homage to the Oct 15, 2026 reveal demo</div><div class="p"></div><div class="c"></div><div id="rs-timer"><div class="v"></div><div class="n"></div></div>`;
  document.body.appendChild(hud); hud.style.display = 'none';
  const btns = document.createElement('div'); btns.id = 'rs-btns';
  btns.innerHTML = `<button id="rs-start" title="R">🚀 Roadster Show (R)</button><button id="rs-cam" title="V">🎥 Show cam (V)</button>`;
  document.body.appendChild(btns);
  const $p = hud.querySelector('.p'), $c = hud.querySelector('.c'), $tm = hud.querySelector('#rs-timer'), $tv = $tm.querySelector('.v'), $tn = $tm.querySelector('.n');
  const camBtn = btns.querySelector('#rs-cam');

  const period = Math.max(60, Number(params.get('showEvery')) || 180); // ?show=auto 일 때만 주기 반복
  const autoOn = params.get('show') === 'auto';
  const st = { manualStart: null, cinematic: false, seek: null };
  const now = () => performance.now() / 1000;
  const setCine = (v) => {
    st.cinematic = v;
    camBtn.textContent = v ? '✖ Exit show cam (Esc)' : '🎥 Show cam (V)';
  };
  const start = () => {
    st.manualStart = now();
    setCine(true);
    const sp = toWorld(new THREE.Vector3(20, 0, 76));
    player.position.set(sp.x, 0, sp.z); // 관중석 뒤로 이동
  };
  const stop = () => {
    st.manualStart = null;
    st.seek = null;
    setCine(false);
    hud.style.display = 'none';
  };
  btns.querySelector('#rs-start').onclick = () => { start(); };
  camBtn.onclick = () => {
    if (!st.cinematic && st.manualStart == null && st.seek == null) start();
    else setCine(!st.cinematic);
  };
  addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    if (e.code === 'KeyR') start();
    if (e.code === 'KeyV') {
      if (!st.cinematic && st.manualStart == null && st.seek == null) start();
      else setCine(!st.cinematic);
    }
    if (e.code === 'Escape') stop();
  });
  if (params.get('show') === 'roadster') start();

  const showTime = () => {
    if (st.seek != null) return st.seek;
    if (st.manualStart != null) {
      const t = now() - st.manualStart;
      if (t < DUR) return t;
      st.manualStart = null;
      setCine(false);
    }
    if (autoOn) {
      const t = (Date.now() / 1000) % period;
      if (t < DUR) return t;
    }
    return null;
  };
  const stageCenter = toWorld(new THREE.Vector3(-15, 0, 60));
  function update(dt) {
    const t = showTime();
    const active = t != null;
    const o = poseAt(active ? t : 0);
    car.position.copy(o.p); car.quaternion.copy(o.q);
    const tt = active ? t : 0;
    setRoadsterFx(car, active ? { rear: o.rear, down: o.down, suction: o.suction, wheelAngle: o.odo / 0.34, bounce: o.bounce, t: tt } : { t: 0 });
    // 관중: 점프/플립 때 환호(점프)
    const cheer = active && ((t > 12.5 && t < 16) || (t > 25 && t < 28) || (t > 33 && t < 35));
    stage.crowd.forEach((a, i) => { const base = 0.5 * ((i % 3) + 1); a.position.y = base + (cheer ? Math.max(0, Math.sin(tt * 9 + i)) * 0.35 : 0); animateAvatar(a, 0, dt); });
    const nearStage = Math.hypot(player.position.x - stageCenter.x, player.position.z - stageCenter.z) < 240;
    const showHud = active && (st.cinematic || st.seek != null || nearStage);
    // 전광판 + HUD
    if (!active) {
      const left = autoOn ? Math.ceil(period - (Date.now() / 1000) % period) : null;
      stage.board.draw(left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'PRESS R', left != null ? 'next show (world time) · press R to start now' : 'press R or the 🚀 button to start');
      hud.style.display = 'none';
    } else {
      hud.style.display = showHud ? '' : 'none';
      $p.textContent = o.phase; $c.textContent = o.count || '';
      if (o.timer != null) {
        $tm.style.display = 'block';
        $tv.textContent = `0–60 mph  ${o.timer.toFixed(2)} s`;
        $tn.textContent = o.done060 ? `60 mph reached · CLAIMED figure ≈ ${CLAIM_060} s (reported 0.8–1 s) — scripted homage, not measured` : `${Math.round(o.mph)} mph`;
        stage.board.draw(o.done060 ? `${CLAIM_060.toFixed(2)} s` : `${o.timer.toFixed(2)} s`, o.done060 ? '0–60 mph · claimed figure (scripted)' : `0–60 mph · ${Math.round(o.mph)} mph`, '#4cc9f0');
      } else {
        $tm.style.display = 'none';
        stage.board.draw(o.count || (t < 5 ? '3' : 'LIVE'), o.phase);
      }
    }
    // 시네마틱 카메라 (사용자가 V/Esc/버튼으로 해제 가능)
    if (st.cinematic && active) {
      const [p, l] = camAt(t, o.p);
      camera.position.copy(toWorld(p)); camera.lookAt(toWorld(l));
      if (sun) { sun.target.position.copy(toWorld(o.p)); }
    }
  }
  // 스크린샷/영상 캡처용: seek(t) 로 시간을 고정(결정적 렌더)
  return { update, start, stop, setCinematic: setCine, seek: (t) => { st.seek = t; }, state: st, DUR, stage, car, poseAt };
}
