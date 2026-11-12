// [hangang] 반포·잠수교 일대 지형 — AWS terrarium DEM + 한강 수면 + 반포한강공원 둔치 테라스.
import * as THREE from 'three';
import { HG, pointInRing, pointInRings, inWater, centroid, projectOnLine } from './hangangCoords.js';
import { applyHangangTerrainBakeGen, loadHangangTerrainBakeSync, decodeHangangTerrainBakeMaybe, decodeHangangTerrainBakeGen, fetchHangangTerrainBake } from './hangangMeshBake.js';


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


// 호안 샘플 최근접 검색. 선형 스캔은 합수부 DEM(수면 링 × 정점)에서 O(n·m) 이 되어 기동을 막는다.
// 격자 한 칸 = 검색 반지름(18 m). 질의는 주변 5×5 칸만 본다. 같은 거리면 원래 배열 앞쪽을 고른다.
export const SHORE_SEARCH_R = 18;
export function makeShoreIndex(samples, radius = SHORE_SEARCH_R) {
  const cell = radius;
  const inv = 1 / cell;
  const buckets = new Map();
  const list = samples.map((p, i) => ({ p, i }));
  for (const item of list) {
    const ix = Math.floor(item.p.x * inv);
    const iz = Math.floor(item.p.z * inv);
    const k = ix + ',' + iz;
    let b = buckets.get(k);
    if (!b) { b = []; buckets.set(k, b); }
    b.push(item);
  }
  return { buckets, inv, radius, radius2: radius * radius, n: samples.length };
}
export function nearestShoreIndexed(index, x, z) {
  if (!index?.n) return null;
  const { buckets, inv, radius2 } = index;
  const ix = Math.floor(x * inv);
  const iz = Math.floor(z * inv);
  let best = null, bestD2 = radius2, bestI = Infinity;
  // 5×5: 칸 크기=반지름일 때 모서리·부동소수 경계에서도 빠지지 않게
  for (let jz = iz - 2; jz <= iz + 2; jz++) {
    for (let jx = ix - 2; jx <= ix + 2; jx++) {
      const b = buckets.get(jx + ',' + jz);
      if (!b) continue;
      for (const { p, i } of b) {
        const dx = x - p.x, dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2 || (d2 === bestD2 && i < bestI)) {
          bestD2 = d2;
          best = p;
          bestI = i;
        }
      }
    }
  }
  return best;
}
export function nearestShoreLinear(samples, x, z, radius = SHORE_SEARCH_R) {
  let best = null, bestD2 = radius * radius;
  for (const p of samples) {
    const dx = x - p.x, dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = p; }
  }
  return best;
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

export function blendOffset(x, z, blend) {
  if (!blend) return 0;
  const xEast = blend.xEast, xWest = blend.xWest;
  const spanX = (xEast - xWest) || 1;
  const tX = Math.max(0, Math.min(1, (xEast - x) / spanX));
  const offsetX = (1 - tX) * (blend.offset0 ?? 0);
  if (blend.zSouth == null || blend.zHap == null) return offsetX;
  const spanZ = (blend.zSouth - blend.zHap) || 1;
  const tZ = Math.max(0, Math.min(1, (blend.zSouth - z) / spanZ));
  const offsetS = blend.offsetSouth ?? offsetX;
  return offsetS * (1 - tZ) + offsetX * tZ;
}

export function waterYAt(x, z, lv, blend) {
  return (lv?.waterY ?? -43) + blendOffset(x, z, blend);
}

function hanOuterCount(osm) {
  const n = osm?.water?.han?.outers;
  if (Number.isFinite(n)) return n;
  return (osm?.water?.outers || []).length;
}

export function inHanRiver(x, z, osm) {
  const n = hanOuterCount(osm);
  const outers = (osm?.water?.outers || []).slice(0, n);
  if (!outers.some((o) => o?.o && pointInRing(x, z, o.o))) return false;
  const innerN = Number.isFinite(osm?.water?.han?.inners) ? osm.water.han.inners : (osm?.water?.inners || []).length;
  const inners = (osm?.water?.inners || []).slice(0, innerN);
  return !inners.some((inn) => inn?.o && pointInRing(x, z, inn.o));
}

export function makeHangangHeightAt(dem, osm = null) {
  const datum = dem?.datum ?? HG.datum;
  const lv = measureHangangLevels(dem, osm);
  const blend = osm?.meta?.datumBlend || null;
  const isHap = osm?.meta?.segment === 'hap';
  const olympicWays = isHap
    ? (osm?.ways || []).filter((w) => w.name === '올림픽대로' && w.pts?.length >= 2)
    : [];
  const tunnelWays = isHap
    ? (osm?.ways || []).filter((w) => w.tunnel === 'yes' && (w.name || '').includes('나들목') && w.pts?.length >= 2)
    : [];
  const parkRings = (osm?.parks || []).map((p) => p.o).filter((o) => o && o.length >= 3);
  // Local riverside target along x (a single 12 km percentile pulled the
  // 청담 bank down toward the lower 반포 elevations and made a 4 m step).
  let parkXs = null, parkYs = null;
  if (isHap) {
    const BIN = 120;
    const buckets = new Map();
    for (const w of osm?.ways || []) {
      if ((w.name || '') !== '한강남자전거길' || !w.pts) continue;
      for (const pt of w.pts) {
        if (inWater(pt[0], pt[1], osm?.water)) continue;
        const s = sampleDem(dem, pt[0], pt[1]);
        if (s == null || s <= lv.waterEle) continue;
        const k = Math.round(pt[0] / BIN);
        let arr = buckets.get(k);
        if (!arr) { arr = []; buckets.set(k, arr); }
        arr.push(s);
      }
    }
    const keys = [...buckets.keys()].sort((a, b) => a - b);
    parkXs = []; parkYs = [];
    for (const k of keys) {
      const arr = buckets.get(k).sort((a, b) => a - b);
      parkXs.push(k * BIN);
      parkYs.push(arr[Math.floor(arr.length * 0.35)]);
    }
  }
  function parkTypicalAt(x) {
    if (!parkXs || !parkXs.length) return lv.waterEle + 3.2;
    if (x <= parkXs[0]) return parkYs[0];
    if (x >= parkXs[parkXs.length - 1]) return parkYs[parkYs.length - 1];
    let i = 1;
    while (i < parkXs.length && parkXs[i] < x) i++;
    const t = (x - parkXs[i - 1]) / ((parkXs[i] - parkXs[i - 1]) || 1);
    return parkYs[i - 1] * (1 - t) + parkYs[i] * t;
  }
  function minDistWays(x, z, ways) {
    let best = Infinity;
    for (const w of ways) {
      const q = projectOnLine(x, z, w.pts);
      if (q && q.dist < best) best = q.dist;
    }
    return best;
  }
  function eleAt(x, z) {
    const e = sampleDem(dem, x, z);
    if (e == null) return null;
    const off = blendOffset(x, z, blend);
    if (inWater(x, z, osm?.water)) {
      // 한강은 clip 안에서 거의 평평한 풀(25백분위). 탄천만 해당하는 칸은
      // 상류 DEM(이 지점 해발 ~17 m)을 따른다. 한강 수위를 쓰면 남쪽 이음에서
      // 약 10 m 구덩이가 생긴다.
      if (!inHanRiver(x, z, osm) && e > lv.waterEle + 1.5) return e + off;
      return lv.waterEle + off;
    }
    const seorae = osm?.seorae?.ring?.pts;
    if (seorae && pointInRing(x, z, seorae)) return Math.max(e, lv.waterEle + 0.85) + off;
    let land = Math.max(e, lv.waterEle);
    if (isHap) {
      let tunW = 0, tunE = land;
      for (const w of tunnelWays) {
        const q = projectOnLine(x, z, w.pts);
        const hw = (w.w || 5) * 0.5 + 26;
        if (!q || q.dist > hw) continue;
        const a = w.pts[0], b = w.pts[w.pts.length - 1];
        const ea = sampleDem(dem, a[0], a[1]);
        const eb = sampleDem(dem, b[0], b[1]);
        if (ea == null || eb == null) continue;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const L2 = dx * dx + dz * dz || 1;
        const tt = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
        let floor = ea + (eb - ea) * tt;
        // DEM is the 올림픽대로 deck; cut a real underpass (~5 m clearance).
        for (const ow of olympicWays) {
          const oq = projectOnLine(x, z, ow.pts);
          if (!oq || oq.dist > 40) continue;
          const oe = sampleDem(dem, oq.x, oq.z);
          if (oe != null) floor = Math.min(floor, oe - 5.2);
        }
        const fall = Math.max(0, 1 - q.dist / hw);
        const ww = fall * fall * fall;
        if (ww > tunW) { tunW = ww; tunE = floor; }
      }
      if (tunW > 0.05) {
        land = land * (1 - tunW) + Math.min(land, tunE) * tunW;
      } else {
        const dOly = olympicWays.length ? minDistWays(x, z, olympicWays) : Infinity;
        let inPark = false;
        for (const r of parkRings) if (pointInRing(x, z, r)) { inPark = true; break; }
        // Distance north to the 한강 only — 탄천 water must not trigger a flatten
        // or the corridor join at (32, −13552) drops 3 m toward the 한강 profile.
        let dW = 240;
        for (let d = 0; d <= 220; d += 8) {
          if (inHanRiver(x, z - d, osm)
            || inHanRiver(x + 12, z - d, osm)
            || inHanRiver(x - 12, z - d, osm)) { dW = d; break; }
        }
        const waterFade = dW >= 240 ? 0 : (inPark ? 1 : Math.max(0, 1 - Math.max(0, dW - 140) / 70));
        const olyFade = Math.max(0, Math.min(1, (dOly - 14) / 55));
        const w = 0.78 * waterFade * olyFade;
        if (w > 0.02) {
          land = land * (1 - w) + parkTypicalAt(x) * w;
        }
      }
    }
    return land + off;
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


function grassTex() {
  if (typeof document === 'undefined') return null;
  const W = 256, c = document.createElement('canvas');
  c.width = W; c.height = W;
  const d = c.getContext('2d');
  d.fillStyle = '#4e6e32';
  d.fillRect(0, 0, W, W);
  let seed = 1301;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * W, y = rnd() * W;
    const r = 0.6 + rnd() * 2.4;
    const tone = rnd();
    d.fillStyle = tone < 0.35
      ? `rgba(${70 + rnd() * 30},${90 + rnd() * 40},${40 + rnd() * 20},${0.35 + rnd() * 0.35})`
      : tone < 0.7
        ? `rgba(${90 + rnd() * 50},${110 + rnd() * 50},${45 + rnd() * 25},${0.28 + rnd() * 0.35})`
        : `rgba(${120 + rnd() * 40},${118 + rnd() * 30},${70 + rnd() * 20},${0.18 + rnd() * 0.25})`;
    d.beginPath(); d.arc(x, y, r, 0, Math.PI * 2); d.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}


function waterLandEdges(water, step = 9) {
  const edges = [];
  for (const outer of water?.outers || []) {
    const ring = outer.o;
    if (!ring || ring.length < 2) continue;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      const px = -dz / L, pz = dx / L;
      const w1 = inWater(mx + px * 8, mz + pz * 8, water);
      const w2 = inWater(mx - px * 8, mz - pz * 8, water);
      let sx, sz;
      if (!w1 && w2) { sx = px; sz = pz; }
      else if (w1 && !w2) { sx = -px; sz = -pz; }
      else continue;
      const n = Math.max(1, Math.ceil(L / step));
      for (let s = 0; s < n; s++) {
        const t0 = s / n, t1 = (s + 1) / n;
        edges.push({
          a: [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
          b: [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
          sx, sz,
        });
      }
    }
  }
  return edges;
}


function parkShoreChains(water, park, minLen = 28) {
  const chains = [];
  const onPark = (x, z) => {
    if (!park) return false;
    if (pointInRing(x, z, park)) return true;
    for (const [dx, dz] of [[22, 0], [-22, 0], [0, 22], [0, -22], [16, 16], [-16, 16]]) {
      if (pointInRing(x + dx, z + dz, park)) return true;
    }
    return false;
  };
  const reachesParkLand = (mx, mz, sx, sz) => {
    for (let d = 2; d <= 40; d += 2) {
      const x = mx + sx * d, z = mz + sz * d;
      if (!inWater(x, z, water) && onPark(x, z)) return true;
    }
    return false;
  };
  const snapShore = (x, z, sx, sz) => {
    let lx = x, lz = z;
    if (!inWater(x, z, water)) return { x, z, sx, sz };
    for (let d = 1; d <= 44; d += 1) {
      const px = x + sx * d, pz = z + sz * d;
      if (!inWater(px, pz, water)) return { x: lx, z: lz, sx, sz };
      lx = px; lz = pz;
    }
    return null;
  };
  for (const outer of water?.outers || []) {
    const ring = outer.o;
    if (!ring || ring.length < 2) continue;
    let cur = [];
    const flush = () => {
      if (cur.length >= 2) {
        let L = 0;
        for (let i = 1; i < cur.length; i++) L += Math.hypot(cur[i].x - cur[i - 1].x, cur[i].z - cur[i - 1].z);
        if (L >= minLen) chains.push(cur);
      }
      cur = [];
    };
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      const px = -dz / L, pz = dx / L;
      const w1 = inWater(mx + px * 8, mz + pz * 8, water);
      const w2 = inWater(mx - px * 8, mz - pz * 8, water);
      let sx, sz;
      if (!w1 && w2) { sx = px; sz = pz; }
      else if (w1 && !w2) { sx = -px; sz = -pz; }
      else { flush(); continue; }
      if (!onPark(mx + sx * 6, mz + sz * 6) && !reachesParkLand(mx, mz, sx, sz)) { flush(); continue; }
      const sa = snapShore(a[0], a[1], sx, sz);
      const sb = snapShore(b[0], b[1], sx, sz);
      if (!sa || !sb) { flush(); continue; }
      if (!cur.length) cur.push(sa);
      cur.push(sb);
    }
    flush();
  }
  return chains;
}

function resampleShore(chain, step = 3.2) {
  if (!chain || chain.length < 2) return chain || [];
  const out = [chain[0]];
  for (let i = 1; i < chain.length; i++) {
    let ax = out[out.length - 1].x, az = out[out.length - 1].z;
    const bx = chain[i].x, bz = chain[i].z;
    let dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    dx /= L; dz /= L;
    const sx = (out[out.length - 1].sx + chain[i].sx) * 0.5;
    const sz = (out[out.length - 1].sz + chain[i].sz) * 0.5;
    const sl = Math.hypot(sx, sz) || 1;
    while (L > step) {
      ax += dx * step; az += dz * step;
      out.push({ x: ax, z: az, sx: sx / sl, sz: sz / sl });
      L -= step;
    }
    out.push(chain[i]);
  }
  return out;
}

function* hangangTerrainGen({ parent, dem, osm, baked = null, skipBake = false } = {}, sliced = false) {
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
  let bake = skipBake ? null : decodeHangangTerrainBakeMaybe(baked);
  if (!bake && baked && !skipBake) {
    try {
      const dec = decodeHangangTerrainBakeGen(baked);
      let step = dec.next();
      while (!step.done) {
        if (sliced) yield step.value;
        step = dec.next();
      }
      bake = step.value;
    } catch (e) {
      console.warn('[hangang] terrain bake decode failed:', e?.message || e);
      bake = null;
    }
  }
  if (!bake && !skipBake) bake = loadHangangTerrainBakeSync(osm);
  if (bake?.meshes?.length) {
    const applyGen = applyHangangTerrainBakeGen(group, bake, { grassMap: grassTex() });
    let step = applyGen.next();
    while (!step.done) {
      if (sliced) yield step.value;
      step = applyGen.next();
    }
    const applied = step.value;
    mats.push(...applied.mats);
    const waterMeshes = applied.waterMeshes;
    const terraceMat = applied.terraceMat;
    const riserMat = applied.riserMat;
    const revetmentView = applied.revetmentView;
    function setNight(v) {
      const t = Math.max(0, Math.min(1, v));
      for (const m of waterMeshes) {
        if (!m.material.emissive) m.material.emissive = new THREE.Color('#061018');
        m.material.emissive.set(t > 0.35 ? '#0a2030' : '#000000');
        m.material.color.setRGB(0.16 * (1 - t) + 0.07 * t, 0.42 * (1 - t) + 0.12 * t, 0.47 * (1 - t) + 0.16 * t);
      }
      terraceMat.color.setRGB(0.56 * (1 - t) + 0.22 * t, 0.56 * (1 - t) + 0.22 * t, 0.54 * (1 - t) + 0.20 * t);
      riserMat.color.setRGB(0.44 * (1 - t) + 0.16 * t, 0.44 * (1 - t) + 0.16 * t, 0.42 * (1 - t) + 0.15 * t);
    }
    return {
      group, heightAt, levels: lv, bounds, waterY: lv.waterY, revetmentView,
      jamsuDeckY: (x, z) => jamsuDeckY(x, z, osm, lv),
      banpoDeckY: (x, z) => banpoDeckY(x, z, osm, lv, heightAt),
      setNight,
    };
  }


  // 호안은 DEM보다 먼저 체인을 잡아, 잔디가 콘크리트 단을 덮지 않게 낮춘다.
  const REV_STEPS = 11;
  const REV_TREAD = 1.22;
  const REV_SPAN = REV_STEPS * REV_TREAD;
  const parkRingsForShore = [];
  if (osm?.meta?.segment === 'hap') {
    for (const pk of osm?.parks || []) if (pk.o?.length >= 3) parkRingsForShore.push(pk.o);
  } else {
    const one = osm?.park?.ring?.pts || osm?.parks?.find((pk) => pk.name === '반포한강공원')?.o;
    if (one) parkRingsForShore.push(one);
  }
  const rawShoreChains = [];
  if (osm?.water?.outers?.length) {
    for (const parkRing of parkRingsForShore) {
      for (const raw of parkShoreChains(osm.water, parkRing, 28)) {
        const c = resampleShore(raw, 3.2);
        if (c.length >= 2) rawShoreChains.push(c);
      }
    }
  }
  // 수면 링은 relation/152336 을 조립한 닫힌 외곽이다. 임의 제방 offset 은 넣지 않고
  // 법선만 부드럽게 해서 단이 톱니처럼 벌어지지 않게 한다.
  const shoreChains = rawShoreChains.map((chain) => {
    const n = chain.length;
    return chain.map((p, i) => {
      let sx = 0, sz = 0, w = 0;
      for (let k = i - 3; k <= i + 3; k++) {
        if (k >= 0 && k < n) { sx += chain[k].sx; sz += chain[k].sz; w++; }
      }
      const sl = Math.hypot(sx, sz) || 1;
      return { x: p.x, z: p.z, sx: sx / sl, sz: sz / sl };
    });
  }).filter((c) => c.length >= 2);
  const shoreSamples = [];
  for (const c of shoreChains) for (const p of c) shoreSamples.push(p);

  const shoreIndex = makeShoreIndex(shoreSamples, SHORE_SEARCH_R);
  function revetmentBandY(x, z) {
    if (!shoreSamples.length) return null;
    const best = nearestShoreIndexed(shoreIndex, x, z);
    if (!best) return null;
    const d = (x - best.x) * best.sx + (z - best.z) * best.sz;
    const lat2 = (x - best.x) * (x - best.x) + (z - best.z) * (z - best.z) - d * d;
    if (lat2 > 36) return null;
    if (d < -0.5 || d > REV_SPAN + 1.8) return null;
    const topX = best.x + best.sx * REV_SPAN, topZ = best.z + best.sz * REV_SPAN;
    const yWater = waterYAt(best.x, best.z, lv, osm?.meta?.datumBlend) + 0.05;
    const yGrass = heightAt(topX, topZ);
    const yTop = (yGrass != null && yGrass > yWater + 1.2) ? yGrass : (yWater + REV_STEPS * 0.42);
    if (d > REV_SPAN) {
      const fade = Math.min(1, (d - REV_SPAN) / 1.6);
      return yTop - 0.08 * (1 - fade);
    }
    const t = Math.max(0, Math.min(1, d / REV_SPAN));
    return yWater + (yTop - yWater) * t - 0.08;
  }

  if (dem) {
    const sub = osm?.meta?.demSub ?? 2;
    const visualXMin = osm?.meta?.visualXMin;
    const nx = (dem.nx - 1) * sub + 1, nz = (dem.nz - 1) * sub + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const idx = [];
    const parkRings = (osm?.parks || []).map((p) => p.o).filter((o) => o && o.length >= 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = dem.x0 + (i / sub) * dem.dx;
        const z = dem.z0 + (j / sub) * dem.dz;
        let y = heightAt(x, z);
        if (y == null) y = lv.waterY;
        const wyHere = waterYAt(x, z, lv, osm?.meta?.datumBlend) ?? lv.waterY;
        const wetV = inWater(x, z, osm?.water) || (y <= wyHere + 1.2);
        if (wetV) {
          // 수면 메시(waterY+0.03)와 DEM 이 같은 높이에 있으면 반투명 강물이
          // 젖은 잔디텍스처와 z-fight 해서 검녹 반점이 된다.
          // 수면 링에 안 들어갔지만 표고가 수면인 칸은 베이지 빈 판이 된다.
          y = (heightAt(x, z) ?? lv.waterY) - 1.4;
        } else {
          const by = revetmentBandY(x, z);
          if (by != null) y = Math.min(y, by);
        }
        const k = (j * nx + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        uv[(j * nx + i) * 2] = (x - dem.x0) / 28;
        uv[(j * nx + i) * 2 + 1] = (z - dem.z0) / 28;
        const e = y + datum;
        const nrm = hash01(i, j);
        const wet = wetV;
        const nearWater = !wet && (
          inWater(x + 10, z, osm?.water) || inWater(x - 10, z, osm?.water)
          || inWater(x, z + 10, osm?.water) || inWater(x, z - 10, osm?.water)
        );
        const park = pointInRings(x, z, parkRings.map((o) => ({ o })));
        const hapPark = !wet && osm?.meta?.segment === 'hap' && (
          park || nearWater || (
            (inWater(x, z - 22, osm?.water) || inWater(x, z - 40, osm?.water)
              || inWater(x + 18, z, osm?.water) || inWater(x - 18, z, osm?.water))
          )
        );
        let r, g, b;
        if (wet) {
          r = 0.18 + nrm * 0.02; g = 0.28 + nrm * 0.03; b = 0.26 + nrm * 0.03;
        } else if (hapPark || park || osm?.meta?.segment === 'hap') {
          r = 0.50 + nrm * 0.08; g = 0.66 + nrm * 0.10; b = 0.32 + nrm * 0.05;
        } else if (nearWater) {
          r = 0.58 + nrm * 0.06; g = 0.52 + nrm * 0.05; b = 0.36 + nrm * 0.04;
        } else if (e < 9) {
          r = 0.46 + nrm * 0.06; g = 0.44 + nrm * 0.05; b = 0.32 + nrm * 0.03;
        } else if (e < 16) {
          r = 0.38 + nrm * 0.05; g = 0.42 + nrm * 0.05; b = 0.30 + nrm * 0.03;
        } else {
          r = 0.34 + nrm * 0.04; g = 0.36 + nrm * 0.04; b = 0.32 + nrm * 0.03;
        }
        col[k] = r; col[k + 1] = g; col[k + 2] = b;
      }
      if (sliced) yield;
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (visualXMin != null) {
          const xb = dem.x0 + ((i + 1) / sub) * dem.dx;
          if (xb < visualXMin) continue;
        }
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      if (sliced && (j & 7) === 7) yield;
    }
    if (sliced) yield;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (sliced) yield;
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: grassTex(),
      side: THREE.FrontSide,
    });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'hangang-dem';
    group.add(mesh);
  }

  // 한강 수면 (relation/152336 을 clip 한 outer/inner)
  const waterMeshes = [];
  if (osm?.water?.outers?.length) {
    const hanN = hanOuterCount(osm);
    let outerI = 0;
    for (const outer of osm.water.outers) {
      const thisIsHan = outerI < hanN;
      outerI += 1;
      const isletRings = (osm?.islets || []).map((isle) => isle.o).filter((o) => o && o.length >= 3);
      const holes = (osm.water.inners || [])
        .filter((inn) => {
          if (!inn.o || inn.o.length < 3) return false;
          const c = centroid(inn.o);
          if (!pointInRing(c.x, c.z, outer.o)) return false;
          // 세빛섬 발자국은 부유 구조물이지 육지가 아니다. 구멍을 내면 평평한 잔디 섬이 된다.
          for (const r of isletRings) {
            if (pointInRing(c.x, c.z, r)) return false;
            const ic = centroid(r);
            if (Math.hypot(c.x - ic.x, c.z - ic.z) < 48) return false;
          }
          return true;
        })
        .map((inn) => inn.o);
      const mesh = flatPolyMesh(outer.o, holes, lv.waterY + 0.03, '#2a6a78', 'hangang-water');
      if (mesh) {
        if (osm?.meta?.datumBlend) {
          const pos = mesh.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vz = pos.getZ(i);
            const hy = heightAt(vx, vz);
            const flat = waterYAt(vx, vz, lv, osm.meta.datumBlend);
            // 한강 링은 늘 평평한 풀. 경계 꼭짓점은 inHanRiver 가 false 로 나와 둔치 높이로
            // 들리면서, 합수부에서 강을 가로지르는 긴 삼각형(항공 샷의 파란 띠)이 됐다.
            pos.setY(i, ((!thisIsHan && hy != null && !inHanRiver(vx, vz, osm)) ? hy : flat) + 0.03);
          }
          pos.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
        }
        // 탄천 수면 링이 합수부 북쪽으로 한강 홈을 따라 올라가 파란 띠가 된다.
        // 한강 폴리곤이 그 홈을 비우므로 inHanRiver 만으로는 안 잘린다.
        if (!thisIsHan && hanN > 0) {
          const hapZ = osm?.spawns?.['tancheon-hap']?.z ?? -16796;
          const pos = mesh.geometry.attributes.position;
          const idx = mesh.geometry.index;
          const keep = [];
          const triN = idx ? idx.count / 3 : pos.count / 3;
          const vert = (i) => (idx ? idx.getX(i) : i);
          for (let t = 0; t < triN; t++) {
            if (sliced && t > 0 && (t & 2047) === 0) yield;
            const ia = vert(t * 3), ib = vert(t * 3 + 1), ic = vert(t * 3 + 2);
            const xs = [pos.getX(ia), pos.getX(ib), pos.getX(ic)];
            const zs = [pos.getZ(ia), pos.getZ(ib), pos.getZ(ic)];
            const cx = (xs[0] + xs[1] + xs[2]) / 3;
            const cz = (zs[0] + zs[1] + zs[2]) / 3;
            // Fat ShapeGeometry triangles can sit in 탄천 while one vertex
            // reaches into the 한강; test every vertex, not just the centroid.
            if (zs.some((z) => z < hapZ - 8)) continue;
            if (inHanRiver(cx, cz, osm) || xs.some((x, k) => inHanRiver(x, zs[k], osm))) continue;
            keep.push(ia, ib, ic);
          }
          mesh.geometry.setIndex(keep);
        }
        if (sliced) yield;
        mesh.material = new THREE.MeshPhongMaterial({
          color: '#1c5c6e',
          transparent: true,
          opacity: 0.90,
          shininess: 44,
          specular: '#4e8a96',
          side: THREE.DoubleSide,
          emissive: '#000000',
        });
        mats.push(mesh.material);
        group.add(mesh);
        waterMeshes.push(mesh);
      }
      if (sliced) yield;
    }
  }
  if (sliced) yield;

  // 공원 ShapeGeometry 판은 쓰지 않는다. 오목한 반포한강공원이 눈높이 거대 삼각형(녹색 벽)이 된다.
  // 잔디는 DEM 정점색 + 타일 텍스처로만 그린다.

  // 계단식 호안: 공원에 닿는 수면 외곽을 이은 연속 체인.
  // OSM terrace way 가 없어 수면 링 + 수면·지면 높이로 만들었다(approximate).
  const terraceMat = new THREE.MeshLambertMaterial({ color: '#9a9b95', side: THREE.DoubleSide });
  const riserMat = new THREE.MeshLambertMaterial({ color: '#4e4f49', side: THREE.DoubleSide });
  mats.push(terraceMat, riserMat);
  const topCenters = [];
  const steps = REV_STEPS;
  const tread = REV_TREAD;
  if (shoreChains.length) {
    const tpos = [], tidx = [], rpos = [], ridx = [], npos = [], nidx = [], epos = [], eidx = [];
    let tv = 0, rv = 0, nv = 0, ev = 0;
    function* emitRun(cols) {
      if (cols.length < 2) return;
      for (let i = 0; i < cols.length - 1; i++) {
        const a = cols[i], b = cols[i + 1];
        const gap = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z);
        if (gap > 7.5) continue;
        for (let s = 0; s < steps; s++) {
          const a0 = a.pts[s], a1 = a.pts[s + 1], b0 = b.pts[s], b1 = b.pts[s + 1];
          const yA1 = a.ys[s + 1], yB1 = b.ys[s + 1];
          const yA0 = a.ys[s], yB0 = b.ys[s];
          tpos.push(a0[0], yA1, a0[1], b0[0], yB1, b0[1], b1[0], yB1, b1[1], a1[0], yA1, a1[1]);
          tidx.push(tv, tv + 1, tv + 2, tv, tv + 2, tv + 3);
          tv += 4;
          rpos.push(a0[0], yA1, a0[1], b0[0], yB1, b0[1], b0[0], yB0, b0[1], a0[0], yA0, a0[1]);
          ridx.push(rv, rv + 1, rv + 2, rv, rv + 2, rv + 3);
          rv += 4;
          const nd = 0.1;
          const anx0 = a.p.x + a.sx * (s * tread), anz0 = a.p.z + a.sz * (s * tread);
          const bnx0 = b.p.x + b.sx * (s * tread), bnz0 = b.p.z + b.sz * (s * tread);
          const anx1 = a.p.x + a.sx * (s * tread + nd), anz1 = a.p.z + a.sz * (s * tread + nd);
          const bnx1 = b.p.x + b.sx * (s * tread + nd), bnz1 = b.p.z + b.sz * (s * tread + nd);
          npos.push(anx0, yA1 + 0.02, anz0, bnx0, yB1 + 0.02, bnz0, bnx1, yB1 + 0.02, bnz1, anx1, yA1 + 0.02, anz1);
          nidx.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3);
          nv += 4;
        }
        if (sliced && (i & 3) === 3) yield;
      }
      for (const col of [cols[0], cols[cols.length - 1]]) {
        for (let s = 0; s < steps; s++) {
          const p0 = col.pts[s], p1 = col.pts[s + 1];
          epos.push(p0[0], col.ys[s + 1], p0[1], p1[0], col.ys[s + 1], p1[1], p1[0], col.ys[s], p1[1], p0[0], col.ys[s], p0[1]);
          eidx.push(ev, ev + 1, ev + 2, ev, ev + 2, ev + 3);
          ev += 4;
        }
      }
      for (let ci = 0; ci < cols.length; ci++) {
        if (ci % 6 !== 0 && ci !== cols.length - 1) continue;
        const col = cols[ci];
        const last = col.pts[steps];
        topCenters.push({
          x: last[0], z: last[1], y: col.ys[steps],
          lookX: col.p.x - col.sx * 10,
          lookZ: col.p.z - col.sz * 10,
          waterX: col.p.x,
          waterZ: col.p.z,
        });
      }
    };
    for (const chain of shoreChains) {
      if (chain.length < 2) continue;
      const cols = [];
      const flush = function* () { if (cols.length) { yield* emitRun(cols); cols.length = 0; } };
      for (const p of chain) {
        const sx = p.sx, sz = p.sz;
        const topX = p.x + sx * (steps * tread), topZ = p.z + sz * (steps * tread);
        if (inWater(topX, topZ, osm.water)) { yield* flush(); continue; }
        const yWater = waterYAt(p.x, p.z, lv, osm?.meta?.datumBlend) + 0.05;
        const yGrass = heightAt(topX, topZ);
        if (yGrass == null) { yield* flush(); continue; }
        const yTop = Math.max(yGrass, yWater + 0.35);
        const ys = [];
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const d = s * tread;
          pts.push([p.x + sx * d, p.z + sz * d]);
          ys.push(yWater + (yTop - yWater) * (s / steps));
        }
        if (cols.length) {
          const prev = cols[cols.length - 1];
          if (Math.hypot(p.x - prev.p.x, p.z - prev.p.z) > 7.5) yield* flush();
        }
        cols.push({ pts, ys, sx, sz, p });
      }
      yield* flush();
      if (sliced) yield;
    }
    const addMesh = (pos, idx, mat, name, recv) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      if (recv) mesh.receiveShadow = true;
      mesh.name = name;
      group.add(mesh);
    };
    addMesh(tpos, tidx, terraceMat, 'hangang-revetment', true);
    if (sliced) yield;
    addMesh(rpos, ridx, riserMat, 'hangang-revetment-risers', false);
    if (sliced) yield;
    addMesh(npos, nidx, riserMat, 'hangang-revetment-noses', false);
    if (sliced) yield;
    addMesh(epos, eidx, riserMat, 'hangang-revetment-ends', false);
    if (sliced) yield;
  }
  let revetmentView = null;
  {
    const cl = osm?.jamsu?.centerline?.pts;
    const midB = cl && cl.length >= 2
      ? { x: (cl[0][0] + cl[cl.length - 1][0]) / 2, z: (cl[0][1] + cl[cl.length - 1][1]) / 2 }
      : { x: -9913, z: -16408 };
    // 잠수교 남단 서쪽 본류 호안을 고른다. 체인 중점만 쓰면 서래섬 수로 쪽에 떨어진다.
    const prefer = { x: -9850, z: -16110 };
    let bestMain = null, bestMainD = Infinity;
    let bestAny = null, bestAnyD = Infinity;
    for (const c of topCenters) {
      if (c.x > -9520 || c.x < -10550) continue;
      if (inWater(c.x, c.z, osm?.water)) continue;
      const gy = heightAt(c.x, c.z);
      if (gy == null || gy < lv.waterY + 0.5) continue;
      const d = Math.hypot(c.x - prefer.x, c.z - prefer.z);
      const view = {
        ...c,
        lookX: (c.waterX ?? c.lookX) * 0.5 + midB.x * 0.5,
        lookZ: (c.waterZ ?? c.lookZ) * 0.42 + midB.z * 0.58,
      };
      if (d < bestAnyD) { bestAnyD = d; bestAny = view; }
      if (c.waterZ < -15910 && d < bestMainD) { bestMainD = d; bestMain = view; }
    }
    revetmentView = bestMain || bestAny || (topCenters.length ? topCenters[Math.floor(topCenters.length / 2)] : null);
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
    terraceMat.color.setRGB(0.56 * (1 - t) + 0.22 * t, 0.56 * (1 - t) + 0.22 * t, 0.54 * (1 - t) + 0.20 * t);
    riserMat.color.setRGB(0.44 * (1 - t) + 0.16 * t, 0.44 * (1 - t) + 0.16 * t, 0.42 * (1 - t) + 0.15 * t);
  }

  return {
    group, heightAt, levels: lv, bounds, waterY: lv.waterY, revetmentView,
    jamsuDeckY: (x, z) => jamsuDeckY(x, z, osm, lv),
    banpoDeckY: (x, z) => banpoDeckY(x, z, osm, lv, heightAt),
    setNight,
  };
}

export function createHangangTerrain(opts) {
  const g = hangangTerrainGen(opts, false);
  let n = g.next();
  while (!n.done) n = g.next();
  return n.value;
}

export async function createHangangTerrainAsync(opts, yieldFn, slicer) {
  const y = yieldFn || (typeof requestAnimationFrame === 'function'
    ? () => new Promise((r) => requestAnimationFrame(() => r()))
    : () => Promise.resolve());
  let resolved = opts;
  if (!opts?.skipBake && !opts?.baked && opts?.bakeUrl) {
    const raw = await fetchHangangTerrainBake(opts.bakeUrl);
    if (raw) resolved = { ...opts, baked: raw };
    if (slicer) slicer.mark();
    console.info(`[hangang] terrain bake ${raw ? 'hit' : 'miss'} ${opts.bakeUrl}`);
  }
  const g = hangangTerrainGen(resolved, true);
  let n = g.next();
  if (slicer) {
    while (!n.done) {
      await slicer.tick(typeof n.value === 'string' ? n.value : undefined);
      n = g.next();
    }
    slicer.flush('hangang-terrain-end');
    return n.value;
  }
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let last = now();
  while (!n.done) {
    if (now() - last > 45) { await y(); last = now(); }
    n = g.next();
  }
  return n.value;
}

