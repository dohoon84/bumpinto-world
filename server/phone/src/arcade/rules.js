// [arcade-pang] 범핑팡 랭킹 규칙. 보상은 월간 1·2·3등만. 참여보상·일일보상 없음.
export const OPENING_MS = Date.parse('2026-11-09T15:00:00.000Z'); // 2026-11-10 00:00 KST (도훈 확정 전 초안)
export const GAME_ID = 'bumpingpang';
export const STORE_ID = 'arcade-seohyeon'; // 오락실 전광판 1개(매장 통합)
export const LIMIT_MSG = '오늘 도전 완료, 연습은 계속 가능';
export const MONTHLY_BUM = [5000, 3000, 2000]; // 월간 1·2·3만. 4~10 없음.
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
export function attemptCap(guest) { return guest ? 1 : 5; }

export function decideAttempt({ now, guest, used = 0, practice = false }) {
  if (practice) return { record: false, practice: true };
  if (now < OPENING_MS) return { record: false, practice: true, beforeOpen: true };
  const cap = attemptCap(!!guest);
  if (used >= cap) return { record: false, practice: true, usedUp: true, message: LIMIT_MSG, left: 0 };
  return { record: true, practice: false, attempt: used + 1, left: cap - used - 1 };
}

export function bestScore(prev, score) { return prev == null || score > prev ? score : prev; }
export function rankRows(rows) {
  return [...rows].sort((a, b) => b.score - a.score || a.at - b.at).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** 월 최고점(플레이어별 best)으로 순위 → 1·2·3만 지급. 게스트·계정 없는 줄 제외. */
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
  const maxScore = Math.round(sec * 220 + lv * 2500);
  if (sc > maxScore) return { ok: false, reason: 'score_cap' };
  if (sc > 5000 && lv < 2 && dur < 20000) return { ok: false, reason: 'implausible' };
  // 절대 상한 (버그·치트 가드)
  if (sc > 500000) return { ok: false, reason: 'score_abs_cap' };
  return { ok: true };
}
