// 직업 모델이 같이 쓰는 얼굴 부착, GLB 끼우기, 유령 실루엣.
// 각 직업 파일은 이 도우미 위에 자기 메시만 올린다. 디자이너 GLB 는 glbUrl 로 통째로 갈아끼운다.
import * as THREE from 'three';
import { getHeadGeometry, getFaceMaterial } from '../../entities/faceTexture.js';

export function put(parent, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });
}

export function attachFace(socket, look) {
  const head = new THREE.Mesh(getHeadGeometry(look.face || 'round'), getFaceMaterial(look, 'idle'));
  head.name = 'face';
  head.castShadow = true;
  socket.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    std(look.hairColor || '#2a211c', { roughness: 0.8, metalness: 0 }),
  );
  hair.scale.set(1.02, 0.7, 1.02);
  hair.position.y = 0.12;
  socket.add(hair);
  return head;
}

export function headSocket(rig, look) {
  const socket = new THREE.Group();
  socket.name = 'headSocket';
  socket.position.y = 1.62;
  rig.add(socket);
  attachFace(socket, look);
  return socket;
}

export function limb(rig, side, y, mat) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.34, y, 0);
  rig.add(pivot);
  put(pivot, new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.34, 3, 6), mat), 0, -0.28, 0);
  const hand = new THREE.Group();
  hand.position.set(0, -0.5, 0.02);
  pivot.add(hand);
  pivot.userData.hand = hand;
  return pivot;
}

export function legs(rig, mat, boot) {
  const out = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.72, 0);
    rig.add(pivot);
    put(pivot, new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 3, 6), mat), 0, -0.26, 0);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.26), boot), 0, -0.48, 0.04);
    out.push(pivot);
  }
  return out;
}

export function seamMat(color) {
  return new THREE.MeshBasicMaterial({ color });
}

export function buildCarapace({
  name = 'bw-suit',
  bulk = 1,
  seam = '#ff6a22',
  plate = '#4e5966',
  hood = false,
  spikes = false,
} = {}) {
  const group = new THREE.Group();
  group.name = name;
  const rig = new THREE.Group();
  const P = new THREE.MeshStandardMaterial({ color: plate, metalness: 0.62, roughness: 0.42 });
  const U = new THREE.MeshStandardMaterial({ color: '#2a3138', metalness: 0.35, roughness: 0.58 });
  const S = seamMat(seam);
  const b = bulk;

  put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.48 * b, 0.26, 0.28), U), 0, 1.26, 0);
  put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.58 * b, 0.5, 0.34), P), 0, 1.7, 0.02);
  put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.03), S), 0, 1.72, 0.18);
  put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.5 * b, 0.035, 0.03), S), 0, 1.5, 0.16);
  for (let i = 0; i < 3; i++) {
    const back = put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.36 * b - i * 0.04, 0.1, 0.1), P), 0, 1.46 + i * 0.16, -0.22);
    back.rotation.x = -0.3;
    put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.28 * b, 0.02, 0.02), S), 0, 1.46 + i * 0.16, -0.16);
  }
  for (const side of [-1, 1]) {
    put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.3 * b, 0.16, 0.34), P), side * 0.46 * b, 1.96, 0);
    put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.24 * b, 0.03, 0.04), S), side * 0.46 * b, 1.88, 0.14);
  }

  put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.4), P), 0, 2.26, 0);
  put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 0.05), S), 0, 2.2, 0.19);
  if (hood) {
    const cowl = put(rig, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.42), U), 0, 2.38, -0.08);
    cowl.scale.set(1, 0.72, 1);
  }
  if (spikes) {
    for (const side of [-1, 1]) {
      const sp = put(rig, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 4), P), side * 0.52 * b, 2.12, -0.02);
      sp.rotation.z = side * -0.9;
    }
    const spine = put(rig, new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 4), P), 0, 1.9, -0.32);
    spine.rotation.x = 1.05;
  }

  function leg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17 * b, 1.14, 0);
    rig.add(pivot);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.22 * b, 0.44, 0.24), P), 0, -0.24, 0);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.16 * b, 0.4, 0.18), U), 0, -0.64, 0);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.025), S), side * 0.1 * b, -0.62, 0.09);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.24 * b, 0.14, 0.36), P), 0, -0.9, 0.05);
    return pivot;
  }

  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5 * b, 1.86, 0);
    rig.add(pivot);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.16), P), 0, -0.22, 0);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.14), U), 0, -0.58, 0);
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.3, 0.025), S), 0, -0.52, 0.08);
    const hand = new THREE.Group();
    hand.position.set(side * 0.02, -0.82, 0.06);
    pivot.add(hand);
    pivot.userData.hand = hand;
    return pivot;
  }

  const legL = leg(-1);
  const legR = leg(1);
  const armL = arm(-1);
  const armR = arm(1);
  group.userData.pose = {
    legL, legR, armL, armR,
    handL: armL.userData.hand,
    handR: armR.userData.hand,
    phase: 0,
  };
  return finish(group, rig);
}

export function finish(group, rig) {
  rig.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.add(rig);
  return group;
}

function fitGlb(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const s = 2.35 / Math.max(0.001, size.y);
  root.scale.setScalar(s);
  root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export async function withGlb(glbUrl, yaw, look, build, animate) {
  if (glbUrl) {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(glbUrl);
      const group = new THREE.Group();
      group.name = 'bw-class';
      const inner = gltf.scene;
      fitGlb(inner);
      if (yaw) inner.rotation.y = yaw;
      group.add(inner);
      return { group, animate, source: 'glb' };
    } catch (err) {
      console.warn('[raid] class GLB failed, using procedural', err);
    }
  }
  return { group: build(look), animate, source: 'procedural' };
}

export function animateRig(group, dt, motion) {
  const pose = group.userData.pose;
  if (!pose) return;
  const speed = motion?.speed || 0;
  const attack = motion?.attack || '';
  const t = motion?.attackT || 0;
  pose.phase = (pose.phase || 0) + dt * (2.2 + speed * 0.85);
  const swing = speed > 0.4 ? Math.sin(pose.phase) : Math.sin(pose.phase * 0.5) * 0.12;
  const amp = speed > 0.4 ? 0.55 : 0.08;
  if (pose.legL) {
    pose.legL.rotation.x = swing * amp;
    pose.legR.rotation.x = -swing * amp;
  }
  if (pose.armL) {
    pose.armL.rotation.set(-swing * amp * 0.55, 0, 0.18);
    pose.armR.rotation.set(swing * amp * 0.4, 0, -0.18);
  }
  if (pose.cape) pose.cape.rotation.x = 0.08 + Math.sin(pose.phase * 0.7) * 0.06;
  if (pose.rings) {
    pose.rings.forEach((r, i) => {
      r.rotation.y += dt * (0.7 + i * 0.35);
      r.rotation.x = Math.sin(pose.phase * 0.8 + i) * 0.2;
    });
  }
  if (pose.smoke) {
    pose.smoke.children.forEach((c, i) => {
      c.position.z = -0.2 - i * 0.18;
      c.position.y = 1.2 + Math.sin(pose.phase * 3 + i) * 0.08;
      if (c.material) c.material.opacity = 0.18 + (i % 2) * 0.08;
    });
  }
  const k = Math.sin(Math.min(1, t / 0.34) * Math.PI);
  if (attack === 'shard' || attack === 'nova' || attack === 'freeze' || attack === 'blizzard' || attack === 'smite' || attack === 'holy') {
    pose.armR.rotation.x = -1.15 * k;
  } else if (attack === 'shot' || attack === 'volley' || attack === 'rain') {
    pose.armL.rotation.x = -0.9 * k;
    pose.armR.rotation.x = -1.2 * k;
  } else if (attack === 'daggers' || attack === 'tape') {
    pose.armL.rotation.x = -0.8 * k;
    pose.armR.rotation.x = -1.1 * k;
  } else if (attack === 'shadow') {
    pose.armR.rotation.x = -0.6;
    group.rotation.x = 0.25 * Math.min(1, t / 0.28);
  } else if (attack === 'stealth') {
    group.position.y = Math.sin(t * 18) * 0.03;
  } else if (attack === 'heal' || attack === 'bless' || attack === 'circle') {
    pose.armR.rotation.x = -0.4 * k;
    pose.armL.rotation.x = -0.4 * k;
    pose.armL.rotation.z = 0.6 * k;
    pose.armR.rotation.z = -0.6 * k;
  } else {
    group.rotation.x = 0;
    group.position.y = 0;
  }
}

export function ghostOf(group, color = '#9fd6ff') {
  const ghost = group.clone(true);
  ghost.name = 'past-life';
  ghost.traverse((o) => {
    if (o.isMesh) {
      o.material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return ghost;
}

export function setGhostOpacity(ghost, opacity) {
  ghost.traverse((o) => {
    if (o.isMesh && o.material) o.material.opacity = opacity;
  });
}
