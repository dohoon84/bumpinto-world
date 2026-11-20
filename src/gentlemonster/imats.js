// [gentle-monster] 실내 재질
import * as THREE from 'three';
import * as T from './textures.js';

export function createInteriorMaterials({ maxAniso = 4 } = {}) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const wm = T.waffleMaskTex();
  const ct = T.concreteTex();
  const m = {
    floor1: std({ map: T.polishedTex({ tone: '#aaa9a5' }), roughness: 0.42, metalness: 0.05, envMapIntensity: 0.6 }),
    floor2: std({ map: T.blackTerrazzoTex(), roughness: 0.16, metalness: 0.3, envMapIntensity: 0.8 }),
    floor3: std({ map: T.shagTex('#80838a'), roughness: 1, color: 0xb8bac0 }),
    floor4: std({ map: T.polishedTex({ tone: '#8a8984' }), roughness: 0.6 }),
    floor5: std({ map: T.mottledTex(), roughness: 1 }),
    ceil1: std({ map: T.waffleTex({ lights: true }), emissiveMap: wm, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.9 }),
    ceil2: std({ map: T.waffleTex({ dark: true, lights: true }), emissiveMap: wm, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9 }),
    ceil3: std({ map: T.waffleTex({ lights: true }), emissiveMap: wm, emissive: 0xfff2dc, emissiveIntensity: 0.6, roughness: 0.9 }),
    ceil5: std({ map: T.waffleTex({ dark: true, lights: true }), emissiveMap: wm, emissive: 0xffe9c8, emissiveIntensity: 0.8, roughness: 0.9 }),
    ply: std({ map: T.plyTex(), roughness: 0.7, side: THREE.DoubleSide }),
    drape: std({ map: T.drapeTex('#6f7a2e'), roughness: 1, side: THREE.DoubleSide }),
    velvet: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(0x59606e), sheenRoughness: 0.35, envMapIntensity: 0.35 }),
    alu: std({ metalness: 1, roughness: 0.3, envMapIntensity: 1.25 }),
    chromeHi: std({ metalness: 1, roughness: 0.04, envMapIntensity: 1.6 }),
    pool: new THREE.MeshBasicMaterial({ map: T.poolTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }),
    scallop: new THREE.MeshBasicMaterial({ map: T.scallopTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.45, side: THREE.DoubleSide }),
    plaster: std({ map: ct, roughness: 0.9, side: THREE.DoubleSide }),
    glassP: new THREE.MeshStandardMaterial({ color: 0xbfd8e0, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
  };
  for (const k of Object.keys(m)) { const t = m[k].map; if (t) t.anisotropy = maxAniso; }
  return m;
}
