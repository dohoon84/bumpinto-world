// [namsan] 남산서울타워(N서울타워) — OSM 실제 좌표·표고 위에 절차적 타워·지형·실내·케이블카.
//   기본 켜짐. ?ntower=0 이면 전부 끄고, ?ncable=0 이면 케이블카만 끈다.
//   브랜드 로고/실제 매장명/마스코트 없음. 층별 안내는 일반 이름만 쓴다.
import * as THREE from 'three';
import { watchEvening } from '../../evening.js';
import { NT, namsanBaseY, inNamsanPark } from './namsanCoords.js';
import { createNamsanTerrain } from './namsanTerrain.js';
import { createNamsanTower } from './namsanTower.js';
import { createNamsanInterior } from './namsanInterior.js';
import { createNamsanCable } from './namsanCable.js';
import { createNamsanCity } from './namsanCity.js';
import { createNamsanRoads } from './namsanRoads.js';
import { createNamsanLibrary } from './namsanLibrary.js';
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

/** 미니맵용: 시가지 도로·건물 + 광장 윤곽 + 케이블카 선 (좌표만, 복사 최소화) */
export function namsanMini(city, osm, heightAt) {
  const roads = city?.roads || [];
  const buildings = (city?.buildings || []).filter((b) => {
    const o = b.o;
    if (!o || o.length < 3) return false;
    let x = 0, z = 0;
    for (const p of o) { x += p[0]; z += p[1]; }
    return !inNamsanPark(x / o.length, z / o.length, osm?.parks, heightAt);
  });
  const extraRoads = [];
  for (const w of osm?.ways || []) {
    if (w.pts?.length >= 2) extraRoads.push({ k: w.k, p: w.pts, w: w.w });
  }
  const nodes = osm?.cable?.nodes;
  if (nodes?.length >= 2) extraRoads.push({ k: 'aerialway', p: nodes.map((n) => [n.x, n.z]), w: 3 });
  const plazas = [];
  if (osm?.tower?.outer?.length >= 3) plazas.push({ o: osm.tower.outer });
  const extraB = [];
  for (const key of ['upperStation', 'lowerStation', 'loveLockShop', 'palgakjeong', 'bongsu', 'library']) {
    const pts = osm?.[key]?.pts;
    if (pts?.length >= 3) extraB.push({ o: pts });
  }
  return {
    roads: extraRoads.length ? roads.concat(extraRoads) : roads,
    buildings: extraB.length ? buildings.concat(extraB) : buildings,
    plazas,
    parks: (osm?.parks || []).filter((p) => p.o?.length >= 3).map((p) => ({ o: p.o })),
    water: [],
    waterLines: [],
  };
}

export function createNamsan({ scene, overlay, terrain, dem, osm, city = null, cable = true, renderer = null } = {}) {
  const root = new THREE.Group();
  root.name = 'namsan';
  scene.add(root);

  const land = createNamsanTerrain({ parent: root, dem, osm });
  const tower = createNamsanTower({ parent: root, osm, baseY: land.baseY, env: null, renderer });
  const interior = createNamsanInterior({ parent: root, osm, baseY: land.baseY, tower });
  const car = cable ? createNamsanCable({ parent: root, osm, heightAt: land.heightAt, overlay, baseY: land.baseY }) : null;
  const roads = createNamsanRoads({ parent: root, osm, heightAt: land.heightAt, overlay });
  roads.setDoor?.(tower.door);
  const library = createNamsanLibrary({ parent: root, osm, heightAt: land.heightAt, overlay });
  const downtown = createNamsanCity({ parent: root, data: city, heightAt: land.heightAt, parks: osm?.parks || [], osm });

  // 원점 하늘 돔(r=3000)은 남산(약 23 km)에 닿지 않는다. 플레이어를 따라가는
  // 남산 전용 하늘을 두고, 톤매핑에 짓눌리지 않는 남색으로 칠한다.
  const skyDay = new THREE.Color('#87a0c0');
  const skyNight = new THREE.Color('#3d5a86');
  const skyMat = new THREE.MeshBasicMaterial({
    color: skyNight.clone(), side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 40, 24), skyMat);
  sky.position.set(NT.tx, 220, NT.tz);
  sky.name = 'namsan-sky';
  sky.renderOrder = -20;
  sky.frustumCulled = false;
  root.add(sky);

  // faint stars around Namsan (the origin sky dome does not reach this far)
  const STAR_N = 2800;
  const starPos = new Float32Array(STAR_N * 3);
  let ss = 4797;
  const sr = () => ((ss = (ss * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < STAR_N; i++) {
    const az = sr() * Math.PI * 2;
    const el = 0.12 + sr() * 1.38;
    const r = 700 + sr() * 1100;
    starPos[i * 3] = NT.tx + Math.cos(el) * Math.sin(az) * r;
    starPos[i * 3 + 1] = Math.sin(el) * r + 200;
    starPos[i * 3 + 2] = NT.tz - Math.cos(el) * Math.cos(az) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: '#eef3fb', size: 1.85, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'namsan-stars';
  stars.frustumCulled = false;
  root.add(stars);

  if (overlay) {
    overlay.add({
      cls: 'label landmark',
      text: '🏙️ 남산서울타워 Namsan Seoul Tower · 236.7m',
      getPos: () => new THREE.Vector3(NT.tx, land.baseY + NT.height + 18, NT.tz),
      maxDist: 12000,
      minDist: 80,
    });
    if (tower.door) {
      overlay.add({
        cls: 'label',
        text: '🚪 타워 입구',
        getPos: () => new THREE.Vector3(
          tower.door.x + (tower.door.nx || 0) * 1.4,
          land.baseY + 4.4,
          tower.door.z + (tower.door.nz || 0) * 1.4,
        ),
        maxDist: 260,
        minDist: 6,
      });
    }
    const namedBuildings = [
      osm?.palgakjeong && { name: osm.palgakjeong.tags?.name || '남산팔각정', pts: osm.palgakjeong.pts },
      osm?.bongsu && { name: osm.bongsu.tags?.name || '남산봉수대', pts: osm.bongsu.pts },
    ];
    for (const b of namedBuildings) {
      if (!b?.pts || b.pts.length < 3) continue;
      let x = 0, z = 0;
      for (const p of b.pts) { x += p[0]; z += p[1]; }
      x /= b.pts.length; z /= b.pts.length;
      // OSM 실제 위치(팔각정 ~64 m WNW, 봉수대 ~104 m WNW). 광장 동쪽에서
      // 보면 입구와 한 줄로 겹치므로 가까이 가야 보이게 거리를 줄인다.
      overlay.add({
        cls: 'label landmark',
        text: b.name,
        getPos: () => new THREE.Vector3(x, land.heightAt(x, z) + 5.4, z),
        maxDist: 100,
        minDist: 8,
      });
    }
    for (const lm of osm?.landmarks || []) {
      if (!lm?.name || !Number.isFinite(lm.x)) continue;
      // Guidepost 14279259878 reads '한양도성 유적전시관 / 남산도서관' and would
      // sit on top of the new 남산도서관 label ~90 m west. Keep the node in
      // OSM data; skip the overlapping world label.
      if (lm.id === 14279259878 || (lm.k === 'guidepost' && (lm.name || '').includes('남산도서관'))) continue;
      overlay.add({
        cls: 'label landmark',
        text: lm.name,
        getPos: () => new THREE.Vector3(lm.x, land.heightAt(lm.x, lm.z) + 3.4, lm.z),
        maxDist: 200,
        minDist: 6,
      });
    }
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
    roads.setNight?.(on ? 1 : 0);
    library.setNight?.(on ? 1 : 0);
    downtown.setNight(on ? 1 : 0);
    starMat.opacity = on ? 0.88 : 0;
    stars.visible = !!on;
    skyMat.color.copy(skyDay).lerp(skyNight, on ? 1 : 0);
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
    const ly = library.floorY?.(x, z, refY);
    if (ly != null) ys.push(ly);
    const ry = roads.floorY?.(x, z, refY);
    if (ry != null) ys.push(ry);
    let best = null;
    const cap = Number.isFinite(refY) ? refY + 0.55 : Infinity;
    for (const y of ys) {
      if (y == null || y > cap) continue;
      if (best == null || y > best) best = y;
    }
    return best;
  }

  function isBlocked(x, z, r = 0.4) {
    return !!(tower.isBlocked?.(x, z, r) || interior.isBlocked?.(x, z, r) || car?.isBlocked?.(x, z, r) || land.isBlocked?.(x, z, r) || library.isBlocked?.(x, z, r));
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
    get roads() { return roads; },
    get library() { return library; },
    mini: namsanMini(city, osm, land.heightAt), // [hud-v3-minimap] 광장·도로·케이블카·공원
    stage(u) { car?.stage?.(u); },
    tickPlayer(dt, player, cam) {
      interior.tickPlayer?.(dt, player, cam);
      car?.tickPlayer?.(dt, player, cam);
      // 원점 하늘 돔은 남산(23 km)에 닿지 않는다. 남산 전용 구를 카메라에 붙인다.
      const cam3 = (typeof window !== 'undefined' && window.__jj?.camera) || null;
      if (cam3?.position) sky.position.copy(cam3.position);
      else if (player?.position) sky.position.copy(player.position);
      if (player && Math.hypot(player.position.x - NT.tx, player.position.z - NT.tz) < 2800) {
        document.getElementById('stop-panel')?.classList.remove('open');
        document.getElementById('corridor-stop-panel')?.classList.remove('open');
      }
    },
    update(dt) {
      tower.update?.(dt);
      interior.update?.(dt);
      car?.update?.(dt);
      roads.update?.(dt);
      downtown.update?.(dt);
    },

    setNight(v) {
      night = v;
      tower.setNight(v);
      interior.setNight(v);
      car?.setNight(v);
      land.setNight(v);
      roads.setNight?.(v);
      library.setNight?.(v);
      downtown.setNight(v);
      starMat.opacity = Math.max(0, Math.min(1, v)) * 0.88;
      stars.visible = v > 0.08;
      skyMat.color.copy(skyDay).lerp(skyNight, Math.max(0, Math.min(1, v)));
    },
    dispose() {
      unwatch?.();
      scene.remove(root);
    },
  };
  return api;
}
