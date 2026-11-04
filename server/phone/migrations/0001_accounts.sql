-- [accounts] Bumpinto World 계정 · 원장 · 칭호용 기록 (1단계). D1(SQLite).
-- 적용: cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --remote
-- 금액은 전부 정수 bum. 원장 행은 지우지 않는다(회수·환불도 음수 행).

-- 계정: 구글 sub 로만 찾는다. 구글 토큰은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,                 -- 서버가 만든 UUID
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,         -- ms
  first_login_at INTEGER NOT NULL,     -- ms, 처음 로그인한 시각(이후 바뀌지 않음)
  last_login_at INTEGER NOT NULL,
  primary_user_id TEXT,                -- 대표 캐릭터 = PhoneBook users.id (처음 연결된, 번호가 있는 기기)
  session_version INTEGER NOT NULL DEFAULT 1, -- 올리면 예전 세션 쿠키가 모두 무효
  status TEXT NOT NULL DEFAULT 'active'
);

-- 기기(= 기존 deviceId = PhoneBook users.id) 하나는 계정 하나에만 붙는다.
CREATE TABLE IF NOT EXISTS account_devices (
  device_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  merge_status TEXT NOT NULL DEFAULT 'pending', -- pending | primary | dry | merged | none
  merged_at INTEGER
);
CREATE INDEX IF NOT EXISTS account_devices_account ON account_devices (account_id);

-- 이전(마이그레이션) 감사 기록. mode = dry | on
CREATE TABLE IF NOT EXISTS migrations_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  to_user_id TEXT,
  mode TEXT NOT NULL,
  item TEXT NOT NULL,                  -- gift:<item_id> | photos | photos_dedup | places | phone
  qty INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS migrations_log_account ON migrations_log (account_id, at);

-- 원장. 잔액 = 합계. kind 는 유료(paid, 현금 충전 — 7단계 전까지 항상 0) / 무료(free).
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  amount INTEGER NOT NULL,             -- +지급 / -차감
  kind TEXT NOT NULL CHECK (kind IN ('paid', 'free')),
  reason TEXT NOT NULL,                -- welcome | beta | move | quest | ach | fare | shop | refund | clawback
  ref TEXT,                            -- 퀘스트 id, 영수증 id, 기기 id 등
  idempotency_key TEXT NOT NULL UNIQUE,
  price_table_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_account ON ledger (account_id, id);

-- 잔액 캐시: 원장 행을 넣는 같은 batch(트랜잭션) 안에서 원장 합계로 다시 계산한다.
CREATE TABLE IF NOT EXISTS account_balances (
  account_id TEXT PRIMARY KEY,
  free_balance INTEGER NOT NULL DEFAULT 0,
  paid_balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- 1회성 지급의 보조 키 (예: beta-dev:<device_id> — 기기당 1회)
CREATE TABLE IF NOT EXISTS grant_claims (
  claim_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 가격표(버전별). 요금 인상은 새 ver 로 넣고, 원장 행은 자기 ver 를 들고 있다.
CREATE TABLE IF NOT EXISTS price_table (
  ver INTEGER NOT NULL,
  code TEXT NOT NULL,
  amount INTEGER NOT NULL,
  effective_at INTEGER NOT NULL,
  PRIMARY KEY (ver, code)
);
INSERT OR IGNORE INTO price_table (ver, code, amount, effective_at) VALUES
  (1, 'grant.welcome', 20000, 0),
  (1, 'grant.beta', 10000, 0);

-- ── 칭호용 기록 (보상 없음, 통계만) ──
-- 접속일 (KST)
CREATE TABLE IF NOT EXISTS login_days (
  account_id TEXT NOT NULL,
  kst_date TEXT NOT NULL,              -- 'YYYY-MM-DD'
  first_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, kst_date)
);

-- 수단별 누적 이동 (서버가 웹소켓 위치로 잰 값. 수단별 속도 상한·순간이동 제외)
CREATE TABLE IF NOT EXISTS stat_mode_totals (
  account_id TEXT NOT NULL,
  mode TEXT NOT NULL,                  -- walk | bike | roadbike | superbike | truck | bus | taxi
  distance_m INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, mode)
);

-- 같은 값의 일별(KST) 집계 — 주·월 통계와 연속 기록은 여기서 계산
CREATE TABLE IF NOT EXISTS stat_mode_daily (
  account_id TEXT NOT NULL,
  kst_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  distance_m INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, kst_date, mode)
);

-- 사진 촬영 기록. point_id 는 포토 포인트가 정해지면 채운다(지금은 NULL).
CREATE TABLE IF NOT EXISTS photo_point_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  point_id TEXT,
  region TEXT,
  x INTEGER,
  z INTEGER,
  kst_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (account_id, photo_id)
);
CREATE INDEX IF NOT EXISTS photo_point_log_account ON photo_point_log (account_id, created_at);
