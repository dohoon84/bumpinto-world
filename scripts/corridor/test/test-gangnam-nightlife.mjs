// [gangnam-nightlife] 밤거리 데이터·플래그·상호에 실제 브랜드가 없는지
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  placeSigns, placeShopWindows, placeFacades, placeLanterns, placeStrings,
  placeCrossings, placeSignals, placeExitGlows, placeHeadlights, placeTaillights,
  placeWet, placeStrips, sampleLanes, countsOf, SHOP_NAMES, BRAND_DENY, NEON_COLORS,
} from '../../../src/gangnam/nightlifePlace.js';
import { gangnamNightlifeEnabled } from '../../../src/gangnam/nightlife.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);

assert.equal(gangnamNightlifeEnabled(''), true);
assert.equal(gangnamNightlifeEnabled('?gnight=0'), false);
assert.equal(gangnamNightlifeEnabled('?gangnam=0'), false);
assert.equal(gangnamNightlifeEnabled('?gangnam=0&gnight=1'), false);
assert.equal(gangnamNightlifeEnabled('?gnight=1'), true);
ok('flags gnight / gangnam');

const lower = SHOP_NAMES.map((s) => s.toLowerCase());
assert.equal(new Set(SHOP_NAMES).size, SHOP_NAMES.length, '상호 이름 중복');
for (const name of SHOP_NAMES) {
  for (const deny of BRAND_DENY) {
    assert.equal(name.toLowerCase().includes(deny.toLowerCase()), false, `브랜드 유사: ${name} / ${deny}`);
  }
}
assert.ok(SHOP_NAMES.length >= 48);
ok(`shop names ${SHOP_NAMES.length}, no brands`);

const gn = J('public/corridor/gangnam/index.json');
const data = J('public/corridor/gangnam/nightlife.json');
const box = gn.meta.box;
const tiles = Object.keys(gn.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
const exits = (gn.landmarks.find((l) => l.model === 'gangnamEntrances')?.entrances || []).map((e) => ({
  ref: e.ref, x: e.x, z: e.z, dir: e.dir,
}));
const around = { x: gn.stations[0].x, z: gn.stations[0].z };

const built = {
  signs: placeSigns(tiles, { box, around }),
  windows: placeShopWindows(tiles, { box, around }),
  facades: placeFacades(tiles, { box, around }),
  lanterns: placeLanterns(tiles, { box, around }),
  strings: placeStrings(tiles, { box, around }),
  crossings: placeCrossings(tiles, { box }),
  signals: placeSignals(placeCrossings(tiles, { box })),
  exits: placeExitGlows(exits),
  heads: placeHeadlights(tiles, { box, around }),
  tails: placeTaillights(tiles, { box, around }),
  wet: placeWet(tiles, { box }),
  strips: placeStrips(tiles, { box, around }),
  lanes: sampleLanes(tiles, { box, around }),
};
assert.deepEqual(built.signs, data.signs, 'nightlife.json signs — node scripts/corridor/build-gangnam-nightlife.mjs');
assert.deepEqual(built.windows, data.windows);
assert.deepEqual(built.facades, data.facades);
assert.deepEqual(built.lanterns, data.lanterns);
assert.deepEqual(built.strings, data.strings);
assert.deepEqual(built.crossings, data.crossings);
assert.deepEqual(built.exits, data.exits);
assert.deepEqual(built.heads, data.heads);
assert.deepEqual(built.tails, data.tails);
assert.deepEqual(built.wet, data.wet);
assert.deepEqual(built.strips, data.strips);
assert.deepEqual(built.lanes, data.lanes);
ok('nightlife.json matches place*');

const c = countsOf(data);
assert.ok(c.signs >= 1200 && c.signs <= 3600, `signs ${c.signs}`);
assert.ok(c.windows >= 250 && c.windows <= 1000, `windows ${c.windows}`);
assert.ok(c.facades >= 20 && c.facades <= 90, `facades ${c.facades}`);
assert.ok(c.lanterns >= 60 && c.lanterns <= 200, `lanterns ${c.lanterns}`);
assert.ok(c.strings >= 80 && c.strings <= 260, `strings ${c.strings}`);
assert.ok(c.crossings >= 3 && c.crossings <= 20, `crossings ${c.crossings}`);
assert.ok(c.exits === exits.length * 3, `exits ${c.exits}`);
assert.ok(c.heads >= 80 && c.heads <= 450, `heads ${c.heads}`);
assert.ok(c.tails >= 80 && c.tails <= 450, `tails ${c.tails}`);
assert.ok(c.wet >= 20 && c.wet <= 90, `wet ${c.wet}`);
assert.ok(c.strips >= 30 && c.strips <= 130, `strips ${c.strips}`);
ok(`counts ${JSON.stringify(c)}`);

for (let i = 0; i < data.signs.length; i += 10) {
  const x = data.signs[i], z = data.signs[i + 2], ni = data.signs[i + 6], ci = data.signs[i + 7], kind = data.signs[i + 8];
  assert.ok(x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1, `sign outside box ${x},${z}`);
  assert.ok(ni >= 0 && ni < SHOP_NAMES.length);
  assert.ok(ci >= 0 && ci < NEON_COLORS.length);
  assert.ok(kind === 0 || kind === 1 || kind === 2);
}
const nearStation = [];
for (let i = 0; i < data.signs.length; i += 10) {
  if (Math.hypot(data.signs[i] + 7120, data.signs[i + 2] + 14540) < 180) nearStation.push(1);
}
assert.ok(nearStation.length >= 80, `강남역 사거리 주변 간판 ${nearStation.length}`);
ok('signs inside box, kinds valid, dense near station');

const a = placeSigns(tiles, { box });
const b = placeSigns(tiles, { box });
assert.deepEqual(a, b);
ok('deterministic');

console.log(`test-gangnam-nightlife: ${n} ok`);
