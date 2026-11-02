// node scripts/test-photo-cloud.mjs — [photo-cloud] 사진 서버 저장 오프라인 테스트 (네트워크·Cloudflare 불필요)
//   서버: 진짜 server/phone 의 Worker(index.js)와 PhoneBook DO(book.js)를 node 에서 띄운다.
//         cloudflare:workers 는 작은 대역으로 바꾸고, DO 의 SQLite 는 node:sqlite, R2 는 Map 으로 흉내 낸다.
//   클라이언트: src/camera/photoCloud.js 를 가짜 fetch(=위 Worker) + 메모리 저장소로 돌려 이주·동기화·삭제·오프라인을 본다.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }'), shortCircuit: true };
  return next(spec, ctx);
}`));

const { default: worker, PhoneBook } = await import('../server/phone/src/index.js');
const P = await import('../server/phone/src/photos.js');
const { createPhotoCloud, accountKey, photoCloudEnabled } = await import('../src/camera/photoCloud.js');

let n = 0; const ok = (m) => console.log('  ok', ++n, m);

// ── 가짜 Cloudflare ──
function sqlOf(db) {
  return {
    exec(query, ...params) {
      const st = db.prepare(query);
      const reader = /^\s*(SELECT|WITH|PRAGMA)/i.test(query) || /\bRETURNING\b/i.test(query);
      if (reader) { const rows = st.all(...params.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v))); return { toArray: () => rows, one: () => rows[0] }; }
      // 여러 문장(CREATE …; CREATE …)도 받게
      if (!params.length && query.split(';').filter((q) => q.trim()).length > 1) { db.exec(query); return { toArray: () => [] }; }
      st.run(...params.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v)));
      return { toArray: () => [] };
    },
  };
}
function makeEnv({ r2 = true } = {}) {
  const db = new DatabaseSync(':memory:');
  const ctx = { storage: { sql: sqlOf(db) }, blockConcurrencyWhile: (fn) => fn() };
  const env = {};
  const book = new PhoneBook(ctx, env);
  env.PHONE_BOOK = { getByName: () => book };
  env.ROOM = { getByName: () => ({ fetch: async () => new Response('{}') }) };
  const objects = new Map(); const r2log = [];
  if (r2) env.PHOTOS = {
    async put(key, value, opts) { r2log.push(['put', key]); const bytes = new Uint8Array(value); objects.set(key, { bytes, opts }); return { key, size: bytes.byteLength }; },
    async get(key) { r2log.push(['get', key]); const o = objects.get(key); return o ? { body: o.bytes, size: o.bytes.byteLength, httpMetadata: o.opts?.httpMetadata } : null; },
    async delete(key) { r2log.push(['delete', key]); objects.delete(key); },
  };
  return { env, book, objects, r2log, db };
}
const ORIGIN = 'http://localhost:5173';
async function req(env, method, path, { id, body, headers = {} } = {}) {
  const h = { Origin: ORIGIN, ...headers };
  if (id) h.Authorization = `Bearer ${id}`;
  const res = await worker.fetch(new Request('https://phone.test' + path, { method, headers: h, body }), env);
  const ct = res.headers.get('Content-Type') || '';
  const out = { status: res.status, headers: res.headers };
  if (ct.startsWith('application/json')) out.json = await res.json(); else out.bytes = new Uint8Array(await res.arrayBuffer());
  return out;
}
const join = async (env, name) => {
  const id = crypto.randomUUID();
  const r = await req(env, 'POST', '/join', { body: JSON.stringify({ id, name, look: { gender: 'f', face: 'round', hair: 'medium', top: 'hoodie', color: '#1f5fbf', skin: '#f2d0b0', pants: '#2b3040' } }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); return id;
};
const jpeg = (seed, size = 1200) => { const b = new Uint8Array(size); b.set([0xff, 0xd8, 0xff, 0xe0]); for (let i = 4; i < size; i++) b[i] = (i * 31 + seed * 7) & 255; return b; };
const webp = (size = 600) => { const b = new Uint8Array(size); b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]); return b; };
const meta = (m) => encodeURIComponent(JSON.stringify(m));
const put = (env, id, pid, bytes, { type = 'image/jpeg', m = { caption: '탄천', takenAt: Date.now() - 1000, w: 1280, h: 960 } } = {}) =>
  req(env, 'PUT', `/photos/${pid}`, { id, body: bytes, headers: { 'Content-Type': type, 'X-Photo-Meta': meta(m) } });

// ════════ 서버 ════════
{
  // 바인딩이 없으면(배포 전) 404 — 클라이언트는 이걸 "없음"으로 본다
  const { env } = makeEnv({ r2: false });
  const id = await join(env, '미배포');
  const r = await req(env, 'GET', '/photos', { id });
  assert.equal(r.status, 404); assert.equal(r.json.error, 'not_found');
  ok('no R2 binding → 404 not_found (client falls back silently)');
}
const S = makeEnv();
const alice = await join(S.env, '앨리스');
const bob = await join(S.env, '밥');
{
  // CORS 사전 요청에 새 메서드·헤더
  const r = await worker.fetch(new Request('https://phone.test/photos/pabcdef12', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), S.env);
  assert.equal(r.status, 204);
  assert.match(r.headers.get('Access-Control-Allow-Methods'), /PUT/); assert.match(r.headers.get('Access-Control-Allow-Methods'), /DELETE/);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /Authorization/); assert.match(r.headers.get('Access-Control-Allow-Headers'), /X-Photo-Meta/);
  ok('CORS preflight allows PUT/PATCH/DELETE + Authorization/X-Photo-Meta');
}
{
  // 인증: 토큰 없음·모양 틀림·없는 계정 → 401
  assert.equal((await req(S.env, 'GET', '/photos')).status, 401);
  assert.equal((await req(S.env, 'GET', '/photos', { headers: { Authorization: 'Bearer nope' } })).status, 401);
  const r = await req(S.env, 'GET', '/photos', { id: crypto.randomUUID() });
  assert.equal(r.status, 401); assert.equal(r.json.error, 'unauthorized');
  ok('auth: missing / malformed / unknown account → 401');
}
{
  let r = await req(S.env, 'GET', '/photos', { id: alice });
  assert.equal(r.status, 200); assert.deepEqual(r.json.items, []); assert.equal(r.json.max, 20); assert.equal(r.json.maxBytes, 2 * 1024 * 1024);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  r = await put(S.env, alice, 'pa1aaaaaa', jpeg(1));
  assert.equal(r.status, 201, JSON.stringify(r.json)); assert.equal(r.json.photo.caption, '탄천'); assert.equal(r.json.used, 1);
  const key = [...S.objects.keys()][0];
  assert.match(key, /^u\/[0-9a-f]{32}\/pa1aaaaaa\.jpg$/); assert.ok(!key.includes(alice), 'R2 key must not contain the account id');
  assert.equal(key.split('/')[1], await P.ownerKeyOf(alice));
  assert.equal(key.split('/')[1], await accountKey(alice), 'client account hash = server owner key');
  assert.equal(S.objects.get(key).opts.httpMetadata.contentType, 'image/jpeg');
  ok('upload JPEG → 201, R2 key u/<hash(account)>/<photoId>.jpg (no raw id)');
  r = await put(S.env, alice, 'pa2aaaaaa', webp(), { type: 'image/webp' });
  assert.equal(r.status, 201); assert.ok(S.objects.has(`u/${await P.ownerKeyOf(alice)}/pa2aaaaaa.webp`));
  ok('upload WebP → 201');
}
{
  // 형식·크기 검사
  let r = await put(S.env, alice, 'pbadtype1', jpeg(9), { type: 'image/png' });
  assert.equal(r.status, 415); assert.equal(r.json.error, 'bad_type');
  r = await put(S.env, alice, 'pbadmagic', new TextEncoder().encode('<svg onload=alert(1)>'), { type: 'image/jpeg' });
  assert.equal(r.status, 415); assert.equal(r.json.error, 'bad_image');
  r = await put(S.env, alice, 'pbadmagic', webp(), { type: 'image/jpeg' });
  assert.equal(r.status, 415, 'declared type must match the bytes');
  r = await put(S.env, alice, 'ptoobig01', jpeg(3, 2 * 1024 * 1024 + 1));
  assert.equal(r.status, 413); assert.equal(r.json.error, 'too_big');
  r = await put(S.env, alice, 'BAD..ID', jpeg(4));
  assert.equal(r.status, 400); assert.equal(r.json.error, 'bad_photo_id');
  r = await req(S.env, 'PUT', '/photos/pbadmeta1', { id: alice, body: jpeg(5), headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Meta': '%E0%A4%A' } });
  assert.equal(r.status, 400); assert.equal(r.json.error, 'bad_meta');
  assert.equal(S.objects.size, 2, 'rejected uploads must not reach R2');
  ok('rejects PNG/SVG/mismatched magic (415), >2MB (413), bad id/meta (400); nothing written to R2');
}
{
  // 메타데이터 정리: 캡션 길이·제어문자, 이상한 값은 버림, owner 를 보내도 무시
  const r = await put(S.env, alice, 'pa3aaaaaa', jpeg(6), { m: { caption: 'x'.repeat(500) + '\u0007', takenAt: 1, w: 99999, h: 'a', owner: bob, region: 'JEONGJA', x: 12.6 } });
  assert.equal(r.status, 201); assert.equal(r.json.photo.caption.length, 140); assert.equal(r.json.photo.w, null);
  assert.equal(r.json.photo.region, 'jeongja'); assert.equal(r.json.photo.x, 13); assert.ok(r.json.photo.takenAt > 1);
  const list = (await req(S.env, 'GET', '/photos', { id: bob })).json;
  assert.equal(list.items.length, 0, 'client-supplied owner is ignored');
  ok('metadata sanitised; client-supplied owner ignored');
}
{
  // 중복: 같은 id 다시 → dedup, 같은 바이트 다른 id → 기존 것 돌려줌, R2 에 새 파일 없음
  const before = S.objects.size;
  let r = await put(S.env, alice, 'pa1aaaaaa', jpeg(1));
  assert.equal(r.status, 200); assert.equal(r.json.dedup, true); assert.equal(r.json.photo.id, 'pa1aaaaaa');
  r = await put(S.env, alice, 'pa1copyyy', jpeg(1));
  assert.equal(r.status, 200); assert.equal(r.json.dedup, true); assert.equal(r.json.photo.id, 'pa1aaaaaa');
  assert.equal(S.objects.size, before);
  // 다른 사람은 같은 바이트여도 따로
  r = await put(S.env, bob, 'pa1aaaaaa', jpeg(1));
  assert.equal(r.status, 201); assert.equal(S.objects.size, before + 1);
  ok('dedupe by photoId and by SHA-256 per owner (no extra R2 object); other users independent');
}
{
  // 받기: 캐시 헤더·ETag·304, 남의 사진은 404
  let r = await req(S.env, 'GET', '/photos/pa1aaaaaa', { id: alice });
  assert.equal(r.status, 200); assert.deepEqual(r.bytes, jpeg(1));
  assert.equal(r.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(r.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  const etag = r.headers.get('ETag'); assert.match(etag, /^"[0-9a-f]{64}"$/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const gets = S.r2log.filter((x) => x[0] === 'get').length;
  r = await req(S.env, 'GET', '/photos/pa1aaaaaa', { id: alice, headers: { 'If-None-Match': etag } });
  assert.equal(r.status, 304); assert.equal(S.r2log.filter((x) => x[0] === 'get').length, gets, '304 must not read R2');
  r = await req(S.env, 'GET', '/photos/pa2aaaaaa', { id: bob });
  assert.equal(r.status, 404); assert.equal(r.json.error, 'photo_not_found');
  ok('get: bytes + private immutable cache + ETag/304 (no R2 read); other users → 404');
}
{
  // 캡션·삭제는 주인만
  let r = await req(S.env, 'PATCH', '/photos/pa1aaaaaa', { id: bob, body: JSON.stringify({ caption: 'hack' }) });
  assert.equal(r.status, 200, 'bob has his own pa1aaaaaa'); // 같은 id 라도 bob 의 사진만 바뀐다
  r = await req(S.env, 'GET', '/photos', { id: alice });
  assert.equal(r.json.items.find((x) => x.id === 'pa1aaaaaa').caption, '탄천');
  r = await req(S.env, 'PATCH', '/photos/pa2aaaaaa', { id: alice, body: JSON.stringify({ caption: '  새 캡션 ' }) });
  assert.equal(r.status, 200); assert.equal(r.json.photo.caption, '새 캡션');
  r = await req(S.env, 'DELETE', '/photos/pa2aaaaaa', { id: bob });
  assert.equal(r.status, 404);
  const webpKey = `u/${await P.ownerKeyOf(alice)}/pa2aaaaaa.webp`;
  assert.ok(S.objects.has(webpKey));
  r = await req(S.env, 'DELETE', '/photos/pa2aaaaaa', { id: alice });
  assert.equal(r.status, 200); assert.ok(!S.objects.has(webpKey), 'R2 object removed');
  assert.equal((await req(S.env, 'GET', '/photos/pa2aaaaaa', { id: alice })).status, 404);
  ok('caption/delete scoped to owner; delete removes the R2 object');
}
{
  // 한도 20장
  const T = makeEnv(); const u = await join(T.env, '꽉참');
  for (let i = 0; i < 20; i++) assert.equal((await put(T.env, u, `pq${String(i).padStart(6, '0')}`, jpeg(100 + i))).status, 201);
  const r = await put(T.env, u, 'pqfull001', jpeg(999));
  assert.equal(r.status, 409); assert.equal(r.json.error, 'album_full'); assert.equal(T.objects.size, 20);
  ok('quota: 20 photos per account → 409 album_full, nothing written');
}
{
  // 업로드 속도 제한 (지웠다 올리기 반복)
  const T = makeEnv(); const u = await join(T.env, '반복');
  let last;
  for (let i = 0; i < 61; i++) {
    last = await put(T.env, u, `pr${String(i).padStart(6, '0')}`, jpeg(500 + i));
    if (last.status === 201) await req(T.env, 'DELETE', `/photos/pr${String(i).padStart(6, '0')}`, { id: u });
  }
  assert.equal(last.status, 429); assert.equal(last.json.error, 'rate');
  ok('rate limit: 60 uploads/hour per account → 429');
}
{
  // 경쟁: begin 이후 save 직전에 한도가 차면 올린 파일을 지운다
  const T = makeEnv(); const u = await join(T.env, '경쟁');
  const realPhotos = T.book.photos.bind(T.book);
  T.book.photos = async (input) => (input.op === 'save' ? { ok: false, error: 'album_full' } : realPhotos(input));
  const r = await put(T.env, u, 'prace0001', jpeg(77));
  assert.equal(r.status, 409); assert.equal(T.objects.size, 0); assert.deepEqual(T.r2log.map((x) => x[0]), ['put', 'delete']);
  ok('race: save rejected after R2 put → object cleaned up');
}
{
  // 기존 경로는 그대로
  const r = await req(S.env, 'POST', '/threads', { body: JSON.stringify({ id: alice }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 200); assert.equal(r.json.ok, true);
  assert.equal((await req(S.env, 'POST', '/nope', { body: '{}' })).json.error, 'not_found');
  ok('existing routes unaffected');
}

// ════════ 클라이언트 (photoCloud.js) ════════
function memStore(max = 20) {
  const m = new Map();
  const strip = ({ blob, ...meta }) => meta;
  return {
    m,
    listPhotos: async () => [...m.values()].sort((a, b) => b.takenAt - a.takenAt).map(strip),
    getPhoto: async (id) => (m.has(id) ? { ...m.get(id) } : undefined),
    addPhoto: async (rec) => { if (m.size >= max) { const e = new Error('album_full'); e.code = 'album_full'; throw e; } m.set(rec.id, { ...rec }); return rec.id; },
    updatePhoto: async (id, patch) => { const c = m.get(id); if (!c) return null; m.set(id, { ...c, ...patch }); return m.get(id); },
    deletePhoto: async (id) => { m.delete(id); },
  };
}
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
const blobOf = (bytes, type = 'image/jpeg') => new Blob([bytes], { type });
const T0 = Date.now() - 86400000; // 서버는 2020년 이전·미래 시각을 받지 않는다
const localRec = (id, seed, t, extra = {}) => ({ id, blob: blobOf(jpeg(seed)), thumb: blobOf(jpeg(seed, 64)), w: 1280, h: 960, caption: `c${seed}`, takenAt: T0 + t, region: 'jeongja', regionName: '정자동', regionEnName: 'Jeongja-dong', x: 1, z: 2, tipId: 0, ...extra });
// 가짜 fetch → 진짜 Worker
function fetchTo(env, { down = () => false, log = [] } = {}) {
  return async (url, init = {}) => {
    log.push(`${init.method || 'GET'} ${new URL(url).pathname}`);
    if (down()) throw new TypeError('Failed to fetch');
    return worker.fetch(new Request(url, { ...init, headers: { Origin: ORIGIN, ...(init.headers || {}) } }), env);
  };
}
const smsFor = (id, base = 'https://phone.test') => ({ id, base, session: { phone: '01020000001' } });
const thumbs = [];
const makeThumb = async (b) => { thumbs.push(b.size); return blobOf(new Uint8Array([0xff, 0xd8, 0xff, 1])); };

assert.equal(photoCloudEnabled(new URLSearchParams('photoCloud=0')), false);
assert.equal(photoCloudEnabled(new URLSearchParams('')), true);
{
  // 꺼짐: ?photoCloud=0 · 번호 서버 없음 · 세션 없음 → 요청 0
  const log = [];
  const C = makeEnv(); const u = await join(C.env, '꺼짐');
  for (const c of [
    createPhotoCloud({ sms: smsFor(u), store: memStore(), makeThumb, enabled: false, fetch: fetchTo(C.env, { log }), storage: memStorage() }),
    createPhotoCloud({ sms: { ...smsFor(u), base: '' }, store: memStore(), makeThumb, fetch: fetchTo(C.env, { log }), storage: memStorage() }),
    createPhotoCloud({ sms: { ...smsFor(u), session: { off: true } }, store: memStore(), makeThumb, fetch: fetchTo(C.env, { log }), storage: memStorage() }),
  ]) { assert.equal(c.active, false); assert.equal(await c.sync(), false); }
  assert.deepEqual(log, []);
  ok('client: ?photoCloud=0 / no server / offline session → no requests');
}
{
  // 서버에 /photos 가 없음(구버전, R2 없음) → 한 번 404 후 조용히 꺼짐
  const C = makeEnv({ r2: false }); const u = await join(C.env, '구버전'); const log = [];
  const store = memStore(); await store.addPhoto(localRec('plocal001', 1, 1000));
  const c = createPhotoCloud({ sms: smsFor(u), store, makeThumb, fetch: fetchTo(C.env, { log }), storage: memStorage() });
  assert.equal(await c.sync(), false); assert.equal(c.off, true); assert.equal(c.lastError, 'not_deployed');
  assert.equal(await c.sync(), false); assert.equal(log.length, 1, 'no retries after 404');
  assert.equal(store.m.size, 1); assert.equal(store.m.get('plocal001').cloud, undefined);
  ok('client: route missing (404) → silently off, local photos untouched, no retry');
}
{
  // 첫 로그인 이주: 기기 사진 3장(그중 2장은 바이트가 같음) → 서버 2장, 기기 중복 1장 정리, 다시 돌려도 그대로
  const C = makeEnv(); const u = await join(C.env, '이주'); const log = []; const storage = memStorage();
  const store = memStore();
  await store.addPhoto(localRec('pold00001', 1, 1000));
  await store.addPhoto(localRec('pold00002', 2, 2000));
  await store.addPhoto({ ...localRec('pold00003', 1, 3000) }); // pold00001 과 같은 바이트
  const c = createPhotoCloud({ sms: smsFor(u), store, makeThumb, fetch: fetchTo(C.env, { log }), storage });
  assert.equal(await c.sync(), true);
  const list = (await req(C.env, 'GET', '/photos', { id: u })).json.items;
  assert.deepEqual(list.map((x) => x.id).sort(), ['pold00001', 'pold00002']);
  assert.equal(list.find((x) => x.id === 'pold00001').caption, 'c1'); assert.equal(list.find((x) => x.id === 'pold00001').regionName, '정자동');
  assert.deepEqual([...store.m.keys()].sort(), ['pold00001', 'pold00002']);
  const acct = await accountKey(u);
  for (const r of store.m.values()) { assert.equal(r.cloud, 'synced'); assert.equal(r.account, acct); }
  assert.ok(storage.m.has('bumpinto.photoCloud.migrated.' + acct));
  const puts = log.filter((l) => l.startsWith('PUT')).length;
  assert.equal(await c.sync(), false); assert.equal(log.filter((l) => l.startsWith('PUT')).length, puts, 'second sync uploads nothing');
  assert.equal(C.objects.size, 2);
  ok('client: first-login migration uploads once, dedupes identical bytes, idempotent');

  // 두 번째 PC: 빈 기기 → 서버 사진을 받아 썸네일까지 만들어 저장
  const store2 = memStore(); thumbs.length = 0;
  const c2 = createPhotoCloud({ sms: smsFor(u), store: store2, makeThumb, fetch: fetchTo(C.env), storage: memStorage() });
  assert.equal(await c2.sync(), true);
  assert.deepEqual([...store2.m.keys()].sort(), ['pold00001', 'pold00002']);
  const got = store2.m.get('pold00002');
  assert.deepEqual(new Uint8Array(await got.blob.arrayBuffer()), jpeg(2)); assert.equal(got.caption, 'c2'); assert.equal(got.takenAt, T0 + 2000);
  assert.equal(got.regionEnName, 'Jeongja-dong'); assert.ok(got.thumb); assert.equal(thumbs.length, 2);
  ok('client: second PC downloads originals + makes thumbnails + keeps metadata');

  // PC2 에서 새로 찍고 캡션 바꾸고 하나 지움 → PC1 동기화에 반영
  await store2.addPhoto(localRec('pnew00001', 7, 9000)); await c2.sync();
  await store2.updatePhoto('pold00001', { caption: '바꾼 캡션' }); await c2.captioned('pold00001', '바꾼 캡션');
  const gone = await store2.getPhoto('pold00002'); await store2.deletePhoto('pold00002'); await c2.removed(gone);
  assert.equal(await c.sync(), true);
  assert.deepEqual([...store.m.keys()].sort(), ['pnew00001', 'pold00001']);
  assert.equal(store.m.get('pold00001').caption, '바꾼 캡션');
  assert.equal(C.objects.size, 2);
  ok('client: new photo / caption / delete on PC2 show up on PC1');
}
{
  // 오프라인: 지우기·캡션은 기억했다가 다시 연결되면 서버에 반영
  const C = makeEnv(); const u = await join(C.env, '오프'); let down = false; const storage = memStorage();
  const store = memStore(); await store.addPhoto(localRec('poff00001', 1, 1000)); await store.addPhoto(localRec('poff00002', 2, 2000));
  const c = createPhotoCloud({ sms: smsFor(u), store, makeThumb, fetch: fetchTo(C.env, { down: () => down }), storage });
  await c.sync(); assert.equal(C.objects.size, 2);
  down = true;
  const rec = await store.getPhoto('poff00001'); await store.deletePhoto('poff00001'); await c.removed(rec);
  await store.updatePhoto('poff00002', { caption: '오프라인 캡션' }); await c.captioned('poff00002', '오프라인 캡션');
  assert.equal((await store.getPhoto('poff00002')).dirty, true);
  assert.equal(await c.sync(), false); assert.equal(c.off, false, 'network errors do not disable the cloud');
  // 그사이 새로 찍은 사진도
  await store.addPhoto(localRec('poff00003', 3, 3000));
  down = false;
  await c.sync();
  const items = (await req(C.env, 'GET', '/photos', { id: u })).json.items;
  assert.deepEqual(items.map((x) => x.id).sort(), ['poff00002', 'poff00003']);
  assert.equal(items.find((x) => x.id === 'poff00002').caption, '오프라인 캡션');
  assert.equal((await store.getPhoto('poff00002')).dirty, false);
  assert.deepEqual(JSON.parse(storage.getItem('bumpinto.photoCloud.deleted'))[await accountKey(u)], []);
  ok('client: offline delete/caption/new photo are replayed on reconnect');
}
{
  // 같은 PC 를 두 계정이: 다른 계정으로 동기화된 사진은 감추고, 그 사진을 내 계정에 올리지 않는다
  const C = makeEnv(); const a = await join(C.env, '가'); const b = await join(C.env, '나');
  const store = memStore(); await store.addPhoto(localRec('pshare001', 1, 1000));
  await createPhotoCloud({ sms: smsFor(a), store, makeThumb, fetch: fetchTo(C.env), storage: memStorage() }).sync();
  const cb = createPhotoCloud({ sms: smsFor(b), store, makeThumb, fetch: fetchTo(C.env), storage: memStorage() });
  await cb.sync();
  assert.equal((await req(C.env, 'GET', '/photos', { id: b })).json.items.length, 0);
  assert.equal((await cb.visible(await store.listPhotos())).length, 0);
  assert.equal(store.m.size, 1, "a's photo stays cached on the device");
  ok("client: another account's synced photos are hidden and not re-uploaded");
}
{
  // 서버 한도가 차면 남는 기기 사진은 기기에만 둔다(오류 없이)
  const C = makeEnv(); const u = await join(C.env, '한도');
  for (let i = 0; i < 20; i++) await put(C.env, u, `ps${String(i).padStart(6, '0')}`, jpeg(300 + i), { m: { takenAt: Date.now() - 5000 + i } });
  const store = memStore(40); await store.addPhoto(localRec('plocalxx1', 1, 1000));
  const c = createPhotoCloud({ sms: smsFor(u), store, makeThumb, fetch: fetchTo(C.env), storage: memStorage() });
  await c.sync();
  assert.equal((await req(C.env, 'GET', '/photos', { id: u })).json.items.length, 20);
  assert.equal(store.m.get('plocalxx1').cloud, undefined, 'kept local-only');
  assert.equal(store.m.size, 21);
  ok('client: server album full → extra local photo stays local-only');
}
console.log(`photo-cloud: ${n} checks passed`);
