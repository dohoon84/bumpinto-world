import * as THREE from 'three';

const V3 = '/dungeon/vfx/v3';
const texCache = new Map();
function tex(url) {
  if (!texCache.has(url)) {
    const map = new THREE.TextureLoader().load(`${url}?v=v3`);
    map.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, map);
  }
  return texCache.get(url);
}
function matOf(url, color, blend) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex(url),
    color,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  return mat;
}
function decal(url, x, z, w, h, color, blend = 'normal') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h || w), matOf(url, color, blend));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.06, z);
  m.renderOrder = 3;
  m.userData.op = blend === 'add' ? 0.9 : 0.92;
  return m;
}
function upright(url, x, y, z, w, h, yaw, color, blend = 'normal') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matOf(url, color, blend));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  m.renderOrder = 4;
  m.userData.op = blend === 'add' ? 0.95 : 0.94;
  return m;
}
function crossed(url, x, y, z, w, h, color, blend = 'normal') {
  return [0, Math.PI / 2].map((yaw) => upright(url, x, y, z, w, h, yaw, color, blend));
}
function facing(url, x, y, z, w, h, color, blend = 'normal', roll = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matOf(url, color, blend));
  m.position.set(x, y, z);
  m.renderOrder = 5;
  m.userData.face = true;
  m.userData.roll = roll;
  m.userData.op = blend === 'add' ? 0.95 : 0.96;
  return m;
}
function spark(url, x, y, z, w, h, color) {
  const mat = new THREE.SpriteMaterial({
    map: tex(url),
    color,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.set(w, h || w, 1);
  s.userData.op = 1;
  return s;
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
    pillar(x, z) {
      crossed(`${V3}/contrast/pillar_dark.png`, x, 3.8, z, 2.0, 8.0, '#3A2A10').forEach((m) => add(m, 1.2, 0));
      crossed(`${V3}/magic/heal_pillar.png`, x, 3.8, z, 2.2, 7.6, '#FFC845').forEach((m) => add(m, 1.2, 0));
      add(facing(`${V3}/magic/heal_pillar.png`, x, 3.8, z, 2.2, 7.6, '#FFC845'), 1.2, 0);
      add(spark(`${V3}/particles/soft_glow.png`, x, 0.4, z, 0.6, 0.6, '#FFE7A0'), 0.8, 0);
      add(facing(`${V3}/rings/halo.png`, x, 7.2, z, 2.4, 2.4, '#FFC845', 'add'), 0.9, 0);
    },
    shield(x, z) {
      add(facing(`${V3}/magic/shield_bubble.png`, x, 1.8, z, 4.6, 4.6, '#FFC845'), 1.2, 0);
      add(facing(`${V3}/magic/shield_hex.png`, x, 1.8, z, 4.5, 4.5, '#FFC845'), 1.2, 0);
    },
    holyBurst(x, z) {
      add(decal(`${V3}/contrast/halo_dark.png`, x, z, 7.6, 7.6, '#3A2A10'), 0.45, 0);
      add(facing(`${V3}/rings/halo_shockwave.png`, x, 1.6, z, 6.6, 6.6, '#FFC845'), 0.4, 0);
      add(spark(`${V3}/particles/flash.png`, x, 1.4, z, 0.7, 0.7, '#FFE7A0'), 0.25, 0);
    },
    multi(x, z, yaw) {
      for (let i = -2; i <= 2; i++) {
        const s = facing(`${V3}/trails/arrow_trail.png`, x + Math.sin(yaw + i * 0.08) * 2.2, 1.6, z + Math.cos(yaw + i * 0.08) * 2.2, 5.2, 0.42, '#3DDC84', 'add');
        add(s, 0.35, 0);
      }
    },
    pierce(x, z, yaw) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      add(facing(`${V3}/trails/beam_core.png`, x + fx * 3, 1.5, z + fz * 3, 8.0, 0.18, '#FFFFFF', 'add'), 0.3, 0);
      add(facing(`${V3}/trails/arrow_trail.png`, x + fx * 3, 1.5, z + fz * 3, 8.2, 0.5, '#3DDC84', 'add'), 0.35, 0);
    },
    arrowRain(x, z) {
      add(decal(`${V3}/decals/tele_circle.png`, x, z, 8.8, 8.8, '#143028'), 1.0, 0);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = 1.2 + (i % 4) * 0.7;
        const s = upright(`${V3}/trails/arrow_streak_bold.png`, x + Math.cos(a) * r, 2.2 + (i % 3) * 0.8, z + Math.sin(a) * r, 0.5, 3.6, a, '#3DDC84');
        add(s, 0.7, 0);
      }
    },
    blink(x, z, yaw) {
      add(facing(`${V3}/particles/blink_burst.png`, x, 1.2, z, 3.2, 3.2, '#FF3D8A'), 0.3, 0);
      add(facing(`${V3}/particles/blink_burst.png`, x + Math.sin(yaw) * 2.4, 1.2, z + Math.cos(yaw) * 2.4, 3.4, 3.4, '#FF3D8A'), 0.3, 0);
      add(spark(`${V3}/particles/flash.png`, x, 1.2, z, 0.6, 0.6, '#FFE7A0'), 0.2, 0);
    },
    combo(x, z, yaw) {
      const rolls = [-0.9, 0.15, 0.85];
      const sizes = [7.0, 6.6, 7.2];
      rolls.forEach((roll, i) => {
        const tex = i === 2 ? `${V3}/slashes/crescent_bold_thin.png` : `${V3}/slashes/crescent_bold.png`;
        const blend = i === 2 ? 'add' : 'normal';
        add(facing(tex, x, 1.5, z, sizes[i], sizes[i], '#FF3D8A', blend, roll), 0.45, 0);
        add(upright(tex, x, 1.5, z, sizes[i] * 0.85, sizes[i] * 0.85, yaw + roll, '#FF3D8A', blend), 0.45, 0);
      });
      add(spark(`${V3}/particles/flash.png`, x, 1.4, z, 0.7, 0.7, '#FFE7A0'), 0.25, 0);
    },
    poison(x, z) {
      add(facing(`${V3}/flipbooks/poison_cloud_8x8.png`, x, 1.4, z, 5.6, 5.6, '#C6F25A'), 1.2, 0);
      add(decal(`${V3}/flipbooks/poison_cloud_8x8.png`, x, z, 5.6, 5.6, '#8C7FFF'), 1.2, 0);
    },
    classLook(id, x, z, yaw) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      if (id === 'warrior') this.slam(x + fx * 2.2, z + fz * 2.2);
      else if (id === 'mage') this.fireball(x, 1.4, z, yaw);
      else if (id === 'priest') this.pillar(x, z);
      else if (id === 'archer') this.arrowRain(x + fx * 3.2, z + fz * 3.2);
      else if (id === 'assassin') this.combo(x + fx * 1.4, z + fz * 1.4, yaw);
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
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      add(decal(`${V3}/contrast/trail_dark.png`, x + fx * 2.2, z + fz * 2.2, 6.0, 1.6, '#140C08'), 0.5, 0);
      add(facing(`${V3}/trails/dash_trail.png`, x + fx * 2.4, 1.15, z + fz * 2.4, 5.8, 1.4, '#FF8A12', 'add'), 0.5, 0);
      add(spark(`${V3}/particles/soft_glow.png`, x + fx * 2.6, 1.2, z + fz * 2.6, 0.55, 0.55, '#FFE7A0'), 0.35, 0);
    },
    slam(x, z) {
      add(decal(`${V3}/contrast/ring_dark.png`, x, z, 9.5, 9.5, '#140C08'), 0.9, 0);
      add(decal(`${V3}/rings/shockwave_ring.png`, x, z, 9.0, 9.0, '#FFB000'), 0.8, 0);
      add(decal(`${V3}/decals/ground_crack.png`, x, z, 9.2, 9.2, '#E8C090'), 1.1, 0);
      crossed(`${V3}/particles/strike_flash.png`, x, 1.5, z, 1.2, 2.6, '#FFE7A0', 'add').forEach((m) => add(m, 0.28, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(spark(`${V3}/particles/debris_chunk.png`, x + Math.cos(a) * 2.4, 0.6, z + Math.sin(a) * 2.4, 0.45, 0.45, '#E8C090'), 0.6, 0);
      }
    },
    whirl(x, z) {
      add(decal(`${V3}/contrast/spin_dark.png`, x, z, 8.4, 8.4, '#140C08'), 0.8, 0);
      const ring = decal(`${V3}/slashes/spin_blade_ring.png`, x, z, 8.0, 8.0, '#FFB000');
      add(ring, 0.8, 1.4);
      add(facing(`${V3}/slashes/crescent_bold.png`, x, 1.3, z, 6.2, 6.2, '#FF8A12', 'add', 0.4), 0.4, 0);
      add(facing(`${V3}/slashes/crescent_bold.png`, x, 1.5, z, 6.2, 6.2, '#FF8A12', 'add', -0.6), 0.4, 0);
    },
    fireball(x, y, z, yaw) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const bx = x + fx * 3;
      const bz = z + fz * 3;
      add(facing(`${V3}/particles/comet_head_mage.png`, x + fx * 1.2, y + 0.4, z + fz * 1.2, 1.15, 1.15, '#FFFFFF'), 0.7, 0);
      add(facing(`${V3}/trails/comet_trail_mage.png`, x + fx * 0.4, y + 0.35, z + fz * 0.4, 3.6, 0.9, '#FFFFFF'), 0.6, 0);
      add(decal(`${V3}/contrast/burst_mage_dark.png`, bx, bz, 7.4, 7.4, '#100818'), 0.8, 0);
      add(decal(`${V3}/particles/fire_burst_mage.png`, bx, bz, 6.6, 6.6, '#FFFFFF'), 0.85, 0);
      crossed(`${V3}/particles/fire_burst_mage.png`, bx, 2.2, bz, 6.6, 6.6, '#FFFFFF').forEach((m) => add(m, 0.85, 0));
      add(facing(`${V3}/particles/fire_burst_mage.png`, bx, 2.4, bz, 6.6, 6.6, '#FFFFFF'), 0.85, 0);
      add(spark(`${V3}/particles/soft_glow.png`, bx, 2.2, bz, 0.7, 0.7, '#FFE7A0'), 0.3, 0);
      add(decal(`${V3}/particles/smoke_ring.png`, bx, bz, 8.0, 8.0, '#FFFFFF'), 0.9, 0);
    },
    frost(x, z) {
      add(decal(`${V3}/contrast/frost_dark.png`, x, z, 8.0, 8.0, '#102028'), 0.8, 0);
      add(decal(`${V3}/rings/frost_ring.png`, x, z, 7.4, 7.4, '#8FD8FF'), 0.85, 0);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const shard = upright(`${V3}/particles/ice_shard_a.png`, x + Math.cos(a) * 2.4, 1.1, z + Math.sin(a) * 2.4, 0.55, 0.9, a, '#8FD8FF');
        add(shard, 0.6, 0);
      }
    },
    bolt(x, z, yaw) {
      crossed(`${V3}/contrast/bolt_dark.png`, x, 3.8, z, 2.0, 8.0, '#1A1030').forEach((m) => add(m, 0.35, 0));
      crossed(`${V3}/trails/lightning_thick.png`, x, 3.8, z, 1.8, 7.6, '#C8B8FF', 'add').forEach((m) => add(m, 0.32, 0));
      add(upright(`${V3}/trails/lightning_branch.png`, x, 3.2, z, 3.2, 5.2, yaw + 0.6, '#C8B8FF', 'add'), 0.3, 0);
      add(decal(`${V3}/particles/ground_splash.png`, x, z, 5.4, 5.4, '#FFFFFF'), 0.4, 0);
      add(spark(`${V3}/particles/flash.png`, x, 1.2, z, 0.7, 0.7, '#FFFFFF'), 0.2, 0);
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
    update(dt, camera) {
      for (let i = live.length - 1; i >= 0; i--) {
        const m = live[i];
        m.userData.life -= dt;
        const k = Math.max(0, m.userData.life / m.userData.max);
        if (m.material) m.material.opacity = (m.userData.op ?? 0.92) * Math.min(1, k + 0.15);
        if (m.userData.face && camera) {
          m.lookAt(camera.position);
          if (m.userData.roll) m.rotateZ(m.userData.roll);
        }
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
