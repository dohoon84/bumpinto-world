// [perf-memory] 메모리·draw call 최적화 묶음. game.js 가 첫 프레임 전에 한 번 mountPerfMem(...) 을 부른다.
//   ?perfmem=0 이면 아무것도 하지 않고 null (예전과 똑같음). 개별 끄기: ?meshmerge=0 ?matshare=0 ?propcull=0 (?lazyregion=0 은 corridor/index.js)
//   ?perfcheck=1 : 정적 병합 원본을 지우지 않고 숨겨만 두고, 1초마다 '병합한 원본이 움직였나/바뀌었나'를 검사(window.__jj.perfmem.check())
import * as THREE from 'three';
import { perfFlags } from './flags.js';
import { createInstancer } from './instancer.js';
import { mergeStatic } from './mergeStatic.js';
import { createPropCull } from './propCull.js';
import { fogCullQueue } from './cellMerge.js'; // [jamsil-perf]

// 정적 병합 대상(scene 바로 아래 자식 이름). 움직이는 부분은 각 모듈에서 userData.perfDynamic 으로 표시해 둔다
const LANDMARK_CULL = typeof location === 'undefined' || new URLSearchParams(location.search).get('landmarkcull') !== '0';

export const MERGE_TARGETS = ['tancheon-dog-park', 'tancheon-stepping-stones', 'jeongja-station-plaza', 'jeongja-starbucks-crowd', 'starbucks-mullions'];

export function mountPerfMem({ scene, renderer, camera, params, getPlayer = () => null, corridor = null, bikes = null } = {}) {
  const F = perfFlags(params);
  if (!F.master) return null;
  const check = params?.get?.('perfcheck') === '1';
  const t0 = performance.now();
  const out = { flags: F, merges: [], stats: {}, instancer: null, cull: null };

  // 1) 정적 병합 (+ matshare: 같은 값 재질끼리 묶기)
  if (F.meshmerge) {
    for (const o of scene.children.slice()) {
      if (!MERGE_TARGETS.includes(o.name)) continue;
      const m = mergeStatic(o, { matshare: F.matshare, keepOriginals: check });
      out.merges.push({ name: o.name, ...m.stats, watch: m.watch });
    }
  }
  const mergeMs = performance.now() - t0;

  // 2) 인스턴싱: 아바타(userData.rig: 사람·강아지·고양이·비둘기)와 그 밖의 반복 소품(카카오바이크)
  const corridorRoot = corridor?.root || null;
  const inst = F.meshmerge ? createInstancer(scene, { pixelCull: F.propcull }) : null;
  out.instancer = inst;
  const skipTop = new Set([corridorRoot, inst?.group].filter(Boolean));
  // scene 바로 아래 작은 Group(메시 6~400개, 반지름 25m 안, 정적 병합 대상 아님) — 한 번 판정해 기억
  const smallMemo = new WeakMap();
  const smallGroup = (c) => {
    if (!c.isGroup && c.type !== 'Object3D') return false;
    if (smallMemo.has(c)) return smallMemo.get(c);
    let n = 0; const box = new THREE.Box3(), tmp = new THREE.Box3();
    c.updateMatrixWorld(true);
    c.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) { n++; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } });
    const r = box.isEmpty() ? Infinity : box.getSize(new THREE.Vector3()).length() / 2;
    const ok = !MERGE_TARGETS.includes(c.name) && n >= 6 && n <= 400 && r < 25;
    smallMemo.set(c, ok); return ok;
  };
  function discover() {
    if (!inst) return;
    const player = getPlayer();
    const walk = (o) => {
      if (o === player || skipTop.has(o) || o.userData?.perfNoInstance) return;
      if (o.userData?.rig || o.userData?.perfInstance) { inst.track(o); return; }
      for (const c of o.children) walk(c);
    };
    for (const c of scene.children) {
      if (skipTop.has(c) || c === player || c.userData?.perfNoInstance) continue;
      if (!c.userData?.rig && smallGroup(c)) { inst.track(c); continue; } // 택시·순찰차·가게 같은 작은 덩어리: 같은 부품끼리 인스턴싱
      walk(c);
    }
    for (const b of bikes?.list || []) if (b.mesh?.parent) inst.track(b.mesh);
    // [jamsil-perf] 코리더 시내버스(corridorBuses 아래 버스 한 대 = userData.L): 같은 부품(바퀴·유리·범퍼)은 인스턴싱, 먼 버스·작은 부품은 화면 크기로 거른다
    const cb = corridorRoot?.children?.find((c) => c.name === 'corridorBuses'); // buses.js 가 root 바로 아래에 둔다
    if (cb) for (const c of cb.children) if (c.userData?.L && !c.userData?.perfNoInstance) inst.track(c); // 카카오바이크(같은 원형을 clone: 지오메트리·재질 공유)
    // 플레이어 아바타가 바뀌었으면(옷 갈아입기) 옛 추적을 푼다
    if (player && inst.has(player)) inst.release(player);
  }

  // 3) 먼 소품 덩어리 숨기기 (안개 밖 · 0.5px 미만)
  const cull = F.propcull ? createPropCull({}) : null;
  out.cull = cull;
  const lmSeen = new WeakMap();
  function discoverCull() {
    if (!cull) { fogCullQueue.length = 0; return; }
    const player = getPlayer();
    for (const c of scene.children) {
      if (c === corridorRoot || c === inst?.group || c === player || c.isLight || c.isCamera || c.userData?.perfNoCull) continue;
      if (c.userData?.rig || inst?.has(c) || bikes?.list?.some((b) => b.mesh === c)) continue; // 인스턴싱 대상은 instancer 가 화면 크기로 거른다
      if (!c.isMesh && !c.isGroup && c.type !== 'Object3D') continue;
      cull.add(c);
    }
    // [jamsil-perf] 코리더 안의 칸 메시(한강 길·소품, 경부 노면 글자)도 안개 밖이면 뺀다
    while (fogCullQueue.length) { const m = fogCullQueue.pop(); if (m.parent) cull.add(m); }
    // [station-loop] 남산·한강 다리도 안개(보통 1.6 km)에 완전히 묻히면 뺀다. 강남·탄천합수부에서 안 보이는 남산 길·실내·케이블카와
    //   잠수교·반포대교 부품이 2천 draw 가까이 그려지고 있었다. 남산 산·타워는 하늘에 실루엣이 남으니 그대로 둔다. ?landmarkcull=0 이면 끔.
    if (LANDMARK_CULL && corridorRoot) for (const top of corridorRoot.children) {
      if (top.name !== 'namsan' && top.name !== 'hangang') continue;
      const key = top.children.length + ':' + (top.children[top.children.length - 1]?.children.length || 0);
      if (lmSeen.get(top) === key) continue; // 매초 한강 1.5만 객체를 훑지 않게, 바뀌었을 때만
      lmSeen.set(top, key);
      if (top.name === 'namsan') {
        for (const c of top.children) if (/^namsan-/.test(c.name) && !/^namsan-(terrain|tower|sky|stars)/.test(c.name)) cull.add(c, { maxTopY: Infinity });
      } else if (top.name === 'hangang') {
        top.traverse((g) => { if (g.name === 'hangang-bridges' || g.name === 'hap-bridges' || g.name === 'hangang-hap-underpasses') for (const c of g.children) if (!c.isLight) cull.add(c); });
      }
    }
  }
  discover(); discoverCull();
  out.stats.mountMs = Math.round(performance.now() - t0); out.stats.mergeMs = Math.round(mergeMs);

  let acc = 0, last = performance.now();
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (r, s, c, rt) {
    prev.call(this, r, s, c, rt);
    const now = performance.now(); acc += (now - last) / 1000; last = now;
    if (acc > 1) { acc = 0; discover(); discoverCull(); }
    if (cull && c === camera) cull.sync(r, s, c);
    inst?.sync(r, c, s.fog);
  };
  out.check = () => out.merges.map((m) => ({ name: m.name, changed: m.watch() }));
  out.summary = () => ({
    flags: F, mountMs: out.stats.mountMs, mergeMs: out.stats.mergeMs,
    merges: out.merges.map(({ watch, ...m }) => m),
    instancer: inst ? { ...inst.stats } : null,
    cull: cull ? { ...cull.stats } : null,
    regions: corridor?.regions?.status?.() || null,
  });
  out.dispose = () => { scene.onBeforeRender = prev; inst?.dispose(); cull?.dispose(); };
  return out;
}
