// [depot-story] 스토리 모드 (depot-story v0.4) — 첫 입장 모드 선택(스토리/자유), 1일차 대본(day1-script) + 사건 E01, 반응 R01–R50,
//   나가기·놓침·돌아옴 규칙(exit-rules), 소리 신호(audio-cues), 손님 NPC 일차별 등장. interior.js 가 매장 생성 뒤 지연 import.
//   저장: localStorage 'bw.depot.story.v1' (일차·본 대사·단골도·활기·도장·사건 상태·반응 횟수·어제 기록). 서버 저장 없음.
//   URL: ?depotMode=story|free|ask(모드 다시 고르기) · ?depotStoryReset=1(저장 지움) · shot=1 이면 depotMode 없을 때 자유+반응 끔(스샷 고정).
import { laneX, CO } from '../checkout.js';
import TARGETS from './data/targets.json';
import EVENTS from './data/events.json';
import EXIT from './data/exit-rules.json';
import NPCT from './data/npc-types.json';
import { createVN } from './vn.js';
import { createReactions } from './reactions.js';
import { createStorySfx } from './sfx.js';
import { cashierAt } from './cashiers.js';
import { createProps, spySilhouette, nextDayArt } from './props.js';
import { createDay4Props, createEscort, evalE04, E04 as E04T, E12 as E12T, D4_SPOTS } from './day4.js';
import { createDay5Props, createTail, createLava, buildSpyRoute, inRect, wheels, E05 as E05T, E06 as E06T, LAVA_GOAL } from './day5.js';
import { createDay6Props, createRace, createStealth, raceCourse, forkliftLanes, E07 as E07T, E08 as E08T } from './day6.js';
import { createDay7Props, createAudit, createMelt, createFollower, auditChecks, evalE10, evalE11, loadRatio, endingVitality, pickRange, E09 as E09T, E11 as E11T, SPY_RECT } from './day7.js';

const KEY = 'bw.depot.story.v1';
// 대본이 있는 날: data/dayN-script.json 을 넣기만 하면 그 일차가 열림 (v0.7: 1–7일차). 없으면 '준비 중' 카드 그대로.
const SCRIPTS = Object.fromEntries(Object.entries(import.meta.glob('./data/day*-script.json', { eager: true, import: 'default' }))
  .map(([f, d]) => [Number(/day(\d+)-script\.json$/.exec(f)?.[1]), d]).filter(([n, d]) => n > 0 && Array.isArray(d) && d.length));
const LINES = Object.fromEntries(Object.values(SCRIPTS).flat().map((l) => [l.id, l]));
const DAY_START = Object.fromEntries(Object.entries(SCRIPTS).map(([n, d]) => [n, (d.find((l) => l.cmd === 'scene.start') || d[0]).id]));
const DAY_MAIN = { 1: 'E01', 2: 'E02', 3: 'E03', 4: 'E04', 5: 'E05', 6: ['E07', 'E08'], 7: 'E10' }; // 하루 끝 도장·활기 기준 사건 (6일차는 메인 2개)
const mains = (d) => [].concat(DAY_MAIN[d] || []);
const DAY_SIDE = { 4: 'E12', 5: 'E06' }; // 사이드 사건: 성공 = 표의 활기(E12 +5 · E06 +6), 부분 = 2 (메인과 따로 더함, 상한 100)
const MISSION_TARGET = { E04: 'tissue-pyramid', E12: 'customer-desk', E05: 'timesale-endcap', E06: 'lava-goal', E07: 'race-start', E08: 'entrance-mat', E11: 'checkout' };
const AFTER_CO = new Set(['E07', 'E08']); // 계산 뒤 사건 (exit-rules afterCheckout): 계산하면 놓침 없음 · 거절·90초 = 놓침
const NIGHT_AT = { d6_027: 1, d6_051: 2 };
const AFTER_CO_BEAT = new Set(['d6_034', 'd6_040', 'd6_061', 'd6_065']); // 6일차 계산 뒤 사건 체크포인트 // 6일차 마감 후 반쯤 끔 → 새벽 3시 손전등 // 대본·events.json 에 target 이 없을 때
const DAY_FLAGS = { 2: ['d2Sticker'], 6: ['recipeHalf'] };
const EXTRA_EV = { 7: ['E11', 'E09'] }; // 하루 안에서 같이 도는 사건 (clearActive)
const AUDITOR_FROM = 'd7_010', CHECKLIST_OFF = new Set(['d7_021', 'd7_068']); // 7일차: 감사관 입구에 섬 · 체크리스트 패널 닫는 노드
const ENDING = { A: { name: '정자점 존속 확정', sign: '오픈 기념 세일 연장', line: 'd7_100' }, B: { name: '조건부 존속', sign: '리뉴얼 준비 중', line: 'd7_120' }, C: { name: '폐점 유예', sign: '리뉴얼 준비 중', line: 'd7_140' } };
const REVEAL_FLAG = 'spyRevealed'; // 수상한 손님 정체(이름)는 5일차 d5_036/d5_089c 선택지의 flag.spyRevealed 뒤에만 보임 (일차 기준 아님)
const CHAIN_MISSED = EXIT.ignoreEvent?.chainMissed || {}; // 사건 중 계산 → 그날 남은 사건도 놓침 (mission.start 노드 id → 사건 id 들)
const CUT_ON = { d2_143: () => spySilhouette() }, CUT_OFF = new Set(['d2_146', 'd2_147', 'd2_148', 'd2_150']);
const PORTRAIT = { beomsuk: 'beomsuk', beomi: 'beomi', halmeoni: 'halmeoni', spy: 'spy', cashier: 'kimmiso', auditor: 'auditor' };
const NAMES = { beomsuk: ['한범숙 주임', '매장 주임'], beomi: ['범이', '수습 알바'], halmeoni: ['말순 할머니', '시식 코너'], spy: ['수상한 손님', '???'], pa: ['방송실 점장', '방송 중'], me: ['나', ''], cashier: ['계산원 김미소', '계산대 07'], auditor: ['본사 감사관', '본사 감사팀'] };
const SPY_REVEALED = ['반기철(반값)', '경쟁 마트 조사 요원']; // 가게 이름(싹쓸마트)은 미정이라 이름표·대사에 안 씀
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
  // 정체 공개: 저장된 flag 기준. 1–5일차를 다시 할 때는 이번 판에서 공개 선택지를 지나야만 (저장 flag 는 그대로 둠)
  const revealed = () => (save.replay && save.replay <= 5 ? !!session.revealed : !!save.flags[REVEAL_FLAG]);
  const nameOf = (who) => (who === 'spy' && revealed() ? SPY_REVEALED : NAMES[who] || [who, '']);
  const R58_FAIL = /^\(E12 실패·놓침\)\s*/;
  const e12Bad = () => save.ev.E12 === 'fail' || save.ev.E12 === 'missed';
  const lineOk = (who, line) => {
    const L = String(line);
    if (/싹쓸마트/.test(L)) return false; // 가게 이름 미정
    if (/반기철/.test(L) && !revealed()) return false; // 정체 대사 막기
    if (R58_FAIL.test(L)) return e12Bad(); // R58 크레용 그림: 실패·놓침 줄
    if (reactions?.BY_ID?.R58?.lines?.['1']?.[0] === L) return !e12Bad();
    return true;
  };
  const props = createProps({ THREE, scene, keep, cartObj: ctx.cartObj || scene, items });
  const d4 = createDay4Props({ THREE, scene, keep, cartObj: ctx.cartObj || scene, look: ctx.look, obstacles: ctx.obstacles, isMobile });
  const TGS = Object.fromEntries((TARGETS.targets || []).map((t) => [t.id, t]));
  const d5 = createDay5Props({ THREE, scene, keep, isMobile, tg: TGS, onPhoto: () => photoE05() });
  const d6 = createDay6Props({ THREE, scene, keep, cartObj: ctx.cartObj || null, isMobile, tg: TGS, onLight: (on) => onFlash(on) });
  const d7 = createDay7Props({ THREE, scene, keep, cartObj: ctx.cartObj || null, isMobile, obstacles: ctx.obstacles });
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
  function deliver({ r, line, n, speaker }) {
    const who = r.who; line = String(line).replace(R58_FAIL, '');
    if (r.id === 'R62' && speaker?.ram && n === 1) line = '(톡.) …밀었네요. 적었습니다.'; // R62 note: 반기철을 민 경우
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
    save, getMode: mode, getDay: () => curDay(), lineOk, getFlag: (k) => (k === REVEAL_FLAG ? revealed() : save.flags[k]), getFreq: () => session.freq ?? save.settings.reactionFreq,
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
    if (name === 'cart-bump' && m && m.id === 'E12' && !m.result) kidBump(m);
    if (name === 'cart-bump' && m && m.id === 'E05' && !m.result) m.bumpFlag = true; // 쿵 소리 = 즉시 의심
    if (name === 'cart-bump' && m && m.id === 'E08' && !m.result && m.stealth) { const p = posNow(), f = m.stealth.noise(p.x, p.z); if (f) sfx.cue('forklift-beep', { pos: { x: f.x, y: 1, z: f.z } }); } // 어둠 속 쿵 → 가까운 지게차가 6초 돌아봄
    if (m && m.id === 'E11' && !m.result) onAuditAudio(m, name, opts);
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
    for (const [k, v] of Object.entries(set || {})) { const [a, b] = k.split('.'); if (a === 'aff') save.aff[b] = Math.min(5, (save.aff[b] || 0) + v); else if (a === 'flag') { save.flags[b] = v; if (b === REVEAL_FLAG) session.revealed = !!v; } }
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
        if (L.markMissed) for (const id of L.markMissed) if (!save.ev[id] || save.ev[id] === 'active') markMissed(id); // 거절 선택지로 와도 놓침 (onMissed 와 겹쳐도 같음)
        if (NIGHT_AT[cur] != null && curDay() === 6) d6.night(NIGHT_AT[cur]);
        if (L.choices) { talking = true; const i = await vn.choose(L.choices); const c = L.choices[i]; applySet(c.set); save.seen[cur] = 1; persist(); cur = c.goto; continue; }
        if (L.cmd === 'scene.start') { talking = false; vn.close(); await dayStart(L); cur = L.next; continue; }
        if (L.cmd === 'timeskip') { talking = false; vn.close(); await timeskip(L); save.seen[cur] = 1; cur = L.next; continue; }
        if (L.cmd === 'sfx') { sfx.cue(fixCue(L.sfx)); await sleep(vn.skipping ? 80 : 450); cur = L.next; continue; }
        if (L.cmd === 'branch' && L.ranges) { cur = branchEnding(L); continue; }
        if (L.cmd === 'branch') { const v = branchValue(L.on); cur = (v != null && L.cases[String(v)]) || L.default || L.cases.partial || Object.values(L.cases)[0]; continue; }
        if (L.cmd === 'roam') { talking = false; vn.close(); save.seen[cur] = 1; cur = await roam(L); if (tok !== runTok) return; continue; }
        if (L.cmd === 'mission.start') { talking = false; vn.close(); save.seen[cur] = 1; cur = await startMission(L); if (tok !== runTok) return; continue; }
        if (L.cmd === 'scene.checkout') { talking = false; vn.close(); cur = await waitCheckout(L); if (tok !== runTok) return; continue; }
        if (L.cmd === 'day.end') { talking = false; vn.close(); await endDay(L); return; }
        if (curDay() === 7) uiD7(L);
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
  const TG = TGS;
  const LAVA_ZONES = ['lava-lane-01', 'lava-link-01', 'lava-front-band'].map((id) => TG[id]).filter((r) => r && r.x0 != null).concat([LAVA_GOAL]);
  const ARRIVE = { 'sample-corner': { ax: 10.6, az: 37.6, r: 3.0, y: 2.6 }, 'timesale-endcap': { y: 2.6 }, // 시식대 동쪽 통로에서 멈춤
    'tissue-pyramid': D4_SPOTS.pallet, 'customer-desk': D4_SPOTS.desk, 'kid-spot': D4_SPOTS.kid, // 4일차: 마커 고리는 파렛트·창구 앞
    'lava-goal': { ...LAVA_GOAL, ax: LAVA_GOAL.x, az: LAVA_GOAL.z, r: 1.6, y: 2.2 } }; // 5일차 E06 도착 칸 (사각형 판정은 day5.js)
  const CORRAL = { id: 'corral', label: '카트 보관소 (출입구 옆)', x: 78, z: 5.8, ax: 72.6, az: 6.2, r: 2.6, y: 2.4 };
  function target(id) {
    if (id === 'checkout') return checkoutTarget();
    if (id === 'lane-07') return { id, label: '계산대 07 (계산원 김미소)', x: laneX(6) + 0.15, z: 9.6, ax: laneX(6) + 0.15, az: 10.4, r: 1.8, y: 2.5 };
    const t = id === 'lava-goal' ? LAVA_GOAL : TG[id] || ARRIVE[id]; if (!t) return null;
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
        wps: (L.waypoints || ev.waypoints || []).filter((w) => w.item), final: target(L.target || ev.target || MISSION_TARGET[id]),
        n0: { ramen: cartHas('ramen') }, stickered: new Set(), remaining: ev.tuning?.boxesOnPallet || 8, rivalT: 0,
      };
      if (id === 'E01') { buildTower(); sfx.cue('item-wobble', { pos: { x: EGG_TOWER.x, y: 1, z: EGG_TOWER.z } }); }
      if (id === 'E13') props.tray(true);
      if (id === 'E14') props.shelfStickers(m.wps.map((w) => target(w.target)));
      if (id === 'E03') { shoppers?.rush?.('sale-hunter', 14); shoppers?.stage?.('spy', 46.0, 45.4, Math.PI / 2, 25); sfx.cue('motif.spy'); }
      if (id === 'E04') startE04(m);
      if (id === 'E12') startE12(m);
      if (id === 'E05') startE05(m);
      if (id === 'E06') startE06(m);
      if (id === 'E07') startE07(m);
      if (id === 'E08') startE08(m);
      if (id === 'E11') startE11(m);
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
    if (m.id === 'E04') d4.endSlide();
    if (m.id === 'E12') endE12(m, result);
    if (m.id === 'E05') endE05();
    if (m.id === 'E06') endE06();
    if (m.id === 'E07') endE07(m);
    if (m.id === 'E08') endE08(m, result);
    if (m.id === 'E11') endE11(m);
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
    if (m.id === 'E04') return stopE04(m);
    if (m.id === 'E12') return m.esc.S.boarded ? { ...m.final, step: '2/2 · 천천히' } : { ...m.kidAt, step: '1/2' };
    if (m.id === 'E05') return stopE05(m);
    if (m.id === 'E07') return stopE07(m);
    if (m.id === 'E08') return stopE08(m);
    if (m.id === 'E11') return stopE11(m);
    if (m.id === 'E06') return cartHas('water') < (m.ev.tuning?.waterPacks || E06T.waterPacks) ? { ...target('aisle-01-water'), label: '범샘물 2L×6 (통로 01 노란 선 안)', step: `1/2 · ${cartHas('water')}/3`, wi: 0 } : { ...m.final, step: '2/2 · 노란 선 안으로' };
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
  // ---------- 4일차: E04 보들범 산사태 · E12 꼬마 손님 길 찾기 (기믹·소품은 day4.js) ----------
  const d4Cart = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, held: false };
  function d4Tick(dt) { // 매 프레임: 팩 굴림·카트 담기/반납·꼬마 콩콩
    const c = st.cart; d4Cart.x = c.x; d4Cart.z = c.z; d4Cart.vx = c.vx; d4Cart.vz = c.vz; d4Cart.yaw = c.yaw; d4Cart.held = !!st.hasCart;
    d4.tick(dt, ctx.cartObj?.visible === false ? null : d4Cart);
  }
  const cartSpeed = () => (st.hasCart ? Math.hypot(st.cart.vx, st.cart.vz) : 0);
  /** bumpTarget: 카트 앞·뒤 원이 손님 NPC 자리(사각형)·직원(범숙)에 닿음 — 사람마다 gap 초에 한 번만 셈. 랙(staff.S.rams)은 안 셈 */
  function shopperContacts(m, gap = 1.5) {
    if (!st.hasCart || cartSpeed() < 0.25) return 0;
    const c = st.cart, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), tn = now(); let n = 0;
    m.hitAt ||= {};
    const pts = [0.32, -0.25].map((o) => [c.x + fx * o, c.z + fz * o]);
    const touch = (id, hit) => { if (hit && tn - (m.hitAt[id] ?? -99) > gap) { m.hitAt[id] = tn; n++; } };
    for (const s of shoppers?.list || []) {
      if (!s.active || !s.rect || s.rect.x0 < -900) continue;
      const r = s.rect; touch(s.id, pts.some(([px, pz]) => Math.hypot(px - Math.max(r.x0, Math.min(px, r.x1)), pz - Math.max(r.z0, Math.min(pz, r.z1))) < 0.36 + 0.1));
    }
    const sp = staff?.root?.position; if (sp && staff.root.visible !== false) touch('staff', pts.some(([px, pz]) => Math.hypot(px - sp.x, pz - sp.z) < 0.36 + 0.38));
    return n;
  }
  let d4SfxT = 0, d4FullT = 0;
  function onSlideEvent(kind, p) {
    const pos = { x: p.x, y: 0.3, z: p.z }, tn = now();
    if (kind === 'scoop') sfx.cue('item-pick', { pos });
    else if (kind === 'return') { sfx.cue('item-place', { pos: { x: D4_SPOTS.pallet.x, y: 0.5, z: D4_SPOTS.pallet.z }, kg: E04T.packKg }); updateChip(true); }
    else if ((kind === 'land' || kind === 'hit' || kind === 'kick') && tn - d4SfxT > 0.15) { d4SfxT = tn; sfx.cue('item-fall', { pos, kg: 4.5 }); }
    if (kind === 'full' && tn - d4FullT > 6) { d4FullT = tn; if (!reactions.fire('R57', { force: true })) vn.toast({ face: face('beomi'), name: '범이', text: '카트가 꽉 찼어요! 파렛트에 먼저 내려 주세요', ms: 2600 }); } // R57 휴지 산
  }
  function startE04(m) {
    const tu = m.ev.tuning || {};
    m.packs = tu.packs || E04T.packs; m.cap = tu.cartCap || E04T.cap; m.limit ||= tu.timeLimitSec || E04T.timeLimitSec; m.hits = 0;
    m.slide = d4.startSlide({ collide: ctx.collide, onEvent: onSlideEvent, t: { ...E04T, packs: m.packs, cap: m.cap, okMin: tu.okMinPacks || E04T.okMin, scoopMaxSpeed: tu.scoopMaxSpeed || E04T.scoopMaxSpeed } });
    const P = D4_SPOTS.pallet; sfx.cue('item-wobble', { pos: { x: P.x, y: 1, z: P.z } }); setTimeout(() => alive && (sfx.cue('tissue-tumble'), sfx.cue('item-fall', { pos: { x: P.x, y: 0.4, z: P.z }, kg: 4.5 })), 450);
  }
  const hitsE04 = (m) => m.hits; // 손님·직원과 부딪힌 수 (랙은 안 셈 — judge.bumps)
  const resultE04 = (m) => evalE04({ returned: m.slide.S.returned, collisions: hitsE04(m), engaged: m.slide.S.scooped > 0 || m.slide.S.kicks > 0 }, { ...E04T, packs: m.packs, okMin: m.ev.tuning?.okMinPacks || E04T.okMin });
  function stopE04(m) {
    const sl = m.slide, S = sl.S, left = sl.loose().length, back = { ...(m.final || target('tissue-pyramid')), step: `반납 ${S.returned}/${m.packs}` };
    if (S.carried && (S.carried >= m.cap || !left)) return { ...back, label: `${back.label} · 카트에 ${S.carried}팩` };
    const p = sl.nearestLoose(st.cart.x, st.cart.z);
    if (!p) return back;
    // 굴러가는 팩을 따라가되 0.75 m 넘게 움직였을 때만 목표 갱신 (경로 다시 풀기 줄임)
    const k = m.packTg; if (!k || k.i !== p.i || Math.hypot(k.x - p.x, k.z - p.z) > 0.75 || sl.P[k.i].state !== 'loose') m.packTg = { i: p.i, x: p.x, z: p.z };
    const g = m.packTg;
    return { id: 'bodeul-pack', label: `굴러간 보들범 · 남은 ${left}팩`, x: g.x, z: g.z, ax: g.x, az: g.z, r: 1.0, y: 1.9, step: `반납 ${S.returned}/${m.packs}`, wi: g.i };
  }
  function tickE04(m, t) {
    m.hits += shopperContacts(m);
    const left = (m.limit || E04T.timeLimitSec) - t;
    if (left < 10 && left > 0 && Math.floor(left) !== m.tickS) { m.tickS = Math.floor(left); sfx.cue('timer-tick'); }
    if (m.slide.S.returned >= m.packs) { arrived(); endMission(resultE04(m), resumeOf(m)); return; }
    if (left <= 0) { const r = resultE04(m); endMission(r, r === 'missed' ? (m.L.onMissed || resumeOf(m)) : resumeOf(m)); }
  }
  function startE12(m) {
    m.esc = createEscort({ t: { ...E12T, speedLimit: m.ev.tuning?.speedLimit || E12T.speedLimit } });
    const kw = (m.L.waypoints || m.ev.waypoints || []).find((w) => w.rider);
    m.kidAt = { ...(target(m.L.kidAt || kw?.target || 'kid-spot') || D4_SPOTS.kid), label: kw?.label || '꼬마 손님 태우기' };
    m.kidAt.ax ??= m.kidAt.x; m.kidAt.az ??= m.kidAt.z;
    d4.kid('standing', m.kidAt); d4.desk(true);
    sfx.cue('kid-giggle', { pos: { x: m.kidAt.x, y: 1, z: m.kidAt.z } });
  }
  function kidBump(m) {
    if (!m.esc.bump(now())) return;
    sfx.cue('kid-cry', { pos: { x: st.cart.x, y: 1, z: st.cart.z } }); updateChip(true);
    if (!m.esc.failed()) vn.toast({ face: face('beomi'), name: '범이', text: '앗, 쿵! 꼬마가 놀랐어요… 한 번만 더 부딪히면 울어요', ms: 2800 });
  }
  function tickE12(m, dt) {
    const e = m.esc, S = e.S, sp = cartSpeed();
    if (!S.boarded) {
      if (now() - m.t0 >= (m.L.timeoutSec || m.ev.tuning?.timeoutSec || E12T.timeoutSec)) { d4.kid('off'); endMission('missed', m.L.onMissed || resumeOf(m)); return; } // 180초 안 태움 → 범이가 데려감
      if (st.hasCart && sp <= E12T.boardMaxSpeed && Math.hypot(st.cart.x - m.kidAt.x, st.cart.z - m.kidAt.z) < (m.kidAt.r || E12T.boardR) && !lock.vn) {
        e.board(); d4.kid('riding'); sfx.cue('kid-giggle'); arrived(); m.arrivedKey = null;
        vn.toast({ face: face('beomi'), name: '범이', text: '꼬마 손님 탑승! 고객센터까지 천천히요 · 1.0 m/s 이하', ms: 3400 });
        updateChip(true);
      }
      return;
    }
    if (shopperContacts(m, E12T.bumpGapSec)) kidBump(m);
    if (e.tick(dt, sp)) { sfx.cue('speed-warn'); vn.toast({ face: face('beomi'), name: '범이', text: `천천히요! 꼬마 손님이 타고 있어요 (${sp.toFixed(1)} m/s → 1.0 이하)`, ms: 2400 }); }
    updateChip(true);
    if (e.failed()) { d4.kid('off'); vn.toast({ face: face('beomi'), name: '범이', text: '으앙… 괜찮아, 괜찮아. 제가 고객센터로 데려갈게요!', ms: 3200 }); endMission('fail', resumeOf(m)); return; }
    if (m.final && meNear(m.final) && sp <= E12T.boardMaxSpeed) { e.arrive(); arrived(); sfx.cue('door-chime'); endMission(e.result(), resumeOf(m)); }
  }
  function endE12(m, result) {
    const ok = result === 'success' || result === 'partial';
    if (ok) { d4.kid('desk', { x: D4_SPOTS.desk.x, z: D4_SPOTS.desk.z + 1.05 }); setTimeout(() => { if (alive && d4.kidState === 'desk') d4.kid('off'); }, 12000); } // 창구 앞에 내려 줌 → 잠시 뒤 보호자와 감
    else { d4.kid('off'); d4.desk(false); }
  }
  function noteE12(m) {
    const S = m.esc.S;
    if (!S.boarded) return '꼬마 손님 옆에 카트를 살살 대 주세요 (0.6 m/s 이하)';
    const sp = cartSpeed(), over = sp > E12T.speedLimit + 0.02;
    return `${over ? '⚠ 천천히!' : '✓'} 속도 ${sp.toFixed(1)} m/s (1.0 이하) · 충돌 ${S.bumps}${S.overSec >= 0.5 ? ` · 과속 ${S.overSec.toFixed(1)}초` : ''}`;
  }
  // ---------- 5일차: E05 수상한 손님 미행 · E06 바닥은 용암입니다 (판정·상태·소품은 day5.js) ----------
  let hideSpots = null, meLast = null, meSpeed = 0, d5HudT = 0, susCueT = 0, lavaHissT = 0, burnToastT = 0;
  function rackEnds() { // 랙(긴 사각형) 끝 = 숨을 자리
    if (hideSpots) return hideSpots;
    hideSpots = [];
    for (const o of ctx.obstacles || []) {
      if (o.npc || o.story || o.x0 < -900) continue;
      const w = o.x1 - o.x0, d = o.z1 - o.z0, cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
      if (d > 6 && w < 3) hideSpots.push([cx, o.z0 - 0.6], [cx, o.z1 + 0.6]); else if (w > 6 && d < 3) hideSpots.push([o.x0 - 0.6, cz], [o.x1 + 0.6, cz]);
    }
    return hideSpots;
  }
  function startE05(m) {
    const f = m.L.follow || m.ev.follow || {};
    const t = { ...E05T, minDist: f.minDistM ?? E05T.minDist, maxDist: f.maxDistM ?? E05T.maxDist, loseSec: f.loseSec ?? E05T.loseSec, spottedMax: f.spottedMax ?? E05T.spottedMax, photoAt: f.photoAtGrab ?? E05T.photoAt, photoWindowSec: f.photo?.windowSec ?? f.photoWindowSec ?? E05T.photoWindowSec, durationSec: m.limit || E05T.durationSec };
    m.tail = createTail({ route: buildSpyRoute(TG, t), t, onEvent: (k, a) => onTailEvent(m, k, a) });
    const n = shoppers?.puppet?.('spy', true);
    if (n && !n.active) { n.active = true; n.mesh.visible = true; }
    m.spyN = n; d5.tailHud(true); sfx.cue('motif.spy');
  }
  function onTailEvent(m, k, a) {
    const S = m.tail.S, pos = { x: S.x, y: 1, z: S.z }, tn = now();
    if (k === 'grab') { sfx.cue('item-pick', { pos }); updateChip(true); }
    else if (k === 'rise' && tn - susCueT > 1.5) { susCueT = tn; sfx.cue('suspicion-rise'); }
    else if (k === 'spotted') {
      sfx.cue('stinger.spotted'); vn.shakeChip();
      vn.toast({ face: face('spy'), name: nameOf('spy')[0], text: a >= E05T.spottedMax ? '거기 카트! 아까부터 따라오는 거 다 알아요.' : '…방금 누가 나를 봤소? 기분 탓인가.', ms: 2600 });
    }
  }
  function stopE05(m) {
    const S = m.tail.S, k = m.spyTg;
    if (!k || Math.hypot(k.x - S.x, k.z - S.z) > 1.0) m.spyTg = { x: S.x, z: S.z }; // 1 m 넘게 움직였을 때만 갱신
    const g = m.spyTg;
    return { id: 'spy-tail', label: `보라 모자 손님 · ${E05T.minDist}–${E05T.maxDist} m 유지`, x: g.x, z: g.z, ax: g.x, az: g.z, r: 0.01, y: 2.6, step: `담기 ${S.grabs}/10` };
  }
  function photoE05() {
    const m = mission; if (!m || m.id !== 'E05' || m.result || !m.tail || lock.vn) return;
    sfx.cue('camera-shutter'); d5.flash();
    const r = m.tail.photo();
    if (r === 'early') vn.toast({ face: face('beomi'), name: '범이', text: '아직이에요! 특가 상품 열 번째 담을 때요', ms: 2200 });
    else if (r === 'far') vn.toast({ face: face('beomi'), name: '범이', text: `너무 멀어요! ${E05T.maxDist} m 안에서 찍어요`, ms: 2200 });
    updateChip(true);
  }
  function endE05() {
    d5.tailHud(false);
    const n = shoppers?.puppet?.('spy', false); if (n) { n.restock = false; n.stopT = 4; }
  }
  function startE06(m) {
    const ids = m.L.lava?.safeZones || m.ev.lava?.safeZones || ['lava-lane-01', 'lava-link-01', 'lava-front-band', 'lava-goal'];
    const zones = ids.map((id) => (id === 'lava-goal' ? LAVA_GOAL : TG[id])).filter((r) => r && r.x0 != null);
    m.lava = createLava({ zones, goal: LAVA_GOAL, t: { ...E06T, timeLimitSec: m.limit || E06T.timeLimitSec, outsideFailSec: m.L.lava?.outsideFailSec ?? E06T.outsideFailSec }, onEvent: (k) => onLavaEvent(m, k) });
    d5.lava(true);
  }
  function onLavaEvent(m, k) {
    const tn = now();
    if (k === 'start') { sfx.cue('cart-joint'); vn.toast({ face: face('beomi'), name: '범이', text: '시작! 노란 선 밖은 용암이에요 · 바퀴 하나도 나가면 안 돼요', ms: 2600 }); }
    else if (k === 'burn') { d5.burn(true); vn.shakeChip(); if (tn - burnToastT > 2.5) { burnToastT = tn; vn.toast({ face: face('beomi'), name: '범이', text: '앗 뜨거! 바퀴가 선 밖이에요!', ms: 1600 }); } }
    else if (k === 'cool') d5.burn(false);
    else if (k === 'needWater') vn.toast({ face: face('beomi'), name: '범이', text: `범샘물이 ${cartHas('water')}/3팩이에요! 통로 01 에서 더 담아 와요`, ms: 2600 });
    else if (k === 'arrive') sfx.cue('item-place', { pos: { x: LAVA_GOAL.x, y: 0.5, z: LAVA_GOAL.z }, kg: 12 });
  }
  function endE06() { d5.burn(false); } // 데칼은 그날 그대로 (R60)

  // ---------- 6일차: E07 폐점 후 카트 경주 · E08 새벽 3시 비밀 창고 칸 (판정·상태·소품은 day6.js) ----------
  //   경주 중엔 카트 최고 속도 ×1.6 (st.vMul — 평소 달리기 2.52 m/s 로는 3바퀴 228 m 를 75초에 못 돎), 손전등 끄면 ×0.6.
  //   금빛 박스 30 kg 는 카트 질량에만 더함(st.extraKg — 계산·영수증 무게엔 안 들어감). 경주용 범쌀(재고)은 경주 뒤 매대로 돌려놓음.
  const SHELF_AT = { x: 58.0, z: 115.2 }; // secret-shelf(58, 118.6)는 뒤 벽 진열(z 118.1–119.3)과 그 앞 낮은 단(z 115.95–116.85) 사이 좁은 틈 → 단 앞 바닥에서 꺼냄
  async function timeskip(L) {
    if (L.sfx) sfx.cue(L.sfx);
    if (L.bg === 'store-dark' || curDay() === 6) d6.night(2);
    await vn.clockCard({ clock: L.clock, sub: '불 꺼진 매장 · 손전등 모드' });
  }
  function setVMul() {
    const m = mission, on = m && !m.result;
    st.vMul = on && m.id === 'E07' && m.race?.S.phase === 'run' ? E07T.vMul : on && m.id === 'E08' && !d6.light ? E08T.offSpeedMul : 1;
  }
  function onFlash(on) { sfx.cue('flashlight-click'); setVMul(); updateChip(true); void on; }
  const posNow = () => (st.hasCart ? { x: st.cart.x, z: st.cart.z } : { x: st.me.x, z: st.me.z });
  function startE07(m) {
    const R = m.L.race || m.ev.race || {};
    m.rice0 = cartHas('rice');
    m.race = createRace({ course: raceCourse(TG), t: { ...E07T, laps: R.laps || E07T.laps, minLoadKg: R.minLoadKg || E07T.minLoadKg, timeLimitSec: m.limit || E07T.timeLimitSec, startWithinSec: m.L.startWithinSec || E07T.startWithinSec }, onEvent: (k, a) => onRaceEvent(m, k, a) });
    d6.night(Math.max(1, d6.nightLevel)); d6.raceLine(true); d6.hud('race'); d6.ghost(m.race.rivalPos());
  }
  function onRaceEvent(m, k, a) {
    if (k === 'lowLoad') { const l = LINES[m.L.onLowLoad || 'd6_035']; vn.toast({ face: face('beomsuk'), name: nameOf('beomsuk')[0], text: l?.text || '아직 50kg 안 돼요. 범쌀 한 포대 더요.', ms: 3200 }); sfx.cue('grab-bump'); vn.shakeChip(); }
    else if (k === 'count') { m.raceT0 = now(); d6.countdown(3); setTimeout(() => alive && mission === m && d6.countdown(2), 1000); setTimeout(() => alive && mission === m && d6.countdown(1), 2000); }
    else if (k === 'go') { d6.countdown('출발!'); setVMul(); sfx.cue('cart-joint'); }
    else if (k === 'lap') { const laps = m.L.race?.laps || E07T.laps, last = a === laps - 1; sfx.cue('lap-bell'); if (last) setTimeout(() => alive && sfx.cue('lap-bell'), 380); if (a < laps) vn.toast({ face: face('beomsuk'), name: nameOf('beomsuk')[0], text: last ? `마지막 바퀴! ${Math.max(0, Math.round(m.race.left()))}초 남았어요` : `${a}바퀴! 계속 가요`, ms: 1800 }); }
    else if (k === 'cp') arrived();
    else if (k === 'stumble') { sfx.cue('item-fall', { pos: { ...m.race.rivalPos(), y: 0.4 }, kg: 20 }); vn.toast({ face: face('beomi'), name: '범이', text: a === 1 ? '으악! 쌀 포대가 쏠려요!' : '또 꽈당… 손님 먼저 가요!', ms: 2000 }); }
    else if (k === 'rivalFinish') vn.toast({ face: face('beomi'), name: '범이', text: '도착! …제가 먼저예요?', ms: 2000 });
  }
  function stopE07(m) {
    const S = m.race.S, tg = (id, label) => ({ ...target(id), label });
    if (S.phase === 'wait') return loadKg() < (m.L.race?.minLoadKg || E07T.minLoadKg) ? { ...tg('aisle-02-rice', '범쌀 20kg (통로 02 · 재고, 계산 안 함)'), step: `짐 ${Math.round(loadKg())}/50kg` } : { ...tg('race-start', '출발선 (메인 통로 앞)'), step: '출발' };
    if (S.phase === 'count') return { ...tg('race-start', '출발선'), step: '준비' };
    const lap = `${Math.min(S.lap + 1, m.L.race?.laps || E07T.laps)}바퀴`;
    return S.cp === 0 ? { ...tg('timesale-endcap', '특가 매대 (교차 통로)'), step: lap } : S.cp === 1 ? { ...tg('aisle-01-eggs', '통로 01 계란 코너 · 살살'), step: lap } : { ...tg('race-start', '출발선'), step: lap };
  }
  function endE07(m) {
    d6.hud(null); d6.ghost(null); d6.raceLine(false); st.vMul = 1;
    const back = Math.max(0, cartHas('rice') - (m.rice0 || 0)); // 경주용 범쌀(재고)은 매대로 — 계산·영수증에 안 들어감
    if (back) { let n = back; try { api.returnItems?.((it) => it.p.id === 'rice' && n-- > 0); } catch (e) { console.warn('[story] rice return', e); } }
  }
  function startE08(m) {
    const T = m.L.stealth || m.ev.stealth || {}, fl = T.forklifts || [];
    const lanes = forkliftLanes(TG, fl.length ? fl.map((f) => f.route?.[0]) : undefined);
    const cps = [SHELF_AT, ...(T.checkpoints || []).slice(1).map((id) => target(id)).filter(Boolean).map((p) => ({ x: p.ax ?? p.x, z: p.az ?? p.z }))];
    m.stealth = createStealth({ lanes, speeds: fl.map((f) => f.speedMps), shelf: SHELF_AT, mat: target('entrance-mat'), cps, t: { ...E08T, timeLimitSec: m.limit || E08T.timeLimitSec, caughtMax: T.caughtMax || E08T.caughtMax, startWithinSec: m.L.startWithinSec || E08T.startWithinSec }, onEvent: (k, a, b) => onStealthEvent(m, k, a, b) });
    d6.night(2); d6.lifts(m.stealth.F.length); d6.gold('shelf', { x: SHELF_AT.x, z: 116.2 }); d6.setLight(true); d6.hud('stealth'); setVMul();
    sfx.cue('forklift-beep', { pos: { x: m.stealth.F[0]?.x || 60, y: 1, z: m.stealth.F[0]?.z || 77 } });
  }
  function onStealthEvent(m, k, a, b) {
    if (k === 'pick') { d6.gold('cart'); st.extraKg = E08T.boxKg; sfx.cue('item-pick'); arrived(); vn.toast({ face: face('halmeoni'), name: nameOf('halmeoni')[0], text: '쉿. 무겁지? 입구 매트까지 살살 가자.', ms: 3000 }); updateChip(true); }
    else if (k === 'cp') arrived();
    else if (k === 'spotStart') { const f = m.stealth.F.find((x) => x.seeT > 0) || m.stealth.F[0]; sfx.cue('forklift-beep', { pos: { x: f.x, y: 1, z: f.z } }); }
    else if (k === 'caught') { sfx.cue('forklift-spot'); vn.shakeChip(); vn.toast({ face: face('halmeoni'), name: nameOf('halmeoni')[0], text: a >= (E08T.caughtMax) ? '아이고, 또 걸렸네…' : '불빛에 걸렸어! 아까 그 자리로 돌아가자.', ms: 2600 }); void b; }
    else if (k === 'reset' && a) { try { if (st.hasCart) api._dbg.setCart(a.x, a.z, st.cart.yaw); else api._dbg.setMe(a.x, a.z, st.me.yaw); } catch (e) { console.warn('[story] reset', e); } }
    else if (k === 'arrive') sfx.cue('door-chime');
  }
  function stopE08(m) {
    const S = m.stealth.S;
    if (!S.picked) return { id: 'secret-shelf', label: '뒤쪽 벽 비밀 칸 (금빛 박스)', x: SHELF_AT.x, z: 116.2, ax: SHELF_AT.x, az: SHELF_AT.z, r: E08T.shelfR, y: 2.2, step: '1/2' };
    return { ...target('entrance-mat'), label: '입구 매트 · 지게차 불빛 피하기', step: '2/2' };
  }
  function endE08(m, result) {
    d6.lifts(0); d6.gold(null); d6.hud(null); st.extraKg = 0; st.vMul = 1; d6.setLight(true); if (d6.nightLevel >= 2) d6.night(1); // 잠입 끝 = 손전등 화면 끝, 새벽빛
    if (result === 'success' || result === 'partial') save.flags.recipeHalf = 1;
    if (result === 'fail') vn.toast({ face: face('halmeoni'), name: nameOf('halmeoni')[0], text: '괜찮아. 안에 뭐가 있는지 나는 알 것 같거든.', ms: 3000 });
  }
  let d6HudT = 0;
  /** 매 프레임: 경주(체크포인트·고스트) · 잠입(지게차 이동·불빛) */
  function d6Tick(dt) {
    const m = mission; if (!m || m.result || exitReq) return;
    if (m.id === 'E07' && m.race && !m.race.S.done) {
      if (lock.vn) return;
      const p = posNow(), S = m.race.step(dt, { ...p, kg: loadKg(), drops: staff.S.floorDrops, engaged: cartHas('rice') > (m.rice0 || 0) });
      d6.ghost(m.race.rivalPos());
      if (S.phase !== 'run' && st.vMul !== 1) setVMul();
      if ((d6HudT -= dt) <= 0) { d6HudT = 0.1; const R = m.race; d6.updateHud({ phase: S.phase, left: R.left(), lap: S.lap, laps: m.L.race?.laps || E07T.laps, rivalLap: S.rival.lap, stumbling: S.rival.stumble > 0, kg: loadKg(), drops: S.drops }); }
      if (S.phase === 'run') { const left = m.race.left(); if (left < 10 && left > 0 && Math.floor(left) !== m.tickS) { m.tickS = Math.floor(left); sfx.cue('timer-tick'); } }
    } else if (m.id === 'E08' && m.stealth && !m.stealth.S.done) {
      if (lock.vn) return;
      const S = m.stealth.step(dt, { ...posNow(), light: d6.light });
      d6.updateLifts(m.stealth.F, m.stealth.F.map((f) => f.seeT > 0));
      if ((d6HudT -= dt) <= 0) { d6HudT = 0.1; d6.updateHud({ picked: S.picked, caught: S.caught, seeing: m.stealth.F.some((f) => f.seeT > 0), left: (m.limit || E08T.timeLimitSec) - S.t }); }
    }
  }
  function tickE07(m) { const S = m.race.S; if (S.done && !m.ending) { m.ending = true; const r = m.race.result(); if (r !== 'missed') arrived(); endMission(r, r === 'missed' ? (m.L.onMissed || resumeOf(m)) : resumeOf(m)); } }
  function tickE08(m) { const S = m.stealth.S; if (S.done && !m.ending) { m.ending = true; const r = m.stealth.result(); endMission(r, r === 'missed' ? (m.L.onMissed || resumeOf(m)) : resumeOf(m)); } }

  // ---------- 7일차: E11 본사 감사 (체크 5칸 · 반기철 방해 3번 · 감사관 6 m 뒤) + E09 전설의 아이스크림 + E10 200kg (판정·소품은 day7.js) ----------
  //   E09·E10 은 따로 시작하지 않고 E11 안에서 돎. checkout.start 때 적재율·무게(c2·c3·E10) 기록, checkout.done 때 E09·E10·E11 한꺼번에 판정 → d7_039.
  const SPY_TAG = '반기철(반값)';
  function auditVals(m) {
    const kg = loadKg(), eggs = Math.max(0, staff.S.eggsToday - m.base.eggs);
    let vol = 0; try { const LV = api.LEVELS; if (LV) vol = items.reduce((a, it) => a + it.size[0] * it.size[1] * it.size[2], 0) / ((LV.upper?.vol || 0) + (LV.lower?.vol || 0) || 1); } catch { /* */ }
    return { kg, eggs, ratio: loadRatio(kg, vol) };
  }
  function snapAudit(m) { const v = auditVals(m); return { ...v, t: now() - m.t0 }; }
  function startE11(m) {
    const A = m.L.audit || {}, side = (m.L.sideMissions || []).find((x) => x.event === 'E09') || {};
    m.audit = createAudit({ blocks: (A.spyBlocks || []).map((b) => ({ ...b, rect: SPY_RECT[b.target] })).filter((b) => b.rect), t: { ...E11T }, onEvent: (k, b) => onAuditEvent(m, k, b) });
    m.melt = createMelt({ ...E09T, timeLimitSec: side.timeLimitSec || E09T.timeLimitSec, basePct: side.meltBasePctPerSec ?? E09T.basePct, bumpPct: side.bumpMeltPct ?? E09T.bumpPct });
    const post = target(A.auditorFollow?.startAt || 'auditor-post') || { x: 66, z: 6 };
    m.follow = createFollower({ start: { x: post.x, z: post.z }, distM: A.auditorFollow?.distM || E11T.followM });
    m.legendAt = target(side.target || 'freezer-legend'); m.eggs0 = staff.S.eggsToday; det.e11Eggs = staff.S.eggsToday;
    d7.legend('freezer'); d7.auditor({ x: post.x, z: post.z, yaw: Math.PI }); updateAuditHud(m, 0);
  }
  function onAuditEvent(m, k, b) {
    if (k === 'block') {
      const r = b.rect, ax = (r.x1 - r.x0) >= (r.z1 - r.z0) ? 'z' : 'x', far = -b.side; // 반기철은 막힌 곳 건너편에 섬
      d7.spyCart(r, far);
      const n = shoppers?.puppet?.('spy', true);
      if (n) { if (!n.active) { n.active = true; if (n.mesh) n.mesh.visible = true; } const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; n.x = ax === 'z' ? cx : far > 0 ? r.x1 + 0.7 : r.x0 - 0.7; n.z = ax === 'z' ? (far > 0 ? r.z1 + 0.7 : r.z0 - 0.7) : cz; n.yaw = Math.atan2(st.me.x - n.x, st.me.z - n.z); n.v = 0; n.stopT = 1; m.spyN = n; }
      sfx.cue(b.sfx || 'motif.spy'); vn.toast({ face: face('spy'), name: SPY_TAG, text: b.line || '여긴 못 지나가오.', ms: 3600 }); vn.shakeChip(); updateChip(true);
    } else {
      d7.spyCart(null); if (m.spyN) { shoppers?.puppet?.('spy', false); m.spyN = null; }
      if (k === 'dodge') { sfx.cue('check-stamp'); vn.toast({ face: face('beomi'), name: nameOf('beomi')[0], text: `방해 ${m.audit.dodged()}번 피했어요! 감사관님이 적었어요`, ms: 2200 }); }
      else { sfx.cue('tablet-tap'); vn.shakeChip(); }
      updateChip(true);
    }
  }
  function onAuditAudio(m, name, opts) {
    if (name === 'cart-bump') {
      m.melt.bump();
      const b = m.audit.ram(posNow()); if (b) reactions.fire('R62', { force: true, speaker: { ram: true } });
    }
    if (name === 'item-place' && m.melt.S.picked && (opts.kg || opts.product?.kg || 0) >= 10) { // 무거운 상품이 왕통 위로 → 눌림 +20% (계란 압력 판정과 같은 자리 비교)
      const top = items[items.length - 1], w = d7.legendWorld();
      if (top?.body && w && Math.abs(top.body.position.x - w.x) < 0.3 && Math.abs(top.body.position.z - w.z) < 0.3 && top.body.position.y > w.y) { m.melt.crushed(); sfx.cue('melt-drip'); vn.toast({ face: face('halmeoni'), name: nameOf('halmeoni')[0], text: '아이고, 눌렸어! 무거운 건 옆에 놔.', ms: 2400 }); }
    }
  }
  function pickLegend(m) {
    if (!st.hasCart) { if (!m.legendHint) { m.legendHint = true; vn.toast({ face: face('halmeoni'), name: nameOf('halmeoni')[0], text: '카트 가지고 와. 맨 손으론 금방 녹아.', ms: 2600 }); } return; }
    m.melt.pick(); d7.legend('cart', 0); sfx.cue('freezer-door'); sfx.cue('achievement'); arrived();
    vn.toast({ face: face('halmeoni'), name: nameOf('halmeoni')[0], text: '그거야, 범설빙 왕통! 150초 안에 계산대로. 살살.', ms: 3200 }); updateChip(true);
  }
  function updateAuditHud(m, t) {
    const v = m.co ? { ...m.co, eggs: auditVals(m).eggs } : auditVals(m), checks = auditChecks({ ...v, blocks: m.audit.B, sec: t });
    const lost = { c1: v.eggs > 0, c4: m.audit.failed() > 0, c5: t > E11T.timeLimitSec };
    d7.checklist({ checks, lost, vals: { c1: v.eggs ? `${v.eggs}개` : '', c2: `${Math.round(v.ratio * 100)}%`, c3: `${Math.round(v.kg + 27)}kg`, c4: `${m.audit.dodged()}/3`, c5: mmss(E11T.timeLimitSec - t) } });
  }
  function tickE11(m, t, dt) {
    m.audit.step(dt, posNow(), t); // 방해 시각은 감사 시계 기준
    const L = m.melt, S = L.S;
    if (!S.picked && m.legendAt && Math.hypot(st.me.x - m.legendAt.x, st.me.z - m.legendAt.z) < E09T.pickR) pickLegend(m);
    if (S.picked && !lock.vn) {
      L.step(dt); d7.legend('cart', S.melt); d7.melt({ melt: S.melt, left: L.left });
      if (S.melt >= E09T.alarmPct && !S.alarm) { S.alarm = true; sfx.cue('freezer-alarm'); }
      if ((m.dripT = (m.dripT ?? E09T.dripSec) - dt) <= 0) { m.dripT = E09T.dripSec; sfx.cue('melt-drip'); }
    }
    const left = E11T.timeLimitSec - t; if (left < 10 && left > 0 && Math.floor(left) !== m.tickS) { m.tickS = Math.floor(left); sfx.cue('timer-tick'); }
    updateAuditHud(m, t);
  }
  function stopE11(m) {
    if (!m.melt.S.picked && now() - m.t0 < 240 && !m.co) return { ...m.legendAt, label: '냉동 코너 맨 아래 칸 · 범설빙 왕통', step: '전설' };
    return { ...checkoutTarget(), step: m.melt.S.picked ? `계산 · 녹음 ${Math.round(m.melt.S.melt)}%` : '계산' };
  }
  function noteE11(m, t) { const v = auditVals(m); return `감사 ${mmss(E11T.timeLimitSec - t)} · ${Math.round(v.kg + 27)}/200kg · 방해 피함 ${m.audit.dodged()}/3${m.melt.S.picked ? ` · 녹음 ${Math.round(m.melt.S.melt)}%` : ''}`; }
  function finishE11(m) {
    const t = now() - m.t0, co = m.co || snapAudit(m), eggs = Math.max(0, staff.S.eggsToday - m.base.eggs);
    const checks = auditChecks({ eggs, ratio: co.ratio, kg: co.kg, blocks: m.audit.B, sec: t });
    const r9 = m.melt.result(), r10 = evalE10({ kg: co.kg, eggs }), r11 = evalE11(checks);
    save.ev.E09 = r9; save.ev.E10 = r10;
    save.audit = { checks, vals: { c1: eggs ? `${eggs}개` : '', c2: `${Math.round(co.ratio * 100)}%`, c3: `${Math.round(co.kg + 27)}kg`, c4: `${m.audit.dodged()}/3`, c5: mmss(Math.max(0, E11T.timeLimitSec - t)) }, melt: Math.round(m.melt.S.melt) };
    if (r10 === 'success' || r10 === 'partial') save.best.kg = Math.max(save.best.kg || 0, co.kg);
    arrived(); endMission(r11, m.L.onCheckout || m.L.resume || 'd7_039');
  }
  function endE11(m) {
    d7.clearMission(); d7.checklist(null); if (m.spyN) { shoppers?.puppet?.('spy', false); m.spyN = null; }
    const f = m.follow?.S; if (f) d7.auditor({ x: f.x, z: f.z, yaw: f.yaw });
  }
  /** 매 프레임: 감사관 따라오기 · 반기철 자리 고정 */
  function d7Tick(dt) {
    const m = mission; if (!m || m.id !== 'E11' || m.result || exitReq) return;
    const f = m.follow.step(dt, st.me); d7.auditor(f);
    if (m.spyN) { m.spyN.v = 0; m.spyN.stopT = 1; }
  }
  /** 대본 노드 ui (7일차): 체크리스트 칸 · 결과 고무도장 · 금도장 · 감사관 세우기 */
  function uiD7(L) {
    if (L.id >= AUDITOR_FROM && L.id < 'd7_180' && !mission) { const p = target('auditor-post'); if (p && !d7.stats().auditor) d7.auditor({ x: p.x, z: p.z, yaw: Math.PI }); }
    if (L.ui === 'checklist') d7.checklist({ list: true });
    else if (L.ui === 'checklist-result') d7.checklist({ checks: save.audit?.checks || {}, vals: save.audit?.vals, result: save.ev.E11 || 'fail' });
    else if (L.ui === 'stamp-card-gold') d7.goldStamp('금도장');
    else if (CHECKLIST_OFF.has(L.id)) d7.checklist(null);
  }
  /** d7_080: 엔딩 활기 = 12 + 사건별 활기 (오늘 E10·E09 포함, commit today) → A/B/C */
  function branchEnding(L) {
    const { vit, parts } = endingVitality(save.ev, EVENTS.endingVitality || {});
    const r = pickRange(vit, L.ranges);
    session.ending = { id: r?.ending || 'C', vit, parts };
    if (!save.replay && L.commit) { save.vitality = vit; save.flags.ending = r?.ending || 'C'; }
    persist();
    return r?.goto || L.ranges[L.ranges.length - 1].goto;
  }
  /** 매 프레임: 미행 spy 이동·의심 / 용암 바퀴 판정 (0.25초 틱보다 정확하게) */
  function d5Tick(dt) {
    const me = st.me; if (meLast) { const v = Math.hypot(me.x - meLast.x, me.z - meLast.z) / Math.max(dt, 1e-3); meSpeed += (v - meSpeed) * Math.min(1, dt * 8); } meLast = { x: me.x, z: me.z };
    const m = mission; if (!m || m.result || lock.vn || exitReq) return;
    if (m.id === 'E05' && m.tail && !m.tail.S.done) {
      const sp = st.hasCart ? cartSpeed() : meSpeed, hiding = sp < E05T.hideSpeed && rackEnds().some(([x, z]) => Math.hypot(me.x - x, me.z - z) < E05T.hideR);
      const S = m.tail.step(dt, { me, speed: sp, kg: st.hasCart ? loadKg() : 0, hiding, bump: m.bumpFlag }); m.bumpFlag = false; m.hiding = hiding;
      const n = m.spyN; if (n) { n.x = S.x; n.z = S.z; n.yaw = S.yaw; n.v = S.v; n.stopT = S.picking || S.turnT > 0 ? 1 : 0; n.restock = S.picking; n.pickSide = S.side; }
      if ((d5HudT -= dt) <= 0) { d5HudT = 0.1; const near10 = S.grabs >= 9 && !S.photo; d5.updateHud({ dist: S.dist, sus: S.sus, grabs: S.grabs, hot: near10, spotted: S.spotted }); }
    } else if (m.id === 'E06' && m.lava && !m.lava.S.done) {
      const S = m.lava.step(dt, { cart: st.hasCart ? st.cart : null, me, water: cartHas('water') });
      if (S.out && (lavaHissT -= dt) <= 0) { lavaHissT = 0.7; sfx.cue('lava-hiss'); }
    }
  }
  function tickE05(m, t) {
    const S = m.tail.S;
    if (S.done && !m.ending) { m.ending = true; const r = m.tail.result(); setTimeout(() => { if (alive && mission === m && !m.result) endMission(r, r === 'missed' ? (m.L.onMissed || resumeOf(m)) : resumeOf(m)); }, S.photo ? 900 : 300); }
    if (!S.done) { const left = (m.limit || E05T.durationSec) - t; if (left < 10 && left > 0 && Math.floor(left) !== m.tickS) { m.tickS = Math.floor(left); sfx.cue('timer-tick'); } }
  }
  function tickE06(m, t) {
    const S = m.lava.S, left = (m.limit || E06T.timeLimitSec) - m.lava.elapsed;
    if (S.started && left < 10 && left > 0 && Math.floor(left) !== m.tickS) { m.tickS = Math.floor(left); sfx.cue('timer-tick'); }
    if (S.done) { const r = S.result; if (r === 'success' || r === 'partial') arrived(); endMission(r, r === 'missed' ? (m.L.onMissed || resumeOf(m)) : resumeOf(m)); }
    void t;
  }
  function tickMission(dt) {
    const m = mission; if (!m || m.result) return;
    const t = now() - m.t0;
    tickTimed(m, m.id === 'E07' ? (m.raceT0 ? now() - m.raceT0 : -1) : t); // 경주 대사는 카운트다운부터
    const s = stopOf(m); m.stop = s;
    guide.set(s);
    // 지금 목표에 처음 닿으면 반짝 (진열대 · 최종 목표)
    const sk = s ? `${s.id}:${s.wi ?? ''}` : ''; if (s && s.id !== 'corral' && sk !== m.arrivedKey && meNear(s)) { m.arrivedKey = sk; if (s !== m.final) arrived(); }
    const engaged = m.taken || m.stickered.size > 0 || (m.id !== 'E06' && m.wps.some((w) => cartHas(w.item) > 0)) || m.near6 || m.id === 'E13' || m.slide?.S.scooped > 0 || m.esc?.S.boarded || m.tail?.S.contact || m.lava?.S.started || (m.race && (m.race.S.phase !== 'wait' || cartHas('rice') > (m.rice0 || 0))) || m.stealth?.S.picked;
    const recallAt = m.id === 'E05' || m.id === 'E06' ? 30 : AFTER_CO.has(m.id) ? E07T.recallSec : 90;
    if (m.id === 'E11') { if (!m.recalled && !m.melt.S.picked && t > 90) { m.recalled = true; recall(EVENTS.events.find((e) => e.id === 'E09')?.recallLine || '할머니가 냉동 코너에서 손님 기다리세요. 급하대요!'); } } // 감사는 놓침 없음 — 전설만 한 번 부름
    else if (!m.recalled && !engaged && (t > recallAt || (!AFTER_CO.has(m.id) && inCheckoutZone()))) { m.recalled = true; recall(EXIT.ignoreEvent.recallLines?.[m.id] || m.ev.recallLine || '손님! 한 번만 와 주세요!'); }
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
    } else if (m.id === 'E04') tickE04(m, t);
    else if (m.id === 'E12') tickE12(m, dt);
    else if (m.id === 'E05') tickE05(m, t);
    else if (m.id === 'E06') tickE06(m, t);
    else if (m.id === 'E07') tickE07(m);
    else if (m.id === 'E08') tickE08(m);
    else if (m.id === 'E11') tickE11(m, t, dt);
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
      const s = force ? (m.stop = stopOf(m)) : m.stop || stopOf(m), t = now() - m.t0; // 집기·체크포인트 직후(force)는 새 목표로
      let note = '안 가도 괜찮아요';
      if (m.id === 'E01' && m.taken) note = `깨진 알 ${Math.max(0, staff.S.eggsToday - m.base.eggs)}개 · 세 알까지는 범이가 바꿔 줘요`;
      if (m.id === 'E02') note = `${mmss((m.limit || 240) - t)} 안에 · 범란 조심`;
      if (m.id === 'E13') note = `급정거 ${m.brakes}번 · 쟁반 미끄러워요`;
      if (m.id === 'E14') note = `스티커 ${m.stickered.size}/${m.wps.length} · ${mmss((m.L.timeoutSec || 240) - t)}`;
      if (m.id === 'E03') note = `남은 시간 ${mmss((m.limit || 180) - t)} · 내 박스 ${boxesE03(m)} · 매대 ${Math.max(0, m.remaining)}`;
      if (m.id === 'E04') { const S = m.slide.S; note = `남은 시간 ${mmss((m.limit || E04T.timeLimitSec) - t)} · 반납 ${S.returned}/${m.packs} · 카트 ${S.carried}/${m.cap} · 충돌 ${hitsE04(m)}`; }
      if (m.id === 'E12') note = noteE12(m);
      if (m.id === 'E05') { const S = m.tail.S; note = `${mmss((m.limit || E05T.durationSec) - t)} · 거리 ${S.dist > 30 ? '30+' : S.dist.toFixed(0)} m · 의심 ${Math.round(S.sus)}%${m.hiding ? ' (숨음)' : ''}${S.spotted ? ` · 들킴 ${S.spotted}/2` : ''} · ${isMobile ? '촬영 버튼' : 'F 촬영'}`; }
      if (m.id === 'E07') { const S = m.race.S; note = S.phase === 'wait' ? `짐 ${Math.round(loadKg())}/50kg · 출발선에 서면 카운트다운` : S.phase === 'count' ? '셋, 둘, 하나…' : `남은 ${mmss(m.race.left())} · ${Math.min(S.lap + 1, 3)}/3바퀴 · 떨어뜨림 ${S.drops}`; }
      if (m.id === 'E08') { const S = m.stealth.S; note = `걸림 ${S.caught}/2 · 남은 ${mmss((m.limit || E08T.timeLimitSec) - S.t)} · 손전등 ${d6.light ? '켜짐' : '꺼짐(느리게·덜 띔)'} ${isMobile ? '버튼' : 'L'}`; }
      if (m.id === 'E11') note = noteE11(m, t);
      if (m.id === 'E06') { const L = m.lava, S = L.S; note = S.started ? `남은 ${mmss((m.limit || E06T.timeLimitSec) - L.elapsed)} · 선 밖 ${S.outsideSec.toFixed(1)}초 (3초까지) · 범샘물 ${cartHas('water')}/3` : `노란 선 안으로 들어가면 시작 · 범샘물 ${cartHas('water')}/3`; }
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
    const m = mission; if (m && !m.result && m.id === 'E11') { if (!m.co) m.co = snapAudit(m); return; } // 감사: 계산대 도착 때 적재율·무게
    if (!m || m.result || AFTER_CO.has(m.id)) return; // 계산 뒤 사건(E07·E08)은 계산과 상관없음
    if (m.id === 'E01') { if (!m.taken) return; const r = evalE01(m); m.result = 'pending'; setTimeout(() => { if (!alive || mission !== m) return; m.result = null; endMission(r, resumeOf(m)); }, 900); return; }
    if (m.id === 'E13') { if (lane === 6) { arrived(); endMission(evalE13(m), resumeOf(m)); } else endMission('missed', m.L.onMissed || resumeOf(m)); return; }
    if (m.id === 'E14' && m.L.onCheckout) { markMissed('E03'); endMission('missed', m.L.onCheckout); return; }
    if (m.id === 'E03') { endMission(evalE03(m) === 'missed' ? 'missed' : evalE03(m), resumeOf(m)); }
    if (m.id === 'E04' && m.slide.S.returned > 0) endMission(resultE04(m), resumeOf(m)); // 반납을 시작했으면 지금까지로 판정 (안 했으면 계산 끝에 놓침)
    if (m.id === 'E12' && m.esc.S.boarded) { vn.toast({ face: face('beomi'), name: '범이', text: '꼬마 손님은 제가 고객센터로 데려갈게요!', ms: 3000 }); endMission(m.esc.failed() ? 'fail' : 'partial', resumeOf(m)); }
  }
  function onCheckoutDone() {
    const w = waiters.done.splice(0); w.forEach((f) => f());
    save.best.receipt = items.map((it) => it.p.id); save.best.eggs = staff.S.eggsToday; // 영수증 기록 (내일 R50 · 칠판)
    if (mode() !== 'story') { persist(); return; }
    const j = job;
    if (j?.kind === 'roam' && (j.L.onMissed || j.L.onCheckout)) { setTimeout(() => job === j && alive && finishJob(j.L.onMissed || j.L.onCheckout, ROAM_EVENT[j.L.id]), 1200); return; }
    const m = mission; if (m && !m.result && m.id === 'E11') { finishE11(m); return; }
    if (!m || m.result || AFTER_CO.has(m.id)) { persist(); return; }
    // 사건 안 받고(또는 끝내기 전에) 계산 → 놓침
    const next = m.id === 'E01' ? (m.L.onMissed || 'd1_161') : (m.L.onCheckout || m.L.onMissed || resumeOf(m));
    setTimeout(() => { if (alive && mission === m && !m.result) { endMission('missed', next); for (const id of CHAIN_MISSED[m.L.id] || []) if (id !== m.id && !save.ev[id]) markMissed(id); } }, 1200);
  }
  async function endDay(L) {
    const d = curDay(), ids = mains(d), rs = ids.map((id) => (save.ev[id] && save.ev[id] !== 'active' ? save.ev[id] : 'missed')), res = rs[0];
    const replay = !!save.replay, week = L.ui === 'ending-card' || !!L.ending; // 7일차 엔딩
    d6.night(0); st.vMul = 1; st.extraKg = 0;
    if (week) { d7.auditor(null); d7.checklist(null); d7.clearMission(); }
    if (!replay) {
      if (L.vitality !== 'committed') ids.forEach((id, i) => { // 7일차는 d7_080 에서 이미 더함 (commit today)
        const r = rs[i], ev = EVENTS.events.find((e) => e.id === id);
        const gain = r === 'success' ? (ev?.reward?.vitality || 10) : r === 'partial' ? 6 : r === 'fail' ? 2 : 0;
        save.vitality = Math.min(100, save.vitality + gain);
        if (r === 'success') for (const [k, v] of Object.entries(ev?.reward?.affinity || {})) save.aff[k] = Math.min(5, (save.aff[k] || 0) + v);
      });
      const side = DAY_SIDE[d], sr = side && save.ev[side], sev = side && EVENTS.events.find((e) => e.id === side);
      if (L.vitality !== 'committed' && (sr === 'success' || sr === 'partial')) save.vitality = Math.min(100, save.vitality + (sr === 'success' ? (sev?.reward?.vitality || 5) : 2));
      if (sr === 'success') for (const [k, v] of Object.entries(sev?.reward?.affinity || {})) save.aff[k] = Math.min(5, (save.aff[k] || 0) + v);
      if (!save.cleared[d]) save.stamps = Math.min(7, save.stamps + (L.stamp ?? 1));
      save.cleared[d] = 1;
      save.yesterday = { eggs: staff.S.eggsToday, kg: Math.round(save.best.kg || loadKg()), receipt: save.best.receipt || [], at: Date.now() };
      save.day = (L.nextDay?.day) || d + 1;
    }
    save.replay = null; save.beat = null; save.beatDay = null; save.left = null; persist();
    if (week) { await endWeek(L, replay); return; }
    const RL = { success: '성공', partial: '부분 성공', fail: '실패', missed: '놓침' };
    const multi = ids.length > 1 ? `${ids.map((id, i) => `${EVENTS.events.find((e) => e.id === id)?.name || id} ${RL[rs[i]] || ''}`).join(' · ')}\n` : '';
    await vn.stampCard({ day: d, result: res, vitality: save.vitality, stamps: save.stamps, note: multi + (replay ? '다시 하기 · 도장과 활기는 처음 한 번만 받아요' : L.storeChange ? `매장 변화: ${L.storeChange}` : '') });
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

  /** 1주차 엔딩 카드 → A·B: 다음 주 카드('2주차 준비 중', w2_000 은 아직 없으니 따라가지 않음) / C: 1주차 재도전 (단골도·도장·업적·정체 공개 유지) */
  async function endWeek(L, replay) {
    const e = session.ending || (() => { const { vit, parts } = endingVitality(save.ev, EVENTS.endingVitality || {}); return { id: L.ending === 'C' ? 'C' : (pickRange(vit, LINES.d7_080?.ranges || [])?.ending || 'A'), vit, parts }; })();
    const id = L.ending === 'C' ? 'C' : e.id === 'C' ? 'B' : e.id, E = ENDING[id];
    const RL = { success: '성공', partial: '부분 성공', fail: '실패', missed: '놓침' }, ok = (r) => r === 'success' || r === 'partial';
    const n = Object.values(save.audit?.checks || {}).filter(Boolean).length;
    const rows = [save.audit && `감사 체크 ${n}/5${save.ev.E11 ? ` (${RL[save.ev.E11]})` : ''}`, `200kg 기립박수 ${RL[save.ev.E10] || '놓침'}`, `전설의 아이스크림 ${RL[save.ev.E09] || '놓침'}`].filter(Boolean);
    const extra = [ok(save.ev.E10) && "계산대 위 '오늘의 최고 카트' 액자", ok(save.ev.E09) && "냉동 코너 '오늘의 전설' 칸"].filter(Boolean).join(' · ');
    if (id !== 'C') sfx.cue('stinger.finale');
    await vn.endingCard({ ending: id, name: E.name, line: LINES[E.line]?.text, vitality: replay ? e.vit : save.vitality, stamps: save.stamps, sign: E.sign, rows, note: replay ? '다시 하기 · 도장과 활기는 처음 한 번만 받아요' : extra ? `매장 변화: ${extra}` : '' });
    session.ending = null;
    if (!alive) return;
    const nd = L.nextDay || {};
    if (replay) { vn.toast({ face: face('beomi'), name: '범이', text: '오늘은 마음껏 둘러보세요~', ms: 3200 }); updateChip(true); return; }
    if (id !== 'C') {
      await vn.nextDayCard({ head: '다음 주 예고', dayLabel: `${nd.week || 2}주차`, title: nd.title, hook: `${nd.hook || ''}\n(2주차 이야기는 준비 중이에요)`, buttons: [{ label: '확인', v: 'later' }], cue: nd.sfx || 'stinger.finale' });
      if (!alive) return;
      vn.toast({ face: face('beomi'), name: '범이', text: '1주차 끝! 2주차는 준비 중이에요 · 오늘은 마음껏 둘러보세요~', ms: 4200 }); updateChip(true);
      return;
    }
    retryWeek();
    const v = await vn.nextDayCard({ day: 1, title: nd.title, hook: nd.hook, head: '1주차 다시', buttons: [{ label: '다음에 와서 다시 하기', v: 'later' }, { label: '바로 1일차 시작', v: 'now', w: 1 }], cue: nd.sfx || 'stinger.nextday' });
    if (!alive) return;
    if (v === 'now') { npcsForDay(); runFrom(DAY_START[1]); return; }
    vn.toast({ face: face('beomi'), name: '범이', text: '다음에 들어오시면 1일차부터 다시예요!', ms: 4200 }); updateChip(true);
  }
  /** 엔딩 C: 활기·사건 기록은 1주차 처음으로, 단골도·도장·업적·정체 공개는 그대로 (flag.week1Retry = 1일차 대사 2차 작업용) */
  function retryWeek() {
    save.day = 1; save.vitality = EVENTS.endingVitality?.start ?? 12; save.ev = {}; save.cleared = {}; save.missed = null; save.audit = null;
    for (const fs of Object.values(DAY_FLAGS)) for (const f of fs) delete save.flags[f];
    save.flags.week1Retry = 1; save.beat = null; save.beatDay = null; persist();
  }

  // ---------- 하루 시작 / 돌아옴 / 나가기 ----------
  function npcsForDay() {
    if (mode() === 'story') makeCoins(); else removeCoins();
    if (mode() === 'story' && curDay() >= 5) d4.desk(true); // 4일차 끝부터 고객센터 창구 열림 (매장 변화)
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
  function clearActive(d) { for (const id of [...mains(d), DAY_SIDE[d], ...(EXTRA_EV[d] || [])]) if (id && save.ev[id] === 'active') save.ev[id] = null; }
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
      const wk2 = save.day > 7; // 1주차 엔딩 A·B 뒤: 2주차(w2_000)는 아직 없음
      const v = await vn.pickCard({ title: wk2 ? '1주차 완결!' : `${last}일차까지 다 봤어요!`, sub: wk2 ? '2주차 「경쟁 마트의 반격」은 준비 중이에요 · 그동안 다시 보거나 자유롭게 둘러보세요' : `${save.day}일차 이야기는 준비 중이에요 · 그동안 다시 보거나 자유롭게 둘러보세요`, buttons: [{ label: `${last}일차 다시 하기`, v: last }, { label: '1일차 다시 하기', v: 1, w: 1 }, { label: '자유 장보기', v: 'free', w: 1 }] });
      if (!alive) return;
      if (v === 'free') { session.mode = 'free'; npcsForDay(); vn.toast({ name: '자유 장보기', text: '오늘은 사건 없이 둘러봐요 · 설정에서 다시 스토리로 바꿀 수 있어요', ms: 3600 }); return; }
      save.replay = v; resetDay(v); persist(); npcsForDay(); runFrom(DAY_START[v]); return;
    }
    const d = curDay(), b = save.beat && save.beatDay === d && LINES[save.beat] ? save.beat : null;
    // exit-rules afterCheckout: 6일차 E07·E08 중 나갔으면 그 사건과 남은 6일차 사건은 놓침, 도장은 받음(계산은 끝남) → 6일차 끝 카드 → 7일차
    if (d === 6 && wasLeft?.kind === 'event' && b && AFTER_CO_BEAT.has(b)) {
      for (const id of ['E07', 'E08']) if (!save.ev[id] || save.ev[id] === 'active') { save.ev[id] = 'missed'; save.missed = { id, name: EVENTS.events.find((e) => e.id === id)?.name || id }; }
      persist(); runFrom('d6_100'); return;
    }
    // exit-rules auditExit: 7일차 감사 중 나갔으면 감사·체크·녹음 모두 처음으로 → d7_029(시작 선택지) 앞에 감사관 한마디
    if (d === 7 && b === 'd7_031') {
      clearActive(7); const p = target('auditor-post'); if (p) d7.auditor({ x: p.x, z: p.z, yaw: Math.PI });
      setTimeout(() => { if (alive) vn.toast({ face: face('auditor'), name: '본사 감사관', text: '…다시 처음부터 보겠습니다.', ms: 3600 }); }, 300);
      runFrom('d7_029'); return;
    }
    if (b && b !== DAY_START[d]) {
      const v = await vn.pickCard({ title: `${d}일차 이어서 하기`, sub: '나갔던 곳부터 이어서 해요 · 일차는 그대로예요', where: beatLabel(b), buttons: [{ label: '이어서 하기', v: 'resume' }, { label: '처음부터', v: 'restart', w: 1 }] });
      if (!alive) return;
      if (v === 'restart') { resetDay(d); nightFor(d, null); runFrom(DAY_START[d]); } else { clearActive(d); nightFor(d, b); runFrom(b); }
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
    // R58 고객센터 크레용 그림(5일차~, E12 뒤) · R60 사건 없이 노란 선 안으로만 20 m (E06 뒤)
    if (curDay() >= 5 && save.ev?.E12 && save.ev.E12 !== 'active' && Math.hypot(me.x - D4_SPOTS.desk.ax, me.z - D4_SPOTS.desk.az) < 3) fire('R58');
    if (curDay() >= 5 && save.ev?.E06 && save.ev.E06 !== 'active' && !mission && st.hasCart) {
      const ins = wheels(c).every(([x, z]) => LAVA_ZONES.some((r) => inRect(r, x, z)));
      det.lavaD = ins ? (det.lavaD || 0) + Math.hypot(c.x - (det.lcx ?? c.x), c.z - (det.lcz ?? c.z)) : 0; det.lcx = c.x; det.lcz = c.z;
      if (det.lavaD > 20) { fire('R60'); det.lavaD = 0; }
    }
    const hour = (() => { const w = window.__jj?.weather?.state; return typeof w?.hour === 'number' ? w.hour : new Date().getHours(); })();
    // R24 계산대 줄에서 40초 넘게 계산 시작을 못 함(내 줄만 느림)
    det.laneT = inLane && checkoutState().phase === 'idle' && sp < 0.2 ? (det.laneT || 0) + dt : 0; if (det.laneT > 40) { fire('R24'); det.laneT = 0; }
    // R47 밤(22시 이후) 지게차 통로 표지(57, 44) 8 m 안
    if (hour >= 22 && Math.hypot(me.x - 57, me.z - 44) < 8) fire('R47');
    // R48 수상한 손님(spy) 4 m 안 + 내 짐이 그 장바구니(약 6 kg)보다 무거움
    if (shoppers?.near('spy', me.x, me.z, 4) && kg > 6) fire('R48');
    // v0.7 R61 야간 조명 운전 30초 · R62 감사 중 계란 · R63 '오늘의 전설' 칸 · R64 '오늘의 최고 카트' 액자
    det.nightT = save.ev?.E07 && d6.nightLevel >= 1 && st.hasCart && sp > 0.3 ? (det.nightT || 0) + dt : 0; if (det.nightT > 30) { fire('R61'); det.nightT = 0; }
    if (mission?.id === 'E11' && !mission.result) { if (S.eggsToday > (det.e11Eggs ?? S.eggsToday)) fire('R62', { force: true }); det.e11Eggs = S.eggsToday; }
    if ((save.ev?.E09 === 'success' || save.ev?.E09 === 'partial') && Math.hypot(me.x - 81, me.z - 76.6) < 3) fire('R63');
    if ((save.ev?.E10 === 'success' || save.ev?.E10 === 'partial')) { const l7 = target('lane-07'); if (l7 && Math.hypot(me.x - l7.ax, me.z - l7.az) < 4) fire('R64'); }
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
      if (isMobile) vn.setHint(api.mobileHint?.()); // 모바일: 왼쪽 범창고 상자 대신 오른쪽 카드에 안내 한 줄
      // 레이아웃: 왼쪽 정보 상자 아래 [설정] [미션 칩] → interior 토스트들은 그 아래(colBottom)
      layout();
    }
    guide.setHidden(lock.vn || vn.blocking || (mode() !== 'story' && guide.target?.id !== 'exit'));
    d4Tick(dt); d5Tick(dt); d6Tick(dt); d7Tick(dt);
    if (tower?.visible && mission && mission.id === 'E01' && !mission.taken) { const tt = performance.now() / 1000; tower.userData.trays.forEach((m, i) => { m.rotation.z = Math.sin(tt * 2.6 + i * 0.25) * 0.004 * i; m.position.x = Math.sin(tt * 2.6 + i * 0.25) * 0.0035 * i * i / 6; }); }
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; if (!b.b.alive) { bubbles.splice(i, 1); continue; } const p = project(b.pos, b.y); if (p) { b.b.el.style.left = `${p.x}px`; b.b.el.style.top = `${p.y}px`; b.b.el.style.opacity = '1'; } else b.b.el.style.opacity = '0'; }
    reactions.tick({ dialog: lock.vn, payPanel: checkoutState().phase === 'pay', staffTalking: (staff.S.bubbleT || 0) > 0 });
  }
  let colBottom = 0;
  function layout() {
    const panel = document.querySelector('#depot-hud .dh-panel'); if (!panel) return;
    let pb = panel.getBoundingClientRect().bottom;
    if (isMobile) { // 폰: 왼쪽 위 둘째 줄(가방·구글 연동 칩)이 보이면 그 아래로 — 카트를 잡아 가방이 숨어도 연동 칩이 남음
      for (const e of document.querySelectorAll('#m-hud .m-row2-l > *')) { const r = e.getBoundingClientRect(); if (r.height > 2 && !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden') pb = Math.max(pb, r.bottom); }
    }
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
    if (mission && !mission.result) { save.ev[mission.id] = 'active'; if (mission.id === 'E13') props.tray(false); if (mission.id === 'E14') props.shelfStickers(null); if (mission.id === 'E04') d4.clearSlide(); if (mission.id === 'E12') { d4.kid('off'); d4.desk(false); } if (mission.id === 'E05') endE05(); if (mission.id === 'E06') { d5.burn(false); d5.lava(false); } if (mission.id === 'E07') endE07(mission); if (mission.id === 'E08') { d6.lifts(0); d6.gold(null); d6.hud(null); st.extraKg = 0; st.vMul = 1; } if (mission.id === 'E11') endE11(mission); }
    mission = null; job = null; guide.set(null); vn.setChip(null); if (tower) tower.visible = false; reactions.setEventCast(null);
    d6.night(0); st.vMul = 1; st.extraKg = 0; d7.auditor(null); d7.checklist(null); d7.clearMission();
    persist();
  }
  function resumeStory() {
    const d = curDay(), b = save.beat && save.beatDay === d && LINES[save.beat] ? save.beat : null;
    if (!SCRIPTS[d]) return;
    clearActive(d); nightFor(d, b);
    runFrom(b || DAY_START[d]);
  }
  /** 6일차 이어서 하기: 체크포인트가 마감 뒤면 조명도 그때처럼 */
  function nightFor(d, b) { d6.night(d === 6 && b ? (b >= 'd6_051' && b < 'd6_100' ? 2 : b >= 'd6_027' && b < 'd6_100' ? 1 : 0) : 0); }
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
      d4: () => ({ props: d4.stats(), slide: mission?.slide && { returned: mission.slide.S.returned, carried: mission.slide.S.carried, loose: mission.slide.loose().length, scooped: mission.slide.S.scooped, kicks: mission.slide.S.kicks, hits: hitsE04(mission), packs: mission.slide.P.map((p) => ({ i: p.i, x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), s: p.state })) }, esc: mission?.esc && { ...mission.esc.S }, kidAt: mission?.kidAt, final: mission?.final && { x: mission.final.x, z: mission.final.z, ax: mission.final.ax, az: mission.final.az, r: mission.final.r } }),
      d5: () => ({ props: d5.stats(), tail: mission?.tail && (({ x, z, yaw, v, seg, phase, grabs, dist, sus, spotted, contact, farT, photo, grab10T, done, result, reason, t }) => ({ x, z, yaw, v, seg, phase, grabs, dist, sus, spotted, contact, farT, photo, grab10T, done, result, reason, t }))(mission.tail.S), speed: mission?.tail?.route.speed, lava: mission?.lava && { ...mission.lava.S, elapsed: mission.lava.elapsed }, hiding: mission?.hiding, revealed: revealed(), spyName: nameOf('spy')[0] }),
      d6: () => ({ props: d6.stats(), vMul: st.vMul || 1, extraKg: st.extraKg || 0, race: mission?.race && (({ t, phase, runT, lap, cp, drops, done, result, reason, pace }) => ({ t, phase, runT, lap, cp, drops, done, result, reason, pace, rival: { ...mission.race.S.rival } }))(mission.race.S), stealth: mission?.stealth && { ...mission.stealth.S, F: mission.stealth.F.map((f) => ({ x: +f.x.toFixed(2), z: +f.z.toFixed(2), seeT: f.seeT })) } }),
      d7: () => ({ props: d7.stats(), audit: mission?.audit && { t: mission.audit.S.t, rams: mission.audit.S.rams, blocks: mission.audit.B.map((b) => ({ id: b.id, state: b.state, why: b.why, at: b.at, side: b.side })) }, melt: mission?.melt && { ...mission.melt.S }, follow: mission?.follow && { ...mission.follow.S }, co: mission?.co || null, vals: mission?.id === 'E11' ? auditVals(mission) : null, ending: session.ending, audit0: save.audit || null }),
      endingNow: () => endingVitality(save.ev, EVENTS.endingVitality || {}),
      photo: () => photoE05(),
      /** 테스트 전용: 대본 없이 사건 하나만 바로 시작 (저장 안 함). trial('E04') · trial('E12', {kidAt:'aisle-01-eggs'}) → 결과 Promise */
      trial: (id, o = {}) => { suspendStory(); exitReq = false; session.mode = 'story'; session.noPersist = true; vn.close(); const base = Object.values(LINES).find((l) => l.cmd === 'mission.start' && l.event === id) || {}; return startMission({ ...base, id: `_trial_${id}`, cmd: 'mission.start', event: id, next: null, resume: null, onMissed: null, onCheckout: null, timed: [], ...o }).then(() => { d6.night(0); return save.ev[id]; }); },
      skipMissionClock: (sec) => { if (mission) mission.t0 -= sec; if (job) job.t0 -= sec; }, takeTower: () => mission && !mission.taken && takeTower(), switchMode, cancelExit, exitReq: () => exitReq, fire: (id, o) => reactions.fire(id, { force: true, ...o }), setFreq: (f) => { session.freq = f; }, hits: () => hits.slice(), setDay: (d) => { save.day = d; save.beat = null; save.replay = null; }, setEv: (o) => { save.ev = { ...o }; save.audit = null; }, noPersist: () => { session.noPersist = true; }, npcs: () => npcsForDay(), coins: () => coins && coins.pts.map((c) => ({ ...c })), stagePZ: () => stagePhoneZombie(true),
      collide: (x, z, r = 0.3) => ctx.collide?.(x, z, r) || null, obstacles: () => (ctx.obstacles || []).filter((o) => !o.npc && o.x0 > -900).map((o) => ({ x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, story: o.story })) },
    dispose() {
      if (!leftSaved && (save.mode === 'story') && !session.noPersist) {
        const kind = talking ? 'dialogue' : mission && !mission.result ? 'event' : items.length && !flags.paid ? 'cart' : null;
        if (kind) save.left = { at: Date.now(), kind, n: items.length };
        persist(); // 하루(save.day)와 체크포인트(save.beat)는 그대로 — 나가기는 멈춤일 뿐
      }
      alive = false; runTok++; props.dispose(); d4.dispose(); d5.dispose(); d6.dispose(); d7.dispose(); st.vMul = 1; st.extraKg = 0; if (mission?.id === 'E05' || mission?.spyN) shoppers?.puppet?.('spy', false); guide.set(null); vn.setChip(null); removeCoins(); clearTimeout(paTimer); clearTimeout(stageTimer); window.removeEventListener('depot:sfx', onSfx); window.removeEventListener('depot:pa', onPa); for (const w of waiters.done) w(); vn.dispose(); sfx.dispose();
    },
  };
}
