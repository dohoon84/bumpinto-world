// [gangnam] 요금은 승차 id 당 한 번. 60초가 지나도 같은 id 는 다시 결제하지 않고, 다른 승차는 바로 결제한다.
import assert from 'node:assert/strict';
import { createRideOnce, fareChargeText } from '../src/ui-v2/econ-ui/rideOnce.js';

const g = createRideOnce();
assert.equal(g.begin('sub-a'), true);
assert.equal(g.begin('sub-a'), false, '진행 중 재태그');
g.finish('sub-a', false);
assert.equal(g.has('sub-a'), false);
assert.equal(g.begin('sub-a'), true, '실패하면 다시');
g.finish('sub-a', true);
assert.equal(g.begin('sub-a'), false, '성공한 승차는 시간이 지나도 한 번');
assert.equal(g.begin('sub-b'), true, '다음 승차는 바로');
g.finish('sub-b', true);
assert.equal(g.begin(''), false);
assert.equal(g.begin(null), false);

assert.equal(fareChargeText(1550), '−1,550 bum');
assert.equal(fareChargeText(0, true), '0 bum');
assert.equal(fareChargeText(1550, true), '0 bum');

console.log('transit ride once: per-ride id, −N bum OK');
