// 마법사. 로브 갑주, 떠 있는 룬 고리, 푸른 수정 지팡이. 교체: ?mageGlb=
import * as THREE from 'three';
import { CITIZEN_HEIGHT, CLASS_SCALE } from '../classes.js';
import { applyClassScale, buildCarapace, put, seamMat, withGlb, animateRig } from './kit.js';

const CRYSTAL = seamMat('#7aa6ff');

function staff() {
  const g = new THREE.Group();
  g.name = 'staff';
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.7, 6), new THREE.MeshStandardMaterial({ color: '#1c2433', metalness: 0.6, roughness: 0.4 })), 0, 0.7, 0);
  put(g, new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), CRYSTAL), 0, 1.65, 0);
  const ring = put(g, new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 16), CRYSTAL), 0, 1.65, 0);
  ring.rotation.x = Math.PI / 2;
  return g;
}

function build() {
  const group = buildCarapace({ name: 'bw-mage', bulk: 0.96, seam: '#6a7bff', plate: '#3c4660' });
  const pose = group.userData.pose;
  const robe = put(
    group.children[0],
    new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 1.15, 8), new THREE.MeshStandardMaterial({ color: '#1a2030', roughness: 0.8, metalness: 0.1 })),
    0, 0.85, 0,
  );
  robe.scale.z = 0.7;
  const H = CITIZEN_HEIGHT;
  const rings = [0.58, 0.72, 0.84].map((t, i) => {
    const r = put(group.children[0], new THREE.Mesh(new THREE.TorusGeometry(0.16 + i * 0.03, 0.012, 6, 20), seamMat('#8aa4ff')), 0, H * t, 0);
    r.rotation.x = 0.4 + i * 0.2;
    return r;
  });
  const weapon = staff();
  weapon.rotation.z = -0.15;
  pose.handR.add(weapon);
  pose.rings = rings;
  return applyClassScale(group, CLASS_SCALE.mage);
}

export function createMageModel(opts = {}) {
  return withGlb(opts.glbUrl, opts.yaw, opts.look, build, animateRig, CLASS_SCALE.mage);
}
