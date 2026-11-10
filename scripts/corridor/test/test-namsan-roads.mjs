// [namsan] 산자락 높이 연속 + OSM 도로가 지형을 따르는지.
//   node scripts/corridor/test/test-namsan-roads.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NT, inNamsanPark } from '../../../src/corridor/landmarks/namsanCoords.js';
import { makeNamsanHeightAt } from '../../../src/corridor/landmarks/namsanTerrain.js';
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
  const edges = [];
  for (let x = dem.x0; x <= x1; x += 50) {
    edges.push([x, dem.z0], [x, z1]);
  }
  for (let z = dem.z0; z <= z1; z += 50) {
    edges.push([dem.x0, z], [x1, z]);
  }
  let maxY = -Infinity, minY = Infinity;
  for (const [x, z] of edges) {
    const y = heightAt(x, z);
    assert.ok(Number.isFinite(y), `edge y at ${x},${z}`);
    if (y > maxY) maxY = y;
    if (y < minY) minY = y;
    assert.ok(y < CITY_Y + 8, `edge still high: y=${y.toFixed(2)} at ${x.toFixed(0)},${z.toFixed(0)} (city ${CITY_Y})`);
    assert.ok(y > CITY_Y - 14, `edge too low: y=${y.toFixed(2)}`);
  }
  // inward samples should change smoothly, no cliff
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
  ok(`DEM edge y in [${minY.toFixed(1)}, ${maxY.toFixed(1)}] vs city ${CITY_Y.toFixed(1)}; max inward 5m step ${maxStep.toFixed(2)}`);
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

console.log(`namsan-roads ${n} checks passed`);
