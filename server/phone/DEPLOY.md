# 계정·원장 1단계 배포 순서 (jeongja-phone Worker)

이 브랜치(`feat/accounts`)는 **코드만** 들어 있다. 아래는 도훈이 직접 하는 순서다. 명령은 모두 `server/phone` 에서 실행한다.
기본값은 전부 꺼짐(`ACCOUNTS_ENABLED=0`, `ECONOMY_ENABLED=0`)이라, 1~5 단계까지 마쳐도 정자는 그대로다.

구글 OAuth 클라이언트 ID (공개 값): `1011905802733-qpjjglquapnuacrq5v7tqordlotpdso3.apps.googleusercontent.com`

## 0. 준비

```bash
cd server/phone
npx wrangler whoami          # 올바른 Cloudflare 계정인지
npx wrangler secret list     # ADMIN_PHONES 등 기존 비밀 확인 (아래 3 참고)
```

## 1. D1 데이터베이스 만들기

```bash
npx wrangler d1 create bumpinto-accounts
```

출력된 `database_id` 를 `wrangler.jsonc` 의 `d1_databases[0].database_id` 자리표시자
(`00000000-0000-0000-0000-000000000000`) 에 붙여 넣는다. **바꾸기 전에는 `npm run deploy:phone` 이 실패한다.**

## 2. 마이그레이션 적용

```bash
npx wrangler d1 migrations list bumpinto-accounts --remote    # 0001_accounts.sql 이 대기 중인지
npx wrangler d1 migrations apply bumpinto-accounts --remote
# 로컬 개발용(wrangler dev) DB:
npx wrangler d1 migrations apply bumpinto-accounts --local
```

확인:

```bash
npx wrangler d1 execute bumpinto-accounts --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

## 3. 세션 비밀키

```bash
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
```

- 32자 이상이어야 한다(짧으면 로그인 API 가 `accounts_not_configured` 로 503).
- 바꾸면 모든 로그인 세션이 끊긴다(게스트 플레이는 영향 없음).
- `wrangler.jsonc` 에 `"keep_vars": true` 를 넣어, 대시보드에서 넣은 일반 변수가 배포 때 지워지지 않게 했다.
  다만 `ADMIN_PHONES`·`ALLOWED_ORIGINS` 는 가능하면 secret 으로 두는 것이 안전하다 (`npx wrangler secret list` 에 보이는지 확인).

## 4. 같은 사이트 API 도메인 (로그인 쿠키에 필요)

세션 쿠키는 `SameSite=Lax` 다. `*.workers.dev` 는 공개 접미사 목록에 있어 `bumpinto.world` 와 **다른 사이트**로 취급되므로,
게임(bumpinto.world)에서 `jeongja-phone.xn0texn073.workers.dev` 로 보내는 fetch·웹소켓에는 쿠키가 실리지 않는다.
그래서 Worker 에 같은 사이트 도메인을 붙인다 (bumpinto.world 존이 Cloudflare 에 있어야 함):

- 대시보드 → Workers & Pages → `jeongja-phone` → Settings → Domains & Routes → Add → Custom domain → `api.bumpinto.world`
- 또는 `wrangler.jsonc` 에 `"routes": [{ "pattern": "api.bumpinto.world", "custom_domain": true }]` 를 넣고 배포.

기존 `workers.dev` 주소는 그대로 살아 있으므로 지금 게임(게스트·번호부·사진)은 영향이 없다.

## 5. 구글 클라우드 콘솔 (OAuth 클라이언트)

`API 및 서비스 → 사용자 인증 정보 → 위 클라이언트 ID → 승인된 JavaScript 원본` 에 추가:

- `https://bumpinto.world`
- `https://www.bumpinto.world` (쓴다면)
- `http://localhost` 와 `http://localhost:5173` (로컬 개발 — GIS 는 localhost 에 포트 없는 항목도 요구한다)
- `http://127.0.0.1:5173` (로컬에서 쿠키 시험용, 아래 8 참고)

리디렉션 URI 는 필요 없다(팝업/One Tap ID 토큰 방식). OAuth 동의 화면이 "테스트" 상태면 테스트 사용자만 로그인된다.

## 6. Worker 배포 (아직 기능은 꺼진 채로)

```bash
cd ../..            # 저장소 루트
npm run deploy:phone
curl -s https://api.bumpinto.world/auth/config      # {"ok":true,"enabled":false,...}
```

## 7. 계정 기능 켜기

`wrangler.jsonc` 의 `vars` 를 고치고 다시 `npm run deploy:phone`:

| 변수 | 값 | 뜻 |
|---|---|---|
| `ACCOUNTS_ENABLED` | `"1"` | /auth/* 동작, 웹소켓이 세션을 읽음, 칭호용 기록 시작 |
| `ACCOUNT_MIGRATE` | `"dry"` → 확인 후 `"on"` | dry = 옮길 목록만 D1 `migrations_log` 에 기록, on = 실제 이전 |
| `STATS_ENABLED` | `"1"` (기본) | 이동·접속일·사진 기록 (보상 없음) |
| `ECONOMY_ENABLED` | `"0"` 유지 → 9단계 | 켜면 웰컴 20,000 / 베타 10,000 지급과 잔액 표시, `/econ/*` 동작 |
| `ECON_FEATURES` | (없음) → 9단계 | `move,quests,shop,board` 중 켤 것 |
| `ECON_PAID` | `"0"` (기본, 무료 오픈) | 9단계 참고. 결제·충전이 아님 — 교통 차감 여부만(상점은 미리보기 전용이라 이 값과 무관) |
| `ECONOMY_OPEN_AT` | 예 `"2026-12-01T00:00:00+09:00"` | 베타 감사 지급 기준일(오픈 후 30일까지). 비우면 베타 지급 없음 |
| `ACCOUNT_MAX_DEVICES` | (없음 = 5) | 계정당 PC 수 |
| `SESSION_COOKIE_SAMESITE` / `SESSION_COOKIE_DOMAIN` | (없음) | 기본 `Lax`/호스트 전용. 바꿀 일이 없어야 정상 |

dry 결과 확인:

```bash
npx wrangler d1 execute bumpinto-accounts --remote --command "SELECT account_id, device_id, mode, item, qty, detail, datetime(at/1000,'unixepoch','+9 hours') AS kst FROM migrations_log ORDER BY id DESC LIMIT 50"
```

끄기(롤백): `ACCOUNTS_ENABLED` 를 `"0"` 으로 바꿔 배포. 게임은 다시 deviceId 만 쓴다. 이미 옮긴 선물·사진은 대표 캐릭터에 남는다.

## 8. 클라이언트

```bash
VITE_ACCOUNT_API_URL=https://api.bumpinto.world npm run build
```

- 로그인 칩은 `?accounts=1` 로 연 브라우저에만 보인다(기억됨, `?accounts=0` 으로 끔). 모두에게 켤 때만 `VITE_ACCOUNTS=1`.
- `VITE_ACCOUNT_API_URL` 이 있고 계정 기능이 켜진 브라우저는 웹소켓도 같은 도메인(`wss://api.bumpinto.world/ws`)으로 붙는다.
  나머지 사람은 지금처럼 `VITE_WS_URL`/workers.dev 로 붙는다.
- `VITE_GOOGLE_CLIENT_ID` 는 기본값이 위 ID 라 따로 안 넣어도 된다 (`.env.example` 참고).

## 9. 서버 경제 켜기 (feat/economy-server)

**먼저 마이그레이션 0002 를 원격에 적용한 뒤** 배포한다 (도훈님이 직접. 이미 적용된 0001 은 고치지 않는다 — 새 파일만 추가):

```bash
cd server/phone
npx wrangler d1 migrations list bumpinto-accounts --remote     # 0002_economy.sql 이 '적용 안 됨' 인지 확인
npx wrangler d1 migrations apply bumpinto-accounts --remote    # 0002 만 적용됨
```

그 다음 `vars` 를 한 단계씩 바꿔 배포하고, 하루 정도 원장을 보고 다음 단계로 간다:

| 단계 | 바꿀 값 | 열리는 것 |
|---|---|---|
| 1 | `ECONOMY_ENABLED="1"` (`ECON_FEATURES` 비움) | 로그인 + 원장 + 잔액, 웰컴·베타 지급, 0원 탑승 기록 |
| 2 | `ECON_FEATURES="move"` | 서버가 웹소켓 위치로 검증한 이동 보상 (172 bum/분, 하루 60분 · 주 300분 상한). 하루 1번 지급: 60분(또는 주 남은 분)에 닿으면 바로, 못 닿은 날은 다음 접속 때(최근 7일) |
| 3 | `ECON_FEATURES="move,quests"` | 일/주/월 할 일 + 업적 (bum 상한 없음 — 할 일은 기간당 1회, 업적은 계정당 1회가 상한. 기획 최대치 일 약 6,000 · 주 22,000 · 월 40,000) |
| 4 | `ECON_FEATURES="move,quests,shop"` | 상점 **미리보기**: 첫 자전거 · CR·1 로드바이크 · 스쿠터 · 경차를 기획 가격으로 보여 주기만(`available:false` · `comingSoon:true` · '준비중'). 구매는 서버가 항상 거절(`coming_soon`, 게스트 포함 · 없는 id 는 `unknown`) — 원장·보유 기록 없음 |
| 5 | `ECON_FEATURES="move,quests,shop,board"` | 게시판 글 보상 하루 1번 1,000(그날 처음 조건을 통과한 글 하나 — 40자 이상, 가입 24시간 뒤부터, 같은 글 반복 금지. 그 뒤 글은 보상 없음. 지우면 회수) |
| 나중 | `ECON_PAID="1"` | 교통 실제 차감(상점은 여전히 미리보기 — 다시 열려면 코드 `SHOP_PREVIEW_ONLY` 변경 + 리뷰). **법무 검토 전에는 켜지 않는다.** 현금 충전·결제는 이 브랜치에 없음 |

- 탑승 기록 도배 방지(기획에 없는 값): `RIDE_MIN_GAP_SEC`(기본 30) · `RIDE_DAILY_COUNTED`(기본 40). 넘은 탑승은 막지 않고 퀘스트·카르마에만 안 셈.
- **무료 오픈(`ECON_PAID` 꺼짐, 기본)**: 받는 쪽(이동·할 일·업적·게시판)은 원장에 실제로 쌓인다. 교통 요금은 0원이지만
  `econ_events` 에 정가(`listAmount`)와 함께 기록된다 — 나중에 유료로 바꿀 때 실제 사용량을 본다. 유료 경로(잔액 부족 `insufficient_balance` ·
  택시 홀드/정산/취소)는 코드와 테스트에 그대로 있고 스위치 하나로 켜진다.
- **상점은 무료 오픈 대상이 아니다(도훈 결정 2026-11-05)**: 아무것도 공짜로 주지 않는다. 미리보기 전용(`SHOP_PREVIEW_ONLY`, env 로 못 바꿈) —
  무료·유료 모드 모두 `POST /econ/shop/buy` 거절(409 `coming_soon`, 게스트 포함), 원장·`account_vehicles`·`econ_events` 에 아무것도 안 씀.
  `mode.shopPaid` 는 계약(EconMode)에만 남고(=`ECON_PAID`) 상점은 쓰지 않는다. 이미 받은 선물 탈것(CR·1/RR 선물 · 예전 `account_vehicles` 행)은 그대로 보이고 탈 수 있다.
- **게스트(구글 미연동)는 서버 보상이 없다.** 나중에 연동해도 그 전 게스트 활동은 소급 지급하지 않는다. 클라이언트는 `getSession().isGuest` 로 안내한다.
- 금액·상한은 모두 `src/account/econ.js` 한 파일 (`ECON_CONFIG_VERSION`). **초기 튜닝값**이다 — 바꾸면 버전을 올린다.
- 끄기(롤백): `ECON_FEATURES` 에서 빼거나 `ECONOMY_ENABLED="0"`. 원장은 남고, 다시 켜면 이어서 쌓인다(멱등키라 이중 지급 없음).
- 원장 확인:

```bash
npx wrangler d1 execute bumpinto-accounts --remote --command "SELECT reason, COUNT(*) n, SUM(amount) bum FROM ledger WHERE created_at > (strftime('%s','now')-86400)*1000 GROUP BY reason"
```

- **`DEV_LOGIN` 은 운영 vars 에 절대 넣지 않는다.** (localhost 요청에서만 동작하지만 그래도 넣지 않는다)

### ui-v2 경제 화면을 서버에 붙이기 (#29 와 합친 뒤)

`src/ui-v2/econ/index.js` 의 import 한 줄만 바꾼다:

```js
import { createServerClient as createClient } from './serverClient.js';
```

`?accounts=1` 이 아닌 브라우저는 서버 클라이언트도 네트워크 없이 "게스트 · 무료" 로만 동작한다(지금 정자와 같음).
`?accounts=1` 이면 구글 로그인 버튼(`registerGoogleSignIn`)과 탑승 결제(`src/ride/fare.js` provider)를 서버로 연결한다.

## 로컬 개발

```bash
cp server/phone/.dev.vars.example server/phone/.dev.vars    # SESSION_SECRET 채우기 (경제·DEV_LOGIN 기본 켜짐)
(cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --local)
npm run phone                                               # 127.0.0.1:8789
npm run dev
# 브라우저는 반드시 127.0.0.1 로 연다 (localhost 와 127.0.0.1 은 다른 사이트라 쿠키가 안 실림):
#   http://127.0.0.1:5173/?accounts=1&sms=local&ws=ws://127.0.0.1:8789/ws
# ui-v2 경제 화면까지:  http://127.0.0.1:5173/?ui=v2&accounts=1&sms=local&ws=ws://127.0.0.1:8789/ws&acctapi=http://127.0.0.1:8789
```

- 구글 로그인 창에는 `DEV_LOGIN=1` 일 때 **"개발용 로그인"** 버튼이 같이 뜬다(구글 없이 로컬 계정으로 로그인 — `POST /auth/dev`, localhost/127.0.0.1 전용).
  진짜 구글 로그인은 GIS 가 `127.0.0.1` 원본을 받지 않을 수 있어 `http://localhost:5173` 에서 시험한다(구글 콘솔 원본에 `http://localhost:5173` 추가).
- curl 로 확인:

```bash
curl -s -c /tmp/jar -X POST http://127.0.0.1:8789/auth/dev -H 'Content-Type: application/json' -d '{"deviceId":"dev-1"}'
curl -s -b /tmp/jar http://127.0.0.1:8789/econ/state
curl -s -b /tmp/jar -X POST http://127.0.0.1:8789/econ/fare -H 'Content-Type: application/json' -d '{"code":"bus.city","rideId":"r-1"}'
```

로컬 `wrangler dev` 는 `http` 라 `Secure` 쿠키를 브라우저가 127.0.0.1 에서도 받아 준다(Chrome 은 localhost/127.0.0.1 을 안전한 출처로 본다).

## 테스트

```bash
npm run accounts:test     # 토큰 검증(가짜 JWKS)·세션·연결/이전 규칙·원장 멱등·이동 기록
npm run economy:test      # 원장 상한·이동 검증·요금(무료/유료)·택시 홀드·상점 미리보기(구매 거절)·게시판 도배 방지·퀘스트/업적·/econ 라우트 + ui-v2 서버 클라이언트
```
