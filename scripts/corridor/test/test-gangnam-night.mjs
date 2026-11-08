// [gangnam-night] 야경 데이터 · 전광판 매니페스트 · 미니맵/정류장 섬 범위
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { avenueSegs, placeLamps, placeWindows, projectOnto } from '../../../src/gangnam/avenues.js';
import { designScreens } from '../../../src/gangnam/billboards/rules.js';
import { SCREENS, BUILTIN } from '../../../src/gangnam/billboards/manifest.js';
import { gangnamNightEnabled } from '../../../src/gangnam/night.js';
import { gangnamAdsEnabled } from '../../../src/gangnam/billboards/manifest.js';
import { islandIndex, sameIsland, nearestScoped, placeCaption, collectPlaces, setNearScope, stopCardAllowed } from '../../../src/corridor/nearScope.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);

const gn = J('public/corridor/gangnam/index.json');
const night = J('public/corridor/gangnam/night.json');
const placed = (await import('../../../src/gangnam/billboards/placements.js')).default;
const cIndex = J('public/corridor/index.json');
const B = gn.meta.box;
const tiles = Object.keys(gn.tiles).map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
const segs = avenueSegs(tiles);
const buildings = tiles.flatMap((t) => t.b || []);
const exits = gn.stations[0].exits.map((e) => ({ ref: e.ref, x: e.x, z: e.z }));

assert.equal(gangnamNightEnabled(''), true);
assert.equal(gangnamNightEnabled('?gangnamnight=0'), false);
assert.equal(gangnamNightEnabled('?gangnam=0'), false);
assert.equal(gangnamNightEnabled('?gangnam=0&gangnamnight=1'), false);
assert.equal(gangnamAdsEnabled(''), true);
assert.equal(gangnamAdsEnabled('?gangnamads=0'), false);
assert.equal(gangnamAdsEnabled('?gangnam=0'), false);
ok('flags gangnamnight / gangnamads');

const lamps = placeLamps(segs, { exits, buildings, step: 40, sides: 2, box: B });
assert.deepEqual(lamps, night.lamps, 'night.json 가로등이 placeLamps 와 다름 — node scripts/corridor/build-gangnam-night.mjs');
assert.ok(lamps.length / 5 >= 40 && lamps.length / 5 < 400, `가로등 ${lamps.length / 5}`);
const wins = placeWindows(segs, buildings, { minH: 48, max: 240 });
assert.deepEqual(wins, night.windows);
assert.equal(night.meta.osmStreetLamps, 0);
assert.deepEqual(night.meta.avenues, ['강남대로', '테헤란로']);
for (let i = 0; i < lamps.length; i += 5) {
  const x = lamps[i], z = lamps[i + 1];
  assert.ok(x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1, `등 박스 밖 ${x},${z}`);
  const pr = projectOnto(segs, x, z);
  assert.ok(pr && pr.d > 2 && pr.d < pr.w / 2 + 4, `등이 차도 한가운데거나 너무 멈 ${x},${z} d=${pr?.d}`);
  assert.ok(['강남대로', '테헤란로'].includes(pr.n));
}
const oneSide = placeLamps(segs, { exits, buildings, step: 40, sides: 1, box: B });
assert.ok(oneSide.length < lamps.length, '모바일(한쪽)이 더 적어야 함');
assert.ok(wins.length / 4 <= 240);
ok(`lamps ${lamps.length / 5}, windows ${wins.length / 4}, one-side ${oneSide.length / 5}`);

const screens = designScreens(exits, segs);
assert.deepEqual(screens, placed.screens, 'placements.json 이 designScreens 와 다름');
assert.equal(placed.design, true);
assert.equal(placed.notSurveyed, true);
assert.match(placed.note, /OSM/);
const ids = screens.map((s) => s.id);
assert.deepEqual(Object.keys(SCREENS).sort(), [...ids].sort());
const brands = /애플|스타벅스|현대|나이키|삼성전자|CGV|메가박스|apple|starbucks|hyundai|nike|logo/i;
for (const s of screens) {
  assert.ok(s.x >= B.x0 && s.x <= B.x1 && s.z >= B.z0 && s.z <= B.z1, s.id);
  assert.ok(s.kind === 'pole' || s.kind === 'board');
  assert.ok(!brands.test(s.note || ''), s.id);
  const entry = SCREENS[s.id];
  const srcs = entry.schedule?.length ? entry.schedule : [entry.src];
  for (const src of srcs) {
    assert.ok(BUILTIN[src] != null || src.startsWith('/'), `${s.id} src ${src}`);
    assert.ok(!brands.test(src), src);
  }
}
assert.ok(screens.some((s) => s.anchor === 'exit 10' && s.kind === 'pole'));
assert.ok(screens.some((s) => s.anchor === 'exit 11' && s.kind === 'pole'));
assert.ok(screens.filter((s) => s.kind === 'board').length >= 3);
ok(`screens ${screens.length} manifest ↔ placements, no third-party marks`);

const main = cIndex.meta.bounds;
const islands = [main, { x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 }];
const pangyo = (J('public/corridor/pangyo/index.json').stations || [])[0];
const stops = [
  { name: '정자역(마을)', ref: '07786', x: -1.3, z: 20.6 },
  { name: '잠실엘스아파트앞', ref: '24142', x: -2170, z: -16076.3 },
];
const stations = [
  ...cIndex.stations,
  pangyo,
  gn.stations[0],
].filter(Boolean);
const places = collectPlaces(stations, gn.landmarks, { name: '정자역', x: -6.6, z: 6.4 });
const gx = -7135, gz = -14920;
assert.equal(islandIndex(gx, gz, islands), 1);
assert.equal(sameIsland(gx, gz, -1.3, 20.6, islands), false);
assert.equal(sameIsland(0, 0, 10, 10, islands), true);
const picked = nearestScoped(gx, gz, stops, { maxDist: 22, islands });
assert.equal(picked, null, '강남에서 22m 안 코리더 정류장이 잡히면 안 됨');
const far = nearestScoped(gx, gz, stops, { maxDist: 1e9, islands });
assert.equal(far, null, '거리 제한을 풀어도 다른 섬 정류장은 후보가 아님');
const cap = placeCaption(gx, gz, places, islands);
assert.ok(cap && cap.name === '강남역', `지명 ${cap?.name}`);
assert.ok(!/판교/.test(cap.name));
setNearScope({ islands, detachedStopCard: false });
assert.equal(stopCardAllowed(gx, gz), false);
assert.equal(stopCardAllowed(0, 20), true);
const jeongjaCap = placeCaption(9, 9, places, islands);
assert.ok(jeongjaCap && /정자/.test(jeongjaCap.name) && !/강남|판교/.test(jeongjaCap.name), jeongjaCap?.name);
const nearStop = nearestScoped(0, 20, stops, { maxDist: 22, islands });
assert.equal(nearStop?.item.ref, '07786');
const jam = cIndex.stations.find((s) => s.name === '잠실');
assert.ok(jam, '잠실');
const jamCap = placeCaption(jam.x, jam.z, places, islands);
assert.ok(jamCap && jamCap.name === '잠실역', jamCap?.name);
assert.equal(stopCardAllowed(jam.x, jam.z), true);
assert.equal(nearestScoped(jam.x, jam.z, stops, { maxDist: 22, islands }), null);
ok('scope: 강남 지명은 강남역, 정자 정류장·판교 이름 없음. 정자·잠실은 그대로');

console.log(`gangnam-night ${n} ok`);
