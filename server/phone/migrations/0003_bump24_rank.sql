-- [bump24-rank] 매장별 하루 최고 기록 · 도전 횟수 · 정산 멱등 키.
-- 로컬: cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --local
-- 원격은 도훈님이 직접 적용한다. 이 파일은 --remote 로 돌리지 않는다.

CREATE TABLE IF NOT EXISTS bump24_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_key TEXT NOT NULL,
  account_id TEXT,
  store_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  name TEXT NOT NULL,
  guest INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS bump24_runs_attempt ON bump24_runs (player_key, store_id, day_key, attempt);
CREATE INDEX IF NOT EXISTS bump24_runs_store_day ON bump24_runs (store_id, day_key);

CREATE TABLE IF NOT EXISTS bump24_best (
  player_key TEXT NOT NULL,
  account_id TEXT,
  store_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  name TEXT NOT NULL,
  guest INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (player_key, store_id, day_key)
);
CREATE INDEX IF NOT EXISTS bump24_best_store_day ON bump24_best (store_id, day_key, score DESC);

CREATE TABLE IF NOT EXISTS bump24_settlement (
  idempotency_key TEXT PRIMARY KEY,
  account_id TEXT,
  period TEXT NOT NULL,
  kind TEXT NOT NULL,
  store_id TEXT,
  amount INTEGER NOT NULL,
  rank INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bump24_notices (
  idempotency_key TEXT PRIMARY KEY,
  player_key TEXT NOT NULL,
  account_id TEXT,
  amount INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  acked_at INTEGER
);
CREATE INDEX IF NOT EXISTS bump24_notices_player ON bump24_notices (player_key, acked_at);

CREATE TABLE IF NOT EXISTS bump24_podium (
  period TEXT NOT NULL,
  player_key TEXT NOT NULL,
  account_id TEXT,
  name TEXT NOT NULL,
  guest INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (period, player_key)
);
