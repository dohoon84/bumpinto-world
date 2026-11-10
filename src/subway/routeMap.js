// [subway] 승강장 스크린도어 노선도 (순수 데이터 + 캔버스 그리기 + 상세 오버레이 DOM)
//   LINE_STOPS / STATIONS 만 쓴다 — 없는 역을 지어내지 않음. 로고·공식 심볼 없음 (노선 색·글자만).
//   ?routemap=0 이면 패널·오버레이 모두 없음 (기본 켜짐).
//   승강장 판 = 현재 역 ±PANEL_RADIUS 창 (큰 글씨). 전체 노선은 오버레이에서만.
import { LINE_STOPS } from './stationsData.js';
import { LINES } from './lines.js';
import { BY_NAME, isPassStop } from './ride.js';
import { FONT, fitText, lineBadge } from './geom.js';
import { isEn } from '../i18n.js';

export const PANEL_RADIUS = 7; // 현재 역 앞뒤로 보여줄 역 수 (패널 판)
export const PANEL_TEX = Object.freeze({ w: 1536, h: 512 }); // 승강장 거리에서도 글자가 읽히게

export const routeMapEnabled = (params) => (params?.get?.('routemap') ?? new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('routemap')) !== '0';

// 한 노선의 정차 목록 (게임 역 표시 + 현재 역 강조 인덱스). stops 는 LINE_STOPS 그대로.
export function routeMapData(def, line) {
  const L = LINES[line], stops = LINE_STOPS[line]?.stops;
  if (!L || !stops?.length) return null;
  const meIdx = stops.indexOf(def.name);
  if (meIdx < 0) return null;
  const list = stops.map((name, i) => {
    const s = BY_NAME.get(name);
    return { name, nameEn: s?.nameEn || null, game: !!s?.lines?.includes(line), pass: isPassStop(line, name), i, me: i === meIdx };
  });
  const transfer = (def.lines || []).filter((k) => k !== line && LINES[k]).map((k) => ({ key: k, short: LINES[k].short, ko: LINES[k].ko, en: LINES[k].en, color: LINES[k].color }));
  return {
    line, color: L.color, short: L.short, ko: L.ko, en: L.en,
    dirs: L.dirs, me: def.name, meEn: def.nameEn, meId: def.id, meIdx, stops: list, transfer,
    termini: { a: stops[0], b: stops[stops.length - 1] },
  };
}

// 패널용 창: 현재 역 ± radius (종착에 가까우면 그쪽이 짧아짐). 전체 노선은 잘라내지 않고 창만 고른다.
export function panelWindow(data, radius = PANEL_RADIUS) {
  if (!data?.stops?.length) return { from: 0, to: -1, stops: [], meLocal: -1, moreLeft: false, moreRight: false };
  const n = data.stops.length, me = data.meIdx;
  const from = Math.max(0, me - radius);
  const to = Math.min(n - 1, me + radius);
  return {
    from, to,
    stops: data.stops.slice(from, to + 1),
    meLocal: me - from,
    moreLeft: from > 0,
    moreRight: to < n - 1,
  };
}

function stopLabel(s, en) { return en && s.nameEn ? s.nameEn : s.name; }
// 게임에서 탈 수 있는 역·통과 역·아직 구간 밖인 역을 구분한다. 강남은 이미 개통한 게임 역이라 예정 배지를 붙이지 않는다.
export function openingSoonLabel(name, en = false) {
  return '';
}
function termLabel(name, en) {
  if (!name) return '';
  const s = BY_NAME.get(name);
  return en && s?.nameEn ? s.nameEn : name;
}

// 스크린도어 판: 현재 역 ±7 창 + 큰 글씨 + 종착 화살표. 전체 노선은 그리지 않음.
export function drawRouteMapPanel(c, w, h, data, en = false) {
  if (!data) return;
  const T = (ko, eng) => (en ? eng : ko);
  c.fillStyle = '#0f192a'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3);

  // 헤더
  const headH = Math.round(h * 0.18);
  c.textBaseline = 'middle';
  const bw = lineBadge(c, 16, Math.round(headH * 0.22), Math.round(headH * 0.56), data.color, data.short);
  c.fillStyle = '#ffe169'; fitText(c, T('노선도', 'Route map'), w * 0.35, Math.round(headH * 0.42), 800);
  c.textAlign = 'left'; c.fillText(T('노선도', 'Route map'), bw + 28, headH / 2);
  c.fillStyle = '#9eb4c6'; fitText(c, T('눌러서 자세히', 'Tap for detail'), w * 0.28, Math.round(headH * 0.32), 700);
  c.textAlign = 'right'; c.fillText(T('눌러서 자세히', 'Tap for detail'), w - 16, headH / 2);

  const win = panelWindow(data, PANEL_RADIUS);
  const st = win.stops, n = st.length;
  if (!n) return;

  const y = h * 0.58;
  const sidePad = Math.round(w * 0.07); // 종착 화살표 자리
  const x0 = sidePad, x1 = w - sidePad;
  const dx = n > 1 ? (x1 - x0) / (n - 1) : 0;

  // 노선 줄
  c.strokeStyle = data.color; c.lineWidth = Math.max(8, h * 0.028); c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();

  // 왼/오른쪽 종착 화살표 (창 밖이 더 있을 때)
  const arrowY = y;
  c.fillStyle = '#9eb4c6'; c.font = `800 ${Math.round(h * 0.055)}px ${FONT}`;
  c.textBaseline = 'middle';
  if (win.moreLeft) {
    c.textAlign = 'left';
    const a = termLabel(data.termini.a, en);
    fitText(c, `← ${a}`, sidePad - 8, Math.round(h * 0.05), 800);
    c.fillText(`← ${a}`, 10, arrowY);
  }
  if (win.moreRight) {
    c.textAlign = 'right';
    const b = termLabel(data.termini.b, en);
    fitText(c, `${b} →`, sidePad - 8, Math.round(h * 0.05), 800);
    c.fillText(`${b} →`, w - 10, arrowY);
  }

  // 역 점 + 이름 (현재 역을 가장 크게)
  st.forEach((s, i) => {
    const x = x0 + dx * i;
    const me = !!s.me;
    const r = me ? Math.max(14, h * 0.045) : Math.max(8, h * 0.028);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    const dim = !me && (s.pass || !s.game);
    c.fillStyle = me ? '#ffe169' : (dim ? '#b7c3ce' : '#fff'); c.fill();
    c.strokeStyle = me ? '#ffe169' : (s.pass ? '#8b9bab' : data.color); c.lineWidth = me ? 5 : 2.5; c.stroke();

    const label = stopLabel(s, en);
    const maxW = Math.max(40, dx - 6);
    const px = me ? Math.round(h * 0.085) : Math.round(h * 0.055);
    c.fillStyle = me ? '#ffe169' : (dim ? '#8b9bab' : '#e8f2f8');
    fitText(c, label, maxW, px, me ? 900 : 700);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // 이름은 위·아래 번갈아 (겹침 줄이기). 현재 역은 항상 위 + 조금 더 띄움. 통과 배지는 가로 칸에 넣지 않는다.
    const up = me || i % 2 === 0;
    c.fillText(label, x, up ? y - (me ? h * 0.16 : h * 0.12) : y + h * 0.12);
    const soon = openingSoonLabel(s.name, en);
    if (soon) {
      c.fillStyle = '#ffe169';
      fitText(c, soon, Math.max(maxW, 70), Math.round(h * 0.038), 800);
      c.textAlign = 'center';
      c.fillText(soon, x, up ? y - h * 0.24 : y + h * 0.2);
    }
  });

  c.fillStyle = '#9eb4c6'; c.font = `600 ${Math.round(h * 0.038)}px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(T('게임 데이터 · 공식 노선도 아님', 'In-game data · not an official map'), 14, h - 14);
}

const OVERLAY_CSS = `
#subway-routemap{position:fixed;inset:0;z-index:210;background:rgba(5,10,18,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
#subway-routemap[hidden]{display:none!important}
#subway-routemap .srm-box{width:min(560px,96vw);max-height:min(780px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;
  color:#e8f2f8;background:linear-gradient(180deg,rgba(29,46,75,.96),rgba(15,25,42,.96));
  border:1.5px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 16px 40px rgba(8,16,30,.5);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-family:inherit}
#subway-routemap .srm-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.12);flex:none}
#subway-routemap .srm-chip{color:#fff;font-weight:800;border-radius:8px;padding:5px 10px;font-size:14px;flex:none}
#subway-routemap .srm-tt{flex:1;min-width:0}
#subway-routemap .srm-tt b{display:block;font-size:15px;color:#ffe169}
#subway-routemap .srm-tt small{display:block;font-size:11.5px;color:#9eb4c6;margin-top:2px}
#subway-routemap .srm-x{border:0;background:rgba(255,225,105,.14);color:#ffe169;border:1px solid rgba(255,225,105,.45);border-radius:50%;width:32px;height:32px;font-size:15px;cursor:pointer;flex:none}
#subway-routemap .srm-x:hover{background:rgba(255,225,105,.28)}
#subway-routemap .srm-strip-wrap{flex:none;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;
  background:rgba(8,14,26,.45);border-bottom:1px solid rgba(255,255,255,.1);scrollbar-width:thin}
/* 이름 위 · 점 아래 · 줄은 점 높이(bottom) — 이름과 겹치지 않음 */
#subway-routemap .srm-strip{display:flex;align-items:flex-end;gap:0;padding:12px 20px 20px;min-height:100px;width:max-content;position:relative}
#subway-routemap .srm-strip::before{content:'';position:absolute;left:20px;right:20px;bottom:24px;height:5px;background:var(--c);border-radius:3px;pointer-events:none;z-index:0}
#subway-routemap .srm-stop{position:relative;z-index:1;flex:0 0 auto;width:76px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:10px;text-align:center}
#subway-routemap .srm-stop .nm{font-size:12px;font-weight:700;line-height:1.25;color:#e8f2f8;max-width:72px;min-height:2.5em;display:flex;align-items:flex-end;justify-content:center;text-align:center;word-break:keep-all}
#subway-routemap .srm-stop .dot{flex:none;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--c);box-sizing:border-box;margin-bottom:0}
#subway-routemap .srm-stop.out{opacity:.45}
#subway-routemap .srm-stop.out .nm{color:#9eb4c6}
#subway-routemap .srm-stop.pass .nm{color:#8b9bab;font-weight:600}
#subway-routemap .srm-stop.pass .dot{background:#c5d0da;border-color:#8b9bab}
#subway-routemap .srm-stop.me .dot{width:16px;height:16px;background:#ffe169;border-color:#ffe169;box-shadow:0 0 0 3px rgba(255,225,105,.28);margin-bottom:-2px}
#subway-routemap .srm-stop.me .nm{font-size:13.5px;font-weight:900;color:#ffe169}
#subway-routemap .srm-xfer{padding:8px 14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:none;border-bottom:1px solid rgba(255,255,255,.08)}
#subway-routemap .srm-xfer span{font-size:11px;color:#9eb4c6;margin-right:2px}
#subway-routemap .srm-xfer i{font-style:normal;font-size:11px;font-weight:800;color:#fff;border-radius:7px;padding:3px 8px}
#subway-routemap .srm-scroll{overflow:auto;flex:1;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;min-height:0}
#subway-routemap .srm-list{list-style:none;margin:0;padding:8px 14px 12px 18px}
#subway-routemap .srm-list li{position:relative;display:flex;align-items:center;gap:10px;padding:7px 0 7px 4px;font-size:13.5px}
#subway-routemap .srm-list li::before{content:'';position:absolute;left:10px;top:0;bottom:0;width:4px;background:var(--c)}
#subway-routemap .srm-list li.first::before{top:50%}
#subway-routemap .srm-list li.last::before{bottom:50%}
#subway-routemap .srm-list .dot{position:relative;z-index:1;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--c);flex:none}
#subway-routemap .srm-list li.me{font-weight:900;color:#ffe169}
#subway-routemap .srm-list li.me .dot{background:#ffe169;border-color:#ffe169;width:14px;height:14px;margin-left:-1px}
#subway-routemap .srm-list li.out{opacity:.42}
#subway-routemap .srm-list li.pass{opacity:1}
#subway-routemap .srm-list em{font-style:normal;font-size:10.5px;font-weight:800;border-radius:6px;padding:1px 6px;background:#ffe169;color:#122033;margin-left:4px}
#subway-routemap .srm-list .en{display:block;font-size:11px;font-weight:600;color:#9eb4c6}
#subway-routemap .srm-ft{padding:8px 14px;font-size:11px;color:#9eb4c6;border-top:1px solid rgba(255,255,255,.12);flex:none}
body.mobile #subway-routemap .srm-box{width:min(100vw - 16px,560px);max-height:calc(100vh - 24px)}
`;

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/** 위 가로 줄. 통과 역은 흐린 점·이름만 (배지 없음 — 칸이 좁아 이름이 잘림). */
export function routeStripMarkup(stops, { en = false } = {}) {
  return (stops || []).map((s) => {
    const cls = ['srm-stop', s.me ? 'me' : '', s.pass ? 'pass' : (s.game ? '' : 'out')].filter(Boolean).join(' ');
    return `<div class="${cls}" data-i="${s.i}"><span class="nm">${esc(stopLabel(s, en))}</span><span class="dot"></span></div>`;
  }).join('');
}

/** 아래 세로 목록의 배지. 통과 역만 ‘통과’. */
export function routeListBadge(s, en = false) {
  if (s?.me) return en ? 'You are here' : '여기';
  return s?.pass ? '통과' : '';
}

// 스크롤 컨테이너에서 대상이 가운데 오도록 (offsetParent 말고 getBoundingClientRect — 중첩 offset 오차 방지)
function centerIn(scroller, el, axis = 'y') {
  if (!scroller || !el) return;
  const sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
  if (axis === 'x') {
    scroller.scrollLeft = Math.max(0, er.left - sr.left + scroller.scrollLeft - scroller.clientWidth / 2 + er.width / 2);
  } else {
    scroller.scrollTop = Math.max(0, er.top - sr.top + scroller.scrollTop - scroller.clientHeight / 2 + er.height / 2);
  }
}

// 상세 오버레이 1개 (모든 승강장이 공유). open(data) / close() / isOpen
export function mountRouteMapOverlay() {
  if (typeof document === 'undefined') return { open() {}, close() {}, get isOpen() { return false; }, dispose() {} };
  const style = document.createElement('style'); style.textContent = OVERLAY_CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'subway-routemap'; root.hidden = true;
  document.body.appendChild(root);
  let openData = null;

  function render(data) {
    const en = isEn();
    const title = en ? 'Route map' : '노선도';
    const sub = en ? `${data.en} · ${data.meEn || data.me}` : `${data.ko} · ${data.me}역`;
    const xfer = data.transfer.length
      ? `<div class="srm-xfer"><span>${en ? 'Transfer' : '갈아타는 곳'}</span>${data.transfer.map((t) => `<i style="background:${t.color}">${esc(en ? t.short : t.short)}</i>`).join('')}</div>`
      : '';
    const strip = routeStripMarkup(data.stops, { en });
    const items = data.stops.map((s, i) => {
      const cls = [i === 0 ? 'first' : '', i === data.stops.length - 1 ? 'last' : '', s.me ? 'me' : '', s.pass ? 'pass' : (s.game ? '' : 'out')].filter(Boolean).join(' ');
      const badge = routeListBadge(s, en);
      const soon = openingSoonLabel(s.name, en);
      const tag = badge ? `<em>${esc(badge)}</em>` : (soon ? `<em>${esc(soon)}</em>` : '');
      const enLine = s.nameEn ? `<span class="en">${esc(s.nameEn)}</span>` : '';
      return `<li class="${cls}" style="--c:${data.color}" data-i="${s.i}"><span class="dot"></span><span><b>${esc(s.name)}</b>${tag}${enLine}</span></li>`;
    }).join('');
    root.innerHTML = `<div class="srm-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="srm-hd"><span class="srm-chip" style="background:${data.color}">${esc(data.short)}</span>
        <div class="srm-tt"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
        <button type="button" class="srm-x" data-srm="close" aria-label="${en ? 'Close' : '닫기'}">✕</button></div>
      <div class="srm-strip-wrap"><div class="srm-strip" style="--c:${data.color}">${strip}</div></div>
      ${xfer}
      <div class="srm-scroll"><ul class="srm-list">${items}</ul></div>
      <div class="srm-ft">${en ? 'Built from in-game stop data · not an official map' : '게임 정차 데이터 기준 · 공식 노선도 아님'}</div>
    </div>`;
    // 레이아웃 후 현재 역을 가로 띠·세로 목록 모두 가운데로
    const focus = () => {
      centerIn(root.querySelector('.srm-strip-wrap'), root.querySelector('.srm-stop.me'), 'x');
      centerIn(root.querySelector('.srm-scroll'), root.querySelector('li.me'), 'y');
    };
    requestAnimationFrame(() => { focus(); requestAnimationFrame(focus); });
  }

  function open(data) {
    if (!data) return false;
    openData = data; render(data); root.hidden = false; return true;
  }
  function close() { root.hidden = true; openData = null; }
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-srm=close]')) close();
  });
  const onKey = (e) => { if (e.code === 'Escape' && !root.hidden) { close(); e.stopPropagation(); e.preventDefault?.(); } };
  addEventListener('keydown', onKey, true);

  return {
    open, close,
    get isOpen() { return !root.hidden; },
    get data() { return openData; },
    dispose() { removeEventListener('keydown', onKey, true); style.remove(); root.remove(); },
  };
}

// 패널 둘 곳: 스크린도어 고정 유리 중 폭이 넉넉한 칸 (계단 앞은 제외)
export function routeMapSlots(spans, { minW = 1.45, avoidHalf = 3.2, max = 4 } = {}) {
  return spans
    .map(([a, b]) => ({ a, b, w: b - a, x: (a + b) / 2 }))
    .filter((s) => s.w >= minW && Math.abs(s.x) > avoidHalf)
    .sort((a, b) => b.w - a.w || Math.abs(a.x) - Math.abs(b.x))
    .slice(0, max)
    .sort((a, b) => a.x - b.x);
}

// 플레이어가 노선도 판 앞에 있는지 (승강장 좌표)
export function nearRouteMap(px, pz, slots, { reach = 2.4, z0 = -2.6, z1 = -0.15 } = {}) {
  if (!slots?.length) return null;
  if (pz < z0 || pz > z1) return null;
  let best = null, bestD = reach;
  for (const s of slots) {
    const d = Math.hypot(px - s.x, pz - (-0.55));
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
