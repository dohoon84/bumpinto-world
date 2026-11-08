// node scripts/test-fare-pop.mjs — 개찰구 요금은 한 탑승에 한 번, 문구는 가운데 팝.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setLang } from '../src/i18n.js';
import { claimInflightPayment, decideSubwayFare, fareCardOn, farePopParts, resetSubwayFare, takeSubwayTap } from '../src/ui-v2/econ-ui/farePop.js';

let n = 0;
const ok = (t) => { n++; console.log('ok', t); };
setLang('ko');

assert.equal(fareCardOn(''), false);
assert.equal(fareCardOn('?ui=v2'), false);
assert.equal(fareCardOn('?farecard=0'), false);
assert.equal(fareCardOn('?ui=v2&farecard=1&demo=econ'), true);
ok('?farecard=1 만 예전 카드');

// 승차 한 번 → 하차(탑승이 1분을 넘겨도) → 같은 방문의 다시 들어오기는 무시. 역 밖으로 나가면 새 탑승.
const t0 = 1_700_000_000_000;
const enter = decideSubwayFare({ gate: 'in', inside: true }, { rideId: null, at: 0 }, t0);
assert.equal(enter.action, 'pay'); assert.equal(enter.reason, 'entry');
assert.equal(enter.rideId, `sub-${Math.floor(t0 / 60000)}`, '내역 맞춤용 sub-{분}');
const exit = decideSubwayFare({ gate: 'out', inside: true }, enter.state, t0 + 90_000);
assert.equal(exit.action, 'ignore'); assert.equal(exit.reason, 'exit-included'); assert.equal(exit.rideId, enter.rideId);
const again = decideSubwayFare({ gate: 'in', inside: true }, exit.state, t0 + 95_000);
assert.equal(again.action, 'ignore'); assert.equal(again.reason, 'same-ride');
const left = decideSubwayFare({ gate: 'in', inside: false }, again.state, t0 + 100_000);
assert.equal(left.action, 'pay'); assert.notEqual(left.rideId, enter.rideId);
ok('한 방문에 요금 한 번, 하차 태그는 포함, 나가면 새 탑승');

// 게임 훅이 쓰는 모듈 상태도 같다.
resetSubwayFare();
const a = takeSubwayTap({ gate: 'in', inside: true }, t0);
const b = takeSubwayTap({ gate: 'out', inside: true }, t0 + 120_000);
assert.equal(a.action, 'pay'); assert.equal(b.action, 'ignore');
resetSubwayFare();
const c = takeSubwayTap({ gate: 'in', inside: true }, t0 + 130_000);
assert.equal(c.action, 'pay'); assert.notEqual(c.rideId, a.rideId);
ok('takeSubwayTap: 하차 무시, 방문이 끝나면 다시 결제');

// payFare 는 payment 를 낸 다음 afterWrite 를 기다린다. 300ms 타임아웃보다 늦으면
// 예전에 이벤트 경로가 카드를 먼저 그리고, payAndShow 가 한 번 더 그렸다.
// 지금 결제 중이면 emit 순간에 영수증을 찍어 두고 화면은 그리지 않는다.
const shown = new Set();
const modes = new Set(['subway']);
assert.equal(claimInflightPayment({ ok: true, mode: 'subway', receiptId: 'r1' }, modes, shown), 'claimed');
assert.ok(shown.has('r1'));
assert.equal(claimInflightPayment({ ok: true, mode: 'bus', receiptId: 'r2' }, modes, shown), 'defer');
assert.equal(shown.has('r2'), false);
assert.equal(claimInflightPayment({ ok: false, status: 'insufficient', mode: 'subway', receiptId: null }, modes, shown), 'skip');
ok('직접 결제 중인 지하철 payment 는 두 번째 화면을 만들지 않음');

const free = farePopParts({ free: true, amount: 0, listAmount: 1550, balance: { guest: false, total: 27960 }, reward: [{ amount: 800 }] });
assert.equal(free.free, true);
assert.equal(free.listText, '1,550');
assert.equal(free.freeLabel, '무료(베타)');
assert.deepEqual(free.rewards, ['교통 +5', '+800']);
const paid = farePopParts({ free: false, amount: 1550, listAmount: 1550, balance: { guest: false, total: 1000 }, reward: [] });
assert.equal(paid.free, false);
assert.equal(paid.paidText, '−1,550 bum');
assert.deepEqual(paid.rewards, ['교통 +5']);
const guest = farePopParts({ free: true, amount: 0, listAmount: 1550, balance: { guest: true, total: 0 }, reward: [] });
assert.deepEqual(guest.rewards, []);
setLang('en');
const en = farePopParts({ free: true, amount: 0, listAmount: 1550, balance: { guest: false, total: 1 }, reward: [] });
assert.equal(en.freeLabel, 'Free (Beta)');
assert.deepEqual(en.rewards, ['Transit +5']);
setLang('ko');
ok('무료(베타)는 정가 → 무료, 로그인은 교통 +5, EN 문구');

const css = fs.readFileSync(new URL('../src/ui-v2/econ-ui/econ-ui.css', import.meta.url), 'utf8');
assert.match(css, /\.ve-farepop \{[^}]*pointer-events:\s*none/);
assert.match(css, /animation:\s*ve-farepop 1s/);
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /animation-name:\s*ve-farepop-fade/);
assert.match(css, /#ffe169|var\(--v2-gold\)/);
ok('팝은 1초, 클릭 없음, 움직임 줄이기면 페이드, 골드');

console.log(`\n${n} fare-pop checks passed`);
