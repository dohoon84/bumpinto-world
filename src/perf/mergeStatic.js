// [perf-memory] 움직이지 않는 소품 메시를 재질별로 한 메시로 합친다(정적 병합).
//   원본 메시는 부모에서 떼어 내 JS 힙(Object3D·행렬)도 줄인다. 합친 메시는 root 바로 아래 'perf-merged' 그룹에 붙는다.
//   자동 제외(원본 그대로 둠):
//     - userData.rig 가 있는 노드의 하위(아바타·강아지·비둘기), userData.perfDynamic 이 붙은 노드의 하위
//     - 그 시점에 visible=false 인 노드의 하위(나중에 켜질 수 있음), InstancedMesh·Skinned·Line·Points·Sprite
//     - 투명/알파 재질, 배열 재질, userData.perfDynamic 재질, onBeforeCompile/onBeforeRender 가 붙은 재질·메시
//     - renderOrder≠0, frustumCulled=false, 행렬식 음수(거울 배치), drawRange 지정, morph
//   matshare=true 이면 같은 '값'의 재질(타입·색·텍스처 등 직렬화가 같은 것)을 한 버킷으로 묶는다. 값이 바뀌는 재질은 perfDynamic 표시로 뺀다.
//   keepOriginals=true(?perfcheck=1) 이면 원본을 지우지 않고 layers 로만 숨겨, watch() 로 원본이 움직이거나 바뀌는지 감시할 수 있다(검증용).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setHidden } from './hide.js';

const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
const BASE_OBR_M = THREE.Material.prototype.onBeforeRender;
const BASE_OBR_O = THREE.Object3D.prototype.onBeforeRender;

function matOk(m) {
  if (!m || Array.isArray(m) || !m.isMaterial || m.userData?.perfDynamic) return false;
  if (m.transparent || m.opacity !== 1 || m.alphaTest > 0 || m.alphaHash || !m.visible) return false;
  if (m.onBeforeCompile !== BASE_OBC || (m.onBeforeRender && m.onBeforeRender !== BASE_OBR_M)) return false;
  if (m.isShaderMaterial || m.clippingPlanes?.length) return false;
  return true;
}
const sigCache = new WeakMap();
const SKIP = new Set(['uuid', 'name', 'id', 'userData', 'version', '_listeners', 'defines']);
function valSig(v) {
  if (v == null || typeof v !== 'object') return typeof v === 'function' ? 'fn' : v;
  if (v.isColor) return 'c' + v.getHexString();
  if (v.isTexture) return 't' + v.uuid;
  if (v.isVector2 || v.isVector3 || v.isVector4 || v.isEuler || v.isMatrix3 || v.isMatrix4) return v.toArray().join(',');
  if (Array.isArray(v)) return '[' + v.map(valSig).join(';') + ']';
  return 'o' + (v.uuid || Object.keys(v).length);
}
// 재질 '값' 서명: 고유 id 를 뺀 모든 필드(색은 hex, 텍스처는 uuid). 같으면 그려지는 결과가 같다
export function materialSignatureLive(m, skipColor = false) {
  const parts = [m.type];
  for (const k of Object.keys(m).sort()) if (!SKIP.has(k) && !(skipColor && k === 'color')) parts.push(k + '=' + valSig(m[k]));
  return parts.join('|');
}
// 색만 다른 단색 재질은 정점 색으로 구워 한 재질로 합칠 수 있다(Lambert/Phong/Standard: diffuse = color × vColor)
const bakeable = (m) => (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial) && !m.vertexColors && m.color;
const sigNoColor = new WeakMap();
function signatureNoColor(m) { let x = sigNoColor.get(m); if (!x) { x = materialSignatureLive(m, true); sigNoColor.set(m, x); } return x; }
export function materialSignature(m) {
  let s = sigCache.get(m);
  if (!s) { s = materialSignatureLive(m); sigCache.set(m, s); }
  return s;
}
const attrSig = (g) => Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize + (g.attributes[k].normalized ? 'n' : '')).join(',') + (g.index ? '|i' : '|n');

export function mergeStatic(root, { name = 'perf-merged', matshare = false, keepOriginals = false, minGroup = 2, nested = true } = {}) {
  const stats = { before: 0, after: 0, merged: 0, kept: 0, buckets: 0, vertices: 0 };
  if (!root) return { stats, watch: () => [], group: null };
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const why = (stats.why = {});
  const subs = [];
  const reason = (o) => { const m = o.material; if (o.isInstancedMesh) return 'instanced'; if (Array.isArray(m)) return 'matArray'; if (m?.transparent || m?.opacity !== 1) return 'transparent'; if (!matOk(m)) return 'material'; if (o.renderOrder) return 'renderOrder'; if (!o.frustumCulled) return 'noFrustum'; if (o.onBeforeRender !== BASE_OBR_O) return 'onBeforeRender'; if (o.matrixWorld.determinant() <= 0) return 'mirror'; return 'other'; };
  const walk = (o) => {
    if (o !== root && nested && o.userData?.perfDynamic && !o.userData?.rig && o.visible && !o.isMesh) { // 움직이는 덩어리(문짝 등): 그 안에서만 합쳐 덩어리째 움직이게
      const sub = mergeStatic(o, { name, matshare, keepOriginals, minGroup, nested: false });
      stats.before += sub.stats.before; stats.kept += sub.stats.after; stats.merged += sub.stats.merged; stats.subBuckets = (stats.subBuckets || 0) + sub.stats.buckets; stats.vertices += sub.stats.vertices;
      subs.push(sub); why.dynamicLocal = (why.dynamicLocal || 0) + sub.stats.after; return;
    }
    if (o !== root && (o.userData?.rig || o.userData?.perfDynamic || !o.visible)) { const w = o.userData?.rig ? 'rig' : o.userData?.perfDynamic ? 'dynamic' : 'hidden'; o.traverse((c) => { if (c.isMesh) { stats.before++; stats.kept++; why[w] = (why[w] || 0) + 1; } }); return; }
    if (o.isMesh) {
      stats.before++;
      const g = o.geometry, m = o.material;
      const ok = !o.isInstancedMesh && !o.isSkinnedMesh && !o.morphTargetInfluences && !o.renderOrder && o.frustumCulled
        && !(o.onBeforeRender && o.onBeforeRender !== BASE_OBR_O) && matOk(m)
        && g?.attributes?.position && g.drawRange.start === 0 && g.drawRange.count === Infinity && !g.morphAttributes?.position?.length
        && o.matrixWorld.determinant() > 0;
      if (ok) {
        const bake = matshare && bakeable(m);
        const key = (bake ? 'VC|' + signatureNoColor(m) : matshare ? materialSignature(m) : m.uuid) + '#' + attrSig(g).replace(/color3,?/, '') + '#' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat: m, bake, cast: o.castShadow, recv: o.receiveShadow, items: [] }));
        b.items.push(o);
      } else { stats.kept++; const w = reason(o); why[w] = (why[w] || 0) + 1; }
    }
    for (const c of o.children.slice()) walk(c);
  };
  walk(root);
  const group = new THREE.Group(); group.name = name;
  const merged = [], bakedMats = [];
  const rel = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.items.length < minGroup) { stats.kept += b.items.length; why.single = (why.single || 0) + b.items.length; continue; }
    const geos = b.items.map((o) => {
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (g.attributes[k].isInterleavedBufferAttribute) g.setAttribute(k, g.attributes[k].clone());
      g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      g.groups = [];
      if (b.bake) { // 재질 색을 정점 색으로 (원래 color 속성은 vertexColors=false 라 안 쓰이던 값)
        const n = g.attributes.position.count, c = o.material.color, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      } else if (g.attributes.color && !o.material.vertexColors) g.deleteAttribute('color');
      return g;
    });
    let geo = null;
    try { geo = mergeGeometries(geos, false); } catch { geo = null; }
    for (const g of geos) g.dispose();
    if (!geo) { stats.kept += b.items.length; continue; }
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    let mat = b.mat;
    if (b.bake) {
      const sameColor = b.items.every((o) => o.material.color.equals(b.mat.color));
      if (sameColor) geo.deleteAttribute('color'); // 다 같은 색이면 굽지 않고 원래 재질 그대로
      else { mat = b.mat.clone(); mat.vertexColors = true; mat.color.set(0xffffff); mat.name = (b.mat.name || '') + '+perfVC'; bakedMats.push(mat); }
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.name = name; mesh.matrixAutoUpdate = false;
    mesh.userData.perfMerged = b.items.length;
    group.add(mesh);
    stats.buckets++; stats.merged += b.items.length; stats.vertices += geo.attributes.position.count;
    merged.push({ mesh, items: b.items });
    for (const o of b.items) { if (keepOriginals) setHidden(o, 'merge', true); else o.removeFromParent(); }
  }
  if (group.children.length) { root.add(group); group.matrixAutoUpdate = false; }
  stats.after = stats.kept + stats.buckets;
  // 검증용: 원본(keepOriginals 일 때만 남아 있음)의 월드 행렬·보임·재질 값이 병합 시점과 달라졌는지
  const relOf = (o) => new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld); // root 기준(움직이는 덩어리 안 병합도 검사)
  const snap = keepOriginals ? merged.flatMap(({ items }) => items.map((o) => ({ o, mw: relOf(o), mat: o.material, sig: materialSignatureLive(o.material) }))) : [];
  function watch() {
    const bad = [];
    for (const s of snap) {
      let vis = true; for (let p = s.o; p && p !== root; p = p.parent) if (!p.visible) vis = false;
      const r = relOf(s.o).elements, e = s.mw.elements; let moved = false; for (let i = 0; i < 16; i++) if (Math.abs(r[i] - e[i]) > 1e-4) moved = true;
      if (moved || !vis || s.o.material !== s.mat || materialSignatureLive(s.o.material) !== s.sig || !s.o.parent) bad.push({ name: s.o.name || s.o.geometry?.type, moved, vis, path: pathOf(s.o, root) });
    }
    return bad;
  }
  stats.bakedMaterials = bakedMats.length;
  return { stats, watch: () => watch().concat(...subs.map((x) => x.watch())), group };
}
function pathOf(o, root) { const a = []; for (let p = o; p && p !== root; p = p.parent) a.push(p.name || p.type); return a.reverse().join('/'); }
