// 플레이어가 고른 아바타 얼굴을 직업 투구 안에 붙인다.
// 디자이너 GLB의 점 눈(face/eyes 파트)은 접어 두고, 월드 저장 look 으로 그린 얼굴을 그 자리에 둔다.
import * as THREE from 'three';
import { getHeadGeometry, getFaceMaterial } from '../entities/faceTexture.js';
import { PROFILE_KEY, readSavedPassport, sanitizeLook } from '../look.js';
import { CITIZEN_LOOK } from './look.js';

// 클래스 GLB extras.parts 에서 face, eyes 의 인덱스. 마법사만 타셋이 없어 한 칸 앞이다.
const BAKED = {
  warrior: [11, 12],
  mage: [10, 11],
  priest: [11, 12],
  archer: [11, 12],
  assassin: [11, 12],
};

export function readPlayerLook() {
  const saved = readSavedPassport();
  return sanitizeLook(saved?.look || CITIZEN_LOOK);
}

export function writePlayerLook(raw) {
  const look = sanitizeLook(raw || {});
  let prev = {};
  try {
    prev = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {};
  } catch { /* 저장이 없으면 새로 쓴다 */ }
  const name = typeof prev.name === 'string' && prev.name.trim() ? prev.name.trim().slice(0, 16) : '도훈';
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...prev, name, look }));
  } catch { /* 사생활 모드면 메모리 look 만 쓴다 */ }
  return look;
}

function hideBakedFace(root, classId) {
  const drop = new Set(BAKED[classId] || BAKED.warrior);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry;
    if (geo.userData.faceHidden) return;
    const part = geo.attributes._partid || geo.attributes._PARTID;
    const pos = geo.attributes.position;
    if (!part || !pos) return;
    let n = 0;
    for (let i = 0; i < part.count; i++) {
      if (!drop.has(part.getX(i))) continue;
      // 바인드 포즈의 머리 관절 근처로 모아 투구 안쪽에 숨긴다.
      pos.setXYZ(i, 0.03, 0.32, 0.04);
      n += 1;
    }
    if (!n) return;
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.userData.faceHidden = 1;
  });
}

function addHair(group, look) {
  if (!look.hair || look.hair === 'bald') return;
  const mat = new THREE.MeshBasicMaterial({ color: look.hairColor || '#2a211c' });
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.08), mat);
  fringe.position.set(0, 0.2, 0.15);
  group.add(fringe);
  for (const s of [-1, 1]) {
    const tuft = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.12, 3, 6), mat);
    tuft.position.set(s * 0.15, 0.06, 0.08);
    tuft.rotation.z = s * -0.28;
    group.add(tuft);
  }
  if (look.hair === 'short') return;
  for (const s of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, look.hair === 'medium' ? 0.16 : 0.28, 3, 6), mat);
    lock.position.set(s * 0.15, look.hair === 'medium' ? -0.02 : -0.1, 0.02);
    group.add(lock);
  }
  if (look.hair === 'pony' || look.hair === 'long') {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.24, 3, 6), mat);
    tail.position.set(0, -0.02, -0.14);
    tail.rotation.x = 0.45;
    group.add(tail);
  }
}

export function mountPlayerFace(root, look, classId) {
  const clean = sanitizeLook(look || readPlayerLook());
  const stale = [];
  root.traverse((o) => { if (o.name === 'player-face') stale.push(o); });
  for (const node of stale) node.parent?.remove(node);
  hideBakedFace(root, classId);
  let bone = null;
  root.traverse((o) => { if (!bone && o.name === 'head') bone = o; });
  const face = new THREE.Group();
  face.name = 'player-face';
  const src = getFaceMaterial(clean, 'idle');
  const mat = new THREE.MeshBasicMaterial({ map: src.map || null, color: src.map ? 0xffffff : (clean.skin || '#f2d0b0') });
  const head = new THREE.Mesh(getHeadGeometry(clean.face), mat);
  head.name = 'player-face-mesh';
  head.frustumCulled = false;
  head.renderOrder = 2;
  const tall = clean.face === 'long' ? 1.05 : 0.86;
  head.scale.set(0.78, tall * 0.72, 0.7);
  // 머리 뼈 기준. 눈 높이(eyeY 1.417 - headBoneY 1.248) 앞에 투구 개구를 채운다.
  head.position.set(0, 0.16, 0.08);
  face.add(head);
  addHair(face, clean);
  (bone || root).add(face);
  root.userData.playerLook = clean;
  return face;
}
