// [depot] 범창고(BUMP DEPOT) 정자점 — 문 앞 'E 들어가기' · 페이드 · 별도 내부 Scene(지연 로드) · 나오면 전부 해제.
//   바깥: exterior.js 외피만. 안: interior.js(선반·상품·카트·cannon-es 물리)를 문 120 m 안에서 미리 import, 들어갈 때 생성, 나오면 dispose.
import { depotEnabled, DEPOT_SITE as S, DEPOT_SPAWN } from './flag.js';
import { buildDepotExterior } from './exterior.js';

export { depotEnabled, DEPOT_AT, DEPOT_SPAWN, DEPOT_SITE } from './flag.js';

const FADE = 0.35, DOOR_R = 4.2, PREFETCH_R = 120;

export function mountDepot({ renderer, scene, getPlayer, groundY, canEnter = () => true, onInterior, isMobile = false, params } = {}) {
  const search = params ? `?${params}` : location.search;
  if (!depotEnabled(search)) return null;
  const ext = buildDepotExterior(scene, { groundY: groundY || (() => 0) });
  let mod = null, modP = null, interior = null, active = false, busy = false, near = false;
  let fade = { t: 0, phase: '', leaving: false };
  const loadMod = () => (modP ||= import('./interior.js').then((m) => (mod = m)).catch((e) => { modP = null; console.warn('[depot]', e); return null; }));

  const root = document.createElement('div'); root.id = 'depot-ui';
  root.innerHTML = '<div class="dp-hint" hidden></div><div class="dp-fade"><b>범창고 BUMP DEPOT</b><span></span></div>';
  const st = document.createElement('style');
  st.textContent = `#depot-ui{position:fixed;inset:0;pointer-events:none;z-index:58;font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif}
#depot-ui .dp-hint{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(20,40,90,.88);color:#fff;padding:10px 18px;border-radius:999px;font-weight:800;font-size:15px;pointer-events:auto;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}
#depot-ui .dp-hint kbd{background:#f2b705;color:#13203d;border-radius:6px;padding:1px 7px;margin-right:8px;font-weight:900}
#depot-ui .dp-fade{position:absolute;inset:0;background:#0d1a33;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;gap:8px;transition:none}
#depot-ui .dp-fade b{font-size:30px;letter-spacing:1px}#depot-ui .dp-fade span{font-size:15px;color:#f2b705;font-weight:700}`;
  document.head.appendChild(st); document.body.appendChild(root);
  const hintEl = root.querySelector('.dp-hint'), fadeEl = root.querySelector('.dp-fade'), fadeSub = fadeEl.querySelector('span');
  hintEl.onclick = () => { if (near && !active) enter(); };
  const setHint = (on) => { if (on === !hintEl.hidden) return; hintEl.hidden = !on; if (on) hintEl.innerHTML = `<kbd>${isMobile ? '탭' : 'E'}</kbd>범창고 들어가기 · 카트 끌고 장보기`; };

  function enter() {
    if (active || busy || !canEnter()) return false;
    busy = true; fade = { t: 0, phase: 'out', leaving: false }; fadeSub.textContent = '대용량 창고형 할인점 · 카트는 입구 카트 보관소에서';
    setHint(false); loadMod();
    return true;
  }
  function leave() {
    if (!active || busy) return;
    busy = true; fade = { t: 0, phase: 'out', leaving: true }; fadeSub.textContent = '또 오세요!';
  }
  async function build() {
    const m = await loadMod();
    if (!m) throw new Error('depot interior load failed');
    interior = await m.buildDepotInterior({ renderer, isMobile, onExit: () => leave() });
    active = true; document.body.classList.add('depot-inside');
    onInterior?.('depot', interior);
  }
  function finishLeave() {
    onInterior?.('', null);
    interior?.dispose(); interior = null; active = false; document.body.classList.remove('depot-inside');
    const p = getPlayer?.()?.position; if (p) { p.x = DEPOT_SPAWN.x; p.z = DEPOT_SPAWN.z; }
  }
  let building = false;
  function tickFade(dt) {
    if (!fade.phase) return;
    fade.t += dt;
    const a = fade.phase === 'out' ? Math.min(1, fade.t / FADE) : Math.max(0, 1 - fade.t / FADE);
    fadeEl.style.opacity = String(a);
    if (fade.phase === 'out' && fade.t >= FADE) {
      if (fade.leaving) { finishLeave(); fade = { t: -0.1, phase: 'in', leaving: false }; }
      else if (!active && !building) {
        building = true;
        build().then(() => { building = false; fade = { t: -0.1, phase: 'in', leaving: false }; })
          .catch((e) => { building = false; console.warn('[depot]', e); fade = { t: 0, phase: 'in', leaving: false }; });
      }
    } else if (fade.phase === 'in' && fade.t >= FADE) { fade = { t: 0, phase: '' }; fadeEl.style.opacity = '0'; busy = false; }
  }

  function outdoorTick(dt, pos) {
    if (active || busy) { tickFade(dt); return; }
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
    blocks: (x, z, r) => !active && ext.blocks(x, z, r),
    exterior: ext,
    dispose() { interior?.dispose(); interior = null; ext.dispose(); root.remove(); st.remove(); },
    _dbg: { get mod() { return mod; }, loadMod, get interior() { return interior; } },
  };
}
