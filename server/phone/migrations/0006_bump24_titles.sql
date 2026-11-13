-- [bump24-titles] 범편의점 주간 칭호 이력 · 대표 칭호 선택.
-- 로컬: cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --local
-- 원격은 도훈님이 직접 적용한다. 이 파일은 --remote 로 돌리지 않는다.

CREATE TABLE IF NOT EXISTS bump24_titles (
  account_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  title_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  period_label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER,
  PRIMARY KEY (account_id, week_key)
);
CREATE INDEX IF NOT EXISTS bump24_titles_account ON bump24_titles (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bump24_titles_week ON bump24_titles (week_key, rank);

CREATE TABLE IF NOT EXISTS bump24_title_pref (
  account_id TEXT PRIMARY KEY,
  featured_id TEXT,
  featured_week TEXT,
  featured_source TEXT NOT NULL DEFAULT 'auto',
  updated_at INTEGER NOT NULL
);
