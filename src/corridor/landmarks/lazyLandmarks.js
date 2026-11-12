// [namsan] [hangang] 부트 때는 가벼운 스텁만 두고, 가까이 오면 메시를 만든다.
import { NT } from './namsanCoords.js';
import { namsanMini } from './namsan.js';
import { hangangMini } from './hangang.js';
import { mergeHangangMini } from './hangangHap.js';
import { makeNamsanHeightAt } from './namsanTerrain.js';
import { makeHangangHeightAt } from './hangangTerrain.js';

export function landmarkLazyEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('lazylandmark') !== '0';
}

/** 안개 far(1800m). 텔레포트·?at= 는 이 안에 들어올 때만 기다린다. */
export const LANDMARK_NEAR_M = 1800;
/** 접근 중 미리 짓기(안개보다 훨씬 앞). 자전거 8.6 m/s × 여유 시간. */
export const LANDMARK_PREFETCH_M = 8000;
/** 한 조각 JS 예산. 200ms 목표에서 GPU를 빼고도 여유. */
export const LANDMARK_SLICE_MS = 8;

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
  const dem = data?.dem, osm = data?.osm, city = data?.city;
  const bounds = demBounds(dem);
  const heightAt = dem ? makeNamsanHeightAt(dem, osm) : null;
  const spawn = { x: NT.tx + 44, z: NT.tz + 6 };
  const y = heightAt?.(spawn.x, spawn.z);
  spawn.y = (y ?? 0) + 0.15;
  return {
    bounds,
    boxes: bounds ? [bounds] : [],
    spawn,
    spawnY: () => (heightAt?.(spawn.x, spawn.z) ?? spawn.y - 0.15) + 0.15,
    mini: namsanMini(city, osm, heightAt || (() => 0)),
  };
}

export function makeHangangMeta(data) {
  const dem = data?.dem, osm = data?.osm, hap = data?.hap;
  const b1 = demBounds(dem);
  const b2 = demBounds(hap?.dem);
  const boxes = [b1, b2].filter(Boolean);
  const bounds = boxes.length
    ? {
      x0: Math.min(...boxes.map((b) => b.x0)),
      x1: Math.max(...boxes.map((b) => b.x1)),
      z0: Math.min(...boxes.map((b) => b.z0)),
      z1: Math.max(...boxes.map((b) => b.z1)),
    }
    : null;
  const spawnSrc = osm?.spawn || osm?.connectEnds?.jamsuSouth;
  const spawn = spawnSrc
    ? { x: spawnSrc.x, z: spawnSrc.z, name: spawnSrc.name || '잠수교 남단' }
    : { x: -9741.7, z: -15961.4, name: '잠수교 남단' };
  const heightAt = dem ? makeHangangHeightAt(dem, osm) : null;
  const hapHeight = hap?.dem ? makeHangangHeightAt(hap.dem, hap.osm) : null;
  const yAt = (x, z) => {
    const a = heightAt?.(x, z);
    if (a != null) return a;
    return hapHeight?.(x, z);
  };
  spawn.y = (yAt(spawn.x, spawn.z) ?? 0) + 0.15;
  return {
    bounds,
    boxes,
    spawn,
    spawnY: () => (yAt(spawn.x, spawn.z) ?? spawn.y - 0.15) + 0.15,
    mini: mergeHangangMini(hangangMini(osm), hap?.osm ? hangangMini(hap.osm) : null),
    spawns: { ...(hap?.osm?.spawns || {}) },
    connectEnds: { ...(osm?.connectEnds || {}), ...(hap?.osm?.connectEnds || {}) },
  };
}

export function wrapLandmark(meta) {
  let impl = null;
  return {
    get ready() { return !!impl; },
    spawn: meta.spawn,
    bounds: meta.bounds,
    boxes: meta.boxes || (meta.bounds ? [meta.bounds] : []),
    mini: meta.mini,
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
      if (t - last >= budgetMs) {
        const jsMs = +(t - last).toFixed(2);
        const y0 = now();
        await yieldFn();
        publish({ name: label || name, jsMs, yieldMs: +(now() - y0).toFixed(2) });
        last = now();
      }
    },
    flush(label) {
      const t = now();
      if (t - last > 1) publish({ name: label || name, jsMs: +(t - last).toFixed(2) });
      last = now();
    },
    maxJs() { return slices.reduce((m, s) => Math.max(m, s.jsMs || 0), 0); },
  };
}
