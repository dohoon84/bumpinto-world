// [schoolzone] 야탑초등학교 어린이 보호구역.
//   기본 ON, ?schoolzone=0 이면 메쉬 없음.
//   명판은 학교 북쪽 벽 밖, 표지판은 차도 밖 인도, 노면 글자·30·노란 정지선은 양현로 위.
//   노면 글자/30·표지판 텍스처는 방향이 달라도 한 장씩만.
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  SCHOOL_RED, YATAP_SCHOOL_RING, YATAP_ROAD, YATAP_CROSSINGS,
  schoolZoneEnabled, planYatapSchoolZone, mountYatapSchoolZone, sampleYatapRoad,
} from '../../../src/corridor/yatapSchoolZone.js';

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);
const read = (f) => JSON.parse(fs.readFileSync(new URL('../../../' + f, import.meta.url)));

function inRing(x, z, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) ins = !ins;
  }
  return ins;
}
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

assert.equal(schoolZoneEnabled(new URLSearchParams('')), true);
assert.equal(schoolZoneEnabled(new URLSearchParams('schoolzone=1')), true);
assert.equal(schoolZoneEnabled(new URLSearchParams('foo=1')), true);
assert.equal(schoolZoneEnabled(new URLSearchParams('schoolzone=0')), false);
assert.equal(schoolZoneEnabled(null), true);
ok('default on, ?schoolzone=0 off');

const tile = read('public/corridor/tiles/3_-12.json');
const schools = tile.b.filter((b) => b.k === 'school');
const ringKey = (r) => r.map((p) => p.join(',')).join('|');
const hit = schools.find((b) => ringKey(b.o) === ringKey(YATAP_SCHOOL_RING));
assert.ok(hit, 'school ring is the 3_-12 school footprint');
assert.ok(hit.h > 12, 'main school building, not a shed');
ok('nameplate host is the Yatap school footprint in tile 3_-12');

const base = read('public/corridor/base.json');
for (const c of YATAP_CROSSINGS) {
  const m = base.crossings.find((q) => Math.hypot(q.x - c.x, q.z - c.z) < 0.05 && Math.abs(q.w - c.w) < 0.05);
  assert.ok(m, 'crossing ' + c.x);
  assert.ok(Math.abs(m.dir[0] - c.dir[0]) < 1e-6 && Math.abs(m.dir[1] - c.dir[1]) < 1e-6);
}
ok('yellow-line crossings are the baked Yanghyeon-ro crossings');

const plan = planYatapSchoolZone();
const E = YATAP_SCHOOL_RING[4], D = YATAP_SCHOOL_RING[3];
const plateD = distSeg(plan.plate.x, plan.plate.z, E[0], E[1], D[0], D[1]);
assert.ok(plateD > 0.15 && plateD < 0.4, 'plate stands just off the north wall ' + plateD);
assert.equal(inRing(plan.plate.x, plan.plate.z, YATAP_SCHOOL_RING), false);
assert.equal(plan.plate.text, '야탑초등학교');
assert.ok(plan.plate.y > 3 && plan.plate.y < 7, 'plate is at street-reading height');
ok('name plate on the street wall, outside the building');

for (const s of plan.signs) {
  const r = sampleYatapRoad(s.x);
  const d = Math.hypot(s.x - r.x, s.z - r.z);
  assert.ok(d > 6.4 && d < 12, 'sign just off the carriageway ' + d);
  assert.equal(inRing(s.x, s.z, YATAP_SCHOOL_RING), false);
  assert.ok(Math.hypot(s.nx, s.nz) > 0.9);
}
ok('two speed signs on the school-side sidewalk, not in the carriageway');

for (const m of plan.marks) {
  const r = sampleYatapRoad(m.x);
  assert.ok(Math.abs(m.z - r.z) < 0.4, 'marking on the road centerline');
  assert.ok(m.x > 1500 && m.x < 1690);
  if (m.kind === 'text') assert.equal(m.text, '어린이 보호구역');
  if (m.kind === 'disc') assert.equal(m.text, '30');
}
assert.equal(plan.marks.filter((m) => m.kind === 'text').length, 2);
assert.equal(plan.marks.filter((m) => m.kind === 'disc').length, 2);
ok('road text and 30 sit on the red section in front of the school');

assert.equal(plan.stops.length, 4);
for (const s of plan.stops) {
  const near = YATAP_CROSSINGS.map((c) => Math.hypot(c.x - s.x, c.z - s.z)).sort((a, b) => a - b)[0];
  assert.ok(near > 4.8 && near < 6.6, 'stop line before the zebra ' + near);
  const r = sampleYatapRoad(s.x);
  assert.ok(Math.abs(s.z - r.z) < 1.2);
}
ok('yellow stop lines sit outside the crosswalk stripes');

const off = new THREE.Group();
assert.equal(mountYatapSchoolZone(off, new URLSearchParams('schoolzone=0')), null);
assert.equal(off.children.length, 0);
ok('?schoolzone=0 adds nothing');

const parent = new THREE.Group();
const zone = mountYatapSchoolZone(parent, new URLSearchParams(''));
assert.ok(zone && zone.group.name === 'yatapSchoolZone');
assert.equal(zone.group.parent, parent);
assert.ok(zone.group.children.length <= 10, 'draw count ' + zone.group.children.length);
const named = (name) => zone.group.children.filter((o) => o.name === name);
assert.equal(named('schoolzone-red').length, 1);
assert.equal(named('schoolzone-yellow').length, 1);
assert.equal(named('schoolzone-plate').length, 1);
assert.equal(named('schoolzone-text').length, 2);
assert.equal(named('schoolzone-30').length, 2);
assert.equal(named('schoolzone-text')[0].material, named('schoolzone-text')[1].material);
assert.equal(named('schoolzone-30')[0].material, named('schoolzone-30')[1].material);
assert.ok(named('schoolzone-signs')[0].isInstancedMesh && named('schoolzone-signs')[0].count === 2);
assert.equal(named('schoolzone-red')[0].material.color.getHexString(), SCHOOL_RED.slice(1));
const pn = named('schoolzone-plate')[0].geometry.attributes.normal;
assert.ok(pn.getZ(0) < -0.85, 'plate faces the road (north)');
const tn = named('schoolzone-text')[0].geometry.attributes.normal;
assert.ok(tn.getY(0) > 0.9, 'road text faces up');
zone.dispose();
assert.equal(zone.group.parent, null);
ok(`mounted ${zone.group.children.length} meshes, shared road/sign textures, plate faces north`);

console.log('yatap school zone ok');
