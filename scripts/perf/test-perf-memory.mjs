// [perf-memory] 단위 테스트: node scripts/perf/test-perf-memory.mjs
import '../corridor/test/dom-shim.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { perfFlags } from '../../src/perf/flags.js';
import { setHidden, isHiddenBy, isPerfHidden } from '../../src/perf/hide.js';
import { distToBoxes, createRegionRegistry } from '../../src/perf/regions.js';
import { lazyExtraCrowd } from '../../src/perf/lazyCrowd.js';
import { mergeStatic } from '../../src/perf/mergeStatic.js';
import { createInstancer } from '../../src/perf/instancer.js';
import { createPropCull } from '../../src/perf/propCull.js';
let n = 0; const ok = (s) => console.log('ok', ++n, s);
const tick = () => new Promise((r) => setTimeout(r, 0));

{ // flags: 기본 켜짐, 마스터 끄면 전부 꺼짐, 개별 끄기
  assert.deepEqual(perfFlags(''), { master: true, lazyregion: true, meshmerge: true, matshare: true, propcull: true });
  const off = perfFlags('?perfmem=0'); assert.ok(!off.master && !off.lazyregion && !off.meshmerge && !off.matshare && !off.propcull);
  const one = perfFlags(new URLSearchParams('meshmerge=0')); assert.ok(one.master && !one.meshmerge && one.lazyregion);
  ok('flags');
}
{ // hide: 이유별 중첩, 원래 mask 복원
  const o = new THREE.Object3D(); o.layers.mask = 5;
  setHidden(o, 'a', true); setHidden(o, 'b', true); assert.equal(o.layers.mask, 0); assert.ok(isHiddenBy(o, 'a') && isHiddenBy(o, 'b'));
  setHidden(o, 'a', false); assert.equal(o.layers.mask, 0); assert.ok(!isHiddenBy(o, 'a'));
  setHidden(o, 'b', false); assert.equal(o.layers.mask, 5); assert.ok(!isPerfHidden(o));
  const p = new THREE.Object3D(); setHidden(p, 'a', true); setHidden(p, 'a', true); setHidden(p, 'a', false); assert.equal(p.layers.mask, 1);
  ok('hide reasons + mask restore');
}
{ // regions: near 에서 로드, far 밖에서 해제(히스테리시스), 진행 방향 미리 로드
  assert.equal(distToBoxes(5, 5, [{ x0: 0, x1: 10, z0: 0, z1: 10 }]), 0);
  assert.equal(distToBoxes(13, 14, [{ x0: 0, x1: 10, z0: 0, z1: 10 }]), 5);
  const reg = createRegionRegistry({ lookAheadSec: 6, minIntervalSec: 0.5 });
  let ent = 0, lv = 0;
  reg.register({ id: 't', boxes: [{ x0: 0, x1: 100, z0: 0, z1: 100 }], near: 200, far: 400, onEnter: () => { ent++; }, onLeave: () => { lv++; } });
  reg.update(-500, 50, 0, 0, 0, true); await tick(); assert.equal(ent, 0);
  reg.update(-150, 50, 0, 0, 0, true); await tick(); assert.equal(ent, 1); assert.ok(reg.isLoaded('t'));
  reg.update(-350, 50, 0, 0, 0, true); await tick(); assert.equal(lv, 0, 'between near and far stays loaded');
  reg.update(-450, 50, 0, 0, 0.1); await tick(); assert.equal(lv, 0, 'throttled');
  reg.update(-450, 50, 0, 0, 0.5); await tick(); assert.equal(lv, 1);
  reg.update(-600, 50, 70, 0, 0, true); await tick(); assert.equal(ent, 2, 'look-ahead (6s × 70m/s)');
  ok('region registry');
}
{ // lazyExtraCrowd: load 전엔 아무 것도 등록 안 함, unload 하면 dispose + unregister
  const reg = [], unreg = []; let grown = 0, made = 0, disposed = 0;
  const crowd = { register: (r) => { const l = { r }; reg.push(l); return l; }, unregister: (l) => unreg.push(l), grow: () => { grown++; } };
  const w = lazyExtraCrowd(() => { made++; return { actors: [1], loading: Promise.resolve(1), stats: { n: 1 }, register: (c) => { c.register('a'); c.register('b'); }, render() {}, say: () => true, dispose: () => { disposed++; } }; });
  w.register(crowd); assert.equal(reg.length, 0); assert.equal(w.stats.lazy, 'unloaded'); assert.equal(w.say(0), false);
  w.load(); w.load(); assert.equal(made, 1); assert.equal(reg.length, 2); assert.equal(grown, 1); assert.equal(w.actors.length, 1);
  w.unload(); assert.equal(disposed, 1); assert.equal(unreg.length, 2); assert.ok(!w.loaded);
  w.load(); assert.equal(made, 2);
  ok('lazy extra crowd');
}
const mk = (color, x) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color })); m.position.set(x, 0, 0); return m; };
const geo = new THREE.BoxGeometry(1, 1, 1);
{ // mergeStatic: 같은 재질 값끼리 묶고(matshare 시 색은 정점색으로), dynamic 은 그대로
  const root = new THREE.Group(); root.position.set(10, 0, 0);
  for (let i = 0; i < 4; i++) root.add(mk(i % 2 ? '#ff0000' : '#00ff00', i * 2));
  const dyn = mk('#0000ff', 20); dyn.userData.perfDynamic = true; root.add(dyn);
  const box0 = new THREE.Box3().setFromObject(root);
  const a = mergeStatic(root, { matshare: true });
  assert.equal(a.stats.before, 5); assert.ok(a.stats.after < 5, JSON.stringify(a.stats)); assert.ok(dyn.parent === root, 'dynamic kept');
  root.updateMatrixWorld(true); const box1 = new THREE.Box3().setFromObject(root);
  assert.ok(box0.min.distanceTo(box1.min) < 1e-6 && box0.max.distanceTo(box1.max) < 1e-6, 'same world bounds');
  const root2 = new THREE.Group(); const ms = [new THREE.MeshLambertMaterial({ color: '#f00' }), new THREE.MeshLambertMaterial({ color: '#0f0' })];
  for (let i = 0; i < 4; i++) { const m = mk('#fff', i * 2); m.material = ms[i % 2]; root2.add(m); }
  root2.add(mk('#f00', 9)); // 값은 같아도 다른 재질 객체 → matshare 꺼지면 따로
  const b = mergeStatic(root2, { matshare: false });
  assert.equal(b.stats.after, 3, 'without matshare: one bucket per material identity (single stays)');
  ok('mergeStatic');
}
{ // instancer: 원본은 렌더에서 빠지고 인스턴스로 그려짐, release 하면 원상복구 + 부품 정리
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); cam.position.set(0, 0, 30); cam.updateMatrixWorld();
  const inst = createInstancer(scene);
  const roots = [0, 1, 2].map((i) => { const r = new THREE.Group(); r.add(mk('#ffffff', i * 3)); r.add(mk('#ff0000', i * 3 + 1)); scene.add(r); return r; });
  scene.updateMatrixWorld(true); roots.forEach((r) => inst.track(r));
  const fake = { domElement: { height: 800 } };
  inst.sync(fake, cam);
  assert.equal(inst.stats.instances, 6); assert.equal(inst.stats.parts, 1, 'solid lambert → one part per geometry');
  assert.ok(roots.every((r) => r.children.every((c) => c.layers.mask === 0)));
  roots.forEach((r) => inst.release(r)); scene.remove(...roots);
  assert.ok(roots.every((r) => r.children.every((c) => c.layers.mask === 1)));
  await new Promise((r) => setTimeout(r, 1100)); inst.sync(fake, cam);
  assert.equal(inst.stats.parts, 0, 'unused parts pruned');
  ok('instancer track/release/prune');
}
{ // propCull: 안개 끝 밖·낮은 덩어리는 숨기고, 가까워지면 다시 보임
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xffffff, 100, 500);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 5000); cam.position.set(0, 2, 0); cam.updateMatrixWorld();
  const g = new THREE.Group(); g.add(mk('#ffffff', 0)); g.position.set(0, 0, -900); scene.add(g); scene.updateMatrixWorld(true);
  const pc = createPropCull({ intervalSec: 0 }); pc.add(g);
  const fake = { domElement: { height: 800 } };
  pc.sync(fake, scene, cam); assert.equal(g.children[0].layers.mask, 0);
  g.position.set(0, 0, -100); g.updateMatrixWorld(true); pc.sync(fake, scene, cam); assert.equal(g.children[0].layers.mask, 1);
  ok('propCull fog/near');
}
console.log('perf-memory tests passed:', n);
