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
import { CORRIDOR_STATION_IDS, CORRIDOR_STATION_COUNT, corridorName, layoutCorridorMap, OPEN_BRANCH_IDS, namsanGlobeEnabled, NAMSAN_LANDMARK } from '../corridor/globeCorridor.js';

import { lotteSiteLabel } from '../corridor/lotteOpening.js';
import { buildRouteMap, lotteChipX, RM_LEGEND, RM_MODE, RM_COLOR, RM_PASS_SHORT_EN } from './routeMap.js';
import { buildLandMap } from './routeMapLand.js';
import { isEn, tr, onLangChange } from '../i18n.js';
import { REPO_URL, isStarbaseLive } from '../worldGateFlags.js';

const LINE_COLOR = { '수인분당선': '#f5a200', '신분당선': '#d31145', '8호선': '#e6186c', '2호선': '#33a23d', '3호선': '#fe5b10', '9호선': '#bdb092', '경강선': '#0054a6' };
const LINE_EN = { '수인분당선': 'Suin-Bundang', '신분당선': 'Shinbundang', '8호선': 'Line 8', '2호선': 'Line 2', '3호선': 'Line 3', '9호선': 'Line 9', '경강선': 'Gyeonggang' };
const COUNTRY = { KR: ['KR', '한국', 'Korea'], US: ['US', '미국', 'USA'], ETC: ['🌐', '기타', 'Other'] };
// [route-map v1] 노선도 랜드마크 칩 아이콘 — 일반 도형(송신탑형 · 마천루형)만, 로고 아님
const IC_TOWER = '<svg class="v2-ic" width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="#bfefff" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M7 1v5"/><rect x="4" y="6" width="6" height="3" rx="1.2"/><path d="M6 9l-1 8M8 9l1 8M4 17h6"/></svg>';
const IC_SKY = '<svg class="v2-ic" width="12" height="18" viewBox="0 0 12 18" fill="none" stroke="#bfefff" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M6 1L3.2 17h5.6L6 1z"/><path d="M2 17h8"/></svg>';
const IC_OFF = '<svg class="v2-ic" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#9eb4c6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 10L2.5 2.5M2.5 7V2.5H7"/></svg>';
// 좁은 화면(< 768px)은 바텀시트 노선도. ui-v2 는 PC 전용(body.mobile·핸드폰이면 켜지지 않음)이라 데스크톱 창을 좁힌 경우다.
const COMPACT_MQ = '(max-width: 767.98px)';
// [route-map landscape] 높이가 낮은 가로 화면(폰 가로 844×390 · 740×360 · 932×430 등)은 전체 화면 가로 노선도(routeMapLand.js) — 바텀시트보다 우선
const LAND_MQ = '(max-height: 500px) and (orientation: landscape)';
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

  // ---- 03 역 선택 (실제 역 좌표 · layoutCorridorMap → routeMap.js 배치, 시안 bw-route-map v1)
  const BASE = layoutCorridorMap({ height: 430, width: 320 });
  const allStations = () => [...BASE.items, ...BASE.branches, BASE.landmark, ...(namsanGlobeEnabled() ? [NAMSAN_LANDMARK] : [])];
  const linesOf = (s) => (s.live ? ['신분당선', '수인분당선'] : (s.lines || []));
  let rm = null; // 마지막 노선도 배치 (setHot 이 점을 다시 그릴 때)
  const isLand = () => typeof matchMedia === 'function' && matchMedia(LAND_MQ).matches;
  const isCompact = () => typeof matchMedia === 'function' && matchMedia(COMPACT_MQ).matches && !isLand();
  // 데스크톱 지도 배율 k (0.9–1.15): 화면 높이에서 머리·범례·띠·선택 바(약 360px)와 지도 여백(52)을 뺀 높이에 맞춘다
  function pickK() {
    const avail = (root.clientHeight || innerHeight) - 58 - 12;
    return Math.max(0.9, Math.min(1.15, (avail - 360 - 52) / 609));
  }
  function pickerMapWidth() {
    const w = picker.clientWidth;
    if (!w) return isCompact() ? 358 : 672;
    const cs = getComputedStyle(picker);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    return Math.max(260, Math.round(w - pad));
  }
  function stationById(id) { return allStations().find((x) => (x.live ? 'jeongja' : x.id) === id); }
  function selectedRow(id) {
    const s = stationById(id) || BASE.items[0];
    const sid = s.live ? 'jeongja' : s.id;
    const label = (s.id === 'ntower' || s.namsan)
      ? stationLabel('jeongja', 'ntower')
      : s.landmark ? (lotteSiteLabel(isEn())?.main || stationLabel('jeongja', s.id)) : stationLabel('jeongja', sid === 'jeongja' ? null : sid);
    const lines = linesOf(s).map((l) => (isEn() ? (LINE_EN[l] || l) : l)).join(' · ');
    const pick = tr('다른 역은 지도에서 고르세요', 'pick another station on the map');
    // 좁은 화면: 이름표가 한 언어만 보여 주니 다른 언어 이름을 선택 바에 (8호선 · Jangji)
    const touch = isCompact() || isLand();
    const other = touch && !s.landmark ? (isEn() ? s.ko : s.en) : '';
    const sub = touch ? ([lines, other].filter(Boolean).join(' · ') || pick) : (lines ? `${lines} · ${pick}` : pick);
    return `<div class="v2-sel"><div class="v2-sel-t"><b>${esc(tr(`${label} 선택됨`, `${label} selected`))}</b><small>${esc(sub)}</small></div>
      <button type="button" class="v2-btn primary" data-v2-at="${sid}">${esc(tr(`${label}에 입장`, `Enter ${label}`))}</button></div>`;
  }
  const f1 = (v) => v.toFixed(1);
  function dotSvg(st, [x, y], on, R) {
    const r = on ? R + 3 : st.pass ? R - 1.5 : R;
    if (st.xf && !on) return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r + 1.5}" fill="#ffffff" stroke="${RM_COLOR.ink}" stroke-width="3"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${r - 2.5}" fill="${RM_COLOR.ink}"/>`;
    const fill = on ? RM_COLOR.gold : (st.pass ? '#9eb4c6' : '#ffffff');
    const stroke = on ? RM_COLOR.amber : (st.pass ? '#6b7a88' : RM_COLOR.ink);
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 4 : 3}"/>`;
  }
  function stationChip(s, en, compact, sel) {
    const id = s.live ? 'jeongja' : s.id;
    const main = en ? s.en : s.ko, sub = en ? s.ko : s.en;
    if (s.pass) {
      const short = compact && en ? (RM_PASS_SHORT_EN[id] || main) : main;
      const tail = compact && en ? '' : `<small>${esc(tr('통과', 'pass'))}</small>`;
      return `<span class="v2-stn is-pass" data-stn="${id}" title="${esc(`${main} · ${tr('통과', 'pass')}`)}"><b>${esc(short)}</b>${tail}</span>`;
    }
    const on = id === sel;
    return `<button type="button" class="v2-stn${on ? ' on' : ''}" data-stn="${id}" data-v2-at="${id}" data-hot="${id}"${compact ? ` aria-label="${esc(`${main} ${sub}`)}"` : ''}><b>${esc(main)}</b>${compact ? '' : `<small>${esc(sub)}</small>`}</button>`;
  }
  function landmarkChips(en, compact, sel) {
    const site = lotteSiteLabel(en); // 오픈 전: 잠실 랜드마크 공사현장 (칩엔 짧게, 전체 문구는 선택 바·title)
    const lotteMain = site ? tr('잠실 랜드마크', 'Jamsil Landmark') : (en ? BASE.landmark.en : BASE.landmark.ko);
    const lotteSub = site ? tr(`공정률 ${site.pct}%`, `${site.pct}% built`) : (compact ? '' : tr('잠실', 'Jamsil'));
    const lotte = `<button type="button" class="v2-lm${sel === BASE.landmark.id ? ' on' : ''}" data-v2-at="${BASE.landmark.id}" data-hot="${BASE.landmark.id}" title="${esc(site ? site.main : lotteMain)}">${IC_SKY}<span>${esc(lotteMain)}</span>${lotteSub ? `<small>${esc(lotteSub)}</small>` : ''}</button>`;
    // 남산은 분당–잠실 노선 밖이라 지도 범위를 넓히지 않는다 → 띠 왼쪽 점선 칩(노선 밖 · 도심 방면)
    const nt = namsanGlobeEnabled()
      ? `<button type="button" class="v2-lm is-off${sel === 'ntower' ? ' on' : ''}" data-v2-at="ntower" data-hot="ntower">${IC_TOWER}<span>${esc(en ? NAMSAN_LANDMARK.en : NAMSAN_LANDMARK.ko)}</span><small>${IC_OFF}${esc(compact ? tr('노선 밖', 'Off line') : tr('노선 밖 · 도심 방면', 'Off line · toward downtown'))}</small></button>`
      : '';
    return nt + lotte;
  }
  // [route-map landscape] 폰 가로 전용: 전체 화면 · 왼쪽 가로 고리 노선도(큰 칩) · 오른쪽 좁은 칸(제목·범례·랜드마크·선택 역 + 입장 버튼 고정)
  //   칩·랜드마크는 누르면 '선택'만(바로 입장하지 않음) → 오른쪽 아래 입장 버튼으로 들어간다.
  function renderLand() {
    const en = isEn();
    picker.classList.add('is-land'); picker.classList.remove('is-compact');
    picker.classList.toggle('is-en', en);
    root.classList.add('v2-rm-land'); root.classList.remove('v2-rm-compact');
    document.body.classList.add('v2-rm-land-on'); // 상단 바(#v2-top)를 가린다 — 닫기(×)가 '월드 선택'과 같은 동작
    picker.style.paddingBottom = '';
    const sel = hot || defaultAt;
    const stations = [...BASE.items, ...BASE.branches];
    const legend = RM_LEGEND.map((l) => `<span class="v2-lg"><i style="background:${LINE_COLOR[l]}"></i>${esc(en ? LINE_EN[l] : l)}</span>`).join('')
      + `<span class="v2-lg k"><i class="dot p"></i>${esc(tr('통과', 'Pass'))}</span>`;
    picker.innerHTML = `
      <div class="v2-lmap"><svg aria-hidden="true"></svg>${stations.map((s) => stationChip(s, en, true, sel)).join('')}</div>
      <aside class="v2-lside">
        <div class="v2-hrow">${headHtml(corridorName(en), { size: 16, icon: ICON.train(18, '#ffe169') })}<span class="v2-grow"></span>
          <button type="button" class="v2-close" data-v2="close" aria-label="${esc(tr('닫기', 'Close'))}">${ICON.close(16)}</button></div>
        <p class="v2-ldesc">${esc(tr(`정자 → 잠실 · ${CORRIDOR_STATION_COUNT}개 역`, `Jeongja → Jamsil · ${CORRIDOR_STATION_COUNT} stations`))}</p>
        <div class="v2-legend">${legend}</div>
        <div class="v2-lmarks">${landmarkChips(en, true, sel)}</div>
        <span class="v2-grow"></span>
        <div class="v2-sel-slot">${selectedRow(sel)}</div>
      </aside>`;
    // 지도·랜드마크 칩은 선택 전용 (입장은 선택 바 버튼만)
    picker.querySelectorAll('.v2-lmap [data-v2-at], .v2-lmarks [data-v2-at]').forEach((e) => { e.dataset.pick = e.dataset.v2At; delete e.dataset.v2At; });
    layoutLand(sel);
  }
  function layoutLand(sel) {
    const map = picker.querySelector('.v2-lmap'), svg = map.querySelector('svg');
    const W = Math.max(320, map.clientWidth || 520), H = Math.max(220, map.clientHeight || 320);
    const chips = new Map([...map.querySelectorAll('[data-stn]')].map((e) => [e.dataset.stn, e]));
    const size = new Map();
    for (const [id, e] of chips) {
      const w0 = e.offsetWidth, h0 = e.offsetHeight;
      let w1 = w0;
      if (!e.classList.contains('is-pass')) { const was = e.classList.contains('on'); e.classList.toggle('on', !was); w1 = e.offsetWidth; e.classList.toggle('on', was); }
      size.set(id, { w: Math.ceil(Math.max(w0, w1)) || 60, h: Math.ceil(h0) || 32 });
    }
    const list = [...BASE.items, ...BASE.branches].map((s) => ({ id: s.live ? 'jeongja' : s.id, ko: s.ko, en: s.en, pass: !!s.pass, lines: linesOf(s) }));
    const m = buildLandMap(list, { W, H }, (id) => size.get(id));
    rm = m;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const lines = m.lines.map((l) => `<polyline points="${l.pts.map((p) => p.map(f1).join(',')).join(' ')}" stroke="${l.color}" stroke-width="${m.M.lw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const dots = m.stations.map((st) => `<g data-dot="${st.id}">${dotSvg(st, m.pos.get(st.id), !st.pass && st.id === sel, m.M.dotR)}</g>`).join('');
    // 고리 안쪽 빈자리에 조작 안내(장식, 터치 없음)
    const { xJ, xR, yMid } = m.rows;
    const hint = `<text x="${f1((xJ + xR) / 2 + 24)}" y="${f1(yMid + 5)}" text-anchor="middle" font-size="13" font-weight="700" fill="#9eb4c6" fill-opacity=".55">${esc(tr('역을 눌러 고른 뒤 오른쪽 아래 입장', 'Tap a station, then Enter'))}</text>`;
    svg.innerHTML = lines + dots + hint;
    for (const l of m.labels) {
      const e = chips.get(l.id);
      if (!e) continue;
      // 가운데 이름표는 점 위/아래 가운데 기준(선택돼 커져도 가운데 유지), 오른쪽 이름표는 left 기준
      e.style.left = `${f1(l.sd === 'C' ? l.x + l.w / 2 : l.x)}px`; e.style.right = 'auto';
      e.style.top = `${f1(l.y)}px`;
      e.dataset.side = l.sd;
    }
    map.__rm = m; // 검증 스크립트가 실측 DOM 과 대조
  }
  function renderPicker() {
    if (isLand()) { renderLand(); return; }
    picker.classList.remove('is-land'); root.classList.remove('v2-rm-land'); document.body.classList.remove('v2-rm-land-on');
    const en = isEn(), compact = isCompact(), M = compact ? RM_MODE.mobile : RM_MODE.desktop;
    picker.classList.toggle('is-compact', compact);
    picker.classList.toggle('is-en', en);
    root.classList.toggle('v2-rm-compact', compact);
    const W = pickerMapWidth(), k = pickK();
    const sel = hot || defaultAt;
    const stations = [...BASE.items, ...BASE.branches];
    const legend = RM_LEGEND.map((l) => `<span class="v2-lg"><i style="background:${LINE_COLOR[l]}"></i>${esc(en ? LINE_EN[l] : l)}</span>`).join('')
      + (compact ? '' : `<span class="v2-lg k"><i class="dot"></i>${esc(tr('역', 'Station'))}</span><span class="v2-lg k"><i class="dot x"></i>${esc(tr('환승', 'Transfer'))}</span>`)
      + `<span class="v2-lg k"><i class="dot p"></i>${esc(tr('통과', 'Pass'))}</span>`;
    const foot = compact
      ? tr('실제 역 위치(OpenStreetMap) 기준 · 일부 간격 보정 · 이름을 탭해 시작', 'Real positions (OpenStreetMap) · spacing adjusted · tap a name')
      : tr('실제 역 위치(OpenStreetMap) 기준 · 역 이름을 누르면 그 역에서 시작', 'Real station positions (OpenStreetMap) · click a station to start there');
    const desc = compact
      ? tr('정자 → 잠실 · 시작할 역을 고르세요', 'Jeongja → Jamsil · pick where to start')
      : tr(`정자 → 잠실 · ${CORRIDOR_STATION_COUNT}개 역 · 시작할 역을 고르세요`, `Jeongja → Jamsil · ${CORRIDOR_STATION_COUNT} stations · pick where to start`);
    const selHtml = `<div class="v2-sel-slot">${selectedRow(sel)}</div>`;
    const footHtml = `<p class="v2-foot">${esc(foot)}</p>`;
    picker.innerHTML = `
      ${compact ? '<span class="v2-grab" aria-hidden="true"></span>' : ''}
      <div class="v2-hrow">${headHtml(corridorName(en), { size: compact ? 19 : 22, icon: ICON.train(20, '#ffe169') })}<span class="v2-pill v2-pill-lg">${esc(tr(`${CORRIDOR_STATION_COUNT}개 역`, `${CORRIDOR_STATION_COUNT} stations`))}</span><span class="v2-grow"></span>
        <button type="button" class="v2-close" data-v2="close" aria-label="${esc(tr('닫기', 'Close'))}">${ICON.close(16)}</button></div>
      <p class="v2-desc v2-desc-lg">${esc(desc)}</p>
      <div class="v2-legend">${legend}</div>
      <div class="v2-mapwrap" style="width:${W}px">
        <div class="v2-band" style="height:${M.bandH}px">${compact ? '' : `<span class="v2-band-cap">${esc(tr('랜드마크', 'Landmarks'))}</span>`}${landmarkChips(en, compact, sel)}<span class="v2-sight" aria-hidden="true"></span></div>
        <div class="v2-map" style="width:${W}px"><svg width="${W}" height="0" aria-hidden="true"></svg>${stations.map((s) => stationChip(s, en, compact, sel)).join('')}</div>
      </div>
      ${compact ? footHtml + selHtml : selHtml + footHtml}`;
    layoutPicker({ W, k, compact, M, sel });
  }
  // 실측 크기로 이름표를 배치하고 점·선·지시선을 그린다 (선택 상태 폭까지 재서, 골라서 커져도 안 겹친다)
  function layoutPicker({ W, k, compact, M, sel }) {
    const map = picker.querySelector('.v2-map'), svg = map.querySelector('svg');
    const chips = new Map([...map.querySelectorAll('[data-stn]')].map((e) => [e.dataset.stn, e]));
    const size = new Map();
    for (const [id, e] of chips) {
      const w0 = e.offsetWidth, h0 = e.offsetHeight;
      let w1 = w0;
      if (!e.classList.contains('is-pass')) { const was = e.classList.contains('on'); e.classList.toggle('on', !was); w1 = e.offsetWidth; e.classList.toggle('on', was); }
      size.set(id, { w: Math.ceil(Math.max(w0, w1)) || 60, h: Math.ceil(h0) || (compact ? 32 : 26) });
    }
    const m = buildRouteMap(BASE, { mobile: compact, W, k }, (id) => size.get(id) || { w: 60, h: compact ? 32 : 26 });
    rm = m;
    map.style.height = `${m.H}px`;
    svg.setAttribute('height', m.H); svg.setAttribute('viewBox', `0 0 ${W} ${m.H}`);
    const lines = m.lines.map((l) => `<polyline points="${l.pts.map((p) => p.map(f1).join(',')).join(' ')}" stroke="${l.color}" stroke-width="${M.lw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const leaders = m.labels.filter((l) => l.leader).map((l) => `<line x1="${f1(l.leader[0])}" y1="${f1(l.leader[1])}" x2="${f1(l.leader[2])}" y2="${f1(l.leader[3])}" stroke="#ffffff" stroke-opacity=".3" stroke-width="1.5"/>`).join('');
    const dots = m.stations.map((st) => `<g data-dot="${st.id}">${dotSvg(st, m.pos.get(st.id), !st.pass && st.id === sel, M.dotR)}</g>`).join('');
    let lm = '';
    if (m.diamond) {
      const [dx, dy] = m.diamond;
      lm = `<line x1="${f1(dx)}" y1="0" x2="${f1(dx)}" y2="${f1(dy - 8)}" stroke="${RM_COLOR.cyan}" stroke-opacity=".75" stroke-width="1.5" stroke-dasharray="2 4" stroke-linecap="round"/>`
        + `<rect x="${f1(dx - 6)}" y="${f1(dy - 6)}" width="12" height="12" transform="rotate(45 ${f1(dx)} ${f1(dy)})" fill="${RM_COLOR.cyan}" stroke="#ffffff" stroke-width="2"/>`;
    }
    svg.innerHTML = lines + leaders + dots + lm;
    for (const l of m.labels) {
      const e = chips.get(l.id);
      if (!e) continue;
      // 점 반대쪽으로만 커지게: 오른쪽 이름표는 left, 왼쪽 이름표는 right 기준
      if (l.sd === 'RA' || l.sd === 'R') { e.style.left = `${f1(l.x)}px`; e.style.right = 'auto'; } else { e.style.right = `${f1(W - l.x - l.w)}px`; e.style.left = 'auto'; }
      e.style.top = `${f1(l.y)}px`;
      e.dataset.side = l.sd;
    }
    // 랜드마크 띠: 남산 칩은 왼쪽, 롯데 칩은 잠실 x 가운데(남산 칩 + 12px 이상), 칩 아래에서 띠 아래까지 점선 시선
    const band = picker.querySelector('.v2-band');
    const cap = band.querySelector('.v2-band-cap'), nt = band.querySelector('.v2-lm.is-off');
    const lotte = band.querySelector(`.v2-lm[data-v2-at="${BASE.landmark.id}"]`), sight = band.querySelector('.v2-sight');
    const chipTop = (M.bandH - M.chipH) / 2;
    let namR = -Infinity;
    if (nt) {
      const ntLeft = cap ? cap.offsetLeft + cap.offsetWidth + 10 : 8;
      nt.style.left = `${ntLeft}px`; nt.style.top = `${chipTop}px`;
      namR = ntLeft + nt.offsetWidth;
      // 영문 등으로 두 칩이 한 줄에 안 들어가면 남산 칩 보조 글자를 접는다
      if (lotte && namR + 12 + lotte.offsetWidth > W - 8) { nt.classList.add('is-tight'); namR = ntLeft + nt.offsetWidth; }
    }
    if (lotte) {
      const jx = m.diamond ? m.diamond[0] : W / 2;
      const lx = lotteChipX(jx, lotte.offsetWidth, W, namR);
      lotte.style.left = `${f1(lx)}px`; lotte.style.top = `${chipTop}px`;
      sight.hidden = !m.diamond || !(jx > lx + 6 && jx < lx + lotte.offsetWidth - 6);
      sight.style.left = `${f1(jx - 0.75)}px`; sight.style.top = `${chipTop + M.chipH}px`; sight.style.height = `${M.bandH - chipTop - M.chipH}px`;
    }
    // 좁은 화면: 선택 바는 시트 아래 고정 → 그만큼 아래 여백
    const slot = picker.querySelector('.v2-sel-slot');
    picker.style.paddingBottom = compact ? `${Math.ceil((slot?.offsetHeight || 90) + 9)}px` : '';
    // 화면보다 길면(가로 모드·작은 창) 지도 영역만 세로 스크롤, 띠는 sticky
    const wrap = picker.querySelector('.v2-mapwrap');
    wrap.style.maxHeight = '';
    const over = picker.scrollHeight - picker.clientHeight;
    if (over > 1) wrap.style.maxHeight = `${Math.max(M.bandH + 180, wrap.offsetHeight - over - 2)}px`;
    map.__rm = m; // 검증 스크립트(scripts/verify-route-map.mjs)가 실측 DOM 과 대조
  }
  function renderMini() {
    const s = sum();
    mini.innerHTML = `
      <div class="v2-hrow"><b class="v2-mini-t">${esc(tr('월드 선택', 'World Select'))}</b><span class="v2-grow"></span>${tagHtml(tr(`${s.open}개 역 오픈`, `${s.open} stations open`), '#ffe169', { size: 11 })}</div>
      ${card({ name: corridorName(isEn()), desc: tr('정자 → 잠실 · 롯데월드타워', 'Jeongja → Jamsil · Lotte World Tower'), count: tr(`${CORRIDOR_STATION_COUNT}개 역`, `${CORRIDOR_STATION_COUNT} stations`), open: true, colors: STRIP.corridor, cta: tr('선택됨', 'Selected'), attr: 'data-v2="noop"', sel: true })}
      <p class="v2-desc">${esc(tr('다른 지역은 ‹ 월드 선택에서 고르세요', 'Pick other regions from ‹ World Select'))}</p>`;
  }

  function setHot(id, force = false) {
    if (!id || hot === id || (!force && performance.now() - openedAt < 400)) return;
    if (stationById(id)?.pass) return;
    hot = id;
    picker.querySelectorAll('[data-hot]').forEach((b) => b.classList.toggle('on', b.dataset.hot === id));
    if (rm) {
      const R = rm.M.dotR;
      picker.querySelectorAll('g[data-dot]').forEach((gEl) => {
        const st = rm.stations.find((x) => x.id === gEl.dataset.dot);
        if (st) gEl.innerHTML = dotSvg(st, rm.pos.get(st.id), !st.pass && st.id === id, R);
      });
    }
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
    root.classList.remove('v2-view-station', 'v2-rm-compact', 'v2-rm-land'); document.body.classList.remove('v2-rm-land-on');
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
    root.classList.add('v2-view-station');
    renderPicker(); renderMini();
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
    const pk = t.closest('[data-pick]');
    if (pk && picker.contains(pk)) { e.stopPropagation(); e.preventDefault(); setHot(pk.dataset.pick, true); return; }
    const at = t.closest('[data-v2-at]');
    if (at && picker.contains(at)) { e.stopPropagation(); e.preventDefault(); goStation(at.dataset.v2At); return; }
    if (corridorGlobe && (t.closest('[data-corridor-open]') || t.closest('#gate-corridor') || t.closest('.gate-focus-chip[data-focus-region="jeongja"]'))) {
      e.stopPropagation(); e.preventDefault();
      showStation();
    }
  };
  const onKey = (e) => { if (e.key === 'Escape' && view === 'station') showWorld(); };
  const onOver = (e) => { if (e.type === 'pointerover' && picker.classList.contains('is-land')) return; /* 가로 폰: 탭(클릭)으로만 고른다 — 마우스로 입장 버튼까지 가며 선택이 바뀌지 않게 */ const b = e.target.closest('[data-hot]'); if (b && picker.contains(b)) setHot(b.dataset.hot); };
  let resizeRaf = 0;
  const onResize = () => { if (view !== 'station') return; cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => { if (alive && view === 'station') renderPicker(); }); };
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
    cancelAnimationFrame(resizeRaf);
    root.classList.remove('v2-gate', 'v2-view-station', 'v2-rm-compact', 'v2-rm-land'); document.body.classList.remove('v2-rm-land-on');
    world.remove(); picker.remove(); mini.remove();
  }

  renderWorld();
  if (view === 'station' && corridorGlobe) showStation(); else showWorld();
  return { dispose };
}

