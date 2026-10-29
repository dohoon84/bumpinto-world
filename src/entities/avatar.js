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
  umbShaft: new THREE.CylinderGeometry(0.016, 0.016, 1.38, 8),
  umbHandle: new THREE.TorusGeometry(0.065, 0.018, 6, 12, Math.PI),
  umbFerrule: new THREE.ConeGeometry(0.028, 0.09, 8),
  umbRibHub: new THREE.CylinderGeometry(0.032, 0.032, 0.04, 8),
  cupBody: new THREE.CylinderGeometry(0.056, 0.042, 0.145, 10),
  cupSleeve: new THREE.CylinderGeometry(0.052, 0.047, 0.058, 10),
  cupLid: new THREE.CylinderGeometry(0.06, 0.058, 0.022, 10),
  cupDome: new THREE.SphereGeometry(0.056, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
  cupStraw: new THREE.CylinderGeometry(0.007, 0.007, 0.11, 6),
  lanyardStrap: new THREE.BoxGeometry(0.022, 0.28, 0.012),
  lanyardCard: new THREE.BoxGeometry(0.085, 0.11, 0.014),
  catBody: new THREE.CapsuleGeometry(0.15, 0.4, 4, 8),
  catHead: new THREE.SphereGeometry(0.15, 8, 6),
  catEar: new THREE.ConeGeometry(0.06, 0.12, 4),
  catTail: new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5),
  catLeg: new THREE.CylinderGeometry(0.04, 0.04, 0.2, 5),
  catPatch: new THREE.SphereGeometry(0.1, 7, 6),
  catStripe: new THREE.BoxGeometry(0.2, 0.03, 0.055),
  catEye: new THREE.SphereGeometry(0.026, 6, 5),
  catNose: new THREE.SphereGeometry(0.018, 5, 4),
};
const matCache = new Map();
const M = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };
const HAIR = '#2a211c';
const BEARD = '#4a3428';
const UMB_SEGMENTS = 8;
const umbWedgeGeos = Array.from({ length: UMB_SEGMENTS }, (_, i) => {
  const g = new THREE.SphereGeometry(
    0.84,
    3,
    6,
    (i * Math.PI * 2) / UMB_SEGMENTS,
    (Math.PI * 2) / UMB_SEGMENTS,
    0,
    Math.PI * 0.44,
  );
  g.scale(1, 0.56, 1);
  return g;
});

export const UMBRELLA_THEMES = [
  { id: 'yellow', label: '개나리 노란', color: '#ffd43b', stripeColor: '#fff3bf' },
  { id: 'red', label: '체리 레드', color: '#ff6b6b', stripeColor: '#ffe3e3' },
  { id: 'sky', label: '하늘 파란', color: '#339af0', stripeColor: '#d0ebff' },
  { id: 'mint', label: '에메랄드 민트', color: '#20c997', stripeColor: '#c3fae8' },
  { id: 'purple', label: '라벤더 보라', color: '#845ef7', stripeColor: '#e5dbff' },
  { id: 'pink', label: '코랄 핑크', color: '#f06595', stripeColor: '#ffdeeb' },
  { id: 'orange', label: '오렌지 선셋', color: '#ff922b', stripeColor: '#ffe8cc' },
  { id: 'navy', label: '클래식 네이비', color: '#1c7ed6', stripeColor: '#a5d8ff' },
];

export function resolveUmbrellaTheme(val) {
  if (!val) return UMBRELLA_THEMES[0];
  if (typeof val === 'object' && val.color) return val;
  const s = String(val).trim().toLowerCase();
  const found = UMBRELLA_THEMES.find((t) => t.id === s || t.color.toLowerCase() === s);
  if (found) return found;
  if (/^#[0-9a-f]{6}$/i.test(s)) return { id: s, label: '컬러', color: s, stripeColor: '#ffffff' };
  return UMBRELLA_THEMES[0];
}

export function createUmbrellaProp({ color = '#ffd43b', stripeColor = '#fff9db', cloneMaterials = false } = {}) {
  const g = new THREE.Group();
  const matOf = (c, extra = {}) => {
    if (cloneMaterials) return new THREE.MeshLambertMaterial({ color: c, ...extra });
    const key = `umb:${c}:${JSON.stringify(extra)}`;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color: c, ...extra }));
    return matCache.get(key);
  };

  // 중봉(기둥) — 손잡이 기준점(0,0,0)에서 위로 뻗음
  const shaft = new THREE.Mesh(geo.umbShaft, matOf('#d0d7de'));
  shaft.position.y = 0.65;
  g.add(shaft);

  // J자 손잡이
  const handle = new THREE.Mesh(geo.umbHandle, matOf('#5c3d2e'));
  handle.rotation.z = Math.PI;
  handle.position.set(-0.065, 0.0, 0);
  g.add(handle);

  // 우산갓 (8각 투톤 돔)
  const canopy = new THREE.Group();
  canopy.position.y = 1.05;
  const wedges = [];
  for (let i = 0; i < UMB_SEGMENTS; i++) {
    const col = i % 2 === 0 ? color : (stripeColor || color);
    const wedge = new THREE.Mesh(
      umbWedgeGeos[i],
      matOf(col, { side: THREE.DoubleSide }),
    );
    wedge.castShadow = true;
    canopy.add(wedge);
    wedges.push(wedge);
  }
  const ferrule = new THREE.Mesh(geo.umbFerrule, matOf('#f59f00'));
  ferrule.position.y = 0.50;
  const hub = new THREE.Mesh(geo.umbRibHub, matOf('#2d3436'));
  hub.position.y = 0.46;
  canopy.add(ferrule, hub);
  g.add(canopy);
  g.userData = { wedges, themeKey: `${color}|${stripeColor}` };

  return g;
}

export function applyUmbrellaTheme(umbGroup, themeOrVal) {
  if (!umbGroup?.userData?.wedges) return;
  const theme = resolveUmbrellaTheme(themeOrVal);
  const key = `${theme.color}|${theme.stripeColor || theme.color}`;
  if (umbGroup.userData.themeKey === key) return;
  umbGroup.userData.themeKey = key;
  const matOf = (c) => {
    const mKey = `umb:${c}:{"side":2}`;
    if (!matCache.has(mKey)) matCache.set(mKey, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    return matCache.get(mKey);
  };
  umbGroup.userData.wedges.forEach((w, i) => {
    const col = i % 2 === 0 ? theme.color : (theme.stripeColor || theme.color);
    w.material = matOf(col);
  });
}

function put(parent, mesh, x, y, z) { mesh.position.set(x, y, z); parent.add(mesh); return mesh; }

export function createCoffeeCupProp(kind = 'iced') {
  const g = new THREE.Group();
  const isHot = kind === 'hot' || kind === 'latte';
  const bodyColor = isHot ? '#f5efe6' : '#6b4423';
  const sleeveColor = isHot ? '#006241' : '#c49a6c';
  const cup = new THREE.Mesh(geo.cupBody, M(bodyColor));
  cup.position.y = 0.072;
  const sleeve = new THREE.Mesh(geo.cupSleeve, M(sleeveColor));
  sleeve.position.y = 0.068;
  g.add(cup, sleeve);
  if (isHot) {
    const lid = new THREE.Mesh(geo.cupLid, M('#2d3436'));
    lid.position.y = 0.15;
    g.add(lid);
  } else {
    const dome = new THREE.Mesh(geo.cupDome, M('#e9f2f7'));
    dome.position.y = 0.14;
    const straw = new THREE.Mesh(geo.cupStraw, M('#00704a'));
    straw.position.set(0.014, 0.185, 0.01);
    straw.rotation.z = -0.18;
    g.add(dome, straw);
  }
  return g;
}

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
  coffee = null, badge = null,
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

  if (badge) {
    const bz = (female ? 0.205 : 0.225) * (top === 'hoodie' ? 1.08 : 1);
    const strapMat = M( typeof badge === 'string' ? badge : '#03c75a');
    const sL = put(rig, new THREE.Mesh(geo.lanyardStrap, strapMat), -0.055, 1.18, bz);
    sL.rotation.z = -0.34;
    const sR = put(rig, new THREE.Mesh(geo.lanyardStrap, strapMat), 0.055, 1.18, bz);
    sR.rotation.z = 0.34;
    put(rig, new THREE.Mesh(geo.lanyardCard, M('#f8f9fa')), 0, 1.0, bz + 0.008);
  }

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

  const handUmbrella = createUmbrellaProp({ color: '#ffd43b', stripeColor: '#fff3bf' });
  handUmbrella.position.set(halfW * 0.62 + 0.09, 1.18, 0.24);
  handUmbrella.rotation.set(0.06, 0, -0.04);
  handUmbrella.visible = false;
  rig.add(handUmbrella);

  let handCoffee = null;
  if (coffee) {
    handCoffee = createCoffeeCupProp(coffee === true ? 'iced' : coffee);
    handCoffee.position.set(0.02, -0.68, 0.09);
    handCoffee.rotation.set(Math.PI * 0.46, 0, -0.18);
    armL.add(handCoffee);
  }

  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(scale);
  g.userData = {
    rig, legL, legR, armL, armR, phase: 0, head, eyeL, eyeR, handPhone, phoneOpen: false,
    handUmbrella, umbrella: false,
    handCoffee, coffee: coffee || false, coffeePhase: Math.random() * 20, chatting: false,
    eyeY: eyeL.position.y, eyeZ: eyeL.position.z, armLz: armL.rotation.z, armRz: armR.rotation.z,
    legLy: legL.position.y, legLz: legL.position.z,
    look: { gender, face, hair, glasses: !!glasses, top, color, skin },
  };
  return g;
}

const COAT_COLOR = {
  white: '#f4f1ea',
  black: '#171717',
  calico: '#f7f4ee',
  tuxedo: '#1b1b1b',
  mackerel: '#b7bcc4',
  cow: '#f7f7f5',
};

function catMark(rig, color, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo.catPatch, M(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  rig.add(m);
}

function addCatCoat(rig, coat) {
  const darkEyes = coat === 'black' || coat === 'tuxedo';
  for (const sx of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(geo.catEye, M(darkEyes ? '#d6de55' : '#2b241c'));
    eye.position.set(sx, 0.48, 0.43);
    rig.add(eye);
  }
  const nose = new THREE.Mesh(geo.catNose, M('#e8a0ad'));
  nose.position.set(0, 0.42, 0.445);
  rig.add(nose);
  if (coat === 'calico') {
    catMark(rig, '#e07a28', 0.08, 0.38, 0.06, 1.15, 0.7, 0.85);
    catMark(rig, '#1c1c1c', -0.09, 0.34, -0.08, 1.0, 0.62, 0.8);
    catMark(rig, '#e07a28', 0.07, 0.5, 0.34, 0.55, 0.45, 0.4);
    catMark(rig, '#1c1c1c', -0.06, 0.52, 0.36, 0.48, 0.4, 0.36);
  } else if (coat === 'tuxedo') {
    catMark(rig, '#f4f1ea', 0, 0.24, 0.2, 0.85, 0.55, 0.5);
    catMark(rig, '#f4f1ea', 0, 0.42, 0.4, 0.55, 0.38, 0.42);
    for (const [x, z] of [[-0.08, 0.17], [0.08, 0.17], [-0.08, -0.17], [0.08, -0.17]]) {
      catMark(rig, '#f4f1ea', x, 0.04, z, 0.42, 0.28, 0.42);
    }
  } else if (coat === 'mackerel') {
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(geo.catStripe, M('#343a42'));
      stripe.position.set(0, 0.44, -0.08 + i * 0.09);
      stripe.rotation.z = i % 2 ? 0.18 : -0.14;
      rig.add(stripe);
    }
    catMark(rig, '#343a42', 0, 0.56, 0.32, 0.35, 0.18, 0.22);
  } else if (coat === 'cow') {
    catMark(rig, '#1a1a1a', 0.1, 0.4, 0.02, 1.35, 0.85, 1.05);
    catMark(rig, '#1a1a1a', -0.08, 0.36, -0.14, 1.15, 0.7, 0.9);
    catMark(rig, '#1a1a1a', 0.04, 0.52, 0.34, 0.5, 0.4, 0.38);
  }
}

export function createCat({ color = '#f0a050', coat = null } = {}) {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const main = coat ? (COAT_COLOR[coat] || color) : color;
  const body = new THREE.Mesh(geo.catBody, M(main)); body.rotation.x = Math.PI / 2; body.position.y = 0.3;
  const head = new THREE.Mesh(geo.catHead, M(main)); head.position.set(0, 0.45, 0.3);
  const e1 = new THREE.Mesh(geo.catEar, M(main)), e2 = new THREE.Mesh(geo.catEar, M(main));
  e1.position.set(-0.08, 0.6, 0.3); e2.position.set(0.08, 0.6, 0.3);
  const legs = [[-0.08, 0.17], [0.08, 0.17], [-0.08, -0.17], [0.08, -0.17]].map(([x, z]) => {
    const l = new THREE.Mesh(geo.catLeg, M(main));
    l.position.set(x, 0.1, z);
    return l;
  });
  let tail = null;
  if (coat) {
    tail = new THREE.Group();
    tail.position.set(0, 0.45, -0.22);
    const tailMesh = new THREE.Mesh(geo.catTail, M(main));
    tailMesh.position.set(0, 0.08, -0.16);
    tailMesh.rotation.x = -0.6;
    tail.add(tailMesh);
    rig.add(body, head, e1, e2, tail, ...legs);
    addCatCoat(rig, coat);
    body.castShadow = true;
    head.castShadow = true;
  } else {
    const tailMesh = new THREE.Mesh(geo.catTail, M(main));
    tailMesh.position.set(0, 0.45, -0.38);
    tailMesh.rotation.x = -0.6;
    rig.add(body, head, e1, e2, tailMesh, ...legs);
    rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  g.userData = { rig, legL: legs[0], legR: legs[1], phase: 0, cat: true, tail, coat };
  return g;
}

// 걷기/점프/호들갑(이모트) 애니메이션
export function animateAvatar(a, speed, dt) {
  const u = a.userData;
  const jumpY = u.jumpY || 0;
  const jumping = jumpY > 0.02;
  const emote = u.emote || '';
  const sit = u.sit || '';
  const afk = !!u.afk;

  // 기본 회전/위치값 초기화
  u.rig.rotation.set(0, 0, 0);
  if (u.head) u.head.rotation.set(0, 0, 0);
  if (u.legL) {
    u.legL.rotation.set(0, 0, 0);
    u.legR.rotation.set(0, 0, 0);
    if (u.legLy != null) {
      u.legL.position.y = u.legLy; u.legL.position.z = u.legLz;
      u.legR.position.y = u.legLy; u.legR.position.z = u.legLz;
    }
  }
  if (u.armL) {
    u.armL.rotation.set(0, 0, u.armLz ?? 0);
    u.armR.rotation.set(0, 0, u.armRz ?? 0);
  }
  const hasUmb = !!u.umbrella && !u.cat;
  if (u.handUmbrella) {
    u.handUmbrella.visible = hasUmb;
    if (hasUmb) applyUmbrellaTheme(u.handUmbrella, u.umbrella);
  }
  const hasCoffee = !!u.coffee && !u.cat && !u.phoneOpen && !emote && !sit && !afk;
  if (hasCoffee && !u.handCoffee && u.armL) {
    const cup = createCoffeeCupProp(u.coffee === true ? 'iced' : u.coffee);
    cup.position.set(0.02, -0.68, 0.09);
    cup.rotation.set(Math.PI * 0.46, 0, -0.18);
    u.armL.add(cup);
    u.handCoffee = cup;
  }
  if (u.handCoffee) u.handCoffee.visible = hasCoffee;

  // 앉기 / 자동 대기모드(자리비움) 포즈
  if ((sit || afk) && !jumping && !u.cat) {
    u.sitT = (u.sitT || 0) + dt;
    const t = u.sitT;
    if (u.handPhone) u.handPhone.visible = false;

    if (sit === 'beanbag') {
      // 🛋️ 빈백에 푹 기대어 눕듯이 앉기 (다리·발이 지면 위로 자연스럽게 올라오도록 보정)
      u.rig.position.y = -0.46;
      u.rig.rotation.x = -0.24;
      u.legL.position.y = 0.62; u.legL.position.z = 0.28;
      u.legR.position.y = 0.62; u.legR.position.z = 0.28;
      u.legL.rotation.x = -1.35;
      u.legR.rotation.x = -1.30;
      u.armL.rotation.x = -0.55;
      u.armR.rotation.x = hasUmb ? -1.15 : -0.65;
    } else if (sit === 'bench' || sit === 'ledge') {
      // 🪑 벤치(높이 0.44m) / ⛲ 분수대 턱(높이 0.58m)에 걸터앉기
      u.rig.position.y = sit === 'ledge' ? -0.14 : -0.26;
      u.legL.position.y = 0.52; u.legL.position.z = 0.24;
      u.legR.position.y = 0.52; u.legR.position.z = 0.24;
      u.legL.rotation.x = -1.15 + Math.sin(t * 2.2) * 0.08;
      u.legR.rotation.x = -1.15 - Math.sin(t * 2.2) * 0.08;
      u.armL.rotation.x = -0.65;
      u.armR.rotation.x = hasUmb ? -1.18 : -0.65;
    } else {
      // 🧘 길바닥에 철푸덕 앉기 (다리가 수평으로 지면 위에 얹혀 땅속으로 묻히지 않게 보정)
      u.rig.position.y = -0.54;
      u.legL.position.y = 0.66; u.legL.position.z = 0.28;
      u.legR.position.y = 0.66; u.legR.position.z = 0.28;
      u.legL.rotation.x = -Math.PI / 2;
      u.legR.rotation.x = -Math.PI / 2;
      u.legL.rotation.y = -0.18;
      u.legR.rotation.y = 0.18;
      u.armL.rotation.x = -0.72;
      u.armR.rotation.x = hasUmb ? -1.18 : -0.72;
      u.armL.rotation.z = (u.armLz ?? -0.28) * 0.6;
      u.armR.rotation.z = hasUmb ? 0.14 : (u.armRz ?? 0.28) * 0.6;
    }

    if (afk) {
      // 💤 대기모드: 고개를 꾸벅꾸벅 숙이며 졸기
      const nod = 0.36 + Math.sin(t * 2.1) * 0.18;
      if (u.head) {
        u.head.rotation.x = nod;
        u.head.rotation.z = Math.sin(t * 1.05) * 0.1;
      }
      if (u.eyeL) {
        u.eyeL.position.y = u.eyeY - 0.04;
        u.eyeR.position.y = u.eyeY - 0.04;
        u.eyeL.position.z = u.eyeZ + 0.02;
        u.eyeR.position.z = u.eyeZ + 0.02;
      }
    } else if (u.eyeL) {
      u.eyeL.position.y = u.eyeY;
      u.eyeR.position.y = u.eyeY;
      u.eyeL.position.z = u.eyeZ;
      u.eyeR.position.z = u.eyeZ;
    }
    return;
  }
  u.sitT = 0;

  if (emote && !u.cat) {
    u.emoteT = (u.emoteT || 0) + dt;
    const t = u.emoteT;
    if (u.handPhone) u.handPhone.visible = false;
    if (u.eyeL) {
      u.eyeL.position.y = u.eyeY; u.eyeR.position.y = u.eyeY;
      u.eyeL.position.z = u.eyeZ; u.eyeR.position.z = u.eyeZ;
    }
    let emoteHop = 0;
    u.rig.rotation.x = 0;
    u.rig.rotation.y = 0;
    u.rig.rotation.z = 0;
    if (u.head) {
      u.head.rotation.x = 0;
      u.head.rotation.y = 0;
      u.head.rotation.z = 0;
    }
    if (u.legL) {
      u.legL.rotation.z = 0;
      u.legR.rotation.z = 0;
    }
    if (emote === 'cheer') {
      // 🙌 만세: 양팔 번쩍 들고 폴짝폴짝 환호
      emoteHop = Math.abs(Math.sin(t * 9.5)) * 0.22;
      u.armL.rotation.x = -2.85 + Math.sin(t * 14) * 0.25;
      u.armR.rotation.x = -2.85 - Math.sin(t * 14) * 0.25;
      u.armL.rotation.z = -0.35 + Math.cos(t * 14) * 0.15;
      u.armR.rotation.z = 0.35 - Math.cos(t * 14) * 0.15;
      u.legL.rotation.x = Math.sin(t * 9.5) * 0.35;
      u.legR.rotation.x = -Math.sin(t * 9.5) * 0.35;
      u.rig.rotation.y = Math.sin(t * 6) * 0.18;
    } else if (emote === 'fuss') {
      // 🤪 호들갑(오두방정): 초고속으로 양팔 파닥거리며 온몸 좌우 흔들기
      emoteHop = Math.abs(Math.sin(t * 18)) * 0.16;
      u.rig.rotation.z = Math.sin(t * 20) * 0.18;
      u.rig.rotation.y = Math.cos(t * 15) * 0.28;
      u.armL.rotation.x = -2.1 + Math.sin(t * 28) * 0.85;
      u.armR.rotation.x = -2.1 - Math.sin(t * 28) * 0.85;
      u.armL.rotation.z = -0.85 + Math.cos(t * 24) * 0.45;
      u.armR.rotation.z = 0.85 - Math.cos(t * 24) * 0.45;
      u.legL.rotation.x = Math.sin(t * 24) * 0.65;
      u.legR.rotation.x = -Math.sin(t * 24) * 0.65;
      if (u.head) u.head.rotation.z = Math.sin(t * 22) * 0.25;
    } else if (emote === 'dance') {
      // 💃 댄스: 리듬 바운스 + 트위스트 춤
      emoteHop = Math.abs(Math.sin(t * 8.5)) * 0.14;
      u.rig.rotation.y = Math.sin(t * 4.25) * 0.45;
      u.rig.rotation.z = Math.cos(t * 8.5) * 0.12;
      u.armL.rotation.x = -1.6 + Math.sin(t * 8.5) * 0.75;
      u.armR.rotation.x = -1.6 - Math.sin(t * 8.5) * 0.75;
      u.armL.rotation.z = -0.55 + Math.cos(t * 8.5) * 0.35;
      u.armR.rotation.z = 0.55 + Math.cos(t * 8.5) * 0.35;
      u.legL.rotation.x = Math.sin(t * 8.5) * 0.45;
      u.legR.rotation.x = -Math.sin(t * 8.5) * 0.45;
      u.legL.rotation.z = -0.12;
      u.legR.rotation.z = 0.12;
    } else if (emote === 'clap') {
      // 👏 물개박수: 양손 가슴 앞에서 초고속 박수
      emoteHop = Math.abs(Math.sin(t * 11)) * 0.08;
      const clapWave = Math.abs(Math.sin(t * 22));
      u.armL.rotation.x = -1.45;
      u.armR.rotation.x = -1.45;
      u.armL.rotation.z = 0.25 + clapWave * 0.52;
      u.armR.rotation.z = -0.25 - clapWave * 0.52;
      u.rig.rotation.x = Math.sin(t * 11) * 0.08;
    } else if (emote === 'love') {
      // ❤️ 머리 위 하트 + 좌우 스웨이
      emoteHop = Math.abs(Math.sin(t * 7)) * 0.14;
      u.armL.rotation.x = -2.95;
      u.armR.rotation.x = -2.95;
      u.armL.rotation.z = 0.48;
      u.armR.rotation.z = -0.48;
      u.rig.rotation.z = Math.sin(t * 7) * 0.14;
      if (u.head) u.head.rotation.z = -Math.sin(t * 7) * 0.12;
    } else if (emote === 'lol') {
      // 🤣 대폭소: 몸을 뒤로 젖히며 배 잡고 박장대소
      emoteHop = Math.abs(Math.sin(t * 14)) * 0.1;
      u.rig.rotation.x = -0.22 + Math.sin(t * 18) * 0.12;
      u.rig.rotation.z = Math.sin(t * 12) * 0.1;
      u.armL.rotation.x = -1.1 + Math.sin(t * 20) * 0.25;
      u.armR.rotation.x = -1.1 - Math.sin(t * 20) * 0.25;
      u.armL.rotation.z = 0.45;
      u.armR.rotation.z = -0.45;
      u.legL.rotation.x = Math.sin(t * 20) * 0.5;
      u.legR.rotation.x = -Math.sin(t * 20) * 0.5;
      if (u.head) u.head.rotation.x = -0.35 + Math.sin(t * 20) * 0.18;
    } else if (emote === 'cry') {
      // 😢 눈물: 고개 숙이고 양손으로 눈을 훔치며 어깨를 들썩임
      const sob = Math.sin(t * 7);
      u.rig.rotation.x = 0.22;
      u.rig.rotation.z = sob * 0.04;
      u.armL.rotation.x = -1.15;
      u.armR.rotation.x = -1.15;
      u.armL.rotation.z = 0.55 + Math.abs(sob) * 0.08;
      u.armR.rotation.z = -0.55 - Math.abs(sob) * 0.08;
      u.legL.rotation.x = 0.12;
      u.legR.rotation.x = 0.12;
      if (u.head) u.head.rotation.x = 0.42 + sob * 0.06;
    } else if (emote === 'wail') {
      // 😭 엉엉: 얼굴을 감싸고 몸을 크게 들썩임
      emoteHop = Math.abs(Math.sin(t * 9)) * 0.06;
      const sob = Math.sin(t * 14);
      u.rig.rotation.x = 0.35 + Math.abs(sob) * 0.08;
      u.rig.rotation.z = sob * 0.1;
      u.armL.rotation.x = -1.35 + sob * 0.15;
      u.armR.rotation.x = -1.35 - sob * 0.15;
      u.armL.rotation.z = 0.72;
      u.armR.rotation.z = -0.72;
      u.legL.rotation.x = 0.28 + Math.abs(sob) * 0.12;
      u.legR.rotation.x = 0.22;
      if (u.head) {
        u.head.rotation.x = 0.55;
        u.head.rotation.z = sob * 0.16;
      }
    } else if (emote === 'pout') {
      // 🥺 서운: 고개 갸웃하고 손을 모은 채 천천히 흔들기
      const sway = Math.sin(t * 2.4);
      u.rig.rotation.z = sway * 0.06;
      u.rig.rotation.y = sway * 0.12;
      u.armL.rotation.x = -0.85;
      u.armR.rotation.x = -0.85;
      u.armL.rotation.z = 0.35;
      u.armR.rotation.z = -0.35;
      u.legL.rotation.x = 0.05;
      u.legR.rotation.x = 0.05;
      if (u.head) {
        u.head.rotation.x = -0.12;
        u.head.rotation.z = sway * 0.18;
      }
    }
    u.rig.position.y = emoteHop + jumpY;
    return;
  }
  u.emoteT = 0;

  if (speed > 0.05 && !jumping) u.phase += dt * (4 + speed * 2.2);
  else if (!jumping) u.phase *= 0.85;
  const s = Math.sin(u.phase) * Math.min(1, speed / 2);
  if (u.legL) {
    if (jumping) {
      u.legL.rotation.x = -0.42;
      u.legR.rotation.x = 0.28;
    } else {
      u.legL.rotation.x = s * 0.7;
      u.legR.rotation.x = -s * 0.7;
    }
  }
  if (u.phoneOpen && u.handPhone && !jumping) {
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
    if (jumping) {
      u.armL.rotation.x = -0.65; u.armR.rotation.x = hasUmb ? -1.35 : -0.65;
      u.armL.rotation.z = u.armLz - 0.38; u.armR.rotation.z = hasUmb ? 0.14 : (u.armRz + 0.38);
      if (u.head) u.head.rotation.x = 0;
    } else if (u.chatting && speed <= 0.08) {
      u.coffeePhase = (u.coffeePhase || 0) + dt;
      const ct = u.coffeePhase;
      const sip = hasCoffee ? Math.max(0, Math.sin(ct * 0.72) - 0.65) / 0.35 : 0;
      u.armL.rotation.x = hasCoffee ? (-1.02 - sip * 0.56 + Math.sin(ct * 2.4) * 0.06) : (-0.42 + Math.sin(ct * 3.1) * 0.25);
      u.armL.rotation.z = hasCoffee ? (0.16 + sip * 0.22) : (u.armLz - Math.abs(Math.cos(ct * 2.3)) * 0.18);
      u.armR.rotation.x = hasUmb ? -1.22 : (-0.52 + Math.sin(ct * 3.6 + 1.2) * 0.32);
      u.armR.rotation.z = hasUmb ? 0.14 : (u.armRz + Math.cos(ct * 2.8) * 0.16);
      if (u.head) {
        u.head.rotation.x = sip > 0.1 ? (-0.16 * sip) : (Math.sin(ct * 3.4) * 0.09);
        u.head.rotation.y = Math.sin(ct * 1.6) * 0.18;
      }
      u.rig.rotation.y = Math.sin(ct * 1.1) * 0.07;
    } else {
      u.coffeePhase = (u.coffeePhase || 0) + dt;
      const ct = u.coffeePhase;
      const sip = hasCoffee ? Math.max(0, Math.sin(ct * 0.62) - 0.75) / 0.25 : 0;
      u.armL.rotation.x = hasCoffee ? (-0.96 - sip * 0.54 + s * 0.18) : (-s * 0.8);
      u.armR.rotation.x = hasUmb ? (-1.22 + s * 0.12) : (s * 0.8);
      u.armL.rotation.z = hasCoffee ? (0.15 + sip * 0.2) : u.armLz;
      u.armR.rotation.z = hasUmb ? 0.14 : u.armRz;
      if (u.head) u.head.rotation.x = sip > 0.1 ? (-0.14 * sip) : 0;
    }
    if (u.eyeL) {
      u.eyeL.position.y = u.eyeY; u.eyeR.position.y = u.eyeY;
      u.eyeL.position.z = u.eyeZ; u.eyeR.position.z = u.eyeZ;
    }
  }
  const walkBob = jumping ? 0 : Math.abs(Math.sin(u.phase)) * 0.06 * Math.min(1, speed / 2);
  u.rig.position.y = walkBob + jumpY;
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
  if (u.handUmbrella) u.handUmbrella.visible = false;
  if (u.handCoffee) u.handCoffee.visible = false;
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
