// 우체국 옆 스타벅스 정자역 1층. 테이블을 채우고 손님은 앉히고, 바리스타는 제조대에서 내린다.
import * as THREE from 'three';
import { createAvatar } from '../entities/avatar.js';

const LOOKS = [
  { color: '#3d4c5c', pants: '#2c3e50', skin: '#f2d0b0', gender: 'm', face: 'round', hair: 'short', top: 'long' },
  { color: '#c4a484', pants: '#3d342c', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'long', top: 'long' },
  { color: '#5c6b7a', pants: '#3b4252', skin: '#e8c4a8', gender: 'f', face: 'square', hair: 'medium', glasses: true, top: 'long' },
  { color: '#d35400', pants: '#2d3436', skin: '#d7a888', gender: 'm', face: 'square', hair: 'short', top: 'short' },
  { color: '#6b4c7a', pants: '#2f3640', skin: '#f2d0b0', gender: 'f', face: 'long', hair: 'pony', top: 'hoodie' },
  { color: '#2c3e50', pants: '#1e272e', skin: '#c4926e', gender: 'm', face: 'long', hair: 'medium', beard: 'goatee', top: 'long' },
  { color: '#e8d5c4', pants: '#5c4a3a', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'long', top: 'long' },
  { color: '#345c7a', pants: '#243044', skin: '#e8c4a8', gender: 'm', face: 'round', hair: 'short', glasses: true, top: 'hoodie' },
  { color: '#a33b3b', pants: '#3b4252', skin: '#f2d0b0', gender: 'f', face: 'square', hair: 'short', top: 'short' },
  { color: '#4a5568', pants: '#2d3436', skin: '#d7a888', gender: 'm', face: 'square', hair: 'bald', top: 'long' },
];

const BARISTA_LOOKS = [
  { color: '#006241', hat: '#1e3932', pants: '#2d3436', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'short' },
  { color: '#1e3932', hat: '#006241', pants: '#243038', skin: '#e8c4a8', gender: 'm', face: 'square', hair: 'short', top: 'short' },
  { color: '#006241', pants: '#2c3338', skin: '#f2d0b0', gender: 'f', face: 'long', hair: 'long', top: 'long' },
  { color: '#16382c', hat: '#d7c4a3', pants: '#2d3436', skin: '#d7a888', gender: 'm', face: 'round', hair: 'medium', top: 'short' },
  { color: '#1e3932', pants: '#3b4252', skin: '#f6d7c3', gender: 'f', face: 'square', hair: 'medium', glasses: true, top: 'short' },
  { color: '#006241', hat: '#1e3932', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'long', hair: 'short', top: 'short' },
];

const DRINKS = ['#6f4e37', '#d7b899', '#f4efe6', '#c47a4a', '#efe6d6'];

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function sit(avatar, x, z, yaw, kind) {
  avatar.position.set(x, 0, z);
  avatar.rotation.y = yaw;
  const u = avatar.userData;
  const stool = kind === 'stool' || kind === 'stool-type';
  const typing = kind === 'type' || kind === 'stool-type';
  u.rig.position.y = stool ? -0.12 : -0.52;
  u.legL.position.y = stool ? 0.4 : 0.48;
  u.legR.position.y = stool ? 0.4 : 0.48;
  u.legL.position.z = stool ? 0.08 : 0.2;
  u.legR.position.z = stool ? 0.08 : 0.2;
  u.legL.rotation.x = stool ? -0.5 : -1.25;
  u.legR.rotation.x = stool ? -0.5 : -1.25;
  u.armL.rotation.x = stool ? -0.65 : -0.95;
  u.armR.rotation.x = stool ? -0.7 : -0.8;
  if (typing) {
    u.armL.rotation.x = -1.15;
    u.armR.rotation.x = -1.15;
    u.armL.rotation.z *= 0.35;
    u.armR.rotation.z *= 0.35;
    avatar.onBeforeRender = () => {
      const t = performance.now() * 0.001;
      u.armL.rotation.x = -1.15 + Math.sin(t * 6.2 + yaw) * 0.07;
      u.armR.rotation.x = -1.15 + Math.sin(t * 7.4 + 1.1) * 0.07;
    };
  }
}

function work(avatar, x, z, yaw, phase) {
  avatar.position.set(x, 0, z);
  avatar.rotation.y = yaw;
  const u = avatar.userData;
  u.armL.rotation.x = -0.55;
  u.armR.rotation.x = -0.9;
  avatar.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    u.armR.rotation.x = -0.7 + Math.sin(t * 2.4 + phase) * 0.45;
    u.armL.rotation.x = -0.35 + Math.sin(t * 1.7 + phase + 1.2) * 0.2;
  };
}

export function addStationCafeCrowd(scene, data) {
  const host = data.buildings.find((b) => b.n === '스타벅스 정자역');
  if (!host || host.crowd) return;
  host.crowd = 1;
  const g = new THREE.Group();
  scene.add(g);

  const wood = mat('#c4a07a');
  const woodDark = mat('#8b6848');
  const counterBody = mat('#1e3932');
  const counterTop = mat('#d7c4a3');
  const metal = mat('#3a3f44');
  const chairMat = mat('#2c3338');
  const cupGeo = new THREE.CylinderGeometry(0.045, 0.038, 0.09, 8);
  const drinkMats = DRINKS.map(mat);
  const alum = mat('#d5d8dc');
  const screenMat = mat('#1c2128');
  const legGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.68, 6);
  const chairSeat = new THREE.BoxGeometry(0.4, 0.06, 0.4);
  const chairBack = new THREE.BoxGeometry(0.4, 0.42, 0.05);
  const stoolSeat = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 10);
  const stoolPost = new THREE.CylinderGeometry(0.035, 0.04, 0.62, 6);
  let n = 0;
  const nextLook = (laptop) => {
    const look = { ...LOOKS[n++ % LOOKS.length] };
    if (laptop) look.glasses = true;
    return look;
  };

  const addCup = (x, y, z, i) => {
    const cup = new THREE.Mesh(cupGeo, drinkMats[Math.abs(i) % drinkMats.length]);
    cup.position.set(x, y, z);
    g.add(cup);
  };

  const addLaptop = (x, z, yaw, tableY) => {
    const kit = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.018, 0.22), alum);
    base.position.y = 0.01;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.012), screenMat);
    screen.position.set(0, 0.12, -0.09);
    screen.rotation.x = -0.42;
    kit.add(base, screen);
    kit.position.set(x, tableY, z);
    kit.rotation.y = yaw;
    g.add(kit);
  };

  const addChair = (x, z, yaw, kind) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (kind === 'stool') {
      const post = new THREE.Mesh(stoolPost, metal);
      const seat = new THREE.Mesh(stoolSeat, chairMat);
      post.position.set(x, 0.32, z);
      seat.position.set(x, 0.66, z);
      g.add(post, seat);
      return;
    }
    const seat = new THREE.Mesh(chairSeat, chairMat);
    const back = new THREE.Mesh(chairBack, chairMat);
    const bx = x - fx * 0.16, bz = z - fz * 0.16;
    seat.position.set(bx, 0.46, bz);
    back.position.set(bx - fx * 0.18, 0.72, bz - fz * 0.18);
    back.rotation.y = yaw;
    g.add(seat, back);
  };

  const addPerson = (look, x, z, yaw, pose, phase) => {
    const avatar = createAvatar(look);
    if (pose === 'work') work(avatar, x, z, yaw, phase);
    else sit(avatar, x, z, yaw, pose);
    g.add(avatar);
  };

  const toWorld = (x, z, rot, lx, lz) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  };

  const addLowTable = (x, z, rot, w, d) => {
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), wood);
    top.position.set(x, 0.74, z);
    top.rotation.y = rot;
    top.castShadow = top.receiveShadow = true;
    const leg = new THREE.Mesh(legGeo, woodDark);
    leg.position.set(x, 0.36, z);
    g.add(top, leg);
  };

  // 창가 카운터는 끊어서 두고, 한 명씩 바깥을 보게 앉힌다.
  const ledges = [
    { x: -149.3, z: -23.28, w: 2.7, seats: [-150.2, -148.4], laptops: [false, true] },
    { x: -146.15, z: -23.48, w: 1.55, seats: [-146.15], laptops: [true] },
    { x: -143.4, z: -23.22, w: 2.35, seats: [-144.15, -142.6], laptops: [false, false] },
    { x: -139.7, z: -23.5, w: 2.15, seats: [-140.25, -139.05], laptops: [true, false], empty: [false, true] },
  ];
  for (const ledge of ledges) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(ledge.w, 0.05, 0.36), counterTop);
    top.position.set(ledge.x, 1.02, ledge.z);
    g.add(top);
    ledge.seats.forEach((x, i) => {
      const yaw = 0.04 * (i % 2 ? 1 : -1);
      addChair(x, -23.95, yaw, 'stool');
      if (ledge.empty?.[i]) return;
      const laptop = ledge.laptops[i];
      addPerson(nextLook(laptop), x, -23.95, yaw, laptop ? 'stool-type' : 'stool');
      if (laptop) addLaptop(x, -23.42, yaw, 1.04);
      else addCup(x + 0.12, 1.1, -23.35, n);
    });
  }

  // 홀은 2인·4인·1인을 각도를 틀어 섞는다. seats/laptops 는 자리마다 사람·노트북 여부.
  const fours = [
    [-0.46, 0.72, -1], [0.46, 0.72, -1], [-0.46, -0.72, 1], [0.46, -0.72, 1],
  ];
  const twos = [
    [0.04, 0.64, -1], [-0.04, -0.64, 1],
  ];
  const floor = [
    { kind: 'four', x: -149.0, z: -27.35, rot: 0.42, seats: [1, 1, 1, 1], laptops: [0, 1, 0, 0] },
    { kind: 'two', x: -150.25, z: -30.7, rot: -0.55, seats: [1, 1], laptops: [1, 0] },
    { kind: 'one', x: -150.45, z: -33.35, rot: 0.95, laptop: 1 },
    { kind: 'two', x: -146.15, z: -26.7, rot: 0.85, seats: [1, 0], laptops: [1, 0] },
    { kind: 'four', x: -145.15, z: -29.95, rot: -0.28, seats: [1, 1, 1, 0], laptops: [0, 0, 1, 0] },
    { kind: 'two', x: -146.85, z: -32.95, rot: 0.18, seats: [1, 1], laptops: [0, 0] },
    { kind: 'one', x: -142.65, z: -26.25, rot: 2.35, laptop: 1 },
    { kind: 'two', x: -142.45, z: -29.25, rot: 1.12, seats: [1, 1], laptops: [0, 1] },
    { kind: 'one', x: -143.55, z: -32.25, rot: 0.45, laptop: 0 },
    { kind: 'one', x: -141.75, z: -33.2, rot: -2.7, laptop: 1 },
    { kind: 'four', x: -139.25, z: -27.15, rot: 0.62, seats: [1, 1, 1, 1], laptops: [1, 0, 0, 0] },
    { kind: 'two', x: -138.45, z: -30.55, rot: -0.72, seats: [1, 1], laptops: [0, 0] },
    { kind: 'one', x: -139.55, z: -33.35, rot: -0.35, laptop: 1 },
  ];
  for (const t of floor) {
    if (t.kind === 'one') {
      const yaw = t.rot;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const tx = t.x + fx * 0.55, tz = t.z + fz * 0.55;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), wood);
      top.position.set(tx, 0.62, tz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.58, 6), woodDark);
      leg.position.set(tx, 0.3, tz);
      g.add(top, leg);
      addChair(t.x, t.z, yaw);
      addPerson(nextLook(t.laptop), t.x, t.z, yaw, t.laptop ? 'type' : 'sit');
      if (t.laptop) addLaptop(tx, tz, yaw, 0.64);
      else addCup(tx, 0.68, tz, n);
      continue;
    }
    const wide = t.kind === 'four';
    addLowTable(t.x, t.z, t.rot, wide ? 1.3 : 0.72, wide ? 0.7 : 0.62);
    const spec = wide ? fours : twos;
    spec.forEach(([lx, lz, face], i) => {
      const [px, pz] = toWorld(t.x, t.z, t.rot, lx, lz);
      const yaw = face < 0 ? t.rot + Math.PI : t.rot;
      addChair(px, pz, yaw);
      if (!t.seats[i]) return;
      const laptop = !!t.laptops[i];
      addPerson(nextLook(laptop), px, pz, yaw, laptop ? 'type' : 'sit');
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const cx = px + fx * (laptop ? 0.36 : 0.28);
      const cz = pz + fz * (laptop ? 0.36 : 0.28);
      if (laptop) addLaptop(cx, cz, yaw, 0.76);
      else addCup(cx + fx * 0.02, 0.8, cz, n + i);
    });
  }

  const bar = new THREE.Mesh(new THREE.BoxGeometry(11.2, 1.02, 0.72), counterBody);
  bar.position.set(-144, 0.51, -36.15);
  bar.castShadow = bar.receiveShadow = true;
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(11.35, 0.06, 0.82), counterTop);
  barTop.position.set(-144, 1.04, -36.15);
  g.add(bar, barTop);

  const prep = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.9, 0.62), counterBody);
  prep.position.set(-145.2, 0.45, -38.55);
  const prepTop = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.05, 0.7), counterTop);
  prepTop.position.set(-145.2, 0.92, -38.55);
  g.add(prep, prepTop);

  const side = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 0.62), counterBody);
  side.position.set(-139.2, 0.45, -38.55);
  const sideTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.7), wood);
  sideTop.position.set(-139.2, 0.92, -38.55);
  g.add(side, sideTop);

  const machineXs = [-149.2, -146.8, -144.4, -142.0, -139.6];
  machineXs.forEach((x, i) => {
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.46, 0.4), metal);
    machine.position.set(x, 1.3, -36.15);
    machine.castShadow = true;
    const groupHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.16), mat('#1a1e22'));
    groupHead.position.set(x, 1.56, -36.05);
    g.add(machine, groupHead);
    addCup(x + 0.28, 1.12, -36.05, i);
    addPerson(BARISTA_LOOKS[i % BARISTA_LOOKS.length], x + (i % 2 ? 0.12 : -0.08), -37.2 - (i % 3) * 0.08, 0.08 * (i - 2), 'work', i * 1.3);
  });
  addPerson(BARISTA_LOOKS[5], -145.2, -38.15, Math.PI, 'work', 2.2);

  [[-148.7, -34.65, 2.9], [-146.1, -35.25, 3.3], [-143.4, -34.55, 2.7], [-140.2, -35.15, 3.05]].forEach(([x, z, yaw], i) => {
    addPerson(nextLook(false), x, z, yaw, 'work', i + 1);
    addCup(x + 0.15, 1.12, -35.9, n + i);
  });

  const bulb = new THREE.SphereGeometry(0.12, 8, 6);
  const glow = new THREE.MeshBasicMaterial({ color: '#ffe1a8' });
  for (const x of [-149, -145.5, -142, -138.8]) {
    const lamp = new THREE.Mesh(bulb, glow);
    lamp.position.set(x, 2.55, -28.2);
    g.add(lamp);
  }
}
