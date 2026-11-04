// [econ] 로컬 mock 구현 (source:'mock'). 서버 원장이 생기기 전까지 UI 를 움직이기 위한 예시 데이터다.
//   - 상태는 localStorage('bw.uiv2.econ.mock.v1')에만 있다. 서버와 무관, 다른 기기와 공유되지 않음.
//   - 금액 규칙은 기획 노트(Figma 13:2 Note)의 값을 따르지만 "예시"다. UI 는 isMock 이면 '예시 데이터' 표시를 붙인다.
//   - 기본 상태 = 게스트 · 베타 무료 모드. demo=econ 의 dev 메뉴(mock.dev)로 로그인/유료 모드/예시 상태를 바꾼다.
import { ECON_API_VERSION, ERR, okR, errR, createEmitter, KARMA_AXES } from './api.js';

export const MOCK_KEY = 'bw.uiv2.econ.mock.v1';
const T = (ko, en) => ({ ko, en });
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- 규칙 상수 (기획 v1 예시값)
export const RULES = Object.freeze({
  ratePerMin: 172, dayCapMin: 60, weekCapMin: 300, vehicleRatePerMin: 86,
  typicalDailyNet: 8916, avgDailyIncome: 11202, avgDailyTransit: 2286, priceVer: 1,
});
export const FARE_TABLE = Object.freeze({
  'bus.city': { mode: 'bus', amount: 1650, label: T('시내버스', 'City bus') },
  'bus.village': { mode: 'bus', amount: 1550, label: T('마을버스', 'Village bus') },
  'bus.seat': { mode: 'bus', amount: 2650, label: T('좌석버스', 'Express seat bus') },
  'bus.wide': { mode: 'bus', amount: 3200, label: T('광역버스', 'Metropolitan bus') },
  'bus.circular': { mode: 'bus', amount: 3450, label: T('순환버스', 'Circular bus') },
  'subway.base': { mode: 'subway', amount: 1550, label: T('지하철 기본요금', 'Subway base fare') },
  'taxi.drive': { mode: 'taxi', mult: 1, label: T('일반 주행', 'Normal drive') },
  'taxi.fast': { mode: 'taxi', mult: 1, label: T('빨리감기', 'Fast-forward') },
  'taxi.instant': { mode: 'taxi', mult: 1.5, label: T('즉시 도착', 'Instant arrival') },
});
/** 택시 요금: 4,800 (1.6 km) + 131 m 마다 100 (올림), 심야 +30%, 즉시 ×1.5 */
export function taxiFare(meters, { night = false, mult = 1 } = {}) {
  let f = 4800 + Math.max(0, Math.ceil((Math.max(0, meters) - 1600) / 131)) * 100;
  if (night) f = Math.round(f * 1.3);
  return Math.round(f * mult);
}

const QUEST_DEFS = {
  'D-LOGIN': { period: 'daily', title: T('오늘 첫 접속', 'First visit today'), target: 1, unit: 'count', bum: 500, axis: 'streak', k: 1 },
  'D-WALK10': { period: 'daily', title: T('걷기 인정 10분', 'Walk 10 counted minutes'), target: 10, unit: 'min', bum: 1000, axis: 'health', k: 10 },
  'D-SUB1': { period: 'daily', title: T('지하철 1회 타기', 'Ride the subway once'), target: 1, unit: 'count', bum: 800, axis: 'transit', k: 5 },
  'D-BUS1': { period: 'daily', title: T('버스 1회 타기', 'Ride a bus once'), target: 1, unit: 'count', bum: 800, axis: 'transit', k: 5 },
  'D-ALL3': { period: 'daily', title: T('보너스 · 3개 모두 완료', 'Bonus · all 3 done'), target: 3, unit: 'count', bum: 1000, axis: 'streak', k: 2, bonus: true },
  'W-WALK': { period: 'weekly', title: T('주간 걷기 120분', 'Walk 120 min this week'), target: 120, unit: 'min', bum: 6000, axis: 'health', k: 10 },
  'W-DAYS': { period: 'weekly', title: T('5일 출석', 'Visit 5 days'), target: 5, unit: 'day', bum: 4000, axis: 'streak', k: 5 },
  'W-DAILY': { period: 'weekly', title: T('일일 할 일 15개', '15 daily quests'), target: 15, unit: 'count', bum: 5000, axis: 'streak', k: 5 },
  'W-TRANSIT': { period: 'weekly', title: T('교통수단 3종 타기', 'Ride 3 kinds of transit'), target: 3, unit: 'kind', bum: 3000, axis: 'transit', k: 10 },
  'W-PLACES': { period: 'weekly', title: T('장소 5곳 방문', 'Visit 5 places'), target: 5, unit: 'place', bum: 4000, axis: 'explore', k: 5 },
  'M-WALK': { period: 'monthly', title: T('월간 걷기 600분', 'Walk 600 min this month'), target: 600, unit: 'min', bum: 15000, axis: 'health', k: 30 },
  'M-DAYS': { period: 'monthly', title: T('20일 출석', 'Visit 20 days'), target: 20, unit: 'day', bum: 15000, axis: 'streak', k: 20 },
  'M-WEEKLY': { period: 'monthly', title: T('주간 할 일 10개', '10 weekly quests'), target: 10, unit: 'count', bum: 10000, axis: 'streak', k: 10 },
};
const DAILY_ASSIGNED = ['D-LOGIN', 'D-WALK10', 'D-SUB1'];
const PERIOD_IDS = { daily: [...DAILY_ASSIGNED, 'D-ALL3'], weekly: ['W-WALK', 'W-DAYS', 'W-DAILY', 'W-TRANSIT', 'W-PLACES'], monthly: ['M-WALK', 'M-DAYS', 'M-WEEKLY'] };

export const SHOP_ITEMS = Object.freeze([
  { id: 'bike', name: T('첫 자전거', 'First bicycle'), listPrice: 160000, realPrice: 320000, days: 18 },
  { id: 'roadbike', name: T('CR·1 로드바이크', 'CR·1 road bike'), listPrice: 1000000, realPrice: 2000000, days: 113 },
  { id: 'scooter', name: T('스쿠터(125cc급)', 'Scooter (125cc)'), listPrice: 2500000, realPrice: 5000000, days: 280 },
  { id: 'car', name: T('경차', 'City car'), listPrice: 7450000, realPrice: 14900000, days: 836 },
]);
const LADDERS = [
  ['health', [[T('산책러', 'Stroller'), 100], [T('정자 워커', 'Jeongja Walker'), 1000], [T('탄천 마라토너', 'Tancheon Marathoner'), 5000]]],
  ['explore', [[T('골목 탐험가', 'Alley Explorer'), 20], [T('정자 지도장인', 'Jeongja Cartographer'), 200]]],
  ['transit', [[T('환승의 달인', 'Transfer Master'), 100], [T('교통카드 VIP', 'Transit Card VIP'), 1000]]],
  ['neighbor', [[T('반가운 이웃', 'Friendly Neighbor'), 30], [T('동네 반장', 'Block Captain'), 300]]],
  ['streak', [[T('7일 연속', '7-day streak'), 7], [T('30일 연속', '30-day streak'), 30], [T('100일 연속', '100-day streak'), 100]]],
];

// ---- 날짜 키 (KST)
const kst = (ms) => new Date(ms + 9 * 3600e3);
export function kstDate(ms) { return kst(ms).toISOString().slice(0, 10); }
function kstWeek(ms) { const d = kst(ms); const day = (d.getUTCDay() + 6) % 7; const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)); return mon.toISOString().slice(0, 10); }
const kstMonth = (ms) => kst(ms).toISOString().slice(0, 7);
function nextReset(period, ms) {
  const d = kst(ms); const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
  let t;
  if (period === 'daily') t = Date.UTC(y, m, dd + 1);
  else if (period === 'weekly') t = Date.UTC(y, m, dd + (7 - ((d.getUTCDay() + 6) % 7)));
  else t = Date.UTC(y, m + 1, 1);
  return t - 9 * 3600e3;
}

function freshState(now) {
  return {
    v: 1, signedIn: false, accountId: null, displayName: null,
    mode: { transitPaid: false, shopPaid: false, beta: true },
    welcomeClaimed: false, betaEligible: true,
    ledger: [], holds: {}, receipts: {}, owned: [],
    day: kstDate(now), week: kstWeek(now), month: kstMonth(now),
    travel: { sec: 0, meters: 0, weekMin: 0, monthMin: 0, settledDay: null },
    progress: {}, claimed: {}, transitKinds: [], places: [], daysVisited: { week: 0, month: 0 },
    karma: { health: 0, explore: 0, transit: 0, neighbor: 0, streak: 0 }, streakDays: 0, walkRealKm: 0, achClaimed: {},
    example: null, seq: 0,
  };
}

/**
 * @param {{ storage?: Storage|null, now?: () => number, key?: string }} [o]
 * @returns {import('./api.js').EconClient & { dev: object }}
 */
export function createMockClient({ storage, now = () => Date.now(), key = MOCK_KEY } = {}) {
  const st = storage !== undefined ? storage : (() => { try { return localStorage; } catch { return null; } })();
  const bus = createEmitter();
  let s = null;
  const load = () => { try { const v = JSON.parse(st?.getItem(key) || 'null'); if (v?.v === 1) return v; } catch { /* noop */ } return freshState(now()); };
  const save = () => { try { st?.setItem(key, JSON.stringify(s)); } catch { /* noop */ } };
  s = load();
  const tick = Promise.resolve();
  const later = (v) => tick.then(() => v);
  const id = (p) => `${p}-${now().toString(36)}-${(++s.seq).toString(36)}`;

  // ---- 파생 값
  const holdSum = () => Object.values(s.holds).reduce((a, h) => a + h.amount, 0);
  const ledgerSum = () => s.ledger.reduce((a, e) => a + e.delta, 0);
  const balance = () => {
    if (!s.signedIn) return { guest: true, total: 0, free: 0, paid: 0, currency: 'bum', locked: false, updatedAt: now() };
    const total = ledgerSum() - holdSum();
    return { guest: false, total, free: total, paid: 0, currency: 'bum', locked: total < 0, updatedAt: now() };
  };
  const travelMin = () => Math.min(RULES.dayCapMin, Math.floor(s.travel.sec / 60));
  const travel = () => ({
    guest: !s.signedIn, kstDate: s.day, minutes: s.signedIn ? travelMin() : 0, capMinutes: RULES.dayCapMin, ratePerMin: RULES.ratePerMin,
    pendingBum: s.signedIn ? travelMin() * RULES.ratePerMin : 0, distanceM: s.signedIn ? Math.round(s.travel.meters) : 0,
    weekMinutes: s.signedIn ? Math.min(RULES.weekCapMin, s.travel.weekMin + travelMin()) : 0, weekCapMinutes: RULES.weekCapMin, settled: s.travel.settledDay === s.day,
  });
  const prog = (qid) => {
    const d = QUEST_DEFS[qid];
    if (qid === 'D-ALL3') return DAILY_ASSIGNED.filter((q) => s.claimed[q]).length;
    if (qid === 'D-WALK10') return Math.min(d.target, travelMin());
    if (qid === 'W-WALK') return Math.min(d.target, s.travel.weekMin + travelMin());
    if (qid === 'M-WALK') return Math.min(d.target, s.travel.monthMin + travelMin());
    if (qid === 'W-TRANSIT') return Math.min(d.target, s.transitKinds.length);
    if (qid === 'W-PLACES') return Math.min(d.target, s.places.length);
    if (qid === 'W-DAYS') return Math.min(d.target, s.daysVisited.week);
    if (qid === 'M-DAYS') return Math.min(d.target, s.daysVisited.month);
    return Math.min(d.target, s.progress[qid] || 0);
  };
  const quest = (qid) => {
    const d = QUEST_DEFS[qid]; const v = prog(qid);
    return { id: qid, period: d.period, title: d.title, progress: { value: v, target: d.target, unit: d.unit }, reward: { bum: d.bum, karma: { axis: d.axis, points: d.k } },
      state: s.claimed[qid] ? 'claimed' : (v >= d.target ? 'complete' : 'active'), bonus: !!d.bonus, autoClaim: true };
  };
  const addLedger = (kind, delta, title, sub = null) => { const e = { id: id('lg'), at: now(), kind, delta, title, sub }; s.ledger.push(e); bus.emit('balance', { balance: balance(), delta, reason: kind }); return e; };
  const addKarma = (axis, pts) => { if (axis && pts) s.karma[axis] = (s.karma[axis] || 0) + pts; };

  // 완료된 퀘스트 자동 지급 (서버의 자동 완료 판정을 흉내)
  function settleQuests() {
    if (!s.signedIn) return [];
    const out = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const qid of [...PERIOD_IDS.daily, ...PERIOD_IDS.weekly, ...PERIOD_IDS.monthly]) {
        if (s.claimed[qid]) continue;
        const q = quest(qid);
        if (q.state !== 'complete') continue;
        out.push(grantQuest(qid));
      }
    }
    return out;
  }
  function grantQuest(qid) {
    const d = QUEST_DEFS[qid];
    s.claimed[qid] = now();
    if (d.period === 'daily' && !d.bonus) s.progress['W-DAILY'] = (s.progress['W-DAILY'] || 0) + 1;
    if (d.period === 'weekly') s.progress['M-WEEKLY'] = (s.progress['M-WEEKLY'] || 0) + 1;
    addLedger('quest', d.bum, T(`할 일 · ${d.title.ko}`, `Quest · ${d.title.en}`));
    addKarma(d.axis, d.k);
    const doneN = DAILY_ASSIGNED.filter((q) => s.claimed[q]).length;
    const left = DAILY_ASSIGNED.find((q) => !s.claimed[q]);
    const ev = { kind: 'quest', amount: d.bum, karma: { axis: d.axis, points: d.k }, title: d.title, questId: qid, period: d.period, coins: 8, balanceAfter: balance().total,
      progressText: d.period === 'daily' ? (left ? T(`오늘의 할 일 ${doneN}/3 · 남은 할 일: ${QUEST_DEFS[left].title.ko}`, `Today ${doneN}/3 · next: ${QUEST_DEFS[left].title.en}`) : T('오늘의 할 일 3/3 완료', 'All 3 daily quests done')) : null };
    bus.emit('quest', { period: d.period, quest: quest(qid) });
    bus.emit('reward', ev);
    return ev;
  }

  // 날짜가 바뀌면 이동 보상 정산 + 데일리 리셋
  function roll() {
    const t = now(); const day = kstDate(t);
    if (day === s.day) return;
    if (s.signedIn && travelMin() > 0 && s.travel.settledDay !== s.day) addLedger('move', travelMin() * RULES.ratePerMin, T(`이동 보상 ${travelMin()}분`, `Travel reward ${travelMin()} min`));
    s.travel.weekMin += travelMin(); s.travel.monthMin += travelMin(); s.travel.sec = 0; s.travel.meters = 0;
    for (const q of PERIOD_IDS.daily) { delete s.claimed[q]; delete s.progress[q]; }
    if (kstWeek(t) !== s.week) { s.week = kstWeek(t); s.travel.weekMin = 0; s.transitKinds = []; s.places = []; s.daysVisited.week = 0; for (const q of PERIOD_IDS.weekly) { delete s.claimed[q]; delete s.progress[q]; } }
    if (kstMonth(t) !== s.month) { s.month = kstMonth(t); s.travel.monthMin = 0; s.daysVisited.month = 0; for (const q of PERIOD_IDS.monthly) { delete s.claimed[q]; delete s.progress[q]; } }
    s.day = day;
    if (s.signedIn) visitToday();
    save();
  }
  function visitToday() {
    if (s.progress['D-LOGIN']) return;
    s.progress['D-LOGIN'] = 1; s.daysVisited.week++; s.daysVisited.month++; s.streakDays++;
    settleQuests();
  }
  const session = () => ({ isGuest: !s.signedIn, signedIn: s.signedIn, accountId: s.accountId, displayName: s.displayName, provider: s.signedIn ? 'google' : null });
  const guestErr = () => errR(ERR.NOT_SIGNED_IN, { message: T('구글 계정을 연동하면 bum을 받을 수 있어요', 'Link a Google account to earn bum') });
  const short = (need) => { const b = balance().total; return errR(ERR.INSUFFICIENT, { need, balance: b, shortBy: need - b, message: T(`잔액 ${fmt(need - b)} bum 부족`, `${fmt(need - b)} bum short`) }); };
  const markTransit = (mode) => {
    if (!s.signedIn) return [];
    if (!s.transitKinds.includes(mode)) s.transitKinds.push(mode);
    addKarma('transit', 5);
    if (mode === 'subway') s.progress['D-SUB1'] = 1;
    if (mode === 'bus') s.progress['D-BUS1'] = 1;
    return settleQuests();
  };
  function fareQuote(req) {
    const mode = req.mode;
    const code = req.code || (mode === 'bus' ? 'bus.city' : mode === 'subway' ? 'subway.base' : 'taxi.drive');
    const f = FARE_TABLE[code];
    if (!f || f.mode !== mode) return null;
    const listAmount = mode === 'taxi' ? taxiFare(req.meters || 0, { night: !!req.night, mult: f.mult }) : f.amount;
    const free = !s.mode.transitPaid;
    const amount = free ? 0 : listAmount;
    const b = balance().total;
    const q = { mode, code, free, amount, listAmount, balance: b, after: b - amount, sufficient: free || (s.signedIn && b >= amount), label: f.label, priceVer: RULES.priceVer };
    if (mode === 'taxi') q.options = ['taxi.drive', 'taxi.fast', 'taxi.instant'].map((c) => { const la = taxiFare(req.meters || 0, { night: !!req.night, mult: FARE_TABLE[c].mult }); return { code: c, amount: free ? 0 : la, listAmount: la, label: FARE_TABLE[c].label }; });
    return q;
  }
  function itemView(it) {
    const free = !s.mode.shopPaid; const b = balance().total;
    return { id: it.id, name: it.name, free, price: free ? 0 : it.listPrice, listPrice: it.listPrice, realPrice: it.realPrice, daysForTypical: it.days, owned: s.owned.includes(it.id), affordable: s.signedIn && (free || b >= it.listPrice), giftable: false };
  }

  const client = {
    source: 'mock', isMock: true, version: ECON_API_VERSION,
    async getSession() { roll(); return session(); },
    async getEconMode() { return { ...s.mode }; },
    async getBalance() { roll(); return balance(); },
    async getTravelToday() { roll(); return travel(); },
    async reportActivity(a) {
      roll();
      if (!s.signedIn || !a) return;
      if (a.kind === 'walk' || a.kind === 'vehicle') {
        const before = travelMin();
        const sec = Math.max(0, Math.min(10, +a.seconds || 0)) * (a.kind === 'vehicle' ? 0.5 : 1);
        s.travel.sec = Math.min(RULES.dayCapMin * 60, s.travel.sec + sec); s.travel.meters += Math.max(0, +a.meters || 0);
        s.walkRealKm = s.travel.meters / 1000;
        const after = travelMin();
        if (after !== before) { addKarma('health', after - before); bus.emit('travel', travel()); for (const qid of ['D-WALK10', 'W-WALK', 'M-WALK']) bus.emit('quest', { period: QUEST_DEFS[qid].period, quest: quest(qid) }); settleQuests(); save(); }
      } else if (a.kind === 'visit' && a.placeId && !s.places.includes(a.placeId)) { s.places.push(a.placeId); addKarma('explore', 1); settleQuests(); save(); }
      else if (a.kind === 'photo') { addKarma('explore', 1); save(); }
      else if (a.kind === 'neighbor') { addKarma('neighbor', 1); save(); }
    },
    async listQuests(period) {
      roll();
      const ids = PERIOD_IDS[period] || [];
      if (!s.signedIn) return later({ guest: true, period, resetsAt: nextReset(period, now()), quests: [], maxBum: 0, claimedBum: 0, info: T('구글 계정을 연동하면 할 일과 보상이 열려요', 'Link a Google account to unlock quests and rewards') });
      const quests = ids.map(quest);
      const tv = travel();
      const info = period === 'daily' ? T(`매일 00:00 KST에 3개 배정 · 오늘 이동 ${tv.minutes}/60분 (정산 예정 ${fmt(tv.pendingBum)} bum · 하루 상한 10,320)`, `3 assigned daily at 00:00 KST · travel today ${tv.minutes}/60 min (pending ${fmt(tv.pendingBum)} bum · daily cap 10,320)`)
        : period === 'weekly' ? T(`월요일 00:00 KST 리셋 · 이번 주 이동 ${tv.weekMinutes}/300분 (주 상한 51,600 bum)`, `Resets Monday 00:00 KST · travel this week ${tv.weekMinutes}/300 min (weekly cap 51,600 bum)`)
          : T('매월 1일 00:00 KST 리셋 (월 단위 KST 집계)', 'Resets on the 1st at 00:00 KST');
      return { guest: false, period, resetsAt: nextReset(period, now()), quests, maxBum: quests.reduce((a, q) => a + q.reward.bum, 0), claimedBum: quests.filter((q) => q.state === 'claimed').reduce((a, q) => a + q.reward.bum, 0), info };
    },
    async claimQuest(qid) {
      roll();
      if (!s.signedIn) return guestErr();
      if (!QUEST_DEFS[qid]) return errR(ERR.UNKNOWN);
      if (s.claimed[qid]) return errR(ERR.ALREADY);
      const q = quest(qid);
      if (q.state !== 'complete') return errR(ERR.NOT_COMPLETE, { value: q.progress.value, target: q.progress.target });
      const reward = grantQuest(qid); save();
      return okR({ quest: quest(qid), reward, balance: balance() });
    },
    async getLedger({ limit = 20 } = {}) { roll(); if (!s.signedIn) return []; return s.ledger.slice(-limit).reverse(); },
    async getWalletSummary() {
      roll();
      const since = now() - 7 * 86400e3; const rows = s.signedIn ? s.ledger.filter((e) => e.at >= since) : [];
      return { guest: !s.signedIn, weekEarned: rows.filter((e) => e.delta > 0).reduce((a, e) => a + e.delta, 0), weekSpent: -rows.filter((e) => e.delta < 0).reduce((a, e) => a + e.delta, 0), avgDailyIncome: RULES.avgDailyIncome, avgDailyTransit: RULES.avgDailyTransit };
    },
    async quoteFare(req) { roll(); return fareQuote(req || {}); },
    async payFare(req = {}) {
      roll();
      const q = fareQuote(req);
      if (!q || q.mode === 'taxi') return errR(ERR.UNKNOWN);
      if (req.rideId && s.receipts[req.rideId]) return okR(s.receipts[req.rideId]);
      if (!q.free && !s.signedIn) return guestErr();
      if (!q.free && balance().locked) return errR(ERR.SPEND_LOCKED);
      if (!q.free && balance().total < q.amount) return short(q.amount);
      const receiptId = id('rcpt');
      if (s.signedIn && !q.free) addLedger('fare', -q.amount, T(`${q.label.ko}${req.meta?.where ? ' · ' + req.meta.where : ''}`, `${q.label.en}${req.meta?.whereEn || req.meta?.where ? ' · ' + (req.meta.whereEn || req.meta.where) : ''}`), q.mode === 'bus' ? T('하차 태그 포함', 'Exit tap included') : null);
      const reward = markTransit(q.mode);
      const pay = { receiptId, mode: q.mode, code: q.code, free: q.free, amount: q.amount, listAmount: q.listAmount, balance: balance(), reward };
      if (req.rideId) s.receipts[req.rideId] = { ...pay, reward: [] };
      save(); bus.emit('payment', pay);
      return okR(pay);
    },
    async holdTaxi(req = {}) {
      roll();
      const q = fareQuote({ mode: 'taxi', code: req.code || 'taxi.drive', meters: req.estimateMeters, night: req.night });
      if (!q) return errR(ERR.UNKNOWN);
      if (!q.free && !s.signedIn) return guestErr();
      if (!q.free && balance().total < q.amount) return short(q.amount);
      const holdId = id('hold');
      s.holds[holdId] = { amount: q.amount, listAmount: q.listAmount, code: q.code, night: !!req.night, free: q.free };
      save();
      if (!q.free && s.signedIn) bus.emit('balance', { balance: balance(), delta: -q.amount, reason: 'fare' });
      return okR({ holdId, free: q.free, amount: q.amount, listAmount: q.listAmount, balance: balance() });
    },
    async settleTaxi({ holdId, actualMeters } = {}) {
      roll();
      const h = s.holds[holdId]; if (!h) return errR(ERR.HOLD_NOT_FOUND);
      delete s.holds[holdId];
      const actual = Math.min(h.listAmount, taxiFare(actualMeters || 0, { night: h.night, mult: FARE_TABLE[h.code].mult }));
      const charged = h.free ? 0 : actual;
      if (s.signedIn && !h.free) addLedger('fare', -charged, T(`택시 · ${FARE_TABLE[h.code].label.ko} ${(actualMeters / 1000).toFixed(1)} km`, `Taxi · ${FARE_TABLE[h.code].label.en} ${(actualMeters / 1000).toFixed(1)} km`), T(`예상 ${fmt(h.amount)} 홀드 → 실제 정산, ${fmt(h.amount - charged)} 반환`, `Held ${fmt(h.amount)} → settled, ${fmt(h.amount - charged)} returned`));
      const reward = markTransit('taxi');
      const st8 = { receiptId: id('rcpt'), free: h.free, held: h.amount, charged, listAmount: actual, refunded: h.amount - charged, distanceM: Math.round(actualMeters || 0), balance: balance(), reward, mode: 'taxi', code: h.code };
      save(); bus.emit('payment', st8);
      return okR(st8);
    },
    async cancelTaxi(holdId) { const h = s.holds[holdId]; if (!h) return errR(ERR.HOLD_NOT_FOUND); delete s.holds[holdId]; save(); if (!h.free && s.signedIn) bus.emit('balance', { balance: balance(), delta: h.amount, reason: 'refund' }); return okR({ balance: balance() }); },
    async listShopItems() { roll(); return SHOP_ITEMS.map(itemView); },
    async getShopGoal() {
      roll();
      if (!s.signedIn) return null;
      const it = SHOP_ITEMS.find((x) => !s.owned.includes(x.id)); if (!it) return null;
      const b = Math.max(0, balance().total); const remaining = Math.max(0, it.listPrice - b);
      return { guest: false, itemId: it.id, price: it.listPrice, balance: b, remaining, daysLeft: Math.ceil(remaining / RULES.typicalDailyNet), typicalDailyNet: RULES.typicalDailyNet };
    },
    async purchase(itemId) {
      roll();
      if (!s.signedIn) return guestErr();
      const it = SHOP_ITEMS.find((x) => x.id === itemId); if (!it) return errR(ERR.UNKNOWN);
      if (s.owned.includes(itemId)) return errR(ERR.ALREADY);
      const free = !s.mode.shopPaid;
      if (!free && balance().total < it.listPrice) return short(it.listPrice);
      if (!free) addLedger('purchase', -it.listPrice, T(`탈것 · ${it.name.ko}`, `Vehicle · ${it.name.en}`));
      s.owned.push(itemId); save();
      return okR({ item: itemView(it), free, amount: free ? 0 : it.listPrice, listAmount: it.listPrice, balance: balance() });
    },
    async getKarma() {
      roll();
      const g = !s.signedIn; const k = g ? { health: 0, explore: 0, transit: 0, neighbor: 0, streak: 0 } : { ...s.karma };
      const axes = {};
      for (const [axis, steps] of LADDERS) {
        const pts = axis === 'streak' ? (g ? 0 : s.streakDays) : k[axis];
        const got = steps.filter(([, at]) => pts >= at); const nxt = steps.find(([, at]) => pts < at);
        axes[axis] = { points: axis === 'streak' ? k.streak : pts, title: got.length ? got[got.length - 1][0] : null, next: nxt ? { title: nxt[0], at: nxt[1] } : null, ...(axis === 'streak' ? { days: pts } : {}) };
      }
      const total = KARMA_AXES.reduce((a, x) => a + axes[x].points, 0);
      const km = g ? 0 : (s.example ? 100 : s.walkRealKm);
      const achievements = [
        { id: 'ACH-WALK100', title: T('현실 환산 100 km 걸음', 'Walk 100 real km'), rule: 'walk_realkm_total ≥ 100', bonus: 5000, state: km >= 100 ? 'unlocked' : 'progress', progress: { value: Math.floor(km), target: 100, unit: 'count' } },
        { id: 'ACH-STREAK30', title: T('30일 연속 출석', '30-day streak'), rule: 'streak_days ≥ 30', bonus: 10000, state: (g ? 0 : s.streakDays) >= 30 ? 'unlocked' : 'progress', progress: { value: g ? 0 : s.streakDays, target: 30, unit: 'day' } },
      ];
      const ladders = LADDERS.map(([axis, steps]) => ({ axis, steps: steps.map(([title, at]) => ({ title, at, unlocked: (axis === 'streak' ? (g ? 0 : s.streakDays) : k[axis]) >= at })) }));
      return { guest: g, total, featured: g ? null : (axes.health.title || null), axes, achievements, ladders, asOf: s.example === 'day45' ? T('예시 상태: 플레이 45일차 계정', 'Example: account on day 45') : null };
    },
    async getWelcome() {
      roll();
      const grants = [{ kind: 'welcome', amount: 20000, title: T('웰컴 지급', 'Welcome grant'), sub: T('계정당 1회', 'Once per account') }];
      if (s.betaEligible) grants.push({ kind: 'beta', amount: 10000, title: T('베타 감사 지급', 'Beta thank-you'), sub: T('오픈 전 기기를 오픈 30일 안에 연결', 'Pre-launch device linked within 30 days') });
      return { guest: !s.signedIn, eligible: s.signedIn && !s.welcomeClaimed, claimed: s.welcomeClaimed, grants, total: grants.reduce((a, g) => a + g.amount, 0) };
    },
    async claimWelcome() {
      roll();
      if (!s.signedIn) return guestErr();
      if (s.welcomeClaimed) return errR(ERR.ALREADY);
      const w = await client.getWelcome();
      s.welcomeClaimed = true;
      const reward = w.grants.map((g) => { addLedger(g.kind, g.amount, g.title); const ev = { kind: g.kind, amount: g.amount, karma: null, title: g.title, coins: 8, balanceAfter: balance().total }; bus.emit('reward', ev); return ev; });
      visitToday(); save();
      return okR({ reward, balance: balance() });
    },
    on: bus.on, off: bus.off,
  };

  // ---- dev 전용 (demo=econ 메뉴 · 테스트). 서버 클라이언트에는 없다.
  client.dev = {
    state: () => JSON.parse(JSON.stringify(s)),
    reset() { s = freshState(now()); save(); bus.emit('session', session()); bus.emit('mode', { ...s.mode }); bus.emit('balance', { balance: balance(), delta: 0, reason: 'refund' }); },
    /** 로그인 흉내: 실제 Google 로그인은 registerGoogleSignIn 훅(#21) */
    signIn({ name = '예시 계정' } = {}) { s.signedIn = true; s.accountId = 'mock-account'; s.displayName = name; save(); bus.emit('session', session()); bus.emit('balance', { balance: balance(), delta: 0, reason: 'welcome' }); },
    signOut() { s.signedIn = false; s.accountId = null; s.displayName = null; save(); bus.emit('session', session()); bus.emit('balance', { balance: balance(), delta: 0, reason: 'refund' }); },
    setMode(m) { s.mode = { ...s.mode, ...m }; save(); bus.emit('mode', { ...s.mode }); },
    addWalkMinutes(min) { s.travel.sec = Math.min(RULES.dayCapMin * 60, s.travel.sec + min * 60); s.travel.meters += min * 80; addKarma('health', min); bus.emit('travel', travel()); const r = settleQuests(); save(); return r; },
    setBalance(total) { const d = total - balance().total; if (d) addLedger(d > 0 ? 'refund' : 'fare', d, T('예시 잔액 조정', 'Example balance adjust')); save(); },
    /** Figma 예시 상태로 채우기 (모두 '예시 데이터'). name: 'fig03' (30,500 · 할 일 1/3 · 이동 7분) | 'day45' (카르마 45일차) */
    seed(name = 'fig03') {
      const keepMode = s.mode;
      s = freshState(now()); s.mode = keepMode; s.signedIn = true; s.accountId = 'mock-account'; s.displayName = '예시 계정'; s.example = name;
      const t0 = now() - 3600e3;
      const add = (kind, delta, ko, en, sub = null) => s.ledger.push({ id: id('lg'), at: t0 + s.ledger.length * 1000, kind, delta, title: T(ko, en), sub });
      add('welcome', 20000, '웰컴 지급', 'Welcome grant'); add('beta', 10000, '베타 감사 지급', 'Beta thank-you');
      s.welcomeClaimed = true;
      s.progress['D-LOGIN'] = 1; s.claimed['D-LOGIN'] = t0; add('quest', 500, '할 일 · 오늘 첫 접속', 'Quest · First visit today');
      s.daysVisited = { week: 1, month: 1 }; s.streakDays = 1; s.progress['W-DAILY'] = 1;
      s.travel.sec = 7 * 60; s.travel.meters = 560; s.karma = { health: 7, explore: 0, transit: 0, neighbor: 0, streak: 1 };
      if (name === 'day45') { s.karma = { health: 1240, explore: 26, transit: 85, neighbor: 12, streak: 54 }; s.streakDays = 23; }
      save(); bus.emit('session', session()); bus.emit('balance', { balance: balance(), delta: 0, reason: 'welcome' }); bus.emit('travel', travel());
    },
    emitReward(ev) { bus.emit('reward', ev); },
  };
  return client;
}
