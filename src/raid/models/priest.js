// 사제. 금테 갑주, 머리 위 빛 고리, 등불 지팡이. 교체: ?priestGlb=
import * as THREE from 'three';
import { buildCarapace, put, seamMat, withGlb, animateRig } from './kit.js';

const GOLD = seamMat('#ffd27a');

function lantern() {
  const g = new THREE.Group();
  g.name = 'staff';
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.55, 6), new THREE.MeshStandardMaterial({ color: '#3a3428', metalness: 0.7, roughness: 0.35 })), 0, 0.6, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), new THREE.MeshStandardMaterial({ color: '#2a261c', metalness: 0.5, roughness: 0.4 })), 0, 1.5, 0);
  put(g, new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), GOLD), 0, 1.5, 0);
  put(g, new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 12), GOLD), 0, 1.5, 0);
  return g;
}

function build() {
  const group = buildCarapace({ name: 'bw-priest', bulk: 1.05, seam: '#e6c36a', plate: '#5c5648' });
  const pose = group.userData.pose;
  const rig = group.children[0];
  const halo = put(rig, new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 20), GOLD), 0, 2.62, 0);
  halo.rotation.x = Math.PI / 2;
  halo.name = 'halo';
  for (const side of [-1, 1]) {
    put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.04), GOLD), side * 0.3, 1.7, 0.16);
  }
  const weapon = lantern();
  weapon.rotation.z = -0.2;
  pose.handR.add(weapon);
  pose.rings = [halo];
  return group;
}

export function createPriestModel(opts = {}) {
  return withGlb(opts.glbUrl, opts.yaw, opts.look, build, animateRig);
}
