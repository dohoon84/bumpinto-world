# 로컬 통합 시험 (PC + 아이폰 · 게스트 / 계정 모드)

브랜치 `test/integration-all` = `develop` + #28(ui-renewal) + #29(econ-ui-v2) + #30(economy-server) + #25(mobile) 머지.
시험 전용입니다. develop/main 에 머지하지 않습니다. 배포·원격 D1 은 건드리지 않습니다(전부 `--local`).

## 1. 받기 · 설치 (한 번)

```bash
git fetch origin
git checkout test/integration-all        # 처음이면: git checkout -b test/integration-all origin/test/integration-all
git pull --ff-only
npm install                              # 또는 npm ci
```

## 2. `.dev.vars` (한 번)

`npm run dev:all` 을 처음 돌리면 `server/phone/.dev.vars.example` 에서 `server/phone/.dev.vars` 를 만들어 줍니다.
`SESSION_SECRET` 은 새로 생성되며 화면에 찍지 않습니다. 이 파일은 git 에 올라가지 않습니다.
이미 파일이 있으면 아래 값이 `1` 인지 확인하세요(아니면 dev:all 이 경고합니다).

```
ACCOUNTS_ENABLED=1
ECONOMY_ENABLED=1
ECON_FEATURES=move,quests,shop,board
ECON_PAID=0                 # 무료 오픈(기록만). 1 = 유료 차감 시험
DEV_LOGIN=1                 # 로컬·사설 LAN 에서만 '개발용 로그인' 허용
SESSION_COOKIE_INSECURE=1   # 아이폰 http 에서 쿠키가 저장되게 Secure 를 뺌(로컬 전용)
SESSION_SECRET=...          # 자동 생성
```

`DEV_LOGIN`·`SESSION_COOKIE_INSECURE` 는 `.dev.vars` 에만 있습니다. `wrangler.jsonc`(운영)에는 없습니다.
개발용 로그인은 서버가 한 번 더 막습니다: 요청 호스트와 Origin 이 둘 다 localhost/127.x/10.x/172.16–31.x/192.168.x 일 때만 됩니다. 공개 터널 주소에서는 403 입니다.

## 3. 실행 (한 줄)

```bash
npm run dev:all              # 로컬 D1 마이그레이션(0001·0002) → wrangler dev :8789 → Vite 0.0.0.0:5173
npm run dev:all:reset        # 로컬 D1·DO·R2 를 지우고 처음부터(웰컴 20,000 다시 받기)
npm run dev:all -- --tunnel  # + cloudflared https 터널(아이폰에서 진짜 구글 로그인, 선택)
```

페이지와 API 가 같은 주소입니다(Vite 가 `/_phone/*` 을 로컬 워커로 넘김, 웹소켓 포함). 그래서 쿠키가 localhost · LAN IP · 터널 어디서나 실립니다.
준비되면 터미널에 주소가 찍힙니다. 끄기는 Ctrl+C.

## 4. 주소

맥 LAN IP 가 `172.30.1.24` 일 때(바뀌면 터미널에 찍힌 값). 아이폰은 맥과 **같은 와이파이**.

| 어디 | 모드 | 주소 | 로그인 |
|---|---|---|---|
| PC | 게스트 | http://localhost:5173/?ui=v2&noticePopup=0 (실시간 버스: `&bus=realtime`) | 시작화면 **게스트로 계속** |
| PC | 계정(개발용) | 같은 주소 | **Google 계정으로 로그인** → 창의 **개발용 로그인 (로컬)** |
| PC | 계정(진짜 구글) | 같은 주소 | 같은 창의 구글 버튼 (아래 7번 원본 추가 필요) |
| 아이폰 | 게스트 (경제 UI) | http://172.30.1.24:5173/?mobile=1&ui=v2&noticePopup=0 | 그냥 입장 → 프로필 칩 '게스트' |
| 아이폰 | 계정(개발용, 경제 UI) | 같은 주소 | 입장 → 메뉴(☰) → bum 묶음 **구글 계정 연동하고 bum 받기** → **개발용 로그인 (로컬)** |
| 아이폰 | 경제 UI 없이 | http://172.30.1.24:5173/?mobile=1&noticePopup=0 | 메뉴 → '함께' 의 **계정** 타일 → 개발용 로그인 |
| 아이폰 | 계정(진짜 구글, 선택) | `--tunnel` 이 찍어 준 `https://….trycloudflare.com/?mobile=1&ui=v2&noticePopup=0` | 메뉴 → 구글 계정 연동 → 구글 |

모바일 경제 UI(`feat/econ-ui-mobile`)는 PC 와 같은 `?ui=v2` 플래그일 때만 켜집니다.

- 서버 상태 확인: `http://localhost:5173/_phone/auth/config` → `"devLogin":true`, `"economy":true`.
- 아이폰에서 안 열리면: 맥 방화벽(시스템 설정 → 네트워크 → 방화벽)에서 node 수신 허용, 같은 와이파이인지 확인.
- 진짜 구글 로그인은 http LAN 주소(172.x)에서 안 됩니다(구글이 http 사설 IP 원본을 받지 않음). 아이폰은 개발용 로그인 또는 터널.

## 5. 초기화

- **로컬 서버(D1) 전체**: `npm run dev:all:reset` — 계정·원장·퀘스트가 사라집니다.
- **로그아웃**: 계정 창의 **로그아웃**(PC: 오른쪽 위 계정 칩 / 아이폰: 메뉴 → 계정).
- **게스트 상태(이 기기 저장분)**: PC 는 시크릿 창이 제일 쉽습니다. 아니면 개발자도구 → Application → Storage → **Clear site data**.
  아이폰 Chrome 은 시크릿 탭, 또는 설정 → 개인정보 보호 → 인터넷 사용 기록 삭제(쿠키·사이트 데이터).
  `localhost` 와 `172.30.1.24` 는 서로 다른 사이트라 저장분·쿠키가 따로입니다.

## 6. 확인 목록

PC (계정 기능 켜짐 → econ 은 서버 클라이언트, mock 아님)
- [ ] 게스트: 잔액 칩 자리에 **'구글 계정 연동하고 bum 받기'**, 잔액 0. 버스를 타도 적립 없음.
- [ ] 개발용 로그인: **웰컴 20,000 토스트**, 잔액 칩 20,500(웰컴 + 오늘 첫 접속 500).
  개발용 로그인은 늘 같은 계정(`dev:local`)입니다. 두 번째 기기·브라우저(아이폰, 시크릿 창)로 들어가면 대표 캐릭터를 맞추려고 **한 번 새로고침되어 시작 화면으로 돌아옵니다** — 로그인은 유지돼 있으니 **게스트로 계속**을 누르면 계정 잔액으로 들어갑니다(웰컴은 계정당 1번). 웰컴을 다시 보려면 `npm run dev:all:reset`.
- [ ] 할 일 칩/이동 칩 → **할 일 시트**(매일·주간·월간), 오늘 첫 접속 완료.
- [ ] 버스 탑승(무료 오픈): 0원 결제, 서버에 정가로 기록(`econ_events.listed_amount` = 1,650, `charged_amount` = 0). 잔액 그대로.
  지갑 내역(`/_phone/econ/ledger`)에 0원 요금 줄이 `rideId` · 정가(`listAmount`)와 함께 나옵니다.
- [ ] **탈것 상점 = 미리보기 전용**: 첫 자전거 · CR·1 로드바이크 · 스쿠터 · 경차 4개가 기획 가격과 **준비중**으로만 보이고, 구매 버튼은 잠김. 서버도 구매를 거절(`coming_soon`, 게스트 포함) — 아무것도 공짜로 받지 않습니다. 이미 받은 선물 탈것은 그대로.
- [ ] 새로고침해도 로그인 유지.

아이폰 (`?mobile=1&ui=v2`)
- [ ] 게스트: 프로필 칩 '게스트', 2행에 '구글 계정 연동하고 bum 받기' 칩. 메뉴(☰) 맨 위에 **bum** 묶음(할 일 · 교통카드 · 카르마·업적 · 탈것 상점 · 계정 연동).
- [ ] 메뉴 → 구글 계정 연동 → **개발용 로그인 (로컬)** → 프로필 칩에 잔액(20,500), 보상 토스트. 새로고침해도 유지(쿠키).
- [ ] 2행 할 일 칩 → 할 일 시트. 프로필 칩 잔액 → 폰 '교통카드' 앱(지갑). 탈것 상점 → 4개 준비중.
- [ ] `?ui=v2` 없이(`?mobile=1`)도 메뉴 '함께' 의 **계정** 타일로 로그인·잔액은 확인됩니다.
- [ ] **버스 모드 = 주소(host)로 정해짐** (feat/mobile b560f24, PC·모바일 같음)
  | 주소 | 기본 | 바꾸기 |
  |---|---|---|
  | 로컬·LAN (`localhost`, `172.30.1.24` 같은 사설 IP, dev) | **시뮬** | 실시간을 보려면 `&bus=realtime` |
  | 공개 주소(배포, 터널 `….trycloudflare.com`) | 실시간 | `&bus=sim` 시뮬 |
  `?bus=` 가 있으면 항상 그게 우선입니다. 실시간 버스도 탈 수 있습니다(실시간 탑승).
  기본 프록시는 **배포된 `jeongja-bus-proxy`** 라서 실시간 데이터에 **로컬 키가 필요 없습니다**(인터넷만). 프록시가 실패하면 시뮬로 바뀝니다.
  `&proxy=local` 은 로컬 8788 프록시(`server/bus-proxy` 따로 실행 + 공공데이터 키)일 때만.

자동 확인(선택, dev:all 이 켜진 상태에서):
```bash
MBASE=http://<맥 LAN IP>:5173 OUT=/tmp/bw-smoke node scripts/smoke-local.mjs   # PC chromium 1440x900 + 아이폰 WebKit 852x393(게스트·계정 × 경제 UI 유무), 스크린샷
# WebKit 이 안 깔리는 리눅스면 MENGINE=chromium (아이폰 UA·터치 흉내)
```

## 7. Google Cloud Console (진짜 구글 로그인을 시험할 때만)

API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID(웹, `/_phone/auth/config` 의 `clientId` 와 같은 것) → **승인된 JavaScript 원본**에 추가:

- `http://localhost:5173`
- `http://localhost` (구글 권장: 포트 붙은 localhost 와 함께 넣기)
- 터널을 쓰면 그때 찍힌 `https://<이름>.trycloudflare.com` — **빠른 터널 주소는 실행할 때마다 바뀝니다**. 매번 바꾸기 싫으면 이름 있는 cloudflared 터널을 쓰세요.

반영까지 몇 분 걸릴 수 있습니다. 리디렉션 URI 는 필요 없습니다(GIS 팝업 · ID 토큰).

## 8. 알아둘 점

- 로컬 워커에는 외부 API 비밀값(지하철 도착 정보 등)이 없어 일부 실시간 정보가 비거나 대체값입니다.
- `ECON_PAID=1` 로 바꾸면 유료 차감(잔액 부족 → 08c 안내)을 시험할 수 있습니다. 바꾼 뒤 dev:all 을 다시 켜세요.
- **기능 브랜치가 갱신되면(한 줄)** — 보통은 제가 올린 걸 `git pull` 만 하면 되고, 직접 갱신하려면: `git checkout test/integration-all && git pull --ff-only && bash scripts/integration-update.sh`
  develop · #28 · #29 · #30 · #25 · (생기면) `feat/econ-ui-mobile` 을 차례로 `--no-ff` 머지하고, 이미 들어간 건 건너뜁니다. 하나만: `bash scripts/integration-update.sh feat/mobile`.
  충돌은 거의 `src/ui-v2/econ/index.js`(계정 켜짐 → `createServerClient` 줄 유지)와 `src/mobile/hud.js`(메뉴 '함께' 의 `account-chip` 타일 유지)입니다. `package.json` 의 scripts 충돌은 양쪽 줄을 모두 남기면 됩니다.
- 모바일 경제 UI(`feat/econ-ui-mobile`)는 이미 머지돼 있고, 퍼블리셔님이 더 올리면 위 명령으로 다시 들어옵니다.
