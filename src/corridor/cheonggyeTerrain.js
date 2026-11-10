// [gyeongbu-bus] 판교IC–양재IC 청계산·인릉산 지형. 공개 DEM(AWS Terrain Tiles / SRTM 계열)을
//   경부 본선 중앙값 기준으로 상대 높이화했다. 도로 주변은 0m 로 펴서 버스가 산에 파묻히지 않게 한다.
//   수목은 도로 근처를 촘촘히, 먼 사면은 숲 색 지면에 맡긴다. 방음벽은 청계산입구·원지동 주택가 쪽에만 연속 패널.
//   청계산입구 건물은 OSM 윤곽·층고(있으면)이고, 신분당선 출입구는 OSM railway=subway_entrance(1·2번)에 정자역과 같은 캐노피·계단을 세운 뒤 광장(포장·자전거 거치대·가로수·가로등·역명 표지)을 곁들인다.
//   ?cgterrain=0 또는 ?gangnam=0 이면 만들지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { watchEvening } from '../evening.js';
import { buildingMeshes } from './tileMesh.js';
import { buildEntrances } from '../subway/entrance.js';
import { LINES } from '../subway/lines.js';

export const CHEONGGYE_DEM_FILE = 'gyeongbu/cheonggye-dem.json';
export const CHEONGGYE_BUILDINGS_FILE = 'gyeongbu/cheonggye-buildings.json';

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

// 4+4 본선(반대편까지 ~28m)이 산에 파묻히지 않게 더 넓게 편다.
function terrainHeight(raw, dist) {
  if (dist < 34) return 0;
  let y = raw;
  if (dist < 115) y = raw * ((dist - 34) / 81);
  y = Math.max(0, y);
  if (dist < 260) y = Math.max(y, Math.min(16, (dist - 34) * 0.038));
  return y;
}

function sampleH(data, x, z) {
  const { x0, z0, dx, dz, nx, nz, h } = data;
  const ix = Math.max(0, Math.min(nx - 1, Math.round((x - x0) / dx)));
  const iz = Math.max(0, Math.min(nz - 1, Math.round((z - z0) / dz)));
  return h[iz * nx + ix] || 0;
}

function inFootprint(x, z, ring) {
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[i + 1];
    if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / ((z2 - z1) || 1e-12) + x1) inside = !inside;
  }
  return inside;
}

function nearBuilding(x, z, buildings, pad = 1.4) {
  for (const b of buildings || []) {
    const o = b.o;
    if (!o || o.length < 4) continue;
    if (inFootprint(x, z, o)) return true;
    for (let i = 0; i < o.length - 1; i++) {
      const [ax, az] = o[i], [bx, bz] = o[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < pad) return true;
    }
  }
  return false;
}

const STATION = { x: -4758.4, z: -9052.4 };

function nearHousing(x, z) {
  return Math.hypot(x - STATION.x, z - STATION.z) < 1750;
}

function buildGround(data, segs) {
  const { x0, z0, dx, dz, nx, nz, h } = data;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const grass = new THREE.Color('#5b7a45');
  const woods = new THREE.Color('#3a5a32');
  const forest = new THREE.Color('#2a4528');
  const canopy = new THREE.Color('#1e3820');
  const rock = new THREE.Color('#8b8680');
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = x0 + ix * dx, z = z0 + iz * dz;
      const dist = distToRoad(x, z, segs);
      const y = terrainHeight(h[i] || 0, dist);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      let c;
      if (y < 22 && dist < 90) c = grass;
      else if (y > 320) c = rock;
      else {
        // 먼 사면은 인스턴스 대신 숲 색 얼룩으로 밀도감을 낸다.
        const n = hash01(ix, iz);
        if (dist > 70 || y > 28) c = n > 0.62 ? forest : n > 0.28 ? woods : canopy;
        else c = grass;
      }
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

function treePrototype(trunkHex, crownHex, crownR, crownH) {
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2.0, 5);
  trunk.translate(0, 1.0, 0);
  const crown = new THREE.ConeGeometry(crownR, crownH, 6);
  crown.translate(0, 2.0 + crownH * 0.42, 0);
  const parts = [trunk, crown].map((g, i) => {
    const c = new THREE.Color(i === 0 ? trunkHex : crownHex);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < g.attributes.position.count; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const geo = mergeGeometries(parts);
  trunk.dispose(); crown.dispose();
  return geo;
}

function buildTrees(ground, segs) {
  const { pos, nx, nz } = ground;
  const geos = [
    treePrototype('#5a4030', '#2f5a2a', 2.15, 5.4),
    treePrototype('#4a3628', '#3a6a32', 2.35, 5.0),
    treePrototype('#6a4a32', '#264a24', 1.95, 5.8),
  ];
  const caps = [2800, 1600, 1200];
  const meshes = geos.map((geo, i) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), caps[i]);
    m.name = `cheonggyeTrees-${i}`;
    m.castShadow = false;
    m.frustumCulled = false;
    return m;
  });
  const counts = [0, 0, 0];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let iz = 1; iz < nz - 1; iz++) {
    for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (y < 2 || y > 340) continue;
      const dist = distToRoad(x, z, segs);
      if (dist < 32) continue;
      // 먼 능선은 지면 숲 색에 맡기고, 도로 근처·중턱만 인스턴스
      if (dist > 280 && y > 40) continue;
      const rnd = hash01(ix, iz);
      const near = dist < 140;
      if (!near && rnd > 0.34) continue;
      if (near && rnd > 0.82) continue;
      const extras = near ? (rnd > 0.45 ? 2 : 1) : 1;
      for (let e = 0; e < extras; e++) {
        const kind = (hash01(ix + e * 3, iz + 11) * 3) | 0;
        if (counts[kind] >= caps[kind]) continue;
        const jx = (hash01(ix + 3 + e, iz) - 0.5) * (near ? 22 : 16);
        const jz = (hash01(ix, iz + 7 + e) - 0.5) * (near ? 22 : 16);
        p.set(x + jx, y, z + jz);
        q.setFromAxisAngle(up, rnd * Math.PI * 2 + e);
        const sc = (near ? 0.7 : 0.85) + rnd * 0.65;
        s.set(sc, sc * (0.9 + hash01(ix, e + 2) * 0.25), sc);
        meshes[kind].setMatrixAt(counts[kind]++, m4.compose(p, q, s));
      }
    }
  }
  const g = new THREE.Group();
  g.name = 'cheonggyeTrees';
  meshes.forEach((m, i) => { m.count = counts[i]; g.add(m); });
  return g;
}

function buildRoadsideTrees(road) {
  const geo = treePrototype('#5a4030', '#356338', 1.9, 4.6);
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
    const step = 14;
    for (let t = 0; t < L && n < cap; t += step) {
      const x = a[0] + fx * t, z = a[1] + fz * t;
      if (z > -5100) continue;
      for (const side of [-1, 1]) {
        if (n >= cap) break;
        // -1 = 진행 오른쪽(주택가·북측 바깥), +1 = 반대편 바깥(~28m)
        const base = side === -1 ? 14.2 : 31.8;
        const rnd = hash01(i * 17 + Math.round(t), side + 3);
        p.set(x + lx * (base + rnd * 4) * side, 0, z + lz * (base + rnd * 4) * side);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd * 6.2);
        const sc = 0.85 + rnd * 0.4;
        s.set(sc, sc, sc);
        mesh.setMatrixAt(n++, m4.compose(p, q, s));
      }
    }
  }
  mesh.count = n;
  return mesh;
}

/** 청계산입구·원지동 주택가 쪽(북측 바깥) 연속 방음벽. 회색-녹색 반투명 패널 + 기둥. */
function buildBarriers(road) {
  const panelParts = [];
  const postParts = [];
  const frameParts = [];
  const step = 3.15;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const fx = dx / L, fz = dz / L, lx = fz, lz = -fx;
    const ang = Math.atan2(dx, dz);
    for (let t = 0; t < L; t += step) {
      const x = a[0] + fx * t, z = a[1] + fz * t;
      if (!nearHousing(x, z)) continue;
      // 진행 오른쪽 = 원지동 주택가 (북측 바깥 갓길 바로 밖)
      const off = -11.6;
      const px = x + lx * off, pz = z + lz * off;
      const len = Math.min(step + 0.08, L - t + 0.08);
      panelParts.push(coloredBox(0.08, 4.85, len, '#6f7d6a', px, 2.55, pz, ang));
      frameParts.push(coloredBox(0.12, 0.12, len + 0.1, '#8a9186', px, 5.05, pz, ang));
      postParts.push(coloredBox(0.18, 5.25, 0.18, '#9aa094', px + fx * (len * 0.5), 2.62, pz + fz * (len * 0.5), ang));
    }
  }
  if (!panelParts.length) return null;
  const g = new THREE.Group();
  g.name = 'cheonggyeBarriers';
  const posts = new THREE.Mesh(mergeGeometries(postParts.concat(frameParts)), new THREE.MeshLambertMaterial({ vertexColors: true }));
  posts.name = 'cheonggyeBarrierPosts';
  const panels = new THREE.Mesh(mergeGeometries(panelParts), new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: 0.58, depthWrite: false,
  }));
  panels.name = 'cheonggyeBarrierPanels';
  g.add(posts, panels);
  for (const x of panelParts.concat(postParts, frameParts)) x.dispose();
  return g;
}

function makeRoadSignTex(ref) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 320;
  const x = cv.getContext('2d');
  x.fillStyle = '#d4003b';
  x.fillRect(0, 0, 248, 320);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 170px sans-serif';
  x.fillText(String(ref || ''), 124, 128);
  x.font = 'bold 40px sans-serif';
  x.fillText('번 출구', 124, 248);
  x.fillStyle = '#1d2228';
  x.fillRect(248, 0, 776, 320);
  x.fillStyle = '#fff';
  x.textAlign = 'left';
  x.font = 'bold 96px sans-serif';
  x.fillText('청계산입구', 278, 118);
  x.fillStyle = '#c9d1d9';
  x.font = '600 42px sans-serif';
  x.fillText('Cheonggyesan', 282, 196);
  x.fillStyle = '#d4003b';
  x.beginPath();
  if (x.roundRect) x.roundRect(278, 230, 214, 58, 10);
  else x.rect(278, 230, 214, 58);
  x.fill();
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.font = 'bold 30px sans-serif';
  x.fillText('신분당선', 385, 261);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildStationPlazas(exits, buildings, gy) {
  const g = new THREE.Group();
  g.name = 'cheonggyeStationPlazas';
  const solid = [];
  const night = [];
  const treeMats = [];
  const treeGeo = treePrototype('#5a4030', '#356338', 1.85, 4.4);
  const TILE_A = '#c9c4b8', TILE_B = '#b7b2a6', CURB = '#9a958a', STEEL = '#8b929a', POLE = '#6b7280';
  for (const e of exits) {
    const y0 = gy(e.x, e.z);
    const s = Math.sin(e.ry), c = Math.cos(e.ry);
    const at = (u, w) => ({ x: e.x + u * c + w * s, z: e.z - u * s + w * c });
    const put = (w, h, d, color, u, y, w0, ang = 0) => {
      const p = at(u, w0);
      solid.push(coloredBox(w, h, d, color, p.x, y, p.z, e.ry + ang));
    };
    // 타일 포장 — 계단 구멍·건물 발자국은 비운다
    for (let iu = -5; iu <= 5; iu++) {
      for (let iw = -4; iw <= 6; iw++) {
        const u = iu * 1.55, w = iw * 1.55;
        if (Math.abs(u) < 1.85 && w > -0.5 && w < 6.3) continue;
        const p = at(u, w);
        if (nearBuilding(p.x, p.z, buildings, 1.6)) continue;
        const col = ((iu + iw) & 1) ? TILE_A : TILE_B;
        solid.push(coloredBox(1.48, 0.07, 1.48, col, p.x, y0 + 0.035, p.z, e.ry));
      }
    }
    // 연석
    for (const [u, w, ww, dd] of [
      [0, -6.4, 16.4, 0.28], [0, 10.2, 16.4, 0.28], [-8.2, 1.9, 0.28, 16.8], [8.2, 1.9, 0.28, 16.8],
    ]) {
      const p = at(u, w);
      if (!nearBuilding(p.x, p.z, buildings, 0.8)) {
        solid.push(coloredBox(ww, 0.16, dd, CURB, p.x, y0 + 0.08, p.z, e.ry));
      }
    }
    // 자전거 거치대 (거꾸로 U자, 출입구 옆)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const u = side * (2.9 + i * 0.72), w = -2.35;
        const p = at(u, w);
        if (nearBuilding(p.x, p.z, buildings, 1.0)) continue;
        put(0.06, 0.95, 0.06, STEEL, u - 0.32, y0 + 0.48, w);
        put(0.06, 0.95, 0.06, STEEL, u + 0.32, y0 + 0.48, w);
        put(0.70, 0.06, 0.06, STEEL, u, y0 + 0.98, w);
      }
    }
    // 벤치 하나
    {
      const p = at(3.6, -3.4);
      if (!nearBuilding(p.x, p.z, buildings, 1.2)) {
        put(1.7, 0.08, 0.42, '#6a5340', 3.6, y0 + 0.46, -3.4);
        put(1.7, 0.42, 0.08, '#5a4636', 3.6, y0 + 0.72, -3.18);
        put(0.08, 0.42, 0.42, '#4a3a2c', 2.85, y0 + 0.22, -3.4);
        put(0.08, 0.42, 0.42, '#4a3a2c', 4.35, y0 + 0.22, -3.4);
      }
    }
    // 가로등 2개
    for (const [u, w] of [[-6.4, -3.6], [6.4, 3.8]]) {
      const p = at(u, w);
      if (nearBuilding(p.x, p.z, buildings, 1.2)) continue;
      put(0.14, 5.6, 0.14, POLE, u, y0 + 2.8, w);
      put(1.35, 0.08, 0.10, POLE, u + 0.55, y0 + 5.55, w);
      put(0.28, 0.14, 0.36, '#d8dde3', u + 1.15, y0 + 5.42, w);
      const lamp = coloredBox(0.42, 0.18, 0.42, '#fff4d0', p.x + Math.cos(e.ry) * 1.15, y0 + 5.38, p.z - Math.sin(e.ry) * 1.15, e.ry);
      const glow = new THREE.Mesh(lamp, new THREE.MeshBasicMaterial({ vertexColors: true }));
      glow.visible = false;
      glow.name = 'cheonggyePlazaLamp';
      night.push(glow);
    }
    // 큰 역명 표지 (도로·보행에서 읽히게). 출입구 왼쪽 앞.
    {
      const u = -4.35, w = -3.15;
      const p = at(u, w);
      if (!nearBuilding(p.x, p.z, buildings, 1.0)) {
        put(0.12, 3.15, 0.12, POLE, u - 2.15, y0 + 1.58, w);
        put(0.12, 3.15, 0.12, POLE, u + 2.15, y0 + 1.58, w);
        put(4.7, 1.52, 0.10, '#1d2228', u, y0 + 3.55, w);
        const tex = makeRoadSignTex(e.ref);
        const geo = new THREE.PlaneGeometry(4.55, 1.42);
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
        const face = new THREE.Mesh(geo, mat);
        face.position.set(p.x - Math.sin(e.ry) * 0.06, y0 + 3.55, p.z - Math.cos(e.ry) * 0.06);
        face.rotation.y = e.ry + Math.PI;
        face.name = 'cheonggyeStationSign';
        g.add(face);
        const back = new THREE.Mesh(geo, mat);
        back.position.set(p.x + Math.sin(e.ry) * 0.06, y0 + 3.55, p.z + Math.cos(e.ry) * 0.06);
        back.rotation.y = e.ry;
        back.name = 'cheonggyeStationSignBack';
        g.add(back);
      }
    }
    // 광장 나무
    for (const [u, w, sc] of [[-6.8, 5.6, 1.05], [6.6, 6.0, 0.95], [-6.6, 0.6, 0.88], [6.8, -2.8, 1.0]]) {
      const p = at(u, w);
      if (nearBuilding(p.x, p.z, buildings, 2.2)) continue;
      treeMats.push({ x: p.x, y: y0, z: p.z, sc });
    }
  }
  if (solid.length) {
    const mesh = new THREE.Mesh(mergeGeometries(solid), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'cheonggyePlazaSolid';
    mesh.receiveShadow = true;
    g.add(mesh);
    for (const x of solid) x.dispose();
  }
  if (treeMats.length) {
    const im = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), treeMats.length);
    im.name = 'cheonggyePlazaTrees';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
    treeMats.forEach((t, i) => {
      pp.set(t.x, t.y, t.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7);
      ss.set(t.sc, t.sc, t.sc);
      im.setMatrixAt(i, m4.compose(pp, q, ss));
    });
    g.add(im);
  } else treeGeo.dispose();
  for (const m of night) g.add(m);
  return { group: g, night };
}

function buildStationEntrances(list, data, segs, buildings) {
  const g = new THREE.Group();
  g.name = 'cheonggyeEntrances';
  const night = [];
  if (!list?.length) return { group: g, night };
  const gy = (x, z) => terrainHeight(sampleH(data, x, z), distToRoad(x, z, segs));
  const exits = list.map((e, i) => {
    const ry = Number.isFinite(e.dir) ? e.dir : Math.atan2(STATION.x - e.x, STATION.z - e.z);
    return {
      id: e.ref ? `cheonggyesan-x${e.ref}` : `cheonggyesan-n${i}`,
      ref: e.ref || null,
      osm: e.osm,
      lat: e.lat,
      lon: e.lon,
      x: e.x,
      z: e.z,
      place: { x: e.x, z: e.z, ry },
    };
  });
  // 정자역과 같은 화강석 캐노피·내려가는 계단·노선색 간판. 대합실 탑승은 연결하지 않는다.
  buildEntrances({
    scene: g,
    overlay: null,
    exits,
    data: {},
    world: { isBlocked: () => false, onRoad: () => false },
    terrain: { getGroundHeight: gy },
    theme: { id: 'cheonggyesan', name: '청계산입구', nameEn: 'Cheonggyesan', lines: [LINES.shin] },
  });
  const plaza = buildStationPlazas(exits.map((e) => ({ ...e, ry: e.place.ry })), buildings, gy);
  g.add(plaza.group);
  night.push(...plaza.night);
  return { group: g, night };
}

function assemble(data, buildingsData) {
  const road = data.road || [];
  const segs = segsFromRoad(road);
  const g = new THREE.Group();
  g.name = 'cheonggyeTerrainInner';
  const ground = buildGround(data, segs);
  g.add(ground.mesh);
  g.add(buildTrees(ground, segs));
  const barriers = buildBarriers(road);
  if (barriers) g.add(barriers);
  g.add(buildRoadsideTrees(road));
  const nightMeshes = [];
  if (buildingsData?.buildings?.length) {
    const meshes = buildingMeshes(buildingsData.buildings, 9044);
    for (const m of meshes) {
      m.name = (m.name || 'cheonggyeBldg') + (m.material?.map ? 'Facade' : 'Roof');
      g.add(m);
    }
  }
  const ents = buildStationEntrances(buildingsData?.entrances || [], data, segs, buildingsData?.buildings || []);
  g.add(ents.group);
  nightMeshes.push(...ents.night);
  const unwatch = watchEvening((v) => { for (const m of nightMeshes) m.visible = v; });
  return {
    group: g,
    dispose() {
      unwatch();
      g.removeFromParent();
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
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
  const base = baseUrl || ((import.meta.env && import.meta.env.BASE_URL) || '/');
  const demUrl = `${base}corridor/gyeongbu/${CHEONGGYE_DEM_FILE.split('/').pop()}`;
  const bldUrl = `${base}corridor/gyeongbu/${CHEONGGYE_BUILDINGS_FILE.split('/').pop()}`;
  Promise.all([
    fetch(demUrl).then((r) => (r.ok ? r.json() : null)),
    fetch(bldUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([dem, buildings]) => {
    if (!dem?.h?.length) return;
    const built = assemble(dem, buildings);
    g.add(built.group);
    ctl._inner = built;
  }).catch(() => {});
  return ctl;
}
