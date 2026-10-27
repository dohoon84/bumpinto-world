// 정자역 광장(3·4번 출구 서측 공원/광장 ~ 역 출입구):
//  - 중앙 분수대(물줄기·물방울 파티클 애니메이션 + 야간 조명)
//  - 간이 버스킹 무대(우드 데크, 스피커, 마이크, 통기타·건반 연주자 애니메이션 + 음표/대사)
//  - 알록달록 빈백(Beanbag) 휴식존 + 쉬고 있는 시민들
//  - 빨간 우체통(POST) + 광장 둘레 느티나무/원형 평상 벤치
//  - 광장 비둘기 떼: 평소엔 모이를 쪼며 걸어 다니다가 플레이어가 다가오면 "푸드득!" 무리 지어 날아오름
import * as THREE from 'three';
import { createAvatar } from '../entities/avatar.js';
import { Bubble } from '../overlay.js';
import { watchEvening } from '../evening.js';

const PLAZA_X = -74.0;
const PLAZA_Z = 25.0;
const STAGE_X = -74.0;
const STAGE_Z = 47.5;

const matCache = new Map();
function M(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return matCache.get(key);
}

function createPostboxMesh() {
  const g = new THREE.Group();
  const red = M('#d61f26');
  const darkRed = M('#9e1419');
  const baseMat = M('#2d3436');
  const white = M('#f8f9fa');
  const slotMat = M('#1a1a1a');

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.44), baseMat);
  base.position.y = 0.07;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.05, 0.4), red);
  body.position.y = 0.66;
  body.castShadow = true;

  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.16, 8), darkRed);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.26;
  roof.castShadow = true;

  const slotL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.04), slotMat);
  slotL.position.set(-0.11, 1.02, 0.2);
  const slotR = slotL.clone();
  slotR.position.x = 0.11;

  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#d61f26';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 236, 108);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('우 체 통', 128, 60);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('POST', 128, 100);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.19),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  plate.position.set(0, 0.72, 0.205);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.04, 0.41), white);
  stripe.position.y = 0.92;

  g.add(base, body, roof, slotL, slotR, plate, stripe);
  return g;
}

function createBeanbag(color, rotY = 0) {
  const g = new THREE.Group();
  const bagMat = M(color, { flatShading: true });

  // 푹신하게 퍼진 아랫부분 쿠션
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 9), bagMat);
  base.scale.set(1.08, 0.46, 1.22);
  base.position.y = 0.28;
  base.castShadow = true;
  base.receiveShadow = true;

  // 등받이 쪽으로 솟은 윗부분
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), bagMat);
  back.scale.set(0.95, 0.78, 0.85);
  back.position.set(0, 0.52, -0.26);
  back.rotation.x = 0.28;
  back.castShadow = true;

  g.add(base, back);
  g.rotation.y = rotY;
  return g;
}

function loungeOnBeanbag(avatar, x, z, yaw) {
  avatar.position.set(x, 0.02, z);
  avatar.rotation.y = yaw;
  const u = avatar.userData;
  u.rig.position.y = -0.58;
  u.rig.rotation.x = -0.28;
  u.legL.position.set(-0.13, 0.48, 0.26);
  u.legR.position.set(0.13, 0.48, 0.26);
  u.legL.rotation.x = -1.18;
  u.legR.rotation.x = -1.12;
  u.armL.rotation.x = -0.55;
  u.armR.rotation.x = -0.65;
}

function createFountain(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const stoneOuter = M('#cfd6de');
  const stoneInner = M('#b5bfc9');
  const waterMat = new THREE.MeshLambertMaterial({
    color: '#4fc3e8',
    emissive: '#1b6ca8',
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.88,
  });
  const brass = M('#c9a24b');

  // 바닥 원형 광장 타일 패드
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(8.8, 8.8, 0.06, 32), M('#dcd4c6'));
  pad.position.y = 0.03;
  pad.receiveShadow = true;
  g.add(pad);

  // 외곽 석재 턱 (앉을 수 있는 분수대 둘레)
  const rimOuter = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.4, 0.58, 28), stoneOuter);
  rimOuter.position.y = 0.29;
  rimOuter.castShadow = true;
  rimOuter.receiveShadow = true;
  g.add(rimOuter);

  // 수조 내부 물 표면
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.55, 0.48, 28), waterMat);
  pool.position.y = 0.28;
  g.add(pool);

  // 2단 중앙 석재 구조물
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.2, 0.75, 20), stoneInner);
  tier1.position.y = 0.65;
  tier1.castShadow = true;
  const bowl1 = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 1.6, 0.28, 20), stoneOuter);
  bowl1.position.y = 1.08;
  bowl1.castShadow = true;
  const pool2 = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 20), waterMat);
  pool2.position.y = 1.19;

  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.9, 0.85, 16), stoneInner);
  tier2.position.y = 1.55;
  tier2.castShadow = true;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.35, 12), brass);
  nozzle.position.y = 2.08;

  g.add(tier1, bowl1, pool2, tier2, nozzle);

  // 물방울/물줄기 파티클 (InstancedMesh)
  const DROP_COUNT = 84;
  const dropGeo = new THREE.OctahedronGeometry(0.11, 0);
  const dropMat = new THREE.MeshBasicMaterial({ color: '#e6f8ff', transparent: true, opacity: 0.86 });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, DROP_COUNT);
  g.add(drops);

  // 수면 위 파문 링
  const ringGeo = new THREE.RingGeometry(0.25, 0.36, 20);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const rm = new THREE.Mesh(ringGeo, ringMat);
    rm.position.y = 0.54;
    g.add(rm);
    rings.push({ mesh: rm, phase: i / 6 });
  }

  // 야간 수중 조명
  const glowRing = new THREE.Mesh(
    new THREE.RingGeometry(1.9, 4.3, 24),
    new THREE.MeshBasicMaterial({ color: '#7ce8ff', transparent: true, opacity: 0.38, side: THREE.DoubleSide }),
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = 0.53;
  glowRing.visible = false;
  g.add(glowRing);

  watchEvening((on) => {
    glowRing.visible = on;
    waterMat.emissiveIntensity = on ? 0.65 : 0.25;
  });

  const dummy = new THREE.Object3D();
  const dropSeeds = Array.from({ length: DROP_COUNT }, (_, i) => ({
    center: i < 28,
    angle: ((i * 137.5) % 360) * (Math.PI / 180),
    speed: 0.75 + (i % 7) * 0.08,
    offset: (i / DROP_COUNT) % 1,
    spread: i < 28 ? 0.55 + (i % 5) * 0.12 : 1.15 + (i % 6) * 0.14,
  }));

  function update(t) {
    for (let i = 0; i < DROP_COUNT; i++) {
      const d = dropSeeds[i];
      const p = (t * d.speed + d.offset) % 1;
      if (d.center) {
        // 중앙 코어 분수 (높이 솟구침)
        const r = p * d.spread;
        const y = 2.18 + 3.4 * p - 4.8 * p * p;
        dummy.position.set(Math.cos(d.angle) * r, Math.max(0.55, y), Math.sin(d.angle) * r);
        const sc = (1 - p * 0.45) * 1.15;
        dummy.scale.set(sc * 0.7, sc * 1.6, sc * 0.7);
      } else {
        // 둘레 아치형 분수 노즐 12개에서 안쪽/위로 뿜어짐
        const r0 = 3.85;
        const r = r0 - p * 1.65;
        const y = 0.55 + 2.5 * p - 3.6 * p * p;
        dummy.position.set(Math.cos(d.angle) * r, Math.max(0.54, y), Math.sin(d.angle) * r);
        const sc = 0.85 * (1 - p * 0.35);
        dummy.scale.set(sc, sc * 1.35, sc);
      }
      dummy.updateMatrix();
      drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;

    for (const r of rings) {
      const p = (t * 0.55 + r.phase) % 1;
      const rad = 0.8 + p * 3.5;
      r.mesh.scale.set(rad, 1, rad);
    }
  }

  return { group: g, update, x, z, radius: 5.5 };
}

function createAcousticGuitar() {
  const g = new THREE.Group();
  const bodyMat = M('#d9822b');
  const darkWood = M('#5c3a21');
  const neckMat = M('#8a5a36');

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 12), bodyMat);
  lower.rotation.x = Math.PI / 2;
  lower.position.set(-0.08, 0, 0);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), bodyMat);
  upper.rotation.x = Math.PI / 2;
  upper.position.set(0.08, 0.03, 0);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.086, 10), darkWood);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0.02, 0.015, 0);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.03), neckMat);
  neck.position.set(0.32, 0.06, 0);
  neck.rotation.z = 0.1;

  g.add(lower, upper, hole, neck);
  return g;
}

function createBuskingStage(x, z, overlay) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // 무대가 북쪽(분수대/빈백 방향, -Z)을 바라보도록 배치
  const woodDeck = M('#9c6b43');
  const woodEdge = M('#6e472b');
  const metal = M('#222a35');
  const speakerMat = M('#181c22');
  const fabricMat = M('#fff3d6');
  const warmBulbMat = new THREE.MeshBasicMaterial({ color: '#ffdf88' });

  // 우드 데크 플랫폼 + 앞 계단
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.36, 4.4), woodDeck);
  deck.position.y = 0.18;
  deck.castShadow = true;
  deck.receiveShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(7.76, 0.12, 4.56), woodEdge);
  trim.position.y = 0.06;
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.65), woodEdge);
  step.position.set(0, 0.09, -2.45);
  g.add(deck, trim, step);

  // 무대 뒤 아치형 트러스 & 어닝 캐노피
  for (const sx of [-3.4, 3.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.3, 8), metal);
    post.position.set(sx, 1.8, 1.85);
    post.castShadow = true;
    const frontPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.5, 8), metal);
    frontPost.position.set(sx, 1.9, -1.65);
    frontPost.castShadow = true;
    g.add(post, frontPost);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.12, 3.9), fabricMat);
  canopy.position.set(0, 3.55, 0.1);
  canopy.rotation.x = 0.06;
  canopy.castShadow = true;
  g.add(canopy);

  // 무대 상단 현수막 사인보드
  const signCv = document.createElement('canvas');
  signCv.width = 512;
  signCv.height = 128;
  const sctx = signCv.getContext('2d');
  sctx.fillStyle = '#122033';
  sctx.fillRect(0, 0, 512, 128);
  sctx.fillStyle = '#f5a200';
  sctx.fillRect(0, 0, 512, 10);
  sctx.fillRect(0, 118, 512, 10);
  sctx.fillStyle = '#ffe169';
  sctx.font = 'bold 46px "Noto Sans KR", sans-serif';
  sctx.textAlign = 'center';
  sctx.fillText('🎵 정자역 광장 버스킹 STAGE', 256, 78);
  const signTex = new THREE.CanvasTexture(signCv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.68, 0.08),
    new THREE.MeshBasicMaterial({ map: signTex }),
  );
  banner.position.set(0, 3.22, -1.78);
  g.add(banner);

  // 무대 가랜드 전구 (Warm String Lights)
  const bulbGeo = new THREE.SphereGeometry(0.075, 8, 6);
  for (let i = -5; i <= 5; i++) {
    const b = new THREE.Mesh(bulbGeo, warmBulbMat);
    const sag = Math.cos((i / 5) * (Math.PI / 2)) * 0.18;
    b.position.set(i * 0.62, 3.35 - sag, -1.62);
    g.add(b);
  }

  // 양옆 PA 스피커 스탠드
  for (const sx of [-2.85, 2.85]) {
    const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.28, 1.05, 6), metal);
    tripod.position.set(sx, 0.88, -1.2);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.42), speakerMat);
    box.position.set(sx, 1.58, -1.2);
    box.rotation.y = sx < 0 ? -0.25 : 0.25;
    box.castShadow = true;
    g.add(tripod, box);
  }

  // 중앙 마이크 스탠드 & 보면대
  const micPole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.35, 6), metal);
  micPole.position.set(-0.7, 1.03, -0.82);
  const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 10), metal);
  micBase.position.set(-0.7, 0.38, -0.82);
  g.add(micPole, micBase);

  // 건반(키보드) 스탠드
  const kbTop = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.38), speakerMat);
  kbTop.position.set(1.05, 1.16, -0.45);
  const kbKeys = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.03, 0.14), M('#ffffff'));
  kbKeys.position.set(1.05, 1.21, -0.54);
  const kbLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.22, 0.8, 6), metal);
  kbLeg.position.set(1.05, 0.76, -0.45);
  g.add(kbTop, kbKeys, kbLeg);

  // 연주자 1: 통기타 보컬 버스커 (-Z 방향인 광장/분수대를 바라봄: rotation.y = Math.PI)
  const singer = createAvatar({
    gender: 'm',
    face: 'round',
    hair: 'medium',
    top: 'hoodie',
    color: '#e64980',
    pants: '#2b303c',
    hat: '#ffd166',
  });
  singer.position.set(-0.7, 0.36, -0.42);
  singer.rotation.y = Math.PI;
  const guitar = createAcousticGuitar();
  guitar.position.set(0.02, 1.08, 0.26);
  guitar.rotation.z = -0.15;
  singer.userData.rig.add(guitar);
  g.add(singer);

  // 연주자 2: 건반 연주자
  const pianist = createAvatar({
    gender: 'f',
    face: 'round',
    hair: 'pony',
    glasses: true,
    top: 'long',
    color: '#4f7cff',
    pants: '#343a40',
  });
  pianist.position.set(1.05, 0.36, -0.02);
  pianist.rotation.y = Math.PI;
  g.add(pianist);

  // 무대 앞 박수치며 구경하는 관객 2명
  const fan1 = createAvatar({ gender: 'f', face: 'round', hair: 'long', top: 'hoodie', color: '#20c997' });
  fan1.position.set(-1.6, 0, -4.1);
  fan1.rotation.y = 0.18;
  const fan2 = createAvatar({ gender: 'm', face: 'square', hair: 'short', top: 'short', color: '#f59f00' });
  fan2.position.set(1.4, 0, -4.3);
  fan2.rotation.y = -0.2;
  g.add(fan1, fan2);

  let bubble = null;
  if (overlay) {
    overlay.add({
      cls: 'tag npc',
      text: '🎸 정자역 버스킹 밴드',
      getPos: () => new THREE.Vector3(x - 0.7, 2.75, z - 0.42),
      maxDist: 55,
    });
    bubble = new Bubble(overlay, 'npc', () => new THREE.Vector3(x - 0.7, 3.3, z - 0.42));
  }

  const SONGS = [
    '🎵 바람 불어 좋은 정자역 밤거리~ ♪',
    '🎶 오늘 신청곡은 게시판에 남겨 주세요! ♫',
    '🎸 분수대 앞 빈백에 편하게 앉아서 들어주세요~ ♪',
    '🎵 탄천 따라 걷는 길에 별빛이 내리네 ♬',
  ];
  let songIdx = 0;
  let nextSongAt = 2.5;

  function update(dt, t) {
    // 보컬 기타 스트로크 + 리듬 바운스
    const su = singer.userData;
    su.rig.position.y = Math.abs(Math.sin(t * 4.2)) * 0.04;
    su.rig.rotation.z = Math.sin(t * 2.1) * 0.05;
    su.armL.rotation.x = -0.95;
    su.armL.rotation.z = -0.35;
    su.armR.rotation.x = -0.85 + Math.sin(t * 11.0) * 0.28;
    su.armR.rotation.z = 0.25;

    // 건반 연주자 손 움직임
    const pu = pianist.userData;
    pu.rig.position.y = Math.abs(Math.sin(t * 4.2 + 0.8)) * 0.03;
    pu.armL.rotation.x = -1.05 + Math.sin(t * 8.5) * 0.14;
    pu.armR.rotation.x = -1.05 + Math.cos(t * 9.2) * 0.14;

    // 관객 리듬 호응
    fan1.userData.rig.position.y = Math.abs(Math.sin(t * 4.2)) * 0.045;
    fan2.userData.rig.position.y = Math.abs(Math.cos(t * 4.2)) * 0.045;

    if (bubble) {
      bubble.tick();
      nextSongAt -= dt;
      if (nextSongAt <= 0) {
        bubble.say(SONGS[songIdx++ % SONGS.length], 5200);
        nextSongAt = 9.5;
      }
    }
  }

  return { group: g, update, x, z, hw: 4.1, hd: 2.5 };
}

function createPlazaTree(x, z, scale = 1, withBench = true) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const trunkMat = M('#7c5c3e');
  const leaf1 = M('#6ab056', { flatShading: true });
  const leaf2 = M('#82c46c', { flatShading: true });
  const woodBench = M('#b8895a');
  const stoneCurb = M('#c8c2b6');

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.36 * scale, 3.6 * scale, 7), trunkMat);
  trunk.position.y = 1.8 * scale;
  trunk.castShadow = true;
  g.add(trunk);

  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3 * scale, 1), leaf1);
  c1.position.set(0, 4.4 * scale, 0);
  c1.scale.set(1.15, 0.82, 1.15);
  c1.castShadow = true;

  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.65 * scale, 1), leaf2);
  c2.position.set(0.9 * scale, 5.1 * scale, 0.4 * scale);
  c2.castShadow = true;

  const c3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55 * scale, 1), leaf2);
  c3.position.set(-0.85 * scale, 4.9 * scale, -0.5 * scale);
  c3.castShadow = true;
  g.add(c1, c2, c3);

  if (withBench) {
    const curb = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.42, 0.28, 12), stoneCurb);
    curb.position.y = 0.14;
    curb.receiveShadow = true;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.08, 12), woodBench);
    seat.position.y = 0.42;
    seat.castShadow = true;
    seat.receiveShadow = true;
    g.add(curb, seat);
  }
  return g;
}

function createPigeonMesh() {
  const g = new THREE.Group();
  const bodyMat = M('#8b95a1');
  const wingMat = M('#67727e');
  const neckMat = M('#2b9e78');
  const headMat = M('#59626d');
  const beakMat = M('#f59f00');

  const rig = new THREE.Group();
  g.add(rig);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), bodyMat);
  body.scale.set(0.85, 0.78, 1.35);
  body.position.set(0, 0.17, 0);
  body.castShadow = true;

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.18), headMat);
  tail.position.set(0, 0.16, -0.2);
  tail.rotation.x = -0.2;

  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.22, 0.12);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.09, 7), neckMat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6), headMat);
  head.position.set(0, 0.07, 0.02);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.065, 0.1);
  neckPivot.add(neck, head, beak);

  const wingGeo = new THREE.BoxGeometry(0.24, 0.025, 0.22);
  const wingL = new THREE.Group();
  wingL.position.set(-0.09, 0.21, 0);
  const wMeshL = new THREE.Mesh(wingGeo, wingMat);
  wMeshL.position.x = -0.11;
  wingL.add(wMeshL);

  const wingR = new THREE.Group();
  wingR.position.set(0.09, 0.21, 0);
  const wMeshR = new THREE.Mesh(wingGeo, wingMat);
  wMeshR.position.x = 0.11;
  wingR.add(wMeshR);

  rig.add(body, tail, neckPivot, wingL, wingR);
  g.userData = { rig, neckPivot, wingL, wingR };
  return g;
}

export function addStationPlaza(scene, overlay, world) {
  const root = new THREE.Group();
  scene.add(root);

  // 1) 중앙 분수대
  const fountain = createFountain(PLAZA_X, PLAZA_Z);
  root.add(fountain.group);
  if (overlay) {
    overlay.add({
      cls: 'label plaza',
      text: '⛲ 정자역 광장 분수대',
      getPos: () => new THREE.Vector3(PLAZA_X, 3.6, PLAZA_Z),
      maxDist: 140,
      minDist: 0,
    });
  }

  // 2) 간이 무대 & 버스킹 공연
  const stage = createBuskingStage(STAGE_X, STAGE_Z, overlay);
  root.add(stage.group);

  // 3) 알록달록 빈백(Beanbag) 휴식 라운지 존 (분수대와 무대 사이 잔디/광장)
  const BEANBAGS = [
    { x: -82.5, z: 35.5, color: '#ff6b6b', rot: 0.45, sitter: { gender: 'f', hair: 'long', color: '#fff3bf', top: 'hoodie' } },
    { x: -80.0, z: 37.5, color: '#ffd166', rot: 0.28, sitter: null },
    { x: -77.2, z: 38.6, color: '#20c997', rot: 0.12, sitter: { gender: 'm', hair: 'short', glasses: true, color: '#3b5bdb', top: 'short' } },
    { x: -70.8, z: 38.6, color: '#4dabf7', rot: -0.15, sitter: null },
    { x: -68.0, z: 37.5, color: '#9775fa', rot: -0.32, sitter: { gender: 'f', hair: 'pony', color: '#f06595', top: 'long' } },
    { x: -65.5, z: 35.5, color: '#ff922b', rot: -0.5, sitter: null },
    { x: -83.8, z: 31.0, color: '#38d9a9', rot: 0.85, sitter: null },
    { x: -64.2, z: 31.0, color: '#ff8787', rot: -0.85, sitter: { gender: 'm', hair: 'medium', color: '#495057', top: 'hoodie' } },
    { x: -81.5, z: 16.5, color: '#74c0fc', rot: 2.5, sitter: null },
    { x: -78.2, z: 14.8, color: '#fcc419', rot: 2.8, sitter: { gender: 'f', hair: 'short', color: '#20c997', top: 'short' } },
    { x: -69.8, z: 14.8, color: '#ff6b6b', rot: -2.8, sitter: null },
    { x: -66.5, z: 16.5, color: '#b197fc', rot: -2.5, sitter: null },
  ];
  for (const b of BEANBAGS) {
    const bag = createBeanbag(b.color, b.rot);
    bag.position.set(b.x, 0, b.z);
    root.add(bag);
    if (b.sitter) {
      const av = createAvatar(b.sitter);
      loungeOnBeanbag(av, b.x, b.z, b.rot);
      root.add(av);
    }
  }
  if (overlay) {
    overlay.add({
      cls: 'label cafe',
      text: '🛋️ 광장 빈백 힐링존',
      getPos: () => new THREE.Vector3(-74.0, 2.2, 37.0),
      maxDist: 110,
      minDist: 0,
    });
  }

  // 4) 빨간 우체통 3곳 (광장 산책로 입구 2곳 & 정자역 출입구 옆)
  const postSpots = [
    { x: -54.2, z: 38.5, ry: 1.45, label: true },
    { x: -53.5, z: -4.2, ry: 0.4, label: true },
    { x: (world?.signPos?.x ?? -6.6) - 3.2, z: (world?.signPos?.z ?? 6.4) + 2.4, ry: -0.6, label: false },
  ];
  postSpots.forEach((ps) => {
    const box = createPostboxMesh();
    box.position.set(ps.x, 0, ps.z);
    box.rotation.y = ps.ry;
    root.add(box);
    if (overlay && ps.label) {
      overlay.add({
        cls: 'label public',
        text: '📮 정자역 광장 우체통',
        getPos: () => new THREE.Vector3(ps.x, 2.1, ps.z),
        maxDist: 85,
        minDist: 0,
      });
    }
  });

  // 5) 광장 조경수 (풍성한 느티나무 + 원형 나무 벤치)
  const TREE_SPOTS = [
    [-90, 2, 1.1, true],
    [-90, 14, 1.2, false],
    [-90, 26, 1.12, true],
    [-89, 38, 1.2, false],
    [-89, 50, 1.08, true],
    [-89, 64, 1.15, false],
    [-57, 2, 1.1, true],
    [-57, 14, 1.2, false],
    [-57, 26, 1.08, true],
    [-57, 46, 1.15, false],
    [-57, 58, 1.1, true],
    [-57, 70, 1.15, false],
    [-82, -2, 0.95, false],
    [-66, -2, 0.95, false],
  ];
  for (const [tx, tz, sc, hasBench] of TREE_SPOTS) {
    root.add(createPlazaTree(tx, tz, sc, hasBench));
  }

  // 6) 비둘기 떼 (다가가면 "푸드득!" 하고 사방으로 날아오름)
  const pigeons = [];
  const PIGEON_CENTERS = [
    { x: -63.5, z: 40.5, count: 12 },
    { x: -75.0, z: 33.0, count: 10 },
    { x: -66.5, z: 19.5, count: 9 },
    { x: -81.0, z: 22.0, count: 8 },
    { x: -67.5, z: 6.5, count: 8 },
    { x: (world?.signPos?.x ?? -6.6) - 5.5, z: (world?.signPos?.z ?? 6.4) - 2.0, count: 6 },
  ];

  let pSeed = 77;
  const prnd = () => ((pSeed = (pSeed * 16807) % 2147483647) / 2147483647);

  for (const cluster of PIGEON_CENTERS) {
    for (let i = 0; i < cluster.count; i++) {
      const ang = prnd() * Math.PI * 2;
      const rad = 0.6 + prnd() * 3.8;
      const hx = cluster.x + Math.cos(ang) * rad;
      const hz = cluster.z + Math.sin(ang) * rad;
      const mesh = createPigeonMesh();
      mesh.position.set(hx, 0, hz);
      mesh.rotation.y = prnd() * Math.PI * 2;
      root.add(mesh);
      pigeons.push({
        mesh,
        homeX: hx,
        homeZ: hz,
        x: hx,
        z: hz,
        y: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        ry: mesh.rotation.y,
        state: 'ground', // 'ground' | 'takeoff' | 'glide'
        timer: prnd() * 4,
        phase: prnd() * 10,
        walkSpeed: 0,
      });
    }
  }

  let flockBubble = null;
  let flockAnchor = new THREE.Vector3(PLAZA_X + 5, 1.8, PLAZA_Z - 5);
  let bubbleCooldown = 0;
  if (overlay) {
    flockBubble = new Bubble(overlay, 'npc', () => flockAnchor);
  }

  function scarePigeon(p, fromX, fromZ) {
    let dx = p.x - fromX;
    let dz = p.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const spread = (prnd() - 0.5) * 1.1;
    const ca = Math.cos(spread), sa = Math.sin(spread);
    const fx = dx * ca - dz * sa;
    const fz = dx * sa + dz * ca;
    const spd = 6.5 + prnd() * 3.5;
    p.vx = fx * spd;
    p.vz = fz * spd;
    p.vy = 4.2 + prnd() * 2.6;
    p.ry = Math.atan2(p.vx, p.vz);
    p.state = 'takeoff';
    p.timer = 2.2 + prnd() * 1.6;
  }

  function update(dt, playerPos) {
    const t = performance.now() * 0.001;
    fountain.update(t);
    stage.update(dt, t);

    if (flockBubble) {
      flockBubble.tick();
      bubbleCooldown = Math.max(0, bubbleCooldown - dt);
    }

    let scaredCount = 0;
    let scareCenterX = 0;
    let scareCenterZ = 0;

    for (const p of pigeons) {
      const u = p.mesh.userData;
      p.phase += dt;

      if (p.state === 'ground') {
        // 플레이어가 5.2m 이내로 다가오면 후두두 날아오름
        if (playerPos) {
          const dist = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
          if (dist < 5.2) {
            scarePigeon(p, playerPos.x, playerPos.z);
            scaredCount++;
            scareCenterX += p.x;
            scareCenterZ += p.z;
            continue;
          }
        }

        // 땅 위에서 종종걸음 & 모이 쪼기
        p.timer -= dt;
        if (p.timer <= 0) {
          p.timer = 1.4 + prnd() * 2.8;
          if (prnd() < 0.55) {
            p.walkSpeed = 0.55 + prnd() * 0.45;
            const toHomeX = p.homeX - p.x;
            const toHomeZ = p.homeZ - p.z;
            if (Math.hypot(toHomeX, toHomeZ) > 5.5) {
              p.ry = Math.atan2(toHomeX, toHomeZ) + (prnd() - 0.5) * 0.6;
            } else {
              p.ry += (prnd() - 0.5) * 2.2;
            }
          } else {
            p.walkSpeed = 0;
          }
        }

        if (p.walkSpeed > 0) {
          p.x += Math.sin(p.ry) * p.walkSpeed * dt;
          p.z += Math.cos(p.ry) * p.walkSpeed * dt;
          u.rig.position.y = Math.abs(Math.sin(t * 14 + p.phase)) * 0.03;
          u.neckPivot.rotation.x = 0.15 + Math.sin(t * 14 + p.phase) * 0.18;
        } else {
          u.rig.position.y = 0;
          // 모이 쪼기 (콕콕)
          const peck = Math.max(0, Math.sin(t * 9 + p.phase * 3));
          u.neckPivot.rotation.x = peck > 0.6 ? 0.85 : 0.1;
        }
        u.wingL.rotation.z = 0;
        u.wingR.rotation.z = 0;
        p.y = 0;
      } else if (p.state === 'takeoff') {
        // 하늘로 급상승하며 날개 퍼덕임
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y += p.vy * dt;
        p.vy -= 1.8 * dt;
        p.timer -= dt;
        const flap = Math.sin(t * 42 + p.phase * 5) * 0.95;
        u.wingL.rotation.z = flap;
        u.wingR.rotation.z = -flap;
        u.neckPivot.rotation.x = -0.2;
        if (p.timer <= 0 || p.y > 7.5) {
          p.state = 'glide';
          p.timer = 2.5 + prnd() * 2.0;
        }
      } else if (p.state === 'glide') {
        // 원래 자리 근처로 선회하며 사뿐히 착륙
        const dx = p.homeX - p.x;
        const dz = p.homeZ - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        const targetRy = Math.atan2(dx, dz);
        p.ry += Math.atan2(Math.sin(targetRy - p.ry), Math.cos(targetRy - p.ry)) * Math.min(1, dt * 3.5);
        const spd = Math.min(5.2, Math.max(2.2, dist * 0.8));
        p.x += Math.sin(p.ry) * spd * dt;
        p.z += Math.cos(p.ry) * spd * dt;
        p.y = Math.max(0, p.y - 2.3 * dt);
        const flap = Math.sin(t * 28 + p.phase * 4) * 0.55;
        u.wingL.rotation.z = flap;
        u.wingR.rotation.z = -flap;
        if (p.y <= 0.02) {
          p.y = 0;
          p.state = 'ground';
          p.timer = 1.2 + prnd() * 2.0;
          p.walkSpeed = 0;
        }
      }

      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.rotation.y = p.ry;
    }

    // 한 마리가 놀라 날아오르면 주변 3.5m 동료 비둘기들도 연쇄적으로 후두두 날아오름
    if (scaredCount > 0 && playerPos) {
      const cx = scareCenterX / scaredCount;
      const cz = scareCenterZ / scaredCount;
      for (const p of pigeons) {
        if (p.state === 'ground' && Math.hypot(p.x - cx, p.z - cz) < 4.2) {
          scarePigeon(p, playerPos.x, playerPos.z);
        }
      }
      if (flockBubble && bubbleCooldown <= 0) {
        flockAnchor.set(cx, 2.2, cz);
        flockBubble.say('푸드득!! 🕊️🕊️', 2200);
        bubbleCooldown = 4.0;
      }
    }
  }

  function blocks(x, z) {
    // 분수대 수조 및 버스킹 무대 위로는 걸어 올라가지 않게 충돌 처리
    if (Math.hypot(x - fountain.x, z - fountain.z) < fountain.radius) return true;
    if (Math.abs(x - stage.x) < stage.hw && Math.abs(z - stage.z) < stage.hd) return true;
    return false;
  }

  return { update, blocks };
}
