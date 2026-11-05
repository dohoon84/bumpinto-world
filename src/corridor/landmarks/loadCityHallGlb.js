// [cityhall] Lazy GLTF+Draco loader for Blender building.glb — only pulled when ?cityhall=1 mounts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

let draco = null;
function getDraco(decoderPath) {
  if (draco) return draco;
  draco = new DRACOLoader();
  draco.setDecoderPath(decoderPath);
  draco.setDecoderConfig({ type: 'js' }); // wasm may fail on some hosts; js is fine for <100k mesh
  return draco;
}

/** @returns {Promise<THREE.Group|null>} */
export async function loadCityHallGlb(url, { env = null, decoderPath } = {}) {
  if (!url || typeof document === 'undefined') return null;
  const loader = new GLTFLoader();
  const path = decoderPath || url.replace(/[^/]+$/, 'draco/');
  loader.setDRACOLoader(getDraco(path));
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) return null;
  root.name = 'cityhallBuilding';
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const n = (m.name || '').toLowerCase();
      const isGlass = /glass|curtain|atrium/.test(n);
      if (isGlass) {
        const g = new THREE.MeshStandardMaterial({
          color: /curtain/.test(n) ? '#c5d8e6' : '#1e6aab',
          metalness: 0.88,
          roughness: 0.06,
          transparent: true,
          opacity: /curtain/.test(n) ? 0.55 : 0.72,
          side: THREE.DoubleSide,
          envMap: env || null,
          envMapIntensity: env ? (/curtain/.test(n) ? 1.1 : 1.8) : 0.3,
          depthWrite: false,
        });
        // keep name for debugging
        g.name = m.name || 'Glass';
        mats[i] = g;
        m.dispose?.();
      } else if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        if (env) { m.envMap = env; m.envMapIntensity = (m.envMapIntensity || 0.4) * 1.15; }
        m.metalness = Math.max(m.metalness ?? 0.1, 0.08);
        m.needsUpdate = true;
      }
    }
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  // Stable name hooks for tests / overlays
  const glass = root.getObjectByName('CityHallGlass');
  if (glass) glass.name = 'cityhallBlueFacade';
  else {
    const hook = new THREE.Group(); hook.name = 'cityhallBlueFacade'; root.add(hook);
  }
  return root;
}

export function disposeCityHallDraco() {
  if (draco) { draco.dispose(); draco = null; }
}
