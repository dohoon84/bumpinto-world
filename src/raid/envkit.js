// Designer v4-env kit: buildings swap in place by phase, bridge props, rift mobs.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fromFrame, PATH_YAW } from './layout.js';

const VARIANTS = ['apt_A', 'apt_B', 'apt_C', 'apt_D', 'apt_E', 'com_A', 'com_B'];
const STATES = ['intact', 'damaged', 'collapsed'];
const MOBS = {
  shard_runner: { file: 'mob_shard_runner', crack: 1, move: 'run', speed: 4.2, impact: 0.43, power: 9, reach: 1.35 },
  rebar_brute: { file: 'mob_rebar_brute', crack: 1.6, move: 'walk', speed: 2.2, impact: 0.5, power: 16, reach: 1.9 },
  pier_colossus: { file: 'mob_pier_colossus', crack: 2.5, move: 'walk', speed: 1.5, impact: 0.55, power: 24, reach: 2.6 },
};

const uLit = { value: 0.3 };

function koreanSignMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 220;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0a4f8a';
  g.fillRect(0, 0, 512, 220);
  g.strokeStyle = '#f5f8fc';
  g.lineWidth = 12;
  g.strokeRect(8, 8, 496, 204);
  g.fillStyle = '#f7fbff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 78px "Noto Sans CJK KR", "NanumSquareRound", sans-serif';
  g.fillText('탄천교', 256, 78);
  g.font = '600 46px "Noto Sans CJK KR", "NanumSquareRound", sans-serif';
  g.fillText('분당 방면', 256, 154);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
}

function greenBlades(geo) {
  if (geo.userData.signBlades) return geo.userData.signBlades;
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const empty = [];
  if (!pos || !col) {
    geo.userData.signBlades = empty;
    return empty;
  }
  const pts = [];
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i);
    const g = col.getY(i);
    const b = col.getZ(i);
    if (g > 0.16 && g > r + 0.07 && g > b + 0.03 && r < 0.5) {
      pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    }
  }
  if (!pts.length || pts.length > 6000) {
    geo.userData.signBlades = empty;
    return empty;
  }
  const used = new Uint8Array(pts.length);
  const blades = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    const members = [];
    const stack = [i];
    used[i] = 1;
    while (stack.length) {
      const k = stack.pop();
      members.push(pts[k]);
      const [x, y, z] = pts[k];
      for (let j = 0; j < pts.length; j++) {
        if (used[j]) continue;
        const dx = pts[j][0] - x;
        const dy = pts[j][1] - y;
        const dz = pts[j][2] - z;
        if (dx * dx + dy * dy + dz * dz < 0.42 * 0.42) {
          used[j] = 1;
          stack.push(j);
        }
      }
    }
    if (members.length < 4) continue;
    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (const [x, y, z] of members) {
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    const dx = maxX - minX; const dy = maxY - minY; const dz = maxZ - minZ;
    const span = Math.max(dx, dz);
    const thin = Math.min(dx, dz);
    if (thin > 0.9 || dy > 1.6 || dy < 0.04 || span > 8 || span < 0.5) continue;
    blades.push({ minX, minY, minZ, maxX, maxY, maxZ, dx, dy, dz });
  }
  for (const blade of blades) {
    const pad = 0.12;
    const minX = blade.minX - pad; const maxX = blade.maxX + pad;
    const minY = blade.minY - pad; const maxY = blade.maxY + pad;
    const minZ = blade.minZ - pad; const maxZ = blade.maxZ + pad;
    for (let i = 0; i < col.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) continue;
      col.setXYZ(i, 0.42, 0.40, 0.38);
    }
  }
  if (blades.length) col.needsUpdate = true;
  geo.userData.signBlades = blades;
  return blades;
}

function faceTowardRoad(sign, parent, toward) {
  const parentQ = new THREE.Quaternion();
  parent.getWorldQuaternion(parentQ);
  const z = toward.clone().normalize();
  const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const worldQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  sign.quaternion.copy(parentQ.invert()).multiply(worldQ);
}

function coverStreetSigns(slots) {
  const mat = koreanSignMaterial();
  let placed = 0;
  for (const slot of slots) {
    for (const state of Object.values(slot.states)) {
      state.updateWorldMatrix(true, true);
      state.traverse((o) => {
        if (!o.isMesh || o.userData.koreanSign) return;
        const blades = greenBlades(o.geometry);
        if (!blades.length) return;
        o.userData.koreanSign = true;
        for (const blade of blades) {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.95), mat);
          sign.name = 'korean-road-sign';
          sign.position.set(
            (blade.minX + blade.maxX) / 2,
            (blade.minY + blade.maxY) / 2,
            (blade.minZ + blade.maxZ) / 2,
          );
          o.add(sign);
          o.updateWorldMatrix(true, true);
          const world = new THREE.Vector3();
          sign.getWorldPosition(world);
          if (world.y < 1.4 || world.y > 9) {
            o.remove(sign);
            continue;
          }
          const road = fromFrame(slot.along, 0);
          const toward = new THREE.Vector3(road.x - world.x, 0, road.z - world.z);
          if (toward.lengthSq() < 0.01) toward.set(0, 0, 1);
          toward.normalize();
          const local = toward.clone().transformDirection(new THREE.Matrix4().copy(o.matrixWorld).invert());
          sign.position.add(local.multiplyScalar(0.16));
          faceTowardRoad(sign, o, toward);
          placed += 1;
        }
      });
    }
  }
  console.info('[raid] road signs', placed);
}

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

const TRAFFIC = '/dungeon/env/traffic';
const KENNEY_CARS = ['police', 'firetruck', 'ambulance', 'taxi', 'sedan', 'suv', 'truck'];
const KENNEY_DEBRIS = [
  'debris-bolt', 'debris-bumper', 'debris-door', 'debris-door-window', 'debris-drivetrain',
  'debris-drivetrain-axle', 'debris-nut', 'debris-plate-a', 'debris-plate-b',
  'debris-plate-small-a', 'debris-plate-small-b', 'debris-spoiler-a', 'debris-spoiler-b', 'debris-tire',
];

function tuneTrafficMat(src, key) {
  const m = src.clone();
  m.side = THREE.FrontSide;
  if (m.metalness != null) m.metalness = Math.min(m.metalness, 0.22);
  if (m.roughness != null) m.roughness = Math.max(m.roughness, 0.58);
  if (key === 'brake' || key === 'head') {
    m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 2.1);
    if (!m.emissive || m.emissive.getHex() === 0) m.emissive = new THREE.Color(key === 'brake' ? '#ff4a32' : '#ffe2a8');
  }
  return m;
}

function matKey(mat, family) {
  if (family === 'kenney') return 'kenney';
  const name = (mat.name || '').toLowerCase();
  if (name.includes('brake')) return 'brake';
  if (name.includes('head')) return 'head';
  return 'atlas';
}

function slimGeometry(src) {
  const g = src.clone();
  g.morphAttributes = {};
  const keep = new Set(['position', 'normal', 'uv']);
  for (const k of Object.keys(g.attributes)) if (!keep.has(k)) g.deleteAttribute(k);
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  if (!flat.getAttribute('uv')) {
    const count = flat.getAttribute('position').count;
    flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return flat;
}

function trafficPlaces() {
  const places = [];
  let n = 0;
  for (const side of [-1, 1]) {
    for (let along = -16; along <= 52; along += 6.6) {
      if (side > 0 && along > 16 && along < 26) continue;
      if (side < 0 && along > 0 && along < 10) continue;
      const across = side * (4.2 + (n % 2) * 0.28);
      const yaw = PATH_YAW + (n % 4 === 0 ? Math.PI : 0) + ((n % 5) - 2) * 0.05;
      places.push({
        url: `${TRAFFIC}/kenney/${KENNEY_CARS[n % KENNEY_CARS.length]}.glb`,
        along, across, yaw, scale: 1.48, family: 'kenney',
      });
      n += 1;
    }
  }
  KENNEY_DEBRIS.forEach((name, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const tiny = /nut|bolt/.test(name);
    places.push({
      url: `${TRAFFIC}/kenney/${name}.glb`,
      along: -14 + (i % 7) * 8.4 + (i > 6 ? 2.4 : 0),
      across: side * (5.85 + (i % 3) * 0.22),
      yaw: PATH_YAW + i * 0.7,
      scale: tiny ? 1.7 : 1.15,
      family: 'kenney',
    });
    places.push({
      url: `${TRAFFIC}/kenney/${name}.glb`,
      along: -8 + (i % 7) * 7.1,
      across: side * -1 * (5.55 + (i % 2) * 0.3),
      yaw: PATH_YAW + i * 0.4,
      scale: tiny ? 1.5 : 1.05,
      family: 'kenney',
    });
  });
  const wrecks = [
    ['Vehicle_Sports.gltf', 38, 0.35, 0.1, 1],
    ['Vehicle_Pickup.gltf', 44.5, -1.55, 0.25, 1],
    ['Vehicle_Truck_Armored.gltf', 50, 1.15, Math.PI + 0.2, 1],
    ['Vehicle_Sports_Armored.gltf', -10, 0.15, 0.2, 1],
    ['Vehicle_Pickup_Armored.gltf', -5.2, -1.35, Math.PI * 0.92, 1],
    ['Vehicle_Truck.gltf', 33.5, 1.7, PATH_YAW + Math.PI, 1],
  ];
  for (const [file, along, across, yaw, scale] of wrecks) {
    places.push({ url: `${TRAFFIC}/quaternius/${file}`, along, across, yaw, scale, family: 'quaternius' });
  }
  const scatter = [
    ['Street_Straight_Crack1.gltf', 32, 0.2, PATH_YAW, 1],
    ['Street_Straight_Crack2.gltf', -6.5, -0.3, PATH_YAW, 1],
    ['Container_Red.gltf', 28, 8.4, PATH_YAW + 0.4, 1],
    ['Container_Green.gltf', 36, -8.6, PATH_YAW - 0.2, 1],
    ['TrafficLight_1.gltf', -2, 7.5, PATH_YAW, 1],
    ['TrafficLight_1.gltf', 34, -7.4, PATH_YAW + Math.PI, 1],
    ['Pallet.gltf', 27, 7.1, 0.4, 1],
    ['Pallet_Broken.gltf', 35, -7.2, 1.2, 1],
    ['Pallet.gltf', 47, 2.4, 0.6, 1],
    ['Pallet_Broken.gltf', 41, -2.8, 2.1, 1],
  ];
  for (const [file, along, across, yaw, scale] of scatter) {
    places.push({ url: `${TRAFFIC}/quaternius/${file}`, along, across, yaw, scale, family: 'quaternius' });
  }
  for (let i = 0; i < 10; i++) {
    const file = i % 2 === 0 ? 'TrafficCone_1.gltf' : 'TrafficCone_2.gltf';
    const cluster = i < 5 ? 7.4 : 31.2;
    places.push({
      url: `${TRAFFIC}/quaternius/${file}`,
      along: cluster + (i % 5) * 1.15,
      across: (i % 2 === 0 ? -1 : 1) * (2.15 + (i % 3) * 0.45),
      yaw: i,
      scale: 1,
      family: 'quaternius',
    });
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    places.push({
      url: `${TRAFFIC}/quaternius/CinderBlock.gltf`,
      along: -12 + i * 4.6,
      across: side * (6.15 + (i % 3) * 0.18),
      yaw: (i % 4) * 0.4,
      scale: 1,
      family: 'quaternius',
    });
  }
  return places;
}

async function addTraffic(gltfLoader, parent) {
  const places = trafficPlaces();
  const urls = [...new Set(places.map((p) => p.url))];
  const scenes = new Map();
  await Promise.all(urls.map(async (url) => {
    try {
      const gltf = await gltfLoader.loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      scenes.set(url, gltf.scene);
    } catch (err) {
      console.warn('[raid] traffic', url, err);
    }
  }));
  const buckets = new Map();
  let placed = 0;
  for (const place of places) {
    const scene = scenes.get(place.url);
    if (!scene) continue;
    const box = new THREE.Box3().setFromObject(scene);
    const lift = Number.isFinite(box.min.y) ? -box.min.y * place.scale + 0.04 : 0.04;
    const p = fromFrame(place.along, place.across);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, place.yaw, 0));
    const world = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, lift, p.z),
      q,
      new THREE.Vector3(place.scale, place.scale, place.scale),
    );
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const mats = [].concat(o.material);
      mats.forEach((mat, index) => {
        if (!mat) return;
        const key = matKey(mat, place.family);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { geos: [], mat: tuneTrafficMat(mat, key) };
          buckets.set(key, bucket);
        }
        const src = o.geometry;
        let part = src;
        if (mats.length > 1 && src.groups?.length && src.index) {
          const group = src.groups[index];
          if (!group) return;
          part = src.clone();
          const sliced = src.index.array.slice(group.start, group.start + group.count);
          const IndexArray = src.index.array.constructor;
          part.setIndex(new THREE.BufferAttribute(new IndexArray(sliced), 1));
          part.clearGroups();
        }
        const baked = slimGeometry(part);
        baked.applyMatrix4(o.matrixWorld);
        baked.applyMatrix4(world);
        bucket.geos.push(baked);
        if (part !== src) part.dispose();
      });
    });
    placed += 1;
  }
  const root = new THREE.Group();
  root.name = 'traffic-jam';
  let tris = 0;
  for (const bucket of buckets.values()) {
    if (!bucket.geos.length) continue;
    let geo = null;
    try {
      geo = mergeGeometries(bucket.geos, false);
    } catch (err) {
      console.warn('[raid] traffic merge', err);
    }
    bucket.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, bucket.mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
  }
  parent.add(root);
  const info = { placed, draws: root.children.length, tris: Math.round(tris) };
  console.info('[raid] traffic', info);
  return info;
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
  const fireAnchors = [];

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
        o.updateWorldMatrix(true, true);
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        fireAnchors.push({ x: wp.x, y: wp.y + 0.4, z: wp.z, size: 2.5, tint: '#e07038' });
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

  try { coverStreetSigns(slots); } catch (err) { console.warn('[raid] signs', err); }
  const v = new THREE.Vector3();
  for (const slot of slots) {
    if (slot.tier !== 'near') continue;
    const state = slot.states.damaged;
    state.updateWorldMatrix(true, true);
    const road = fromFrame(slot.along, 0);
    let best = null;
    state.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 24) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y < 5 || v.y > 14) continue;
        const d = (v.x - road.x) ** 2 + (v.z - road.z) ** 2;
        if (!best || d < best.d) best = { x: v.x, y: v.y, z: v.z, d };
      }
    });
    if (!best) continue;
    const len = Math.hypot(road.x - best.x, road.z - best.z) || 1;
    fireAnchors.push({
      x: best.x + ((road.x - best.x) / len) * 0.35,
      y: best.y,
      z: best.z + ((road.z - best.z) / len) * 0.35,
      size: 2.2,
      tint: '#d06830',
      light: false,
    });
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

  const traffic = await addTraffic(gltfLoader, root);

  function update(dt) {
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

  const obstacles = [];
  const markOb = (along, across, r) => {
    const p = fromFrame(along, across);
    obstacles.push({ x: p.x, z: p.z, r });
  };
  markOb(4, -2.6, 1.7);
  markOb(20, 3.1, 2.4);
  markOb(12, 2.4, 1.6);
  markOb(24, -1.8, 1.6);
  for (let along = -16; along <= 52; along += 6.6) {
    markOb(along, -4.3, 1.55);
    markOb(along, 4.3, 1.55);
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
    traffic,
    fireAnchors,
    obstacles,
  };
}
