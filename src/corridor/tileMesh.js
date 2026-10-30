// [corridor] 코리더 타일 → three.js 메시. 라이브 정자(world.js)와 같은 색·높이·지오메트리 헬퍼를 그대로 쓴다.
//   - 상세 타일: 바닥/공원/물(1) + 도로·중앙선(1) + 지붕(1) + 벽(파사드 종류별) + 가로수(2) + 창 불빛(1)
//     색은 정점 색으로 합쳐 draw call 을 줄인다(정점 색 × 흰 재질 = 라이브의 단색 재질과 같은 결과).
//   - LOD 타일: 단순화한 바닥·도로·건물 상자 3 메시 (멀리서 안개 속에 보이는 용도)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ROAD_STYLE, PARK_COLOR, BUILDING_COLOR, toShape, flatGeo, ribbonGeo, fixNormalsUp,
  FACADE_UV, facadeKey, takeGroup, facadeMaterial, Grid, pointInRing,
} from '../world.js';
import { addInstancedTrees } from '../world/trees.js';
import { addWindowLights } from '../world/windowLights.js';
import { NIGHT_ON, nightKind, nightSeed, nightCut, nightFacade, nightLodMaterial } from './nightLights.js';

export const CAR_KINDS = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link']);
const TREE_KINDS = new Set(['primary', 'secondary', 'tertiary']);
const LINE_KINDS = new Set(['primary', 'secondary', 'trunk']);
const BLOCK = '#ebe4d4', WATER = '#7ec3e6', CENTER_LINE = '#f2d36b';
const DEFAULT_ROAD = ['#b4b7bc', 0.08];

let flatMat = null;
const vcMat = () => (flatMat ||= new THREE.MeshLambertMaterial({ vertexColors: true }));
const tmpC = new THREE.Color();
function paint(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  const c = color.isColor ? color : tmpC.set(color);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const strip = (g) => { if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1'); return g; };
function merged(geos) {
  const list = geos.filter(Boolean);
  if (!list.length) return null;
  const g = mergeGeometries(list);
  for (const x of list) x.dispose();
  return g;
}
const parkY = (k) => (k === 'plaza' ? 0.03 : 0.02 + (k === 'park' ? 0 : 0.005));

// 바닥·공원·물·물길 (모두 수평 평면)
function flatLayer(t, terrain) {
  const geos = [];
  const add = (g, color) => { if (g) geos.push(paint(fixNormalsUp(strip(g)), color)); };
  add(flatGeo(t.floor || [], 0.01), BLOCK);
  const byKind = {};
  for (const p of t.parks || []) (byKind[p.k] ||= []).push(p);
  for (const [k, list] of Object.entries(byKind)) add(flatGeo(list, parkY(k)), PARK_COLOR[k] || '#b5dda3');
  add(flatGeo(t.water || [], 0.04), WATER);
  for (const l of t.wl || []) {
    const pts = terrain ? l.p.map(([x, z]) => [x, z, terrain.baseHeight(x, z) < -0.5 ? terrain.params.WATER - 0.005 : 0]) : l.p;
    add(ribbonGeo(pts, l.w, 0.035), WATER);
  }
  const g = merged(geos);
  if (!g) return null;
  const m = new THREE.Mesh(g, vcMat()); m.receiveShadow = true; m.name = 'corridorFlat';
  return m;
}

// 도로 + 중앙선 (라이브 ROAD_STYLE 색/높이, 다리 +0.02)
export function roadGeometries(roads, { lines = true, caps = true } = {}) {
  const geos = [];
  for (const r of roads) {
    if (!r.p || r.p.length < 2) continue;
    const [color, y] = ROAD_STYLE[r.k] || DEFAULT_ROAD;
    geos.push(paint(ribbonGeo(r.p, r.w, y + (r.br ? 0.02 : 0), caps), color));
  }
  if (lines) for (const r of roads) if (LINE_KINDS.has(r.k) && r.p.length >= 2) geos.push(paint(ribbonGeo(r.p, 0.35, 0.09, false), CENTER_LINE));
  return geos;
}
export function roadMesh(roads, opts) {
  const g = merged(roadGeometries(roads, opts));
  if (!g) return null;
  const m = new THREE.Mesh(g, vcMat()); m.receiveShadow = true; m.name = 'corridorRoads';
  return m;
}

// 건물: world.js buildWorld 의 건물 루프와 같은 색 규칙(종류색 + 시드 편차, 지붕 어둡게, 벽은 파사드 텍스처)
function buildingMeshes(list, seed0) {
  const roofs = [], walls = {};
  const c = new THREE.Color(), roof = new THREE.Color(), wallTint = new THREE.Color();
  let seed = seed0 % 2147483647 || 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const b of list) {
    if (b.nr) continue;
    const minH = b.mh || 0, h = Math.max(0.35, b.h - minH);
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
    if (NIGHT_ON) { // [corridor] 저녁 불빛 속성 (건물마다 고정)
      const { seed, z } = nightSeed(b), kind = z > nightCut() ? 0 : nightKind(b);
      const shop = !minH && (kind === 3 || (kind === 4 && b.h <= 15 && seed < 0.4)) ? 1 : 0;
      const nl = new Float32Array(nrm.count * 3); for (let i = 0; i < nrm.count; i++) { nl[i * 3] = seed; nl[i * 3 + 1] = kind; nl[i * 3 + 2] = shop; }
      g.setAttribute('aNL', new THREE.BufferAttribute(nl, 3));
    }
    const cap = takeGroup(g, 0), side = takeGroup(g, 1);
    g.dispose();
    if (cap) { if (cap.attributes.uv) cap.deleteAttribute('uv'); if (cap.attributes.aNL) cap.deleteAttribute('aNL'); roofs.push(cap); }
    if (side) (walls[facadeKey(b.k)] ||= []).push(side);
  }
  const out = [];
  const rg = merged(roofs);
  if (rg) { const m = new THREE.Mesh(rg, vcMat()); m.castShadow = m.receiveShadow = true; out.push(m); }
  for (const [key, geos] of Object.entries(walls)) {
    const g = merged(geos); if (!g) continue;
    const m = new THREE.Mesh(g, nightFacade(facadeMaterial(key), key)); m.castShadow = m.receiveShadow = true; out.push(m);
  }
  return out;
}

const hashKey = (key) => { let h = 2166136261; for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) || 1; };
const segNear = (x, z, { ax, az, bx, bz, hw }) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(ax + dx * t - x, az + dz * t - z) < hw;
};

// 상세 타일 전체. onRoadAll/blockedAll 은 라이브+코리더 전체 판정(가로수 배치용).
export function buildDetailTile(key, t, { terrain, onRoadAll }) {
  const group = new THREE.Group(); group.name = 'corridorTile:' + key;
  const flat = flatLayer(t, terrain); if (flat) group.add(flat);
  const roads = roadMesh(t.r); if (roads) group.add(roads);
  for (const m of buildingMeshes(t.b, hashKey(key))) group.add(m);

  // 충돌(라이브와 같은 규칙: 아래가 뜬 건물(mh>=2.5)은 제외)
  const colliders = new Grid(40);
  for (const b of t.b) {
    if ((b.mh || 0) >= 2.5) continue;
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (const [x, z] of b.o) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
    colliders.add(b.o, mnx, mnz, mxx, mxz);
  }
  const roadGrid = new Grid(30);
  for (const r of t.r) {
    if (!CAR_KINDS.has(r.k)) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], hw = r.w / 2 + 0.6;
      roadGrid.add({ ax, az, bx, bz, hw }, Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw);
    }
  }
  const onRoad = (x, z) => roadGrid.query(x, z).some((s) => segNear(x, z, s));
  const blocked = (x, z) => colliders.query(x, z).some((ring) => pointInRing(x, z, ring));

  // 가로수: buildWorld 와 같은 간격/오프셋/파라미터. 겹침(o) 구간은 이웃 조각이 심으므로 건너뜀.
  const treePts = [];
  let seed = hashKey('trees' + key) % 2147483647 || 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const r of t.r) {
    if (!TREE_KINDS.has(r.k)) continue;
    const [oh, ot] = r.o || [0, 0];
    for (let i = 1 + oh; i < r.p.length - ot; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-3) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 6; s < L; s += 14) for (const side of [-1, 1]) {
        const x = ax + ((bx - ax) * s) / L + nx * side * (r.w / 2 + 1.6), z = az + ((bz - az) * s) / L + nz * side * (r.w / 2 + 1.6);
        if (terrain && terrain.renderHeight(x, z) < -0.3) continue;
        if (!onRoad(x, z) && !onRoadAll(x, z) && !blocked(x, z)) treePts.push([x, z]);
      }
    }
  }
  const trees = addInstancedTrees(group, treePts, {
    rnd, crownRadius: 2.2, crownY: 5, trunkTop: 0.2, trunkBottom: 0.28, trunkHeight: 3.6, trunkColor: '#8a6b4e', scaleMin: 0.8, scaleSpan: 0.5,
  });
  const lights = addWindowLights(group, t.b.filter((b) => !b.nr));
  return {
    group, colliders, onRoad, blocked, treeCount: treePts.length,
    dispose() {
      lights?.stop?.();
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        if (o === trees?.crowns || o === lights?.mesh) o.material?.dispose(); // 나무 줄기·파사드·정점색 재질은 공유 캐시라 유지
      });
      group.removeFromParent();
    },
  };
}

// ---------- LOD ----------
const unflat = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
const FACADE_WALL = { office: '#a9bccf', commercial: '#c3cfdb', residential: '#e2d3c3', house: '#e3d9ca', school: '#ead9c4', public: '#d8d0c2', yes: '#d7d2c9' };
function prismGeo(list, kinds) {
  const pos = [], col = [], idx = [], nl = [];
  const c = new THREE.Color(), roof = new THREE.Color(), wall = new THREE.Color();
  for (const [h, mh, ki, fl] of list) {
    const ring = unflat(fl); if (ring.length < 3) continue;
    const k = kinds[ki] || 'yes';
    const { seed, z: cz } = nightSeed({ o: ring }), kind = cz > nightCut() ? 0 : nightKind({ k }); let u = 0;
    c.set(BUILDING_COLOR[k] || BUILDING_COLOR.yes); roof.copy(c).offsetHSL(0, -0.05, -0.12);
    wall.set(FACADE_WALL[facadeKey(k)] || FACADE_WALL.yes);
    const y0 = mh || 0, y1 = Math.max(y0 + 0.35, h);
    // 벽
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], b = pos.length / 3;
      pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
      for (let j = 0; j < 4; j++) col.push(wall.r, wall.g, wall.b);
      const L = Math.hypot(x1 - x0, z1 - z0); nl.push(u, seed, kind, u + L, seed, kind, u + L, seed, kind, u, seed, kind); u += L;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2); // 양면(링 방향 무관)
    }
    // 지붕
    const v2 = ring.map(([x, z]) => new THREE.Vector2(x, z));
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch { tris = []; }
    const b = pos.length / 3;
    for (const [x, z] of ring) { pos.push(x, y1, z); col.push(roof.r, roof.g, roof.b); nl.push(0, 0, 0); }
    for (const [a, bb, cc] of tris) idx.push(b + a, b + bb, b + cc, b + a, b + cc, b + bb);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (NIGHT_ON) g.setAttribute('aNL', new THREE.Float32BufferAttribute(nl, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function buildLodTile(key, L, { roadKinds, buildingKinds }) {
  const group = new THREE.Group(); group.name = 'corridorLod:' + key;
  const geos = [];
  const add = (g, color) => { if (g) geos.push(paint(fixNormalsUp(strip(g)), color)); };
  const polys = (arr) => arr.map(([o, ...holes]) => ({ o: unflat(o), holes: holes.map(unflat) }));
  add(flatGeo(polys(L.f), 0.01), BLOCK);
  const byKind = {};
  for (const [k, ...rest] of L.p) (byKind[k] ||= []).push(rest);
  for (const [k, list] of Object.entries(byKind)) add(flatGeo(polys(list), parkY(k)), PARK_COLOR[k] || '#b5dda3');
  add(flatGeo(polys(L.w), 0.04), WATER);
  const fg = merged(geos);
  if (fg) { const m = new THREE.Mesh(fg, vcMat()); m.receiveShadow = true; group.add(m); }
  const roads = L.r.map(([w, ki, fl, br]) => ({ w, k: roadKinds[ki], p: unflat(fl), br }));
  const rm = roadMesh(roads, { lines: false }); if (rm) { rm.receiveShadow = false; group.add(rm); }
  const bg = prismGeo(L.b, buildingKinds);
  if (bg) { const m = new THREE.Mesh(bg, nightLodMaterial(vcMat())); m.name = 'corridorLodBuildings'; group.add(m); }
  return {
    group,
    dispose() { group.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); }); group.removeFromParent(); },
  };
}
