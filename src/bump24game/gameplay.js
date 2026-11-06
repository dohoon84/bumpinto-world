// [bump24game] 게임 상태머신: 구경 → 바구니 → 5초 카운트다운 → 30초 → 계산(영수증) → 결과
//   하루 1회 랭킹(로컬 표시) + 무제한 연습. 시간 진행은 update(dt) 의 타임라인으로만(디버그 timeScale 로 멈춤 가능)
import { BY_ID, scoreOf } from './products.js';
import { loadBest, saveBest, pushLocalBoard, loadLocalBoard, rankedUsed, markRanked } from './ui.js';
import * as THREE from 'three';

export const PHASE = { BROWSE: 'browse', COUNTDOWN: 'countdown', PLAY: 'play', CHECKOUT: 'checkout', RESULT: 'result' };
export const COUNT_SEC = 5, PLAY_SEC = 30;
const COMBO_WINDOW = 1.6;
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const coarse = () => { try { return matchMedia('(pointer:coarse)').matches || document.body.classList.contains('mobile'); } catch { return false; } };

export function createGameplay({ interior, ui, sfx, storeId, storeName, onExitStore, getSelfName }) {
  const layout = interior.layout, saleIds = layout.saleIds, dateKey = layout.dateKey;
  let phase = PHASE.BROWSE, ranked = false;
  let countLeft = 0, playLeft = PLAY_SEC, clock = 0;
  let combo = 0, maxCombo = 0, lastGrabAt = -9, lastFacing = null, samePenalty = 0, grabDelay = 0, pending = 0, spills = 0;
  let runLog = [], startedAtMs = 0, urgentAcc = 0, lastSec = 99;
  const timeline = []; // { at, fn }
  const after = (sec, fn) => timeline.push({ at: clock + sec, fn });
  const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* */ } };
  const tmp = new THREE.Vector3();
  const basketScreen = () => { interior.basket.worldTop(tmp); tmp.y += 0.15; return interior.worldToScreen(tmp); };

  ui.setSale(saleIds.map((id) => BY_ID[id]).filter(Boolean));
  ui.resetTotal();
  ui.setHud({ time: PLAY_SEC, total: 0, kg: 0, maxKg: interior.basket.maxKg });

  function startCountdown() {
    ranked = !rankedUsed(storeId, dateKey);
    ui.setMode(ranked); ui.hideIntro();
    phase = PHASE.COUNTDOWN; countLeft = COUNT_SEC; lastSec = COUNT_SEC + 1;
    ui.showHud(true); ui.setHud({ time: PLAY_SEC, total: 0, kg: 0 });
    interior.cam.yaw = Math.PI; // 매장 안쪽을 보게
  }
  function startPlay() {
    phase = PHASE.PLAY; playLeft = PLAY_SEC; startedAtMs = performance.now(); runLog = []; combo = 0; maxCombo = 0; spills = 0; samePenalty = 0; lastFacing = null;
    if (ranked) markRanked(storeId, dateKey);
    ui.countdown(0); after(0.75, () => { if (phase === PHASE.PLAY) ui.countdown(null); });
    sfx.startWhistle(); vibrate(60);
  }

  // ---------- 담기 ----------
  function land(item, src) {
    const sale = saleIds.includes(item.id);
    const r = interior.basket.add(item, { sale });
    const pts = scoreOf(item, saleIds), now = clock;
    combo = now - lastGrabAt < COMBO_WINDOW ? combo + 1 : 1; lastGrabAt = now; maxCombo = Math.max(maxCombo, combo);
    runLog.push({ id: item.id, t: Math.round(performance.now() - startedAtMs), w: item.weight, sale, src });
    const s = basketScreen();
    sfx.pickup(combo); if (sale) sfx.sale();
    ui.float(s.x, s.y - 20, `+${won(pts)}원`, sale ? 'sale' : '', sale ? `${item.name} 2배!` : item.name);
    ui.sparkle(s.x, s.y, sale ? 16 : 9, sale ? ['#ffd400', '#ff2d55', '#fff'] : undefined);
    ui.combo(combo);
    vibrate(sale ? [18, 30, 18] : 16);
    if (r.overflow) spill();
  }
  function spill() {
    const n = Math.min(interior.basket.items.length, 3 + Math.floor(Math.random() * 3));
    const before = interior.basket.score;
    const out = interior.basket.spill(n);
    interior.spillItems(out); interior.slowmo(0.55);
    for (const it of interior.floorItems) if (!it.onBounce) it.onBounce = (x) => { if (x.bounces < 3) sfx.bounce(1 / x.bounces); };
    const lost = before - interior.basket.score;
    sfx.spill(); vibrate([60, 40, 90, 40, 60]); ui.flash();
    const s = basketScreen(); ui.burst(s.x, s.y - 30, '와르르!'); ui.float(s.x, s.y - 100, `-${won(lost)}원`, 'bad', '무게 초과 · 바닥에서 다시 주워요');
    combo = 0; spills++;
    runLog.push({ spill: out.map((p) => p.id), t: Math.round(performance.now() - startedAtMs) });
  }
  function tryGrab() {
    if (phase !== PHASE.PLAY) { if (phase === PHASE.BROWSE) return onAction(); return false; }
    if (grabDelay > 0 || interior.basket.stunned > 0) { return false; }
    const p = interior.player.position;
    const fi = interior.nearestFloorItem(p.x, p.z);
    if (fi) {
      const got = interior.pickupFloor(fi); if (!got) return false;
      pending++; interior.flyToBasket(got.item, got.from, () => { pending--; if (phase === PHASE.PLAY || phase === PHASE.CHECKOUT) land(got.item, 'floor'); });
      grabDelay = 0.18; return true;
    }
    const sh = interior.nearestShelf(p.x, p.z);
    if (!sh) { sfx.deny(); return false; }
    // 같은 진열칸 연타는 점점 느려짐 (앞줄이 빠지고 손이 깊이 들어감)
    samePenalty = sh.id === lastFacing ? Math.min(0.55, samePenalty + 0.09) : 0; lastFacing = sh.id;
    const got = interior.pickFromShelf(sh); if (!got) return false;
    pending++; interior.flyToBasket(got.item, got.from, () => { pending--; if (phase === PHASE.PLAY || phase === PHASE.CHECKOUT) land(got.item, 'shelf'); });
    grabDelay = 0.16 + (sh.slow || 0) + samePenalty;
    return true;
  }
  /** E / 탭: 상황별 행동 */
  function onAction(sense) {
    const s = sense || interior._lastSense || {};
    if (phase === PHASE.BROWSE) {
      if (!interior.hasBasket && s.nearBasket) { interior.grabBasket(); sfx.basketGrab(); vibrate(30); startCountdown(); return true; }
      if (s.nearExit) { onExitStore?.(); return true; }
      return false;
    }
    if (phase === PHASE.PLAY) return tryGrab();
    return false;
  }

  // ---------- 계산 ----------
  function beginCheckout() {
    phase = PHASE.CHECKOUT; ui.showGrab(false); ui.setHint(''); ui.edge(false);
    sfx.timeUp(); vibrate([80, 60, 80]); ui.banner('TIME UP!', 1300);
    after(1.25, () => ui.setFade(1, '계산대로', '삑 · 삑 · 삑'));
    after(1.6, () => {
      interior.clearFloor(); interior.setArrow(false); interior.setMode('checkout');
      ui.setFade(0); ui.showHud(false);
      const items = interior.basket.items.map((it) => ({ ...it }));
      const score = interior.basket.score, kg = interior.basket.weight;
      ui.receiptOpen(storeName, ranked); sfx.printer();
      const n = items.length, gap = n > 16 ? 0.2 : 0.3;
      for (let i = 0; i < n; i++) after(0.45 + i * gap, () => {
        const it = interior.basket.removeLast(); if (!it) return;
        interior.flyToScanner(it.item, () => { sfx.scan(i); ui.receiptLine(it.item, it.sale, scoreOf(it.item, saleIds)); const s = interior.worldToScreen(tmp.set(-3.2, 1.12, 1.85)); ui.sparkle(s.x, s.y, 5, ['#ff3b3b', '#fff']); });
      });
      const tEnd = 0.45 + n * gap + 0.45;
      after(tEnd, () => { ui.receiptTotal(score); sfx.printer(); });
      after(tEnd + 0.7, () => { sfx.kaching(); vibrate(40); });
      after(tEnd + 2.0, () => finish(items, score, kg));
    });
  }
  function finish(items, score, kg) {
    phase = PHASE.RESULT; ui.receiptClose();
    const bestPrev = loadBest(storeId);
    const isBest = score > bestPrev && score > 0;
    const best = saveBest(storeId, score);
    const name = getSelfName?.() || '나';
    if (ranked) pushLocalBoard(storeId, { name, score, at: Date.now(), dateKey, items: items.length });
    const payload = { v: 1, storeId, dateKey, seed: layout.seed, ranked, score, durationMs: PLAY_SEC * 1000, saleIds: saleIds.slice(), events: runLog.slice(), items: items.map((it) => ({ id: it.item.id, sale: !!it.sale })), weight: +kg.toFixed(3), spills, maxCombo };
    try { window.__jj = window.__jj || {}; window.__jj.bump24LastRun = payload; } catch { /* */ }
    sfx.fanfare(isBest);
    ui.showResult({
      score, best, isBest, ranked, kg, combo: maxCombo, spills,
      items: items.map((it) => ({ name: it.item.name, sale: it.sale })),
      onRetry: () => restart(), onExit: () => onExitStore?.(),
      onBoard: () => ui.showBoard(loadLocalBoard(storeId, dateKey).map((r) => ({ name: r.name, score: r.score, at: r.at })), { me: () => finish(items, score, kg) }),
    });
  }
  function restart() {
    ui.hideModal(); interior.basket.clear(); interior.clearFloor(); interior.restock(); interior.setArrow(true);
    interior.setMode('follow'); interior.setView(-1.0, 1.2, Math.PI, 0.5, 3.0);
    ui.resetTotal(); startCountdown();
  }

  // ---------- 매 프레임 ----------
  function update(dt, sense) {
    clock += dt; interior._lastSense = sense;
    for (let i = 0; i < timeline.length; i++) if (timeline[i].at <= clock) { const t = timeline.splice(i--, 1)[0]; t.fn(); }
    if (grabDelay > 0) grabDelay -= dt;
    const K = coarse() ? '' : '<kbd>E</kbd>';
    if (phase === PHASE.BROWSE) {
      ui.showGrab(false);
      if (ui.introOpen) ui.setHint('');
      else if (!interior.hasBasket && sense.nearBasket) ui.setHint(`${K}바구니 집기 — 5초 뒤 시작!`);
      else if (sense.nearExit) ui.setHint(`${K}매장 나가기`);
      else ui.setHint('입구 옆 <b style="color:#3aa6ff">파란 바구니</b>를 집으세요');
      return;
    }
    if (phase === PHASE.COUNTDOWN) {
      countLeft -= dt; const n = Math.ceil(countLeft);
      if (n !== lastSec && n > 0) { lastSec = n; ui.countdown(n, n === COUNT_SEC ? (ranked ? '오늘의 랭킹 도전!' : '연습 모드') : ''); sfx.countdown(n); vibrate(20); }
      ui.setHint('');
      if (countLeft <= 0) startPlay();
      return;
    }
    if (phase === PHASE.PLAY) {
      playLeft -= dt;
      const urgent = playLeft <= 5;
      ui.edge(urgent);
      if (urgent) { urgentAcc += dt; const step = playLeft <= 2.5 ? 0.25 : 0.5; if (urgentAcc >= step) { urgentAcc = 0; sfx.urgent(Math.floor(playLeft * 4)); } const s = Math.ceil(playLeft); if (s !== lastSec && s > 0) { lastSec = s; vibrate(25); } }
      ui.setHud({ time: playLeft, total: interior.basket.score, kg: interior.basket.weight, urgent });
      const target = sense.floorItem ? { name: sense.floorItem.item.name, price: sense.floorItem.item.price, floor: true } : sense.shelf ? { name: sense.shelf.item.name, price: sense.shelf.item.price } : null;
      ui.showGrab(true, !!target && grabDelay <= 0 && interior.basket.stunned <= 0, target?.floor ? '줍기' : '담기');
      if (interior.basket.stunned > 0) ui.setHint('와르르… 잠깐!');
      else if (target) { const sale = saleIds.includes(sense.shelf?.item.id || sense.floorItem?.item.id); ui.setHint(`${K}${target.name} <b style="color:${sale ? '#ffd400' : '#9fd0ff'}">${won(target.price)}원${sale ? ' ×2' : ''}</b>`); }
      else ui.setHint('');
      if (playLeft <= 0) { ui.setHud({ time: 0, urgent: false }); beginCheckout(); }
      return;
    }
    ui.showGrab(false); ui.setHint('');
  }

  return {
    get phase() { return phase; }, get ranked() { return ranked; }, get runLog() { return runLog; },
    get playLeft() { return playLeft; }, get pending() { return pending; },
    tryGrab, onAction, update, startCountdown, restart, beginCheckout,
    _skip(sec) { if (phase === PHASE.PLAY) playLeft = Math.min(playLeft, sec); if (phase === PHASE.COUNTDOWN) countLeft = Math.min(countLeft, sec); },
  };
}
