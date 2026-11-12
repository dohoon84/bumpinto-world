// [jamsil-perf] 큰 정적 메시(지형·고속도로 몸체)를 공간 칸으로 쪼개 화면 밖 칸을 안 그리고(절두체 컬링),
//   격자 지형은 칸마다 거리 LOD(정점을 2·4·8칸 건너 뛴 인덱스)를 둔다. 정점·색·법선 버퍼는 원본 하나를 칸들이 같이 쓴다
//   (메모리 거의 그대로, 인덱스만 늘어남). 가까운 곳은 원본 그대로라 모양이 같고, 먼 칸은 1~2px 차이의 단순화.
//   ?terrainlod=0 이면 예전대로 한 메시.
import * as THREE from 'three';

const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
export function terrainLodEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search).get('terrainlod') !== '0';
}

function boundsOf(pos, idx, box, sphere) {
  box.makeEmpty();
  const v = new THREE.Vector3();
  for (let i = 0; i < idx.length; i++) { const k = idx[i]; v.set(pos.getX(k), pos.getY(k), pos.getZ(k)); box.expandByPoint(v); }
  box.getCenter(sphere.center);
  let r2 = 0;
  for (let i = 0; i < idx.length; i++) { const k = idx[i]; v.set(pos.getX(k), pos.getY(k), pos.getZ(k)); r2 = Math.max(r2, sphere.center.distanceToSquared(v)); }
  sphere.radius = Math.sqrt(r2);
}

function shareGeo(src, idx) {
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingBox = new THREE.Box3(); g.boundingSphere = new THREE.Sphere();
  boundsOf(src.attributes.position, idx, g.boundingBox, g.boundingSphere);
  return g;
}

function cloneMeshProps(dst, src) {
  dst.name = src.name; dst.castShadow = src.castShadow; dst.receiveShadow = src.receiveShadow; dst.renderOrder = src.renderOrder;
  dst.userData.chunkOf = src.name;
  return dst;
}

export function splittable(o, minTris) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences) return false;
  const g = o.geometry; if (!g?.attributes?.position || g.drawRange.start !== 0 || g.drawRange.count !== Infinity || g.groups?.length) return false;
  const ms = [].concat(o.material); if (ms.some((m) => !m || m.onBeforeCompile !== BASE_OBC || m.isShaderMaterial)) return false;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
  return tris >= minTris;
}

/** 삼각형 무게중심 칸으로 메시를 쪼갠다 → Group(칸 메시들). 위치 행렬은 그대로 옮긴다. */
//   칸이 maxChunks 개를 넘으면(넓게 흩어진 메시) 칸을 1.5배씩 키워 draw call 이 크게 늘지 않게 한다.
export function splitByCells(mesh, { cell = 600, maxChunks = 24 } = {}) {
  const g = mesh.geometry, pos = g.attributes.position;
  const n = g.index ? g.index.count : pos.count;
  const ix = (i) => (g.index ? g.index.getX(i) : i);
  let buckets;
  for (let tries = 0; tries < 12; tries++, cell *= 1.5) {
    buckets = new Map();
    for (let i = 0; i + 2 < n; i += 3) {
      const a = ix(i), b = ix(i + 1), c = ix(i + 2);
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      const key = Math.floor(cx / cell) + ',' + Math.floor(cz / cell);
      let B = buckets.get(key); if (!B) buckets.set(key, (B = [])); B.push(a, b, c);
    }
    if (buckets.size <= maxChunks) break;
  }
  const grp = new THREE.Group(); grp.name = mesh.name;
  grp.position.copy(mesh.position); grp.quaternion.copy(mesh.quaternion); grp.scale.copy(mesh.scale);
  grp.matrixAutoUpdate = mesh.matrixAutoUpdate; grp.updateMatrix();
  const big = pos.count > 65535;
  for (const B of buckets.values()) {
    const m = cloneMeshProps(new THREE.Mesh(shareGeo(g, big ? new Uint32Array(B) : new Uint16Array(B)), mesh.material), mesh);
    m.matrixAutoUpdate = false; grp.add(m);
  }
  return grp;
}

/** 쪼갤 만한 큰 메시를 그 자리에서 칸 그룹으로 바꾼다. 반환: 바꾼 수 */
export function splitBigMeshes(root, { minTris = 20000, cell = 600, maxChunks = 24 } = {}) {
  if (!terrainLodEnabled()) return 0;
  const list = [];
  root.traverse((o) => { if (splittable(o, minTris)) list.push(o); });
  for (const o of list) {
    const p = o.parent; if (!p) continue;
    const grp = splitByCells(o, { cell, maxChunks });
    p.add(grp); p.remove(o);
  }
  return list.length;
}

/**
 * 격자 지형(Nx×Nz 정점, 행 우선, 칸마다 삼각형 2개 a,c,b / b,c,d) → 칸마다 THREE.LOD.
 *  levels: [[거리 m, 건너뛰기]] — 건너뛰기 1 = 원본. 칸 경계의 정점은 모든 단계가 같이 쓰므로 단계가 다른 이웃 칸 사이 틈은
 *  건너뛴 꼭짓점 사이 높이 오차만큼(먼 곳이라 1px 안팎)이다.
 */
export function gridLod(mesh, Nx, Nz, { chunk = 128, levels = [[0, 1], [2000, 2], [3600, 4], [6400, 8]] } = {}) {
  const g = mesh.geometry, pos = g.attributes.position;
  const grp = new THREE.Group(); grp.name = mesh.name;
  const big = pos.count > 65535;
  const c3 = new THREE.Vector3();
  for (let cz = 0; cz < Nz - 1; cz += chunk) for (let cx = 0; cx < Nx - 1; cx += chunk) {
    const ex = Math.min(Nx - 1, cx + chunk), ez = Math.min(Nz - 1, cz + chunk);
    const lod = new THREE.LOD(); lod.name = mesh.name + 'Lod';
    let center = null;
    for (const [dist, s0] of levels) {
      const s = Math.min(s0, ex - cx, ez - cz) || 1;
      const idx = [];
      const xs = []; for (let x = cx; x < ex; x += s) xs.push(x); xs.push(ex);
      const zs = []; for (let z = cz; z < ez; z += s) zs.push(z); zs.push(ez);
      for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
        const a = zs[j] * Nx + xs[i], b = zs[j] * Nx + xs[i + 1], c = zs[j + 1] * Nx + xs[i], d = zs[j + 1] * Nx + xs[i + 1];
        idx.push(a, c, b, b, c, d);
      }
      const geo = shareGeo(g, big ? new Uint32Array(idx) : new Uint16Array(idx));
      if (!center) { center = geo.boundingSphere.center.clone(); lod.position.copy(center); }
      const m = cloneMeshProps(new THREE.Mesh(geo, mesh.material), mesh);
      m.position.copy(c3.copy(center).negate()); m.updateMatrix(); m.matrixAutoUpdate = false;
      lod.addLevel(m, dist, 0.08);
    }
    lod.updateMatrix(); grp.add(lod);
  }
  return grp;
}
