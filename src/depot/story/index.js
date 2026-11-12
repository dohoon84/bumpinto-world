// [depot-story] 스토리 모드 (depot-story v0.4) — 첫 입장 모드 선택(스토리/자유), 1일차 대본(day1-script) + 사건 E01, 반응 R01–R50,
//   나가기·놓침·돌아옴 규칙(exit-rules), 소리 신호(audio-cues), 손님 NPC 일차별 등장. interior.js 가 매장 생성 뒤 지연 import.
//   저장: localStorage 'bw.depot.story.v1' (일차·본 대사·단골도·활기·도장·사건 상태·반응 횟수·어제 기록). 서버 저장 없음.
//   URL: ?depotMode=story|free|ask(모드 다시 고르기) · ?depotStoryReset=1(저장 지움) · shot=1 이면 depotMode 없을 때 자유+반응 끔(스샷 고정).
import { laneX, CO } from '../checkout.js';
import DAY1 from './data/day1-script.json';
import DAY2 from './data/day2-script.json';
import DAY3 from './data/day3-script.json';
import TARGETS from './data/targets.json';
import EVENTS from './data/events.json';
import EXIT from './data/exit-rules.json';
import NPCT from './data/npc-types.json';
import { createVN } from './vn.js';
import { createReactions } from './reactions.js';
import { createStorySfx } from './sfx.js';
import { cashierAt } from './cashiers.js';
import { createProps, spySilhouette, nextDayArt } from './props.js';

const KEY = 'bw.depot.story.v1';
const SCRIPTS = { 1: DAY1, 2: DAY2, 3: DAY3 }; // 대본이 있는 날 (v0.5: 1–3일차)
const LINES = Object.fromEntries([...DAY1, ...DAY2, ...DAY3].map((l) => [l.id, l]));
const DAY_START = { 1: 'd1_000', 2: 'd2_000', 3: 'd3_000' };
const DAY_MAIN = { 1: 'E01', 2: 'E02', 3: 'E03' }; // 하루 끝 도장·활기 기준 사건
const DAY_FLAGS = { 2: ['d2Sticker'] };
const REVEAL_DAY = 5; // 수상한 손님 정체(이름·가게)는 5일차 전에는 절대 안 보임
const CUT_ON = { d2_143: () => spySilhouette() }, CUT_OFF = new Set(['d2_146', 'd2_147', 'd2_148', 'd2_150']);
const PORTRAIT = { beomsuk: 'beomsuk', beomi: 'beomi', halmeoni: 'halmeoni', spy: 'spy', cashier: 'kimmiso' };
const NAMES = { beomsuk: ['한범숙 주임', '매장 주임'], beomi: ['범이', '수습 알바'], halmeoni: ['말순 할머니', '시식 코너'], spy: ['수상한 손님', '???'], pa: ['방송실 점장', '방송 중'], me: ['나', ''], cashier: ['계산원 김미소', '계산대 07'] };
const SPY_REVEALED = ['반기철', '싹쓸마트'];
const NPC_NAME = Object.fromEntries((NPCT.types || []).map((t) => [t.id, t.name]));
const EGG_TOWER = { x: 55.0, z: 28.6 }; // 통로 A '계란·유제품' 걸이 사인(53.9, 28) 아래, 랙 쪽에 붙임
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function loadSave() {
  const q = new URLSearchParams(location.search);
  if (q.get('depotStoryReset') === '1') { try { localStorage.removeItem(KEY); } catch { /* */ } }
  let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
  const o = Object.assign({ v: 1, mode: null, settings: { reactionFreq: 3, textSpeed: '보통', skipSeenOnly: false }, day: 1, seen: {}, aff: { beomsuk: 0, beomi: 0, halmeoni: 0, spy: 0 }, vitality: 12, stamps: 0, ev: {}, intro: {}, counts: {}, today: {}, once: {}, yesterday: null, left: null, lastVisit: 0, todayKey: '', missed: null, best: {}, flags: {}, cleared: {}, beat: null, beatDay: null, replay: null }, s);
  if (!o.v2) { // v0.4 저장 옮기기: 1일차 중간이면 체크포인트로
    o.v2 = 1;
    if (o.day === 1 && o.intro?.[1] && !o.beat) { o.beat = o.ev.E01 && o.ev.E01 !== 'active' ? (o.ev.E01 === 'missed' ? 'd1_161' : 'd1_040') : 'd1_032'; o.beatDay = 1; }
    if (o.day >= 2) o.cleared[1] = 1;
  }
  return o;
}

export function createStory(ctx) {
  const { THREE, scene, keep, camera, st, items, loadKg, staff, checkout, shoppers, api, audio, isMobile, ASSET, getLevel } = ctx;
  const guide = ctx.guide || { set() {}, setHidden() {}, arrive() {}, dist: () => 0, target: null };
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot') === '1';
  const save = loadSave();
  const session = { noPersist: false };
  const forced = q.get('depotMode');
  if (forced === 'story' || forced === 'free') save.mode = forced;
  else if (forced === 'ask') save.mode = null;
  else if (shot) { session.noPersist = true; session.mode = 'free'; session.freq = 0; }
  let alive = true;
  const persist = () => { if (session.noPersist) return; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* 저장 공간 없음 */ } };
  // 하루 바뀜(실제 날짜) → 오늘 기록 초기화
  const tk = dayKey(); if (save.todayKey !== tk) { save.today = {}; save.todayKey = tk; }
  const mode = () => session.mode || save.mode || 'free';
  const curDay = () => save.replay || save.day;
  const nameOf = (who) => (who === 'spy' && curDay() >= REVEAL_DAY ? SPY_REVEALED : NAMES[who] || [who, '']);
  const lineOk = (who, line) => curDay() >= REVEAL_DAY || !/반기철|싹쓸마트/.test(String(line)); // 정체 대사 막기
  const props = createProps({ THREE, scene, keep, cartObj: ctx.cartObj || scene, items });
  const art = { nextDay: (d) => nextDayArt(d) };
  const settings = () => save.settings;

  const sfx = createStorySfx({ audio, getLevel });
  const vn = createVN({ assetBase: ASSET, isMobile, getSettings: settings, onCue: (n) => sfx.cue(n), onLock: (on) => { lock.vn = on; sfx.duck(on); } });
  const lock = { vn: false };
  const face = (who) => `${ASSET}story/face-${who.startsWith('npc:') ? `npc-${who.slice(4)}` : PORTRAIT[who] || who}.webp`;

  // ---------- 반응 전달: 말풍선(화면 안 + 14 m) 또는 왼쪽 토스트 ----------
  const bubbles = [];
  const v3 = new THREE.Vector3();
  function speakerPos(who) {
    if (who === 'beomsuk' && staff?.root) return staff.root.position;
    if (who.startsWith('npc:') || who === 'spy') { const n = shoppers?.list.find((x) => x.id === (who === 'spy' ? 'spy' : who.slice(4)) && x.active); if (n) return { x: n.x, y: 0, z: n.z }; }
    return null;
  }
  function project(p, y = 2.2) {
    v3.set(p.x, y, p.z); const d = v3.distanceTo(camera.position); v3.project(camera);
    if (v3.z > 1 || Math.abs(v3.x) > 0.95 || Math.abs(v3.y) > 0.95 || d > 14) return null;
    return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight };
  }
  function deliver({ r, line, speaker }) {
    const who = r.who;
    const ms = Math.min(5000, 2400 + line.length * 40);
    let name = who.startsWith('npc:') ? NPC_NAME[who.slice(4)] || '손님' : nameOf(who)[0];
    let fc = face(who);
    if (who === 'cashier') { const c = cashierAt(Math.max(0, checkoutState().lane)); name = `계산원 ${c.name}`; fc = c.id === 'cashier' ? face('cashier') : ''; }
    if (speaker?.name) name = speaker.name;
    const pos = speakerPos(who);
    const sp = pos && !touchHeld() ? project(pos) : null; // 모바일에서 3초 넘게 조작 중이면 토스트만
    if (sp && who !== 'pa') { const b = vn.bubble({ x: sp.x, y: sp.y, name, text: line, ms }); bubbles.push({ b, pos, y: 2.2 }); }
    else vn.toast({ face: fc, name, text: line, ms, pa: who === 'pa' });
    if (who === 'pa') sfx.cue('pa-ding');
  }
  let touchT = 0; const touchHeld = () => touchT > 3;
  const reactions = createReactions({
    save, getMode: mode, getDay: () => curDay(), lineOk, getFreq: () => session.freq ?? save.settings.reactionFreq,
    deliver: (x) => { deliver(x); if (!session.noPersist) persist(); }, cue: (n) => sfx.cue(n),
  });
  const hits = []; { const f0 = reactions.fire; reactions.fire = (id, o) => { if (hits.length < 200) hits.push(id); return f0(id, o); }; } // 트리거 기록(테스트용 _dbg.hits)

  // ---------- 이벤트 입력: 오디오 신호(interior 의 audio 탭) + 계산대 depot:sfx ----------
  const waiters = { done: [] };
  const flags = { grabbed: false, lastPick: null, paid: false };
  function onAudio(name, opts = {}) {
    if (!alive) return;
    if (name === 'cart-grab' && !flags.grabbed) { flags.grabbed = true; if (curDay() === 1) reactions.fire('R10'); }
    if (name === 'item-pick') {
      const pid = opts.product?.id; flags.lastPick = pid;
      if (pid === 'melon') flags.melonPick = true;
      if (shoppers?.near('sale-hunter', st.me.x, st.me.z, 3)) reactions.fire('R19', { force: false });
    }
    if (name === 'item-place' && (opts.away || 0) > 8) reactions.fire('R15'); // 원래 진열대에서 8 m 넘게 떨어진 바닥에 내려놓음
    if (name === 'item-place' && curDay() >= 2 && save.yesterday?.receipt?.length) {
      const pid = opts.product?.id; if (pid && save.yesterday.receipt.includes(pid)) reactions.fire('R50');
    }
    if (name === 'item-putback' && opts.product?.id === 'melon' && flags.melonPick) { flags.melonPick = false; flags.melonBack = (flags.melonBack || 0) + 1; if (flags.melonBack >= 2) { flags.melonBack = 0; reactions.fire('R37'); } } // 수박 집었다 내려놓기 2번
    // v0.5 반응 · E14 스티커
    const m = mission;
    if (name === 'item-place' && m && m.id === 'E14' && !m.result) {
      const pid = opts.product?.id, wi = m.wps.findIndex((w) => w.item === pid);
      if (wi >= 0 && !m.stickered.has(pid)) { const it = [...items].reverse().find((x) => x.p.id === pid); if (it) { props.stick(it); m.stickered.add(pid); props.hideShelfSticker(wi); sfx.cue('sticker-peel'); arrived(); updateChip(true); } }
    }
    if (name === 'item-place' && (opts.kg || opts.product?.kg || 0) >= 10) { // R52 범란 판 위에 무거운 것
      const top = items[items.length - 1];
      if (top && top.body) { const p = top.body.position; if (items.some((x) => x !== top && x.p.id === 'egg' && x.body && Math.abs(x.body.position.x - p.x) < 0.3 && Math.abs(x.body.position.z - p.z) < 0.3 && x.body.position.y < p.y)) reactions.fire('R52'); }
    }
    if (name === 'item-putback' && m && m.id === 'E14' && m.wps.some((w) => w.item === opts.product?.id)) reactions.fire('R54');
    if (name === 'cart-bump' && curDay() >= 3 && shoppers?.near('spy', st.me.x, st.me.z, 1.5)) reactions.fire('R55');
    if (name === 'cart-release' && flags.paid && st.cart.x > 74 && st.cart.x < 82 && st.cart.z < 10) reactions.fire('R09');
  }
  function onSfx(e) {
    const d = e.detail || {}; if (!alive) return;
    if (d.name === 'checkout.start') onCheckoutStart();
    else if (d.name === 'checkout.done') { flags.paid = true; onCheckoutDone(); }
    else if (d.name === 'checkout.box.take') reactions.fire('R42');
    else if (d.name === 'checkout.pay') reactions.fire('R43');
    else if (d.name === 'checkout.receipt.check') reactions.fire('R44');
  }
  window.addEventListener('depot:sfx', onSfx);
  // 방송실 안내 방송 문구(index.js showPa → depot:pa): 특가·반값·타임세일이면 3초 뒤 할인 사냥꾼 질주 + R29
  let paTimer = 0;
  function onPa(e) {
    const text = e.detail?.text || ''; if (!alive) return;
    reactions.paNow();
    if (/반값|특가|타임세일|할인/.test(text) && shoppers?.list.some((n) => n.id === 'sale-hunter' && n.active)) {
      clearTimeout(paTimer); paTimer = setTimeout(() => { if (!alive) return; shoppers.rush?.('sale-hunter', 9); reactions.fire('R29'); }, 3000);
    }
  }
  window.addEventListener('depot:pa', onPa);
  const checkoutState = () => { try { return checkout.dbg.state(); } catch { return { phase: 'idle', lane: -1 }; } };

  // ---------- 대본 실행 (일차별 대본 · 체크포인트 저장) ----------
  //   하루 진행은 save.beat(체크포인트 노드)로 저장: scene.start · roam · mission.start · 사건 결과(resume) · scene.checkout · 계산 뒤 첫 노드.
  //   나가면 그 자리에서 멈춤(벌칙 없음) → 다시 들어오면 '이어서 하기 / 처음부터' 카드. 일차는 day.end 를 끝까지 봐야만 넘어감.
  let running = false, talking = false, runTok = 0;
  const lineView = (L) => {
    const sp = L.speaker;
    const who = PORTRAIT[sp] ? PORTRAIT[sp] : null;
    const [name, title] = L.nameTag ? [L.nameTag, ''] : nameOf(sp);
    return { who, name, title, expression: L.expression, pos: L.pos, enter: L.enter, text: L.text, emph: L.emph, fx: L.fx, pa: sp === 'pa', me: sp === 'me', narr: sp === 'narration', seen: !!save.seen[L.id] };
  };
  const motifDone = new Set();
  const CHECKPOINT = new Set(['scene.start', 'roam', 'mission.start', 'scene.checkout']);
  function setBeat(id) { if (!id) return; save.beat = id; save.beatDay = curDay(); persist(); }
  function applySet(set) {
    for (const [k, v] of Object.entries(set || {})) { const [a, b] = k.split('.'); if (a === 'aff') save.aff[b] = Math.min(5, (save.aff[b] || 0) + v); else if (a === 'flag') save.flags[b] = v; }
  }
  function branchValue(on) { // ev.E01 · flag.d2Sticker · mission.E02.result
    const [a, b] = String(on || '').split('.');
    if (a === 'ev' || a === 'mission') { const v = save.ev[b]; return v === 'active' ? undefined : v; }
    if (a === 'flag') return save.flags[b];
    return undefined;
  }
  const fixCue = (n) => (n === 'pa-chime' ? 'pa-ding' : n); // 대본 방송은 대화창 안 — audio 의 pa-chime 은 안내 상자까지 띄움
  async function runFrom(id) {
    const tok = ++runTok; running = true; let cur = id;
    try {
      while (cur && alive && tok === runTok) {
        const L = LINES[cur]; if (!L) { console.warn('[depot-story] no line', cur); break; }
        if (CHECKPOINT.has(L.cmd)) setBeat(cur);
        if (L.bgm) sfx.bgm(L.bgm);
        cutFor(L.id);
        if (L.choices) { talking = true; const i = await vn.choose(L.choices); const c = L.choices[i]; applySet(c.set); save.seen[cur] = 1; persist(); cur = c.goto; continue; }
        if (L.cmd === 'scene.start') { talking = false; vn.close(); await dayStart(L); cur = L.next; continue; }
        if (L.cmd === 'sfx') { sfx.cue(fixCue(L.sfx)); await sleep(vn.skipping ? 80 : 450); cur = L.next; continue; }
        if (L.cmd === 'branch') { const v = branchValue(L.on); cur = (v != null && L.cases[String(v)]) || L.default || L.cases.partial || Object.values(L.cases)[0]; continue; }
        if (L.cmd === 'roam') { talking = false; vn.close(); save.seen[cur] = 1; cur = await roam(L); if (tok !== runTok) return; continue; }
        if (L.cmd === 'mission.start') { talking = false; vn.close(); save.seen[cur] = 1; cur = await startMission(L); if (tok !== runTok) return; continue; }
        if (L.cmd === 'scene.checkout') { talking = false; vn.close(); cur = await waitCheckout(L); if (tok !== runTok) return; continue; }
        if (L.cmd === 'day.end') { talking = false; vn.close(); await endDay(L); return; }
        if (L.sfx) sfx.cue(fixCue(L.sfx));
        if (L.speaker === 'pa' || L.cmd === 'pa') sfx.cue('pa-ding');
        if (PORTRAIT[L.speaker] && !motifDone.has(L.speaker)) { motifDone.add(L.speaker); sfx.cue(`motif.${L.speaker === 'cashier' ? 'beomi' : L.speaker}`); }
        if (L.text) { talking = true; await vn.say(lineView(L)); }
        save.seen[cur] = 1; cur = L.next;
      }
    } finally { if (tok === runTok) { running = false; talking = false; vn.close(); vn.cutIn(null); } persist(); }
  }
  // 2일차 끝 유리문 컷(보라 모자 실루엣 — 자리 표시 그림)
  function cutFor(id) {
    if (CUT_ON[id]) vn.cutIn(CUT_ON[id]());
    else if (CUT_OFF.has(id)) vn.cutIn(null);
  }
  async function dayStart(L) {
    flags.paid = false; flags.grabbed = flags.grabbed || st.hasCart; reactions.setEventCast(null);
    if (L.sfx) sfx.cue(L.sfx);
    await vn.dayCard({ day: L.day, title: L.title, subtitle: L.subtitle, missed: save.missed?.name });
    if (save.missed) {
      const ml = EXIT.ignoreEvent.missedLines?.[save.missed.id] || EVENTS.events.find((e) => e.id === save.missed.id)?.missedLines || {}; const who = Object.keys(ml)[0];
      if (who) vn.toast({ face: face(who), name: nameOf(who)[0], text: ml[who], ms: 4200 });
      save.missed = null; persist();
    }
    if (L.day >= 2 && save.yesterday) setTimeout(() => alive && reactions.fire('R49', { vars: { eggsYesterday: save.yesterday.eggs ?? 0, kgYesterday: save.yesterday.kg ?? 0 } }), 5000);
  }
  /** scene.checkout: 이번 방문에 이미 계산했으면 바로, 아니면 계산대 안내 → 계산 끝날 때까지 */
  async function waitCheckout(L) {
    if (checkoutState().phase === 'done') flags.paid = true; // 사건 중에 이미 계산을 끝냈으면 다시 계산시키지 않음
    if (!flags.paid) {
      job = { kind: 'checkout', L, t0: now() };
      updateChip(true);
      await new Promise((r) => waiters.done.push(r));
      job = null; guide.set(null); updateChip(true);
      if (!alive) return null;
    }
    setBeat(L.next); await sleep(600);
    return L.next;
  }

  // ---------- 목표 위치 (targets.json) ----------
  const TG = Object.fromEntries((TARGETS.targets || []).map((t) => [t.id, t]));
  const ARRIVE = { 'sample-corner': { ax: 10.6, az: 37.6, r: 3.0, y: 2.6 }, 'timesale-endcap': { y: 2.6 } }; // 시식대 동쪽 통로에서 멈춤
  const CORRAL = { id: 'corral', label: '카트 보관소 (출입구 옆)', x: 78, z: 5.8, ax: 72.6, az: 6.2, r: 2.6, y: 2.4 };
  function target(id) {
    if (id === 'checkout') return checkoutTarget();
    if (id === 'lane-07') return { id, label: '계산대 07 (계산원 김미소)', x: laneX(6) + 0.15, z: 9.6, ax: laneX(6) + 0.15, az: 10.4, r: 1.8, y: 2.5 };
    const t = TG[id]; if (!t) return null;
    const o = ARRIVE[id] || {};
    return { id, label: t.label, x: t.x, z: t.z, ax: o.ax ?? t.x, az: o.az ?? t.z, r: o.r || t.r || 2.5, y: o.y || 2.4 };
  }
  function checkoutTarget() { // 플레이어용 유인 계산대(04·09) 중 가까운 곳
    const free = CO.STAFFED.filter((k) => !CO.NPC_LANES.includes(k));
    const k = free.reduce((b, j) => (Math.abs(laneX(j) - st.me.x) < Math.abs(laneX(b) - st.me.x) ? j : b), free[0]);
    return { id: 'checkout', label: `계산대 ${String(k + 1).padStart(2, '0')}`, x: laneX(k) + 0.15, z: 9.6, ax: laneX(k) + 0.15, az: 12.2, r: 1.6, y: 2.5, lane: k };
  }
  const meNear = (t, r = t.r) => Math.min(Math.hypot(st.me.x - t.ax, st.me.z - t.az), st.hasCart ? Math.hypot(st.cart.x - t.ax, st.cart.z - t.az) : 1e9) < r;
  const inCheckoutZone = () => st.me.x > 14 && st.me.x < 54 && st.me.z > 5 && st.me.z < 13;
  const cartHas = (id) => items.reduce((n, it) => n + (it.p.id === id ? 1 : 0), 0);
  const now = () => performance.now() / 1000;
  const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  // ---------- roam (자유 장보기 구간) ----------
  let job = null; // 지금 안내 중인 일: {kind:'roam'|'checkout', L, t0, ...}
  const ROAM_EVENT = { d2_025: 'E02', d3_037: 'E03' };
  function roam(L) {
    return new Promise((resolve) => {
      job = { kind: 'roam', L, t0: now(), timed: 0, recalled: false, resolve, tg: L.target ? target(L.target) : null };
      updateChip(true);
    });
  }
  function finishJob(next, missedEv) {
    const j = job; if (!j) return; job = null; guide.set(null); updateChip(true);
    if (missedEv) markMissed(missedEv);
    setBeat(next); j.resolve(next);
  }
  function markMissed(id) {
    const ev = EVENTS.events.find((e) => e.id === id);
    save.ev[id] = 'missed'; save.missed = { id, name: ev?.name || id }; persist();
  }
  function deliverTimed(tl) {
    if (tl.sfx && tl.speaker !== 'pa') sfx.cue(tl.sfx);
    if (tl.speaker === 'pa') { if (/연습 방송/.test(tl.text)) det.paFake = now(); try { audio?.play('pa-chime', { text: tl.text.replace(/[「」]/g, '') }); } catch { /* */ } return; }
    const who = tl.speaker, nm = tl.nameTag || nameOf(who)[0];
    vn.toast({ face: who === 'cashier' ? face('cashier') : face(who), name: nm, text: tl.text, ms: Math.min(5200, 2600 + tl.text.length * 45) });
    sfx.cue('toast-pop');
  }
  function tickTimed(o, t) { const T = o.L.timed || []; while (o.timed < T.length && t >= T[o.timed].t) deliverTimed(T[o.timed++]); }
  function tickJob() {
    const j = job; if (!j) return;
    const t = now() - j.t0;
    if (j.kind === 'checkout') { guide.set(checkoutState().phase !== 'idle' ? null : st.hasCart ? checkoutTarget() : CORRAL); return; }
    tickTimed(j, t);
    const L = j.L;
    if (j.tg) guide.set(j.tg);
    if (L.until?.near && j.tg && meNear(j.tg)) { arrived(); finishJob(L.next); return; }
    if (L.until?.sec && t >= L.until.sec) { finishJob(L.next); return; }
    if (j.tg && !j.recalled && (t > 90 || inCheckoutZone())) { j.recalled = true; recall(L.recall || '손님! 한 번만 와 주세요!'); }
  }
  function recall(text) { sfx.cue('recall-call'); vn.shakeChip(); vn.toast({ face: face('beomi'), name: '범이', text, ms: 4000 }); }
  function arrived() { guide.arrive(); sfx.cue('arrive'); }

  // ---------- 사건 (mission.start) ----------
  let mission = null, tower = null;
  function buildTower() {
    if (tower) { tower.visible = true; tower.userData.trays.forEach((t) => { t.visible = true; }); return; }
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#e9d3a8'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#d8bd8a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(11 + i * 21, 34, 8, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#7a4b12'; g.font = '900 13px sans-serif'; g.fillText('범란 30구', 34, 14); return c; })());
    tex.colorSpace = THREE.SRGBColorSpace; keep(tex);
    const m = keep(new THREE.MeshLambertMaterial({ map: tex })), pal = keep(new THREE.MeshLambertMaterial({ color: 0x9a7a4a }));
    tower = new THREE.Group(); tower.name = 'story-egg-tower';
    const base = new THREE.Mesh(keep(new THREE.BoxGeometry(0.9, 0.14, 0.9)), pal); base.position.y = 0.07; tower.add(base);
    const g = keep(new THREE.BoxGeometry(0.32, 0.075, 0.32));
    tower.userData.trays = [];
    for (let i = 0; i < 12; i++) { const t = new THREE.Mesh(g, m); t.position.set((i % 2 ? 0.015 : -0.012) * (i / 4), 0.18 + i * 0.077, (i % 3 - 1) * 0.008 * i / 3); t.rotation.y = (i % 4) * 0.06; tower.add(t); tower.userData.trays.push(t); }
    tower.position.set(EGG_TOWER.x, 0, EGG_TOWER.z); scene.add(tower);
  }
  function startMission(L) {
    const id = L.event, ev = EVENTS.events.find((e) => e.id === id) || { id, name: id };
    save.ev[id] = 'active'; persist();
    return new Promise((resolve) => {
      const m = mission = {
        id, ev, L, resolve, t0: now(), recalled: false, result: null, timed: 0, arrivedIdx: -1,
        resolveKind: L.resolve || (id === 'E01' ? 'checkout' : 'arrive'), limit: L.timeLimitSec || ev.tuning?.timeLimitSec || 0,
        base: { eggs: staff.S.eggsToday, floor: staff.S.floorDrops, rams: staff.S.rams }, taken: false, brakes: 0, near6: false,
        wps: (L.waypoints || ev.waypoints || []).filter((w) => w.item), final: target(L.target || ev.target),
        n0: { ramen: cartHas('ramen') }, stickered: new Set(), remaining: ev.tuning?.boxesOnPallet || 8, rivalT: 0,
      };
      if (id === 'E01') { buildTower(); sfx.cue('item-wobble', { pos: { x: EGG_TOWER.x, y: 1, z: EGG_TOWER.z } }); }
      if (id === 'E13') props.tray(true);
      if (id === 'E14') props.shelfStickers(m.wps.map((w) => target(w.target)));
      if (id === 'E03') { shoppers?.rush?.('sale-hunter', 14); shoppers?.stage?.('spy', 46.0, 45.4, Math.PI / 2, 25); sfx.cue('motif.spy'); }
      vn.missionCard(ev); updateChip(true);
      reactions.setEventCast(ev.cast || []);
    });
  }
  function endMission(result, next) {
    const m = mission; if (!m || m.result) return;
    m.result = result; save.ev[m.id] = result; if (result === 'missed') save.missed = { id: m.id, name: m.ev.name };
    sfx.cue(result === 'success' ? 'stinger.success' : result === 'fail' ? 'stinger.comicfail' : result === 'missed' ? 'missed-stamp' : 'stinger.partial');
    reactions.setEventCast(null);
    if (m.id === 'E01' && tower && result === 'missed') tower.visible = false;
    if (m.id === 'E13') props.tray(false, result === 'fail');
    if (m.id === 'E14') props.shelfStickers(null);
    mission = null; guide.set(null); updateChip(true);
    setBeat(next); persist();
    m.resolve(next);
  }
  const resumeOf = (m) => m.L.resume || m.L.next;
  // 사건별 다음 목표
  function stopOf(m) {
    if (!st.hasCart) return { ...CORRAL, step: '먼저 카트' };
    if (m.id === 'E01') return m.taken ? { ...checkoutTarget(), step: '계산대까지 살살' } : { ...target('aisle-01-eggs'), label: '흔들리는 범란 탑 (통로 01)' };
    if (m.id === 'E14') { for (let i = 0; i < m.wps.length; i++) { const w = m.wps[i]; if (!m.stickered.has(w.item)) return { ...target(w.target), label: w.label || w.item, step: `${m.stickered.size + 1}/${m.wps.length}`, wi: i }; } return { ...m.final, step: '주임님께' }; }
    if (m.id === 'E03') return { ...m.final, label: '특가 매대 (범라면 40봉)' };
    for (let i = 0; i < m.wps.length; i++) { const w = m.wps[i]; if (cartHas(w.item) < (w.n || 1)) return { ...target(w.target), label: w.label || w.item, step: `${i + 1}/${m.wps.length}`, wi: i }; }
    return m.final ? { ...m.final, step: m.wps.length ? '배달' : '' } : null;
  }
  function takeTower() {
    const m = mission; m.taken = true; m.base = { ...m.base, eggs: staff.S.eggsToday, floor: staff.S.floorDrops };
    for (let i = 0; i < 5; i++) { try { api._dbg.drop('egg', 'upper', 0, 0.05, 0, false); } catch (e) { console.warn('[story] egg drop', e); } }
    tower.userData.trays.forEach((t) => { t.visible = false; });
    vn.toast({ face: face('beomi'), name: '범이', text: '하나, 둘, 셋! 다섯 판 받았어요! 나머지는 제가 내릴게요. 살살이요!', ms: 4200 });
    sfx.cue('achievement'); arrived(); updateChip(true);
  }
  function evalE01(m) {
    const broken = Math.max(0, staff.S.eggsToday - m.base.eggs);
    const inCart = cartHas('egg'), missing = Math.max(0, 5 - inCart);
    return broken >= 11 || missing >= 3 ? 'fail' : broken >= 4 || missing > 0 ? 'partial' : 'success';
  }
  function evalE02(m, t) {
    const broken = Math.max(0, staff.S.eggsToday - m.base.eggs);
    const riceFloor = (api._dbg.floorIds?.() || []).includes('rice') && staff.S.floorDrops > m.base.floor;
    if (riceFloor) return 'fail';
    return t > (m.limit || 240) || broken > 0 ? 'partial' : 'success';
  }
  function evalE13(m) { const rams = staff.S.rams - m.base.rams; return m.trayDown ? 'fail' : rams > 0 || m.brakes >= (m.ev.tuning?.hardBrakeWarn || 3) ? 'partial' : 'success'; }
  function evalE14(m, t) { const rams = staff.S.rams - m.base.rams; return m.stickered.size < m.wps.length ? 'fail' : t <= (m.ev.tuning?.goodTimeSec || 150) && rams === 0 ? 'success' : 'partial'; }
  function boxesE03(m) { return Math.max(0, cartHas('ramen') - m.n0.ramen); }
  function evalE03(m) { const b = boxesE03(m); return b >= 2 ? 'success' : b === 1 ? 'partial' : m.near6 ? 'fail' : 'missed'; }
  function tickMission(dt) {
    const m = mission; if (!m || m.result) return;
    const t = now() - m.t0;
    tickTimed(m, t);
    const s = stopOf(m); m.stop = s;
    guide.set(s);
    // 지금 목표에 처음 닿으면 반짝 (진열대 · 최종 목표)
    const sk = s ? `${s.id}:${s.wi ?? ''}` : ''; if (s && s.id !== 'corral' && sk !== m.arrivedKey && meNear(s)) { m.arrivedKey = sk; if (s !== m.final) arrived(); }
    const engaged = m.taken || m.stickered.size > 0 || m.wps.some((w) => cartHas(w.item) > 0) || m.near6 || m.id === 'E13';
    if (!m.recalled && !engaged && (t > 90 || inCheckoutZone())) { m.recalled = true; recall(EXIT.ignoreEvent.recallLines?.[m.id] || m.ev.recallLine || '손님! 한 번만 와 주세요!'); }
    if (m.id === 'E01') {
      if (!m.taken && st.hasCart && Math.hypot(st.cart.x - EGG_TOWER.x, st.cart.z - EGG_TOWER.z) < 2.6 && !lock.vn) takeTower();
    } else if (m.id === 'E02') {
      if (det.kg >= 60) reactions.fire('R51');
      if (m.wps.every((w) => cartHas(w.item) >= (w.n || 1)) && meNear(m.final)) { arrived(); endMission(evalE02(m, t), resumeOf(m)); }
    } else if (m.id === 'E13') {
      if (!m.trayDown && st.hasCart && props.trayOn()) {
        const sp = Math.hypot(st.cart.vx, st.cart.vz), dv = (m.lastSp ?? sp) - sp; m.lastSp = sp;
        if (dv > 0.55 && sp + dv > 1.0) { m.brakes++; reactions.fire('R53'); sfx.cue('item-wobble', { pos: { x: st.cart.x, y: 1, z: st.cart.z } }); if (sp + dv > 2.1 || m.brakes >= 6) { m.trayDown = true; props.tray(false, true); vn.toast({ face: face('beomi'), name: '범이', text: '앗, 쟁반이…! 주먹밥 굴러가요!', ms: 3000 }); endMission('fail', resumeOf(m)); return; } }
        if (staff.S.rams - m.base.rams >= 3) { m.trayDown = true; props.tray(false, true); endMission('fail', resumeOf(m)); return; }
      }
      if (meNear(m.final) && st.hasCart) { arrived(); endMission(evalE13(m), resumeOf(m)); }
    } else if (m.id === 'E14') {
      if (m.stickered.size >= m.wps.length && meNear(m.final)) { arrived(); endMission(evalE14(m, t), resumeOf(m)); return; }
      const to = m.L.timeoutSec || m.ev.tuning?.timeoutSec || 240;
      if (t >= to) endMission(m.stickered.size ? 'fail' : 'missed', m.stickered.size ? resumeOf(m) : (m.L.onMissed || resumeOf(m)));
    } else if (m.id === 'E03') {
      const d = Math.hypot(st.me.x - m.final.x, st.me.z - m.final.z); if (d < 6) m.near6 = true;
      m.rivalT += dt; const iv = m.ev.tuning?.rivalGrabIntervalSec || 14; if (m.rivalT >= iv) { m.rivalT -= iv; m.remaining--; if (m.remaining >= 0) sfx.cue('cart-bump', { pos: { x: m.final.x, y: 0.6, z: m.final.z } }); }
      const left = (m.limit || 180) - t;
      if (left < 10 && Math.floor(left) !== m.tickS) { m.tickS = Math.floor(left); sfx.cue('timer-tick'); }
      const b = boxesE03(m);
      if (b >= 2 && d > 6) { endMission('success', resumeOf(m)); return; }
      if (left <= 0 || m.remaining + b <= 0) { const r = evalE03(m); endMission(r, r === 'missed' ? (m.L.onMissed || resumeOf(m)) : resumeOf(m)); }
    }
  }
  let chipT = 0;
  function updateChip(force) {
    const exitOn = guide.target?.id === 'exit' && wantsExitGuide();
    if (mode() !== 'story' && !exitOn) { vn.setChip(null); return; }
    if (!force && (chipT -= 1) > 0) return; chipT = 3;
    const dist = () => Math.round(guide.target ? guide.dist(st.me) : 0);
    if (exitOn) {
      const paid = flags.paid && !items.length ? '' : flags.paid ? ' · 영수증은 출구 직원에게' : items.length ? ' · 담은 상품은 계산하거나 두고 가요' : '';
      vn.setChip(exitReq
        ? { head: '나가는 중', name: '멈춘 곳 저장됨', where: `➜ ${EXIT_T.label} · ${dist()} m`, note: `${isMobile ? '탭' : '클릭'}하면 이야기 계속${paid}`, onTap: cancelExit }
        : { head: '나가는 길', name: flags.paid ? '계산 끝!' : '나가는 곳', where: `➜ ${EXIT_T.label} · ${dist()} m`, note: `입구로는 못 나가요${paid}` });
      return;
    }
    const m = mission;
    if (m && !m.result) {
      const s = m.stop || stopOf(m), t = now() - m.t0;
      let note = '안 가도 괜찮아요';
      if (m.id === 'E01' && m.taken) note = `깨진 알 ${Math.max(0, staff.S.eggsToday - m.base.eggs)}개 · 세 알까지는 범이가 바꿔 줘요`;
      if (m.id === 'E02') note = `${mmss((m.limit || 240) - t)} 안에 · 범란 조심`;
      if (m.id === 'E13') note = `급정거 ${m.brakes}번 · 쟁반 미끄러워요`;
      if (m.id === 'E14') note = `스티커 ${m.stickered.size}/${m.wps.length} · ${mmss((m.L.timeoutSec || 240) - t)}`;
      if (m.id === 'E03') note = `남은 시간 ${mmss((m.limit || 180) - t)} · 내 박스 ${boxesE03(m)} · 매대 ${Math.max(0, m.remaining)}`;
      vn.setChip({ name: m.ev.name, where: s ? `➜ ${s.step ? `${s.step} · ` : ''}${s.label} · ${dist()} m` : '', note });
      return;
    }
    if (job) {
      if (job.kind === 'checkout') { const s = checkoutState(); vn.setChip({ name: '계산하기', where: s.phase !== 'idle' ? '계산 중…' : `➜ ${checkoutTarget().label} · ${dist()} m`, note: '오늘 장보기 마무리' }); return; }
      const L = job.L, left = L.until?.sec ? ` · ${mmss(L.until.sec - (now() - job.t0))}` : '';
      vn.setChip({ name: L.chip || '자유 장보기', where: job.tg ? `➜ ${job.tg.label} · ${dist()} m` : `자유롭게${left}`, note: job.tg ? '천천히 와도 괜찮아요' : '계산하면 오늘 이야기가 넘어가요' });
      return;
    }
    vn.setChip(null);
  }
  let stageTimer = 0;
  function stagePhoneZombie(force = false) { // R23: 휴대폰 손님이 옆 계산대 줄에서 결제 실패(배터리 0%) — 잠깐 옆 줄에 세워 두고 말풍선
    const lane = checkoutState().lane; if (lane < 0 || !shoppers?.stage || (!force && !reactions.can('R23'))) return;
    const n = shoppers.list.find((x) => x.id === 'phone-zombie' && x.active); if (!n || (!force && Math.random() > 0.5)) return;
    const k = CO.STAFFED.filter((j) => j !== lane).sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane) || b - a)[0]; // 가장 가까운 열린 계산대
    shoppers.stage('phone-zombie', laneX(k) + 0.2, 13.4, 0, 14);
    clearTimeout(stageTimer); stageTimer = setTimeout(() => { if (alive) reactions.fire('R23', { force: true }); }, 2500);
  }
  function onCheckoutStart() {
    stagePhoneZombie();
    if (mode() !== 'story') return;
    const lane = checkoutState().lane;
    const j = job;
    if (j?.kind === 'roam' && j.L.onCheckout) { finishJob(j.L.onCheckout, ROAM_EVENT[j.L.id]); return; }
    const m = mission; if (!m || m.result) return;
    if (m.id === 'E01') { if (!m.taken) return; const r = evalE01(m); m.result = 'pending'; setTimeout(() => { if (!alive || mission !== m) return; m.result = null; endMission(r, resumeOf(m)); }, 900); return; }
    if (m.id === 'E13') { if (lane === 6) { arrived(); endMission(evalE13(m), resumeOf(m)); } else endMission('missed', m.L.onMissed || resumeOf(m)); return; }
    if (m.id === 'E14' && m.L.onCheckout) { markMissed('E03'); endMission('missed', m.L.onCheckout); return; }
    if (m.id === 'E03') { endMission(evalE03(m) === 'missed' ? 'missed' : evalE03(m), resumeOf(m)); }
  }
  function onCheckoutDone() {
    const w = waiters.done.splice(0); w.forEach((f) => f());
    save.best.receipt = items.map((it) => it.p.id); save.best.eggs = staff.S.eggsToday; // 영수증 기록 (내일 R50 · 칠판)
    if (mode() !== 'story') { persist(); return; }
    const j = job;
    if (j?.kind === 'roam' && (j.L.onMissed || j.L.onCheckout)) { setTimeout(() => job === j && alive && finishJob(j.L.onMissed || j.L.onCheckout, ROAM_EVENT[j.L.id]), 1200); return; }
    const m = mission; if (!m || m.result) { persist(); return; }
    // 사건 안 받고(또는 끝내기 전에) 계산 → 놓침
    const next = m.id === 'E01' ? (m.L.onMissed || 'd1_161') : (m.L.onCheckout || m.L.onMissed || resumeOf(m));
    setTimeout(() => { if (alive && mission === m && !m.result) endMission('missed', next); }, 1200);
  }
  async function endDay(L) {
    const d = curDay(), main = DAY_MAIN[d], res = save.ev[main] && save.ev[main] !== 'active' ? save.ev[main] : 'missed';
    const ev = EVENTS.events.find((e) => e.id === main);
    const replay = !!save.replay;
    if (!replay) {
      const gain = res === 'success' ? (ev?.reward?.vitality || 10) : res === 'partial' ? 6 : res === 'fail' ? 2 : 0;
      save.vitality = Math.min(100, save.vitality + gain);
      if (res === 'success') for (const [k, v] of Object.entries(ev?.reward?.affinity || {})) save.aff[k] = Math.min(5, (save.aff[k] || 0) + v);
      if (!save.cleared[d]) save.stamps = Math.min(7, save.stamps + (L.stamp ?? 1));
      save.cleared[d] = 1;
      save.yesterday = { eggs: staff.S.eggsToday, kg: Math.round(save.best.kg || loadKg()), receipt: save.best.receipt || [], at: Date.now() };
      save.day = (L.nextDay?.day) || d + 1;
    }
    save.replay = null; save.beat = null; save.beatDay = null; save.left = null; persist();
    await vn.stampCard({ day: d, result: res, vitality: save.vitality, stamps: save.stamps, note: replay ? '다시 하기 · 도장과 활기는 처음 한 번만 받아요' : L.storeChange ? `매장 변화: ${L.storeChange}` : '' });
    if (!alive) return;
    const next = save.day, nd = L.nextDay || (LINES[DAY_START[next]] ? { day: next, title: LINES[DAY_START[next]].title, hook: LINES[DAY_START[next]].subtitle } : null);
    if (replay || !nd) { vn.toast({ face: face('beomi'), name: '범이', text: '오늘은 마음껏 둘러보세요~', ms: 3200 }); updateChip(true); return; }
    const ready = !!SCRIPTS[nd.day];
    const v = await vn.nextDayCard({ day: nd.day, title: nd.title, hook: ready ? nd.hook : `${nd.hook || ''}\n(${nd.day}일차 이야기는 준비 중이에요)`, canvas: art.nextDay(nd.day),
      buttons: ready ? [{ label: '다음에 와서 이어 보기', v: 'later' }, { label: `바로 ${nd.day}일차 시작`, v: 'now', w: 1 }] : [{ label: '확인', v: 'later' }] });
    if (!alive) return;
    if (v === 'now') { npcsForDay(); runFrom(DAY_START[nd.day]); return; }
    vn.toast({ face: face('beomi'), name: '범이', text: ready ? `오늘은 마음껏 둘러보세요~ 다음에 들어오시면 ${nd.day}일차예요!` : '오늘은 마음껏 둘러보세요~', ms: 4200 });
    updateChip(true);
  }

  // ---------- 하루 시작 / 돌아옴 / 나가기 ----------
  function npcsForDay() {
    if (mode() === 'story') makeCoins(); else removeCoins();
    if (!shoppers) return;
    const bg = shoppers.ambient?.(mode() === 'free' ? 99 : curDay() <= 1 ? 3 : curDay() === 2 ? 5 : 99) || []; // 배경 손님·직원(활기)
    if (mode() === 'free') { shoppers.setActive(shoppers.list.filter((n) => !n.ambient).map((n) => n.id).concat(bg)); return; }
    const v = save.vitality, cap = v <= 30 ? 2 : v <= 60 ? 4 : 8;
    const ids = (NPCT.types || []).filter((t) => (t.fromDay || 1) <= curDay()).map((t) => t.id).slice(0, cap);
    ids.push('elder'); // 매일 오는 동네 어르신(지팡이) — 배경 손님
    if (curDay() >= 3) ids.push('spy'); // 3일차부터 수상한 손님 — R48·R55
    shoppers.setActive(ids.concat(bg));
  }
  function comebackLine() {
    const L = save.left; if (!L) return null;
    const C = EXIT.leaveMidDay.comebackLines, days = (Date.now() - (L.at || 0)) / 864e5, same = dayKey(L.at) === dayKey();
    const pick = (grp) => { const ws = Object.keys(grp || {}).filter((w) => w !== 'spy' || curDay() >= 3); if (!ws.length) return null; const who = ws[Math.floor(Math.random() * ws.length)]; const arr = grp[who].filter((x) => lineOk(who, x)); if (!arr.length) return null; return { who, text: arr[Math.floor(Math.random() * arr.length)] }; };
    if (days >= 3) return pick(C.longAbsence3Days);
    if (L.kind === 'event') return pick(C.leftDuringEvent);
    if (L.kind === 'dialogue') return pick(C.leftDuringDialogue);
    if (L.kind === 'cart' && L.n) { const r = pick(C.leftWithCart); if (r) r.text = r.text.replace('{n}', L.n); return r; }
    return same ? pick(C.sameRealDay) : pick(C.nextRealDay);
  }
  function beatLabel(id) {
    const L = LINES[id]; if (!L) return '';
    if (L.cmd === 'mission.start') return `사건: ${EVENTS.events.find((e) => e.id === L.event)?.name || L.event}`;
    if (L.cmd === 'roam') return L.chip || '자유 장보기';
    if (L.cmd === 'scene.checkout') return '계산대로 가는 중';
    if (L.cmd === 'branch' && /^mission\./.test(L.on || '')) return '사건 결과 이야기';
    return '이야기 중간부터';
  }
  function resetDay(d) {
    for (const e of EVENTS.events) if (e.day === d) delete save.ev[e.id];
    for (const f of DAY_FLAGS[d] || []) delete save.flags[f];
    save.beat = null; save.beatDay = null; persist();
  }
  async function beginStory() {
    npcsForDay(); vn.setInGame(true);
    const cb = comebackLine(); save.lastVisit = Date.now();
    const wasLeft = save.left; save.left = null; persist();
    if (cb) setTimeout(() => { if (!alive) return; const who = cb.who; vn.toast({ face: face(who), name: nameOf(who)[0], text: cb.text, ms: 4200 }); if (wasLeft?.n) setTimeout(() => alive && vn.toast({ name: '안내', text: '계산 안 한 카트는 비웠어요 · 기록은 그대로', ms: 3200 }), 600); sfx.cue('toast-pop'); }, cb && save.beat ? 600 : 2000);
    vn.prefetch('beomsuk'); vn.prefetch('beomi');
    await sleep(700); if (!alive) return;
    // 대본이 있는 마지막 날까지 다 봤으면: 다시 하기 / 자유 장보기 (빈 날로 보내지 않음)
    if (!save.replay && !SCRIPTS[save.day]) {
      const last = Math.max(...Object.keys(SCRIPTS).map(Number));
      const v = await vn.pickCard({ title: `${last}일차까지 다 봤어요!`, sub: `${save.day}일차 이야기는 준비 중이에요 · 그동안 다시 보거나 자유롭게 둘러보세요`, buttons: [{ label: `${last}일차 다시 하기`, v: last }, { label: '1일차 다시 하기', v: 1, w: 1 }, { label: '자유 장보기', v: 'free', w: 1 }] });
      if (!alive) return;
      if (v === 'free') { session.mode = 'free'; npcsForDay(); vn.toast({ name: '자유 장보기', text: '오늘은 사건 없이 둘러봐요 · 설정에서 다시 스토리로 바꿀 수 있어요', ms: 3600 }); return; }
      save.replay = v; resetDay(v); persist(); npcsForDay(); runFrom(DAY_START[v]); return;
    }
    const d = curDay(), b = save.beat && save.beatDay === d && LINES[save.beat] ? save.beat : null;
    if (b && b !== DAY_START[d]) {
      const v = await vn.pickCard({ title: `${d}일차 이어서 하기`, sub: '나갔던 곳부터 이어서 해요 · 일차는 그대로예요', where: beatLabel(b), buttons: [{ label: '이어서 하기', v: 'resume' }, { label: '처음부터', v: 'restart', w: 1 }] });
      if (!alive) return;
      if (v === 'restart') { resetDay(d); runFrom(DAY_START[d]); } else { if (save.ev[DAY_MAIN[d]] === 'active') save.ev[DAY_MAIN[d]] = null; runFrom(b); }
      return;
    }
    runFrom(DAY_START[d]);
  }
  function beginFree() { npcsForDay(); vn.setInGame(true); }
  async function start() {
    if (!save.mode && !session.mode) {
      await sleep(400); if (!alive) return;
      const m = await vn.modeSelect(); save.mode = m; persist();
    }
    entryReactions();
    if (mode() === 'story') beginStory(); else beginFree();
  }
  function entryReactions() {
    const w = window.__jj?.weather?.state || {};
    const hour = typeof w.hour === 'number' ? w.hour : new Date().getHours() + new Date().getMinutes() / 60;
    const kind = String(w.kind || w.type || w.weather || '');
    if (/rain|snow|비|눈/.test(kind)) setTimeout(() => reactions.fire('R31'), 3000);
    if (hour >= 21.5) setTimeout(() => reactions.fire('R32'), 2500);
    det.period = period(hour); setTimeout(() => reactions.fire('R33', { key: det.period }), 6000);
    det.hour = Math.floor(hour);
  }
  const period = (h) => (h >= 10 && h < 12 ? 'open' : h >= 12 && h < 14 ? 'lunch' : h >= 14 && h < 17 ? 'afternoon' : h >= 18 && h < 21 ? 'evening' : h >= 21 && h < 22 ? 'closing' : h >= 22 || h < 10 ? 'night' : 'afternoon');

  // ---------- 포인트 코인 (R34): 스토리 모드에서 하루 3개, 통로 바닥에 반짝 — 주우면 +10 포인트, 같은 날 두 번째부터 범이 반응 ----------
  const COIN_SPOTS = [[23.4, 60], [40.1, 92], [53.9, 52], [34.5, 107.2], [59.4, 77], [64.8, 30], [29.0, 77], [47.2, 66]];
  let coins = null;
  function makeCoins() {
    if (coins || mode() !== 'story') return;
    const g = keep(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 14)); g.rotateX(Math.PI / 2);
    const m = keep(new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x8a6a10 }));
    const im = new THREE.InstancedMesh(g, m, 3); im.name = 'story-coins'; im.frustumCulled = false; scene.add(im);
    const seed = [...String(save.todayKey || '')].reduce((a, ch) => a + ch.charCodeAt(0), save.day * 7);
    const pts = [0, 1, 2].map((i) => COIN_SPOTS[(seed + i * 3) % COIN_SPOTS.length]);
    coins = { im, pts: pts.map(([x, z]) => ({ x: x + 0.6, z, got: false })), t: 0, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler() };
  }
  function removeCoins() { if (!coins) return; coins.im.removeFromParent(); coins.im.dispose(); coins = null; }
  function coinTick(dt) {
    if (!coins) return; coins.t += dt;
    const me = st.me;
    coins.pts.forEach((c, i) => {
      if (!c.got && Math.hypot(me.x - c.x, me.z - c.z) < 0.9) {
        c.got = true; save.today.coins = (save.today.coins || 0) + 1; save.points = (save.points || 0) + 10; sfx.cue('toast-pop');
        vn.toast({ name: '포인트 코인', text: `+10 포인트 (오늘 ${save.today.coins}개)`, ms: 1800 });
        if (save.today.coins >= 2) reactions.fire('R34');
      }
      coins.q.setFromEuler(coins.e.set(0, coins.t * 2.4 + i, 0));
      coins.m4.compose(new THREE.Vector3(c.x, c.got ? -5 : 0.32 + Math.sin(coins.t * 3 + i) * 0.04, c.z), coins.q, new THREE.Vector3(1, 1, 1));
      coins.im.setMatrixAt(i, coins.m4);
    });
    coins.im.instanceMatrix.needsUpdate = true;
  }

  // ---------- 반응 감지 (0.25초마다) ----------
  const det = { t: 0, speedT: 0, idleT: 0, tvT: 0, zombieT: 0, eggs: 0, floor: 0, rams: 0, tower: 0, ice: null, inBakery: false, inSeason: false, period: '', hour: -1, lastX: 0, lastZ: 0 };
  function detect(dt) {
    const S = staff.S, c = st.cart, sp = st.hasCart ? Math.hypot(c.vx, c.vz) : 0, kg = loadKg();
    save.best.kg = Math.max(save.best.kg || 0, kg);
    const fire = reactions.fire;
    if (S.blockT > 20) fire('R01');
    det.speedT = sp > 2.2 ? det.speedT + dt : 0; if (det.speedT > 2) { fire('R05'); det.speedT = 0; }
    if (kg >= 150) fire('R06'); if (kg >= 230) fire('R07');
    if (S.rams === 3 && det.rams !== 3) setTimeout(() => fire('R08'), 1500); det.rams = S.rams;
    if (S.eggsToday >= 1 && det.eggs === 0) fire('R11'); if (S.eggsToday >= 10 && det.eggs < 10) fire('R12'); det.eggs = S.eggsToday;
    if (S.towerBest >= 5 && det.tower < 5) fire('R13'); det.tower = S.towerBest;
    if (S.floorDrops >= 5 && det.floor < 5) fire('R16'); det.floor = S.floorDrops;
    const cnt = {}; for (const it of items) cnt[it.p.id] = (cnt[it.p.id] || 0) + 1;
    if (Object.values(cnt).some((n) => n >= 10)) fire('R14');
    const hasIce = items.some((it) => it.p.id === 'icecream');
    if (hasIce) { const inFreezer = st.me.x > 78 && st.me.x < 84.5; det.ice = (det.ice ?? 0) + (inFreezer ? 0 : dt); if (det.ice > 360) { fire('R17'); det.ice = 0; } } else det.ice = null;
    const me = st.me, moved = Math.hypot(me.x - det.lastX, me.z - det.lastZ) > 0.01; det.lastX = me.x; det.lastZ = me.z;
    det.idleT = !moved && sp < 0.01 && !checkout.busy && !lock.vn ? det.idleT + dt : 0; if (det.idleT > 60) { fire('R45'); det.idleT = 0; }
    const inTv = me.x > 67 && me.x < 81.5 && Math.abs(me.z - 29.7) < 4;
    det.tvT = inTv && !moved ? det.tvT + dt : 0; if (det.tvT > 20) { fire('R39'); det.tvT = 0; }
    if (Math.hypot(me.x - 66, me.z - 38.8) < 5) fire('R40');
    if (me.x > 76.2 - 6 && me.x < 83.3 + 6 && me.z > 37.2 - 6 && me.z < 40.3 + 6) fire('R41');
    // R18 냉동 쇼케이스 앞(x 80–84.5, z 46–108)에서 15초 넘게 서서 고르기
    det.frzT = me.x > 80 && me.x < 84.5 && me.z > 46 && me.z < 108 && !moved ? (det.frzT || 0) + dt : 0; if (det.frzT > 15) { fire('R18'); det.frzT = 0; }
    // R20 시식대(6.5, 39.6) 2.2 m 안에 들어올 때마다 한 입 — 그날 세 번째에
    const taste = me.x > 4.4 - 2.2 && me.x < 8.6 + 2.2 && me.z > 38.8 - 2.2 && me.z < 41.2 + 2.2;
    if (taste && !det.taste) { save.today.samples = (save.today.samples || 0) + 1; if (save.today.samples === 3) fire('R20'); } det.taste = taste;
    // R02 계산대 줄 역주행: 유인 계산대 통로(바닥 화살표 = -z 방향)에서 카트가 +z 로 3초
    const inLane = st.hasCart && c.z > 6.5 && c.z < 12.8 && CO.STAFFED.some((k) => c.x > laneX(k) - 0.35 && c.x < laneX(k) + 0.95);
    det.wrongT = inLane && c.vz > 0.3 ? (det.wrongT || 0) + dt : 0; if (det.wrongT > 3) { fire('R02'); det.wrongT = 0; }
    // R46 고객센터(E12 이후) 입구 근처 환불 손님 — 30%
    const nearDoor = me.x > 65 && me.x < 73 && me.z < 12;
    if (nearDoor && !det.door && save.ev?.E12 && shoppers?.list.some((n) => n.id === 'sample-uncle' && n.active) && Math.random() < 0.3) fire('R46'); det.door = nearDoor;
    const hour = (() => { const w = window.__jj?.weather?.state; return typeof w?.hour === 'number' ? w.hour : new Date().getHours(); })();
    // R24 계산대 줄에서 40초 넘게 계산 시작을 못 함(내 줄만 느림)
    det.laneT = inLane && checkoutState().phase === 'idle' && sp < 0.2 ? (det.laneT || 0) + dt : 0; if (det.laneT > 40) { fire('R24'); det.laneT = 0; }
    // R47 밤(22시 이후) 지게차 통로 표지(57, 44) 8 m 안
    if (hour >= 22 && Math.hypot(me.x - 57, me.z - 44) < 8) fire('R47');
    // R48 수상한 손님(spy) 4 m 안 + 내 짐이 그 장바구니(약 6 kg)보다 무거움
    if (shoppers?.near('spy', me.x, me.z, 4) && kg > 6) fire('R48');
    coinTick(dt);
    const bak = me.x < 13 && me.z > 14 && me.z < 40; if (bak && !det.inBakery && hour < 13) fire('R36'); det.inBakery = bak;
    const sea = me.x > 66 && me.x < 80 && me.z > 48 && me.z < 106; if (sea && !det.inSeason && [10, 11].includes(new Date().getMonth())) fire('R38'); det.inSeason = sea;
    const pr = period(hour); if (det.period && pr !== det.period) fire('R33', { key: pr }); det.period = pr;
    const hh = Math.floor(hour); if (det.hour >= 0 && hh !== det.hour && Math.hypot(me.x - 74, me.z - 112) < 15) fire('R35'); det.hour = hh;
    if (shoppers) {
      const sh = shoppers;
      const su = sh.near('sample-uncle', me.x, me.z, 10); if (su && su.visits >= 5) fire('R21');
      const bb = sh.near('bulk-boss', me.x, me.z, 2.2); if (bb && bb.v > sp + 0.2) fire('R22');
      if (sh.near('family', me.x, me.z, 15)) fire('R25');
      const pz = sh.near('phone-zombie', me.x, me.z, 2.6); det.zombieT = pz && sp < 0.3 && st.hasCart ? det.zombieT + dt : 0; if (det.zombieT > 5) { fire('R26'); det.zombieT = 0; }
      if (sh.near('couple', me.x, me.z, 3)) fire('R27');
      const gb = sh.near('gym-bro', me.x, me.z, 6); if (gb && gb.zone === 'water') fire('R28');
      const cd = sh.near('camping-dad', me.x, me.z, 8); if (cd && cd.zone === 'seasonal' && cd.inZoneT > 30) fire('R30');
    }
  }

  // ---------- 프레임 ----------
  let acc = 0;
  function tick(dt) {
    if (!alive) return;
    touchT = isMobile && (ctx.touchActive?.() || false) ? touchT + dt : 0;
    acc += dt;
    if (acc >= 0.25) {
      const step = acc; acc = 0;
      if (mode() !== 'off') detect(step);
      const ex = tickExit(step);
      if (mode() === 'story' && !exitReq) { tickMission(step); tickJob(); }
      if (mode() === 'story' || ex) updateChip(false);
      // 레이아웃: 왼쪽 정보 상자 아래 [설정] [미션 칩] → interior 토스트들은 그 아래(colBottom)
      layout();
    }
    guide.setHidden(lock.vn || vn.blocking || (mode() !== 'story' && guide.target?.id !== 'exit'));
    if (tower?.visible && mission && mission.id === 'E01' && !mission.taken) { const tt = performance.now() / 1000; tower.userData.trays.forEach((m, i) => { m.rotation.z = Math.sin(tt * 2.6 + i * 0.25) * 0.004 * i; m.position.x = Math.sin(tt * 2.6 + i * 0.25) * 0.0035 * i * i / 6; }); }
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; if (!b.b.alive) { bubbles.splice(i, 1); continue; } const p = project(b.pos, b.y); if (p) { b.b.el.style.left = `${p.x}px`; b.b.el.style.top = `${p.y}px`; b.b.el.style.opacity = '1'; } else b.b.el.style.opacity = '0'; }
    reactions.tick({ dialog: lock.vn, payPanel: checkoutState().phase === 'pay', staffTalking: (staff.S.bubbleT || 0) > 0 });
  }
  let colBottom = 0;
  function layout() {
    const panel = document.querySelector('#depot-hud .dh-panel'); if (!panel) return;
    const pb = panel.getBoundingClientRect().bottom;
    const gear = vn.root.querySelector('.gear'), chip = vn.root.querySelector('.chip');
    vn.setOffsets({ gearTop: Math.round(pb + 8), chipTop: Math.round(pb + 8 + 40) });
    const chipOn = chip.style.display === 'block';
    colBottom = chipOn ? chip.getBoundingClientRect().bottom : gear.getBoundingClientRect().bottom;
    const mc = isMobile && vn.root.querySelector('.mchip.on'); // 모바일 오른쪽 사건 카드 아래로 (겹치지 않게)
    const rxTop = isMobile ? (mc ? Math.round(mc.getBoundingClientRect().bottom + 6) : 58) : checkout.busy ? 70 : Math.max(colBottom + 8, (st.msgTop3 || 0));
    vn.setOffsets({ rxTop: Math.round(rxTop) });
    vn.root.querySelector('.rx').style.left = isMobile || checkout.busy ? '50%' : '16px';
    vn.root.querySelector('.rx').style.transform = isMobile || checkout.busy ? 'translateX(-50%)' : '';
  }
  vn.onGear = async () => {
    const cur = { mode: mode(), ...save.settings };
    await vn.settings(cur, (id, v) => {
      if (id === 'mode') switchMode(v);
      else { save.settings[id] = v; if (id === 'reactionFreq' && session.freq != null) session.freq = v; persist(); }
    });
  };
  function suspendStory() { // 진행 중인 대사·사건을 체크포인트(save.beat)에 멈춰 둠 — 다시 이어 갈 땐 resumeStory()
    runTok++; running = talking = false; vn.close();
    if (mission && !mission.result) { save.ev[mission.id] = 'active'; if (mission.id === 'E13') props.tray(false); if (mission.id === 'E14') props.shelfStickers(null); }
    mission = null; job = null; guide.set(null); vn.setChip(null); if (tower) tower.visible = false; reactions.setEventCast(null);
    persist();
  }
  function resumeStory() {
    const d = curDay(), b = save.beat && save.beatDay === d && LINES[save.beat] ? save.beat : null;
    if (!SCRIPTS[d]) return;
    if (save.ev[DAY_MAIN[d]] === 'active') save.ev[DAY_MAIN[d]] = null;
    runFrom(b || DAY_START[d]);
  }
  // ---------- 나가기 = 출구(왼쪽 끝 EXIT)로만 ----------
  // 대화창 [나가기] → 저장하고 '출구로 가는 중' (순간이동 없음). 실제로 나가는 건 checkout.js 출구 문에서 E 뿐.
  let exitReq = false, exitHintT = 0;
  const EXIT_T = ctx.exitTarget || { id: 'exit', label: '출구 EXIT (계산대 지나 왼쪽 끝)', x: 6, z: 1.0, ax: 6, az: 2.4, r: 1.9, y: 3.0 };
  function wantsExitGuide() {
    if (mode() === 'off') return false;
    if (exitReq) return true;
    if (mission && !mission.result) return false;
    if (job || running || talking) return false;
    return flags.paid || exitHintT > 0;
  }
  function cancelExit() {
    if (!exitReq) return;
    exitReq = false; leftSaved = false; save.left = null; persist(); guide.set(null); vn.setChip(null);
    vn.toast({ face: face('beomi'), name: '범이', text: '좋아요, 마저 해요!', ms: 1800 });
    if (mode() === 'story') resumeStory();
  }
  function tickExit(step) {
    if (exitHintT > 0) exitHintT -= step;
    const want = wantsExitGuide();
    if (want) { if (guide.target?.id !== 'exit') guide.set(EXIT_T); } else if (guide.target?.id === 'exit') guide.set(null);
    return want;
  }
  function switchMode(m) {
    if (m === mode()) return;
    session.mode = null; save.mode = m; persist();
    if (m === 'free') { // 스토리 → 자유: 하루 저장(나가기와 같음, 놓침 아님)
      suspendStory(); exitReq = false;
      npcsForDay(); vn.toast({ name: '자유 장보기', text: '스토리 하루는 저장했어요 · 사건·컷신 없이 둘러보세요', ms: 3200 });
    } else { // 자유 → 스토리: 저장된 일차 입구에서 다시
      try { api._dbg.setMe(70.5, 3.4, Math.PI); } catch { /* */ }
      vn.toast({ name: '스토리 모드', text: `${curDay()}일차 · 멈춘 곳부터 이어서 해요`, ms: 2600 });
      beginStory();
    }
  }
  vn.onExit = () => { // 대화 중 나가기 → 멈춘 곳 저장하고 출구로 안내 (나가는 건 출구 문에서만)
    save.left = { at: Date.now(), kind: talking ? 'dialogue' : mission && !mission.result ? 'event' : items.length ? 'cart' : 'plain', n: items.length };
    leftSaved = true; suspendStory(); exitReq = true;
    guide.set(EXIT_T); updateChip(true);
    vn.toast({ face: face('beomi'), name: '범이', text: '멈춘 곳은 저장했어요! 계산대 지나 왼쪽 끝 초록 출구로 나가시면 돼요', ms: 4200 });
  };
  let leftSaved = false;
  start();
  return {
    tick, onAudio,
    wantsExitGuide, hintExit: (sec = 25) => { exitHintT = Math.max(exitHintT, sec); if (wantsExitGuide()) { guide.set(EXIT_T); updateChip(true); } },
    get exitReq() { return exitReq; },
    get locked() { return lock.vn || vn.blocking; },
    get mode() { return mode(); },
    colBottom: () => colBottom,
    vn, reactions, save,
    _dbg: { save: () => JSON.parse(JSON.stringify(save)), runFrom, startMission, endMission, job: () => job && { kind: job.kind, id: job.L?.id, t: +(now() - job.t0).toFixed(1) }, curDay, running: () => running, talking: () => talking,
      mission: () => mission && { id: mission.id, taken: mission.taken, result: mission.result, recalled: mission.recalled, t: +(now() - mission.t0).toFixed(1), stop: mission.stop && { id: mission.stop.id, label: mission.stop.label, x: mission.stop.x, z: mission.stop.z, ax: mission.stop.ax, az: mission.stop.az }, stickered: [...mission.stickered], brakes: mission.brakes, remaining: mission.remaining, near6: mission.near6 },
      skipMissionClock: (sec) => { if (mission) mission.t0 -= sec; if (job) job.t0 -= sec; }, takeTower: () => mission && !mission.taken && takeTower(), switchMode, cancelExit, exitReq: () => exitReq, fire: (id, o) => reactions.fire(id, { force: true, ...o }), setFreq: (f) => { session.freq = f; }, hits: () => hits.slice(), setDay: (d) => { save.day = d; save.beat = null; save.replay = null; }, npcs: () => npcsForDay(), coins: () => coins && coins.pts.map((c) => ({ ...c })), stagePZ: () => stagePhoneZombie(true) },
    dispose() {
      if (!leftSaved && (save.mode === 'story') && !session.noPersist) {
        const kind = talking ? 'dialogue' : mission && !mission.result ? 'event' : items.length && !flags.paid ? 'cart' : null;
        if (kind) save.left = { at: Date.now(), kind, n: items.length };
        persist(); // 하루(save.day)와 체크포인트(save.beat)는 그대로 — 나가기는 멈춤일 뿐
      }
      alive = false; runTok++; props.dispose(); guide.set(null); vn.setChip(null); removeCoins(); clearTimeout(paTimer); clearTimeout(stageTimer); window.removeEventListener('depot:sfx', onSfx); window.removeEventListener('depot:pa', onPa); for (const w of waiters.done) w(); vn.dispose(); sfx.dispose();
    },
  };
}
