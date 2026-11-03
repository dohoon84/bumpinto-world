// [subway] 정자역 지하철 — 1단계: 실제 출구(OSM) 출입구 + 지하 대합실(별도 Scene) + 출구 고르기
//   설계: /DESIGN 은 repo 밖 bw-subway-DESIGN.md (2~5단계: 승강장·열차·탑승·다른 역 하차·실시간 도착)
//   ?subway=0 이면 mountSubway 자체를 부르지 않는다 (출입구·스텐실·DOM 모두 없음).
//
//   game.js 와의 약속:
//     subway.blocks(x,z,r)        바깥 충돌 (world.isBlocked 체인)
//     subway.onKey(e) → true      키를 썼으면 true (안에 있는 동안은 거의 모든 키를 먹는다)
//     subway.busy                 들어가는/나오는 중 포함, 바깥 이동 입력을 막아야 하면 true
//     subway.outdoorTick(dt)      바깥 프레임마다 (입구 근처 안내, 걸어 들어가면 진입)
//     subway.frame(dt, look, axes) → true 이면 이번 프레임은 대합실을 그렸으니 바깥 갱신·렌더를 건너뛴다
import { resolveExits, groupExits, exitLabel } from './exits.js';
import { createSubwayState } from './state.js';
import { buildEntrances } from './entrance.js';
import { isEn, tr } from '../i18n.js';

const CSS = `
#subway-fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:200;display:flex;align-items:center;justify-content:center;color:#fff;font:700 20px/1.4 system-ui,sans-serif;letter-spacing:.02em}
#subway-fade .sf-badges{display:flex;gap:8px;justify-content:center;margin-top:8px}
#subway-fade .sf-b{padding:2px 10px;border-radius:99px;font-size:13px;color:#fff}
#subway-hint{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:201;background:rgba(20,24,30,.86);color:#fff;padding:8px 14px;border-radius:12px;font:600 14px/1.3 system-ui,sans-serif;pointer-events:none;display:none;white-space:nowrap}
#subway-hint kbd{display:inline-block;min-width:18px;padding:1px 6px;margin-right:6px;border-radius:5px;background:#FFC20E;color:#111;font:800 13px system-ui;text-align:center}
#subway-toast{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:201;background:rgba(20,24,30,.9);color:#fff;padding:9px 16px;border-radius:12px;font:600 15px/1.3 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .25s}
#subway-chooser{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:202;width:min(440px,92vw);background:#1d2228;color:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.5);font:500 14px/1.35 system-ui,sans-serif;overflow:hidden;display:none}
#subway-chooser .sc-h{background:#FFC20E;color:#111;padding:12px 16px;font-weight:800;font-size:17px;display:flex;justify-content:space-between;align-items:baseline}
#subway-chooser .sc-h small{font-weight:600;font-size:12px}
#subway-chooser ul{list-style:none;margin:0;padding:8px}
#subway-chooser li{display:flex;gap:12px;align-items:center;padding:8px 10px;border-radius:10px;cursor:pointer;border:2px solid transparent}
#subway-chooser li.on{background:#2b323b;border-color:#FFC20E}
#subway-chooser li:hover{background:#262c34}
#subway-chooser .n{flex:0 0 38px;height:38px;border-radius:7px;background:#FFC20E;color:#111;font:900 24px/38px system-ui;text-align:center}
#subway-chooser .t{flex:1;min-width:0}
#subway-chooser .t b{font-size:15px}
#subway-chooser .t div{color:#adb5bd;font-size:12.5px}
#subway-chooser .tag{flex:0 0 auto;font-size:11px;color:#FFC20E;white-space:nowrap}
#subway-chooser .sc-f{padding:8px 16px 12px;color:#868e96;font-size:12px}
body.in-subway #overlay,body.in-subway #phone,body.in-subway #stop-panel,body.in-subway #corridor-stop-panel,body.in-subway #bike-prompt,body.in-subway #trk-prompt,body.in-subway #dog-gate-btn,body.in-subway #donate-near-btn,body.in-subway #coffee-order-bar,body.in-subway #coffee-toss-btn,body.in-subway #umbrella-actions{display:none!important}
`;

export function mountSubway({ scene, overlay, data, world, terrain, renderer, getLook, getPlayer, canEnter, onEnter, onExit, params }) {
  const exits = resolveExits(data);
  if (!exits.length) return null;
  const groups = groupExits(exits);
  const state = createSubwayState({ exits });
  const ent = buildEntrances({ scene, overlay, exits, data, world, terrain });
  const byId = new Map(ent.list.map((e) => [e.exit.id, e]));

  // ---------- DOM ----------
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const fade = document.createElement('div'); fade.id = 'subway-fade';
  fade.innerHTML = `<div style="text-align:center"><div class="sf-t"></div><div class="sf-badges"><span class="sf-b" style="background:#F5A200">수인분당</span><span class="sf-b" style="background:#D4003B">신분당</span></div></div>`;
  const hint = document.createElement('div'); hint.id = 'subway-hint';
  const toast = document.createElement('div'); toast.id = 'subway-toast';
  const chooser = document.createElement('div'); chooser.id = 'subway-chooser';
  document.body.append(fade, hint, toast, chooser);
  let toastT = 0;
  const say = (text, sec = 2.2) => { toast.textContent = text; toast.style.opacity = '1'; toastT = sec; };
  const setHint = (html) => { if (hint._h !== html) { hint._h = html; hint.innerHTML = html || ''; hint.style.display = html ? 'block' : 'none'; } };

  let inside = null; // buildConcourse 결과
  let mod = null;    // 지연 로드된 concourse 모듈
  const loadMod = () => (mod ? Promise.resolve(mod) : import('./concourse.js').then((m) => (mod = m)));
  let audio = null;
  const beep = () => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = 1320; g.gain.value = 0.035;
      o.connect(g).connect(audio.destination); o.start(); g.gain.setTargetAtTime(0, audio.currentTime + 0.07, 0.02); o.stop(audio.currentTime + 0.18);
    } catch { /* 소리 없음 */ }
  };

  function renderChooser() {
    const en = isEn();
    const here = inside?.lastPass;
    chooser.innerHTML = `<div class="sc-h">${tr('나갈 출구 고르기', 'Choose your exit')}<small>${tr('정자역', 'Jeongja Stn.')}</small></div><ul>${
      exits.map((e, i) => {
        const tag = e.id === state.entry ? tr('들어온 출구', 'came in here') : (here && here.exits.includes(e) ? tr('가까운 출구', 'nearest') : '');
        const dir = en ? e.dir.en : e.dir.ko;
        const hints = e.hints.length ? e.hints.join(' · ') + tr(' 방면', '') : '';
        return `<li data-i="${i}" class="${i === state.pick ? 'on' : ''}"><span class="n">${e.ref || '·'}</span><span class="t"><b>${exitLabel(e, en)}</b><div>${dir}${hints ? ' · ' + hints : ''}</div></span>${tag ? `<span class="tag">${tag}</span>` : ''}</li>`;
      }).join('')
    }</ul><div class="sc-f">${tr('↑↓ 또는 숫자로 고르고 Enter · Esc 닫기', '↑↓ or number, Enter to go · Esc to close')}</div>`;
    chooser.querySelectorAll('li').forEach((li) => { li.onclick = () => { const i = +li.dataset.i; state.move(i - state.pick); go(); }; });
  }
  function openChooser() { if (state.openChooser()) { renderChooser(); chooser.style.display = 'block'; } }
  function closeChooser() { state.cancel(); chooser.style.display = 'none'; }
  function go() { chooser.style.display = 'none'; state.choose(); }

  function enter(e) {
    if (!e || state.active || (canEnter && !canEnter())) return false;
    if (!state.enter(e.exit.id)) return false;
    fade.querySelector('.sf-t').textContent = e.exit.ref ? tr(`정자역 ${e.exit.ref}번 출구`, `Jeongja Stn. · Exit ${e.exit.ref}`) : tr('정자역', 'Jeongja Stn.');
    setHint('');
    loadMod(); // 페이드 동안 미리 받기
    onEnter?.(e);
    return true;
  }

  // 바깥: 입구 근처 안내 + 걸어 들어가면 진입
  let lastNear = null;
  function outdoorTick(dt, pos) {
    if (toastT > 0 && (toastT -= dt) <= 0) toast.style.opacity = '0';
    if (state.active) return;
    if (!pos) { setHint(''); return; }
    const z = ent.zoneAt(pos.x, pos.z);
    if (z) { enter(z); return; }
    const n = ent.near(pos.x, pos.z);
    lastNear = n;
    setHint(n ? `<kbd>E</kbd>${n.exit.ref ? tr(`정자역 ${n.exit.ref}번 출구로 내려가기`, `Go down · Jeongja Exit ${n.exit.ref}`) : tr('정자역으로 내려가기', 'Go down to Jeongja Stn.')}` : '');
  }

  // 안: true 반환 = 대합실을 그렸음
  function frame(dt, look, axes) {
    if (toastT > 0 && (toastT -= dt) <= 0) toast.style.opacity = '0';
    for (const ev of state.tick(dt)) {
      if (ev === 'load') {
        if (!mod) { state._waitLoad = true; }
        else buildInside();
      } else if (ev === 'unload') {
        const e = byId.get(state.target) || byId.get(state.entry);
        inside?.dispose(); inside = null;
        document.body.classList.remove('in-subway');
        setHint('');
        onExit?.(e);
      }
    }
    if (state._waitLoad && mod) { state._waitLoad = false; buildInside(); }
    fade.style.opacity = String(state.phase === 'arriving' && !inside ? 1 : state.fadeAlpha());
    if (!state.interior || !inside) return state.interior; // 로드 대기 중이면 검은 화면 유지
    const r = inside.update(dt, { look, axes, allowMove: state.canWalk });
    if (state.canWalk) {
      if (r.enteredPassage) openChooser();
      if (r.wellHint) say(tr(`${r.wellHint.ko} 승강장은 다음 업데이트에서 열려요`, `Platform (${r.wellHint.en}) — coming soon`), 2.6);
      setHint(`<kbd>E</kbd>${tr('나갈 출구 고르기', 'Choose exit')}`);
    } else if (state.phase === 'choosing') setHint('');
    inside.render();
    return true;
  }
  function buildInside() {
    inside = mod.buildConcourse({
      exits, groups, entryId: state.entry, look: getLook?.(), renderer,
      onToast: (kind) => { if (kind === 'tap') { beep(); say(tr('삑 — 교통카드 태그', 'Beep — card tapped'), 1.3); } },
    });
    // 바로 프레임 하나 갱신 (NPC 배치·카메라)
    inside.update(0, { look: [0, 0, 0], axes: { f: 0, s: 0, run: false }, allowMove: false });
    document.body.classList.add('in-subway');
  }

  function onKey(e) {
    if (!state.active) {
      if (e.code === 'KeyE' && !e.repeat && lastNear) return enter(lastNear);
      return false;
    }
    if (state.phase === 'choosing') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { state.move(-1); renderChooser(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { state.move(1); renderChooser(); }
      else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { e.preventDefault?.(); go(); }
      else if (e.code === 'Escape') closeChooser();
      else if (/^Digit\d$/.test(e.code)) { const i = exits.findIndex((x) => x.ref === e.code.slice(5)); if (i >= 0) { state.move(i - state.pick); renderChooser(); go(); } }
      return true;
    }
    if (state.phase === 'inside' && e.code === 'KeyE' && !e.repeat) { openChooser(); return true; }
    if (e.code === 'Enter') return false; // 채팅은 그대로
    return true;
  }

  return {
    exits, entrances: ent.list, state,
    get active() { return state.active; },
    get busy() { return state.busy; },
    get interior() { return state.interior; },
    get inside() { return inside; },
    blocks: (x, z, r) => ent.blocks(x, z, r),
    outdoorTick, frame, onKey,
    enterById: (id) => enter(byId.get(id)),
    openChooser, choose: (id) => { const i = exits.findIndex((x) => x.id === id); if (i >= 0 && state.phase === 'choosing') { state.move(i - state.pick); renderChooser(); } },
    go,
    dispose() { inside?.dispose(); ent.dispose(); style.remove(); fade.remove(); hint.remove(); toast.remove(); chooser.remove(); },
  };
}
