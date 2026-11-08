import { trackEvent } from './analytics.js';
import { CONTRIBUTORS, CONTRIBUTION_AREAS, REPO_URL } from './contributors.js';
import { NOTICE_POSTS, NOTICE_BY_KEY } from './notices.js';
import { isEn, tr, toggleLang, onLangChange } from './i18n.js';
import { gicon, giOn } from './ui-v2/gameIcons.js';
import { smsBase } from './sms.js';
import {
  NOTICE_IMAGE_MAX,
  closeNoticeLightbox,
  galleryHtml,
  noticeImagesDemo,
  noticeImagesEnabled,
  noticeLightboxOpen,
  openNoticeLightbox,
  sanitizeNoticeImages,
} from './noticeImages.js'; // [notice-images]

// [game-icons] PC HUD v3(body.hud-v3) 에서만: 머리·버튼·탭의 이모지를 공용 게임 아이콘으로 바꾼다. 예전 HUD·모바일은 그대로.
const BOARD_EMOJI = { '📋': 'board', '🌍': 'heart', '🌐': 'lang', '📢': 'megaphone', '📌': 'pushpin' };
function v3BoardIcons(root) {
  if (!document.body.classList.contains('hud-v3') || !giOn()) return;
  root.classList.add('bd-v3');
  root.querySelectorAll('.board-header h1, .board-header .board-btn, .board-cat, .pin-icon, .board-btn[data-action]').forEach((el) => {
    const t = el.firstChild;
    if (!t || t.nodeType !== 3) return;
    const m = /^\s*(📋|🌍|🌐|📢|📌)\uFE0F?\s*/u.exec(t.data);
    if (m) { t.data = t.data.slice(m[0].length); el.insertAdjacentHTML('afterbegin', gicon(BOARD_EMOJI[m[1]], el.tagName === 'H1' ? 22 : 16, 'bd-gi')); }
    else if (el.dataset.action === 'write' && /^\s*\+\s*/.test(t.data)) { t.data = t.data.replace(/^\s*\+\s*/, ''); el.insertAdjacentHTML('afterbegin', gicon('pencil', 16, 'bd-gi')); }
  });
}

// [economy] 서버가 글 보상·회수를 원장에 넣었으면(res.econ) 경제 클라이언트가 바로 새로 읽게 알린다 → 보상 토스트(kind 'board')
function econChanged(res) {
  if (!res?.econ) return;
  try { dispatchEvent(new CustomEvent('bw:econ-changed', { detail: { source: 'board' } })); } catch { /* noop */ }
}

// 게임 내 커뮤니티 게시판 (우측 버튼 클릭 시 모달 오픈, 카테고리·20행 페이징·등록/수정/삭제 + 함께 만들기/명예의 전당)

const CATEGORIES = [
  { key: 'all', label: '전체', enLabel: 'All' },
  { key: 'notice', label: '📢 공지사항', enLabel: '📢 Notices', badge: '공지', enBadge: 'Notice' },
  { key: 'intro', label: '소개', enLabel: 'Intro', badge: '소개', enBadge: 'Intro' },
  { key: 'feedback', label: '피드백', enLabel: 'Feedback', badge: '피드백', enBadge: 'Feedback' },
  { key: 'food', label: '주변맛집', enLabel: 'Local Spots', badge: '주변맛집', enBadge: 'Spots' },
  { key: 'free', label: '자유', enLabel: 'General', badge: '자유', enBadge: 'General' },
];

const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function catLabelOf(key, asBadge = false) {
  const c = CAT_BY_KEY[key];
  if (!c) return key;
  if (isEn()) return asBadge ? (c.enBadge || c.enLabel) : c.enLabel;
  return asBadge ? (c.badge || c.label) : c.label;
}

// 시스템 기본 시드 글/공지사항을 현재 UI 언어(KO/EN)에 맞춰 표시
const SEED_TRANSLATIONS = [
  {
    koTitle: 'Bumpinto World 정자역 오픈월드에 오신 것을 환영합니다!',
    enTitle: 'Welcome to Bumpinto World — 3D Open World!',
    enAuthorName: 'CrazyLabs',
    enBody: [
      'Welcome to Bumpinto World! Explore real-world neighborhoods built from OpenStreetMap data.',
      '',
      '• Move with WASD / Arrow keys, and press E near a yellow bike to ride.',
      '• Switch between Korea (Jeongja Station) and USA (Starbase, TX) from the 3D globe.',
      '• Use the bottom-right smartphone to send SMS, save contacts, and set a Recovery PIN.',
      '• Feel free to introduce yourself, share feedback, or recommend local spots on this board!',
    ].join('\n'),
  },
  {
    koTitle: '정자역 카페거리·탄천 산책로 주변 숨은 맛집을 추천해 주세요',
    enTitle: 'Recommend your favorite local cafes, restaurants, or spots!',
    enAuthorName: 'LocalExplorer',
    enBody: 'Know a great cafe near Jeongja Cafe Street, Naver 1784, or Astropub / Boca Chica Beach in Starbase? Share your favorite spots in this category!',
  },
  {
    koTitle: '월드 이용 피드백 및 건의사항을 남겨 주세요',
    enTitle: 'Share your feedback & feature ideas for Bumpinto World',
    enAuthorName: 'CrazyLabs',
    enBody: 'Have suggestions for movement, transit, new neighborhoods, Roadster Show, or multiplayer features? Leave your feedback here—we read every post!',
  },
];

function localizePost(item) {
  if (!item) return item;
  const en = isEn();
  let notice = item.noticeKey ? NOTICE_BY_KEY[item.noticeKey] : null;
  if (!notice && item.category === 'notice') {
    notice = NOTICE_POSTS.find((n) => n.title === item.title || n.enTitle === item.title) || null;
  }
  if (notice) {
    return {
      ...item,
      title: en ? (notice.enTitle || notice.title) : notice.title,
      authorName: en ? (notice.enAuthorName || notice.authorName || item.authorName) : (notice.authorName || item.authorName),
      body: en ? (notice.enBody || notice.body || item.body) : (notice.body || item.body),
    };
  }
  const seed = SEED_TRANSLATIONS.find((s) => s.koTitle === item.title || s.enTitle === item.title);
  if (seed) {
    return {
      ...item,
      title: en ? seed.enTitle : seed.koTitle,
      authorName: en ? seed.enAuthorName : item.authorName,
      body: en ? seed.enBody : item.body,
    };
  }
  return item;
}

function isBoardAdmin(session) {
  if (noticeImagesDemo() && !smsBase()) return true; // [notice-images] localhost 데모에서만 공지 작성란
  return Boolean(session?.isAdmin);
}
const BOARD_SEEN_KEY = 'jeongja3d.board.seenId';
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readSeenPostId() {
  try {
    return Number(localStorage.getItem(BOARD_SEEN_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeSeenPostId(id) {
  const next = Math.max(readSeenPostId(), Number(id) || 0);
  if (!next) return;
  try {
    localStorage.setItem(BOARD_SEEN_KEY, String(next));
  } catch {}
}

function isNewPost(item, now = Date.now()) {
  if (!item?.createdAt) return false;
  return now - Number(item.createdAt) <= NEW_WINDOW_MS;
}

function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${mo}.${da} ${hh}:${mm}`;
}

export function mountBoard({ sms, getMe, onOpen } = {}) {
  const launcher = document.getElementById('board-Launcher');
  const launcherBadge = document.getElementById('board-new-badge');
  const contribLauncher = document.getElementById('contribute-launcher');
  const modal = document.getElementById('board-modal');
  if (!launcher || !modal) return { open: false, close() {} };

  let isOpen = false;
  let view = 'list'; // 'list' | 'detail' | 'form' | 'contribute'
  let category = 'all';
  let page = 1;
  let listData = { items: [], total: 0, page: 1, totalPages: 1, pageSize: 20 };
  let currentPost = null;
  let currentComments = [];
  let editingPost = null;
  let loading = false;
  let commentLoading = false;
  let likeLoading = false;
  let errorMsg = '';
  let hasUnreadNew = false;
  let draftImages = []; // [notice-images]
  let formSticky = null;

  function captureForm() {
    const form = modal.querySelector('.board-form');
    if (!form) return;
    formSticky = {
      title: form.title?.value ?? '',
      body: form.body?.value ?? '',
      category: form.category?.value || category,
    };
  }

  function resetFormDraft() {
    draftImages = [];
    formSticky = null;
  }

  function imageErrorText(err) {
    const code = err?.code;
    if (code === 'too_big') return tr('이미지가 너무 큽니다. 더 작은 jpg, png, webp 를 올려 주세요.', 'That image is too large. Use a smaller jpg, png, or webp.');
    if (code === 'bad_type') return tr('jpg, png, webp 이미지만 올릴 수 있습니다.', 'Only jpg, png, or webp images can be added.');
    if (code === 'no_storage') return tr('이미지 보관함이 아직 없습니다. https 주소를 붙여 주세요.', 'Image storage is not ready yet. Paste an https address instead.');
    if (code === 'notice_admin' || code === 'unauthorized' || code === 'forbidden') return tr('공지 이미지는 관리자만 올릴 수 있습니다.', 'Only an admin can upload notice images.');
    return err?.message || tr('이미지를 올리지 못했습니다.', 'Could not add that image.');
  }

  function renderNoticeImageField(en, cat) {
    if (!noticeImagesEnabled() || cat !== 'notice') return '';
    if (!isBoardAdmin(sms?.session) && editingPost?.category !== 'notice') return '';
    const thumbs = draftImages.length
      ? `<div class="ni-compose-grid" data-ni-gallery>${draftImages.map((img, i) => (
        `<div class="ni-compose-item">` +
        `<button type="button" class="ni-thumb" data-ni-open data-ni-i="${i}" aria-label="${esc(img.alt || (en ? 'Preview image' : '이미지 미리보기'))}">` +
        `<img src="${esc(img.url)}" alt="${esc(img.alt || '')}" draggable="false" /></button>` +
        `<button type="button" class="ni-x" data-ni-remove="${i}" aria-label="${en ? 'Remove image' : '이미지 빼기'}">×</button>` +
        `</div>`
      )).join('')}</div>`
      : '';
    return `
      <fieldset class="ni-compose">
        <legend>${en ? 'Notice images' : '공지 이미지'}</legend>
        <p>${en ? 'Up to 8 jpg, png, or webp images. They show on the notice list and in the post.' : 'jpg, png, webp 를 8장까지. 공지 목록과 본문에 보입니다.'}</p>
        ${thumbs}
        <label class="ni-file">${en ? 'Add images' : '이미지 추가'}
          <input name="noticeImages" type="file" accept="image/jpeg,image/png,image/webp" multiple ${draftImages.length >= NOTICE_IMAGE_MAX ? 'disabled' : ''} />
        </label>
        <div class="ni-url">
          <label class="grow">${en ? 'Or paste an https address' : '또는 https 주소'}
            <input name="noticeUrl" type="url" inputmode="url" placeholder="https://" maxlength="2048" />
          </label>
          <button type="button" class="board-btn" data-action="add-notice-url">${en ? 'Add' : '추가'}</button>
        </div>
      </fieldset>`;
  }

  function syncLaunchers() {
    launcher.classList.toggle('active', isOpen && view !== 'contribute');
    contribLauncher?.classList.toggle('active', isOpen && view === 'contribute');
    if (launcherBadge) {
      launcherBadge.hidden = !hasUnreadNew || (isOpen && view !== 'contribute');
    }
  }

  function updateNewStatusFromItems(items = [], markSeen = false) {
    if (!Array.isArray(items) || !items.length) return;
    const maxId = Math.max(0, ...items.map((it) => Number(it.id) || 0));
    const seenId = readSeenPostId();
    const now = Date.now();
    if (markSeen) {
      writeSeenPostId(maxId);
      hasUnreadNew = false;
    } else {
      const hasRecent = items.some((it) => isNewPost(it, now));
      hasUnreadNew = maxId > seenId && hasRecent;
    }
    syncLaunchers();
  }

  async function checkNewPosts() {
    if (isOpen && view !== 'contribute') return;
    try {
      const res = await sms.board('list', { category: 'all', page: 1 });
      updateNewStatusFromItems(res.items || [], false);
    } catch {
      /* 백그라운드 확인 실패 무시 */
    }
  }

  function setOpen(next, targetView = 'list') {
    if (!next) {
      if (!isOpen) return;
      isOpen = false;
      modal.hidden = true;
      closeNoticeLightbox();
      syncLaunchers();
      return;
    }
    isOpen = true;
    view = targetView;
    modal.hidden = false;
    errorMsg = '';
    syncLaunchers();
    if (view === 'contribute') {
      trackEvent('contribute_open');
      render();
    } else {
      trackEvent('board_open');
      try { onOpen?.(); } catch {} // [notice-popup] 게시판을 열면 공지 본 것으로 처리
      fetchList();
    }
  }

  async function fetchList(targetPage = page) {
    loading = true;
    errorMsg = '';
    render();
    try {
      const res = await sms.board('list', { category, page: targetPage });
      listData = {
        items: res.items || [],
        total: res.total || 0,
        page: res.page || 1,
        totalPages: res.totalPages || 1,
        pageSize: res.pageSize || 20,
      };
      page = listData.page;
      updateNewStatusFromItems(listData.items, isOpen && view !== 'contribute');
    } catch (err) {
      errorMsg = err.message || tr('게시글 목록을 불러오지 못했습니다.', 'Failed to load posts.');
    } finally {
      loading = false;
      render();
    }
  }

  async function openPost(postId, { noView = false } = {}) {
    loading = true;
    errorMsg = '';
    view = 'detail';
    if (!noView) {
      currentPost = null;
      currentComments = [];
    }
    render();
    try {
      const res = await sms.board('get', { postId, noView });
      currentPost = res.post;
      currentComments = res.comments || [];
    } catch (err) {
      errorMsg = err.message || tr('게시글을 불러오지 못했습니다.', 'Failed to load the post.');
    } finally {
      loading = false;
      render();
    }
  }

  function renderTabs() {
    return CATEGORIES.map(
      (c) =>
        `<button type="button" class="board-cat ${category === c.key ? 'on' : ''}" data-cat="${c.key}">${esc(catLabelOf(c.key, false))}</button>`,
    ).join('');
  }

  function renderPagination() {
    const en = isEn();
    const { page: cur, totalPages } = listData;
    const span = 5;
    const start = Math.max(1, cur - Math.floor(span / 2));
    const end = Math.min(totalPages, Math.max(1, start + span - 1));
    const realStart = Math.max(1, end - span + 1);
    const pages = [];
    for (let p = realStart; p <= end; p++) {
      pages.push(
        `<button type="button" class="board-page ${p === cur ? 'on' : ''}" data-page="${p}">${p}</button>`,
      );
    }
    return `
      <div class="board-paging">
        <button type="button" class="board-page nav" data-page="${Math.max(1, cur - 1)}" ${cur <= 1 ? 'disabled' : ''}>‹ ${en ? 'Prev' : '이전'}</button>
        ${pages.join('')}
        <button type="button" class="board-page nav" data-page="${Math.min(totalPages, cur + 1)}" ${cur >= totalPages ? 'disabled' : ''}>${en ? 'Next' : '다음'} ›</button>
      </div>`;
  }

  function renderListBody() {
    const en = isEn();
    if (loading && !listData.items.length) {
      return `<div class="board-empty">${en ? 'Loading posts…' : '게시글을 불러오는 중입니다…'}</div>`;
    }
    const rows = listData.items.length
      ? listData.items
          .map((rawItem) => {
            const item = localizePost(rawItem);
            const gallery = noticeImagesEnabled() && item.category === 'notice' ? galleryHtml(item.images, esc) : '';
            return `
          <tr class="board-row ${item.category === 'notice' ? 'is-notice' : ''}${gallery ? ' has-images' : ''}" data-post-id="${item.id}">
            <td class="col-id">${item.category === 'notice' ? `<span class="pin-icon" title="${en ? 'Pinned Notice' : '상단 고정 공지'}">📌</span>` : item.id}</td>
            <td class="col-cat"><span class="cat-badge cat-${esc(item.category)}">${esc(catLabelOf(item.category, true))}</span></td>
            <td class="col-title">
              <button type="button" class="title-btn" data-post-id="${item.id}">
                ${esc(item.title)}
                ${isNewPost(item) ? `<span class="post-new-icon" title="${en ? 'Posted within 24h' : '24시간 이내 새 글'}">N</span>` : ''}
                ${item.commentsCount > 0 ? `<span class="cmt-count">[${item.commentsCount}]</span>` : ''}
                ${item.mine ? `<em class="mine-tag">${en ? 'Mine' : '내 글'}</em>` : ''}
              </button>
              ${gallery}
            </td>
            <td class="col-author">${esc(item.authorName)}</td>
            <td class="col-date">${esc(fmtDate(item.createdAt))}</td>
            <td class="col-likes ${item.liked ? 'is-liked' : ''}">♥ ${item.likesCount || 0}</td>
            <td class="col-views">${item.views}</td>
          </tr>`;
          })
          .join('')
      : `<tr><td colspan="7" class="board-empty-row">${en ? 'No posts yet. Be the first to write one!' : '등록된 게시글이 없습니다. 첫 글을 남겨 보세요!'}</td></tr>`;

    return `
      <div class="board-toolbar">
        <div class="board-cats">${renderTabs()}</div>
        <button type="button" class="board-btn primary" data-action="write">${en ? '+ New Post' : '+ 글쓰기'}</button>
      </div>
      ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
      <div class="board-table-wrap">
        <table class="board-table">
          <thead>
            <tr>
              <th class="col-id">${en ? 'No.' : '번호'}</th>
              <th class="col-cat">${en ? 'Topic' : '분류'}</th>
              <th class="col-title">${en ? 'Title' : '제목'}</th>
              <th class="col-author">${en ? 'Author' : '작성자'}</th>
              <th class="col-date">${en ? 'Date' : '작성일'}</th>
              <th class="col-likes">${en ? 'Likes' : '좋아요'}</th>
              <th class="col-views">${en ? 'Views' : '조회'}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="board-footer">
        <span class="board-count">${
          en
            ? `Total <b>${listData.total}</b> posts · 20 per page (${listData.page}/${listData.totalPages})`
            : `총 <b>${listData.total}</b>건 · 페이지당 20행 (${listData.page}/${listData.totalPages})`
        }</span>
        ${renderPagination()}
      </div>`;
  }

  function renderDetailBody() {
    const en = isEn();
    if (loading && !currentPost) {
      return `<div class="board-empty">${en ? 'Loading post…' : '게시글을 불러오는 중입니다…'}</div>`;
    }
    if (!currentPost) {
      return `
        ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="back-list">‹ ${en ? 'Back to List' : '목록으로'}</button>
        </div>`;
    }
    const p = localizePost(currentPost);
    const gallery = noticeImagesEnabled() && p.category === 'notice' ? galleryHtml(p.images, esc) : '';
    const commentRows = currentComments.length
      ? currentComments
          .map(
            (c) => `
          <li class="board-cmt-item">
            <div class="board-cmt-head">
              <div class="board-cmt-author">
                <strong>${esc(c.authorName)}</strong>
                ${c.authorDisplay ? `<small>(${esc(c.authorDisplay)})</small>` : ''}
                ${c.mine ? `<em class="mine-tag">${en ? 'Mine' : '내 댓글'}</em>` : ''}
              </div>
              <div class="board-cmt-right">
                <time>${esc(fmtDate(c.createdAt))}</time>
                ${
                  c.mine
                    ? `<button type="button" class="board-cmt-del" data-comment-del="${c.id}" ${commentLoading ? 'disabled' : ''}>${en ? 'Delete' : '삭제'}</button>`
                    : ''
                }
              </div>
            </div>
            <p class="board-cmt-body">${esc(c.body)}</p>
          </li>`,
          )
          .join('')
      : `<li class="board-cmt-empty">${en ? 'No comments yet. Leave the first comment!' : '아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!'}</li>`;

    return `
      <div class="board-detail">
        <div class="board-detail-head">
          <div class="board-detail-top">
            <span class="cat-badge cat-${esc(p.category)}">${esc(catLabelOf(p.category, true))}</span>
            <h2>${esc(p.title)}</h2>
            ${isNewPost(p) ? `<span class="post-new-icon" title="${en ? 'Posted within 24h' : '24시간 이내 새 글'}">N</span>` : ''}
          </div>
          <div class="board-detail-meta">
            <span>${en ? 'By' : '작성자'} <b>${esc(p.authorName)}</b>${p.authorDisplay ? ` <small>(${esc(p.authorDisplay)})</small>` : ''}</span>
            <span>${en ? 'Date' : '작성일'} ${esc(fmtDate(p.createdAt))}${p.updatedAt && p.updatedAt > p.createdAt + 1000 ? (en ? ' · edited' : ' · 수정됨') : ''}</span>
            <span>${en ? 'Likes' : '좋아요'} <b>${p.likesCount || 0}</b></span>
            <span>${en ? 'Comments' : '댓글'} <b>${currentComments.length}</b></span>
            <span>${en ? 'Views' : '조회'} ${p.views}</span>
          </div>
        </div>
        ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
        <div class="board-detail-content">${esc(p.body)}</div>
        ${gallery ? `<div class="ni-detail">${gallery}</div>` : ''}
        <div class="board-like-bar">
          <button type="button" class="board-like-btn ${p.liked ? 'liked' : ''}" data-action="toggle-like" ${likeLoading ? 'disabled' : ''} aria-pressed="${!!p.liked}">
            <span class="heart">${p.liked ? '♥' : '♡'}</span>
            <span>${en ? 'Like' : '좋아요'}</span>
            <strong class="like-num">${p.likesCount || 0}</strong>
          </button>
        </div>
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="back-list">‹ ${en ? 'Back to List' : '목록으로'}</button>
          <div class="right-actions">
            ${
              p.canManage || p.mine
                ? `<button type="button" class="board-btn" data-action="edit">${en ? 'Edit' : '수정'}</button>
                   <button type="button" class="board-btn danger" data-action="delete">${en ? 'Delete' : '삭제'}</button>`
                : ''
            }
          </div>
        </div>
        <section class="board-comments" aria-label="Comments">
          <h3 class="board-cmt-title">💬 ${en ? 'Comments' : '댓글'} <span>${currentComments.length}</span></h3>
          <ul class="board-cmt-list">${commentRows}</ul>
          <form class="board-cmt-form" autocomplete="off">
            <textarea name="comment" rows="2" maxlength="500" placeholder="${en ? 'Leave a comment or thought (max 500 chars)' : '따뜻한 댓글이나 의견을 남겨 주세요 (최대 500자)'}" required></textarea>
            <button type="submit" class="board-btn primary" ${commentLoading ? 'disabled' : ''}>${en ? 'Post Comment' : '댓글 등록'}</button>
          </form>
        </section>
      </div>`;
  }

  function renderFormBody() {
    const en = isEn();
    const isEdit = !!editingPost;
    const admin = isBoardAdmin(sms?.session);
    const writableCats = CATEGORIES.filter((c) => c.key !== 'all' && (admin || c.key !== 'notice'));
    const picked = formSticky?.category || editingPost?.category || category;
    const titleVal = formSticky?.title ?? editingPost?.title ?? '';
    const bodyVal = formSticky?.body ?? editingPost?.body ?? '';
    const defaultCat = writableCats.some((c) => c.key === picked) ? picked : 'intro';
    const catOptions = writableCats
      .map(
        (c) =>
          `<option value="${c.key}" ${c.key === defaultCat ? 'selected' : ''}>${esc(catLabelOf(c.key, false))}</option>`,
      )
      .join('');
    return `
      <form class="board-form" autocomplete="off">
        <h3>${isEdit ? (en ? 'Edit Post' : '게시글 수정') : (en ? 'Write a New Post' : '새 게시글 작성')}</h3>
        <div class="board-form-row">
          <label>${en ? 'Category' : '분류'}
            <select name="category">${catOptions}</select>
          </label>
          <label class="grow">${en ? 'Title' : '제목'}
            <input name="title" maxlength="80" placeholder="${en ? 'Enter a title (max 80 chars)' : '제목을 입력해 주세요 (최대 80자)'}" value="${esc(titleVal)}" required />
          </label>
        </div>
        <label class="board-form-body">${en ? 'Content' : '내용'}
          <textarea name="body" rows="9" maxlength="2000" placeholder="${en ? 'Share intros, feedback, local spots, or anything about the world (max 2,000 chars)' : '인사말, 피드백, 주변 맛집 추천 등을 자유롭게 작성해 주세요 (최대 2,000자)'}" required>${esc(bodyVal)}</textarea>
        </label>
        ${renderNoticeImageField(en, defaultCat)}
        ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="cancel-form">${en ? 'Cancel' : '취소'}</button>
          <button type="submit" class="board-btn primary" ${loading ? 'disabled' : ''}>${isEdit ? (en ? 'Save Changes' : '수정 저장') : (en ? 'Publish' : '등록하기')}</button>
        </div>
      </form>`;
  }

  function renderContributeBody() {
    const en = isEn();
    const cards = CONTRIBUTION_AREAS.map(
      (a) => `
      <div class="contrib-card">
        <h3>${esc(en ? (a.enTitle || a.title) : a.title)}</h3>
        <p>${esc(en ? (a.enDesc || a.desc) : a.desc)}</p>
        <div class="contrib-reward">🏆 ${en ? 'Reward' : '보상'}: ${esc(en ? (a.enReward || a.reward) : a.reward)}</div>
      </div>`,
    ).join('');

    const hallOfFame = CONTRIBUTORS.map(
      (c) => `
      <div class="hof-item">
        <div class="hof-main">
          <span class="hof-badge">${esc(en ? (c.enBadge || c.badge) : c.badge)}</span>
          <strong>${esc(en ? (c.enName || c.name) : c.name)}</strong>
          <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.handle)}</a>
        </div>
        <p>${esc(en ? (c.enContribution || c.contribution) : c.contribution)}</p>
      </div>`,
    ).join('');

    return `
      <div class="contrib-wrap">
        <div class="contrib-banner">
          <div>
            <h2>${
              en
                ? '🌏 One person cannot build the whole world — so we build it together'
                : '🌏 혼자서는 다 만들 수 없기에, 오픈소스로 함께 만듭니다'
            }</h2>
            <p>${
              en
                ? 'Bumpinto World is a source-available 3D metaverse where anyone can add their own city, favorite local spots, 3D landmarks, and street NPCs. Every merged PR earns permanent credit inside the live world and Hall of Fame.'
                : 'Bumpinto World는 누구나 자기 동네, 단골 가게, 랜드마크 건물, 시민 NPC를 직접 만들어 추가할 수 있는 오픈 월드입니다. PR이 반영되면 공식 월드와 명예의 전당에 제작자 이름·링크가 영구 각인됩니다.'
            }</p>
          </div>
          <div class="contrib-cta">
            <a href="${REPO_URL}" target="_blank" rel="noopener" class="board-btn primary">${en ? '⭐ GitHub Repository' : '⭐ GitHub 저장소 가기'}</a>
            <a href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="board-btn">${en ? '📖 Contributing Guide' : '📖 기여 가이드'}</a>
          </div>
        </div>
        <div class="contrib-grid">${cards}</div>
        <div class="hof-section">
          <h3>${en ? '👑 World Pioneers & Contributors (Hall of Fame)' : '👑 월드 개척자 & 기여자 명예의 전당 (Hall of Fame)'}</h3>
          <div class="hof-list">${hallOfFame}</div>
        </div>
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="back-list">${en ? '📋 Open Community Board' : '📋 커뮤니티 게시판 보기'}</button>
          <span class="contrib-copy">© <a href="https://crazylabs.co.kr" target="_blank" rel="noopener">CrazyLabs (crazylabs.co.kr)</a> · Attribution Required</span>
        </div>
      </div>`;
  }

  function render({ preserveScroll = false, scrollToBottom = false } = {}) {
    if (!isOpen) return;
    const en = isEn();
    const prevBodyEl = modal.querySelector('.board-body');
    const prevScroll = prevBodyEl ? prevBodyEl.scrollTop : 0;
    syncLaunchers();
    const isContrib = view === 'contribute';
    const bodyHtml = isContrib
      ? renderContributeBody()
      : view === 'detail'
        ? renderDetailBody()
        : view === 'form'
          ? renderFormBody()
          : renderListBody();

    const headerTitle = isContrib
      ? (en ? '🌍 Build Together & Hall of Fame' : '🌍 Bumpinto World 함께 만들기 & 명예의 전당')
      : (en ? '📋 Bumpinto World Community Board' : '📋 Bumpinto World 게시판');
    const headerSub = isContrib
      ? (en
          ? 'Add your neighborhood, 3D landmarks, or street NPCs and get permanently credited in the world'
          : '오픈소스로 우리 동네·건물·NPC를 추가하고 월드에 이름을 남겨 보세요')
      : (en
          ? 'Announcements · Intros · Feedback · Local spots and stories across all neighborhoods'
          : '공지사항 · 소개 · 피드백 · 주변 맛집과 동네 이야기를 나눠 보세요');

    modal.innerHTML = `
      <div class="board-backdrop" data-action="close"></div>
      <section class="board-dialog" role="dialog" aria-modal="true" aria-label="${esc(headerTitle)}">
        <header class="board-header">
          <div>
            <h1>${headerTitle}</h1>
            <p>${headerSub}</p>
          </div>
          <div class="board-header-right">
            <button type="button" class="board-btn" data-action="toggle-lang" title="Switch Language (KO / EN)">🌐 ${en ? 'KO 한국어' : 'EN English'}</button>
            <button type="button" class="board-btn ${isContrib ? '' : 'primary'}" data-action="${isContrib ? 'back-list' : 'open-contrib'}">${
              isContrib ? (en ? '📋 Board' : '📋 게시판') : (en ? '🌍 Contribute' : '🌍 함께 만들기')
            }</button>
            <button type="button" class="board-close" data-action="close" aria-label="Close">✕</button>
          </div>
        </header>
        <div class="board-body">${bodyHtml}</div>
      </section>`;
    v3BoardIcons(modal);

    const nextBodyEl = modal.querySelector('.board-body');
    if (nextBodyEl) {
      if (scrollToBottom) nextBodyEl.scrollTop = nextBodyEl.scrollHeight;
      else if (preserveScroll) nextBodyEl.scrollTop = prevScroll;
    }
  }

  onLangChange(() => {
    if (isOpen) render({ preserveScroll: true });
  });

  launcher.addEventListener('click', () => {
    if (isOpen && view !== 'contribute') setOpen(false);
    else setOpen(true, 'list');
  });
  contribLauncher?.addEventListener('click', () => {
    if (isOpen && view === 'contribute') setOpen(false);
    else setOpen(true, 'contribute');
  });

  modal.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-ni-remove]');
    if (rm) {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(rm.dataset.niRemove);
      captureForm();
      draftImages = draftImages.filter((_, i) => i !== idx);
      render();
      return;
    }
    const ni = e.target.closest('[data-ni-open]');
    if (ni) {
      e.preventDefault();
      e.stopPropagation();
      const gallery = ni.closest('[data-ni-gallery]');
      const images = [...(gallery?.querySelectorAll('[data-ni-open] img') || [])].map((img) => ({
        url: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
      }));
      openNoticeLightbox(images, Number(ni.dataset.niI) || 0);
      return;
    }
    const actEl = e.target.closest('[data-action]');
    if (actEl) {
      const act = actEl.dataset.action;
      if (act === 'toggle-lang') {
        toggleLang();
        return;
      }
      if (act === 'close') {
        setOpen(false);
        return;
      }
      if (act === 'open-contrib') {
        view = 'contribute';
        errorMsg = '';
        trackEvent('contribute_open');
        render();
        return;
      }
      if (act === 'write') {
        editingPost = null;
        errorMsg = '';
        resetFormDraft();
        view = 'form';
        render();
        modal.querySelector('input[name="title"]')?.focus();
        return;
      }
      if (act === 'add-notice-url') {
        captureForm();
        const raw = modal.querySelector('input[name="noticeUrl"]')?.value || '';
        const next = sanitizeNoticeImages([...draftImages, { url: raw }], { allowData: !smsBase() });
        if (!raw.trim() || next.length === draftImages.length) {
          errorMsg = tr('https 이미지 주소만 추가할 수 있습니다.', 'Only an https image address can be added.');
        } else if (next.length > NOTICE_IMAGE_MAX) {
          errorMsg = tr('이미지는 8장까지 붙일 수 있습니다.', 'You can attach up to 8 images.');
        } else {
          draftImages = next;
          errorMsg = '';
        }
        render();
        return;
      }
      if (act === 'back-list') {
        view = 'list';
        currentPost = null;
        errorMsg = '';
        fetchList(page);
        return;
      }
      if (act === 'cancel-form') {
        errorMsg = '';
        resetFormDraft();
        view = editingPost && currentPost ? 'detail' : 'list';
        editingPost = null;
        render();
        return;
      }
      if (act === 'edit' && currentPost) {
        editingPost = { ...currentPost };
        draftImages = sanitizeNoticeImages(currentPost.images, { allowData: true });
        formSticky = null;
        errorMsg = '';
        view = 'form';
        render();
        modal.querySelector('input[name="title"]')?.focus();
        return;
      }
      if (act === 'delete' && currentPost) {
        if (loading) return;
        loading = true;
        errorMsg = '';
        render();
        try {
          econChanged(await sms.board('delete', { postId: currentPost.id }));
          currentPost = null;
          currentComments = [];
          view = 'list';
          await fetchList(page);
        } catch (err) {
          loading = false;
          errorMsg = err.message || tr('삭제하지 못했습니다.', 'Failed to delete.');
          render();
        }
        return;
      }
      if (act === 'toggle-like' && currentPost) {
        if (likeLoading) return;
        likeLoading = true;
        errorMsg = '';
        render({ preserveScroll: true });
        try {
          const res = await sms.board('like', { postId: currentPost.id });
          currentPost.liked = !!res.liked;
          currentPost.likesCount = Number(res.likesCount || 0);
          trackEvent('board_post_like', { post_id: currentPost.id, liked: currentPost.liked });
        } catch (err) {
          errorMsg = err.message || tr('좋아요를 처리하지 못했습니다.', 'Failed to update like.');
        } finally {
          likeLoading = false;
          render({ preserveScroll: true });
        }
        return;
      }
    }

    const delCmtBtn = e.target.closest('[data-comment-del]');
    if (delCmtBtn && currentPost) {
      const commentId = Number(delCmtBtn.dataset.commentDel);
      if (!commentId || commentLoading) return;
      commentLoading = true;
      errorMsg = '';
      render({ preserveScroll: true });
      try {
        const res = await sms.board('comment_delete', { commentId });
        currentComments = currentComments.filter((c) => c.id !== commentId);
        currentPost.commentsCount = Number(res.commentsCount ?? currentComments.length);
      } catch (err) {
        errorMsg = err.message || tr('댓글을 삭제하지 못했습니다.', 'Failed to delete comment.');
      } finally {
        commentLoading = false;
        render({ preserveScroll: true });
      }
      return;
    }

    const catBtn = e.target.closest('[data-cat]');
    if (catBtn) {
      category = catBtn.dataset.cat;
      page = 1;
      fetchList(1);
      return;
    }

    const pageBtn = e.target.closest('[data-page]');
    if (pageBtn && !pageBtn.disabled) {
      const nextP = Number(pageBtn.dataset.page) || 1;
      if (nextP !== page) fetchList(nextP);
      return;
    }

    const postTrigger = e.target.closest('[data-post-id]');
    if (postTrigger) {
      const postId = Number(postTrigger.dataset.postId);
      if (postId) openPost(postId);
    }
  });

  modal.addEventListener('submit', async (e) => {
    const cmtForm = e.target.closest('.board-cmt-form');
    if (cmtForm && currentPost) {
      e.preventDefault();
      if (commentLoading) return;
      const body = cmtForm.comment.value.trim();
      if (!body) {
        errorMsg = tr('댓글 내용을 입력해 주세요.', 'Please enter a comment.');
        render({ preserveScroll: true });
        return;
      }
      commentLoading = true;
      errorMsg = '';
      render({ preserveScroll: true });
      try {
        const meName = getMe?.()?.name || sms?.session?.name || tr('손님', 'Guest');
        const res = await sms.board('comment_create', {
          postId: currentPost.id,
          body,
          name: meName,
        });
        if (res.comment) currentComments.push(res.comment);
        currentPost.commentsCount = Number(res.commentsCount ?? currentComments.length);
        trackEvent('board_comment_create', { post_id: currentPost.id });
      } catch (err) {
        errorMsg = err.message || tr('댓글을 등록하지 못했습니다.', 'Failed to post comment.');
      } finally {
        commentLoading = false;
        render({ scrollToBottom: true });
      }
      return;
    }

    const form = e.target.closest('.board-form');
    if (!form) return;
    e.preventDefault();
    if (loading) return;
    const cat = form.category.value;
    const title = form.title.value.trim();
    const body = form.body.value.trim();
    captureForm();
    if (!title) {
      errorMsg = tr('제목을 입력해 주세요.', 'Please enter a title.');
      render();
      return;
    }
    if (!body) {
      errorMsg = tr('내용을 입력해 주세요.', 'Please enter content.');
      render();
      return;
    }
    loading = true;
    errorMsg = '';
    render();
    try {
      const meName = getMe?.()?.name || sms?.session?.name || tr('손님', 'Guest');
      const imagePayload = noticeImagesEnabled() && cat === 'notice' ? { images: draftImages } : {};
      if (editingPost) {
        const res = await sms.board('update', {
          postId: editingPost.id,
          category: cat,
          title,
          body,
          ...imagePayload,
        });
        currentPost = res.post;
        if (Array.isArray(res.comments)) currentComments = res.comments;
        econChanged(res);
        editingPost = null;
        view = 'detail';
      } else {
        const res = await sms.board('create', {
          category: cat,
          title,
          body,
          name: meName,
          ...imagePayload,
        });
        currentPost = res.post;
        currentComments = res.comments || [];
        if (currentPost?.id) writeSeenPostId(currentPost.id);
        econChanged(res);
        view = 'detail';
        page = 1;
        trackEvent('board_post_create', { category: cat });
      }
      resetFormDraft();
    } catch (err) {
      errorMsg = err.message || tr('저장하지 못했습니다.', 'Failed to save post.');
    } finally {
      loading = false;
      render();
    }
  });

  modal.addEventListener('change', async (e) => {
    const catSelect = e.target?.closest?.('select[name="category"]');
    if (catSelect && view === 'form') {
      captureForm();
      render();
      return;
    }
    const fileInput = e.target?.closest?.('input[name="noticeImages"]');
    if (!fileInput || view !== 'form') return;
    const files = [...fileInput.files];
    captureForm();
    errorMsg = '';
    try {
      for (const file of files) {
        if (draftImages.length >= NOTICE_IMAGE_MAX) break;
        const img = await sms.uploadNoticeImage(file);
        const next = sanitizeNoticeImages([...draftImages, img], { allowData: !smsBase() });
        if (next.length === draftImages.length) {
          const err = new Error('bad_type');
          err.code = 'bad_type';
          throw err;
        }
        draftImages = next;
      }
    } catch (err) {
      errorMsg = imageErrorText(err);
    }
    render();
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && noticeLightboxOpen()) return;
    if (e.key === 'Escape' && isOpen) {
      setOpen(false);
    }
  });

  checkNewPosts();
  setInterval(checkNewPosts, 30000);

  return {
    get open() {
      return isOpen;
    },
    close() {
      setOpen(false);
    },
    // [notice-popup] 공지사항 탭으로 게시판 열기
    openNotices() {
      if (isOpen) return false;
      category = 'notice';
      page = 1;
      setOpen(true, 'list');
      return true;
    },
  };
}
