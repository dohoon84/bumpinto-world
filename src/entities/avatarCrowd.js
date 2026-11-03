// 아바타 인스턴싱 공용 도우미 (원래 corridor/traffic.js 안에 있던 buildCrowd 를 그대로 옮김)
//   쓰는 곳: corridor/traffic.js 코리더 보행 NPC · world/bungeoStall.js 붕어빵 줄 손님
//   cast(P): 부품별 그림자 여부(없으면 원본 메시 castShadow 그대로). P.geo 로 부품을 고를 수 있다.
import * as THREE from 'three';

// [life] 보행 NPC 인스턴싱: 아바타(장면 밖 Object3D)를 그대로 애니메이션한 뒤, 부품(공유 지오메트리)별 InstancedMesh 에 행렬·색을 쓴다.
//   → 보행자 수와 무관하게 draw call 은 부품 종류 수(≈20)로 고정. 55m 밖에서는 눈·안경 같은 작은 부품은 생략(LOD)
export function buildCrowd(group, { name = 'corridorCrowd', cast = null } = {}) {
  const parts = new Map();
  const shown = (o, root) => { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; };
  return {
    parts,
    register(root) {
      root.updateMatrixWorld(true);
      const list = [];
      root.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const m = o.material;
        const lam = m.isMeshLambertMaterial && !m.map && !m.transparent && m.side === THREE.FrontSide && (!m.emissive || m.emissive.getHex() === 0);
        const key = (lam ? 'L|' : 'M|' + m.uuid + '|') + o.geometry.uuid;
        let P = parts.get(key);
        if (!P) parts.set(key, (P = { geo: o.geometry, mat: lam ? null : m, lam, cast: o.castShadow, cap: 0, n: 0, im: null }));
        P.cap++;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        list.push({ o, P, small: o.geometry.boundingSphere.radius < 0.09 });
      });
      return list;
    },
    finalize() {
      for (const P of parts.values()) {
        const im = new THREE.InstancedMesh(P.geo, P.lam ? new THREE.MeshLambertMaterial({ color: '#ffffff' }) : P.mat, Math.max(1, P.cap));
        im.count = 0; im.castShadow = cast ? cast(P) && P.cast : P.cast; im.receiveShadow = true; im.frustumCulled = false; im.name = name;
        if (P.lam) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, P.cap) * 3), 3);
        P.im = im; group.add(im);
      }
    },
    begin() { for (const P of parts.values()) P.n = 0; },
    add(root, list, far) {
      root.updateMatrixWorld(true);
      for (const it of list) {
        if ((far && it.small) || !shown(it.o, root)) continue;
        const P = it.P; if (P.n >= P.im.instanceMatrix.count) continue;
        P.im.setMatrixAt(P.n, it.o.matrixWorld);
        if (P.lam) P.im.setColorAt(P.n, it.o.material.color);
        P.n++;
      }
    },
    end() {
      for (const P of parts.values()) {
        P.im.count = P.n; P.im.visible = P.n > 0;
        if (P.n) { P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true; }
      }
    },
  };
}
