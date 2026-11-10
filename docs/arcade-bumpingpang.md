# BUMP 오락실 · 범핑팡

- 위치: 서현역(`public/corridor/index.json` station `seohyeon`) 5번 출구 옆 상업건물 1층.
  - 건물: `public/corridor/tiles/2_-5.json` buildings[146] (commercial, h=13.4, 중심 ≈ 1326.75, -2076.5).
  - OSM에 오락실/게임장 태그는 없어서 실제 footprint에 우리 브랜드로 입점.
- 기본 ON, `?arcade=0` 이면 끔.
- 로컬 바로 가기: `?at=arcade-seohyeon` (문 앞 스폰).
- 조작: 문 앞 **E** 입장 · 오락실 안 **F** 또는 오락기 화면 클릭 → 범핑팡 · **R** 순위판 · 매장 안 음소거 버튼.
- 랭킹: 오락실 통합 1판. 오늘/주간은 구경용, **월간 최고점 1·2·3만 보상** (참여·일일·주간 지급 없음).
- D1: `server/phone/migrations/0004_arcade_pang.sql` — 원격은 도훈님이 적용.
- 월간 정산(서버 job 초안): `settleArcadeMonth(db, env, 'YYYY-MM')` in `server/phone/src/arcade/db.js`.
