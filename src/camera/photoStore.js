// [camera] 사진 보관함 — IndexedDB 에 JPEG Blob 으로만 저장 (localStorage 용량·base64 낭비를 피함).
// 상한: 최대 MAX_PHOTOS 장, 원본 긴 변 1280px(JPEG q≈0.86, 보통 120~350KB), 썸네일 긴 변 240px.
// 가득 차면 오래된 사진을 몰래 지우지 않고 저장을 거절한다(사용자가 지우거나 내려받게).
export const MAX_PHOTOS = 20;
const DB_NAME = 'bumpinto.photos';
const STORE = 'photos';

let dbPromise = null;

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no_idb')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('takenAt', 'takenAt');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('idb_blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  const t = db.transaction(STORE, mode);
  const out = await fn(t.objectStore(STORE));
  await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error('abort')); });
  return out;
}

export function newPhotoId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 목록(최신순). 원본 blob 은 빼고 썸네일만 돌려준다. */
export async function listPhotos() {
  const all = await tx('readonly', (s) => req(s.getAll()));
  return all
    .sort((a, b) => b.takenAt - a.takenAt)
    .map(({ blob, ...meta }) => meta);
}

export async function countPhotos() {
  return tx('readonly', (s) => req(s.count()));
}

export async function getPhoto(id) {
  return tx('readonly', (s) => req(s.get(id)));
}

/** rec: { id, blob, thumb, w, h, caption, takenAt, region, regionName } */
export async function addPhoto(rec) {
  return tx('readwrite', async (s) => {
    const n = await req(s.count());
    if (n >= MAX_PHOTOS) { const e = new Error('album_full'); e.code = 'album_full'; throw e; }
    await req(s.put(rec));
    return rec.id;
  });
}

export async function updatePhoto(id, patch) {
  return tx('readwrite', async (s) => {
    const cur = await req(s.get(id));
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await req(s.put(next));
    return next;
  });
}

export async function deletePhoto(id) {
  return tx('readwrite', (s) => req(s.delete(id)));
}

export function closeStore() {
  const p = dbPromise;
  dbPromise = null;
  p?.then((db) => db.close()).catch(() => {});
}
