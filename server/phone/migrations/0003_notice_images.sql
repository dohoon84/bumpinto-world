-- [notice-images] 제안 전용. 이 파일을 D1(bumpinto-accounts)에 적용하지 않는다.
--
-- 게시글 posts 는 D1 이 아니라 PhoneBook Durable Object 의 SQLite 에 있다.
-- 아래 ALTER 를 `wrangler d1 migrations apply` 로 D1 에 실행하면 posts 표가 없어
-- 실패하고, 그 뒤의 D1 마이그레이션까지 막힌다.
--
-- 공지 이미지를 서버에 저장하려면 PhoneBook DO SQLite 에만 다음을 적용한다.
-- 워커는 이 컬럼이 없으면 이미지를 건너뛰고, 글은 지금처럼 텍스트만 보여 준다.
--
--   ALTER TABLE posts ADD COLUMN images TEXT;
--
-- images 는 JSON 배열이다. 예: [{"url":"/notice-images/nabc1234ef","alt":"야경"}]
-- 바이트는 새 버킷이 아니라 기존 R2 바인딩 PHOTOS(bumpinto-photos)의 notices/ 접두어.
--
-- 이 파일의 실행문은 D1 을 바꾸지 않는 no-op 이다.
-- D1 마이그레이션 목록에 올라가면 0003 번호가 소모되므로, D1 에는 적용하지 않는다.

SELECT 1;
