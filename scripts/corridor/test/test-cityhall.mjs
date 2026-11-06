// [cityhall] 성남시청 데이터 + 런타임 테스트: node scripts/corridor/test/test-cityhall.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cityhallEnabled, filterCityHallHidden, createCityHall, CITYHALL_FILE } from '../../../src/corridor/cityhall.js';
import { buildSeongnamCityHall } from '../../../src/corridor/landmarks/seongnamCityHall.js';
import { setEvening } from '../../../src/evening.js';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const data = J(path.join(ROOT, 'public/corridor', CITYHALL_FILE));
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };

// 1) flag default OFF
assert.equal(cityhallEnabled(''), false);
assert.equal(cityhallEnabled('?foo=1'), false);
assert.equal(cityhallEnabled('?cityhall=0'), false);
assert.equal(cityhallEnabled('?cityhall=1'), true);
ok('cityhall flag default off, ?cityhall=1 enables');

// 2) data integrity — OSM-derived footprint, box inside corridor, near yatap
const cIndex = J(path.join(ROOT, 'public/corridor/index.json'));
const B = data.meta.box, CB = cIndex.meta.bounds;
assert.ok(B.x0 >= CB.x0 && B.x1 <= CB.x1 && B.z0 >= CB.z0 && B.z1 <= CB.z1, 'cityhall box inside corridor bounds');
assert.equal(data.meta.region, 'yatap');
assert.ok(data.building.o.length >= 4);
assert.equal(data.building.id, 'w156924219');
assert.ok(data.council?.o?.length >= 4);
assert.ok(data.pond?.o?.length >= 4);
assert.ok(data.fountain && data.deck && data.promenade && data.vehicleGate);
const yatap = cIndex.stations.find((s) => s.id === 'yatap');
assert.ok(yatap);
const dY = Math.hypot(data.building.pos.x - yatap.x, data.building.pos.z - yatap.z);
assert.ok(dY > 500 && dY < 1500, 'cityhall ~1km north of yatap, got ' + dY);
ok(`data OK (OSM building, council, pond; ${Math.round(dY)}m from yatap)`);

// 3) suppress filter marks nr without mutating original
const tile = J(path.join(ROOT, 'public/corridor/tiles/3_-12.json'));
const before = tile.b.filter((b) => b.nr).length;
const filtered = filterCityHallHidden(data, tile);
assert.notEqual(filtered, tile);
assert.equal(tile.b.filter((b) => b.nr).length, before, 'original tile unchanged');
const marked = filtered.b.filter((b) => b.lm === 'seongnamCityHall');
assert.ok(marked.length >= 1, 'at least main building suppressed');
assert.ok(marked.every((b) => b.nr === 1));
ok(`suppress filter marks ${marked.length} buildings nr`);

// 4) filter is no-op without data
assert.equal(filterCityHallHidden(null, tile), tile);
ok('filter no-op without data');

// 5) build mesh — no throw, has named parts, night toggle, update
{
  const scene = new THREE.Scene();
  const built = buildSeongnamCityHall(data);
  scene.add(built.group);
  const names = [];
  built.group.traverse((o) => { if (o.name) names.push(o.name); });
  for (const need of ['cityhallBuilding', 'cityhallBlueFacade', 'cityhallFountain', 'cityhallDeck', 'cityhallSeats', 'cityhallJets', 'cityhallBanners', 'cityhallParking', 'cityhallVehicleGate', 'cityhallWalker', 'cityhallWalkerBody']) {
    assert.ok(names.includes(need), 'missing ' + need);
  }
  assert.ok(built.stats.meshes >= 8, 'meshes ' + built.stats.meshes);
  assert.ok(built.stats.instanced >= 4, 'instanced ' + built.stats.instanced);
  setEvening(true);
  built.update(0.016, 1.0);
  setEvening(false);
  built.update(0.016, 2.0);
  built.dispose();
  ok(`builder meshes=${built.stats.meshes} instanced=${built.stats.instanced}`);
}


// 5b) honeycomb walker at west plaza + collision + groundHeight deck/tier
{
  const built = buildSeongnamCityHall(data);
  const names = [];
  built.group.traverse((o) => { if (o.name) names.push(o.name); });
  assert.ok(names.includes('cityhallWalkerBody'), 'walker body mesh');
  assert.ok(names.includes('cityhallWalkerBase'), 'walker base mesh');
  const pr = data.promenade;
  const wx = data.walker?.x ?? 1635;
  const wz = data.walker?.z ?? -5872;
  assert.equal(built.isBlocked(wx, wz, 0.4), true, 'walker base blocks center');
  assert.equal(built.isBlocked(wx + 8, wz + 8, 0.4), false, 'clear of walker');
  const bx = 1694, zMid = -5922, R = 26;
  const deckX = bx + ((R + 0.7 + R + 5.2) / 2);
  const deckY = built.groundHeight(deckX, zMid);
  assert.ok(deckY != null && deckY > 0.35 && deckY < 0.5, 'deck groundHeight ' + deckY);
  const nLegZ0 = -5948 - 2.8, tierD = 1.85;
  const tierTopZ = nLegZ0 - 2.5 * tierD;
  const seatX = 1698 + 40 * 0.55;
  const tierY = built.groundHeight(seatX, tierTopZ);
  assert.ok(tierY != null && tierY > 1.2 && tierY < 1.4, 'top tier groundHeight ' + tierY);
  const seat = built.findSeat(seatX, nLegZ0 - 2.32 * tierD);
  assert.ok(seat && Math.abs(seat.y - 1.32) < 0.05, 'top tier seat.y ' + seat?.y);
  built.dispose();
  ok(`walker @ ${wx.toFixed(0)},${wz.toFixed(0)} collision+heights`);
}


// 5c) plaza extras: stone, floor fountain, overpass height, elevator
{
  const built = buildSeongnamCityHall(data);
  const names = [];
  built.group.traverse((o) => { if (o.name) names.push(o.name); });
  assert.ok(names.includes('cityhallStonePlaza'), 'stone plaza');
  assert.ok(names.includes('cityhallFloorGrates'), 'floor fountain grates');
  assert.ok(names.includes('cityhallPlazaExtrasBody'), 'bus/overpass body');
  // Overpass deck height
  const deckY = built.groundHeight(1810, -5765);
  assert.ok(deckY != null && deckY > 5 && deckY < 6.5, 'overpass deck y ' + deckY);
  // West/east elevator towers at end abutments (cable-stayed)
  const el = built.tryElevator?.(1786.8, -5765, 0);
  assert.ok(el && el.y > 5, 'elevator up ' + JSON.stringify(el));
  const elEast = built.tryElevator?.(1833.2, -5765, 0);
  assert.ok(elEast && elEast.y > 5, 'east elevator up ' + JSON.stringify(elEast));
  built.dispose();
  ok('plaza extras stone/fountain/overpass/elevator');
}


// 5d) sealed G1 glass volume — enter only via doors; former gap closed
{
  const built = buildSeongnamCityHall(data);
  const zFace = Math.max(...data.building.o.map((p) => p[1])) + 0.22;
  assert.equal(built.isBlocked(1545, zFace, 0.4), true, 'west G1 blocks');
  assert.equal(built.isBlocked(1585, zFace, 0.4), true, 'former gap now glass');
  assert.equal(built.isBlocked(1650, zFace, 0.4), true, 'main G1 blocks');
  assert.equal(built.isBlocked(1607, zFace, 0.4), false, 'door bay open');
  // Back / side walls of sealed volume
  const zBack = Math.max(...data.building.o.map((p) => p[1])) - 11;
  assert.equal(built.isBlocked(1600, zBack, 0.4), true, 'north/back wall blocks');
  assert.equal(built.isBlocked(1524, (zFace + zBack) / 2, 0.4), true, 'west end wall blocks');
  const names = [];
  built.group.traverse((o) => { if (o.name) names.push(o.name); });
  assert.ok(names.includes('cityhallGroundFloor'), 'ground floor group');
  assert.ok(names.includes('cityhallRevolvingDoor'), 'revolving door');
  assert.ok(names.includes('cityhallAutoDoor'), 'auto door');
  assert.ok(names.includes('cityhallG1Transom'), 'transom above doors');
  assert.ok(names.includes('cityhallStayCable') || names.includes('cityhallOverpassRail'), 'cable-stayed overpass');
  built.dispose();
  ok('sealed G1 glass/doors/transom + overpass');
}

// 6) createCityHall wrapper
{
  const scene = new THREE.Scene();
  const api = createCityHall({ data, scene });
  assert.ok(api.group.parent === scene);
  api.update(0.016);
  api.dispose();
  assert.equal(api.group.parent, null);
  ok('createCityHall mount/update/dispose');
}

console.log('ALL', n, 'ok');
