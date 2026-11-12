import {
  CAP_DAY, CAP_MONTH, CAP_WEEK, DAILY_BUM, LIMIT_MSG, OPENING_MS, PART_BUM,
  attemptCap, bestScore, boardView, dailyRankPays, decideAttempt, kstDayKey,
  monthlyAnnounceMs, monthlyPays, participationPay, payOnce, pointRows, rankRows, titleHistoryLabel, weekKey, weekPeriodLabel, weeklyPays, WEEKLY_TITLES,
} from '../server/phone/src/bump24/rules.js';

const assert = (c, m) => { if (!c) throw new Error(m); };
assert(CAP_DAY === 1200, `day cap ${CAP_DAY}`);
assert(CAP_WEEK === 11400, `week cap ${CAP_WEEK}`);
assert(CAP_MONTH === 58000, `month cap ${CAP_MONTH}`);
assert(attemptCap(true) === 1 && attemptCap(false) === 5, 'attempt caps');

const before = OPENING_MS - 1000, open = OPENING_MS + 1000;
assert(kstDayKey(OPENING_MS - 1) === '2026-11-08', kstDayKey(OPENING_MS - 1));
assert(kstDayKey(OPENING_MS) === '2026-11-09', 'opening day');
assert(kstDayKey(Date.parse('2026-11-09T14:59:59Z')) === '2026-11-09', 'still the 9th before KST midnight');
assert(kstDayKey(Date.parse('2026-11-09T15:00:00Z')) === '2026-11-10', 'KST midnight rolls the day');
assert(decideAttempt({ now: before, guest: true, used: 0 }).beforeOpen, 'no records before opening');
assert(decideAttempt({ now: open, guest: true, used: 0 }).record, 'guest first attempt');
assert(decideAttempt({ now: open, guest: true, used: 1 }).message === LIMIT_MSG, 'guest second is practice');
assert(!decideAttempt({ now: open, guest: false, used: 4 }).usedUp && decideAttempt({ now: open, guest: false, used: 5 }).usedUp, 'account 5');
assert(decideAttempt({ now: open, guest: false, used: 0, practice: true }).practice && !decideAttempt({ now: open, practice: true }).record, 'practice never records');

assert(bestScore(null, 10) === 10 && bestScore(10, 8) === 10 && bestScore(10, 12) === 12, 'best of day');
const ranked = rankRows([
  { playerKey: 'g:a', name: '손님', score: 90, at: 2, guest: true },
  { playerKey: 'a:u', accountId: 'u', name: '회원', score: 80, at: 1, guest: false },
]);
assert(ranked[0].rank === 1 && ranked[0].guest && ranked[1].rank === 2, 'guest keeps 1st');

const day = '2026-11-09';
const accounts = [1, 2, 3, 4].map((n) => ({ playerKey: `a:${n}`, accountId: String(n), name: `p${n}`, score: 50 - n, at: n, guest: false }));
const guestFirst = { playerKey: 'g:a', name: '손님', score: 90, at: 1, guest: true };
const pays = dailyRankPays([{ storeId: 's', day, participants: 5, rows: rankRows([guestFirst, ...accounts]) }]);
assert(pays.every((p) => p.accountId !== undefined && !String(p.key).includes('g:')), 'guest not paid');
assert(!pays.some((p) => p.rank === 1), '1st is the guest so no 1st payout');
assert(pays.find((p) => p.rank === 2)?.amount === DAILY_BUM[1], '2nd stays 2nd');
assert(dailyRankPays([{ storeId: 's', day, participants: 4, rows: rankRows([guestFirst, ...accounts]) }]).length === 0, 'under 5 participants');

const many = [];
for (let i = 0; i < 6; i++) many.push({ storeId: `s${i}`, day, participants: 5, rows: [{ rank: 1, accountId: 'hero', guest: false, name: 'h' }] });
const capped = dailyRankPays(many);
assert(capped.length === 5 && capped.every((p) => p.amount === 200), `5 store cap ${capped.length}`);
assert(!participationPay({ accountId: 'u', day, storeId: 's', storesAlready: 10 }), '10 store participation cap');
assert(participationPay({ accountId: 'u', day, storeId: 's', storesAlready: 9 }).amount === PART_BUM, '9th store pays');
assert(!participationPay({ accountId: null, day, storeId: 's', storesAlready: 0 }), 'guest participation skipped');

const points = pointRows([
  { playerKey: 'a:u', accountId: 'u', name: '회원', rank: 1, participants: 5 },
  { playerKey: 'g:a', guest: true, name: '손님', rank: 1, participants: 5 },
  { playerKey: 'a:u', accountId: 'u', name: '회원', rank: 2, participants: 5 },
]);
assert(points.find((p) => p.accountId === 'u').points === 5 && points.find((p) => p.guest).points === 3, 'guest points count, user sums');
const wk = weeklyPays(points, '2026-11-09');
assert(wk.length === 1 && wk[0].accountId === 'u' && wk[0].title === 'title_bigspender', 'weekly skips guest, 1st gets 편의점 큰손');
const three = weeklyPays([
  { rank: 1, accountId: 'a', guest: false, name: 'A' },
  { rank: 2, accountId: 'b', guest: false, name: 'B' },
  { rank: 3, accountId: 'c', guest: false, name: 'C' },
  { rank: 4, accountId: 'd', guest: false, name: 'D' },
  { rank: 1, accountId: null, guest: true, name: '손님' },
], '2026-11-09');
assert(three.find((p) => p.accountId === 'a').title === WEEKLY_TITLES[1].id, '1 편의점 큰손');
assert(three.find((p) => p.accountId === 'b').title === WEEKLY_TITLES[2].id, '2 플렉스 단골');
assert(three.find((p) => p.accountId === 'c').title === WEEKLY_TITLES[3].id, '3 1+1 사냥꾼');
assert(three.find((p) => p.accountId === 'd').title == null, '4th has no title');
assert(!three.some((p) => p.guest || !p.accountId), 'guest not paid weekly');
assert(weekPeriodLabel('2026-11-09') === '11월 2주차', weekPeriodLabel('2026-11-09'));
assert(titleHistoryLabel('2026-11-09', 'title_bigspender') === '11월 2주차 편의점 큰손', 'history label');
const mo = monthlyPays(points, '2026-11');
assert(mo[0].amount === 10000, 'monthly 1st');
assert(new Date(monthlyAnnounceMs(2026, 11) + 9 * 3600e3).toISOString().slice(0, 10) === '2026-12-07', 'first monthly announce');
assert(boardView(monthlyAnnounceMs(2026, 11)) === 'monthly', 'Dec 7 shows monthly');
assert(boardView(Date.parse('2026-11-15T15:00:00Z')) === 'weekly', 'a later Monday is weekly');
assert(weekKey(Date.parse('2026-11-15T15:00:00Z')) === '2026-11-16', 'Sunday midnight starts next week key for the day that just ended?');

const seen = new Set();
const batch = [{ key: 'bp24:part:d:s:u', accountId: 'u', amount: 20 }, { key: 'bp24:part:d:s:u', accountId: 'u', amount: 20 }];
assert(payOnce(seen, batch).length === 1, 'first settlement pays');
assert(payOnce(seen, batch).length === 0, 'second settlement pays nothing');

console.log('bp24 rank ok', { CAP_DAY, CAP_WEEK, CAP_MONTH });
