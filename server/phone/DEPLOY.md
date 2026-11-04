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
| `ECONOMY_ENABLED` | `"0"` 유지 | 켜면 웰컴 20,000 / 베타 10,000 지급과 잔액 표시 |
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

## 로컬 개발

```bash
cp server/phone/.dev.vars.example server/phone/.dev.vars    # SESSION_SECRET 채우기, ACCOUNTS_ENABLED=1
(cd server/phone && npx wrangler d1 migrations apply bumpinto-accounts --local)
npm run phone                                               # 127.0.0.1:8789
npm run dev
# 브라우저는 반드시 127.0.0.1 로 연다 (localhost 와 127.0.0.1 은 다른 사이트라 쿠키가 안 실림):
#   http://127.0.0.1:5173/?accounts=1&sms=local&ws=ws://127.0.0.1:8789/ws
```

로컬 `wrangler dev` 는 `http` 라 `Secure` 쿠키를 브라우저가 127.0.0.1 에서도 받아 준다(Chrome 은 localhost/127.0.0.1 을 안전한 출처로 본다).

## 테스트

```bash
npm run accounts:test     # 토큰 검증(가짜 JWKS)·세션·연결/이전 규칙·원장 멱등·이동 기록
```
