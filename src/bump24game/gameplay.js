// [bump24game] 게임 상태머신: 구경 → 바구니 → 카운트다운 → 30초 → 계산 → 결과
import { BY_ID, scoreOf } from './products.js';
import { loadBest, saveBest, pushLocalBoard, loadLocalBoard } from './ui.js';

export const PHASE = {
  BROWSE: 'browse',       // 구경 (바구니 집기 전/연습 이동)
  COUNTDOWN: 'countdown',
  PLAY: 'play',
  CHECKOUT: 'checkout',
  RESULT: 'result',
};

const COUNT_SEC = 5;
const PLAY_SEC = 30;

export function createGameplay({ interior, ui, sfx, storeId, storeName, practice = false, onExitStore, getSelfName }) {
  let phase = PHASE.BROWSE;
  let t = 0;
  let countLeft = COUNT_SEC;
  let playLeft = PLAY_SEC;
  let combo = 0;
  let lastShelfId = null;
  let shelfCooldown = 0;
  let grabDelay = 0;
  let runLog = []; // { id, t, w } for later server
  let startedAt = 0;
  let resultShown = false;
  let modePractice = practice;

  const saleIds = () => interior.layout.saleIds;

  function vibrate(ms = 30) {
    try { navigator.vibrate?.(ms); } catch { /* */ }
  }

  function startCountdown() {
    phase = PHASE.COUNTDOWN;
    countLeft = COUNT_SEC;
    t = 0;
    ui.showHud(true);
    ui.setHud({ time: PLAY_SEC, score: 0, fill: 0 });
    ui.showCountdown(COUNT_SEC);
    sfx.countdown(COUNT_SEC);
  }

  function startPlay() {
    phase = PHASE.PLAY;
    playLeft = PLAY_SEC;
    startedAt = performance.now();
    runLog = [];
    combo = 0;
    ui.showCountdown(0);
    setTimeout(() => ui.showCountdown(null), 350);
    sfx.startWhistle();
    ui.showHud(true);
  }

  function beginCheckout() {
    phase = PHASE.CHECKOUT;
    ui.showGrab(false);
    ui.showCountdown(null);
    const items = interior.basket.items.map((it) => {
      const p = BY_ID[it.id];
      return { id: it.id, name: p?.name || it.id, price: it.price, sale: it.sale, weight: it.weight };
    });
    const score = interior.basket.score;
    // 자동 이동: 계산대 앞으로
    interior.player.position.set(-3.2, 0, 1.35);
    interior.player.rotation.y = Math.PI;
    interior.cam.yaw = Math.PI;
    interior.cam.pitch = 0.45;
    interior.cam.dist = 4.5;
    ui.showReceiptAnim(items, score, () => finish(items, score));
  }

  function finish(items, score) {
    phase = PHASE.RESULT;
    const bestPrev = loadBest(storeId);
    const isBest = !modePractice && score > bestPrev;
    const best = modePractice ? Math.max(bestPrev, score) : saveBest(storeId, score);
    if (!modePractice) {
      pushLocalBoard(storeId, {
        name: getSelfName?.() || '나',
        score,
        at: Date.now(),
        practice: false,
      });
    }
    if (isBest) sfx.fanfare();
    // confetti via DOM particles
    if (isBest) spawnConfetti();
    resultShown = true;
    // run log shaped for later server
    const payload = {
      storeId,
      dateKey: interior.layout.dateKey,
      practice: modePractice,
      score,
      startedAt,
      endedAt: performance.now(),
      saleIds: saleIds(),
      events: runLog.slice(),
      items: items.map((it) => ({ id: it.id, price: it.price, sale: !!it.sale, weight: it.weight })),
    };
    try { window.__jj = window.__jj || {}; window.__jj.bump24LastRun = payload; } catch { /* */ }

    ui.showResult({
      score, best, items, isBest, practice: modePractice,
      onRetry: () => restart(true),
      onPractice: () => restart(true),
      onExit: () => onExitStore?.(),
      onBoard: () => ui.showBoard(
        loadLocalBoard(storeId).map((r) => ({ name: r.name, score: r.score })),
        () => {},
      ),
    });
  }

  function spawnConfetti() {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:240;overflow:hidden';
    for (let i = 0; i < 48; i++) {
      const p = document.createElement('i');
      const c = ['#0072DD', '#3aa6ff', '#FFE14D', '#FF3B3B', '#fff'][i % 5];
      p.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-10px;width:8px;height:12px;background:${c};border-radius:2px;animation:b24conf ${1.6 + Math.random()}s linear forwards;transform:rotate(${Math.random() * 360}deg)`;
      layer.appendChild(p);
    }
    const st = document.createElement('style');
    st.textContent = `@keyframes b24conf{to{transform:translateY(110vh) rotate(720deg);opacity:0}}`;
    document.head.appendChild(st);
    document.body.appendChild(layer);
    setTimeout(() => { layer.remove(); st.remove(); }, 2800);
  }

  function restart(asPractice = true) {
    modePractice = asPractice;
    resultShown = false;
    ui.hideModal();
    interior.basket.clear();
    // reset player near entrance
    interior.player.position.set(0, 0, 0.9);
    interior.cam.yaw = 0; interior.cam.pitch = 0.62; interior.cam.dist = 7.2;
    // keep basket attached
    if (!interior.hasBasket) interior.grabBasket();
    runLog = [];
    combo = 0;
    startCountdown();
  }

  function tryGrab() {
    if (phase !== PHASE.PLAY && phase !== PHASE.BROWSE) return false;
    if (grabDelay > 0 || interior.basket.stunned) return false;

    const p = interior.player.position;

    // 바닥 상품 줍기 우선
    const fi = interior.nearestFloorItem(p.x, p.z);
    if (fi && interior.hasBasket) {
      const item = interior.pickupFloor(fi);
      if (!item) return false;
      const sale = saleIds().includes(item.id);
      const r = interior.basket.tryAdd(item, { sale });
      if (!r.ok && r.reason === 'overflow') {
        sfx.spill(); vibrate([40, 40, 60]);
        interior.addFloorItem(r.spill, p);
        ui.flashPop('와르르! 쏟아졌어요');
        combo = 0;
        return true;
      }
      if (r.ok) {
        combo++;
        sfx.pickup(combo);
        vibrate(15);
        ui.flashPop(`${item.name} +${scoreOf(item, saleIds()).toLocaleString('ko-KR')}원`);
        ui.sparkle?.();
        if (combo >= 2) ui.flashCombo(combo);
        grabDelay = 0.12;
        return true;
      }
    }

    if (!interior.hasBasket) {
      const st = interior.update(0, { look: [0, 0, 0], axes: { f: 0, s: 0, run: false }, allowMove: false });
      // nearBasket checked externally
      return false;
    }

    const shelf = interior.nearestShelf(p.x, p.z);
    if (!shelf) return false;

    // 같은 선반 연속 담기 페널티
    if (shelf.id === lastShelfId) shelfCooldown = Math.min(0.55, shelfCooldown + 0.08);
    else shelfCooldown = 0;
    lastShelfId = shelf.id;

    const item = interior.pickFromShelf(shelf);
    if (!item) return false;
    const sale = saleIds().includes(item.id);
    const r = interior.basket.tryAdd(item, { sale });
    if (!r.ok && r.reason === 'overflow') {
      sfx.spill(); vibrate([40, 40, 80]);
      interior.addFloorItem(r.spill, p);
      ui.flashPop('와르르! 무게 초과');
      combo = 0;
      grabDelay = 0.3;
      return true;
    }
    if (!r.ok) return false;

    combo++;
    const pts = scoreOf(item, saleIds());
    sfx.pickup(combo);
    vibrate(18);
    ui.flashPop(`${sale ? '🔥 ' : ''}${item.name} +${pts.toLocaleString('ko-KR')}원`);
    ui.sparkle?.();
    if (combo >= 2) ui.flashCombo(combo);
    runLog.push({ id: item.id, t: performance.now() - startedAt, w: item.weight, sale });
    grabDelay = 0.14 + shelfCooldown;
    ui.setHud({ score: interior.basket.score, fill: interior.basket.fill });
    return true;
  }

  function update(dt, sense) {
    if (grabDelay > 0) grabDelay -= dt;

    if (phase === PHASE.BROWSE) {
      ui.showGrab(!!sense.shelf && interior.hasBasket, true);
      if (sense.nearBasket && !interior.hasBasket) {
        ui.setHint('<kbd>E</kbd>장바구니 집기');
      } else if (interior.hasBasket && sense.shelf) {
        ui.setHint('<kbd>E</kbd>담기 · 연습 중 (게임 시작은 입구에서)');
      } else if (interior.hasBasket) {
        ui.setHint('진열대로 가서 담아 보세요 · <kbd>E</kbd>로 게임 시작(입구)');
      } else {
        ui.setHint('');
      }
      // 입구에서 E / 이미 바구니 있으면 카운트다운 시작은 index에서
      return;
    }

    if (phase === PHASE.COUNTDOWN) {
      ui.showGrab(false);
      ui.setHint('');
      countLeft -= dt;
      const n = Math.ceil(countLeft);
      if (n !== Math.ceil(countLeft + dt) && n >= 0) {
        ui.showCountdown(n);
        sfx.countdown(n);
      }
      if (countLeft <= 0) startPlay();
      return;
    }

    if (phase === PHASE.PLAY) {
      playLeft -= dt;
      const urgent = playLeft <= 5;
      if (urgent && Math.floor(playLeft * 4) !== Math.floor((playLeft + dt) * 4)) sfx.urgent();
      ui.setHud({ time: playLeft, score: interior.basket.score, fill: interior.basket.fill, urgent });
      ui.showGrab(!!sense.shelf || !!interior.nearestFloorItem(interior.player.position.x, interior.player.position.z), !interior.basket.stunned);
      if (playLeft <= 0) beginCheckout();
      return;
    }

    if (phase === PHASE.CHECKOUT || phase === PHASE.RESULT) {
      ui.showGrab(false);
      ui.setHint('');
    }
  }

  function onKeyE(sense) {
    if (phase === PHASE.BROWSE) {
      if (!interior.hasBasket && sense.nearBasket) {
        interior.grabBasket();
        sfx.basketGrab();
        ui.flashPop('장바구니!');
        // 바로 카운트다운
        startCountdown();
        return true;
      }
      if (interior.hasBasket && sense.nearExit) {
        // 입구에서 게임 시작
        startCountdown();
        return true;
      }
      if (interior.hasBasket) return tryGrab();
    }
    if (phase === PHASE.PLAY) return tryGrab();
    return false;
  }

  return {
    get phase() { return phase; },
    get practice() { return modePractice; },
    tryGrab,
    onKeyE,
    update,
    startCountdown,
    restart,
    beginCheckout,
    get runLog() { return runLog; },
  };
}
