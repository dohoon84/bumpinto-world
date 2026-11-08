// [notice-images] 게시판 공지(category === 'notice')에 붙는 이미지.
//   주소 목록만 글에 저장한다. 바이트는 워커가 기존 R2(PHOTOS)의 notices/ 접두어에 두고
//   /notice-images/<id> 로 공개한다. ?noticeimg=0 이면 화면·작성란을 지금(텍스트만)과 같이 끈다.
//   이 파일은 DOM 없이도 불러 쓸 수 있다(서버·단위 테스트).

export const NOTICE_IMAGE_MAX = 8;
export const NOTICE_IMAGE_URL_MAX = 2048;
export const NOTICE_IMAGE_ALT_MAX = 80;
export const NOTICE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const NOTICE_IMAGE_LOCAL_MAX_BYTES = 600 * 1024;
export const NOTICE_IMAGE_ID_RE = /^n[a-z0-9]{8,40}$/;
const DATA_URL_MAX = 900_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function searchParams(search) {
  if (search instanceof URLSearchParams) return search;
  const raw = search == null
    ? (typeof location !== 'undefined' ? location.search : '')
    : String(search);
  return new URLSearchParams(raw.startsWith('?') || raw === '' ? raw : `?${raw}`);
}

/** 기본 켜짐. ?noticeimg=0 만 끈다. */
export function noticeImagesEnabled(search) {
  try {
    return searchParams(search).get('noticeimg') !== '0';
  } catch {
    return true;
  }
}

/** 로컬 작성 화면 확인용. 배포 호스트에서는 절대 켜지지 않는다. */
export function noticeImagesDemo(search) {
  try {
    if (searchParams(search).get('noticeimgdemo') !== '1') return false;
    if (typeof location === 'undefined') return false;
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
  } catch {
    return false;
  }
}

export function noticeImagesColumnPresent(columns) {
  return Array.isArray(columns) && columns.some((c) => c?.name === 'images');
}

function parseStored(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function cleanAlt(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTICE_IMAGE_ALT_MAX);
}

function cleanUrl(value, allowData) {
  const url = String(value ?? '').trim();
  if (!url || /[\u0000-\u001f\s]/.test(url)) return '';
  // 로컬 게시판만 data URL 을 둔다. https 주소·/notice-images 경로는 2048자.
  if (allowData && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(url)) {
    return url.length <= DATA_URL_MAX ? url : '';
  }
  if (url.length > NOTICE_IMAGE_URL_MAX) return '';
  if (url.startsWith('/notice-images/')) {
    const id = url.slice('/notice-images/'.length).split(/[?#]/)[0];
    return NOTICE_IMAGE_ID_RE.test(id) ? `/notice-images/${id}` : '';
  }
  if (allowData && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(url)) {
    return url.length <= DATA_URL_MAX ? url : '';
  }
  let parsed;
  try { parsed = new URL(url); } catch { return ''; }
  if (parsed.username || parsed.password) return '';
  if (parsed.protocol === 'https:') return parsed.toString();
  if (parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname)) return parsed.toString();
  return '';
}

/** @returns {{url:string, alt?:string}[]} */
export function sanitizeNoticeImages(input, { allowData = false } = {}) {
  const list = parseStored(input);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const url = cleanUrl(typeof item === 'string' ? item : item?.url, allowData);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const alt = cleanAlt(typeof item === 'string' ? '' : item?.alt);
    out.push(alt ? { url, alt } : { url });
    if (out.length >= NOTICE_IMAGE_MAX) break;
  }
  return out;
}

/** 공지가 아니거나 컬럼을 안 읽었으면 빈 배열. */
export function readPostImages(row, { allowData = false } = {}) {
  if (!row || row.category !== 'notice' || !('images' in row)) return [];
  return sanitizeNoticeImages(row.images, { allowData });
}

export function galleryHtml(images, esc, { allowData = true } = {}) {
  const list = sanitizeNoticeImages(images, { allowData });
  if (!list.length || typeof esc !== 'function') return '';
  const buttons = list.map((img, i) => (
    `<button type="button" class="ni-thumb" data-ni-open data-ni-i="${i}" aria-label="${esc(img.alt || '이미지 크게 보기')}">` +
    `<img src="${esc(img.url)}" alt="${esc(img.alt || '')}" draggable="false" /></button>`
  )).join('');
  return `<div class="ni-row" data-ni-gallery>${buttons}</div>`;
}

export function readNoticeImageFile(file, maxBytes = NOTICE_IMAGE_LOCAL_MAX_BYTES) {
  const type = String(file?.type || '');
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    const err = new Error('bad_type');
    err.code = 'bad_type';
    throw err;
  }
  if (file.size > maxBytes) {
    const err = new Error('too_big');
    err.code = 'too_big';
    throw err;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      const clean = sanitizeNoticeImages([{ url, alt: '' }], { allowData: true });
      if (!clean.length) {
        const err = new Error('bad_type');
        err.code = 'bad_type';
        reject(err);
        return;
      }
      resolve(clean[0]);
    };
    reader.onerror = () => {
      const err = new Error('bad_type');
      err.code = 'bad_type';
      reject(err);
    };
    reader.readAsDataURL(file);
  });
}

let lightboxImages = [];
let lightboxIndex = 0;
let lightboxOnKey = null;

export function noticeLightboxOpen() {
  return typeof document !== 'undefined' && !!document.getElementById('ni-lightbox');
}

function lightboxStep(delta) {
  if (lightboxImages.length < 2) return;
  lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
  paintLightbox();
}

function paintLightbox() {
  const root = document.getElementById('ni-lightbox');
  if (!root) return;
  const img = lightboxImages[lightboxIndex];
  const photo = root.querySelector('img');
  const cap = root.querySelector('figcaption');
  if (photo) {
    photo.src = img.url;
    photo.alt = img.alt || '';
  }
  if (cap) cap.textContent = lightboxImages.length > 1 ? `${lightboxIndex + 1} / ${lightboxImages.length}` : (img.alt || '');
  root.querySelectorAll('[data-ni-prev],[data-ni-next]').forEach((btn) => {
    btn.hidden = lightboxImages.length < 2;
  });
}

export function closeNoticeLightbox() {
  const root = document.getElementById('ni-lightbox');
  if (lightboxOnKey) {
    document.removeEventListener('keydown', lightboxOnKey, true);
    lightboxOnKey = null;
  }
  root?.remove();
  lightboxImages = [];
  lightboxIndex = 0;
}

export function openNoticeLightbox(images, index = 0) {
  const list = sanitizeNoticeImages(images, { allowData: true });
  if (!list.length || typeof document === 'undefined') return;
  closeNoticeLightbox();
  lightboxImages = list;
  lightboxIndex = Math.max(0, Math.min(list.length - 1, Number(index) || 0));
  const root = document.createElement('div');
  root.id = 'ni-lightbox';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML =
    '<button type="button" class="ni-x" data-ni-close aria-label="닫기">×</button>' +
    '<button type="button" class="ni-nav prev" data-ni-prev aria-label="이전">‹</button>' +
    '<figure class="ni-frame"><img alt="" /><figcaption></figcaption></figure>' +
    '<button type="button" class="ni-nav next" data-ni-next aria-label="다음">›</button>';
  let touchX = null;
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-ni-close]') || e.target === root) {
      e.preventDefault();
      e.stopPropagation();
      closeNoticeLightbox();
      return;
    }
    if (e.target.closest('[data-ni-prev]')) { e.preventDefault(); e.stopPropagation(); lightboxStep(-1); }
    if (e.target.closest('[data-ni-next]')) { e.preventDefault(); e.stopPropagation(); lightboxStep(1); }
  });
  root.addEventListener('touchstart', (e) => {
    touchX = e.changedTouches?.[0]?.clientX ?? null;
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = (e.changedTouches?.[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(dx) < 40) return;
    lightboxStep(dx < 0 ? 1 : -1);
  }, { passive: true });
  lightboxOnKey = (e) => {
    if (!noticeLightboxOpen()) return;
    if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === 'Escape') closeNoticeLightbox();
    else if (e.key === 'ArrowLeft') lightboxStep(-1);
    else if (e.key === 'ArrowRight') lightboxStep(1);
  };
  document.addEventListener('keydown', lightboxOnKey, true);
  document.body.appendChild(root);
  paintLightbox();
  root.querySelector('[data-ni-close]')?.focus();
}
