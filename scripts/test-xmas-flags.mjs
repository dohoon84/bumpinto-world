// node scripts/test-xmas-flags.mjs
import assert from 'node:assert/strict';
import { xmasActive, xmasGlowEnabled, xmasMode, inXmasWindow, seoulYmd } from '../src/world/xmasSeason.js';
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

console.log('xmas flags ok');
