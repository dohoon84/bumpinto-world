// [gentle-monster] 재질 모음 — 전부 MeshStandardMaterial(정점색 곱) + 일부 MeshBasic(빛나는 것).
//   낮/밤은 setNight() 로 emissive 만 바꾼다(재질 새로 안 만든다).
import * as THREE from 'three';
import * as T from './textures.js';

export function createMaterials({ maxAniso = 4 } = {}) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const ct = T.concreteTex(), up = T.uhpcTex(), fl = T.flutedTex();
  const m = {
    conc: std({ map: ct, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, color: 0xc4c0b8 }),
    uhpc: std({ map: up, roughness: 0.78, metalness: 0.02, color: 0xcfcac0 }),
    fluted: std({ map: fl, roughness: 0.9, color: 0xc4c0b8 }),
    beam: std({ map: ct, roughness: 0.92 }),
    beamI: new THREE.MeshStandardMaterial({ map: ct, roughness: 0.92, color: 0xc4c0b8 }),
    roofTop: std({ map: T.gravelTex(), roughness: 1 }),
    curtain: new THREE.MeshStandardMaterial({ map: T.curtainTex(), emissiveMap: T.curtainTex({ night: true }), emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.55, roughness: 0.16, envMapIntensity: 1.1 }),
    slit: std({ side: THREE.DoubleSide, color: 0x1a232e, metalness: 0.85, roughness: 0.08, emissive: 0xffc27a, emissiveIntensity: 0, envMapIntensity: 1.2 }),
    topGlass: std({ side: THREE.DoubleSide, color: 0x17222d, metalness: 0.85, roughness: 0.07, emissive: 0xffd2a0, emissiveIntensity: 0, envMapIntensity: 1.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2b3a46, metalness: 0.7, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.3 }),
    frame: std({ color: 0x1b1c1f, metalness: 0.7, roughness: 0.4 }),
    gravel: std({ map: T.gravelTex(), roughness: 1 }),
    asphalt: std({ map: T.asphaltTex(), roughness: 0.96 }),
    paver: std({ map: T.paverTex(), roughness: 0.9 }),
    brick: std({ map: T.brickTex(), roughness: 0.95 }),
    stucco: std({ map: T.stuccoTex(), roughness: 0.95 }),
    soffit: std({ map: T.waffleTex({ lights: false }), roughness: 0.9 }),
    paint: std({ roughness: 0.8 }),
    leaf: std({ roughness: 0.9, flatShading: true }),
    metal: std({ metalness: 0.85, roughness: 0.3, envMapIntensity: 1 }),
    chrome: std({ metalness: 1, roughness: 0.06, envMapIntensity: 1.5 }),
    mech: std({ metalness: 0.7, roughness: 0.33, envMapIntensity: 1.1 }),
    gloss: std({ metalness: 0.2, roughness: 0.14, envMapIntensity: 1.1 }),
    matte: std({ metalness: 0, roughness: 0.92 }),
    fur: std({ metalness: 0, roughness: 1 }),
    bag: std({ metalness: 0.1, roughness: 0.25, envMapIntensity: 1.2 }),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  m.conc.map.repeat.set(1, 1);
  for (const k of Object.keys(m)) { const t = m[k].map; if (t) t.anisotropy = maxAniso; }
  return m;
}

/** 밤 켜기: 창과 유리 emissive */
export function setNight(m, night) {
  m.curtain.emissiveIntensity = night ? 1.0 : 0;
  m.curtain.map.needsUpdate = false;
  m.slit.emissiveIntensity = night ? 0.9 : 0;
  m.topGlass.emissiveIntensity = night ? 0.8 : 0;
  m.glass.opacity = night ? 0.12 : 0.2;
}
