// [cityhall] Lazy GLTF+Draco loader — Pass 6 materials (NC-like muted glass + warm lobby).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

let draco = null;
function getDraco(decoderPath) {
  if (draco) return draco;
  draco = new DRACOLoader();
  draco.setDecoderPath(decoderPath);
  draco.setDecoderConfig({ type: 'js' });
  return draco;
}

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

/** NC-soft-like muted blue curtain — day gradient + faint mullions; night soft office glow. */
function makeGlassMat(env) {
  const day = canvasTex(128, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7aa8c4');
    g.addColorStop(0.4, '#5a8aaa');
    g.addColorStop(0.75, '#3d6a88');
    g.addColorStop(1, '#2a4e68');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1;
    for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(0, i * 26 + 12); x.lineTo(w, i * 26 + 12); x.stroke(); }
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(i * 22 + 10, 0); x.lineTo(i * 22 + 10, h); x.stroke(); }
  }, 8, 5);
  const night = canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 6; i++) {
      if (Math.random() < 0.35) continue;
      const warm = Math.random() < 0.7;
      x.fillStyle = warm ? `rgba(255,${200 + Math.random() * 40},${140 + Math.random() * 40},${0.35 + Math.random() * 0.45})`
        : `rgba(180,210,255,${0.25 + Math.random() * 0.4})`;
      x.fillRect(i * 22 + 3, j * 26 + 4, 16, 18);
    }
  }, 8, 5);
  const g = new THREE.MeshStandardMaterial({
    color: '#6a96b4',
    map: day,
    emissive: '#ffffff',
    emissiveMap: night,
    emissiveIntensity: 0,
    metalness: 0.22,
    roughness: 0.28,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    envMap: env || null,
    envMapIntensity: env ? 0.7 : 0,
    depthWrite: true,
  });
  g.name = 'Glass';
  g.userData.dayMap = day;
  g.userData.nightMap = night;
  return g;
}

function makeLobbyMat() {
  const g = new THREE.MeshStandardMaterial({
    color: '#e8c888',
    emissive: '#ffc878',
    emissiveIntensity: 0.55,
    metalness: 0.05,
    roughness: 0.4,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  g.name = 'LobbyGlass';
  return g;
}

function makeFoldMat(env) {
  const g = makeGlassMat(env).clone();
  g.name = 'GlassFold';
  g.color.set('#4a7a9a');
  g.opacity = 0.90;
  g.metalness = 0.2;
  g.roughness = 0.22;
  g.envMapIntensity = env ? 0.9 : 0;
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
  const foldMat = makeFoldMat(env);
  const lobbyMat = makeLobbyMat();
  const nightables = [glassMat, foldMat, lobbyMat];

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? [...(Array.isArray(o.material) ? o.material : [o.material])] : [o.material];
    const src = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < src.length; i++) {
      const m = src[i];
      if (!m) continue;
      const n = (m.name || '').toLowerCase();
      if (/lobby/.test(n)) {
        mats[i] = lobbyMat; m.dispose?.();
      } else if (/glassfold|fold/.test(n)) {
        mats[i] = foldMat; m.dispose?.();
      } else if (/glassband/.test(n)) {
        const b = glassMat.clone();
        b.name = 'GlassBand';
        b.color.set('#3a6a98');
        b.emissive.set('#2a5080');
        b.emissiveIntensity = 0.35;
        b.opacity = 0.9;
        mats[i] = b; nightables.push(b); m.dispose?.();
      } else if (/^glass$/.test(n) || (n.includes('glass') && !/lobby|band|fold/.test(n))) {
        mats[i] = glassMat; m.dispose?.();
      } else if (/eastblock|louver/.test(n)) {
        m.color?.set?.(/louver/.test(n) ? '#1a1c1e' : '#45484d');
        m.metalness = 0.15; m.roughness = 0.55;
        m.emissive?.set?.('#000000'); m.emissiveIntensity = 0;
        m.needsUpdate = true;
      } else if (/fascia|frame|soffit|roof|pilotis|spandrel|prow|mech/.test(n)) {
        if (/fascia|frame/.test(n)) m.color?.set?.('#f0f2f4');
        if (/pilotis/.test(n)) { m.color?.set?.('#d8dce0'); m.metalness = 0.4; m.roughness = 0.3; }
        if (/prow/.test(n)) m.color?.set?.('#6a6e74');
        if (/mechdark/.test(n)) m.color?.set?.('#121314');
        else if (/mech/.test(n)) m.color?.set?.('#8a8e94');
        if (/roof/.test(n)) { m.color?.set?.('#e0e4e8'); m.metalness = 0.35; m.roughness = 0.4; }
        if (env && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
          m.envMap = env; m.envMapIntensity = 0.35;
        }
        m.needsUpdate = true;
      } else if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        if (env) { m.envMap = env; m.envMapIntensity = (m.envMapIntensity || 0.3) * 1.1; }
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

  root.userData.setNight = (on) => {
    const n = on ? 1 : 0;
    glassMat.emissiveIntensity = n * 0.85;
    foldMat.emissiveIntensity = n * 0.9;
    lobbyMat.emissiveIntensity = on ? 1.8 : 0.45;
    lobbyMat.opacity = on ? 0.85 : 0.65;
    for (const m of nightables) {
      if (m === glassMat || m === foldMat || m === lobbyMat) continue;
      if (m.name === 'GlassBand') m.emissiveIntensity = on ? 0.7 : 0.3;
    }
  };
  root.userData.setNight(false);
  return root;
}

export function disposeCityHallDraco() {
  if (draco) { draco.dispose(); draco = null; }
}
