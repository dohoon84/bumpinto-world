// 전사. 두꺼운 흑갑, 대검, 타워 실드, 주황 이음새. 교체: ?warriorGlb= (전신, 키 약 2.35m)
import * as THREE from 'three';
import { buildCarapace, put, seamMat } from './models/kit.js';
import { withGlb } from './models/kit.js';

const BLADE = new THREE.MeshStandardMaterial({ color: '#c5ced6', metalness: 0.82, roughness: 0.22 });
const EDGE = seamMat('#ff8a3a');
const PLATE = new THREE.MeshStandardMaterial({ color: '#2a313a', metalness: 0.74, roughness: 0.36 });

function greatsword() {
  const g = new THREE.Group();
  g.name = 'sword';
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.08), PLATE), 0, 0.1, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.06), EDGE), 0, 0.24, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.35, 0.035), BLADE), 0, 0.95, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.32, 0.02), EDGE), 0.06, 0.95, 0);
  const tip = put(g, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), BLADE), 0, 1.7, 0);
  tip.rotation.y = Math.PI / 4;
  return g;
}

function towerShield() {
  const g = new THREE.Group();
  g.name = 'shield';
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.28, 0.08), PLATE), 0, 0, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.1), EDGE), 0, 0.62, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.1), EDGE), 0, -0.62, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.28, 0.1), EDGE), -0.32, 0, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.28, 0.1), EDGE), 0.32, 0, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.02), EDGE), 0, 0, 0.05);
  return g;
}

function build() {
  const group = buildCarapace({ name: 'bw-warrior', bulk: 1.28, seam: '#ff6a22', plate: '#5a6572' });
  const pose = group.userData.pose;
  const capePivot = new THREE.Group();
  capePivot.name = 'cape';
  capePivot.position.set(0, 1.95, -0.28);
  const cape = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.85, 0.04),
    new THREE.MeshStandardMaterial({ color: '#3a1818', roughness: 0.8, side: THREE.DoubleSide }),
  );
  cape.position.y = -0.4;
  capePivot.add(cape);
  put(capePivot, new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.02), EDGE), 0.34, -0.4, 0.02);
  group.children[0].add(capePivot);
  const sword = greatsword();
  sword.rotation.set(-0.35, 0, -0.9);
  pose.handR.add(sword);
  const shield = towerShield();
  shield.rotation.set(0.1, -0.2, 0);
  pose.handL.add(shield);
  pose.sword = sword;
  pose.shield = shield;
  pose.capePivot = capePivot;
  return group;
}

export function animateWarrior(group, dt, motion) {
  const pose = group.userData.pose;
  if (!pose?.legL) return;
  const speed = motion?.speed || 0;
  const attack = motion?.attack || '';
  const t = motion?.attackT || 0;
  pose.phase = (pose.phase || 0) + dt * (2.2 + speed * 0.85);
  const swing = speed > 0.4 ? Math.sin(pose.phase) : Math.sin(pose.phase * 0.5) * 0.12;
  const amp = speed > 0.4 ? 0.5 : 0.06;
  pose.legL.rotation.x = swing * amp;
  pose.legR.rotation.x = -swing * amp;
  pose.armL.rotation.set(-swing * amp * 0.45, 0, 0.12);
  pose.armR.rotation.set(swing * amp * 0.35, 0, -0.12);
  if (pose.sword) pose.sword.rotation.set(-0.35, 0, -0.9);
  if (pose.shield) pose.shield.rotation.set(0.1, -0.2, 0);
  if (pose.capePivot) {
    pose.capePivot.rotation.x = 0.12 + Math.sin(pose.phase * 0.7) * 0.06;
  }
  const k = Math.sin(Math.min(1, t / 0.34) * Math.PI);
  if (attack === 'slash') {
    pose.armR.rotation.x = -1.15 * k;
    if (pose.sword) pose.sword.rotation.set(-0.2 - 0.6 * k, 0, -0.4);
  } else if (attack === 'charge') {
    pose.armL.rotation.x = -0.8 * Math.min(1, t / 0.28);
    group.rotation.x = 0.12 * Math.min(1, t / 0.28);
  } else if (attack === 'shout') {
    pose.armL.rotation.z = 0.5 * k;
    pose.armR.rotation.z = -0.7 * k;
  } else if (attack === 'spin') {
    pose.armR.rotation.y = Math.min(1, t / 0.5) * Math.PI * 2;
  } else {
    group.rotation.x = 0;
  }
}

export function createWarriorModel(opts = {}) {
  return withGlb(opts.glbUrl, opts.yaw, opts.look, build, animateWarrior);
}
