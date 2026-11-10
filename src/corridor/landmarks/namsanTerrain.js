// [namsan] 남산 지형 — AWS Terrain Tiles(terrarium z=14) 높이장 + 숲 + 한양도성 + 팔각정·봉수대.
//   게임 y = max(0, eleASL - 48). 타워 기단은 문서값 243 m(479.7 − 236.7)로 광장을 평평히 맞춘다.
//   DEM 이 타워 구조물을 집어 정상부가 부풀어 오르는 것을 막기 위함이다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addInstancedTrees } from '../../world/trees.js';
import { NT, namsanBasinEle } from './namsanCoords.js';

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

function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}

function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function hash01(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}



function makeWayMask(ways, cell = 5) {
  const set = new Set();
  for (const w of ways || []) {
    const pts = w.pts || [];
    const rad = Math.max(2.6, (w.w || 3) * 0.5 + 1.8);
    const n = Math.ceil(rad / cell);
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
      const L = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(L / cell));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const i0 = Math.round(x / cell), j0 = Math.round(z / cell);
        for (let di = -n; di <= n; di++) for (let dj = -n; dj <= n; dj++) {
          if (di * di + dj * dj <= n * n + 1) set.add((i0 + di) + ',' + (j0 + dj));
        }
      }
    }
  }
  return (x, z) => set.has(Math.round(x / cell) + ',' + Math.round(z / cell));
}

export function makeNamsanHeightAt(dem, osm = null) {
  const datum = dem?.datum ?? NT.datum;
  function extrapolateEle(x, z) {
    // DEM 사각형 밖에서 가장자리 고도를 분지로 부드럽게 내린다.
    // 안쪽 한 점의 기울기를 쓰면 능선에서 부호가 뒤집어져 5 m 마다
    // 수 미터씩 뛰어 오르내렸다. 가장자리 샘플(E0)과 거리만 쓴다.
    const x1 = dem.x0 + (dem.nx - 1) * dem.dx;
    const z1 = dem.z0 + (dem.nz - 1) * dem.dz;
    const cx = Math.min(x1, Math.max(dem.x0, x));
    const cz = Math.min(z1, Math.max(dem.z0, z));
    const E0 = sampleDem(dem, cx, cz);
    if (E0 == null) return namsanBasinEle(Math.hypot(x - NT.tx, z - NT.tz));
    const distOut = Math.hypot(x - cx, z - cz);
    if (distOut < 1e-6) return E0;
    const basin = 40;
    const drop = Math.max(0, E0 - basin) / 620;
    let ext = E0 - drop * distOut;
    if (ext < basin) ext = basin;
    if (ext > 280) ext = 280;
    const t = Math.min(1, distOut / 780);
    const w = t * t * (3 - 2 * t);
    return ext * (1 - w) + basin * w;
  }
  function rawEle(x, z) {
    const e = sampleDem(dem, x, z);
    if (e != null) return e;
    if (dem) return extrapolateEle(x, z);
    return namsanBasinEle(Math.hypot(x - NT.tx, z - NT.tz));
  }
  function baseHeight(x, z) {
    let ele = rawEle(x, z);
    const d = Math.hypot(x - NT.tx, z - NT.tz);
    // 정상 광장을 문서 기단 243 m 로 단단히 평평히 한다. 예전 95 m smoothstep 은
    // 입구(약 40 m)에서 DEM 타워 스파이크(~262 m)가 아직 7–12 m 남아 지형이
    // 광장 위에 지붕처럼 덮였다. 가장자리(76 m)에서 지형과 광장이 같은 높이가 되게 한다.
    const FLAT_R = 76;
    const BLEND_R = 155;
    if (d < FLAT_R) {
      ele = NT.eleBase;
    } else if (d < BLEND_R) {
      const t = (d - FLAT_R) / (BLEND_R - FLAT_R);
      const w = t * t * (3 - 2 * t);
      ele = NT.eleBase * (1 - w) + ele * w;
    }
    // 상행 케이블카 역사는 광장보다 약간 아래(나무위키: 종점은 타워 바로 옆이 아니라 조금 아래).
    const ux = -10705.06, uz = -20554.09;
    const du = Math.hypot(x - ux, z - uz);
    if (du < 28) {
      const t = 1 - du / 28;
      ele = ele * (1 - t) + (NT.eleBase - 6) * t;
    }
    return ele - datum;
  }

  // Raise ground that falls away beside a carriageway so aerial views cannot
  // see the night void under the ribbon. Never lowers terrain; centerline
  // height is unchanged.
  const GRID = 28;
  const cells = new Map();
  const cellKey = (i, j) => `${i},${j}`;
  for (const w of osm?.ways || []) {
    const info = namsanRenderedWay(w);
    if (!info.namedLoop && !info.isCar) continue;
    if (w.k === 'elevator') continue;
    const width = info.width;
    const hw = width * 0.5;
    // Bench the DEM under the carriageway (and a short shoulder) so coarse
    // ~8 m triangles cannot straddle the ribbon and pierce it. Fall off
    // farther out so downhill ground still rises toward the road.
    const bench = hw + 1.2;
    const reach = bench + 10;
    const pts = w.pts || [];
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
      const seg = { ax, az, bx, bz, reach, bench, hw, isDrive: info.isDrive, isSowol: info.isSowol };
      const x0 = Math.min(ax, bx) - reach, x1 = Math.max(ax, bx) + reach;
      const z0 = Math.min(az, bz) - reach, z1 = Math.max(az, bz) + reach;
      const i0 = Math.floor(x0 / GRID), i1 = Math.floor(x1 / GRID);
      const j0 = Math.floor(z0 / GRID), j1 = Math.floor(z1 / GRID);
      for (let gi = i0; gi <= i1; gi++) {
        for (let gj = j0; gj <= j1; gj++) {
          const k = cellKey(gi, gj);
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(seg);
        }
      }
    }
  }

  function heightAt(x, z) {
    let y = baseHeight(x, z);
    const nearby = cells.get(cellKey(Math.floor(x / GRID), Math.floor(z / GRID)));
    if (!nearby) return y;
    let bestDist = Infinity, bestY = y, bestBench = 0, bestSowol = false;
    let liftY = y, liftDist = Infinity, liftReach = 0, liftBench = 0;
    for (const s of nearby) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const px = s.ax + dx * t, pz = s.az + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      if (dist >= s.reach) continue;
      const roadY = baseHeight(px, pz);
      // A climbing library driveway sitting on 소월로 must not own the
      // 4-lane shelf — otherwise the hillside jumps 3 m and pierces it.
      const shelf = s.isSowol && dist <= s.bench;
      const bestShelf = bestSowol && bestDist <= bestBench;
      if (bestDist === Infinity || (shelf !== bestShelf ? shelf : dist < bestDist)) {
        bestDist = dist;
        bestY = roadY;
        bestBench = s.bench;
        bestSowol = !!s.isSowol;
      }
      if (roadY > liftY || (roadY === liftY && dist < liftDist)) {
        liftY = roadY;
        liftDist = dist;
        liftReach = s.reach;
        liftBench = s.bench;
      }
    }
    if (bestDist === Infinity) return y;
    // Under the nearest ribbon: match it so coarse triangles cannot pierce it.
    // 소월로 keeps its full bench even on a steep cross-slope; elsewhere the
    // 2.2 m cap avoids carving a cliff beside a mountain trail.
    if (bestDist <= bestBench && (bestSowol || Math.abs(bestY - y) < 2.2)) return bestY;
    // Outside: raise ground toward the highest nearby carriageway, never carve
    // a trench toward a lower driveway that happens to sit closer.
    if (liftY <= y) return y;
    const span = Math.max(0.01, liftReach - liftBench);
    const u = liftDist <= liftBench ? 1 : 1 - (liftDist - liftBench) / span;
    const w = u * u * (3 - 2 * u);
    return y + (liftY - y) * w;
  };

  // Rendered DEM only: drop vertices under the paved shelf so the mesh is
  // metres below the ribbon. heightAt itself stays benched (gameplay + road
  // placement). logarithmicDepthBuffer is already on; a 10 cm gap at ~23 km
  // still z-fought as 8 m rectangular panels, so the geometry has to separate.
  const CARVE = 2.2;
  function renderHeightAt(x, z) {
    const y = heightAt(x, z);
    const nearby = cells.get(cellKey(Math.floor(x / GRID), Math.floor(z / GRID)));
    if (!nearby) return y;
    let best = Infinity, pad = 0;
    for (const s of nearby) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const dist = Math.hypot(s.ax + dx * t - x, s.az + dz * t - z);
      const p = s.hw + (s.isSowol ? 1.6 : 1.1);
      if (dist < best) { best = dist; pad = p; }
    }
    if (best === Infinity) return y;
    if (best <= pad) return y - CARVE;
    const blend = 3.2;
    if (best <= pad + blend) {
      const t = (best - pad) / blend;
      const w = t * t * (3 - 2 * t);
      return y - CARVE * (1 - w);
    }
    return y;
  }
  heightAt.renderHeightAt = renderHeightAt;
  return heightAt;
}


const NAMSAN_CAR = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential',
  'unclassified', 'service', 'living_street', 'primary_link', 'secondary_link', 'tertiary_link',
]);

/** Same width rules as createNamsanRoads so openings match the painted asphalt. */
export function namsanRenderedWay(w) {
  const isCar = NAMSAN_CAR.has(w.k);
  const namedLoop = /남산공원길|순환로/.test(w.name || '');
  const isSowol = (w.name || '') === '소월로';
  const isDrive = w.service === 'driveway'
    || !!(isCar && !namedLoop && !isSowol && (w.motor_vehicle === 'private' || !w.name));
  let width = w.w || (isCar ? 7 : w.k === 'steps' ? 2.6 : 2.3);
  if (w.k === 'elevator') width = 2.5;
  else if (isDrive) width = Math.min(width, w.service === 'driveway' ? 3.2 : 4.4);
  else if (isSowol) width = Math.max(width, 14);
  else if (namedLoop) width = Math.max(width, 8.6);
  return { width, isCar, namedLoop, isDrive, isSowol };
}

export function namsanWayKeepout(w, wallHalf = 0.78) {
  const info = namsanRenderedWay(w);
  let extra = 0.85;
  if (info.namedLoop) extra = 2.35; // sidewalk + curb + guardrail slack
  else if (info.isDrive) extra = 0.85;
  else if (info.isCar) extra = 0.65;
  return info.width * 0.5 + extra + wallHalf;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  if (L2 < 1e-12) return { d: Math.hypot(px - ax, pz - az), x: ax, z: az };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  const x = ax + dx * t, z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), x, z };
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const den = (ax - bx) * (cz - dz) - (az - bz) * (cx - dx);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((ax - cx) * (cz - dz) - (az - cz) * (cx - dx)) / den;
  const u = ((ax - cx) * (az - bz) - (az - cz) * (ax - bx)) / den;
  if (t < -1e-4 || t > 1 + 1e-4 || u < -1e-4 || u > 1 + 1e-4) return null;
  return { x: ax + t * (bx - ax), z: az + t * (bz - az) };
}

/**
 * Openings where 한양도성 crosses a road or trail, or sits on a car-road
 * envelope (surface, shoulder, sidewalk, guardrail). Trails that only walk
 * alongside the wall are left alone — no fabricated gates.
 */
export function namsanWallKeepouts(osm, wallHalf = 0.78) {
  const ways = osm?.ways || [];
  const walls = osm?.walls || [];
  const carWays = [];
  const crossings = [];
  for (const w of ways) {
    if (!w.pts || w.pts.length < 2) continue;
    if (w.k === 'elevator') continue;
    const info = namsanRenderedWay(w);
    const keep = namsanWayKeepout(w, wallHalf);
    if (info.isCar || info.namedLoop || info.isDrive) {
      carWays.push({
        pts: w.pts, keep, id: w.id, name: w.name || '', k: w.k,
        kind: info.namedLoop ? 'loop' : (info.isDrive ? 'drive' : 'car'),
      });
    }
  }
  for (const wall of walls) {
    const wpts = wall.pts || [];
    for (let i = 1; i < wpts.length; i++) {
      const ax = wpts[i - 1][0], az = wpts[i - 1][1], bx = wpts[i][0], bz = wpts[i][1];
      for (const w of ways) {
        if (!w.pts || w.pts.length < 2 || w.k === 'elevator') continue;
        const info = namsanRenderedWay(w);
        if (info.isCar || info.namedLoop || info.isDrive) continue;
        const keep = namsanWayKeepout(w, wallHalf);
        for (let j = 1; j < w.pts.length; j++) {
          const hit = segIntersect(
            ax, az, bx, bz,
            w.pts[j - 1][0], w.pts[j - 1][1], w.pts[j][0], w.pts[j][1],
          );
          if (hit) {
            crossings.push({
              x: hit.x, z: hit.z, r: keep, id: w.id, name: w.name || '',
              k: w.k, wallId: wall.id, kind: 'trail',
            });
          }
        }
      }
    }
  }
  return { carWays, crossings };
}

export function namsanWallPointOpen(x, z, keepouts) {
  if (!keepouts) return null;
  for (const c of keepouts.crossings) {
    if (Math.hypot(x - c.x, z - c.z) <= c.r) return c;
  }
  for (const w of keepouts.carWays) {
    const pts = w.pts;
    for (let i = 1; i < pts.length; i++) {
      const hit = distToSeg(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (hit.d <= w.keep) return { ...w, x: hit.x, z: hit.z, d: hit.d, r: w.keep };
    }
  }
  return null;
}

function splitWallRuns(samples, keepouts) {
  const runs = [];
  let cur = [];
  for (const s of samples) {
    if (namsanWallPointOpen(s.x, s.z, keepouts)) {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
    } else {
      cur.push(s);
    }
  }
  if (cur.length >= 2) runs.push(cur);
  return runs.filter((run) => {
    let L = 0;
    for (let i = 1; i < run.length; i++) {
      L += Math.hypot(run[i].x - run[i - 1].x, run[i].z - run[i - 1].z);
    }
    return L >= 2.4;
  });
}

function smoothWallRun(samples) {
  for (let pass = 0; pass < 2; pass++) {
    const ny = samples.map((s) => s.y);
    for (let i = 1; i < samples.length - 1; i++) {
      ny[i] = samples[i - 1].y * 0.25 + samples[i].y * 0.5 + samples[i + 1].y * 0.25;
    }
    samples.forEach((s, i) => { s.y = ny[i]; });
  }
  for (let i = 1; i < samples.length; i++) {
    const L = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z) || 1;
    const maxDy = 0.55 * L;
    const dy = samples[i].y - samples[i - 1].y;
    if (Math.abs(dy) > maxDy) samples[i].y = samples[i - 1].y + Math.sign(dy) * maxDy;
  }
  return samples;
}

export function createNamsanTerrain({ parent, dem, osm }) {
  const group = new THREE.Group();
  group.name = 'namsan-terrain';
  parent.add(group);
  let demMat = null;
  let plazaMat = null;

  const datum = dem?.datum ?? NT.datum;
  const baseY = NT.eleBase - datum;
  const peak = osm?.peak || { x: -10651.28, z: -20527.94 };
  const plaza = osm?.tower?.outer || [];

  const heightAt = makeNamsanHeightAt(dem, osm);

  let bounds = dem
    ? { x0: dem.x0, z0: dem.z0, x1: dem.x0 + (dem.nx - 1) * dem.dx, z1: dem.z0 + (dem.nz - 1) * dem.dz }
    : { x0: NT.tx - 800, z0: NT.tz - 900, x1: NT.tx + 800, z1: NT.tz + 700 };

  // ---- heightfield mesh (upsample DEM) ----
  if (dem) {
    // 25 m DEM ×6 ≈ 4.2 m vertices, fine enough that a carve under the
    // 14 m 소월로 shelf does not leave an 8 m triangle straddling the rim.
    const sub = 6;
    const nx = (dem.nx - 1) * sub + 1, nz = (dem.nz - 1) * sub + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const idx = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = dem.x0 + (i / sub) * dem.dx;
        const z = dem.z0 + (j / sub) * dem.dz;
        const yLogic = heightAt(x, z);
        const y = heightAt.renderHeightAt ? heightAt.renderHeightAt(x, z) : yLogic;
        const k = (j * nx + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        // slope color: deep forest on mid-slopes, grass near top, darker in valleys
        const e = yLogic + datum;
        const yp = heightAt(x + 8, z), ym = heightAt(x - 8, z), zp = heightAt(x, z + 8), zm = heightAt(x, z - 8);
        const slope = Math.hypot(yp - ym, zp - zm) / 16;
        const nrm = hash01(i, j);
        let r, g, b;
        if (yLogic < 10) { // city-foot dirt — avoid a pale night-blue apron
          r = 0.17 + nrm * 0.03; g = 0.18 + nrm * 0.03; b = 0.16 + nrm * 0.02;
        } else if (e > 230 && slope < 0.25) { // summit lawn / packed earth
          r = 0.45 + nrm * 0.06; g = 0.52 + nrm * 0.05; b = 0.32 + nrm * 0.04;
        } else if (slope > 0.55) { // rocky
          r = 0.38 + nrm * 0.06; g = 0.40 + nrm * 0.05; b = 0.34 + nrm * 0.04;
        } else { // forest floor
          r = 0.18 + nrm * 0.05; g = 0.32 + nrm * 0.08; b = 0.16 + nrm * 0.04;
        }
        if (yLogic < 24 && yLogic >= 10) {
          const u = (yLogic - 10) / 14;
          r = r * u + (0.17 + nrm * 0.03) * (1 - u);
          g = g * u + (0.18 + nrm * 0.03) * (1 - u);
          b = b * u + (0.16 + nrm * 0.02) * (1 - u);
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
    demMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, demMat);
    mesh.receiveShadow = true;
    mesh.name = 'namsan-dem';
    group.add(mesh);
  }

  // ---- fallback ground beyond the DEM so access roads (국립극장 동쪽 등) have no void ----
  let fallMat = null;
  {
    let wx0 = Infinity, wz0 = Infinity, wx1 = -Infinity, wz1 = -Infinity;
    for (const w of osm?.ways || []) {
      for (const pt of w.pts || []) {
        if (pt[0] < wx0) wx0 = pt[0];
        if (pt[0] > wx1) wx1 = pt[0];
        if (pt[1] < wz0) wz0 = pt[1];
        if (pt[1] > wz1) wz1 = pt[1];
      }
    }
    const MARGIN = 420;
    const gx0 = Math.min(bounds.x0, (Number.isFinite(wx0) ? wx0 : bounds.x0) - MARGIN);
    const gz0 = Math.min(bounds.z0, (Number.isFinite(wz0) ? wz0 : bounds.z0) - MARGIN);
    const gx1 = Math.max(bounds.x1, (Number.isFinite(wx1) ? wx1 : bounds.x1) + MARGIN);
    const gz1 = Math.max(bounds.z1, (Number.isFinite(wz1) ? wz1 : bounds.z1) + MARGIN);
    const need = gx0 < bounds.x0 - 1 || gz0 < bounds.z0 - 1 || gx1 > bounds.x1 + 1 || gz1 > bounds.z1 + 1;
    if (need) {
      const STEP = 20;
      const OVER = STEP;
      const nx = Math.floor((gx1 - gx0) / STEP) + 1;
      const nz = Math.floor((gz1 - gz0) / STEP) + 1;
      const pos = [];
      const col = [];
      const idx = [];
      const vert = new Int32Array(nx * nz);
      vert.fill(-1);
      const insideCore = (x, z) => (
        x > bounds.x0 + OVER && x < bounds.x1 - OVER
        && z > bounds.z0 + OVER && z < bounds.z1 - OVER
      );
      const ensure = (i, j) => {
        const k = j * nx + i;
        if (vert[k] >= 0) return vert[k];
        const x = gx0 + i * STEP, z = gz0 + j * STEP;
        const y = heightAt(x, z);
        const e = y + datum;
        const yp = heightAt(x + 8, z), ym = heightAt(x - 8, z);
        const zp = heightAt(x, z + 8), zm = heightAt(x, z - 8);
        const slope = Math.hypot(yp - ym, zp - zm) / 16;
        const nrm = hash01(i + 91, j + 17);
        let r, gch, b;
        if (y < 10) {
          r = 0.17 + nrm * 0.03; gch = 0.18 + nrm * 0.03; b = 0.16 + nrm * 0.02;
        } else if (e > 230 && slope < 0.25) {
          r = 0.45 + nrm * 0.06; gch = 0.52 + nrm * 0.05; b = 0.32 + nrm * 0.04;
        } else if (slope > 0.55) {
          r = 0.38 + nrm * 0.06; gch = 0.40 + nrm * 0.05; b = 0.34 + nrm * 0.04;
        } else {
          r = 0.18 + nrm * 0.05; gch = 0.32 + nrm * 0.08; b = 0.16 + nrm * 0.04;
        }
        if (y < 24 && y >= 10) {
          const u = (y - 10) / 14;
          r = r * u + (0.17 + nrm * 0.03) * (1 - u);
          gch = gch * u + (0.18 + nrm * 0.03) * (1 - u);
          b = b * u + (0.16 + nrm * 0.02) * (1 - u);
        }
        const vi = pos.length / 3;
        pos.push(x, y, z);
        col.push(r, gch, b);
        vert[k] = vi;
        return vi;
      };
      for (let j = 0; j < nz - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const x00 = gx0 + i * STEP, z00 = gz0 + j * STEP;
          const x11 = x00 + STEP, z11 = z00 + STEP;
          if (insideCore(x00, z00) && insideCore(x11, z00) && insideCore(x00, z11) && insideCore(x11, z11)) continue;
          const a = ensure(i, j), b = ensure(i + 1, j), c = ensure(i, j + 1), d = ensure(i + 1, j + 1);
          idx.push(a, c, b, b, c, d);
        }
      }
      if (idx.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        fallMat = new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.FrontSide,
          emissive: new THREE.Color('#2c3a1c'),
          emissiveIntensity: 0,
        });
        const fm = new THREE.Mesh(geo, fallMat);
        fm.receiveShadow = true;
        fm.name = 'namsan-dem-fallback';
        group.add(fm);
      }
      bounds = { x0: gx0, z0: gz0, x1: gx1, z1: gz1 };
    }
  }
  const forestBounds = {
    x0: dem ? dem.x0 : bounds.x0,
    z0: dem ? dem.z0 : bounds.z0,
    x1: dem ? dem.x0 + (dem.nx - 1) * dem.dx : bounds.x1,
    z1: dem ? dem.z0 + (dem.nz - 1) * dem.dz : bounds.z1,
  };

  // ---- forest (skip plaza, stations, roads/trails, very steep / peak pad) ----
  const onWay = makeWayMask(osm?.ways);
  const libPts = osm?.library?.pts;
  const libC = libPts?.length ? centroid(libPts) : null;
  const spring = osm?.spring;
  const onLibrary = (x, z) => {
    if (libC && Math.hypot(x - libC.x, z - libC.z) < 44) return true;
    if (spring && Number.isFinite(spring.x) && Math.hypot(x - spring.x, z - spring.z) < 9) return true;
    if (spring?.entrance && Math.hypot(x - spring.entrance.x, z - spring.entrance.z) < 8) return true;
    return false;
  };
  const trees = [];
  const x0 = forestBounds.x0 + 30, x1 = forestBounds.x1 - 30, z0 = forestBounds.z0 + 30, z1 = forestBounds.z1 - 30;
  for (let z = z0; z < z1; z += 14) {
    for (let x = x0; x < x1; x += 14) {
      const jx = x + (hash01(Math.round(x), Math.round(z)) - 0.5) * 10;
      const jz = z + (hash01(Math.round(z), Math.round(x)) - 0.5) * 10;
      const dT = Math.hypot(jx - NT.tx, jz - NT.tz);
      if (dT < 70) continue;
      if (onWay(jx, jz) || onLibrary(jx, jz)) continue;
      if (Math.hypot(jx + 10705, jz + 20554) < 28) continue;
      if (Math.hypot(jx + 10998, jz + 21021) < 36) continue;
      const y = heightAt(jx, jz);
      if (y < 4) continue;
      const s = Math.hypot(heightAt(jx + 6, jz) - heightAt(jx - 6, jz), heightAt(jx, jz + 6) - heightAt(jx, jz - 6)) / 12;
      if (s > 0.85) continue;
      const dens = y < 30 ? 0.25 : y < 80 ? 0.72 : y < 170 ? 0.8 : 0.38;
      if (hash01(Math.round(jx * 3), Math.round(jz * 3)) > dens) continue;
      trees.push([jx, jz]);
    }
  }
  // fill in a tighter canopy on the mid-slopes around the tower (70–280 m)
  for (let z = NT.tz - 280; z < NT.tz + 280; z += 7.2) {
    for (let x = NT.tx - 280; x < NT.tx + 280; x += 7.2) {
      const jx = x + (hash01(Math.round(x * 2), Math.round(z * 2)) - 0.5) * 5.5;
      const jz = z + (hash01(Math.round(z * 2), Math.round(x * 2)) - 0.5) * 5.5;
      const dT = Math.hypot(jx - NT.tx, jz - NT.tz);
      if (dT < 72 || dT > 280) continue;
      if (onWay(jx, jz) || onLibrary(jx, jz)) continue;
      if (Math.hypot(jx + 10705, jz + 20554) < 28) continue;
      const y = heightAt(jx, jz);
      if (y < 8) continue;
      const s = Math.hypot(heightAt(jx + 6, jz) - heightAt(jx - 6, jz), heightAt(jx, jz + 6) - heightAt(jx, jz - 6)) / 12;
      if (s > 0.85) continue;
      if (hash01(Math.round(jx * 5), Math.round(jz * 5)) > 0.62) continue;
      trees.push([jx, jz]);
    }
  }
  // light forest on the fallback apron (outside the original DEM)
  for (let z = bounds.z0 + 30; z < bounds.z1 - 30; z += 16) {
    for (let x = bounds.x0 + 30; x < bounds.x1 - 30; x += 16) {
      if (x >= forestBounds.x0 && x <= forestBounds.x1 && z >= forestBounds.z0 && z <= forestBounds.z1) continue;
      const jx = x + (hash01(Math.round(x), Math.round(z) + 3) - 0.5) * 11;
      const jz = z + (hash01(Math.round(z), Math.round(x) + 5) - 0.5) * 11;
      if (onWay(jx, jz) || onLibrary(jx, jz)) continue;
      const y = heightAt(jx, jz);
      if (y < 2) continue;
      const s = Math.hypot(heightAt(jx + 6, jz) - heightAt(jx - 6, jz), heightAt(jx, jz + 6) - heightAt(jx, jz - 6)) / 12;
      if (s > 0.85) continue;
      if (hash01(Math.round(jx * 3), Math.round(jz * 3)) > 0.42) continue;
      trees.push([jx, jz]);
    }
  }
  const forest = trees.length ? addInstancedTrees(group, trees, {
    rnd: () => hash01(Math.round(Math.random() * 1e6), 17),
    crownRadius: 2.6,
    crownY: 6.2,
    trunkHeight: 4.4,
    trunkColor: '#5c4634',
    scaleMin: 0.85,
    scaleSpan: 0.7,
    getY: (x, z) => heightAt(x, z),
  }) : null;

  // ---- 한양도성 (OSM wall ways only) ----
  // OSM height=11 은 남산 구간 실측(3–5 m + 여장)보다 커서 쓰지 않는다.
  const WALL_H = 4.2;
  const WALL_HALF = 0.78;
  const MERLON_H = 0.92;
  const MERLON_LEN = 1.15;
  const CREN_GAP = 0.85;
  let wallMat = null;
  let uplightMat = null;
  function stoneBlockTex() {
    try {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#6e6558'; x.fillRect(0, 0, 512, 256);
      const courseH = 32;
      for (let row = 0; row < 9; row++) {
        const yy = row * courseH;
        const off = (row % 2) * 46;
        for (let col = -1; col < 13; col++) {
          const bx = off + col * 92;
          const n = (row * 17 + col * 13) % 40;
          const r = 158 + n - 12, g = 146 + (n % 17) - 10, b = 124 + (n % 11) - 8;
          x.fillStyle = `rgb(${r},${g},${b})`;
          x.fillRect(bx + 2, yy + 2, 88, courseH - 4);
          x.fillStyle = 'rgba(255,255,255,0.07)';
          x.fillRect(bx + 4, yy + 3, 84, 3);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    } catch { return null; }
  }
  function uplightTex() {
    try {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 256, 0, 0);
      g.addColorStop(0, 'rgba(232,198,130,0.85)');
      g.addColorStop(0.35, 'rgba(210,170,100,0.35)');
      g.addColorStop(1, 'rgba(210,170,100,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    } catch { return null; }
  }
  function pushQuad(pos, nrm, uv, a, b, c, d, nx, ny, nz, u0, v0, u1, v1) {
    const vs = [a, b, c, a, c, d];
    const ts = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
    for (let i = 0; i < 6; i++) {
      pos.push(vs[i][0], vs[i][1], vs[i][2]);
      nrm.push(nx, ny, nz);
      uv.push(ts[i][0], ts[i][1]);
    }
  }
  const wallPos = [], wallNrm = [], wallUv = [];
  const merlonGeos = [];
  const uplightGeos = [];
  const stoneMap = stoneBlockTex();
  const washMap = uplightTex();
  const wallKeepouts = namsanWallKeepouts(osm, WALL_HALF);
  const wallHits = [];
  for (const wall of osm?.walls || []) {
    const pts = wall.pts || [];
    if (pts.length < 2) continue;
    const samples = [];
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.4) continue;
      const steps = Math.max(1, Math.ceil(L / 2.2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (!samples.length || Math.hypot(x - samples[samples.length - 1].x, z - samples[samples.length - 1].z) > 0.35) {
          samples.push({ x, z, y: heightAt(x, z) });
        }
      }
    }
    const last = pts[pts.length - 1];
    if (!samples.length || Math.hypot(last[0] - samples[samples.length - 1].x, last[1] - samples[samples.length - 1].z) > 0.35) {
      samples.push({ x: last[0], z: last[1], y: heightAt(last[0], last[1]) });
    }
    if (samples.length < 2) continue;
    const runs = splitWallRuns(samples, wallKeepouts);
    for (const run of runs) {
    const samples = smoothWallRun(run);
    let uAcc = 0;
    let merAcc = 0;
    let lightAcc = 0;
    const hw = WALL_HALF, H = WALL_H;
    for (let i = 1; i < samples.length; i++) {
      const ax = samples[i - 1].x, az = samples[i - 1].z, ay = samples[i - 1].y;
      const bx = samples[i].x, bz = samples[i].z, by = samples[i].y;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.35) continue;
      wallHits.push({ ax, az, bx, bz, L });
      const px = -dz / L, pz = dx / L;
      const yb0 = ay - 0.4, yb1 = by - 0.4, yt0 = ay + H, yt1 = by + H;
      const fba = [ax + px * hw, yb0, az + pz * hw];
      const fbb = [bx + px * hw, yb1, bz + pz * hw];
      const ftb = [bx + px * hw, yt1, bz + pz * hw];
      const fta = [ax + px * hw, yt0, az + pz * hw];
      const bba = [ax - px * hw, yb0, az - pz * hw];
      const bbb = [bx - px * hw, yb1, bz - pz * hw];
      const btb = [bx - px * hw, yt1, bz - pz * hw];
      const bta = [ax - px * hw, yt0, az - pz * hw];
      const u0 = uAcc / 4.4, u1 = (uAcc + L) / 4.4;
      pushQuad(wallPos, wallNrm, wallUv, fba, fbb, ftb, fta, px, 0, pz, u0, 0, u1, 1);
      pushQuad(wallPos, wallNrm, wallUv, bbb, bba, bta, btb, -px, 0, -pz, u0, 0, u1, 1);
      pushQuad(wallPos, wallNrm, wallUv, fta, ftb, btb, bta, 0, 1, 0, u0, 0, u1, 0.18);
      if (i === 1) pushQuad(wallPos, wallNrm, wallUv, bba, fba, fta, bta, -dx / L, 0, -dz / L, 0, 0, 0.35, 1);
      if (i === samples.length - 1) pushQuad(wallPos, wallNrm, wallUv, fbb, bbb, btb, ftb, dx / L, 0, dz / L, 0, 0, 0.35, 1);
      // 여장: 일정 간격의 치(merlon)와 타구(gap)
      let used = 0;
      while (used < L) {
        const inMerlon = (merAcc % (MERLON_LEN + CREN_GAP)) < MERLON_LEN;
        const remain = inMerlon
          ? MERLON_LEN - (merAcc % (MERLON_LEN + CREN_GAP))
          : (MERLON_LEN + CREN_GAP) - (merAcc % (MERLON_LEN + CREN_GAP));
        const take = Math.min(remain, L - used);
        if (!(take > 0.02)) { used += 0.03; merAcc += 0.03; continue; }
        if (inMerlon && take > 0.32) {
          const t = (used + take * 0.5) / L;
          const x = ax + dx * t, z = az + dz * t, y = ay + (by - ay) * t;
          const g = new THREE.BoxGeometry(take, MERLON_H, 1.62);
          g.rotateY(Math.atan2(dx, dz));
          g.translate(x, y + H + MERLON_H * 0.5, z);
          merlonGeos.push(g);
        }
        used += take; merAcc += take;
      }
      // 야간 업라이트: 내리막(도로에서 보이는) 면에 부드러운 워시
      lightAcc += L;
      while (lightAcc >= 12) {
        lightAcc -= 12;
        const t = Math.max(0.05, Math.min(0.95, 1 - lightAcc / L));
        const x = ax + dx * t, z = az + dz * t, y = ay + (by - ay) * t;
        const leftY = heightAt(x + px * 3, z + pz * 3);
        const rightY = heightAt(x - px * 3, z - pz * 3);
        const s = leftY <= rightY ? 1 : -1;
        const ug = new THREE.PlaneGeometry(2.4, 4.1);
        ug.rotateY(Math.atan2(s * px, s * pz));
        ug.translate(x + s * px * (hw + 0.12), y + 2.05, z + s * pz * (hw + 0.12));
        uplightGeos.push(ug);
      }
      uAcc += L;
    }
    }
  }
  wallMat = new THREE.MeshLambertMaterial({
    color: '#cfc4b0',
    map: stoneMap || null,
    emissive: new THREE.Color('#3a3228'),
    emissiveIntensity: 0,
  });
  if (wallPos.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wallNrm, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    const wm = new THREE.Mesh(wg, wallMat);
    wm.name = 'namsan-hanyang-wall';
    group.add(wm);
  }
  if (merlonGeos.length) {
    const mg = mergeGeometries(merlonGeos);
    const mm = new THREE.Mesh(mg, wallMat);
    mm.name = 'namsan-hanyang-merlon';
    group.add(mm);
  }
  uplightMat = new THREE.MeshBasicMaterial({
    map: washMap || null,
    color: '#e6c68a',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  if (uplightGeos.length) {
    const ug = mergeGeometries(uplightGeos);
    const um = new THREE.Mesh(ug, uplightMat);
    um.name = 'namsan-hanyang-uplight';
    um.visible = false;
    group.add(um);
  }

  // ---- 팔각정 (OSM way/1555991263, building=shelter) ----
  const pag = osm?.palgakjeong?.pts;
  if (pag && pag.length >= 3) {
    const c = centroid(pag);
    const y = heightAt(c.x, c.z);
    const pagG = new THREE.Group();
    pagG.position.set(c.x, y, c.z);
    const wood = new THREE.MeshLambertMaterial({ color: '#7a4a2a' });
    const cream = new THREE.MeshLambertMaterial({ color: '#e8d9b8' });
    const tile = new THREE.MeshLambertMaterial({ color: '#4a3020' });
    const R = 4.6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.4, 8), wood);
      col.position.set(Math.cos(a) * (R - 0.4), 1.7, Math.sin(a) * (R - 0.4));
      pagG.add(col);
    }
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.28, 8), cream);
    floor.position.y = 0.2;
    pagG.add(floor);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 1.1, 2.4, 8), tile);
    roof.position.y = 4.6;
    pagG.add(roof);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: '#c9a227' }));
    cap.position.y = 5.9;
    pagG.add(cap);
    group.add(pagG);
  }

  // ---- 남산 봉수대 (OSM way/378371654) ----
  const bng = osm?.bongsu?.pts;
  if (bng && bng.length >= 3) {
    const c = centroid(bng);
    const y = heightAt(c.x, c.z);
    const stoneM = new THREE.MeshLambertMaterial({ color: '#b7aa96' });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 1.4, 12), stoneM);
    base.position.set(c.x, y + 0.7, c.z);
    group.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.6, 10), stoneM);
    top.position.set(c.x, y + 2.2, c.z);
    group.add(top);
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 10), new THREE.MeshLambertMaterial({ color: '#3a2a22' }));
    pit.position.set(c.x, y + 3.05, c.z);
    group.add(pit);
  }

  // cheap 남산 순환로 / plaza streetlights (glowing bulbs, no real point lights)
  const lampPole = new THREE.MeshLambertMaterial({ color: '#2a2e34' });
  const lampBulb = new THREE.MeshBasicMaterial({ color: '#ffd89a', transparent: true, opacity: 0, fog: false });
  const lampGlow = new THREE.MeshBasicMaterial({
    color: '#ffc878', transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  });
  function addLamp(x, z, h = 3.5) {
    const y = heightAt(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 6), lampPole);
    pole.position.set(x, y + h / 2, z); group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lampBulb);
    bulb.position.set(x, y + h + 0.12, z); group.add(bulb);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampGlow);
    glow.position.set(x, y + h + 0.12, z); group.add(glow);
  }
  if (plaza.length >= 3) {
    const c = centroid(plaza);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      addLamp(c.x + Math.cos(a) * 22, c.z + Math.sin(a) * 22, 3.2);
    }
  }

  // OSM-tagged landmarks only (전망대 / 안내판). 팔각정·봉수대는 위에 이미 있다.
  for (const lm of osm?.landmarks || []) {
    if (!Number.isFinite(lm.x) || !Number.isFinite(lm.z)) continue;
    const y = heightAt(lm.x, lm.z);
    if (lm.k === 'viewpoint') {
      const deck = new THREE.Group();
      deck.position.set(lm.x, y, lm.z);
      const wood = new THREE.MeshLambertMaterial({ color: '#8a7355' });
      const rail = new THREE.MeshLambertMaterial({ color: '#d8d2c6' });
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.22, 10), wood);
      floor.position.y = 0.18;
      deck.add(floor);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.05, 6), rail);
        post.position.set(Math.cos(a) * 3.05, 0.7, Math.sin(a) * 3.05);
        deck.add(post);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.045, 6, 16), rail);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.15;
      deck.add(ring);
      group.add(deck);
    } else if (lm.k === 'guidepost') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), new THREE.MeshLambertMaterial({ color: '#3d434a' }));
      pole.position.set(lm.x, y + 1.2, lm.z);
      group.add(pole);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.06), new THREE.MeshLambertMaterial({ color: '#ece6d6' }));
      board.position.set(lm.x, y + 2.05, lm.z);
      group.add(board);
    }
  }

  // packed plaza disk so the footprint isn't raw forest color
  if (plaza.length >= 3) {
    const shape = new THREE.Shape(plaza.map((p) => new THREE.Vector2(p[0] - NT.tx, -(p[1] - NT.tz))));
    const sg = new THREE.ShapeGeometry(shape);
    sg.rotateX(-Math.PI / 2);
    const y = baseY + 0.04;
    sg.translate(NT.tx, y, NT.tz);
    plazaMat = new THREE.MeshLambertMaterial({ color: '#d5cbbb' });
    const pm = new THREE.Mesh(sg, plazaMat);
    pm.receiveShadow = true;
    group.add(pm);
  }

  return {
    group,
    bounds,
    baseY,
    heightAt,
    datum,
    peak,
    setNight(v = 0) {
      const k = Math.max(0, Math.min(1, v));
      if (demMat) demMat.color.setRGB(1 - k * 0.76, 1 - k * 0.73, 1 - k * 0.70);
      if (fallMat) {
        // keep the skirt readable at night so it never photographs as a void
        fallMat.color.setRGB(1 - k * 0.40, 1 - k * 0.36, 1 - k * 0.42);
        fallMat.emissiveIntensity = k * 0.55;
      }
      if (forest?.crowns?.material) forest.crowns.material.color.setRGB(1 - k * 0.78, 1 - k * 0.72, 1 - k * 0.8);
      if (forest?.trunks?.material) forest.trunks.material.color.setRGB(1 - k * 0.55, 1 - k * 0.55, 1 - k * 0.5);
      if (plazaMat) plazaMat.color.set(k > 0.4 ? '#3a3530' : '#d5cbbb');
      lampBulb.opacity = k;
      lampGlow.opacity = k * 0.45;
      lampBulb.visible = k > 0.05;
      lampGlow.visible = k > 0.05;
      if (wallMat) wallMat.emissiveIntensity = k * 0.22;
      if (uplightMat) {
        uplightMat.opacity = k * 0.62;
        uplightMat.visible = k > 0.05;
        const up = group.getObjectByName('namsan-hanyang-uplight');
        if (up) up.visible = k > 0.05;
      }
    },
    isBlocked(x, z, r = 0.4) {
      const need = WALL_HALF + (Number.isFinite(r) ? r : 0.4);
      const need2 = need * need;
      for (const s of wallHits) {
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (s.L * s.L || 1)));
        const px = s.ax + dx * t - x, pz = s.az + dz * t - z;
        if (px * px + pz * pz < need2) return true;
      }
      return false;
    },
  };
}
