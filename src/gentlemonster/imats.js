// [gentle-monster] 실내 재질
import * as THREE from 'three';
import * as T from './textures.js';

export function createInteriorMaterials({ maxAniso = 4 } = {}) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const wm = T.waffleMaskTex();
  const ct = T.concreteTex();
  const m = {
    floor1: std({ map: T.polishedTex({ tone: '#aaa9a5' }), roughness: 0.42, metalness: 0.05, envMapIntensity: 0.6 }),
    floor2: std({ map: T.blackTerrazzoTex(), roughness: 0.2, metalness: 0.25, envMapIntensity: 0.9 }),
    floor3: std({ map: T.shagTex('#6d7078'), roughness: 1 }),
    floor4: std({ map: T.polishedTex({ tone: '#8a8984' }), roughness: 0.6 }),
    floor5: std({ map: T.mottledTex(), roughness: 1 }),
    ceil1: std({ map: T.waffleTex({ lights: true }), emissiveMap: wm, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.9 }),
    ceil2: std({ map: T.waffleTex({ dark: true, lights: true }), emissiveMap: wm, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9 }),
    ceil3: std({ map: T.waffleTex({ lights: true }), emissiveMap: wm, emissive: 0xfff2dc, emissiveIntensity: 1.0, roughness: 0.9 }),
    ceil5: std({ map: T.waffleTex({ dark: true, lights: true }), emissiveMap: wm, emissive: 0xffe9c8, emissiveIntensity: 0.8, roughness: 0.9 }),
    plaster: std({ map: ct, roughness: 0.9, side: THREE.DoubleSide }),
    glassP: new THREE.MeshStandardMaterial({ color: 0xbfd8e0, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
  };
  for (const k of Object.keys(m)) { const t = m[k].map; if (t) t.anisotropy = maxAniso; }
  return m;
}
