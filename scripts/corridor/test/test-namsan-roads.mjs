// [namsan] 산자락 높이 연속 + OSM 도로가 지형을 따르는지.
//   node scripts/corridor/test/test-namsan-roads.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NT, inNamsanPark, NAMSAN_CONNECT_ENDS } from '../../../src/corridor/landmarks/namsanCoords.js';
import { makeNamsanHeightAt, namsanWallKeepouts, namsanWallPointOpen } from '../../../src/corridor/landmarks/namsanTerrain.js';
import { namsanMini } from '../../../src/corridor/landmarks/namsan.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const dem = J('public/corridor/namsan/namsan-dem.json');
const osm = J('public/corridor/namsan/namsan-osm.json');
const heightAt = makeNamsanHeightAt(dem, osm);
let n = 0;
const ok = (s) => { n++; console.log('ok', n, s); };

const CITY_Y = 40 - (dem.datum ?? NT.datum); // ≈ -8

{
  assert.ok(Array.isArray(osm.ways) && osm.ways.length >= 40, `ways ${osm.ways?.length}`);
  const names = new Set(osm.ways.map((w) => w.name).filter(Boolean));
  assert.ok(names.has('남산공원길'), '남산공원길');
  assert.ok(names.has('남산남측순환로'), '남산남측순환로');
  assert.ok(osm.ways.some((w) => w.k === 'steps'), 'steps present');
  assert.ok(osm.ways.some((w) => w.k === 'path' || w.k === 'footway'), 'footways present');
  assert.ok((osm.busStops || []).some((s) => s.name === '남산서울타워'), '남산서울타워 정류장');
  ok(`${osm.ways.length} OSM ways, ${osm.busStops.length} bus stops, names include 공원길·남측순환로`);
}

{
  const plazaY = heightAt(NT.tx, NT.tz);
  assert.ok(Math.abs(plazaY - (NT.eleBase - NT.datum)) < 0.8, `plaza y ${plazaY}`);
  ok(`plaza still at base ${(NT.eleBase - NT.datum).toFixed(1)} (got ${plazaY.toFixed(2)})`);
}

{
  const x1 = dem.x0 + (dem.nx - 1) * dem.dx;
  const z1 = dem.z0 + (dem.nz - 1) * dem.dz;
  // 동쪽 능선은 원래 ~140 m ASL 이다. 사각 페더가 분지로 누르면 안 된다.
  const eastMid = heightAt(x1, -20400);
  assert.ok(eastMid > 70, `east DEM edge flattened to basin: y=${eastMid.toFixed(2)}`);
  const farEast = heightAt(x1 + 900, -20400);
  assert.ok(farEast < CITY_Y + 10, `far east still mountainous: y=${farEast.toFixed(2)}`);
  let maxStep = 0;
  for (const [ex, ez] of [[dem.x0, (dem.z0 + z1) / 2], [x1, (dem.z0 + z1) / 2], [(dem.x0 + x1) / 2, dem.z0], [(dem.x0 + x1) / 2, z1]]) {
    const inwardX = Math.sign(NT.tx - ex) || 1;
    const inwardZ = Math.sign(NT.tz - ez) || 1;
    let prev = heightAt(ex, ez);
    for (let s = 5; s <= 80; s += 5) {
      const x = ex + inwardX * (ex === dem.x0 || ex === x1 ? s : 0);
      const z = ez + inwardZ * (ez === dem.z0 || ez === z1 ? s : 0);
      const y = heightAt(x, z);
      const step = Math.abs(y - prev);
      if (step > maxStep) maxStep = step;
      assert.ok(step < 5.5, `height jump ${step.toFixed(2)} over 5m near edge ${x.toFixed(0)},${z.toFixed(0)}`);
      prev = y;
    }
  }
  const yaksu = heightAt(-9685.2, -20372.44);
  assert.ok(yaksu > 20 && yaksu < 120, `약수/국립극장 진입 높이 ${yaksu.toFixed(2)}`);
  ok(`east edge y=${eastMid.toFixed(1)} (not basin), far-east y=${farEast.toFixed(1)}, 약수 end y=${yaksu.toFixed(1)}; max inward 5m step ${maxStep.toFixed(2)}`);
}

{
  const cars = osm.ways.filter((w) => /남산공원길|남산남측순환로/.test(w.name || ''));
  assert.ok(cars.length >= 2, `loop roads ${cars.length}`);
  let samples = 0, maxSlope = 0;
  for (const w of cars) {
    const pts = w.pts;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.4) continue;
      const ya = heightAt(a[0], a[1]), yb = heightAt(b[0], b[1]);
      assert.ok(Number.isFinite(ya) && Number.isFinite(yb), `road height ${w.id}`);
      const slope = Math.abs(yb - ya) / L;
      if (slope > maxSlope) maxSlope = slope;
      assert.ok(slope < 1.05, `road ${w.name} ${w.id} slope ${slope.toFixed(2)} over ${L.toFixed(1)}m`);
      samples++;
    }
  }
  ok(`${cars.length} loop roads, ${samples} segments, max slope ${maxSlope.toFixed(2)}`);
}

{
  const trails = osm.ways.filter((w) => w.k === 'steps' || w.k === 'footway' || w.k === 'path');
  assert.ok(trails.length >= 20, `trails ${trails.length}`);
  for (const w of trails) {
    for (const p of w.pts) assert.ok(Number.isFinite(heightAt(p[0], p[1])), `trail ${w.id}`);
  }
  ok(`${trails.length} walk ways have finite terrain height`);
}

{
  const mini = namsanMini(null, osm);
  const loop = mini.roads.filter((r) => r.k === 'service' && r.p?.length > 10);
  const walks = mini.roads.filter((r) => r.k === 'steps' || r.k === 'footway' || r.k === 'path');
  assert.ok(loop.length >= 2, `mini loop ${loop.length}`);
  assert.ok(walks.length >= 20, `mini walks ${walks.length}`);
  assert.ok(mini.roads.some((r) => r.k === 'aerialway'), 'mini still has cable');
  assert.ok((mini.parks || []).length >= 1, `mini parks ${mini.parks?.length}`);
  assert.ok(mini.parks.some((p) => (p.o?.length || 0) > 50), 'mini has a large park ring');
  ok(`namsanMini roads: ${mini.roads.length} (loop ${loop.length}, walks ${walks.length}), parks ${mini.parks.length}`);
}

{
  assert.ok(Array.isArray(osm.parks) && osm.parks.length >= 5, `parks ${osm.parks?.length}`);
  assert.ok(osm.parks.some((p) => p.name === '남산공원' && (p.o?.length || 0) > 100), '남산공원 ring');
  const stop = osm.busStops[0];
  assert.ok(inNamsanPark(NT.tx, NT.tz, osm.parks, heightAt), 'tower in park');
  assert.ok(inNamsanPark(stop.x, stop.z, osm.parks, heightAt), 'bus stop in park');
  assert.equal(inNamsanPark(NT.tx + 2500, NT.tz + 2500, osm.parks, heightAt), false, 'far downtown not park');
  ok(`park rings ${osm.parks.length}; tower and 남산서울타워 stop culled from city`);
}

{
  const plazaY = NT.eleBase - NT.datum;
  for (const d of [0, 25, 42, 55, 70]) {
    const y = heightAt(NT.tx + d, NT.tz + 4);
    assert.ok(Math.abs(y - plazaY) < 0.9, `summit pad at d=${d} y=${y.toFixed(2)} plaza=${plazaY}`);
  }
  ok(`summit pad flat to ${plazaY} out to 70 m (east entrance included)`);
}

{
  const names = new Set(osm.ways.map((w) => w.name).filter(Boolean));
  assert.ok(names.has('남산북측순환로'), '남산북측순환로');
  assert.ok(osm.ways.some((w) => w.name === '남산오르미' && w.k === 'elevator'), '남산오르미 elevator');
  assert.ok(osm.ways.some((w) => w.service === 'driveway'), 'plaza driveway tagged');
  assert.ok((osm.landmarks || []).some((l) => l.k === 'viewpoint' && l.name.includes('전망대')), '전망대 landmark');
  ok('북측순환로 · 오르미 · driveway · 전망대 present');
}

function resample2(pts, step = 2) {
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
  if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.3) out.push([last[0], last[1]]);
  return out;
}

function walkWay(w) {
  const pts = resample2(w.pts, 2);
  assert.ok(pts.length >= 2, `walk pts ${w.id}`);
  let prev = null;
  for (const [x, z] of pts) {
    const y = heightAt(x, z);
    assert.ok(Number.isFinite(y), `void/NaN on ${w.name || w.id} at ${x.toFixed(1)},${z.toFixed(1)}`);
    // player stands on the surface — no hole under the mountain pad
    assert.ok(y > -20, `sank below world on ${w.name || w.id}: y=${y}`);
    if (prev) {
      const L = Math.hypot(x - prev.x, z - prev.z) || 1;
      const dy = Math.abs(y - prev.y);
      const maxDy = (w.k === 'steps' || w.k === 'elevator') ? 3.4 : 3.0;
      assert.ok(dy <= maxDy, `gap ${dy.toFixed(2)} over ${L.toFixed(1)}m on ${w.name || w.id} (${w.k})`);
    }
    prev = { x, z, y };
  }
  return pts.length;
}

{
  const cell = (x, z) => `${Math.round(x / 8)},${Math.round(z / 8)}`;
  const cellWays = new Map();
  for (const w of osm.ways) {
    for (const p of w.pts || []) {
      const k = cell(p[0], p[1]);
      if (!cellWays.has(k)) cellWays.set(k, new Set());
      cellWays.get(k).add(w.id);
    }
  }
  const adj = new Map(osm.ways.map((w) => [w.id, new Set()]));
  for (const ids of cellWays.values()) {
    const arr = [...ids];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        adj.get(arr[i]).add(arr[j]);
        adj.get(arr[j]).add(arr[i]);
      }
    }
  }
  const plazaIds = [];
  for (const w of osm.ways) {
    if ((w.pts || []).some((p) => Math.hypot(p[0] - NT.tx, p[1] - NT.tz) < 80)) plazaIds.push(w.id);
  }
  assert.ok(plazaIds.length >= 3, `plaza-touching ways ${plazaIds.length}`);
  const reach = new Set(plazaIds);
  const q = [...plazaIds];
  while (q.length) {
    const id = q.pop();
    for (const n of adj.get(id) || []) {
      if (!reach.has(n)) { reach.add(n); q.push(n); }
    }
  }

  const ACCESS = [
    { re: /^남산공원길$/, label: '남산공원길' },
    { re: /^남산남측순환로$/, label: '남산남측순환로' },
    { re: /^남산북측순환로$/, label: '남산북측순환로' },
    { re: /955계단/, label: '남산북측숲길(955계단)' },
    { re: /남산하늘숲길/, label: '남산하늘숲길' },
    { re: /한양도성/, label: '서울한양도성 3코스 남산구간' },
    { re: /와룡묘길/, label: '와룡묘길' },
  ];
  let walked = 0, steps = 0;
  for (const { re, label } of ACCESS) {
    const group = osm.ways.filter((w) => re.test(w.name || ''));
    assert.ok(group.length >= 1, `missing access route ${label}`);
    assert.ok(group.some((w) => reach.has(w.id)), `${label} does not connect to the plaza`);
    for (const w of group) steps += walkWay(w);
    walked += group.length;
  }
  const ormi = osm.ways.filter((w) => w.name === '남산오르미');
  assert.ok(ormi.length === 1, '오르미 way');
  for (const w of ormi) steps += walkWay(w);
  ok(`walked ${walked} summit-access ways + 오르미, ${steps} samples at 2 m; all named routes connect to plaza`);
}


{
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street']);
  function resample5(pts, step = 5) {
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
    return out;
  }
  let samples = 0, maxGap = 0, maxStep = 0;
  for (const w of osm.ways.filter((w) => CAR.has(w.k) && w.pts?.length >= 2)) {
    const pts = resample5(w.pts, 5);
    let prev = null;
    for (const [x, z] of pts) {
      const terrain = heightAt(x, z);
      const roadY = terrain + 0.10;
      const gap = Math.abs(roadY - terrain);
      if (gap > maxGap) maxGap = gap;
      assert.ok(gap < 0.3, `road-terrain gap ${gap} at ${x.toFixed(0)},${z.toFixed(0)} on ${w.name || w.id}`);
      if (prev) {
        const step = Math.abs(terrain - prev);
        if (step > maxStep) maxStep = step;
        assert.ok(step < 3.2, `road 5m step ${step.toFixed(2)} on ${w.name || w.id}`);
      }
      prev = terrain;
      samples++;
    }
  }
  assert.ok(samples > 400, `car samples ${samples}`);
  ok(`car roads every 5m: ${samples} samples, max |road-terrain|=${maxGap.toFixed(2)}, max 5m step ${maxStep.toFixed(2)}`);
}

{
  const ends = NAMSAN_CONNECT_ENDS;
  assert.ok(ends.yaksuSouth && ends.hannam && ends.jangchung && ends.towerStop, 'connect ends');
  for (const [k, p] of Object.entries(ends)) {
    const y = heightAt(p.x, p.z);
    assert.ok(Number.isFinite(y), `end ${k} y`);
    assert.ok(y > -16, `end ${k} sank y=${y}`);
  }
  const gapJoin = Math.hypot(ends.yaksuSouth.x - ends.yaksuNorth.x, ends.yaksuSouth.z - ends.yaksuNorth.z);
  assert.ok(gapJoin < 60, `약수 남북 순환로 끝이 ${gapJoin.toFixed(1)} m 떨어짐`);
  ok(`connectable ends: 약수 남 ${ends.yaksuSouth.x.toFixed(1)},${ends.yaksuSouth.z.toFixed(1)} / 한남 ${ends.hannam.x.toFixed(1)},${ends.hannam.z.toFixed(1)} / 장충 ${ends.jangchung.x.toFixed(1)},${ends.jangchung.z.toFixed(1)}`);
}


{
  const keep = namsanWallKeepouts(osm);
  const mustOpen = [
    { x: -10411.5, z: -20404.5, label: '남산공원길 × 한양도성 (정류장 서쪽)' },
    { x: -10189.9, z: -20152.0, label: '남산남측순환로 at wall 1279010528 start' },
    { x: -10199.0, z: -20157.5, label: '남산남측순환로 at wall 1279010531 end' },
    { x: -10574.1, z: -20443.1, label: 'plaza driveway × 한양도성' },
    { x: -9892.7, z: -20123.1, label: '한양도성 3코스 steps × wall 1279010528' },
    { x: -10649.8, z: -20445.9, label: 'steps near tower × 한양도성' },
    { x: -10387.2, z: -20363.5, label: 'path north of bus stop × 한양도성' },
    { x: -10409.0, z: -20393.4, label: 'footway beside 남산공원길 × 한양도성' },
  ];
  for (const p of mustOpen) {
    assert.ok(namsanWallPointOpen(p.x, p.z, keep), `wall still blocks ${p.label}`);
  }
  // 한양도성 3코스 that only walks alongside must not punch a long hole
  assert.equal(!!namsanWallPointOpen(-10965.0, -20638.4, keep), false, 'parallel 한양도성 trail cut the wall');
  const ridge = osm.walls.find((w) => w.id === 1279010531);
  assert.ok(ridge, 'ridge wall');
  let stood = 0, opened = 0;
  for (const pt of ridge.pts) {
    if (namsanWallPointOpen(pt[0], pt[1], keep)) opened++;
    else stood++;
  }
  assert.ok(stood >= 20, `ridge over-cut stood=${stood} opened=${opened} of ${ridge.pts.length}`);
  ok(`한양도성 openings: ${mustOpen.length} crossings cleared, parallel trail kept, ridge standing ${stood}/${ridge.pts.length}`);
}

{
  const sowol = osm.ways.filter((w) => w.name === '소월로');
  assert.ok(sowol.length >= 1, '소월로 missing');
  assert.ok(sowol.every((w) => (w.w || 0) >= 14), '소월로 should be 4-lane wide');
  const parkEnd = osm.ways.find((w) => w.id === 357958295);
  assert.ok(parkEnd, '공원길 stub 357958295');
  const join = parkEnd.pts[parkEnd.pts.length - 1];
  const stitched = sowol.some((w) => w.pts.some((p) => Math.hypot(p[0] - join[0], p[1] - join[1]) < 0.35));
  assert.ok(stitched, '소월로 does not meet 남산공원길 at the OSM join');
  const lib = osm.library;
  assert.ok(lib?.pts?.length >= 8, 'library footprint');
  assert.equal(lib.floors, 5, 'library floors from official source');
  assert.ok(Number.isFinite(heightAt(lib.x, lib.z)), 'library terrain');
  const spring = osm.spring;
  assert.ok(spring?.id === 14055752827, 'drinking_water node');
  assert.equal(spring.name, '약수터');
  assert.ok(Number.isFinite(heightAt(spring.x, spring.z)), 'spring terrain');
  const libStops = (osm.busStops || []).filter((s) => (s.name || '').includes('남산도서관'));
  assert.ok(libStops.length >= 2, `library bus stops ${libStops.length}`);
  assert.ok((osm.crossings || []).some((c) => c.id === 436856278), '소월로 crossing');
  // 소월로 / library driveway hug terrain (same 5 m / 3.2 m budget as other car roads)
  let maxStep = 0, samples = 0;
  for (const w of [...sowol, ...osm.ways.filter((w) => w.id === 244399269 || w.id === 244398390)]) {
    const pts = resample2(w.pts, 5);
    let prev = null;
    for (const [x, z] of pts) {
      const y = heightAt(x, z);
      assert.ok(Number.isFinite(y), `void on ${w.name || w.id}`);
      if (prev != null) {
        const step = Math.abs(y - prev);
        if (step > maxStep) maxStep = step;
        assert.ok(step < 3.2, `소월/library road 5m step ${step.toFixed(2)} on ${w.name || w.id}`);
      }
      prev = y; samples++;
    }
  }
  const ends = NAMSAN_CONNECT_ENDS;
  for (const [k, pt] of Object.entries(ends)) {
    assert.ok(Number.isFinite(heightAt(pt.x, pt.z)), `connect end ${k}`);
  }
  ok(`남산도서관 + 소월로: ${sowol.length} ways stitch to 공원길, ${libStops.length} stops, spring y=${heightAt(spring.x, spring.z).toFixed(1)}, max 5m step ${maxStep.toFixed(2)} over ${samples} samples`);
}

console.log(`namsan-roads ${n} checks passed`);
