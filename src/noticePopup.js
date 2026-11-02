// [notice-popup] 입장 시 아직 안 본 공지가 있으면 기존 게시판(공지사항 탭)을 한 번 자동으로 연다.
// 새 공지 판정: 게시판 서버(또는 로컬 테스트 게시판)의 공지 탭 목록에서 category === 'notice' 인 글의 서버 post id 최댓값.
//   - 관리자가 게시판에서 직접 쓴 공지(제목 자유)와 notices.js 번들 공지(서버 DB 에 시드됨) 모두 같은 posts 테이블의 autoincrement id 를 가진다.
//   - 제목/본문/createdAt 과 무관(번들 공지 createdAt 은 Date.now() 기반이라 불안정).
// '본 공지' 상태는 브라우저 전역 localStorage `bw.noticeSeen` = 마지막으로 본 공지 id(숫자 문자열). 동네와 무관.
//   옛 형식('notice-…' 키 문자열)이나 깨진 값은 0 으로 보고 다음에 본 순간 숫자로 덮어쓴다.
// ?noticePopup=0 이면 완전히 끈다. 목록을 못 불러오면 아무것도 하지 않는다.

export const NOTICE_SEEN_KEY = 'bw.noticeSeen';

export function latestNoticeId(items) {
  let best = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.category !== 'notice') continue;
    const id = Number(it.id);
    if (Number.isSafeInteger(id) && id > best) best = id;
  }
  return best;
}

export function readSeenId(storage) {
  try {
    const v = String(storage?.getItem(NOTICE_SEEN_KEY) ?? '').trim();
    return /^\d+$/.test(v) ? Number(v) : 0; // 옛 문자열 키 형식 → 0
  } catch { return 0; }
}

export function hasUnseenNotice(latestId, seenId) {
  return latestId > 0 && latestId > (seenId || 0);
}

export function markSeenId(storage, latestId) {
  if (!(latestId > 0)) return;
  try { if (latestId > readSeenId(storage)) storage?.setItem(NOTICE_SEEN_KEY, String(latestId)); } catch {}
}

/**
 * @param {object} o
 * @param {() => Promise<Array>} o.fetchNotices 공지 탭 목록 items (게시판과 같은 소스)
 * @param {() => boolean} o.open  게시판 공지 탭 열기 (성공 시 true)
 * @param {() => boolean} o.busy  다른 모달/폰/탑승 UI 가 열려 있으면 true
 */
export function createNoticePopup({ fetchNotices, open, busy, params, storage = globalThis.localStorage, delayMs = 1500, retryMs = 1500, maxWaitMs = 30000 }) {
  const disabled = params?.get?.('noticePopup') === '0';
  let latest = 0;          // 마지막으로 불러온 최신 공지 id
  let openedEarly = false; // 목록 로드 전에 게시판이 열렸으면 로드 후 본 것으로 처리
  let started = false;
  let done = false;
  let timer = 0;

  const markSeen = () => { if (latest) markSeenId(storage, latest); else openedEarly = true; };

  async function load() {
    try { latest = latestNoticeId(await fetchNotices()); } catch { latest = 0; }
    if (openedEarly) markSeenId(storage, latest);
  }

  return {
    get latest() { return latest; },
    /** 게시판이 열릴 때(자동/수동 모두) 호출 → 본 것으로 처리 */
    markSeen,
    /** 입장(캐릭터 표시) 직후 호출. 페이지당 최대 1회 시도. */
    schedule() {
      if (started || disabled) return;
      started = true;
      const t0 = Date.now();
      const loaded = load();
      const tick = async () => {
        timer = 0;
        if (done) return;
        try {
          await loaded;
          if (!hasUnseenNotice(latest, readSeenId(storage))) { done = true; return; }
          if (busy?.()) {
            if (Date.now() - t0 < maxWaitMs) timer = setTimeout(tick, retryMs);
            else done = true; // 계속 바쁘면 이번엔 건너뜀(본 것으로 처리 안 함)
            return;
          }
          done = true;
          if (open()) markSeenId(storage, latest);
        } catch { done = true; }
      };
      timer = setTimeout(tick, delayMs);
    },
    cancel() { if (timer) clearTimeout(timer); timer = 0; done = true; },
  };
}
