// [subway] 승강장 스크린도어 노선도 (순수 데이터 + 캔버스 그리기 + 상세 오버레이 DOM)
//   LINE_STOPS / STATIONS 만 쓴다 — 없는 역을 지어내지 않음. 로고·공식 심볼 없음 (노선 색·글자만).
//   ?routemap=0 이면 패널·오버레이 모두 없음 (기본 켜짐).
import { LINE_STOPS } from './stationsData.js';
import { LINES } from './lines.js';
import { BY_NAME } from './ride.js';
import { FONT, fitText, lineBadge } from './geom.js';
import { isEn } from '../i18n.js';

export const routeMapEnabled = (params) => (params?.get?.('routemap') ?? new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('routemap')) !== '0';

// 한 노선의 정차 목록 (게임 역 표시 + 현재 역 강조 인덱스). stops 는 LINE_STOPS 그대로.
export function routeMapData(def, line) {
  const L = LINES[line], stops = LINE_STOPS[line]?.stops;
  if (!L || !stops?.length) return null;
  const meIdx = stops.indexOf(def.name);
  if (meIdx < 0) return null;
  const list = stops.map((name, i) => {
    const s = BY_NAME.get(name);
    return { name, nameEn: s?.nameEn || null, game: !!s?.lines?.includes(line), i, me: i === meIdx };
  });
  const transfer = (def.lines || []).filter((k) => k !== line && LINES[k]).map((k) => ({ key: k, short: LINES[k].short, ko: LINES[k].ko, en: LINES[k].en, color: LINES[k].color }));
  return {
    line, color: L.color, short: L.short, ko: L.ko, en: L.en,
    dirs: L.dirs, me: def.name, meEn: def.nameEn, meId: def.id, meIdx, stops: list, transfer,
    termini: { a: stops[0], b: stops[stops.length - 1] },
  };
}

// 스크린도어에 붙는 작은 판 (한 줄 노선 + 현재 역 강조). 공식 노선도 아님 문구.
export function drawRouteMapPanel(c, w, h, data, en = false) {
  if (!data) return;
  const T = (ko, eng) => (en ? eng : ko);
  c.fillStyle = '#0f192a'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(0, 0, w, 2); c.fillRect(0, h - 2, w, 2);
  c.textBaseline = 'middle';
  const bw = lineBadge(c, 10, 8, 22, data.color, data.short);
  c.fillStyle = '#ffe169'; c.font = `800 15px ${FONT}`; c.textAlign = 'left';
  fitText(c, T('노선도', 'Route map'), w - bw - 90, 15, 800); c.fillText(T('노선도', 'Route map'), bw + 18, 19);
  c.fillStyle = '#9eb4c6'; c.font = `600 11px ${FONT}`; c.textAlign = 'right';
  c.fillText(T('눌러서 자세히', 'Tap for detail'), w - 10, 19);

  const st = data.stops, n = st.length;
  const y = h * 0.58, x0 = 18, x1 = w - 18, dx = n > 1 ? (x1 - x0) / (n - 1) : 0;
  c.strokeStyle = data.color; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();

  // 라벨은 종착·현재·앞뒤 1~2개만 (가독성)
  const labelAt = new Set([0, n - 1, data.meIdx, data.meIdx - 1, data.meIdx + 1].filter((i) => i >= 0 && i < n));
  st.forEach((s, i) => {
    const x = x0 + dx * i;
    const r = s.me ? 7 : (s.game ? 4.5 : 3.2);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = s.me ? '#ffe169' : '#fff'; c.fill();
    c.strokeStyle = s.me ? '#ffe169' : data.color; c.lineWidth = s.me ? 3 : 1.5; c.stroke();
    if (!labelAt.has(i)) return;
    const label = en && s.nameEn ? s.nameEn : s.name;
    c.fillStyle = s.me ? '#ffe169' : '#e8f2f8';
    fitText(c, label, Math.max(28, dx - 2), s.me ? 13 : 10, s.me ? 900 : 600);
    c.textAlign = 'center';
    c.fillText(label, x, y - (s.me ? 18 : 14));
  });
  c.fillStyle = '#9eb4c6'; c.font = `600 10px ${FONT}`; c.textAlign = 'left';
  c.fillText(T('게임 데이터 · 공식 노선도 아님', 'In-game data · not an official map'), 10, h - 12);
}

// 상세 보기용 큰 가로 노선 (스크롤 영역 위 캔버스)
export function drawRouteMapDetail(c, w, h, data, en = false) {
  if (!data) return;
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(15,25,42,.55)'; c.fillRect(0, 0, w, h);
  const st = data.stops, n = st.length;
  const y = h * 0.55, pad = 28, x0 = pad, x1 = w - pad, dx = n > 1 ? (x1 - x0) / (n - 1) : 0;
  c.strokeStyle = data.color; c.lineWidth = 8; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
  st.forEach((s, i) => {
    const x = x0 + dx * i;
    const r = s.me ? 9 : (s.game ? 5.5 : 4);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = s.me ? '#ffe169' : '#fff'; c.fill();
    c.strokeStyle = s.me ? '#ffe169' : data.color; c.lineWidth = s.me ? 3.5 : 1.8; c.stroke();
    const up = i % 2 === 0;
    const label = en && s.nameEn ? s.nameEn : s.name;
    c.fillStyle = s.me ? '#ffe169' : (s.game ? '#e8f2f8' : '#9eb4c6');
    fitText(c, label, Math.max(36, dx - 4), s.me ? 13 : 11, s.me ? 900 : 600);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, x, up ? y - 22 : y + 22);
  });
  c.fillStyle = '#9eb4c6'; c.font = `600 11px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const a = en ? (BY_NAME.get(data.termini.a)?.nameEn || data.termini.a) : data.termini.a;
  const b = en ? (BY_NAME.get(data.termini.b)?.nameEn || data.termini.b) : data.termini.b;
  c.fillText(`${a}  ↔  ${b}`, pad, h - 8);
}

const OVERLAY_CSS = `
#subway-routemap{position:fixed;inset:0;z-index:210;background:rgba(5,10,18,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
#subway-routemap[hidden]{display:none!important}
#subway-routemap .srm-box{width:min(560px,96vw);max-height:min(780px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;
  color:#e8f2f8;background:linear-gradient(180deg,rgba(29,46,75,.96),rgba(15,25,42,.96));
  border:1.5px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 16px 40px rgba(8,16,30,.5);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-family:inherit}
#subway-routemap .srm-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.12)}
#subway-routemap .srm-chip{color:#fff;font-weight:800;border-radius:8px;padding:5px 10px;font-size:14px;flex:none}
#subway-routemap .srm-tt{flex:1;min-width:0}
#subway-routemap .srm-tt b{display:block;font-size:15px;color:#ffe169}
#subway-routemap .srm-tt small{display:block;font-size:11.5px;color:#9eb4c6;margin-top:2px}
#subway-routemap .srm-x{border:0;background:rgba(255,225,105,.14);color:#ffe169;border:1px solid rgba(255,225,105,.45);border-radius:50%;width:32px;height:32px;font-size:15px;cursor:pointer;flex:none}
#subway-routemap .srm-x:hover{background:rgba(255,225,105,.28)}
#subway-routemap .srm-scroll{overflow:auto;flex:1;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
#subway-routemap .srm-cv{display:block;width:100%;height:140px;background:rgba(8,14,26,.45)}
#subway-routemap .srm-list{list-style:none;margin:0;padding:8px 14px 12px 18px}
#subway-routemap .srm-list li{position:relative;display:flex;align-items:center;gap:10px;padding:7px 0 7px 4px;font-size:13.5px}
#subway-routemap .srm-list li::before{content:'';position:absolute;left:10px;top:0;bottom:0;width:4px;background:var(--c)}
#subway-routemap .srm-list li.first::before{top:50%}
#subway-routemap .srm-list li.last::before{bottom:50%}
#subway-routemap .srm-list .dot{position:relative;z-index:1;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--c);flex:none}
#subway-routemap .srm-list li.me{font-weight:900;color:#ffe169}
#subway-routemap .srm-list li.me .dot{background:#ffe169;border-color:#ffe169;width:14px;height:14px;margin-left:-1px}
#subway-routemap .srm-list li.out{opacity:.42}
#subway-routemap .srm-list em{font-style:normal;font-size:10.5px;font-weight:800;border-radius:6px;padding:1px 6px;background:#ffe169;color:#122033;margin-left:4px}
#subway-routemap .srm-list .en{display:block;font-size:11px;font-weight:600;color:#9eb4c6}
#subway-routemap .srm-xfer{padding:0 14px 8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#subway-routemap .srm-xfer span{font-size:11px;color:#9eb4c6;margin-right:2px}
#subway-routemap .srm-xfer i{font-style:normal;font-size:11px;font-weight:800;color:#fff;border-radius:7px;padding:3px 8px}
#subway-routemap .srm-ft{padding:8px 14px;font-size:11px;color:#9eb4c6;border-top:1px solid rgba(255,255,255,.12)}
body.mobile #subway-routemap .srm-box{width:min(100vw - 16px,560px);max-height:calc(100vh - 24px)}
`;

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

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
      ? `<div class="srm-xfer"><span>${en ? 'Transfer' : '갈아타는 곳'}</span>${data.transfer.map((t) => `<i style="background:${t.color}">${esc(en ? t.en : t.short)}</i>`).join('')}</div>`
      : '';
    const items = data.stops.map((s, i) => {
      const cls = [i === 0 ? 'first' : '', i === data.stops.length - 1 ? 'last' : '', s.me ? 'me' : '', s.game ? '' : 'out'].filter(Boolean).join(' ');
      const tag = s.me ? `<em>${en ? 'You are here' : '여기'}</em>` : '';
      const enLine = s.nameEn ? `<span class="en">${esc(s.nameEn)}</span>` : '';
      return `<li class="${cls}" style="--c:${data.color}"><span class="dot"></span><span><b>${esc(s.name)}</b>${tag}${enLine}</span></li>`;
    }).join('');
    root.innerHTML = `<div class="srm-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="srm-hd"><span class="srm-chip" style="background:${data.color}">${esc(data.short)}</span>
        <div class="srm-tt"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
        <button type="button" class="srm-x" data-srm="close" aria-label="${en ? 'Close' : '닫기'}">✕</button></div>
      <div class="srm-scroll"><canvas class="srm-cv" width="1120" height="280"></canvas>${xfer}<ul class="srm-list">${items}</ul></div>
      <div class="srm-ft">${en ? 'Built from in-game stop data · not an official map' : '게임 정차 데이터 기준 · 공식 노선도 아님'}</div>
    </div>`;
    const cv = root.querySelector('.srm-cv');
    if (cv) drawRouteMapDetail(cv.getContext('2d'), cv.width, cv.height, data, en);
    const meLi = root.querySelector('li.me');
    if (meLi) meLi.scrollIntoView({ block: 'center' });
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
