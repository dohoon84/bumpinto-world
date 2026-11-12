// [depot] 범창고(BUMP DEPOT) 정자점 — 문 앞 'E 들어가기' · 페이드 · 별도 내부 Scene(지연 로드) · 나오면 전부 해제.
//   바깥: exterior.js 외피만. 안: interior.js(선반·상품·카트·cannon-es 물리)를 문 120 m 안에서 미리 import, 들어갈 때 생성, 나오면 dispose.
import { depotEnabled, DEPOT_SITE as S, DEPOT_SPAWN } from './flag.js';
import { buildDepotExterior } from './exterior.js';

export { depotEnabled, DEPOT_AT, DEPOT_SPAWN, DEPOT_SITE } from './flag.js';

const FADE = 0.35, DOOR_R = 4.2, PREFETCH_R = 120;

export function mountDepot({ renderer, scene, getPlayer, groundY, canEnter = () => true, onInterior, onPark, isMobile = false, params, getAudioLevel, getBgmPlayer, overlay = null } = {}) {
  const search = params ? `?${params}` : location.search;
  if (!depotEnabled(search)) return null;
  const ext = buildDepotExterior(scene, { groundY: groundY || (() => 0), overlay, getPos: () => getPlayer?.()?.position, mobile: isMobile, lot: new URLSearchParams(search.replace(/^\?/, '')).get('depotlot') !== '0' }); // [depot-ext] ?depotlot=0 이면 주차장 디테일 끔
  let mod = null, modP = null, interior = null, active = false, busy = false, near = false;
  let fade = { t: 0, phase: '', leaving: false };
  let audio = null, audioMod = null, audioP = null;
  const loadMod = () => (modP ||= import('./interior.js').then((m) => (mod = m)).catch((e) => { modP = null; console.warn('[depot]', e); return null; }));
  const loadAudio = () => (audioP ||= import('./audio.js').then((m) => (audioMod = m)).catch((e) => { audioP = null; console.warn('[depot-audio]', e); return null; }));

  const root = document.createElement('div'); root.id = 'depot-ui';
  root.innerHTML = '<div class="dp-hint" hidden></div><div class="dp-fade"><b>범창고 BUMP DEPOT</b><span></span></div><div class="dp-pa" hidden><i>딩동댕</i><span></span></div>';
  const st = document.createElement('style');
  st.textContent = `#depot-ui{position:fixed;inset:0;pointer-events:none;z-index:58;font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif}
#depot-ui .dp-hint{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(20,40,90,.88);color:#fff;padding:10px 18px;border-radius:999px;font-weight:800;font-size:15px;pointer-events:auto;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}
#depot-ui .dp-hint kbd{background:#f2b705;color:#13203d;border-radius:6px;padding:1px 7px;margin-right:8px;font-weight:900}
#depot-ui .dp-fade{position:absolute;inset:0;background:#0d1a33;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;gap:8px;transition:none}
body.depot-inside #ve-hud{display:none !important} /* 매장 안: 왼쪽 위 할 일 패널 접기(겹침 방지) */
#depot-ui .dp-fade b{font-size:30px;letter-spacing:1px}#depot-ui .dp-fade span{font-size:15px;color:#f2b705;font-weight:700}
#depot-ui .dp-pa{position:absolute;left:16px;top:42%;transform:translateY(-50%);max-width:280px;background:rgba(18,59,45,.9);color:#fff;border-left:4px solid #F2C230;border-radius:0 12px 12px 0;padding:10px 14px;font-size:13.5px;font-weight:700;line-height:1.45;box-shadow:0 8px 20px rgba(0,0,0,.25);pointer-events:none}
#depot-ui .dp-pa i{display:block;color:#F2C230;font-style:normal;font-size:11px;letter-spacing:.08em;margin-bottom:2px;font-weight:900}`;
  document.head.appendChild(st); document.body.appendChild(root);
  const hintEl = root.querySelector('.dp-hint'), fadeEl = root.querySelector('.dp-fade'), fadeSub = fadeEl.querySelector('span'), paEl = root.querySelector('.dp-pa');
  let paHide = 0;
  function showPa(text) {
    paEl.hidden = false; paEl.querySelector('span').textContent = text;
    clearTimeout(paHide); paHide = setTimeout(() => { paEl.hidden = true; }, 5500);
    window.dispatchEvent(new CustomEvent('depot:pa', { detail: { text } })); // 스토리 반응(R29 할인 사냥꾼)
  }
  hintEl.onclick = () => { if (near && !active) enter(); };
  const setHint = (on) => { if (on === !hintEl.hidden) return; hintEl.hidden = !on; if (on) hintEl.innerHTML = `<kbd>${isMobile ? '탭' : 'E'}</kbd>범창고 들어가기 · 카트 끌고 장보기`; };

  function enter() {
    if (active || busy || !canEnter()) return false;
    busy = true; fade = { t: 0, phase: 'out', leaving: false }; fadeSub.textContent = '대용량 창고형 할인점 · 카트는 입구 카트 보관소에서';
    setHint(false); loadMod();
    // [depot-audio] 페이드와 함께 매장 BGM 시작(월드 OST 는 hold). 모듈은 입장 때 지연 로드.
    loadAudio().then((m) => {
      if (!m) return;
      audio ||= m.createDepotAudio({
        getLevel: () => getAudioLevel?.() || { muted: false, volume: 0.55 },
        getBgmPlayer,
        onAnnounce: showPa,
        isMobile,
      });
      audio.enter();
    });
    return true;
  }
  function leave() {
    if (!active || busy) return;
    busy = true; fade = { t: 0, phase: 'out', leaving: true }; fadeSub.textContent = '또 오세요!';
  }
  async function build() {
    // 내부를 만들기 전에 바깥 월드를 내려, 입장 피크 메모리가 폰 한도를 넘기지 않게
    try { onPark?.(true); } catch (e) { console.warn('[depot-park]', e); }
    try { ext.park?.(); } catch (e) { console.warn('[depot-park]', e); }
    try {
      const m = await loadMod();
      if (!m) throw new Error('depot interior load failed');
      interior = await m.buildDepotInterior({ renderer, isMobile, onExit: () => leave(), audio, getAudioLevel });
      active = true; document.body.classList.add('depot-inside');
      onInterior?.('depot', interior);
    } catch (e) {
      try { onPark?.(false); } catch { /* */ }
      throw e;
    }
  }
  async function finishLeave() {
    onInterior?.('', null);
    interior?.dispose(); interior = null; active = false; document.body.classList.remove('depot-inside');
    fadeSub.textContent = '주변을 다시 그리는 중';
    try { await Promise.resolve(onPark?.(false)); } catch (e) { console.warn('[depot-park]', e); }
    try { audio?.leave(); } catch (e) { console.warn('[depot-audio]', e); }
    paEl.hidden = true;
    const p = getPlayer?.()?.position; if (p) { p.x = DEPOT_SPAWN.x; p.z = DEPOT_SPAWN.z; }
  }
  let building = false, leavingWait = false;
  function tickFade(dt) {
    if (!fade.phase) return;
    fade.t += dt;
    const a = fade.phase === 'out' ? Math.min(1, fade.t / FADE) : Math.max(0, 1 - fade.t / FADE);
    fadeEl.style.opacity = String(a);
    if (fade.phase === 'out' && fade.t >= FADE) {
      if (fade.leaving) {
        if (!leavingWait) {
          leavingWait = true;
          fadeSub.textContent = '주변을 다시 그리는 중';
          finishLeave().then(() => { leavingWait = false; fade = { t: -0.1, phase: 'in', leaving: false }; })
            .catch((e) => { console.warn('[depot]', e); leavingWait = false; fade = { t: -0.1, phase: 'in', leaving: false }; });
        }
      } else if (!active && !building) {
        building = true;
        build().then(() => { building = false; fade = { t: -0.1, phase: 'in', leaving: false }; })
          .catch((e) => { building = false; console.warn('[depot]', e); fade = { t: 0, phase: 'in', leaving: false }; });
      }
    } else if (fade.phase === 'in' && fade.t >= FADE) { fade = { t: 0, phase: '' }; fadeEl.style.opacity = '0'; busy = false; }
  }

  function outdoorTick(dt, pos) {
    if (active || busy) { tickFade(dt); return; }
    ext.update(dt, pos); // [depot-ext] 주차장 지연 생성·밤 조명·바닥 화살표
    if (!pos) { near = false; setHint(false); return; }
    const dDoor = Math.hypot(pos.x - S.door.x, pos.z - (S.z0 - 1.5));
    if (dDoor < PREFETCH_R && !modP) loadMod(); // 가까이 오면 내부 모듈만 미리 받아 둠(메모리에 장면은 아직 없음)
    near = dDoor < DOOR_R; setHint(near);
  }
  function frame(dt, look, axes) {
    tickFade(dt);
    if (!active || !interior) return !!busy;
    interior.update(dt, { look, axes, frozen: busy });
    interior.render(renderer);
    return true;
  }
  function onKey(e) {
    if (!active) { if (e.code === 'KeyE' && near && !busy && !e.repeat) return enter(); return false; }
    interior?.onKey(e);
    return true; // 매장 안에서는 바깥 단축키(지도·채팅 등) 막음
  }
  return {
    get active() { return active; }, get busy() { return busy; }, get interior() { return interior; },
    outdoorTick, frame, onKey, enter, leave,
    view: () => (active && interior ? { scene: interior.scene, camera: interior.camera } : null),
    blocks: (x, z, r, tall) => !active && ext.blocks(x, z, r, tall),
    exterior: ext,
    mmDraw: (g, R) => (active && interior?.mmDraw ? (interior.mmDraw(g, R), true) : false), // [depot-live] 매장 안 미니맵(평면·경로·목적지 핀)
    mapMarker: ext.marker, guide: () => ext.way.guide(), // [depot-ext] 미니맵 아이콘 · 문 앞 안내선
    dispose() { try { audio?.dispose(); } catch { /* */ } audio = null; interior?.dispose(); interior = null; ext.dispose(); root.remove(); st.remove(); },
    _dbg: { get mod() { return mod; }, loadMod, get interior() { return interior; }, get audio() { return audio; }, loadAudio },
  };
}
