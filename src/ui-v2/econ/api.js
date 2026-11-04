// [econ] 경제 데이터 인터페이스 (UI ↔ 원장). 이 파일은 "계약"만 정의한다. 구현은 두 개:
//   - mockClient.js   : 이 브랜치의 로컬 예시 데이터 (source: 'mock', isMock: true)
//   - (feat/economy-server) serverClient : 실제 서버 원장 + Google 계정 (source: 'server', isMock: false)
// 선택 지점은 econ/index.js 한 줄뿐이다. UI 코드는 econ/index.js 의 `econ` 만 쓴다.
//
// 규칙
//   1) 모든 메서드는 Promise 를 돌려준다. 결과가 성공/실패로 갈리는 쓰기 메서드는 throw 하지 않고 Result 를 돌려준다.
//      (네트워크 예외도 { ok:false, error:{ code:'network' } } 로 바꿔서 돌려준다.)
//   2) 금액은 정수 bum. 클라이언트는 금액을 계산해서 원장에 쓰지 않는다 — 서버(또는 mock)가 정한 값을 표시만 한다.
//   3) 문자열은 { ko, en } 로 준다(UI 가 i18n tr 로 고른다).
//   4) 이벤트는 on(event, cb) → 해제 함수. off(event, cb) 도 된다.
//   5) 베타 무료 모드: getEconMode() 가 { transitPaid, shopPaid } 를 준다(서버 설정 1개로 전환).
//      무료이면 교통·상점은 차감하지 않고 결과에 free:true, amount:0 (listAmount 에 원래 요금). 보상(퀘스트·이동·웰컴·업적)은 무료 모드에서도 실제로 지급.
//   6) 게스트(isGuest): 지갑·보상 없음. 읽기는 빈 모양(guest:true), 쓰기는 { ok:false, error:{ code:'not_signed_in' } }.
//      예외: 무료 모드의 교통 결제는 게스트도 ok(free:true, 기록·보상 없음) — 지금처럼 탈 수 있게.

export const ECON_API_VERSION = 1;

/** @typedef {'mock'|'server'} EconSource */
/** @typedef {{ ko: string, en: string }} Text */
/** @typedef {'health'|'explore'|'transit'|'neighbor'|'streak'} KarmaAxis  건강·탐험·교통·이웃·꾸준함 */
/** @typedef {'daily'|'weekly'|'monthly'} QuestPeriod */
/** @typedef {'bus'|'subway'|'taxi'} TransitMode */

export const KARMA_AXES = Object.freeze(['health', 'explore', 'transit', 'neighbor', 'streak']);
export const KARMA_LABEL = Object.freeze({
  health: { ko: '건강', en: 'Health' }, explore: { ko: '탐험', en: 'Explore' }, transit: { ko: '교통', en: 'Transit' },
  neighbor: { ko: '이웃', en: 'Neighbor' }, streak: { ko: '꾸준함', en: 'Streak' },
});
export const QUEST_PERIODS = Object.freeze(['daily', 'weekly', 'monthly']);

/**
 * 오류 코드. details 는 코드별로 아래 필드를 넣는다.
 * - 'insufficient_balance' : { need, balance, shortBy }      결제·구매 금액이 잔액보다 큼 (외상 없음)
 * - 'not_signed_in'        : {}                              게스트 — 보상 받기·웰컴·구매·유료 모드 결제 (UI 는 Google 연동 안내)
 * - 'spend_locked'         : {}                              잔액이 음수가 된 계정 (회수 등) → 지출 잠금
 * - 'already_claimed'      : {}                              퀘스트·웰컴·구매 중복 (멱등키 충돌). 서버는 로그인 때 웰컴·D-LOGIN 을 자동 지급 → 정상 결과로 취급
 * - 'not_complete'         : { value, target }               아직 완료되지 않은 퀘스트를 받으려 함
 * - 'not_eligible'         : {}                              웰컴/베타 대상 아님
 * - 'coming_soon'          : {}                              상점 미리보기 기간 — 모든 탈것 구매 불가(comingSoon:true). 무료 지급 없음
 * - 'unknown'              : {}                              없는 퀘스트·상품·요금 코드
 * - 'hold_not_found'       : {}                              택시 홀드 없음/만료
 * - 'network'              : { status? }                     서버 연결 실패 (mock 은 쓰지 않음)
 * @typedef {'insufficient_balance'|'not_signed_in'|'spend_locked'|'already_claimed'|'not_complete'|'not_eligible'|'coming_soon'|'unknown'|'hold_not_found'|'network'} EconErrorCode
 * @typedef {{ code: EconErrorCode, message?: Text, need?: number, balance?: number, shortBy?: number, value?: number, target?: number, status?: number }} EconError
 */
export const ERR = Object.freeze({
  INSUFFICIENT: 'insufficient_balance', NOT_SIGNED_IN: 'not_signed_in', SPEND_LOCKED: 'spend_locked', ALREADY: 'already_claimed',
  NOT_COMPLETE: 'not_complete', NOT_ELIGIBLE: 'not_eligible', COMING_SOON: 'coming_soon', UNKNOWN: 'unknown', HOLD_NOT_FOUND: 'hold_not_found', NETWORK: 'network',
});

/**
 * @template T
 * @typedef {{ ok: true, data: T } | { ok: false, error: EconError }} Result
 */
export const okR = (data) => ({ ok: true, data });
export const errR = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });

/**
 * @typedef {{ transitPaid: boolean, shopPaid: boolean, beta: boolean }} EconMode   베타 기간 기본값 { transitPaid:false, shopPaid:false, beta:true }
 * @typedef {{ isGuest: boolean, signedIn: boolean, accountId: string|null, displayName: string|null, provider: 'google'|null }} Session
 *   isGuest === !signedIn. 게스트 → Google 연동은 UI 의 registerGoogleSignIn 훅(#21)이 하고, 끝나면 서버 클라이언트가 'session' 이벤트를 쏜다.
 * @typedef {{ guest: boolean, total: number, free: number, paid: number, currency: 'bum', locked: boolean, updatedAt: number }} Balance
 *   total = free + paid (원장 Σdelta). 차감은 free 먼저. 게스트는 모두 0.
 * @typedef {{ guest: boolean, kstDate: string, minutes: number, capMinutes: number, ratePerMin: number, pendingBum: number,
 *             distanceM: number, weekMinutes: number, weekCapMinutes: number, settled: boolean }} TravelToday
 *   인정 이동(걷기, Shift 달리기 제외). 동력 탈것은 분당 절반. 보상은 하루 1회 원장 기록(move:{kst_date}) 전까지 pendingBum.
 * @typedef {{ value: number, target: number, unit: 'min'|'count'|'day'|'kind'|'place' }} Progress
 * @typedef {{ bum: number, karma: { axis: KarmaAxis, points: number } | null }} Reward
 * @typedef {{ id: string, period: QuestPeriod, title: Text, progress: Progress, reward: Reward,
 *             state: 'active'|'complete'|'claimed', bonus: boolean, autoClaim: boolean, paidBum?: number }} Quest
 *   state: complete = 완료했지만 아직 안 받음(autoClaim=false 일 때만), claimed = 원장 기록됨.
 *   paidBum?: number — (선택) 상한에 걸려 reward.bum 보다 덜 들어간 경우 실제 받은 금액. UI 는 이 값을 보여 준다.
 * @typedef {{ guest: boolean, period: QuestPeriod, resetsAt: number, quests: Quest[], maxBum: number, claimedBum: number, info: Text }} QuestList
 *   게스트: guest:true, quests:[] , maxBum/claimedBum 0 (UI 는 '구글 계정 연동하고 bum 받기' 안내)
 * @typedef {{ kind: 'quest'|'achievement'|'welcome'|'beta'|'travel'|'board', amount: number, karma: { axis: KarmaAxis, points: number } | null,
 *             title: Text, questId?: string, period?: QuestPeriod, progressText?: Text, coins?: number, balanceAfter?: number }} RewardEvent
 *   coins = 코인 버스트 개수(UI 연출용, 보통 8). progressText·coins·balanceAfter 는 선택(서버 보상에는 progressText 가 없음).
 *   게시판 글 보상: 원장 kind 'board' 행 + RewardEvent kind 'board'(토스트가 떴다가 사라짐). 회수(음수 행)는 이벤트 없음.
 * @typedef {{ id: string, at: number, kind: 'welcome'|'beta'|'quest'|'move'|'ach'|'fare'|'purchase'|'refund'|'board', delta: number,
 *             title: Text, sub: Text|null }} LedgerEntry
 * @typedef {{ guest: boolean, weekEarned: number, weekSpent: number, avgDailyIncome: number, avgDailyTransit: number }} WalletSummary
 * @typedef {{ mode: TransitMode, code: string, free: boolean, amount: number, listAmount: number, balance: number, after: number, sufficient: boolean, label: Text, priceVer: number,
 *             options?: Array<{ code: string, amount: number, listAmount: number, label: Text }> }} FareQuote
 *   free=true 면 amount=0 (listAmount=정가), sufficient=true. code 예: 'bus.city' 'bus.village' 'bus.seat' 'bus.wide' 'bus.circular' 'subway.base' 'taxi.drive' 'taxi.fast' 'taxi.instant'
 * @typedef {{ receiptId: string, mode: TransitMode, code: string, free: boolean, amount: number, listAmount: number, balance: Balance, reward: RewardEvent[] }} Payment
 * @typedef {{ holdId: string, code?: string, free: boolean, amount: number, listAmount: number, balance: Balance }} TaxiHold
 * @typedef {{ receiptId: string, free: boolean, held: number, charged: number, listAmount: number, refunded: number, distanceM: number, balance: Balance, reward: RewardEvent[] }} TaxiSettlement
 * @typedef {{ status: 'insufficient'|'failed', ok: false, receiptId: null, mode: TransitMode, code: string, rideId: string,
 *             need?: number, balance?: number, shortBy?: number, error: EconError }} PaymentFailed
 *   결제 실패: 유료 모드에서 게임으로 탑승할 때만 'payment' 이벤트로 1번 온다. need·balance·shortBy 는 status 'insufficient' 일 때만.
 *   택시는 홀드 단계에서 막힌다(need = 예상 요금, 홀드는 남지 않음). 결제 성공(Payment · TaxiSettlement)에는 status 필드가 없다(없으면 성공).
 *   UI 에서 payFare/holdTaxi 를 직접 부르면 이벤트는 오지 않고 Result {ok:false,error} 만 온다 → 08c 가 두 번 뜨지 않는다.
 * @typedef {{ id: string, name: Text, free: boolean, price: number, listPrice: number, realPrice: number, daysForTypical: number, owned: boolean, affordable: boolean, giftable: false, available: boolean, comingSoon: boolean }} ShopItem
 *   상점은 미리보기 전용: 모든 물건이 available:false, comingSoon:true, free:false, price=listPrice(가격 표시용), affordable:false.
 *   purchase 는 항상 { ok:false, error:{ code:'coming_soon' } } (게스트 포함). 상점 무료 지급 없음 — 무료(베타)는 교통에만.
 * @typedef {{ guest: boolean, itemId: string, price: number, balance: number, remaining: number, daysLeft: number, typicalDailyNet: number }} ShopGoal
 * @typedef {{ points: number, title: Text|null, next: { title: Text, at: number } | null }} KarmaAxisState
 * @typedef {{ id: string, title: Text, rule: string, bonus: number, state: 'locked'|'progress'|'unlocked', progress: Progress | null }} Achievement
 * @typedef {{ axis: KarmaAxis, steps: Array<{ title: Text, at: number, unlocked: boolean }> }} TitleLadder
 * @typedef {{ guest: boolean, total: number, featured: Text|null, axes: Record<KarmaAxis, KarmaAxisState>, achievements: Achievement[], ladders: TitleLadder[], asOf: Text|null }} Karma
 * @typedef {{ guest: boolean, eligible: boolean, claimed: boolean, grants: Array<{ kind: 'welcome'|'beta', amount: number, title: Text, sub: Text }>, total: number }} WelcomeState
 * @typedef {{ kind: 'walk', seconds: number, meters: number } | { kind: 'vehicle', seconds: number, meters: number } | { kind: 'visit', placeId: string } | { kind: 'photo' } | { kind: 'neighbor', otherId: string }} Activity
 */

/**
 * 이벤트
 * - 'balance'  : { balance: Balance, delta: number, reason: LedgerEntry['kind'] }   잔액이 바뀔 때마다
 * - 'reward'   : RewardEvent                                                      보상 지급(퀘스트 완료·업적·웰컴) — 토스트/코인 버스트
 * - 'quest'    : { period: QuestPeriod, quest: Quest }                             진행값/상태 변경
 * - 'travel'   : TravelToday                                                      인정 이동 갱신
 * - 'payment'  : Payment | TaxiSettlement | PaymentFailed                          결제 성공 · (게임 탑승) 결제 실패 — status 가 있으면 실패
 * - 'session'  : Session                                                          로그인/로그아웃 (isGuest 변경)
 * - 'mode'     : EconMode                                                         무료/유료 전환
 * @typedef {'balance'|'reward'|'quest'|'travel'|'payment'|'session'|'mode'} EconEvent
 */
export const EVENTS = Object.freeze(['balance', 'reward', 'quest', 'travel', 'payment', 'session', 'mode']);

/**
 * EconClient — mock 과 server 가 똑같이 구현한다.
 * @typedef {Object} EconClient
 * @property {EconSource} source
 * @property {boolean} isMock                         true 면 UI 가 '예시 데이터' 표시를 붙인다
 * @property {number} version                         ECON_API_VERSION
 * @property {() => Promise<Session>} getSession
 * @property {() => Promise<EconMode>} getEconMode
 * @property {() => Promise<Balance>} getBalance
 * @property {() => Promise<TravelToday>} getTravelToday
 * @property {(a: Activity) => Promise<void>} reportActivity      클라이언트 힌트(서버는 자체 검증, 무시해도 됨)
 * @property {(period: QuestPeriod) => Promise<QuestList>} listQuests
 * @property {(questId: string) => Promise<Result<{ quest: Quest, reward: RewardEvent, balance: Balance }>>} claimQuest
 * @property {(o?: { limit?: number }) => Promise<LedgerEntry[]>} getLedger
 * @property {() => Promise<WalletSummary>} getWalletSummary
 * @property {(req: { mode: TransitMode, code?: string, meters?: number, night?: boolean }) => Promise<FareQuote>} quoteFare
 * @property {(req: { mode: 'bus'|'subway', code: string, rideId: string, meta?: object }) => Promise<Result<Payment>>} payFare
 *   멱등키 fare:{rideId}. 같은 rideId 로 두 번 부르면 두 번째는 첫 결과를 그대로 돌려준다.
 * @property {(req: { code: string, estimateMeters: number, rideId: string, night?: boolean }) => Promise<Result<TaxiHold>>} holdTaxi
 * @property {(req: { holdId: string, actualMeters: number }) => Promise<Result<TaxiSettlement>>} settleTaxi
 * @property {(holdId: string) => Promise<Result<{ balance: Balance }>>} cancelTaxi
 * @property {() => Promise<ShopItem[]>} listShopItems
 * @property {() => Promise<ShopGoal|null>} getShopGoal
 * @property {(itemId: string) => Promise<Result<{ item: ShopItem, free: boolean, amount: number, listAmount: number, balance: Balance }>>} purchase   미리보기 기간: 있는 물건은 항상 coming_soon, 없는 id 는 unknown
 * @property {() => Promise<Karma>} getKarma
 * @property {() => Promise<WelcomeState>} getWelcome
 * @property {() => Promise<Result<{ reward: RewardEvent[], balance: Balance }>>} claimWelcome
 * @property {(event: EconEvent, cb: (payload: any) => void) => () => void} on
 * @property {(event: EconEvent, cb: (payload: any) => void) => void} off
 */

/** 구현이 계약을 다 채웠는지 확인 (테스트·개발용). 빠진 이름 배열을 돌려준다. */
export const CLIENT_METHODS = Object.freeze([
  'getSession', 'getEconMode', 'getBalance', 'getTravelToday', 'reportActivity', 'listQuests', 'claimQuest', 'getLedger', 'getWalletSummary',
  'quoteFare', 'payFare', 'holdTaxi', 'settleTaxi', 'cancelTaxi', 'listShopItems', 'getShopGoal', 'purchase', 'getKarma',
  'getWelcome', 'claimWelcome', 'on', 'off',
]);
export function missingMethods(client) {
  const miss = CLIENT_METHODS.filter((k) => typeof client?.[k] !== 'function');
  if (client?.source !== 'mock' && client?.source !== 'server') miss.push('source');
  if (typeof client?.isMock !== 'boolean') miss.push('isMock');
  return miss;
}

/** 작은 이벤트 허브 — 두 구현이 같이 써도 된다. */
export function createEmitter() {
  const map = new Map();
  const on = (ev, cb) => { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(cb); return () => off(ev, cb); };
  const off = (ev, cb) => { map.get(ev)?.delete(cb); };
  const emit = (ev, payload) => { for (const cb of [...(map.get(ev) || [])]) { try { cb(payload); } catch (e) { console.warn('[econ] listener', ev, e); } } };
  return { on, off, emit };
}
