// 탄천 레이드 전투 조명. 수치는 v4 lighting-spec / lighting_values.json 과 같다.
// 나중에 디자이너 키트가 오면 이 객체만 갈아 끼우면 된다.
import * as THREE from 'three';

export const LIGHTING = {
  exposure: 1.38,
  skyTop: '#3A0E12',
  skyMid: '#B8341F',
  skyHorizon: '#FF7A3A',
  fog: '#A8483A',
  fogNear: 34,
  fogFar: 130,
  hemiSky: '#FF9A7A',
  hemiGround: '#7A6A60',
  hemiI: 1.35,
  keyColor: '#FFC890',
  keyI: 2.6,
  keyFwd: 0.8,
  keySide: 0.6,
  keyHeight: 26,
  rimColor: '#9CC4FF',
  rimI: 1.3,
  rimFwd: -0.5,
  rimSide: -0.85,
  rimHeight: 18,
  riftColor: '#FF5A2E',
  riftI: 14,
  warmColor: '#FFB15A',
  warmI: 8,
  facade: '#B7A699',
  facadeBand: '#9C8B80',
  facadeEdge: '#7E7068',
  roof: '#6F625C',
  windowOff: '#3B3F4A',
  windowWarm: '#FFC27A',
  windowCool: '#A9D6FF',
  litRatio: 0.55,
  warmRatio: 0.65,
  windowEmissive: 1.1,
  pathBase: '#5E5450',
  pathTint: '#FFFFFF',
  pathMetal: 0.08,
  pathRough: 0.72,
  water: '#5E3A3A',
  waterEmissive: '#2A1210',
  railLight: '#FFD6A0',
  pillar: '#FF5A3A',
  rainOpacity: 0.22,
};

function facadeCanvas(emis) {
  const L = LIGHTING;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = emis ? '#000' : L.facade;
  g.fillRect(0, 0, 128, 256);
  if (!emis) {
    g.fillStyle = L.facadeBand;
    for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 128, 3);
    g.fillStyle = L.facadeEdge;
    g.fillRect(0, 0, 6, 256);
    g.fillRect(122, 0, 6, 256);
  }
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 8; y < 250; y += 32) {
    for (let x = 14; x < 116; x += 26) {
      const lit = rnd() < L.litRatio;
      const col = !lit ? (emis ? '#000' : L.windowOff) : (rnd() < L.warmRatio ? L.windowWarm : L.windowCool);
      g.fillStyle = col;
      g.fillRect(x, y + 8, 16, 16);
      if (!emis) {
        g.fillStyle = L.facadeEdge;
        g.fillRect(x, y + 24, 16, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function facadeMaterials() {
  const L = LIGHTING;
  const side = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: facadeCanvas(false),
    emissive: '#ffffff',
    emissiveMap: facadeCanvas(true),
    emissiveIntensity: L.windowEmissive,
    roughness: 0.85,
    metalness: 0,
  });
  const roof = new THREE.MeshStandardMaterial({ color: L.roof, roughness: 0.9, metalness: 0 });
  return [side, side, roof, roof, side, side];
}

const fw = new THREE.Vector3();
const rt = new THREE.Vector3();
const slide = new THREE.Vector3();

export function aimKeyAndRim(key, rim, focus, boss) {
  fw.set(boss.x - focus.x, 0, boss.z - focus.z);
  if (fw.lengthSq() < 1e-4) fw.set(0, 0, 1);
  fw.normalize();
  rt.set(-fw.z, 0, fw.x);
  const L = LIGHTING;
  slide.copy(fw).multiplyScalar(L.keyFwd).addScaledVector(rt, L.keySide);
  key.position.set(focus.x + slide.x * 30, L.keyHeight, focus.z + slide.z * 30);
  key.target.position.set(focus.x, focus.y || 0, focus.z);
  key.color.set(L.keyColor);
  key.intensity = L.keyI;
  slide.copy(fw).multiplyScalar(L.rimFwd).addScaledVector(rt, L.rimSide);
  rim.position.set(focus.x + slide.x * 30, L.rimHeight, focus.z + slide.z * 30);
  rim.target.position.set(focus.x, focus.y || 0, focus.z);
  rim.color.set(L.rimColor);
  rim.intensity = L.rimI;
}
