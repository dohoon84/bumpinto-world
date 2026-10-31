// [ride] 요금 결제 계층 테스트: node scripts/corridor/test/test-fare.mjs
import assert from 'node:assert/strict';
import { charge, FARES, CURRENCY, setPaymentProvider, onCharge, recentCharges } from '../../../src/ride/fare.js';

// 1) 모든 요금 코드는 지금 0원, 통화 KRW
assert.equal(CURRENCY, 'KRW');
for (const [code, f] of Object.entries(FARES)) { assert.equal(f.amount, 0, code + ' must be 0원 for now'); assert.ok(['bus', 'taxi'].includes(f.mode)); }
assert.ok(FARES['taxi.instant'].premium, 'instant arrival is flagged premium');
assert.notEqual('taxi.instant', 'taxi.drive');

// 2) 0원 결제: provider 없이 성공, 영수증 발급, 비동기
let seen = [];
const off = onCharge((r) => seen.push(r));
const p = charge({ code: 'bus.base', mode: 'bus', card: 'card-x' });
assert.ok(p instanceof Promise, 'charge is async');
const r = await p;
assert.equal(r.ok, true); assert.equal(r.amount, 0); assert.equal(r.currency, 'KRW'); assert.equal(r.code, 'bus.base');
assert.match(r.receiptId, /^rcpt-/); assert.equal(r.card, 'card-x'); assert.equal(r.mode, 'bus');
const r2 = await charge({ code: 'taxi.instant', mode: 'taxi' });
assert.equal(r2.ok, true); assert.equal(r2.premium, true); assert.notEqual(r2.receiptId, r.receiptId, 'unique receipts');
assert.equal(seen.length, 2, 'listeners notified'); off();

// 3) 잘못된 코드·모드
assert.equal((await charge({ code: 'nope' })).ok, false);
assert.equal((await charge({ code: 'bus.base', mode: 'taxi' })).error, 'mode_mismatch');

// 4) provider 는 0원일 때 호출되지 않는다
let called = 0; setPaymentProvider(async () => { called++; return { ok: false }; });
assert.equal((await charge({ code: 'taxi.drive', mode: 'taxi' })).ok, true); assert.equal(called, 0);
setPaymentProvider(null);
assert.ok(recentCharges().length >= 4);
console.log('test-fare: ok');
