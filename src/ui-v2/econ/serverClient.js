// [econ] 서버 구현 (source:'server', isMock:false) — feat/economy-server 의 /econ/* 원장 + Google 계정.
//   econ/index.js 의 import 한 줄만 바꾸면 UI 가 이걸 쓴다:
//     import { createServerClient as createClient } from './serverClient.js';
//   - 계정 기능(?accounts=1)이 꺼져 있으면 네트워크를 쓰지 않는 "영구 게스트 · 무료 모드" 로 동작한다(지금 정자 그대로).
//   - 금액은 서버가 정한다. 클라이언트는 표시(quoteFare)만 /econ/config 요금표로 계산한다.
//   - 쓰기 메서드는 throw 하지 않는다. 네트워크 실패 = { ok:false, error:{ code:'network', status? } }.
//   - 게스트 · 무료 모드의 교통 결제(payFare/holdTaxi/settleTaxi)는 서버에 가지 않고 여기서 0원 영수증을 만든다(원장·보상 없음).
//   - 이벤트: /econ/state 폴링(30초, 탭이 숨겨지면 멈춤) + 쓰기 직후 갱신. reward 는 원장 행 하나당 한 번만 낸다.
import { ECON_API_VERSION, ERR, okR, errR, createEmitter } from './api.js';

const T = (ko, en) => ({ ko, en });
const NOT_SIGNED_IN_MSG = T('구글 계정을 연동하면 bum을 받을 수 있어요', 'Link a Google account to earn bum');
const FREE_MODE = Object.freeze({ transitPaid: false, shopPaid: true, beta: true }); // 상점은 무료 오픈 대상 아님(미리보기 전용)
const LAST_KEY = 'bw.econ.last.v1';

const guestSession = () => ({ isGuest: true, signedIn: false, accountId: null, displayName: null, provider: null });
const guestBalance = (now) => ({ guest: true, total: 0, free: 0, paid: 0, currency: 'bum', locked: false, updatedAt: now });
function kstDate(ms) { return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); }
function nextReset(period, ms) {
  const d = new Date(ms + 9 * 3600e3); const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
  const t = period === 'daily' ? Date.UTC(y, m, dd + 1) : period === 'weekly' ? Date.UTC(y, m, dd + (7 - ((d.getUTCDay() + 6) % 7))) : Date.UTC(y, m + 1, 1);
  return t - 9 * 3600e3;
}
const guestTravel = (now) => ({ guest: true, kstDate: kstDate(now), minutes: 0, capMinutes: 60, ratePerMin: 172, pendingBum: 0, distanceM: 0, weekMinutes: 0, weekCapMinutes: 300, settled: true });
const guestQuests = (period, now) => ({ guest: true, period, resetsAt: nextReset(period, now), quests: [], maxBum: 0, claimedBum: 0, info: T('구글 계정을 연동하면 할 일과 보상이 열려요', 'Link a Google account to unlock quests and rewards') });
const guestSummary = () => ({ guest: true, weekEarned: 0, weekSpent: 0, avgDailyIncome: 0, avgDailyTransit: 0 });
const guestWelcome = () => ({ guest: true, eligible: false, claimed: false, grants: [], total: 0 });
const AXES = ['health', 'explore', 'transit', 'neighbor', 'streak'];
const guestKarma = () => ({ guest: true, total: 0, featured: null, axes: Object.fromEntries(AXES.map((a) => [a, { points: 0, title: null, next: null, ...(a === 'streak' ? { days: 0 } : {}) }])), achievements: [], ladders: [], asOf: null });
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 46656).toString(36)}`;

/** 택시 요금 — 서버 economy.js taxiFare 와 같은 계산(설정값은 /econ/config) */
export function taxiFareOf(cfgTaxi, meters, { night = false, factor = 1 } = {}) {
  const t = cfgTaxi;
  const m = Math.max(0, Math.min(t.maxM, Number(meters) || 0));
  let f = t.base + Math.max(0, Math.ceil((m - t.baseM) / t.stepM)) * t.stepFare;
  if (night) f = Math.round(f * t.nightFactor);
  return Math.round(f * factor);
}

/**
 * @param {{ fetch?: typeof fetch, base?: string, enabled?: boolean, storage?: Storage|null, now?: () => number,
 *           pollMs?: number, doc?: Document|null, autoRegister?: boolean, rideBridge?: boolean, deviceId?: () => string }} [o]
 * @returns {import('./api.js').EconClient & { refresh: Function, signInWithGoogle: Function, signOut: Function, stop: Function }}
 */
export function createServerClient(o = {}) {
  const now = o.now || (() => Date.now());
  const fetchFn = o.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const doc = o.doc !== undefined ? o.doc : (typeof document !== 'undefined' ? document : null);
  const st = o.storage !== undefined ? o.storage : (() => { try { return localStorage; } catch { return null; } })();
  const pollMs = o.pollMs ?? 30000;
  const win = o.win !== undefined ? o.win : (typeof window !== 'undefined' ? window : null);
  const bus = createEmitter();
  // 게임 쪽 신호(window CustomEvent). 'bw:econ-owned' = 탈것을 산 직후(게임이 웹소켓으로 보유를 다시 받음)
  const signal = (name, detail) => { try { win?.dispatchEvent?.(new CustomEvent(name, { detail })); } catch { /* noop */ } };

  // 계정 기능 스위치·주소는 기본값이면 src/account 에서 읽는다(동적 import — 이 파일을 node 테스트에서 그대로 쓰려고)
  let enabled = o.enabled;
  let base = o.base;
  const ready = (async () => {
    if (enabled === undefined || base === undefined) {
      try {
        const [{ accountsOn }, { accountBase }] = await Promise.all([import('../../account/flags.js'), import('../../account/api.js')]);
        if (enabled === undefined) enabled = accountsOn();
        if (base === undefined) base = accountBase();
      } catch { enabled = false; base = ''; }
    }
    enabled = !!enabled && !!base && !!fetchFn;
  })();

  const S = {
    session: guestSession(), mode: { ...FREE_MODE }, balance: guestBalance(now()), travel: guestTravel(now()),
    config: null, features: [], serverOn: false, lastId: 0, fetchedAt: 0, refreshing: null, quests: {}, timer: null, started: false,
  };

  async function req(path, { method = 'GET', body } = {}) {
    await ready;
    if (!enabled) return errR(ERR.NETWORK, { status: 0 });
    try {
      const res = await fetchFn(`${base}${path}`, {
        method, credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => null);
      if (j && typeof j.ok === 'boolean') {
        if (j.ok) return okR(j.data);
        return { ok: false, error: { ...(j.error || {}), code: j.error?.code || ERR.NETWORK, ...(j.error?.code ? {} : { status: res.status }) } };
      }
      return errR(ERR.NETWORK, { status: res.status });
    } catch {
      return errR(ERR.NETWORK);
    }
  }

  // ── 상태 · 이벤트 ──
  // 마지막으로 본 원장 id 를 계정과 함께 저장 → 새로고침 뒤 첫 갱신에서도 그 사이 보상만 이벤트로(같은 계정일 때만)
  const loadLast = () => { try { const v = JSON.parse(st?.getItem(LAST_KEY) || 'null'); return v && v.acc ? { acc: String(v.acc), id: Math.floor(Number(v.id) || 0) } : null; } catch { return null; } };
  const saveLast = (acc, id) => { try { st?.setItem(LAST_KEY, JSON.stringify({ acc, id })); } catch {} };

  async function loadConfig() {
    if (S.config) return S.config;
    const r = await req('/econ/config');
    if (r.ok) {
      S.config = r.data;
      if (r.data?.mode && !S.serverOn) S.mode = { ...r.data.mode };
    }
    return S.config;
  }

  /** /econ/state 를 읽어 바뀐 것만 이벤트로 낸다. sinceAt = 로그인 직후(그 뒤 원장 행을 보상 이벤트로) */
  async function refresh({ sinceAt = 0, reason = null } = {}) {
    // 로그인 직후(sinceAt) 요청은 진행 중인 폴링에 묻히면 안 된다 — 묻히면 웰컴·베타·첫 접속 토스트가 사라짐. 끝나길 기다렸다가 따로 보낸다.
    while (S.refreshing) {
      const p = S.refreshing;
      if (!sinceAt) return p;
      await p.catch(() => {});
    }
    S.refreshing = (async () => {
      await ready;
      if (!enabled) { S.fetchedAt = now(); return; }
      const acc = S.session.signedIn ? S.session.accountId : null;
      const stored = acc ? null : loadLast();
      const since = acc ? S.lastId : (stored?.id || 0);
      const sinceFor = acc || stored?.acc || null; // since 가 가리키는 계정
      const q = sinceAt ? `?sinceAt=${sinceAt}` : since ? `?since=${since}` : '';
      const r = await req(`/econ/state${q}`);
      S.fetchedAt = now();
      if (!r.ok) {
        if (r.error.code !== ERR.NETWORK) { S.serverOn = false; applySession(guestSession()); } // econ_disabled 등 → 게스트
        return;
      }
      S.serverOn = true;
      const d = r.data;
      S.features = d.features || [];
      if (d.mode && !sameJson(d.mode, S.mode)) { S.mode = { ...d.mode }; bus.emit('mode', { ...S.mode }); }
      const sess = d.session?.signedIn
        ? { isGuest: false, signedIn: true, accountId: d.session.accountId, displayName: d.session.displayName ?? null, provider: 'google' }
        : guestSession();
      applySession(sess);
      // 다른 계정의 since 로 받은 행은 버린다(그 계정 행이 아님 — 서버는 since 이후 "이 계정" 행만 주지만, 기준 id 가 달라 엉뚱한 토스트가 날 수 있음)
      const valid = sess.signedIn && (sinceAt > 0 || (since > 0 && sinceFor === sess.accountId));
      const events = valid && Array.isArray(d.events) ? d.events : [];
      for (const ev of events) if (ev.reward) bus.emit('reward', ev.reward);
      if (sess.signedIn) { S.lastId = Number(d.lastId) || 0; saveLast(sess.accountId, S.lastId); }
      const prev = S.balance;
      S.balance = d.balance || guestBalance(now());
      if (prev.total !== S.balance.total || prev.guest !== S.balance.guest) {
        const lastKind = events.length ? events[events.length - 1].entry?.kind : null;
        bus.emit('balance', { balance: S.balance, delta: S.balance.total - (prev.guest ? 0 : prev.total), reason: reason || lastKind || 'refund' });
      }
      const tv = d.travel || guestTravel(now());
      const travelChanged = !sameJson(tv, S.travel);
      S.travel = tv;
      if (travelChanged) bus.emit('travel', S.travel);
      // 퀘스트: 보상이 났거나 이동이 바뀌었으면, UI 가 한 번이라도 본 기간만 다시 읽어 바뀐 퀘스트를 낸다
      const periods = new Set(events.filter((e) => e.reward?.kind === 'quest' && e.reward.period).map((e) => e.reward.period));
      if (travelChanged) for (const p of Object.keys(S.quests)) periods.add(p);
      for (const p of periods) if (S.quests[p]) await fetchQuests(p, true);
    })().finally(() => { S.refreshing = null; });
    return S.refreshing;
  }

  function applySession(sess) {
    if (sameJson(sess, S.session)) return;
    S.session = sess;
    if (!sess.signedIn) { S.balance = guestBalance(now()); S.travel = guestTravel(now()); S.quests = {}; }
    S.lastId = 0;
    bus.emit('session', { ...sess });
  }

  async function fresh(maxAgeMs = 5000) {
    start();
    if (!S.fetchedAt || now() - S.fetchedAt > maxAgeMs) await refresh();
  }

  function start() {
    if (S.started) return;
    S.started = true;
    ready.then(() => {
      if (!enabled) return;
      // 서버가 다른 경로(게시판 글 보상 등)로 원장을 바꿨다는 게임 쪽 신호 → 바로 새로 읽어 보상 토스트를 띄운다
      win?.addEventListener?.('bw:econ-changed', () => { refresh({ reason: 'external' }).catch(() => {}); });
      if (!pollMs) return;
      const tick = () => { if (!doc?.hidden) refresh().catch(() => {}); };
      S.timer = setInterval(tick, pollMs);
      S.timer?.unref?.();
      doc?.addEventListener?.('visibilitychange', () => { if (!doc.hidden) tick(); });
      loadConfig().catch(() => {});
    });
  }

  async function fetchQuests(period, emitDiff = false) {
    const r = await req(`/econ/quests?period=${encodeURIComponent(period)}`);
    if (!r.ok) return null;
    const old = S.quests[period];
    S.quests[period] = r.data;
    if (emitDiff && old) {
      const byId = new Map((old.quests || []).map((q) => [q.id, q]));
      for (const q of r.data.quests || []) if (!sameJson(byId.get(q.id), q)) bus.emit('quest', { period, quest: q });
    }
    return r.data;
  }

  const guestErr = () => errR(ERR.NOT_SIGNED_IN, { message: NOT_SIGNED_IN_MSG });
  const isGuest = () => !S.session.signedIn;

  // ── 요금 표시 ──
  function fareDef(cfg, code) {
    if (!cfg) return null;
    const c = cfg.aliases?.[code] || code;
    const f = cfg.fares?.[c];
    return f ? { code: c, ...f } : null;
  }
  const isNightKst = (cfg, ms) => { const h = new Date(ms + 9 * 3600e3).getUTCHours(); return h >= cfg.taxi.nightFromHour || h < cfg.taxi.nightToHour; };
  function listAmountOf(cfg, f, meters, night) {
    return f.meter ? taxiFareOf(cfg.taxi, meters, { night, factor: f.factor || 1 }) : Number(f.amount || 0);
  }
  async function quote(reqq) {
    const cfg = await loadConfig();
    const mode = reqq?.mode;
    const code = reqq?.code || (mode === 'bus' ? 'bus.city' : mode === 'subway' ? 'subway.base' : 'taxi.drive');
    const f = fareDef(cfg, code);
    if (!f || f.mode !== mode) return null;
    const night = reqq.night ?? isNightKst(cfg, now());
    const listAmount = listAmountOf(cfg, f, reqq.meters, night);
    const free = !S.mode.transitPaid;
    const amount = free ? 0 : listAmount;
    const b = S.balance.total;
    const q = { mode, code: f.code, free, amount, listAmount, balance: b, after: b - amount, sufficient: free || (S.session.signedIn && b >= amount), label: f.label, priceVer: cfg.version };
    if (mode === 'taxi') {
      q.options = ['taxi.drive', 'taxi.fast', 'taxi.instant'].map((c) => {
        const g = fareDef(cfg, c); const la = g ? listAmountOf(cfg, g, reqq.meters, night) : 0;
        return { code: c, amount: free ? 0 : la, listAmount: la, label: g?.label || T(c, c) };
      });
    }
    return q;
  }

  // 게스트 · 무료 모드: 0원 영수증을 여기서 만든다(원장·보상 없음)
  const guestHolds = new Map();
  const guestReceipts = new Map();

  async function afterWrite(reason) { await refresh({ reason }).catch(() => {}); }

  const client = {
    source: 'server', isMock: false, version: ECON_API_VERSION,

    async getSession() { await fresh(); return { ...S.session }; },
    async getEconMode() { await fresh(); if (!S.serverOn) await loadConfig(); return { ...S.mode }; },
    async getBalance() { await fresh(3000); return { ...S.balance }; },
    async getTravelToday() { await fresh(); return { ...S.travel }; },
    async reportActivity() { /* 서버가 웹소켓 위치로 직접 잰다(인정 이동 검증) — 클라이언트 힌트는 쓰지 않음 */ },

    async listQuests(period) {
      await fresh();
      if (isGuest()) return guestQuests(period, now());
      return (await fetchQuests(period)) || { ...guestQuests(period, now()), guest: false, info: T('서버에 연결하지 못했어요', 'Could not reach the server') };
    },
    async claimQuest(questId) {
      await fresh();
      if (isGuest()) return guestErr();
      const r = await req('/econ/quests/claim', { method: 'POST', body: { questId } });
      if (r.ok) await afterWrite('quest');
      return r;
    },
    async getLedger({ limit = 20 } = {}) {
      await fresh();
      if (isGuest()) return [];
      const r = await req(`/econ/ledger?limit=${Math.max(1, Math.min(100, Number(limit) || 20))}`);
      return r.ok && Array.isArray(r.data) ? r.data : [];
    },
    async getWalletSummary() {
      await fresh();
      if (isGuest()) return guestSummary();
      const r = await req('/econ/summary');
      return r.ok ? r.data : { ...guestSummary(), guest: false };
    },

    async quoteFare(reqq = {}) { await fresh(); return quote(reqq); },

    async payFare(reqq = {}) {
      await fresh();
      const rideId = String(reqq.rideId || '');
      if (reqq.mode === 'taxi') return errR(ERR.UNKNOWN); // 택시는 holdTaxi → settleTaxi
      const code = reqq.code || (reqq.mode === 'subway' ? 'subway.base' : 'bus.city');
      if (isGuest()) {
        if (S.mode.transitPaid) return guestErr();
        if (rideId && guestReceipts.has(rideId)) return okR(guestReceipts.get(rideId));
        const q = await quote({ mode: reqq.mode || 'bus', code });
        if (!q && S.config) return errR(ERR.UNKNOWN);
        const pay = { receiptId: rid('g'), mode: reqq.mode, code: q?.code || code, free: true, amount: 0, listAmount: q?.listAmount ?? 0, balance: guestBalance(now()), reward: [] };
        if (rideId) guestReceipts.set(rideId, pay);
        bus.emit('payment', pay);
        return okR(pay);
      }
      const r = await req('/econ/fare', { method: 'POST', body: { code, rideId: rideId || rid('ride'), meta: reqq.meta } });
      if (r.ok) {
        if (reqq.mode && r.data.mode !== reqq.mode) { /* 서버 요금표 기준 */ }
        bus.emit('payment', r.data);
        await afterWrite('fare');
      }
      return r;
    },
    async holdTaxi(reqq = {}) {
      await fresh();
      if (isGuest()) {
        if (S.mode.transitPaid) return guestErr();
        const q = await quote({ mode: 'taxi', code: reqq.code || 'taxi.drive', meters: reqq.estimateMeters, night: reqq.night });
        if (!q && S.config) return errR(ERR.UNKNOWN);
        const hold = { holdId: rid('g-hold'), free: true, amount: 0, listAmount: q?.listAmount ?? 0, balance: guestBalance(now()) };
        guestHolds.set(hold.holdId, { code: q?.code || reqq.code || 'taxi.drive', listAmount: hold.listAmount, night: reqq.night });
        return okR(hold);
      }
      const r = await req('/econ/taxi/hold', { method: 'POST', body: { code: reqq.code || 'taxi.drive', estimateMeters: Number(reqq.estimateMeters) || 0, rideId: String(reqq.rideId || rid('ride')) } });
      if (r.ok && r.data.amount > 0) await afterWrite('fare');
      return r;
    },
    async settleTaxi({ holdId, actualMeters } = {}) {
      await fresh();
      const gh = guestHolds.get(holdId);
      if (gh) {
        guestHolds.delete(holdId);
        const cfg = S.config;
        const f = fareDef(cfg, gh.code);
        const actual = f ? Math.min(gh.listAmount, listAmountOf(cfg, f, actualMeters, gh.night ?? isNightKst(cfg, now()))) : gh.listAmount;
        const st8 = { receiptId: rid('g'), mode: 'taxi', code: gh.code, free: true, held: 0, charged: 0, listAmount: actual, refunded: 0, distanceM: Math.round(Number(actualMeters) || 0), balance: guestBalance(now()), reward: [] };
        bus.emit('payment', st8);
        return okR(st8);
      }
      if (isGuest()) return errR(ERR.HOLD_NOT_FOUND);
      const r = await req('/econ/taxi/settle', { method: 'POST', body: { holdId: String(holdId || ''), actualMeters: Number(actualMeters) || 0 } });
      if (r.ok) { bus.emit('payment', r.data); await afterWrite('fare'); }
      return r;
    },
    async cancelTaxi(holdId) {
      await fresh();
      if (guestHolds.delete(holdId)) return okR({ balance: guestBalance(now()) });
      if (isGuest()) return errR(ERR.HOLD_NOT_FOUND);
      const r = await req('/econ/taxi/cancel', { method: 'POST', body: { holdId: String(holdId || '') } });
      if (r.ok) { await afterWrite('refund'); return okR({ balance: r.data.balance }); }
      return r;
    },

    async listShopItems() {
      await fresh();
      const r = await req('/econ/shop');
      return r.ok && Array.isArray(r.data?.items) ? r.data.items : [];
    },
    async getShopGoal() {
      await fresh();
      if (isGuest()) return null;
      const r = await req('/econ/shop');
      return r.ok ? (r.data?.goal ?? null) : null;
    },
    async purchase(itemId) {
      await fresh();
      if (isGuest()) return guestErr();
      const r = await req('/econ/shop/buy', { method: 'POST', body: { itemId } });
      if (r.ok) {
        signal('bw:econ-owned', { itemId: r.data?.item?.id || itemId }); // 재접속 없이 바로 타도록(room.js gifts_sync)
        await afterWrite('purchase');
      }
      return r;
    },

    async getKarma() {
      await fresh();
      const r = await req('/econ/karma'); // 게스트도 서버가 칭호 사다리·업적 목록(잠김)을 준다
      return r.ok ? r.data : { ...guestKarma(), guest: isGuest() };
    },
    async getWelcome() {
      await fresh();
      const r = await req('/econ/welcome'); // 게스트: 연동하면 받을 지급 미리보기
      return r.ok ? r.data : { ...guestWelcome(), guest: isGuest() };
    },
    async claimWelcome() {
      await fresh();
      if (isGuest()) return guestErr();
      const r = await req('/econ/welcome', { method: 'POST', body: {} });
      if (r.ok) await afterWrite('welcome');
      return r;
    },

    on(ev, cb) { start(); return bus.on(ev, cb); },
    off(ev, cb) { bus.off(ev, cb); },

    // ── 서버 클라이언트 전용(계약 밖) ──
    /** 지금 상태를 다시 읽고 바뀐 것을 이벤트로 */
    refresh: (opt) => refresh(opt),
    /** registerGoogleSignIn 에 넘기는 함수: 로그인 창 → /auth/google → session 이벤트. { name, email } | null */
    async signInWithGoogle() {
      await ready;
      if (!enabled) return null;
      const startedAt = now() - 5000;
      let r = null;
      try {
        const m = await import('../../account/signin.js');
        r = await m.googleSignIn({ deviceId: o.deviceId?.() });
        if (!r?.ok) return null;
        S.lastId = 0;
        await refresh({ sinceAt: startedAt });
        if (r.link?.status !== 'linked_to_other_account') m.adoptPrimary(r.primaryUserId);
      } catch { return null; }
      return { name: r.account?.name || null, email: r.account?.email || null };
    },
    async signOut() {
      const r = await req('/auth/logout', { method: 'POST', body: { all: false } });
      await refresh().catch(() => {});
      return r.ok ? okR({}) : r;
    },
    stop() { if (S.timer) clearInterval(S.timer); S.timer = null; },
  };

  // Google 로그인 훅(#28 src/ui-v2/google.js) · 탑승 결제 다리(src/ride/fare.js) — 계정 기능이 켜졌을 때만
  ready.then(async () => {
    if (!enabled) return;
    if (o.autoRegister !== false) {
      try { (await import('../google.js')).registerGoogleSignIn(() => client.signInWithGoogle()); } catch {}
    }
    if (o.rideBridge !== false) {
      try { (await import('../../ride/fare.js')).setPaymentProvider(rideProvider(client, () => S.mode, { emit: (ev) => bus.emit('payment', ev), alias: (c) => S.config?.aliases?.[c] || c }), { always: true }); } catch {}
    }
  });

  return client;
}

/**
 * 게임 탑승(src/ride: charge('bus.base' | 'taxi.*')) → 서버 결제. 무료 모드는 기다리지 않는다(기록만 뒤에서) — 탑승이 느려지지 않게.
 * 유료 모드는 결과를 기다리고, 실패하면 탑승을 막는다.
 *   실패 반환: { ok:false, error:{ code, need?, balance?, shortBy? } } (fare.js 가 error=코드 문자열 + errorInfo=객체로 펼침)
 *   실패 이벤트: emit(PaymentFailed) — 'payment' 이벤트에 status 'insufficient'(잔액 부족) | 'failed'(그 밖) 를 실어 보낸다.
 *     { status, ok:false, receiptId:null, mode, code, rideId, need?, balance?, shortBy?, error }
 *     게임 탑승에서만 낸다(UI 가 payFare/holdTaxi 를 직접 부른 경우는 Result 로만 알림 → 08c 가 두 번 뜨지 않게).
 */
export function rideProvider(client, getMode, { emit = null, alias = (c) => c } = {}) {
  return async (req) => {
    const taxi = req.mode === 'taxi';
    const rideId = `ride-${Date.now().toString(36)}-${Math.floor(Math.random() * 1679616).toString(36)}`;
    const run = async () => {
      if (!taxi) return client.payFare({ mode: req.mode, code: req.code, rideId, meta: req.meta?.to ? { where: String(req.meta.to).slice(0, 40) } : undefined });
      const meters = Math.max(0, Math.round(Number(req.meta?.meters) || 0));
      const h = await client.holdTaxi({ code: req.code, estimateMeters: meters, rideId });
      if (!h.ok) return h;
      // 게임 택시는 경로가 정해진 뒤 결제(경로 길이 = 실제 거리) → 바로 정산
      return client.settleTaxi({ holdId: h.data.holdId, actualMeters: meters });
    };
    if (!getMode().transitPaid) { run().catch(() => {}); return { ok: true, amount: 0, free: true }; }
    const r = await run().catch(() => errR(ERR.NETWORK));
    if (!r.ok) {
      const error = { ...(r.error || {}), code: r.error?.code || ERR.NETWORK };
      const insufficient = error.code === ERR.INSUFFICIENT;
      const ev = { status: insufficient ? 'insufficient' : 'failed', ok: false, receiptId: null, mode: req.mode, code: alias(req.code), rideId, error };
      if (insufficient) Object.assign(ev, { need: error.need, balance: error.balance, shortBy: error.shortBy });
      try { emit?.(ev); } catch {}
      return { ok: false, error };
    }
    return { ok: true, receiptId: r.data.receiptId, amount: taxi ? r.data.charged : r.data.amount, free: !!r.data.free };
  };
}
