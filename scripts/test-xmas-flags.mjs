// node scripts/test-xmas-flags.mjs
import assert from 'node:assert/strict';
import {
  xmasActive, xmasGlowEnabled, xmasMode, inXmasWindow, seoulYmd,
  JEONGJA_FOUNTAIN, XMAS_BLOCK_R, XMAS_FOOT_R, jeongjaTreeSpot,
  fountainSuppressed, overlapsTreeFoot, pushOutOfTree, distToJeongjaTree,
} from '../src/world/xmasSeason.js';
import { snowFxEnabled } from '../src/weather/snowflakes.js';

assert.equal(xmasMode(null), 'on');
assert.equal(xmasMode(''), 'on');
assert.equal(xmasMode('1'), 'on');
assert.equal(xmasMode('0'), 'off');
assert.equal(xmasMode('off'), 'off');
assert.equal(xmasMode('auto'), 'auto');
assert.equal(xmasMode('season'), 'auto');

assert.equal(xmasActive(null, new Date('2026-11-07T00:00:00Z')), true);
assert.equal(xmasActive('0', new Date('2026-12-10T00:00:00Z')), false);
assert.equal(xmasActive('auto', new Date('2026-12-01T00:00:00Z')), true);
assert.equal(xmasActive('auto', new Date('2026-12-26T14:00:00Z')), true);
assert.equal(xmasActive('auto', new Date('2026-12-27T00:00:00Z')), false);
assert.equal(xmasActive('auto', new Date('2026-11-07T03:00:00Z')), false);

const ymd = seoulYmd(new Date('2026-11-30T15:30:00Z')); // KST 12/1 00:30
assert.equal(ymd.m, 12);
assert.equal(ymd.d, 1);
assert.equal(inXmasWindow(new Date('2026-11-30T15:30:00Z')), true);

assert.equal(snowFxEnabled(''), true);
assert.equal(snowFxEnabled('?weather=snow'), true);
assert.equal(snowFxEnabled('?snowfx=0'), false);
assert.equal(snowFxEnabled('?snowfx=off'), false);
assert.equal(snowFxEnabled('?snowfx=1'), true);

assert.equal(xmasGlowEnabled(null), true);
assert.equal(xmasGlowEnabled(''), true);
assert.equal(xmasGlowEnabled('1'), true);
assert.equal(xmasGlowEnabled('0'), false);
assert.equal(xmasGlowEnabled('off'), false);

const tree = jeongjaTreeSpot();
assert.equal(tree.x, JEONGJA_FOUNTAIN.x);
assert.equal(tree.z, JEONGJA_FOUNTAIN.z);
assert.equal(fountainSuppressed(null), true);
assert.equal(fountainSuppressed('0'), false);
assert.equal(fountainSuppressed('off'), false);
assert.equal(fountainSuppressed('auto', new Date('2026-12-10T03:00:00Z')), true);
assert.equal(fountainSuppressed('auto', new Date('2026-11-07T03:00:00Z')), false);
// 분수 턱(중심에서 5.55m)은 트리 바닥(9m) 안. 빈백(-82.5, 35.5)은 밖.
const ledge = { x: JEONGJA_FOUNTAIN.x + 5.55, z: JEONGJA_FOUNTAIN.z };
assert.equal(overlapsTreeFoot(ledge.x, ledge.z), true);
assert.equal(distToJeongjaTree(ledge.x, ledge.z) > XMAS_BLOCK_R, true);
assert.equal(overlapsTreeFoot(-82.5, 35.5), false);
const shoved = pushOutOfTree(JEONGJA_FOUNTAIN.x, JEONGJA_FOUNTAIN.z);
assert.equal(shoved.moved, true);
assert.ok(distToJeongjaTree(shoved.x, shoved.z) > XMAS_FOOT_R);
const stay = pushOutOfTree(-82.5, 35.5);
assert.equal(stay.moved, false);
// 정자역 표지 스폰(-6.6, 6.4)은 트리 밖
assert.ok(distToJeongjaTree(-6.6, 6.4) > XMAS_FOOT_R);

console.log('xmas flags ok');
