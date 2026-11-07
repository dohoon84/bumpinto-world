-- [titles] 제안만. 이 변경에서는 적용하지 않는다.
--   원격 D1 에 넣지 말 것. wrangler d1 migrations apply 를 돌리지 않는다.
-- 칭호를 얻은 계정. 사다리는 서버가 넣고, 클라이언트가 보낸 거리는 쓰지 않는다.
-- source = ladder | store   store 는 BUMP24 장보기왕처럼 사다리 밖 칭호.
CREATE TABLE IF NOT EXISTS account_titles (
  account_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (account_id, title_id)
);
CREATE INDEX IF NOT EXISTS account_titles_by_title ON account_titles (title_id);

-- 지금 달고 있는 칭호. title_id 가 빈 문자열이면 안 단 상태.
CREATE TABLE IF NOT EXISTS account_title_equip (
  account_id TEXT NOT NULL PRIMARY KEY,
  title_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
