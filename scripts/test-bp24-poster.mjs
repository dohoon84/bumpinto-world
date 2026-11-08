// [bp24-poster] 기간·다시 보지 않기·?bp24poster=0
import assert from 'node:assert/strict';
import {
  BP24_POSTER_DISMISS_KEY, BP24_POSTER_END, BP24_POSTER_SRC,
  dismissPosterForever, posterEndMs, shouldShowPoster,
} from '../src/notice/posterPopup.js';

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const q = (s) => new URLSearchParams(s);
const END = posterEndMs(BP24_POSTER_END);
const before = END - 1;

assert.equal(BP24_POSTER_SRC, '/bump24-poster.webp');
assert.equal(END, Date.parse('2026-11-15T15:00:00.000Z'), '2026-11-16 00:00 KST');
assert.equal(posterEndMs('nope'), Date.parse('2026-11-16T00:00:00+09:00'));

assert.equal(shouldShowPoster(q(''), mem(), before), true);
assert.equal(shouldShowPoster(q(''), mem(), END), false, 'ends at the instant');
assert.equal(shouldShowPoster(q(''), mem(), END + 60_000), false);
assert.equal(shouldShowPoster(q(''), mem(), Date.parse('2026-11-15T14:59:59+09:00'), '2026-11-15T15:00:00+09:00'), true);
assert.equal(shouldShowPoster(q(''), mem(), Date.parse('2026-11-15T15:00:00+09:00'), '2026-11-15T15:00:00+09:00'), false);

assert.equal(shouldShowPoster(q('bp24poster=0'), mem(), before), false);
assert.equal(shouldShowPoster(q('bp24poster=1'), mem(), before), true);
assert.equal(shouldShowPoster(q('bp24poster=0'), mem(), before, '2099-01-01T00:00:00+09:00'), false);

const kept = mem();
assert.equal(shouldShowPoster(q(''), kept, before), true);
dismissPosterForever(kept);
assert.equal(kept.getItem(BP24_POSTER_DISMISS_KEY), '1');
assert.equal(shouldShowPoster(q(''), kept, before), false);
assert.equal(shouldShowPoster(q('bp24poster=1'), mem({ [BP24_POSTER_DISMISS_KEY]: '1' }), before), false);

const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
assert.equal(shouldShowPoster(q(''), throwing, before), true);
dismissPosterForever(throwing);
assert.equal(shouldShowPoster(q('shot=1'), mem(), before), false);

console.log('bp24 poster ok');
