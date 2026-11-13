import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bossPoint, PATH_YAW, fromFrame, inSafe, toFrame, BOSS_ALONG } from './layout.js';

export const BOSS_HP = 10800;
// Authored Holde is 21.65 m. One uniform scale brings the feet-to-peak height to ~15 m.
export const HOLDE_SCALE = 0.69;

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
  // Designer Hold GLB replaces these children. Keep the group name and the HUD bar ("홀드").
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

async function loadHolde() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  if (MeshoptDecoder.ready) await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/dungeon/boss/holde.meshopt.glb');
  const group = gltf.scene;
  group.name = 'hold';
  const armor = { armor_p1: [], armor_p2: [], armor_p3: [] };
  const riftMats = [];
  group.traverse((o) => {
    if (/^armor_p1/.test(o.name)) armor.armor_p1.push(o);
    else if (/^armor_p2/.test(o.name)) armor.armor_p2.push(o);
    else if (/^armor_p3/.test(o.name)) armor.armor_p3.push(o);
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    for (const mat of [].concat(o.material)) {
      if (!mat) continue;
      if (/rift/i.test(mat.name || '')) {
        mat.emissive = mat.emissive || new THREE.Color('#FF6A1A');
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 4.2);
        riftMats.push(mat);
      } else if (/hot/i.test(mat.name || '')) {
        mat.emissiveIntensity = Math.min(Math.max(mat.emissiveIntensity || 1, 2.4), 2.6);
      }
    }
  });
  const mixer = new THREE.AnimationMixer(group);
  const actions = {};
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.clampWhenFinished = true;
    actions[clip.name] = action;
  }
  const metaList = group.userData?.bw?.clips || [];
  const meta = {};
  for (const row of metaList) meta[row.name] = row;
  const crack = new THREE.Group();
  crack.name = 'spawn-crack';
  const dark = new THREE.Mesh(
    new THREE.CircleGeometry(7.4, 32),
    new THREE.MeshBasicMaterial({ color: '#1a1412', transparent: true, opacity: 0.92, depthWrite: false }),
  );
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 6.2, 32),
    new THREE.MeshBasicMaterial({ color: '#ff6a1a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  dark.rotation.x = -Math.PI / 2;
  glow.rotation.x = -Math.PI / 2;
  dark.position.y = 0.03;
  glow.position.y = 0.05;
  crack.add(dark, glow);
  crack.visible = false;
  return { group, holde: true, mixer, actions, meta, armor, riftMats, crack, armL: { rotation: { x: 0 } }, armR: { rotation: { x: 0 } }, rockMat: { emissiveIntensity: 1 }, sigil: { children: [] } };
}

export async function createBoss(scene) {
  let built = null;
  try {
    built = await loadHolde();
  } catch (err) {
    console.warn('[raid] holde glb failed, using procedural boss', err);
  }
  if (!built) built = buildBossMesh();
  const home = bossPoint();
  built.group.position.set(home.x, 0, home.z);
  built.group.rotation.y = PATH_YAW + Math.PI;
  const S = built.holde ? HOLDE_SCALE : 1;
  built.group.scale.setScalar(built.holde ? HOLDE_SCALE : 1.45);
  scene.add(built.group);
  if (built.crack) {
    built.crack.position.set(home.x, 0, home.z);
    built.crack.scale.setScalar(S);
    scene.add(built.crack);
  }
  let mobFactory = null;

  const light = new THREE.PointLight('#ff7a3a', 18, 26 * S, 2);
  light.position.set(home.x, 8 * S, home.z);
  scene.add(light);

  const slam = circleMesh(4.8 * S);
  const winds = [0, 1, 2, 3].map(() => circleMesh(3.6 * S));
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
    hold: false,
    vortexWait: 0,
    stage: 1,
    dress: true,
    zones: [],
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
    new THREE.PlaneGeometry(2.4 * S, 16 * S),
    new THREE.MeshBasicMaterial({ color: '#ffe1a8', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
  );
  lane.rotation.x = -Math.PI / 2;
  lane.visible = false;
  scene.add(lane);
  const charge = { ax: home.x, az: home.z, bx: home.x, bz: home.z };
  let clipName = '';
  const debris = [];

  function applyArmor(stage) {
    if (!built.holde) return;
    for (const node of built.armor.armor_p1 || []) node.visible = stage < 2;
    for (const node of built.armor.armor_p2 || []) node.visible = stage < 2;
    for (const node of built.armor.armor_p3 || []) node.visible = stage < 3;
    const pop = stage >= 2 ? 5.4 : 4.2;
    for (const mat of built.riftMats || []) mat.emissiveIntensity = pop;
  }

  function playClip(name, loop = false, fromFrac = 0, fade = 0.08) {
    if (!built.holde) return;
    const next = built.actions[name];
    if (!next) return;
    if (fade > 0 && clipName === name && (next.isRunning() || next.paused)) return;
    for (const action of Object.values(built.actions)) {
      if (action === next) continue;
      if (fade > 0) action.fadeOut(fade);
      else action.stop();
    }
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    if (fade > 0) next.fadeIn(fade).play();
    else {
      next.setEffectiveWeight(1);
      next.play();
    }
    if (fromFrac > 0) next.time = next.getClip().duration * fromFrac;
    clipName = name;
    state.clip = name;
    state.impactDone = {};
  }

  function clipTime() {
    const action = built.holde ? built.actions[clipName] : null;
    return action ? action.time : 0;
  }

  function clipEvent(frac, key) {
    if (state.impactDone?.[key]) return false;
    const dur = built.actions[clipName]?.getClip().duration || 1;
    if (clipTime() < dur * frac) return false;
    state.impactDone[key] = true;
    return true;
  }

  function tossDebris(x, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 + (i % 3) * 0.12, 0.16, 0.42),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#8d8680' : '#5c534c', roughness: 0.9 }),
      );
      m.position.set(x + (Math.random() - 0.5) * 3 * S, 0.3, z + (Math.random() - 0.5) * 2 * S);
      m.userData.vy = 3 + Math.random() * 3;
      m.userData.vx = (Math.random() - 0.5) * 3;
      m.userData.vz = (Math.random() - 0.5) * 3;
      scene.add(m);
      debris.push(m);
    }
  }

  function stageNow() {
    const ratio = state.hp / state.hpMax;
    return ratio <= 0.25 ? 3 : ratio <= 0.6 ? 2 : 1;
  }

  const SPAWNS = [
    { along: -18, across: -1.5 },
    { along: 48, across: 1.7 },
    { along: BOSS_ALONG, across: 0.2 },
    { along: BOSS_ALONG - 3, across: 6.35 },
    { along: BOSS_ALONG + 5, across: -6.25 },
  ];
  const ADD_R = { shard_runner: 0.55, rebar_brute: 0.85, pier_colossus: 1.15 };
  let obstacles = [];

  function spawnAdd(i = adds.length) {
    const spot = SPAWNS[i % SPAWNS.length];
    const climb = i % 5 >= 3;
    const kinds = ['shard_runner', 'rebar_brute', 'pier_colossus'];
    const kind = kinds[i % kinds.length];
    const roll = (i * 7 + 3) % 10;
    const threat = roll < 6 ? 'tank' : roll < 8 ? 'heal' : roll < 9 ? 'ranged' : 'player';
    if (mobFactory) {
      const p = fromFrame(spot.along, spot.across);
      const mob = mobFactory(kind, p.x, p.z);
      if (mob) {
        if (climb) mob.group.position.y = 0.35;
        adds.push({ mesh: mob.group, mob, wait: 0.7 + (i % 3) * 0.25, threat, slot: i % 6, radius: ADD_R[kind] || 0.6, kind });
        return;
      }
    }
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 8), addMat);
    const p = fromFrame(spot.along, spot.across);
    mesh.position.set(p.x, 0.7, p.z);
    mesh.castShadow = true;
    scene.add(mesh);
    adds.push({ mesh, wait: 0.4, threat, slot: i % 6, radius: 0.55, kind: 'capsule' });
  }

  function addGoal(add, raiders) {
    const live = (raiders || []).filter((r) => !r.down);
    const pool = live.length ? live : (raiders || []);
    if (!pool.length) return null;
    const want = add.threat || 'tank';
    let pick = pool.filter((r) => (
      want === 'tank' ? r.role === 'tank'
        : want === 'heal' ? r.role === 'heal'
          : want === 'player' ? r.id === 'player'
            : r.role === 'dps'
    ));
    if (!pick.length) pick = pool;
    const t = pick[add.slot % pick.length];
    const ang = (add.slot / 6) * Math.PI * 2 + 0.35;
    const dist = Math.max((add.mob?.reach || 1.35) + 0.45, 1.75);
    return { x: t.x + Math.cos(ang) * dist, z: t.z + Math.sin(ang) * dist, id: t.id, tx: t.x, tz: t.z };
  }

  function pushAdds(dt, raiders) {
    for (const add of adds) {
      if (add.mob && !add.mob.ready) continue;
      const goal = addGoal(add, raiders);
      if (!goal) continue;
      const dx = goal.x - add.mesh.position.x;
      const dz = goal.z - add.mesh.position.z;
      const len = Math.hypot(dx, dz) || 1;
      let vx = dx / len;
      let vz = dz / len;
      for (const other of adds) {
        if (other === add) continue;
        const ox = add.mesh.position.x - other.mesh.position.x;
        const oz = add.mesh.position.z - other.mesh.position.z;
        const d = Math.hypot(ox, oz) || 0.001;
        const min = ((add.radius || 0.6) + (other.radius || 0.6)) * 1.2;
        if (d < min) {
          const push = (min - d) * 2.4;
          vx += (ox / d) * push;
          vz += (oz / d) * push;
        }
      }
      for (const ob of obstacles) {
        const ox = add.mesh.position.x - ob.x;
        const oz = add.mesh.position.z - ob.z;
        const d = Math.hypot(ox, oz) || 0.001;
        const min = (add.radius || 0.6) + ob.r;
        if (d < min) {
          const push = (min - d) * 3.2;
          vx += (ox / d) * push;
          vz += (oz / d) * push;
        }
      }
      const swinging = add.mob?.clip === 'attack';
      if (!swinging) {
        const sp = Math.hypot(vx, vz) || 1;
        const speed = add.mob?.speed || 2.4;
        add.mesh.position.x += (vx / sp) * dt * speed;
        add.mesh.position.z += (vz / sp) * dt * speed;
        add.mesh.rotation.y = Math.atan2(goal.tx - add.mesh.position.x, goal.tz - add.mesh.position.z);
      }
      if (add.mesh.position.y > 0.02) add.mesh.position.y = Math.max(0, add.mesh.position.y - dt * 1.4);
      add._goal = goal;
    }
    for (let n = 0; n < 2; n++) {
      for (let i = 0; i < adds.length; i++) {
        for (let j = i + 1; j < adds.length; j++) {
          const a = adds[i];
          const b = adds[j];
          const ox = b.mesh.position.x - a.mesh.position.x;
          const oz = b.mesh.position.z - a.mesh.position.z;
          const d = Math.hypot(ox, oz) || 0.001;
          const min = (a.radius || 0.6) + (b.radius || 0.6);
          if (d >= min) continue;
          const push = (min - d) * 0.5;
          const nx = ox / d;
          const nz = oz / d;
          a.mesh.position.x -= nx * push;
          a.mesh.position.z -= nz * push;
          b.mesh.position.x += nx * push;
          b.mesh.position.z += nz * push;
        }
      }
    }
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
    const hitRaid = (x, z, r, amount, kind) => {
      const raiders = ctx.raiders?.length ? ctx.raiders : [{ id: 'player', x: player.x, z: player.z, down: false }];
      for (const raider of raiders) {
        if (raider.down) continue;
        const dx = raider.x - x;
        const dz = raider.z - z;
        if (dx * dx + dz * dz > r * r) continue;
        if (raider.id === 'player') onPlayerHit?.(amount, kind);
        else ctx.onRaiderHit?.(raider.id, amount, kind);
      }
    };
    if (state.dead) {
      columns.forEach((c) => { c.visible = false; });
      lane.visible = false;
      adds.forEach((a) => { a.mesh.visible = false; });
      if (built.holde) {
        playClip('death', false);
        built.mixer.update(dt);
        const death = built.actions.death;
        if (death && death.time >= death.getClip().duration - 0.04) death.paused = true;
        if (clipEvent(built.meta.death?.impactFrac || 0.6, 'death')) {
          ctx.onSlam?.('hit');
          tossDebris(built.group.position.x, built.group.position.z + 2, 14);
        }
      } else {
        built.group.position.y = Math.max(-0.45, built.group.position.y - dt * 0.22);
        built.rockMat.emissiveIntensity = Math.max(0.1, built.rockMat.emissiveIntensity - dt * 0.8);
        const sigilMat = built.sigil.children[0]?.material;
        if (sigilMat) {
          sigilMat.transparent = true;
          sigilMat.opacity = Math.max(0, sigilMat.opacity - dt * 0.8);
        }
      }
      light.intensity = Math.max(0, light.intensity - dt * 8);
      hideAll();
      return;
    }
    state.hitFlash = Math.max(0, state.hitFlash - dt * 3);
    if (!built.holde) {
      built.rockMat.emissiveIntensity = 1.25 + state.hitFlash * 1.4 + Math.sin(performance.now() * 0.003) * 0.15;
      built.group.rotation.z = Math.sin(performance.now() * 0.0015) * 0.04;
      built.armL.rotation.x = Math.sin(performance.now() * 0.001) * 0.08;
      built.armR.rotation.x = Math.sin(performance.now() * 0.001 + 1) * 0.08;
    } else if (state.hitFlash > 0.2 && clipName === 'idle') {
      playClip('hit', false);
    }

    if (!fightOn) {
      columns.forEach((c) => { c.visible = false; });
      state.phase = 'wait';
      return;
    }
    if (state.slow > 0) state.slow = Math.max(0, state.slow - dt);
    const nextStage = stageNow();
    if (nextStage !== state.stage) {
      state.stage = nextStage;
      applyArmor(nextStage);
      if (built.holde) playClip('roar', false);
      ctx.onStage?.(nextStage);
    }
    const pace = state.stage === 3 ? 1.55 : state.stage === 2 ? 1.15 : 1;
    state.t += dt * (state.slow > 0 ? 0.5 : pace);
      if (built.holde) {
        if (!state.hold) built.mixer.update(dt * (state.slow > 0 ? 0.5 : 1));
        if (built.crack) built.crack.visible = state.phase === 'spawn';
      for (let i = debris.length - 1; i >= 0; i--) {
        const m = debris[i];
        m.userData.vy -= dt * 12;
        m.position.x += m.userData.vx * dt;
        m.position.y += m.userData.vy * dt;
        m.position.z += m.userData.vz * dt;
        if (m.position.y < 0.1) {
          scene.remove(m);
          debris.splice(i, 1);
        }
      }
      if (state.phase === 'idle' && !state.hold) {
        const stuck = clipName === 'hit' || clipName === 'roar';
        const action = built.actions[clipName];
        const finished = stuck && action && (!action.isRunning() || action.paused);
        if (finished || (!stuck && clipName !== 'idle')) playClip('idle', true);
      }
    }

    if (state.phase === 'wait') {
      state.phase = built.holde ? 'spawn' : 'idle';
      state.t = 0;
      if (built.holde) playClip('spawn', false, 0.25);
    } else if (state.phase === 'spawn') {
      state.castName = '출현';
      state.castMax = 3.4;
      state.cast = Math.min(state.castMax, state.t);
      if (clipEvent(0.36, 'spawn-front')) {
        ctx.onSlam?.('hit');
        tossDebris(built.group.position.x, built.group.position.z + 4 * S, 12);
      }
      if (clipEvent(0.66, 'spawn-hind')) tossDebris(built.group.position.x, built.group.position.z - 3 * S, 6);
      if (clipEvent(0.78, 'spawn-roar')) ctx.onWind?.('hit');
      const spawnAct = built.actions.spawn;
      if (!built.holde || (spawnAct && spawnAct.time >= spawnAct.getClip().duration - 0.08)) {
        state.phase = 'idle';
        state.t = 0;
        playClip('idle', true);
      }
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
          playClip('slam', false);
        } else if (state.phase === 'sweep') {
          showCircle(slam, player.x, player.z);
          onSlam?.('telegraph');
          playClip('sweep', false);
        } else if (state.phase === 'wind') {
          windSpots.forEach((p, i) => showCircle(winds[i], p.x, p.z));
          state.castName = '열풍';
          state.castMax = 2.35;
          onWind?.('telegraph');
          playClip('breath_charge', false);
        } else if (state.phase === 'charge') {
          charge.ax = built.group.position.x;
          charge.az = built.group.position.z;
          const dx = player.x - charge.ax;
          const dz = player.z - charge.az;
          const len = Math.hypot(dx, dz) || 1;
          charge.bx = charge.ax + (dx / len) * 14 * S;
          charge.bz = charge.az + (dz / len) * 14 * S;
          lane.visible = true;
          lane.position.set((charge.ax + charge.bx) / 2, 0.16, (charge.az + charge.bz) / 2);
          lane.rotation.z = Math.atan2(charge.bx - charge.ax, charge.bz - charge.az);
          lane.scale.set(1, 1, 1);
          state.castName = '돌진';
          state.castMax = built.holde ? (built.meta.charge?.impactTime || 2.82) : 1.25;
          onSlam?.('telegraph');
          playClip('charge', false);
        } else if (state.phase === 'adds') {
          state.castName = '소환';
          state.castMax = 1.4;
          onWind?.('telegraph');
          spawnAdd(adds.length);
          spawnAdd(adds.length);
          spawnAdd(adds.length);
          if (state.stage === 3) spawnAdd(adds.length);
          playClip('roar', false);
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
      const slamReady = built.holde ? clipEvent(built.meta.slam?.impactFrac || 0.54, 'slam') : state.t >= 1.15;
      if (slamReady && !slamHit) {
        slamHit = true;
        onSlam?.('hit');
        tossDebris(slam.position.x, slam.position.z, 8);
        const dx = player.x - slam.position.x;
        const dz = player.z - slam.position.z;
        hitRaid(slam.position.x, slam.position.z, slam.userData.r || 4.8, 34, 'slam');
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
      if (!built.holde) built.group.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.03);
      const breathReady = built.holde
        ? clipEvent(built.meta.breath_charge?.impactFrac || 0.98, 'breath')
        : state.t >= state.castMax;
      if (breathReady && !windHit) {
        windHit = true;
        state.breathT = 0;
        if (built.holde) playClip('breath_fire', true);
        onWind?.('hit');
        for (const raider of (ctx.raiders?.length ? ctx.raiders : [{ id: 'player', x: player.x, z: player.z, down: false }])) {
          if (raider.down || inSafe(raider.x, raider.z)) continue;
          let inOrange = false;
          for (const w of winds) {
            const dx = raider.x - w.position.x;
            const dz = raider.z - w.position.z;
            if (dx * dx + dz * dz <= (w.userData.r || 3.6) ** 2) inOrange = true;
          }
          const amount = inOrange ? 42 : 32;
          if (raider.id === 'player') onPlayerHit?.(amount, 'wind');
          else ctx.onRaiderHit?.(raider.id, amount, 'wind');
        }
      }
      if (windHit) state.breathT = (state.breathT || 0) + dt;
      const beam = built.holde ? (built.actions.breath_fire?.getClip().duration || 3) : 1.15;
      if (windHit && state.breathT > beam) {
        hideAll();
        state.castName = '';
        state.cast = 0;
        state.castMax = 0;
        built.group.scale.setScalar(built.holde ? HOLDE_SCALE : 1);
        state.phase = 'idle';
        state.t = 1.6;
        if (built.holde) playClip('idle', true);
      }
    } else if (state.phase === 'charge') {
      state.cast = Math.min(state.castMax, state.t);
      const k = state.t / state.castMax;
      lane.scale.set(1, 0.2 + k * 0.8, 1);
      if (built.holde && clipName === 'charge') {
        const dur = built.actions.charge.getClip().duration || 3.2;
        const frac = clipTime() / dur;
        const u = Math.max(0, Math.min(1, (frac - 0.34) / 0.54));
        built.group.position.x = charge.ax + (charge.bx - charge.ax) * u;
        built.group.position.z = charge.az + (charge.bz - charge.az) * u;
      }
      const ram = built.holde ? clipEvent(built.meta.charge?.impactFrac || 0.88, 'charge-ram') : state.t >= state.castMax;
      if (ram && !chargeHit) {
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
        hitRaid(cx, cz, 1.7 * S, 36, 'charge');
        built.group.position.set(charge.bx, 0, charge.bz);
      }
      const chargeDone = built.holde
        ? clipTime() >= (built.actions.charge?.getClip().duration || 3.2) - 0.06
        : state.t > state.castMax + 0.7;
      if (chargeDone) {
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
    state.vortexWait = Math.max(0, (state.vortexWait || 0) - dt);
    columns.forEach((col, i) => {
      col.visible = state.dress && !state.dead && fightOn;
      const travel = (vortexClock * 5.2 + i * span * 0.5) % span;
      const along = 2 + (i % 2 ? span - travel : travel);
      const across = i === 0 ? -2.8 : 3.1;
      const p = fromFrame(along, across);
      col.position.set(p.x, 0, p.z);
      col.rotation.y += dt * 1.6;
      if (!fightOn || state.dead || !player || state.vortexWait > 0) return;
      const before = state.vortexWait;
      hitRaid(p.x, p.z, col.userData.r, 10, 'vortex');
      if (state.vortexWait === before) {
        const raiders = ctx.raiders?.length ? ctx.raiders : [{ id: 'player', x: player.x, z: player.z, down: false }];
        if (raiders.some((r) => !r.down && (r.x - p.x) ** 2 + (r.z - p.z) ** 2 <= col.userData.r ** 2)) state.vortexWait = 0.7;
      }
    });

    addClock += dt;
    if ((state.stage >= 2 && addClock > 9 && adds.length < 5) || (state.phase === 'adds' && adds.length < 2)) {
      if (state.phase !== 'adds' || addClock > 0.2) {
        if (state.stage >= 2 && addClock > 9) {
          addClock = 0;
          spawnAdd(adds.length);
          if (adds.length < 4) spawnAdd(adds.length);
        }
      }
    }
    pushAdds(dt, ctx.raiders);
    for (const add of adds) {
      if (add.mob && !add.mob.ready) continue;
      const goal = add._goal;
      if (!goal) continue;
      const reach = add.mob?.reach || 1.15;
      const td = Math.hypot(goal.tx - add.mesh.position.x, goal.tz - add.mesh.position.z);
      const swinging = add.mob?.clip === 'attack';
      add.wait = Math.max(0, (add.wait || 0) - dt);
      if (add.mob && td < reach && !swinging && add.wait <= 0) add.mob.play('attack');
      if (add.mob?.consumeImpact() && td < reach + 0.9) {
        add.wait = 0.55;
        const amount = add.mob.power || 12;
        if (goal.id === 'player') onPlayerHit?.(amount, 'add');
        else ctx.onRaiderHit?.(goal.id, amount, 'add');
      } else if (!add.mob && td < 1.15 && add.wait <= 0) {
        add.wait = 1.1;
        if (goal.id === 'player') onPlayerHit?.(12, 'add');
        else ctx.onRaiderHit?.(goal.id, 12, 'add');
      }
    }
    if (state.stage === 3) light.intensity = 26;
    light.position.set(built.group.position.x, 8.2, built.group.position.z);
    const zones = [];
    if (slam.visible) zones.push({ x: slam.position.x, z: slam.position.z, r: slam.userData.r || 3 });
    for (const w of winds) {
      if (w.visible) zones.push({ x: w.position.x, z: w.position.z, r: w.userData.r || 2.4 });
    }
    state.zones = zones;
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
    built.group.scale.setScalar(built.holde ? HOLDE_SCALE : 1.45);
    applyArmor(1);
    if (built.holde) playClip('idle', true);
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
    playClip('slam', false);
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
    replaySpawn() {
      state.dead = false;
      died = false;
      state.hold = false;
      state.phase = 'spawn';
      state.t = 0;
      state.impactDone = {};
      clipName = '';
      playClip('spawn', false, 0.25);
      if (built.crack) built.crack.visible = true;
    },
    pose(name, frac) {
      state.hold = true;
      state.hitFlash = 0;
      state.dead = false;
      died = false;
      state.phase = name === 'spawn' ? 'spawn' : 'idle';
      clipName = '';
      playClip(name, false, frac, 0);
      const action = built.actions[name];
      if (action) {
        built.mixer.update(1 / 60);
        action.paused = true;
      }
      if (built.crack) built.crack.visible = name === 'spawn';
    },
    setStage(n) {
      state.stage = n;
      applyArmor(n);
    },
    setMobFactory(fn) { mobFactory = fn; },
    setObstacles(list) { obstacles = list || []; },
    spawnWave(n = 4) {
      for (let i = 0; i < n; i++) spawnAdd(adds.length);
    },
    hideDress,
    reset,
    slow,
  };
}
