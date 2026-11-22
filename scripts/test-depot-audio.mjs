// [depot-audio] 이벤트 이름·재질 매핑·WAV 인코딩(순수 함수). AudioContext 없이 동작.
//   node scripts/test-depot-audio.mjs
import assert from 'node:assert/strict';
import {
  EVENT_NAMES, LOOP_EVENTS, materialOf, placeBufForKg, encodeWav, BGM_ID, BGM_TITLE, BGM_BPM, phraseDur,
} from '../src/depot/audioPatch.js';

assert.equal(BGM_ID, 'aisle_sunshine');
assert.equal(BGM_TITLE, 'Aisle Sunshine');
assert.equal(BGM_BPM, 116);
assert.ok(phraseDur(8) > 15 && phraseDur(8) < 18, '8 bars ~16.5s at 116bpm');

const required = [
  'cart-grab', 'cart-release', 'cart-bump', 'cart-joint',
  'item-pick', 'item-place', 'item-fall', 'item-wobble',
  'egg-crack', 'egg-splat', 'staff-talk', 'achievement', 'pa-chime',
  'freezer-door', 'freezer-hum',
  'checkout-scan', 'checkout-belt', 'checkout-printer', 'checkout-pay', 'checkout-done',
  'elec-tv', 'elec-fridge-open', 'elec-fridge-close', 'elec-washer', 'elec-vac',
];
for (const n of required) assert.ok(EVENT_NAMES.includes(n), `missing event ${n}`);
assert.ok(LOOP_EVENTS.has('checkout-belt') && LOOP_EVENTS.has('elec-tv') && LOOP_EVENTS.has('elec-washer') && LOOP_EVENTS.has('elec-vac'));

assert.equal(materialOf({ kind: 'egg' }), 'egg');
assert.equal(materialOf({ kind: 'bottle' }), 'bottle');
assert.equal(materialOf({ shape: 'bottles', id: 'soda' }), 'bottle');
assert.equal(materialOf({ kind: 'bag', shape: 'pillow' }), 'sack');
assert.equal(materialOf({ kind: 'soft', shape: 'rolls' }), 'sack');
assert.equal(materialOf({ kind: 'round', shape: 'sphere' }), 'melon');
assert.equal(materialOf({ kind: 'tray' }), 'tray');
assert.equal(materialOf({ kind: 'box' }), 'cardboard');
assert.equal(materialOf(null), 'cardboard');

assert.equal(placeBufForKg(0.5), 'place-light');
assert.equal(placeBufForKg(4.8), 'place-mid');
assert.equal(placeBufForKg(20), 'place-heavy');

// 가짜 AudioBuffer → WAV 헤더
function fakeBuf(ch, n, sr, fill = 0.1) {
  const data = Array.from({ length: ch }, () => { const a = new Float32Array(n); a.fill(fill); return a; });
  return {
    numberOfChannels: ch, length: n, sampleRate: sr,
    getChannelData: (c) => data[c],
  };
}
const wav = encodeWav(fakeBuf(1, 100, 44100, 0.25));
assert.equal(wav.length, 44 + 100 * 2);
assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
const stereo = encodeWav(fakeBuf(2, 8, 22050, -0.5));
assert.equal(stereo.length, 44 + 8 * 2 * 2);

console.log('test-depot-audio: ok', EVENT_NAMES.length, 'events', `phrase ${phraseDur(8).toFixed(2)}s`);
