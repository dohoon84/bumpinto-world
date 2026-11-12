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

/** 안개 far(1800m). 남산 타워~한강 남단이 약 1.9km라 더 넓히면 둘을 같이 짓는다. */
export const LANDMARK_NEAR_M = 1800;

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
