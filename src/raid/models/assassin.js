// 암살자. 날씬한 가시 갑각, 곡쌍검, 진홍 이음새, 연기 꼬리. 교체: ?assassinGlb=
import * as THREE from 'three';
import { CLASS_SCALE } from '../classes.js';
import { applyClassScale, buildCarapace, put, seamMat, withGlb, animateRig } from './kit.js';

const EDGE = seamMat('#ff3355');
const STEEL = new THREE.MeshStandardMaterial({ color: '#c5ced6', metalness: 0.8, roughness: 0.25 });

function blade(side) {
  const g = new THREE.Group();
  g.name = 'dagger';
  const curve = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.028, 4, 14, Math.PI * 0.75), STEEL);
  curve.rotation.z = side * 0.4;
  g.add(curve);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.012, 3, 14, Math.PI * 0.75), EDGE);
  edge.rotation.z = curve.rotation.z;
  g.add(edge);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.04), STEEL), 0, -0.08, 0);
  return g;
}

function build() {
  const group = buildCarapace({ name: 'bw-assassin', bulk: 0.9, seam: '#ff3355', plate: '#3a404c', spikes: true });
  const pose = group.userData.pose;
  const left = blade(1);
  left.rotation.set(0.4, 0.2, 0.8);
  pose.handL.add(left);
  const right = blade(-1);
  right.rotation.set(0.4, -0.2, -0.8);
  pose.handR.add(right);
  const smoke = new THREE.Group();
  smoke.name = 'smoke';
  const mat = new THREE.MeshBasicMaterial({ color: '#2a2428', transparent: true, opacity: 0.22, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const p = put(smoke, new THREE.Mesh(new THREE.SphereGeometry(0.12 + i * 0.04, 6, 5), mat), 0, 1.2, -0.2 - i * 0.16);
    p.scale.set(1, 0.6, 1);
  }
  group.children[0].add(smoke);
  pose.smoke = smoke;
  return applyClassScale(group, CLASS_SCALE.assassin);
}

export function createAssassinModel(opts = {}) {
  return withGlb(opts.glbUrl, opts.yaw, opts.look, build, animateRig, CLASS_SCALE.assassin);
}
