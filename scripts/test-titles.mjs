// [titles] 칭호 목록이 서버 사다리와 같은지, 로컬 도감이 획득·장착을 기억하는지.
import assert from 'node:assert/strict';
import { LADDERS } from '../server/phone/src/account/econ.js';
import { readFileSync } from 'node:fs';
import { TITLES, featuredId, gradeRank, sanitizeTitleId, titleByAxisKo } from '../src/titles/catalog.js';
import { GRADES } from '../src/titles/catalog.js';
import { ICON_TIERS, indexSlots, tintSvg, tierColor } from '../src/titles/icons.js';
import { titleDemoId, titlesEnabled } from '../src/titles/flags.js';
import { TITLE_STORE_KEY, createTitleStore } from '../src/titles/store.js';
import { fanfareNotes } from '../src/titles/sound.js';

let n = 0;
const ok = (t) => { n += 1; console.log('ok', t); };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };

const ids = new Set();
for (const t of TITLES) {
  assert.equal(ids.has(t.id), false, t.id);
  ids.add(t.id);
  assert.ok(t.name.ko && t.name.en);
  assert.ok(gradeRank(t.grade) > 0);
}
ok('ids unique');

for (const [axis, steps] of LADDERS) {
  let prev = 0;
  steps.forEach(([title, at], i) => {
    const t = titleByAxisKo(axis, title.ko);
    assert.ok(t, title.ko);
    assert.equal(t.name.en, title.en);
    assert.equal(t.at, at);
    assert.equal(t.tier, i);
    assert.ok(gradeRank(t.grade) >= prev, `${t.id} grade`);
    prev = gradeRank(t.grade);
  });
}
assert.equal(TITLES.filter((t) => t.axis !== 'store').length, LADDERS.reduce((n, [, s]) => n + s.length, 0));
const grocery = TITLES.find((t) => t.id === 'store.grocery');
assert.equal(grocery.name.ko, '장보기왕');
assert.equal(grocery.grade, 'event');
assert.equal(titleByAxisKo('health', '장보기왕'), null);
ok('ladders match server, grocery is separate');

assert.equal(titlesEnabled(''), true);
assert.equal(titlesEnabled('?titles=0'), false);
assert.equal(titlesEnabled('?titles=off'), false);
assert.equal(titlesEnabled('?titles=no'), false);
assert.equal(titlesEnabled('?titles=1'), true);
assert.equal(titleDemoId('?titledemo=health.marathon', (id) => id === 'health.marathon'), 'health.marathon');
assert.equal(titleDemoId('?titledemo=nope', () => false), '');
assert.equal(titleDemoId(''), '');
ok('flags default on, opt out, demo id');

assert.equal(sanitizeTitleId('health.stroll'), 'health.stroll');
assert.equal(sanitizeTitleId('nope'), '');
assert.equal(sanitizeTitleId('Health.Stroll'), '');
assert.equal(sanitizeTitleId('../x'), '');
ok('title id shape');

const storage = mem();
let now = 1000;
const store = createTitleStore({ storage, now: () => now });
assert.deepEqual(store.syncLadders([
  { axis: 'health', steps: [{ title: { ko: '산책러', en: 'Stroller' }, at: 100, unlocked: true }, { title: { ko: '정자 워커', en: 'Jeongja Walker' }, at: 1000, unlocked: false }] },
]), []);
assert.equal(store.seen('health.stroll'), true);
assert.equal(store.selected, 'health.stroll');
assert.deepEqual(store.syncLadders([
  { axis: 'health', steps: [
    { title: { ko: '산책러' }, at: 100, unlocked: true },
    { title: { ko: '정자 워커' }, at: 1000, unlocked: true },
  ] },
]), ['health.walker']);
assert.equal(store.seen('health.walker'), false);
assert.equal(store.has('health.walker'), true);
assert.equal(store.select('nope'), false);
assert.equal(store.select('health.walker'), true);
assert.equal(store.selected, 'health.walker');
assert.equal(store.select(''), true);
assert.equal(store.selected, '');
store.select('health.stroll');
ok('first sync is quiet, later unlocks are new, wear only earned');

const again = createTitleStore({ storage, now: () => now });
assert.equal(again.selected, 'health.stroll');
assert.equal(again.has('health.walker'), true);
assert.equal(again.snapshot().bootstrapped, true);
ok('localStorage roundtrip ' + TITLE_STORE_KEY);

assert.equal(featuredId(['streak.d7', 'transit.vip', 'health.stroll']), 'health.stroll');
assert.equal(featuredId(['neighbor.captain', 'store.grocery']), 'neighbor.captain');
ok('featured axis order');

const lens = Object.fromEntries(['bronze', 'silver', 'gold', 'legendary', 'event'].map((g) => [g, fanfareNotes(g).length]));
assert.ok(lens.bronze < lens.silver && lens.silver < lens.gold && lens.gold < lens.legendary);
assert.ok(fanfareNotes('legendary').some((n) => n.pad && n.dur >= fanfareNotes('bronze').find((x) => x.pad).dur));
ok('fanfare grows with grade');

const manifest = JSON.parse(readFileSync(new URL('../public/titles/manifest.json', import.meta.url), 'utf8'));
const slots = indexSlots(manifest);
assert.equal(manifest.viewBox, '0 0 128 128');
assert.equal(manifest.px, 128);
for (const t of TITLES) {
  const slot = slots.find((s) => s.id === t.id);
  assert.ok(slot, t.id);
  assert.ok(ICON_TIERS.includes(slot.tier));
  assert.equal(slot.tier, t.grade);
  assert.equal(slot.placeholder, false);
  assert.equal(slot.src, `titles/${t.id}.svg`);
  const svg = readFileSync(new URL(`../public/${slot.src}`, import.meta.url), 'utf8');
  assert.match(svg, /viewBox="0 0 128 128"/);
  assert.match(svg, /width="128"/);
  assert.match(svg, /currentColor/);
  assert.doesNotMatch(svg, /PLACEHOLDER/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<image/i);
  assert.doesNotMatch(svg, /<text/i);
  const tinted = tintSvg(svg, tierColor(slot.tier));
  assert.equal(tinted.includes('currentColor'), false);
  assert.equal(tinted.includes(GRADES[slot.tier].metal), true);
}
assert.equal(indexSlots({ slots: { 'health.stroll': { tier: 'nope', src: 'titles/x.svg' } } }).length, 0);
assert.equal(indexSlots({ slots: { bad: { tier: 'gold', src: '../secret.svg' } } }).length, 0);
ok('icon slots are final svgs tinted to the tier color');

import { announceTitleId } from '../src/titles/catalog.js';
import { titleCheerOn, titleFxOn, titleRarityOn } from '../src/titles/flags.js';
import { formatRarityPct, rarityView } from '../src/titles/rarity.js';

assert.equal(announceTitleId('health.stroll'), '');
assert.equal(announceTitleId('explore.alley'), '');
assert.equal(announceTitleId('health.walker'), 'health.walker');
assert.equal(announceTitleId('store.grocery'), 'store.grocery');
assert.equal(announceTitleId('health.marathon'), 'health.marathon');
assert.equal(announceTitleId('nope'), '');
assert.equal(announceTitleId('../x'), '');
ok('only gold and above can be announced');

assert.equal(titleFxOn(''), true);
assert.equal(titleFxOn('?titlefx=0'), false);
assert.equal(titleRarityOn('?titlerarity=off'), false);
assert.equal(titleCheerOn('?titlecheer=no'), false);
assert.equal(titleCheerOn('?titles=0'), true);
ok('fx, rarity, cheer flags default on');

assert.deepEqual(rarityView(null), { ready: false, pct: {} });
assert.deepEqual(rarityView({ ready: false, totalPlayers: 10, counts: { 'health.stroll': 4 } }), { ready: false, pct: {} });
assert.deepEqual(rarityView({ ready: true, totalPlayers: 0, counts: { 'health.stroll': 1 } }).ready, false);
const view = rarityView({ ready: true, asOf: 5, totalPlayers: 200, counts: { 'health.stroll': 10, bad: -1, 'health.walker': 50 } });
assert.equal(view.ready, true);
assert.equal(view.pct['health.stroll'], 5);
assert.equal(view.pct['health.walker'], 25);
assert.equal(view.pct.bad, undefined);
assert.equal(formatRarityPct(view.pct['health.stroll']), '5');
assert.equal(formatRarityPct(0.4), '0.4');
ok('rarity percents come only from a ready payload');

const { handleEcon } = await import('../server/phone/src/account/econRoutes.js');
{
  const res = await handleEcon(new Request('http://localhost/econ/titles/rarity'), { ECONOMY_ENABLED: '0' }, new URL('http://localhost/econ/titles/rarity'));
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.ready, false);
  assert.equal(body.data.totalPlayers, null);
  assert.deepEqual(body.data.counts, {});
}
ok('rarity route answers without a count');

console.log(n + ' passed');
