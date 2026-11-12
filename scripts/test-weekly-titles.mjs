// node scripts/test-weekly-titles.mjs — 주간 칭호 규칙·평가·D1 저장 (네트워크 없음)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { titlesEnabled, titlePreviewEarn, titlePreviewId } from '../src/titles/flag.js';
import { composeTitle, earnDuration, langPack, restQuadCount, sfxCues } from '../src/titles/eval.js';
import { awardWeeklyTitles, loadTitles, markTitleSeen, titlePublic } from '../server/phone/src/bump24/titles.js';
import { settleWeek, daysOfWeek } from '../server/phone/src/bump24/db.js';
import { WEEKLY_TITLES, titleHistoryLabel, weekPeriodLabel } from '../server/phone/src/bump24/rules.js';

let n = 0;
const ok = (m) => { n++; console.log('  ok', n, m); };

// flags
assert.equal(titlesEnabled(''), true);
assert.equal(titlesEnabled('?titles=0'), false);
assert.equal(titlesEnabled('?titles=1'), true);
assert.equal(titlePreviewId('?titlePreview=1'), 'title_bigspender');
assert.equal(titlePreviewId('?titlePreview=flexregular'), 'title_flexregular');
assert.equal(titlePreviewId('?titleDemo=3'), 'title_bogohunter');
assert.equal(titlePreviewEarn('?titlePreview=1'), true);
assert.equal(titlePreviewEarn('?titlePreview=1&titleEarn=0'), false);
assert.equal(titlePreviewId(''), null);
ok('flags: default on, ?titles=0 off, preview ids');

assert.equal(weekPeriodLabel('2026-11-02'), '11월 1주차');
assert.equal(weekPeriodLabel('2026-11-09'), '11월 2주차');
assert.equal(titleHistoryLabel('2026-11-09', 'title_flexregular', 'ko'), '11월 2주차 플렉스 단골');
ok('week period labels');

const atlas = JSON.parse(readFileSync(new URL('../src/titles/assets/atlas.json', import.meta.url), 'utf8'));
assert.equal(Object.keys(atlas.sprites).length, 33, '33 sprites');
assert.ok(atlas.titles.title_bigspender && atlas.titles.title_flexregular && atlas.titles.title_bogohunter);

for (const [id, expectRest, expectEarn] of [
  ['title_bigspender', 6, 25],
  ['title_flexregular', 5, 19],
  ['title_bogohunter', 4, 15],
]) {
  for (const lang of ['ko', 'en']) {
    const pack = langPack(atlas, id, lang);
    assert.ok(pack, `${id} ${lang}`);
    assert.equal(restQuadCount(pack), expectRest, `${id} ${lang} rest`);
    let restMax = 0;
    for (let t = 0; t <= 3000; t += 50) restMax = Math.max(restMax, composeTitle(pack, 'rest', t, { phase: 0 }).length);
    assert.equal(restMax, expectRest, `${id} ${lang} rest compose peak ${restMax}`);
    const reducedRest = composeTitle(pack, 'rest', 0, { phase: 0, reducedRest: true });
    assert.ok(reducedRest.every((q) => !/^shine$|^spark/.test(q.id)), `${id} reduced rest hides shine/spark`);
    const lite = composeTitle(pack, 'restLite', 0);
    assert.equal(lite.length, 2, `${id} lite is pill+medal`);
    const dur = earnDuration(pack, false);
    const ids = new Set();
    let max = 0;
    for (let t = 0; t <= dur; t += 10) {
      const qs = composeTitle(pack, 'earn', t);
      max = Math.max(max, qs.length);
      for (const q of qs) ids.add(q.id);
    }
    assert.equal(ids.size, expectEarn, `${id} ${lang} earn unique ${ids.size} != ${expectEarn}`);
    assert.ok(max <= expectEarn, `${id} ${lang} earn simultaneous ${max} > ${expectEarn}`);
    assert.equal(pack.earn.animOnlyQuadCount, expectEarn - expectRest, `${id} animOnly`);
    const red = composeTitle(pack, 'reduced', 200);
    assert.ok(red.length <= 4, `${id} reduced Motion few quads`);
    const cues = sfxCues(pack, false);
    assert.ok(cues.some((c) => /fanfare/.test(c.id || c.file)), `${id} has fanfare`);
  }
}
ok('atlas eval: rest 6/5/4, earn peak 25/19/15, reduced, sfx cues');

// 불투명 픽셀 기준 가장 낮은 점은 디자인 검증에서 +3.40pt(메달 그림자).
// 쿼드 AABB 는 알약 스프라이트 여백 때문에 +6 까지 내려가지만, 그 아래는 투명하다.
function medalRestBottom(id) {
  const pack = langPack(atlas, id, 'ko');
  const medal = pack.rest.quads.find((q) => q.id === 'medal');
  const spr = atlas.sprites[medal.sprite];
  return medal.pos[1] + (spr.sizePt[1] - spr.pivotPt[1]);
}
for (const id of ['title_bigspender', 'title_flexregular', 'title_bogohunter']) {
  const b = medalRestBottom(id);
  assert.ok(b <= 4.05, `${id} medal rest bottom ${b}`);
}
ok('medal rest bottom stays around the +4pt label gap');

// D1 award / load / seen / settleWeek
function d1Of(db) {
  const isReader = (q) => /^\s*(SELECT|WITH|PRAGMA)/i.test(q) || /\bRETURNING\b/i.test(q);
  const exec1 = (q, params) => {
    const st = db.prepare(q);
    if (isReader(q)) { const rows = st.all(...params); return { results: rows, meta: { changes: /RETURNING/i.test(q) ? rows.length : 0 } }; }
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const make = (q, params = []) => ({
    _q: q, _p: params,
    bind: (...p) => make(q, p),
    async first() { return exec1(q, params).results[0] ?? null; },
    async all() { return exec1(q, params); },
    async run() { return exec1(q, params); },
  });
  return { prepare: (q) => make(q) };
}

const raw = new DatabaseSync(':memory:');
raw.exec(readFileSync(new URL('../server/phone/migrations/0003_bump24_rank.sql', import.meta.url), 'utf8'));
raw.exec(readFileSync(new URL('../server/phone/migrations/0006_bump24_titles.sql', import.meta.url), 'utf8'));
const db = d1Of(raw);
const now = Date.parse('2026-11-16T15:05:00Z'); // Monday 00:05 KST, settling week of 2026-11-09
const week = '2026-11-09';

await awardWeeklyTitles(db, week, [
  { rank: 1, accountId: 'aaa', guest: false, name: '큰손' },
  { rank: 2, accountId: 'bbb', guest: false, name: '단골' },
  { rank: 3, accountId: 'ccc', guest: false, name: '사냥꾼' },
  { rank: 4, accountId: 'ddd', guest: false, name: '4등' },
  { rank: 2, accountId: null, guest: true, name: '손님' },
], now);
const a = await loadTitles(db, 'aaa');
assert.equal(a.current?.titleId, 'title_bigspender');
assert.equal(a.pendingEarn, true);
assert.equal(a.history[0].record.ko, '11월 2주차 편의점 큰손');
const b = await loadTitles(db, 'bbb');
assert.equal(b.current?.titleId, 'title_flexregular');
const c = await loadTitles(db, 'ccc');
assert.equal(c.current?.titleId, 'title_bogohunter');
const d = await loadTitles(db, 'ddd');
assert.equal(d.current, null);
assert.equal((await loadTitles(db, 'nobody')).current, null);
ok('award ranks 1-3, skip 4th and guests');

// need podium for latestSettledWeek — award alone may not set current if podium empty
// loadTitles uses latestSettledWeek from podium. I inserted titles but not podium, so current might be null!
// Check:
if (!a.current) {
  console.log('  (note) current is null without podium — seed podium and re-check');
}
// Seed podium so current week is known
for (const [id, rank, name] of [['aaa', 1, '큰손'], ['bbb', 2, '단골'], ['ccc', 3, '사냥꾼']]) {
  raw.prepare(`INSERT INTO bump24_podium (period, player_key, account_id, name, guest, rank, points, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(`week:${week}`, `a:${id}`, id, name, 0, rank, 10 - rank, now);
}
const a2 = await loadTitles(db, 'aaa');
assert.equal(a2.current?.titleId, WEEKLY_TITLES[1].id, 'current after podium');
assert.equal(a2.pendingEarn, true);
await markTitleSeen(db, 'aaa', week, now + 1000);
const a3 = await loadTitles(db, 'aaa');
assert.equal(a3.pendingEarn, false);
assert.ok(a3.current.seenAt);
ok('pendingEarn until seen, then cleared');

// idempotent award
const again = await awardWeeklyTitles(db, week, [{ rank: 1, accountId: 'aaa', guest: false, name: '큰손' }], now + 50);
assert.equal(again.length, 0, 'second award is no-op');
ok('award is idempotent');

// settleWeek integration (env null → no ledger). Seed daily tops for a fresh week.
const raw2 = new DatabaseSync(':memory:');
raw2.exec(readFileSync(new URL('../server/phone/migrations/0003_bump24_rank.sql', import.meta.url), 'utf8'));
raw2.exec(readFileSync(new URL('../server/phone/migrations/0006_bump24_titles.sql', import.meta.url), 'utf8'));
const db2 = d1Of(raw2);
const days = daysOfWeek(week);
// 5 participants at one store each day so pointRows counts
for (const day of days) {
  for (let i = 1; i <= 5; i++) {
    const id = i <= 3 ? `u${i}` : `g${i}`;
    const guest = i > 3 ? 1 : 0;
    raw2.prepare(`INSERT INTO bump24_best (player_key, account_id, store_id, day_key, name, guest, score, at)
      VALUES (?,?,?,?,?,?,?,?)`).run(guest ? `g:${id}` : `a:${id}`, guest ? null : id, 's1', day, `n${i}`, guest, 100 - i, now);
  }
}
const pays = await settleWeek(db2, null, week, days, now);
assert.ok(pays.length >= 1, `settleWeek pays ${pays.length}`);
const t1 = await loadTitles(db2, 'u1');
assert.equal(t1.current?.titleId, 'title_bigspender', t1.current);
const t2 = await loadTitles(db2, 'u2');
assert.equal(t2.current?.titleId, 'title_flexregular');
const t3 = await loadTitles(db2, 'u3');
assert.equal(t3.current?.titleId, 'title_bogohunter');
ok('settleWeek writes titles for ranks 1-3');

console.log('weekly titles ok', { tests: n });
