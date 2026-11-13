-- [accounts] 이용약관·개인정보처리방침 동의 및 마케팅(업데이트 소식) 수신동의.
-- 로컬: cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --local
-- 원격은 도훈님이 직접 적용한다. 이 파일은 --remote 로 돌리지 않는다.
--
-- 번호: 0006 은 feat/weekly-titles(bump24 칭호)가 쓰므로 이 변경은 0007 이다.
-- 미적용 시 서버는 동의 컬럼이 없어도 로그인·조회는 동작하고, 동의 저장만 건너뛴다.
--   GET /auth/me 의 consent.needsTerms 는 true 로 내려가며, POST /auth/consent 은 503 consent_schema_missing.

ALTER TABLE accounts ADD COLUMN terms_version TEXT;
ALTER TABLE accounts ADD COLUMN terms_agreed_at INTEGER;
ALTER TABLE accounts ADD COLUMN privacy_version TEXT;
ALTER TABLE accounts ADD COLUMN privacy_agreed_at INTEGER;
ALTER TABLE accounts ADD COLUMN marketing_opt_in INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN marketing_agreed_at INTEGER;
ALTER TABLE accounts ADD COLUMN marketing_updated_at INTEGER;

CREATE TABLE IF NOT EXISTS consent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,          -- terms | privacy | marketing
  version TEXT,                -- 약관·방침 버전. marketing 은 NULL
  action TEXT NOT NULL,        -- agree | withdraw | skip_no_email
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS consent_log_account ON consent_log (account_id, at);
