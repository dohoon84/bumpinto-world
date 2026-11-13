// [jamsil-perf] 정적 소품·노면 표시를 '공간 칸(cell) × 재질'별로 한 메시로 합친다. ?cellmerge=0 이면 예전처럼 하나하나 그린다.
//   한강 2구간(합수부) 벤치·가로등·휴지통, 경부 버스전용 노면 글자처럼 수백~수천 개가 각자 draw call 이던 것을
//   칸(기본 400 m)마다 묶는다 → 모양·색·재질은 그대로, draw call 만 줄고 칸 단위 절두체·안개 컬링이 된다.
//   제외(그대로 둠): InstancedMesh·Skinned·morph, 배열 재질, ShaderMaterial·onBeforeCompile, onBeforeRender 가 붙은 메시,
//     renderOrder≠0, userData.perfDynamic, visible=false 인 가지, 거울 배치(행렬식 ≤ 0), drawRange 지정.
//   투명 재질은 allowTransparent=true 일 때만(겹치지 않는 노면 글자처럼 정렬이 상관없는 것).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
const BASE_OBR_O = THREE.Object3D.prototype.onBeforeRender;

export function cellMergeEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('cellmerge') !== '0' && s.get('perfmem') !== '0';
}

// 합친 칸 메시는 perf/index.js 의 안개 컬링(propCull)에 넘긴다: 칸 경계구가 안개 끝(fog.far) 밖이면 렌더에서만 뺀다.
export const fogCullQueue = [];
export function queueFogCull(mesh) { if (mesh) fogCullQueue.push(mesh); }

const attrSig = (g) => Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize + (g.attributes[k].normalized ? 'n' : '')).join(',') + (g.index ? '|i' : '|n');

function mergeable(o, allowTransparent) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences) return false;
  if (o.renderOrder || o.userData?.perfDynamic || (o.onBeforeRender && o.onBeforeRender !== BASE_OBR_O)) return false;
  const m = o.material;
  if (!m || Array.isArray(m) || !m.isMaterial || m.isShaderMaterial || m.userData?.perfDynamic) return false;
  if (m.onBeforeCompile !== BASE_OBC) return false;
  if (!allowTransparent && (m.transparent || m.opacity !== 1)) return false;
  const g = o.geometry;
  if (!g?.attributes?.position || g.drawRange.start !== 0 || g.drawRange.count !== Infinity || g.morphAttributes?.position?.length) return false;
  return o.matrixWorld.determinant() > 0;
}

/**
 * root 아래 정적 메시를 칸·재질별로 합친다(제너레이터: 버킷마다 yield → 슬라이서가 끊어 준다).
 * 합친 메시는 root 바로 아래에 붙고, 원본은 떼어 낸다. 반환: { before, after, buckets, meshes }
 */
export function* cellMergeGen(root, { cell = 400, allowTransparent = false, minGroup = 2, name = null, shared = null } = {}) {
  const stats = { before: 0, after: 0, buckets: 0, meshes: [] };
  if (!root) return stats;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const uses = new Map(); // geometry -> 쓰는 메시 수 (다 합쳐졌을 때만 dispose)
  const walk = (o) => {
    if (o !== root && !o.visible) return;
    if (o.userData?.perfDynamic && o !== root) return;
    if (o.isMesh) {
      stats.before++;
      uses.set(o.geometry, (uses.get(o.geometry) || 0) + 1);
      if (mergeable(o, allowTransparent)) {
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        box.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.getCenter(c);
        const key = `${o.material.uuid}#${attrSig(g)}#${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}#${Math.floor(c.x / cell)},${Math.floor(c.z / cell)}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, items: [] }));
        b.items.push(o);
      }
    }
    for (const ch of o.children) walk(ch);
  };
  walk(root);
  const rel = new THREE.Matrix4();
  const merged = new Map();
  let k = 0;
  for (const b of buckets.values()) {
    if (b.items.length < minGroup) continue;
    const geos = b.items.map((o) => {
      const g = o.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (g.attributes[a].isInterleavedBufferAttribute) g.setAttribute(a, g.attributes[a].clone());
      g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      g.clearGroups();
      g.morphAttributes = {};
      return g;
    });
    let geo = null;
    try { geo = mergeGeometries(geos, false); } catch { geo = null; }
    for (const g of geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.name = name || b.items[0].name || 'cell-merged';
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
    mesh.userData.cellMerged = b.items.length;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    stats.meshes.push(mesh);
    queueFogCull(mesh);
    stats.buckets++;
    for (const o of b.items) { o.removeFromParent(); merged.set(o.geometry, (merged.get(o.geometry) || 0) + 1); }
    if ((++k & 3) === 0) yield;
  }
  // 원본 지오메트리: 쓰던 메시가 모두 합쳐졌으면 버린다(공유 지오메트리는 shared 로 넘기면 남긴다)
  for (const [g, n] of merged) if (uses.get(g) === n && !shared?.has?.(g)) g.dispose();
  // 메시가 모두 빠진 빈 그룹(표지판 기둥+판 묶음 등) 정리
  const prune = (o) => { for (const ch of o.children.slice()) prune(ch); if (o !== root && !o.isMesh && !o.isLight && !o.isCamera && o.type !== 'Bone' && !o.children.length && (o.isGroup || o.type === 'Object3D')) o.removeFromParent(); };
  prune(root);
  let after = 0; root.traverse((o) => { if (o.isMesh) after++; });
  stats.after = after;
  return stats;
}

export function cellMerge(root, opts) {
  const g = cellMergeGen(root, opts);
  let n = g.next();
  while (!n.done) n = g.next();
  return n.value;
}
