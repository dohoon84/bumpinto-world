// 탄천합수부 OSM 을 레이드 원점(스폰)으로 옮겨, 가벼운 저폴리로 무너지는 도시로 깐다.
// 가까운 건물은 발자국을 압출해 한 메시로 합치고, 먼 동은 인스턴스 박스다.
import * as THREE from 'three';

const OX = -3685.8;
const OZ = -16796.5;

function centroid(ring) {
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p[0];
    z += p[1];
  }
  return { x: x / ring.length - OX, z: z / ring.length - OZ };
}

function extrude(ring, h) {
  const shape = new THREE.Shape();
  ring.forEach((p, i) => {
    const x = p[0] - OX;
    const z = p[1] - OZ;
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(4, h), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function buildingMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStage: { value: 0 },
      uMood: { value: 0 },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      varying vec3 vW;
      uniform float uTime;
      uniform float uStage;
      uniform float uMood;
      void main() {
        float up = abs(vN.y);
        vec3 wall = vec3(0.16, 0.18, 0.22);
        vec3 roof = vec3(0.10, 0.11, 0.13);
        vec3 c = mix(wall, roof, smoothstep(0.45, 0.8, up));
        float cell = fract(sin(dot(floor(vW.xz * 0.35 + vW.y * 0.2), vec2(127.1, 311.7))) * 43758.5);
        float window = step(0.58, cell) * (1.0 - smoothstep(0.55, 0.85, up));
        float flick = step(0.42, fract(cell * 13.0 + uTime * (0.35 + uStage * 0.25)));
        float dark = clamp(uStage / 3.0, 0.0, 1.0);
        float lit = window * flick * (1.0 - dark * 0.82) * uMood;
        c += vec3(1.0, 0.55, 0.22) * lit;
        c *= mix(1.0, 0.55, uMood * dark * 0.35);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

function fireTex() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 18, 2, 16, 16, 15);
  grd.addColorStop(0, 'rgba(255,236,180,1)');
  grd.addColorStop(0.35, 'rgba(255,120,30,0.85)');
  grd.addColorStop(1, 'rgba(80,10,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createCity(scene) {
  const root = new THREE.Group();
  root.name = 'tancheon-city';
  scene.add(root);
  const mat = buildingMat();
  const fires = [];
  const smokes = [];
  const lamps = [];
  let osmRoads = null;
  let stage = 0;
  let mood = 0;

  try {
    const res = await fetch('/corridor/hangang/hap-osm.json');
    if (!res.ok) throw new Error(res.status);
    const osm = await res.json();
    const near = [];
    const far = [];
    for (const b of osm.buildings || []) {
      if (!b.o || b.o.length < 4 || b.o.length > 16) continue;
      const c = centroid(b.o);
      const d = Math.hypot(c.x, c.z);
      const h = Math.min(b.h || 12, 90);
      if (d < 28 || d > 820) continue;
      const row = { b, c, d, h };
      if (d < 380) near.push(row);
      else far.push(row);
    }
    near.sort((a, b) => a.d - b.d);
    const geos = [];
    for (const row of near.slice(0, 90)) {
      try {
        geos.push(extrude(row.b.o, row.h));
      } catch {
        /* 꼬인 폴리곤은 건너뛴다 */
      }
    }
    if (geos.length) {
      const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        root.add(mesh);
      }
    }

    const box = new THREE.BoxGeometry(1, 1, 1);
    const farMat = new THREE.MeshBasicMaterial({ color: '#1a2030' });
    const skyline = new THREE.InstancedMesh(box, farMat, Math.min(70, far.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    far.sort((a, b) => b.h - a.h);
    const n = Math.min(70, far.length);
    for (let i = 0; i < n; i++) {
      const row = far[i];
      const tilt = i % 11 === 0 ? 0.18 : 0;
      q.setFromEuler(new THREE.Euler(0, 0, tilt));
      m.compose(
        new THREE.Vector3(row.c.x, row.h * 0.5 - (tilt ? 6 : 0), row.c.z),
        q,
        new THREE.Vector3(14 + (i % 5) * 3, row.h, 12),
      );
      skyline.setMatrixAt(i, m);
    }
    skyline.count = n;
    root.add(skyline);

    const ruinMat = new THREE.MeshBasicMaterial({ color: '#2a140e' });
    near.slice(0, 8).forEach((row, i) => {
      if (i % 2) return;
      const ruin = new THREE.Mesh(new THREE.BoxGeometry(8, row.h * 0.45, 6), ruinMat);
      ruin.position.set(row.c.x + 6, row.h * 0.15, row.c.z);
      ruin.rotation.z = 0.7;
      root.add(ruin);
    });

    osmRoads = osm;
  } catch (err) {
    console.warn('[raid] city osm', err);
  }

  const smokeCount = 280;
  const smokeArr = new Float32Array(smokeCount * 3);
  for (let i = 0; i < smokeCount; i++) {
    smokeArr[i * 3] = (Math.random() - 0.5) * 220;
    smokeArr[i * 3 + 1] = Math.random() * 40;
    smokeArr[i * 3 + 2] = (Math.random() - 0.5) * 220;
  }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokeArr, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
    color: '#6a5348', size: 1.4, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
  }));
  smoke.frustumCulled = false;
  root.add(smoke);
  smokes.push(smoke);

  const tex = fireTex();
  const fireMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(fireMat.clone());
    s.position.set(-40 - i * 14, 1.6, 18 + (i % 3) * 8);
    s.scale.set(3.2, 4.4, 1);
    s.visible = false;
    root.add(s);
    fires.push(s);
  }
  if (osmRoads) placeStreets(root, osmRoads, fires, lamps);

  const beamMat = new THREE.MeshBasicMaterial({
    color: '#d7e7ff', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide,
  });
  const beams = [];
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(7, 46, 6, 1, true), beamMat.clone());
    beam.position.set(-70 - i * 28, 28, 40 + i * 16);
    beam.rotation.x = Math.PI;
    root.add(beam);
    beams.push(beam);
  }
  const flashers = [];
  for (const color of ['#ff3b30', '#3d7fe0', '#ff9f1a']) {
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    f.position.set(-24 - flashers.length * 9, 2.2, 12);
    root.add(f);
    flashers.push(f);
  }

  function applyStage(next) {
    stage = next;
    mat.uniforms.uStage.value = next;
    const show = mood > 0.2 ? Math.min(fires.length, next === 0 ? 0 : 2 + next * 2) : 0;
    fires.forEach((s, i) => { s.visible = i < show; });
    smoke.material.opacity = mood * (0.12 + next * 0.12);
  }

  return {
    root,
    yaw: -1.05,
    setMood(next) { mood = next === 'peace' ? 0 : 1; mat.uniforms.uMood.value = mood; applyStage(stage); },
    setStage(next) { applyStage(next); },
    update(dt) {
      mat.uniforms.uTime.value += dt;
      beams.forEach((b, i) => {
        b.rotation.z = Math.sin(performance.now() * 0.0004 + i) * 0.45;
        b.material.opacity = mood * (0.05 + (stage > 0 ? 0.08 : 0));
      });
      flashers.forEach((f, i) => {
        const on = mood > 0.4 && Math.sin(performance.now() * 0.01 + i * 2) > (stage >= 2 ? -0.2 : 0.35);
        f.material.color.set(on ? f.userData.base || '#ff3b30' : '#14080a');
        f.scale.setScalar(on ? 1.4 : 0.6);
      });
      if (!flashers[0].userData.base) {
        flashers[0].userData.base = '#ff3b30';
        flashers[1].userData.base = '#3d7fe0';
        flashers[2].userData.base = '#ff9f1a';
      }
      fires.forEach((s, i) => {
        if (!s.visible) return;
        const w = 2.6 + Math.sin(performance.now() * 0.01 + i) * 0.6;
        s.scale.set(w, w * 1.4, 1);
        s.material.opacity = 0.75 + stage * 0.08;
      });
      lamps.forEach((lamp) => {
        const head = lamp.userData.head;
        if (!head) return;
        const dead = stage >= 1 && ((lamp.userData.i + Math.floor(mat.uniforms.uTime.value * (1 + stage))) % 5 === 0);
        head.material.color.set(dead || mood < 0.3 ? '#1a140c' : '#ffd7a8');
      });
      const arr = smoke.geometry.attributes.position.array;
      for (let i = 0; i < smokeCount; i++) {
        arr[i * 3 + 1] += dt * (1.2 + (i % 4) * 0.3);
        if (arr[i * 3 + 1] > 48) arr[i * 3 + 1] = 2;
      }
      smoke.geometry.attributes.position.needsUpdate = true;
    },
  };
}

function placeStreets(root, osm, fires, lamps) {
  const geos = [];
  const crackGeos = [];
  const pts = [];
  let kept = 0;
  for (const w of osm.ways || []) {
    if (!w.pts || w.pts.length < 2) continue;
    if (!['cycleway', 'residential', 'service', 'path', 'footway', 'pedestrian'].includes(w.k)) continue;
    for (let i = 1; i < w.pts.length && kept < 48; i++) {
      const ax = w.pts[i - 1][0] - OX;
      const az = w.pts[i - 1][1] - OZ;
      const bx = w.pts[i][0] - OX;
      const bz = w.pts[i][1] - OZ;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (Math.hypot(mx, mz) > 210 || Math.hypot(mx, mz) < 16) continue;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4 || len > 40) continue;
      const yaw = Math.atan2(bx - ax, bz - az);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      const g = new THREE.BoxGeometry(Math.max(3, (w.w || 4) * 0.45), 0.08, len);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(mx, 0.05, mz), q, new THREE.Vector3(1, 1, 1)));
      geos.push(g);
      if (kept % 4 === 0) {
        const crack = new THREE.PlaneGeometry(len * 0.6, 0.35);
        crack.rotateX(-Math.PI / 2);
        crack.applyMatrix4(new THREE.Matrix4().makeTranslation(mx, 0.08, mz));
        crackGeos.push(crack);
        pts.push(new THREE.Vector3(mx, 0, mz));
      }
      kept += 1;
    }
  }
  if (geos.length) {
    import('three/examples/jsm/utils/BufferGeometryUtils.js').then(({ mergeGeometries }) => {
      const road = mergeGeometries(geos, false);
      if (road) {
        root.add(new THREE.Mesh(road, new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.9 })));
      }
      if (crackGeos.length) {
        const cracks = mergeGeometries(crackGeos, false);
        if (cracks) {
          root.add(new THREE.Mesh(cracks, new THREE.MeshBasicMaterial({
            color: '#ffb089', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
          })));
        }
      }
    });
  }
  const car = new THREE.BoxGeometry(1.8, 0.7, 4.1);
  const cars = new THREE.InstancedMesh(car, new THREE.MeshStandardMaterial({ color: '#3a2a28', roughness: 0.6 }), 8);
  const m = new THREE.Matrix4();
  pts.slice(0, 8).forEach((p, i) => {
    m.compose(p.clone().setY(0.45), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    cars.setMatrixAt(i, m);
    if (i < 4 && fires[i]) fires[i].position.set(p.x, 1.5, p.z);
  });
  cars.count = Math.min(8, pts.length);
  if (cars.count) root.add(cars);

  const pole = new THREE.BoxGeometry(0.12, 4.2, 0.12);
  const head = new THREE.BoxGeometry(0.5, 0.12, 0.2);
  pts.slice(0, 16).forEach((p, i) => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(pole, new THREE.MeshStandardMaterial({ color: '#8d939c', metalness: 0.4, roughness: 0.4 }));
    post.position.y = 2.1;
    const lamp = new THREE.Mesh(head, new THREE.MeshBasicMaterial({ color: '#ffd7a8' }));
    lamp.position.y = 4.15;
    g.add(post, lamp);
    g.position.set(p.x + 3, 0, p.z);
    g.userData.head = lamp;
    g.userData.i = i;
    root.add(g);
    lamps.push(g);
  });

  for (let i = 0; i < 6; i++) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: '#8b949e', metalness: 0.6, roughness: 0.4 }),
    );
    rail.position.set(-2 + i * 1.6, 0.25 + (i % 2) * 0.15, 6.8);
    rail.rotation.z = (i % 2 ? 0.8 : -0.5);
    rail.rotation.y = 0.4;
    root.add(rail);
  }
}
