// [bump24game] 파란 편의점 장바구니 + 쌓기 + 쏟아짐
import * as THREE from 'three';
import { BASKET_MAX_KG, BY_ID, SHAPES } from './products.js';

export function createBasketMesh() {
  const g = new THREE.Group();
  g.name = 'bump24Basket';
  const blue = new THREE.MeshStandardMaterial({ color: '#1565c0', roughness: 0.55, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: '#0d47a1', roughness: 0.6, metalness: 0.05 });
  // 바닥
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.28), blue);
  floor.position.y = 0.01; g.add(floor);
  // 옆면 (구멍 느낌은 얇은 띠로)
  const wall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blue);
    m.position.set(x, y, z); g.add(m);
  };
  wall(0.38, 0.22, 0.018, 0, 0.13, -0.13);
  wall(0.38, 0.22, 0.018, 0, 0.13, 0.13);
  wall(0.018, 0.22, 0.26, -0.18, 0.13, 0);
  wall(0.018, 0.22, 0.26, 0.18, 0.13, 0);
  // 손잡이
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 16, Math.PI), dark);
  handle.rotation.z = Math.PI / 2; handle.rotation.y = Math.PI / 2;
  handle.position.set(0, 0.32, 0); g.add(handle);
  // 바닥 격자 느낌
  for (let i = -1; i <= 1; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.01), dark);
    rib.position.set(0, 0.025, i * 0.07); g.add(rib);
  }
  g.userData.mats = [blue, dark];
  return g;
}

export function createBasketController({ scene, maxKg = BASKET_MAX_KG }) {
  const mesh = createBasketMesh();
  mesh.visible = false;
  scene.add(mesh);
  const stackGroup = new THREE.Group();
  mesh.add(stackGroup);

  /** @type {{id:string, mesh:THREE.Object3D, weight:number, price:number, sale:boolean}[]} */
  const items = [];
  let shakeT = 0;
  let stunT = 0;
  let baseY = 0.02;

  const totalWeight = () => items.reduce((s, it) => s + it.weight, 0);
  const totalScore = () => items.reduce((s, it) => s + it.price * (it.sale ? 2 : 1), 0);
  const fill = () => totalWeight() / maxKg;

  function makeItemMesh(item) {
    const sh = SHAPES[item.shape];
    let geo;
    if (item.shape === 'cupRamen' || item.shape === 'can' || item.shape === 'pet' || item.shape === 'soju' || item.shape === 'wine') {
      geo = new THREE.CylinderGeometry(sh.w / 2, sh.w / 2 * 0.95, sh.h, 10);
    } else {
      geo = new THREE.BoxGeometry(sh.w, sh.h, sh.d);
    }
    const mat = new THREE.MeshStandardMaterial({
      color: item.color || '#ccc',
      roughness: 0.55,
      metalness: 0.05,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.userData.itemId = item.id;
    return m;
  }

  function relayout() {
    // 간단한 격자 쌓기: 3열, 위에서부터
    const cols = 3, gapX = 0.11, gapZ = 0.09;
    let layer = 0, col = 0, row = 0;
    let y = 0.04;
    for (const it of items) {
      const sh = SHAPES[BY_ID[it.id].shape];
      const x = (col - 1) * gapX;
      const z = (row - 0.5) * gapZ;
      it.mesh.position.set(x, y + sh.h / 2, z);
      it.mesh.rotation.set((Math.random() - 0.5) * 0.08, Math.random() * 0.4, (Math.random() - 0.5) * 0.08);
      col++;
      if (col >= cols) { col = 0; row++; }
      if (row >= 2) { row = 0; layer++; y += 0.07; }
    }
  }

  return {
    mesh,
    get items() { return items.map((it) => ({ id: it.id, price: it.price, weight: it.weight, sale: it.sale })); },
    get weight() { return totalWeight(); },
    get score() { return totalScore(); },
    get fill() { return fill(); },
    get maxKg() { return maxKg; },
    get stunned() { return stunT > 0; },
    get shaking() { return shakeT > 0 || fill() >= 0.8; },
    show(at) {
      mesh.visible = true;
      if (at) mesh.position.copy(at);
    },
    hide() { mesh.visible = false; },
    attachTo(player) {
      mesh.visible = true;
      // 플레이어 오른손 옆
      player.add(mesh);
      mesh.position.set(0.28, 0.85, 0.15);
      mesh.rotation.set(0.15, 0.4, 0.1);
      mesh.scale.setScalar(0.85);
    },
    detach(sceneRef) {
      if (mesh.parent) mesh.parent.remove(mesh);
      sceneRef.add(mesh);
      mesh.scale.setScalar(1);
    },
    tryAdd(item, { sale = false } = {}) {
      if (stunT > 0) return { ok: false, reason: 'stun' };
      const w = item.weight;
      if (totalWeight() + w > maxKg + 0.001) {
        // 쏟아짐
        return { ok: false, reason: 'overflow', spill: this.spill(2 + Math.floor(Math.random() * 2)) };
      }
      const m = makeItemMesh(item);
      stackGroup.add(m);
      items.push({ id: item.id, mesh: m, weight: w, price: item.price, sale });
      relayout();
      if (fill() >= 0.8) shakeT = 0.6;
      return { ok: true, fill: fill(), score: totalScore() };
    },
    spill(n = 3) {
      const spilled = [];
      while (spilled.length < n && items.length) {
        const it = items.pop();
        stackGroup.remove(it.mesh);
        // 월드로 떨어뜨리기 위해 mesh를 반환 (호출측이 바닥에 배치)
        spilled.push({ id: it.id, mesh: it.mesh, weight: it.weight, price: it.price, sale: it.sale });
      }
      relayout();
      shakeT = 0.8;
      stunT = 1.0;
      return spilled;
    },
    removeMesh(meshRef) {
      const i = items.findIndex((it) => it.mesh === meshRef);
      if (i >= 0) { stackGroup.remove(items[i].mesh); items.splice(i, 1); relayout(); }
    },
    clear() {
      while (items.length) {
        const it = items.pop();
        stackGroup.remove(it.mesh);
        it.mesh.geometry?.dispose();
        it.mesh.material?.dispose();
      }
    },
    update(dt) {
      if (stunT > 0) stunT -= dt;
      if (shakeT > 0) shakeT -= dt;
      const f = fill();
      if (f >= 0.8 || shakeT > 0) {
        const a = (f >= 1 ? 0.06 : 0.03) * Math.sin(performance.now() * 0.04);
        mesh.rotation.z = a;
        mesh.rotation.x = a * 0.5;
      } else {
        mesh.rotation.z *= 0.8;
        mesh.rotation.x *= 0.8;
      }
    },
    dispose() {
      this.clear();
      mesh.traverse((o) => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      mesh.parent?.remove(mesh);
    },
  };
}
