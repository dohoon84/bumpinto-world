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
import { atlasMetrics, faceCorners, fitInside, logoPlacement, logoUvRect, ATLAS_GUTTER, LOGO_ASPECT, LOGO_PAD, LOGO_PAD_COLOR, LOGO_SRC } from '../../../src/gangnam/billboards/faces.js';
import placements from '../../../src/gangnam/billboards/placements.js';
import { treeBlockedByPole, POLES, POLE_CLEAR_M } from '../../../src/gangnam/billboards/clearance.js';
import { shortenBoom } from '../../../src/gangnam/camClear.js';
import { gangnamAmbientScale } from '../../../src/gangnam/nightTone.js';
import { buildDetailTile } from '../../../src/corridor/tileMesh.js';

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
    if (src !== LOGO_SRC) assert.ok(!brands.test(src), src);
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

for (const s of Object.values(SCREENS)) {
  assert.equal(s.src, LOGO_SRC);
  assert.ok(!s.schedule?.includes('builtin:bump'));
}
const contentW = Math.round(256 * LOGO_ASPECT);
const contentH = 256;
const cols = 4;
const uvOpt = { contentW, contentH };
const cellUv = logoUvRect(0, cols, contentW, contentH);
const metrics = atlasMetrics(cols, contentW, contentH);
const front = faceCorners({ w: 14, h: 7.5, cell: 0, cols, back: false, ...uvOpt });
const back = faceCorners({ w: 14, h: 7.5, cell: 0, cols, back: true, ...uvOpt });
const topOf = (cs, pred) => cs.filter((c) => c.ly > 0).reduce(pred);
const fright = topOf(front, (a, b) => (a.lx > b.lx ? a : b));
const fleft = topOf(front, (a, b) => (a.lx < b.lx ? a : b));
assert.ok(fright.u > fleft.u && fright.v === cellUv.v1 && fleft.v === cellUv.v1, '앞면: 오른쪽이 그림의 오른쪽(핀 쪽), 위가 칸의 위');
assert.equal(front.find((c) => c.lx === fleft.lx && c.ly < 0).v, cellUv.v0);
const bright = topOf(back, (a, b) => (a.lx < b.lx ? a : b));
const bleft = topOf(back, (a, b) => (a.lx > b.lx ? a : b));
assert.ok(bright.u > bleft.u && bleft.v === cellUv.v1, '뒷면: 관찰자 오른쪽(−X)이 그림의 오른쪽');
const fit = fitInside(14, 7.5);
assert.ok(Math.abs(fit.w / fit.h - LOGO_ASPECT) < 1e-9 && fit.w <= 14 && fit.h <= 7.5);
const sampledW = (cellUv.u1 - cellUv.u0) * metrics.atlasW;
const sampledH = (cellUv.v1 - cellUv.v0) * metrics.atlasH;
assert.ok(Math.abs(sampledW / sampledH - contentW / contentH) < 1e-9, 'UV는 칸 내용 전체');
assert.ok(Math.abs(contentW / contentH - LOGO_ASPECT) < 0.002, '칸은 689:768 에 맞춘다');
assert.ok(cellUv.u0 * metrics.atlasW >= 0.5 && (metrics.pitchX - cellUv.u1 * metrics.atlasW) >= 0.5, '로고 UV는 칸 좌우에서 0.5텍셀 이상 안쪽');
assert.ok(cellUv.v0 * metrics.atlasH >= 0.5 && ((1 - cellUv.v1) * metrics.atlasH) >= 0.5, '로고 UV는 칸 위아래에서 0.5텍셀 이상 안쪽');
assert.ok(ATLAS_GUTTER >= 2);
for (const s of placements.screens) {
  const p = logoPlacement(s.w, s.h);
  const corners = faceCorners({ w: p.w, h: p.h, cell: 0, cols, back: false, ...uvOpt });
  const backC = faceCorners({ w: p.w, h: p.h, cell: 0, cols, back: true, ...uvOpt });
  const u0 = Math.min(...corners.map((c) => c.u));
  const u1 = Math.max(...corners.map((c) => c.u));
  const v0 = Math.min(...corners.map((c) => c.v));
  const v1 = Math.max(...corners.map((c) => c.v));
  assert.ok(Math.abs(p.w / p.h - LOGO_ASPECT) < 1e-9, s.id);
  assert.ok(p.mx >= Math.min(s.w, s.h) * LOGO_PAD - 1e-9 && p.my >= Math.min(s.w, s.h) * LOGO_PAD - 1e-9, s.id);
  assert.ok(Math.abs(p.mx * 2 + p.w - s.w) < 1e-9 && Math.abs(p.my * 2 + p.h - s.h) < 1e-9, s.id);
  assert.ok(Math.abs(u0 - cellUv.u0) < 1e-12 && Math.abs(u1 - cellUv.u1) < 1e-12, s.id);
  assert.ok(Math.abs(v0 - cellUv.v0) < 1e-12 && Math.abs(v1 - cellUv.v1) < 1e-12, s.id);
  assert.ok(Math.abs(Math.min(...backC.map((c) => c.u)) - cellUv.u0) < 1e-12, s.id);
}
ok('logo aspect + UV front/back');
{
  // 여백색 = 로고 PNG 네 모서리 바탕색 (사각 테두리가 보이지 않게)
  const zlib = await import('node:zlib');
  const buf = fs.readFileSync(path.join(process.cwd(), 'public', LOGO_SRC));
  let o = 8, ihdr, idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') ihdr = { w: d.readUInt32BE(0), h: d.readUInt32BE(4), depth: d[8], ct: d[9], il: d[12] };
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  assert.equal(ihdr.depth, 8); assert.equal(ihdr.il, 0); assert.ok(ihdr.ct === 6 || ihdr.ct === 2);
  const bpp = ihdr.ct === 6 ? 4 : 3, stride = ihdr.w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  let prev = Buffer.alloc(stride); const rows = [];
  for (let y = 0; y < ihdr.h; y++) {
    const f = raw[y * (stride + 1)], cur = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      cur[i] = (cur[i] + pred) & 255;
    }
    rows.push(cur); prev = cur;
  }
  const want = [1, 3, 5].map((k) => parseInt(LOGO_PAD_COLOR.slice(k, k + 2), 16));
  for (const [x, y] of [[2, 2], [ihdr.w - 3, 2], [2, ihdr.h - 3], [ihdr.w - 3, ihdr.h - 3], [2, ihdr.h >> 1], [ihdr.w >> 1, 2]]) {
    const px = rows[y].subarray(x * bpp, x * bpp + 3);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(px[k] - want[k]) <= 2, `로고 바탕 ${x},${y} ${[...px]} ≠ 여백 ${LOGO_PAD_COLOR}`);
  }
}
ok('logo pad color matches PNG background');

const showPeer = (px, pz, x, z) => sameIsland(x, z, px, pz, islands);
assert.equal(showPeer(8, -6, 0, 4), true, '정자 같은 섬 — 판교러버 이름·화살표 유지');
assert.equal(showPeer(jam.x + 30, jam.z - 10, jam.x, jam.z), true, '잠실 같은 섬');
assert.equal(showPeer(40, 1760, 20, 1700), true, '미금은 본선 섬');
assert.equal(showPeer(gx, gz, 0, 0), false, '강남↔정자는 다른 섬이라 미니맵에서 숨김');
ok('same-island peers stay, cross-island peers drop');

assert.equal(POLE_CLEAR_M, 4);
assert.ok(POLES.length >= 6);
for (const p of POLES) {
  assert.ok(treeBlockedByPole(p.x + 1, p.z, POLES));
  assert.equal(treeBlockedByPole(p.x + 6, p.z, POLES), null);
}
{
  const key = '-15_-30';
  const built = buildDetailTile(key, J(`public/corridor/gangnam/tiles/${key}.json`), { onRoadAll: () => false });
  for (const [x, z] of built.treePts) assert.equal(treeBlockedByPole(x, z), null, `tree ${x},${z}`);
  built.dispose();
}
ok('poles keep 4m clear of street trees');

assert.equal(shortenBoom(20, () => false), 20);
const pulled = shortenBoom(28, (d) => d > 9);
assert.ok(pulled <= 9 && pulled >= 2.4, pulled);
const againstWall = shortenBoom(28, (d) => d > 1.2);
assert.ok(againstWall <= 1.2 && againstWall > 0.45, againstWall);
assert.equal(gangnamAmbientScale(14, true), 1);
assert.equal(gangnamAmbientScale(21, false), 1);
assert.ok(gangnamAmbientScale(21, true) < 0.7);
assert.ok(gangnamAmbientScale(2, true) < 0.7);
ok('camera boom shortens inside a roof, gangnam ambient only at night');

console.log(`gangnam-night ${n} ok`);
