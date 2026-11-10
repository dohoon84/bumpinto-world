// [arcade-pang] 범핑팡 랭킹 규칙. 보상은 월간 1·2·3등만. 참여보상·일일보상 없음.
// 오락실 게임(범핑팡·범편의점)은 일일 도전 횟수 제한이 없다. BUMP24 편의점 털기와 다름.
export const OPENING_MS = Date.parse('2026-11-09T15:00:00.000Z'); // 2026-11-10 00:00 KST (도훈 확정 전 초안)
export const GAME_ID = 'bumpingpang';
export const MERGE_GAME_ID = 'bumstore';
export const GAME_IDS = [GAME_ID, MERGE_GAME_ID];
export function resolveGameId(raw) {
  const id = String(raw || GAME_ID).slice(0, 40);
  return GAME_IDS.includes(id) ? id : GAME_ID;
}
export const STORE_ID = 'arcade-seohyeon'; // 오락실 전광판 1개(매장 통합)
export const LIMIT_MSG = '오늘 도전 완료, 연습은 계속 가능';
export const MONTHLY_BUM = [3000, 2000, 1000]; // 월간 1·2·3등. 참여·일일 지급 없음. 게스트는 지급하지 않음.
export function monthlyRewardPairs() {
  return MONTHLY_BUM.map((n, i) => `${i + 1}위 ${n.toLocaleString('ko-KR')}`);
}
export function monthlyRewardSub() {
  const [a, b, c] = monthlyRewardPairs();
  return `PC·모바일 통합 · 월간 보상 · ${a} · ${b} · ${c} bum`;
}
export function monthlyRewardSubHtml() {
  const [a, b, c] = monthlyRewardPairs();
  return `<span class="sub-lead">PC·모바일 통합 · 월간 보상</span> <span class="sub-pays"><span class="sub-pay">${a}</span> · <span class="sub-pay">${b}</span> · <span class="sub-pay">${c} bum</span></span>`;
}
export const MIN_PARTICIPANTS = 5;
export const TITLE = '범핑팡왕';

const KST = 9 * 3600e3;
export function kstParts(ms) {
  const d = new Date(ms + KST);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return { y, m, day, dow: d.getUTCDay(), key: d.toISOString().slice(0, 10) };
}
export const kstDayKey = (ms) => kstParts(ms).key;
export function weekKey(ms) {
  const p = kstParts(ms);
  const monday = Date.UTC(p.y, p.m - 1, p.day) - ((p.dow + 6) % 7) * 864e5;
  return new Date(monday).toISOString().slice(0, 10);
}
export function monthKey(ms) { const p = kstParts(ms); return `${p.y}-${String(p.m).padStart(2, '0')}`; }
/** 오락실 게임은 일일 횟수 제한이 없다. 호환용으로 남겨 두며 항상 무제한. */
export function attemptCap(_guest) { return null; }

export function decideAttempt({ now, guest, used = 0, practice = false }) {
  if (practice) return { record: false, practice: true };
  if (now < OPENING_MS) return { record: false, practice: true, beforeOpen: true };
  // guest 는 횟수와 무관하게 기록한다. 월간 보상만 monthlyBestPays 에서 계정에만 지급.
  void guest;
  return { record: true, practice: false, attempt: used + 1, usedUp: false };
}

export function bestScore(prev, score) { return prev == null || score > prev ? score : prev; }
export function rankRows(rows) {
  return [...rows].sort((a, b) => b.score - a.score || a.at - b.at).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** 월 최고점(플레이어별 best)으로 순위 → 1·2·3등만 지급. 게스트·계정 없는 줄은 절대 지급하지 않음. */
export function monthlyBestPays(rows, month, gameId = GAME_ID) {
  return rows
    .filter((r) => r.rank <= 3 && r.accountId && !r.guest)
    .map((r) => ({
      accountId: r.accountId,
      amount: MONTHLY_BUM[r.rank - 1],
      rank: r.rank,
      kind: 'monthly',
      title: r.rank === 1 ? TITLE : null,
      key: `arcade:${gameId}:monthly:${month}:${r.accountId}`,
    }));
}

export function payOnce(seen, payouts) {
  const applied = [];
  for (const p of payouts) {
    if (!p?.accountId || !(p.amount > 0) || seen.has(p.key)) continue;
    seen.add(p.key);
    applied.push(p);
  }
  return applied;
}

/** 레벨 모드 점수 타당성 (클라 engine.plausibleRun 과 동일 취지). */
export function plausibleArcadeRun({ score, level, durationMs, maxLevel = 40, gameId } = {}) {
  const sc = Math.round(Number(score) || 0);
  const lv = Math.max(1, Math.round(Number(level) || 1));
  const dur = Math.max(0, Number(durationMs) || 0);
  if (gameId === 'bumstore') {
    if (!Number.isFinite(sc) || sc < 0) return { ok: false, reason: 'bad_score' };
    if (sc > 500000) return { ok: false, reason: 'score_abs_cap' };
    if (dur > 0 && sc > 3000 && dur < 5000) return { ok: false, reason: 'too_fast' };
    const sec = Math.max(1, dur / 1000);
    if (sc > sec * 900 + 4000) return { ok: false, reason: 'score_cap' };
    if (sc >= 20000 && lv < 8) return { ok: false, reason: 'stage_mismatch' };
    return { ok: true };
  }
  if (!Number.isFinite(sc) || sc < 0) return { ok: false, reason: 'bad_score' };
  if (lv > maxLevel) return { ok: false, reason: 'level_cap' };
  const minMs = Math.max(0, (lv - 1) * 6000);
  if (dur > 0 && dur < minMs * 0.7) return { ok: false, reason: 'too_fast' };
  const sec = Math.max(1, dur / 1000);
  // 여유를 둔다. 초당 220이면 Lv1·30초에 9,100이 상한이라 9,109 같은 정상 기록이 거절됐다.
  const maxScore = Math.round(sec * 280 + lv * 2800);
  if (sc > maxScore) return { ok: false, reason: 'score_cap' };
  if (sc > 5000 && lv < 2 && dur < 20000) return { ok: false, reason: 'implausible' };
  // 절대 상한 (버그·치트 가드)
  if (sc > 500000) return { ok: false, reason: 'score_abs_cap' };
  return { ok: true };
}
