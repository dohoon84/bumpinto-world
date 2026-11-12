// [perf-memory] 안 보이는 먼 소품 덩어리를 렌더에서 뺀다(?propcull=0 이면 안 씀). 화면 결과가 같도록 보수적으로:
//   (1) 덩어리 경계구의 '가장 가까운 점'까지 거리가 scene.fog.far 를 넘으면 → 안개(Linear)에 완전히 묻혀 지면/안개색과 구분 안 됨.
//       단, 꼭대기가 maxTopY(기본 40m) 보다 높은 덩어리는 하늘 배경에 실루엣이 남을 수 있어 제외. fog:false 재질 메시는 건드리지 않음.
//   (2) 경계구 화면 반지름이 minPx(기본 0.5px) 미만.
//   덩어리 = 등록한 root (보통 scene 바로 아래 자식). 움직이는 root 도 되도록 경계는 root 로컬에서 한 번 구하고 매번 root 행렬로 옮긴다.
import * as THREE from 'three';
import { setHidden } from './hide.js';
import { farContrastHide } from './instancer.js'; // [jamsil-perf]
const farCullOn = () => typeof location === 'undefined' || new URLSearchParams(location.search).get('farcull') !== '0';

const R = 'cull';
export function createPropCull({ minPx = 0.5, maxTopY = 40, intervalSec = 0.2, getFogFar = null } = {}) {
  const items = new Map(); // root -> { c, r, top, meshes, hidden }
  const stats = { roots: 0, hiddenRoots: 0, hiddenMeshes: 0, fog: 0, tiny: 0 };
  const sph = new THREE.Vector3();
  let acc = Infinity, last = -1, tick = 0;
  const farOn = farCullOn();
  function measure(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
    const box = new THREE.Box3(), tmp = new THREE.Box3(), wbox = new THREE.Box3();
    const meshes = [];
    root.traverse((o) => {
      if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.geometry?.attributes?.position) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); tmp.copy(o.boundingBox); } else tmp.copy(o.geometry.boundingBox);
      if (tmp.isEmpty()) return;
      box.union(tmp.clone().applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)));
      wbox.union(tmp.applyMatrix4(o.matrixWorld));
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.every((m) => m && m.fog !== false)) meshes.push(o); // fog:false 재질은 안개에 안 묻히므로 계속 그림
    });
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
    return { c, r: r * 1.15 + 1, r0: r, top: wbox.max.y, meshes, count: countDesc(root), hidden: false };
  }
  const countDesc = (root) => { let n = 0; root.traverse(() => { n++; }); return n; };
  function add(root) { if (!root || items.has(root)) return false; const m = measure(root); if (!m) return false; items.set(root, m); stats.roots = items.size; return true; }
  function show(it, on) { if (it.hidden === !on) return; it.hidden = !on; for (const o of it.meshes) setHidden(o, R, !on); }
  function remove(root) { const it = items.get(root); if (!it) return; show(it, true); items.delete(root); stats.roots = items.size; }
  function sync(renderer, scene, camera) {
    const now = performance.now(); if (last >= 0) acc += (now - last) / 1000; last = now;
    if (acc < intervalSec) return; acc = 0;
    const fogFar = getFogFar ? getFogFar() : scene.fog?.isFog ? scene.fog.far : Infinity;
    const H = renderer.domElement?.height || 800;
    const k = camera.isPerspectiveCamera ? (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : 0;
    let hr = 0, hm = 0, fog = 0, tiny = 0;
    const recount = (tick++ % 10) === 0;
    for (const [root, it0] of items) {
      let it = it0;
      if (!root.parent) { remove(root); continue; }
      if (recount && countDesc(root) !== it.count) { show(it, true); const m = measure(root); if (!m) continue; items.set(root, (it = m)); }
      sph.copy(it.c).applyMatrix4(root.matrixWorld);
      const r = it.r * root.matrixWorld.getMaxScaleOnAxis();
      const d = sph.distanceTo(camera.position);
      const near = d - r;
      const hideFog = near > fogFar * 1.02 && it.top < maxTopY;
      const hideTiny = k > 0 && d > r && (r / d) * k < minPx;
      // [jamsil-perf] 작은 덩어리(실제 반지름 ≤ 10 m)는 안개 대비 화면 크기로도 거른다(instancer 와 같은 기준)
      const hideFar = farOn && it.top < maxTopY && farContrastHide(it.r0 * root.matrixWorld.getMaxScaleOnAxis(), d, k, scene.fog);
      const hide = hideFog || hideTiny || hideFar;
      show(it, !hide);
      if (hide) { hr++; hm += it.meshes.length; if (hideFog) fog++; else tiny++; }
    }
    Object.assign(stats, { hiddenRoots: hr, hiddenMeshes: hm, fog, tiny });
  }
  function dispose() { for (const root of [...items.keys()]) remove(root); }
  return { add, remove, sync, dispose, stats, items };
}
