// [roadbike] 라이딩용 헬멧 머리 — 평소 머리(헤어/모자) 대신 갈아 끼운다
import * as THREE from 'three';

const matCache = new Map();
const M = (c) => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c }));
  return matCache.get(c);
};

const geo = {
  head: new THREE.SphereGeometry(0.26, 10, 8),
  headBox: new THREE.BoxGeometry(0.46, 0.5, 0.42),
  eye: new THREE.SphereGeometry(0.04, 6, 4),
  shell: new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  brim: new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.18),
  vent: new THREE.BoxGeometry(0.028, 0.012, 0.09),
  strap: new THREE.BoxGeometry(0.012, 0.16, 0.01),
  buckle: new THREE.BoxGeometry(0.05, 0.028, 0.018),
  glass: new THREE.TorusGeometry(0.065, 0.012, 6, 12),
  bridge: new THREE.BoxGeometry(0.08, 0.018, 0.018),
};

/**
 * 라이더 머리 슬롯용 헬멧 머리.
 * roadBike buildRider 의 head 그룹 기준: 머리 중심 ≈ (0, 0.24, 0)
 */
export function createRoadHelmetHead({
  skin = '#f2d0b0',
  face = 'round',
  glasses = false,
  gender = 'm',
} = {}) {
  const g = new THREE.Group();
  g.name = 'road-helmet-head';

  const female = gender === 'f';
  const head = new THREE.Mesh(face === 'square' ? geo.headBox : geo.head, M(skin));
  head.position.y = 0.24;
  if (face === 'long') head.scale.set(0.86, 1.2, 0.96);
  if (female) head.scale.multiplyScalar(0.94);
  head.castShadow = true;
  g.add(head);

  const eyeY = face === 'square' ? 0.28 : 0.3;
  const eyeZ = face === 'square' ? 0.24 : 0.22;
  const eyeL = new THREE.Mesh(geo.eye, M('#222'));
  eyeL.position.set(-0.09, eyeY, eyeZ);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.09;
  g.add(eyeL, eyeR);

  if (glasses) {
    const rL = new THREE.Mesh(geo.glass, M('#243044'));
    rL.position.set(-0.09, eyeY, eyeZ + 0.04);
    const rR = rL.clone();
    rR.position.x = 0.09;
    const bridge = new THREE.Mesh(geo.bridge, M('#243044'));
    bridge.position.set(0, eyeY, eyeZ + 0.04);
    g.add(rL, rR, bridge);
  }

  // 무광 블랙 에어로 헬멧 — 헤어/모자를 덮는 셸
  const shellMat = M('#1a1b1e');
  const shell = new THREE.Mesh(geo.shell, shellMat);
  shell.position.set(0, 0.34, -0.02);
  shell.scale.set(1.05, 0.92, 1.12);
  shell.castShadow = true;
  g.add(shell);

  const brim = new THREE.Mesh(geo.brim, shellMat);
  brim.position.set(0, 0.3, 0.02);
  brim.scale.set(1.02, 0.7, 1.08);
  g.add(brim);

  for (const dx of [-0.07, 0, 0.07]) {
    const vent = new THREE.Mesh(geo.vent, M('#0e0f11'));
    vent.position.set(dx, 0.46, -0.04);
    vent.rotation.x = -0.35;
    g.add(vent);
  }

  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(geo.strap, M('#2c2d31'));
    strap.position.set(sx * 0.14, 0.08, 0.08);
    strap.rotation.z = sx * 0.22;
    strap.rotation.x = 0.15;
    g.add(strap);
  }
  const buckle = new THREE.Mesh(geo.buckle, M('#3a3b40'));
  buckle.position.set(0, -0.02, 0.18);
  g.add(buckle);

  return g;
}
