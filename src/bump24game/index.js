// [bump24game] BUMP24 30초 장보기 — 문 앞 '들어가기' · 지하철식 페이드 · 별도 내부 Scene · 게임
//   ?bp24=1&bp24game=1 (또는 ?bump24=1&bp24game=1). 매장 안에서는 바깥 UI 를 숨기고 게임 HUD + 나가기·음소거만.
//   모바일은 가로 전용: 세로면 '가로로 돌려주세요' 화면을 띄우고 게임 시간을 멈춤.
import { bump24GameEnabled } from './flag.js';
import { buildInterior } from './interior.js';
import { createBump24Sfx } from './sfx.js';
import { createBump24UI, loadBest, rankedUsed } from './ui.js';
import { createGameplay, PHASE } from './gameplay.js';
import { BY_ID, todayKey } from './products.js';

export { bump24GameEnabled } from './flag.js';

const FADE_SEC = 0.38;
const DOOR_R = 2.4;
const KEEP = new Set(['app', 'b24-root']);

export function mountBump24Game({
  renderer, getPlayer, getCorridor, canEnter = () => true, onInterior, getAudioLevel, getSelfName, getLook, toggleMute, isMobile = false,
  params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams(),
} = {}) {
  const search = typeof params?.get === 'function' ? `?${params}` : (typeof params === 'string' ? params : (location?.search || ''));
  if (!bump24GameEnabled(search)) return null;

  const sfx = createBump24Sfx({ getLevel: () => getAudioLevel?.() || { muted: false, volume: 1 } });
  let interior = null, game = null, active = false, busy = false, timeScale = 1;
  let fade = { t: 0, phase: '', title: '', sub: '', leaving: false };
  let returnPos = null, currentStore = null, lastNear = null;
  const mobile = () => isMobile || document.body.classList.contains('mobile');
  const portrait = () => mobile() && innerHeight > innerWidth;

  const ui = createBump24UI({
    onGrab: () => act(),
    onHintTap: () => { if (!active && lastNear) enterStore(lastNear); else act(); },
    onExit: () => leaveStore(),
    onMute: () => { if (toggleMute) toggleMute(); else sfx.setMuted(!sfx.muted); syncMute(); },
    onIntroGo: () => {},
  });
  function syncMute() { const lv = getAudioLevel?.(); ui.setMuted(sfx.muted || !!lv?.muted); }

  // ---------- 바깥 UI 숨기기/되돌리기 ----------
  const hidden = new Set();
  let mo = null;
  function hideEl(n) { if (!(n instanceof HTMLElement) || KEEP.has(n.id) || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'LINK') return; if (!n.classList.contains('b24-outside-hidden')) { n.classList.add('b24-outside-hidden'); hidden.add(n); } }
  function hideOutside() {
    for (const n of document.body.children) {
      if (n.id === 'm-hud') { for (const c of n.children) if (c.id !== 'm-joy') hideEl(c); continue; } // 조이스틱만 남김
      hideEl(n);
    }
    mo = new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) { if (n.parentElement === document.body && n.id !== 'm-hud') hideEl(n); else if (n.parentElement?.id === 'm-hud' && n.id !== 'm-joy') hideEl(n); } });
    mo.observe(document.body, { childList: true });
    const mh = document.getElementById('m-hud'); if (mh) mo.observe(mh, { childList: true });
  }
  function restoreOutside() { mo?.disconnect(); mo = null; for (const n of hidden) n.classList.remove('b24-outside-hidden'); hidden.clear(); }

  // ---------- 가로 고정 시도 ----------
  function tryLandscape() {
    if (!mobile()) return;
    try {
      const lock = () => screen.orientation?.lock?.('landscape')?.catch?.(() => {});
      if (document.fullscreenElement) lock();
      else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.then?.(lock)?.catch?.(() => {});
    } catch { /* 지원 안 하면 안내 화면으로 */ }
  }

  function stores() { try { return getCorridor?.()?.bp24?.stores || []; } catch { return []; } }
  function nearestDoor(pos) {
    let best = null, bd = DOOR_R;
    for (const st of stores()) { if (!st.door) continue; const d = Math.hypot(pos.x - st.door[0], pos.z - st.door[1]); if (d < bd) { bd = d; best = st; } }
    return best;
  }

  function enterStore(st) {
    if (active || busy || !canEnter()) return false;
    currentStore = st;
    const p = getPlayer?.()?.position; if (p) returnPos = { x: p.x, z: p.z };
    busy = true; fade = { t: 0, phase: 'out', title: st.name || 'BUMP24', sub: '띵동~ 어서오세요', leaving: false };
    ui.setHint(''); sfx.door(); tryLandscape();
    return true;
  }
  function buildRoom() {
    interior?.dispose();
    const storeId = currentStore?.id || 'seongnam-cityhall', storeName = currentStore?.name || 'BUMP24';
    interior = buildInterior({ renderer, storeId, storeName, look: getLook?.() || null, isMobile: mobile() });
    game = createGameplay({ interior, ui, sfx, storeId, storeName, getSelfName, onExitStore: () => leaveStore() });
    active = true;
    document.body.classList.add('b24-inside'); ui.setInside(true); hideOutside(); syncMute();
    ui.showHud(false);
    ui.intro({ storeName, ranked: !rankedUsed(storeId, interior.layout.dateKey), sale: interior.layout.saleIds.map((id) => BY_ID[id]).filter(Boolean), best: loadBest(storeId) });
    onInterior?.('bump24', interior);
  }
  function leaveStore() {
    if (!active || (busy && !fade.leaving && fade.phase)) return;
    busy = true; fade = { t: 0, phase: 'out', title: '밖으로', sub: '또 오세요!', leaving: true };
    ui.hideModal(); ui.hideIntro(); ui.receiptClose(); ui.showHud(false); ui.showGrab(false); ui.countdown(null); ui.setHint(''); ui.edge(false); ui.rotate(false);
    sfx.door();
  }
  function finishLeave() {
    onInterior?.('', null);
    interior?.dispose(); interior = null; game = null; active = false;
    document.body.classList.remove('b24-inside'); ui.setInside(false); restoreOutside();
    const p = getPlayer?.()?.position;
    if (p && currentStore?.door) { p.x = currentStore.door[0]; p.z = currentStore.door[1]; } else if (p && returnPos) { p.x = returnPos.x; p.z = returnPos.z; }
    currentStore = null; returnPos = null;
  }
  function tickFade(dt) {
    if (!fade.phase) return;
    fade.t += dt;
    const a = fade.phase === 'out' ? Math.min(1, fade.t / FADE_SEC) : Math.max(0, 1 - fade.t / FADE_SEC);
    ui.setFade(a, fade.title, fade.sub);
    if (fade.phase === 'out' && fade.t >= FADE_SEC) {
      if (fade.leaving) finishLeave();
      else if (!active) { try { buildRoom(); } catch (e) { console.warn('[bump24game]', e); busy = false; fade = { t: 0, phase: '' }; ui.setFade(0); return; } }
      fade = { t: -0.12, phase: 'in', title: '', sub: '', leaving: false };
    } else if (fade.phase === 'in' && fade.t >= FADE_SEC) { fade = { t: 0, phase: '' }; ui.setFade(0); busy = false; }
  }

  function outdoorTick(dt, pos) {
    if (active || busy) return;
    if (!pos) { if (lastNear) ui.setHint(''); lastNear = null; return; }
    const st = nearestDoor(pos); lastNear = st;
    ui.setHint(st ? `${mobile() ? '' : '<kbd>E</kbd>'}${st.name || 'BUMP24'} 들어가기 · 30초 장보기` : '');
  }

  function frame(dt, look, axes) {
    tickFade(dt);
    if (!active || !interior) return !!busy;
    const rot = portrait(); ui.rotate(rot);
    const gdt = rot ? 0 : dt * timeScale;
    const ph = game?.phase;
    const frozen = busy || rot || ui.introOpen || ph === PHASE.CHECKOUT || ph === PHASE.RESULT || ph === PHASE.COUNTDOWN;
    if (ui.introOpen && (axes?.f || axes?.s)) ui.hideIntro(); // 움직이면 소개 카드 닫힘
    const sense = interior.update(gdt, { look: rot ? [0, 0, 0] : look, axes: frozen ? { f: 0, s: 0, run: false } : axes, allowMove: !frozen });
    game?.update(gdt, sense);
    interior.render(renderer);
    return true;
  }
  function act() {
    if (!active || busy || !game || ui.rotating) return false;
    if (ui.introOpen) { ui.hideIntro(); return true; }
    return game.onAction();
  }
  function onKey(e) {
    if (e.repeat) return false;
    if (!active) { if (e.code === 'KeyE' && lastNear && !busy) return enterStore(lastNear); return false; }
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault?.(); act(); return true; }
    if (e.code === 'Escape' && game?.phase !== PHASE.PLAY) { leaveStore(); return true; }
    return true; // 매장 안에서는 다른 단축키(지도·채팅 등)를 막음
  }

  return {
    get active() { return active; }, get busy() { return busy; }, get zone() { return active ? 'bump24' : ''; }, get interior() { return interior; },
    outdoorTick, frame, onKey, enterStore, leaveStore,
    enterById: (id) => { const st = stores().find((s) => s.id === id); return st ? enterStore(st) : false; },
    view: () => (active && interior ? { scene: interior.scene, camera: interior.camera, cam: interior.cam } : null),
    dispose() { restoreOutside(); interior?.dispose(); ui.dispose(); interior = null; game = null; },
    _dbg: {
      get stores() { return stores(); }, get interior() { return interior; }, get game() { return game; }, ui, sfx,
      set timeScale(v) { timeScale = v; }, get timeScale() { return timeScale; },
      forceEnter: (id) => enterStore(stores().find((s) => s.id === id) || { id: id || 'seongnam-cityhall', name: 'BUMP24', door: null }),
      today: todayKey,
    },
  };
}
