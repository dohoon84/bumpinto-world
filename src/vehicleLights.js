// 저녁 전조등·미등. 차체 로컬 +z 가 진행 방향.
// 렌즈는 무조명 재질이라 밤에도 밝고, 광선은 가산 합성으로 빛처럼 번진다.
import * as THREE from 'three';

function canvasTex(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const headGlowMap = canvasTex((g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, w * 0.02, w / 2, h / 2, w * 0.5);
  grd.addColorStop(0, 'rgba(255,255,250,1)');
  grd.addColorStop(0.22, 'rgba(255,250,230,0.92)');
  grd.addColorStop(0.5, 'rgba(255,236,180,0.38)');
  grd.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
}, 128, 128);

const tailGlowMap = canvasTex((g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, w * 0.04, w / 2, h / 2, w * 0.5);
  grd.addColorStop(0, 'rgba(255,70,50,1)');
  grd.addColorStop(0.28, 'rgba(255,24,16,0.8)');
  grd.addColorStop(0.62, 'rgba(190,0,0,0.22)');
  grd.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
}, 128, 128);

// 캔버스 위(v=1)가 램프, 아래(v=0)가 광선 끝.
function beamMap(stops) {
  return canvasTex((g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    for (const [t, col] of stops) grd.addColorStop(t, col);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, 4, 128);
}

const headBeamMap = beamMap([
  [0, 'rgba(255,252,240,0.72)'],
  [0.16, 'rgba(255,246,210,0.34)'],
  [0.45, 'rgba(255,236,180,0.1)'],
  [1, 'rgba(255,230,160,0)'],
]);
const tailBeamMap = beamMap([
  [0, 'rgba(255,36,24,0.8)'],
  [0.4, 'rgba(220,12,8,0.22)'],
  [1, 'rgba(140,0,0,0)'],
]);

function beamMat(map) {
  return new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
function glowMat(map) {
  return new THREE.SpriteMaterial({
    map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

const headLensMat = new THREE.MeshBasicMaterial({ color: '#fffef8' });
const tailLensMat = new THREE.MeshBasicMaterial({ color: '#ff241c' });
const headBeamMat = beamMat(headBeamMap);
const tailBeamMat = beamMat(tailBeamMap);
const headSpriteMat = glowMat(headGlowMap);
const tailSpriteMat = glowMat(tailGlowMap);

const beamGeos = new Map();
function beamGeometry(length, radius) {
  const key = length + 'x' + radius;
  let geo = beamGeos.get(key);
  if (geo) return geo;
  // Cone: 꼭지(+y) / 밑면(-y). -90° X 회전 후 밀면 꼭지가 z=0, 넓은 끝이 +z.
  geo = new THREE.ConeGeometry(radius, length, 14, 1, true);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, length / 2);
  beamGeos.set(key, geo);
  return geo;
}

const lensGeos = new Map();
function lensGeometry(w, h, d) {
  const key = `${w}x${h}x${d}`;
  let geo = lensGeos.get(key);
  if (geo) return geo;
  geo = new THREE.BoxGeometry(w, h, d);
  lensGeos.set(key, geo);
  return geo;
}

// dir +1 앞, -1 뒤. lens/glow/beam 은 [가로, 세로] 또는 [길이, 반지름].
export function addVehicleLamp(parent, { x, y, z, dir = 1, kind = 'head', lens, glow, beam }) {
  const head = kind === 'head';
  const [lw, lh] = lens;
  const [gw, gh] = glow;
  const [len, radius] = beam;
  const lamp = new THREE.Mesh(lensGeometry(lw, lh, 0.1), head ? headLensMat : tailLensMat);
  lamp.position.set(x, y, z);
  lamp.castShadow = false;
  lamp.renderOrder = 2;

  const halo = new THREE.Sprite(head ? headSpriteMat : tailSpriteMat);
  halo.scale.set(gw, gh, 1);
  halo.position.set(x, y, z + dir * 0.16);
  halo.renderOrder = 4;

  const shaft = new THREE.Mesh(beamGeometry(len, radius), head ? headBeamMat : tailBeamMat);
  shaft.position.set(x, y, z);
  shaft.castShadow = false;
  shaft.renderOrder = 3;
  if (dir < 0) shaft.scale.z = -1;
  else shaft.rotation.x = 0.07;

  parent.add(lamp, halo, shaft);
}
