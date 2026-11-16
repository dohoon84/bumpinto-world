// node scripts/test-bp24-board-units.mjs — 주간/월간 포디움은 '점', 어제 폴백은 '원'
import assert from 'node:assert/strict';
import { boardUnit, isPodiumTab, locLabel, payoutLine } from '../src/bump24game/rankClient.js';
import { WEEKLY_BUM, WEEKLY_REST, MONTHLY_BUM, MONTHLY_REST } from '../server/phone/src/bump24/rules.js';

assert.equal(isPodiumTab({ view: 'weekly', tab: '이번 주' }), true);
assert.equal(isPodiumTab({ view: 'monthly', tab: '이달' }), true);
assert.equal(isPodiumTab({ view: 'weekly', tab: '어제' }), false, 'Monday without podium stays yesterday scores');
assert.equal(isPodiumTab({ view: 'yesterday', tab: '어제' }), false);
assert.equal(isPodiumTab(null), false);
assert.equal(isPodiumTab({ view: 'weekly' }), false, 'view alone is not enough');

assert.equal(boardUnit({ tab: '이번 주' }, 'week'), '점');
assert.equal(boardUnit({ tab: '이달' }, 'week'), '점');
assert.equal(boardUnit({ tab: '이번 주' }, 'today'), '원', 'today tab stays 원');
assert.equal(boardUnit({ view: 'weekly', tab: '어제' }, 'week'), '원', 'yesterday fallback stays 원');
assert.equal(boardUnit(null, 'week'), '원');
assert.equal(boardUnit({ tab: '어제' }, 'today'), '원');

assert.equal(locLabel({ tab: '이번 주' }, 'week'), '지난주 정산 순위');
assert.equal(locLabel({ tab: '이달' }, 'week'), '지난달 정산 순위');
assert.equal(locLabel({ view: 'weekly', tab: '어제' }, 'week'), '어제 랭킹');
assert.equal(locLabel({ tab: '이번 주' }, 'today', '오늘 랭킹'), '오늘 랭킹');
assert.equal(locLabel(null, 'today', '오늘 랭킹'), '오늘 랭킹');

const weekPay = payoutLine({ tab: '이번 주' });
assert.equal(weekPay, `1위 ${WEEKLY_BUM[0].toLocaleString('ko-KR')} · 2위 ${WEEKLY_BUM[1].toLocaleString('ko-KR')} · 3위 ${WEEKLY_BUM[2].toLocaleString('ko-KR')} · 4~10위 ${WEEKLY_REST.toLocaleString('ko-KR')} bum`);
assert.match(weekPay, /3,000/);
assert.match(weekPay, /500 bum$/);
const monthPay = payoutLine({ tab: '이달' });
assert.equal(monthPay, `1위 ${MONTHLY_BUM[0].toLocaleString('ko-KR')} · 2위 ${MONTHLY_BUM[1].toLocaleString('ko-KR')} · 3위 ${MONTHLY_BUM[2].toLocaleString('ko-KR')} · 4~10위 ${MONTHLY_REST.toLocaleString('ko-KR')} bum`);
assert.match(monthPay, /10,000/);
assert.equal(payoutLine({ tab: '어제' }), '');
assert.equal(payoutLine({ view: 'weekly', tab: '어제' }), '');
assert.equal(payoutLine(null), '');

console.log('bp24 board units ok');
