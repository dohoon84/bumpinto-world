import assert from 'node:assert/strict';
import {
  withTancheonStairs, TC_STAIRS, DOG_PARK, SASONG_JUNC, BRIDGE_DIR,
  vehiclePhase, pedPhase, vehicleAllowed, LT_CYCLE,
  tcStairsEnabled, dogParkEnabled, ltPhaseEnabled,
} from '../../../src/corridor/tancheonAmenitiesLogic.js';

assert.equal(tcStairsEnabled(''), true);
assert.equal(tcStairsEnabled('?tcstairs=0'), false);
assert.equal(dogParkEnabled('?dogpark=0'), false);
assert.equal(ltPhaseEnabled('?ltphase=0'), false);
assert.equal(withTancheonStairs({ stairs: [{ id: 1 }] }, '').stairs.length, 1 + TC_STAIRS.length);
assert.equal(withTancheonStairs({ stairs: [] }, '?tcstairs=0').stairs.length, 0);
assert.equal(vehiclePhase('ne', 5), 'green');
assert.equal(vehiclePhase('br', 5), 'red');
assert.equal(vehiclePhase('ne', 25), 'left');
assert.equal(vehiclePhase('br', 40), 'green');
assert.equal(pedPhase(60), 'green');
const cLeft = { vehSig: true, approach: 'ne', leftOnly: true, _now: () => 25, _off: 0 };
assert.equal(vehicleAllowed(cLeft, BRIDGE_DIR[0], BRIDGE_DIR[1]), true);
assert.equal(vehicleAllowed(cLeft, -BRIDGE_DIR[0], -BRIDGE_DIR[1]), false);
assert.ok(LT_CYCLE >= 60 && DOG_PARK.x1 > DOG_PARK.x0);
console.log('ok tancheon-amenities', SASONG_JUNC, DOG_PARK);
