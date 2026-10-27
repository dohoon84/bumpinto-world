// 로우폴리 아바타 (플레이어 / NPC / 원격 플레이어 공용)
import * as THREE from 'three';

const geo = {
  body: new THREE.CapsuleGeometry(0.22, 0.62, 4, 8),
  head: new THREE.SphereGeometry(0.26, 10, 8),
  headBox: new THREE.BoxGeometry(0.46, 0.5, 0.42),
  leg: new THREE.CapsuleGeometry(0.11, 0.42, 2, 6),
  arm: new THREE.CapsuleGeometry(0.065, 0.46, 2, 6),
  sleeveShort: new THREE.CylinderGeometry(0.11, 0.08, 0.34, 8),
  sleeveLong: new THREE.CylinderGeometry(0.1, 0.08, 0.5, 8),
  eye: new THREE.SphereGeometry(0.04, 6, 4),
  hat: new THREE.CylinderGeometry(0.28, 0.3, 0.14, 10),
  bag: new THREE.BoxGeometry(0.4, 0.45, 0.18),
  hairCap: new THREE.SphereGeometry(0.28, 10, 8),
  hairLock: new THREE.CapsuleGeometry(0.055, 0.32, 2, 5),
  hood: new THREE.SphereGeometry(0.33, 10, 8),
  pocket: new THREE.BoxGeometry(0.28, 0.16, 0.06),
  phone: new THREE.BoxGeometry(0.16, 0.27, 0.014),
  phoneScreen: new THREE.BoxGeometry(0.138, 0.24, 0.004),
  shoulder: new THREE.SphereGeometry(0.1, 8, 6),
  glass: new THREE.TorusGeometry(0.065, 0.012, 6, 12),
  bridge: new THREE.BoxGeometry(0.08, 0.018, 0.018),
  mustache: new THREE.BoxGeometry(0.18, 0.045, 0.08),
  sideburn: new THREE.CapsuleGeometry(0.04, 0.2, 2, 6),
  cheekBeard: new THREE.BoxGeometry(0.12, 0.05, 0.055),
  chinBeard: new THREE.BoxGeometry(0.26, 0.08, 0.1),
};
const matCache = new Map();
const M = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };
const HAIR = '#2a211c';
const BEARD = '#4a3428';

function put(parent, mesh, x, y, z) { mesh.position.set(x, y, z); parent.add(mesh); return mesh; }

function addHair(rig, hair) {
  if (!hair || hair === 'bald') return;
  const cap = new THREE.Mesh(geo.hairCap, M(HAIR));
  if (hair === 'short' || hair === 'pony') { cap.position.y = 1.78; cap.scale.set(1.02, 0.52, 1.02); }
  else { cap.position.y = 1.73; cap.scale.set(1.12, 0.7, 1.08); }
  rig.add(cap);
  if (hair === 'long') {
    const L = new THREE.Mesh(geo.hairLock, M(HAIR)), R = L.clone();
    put(rig, L, -0.18, 1.4, 0.02); put(rig, R, 0.18, 1.4, 0.02);
  }
  if (hair === 'pony') {
    const tail = new THREE.Mesh(geo.hairLock, M(HAIR));
    tail.position.set(0, 1.46, -0.24); tail.rotation.x = 0.6; rig.add(tail);
  }
}

// 짧은 수염은 콧수염만. 풀수염은 구렛나루-볼-턱-콧수염이 한 덩어리로 이어진다.
function addBeard(head, beard, face) {
  if (beard !== 'goatee' && beard !== 'full') return;
  const square = face === 'square';
  const lipY = square ? -0.09 : -0.07;
  const front = square ? 0.2 : 0.22;
  const stash = new THREE.Mesh(geo.mustache, M(BEARD));
  stash.position.set(0, lipY, front);
  head.add(stash);
  if (beard !== 'full') return;
  const side = square ? 0.16 : 0.17;
  const jawY = square ? -0.16 : -0.135;
  const chin = new THREE.Mesh(geo.chinBeard, M(BEARD));
  chin.position.set(0, jawY, square ? 0.16 : 0.175);
  head.add(chin);
  for (const s of [-1, 1]) {
    const burn = new THREE.Mesh(geo.sideburn, M(BEARD));
    // 귀 앞에서 시작해 콧수염까지 내려오게 앞으로 빼 둔다.
    burn.position.set(s * side, 0.0, square ? 0.14 : 0.16);
    head.add(burn);
    const cheek = new THREE.Mesh(geo.cheekBeard, M(BEARD));
    cheek.position.set(s * side * 0.7, lipY - 0.02, square ? 0.17 : 0.19);
    head.add(cheek);
  }
}

function addArm(rig, side, halfW, look) {
  const pivot = new THREE.Group();
  // 어깨 중심을 몸통 안에 두고 소매가 그 자리에서 나오게 한다.
  pivot.position.set(side * halfW * 0.62, 1.3, 0);
  pivot.rotation.z = side * 0.28;
  const joint = new THREE.Mesh(geo.shoulder, M(look.color));
  joint.scale.set(1.7, 1.15, 1.45);
  const skin = new THREE.Mesh(geo.arm, M(look.skin));
  skin.position.y = -0.46;
  const sleeve = new THREE.Mesh(look.top === 'short' ? geo.sleeveShort : geo.sleeveLong, M(look.color));
  sleeve.position.y = look.top === 'short' ? -0.16 : -0.22;
  pivot.add(joint, sleeve, skin);
  rig.add(pivot);
  return pivot;
}

export function createAvatar({
  color = '#4f7cff', skin = '#f2d0b0', hat = null, pants = '#3b4252', bag = null, scale = 1,
  gender = 'm', face = 'round', hair = null, glasses = false, beard = 'none', top = 'long',
} = {}) {
  const look = { color, skin, top };
  const female = gender === 'f';
  const g = new THREE.Group();
  const rig = new THREE.Group(); g.add(rig);

  const body = new THREE.Mesh(geo.body, M(color));
  body.position.y = 1.02;
  body.scale.set(female ? 0.9 : 1.08, 1, female ? 0.92 : 1.02);
  if (top === 'hoodie') { body.scale.x *= 1.06; body.scale.z *= 1.1; }
  rig.add(body);

  const head = new THREE.Mesh(face === 'square' ? geo.headBox : geo.head, M(skin));
  head.position.y = 1.6;
  if (face === 'long') head.scale.set(0.86, 1.2, 0.96);
  if (female) head.scale.multiplyScalar(0.94);
  rig.add(head);

  const eyeY = face === 'square' ? 1.64 : 1.66, eyeZ = face === 'square' ? 0.24 : 0.22;
  const eyeL = put(rig, new THREE.Mesh(geo.eye, M('#222')), -0.09, eyeY, eyeZ);
  const eyeR = put(rig, eyeL.clone(), 0.09, eyeY, eyeZ);

  if (glasses) {
    const rL = put(rig, new THREE.Mesh(geo.glass, M('#243044')), -0.09, eyeY, eyeZ + 0.04);
    put(rig, rL.clone(), 0.09, eyeY, eyeZ + 0.04);
    put(rig, new THREE.Mesh(geo.bridge, M('#243044')), 0, eyeY, eyeZ + 0.04);
  }
  addBeard(head, beard, face);

  addHair(rig, hair);
  if (top === 'hoodie') {
    const hood = new THREE.Mesh(geo.hood, M(color));
    hood.position.set(0, 1.66, -0.1); hood.scale.set(1.02, 0.92, 0.58);
    rig.add(hood);
    put(rig, new THREE.Mesh(geo.pocket, M(color)), 0, 0.92, 0.22);
  }
  if (hat) { const h = new THREE.Mesh(geo.hat, M(hat)); h.position.y = hair && hair !== 'bald' ? 1.96 : 1.86; rig.add(h); }
  if (bag) put(rig, new THREE.Mesh(geo.bag, M(bag)), 0, 1.02, -0.34);

  const hip = female ? 0.11 : 0.14;
  const legL = put(rig, new THREE.Mesh(geo.leg, M(pants)), -hip, 0.36, 0);
  const legR = put(rig, legL.clone(), hip, 0.36, 0);
  const halfW = 0.22 * body.scale.x;
  const armL = addArm(rig, -1, halfW, look);
  const armR = addArm(rig, 1, halfW, look);
  const handPhone = new THREE.Group();
  const slab = new THREE.Mesh(geo.phone, M('#1c1c1e'));
  const screen = new THREE.Mesh(geo.phoneScreen, M('#d5ecff'));
  screen.position.z = -0.008;
  handPhone.add(slab, screen);
  handPhone.position.set(0, 1.32, 0.42);
  handPhone.rotation.x = -0.95;
  handPhone.visible = false;
  rig.add(handPhone);

  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(scale);
  g.userData = {
    rig, legL, legR, armL, armR, phase: 0, head, eyeL, eyeR, handPhone, phoneOpen: false,
    eyeY: eyeL.position.y, eyeZ: eyeL.position.z, armLz: armL.rotation.z, armRz: armR.rotation.z,
  };
  return g;
}

export function createCat({ color = '#f0a050' } = {}) {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.4, 4, 8), M(color)); body.rotation.x = Math.PI / 2; body.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), M(color)); head.position.set(0, 0.45, 0.3);
  const earG = new THREE.ConeGeometry(0.06, 0.12, 4);
  const e1 = new THREE.Mesh(earG, M(color)), e2 = e1.clone(); e1.position.set(-0.08, 0.6, 0.3); e2.position.set(0.08, 0.6, 0.3);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), M(color)); tail.position.set(0, 0.45, -0.38); tail.rotation.x = -0.6;
  const legG = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 5);
  const legs = [[-0.08, 0.17], [0.08, 0.17], [-0.08, -0.17], [0.08, -0.17]].map(([x, z]) => { const l = new THREE.Mesh(legG, M(color)); l.position.set(x, 0.1, z); return l; });
  rig.add(body, head, e1, e2, tail, ...legs);
  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { rig, legL: legs[0], legR: legs[1], phase: 0, cat: true };
  return g;
}

// 걷기 애니메이션: speed(m/s) 에 따라 팔다리를 엇갈려 흔들고 살짝 통통
export function animateAvatar(a, speed, dt) {
  const u = a.userData;
  if (speed > 0.05) u.phase += dt * (4 + speed * 2.2); else u.phase *= 0.85;
  const s = Math.sin(u.phase) * Math.min(1, speed / 2);
  if (u.legL) { u.legL.rotation.x = s * 0.7; u.legR.rotation.x = -s * 0.7; }
  if (u.phoneOpen && u.handPhone) {
    u.handPhone.visible = true;
    u.armL.rotation.x = -1.42; u.armR.rotation.x = -1.42;
    u.armL.rotation.z = 0.72; u.armR.rotation.z = -0.72;
    if (u.head) u.head.rotation.x = 0.55;
    if (u.eyeL) {
      u.eyeL.position.y = u.eyeY - 0.035; u.eyeR.position.y = u.eyeY - 0.035;
      u.eyeL.position.z = u.eyeZ + 0.03; u.eyeR.position.z = u.eyeZ + 0.03;
    }
  } else if (u.armL) {
    if (u.handPhone) u.handPhone.visible = false;
    u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
    u.armL.rotation.z = u.armLz; u.armR.rotation.z = u.armRz;
    if (u.head) u.head.rotation.x = 0;
    if (u.eyeL) {
      u.eyeL.position.y = u.eyeY; u.eyeR.position.y = u.eyeY;
      u.eyeL.position.z = u.eyeZ; u.eyeR.position.z = u.eyeZ;
    }
  }
  u.rig.position.y = Math.abs(Math.sin(u.phase)) * 0.06 * Math.min(1, speed / 2);
}

// 안장에 앉은 자세. 팔은 핸들 쪽(+Z), 다리는 페달 방향으로 구부리고 굴린다.
export function animateRide(a, speed, dt) {
  const u = a.userData;
  if (!u.legL || !u.armL) return;
  if (!u.rideBase) {
    u.rideBase = {
      ly: u.legL.position.y, lz: u.legL.position.z, ry: u.legR.position.y, rz: u.legR.position.z,
      alz: u.armLz ?? u.armL.rotation.z, arz: u.armRz ?? u.armR.rotation.z,
    };
  }
  const b = u.rideBase;
  if (speed > 0.3) u.phase += dt * (8 + speed * 0.6);
  const s = speed > 0.3 ? Math.sin(u.phase) : 0;
  u.legL.position.y = b.ly + 0.04; u.legR.position.y = b.ry + 0.04;
  u.legL.position.z = b.lz + 0.14; u.legR.position.z = b.rz + 0.14;
  u.legL.rotation.x = -1.05 + s * 0.7;
  u.legR.rotation.x = -1.05 - s * 0.7;
  u.armL.rotation.x = -1.15; u.armR.rotation.x = -1.15;
  u.armL.rotation.z = b.alz * 0.45; u.armR.rotation.z = b.arz * 0.45;
  if (u.handPhone) u.handPhone.visible = false;
  if (u.head) u.head.rotation.x = 0;
  if (u.eyeL && u.eyeY != null) {
    u.eyeL.position.y = u.eyeY; u.eyeR.position.y = u.eyeY;
    u.eyeL.position.z = u.eyeZ; u.eyeR.position.z = u.eyeZ;
  }
  u.rig.position.y = -0.06;
}

export function clearRidePose(a) {
  const u = a.userData, b = u.rideBase;
  if (!b || !u.legL) return;
  u.legL.position.y = b.ly; u.legL.position.z = b.lz;
  u.legR.position.y = b.ry; u.legR.position.z = b.rz;
  u.legL.rotation.x = u.legR.rotation.x = 0;
  u.armL.rotation.x = u.armR.rotation.x = 0;
  u.armL.rotation.z = b.alz; u.armR.rotation.z = b.arz;
  u.rig.position.y = 0;
  u.phase = 0;
}
