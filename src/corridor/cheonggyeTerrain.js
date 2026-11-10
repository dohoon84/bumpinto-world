// [gyeongbu-bus] 판교IC–양재IC 청계산·인릉산 지형. 공개 DEM(AWS Terrain Tiles / SRTM 계열)을
//   경부 본선 중앙값 기준으로 상대 높이화했다. 도로 주변은 0m 로 펴서 버스가 산에 파묻히지 않게 한다.
//   DEM 격자는 50m 이라, 도로·청계산로 근처 칸만 10m 로 나눠 펴지 않으면 보간된 잔디가 아스팔트(y=0.30)를 덮는다.
//   수목은 도로 근처를 촘촘히, 먼 사면은 숲 색 지면에 맡긴다. 방음벽은 청계산입구·원지동 주택가 쪽에만 연속 패널.
//   청계산입구 건물은 OSM 윤곽·층고(있으면)이고, 신분당선 출입구는 OSM railway=subway_entrance(1·2번)에 정자역과 같은 캐노피·계단을 세운 뒤 광장(포장·자전거 거치대·가로수·가로등·키 높이 폴 사인)을 곁들인다.
//   출입구 주변 차도·보도·횡단보도·버스 정류장은 OSM(청계산로와 옆 길)에서 구운 cheonggye-streets.json 으로 깔아, 출입구가 잔디 위가 아니라 인도 옆에 앉게 한다.
//   ?cgterrain=0 또는 ?gangnam=0 이면 만들지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { watchEvening } from '../evening.js';
import { ribbonGeo, fixNormalsUp, ROAD_STYLE } from '../world.js';
import { buildingMeshes } from './tileMesh.js';
import { CHEONGGYE_FLAT_R } from './gyeongbuWorld.js';
export const CHEONGGYE_DEM_FILE = 'gyeongbu/cheonggye-dem.json';
export const CHEONGGYE_BUILDINGS_FILE = 'gyeongbu/cheonggye-buildings.json';
export const CHEONGGYE_STREETS_FILE = 'gyeongbu/cheonggye-streets.json';
export const CHEONGGYE_GROUND_FINE = 10; // 도로 근처 DEM 칸을 나누는 간격(m)
export const CHEONGGYE_REFINE_R = 130; // 이 거리 안 칸은 10m 로 나눠 평탄화 골짜기를 살린다

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

function makeDistFn(segs, cell = 80) {
  if (!segs.length) return () => Infinity;
  const map = new Map();
  const key = (ix, iz) => ix * 100003 + iz;
  for (const s of segs) {
    const minx = Math.min(s.ax, s.ax + s.dx), maxx = Math.max(s.ax, s.ax + s.dx);
    const minz = Math.min(s.az, s.az + s.dz), maxz = Math.max(s.az, s.az + s.dz);
    for (let iz = Math.floor(minz / cell); iz <= Math.floor(maxz / cell); iz++) {
      for (let ix = Math.floor(minx / cell); ix <= Math.floor(maxx / cell); ix++) {
        const k = key(ix, iz);
        let b = map.get(k);
        if (!b) map.set(k, (b = []));
        b.push(s);
      }
    }
  }
  return (x, z) => {
    const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
    let best = Infinity;
    const maxR = 4;
    for (let ring = 0; ring <= maxR; ring++) {
      for (let jz = iz - ring; jz <= iz + ring; jz++) {
        for (let jx = ix - ring; jx <= ix + ring; jx++) {
          if (ring && jz !== iz - ring && jz !== iz + ring && jx !== ix - ring && jx !== ix + ring) continue;
          const b = map.get(key(jx, jz));
          if (!b) continue;
          for (const s of b) {
            const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.L2));
            const d = Math.hypot(s.ax + s.dx * t - x, s.az + s.dz * t - z);
            if (d < best) best = d;
          }
        }
      }
      if (best <= (ring + 0.51) * cell) break;
    }
    return best;
  };
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

const WALK_COL = '#e2d3b5', CURB_COL = '#9a958a', ZEBRA = '#f3f1ea';
const BUS_POLE = '#5c6370';

function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    out.push([pts[i][0] + dz * off, pts[i][1] - dx * off]);
  }
  return out;
}

function streetSegs(streets) {
  const segs = [];
  for (const r of streets?.roads || []) {
    const pts = r.p || [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      segs.push({ ax: a[0], az: a[1], dx, dz, L2, hw: (r.w || 6) * 0.5 + 0.4 });
    }
  }
  return segs;
}

function onStreet(x, z, segs) {
  for (const s of segs) {
    const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.L2));
    if (Math.hypot(s.ax + s.dx * t - x, s.az + s.dz * t - z) < s.hw) return true;
  }
  return false;
}

function paintRibbon(pts, w, y, color, caps = true) {
  if (!pts || pts.length < 2) return null;
  return coloredFrom(fixNormalsUp(ribbonGeo(pts, w, y, caps)), color);
}

function coloredFrom(g, color) {
  const c = new THREE.Color(color);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function dressBuildingList(list) {
  return (list || []).map((b) => {
    const nm = b.name || b.n || '';
    if (/호텔/.test(nm) || b.k === 'hotel') return { ...b, k: 'commercial' };
    if (b.k === 'yes' && (b.h || 0) <= 16) return { ...b, k: 'commercial' };
    return b;
  });
}

function ringCentroid(ring) {
  let x = 0, z = 0, n = 0;
  for (let i = 0; i < ring.length - 1; i++) { x += ring[i][0]; z += ring[i][1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}

function makeHotelSignTex(text) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 192;
  const x = cv.getContext('2d');
  x.fillStyle = '#2a333c';
  x.fillRect(0, 0, 1024, 192);
  x.fillStyle = '#f2efe8';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 78px sans-serif';
  x.fillText(text, 512, 96);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildStreetFrontExtras(buildings) {
  const g = new THREE.Group();
  g.name = 'cheonggyeBuildingExtras';
  const solid = [];
  for (const b of buildings || []) {
    const ring = b.o;
    if (!ring || ring.length < 4) continue;
    const h = b.h || 9;
    const c = ringCentroid(ring);
    const seed = Math.abs(Math.sin((c.x + 17) * 12.9898 + (c.z + 3) * 78.233)) % 1;
    if (b.k === 'commercial' || b.k === 'residential') {
      const nBox = b.k === 'commercial' ? 2 + (seed > 0.55 ? 1 : 0) : (seed > 0.65 ? 2 : 1);
      for (let i = 0; i < nBox; i++) {
        const ang = seed * 6.2 + i * 1.7;
        const rad = 2.2 + i * 1.1;
        const bx = c.x + Math.cos(ang) * rad, bz = c.z + Math.sin(ang) * rad;
        if (!inFootprint(bx, bz, ring)) continue;
        const bw = 1.4 + (seed * 0.6), bd = 1.1 + ((seed + i * 0.2) % 1) * 0.5;
        solid.push(coloredBox(bw, 0.85, bd, i ? '#8a9098' : '#7a818a', bx, h + 0.5, bz, ang));
      }
      if (b.k === 'commercial') {
        solid.push(coloredBox(2.4, 0.18, 2.4, '#6d7380', c.x, h + 0.12, c.z, seed));
      }
    }
    const nm = b.name || b.n || '';
    if (/호텔/.test(nm)) {
      let best = null;
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = ring[i][0], az = ring[i][1], bx = ring[i + 1][0], bz = ring[i + 1][1];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
        const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
        const n1x = -dz / L, n1z = dx / L;
        const d1 = Math.hypot(mx + n1x * 2 - STATION.x, mz + n1z * 2 - STATION.z);
        const d2 = Math.hypot(mx - n1x * 2 - STATION.x, mz - n1z * 2 - STATION.z);
        const sign = d1 < d2 ? 1 : -1;
        const d = Math.min(d1, d2);
        if (!best || L > best.L * 0.92 && d < best.d + 8 || d + 4 < best.d) {
          best = { mx, mz, L, nx: n1x * sign, nz: n1z * sign, ang: Math.atan2(dx, dz), d };
        }
      }
      if (best && best.L > 12) {
        const y = Math.min(h - 1.6, 6.4);
        const w = Math.min(14, best.L * 0.42);
        const px = best.mx + best.nx * 0.18, pz = best.mz + best.nz * 0.18;
        solid.push(coloredBox(w + 0.3, 1.15, 0.12, '#2a333c', px, y, pz, best.ang));
        const tex = makeHotelSignTex(nm);
        const geo = new THREE.PlaneGeometry(w, 0.95);
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
        const face = new THREE.Mesh(geo, mat);
        face.position.set(px + best.nx * 0.08, y, pz + best.nz * 0.08);
        face.lookAt(px + best.nx * 2, y, pz + best.nz * 2);
        face.name = 'cheonggyeHotelSign';
        g.add(face);
      }
    }
  }
  if (solid.length) {
    const mesh = new THREE.Mesh(mergeGeometries(solid), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'cheonggyeRoofDetails';
    mesh.castShadow = true;
    g.add(mesh);
    for (const x of solid) x.dispose();
  }
  return g.children.length ? g : null;
}

function makeBusStopTex(stop) {
  const cv = document.createElement('canvas');
  cv.width = 384; cv.height = 512;
  const x = cv.getContext('2d');
  x.fillStyle = '#1f4f9a';
  x.fillRect(0, 0, 384, 512);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 48px sans-serif';
  x.fillText('버스', 192, 58);
  x.fillStyle = '#e8eef8';
  x.font = 'bold 36px sans-serif';
  const name = String(stop.name || '버스정류장');
  x.fillText(name.length > 10 ? name.slice(0, 10) : name, 192, 160);
  if (name.length > 10) x.fillText(name.slice(10, 20), 192, 206);
  if (stop.ref) {
    x.fillStyle = '#fff';
    x.font = 'bold 72px sans-serif';
    x.fillText(String(stop.ref), 192, 320);
  }
  if (stop.routes) {
    x.fillStyle = '#d5deee';
    x.font = '600 28px sans-serif';
    x.fillText(String(stop.routes).replace(/;/g, '  '), 192, 420);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function addZebra(parts, pts) {
  if (!pts || pts.length < 2) return;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const fx = dx / L, fz = dz / L, lx = fz, lz = -fx;
    const ang = Math.atan2(dx, dz);
    for (let t = 0.2; t < L; t += 0.55) {
      parts.push(coloredBox(3.5, 0.04, 0.32, ZEBRA, a[0] + fx * t, 0.28, a[1] + fz * t, ang));
    }
  }
}

function buildLocalStreets(streets, buildings) {
  const g = new THREE.Group();
  g.name = 'cheonggyeLocalStreets';
  if (!streets?.roads?.length && !streets?.stops?.length) return { group: g, night: [] };
  const geos = [];
  const extras = [];
  const night = [];
  for (const r of streets.roads || []) {
    if (!r.p || r.p.length < 2) continue;
    const [color, y0] = ROAD_STYLE[r.k] || ['#b4b7bc', 0.08];
    const y = y0 + 0.12;
    const strip = paintRibbon(r.p, r.w, y, color, true);
    if (strip) geos.push(strip);
    const sw = 2.55, curb = 0.2;
    const swOff = r.w * 0.5 + 0.18 + sw * 0.5;
    const curbOff = r.w * 0.5 + 0.12;
    for (const side of [-1, 1]) {
      const walk = paintRibbon(offsetLine(r.p, swOff * side), sw, 0.22, WALK_COL, false);
      if (walk) geos.push(walk);
      const cb = paintRibbon(offsetLine(r.p, curbOff * side), curb, 0.26, CURB_COL, false);
      if (cb) geos.push(cb);
    }
    if (r.k === 'tertiary' || r.k === 'secondary' || r.lanes === 2) {
      const line = paintRibbon(r.p, 0.18, y + 0.015, '#f2d36b', false);
      if (line) geos.push(line);
    }
  }
  for (const c of streets.crossings || []) addZebra(extras, c.p);
  for (const s of streets.stops || []) {
    if (nearBuilding(s.x, s.z, buildings, 1.2)) continue;
    extras.push(coloredBox(0.09, 2.7, 0.09, BUS_POLE, s.x, 1.35, s.z));
    extras.push(coloredBox(0.62, 0.84, 0.05, '#1f4f9a', s.x, 2.28, s.z));
    const tex = makeBusStopTex(s);
    const geo = new THREE.PlaneGeometry(0.58, 0.78);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
    const face = new THREE.Mesh(geo, mat);
    face.position.set(s.x, 2.28, s.z + 0.04);
    face.name = 'cheonggyeBusStop';
    g.add(face);
  }
  if (geos.length) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'cheonggyeStreetMesh';
    mesh.receiveShadow = true;
    g.add(mesh);
    for (const x of geos) x.dispose();
  }
  if (extras.length) {
    const mesh = new THREE.Mesh(mergeGeometries(extras), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'cheonggyeStreetExtras';
    mesh.receiveShadow = true;
    g.add(mesh);
    for (const x of extras) x.dispose();
  }
  return { group: g, night };
}

// 4+4 본선(반대편까지 ~28m)이 산에 파묻히지 않게 더 넓게 편다.
function terrainHeight(raw, dist, distLocal = Infinity) {
  const flat = CHEONGGYE_FLAT_R;
  if (dist < flat) return 0;
  let y = raw;
  if (dist < 115) y = raw * ((dist - flat) / (115 - flat));
  y = Math.max(0, y);
  if (dist < 260) y = Math.max(y, Math.min(16, (dist - flat) * 0.038));
  // DEM 격자 50m — 보간된 지면이 청계산로를 덮지 않게 길을 넓게 편다.
  if (distLocal < 42) return 0;
  if (distLocal < 85) y *= (distLocal - 42) / 43;
  return y;
}

function heightAtPoint(x, z, dem, segs, localSegs) {
  return terrainHeight(
    sampleH(dem, x, z),
    distToRoad(x, z, segs),
    localSegs.length ? distToRoad(x, z, localSegs) : Infinity,
  );
}

/** 테스트·노면 검사: DEM 상대 높이(본선·청계산로 주변은 0). 격자 밖은 null. */
export function cheonggyeHeightAt(x, z, dem, streets = null, extraRoad = null) {
  if (!dem?.h?.length) return null;
  const { x0, z0, dx, dz, nx, nz } = dem;
  if (x < x0 || z < z0 || x > x0 + (nx - 1) * dx || z > z0 + (nz - 1) * dz) return null;
  const { segs, local } = prepareRoadSegs(dem, streets, extraRoad);
  return heightAtPoint(x, z, dem, segs, local);
}

/** 화면에 깔리는 지면 메시와 같은 보간(10m 격자, 두 삼각형). */
export function cheonggyeMeshHeightAt(x, z, dem, streets = null, extraRoad = null) {
  if (!dem?.h?.length) return null;
  const { x0, z0, dx, dz, nx, nz } = dem;
  if (x < x0 || z < z0 || x > x0 + (nx - 1) * dx || z > z0 + (nz - 1) * dz) return null;
  const { segs, local } = prepareRoadSegs(dem, streets, extraRoad);
  const step = CHEONGGYE_GROUND_FINE;
  const fx = (x - x0) / step, fz = (z - z0) / step;
  const maxX = (nx - 1) * dx, maxZ = (nz - 1) * dz;
  const jx = Math.max(0, Math.min(Math.floor(maxX / step) - 1, Math.floor(fx)));
  const jz = Math.max(0, Math.min(Math.floor(maxZ / step) - 1, Math.floor(fz)));
  const tx = fx - jx, tz = fz - jz;
  const yAt = (px, pz) => heightAtPoint(px, pz, dem, segs, local);
  const at = (sx, sz) => yAt(x0 + (jx + sx) * step, z0 + (jz + sz) * step);
  return triHeight(tx, tz, at(0, 0), at(1, 0), at(0, 1), at(1, 1));
}

function sampleH(data, x, z) {
  const { x0, z0, dx, dz, nx, nz, h } = data;
  const fx = (x - x0) / dx, fz = (z - z0) / dz;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= nx - 1 || iz >= nz - 1) {
    const cx = Math.max(0, Math.min(nx - 1, Math.round(fx)));
    const cz = Math.max(0, Math.min(nz - 1, Math.round(fz)));
    return h[cz * nx + cx] || 0;
  }
  const tx = fx - ix, tz = fz - iz;
  const h00 = h[iz * nx + ix] || 0;
  const h10 = h[iz * nx + ix + 1] || 0;
  const h01 = h[(iz + 1) * nx + ix] || 0;
  const h11 = h[(iz + 1) * nx + ix + 1] || 0;
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
}

function prepareRoadSegs(dem, streets, extraRoad) {
  const road = [...(dem.road || [])];
  if (extraRoad?.length) for (const p of extraRoad) road.push([p[0], p[1]]);
  const segs = segsFromRoad(road);
  const local = [];
  for (const r of streets?.roads || []) if (r.p && r.p.length >= 2) local.push(...segsFromRoad(r.p));
  return { segs, local };
}

function triHeight(tx, tz, h00, h10, h01, h11) {
  if (tx + tz <= 1) return (1 - tx - tz) * h00 + tx * h10 + tz * h01;
  return (1 - tz) * h10 + (1 - tx) * h01 + (tx + tz - 1) * h11;
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

function groundColor(y, dist, hx, hz) {
  const grass = new THREE.Color('#5b7a45');
  const woods = new THREE.Color('#3a5a32');
  const forest = new THREE.Color('#2a4528');
  const canopy = new THREE.Color('#1e3820');
  const rock = new THREE.Color('#8b8680');
  if (y < 22 && dist < 90) return grass;
  if (y > 320) return rock;
  const n = hash01(hx, hz);
  if (dist > 70 || y > 28) return n > 0.62 ? forest : n > 0.28 ? woods : canopy;
  return grass;
}

function buildGround(data, segs, localSegs = []) {
  const { x0, z0, dx, dz, nx, nz } = data;
  const step = CHEONGGYE_GROUND_FINE;
  const skirt = 220;
  const sk = Math.round(skirt / step);
  const fineNx = Math.floor(((nx - 1) * dx) / step) + 1;
  const fineNz = Math.floor(((nz - 1) * dz) / step) + 1;
  const Nx = fineNx + sk * 2, Nz = fineNz + sk * 2;
  const ox = x0 - sk * step, oz = z0 - sk * step;
  const xMax = x0 + (nx - 1) * dx, zMax = z0 + (nz - 1) * dz;
  const distRoad = makeDistFn(segs);
  const distLocal = localSegs.length ? makeDistFn(localSegs) : () => Infinity;
  const yAt = (x, z) => terrainHeight(sampleH(data, x, z), distRoad(x, z), distLocal(x, z));
  const pos = new Float32Array(Nx * Nz * 3);
  const col = new Float32Array(Nx * Nz * 3);
  for (let iz = 0; iz < Nz; iz++) {
    for (let ix = 0; ix < Nx; ix++) {
      const i = iz * Nx + ix;
      const x = ox + ix * step, z = oz + iz * step;
      const inside = x >= x0 && z >= z0 && x <= xMax && z <= zMax;
      let y, dist;
      if (inside) {
        dist = distRoad(x, z);
        y = yAt(x, z);
      } else {
        const cx = Math.max(x0, Math.min(xMax, x));
        const cz = Math.max(z0, Math.min(zMax, z));
        dist = distRoad(cx, cz);
        const edgeY = yAt(cx, cz);
        const fade = Math.max(0, 1 - Math.hypot(x - cx, z - cz) / skirt);
        y = edgeY * fade;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const c = groundColor(y, dist, Math.round(x * 0.2), Math.round(z * 0.2));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((Nx - 1) * (Nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < Nz - 1; iz++) {
    for (let ix = 0; ix < Nx - 1; ix++) {
      const a = iz * Nx + ix, b = a + 1, c = a + Nx, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'cheonggyeGround';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  // 나무는 예전처럼 50m 격자 꼭짓점만 쓴다(도로에서 32m 밖).
  const treePos = new Float32Array(nx * nz * 3);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = x0 + ix * dx, z = z0 + iz * dz;
      treePos[i * 3] = x;
      treePos[i * 3 + 1] = yAt(x, z);
      treePos[i * 3 + 2] = z;
    }
  }
  return { mesh, pos: treePos, nx, nz, x0, z0, dx, dz };
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

function buildStationPlazas(exits, buildings, gy, streets) {
  const g = new THREE.Group();
  g.name = 'cheonggyeStationPlazas';
  const solid = [];
  const night = [];
  const treeMats = [];
  const treeGeo = treePrototype('#5a4030', '#356338', 1.85, 4.4);
  const TILE_A = '#c9c4b8', TILE_B = '#b7b2a6', CURB = '#9a958a', STEEL = '#8b929a', POLE = '#6b7280';
  const roadSegs = streetSegs(streets);
  for (const e of exits) {
    const y0 = gy(e.x, e.z);
    const s = Math.sin(e.ry), c = Math.cos(e.ry);
    const at = (u, w) => ({ x: e.x + u * c + w * s, z: e.z - u * s + w * c });
    const put = (w, h, d, color, u, y, w0, ang = 0) => {
      const p = at(u, w0);
      solid.push(coloredBox(w, h, d, color, p.x, y, p.z, e.ry + ang));
    };
    // 타일 포장 — 계단 구멍·건물·차도는 비우고, 가까운 청계산로 인도까지 이어 준다
    for (let iu = -12; iu <= 12; iu++) {
      for (let iw = -18; iw <= 10; iw++) {
        const u = iu * 1.55, w = iw * 1.55;
        if (Math.abs(u) < 1.85 && w > -0.5 && w < 6.3) continue;
        const p = at(u, w);
        if (nearBuilding(p.x, p.z, buildings, 1.6)) continue;
        if (onStreet(p.x, p.z, roadSegs)) continue;
        const col = ((iu + iw) & 1) ? TILE_A : TILE_B;
        solid.push(coloredBox(1.48, 0.07, 1.48, col, p.x, gy(p.x, p.z) + 0.05, p.z, e.ry));
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
    // 키 높이(~2.5m) 폴 사인. 캐노피 이마·기둥 표지는 buildEntrances 가 그대로 둔다.
    {
      const u = -3.55, w = -2.55;
      const p = at(u, w);
      if (!nearBuilding(p.x, p.z, buildings, 1.0) && !onStreet(p.x, p.z, roadSegs)) {
        put(0.09, 2.42, 0.09, POLE, u, y0 + 1.21, w);
        put(0.90, 0.58, 0.06, '#1d2228', u, y0 + 2.18, w);
        const tex = makeRoadSignTex(e.ref);
        const geo = new THREE.PlaneGeometry(0.86, 0.54);
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
        const face = new THREE.Mesh(geo, mat);
        face.position.set(p.x - Math.sin(e.ry) * 0.04, y0 + 2.18, p.z - Math.cos(e.ry) * 0.04);
        face.rotation.y = e.ry + Math.PI;
        face.name = 'cheonggyeStationSign';
        g.add(face);
        const back = new THREE.Mesh(geo, mat);
        back.position.set(p.x + Math.sin(e.ry) * 0.04, y0 + 2.18, p.z + Math.cos(e.ry) * 0.04);
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

function buildStationEntrances(list, data, segs, buildings, streets) {
  const g = new THREE.Group();
  g.name = 'cheonggyeEntrances';
  const night = [];
  if (!list?.length) return { group: g, night };
  const local = streetSegs(streets);
  const gy = (x, z) => terrainHeight(sampleH(data, x, z), distToRoad(x, z, segs), local.length ? distToRoad(x, z, local) : Infinity);
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
  // 화강석 캐노피·탑승은 지하철 시스템(STATIONS 청계산입구)이 맡는다. 여기선 광장·가로 시설만.
  const plaza = buildStationPlazas(exits.map((e) => ({ ...e, ry: e.place.ry })), buildings, gy, streets);
  g.add(plaza.group);
  night.push(...plaza.night);
  return { group: g, night };
}

function assemble(data, buildingsData, streetsData) {
  const road = data.road || [];
  const segs = segsFromRoad(road);
  const localSegs = [];
  for (const r of streetsData?.roads || []) {
    if (r.p && r.p.length >= 2) localSegs.push(...segsFromRoad(r.p));
  }
  const g = new THREE.Group();
  g.name = 'cheonggyeTerrainInner';
  const ground = buildGround(data, segs, localSegs);
  g.add(ground.mesh);
  g.add(buildTrees(ground, segs));
  const barriers = buildBarriers(road);
  if (barriers) g.add(barriers);
  g.add(buildRoadsideTrees(road));
  const nightMeshes = [];
  const buildings = dressBuildingList(buildingsData?.buildings || []);
  if (buildings.length) {
    const meshes = buildingMeshes(buildings, 9044);
    for (const m of meshes) {
      m.name = (m.name || 'cheonggyeBldg') + (m.material?.map ? 'Facade' : 'Roof');
      g.add(m);
    }
    const extras = buildStreetFrontExtras(buildings);
    if (extras) g.add(extras);
  }
  const local = buildLocalStreets(streetsData, buildings);
  if (local) {
    g.add(local.group);
    nightMeshes.push(...local.night);
  }
  const ents = buildStationEntrances(buildingsData?.entrances || [], data, segs, buildings, streetsData);
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

export function mountCheonggyeTerrain(scene, { search = typeof location !== 'undefined' ? location.search : '', baseUrl = '', expressPts = null } = {}) {
  if (!cheonggyeTerrainEnabled(search)) return null;
  const g = new THREE.Group();
  g.name = 'cheonggyeTerrain';
  scene.add(g);
  const ctl = { group: g, dispose() { ctl._inner?.dispose(); g.removeFromParent(); } };
  const base = baseUrl || ((import.meta.env && import.meta.env.BASE_URL) || '/');
  const demUrl = `${base}corridor/gyeongbu/${CHEONGGYE_DEM_FILE.split('/').pop()}`;
  const bldUrl = `${base}corridor/gyeongbu/${CHEONGGYE_BUILDINGS_FILE.split('/').pop()}`;
  const strUrl = `${base}corridor/gyeongbu/${CHEONGGYE_STREETS_FILE.split('/').pop()}`;
  Promise.all([
    fetch(demUrl).then((r) => (r.ok ? r.json() : null)),
    fetch(bldUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(strUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([dem, buildings, streets]) => {
    if (!dem?.h?.length) return;
    if (expressPts?.length) dem = { ...dem, road: [...(dem.road || []), ...expressPts.map((p) => [p[0], p[1]])] };
    const built = assemble(dem, buildings, streets);
    g.add(built.group);
    ctl._inner = built;
  }).catch(() => {});
  return ctl;
}
