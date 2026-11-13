import * as THREE from 'three';

const texCache = new Map();
function tex(url) {
  if (!texCache.has(url)) {
    const map = new THREE.TextureLoader().load(`${url}?v=v41fx`);
    map.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, map);
  }
  return texCache.get(url);
}
function cellMap(url, frame = 5, cols = 4) {
  const map = tex(url).clone();
  map.repeat.set(1 / cols, 1 / cols);
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  map.offset.set(col / cols, 1 - (row + 1) / cols);
  map.needsUpdate = true;
  return map;
}
function billboard(rootAdd, url, x, y, z, w, h, color = '#ffffff', map) {
  const mat = new THREE.SpriteMaterial({
    map: map || tex(url),
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.set(w, h || w, 1);
  s.userData.life = 1.1;
  s.userData.max = 1.1;
  return s;
}
function groundDecal(url, x, z, size, color = '#ffffff') {
  const mat = new THREE.MeshBasicMaterial({
    map: tex(url),
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.12, z);
  m.renderOrder = 3;
  return m;
}

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
      const col = billboard(null, '/dungeon/vfx/magic/heal_pillar.png', x, 3.4, z, 2.2, 7.2, color);
      add(col, 1.1, 0);
      const halo = billboard(null, '/dungeon/vfx/rings/halo.png', x, 3.2, z, 1.3, 1.3, '#FFFBE8');
      add(halo, 0.8, 0);
    },
    shield(x, z) {
      const dome = billboard(null, '/dungeon/vfx/magic/shield_bubble.png', x, 1.6, z, 4.2, 4.2, '#FFC845');
      add(dome, 1.2, 0);
    },
    holyBurst(x, z) {
      const burst = billboard(null, '/dungeon/vfx/rings/halo_burst.png', x, 2.2, z, 6, 6, '#FFC845');
      add(burst, 0.45, 0);
    },
    multi(x, z, yaw) {
      for (let i = -2; i <= 2; i++) {
        const s = billboard(null, '/dungeon/vfx/trails/arrow_trail.png', x + Math.sin(yaw + i * 0.1) * 2.4, 2.2 + Math.abs(i) * 0.3, z + Math.cos(yaw + i * 0.1) * 2.4, 3.2, 0.55, '#3DDC84');
        s.material.rotation = -(yaw + i * 0.12);
        add(s, 0.28, 0);
      }
    },
    pierce(x, z, yaw) {
      const s = billboard(null, '/dungeon/vfx/trails/arrow_trail.png', x + Math.sin(yaw) * 2.4, 1.45, z + Math.cos(yaw) * 2.4, 3.4, 0.35, '#E8FFE8');
      s.material.rotation = -yaw;
      add(s, 0.3, 0);
      add(groundDecal('/dungeon/vfx/particles/impact_ring.png', x + Math.sin(yaw) * 3, z + Math.cos(yaw) * 3, 1.2, '#3DDC84'), 0.25, 0);
    },
    arrowRain(x, z) {
      for (let i = 0; i < 6; i++) {
        const s = billboard(null, '/dungeon/vfx/trails/arrow_trail.png', x + (i % 3) * 1.4 - 1.4, 4 + (i % 2) * 1.2, z + Math.floor(i / 3) * 1.2, 0.45, 2.6, '#7DFFB0');
        add(s, 0.4, 0);
      }
    },
    blink(x, z, yaw) {
      const a = billboard(null, '/dungeon/vfx/particles/flash.png', x, 1.1, z, 1.2, 1.2, '#FF5C9A');
      const b = billboard(null, '/dungeon/vfx/particles/flash.png', x + Math.sin(yaw) * 2.2, 1.1, z + Math.cos(yaw) * 2.2, 1.2, 1.2, '#FF3B4E');
      add(a, 0.25, 0);
      add(b, 0.25, 0);
    },
    combo(x, z, yaw) {
      for (let i = 0; i < 3; i++) {
        const s = billboard(null, '/dungeon/vfx/slashes/slash_crescent.png', x, 1.4 + i * 0.3, z, 3.6, 3.6, '#FF3B4E');
        s.material.rotation = yaw + i * 0.8;
        add(s, 0.28, 0);
      }
    },
    poison(x, z) {
      for (let i = 0; i < 5; i++) {
        const s = billboard(null, '/dungeon/vfx/particles/poison_drip.png', x + (i - 2) * 0.35, 0.6 + (i % 2) * 0.4, z, 0.45, 0.7, '#80E040');
        add(s, 0.7, 0);
      }
    },
    classLook(id, x, z, yaw) {
      if (id === 'warrior') this.slam(x + Math.sin(yaw) * 3, z + Math.cos(yaw) * 3);
      else if (id === 'mage') this.fireball(x, 1.8, z, yaw);
      else if (id === 'priest') this.pillar(x, z);
      else if (id === 'archer') this.arrowRain(x + Math.sin(yaw) * 3, z + Math.cos(yaw) * 3);
      else if (id === 'assassin') { this.combo(x, z, yaw); this.blink(x, z, yaw); }
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
      const s = billboard(null, '/dungeon/vfx/trails/dash_trail.png', x + Math.sin(yaw) * 1.2, 1.1, z + Math.cos(yaw) * 1.2, 2.4, 0.7, '#FF7A1A');
      s.material.rotation = -yaw;
      add(s, 0.45, 0);
      add(groundDecal('/dungeon/vfx/rings/shockwave_ring.png', x, z, 2.2, '#FF7A1A'), 0.4, 0);
    },
    slam(x, z) {
      add(groundDecal('/dungeon/vfx/rings/shockwave_ring.png', x, z, 14, '#FF7A1A'), 0.7, 0);
      add(groundDecal('/dungeon/vfx/decals/ground_crack.png', x, z, 10, '#FF6A1A'), 1.1, 0);
      add(billboard(null, '/dungeon/vfx/particles/strike_flash.png', x, 3.2, z, 3.2, 6.5, '#FFF3C4'), 0.35, 0);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const d = billboard(null, '/dungeon/vfx/particles/dust.png', x + Math.cos(a) * 2, 1.2, z + Math.sin(a) * 2, 1.6, 1.6, '#E8D2B0');
        d.userData.vx = Math.cos(a) * 4;
        d.userData.vz = Math.sin(a) * 4;
        d.userData.vy = 2;
        add(d, 0.6, 0);
      }
    },
    whirl(x, z) {
      add(groundDecal('/dungeon/vfx/slashes/spin_slash_ring.png', x, z, 8, '#FF7A1A'), 0.7, 2);
      add(billboard(null, '/dungeon/vfx/slashes/slash_crescent.png', x, 1.6, z, 5, 5, '#FF7A1A'), 0.4, 0);
    },
    fireball(x, y, z, yaw) {
      add(billboard(null, '/dungeon/vfx/particles/fireball_orb.png', x + Math.sin(yaw) * 2, y + 1.2, z + Math.cos(yaw) * 2, 2.2, 2.2), 0.8, 0);
      for (let i = 1; i <= 4; i++) {
        add(billboard(null, '/dungeon/vfx/particles/ember.png', x + Math.sin(yaw) * i * 0.7, y + 1.1, z + Math.cos(yaw) * i * 0.7, 0.7, 0.7, '#FFB347'), 0.45, 0);
      }
      add(groundDecal('/dungeon/vfx/rings/rune_circle.png', x, z, 3.2, '#8C7FFF'), 0.45, 1);
      const boom = billboard(null, '/dungeon/vfx/flipbooks/explosion_4x4.png', x + Math.sin(yaw) * 5, y + 2.2, z + Math.cos(yaw) * 5, 8, 8, '#ffffff', cellMap('/dungeon/vfx/flipbooks/explosion_4x4.png', 6));
      add(boom, 0.8, 0);
      add(billboard(null, '/dungeon/vfx/particles/soft_glow.png', x + Math.sin(yaw) * 5, y + 2, z + Math.cos(yaw) * 5, 6, 6, '#FF7A1A'), 0.5, 0);
    },
    frost(x, z) {
      add(groundDecal('/dungeon/vfx/rings/frost_ring.png', x, z, 9, '#8FD8FF'), 0.8, 0);
      add(groundDecal('/dungeon/vfx/rings/rune_circle.png', x, z, 4.5, '#8C7FFF'), 0.55, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(billboard(null, '/dungeon/vfx/particles/strike_flash.png', x + Math.cos(a) * 2.2, 1.4, z + Math.sin(a) * 2.2, 0.5, 1.4, '#8FD8FF'), 0.45, 0);
      }
    },
    bolt(x, z, yaw) {
      add(billboard(null, '/dungeon/vfx/trails/lightning_bolt.png', x + Math.sin(yaw) * 2, 4.2, z + Math.cos(yaw) * 2, 2.2, 8, '#F4F0FF'), 0.35, 0);
      add(billboard(null, '/dungeon/vfx/particles/strike_flash.png', x + Math.sin(yaw) * 2.4, 1.5, z + Math.cos(yaw) * 2.4, 3.4, 4.5, '#FFFFFF'), 0.28, 0);
      add(billboard(null, '/dungeon/vfx/particles/soft_glow.png', x + Math.sin(yaw) * 2, 3, z + Math.cos(yaw) * 2, 4, 6, '#8C7FFF'), 0.3, 0);
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
