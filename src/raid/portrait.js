import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLASS_MARKS } from './classes.js';

const rt = new THREE.WebGLRenderTarget(256, 256);
const buf = new Uint8Array(256 * 256 * 4);
const portraitScene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(26, 1, 0.04, 12);
const key = new THREE.DirectionalLight('#ffe6cc', 2.4);
key.position.set(1.2, 2.4, 2.2);
portraitScene.add(new THREE.AmbientLight('#ffb090', 0.7), key);
let holder = null;

export function renderClassPortrait(renderer, source, classId) {
  if (holder) {
    portraitScene.remove(holder);
    holder = null;
  }
  holder = SkeletonUtils.clone(source);
  holder.position.set(0, 0, 0);
  holder.rotation.set(0, 0, 0);
  holder.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.castShadow = false;
    }
  });
  portraitScene.add(holder);
  const head = CLASS_MARKS[classId]?.head || 1.25;
  cam.position.set(0.05, head + 0.02, 0.72);
  cam.lookAt(0, head - 0.04, 0);
  cam.updateProjectionMatrix();
  const prev = renderer.getRenderTarget();
  const oldClear = renderer.getClearColor(new THREE.Color());
  const oldAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor('#1a120c', 1);
  renderer.render(portraitScene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, 256, 256, buf);
  renderer.setRenderTarget(prev);
  renderer.setClearColor(oldClear, oldAlpha);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    const src = (255 - y) * 256 * 4;
    img.data.set(buf.subarray(src, src + 256 * 4), y * 256 * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
