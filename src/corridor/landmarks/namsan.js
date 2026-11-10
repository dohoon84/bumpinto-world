// [namsan] 남산서울타워(N서울타워) — OSM 실제 좌표·표고 위에 절차적 타워·지형·실내·케이블카.
//   기본 켜짐. ?ntower=0 이면 전부 끄고, ?ncable=0 이면 케이블카만 끈다.
//   브랜드 로고/실제 매장명/마스코트 없음. 층별 안내는 일반 이름만 쓴다.
import * as THREE from 'three';
import { watchEvening } from '../../evening.js';
import { NT, namsanBaseY } from './namsanCoords.js';
import { createNamsanTerrain } from './namsanTerrain.js';
import { createNamsanTower } from './namsanTower.js';
import { createNamsanInterior } from './namsanInterior.js';
import { createNamsanCable } from './namsanCable.js';
import { createNamsanCity } from './namsanCity.js';
export { NT, namsanBaseY } from './namsanCoords.js';

export const NAMSAN_DEM_FILE = 'namsan/namsan-dem.json';
export const NAMSAN_OSM_FILE = 'namsan/namsan-osm.json';
export const NAMSAN_CITY_FILE = 'namsan/namsan-city.json';

export function namsanEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('ntower') !== '0';
}
export function namsanCableEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return namsanEnabled(search) && new URLSearchParams(search || '').get('ncable') !== '0';
}

// 상수 NT 는 namsanCoords.js (순환 import 방지).
export function createNamsan({ scene, overlay, terrain, dem, osm, city = null, cable = true, renderer = null } = {}) {
  const root = new THREE.Group();
  root.name = 'namsan';
  scene.add(root);

  const land = createNamsanTerrain({ parent: root, dem, osm });
  const tower = createNamsanTower({ parent: root, osm, baseY: land.baseY, env: null, renderer });
  const interior = createNamsanInterior({ parent: root, osm, baseY: land.baseY, tower });
  const car = cable ? createNamsanCable({ parent: root, osm, heightAt: land.heightAt, overlay, baseY: land.baseY }) : null;
  const downtown = createNamsanCity({ parent: root, data: city, heightAt: land.heightAt });

  if (overlay) {
    overlay.add({
      cls: 'label landmark',
      text: '🏙️ 남산서울타워 Namsan Seoul Tower · 236.7m',
      getPos: () => new THREE.Vector3(NT.tx, land.baseY + NT.height + 18, NT.tz),
      maxDist: 12000,
      minDist: 80,
    });
  }

  const spawn = (() => {
    // 광장 동쪽 입구 광장 바닥 (건물 외곽 ~35 m, 지붕이 아님)
    const x = NT.tx + 44;
    const z = NT.tz + 6;
    return { x, z, y: land.heightAt(x, z) + 0.15 };
  })();

  const unwatch = watchEvening((on) => {
    tower.setNight(on ? 1 : 0);
    interior.setNight(on ? 1 : 0);
    car?.setNight(on ? 1 : 0);
    land.setNight(on ? 1 : 0);
    downtown.setNight(on ? 1 : 0);
  });

  if (terrain?.addGroundExtra) {
    terrain.addGroundExtra((x, z, refY) => {
      const y = surfaceY(x, z, refY);
      return y;
    });
  }

  function surfaceY(x, z, refY = Infinity) {
    const ys = [];
    const ground = land.heightAt(x, z);
    if (Number.isFinite(ground)) ys.push(ground);
    const iy = interior.floorY?.(x, z, refY);
    if (iy != null) ys.push(iy);
    const ty = tower.floorY?.(x, z, refY);
    if (ty != null) ys.push(ty);
    const cy = car?.floorY?.(x, z, refY);
    if (cy != null) ys.push(cy);
    let best = null;
    const cap = Number.isFinite(refY) ? refY + 0.55 : Infinity;
    for (const y of ys) {
      if (y == null || y > cap) continue;
      if (best == null || y > best) best = y;
    }
    return best;
  }

  function isBlocked(x, z, r = 0.4) {
    return !!(tower.isBlocked?.(x, z, r) || interior.isBlocked?.(x, z, r) || car?.isBlocked?.(x, z, r) || land.isBlocked?.(x, z, r));
  }

  let night = 0;
  const api = {
    root,
    spawn,
    spawnY: () => land.heightAt(spawn.x, spawn.z) + 0.15,
    bounds: land.bounds,
    baseY: land.baseY,
    heightAt: (x, z) => land.heightAt(x, z),
    surfaceY,
    groundHeight: (x, z, refY) => surfaceY(x, z, refY),
    isBlocked,
    get riding() { return !!(car?.riding || interior.riding); },
    get cable() { return car; },
    get tower() { return tower; },
    get interior() { return interior; },
    get city() { return downtown; },
    stage(u) { car?.stage?.(u); },
    tickPlayer(dt, player, cam) {
      interior.tickPlayer?.(dt, player, cam);
      car?.tickPlayer?.(dt, player, cam);
      if (player && Math.hypot(player.position.x - NT.tx, player.position.z - NT.tz) < 2800) {
        document.getElementById('stop-panel')?.classList.remove('open');
        document.getElementById('corridor-stop-panel')?.classList.remove('open');
      }
    },
    update(dt) {
      tower.update?.(dt);
      interior.update?.(dt);
      car?.update?.(dt);
      downtown.update?.(dt);
    },
    setNight(v) {
      night = v;
      tower.setNight(v);
      interior.setNight(v);
      car?.setNight(v);
      land.setNight(v);
      downtown.setNight(v);
    },
    dispose() {
      unwatch?.();
      scene.remove(root);
    },
  };
  return api;
}
