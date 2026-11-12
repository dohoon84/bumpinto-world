// [namsan] 타워 주변 서울 도심. OSM 건물 외곽선(약 2.8 km)을 압출하고,
//   밤에는 기존 코리더 창 불빛 셰이더(warm/cool 혼합)를 그대로 쓴다.
//   간선도로는 노면 + 가로등 글로우 + 차량 궤적, 그 밖은 지평선 스카이라인 링.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingMeshes, buildingMeshesAsync, roadGeometries, paint } from '../tileMesh.js';
import { ribbonGeo, fixNormalsUp } from '../../world.js';
import { NT, namsanBasinY, inNamsanPark } from './namsanCoords.js';
import { namsanRenderedWay } from './namsanTerrain.js';

function groundY(x, z, heightAt) {
  if (heightAt) {
    const y = heightAt(x, z);
    if (Number.isFinite(y)) return y;
  }
  return namsanBasinY(Math.hypot(x - NT.tx, z - NT.tz));
}

function footprintRange(o, heightAt) {
  let mn = Infinity, mx = -Infinity;
  const add = (x, z) => {
    const y = groundY(x, z, heightAt);
    if (y < mn) mn = y;
    if (y > mx) mx = y;
  };
  for (const p of o) add(p[0], p[1]);
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    add((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5);
  }
  const c = centroid(o);
  add(c.x, c.z);
  return { mn, mx };
}

function centroid(pts) {
  let x = 0, z = 0, n = 0;
  for (const p of pts) { x += p[0]; z += p[1]; n++; }
  return n ? { x: x / n, z: z / n } : { x: NT.tx, z: NT.tz };
}

function skylineTex() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const d = c.getContext('2d');
  const g = d.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1020'); g.addColorStop(0.45, '#141a28'); g.addColorStop(1, '#1a1e26');
  d.fillStyle = g; d.fillRect(0, 0, W, H);
  let s = 7919;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W;
    const w = 6 + rnd() * 28;
    const h = 40 + rnd() * (80 + (i % 11 === 0 ? 90 : 0));
    d.fillStyle = `rgb(${18 + rnd() * 16},${20 + rnd() * 14},${26 + rnd() * 18})`;
    d.fillRect(x, H - h, w, h);
    const cols = Math.max(1, Math.floor(w / 5)), rows = Math.max(2, Math.floor(h / 7));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      if (rnd() > 0.38) continue;
      const warm = rnd() > 0.28;
      d.fillStyle = warm
        ? `rgba(255,${190 + rnd() * 40},${120 + rnd() * 40},${0.45 + rnd() * 0.45})`
        : `rgba(${160 + rnd() * 40},${190 + rnd() * 40},255,${0.35 + rnd() * 0.4})`;
      d.fillRect(x + 1 + k * 5, H - h + 4 + r * 7, 2.4, 3.4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function streakTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 16);
  for (let i = 0; i < 10; i++) {
    const px = (i * 27 + 4) % 256;
    x.fillStyle = i % 3 === 0 ? 'rgba(255,70,50,0.95)' : 'rgba(255,236,190,0.95)';
    x.fillRect(px, 4, 18 + (i % 4) * 6, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


function distToSeg2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  if (L2 < 1e-12) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Centerline keepouts matching the asphalt namsanRoads actually draws. */
function namsanRoadKeepouts(osm) {
  const out = [];
  for (const w of osm?.ways || []) {
    if (!w.pts || w.pts.length < 2) continue;
    if (w.k === 'elevator') continue;
    const info = namsanRenderedWay(w);
    if (!info.isCar && !info.namedLoop) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const hw = info.width * 0.5 + 1.15;
    for (const pt of w.pts) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minZ) minZ = pt[1];
      if (pt[1] > maxZ) maxZ = pt[1];
    }
    out.push({
      pts: w.pts, hw,
      minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw,
    });
  }
  return out;
}

function coveredByNamsanRoad(x, z, keepouts) {
  for (const k of keepouts) {
    if (x < k.minX || x > k.maxX || z < k.minZ || z > k.maxZ) continue;
    for (let i = 1; i < k.pts.length; i++) {
      if (distToSeg2(x, z, k.pts[i - 1][0], k.pts[i - 1][1], k.pts[i][0], k.pts[i][1]) <= k.hw) {
        return true;
      }
    }
  }
  return false;
}

function clipCityRoadOutsideNamsan(pts, keepouts) {
  if (!keepouts.length || !pts || pts.length < 2) return pts ? [pts] : [];
  const cov = (p) => coveredByNamsanRoad(p[0], p[1], keepouts);
  const crossing = (uncovered, covered) => {
    let a = uncovered, b = covered;
    for (let i = 0; i < 14; i++) {
      const m = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
      if (cov(m)) b = m;
      else a = m;
    }
    return a;
  };
  const pieces = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const inside = cov(pt);
    if (i === 0) {
      if (!inside) cur.push(pt);
      continue;
    }
    const prev = pts[i - 1];
    const prevIn = cov(prev);
    if (!prevIn && !inside) {
      cur.push(pt);
    } else if (!prevIn && inside) {
      const x = crossing(prev, pt);
      if (Math.hypot(x[0] - prev[0], x[1] - prev[1]) > 0.15) cur.push(x);
      if (cur.length >= 2) pieces.push(cur);
      cur = [];
    } else if (prevIn && !inside) {
      const x = crossing(pt, prev);
      cur = Math.hypot(x[0] - pt[0], x[1] - pt[1]) > 0.15 ? [x, pt] : [pt];
    }
  }
  if (cur.length >= 2) pieces.push(cur);
  return pieces.filter((pp) => {
    let L = 0;
    for (let i = 1; i < pp.length; i++) L += Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]);
    return L >= 3;
  });
}


function findJunctionTip(ways) {
  const sowols = (ways || []).filter((w) => (w.name || '') === '소월로' && w.pts?.length >= 2);
  const parks = (ways || []).filter((w) => (w.name || '') === '남산공원길' && w.pts?.length >= 2);
  let best = Infinity, tip = null;
  for (const sw of sowols) {
    for (const pk of parks) {
      for (const a of [sw.pts[0], sw.pts[sw.pts.length - 1]]) {
        for (const b of [pk.pts[0], pk.pts[pk.pts.length - 1]]) {
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

/**
 * City secondaries that meet the 소월로 / 공원길 tip but are not already
 * drawn by namsanRoads (the OSM extract misses this SE approach). Claim
 * the first ~140 m so namsanRoads can pave them and the city mesh can
 * drop its lighter leftover stub.
 */
export function cityJunctionApproaches(osm, cityRoads) {
  const tip = findJunctionTip(osm?.ways || []);
  if (!tip || !cityRoads?.length) return [];
  const namPts = [];
  for (const w of osm?.ways || []) {
    if (!w.pts || w.pts.length < 2) continue;
    const info = namsanRenderedWay(w);
    if (!info.isCar && !info.namedLoop) continue;
    namPts.push(w.pts);
  }
  const distToNam = (x, z) => {
    let best = Infinity;
    for (const pts of namPts) {
      for (let i = 1; i < pts.length; i++) {
        const d = distToSeg2(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        if (d < best) best = d;
      }
    }
    return best;
  };

  const approaches = [];
  for (const r of cityRoads) {
    const raw = r.p || r.pts;
    if (!raw || raw.length < 2) continue;
    const d0 = Math.hypot(raw[0][0] - tip[0], raw[0][1] - tip[1]);
    const d1 = Math.hypot(raw[raw.length - 1][0] - tip[0], raw[raw.length - 1][1] - tip[1]);
    if (Math.min(d0, d1) > 2.5) continue;
    let seq = raw.map((pt) => [pt[0], pt[1]]);
    if (d1 < d0) seq.reverse();
    let acc = 0;
    let probe = seq[seq.length - 1];
    for (let i = 1; i < seq.length; i++) {
      acc += Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]);
      if (acc >= 40) { probe = seq[i]; break; }
    }
    // 소월로 west and 공원길 east already sit on namsan centerlines.
    if (distToNam(probe[0], probe[1]) < 18) continue;
    const out = [[tip[0], tip[1]]];
    acc = 0;
    for (let i = 1; i < seq.length; i++) {
      const lx = seq[i][0] - seq[i - 1][0], lz = seq[i][1] - seq[i - 1][1];
      const L = Math.hypot(lx, lz) || 1;
      if (acc + L >= 140) {
        const t = (140 - acc) / L;
        out.push([seq[i - 1][0] + lx * t, seq[i - 1][1] + lz * t]);
        break;
      }
      acc += L;
      out.push(seq[i]);
    }
    if (out.length < 2) continue;
    approaches.push({ pts: out, width: Math.max(8.6, r.w || 10) });
  }
  const kept = [];
  for (const a of approaches) {
    const hx = a.pts[1][0] - a.pts[0][0], hz = a.pts[1][1] - a.pts[0][1];
    const L = Math.hypot(hx, hz) || 1;
    const ux = hx / L, uz = hz / L;
    if (kept.some((b) => {
      const bx = b.pts[1][0] - b.pts[0][0], bz = b.pts[1][1] - b.pts[0][1];
      const bL = Math.hypot(bx, bz) || 1;
      return ux * (bx / bL) + uz * (bz / bL) > 0.92;
    })) continue;
    kept.push(a);
  }
  return kept;
}

function beginNamsanCity({ parent, data, heightAt, parks = [], osm = null } = {}) {
  const g = new THREE.Group();
  g.name = 'namsan-city';
  parent.add(g);
  const empty = {
    group: g,
    setNight() {},
    update() {},
  };
  const buildings = data?.buildings || [];
  const roads = data?.roads || [];
  if (!buildings.length && !roads.length) return { empty };
  const nightMats = [];
  const track = (mat, dayE = 0, nightE = 1) => { nightMats.push({ mat, dayE, nightE }); return mat; };
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(3900, 72),
    new THREE.MeshLambertMaterial({ color: '#3c403a' }),
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.set(NT.tx, namsanBasinY(2000) - 0.8, NT.tz);
  disk.receiveShadow = true;
  g.add(disk);
  const buckets = [[], [], [], []];
  for (const b of buildings) {
    const o = b.o;
    if (!o || o.length < 3) continue;
    const c = centroid(o);
    if (inNamsanPark(c.x, c.z, parks, heightAt)) continue;
    if (o.some((pt) => inNamsanPark(pt[0], pt[1], parks, heightAt))) continue;
    const gy = groundY(c.x, c.z, heightAt);
    const ht = Math.max(4, Number(b.h) || 12);
    const mh0 = Number(b.mh) || 0;
    const { mn, mx } = footprintRange(o, heightAt);
    const base = (Number.isFinite(mn) ? mn : gy) - 0.15;
    const street = Math.max(Number.isFinite(mx) ? mx : gy, gy);
    const item = {
      o,
      h: street + ht,
      mh: (mh0 > 0.5 ? gy + mh0 : base),
      k: b.k || 'yes',
    };
    const qi = (c.x >= NT.tx ? 1 : 0) + (c.z >= NT.tz ? 2 : 0);
    buckets[qi].push(item);
  }
  return { g, empty: null, data, heightAt, parks, osm, buildings, roads, nightMats, track, disk, buckets };
}

function addNamsanCityMeshes(ctx, meshes, i) {
  for (const m of meshes) {
    m.name = 'namsan-city-b' + i;
    ctx.g.add(m);
  }
}

export function createNamsanCity(opts = {}) {
  const ctx = beginNamsanCity(opts);
  if (ctx.empty) return ctx.empty;
  for (let i = 0; i < ctx.buckets.length; i++) {
    const list = ctx.buckets[i];
    if (!list.length) continue;
    addNamsanCityMeshes(ctx, buildingMeshes(list, 4797 + i * 97), i);
  }
  return dressNamsanCity(ctx);
}

export async function createNamsanCityAsync(opts = {}, slicer) {
  const ctx = beginNamsanCity(opts);
  if (ctx.empty) return ctx.empty;
  for (let i = 0; i < ctx.buckets.length; i++) {
    const list = ctx.buckets[i];
    if (!list.length) continue;
    addNamsanCityMeshes(ctx, await buildingMeshesAsync(list, 4797 + i * 97, slicer), i);
    if (slicer) await slicer.tick();
  }
  if (slicer) slicer.flush('namsan-city-buildings');
  return dressNamsanCity(ctx);
}

function dressNamsanCity(ctx) {
  const { g, heightAt, osm, roads, nightMats, track, disk } = ctx;
  // ----- roads (follow sampled ground) -----
  // namsanRoads already draws the park / 소월로 / 공원길 asphalt. The city
  // pass uses a lighter #949aa3 plate plus a yellow #f2d36b center line, so
  // any overlap reads as a second road layer (lighter shards + yellow paint
  // that namsanRoads never emits on 소월로). Keep only remnants outside that
  // coverage so downtown streets beyond the OSM extract still appear.
  const keepouts = namsanRoadKeepouts(osm);
  for (const a of cityJunctionApproaches(osm, roads)) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const hw = a.width * 0.5 + 1.15;
    for (const pt of a.pts) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minZ) minZ = pt[1];
      if (pt[1] > maxZ) maxZ = pt[1];
    }
    keepouts.push({
      pts: a.pts, hw,
      minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw,
    });
  }
  const roadForMesh = [];
  const glowGeos = [];
  const streakGeos = [];
  const ARTERIES = new Set(['motorway', 'trunk', 'primary', 'secondary']);
  for (const r of roads) {
    if (!r.p || r.p.length < 2) continue;
    const leftovers = clipCityRoadOutsideNamsan(r.p, keepouts);
    for (const piece of leftovers) {
      const pts = piece.map(([x, z]) => {
        const y = groundY(x, z, heightAt) + 0.06;
        return [x, z, y];
      });
      if (pts.length < 2) continue;
      roadForMesh.push({ p: pts, w: r.w || 10, k: r.k || 'secondary' });
      if (ARTERIES.has(r.k)) {
        glowGeos.push(paint(fixNormalsUp(ribbonGeo(pts, Math.max(2.2, (r.w || 10) * 0.18), 0.16, false)), '#ffd089'));
        streakGeos.push(ribbonGeo(pts, 1.15, 0.22, false));
      }
    }
  }
  const roadGeos = roadGeometries(roadForMesh, { lines: true, caps: false });
  if (roadGeos.length) {
    const rg = mergeGeometries(roadGeos.filter(Boolean));
    if (rg) {
      const rm = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ vertexColors: true }));
      rm.receiveShadow = true;
      rm.name = 'namsan-city-roads';
      g.add(rm);
    }
  }
  const glowMat = track(new THREE.MeshBasicMaterial({
    color: '#ffd089', transparent: true, opacity: 0, depthWrite: false, fog: true,
  }), 0, 0);
  glowMat.userData.nightOp = 0.42;
  if (glowGeos.length) g.add(new THREE.Mesh(mergeGeometries(glowGeos), glowMat));

  const streakMap = streakTex();
  streakMap.repeat.set(8, 1);
  const streakMat = track(new THREE.MeshBasicMaterial({
    map: streakMap, transparent: true, opacity: 0, depthWrite: false, fog: true,
  }), 0, 0);
  streakMat.userData.nightOp = 0.85;
  if (streakGeos.length) g.add(new THREE.Mesh(mergeGeometries(streakGeos), streakMat));

  // ----- horizon impostor ring -----
  const skyTex = skylineTex();
  skyTex.repeat.set(6, 1);
  const ringMat = new THREE.MeshBasicMaterial({
    map: skyTex, side: THREE.BackSide, transparent: true, opacity: 0.92, fog: true, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4300, 4300, 900, 72, 1, true), ringMat);
  ring.position.set(NT.tx, namsanBasinY(2500) + 420, NT.tz);
  ring.name = 'namsan-skyline-ring';
  g.add(ring);

  let night = 0;
  return {
    group: g,
    setNight(v) {
      night = v;
      for (const { mat, dayE, nightE } of nightMats) {
        if (mat.userData.nightOp != null) {
          mat.opacity = v * mat.userData.nightOp;
          mat.visible = v > 0.02;
        } else {
          mat.emissiveIntensity = dayE + (nightE - dayE) * v;
        }
      }
      disk.material.color.set(v > 0.5 ? '#16181c' : '#3c403a');
    },
    update(dt) {
      if (night > 0.02) streakMap.offset.x = (streakMap.offset.x + dt * 0.09) % 1;
    },
  };
}
