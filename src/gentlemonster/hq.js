// [seongsu] 하우스 노웨어 서울(젠틀몬스터 성수 사옥)을 게임 월드에 놓는 묶음 — ?gm=1 프리뷰와 같은 빌더(외관·셸·실내·조각)를 쓴다.
//   좌표: group 은 사옥 로컬(원점 = 평면 중심, +z = 정문·뚝섬로). 월드 배치는 group.position / rotation.y.
//   걷기: preview 와 같은 createWorldPhysics(바닥 면·경사·AABB·원·유리 선분). 게임 terrain.addGroundSurface 의 refY(지금 높이)로 층을 고른다.
//   draw/tris: 밖에서는 1층 실내만, 안에서는 지금 층 ±1 만 (preview cullFloors 와 같은 규칙). 조각은 워커 + LOD.
//   조명: 게임 장면 빛(해·반구)만 쓴다(스폿라이트를 더하면 게임 전체 셰이더가 다시 컴파일된다). PBR 재질엔 실내 반사 맵을 직접 단다.
import * as THREE from 'three';
import { createMaterials, setNight as setMatsNight } from './materials.js';
import { createInteriorMaterials } from './imats.js';
import { buildExterior } from './exterior.js';
import { buildSite } from './site.js';
import { buildShell, pointInPoly, LEVEL_NAME } from './shell.js';
import { createWorldPhysics } from './walker.js';
import { buildInterior } from './interior.js';
import { loadSculpts } from './sculptLoader.js';
import { PLAN as P } from './plan.js';

export { LEVEL_NAME };
const FY = P.floorY;

/** 실내 반사용 등장방형 캔버스(밝은 천장 띠 + 회색 벽 + 어두운 바닥). PMREM 은 렌더러가 알아서 만든다. */
function roomEnvTex() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#f4f2ee'); gr.addColorStop(0.3, '#c9c7c2'); gr.addColorStop(0.52, '#8d8b87'); gr.addColorStop(0.62, '#4a4946'); gr.addColorStop(1, '#2a2927');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#ffffff'; for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 6, 10, 18, 10);
  g.fillStyle = 'rgba(255,240,220,.7)'; for (let i = 0; i < 6; i++) g.fillRect(i * 44 + 10, 44, 26, 16);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function floorOfY(y) { return y > FY[5] - 0.6 ? 5 : y > FY[4] - 0.6 ? 4 : y > FY[3] - 0.6 ? 3 : y > FY[2] - 0.6 ? 2 : 1; }

/**
 * @param {object} o
 * @param {boolean} [o.mobile]
 * @param {number}  [o.maxAniso]
 * @param {boolean} [o.core]  true = 정원·담·사인·에어돔만 (주변 길·블록은 리전이 그린다)
 */
export function createHQ({ mobile = false, maxAniso = 4, core = true } = {}) {
  const mats = createMaterials({ maxAniso });
  const imats = createInteriorMaterials({ maxAniso });
  const env = roomEnvTex();
  const useEnv = (m) => { if (env && m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.envMap) { m.envMap = env; m.needsUpdate = true; } };
  for (const m of Object.values(mats)) useEnv(m);
  for (const m of Object.values(imats)) useEnv(m);

  const group = new THREE.Group(); group.name = 'haus-nowhere';
  const ext = buildExterior(mats), site = buildSite(mats, { core });
  const shell = buildShell(mats, ext, imats);
  for (const m of [...site.meshes, ...ext.meshes]) group.add(m);
  const interior = new THREE.Group(); interior.name = 'hn-interior';
  for (const m of shell.meshes) interior.add(m);
  group.add(interior);

  const segs = ext.colliders;
  const circles = [...site.circles, ...ext.columns.map(([x, z, r]) => ({ x, z, r, y0: 0, y1: P.t0 }))];
  const physics = createWorldPhysics({ regions: shell.regions, colliders: [...shell.colliders, ...site.colliders], circles, segments: segs, bounds: 60 });

  let inner = { meshes: [], update() {}, labels: [] }, innerP = null;
  function ensureInterior() {
    if (innerP) return innerP;
    innerP = loadSculpts({ mobile }).then((sc) => {
      inner = buildInterior(mats, imats, shell, ext, sc);
      for (const m of inner.meshes) {
        for (const mm of [m.material].flat()) useEnv(mm);
        m.traverse?.((o) => { if (o.material) for (const mm of [o.material].flat()) useEnv(mm); });
        interior.add(m); m.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(m);
        // 월드에 놓여 있어도 층은 사옥 로컬 높이로 (group 은 y 이동이 없다 → min.y 그대로)
        const y = b.isEmpty() ? 0 : b.min.y - group.position.y + 0.3;
        m.userData.fl = floorOfY(y); m.userData.span = b.isEmpty() ? 0 : b.max.y - b.min.y;
      }
      physics.addColliders(inner.colliders, inner.circles);
      cullKey = '';
      return inner;
    });
    return innerP;
  }

  const inFoot = (lx, lz) => pointInPoly(shell.levelsInfo[2].poly, lx, lz) || pointInPoly(shell.levelsInfo[1].poly, lx, lz);
  /** 로컬 점이 사옥 실내(천장 아래 빈 곳)인가 — 카메라 붐용 */
  const ceilingAt = (x, z, y) => {
    if (!pointInPoly(shell.levelsInfo[2].poly, x, z)) return null;
    for (const h of [...shell.holes[2], ...shell.holes[3]]) if (x > h[0] - 0.3 && x < h[1] + 0.3 && z > h[2] - 0.3 && z < h[3] + 0.3) return null;
    if (y < FY[2] - 0.4) return P.t0 - 0.05;
    if (y < FY[3] - 0.4) return FY[3] - P.SLAB;
    if (y < FY[4] - 0.4) return FY[4] - P.SLAB;
    if (y > FY[5] - 0.4) return 22.6;
    return null;
  };

  // 층별 표시: 카메라가 밖이면 1층만, 안이면 지금 층 ±1
  let cullKey = '', camFloor = 0;
  function cull(lx, ly, lz) {
    const inB = ly < P.baseTop && inFoot(lx, lz);
    const cf = !inB ? 0 : floorOfY(ly);
    camFloor = cf;
    const detail = Math.hypot(lx, lz) < 230; // [v4] 먼 항공뷰에선 실내 소품만 생략 (외관·바닥 셸 유지), 1M tri 여유
    const key = 'k' + cf + ':' + detail; if (key === cullKey) return cf; cullKey = key;
    for (const m of inner.meshes) { const f = m.userData.fl; if (!f || m.userData.span > 12) continue; m.visible = detail && (cf === 0 ? f === 1 : Math.abs(f - cf) <= 1); }
    // 위층 셸(바닥판·천장)도 밖에서는 그릴 필요가 없다 — 셸은 층을 나눠 만들지 않아서 그대로 둔다
    return cf;
  }

  let night = false;
  function setNight(v) { night = !!v; setMatsNight(mats, night); }
  return {
    group, mats, imats, ext, site, shell, physics, interior,
    get inner() { return inner; },
    ensureInterior, ceilingAt, inFoot, cull, setNight,
    /** 사람·소품을 이 높이(사옥 로컬 y)에서 그릴까 — 밖에서는 1층·바깥만, 안에서는 지금 층 ±1 */
    floorY: FY, // [seongsu] 층 바닥 높이 (스크린샷·이동)
    showY: (y) => (y < FY[2] - 0.6 ? true : camFloor === 0 ? false : Math.abs(floorOfY(y) - camFloor) <= 1),
    get night() { return night; },
    update(t) { site.update?.(t); inner.update?.(t); },
    /** 사옥 근처(로컬 반경)인가 */
    near: (lx, lz, pad = 0) => Math.abs(lx) < 36 + pad && Math.abs(lz) < 32 + pad,
  };
}
