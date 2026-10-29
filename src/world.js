// OSM 변환 데이터(public/jeongja.json) -> three.js 메시
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addCafeSidewalks } from './world/cafeWalks.js';
import { addStarbucksGlass, placeJeongjaStationStarbucks, ringKey, starbucksShells, stationWallColliders } from './world/starbucksGlass.js';
import { addNobiosShop, placeNobiosHotel } from './world/nobiosHotel.js';
import { addWindowLights } from './world/windowLights.js';
import { addPostOfficeMarks } from './world/postOffice.js';
import { addStationCafeCrowd } from './world/cafeCrowd.js';
import { addPlaceSigns } from './world/signs.js';
import { addInstancedTrees } from './world/trees.js';

const ROAD_STYLE = {
  primary: ['#8d939c', 0.06], secondary: ['#949aa3', 0.065], tertiary: ['#9ca1a9', 0.07], trunk: ['#8d939c', 0.06],
  residential: ['#a9adb4', 0.075], unclassified: ['#a9adb4', 0.075], service: ['#b4b7bc', 0.08], living_street: ['#b4b7bc', 0.08],
  footway: ['#e2d3b5', 0.1], pedestrian: ['#e6d8bb', 0.095], path: ['#d9c8a4', 0.1], cycleway: ['#d68c7a', 0.1], steps: ['#cbbd9f', 0.1], track: ['#c9b48d', 0.09],
};
const PARK_COLOR = { park: '#a8d59a', garden: '#b2dc9f', playground: '#c6e2a0', pitch: '#9fd08c', grass: '#b5dda3', forest: '#86bf7c', wood: '#86bf7c', scrub: '#9cc78a', meadow: '#bfe0a8', recreation_ground: '#b0d89c', village_green: '#b5dda3', grassland: '#bfe0a8', plaza: '#e9dfca' };
const BUILDING_COLOR = {
  apartments: '#f3e3d3', residential: '#f1e0cf', commercial: '#d8e2ee', office: '#d3deec',
  retail: '#eedccb', school: '#f4d7b8', kindergarten: '#f7d4c4', public: '#e8dcc8',
  house: '#efe6d6', civic: '#e4ddd0', church: '#efe8dc',
  industrial: '#cfd8e3', warehouse: '#d5dde7', construction: '#c7d2df',
  rocket: '#b8c4d0', static_caravan: '#e3e8ee', container: '#c2ccd6',
  yes: '#e7e3dc',
};
const FACADE_BAY = 3.2, FACADE_FLOOR = 3.2;

const toShape = (ring, holes = []) => {
  const s = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
};
function flatGeo(polys, y) {
  const geos = [];
  for (const p of polys) {
    try { const g = new THREE.ShapeGeometry(toShape(p.o, p.holes || [])); g.rotateX(-Math.PI / 2); g.translate(0, y + (p.h || 0), 0); geos.push(g); } catch {} // [terrain] p.h = 폴리곤 높이(탄천 수면)
  }
  return geos.length ? mergeGeometries(geos) : null;
}
// 폴리라인 -> 평평한 리본(도로). 꺾이는 지점엔 원판을 깔아 이음새를 메움
function ribbonGeo(pts, w, y, caps = true) {
  const pos = [], idx = [];
  const n = pts.length;
  const hwAt = (i) => { const p = pts[i], ww = p && p.length >= 4 && p[3] > 0 ? p[3] : w; return ww / 2; };
  const variable = pts.some((p) => p && p.length >= 4 && p[3] > 0);
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], hw = hwAt(i);
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const yy = y + (p[2] || 0); // [terrain] 점별 높이(p[2]) — 탄천 둔치/제방 경사로. p[3] 가 있으면 그 점의 폭
    pos.push(p[0] - dz * hw, yy, p[1] + dx * hw, p[0] + dz * hw, yy, p[1] - dx * hw);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  if (caps && !variable && w >= 3) {
    const hw = w / 2;
    for (const p of pts) {
      const c = pos.length / 3, yy = y + (p[2] || 0); pos.push(p[0], yy, p[1]); // [terrain]
      const seg = 10;
      for (let j = 0; j <= seg; j++) { const t = (j / seg) * Math.PI * 2; pos.push(p[0] + Math.cos(t) * hw, yy, p[1] + Math.sin(t) * hw); }
      for (let j = 0; j < seg; j++) idx.push(c, c + 2 + j, c + 1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function fixNormalsUp(g) { const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0); return g; }

// 간단한 균일 격자 공간 인덱스(충돌용)
class Grid {
  constructor(cell = 40) { this.cell = cell; this.map = new Map(); }
  add(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++) for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
      const k = i + ',' + j; if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(item);
    }
  }
  query(x, z) { return this.map.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)) || []; }
}
function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildWorld(scene, data, region = null) {
  const isJeongja = region ? !!region.features?.jeongjaBuildings : data.station?.name !== 'Starbase';
  if (isJeongja) {
    addCafeSidewalks(data); // 역 보행망이 끊긴 카페 앞까지 인도
    placeJeongjaStationStarbucks(data);
    placeNobiosHotel(data);
  }
  const { x0, x1, z0, z1 } = data.meta.bboxLocal;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

  // 바닥 (넓은 지역에서도 경계 밖 바닥이 잘리지 않도록 bbox 크기에 비례해 확장)
  const groundSpan = Math.max(6000, (x1 - x0) + 3200, (z1 - z0) + 3200);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSpan, groundSpan), mat('#efe9dc'));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); ground.receiveShadow = true; scene.add(ground);
  const block = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat('#ebe4d4'));
  block.rotation.x = -Math.PI / 2; block.position.set(cx, 0.01, cz); block.receiveShadow = true; scene.add(block);

  // 공원/녹지
  const byKind = {};
  for (const p of data.parks) (byKind[p.k] ||= []).push(p);
  for (const [k, list] of Object.entries(byKind)) {
    const g = flatGeo(list, k === 'plaza' ? 0.03 : 0.02 + (k === 'park' ? 0 : 0.005));
    if (g) { const m = new THREE.Mesh(fixNormalsUp(g), mat(PARK_COLOR[k] || '#b5dda3')); m.receiveShadow = true; scene.add(m); }
  }
  // 물(탄천) — 강 폴리곤 + 중심선 리본(폴리곤이 없을 때 대비)
  const waterMat = mat('#7ec3e6');
  const wg = flatGeo(data.water, 0.04);
  if (wg) { const m = new THREE.Mesh(fixNormalsUp(wg), waterMat); m.receiveShadow = true; scene.add(m); }
  const wl = data.waterLines.map((l) => ribbonGeo(l.p, data.water.length > 1 ? 8 : l.w, 0.035));
  if (wl.length) scene.add(new THREE.Mesh(mergeGeometries(wl), waterMat));

  // 도로
  const roadGroups = {};
  for (const r of data.roads) {
    const [color, y] = ROAD_STYLE[r.k] || ['#b4b7bc', 0.08];
    (roadGroups[color + '|' + y] ||= []).push(ribbonGeo(r.p, r.w, y + (r.br ? 0.02 : 0)));
  }
  for (const [key, geos] of Object.entries(roadGroups)) {
    const [color] = key.split('|');
    const m = new THREE.Mesh(mergeGeometries(geos), mat(color)); m.receiveShadow = true; scene.add(m);
  }
  // 큰 도로 중앙선
  const lines = data.roads.filter((r) => ['primary', 'secondary', 'trunk'].includes(r.k)).map((r) => ribbonGeo(r.p, 0.35, 0.09, false));
  if (lines.length) scene.add(new THREE.Mesh(mergeGeometries(lines), mat('#f2d36b')));

  // 건물 (높이 = levels*3.2m, 없으면 기본 3층). 지붕은 단색, 벽은 종류별 창 타일.
  const roofs = [], walls = {}, colliders = new Grid();
  const shells = starbucksShells(data);
  const shellByRing = new Map(shells.map((s) => [s.key, s]));
  const c = new THREE.Color(), roof = new THREE.Color(), wallTint = new THREE.Color();
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const b of data.buildings) {
    const shell = shellByRing.get(ringKey(b.o));
    const origMin = b.mh || 0;
    const minH = shell?.mode === 'podium' ? 3.4 : shell?.mode === 'full' ? Math.max(origMin, b.h - 0.42) : origMin;
    const h = Math.max(0.35, b.h - minH);
    if (origMin < 2.5) {
      const doorWalls = shell?.name === '스타벅스 정자역' ? stationWallColliders(shell) : null;
      const rings = doorWalls || [b.o];
      for (const ring of rings) {
        let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
        for (const [x, z] of ring) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
        colliders.add(ring, mnx, mnz, mxx, mxz);
      }
    }
    if (b._skip) continue; // [tower] 발사탑/OLM/탱크 상세 모델로 교체될 건물은 기본 상자 생략
    let g;
    try { g = new THREE.ExtrudeGeometry(toShape(b.o, b.holes || []), { depth: h, bevelEnabled: false, UVGenerator: FACADE_UV }); } catch { continue; }
    g.rotateX(-Math.PI / 2); g.translate(0, minH, 0);
    c.set(BUILDING_COLOR[b.k] || BUILDING_COLOR.yes).offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.06);
    if (b.s === 'default') c.offsetHSL(0, -0.05, 0.02);
    roof.copy(c).offsetHSL(0, -0.05, -0.12);
    wallTint.setRGB(0.93 + c.r * 0.07, 0.93 + c.g * 0.07, 0.93 + c.b * 0.07);
    const nrm = g.attributes.normal, cols = new Float32Array(nrm.count * 3);
    for (let i = 0; i < nrm.count; i++) {
      const ny = nrm.getY(i), cc = ny > 0.5 ? roof : ny < -0.5 ? c : wallTint;
      cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const cap = takeGroup(g, 0), side = takeGroup(g, 1);
    g.dispose();
    if (cap) { if (cap.attributes.uv) cap.deleteAttribute('uv'); roofs.push(cap); }
    if (side) (walls[facadeKey(b.k)] ||= []).push(side);
  }
  if (roofs.length) {
    const bmesh = new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshLambertMaterial({ vertexColors: true }));
    bmesh.castShadow = true; bmesh.receiveShadow = true; scene.add(bmesh);
  }
  for (const [key, geos] of Object.entries(walls)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), facadeMaterial(key));
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  }
  const starbucksRooms = isJeongja ? addStarbucksGlass(scene, shells) : [];
  if (isJeongja) {
    addNobiosShop(scene);
    addPostOfficeMarks(scene, data);
    addStationCafeCrowd(scene, data);
  }
  addWindowLights(scene, data.buildings, shells);
  addPlaceSigns(scene, data);

  // 차도 위 판정(가로수/표지판이 도로 한가운데 서지 않게)
  const roadGrid = new Grid(30);
  for (const r of data.roads) {
    if (!['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link'].includes(r.k)) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], hw = r.w / 2 + 0.6;
      roadGrid.add({ ax, az, bx, bz, hw }, Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw);
    }
  }
  const onRoad = (x, z) => roadGrid.query(x, z).some(({ ax, az, bx, bz, hw }) => {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    return Math.hypot(ax + dx * t - x, az + dz * t - z) < hw;
  });

  // 가로수 (큰 도로를 따라 간단한 로우폴리 나무, InstancedMesh)
  const treePts = [];
  for (const r of data.roads) {
    if (!['primary', 'secondary', 'tertiary'].includes(r.k)) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let t = 6; t < L; t += 14) for (const side of [-1, 1]) {
        const x = ax + ((bx - ax) * t) / L + nx * side * (r.w / 2 + 1.6), z = az + ((bz - az) * t) / L + nz * side * (r.w / 2 + 1.6);
        if (data.heightAt && data.heightAt(x, z) < -0.3) continue; // [terrain] 하천 경사면/둔치엔 가로수 X
        if (!onRoad(x, z) && !colliders.query(x, z).some((ring) => pointInRing(x, z, ring))) treePts.push([x, z]);
      }
    }
  }
  addInstancedTrees(scene, treePts, {
    rnd,
    crownRadius: 2.2,
    crownY: 5,
    trunkTop: 0.2,
    trunkBottom: 0.28,
    trunkHeight: 3.6,
    trunkColor: '#8a6b4e',
    scaleMin: 0.8,
    scaleSpan: 0.5,
  });

  // 중심 표지(역/동네 중심 사인 기둥)
  const sp = { x: data.station.x, z: data.station.z };
  for (let r = 0, a = 0; r < 120 && (onRoad(sp.x, sp.z) || colliders.query(sp.x, sp.z).some((ring) => pointInRing(sp.x, sp.z, ring))); a += 0.5, r += 0.25) { sp.x = data.station.x + Math.cos(a) * r; sp.z = data.station.z + Math.sin(a) * r; }
  scene.add(stationSign(sp, region?.signBoard));

  const isBlocked = (x, z, r = 0.35) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      for (const ring of colliders.query(x + dx, z + dz)) if (pointInRing(x + dx, z + dz, ring)) return true;
    }
    return false;
  };
  // NPC가 걸을 수 있는 경로. walkPaths 는 역 근처(기존 주민), cityWalkPaths 는 bbox 전체(전역 행인).
  const walkOf = (r) => ({
    pts: r.p,
    offset: ['footway', 'path', 'pedestrian', 'cycleway', 'living_street'].includes(r.k) ? 0 : r.w / 2 + 1.2,
    kind: r.k, name: r.n, door: r.door, bridge: !!r.br,
  });
  const inBBox = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const walkPaths = data.roads.filter((r) => r.walk && r.p.length >= 2 && r.p.some(([x, z]) => Math.hypot(x - data.station.x, z - data.station.z) < 260)).map(walkOf);
  const cityWalkPaths = data.roads.filter((r) => r.walk && r.door == null && r.p.length >= 2 && r.p.some(([x, z]) => inBBox(x, z))).map(walkOf);
  const waterShapes = (data.water || []).map((w) => {
    let wx0 = Infinity, wx1 = -Infinity, wz0 = Infinity, wz1 = -Infinity;
    for (const [x, z] of w.o) { wx0 = Math.min(wx0, x); wx1 = Math.max(wx1, x); wz0 = Math.min(wz0, z); wz1 = Math.max(wz1, z); }
    return { o: w.o, holes: w.holes || [], wx0, wx1, wz0, wz1 };
  });
  const inWater = (x, z) => {
    for (const w of waterShapes) {
      if (x < w.wx0 || x > w.wx1 || z < w.wz0 || z > w.wz1) continue;
      if (!pointInRing(x, z, w.o)) continue;
      if (w.holes.some((h) => pointInRing(x, z, h))) continue;
      return true;
    }
    return false;
  };
  return { isBlocked, onRoad, walkPaths, cityWalkPaths, inWater, signPos: sp, bounds: { x0, x1, z0, z1 }, treeCount: treePts.length, ground, block, starbucksRooms }; // [terrain] ground/block: terrain.build 가 하천 구간을 비운 형상으로 교체
}

function stationSign(st, signCfg = null) {
  const g = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const x = cv.getContext('2d');
  const topLeft = signCfg?.topLeftColor || '#d4003b';
  const topRight = signCfg?.topRightColor || '#f5a200';
  const title = signCfg?.title || '정자';
  const sub = signCfg?.sub || 'Jeongja · D15 · K230';
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = topLeft; x.fillRect(0, 0, 256, 34); x.fillStyle = topRight; x.fillRect(256, 0, 256, 34);
  x.fillStyle = '#1d2a44';
  x.font = title.length > 4 ? 'bold 74px sans-serif' : 'bold 110px sans-serif';
  x.textAlign = 'center';
  x.fillText(title, 256, title.length > 4 ? 152 : 160);
  x.font = '32px sans-serif'; x.fillText(sub, 256, 222);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.3), [0, 1, 2, 3, 4, 5].map((i) => (i === 4 || i === 5 ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ color: '#1d2a44' }))));
  board.position.y = 6.5; board.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5.2, 8), new THREE.MeshLambertMaterial({ color: '#1d2a44' }));
  pole.position.y = 2.6; pole.castShadow = true;
  // 지하 출입구 지붕(캐노피)
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 7), new THREE.MeshLambertMaterial({ color: '#c9d3df', transparent: true, opacity: 0.85 }));
  canopy.position.set(5, 3, 0); canopy.castShadow = true;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), new THREE.MeshLambertMaterial({ color: '#9aa7b8' }));
  legs.position.set(5, 1.5, 3.4);
  g.add(board, pole, canopy, legs);
  g.position.set(st.x, 0, st.z);
  return g;
}

// 압출 벽의 UV를 가로 3.2m · 세로 한 층(3.2m) 칸으로 맞춘다. 모서리에서 칸이 다시 시작된다.
const FACADE_UV = {
  generateTopUV(_geometry, vertices, ia, ib, ic) {
    const v2 = (i) => new THREE.Vector2(vertices[i * 3], vertices[i * 3 + 1]);
    return [v2(ia), v2(ib), v2(ic)];
  },
  generateSideWallUV(_geometry, vertices, ia, ib, ic, id) {
    const at = (i) => [vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]];
    const A = at(ia), B = at(ib), C = at(ic), D = at(id);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]) / FACADE_BAY;
    const vv = (z) => z / FACADE_FLOOR;
    return [
      new THREE.Vector2(0, vv(A[2])),
      new THREE.Vector2(len, vv(B[2])),
      new THREE.Vector2(len, vv(C[2])),
      new THREE.Vector2(0, vv(D[2])),
    ];
  },
};

function facadeKey(k) {
  if (k === 'office') return 'office';
  if (k === 'commercial') return 'commercial';
  if (k === 'apartments' || k === 'residential' || k === 'dormitory') return 'residential';
  if (k === 'house') return 'house';
  if (k === 'school' || k === 'kindergarten' || k === 'university' || k === 'college') return 'school';
  if (k === 'public' || k === 'civic' || k === 'church' || k === 'hospital') return 'public';
  return 'yes';
}

function takeGroup(g, materialIndex) {
  const group = g.groups.find((gr) => gr.materialIndex === materialIndex);
  if (!group || group.count <= 0) return null;
  const { start, count } = group;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const src = g.attributes[name];
    const copied = new src.array.constructor(count * src.itemSize);
    copied.set(src.array.subarray(start * src.itemSize, (start + count) * src.itemSize));
    out.setAttribute(name, new THREE.BufferAttribute(copied, src.itemSize, src.normalized));
  }
  return out;
}

const facadeMats = new Map();
function facadeMaterial(key) {
  if (!facadeMats.has(key)) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    paintFacade(cv.getContext('2d'), key);
    const map = new THREE.CanvasTexture(cv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    facadeMats.set(key, new THREE.MeshLambertMaterial({ map, vertexColors: true }));
  }
  return facadeMats.get(key);
}

function paintFacade(x, key) {
  const wall = { office: '#c5d0dc', commercial: '#d5dee8', residential: '#f0e2d2', house: '#efe6d8', school: '#f6e7d4', public: '#e7e0d2', yes: '#e6e2da' }[key] || '#e6e2da';
  const glass = { office: '#7fa4c4', commercial: '#6e93b0', residential: '#5f84a0', house: '#6a8eaa', school: '#6f92ae', public: '#5c7384', yes: '#7d93a6' }[key] || '#7d93a6';
  const band = { office: '#aeb9c6', commercial: '#c4b29a', residential: '#cbb39a', house: '#e4d5c4', school: '#e7d4bc', public: '#d9d0c0', yes: '#d5d0c6' }[key] || '#d5d0c6';
  x.fillStyle = wall; x.fillRect(0, 0, 128, 128);
  if (key === 'school') { x.fillStyle = '#7d9a62'; x.fillRect(0, 0, 128, 10); }
  if (key === 'office') {
    x.fillStyle = glass; x.fillRect(8, 8, 112, 96);
    x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(8, 8, 26, 96);
    x.fillStyle = band; x.fillRect(60, 8, 4, 96); x.fillRect(0, 108, 128, 20);
    return;
  }
  const wide = key === 'commercial' || key === 'school';
  const winW = wide ? 46 : key === 'house' || key === 'public' ? 28 : 36;
  const winH = key === 'house' ? 40 : key === 'public' ? 70 : wide ? 64 : 68;
  const winY = key === 'house' ? 28 : key === 'school' ? 22 : 18;
  x.fillStyle = glass;
  x.fillRect(16, winY, winW, winH);
  x.fillRect(128 - 16 - winW, winY, winW, winH);
  x.fillStyle = 'rgba(255,255,255,0.22)';
  x.fillRect(16, winY, 10, winH);
  x.fillRect(128 - 16 - winW, winY, 10, winH);
  if (key === 'residential') { x.fillStyle = '#e7d3bf'; x.fillRect(10, 92, 108, 8); }
  x.fillStyle = band; x.fillRect(0, 108, 128, 20);
}
