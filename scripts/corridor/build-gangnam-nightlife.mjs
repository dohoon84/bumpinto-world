// [gangnam-nightlife] 강남 밤거리 장식 → public/corridor/gangnam/nightlife.json
//   사용: node scripts/corridor/build-gangnam-nightlife.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  placeSigns, placeShopWindows, placeFacades, placeLanterns, placeStrings,
  placeCrossings, placeSignals, placeExitGlows, placeHeadlights, placeTaillights,
  placeWet, placeStrips, sampleLanes, countsOf, SHOP_NAMES, NEON_COLORS, WINDOW_COLORS,
} from '../../src/gangnam/nightlifePlace.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const G = path.join(ROOT, 'public/corridor/gangnam');
const idx = JSON.parse(fs.readFileSync(path.join(G, 'index.json'), 'utf8'));
const tiles = Object.keys(idx.tiles).sort().map((k) => JSON.parse(fs.readFileSync(path.join(G, 'tiles', k + '.json'), 'utf8')));
const box = idx.meta.box;
const exits = (idx.landmarks.find((l) => l.model === 'gangnamEntrances')?.entrances || []).map((e) => ({
  ref: e.ref, x: e.x, z: e.z, dir: e.dir,
}));

const around = { x: idx.stations[0].x, z: idx.stations[0].z };
const signs = placeSigns(tiles, { box, around });
const windows = placeShopWindows(tiles, { box, around });
const facades = placeFacades(tiles, { box, around });
const lanterns = placeLanterns(tiles, { box, around });
const strings = placeStrings(tiles, { box, around });
const crossings = placeCrossings(tiles, { box });
const signals = placeSignals(crossings);
const exitGlows = placeExitGlows(exits);
const heads = placeHeadlights(tiles, { box, around });
const tails = placeTaillights(tiles, { box, around });
const wet = placeWet(tiles, { box });
const strips = placeStrips(tiles, { box, around });
const lanes = sampleLanes(tiles, { box, around });

const night = {
  v: 1,
  attribution: '© OpenStreetMap contributors (ODbL) — building outlines and named road centerlines only. Sign, lantern and screen positions are a design rule, not surveyed shop names or advertising.',
  meta: {
    generated: 'scripts/corridor/build-gangnam-nightlife.mjs',
    rule: '이름 있는 대로·길 쪽 외벽에 만든 상호 네온/LED, 1층 쇼윈도, 고층 미디어 파사드, 골목 등, 출구 빛, 횡단보도, 헤드라이트/테일라이트, 젖은 도로 반사. 실제 브랜드·로고 없음.',
    names: SHOP_NAMES,
    colors: NEON_COLORS,
    windowColors: WINDOW_COLORS,
    counts: null,
  },
  boxes: idx.meta.boxes || [idx.meta.box],
  signs, windows, facades, lanterns, strings, crossings, signals,
  exits: exitGlows, heads, tails, wet, strips, lanes,
};
night.meta.counts = countsOf(night);
fs.writeFileSync(path.join(G, 'nightlife.json'), JSON.stringify(night));
const kb = Math.round(fs.statSync(path.join(G, 'nightlife.json')).size / 1024);
console.log(`gangnam nightlife: ${JSON.stringify(night.meta.counts)} (${kb} KB)`);
