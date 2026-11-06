// [cityhall] 성남시청 일대 — 야탑 코리더 타일(3_-12 등) 위에 덧붙이는 지연 로드 랜드마크.
//   ?cityhall=1 일 때만 요청·메시·타일 억제. 기본 OFF → 플래그 없으면 기존 월드와 동일.
//   OSM 외곽(public/corridor/cityhall/index.json) + Blender GLB 본관 + 절차적 광장/분수.
import * as THREE from 'three';
import { buildSeongnamCityHall, disposeCityHallMaterials } from './landmarks/seongnamCityHall.js';

export const CITYHALL_DIR = 'cityhall/';
export const CITYHALL_FILE = CITYHALL_DIR + 'index.json';
export const CITYHALL_GLB = CITYHALL_DIR + 'building.glb';

export function cityhallEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search).get('cityhall') === '1';
}

const cen = (o) => { let x = 0, z = 0; for (const p of o) { x += p[0]; z += p[1]; } return [x / o.length, z / o.length]; };

// 코리더 타일 JSON 을 복사해 시청 본관·부속 건물에 nr 을 켠다(원본 객체/파일은 그대로).
export function filterCityHallHidden(data, tileJson) {
  if (!data?.suppress || !tileJson?.b?.length) return tileJson;
  const { centers, radius } = data.suppress;
  let hit = 0;
  const b = tileJson.b.map((building) => {
    if (!building.o?.length || building.nr) return building;
    const [x, z] = cen(building.o);
    if (!centers.some(([cx, cz]) => Math.hypot(x - cx, z - cz) <= radius)) return building;
    hit++;
    // Raised landmark (pilotis undercroft is walkable). mh>=2.5 skips tile colliders
    // (tileMesh buildDetailTile); cityhall.isBlocked owns pillars/core/wall/pond.
    return { ...building, nr: 1, mh: Math.max(building.mh || 0, 8), lm: 'seongnamCityHall' };
  });
  return hit ? { ...tileJson, b } : tileJson;
}

export function createCityHall({ data, scene, overlay = null, env = null, baseUrl = '' } = {}) {
  if (!data?.building) return null;
  const glbUrl = baseUrl ? (baseUrl + CITYHALL_GLB) : null;
  const built = buildSeongnamCityHall(data, { env, glbUrl });
  scene.add(built.group);
  let label = null;
  if (overlay && data.building.pos) {
    const p = data.building.pos;
    const y = (data.building.h || 40) + 6;
    label = overlay.add({
      cls: 'label landmark',
      text: '🏛 성남시청',
      getPos: () => new THREE.Vector3(p.x, y, p.z),
      maxDist: 900,
      minDist: 40,
    });
  }
  const t0 = performance.now() / 1000;
  return {
    group: built.group,
    stats: built.stats,
    data,
    update(dt) { built.update(dt, performance.now() / 1000 - t0); },
    isBlocked(x, z, r) { return !!built.isBlocked?.(x, z, r); },
    dispose() {
      scene.remove(built.group);
      built.dispose();
      void label;
    },
  };
}

export { disposeCityHallMaterials };
