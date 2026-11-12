// 셰이더·텍스처를 첫 present 전에 데운다.
//   three r158+ 의 renderer.compileAsync 와 KHR_parallel_shader_compile 을 쓴다 (이 레포 three 0.186).
//   compile(scene) 은 visible/프러스텀을 보지 않고 씬의 모든 메시·숨은 물체까지 프로그램을 만든다.
//   그래서 스폰에서 실제로 그릴 것만 모아서 compile 하고, 나머지는 보일 때 잘게 나눈다.
//   KHR_parallel_shader_compile 이 없으면 ready 를 막지 않는다. 긴 동기 compile 한 방은 쓰지 않는다.
//   지구본(worldGate)과 월드 부트가 같은 헬퍼를 쓴다.

import * as THREE from 'three';

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];

const _frustum = new THREE.Frustum();
const _proj = new THREE.Matrix4();
const _center = new THREE.Vector3();
const _sphere = new THREE.Sphere();

export function collectTextures(root) {
  const out = new Set();
  root?.traverse?.((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m) continue;
      for (const k of MAP_KEYS) if (m[k] && m[k].isTexture) out.add(m[k]);
    }
  });
  return [...out];
}

function isDrawable(object) {
  return !!(object && (object.isMesh || object.isPoints || object.isLine || object.isLineSegments || object.isSprite));
}

function objectSphere(object) {
  const geo = object.geometry;
  if (!geo) return null;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const bs = object.boundingSphere || geo.boundingSphere;
  if (!bs) return null;
  _center.copy(bs.center).applyMatrix4(object.matrixWorld);
  const sx = object.scale.x, sy = object.scale.y, sz = object.scale.z;
  const scale = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)) || 1;
  _sphere.center.copy(_center);
  _sphere.radius = bs.radius * scale;
  return _sphere;
}

/** 카메라에 실제로 그려질 메시만. hidden / 프러스텀 밖 / 다른 레이어는 뺀다. */
export function collectRenderable(scene, camera, { margin = 1 } = {}) {
  if (!scene || !camera) return [];
  scene.updateMatrixWorld?.();
  camera.updateMatrixWorld();
  if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_proj);
  const list = [];
  scene.traverseVisible((o) => {
    if (!isDrawable(o)) return;
    if (o.layers && camera.layers && !o.layers.test(camera.layers)) return;
    const mat = o.material;
    if (!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    if (!mats.some((m) => m && m.visible !== false)) return;
    if (o.frustumCulled !== false) {
      const sph = objectSphere(o);
      if (sph) {
        if (margin !== 1) {
          const r = sph.radius;
          sph.radius = r * margin;
          if (!_frustum.intersectsSphere(sph)) return;
          sph.radius = r;
        } else if (!_frustum.intersectsSphere(sph)) return;
      }
    }
    list.push(o);
  });
  return list;
}

function compileBag(renderer, scene, camera, objects) {
  if (!objects.length || typeof renderer.compile !== 'function') return;
  const bag = new THREE.Scene();
  bag.fog = scene.fog;
  bag.environment = scene.environment;
  bag.background = scene.background;
  // 실제 오브젝트를 옮기지 않는다. traverse 만 우리 목록을 돌게 한다.
  bag.traverse = (fn) => { for (const o of objects) fn(o); };
  // 조명은 본 씬과 같게 (render() 도 보이는 Light 를 모두 모은다).
  renderer.compile(bag, camera, scene);
}

/**
 * 한 예산 안에서 아직 안 데운 오브젝트만 compile 한다. 한 방에 전체를 돌리지 않는다.
 * @returns {{ done: boolean, compiled: number }}
 */
export function compileRenderableSlice(renderer, scene, camera, objects, { budgetMs = 8, cursor = 0 } = {}) {
  if (!renderer || !objects?.length) return { done: true, compiled: 0, cursor: 0 };
  const t0 = performance.now();
  let i = cursor;
  let n = 0;
  // 최소 1개는 하고, 예산이 남으면 더.
  while (i < objects.length && (n === 0 || performance.now() - t0 < budgetMs)) {
    try { compileBag(renderer, scene, camera, [objects[i]]); } catch { /* 컨텍스트 손실 등 */ }
    i++;
    n++;
  }
  return { done: i >= objects.length, compiled: n, cursor: i };
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Object3D} scene
 * @param {import('three').Camera} camera
 * @param {{ textures?: object[], maxMs?: number, yieldFn?: () => Promise<void>, onlyParallel?: boolean }} [opts]
 */
export async function warmupRenderer(renderer, scene, camera, { textures, maxMs = 4000, yieldFn, onlyParallel = false } = {}) {
  if (!renderer || !scene || !camera) return;
  const t0 = performance.now();
  const list = textures || collectTextures(scene);
  let nTex = 0;
  for (const tex of list) {
    try { renderer.initTexture(tex); nTex++; } catch { /* 컨텍스트가 없거나 이미 폐기 */ }
    if (yieldFn && performance.now() - t0 > 8) {
      try { await yieldFn(); } catch { /* noop */ }
    }
    if (performance.now() - t0 > maxMs) break;
  }
  const hasParallel = !!renderer.extensions?.has?.('KHR_parallel_shader_compile');
  const left = () => Math.max(0, maxMs - (performance.now() - t0));
  try {
    if (hasParallel && typeof renderer.compileAsync === 'function') {
      // 지구본 등: 확장이 있으면 프러스텀만 비동기로 데운다. 전체 씬 compile 은 프로그램을 부풀린다.
      const visible = collectRenderable(scene, camera);
      const bag = new THREE.Scene();
      bag.fog = scene.fog;
      bag.environment = scene.environment;
      bag.background = scene.background;
      bag.traverse = (fn) => { for (const o of visible) fn(o); };
      await Promise.race([
        renderer.compileAsync(bag, camera, scene).catch(() => {}),
        new Promise((r) => setTimeout(r, Math.max(left(), 16))),
      ]);
    } else if (!onlyParallel && typeof renderer.compile === 'function') {
      // 월드 부트는 이 경로를 더 이상 쓰지 않는다(ready 를 막는 동기 블록이 된다).
      // 호환을 위해 프러스텀만, 그것도 예산 안에서만 돈다.
      const visible = collectRenderable(scene, camera);
      const step = compileRenderableSlice(renderer, scene, camera, visible, { budgetMs: Math.min(8, left() || 8), cursor: 0 });
      let cursor = step.cursor;
      while (!step.done && left() > 0) {
        if (yieldFn) { try { await yieldFn(); } catch { /* noop */ } }
        const next = compileRenderableSlice(renderer, scene, camera, visible, { budgetMs: Math.min(8, left() || 8), cursor });
        cursor = next.cursor;
        if (next.done) break;
        if (next.compiled === 0) break;
      }
    }
  } catch { /* 구형 three / 컨텍스트 손실 */ }
  return { ms: performance.now() - t0, textures: nTex, parallel: hasParallel };
}

/**
 * 월드 부트용. ready 를 기다리지 않게, 프러스텀을 프레임당 예산으로 데운 뒤
 * 카메라에 새로 들어온 것만 이어서 데운다. 숨은·먼 메시는 손대지 않는다.
 */
export function createWorldWarmup(renderer, scene, camera, { budgetMs = 8 } = {}) {
  let frustum = [];
  let cursor = 0;
  let frustumDone = false;
  let compiled = 0;
  const warmed = new WeakSet();

  function refreshFrustum() {
    frustum = collectRenderable(scene, camera);
    cursor = 0;
    frustumDone = !frustum.length;
  }

  function step(ms = budgetMs) {
    if (!frustumDone) {
      if (!frustum.length) refreshFrustum();
      const r = compileRenderableSlice(renderer, scene, camera, frustum, { budgetMs: ms, cursor });
      cursor = r.cursor;
      compiled += r.compiled;
      for (let i = cursor - r.compiled; i < cursor; i++) warmed.add(frustum[i]);
      frustumDone = r.done;
      return { phase: 'frustum', ...r, compiled };
    }
    // 플레이어가 몸을 돌리거나 이동해서 새로 보이는 것만.
    const nowVisible = collectRenderable(scene, camera).filter((o) => !warmed.has(o));
    if (!nowVisible.length) return { phase: 'idle', done: true, compiled: 0, compiledTotal: compiled };
    const r = compileRenderableSlice(renderer, scene, camera, nowVisible, { budgetMs: ms, cursor: 0 });
    for (let i = 0; i < r.cursor; i++) warmed.add(nowVisible[i]);
    compiled += r.compiled;
    return { phase: 'visible', done: r.done && r.cursor >= nowVisible.length, compiled: r.compiled, compiledTotal: compiled };
  }

  return {
    refreshFrustum,
    step,
    get frustumDone() { return frustumDone; },
    get frustumCount() { return frustum.length; },
    get compiled() { return compiled; },
  };
}
