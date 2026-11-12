// [hangang] 한강 자전거 코스 1구간 — 반포한강공원 + 잠수교 + 반포대교.
//   기본 켜짐. ?hangang=0 이면 전부 끈다. 브랜드 로고 없음.
import * as THREE from 'three';
import { watchEvening } from '../../evening.js';
import { HG, centroid } from './hangangCoords.js';
import { createHangangTerrain, createHangangTerrainAsync } from './hangangTerrain.js';
import { createHangangBridges } from './hangangBridges.js';
import { createHangangPaths, createHangangPathsAsync } from './hangangPaths.js';
import { createHangangCity, createHangangCityAsync } from './hangangCity.js';
import { createHangangProps, createHangangPropsAsync } from './hangangProps.js';
import { createHangangHap, createHangangHapAsync, mergeHangangMini } from './hangangHap.js';
import { syncLandmarkDormant, landmarkDormEnabled } from './lazyLandmarks.js'; // [station-loop]
const DORM = landmarkDormEnabled();

export { HANGANG_DEM_FILE, HANGANG_OSM_FILE, HAP_DEM_FILE, HAP_OSM_FILE, HANGANG_TERRAIN_BAKE_FILE, HAP_TERRAIN_BAKE_FILE, hangangEnabled } from './hangangFlags.js';

// 점 (x, z) 에서 사각형 b 까지 거리 (안이면 0)
function rectDist(b, x, z) {
  if (!b) return Infinity;
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
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

export function createHangang({ scene, overlay, terrain, dem, osm, hap, foreign = null } = {}) {
  const root = new THREE.Group();
  root.name = 'hangang';
  scene.add(root);

  const land = createHangangTerrain({ parent: root, dem, osm });
  const bridges = createHangangBridges({ parent: root, osm, land });
  const paths = createHangangPaths({ parent: root, osm, land });
  // 2구간이 있으면 그 pathWestClip 동쪽 올림픽대로는 2구간이 깐다 (겹침·DEM 밖 −43 m 리본 방지).
  const city = createHangangCity({ parent: root, osm, land, expressXMax: hap?.osm?.meta?.pathWestClip ?? null });
  const props = createHangangProps({ parent: root, osm, land });
  const hapApi = (hap?.dem && hap?.osm)
    ? createHangangHap({ parent: root, overlay, terrain, dem: hap.dem, osm: hap.osm, foreign })
    : null;
  return finishHangang({ scene, overlay, terrain, dem, osm, hap, foreign, root, land, bridges, paths, city, props, hapApi });
}

function finishHangang({ scene, overlay, terrain, dem, osm, hap, foreign, root, land, bridges, paths, city, props, hapApi }) {
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

  // [hangang-isolation] 한강이 "자기 땅"으로 쓰는 곳: 1구간 DEM 사각형, 또는 2구간 DEM 사각형 중
  //   다른 섬(정자·탄천 본선, 강남역, 경부 띠) 밖이거나 합수부 사각형 안. 그 밖에서는 땅 높이·안개·카메라·
  //   미니맵·조명 모두 손대지 않는다.
  const boxes = [land.bounds, hapApi?.bounds].filter(Boolean);
  const inBox = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  const isForeign = typeof foreign === 'function' ? foreign : () => false;
  function owns(x, z) {
    if (inBox(land.bounds, x, z) && !isForeign(x, z)) return true;
    return !!(hapApi?.bounds && inBox(hapApi.bounds, x, z) && hapApi.owns(x, z));
  }
  // 한강 땅까지 거리 근사: 사각형 밖이면 사각형 거리, 사각형 안인데 다른 섬이면 Infinity(멀다)
  function ownDist(x, z) {
    if (owns(x, z)) return 0;
    // 사각형 안인데 다른 섬이면 Infinity(멀다). 2구간 박스가 강남역을 덮어도,
    // 1구간(반포)까지 거리가 1 km 쯤이라 조명이 켜진 채로 남을 수 있다.
    if (boxes.some((b) => inBox(b, x, z))) return Infinity;
    let d = Infinity;
    for (const b of boxes) d = Math.min(d, rectDist(b, x, z));
    return d;
  }

  function surfaceY(x, z, refY = Infinity) {
    if (!owns(x, z)) return null;
    if (hapApi?.isTunnel?.(x, z)) {
      const hy = hapApi.surfaceY?.(x, z, refY);
      if (hy != null) return hy;
    }
    if (paths.isTunnel?.(x, z)) {
      const py = paths.floorY?.(x, z, refY);
      if (py != null) return py;
    }
    const ys = [];
    const g = isForeign(x, z) ? null : land.heightAt(x, z);
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
    terrain.addGroundSurface((x, z, refY) => surfaceY(x, z, refY));
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

  // [hangang-isolation] 점광원(가로등·반포대교 아랫면 풀)은 한강 구간 근처에서만 켠다.
  const poolLights = [];
  root.traverse((o) => { if (o.isLight) poolLights.push(o); });
  let lightsOn = true, lightT = 1, lastLX = Infinity, lastLZ = Infinity;
  function setLightsVisible(v) {
    lightsOn = v;
    for (const l of poolLights) l.visible = v;
  }
  setLightsVisible(false); // 첫 tickPlayer 에서 플레이어 위치로 정한다 (기본 스폰은 정자)

  const api = {
    root,
    poolLightCount: poolLights.length,
    owns,
    ownDist,
    boxes,
    spawn,
    spawnY: () => {
      const prefer = (land.levels?.waterY ?? land.waterY ?? -43) + 4;
      return (surfaceY(spawn.x, spawn.z, prefer) ?? land.heightAt(spawn.x, spawn.z) ?? land.waterY) + 0.15;
    },
    bounds,
    heightAt: (x, z) => {
      const a = isForeign(x, z) ? null : land.heightAt(x, z);
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
    coversTileFlat: (x, z) => !!hapApi?.coversTileFlat?.(x, z),
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
    tickPlayer(dt, player) {
      const px = player?.position?.x, pz = player?.position?.z;
      if (px == null) return;
      // [hangang-isolation] 한강 구간 밖(정자·서현·강남·남산)에서는 한강 점광원을 셰이더에서 뺀다.
      //   점광원 풀은 구간 근처(경계 +800 m)에서만 보이고, 멀어지면(+1200 m) 숨긴다(경계에서 깜빡임 방지).
      //   보이는 점광원 수가 바뀔 때만 셰이더가 한 번 다시 컴파일된다.
      const d = ownDist(px, pz);
      if (lightsOn && d > 1200) setLightsVisible(false);
      else if (!lightsOn && d < 800) setLightsVisible(true);
      // 카메라 far(14 km) 밖이면 한강 메시 1만여 개를 프러스텀 검사에서도 뺀다. 화면은 같다.
      if (DORM) syncLandmarkDormant(root, rectDist(bounds, px, pz)); // [station-loop] 8 km 밖이면 통째로 뺀다
      else root.visible = rectDist(bounds, px, pz) < 15000;
      if (!lightsOn) return;
      lightT += dt || 0;
      if (lightT < 0.2 && Math.abs(px - lastLX) + Math.abs(pz - lastLZ) < 6) return;
      lightT = 0; lastLX = px; lastLZ = pz;
      props.updateLights?.(px, pz);
      bridges.updateLights?.(px, pz);
      hapApi?.updateLights?.(px, pz);
    },
    dispose() {
      unwatch?.();
      scene.remove(root);
    },
  };
  return api;
}

export async function createHangangAsync({ scene, overlay, terrain, dem, osm, hap, foreign = null, bakeUrl = null } = {}, yieldFn, slicer) {
  const y = yieldFn || (typeof requestAnimationFrame === 'function'
    ? () => new Promise((r) => requestAnimationFrame(() => r()))
    : () => Promise.resolve());
  const root = new THREE.Group();
  root.name = 'hangang';
  root.visible = false; // 짓는 동안은 안 보이게. 끝나면 킨다.
  scene.add(root);

  const land = await createHangangTerrainAsync({ parent: root, dem, osm, bakeUrl }, y, slicer);
  if (slicer) slicer.flush('hangang-s1-terrain');
  await y();
  const bridges = createHangangBridges({ parent: root, osm, land });
  if (slicer) slicer.flush('hangang-s1-bridges');
  await y();
  const paths = slicer
    ? await createHangangPathsAsync({ parent: root, osm, land }, slicer)
    : createHangangPaths({ parent: root, osm, land });
  if (slicer) slicer.flush('hangang-s1-paths');
  else await y();
  const city = slicer
    ? await createHangangCityAsync({ parent: root, osm, land, expressXMax: hap?.osm?.meta?.pathWestClip ?? null }, slicer)
    : createHangangCity({ parent: root, osm, land, expressXMax: hap?.osm?.meta?.pathWestClip ?? null });
  if (slicer) slicer.flush('hangang-s1-city');
  else await y();
  const props = slicer
    ? await createHangangPropsAsync({ parent: root, osm, land }, slicer)
    : createHangangProps({ parent: root, osm, land });
  if (slicer) slicer.flush('hangang-s1-props');
  await y();
  const hapApi = (hap?.dem && hap?.osm)
    ? await createHangangHapAsync({ parent: root, overlay, terrain, dem: hap.dem, osm: hap.osm, foreign, bakeUrl: hap.bakeUrl || null }, y, slicer)
    : null;
  await y();
  const api = finishHangang({ scene, overlay, terrain, dem, osm, hap, foreign, root, land, bridges, paths, city, props, hapApi });
  root.visible = true;
  return api;
}

