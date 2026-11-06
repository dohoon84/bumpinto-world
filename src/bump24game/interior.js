// [bump24game] BUMP24 매장 내부 전용 Scene. 도시와 분리. 레퍼런스 사진 기준.
import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import {
  CATALOG, BY_ID, SHAPES, buildProductAtlas, buildShapeGeometries,
  planLayout, scoreOf,
} from './products.js';
import { createBasketController, createBasketMesh } from './basket.js';

export const STORE = { W: 11.2, D: 7.6, H: 3.05 }; // 내부 크기 (m)
const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...opts });
}

function box(scene, x, y, z, w, h, d, material, { cast = false, receive = true, name } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (cast) m.castShadow = true;
  if (receive) m.receiveShadow = true;
  if (name) m.name = name;
  scene.add(m);
  return m;
}

function makeSignTexture(label, bg, fg = '#fff', w = 512, h = 96) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `900 ${Math.floor(h * 0.48)}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePriceTagTex(name, price, sale) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = sale ? '#ffe14d' : '#ffffff';
  ctx.fillRect(0, 0, 128, 48);
  ctx.strokeStyle = '#0072DD'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, 126, 46);
  ctx.fillStyle = '#111';
  ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(name.slice(0, 8), 6, 5);
  ctx.font = `900 16px ${FONT}`;
  ctx.fillStyle = sale ? '#c62828' : '#0d47a1';
  ctx.fillText(`${price.toLocaleString('ko-KR')}원`, 6, 22);
  if (sale) {
    ctx.fillStyle = '#c62828';
    ctx.font = `900 10px ${FONT}`;
    ctx.fillText('2배!', 90, 6);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** @returns interior room handle */
export function buildInterior({ storeId = 'seongnam-cityhall', storeName = 'BUMP24 성남시청점', dateKey } = {}) {
  const layout = planLayout(storeId, dateKey);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f6f8');
  scene.fog = null;

  // 조명 — 편의점처럼 밝고 차갑게 (SwiftShader에서도 또렷하게)
  scene.add(new THREE.AmbientLight('#ffffff', 0.75));
  scene.add(new THREE.HemisphereLight('#ffffff', '#b0bec5', 1.15));
  const key = new THREE.DirectionalLight('#ffffff', 0.85);
  key.position.set(3, 10, 4); scene.add(key);
  for (const z of [1.0, 2.8, 4.6, 6.2]) {
    const p = new THREE.PointLight('#ffffff', 0.9, 10, 1.6);
    p.position.set(0, 2.7, z); scene.add(p);
  }

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const W = STORE.W, D = STORE.D, H = STORE.H;
  const x0 = -W / 2, x1 = W / 2, z0 = 0, z1 = D; // 입구 z=0, 안쪽 +z

  // --- 바닥 (타일) ---
  {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#e8eaed'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#c5c9ce'; ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 124, 124);
    ctx.fillStyle = '#f2f4f6'; ctx.fillRect(8, 8, 112, 112);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / 0.55, D / 0.55);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#ffffff', { map: tex, roughness: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, D / 2); floor.receiveShadow = true;
    scene.add(floor); track(tex);
  }

  // --- 벽 ---
  const wallMat = mat('#f7f8fa', { roughness: 0.4 });
  const darkMat = mat('#3a4450');
  // 뒷벽
  box(scene, 0, H / 2, z1, W, H, 0.12, wallMat);
  // 왼쪽/오른쪽
  box(scene, x0, H / 2, D / 2, 0.12, H, D, wallMat);
  box(scene, x1, H / 2, D / 2, 0.12, H, D, wallMat);
  // 앞벽(입구 양쪽 + 문 구멍)
  const doorW = 1.4;
  box(scene, (x0 - doorW / 2) / 2, H / 2, z0, W / 2 - doorW / 2, H, 0.12, wallMat);
  box(scene, (x1 + doorW / 2) / 2, H / 2, z0, W / 2 - doorW / 2, H, 0.12, wallMat);
  box(scene, 0, H - 0.35, z0, doorW, 0.7, 0.12, wallMat);
  // 유리문
  const glassMat = mat('#cfe8f8', { transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.1, depthWrite: false });
  const doorL = box(scene, -doorW / 4 - 0.02, 1.15, z0 + 0.02, doorW / 2 - 0.06, 2.2, 0.04, glassMat, { name: 'exitDoor' });
  const doorR = box(scene, doorW / 4 + 0.02, 1.15, z0 + 0.02, doorW / 2 - 0.06, 0.04 + 2.16, 0.04, glassMat, { name: 'exitDoor' });
  doorL.userData.exit = doorR.userData.exit = true;
  // 문틀
  box(scene, 0, 2.3, z0 + 0.03, doorW + 0.08, 0.08, 0.08, darkMat);
  box(scene, -doorW / 2, 1.15, z0 + 0.03, 0.06, 2.3, 0.08, darkMat);
  box(scene, doorW / 2, 1.15, z0 + 0.03, 0.06, 2.3, 0.08, darkMat);

  // --- 천장 + LED ---
  box(scene, 0, H, D / 2, W, 0.08, D, mat('#f4f5f7'));
  const ledMat = mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 1.2, roughness: 0.3 });
  for (const z of [1.0, 2.6, 4.2, 5.8]) {
    box(scene, 0, H - 0.04, z, W - 1.2, 0.04, 0.12, ledMat);
  }

  // --- 계산대 (왼쪽 앞) ---
  const wood = mat('#d7b899', { roughness: 0.55 });
  const counter = box(scene, x0 + 1.7, 0.55, 1.6, 2.6, 1.1, 0.7, wood, { cast: true, name: 'counter' });
  // POS
  box(scene, x0 + 1.1, 1.25, 1.45, 0.35, 0.4, 0.08, mat('#cfd8dc'));
  box(scene, x0 + 1.1, 1.25, 1.52, 0.28, 0.22, 0.02, mat('#1a237e', { emissive: '#283593', emissiveIntensity: 0.4 }));
  // 카드 단말기
  box(scene, x0 + 1.6, 1.15, 1.35, 0.12, 0.08, 0.18, mat('#212121'));
  // 스캐너
  box(scene, x0 + 2.0, 1.14, 1.4, 0.08, 0.06, 0.18, mat('#37474f'));

  // 직원
  const clerk = createAvatar({
    color: '#1565c0', skin: '#f0c7a0', pants: '#3e2723', gender: 'm',
    hair: 'short', top: 'long', scale: 1,
  });
  // 조끼 느낌: 몸 색 이미 파랑. 이름표
  clerk.position.set(x0 + 1.7, 0, 2.05);
  clerk.rotation.y = Math.PI; // 계산대 밖을 봄
  scene.add(clerk);

  // --- 커피/온장 (계산대 옆) ---
  box(scene, x0 + 3.5, 0.5, 1.55, 1.2, 1.0, 0.55, wood);
  box(scene, x0 + 3.3, 1.25, 1.55, 0.45, 0.55, 0.35, mat('#212121')); // 커피머신
  box(scene, x0 + 3.3, 1.45, 1.4, 0.2, 0.12, 0.02, mat('#90caf9', { emissive: '#64b5f6', emissiveIntensity: 0.5 }));
  // 온장고
  const hotCase = box(scene, x0 + 4.2, 0.85, 1.55, 0.7, 1.5, 0.55, mat('#eceff1'));
  const hotGlass = box(scene, x0 + 4.2, 0.9, 1.28, 0.6, 1.0, 0.02, glassMat);
  const hotSign = makeSignTexture('BUMP 치킨', '#f07a12', '#fff', 256, 64);
  const hotPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: hotSign }));
  hotPlane.position.set(x0 + 4.2, 1.7, 1.25); scene.add(hotPlane); track(hotSign);

  // --- 흰 곤돌라 선반 (중앙 2줄) ---
  const shelfMat = mat('#f5f5f5', { roughness: 0.5, metalness: 0.08 });
  const gondolas = [];
  function makeGondola(cx, cz, len = 2.4, layers = 4) {
    const g = new THREE.Group();
    // 기둥
    for (const sx of [-0.35, 0.35]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.7, 0.04), shelfMat);
      p.position.set(sx, 0.85, 0); g.add(p);
    }
    for (let i = 0; i < layers; i++) {
      const y = 0.25 + i * 0.38;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, len), shelfMat);
      plank.position.set(0, y, 0); g.add(plank);
      // 가격 레일
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.02), mat('#eceff1'));
      rail.position.set(0, y - 0.04, len / 2 + 0.01); g.add(rail);
    }
    // 머리판
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, len + 0.05), mat('#e0e0e0'));
    top.position.set(0, 1.72, 0); g.add(top);
    g.position.set(cx, 0, cz);
    scene.add(g);
    gondolas.push(g);
    return g;
  }
  makeGondola(-1.6, 3.6, 2.6);
  makeGondola(1.6, 3.6, 2.6);
  makeGondola(-1.6, 5.5, 1.8);
  makeGondola(1.6, 5.5, 1.8);

  // --- 냉동고 (유리 뚜껑) ---
  const freezerMat = mat('#eceff1', { metalness: 0.25, roughness: 0.35 });
  function makeFreezer(cx, cz) {
    box(scene, cx, 0.42, cz, 1.5, 0.84, 0.7, freezerMat, { cast: true });
    const lid = box(scene, cx, 0.86, cz, 1.4, 0.02, 0.6, glassMat);
    lid.userData.freezer = true;
  }
  makeFreezer(-3.6, 4.0);
  makeFreezer(-3.6, 5.0);
  makeFreezer(3.6, 4.0);

  // --- 검은 오픈 음료 냉장고 ---
  box(scene, 4.3, 1.0, 2.6, 0.7, 2.0, 1.2, mat('#212121'), { cast: true });
  for (let i = 0; i < 4; i++) {
    box(scene, 4.15, 0.35 + i * 0.4, 2.6, 0.02, 0.02, 1.05, mat('#424242'));
  }

  // --- 뒷벽 냉장 케이스 (틸 헤더) ---
  box(scene, 0, 1.0, z1 - 0.45, W - 1.2, 2.0, 0.7, mat('#eceff1'));
  const teal = makeSignTexture('샐러드 & 디저트', '#00897b', '#fff', 1024, 80);
  const tealPlane = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.6, 0.28), new THREE.MeshBasicMaterial({ map: teal }));
  tealPlane.position.set(0, 2.15, z1 - 0.78); scene.add(tealPlane); track(teal);

  // --- 입구 옆 장바구니 더미 ---
  const basketPile = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = createBasketMesh();
    b.position.set(1.8 + (i % 2) * 0.15, 0.02 + Math.floor(i / 2) * 0.22, 0.55);
    b.rotation.y = (i % 2) * 0.1;
    basketPile.add(b);
  }
  scene.add(basketPile);
  const grabBasketZone = { x: 1.9, z: 0.7, r: 1.1 };

  // --- 상품 InstancedMesh ---
  const { tex: prodTex, uvs } = buildProductAtlas();
  track(prodTex);
  const geos = buildShapeGeometries();
  const shapeMats = {};
  for (const sh of Object.keys(geos)) {
    // InstancedMesh.setColorAt → instanceColor. vertexColors:true 쓰면 검게 나와서 끔.
    shapeMats[sh] = new THREE.MeshBasicMaterial();
  }

  // 진열 슬롯: { itemId, x, y, z, shelfId }
  const slots = [];
  const shelfZones = []; // 담기용 근접 존

  function placeZone(zone, positions, shelfId) {
    const pool = layout.byZone[zone] || [];
    if (!pool.length || !positions.length) return;
    positions.forEach((pos, i) => {
      const item = pool[i % pool.length];
      slots.push({ itemId: item.id, ...pos, shelfId });
    });
  }

  // 곤돌라에 컵라면/과자
  function gondolaSlots(cx, cz, len, zone, shelfId) {
    const positions = [];
    for (let layer = 0; layer < 4; layer++) {
      const y = 0.32 + layer * 0.38;
      const n = Math.floor(len / 0.14);
      for (let i = 0; i < n; i++) {
        const z = cz - len / 2 + 0.12 + i * (len - 0.2) / Math.max(1, n - 1);
        positions.push({ x: cx, y, z });
      }
    }
    placeZone(zone, positions, shelfId);
    shelfZones.push({ id: shelfId, x: cx, z: cz, r: 1.15, zone });
  }
  gondolaSlots(-1.6, 3.6, 2.6, 'ramen', 'g1');
  gondolaSlots(1.6, 3.6, 2.6, 'snack', 'g2');
  gondolaSlots(-1.6, 5.5, 1.8, 'pouch', 'g3');
  gondolaSlots(1.6, 5.5, 1.8, 'fresh', 'g4');

  // 냉동고 아이스크림
  for (const [cx, cz, id] of [[-3.6, 4.0, 'fz1'], [-3.6, 5.0, 'fz2'], [3.6, 4.0, 'fz3']]) {
    const positions = [];
    for (let i = 0; i < 8; i++) {
      positions.push({ x: cx - 0.4 + (i % 4) * 0.25, y: 0.55, z: cz - 0.15 + Math.floor(i / 4) * 0.25 });
    }
    placeZone('freezer', positions, id);
    shelfZones.push({ id, x: cx, z: cz, r: 1.0, zone: 'freezer' });
  }

  // 음료 냉장고
  {
    const positions = [];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) {
      positions.push({ x: 4.05, y: 0.35 + row * 0.4, z: 2.1 + i * 0.18 });
    }
    placeZone('drink', positions, 'drinks');
    shelfZones.push({ id: 'drinks', x: 4.2, z: 2.6, r: 1.1, zone: 'drink' });
  }

  // 뒷벽 냉장 — 도시락 등
  {
    const positions = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 10; i++) {
      positions.push({ x: x0 + 1.2 + i * 0.9, y: 0.5 + row * 0.45, z: z1 - 0.55 });
    }
    placeZone('fresh', positions, 'back');
    shelfZones.push({ id: 'back', x: 0, z: z1 - 0.6, r: 1.4, zone: 'fresh' });
  }

  // 주류·선물 (안쪽/계산대 뒤 — 멀리)
  {
    const positions = [];
    for (let i = 0; i < 6; i++) positions.push({ x: x0 + 0.45, y: 0.9 + (i % 3) * 0.35, z: 3.2 + Math.floor(i / 3) * 0.35 });
    placeZone('alcohol', positions, 'alc');
    shelfZones.push({ id: 'alc', x: x0 + 0.5, z: 3.5, r: 1.0, zone: 'alcohol' });
  }
  {
    const positions = [];
    for (let i = 0; i < 5; i++) positions.push({ x: x1 - 0.5, y: 1.0, z: 5.0 + i * 0.3 });
    placeZone('gift', positions, 'gift');
    shelfZones.push({ id: 'gift', x: x1 - 0.5, z: 5.5, r: 1.0, zone: 'gift' });
  }
  // 핫푸드
  {
    const positions = [];
    for (let i = 0; i < 4; i++) positions.push({ x: x0 + 4.2, y: 0.7 + (i % 2) * 0.25, z: 1.45 });
    placeZone('hot', positions, 'hot');
    shelfZones.push({ id: 'hot', x: x0 + 4.2, z: 1.55, r: 1.0, zone: 'hot' });
  }

  // InstancedMesh per shape + 인스턴스 UV 오프셋(아틀라스 칸) · 인스턴스 색
  const byShape = {};
  for (const s of slots) {
    const item = BY_ID[s.itemId];
    (byShape[item.shape] ||= []).push(s);
  }
  const dummy = new THREE.Object3D();
  const instances = {};
  const CELL = 1 / 8; // 1024/128
  for (const [shape, list] of Object.entries(byShape)) {
    const geo = geos[shape].clone();
    // 기본 UV를 0..1 칸으로 — 셰이더에서 오프셋
    const mesh = new THREE.InstancedMesh(geo, shapeMats[shape].clone(), list.length);
    mesh.name = `prod_${shape}`;
    const uvOff = new Float32Array(list.length * 2);
    const saleFlag = new Float32Array(list.length);
    list.forEach((s, i) => {
      const item = BY_ID[s.itemId];
      const idx = CATALOG.findIndex((c) => c.id === item.id);
      const col = idx % 8, row = Math.floor(idx / 8);
      uvOff[i * 2] = col * CELL;
      uvOff[i * 2 + 1] = 1 - (row + 1) * CELL;
      saleFlag[i] = layout.saleIds.includes(item.id) ? 1 : 0;
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, (item.id.charCodeAt(0) % 7) * 0.05, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // UV 오프셋 인스턴스 속성 + 셰이더 패치
    // 색은 instanceColor, 맵은 아틀라스 전체(장식). UV 오프셋 셰이더는 BasicMaterial에서 불안정해 생략
    mesh.material.needsUpdate = true;
    scene.add(mesh);
    instances[shape] = { mesh, list };
  }

  // 가격표 (선반 존마다 대표 1~2개만 — draw call 절약: 하나의 InstancedMesh)
  {
    const tagGeo = new THREE.PlaneGeometry(0.22, 0.08);
    const tags = [];
    for (const z of shelfZones) {
      const pool = layout.byZone[z.zone] || [];
      if (!pool.length) continue;
      const item = pool[0];
      const sale = layout.saleIds.includes(item.id);
      const tex = makePriceTagTex(item.name, scoreOf(item, layout.saleIds), sale);
      track(tex);
      const m = new THREE.Mesh(tagGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
      m.position.set(z.x, 1.35, z.z + (z.z < 2 ? 0.4 : -0.5));
      m.lookAt(z.x, 1.35, z.z + (z.z < 2 ? 1.4 : -1.5));
      // 카메라를 향하도록 매 프레임 돌려도 되지만, 일단 통로 쪽
      scene.add(m);
      tags.push(m);
    }
  }

  // 플레이어 아바타 (안에서만)
  const me = createAvatar({ color: '#4f7cff', gender: 'm', hair: 'short' });
  me.position.set(0, 0, 1.15);
  me.rotation.y = 0; // +z 안쪽을 봄
  scene.add(me);

  const basket = createBasketController({ scene });
  // 입구 바구니는 더미, 실제 컨트롤러 바구니는 집으면 attach

  // 카메라 — 위에서 비스듬히 (모바일 친화)
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 40);
  const cam = { yaw: 0, pitch: 0.48, dist: 6.2 };

  // 충돌: 간단한 AABB 목록
  const blockers = [
    { x0: x0 + 0.4, x1: x0 + 3.0, z0: 1.2, z1: 2.0 }, // counter
    { x0: x0 + 2.9, x1: x0 + 4.8, z0: 1.2, z1: 1.95 }, // coffee/hot
    { x0: -2.1, x1: -1.1, z0: 2.3, z1: 4.9 }, // gondola
    { x0: 1.1, x1: 2.1, z0: 2.3, z1: 4.9 },
    { x0: -2.1, x1: -1.1, z0: 4.6, z1: 6.4 },
    { x0: 1.1, x1: 2.1, z0: 4.6, z1: 6.4 },
    { x0: -4.4, x1: -2.8, z0: 3.5, z1: 5.4 }, // freezers
    { x0: 2.8, x1: 4.4, z0: 3.5, z1: 4.5 },
    { x0: 3.8, x1: 4.7, z0: 1.9, z1: 3.3 }, // drinks
    { x0: x0 + 0.2, x1: x1 - 0.2, z0: z1 - 0.9, z1: z1 - 0.1 }, // back case
  ];
  const canStand = (x, z) => {
    if (x < x0 + 0.35 || x > x1 - 0.35 || z < 0.35 || z > z1 - 0.35) return false;
    for (const b of blockers) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return false;
    return true;
  };

  // 바닥에 떨어진 상품
  const floorItems = [];

  let speed = 0;
  let hasBasket = false;
  let clerkT = 0;

  function nearestShelf(x, z) {
    let best = null, bd = Infinity;
    for (const s of shelfZones) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function pickFromShelf(shelf) {
    const pool = layout.byZone[shelf.zone] || [];
    if (!pool.length) return null;
    // 같은 선반에서 고르게
    const item = pool[Math.floor(Math.random() * pool.length)];
    return item;
  }

  function update(dt, { look: [dy, dp, dz] = [0, 0, 0], axes = { f: 0, s: 0, run: false }, allowMove = true } = {}) {
    cam.yaw += dy;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dp, 0.25, 1.15);
    cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + dz), 4.0, 11);

    const p = me.position;
    let { f, s, run } = allowMove ? axes : { f: 0, s: 0, run: false };
    // 경직 중엔 느려짐
    const stunMul = basket.stunned ? 0.25 : 1;
    speed = 0;
    if (f || s) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
      let mx = fx * f + rx * s, mz = fz * f + rz * s;
      const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
      const sp = (run ? 5.2 : 3.4) * stunMul * Math.min(1, Math.hypot(f, s));
      const step = sp * dt;
      const nSub = Math.max(1, Math.ceil(step / 0.08));
      const sx = (mx * step) / nSub, sz = (mz * step) / nSub;
      for (let k = 0; k < nSub; k++) {
        if (canStand(p.x + sx, p.z)) p.x += sx;
        if (canStand(p.x, p.z + sz)) p.z += sz;
      }
      const want = Math.atan2(mx, mz);
      me.rotation.y += Math.atan2(Math.sin(want - me.rotation.y), Math.cos(want - me.rotation.y)) * Math.min(1, dt * 12);
      speed = sp;
    }
    animateAvatar(me, speed, dt);
    basket.update(dt);

    // 직원 숨쉬기
    clerkT += dt;
    animateAvatar(clerk, 0, dt);
    clerk.rotation.y = Math.PI + Math.sin(clerkT * 0.4) * 0.25;

    // 떨어진 상품 물리(간단)
    for (const fi of floorItems) {
      if (fi.settled) continue;
      fi.vy -= 18 * dt;
      fi.mesh.position.y += fi.vy * dt;
      fi.mesh.position.x += fi.vx * dt;
      fi.mesh.position.z += fi.vz * dt;
      fi.mesh.rotation.x += fi.spin * dt;
      fi.mesh.rotation.z += fi.spin * 0.7 * dt;
      if (fi.mesh.position.y <= 0.04) {
        fi.mesh.position.y = 0.04;
        fi.vy *= -0.35;
        fi.vx *= 0.6; fi.vz *= 0.6;
        if (Math.abs(fi.vy) < 0.4) { fi.settled = true; fi.vy = 0; }
      }
    }

    // 카메라
    const eye = 1.5;
    const bx = Math.sin(cam.yaw), bz = Math.cos(cam.yaw);
    const cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
    let d = cam.dist;
    camera.position.set(p.x + bx * d * cp, eye + d * spp, p.z + bz * d * cp);
    camera.position.y = Math.min(H - 0.15, Math.max(1.35, camera.position.y));
    // 거리가 너무 멀면 천장에 가려 회색만 보이므로 실내에서는 상한
    if (cam.dist > 7.5) cam.dist = 7.5;
    camera.lookAt(p.x, eye - 0.2, p.z);

    const nearBasket = !hasBasket && Math.hypot(p.x - grabBasketZone.x, p.z - grabBasketZone.z) < grabBasketZone.r;
    const shelf = nearestShelf(p.x, p.z);
    const nearExit = p.z < 1.0 && Math.abs(p.x) < 1.2;
    const nearCounter = Math.hypot(p.x - (x0 + 1.7), p.z - 1.6) < 1.5 && hasBasket;

    return { nearBasket, shelf, nearExit, nearCounter, hasBasket, speed };
  }

  function grabBasket() {
    if (hasBasket) return false;
    hasBasket = true;
    basket.attachTo(me);
    basketPile.visible = false;
    return true;
  }

  function addFloorItem(spilled, fromWorldPos) {
    for (const s of spilled) {
      scene.add(s.mesh);
      const origin = fromWorldPos || me.position;
      s.mesh.position.set(origin.x + (Math.random() - 0.5) * 0.3, 1.1, origin.z + (Math.random() - 0.5) * 0.3);
      floorItems.push({
        id: s.id, mesh: s.mesh, price: s.price, weight: s.weight, sale: s.sale,
        vx: (Math.random() - 0.5) * 2.5, vz: (Math.random() - 0.5) * 2.5, vy: 2 + Math.random(),
        spin: (Math.random() - 0.5) * 10, settled: false,
      });
    }
  }

  function nearestFloorItem(x, z, r = 0.9) {
    let best = null, bd = r;
    for (const fi of floorItems) {
      if (!fi.settled && fi.mesh.position.y > 0.2) continue;
      const d = Math.hypot(x - fi.mesh.position.x, z - fi.mesh.position.z);
      if (d < bd) { bd = d; best = fi; }
    }
    return best;
  }

  function pickupFloor(fi) {
    const i = floorItems.indexOf(fi);
    if (i >= 0) floorItems.splice(i, 1);
    scene.remove(fi.mesh);
    fi.mesh.geometry?.dispose();
    fi.mesh.material?.dispose?.();
    return BY_ID[fi.id];
  }

  function render(renderer) {
    camera.aspect = renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function dispose() {
    basket.dispose();
    for (const d of disposables) d.dispose?.();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        m.map?.dispose?.(); m.dispose?.();
      });
    });
    scene.clear();
  }

  function setView(x, z, yaw, pitch = 0.55, dist = 7) {
    me.position.set(x, 0, z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist;
  }

  // draw call 대략: 바닥1 + 벽들(~10) + LED4 + 가구(~20) + 인스턴스 모양수(~10) + 아바타(~15) — 목표 최적화는 머지 후
  const stats = () => ({
    slots: slots.length,
    shapes: Object.keys(instances).length,
    saleIds: layout.saleIds.slice(),
    storeId, storeName,
  });

  return {
    scene, camera, cam, player: me, clerk, basket, layout, shelfZones,
    grabBasketZone, counter,
    update, render, dispose, setView, stats,
    grabBasket, get hasBasket() { return hasBasket; },
    nearestShelf, pickFromShelf, addFloorItem, nearestFloorItem, pickupFloor,
    floorItems,
    get speed() { return speed; },
    doorPos: { x: 0, z: 0.5 },
    STORE,
  };
}
