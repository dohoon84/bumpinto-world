// [hangang] 반포·잠수교 일대 지형 — AWS terrarium DEM + 한강 수면 + 반포한강공원 둔치 테라스.
import * as THREE from 'three';
import { HG, pointInRing, pointInRings, inWater, centroid, projectOnLine } from './hangangCoords.js';

function sampleDem(dem, x, z) {
  if (!dem) return null;
  const { x0, z0, dx, dz, nx, nz, h } = dem;
  const u = (x - x0) / dx, v = (z - z0) / dz;
  if (u < 0 || v < 0 || u > nx - 1 || v > nz - 1) return null;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const i1 = Math.min(nx - 1, i0 + 1), j1 = Math.min(nz - 1, j0 + 1);
  const fu = u - i0, fv = v - j0;
  const a = h[j0 * nx + i0], b = h[j0 * nx + i1], c = h[j1 * nx + i0], d = h[j1 * nx + i1];
  return a * (1 - fu) * (1 - fv) + b * fu * (1 - fv) + c * (1 - fu) * fv + d * fu * fv;
}

function hash01(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function offsetRing(pts, dist) {
  const n = pts.length;
  if (n < 2) return pts || [];
  const closed = Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 1.2;
  const ring = closed ? pts.slice(0, -1) : pts.slice();
  const m = ring.length;
  const out = [];
  for (let i = 0; i < m; i++) {
    const a = ring[(i - 1 + m) % m], p = ring[i], b = ring[(i + 1) % m];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    out.push([p[0] - dz * dist, p[1] + dx * dist]);
  }
  if (closed) out.push(out[0].slice());
  return out;
}

export function measureHangangLevels(dem, osm) {
  const datum = dem?.datum ?? HG.datum;
  const waterSamples = [];
  const park = osm?.park?.ring?.pts || osm?.parks?.find((p) => p.name === '반포한강공원')?.o;
  // DEM inside OSM 한강 rings (outers minus inners)
  if (dem && osm?.water?.outers?.length) {
    const x0 = dem.x0, z0 = dem.z0, x1 = dem.x0 + (dem.nx - 1) * dem.dx, z1 = dem.z0 + (dem.nz - 1) * dem.dz;
    for (let z = z0; z <= z1; z += dem.dz) {
      for (let x = x0; x <= x1; x += dem.dx) {
        if (!inWater(x, z, osm.water)) continue;
        const e = sampleDem(dem, x, z);
        if (e != null && e > -5 && e < 40) waterSamples.push(e);
      }
    }
  }
  waterSamples.sort((a, b) => a - b);
  const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))] : 5.0);
  const waterEle = waterSamples.length ? pct(waterSamples, 0.25) : 5.0;

  const jamsuLine = osm?.jamsu?.centerline?.pts;
  let jamsuSouthEle = 8.7, jamsuNorthEle = 6.0;
  if (jamsuLine?.length >= 2) {
    const a = jamsuLine[0], b = jamsuLine[jamsuLine.length - 1];
    const south = a[1] > b[1] ? a : b;
    const north = a[1] > b[1] ? b : a;
    jamsuSouthEle = sampleDem(dem, south[0], south[1]) ?? jamsuSouthEle;
    jamsuNorthEle = sampleDem(dem, north[0], north[1]) ?? jamsuNorthEle;
  }

  const banpoRing = osm?.banpo?.outline?.pts;
  let banpoSouthEle = 18, banpoNorthEle = 17;
  if (banpoRing?.length && dem) {
    const southPts = [], northPts = [];
    let zMin = Infinity, zMax = -Infinity;
    for (const p of banpoRing) { if (p[1] < zMin) zMin = p[1]; if (p[1] > zMax) zMax = p[1]; }
    const span = (zMax - zMin) || 1;
    for (const p of banpoRing) {
      const e = sampleDem(dem, p[0], p[1]);
      if (e == null || e < 12) continue;
      if ((p[1] - zMin) / span < 0.22) northPts.push(e);
      if ((p[1] - zMin) / span > 0.78) southPts.push(e);
    }
    const med = (arr, fb) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)] : fb);
    banpoSouthEle = med(southPts, banpoSouthEle);
    banpoNorthEle = med(northPts, banpoNorthEle);
  }

  const jamsuThick = 1.05;
  const banpoThick = Number.parseFloat(osm?.banpo?.heightTag) || 3;
  return {
    datum, waterEle, waterY: waterEle - datum,
    jamsuSouthEle, jamsuNorthEle,
    banpoSouthEle, banpoNorthEle,
    jamsuThick, banpoThick,
    waterSamples: waterSamples.length,
  };
}

export function makeHangangHeightAt(dem, osm = null) {
  const datum = dem?.datum ?? HG.datum;
  const lv = measureHangangLevels(dem, osm);
  function eleAt(x, z) {
    const e = sampleDem(dem, x, z);
    if (e == null) return null;
    if (inWater(x, z, osm?.water)) return lv.waterEle;
    // 강변 자전거길 DEM 이 수면 25백분위보다 살짝 낮게 나온 칸은 수면으로 올린다.
    return Math.max(e, lv.waterEle);
  }
  function heightAt(x, z) {
    const e = eleAt(x, z);
    if (e == null) return null;
    return e - datum;
  }
  heightAt.levels = lv;
  heightAt.eleAt = eleAt;
  return heightAt;
}

function jamsuEnds(osm) {
  const line = osm?.jamsu?.centerline?.pts;
  if (!line || line.length < 2) return null;
  const a = line[0], b = line[line.length - 1];
  return a[1] > b[1] ? { south: a, north: b, line } : { south: b, north: a, line };
}

export function jamsuDeckY(x, z, osm, lv) {
  const ends = jamsuEnds(osm);
  if (!ends) return lv.waterY + 2.2;
  const q = projectOnLine(x, z, ends.line);
  if (!q) return lv.waterY + 2.2;
  const southIsStart = ends.line[0][0] === ends.south[0] && ends.line[0][1] === ends.south[1];
  const along = southIsStart ? q.along : (q.total - q.along);
  const t = q.total > 1e-3 ? along / q.total : 0;
  const ele = lv.jamsuSouthEle + (lv.jamsuNorthEle - lv.jamsuSouthEle) * t;
  return Math.max(lv.waterY + 1.8, ele - lv.datum);
}

export function banpoDeckY(x, z, osm, lv, heightAt) {
  const ring = osm?.banpo?.outline?.pts;
  const overWater = inWater(x, z, osm?.water);
  if (!overWater && heightAt) {
    const g = heightAt(x, z);
    if (g != null && g > lv.waterY + 6) return Math.max(g, (Math.min(lv.banpoSouthEle, lv.banpoNorthEle) - lv.datum));
  }
  const axis = osm?.jamsu?.centerline?.pts || ring;
  const q = projectOnLine(x, z, axis);
  const t = q && q.total > 1e-3 ? q.along / q.total : 0.5;
  // axis 는 잠수교 남→북 또는 북→남. 남쪽이 더 큰 z.
  let southT = t;
  if (axis && axis.length >= 2) {
    const a = axis[0], b = axis[axis.length - 1];
    const startIsSouth = a[1] > b[1];
    southT = startIsSouth ? t : 1 - t;
  }
  const ele = lv.banpoSouthEle + (lv.banpoNorthEle - lv.banpoSouthEle) * southT;
  return ele - lv.datum;
}

function shapeFromRing(ring) {
  const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  return sh;
}

function flatPolyMesh(ring, holes, y, color, name) {
  if (!ring || ring.length < 3) return null;
  const sh = shapeFromRing(ring);
  for (const h of holes || []) {
    if (!h || h.length < 3) continue;
    const path = new THREE.Path();
    const pts = h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1] ? h.slice(0, -1) : h;
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    path.closePath();
    sh.holes.push(path);
  }
  const geo = new THREE.ShapeGeometry(sh, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

function riverFacingEdges(park, water, step = 8) {
  if (!park || park.length < 3) return [];
  const edges = [];
  for (let i = 1; i < park.length; i++) {
    const a = park[i - 1], b = park[i];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    // 강 쪽 변: 중점에서 약간 바깥(북쪽, z 감소) 또는 물이 가깝다
    let near = inWater(mx, mz - 6, water) || inWater(mx, mz + 6, water) || inWater(mx - 6, mz, water) || inWater(mx + 6, mz, water);
    if (!near && water?.outers) {
      for (const o of water.outers) {
        const q = projectOnLine(mx, mz, o.o);
        if (q && q.dist < 28) { near = true; break; }
      }
    }
    if (!near) continue;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n;
      edges.push({
        a: [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        b: [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
      });
    }
  }
  return edges;
}

export function createHangangTerrain({ parent, dem, osm }) {
  const group = new THREE.Group();
  group.name = 'hangang-terrain';
  parent.add(group);
  const heightAt = makeHangangHeightAt(dem, osm);
  const lv = heightAt.levels;
  const datum = lv.datum;
  let bounds = dem
    ? { x0: dem.x0, z0: dem.z0, x1: dem.x0 + (dem.nx - 1) * dem.dx, z1: dem.z0 + (dem.nz - 1) * dem.dz }
    : { x0: -12000, z0: -18000, x1: -8500, z1: -14800 };

  const mats = [];

  if (dem) {
    const sub = 2;
    const nx = (dem.nx - 1) * sub + 1, nz = (dem.nz - 1) * sub + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const idx = [];
    const parkRings = (osm?.parks || []).map((p) => p.o).filter((o) => o && o.length >= 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = dem.x0 + (i / sub) * dem.dx;
        const z = dem.z0 + (j / sub) * dem.dz;
        let y = heightAt(x, z);
        if (y == null) y = lv.waterY;
        const k = (j * nx + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        const e = y + datum;
        const nrm = hash01(i, j);
        const wet = inWater(x, z, osm?.water);
        const park = pointInRings(x, z, parkRings.map((o) => ({ o })));
        let r, g, b;
        if (wet) {
          r = 0.18 + nrm * 0.02; g = 0.28 + nrm * 0.03; b = 0.26 + nrm * 0.03;
        } else if (park) {
          r = 0.28 + nrm * 0.05; g = 0.46 + nrm * 0.07; b = 0.22 + nrm * 0.04;
        } else if (e < 9) {
          r = 0.42 + nrm * 0.05; g = 0.40 + nrm * 0.04; b = 0.30 + nrm * 0.03;
        } else if (e < 16) {
          r = 0.34 + nrm * 0.04; g = 0.38 + nrm * 0.04; b = 0.28 + nrm * 0.03;
        } else {
          r = 0.30 + nrm * 0.04; g = 0.32 + nrm * 0.03; b = 0.30 + nrm * 0.03;
        }
        col[k] = r; col[k + 1] = g; col[k + 2] = b;
      }
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'hangang-dem';
    group.add(mesh);
  }

  // 한강 수면 (relation/152336 을 clip 한 outer/inner)
  const waterMeshes = [];
  if (osm?.water?.outers?.length) {
    for (const outer of osm.water.outers) {
      const holes = (osm.water.inners || [])
        .filter((inn) => {
          const c = centroid(inn.o);
          return pointInRing(c.x, c.z, outer.o);
        })
        .map((inn) => inn.o);
      const mesh = flatPolyMesh(outer.o, holes, lv.waterY, '#2a6a78', 'hangang-water');
      if (mesh) {
        mesh.material.transparent = true;
        mesh.material.opacity = 0.88;
        mats.push(mesh.material);
        group.add(mesh);
        waterMeshes.push(mesh);
      }
    }
  }

  // 공원 잔디를 DEM 위에 살짝 덮어 윤곽을 분명히
  const grassMats = [];
  for (const p of osm?.parks || []) {
    if (!p.o || p.o.length < 3) continue;
    const c = centroid(p.o);
    const y = (heightAt(c.x, c.z) ?? lv.waterY + 2) + 0.04;
    const mesh = flatPolyMesh(p.o, [], y, p.name === '서래섬' ? '#4a7a3a' : '#3f6b32', p.name === '서래섬' ? 'hangang-seorae' : 'hangang-park');
    if (mesh) {
      // drape vertices onto DEM so the plate does not float
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const gy = heightAt(x, z);
        pos.setY(i, (gy ?? y) + 0.05);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mats.push(mesh.material);
      grassMats.push(mesh.material);
      group.add(mesh);
    }
  }
  for (const g of osm?.grass || []) {
    if (!g.o || g.o.length < 3) continue;
    const c = centroid(g.o);
    const y = (heightAt(c.x, c.z) ?? lv.waterY + 2) + 0.06;
    const mesh = flatPolyMesh(g.o, [], y, '#4d7a38', 'hangang-grass');
    if (!mesh) continue;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const gy = heightAt(x, z);
      pos.setY(i, (gy ?? y) + 0.06);
    }
    pos.needsUpdate = true;
    mats.push(mesh.material);
    group.add(mesh);
  }

  // 둔치 테라스: 공원 강변을 따라 안쪽으로 4단. 각 단은 DEM 위에 앉힌다.
  const parkRing = osm?.park?.ring?.pts || osm?.parks?.find((p) => p.name === '반포한강공원')?.o;
  const terraceMat = new THREE.MeshLambertMaterial({ color: '#c4b7a2', side: THREE.DoubleSide });
  mats.push(terraceMat);
  if (parkRing) {
    const edges = riverFacingEdges(parkRing, osm?.water, 10);
    const bands = 4;
    const bandW = 7.2;
    const pos = [], idx = [];
    let vbase = 0;
    for (const e of edges) {
      const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1];
      const L = Math.hypot(dx, dz) || 1;
      const px = -dz / L, pz = dx / L;
      // 안쪽 = 공원 중심 쪽
      const pc = centroid(parkRing);
      const midX = (e.a[0] + e.b[0]) / 2, midZ = (e.a[1] + e.b[1]) / 2;
      const inward = (pc.x - midX) * px + (pc.z - midZ) * pz;
      const sx = inward >= 0 ? px : -px;
      const sz = inward >= 0 ? pz : -pz;
      for (let b = 0; b < bands; b++) {
        const d0 = 1.2 + b * bandW, d1 = d0 + bandW - 0.25;
        const q = [
          [e.a[0] + sx * d0, e.a[1] + sz * d0],
          [e.b[0] + sx * d0, e.b[1] + sz * d0],
          [e.b[0] + sx * d1, e.b[1] + sz * d1],
          [e.a[0] + sx * d1, e.a[1] + sz * d1],
        ];
        const ys = q.map(([x, z]) => {
          const g = heightAt(x, z);
          const stepped = lv.waterY + 1.15 + b * 0.72;
          return Math.max(stepped, (g ?? stepped)) + 0.03;
        });
        for (let i = 0; i < 4; i++) pos.push(q[i][0], ys[i], q[i][1]);
        idx.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
        vbase += 4;
      }
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, terraceMat);
      mesh.receiveShadow = true;
      mesh.name = 'hangang-terraces';
      group.add(mesh);
    }
  }

  const dayColors = new Map();
  function setNight(v) {
    const t = Math.max(0, Math.min(1, v));
    for (const m of waterMeshes) {
      m.material.color.set(t > 0.4 ? '#152834' : '#2a6a78');
      m.material.emissive = m.material.emissive || new THREE.Color(0x000000);
      if (!m.material.emissive) continue;
    }
    for (const m of waterMeshes) {
      if (!m.material.emissive) m.material.emissive = new THREE.Color('#061018');
      m.material.emissive.set(t > 0.35 ? '#0a2030' : '#000000');
      m.material.color.setRGB(0.16 * (1 - t) + 0.07 * t, 0.42 * (1 - t) + 0.12 * t, 0.47 * (1 - t) + 0.16 * t);
    }
    terraceMat.color.setRGB(0.77 * (1 - t) + 0.28 * t, 0.72 * (1 - t) + 0.24 * t, 0.64 * (1 - t) + 0.20 * t);
  }

  return {
    group, heightAt, levels: lv, bounds, waterY: lv.waterY,
    jamsuDeckY: (x, z) => jamsuDeckY(x, z, osm, lv),
    banpoDeckY: (x, z) => banpoDeckY(x, z, osm, lv, heightAt),
    setNight,
  };
}
