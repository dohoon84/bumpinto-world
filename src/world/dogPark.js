// 탄천 정자교 북동쪽 둔치 반려견 놀이터 (소형견 전용 / 중·대형견 전용 구역 분리, 울타리·출입문·안내 팻말·어질리티·벤치·다양한 견종 AI)
import * as THREE from 'three';
import { Bubble } from '../overlay.js';

// 정자교(z ≈ -225.9) 바로 위(북쪽, -Z) 동측 탄천 둔치 잔디광장
// 서쪽 산책로(x ≈ 72.5)와 동쪽 자전거도로(x ≈ 105) 사이의 넓은 평지(y = -6m)
const PARK_X0 = 75.5;
const PARK_X1 = 102.5;
const PARK_Z0 = -302.0; // 북쪽 끝 (중·대형견 구역)
const PARK_Z_MID = -270.0; // 구역 분리 울타리 (남: 소형견 / 북: 중·대형견)
const PARK_Z1 = -240.0; // 남쪽 끝 (정자교 북측 보도 바로 옆)

const GATE_HALF = 2.0; // 출입구 폭 4.0m
const FENCE_H = 1.25;

const matCache = new Map();
function M(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return matCache.get(key);
}

// ---------------------------------------------------------------------------
// 1. 팻말(표지판) 텍스처 & 메시 생성
// ---------------------------------------------------------------------------
function makeSignBoard({
  title,
  subtitle,
  badge,
  bgColor = '#fff9db',
  borderColor = '#f59f00',
  badgeColor = '#d9480f',
  width = 2.4,
  height = 1.15,
  postHeight = 1.9,
}) {
  const g = new THREE.Group();
  const postMat = M('#5c4033');
  const capMat = M('#ffd43b');

  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.075, postHeight, 8),
      postMat,
    );
    post.position.set(sx * (width * 0.42), postHeight / 2, 0);
    post.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), capMat);
    cap.position.set(sx * (width * 0.42), postHeight + 0.04, 0);
    g.add(post, cap);
  }

  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const ctx = cv.getContext('2d');

  // 배경 & 테두리
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 16;
  ctx.strokeRect(10, 10, 492, 236);

  // 상단 배지
  if (badge) {
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.roundRect(126, 26, 260, 46, 23);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 24px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(badge, 256, 57);
  }

  // 메인 타이틀
  ctx.fillStyle = '#122033';
  ctx.font = '900 42px "Pretendard", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 132);

  // 서브 설명
  if (subtitle) {
    ctx.fillStyle = '#33415c';
    ctx.font = '800 25px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillText(subtitle, 256, 192);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;

  const boardFrame = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.12),
    postMat,
  );
  boardFrame.position.y = postHeight - height * 0.35;
  boardFrame.castShadow = true;
  g.add(boardFrame);

  const faceGeo = new THREE.PlaneGeometry(width - 0.14, height - 0.14);
  const faceMat = new THREE.MeshBasicMaterial({ map: tex });
  const front = new THREE.Mesh(faceGeo, faceMat);
  front.position.set(0, boardFrame.position.y, 0.065);
  const back = new THREE.Mesh(faceGeo, faceMat);
  back.position.set(0, boardFrame.position.y, -0.065);
  back.rotation.y = Math.PI;
  g.add(front, back);

  return g;
}

// ---------------------------------------------------------------------------
// 2. 울타리 & 아치 게이트 생성
// ---------------------------------------------------------------------------
function buildFenceSpan(group, x0, z0, x1, z1, postColor = '#f8f9fa', railColor = '#e9ecef') {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  if (L < 0.2) return;
  const yaw = Math.atan2(dx, dz);
  const steps = Math.max(1, Math.round(L / 2.6));
  const postMat = M(postColor);
  const railMat = M(railColor);
  const capMat = M('#74c0fc');

  // 가로 레일 3단
  for (const ry of [0.32, 0.68, 1.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, L), railMat);
    rail.position.set((x0 + x1) / 2, ry, (z0 + z1) / 2);
    rail.rotation.y = yaw;
    rail.castShadow = true;
    group.add(rail);
  }

  // 세로 기둥 & 촘촘한 피켓(살대)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, FENCE_H, 0.14), postMat);
    post.position.set(px, FENCE_H / 2, pz);
    post.rotation.y = yaw;
    post.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), capMat);
    cap.position.set(px, FENCE_H + 0.03, pz);
    cap.rotation.y = yaw;
    group.add(post, cap);

    if (i < steps) {
      for (let k = 1; k <= 3; k++) {
        const kt = (i + k / 4) / steps;
        const kx = x0 + dx * kt;
        const kz = z0 + dz * kt;
        const picket = new THREE.Mesh(new THREE.BoxGeometry(0.045, FENCE_H * 0.88, 0.045), postMat);
        picket.position.set(kx, FENCE_H * 0.44, kz);
        picket.rotation.y = yaw;
        group.add(picket);
      }
    }
  }
}

function buildGateArch(x, z, yaw, labelText, color = '#4dabf7') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;

  const pillarMat = M(color);
  const creamMat = M('#fff9db');
  const doorFrameMat = M(color);
  const doorPicketMat = M('#ffffff');
  const latchMat = M('#fcc419');
  const h = 2.75;
  const w = GATE_HALF * 2;

  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, h, 10), pillarMat);
    p.position.set(s * GATE_HALF, h / 2, 0);
    p.castShadow = true;
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.36, 0.32), creamMat);
  beam.position.set(0, h + 0.1, 0);
  beam.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.12, 0.52), pillarMat);
  roof.position.set(0, h + 0.32, 0);
  g.add(beam, roof);

  // 여닫이 양문형 출입문 (기본 닫힘 상태)
  const leafW = GATE_HALF - 0.14;
  const doorH = FENCE_H - 0.06;

  function makeDoorLeaf(side) {
    // side = -1 (왼쪽 경첩), +1 (오른쪽 경첩)
    const pivot = new THREE.Group();
    pivot.position.set(side * (GATE_HALF - 0.08), 0, 0);

    const dir = -side; // 안쪽(중앙)을 향하는 방향
    // 상하 가로 프레임
    for (const ry of [0.24, 0.65, 1.04]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.075, 0.075), doorFrameMat);
      bar.position.set(dir * (leafW / 2), ry, 0);
      bar.castShadow = true;
      pivot.add(bar);
    }
    // 양끝 세로 프레임
    for (const ox of [0.05, leafW - 0.05]) {
      const stile = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorH, 0.08), doorFrameMat);
      stile.position.set(dir * ox, doorH / 2 + 0.06, 0);
      stile.castShadow = true;
      pivot.add(stile);
    }
    // 세로 살대(피켓)
    const numPickets = 5;
    for (let i = 1; i <= numPickets; i++) {
      const px = (leafW * i) / (numPickets + 1);
      const picket = new THREE.Mesh(new THREE.BoxGeometry(0.048, doorH * 0.9, 0.048), doorPicketMat);
      picket.position.set(dir * px, doorH * 0.5 + 0.04, 0);
      picket.castShadow = true;
      pivot.add(picket);
    }
    // 중앙 손잡이/잠금쇠
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.14), latchMat);
    handle.position.set(dir * (leafW - 0.12), 0.72, 0);
    pivot.add(handle);

    return pivot;
  }

  const leftDoor = makeDoorLeaf(-1);
  const rightDoor = makeDoorLeaf(1);
  g.add(leftDoor, rightDoor);

  return { group: g, leftDoor, rightDoor };
}

// ---------------------------------------------------------------------------
// 3. 어질리티(장애물 놀이기구) & 쉼터 소품
// ---------------------------------------------------------------------------
function buildAgilityTunnel(x, z, yaw, color = '#ff922b') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.68, 3.2, 16, 1, true),
    M(color, { side: THREE.DoubleSide }),
  );
  tube.rotation.x = Math.PI / 2;
  tube.position.y = 0.68;
  tube.castShadow = true;
  g.add(tube);

  for (const sz of [-1.55, 0, 1.55]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.055, 8, 20),
      M('#ffd43b'),
    );
    ring.position.set(0, 0.68, sz);
    g.add(ring);
  }
  return g;
}

function buildAgilityHurdle(x, z, yaw, barColor = '#ff6b6b', height = 0.52) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const postMat = M('#ffffff');
  const barMat = M(barColor);

  for (const sx of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), postMat);
    post.position.set(sx, 0.475, 0);
    post.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.55), M('#495057'));
    base.position.set(sx, 0.03, 0);
    g.add(post, base);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8), barMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = height;
  bar.castShadow = true;
  g.add(bar);
  return g;
}

function buildAgilityRamp(x, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;

  const rampMat = M('#4dabf7');
  const yellowZone = M('#ffd43b');

  // A자형 오르막·내리막 경사로
  for (const side of [-1, 1]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 2.5), rampMat);
    plank.position.set(0, 0.62, side * 1.05);
    plank.rotation.x = side * 0.52;
    plank.castShadow = true;
    const contact = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.11, 0.75), yellowZone);
    contact.position.set(0, 0.22, side * 1.82);
    contact.rotation.x = side * 0.52;
    g.add(plank, contact);
  }
  return g;
}

function buildWaterStation(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.06, 16), M('#dee2e6'));
  pad.position.y = 0.03;
  const tapPost = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.92, 10), M('#339af0'));
  tapPost.position.set(0, 0.46, -0.45);
  tapPost.castShadow = true;
  g.add(pad, tapPost);

  const bowlColors = ['#ff6b6b', '#ffd43b', '#51cf66'];
  bowlColors.forEach((c, i) => {
    const bx = (i - 1) * 0.46;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.11, 12), M(c));
    bowl.position.set(bx, 0.08, 0.18);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), M('#74c0fc'));
    water.position.set(bx, 0.13, 0.18);
    g.add(bowl, water);
  });
  return g;
}

function buildParkBench(x, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const wood = M('#8d6e63');
  const iron = M('#343a40');
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.56), wood);
  seat.position.y = 0.44;
  seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.08), wood);
  back.position.set(0, 0.72, -0.24);
  back.rotation.x = -0.12;
  back.castShadow = true;
  g.add(seat, back);
  for (const sx of [-0.9, 0.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.52), iron);
    leg.position.set(sx, 0.22, 0);
    g.add(leg);
  }
  return g;
}

// ---------------------------------------------------------------------------
// 3-2. 탄천 징검다리 (정자교 남쪽 강변 둔치 연결 돌다리)
// ---------------------------------------------------------------------------
function buildSteppingStones(scene, overlay, terrain) {
  const g = new THREE.Group();
  g.name = 'tancheon-stepping-stones';
  scene.add(g);

  // 서측 둔치(x=20.0, z=-196.0) <-> 동측 둔치(x=64.0, z=-196.0)
  // 수면(y=-6.6m), 둔치(y=-6.0m) -> 돌 상판 높이를 -5.98m로 맞춰 물 위로 또렷하게 솟아 있고 걸어서/뛰어서 건널 수 있게 함
  const xStart = 20.0;
  const xEnd = 64.0;
  const zBridge = -196.0;
  const topY = -5.98;
  const bedY = -7.6;
  const stoneCount = 21; // 약 2.2m 간격으로 일정하게 배치

  const stoneColors = ['#c9c4b8', '#b8b2a6', '#d4cfc3', '#aba598'];
  const baseMat = M('#7c776d');
  const foamMat = M('#e3f2fd');

  for (let i = 0; i < stoneCount; i++) {
    const t = i / (stoneCount - 1);
    const sx = xStart + (xEnd - xStart) * t;
    // 물살 방향에 맞춘 아주 완만한 곡선미를 주되 거의 일직선으로 정렬
    const sz = zBridge + Math.sin(t * Math.PI) * 0.6;

    const stoneGroup = new THREE.Group();
    stoneGroup.position.set(sx, 0, sz);

    // 물속 하상(-7.6m)부터 지탱하는 기초석
    const pillarH = topY - bedY - 0.16;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.82, pillarH, 8),
      baseMat,
    );
    base.position.y = bedY + pillarH / 2;
    stoneGroup.add(base);

    // 물 위로 드러난 넓적한 화강암 디딤돌 (8각 기둥 + 상단 베벨)
    const col = stoneColors[i % stoneColors.length];
    const topStone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.84, 0.90, 0.34, 8),
      M(col, { flatShading: true }),
    );
    topStone.position.y = topY - 0.17;
    topStone.rotation.y = (i * 0.7) % Math.PI;
    topStone.castShadow = true;
    topStone.receiveShadow = true;
    stoneGroup.add(topStone);

    // 수면(-6.6m)에 닿는 물결 테두리(하얀 포말 링) — 물 위 구간(i=2..stoneCount-3)에만 표시
    if (i >= 2 && i <= stoneCount - 3) {
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1.04, 12),
        foamMat,
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.y = -6.58;
      stoneGroup.add(ripple);
    }

    g.add(stoneGroup);
  }

  // 양쪽 둔치 진입로 연결 디딤판 및 작은 안내 팻말
  const signEast = makeSignBoard({
    badge: 'STEPPING STONES',
    title: '🪨 탄천 징검다리',
    subtitle: '폴짝폴짝 건너는 탄천 돌다리',
    bgColor: '#f8f9fa',
    borderColor: '#495057',
    badgeColor: '#2b8a3e',
    width: 1.9,
    height: 0.92,
    postHeight: 1.55,
  });
  signEast.position.set(xEnd + 1.2, -6.0, zBridge + 2.4);
  signEast.rotation.y = -Math.PI / 2;
  g.add(signEast);

  // 지형(terrain)에 징검다리 보행 상판(deck) 등록 -> 물에 빠지지 않고 걸어서/뛰어서 건널 수 있음
  terrain?.addDeckSegment?.({
    ax: xStart - 1.0,
    az: zBridge,
    bx: xEnd + 1.0,
    bz: zBridge,
    hw: 1.45,
    h: topY,
  });

  if (overlay) {
    overlay.add({
      cls: 'label stepping-stones',
      text: '🪨 탄천 돌다리 (징검다리)',
      getPos: () => new THREE.Vector3((xStart + xEnd) / 2, topY + 2.6, zBridge),
      maxDist: 380,
      minDist: 0,
    });
  }

  return g;
}

// ---------------------------------------------------------------------------
// 4. 견종별 3D 모델 생성 (말티즈, 푸들, 비숑, 웰시코기, 포메 / 백구 진돗개, 시베리안 허스키, 골든 리트리버, 사모예드, 달마시안)
// ---------------------------------------------------------------------------
function createDogMesh(spec) {
  const {
    breed = 'maltese',
    scale = 1.0,
    coat = '#ffffff',
    secondaryCoat = null,
    earColor = null,
    collarColor = '#ff6b6b',
    fluffy = false,
    pointyEars = false,
    curlyTail = false,
    shortLegs = false,
    spots = false,
  } = spec;

  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);

  const mainMat = M(coat);
  const subMat = M(secondaryCoat || coat);
  const earMat = M(earColor || secondaryCoat || coat);
  const darkMat = M('#1e1e1e');
  const pinkMat = M('#ff8787');
  const collarMat = M(collarColor);

  const legH = shortLegs ? 0.19 : 0.28;
  const bodyY = legH + 0.16;

  // 몸통
  const bodyGeo = fluffy
    ? new THREE.SphereGeometry(0.24, 10, 8)
    : new THREE.CapsuleGeometry(0.165, 0.42, 4, 8);
  const body = new THREE.Mesh(bodyGeo, mainMat);
  if (fluffy) {
    body.scale.set(0.95, 0.88, 1.38);
  } else {
    body.rotation.x = Math.PI / 2;
  }
  body.position.y = bodyY;
  body.castShadow = true;
  rig.add(body);

  // 허스키 등배색 또는 달마시안 점박이 디테일
  if (secondaryCoat && breed === 'husky') {
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.172, 0.38, 4, 8), subMat);
    saddle.rotation.x = Math.PI / 2;
    saddle.position.set(0, bodyY + 0.03, -0.01);
    rig.add(saddle);
  }
  if (spots) {
    const spotPositions = [
      [0.14, bodyY + 0.05, 0.08],
      [-0.14, bodyY + 0.02, -0.06],
      [0.11, bodyY + 0.09, -0.15],
      [-0.12, bodyY + 0.07, 0.14],
    ];
    for (const [sx, sy, sz] of spotPositions) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), darkMat);
      sp.position.set(sx, sy, sz);
      rig.add(sp);
    }
  }

  // 목줄(컬러)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.026, 6, 12), collarMat);
  collar.rotation.x = Math.PI / 2 - 0.35;
  collar.position.set(0, bodyY + 0.09, 0.23);
  rig.add(collar);

  // 머리 그룹
  const headPivot = new THREE.Group();
  headPivot.position.set(0, bodyY + 0.21, 0.28);
  rig.add(headPivot);

  const headRadius = breed === 'bichon' ? 0.23 : fluffy ? 0.19 : 0.165;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 10, 8), mainMat);
  head.castShadow = true;
  headPivot.add(head);

  // 허스키 이마 캡
  if (breed === 'husky') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), subMat);
    cap.position.set(0, 0.03, -0.02);
    headPivot.add(cap);
  }

  // 주둥이(Snout)
  const snoutLen = pointyEars ? 0.16 : 0.11;
  const snout = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.10, snoutLen),
    M(breed === 'husky' ? '#f8f9fa' : coat),
  );
  snout.position.set(0, -0.03, headRadius * 0.78);
  headPivot.add(snout);

  // 코 & 눈 & 혀
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), darkMat);
  nose.position.set(0, -0.005, headRadius * 0.78 + snoutLen * 0.52);
  headPivot.add(nose);

  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.018, 0.07), pinkMat);
  tongue.position.set(0, -0.068, headRadius * 0.78 + snoutLen * 0.35);
  tongue.rotation.x = 0.35;
  headPivot.add(tongue);

  for (const sx of [-0.068, 0.068]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 6, 5),
      breed === 'husky' ? M('#1c7ed6') : darkMat,
    );
    eye.position.set(sx, 0.04, headRadius * 0.82);
    headPivot.add(eye);
  }

  // 귀 (쫑긋한 삼각형 귀 vs 복슬복슬 처진 귀)
  for (const side of [-1, 1]) {
    if (pointyEars) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.17, 5), earMat);
      ear.position.set(side * 0.105, headRadius * 0.88, -0.02);
      ear.rotation.z = -side * 0.22;
      ear.rotation.x = 0.15;
      headPivot.add(ear);
    } else {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.13, 3, 6), earMat);
      ear.position.set(side * (headRadius * 0.88), -0.01, 0.0);
      ear.rotation.z = side * 0.25;
      headPivot.add(ear);
    }
  }

  // 꼬리 (진돗개/허스키 말린 꼬리 vs 포실한 방울 꼬리)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, bodyY + 0.08, -0.27);
  rig.add(tailPivot);

  if (curlyTail) {
    const tail = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.042, 6, 10, Math.PI * 1.25),
      earMat,
    );
    tail.rotation.y = Math.PI / 2;
    tail.position.set(0, 0.10, -0.02);
    tailPivot.add(tail);
  } else if (fluffy) {
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), mainMat);
    pom.position.set(0, 0.07, -0.04);
    tailPivot.add(pom);
  } else {
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.28, 6), earMat);
    tail.position.set(0, 0.11, -0.08);
    tail.rotation.x = -0.65;
    tailPivot.add(tail);
  }

  // 다리 4개
  const legGeo = new THREE.CylinderGeometry(0.046, 0.04, legH, 6);
  const legOffsets = [
    [-0.095, 0.18], // 앞왼
    [0.095, 0.18],  // 앞오른
    [-0.095, -0.18], // 뒤왼
    [0.095, -0.18],  // 뒤오른
  ];
  const legs = legOffsets.map(([lx, lz]) => {
    const pivot = new THREE.Group();
    pivot.position.set(lx, legH, lz);
    const mesh = new THREE.Mesh(legGeo, mainMat);
    mesh.position.y = -legH / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    rig.add(pivot);
    return pivot;
  });

  g.scale.setScalar(scale);
  g.userData = {
    rig,
    headPivot,
    tailPivot,
    legs,
    phase: Math.random() * Math.PI * 2,
  };
  return g;
}

// ---------------------------------------------------------------------------
// 5. 소형견 / 중·대형견 프로필 및 대사 정의
// ---------------------------------------------------------------------------
const SMALL_DOGS = [
  {
    name: '🐾 말티즈 두부',
    breedLabel: '말티즈',
    spec: { breed: 'maltese', scale: 0.85, coat: '#ffffff', earColor: '#fff5eb', collarColor: '#ff6b6b', fluffy: true },
    speed: 2.8,
    barks: ['멍멍!! (두부가 신나게 잔디를 뒹굴어요 ☁️)', '왈왈! 탄천 바람 냄새가 너무 좋다멍! 🐾', '총총총~ 나 잡아봐라멍! ✨'],
  },
  {
    name: '🐾 토이푸들 초코',
    breedLabel: '푸들',
    spec: { breed: 'poodle', scale: 0.90, coat: '#b06535', earColor: '#8d4925', collarColor: '#ffd43b', fluffy: true },
    speed: 3.2,
    barks: ['왕왕! 어질리티 터널 통과 1등이다멍! 🧸', '뽀글뽀글 파마 털에 잔디가 붙었다멍~ 🌿', '공 던져주세요!! 왈왈! 🎾'],
  },
  {
    name: '🐾 비숑 구름이',
    breedLabel: '비숑 프리제',
    spec: { breed: 'bichon', scale: 0.96, coat: '#fcfcfc', earColor: '#f8f9fa', collarColor: '#74c0fc', fluffy: true },
    speed: 3.1,
    barks: ['비숑 타임 발동!! 우다다다 달린다멍!! ☁️💨', '내 하이바 머리 어때요? 동글동글 귀엽다멍! 🐶', '멍! 친구들이랑 소형견 놀이터 전세 냈다멍!'],
  },
  {
    name: '🐾 말티즈 보리',
    breedLabel: '말티즈',
    spec: { breed: 'maltese', scale: 0.82, coat: '#fffdf9', earColor: '#f3d9fa', collarColor: '#cc5de8', fluffy: true },
    speed: 2.7,
    barks: ['낑낑~ 간식 냄새가 나는 것 같다멍! 🦴', '꼬리가 프로펠러처럼 돌아간다멍! 🚁', '말티즈는 참지 않지! 신나게 뛴다멍! 🔥'],
  },
  {
    name: '🐾 크림푸들 쿠키',
    breedLabel: '푸들',
    spec: { breed: 'poodle', scale: 0.92, coat: '#e6be8a', earColor: '#d4a373', collarColor: '#20c997', fluffy: true },
    speed: 3.0,
    barks: ['폴짝폴짝! 점프 실력 좀 보라멍! 🦘', '탄천 산책 나오면 기분이 최고다멍~ 🎶', '물그릇에서 목 좀 축이고 또 뛸 거다멍! 💧'],
  },
  {
    name: '🐾 웰시코기 감자',
    breedLabel: '웰시코기',
    spec: { breed: 'corgi', scale: 0.98, coat: '#e08e45', secondaryCoat: '#ffffff', collarColor: '#51cf66', pointyEars: true, shortLegs: true },
    speed: 3.3,
    barks: ['식빵 엉덩이 흔들며 우다다다!! 🍞🐾', '다리는 짧아도 달리기는 제일 빠르다멍! ⚡', '헥헥~ 잔디밭 냄새 맡느라 바쁘다멍!'],
  },
  {
    name: '🐾 포메라니안 솜사탕',
    breedLabel: '포메라니안',
    spec: { breed: 'pomeranian', scale: 0.78, coat: '#ffe8cc', earColor: '#ffc078', collarColor: '#f06595', fluffy: true, pointyEars: true, curlyTail: true },
    speed: 2.9,
    barks: ['앙앙! 털찐 거 아니고 원래 복슬복슬한 거다멍! 🦁', '빙글빙글 돌면서 춤춘다멍~ 💃🐾', '솜뭉치가 굴러간다멍!! ✨'],
  },
];

const LARGE_DOGS = [
  {
    name: '🐕 진돗개 백구',
    breedLabel: '진돗개 (화이트)',
    spec: { breed: 'jindo', scale: 1.65, coat: '#f8f9fa', earColor: '#fff3bf', collarColor: '#e03131', pointyEars: true, curlyTail: true },
    speed: 4.3,
    barks: ['워우월!! 정자동 탄천 지킴이 백구 나가신다!! 🐕', '진돗개 백구의 늠름한 꼬리 말림을 보라멍! 🇰🇷', '넓은 대형견 운동장을 전력질주하니 속이 뻥 뚫린다멍! 💨'],
  },
  {
    name: '🐺 시베리안 허스키 썰매',
    breedLabel: '허스키',
    spec: { breed: 'husky', scale: 1.94, coat: '#e9ecef', secondaryCoat: '#343a40', earColor: '#343a40', collarColor: '#339af0', pointyEars: true, curlyTail: true },
    speed: 4.6,
    barks: ['아우우우~~!! 🐺 파란 눈의 대형 허스키 카리스마!!', '외모는 늑대지만 성격은 순둥이 개그맨이다멍! 😆', '달리기 시합할 사람?! 허스키 엔진 풀가동이다멍! ❄️'],
  },
  {
    name: '🐕 진돗개 눈송이',
    breedLabel: '진돗개 (화이트)',
    spec: { breed: 'jindo', scale: 1.60, coat: '#ffffff', earColor: '#f1f3f5', collarColor: '#f59f00', pointyEars: true, curlyTail: true },
    speed: 4.2,
    barks: ['멍멍! 허들쯤은 가볍게 뛰어넘는다멍! 🏅', '백구 형이랑 술래잡기 중이다멍! 🐾', '주인님~ 여기서 하루 종일 놀고 싶다멍! ☀️'],
  },
  {
    name: '🐺 허스키 태풍이',
    breedLabel: '허스키',
    spec: { breed: 'husky', scale: 1.88, coat: '#f1f3f5', secondaryCoat: '#495057', earColor: '#495057', collarColor: '#ff6b6b', pointyEars: true, curlyTail: true },
    speed: 4.5,
    barks: ['우다다다!! 태풍처럼 잔디밭을 가로지른다멍!! 🌪️', '아우우~ 친구들이랑 뛰니까 너무 신난다멍! 🎶', '물 한 모금 마시고 다시 열 바퀴 뛴다멍! 💧'],
  },
  {
    name: '🦮 골든 리트리버 해피',
    breedLabel: '골든 리트리버',
    spec: { breed: 'retriever', scale: 1.96, coat: '#f0b459', earColor: '#d99338', collarColor: '#20c997', pointyEars: false },
    speed: 3.9,
    barks: ['헤헤~ 세상 모든 사람과 강아지가 다 내 친구다멍! 💛', '꼬리 흔들다가 엉덩이까지 흔들린다멍~ 🦮✨', '천사견 대형 리트리버 해피랑 같이 산책해요멍! 🐾'],
  },
  {
    name: '🐻‍❄️ 사모예드 우유',
    breedLabel: '사모예드',
    spec: { breed: 'samoyed', scale: 1.78, coat: '#ffffff', earColor: '#f8f9fa', collarColor: '#4dabf7', fluffy: true, pointyEars: true, curlyTail: true },
    speed: 4.0,
    barks: ['사모예드 특유의 미소(^ㅅ^) 발사다멍!! 😊☁️', '커다란 솜사탕이 달려간다멍~ 비켜라멍! 🐻‍❄️', '털이 복슬복슬해서 안기면 엄청 포근하다멍! ✨'],
  },
  {
    name: '🐾 달마시안 점박이',
    breedLabel: '달마시안',
    spec: { breed: 'dalmatian', scale: 1.68, coat: '#ffffff', earColor: '#212529', collarColor: '#fa5252', spots: true },
    speed: 4.4,
    barks: ['101마리 중 제일 잘 달리는 점박이다멍! 🏁', '롱다리로 성큼성큼 점프한다멍! 🦘', '멍멍! 중·대형견 놀이터 넓어서 최고다멍! 🎉'],
  },
];

// ---------------------------------------------------------------------------
// 6. 메인 빌더 & 업데이트 루프
// ---------------------------------------------------------------------------
export function addDogPark(scene, overlay, terrain) {
  const groundY = terrain ? terrain.baseHeight((PARK_X0 + PARK_X1) / 2, (PARK_Z0 + PARK_Z1) / 2) : 0;
  const root = new THREE.Group();
  root.name = 'tancheon-dog-park';
  root.position.y = groundY;
  scene.add(root);

  const cx = (PARK_X0 + PARK_X1) / 2;
  const smallCz = (PARK_Z_MID + PARK_Z1) / 2;
  const largeCz = (PARK_Z0 + PARK_Z_MID) / 2;
  const width = PARK_X1 - PARK_X0;
  const smallDepth = PARK_Z1 - PARK_Z_MID;
  const largeDepth = PARK_Z_MID - PARK_Z0;

  // 0) 정자교 남쪽 탄천 징검다리(돌다리) 생성
  buildSteppingStones(scene, overlay, terrain);

  // 1) 구역별 잔디 바닥 매트
  const smallTurf = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.3, smallDepth - 0.3),
    M('#9be17b'),
  );
  smallTurf.rotation.x = -Math.PI / 2;
  smallTurf.position.set(cx, 0.03, smallCz);
  smallTurf.receiveShadow = true;
  root.add(smallTurf);

  const largeTurf = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.3, largeDepth - 0.3),
    M('#8cd46c'),
  );
  largeTurf.rotation.x = -Math.PI / 2;
  largeTurf.position.set(cx, 0.03, largeCz);
  largeTurf.receiveShadow = true;
  root.add(largeTurf);

  // 2) 외곽 및 중앙 분리 울타리 + 여닫이 출입문 (기본은 모두 닫혀 있으며 문을 열어야 출입 가능)
  const gates = [];
  function registerGate({ id, name, x, z, yaw, axis, color }) {
    const built = buildGateArch(x, z, yaw, name, color);
    root.add(built.group);
    const gate = {
      id,
      name,
      x,
      z,
      yaw,
      axis, // 'x' (남북 가로 벽의 문) | 'z' (동서 세로 벽의 문)
      group: built.group,
      leftDoor: built.leftDoor,
      rightDoor: built.rightDoor,
      open: false,
      angle: 0,
      awayTimer: 0,
      labelItem: null,
    };
    if (overlay) {
      gate.labelItem = overlay.add({
        cls: 'label dog-gate-label closed',
        text: `🚪 ${name} · 닫힘 (클릭 / G)`,
        getPos: () => new THREE.Vector3(x, groundY + 3.25, z),
        maxDist: 38,
        minDist: 0,
      });
      gate.labelItem.el.style.pointerEvents = 'auto';
      gate.labelItem.el.style.cursor = 'pointer';
      gate.labelItem.el.addEventListener('click', () => toggleGate(gate));
    }
    gates.push(gate);
    return gate;
  }

  // 남쪽 벽 (정자교 쪽) — 소형견 정문
  buildFenceSpan(root, PARK_X0, PARK_Z1, cx - GATE_HALF, PARK_Z1);
  buildFenceSpan(root, cx + GATE_HALF, PARK_Z1, PARK_X1, PARK_Z1);
  const southGate = registerGate({ id: 'south', name: '소형견 놀이터 정문', x: cx, z: PARK_Z1, yaw: 0, axis: 'x', color: '#ff922b' });

  // 북쪽 벽 — 중·대형견 북문
  buildFenceSpan(root, PARK_X0, PARK_Z0, cx - GATE_HALF, PARK_Z0);
  buildFenceSpan(root, cx + GATE_HALF, PARK_Z0, PARK_X1, PARK_Z0);
  const northGate = registerGate({ id: 'north', name: '중·대형견 놀이터 북문', x: cx, z: PARK_Z0, yaw: 0, axis: 'x', color: '#339af0' });

  // 중앙 분리 벽 (소형견 <-> 중·대형견) — 구역 연결문
  buildFenceSpan(root, PARK_X0, PARK_Z_MID, cx - GATE_HALF, PARK_Z_MID, '#fff3bf', '#ffd43b');
  buildFenceSpan(root, cx + GATE_HALF, PARK_Z_MID, PARK_X1, PARK_Z_MID, '#fff3bf', '#ffd43b');
  const midGate = registerGate({ id: 'mid', name: '소형견↔중·대형견 연결문', x: cx, z: PARK_Z_MID, yaw: 0, axis: 'x', color: '#f59f00' });

  // 서쪽 벽 (탄천 강변 산책로 쪽) — 각 구역별 강변 출입문
  buildFenceSpan(root, PARK_X0, PARK_Z0, PARK_X0, largeCz - GATE_HALF);
  buildFenceSpan(root, PARK_X0, largeCz + GATE_HALF, PARK_X0, smallCz - GATE_HALF);
  buildFenceSpan(root, PARK_X0, smallCz + GATE_HALF, PARK_X0, PARK_Z1);
  const westSmallGate = registerGate({ id: 'west_small', name: '소형견 강변문', x: PARK_X0, z: smallCz, yaw: Math.PI / 2, axis: 'z', color: '#ff922b' });
  const westLargeGate = registerGate({ id: 'west_large', name: '중·대형견 강변문', x: PARK_X0, z: largeCz, yaw: Math.PI / 2, axis: 'z', color: '#339af0' });

  // 동쪽 벽 (자전거도로 쪽) — 안전을 위해 막힌 울타리로 마감
  buildFenceSpan(root, PARK_X1, PARK_Z0, PARK_X1, PARK_Z1);

  // 하단 출입문 열기/닫기 액션 버튼
  const gateBtn = document.createElement('button');
  gateBtn.id = 'dog-gate-btn';
  gateBtn.type = 'button';
  gateBtn.hidden = true;
  document.body.appendChild(gateBtn);

  let nearGate = null;
  let gateUiSig = '';

  function syncGateLabel(g) {
    if (!g.labelItem?.el) return;
    g.labelItem.el.textContent = g.open
      ? `🔓 ${g.name} · 열림 (클릭 / G)`
      : `🚪 ${g.name} · 닫힘 (클릭 / G)`;
    g.labelItem.el.classList.toggle('open', g.open);
    g.labelItem.el.classList.toggle('closed', !g.open);
  }

  function syncGateBtn() {
    const sig = nearGate ? `${nearGate.id}:${nearGate.open ? 1 : 0}` : '';
    if (sig === gateUiSig) return;
    gateUiSig = sig;
    if (!nearGate) {
      gateBtn.hidden = true;
      return;
    }
    gateBtn.hidden = false;
    gateBtn.className = nearGate.open ? 'is-open' : 'is-closed';
    gateBtn.innerHTML = nearGate.open
      ? `<span>🔓 ${nearGate.name} 닫기</span><kbd>G</kbd>`
      : `<span>🚪 ${nearGate.name} 열기</span><kbd>G</kbd>`;
  }

  function toggleGate(target = nearGate) {
    if (!target) return false;
    target.open = !target.open;
    target.awayTimer = 0;
    syncGateLabel(target);
    syncGateBtn();
    return true;
  }

  gateBtn.addEventListener('click', () => {
    toggleGate(nearGate);
    gateBtn.blur();
  });

  // 3) 대형 안내 팻말 (소형견 전용 / 중·대형견 전용 / 종합 안내판)
  const mainSign = makeSignBoard({
    badge: 'SEONGNAM TANCHEON',
    title: '🐕 탄천 반려견 놀이터',
    subtitle: '소형견 / 중·대형견 구역 분리 운영',
    bgColor: '#fff9db',
    borderColor: '#f59f00',
    badgeColor: '#e67700',
    width: 3.1,
    height: 1.35,
    postHeight: 2.35,
  });
  mainSign.position.set(cx + 4.6, 0, PARK_Z1 + 0.8);
  root.add(mainSign);

  // 소형견 구역 팻말 (남문 옆 & 서문 옆)
  const smallSignSouth = makeSignBoard({
    badge: 'SMALL DOGS ONLY',
    title: '🐩 소형견 전용 놀이터',
    subtitle: '말티즈 · 푸들 · 비숑 · 코기 · 포메',
    bgColor: '#fff0f6',
    borderColor: '#ff6b6b',
    badgeColor: '#e64980',
    width: 2.6,
    height: 1.2,
    postHeight: 2.05,
  });
  smallSignSouth.position.set(cx - 4.4, 0, PARK_Z1 + 0.6);
  root.add(smallSignSouth);

  const smallSignWest = makeSignBoard({
    badge: '체고 40cm 이하',
    title: '🐩 소형견 전용 구역',
    subtitle: '말티즈 · 푸들 · 비숑 프리제',
    bgColor: '#fff0f6',
    borderColor: '#ff6b6b',
    badgeColor: '#e64980',
    width: 2.4,
    height: 1.15,
    postHeight: 1.95,
  });
  smallSignWest.position.set(PARK_X0 - 0.5, 0, smallCz + 4.2);
  smallSignWest.rotation.y = -Math.PI / 2;
  root.add(smallSignWest);

  // 중·대형견 구역 팻말 (중앙 분리벽 옆 & 서문 옆 & 북문 옆)
  const largeSignMid = makeSignBoard({
    badge: 'MEDIUM & LARGE DOGS',
    title: '🐕 중·대형견 전용 놀이터',
    subtitle: '진돗개(백구) · 허스키 · 리트리버 · 사모예드',
    bgColor: '#e7f5ff',
    borderColor: '#339af0',
    badgeColor: '#1971c2',
    width: 2.8,
    height: 1.25,
    postHeight: 2.1,
  });
  largeSignMid.position.set(cx - 4.5, 0, PARK_Z_MID + 0.4);
  root.add(largeSignMid);

  const largeSignWest = makeSignBoard({
    badge: '체고 40cm 초과',
    title: '🐺 중·대형견 전용 구역',
    subtitle: '진돗개(화이트) · 허스키 · 리트리버',
    bgColor: '#e7f5ff',
    borderColor: '#339af0',
    badgeColor: '#1971c2',
    width: 2.4,
    height: 1.15,
    postHeight: 1.95,
  });
  largeSignWest.position.set(PARK_X0 - 0.5, 0, largeCz + 4.2);
  largeSignWest.rotation.y = -Math.PI / 2;
  root.add(largeSignWest);

  // 4) 어질리티 놀이기구 & 음수대 & 보호자 벤치 배치
  // 소형견 구역 소품
  root.add(buildAgilityTunnel(PARK_X0 + 6.5, smallCz - 4.0, 0.35, '#ff922b'));
  root.add(buildAgilityHurdle(cx + 3.5, smallCz + 3.5, -0.4, '#ff6b6b', 0.38));
  root.add(buildWaterStation(PARK_X1 - 3.2, smallCz - 8.5));
  root.add(buildParkBench(PARK_X1 - 2.2, smallCz + 5.0, -Math.PI / 2));
  root.add(buildParkBench(PARK_X0 + 2.2, smallCz - 9.5, Math.PI / 2));

  // 중·대형견 구역 소품
  root.add(buildAgilityRamp(PARK_X0 + 7.2, largeCz + 3.5, 0.15));
  root.add(buildAgilityTunnel(cx + 4.5, largeCz - 4.5, -0.3, '#339af0'));
  root.add(buildAgilityHurdle(cx - 2.0, largeCz - 6.0, 0.5, '#fcc419', 0.62));
  root.add(buildWaterStation(PARK_X1 - 3.2, largeCz + 8.5));
  root.add(buildParkBench(PARK_X1 - 2.2, largeCz - 3.0, -Math.PI / 2));
  root.add(buildParkBench(PARK_X0 + 2.2, largeCz + 9.5, Math.PI / 2));

  // 5) 오버레이 상단 지명 라벨 등록 (지도/원거리에서도 바로 보이게)
  if (overlay) {
    overlay.add({
      cls: 'label dog-park-main',
      text: '🐾 탄천 반려견 놀이터 (소형견 · 중/대형견)',
      getPos: () => new THREE.Vector3(cx, groundY + 6.8, PARK_Z_MID),
      maxDist: 1400,
      minDist: 0,
    });
    overlay.add({
      cls: 'label dog-zone small',
      text: '🐩 소형견 전용 운동장 (말티즈·푸들·비숑)',
      getPos: () => new THREE.Vector3(cx, groundY + 3.8, smallCz),
      maxDist: 220,
      minDist: 0,
    });
    overlay.add({
      cls: 'label dog-zone large',
      text: '🐕 중·대형견 전용 운동장 (진돗개 백구·허스키·리트리버)',
      getPos: () => new THREE.Vector3(cx, groundY + 3.8, largeCz),
      maxDist: 220,
      minDist: 0,
    });
  }

  // 6) 강아지 엔티티 스폰 및 자율 행동 AI
  const dogs = [];

  function spawnZoneDogs(defs, bounds) {
    const pad = 2.4;
    const minX = bounds.x0 + pad;
    const maxX = bounds.x1 - pad;
    const minZ = bounds.z0 + pad;
    const maxZ = bounds.z1 - pad;

    defs.forEach((def, idx) => {
      const mesh = createDogMesh(def.spec);
      const x = minX + ((idx * 0.37 + 0.19) % 1) * (maxX - minX);
      const z = minZ + ((idx * 0.53 + 0.27) % 1) * (maxZ - minZ);
      const ry = (idx * 1.7) % (Math.PI * 2);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = ry;
      root.add(mesh);

      const tagHeight = def.spec.scale > 1.2 ? 0.62 + def.spec.scale * 0.56 : 1.05;
      const worldPos = () => new THREE.Vector3(dog.x, groundY + dog.jumpY, dog.z);

      const dog = {
        def,
        mesh,
        bounds: { minX, maxX, minZ, maxZ },
        x,
        z,
        ry,
        tx: x,
        tz: z,
        state: 'run', // 'run' | 'trot' | 'play_bow' | 'sniff' | 'zoomies'
        timer: 1.5 + Math.random() * 3.0,
        speed: def.speed,
        jumpY: 0,
        jumpVel: 0,
        barkIdx: idx % def.barks.length,
        barkCooldown: 1.5 + idx * 1.3,
        tag: null,
        bubble: null,
      };

      if (overlay) {
        dog.tag = overlay.add({
          cls: 'tag npc dog-tag',
          text: def.name,
          getPos: () => worldPos().setY(groundY + dog.jumpY + tagHeight),
          maxDist: 65,
        });
        dog.bubble = new Bubble(
          overlay,
          'npc',
          () => worldPos().setY(groundY + dog.jumpY + tagHeight + 0.45),
          { name: def.name },
        );
      }

      pickNextAction(dog);
      dogs.push(dog);
    });
  }

  function pickNextAction(d) {
    const r = Math.random();
    const { minX, maxX, minZ, maxZ } = d.bounds;
    if (r < 0.48) {
      d.state = 'run';
      d.tx = minX + Math.random() * (maxX - minX);
      d.tz = minZ + Math.random() * (maxZ - minZ);
      d.timer = 2.5 + Math.random() * 3.2;
    } else if (r < 0.72) {
      d.state = 'zoomies'; // 신나서 통통 뛰며 질주
      d.tx = minX + Math.random() * (maxX - minX);
      d.tz = minZ + Math.random() * (maxZ - minZ);
      d.timer = 2.0 + Math.random() * 2.2;
    } else if (r < 0.88) {
      d.state = 'play_bow'; // 앞발 낮추고 꼬리 흔들기
      d.timer = 1.4 + Math.random() * 1.4;
    } else {
      d.state = 'sniff'; // 킁킁 잔디 냄새 맡기
      d.timer = 1.3 + Math.random() * 1.5;
    }
  }

  // 남쪽 구역: 소형견 스폰
  spawnZoneDogs(SMALL_DOGS, {
    x0: PARK_X0,
    x1: PARK_X1,
    z0: PARK_Z_MID,
    z1: PARK_Z1,
  });

  // 북쪽 구역: 중·대형견 스폰
  spawnZoneDogs(LARGE_DOGS, {
    x0: PARK_X0,
    x1: PARK_X1,
    z0: PARK_Z0,
    z1: PARK_Z_MID,
  });

  let clockT = 0;

  function update(dt, playerPos) {
    clockT += dt;

    // 1) 출입문 근접 감지 & 여닫이 애니메이션 & 자동 닫힘
    let closestGate = null;
    let closestGateDist = 4.6;
    for (const g of gates) {
      const dist = playerPos
        ? Math.hypot(playerPos.x - g.x, playerPos.z - g.z)
        : Infinity;
      if (dist < closestGateDist) {
        closestGateDist = dist;
        closestGate = g;
      }
      // 열려 있는 문에서 멀어지면 6초 뒤 자동으로 닫힘 (강아지 탈출 방지)
      if (g.open) {
        if (dist > 6.5) {
          g.awayTimer += dt;
          if (g.awayTimer > 6.0) {
            g.open = false;
            g.awayTimer = 0;
            syncGateLabel(g);
          }
        } else {
          g.awayTimer = 0;
        }
      }
      const targetAngle = g.open ? 1.42 : 0;
      g.angle += (targetAngle - g.angle) * Math.min(1, dt * 8.5);
      g.leftDoor.rotation.y = -g.angle;
      g.rightDoor.rotation.y = g.angle;
    }
    nearGate = playerPos ? closestGate : null;
    syncGateBtn();

    for (const d of dogs) {
      d.timer -= dt;
      d.barkCooldown -= dt;
      d.bubble?.tick();

      // 플레이어가 가까우면 반갑게 바라보거나 짖음
      const playerDist = playerPos
        ? Math.hypot(playerPos.x - d.x, playerPos.z - d.z)
        : Infinity;

      if (playerDist < 11.0 && d.barkCooldown <= 0 && !d.bubble?.showing) {
        const line = d.def.barks[d.barkIdx++ % d.def.barks.length];
        d.bubble?.say(line, 4200);
        d.barkCooldown = 6.5 + Math.random() * 5.0;
        if (d.jumpY <= 0.01) d.jumpVel = 3.2;
      }

      if (d.timer <= 0) {
        pickNextAction(d);
      }

      const u = d.mesh.userData;
      let moveSpd = 0;

      if (d.state === 'run' || d.state === 'zoomies') {
        const dx = d.tx - d.x;
        const dz = d.tz - d.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.65) {
          pickNextAction(d);
        } else {
          const mult = d.state === 'zoomies' ? 1.35 : 1.0;
          moveSpd = d.speed * mult;
          const step = Math.min(dist, moveSpd * dt);
          d.x += (dx / dist) * step;
          d.z += (dz / dist) * step;
          const targetRy = Math.atan2(dx, dz);
          d.ry += Math.atan2(Math.sin(targetRy - d.ry), Math.cos(targetRy - d.ry)) * Math.min(1, dt * 8);
          if (d.state === 'zoomies' && d.jumpY <= 0.01 && Math.random() < dt * 3.5) {
            d.jumpVel = 3.4;
          }
        }
      } else if (d.state === 'play_bow' && playerDist < 14 && playerPos) {
        const targetRy = Math.atan2(playerPos.x - d.x, playerPos.z - d.z);
        d.ry += Math.atan2(Math.sin(targetRy - d.ry), Math.cos(targetRy - d.ry)) * Math.min(1, dt * 6);
      }

      // 점프 중력 처리
      if (d.jumpY > 0 || d.jumpVel > 0) {
        d.jumpY += d.jumpVel * dt;
        d.jumpVel -= 14.0 * dt;
        if (d.jumpY <= 0) {
          d.jumpY = 0;
          d.jumpVel = 0;
        }
      }

      // 관절 애니메이션 (다리 달리기, 꼬리 흔들기, 고개 움직임)
      u.phase += dt * (moveSpd > 0.2 ? 12 + moveSpd * 2.5 : 6);
      const p = u.phase;

      if (moveSpd > 0.2) {
        const swing = Math.sin(p) * 0.75;
        u.legs[0].rotation.x = swing;
        u.legs[1].rotation.x = -swing * 0.85;
        u.legs[2].rotation.x = -swing;
        u.legs[3].rotation.x = swing * 0.85;
        u.rig.position.y = Math.abs(Math.cos(p)) * 0.07;
        u.rig.rotation.x = Math.sin(p) * 0.08;
        u.headPivot.rotation.x = -0.08 + Math.cos(p) * 0.08;
      } else if (d.state === 'play_bow') {
        // 앞발을 납작 낮추고 엉덩이를 치켜드는 플레이 보우 자세
        u.legs[0].rotation.x = -0.65;
        u.legs[1].rotation.x = -0.65;
        u.legs[2].rotation.x = 0.15;
        u.legs[3].rotation.x = 0.15;
        u.rig.rotation.x = 0.26;
        u.rig.position.y = -0.05;
        u.headPivot.rotation.x = -0.25;
        u.headPivot.rotation.z = Math.sin(clockT * 6) * 0.15;
      } else {
        // 킁킁 잔디 냄새 맡기
        u.legs[0].rotation.x = 0;
        u.legs[1].rotation.x = 0;
        u.legs[2].rotation.x = 0;
        u.legs[3].rotation.x = 0;
        u.rig.rotation.x = 0.14;
        u.rig.position.y = 0;
        u.headPivot.rotation.x = 0.38 + Math.sin(clockT * 10) * 0.08;
        u.headPivot.rotation.y = Math.sin(clockT * 4.5) * 0.22;
      }

      // 꼬리는 언제나 살랑살랑
      u.tailPivot.rotation.y = Math.sin(clockT * 16 + d.barkIdx) * 0.55;

      d.mesh.position.set(d.x, d.jumpY, d.z);
      d.mesh.rotation.y = d.ry;
    }
  }

  // 울타리 및 출입문 충돌 판정 (문이 닫혀 있으면 막히고, 문을 열어야 통과 가능)
  function blocks(x, z) {
    if (x < PARK_X0 - 1.0 || x > PARK_X1 + 1.0 || z < PARK_Z0 - 1.0 || z > PARK_Z1 + 1.0) {
      return false;
    }
    const wallThick = 0.45;
    const inGateSpanX = Math.abs(x - cx) < GATE_HALF - 0.25;
    const inSmallWestSpan = Math.abs(z - smallCz) < GATE_HALF - 0.25;
    const inLargeWestSpan = Math.abs(z - largeCz) < GATE_HALF - 0.25;

    // 남북 가로 울타리 3개 (PARK_Z0, PARK_Z_MID, PARK_Z1)
    if (x >= PARK_X0 - 0.2 && x <= PARK_X1 + 0.2) {
      if (Math.abs(z - PARK_Z0) < wallThick && !(inGateSpanX && northGate.open)) return true;
      if (Math.abs(z - PARK_Z_MID) < wallThick && !(inGateSpanX && midGate.open)) return true;
      if (Math.abs(z - PARK_Z1) < wallThick && !(inGateSpanX && southGate.open)) return true;
    }
    // 동서 세로 울타리 2개 (PARK_X0, PARK_X1)
    if (z >= PARK_Z0 - 0.2 && z <= PARK_Z1 + 0.2) {
      if (Math.abs(x - PARK_X0) < wallThick && !((inSmallWestSpan && westSmallGate.open) || (inLargeWestSpan && westLargeGate.open))) {
        return true;
      }
      if (Math.abs(x - PARK_X1) < wallThick) return true;
    }
    return false;
  }

  return {
    update,
    blocks,
    dogs,
    gates,
    toggleGate,
    get nearGate() {
      return nearGate;
    },
    center: { x: cx, y: groundY, z: PARK_Z_MID },
    bounds: { x0: PARK_X0, x1: PARK_X1, z0: PARK_Z0, z1: PARK_Z1, zMid: PARK_Z_MID },
  };
}
