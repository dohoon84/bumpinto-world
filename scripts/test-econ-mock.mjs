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
assert.equal((await c.purchase('bike')).error.code, ERR.COMING_SOON); // 상점 미리보기: 게스트도 coming_soon
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
t = await c.getTravelToday(); assert.equal(t.minutes, 60); assert.equal(t.settled, true); assert.equal(t.pendingBum, 0);
{ const tv = evs.filter((e) => e.kind === 'travel'); assert.equal(tv.length, 1); assert.equal(tv[0].amount, 10320); assert.equal(tv[0].title.ko, '이동 보상 60분'); }
assert.equal((await c.getBalance()).total, 31500 + 10320); assert.equal((await c.getLedger()).filter((e) => e.kind === 'move').length, 1);
for (let i = 0; i < 30; i++) await c.reportActivity({ kind: 'walk', seconds: 10, meters: 12 });
assert.equal(evs.filter((e) => e.kind === 'travel').length, 1); ok('daily travel 60 min → paid at once: one move row 10,320 + reward kind travel, nothing more that day');

// free transit
const fq = await c.quoteFare({ mode: 'subway' }); assert.equal(fq.free, true); assert.equal(fq.amount, 0); assert.equal(fq.listAmount, 1550);
const sub = await c.payFare({ mode: 'subway', code: 'subway.base', rideId: 's1' }); assert.equal(sub.data.free, true); assert.equal(sub.data.balance.total, 31500 + 10320 + 800 + 1000);
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
const items = await c.listShopItems();
assert.deepEqual(items.map((i) => [i.id, i.price, i.realPrice]), [['bike', 160000, 320000], ['roadbike', 1000000, 2000000], ['scooter', 2500000, 4999000], ['car', 7450000, 14900000]]);
assert.ok(items.every((i) => i.available === false && i.comingSoon === true && i.free === false && i.affordable === false));
const goal = await c.getShopGoal(); assert.equal(goal.daysLeft, 16);
for (const mode of [{ shopPaid: true }, { shopPaid: false }]) {
  c.dev.setMode(mode);
  for (const i of items) { const r = await c.purchase(i.id); assert.deepEqual([r.ok, r.error.code], [false, ERR.COMING_SOON]); }
  assert.equal((await c.getBalance()).total, 23000, 'nothing deducted, nothing given');
}
assert.equal((await c.purchase('nope')).error.code, ERR.UNKNOWN);
assert.ok((await c.listShopItems()).every((i) => !i.owned));
ok('shop preview: 4 items with prices, all comingSoon, purchase always coming_soon (no free give-away)');

// karma
const k = await c.getKarma(); assert.ok(['health', 'explore', 'transit', 'neighbor', 'streak'].every((a) => typeof k.axes[a].points === 'number')); assert.ok(k.axes.health.points >= 60);
c.dev.seed('day45'); const k45 = await c.getKarma(); assert.equal(k45.axes.health.points, 1240); assert.equal(k45.total, 1417); ok('karma 5 axes; day45 example total 1,417');

// day roll: travel settles once
c.dev.seed('fig03'); const before = (await c.getBalance()).total; clock += 86400e3;
const after = (await c.getBalance()).total; assert.equal(after - before, 7 * 172 + 500, 'move 1,204 + new day first visit 500'); ok('KST day roll settles travel reward once + resets dailies');
const led = await c.getLedger({ limit: 3 }); assert.ok(led.some((e) => e.kind === 'move'));

// #30 서버 모양: 상점 available / not_eligible · 원장 'board' · TaxiHold.code · 웰컴 already_claimed
let rewards = 0; const off = c.on('reward', () => rewards++);
const b1 = (await c.getBalance()).total; const bp = c.dev.boardPost(1000); assert.equal(bp.kind, 'board'); assert.equal((await c.getBalance()).total, b1 + 1000); assert.equal(rewards, 1, 'board: ledger row + reward event kind board'); off?.();
assert.ok((await c.getLedger({ limit: 1 }))[0].kind === 'board');
const h2 = await c.holdTaxi({ code: 'taxi.drive', estimateMeters: 2000, rideId: 't2' }); assert.equal(h2.data.code, 'taxi.drive'); await c.cancelTaxi(h2.data.holdId);
const wc = await c.claimWelcome(); assert.equal(wc.ok, false); assert.equal(wc.error.code, ERR.ALREADY); assert.equal((await c.getWelcome()).claimed, true);
// 튜닝 v3 (#30 46a4b3b · 기획 v1)
const T3 = await import('../src/ui-v2/econ/mockClient.js');
assert.equal(T3.SHOP_ITEMS.find((i) => i.id === 'scooter').realPrice, 4999000);
assert.ok(T3.DAILY_POOL.includes('D-WALK20') && !T3.DAILY_POOL.includes('D-TAXI1'));
assert.equal(T3.FARE_TABLE['bus.long'].amount, 3200);
assert.equal(T3.movePerMinute('2026-12-31'), 172); assert.equal(T3.movePerMinute('2027-01-01'), 178);
const kk = await c.getKarma(); assert.deepEqual(kk.achievements.map((a) => [a.id, a.bonus]), [['ACH-WALK100', 5000], ['ACH-STREAK30', 10000]]);
assert.equal((await c.quoteFare({ mode: 'bus', code: 'bus.long' })).listAmount, 3200);
{ const m = new Map(); const c27 = T3.createMockClient({ storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }, now: () => Date.parse('2027-01-01T03:00:00Z') });
  c27.dev.signIn({ name: 't' }); c27.dev.addWalkMinutes(5); const t27 = await c27.getTravelToday(); assert.equal(t27.ratePerMin, 178); assert.equal(t27.pendingBum, 5 * 178); }
ok('tuning v3: scooter 4,999,000 · D-WALK20 in pool, no D-TAXI1 · achievements WALK100/STREAK30 only · bus.long 3,200 · 172→178 from 2027-01-01');
// v4 (#30 13a897f): 주간 W-PLACES 없음(합 18,000) · D-RIDE10 풀 · 이동 하루 1번(하루 몫 = min(60, 주 남은 분)) · 게시판 하루 1번 · config 필드
{ const m = new Map(); let ck = Date.UTC(2026, 10, 2, 1, 0, 0); /* 월요일 10:00 KST */ const cv = T3.createMockClient({ storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }, now: () => ck });
  const ev4 = []; cv.on('reward', (e) => ev4.push(e)); cv.dev.signIn({ name: 'v4' });
  const wk = await cv.listQuests('weekly'); assert.deepEqual(wk.quests.map((q) => q.id), ['W-WALK', 'W-DAYS', 'W-DAILY', 'W-TRANSIT']); assert.equal(wk.maxBum, 18000);
  assert.deepEqual(T3.DAILY_POOL, ['D-LOGIN', 'D-WALK10', 'D-WALK20', 'D-RIDE10', 'D-SUB1', 'D-BUS1']);
  const cfg = cv.dev.config(); assert.equal(cfg.move.payout, 'daily'); assert.deepEqual(cfg.rideLimits, { minGapSec: 30, dailyCounted: 40 }); assert.deepEqual(cfg.board, { reward: 1000, dailyRewards: 1, minChars: 40 });
  // 못 채운 날: 날짜가 바뀐 뒤 그날 인정분 그대로 1번
  cv.dev.addWalkMinutes(25); assert.equal(ev4.filter((e) => e.kind === 'travel').length, 0); assert.equal((await cv.getTravelToday()).pendingBum, 25 * 172);
  ck += 86400e3; await cv.getBalance(); let tvs = ev4.filter((e) => e.kind === 'travel'); assert.equal(tvs.length, 1); assert.equal(tvs[0].amount, 25 * 172);
  // 4일 × 60분 더 → 주 지급 265분, 남은 35분이 하루 몫
  for (let d = 0; d < 4; d++) { cv.dev.addWalkMinutes(60); ck += 86400e3; await cv.getBalance(); }
  assert.equal(ev4.filter((e) => e.kind === 'travel').length, 5);
  const r35 = cv.dev.addWalkMinutes(35); assert.equal(r35.find((e) => e.kind === 'travel')?.amount, 35 * 172, 'day target = min(60, week left 35)');
  assert.equal((await cv.getTravelToday()).settled, true); cv.dev.addWalkMinutes(20); assert.equal(ev4.filter((e) => e.kind === 'travel').length, 6);
  // 게시판 하루 1번
  const nb = () => ev4.filter((e) => e.kind === 'board').length; const lb = async () => (await cv.getLedger({ limit: 100 })).filter((e) => e.kind === 'board').length;
  assert.equal(cv.dev.boardPost().kind, 'board'); assert.equal(nb(), 1); assert.equal(cv.dev.boardPost(), null); assert.equal(cv.dev.boardPost(), null); assert.equal(nb(), 1); assert.equal(await lb(), 1);
  ck += 86400e3; assert.equal(cv.dev.boardPost().kind, 'board'); assert.equal(nb(), 2); assert.equal(await lb(), 2);
  // D-RIDE10
  const q = (await cv.listQuests('daily')); assert.ok(q.quests.every((x) => x.id !== 'D-RIDE10'), 'mock 배정은 LOGIN·WALK10·SUB1 그대로');
  ok('v4: weekly 18,000 without W-PLACES · D-RIDE10 in pool · travel paid once a day at min(60, week left) + kind travel · board once a day · config fields'); }
// 543f195: 유료 모드 게임 탑승 실패 → 'payment' PaymentFailed 1번, 직접 호출은 이벤트 없음
{ const m = new Map(); const cp = T3.createMockClient({ storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }, now: () => Date.UTC(2026, 10, 5, 3) });
  cp.dev.signIn({ name: 'p' }); cp.dev.setMode({ transitPaid: true, shopPaid: true }); cp.dev.setBalance(400); cp.dev.setServerRides(true); assert.equal(cp.dev.serverRides(), true);
  const pe = []; cp.on('payment', (e) => pe.push(e));
  const d1 = await cp.payFare({ mode: 'bus', code: 'bus.city', rideId: 'd1' }); assert.equal(d1.ok, false); assert.equal(pe.length, 0, 'direct call: no event');
  const g1 = await cp.dev.gameRide({ mode: 'bus', code: 'bus.city', rideId: 'g1' }); assert.equal(g1.ok, false); assert.equal(pe.length, 1);
  assert.deepEqual(pe[0], { status: 'insufficient', ok: false, receiptId: null, mode: 'bus', code: 'bus.city', rideId: 'g1', need: 1650, balance: 400, shortBy: 1250, error: g1.error });
  const g2 = await cp.dev.gameRide({ mode: 'taxi', code: 'taxi.drive', rideId: 'g2', meters: 5000 }); assert.equal(g2.ok, false); assert.equal(pe[1].status, 'insufficient'); assert.equal(pe[1].need, 7400); assert.equal((await cp.getBalance()).total, 400, 'no hold left');
  cp.dev.signOut(); const g3 = await cp.dev.gameRide({ mode: 'bus', rideId: 'g3' }); assert.equal(pe[2].status, 'failed'); assert.equal(pe[2].error.code, ERR.NOT_SIGNED_IN); assert.ok(!('need' in pe[2])); assert.equal(g3.ok, false);
  cp.dev.signIn({ name: 'p' }); cp.dev.setBalance(5000); const g4 = await cp.dev.gameRide({ mode: 'bus', rideId: 'g4' }); assert.equal(g4.ok, true); assert.ok(!('status' in pe.at(-1)) && pe.at(-1).receiptId);
  ok('paid game ride failure → one payment event PaymentFailed (insufficient/failed), direct call → Result only, success has no status'); }
ok('#30 shapes: ledger board + reward event, hold.code, welcome already_claimed');
{ // 07 = 게임 폰 교통카드 앱: 탑승 기록 + 원장 한 목록 (유료 요금은 같은 탑승 줄에 붙음, 지하철 등 기록 없는 요금은 따로)
  const { mergeHistory } = await import('../src/ui-v2/econ-ui/walletMerge.js');
  const t = 1_800_000_000_000, tx = (ko) => ({ ko, en: ko });
  const rides = [{ id: 'r1', mode: 'bus', route: '1303', at: t, end: t + 300e3 }, { id: 'r2', mode: 'taxi', route: 'TAXI', at: t + 900e3, end: t + 1200e3 }];
  const led = [{ id: 'f1', kind: 'fare', at: t + 5e3, delta: -1650, title: tx('시내버스 · 정자역') }, { id: 'f2', kind: 'fare', at: t + 1210e3, delta: -7100, title: tx('택시 · 일반 주행 4.6 km') },
    { id: 'f3', kind: 'fare', at: t + 600e3, delta: -1550, title: tx('지하철 · 정자역 기본요금') }, { id: 'q', kind: 'quest', at: t + 2000e3, delta: 500, title: tx('할 일') }, { id: 'old', kind: 'fare', at: t - 3600e3, delta: -1650, title: tx('시내버스') }];
  const m = mergeHistory(rides, led);
  assert.deepEqual(m.map((x) => (x.t === 'ride' ? `${x.r.id}:${x.fare?.id || '-'}` : x.e.id)), ['q', 'r2:f2', 'f3', 'r1:f1', 'old']);
  assert.deepEqual(mergeHistory(rides, []).map((x) => x.fare), [null, null]);
  ok('wallet app history: rides + ledger merged by date, paid fare attached to its ride (no duplicate row)'); }
{ // #30 44dcb3b 요금 줄 모양: rideId · mode · code · listAmount · charged · free, 무료 탑승 = delta 0 줄(id e{n})
  const cf = createMockClient({ storage: mem(), now }); cf.dev.signIn({ name: 'f' });
  const b0 = (await cf.getBalance()).total;
  await cf.payFare({ mode: 'bus', code: 'bus.city', rideId: 'bus-111' }); await cf.payFare({ mode: 'bus', code: 'bus.city', rideId: 'bus-111' });
  const fr = (await cf.getLedger()).filter((e) => e.kind === 'fare');
  assert.equal(fr.length, 1, 'same rideId twice = one row');
  assert.deepEqual({ ...fr[0], id: fr[0].id.replace(/\d+$/, 'N'), at: 0, title: 0, sub: 0 }, { id: 'eN', at: 0, kind: 'fare', delta: 0, title: 0, sub: 0, rideId: 'bus-111', mode: 'bus', code: 'bus.city', listAmount: 1650, charged: 0, free: true });
  assert.equal((await cf.getBalance()).total, b0, 'free ride: balance unchanged');
  cf.dev.setMode({ transitPaid: true }); cf.dev.setBalance(20000);
  await cf.payFare({ mode: 'subway', code: 'subway.base', rideId: 'sub-9' });
  const h = await cf.holdTaxi({ code: 'taxi.drive', estimateMeters: 3000, rideId: 'taxi-222' }); const st = await cf.settleTaxi({ holdId: h.data.holdId, actualMeters: 2500 });
  const L = (await cf.getLedger()).filter((e) => e.kind === 'fare' && e.rideId);
  const sub = L.find((e) => e.rideId === 'sub-9'), tx = L.find((e) => e.rideId === 'taxi-222');
  assert.equal(sub.delta, -1550); assert.equal(sub.charged, 1550); assert.equal(sub.free, false); assert.equal(sub.mode, 'subway'); assert.equal(sub.listAmount, 1550);
  assert.equal(tx.mode, 'taxi'); assert.equal(tx.code, 'taxi.drive'); assert.equal(tx.charged, st.data.charged); assert.equal(tx.delta, -st.data.charged); assert.equal(tx.free, false);
  ok('fare ledger rows carry rideId/mode/code/listAmount/charged/free; free ride = delta 0 row e{n}, idempotent by rideId'); }
{ // 교통카드 앱: rideId 먼저, rideId 없는 줄만 ±2분
  const { mergeHistory, rideKeys } = await import('../src/ui-v2/econ-ui/walletMerge.js');
  const t = 1_800_000_000_000, tx = (ko) => ({ ko, en: ko });
  const A = { id: 'a', mode: 'bus', route: '220', at: t, end: t + 120e3 }, B = { id: 'b', mode: 'bus', route: '1303', at: t + 60e3, end: t + 200e3, fare: { receiptId: 'rc-B' } }, X = { id: 'x', mode: 'taxi', route: 'TAXI', at: t - 3600e3, end: t - 3300e3 };
  assert.deepEqual(rideKeys(B), ['rc-B', `bus-${B.at}`, 'b']); assert.deepEqual(rideKeys(X), [`taxi-${X.at}`, 'x']);
  const led = [
    { id: 'f1', kind: 'fare', at: t + 10e3, delta: -1650, title: tx('시내버스'), rideId: 'rc-B', mode: 'bus' }, // A 시간대지만 rideId 는 B
    { id: 'e7', kind: 'fare', at: t + 5000e3, delta: 0, free: true, title: tx('택시'), rideId: `taxi-${X.at}`, mode: 'taxi' }, // 시간은 멀어도 rideId 로
    { id: 'f2', kind: 'fare', at: t + 30e3, delta: -1650, title: tx('시내버스') }, // rideId 없음 → A 에 시간으로
    { id: 'f3', kind: 'fare', at: t + 20e3, delta: -1650, title: tx('시내버스'), rideId: 'bus-nope', mode: 'bus' }, // 맞는 탑승 없음 → 시간으로 붙이지 않고 따로
  ];
  const m = mergeHistory([A, B, X], led);
  const byRide = Object.fromEntries(m.filter((x) => x.t === 'ride').map((x) => [x.r.id, `${x.fare?.id || '-'}/${x.by || '-'}`]));
  assert.deepEqual(byRide, { a: 'f2/time', b: 'f1/rideId', x: 'e7/rideId' });
  assert.deepEqual(m.filter((x) => x.t === 'led').map((x) => x.e.id), ['f3']);
  ok('wallet merge: rideId first (bus receiptId/bus-{at}, taxi-{at}), ±2 min only for rows without rideId, free 0 rows attach'); }
{ // 보상 코인 효과음: 겹침 방지 400 ms · 이동/게시판은 짧고 작게 · 음소거/볼륨 0/효과음 끔이면 안 울림
  const { coinPlan, THROTTLE_MS, loudness } = await import('../src/ui-v2/econ-ui/coinPlan.js');
  const full = coinPlan('quest', { now: 1000 }); assert.equal(full.play, true); assert.equal(full.short, false); assert.equal(full.dur, null); assert.equal(full.gain, 0.6);
  const sh = coinPlan('travel', { now: 1000 }); assert.equal(sh.short, true); assert.equal(sh.dur, 0.6); assert.ok(sh.gain < full.gain); assert.equal(coinPlan('board', { now: 0 }).short, true);
  assert.equal(coinPlan('achievement', { now: 1000, lastAt: 1000 - THROTTLE_MS + 1 }).why, 'throttled'); assert.equal(coinPlan('welcome', { now: 1000, lastAt: 1000 - THROTTLE_MS }).play, true);
  assert.equal(coinPlan('quest', { now: 0, level: { muted: true, volume: 1 } }).why, 'muted'); assert.equal(coinPlan('quest', { now: 0, level: { muted: false, volume: 0 } }).why, 'muted');
  assert.equal(coinPlan('quest', { now: 0, sfxOff: true }).why, 'sfx-off'); assert.equal(coinPlan('quest', { now: 0, level: { muted: false, volume: 0.5 } }).gain, +(loudness(0.5) * 0.6).toFixed(3));
  ok('reward coin sound plan: 400 ms throttle, travel/board short+quieter, respects mute/volume/sfx-off'); }
console.log(`econ mock: ${n} passed`);
