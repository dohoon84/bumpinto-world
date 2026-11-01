# 폰 카메라 · 사진 앱 (`src/camera/`)

인게임 휴대폰 홈 화면에 **카메라**·**사진** 앱을 더한다. 일반적인 스마트폰 카메라 모양을 따르되 특정 제조사 로고·상표는 쓰지 않는다.

## 구조

| 파일 | 역할 | 언제 로드 |
| --- | --- | --- |
| `index.js` | 폰에 아이콘 2개 등록, `?camera=0` 처리, 본체 지연 로드 | 게임 시작 시 (≈1KB) |
| `glyphs.css` | 아이콘 그림(CSS만) | 게임 시작 시 (≈1.4KB) |
| `cameraApp.js` + `camera.css` | 뷰파인더·촬영 확인·사진 보관함 UI | **앱을 처음 열 때** (동적 import) |
| `media.js` | 캡처·축소·JPEG 인코딩·캡션/워터마크 합성·내려받기/공유·셔터음 | 〃 |
| `photoStore.js` | IndexedDB 저장소 | 〃 |
| `newsTip.js` | 뉴스 제보 전송 | 〃 |

`src/handset.js` 에는 `addApp({ launch })`(폰 밖 화면을 여는 앱)과 `mounted(pane)`(비동기로 채우는 앱) 두 갈래만 추가했다.

## 성능 원칙

- 닫혀 있을 때: 3D 장면·렌더 패스·렌더 타깃·텍스처·지오메트리 추가 없음. DOM 은 폰 홈 화면 아이콘 2개뿐.
- 뷰파인더: 실시간 캔버스 위 DOM 오버레이(어둡게 가린 테두리 + 격자). 별도 렌더 패스 없음. 줌은 `camera.fov` 만 바꾸고 닫을 때 원래 값으로 되돌린다.
- 촬영: `preserveDrawingBuffer` 없이, 셔터 순간 `renderer.render()` 를 한 번 더 부르고 같은 태스크 안에서 캔버스를 2D 캔버스로 복사한다. 임시 캔버스는 바로 0×0 으로 줄여 해제.
- 닫을 때: 뷰파인더 DOM 제거, object URL 해제, AudioContext 닫기, 키 리스너 해제.

## 상한 (용량)

| 항목 | 값 |
| --- | --- |
| 저장 사진 수 | 최대 **20장** (꽉 차면 저장을 막고 안내 — 자동으로 옛 사진을 지우지 않음) |
| 저장 해상도 | 긴 변 **1280px**, JPEG 품질 0.86 (보통 장당 100–250KB) |
| 썸네일 | 긴 변 240px, JPEG 0.72 |
| 캡션 | 최대 120자 |
| 저장소 | IndexedDB `bumpinto.photos` / store `photos` (브라우저 안에만, 서버 업로드 없음) |
| 제보 사진 | 긴 변 **960px**, 280KB 이하가 되도록 품질 0.8→0.5 로 낮춰 보냄 (서버 상한 300KB) |

## 끄기

`?camera=0` — 아이콘도 등록하지 않으며 `cameraApp.js` 는 받지도 않는다(기존 화면과 동일).

## 뉴스 제보 (`POST {SMS_BASE}/news-tip`)

게임에는 아직 뉴스 화면이 없어서, 제보는 **운영진 검토함**에만 쌓인다. 자동 게시 없음.

- 클라이언트: `{ op: "submit", id, region, caption(2–120자), image(base64 JPEG), w, h, takenAt, x, z }`
- 서버(`server/phone`): `PhoneBook.newsTip()` — 가입된 번호만, 1인 하루 5건, 검토 대기 300건 상한, 30일 지나면 삭제, JPEG 시작/끝 표식 확인. 표(`news_tips`)는 번호 매긴 마이그레이션과 섞이지 않게 처음 쓸 때 `CREATE TABLE IF NOT EXISTS` 로 만든다.
- 운영자(게시판 관리자와 같은 판정): `op: "list" | "image" | "review"(approved/rejected)`.
- 서버를 아직 배포하지 않았으면 `/news-tip` 이 404 → 앱에 "뉴스 제보 서버가 아직 준비되지 않았어요" 안내. 번호 서버 없이 접속한 로컬 모드면 "제보를 보낼 수 없어요(저장·내려받기는 가능)" 안내.
- 로컬 확인: `cd server/phone && npx wrangler dev --port <p>` 후 게임에 `?sms=http://127.0.0.1:<p>`.
