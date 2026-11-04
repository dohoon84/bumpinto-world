// [perf-memory] 같은 지오메트리를 쓰는 움직이는 소품(아바타·세워 둔 카카오바이크)을 부품별 InstancedMesh 로 그린다.
//   - 원본 Object3D 계층·애니메이션·visible 토글은 그대로 두고(게임 코드 변경 없음), 원본 메시는 layers 로 렌더에서만 뺀다(hide.js).
//   - 매 렌더 직전(scene.onBeforeRender = updateMatrixWorld 다음, 컬링 전) 원본 matrixWorld 를 인스턴스로 복사 → 같은 프레임, 지연 없음.
//   - 부품 키: 람버트 '단색' 재질이면 지오메트리별 1개(+인스턴스 색), 그 밖엔 (재질, 지오메트리)별 1개. 그림자 켬/끔도 키에 포함.
//   - 투명·텍스처 아닌 특수 재질(ShaderMaterial, onBeforeCompile/onBeforeRender 가 붙은 재질), 배열 재질, 스킨/모프,
//     renderOrder·onBeforeRender 가 붙은 메시는 인스턴싱하지 않고 원본 그대로 그린다.
//   - 루트 단위 절두체 컬링(경계구 + 여유)과, propcull 이 켜져 있으면 화면 크기 0.6px 미만 루트 생략.
//   - 1초마다 루트를 다시 훑어 (컵·우산처럼) 나중에 붙은 부품이나 바뀐 재질을 따라간다.
import * as THREE from 'three';
import { setHidden, repairClone } from './hide.js';

const R = 'inst';
const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
const BASE_OBR_M = THREE.Material.prototype.onBeforeRender;
const BASE_OBR_O = THREE.Object3D.prototype.onBeforeRender;
const OK_TYPES = new Set(['MeshLambertMaterial', 'MeshBasicMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial', 'MeshPhysicalMaterial']);

export function materialInstanceable(m) {
  if (!m || Array.isArray(m) || !OK_TYPES.has(m.type)) return false;
  if (m.transparent || m.opacity !== 1 || m.alphaTest > 0 || m.alphaHash || m.wireframe) return false;
  if (m.onBeforeCompile !== BASE_OBC || (m.onBeforeRender && m.onBeforeRender !== BASE_OBR_M)) return false;
  if (m.clippingPlanes?.length || m.blending !== THREE.NormalBlending || !m.visible) return false;
  return true;
}
function lambertSolid(m) {
  return m.type === 'MeshLambertMaterial' && !m.map && !m.alphaMap && !m.emissiveMap && !m.lightMap && !m.aoMap && !m.envMap && !m.bumpMap && !m.normalMap && !m.specularMap && !m.displacementMap
    && !m.vertexColors && m.side === THREE.FrontSide && (!m.emissive || m.emissive.getHex() === 0) && !m.flatShading && m.fog && m.depthTest && m.depthWrite && !m.polygonOffset && m.toneMapped && m.colorWrite;
}
export function meshInstanceable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences || !o.frustumCulled) return false;
  if (o.renderOrder || (o.onBeforeRender && o.onBeforeRender !== BASE_OBR_O)) return false;
  const g = o.geometry; if (!g?.attributes?.position || g.morphAttributes?.position?.length) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  return materialInstanceable(o.material);
}

export function createInstancer(scene, { name = 'perfInstanced', pixelCull = false, rescanSec = 1 } = {}) {
  const group = new THREE.Group(); group.name = name; scene.add(group);
  const parts = new Map(); // key -> { geo, mat, lam, cast, recv, im, cap, n }
  const roots = new Map(); // root -> { list, r, active }
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const stats = { roots: 0, parts: 0, instances: 0, drawnRoots: 0, culledRoots: 0, tinyRoots: 0, meshesHidden: 0, syncMs: 0, rescans: 0, rescanStale: 0, rescanCount: 0, lastStale: '' };
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(), v = new THREE.Vector3();
  let rescanAcc = 0, lastT = -1;

  const keyOf = (o) => { const m = o.material, lam = lambertSolid(m); return [(lam ? 'L|' : 'M|' + m.uuid + '|') + o.geometry.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0), lam]; };
  function part(o) {
    const [key, lam] = keyOf(o);
    let P = parts.get(key);
    if (!P) { P = { key, geo: o.geometry, mat: lam ? white : o.material, lam, cast: o.castShadow, recv: o.receiveShadow, im: null, cap: 0, n: 0, need: 0 }; parts.set(key, P); }
    P.need++;
    return P;
  }
  function grow(P) {
    if (P.im && P.im.instanceMatrix.count >= P.need) return;
    const cap = Math.max(4, Math.ceil(P.need * 1.5));
    const im = new THREE.InstancedMesh(P.geo, P.mat, cap);
    im.count = 0; im.castShadow = P.cast; im.receiveShadow = P.recv; im.frustumCulled = false; im.name = name; im.matrixAutoUpdate = false;
    if (P.lam) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    if (P.im) { group.remove(P.im); P.im.dispose(); }
    P.im = im; group.add(im);
  }
  function scan(root, rec) {
    if (rec) for (const it of rec.list) { it.P.need--; setHidden(it.o, R, false); }
    const list = [];
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3(), tmp = new THREE.Box3(), rel = new THREE.Matrix4();
    const each = (o, fn) => { if (o !== root && (o.userData?.rig || o.userData?.perfNoInstance)) return; fn(o); for (const c of o.children) each(c, fn); }; // 다른 아바타(라이더 등)는 그쪽 루트가 따로 맡음
    each(root, (o) => {
      repairClone(o);
      if (!meshInstanceable(o)) return;
      const P = part(o);
      list.push({ o, P, mat: o.material, geo: o.geometry });
      setHidden(o, R, true);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); box.union(tmp);
    });
    for (const it of list) grow(it.P);
    const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const r = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length() / 2;
    stats.rescans++;
    return { list, c, r: r * 1.35 + 0.5, count: countDesc(root), active: rec ? rec.active : true };
  }
  const countDesc = (root) => { let n = 0; root.traverse(() => { n++; }); return n; };
  const attached = (o) => { for (let p = o; p; p = p.parent) if (p === scene) return true; return false; };
  const shownTo = (o, stop) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === stop) return true; } return true; };
  const shownScene = (root) => { for (let p = root; p; p = p.parent) if (!p.visible) return false; return true; };

  function track(root) { if (!root || roots.has(root)) return; roots.set(root, scan(root, null)); stats.roots = roots.size; }
  function release(root) {
    const rec = roots.get(root); if (!rec) return;
    for (const it of rec.list) { it.P.need--; setHidden(it.o, R, false); }
    roots.delete(root); stats.roots = roots.size;
  }
  // 타는 중인 자전거처럼 잠깐 원본으로 그리고 싶을 때
  function setActive(root, on) {
    const rec = roots.get(root); if (!rec || rec.active === on) return;
    rec.active = on; for (const it of rec.list) setHidden(it.o, R, on);
  }

  // 떠난 루트(판교 NPC·스트리밍 타일 등)만 쓰던 부품은 InstancedMesh 와 geometry 참조를 놓는다 (메모리 누수 방지)
  function prune() {
    for (const [key, P] of parts) {
      if (P.need > 0) continue;
      if (P.im) { group.remove(P.im); P.im.dispose(); P.im = null; }
      parts.delete(key);
    }
  }
  function sync(renderer, camera, fog = null) {
    const tS = performance.now();
    // 한 프레임에 render 가 여러 번이어도(카메라 앱 등) 매번 그 카메라 기준으로 다시 채운다
    const now = performance.now();
    if (lastT >= 0) rescanAcc += (now - lastT) / 1000; lastT = now;
    const doRescan = rescanAcc > rescanSec; if (doRescan) rescanAcc = 0;
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const H = renderer.domElement?.height || 800, k = camera.isPerspectiveCamera ? (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : 0;
    for (const P of parts.values()) P.n = 0;
    let drawn = 0, culled = 0, tiny = 0, hidden = 0;
    for (const [root, rec0] of roots) {
      let rec = rec0;
      if (!attached(root)) { release(root); continue; }
      if (doRescan && countDesc(root) !== rec.count) { stats.rescanCount++; rec = scan(root, rec); roots.set(root, rec); }
      if (!rec.active) continue;
      hidden += rec.list.length;
      if (!shownScene(root)) continue;
      sph.center.copy(rec.c).applyMatrix4(root.matrixWorld); sph.radius = rec.r * root.matrixWorld.getMaxScaleOnAxis();
      if (!frustum.intersectsSphere(sph)) { culled++; continue; }
      if (pixelCull && k) { // 0.6px 미만이거나 (높이 40m 아래이면서) 안개 끝(fog.far) 밖 → 그려도 안 보임
        const d = sph.center.distanceTo(camera.position);
        if ((d > 1 && (sph.radius / d) * k < 0.6) || (fog?.isFog && d - sph.radius > fog.far * 1.02 && sph.center.y + sph.radius < 40)) { tiny++; continue; }
      }
      drawn++;
      let stale = false;
      for (const it of rec.list) {
        const o = it.o;
        if (o.material !== it.mat || o.geometry !== it.geo) { if (!stale) stats.lastStale = (o.name || o.geometry?.type) + ':' + (it.mat?.type) + '->' + (o.material?.type) + (Array.isArray(o.material) ? '[]' : ''); stale = true; continue; }
        if (!shownTo(o, root)) continue;
        const P = it.P; if (P.n >= P.im.instanceMatrix.count) continue;
        P.im.setMatrixAt(P.n, o.matrixWorld);
        if (P.lam) P.im.setColorAt(P.n, o.material.color);
        P.n++;
      }
      if (stale) { stats.rescanStale++; rec = scan(root, rec); roots.set(root, rec); } // 재질이 바뀐 부품: 다음 프레임부터 새 키로 (이번 프레임은 그 부품만 빠짐)
    }
    if (doRescan) prune();
    let inst = 0;
    for (const P of parts.values()) {
      if (!P.im) continue;
      P.im.count = P.n; P.im.visible = P.n > 0; inst += P.n;
      if (P.n) { P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true; }
    }
    Object.assign(stats, { parts: parts.size, instances: inst, drawnRoots: drawn, culledRoots: culled, tinyRoots: tiny, meshesHidden: hidden });
    stats.syncMs = +(stats.syncMs * 0.95 + (performance.now() - tS) * 0.05).toFixed(3);
  }
  function dispose() {
    for (const root of [...roots.keys()]) release(root);
    for (const P of parts.values()) if (P.im) { group.remove(P.im); P.im.dispose(); }
    parts.clear(); scene.remove(group); white.dispose();
  }
  return { group, track, release, setActive, sync, dispose, stats, has: (r) => roots.has(r), roots };
}
