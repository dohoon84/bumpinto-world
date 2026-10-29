// 계절별 나무 에셋 공통 모듈 (가로수·탄천 제방 숲·정자역 광장 느티나무 공용)
import * as THREE from 'three';

export const DEFAULT_SEASON = 'autumn';

const PALETTES = {
  spring: ['#9cd67d', '#86c86a', '#b5e48c', '#74b859', '#f4b8c8', '#7ec46c'],
  summer: ['#6ab056', '#7dbb6b', '#5d9e4b', '#82c46c', '#6fae62', '#529442'],
  // 가을: 은행나무 노란빛, 단풍 붉은빛·주황빛, 아직 푸른 초록빛이 조화롭게 섞임
  autumn: [
    '#e9b93b', // 은행 노랑
    '#f2c94c', // 밝은 황금 노랑
    '#df8a30', // 주황 단풍
    '#d96b27', // 짙은 주황
    '#c94a38', // 붉은 단풍
    '#b83b2e', // 진홍 단풍
    '#a86438', // 갈색빛 낙엽
    '#88a846', // 올리브 초록 (물드는 중)
    '#6fae62', // 초록
    '#7dbb6b', // 밝은 초록
  ],
  winter: ['#7f8f79', '#6b7d65', '#8c7a66', '#5e7159', '#958472'],
};

const matCache = new Map();
function M(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return matCache.get(key);
}

export function getSeason() {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('season')?.trim().toLowerCase();
    if (q && PALETTES[q]) return q;
  }
  return DEFAULT_SEASON;
}

export function pickFoliageColor(rnd = Math.random, season = getSeason(), target = new THREE.Color()) {
  const list = PALETTES[season] || PALETTES.autumn;
  const hex = list[Math.floor(rnd() * list.length)];
  target.set(hex);
  // 나무마다 똑같아 보이지 않게 미세한 색조·채도·명도 편차를 준다
  target.offsetHSL((rnd() - 0.5) * 0.035, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.07);
  return target;
}

// 가로수·제방 숲 등에 쓰는 대량 InstancedMesh 나무 빌더
export function addInstancedTrees(scene, points, {
  rnd = Math.random,
  season = getSeason(),
  crownRadius = 2.2,
  crownY = 5.0,
  trunkTop = 0.2,
  trunkBottom = 0.28,
  trunkHeight = 3.6,
  trunkColor = '#8a6b4e',
  scaleMin = 0.8,
  scaleSpan = 0.5,
  getY = null,
} = {}) {
  if (!points.length) return null;
  const crownGeo = new THREE.IcosahedronGeometry(crownRadius, 0);
  crownGeo.translate(0, crownY, 0);
  const trunkGeo = new THREE.CylinderGeometry(trunkTop, trunkBottom, trunkHeight, 5);
  trunkGeo.translate(0, trunkHeight / 2, 0);

  // InstancedMesh에서 instanceColor를 쓰려면 기본 material 색상은 흰색이어야 곱해졌을 때 원래 색이 나온다
  const crownMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const trunkMat = M(trunkColor);

  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, points.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, points.length);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  points.forEach(([x, z], i) => {
    const k = scaleMin + rnd() * scaleSpan;
    const y = getY ? getY(x, z) : 0;
    q.setFromAxisAngle(up, rnd() * 6);
    s.set(k, k, k);
    m4.compose(new THREE.Vector3(x, y, z), q, s);
    crowns.setMatrixAt(i, m4);
    trunks.setMatrixAt(i, m4);
    crowns.setColorAt(i, pickFoliageColor(rnd, season, col));
  });

  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  crowns.castShadow = trunks.castShadow = true;
  scene.add(crowns, trunks);
  return { crowns, trunks };
}

// 광장 등에 쓰는 풍성한 다중 수관(느티나무) 개별 에셋 빌더
export function createPlazaTree(x, z, scale = 1, withBench = true, {
  rnd = null,
  season = getSeason(),
} = {}) {
  // 좌표 기반 결정론적 시드 (새로고침해도 나무별 가을 색 조합이 자연스럽게 유지됨)
  let seed = Math.abs(Math.floor(x * 131 + z * 977)) % 2147483647 || 7919;
  const nextRnd = rnd || (() => ((seed = (seed * 16807) % 2147483647) / 2147483647));

  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkMat = M('#7c5c3e');
  const woodBench = M('#b8895a');
  const stoneCurb = M('#c8c2b6');

  const baseCol = pickFoliageColor(nextRnd, season, new THREE.Color());
  const subCol1 = baseCol.clone().offsetHSL((nextRnd() - 0.5) * 0.06, (nextRnd() - 0.5) * 0.12, 0.04);
  const subCol2 = (nextRnd() < 0.45
    ? pickFoliageColor(nextRnd, season, new THREE.Color())
    : baseCol.clone().offsetHSL((nextRnd() - 0.5) * 0.05, 0, -0.05));

  const leaf1 = new THREE.MeshLambertMaterial({ color: baseCol, flatShading: true });
  const leaf2 = new THREE.MeshLambertMaterial({ color: subCol1, flatShading: true });
  const leaf3 = new THREE.MeshLambertMaterial({ color: subCol2, flatShading: true });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24 * scale, 0.36 * scale, 3.6 * scale, 7),
    trunkMat,
  );
  trunk.position.y = 1.8 * scale;
  trunk.castShadow = true;
  g.add(trunk);

  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3 * scale, 1), leaf1);
  c1.position.set(0, 4.4 * scale, 0);
  c1.scale.set(1.15, 0.82, 1.15);
  c1.castShadow = true;

  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.65 * scale, 1), leaf2);
  c2.position.set(0.9 * scale, 5.1 * scale, 0.4 * scale);
  c2.castShadow = true;

  const c3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55 * scale, 1), leaf3);
  c3.position.set(-0.85 * scale, 4.9 * scale, -0.5 * scale);
  c3.castShadow = true;
  g.add(c1, c2, c3);

  if (withBench) {
    const curb = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.42, 0.28, 12), stoneCurb);
    curb.position.y = 0.14;
    curb.receiveShadow = true;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.08, 12), woodBench);
    seat.position.y = 0.42;
    seat.castShadow = true;
    seat.receiveShadow = true;
    g.add(curb, seat);
  }
  return g;
}
