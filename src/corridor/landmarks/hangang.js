// [hangang] 한강 자전거 코스 1구간 — 반포한강공원 + 잠수교 + 반포대교.
//   기본 켜짐. ?hangang=0 이면 전부 끈다. 브랜드 로고 없음.
import * as THREE from 'three';
import { watchEvening } from '../../evening.js';
import { HG, centroid } from './hangangCoords.js';
import { createHangangTerrain } from './hangangTerrain.js';
import { createHangangBridges } from './hangangBridges.js';
import { createHangangPaths } from './hangangPaths.js';
import { createHangangCity } from './hangangCity.js';
import { createHangangProps } from './hangangProps.js';
import { createHangangHap, mergeHangangMini } from './hangangHap.js';

export const HANGANG_DEM_FILE = 'hangang/hangang-dem.json';
export const HANGANG_OSM_FILE = 'hangang/hangang-osm.json';
export const HAP_DEM_FILE = 'hangang/hap-dem.json';
export const HAP_OSM_FILE = 'hangang/hap-osm.json';

export function hangangEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('hangang') !== '0';
}

export function hangangMini(osm) {
  const extraRoads = [];
  for (const w of osm?.ways || []) {
    if (!w.pts || w.pts.length < 2) continue;
    const n = w.name || '';
    if (w.k === 'cycleway' || n.includes('자전거') || n === '잠수교' || n.includes('나들목')) {
      extraRoads.push({ k: 'cycleway', p: w.pts, w: w.w || 4 });
    } else if (n === '올림픽대로' || n === '강변북로') {
      extraRoads.push({ k: 'trunk', p: w.pts, w: w.w || 15 });
    } else if (n === '반포대로' || n === '녹사평대로') {
      extraRoads.push({ k: 'primary', p: w.pts, w: w.w || 12 });
    } else if (w.k === 'footway' || w.k === 'path' || w.k === 'pedestrian') {
      extraRoads.push({ k: 'footway', p: w.pts, w: w.w || 2.2 });
    }
  }
  if (osm?.jamsu?.centerline?.pts) extraRoads.push({ k: 'cycleway', p: osm.jamsu.centerline.pts, w: 6 });
  if (osm?.banpo?.outline?.pts) extraRoads.push({ k: 'primary', p: osm.banpo.outline.pts, w: osm.banpo.outline.widthEst || 20 });
  const parks = (osm?.parks || []).filter((p) => p.o?.length >= 3).map((p) => ({ o: p.o }));
  const water = (osm?.water?.outers || []).filter((p) => p.o?.length >= 3).map((p) => ({
    o: p.o,
    holes: (osm?.water?.inners || []).map((h) => h.o).filter((o) => o && o.length >= 3),
  }));
  const buildings = (osm?.buildings || []).filter((b) => b.o?.length >= 3).map((b) => ({ o: b.o }));
  return { roads: extraRoads, buildings, plazas: [], parks, water, waterLines: [] };
}

export function createHangang({ scene, overlay, terrain, dem, osm, hap } = {}) {
  const root = new THREE.Group();
  root.name = 'hangang';
  scene.add(root);

  const land = createHangangTerrain({ parent: root, dem, osm });
  const bridges = createHangangBridges({ parent: root, osm, land });
  const paths = createHangangPaths({ parent: root, osm, land });
  const city = createHangangCity({ parent: root, osm, land });
  const props = createHangangProps({ parent: root, osm, land });
  const hapApi = (hap?.dem && hap?.osm)
    ? createHangangHap({ parent: root, overlay, terrain, dem: hap.dem, osm: hap.osm })
    : null;

  const spawnSrc = osm?.spawn || osm?.connectEnds?.jamsuSouth;
  const spawn = spawnSrc
    ? { x: spawnSrc.x, z: spawnSrc.z, name: spawnSrc.name || '잠수교 남단' }
    : { x: -9741.7, z: -15961.4, name: '잠수교 남단' };

  if (overlay) {
    const jamsuC = osm?.jamsu?.outline?.pts ? centroid(osm.jamsu.outline.pts) : { x: spawn.x, z: spawn.z };
    overlay.add({
      cls: 'label landmark',
      text: '🌉 잠수교 Jamsugyo · 795m',
      getPos: () => new THREE.Vector3(jamsuC.x, bridges.jamsuY(jamsuC.x, jamsuC.z) + 6, jamsuC.z),
      maxDist: 9000,
      minDist: 40,
    });
    const banpoC = osm?.banpo?.outline?.pts ? centroid(osm.banpo.outline.pts) : jamsuC;
    overlay.add({
      cls: 'label landmark',
      text: '🌉 반포대교 Banpo Bridge',
      getPos: () => new THREE.Vector3(banpoC.x, bridges.banpoY(banpoC.x, banpoC.z) + 8, banpoC.z),
      maxDist: 9000,
      minDist: 80,
    });
    const parkC = osm?.park?.ring?.pts ? centroid(osm.park.ring.pts) : { x: spawn.x - 200, z: spawn.z + 80 };
    overlay.add({
      cls: 'label landmark',
      text: '🌳 반포한강공원 Banpo Hangang Park',
      getPos: () => new THREE.Vector3(parkC.x, (land.heightAt(parkC.x, parkC.z) ?? land.waterY) + 8, parkC.z),
      maxDist: 8000,
      minDist: 40,
    });
  }

  function surfaceY(x, z, refY = Infinity) {
    if (hapApi?.isTunnel?.(x, z)) {
      const hy = hapApi.surfaceY?.(x, z, refY);
      if (hy != null) return hy;
    }
    if (paths.isTunnel?.(x, z)) {
      const py = paths.floorY?.(x, z, refY);
      if (py != null) return py;
    }
    const ys = [];
    const g = land.heightAt(x, z);
    if (g != null) ys.push(g);
    const by = bridges.floorY?.(x, z, refY);
    if (by != null) ys.push(by);
    const py = paths.floorY?.(x, z, refY);
    if (py != null) ys.push(py);
    if (hapApi) {
      const hy = hapApi.surfaceY?.(x, z, refY);
      if (hy != null) ys.push(hy);
    }
    let best = null;
    const cap = Number.isFinite(refY) ? refY + 0.55 : Infinity;
    for (const y of ys) {
      if (y == null || y > cap) continue;
      if (best == null || y > best) best = y;
    }
    return best;
  }

  if (terrain?.addGroundSurface) {
    terrain.addGroundSurface((x, z, refY) => {
      const boxes = [land.bounds, hapApi?.bounds].filter(Boolean);
      if (!boxes.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1)) return null;
      return surfaceY(x, z, refY);
    });
  }

  const unwatch = watchEvening((on) => {
    land.setNight(on ? 1 : 0);
    bridges.setNight(on ? 1 : 0);
    paths.setNight(on ? 1 : 0);
    city.setNight?.(on ? 1 : 0);
    props.setNight?.(on ? 1 : 0);
    hapApi?.setNight?.(on ? 1 : 0);
  });

  const bounds = hapApi?.bounds ? {
    x0: Math.min(land.bounds.x0, hapApi.bounds.x0),
    x1: Math.max(land.bounds.x1, hapApi.bounds.x1),
    z0: Math.min(land.bounds.z0, hapApi.bounds.z0),
    z1: Math.max(land.bounds.z1, hapApi.bounds.z1),
  } : land.bounds;

  const api = {
    root,
    spawn,
    spawnY: () => {
      const prefer = (land.levels?.waterY ?? land.waterY ?? -43) + 4;
      return (surfaceY(spawn.x, spawn.z, prefer) ?? land.heightAt(spawn.x, spawn.z) ?? land.waterY) + 0.15;
    },
    bounds,
    heightAt: (x, z) => {
      const a = land.heightAt(x, z);
      const b = hapApi?.heightAt?.(x, z);
      if (a == null) return b ?? null;
      if (b == null) return a;
      return Math.max(a, b);
    },
    surfaceY,
    groundHeight: (x, z, refY) => surfaceY(x, z, refY),
    levels: land.levels,
    revetmentView: land.revetmentView || null,
    connectEnds: { ...(osm?.connectEnds || {}), ...(hapApi?.connectEnds || {}) },
    spawns: hapApi?.spawns || {},
    hap: hapApi,
    mini: mergeHangangMini(hangangMini(osm), hapApi ? hangangMini(hap?.osm) : null),
    setNight(v) {
      land.setNight(v);
      bridges.setNight(v);
      paths.setNight(v);
      city.setNight?.(v);
      props.setNight?.(v);
      hapApi?.setNight?.(v);
    },
    update() {},
    tickPlayer(_dt, player) {
      const px = player?.position?.x, pz = player?.position?.z;
      if (px == null) return;
      hapApi?.updateLights?.(px, pz);
    },
    dispose() {
      unwatch?.();
      scene.remove(root);
    },
  };
  return api;
}
