import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLASS_MARKS } from './classes.js';

const rt = new THREE.WebGLRenderTarget(256, 256);
const buf = new Uint8Array(256 * 256 * 4);
const best = new Uint8Array(256 * 256 * 4);
const cam = new THREE.PerspectiveCamera(26, 1, 0.04, 30);
const key = new THREE.DirectionalLight('#fff8ee', 4.2);
const fill = new THREE.DirectionalLight('#d5e6ff', 1.8);
const amb = new THREE.AmbientLight('#fff4ea', 1.45);
const hemi = new THREE.HemisphereLight('#fff6ea', '#6a5344', 0.8);
const portraitScene = new THREE.Scene();
portraitScene.add(amb, hemi, key, fill);
const cache = new Map();
let holder = null;

function sceneOf(object) {
  let node = object;
  while (node.parent) node = node.parent;
  return node;
}

function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = false;
    o.receiveShadow = false;
    if (o.isSkinnedMesh) o.skeleton?.update();
    const src = o.material;
    if (!src || Array.isArray(src) || src.userData?.portrait) return;
    const m = src.clone();
    if (m.metalness != null) m.metalness = Math.min(0.12, m.metalness);
    if (m.roughness != null) m.roughness = Math.max(0.46, m.roughness);
    if (m.envMapIntensity != null) m.envMapIntensity = 0.4;
    m.userData.portrait = 1;
    o.material = m;
    o.userData.portraitMat = 1;
  });
}

function stats() {
  let sum = 0;
  let skin = 0;
  let silver = 0;
  let n = 0;
  const w = 256;
  for (let y = 40; y < 210; y += 2) {
    for (let x = 48; x < 208; x += 2) {
      const i = (y * w + x) * 4;
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      sum += r + g + b;
      n += 1;
      if (r > 120 && r > g + 15 && g > b + 8 && g > 60) skin += 1;
      if (r > 150 && g > 150 && b > 145 && Math.abs(r - b) < 40) silver += 1;
    }
  }
  const mean = sum / (n * 3);
  return { mean, skin, silver, score: skin * 8 + silver * 3 + mean };
}

function frame(box, side, distMul) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const faceY = box.max.y - Math.max(0.34, size.y * 0.24);
  const dist = Math.max(1.22, size.y * 0.74) * distMul;
  cam.fov = 26;
  cam.position.set(center.x + side * dist * 0.06, faceY + 0.06, center.z + side * dist);
  cam.lookAt(center.x, faceY - 0.02, center.z);
  cam.updateProjectionMatrix();
  key.position.set(center.x + side * 0.8, faceY + 0.9, center.z + side * dist);
  fill.position.set(center.x - side * 0.9, faceY + 0.2, center.z + side * 0.4);
}

function shoot(renderer, scene, box, side, distMul) {
  frame(box, side, distMul);
  renderer.render(scene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, 256, 256, buf);
  return stats();
}

function toURL(pixels) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    const src = (255 - y) * 256 * 4;
    img.data.set(pixels.subarray(src, src + 256 * 4), y * 256 * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function frontSide(root) {
  const mesh = root.getObjectByName?.('player-face-mesh');
  if (!mesh) return null;
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  return forward.z >= 0 ? 1 : -1;
}

function consider(renderer, scene, box, winner, onlySide) {
  const sides = onlySide == null ? [1, -1] : [onlySide];
  for (const distMul of [1, 1.15]) {
    for (const side of sides) {
      const s = shoot(renderer, scene, box, side, distMul);
      const ok = s.mean > 42 && s.skin > 12 && s.silver > 8;
      if ((ok && s.score > winner.score) || (!winner.ok && s.score > winner.score)) {
        winner.score = s.score;
        winner.ok = ok;
        winner.mean = s.mean;
        best.set(buf);
      }
    }
  }
  return winner;
}

function lookKey(source) {
  const look = source?.userData?.playerLook;
  if (!look) return '';
  return [
    look.skin, look.hair, look.hairColor, look.face, look.eyes, look.brows,
    look.mouth, look.eyeColor, look.blush, look.freckles, look.mole, look.beard, look.gender,
  ].join('|');
}

export function clearPortraitCache() {
  cache.clear();
}

export function renderClassPortrait(renderer, source, classId) {
  const key = `${classId}|${lookKey(source)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (holder) {
    portraitScene.remove(holder);
    holder = null;
  }
  const prev = renderer.getRenderTarget();
  const oldClear = renderer.getClearColor(new THREE.Color());
  const oldAlpha = renderer.getClearAlpha();
  const oldTone = renderer.toneMapping;
  const oldExposure = renderer.toneMappingExposure;
  renderer.setRenderTarget(rt);
  renderer.setClearColor('#1a120c', 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  const winner = { score: -1, ok: false, mean: 0 };

  holder = SkeletonUtils.clone(source);
  holder.visible = true;
  holder.rotation.set(0, 0, 0);
  prepare(holder);
  portraitScene.add(holder);
  holder.updateMatrixWorld(true);
  const faceSide = frontSide(holder);
  let box = new THREE.Box3().setFromObject(holder);
  if (box.isEmpty() || box.max.y - box.min.y < 0.4) {
    const mark = CLASS_MARKS[classId];
    box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, (mark?.crown || 1.9) / 2, 0), new THREE.Vector3(0.8, mark?.crown || 1.9, 0.6));
  }
  consider(renderer, portraitScene, box, winner, faceSide);

  if (!winner.ok) {
    const scene = sceneOf(source);
    const hidden = [];
    const tagged = [];
    source.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
      if (o.isMesh) {
        o.frustumCulled = false;
        o.layers.enable(7);
        tagged.push(o);
      }
    });
    cam.layers.set(7);
    source.updateMatrixWorld(true);
    const liveBox = new THREE.Box3().setFromObject(source);
    if (!liveBox.isEmpty()) consider(renderer, scene, liveBox, winner);
    cam.layers.set(0);
    for (const o of tagged) o.layers.disable(7);
    for (const o of hidden) o.visible = false;
  }

  renderer.toneMapping = oldTone;
  renderer.toneMappingExposure = oldExposure;
  renderer.setRenderTarget(prev);
  renderer.setClearColor(oldClear, oldAlpha);
  const url = winner.score > 0 ? toURL(best) : '';
  if (winner.ok && url) cache.set(key, url);
  return cache.get(key) || url;
}
