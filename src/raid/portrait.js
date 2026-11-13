import * as THREE from 'three';
import { CLASS_MARKS } from './classes.js';

const rt = new THREE.WebGLRenderTarget(256, 256);
const buf = new Uint8Array(256 * 256 * 4);
const best = new Uint8Array(256 * 256 * 4);
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const key = new THREE.DirectionalLight('#fff6ea', 3.2);
const fill = new THREE.DirectionalLight('#d7e4ff', 1.4);
const amb = new THREE.AmbientLight('#fff4ea', 1.1);
const LAYER = 7;
key.layers.set(LAYER);
fill.layers.set(LAYER);
amb.layers.set(LAYER);
cam.layers.set(LAYER);

function sceneOf(object) {
  let node = object;
  while (node.parent) node = node.parent;
  return node;
}

function faceScore() {
  let skin = 0;
  let spread = 0;
  for (let i = 0; i < buf.length; i += 16) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    if (r > 90 && r > g && g > b) skin += 1;
    spread += Math.abs(r - g) + Math.abs(g - b);
  }
  return skin * 40 + spread;
}

function shoot(renderer, scene, box, side) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const headY = box.max.y - Math.min(0.28, Math.max(0.16, size.y * 0.12));
  const dist = 0.62;
  cam.fov = 24;
  cam.position.set(center.x + side * 0.1, headY, center.z + side * dist);
  cam.lookAt(center.x, headY - 0.02, center.z);
  cam.updateProjectionMatrix();
  key.position.set(center.x + side * 1.4, headY + 1.6, center.z + side * dist);
  fill.position.set(center.x - side * 1.2, headY + 0.3, center.z + side * 0.6);
  renderer.render(scene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, 256, 256, buf);
  return faceScore();
}

export function renderClassPortrait(renderer, source, classId) {
  const scene = sceneOf(source);
  const hidden = [];
  const tagged = [];
  source.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
    if (o.isMesh || o.isLight) {
      o.layers.enable(LAYER);
      tagged.push(o);
      if (o.isMesh) o.frustumCulled = false;
    }
  });
  scene.add(key, fill, amb);
  source.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(source);
  if (box.isEmpty()) box.setFromCenterAndSize(source.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(1, CLASS_MARKS[classId]?.crown || 1.9, 1));
  const prev = renderer.getRenderTarget();
  const oldClear = renderer.getClearColor(new THREE.Color());
  const oldAlpha = renderer.getClearAlpha();
  const oldTone = renderer.toneMapping;
  const oldExposure = renderer.toneMappingExposure;
  renderer.setRenderTarget(rt);
  renderer.setClearColor('#2a211c', 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  let winner = -1;
  for (const side of [1, -1]) {
    const score = shoot(renderer, scene, box, side);
    if (score > winner) {
      winner = score;
      best.set(buf);
    }
  }
  renderer.toneMapping = oldTone;
  renderer.toneMappingExposure = oldExposure;
  renderer.setRenderTarget(prev);
  renderer.setClearColor(oldClear, oldAlpha);
  scene.remove(key, fill, amb);
  for (const o of tagged) o.layers.disable(LAYER);
  for (const o of hidden) o.visible = false;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    const src = (255 - y) * 256 * 4;
    img.data.set(best.subarray(src, src + 256 * 4), y * 256 * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
