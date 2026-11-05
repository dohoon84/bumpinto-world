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

/** Bright sky-blue glass (same hue as ref/04 / #3a7aa8) that reads in daylight + SwiftShader. */
function makeGlassMat(env) {
  // Lifted albedo + soft emissive so metalness/env can't crush it to near-black navy
  const g = new THREE.MeshStandardMaterial({
    color: '#6bb8dc',
    emissive: '#3a7aa8',
    emissiveIntensity: 0.75,
    metalness: 0.18,
    roughness: 0.32,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    envMap: env || null,
    envMapIntensity: env ? 0.85 : 0,
    depthWrite: true,
  });
  g.name = 'Glass';
  // Soft vertical sky gradient (brighter top) — keeps single hue, adds daylight read
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#8ec8e8');
    gr.addColorStop(0.35, '#5aa8d0');
    gr.addColorStop(0.7, '#3a7aa8');
    gr.addColorStop(1, '#2f6a94');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 256);
    // faint mullion lines
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 1;
    for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(0, i * 32 + 16); x.lineTo(64, i * 32 + 16); x.stroke(); }
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(i * 16 + 8, 0); x.lineTo(i * 16 + 8, 256); x.stroke(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 4);
    g.map = tex;
    g.emissiveMap = tex;
    g.needsUpdate = true;
  }
  return g;
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
  const glassMat = makeGlassMat(env);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const n = (m.name || '').toLowerCase();
      const isGlass = (/glass|atrium/.test(n) || (/curtain/.test(n) && !/east/.test(n))) && !/eastwindow|eastsilver/.test(n)
        || o.name === 'CityHallGlass' || o.name === 'cityhallBlueFacade';
      const isSlant = /slantface/i.test(n) || /SlantFace/i.test(o.name);
      const isEdge = /slantedge/i.test(n) || /SlantEdge/i.test(o.name);
      if (isGlass) {
        mats[i] = glassMat;
        m.dispose?.();
      } else if (isSlant) {
        // Cut face: same bright blue hue, opaque — diagonal wall must pop vs white body
        const sf = new THREE.MeshStandardMaterial({
          color: '#4a9ec8',
          emissive: '#3a7aa8',
          emissiveIntensity: 0.85,
          metalness: 0.12,
          roughness: 0.4,
          side: THREE.DoubleSide,
        });
        sf.name = 'SlantFace';
        mats[i] = sf; m.dispose?.();
      } else if (isEdge) {
        const se = new THREE.MeshStandardMaterial({ color: '#1a1e24', roughness: 0.55, metalness: 0.05 });
        se.name = 'SlantEdge';
        mats[i] = se; m.dispose?.();
      } else if (/eastwindow/.test(n)) {
        m.color?.set?.('#1e2630');
        m.metalness = 0.04; m.roughness = 0.6; m.emissive?.set?.('#000000');
        m.needsUpdate = true;
      } else if (/eastsilver|spandrel/.test(n)) {
        m.color?.set?.(/spandrel/.test(n) ? '#a8b0b8' : '#9aa4ae');
        m.metalness = 0.28; m.roughness = 0.4; m.emissive?.set?.('#000000');
        m.needsUpdate = true;
      } else if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        if (/^frame$/.test(n)) { m.color?.set?.('#b0b8c0'); m.emissive?.set?.('#000000'); }
        if (env) { m.envMap = env; m.envMapIntensity = (m.envMapIntensity || 0.4) * 1.15; }
        m.metalness = Math.min(m.metalness ?? 0.1, 0.25);
        m.needsUpdate = true;
      }
    }
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
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
