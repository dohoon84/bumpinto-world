// [notice-images] 공지 이미지 주소 정리 · 끄기 스위치 · 빈 갤러리 · R2 없을 때 404
// node scripts/test-notice-images.mjs
import assert from 'node:assert/strict';
import {
  ensurePostsImagesColumn,
  galleryHtml,
  noticeHasImages,
  photoMarkHtml,
  noticeImagesColumnPresent,
  noticeImagesDemo,
  noticeImagesEnabled,
  readPostImages,
  sanitizeNoticeImages,
} from '../src/noticeImages.js';
import { handleNoticeImages, sniffNoticeImage } from '../server/phone/src/noticeImageFiles.js';

let n = 0;
const ok = (name) => { n++; console.log('ok', name); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

assert.equal(noticeImagesEnabled(''), true);
assert.equal(noticeImagesEnabled('?ui=v2'), true);
assert.equal(noticeImagesEnabled('?noticeimg=0'), false);
assert.equal(noticeImagesEnabled('noticeimg=0'), false);
assert.equal(noticeImagesEnabled(new URLSearchParams('noticeimg=1')), true);
ok('?noticeimg=0 only disables');

assert.equal(noticeImagesDemo('?noticeimgdemo=1'), false);
ok('demo flag is off without a local browser');

assert.equal(noticeImagesColumnPresent([{ name: 'title' }, { name: 'body' }]), false);
assert.equal(noticeImagesColumnPresent([{ name: 'images' }]), true);
assert.equal(noticeImagesColumnPresent(null), false);
ok('images column probe');

const good = '/notice-images/n01234567';
const cleaned = sanitizeNoticeImages([
  { url: 'https://example.com/a.png', alt: '  야경  ' },
  { url: 'javascript:alert(1)' },
  { url: 'http://example.com/a.png' },
  { url: good },
  { url: good },
  { url: 'data:image/svg+xml,<svg>' },
  'https://example.com/b.webp',
]);
assert.deepEqual(cleaned, [
  { url: 'https://example.com/a.png', alt: '야경' },
  { url: good },
  { url: 'https://example.com/b.webp' },
]);
assert.equal(sanitizeNoticeImages('not-json').length, 0);
assert.equal(sanitizeNoticeImages('[{"url":"https://example.com/c.png"}]')[0].url, 'https://example.com/c.png');
assert.equal(sanitizeNoticeImages(Array.from({ length: 12 }, (_, i) => ({ url: `https://example.com/${i}.png` }))).length, 8);
const longData = `data:image/jpeg;base64,${'a'.repeat(3000)}`;
assert.equal(sanitizeNoticeImages([{ url: longData }]).length, 0);
assert.equal(sanitizeNoticeImages([{ url: longData }], { allowData: true })[0].url, longData);
assert.equal(sanitizeNoticeImages([{ url: `data:image/jpeg;base64,${'a'.repeat(900_001)}` }], { allowData: true }).length, 0);
ok('sanitize keeps https and /notice-images ids, drops the rest, caps at 8');

assert.deepEqual(readPostImages({ category: 'free', images: '[{"url":"https://example.com/a.png"}]' }), []);
assert.deepEqual(readPostImages({ category: 'notice' }), []);
assert.equal(readPostImages({ category: 'notice', images: 'nope' }).length, 0);
assert.equal(readPostImages({ category: 'notice', images: null }).length, 0);
assert.equal(readPostImages({ category: 'notice', images: `[{"url":"${good}"}]` })[0].url, good);
ok('missing column or non-notice reads as no images');

assert.equal(galleryHtml([], esc), '');
assert.equal(galleryHtml(undefined, esc), '');
assert.equal(galleryHtml([{ url: 'javascript:alert(1)' }], esc), '');
const html = galleryHtml([{ url: good, alt: '하나' }, { url: 'https://example.com/a.png', alt: '둘' }], esc);
assert.equal((html.match(/data-ni-open/g) || []).length, 2);
assert.match(html, /data-ni-i="1"/);
assert.doesNotMatch(html, /<script/i);
ok('empty gallery renders nothing; two images render two buttons');

const four = [0, 1, 2, 3].map((i) => ({ url: `https://example.com/${i}.png`, alt: String(i) }));
assert.equal((galleryHtml(four, esc).match(/class="ni-thumb"/g) || []).length, 4);
assert.equal(noticeHasImages([]), false);
assert.equal(noticeHasImages(four), true);
const mark = photoMarkHtml('사진');
assert.match(mark, /class="ni-mark"/);
assert.match(mark, /<svg/);
assert.doesNotMatch(mark, /<img/i);
assert.doesNotMatch(mark, /\+N|\+\d/);
ok('list mark is an icon only; detail gallery keeps every image');

function memSql(names, { failAlter = false } = {}) {
  const columns = names.map((name) => ({ name }));
  const alters = [];
  return {
    alters,
    columns,
    exec(statement) {
      if (/PRAGMA table_info\(posts\)/i.test(statement)) return { toArray: () => columns.slice() };
      if (/ALTER TABLE posts ADD COLUMN images TEXT/.test(statement)) {
        alters.push(statement);
        if (failAlter) throw new Error('alter failed');
        columns.push({ name: 'images' });
        return { toArray: () => [] };
      }
      throw new Error(`unexpected sql: ${statement}`);
    },
  };
}
{
  const missing = memSql(['id', 'title', 'body']);
  assert.deepEqual(ensurePostsImagesColumn(missing), { added: true });
  assert.equal(missing.alters.length, 1);
  assert.equal(missing.columns.some((c) => c.name === 'images'), true);
  ok('column missing -> ALTER once');
  assert.deepEqual(ensurePostsImagesColumn(missing), { added: false });
  assert.equal(missing.alters.length, 1);
  ok('second init -> no-op');
}
{
  const present = memSql(['id', 'images', 'title']);
  assert.deepEqual(ensurePostsImagesColumn(present), { added: false });
  assert.equal(present.alters.length, 0);
  ok('column present (fresh CREATE) -> no ALTER');
}
{
  const bad = memSql(['id', 'title'], { failAlter: true });
  assert.deepEqual(ensurePostsImagesColumn(bad), { added: false });
  assert.equal(bad.alters.length, 1);
  ok('ALTER failure stays text-only');
}

assert.equal(sniffNoticeImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
assert.equal(sniffNoticeImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
assert.equal(sniffNoticeImage(new Uint8Array([0, 1, 2, 3])), '');
ok('sniff jpeg and png');

const cors = { 'Access-Control-Allow-Origin': '*' };
{
  const res = await handleNoticeImages(new Request('http://x/notice-images'), {}, cors, new URL('http://x/notice-images'));
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'no_storage');
  ok('no R2 binding → 404 no_storage');
}

{
  const store = new Map();
  const env = {
    PHOTOS: {
      async put(key, bytes, opts) { store.set(key, { bytes, type: opts.httpMetadata.contentType, size: bytes.length }); },
      async get(key) {
        const v = store.get(key);
        if (!v) return null;
        return { body: v.bytes, size: v.size, httpMetadata: { contentType: v.type } };
      },
    },
    PHONE_BOOK: {
      getByName() {
        return { noticeImageGate: async ({ id }) => (id.endsWith('0001') ? { ok: false, error: 'notice_admin' } : { ok: true }) };
      },
    },
  };
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x01]);
  const denied = await handleNoticeImages(new Request('http://x/notice-images', {
    method: 'POST',
    headers: { Authorization: 'Bearer 00000000-0000-4000-8000-000000000001', 'Content-Type': 'image/jpeg' },
    body: jpeg,
  }), env, cors, new URL('http://x/notice-images'));
  assert.equal(denied.status, 403);
  ok('non-admin upload is rejected');

  const saved = await handleNoticeImages(new Request('http://x/notice-images', {
    method: 'POST',
    headers: { Authorization: 'Bearer 00000000-0000-4000-8000-000000000002', 'Content-Type': 'image/jpeg' },
    body: jpeg,
  }), env, cors, new URL('http://x/notice-images'));
  assert.equal(saved.status, 201);
  const payload = await saved.json();
  assert.match(payload.image.url, /^\/notice-images\/n[a-z0-9]+$/);
  assert.equal(store.size, 1);
  const got = await handleNoticeImages(new Request(`http://x${payload.image.url}`), env, cors, new URL(`http://x${payload.image.url}`));
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(got.headers.get('X-Content-Type-Options'), 'nosniff');
  ok('admin upload stores under notices/ and public GET returns the bytes');

  const bad = await handleNoticeImages(new Request('http://x/notice-images', {
    method: 'POST',
    headers: { Authorization: 'Bearer 00000000-0000-4000-8000-000000000002', 'Content-Type': 'image/jpeg' },
    body: new Uint8Array([1, 2, 3, 4]),
  }), env, cors, new URL('http://x/notice-images'));
  assert.equal(bad.status, 415);
  ok('non-image bytes are rejected');
}

console.log(`notice-images: ${n} passed`);
