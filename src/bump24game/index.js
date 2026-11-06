// [bump24game] BUMP24 30초 장보기 — 문 앞 프롬프트 · 페이드 전환 · 내부 장면 · 게임
//   ?bp24=1&bp24game=1 (또는 ?bump24=1&bp24game=1)
import { bump24GameEnabled } from './flag.js';
import { buildInterior } from './interior.js';
import { createBump24Sfx } from './sfx.js';
import { createBump24UI } from './ui.js';
import { createGameplay, PHASE } from './gameplay.js';

export { bump24GameEnabled } from './flag.js';

const FADE_SEC = 0.38;
const DOOR_R = 2.4;

/**
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {() => THREE.Object3D} opts.getPlayer
 * @param {() => object|null} opts.getCorridor  // corridor api with bp24.stores
 * @param {() => boolean} [opts.canEnter]
 * @param {(zone:string, inside:any)=>void} [opts.onInterior]
 * @param {() => {muted:boolean, volume:number}|null} [opts.getAudioLevel]
 * @param {() => string} [opts.getSelfName]
 */
export function mountBump24Game({
  renderer,
  getPlayer,
  getCorridor,
  canEnter = () => true,
  onInterior,
  getAudioLevel,
  getSelfName,
  params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams(),
} = {}) {
  const search = typeof params?.get === 'function'
    ? `?${params}`
    : (typeof params === 'string' ? params : (location?.search || ''));
  if (!bump24GameEnabled(search)) return null;

  const sfx = createBump24Sfx({ getLevel: () => getAudioLevel?.() || { muted: false, volume: 1 } });
  let ui = null;
  let interior = null;
  let game = null;
  let active = false;
  let busy = false;
  let fade = { t: 0, phase: '', title: '', sub: '' }; // out|wait|in
  let returnPos = null;
  let currentStore = null;
  let lastNear = null;

  ui = createBump24UI({
    onGrab: () => game?.tryGrab(),
    onAction: (k) => { if (k === 'scan') sfx.scan(); if (k === 'kaching') sfx.kaching(); },
  });

  function stores() {
    try { return getCorridor?.()?.bp24?.stores || []; } catch { return []; }
  }

  function nearestDoor(pos) {
    let best = null, bd = DOOR_R;
    for (const st of stores()) {
      if (!st.door) continue;
      const d = Math.hypot(pos.x - st.door[0], pos.z - st.door[1]);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  function enterStore(st) {
    if (active || busy || !canEnter()) return false;
    currentStore = st;
    const p = getPlayer?.()?.position;
    if (p) returnPos = { x: p.x, z: p.z, face: st.face ?? 0 };
    busy = true;
    fade = { t: 0, phase: 'out', title: st.name || 'BUMP24', sub: '장보러 들어가는 중…' };
    ui.setHint('');
    sfx.door();
    return true;
  }

  function buildRoom() {
    interior?.dispose();
    interior = buildInterior({
      storeId: currentStore?.id || 'seongnam-cityhall',
      storeName: currentStore?.name || 'BUMP24',
    });
    game = createGameplay({
      interior, ui, sfx,
      storeId: currentStore?.id || 'seongnam-cityhall',
      storeName: currentStore?.name || 'BUMP24',
      practice: false,
      getSelfName,
      onExitStore: () => leaveStore(),
    });
    active = true;
    onInterior?.('bump24', interior);
  }

  function leaveStore() {
    if (!active && !busy) return;
    busy = true;
    fade = { t: 0, phase: 'out', title: '밖으로', sub: '' };
    ui.hideModal();
    ui.showHud(false);
    ui.showGrab(false);
    ui.showCountdown(null);
    ui.setHint('');
    // mark leaving
    fade._leaving = true;
  }

  function finishLeave() {
    onInterior?.('', null);
    interior?.dispose(); interior = null; game = null;
    active = false;
    const p = getPlayer?.()?.position;
    if (p && returnPos) {
      p.x = returnPos.x; p.z = returnPos.z;
    } else if (p && currentStore?.door) {
      p.x = currentStore.door[0]; p.z = currentStore.door[1];
    }
    currentStore = null;
    returnPos = null;
  }

  function tickFade(dt) {
    if (!fade.phase) return;
    fade.t += dt;
    const a = fade.phase === 'out' ? Math.min(1, fade.t / FADE_SEC)
      : fade.phase === 'wait' ? 1
        : Math.max(0, 1 - fade.t / FADE_SEC);
    ui.setFade(a, fade.title, fade.sub);

    if (fade.phase === 'out' && fade.t >= FADE_SEC) {
      fade.phase = 'wait';
      if (fade._leaving) {
        finishLeave();
        fade = { t: 0, phase: 'in', title: '', sub: '' };
      } else if (!active) {
        try { buildRoom(); } catch (e) { console.warn('[bump24game]', e); busy = false; fade = { t: 0, phase: '', title: '', sub: '' }; ui.setFade(0); return; }
        fade = { t: 0, phase: 'in', title: '', sub: '' };
      } else {
        fade = { t: 0, phase: 'in', title: '', sub: '' };
      }
    } else if (fade.phase === 'in' && fade.t >= FADE_SEC) {
      fade = { t: 0, phase: '', title: '', sub: '' };
      ui.setFade(0);
      busy = false;
    }
  }

  function outdoorTick(dt, pos) {
    if (active || busy) return;
    if (!pos) { ui.setHint(''); lastNear = null; return; }
    const st = nearestDoor(pos);
    lastNear = st;
    if (st) ui.setHint(`<kbd>E</kbd>${st.name || 'BUMP24'} 들어가기`);
    else ui.setHint('');
  }

  function frame(dt, look, axes) {
    tickFade(dt);
    if (!active || !interior) return false;
    const frozen = busy || game?.phase === PHASE.CHECKOUT || game?.phase === PHASE.RESULT || game?.phase === PHASE.COUNTDOWN;
    const sense = interior.update(dt, { look, axes: frozen ? { f: 0, s: 0, run: false } : axes, allowMove: !frozen });
    game?.update(dt, sense);
    interior.render(renderer);
    return true;
  }

  function onKey(e) {
    if (e.code !== 'KeyE' || e.repeat) return false;
    if (!active) {
      if (lastNear) return enterStore(lastNear);
      return false;
    }
    if (busy) return true;
    const sense = {
      nearBasket: false,
      shelf: interior?.nearestShelf(interior.player.position.x, interior.player.position.z),
      nearExit: interior.player.position.z < 1.0 && Math.abs(interior.player.position.x) < 1.2,
    };
    // recompute nearBasket
    const gz = interior.grabBasketZone;
    sense.nearBasket = !interior.hasBasket && Math.hypot(interior.player.position.x - gz.x, interior.player.position.z - gz.z) < gz.r;

    // 나갈때
    if (game?.phase === PHASE.BROWSE && sense.nearExit && interior.hasBasket === false) {
      leaveStore();
      return true;
    }
    if (game?.phase === PHASE.BROWSE && sense.nearExit && !interior.hasBasket) {
      leaveStore();
      return true;
    }
    // 결과 화면에서는 무시
    if (game?.phase === PHASE.RESULT || game?.phase === PHASE.CHECKOUT) return true;
    return game?.onKeyE(sense) || false;
  }

  // 모바일: 힌트 옆 탭으로 들어가기 — 힌트 클릭
  ui.root.querySelector('#b24-hint').style.pointerEvents = 'auto';
  ui.root.querySelector('#b24-hint').addEventListener('click', () => {
    if (!active && lastNear) enterStore(lastNear);
    else if (active) {
      const gz = interior.grabBasketZone;
      const sense = {
        nearBasket: !interior.hasBasket && Math.hypot(interior.player.position.x - gz.x, interior.player.position.z - gz.z) < gz.r,
        shelf: interior.nearestShelf(interior.player.position.x, interior.player.position.z),
        nearExit: interior.player.position.z < 1.0,
      };
      game?.onKeyE(sense);
    }
  });

  return {
    get active() { return active; },
    get busy() { return busy; },
    get zone() { return active ? 'bump24' : ''; },
    get interior() { return interior; },
    outdoorTick,
    frame,
    onKey,
    enterStore,
    leaveStore,
    enterById: (id) => { const st = stores().find((s) => s.id === id); return st ? enterStore(st) : false; },
    view: () => (active && interior ? { scene: interior.scene, camera: interior.camera, cam: interior.cam } : null),
    dispose() {
      interior?.dispose();
      ui?.dispose();
      interior = null; game = null; ui = null;
    },
    // debug
    _dbg: {
      get stores() { return stores(); },
      forceEnter: (id) => enterByIdSafe(id),
      get interior() { return interior; },
      get game() { return game; },
    },
  };

  function enterByIdSafe(id) {
    const st = stores().find((s) => s.id === id) || { id: id || 'seongnam-cityhall', name: 'BUMP24', door: [1600, -5762], face: 0 };
    return enterStore(st);
  }
}
