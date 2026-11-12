// [depot-story] 스토리 모드 (depot-story v0.4) — 첫 입장 모드 선택(스토리/자유), 1일차 대본(day1-script) + 사건 E01, 반응 R01–R50,
//   나가기·놓침·돌아옴 규칙(exit-rules), 소리 신호(audio-cues), 손님 NPC 일차별 등장. interior.js 가 매장 생성 뒤 지연 import.
//   저장: localStorage 'bw.depot.story.v1' (일차·본 대사·단골도·활기·도장·사건 상태·반응 횟수·어제 기록). 서버 저장 없음.
//   URL: ?depotMode=story|free|ask(모드 다시 고르기) · ?depotStoryReset=1(저장 지움) · shot=1 이면 depotMode 없을 때 자유+반응 끔(스샷 고정).
import SCRIPT from './data/day1-script.json';
import EVENTS from './data/events.json';
import EXIT from './data/exit-rules.json';
import NPCT from './data/npc-types.json';
import { createVN } from './vn.js';
import { createReactions } from './reactions.js';
import { createStorySfx } from './sfx.js';
import { cashierAt } from './cashiers.js';

const KEY = 'bw.depot.story.v1';
const LINES = Object.fromEntries(SCRIPT.map((l) => [l.id, l]));
const PORTRAIT = { beomsuk: 'beomsuk', beomi: 'beomi', halmeoni: 'halmeoni', spy: 'spy', cashier: 'kimmiso' };
const NAMES = { beomsuk: ['한범숙 주임', '매장 주임'], beomi: ['범이', '수습 알바'], halmeoni: ['말순 할머니', '시식 코너'], spy: ['반기철', '싹쓸마트'], pa: ['방송실 점장', '방송 중'], me: ['나', ''], cashier: ['계산원 김미소', '계산대 07'] };
const NPC_NAME = Object.fromEntries((NPCT.types || []).map((t) => [t.id, t.name]));
const EGG_TOWER = { x: 55.0, z: 28.6 }; // 통로 A '계란·유제품' 걸이 사인(53.9, 28) 아래, 랙 쪽에 붙임
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function loadSave() {
  const q = new URLSearchParams(location.search);
  if (q.get('depotStoryReset') === '1') { try { localStorage.removeItem(KEY); } catch { /* */ } }
  let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
  return Object.assign({ v: 1, mode: null, settings: { reactionFreq: 3, textSpeed: '보통', skipSeenOnly: false }, day: 1, seen: {}, aff: { beomsuk: 0, beomi: 0, halmeoni: 0, spy: 0 }, vitality: 12, stamps: 0, ev: {}, intro: {}, counts: {}, today: {}, once: {}, yesterday: null, left: null, lastVisit: 0, todayKey: '', missed: null, best: {} }, s);
}

export function createStory(ctx) {
  const { THREE, scene, keep, camera, st, items, loadKg, staff, checkout, shoppers, api, audio, isMobile, ASSET, getLevel } = ctx;
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
    if (who.startsWith('npc:')) { const n = shoppers?.list.find((x) => x.id === who.slice(4) && x.active); if (n) return { x: n.x, y: 0, z: n.z }; }
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
    let name = who.startsWith('npc:') ? NPC_NAME[who.slice(4)] || '손님' : (NAMES[who] || [who])[0];
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
    save, getMode: mode, getDay: () => save.day, getFreq: () => session.freq ?? save.settings.reactionFreq,
    deliver: (x) => { deliver(x); if (!session.noPersist) persist(); }, cue: (n) => sfx.cue(n),
  });

  // ---------- 이벤트 입력: 오디오 신호(interior 의 audio 탭) + 계산대 depot:sfx ----------
  const waiters = { done: [] };
  const flags = { grabbed: false, lastPick: null, paid: false };
  function onAudio(name, opts = {}) {
    if (!alive) return;
    if (name === 'cart-grab' && !flags.grabbed) { flags.grabbed = true; if (save.day === 1) reactions.fire('R10'); }
    if (name === 'item-pick') {
      const pid = opts.product?.id; flags.lastPick = pid;
      if (shoppers?.near('sale-hunter', st.me.x, st.me.z, 3)) reactions.fire('R19', { force: false });
    }
    if (name === 'item-place' && save.day >= 2 && save.yesterday?.receipt?.length) {
      const pid = opts.product?.id; if (pid && save.yesterday.receipt.includes(pid)) reactions.fire('R50');
    }
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
  const checkoutState = () => { try { return checkout.dbg.state(); } catch { return { phase: 'idle', lane: -1 }; } };

  // ---------- 대본 실행 ----------
  let running = false;
  const lineView = (L) => {
    const sp = L.speaker;
    const who = PORTRAIT[sp] ? PORTRAIT[sp] : null;
    const [name, title] = NAMES[sp] || ['', ''];
    return { who, name, title, expression: L.expression, pos: L.pos, enter: L.enter, text: L.text, emph: L.emph, fx: L.fx, pa: sp === 'pa', me: sp === 'me', narr: sp === 'narration', seen: !!save.seen[L.id] };
  };
  const motifDone = new Set();
  async function runFrom(id) {
    running = true;
    let cur = id;
    try {
      while (cur && alive) {
        const L = LINES[cur]; if (!L) break;
        if (L.choices) { const i = await vn.choose(L.choices); const c = L.choices[i]; for (const [k, v] of Object.entries(c.set || {})) { const [a, b] = k.split('.'); if (a === 'aff') save.aff[b] = Math.min(5, (save.aff[b] || 0) + v); } save.seen[cur] = 1; persist(); cur = c.goto; continue; }
        if (L.cmd === 'scene.start') { vn.close(); await vn.dayCard({ day: L.day, title: L.title, subtitle: L.subtitle, missed: save.missed?.name }); save.missed = null; cur = L.next; continue; }
        if (L.cmd === 'sfx') { sfx.cue(L.sfx); await sleep(vn.skipping ? 80 : 450); cur = L.next; continue; }
        if (L.cmd === 'mission.start') { save.seen[cur] = 1; save.intro[save.day] = 1; persist(); vn.close(); startMission(L.event); return; }
        if (L.cmd === 'branch') { cur = L.cases[mission?.result] || L.cases.partial; continue; }
        if (L.cmd === 'scene.checkout') { vn.close(); await waitCheckoutDone(); await sleep(600); cur = L.next; continue; }
        if (L.cmd === 'day.end') { vn.close(); await endDay(L); return; }
        if (L.speaker === 'pa' || L.cmd === 'pa') sfx.cue('pa-ding');
        if (PORTRAIT[L.speaker] && !motifDone.has(L.speaker)) { motifDone.add(L.speaker); sfx.cue(`motif.${L.speaker}`); }
        if (L.text) await vn.say(lineView(L));
        save.seen[cur] = 1; cur = L.next;
      }
    } finally { running = false; vn.close(); persist(); }
  }
  function waitCheckoutDone() { if (checkoutState().phase === 'done') return Promise.resolve(); return new Promise((r) => waiters.done.push(r)); }

  // ---------- 사건 E01: 흔들리는 범란 탑 ----------
  let mission = null, tower = null;
  function buildTower() {
    if (tower) { tower.visible = true; return; }
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
  function startMission(id) {
    const ev = EVENTS.events.find((e) => e.id === id); if (!ev) return;
    save.ev[id] = 'active'; persist();
    mission = { id, ev, t0: performance.now() / 1000, recalled: false, taken: false, result: null, base: null };
    buildTower(); vn.missionCard(ev); updateChip(true);
    reactions.setEventCast(ev.cast || []);
    sfx.cue('item-wobble', { pos: { x: EGG_TOWER.x, y: 1, z: EGG_TOWER.z } });
  }
  let chipT = 0;
  function updateChip(force) {
    if (!mission || mission.result || mode() !== 'story') { vn.setChip(null); return; }
    if (!force && (chipT -= 1) > 0) return; chipT = 8;
    if (!mission.taken) { const d = Math.round(Math.hypot(st.me.x - EGG_TOWER.x, st.me.z - EGG_TOWER.z)); vn.setChip({ name: mission.ev.name, where: `➜ 계란 코너 (통로 01) · ${d} m`, note: '안 가도 괜찮아요' }); }
    else { const broken = Math.max(0, staff.S.eggsToday - mission.base.eggs); vn.setChip({ name: mission.ev.name, where: `➜ 계산대까지 살살 · 깨진 알 ${broken}개`, note: '세 알까지는 범이가 몰래 바꿔 줘요' }); }
  }
  function takeTower() {
    mission.taken = true; mission.base = { eggs: staff.S.eggsToday, floor: staff.S.floorDrops };
    for (let i = 0; i < 5; i++) { try { api._dbg.drop('egg', 'upper', 0, 0.05, 0, false); } catch (e) { console.warn('[story] egg drop', e); } }
    tower.userData.trays.forEach((t, i) => { t.visible = i < 0; });
    vn.toast({ face: face('beomi'), name: '범이', text: '하나, 둘, 셋! 다섯 판 받았어요! 나머지는 제가 내릴게요. 살살이요!', ms: 4200 });
    sfx.cue('achievement'); updateChip(true);
  }
  function evaluate() {
    const broken = Math.max(0, staff.S.eggsToday - mission.base.eggs);
    const inCart = items.filter((it) => it.p.id === 'egg').length, missing = Math.max(0, 5 - inCart);
    mission.broken = broken; mission.missing = missing;
    return broken >= 11 || missing >= 3 ? 'fail' : broken >= 4 || missing > 0 ? 'partial' : 'success';
  }
  function onCheckoutStart() {
    if (mode() !== 'story' || !mission || mission.result || !mission.taken) return;
    mission.result = evaluate(); save.ev[mission.id] = mission.result; persist();
    sfx.cue(mission.result === 'success' ? 'stinger.success' : mission.result === 'fail' ? 'stinger.comicfail' : 'stinger.partial');
    reactions.setEventCast(null); updateChip(true);
    setTimeout(() => { if (alive && !running) runFrom('d1_040'); }, 900);
  }
  function onCheckoutDone() {
    const w = waiters.done.splice(0); w.forEach((f) => f());
    // 영수증 기록 (내일 R50 · 칠판)
    save.best.receipt = items.map((it) => it.p.id); save.best.eggs = staff.S.eggsToday;
    if (mode() !== 'story') { persist(); return; }
    if (mission && !mission.result && !mission.taken) { // 사건 안 받고 계산 → 놓침
      mission.result = 'missed'; save.ev[mission.id] = 'missed'; save.missed = { id: mission.id, name: mission.ev.name }; persist();
      reactions.setEventCast(null); updateChip(true); if (tower) tower.visible = false;
      setTimeout(() => { if (alive && !running) runFrom('d1_161'); }, 1200);
    }
  }
  async function endDay(L) {
    const res = mission?.result || 'missed';
    const ev = mission?.ev;
    const gain = res === 'success' ? (ev?.reward?.vitality || 10) : res === 'partial' ? 6 : res === 'fail' ? 2 : 0;
    save.vitality = Math.min(100, save.vitality + gain);
    if (res === 'success') for (const [k, v] of Object.entries(ev?.reward?.affinity || {})) save.aff[k] = Math.min(5, (save.aff[k] || 0) + v);
    save.stamps = Math.min(7, save.stamps + (L.stamp || 1));
    save.yesterday = { eggs: staff.S.eggsToday, kg: Math.round(save.best.kg || loadKg()), receipt: save.best.receipt || [], at: Date.now() };
    const day = save.day; save.day = day + 1; save.left = null; persist();
    await vn.stampCard({ day, result: res, vitality: save.vitality, stamps: save.stamps, note: L.storeChange ? `매장 변화: ${L.storeChange}` : '' });
    vn.toast({ face: face('beomi'), name: '범이', text: `${day + 1}일차 이야기는 준비 중이에요! 오늘은 마음껏 둘러보세요~`, ms: 4200 });
    mission = null; updateChip(true);
  }

  // ---------- 하루 시작 / 돌아옴 / 나가기 ----------
  function npcsForDay() {
    if (!shoppers) return;
    if (mode() === 'free') { shoppers.setActive(shoppers.list.map((n) => n.id)); return; }
    const v = save.vitality, cap = v <= 30 ? 2 : v <= 60 ? 4 : 8;
    const ids = (NPCT.types || []).filter((t) => (t.fromDay || 1) <= save.day).map((t) => t.id).slice(0, cap);
    shoppers.setActive(ids);
  }
  function comebackLine() {
    const L = save.left; if (!L) return null;
    const C = EXIT.leaveMidDay.comebackLines, days = (Date.now() - (L.at || 0)) / 864e5, same = dayKey(L.at) === dayKey();
    const pick = (grp) => { const ws = Object.keys(grp || {}); if (!ws.length) return null; const who = ws[Math.floor(Math.random() * ws.length)]; const arr = grp[who]; return { who, text: arr[Math.floor(Math.random() * arr.length)] }; };
    if (days >= 3) return pick(C.longAbsence3Days);
    if (L.kind === 'event') return pick(C.leftDuringEvent);
    if (L.kind === 'dialogue') return pick(C.leftDuringDialogue);
    if (L.kind === 'cart' && L.n) { const r = pick(C.leftWithCart); if (r) r.text = r.text.replace('{n}', L.n); return r; }
    return same ? pick(C.sameRealDay) : pick(C.nextRealDay);
  }
  async function beginStory() {
    npcsForDay(); vn.setInGame(true);
    const cb = comebackLine(); save.lastVisit = Date.now();
    const wasLeft = save.left; save.left = null; persist();
    if (cb) setTimeout(() => { if (!alive) return; const who = cb.who === 'cashier' ? 'cashier' : cb.who; vn.toast({ face: who === 'cashier' ? '' : face(who), name: (NAMES[who] || [who])[0], text: cb.text, ms: 4200 }); if (wasLeft?.n) setTimeout(() => alive && vn.toast({ name: '안내', text: '계산 안 한 카트는 비웠어요 · 기록은 그대로', ms: 3200 }), 600); sfx.cue('toast-pop'); }, 2000);
    vn.prefetch('beomsuk'); vn.prefetch('beomi');
    if (save.day === 1) {
      if (!save.intro[1]) { await sleep(700); if (alive) runFrom('d1_000'); return; }
      const st1 = save.ev.E01;
      if (st1 === 'active' || !st1) { startMission('E01'); return; } // 사건 처음 상태로 다시
      // 결과는 났는데 하루를 못 마치고 나갔으면: 계산 → 방송 → 하루 끝 부분부터
      mission = { id: 'E01', ev: EVENTS.events.find((e) => e.id === 'E01'), result: st1, taken: true, t0: 0 };
      runFrom(st1 === 'missed' ? 'd1_161' : 'd1_160');
      return;
    }
    // 2일차 이후: 대본 준비 중 — 일차 카드 + 놓침 한 줄 + 반응만
    await sleep(500); if (!alive) return;
    await vn.dayCard({ day: save.day, title: '준비 중인 이야기', subtitle: '오늘은 자유롭게 둘러보세요 · 반응은 그대로예요', missed: save.missed?.name });
    if (save.missed) {
      const ml = EXIT.ignoreEvent.missedLines?.[save.missed.id] || {}; const who = Object.keys(ml)[0];
      if (who) vn.toast({ face: face(who), name: (NAMES[who] || [who])[0], text: ml[who], ms: 4200 });
      save.missed = null; persist();
    }
    if (save.yesterday) setTimeout(() => alive && reactions.fire('R49', { vars: { eggsYesterday: save.yesterday.eggs ?? 0, kgYesterday: save.yesterday.kg ?? 0 } }), 5000);
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
    const hour = (() => { const w = window.__jj?.weather?.state; return typeof w?.hour === 'number' ? w.hour : new Date().getHours(); })();
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
      if (mission && !mission.result && mode() === 'story') {
        const t = performance.now() / 1000;
        if (!mission.taken && st.hasCart && Math.hypot(st.cart.x - EGG_TOWER.x, st.cart.z - EGG_TOWER.z) < 2.6 && !lock.vn) takeTower();
        const inCo = st.me.x > 14 && st.me.x < 54 && st.me.z > 5 && st.me.z < 13;
        if (!mission.taken && !mission.recalled && (t - mission.t0 > 90 || inCo)) {
          mission.recalled = true; sfx.cue('recall-call'); vn.shakeChip();
          vn.toast({ face: face('beomi'), name: '범이', text: EXIT.ignoreEvent.recallLines[mission.id] || '손님! 한 번만 와 주세요!', ms: 4000 });
        }
        updateChip(false);
      }
      // 레이아웃: 왼쪽 정보 상자 아래 [설정] [미션 칩] → interior 토스트들은 그 아래(colBottom)
      layout();
    }
    if (tower?.visible && mission && !mission.taken) { const tt = performance.now() / 1000; tower.userData.trays.forEach((m, i) => { m.rotation.z = Math.sin(tt * 2.6 + i * 0.25) * 0.004 * i; m.position.x = Math.sin(tt * 2.6 + i * 0.25) * 0.0035 * i * i / 6; }); }
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
    const rxTop = isMobile ? 58 : checkout.busy ? 70 : Math.max(colBottom + 8, (st.msgTop3 || 0));
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
  function switchMode(m) {
    if (m === mode()) return;
    session.mode = null; save.mode = m; persist();
    if (m === 'free') { // 스토리 → 자유: 하루 저장(나가기와 같음, 놓침 아님)
      if (mission && !mission.result) { save.ev[mission.id] = 'active'; }
      mission = null; vn.setChip(null); if (tower) tower.visible = false; reactions.setEventCast(null);
      npcsForDay(); vn.toast({ name: '자유 장보기', text: '스토리 하루는 저장했어요 · 사건·컷신 없이 둘러보세요', ms: 3200 });
    } else { // 자유 → 스토리: 저장된 일차 입구에서 다시
      try { api._dbg.setMe(70.5, 3.4, Math.PI); } catch { /* */ }
      vn.toast({ name: '스토리 모드', text: `${save.day}일차 입구에서 다시 시작해요`, ms: 2600 });
      beginStory();
    }
  }
  vn.onExit = () => { // 대화 중 나가기 → 저장하고 매장 밖으로
    save.left = { at: Date.now(), kind: running ? 'dialogue' : mission && !mission.result ? 'event' : items.length ? 'cart' : 'plain', n: items.length };
    leftSaved = true; persist(); vn.close(); ctx.onExit?.();
  };
  let leftSaved = false;
  start();
  return {
    tick, onAudio,
    get locked() { return lock.vn; },
    get mode() { return mode(); },
    colBottom: () => colBottom,
    vn, reactions, save,
    _dbg: { save: () => JSON.parse(JSON.stringify(save)), runFrom, startMission, mission: () => mission && { id: mission.id, taken: mission.taken, result: mission.result, recalled: mission.recalled }, takeTower: () => mission && !mission.taken && takeTower(), switchMode, fire: (id, o) => reactions.fire(id, { force: true, ...o }), setFreq: (f) => { session.freq = f; }, npcs: npcsForDay },
    dispose() {
      if (!leftSaved && (save.mode === 'story') && !session.noPersist) {
        const kind = running ? 'dialogue' : mission && !mission.result ? 'event' : items.length && !flags.paid ? 'cart' : null;
        if (kind) save.left = { at: Date.now(), kind, n: items.length };
        if (running && !save.intro[save.day]) save.intro[save.day] = 0;
        persist();
      }
      alive = false; window.removeEventListener('depot:sfx', onSfx); for (const w of waiters.done) w(); vn.dispose(); sfx.dispose();
    },
  };
}
