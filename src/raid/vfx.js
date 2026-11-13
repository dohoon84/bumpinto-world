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
    if (live.length > 96) {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
      return;
    }
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
      m.userData.grow = 7;
    },
    sparks(x, y, z, color, n = 6) {
      const count = Math.min(n, 10);
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), fadeMat(color));
        m.position.set(x, y, z);
        const a = (i / count) * Math.PI * 2;
        m.userData.vx = Math.cos(a) * (1.5 + (i % 3));
        m.userData.vz = Math.sin(a) * (1.5 + (i % 3));
        m.userData.vy = 1.2 + (i % 4) * 0.4;
        add(m, 0.28, 0);
      }
    },
    shockwave(x, z, color = '#ff7a1a') {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 6, 24), fadeMat(color));
      m.position.set(x, 0.2, z);
      m.rotation.x = Math.PI / 2;
      m.userData.grow = 4.5;
      add(m, 0.32, 0);
    },
    rune(x, z, color = '#8C7FFF') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.15, 28), fadeMat(color));
      ring.position.set(x, 0.16, z);
      ring.rotation.x = -Math.PI / 2;
      ring.userData.grow = 1.4;
      add(ring, 0.4, 2);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.45, 6), fadeMat('#ffffff'));
      inner.position.set(x, 0.18, z);
      inner.rotation.x = -Math.PI / 2;
      inner.userData.grow = 2;
      add(inner, 0.25, 0);
    },
    pillar(x, z, color = '#FFC845') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 3.2, 8, 1, true), fadeMat(color));
      m.position.set(x, 1.6, z);
      m.userData.grow = 0.4;
      add(m, 0.45, 0);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 20), fadeMat('#fff6c8'));
      halo.position.set(x, 2.6, z);
      halo.rotation.x = Math.PI / 2;
      halo.userData.grow = 1.8;
      add(halo, 0.4, 0);
    },
    trail(x, y, z, yaw, color) {
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), fadeMat(color));
        m.position.set(x - Math.sin(yaw) * i * 0.28, y, z - Math.cos(yaw) * i * 0.28);
        add(m, 0.16 + i * 0.02, 0);
      }
    },
    streak(x, z, yaw, color = '#FF5C9A') {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), fadeMat(color));
        m.position.set(x - Math.sin(yaw) * i * 0.35, 1.1 + i * 0.05, z - Math.cos(yaw) * i * 0.35);
        m.rotation.y = yaw;
        add(m, 0.22, 0);
      }
    },
    charge(x, z, yaw) {
      this.streak(x, z, yaw, '#ffd2a8');
      const flash = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), fadeMat('#fff1d2'));
      flash.position.set(x, 1.2, z);
      flash.lookAt(x + Math.sin(yaw), 1.2, z + Math.cos(yaw));
      add(flash, 0.16, 0);
      flash.userData.grow = 2;
    },
    slam(x, z) {
      this.shockwave(x, z, '#ffe7a0');
      this.shockwave(x, z, '#ff7a1a');
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), fadeMat(i % 2 ? '#8a5a32' : '#ffe1b0'));
        m.position.set(x, 0.2, z);
        const a = (i / 8) * Math.PI * 2;
        m.userData.vx = Math.cos(a) * 3.2;
        m.userData.vz = Math.sin(a) * 3.2;
        m.userData.vy = 2.4;
        add(m, 0.45, 0);
      }
      const crack = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.2, 6), fadeMat('#ffb089'));
      crack.rotation.x = -Math.PI / 2;
      crack.position.set(x, 0.08, z);
      add(crack, 0.7, 0);
    },
    whirl(x, z) {
      for (let i = 0; i < 3; i++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.1 + i * 0.45, 0.05, 6, 20), fadeMat(i === 1 ? '#fff6d8' : '#ffb15a'));
        arc.position.set(x, 0.9 + i * 0.25, z);
        arc.rotation.x = Math.PI / 2;
        add(arc, 0.34, 6 + i);
      }
    },
    fireball(x, y, z, yaw) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), fadeMat('#ff7a1a'));
      m.position.set(x, y, z);
      m.userData.vx = Math.sin(yaw) * 16;
      m.userData.vz = Math.cos(yaw) * 16;
      add(m, 0.32, 0);
      this.burst(x + Math.sin(yaw) * 4, y, z + Math.cos(yaw) * 4, '#ffb15a');
    },
    frost(x, z) {
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), fadeMat('#d7f6ff'));
        const a = (i / 7) * Math.PI * 2;
        m.position.set(x + Math.cos(a) * 1.1, 0.35, z + Math.sin(a) * 1.1);
        m.rotation.z = a;
        add(m, 0.4, 0);
      }
      this.rune(x, z, '#9fd6ff');
    },
    bolt(x, z, yaw) {
      let px = x;
      let pz = z;
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), fadeMat('#f4fbff'));
        const j = (i % 2 ? 0.35 : -0.35);
        m.position.set(px + Math.cos(yaw) * j, 1.6, pz);
        m.rotation.y = yaw + j;
        add(m, 0.16, 0);
        px += Math.sin(yaw) * 1.1;
        pz += Math.cos(yaw) * 1.1;
      }
    },
    shield(x, z) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), fadeMat('#ffe7a0'));
      dome.position.set(x, 0.05, z);
      add(dome, 0.7, 0);
    },
    holyBurst(x, z) {
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), fadeMat('#fff6c8'));
        const a = (i / 8) * Math.PI * 2;
        m.position.set(x + Math.cos(a) * 0.8, 1.2, z + Math.sin(a) * 0.8);
        add(m, 0.28, 0);
      }
      this.burst(x, 1.6, z, '#fff1b8');
    },
    multi(x, z, yaw) {
      for (let i = -2; i <= 2; i++) this.arrow(x, 1.5, z, yaw + i * 0.12, '#b8ffd8');
    },
    pierce(x, z, yaw) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 6), fadeMat('#f4fff8'));
      m.position.set(x + Math.sin(yaw) * 3, 1.45, z + Math.cos(yaw) * 3);
      m.rotation.y = yaw;
      add(m, 0.2, 0);
    },
    arrowRain(x, z) {
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), fadeMat('#fff1b8'));
        m.position.set(x + (i % 4) - 1.5, 3.2 + (i % 3) * 0.4, z + Math.floor(i / 4) - 0.5);
        m.userData.vy = -6;
        add(m, 0.35, 0);
      }
    },
    blink(x, z, yaw) {
      this.streak(x, z, yaw, '#c9b6ff');
      this.burst(x, 1, z, '#9aa6b2');
      this.burst(x + Math.sin(yaw) * 3, 1, z + Math.cos(yaw) * 3, '#6a5a88');
    },
    combo(x, z, yaw) {
      this.slash(x, 1.3, z, yaw, '#fff');
      this.slash(x, 1.1, z, yaw + 1.2, '#ff5c9a');
      this.slash(x, 1.5, z, yaw - 0.8, '#ffd0e4');
    },
    poison(x, z) {
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), fadeMat('#7dff6a'));
        const a = (i / 8) * Math.PI * 2;
        m.position.set(x + Math.cos(a) * 0.4, 0.4, z + Math.sin(a) * 0.4);
        m.userData.vy = 1.1 + (i % 3) * 0.3;
        add(m, 0.55, 0);
      }
    },
    portal(x, z) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 6, 18), fadeMat('#c45cff'));
      ring.position.set(x, 0.2, z);
      ring.rotation.x = Math.PI / 2;
      add(ring, 0.8, 2);
      this.pillar(x, z, '#9b5cff');
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
