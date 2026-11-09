// [arcade] BUMP 오락실 — 문 앞 E 입장 · 오락기 F/클릭으로 범핑팡 · R 순위판
import * as THREE from 'three';
import { arcadeEnabled, ARCADE_AT, arcadeAtSpot } from './flag.js';
import { arcadePlacement } from './locations.js';
import { mountArcadeExterior } from './exterior.js';
import { buildArcadeInterior } from './interior.js';
import { createArcadeSfx } from './sfx.js';
import { createArcadeUI } from './ui.js';
import { createArcadeRankProvider, localBoard } from './rank.js';
import { mountBumpingPang } from './bumpingpang/game.js';

export { arcadeEnabled, arcadeAtSpot, ARCADE_AT } from './flag.js';
export { arcadePlacement } from './locations.js';

function dismissBlockingOverlays() {
  // Controls 첫 안내 · BUMP24 포스터(z=5100) · 기타 모달이 범핑팡 시작 버튼을 가리면 진행 불가
  try {
    const ov = document.getElementById('cc-overlay');
    if (ov) ov.hidden = true;
    localStorage.setItem('bw.controlsCard.dismissed', '1');
    sessionStorage.setItem('bw.controlsCard.off', '1');
    document.documentElement.classList.remove('cc-on');
  } catch { /* */ }
  try {
    const poster = document.getElementById('bw-bp24-poster');
    if (poster) {
      poster.querySelector('[data-close]')?.click();
      poster.remove();
    }
  } catch { /* */ }
  try {
    document.querySelector('#bw-notice-popup [data-close], .np-close, [data-notice-close]')?.click();
  } catch { /* */ }
  try {
    const board = document.getElementById('board-modal');
    if (board && !board.hidden) {
      board.querySelector('.board-close, [data-action="close"]')?.click();
      board.hidden = true; // click 이 안 먹어도 강제 닫기
    }
  } catch { /* */ }
}

const FADE_SEC = 0.38;
const DOOR_R = 2.6;
const BOARD_R = 2.4;

export function mountArcade({
  renderer, scene, getPlayer, getCamera, canEnter = () => true,
  onInterior, getAudioLevel, getSelfName, toggleMute, getBgmPlayer, params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams(),
} = {}) {
  const search = typeof params?.get === 'function' ? `?${params}` : (typeof params === 'string' ? params : (location?.search || ''));
  if (!arcadeEnabled(search)) return null;

  const sfx = createArcadeSfx({ getLevel: () => getAudioLevel?.() || { muted: false, volume: 1 } });
  const rank = createArcadeRankProvider();
  const exterior = scene ? mountArcadeExterior({ scene }) : null;
  const store = arcadePlacement();

  let interior = null, active = false, busy = false, pang = null;
  let worldOstHeld = false;
  function pauseWorldOst() {
    if (worldOstHeld) return;
    try {
      const pl = getBgmPlayer?.();
      if (pl?.hold) { pl.hold(true); worldOstHeld = true; }
      else if (pl?.playing) { pl.setDuck?.(true); worldOstHeld = 'duck'; }
    } catch { /* */ }
  }
  function resumeWorldOst() {
    if (!worldOstHeld) return;
    try {
      const pl = getBgmPlayer?.();
      if (worldOstHeld === true) pl?.hold?.(false);
      else pl?.setDuck?.(false);
    } catch { /* */ }
    worldOstHeld = false;
  }

  let fade = { t: 0, phase: '', title: '', sub: '', leaving: false };
  let returnPos = null, nearDoor = false, nearBoard = false, nearCab = null;
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);

  const ui = createArcadeUI({
    onHintTap: () => {
      if (!active && nearBoard) openBoard();
      else if (!active && nearDoor) enter();
      else if (active && !pang) leave(); // 안쪽 힌트가 나가기일 때
    },
    onCabTap: () => {
      if (active && !pang) {
        const playable = interior?.cabinets?.find((c) => c.playable);
        if (playable) { nearCab = playable; startPang(); }
      }
    },
    onExit: () => { if (pang) { pang.dispose(); pang = null; ui.root.classList.remove('is-pang'); resumeWorldOst(); ui.setCabHint('범핑팡 하기', true, { act: true, tap: '범핑팡 하기', key: 'F' }); } else leave(); },
    onMute: () => {
      if (toggleMute) toggleMute();
      else sfx.setMuted(!sfx.muted);
      ui.setMuted(sfx.muted || !!getAudioLevel?.()?.muted);
    },
  });

  function selfName() { try { return getSelfName?.() || '나'; } catch { return '나'; } }

  function enter() {
    if (active || busy || !canEnter()) return false;
    const p = getPlayer?.()?.position; if (p) returnPos = { x: p.x, z: p.z };
    dismissBlockingOverlays();
    busy = true; fade = { t: 0, phase: 'out', title: store.name, sub: '네온이 반짝, 어서 와요', leaving: false };
    ui.setHint(''); sfx.door();
    return true;
  }
  function buildRoom() {
    interior?.dispose();
    interior = buildArcadeInterior({ renderer, storeName: store.name });
    active = true;
    ui.setInside(true);
    onInterior?.('arcade', interior);
    ui.setCabHint('범핑팡 하기', true, { act: true, tap: '범핑팡 하기', key: 'F' });
  }
  function leave() {
    if (!active || (busy && !fade.leaving && fade.phase)) return;
    if (pang) { pang.dispose(); pang = null; ui.root.classList.remove('is-pang'); resumeWorldOst(); }
    busy = true; fade = { t: 0, phase: 'out', title: '밖으로', sub: '또 와요!', leaving: true };
    ui.setCabHint(''); sfx.door(); sfx.stopBgm();
  }
  function finishLeave() {
    onInterior?.('', null);
    interior?.dispose(); interior = null; active = false;
    ui.setInside(false); ui.setCabHint('');
    const p = getPlayer?.()?.position;
    if (p && store.door) { p.x = store.door[0]; p.z = store.door[1]; }
    else if (p && returnPos) { p.x = returnPos.x; p.z = returnPos.z; }
    returnPos = null;
  }
  function tickFade(dt) {
    if (!fade.phase) return;
    fade.t += dt;
    const raw = fade.phase === 'out' ? fade.t / FADE_SEC : 1 - fade.t / FADE_SEC;
    const a = Math.min(1, Math.max(0, raw));
    ui.setFade(a, fade.title, fade.sub);
    if (fade.phase === 'out' && fade.t >= FADE_SEC) {
      if (fade.leaving) finishLeave();
      else if (!active) { try { buildRoom(); } catch (e) { console.warn('[arcade]', e); busy = false; fade = { t: 0, phase: '' }; ui.setFade(0); return; } }
      fade = { t: -0.12, phase: 'in', title: '', sub: '', leaving: false };
    } else if (fade.phase === 'in' && fade.t >= FADE_SEC) { fade = { t: 0, phase: '' }; ui.setFade(0); busy = false; }
  }

  async function openBoard(period = 'today') {
    const rows = await rank.top({ period });
    const name = (() => { try { return selfName?.() || ''; } catch { return ''; } })();
    // 통합 보드: PC·모바일 같은 rows. 내 행은 실데이터에서만 골라 상단 고정
    const mine = name
      ? (rows.find((r) => String(r.name || '') === name) || null)
      : (rows.find((r) => r.me || r.self) || null);
    ui.showBoard({
      period, rows, me: mine,
      onClose: () => ui.hideBoard(),
      onTab: (p) => openBoard(p),
    });
  }

  function bestScoreLocal() {
    try {
      const rows = localBoard('today');
      const name = (() => { try { return selfName?.() || ''; } catch { return ''; } })();
      const mine = name ? rows.find((r) => r.name === name) : rows[0];
      return Math.max(0, Number(mine?.score) || Number(rows[0]?.score) || 0);
    } catch { return 0; }
  }

  async function startPang() {
    if (pang || !active) return;
    dismissBlockingOverlays();
    ui.setCabHint('');
    // 입장 페이드가 아직 'in' 이면 다음 프레임이 다시 어두워지며 클릭을 먹음 → 즉시 종료
    fade = { t: 0, phase: '', title: '', sub: '', leaving: false };
    busy = false;
    ui.setFade(0);
    let ranked = true;
    try {
      const gate = await Promise.race([
        rank.gate(),
        new Promise((r) => setTimeout(() => r({ ranked: true, local: true, guest: true }), 800)),
      ]);
      ranked = !!gate?.ranked;
    } catch { ranked = true; }
    ui.root.classList.add('is-pang');
    pauseWorldOst();
    pang = mountBumpingPang({
      root: ui.root,
      sfx,
      ranked,
      practice: !ranked,
      getName: selfName,
      getBest: bestScoreLocal,
      onOpenBoard: () => openBoard('today'),
      onExit: () => { pang = null; ui.root.classList.remove('is-pang'); resumeWorldOst(); ui.setCabHint('범핑팡 하기', true, { act: true, tap: '범핑팡 하기', key: 'F' }); },
      onResult: async ({ score, level, durationMs, ranked: rec, name, openBoard: wantBoard }) => {
        try { await rank.submit({ name, score, level, durationMs, ranked: rec }); } catch { /* local ok */ }
        if (wantBoard) openBoard('today');
      },
    });
  }

  function outdoorTick(_dt, pos) {
    if (active || busy || !pos) { nearDoor = false; nearBoard = false; if (!active) ui.setHint(''); return; }
    const dDoor = Math.hypot(pos.x - store.door[0], pos.z - store.door[1]);
    nearDoor = dDoor < DOOR_R;
    const board = store.board || store.door;
    const dBoard = Math.hypot(pos.x - board[0], pos.z - board[1]);
    nearBoard = dBoard < BOARD_R;
    if (nearBoard && dBoard <= dDoor) {
      ui.setHint(`${store.name} 범핑팡 랭킹`, true, { act: true, tap: '범핑팡 랭킹 보기', key: 'R' });
    } else if (nearDoor) {
      ui.setHint(`${store.name} 들어가기`, true, { act: true, tap: `${store.name} 들어가기`, key: 'E' });
    } else ui.setHint('');
  }

  function onKey(e) {
    if (pang) {
      if (e.code === 'Escape') { pang.dispose(); pang = null; ui.root.classList.remove('is-pang'); resumeWorldOst(); ui.setCabHint('범핑팡 하기', true, { act: true, tap: '범핑팡 하기', key: 'F' }); return true; }
      if (e.code === 'KeyR' && !e.repeat) { openBoard(); return true; } // 통합 순위판 (PC·모바일 동일)
      return true; // swallow while playing
    }
    if (e.code === 'KeyE' && !e.repeat) {
      if (!active && nearDoor) return !!enter();
      if (active && !busy) { leave(); return true; }
    }
    if (e.code === 'KeyR' && !e.repeat) {
      if (!active && nearBoard) { openBoard(); return true; }
      if (active) { openBoard(); return true; }
    }
    if (e.code === 'KeyF' && !e.repeat && active && !pang) {
      const playable = interior?.cabinets?.find((c) => c.playable);
      if (playable) { nearCab = playable; startPang(); return true; }
    }
    return false;
  }

  function onPointerDown(e) {
    if (!active || pang || !interior) return;
    const cam = interior.camera;
    const rect = renderer?.domElement?.getBoundingClientRect?.();
    if (!rect) return;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, cam);
    const hit = interior.pickCabinet(ray);
    nearCab = hit;
    if (hit?.playable) startPang();
    else if (hit) sfx.deny();
  }
  if (typeof window !== 'undefined') window.addEventListener('pointerdown', onPointerDown, true);

  function actEnter() { if (!active && nearDoor && !busy) return enter(); return false; }
  function actBoard() { if ((nearBoard || active) && !busy) { openBoard(); return true; } return false; }
  function actPlay() {
    if (active && !pang) {
      const playable = interior?.cabinets?.find((c) => c.playable);
      if (playable) { nearCab = playable; startPang(); return true; }
    }
    return false;
  }
  function actLeave() { if (active && !busy) { leave(); return true; } return false; }

  return {
    get active() { return active; },
    get busy() { return busy; },
    get zone() { return active ? 'arcade' : ''; },
    get interior() { return interior; },
    get nearDoor() { return nearDoor; },
    get nearBoard() { return nearBoard; },
    get playing() { return !!pang; },
    store,
    actEnter, actBoard, actPlay, actLeave,
    outdoorTick,
    onKey,
    view() { return active && interior ? { scene: interior.scene, camera: interior.camera } : null; },
    frame(dt) {
      tickFade(dt);
      if (!active && !busy) return false;
      if (interior) {
        interior.resize(innerWidth, innerHeight);
        interior.tick();
        renderer.setRenderTarget(null);
        renderer.render(interior.scene, interior.camera);
      }
      return true;
    },
    blocks(x, z, r = 0.4) {
      // soft block around door frame so players queue up
      if (!exterior) return false;
      const d = Math.hypot(x - store.door[0], z - store.door[1]);
      return d < 0.55 + r && d > 0.35;
    },
    dispose() {
      window.removeEventListener('pointerdown', onPointerDown, true);
      pang?.dispose?.(); ui.root.classList.remove('is-pang'); resumeWorldOst();
      interior?.dispose();
      exterior?.dispose();
      ui.dispose();
      sfx.stopBgm();
    },
  };
}
