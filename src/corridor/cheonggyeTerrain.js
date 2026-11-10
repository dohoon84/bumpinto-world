// [gyeongbu-bus] 판교IC–양재IC 청계산·인릉산 지형. 공개 DEM(AWS Terrain Tiles / SRTM 계열)을
//   경부 본선 중앙값 기준으로 상대 높이화했다. 도로 주변은 0m 로 펴서 버스가 산에 파묻히지 않게 한다.
//   수목·방음벽·청계산입구 일대 건물은 저폴리 규칙 배치(OSM 윤곽을 그대로 따른 것은 아님).
//   ?cgterrain=0 또는 ?gangnam=0 이면 만들지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { watchEvening } from '../evening.js';

export const CHEONGGYE_DEM_FILE = 'gyeongbu/cheonggye-dem.json';

export function cheonggyeTerrainEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search || '');
  return p.get('cgterrain') !== '0' && p.get('gangnam') !== '0';
}

function segsFromRoad(road) {
  const segs = [];
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    segs.push({ ax: a[0], az: a[1], dx, dz, L2, L: Math.sqrt(L2) });
  }
  return segs;
}

function distToRoad(x, z, segs) {
  let best = Infinity;
  for (const s of segs) {
    const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.L2));
    const d = Math.hypot(s.ax + s.dx * t - x, s.az + s.dz * t - z);
    if (d < best) best = d;
  }
  return best;
}

function hash01(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function coloredBox(w, h, d, color, x, y, z, ang = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ang) g.rotateY(ang);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function terrainHeight(raw, dist) {
  if (dist < 22) return 0;
  let y = raw;
  if (dist < 95) y = raw * ((dist - 22) / 73);
  y = Math.max(0, y);
  if (dist < 240) y = Math.max(y, Math.min(14, (dist - 22) * 0.04));
  return y;
}

function buildGround(data, segs) {
  const { x0, z0, dx, dz, nx, nz, h } = data;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const nrm = new Float32Array(nx * nz * 3);
  const grass = new THREE.Color('#5b7a45');
  const woods = new THREE.Color('#3a5a32');
  const rock = new THREE.Color('#8b8680');
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = x0 + ix * dx, z = z0 + iz * dz;
      const y = terrainHeight(h[i] || 0, distToRoad(x, z, segs));
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const c = y < 26 ? grass : y < 160 ? woods : rock;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'cheonggyeGround';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh, pos, nx, nz, x0, z0, dx, dz };
}

function buildTrees(ground, segs) {
  const { pos, nx, nz } = ground;
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.0, 5);
  trunk.translate(0, 1.0, 0);
  const crown = new THREE.ConeGeometry(2.15, 5.4, 6);
  crown.translate(0, 4.5, 0);
  const parts = [trunk, crown].map((g) => {
    const c = new THREE.Color(g === trunk ? '#5a4030' : '#2f5a2a');
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const geo = mergeGeometries(parts);
  trunk.dispose(); crown.dispose();
  const cap = 3200;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), cap);
  mesh.name = 'cheonggyeTrees';
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let n = 0;
  for (let iz = 1; iz < nz - 1; iz += 1) {
    for (let ix = 1; ix < nx - 1; ix += 1) {
      if (n >= cap) break;
      const i = iz * nx + ix;
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (y < 8 || y > 380) continue;
      if (distToRoad(x, z, segs) < 38) continue;
      const rnd = hash01(ix, iz);
      if (rnd > 0.38) continue;
      const sc = 0.75 + rnd * 0.7;
      p.set(x + (hash01(ix + 3, iz) - 0.5) * 18, y, z + (hash01(ix, iz + 7) - 0.5) * 18);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd * Math.PI * 2);
      s.set(sc, sc, sc);
      mesh.setMatrixAt(n++, m4.compose(p, q, s));
    }
  }
  mesh.count = n;
  return mesh;
}

function buildRoadsideTrees(road) {
  const trunk = new THREE.CylinderGeometry(0.2, 0.28, 1.8, 5);
  trunk.translate(0, 0.9, 0);
  const crown = new THREE.ConeGeometry(1.9, 4.6, 6);
  crown.translate(0, 3.9, 0);
  const parts = [trunk, crown].map((g, i) => {
    const c = new THREE.Color(i === 0 ? '#5a4030' : '#356338');
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < g.attributes.position.count; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const geo = mergeGeometries(parts);
  trunk.dispose(); crown.dispose();
  const cap = 900;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), cap);
  mesh.name = 'cheonggyeRoadTrees';
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let n = 0;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const fx = dx / L, fz = dz / L, lx = fz, lz = -fx;
    const step = 22;
    for (let t = 0; t < L && n < cap; t += step) {
      const x = a[0] + fx * t, z = a[1] + fz * t;
      if (z > -5100) continue;
      for (const side of [-1, 1]) {
        if (n >= cap) break;
        const rnd = hash01(i * 17 + Math.round(t), side + 3);
        p.set(x + lx * (26 + rnd * 6) * side, 0, z + lz * (26 + rnd * 6) * side);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd * 6.2);
        const sc = 0.85 + rnd * 0.45;
        s.set(sc, sc, sc);
        mesh.setMatrixAt(n++, m4.compose(p, q, s));
      }
    }
  }
  mesh.count = n;
  return mesh;
}

function buildBarriers(road) {
  const parts = [];
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    if (L < 8) continue;
    const fx = dx / L, fz = dz / L, lx = fz, lz = -fx;
    const ang = Math.atan2(dx, dz);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    // 판교TG·합류 근처(접근로 z > -5000)는 이미 구조물이 있어 건너뛴다.
    if (mz > -5100) continue;
    for (const side of [-1, 1]) {
      parts.push(coloredBox(0.28, 3.15, Math.min(L + 1.2, 22), '#b9b4aa', mx + lx * 16.4 * side, 1.58, mz + lz * 16.4 * side, ang));
    }
  }
  if (!parts.length) return null;
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'cheonggyeBarriers';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

function buildStationCluster() {
  // 청계산입구역 좌표(stopCoords). 건물 배치는 역 주변 규칙 배치이며 OSM 평면이 아니다.
  const SX = -4758.4, SZ = -9052.4;
  const parts = [], night = [];
  const specs = [
    [26, 22, 14, SX + 42, SZ + 28, 0.42, '#d8d0c4'],
    [18, 15, 12, SX + 74, SZ + 8, 0.42, '#c9bdb0'],
    [34, 30, 15, SX + 58, SZ - 48, 0.12, '#d5cfc6'],
    [20, 11, 16, SX + 18, SZ + 68, 0.48, '#b8c3b2'],
    [14, 8, 20, SX + 98, SZ - 18, 0.35, '#e6e0d4'],
    [16, 6, 10, SX + 8, SZ - 6, 0.3, '#cfd6dc'],
  ];
  for (const [w, h, d, x, z, ang, color] of specs) {
    parts.push(coloredBox(w, h, d, color, x, h / 2, z, ang));
    night.push(coloredBox(w - 1.2, h * 0.45, 0.12, '#ffe9b0', x + Math.sin(ang) * (d / 2 + 0.08), h * 0.55, z + Math.cos(ang) * (d / 2 + 0.08), ang));
  }
  // 간이 출입 캐노피
  parts.push(coloredBox(18, 0.7, 9, '#c5cad1', SX - 6, 4.4, SZ + 4, 0.3));
  parts.push(coloredBox(0.45, 4.1, 0.45, '#8a9098', SX - 13, 2.05, SZ + 0.5, 0.3));
  parts.push(coloredBox(0.45, 4.1, 0.45, '#8a9098', SX + 1, 2.05, SZ + 7.5, 0.3));
  const body = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  body.name = 'cheonggyeStationBuildings';
  const glow = new THREE.Mesh(mergeGeometries(night), new THREE.MeshBasicMaterial({ vertexColors: true }));
  glow.name = 'cheonggyeStationGlow';
  glow.visible = false;
  for (const g of parts) g.dispose();
  for (const g of night) g.dispose();
  return { body, glow };
}

function assemble(data) {
  const road = data.road || [];
  const segs = segsFromRoad(road);
  const g = new THREE.Group();
  g.name = 'cheonggyeTerrain';
  const ground = buildGround(data, segs);
  g.add(ground.mesh);
  g.add(buildTrees(ground, segs));
  const barriers = buildBarriers(road);
  if (barriers) g.add(barriers);
  g.add(buildRoadsideTrees(road));
  const cluster = buildStationCluster();
  g.add(cluster.body);
  g.add(cluster.glow);
  const unwatch = watchEvening((v) => { cluster.glow.visible = v; });
  return {
    group: g,
    dispose() {
      unwatch();
      g.removeFromParent();
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}

export function mountCheonggyeTerrain(scene, { search = typeof location !== 'undefined' ? location.search : '', baseUrl = '' } = {}) {
  if (!cheonggyeTerrainEnabled(search)) return null;
  const g = new THREE.Group();
  g.name = 'cheonggyeTerrain';
  scene.add(g);
  const ctl = { group: g, dispose() { ctl._inner?.dispose(); g.removeFromParent(); } };
  const url = `${baseUrl || ((import.meta.env && import.meta.env.BASE_URL) || '/')}corridor/gyeongbu/cheonggye-dem.json`;
  fetch(url).then((r) => (r.ok ? r.json() : null)).then((data) => {
    if (!data?.h?.length) return;
    const built = assemble(data);
    g.add(built.group);
    ctl._inner = built;
  }).catch(() => {});
  return ctl;
}
