// Designer v4-env kit: buildings swap in place by phase, bridge props, rift mobs.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fromFrame, PATH_YAW } from './layout.js';

const VARIANTS = ['apt_A', 'apt_B', 'apt_C', 'apt_D', 'apt_E', 'com_A', 'com_B'];
const STATES = ['intact', 'damaged', 'collapsed'];
const MOBS = {
  shard_runner: { file: 'mob_shard_runner', crack: 1, move: 'run', speed: 4.2, impact: 0.43, power: 9, reach: 1.35 },
  rebar_brute: { file: 'mob_rebar_brute', crack: 1.6, move: 'walk', speed: 2.2, impact: 0.5, power: 16, reach: 1.9 },
  pier_colossus: { file: 'mob_pier_colossus', crack: 2.5, move: 'walk', speed: 1.5, impact: 0.55, power: 24, reach: 2.6 },
};

const uLit = { value: 0.3 };

function faceRoad(side) {
  return PATH_YAW + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
}

function patchGlow(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = [].concat(o.material);
    for (const mat of mats) {
      if (!/glow/i.test(mat.name || '')) continue;
      mat.toneMapped = false;
      if (/mob_/i.test(mat.name)) {
        if (mat.color) mat.color.multiplyScalar(2.8);
        if (mat.emissive) mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 4);
        continue;
      }
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uLit = uLit;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float _glowid;\nvarying float vG;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvG = _glowid;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uLit;\nvarying float vG;')
          .replace('#include <color_fragment>', '#include <color_fragment>\nif (vG > 0.5 && vG < 254.5 && vG / 254.0 > uLit) diffuseColor.rgb = vec3(0.08, 0.10, 0.14);');
      };
      mat.customProgramCacheKey = () => 'bw-glow-lit';
    }
  });
}

async function loader() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  if (MeshoptDecoder.ready) await MeshoptDecoder.ready;
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  return gltfLoader;
}

function placeOf(along, across, yaw, s = 1) {
  const p = fromFrame(along, across);
  return { pos: new THREE.Vector3(p.x, 0, p.z), yaw, s };
}

function instanced(template, places) {
  template.updateMatrixWorld(true);
  const root = new THREE.Group();
  const meshes = [];
  template.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const src of meshes) {
    const inst = new THREE.InstancedMesh(src.geometry, src.material, places.length);
    const local = src.matrixWorld.clone();
    places.forEach((p, i) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0));
      const place = new THREE.Matrix4().compose(p.pos, q, new THREE.Vector3(p.s, p.s, p.s));
      inst.setMatrixAt(i, place.multiply(local));
    });
    inst.count = places.length;
    inst.frustumCulled = false;
    root.add(inst);
  }
  return root;
}

export async function createEnvKit(scene) {
  const gltfLoader = await loader();
  const load = (url) => gltfLoader.loadAsync(url);
  const buildings = {};
  const props = {};
  const mobs = {};
  await Promise.all([
    ...VARIANTS.flatMap((v) => STATES.map(async (s) => {
      const gltf = await load(`/dungeon/env/buildings/bld_${v}_${s}.meshopt.glb`);
      patchGlow(gltf.scene);
      buildings[`${v}_${s}`] = gltf.scene;
    })),
    ...['car_burnt', 'police_car', 'fire_truck', 'guardrail_broken', 'streetlight_fallen', 'road_chunk', 'rubble_pile', 'barrier', 'spawn_crack'].map(async (name) => {
      const gltf = await load(`/dungeon/env/props/prop_${name}.meshopt.glb`);
      patchGlow(gltf.scene);
      props[name] = gltf.scene;
    }),
    ...Object.entries(MOBS).map(async ([id, spec]) => {
      const gltf = await load(`/dungeon/env/mobs/v2/${spec.file}.meshopt.glb`);
      patchGlow(gltf.scene);
      const meta = gltf.parser?.json?.scenes?.[0]?.extras?.bw?.clips || [];
      const impactFrac = meta.find((c) => c.name === 'attack')?.impactFrac ?? spec.impact;
      mobs[id] = { scene: gltf.scene, clips: gltf.animations, spec, impactFrac };
    }),
  ]);

  const root = new THREE.Group();
  root.name = 'env-kit';
  scene.add(root);

  const SLOTS = [
    { id: 'nearC', variant: 'apt_C', tier: 'near', along: 22, across: 42 },
    { id: 'nearA', variant: 'apt_A', tier: 'near', along: 18, across: -44 },
    { id: 'nearE', variant: 'apt_E', tier: 'near', along: 48, across: 36 },
    { id: 'nearCom', variant: 'com_A', tier: 'near', along: 8, across: -18 },
    { id: 'midB', variant: 'apt_B', tier: 'mid', along: 42, across: 36 },
    { id: 'midD', variant: 'apt_D', tier: 'mid', along: 40, across: -38 },
    { id: 'midCom', variant: 'com_B', tier: 'mid', along: -6, across: -24 },
    { id: 'farA', variant: 'apt_A', tier: 'far', along: 70, across: 52 },
    { id: 'farB', variant: 'apt_B', tier: 'far', along: 72, across: -54 },
    { id: 'farC', variant: 'apt_C', tier: 'far', along: 90, across: 28 },
  ];

  const slots = SLOTS.map((slot) => {
    const yaw = faceRoad(slot.across);
    const p = fromFrame(slot.along, slot.across);
    const states = {};
    for (const s of STATES) {
      const g = buildings[`${slot.variant}_${s}`].clone(true);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = yaw;
      g.visible = false;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
      root.add(g);
      states[s] = g;
    }
    return { ...slot, states };
  });

  function stateFor(tier, stage) {
    if (stage <= 1) return tier === 'near' ? 'damaged' : 'intact';
    if (stage === 2) {
      if (tier === 'near') return 'collapsed';
      if (tier === 'mid') return 'damaged';
      return 'intact';
    }
    return tier === 'far' ? 'damaged' : 'collapsed';
  }

  const blinks = [];
  const flames = [];
  const flameMap = new THREE.TextureLoader().load('/dungeon/vfx/flipbooks/explosion_4x4.png?v=env');
  flameMap.colorSpace = THREE.SRGBColorSpace;
  flameMap.repeat.set(0.25, 0.25);
  flameMap.offset.set(0.5, 0.5);
  const flameMat = new THREE.SpriteMaterial({
    map: flameMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffb060',
  });

  function addClone(name, along, across, yaw, s = 1) {
    const g = props[name].clone(true);
    const p = fromFrame(along, across);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = yaw;
    g.scale.setScalar(s);
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      if (o.name === 'fx_flame') {
        o.visible = false;
        const sprite = new THREE.Sprite(flameMat.clone());
        sprite.scale.set(2.6, 3.6, 1);
        sprite.position.y = 1.5;
        g.add(sprite);
        flames.push(sprite);
      }
      if (/^beacon/.test(o.name) || o.name === 'bulb' || o.name === 'lamp') blinks.push(o);
    });
    root.add(g);
    return g;
  }

  const yawFwd = PATH_YAW;
  addClone('police_car', 4, -2.6, yawFwd);
  addClone('fire_truck', 20, 3.1, yawFwd + 0.2);
  addClone('car_burnt', 12, 2.4, yawFwd + Math.PI);
  addClone('car_burnt', 24, -1.8, yawFwd + 0.4);
  root.add(instanced(props.barrier, [
    placeOf(7, -1.6, yawFwd + Math.PI / 2),
    placeOf(7, 1.6, yawFwd + Math.PI / 2),
    placeOf(30, -1.6, yawFwd + Math.PI / 2),
    placeOf(30, 1.6, yawFwd + Math.PI / 2),
  ]));
  addClone('streetlight_fallen', 9, 4.2, yawFwd);
  addClone('streetlight_fallen', 18, -4.4, yawFwd + 1);

  const railPlaces = [];
  for (let along = -8; along <= 44; along += 4) {
    for (const side of [-1, 1]) {
      railPlaces.push(placeOf(along, side * 6.6, PATH_YAW - Math.PI / 2));
    }
  }
  root.add(instanced(props.guardrail_broken, railPlaces));
  root.add(instanced(props.road_chunk, [
    placeOf(10, 0.4, yawFwd, 1.2),
    placeOf(15, -1.2, yawFwd + 0.4, 1),
    placeOf(22, 1.1, yawFwd - 0.3, 1.3),
    placeOf(31, -0.4, yawFwd, 1.1),
  ]));
  root.add(instanced(props.rubble_pile, [
    placeOf(13, 4.8, 0.4, 1),
    placeOf(26, -5.2, 1.2, 1.2),
    placeOf(36, 5.4, 0.2, 0.9),
    placeOf(-2, 5, 0.8, 0.8),
  ]));

  const crackTemplate = props.spawn_crack;
  const cracks = [];
  function addCrack(along, across, scale) {
    const g = crackTemplate.clone(true);
    const p = fromFrame(along, across);
    g.position.set(p.x, 0.04, p.z);
    g.rotation.y = yawFwd;
    g.scale.setScalar(scale);
    root.add(g);
    cracks.push({ group: g, along, across });
    return g;
  }
  addCrack(3.4, -1.6, 1);
  addCrack(4.2, 0.2, 1.6);
  addCrack(5.2, 1.7, 2.5);

  const smokeMap = new THREE.TextureLoader().load('/dungeon/vfx/flipbooks/smoke_puff_4x4.png?v=env');
  smokeMap.colorSpace = THREE.SRGBColorSpace;
  smokeMap.repeat.set(0.25, 0.25);
  smokeMap.offset.set(0.25, 0.5);
  for (const [along, across] of [[16, 20], [14, -22], [42, 30], [40, -32]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeMap, transparent: true, depthWrite: false, opacity: 0.55, color: '#5c463c',
    }));
    const p = fromFrame(along, across);
    s.position.set(p.x, 18, p.z);
    s.scale.set(8, 28, 1);
    root.add(s);
  }
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#efe6d2', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide,
  });
  for (const across of [-36, 40]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.8, 48, 6, 1, true), beamMat);
    const p = fromFrame(48, across);
    beam.position.set(p.x, 22, p.z);
    beam.rotation.x = Math.PI;
    root.add(beam);
  }

  const liveMobs = [];
  function makeMob(kind, x, z, yaw = yawFwd + Math.PI) {
    const src = mobs[kind];
    if (!src) return null;
    const group = SkeletonUtils.clone(src.scene);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const mixer = new THREE.AnimationMixer(group);
    const actions = {};
    for (const clip of src.clips) {
      const action = mixer.clipAction(clip);
      action.clampWhenFinished = true;
      actions[clip.name] = action;
    }
    const mob = {
      group,
      kind,
      ready: false,
      dead: false,
      speed: src.spec.speed,
      power: src.spec.power,
      reach: src.spec.reach,
      impactFrac: src.impactFrac,
      play(name, loop = false) {
        const next = actions[name];
        if (!next) return;
        if (name === 'attack') mob._impact = false;
        Object.values(actions).forEach((a) => { if (a !== next) a.fadeOut(0.12); });
        next.reset();
        next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        next.clampWhenFinished = !loop;
        next.fadeIn(0.1).play();
        mob.clip = name;
      },
      update(dt) {
        mixer.update(dt);
        const atk = actions.attack;
        if (mob.clip === 'attack' && atk && !mob._impact) {
          const dur = atk.getClip().duration || 1;
          if (atk.time >= dur * mob.impactFrac) mob._impact = true;
        }
        const death = actions.death;
        if (mob.clip === 'death' && death && death.time >= death.getClip().duration * 0.7) {
          death.paused = true;
          mob.dead = true;
        }
      },
      consumeImpact() {
        if (!mob._impact) return false;
        mob._impact = false;
        return true;
      },
    };
    mixer.addEventListener('finished', (e) => {
      const name = e.action.getClip().name;
      if (name === 'spawn') {
        mob.ready = true;
        mob.play(src.spec.move, true);
      } else if (name === 'attack') {
        mob.play(src.spec.move, true);
      }
    });
    root.add(group);
    liveMobs.push(mob);
    return mob;
  }

  function spawnMob(kind, x, z) {
    const mob = makeMob(kind, x, z);
    if (!mob) return null;
    mob.play('spawn', false);
    return mob;
  }

  let stage = 1;
  let dress = 'phase';
  function applyVisual() {
    const show = dress === 'bridge'
      ? (slot) => (slot.id === 'nearC' || slot.id === 'midD' ? 'collapsed' : slot.tier === 'far' ? 'intact' : 'damaged')
      : dress === 'collapsed'
        ? (slot) => (slot.tier === 'far' ? 'damaged' : 'collapsed')
        : (slot) => stateFor(slot.tier, stage);
    const pick = show;
    for (const slot of slots) {
      const want = pick(slot);
      for (const s of STATES) slot.states[s].visible = s === want;
    }
    uLit.value = dress === 'collapsed' || stage >= 3 ? 0 : dress === 'bridge' || stage === 2 ? 0.1 : 0.3;
  }

  function setPhase(next) {
    stage = next;
    dress = 'phase';
    applyVisual();
  }
  function setDress(mode) {
    dress = mode;
    applyVisual();
  }
  applyVisual();

  const showcase = [];
  function showSpawn() {
    const lineup = [
      ['shard_runner', 3.4, -1.6],
      ['rebar_brute', 4.2, 0.2],
      ['pier_colossus', 5.2, 1.7],
    ];
    for (const [kind, along, across] of lineup) {
      const p = fromFrame(along, across);
      const mob = makeMob(kind, p.x, p.z, yawFwd + Math.PI);
      if (!mob) continue;
      const clip = mobs[kind].clips.find((c) => c.name === 'spawn');
      mob.play('spawn', false);
      mob.update((clip?.duration || 1.6) * 0.78);
      mob.hold = true;
      showcase.push(mob);
    }
  }

  function showImpact() {
    const lineup = [
      ['shard_runner', 10, -3.2],
      ['rebar_brute', 13, 0.2],
      ['pier_colossus', 16, 3.6],
    ];
    for (const [kind, along, across] of lineup) {
      const p = fromFrame(along, across);
      const mob = makeMob(kind, p.x, p.z, yawFwd + Math.PI);
      if (!mob) continue;
      const clip = mobs[kind].clips.find((c) => c.name === 'attack');
      mob.ready = true;
      mob.play('attack', false);
      mob.update((clip?.duration || 1) * mob.impactFrac);
      mob.hold = true;
    }
  }

  function populateRoad() {
    const pack = [
      ['shard_runner', 14, 1.1],
      ['rebar_brute', 20, -1.6],
      ['pier_colossus', 26, 1.2],
    ];
    for (const [kind, along, across] of pack) {
      const p = fromFrame(along, across);
      const mob = makeMob(kind, p.x, p.z, yawFwd + Math.PI);
      mob.ready = true;
      mob.play(MOBS[kind].move, true);
      mob.update(Math.random());
    }
  }

  let flameT = 0;
  function update(dt) {
    flameT += dt;
    const frame = Math.floor(flameT * 12) % 16;
    flameMap.offset.set((frame % 4) / 4, 1 - (Math.floor(frame / 4) + 1) / 4);
    const t = performance.now() * 0.001;
    blinks.forEach((node, i) => {
      const alt = node.name === 'beacon_blue' ? Math.sin(t * 9 + i) < 0 : Math.sin(t * 9 + i) > 0;
      const flicker = node.name === 'bulb' ? Math.sin(t * 17 + i * 3) > 0.2 : alt;
      node.visible = node.name === 'lamp' ? Math.sin(t * 6.2 + i) > 0 : flicker;
    });
    for (const mob of liveMobs) {
      if (!mob.hold) mob.update(dt);
    }
  }

  return {
    root,
    setPhase,
    setDress,
    spawnMob,
    showSpawn,
    showImpact,
    populateRoad,
    update,
    uLit,
    liveMobs,
  };
}
