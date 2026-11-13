// [bump24-rank] KST 규칙. D1·네트워크 없음. 단위 테스트가 이 파일만 본다.
export const OPENING_MS = Date.parse('2026-11-08T15:00:00.000Z'); // 2026-11-09 00:00 KST
export const PART_BUM = 20;
export const PART_STORES = 10;
export const DAILY_BUM = [200, 100, 60];
export const DAILY_STORES = 5;
export const MIN_PARTICIPANTS = 5;
export const RANK_POINTS = [3, 2, 1];
export const WEEKLY_BUM = [3000, 2000, 1000];
export const WEEKLY_REST = 500;
export const MONTHLY_BUM = [10000, 6000, 4000];
export const MONTHLY_REST = 1000;
export const TITLE = '편의점 큰손'; // 예전 1위 이름 '장보기왕'을 대체. 지급 id 는 WEEKLY_TITLES
export const WEEKLY_TITLES = Object.freeze({
  1: Object.freeze({ id: 'title_bigspender', slug: 'bigspender', ko: '편의점 큰손', en: 'Big Spender' }),
  2: Object.freeze({ id: 'title_flexregular', slug: 'flexregular', ko: '플렉스 단골', en: 'Flex Regular' }),
  3: Object.freeze({ id: 'title_bogohunter', slug: 'bogohunter', ko: '1+1 사냥꾼', en: '1+1 Hunter' }),
});
export function weeklyTitleOf(rank) { return WEEKLY_TITLES[rank] || null; }
export function weekPeriodLabel(weekMonday, lang = 'ko') {
  const parts = String(weekMonday || '').split('-').map(Number);
  const y = parts[0], m = parts[1], d = parts[2];
  if (!y || !m || !d) return '';
  const nth = Math.ceil(d / 7);
  const monthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (lang === 'en') return `${monthsEn[m - 1] || m} week ${nth}`;
  return `${m}월 ${nth}주차`;
}
export function titleHistoryLabel(weekMonday, titleId, lang = 'ko') {
  const def = Object.values(WEEKLY_TITLES).find((x) => x.id === titleId);
  const name = def ? (def[lang] || def.ko) : titleId;
  const week = weekPeriodLabel(weekMonday, lang);
  return week ? `${week} ${name}` : name;
}
export const LIMIT_MSG = '오늘 도전 완료, 연습은 계속 가능';
export const CAP_DAY = PART_STORES * PART_BUM + DAILY_STORES * DAILY_BUM[0];
export const CAP_WEEK = 7 * CAP_DAY + WEEKLY_BUM[0];
export const CAP_MONTH = 30 * CAP_DAY + 4 * WEEKLY_BUM[0] + MONTHLY_BUM[0];

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

export function participationPay({ accountId, day, storeId, storesAlready }) {
  if (!accountId || storesAlready >= PART_STORES) return null;
  return { accountId, amount: PART_BUM, kind: 'part', storeId, key: `bp24:part:${day}:${storeId}:${accountId}` };
}

export function dailyRankPays(stores) {
  const cand = [];
  for (const s of stores) {
    if ((s.participants || 0) < MIN_PARTICIPANTS) continue;
    for (const r of s.rows || []) {
      if (r.rank > 3 || r.guest || !r.accountId) continue;
      cand.push({ accountId: r.accountId, amount: DAILY_BUM[r.rank - 1], rank: r.rank, storeId: s.storeId, day: s.day, kind: 'daily', key: `bp24:daily:${s.day}:${s.storeId}:${r.accountId}` });
    }
  }
  cand.sort((a, b) => b.amount - a.amount || String(a.storeId).localeCompare(String(b.storeId)));
  const n = new Map(), pays = [];
  for (const c of cand) {
    const u = n.get(c.accountId) || 0;
    if (u >= DAILY_STORES) continue;
    n.set(c.accountId, u + 1);
    pays.push(c);
  }
  return pays;
}

// opts.minParticipants: 그날 지점 참가자가 이 수보다 적으면 그 지점의 1~3위 점수를 뺀다(월간·기본 5).
// opts.accountsOnly: 게스트를 순위 매기기 전에 빼서 로그인 계정끼리 1·2·3위를 정한다(주간).
export function pointRows(dailyTops, opts = {}) {
  const min = opts.minParticipants ?? MIN_PARTICIPANTS;
  const accountsOnly = !!opts.accountsOnly;
  const map = new Map();
  for (const r of dailyTops) {
    if (!r || r.rank > 3) continue;
    if (min > 0 && (r.participants || min) < min) continue;
    if (accountsOnly && (r.guest || !r.accountId)) continue;
    const id = r.playerKey || r.accountId;
    const cur = map.get(id) || { playerKey: id, accountId: r.accountId || null, guest: !!r.guest, name: r.name || '', points: 0 };
    cur.points += RANK_POINTS[r.rank - 1];
    if (r.name) cur.name = r.name;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.points - a.points || String(a.name).localeCompare(String(b.name))).map((r, i) => ({ ...r, rank: i + 1 }));
}
// 주간 정산(칭호·주간 범·주간 순위판): 최소 인원 없음, 게스트 제외
export const WEEKLY_POINT_OPTS = Object.freeze({ minParticipants: 0, accountsOnly: true });
export const weeklyPointRows = (dailyTops) => pointRows(dailyTops, WEEKLY_POINT_OPTS);

function podiumPays(rows, amounts, rest, kind, periodKey, topN = 10) {
  return rows.filter((r) => r.rank <= topN && r.accountId && !r.guest).map((r) => ({
    accountId: r.accountId, amount: r.rank <= 3 ? amounts[r.rank - 1] : rest, rank: r.rank, kind,
    title: kind === 'weekly' ? (weeklyTitleOf(r.rank)?.id || null) : null,
    key: `bp24:${kind}:${periodKey}:${r.accountId}`,
  }));
}
export const weeklyPays = (rows, week) => podiumPays(rows, WEEKLY_BUM, WEEKLY_REST, 'weekly', week);
export const monthlyPays = (rows, month) => podiumPays(rows, MONTHLY_BUM, MONTHLY_REST, 'monthly', month);

export function payOnce(seen, payouts) {
  const applied = [];
  for (const p of payouts) {
    if (!p?.accountId || !(p.amount > 0) || seen.has(p.key)) continue;
    seen.add(p.key);
    applied.push(p);
  }
  return applied;
}

function firstMonday(y, m) {
  const t = Date.UTC(y, m - 1, 1);
  const dow = new Date(t).getUTCDay();
  const add = (8 - dow) % 7;
  return t + add * 864e5;
}
export function monthlyAnnounceMs(y, m) {
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return firstMonday(ny, nm) - KST;
}
export function boardView(now) {
  const p = kstParts(now);
  const ann = monthlyAnnounceMs(p.m === 1 ? p.y - 1 : p.y, p.m === 1 ? 12 : p.m - 1);
  if (now >= ann && now < ann + 7 * 864e5 && ann >= monthlyAnnounceMs(2026, 11)) return 'monthly';
  if (p.dow === 1) return 'weekly';
  return 'yesterday';
}
