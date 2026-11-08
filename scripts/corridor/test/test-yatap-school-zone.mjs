// [schoolzone] 어린이 보호구역: 짧은 적색 구간, 구역 안 횡단보도만 노란색, 이름은 데이터에 있을 때만.
//   중·고등학교는 넣지 않는다. ?schoolzone=0 이면 메쉬 없음.
//   노면 글자·30·표지 텍스처는 학교 수와 상관없이 한 장씩.
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadSchoolWorld } from '../load-school-world.mjs';
import { planSchoolZones, schoolLevel } from '../../../src/corridor/schoolZonePlan.js';
import baked from '../../../src/corridor/schoolZoneData.json' with { type: 'json' };
import { schoolZoneEnabled, mountSchoolZones } from '../../../src/corridor/yatapSchoolZone.js';

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);
const root = new URL('../../..', import.meta.url).pathname;

assert.equal(schoolZoneEnabled(new URLSearchParams('')), true);
assert.equal(schoolZoneEnabled(new URLSearchParams('schoolzone=0')), false);
assert.equal(schoolZoneEnabled(null), true);
ok('default on, ?schoolzone=0 off');

const world = loadSchoolWorld(root);
const zones = planSchoolZones(world);
assert.deepEqual(zones, baked);
ok('baked schoolZoneData.json matches the planner');

assert.ok(zones.length >= 8 && zones.length < 120, 'zone count ' + zones.length);
for (const z of zones) {
  assert.ok(z.len <= 84.01 && z.len >= 28, z.id + ' len ' + z.len);
  assert.ok(schoolLevel(z.name) !== 'middle' && schoolLevel(z.name) !== 'high', z.name);
  const span = Math.hypot(z.samples[0][0] - z.samples.at(-1)[0], z.samples[0][1] - z.samples.at(-1)[1]);
  assert.ok(span <= z.len + 2, z.id + ' span');
  for (const m of z.marks) {
    let best = 1e9;
    for (let i = 1; i < z.samples.length; i++) {
      const a = z.samples[i - 1], b = z.samples[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((m.x - a[0]) * dx + (m.z - a[1]) * dz) / L2));
      best = Math.min(best, Math.hypot(a[0] + dx * t - m.x, a[1] + dz * t - m.z));
    }
    assert.ok(best < z.roadW * 0.45, z.id + ' marking off the segment ' + best);
  }
}
ok('every red segment is a short frontage, markings stay on it');

const yatap = zones.find((z) => z.name === '야탑초등학교');
assert.ok(yatap, 'yatap');
assert.ok(yatap.len <= 84 && yatap.len >= 60);
assert.ok(yatap.crossings.some((c) => Math.hypot(c.x - 1616.6, c.z + 5562) < 3), 'front crosswalk');
assert.ok(!yatap.crossings.some((c) => Math.hypot(c.x - 1450, c.z + 5562.7) < 8), 'far crosswalk stays out');
assert.equal(yatap.plate.text, '야탑초등학교');
const xs = yatap.samples.map((p) => p[0]);
assert.ok(Math.max(...xs) - Math.min(...xs) < 90, 'yatap paving is not the whole street');
ok('Yatap zone is the crosswalk segment, not the whole of Yanghyeon-ro');

for (const name of ['보평초등학교', '화랑초등학교', '백현초등학교', '성남신기초등학교', '탄천초등학교', '늘푸른초등학교', '청솔초등학교', '미금초등학교']) {
  const z = zones.find((q) => q.name === name);
  assert.ok(z && z.plate && z.plate.text === name, name);
}
assert.ok(!zones.some((z) => /중학교|고등학교|대학교/.test(z.name || '')));
ok('named elementary schools get a plate; middle and high schools do not');

const off = new THREE.Group();
assert.equal(mountSchoolZones(off, new URLSearchParams('schoolzone=0')), null);
assert.equal(off.children.length, 0);
ok('?schoolzone=0 adds nothing');

const parent = new THREE.Group();
const mounted = mountSchoolZones(parent, new URLSearchParams(''));
assert.equal(mounted.group.name, 'schoolZone');
const named = (name) => mounted.group.children.filter((o) => o.name === name);
assert.equal(named('schoolzone-red').length, 1);
assert.equal(named('schoolzone-yellow').length, 1);
assert.equal(named('schoolzone-zebra').length, 1);
assert.equal(named('schoolzone-text').length, 1);
assert.equal(named('schoolzone-30').length, 1);
assert.equal(named('schoolzone-text')[0].material, named('schoolzone-text')[0].material);
assert.equal(named('schoolzone-signs')[0].count, zones.reduce((n, z) => n + z.signs.length, 0));
assert.equal(named('schoolzone-plate').length, zones.filter((z) => z.plate).length);
const zebraPos = named('schoolzone-zebra')[0].geometry.attributes.position;
let zx = Infinity, zX = -Infinity;
for (let i = 0; i < zebraPos.count; i++) { zx = Math.min(zx, zebraPos.getX(i)); zX = Math.max(zX, zebraPos.getX(i)); }
assert.ok(zX - zx > 100, 'yellow crosswalks are not only one school');
mounted.dispose();
ok(`mounted ${mounted.group.children.length} meshes for ${zones.length} schools, shared road textures`);

console.log('school zones ok', zones.filter((z) => z.name).map((z) => z.name).join(', '));
