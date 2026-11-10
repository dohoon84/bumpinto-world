-- [arcade-pang] 레벨 모드: 런에 도달 레벨·플레이 시간(ms) 기록. 원격 D1은 도훈님이 직접 적용.
-- 로컬: cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --local

ALTER TABLE arcade_runs ADD COLUMN level INTEGER;
ALTER TABLE arcade_runs ADD COLUMN duration_ms INTEGER;
