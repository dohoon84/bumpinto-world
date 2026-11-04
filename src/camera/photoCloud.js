// [photo-cloud] 사진 보관함을 번호 서버(server/phone 의 /photos)와 맞춘다 — 다른 PC 에서 로그인해도 같은 사진.
//
// 원칙
//   · 화면은 언제나 기기 저장소(IndexedDB, photoStore.js)를 먼저 그린다. 서버는 그 뒤에 맞춰 주는 "동기화 대상"일 뿐이라
//     서버가 없거나 느리거나 꺼져 있어도 사진 앱은 예전처럼 동작한다(오프라인 캐시·대체 저장소).
//   · 서버에 /photos 가 없으면(404 — 아직 배포 전) 이번 페이지에서는 조용히 끈다. 네트워크 오류는 다음 동기화 때 다시.
//   · ?photoCloud=0 이면 아예 쓰지 않는다. 번호 서버를 안 쓰는 판(?sms=off, 로컬 개발 기본값)도 마찬가지.
//   · 처음 로그인한 기기에 있던 사진은 한 번 올린다(이주). 서버가 같은 id·같은 바이트를 알아보고 한 장으로 합친다.
//
// 기기 레코드에 붙는 필드 (IndexedDB 스키마 버전은 그대로 — 필드만 늘어난다)
//   account : 이 사진이 속한 계정의 해시(서버 R2 접두어와 같은 값). 계정 id 자체는 저장하지 않는다.
//   cloud   : 'synced' — 서버에 있음 (없으면 아직 안 올라간 기기 사진)
//   dirty   : 오프라인일 때 바꾼 캡션 — 다음 동기화 때 서버로 보낸다

const DELETED_KEY = 'bumpinto.photoCloud.deleted'; // 오프라인에서 지운 사진 → 다음에 서버에서도 지운다
const MIGRATED_KEY = 'bumpinto.photoCloud.migrated.'; // + account: 처음 이주를 끝낸 계정

export function photoCloudEnabled(params) {
  try { return (params || new URLSearchParams(location.search)).get('photoCloud') !== '0'; } catch { return true; }
}

// [mobile] 보안 연결이 아닌 곳(LAN http://192.168…)에서는 crypto.subtle 이 없다 → 같은 결과의 순수 JS SHA-256 으로
const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256js(bytes) {
  const n = bytes.length, L = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(L);
  m.set(bytes); m[n] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(L - 4, n * 8 >>> 0); dv.setUint32(L - 8, Math.floor(n / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
  const ror = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < L; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[i - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
}
export async function accountKey(id) {
  const src = new TextEncoder().encode(`bumpinto-photos:${id}`);
  const d = globalThis.crypto?.subtle?.digest ? new Uint8Array(await crypto.subtle.digest('SHA-256', src)) : sha256js(src);
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const META_FIELDS = ['caption', 'takenAt', 'w', 'h', 'region', 'regionName', 'regionEnName', 'x', 'z'];

/**
 * @param {object} o
 * @param {object} o.sms         createSms() — base · id · session
 * @param {object} o.store       { listPhotos, getPhoto, addPhoto, updatePhoto, deletePhoto }
 * @param {(blob:Blob)=>Promise<Blob>} o.makeThumb
 * @param {boolean} [o.enabled]  ?photoCloud=0 이면 false
 * @param {typeof fetch} [o.fetch]
 * @param {Storage} [o.storage]
 */
export function createPhotoCloud({ sms, store, makeThumb, enabled = true, fetch: fetchImpl = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage }) {
  let off = !enabled; // true 가 되면 이 페이지에서는 다시 켜지 않는다(404 = 배포 전)
  let running = null;
  let acct = '', acctOf = '';
  let lastError = '';

  const ready = () => !off && !!sms?.base && !!sms?.session && !sms.session.off && !!sms.id && !!fetchImpl;
  async function account() {
    if (!sms?.id) return '';
    if (acctOf !== sms.id) { acct = await accountKey(sms.id); acctOf = sms.id; }
    return acct;
  }

  // 응답: { status, data, blob } · 네트워크 오류면 null · /photos 가 없으면 off 로 바꾸고 null
  async function call(method, path, { body, headers = {}, as = 'json' } = {}) {
    let res;
    try {
      res = await fetchImpl(`${sms.base}/photos${path}`, { method, body, headers: { Authorization: `Bearer ${sms.id}`, ...headers } });
    } catch {
      lastError = 'offline';
      return null;
    }
    if (as === 'blob' && res.ok) return { status: res.status, blob: await res.blob() };
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 404 && (!data || data.error === 'not_found')) { off = true; lastError = 'not_deployed'; return null; } // 라우트 없음
    if (res.status === 401) { lastError = 'unauthorized'; return null; } // 계정이 서버에 없음 — 기기 저장만
    return { status: res.status, data };
  }

  // 오프라인 삭제 목록 { [account]: [photoId…] }
  const readDeleted = () => { try { return JSON.parse(storage?.getItem(DELETED_KEY) || '{}') || {}; } catch { return {}; } };
  const writeDeleted = (v) => { try { storage?.setItem(DELETED_KEY, JSON.stringify(v)); } catch {} };
  function queueDelete(a, id) { const v = readDeleted(); v[a] = [...new Set([...(v[a] || []), id])].slice(-100); writeDeleted(v); }

  async function upload(rec, a) {
    const full = rec.blob ? rec : await store.getPhoto(rec.id);
    if (!full?.blob) return { skip: true };
    const meta = {};
    for (const k of META_FIELDS) if (full[k] != null && full[k] !== '') meta[k] = full[k];
    const r = await call('PUT', `/${encodeURIComponent(full.id)}`, {
      body: full.blob,
      headers: { 'Content-Type': full.blob.type || 'image/jpeg', 'X-Photo-Meta': encodeURIComponent(JSON.stringify(meta)) },
    });
    if (!r) return { stop: true };
    if (r.data?.ok) {
      if (r.data.photo && r.data.photo.id !== full.id) await store.deletePhoto(full.id); // 같은 사진이 이미 다른 id 로 있음 → 그쪽을 받는다
      else await store.updatePhoto(full.id, { cloud: 'synced', account: a, dirty: false });
      return { ok: true };
    }
    if (r.data?.error === 'album_full' || r.data?.error === 'rate') return { stop: true, error: r.data.error };
    return { error: r.data?.error || 'server' }; // 형식이 틀린 사진 등 — 기기에만 둔다
  }

  async function run() {
    const a = await account();
    if (!a) return false;
    let changed = false;

    // 1) 오프라인에서 지운 것부터 서버에서도 지운다
    const del = readDeleted();
    for (const id of [...(del[a] || [])]) {
      const r = await call('DELETE', `/${encodeURIComponent(id)}`);
      if (!r) return changed;
      if (r.data?.ok || r.status === 404) { del[a] = del[a].filter((x) => x !== id); writeDeleted(del); }
    }

    // 2) 서버 목록
    let r = await call('GET', '');
    if (!r?.data?.ok) return changed;
    let items = r.data.items || [];
    let max = r.data.max || 20;

    // 3) 이 계정(또는 아직 주인 없는) 기기 사진 중 서버에 없는 것 올리기 — 첫 로그인 이주 포함, 오래된 것부터
    const serverIds = new Set(items.map((it) => it.id));
    const local = await store.listPhotos();
    const mine = (l) => !l.account || l.account === a;
    let uploaded = false, stopped = false;
    for (const l of [...local].filter(mine).sort((x, y) => x.takenAt - y.takenAt)) {
      if (serverIds.has(l.id)) {
        if (l.cloud !== 'synced' || l.account !== a) { await store.updatePhoto(l.id, { cloud: 'synced', account: a }); changed = true; }
        continue;
      }
      if (l.cloud === 'synced') continue; // 다른 기기에서 지운 사진 — 아래 5)에서 정리
      if (serverIds.size >= max) { stopped = true; break; }
      const u = await upload(l, a);
      if (u.ok) { uploaded = true; changed = true; serverIds.add(l.id); }
      if (u.stop) { stopped = true; break; }
    }
    if (!stopped) try { storage?.setItem(MIGRATED_KEY + a, String(Date.now())); } catch {}
    if (uploaded) {
      r = await call('GET', '');
      if (!r?.data?.ok) return changed;
      items = r.data.items || []; max = r.data.max || max;
    }

    // 4) 서버에만 있는 사진은 받아서 기기에 저장(썸네일은 여기서 만든다)
    const after = await store.listPhotos();
    const have = new Map(after.map((l) => [l.id, l]));
    for (const it of items) {
      const l = have.get(it.id);
      if (l) {
        // 캡션: 기기에서 오프라인으로 바꾼 게 있으면 서버로, 아니면 서버 값을 따른다
        if (l.dirty) {
          const p = await call('PATCH', `/${encodeURIComponent(it.id)}`, { body: JSON.stringify({ caption: l.caption || '' }), headers: { 'Content-Type': 'application/json' } });
          if (p?.data?.ok) { await store.updatePhoto(it.id, { dirty: false }); }
        } else if ((l.caption || '') !== (it.caption || '')) { await store.updatePhoto(it.id, { caption: it.caption || '' }); changed = true; }
        continue;
      }
      const g = await call('GET', `/${encodeURIComponent(it.id)}`, { as: 'blob' });
      if (!g?.blob) { if (!g) return changed; continue; }
      let thumb = g.blob;
      try { thumb = await makeThumb(g.blob); } catch {}
      const rec = { id: it.id, blob: g.blob, thumb, tipId: 0, cloud: 'synced', account: a, dirty: false };
      for (const k of META_FIELDS) rec[k] = it[k] ?? (k === 'caption' ? '' : null);
      rec.region ||= ''; rec.regionName ||= ''; rec.regionEnName ||= '';
      try { await store.addPhoto(rec); changed = true; } catch (err) { if (err?.code === 'album_full') break; }
    }

    // 5) 서버에서 지워진(다른 PC 에서 지운) 사진은 기기에서도 뺀다
    const live = new Set(items.map((it) => it.id));
    for (const l of after) {
      if (l.cloud === 'synced' && l.account === a && !live.has(l.id)) { await store.deletePhoto(l.id); changed = true; }
    }
    return changed;
  }

  return {
    get active() { return ready(); },
    get off() { return off; },
    get lastError() { return lastError; },
    account,
    /** 서버와 맞춘다. 바뀐 게 있으면 true. 동시에 여러 번 불러도 한 번만 돈다. */
    sync() {
      if (!ready()) return Promise.resolve(false);
      if (!running) running = run().catch(() => false).finally(() => { running = null; });
      return running;
    },
    /** 이 화면에 보일 사진: 다른 계정으로 동기화된 사진은 감춘다(같은 PC 를 여럿이 쓸 때). */
    async visible(list) {
      if (!ready()) return list;
      const a = await account();
      return list.filter((l) => !l.account || l.account === a);
    },
    /** 기기에서 지운 뒤 부른다. 서버에도 있던 사진이면 지우고, 안 되면 다음 동기화 때 지운다. */
    async removed(rec) {
      if (rec?.cloud !== 'synced' || !rec.account || off) return;
      if (ready() && (await account()) === rec.account) {
        const r = await call('DELETE', `/${encodeURIComponent(rec.id)}`);
        if (r && (r.data?.ok || r.status === 404)) return;
      }
      if (!off) queueDelete(rec.account, rec.id);
    },
    /** 캡션을 기기에 저장한 뒤 부른다. */
    async captioned(id, caption) {
      const rec = await store.getPhoto(id);
      if (rec?.cloud !== 'synced' || off) return;
      if (ready() && (await account()) === rec.account) {
        const r = await call('PATCH', `/${encodeURIComponent(id)}`, { body: JSON.stringify({ caption }), headers: { 'Content-Type': 'application/json' } });
        if (r?.data?.ok) { if (rec.dirty) await store.updatePhoto(id, { dirty: false }); return; }
      }
      await store.updatePhoto(id, { dirty: true });
    },
  };
}
