// [bump24-titles] 주간 칭호 저장·조회. 규칙은 rules.js. 원격 D1 마이그레이션은 하지 않는다.
import { WEEKLY_TITLES, titleHistoryLabel, weekPeriodLabel, weeklyTitleOf } from './rules.js';

const one = async (db, sql, ...bind) => (await db.prepare(sql).bind(...bind).first()) || null;
const all = async (db, sql, ...bind) => (await db.prepare(sql).bind(...bind).all())?.results || [];

export function titlePublic(row, lang = 'ko') {
  if (!row) return null;
  const def = weeklyTitleOf(row.rank) || Object.values(WEEKLY_TITLES).find((x) => x.id === row.title_id);
  const week = row.week_key || row.weekKey;
  const label = row.period_label || weekPeriodLabel(week, 'ko');
  return {
    titleId: row.title_id || row.titleId,
    rank: Number(row.rank),
    weekKey: week,
    periodLabel: label,
    name: def ? { ko: def.ko, en: def.en } : { ko: row.title_id, en: row.title_id },
    record: { ko: titleHistoryLabel(week, row.title_id || row.titleId, 'ko'), en: titleHistoryLabel(week, row.title_id || row.titleId, 'en') },
    createdAt: Number(row.created_at || row.createdAt || 0),
    seenAt: row.seen_at == null && row.seenAt == null ? null : Number(row.seen_at ?? row.seenAt),
  };
}

export async function latestSettledWeek(db) {
  let fromPodium = null, fromTitles = null;
  try {
    const r = await one(db, "SELECT period FROM bump24_podium WHERE period LIKE 'week:%' ORDER BY period DESC LIMIT 1");
    const p = r?.period || '';
    if (p.startsWith('week:')) fromPodium = p.slice(5);
  } catch { /* */ }
  try {
    const r = await one(db, 'SELECT week_key FROM bump24_titles ORDER BY week_key DESC LIMIT 1');
    fromTitles = r?.week_key || null;
  } catch { /* */ }
  if (fromPodium && fromTitles) return fromPodium >= fromTitles ? fromPodium : fromTitles;
  return fromPodium || fromTitles;
}

export async function awardWeeklyTitles(db, week, rows, now) {
  if (!db || !week) return [];
  const awarded = [];
  for (const r of rows || []) {
    if (!r || r.rank > 3 || !r.accountId || r.guest) continue;
    const def = weeklyTitleOf(r.rank);
    if (!def) continue;
    const label = weekPeriodLabel(week, 'ko');
    try {
      const ins = await db.prepare(
        `INSERT INTO bump24_titles (account_id, week_key, title_id, rank, period_label, created_at, seen_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(account_id, week_key) DO NOTHING`,
      ).bind(r.accountId, week, def.id, r.rank, label, now).run();
      if (Number(ins?.meta?.changes || 0)) awarded.push({ accountId: r.accountId, titleId: def.id, rank: r.rank, week });
    } catch (e) {
      // 마이그레이션 전이면 정산 범 지급은 그대로 두고 칭호만 건너뛴다
      if (!String(e?.message || e).includes('no such table')) throw e;
      return awarded;
    }
  }
  return awarded;
}

export async function loadTitles(db, accountId) {
  if (!accountId) return { guest: true, current: null, history: [], pendingEarn: false, featured: null };
  let rows = [];
  try {
    rows = await all(db,
      `SELECT week_key, title_id, rank, period_label, created_at, seen_at
       FROM bump24_titles WHERE account_id = ? ORDER BY week_key DESC`,
      accountId,
    );
  } catch (e) {
    if (String(e?.message || e).includes('no such table')) return { guest: false, current: null, history: [], pendingEarn: false, featured: null };
    throw e;
  }
  const history = rows.map((r) => titlePublic(r));
  let currentWeek = null;
  try { currentWeek = await latestSettledWeek(db); } catch { currentWeek = history[0]?.weekKey || null; }
  const current = history.find((h) => h.weekKey === currentWeek) || null;
  let featured = current;
  try {
    const pref = await one(db, 'SELECT featured_id, featured_week, featured_source FROM bump24_title_pref WHERE account_id = ?', accountId);
    if (pref?.featured_source === 'weekly' && pref.featured_id && pref.featured_week === currentWeek) {
      const hit = history.find((h) => h.weekKey === pref.featured_week && h.titleId === pref.featured_id);
      if (hit) featured = hit;
    }
  } catch { /* pref 테이블이 없으면 이번 주 칭호가 대표 */ }
  return { guest: false, current, history, pendingEarn: !!(current && current.seenAt == null), featured };
}

export async function markTitleSeen(db, accountId, weekKey, now) {
  if (!accountId || !weekKey) return false;
  try {
    const r = await db.prepare(
      'UPDATE bump24_titles SET seen_at = ? WHERE account_id = ? AND week_key = ? AND seen_at IS NULL',
    ).bind(now, accountId, weekKey).run();
    return Number(r?.meta?.changes || 0) > 0;
  } catch (e) {
    if (String(e?.message || e).includes('no such table')) return false;
    throw e;
  }
}

export async function setFeaturedTitle(db, accountId, { titleId, weekKey, source = 'weekly' }, now) {
  if (!accountId) return null;
  await db.prepare(
    `INSERT INTO bump24_title_pref (account_id, featured_id, featured_week, featured_source, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       featured_id = excluded.featured_id,
       featured_week = excluded.featured_week,
       featured_source = excluded.featured_source,
       updated_at = excluded.updated_at`,
  ).bind(accountId, titleId || null, weekKey || null, source || 'auto', now).run();
  return loadTitles(db, accountId);
}

export { WEEKLY_TITLES, weekPeriodLabel, titleHistoryLabel };
