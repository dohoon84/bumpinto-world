-- [arcade-pang] BUMP 오락실 · 범핑팡. 오락실 전광판 1개(store_id) + game_id.
-- 보상: 월간 최고점 1·2·3만 (참여/일일/주간 지급 없음). 원격 적용은 도훈님이 직접.
-- 로컬: cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --local

CREATE TABLE IF NOT EXISTS arcade_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS arcade_runs_attempt ON arcade_runs (player_key, game_id, store_id, day_key, attempt);
CREATE INDEX IF NOT EXISTS arcade_runs_store_day ON arcade_runs (game_id, store_id, day_key);

CREATE TABLE IF NOT EXISTS arcade_best (
  game_id TEXT NOT NULL,
  player_key TEXT NOT NULL,
  account_id TEXT,
  store_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  name TEXT NOT NULL,
  guest INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (player_key, game_id, store_id, day_key)
);
CREATE INDEX IF NOT EXISTS arcade_best_store_day ON arcade_best (game_id, store_id, day_key, score DESC);

-- 월간 최고점(플레이어별, 그달 일일 best 중 max)을 정산 때 적재
CREATE TABLE IF NOT EXISTS arcade_month_best (
  game_id TEXT NOT NULL,
  player_key TEXT NOT NULL,
  account_id TEXT,
  store_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  name TEXT NOT NULL,
  guest INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (player_key, game_id, store_id, month_key)
);
CREATE INDEX IF NOT EXISTS arcade_month_best_rank ON arcade_month_best (game_id, store_id, month_key, score DESC);

CREATE TABLE IF NOT EXISTS arcade_settlement (
  idempotency_key TEXT PRIMARY KEY,
  account_id TEXT,
  period TEXT NOT NULL,
  kind TEXT NOT NULL,
  game_id TEXT,
  store_id TEXT,
  amount INTEGER NOT NULL,
  rank INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS arcade_notices (
  idempotency_key TEXT PRIMARY KEY,
  player_key TEXT NOT NULL,
  account_id TEXT,
  amount INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  acked_at INTEGER
);
CREATE INDEX IF NOT EXISTS arcade_notices_player ON arcade_notices (player_key, acked_at);
