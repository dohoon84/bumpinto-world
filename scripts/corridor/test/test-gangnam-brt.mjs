import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gangnamBrtEnabled, buildBrtTransit, offsetRight } from '../../../src/gangnam/brtData.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);

{
  assert.equal(gangnamBrtEnabled(''), true);
  assert.equal(gangnamBrtEnabled('?gbrt=0'), false);
  assert.equal(gangnamBrtEnabled('?gangnam=0'), false);
  ok('flags gbrt / gangnam');
}

const street = J('public/corridor/gangnam/street.json');
const brt = street.brt;
assert.ok(brt, 'brt payload');
assert.equal(brt.dirs.length, 2, `dirs ${brt.dirs.length}`);
assert.ok(brt.routes.length >= 2 && brt.routes.length <= 4, `routes ${brt.routes.length}`);
const types = new Set(brt.routes.map((r) => r.type));
assert.ok(types.has('seat') && types.has('express'), `types ${[...types]}`);
const refs = new Set(brt.stops.map((s) => s.ref));
for (const r of ['22009', '22010', '22011', '22012', '22014']) assert.ok(refs.has(r), `missing stop ${r}`);
ok(`payload dirs=2 routes=${brt.routes.map((r) => r.ref).join(',')} stops=${[...refs].join(',')}`);

const index = J('public/corridor/gangnam/index.json');
const tiles = Object.keys(index.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
const busways = [];
for (const t of tiles) for (const r of t.r || []) if (r.k === 'busway') busways.push(r);

function projectOn(seq, p) {
  let best = Infinity;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
    const d = Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
    if (d < best) best = d;
  }
  return best;
}

function nearBusway(x, z) {
  let best = Infinity;
  for (const r of busways) {
    if (!r.p || r.p.length < 2) continue;
    const d = projectOn(r.p, [x, z]);
    if (d < best) best = d;
  }
  return best;
}

const allCovered = new Set();
for (const dir of brt.dirs) {
  assert.ok(dir.len > 400, `dir ${dir.id} len ${dir.len}`);
  assert.ok(dir.pts.length >= 20, `dir ${dir.id} pts ${dir.pts.length}`);
  assert.ok(dir.stops.length >= 3, `dir ${dir.id} stops ${dir.stops.length}`);
  let onBus = 0;
  for (const p of dir.pts) if (nearBusway(p[0], p[1]) <= 3.2) onBus++;
  assert.ok(onBus / dir.pts.length >= 0.45, `dir ${dir.id} on-busway ${onBus}/${dir.pts.length}`);
  for (const st of dir.stops) {
    allCovered.add(st.ref);
    const stop = brt.stops.find((s) => s.id === st.stop);
    assert.ok(stop, st.stop);
    // s along path: sample nearby pts to recover travel dir
    let acc = 0, hit = null;
    for (let i = 1; i < dir.pts.length; i++) {
      const a = dir.pts[i - 1], b = dir.pts[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (acc + L >= st.s || i === dir.pts.length - 1) {
        const t = Math.max(0, Math.min(1, (st.s - acc) / L));
        const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
        hit = { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx, dz };
        break;
      }
      acc += L;
    }
    assert.ok(hit, `s ${st.s} on ${dir.id}`);
    const door = [-hit.dz, hit.dx];
    const toI = [stop.x - hit.x, stop.z - hit.z];
    const side = door[0] * toI[0] + door[1] * toI[1];
    assert.ok(side > 0, `dir ${dir.id} ${st.ref} doors face island side=${side.toFixed(2)}`);
    const d = Math.hypot(toI[0], toI[1]);
    const clear = d - 2.0 - 1.25;
    assert.ok(d >= 3.4 && d <= 8.5, `dir ${dir.id} ${st.ref} island dist ${d.toFixed(2)}`);
    assert.ok(clear >= 0.35, `dir ${dir.id} ${st.ref} clearance ${clear.toFixed(2)}`);
  }
}
for (const r of ['22009', '22010', '22011', '22012', '22014']) {
  assert.ok(allCovered.has(r), `no path stops at ${r}`);
}
ok(`paths follow busways, doors face island, clearance ok, covered ${[...allCovered]}`);

{
  const T = buildBrtTransit(brt);
  assert.equal(T.paths.length, brt.dirs.length * brt.routes.length);
  const dir = brt.dirs[0];
  const mid = dir.pts[dir.pts.length >> 1];
  const off = offsetRight(dir.pts, 1.7);
  // offset is to the right; samplePath then shifts left by 1.7 → center
  let i = dir.pts.length >> 1;
  const a = dir.pts[Math.max(0, i - 1)], b = dir.pts[Math.min(dir.pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const leftx = -dz / L, leftz = dx / L;
  const back = [off[i][0] + leftx * 1.7, off[i][1] + leftz * 1.7];
  const err = Math.hypot(back[0] - dir.pts[i][0], back[1] - dir.pts[i][1]);
  assert.ok(err < 0.15, `LANE_OFF compensate err ${err}`);
  for (const p of T.paths) {
    assert.ok(!/\d+\s*분/.test(p.ref));
    assert.ok(/^\d{3,4}$/.test(p.ref), p.ref);
  }
  ok(`LANE_OFF compensated, ${T.paths.length} paths, no fabricated ETAs`);
}

console.log(`test-gangnam-brt: ${n} ok`);
