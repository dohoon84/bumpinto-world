// [gentle-monster] 재질 모음 — 전부 MeshStandardMaterial(정점색 곱) + 일부 MeshBasic(빛나는 것).
//   낮/밤은 setNight() 로 emissive 만 바꾼다(재질 새로 안 만든다).
import * as THREE from 'three';
import * as T from './textures.js';

export function createMaterials({ maxAniso = 4 } = {}) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const ct = T.concreteTex(), up = T.uhpcTex(), fl = T.flutedTex();
  const m = {
    conc: std({ map: ct, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, color: 0xd6cfc2 }),
    uhpc: std({ map: up, roughness: 0.78, metalness: 0.02, color: 0xd9d3c8 }),
    crownSoffit: std({ map: up, roughness: 0.85, color: 0xe5dfd2, emissive: 0xffe3b4, emissiveIntensity: 0 }),
    fluted: std({ map: fl, roughness: 0.9, color: 0xc4c0b8 }),
    beam: std({ map: ct, roughness: 0.92 }),
    beamI: new THREE.MeshStandardMaterial({ map: ct, roughness: 0.92, color: 0xc4c0b8 }),
    roofTop: std({ map: T.gravelTex(), roughness: 1 }),
    curtain: new THREE.MeshStandardMaterial({ map: T.curtainTex(), emissiveMap: T.curtainTex({ night: true }), emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.45, roughness: 0.14, envMapIntensity: 1.2, color: 0xe3e9e5 }),
    slit: std({ side: THREE.DoubleSide, map: T.pillGlassTex(), emissiveMap: T.pillGlassTex({ night: true }), color: 0xffffff, metalness: 0.7, roughness: 0.04, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.6 }),
    skin: std({ map: T.skinTex(), roughness: 0.9, metalness: 0, side: THREE.DoubleSide, color: 0xeae2d4 }),
    reveal: std({ map: ct, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, color: 0xeee9df }),
    tierRib: std({ map: T.ribTex(), normalMap: T.ribTex({ normal: true }), normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.9, side: THREE.DoubleSide, color: 0xdcd6cb }),
    pframe: std({ color: 0x3a3936, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide }),
    topGlass: std({ side: THREE.DoubleSide, color: 0x6f8496, metalness: 0.6, roughness: 0.08, emissive: 0xfff1dc, emissiveIntensity: 0.12, envMapIntensity: 1.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2b3a46, metalness: 0.7, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.3 }),
    frame: std({ color: 0x1b1c1f, metalness: 0.7, roughness: 0.4 }),
    gravel: std({ map: T.gravelTex(), roughness: 1 }),
    asphalt: std({ map: T.asphaltTex(), roughness: 0.96 }),
    paver: std({ map: T.paverTex(), roughness: 0.9 }),
    brick: std({ map: T.brickTex(), roughness: 0.95 }),
    stucco: std({ map: T.stuccoTex(), emissiveMap: T.brickFacadeTex({ night: true, seed: 501 }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.95 }),
    soffit: std({ map: T.waffleTex({ lights: false }), roughness: 0.9 }),
    paint: std({ roughness: 0.8 }),
    brickR: std({ map: T.brickFacadeTex({ tone: '#8e4a37', seed: 201 }), emissiveMap: T.brickFacadeTex({ night: true, seed: 201 }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.92 }),
    brickD: std({ map: T.brickFacadeTex({ tone: '#5e3a2e', seed: 301 }), emissiveMap: T.brickFacadeTex({ night: true, seed: 301 }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.92 }),
    brickW: std({ map: T.brickFacadeTex({ tone: '#d9d4ca', seed: 401 }), emissiveMap: T.brickFacadeTex({ night: true, seed: 401 }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 }),
    shop: std({ map: T.shopfrontTex(), emissiveMap: T.shopfrontTex({ night: true }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.25, metalness: 0.3, envMapIntensity: 1 }),
    corr: std({ map: T.corrugatedTex(), roughness: 0.55, metalness: 0.45 }),
    leaf: std({ roughness: 0.85 }),
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
  m.tierRib.map.repeat.set(2.4, 1); m.tierRib.normalMap.repeat.set(2.4, 1);
  for (const k of Object.keys(m)) { const t = m[k].map; if (t) t.anisotropy = maxAniso; }
  return m;
}

/** 밤 켜기: 창과 유리 emissive */
export function setNight(m, night) {
  m.curtain.emissiveIntensity = night ? 1.45 : 0;
  m.curtain.map.needsUpdate = false;
  m.slit.emissiveIntensity = night ? 1.25 : 0;
  m.crownSoffit.emissiveIntensity = night ? 0.26 : 0;
  m.topGlass.emissiveIntensity = night ? 0.7 : 0.12; m.topGlass.color.set(night ? 0x2a3540 : 0x6f8496);
  m.glass.opacity = night ? 0.12 : 0.2;
  for (const k of ['brickR', 'brickD', 'brickW']) m[k].emissiveIntensity = night ? 0.9 : 0;
  m.shop.emissiveIntensity = night ? 1.1 : 0; m.stucco.emissiveIntensity = night ? 0.7 : 0;
}
