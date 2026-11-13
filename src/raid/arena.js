import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ALONG_MIN, ALONG_MAX, PATH_YAW, TANGENT, PERP, fromFrame, safePoint, bossPoint, BOSS_ALONG,
} from './layout.js';
import { LIGHTING, facadeMaterials, aimKeyAndRim } from './lighting.js';

function pathTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = LIGHTING.pathBase;
  g.fillRect(0, 0, 256, 1024);
  g.strokeStyle = 'rgba(180, 200, 210, 0.18)';
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.moveTo(20 + (i * 37) % 200, i * 28);
    g.lineTo(80 + (i * 53) % 160, i * 28 + 40);
    g.stroke();
  }
  g.strokeStyle = '#f0c14a';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(18, 0);
  g.lineTo(18, 1024);
  g.moveTo(238, 0);
  g.lineTo(238, 1024);
  g.stroke();
  g.strokeStyle = '#e8eef2';
  g.lineWidth = 6;
  g.setLineDash([36, 28]);
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 1024);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function windowTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#10151e';
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 122; y += 14) {
    for (let x = 6; x < 58; x += 12) {
      if (Math.random() < 0.42) continue;
      const roll = Math.random();
      g.fillStyle = roll > 0.72 ? '#ffb15a' : roll > 0.4 ? '#3ad0d4' : '#d16bff';
      g.globalAlpha = 0.35 + Math.random() * 0.65;
      g.fillRect(x, y, 6, 8);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function ribbonGeo(along0, along1, halfAcross, y) {
  const step = 2.2;
  const pos = [];
  const uv = [];
  const idx = [];
  const zs = [];
  for (let a = along0; a <= along1 + 0.01; a += step) zs.push(a);
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i];
    const l = fromFrame(a, -halfAcross);
    const r = fromFrame(a, halfAcross);
    pos.push(l.x, y, l.z, r.x, y, r.z);
    const v = (a - along0) / 8;
    uv.push(0, v, 1, v);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function railGeo() {
  const geos = [];
  const post = new THREE.BoxGeometry(0.12, 1.05, 0.12);
  const bar = new THREE.BoxGeometry(2.3, 0.06, 0.06);
  for (const side of [-1, 1]) {
    for (let a = ALONG_MIN - 2; a <= ALONG_MAX + 6; a += 2.2) {
      const p = fromFrame(a, side * 7.15);
      const yaw = PATH_YAW;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.52, p.z), q, new THREE.Vector3(1, 1, 1));
      const g = post.clone();
      g.applyMatrix4(m);
      geos.push(g);
      const b = bar.clone();
      const pb = fromFrame(a + 1.05, side * 7.15);
      const mb = new THREE.Matrix4().compose(new THREE.Vector3(pb.x, 0.92, pb.z), q, new THREE.Vector3(1, 1, 1));
      b.applyMatrix4(mb);
      geos.push(b);
    }
  }
  post.dispose();
  bar.dispose();
  return mergeGeometries(geos, false);
}

function neonGeo() {
  const geos = [];
  const box = new THREE.BoxGeometry(2.15, 0.045, 0.045);
  let i = 0;
  for (const side of [-1, 1]) {
    for (let a = ALONG_MIN; a <= ALONG_MAX + 4; a += 2.2) {
      const p = fromFrame(a + 1.05, side * 7.15);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PATH_YAW, 0));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.72, p.z), q, new THREE.Vector3(1, 1, 1));
      const g = box.clone();
      g.applyMatrix4(m);
      geos.push(g);
      i += 1;
    }
  }
  box.dispose();
  return mergeGeometries(geos, false);
}

function dressBattlefield(scene) {
  const smokeMap = new THREE.TextureLoader().load('/dungeon/vfx/flipbooks/smoke_puff_4x4.png?v=v41fx');
  smokeMap.colorSpace = THREE.SRGBColorSpace;
  smokeMap.repeat.set(0.25, 0.25);
  smokeMap.offset.set(0.25, 0.5);
  const fireMap = new THREE.TextureLoader().load('/dungeon/vfx/particles/fireball_orb.png?v=v41fx');
  fireMap.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeMap, transparent: true, depthWrite: false, opacity: 0.72, color: '#5c463c',
    }));
    const p = fromFrame(BOSS_ALONG + (i - 1.5) * 8, i % 2 ? 18 : -18);
    s.position.set(p.x, 10, p.z);
    s.scale.set(10, 22, 1);
    scene.add(s);
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({
      map: fireMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    fire.position.set(p.x, 2.2, p.z);
    fire.scale.set(4, 5.5, 1);
    scene.add(fire);
  }
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#d7e7ff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 28, 8, 1, true), beamMat);
    const p = fromFrame(BOSS_ALONG + 6, (i - 1) * 22);
    beam.position.set(p.x, 16, p.z);
    beam.rotation.x = Math.PI;
    scene.add(beam);
  }
  const rubble = new THREE.MeshStandardMaterial({ color: '#6e6560', roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.7), rubble);
    const p = fromFrame(BOSS_ALONG - 16 + i * 3, i % 2 ? 4.2 : -4.2);
    rock.position.set(p.x, 0.2, p.z);
    rock.rotation.y = i * 0.7;
    scene.add(rock);
  }
}

function skyline() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = 28;
  const mesh = new THREE.InstancedMesh(geo, facadeMaterials(), n);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let k = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n / 2; i++) {
      const along = -24 + i * 6.2;
      const across = side * (22 + (i % 3) * 4);
      const p = fromFrame(along, across);
      const h = 8 + (i * 5) % 18;
      const w = 4 + (i % 4);
      m.compose(new THREE.Vector3(p.x, -1.2 + h / 2, p.z), q, new THREE.Vector3(w, h, w * 0.7));
      mesh.setMatrixAt(k, m);
      k += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = k;
  return mesh;
}

function bridgeGeo() {
  const parts = [];
  const deck = new THREE.BoxGeometry(16, 1.2, 5);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PATH_YAW, 0));
  const p = fromFrame(46, 0);
  deck.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 3.2, p.z), q, new THREE.Vector3(1, 1, 1)));
  parts.push(deck);
  for (const side of [-1, 1]) {
    const pier = new THREE.BoxGeometry(1.1, 4.2, 1.1);
    const pp = fromFrame(46, side * 5);
    pier.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(pp.x, 1.2, pp.z), q, new THREE.Vector3(1, 1, 1)));
    parts.push(pier);
  }
  return mergeGeometries(parts, false);
}

function makeRain(count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 36;
    pos[i * 3 + 1] = Math.random() * 18;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#d7ecff', size: 0.12, transparent: true, opacity: 0.7, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.home = pos;
  return pts;
}

export function createArena(scene) {
  const root = new THREE.Group();
  root.name = 'tancheon-rift';
  scene.add(root);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uZenith: { value: new THREE.Color(LIGHTING.skyTop) },
      uMid: { value: new THREE.Color(LIGHTING.skyMid) },
      uHorizon: { value: new THREE.Color(LIGHTING.skyHorizon) },
      uFlash: { value: 0 },
      uRift: { value: 0.35 },
      uRiftI: { value: 2.5 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uZenith, uMid, uHorizon;
      uniform float uFlash, uRift, uRiftI, uTime;
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(-0.05, 0.38, h));
        c = mix(c, uZenith, smoothstep(0.28, 0.85, h));
        float ang = atan(dir.z, dir.x);
        float jag = sin(ang * 9.0 + uTime * 0.6) * 0.04 + sin(ang * 23.0 - uTime * 1.3) * 0.02;
        float band = abs(ang - 0.15 - jag);
        float crack = (1.0 - smoothstep(0.012, 0.02 + uRift * 0.28, band));
        crack *= smoothstep(0.08, 0.28, h) * (1.0 - smoothstep(0.62, 0.92, h));
        float pulse = 0.85 + 0.15 * sin(uTime * (uRift > 0.7 ? 5.0 : 1.6));
        c += vec3(1.0, 0.42, 0.12) * crack * uRiftI * 0.22 * pulse;
        c += vec3(1.0, 0.85, 0.6) * crack * crack * 0.35;
        c += vec3(0.7, 0.25, 0.15) * uFlash;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(780, 28, 18), skyMat);
  scene.add(sky);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({
      color: LIGHTING.water,
      emissive: LIGHTING.waterEmissive,
      emissiveIntensity: 1,
      roughness: 0.35,
      metalness: 0.2,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.25;
  water.receiveShadow = true;
  root.add(water);

  const path = new THREE.Mesh(
    ribbonGeo(ALONG_MIN - 4, ALONG_MAX + 10, 8, 0),
    new THREE.MeshStandardMaterial({
      color: LIGHTING.pathTint,
      map: pathTex(),
      roughness: LIGHTING.pathRough,
      metalness: LIGHTING.pathMetal,
    }),
  );
  path.receiveShadow = true;
  path.name = 'bike-path';
  root.add(path);

  const rails = new THREE.Mesh(railGeo(), new THREE.MeshStandardMaterial({ color: '#8b949e', metalness: 0.25, roughness: 0.55 }));
  rails.castShadow = false;
  root.add(rails);

  const neon = new THREE.Mesh(neonGeo(), new THREE.MeshBasicMaterial({ color: LIGHTING.railLight }));
  root.add(neon);
  const neonMag = neon.clone();
  neonMag.material = new THREE.MeshBasicMaterial({ color: '#e15cff' });
  neonMag.position.y = 0.18;
  neonMag.visible = false;
  root.add(neonMag);

  root.add(skyline());
  const bridge = new THREE.Mesh(bridgeGeo(), new THREE.MeshStandardMaterial({ color: '#2a3340', metalness: 0.4, roughness: 0.6 }));
  root.add(bridge);

  const safe = safePoint();
  const safeRing = new THREE.Mesh(
    new THREE.TorusGeometry(safe.r, 0.12, 8, 48),
    new THREE.MeshBasicMaterial({ color: '#ffe14a' }),
  );
  safeRing.rotation.x = Math.PI / 2;
  safeRing.position.set(safe.x, 0.08, safe.z);
  root.add(safeRing);
  const safeFill = new THREE.Mesh(
    new THREE.CircleGeometry(safe.r - 0.2, 40),
    new THREE.MeshStandardMaterial({ color: '#6a5420', transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }),
  );
  safeFill.rotation.x = -Math.PI / 2;
  safeFill.position.set(safe.x, 0.06, safe.z);
  root.add(safeFill);

  const rain = makeRain(1400);
  scene.add(rain);

  const bossAt = bossPoint();
  const portal = new THREE.Group();
  const portalRing = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.28, 8, 40),
    new THREE.MeshBasicMaterial({ color: '#ff5ca8', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  const portalDisc = new THREE.Mesh(
    new THREE.CircleGeometry(7.1, 40),
    new THREE.MeshBasicMaterial({ color: '#2a0840', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  portal.add(portalRing, portalDisc);
  portal.position.set(bossAt.x, 16, bossAt.z);
  portal.rotation.x = Math.PI / 2.4;
  portal.visible = false;
  scene.add(portal);
  const riftLight = new THREE.PointLight(LIGHTING.riftColor, LIGHTING.riftI, 70, 2);
  riftLight.position.set(bossAt.x, 12, bossAt.z);
  scene.add(riftLight);

  const pillars = [];
  dressBattlefield(scene);
  const cracks = [];
  for (let i = 0; i < 5; i++) {
    const p = fromFrame(16 + i * 2.2, (i - 2) * 1.1);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.16),
      new THREE.MeshBasicMaterial({ color: '#ffb089', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = i * 0.4;
    mesh.position.set(p.x, 0.09, p.z);
    cracks.push(mesh);
    root.add(mesh);
  }
  const ashCount = 360;
  const ashArr = new Float32Array(ashCount * 3);
  for (let i = 0; i < ashCount; i++) {
    ashArr[i * 3] = (Math.random() - 0.5) * 40;
    ashArr[i * 3 + 1] = Math.random() * 12;
    ashArr[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashArr, 3));
  const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({
    color: '#ffc2a8', size: 0.14, transparent: true, opacity: 0, depthWrite: false,
  }));
  ash.frustumCulled = false;
  scene.add(ash);

  const hemi = new THREE.HemisphereLight(LIGHTING.hemiSky, LIGHTING.hemiGround, LIGHTING.hemiI);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(LIGHTING.keyColor, LIGHTING.keyI);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 2;
  dir.shadow.camera.far = 80;
  dir.shadow.camera.left = -24;
  dir.shadow.camera.right = 24;
  dir.shadow.camera.top = 24;
  dir.shadow.camera.bottom = -24;
  dir.shadow.bias = -0.00035;
  scene.add(dir);
  scene.add(dir.target);
  const rim = new THREE.DirectionalLight(LIGHTING.rimColor, LIGHTING.rimI);
  scene.add(rim);
  scene.add(rim.target);
  const warm = new THREE.PointLight(LIGHTING.warmColor, LIGHTING.warmI, 40, 2);
  const far = fromFrame(40, 8);
  warm.position.set(far.x, 6, far.z);
  scene.add(warm);

  const rift = {
    top: new THREE.Color('#14040e'),
    mid: new THREE.Color('#5a1848'),
    bot: new THREE.Color('#3a0c18'),
    fog: new THREE.Color('#2a1024'),
    hemiSky: new THREE.Color('#6a3058'),
    hemiGround: new THREE.Color('#1a1020'),
    dir: new THREE.Color('#e7c4ff'),
    water: new THREE.Color('#1a2438'),
  };
  const peace = {
    top: new THREE.Color('#2a4470'),
    mid: new THREE.Color('#f0b27a'),
    bot: new THREE.Color('#f6d7b0'),
    fog: new THREE.Color('#f3d2b0'),
    hemiSky: new THREE.Color('#ffd7b0'),
    hemiGround: new THREE.Color('#6d8a62'),
    dir: new THREE.Color('#ffe0b8'),
    water: new THREE.Color('#2f6f86'),
  };
  const cur = {
    top: rift.top.clone(),
    mid: rift.mid.clone(),
    bot: rift.bot.clone(),
    fog: rift.fog.clone(),
    hemiSky: rift.hemiSky.clone(),
    hemiGround: rift.hemiGround.clone(),
    dir: rift.dir.clone(),
    water: rift.water.clone(),
  };

  let mood = 'rift';
  let moodT = 1;
  let riftAmt = 1;
  let flash = 0;
  let boltIn = 4 + Math.random() * 4;
  let rainOn = true;
  let safePulse = 0;

  scene.fog = new THREE.Fog(rift.fog.clone(), 55, 450);
  const envPhase = {
    peace: { zenith: '#0E1430', horizon: '#2B2F5A', fog: '#1A1F3A', near: 80, far: 600, rift: 0, glow: 0 },
    crack: { zenith: '#1A1232', horizon: '#5A1F3A', fog: '#2A1A34', near: 70, far: 550, rift: 0.05, glow: 1.5 },
    sortie: { zenith: '#2A0F28', horizon: '#7A2230', fog: '#3A1A26', near: 60, far: 500, rift: 0.15, glow: 2 },
    p1: { zenith: '#3A0E1E', horizon: '#9A2A22', fog: '#4A1E1E', near: 55, far: 450, rift: 0.35, glow: 2.5 },
    p2: { zenith: '#4A0A12', horizon: '#C0381A', fog: '#5A2014', near: 45, far: 400, rift: 0.6, glow: 3.5 },
    p3: { zenith: '#5A0E10', horizon: '#E04A12', fog: '#6A2410', near: 35, far: 320, rift: 0.8, glow: 5 },
    kill: { zenith: '#3A1030', horizon: '#A04040', fog: '#3A1A2A', near: 60, far: 480, rift: 0.2, glow: 1.2 },
    dawn: { zenith: '#6A9ADA', horizon: '#FFB8A0', fog: '#E8C8C8', near: 120, far: 900, rift: 0, glow: 0 },
  };
  const zenith = new THREE.Color('#3A0E1E');
  const horizon = new THREE.Color('#9A2A22');
  let phaseKey = 'p1';
  let riftSize = 0.35;
  let riftGlow = 2.5;
  let fogNear = 55;
  let fogFar = 450;
  scene.background = null;

  function mixToward(target, dt) {
    const k = 1 - Math.exp(-dt * 1.4);
    for (const key of Object.keys(cur)) cur[key].lerp(target[key], k);
    skyMat.uniforms.uZenith.value.copy(zenith);
    skyMat.uniforms.uHorizon.value.copy(horizon);
    scene.fog.color.copy(cur.fog);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    dir.color.copy(cur.dir);
    water.material.color.copy(cur.water);
    water.material.emissive.copy(cur.water);
  }

  return {
    root,
    sky,
    safeRing,
    safeFill,
    setMood(next, immediate) {
      mood = next;
      moodT = immediate ? 1 : 0;
      if (next === 'peace') {
        if (phaseKey !== 'dawn') phaseKey = 'peace';
      } else if (phaseKey === 'peace' || phaseKey === 'dawn') phaseKey = 'p1';
      if (immediate) {
        mixToward(next === 'peace' ? peace : rift, 8);
        riftAmt = next === 'peace' ? 0 : 1;
        const spec = envPhase[phaseKey];
        zenith.set(spec.zenith);
        horizon.set(spec.horizon);
        riftSize = spec.rift;
        riftGlow = spec.glow;
        fogNear = spec.near;
        fogFar = spec.far;
      }
    },
    setPhase(name, immediate) {
      if (!envPhase[name]) return;
      phaseKey = name;
      mood = name === 'peace' || name === 'dawn' ? 'peace' : 'rift';
      moodT = immediate ? 1 : 0;
      if (!immediate) return;
      const spec = envPhase[name];
      zenith.set(spec.zenith);
      horizon.set(spec.horizon);
      riftSize = spec.rift;
      riftGlow = spec.glow;
      fogNear = spec.near;
      fogFar = spec.far;
      riftAmt = mood === 'peace' ? 0 : 1;
    },
    setRain(on) { rainOn = on; rain.visible = on; },
    setSafeHot(on) { safePulse = on ? 1 : 0; },
    update(dt, focus) {
      moodT = Math.min(1, moodT + dt);
      const goal = mood === 'peace' ? 0 : 1;
      riftAmt += (goal - riftAmt) * (1 - Math.exp(-dt * 1.15));
      mixToward(mood === 'peace' ? peace : rift, dt);
      const spec = envPhase[phaseKey] || envPhase.p1;
      const k = 1 - Math.exp(-dt * 0.8);
      zenith.lerp(new THREE.Color(spec.zenith), k);
      horizon.lerp(new THREE.Color(spec.horizon), k);
      riftSize += (spec.rift - riftSize) * k;
      riftGlow += (spec.glow - riftGlow) * k;
      fogNear += (spec.near - fogNear) * k;
      fogFar += (spec.far - fogFar) * k;
      skyMat.uniforms.uRift.value = riftSize;
      skyMat.uniforms.uRiftI.value = riftGlow;
      skyMat.uniforms.uTime.value += dt;
      if (mood === 'peace') scene.fog.color.lerp(new THREE.Color(spec.fog), k);
      portal.visible = false;
      portalRing.material.opacity = riftAmt * 0.9;
      portalDisc.material.opacity = riftAmt * 0.4;
      portal.rotation.z += dt * 0.35;
      riftLight.color.set(LIGHTING.riftColor);
      riftLight.intensity = mood === 'peace' ? 0 : LIGHTING.riftI;
      pillars.forEach((mesh) => {
        mesh.visible = riftAmt > 0.08;
        mesh.material.emissive.set(LIGHTING.pillar);
        mesh.material.emissiveIntensity = riftAmt > 0.08 ? 0.9 : 0;
      });
      cracks.forEach((mesh) => {
        mesh.visible = riftAmt > 0.08;
        mesh.material.opacity = riftAmt * 0.85;
      });
      const ashGoal = phaseKey === 'p3' ? 0.9 : phaseKey === 'p2' ? 0.62 : phaseKey === 'p1' ? 0.4 : riftAmt * 0.2;
      ash.material.opacity = ashGoal;
      if (focus && riftAmt > 0.02) {
        const arr = ash.geometry.attributes.position.array;
        for (let i = 0; i < ashCount; i++) {
          arr[i * 3 + 1] += dt * (0.4 + (i % 5) * 0.15);
          arr[i * 3] += Math.sin(i + performance.now() * 0.001) * dt * 0.4;
          if (arr[i * 3 + 1] > 14) arr[i * 3 + 1] = 0.2;
        }
        ash.geometry.attributes.position.needsUpdate = true;
        ash.position.set(focus.x, 0, focus.z);
        portal.position.x = bossAt.x + (focus.x - bossAt.x) * 0.15;
        portal.position.z = bossAt.z + (focus.z - bossAt.z) * 0.15;
        riftLight.position.x = portal.position.x;
        riftLight.position.z = portal.position.z;
      }
      if (mood === 'peace') {
        scene.fog.near = fogNear;
        scene.fog.far = fogFar;
        hemi.intensity = phaseKey === 'dawn' ? 0.8 : 0.55;
        dir.intensity = phaseKey === 'dawn' ? 1.15 : 0.7;
        warm.intensity = 4;
        rim.intensity = 0.2;
      } else {
        skyMat.uniforms.uZenith.value.set(LIGHTING.skyTop);
        skyMat.uniforms.uMid.value.set(LIGHTING.skyMid);
        skyMat.uniforms.uHorizon.value.set(LIGHTING.skyHorizon);
        scene.fog.color.set(LIGHTING.fog);
        scene.fog.near = LIGHTING.fogNear;
        scene.fog.far = LIGHTING.fogFar;
        hemi.color.set(LIGHTING.hemiSky);
        hemi.groundColor.set(LIGHTING.hemiGround);
        hemi.intensity = LIGHTING.hemiI;
        dir.color.set(LIGHTING.keyColor);
        dir.intensity = LIGHTING.keyI;
        warm.color.set(LIGHTING.warmColor);
        warm.intensity = LIGHTING.warmI;
        if (focus) aimKeyAndRim(dir, rim, focus, bossPoint());
      }
      if (rainOn) {
        boltIn -= dt;
        if (boltIn <= 0) {
          flash = 1;
          boltIn = 6 + Math.random() * 5;
        }
      }
      flash = Math.max(0, flash - dt * 3.5);
      skyMat.uniforms.uFlash.value = flash;
      const pulse = 0.55 + Math.sin(performance.now() * 0.004) * 0.2 + safePulse * 0.6;
      safeRing.scale.setScalar(1);
      safeFill.material.opacity = 0.16 + safePulse * 0.14;
      safeRing.material.color.set(safePulse ? '#fff1a8' : '#ffe14a');
      neon.material.color.set(mood === 'peace' ? '#8fb8c4' : LIGHTING.railLight);
      if (rainOn) rain.material.opacity = LIGHTING.rainOpacity;
      if (focus) {
        sky.position.set(focus.x, 0, focus.z);
        dir.target.position.set(focus.x, 0, focus.z);
        dir.position.set(focus.x - 16, 26, focus.z - 8);
        if (rainOn) {
          const arr = rain.geometry.attributes.position.array;
          rain.position.set(focus.x, 0, focus.z);
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] -= dt * 16;
            if (arr[i + 1] < 0) arr[i + 1] = 16 + Math.random() * 2;
          }
          rain.geometry.attributes.position.needsUpdate = true;
        }
      }
      void pulse;
    },
  };
}
