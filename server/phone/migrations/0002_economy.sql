-- [economy] 2~5단계: 서버 이동 보상 · 퀘스트 · 업적/카르마 · 교통 이용 · 탈것 상점 · 게시판 보상. D1(SQLite).
-- 0001 은 이미 원격에 적용됐으므로 고치지 않는다. 새 표·인덱스만 추가(기존 표 변경 없음).
-- 적용: cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --remote
-- 금액은 server/phone/src/account/econ.js 한 곳에서 정한다(여기엔 금액 시드 없음).

-- 원장에서 상한(하루·주) 합계를 빠르게 구하려고
CREATE INDEX IF NOT EXISTS ledger_account_reason_at ON ledger (account_id, reason, created_at);

-- 서버가 인정한 이동 초(보상용). stat_mode_daily(통계)와 따로 — 속도 상한 이내 + 60초 창 순변위 30m 이상만.
CREATE TABLE IF NOT EXISTS stat_credit_daily (
  account_id TEXT NOT NULL,
  kst_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  credited_sec INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, kst_date, mode)
);

-- 날짜별로 이미 보상한 인정분(배율 적용 후). 원장 move 행과 같은 batch 에서만 바뀐다.
CREATE TABLE IF NOT EXISTS move_rewards (
  account_id TEXT NOT NULL,
  kst_date TEXT NOT NULL,
  minutes_paid INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, kst_date)
);

-- 원시 이벤트(append-only). 카르마·업적·퀘스트 진행은 여기서 다시 계산한다.
--   kind = ride(교통 이용, mode = bus|subway|taxi) | shop(구매) | board(보상 받은 글)
CREATE TABLE IF NOT EXISTS econ_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  mode TEXT,
  ref TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  listed_amount INTEGER NOT NULL DEFAULT 0,  -- 요금표 금액
  charged_amount INTEGER NOT NULL DEFAULT 0, -- 실제로 뺀 금액 (무료 기간 = 0)
  kst_date TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS econ_events_account ON econ_events (account_id, kind, created_at);

-- 퀘스트 받기 기록. amount = 실제 들어간 금액(상한에 걸려 0일 수 있음). period = 날짜 | ISO 주 | 월
CREATE TABLE IF NOT EXISTS quest_claims (
  account_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  period TEXT NOT NULL,
  cadence TEXT NOT NULL,               -- daily | weekly | monthly
  amount INTEGER NOT NULL DEFAULT 0,
  karma_axis TEXT,
  karma_points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, quest_id, period)
);
CREATE INDEX IF NOT EXISTS quest_claims_account_at ON quest_claims (account_id, cadence, created_at);

-- 일일 퀘스트 배정 기록(그날 처음 볼 때 서버가 정함, 이후 고정)
CREATE TABLE IF NOT EXISTS quest_assignments (
  account_id TEXT NOT NULL,
  kst_date TEXT NOT NULL,
  quest_ids TEXT NOT NULL,             -- 쉼표 구분
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, kst_date)
);

-- 업적 달성·보너스 (계정당 1회)
CREATE TABLE IF NOT EXISTS ach_claims (
  account_id TEXT NOT NULL,
  ach_id TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, ach_id)
);

-- 산 탈것(계정 귀속, 양도 불가). expires_at = 대여 이벤트용(NULL = 영구)
CREATE TABLE IF NOT EXISTS account_vehicles (
  account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,               -- econ.js SHOP id
  gift_id TEXT,                        -- 게임 탈것 모델(src/gifts/catalog.js) id
  source TEXT NOT NULL DEFAULT 'shop',
  price INTEGER NOT NULL DEFAULT 0,    -- 실제로 뺀 금액 (무료 기간 = 0)
  listed_price INTEGER NOT NULL DEFAULT 0,
  bound INTEGER NOT NULL DEFAULT 1,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER,
  PRIMARY KEY (account_id, item_id)
);

-- 게시판 보상 (글당 1회). status = paid | clawed
CREATE TABLE IF NOT EXISTS board_rewards (
  post_id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  body_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS board_rewards_account ON board_rewards (account_id, created_at);
CREATE INDEX IF NOT EXISTS board_rewards_hash ON board_rewards (account_id, body_hash);

-- 택시 홀드: 예상 요금을 잡아 두고(잔액 = 원장 합계 − 진행 중 홀드) 하차 때 실제 요금 1줄만 원장에 쓴다.
--   status = held | settled | cancelled. 만료(expires_at)된 held 는 잔액 계산에서 빠진다.
CREATE TABLE IF NOT EXISTS taxi_holds (
  hold_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  ride_id TEXT NOT NULL,
  code TEXT NOT NULL,
  held INTEGER NOT NULL DEFAULT 0,       -- 잡아 둔 금액 (무료 모드 = 0)
  list_amount INTEGER NOT NULL DEFAULT 0,
  free INTEGER NOT NULL DEFAULT 1,
  night INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'held',
  charged INTEGER,
  distance_m INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (account_id, ride_id)
);
CREATE INDEX IF NOT EXISTS taxi_holds_account ON taxi_holds (account_id, status, expires_at);
