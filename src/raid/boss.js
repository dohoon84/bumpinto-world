import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bossPoint, PATH_YAW, fromFrame, inSafe, toFrame, BOSS_ALONG } from './layout.js';

export const BOSS_HP = 10800;

function crackTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ff7a2a';
  g.lineWidth = 3;
  g.lineCap = 'round';
  function vein(x, y, len, ang, depth) {
    if (depth > 5 || len < 8) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    g.strokeStyle = depth % 2 ? '#ffb15a' : '#ff5a12';
    g.lineWidth = Math.max(1, 4 - depth);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    vein(x2, y2, len * 0.62, ang + 0.6, depth + 1);
    vein(x2, y2, len * 0.5, ang - 0.7, depth + 1);
  }
  vein(128, 128, 70, 0.2, 0);
  vein(40, 180, 50, -0.4, 0);
  vein(200, 60, 46, 1.2, 0);
  vein(90, 40, 40, 2.2, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function place(geo, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
  return g;
}

function buildSigil() {
  const g = new THREE.Group();
  g.name = 'sigil';
  const mat = new THREE.MeshBasicMaterial({ color: '#ffe14a', side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 8, 28), mat);
  g.add(ring);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.08), mat);
  g.add(bar);
  const chevL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.06), mat);
  chevL.position.set(-0.28, 0.32, 0);
  chevL.rotation.z = 0.7;
  const chevR = chevL.clone();
  chevR.position.x = 0.28;
  chevR.rotation.z = -0.7;
  const chevL2 = chevL.clone();
  chevL2.position.y = -0.32;
  chevL2.rotation.z = -0.7;
  const chevR2 = chevR.clone();
  chevR2.position.y = -0.32;
  chevR2.rotation.z = 0.7;
  g.add(chevL, chevR, chevL2, chevR2);
  return g;
}

function buildBossMesh() {
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#c4c6c2',
    roughness: 0.86,
    metalness: 0.04,
    emissive: '#ff6a1a',
    emissiveMap: crackTex(),
    emissiveIntensity: 2.4,
  });
  const steel = new THREE.MeshStandardMaterial({ color: '#d5d8dc', metalness: 0.35, roughness: 0.48 });
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rocks = [];
  const chunks = [
    [0, 8.4, 0, 3.4, 2.4, 7.2, 0.05, 0, 0],
    [0, 9.6, 0.2, 2.6, 1.5, 5.4, 0.1, 0, 0],
    [0, 7.6, 4.6, 2.2, 1.8, 2.4, 0.2, 0, 0],
    [0, 8.2, 6.1, 1.6, 1.3, 1.5, 0.15, 0, 0],
    [0, 7.2, -4.2, 2.0, 1.6, 2.2, -0.2, 0, 0],
  ];
  for (const c of chunks) rocks.push(place(rockGeo, ...c));
  const body = new THREE.Mesh(mergeGeometries(rocks, false), rockMat);
  body.castShadow = true;
  body.receiveShadow = true;

  const girders = [];
  const ribs = [
    [0, 8.2, 1.2, 4.6, 0.22, 0.22, 0, 0, 0],
    [0, 7.4, 2.4, 0.22, 0.22, 6.4, 0, 0, 0],
    [-1.6, 8.8, 0, 0.2, 0.2, 5.2, 0, 0, 0],
    [1.6, 8.8, 0, 0.2, 0.2, 5.2, 0, 0, 0],
  ];
  for (const c of ribs) girders.push(place(box, ...c));
  const girderMesh = new THREE.Mesh(mergeGeometries(girders, false), steel);
  girderMesh.castShadow = true;

  const group = new THREE.Group();
  group.name = 'hold';
  group.add(body, girderMesh);

  function pier(side, z) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 2.35, 7.6, z);
    const column = new THREE.Mesh(new THREE.BoxGeometry(1.25, 7.2, 1.25), steel);
    column.position.y = -3.6;
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(0.85, 1.1, 0.85);
    rock.position.y = -2.4;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 2.3), steel);
    foot.position.set(0, -7.15, 0.35);
    pivot.add(column, rock, foot);
    pivot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(pivot);
    return pivot;
  }
  const armL = pier(-1, 2.6);
  const armR = pier(1, 2.6);
  const legL = pier(-1, -2.8);
  const legR = pier(1, -2.8);

  const sigil = buildSigil();
  sigil.position.set(0, 8.3, 3.4);
  group.add(sigil);

  const eyeMat = new THREE.MeshBasicMaterial({ color: '#9ff6ff' });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.12), eyeMat);
  eyeL.position.set(-0.42, 8.15, 6.7);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.42;
  group.add(eyeL, eyeR);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 24),
    new THREE.MeshBasicMaterial({ color: '#05060a', transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  rockGeo.dispose();
  box.dispose();
  return { group, armL, armR, legL, legR, rockMat, sigil };
}

const teleMap = new THREE.TextureLoader().load('/dungeon/vfx/decals/tele_circle.png');
teleMap.colorSpace = THREE.SRGBColorSpace;

function telegraphMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: teleMap },
      uFill: { value: 0.05 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uFill;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float ang = atan(p.x, -p.y);
        if (ang < 0.0) ang += 6.2831853;
        float a = ang / 6.2831853;
        vec4 tex = texture2D(uMap, vUv);
        float dist = length(p);
        float rim = smoothstep(0.72, 0.86, dist) * (1.0 - smoothstep(0.96, 1.02, dist));
        float inside = step(a, uFill) * (1.0 - smoothstep(0.86, 1.0, dist));
        float alpha = tex.a * (rim * 0.9 + inside * 0.28);
        if (alpha < 0.03) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

function circleMesh(radius) {
  const mat = telegraphMat('#ff6a1a');
  const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.06;
  fill.visible = false;
  fill.userData.r = radius;
  fill.userData.fill = fill;
  fill.renderOrder = 2;
  return fill;
}

function paintFill(mesh, k) {
  const fill = mesh.userData.fill;
  const mat = fill?.material;
  if (mat?.uniforms?.uFill) mat.uniforms.uFill.value = Math.max(0.02, Math.min(1, k));
}

function riftColumn() {
  const g = new THREE.Group();
  const mat = telegraphMat('#ff8a3a');
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.07;
  g.add(disc);
  g.userData.r = 1.7;
  g.userData.fill = disc;
  return g;
}

export function createBoss(scene) {
  const built = buildBossMesh();
  const home = bossPoint();
  built.group.position.set(home.x, 0, home.z);
  built.group.rotation.y = PATH_YAW + Math.PI;
  built.group.scale.setScalar(1.45);
  scene.add(built.group);
  for (let i = 0; i < 3; i++) {
    const mob = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 1.3), new THREE.MeshStandardMaterial({ color: '#c4b8ae', roughness: 0.8 }));
    body.position.y = 0.7;
    mob.add(body);
    for (const [sx, sz] of [[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.4], [0.3, -0.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), new THREE.MeshStandardMaterial({ color: '#8d847c' }));
      leg.position.set(sx, 0.28, sz);
      mob.add(leg);
    }
    const spot = fromFrame(BOSS_ALONG - 3, (i - 1) * 4.5);
    mob.position.set(spot.x, 0, spot.z);
    mob.rotation.y = PATH_YAW + Math.PI;
    scene.add(mob);
  }

  const light = new THREE.PointLight('#ff7a3a', 18, 26, 2);
  light.position.set(home.x, 8, home.z);
  scene.add(light);

  const slam = circleMesh(4.8);
  const winds = [0, 1, 2, 3].map(() => circleMesh(3.6));
  const columns = [0, 1].map((i) => {
    const col = riftColumn();
    const p = fromFrame(i === 0 ? 4 : 16, i === 0 ? -2.8 : 3.1);
    col.position.set(p.x, 0, p.z);
    col.visible = false;
    return col;
  });
  scene.add(slam, ...winds, ...columns);
  let vortexClock = 0;

  const state = {
    hp: BOSS_HP,
    hpMax: BOSS_HP,
    phase: 'wait',
    t: 0,
    castName: '',
    cast: 0,
    castMax: 0,
    dead: false,
    hitFlash: 0,
    slow: 0,
    vortexWait: 0,
    stage: 1,
    dress: true,
  };

  const windSpots = [
    fromFrame(16.6, 3.4),
    fromFrame(15.2, -3.6),
    fromFrame(21.5, 2.2),
    fromFrame(-1.5, 0),
  ];

  let slamHit = false;
  let windHit = false;
  let died = false;
  let chargeHit = false;
  let addClock = 0;
  const adds = [];
  const addMat = new THREE.MeshStandardMaterial({ color: '#3a2430', emissive: '#ff3355', emissiveIntensity: 0.8, roughness: 0.45 });
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 16),
    new THREE.MeshBasicMaterial({ color: '#ffe1a8', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
  );
  lane.rotation.x = -Math.PI / 2;
  lane.visible = false;
  scene.add(lane);
  const charge = { ax: home.x, az: home.z, bx: home.x, bz: home.z };

  function stageNow() {
    const ratio = state.hp / state.hpMax;
    return ratio <= 0.25 ? 3 : ratio <= 0.6 ? 2 : 1;
  }

  function spawnAdd(side) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 8), addMat);
    mesh.position.set(home.x + side * 2.2, 0.7, home.z + 1.4);
    mesh.castShadow = true;
    scene.add(mesh);
    adds.push({ mesh, wait: 0.4 });
  }

  function showCircle(mesh, x, z) {
    mesh.visible = true;
    mesh.position.set(x, 0.12, z);
    mesh.scale.setScalar(1);
    paintFill(mesh, 0.05);
  }

  function hideAll() {
    slam.visible = false;
    for (const w of winds) w.visible = false;
  }

  function update(dt, ctx) {
    const { fightOn, player, onPlayerHit, onWind, onSlam } = ctx;
    if (state.dead) {
      columns.forEach((c) => { c.visible = false; });
      lane.visible = false;
      adds.forEach((a) => { a.mesh.visible = false; });
      built.group.position.y = Math.max(-0.45, built.group.position.y - dt * 0.22);
      built.rockMat.emissiveIntensity = Math.max(0.1, built.rockMat.emissiveIntensity - dt * 0.8);
      light.intensity = Math.max(0, light.intensity - dt * 8);
      const sigilMat = built.sigil.children[0]?.material;
      if (sigilMat) {
        sigilMat.transparent = true;
        sigilMat.opacity = Math.max(0, sigilMat.opacity - dt * 0.8);
      }
      hideAll();
      return;
    }
    state.hitFlash = Math.max(0, state.hitFlash - dt * 3);
    built.rockMat.emissiveIntensity = 1.25 + state.hitFlash * 1.4 + Math.sin(performance.now() * 0.003) * 0.15;
    const sway = Math.sin(performance.now() * 0.0015) * 0.04;
    built.group.rotation.z = sway;
    built.armL.rotation.x = Math.sin(performance.now() * 0.001) * 0.08;
    built.armR.rotation.x = Math.sin(performance.now() * 0.001 + 1) * 0.08;

    if (!fightOn) {
      columns.forEach((c) => { c.visible = false; });
      state.phase = 'wait';
      return;
    }
    if (state.slow > 0) state.slow = Math.max(0, state.slow - dt);
    const nextStage = stageNow();
    if (nextStage !== state.stage) {
      state.stage = nextStage;
      ctx.onStage?.(nextStage);
    }
    const pace = state.stage === 3 ? 1.55 : state.stage === 2 ? 1.15 : 1;
    state.t += dt * (state.slow > 0 ? 0.5 : pace);

    if (state.phase === 'wait') {
      state.phase = 'idle';
      state.t = 0;
    } else if (state.phase === 'idle') {
      state.castName = '';
      state.cast = 0;
      state.castMax = 0;
      const gap = state.stage === 3 ? 2.1 : state.stage === 2 ? 2.8 : 4.2;
      if (state.t > gap) {
        const f = toFrame(player.x, player.z);
        const near = Math.abs(f.along - BOSS_ALONG) < 16 && Math.abs(f.across) < 10;
        const roll = Math.random();
        let next = 'wind';
        if (state.stage === 1) next = near ? 'slam' : 'wind';
        else if (state.stage === 2) next = roll < 0.5 ? 'charge' : near ? 'slam' : 'wind';
        else next = roll < 0.4 ? 'charge' : roll < 0.7 ? 'adds' : 'slam';
        state.phase = next;
        state.t = 0;
        slamHit = false;
        windHit = false;
        chargeHit = false;
        if (state.phase === 'slam') {
          showCircle(slam, player.x, player.z);
          onSlam?.('telegraph');
        } else if (state.phase === 'wind') {
          windSpots.forEach((p, i) => showCircle(winds[i], p.x, p.z));
          state.castName = '열풍';
          state.castMax = 2.35;
          onWind?.('telegraph');
        } else if (state.phase === 'charge') {
          charge.ax = built.group.position.x;
          charge.az = built.group.position.z;
          const dx = player.x - charge.ax;
          const dz = player.z - charge.az;
          const len = Math.hypot(dx, dz) || 1;
          charge.bx = charge.ax + (dx / len) * 14;
          charge.bz = charge.az + (dz / len) * 14;
          lane.visible = true;
          lane.position.set((charge.ax + charge.bx) / 2, 0.16, (charge.az + charge.bz) / 2);
          lane.rotation.z = Math.atan2(charge.bx - charge.ax, charge.bz - charge.az);
          lane.scale.set(1, 1, 1);
          state.castName = '돌진';
          state.castMax = 1.25;
          onSlam?.('telegraph');
        } else if (state.phase === 'adds') {
          state.castName = '소환';
          state.castMax = 1.4;
          onWind?.('telegraph');
          spawnAdd(-1);
          spawnAdd(1);
          if (state.stage === 3) spawnAdd(0);
        }
      }
    } else if (state.phase === 'slam') {
      state.castName = '내려찍기';
      state.castMax = 1.15;
      state.cast = Math.min(1.15, state.t);
      const k = Math.min(1, state.t / 1.15);
      built.armL.rotation.x = -1.35 * (k < 0.82 ? k / 0.82 : 1);
      built.armR.rotation.x = built.armL.rotation.x;
      slam.scale.setScalar(1 + k * 0.04);
      paintFill(slam, k);
      if (state.t >= 1.15 && !slamHit) {
        slamHit = true;
        onSlam?.('hit');
        const dx = player.x - slam.position.x;
        const dz = player.z - slam.position.z;
        if (dx * dx + dz * dz <= (slam.userData.r || 4.8) ** 2) onPlayerHit?.(34, 'slam');
      }
      if (state.t > 2.15) {
        hideAll();
        state.phase = 'idle';
        state.t = 0;
        built.armL.rotation.x = 0;
        built.armR.rotation.x = 0;
      }
    } else if (state.phase === 'wind') {
      state.cast = Math.min(state.castMax, state.t);
      const k = state.t / state.castMax;
      for (const w of winds) {
        w.scale.setScalar(0.92 + k * 0.1);
        paintFill(w, k);
      }
      built.group.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.03);
      if (state.t >= state.castMax && !windHit) {
        windHit = true;
        onWind?.('hit');
        if (!inSafe(player.x, player.z)) {
          let inOrange = false;
          for (const w of winds) {
            const dx = player.x - w.position.x;
            const dz = player.z - w.position.z;
            if (dx * dx + dz * dz <= (w.userData.r || 3.6) ** 2) inOrange = true;
          }
          onPlayerHit?.(inOrange ? 42 : 32, 'wind');
        }
      }
      if (state.t > state.castMax + 1.15) {
        hideAll();
        state.castName = '';
        state.cast = 0;
        state.castMax = 0;
        built.group.scale.setScalar(1);
        state.phase = 'idle';
        state.t = 1.6;
      }
    } else if (state.phase === 'charge') {
      state.cast = Math.min(state.castMax, state.t);
      const k = state.t / state.castMax;
      lane.scale.set(1, 0.2 + k * 0.8, 1);
      if (state.t >= state.castMax && !chargeHit) {
        chargeHit = true;
        onSlam?.('hit');
        const px = player.x;
        const pz = player.z;
        const vx = charge.bx - charge.ax;
        const vz = charge.bz - charge.az;
        const len2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((px - charge.ax) * vx + (pz - charge.az) * vz) / len2));
        const cx = charge.ax + vx * t;
        const cz = charge.az + vz * t;
        if ((px - cx) ** 2 + (pz - cz) ** 2 <= 1.7 * 1.7) onPlayerHit?.(36, 'charge');
        built.group.position.set(charge.bx, 0, charge.bz);
      }
      if (state.t > state.castMax + 0.7) {
        lane.visible = false;
        state.castName = '';
        state.phase = 'idle';
        state.t = 0;
        built.group.position.set(home.x, 0, home.z);
      }
    } else if (state.phase === 'adds') {
      state.cast = Math.min(state.castMax, state.t);
      if (state.t > state.castMax + 0.4) {
        state.castName = '';
        state.phase = 'idle';
        state.t = 0;
      }
    }

    vortexClock += dt;
    const span = 22;
    let vortexHit = false;
    columns.forEach((col, i) => {
      col.visible = state.dress && !state.dead && fightOn;
      const travel = (vortexClock * 5.2 + i * span * 0.5) % span;
      const along = 2 + (i % 2 ? span - travel : travel);
      const across = i === 0 ? -2.8 : 3.1;
      const p = fromFrame(along, across);
      col.position.set(p.x, 0, p.z);
      col.rotation.y += dt * 1.6;
      if (!fightOn || state.dead || !player) return;
      const dx = player.x - p.x;
      const dz = player.z - p.z;
      if (dx * dx + dz * dz <= col.userData.r ** 2) vortexHit = true;
    });
    if (vortexHit && state.vortexWait <= 0) {
      state.vortexWait = 0.45;
      onPlayerHit?.(14, 'vortex');
    } else state.vortexWait = Math.max(0, (state.vortexWait || 0) - dt);

    addClock += dt;
    if (state.stage === 3 && addClock > 8 && adds.length < 3) {
      addClock = 0;
      spawnAdd(adds.length % 2 ? 1 : -1);
    }
    for (let i = adds.length - 1; i >= 0; i--) {
      const add = adds[i];
      const dx = player.x - add.mesh.position.x;
      const dz = player.z - add.mesh.position.z;
      const len = Math.hypot(dx, dz) || 1;
      add.mesh.position.x += (dx / len) * dt * (state.stage === 3 ? 3.4 : 2.4);
      add.mesh.position.z += (dz / len) * dt * (state.stage === 3 ? 3.4 : 2.4);
      add.mesh.rotation.y = Math.atan2(dx, dz);
      add.wait = Math.max(0, add.wait - dt);
      if (len < 1.15 && add.wait <= 0) {
        add.wait = 1.1;
        onPlayerHit?.(12, 'add');
      }
    }
    if (state.stage === 3) light.intensity = 26;
    light.position.set(built.group.position.x, 8.2, built.group.position.z);
  }

  function hurt(amount) {
    if (state.dead) return 0;
    state.hp = Math.max(0, state.hp - amount);
    state.hitFlash = 1;
    if (state.hp <= 0 && !died) {
      died = true;
      state.dead = true;
      state.castName = '';
      hideAll();
    }
    return amount;
  }

  function reset() {
    state.hp = BOSS_HP;
    state.dead = false;
    state.phase = 'wait';
    state.t = 0;
    state.castName = '';
    state.cast = 0;
    state.castMax = 0;
    state.hitFlash = 0;
    state.slow = 0;
    state.stage = 1;
    died = false;
    lane.visible = false;
    for (const add of adds) scene.remove(add.mesh);
    adds.length = 0;
    slamHit = false;
    windHit = false;
    built.group.visible = true;
    built.group.position.y = 0;
    built.group.scale.setScalar(1);
    built.group.rotation.z = 0;
    built.rockMat.emissiveIntensity = 1.35;
    light.intensity = 18;
    const sigilMat = built.sigil.children[0]?.material;
    if (sigilMat) {
      sigilMat.opacity = 1;
      sigilMat.transparent = false;
    }
    hideAll();
  }

  function slow(sec) {
    state.slow = Math.max(state.slow, sec);
  }

  function hideDress() {
    state.dress = false;
    columns.forEach((c) => { c.visible = false; });
  }

  function forceSlam() {
    const p = bossPoint();
    state.phase = 'slam';
    state.t = 0.72;
    state.castName = '내려찍기';
    state.castMax = 1.15;
    state.cast = 0.72;
    slamHit = false;
    showCircle(slam, p.x - 4, p.z - 2);
    paintFill(slam, 0.62);
  }

  function forceWind() {
    state.phase = 'wind';
    state.t = 1.05;
    state.castName = '열풍';
    state.castMax = 2.35;
    state.cast = 1.05;
    windHit = false;
    windSpots.forEach((p, i) => showCircle(winds[i], p.x, p.z));
  }

  return {
    group: built.group,
    state,
    update,
    hurt,
    home,
    forceWind,
    forceSlam,
    hideDress,
    reset,
    slow,
  };
}
