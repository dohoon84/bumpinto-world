// [econ] mock 경제 클라이언트 계약 테스트: node scripts/test-econ-mock.mjs
import assert from 'node:assert/strict';
import { createMockClient, taxiFare } from '../src/ui-v2/econ/mockClient.js';
import { missingMethods, ERR } from '../src/ui-v2/econ/api.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
let n = 0; const ok = (t) => { n++; console.log('ok', t); };
let clock = Date.UTC(2026, 10, 4, 3, 0, 0); const now = () => clock;
const c = createMockClient({ storage: mem(), now });

assert.deepEqual(missingMethods(c), []); assert.equal(c.isMock, true); assert.equal(c.source, 'mock'); ok('implements every EconClient method');
assert.deepEqual(await c.getEconMode(), { transitPaid: false, shopPaid: false, beta: true }); ok('default = beta free mode');

// guest
const s0 = await c.getSession(); assert.equal(s0.isGuest, true);
assert.equal((await c.getBalance()).guest, true); assert.equal((await c.getBalance()).total, 0);
const gq = await c.listQuests('daily'); assert.equal(gq.guest, true); assert.equal(gq.quests.length, 0);
assert.equal((await c.claimQuest('D-LOGIN')).error.code, ERR.NOT_SIGNED_IN);
assert.equal((await c.claimWelcome()).error.code, ERR.NOT_SIGNED_IN);
assert.equal((await c.purchase('bike')).error.code, ERR.NOT_SIGNED_IN);
const gp = await c.payFare({ mode: 'bus', code: 'bus.city', rideId: 'g1' }); assert.equal(gp.ok, true); assert.equal(gp.data.free, true); assert.equal(gp.data.amount, 0); assert.equal(gp.data.listAmount, 1650);
assert.equal((await c.getLedger()).length, 0); ok('guest: empty shapes, not_signed_in on writes, free ride allowed without ledger');

// sign in + welcome
const evs = []; c.on('reward', (e) => evs.push(e)); const bal = []; c.on('balance', (e) => bal.push(e)); const ses = []; c.on('session', (e) => ses.push(e));
c.dev.signIn(); assert.equal(ses.at(-1).isGuest, false);
const w = await c.getWelcome(); assert.equal(w.eligible, true); assert.equal(w.total, 30000);
const wr = await c.claimWelcome(); assert.equal(wr.ok, true); assert.equal(wr.data.balance.total, 30500, 'welcome 30,000 + D-LOGIN 500');
assert.equal((await c.claimWelcome()).error.code, ERR.ALREADY);
assert.ok(evs.some((e) => e.kind === 'welcome') && evs.some((e) => e.questId === 'D-LOGIN')); ok('welcome grant 20,000 + beta 10,000, first visit auto-complete +500, idempotent');

// travel → D-WALK10
c.dev.addWalkMinutes(7); let t = await c.getTravelToday(); assert.equal(t.minutes, 7); assert.equal(t.pendingBum, 7 * 172);
const r = c.dev.addWalkMinutes(3); assert.equal(r[0].questId, 'D-WALK10'); assert.equal(r[0].amount, 1000); assert.equal(r[0].coins, 8);
assert.equal((await c.getBalance()).total, 31500); ok('travel minutes → D-WALK10 reward +1,000 (coin burst event)');
for (let i = 0; i < 400; i++) await c.reportActivity({ kind: 'walk', seconds: 10, meters: 12 });
t = await c.getTravelToday(); assert.equal(t.minutes, 60); assert.equal(t.pendingBum, 10320); ok('daily travel cap 60 min / 10,320');

// free transit
const fq = await c.quoteFare({ mode: 'subway' }); assert.equal(fq.free, true); assert.equal(fq.amount, 0); assert.equal(fq.listAmount, 1550);
const sub = await c.payFare({ mode: 'subway', code: 'subway.base', rideId: 's1' }); assert.equal(sub.data.free, true); assert.equal(sub.data.balance.total, 31500 + 800 + 1000);
assert.deepEqual(sub.data.reward.map((e) => e.questId), ['D-SUB1', 'D-ALL3']); ok('free mode: subway not deducted, D-SUB1 + D-ALL3 still granted');
const dup = await c.payFare({ mode: 'subway', code: 'subway.base', rideId: 's1' }); assert.equal(dup.data.receiptId, sub.data.receiptId); ok('payFare idempotent per rideId');

// paid transit + insufficient
c.dev.setMode({ transitPaid: true, shopPaid: true });
const b0 = (await c.getBalance()).total;
const bus = await c.payFare({ mode: 'bus', code: 'bus.city', rideId: 'b1' }); assert.equal(bus.data.free, false); assert.equal(bus.data.amount, 1650); assert.equal(bus.data.balance.total, b0 - 1650);
c.dev.setBalance(900); const no = await c.payFare({ mode: 'bus', code: 'bus.city', rideId: 'b2' });
assert.equal(no.ok, false); assert.equal(no.error.code, ERR.INSUFFICIENT); assert.equal(no.error.shortBy, 750); assert.equal(no.error.need, 1650); assert.equal(no.error.balance, 900);
ok('paid mode: bus −1,650; insufficient → { code, need, balance, shortBy }');

// taxi hold/settle
assert.equal(taxiFare(5000), 7400); assert.equal(taxiFare(4600), 7100); assert.equal(taxiFare(2000), 5200); assert.equal(taxiFare(10000), 11300); assert.equal(taxiFare(5000, { night: true }), 9620); assert.equal(taxiFare(5000, { mult: 1.5 }), 11100);
c.dev.setBalance(30100);
const h = await c.holdTaxi({ code: 'taxi.drive', estimateMeters: 5000, rideId: 't1' }); assert.equal(h.data.amount, 7400); assert.equal(h.data.balance.total, 30100 - 7400);
const st = await c.settleTaxi({ holdId: h.data.holdId, actualMeters: 4600 }); assert.equal(st.data.charged, 7100); assert.equal(st.data.refunded, 300); assert.equal(st.data.balance.total, 23000 + 3000, 'W-TRANSIT (bus·subway·taxi) +3,000'); assert.equal(st.data.reward[0].questId, 'W-TRANSIT');
ok('taxi: fare formula, hold 7,400 → settle 7,100, refund 300 (one ledger row), W-TRANSIT weekly done');
c.dev.setBalance(23000);

// shop
const items = await c.listShopItems(); assert.equal(items[0].price, 160000); assert.equal(items[0].affordable, false);
const pu = await c.purchase('bike'); assert.equal(pu.error.code, ERR.INSUFFICIENT); assert.equal(pu.error.shortBy, 137000);
const goal = await c.getShopGoal(); assert.equal(goal.daysLeft, 16);
c.dev.setMode({ shopPaid: false }); const pf = await c.purchase('bike'); assert.equal(pf.ok, true); assert.equal(pf.data.free, true); assert.equal(pf.data.amount, 0); assert.equal((await c.getBalance()).total, 23000);
ok('shop: paid insufficient (16 days left), free beta purchase does not deduct');

// karma
const k = await c.getKarma(); assert.ok(['health', 'explore', 'transit', 'neighbor', 'streak'].every((a) => typeof k.axes[a].points === 'number')); assert.ok(k.axes.health.points >= 60);
c.dev.seed('day45'); const k45 = await c.getKarma(); assert.equal(k45.axes.health.points, 1240); assert.equal(k45.total, 1417); ok('karma 5 axes; day45 example total 1,417');

// day roll: travel settles once
c.dev.seed('fig03'); const before = (await c.getBalance()).total; clock += 86400e3;
const after = (await c.getBalance()).total; assert.equal(after - before, 7 * 172 + 500, 'move 1,204 + new day first visit 500'); ok('KST day roll settles travel reward once + resets dailies');
const led = await c.getLedger({ limit: 3 }); assert.ok(led.some((e) => e.kind === 'move'));
console.log(`econ mock: ${n} passed`);
