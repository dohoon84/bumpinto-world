import { trackEvent } from './analytics.js';
import { CONTRIBUTORS, CONTRIBUTION_AREAS, REPO_URL } from './contributors.js';

// 게임 내 커뮤니티 게시판 (우측 버튼 클릭 시 모달 오픈, 카테고리·20행 페이징·등록/수정/삭제 + 함께 만들기/명예의 전당)

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'notice', label: '📢 공지사항', badge: '공지' },
  { key: 'intro', label: '소개' },
  { key: 'feedback', label: '피드백' },
  { key: 'food', label: '주변맛집' },
  { key: 'free', label: '자유' },
];

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.badge || c.label]));
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

export function mountBoard({ sms, getMe } = {}) {
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
      errorMsg = err.message || '게시글 목록을 불러오지 못했습니다.';
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
      errorMsg = err.message || '게시글을 불러오지 못했습니다.';
    } finally {
      loading = false;
      render();
    }
  }

  function renderTabs() {
    return CATEGORIES.map(
      (c) =>
        `<button type="button" class="board-cat ${category === c.key ? 'on' : ''}" data-cat="${c.key}">${esc(c.label)}</button>`,
    ).join('');
  }

  function renderPagination() {
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
        <button type="button" class="board-page nav" data-page="${Math.max(1, cur - 1)}" ${cur <= 1 ? 'disabled' : ''}>‹ 이전</button>
        ${pages.join('')}
        <button type="button" class="board-page nav" data-page="${Math.min(totalPages, cur + 1)}" ${cur >= totalPages ? 'disabled' : ''}>다음 ›</button>
      </div>`;
  }

  function renderListBody() {
    if (loading && !listData.items.length) {
      return `<div class="board-empty">게시글을 불러오는 중입니다…</div>`;
    }
    const rows = listData.items.length
      ? listData.items
          .map(
            (item) => `
          <tr class="board-row ${item.category === 'notice' ? 'is-notice' : ''}" data-post-id="${item.id}">
            <td class="col-id">${item.category === 'notice' ? '<span class="pin-icon" title="상단 고정 공지">📌</span>' : item.id}</td>
            <td class="col-cat"><span class="cat-badge cat-${esc(item.category)}">${esc(CAT_LABEL[item.category] || item.category)}</span></td>
            <td class="col-title">
              <button type="button" class="title-btn" data-post-id="${item.id}">
                ${esc(item.title)}
                ${isNewPost(item) ? '<span class="post-new-icon" title="24시간 이내 새 글">N</span>' : ''}
                ${item.commentsCount > 0 ? `<span class="cmt-count">[${item.commentsCount}]</span>` : ''}
                ${item.mine ? '<em class="mine-tag">내 글</em>' : ''}
              </button>
            </td>
            <td class="col-author">${esc(item.authorName)}</td>
            <td class="col-date">${esc(fmtDate(item.createdAt))}</td>
            <td class="col-likes ${item.liked ? 'is-liked' : ''}">♥ ${item.likesCount || 0}</td>
            <td class="col-views">${item.views}</td>
          </tr>`,
          )
          .join('')
      : `<tr><td colspan="7" class="board-empty-row">등록된 게시글이 없습니다. 첫 글을 남겨 보세요!</td></tr>`;

    return `
      <div class="board-toolbar">
        <div class="board-cats">${renderTabs()}</div>
        <button type="button" class="board-btn primary" data-action="write">+ 글쓰기</button>
      </div>
      ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
      <div class="board-table-wrap">
        <table class="board-table">
          <thead>
            <tr>
              <th class="col-id">번호</th>
              <th class="col-cat">분류</th>
              <th class="col-title">제목</th>
              <th class="col-author">작성자</th>
              <th class="col-date">작성일</th>
              <th class="col-likes">좋아요</th>
              <th class="col-views">조회</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="board-footer">
        <span class="board-count">총 <b>${listData.total}</b>건 · 페이지당 20행 (${listData.page}/${listData.totalPages})</span>
        ${renderPagination()}
      </div>`;
  }

  function renderDetailBody() {
    if (loading && !currentPost) {
      return `<div class="board-empty">게시글을 불러오는 중입니다…</div>`;
    }
    if (!currentPost) {
      return `
        ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="back-list">‹ 목록으로</button>
        </div>`;
    }
    const p = currentPost;
    const commentRows = currentComments.length
      ? currentComments
          .map(
            (c) => `
          <li class="board-cmt-item">
            <div class="board-cmt-head">
              <div class="board-cmt-author">
                <strong>${esc(c.authorName)}</strong>
                ${c.authorDisplay ? `<small>(${esc(c.authorDisplay)})</small>` : ''}
                ${c.mine ? '<em class="mine-tag">내 댓글</em>' : ''}
              </div>
              <div class="board-cmt-right">
                <time>${esc(fmtDate(c.createdAt))}</time>
                ${
                  c.mine
                    ? `<button type="button" class="board-cmt-del" data-comment-del="${c.id}" ${commentLoading ? 'disabled' : ''}>삭제</button>`
                    : ''
                }
              </div>
            </div>
            <p class="board-cmt-body">${esc(c.body)}</p>
          </li>`,
          )
          .join('')
      : `<li class="board-cmt-empty">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!</li>`;

    return `
      <div class="board-detail">
        <div class="board-detail-head">
          <div class="board-detail-top">
            <span class="cat-badge cat-${esc(p.category)}">${esc(CAT_LABEL[p.category] || p.category)}</span>
            <h2>${esc(p.title)}</h2>
            ${isNewPost(p) ? '<span class="post-new-icon" title="24시간 이내 새 글">N</span>' : ''}
          </div>
          <div class="board-detail-meta">
            <span>작성자 <b>${esc(p.authorName)}</b>${p.authorDisplay ? ` <small>(${esc(p.authorDisplay)})</small>` : ''}</span>
            <span>작성일 ${esc(fmtDate(p.createdAt))}${p.updatedAt && p.updatedAt > p.createdAt + 1000 ? ` · 수정됨` : ''}</span>
            <span>좋아요 <b>${p.likesCount || 0}</b></span>
            <span>댓글 <b>${currentComments.length}</b></span>
            <span>조회 ${p.views}</span>
          </div>
        </div>
        ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
        <div class="board-detail-content">${esc(p.body)}</div>
        <div class="board-like-bar">
          <button type="button" class="board-like-btn ${p.liked ? 'liked' : ''}" data-action="toggle-like" ${likeLoading ? 'disabled' : ''} aria-pressed="${!!p.liked}">
            <span class="heart">${p.liked ? '♥' : '♡'}</span>
            <span>좋아요</span>
            <strong class="like-num">${p.likesCount || 0}</strong>
          </button>
        </div>
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="back-list">‹ 목록으로</button>
          <div class="right-actions">
            ${
              p.mine
                ? `<button type="button" class="board-btn" data-action="edit">수정</button>
                   <button type="button" class="board-btn danger" data-action="delete">삭제</button>`
                : ''
            }
          </div>
        </div>
        <section class="board-comments" aria-label="댓글 영역">
          <h3 class="board-cmt-title">💬 댓글 <span>${currentComments.length}</span></h3>
          <ul class="board-cmt-list">${commentRows}</ul>
          <form class="board-cmt-form" autocomplete="off">
            <textarea name="comment" rows="2" maxlength="500" placeholder="따뜻한 댓글이나 의견을 남겨 주세요 (최대 500자)" required></textarea>
            <button type="submit" class="board-btn primary" ${commentLoading ? 'disabled' : ''}>댓글 등록</button>
          </form>
        </section>
      </div>`;
  }

  function renderFormBody() {
    const isEdit = !!editingPost;
    const writableCats = CATEGORIES.filter((c) => c.key !== 'all' && c.key !== 'notice');
    const defaultCat =
      editingPost?.category && editingPost.category !== 'notice'
        ? editingPost.category
        : category !== 'all' && category !== 'notice'
          ? category
          : 'intro';
    const catOptions = writableCats
      .map(
        (c) =>
          `<option value="${c.key}" ${c.key === defaultCat ? 'selected' : ''}>${esc(c.label)}</option>`,
      )
      .join('');
    return `
      <form class="board-form" autocomplete="off">
        <h3>${isEdit ? '게시글 수정' : '새 게시글 작성'}</h3>
        <div class="board-form-row">
          <label>분류
            <select name="category">${catOptions}</select>
          </label>
          <label class="grow">제목
            <input name="title" maxlength="80" placeholder="제목을 입력해 주세요 (최대 80자)" value="${esc(editingPost?.title || '')}" required />
          </label>
        </div>
        <label class="board-form-body">내용
          <textarea name="body" rows="9" maxlength="2000" placeholder="정자역 소개, 피드백, 주변 맛집 추천 등을 자유롭게 작성해 주세요 (최대 2,000자)" required>${esc(editingPost?.body || '')}</textarea>
        </label>
        ${errorMsg ? `<p class="board-error">${esc(errorMsg)}</p>` : ''}
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="cancel-form">취소</button>
          <button type="submit" class="board-btn primary" ${loading ? 'disabled' : ''}>${isEdit ? '수정 저장' : '등록하기'}</button>
        </div>
      </form>`;
  }

  function renderContributeBody() {
    const cards = CONTRIBUTION_AREAS.map(
      (a) => `
      <div class="contrib-card">
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.desc)}</p>
        <div class="contrib-reward">🏆 보상: ${esc(a.reward)}</div>
      </div>`,
    ).join('');

    const hallOfFame = CONTRIBUTORS.map(
      (c) => `
      <div class="hof-item">
        <div class="hof-main">
          <span class="hof-badge">${esc(c.badge)}</span>
          <strong>${esc(c.name)}</strong>
          <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.handle)}</a>
        </div>
        <p>${esc(c.contribution)}</p>
      </div>`,
    ).join('');

    return `
      <div class="contrib-wrap">
        <div class="contrib-banner">
          <div>
            <h2>🌏 혼자서는 다 만들 수 없기에, 오픈소스로 함께 만듭니다</h2>
            <p>Bumpinto World는 누구나 자기 동네, 단골 가게, 랜드마크 건물, 시민 NPC를 직접 만들어 추가할 수 있는 오픈 월드입니다. PR이 반영되면 공식 월드와 명예의 전당에 제작자 이름·링크가 영구 각인됩니다.</p>
          </div>
          <div class="contrib-cta">
            <a href="${REPO_URL}" target="_blank" rel="noopener" class="board-btn primary">⭐ GitHub 저장소 가기</a>
            <a href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="board-btn">📖 기여 가이드</a>
          </div>
        </div>
        <div class="contrib-grid">${cards}</div>
        <div class="hof-section">
          <h3>👑 월드 개척자 & 기여자 명예의 전당 (Hall of Fame)</h3>
          <div class="hof-list">${hallOfFame}</div>
        </div>
        <div class="board-detail-actions">
          <button type="button" class="board-btn" data-action="back-list">📋 커뮤니티 게시판 보기</button>
          <span class="contrib-copy">© <a href="https://crazylabs.co.kr" target="_blank" rel="noopener">CrazyLabs (crazylabs.co.kr)</a> · Attribution Required</span>
        </div>
      </div>`;
  }

  function render({ preserveScroll = false, scrollToBottom = false } = {}) {
    if (!isOpen) return;
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

    modal.innerHTML = `
      <div class="board-backdrop" data-action="close"></div>
      <section class="board-dialog" role="dialog" aria-modal="true" aria-label="정자역 커뮤니티 게시판">
        <header class="board-header">
          <div>
            <h1>${isContrib ? '🌍 Bumpinto World 함께 만들기 & 명예의 전당' : '📋 Bumpinto World 게시판'}</h1>
            <p>${isContrib ? '오픈소스로 우리 동네·건물·NPC를 추가하고 월드에 이름을 남겨 보세요' : '공지사항 · 소개 · 피드백 · 정자역 주변 맛집과 동네 이야기를 나눠 보세요'}</p>
          </div>
          <div class="board-header-right">
            <button type="button" class="board-btn ${isContrib ? '' : 'primary'}" data-action="${isContrib ? 'back-list' : 'open-contrib'}">${isContrib ? '📋 게시판' : '🌍 함께 만들기'}</button>
            <button type="button" class="board-close" data-action="close" aria-label="닫기">✕</button>
          </div>
        </header>
        <div class="board-body">${bodyHtml}</div>
      </section>`;

    const nextBodyEl = modal.querySelector('.board-body');
    if (nextBodyEl) {
      if (scrollToBottom) nextBodyEl.scrollTop = nextBodyEl.scrollHeight;
      else if (preserveScroll) nextBodyEl.scrollTop = prevScroll;
    }
  }

  launcher.addEventListener('click', () => {
    if (isOpen && view !== 'contribute') setOpen(false);
    else setOpen(true, 'list');
  });
  contribLauncher?.addEventListener('click', () => {
    if (isOpen && view === 'contribute') setOpen(false);
    else setOpen(true, 'contribute');
  });

  modal.addEventListener('click', async (e) => {
    const actEl = e.target.closest('[data-action]');
    if (actEl) {
      const act = actEl.dataset.action;
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
        view = 'form';
        render();
        modal.querySelector('input[name="title"]')?.focus();
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
        view = editingPost && currentPost ? 'detail' : 'list';
        editingPost = null;
        render();
        return;
      }
      if (act === 'edit' && currentPost) {
        editingPost = { ...currentPost };
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
          await sms.board('delete', { postId: currentPost.id });
          currentPost = null;
          currentComments = [];
          view = 'list';
          await fetchList(page);
        } catch (err) {
          loading = false;
          errorMsg = err.message || '삭제하지 못했습니다.';
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
          errorMsg = err.message || '좋아요를 처리하지 못했습니다.';
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
        errorMsg = err.message || '댓글을 삭제하지 못했습니다.';
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
        errorMsg = '댓글 내용을 입력해 주세요.';
        render({ preserveScroll: true });
        return;
      }
      commentLoading = true;
      errorMsg = '';
      render({ preserveScroll: true });
      try {
        const meName = getMe?.()?.name || sms?.session?.name || '손님';
        const res = await sms.board('comment_create', {
          postId: currentPost.id,
          body,
          name: meName,
        });
        if (res.comment) currentComments.push(res.comment);
        currentPost.commentsCount = Number(res.commentsCount ?? currentComments.length);
        trackEvent('board_comment_create', { post_id: currentPost.id });
      } catch (err) {
        errorMsg = err.message || '댓글을 등록하지 못했습니다.';
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
    if (!title) {
      errorMsg = '제목을 입력해 주세요.';
      render();
      return;
    }
    if (!body) {
      errorMsg = '내용을 입력해 주세요.';
      render();
      return;
    }
    loading = true;
    errorMsg = '';
    render();
    try {
      const meName = getMe?.()?.name || sms?.session?.name || '손님';
      if (editingPost) {
        const res = await sms.board('update', {
          postId: editingPost.id,
          category: cat,
          title,
          body,
        });
        currentPost = res.post;
        if (Array.isArray(res.comments)) currentComments = res.comments;
        editingPost = null;
        view = 'detail';
      } else {
        const res = await sms.board('create', {
          category: cat,
          title,
          body,
          name: meName,
        });
        currentPost = res.post;
        currentComments = res.comments || [];
        if (currentPost?.id) writeSeenPostId(currentPost.id);
        view = 'detail';
        page = 1;
        trackEvent('board_post_create', { category: cat });
      }
    } catch (err) {
      errorMsg = err.message || '저장하지 못했습니다.';
    } finally {
      loading = false;
      render();
    }
  });

  addEventListener('keydown', (e) => {
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
  };
}
