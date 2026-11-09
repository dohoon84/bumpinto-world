// [arcade] 범핑팡 엔진 · 월간 보상 규칙 단위 테스트
import {
  COLS, ROWS, PLAY_SEC, createBoard, makeRng, trySwap, findMatches, hasMoves, scoreFor, areAdjacent, specialCells,
  gaugeNeed, timeDrainPerSec, gaugeFill, scoreMult, starsForLevel, plausibleRun,
} from '../src/arcade/bumpingpang/engine.js';
import { plausibleArcadeRun } from '../server/phone/src/arcade/rules.js';
import {
  attemptCap, decideAttempt, monthlyBestPays, rankRows, MONTHLY_BUM, LIMIT_MSG, TITLE, OPENING_MS,
} from '../server/phone/src/arcade/rules.js';
import { arcadeEnabled, arcadeAtSpot, ARCADE_AT } from '../src/arcade/flag.js';
import { arcadePlacement } from '../src/arcade/locations.js';

const assert = (c, m) => { if (!c) throw new Error(m); };

assert(arcadeEnabled(''), 'default on');
assert(arcadeEnabled('?arcade=1'), 'explicit on');
assert(!arcadeEnabled('?arcade=0'), 'opt-out');
assert(arcadeAtSpot(ARCADE_AT)?.x === 1326.75, 'spawn x');
assert(arcadePlacement().match.z === -2076.5, 'building match z');
assert(arcadePlacement().name.includes('오락실'), 'our brand name');

assert(COLS === 8 && ROWS === 8, 'board size');
const rng = makeRng(42);
const board = createBoard(rng);
assert(board.length === ROWS && board[0].length === COLS, 'createBoard dims');
assert(findMatches(board).matched.length === 0, 'no initial matches');

// force a horizontal match of 3
board[3][3] = { id: 'bum', special: null };
board[3][4] = { id: 'bum', special: null };
board[3][5] = { id: 'coin', special: null };
board[2][5] = { id: 'bum', special: null };
const res = trySwap(board, { r: 2, c: 5 }, { r: 3, c: 5 }, rng);
assert(res.ok, 'swap creates match');
assert(res.score > 0, 'score positive');
assert(res.maxCombo >= 1, 'combo at least 1');

assert(scoreFor(3, 1) === 30, `base score ${scoreFor(3, 1)}`);
assert(scoreFor(3, 2) === 45, 'combo mult');
assert(areAdjacent({ r: 0, c: 0 }, { r: 0, c: 1 }) && !areAdjacent({ r: 0, c: 0 }, { r: 1, c: 1 }), 'adjacent');

const b2 = createBoard(makeRng(7));
assert(typeof hasMoves(b2) === 'boolean', 'hasMoves runs');

// special blast
b2[1][1] = { id: 'bum', special: 'bomb' };
assert(specialCells(b2, 1, 1).length >= 9, 'bomb radius');

assert(attemptCap(true) === 1 && attemptCap(false) === 5, 'attempt caps');
const open = OPENING_MS + 1000;
assert(decideAttempt({ now: open, guest: true, used: 0 }).record, 'guest first');
assert(decideAttempt({ now: open, guest: true, used: 1 }).message === LIMIT_MSG, 'guest capped');
assert(decideAttempt({ now: open, guest: false, used: 0, practice: true }).practice, 'practice');

const rows = rankRows([
  { playerKey: 'a:1', accountId: '1', name: '일등', score: 9000, at: 1, guest: false },
  { playerKey: 'a:2', accountId: '2', name: '이등', score: 8000, at: 2, guest: false },
  { playerKey: 'a:3', accountId: '3', name: '삼등', score: 7000, at: 3, guest: false },
  { playerKey: 'g:x', name: '손님', score: 9500, at: 0, guest: true },
  { playerKey: 'a:4', accountId: '4', name: '사등', score: 6000, at: 4, guest: false },
]);
const pays = monthlyBestPays(rows, '2026-11');
// 게스트가 1등이면 지급은 계정 2·3등만 (월간 1·2·3 슬롯 중 게스트 제외)
assert(pays.length === 2, `guest 1st → 2 pays got ${pays.length}`);
assert(pays[0].amount === MONTHLY_BUM[1] && pays[1].amount === MONTHLY_BUM[2], '2nd/3rd amounts');
assert(pays.every((p) => p.rank <= 3 && p.accountId), 'no guest pay');
assert(!pays.some((p) => p.kind === 'part' || p.kind === 'daily'), 'no part/daily');
const clean = monthlyBestPays(rankRows([
  { playerKey: 'a:1', accountId: '1', name: '일등', score: 9000, at: 1, guest: false },
  { playerKey: 'a:2', accountId: '2', name: '이등', score: 8000, at: 2, guest: false },
  { playerKey: 'a:3', accountId: '3', name: '삼등', score: 7000, at: 3, guest: false },
]), '2026-11');
assert(clean.length === 3 && clean[0].title === TITLE && clean[0].amount === MONTHLY_BUM[0], 'clean podium');


// invalid swap restores board and stays interactive (no lock in engine)
{
  const b = createBoard(makeRng(123));
  const snap = b.map((row) => row.map((c) => (c ? { ...c } : null)));
  let denied = null;
  for (let r = 0; r < ROWS && !denied; r++) for (let c = 0; c < COLS - 1; c++) {
    const res = trySwap(b, { r, c }, { r, c: c + 1 }, makeRng(1));
    if (!res.ok) { denied = { r, c, res }; break; }
    // restore if somehow matched
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) b[rr][cc] = snap[rr][cc] ? { ...snap[rr][cc] } : null;
  }
  assert(denied && denied.res.ok === false, 'found invalid swap');
  for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
    const a = snap[rr][cc], x = b[rr][cc];
    assert(!!a === !!x && a?.id === x?.id, 'invalid swap restored');
  }
  assert(hasMoves(b) || !hasMoves(b), 'board still queryable after deny');
}


// —— 레벨 모드 튜닝·타당성 ——
assert(PLAY_SEC === 30, 'time bar capacity 30s');
assert(gaugeNeed(1) === 90, `gauge L1 ${gaugeNeed(1)}`);
assert(gaugeNeed(5) > gaugeNeed(1), 'gauge grows');
assert(timeDrainPerSec(1) === 1, 'drain L1');
assert(timeDrainPerSec(10) > timeDrainPerSec(1), 'drain grows');
assert(gaugeFill(3, 1, 0) >= 20, 'fill basic');
assert(gaugeFill(6, 3, 1) > gaugeFill(3, 1, 0), 'fill combo/special bonus');
assert(scoreMult(5) > 1, 'score mult');
assert(scoreFor(3, 1, 5) > scoreFor(3, 1, 1), 'level score bump');
assert(starsForLevel(3) === 1 && starsForLevel(7) === 2 && starsForLevel(12) === 3, 'stars by level');
assert(starsForLevel(1) === 0, 'no star early');
{
  const bad = plausibleRun({ score: 80000, level: 10, durationMs: 3000 });
  assert(!bad.ok, 'reject too-fast high score');
  const good = plausibleRun({ score: 9000, level: 8, durationMs: 150000 });
  assert(good.ok, 'accept decent run');
  const srv = plausibleArcadeRun({ score: 9000, level: 8, durationMs: 150000 });
  assert(srv.ok, 'server plausibility matches');
}
// trySwap with level mult
{
  const b = createBoard(makeRng(42));
  b[3][3] = { id: 'bum', special: null };
  b[3][4] = { id: 'bum', special: null };
  b[3][5] = { id: 'coin', special: null };
  b[2][5] = { id: 'bum', special: null };
  const r1 = trySwap(b.map((row) => row.map((c) => (c ? { ...c } : null))), { r: 2, c: 5 }, { r: 3, c: 5 }, makeRng(1), 1);
  const r5 = trySwap(b.map((row) => row.map((c) => (c ? { ...c } : null))), { r: 2, c: 5 }, { r: 3, c: 5 }, makeRng(1), 5);
  assert(r1.ok && r5.ok, 'level trySwap ok');
  assert(r5.score >= r1.score, 'higher level ≥ score');
  assert(r1.gauge > 0, 'gauge fill returned');
}

console.log('ok arcade-pang', { scoreSample: res.score, pays: pays.map((p) => p.amount) });
