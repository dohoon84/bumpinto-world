// [notice-popup] 입장 시 아직 안 본 공지가 있으면 기존 게시판(공지사항 탭)을 한 번 자동으로 연다.
// '본 공지' 상태는 브라우저(localStorage) 전역 — 동네(정자/잠실 코리더 등)와 무관.
// 새 공지 판정: NOTICE_POSTS 의 `key` 중 사전순 최댓값(키가 'notice-YYYY-MM-DD-…' 형식이라 날짜순과 같음).
// createdAt 은 notices.js 에서 Date.now() 기반이라 매 로드마다 바뀌므로 쓰지 않는다.
// ?noticePopup=0 이면 완전히 끈다. 실패는 모두 조용히 무시.

export const NOTICE_SEEN_KEY = 'bw.noticeSeen';

export function latestNoticeKey(posts) {
  let best = '';
  for (const p of Array.isArray(posts) ? posts : []) {
    const k = typeof p?.key === 'string' ? p.key : '';
    if (k > best) best = k;
  }
  return best;
}

export function readSeen(storage) {
  try { return storage?.getItem(NOTICE_SEEN_KEY) || ''; } catch { return ''; }
}

export function hasUnseenNotice(latest, seen) {
  return !!latest && latest > (seen || '');
}

export function markSeen(storage, latest) {
  if (!latest) return;
  try { if (hasUnseenNotice(latest, readSeen(storage))) storage?.setItem(NOTICE_SEEN_KEY, latest); } catch {}
}

/**
 * @param {object} o
 * @param {Array} o.posts        NOTICE_POSTS
 * @param {() => boolean} o.open 게시판 공지 탭 열기 (성공 시 true)
 * @param {() => boolean} o.busy 다른 모달/폰/탑승 UI 가 열려 있으면 true
 * @param {URLSearchParams} [o.params]
 */
export function createNoticePopup({ posts, open, busy, params, storage = globalThis.localStorage, delayMs = 1500, retryMs = 1500, maxWaitMs = 30000 }) {
  let latest = '';
  try { latest = latestNoticeKey(posts); } catch {}
  const disabled = params?.get?.('noticePopup') === '0';
  let timer = 0;
  let done = false;
  const api = {
    latest,
    markSeen: () => markSeen(storage, latest),
    /** 입장(캐릭터 표시) 직후 호출. 페이지당 최대 1회 시도. */
    schedule() {
      if (done || disabled || timer) return;
      if (!hasUnseenNotice(latest, readSeen(storage))) { done = true; return; }
      const t0 = Date.now();
      const tick = () => {
        timer = 0;
        if (done) return;
        try {
          if (!hasUnseenNotice(latest, readSeen(storage))) { done = true; return; }
          if (busy?.()) {
            if (Date.now() - t0 < maxWaitMs) timer = setTimeout(tick, retryMs);
            else done = true; // 계속 바쁘면 이번 세션은 건너뜀 (다음 입장 때 다시)
            return;
          }
          done = true;
          if (open()) api.markSeen();
        } catch { done = true; }
      };
      timer = setTimeout(tick, delayMs);
    },
    cancel() { if (timer) clearTimeout(timer); timer = 0; },
  };
  return api;
}
