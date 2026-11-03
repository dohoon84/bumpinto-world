// [subway] 지하철 — 1단계: 실제 출구(OSM) 출입구 + 지하 대합실(별도 Scene) + 출구 고르기
//   역: 정자(라이브 영역, 기존 그대로) + 코리더 역 13곳(수내~잠실, stationsData.js). 역마다 출입구 묶음 1개(draw call ≈5),
//   코리더 역 출입구는 가까이 갈 때(ENT_BUILD) 만들고 멀어지면(ENT_DROP) 지운다. 대합실은 정자역 틀 + 역 테마.
//   설계: /DESIGN 은 repo 밖 bw-subway-DESIGN.md (2~5단계: 승강장·열차·탑승·다른 역 하차·실시간 도착)
//   ?subway=0 이면 mountSubway 자체를 부르지 않는다 (출입구·스텐실·DOM 모두 없음).
//
//   game.js 와의 약속:
//     subway.blocks(x,z,r)        바깥 충돌 (world.isBlocked 체인)
//     subway.onKey(e) → true      키를 썼으면 true (안에 있는 동안은 거의 모든 키를 먹는다)
//     subway.busy                 들어가는/나오는 중 포함, 바깥 이동 입력을 막아야 하면 true
//     subway.outdoorTick(dt)      바깥 프레임마다 (입구 근처 안내, 걸어 들어가면 진입)
//     subway.frame(dt, look, axes) → true 이면 이번 프레임은 대합실을 그렸으니 바깥 갱신·렌더를 건너뛴다
//     subway.netState()           [zone] 안에 있으면 프레즌스로 보낼 { x, z (구역 띠 좌표), ry, moving, zone }, 아니면 null
//     onInterior(zone, inside)    [zone] 대합실이 생기면 ('<역>-station', inside), 없어지기 직전 ('', null)
//                                 → game.js 가 원격 플레이어·오버레이·리액션을 그 Scene/카메라로 옮긴다
//     passKey(e) → true           안에서도 game.js 로 넘길 키 (리액션 숫자키)
import { resolveExits, groupExits, exitLabel } from './exits.js';
import { createSubwayState } from './state.js';
import { buildEntrances } from './entrance.js';
import { STATIONS, stationTheme, corridorExits, withStairs, entranceLod, stationZone, stationReach } from './stations.js';
import { createArrivalFeed } from './arrivals.js';
import { isEn, tr } from '../i18n.js';
import { encodeZone } from '../net/zones.js';

export const STATION_ZONE = 'jeongja-station'; // [zone] 정자역 대합실. 다른 역은 stationZone(id) (src/net/zones.js)
const PHONE_BASE = import.meta.env?.VITE_PHONE_URL || 'https://jeongja-phone.xn0texn073.workers.dev';
// [zone] 구역 이름 (접속자 목록 등)
export function zoneLabel(z, en = false) {
  const s = STATIONS.find((d) => stationZone(d.id) === z);
  return s ? (en ? `${s.nameEn} Stn. concourse` : `${s.name}역 대합실`) : null;
}

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
#subway-chooser ul{list-style:none;margin:0;padding:8px;max-height:min(62vh,560px);overflow-y:auto}
#subway-chooser li{display:flex;gap:12px;align-items:center;padding:8px 10px;border-radius:10px;cursor:pointer;border:2px solid transparent}
#subway-chooser li.on{background:#2b323b;border-color:#FFC20E}
#subway-chooser li:hover{background:#262c34}
#subway-chooser .n{flex:0 0 38px;height:38px;border-radius:7px;background:#FFC20E;color:#111;font:900 24px/38px system-ui;text-align:center}
#subway-chooser .t{flex:1;min-width:0}
#subway-chooser .t b{font-size:15px}
#subway-chooser .t div{color:#adb5bd;font-size:12.5px}
#subway-chooser .tag{flex:0 0 auto;font-size:11px;color:#FFC20E;white-space:nowrap}
#subway-chooser .sc-f{padding:8px 16px 12px;color:#868e96;font-size:12px}
body.in-subway #phone,body.in-subway #stop-panel,body.in-subway #corridor-stop-panel,body.in-subway #bike-prompt,body.in-subway #trk-prompt,body.in-subway #dog-gate-btn,body.in-subway #donate-near-btn,body.in-subway #coffee-order-bar,body.in-subway #coffee-toss-btn,body.in-subway #umbrella-actions{display:none!important}
`;

export function mountSubway({ scene, overlay, data, world, terrain, renderer, getLook, getPlayer, canEnter, onEnter, onExit, onInterior, getSelf, passKey, params, corridor = null }) {
  // 역 목록: 정자(런타임 배치, 라이브 영역) + 코리더가 켜져 있으면 코리더 역들
  const center = data?.meta?.center;
  const stations = [];
  for (const def of STATIONS) {
    if (def.id !== 'jeongja' && !corridor) continue; // ?corridor=0 → 정자만
    const theme = stationTheme(def);
    // 정자역: 런타임 배치. OSM 계단 방향(stairs)만 stationsData 에서 osm id 로 붙인다
    const exits = def.id === 'jeongja' ? withStairs(resolveExits(data), def) : corridorExits(def, center);
    if (!exits.length) continue;
    stations.push({ def, theme, exits, groups: groupExits(exits), state: createSubwayState({ exits }), ent: null, x: def.x, z: def.z, d: Infinity, reach: stationReach(def, exits) });
  }
  if (!stations.length || stations[0].def.id !== 'jeongja') return null;
  const buildEnt = (st) => {
    st.ent = buildEntrances({ scene, overlay, exits: st.exits, data, world, terrain, theme: st.theme });
    st.byId = new Map(st.ent.list.map((e) => [e.exit.id, e]));
  };
  const dropEnt = (st) => { st.ent?.dispose(); st.ent = null; st.byId = null; };
  buildEnt(stations[0]); // 정자역은 처음부터 (기존 그대로)
  const built = () => stations.filter((s) => s.ent);
  let cur = stations[0]; // 지금(또는 마지막으로) 들어간 역
  const stationOf = (e) => stations.find((s) => s.ent && s.ent.list.includes(e)) || null;
  const rtOn = params?.get?.('subwayRt') !== '0';
  let feed = null;

  // ---------- DOM ----------
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const fade = document.createElement('div'); fade.id = 'subway-fade';
  fade.innerHTML = `<div style="text-align:center"><div class="sf-t"></div><div class="sf-badges"></div></div>`;
  const hint = document.createElement('div'); hint.id = 'subway-hint';
  const toast = document.createElement('div'); toast.id = 'subway-toast';
  const chooser = document.createElement('div'); chooser.id = 'subway-chooser';
  document.body.append(fade, hint, toast, chooser);
  let toastT = 0;
  const say = (text, sec = 2.2) => { toast.textContent = text; toast.style.opacity = '1'; toastT = sec; };
  const setHint = (html) => { if (hint._h !== html) { hint._h = html; hint.innerHTML = html || ''; hint.style.display = html ? 'block' : 'none'; } };
  const stName = (th, en = isEn()) => (en ? `${th.nameEn} Stn.` : `${th.name}역`);
  const setBadges = (th) => { fade.querySelector('.sf-badges').innerHTML = th.lines.map((l) => `<span class="sf-b" style="background:${l.color}">${l.short}</span>`).join(''); };
  setBadges(cur.theme);

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
    const en = isEn(), state = cur.state;
    const here = inside?.lastPass;
    chooser.innerHTML = `<div class="sc-h">${tr('나갈 출구 고르기', 'Choose your exit')}<small>${stName(cur.theme, en)}</small></div><ul>${
      cur.exits.map((e, i) => {
        const tag = e.id === state.entry ? tr('들어온 출구', 'came in here') : (here && here.exits.includes(e) ? tr('가까운 출구', 'nearest') : '');
        const dir = en ? e.dir.en : e.dir.ko;
        const hints = e.hints.length ? e.hints.join(' · ') + tr(' 방면', '') : '';
        return `<li data-i="${i}" class="${i === state.pick ? 'on' : ''}"><span class="n">${e.ref || '·'}</span><span class="t"><b>${exitLabel(e, en)}</b><div>${dir}${hints ? ' · ' + hints : ''}</div></span>${tag ? `<span class="tag">${tag}</span>` : ''}</li>`;
      }).join('')
    }</ul><div class="sc-f">${tr('↑↓ 또는 숫자로 고르고 Enter · Esc 닫기', '↑↓ or number, Enter to go · Esc to close')}</div>`;
    chooser.querySelectorAll('li').forEach((li) => { li.onclick = () => { const i = +li.dataset.i; cur.state.move(i - cur.state.pick); go(); }; });
    chooser.querySelector('li.on')?.scrollIntoView?.({ block: 'nearest' });
  }
  function openChooser() { if (cur.state.openChooser()) { renderChooser(); chooser.style.display = 'block'; } }
  function closeChooser() { cur.state.cancel(); chooser.style.display = 'none'; }
  function go() { chooser.style.display = 'none'; cur.state.choose(); }

  function enter(e) {
    const st = e && stationOf(e);
    if (!st || cur.state.active || (canEnter && !canEnter())) return false;
    if (!st.state.enter(e.exit.id)) return false;
    cur = st;
    const n = cur.theme;
    fade.querySelector('.sf-t').textContent = e.exit.ref ? tr(`${n.name}역 ${e.exit.ref}번 출구`, `${n.nameEn} Stn. · Exit ${e.exit.ref}`) : stName(n);
    setBadges(n);
    setHint('');
    loadMod(); // 페이드 동안 미리 받기
    onEnter?.(e);
    return true;
  }

  // 코리더 역 출입구: 가까우면 만들고, 멀면 지우고, 사이에서는 숨김 (가장 먼 출구까지를 뺀 거리)
  let lodT = 0;
  function updateLod(pos, dt) {
    if ((lodT -= dt) > 0 || !pos) return;
    lodT = 0.5;
    for (const st of stations) {
      if (st.def.id === 'jeongja') continue; // 정자역은 라이브 영역, 늘 있음 (기존 그대로)
      st.d = Math.max(0, Math.hypot(pos.x - st.x, pos.z - st.z) - st.reach); // 출구 가장자리 기준 (잠실처럼 넓은 역)
      const act = entranceLod(st.d, !!st.ent);
      if (act === 'build') buildEnt(st);
      else if (act === 'drop' && !st.state.active) dropEnt(st);
      if (st.ent) st.ent.group.visible = act !== 'hide';
    }
  }

  // 바깥: 입구 근처 안내 + 걸어 들어가면 진입
  let lastNear = null;
  function outdoorTick(dt, pos) {
    if (toastT > 0 && (toastT -= dt) <= 0) toast.style.opacity = '0';
    if (cur.state.active) return;
    const p = pos || getPlayer?.()?.position;
    updateLod(p, dt);
    if (!pos) { setHint(''); lastNear = null; return; }
    let n = null;
    for (const st of built()) {
      if (!st.ent.group.visible) continue;
      const z = st.ent.zoneAt(pos.x, pos.z);
      if (z) { enter(z); return; }
      n ||= st.ent.near(pos.x, pos.z);
    }
    lastNear = n;
    const th = n && stationOf(n)?.theme;
    setHint(n ? `<kbd>E</kbd>${n.exit.ref ? tr(`${th.name}역 ${n.exit.ref}번 출구로 내려가기`, `Go down · ${th.nameEn} Exit ${n.exit.ref}`) : tr(`${th.name}역으로 내려가기`, `Go down to ${th.nameEn} Stn.`)}` : '');
  }

  // 안: true 반환 = 대합실을 그렸음
  function frame(dt, look, axes) {
    const state = cur.state;
    if (toastT > 0 && (toastT -= dt) <= 0) toast.style.opacity = '0';
    for (const ev of state.tick(dt)) {
      if (ev === 'load') {
        if (!mod) { state._waitLoad = true; }
        else buildInside();
      } else if (ev === 'unload') {
        const e = cur.byId?.get(state.target) || cur.byId?.get(state.entry);
        onInterior?.('', null); // [zone] 원격 아바타를 바깥 Scene 으로 먼저 돌려놓고 dispose
        inside?.dispose(); inside = null;
        feed?.stop(); feed = null;
        document.body.classList.remove('in-subway');
        setHint('');
        onExit?.(e);
      }
    }
    if (state._waitLoad && mod) { state._waitLoad = false; buildInside(); }
    fade.style.opacity = String(state.phase === 'arriving' && !inside ? 1 : state.fadeAlpha());
    if (!state.interior || !inside) return state.interior; // 로드 대기 중이면 검은 화면 유지
    const r = inside.update(dt, { look, axes, allowMove: state.canWalk, self: getSelf?.() });
    if (state.canWalk) {
      if (r.enteredPassage) openChooser();
      if (r.wellHint) say(tr(`${r.wellHint.ko} 승강장은 다음 업데이트에서 열려요`, `Platform (${r.wellHint.en}) — coming soon`), 2.6);
      setHint(`<kbd>E</kbd>${tr('나갈 출구 고르기', 'Choose exit')}`);
    } else if (state.phase === 'choosing') setHint('');
    inside.render();
    return true;
  }
  function buildInside() {
    feed = createArrivalFeed({ theme: cur.theme, base: PHONE_BASE, enabled: rtOn });
    inside = mod.buildConcourse({
      exits: cur.exits, groups: cur.groups, entryId: cur.state.entry, look: getLook?.(), renderer, theme: cur.theme, board: feed,
      onToast: (kind) => { if (kind === 'tap') { beep(); say(tr('삑 — 교통카드 태그', 'Beep — card tapped'), 1.3); } },
    });
    // 바로 프레임 하나 갱신 (NPC 배치·카메라)
    inside.update(0, { look: [0, 0, 0], axes: { f: 0, s: 0, run: false }, allowMove: false });
    document.body.classList.add('in-subway');
    onInterior?.(cur.theme.zone, inside); // [zone]
  }
  // [zone] 대합실 안에 있는 동안 프레즌스로 보낼 위치 (실내 좌표 → 구역 띠 좌표)
  function netState() {
    if (!cur.state.interior || !inside) return null;
    const me = inside.player;
    return { ...encodeZone(cur.theme.zone, me.position.x, me.position.z), ry: me.rotation.y, moving: inside.speed > 0 };
  }

  function onKey(e) {
    const state = cur.state;
    if (!state.active) {
      if (e.code === 'KeyE' && !e.repeat && lastNear) return enter(lastNear);
      return false;
    }
    if (state.phase === 'choosing') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { state.move(-1); renderChooser(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { state.move(1); renderChooser(); }
      else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { e.preventDefault?.(); go(); }
      else if (e.code === 'Escape') closeChooser();
      else if (/^Digit\d$/.test(e.code)) { const i = cur.exits.findIndex((x) => x.ref === e.code.slice(5)); if (i >= 0) { state.move(i - state.pick); renderChooser(); go(); } }
      return true;
    }
    if (state.phase === 'inside' && e.code === 'KeyE' && !e.repeat) { openChooser(); return true; }
    if (state.phase === 'inside' && passKey?.(e)) return false;
    if (e.code === 'Enter') return false; // 채팅은 그대로
    return true;
  }
  // 스크린샷·테스트: 역 출입구를 바로 만들기 (거리와 무관)
  function ensureStation(id) { const st = stations.find((s) => s.def.id === id); if (st && !st.ent) buildEnt(st); if (st?.ent) st.ent.group.visible = true; return st || null; }
  const allEntrances = () => built().flatMap((s) => s.ent.list);

  return {
    get exits() { return cur.exits; }, get entrances() { return allEntrances(); }, get state() { return cur.state; },
    get station() { return cur.theme; }, stations,
    get active() { return cur.state.active; },
    get busy() { return cur.state.busy; },
    get interior() { return cur.state.interior; },
    get inside() { return inside; },
    blocks: (x, z, r) => { for (const st of stations) if (st.ent && st.ent.blocks(x, z, r)) return true; return false; },
    outdoorTick, frame, onKey, netState,
    get zone() { return cur.state.interior && inside ? cur.theme.zone : ''; },
    enterById: (id) => { for (const st of built()) { const e = st.byId.get(id); if (e) return enter(e); } return false; },
    ensureStation,
    openChooser, choose: (id) => { const i = cur.exits.findIndex((x) => x.id === id); if (i >= 0 && cur.state.phase === 'choosing') { cur.state.move(i - cur.state.pick); renderChooser(); } },
    go,
    drawCalls: () => built().filter((s) => s.ent.group.visible).reduce((a, s) => a + s.ent.group.children.length, 0),
    dispose() { inside?.dispose(); feed?.stop(); for (const st of stations) dropEnt(st); style.remove(); fade.remove(); hint.remove(); toast.remove(); chooser.remove(); },
  };
}
