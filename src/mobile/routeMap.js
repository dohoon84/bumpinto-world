// [route-map mobile] 모바일 시작화면(landing.js)의 '어디서 시작할까요?' — 분당–잠실 구간은 폰 가로 노선도(ui-v2/routeMapLand.js)로 고른다.
//   PC 짧은 창(ui-v2/gate.js renderLand)과 같은 배치 함수·모양이지만 DOM 은 모바일 시작화면 것(#m-landing 아래 .m-rm-*)이라
//   PC 화면·ui-v2.css 와 서로 영향이 없다. 버튼은 landing.js 의 기존 클릭 처리 그대로 쓴다:
//     역·랜드마크 칩 = data-stn(선택만) · 입장 = data-act="go" · 뒤로 = data-act="back" · 다른 지역 = data-region
//   → 게스트·로그인·약관 재동의(gateAccountConsent) 흐름은 landing.js 에서 바뀌지 않는다.
//   ?mrm=0 이면 예전 역 칩 화면(지역 목록 + 가로 스크롤 칩)으로 돌아간다.
import * as GC from '../corridor/globeCorridor.js';
import { lotteSiteLabel } from '../corridor/lotteOpening.js';
import { buildLandMap, RM_LAND_SHORT_EN } from '../ui-v2/routeMapLand.js';
import { RM_LEGEND, RM_COLOR } from '../ui-v2/routeMap.js';
import { isEn } from '../i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (ko, en) => (isEn() ? en : ko);
const f1 = (v) => v.toFixed(1);
const LINE_COLOR = { '수인분당선': '#f5a200', '신분당선': '#d31145', '8호선': '#e6186c', '2호선': '#33a23d', '3호선': '#fe5b10', '9호선': '#bdb092', '경강선': '#0054a6', '4호선': '#00A5DE' };
const LINE_EN = { '수인분당선': 'Suin-Bundang', '신분당선': 'Shinbundang', '8호선': 'Line 8', '2호선': 'Line 2', '3호선': 'Line 3', '9호선': 'Line 9', '경강선': 'Gyeonggang', '4호선': 'Line 4' };
const BACK = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const IC_TOWER = '<svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="#bfefff" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M7 1v5"/><rect x="4" y="6" width="6" height="3" rx="1.2"/><path d="M6 9l-1 8M8 9l1 8M4 17h6"/></svg>';
const IC_SKY = '<svg width="12" height="18" viewBox="0 0 12 18" fill="none" stroke="#bfefff" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M6 1L3.2 17h5.6L6 1z"/><path d="M2 17h8"/></svg>';
const IC_L4 = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2" fill="#00A5DE" stroke="#fff" stroke-width="1.2"/><text x="8" y="11.4" text-anchor="middle" font-size="10" font-weight="900" fill="#fff" font-family="sans-serif">4</text></svg>';
const IC_OFF = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#9eb4c6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 10L2.5 2.5M2.5 7V2.5H7"/></svg>';

/** 모바일 시작화면에서 노선도를 쓸지 (?mrm=0 이면 예전 칩 화면) */
export function routeMapWanted(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('mrm') !== '0';
}

// 명동역(4호선)은 feat/myeongdong 에만 있다 → 있으면(그리고 ?myeongdong=0 이 아니면) 랜드마크 칸에 넣는다
const myeongdong = () => {
  const lm = GC.MYEONGDONG_LANDMARK;
  if (!lm) return null;
  try { return typeof GC.myeongdongGlobeEnabled !== 'function' || GC.myeongdongGlobeEnabled() ? lm : null; } catch { return null; }
};

let BASE = null;
const base = () => (BASE ||= GC.layoutCorridorMap({ height: 430, width: 320 }));
const sidOf = (s) => (s.live ? 'jeongja' : s.id);

/** 노선도에 그리는 역(통과 역 포함) */
export function mapStations() {
  const b = base();
  return [...b.items, ...b.branches].map((s) => ({ id: sidOf(s), ko: s.ko, en: s.en, pass: !!s.pass, lines: s.live ? ['신분당선', '수인분당선'] : (s.lines || []) }));
}
/** 노선 밖·랜드마크 칩 (남산 · 명동 · 롯데월드타워) */
export function landmarkStations() {
  const out = [];
  if (GC.namsanGlobeEnabled()) out.push({ ...GC.NAMSAN_LANDMARK, kind: 'namsan' });
  const md = myeongdong();
  if (md) out.push({ ...md, kind: 'myeongdong', lines: md.lines || ['4호선'] });
  const lotte = base().landmark;
  out.push({ id: lotte.id, ko: lotte.ko, en: lotte.en, landmark: true, kind: 'lotte' });
  return out;
}
/** 입장할 수 있는 id (통과 역 제외) — landing.js 가 선택값을 검사할 때 */
export function pickableIds() {
  return new Set([...mapStations().filter((s) => !s.pass).map((s) => s.id), ...landmarkStations().map((s) => s.id)]);
}

function selInfo(id) {
  const en = isEn();
  const lm = landmarkStations().find((s) => s.id === id);
  if (lm) {
    if (lm.kind === 'lotte') {
      const site = lotteSiteLabel(en);
      return { name: site ? site.main : (en ? lm.en : lm.ko), sub: site ? '' : (en ? lm.ko : lm.en), go: site ? t('잠실 랜드마크에 입장', 'Enter Jamsil Landmark') : t(`${lm.ko}에 입장`, `Enter ${lm.en}`) };
    }
    if (lm.kind === 'myeongdong') {
      const lines = (lm.lines || []).map((l) => (en ? (LINE_EN[l] || l) : l)).join(' · ');
      return { name: en ? `${lm.en} Stn.` : `${lm.ko}역`, sub: [lines, en ? lm.ko : lm.en, t('노선 밖', 'off line')].filter(Boolean).join(' · '), go: en ? `Enter ${lm.en}` : `${lm.ko}역으로 입장` };
    }
    return { name: en ? lm.en : lm.ko, sub: t('타워 앞 광장에서 시작', 'Start at the tower plaza'), go: t(`${lm.ko}에 입장`, `Enter ${lm.en}`) };
  }
  const s = mapStations().find((x) => x.id === id) || mapStations().find((x) => x.id === 'jeongja');
  const lines = s.lines.map((l) => (en ? (LINE_EN[l] || l) : l)).join(' · ');
  return { name: en ? `${s.en} Stn.` : `${s.ko}역`, sub: [lines, en ? s.ko : s.en].filter(Boolean).join(' · '), go: en ? `Enter ${s.en}` : `${s.ko}역으로 입장` };
}

function stationChip(s, sel) {
  const en = isEn();
  const full = en ? s.en : s.ko;
  const main = en ? (RM_LAND_SHORT_EN[s.id] || full) : full;
  if (s.pass) return `<span class="m-rm-stn is-pass" data-pass="${s.id}" title="${esc(`${full} · ${t('통과', 'pass')}`)}"><b>${esc(main)}</b><small>${esc(t('통과', 'pass'))}</small></span>`;
  return `<button type="button" class="m-rm-stn${s.id === sel ? ' on' : ''}" data-stn="${s.id}" aria-label="${esc(`${s.ko} ${s.en}`)}"><b>${esc(main)}</b></button>`;
}
function landmarkChip(s, sel) {
  const en = isEn(), on = s.id === sel ? ' on' : '';
  if (s.kind === 'lotte') {
    const site = lotteSiteLabel(en);
    const main = site ? t('잠실 랜드마크', 'Jamsil Landmark') : (en ? s.en : s.ko);
    const sub = site ? t(`공정률 ${site.pct}%`, `${site.pct}% built`) : '';
    return `<button type="button" class="m-rm-lm${on}" data-stn="${s.id}" title="${esc(site ? site.main : main)}">${IC_SKY}<span>${esc(main)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  }
  if (s.kind === 'myeongdong') return `<button type="button" class="m-rm-lm is-off${on}" data-stn="${s.id}" title="${esc(t('명동역 · 4호선', 'Myeongdong Stn. · Line 4'))}">${IC_L4}<span>${esc(en ? s.en : s.ko)}</span><small>${IC_OFF}${esc(t('4호선', 'Line 4'))}</small></button>`;
  return `<button type="button" class="m-rm-lm is-off${on}" data-stn="${s.id}">${IC_TOWER}<span>${esc(en ? s.en : s.ko)}</span><small>${IC_OFF}${esc(t('노선 밖', 'Off line'))}</small></button>`;
}

/**
 * 노선도 화면 HTML (landing.js render 의 pick 화면, 분당–잠실 구간일 때).
 * @param {{ sel: string, title: string, others: Array<{id,title,sub,locked}> }} o  others = 다른 지역(스타베이스 등) 버튼
 */
export function routeMapHtml({ sel, title, others = [] }) {
  const en = isEn();
  const md = myeongdong();
  const legend = [...RM_LEGEND, ...(md ? ['4호선'] : [])].map((l) => `<span class="m-rm-lg"><i style="background:${LINE_COLOR[l]}"></i>${esc(en ? LINE_EN[l] : l)}</span>`).join('')
    + `<span class="m-rm-lg k"><i class="dot p"></i>${esc(t('통과', 'Pass'))}</span>`;
  const info = selInfo(sel);
  const count = GC.CORRIDOR_STATION_COUNT;
  return `
    <div class="m-shade is-dim"></div>
    <div class="m-rm${en ? ' is-en' : ''}">
      <div class="m-rm-map"><svg aria-hidden="true"></svg>${mapStations().map((s) => stationChip(s, sel)).join('')}</div>
      <aside class="m-rm-side">
        <div class="m-rm-hd"><button type="button" class="m-icon-btn" data-act="back" aria-label="${t('뒤로', 'Back')}">${BACK}</button><h2>${esc(title)}</h2></div>
        <p class="m-rm-desc">${esc(t(`정자 → 잠실 · ${count}개 역`, `Jeongja → Jamsil · ${count} stations`))}</p>
        <div class="m-rm-legend">${legend}</div>
        <div class="m-rm-lms">${landmarkStations().map((s) => landmarkChip(s, sel)).join('')}</div>
        ${others.length ? `<div class="m-rm-regions">${others.map((r) => `<button type="button" class="m-rm-region" data-region="${r.id}" ${r.locked ? 'disabled' : ''}><span>${esc(t('다른 지역', 'Other region'))}</span><b>${esc(r.title)}</b><small>${esc(r.locked ? t('곧 열려요', 'Opening soon') : r.sub)}</small></button>`).join('')}</div>` : ''}
        <span class="m-rm-grow"></span>
        <div class="m-rm-sel"><div class="m-rm-sel-t"><b>${esc(info.name)}</b>${info.sub ? `<small>${esc(info.sub)}</small>` : ''}</div>
          <button type="button" class="m-btn m-primary" data-act="go">${esc(info.go)}</button></div>
      </aside>
    </div>`;
}

const dotSvg = (st, [x, y], on, R) => {
  const r = on ? R + 3 : st.pass ? R - 1.5 : R;
  if (st.xf && !on) return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r + 1.5}" fill="#ffffff" stroke="${RM_COLOR.ink}" stroke-width="3"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${r - 2.5}" fill="${RM_COLOR.ink}"/>`;
  const fill = on ? RM_COLOR.gold : (st.pass ? '#9eb4c6' : '#ffffff');
  const stroke = on ? RM_COLOR.amber : (st.pass ? '#6b7a88' : RM_COLOR.ink);
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 4 : 3}"/>`;
};

/** routeMapHtml 을 넣은 뒤: 칩 실측 크기로 buildLandMap 배치 → 선·점·지시선 그리기, 칩 위치 지정 */
export function layoutRouteMap(root, sel) {
  const map = root.querySelector('.m-rm-map');
  if (!map) return null;
  const svg = map.querySelector('svg');
  const W = Math.max(320, map.clientWidth || 520), H = Math.max(220, map.clientHeight || 320);
  const chips = new Map([...map.querySelectorAll('[data-stn], [data-pass]')].map((e) => [e.dataset.stn || e.dataset.pass, e]));
  const size = new Map();
  for (const [id, e] of chips) {
    const w0 = e.offsetWidth, h0 = e.offsetHeight;
    let w1 = w0;
    if (e.dataset.stn) { const was = e.classList.contains('on'); e.classList.toggle('on', !was); w1 = e.offsetWidth; e.classList.toggle('on', was); }
    size.set(id, { w: Math.ceil(Math.max(w0, w1)) || 60, h: Math.ceil(h0) || 32 });
  }
  const m = buildLandMap(mapStations(), { W, H }, (id) => size.get(id));
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const lines = m.lines.map((l) => `<polyline points="${l.pts.map((p) => p.map(f1).join(',')).join(' ')}" stroke="${l.color}" stroke-width="${m.M.lw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const dots = m.stations.map((st) => `<g data-dot="${st.id}">${dotSvg(st, m.pos.get(st.id), !st.pass && st.id === sel, m.M.dotR)}</g>`).join('');
  const { xJ, xR, yMid } = m.rows;
  const hint = `<text x="${f1((xJ + xR) / 2 + 24)}" y="${f1(yMid + 5)}" text-anchor="middle" font-size="13" font-weight="700" fill="#9eb4c6" fill-opacity=".55">${esc(t('역을 눌러 고른 뒤 오른쪽 아래 입장', 'Tap a station, then Enter'))}</text>`;
  const leaders = m.labels.filter((l) => l.leader).map((l) => `<line x1="${f1(l.leader[0])}" y1="${f1(l.leader[1])}" x2="${f1(l.leader[2])}" y2="${f1(l.leader[3])}" stroke="#ffffff" stroke-opacity=".35" stroke-width="1.5"/>`).join('');
  svg.innerHTML = lines + leaders + dots + hint;
  for (const l of m.labels) {
    const e = chips.get(l.id);
    if (!e) continue;
    e.style.left = `${f1(l.sd === 'C' ? l.x + l.w / 2 : l.x)}px`;
    e.style.top = `${f1(l.y)}px`;
    e.dataset.side = l.sd;
  }
  map.__rm = m; // 검증 스크립트가 실측 DOM 과 대조
  return m;
}
