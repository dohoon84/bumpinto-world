import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ALONG_MIN, ALONG_MAX, PATH_YAW, TANGENT, PERP, fromFrame, safePoint,
} from './layout.js';

function pathTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#1a2330';
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

function skyline(tex) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: '#141a24',
    map: tex,
    emissive: '#ffffff',
    emissiveMap: tex,
    emissiveIntensity: 0.85,
    roughness: 0.82,
    metalness: 0.1,
  });
  const n = 28;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
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
      uTop: { value: new THREE.Color('#16082a') },
      uMid: { value: new THREE.Color('#14505c') },
      uBot: { value: new THREE.Color('#3a1868') },
      uFlash: { value: 0 },
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
      uniform vec3 uTop, uMid, uBot;
      uniform float uFlash;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = mix(uBot, uMid, smoothstep(-0.15, 0.35, h));
        c = mix(c, uTop, smoothstep(0.15, 0.9, h));
        float band = smoothstep(0.05, 0.2, h) * (1.0 - smoothstep(0.25, 0.55, h));
        c += vec3(0.45, 0.15, 0.55) * band * 0.35;
        c += vec3(0.65, 0.45, 0.85) * uFlash;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), skyMat);
  scene.add(sky);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({
      color: '#0c3c46',
      emissive: '#0e4a52',
      emissiveIntensity: 0.45,
      roughness: 0.18,
      metalness: 0.55,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.25;
  water.receiveShadow = true;
  root.add(water);

  const path = new THREE.Mesh(
    ribbonGeo(ALONG_MIN - 4, ALONG_MAX + 10, 8, 0),
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: pathTex(),
      roughness: 0.32,
      metalness: 0.42,
    }),
  );
  path.receiveShadow = true;
  path.name = 'bike-path';
  root.add(path);

  const rails = new THREE.Mesh(railGeo(), new THREE.MeshStandardMaterial({ color: '#8b949e', metalness: 0.7, roughness: 0.35 }));
  rails.castShadow = false;
  root.add(rails);

  const neon = new THREE.Mesh(neonGeo(), new THREE.MeshBasicMaterial({ color: '#3ee0d2' }));
  root.add(neon);
  const neonMag = neon.clone();
  neonMag.material = new THREE.MeshBasicMaterial({ color: '#e15cff' });
  neonMag.position.y = 0.18;
  root.add(neonMag);

  root.add(skyline(windowTex()));
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

  const hemi = new THREE.HemisphereLight('#6e4d92', '#14343c', 0.62);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight('#d5e4ff', 0.9);
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
  const warm = new THREE.PointLight('#ffb15a', 8, 40, 2);
  const far = fromFrame(40, 8);
  warm.position.set(far.x, 6, far.z);
  scene.add(warm);

  const rift = {
    top: new THREE.Color('#16082a'),
    mid: new THREE.Color('#14505c'),
    bot: new THREE.Color('#3a1868'),
    fog: new THREE.Color('#1a2744'),
    hemiSky: new THREE.Color('#6e4d92'),
    hemiGround: new THREE.Color('#14343c'),
    dir: new THREE.Color('#d5e4ff'),
    water: new THREE.Color('#0c3c46'),
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
  let flash = 0;
  let boltIn = 4 + Math.random() * 4;
  let rainOn = true;
  let safePulse = 0;

  scene.fog = new THREE.Fog(rift.fog.clone(), 26, 100);
  scene.background = null;

  function mixToward(target, dt) {
    const k = 1 - Math.exp(-dt * 1.4);
    for (const key of Object.keys(cur)) cur[key].lerp(target[key], k);
    skyMat.uniforms.uTop.value.copy(cur.top);
    skyMat.uniforms.uMid.value.copy(cur.mid);
    skyMat.uniforms.uBot.value.copy(cur.bot);
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
    setMood(next) {
      mood = next;
      moodT = 0;
    },
    setRain(on) { rainOn = on; rain.visible = on; },
    setSafeHot(on) { safePulse = on ? 1 : 0; },
    update(dt, focus) {
      moodT = Math.min(1, moodT + dt);
      mixToward(mood === 'peace' ? peace : rift, dt);
      if (mood === 'peace') {
        scene.fog.near = 40;
        scene.fog.far = 160;
        hemi.intensity = 0.85;
        dir.intensity = 1.15;
        warm.intensity = 4;
      } else {
        scene.fog.near = 24;
        scene.fog.far = 98;
        hemi.intensity = 0.62;
        dir.intensity = 0.9;
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
      neon.material.color.set(mood === 'peace' ? '#8fb8c4' : '#3ee0d2');
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
