// [economy] 경제 설정 — 금액·상한·요금·상점·퀘스트·업적을 이 파일 한 곳에 둔다.
//   ⚠️ 여기 숫자는 전부 "초기 튜닝값"이다. 실측 데이터가 아니다.
//      근거: /workspace/bw-economy-v1/plan.html (v1 기획안, 2026-11-04) 의 가정값 · 2026 실제 교통요금.
//      베타에서 로그를 보고 바꾼다. 바꿀 때는 ECON_CONFIG_VERSION 을 올린다(원장 행마다 price_table_version 으로 남음).
//   금액은 클라이언트가 정하지 않는다. 클라이언트에 보내는 표는 표시용이다.
// 이 파일은 cloudflare:workers 를 가져오지 않는다 — node 단위 테스트가 그대로 불러 쓴다.

// ── 1단계 웰컴 지급 (#21 에서 정한 값, 그대로) ──
export const PRICE_TABLE_VERSION = 1; // 웰컴·베타 지급 행의 버전 (0001 마이그레이션 price_table 시드와 같음)
export const WELCOME_FREE_BUM = 20000;
export const BETA_FREE_BUM = 10000;
export const BETA_WINDOW_DAYS = 30;
export const LEDGER_KINDS = new Set(["paid", "free"]);

// ── 2단계 이후 (이 파일에서 새로 정함) ──
export const ECON_CONFIG_VERSION = 3; // 이동·퀘스트·업적·요금·상점·게시판 행의 price_table_version

/**
 * 이동 보상: "인정 이동 시간" 방식(v1 §6). 서버가 웹소켓 위치로 잰 인정 초만 센다.
 *   지급 = floor(인정분 × 배율) × perMinute, 하루·주 인정분 상한.
 *   인정 조건(stats.js MoveStats): 수단별 속도 상한, 순간이동 버림, 5초 넘는 공백 버림, 80ms 보다 촘촘한 표본 버림,
 *   60초 창의 순변위 30m 미만(제자리 맴돌기) 버림.
 */
/** 분당 금액 표 (plan §6 "1분 = 172 bum (2026 최저시급 10,320 ÷ 60). 2027-01-01에 178로" · Figma 13:2 Note 03). KST 날짜로 고른다. */
export const MOVE_RATES = Object.freeze([
  Object.freeze({ from: "2026-01-01", perMinute: 172 }),
  Object.freeze({ from: "2027-01-01", perMinute: 178 }),
]);
/** 그 KST 날짜(YYYY-MM-DD)의 분당 금액 */
export function movePerMinute(date) {
  let r = MOVE_RATES[0].perMinute;
  for (const x of MOVE_RATES) if (String(date) >= x.from) r = x.perMinute;
  return r;
}
export const MOVE = Object.freeze({
  perMinute: 172, // 2026 값. 날짜별 금액은 movePerMinute(date) 로 읽는다
  dailyMinutes: 60,
  weeklyMinutes: 300,
  // 수단별 배율 (0 = 보상 없음, 통계만)
  multiplier: Object.freeze({ walk: 1, bike: 1, roadbike: 1, superbike: 0.5, truck: 0.5, bus: 0, taxi: 0 }),
  windowSec: 60,
  windowMinNetM: 30,
  minSampleMs: 80,
  settleStepMinutes: 10, // 오늘 몫은 10분 단위로 원장에 넣고(행 수 절약), 지난 날짜는 남은 분까지 모두 정산
});

/**
 * 하루·주 상한 (bum). 기획(plan §5·§6)이 정한 상한은 이동의 "인정 분" 상한뿐이다(하루 60분 · 주 300분) — 이동은 분 단위로 막는다.
 *   퀘스트·업적은 정의 자체가 상한이다(퀘스트마다 기간당 1회, 업적은 계정당 1회). 기획 최대치: 일일 약 5,000~6,000 · 주간 22,000 · 월간 40,000.
 *   그래서 v3 에서 근거 없는 퀘스트·업적·총합 bum 상한(12,000/60,000/50,000 등)을 없앴다(주간·월간 보상이 같은 날 몰리면 잘려 나가던 문제).
 *   게시판만 bum 상한을 둔다 = 하루 글 수 × 글당 보상.
 *   move 값은 표시용(2026 기준 10,320 / 51,600).
 */
export const CAPS = Object.freeze({
  daily: Object.freeze({ move: MOVE.perMinute * MOVE.dailyMinutes, board: 3 * 1000 }),
  weekly: Object.freeze({ move: MOVE.perMinute * MOVE.weeklyMinutes }),
});
/** 상한 계산에 들어가는 원장 reason. welcome/beta/fare/shop/refund/clawback 은 상한과 무관. */
export const CAP_REASONS = Object.freeze(["move", "quest", "ach", "board"]);

const T = (ko, en) => Object.freeze({ ko, en });

/**
 * 퀘스트 — id·제목·보상·카르마는 퍼블리셔 mock(src/ui-v2/econ/mockClient.js QUEST_DEFS)과 같게 맞춤.
 *   metric: login(오늘 접속) · move_min(인정분, modes 로 거름) · ride(교통 이용 횟수, modes) · ride_modes(서로 다른 교통수단 수)
 *           · login_days(기간 중 접속일) · daily_claims(기간 중 받은 일일 퀘스트 수, 보너스 제외) · weekly_claims
 *           · daily_all(오늘 배정된 일일 퀘스트를 모두 받음, target = slots) · photo_spots(기간 중 사진 찍은 서로 다른 100m 칸 수)
 *   unit: UI Progress.unit (min|count|day|kind|place)
 *   일일은 fixed + pool 에서 계정·날짜 해시로 slots 개를 그날 처음 볼 때 고정 배정(quest_assignments). 주간·월간은 전부.
 *   완료되면 서버가 자동 지급(autoClaim). claim 엔드포인트는 예비 경로.
 */
export const QUESTS = Object.freeze({
  daily: Object.freeze({
    slots: 3,
    fixed: ["D-LOGIN"],
    pool: [
      { id: "D-LOGIN", metric: "login", target: 1, unit: "count", reward: 500, karma: ["streak", 1], title: T("오늘 첫 접속", "First visit today") },
      { id: "D-WALK10", metric: "move_min", modes: ["walk"], target: 10, unit: "min", reward: 1000, karma: ["health", 10], title: T("걷기 인정 10분", "Walk 10 counted minutes") },
      { id: "D-WALK20", metric: "move_min", modes: ["walk"], target: 20, unit: "min", reward: 1500, karma: ["health", 20], title: T("걷기 인정 20분", "Walk 20 counted minutes") },
      { id: "D-SUB1", metric: "ride", modes: ["subway"], target: 1, unit: "count", reward: 800, karma: ["transit", 5], title: T("지하철 1회 타기", "Ride the subway once") },
      { id: "D-BUS1", metric: "ride", modes: ["bus"], target: 1, unit: "count", reward: 800, karma: ["transit", 5], title: T("버스 1회 타기", "Ride a bus once") },
      { id: "D-RIDE10", metric: "move_min", modes: ["bike", "roadbike"], target: 10, unit: "min", reward: 1000, karma: ["health", 10], title: T("자전거 인정 10분", "Cycle 10 counted minutes") },
      // 기획 풀의 D-PLACE(오늘의 장소 30m, 1,500 · 탐험 2) · D-NEIGHBOR(다른 계정 10m 30초, 800 · 이웃 2) · D-PHOTO(지정 장소 사진, 1,000 · 탐험 2)는
      // 서버 판정 데이터(오늘의 장소 목록 · 계정 간 근접 · 셔터 토큰)가 아직 없어 넣지 않았다. 판정이 생기면 이 풀에 추가.
    ],
    bonus: { id: "D-ALL3", metric: "daily_all", target: 3, unit: "count", reward: 1000, karma: ["streak", 2], title: T("보너스 · 3개 모두 완료", "Bonus · all 3 done") },
  }),
  weekly: Object.freeze([
    { id: "W-WALK", metric: "move_min", modes: ["walk"], target: 120, unit: "min", reward: 6000, karma: ["health", 10], title: T("주간 걷기 120분", "Walk 120 min this week") },
    { id: "W-DAYS", metric: "login_days", target: 5, unit: "day", reward: 4000, karma: ["streak", 5], title: T("5일 출석", "Visit 5 days") },
    { id: "W-DAILY", metric: "daily_claims", target: 15, unit: "count", reward: 5000, karma: ["streak", 5], title: T("일일 할 일 15개", "15 daily quests") },
    { id: "W-TRANSIT", metric: "ride_modes", target: 3, unit: "kind", reward: 3000, karma: ["transit", 10], title: T("교통수단 3종 타기", "Ride 3 kinds of transit") },
    // mock 의 '장소 5곳 방문'은 서버가 검증할 방문 데이터가 없어, 서버가 기록하는 사진 위치(100m 칸)로 판정한다.
    { id: "W-PLACES", metric: "photo_spots", target: 5, unit: "place", reward: 4000, karma: ["explore", 5], title: T("다른 장소 5곳에서 사진 찍기", "Take photos at 5 places") },
  ]),
  monthly: Object.freeze([
    { id: "M-WALK", metric: "move_min", modes: ["walk"], target: 600, unit: "min", reward: 15000, karma: ["health", 30], title: T("월간 걷기 600분", "Walk 600 min this month") },
    { id: "M-DAYS", metric: "login_days", target: 20, unit: "day", reward: 15000, karma: ["streak", 20], title: T("20일 출석", "Visit 20 days") },
    { id: "M-WEEKLY", metric: "weekly_claims", target: 10, unit: "count", reward: 10000, karma: ["streak", 10], title: T("주간 할 일 10개", "10 weekly quests") },
  ]),
});
export const PHOTO_SPOT_M = 100;

/**
 * 카르마 5축 (v1 §4). 원시 기록에서 다시 계산하는 파생값 + 받은 퀘스트의 카르마.
 *   건강은 인정 이동 분에서만 쌓는다 — plan §5 "* 건강 카르마는 인정 이동 시간에서 자동으로 쌓임(퀘스트 보상과 중복이 아님)".
 *   이웃은 기획상 "다른 계정과 함께"인데 판정이 아직 없어 0 부터 시작(퀘스트 카르마만).
 */
export const KARMA_AXES = Object.freeze(["health", "explore", "transit", "neighbor", "streak"]);
export const KARMA_RULES = Object.freeze({
  health: { per: "move_min", points: 1 }, // 인정 이동 1분(걷기·자전거) = 1
  explore: { per: "photo", points: 1 }, // 사진 1장 = 1 (mock 과 같음)
  transit: { per: "ride", points: 5 }, // 교통 이용 1회 = 5
  neighbor: { per: "together", points: 0 }, // 계정 간 근접 판정 전까지 0
  streak: { per: "login_day", points: 1 }, // 접속일 1일 = 1
});
/** 칭호 사다리 — mock LADDERS 와 같음. streak 축은 연속 접속 일수로 판정. */
export const LADDERS = Object.freeze([
  ["health", [[T("산책러", "Stroller"), 100], [T("정자 워커", "Jeongja Walker"), 1000], [T("탄천 마라토너", "Tancheon Marathoner"), 5000]]],
  ["explore", [[T("골목 탐험가", "Alley Explorer"), 20], [T("정자 지도장인", "Jeongja Cartographer"), 200]]],
  ["transit", [[T("환승의 달인", "Transfer Master"), 100], [T("교통카드 VIP", "Transit Card VIP"), 1000]]],
  ["neighbor", [[T("반가운 이웃", "Friendly Neighbor"), 30], [T("동네 반장", "Block Captain"), 300]]],
  ["streak", [[T("7일 연속", "7-day streak"), 7], [T("30일 연속", "30-day streak"), 30], [T("100일 연속", "100-day streak"), 100]]],
]);

/**
 * 업적: 누적 지표가 문턱을 넘으면 서버가 1회 보너스를 자동 지급(원장 reason=ach, 상한 적용).
 *   metric: walk_km_total(걷기 인정 이동의 서버 측정 거리 km) · streak_days(연속 접속) · ride_total · photo_total · board_total
 */
export const ACHIEVEMENTS = Object.freeze([
  { id: "ACH-WALK100", metric: "walk_km_total", threshold: 100, unit: "count", reward: 5000, title: T("현실 환산 100 km 걸음", "Walk 100 real km"), rule: "walk_km_total ≥ 100" },
  { id: "ACH-STREAK30", metric: "streak_days", threshold: 30, unit: "day", reward: 10000, title: T("30일 연속 출석", "30-day streak"), rule: "streak_days ≥ 30" },
  // v2 에 있던 ACH-RIDE10 · ACH-PHOTO20 · ACH-BOARD5 는 기획에 없는 값이라 v3 에서 뺐다(plan §4 · Figma 13:2 Note 06 은 위 두 개만).
]);

/**
 * 교통 요금 (v1 §9-2, 2026 경기·수도권 카드요금 기준 초기값) — 코드·금액은 mock FARE_TABLE 과 같음.
 *   유료 모드(ECON_PAID=1)에서만 실제로 빠진다. 무료 모드에서는 0원 + 이용 기록(econ_events kind=ride)만.
 *   클라이언트 옛 코드 bus.base → bus.city
 */
export const FARES = Object.freeze({
  "bus.city": { mode: "bus", amount: 1650, label: T("시내버스", "City bus") },
  "bus.village": { mode: "bus", amount: 1550, label: T("마을버스", "Village bus") },
  "bus.seat": { mode: "bus", amount: 2650, label: T("좌석버스", "Express seat bus") },
  "bus.wide": { mode: "bus", amount: 3200, label: T("광역버스", "Metropolitan bus") },
  "bus.circular": { mode: "bus", amount: 3450, label: T("순환버스", "Circular bus") },
  "bus.long": { mode: "bus", amount: 3200, label: T("시외·공항버스", "Intercity / airport bus") },
  "subway.base": { mode: "subway", amount: 1550, label: T("지하철 기본요금", "Subway base fare") },
  "taxi.drive": { mode: "taxi", meter: true, factor: 1, label: T("일반 주행", "Normal drive") },
  "taxi.fast": { mode: "taxi", meter: true, factor: 1, label: T("빨리감기", "Fast-forward") },
  "taxi.instant": { mode: "taxi", meter: true, factor: 1.5, label: T("즉시 도착", "Instant arrival") },
});
export const FARE_ALIASES = Object.freeze({ "bus.base": "bus.city", "bus.express": "bus.wide", "taxi.meter": "taxi.drive" });
export const TAXI = Object.freeze({
  base: 4800, baseM: 1600, stepM: 131, stepFare: 100,
  nightFactor: 1.3, nightFromHour: 23, nightToHour: 4, // KST, 서버 시계로 판정
  maxM: 30000, // 클라이언트가 보낸 거리 상한
  holdTtlSec: 3 * 3600, // 홀드 만료(정산·취소 없으면 잔액에서 다시 풀림)
});
/** 교통 이용 기록 도배 방지: 게임 진행은 막지 않고, 너무 잦거나 하루 상한을 넘은 이용은 퀘스트·카르마에 안 셈(qty=0). */
export const RIDE_LIMITS = Object.freeze({ minGapSec: 30, dailyCounted: 40 });

/**
 * 탈것 상점 — id·이름·가격은 mock SHOP_ITEMS 와 같음(가격 = 현실가 × 0.5 초기값).
 *   giftId 가 있으면 산 뒤 게임에서 바로 탈 수 있는 기존 모델(src/gifts/catalog.js). 없으면 available:false (구매 불가, 목록엔 보임).
 *   산 탈것은 계정 귀속(giftable:false).
 */
export const SHOP = Object.freeze([
  { id: "bike", name: T("첫 자전거", "First bicycle"), price: 160000, realPrice: 320000, days: 18, giftId: null, available: false },
  { id: "roadbike", name: T("CR·1 로드바이크", "CR·1 road bike"), price: 1000000, realPrice: 2000000, days: 113, giftId: "roadbike-cr1", available: true },
  { id: "scooter", name: T("스쿠터(125cc급)", "Scooter (125cc)"), price: 2500000, realPrice: 4999000, days: 280, giftId: null, available: false },
  { id: "car", name: T("경차", "City car"), price: 7450000, realPrice: 14900000, days: 836, giftId: null, available: false },
]);
/** 표시용 가정값(mock RULES 와 같음) — 상점 목표 '며칠 남음' 계산에만 씀. 실측 아님. */
export const DISPLAY = Object.freeze({ typicalDailyNet: 8916, avgDailyIncome: 11202, avgDailyTransit: 2286 });

/** 게시판 보상 (5단계). 도배 방지: 최소 글자 수, 연속 작성 간격, 하루 개수, 가입 후 대기, 같은 글 반복 금지, 삭제·짧게 수정 시 회수. */
/**   ⚠️ 기획 v1(plan §5)은 게시판 보상을 0 으로 두고 6단계에서 다시 보자고 했다. 1,000 은 PLAN.md 5단계 + 도훈 승인(PR #30)으로 정한 임시값.
 *      리뷰(bw-economy-review §3) 제안대로 하루 게시판 합계는 8,400 아래(지금 3 × 1,000 = 3,000). */
export const BOARD = Object.freeze({
  reward: 1000,
  minChars: 40, // 공백 제거·같은 글자 3번 이상 반복 압축 후 글자 수
  cooldownSec: 600,
  dailyPosts: 3,
  accountMinAgeHours: 24,
});

/** 웰컴 화면 문구 (UI WelcomeState.grants) */
export const WELCOME_TEXT = Object.freeze({
  welcome: { title: T("웰컴 지급", "Welcome grant"), sub: T("계정당 1회", "Once per account") },
  beta: { title: T("베타 감사 지급", "Beta thank-you"), sub: T("오픈 전 기기를 오픈 30일 안에 연결", "Pre-launch device linked within 30 days") },
});
