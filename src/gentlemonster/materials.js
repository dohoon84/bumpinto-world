// [gentle-monster] 재질 모음 — 전부 MeshStandardMaterial(정점색 곱) + 일부 MeshBasic(빛나는 것).
//   낮/밤은 setNight() 로 emissive 만 바꾼다(재질 새로 안 만든다).
import * as THREE from 'three';
import * as T from './textures.js';

export function createMaterials({ maxAniso = 4 } = {}) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  // 월드(정자·명동·남산) 톤: Lambert + 납작한 색 + 줄눈만. 사진 같은 노이즈 질감은 쓰지 않는다.
  const lam = (o) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
  const ct = T.panelTex({ base: '#d8d3c9', cols: 2, rows: 2, dots: true }), up = T.panelTex({ base: '#e2ddd2', cols: 2, rows: 1, joint: 'rgba(90,84,76,0.4)' }), fl = T.ribTex();
  const m = {
    conc: lam({ map: ct, side: THREE.DoubleSide, color: 0xe2dcd0 }),
    uhpc: lam({ map: up, color: 0xeee9df }),
    crownSoffit: lam({ map: up, color: 0xe3ddd1, emissive: 0xffe3b4, emissiveIntensity: 0 }),
    fluted: lam({ map: fl, color: 0xdcd6ca }),
    beam: lam({ color: 0xe6e1d6 }),
    beamI: new THREE.MeshLambertMaterial({ color: 0xe9e4d9 }),
    roofTop: lam({ color: 0xc9c5bc }),
    curtain: new THREE.MeshStandardMaterial({ map: T.curtainTex(), emissiveMap: T.curtainTex({ night: true }), emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.45, roughness: 0.14, envMapIntensity: 1.2, color: 0xe3e9e5 }),
    slit: std({ side: THREE.DoubleSide, map: T.pillGlassTex(), emissiveMap: T.pillGlassTex({ night: true }), color: 0xffffff, metalness: 0.7, roughness: 0.04, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.6 }),
    skin: lam({ map: T.panelTex({ base: '#e6e0d5', cols: 2, rows: 4, joint: 'rgba(90,84,76,0.16)', hi: 'rgba(255,255,255,0.14)' }), side: THREE.DoubleSide, color: 0xffffff }),
    reveal: lam({ side: THREE.DoubleSide, color: 0xf3efe7 }),
    tierRib: lam({ map: T.ribTex(), normalMap: T.ribTex({ normal: true }), normalScale: new THREE.Vector2(1.2, 1.2), side: THREE.DoubleSide, color: 0xf2ede3 }),
    pframe: std({ color: 0x3a3936, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide }),
    topGlass: std({ side: THREE.DoubleSide, color: 0x6f8496, metalness: 0.6, roughness: 0.08, emissive: 0xfff1dc, emissiveIntensity: 0.12, envMapIntensity: 1.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2b3a46, metalness: 0.7, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.3 }),
    frame: std({ color: 0x1b1c1f, metalness: 0.7, roughness: 0.4 }),
    gravel: lam({ map: T.panelTex({ base: '#e4e1da', joint: 'rgba(0,0,0,0)', hi: 'rgba(0,0,0,0)', cols: 1, rows: 1 }) }),
    asphalt: lam({ color: 0x5b5d62 }),
    paver: lam({ map: T.panelTex({ base: '#cfccc5', cols: 4, rows: 4, joint: 'rgba(0,0,0,0.10)', hi: 'rgba(255,255,255,0.10)' }) }),
    brick: lam({ color: 0xb46a50 }),
    stucco: lam({ map: T.flatFacadeTex({ wall: '#d7d9dc', win: '#6f8296', seed: 501 }), emissiveMap: T.flatFacadeTex({ night: true, seed: 501 }), emissive: 0xffffff, emissiveIntensity: 0 }),
    soffit: std({ map: T.waffleTex({ lights: false }), roughness: 0.9 }),
    paint: std({ roughness: 0.8 }),
    brickR: lam({ map: T.flatFacadeTex({ wall: '#b8684e', seed: 201 }), emissiveMap: T.flatFacadeTex({ night: true, seed: 201 }), emissive: 0xffffff, emissiveIntensity: 0 }),
    brickD: lam({ map: T.flatFacadeTex({ wall: '#8d5a48', frame: '#e6dccd', seed: 301 }), emissiveMap: T.flatFacadeTex({ night: true, seed: 301 }), emissive: 0xffffff, emissiveIntensity: 0 }),
    brickW: lam({ map: T.flatFacadeTex({ wall: '#efe9dd', win: '#6b7f92', frame: '#ffffff', seed: 401 }), emissiveMap: T.flatFacadeTex({ night: true, seed: 401 }), emissive: 0xffffff, emissiveIntensity: 0 }),
    shop: lam({ map: T.flatShopTex(), emissiveMap: T.flatShopTex({ night: true }), emissive: 0xffffff, emissiveIntensity: 0 }),
    signs: lam({ map: T.signAtlasTex(), emissiveMap: T.signAtlasTex(), emissive: 0xffffff, emissiveIntensity: 0.3 }),
    corr: lam({ map: T.ribTex(), color: 0xc9d0d4 }),
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
  m.tierRib.map.repeat.set(2.4, 1); m.tierRib.normalMap.repeat.set(2.4, 1); m.fluted.map.repeat.set(1, 1);
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
  m.shop.emissiveIntensity = night ? 0.95 : 0; m.signs.emissiveIntensity = night ? 0.95 : 0.3; m.stucco.emissiveIntensity = night ? 0.7 : 0;
}
