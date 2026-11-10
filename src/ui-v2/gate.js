// [ui-v2] 02 월드 선택 · 03 노선/역 선택 — 기존 지구본(worldGate.js)은 그대로 두고 그 위에 게임 패널을 얹는다.
//   - 왼쪽 '월드 선택' 패널(국가 그룹 · 지역 카드)이 오른쪽 '오픈 월드 지역 현황' 목록을 대신한다(CSS 로 숨김).
//   - '분당–잠실 구간'(카드 · 지구본 핀 · 구간 보기 · 휠 확대)을 누르면 왼쪽 큰 '역 선택' 패널. 지구본은 기존 노선도처럼
//     한국 쪽으로 확대되고(corridorGlobe.toggle), 작은 노선 팝업은 숨긴다.
//   - 버튼은 기존 data-* 속성(data-enter-region / data-enter-at / data-region)을 그대로 써서 worldGate 의 클릭 처리로 들어간다.
//   - 새 WebGL 없음(SVG + DOM). 지구본 렌더러/드로우콜은 기존과 같다.
import { el, esc, ICON, headHtml, tagHtml, guestChip } from './kit.js';
import { setTop, backChip, liveChip, langChip } from './topbar.js';
import { regionSummary, stationLabel, readLastStation } from './data.js';
import { OPEN_REGIONS, UPCOMING_REGIONS, getRegion, countryOf, regionBlurb } from '../regions/index.js';
import { CORRIDOR_STATION_IDS, CORRIDOR_STATION_COUNT, corridorName, layoutCorridorMap, OPEN_BRANCH_IDS } from '../corridor/globeCorridor.js';
import { lotteSiteLabel } from '../corridor/lotteOpening.js';
import { isEn, tr, onLangChange } from '../i18n.js';
import { REPO_URL, isStarbaseLive } from '../worldGate.js';

const LINE_COLOR = { '수인분당선': '#f5a200', '신분당선': '#d31145', '8호선': '#e6186c', '2호선': '#33a23d', '3호선': '#fe5b10', '9호선': '#bdb092', '경강선': '#0054a6' };
const LINE_EN = { '수인분당선': 'Suin-Bundang', '신분당선': 'Shinbundang', '8호선': 'Line 8', '2호선': 'Line 2', '3호선': 'Line 3', '9호선': 'Line 9', '경강선': 'Gyeonggang' };
const COUNTRY = { KR: ['KR', '한국', 'Korea'], US: ['US', '미국', 'USA'], ETC: ['🌐', '기타', 'Other'] };
const STRIP = { corridor: ['#f5a200', '#e6186c'], branch: ['#d31145', '#d31145'], us: ['#4cc9f0', '#1f5fbf'], kr: ['#d4003b', '#f5a200'] };

let view = 'world'; // 다시 열 때(입장 카드 ‹ 노선 · 역 선택) 마지막 화면으로
/** 입장 직전에 부른다: 노선 역으로 들어가면(이어하기 포함) 돌아올 때 역 선택 화면으로 */
export function setGateView(v) { view = v === 'station' ? 'station' : 'world'; }

/**
 * worldGate.setGateDecorator 로 등록. ctx: { root, corridorGlobe, enter(regionId, force, extra), focus(regionId), teardown() }
 * @param {{ onBackToStart: () => void }} opts
 */
export function makeGateDecorator({ onBackToStart }) {
  return (ctx) => mountGate(ctx, onBackToStart);
}

function mountGate({ root, corridorGlobe, enter, focus, teardown }, onBackToStart) {
  root.classList.add('v2-gate');
  const world = el('section', 'v2-panel v2-world');
  world.setAttribute('aria-label', 'World select');
  const picker = el('section', 'v2-panel v2-picker');
  picker.hidden = true;
  const mini = el('section', 'v2-panel v2-mini');
  mini.hidden = true;
  root.append(world, picker, mini);
  let alive = true;
  let hot = null; // 역 선택 패널에서 가리킨 역 (없으면 마지막 역 / 정자)
  let openedAt = 0; // 패널이 열린 순간 마우스 아래 있던 역을 '가리킴'으로 치지 않게
  const last = readLastStation();
  const defaultAt = last?.region === 'jeongja' ? (last.at || 'jeongja') : 'jeongja';

  const sum = () => regionSummary();
  const strip = (c) => `<span class="v2-strip" style="background:linear-gradient(180deg,${c[0]},${c[1]})"></span>`;
  function card({ name, desc, count, open, colors, cta, attr, sel, soonText }) {
    return `<div class="v2-rcard ${open ? 'is-open' : 'is-soon'}${sel ? ' is-sel' : ''}" ${open ? '' : attr}>
      ${strip(open ? colors : ['#5c6b80', '#5c6b80'])}
      <div class="v2-rcard-body"><div class="v2-rcard-t"><b>${esc(name)}</b>${count ? `<span class="v2-pill">${esc(count)}</span>` : ''}</div><small>${esc(desc)}</small></div>
      ${open ? `${tagHtml(tr('열림', 'Open'), '#20c997', { size: 11, cls: 'v2-tag-sm' })}<button type="button" class="v2-btn sm ${sel ? 'primary' : 'secondary'}" ${attr}>${esc(cta || tr('입장', 'Enter'))}</button>`
        : `<span class="v2-soon">${ICON.lock(12)}${esc(soonText || tr('준비중', 'Soon'))}</span>`}
    </div>`;
  }

  function regionEntries() {
    const en = isEn(), live = isStarbaseLive(), cor = !!corridorGlobe;
    const out = [];
    for (const r of OPEN_REGIONS) {
      const c = countryOf(r);
      if (r.id === 'jeongja' && cor) {
        out.push({ c, open: true, html: card({ name: corridorName(en), desc: tr('정자 → 잠실 · 롯데월드타워', 'Jeongja → Jamsil · Lotte World Tower'), count: tr(`${CORRIDOR_STATION_COUNT}개 역`, `${CORRIDOR_STATION_COUNT} stations`), open: true, colors: STRIP.corridor, cta: tr('노선 보기', 'View line'), attr: 'data-corridor-open="1"' }) });
        continue;
      }
      const isSoon = r.id === 'starbase' && !live;
      const flight = c !== 'KR';
      const sub = (en ? (r.enSub || r.sub) : r.sub) || '';
      const desc = flight ? `${sub.split(' · ')[0]} · ${tr('탑승권 화면으로 이동', 'boarding pass flight')}` : sub;
      out.push({ c, open: !isSoon, html: card({ name: en ? (r.enName || r.name) : r.name, desc, open: !isSoon, colors: c === 'US' ? STRIP.us : STRIP.kr, attr: `data-enter-region="${r.id}"`, soonText: isSoon ? '11:00 KST' : '' }) });
    }
    if (cor) for (const r of UPCOMING_REGIONS.filter((x) => OPEN_BRANCH_IDS.has(x.id))) {
      out.push({ c: countryOf(r), open: true, html: card({ name: en ? (r.enName || r.name) : r.name, desc: regionBlurb(r, en, true), open: true, colors: STRIP.branch, attr: `data-enter-at="${r.id}"` }) });
    }
    for (const r of UPCOMING_REGIONS.filter((x) => !(cor && (CORRIDOR_STATION_IDS.has(x.id) || OPEN_BRANCH_IDS.has(x.id))))) {
      out.push({ c: countryOf(r), open: false, html: card({ name: en ? (r.enName || r.name) : r.name, desc: en ? (r.enDesc || r.desc) : r.desc, open: false, attr: `data-region="${r.id}" role="button" tabindex="0"` }) });
    }
    return out;
  }

  function renderWorld() {
    const s = sum(), entries = regionEntries();
    const order = [...new Set(['KR', 'US', ...entries.map((x) => x.c)])].filter((c) => entries.some((x) => x.c === c));
    world.innerHTML = `
      <div class="v2-hrow">${headHtml(tr('월드 선택', 'World Select'), { size: 20, icon: ICON.globe(20, '#ffe169') })}<span class="v2-grow"></span>${tagHtml(tr(`${s.open}개 역 오픈`, `${s.open} stations open`), '#ffe169', { size: 11 })}</div>
      <p class="v2-desc">${esc(tr('가고 싶은 지역을 고르세요. 열린 곳만 입장할 수 있어요.', 'Pick where to go. Only open places can be entered.'))}</p>
      ${order.map((c) => {
        const m = COUNTRY[c] || COUNTRY.ETC, n = s.by[c] || { open: 0, soon: 0 };
        return `<div class="v2-country"><span class="v2-flag">${m[0]}</span><b>${isEn() ? m[2] : m[1]}</b><small>${isEn() ? m[1] : m[2]}</small><span class="v2-grow"></span>
          ${n.open ? tagHtml(tr(`열림 ${n.open}`, `${n.open} open`), c === 'US' ? '#4cc9f0' : '#20c997', { size: 11, cls: 'v2-tag-xs' }) : ''}
          ${n.soon ? tagHtml(tr(`준비중 ${n.soon}`, `${n.soon} soon`), '#9eb4c6', { size: 11, cls: 'v2-tag-xs' }) : ''}</div>
          ${entries.filter((x) => x.c === c).map((x) => x.html).join('')}`;
      }).join('')}
      <a class="v2-btn sm secondary v2-full" href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">${esc(tr('+ 내 동네 개척자로 참여하기 (GitHub)', '+ Contribute Your Neighborhood (GitHub)'))}</a>`;
  }

  // ---- 03 역 선택 (실제 역 좌표 · layoutCorridorMap 을 k 배로)
  const BASE = layoutCorridorMap({ height: 430, width: 320 });
  const allStations = () => [...BASE.items, ...BASE.branches, BASE.landmark];
  const linesOf = (s) => (s.live ? ['신분당선', '수인분당선'] : (s.lines || []));
  function pickK() {
    const avail = (root.clientHeight || innerHeight) - 58 - 12;
    return Math.max(0.9, Math.min(1.5, (avail - 300 - 38) / 430));
  }
  function pickerMapWidth() {
    const w = picker.clientWidth;
    if (!w) return 560;
    const cs = getComputedStyle(picker);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    return Math.max(260, Math.round(w - pad));
  }
  // 긴 이름표(청계산입구 등)가 패널 밖으로 잘리지 않게 맵 안쪽으로 민다.
  function fitMapLabels(map, W) {
    if (!map || !W) return;
    const PAD = 8;
    map.querySelectorAll('.v2-stn, .v2-lm').forEach((el) => {
      const width = el.getBoundingClientRect().width;
      let left = el.offsetLeft;
      if (left < PAD) {
        el.style.right = 'auto';
        el.style.left = `${PAD}px`;
        left = PAD;
      }
      if (left + width > W - PAD) {
        el.style.right = 'auto';
        el.style.left = `${Math.max(PAD, W - PAD - width)}px`;
      }
    });
  }
  function stationById(id) { return allStations().find((x) => (x.live ? 'jeongja' : x.id) === id); }
  function selectedRow(id) {
    const s = stationById(id) || BASE.items[0];
    const sid = s.live ? 'jeongja' : s.id;
    const label = s.landmark ? (lotteSiteLabel(isEn())?.main || stationLabel('jeongja', s.id)) : stationLabel('jeongja', sid === 'jeongja' ? null : sid);
    const lines = linesOf(s).map((l) => (isEn() ? (LINE_EN[l] || l) : l)).join(' · ');
    return `<div class="v2-sel"><div class="v2-sel-t"><b>${esc(tr(`${label} 선택됨`, `${label} selected`))}</b><small>${esc(lines ? `${lines} · ${tr('다른 역은 지도에서 고르세요', 'pick another station on the map')}` : tr('다른 역은 지도에서 고르세요', 'pick another station on the map'))}</small></div>
      <button type="button" class="v2-btn primary" data-v2-at="${sid}">${esc(tr(`${label}에 입장`, `Enter ${label}`))}</button></div>`;
  }
  function renderPicker() {
    const en = isEn(), k = pickK(), W = pickerMapWidth(), ox = (W - 320 * k) / 2, oy = 14, H = Math.round(430 * k + oy * 2 + 10);
    const P = (s) => [ox + s.dx * k, oy + s.dy * k];
    const sel = hot || defaultAt;
    let seg = '';
    const byId = new Map([...BASE.items, ...BASE.branches].map((st) => [st.id, st]));
    for (const b of BASE.branches) {
      const shared = (b.from.lines || []).find((l) => (b.lines || []).includes(l)) || (b.lines || [])[0];
      const [x1, y1] = P(b.from), [x2, y2] = P(b);
      seg += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${LINE_COLOR[shared] || '#9eb4c6'}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      for (const id of b.links || []) {
        const t = byId.get(id);
        if (!t) continue;
        const link = (b.lines || []).find((l) => (t.lines || []).includes(l)) || (b.lines || [])[0];
        const [lx1, ly1] = P(b), [lx2, ly2] = P(t);
        seg += `<path d="M${lx1.toFixed(1)} ${ly1.toFixed(1)} L${lx2.toFixed(1)} ${ly2.toFixed(1)}" stroke="${LINE_COLOR[link] || '#9eb4c6'}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      }
    }
    for (let i = 1; i < BASE.items.length; i++) {
      const a = BASE.items[i - 1], b = BASE.items[i];
      const shared = (a.lines || ['수인분당선']).find((l) => (b.lines || []).includes(l)) || (b.lines || [])[0];
      const [x1, y1] = P(a), [x2, y2] = P(b);
      seg += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${LINE_COLOR[shared] || '#9eb4c6'}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    }
    const stations = [...BASE.items, ...BASE.branches];
    const colX = (side) => ox + (side === 'left' ? BASE.colL : BASE.colR) * k;
    const Ly = (s) => oy + ((s.labelDy ?? s.dy) * k);
    const leaders = stations.map((s) => {
      if (s.labelAt === 'dot' || s.pin === 'dot') return '';
      const [x, y] = P(s);
      return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${colX(s.side).toFixed(1)} ${Ly(s).toFixed(1)}" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.5"/>`;
    }).join('');
    const dots = stations.map((s) => {
      const [x, y] = P(s), id = s.live ? 'jeongja' : s.id, on = !s.pass && id === sel;
      const fill = on ? '#ffe169' : (s.pass ? '#9eb4c6' : '#ffffff');
      const stroke = on ? '#f5a200' : (s.pass ? '#6b7a88' : '#122033');
      return `<circle ${s.pass ? '' : `data-dot="${id}" `}cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 9 : (s.pass ? 4.5 : 6)}" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 4 : 3}"/>`;
    }).join('');
    const [lx, ly] = P(BASE.landmark);
    const lm = `<rect x="${(lx - 6).toFixed(1)}" y="${(ly - 6).toFixed(1)}" width="12" height="12" transform="rotate(45 ${lx.toFixed(1)} ${ly.toFixed(1)})" fill="#4cc9f0" stroke="#ffffff" stroke-width="2"/>`;
    const chips = stations.map((s) => {
      const id = s.live ? 'jeongja' : s.id, on = !s.pass && id === sel, left = s.side === 'left';
      const [px, py] = P(s);
      const y = (s.labelAt === 'dot' || s.pin === 'dot') ? py : Ly(s);
      const pos = (s.labelAt === 'dot' || s.pin === 'dot')
        ? `left:${(px + 10).toFixed(1)}px`
        : (left ? `right:${(W - colX('left') + 4).toFixed(1)}px` : `left:${(colX('right') + 4).toFixed(1)}px`);
      if (s.pass) {
        return `<span class="v2-stn is-pass" style="${pos};top:${(y - 13).toFixed(1)}px"><b>${esc(en ? s.en : s.ko)}</b><small>${esc(tr('통과', 'pass'))}</small></span>`;
      }
      return `<button type="button" class="v2-stn${on ? ' on' : ''}" data-v2-at="${id}" data-hot="${id}" style="${pos};top:${(y - 13).toFixed(1)}px"><b>${esc(en ? s.en : s.ko)}</b><small>${esc(en ? s.ko : s.en)}</small></button>`;
    }).join('');
    const site = lotteSiteLabel(en);
    const lmChip = `<button type="button" class="v2-lm${sel === BASE.landmark.id ? ' on' : ''}" data-v2-at="${BASE.landmark.id}" data-hot="${BASE.landmark.id}" style="left:${(lx + 76).toFixed(1)}px;top:${Math.max(0, ly - 34).toFixed(1)}px">${esc(site ? site.main : (en ? BASE.landmark.en : BASE.landmark.ko))}</button>`;
    picker.innerHTML = `
      <div class="v2-hrow">${headHtml(corridorName(en), { size: 22, icon: ICON.train(20, '#ffe169') })}<span class="v2-pill v2-pill-lg">${esc(tr(`${CORRIDOR_STATION_COUNT}개 역`, `${CORRIDOR_STATION_COUNT} stations`))}</span><span class="v2-grow"></span>
        <button type="button" class="v2-close" data-v2="close" aria-label="${esc(tr('닫기', 'Close'))}">${ICON.close(16)}</button></div>
      <p class="v2-desc v2-desc-lg">${esc(tr(`정자 → 잠실 · ${CORRIDOR_STATION_COUNT}개 역 · 시작할 역을 고르세요`, `Jeongja → Jamsil · ${CORRIDOR_STATION_COUNT} stations · pick where to start`))}</p>
      <div class="v2-tags">${tagHtml(tr('신분당선', 'Shinbundang'), '#d31145', { size: 11, cls: 'v2-tag-xs' })}${tagHtml(tr('수인분당선', 'Suin-Bundang'), '#f5a200', { size: 11, cls: 'v2-tag-xs' })}${tagHtml(tr('8호선', 'Line 8'), '#e6186c', { size: 11, cls: 'v2-tag-xs' })}${tagHtml(tr('롯데월드타워', 'Lotte World Tower'), '#4cc9f0', { size: 11, cls: 'v2-tag-xs' })}</div>
      <div class="v2-map" style="width:${W}px;height:${H}px"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${leaders}${seg}${dots}${lm}</svg>${chips}${lmChip}</div>
      <div class="v2-sel-slot">${selectedRow(sel)}</div>
      <p class="v2-foot">${esc(tr('실제 역 위치(OpenStreetMap) 기준 · 역 이름을 누르면 그 역에서 시작', 'Real station positions (OpenStreetMap) · click a station to start there'))}</p>`;
    fitMapLabels(picker.querySelector('.v2-map'), W);
  }
  function renderMini() {
    const s = sum();
    mini.innerHTML = `
      <div class="v2-hrow"><b class="v2-mini-t">${esc(tr('월드 선택', 'World Select'))}</b><span class="v2-grow"></span>${tagHtml(tr(`${s.open}개 역 오픈`, `${s.open} stations open`), '#ffe169', { size: 11 })}</div>
      ${card({ name: corridorName(isEn()), desc: tr('정자 → 잠실 · 롯데월드타워', 'Jeongja → Jamsil · Lotte World Tower'), count: tr(`${CORRIDOR_STATION_COUNT}개 역`, `${CORRIDOR_STATION_COUNT} stations`), open: true, colors: STRIP.corridor, cta: tr('선택됨', 'Selected'), attr: 'data-v2="noop"', sel: true })}
      <p class="v2-desc">${esc(tr('다른 지역은 ‹ 월드 선택에서 고르세요', 'Pick other regions from ‹ World Select'))}</p>`;
  }

  function setHot(id) {
    if (!id || hot === id || performance.now() - openedAt < 400) return;
    if (stationById(id)?.pass) return;
    hot = id;
    picker.querySelectorAll('[data-hot]').forEach((b) => b.classList.toggle('on', b.dataset.hot === id));
    picker.querySelectorAll('[data-dot]').forEach((c) => {
      const on = c.dataset.dot === id;
      c.setAttribute('r', on ? 9 : 6); c.setAttribute('fill', on ? '#ffe169' : '#ffffff');
      c.setAttribute('stroke', on ? '#f5a200' : '#122033'); c.setAttribute('stroke-width', on ? 4 : 3);
    });
    const slot = picker.querySelector('.v2-sel-slot');
    if (slot) slot.innerHTML = selectedRow(id);
  }

  function top() {
    const station = view === 'station';
    setTop(
      [backChip(station ? tr('월드 선택', 'World Select') : tr('시작화면', 'Start'), () => (station ? showWorld() : backToStart())), guestChip()],
      [liveChip(getRegion('jeongja')), langChip()],
    );
  }
  function showWorld() {
    view = 'world';
    picker.hidden = true; mini.hidden = true; world.hidden = false;
    root.classList.remove('v2-view-station');
    if (corridorGlobe?.isOpen()) corridorGlobe.toggle(false);
    corridorGlobe?.zoomTo?.(99);
    top();
  }
  function showStation() {
    if (!corridorGlobe) return;
    view = 'station';
    hot = null;
    openedAt = performance.now();
    world.hidden = true; picker.hidden = false; mini.hidden = false;
    renderPicker(); renderMini();
    root.classList.add('v2-view-station');
    if (!corridorGlobe.isOpen()) corridorGlobe.toggle(true);
    focus?.('jeongja');
    top();
  }
  function backToStart() {
    dispose();
    teardown();
    onBackToStart?.();
  }

  const goStation = (id) => {
    if (id === 'jeongja') enter('jeongja');
    else enter('jeongja', false, { at: id });
  };

  // 캡처 단계: 구간 열기 계열은 v2 역 선택 패널로, v2 버튼은 여기서 처리
  const onClick = (e) => {
    const t = e.target;
    const v2 = t.closest('[data-v2]');
    if (v2 && root.contains(v2)) {
      e.stopPropagation(); e.preventDefault();
      if (v2.dataset.v2 === 'close') showWorld();
      return;
    }
    const at = t.closest('[data-v2-at]');
    if (at && picker.contains(at)) { e.stopPropagation(); e.preventDefault(); goStation(at.dataset.v2At); return; }
    if (corridorGlobe && (t.closest('[data-corridor-open]') || t.closest('#gate-corridor') || t.closest('.gate-focus-chip[data-focus-region="jeongja"]'))) {
      e.stopPropagation(); e.preventDefault();
      showStation();
    }
  };
  const onKey = (e) => { if (e.key === 'Escape' && view === 'station') showWorld(); };
  const onOver = (e) => { const b = e.target.closest('[data-hot]'); if (b && picker.contains(b)) setHot(b.dataset.hot); };
  const onResize = () => { if (view === 'station') renderPicker(); };
  root.addEventListener('click', onClick, true);
  root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.v2-rcard[data-region]')) e.target.click(); });
  addEventListener('keydown', onKey);
  picker.addEventListener('pointerover', onOver);
  picker.addEventListener('focusin', onOver);
  addEventListener('resize', onResize);
  // 휠로 한국 쪽을 확대하면 기존 노선도가 자동으로 펼쳐진다 → v2 에선 역 선택 패널로
  const poll = setInterval(() => { if (alive && corridorGlobe?.isOpen() && view !== 'station') showStation(); }, 250);
  const unsub = onLangChange(() => { if (!alive) return; renderWorld(); if (view === 'station') { renderPicker(); renderMini(); } top(); });

  function dispose() {
    if (!alive) return;
    alive = false;
    clearInterval(poll);
    unsub();
    removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    root.removeEventListener('click', onClick, true);
    root.classList.remove('v2-gate', 'v2-view-station');
    world.remove(); picker.remove(); mini.remove();
  }

  renderWorld();
  if (view === 'station' && corridorGlobe) showStation(); else showWorld();
  return { dispose };
}

