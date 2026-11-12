// [hangang] 나무·벤치·가로등·휴지통·볼라드·자전거길 표지·한강 부유 문화섬(로고 없음).
//   OSM natural=tree / amenity=bench / waste_basket 를 쓰고, 부족한 구간은 길을 따라 심는다(approximate).
import * as THREE from 'three';
import { addInstancedTrees } from '../../world/trees.js';
import { inWater, centroid, pointInRing, projectOnLine } from './hangangCoords.js';

function hash01(i) {
  let n = (i * 374761393) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function alongWays(ways, step, fn) {
  let acc = 0;
  for (const w of ways) {
    const pts = w.pts || w;
    if (!pts || pts.length < 2) continue;
    let local = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      let s = (step - ((acc + local) % step)) % step;
      for (; s < L; s += step) fn(ax + dx * s, az + dz * s, dx, dz, acc + local + s);
      local += L;
    }
    acc += local;
  }
}

function boxMesh(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

function* hangangPropsGen({ parent, osm, land } = {}) {
  const group = new THREE.Group();
  group.name = 'hangang-props';
  parent.add(group);
  const heightAt = land.heightAt;
  const lv = land.levels;
  const mats = [];
  const jamsuRing = osm?.jamsu?.outline?.pts;
  const jamsuLine = osm?.jamsu?.centerline?.pts;
  const groundY = (x, z) => {
    if (jamsuRing && pointInRing(x, z, jamsuRing)) return land.jamsuDeckY(x, z);
    if (jamsuLine) {
      const q = projectOnLine(x, z, jamsuLine);
      if (q && q.dist < 6) return land.jamsuDeckY(x, z);
    }
    return heightAt(x, z);
  };

  const bikeWays = (osm?.ways || []).filter((w) => {
    const n = w.name || '';
    return w.k === 'cycleway' || n.includes('자전거') || n === '잠수교';
  });
  const walkWays = (osm?.ways || []).filter((w) => w.k === 'footway' || w.k === 'path' || w.k === 'pedestrian');

  // --- trees: OSM nodes + approximate rows along bike paths ---
  const treePts = [];
  const seen = new Set();
  const addTree = (x, z) => {
    const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    if (seen.has(key)) return;
    if (inWater(x, z, osm?.water)) return;
    if (jamsuRing && pointInRing(x, z, jamsuRing)) return;
    const y = heightAt(x, z);
    if (y == null || y < lv.waterY + 0.3) return;
    seen.add(key);
    treePts.push([x, z]);
  };
  for (const t of osm?.trees || []) addTree(t.x, t.z);
  const sparse = osm?.meta?.segment === 'hap';
  const treeStep = sparse ? 36 : 22;
  alongWays(bikeWays, treeStep, (x, z, dx, dz, s) => {
    const side = (Math.floor(s / treeStep) % 2 === 0) ? 1 : -1;
    addTree(x - dz * side * 4.6, z + dx * side * 4.6);
  });
  if (treePts.length) {
    let treeSeed = 7919;
    addInstancedTrees(group, treePts, {
      rnd: () => { treeSeed = (treeSeed * 16807) % 2147483647; return treeSeed / 2147483647; },
      crownRadius: 2.4, crownY: 5.2, trunkTop: 0.18, trunkBottom: 0.26,
      trunkHeight: 3.8, trunkColor: '#7a6248', scaleMin: 0.75, scaleSpan: 0.7,
      getY: (x, z) => heightAt(x, z),
    });
  }

  yield;
  // --- benches: OSM + approximate along river-facing walks ---
  const benchGeo = new THREE.BoxGeometry(1.5, 0.08, 0.42);
  const benchMat = new THREE.MeshLambertMaterial({ color: '#6b4e32' });
  const legGeo = new THREE.BoxGeometry(0.08, 0.42, 0.08);
  const metal = new THREE.MeshLambertMaterial({ color: '#4a4e52' });
  mats.push(benchMat, metal);
  const benchPts = [...(osm?.benches || [])];
  alongWays(bikeWays, sparse ? 72 : 48, (x, z, dx, dz, s) => {
    if (hash01(Math.floor(s) + 9) < 0.55) return;
    benchPts.push({ x: x + dz * 3.2, z: z - dx * 3.2, yaw: Math.atan2(dx, dz) + Math.PI / 2, approx: true });
  });
  for (const b of benchPts) {
    const y = groundY(b.x, b.z);
    if (y == null || inWater(b.x, b.z, osm?.water)) continue;
    const yaw = b.yaw ?? 0;
    const seat = new THREE.Mesh(benchGeo, benchMat);
    seat.position.set(b.x, y + 0.42, b.z);
    seat.rotation.y = yaw;
    group.add(seat);
    for (const side of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(legGeo, metal);
      leg.position.set(b.x + Math.cos(yaw) * side, y + 0.21, b.z + Math.sin(yaw) * side);
      group.add(leg);
    }
  }

  yield;
  // --- streetlights along bike path (approximate spacing) ---
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: '#3e4246' });
  const headGeo = new THREE.BoxGeometry(0.55, 0.08, 0.22);
  const headMat = new THREE.MeshLambertMaterial({ color: '#d8d2c4', emissive: '#000000' });
  mats.push(poleMat, headMat);
  const lamps = [];
  const lampStep = sparse ? 48 : 32;
  alongWays(bikeWays, lampStep, (x, z, dx, dz) => {
    const px = x - dz * 3.6, pz = z + dx * 3.6;
    if (inWater(px, pz, osm?.water)) return;
    const y = groundY(px, pz);
    if (y == null) return;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(px, y + 2.6, pz);
    group.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(px + dz * 0.15, y + 5.15, pz - dx * 0.15);
    head.rotation.y = Math.atan2(dx, dz);
    group.add(head);
    // 가로등마다 PointLight 를 심으면 모든 조명 재질 셰이더에 점광원이 수백 개 들어가
    // 실제 GPU 의 fragment uniform 한도(보통 1024 vec4)를 넘어 정자동까지 셰이더가 깨진다.
    // 갓은 다 두고, 점광원은 카메라 근처 몇 개만 작은 풀에서 빌려 쓴다 (1구간·2구간 공통).
    lamps.push({ head, x: px, y: y + 5.05, z: pz });
  });

  yield;
  // --- bins: OSM + a few extras ---
  const binGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.7, 8);
  const binMat = new THREE.MeshLambertMaterial({ color: '#3a5a48' });
  mats.push(binMat);
  const binPts = [...(osm?.bins || [])];
  alongWays(bikeWays, sparse ? 120 : 86, (x, z, dx, dz, s) => {
    if (hash01(Math.floor(s) + 21) < 0.4) return;
    binPts.push({ x: x + dz * 3.0, z: z - dx * 3.0, approx: true });
  });
  for (const b of binPts) {
    const y = groundY(b.x, b.z);
    if (y == null || inWater(b.x, b.z, osm?.water)) continue;
    const m = new THREE.Mesh(binGeo, binMat);
    m.position.set(b.x, y + 0.35, b.z);
    group.add(m);
  }

  yield;
  // --- bollards near 나들목 ends (approximate) ---
  const bolGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.85, 6);
  const bolMat = new THREE.MeshLambertMaterial({ color: '#cfc8b8' });
  mats.push(bolMat);
  for (const w of osm?.ways || []) {
    if (!(w.name || '').includes('나들목') || !w.pts || w.pts.length < 2) continue;
    for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) {
      const y = heightAt(p[0], p[1]);
      if (y == null) continue;
      for (const k of [-0.6, 0, 0.6]) {
        const m = new THREE.Mesh(bolGeo, bolMat);
        m.position.set(p[0] + k, y + 0.42, p[1]);
        group.add(m);
      }
    }
  }

  yield;
  // --- generic bike-path signs (no third-party logos) ---
  const signBoard = new THREE.BoxGeometry(0.7, 0.5, 0.04);
  const signMat = new THREE.MeshLambertMaterial({ color: '#2f6b3c' });
  const postGeo = new THREE.CylinderGeometry(0.04, 0.045, 2.4, 6);
  mats.push(signMat);
  alongWays(bikeWays.filter((w) => (w.name || '').includes('자전거') || w.name === '잠수교'), 160, (x, z, dx, dz, s) => {
    const px = x - dz * 4.2, pz = z + dx * 4.2;
    const y = groundY(px, pz);
    if (y == null || inWater(px, pz, osm?.water)) return;
    const post = new THREE.Mesh(postGeo, metal);
    post.position.set(px, y + 1.2, pz);
    group.add(post);
    const board = new THREE.Mesh(signBoard, signMat);
    board.position.set(px, y + 2.25, pz);
    board.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
    group.add(board);
  });

  yield;
  // --- 한강 부유 문화섬: OSM islet 발자국(relation/4077217 계열). 로고·상호 없음.
  function ringShapeXZ(ring) {
    const pts = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring.slice();
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    return { sh, pts };
  }
  function insetTowardCentroid(ring, dist) {
    const c = centroid(ring);
    return ring.map((p) => {
      const dx = c.x - p[0], dz = c.z - p[1];
      const L = Math.hypot(dx, dz) || 1;
      return [p[0] + (dx / L) * dist, p[1] + (dz / L) * dist];
    });
  }
  const pontoonMat = new THREE.MeshLambertMaterial({ color: '#8a8680' });
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#6d828e', transparent: true, opacity: 0.94 });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#5a6b74' });
  mats.push(pontoonMat, bodyMat, roofMat);
  for (const isle of osm?.islets || []) {
    if (!isle.o || isle.o.length < 4) continue;
    const { sh, pts } = ringShapeXZ(isle.o);
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    area = Math.abs(area) * 0.5;
    const y = (lv.waterY ?? -43) + 0.28;
    const pontoon = new THREE.ExtrudeGeometry(sh, { depth: 1.55, bevelEnabled: false });
    pontoon.rotateX(-Math.PI / 2);
    const deckM = new THREE.Mesh(pontoon, pontoonMat);
    deckM.position.y = y;
    deckM.name = 'hangang-islet-pontoon';
    group.add(deckM);
    const inset = insetTowardCentroid(pts, Math.min(5.5, Math.sqrt(area) * 0.12));
    if (inset.length >= 4) {
      const massH = area > 2800 ? 11.5 : area > 1400 ? 8.2 : 5.4;
      const { sh: msh } = ringShapeXZ(inset);
      const body = new THREE.ExtrudeGeometry(msh, { depth: massH, bevelEnabled: false });
      body.rotateX(-Math.PI / 2);
      const bodyM = new THREE.Mesh(body, bodyMat);
      bodyM.position.y = y + 1.55;
      bodyM.name = 'hangang-islet-mass';
      group.add(bodyM);
      const roof = new THREE.ExtrudeGeometry(msh, { depth: 0.55, bevelEnabled: false });
      roof.rotateX(-Math.PI / 2);
      const roofM = new THREE.Mesh(roof, roofMat);
      roofM.position.y = y + 1.55 + massH;
      roofM.name = 'hangang-islet-roof';
      group.add(roofM);
    }
  }

  // 서래섬(way/25979109, leisure=park, place=islet): 잔디 섬. 가장자리를 따라 나무.
  const seorae = osm?.seorae?.ring?.pts;
  if (seorae && seorae.length >= 4) {
    const seoraeTrees = [];
    for (let i = 1; i < seorae.length; i++) {
      const a = seorae[i - 1], b = seorae[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = Math.max(1, Math.round(L / 18));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const c = centroid(seorae);
        const dx = c.x - x, dz = c.z - z;
        const D = Math.hypot(dx, dz) || 1;
        seoraeTrees.push([x + (dx / D) * 8, z + (dz / D) * 8]);
      }
    }
    if (seoraeTrees.length) {
      let seed = 4517;
      addInstancedTrees(group, seoraeTrees, {
        rnd: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
        crownRadius: 2.1, crownY: 4.6, trunkHeight: 3.2,
        scaleMin: 0.7, scaleSpan: 0.45,
        getY: (x, z) => heightAt(x, z) ?? ((lv.waterY ?? -43) + 0.8),
      });
    }
  }

  // 점광원 풀: 개수가 고정이라 셰이더 재컴파일이 없다. 1구간 4 + 2구간 4.
  const pool = [];
  const POOL = 4;
  const lightDist = sparse ? 32 : 16, lightDecay = sparse ? 1.45 : 2, lightPeak = sparse ? 2.6 : 2.2;
  for (let i = 0; i < POOL; i++) {
    const light = new THREE.PointLight('#ffd8a0', 0, lightDist, lightDecay);
    light.name = 'hangang-lamp-pool';
    group.add(light);
    pool.push(light);
  }
  let nightT = 0;

  function updateLights(px, pz) {
    if (!pool.length) return;
    const ranked = nightT > 0 ? lamps
      .map((l) => ({ l, d: (l.x - px) ** 2 + (l.z - pz) ** 2 }))
      .filter((r) => r.d < 400 * 400)
      .sort((a, b) => a.d - b.d) : [];
    for (let i = 0; i < pool.length; i++) {
      const pick = ranked[i];
      if (!pick) { pool[i].intensity = 0; continue; }
      pool[i].position.set(pick.l.x, pick.l.y, pick.l.z);
      pool[i].intensity = nightT * lightPeak;
    }
  }

  function setNight(v) {
    const t = Math.max(0, Math.min(1, v));
    nightT = t;
    headMat.emissive.setRGB(0.92 * t, 0.72 * t, 0.34 * t);
    if (!t) for (const pl of pool) pl.intensity = 0;
  }

  return { group, setNight, updateLights, treeCount: treePts.length };
}

export function createHangangProps(opts) {
  const g = hangangPropsGen(opts);
  let n = g.next();
  while (!n.done) n = g.next();
  return n.value;
}

export async function createHangangPropsAsync(opts, slicer) {
  const g = hangangPropsGen(opts);
  let n = g.next();
  while (!n.done) {
    if (slicer) await slicer.tick('hangang-props');
    n = g.next();
  }
  return n.value;
}

