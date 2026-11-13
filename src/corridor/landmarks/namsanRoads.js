// [namsan] OSM 남산공원길·순환로·소월로·산책로·계단을 지형 위에 깔고, 버스 정류장과 입구 안내를 둔다.
//   브랜드 로고 없음. 타워 정류장은 OSM 표기(남산서울타워).
//   남산도서관 정류장 노선은 공식 오시는길(01A·01B·402·405)만 적는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ribbonGeo, fixNormalsUp } from '../../world.js';
import { paint } from '../tileMesh.js';
import { createBus } from '../../transit/busModel.js';
import { NT, NAMSAN_CONNECT_ENDS } from './namsanCoords.js';
import { cityJunctionApproaches } from './namsanCity.js';
export { NAMSAN_CONNECT_ENDS };
import { buildStreetlightGeometries, SCALE, POOL_SCALE, POOL_R, POOL_RZ, POOL_GAIN, ARM, LENS_DAY, LENS_NIGHT } from '../../world/streetlights.js';
import { lightPoolMaterial } from '../../world/nightLights.js';

const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'primary_link', 'secondary_link', 'tertiary_link']);
const STEPS = new Set(['steps']);

function resample(pts, step = 2.4) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [[pts[0][0], pts[0][1]]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let ax = out[out.length - 1][0], az = out[out.length - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    let dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    while (acc + L >= step) {
      const t = (step - acc) / L;
      ax += dx * t; az += dz * t;
      out.push([ax, az]);
      dx = bx - ax; dz = bz - az; L = Math.hypot(dx, dz);
      acc = 0;
    }
    acc += L;
  }
  const last = pts[pts.length - 1];
  const p = out[out.length - 1];
  if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.4) out.push([last[0], last[1]]);
  else { p[0] = last[0]; p[1] = last[1]; }
  return out;
}

function elevated(pts, heightAt, dy) {
  return pts.map(([x, z]) => [x, z, heightAt(x, z) + dy]);
}

// Driveways and footways on a cross-slope: sample each edge against the
// terrain so the ribbon does not float as a dark wedge (소월로 옆 진입로).
function drapedRibbonGeo(pts, width, heightAt, dy) {
  const n = pts.length;
  if (n < 2) return null;
  const pos = [], idx = [];
  const widthAt = (i) => (Array.isArray(width) ? width[Math.min(i, width.length - 1)] : width);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const hw = widthAt(i) / 2;
    const lx = p[0] - dz * hw, lz = p[1] + dx * hw;
    const rx = p[0] + dz * hw, rz = p[1] - dx * hw;
    pos.push(lx, heightAt(lx, lz) + dy, lz, rx, heightAt(rx, rz) + dy, rz);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return fixNormalsUp(g);
}


const SOWOL_FULL_W = 14;
const SOWOL_JOIN_W = 8.6;
const SOWOL_TAPER_M = 18;

function distAlongFromTip(pts, tip) {
  const n = pts.length;
  const out = new Array(n).fill(0);
  if (!tip || n < 2) return out;
  const d0 = Math.hypot(pts[0][0] - tip[0], pts[0][1] - tip[1]);
  const d1 = Math.hypot(pts[n - 1][0] - tip[0], pts[n - 1][1] - tip[1]);
  if (d0 <= d1) {
    for (let i = 1; i < n; i++) {
      out[i] = out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
  } else {
    for (let i = n - 2; i >= 0; i--) {
      out[i] = out[i + 1] + Math.hypot(pts[i][0] - pts[i + 1][0], pts[i][1] - pts[i + 1][1]);
    }
  }
  return out;
}

function sowolWidthAt(pts, tip) {
  const along = distAlongFromTip(pts, tip);
  return along.map((d) => {
    if (d >= SOWOL_TAPER_M) return SOWOL_FULL_W;
    const t = d / SOWOL_TAPER_M;
    const s = t * t * (3 - 2 * t);
    return SOWOL_JOIN_W + (SOWOL_FULL_W - SOWOL_JOIN_W) * s;
  });
}

// East 소월로 / 남산공원길 junction: keep the through-ribbons continuous
// and fill only inside-corner curb fillets (5–7 m). No circular hole, no disc.
const JUNCTION_FILLET = 6;

function findSowolParkTip(ways) {
  const sowols = (ways || []).filter((w) => (w.name || '') === '소월로' && w.pts?.length >= 2);
  const parks = (ways || []).filter((w) => (w.name || '') === '남산공원길' && w.pts?.length >= 2);
  let best = Infinity, tip = null;
  for (const s of sowols) {
    for (const p of parks) {
      for (const a of [s.pts[0], s.pts[s.pts.length - 1]]) {
        for (const b of [p.pts[0], p.pts[p.pts.length - 1]]) {
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (d < best) {
            best = d;
            tip = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
          }
        }
      }
    }
  }
  return best < 8 ? tip : null;
}

function nearestOnCenterline(x, z, pts) {
  let best = Infinity, bx = pts[0][0], bz = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], cx = pts[i][0], cz = pts[i][1];
    const dx = cx - ax, dz = cz - az;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bx = px; bz = pz; }
  }
  return { d: best, x: bx, z: bz };
}

function angNorm(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function localHeadings(pts, ox, oz) {
  if (!pts || pts.length < 2) return [];
  const n = nearestOnCenterline(ox, oz, pts);
  let hx = 1, hz = 0;
  let best = Infinity;
  let nearAcc = 0;
  let acc = 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((n.x - ax) * dx + (n.z - az) * dz) / (L * L)));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(n.x - px, n.z - pz);
    if (d < best) {
      best = d;
      hx = dx / L;
      hz = dz / L;
      nearAcc = acc + t * L;
    }
    acc += L;
    total += L;
  }
  const endSlop = 2.2;
  const headings = [];
  if (nearAcc > endSlop) headings.push({ hx: -hx, hz: -hz });
  if (total - nearAcc > endSlop) headings.push({ hx, hz });
  if (!headings.length) headings.push({ hx, hz });
  return headings;
}

function pairMeet(ptsA, ptsB) {
  let best = Infinity, mx = 0, mz = 0;
  const consider = (x, z, d) => {
    if (d < best) { best = d; mx = x; mz = z; }
  };
  const ends = (pts) => [pts[0], pts[pts.length - 1]];
  for (const a of ends(ptsA)) {
    const n = nearestOnCenterline(a[0], a[1], ptsB);
    consider((a[0] + n.x) * 0.5, (a[1] + n.z) * 0.5, n.d);
  }
  for (const b of ends(ptsB)) {
    const n = nearestOnCenterline(b[0], b[1], ptsA);
    consider((b[0] + n.x) * 0.5, (b[1] + n.z) * 0.5, n.d);
  }
  return { x: mx, z: mz, d: best };
}

function inCCWSector(px, pz, ax, az, bx, bz) {
  const pa = Math.atan2(px, pz);
  const a0 = Math.atan2(ax, az);
  const span = angNorm(Math.atan2(bx, bz) - a0);
  if (span <= 1e-4) return false;
  const delta = angNorm(pa - a0);
  return delta >= -0.04 && delta <= span + 0.04;
}

function describeJunctionFillets(arms, tip) {
  if (!arms?.length || !tip) return null;
  const queries = [];
  const cropR = 48;
  for (const arm of arms) {
    if (!arm.pts || arm.pts.length < 2) continue;
    const cropped = [];
    for (let i = 0; i < arm.pts.length; i++) {
      const pt = arm.pts[i];
      const d = Math.hypot(pt[0] - tip[0], pt[1] - tip[1]);
      if (d <= cropR) cropped.push(pt);
      else if (cropped.length && Math.hypot(arm.pts[i - 1][0] - tip[0], arm.pts[i - 1][1] - tip[1]) <= cropR) {
        cropped.push(pt);
      }
    }
    if (cropped.length < 2) continue;
    queries.push({
      pts: cropped,
      hw: Math.max(1.2, (arm.width || 8) * 0.5),
      name: arm.name || '',
    });
  }
  if (queries.length < 2) return null;

  const fillets = [];
  for (let i = 0; i < queries.length; i++) {
    for (let j = i + 1; j < queries.length; j++) {
      const meet = pairMeet(queries[i].pts, queries[j].pts);
      if (meet.d > 10) continue;
      const rays = [];
      for (const h of localHeadings(queries[i].pts, meet.x, meet.z)) rays.push({ i, ...h });
      for (const h of localHeadings(queries[j].pts, meet.x, meet.z)) rays.push({ i: j, ...h });
      rays.sort((a, b) => Math.atan2(a.hx, a.hz) - Math.atan2(b.hx, b.hz));
      if (rays.length < 2) continue;
      for (let k = 0; k < rays.length; k++) {
        const a = rays[k];
        const b = rays[(k + 1) % rays.length];
        if (a.i === b.i) continue;
        const span = angNorm(Math.atan2(b.hx, b.hz) - Math.atan2(a.hx, a.hz));
        const sector = span > 0 ? span : span + Math.PI * 2;
        // Skip the near-straight outside and the acute sliver between
        // 공원길 and 남산접근 (those are not inside-corner curb returns).
        if (sector < 0.75 || sector >= Math.PI - 0.02) continue;
        // Inward (into the grass crotch): right of outgoing A, left of outgoing B.
        fillets.push({
          armI: a.i,
          armJ: b.i,
          vx: meet.x,
          vz: meet.z,
          ax: a.hx,
          az: a.hz,
          bx: b.hx,
          bz: b.hz,
          nAx: a.hz,
          nAz: -a.hx,
          nBx: -b.hz,
          nBz: b.hx,
        });
      }
    }
  }
  if (!fillets.length) return null;
  const FR = JUNCTION_FILLET;
  for (const f of fillets) {
    const qA = queries[f.armI], qB = queries[f.armJ];
    const C = locateOffsetPoint(qA, qB, f, FR, FR);
    const sa = nearestOnCenterline(C.x, C.z, qA.pts).d - qA.hw;
    const sb = nearestOnCenterline(C.x, C.z, qB.pts).d - qB.hw;
    if (Math.abs(sa - FR) > 1.1 || Math.abs(sb - FR) > 1.1) continue;
    if (!inCCWSector(C.x - f.vx, C.z - f.vz, f.ax, f.az, f.bx, f.bz)) continue;
    f.cx = C.x;
    f.cz = C.z;
  }
  return { queries, fillets, tip };
}

function pointInFillet(desc, x, z) {
  if (!desc?.fillets?.length) return false;
  const FR = JUNCTION_FILLET;
  const { queries, fillets } = desc;
  for (const f of fillets) {
    const sa = nearestOnCenterline(x, z, queries[f.armI].pts).d - queries[f.armI].hw;
    const sb = nearestOnCenterline(x, z, queries[f.armJ].pts).d - queries[f.armJ].hw;
    if (sa <= 0 || sb <= 0) continue;
    if (sa >= FR || sb >= FR) continue;
    // Tangent curb-return: keep only the pocket between the two edges and
    // the arc of radius FR (outside the circle centered at C). This is the
    // paved fillet inside the curb, not a quarter-disk lobe on the grass.
    if (f.cx == null) continue;
    const dx = x - f.cx, dz = z - f.cz;
    if (dx * dx + dz * dz < FR * FR) continue;
    const reach = FR + queries[f.armI].hw + queries[f.armJ].hw + 2;
    if (Math.hypot(x - f.vx, z - f.vz) > reach) continue;
    if (!inCCWSector(x - f.vx, z - f.vz, f.ax, f.az, f.bx, f.bz)) continue;
    return true;
  }
  return false;
}

function locateOffsetPoint(qA, qB, f, tA, tB) {
  let x = f.vx + f.nAx * (qA.hw + tA) + f.nBx * tB * 0.25;
  let z = f.vz + f.nAz * (qA.hw + tA) + f.nBz * tB * 0.25;
  for (let iter = 0; iter < 12; iter++) {
    const nA = nearestOnCenterline(x, z, qA.pts);
    const nB = nearestOnCenterline(x, z, qB.pts);
    const sa = nA.d - qA.hw;
    const sb = nB.d - qB.hw;
    const gAl = Math.hypot(x - nA.x, z - nA.z) || 1;
    const gBl = Math.hypot(x - nB.x, z - nB.z) || 1;
    x += ((tA - sa) * (x - nA.x) / gAl + (tB - sb) * (x - nB.x) / gBl) * 0.55;
    z += ((tA - sa) * (z - nA.z) / gAl + (tB - sb) * (z - nB.z) / gBl) * 0.55;
  }
  return { x, z };
}

// Curb polyline along the tangent fillet arc (radius JUNCTION_FILLET,
// centered in the crotch so the arc meets both road edges smoothly).
function filletCurbArcs(desc) {
  const FR = JUNCTION_FILLET;
  const arcs = [];
  if (!desc?.fillets?.length) return arcs;
  for (const f of desc.fillets) {
    const Cx = f.cx, Cz = f.cz;
    if (Cx == null || Cz == null) continue;
    const angA = Math.atan2(-f.nAx, -f.nAz);
    const angB = Math.atan2(-f.nBx, -f.nBz);
    let sweep = angNorm(angB - angA);
    const ptAt = (ang) => [Cx + FR * Math.sin(ang), Cz + FR * Math.cos(ang)];
    const mid1 = angA + sweep * 0.5;
    const alt = sweep > 0 ? sweep - Math.PI * 2 : sweep + Math.PI * 2;
    const mid2 = angA + alt * 0.5;
    const d1 = Math.hypot(ptAt(mid1)[0] - f.vx, ptAt(mid1)[1] - f.vz);
    const d2 = Math.hypot(ptAt(mid2)[0] - f.vx, ptAt(mid2)[1] - f.vz);
    if (d2 < d1) sweep = alt;
    if (Math.abs(sweep) < 0.08 || Math.abs(sweep) > Math.PI + 0.05) continue;
    const nSteps = Math.max(6, Math.ceil(Math.abs(sweep) * FR / 0.4));
    const arc = [];
    for (let i = 0; i <= nSteps; i++) arc.push(ptAt(angA + sweep * (i / nSteps)));
    arcs.push(arc);
  }
  return arcs;
}

function clipPiecesOutside(pts, drop) {
  if (!pts || pts.length < 2) return [];
  const crossing = (keep, gone) => {
    let a = keep, b = gone;
    for (let i = 0; i < 14; i++) {
      const m = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
      if (drop(m[0], m[1])) b = m;
      else a = m;
    }
    return a;
  };
  const pieces = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const inside = drop(pt[0], pt[1]);
    if (i === 0) {
      if (!inside) cur.push(pt);
      continue;
    }
    const prev = pts[i - 1];
    const prevIn = drop(prev[0], prev[1]);
    if (!prevIn && !inside) {
      cur.push(pt);
    } else if (!prevIn && inside) {
      const x = crossing(prev, pt);
      if (Math.hypot(x[0] - prev[0], x[1] - prev[1]) > 0.12) cur.push(x);
      if (cur.length >= 2) pieces.push(cur);
      cur = [];
    } else if (prevIn && !inside) {
      const x = crossing(pt, prev);
      cur = Math.hypot(x[0] - pt[0], x[1] - pt[1]) > 0.12 ? [x, pt] : [pt];
    }
  }
  if (cur.length >= 2) pieces.push(cur);
  return pieces.filter((pp) => {
    let L = 0;
    for (let i = 1; i < pp.length; i++) L += Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]);
    return L >= 1.0;
  });
}

function furnitureHitsJunction(x, z, arms, exceptName, filletDesc) {
  if (!arms?.length) return false;
  for (const arm of arms) {
    if (exceptName && arm.name === exceptName) continue;
    const n = nearestOnCenterline(x, z, arm.pts);
    // Stay off the other carriageway and yield to the fillet arc (radius
    // JUNCTION_FILLET past the other edge) so straight curbs/rails stop at
    // the tangent rather than crossing the paved junction.
    if (n.d < arm.width * 0.5 + JUNCTION_FILLET + 0.25) return true;
  }
  return !!(filletDesc && pointInFillet(filletDesc, x, z));
}

function collectJunctionArms(ways, tip, carriageSegs) {
  if (!tip) return [];
  const arms = [];
  for (const w of ways) {
    if (!CAR.has(w.k)) continue;
    const namedLoop = /남산공원길|순환로/.test(w.name || '');
    const isSowol = (w.name || '') === '소월로';
    const isPark = (w.name || '') === '남산공원길';
    const isJoin = !!w._sowolJoin;
    const isDrive = !isJoin && (w.service === 'driveway'
      || (!namedLoop && !isSowol && (w.motor_vehicle === 'private' || !w.name)));
    let width = w.w || 7;
    if (isDrive) width = Math.min(width, w.service === 'driveway' ? 3.2 : 4.4);
    else if (isSowol) width = Math.max(width, 14);
    else if (namedLoop) width = Math.max(width, 8.6);
    let srcPts = w.pts;
    if (isDrive && carriageSegs?.length) {
      const trimmed = trimOffCarriageway(w.pts, carriageSegs, 0.2);
      if (!trimmed) continue;
      srcPts = trimmed;
    }
    const pts = resample(srcPts, (isDrive || isSowol || isPark) ? 1.1 : 2.4);
    if (pts.length < 2) continue;
    const tipD = (q) => Math.hypot(q[0] - tip[0], q[1] - tip[1]);
    const meetsTip = Math.min(tipD(pts[0]), tipD(pts[pts.length - 1])) < 10;
    let hasInside = false;
    for (const q of pts) {
      if (tipD(q) < 36 + width * 0.5) { hasInside = true; break; }
    }
    const nearTipEnd = Math.min(tipD(pts[0]), tipD(pts[pts.length - 1])) < 36;
    const enters = isSowol || isJoin || (isPark && meetsTip) || (nearTipEnd && hasInside);
    if (!enters) continue;
    arms.push({ pts, width: isSowol ? SOWOL_JOIN_W : width, name: w.name || w.k || 'way' });
  }
  return arms;
}

// Draped mesh of inside-corner curb fillets only (radius JUNCTION_FILLET).
// Road bodies stay on the continuous ribbons; the large outside sector is
// left alone so the junction cannot grow into a disc. Fill stays inside the
// curb arcs (quarter-disks between adjacent arm edges).
function drapedJunctionUnionGeo(arms, tip, heightAt, dy, descPre) {
  const desc = descPre || describeJunctionFillets(arms, tip);
  if (!desc?.fillets?.length) return null;
  const FR = JUNCTION_FILLET;
  const queries = desc.queries;
  const fillets = desc.fillets;
  function inside(x, z) { return pointInFillet(desc, x, z); }

  const maxHw = Math.max(...queries.map((q) => q.hw));
  const pad = FR + maxHw + 2.4;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const f of fillets) {
    if (f.vx - pad < x0) x0 = f.vx - pad;
    if (f.vx + pad > x1) x1 = f.vx + pad;
    if (f.vz - pad < z0) z0 = f.vz - pad;
    if (f.vz + pad > z1) z1 = f.vz + pad;
  }
  const step = 0.55;
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const nzc = Math.ceil((z1 - z0) / step) + 1;
  const occ = new Uint8Array(nx * nzc);
  for (let j = 0; j < nzc; j++) {
    for (let i = 0; i < nx; i++) {
      if (inside(x0 + i * step, z0 + j * step)) occ[j * nx + i] = 1;
    }
  }

  const pos = [], index = [];
  const vertKey = new Map();
  const vert = (x, z) => {
    const k = `${x.toFixed(3)},${z.toFixed(3)}`;
    let id = vertKey.get(k);
    if (id != null) return id;
    id = pos.length / 3;
    pos.push(x, heightAt(x, z) + dy, z);
    vertKey.set(k, id);
    return id;
  };
  const cross = (ax, az, onA, bx, bz, onB) => {
    let lo = 0, hi = 1;
    for (let k = 0; k < 6; k++) {
      const t = (lo + hi) * 0.5;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (inside(x, z) === onA) lo = t;
      else hi = t;
    }
    const t = (lo + hi) * 0.5;
    return [ax + (bx - ax) * t, az + (bz - az) * t];
  };

  for (let j = 0; j < nzc - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const ons = [
        occ[j * nx + i],
        occ[j * nx + i + 1],
        occ[(j + 1) * nx + i + 1],
        occ[(j + 1) * nx + i],
      ];
      const bits = ons[0] | (ons[1] << 1) | (ons[2] << 2) | (ons[3] << 3);
      if (!bits) continue;
      const xA = x0 + i * step, zA = z0 + j * step;
      const corners = [
        [xA, zA], [xA + step, zA], [xA + step, zA + step], [xA, zA + step],
      ];
      if (bits === 15) {
        const a = vert(corners[0][0], corners[0][1]);
        const b = vert(corners[1][0], corners[1][1]);
        const c = vert(corners[2][0], corners[2][1]);
        const d = vert(corners[3][0], corners[3][1]);
        index.push(a, b, c, a, c, d);
        continue;
      }
      const poly = [];
      for (let e = 0; e < 4; e++) {
        const n = (e + 1) & 3;
        if (ons[e]) poly.push(corners[e]);
        if (!ons[e] !== !ons[n]) {
          poly.push(cross(
            corners[e][0], corners[e][1], !!ons[e],
            corners[n][0], corners[n][1], !!ons[n],
          ));
        }
      }
      if (poly.length < 3) continue;
      const ids = poly.map((q) => vert(q[0], q[1]));
      for (let k = 1; k < ids.length - 1; k++) index.push(ids[0], ids[k], ids[k + 1]);
    }
  }
  if (index.length < 3) return null;
  for (let i = 0; i < index.length; i += 3) {
    const t = index[i + 1];
    index[i + 1] = index[i + 2];
    index[i + 2] = t;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  const nrm = new Float32Array((pos.length / 3) * 3);
  for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

function geoXzBounds(geo) {
  const a = geo?.attributes?.position?.array;
  if (!a?.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < a.length; i += 3) {
    if (a[i] < minX) minX = a[i]; if (a[i] > maxX) maxX = a[i];
    if (a[i + 1] < minY) minY = a[i + 1]; if (a[i + 1] > maxY) maxY = a[i + 1];
    if (a[i + 2] < minZ) minZ = a[i + 2]; if (a[i + 2] > maxZ) maxZ = a[i + 2];
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function guideY(x, z, heightAt) {
  const d = Math.hypot(x - NT.tx, z - NT.tz);
  const plazaY = NT.eleBase - NT.datum;
  // 광장 포장 위에 바짝 붙인다. DEM 이 동쪽 광장을 높이 집어도 기단을 따른다.
  if (d < 90) return plazaY + 0.06;
  return heightAt(x, z) + 0.05;
}


function segsOf(pts) {
  const s = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 0.2) s.push({ a, b, L });
  }
  return s;
}

function nearSeg(x, z, segs, pad) {
  let best = Infinity;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / (s.L * s.L || 1)));
    const d = Math.hypot(s.a[0] + dx * t - x, s.a[1] + dz * t - z);
    if (d < best) best = d;
    if (best < pad) return best;
  }
  return best;
}

function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

function pointAt(pts, dist) {
  if (pts.length < 2) return { x: pts[0]?.[0] || 0, z: pts[0]?.[1] || 0, hx: 1, hz: 0 };
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const L = Math.hypot(bx - ax, bz - az) || 1e-9;
    if (left <= L || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, left / L));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, hx: (bx - ax) / L, hz: (bz - az) / L };
    }
    left -= L;
  }
  const n = pts.length;
  const L = Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]) || 1;
  return { x: pts[n - 1][0], z: pts[n - 1][1], hx: (pts[n - 1][0] - pts[n - 2][0]) / L, hz: (pts[n - 1][1] - pts[n - 2][1]) / L };
}


function headingAt(pts, i) {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  let hx = next[0] - prev[0], hz = next[1] - prev[1];
  const L = Math.hypot(hx, hz) || 1;
  return { hx: hx / L, hz: hz / L };
}

function offsetLine(pts, dist) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const { hx, hz } = headingAt(pts, i);
    out.push([pts[i][0] - hz * dist, pts[i][1] + hx * dist]);
  }
  return out;
}

function offsetBySigned(pts, distAt) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const { hx, hz } = headingAt(pts, i);
    const d = typeof distAt === 'function' ? distAt(i) : distAt;
    out.push([pts[i][0] - hz * d, pts[i][1] + hx * d]);
  }
  return out;
}

// Decorations must share the road centerline height. Sampling heightAt at an
// offset XZ on a cross-slope lifted sidewalks, paint lines and rails onto the
// hillside (the tan "detached slab" next to 약수터길).
function attachToRoad(centerPts, offsetPts, heightAt, dy) {
  return offsetPts.map((p, i) => {
    const c = centerPts[Math.min(i, centerPts.length - 1)];
    return [p[0], p[1], heightAt(c[0], c[1]) + dy];
  });
}

function localUpSign(pts, i, heightAt) {
  const { hx, hz } = headingAt(pts, i);
  const x = pts[i][0], z = pts[i][1];
  const leftY = heightAt(x - hz * 6, z + hx * 6);
  const rightY = heightAt(x + hz * 6, z - hx * 6);
  return leftY >= rightY ? 1 : -1;
}

function smoothSideSigns(pts, heightAt) {
  const raw = pts.map((_, i) => localUpSign(pts, i, heightAt));
  const out = new Array(raw.length);
  let cur = raw[0];
  let run = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === cur) run = Math.min(run + 1, 12);
    else {
      run -= 1;
      if (run < -5) { cur = raw[i]; run = 6; }
    }
    out[i] = cur;
  }
  return out;
}

function sideSign(pts, heightAt, pref) {
  if (pref === 'left') return 1;
  if (pref === 'right') return -1;
  const mid = Math.max(1, Math.min(pts.length - 1, Math.floor(pts.length / 2)));
  const a = pts[mid - 1], b = pts[mid];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const hx = (b[0] - a[0]) / L, hz = (b[1] - a[1]) / L;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const leftY = heightAt(mx - hz * 4, mz + hx * 4);
  const rightY = heightAt(mx + hz * 4, mz - hx * 4);
  const uphill = leftY >= rightY ? 1 : -1;
  return pref === 'downhill' ? -uphill : uphill;
}

function stitchNamed(ways, re, joinDist = 6) {
  const list = ways.filter((w) => re.test(w.name || '') && w.pts?.length >= 2).map((w) => w.pts.map((p) => [p[0], p[1]]));
  if (!list.length) return null;
  const used = new Set();
  let chain = list[0].slice();
  used.add(0);
  const endKey = (pts, which) => {
    const p = which === 'a' ? pts[0] : pts[pts.length - 1];
    return p;
  };
  let grew = true;
  while (grew) {
    grew = false;
    const head = endKey(chain, 'a'), tail = endKey(chain, 'b');
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      const pts = list[i];
      const a = pts[0], b = pts[pts.length - 1];
      const pairs = [
        [Math.hypot(tail[0] - a[0], tail[1] - a[1]), () => { chain = chain.concat(pts.slice(1)); }],
        [Math.hypot(tail[0] - b[0], tail[1] - b[1]), () => { chain = chain.concat(pts.slice().reverse().slice(1)); }],
        [Math.hypot(head[0] - b[0], head[1] - b[1]), () => { chain = pts.slice(0, -1).concat(chain); }],
        [Math.hypot(head[0] - a[0], head[1] - a[1]), () => { chain = pts.slice().reverse().slice(0, -1).concat(chain); }],
      ];
      pairs.sort((x, y) => x[0] - y[0]);
      if (pairs[0][0] < joinDist) {
        pairs[0][1]();
        used.add(i);
        grew = true;
        break;
      }
    }
  }
  return chain.length >= 2 ? chain : null;
}

function stitchGroups(ways, pred, joinDist = 6) {
  const items = ways.filter((w) => pred(w) && w.pts?.length >= 2)
    .map((w) => ({ w, pts: w.pts.map((p) => [p[0], p[1]]) }));
  if (items.length < 2) return null;
  const used = new Set();
  const groups = [];
  for (let seed = 0; seed < items.length; seed++) {
    if (used.has(seed)) continue;
    let chain = items[seed].pts.slice();
    used.add(seed);
    let grew = true;
    while (grew) {
      grew = false;
      const head = chain[0], tail = chain[chain.length - 1];
      for (let i = 0; i < items.length; i++) {
        if (used.has(i)) continue;
        const pts = items[i].pts;
        const a = pts[0], b = pts[pts.length - 1];
        const pairs = [
          [Math.hypot(tail[0] - a[0], tail[1] - a[1]), () => { chain = chain.concat(pts.slice(1)); }],
          [Math.hypot(tail[0] - b[0], tail[1] - b[1]), () => { chain = chain.concat(pts.slice().reverse().slice(1)); }],
          [Math.hypot(head[0] - b[0], head[1] - b[1]), () => { chain = pts.slice(0, -1).concat(chain); }],
          [Math.hypot(head[0] - a[0], head[1] - a[1]), () => { chain = pts.slice().reverse().slice(0, -1).concat(chain); }],
        ];
        pairs.sort((x, y) => x[0] - y[0]);
        if (pairs[0][0] < joinDist) {
          pairs[0][1]();
          used.add(i);
          grew = true;
          break;
        }
      }
    }
    if (chain.length >= 2) groups.push({ tmpl: items[seed].w, pts: chain });
  }
  return groups;
}

function replaceNamedWays(ways, name) {
  const groups = stitchGroups(ways, (w) => (w.name || '') === name);
  if (!groups) return ways;
  return ways.filter((w) => (w.name || '') !== name)
    .concat(groups.map((g) => ({ ...g.tmpl, pts: g.pts })));
}

function majorCarSegs(ways) {
  const segs = [];
  for (const w of ways) {
    const isSowol = (w.name || '') === '소월로';
    const namedLoop = /남산공원길|순환로/.test(w.name || '');
    if (!isSowol && !namedLoop) continue;
    let width = w.w || 7;
    if (isSowol) width = Math.max(width, 14);
    else if (namedLoop) width = Math.max(width, 8.6);
    const pts = w.pts || [];
    for (let i = 1; i < pts.length; i++) {
      segs.push({ a: pts[i - 1], b: pts[i], hw: width * 0.5 });
    }
  }
  return segs;
}

function nearestMajor(x, z, segs) {
  let best = Infinity, hw = 7;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2));
    const d = Math.hypot(s.a[0] + dx * t - x, s.a[1] + dz * t - z);
    if (d < best) { best = d; hw = s.hw; }
  }
  return { d: best, hw };
}

// a is inside the carriageway, b is the first point outside; binary-search the curb.
function roadEdgePoint(a, b, segs, extra) {
  let lo = 0, hi = 1, x = a[0], z = a[1];
  for (let k = 0; k < 20; k++) {
    const t = (lo + hi) * 0.5;
    x = a[0] + (b[0] - a[0]) * t;
    z = a[1] + (b[1] - a[1]) * t;
    const n = nearestMajor(x, z, segs);
    if (n.d > n.hw + extra) hi = t;
    else lo = t;
  }
  return [x, z];
}

// Pull a driveway or footway back so it meets a named carriageway at the
// curb instead of painting a second plate across the lanes.
function trimOffCarriageway(pts, segs, extra = 0.25) {
  if (!pts || pts.length < 2 || !segs.length) return pts;
  const outside = (p) => {
    const n = nearestMajor(p[0], p[1], segs);
    return n.d > n.hw + extra;
  };
  const startOut = outside(pts[0]);
  const endOut = outside(pts[pts.length - 1]);
  if (startOut && endOut) return pts;
  let out = pts.map((p) => [p[0], p[1]]);
  if (!startOut) {
    let i = 1;
    while (i < out.length && !outside(out[i])) i++;
    if (i >= out.length) return null;
    out = [roadEdgePoint(out[i - 1], out[i], segs, extra), ...out.slice(i)];
  }
  if (out.length >= 2 && !endOut) {
    let i = out.length - 2;
    while (i >= 0 && !outside(out[i])) i--;
    if (i < 0) return null;
    out = [...out.slice(0, i + 1), roadEdgePoint(out[i + 1], out[i], segs, extra)];
  }
  return out.length >= 2 ? out : null;
}

function dijkstra(ways, sx, sz, tx, tz) {
  const nodes = [];
  const idx = new Map();
  const key = (x, z) => `${Math.round(x * 2) / 2},${Math.round(z * 2) / 2}`;
  const node = (x, z) => {
    const k = key(x, z);
    let i = idx.get(k);
    if (i == null) { i = nodes.length; idx.set(k, i); nodes.push({ x, z, e: [] }); }
    return i;
  };
  const link = (i, j, w) => { nodes[i].e.push({ t: j, w }); nodes[j].e.push({ t: i, w }); };
  for (const way of ways) {
    const pts = way.pts || [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 0.15) continue;
      link(node(a[0], a[1]), node(b[0], b[1]), d);
    }
  }
  if (nodes.length < 3) return null;
  const ends = [];
  for (const way of ways) {
    const pts = way.pts || [];
    if (pts.length) { ends.push(pts[0], pts[pts.length - 1]); }
  }
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const d = Math.hypot(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1]);
      if (d > 0.4 && d < 5) link(node(ends[i][0], ends[i][1]), node(ends[j][0], ends[j][1]), d);
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d > 0.6 && d < 8) link(i, j, d);
    }
  }
  const snap = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return bd < 48 ? best : -1;
  };
  const a = snap(sx, sz), b = snap(tx, tz);
  if (a < 0 || b < 0) return null;
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const seen = new Uint8Array(nodes.length);
  dist[a] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!seen[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    seen[u] = 1;
    for (const e of nodes[u].e) {
      const nd = dist[u] + e.w;
      if (nd < dist[e.t]) { dist[e.t] = nd; prev[e.t] = u; }
    }
  }
  if (!Number.isFinite(dist[b])) return null;
  const path = [];
  for (let i = b; i >= 0; i = prev[i]) path.push([nodes[i].x, nodes[i].z]);
  path.reverse();
  if (Math.hypot(path[0][0] - sx, path[0][1] - sz) > 0.8) path.unshift([sx, sz]);
  if (Math.hypot(path[path.length - 1][0] - tx, path[path.length - 1][1] - tz) > 0.8) path.push([tx, tz]);
  return path;
}

function chevronGeo() {
  const s = new THREE.Shape();
  // 팁이 -Y 를 향하게 그려, rotation.x = -PI/2 후 +Z(진행 방향)를 가리킨다.
  s.moveTo(0, -1.05);
  s.lineTo(-0.78, 0.88);
  s.lineTo(-0.36, 0.50);
  s.lineTo(0, 0.18);
  s.lineTo(0.36, 0.50);
  s.lineTo(0.78, 0.88);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function signTex(title, sub) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1a2740'; x.fillRect(0, 0, 768, 256);
  x.fillStyle = '#f4f7fb';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 72px sans-serif';
  x.fillText(title, 384, sub ? 100 : 128);
  if (sub) {
    x.font = '600 36px sans-serif';
    x.fillStyle = '#d7c07a';
    x.fillText(sub, 384, 178);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function routeSignTex(route, title) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const x = c.getContext('2d');
  x.fillStyle = '#1c3f78'; x.fillRect(0, 0, 512, 640);
  x.fillStyle = '#f4f7fb';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 210px sans-serif';
  x.fillText(route, 256, 250);
  x.font = '700 48px sans-serif';
  x.fillText(title, 256, 470);
  x.font = '600 36px sans-serif';
  x.fillStyle = '#d7c07a';
  x.fillText('정류장', 256, 540);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

function adPanelTex(route, caption = '남산순환') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, '#15405c');
  g.addColorStop(1, '#0c6a62');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  x.fillStyle = 'rgba(255, 214, 130, 0.18)';
  x.beginPath(); x.arc(70, 210, 100, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f3ecd4';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 92px sans-serif';
  x.fillText(route, 256, 108);
  x.font = '600 34px sans-serif';
  x.fillText(caption, 256, 178);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}



// Closed bed under the asphalt so a downhill camera cannot see the night
// void through the ribbon. Retaining faces go on every side that actually
// drops away (no single-side sign that lags and leaves a hole at a flip).
// A previous 3.8 m sloped apron at road height read as extra tan pavement
// with painted lines; the short grass berm here starts below the asphalt.
function roadSupportGeos(pts, width, heightAt, dy) {
  const hw = width * 0.5;
  const wallT = 0.42;
  const n = pts.length;
  if (n < 2) return null;

  const sampleY = (x, z, hx, hz, sign, dist) => heightAt(x - hz * dist * sign, z + hx * dist * sign);
  const deepY = (x, z, hx, hz, sign, roadY) => {
    let y = Math.min(roadY - 0.62, heightAt(x, z) - 0.18);
    for (const o of [1.6, 3.2, 5.5, 8]) y = Math.min(y, sampleY(x, z, hx, hz, sign, o) - 0.1);
    return y;
  };
  const dropAt = (x, z, hx, hz, sign) => heightAt(x, z) - sampleY(x, z, hx, hz, sign, 12);

  const frames = [];
  const pos = [];
  for (let i = 0; i < n; i++) {
    const { hx, hz } = headingAt(pts, i);
    const x = pts[i][0], z = pts[i][1];
    const y = heightAt(x, z) + dy;
    const lx = x - hz * hw, lz = z + hx * hw;
    const rx = x + hz * hw, rz = z - hx * hw;
    const yL = heightAt(lx, lz) + dy;
    const yR = heightAt(rx, rz) + dy;
    const dropL = dropAt(x, z, hx, hz, 1);
    const dropR = dropAt(x, z, hx, hz, -1);
    const wallL = dropL > 0.2;
    const wallR = dropR > 0.2;
    // Keep the under-road slab thin so a deep cave roof does not photograph
    // as a black triangle from the air. Walls still reach farther downhill.
    const ybL = Math.min(yL - 0.42, heightAt(lx, lz) - 0.14);
    const ybR = Math.min(yR - 0.42, heightAt(rx, rz) - 0.14);
    const lox = x - hz * (hw + wallT), loz = z + hx * (hw + wallT);
    const rox = x + hz * (hw + wallT), roz = z - hx * (hw + wallT);
    const yBotL = deepY(lox, loz, hx, hz, 1, yL);
    const yBotR = deepY(rox, roz, hx, hz, -1, yR);
    frames.push({ hx, hz, x, z, y, yL, yR, wallL, wallR, dropL, dropR, lx, lz, rx, rz });
    // 0 topL, 1 topR, 2 botL, 3 botR,
    // 4 L-outer-top, 5 L-inner-top, 6 L-outer-bot,
    // 7 R-outer-top, 8 R-inner-top, 9 R-outer-bot
    pos.push(
      lx, yL, lz, rx, yR, rz, lx, ybL, lz, rx, ybR, rz,
      lox, yL, loz, lx, yL, lz, lox, yBotL, loz,
      rox, yR, roz, rx, yR, rz, rox, yBotR, roz,
    );
  }

  const idx = [];
  const S = 10;
  const wallRun = (i, topO, topI, botO) => {
    const k = i * S, m = k + S;
    idx.push(k + topI, m + topI, k + topO, k + topO, m + topI, m + topO);
    idx.push(k + topO, m + topO, k + botO, k + botO, m + topO, m + botO);
  };
  const wallCap = (base, topO, topI, botO) => {
    idx.push(base + topI, base + topO, base + botO);
  };
  for (let i = 0; i < n - 1; i++) {
    const k = i * S, m = k + S;
    idx.push(k + 2, m + 2, k + 3, k + 3, m + 2, m + 3);
    idx.push(k + 0, m + 0, k + 2, k + 2, m + 0, m + 2);
    idx.push(k + 1, k + 3, m + 1, k + 3, m + 3, m + 1);
    if (frames[i].wallL && frames[i + 1].wallL) wallRun(i, 4, 5, 6);
    else {
      if (frames[i].wallL) wallCap(k, 4, 5, 6);
      if (frames[i + 1].wallL) wallCap(m, 4, 5, 6);
    }
    if (frames[i].wallR && frames[i + 1].wallR) wallRun(i, 7, 8, 9);
    else {
      if (frames[i].wallR) wallCap(k, 7, 8, 9);
      if (frames[i + 1].wallR) wallCap(m, 7, 8, 9);
    }
  }
  const last = (n - 1) * S;
  idx.push(0, 1, 3, 0, 3, 2);
  idx.push(last + 1, last + 0, last + 2, last + 1, last + 2, last + 3);
  if (frames[0].wallL) wallCap(0, 4, 5, 6);
  if (frames[0].wallR) wallCap(0, 7, 8, 9);
  if (frames[n - 1].wallL) wallCap(last, 4, 5, 6);
  if (frames[n - 1].wallR) wallCap(last, 7, 8, 9);

  const bed = new THREE.BufferGeometry();
  bed.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bed.setIndex(idx);
  bed.computeVertexNormals();

  const FILL = 2.3;
  const fillPos = [];
  const fillIdx = [];
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    for (const sign of [1, -1]) {
      const ix = f.x - f.hz * hw * sign;
      const iz = f.z + f.hx * hw * sign;
      const ox = f.x - f.hz * (hw + FILL) * sign;
      const oz = f.z + f.hx * (hw + FILL) * sign;
      fillPos.push(ix, (sign === 1 ? f.yL : f.yR) - 0.1, iz, ox, heightAt(ox, oz) + 0.03, oz);
    }
  }
  // per frame: 4 verts (L-inner, L-outer, R-inner, R-outer) = 2 pairs
  for (let i = 0; i < n - 1; i++) {
    for (const side of [0, 1]) {
      const drop = side === 0 ? Math.min(frames[i].dropL, frames[i + 1].dropL)
        : Math.min(frames[i].dropR, frames[i + 1].dropR);
      if (drop < 0.28) continue;
      const a = i * 4 + side * 2;
      const b = a + 4;
      fillIdx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  let fill = null;
  if (fillIdx.length) {
    fill = new THREE.BufferGeometry();
    fill.setAttribute('position', new THREE.Float32BufferAttribute(fillPos, 3));
    fill.setIndex(fillIdx);
    fill.computeVertexNormals();
  }
  return { bed, fill };
}

export function createNamsanRoads({ parent, osm, heightAt, overlay = null, city = null } = {}) {
  const group = new THREE.Group();
  group.name = 'namsan-roads';
  parent.add(group);

  let ways = (osm?.ways || []).filter((w) => w.pts?.length >= 2);
  ways = replaceNamedWays(ways, '소월로');
  ways = replaceNamedWays(ways, '남산공원길');
  for (const a of cityJunctionApproaches(osm, city?.roads || [])) {
    ways.push({
      name: '남산접근',
      k: 'secondary',
      w: a.width,
      pts: a.pts,
      _sowolJoin: true,
    });
  }
  const carriageSegs = majorCarSegs(ways);
  const empty = {
    group,
    ways,
    busStops: osm?.busStops || [],
    mini: ways.map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    floorY() { return null; },
    setNight() {},
    update() {},
    doorGuides: 0,
  };
  if (!ways.length) return empty;

  const carGeos = [], pathGeos = [], stepGeos = [], treadGeos = [], bankGeos = [], fillGeos = [];
  const curbGeos = [], sidewalkGeos = [], railGeos = [];
  const yellowGeos = [], whiteGeos = [];
  const walkHits = [];
  const lampPts = [];

  const trailLampPts = [];
  const junctionTip = findSowolParkTip(ways);
  const junctionArms = collectJunctionArms(ways, junctionTip, carriageSegs);
  const filletDesc = describeJunctionFillets(junctionArms, junctionTip);
  const hitsJuncFurniture = (x, z, exceptName) => furnitureHitsJunction(x, z, junctionArms, exceptName, filletDesc);
  const plateLogs = [];
  const noteGeo = (geo, name, color, yOff) => {
    if (!geo) return geo;
    const bb = geoXzBounds(geo);
    if (!bb) return geo;
    // library7 lighter rectangle on 소월로 west of the tip (screen x 70–330).
    const hit = bb.maxX >= -11220 && bb.minX <= -11165 && bb.maxZ >= -20560 && bb.minZ <= -20508;
    if (hit) {
      plateLogs.push({
        name, color, yOff,
        minX: +bb.minX.toFixed(2), maxX: +bb.maxX.toFixed(2),
        minY: +bb.minY.toFixed(2), maxY: +bb.maxY.toFixed(2),
        minZ: +bb.minZ.toFixed(2), maxZ: +bb.maxZ.toFixed(2),
        verts: geo.attributes.position.count,
      });
    }
    return geo;
  };
  const pushClippedRibbon = (dest, linePts, ww, yOff, color, name, exceptName) => {
    if (!linePts || linePts.length < 2) return;
    const pieces = clipPiecesOutside(linePts, (x, z) => hitsJuncFurniture(x, z, exceptName));
    for (const piece of pieces) {
      const g = drapedRibbonGeo(piece, ww, heightAt, yOff);
      if (g) dest.push(noteGeo(paint(g, color), name, color, yOff));
    }
  };

  for (const w of ways) {
    const isCar = CAR.has(w.k);
    const isStep = STEPS.has(w.k);
    const isElev = w.k === 'elevator';
    const namedLoop = /남산공원길|순환로/.test(w.name || '');
    const isSowol = (w.name || '') === '소월로';
    const isPark = (w.name || '') === '남산공원길';
    const isJoin = !!w._sowolJoin;
    const isDrive = !isJoin && (w.service === 'driveway'
      || (isCar && !namedLoop && !isSowol && (w.motor_vehicle === 'private' || !w.name)));
    let width = w.w || (isCar ? 7 : isStep ? 2.6 : 2.3);
    if (isElev) width = 2.5;
    else if (isDrive) width = Math.min(width, w.service === 'driveway' ? 3.2 : 4.4);
    else if (isSowol) width = Math.max(width, 14);
    else if (namedLoop) width = Math.max(width, 8.6);
    else if (!isCar) width = Math.max(width, 2.05);
    const dy = isCar ? 0.10 : isStep ? 0.08 : isElev ? 0.12 : 0.07;
    let srcPts = w.pts;
    let driveOnRoad = false;
    if ((isDrive || (!isCar && !isStep && !isElev)) && carriageSegs.length) {
      const trimmed = trimOffCarriageway(w.pts, carriageSegs, isDrive ? 0.2 : 0.05);
      if (!trimmed) continue;
      if (trimmed !== w.pts) {
        srcPts = trimmed;
        if (isDrive) driveOnRoad = true;
      }
    }
    // Finer sampling on paths and driveways so ribbons hug the hillside
    // instead of spanning as flat chords with dark underside edges.
    let pts = resample(srcPts, isStep || isElev ? 1.4 : (isDrive || !isCar || isSowol || isPark) ? 1.1 : 2.4);
    if (pts.length < 2) continue;

    if (isElev) {
      const a = pts[0], b = pts[pts.length - 1];
      const y0 = heightAt(a[0], a[1]), y1 = heightAt(b[0], b[1]);
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const Lh = Math.hypot(dx, dz) || 1;
      const L = Math.hypot(Lh, y1 - y0) || 1;
      const glass = new THREE.MeshLambertMaterial({
        color: '#9ec4d6', transparent: true, opacity: 0.38, depthWrite: false,
      });
      const frame = new THREE.MeshLambertMaterial({ color: '#5c6670' });
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, L), glass);
      shaft.position.set((a[0] + b[0]) / 2, (y0 + y1) / 2 + 1.35, (a[1] + b[1]) / 2);
      shaft.rotation.order = 'YXZ';
      shaft.rotation.y = Math.atan2(dx, dz);
      shaft.rotation.x = -Math.atan2(y1 - y0, Lh);
      group.add(shaft);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, 0.12, L), frame);
      roof.position.copy(shaft.position);
      roof.position.y += 1.3;
      roof.rotation.copy(shaft.rotation);
      group.add(roof);
      walkHits.push({ segs: segsOf(pts), pad: width * 0.5 + 0.4, dy });
      continue;
    }

    // 소월로 and 남산공원길 are the cycling-course spine: one draped
    // strip each, not per-segment level plates with tan undersides.
    const drape = isDrive || !isCar || isSowol || isPark || isJoin;
    // Ribbons stay continuous through the junction (cycling-course spine).
    // Only the inside-corner fillets are added as a separate mesh below.
    const sowolWs = isSowol ? sowolWidthAt(pts, junctionTip) : null;
    const geo = drape
      ? drapedRibbonGeo(pts, sowolWs || width, heightAt, dy)
      : fixNormalsUp(ribbonGeo(elevated(pts, heightAt, dy), width, 0, false));
    if (!geo) continue;
    if (isCar) {
      // A driveway that meets 소월로 / 공원길 must read as asphalt, not a
      // second brown-gray plate laid across the lanes.
      carGeos.push(noteGeo(paint(geo, isDrive && !driveOnRoad ? '#7a7f86' : '#6e747c'), (w.name || w.k || 'car') + (isDrive ? '/drive' : ''), isDrive && !driveOnRoad ? '#7a7f86' : '#6e747c', dy));
      // No underside ribbon: a 16 cm gap still z-fights at ~23 km (the
      // same class of bug as the aerial DEM panels). Not a cheap fix.
      // Driveways sit on gentle library slopes — a deep skirt read as a
      // cliff edge. 소월로 and 남산공원길 skip the bed and the drop-gated
      // grass apron so a steep aerial cannot read them as extra plates.
      if (!isDrive && !isSowol && !isPark && !isJoin) {
        const support = roadSupportGeos(pts, width, heightAt, dy);
        if (support?.bed) bankGeos.push(paint(support.bed, '#8a8478'));
        if (support?.fill) fillGeos.push(paint(support.fill, '#3f4a38'));
      }
    } else if (isStep) stepGeos.push(paint(geo, '#9a9080'));
    else pathGeos.push(paint(geo, '#7a6b52'));
    walkHits.push({ segs: segsOf(pts), pad: width * 0.5 + 0.35, dy });

    if (isCar) {
      const walkPad = width * 0.5 + (namedLoop ? 2.2 : 0.45);
      walkHits[walkHits.length - 1].pad = walkPad;
      const upSigns = (namedLoop || isJoin) ? smoothSideSigns(pts, heightAt) : null;
      if ((namedLoop || isJoin) && width >= 6) {
        if (isPark || isJoin) {
          const strip = (off, ww, yOff, dest, color) => {
            const g = drapedRibbonGeo(offsetLine(pts, off), ww, heightAt, dy + yOff);
            if (!g) return;
            if (color) dest.push(noteGeo(paint(g, color), (w.name || 'park') + '/shoulder', color, dy + yOff));
            else dest.push(noteGeo(g, (w.name || 'park') + '/paint', color || '#f0d24a', dy + yOff));
          };
          strip(0.14, 0.11, 0.045, yellowGeos);
          strip(-0.14, 0.11, 0.045, yellowGeos);
          strip(width * 0.5 - 0.20, 0.14, 0.04, whiteGeos);
          strip(-(width * 0.5 - 0.20), 0.14, 0.04, whiteGeos);
          strip(width * 0.5 - 0.48, 0.55, 0.012, carGeos, '#7a7f86');
          strip(-(width * 0.5 - 0.48), 0.55, 0.012, carGeos, '#7a7f86');
        } else {
          yellowGeos.push(fixNormalsUp(ribbonGeo(attachToRoad(pts, offsetLine(pts, 0.14), heightAt, dy + 0.045), 0.11, 0, false)));
          yellowGeos.push(fixNormalsUp(ribbonGeo(attachToRoad(pts, offsetLine(pts, -0.14), heightAt, dy + 0.045), 0.11, 0, false)));
          whiteGeos.push(fixNormalsUp(ribbonGeo(attachToRoad(pts, offsetLine(pts, width * 0.5 - 0.20), heightAt, dy + 0.04), 0.14, 0, false)));
          whiteGeos.push(fixNormalsUp(ribbonGeo(attachToRoad(pts, offsetLine(pts, -(width * 0.5 - 0.20)), heightAt, dy + 0.04), 0.14, 0, false)));
          carGeos.push(paint(fixNormalsUp(ribbonGeo(attachToRoad(pts, offsetLine(pts, width * 0.5 - 0.48), heightAt, dy + 0.012), 0.55, 0, false)), '#7a7f86'));
          carGeos.push(paint(fixNormalsUp(ribbonGeo(attachToRoad(pts, offsetLine(pts, -(width * 0.5 - 0.48)), heightAt, dy + 0.012), 0.55, 0, false)), '#7a7f86'));
        }
      }
      // 소월로: OSM lanes=4 on this centerline. White edges + dashed lane
      // dividers (oneway, so no yellow double center). Wide enough for
      // 간선 전기버스 and the double-decker 서울시티투어버스.
      if (isSowol && width >= 10) {
        const wAt = (i) => (sowolWs ? sowolWs[Math.min(i, sowolWs.length - 1)] : width);
        const sowolStrip = (offAt, ww, yOff, color) => {
          const g = drapedRibbonGeo(offsetBySigned(pts, offAt), ww, heightAt, dy + yOff);
          if (!g) return;
          if (color) carGeos.push(paint(g, color));
          else whiteGeos.push(g);
        };
        sowolStrip((i) => wAt(i) * 0.5 - 0.18, 0.15, 0.04);
        sowolStrip((i) => -(wAt(i) * 0.5 - 0.18), 0.15, 0.04);
        sowolStrip((i) => wAt(i) * 0.5 - 0.48, 0.5, 0.012, '#7a7f86');
        sowolStrip((i) => -(wAt(i) * 0.5 - 0.48), 0.5, 0.012, '#7a7f86');
        const laneOff = [-0.25, 0, 0.25];
        for (const offFrac of laneOff) {
          let accD = 0;
          for (let i = 1; i < pts.length; i++) {
            const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
            const L = Math.hypot(bx - ax, bz - az) || 1;
            const hx = (bx - ax) / L, hz = (bz - az) / L;
            let s = 0;
            while (s < L) {
              const period = 6.2;
              const into = accD % period;
              const dashLeft = Math.max(0, 3.1 - into);
              if (dashLeft > 0.25) {
                const take = Math.min(dashLeft, L - s);
                if (take < 1e-4) { s = L; break; }
                const x0 = ax + hx * s, z0 = az + hz * s;
                const x1 = ax + hx * (s + take), z1 = az + hz * (s + take);
                const off = offFrac * 0.5 * (wAt(i - 1) + wAt(i));
                const seg = [[x0 - hz * off, z0 + hx * off], [x1 - hz * off, z1 + hx * off]];
                const dash = drapedRibbonGeo(seg, 0.11, heightAt, dy + 0.045);
                if (dash) whiteGeos.push(dash);
                s += take; accD += take;
              } else {
                let gapLeft = period - into;
                if (!Number.isFinite(gapLeft) || gapLeft < 0.05) gapLeft = 0.05;
                const take = Math.min(gapLeft, L - s);
                if (take < 1e-4) { s = L; break; }
                s += take; accD += take;
              }
            }
          }
        }
        let accL = 0;
        for (let i = 1; i < pts.length; i++) {
          const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          accL += L;
          if (accL < 18) continue;
          accL = 0;
          const hx = (pts[i][0] - pts[i - 1][0]) / (L || 1);
          const hz = (pts[i][1] - pts[i - 1][1]) / (L || 1);
          for (const side of [-1, 1]) {
            const lx = pts[i][0] - hz * (width * 0.5 + 0.5) * side;
            const lz = pts[i][1] + hx * (width * 0.5 + 0.5) * side;
            if (hitsJuncFurniture(lx, lz, w.name)) continue;
            lampPts.push({
              x: lx,
              z: lz,
              y: heightAt(pts[i][0], pts[i][1]) + dy,
              yaw: Math.atan2(-hx, -hz) + (side < 0 ? Math.PI : 0),
            });
          }
        }
      }
      const swPref = w.sidewalk || (namedLoop ? 'uphill' : null);
      if (swPref === 'both' && isSowol) {
        // Stay on the benched carriageway shelf (hw + 1.2). The old 1.55 m
        // walk at +0.90 m hung 1–2 m out over the downhill grade and read as
        // extra floating plates next to the asphalt.
        const wAt = (i) => (sowolWs ? sowolWs[Math.min(i, sowolWs.length - 1)] : width);
        const swW = 1.0;
        const except = w.name || '소월로';
        for (const sgn of [1, -1]) {
          pushClippedRibbon(sidewalkGeos, offsetBySigned(pts, (i) => sgn * (wAt(i) * 0.5 + 0.42)), swW, dy + 0.05, '#b7b4ac', except + '/sidewalk', except);
          pushClippedRibbon(curbGeos, offsetBySigned(pts, (i) => sgn * (wAt(i) * 0.5 + 0.08)), 0.2, dy + 0.11, '#c9c5bb', except + '/curb', except);
        }
      } else if (swPref === 'both') {
        const except = w.name || w.k || 'sw';
        for (const sgn of [1, -1]) {
          pushClippedRibbon(sidewalkGeos, offsetLine(pts, sgn * (width * 0.5 + 0.90)), 1.55, dy + 0.07, '#b7b4ac', except + '/sidewalk', except);
          pushClippedRibbon(curbGeos, offsetLine(pts, sgn * (width * 0.5 + 0.12)), 0.22, dy + 0.13, '#c9c5bb', except + '/curb', except);
        }
      } else if (swPref === 'left' || swPref === 'right') {
        const sgn = swPref === 'left' ? 1 : -1;
        const except = w.name || w.k || 'sw';
        pushClippedRibbon(sidewalkGeos, offsetLine(pts, sgn * (width * 0.5 + 0.90)), 1.55, dy + 0.07, '#b7b4ac', except + '/sidewalk', except);
        pushClippedRibbon(curbGeos, offsetLine(pts, sgn * (width * 0.5 + 0.12)), 0.22, dy + 0.13, '#c9c5bb', except + '/curb', except);
      } else if (upSigns && (isPark || isJoin)) {
        const except = w.name || 'park';
        pushClippedRibbon(sidewalkGeos, offsetBySigned(pts, (i) => upSigns[i] * (width * 0.5 + 0.52)), 1.05, dy + 0.05, '#b7b4ac', except + '/sidewalk', except);
        pushClippedRibbon(curbGeos, offsetBySigned(pts, (i) => upSigns[i] * (width * 0.5 + 0.12)), 0.2, dy + 0.11, '#c9c5bb', except + '/curb', except);
      } else if (upSigns) {
        const except = w.name || w.k || 'sw';
        pushClippedRibbon(sidewalkGeos, offsetBySigned(pts, (i) => upSigns[i] * (width * 0.5 + 0.90)), 1.55, dy + 0.07, '#b7b4ac', except + '/sidewalk', except);
        pushClippedRibbon(curbGeos, offsetBySigned(pts, (i) => upSigns[i] * (width * 0.5 + 0.12)), 0.22, dy + 0.13, '#c9c5bb', except + '/curb', except);
      } else {
        curbGeos.push(paint(fixNormalsUp(ribbonGeo(elevated(pts, heightAt, dy + 0.06), width + 0.5, 0, false)), '#8a8680'));
      }
      if (namedLoop && upSigns) {
        // Valley-side guardrail sitting on the road edge at road height.
        let accR = 0;
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
          const L = Math.hypot(bx - ax, bz - az) || 1;
          const hx = (bx - ax) / L, hz = (bz - az) / L;
          if (upSigns[i] !== upSigns[i - 1]) { accR += L; continue; }
          const ds = -upSigns[i];
          const ox = -hz * (width * 0.5 + 0.14) * ds;
          const oz = hx * (width * 0.5 + 0.14) * ds;
          if (hitsJuncFurniture((ax + bx) / 2 + ox, (az + bz) / 2 + oz, w.name)
            || hitsJuncFurniture(ax + ox, az + oz, w.name)
            || hitsJuncFurniture(bx + ox, bz + oz, w.name)) {
            accR += L;
            continue;
          }
          const y0 = heightAt(ax, az) + dy;
          const y1 = heightAt(bx, bz) + dy;
          for (const hy of [0.52, 0.92]) {
            const rg = new THREE.BoxGeometry(0.05, 0.06, L);
            rg.rotateY(Math.atan2(hx, hz));
            rg.translate((ax + bx) / 2 + ox, (y0 + y1) * 0.5 + hy, (az + bz) / 2 + oz);
            railGeos.push(paint(rg, '#9aa0a6'));
          }
          accR += L;
          if (accR >= 2.1) {
            const pg = new THREE.BoxGeometry(0.06, 1.02, 0.06);
            pg.translate(bx + ox, y1 + 0.52, bz + oz);
            railGeos.push(paint(pg, '#7e848c'));
            accR = 0;
          }
        }
        let accL = 0;
        for (let i = 1; i < pts.length; i++) {
          const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          accL += L;
          if (accL < 16) continue;
          accL = 0;
          const hx = (pts[i][0] - pts[i - 1][0]) / (L || 1);
          const hz = (pts[i][1] - pts[i - 1][1]) / (L || 1);
          const side = upSigns[i];
          const lx = pts[i][0] - hz * (width * 0.5 + 0.42) * side;
          const lz = pts[i][1] + hx * (width * 0.5 + 0.42) * side;
          if (hitsJuncFurniture(lx, lz, w.name)) continue;
          lampPts.push({
            x: lx,
            z: lz,
            y: heightAt(pts[i][0], pts[i][1]) + dy,
            yaw: Math.atan2(-hx, -hz),
          });
        }
      }
    }

    if (isStep) {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const hx = (bx - ax) / L, hz = (bz - az) / L;
        for (let s = 0; s < L; s += 0.34) {
          const t = s / L;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const y = heightAt(x, z) + dy + 0.03;
          const bg = new THREE.BoxGeometry(0.08, 0.07, Math.max(0.6, width - 0.15));
          bg.rotateY(Math.atan2(hx, hz));
          bg.translate(x, y, z);
          treadGeos.push(paint(bg, '#b4aa98'));
        }
        acc += L;
        // railings both sides
        const y0 = heightAt(ax, az), y1 = heightAt(bx, bz);
        const slope = Math.abs(y1 - y0) / L;
        if (slope > 0.08 || true) {
          for (const side of [-1, 1]) {
            const ox = -hz * (width * 0.5 + 0.06) * side, oz = hx * (width * 0.5 + 0.06) * side;
            const mx = (ax + bx) / 2 + ox, mz = (az + bz) / 2 + oz;
            if (hitsJuncFurniture(mx, mz, w.name)) continue;
            const my = (y0 + y1) * 0.5 + 0.55;
            const rg = new THREE.BoxGeometry(0.05, 0.06, L);
            rg.rotateY(Math.atan2(hx, hz));
            rg.translate(mx, my, mz);
            railGeos.push(paint(rg, '#8a9096'));
            if (acc > 1.6) {
              const pg = new THREE.BoxGeometry(0.05, 0.95, 0.05);
              pg.translate(mx, (y0 + y1) * 0.5 + 0.48, mz);
              railGeos.push(paint(pg, '#6a7076'));
            }
          }
        }
      }
    } else if (!isCar) {
      // railings on steep footways
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const y0 = heightAt(ax, az), y1 = heightAt(bx, bz);
        if (Math.abs(y1 - y0) / L < 0.22) continue;
        const hx = (bx - ax) / L, hz = (bz - az) / L;
        const mx = (ax + bx) / 2 - hz * (width * 0.5 + 0.08);
        const mz = (az + bz) / 2 + hx * (width * 0.5 + 0.08);
        if (hitsJuncFurniture(mx, mz, w.name)) continue;
        const my = (y0 + y1) * 0.5 + 0.5;
        const rg = new THREE.BoxGeometry(0.05, 0.05, L);
        rg.rotateY(Math.atan2(hx, hz));
        rg.translate(mx, my, mz);
        railGeos.push(paint(rg, '#7a8070'));
      }
    }

    if (!isCar && /한양도성|955|하늘숲|북측숲/.test(w.name || '')) {
      let accL = 0;
      for (let i = 1; i < pts.length; i++) {
        accL += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (accL < 28) continue;
        accL = 0;
        trailLampPts.push({ x: pts[i][0], z: pts[i][1] });
      }
    }
  }

  {
    if (junctionTip && junctionArms.length) {
      const union = drapedJunctionUnionGeo(junctionArms, junctionTip, heightAt, 0.10, filletDesc);
      if (union) {
        union.name = 'namsan-east-junction';
        carGeos.push(noteGeo(paint(union, '#6e747c'), 'east-junction-fillet', '#6e747c', 0.10));
        walkHits.push({
          segs: [{ a: [junctionTip[0], junctionTip[1]], b: [junctionTip[0], junctionTip[1]], L: 0 }],
          pad: JUNCTION_FILLET + 12,
          dy: 0.10,
        });
      }
      for (const arc of filletCurbArcs(filletDesc)) {
        const g = drapedRibbonGeo(arc, 0.22, heightAt, 0.21);
        if (g) curbGeos.push(noteGeo(paint(g, '#c9c5bb'), 'east-junction-fillet/curb', '#c9c5bb', 0.21));
      }
    }
    console.info('[namsan-junction] ' + JSON.stringify({
      tip: junctionTip,
      fillet: JUNCTION_FILLET,
      arms: junctionArms.map((a) => ({ name: a.name, width: a.width, n: a.pts.length })),
    }));
    if (plateLogs.length) {
      console.info('[namsan-plate] ' + JSON.stringify(plateLogs));
    }
  }

  // OSM crossings: zebra across the nearest carriageway (소월로 + library drive).
  for (const cr of osm?.crossings || []) {
    if (!Number.isFinite(cr.x) || !Number.isFinite(cr.z)) continue;
    let best = Infinity, hx = 1, hz = 0, width = 8, px = cr.x, pz = cr.z;
    for (const w of ways) {
      if (!CAR.has(w.k)) continue;
      const wpts = w.pts || [];
      let ww = w.w || 7;
      if ((w.name || '') === '소월로') ww = Math.max(ww, 14);
      for (let i = 1; i < wpts.length; i++) {
        const ax = wpts[i - 1][0], az = wpts[i - 1][1], bx = wpts[i][0], bz = wpts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const tt = Math.max(0, Math.min(1, ((cr.x - ax) * (bx - ax) + (cr.z - az) * (bz - az)) / (L * L)));
        const qx = ax + (bx - ax) * tt, qz = az + (bz - az) * tt;
        const d = Math.hypot(cr.x - qx, cr.z - qz);
        if (d < best) {
          best = d;
          hx = (bx - ax) / L; hz = (bz - az) / L;
          px = qx; pz = qz; width = ww;
        }
      }
    }
    if (best > 16) continue;
    const nrmx = -hz, nrmz = hx;
    // Stay inside the painted asphalt so stripe ends don't saw-tooth past the rim.
    const half = width * 0.42;
    const stripes = width >= 12 ? 8 : 5;
    for (let i = -stripes; i <= stripes; i++) {
      const ox = hx * i * 0.52, oz = hz * i * 0.52;
      const a = [px + ox - nrmx * half, pz + oz - nrmz * half];
      const b = [px + ox + nrmx * half, pz + oz + nrmz * half];
      const zg = drapedRibbonGeo([a, b], 0.34, heightAt, 0.12);
      if (zg) whiteGeos.push(zg);
    }
  }

  const addMerged = (geos, name, extra = {}) => {
    if (!geos.length) return;
    const g = mergeGeometries(geos, true);
    if (!g) return;
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }));
    m.receiveShadow = true;
    m.name = name;
    group.add(m);
  };
  addMerged(sidewalkGeos, 'namsan-sidewalks');
  addMerged(curbGeos, 'namsan-curbs');
  addMerged(carGeos, 'namsan-car-roads', {
    side: THREE.DoubleSide,
  });
  addMerged(bankGeos, 'namsan-road-banks', { side: THREE.DoubleSide });
  addMerged(fillGeos, 'namsan-road-fills', { side: THREE.DoubleSide });
  addMerged(pathGeos, 'namsan-paths', { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  addMerged(stepGeos, 'namsan-steps', { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  addMerged(treadGeos, 'namsan-treads');
  addMerged(railGeos, 'namsan-rails');
  const yellowMat = new THREE.MeshLambertMaterial({
    color: '#f0d24a', emissive: new THREE.Color('#f0d24a'), emissiveIntensity: 0,
  });
  const whiteMat = new THREE.MeshLambertMaterial({
    color: '#eceff4', emissive: new THREE.Color('#dfe4ec'), emissiveIntensity: 0.14,
  });
  const yellowKept = yellowGeos;
  const whiteKept = whiteGeos;
  if (yellowKept.length) {
    const yg = mergeGeometries(yellowKept, true);
    if (yg) { const m = new THREE.Mesh(yg, yellowMat); m.name = 'namsan-yellow-lines'; group.add(m); }
  }
  if (whiteKept.length) {
    const wg = mergeGeometries(whiteKept, true);
    if (wg) { const m = new THREE.Mesh(wg, whiteMat); m.name = 'namsan-white-lines'; group.add(m); }
  }

  let lampLensMat = null, lampPoolMat = null;
  if (lampPts.length) {
    const geo = buildStreetlightGeometries();
    const kind = 1;
    const sc = SCALE[kind] ?? 0.72;
    const ps = POOL_SCALE[kind] ?? 0.8;
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    lampLensMat = new THREE.MeshBasicMaterial({ color: LENS_DAY.clone() });
    lampPoolMat = lightPoolMaterial({ color: '#ffd59a', intensity: POOL_GAIN, radius: POOL_R, radiusZ: POOL_RZ, focusX: ARM });
    const n = lampPts.length;
    const bodyIM = new THREE.InstancedMesh(geo.body, bodyMat, n);
    const lensIM = new THREE.InstancedMesh(geo.lens, lampLensMat, n);
    const poolIM = new THREE.InstancedMesh(geo.pool, lampPoolMat, n);
    bodyIM.name = 'namsan-streetlight-body';
    lensIM.name = 'namsan-streetlight-lens';
    poolIM.name = 'namsan-streetlight-pool';
    poolIM.renderOrder = 2;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = lampPts[i];
      const y = Number.isFinite(p.y) ? p.y : heightAt(p.x, p.z);
      const yaw = p.yaw || 0;
      q.setFromAxisAngle(up, yaw);
      m4.compose(pos.set(p.x, y, p.z), q, scl.set(sc, sc, sc));
      bodyIM.setMatrixAt(i, m4);
      lensIM.setMatrixAt(i, m4);
      const ux = Math.cos(yaw), uz = -Math.sin(yaw), vx = -uz, vz = ux;
      const d = (ARM + POOL_R) * 0.5 * ps;
      const hx = (heightAt(p.x + ux * d, p.z + uz * d) - heightAt(p.x - ux * d, p.z - uz * d)) / (2 * d || 1);
      const hz = (heightAt(p.x + vx * d, p.z + vz * d) - heightAt(p.x - vx * d, p.z - vz * d)) / (2 * d || 1);
      ax.set(ux, hx, uz).normalize(); az.set(vx, hz, vz).normalize(); ay.crossVectors(az, ax).normalize();
      m4.makeBasis(ax.multiplyScalar(ps), ay.multiplyScalar(ps), az.multiplyScalar(ps)).setPosition(p.x, y + 0.14, p.z);
      poolIM.setMatrixAt(i, m4);
    }
    bodyIM.instanceMatrix.needsUpdate = true;
    lensIM.instanceMatrix.needsUpdate = true;
    poolIM.instanceMatrix.needsUpdate = true;
    bodyIM.count = lensIM.count = poolIM.count = n;
    poolIM.visible = false;
    group.add(bodyIM, lensIM, poolIM);
  }

  const pathBulb = new THREE.MeshBasicMaterial({ color: '#ffd089', transparent: true, opacity: 0, fog: false, toneMapped: false });
  if (trailLampPts.length) {
    const poleMat = new THREE.MeshLambertMaterial({ color: '#2c3036' });
    // [myeongdong] 산책로 가로등 기둥·전구를 낱개 메시(가로등 수×2 드로우)에서 각각 한 덩어리로 합친다 — 명동·회현에서 남산을 볼 때 약 250 드로우 절약
    const poleBase = new THREE.CylinderGeometry(0.045, 0.06, 2.7, 6), bulbBase = new THREE.SphereGeometry(0.13, 8, 6);
    const poles = [], bulbs = [];
    for (const p of trailLampPts) {
      const y = heightAt(p.x, p.z);
      poles.push(poleBase.clone().translate(p.x, y + 1.35, p.z));
      bulbs.push(bulbBase.clone().translate(p.x, y + 2.78, p.z));
    }
    const pm = new THREE.Mesh(mergeGeometries(poles, false), poleMat); pm.name = 'namsan-trail-lamp-poles';
    const bm = new THREE.Mesh(mergeGeometries(bulbs, false), pathBulb); bm.name = 'namsan-trail-lamp-bulbs';
    group.add(pm, bm);
    for (const g of poles) g.dispose(); for (const g of bulbs) g.dispose();
    poleBase.dispose(); bulbBase.dispose();
  }

  // bus stop shelters at OSM 남산서울타워 platforms
  const busStops = osm?.busStops || [];
  const roofLit = new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0, fog: false, toneMapped: false });
  const tubeMat = new THREE.MeshBasicMaterial({ color: '#fff4d2', transparent: true, opacity: 0, fog: false, toneMapped: false });
  const glassBack = new THREE.MeshStandardMaterial({
    color: '#b7d4e4', transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0.15,
    emissive: new THREE.Color('#d7eef8'), emissiveIntensity: 0.22, depthWrite: false,
  });
  const steel = new THREE.MeshLambertMaterial({ color: '#5c6772' });
  const wood = new THREE.MeshLambertMaterial({ color: '#8a6a4e' });
  const placedStops = [];
  busStops.forEach((s, si) => {
    let hx = 0, hz = 1, nearest = Infinity, nrmx = 0, nrmz = 1, px = s.x, pz = s.z, roadW = 7.8;
    for (const w of ways) {
      if (!CAR.has(w.k)) continue;
      const pts = w.pts;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const t = Math.max(0, Math.min(1, ((s.x - ax) * (bx - ax) + (s.z - az) * (bz - az)) / (L * L)));
        const qx = ax + (bx - ax) * t, qz = az + (bz - az) * t;
        const d = Math.hypot(qx - s.x, qz - s.z);
        if (d < nearest) {
          nearest = d;
          hx = (bx - ax) / L; hz = (bz - az) / L;
          nrmx = -hz; nrmz = hx;
          if ((s.x - qx) * nrmx + (s.z - qz) * nrmz < 0) { nrmx = -nrmx; nrmz = -nrmz; }
          px = qx; pz = qz;
          roadW = w.w || 7.8;
        }
      }
    }
    const sx = px + nrmx * (roadW * 0.5 + 1.05);
    const sz = pz + nrmz * (roadW * 0.5 + 1.05);
    const y = heightAt(sx, sz);
    const ang = Math.atan2(hx, hz);
    const isLibStop = (s.name || '').includes('남산도서관');
    const libRoute = s.ref === '03168' ? '402' : s.ref === '03167' ? '405' : '01A';
    const route = isLibStop ? libRoute : (si === 0 ? '01A' : '01B');
    const stopTitle = isLibStop ? '남산도서관' : '남산서울타워';
    const stopSub = isLibStop ? '01A · 01B · 402 · 405' : route;
    const adCaption = isLibStop ? '간선·순환' : '남산순환';
    placedStops.push({ ...s, x: sx, z: sz, y, hx, hz, nrmx, nrmz, route, stopTitle });

    const pad = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 2.3), new THREE.MeshLambertMaterial({ color: '#b7b4ac' }));
    pad.position.set(sx, y + 0.05, sz); pad.rotation.y = ang; group.add(pad);
    if (sx <= -11165 && sx >= -11220 && sz <= -20508 && sz >= -20560) {
      plateLogs.push({
        name: `bus-pad:${s.name || s.ref || si}`,
        color: '#b7b4ac', yOff: 0.05,
        minX: +(sx - 3).toFixed(2), maxX: +(sx + 3).toFixed(2),
        minY: +(y + 0.01).toFixed(2), maxY: +(y + 0.09).toFixed(2),
        minZ: +(sz - 2).toFixed(2), maxZ: +(sz + 2).toFixed(2),
        verts: 8,
      });
    }
    for (const u of [-2.05, 0, 2.05]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.55, 0.1), steel);
      post.position.set(sx + hx * u + nrmx * 0.78, y + 1.28, sz + hz * u + nrmz * 0.78);
      group.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 1.95), new THREE.MeshLambertMaterial({ color: '#4a5562' }));
    roof.position.set(sx + nrmx * 0.08, y + 2.62, sz + nrmz * 0.08); roof.rotation.y = ang; group.add(roof);
    const lit = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.05, 1.65), roofLit);
    lit.position.set(sx + nrmx * 0.08, y + 2.54, sz + nrmz * 0.08); lit.rotation.y = ang; group.add(lit);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.07, 0.07), tubeMat);
    tube.position.set(sx + nrmx * 0.08, y + 2.48, sz + nrmz * 0.08); tube.rotation.y = ang; group.add(tube);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.95, 4.7), glassBack);
    back.position.set(sx + nrmx * 0.82, y + 1.28, sz + nrmz * 0.82); back.rotation.y = ang; group.add(back);
    const backFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.05, 4.85), steel);
    backFrame.position.set(sx + nrmx * 0.86, y + 1.28, sz + nrmz * 0.86); backFrame.rotation.y = ang; group.add(backFrame);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.55), new THREE.MeshBasicMaterial({
      map: adPanelTex(route, adCaption), toneMapped: false, fog: false, side: THREE.DoubleSide,
    }));
    ad.position.set(sx + nrmx * 0.79, y + 1.38, sz + nrmz * 0.79);
    ad.rotation.y = Math.atan2(-nrmx, -nrmz);
    group.add(ad);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 0.5), wood);
    seat.position.set(sx + nrmx * 0.32, y + 0.50, sz + nrmz * 0.32); seat.rotation.y = ang; group.add(seat);
    const rest = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.42, 0.07), wood);
    rest.position.set(sx + nrmx * 0.52, y + 0.80, sz + nrmz * 0.52); rest.rotation.y = ang; group.add(rest);
    for (const u of [-1.2, 0, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), steel);
      leg.position.set(sx + hx * u + nrmx * 0.32, y + 0.24, sz + hz * u + nrmz * 0.32);
      group.add(leg);
    }
    const routeMap = routeSignTex(route, stopTitle);
    const routeFace = Math.atan2(-nrmx, -nrmz);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.68, 0.06), new THREE.MeshBasicMaterial({ color: '#f0d070', toneMapped: false, fog: false }));
    rim.position.set(sx + hx * 2.15 - nrmx * 0.02, y + 1.78, sz + hz * 2.15 - nrmz * 0.02);
    rim.rotation.y = routeFace; group.add(rim);
    const routePlate = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 1.56), new THREE.MeshBasicMaterial({ map: routeMap, toneMapped: false, fog: false }));
    routePlate.position.set(sx + hx * 2.15 - nrmx * 0.06, y + 1.78, sz + hz * 2.15 - nrmz * 0.06);
    routePlate.rotation.y = routeFace;
    group.add(routePlate);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 3.45, 8), steel);
    pole.position.set(sx + hx * 3.15 + nrmx * 0.15, y + 1.73, sz + hz * 3.15 + nrmz * 0.15);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.88), new THREE.MeshBasicMaterial({
      map: signTex(stopTitle, stopSub), toneMapped: false, side: THREE.DoubleSide, fog: false,
    }));
    flag.position.set(sx + hx * 3.15 + nrmx * 0.15, y + 3.22, sz + hz * 3.15 + nrmz * 0.15);
    flag.rotation.y = routeFace;
    group.add(flag);
  });
  if (overlay) {
    const s = busStops.find((b) => (b.name || '').includes('남산서울타워')) || null;
    if (s) {
      overlay.add({
        cls: 'label',
        text: '🚌 남산서울타워 정류장',
        getPos: () => new THREE.Vector3(s.x, heightAt(s.x, s.z) + 6.5, s.z),
        maxDist: 280,
        minDist: 16,
      });
    }
  }

  // optional shuttle on the stitched 순환로 / 공원길
  let shuttle = null, shuttlePath = null, shuttleDist = 0, shuttleLen = 0;
  try {
    const raw = stitchNamed(ways, /남산공원길|남산남측순환로|남산북측순환로/, 50);
    if (raw && pathLen(raw) > 180) {
      shuttlePath = resample(raw, 3.2);
      shuttleLen = pathLen(shuttlePath);
      shuttle = createBus('01', 'city', '순환');
      shuttle.name = 'namsan-shuttle';
      group.add(shuttle);
    }
  } catch { /* node tests / missing canvas — skip the bus */ }

  // 소월로 bus serving 남산도서관 (official 오시는길: 01A·01B·402·405).
  // Uses the same createBus + OSM-centerline follower as the loop shuttle.
  // No double-decker or electric mesh exists in createBus, so this is a
  // regular city bus numbered 402 (the route painted on stop 03168).
  let sowolBus = null, sowolPath = null, sowolDist = 0, sowolLen = 0, sowolStopAt = 0;
  try {
    const rawS = stitchNamed(ways, /^소월로$/, 20);
    if (rawS && pathLen(rawS) > 80) {
      sowolPath = resample(rawS, 2.8);
      sowolLen = pathLen(sowolPath);
      const libStop = busStops.find((b) => b.ref === '03168') || busStops.find((b) => (b.name || '').includes('남산도서관'));
      if (libStop) {
        let acc = 0, bestD = 0, best = Infinity;
        for (let i = 1; i < sowolPath.length; i++) {
          acc += Math.hypot(sowolPath[i][0] - sowolPath[i - 1][0], sowolPath[i][1] - sowolPath[i - 1][1]);
          const d = Math.hypot(sowolPath[i][0] - libStop.x, sowolPath[i][1] - libStop.z);
          if (d < best) { best = d; bestD = acc; }
        }
        sowolStopAt = bestD;
        sowolDist = bestD;
      }
      sowolBus = createBus('402', 'city', '402');
      sowolBus.name = 'namsan-sowol-bus';
      group.add(sowolBus);
      const p0 = pointAt(sowolPath, sowolDist);
      sowolBus.position.set(p0.x, heightAt(p0.x, p0.z) + 0.03, p0.z);
      sowolBus.rotation.y = Math.atan2(p0.hx, p0.hz);
    }
  } catch { /* node tests / missing canvas — skip the bus */ }

  // guide arrows to a door (filled later via api.setDoor)
  const arrowGeo = chevronGeo();
  const arrowMat = new THREE.MeshBasicMaterial({
    color: '#e4b43a', transparent: true, opacity: 0.92, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const guideGroup = new THREE.Group();
  guideGroup.name = 'namsan-guides';
  group.add(guideGroup);

  function addGuide(pts, opts = {}) {
    if (!pts || pts.length < 2) return 0;
    const skipPlaza = !!opts.skipPlaza;
    const rs = resample(pts, 4.4);
    let n = 0;
    for (let i = 0; i < rs.length - 1; i++) {
      const a = rs[i], b = rs[i + 1];
      const hx = b[0] - a[0], hz = b[1] - a[1];
      const L = Math.hypot(hx, hz) || 1;
      const x = a[0], z = a[1];
      if (skipPlaza && Math.hypot(x - NT.tx, z - NT.tz) < 82) continue;
      const y = guideY(x, z, heightAt);
      const m = new THREE.Mesh(arrowGeo, arrowMat);
      m.rotation.order = 'XYZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(hx / L, hz / L), 0);
      m.position.set(x, y, z);
      guideGroup.add(m);
      n++;
    }
    return n;
  }

  let doorGuides = 0;
  function setDoor(door) {
    if (!door) return;
    const dest = [door.x, door.z];
    // spawn (east plaza) — evenly spaced floor chevrons pointing at the door
    const spawn = [door.spawnX ?? NT.tx + 44, door.spawnZ ?? NT.tz + 6];
    doorGuides += addGuide([spawn, dest]);
    // cable upper station
    const ux = -10705.06, uz = -20554.09;
    const viaCable = dijkstra(ways, ux, uz, dest[0], dest[1])
      || [[ux, uz], [-10640, -20510], [-10580, -20470], [NT.tx + 44, NT.tz + 6], dest];
    doorGuides += addGuide(viaCable, { skipPlaza: true });
    // bus stop (first OSM platform)
    if (busStops[0]) {
      const bx = placedStops[0]?.x ?? busStops[0].x;
      const bz = placedStops[0]?.z ?? busStops[0].z;
      let viaBus = dijkstra(ways, bx, bz, dest[0], dest[1]);
      if (!viaBus) {
        const raw = stitchNamed(ways, /남산공원길|남산남측순환로|남산북측순환로/, 50);
        if (raw && raw.length >= 2) {
          let i0 = 0, i1 = 0, d0 = Infinity, d1 = Infinity;
          for (let i = 0; i < raw.length; i++) {
            const a = Math.hypot(raw[i][0] - bx, raw[i][1] - bz);
            const b = Math.hypot(raw[i][0] - dest[0], raw[i][1] - dest[1]);
            if (a < d0) { d0 = a; i0 = i; }
            if (b < d1) { d1 = b; i1 = i; }
          }
          const slice = i0 <= i1 ? raw.slice(i0, i1 + 1) : raw.slice(i1, i0 + 1).reverse();
          viaBus = [[bx, bz], ...slice, dest];
        } else {
          viaBus = [[bx, bz], dest];
        }
      }
      doorGuides += addGuide(viaBus, { skipPlaza: true });
    }
  }

  {
    const hits = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      const bb = o.geometry?.attributes?.position ? geoXzBounds(o.geometry) : null;
      // world-space: most road meshes sit at origin with baked verts
      const minX = bb ? bb.minX + o.position.x : o.position.x - 4;
      const maxX = bb ? bb.maxX + o.position.x : o.position.x + 4;
      const minZ = bb ? bb.minZ + o.position.z : o.position.z - 4;
      const maxZ = bb ? bb.maxZ + o.position.z : o.position.z + 4;
      const minY = bb ? bb.minY + o.position.y : o.position.y;
      const maxY = bb ? bb.maxY + o.position.y : o.position.y;
      if (maxX < -11220 || minX > -11165 || maxZ < -20560 || minZ > -20508) return;
      const mat = o.material;
      const color = mat?.color ? `#${mat.color.getHexString()}` : (mat?.vertexColors ? 'vertexColors' : '?');
      hits.push({
        name: o.name || o.parent?.name || '(unnamed)',
        color,
        vertexColors: !!mat?.vertexColors,
        yOff: +o.position.y.toFixed(3),
        minX: +minX.toFixed(2), maxX: +maxX.toFixed(2),
        minY: +minY.toFixed(2), maxY: +maxY.toFixed(2),
        minZ: +minZ.toFixed(2), maxZ: +maxZ.toFixed(2),
      });
    });
    console.info('[namsan-plate-live] ' + JSON.stringify(hits));
  }

  function floorY(x, z, refY) {
    for (const h of walkHits) {
      if (nearSeg(x, z, h.segs, h.pad) <= h.pad) {
        const y = heightAt(x, z) + h.dy;
        if (Number.isFinite(refY) && y > refY + 0.55) return null;
        return y;
      }
    }
    return null;
  }

  return {
    group,
    ways,
    busStops,
    placedStops,
    mini: ways.map((w) => ({ k: w.k, p: w.pts, w: w.w })),
    floorY,
    setDoor,
    get doorGuides() { return doorGuides; },
    setNight(v = 0) {
      const k = Math.max(0, Math.min(1, v));
      if (lampLensMat) lampLensMat.color.copy(LENS_DAY).lerp(LENS_NIGHT, k);
      if (lampPoolMat) lampPoolMat.uniforms.uNight.value = k;
      const pool = group.getObjectByName('namsan-streetlight-pool');
      if (pool) pool.visible = k > 0.01;
      yellowMat.emissiveIntensity = k * 0.48;
      whiteMat.emissiveIntensity = k * 0.32;
      const banks = group.getObjectByName('namsan-road-banks');
      if (banks?.material) {
        // Slight night lift so downhill facets read as earth, not a void.
        banks.material.emissive = new THREE.Color('#5a564c');
        banks.material.emissiveIntensity = k * 0.7;
      }
      const fills = group.getObjectByName('namsan-road-fills');
      if (fills?.material) {
        fills.material.emissive = new THREE.Color('#2a3320');
        fills.material.emissiveIntensity = k * 0.5;
      }
      const paths = group.getObjectByName('namsan-paths');
      if (paths?.material) {
        paths.material.emissive = new THREE.Color('#4a4034');
        paths.material.emissiveIntensity = k * 0.28;
      }
      const steps = group.getObjectByName('namsan-steps');
      if (steps?.material) {
        steps.material.emissive = new THREE.Color('#5a5448');
        steps.material.emissiveIntensity = k * 0.22;
      }
      roofLit.opacity = k * 0.92;
      roofLit.visible = k > 0.05;
      tubeMat.opacity = k * 0.95;
      tubeMat.visible = k > 0.05;
      pathBulb.opacity = k * 0.9;
      pathBulb.visible = k > 0.05;
    },
    update(dt) {
      const follow = (mesh, path, dist, len, loopClose) => {
        if (!mesh || !path || len < 10) return dist;
        let next = dist + dt * 6.5;
        const loop = loopClose && Math.hypot(path[0][0] - path[path.length - 1][0], path[0][1] - path[path.length - 1][1]) < 28;
        let d, rev = false;
        if (loop) d = next % len;
        else {
          const span = len * 2;
          let u = next % span;
          if (u < 0) u += span;
          if (u > len) { u = span - u; rev = true; }
          d = u;
        }
        const p = pointAt(path, d);
        mesh.position.set(p.x, heightAt(p.x, p.z) + 0.03, p.z);
        mesh.rotation.y = Math.atan2(p.hx, p.hz) + (rev ? Math.PI : 0);
        return next;
      };
      shuttleDist = follow(shuttle, shuttlePath, shuttleDist, shuttleLen, true);
      sowolDist = follow(sowolBus, sowolPath, sowolDist, sowolLen, false);
    },
  };
}
