import * as THREE from 'three';

function fadeMat(color) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createVfx(scene) {
  const root = new THREE.Group();
  root.name = 'raid-vfx';
  scene.add(root);
  const live = [];

  function add(mesh, life, spin) {
    mesh.userData.life = life;
    mesh.userData.max = life;
    mesh.userData.spin = spin || 0;
    root.add(mesh);
    live.push(mesh);
  }

  return {
    root,
    slash(x, y, z, yaw, color = '#ffe7a0') {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 18, Math.PI * 0.85), fadeMat(color));
      arc.position.set(x, y, z);
      arc.rotation.y = yaw;
      arc.rotation.z = -0.4;
      arc.rotation.x = Math.PI / 2.4;
      add(arc, 0.14, 0);
    },
    arrow(x, y, z, yaw, color = '#ffe7a0') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.72), fadeMat(color));
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      m.userData.vx = Math.sin(yaw) * 22;
      m.userData.vz = Math.cos(yaw) * 22;
      add(m, 0.18, 0);
    },
    carapaceBurst(pos, color = '#ff6a22') {
      for (let i = 0; i < 16; i++) {
        const dark = i % 3 !== 0;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.16 + (i % 3) * 0.04, 0.06, 0.2),
          new THREE.MeshBasicMaterial({ color: dark ? '#1a1e24' : color, transparent: true, depthWrite: false }),
        );
        m.position.set(pos.x, 1.05 + Math.random() * 0.4, pos.z);
        const a = (i / 16) * Math.PI * 2;
        m.userData.vx = Math.cos(a) * (2.2 + (i % 4));
        m.userData.vz = Math.sin(a) * (2.2 + (i % 4));
        m.userData.vy = 1.4 + (i % 5) * 0.35;
        add(m, 0.75, 0);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 6, 20), fadeMat(color));
      ring.position.set(pos.x, 1.2, pos.z);
      ring.rotation.x = Math.PI / 2;
      ring.userData.grow = 3.2;
      add(ring, 0.45, 0);
    },
    tape(pos) {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.12), fadeMat('#ffe14a'));
        m.position.set(pos.x, 3.2 + i * 1.1, pos.z);
        m.rotation.y = i * 0.6;
        add(m, 0.7, 0);
      }
    },
    ring(x, y, z, color, radius) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08, 6, 24), fadeMat(color));
      m.position.set(x, y, z);
      m.rotation.x = Math.PI / 2;
      add(m, 0.45, 0);
      m.userData.grow = 1.6;
    },
    burst(x, y, z, color) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), fadeMat(color));
      m.position.set(x, y, z);
      add(m, 0.28, 0);
      m.userData.grow = 4;
    },
    windStreak(x, z, yaw) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(14, 0.22, 0.9), fadeMat('#ffb070'));
      m.position.set(x, 1.1, z);
      m.rotation.y = yaw;
      add(m, 0.55, 0);
      m.userData.drift = 10;
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const m = live[i];
        m.userData.life -= dt;
        const k = Math.max(0, m.userData.life / m.userData.max);
        m.material.opacity = 0.85 * k;
        if (m.userData.grow) {
          const s = 1 + (1 - k) * m.userData.grow;
          m.scale.setScalar(s);
        }
        if (m.userData.drift) m.position.z += Math.cos(m.rotation.y) * m.userData.drift * dt;
        if (m.userData.vx) {
          m.position.x += m.userData.vx * dt;
          m.position.z += m.userData.vz * dt;
        }
        if (m.userData.vy) {
          m.position.y += m.userData.vy * dt;
          m.userData.vy -= dt * 4;
        }
        if (m.userData.life <= 0) {
          root.remove(m);
          m.geometry.dispose();
          m.material.dispose();
          live.splice(i, 1);
        }
      }
    },
  };
}
