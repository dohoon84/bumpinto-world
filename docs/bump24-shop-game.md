# BUMP24 30초 장보기 (bump24game)

플래그: `?bp24=1&bp24game=1` (또는 `?bump24=1&bp24game=1`). 매장 플래그 없이는 꺼져 있음.

## 흐름
1. BUMP24 문 앞(2.4m) → `E` / 힌트 탭 "들어가기" → 지하철식 페이드 → 별도 내부 Scene (도시는 렌더 안 함)
2. 매장 안: 바깥 UI(위에서 보기·역으로·지구본·나가기, KO/함께/게시판/접속자, 미니맵·폰, 인벤토리, 이름표 등)는
   `body > *` 에 `b24-outside-hidden` 을 붙여 숨기고(MutationObserver 로 새로 붙는 것도), 나올 때 전부 되돌림. 모바일은 `#m-joy` 만 남김.
3. 입구 옆 파란 바구니 `E`/탭 → 5초 카운트다운 → 30초. 진열칸 앞에서 담기(노란 화살표가 집을 상품),
   같은 칸 연타는 점점 느려짐, 계산대 뒤 선물세트·와인은 직원이 꺼내 주느라 느림. 6kg 넘으면 와르르(바닥에서 다시 줍기).
4. 시간 끝 → TIME UP → 계산대 → 스캐너 삑(상품별) + 영수증 출력 → 카칭 → 결과(색종이, 최고 기록, 연습·리더보드·나가기)
5. 하루 첫 판 = 랭킹(로컬 표시), 이후 연습 무제한. 진열·할인(2배 1~2종)은 매장 id + 날짜 시드.

## 모바일
가로 전용. 세로면 '휴대폰을 가로로 돌려주세요' 화면 + 게임 시간 정지. 입장 때 전체화면 + `screen.orientation.lock('landscape')` 을 시도(실패해도 안내 화면으로 동작).
HUD 는 낮은 화면(`max-height: 520px`)에서 위쪽 한 줄로 납작하게, 조이스틱 왼쪽 아래(#m-joy 재사용), 담기 버튼 오른쪽 아래, safe-area 반영.

## 렌더
정적 가구는 재질별 한 지오메트리(정점색 + 바닥 AO): 일반·금속·바닥·간판(무광 아틀라스)·데칼(그림자·LED 반사·스티커)·유리 + 상품 1(아틀라스 UV 를 구운 한 덩어리, 집으면 해당 정점만 숨김).
직원은 `clerkSource()`(bp24) 2 draw. 매장 안 ≈ 24~25 draw (플레이어 아바타 포함).

## 기록
`window.__jj.bump24LastRun` = `{ v, storeId, dateKey, seed, ranked, score, saleIds, events:[{id,t,w,sale,src}|{spill,t}], items, weight, spills, maxCombo }` — 나중에 서버 제출용.
localStorage: `bw.bump24.best`, `bw.bump24.localBoard`(랭킹 공급자 로컬 스텁), `bw.bump24.ranked`.

## 랭킹 전광판 (`src/bump24game/leaderboard.js`)
- **공급자 하나**: `leaderboard.top({ storeId, period: 'today'|'week', limit })` · `leaderboard.submit({ storeId, name, score, at, dateKey, ranked, items })` · `subscribe(fn)`.
  지금은 로컬 스텁(`createLocalLeaderboard`, `bw.bump24.localBoard`, 15일 보관, 닉네임별 최고 1개, 주 = 월요일 0시부터) — 라벨 `연습용(이 기기)`.
  서버(4단계)는 같은 모양의 객체를 `setLeaderboardProvider(p)` 로 넣으면 전광판·전체 랭킹이 그대로 따라감.
- 판이 끝나면(연습 포함) `finish()` → `submit` → 공급자 알림 → 매장 안팎 전광판 텍스처 즉시 다시 그림. 그 외에는 다시 그리지 않음
  (오늘/이번 주 두 판을 한 캔버스에 나란히 그리고 7초마다 `texture.offset` 만 밀어 넘김, 반짝이는 셰이더 uniform).
- **매장 밖**: bp24 체인 모듈(`setBp24BoardHook`)이 모든 매장 앞 서쪽 끝 기둥 앞에 세로 토템(1.44×2.16m 화면, 문·볼라드 비켜 섬, 몸통 충돌 있음).
  타일당 틀 1(외벽 재질) + 반짝이/바닥 후광 1(셰이더), 매장당 화면 1 → 매장 1곳 타일 +3 draw. 미니게임 플래그(`bp24game=1`)일 때만 생김.
  2.3m 안에 오면 힌트 `E 🏆 … 장보기 랭킹 보기`(모바일은 힌트 탭), 토템 클릭(짧은 탭)으로도 열림.
- **매장 안**: 블랙 냉장고 위 벽걸이 화면(가로 배치 텍스처, 같은 내용) +2 draw → ≈ 28 draw. 둘러보기 중 클릭하면 전체 랭킹.
- 전체 랭킹 UI(`ui.showBoard({ storeId, storeName, me })`): 오늘/이번 주 탭, 상위 20, 1~3위 메달, 내 닉네임 강조·내 순위, 빈 상태 '첫 번째 장보기왕이 되어보세요!'. 모바일 가로는 좌(제목·탭)/우(목록) 2단.

## 디버그
`__jj.bump24Game.enterStore(__jj.corridor.bp24.stores[0])`, `._dbg.game._skip(sec)`, `._dbg.timeScale = 0` (멈춤), `._dbg.interior.stats()`, `.openBoard(storeId)`, `._dbg.leaderboard.submit({...})`.
