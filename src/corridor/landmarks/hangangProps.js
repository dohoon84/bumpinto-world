// [hangang] 나무·벤치·가로등·휴지통·볼라드·자전거길 표지·무명 부유섬.
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

export function createHangangProps({ parent, osm, land } = {}) {
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
  alongWays(bikeWays, 22, (x, z, dx, dz, s) => {
    const side = (Math.floor(s / 22) % 2 === 0) ? 1 : -1;
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

  // --- benches: OSM + approximate along river-facing walks ---
  const benchGeo = new THREE.BoxGeometry(1.5, 0.08, 0.42);
  const benchMat = new THREE.MeshLambertMaterial({ color: '#6b4e32' });
  const legGeo = new THREE.BoxGeometry(0.08, 0.42, 0.08);
  const metal = new THREE.MeshLambertMaterial({ color: '#4a4e52' });
  mats.push(benchMat, metal);
  const benchPts = [...(osm?.benches || [])];
  alongWays(bikeWays, 48, (x, z, dx, dz, s) => {
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

  // --- streetlights along bike path (approximate spacing) ---
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: '#3e4246' });
  const headGeo = new THREE.BoxGeometry(0.55, 0.08, 0.22);
  const headMat = new THREE.MeshLambertMaterial({ color: '#d8d2c4', emissive: '#000000' });
  mats.push(poleMat, headMat);
  const lamps = [];
  let poleI = 0;
  alongWays(bikeWays, 32, (x, z, dx, dz) => {
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
    poleI++;
    if (poleI % 2 === 0) {
      const light = new THREE.PointLight('#ffd8a0', 0, 16, 2);
      light.position.set(px, y + 5.05, pz);
      group.add(light);
      lamps.push({ light, head });
    }
  });

  // --- bins: OSM + a few extras ---
  const binGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.7, 8);
  const binMat = new THREE.MeshLambertMaterial({ color: '#3a5a48' });
  mats.push(binMat);
  const binPts = [...(osm?.bins || [])];
  alongWays(bikeWays, 86, (x, z, dx, dz, s) => {
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

  // --- floating islands from OSM islet outers; no brand names ---
  for (const isle of osm?.islets || []) {
    if (!isle.o || isle.o.length < 4) continue;
    const c = centroid(isle.o);
    const y = (lv.waterY ?? -43) + 1.15;
    const sh = new THREE.Shape();
    const ring = isle.o[0][0] === isle.o.at(-1)[0] && isle.o[0][1] === isle.o.at(-1)[1] ? isle.o.slice(0, -1) : isle.o;
    sh.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) sh.lineTo(ring[i][0], ring[i][1]);
    sh.closePath();
    const deck = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false });
    deck.rotateX(-Math.PI / 2);
    const deckM = new THREE.Mesh(deck, new THREE.MeshLambertMaterial({ color: '#d8d4cc' }));
    deckM.position.y = y;
    deckM.name = 'hangang-islet';
    group.add(deckM);
    mats.push(deckM.material);
    const mass = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(8, (isle.o.length > 8 ? 14 : 10)), 6.5, Math.max(6, 9)),
      new THREE.MeshLambertMaterial({ color: '#e8eef2', transparent: true, opacity: 0.88 }),
    );
    mass.position.set(c.x, y + 3.2, c.z);
    group.add(mass);
    mats.push(mass.material);
  }

  function setNight(v) {
    const t = Math.max(0, Math.min(1, v));
    headMat.emissive.setRGB(0.55 * t, 0.42 * t, 0.22 * t);
    for (const l of lamps) l.light.intensity = t * 2.2;
  }

  return { group, setNight, treeCount: treePts.length };
}
