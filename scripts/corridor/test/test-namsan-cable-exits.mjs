// [namsan] 케이블카 정류장(회현·남산타워) 출입문으로 들어가고 나올 수 있는지.
//   node scripts/corridor/test/test-namsan-cable-exits.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeNamsanHeightAt } from '../../../src/corridor/landmarks/namsanTerrain.js';
import {
  planStationAccess,
  corridorSampleBlocked,
  STATION_DOOR_GAP,
  MAX_STEP,
  inCableBoardZone,
} from '../../../src/corridor/landmarks/namsanCableAccess.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const osm = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/corridor/namsan/namsan-osm.json'), 'utf8'));
const dem = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/corridor/namsan/namsan-dem.json'), 'utf8'));
const heightAt = makeNamsanHeightAt(dem, osm);
const access = planStationAccess(osm, heightAt);

let n = 0;
const ok = (s) => { n++; console.log('ok', n, s); };

assert.ok(access.stations.length === 2, 'two stations');
assert.ok(access.doors.length >= 2, `doors ${access.doors.length}`);
assert.ok(access.ramps.length >= 2, `ramps ${access.ramps.length}`);
ok(`stations ${access.stations.length}, doors ${access.doors.length}, ramps ${access.ramps.length}`);

function blocked(x, z) {
  return corridorSampleBlocked(x, z, 0.35, (xx, zz, r) => access.isBlocked(xx, zz, r));
}

function walkTo(from, to, yStart, steps = 400) {
  let x = from.x, z = from.z, y = yStart;
  for (let i = 0; i < steps; i++) {
    const ux = to.x - x, uz = to.z - z, L = Math.hypot(ux, uz) || 1;
    if (L < 0.45) return { ok: true, x, z, y, steps: i };
    const step = 0.2;
    const nx = x + (ux / L) * step, nz = z + (uz / L) * step;
    const tryAxis = (tx, tz) => {
      if (blocked(tx, tz)) return false;
      const h = access.floorY(tx, tz, y);
      const g = h != null ? h : heightAt(tx, tz);
      if (!Number.isFinite(g) || Math.abs(g - y) > MAX_STEP) return false;
      x = tx; z = tz; y = g;
      return true;
    };
    const movedX = tryAxis(nx, z);
    const movedZ = tryAxis(x, nz);
    if (!movedX && !movedZ) return { ok: false, x, z, y, steps: i, dist: Math.hypot(to.x - x, to.z - z) };
  }
  return { ok: false, x, z, y, steps, dist: Math.hypot(to.x - x, to.z - z) };
}

function inRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

for (const which of ['upper', 'lower']) {
  const st = access.stations.find((s) => s.which === which);
  const doors = access.doors.filter((d) => d.which === which);
  assert.ok(doors.length >= 1, `${which} has a door`);
  const floor = st.y + 0.12;

  // 탑승 구역은 케이블 쪽, 출입문 한가운데는 아님 — 문 앞에 서 있다고 강제 탑승되지 않게
  const entrance = doors.find((d) => Math.hypot(d.x - st.face.x, d.z - st.face.z) > 8) || doors[0];
  assert.equal(access.inBoardZone(entrance.x, entrance.z, which), false, `${which} door mid is not a board zone`);
  assert.equal(access.inBoardZone(st.face.x, st.face.z, which), true, `${which} cable node is a board zone`);
  ok(`${which}: board zone at cable, not at entrance door`);

  for (const door of doors) {
    const out = { x: door.x + door.nx * 6, z: door.z + door.nz * 6 };
    const inside = { x: door.x - door.nx * 2.4, z: door.z - door.nz * 2.4 };
    assert.equal(inRing(inside.x, inside.z, st.pts), true, `${which} inside point in ring`);
    assert.equal(inRing(out.x, out.z, st.pts), false, `${which} outside point out of ring`);

    const yIn = access.floorY(inside.x, inside.z, floor) ?? floor;
    const outWalk = walkTo(inside, out, yIn);
    assert.ok(outWalk.ok, `${which} walk out failed at (${outWalk.x?.toFixed?.(2)}, ${outWalk.z?.toFixed?.(2)}) dist=${outWalk.dist}`);
    assert.equal(inRing(outWalk.x, outWalk.z, st.pts), false, `${which} ended outside`);
    ok(`${which} door i=${door.i}: walk out ${outWalk.steps} steps, y ${yIn.toFixed(2)} → ${outWalk.y.toFixed(2)}`);

    const yOut = access.floorY(out.x, out.z, outWalk.y) ?? heightAt(out.x, out.z);
    const inWalk = walkTo(out, inside, yOut);
    assert.ok(inWalk.ok, `${which} walk in failed at (${inWalk.x?.toFixed?.(2)}, ${inWalk.z?.toFixed?.(2)}) dist=${inWalk.dist}`);
    assert.equal(inRing(inWalk.x, inWalk.z, st.pts), true, `${which} ended inside`);
    ok(`${which} door i=${door.i}: walk in ${inWalk.steps} steps, y ${yOut.toFixed(2)} → ${inWalk.y.toFixed(2)}`);
  }

  // 문 아닌 벽은 통과할 수 없다
  const c = { x: 0, z: 0 };
  for (const p of st.pts) { c.x += p[0]; c.z += p[1]; }
  c.x /= st.pts.length; c.z /= st.pts.length;
  let wallHit = false;
  for (let k = 0; k < 16; k++) {
    const ang = k * Math.PI / 8;
    const far = { x: c.x + Math.sin(ang) * 20, z: c.z + Math.cos(ang) * 20 };
    const res = walkTo(c, far, floor, 120);
    if (!res.ok && inRing(res.x, res.z, st.pts)) { wallHit = true; break; }
  }
  assert.ok(wallHit, `${which} solid wall still blocks`);
  ok(`${which}: solid walls still block`);
}

console.log(`test-namsan-cable-exits: ${n} ok`);
