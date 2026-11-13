// [namsan] [hangang] 부트 때는 가벼운 스텁만 두고, 가까이 오면 메시를 만든다.
import { NAMSAN_BOUNDS, HANGANG_BOXES, NAMSAN_SPAWN, HANGANG_SPAWN, HANGANG_HAP_SPAWNS, emptyLandmarkMini } from './landmarkBounds.js';
import { MYEONGDONG_BOUNDS, MYEONGDONG_SPAWN } from './myeongdongFlags.js'; // [myeongdong]

export function landmarkLazyEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('lazylandmark') !== '0';
}

/** 안개 far(1800m). 텔레포트·?at= 는 이 안에 들어올 때만 기다린다. */
export const LANDMARK_NEAR_M = 1800;
/** 접근 중 미리 짓기(안개보다 훨씬 앞). 자전거 8.6 m/s × 여유 시간. */
export const LANDMARK_PREFETCH_M = 8000;
/**
 * [station-loop] 한 번 지은 남산·한강을 멀리(경계에서 8 km 밖 = 처음 짓기 시작하는 거리) 떠나면 통째로 렌더·행렬 갱신에서 뺀다.
 *   예전엔 한강(1.5만 메시)·남산이 한 번 지어지면 정자에 돌아와도 계속 그려져 draw call 이 5배, 프레임 JS 가 4배가 됐다.
 *   8 km 밖은 안개(1.6 km)에 완전히 묻히고, 처음 들어올 때(아직 안 지은 상태)와 화면이 같다. 다시 7.4 km 안으로 오면 켠다.
 *   ?landmarkdorm=0 이면 예전(한강 15 km, 남산 항상).
 */
export const LANDMARK_DORMANT_M = 8000;
export const LANDMARK_WAKE_M = 7400;
export function landmarkDormEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('landmarkdorm') !== '0';
}
/** root 를 d(경계까지 거리)에 따라 켜고 끈다. 꺼진 동안은 matrixWorld 갱신도 건너뛴다. 반환: 켜져 있나 */
export function syncLandmarkDormant(root, d, { out = LANDMARK_DORMANT_M, wake = LANDMARK_WAKE_M } = {}) {
  if (!root) return false;
  const on = root.visible ? d <= out : d < wake;
  if (on !== root.visible) {
    root.visible = on;
    root.matrixWorldAutoUpdate = on;
    if (on) root.updateMatrixWorld(true);
  }
  return on;
}

/** 한 조각 JS 예산. 200ms 목표에서 GPU를 빼고도 여유. */
export const LANDMARK_SLICE_MS = 8;
/** [gangnam-enter] 텔레포트·?at= 처럼 도착이 메시를 기다리는 동안의 조각 예산. 로딩 화면·이동 대기 중이라 길게 잡아 양보 횟수를 줄인다. */
export const LANDMARK_URGENT_SLICE_MS = 40;

export function demBounds(dem) {
  if (!dem || !Number.isFinite(+dem.x0) || !Number.isFinite(+dem.nx) || !Number.isFinite(+dem.dx)) return null;
  return {
    x0: dem.x0,
    z0: dem.z0,
    x1: dem.x0 + (dem.nx - 1) * dem.dx,
    z1: dem.z0 + (dem.nz - 1) * dem.dz,
  };
}

export function makeNamsanMeta(data) {
  // [boot-fast] DEM·city JSON 파싱과 heightAt/미니맵은 부트를 막지 않는다. 경계·스폰만 상수(또는 DEM 헤더)로 둔다.
  const bounds = demBounds(data?.dem) || { ...NAMSAN_BOUNDS };
  const spawn = { x: NAMSAN_SPAWN.x, z: NAMSAN_SPAWN.z, y: NAMSAN_SPAWN.y };
  return {
    bounds,
    boxes: bounds ? [bounds] : [],
    spawn,
    spawnY: () => spawn.y,
    mini: emptyLandmarkMini(),
  };
}

/** [myeongdong] 부트 스텁: 경계·스폰만 (myeongdong.json 은 지을 때 받는다). 미니맵은 지은 뒤 impl.mini 를 쓴다. */
export function makeMyeongdongMeta() {
  const bounds = { ...MYEONGDONG_BOUNDS };
  const spawn = { ...MYEONGDONG_SPAWN };
  return { bounds, boxes: [bounds], spawn, spawnY: () => spawn.y, mini: emptyLandmarkMini(), liveMini: true };
}

export function makeHangangMeta(data) {
  // [boot-fast] heightAt·미니맵·OSM 스캔은 메시를 지을 때로 미룬다. 부트 스텁은 경계·스폰만.
  const b1 = demBounds(data?.dem) || { ...HANGANG_BOXES[0] };
  const b2 = demBounds(data?.hap?.dem) || { ...HANGANG_BOXES[1] };
  const boxes = [b1, b2].filter(Boolean);
  const bounds = boxes.length
    ? {
      x0: Math.min(...boxes.map((b) => b.x0)),
      x1: Math.max(...boxes.map((b) => b.x1)),
      z0: Math.min(...boxes.map((b) => b.z0)),
      z1: Math.max(...boxes.map((b) => b.z1)),
    }
    : null;
  const spawnSrc = data?.osm?.spawn || data?.osm?.connectEnds?.jamsuSouth;
  const spawn = spawnSrc
    ? { x: spawnSrc.x, z: spawnSrc.z, y: HANGANG_SPAWN.y, name: spawnSrc.name || HANGANG_SPAWN.name }
    : { ...HANGANG_SPAWN };
  return {
    bounds,
    boxes,
    spawn,
    spawnY: () => spawn.y,
    mini: emptyLandmarkMini(),
    spawns: { ...HANGANG_HAP_SPAWNS, ...(data?.hap?.osm?.spawns || {}) }, // [gangnam-enter] 탄천합수부·잠원 목적지가 지연 로딩에서도 남게
    connectEnds: { ...(data?.osm?.connectEnds || {}), ...(data?.hap?.osm?.connectEnds || {}) },
  };
}

export function wrapLandmark(meta) {
  let impl = null;
  return {
    get ready() { return !!impl; },
    spawn: meta.spawn,
    bounds: meta.bounds,
    boxes: meta.boxes || (meta.bounds ? [meta.bounds] : []),
    get mini() { return (meta.liveMini && impl?.mini) || meta.mini; }, // [myeongdong] 명동은 지은 뒤 실제 미니맵
    spawns: meta.spawns || {},
    connectEnds: meta.connectEnds || {},
    spawnY: (...a) => (impl?.spawnY ? impl.spawnY(...a) : meta.spawnY?.(...a) ?? (meta.spawn?.y ?? 0)),
    heightAt: (...a) => impl?.heightAt?.(...a) ?? null,
    surfaceY: (...a) => impl?.surfaceY?.(...a) ?? null,
    groundHeight: (...a) => impl?.groundHeight?.(...a) ?? null,
    owns: (...a) => impl?.owns?.(...a) ?? false,
    ownDist: (...a) => impl?.ownDist?.(...a) ?? Infinity,
    coversTileFlat: (...a) => impl?.coversTileFlat?.(...a) ?? false,
    isBlocked: (...a) => impl?.isBlocked?.(...a) ?? false,
    blockedBy: (...a) => impl?.blockedBy?.(...a) ?? null, // [walk-sweep] 무엇이 막는지 (검사용)
    walkWays: (...a) => impl?.walkWays?.(...a) ?? [], // [walk-sweep]
    tickPlayer: (...a) => impl?.tickPlayer?.(...a),
    update: (...a) => impl?.update?.(...a),
    setNight: (...a) => impl?.setNight?.(...a),
    stage: (...a) => impl?.stage?.(...a),
    dispose: (...a) => impl?.dispose?.(...a),
    get hap() { return impl?.hap; },
    get tower() { return impl?.tower; },
    get roads() { return impl?.roads; },
    get cable() { return impl?.cable; },
    get cableGuide() { return impl?.cableGuide; },
    get interior() { return impl?.interior; },
    get city() { return impl?.city; },
    get library() { return impl?.library; },
    get root() { return impl?.root; },
    get riding() { return !!impl?.riding; },
    get poolLightCount() { return impl?.poolLightCount ?? 0; },
    get revetmentView() { return impl?.revetmentView ?? null; },
    get station() { return impl?.station ?? null; }, // [myeongdong]
    get cathedral() { return impl?.cathedral ?? null; }, // [myeongdong]
    get hooks() { return impl?.hooks ?? null; }, // [myeongdong] 미니게임 A·C 훅
    get face() { return impl?.face ?? meta.face ?? null; }, // [myeongdong] 도착 때 카메라 방향
    stats: (...a) => impl?.stats?.(...a) ?? null,
    _bind(api) { impl = api; },
  };
}

export function yieldPaint() {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export function yieldMacrotask() {
  if (typeof MessageChannel === 'function') {
    return new Promise((r) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => r();
      ch.port2.postMessage(0);
    });
  }
  return new Promise((r) => setTimeout(r, 0));
}

export function yieldIdle() {
  if (typeof requestIdleCallback === 'function') {
    return new Promise((r) => requestIdleCallback(() => r(), { timeout: 32 }));
  }
  return yieldPaint();
}

export const landmarkBuildGate = { active: 0, urgent: false, frames: 0, slowGpu: false };

export function markSlowGpu(renderer) {
  try {
    const gl = renderer?.getContext?.() || renderer;
    if (!gl?.getParameter) return false;
    const ext = gl.getExtension?.('WEBGL_debug_renderer_info');
    const info = [
      ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '',
      ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : '',
      gl.getParameter(gl.RENDERER),
      gl.getParameter(gl.VENDOR),
    ].join(' ');
    const slow = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(info);
    landmarkBuildGate.slowGpu = slow;
    return slow;
  } catch {
    return false;
  }
}

export function beginLandmarkBuild(urgent = false) {
  landmarkBuildGate.active += 1;
  if (urgent) landmarkBuildGate.urgent = true;
  return () => {
    landmarkBuildGate.active = Math.max(0, landmarkBuildGate.active - 1);
    if (!landmarkBuildGate.active) landmarkBuildGate.urgent = false;
  };
}

/** SwiftShader 한 프레임이 수 초라서, 소프트웨어 GPU에서는 짓는 동안 그림을 거의 생략한다. 실제 GPU는 매 프레임 그린다. */
export function shouldSkipLandmarkPaint() {
  if (!landmarkBuildGate.active) return false;
  if (!landmarkBuildGate.slowGpu) return false;
  landmarkBuildGate.frames += 1;
  // 소프트웨어 GPU: 아주 가끔만 그려서 JS 조각이 프레임에 먹히지 않게 한다.
  return landmarkBuildGate.frames % 240 !== 1;
}

/** 긴 작업을 매크로태스크로만 끊는다. rAF/idle 을 기다리지 않는다(게임 루프가 이미 그림을 그린다). */
export function makeBuildYield({ idle = false } = {}) {
  const state = { idle: !!idle };
  async function buildYield() {
    await yieldMacrotask();
  }
  buildYield.state = state;
  return buildYield;
}

export function makeSlicer(yieldFn, { budgetMs = LANDMARK_SLICE_MS, name = '' } = {}) {
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let last = now();
  const slices = [];
  const publish = (row) => {
    slices.push(row);
    if (typeof window !== 'undefined') {
      const boot = (window.__boot ||= {});
      (boot.lazySlices ||= []).push(row);
    }
  };
  return {
    slices,
    async tick(label) {
      if (!yieldFn) return;
      const t = now();
      if (t - last >= (yieldFn.state?.budgetMs || budgetMs)) {
        const jsMs = +(t - last).toFixed(2);
        const y0 = now();
        await yieldFn();
        publish({ name: label || name, jsMs, yieldMs: +(now() - y0).toFixed(2) });
        last = now();
      }
    },
    mark() { last = now(); },
    flush(label) {
      const t = now();
      if (t - last > 1) publish({ name: label || name, jsMs: +(t - last).toFixed(2) });
      last = now();
    },
    maxJs() { return slices.reduce((m, s) => Math.max(m, s.jsMs || 0), 0); },
  };
}
