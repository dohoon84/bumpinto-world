// 궁수. 마른 후드 바이저, 빛나는 장궁, 녹색 이음새. 교체: ?archerGlb=
import * as THREE from 'three';
import { buildCarapace, put, seamMat, withGlb, animateRig } from './kit.js';

const GLOW = seamMat('#3dff9a');
const WOOD = new THREE.MeshStandardMaterial({ color: '#243028', metalness: 0.35, roughness: 0.55 });

function longbow() {
  const g = new THREE.Group();
  g.name = 'bow';
  const upper = put(g, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.05), WOOD), 0.08, 0.45, 0);
  upper.rotation.z = 0.35;
  const lower = put(g, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.05), WOOD), 0.08, -0.45, 0);
  lower.rotation.z = -0.35;
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.5, 0.015), GLOW), -0.02, 0, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.06), WOOD), 0, 0, 0);
  return g;
}

function build() {
  const group = buildCarapace({ name: 'bw-archer', bulk: 0.88, seam: '#3dff9a', plate: '#3d4a40', hood: true });
  const pose = group.userData.pose;
  const bow = longbow();
  bow.rotation.set(0.2, 0.4, 0.1);
  bow.scale.setScalar(1.15);
  pose.handL.add(bow);
  const quiver = put(
    group.children[0],
    new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 6), new THREE.MeshStandardMaterial({ color: '#1c2420', metalness: 0.4, roughness: 0.5 })),
    -0.16, 1.55, -0.28,
  );
  quiver.rotation.x = 0.3;
  for (let i = 0; i < 3; i++) {
    put(group.children[0], new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.28, 0.015), GLOW), -0.2 + i * 0.04, 1.85, -0.3);
  }
  return group;
}

export function createArcherModel(opts = {}) {
  return withGlb(opts.glbUrl, opts.yaw, opts.look, build, animateRig);
}
