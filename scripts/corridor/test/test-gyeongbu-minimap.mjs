// [gyeongbu-bus] 미니맵 가상 타일에 경부 본선·청계산로·주변 길이 들어 있는지.
//   고치기 전: 본선 공백에는 상세 타일이 없어 코너맵이 베이지 + 화살표만 보였다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binGyeongbuMiniTiles, roadsNearMiniTiles, EXPRESS_MAP_W } from '../../../src/corridor/gyeongbuMinimap.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ex = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/gyeongbu-express.json'), 'utf8'));
const streets = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gyeongbu/cheonggye-streets.json'), 'utf8'));
const buildings = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gyeongbu/cheonggye-buildings.json'), 'utf8'));

const tiles = binGyeongbuMiniTiles({ pts: ex.pts, streets, buildings, tileSize: 500 });
assert.ok(tiles.length > 10, `타일 ${tiles.length}`);
// 빈 산(본선·청계산 밖)은 칸을 열지 않음
assert.ok(!tiles.some((t) => t.x0 === -4000 && t.z0 === -14500), '강남·본선 사이 빈 땅은 미니맵 타일 없음');

const at = (sWant) => {
  let acc = 0;
  for (let i = 1; i < ex.pts.length; i++) {
    const a = ex.pts[i - 1], b = ex.pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + seg >= sWant || i === ex.pts.length - 1) {
      const t = seg ? Math.min(1, (sWant - acc) / seg) : 0;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
    }
    acc += seg;
  }
};

const s8000 = at(8000);
const hwy = roadsNearMiniTiles(tiles, s8000.x, s8000.z, 40);
assert.ok(hwy.some((r) => r.k === 'motorway' && r.w >= EXPRESS_MAP_W - 1), `s=8000 본선 ${JSON.stringify(hwy.map((r) => r.k))}`);

const exit1 = { x: -4782.8, z: -9114.0 };
const around = roadsNearMiniTiles(tiles, exit1.x, exit1.z, 100);
assert.ok(around.some((r) => (r.name || '') === '청계산로'), `청계산 1번 출구 청계산로 ${around.map((r) => r.name || r.k).join(',')}`);
assert.ok(around.filter((r) => r.k !== 'motorway').length >= 2, '출구 주변 길도 있어야 한다');

const yangjae = at(12072);
const yRoads = roadsNearMiniTiles(tiles, yangjae.x, yangjae.z, 40);
assert.ok(yRoads.some((r) => r.k === 'primary' || r.k === 'motorway'), `양재IC 본선/스퍼 ${yRoads.map((r) => r.k).join(',')}`);

// 건물 외곽이 출구 근처 타일에 있음
const exitTile = tiles.find((t) => exit1.x >= t.x0 && exit1.x < t.x0 + t.size && exit1.z >= t.z0 && exit1.z < t.z0 + t.size);
assert.ok(exitTile && exitTile.data.buildings.length > 0, '청계산 출구 타일에 건물');

console.log(`gyeongbu minimap: ${tiles.length} tiles, s8000 motorway, 청계산로, 양재IC ok`);
