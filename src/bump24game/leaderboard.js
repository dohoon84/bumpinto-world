// [bump24game] 장보기 랭킹 — 데이터 공급자(provider) 하나 + 매장 안팎 전광판 캔버스 텍스처.
//   공급자 인터페이스(서버 4단계에서 setLeaderboardProvider 로 갈아끼움):
//     { kind, label, top({ storeId, period: 'today'|'week', limit }) → Promise<[{ name, score, at }]>,
//       submit({ storeId, name, score, at, dateKey, ranked, items }) → Promise, subscribe(fn(storeId)) → unsubscribe }
//   지금은 로컬 스텁(이 기기 localStorage) — 라벨 '연습용(이 기기)'.
//   전광판 텍스처는 '오늘 | 이번 주' 두 판을 한 캔버스에 나란히 그리고 texture.offset 으로 넘김 → 데이터가 바뀔 때만 다시 그림.
import * as THREE from 'three';
import { drawLogo } from '../corridor/bp24.js';
import { todayKey } from './products.js';

const KEY_BOARD = 'bw.bump24.localBoard';
const FONT = '"Pretendard Variable","Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
export const PERIODS = [['today', '오늘'], ['week', '이번 주']];
const won = (n) => Math.round(n).toLocaleString('ko-KR');

// ---------- 주(월요일 0시 시작, 기기 시간대) ----------
export function weekStart(d = new Date()) { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s.getTime(); }

// ---------- 로컬 공급자 ----------
function read() { try { return JSON.parse(localStorage.getItem(KEY_BOARD) || '{}') || {}; } catch { return {}; } }
function write(v) { try { localStorage.setItem(KEY_BOARD, JSON.stringify(v)); } catch { /* 저장 불가(사생활 모드 등) */ } }
export function createLocalLeaderboard() {
  const subs = new Set();
  const emit = (storeId) => { for (const f of subs) { try { f(storeId); } catch (e) { console.warn('[bump24 board]', e); } } };
  const rows = (storeId, period, limit) => {
    const all = read()[storeId] || [], tk = todayKey(), ws = weekStart();
    const pick = all.filter((r) => (period === 'week' ? (r.at || 0) >= ws : (r.dateKey ? r.dateKey === tk : (r.at || 0) >= new Date().setHours(0, 0, 0, 0))));
    const best = new Map(); // 같은 닉네임은 최고 기록 하나만
    for (const r of pick) { const k = String(r.name || '나'); const b = best.get(k); if (!b || r.score > b.score) best.set(k, r); }
    return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, limit).map((r) => ({ name: r.name || '나', score: r.score, at: r.at }));
  };
  // storage 이벤트: 같은 기기의 다른 탭에서 기록이 생겨도 갱신
  try { addEventListener('storage', (e) => { if (e.key === KEY_BOARD) emit(null); }); } catch { /* */ }
  return {
    kind: 'local', label: '연습용(이 기기)',
    top: async ({ storeId, period = 'today', limit = 5 }) => rows(storeId, period, limit),
    async submit({ storeId, name, score, at = Date.now(), dateKey = todayKey(), ranked = false, items = 0 }) {
      if (!storeId || !(score >= 0)) return;
      const all = read(), cut = Date.now() - 15 * 864e5;
      const arr = (all[storeId] || []).filter((r) => (r.at || 0) >= cut).concat([{ name: String(name || '나').slice(0, 16), score: Math.round(score), at, dateKey, ranked: !!ranked, items }]);
      all[storeId] = arr.sort((a, b) => b.score - a.score).slice(0, 120); write(all); emit(storeId);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

let provider = createLocalLeaderboard(), unsubProvider = null;
const listeners = new Set();
export const leaderboard = {
  get provider() { return provider; },
  get label() { return provider.label || ''; },
  top: (q) => provider.top(q),
  submit: (run) => provider.submit(run),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
function relay(storeId) { for (const f of listeners) f(storeId); refreshBoards(storeId); }
unsubProvider = provider.subscribe(relay);
/** 서버 랭킹(4단계): 같은 인터페이스의 공급자로 교체 */
export function setLeaderboardProvider(p) { unsubProvider?.(); provider = p; unsubProvider = p.subscribe?.(relay) || null; relay(null); }

// ---------- 전광판 텍스처 ----------
// layout 'tall'(바깥 세로 토템 512×768 판) · 'wide'(매장 안 가로 화면 1024×560 판). 캐시: storeId|layout
const LAYOUT = { tall: [512, 768], wide: [1024, 560] };
const boards = new Map();
let getMe = () => '';
export function setBoardSelf(fn) { getMe = fn || (() => ''); }

export function boardTexture(storeId, storeName = 'BUMP24', layout = 'tall') {
  const key = `${storeId}|${layout}`;
  let b = boards.get(key);
  if (b) { b.refs++; return b.tex; }
  const [pw, ph] = LAYOUT[layout];
  const cv = document.createElement('canvas'); cv.width = pw * 2; cv.height = ph;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.repeat.set(0.5, 1); tex.offset.set(0, 0);
  b = { key, storeId, storeName, layout, cv, tex, refs: 1, data: { today: [], week: [] }, seq: 0 };
  boards.set(key, b);
  draw(b); load(b);
  return tex;
}
export function releaseBoardTexture(tex) {
  for (const b of boards.values()) if (b.tex === tex) { if (--b.refs <= 0) { tex.dispose(); boards.delete(b.key); } return; }
}
async function load(b) {
  const seq = ++b.seq;
  try {
    const [today, week] = await Promise.all(PERIODS.map(([p]) => provider.top({ storeId: b.storeId, period: p, limit: 5 })));
    if (seq !== b.seq || !boards.has(b.key)) return;
    b.data = { today: today || [], week: week || [] }; draw(b);
  } catch (e) { console.warn('[bump24 board]', e); }
}
export function refreshBoards(storeId = null) { for (const b of boards.values()) if (!storeId || b.storeId === storeId) load(b); }
// 폰트가 늦게 오면 한 번만 다시 그림
try { document.fonts?.ready?.then(() => { for (const b of boards.values()) draw(b); }); } catch { /* */ }

// 두 판 사이를 7초마다 미끄러지듯 넘김(offset 만 움직임, 다시 그리지 않음)
export function tickBoards(t) {
  const cyc = 7, slide = 0.55, ph = t % (cyc * 2), sm = (v) => { const k = Math.max(0, Math.min(1, v)); return k * k * (3 - 2 * k); };
  const x = ph < cyc ? sm((ph - cyc + slide) / slide) * 0.5 : (1 - sm((ph - cyc * 2 + slide) / slide)) * 0.5;
  for (const b of boards.values()) b.tex.offset.x = x;
}
export const boardPeriodAt = (t) => ((t % 14) < 7 ? 'today' : 'week');

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fit(c, s, max) { let t = String(s); if (c.measureText(t).width <= max) return t; while (t.length > 1 && c.measureText(`${t}…`).width > max) t = t.slice(0, -1); return `${t}…`; }
const MEDAL = [['#fff3a6', '#ffcc00', '#b8860b'], ['#ffffff', '#cfd8e3', '#7d8a99'], ['#ffd7b0', '#e08a4a', '#8a4b1c']];
function medal(c, x, y, r, i) {
  if (i < 3) {
    const [a, m, d] = MEDAL[i]; const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, a); g.addColorStop(0.6, m); g.addColorStop(1, d);
    c.fillStyle = '#ff3b3b'; c.beginPath(); c.moveTo(x - r * 0.55, y + r * 0.3); c.lineTo(x - r * 0.85, y + r * 1.25); c.lineTo(x - r * 0.25, y + r * 0.95); c.lineTo(x, y + r * 0.5); c.fill(); // 리본
    c.fillStyle = '#0072DD'; c.beginPath(); c.moveTo(x + r * 0.55, y + r * 0.3); c.lineTo(x + r * 0.85, y + r * 1.25); c.lineTo(x + r * 0.25, y + r * 0.95); c.lineTo(x, y + r * 0.5); c.fill();
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = r * 0.12; c.beginPath(); c.arc(x, y, r * 0.78, 0, Math.PI * 2); c.stroke();
    c.fillStyle = d; c.font = `900 ${r * 1.05}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), x, y + r * 0.05);
  } else {
    c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.arc(x, y, r * 0.85, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9fb4d0'; c.font = `900 ${r * 0.95}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), x, y + r * 0.05);
  }
}
function crown(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const g = c.createLinearGradient(0, -40, 0, 40); g.addColorStop(0, '#fff3a6'); g.addColorStop(1, '#f0a500');
  c.fillStyle = g; c.beginPath(); c.moveTo(-60, 30); c.lineTo(-70, -30); c.lineTo(-32, 0); c.lineTo(0, -48); c.lineTo(32, 0); c.lineTo(70, -30); c.lineTo(60, 30); c.closePath(); c.fill();
  c.fillRect(-60, 36, 120, 16);
  c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(0, 12, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; for (const [px, py] of [[-70, -30], [0, -48], [70, -30]]) { c.beginPath(); c.arc(px, py, 8, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

function draw(b) {
  const c = b.cv.getContext('2d'), [pw, ph] = LAYOUT[b.layout];
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pw * 2, ph);
  PERIODS.forEach(([p], i) => { c.save(); c.translate(pw * i, 0); (b.layout === 'wide' ? panelWide : panelTall)(c, pw, ph, b, p); c.restore(); });
  b.tex.needsUpdate = true;
}
function bg(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b2254'); g.addColorStop(0.5, '#071636'); g.addColorStop(1, '#040c22');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(58,166,255,.10)'; c.lineWidth = 2; for (let y = 6; y < h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } // LED 줄무늬
  rr(c, 7, 7, w - 14, h - 14, 26); c.lineWidth = 8; c.strokeStyle = '#0072DD'; c.stroke();
  rr(c, 16, 16, w - 32, h - 32, 20); c.lineWidth = 2; c.strokeStyle = 'rgba(140,205,255,.55)'; c.stroke();
}
function tabs(c, x, y, w, h, period) {
  const tw = w / 2;
  rr(c, x, y, w, h, h / 2); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill();
  PERIODS.forEach(([p, label], i) => {
    const on = p === period;
    if (on) { rr(c, x + tw * i + 3, y + 3, tw - 6, h - 6, (h - 6) / 2); c.fillStyle = '#ffd400'; c.fill(); }
    c.fillStyle = on ? '#0a1a3a' : '#bcd3ee'; c.font = `900 ${h * 0.5}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, x + tw * i + tw / 2, y + h / 2 + 1);
  });
}
function rowsBlock(c, x, y, w, rowH, list, period) {
  const me = getMe?.() || '';
  if (!list.length) {
    crown(c, x + w / 2, y + rowH * 1.25, rowH / 70);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${rowH * 0.44}px ${FONT}`;
    c.fillText('첫 번째 장보기왕이', x + w / 2, y + rowH * 2.55);
    c.fillStyle = '#ffd400'; c.fillText('되어보세요!', x + w / 2, y + rowH * 3.15);
    c.fillStyle = '#8fb0d6'; c.font = `800 ${rowH * 0.25}px ${FONT}`;
    c.fillText(period === 'week' ? '이번 주 기록이 아직 없어요 · 30초 장보기' : '오늘 기록이 아직 없어요 · 30초 장보기', x + w / 2, y + rowH * 3.85);
    return;
  }
  list.slice(0, 5).forEach((r, i) => {
    const yy = y + i * rowH, mine = me && r.name === me;
    rr(c, x, yy + 4, w, rowH - 8, 16);
    c.fillStyle = mine ? 'rgba(0,114,221,.55)' : i === 0 ? 'rgba(255,212,0,.16)' : 'rgba(255,255,255,.07)'; c.fill();
    if (mine) { c.lineWidth = 3; c.strokeStyle = '#3aa6ff'; c.stroke(); }
    medal(c, x + rowH * 0.5, yy + rowH * 0.47, rowH * 0.3, i);
    const sx = x + w - 18;
    c.textBaseline = 'middle'; c.textAlign = 'right'; c.fillStyle = i === 0 ? '#ffd400' : '#ffffff'; c.font = `900 ${rowH * 0.36}px ${FONT}`;
    const sc = `${won(r.score)}원`; c.fillText(sc, sx, yy + rowH / 2 + 1);
    const sw = c.measureText(sc).width;
    c.textAlign = 'left'; c.fillStyle = '#eaf3ff'; c.font = `800 ${rowH * 0.33}px ${FONT}`;
    c.fillText(fit(c, r.name, w - rowH - sw - 40), x + rowH * 0.98, yy + rowH / 2 + 1);
  });
}
function footer(c, x, y, w, h, wide) {
  c.textBaseline = 'middle';
  const lab = provider.label || '';
  if (lab) { c.font = `800 ${h * 0.44}px ${FONT}`; const lw = c.measureText(lab).width + h * 0.8; rr(c, x, y, lw, h, h / 2); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill(); c.fillStyle = '#9fb4d0'; c.textAlign = 'left'; c.fillText(lab, x + h * 0.4, y + h / 2 + 1); }
  c.font = `900 ${h * 0.48}px ${FONT}`; c.fillStyle = '#ffd400'; c.textAlign = 'right'; c.fillText(wide ? '눌러서 전체 랭킹 ›' : '눌러서 전체 보기 ›', x + w, y + h / 2 + 1);
}
function panelTall(c, w, h, b, period) {
  bg(c, w, h);
  drawLogo(c, 30, 34, 92);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#ffd400'; c.font = `900 30px ${FONT}`; c.fillText('BUMP24', 128, 70);
  c.fillStyle = '#ffffff'; c.font = `900 50px ${FONT}`; c.fillText('장보기 랭킹', 126, 122);
  tabs(c, 36, 150, w - 72, 56, period);
  c.fillStyle = '#7f9cc4'; c.font = `800 20px ${FONT}`; c.textAlign = 'center'; c.fillText(fit(c, `${b.storeName || 'BUMP24'} · 30초 장보기 최고 금액`, w - 80), w / 2, 236);
  rowsBlock(c, 30, 254, w - 60, 86, b.data[period] || [], period);
  footer(c, 34, h - 72, w - 68, 40, false);
}
function panelWide(c, w, h, b, period) {
  bg(c, w, h);
  const lw = 330;
  drawLogo(c, 34, 40, 84);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#ffd400'; c.font = `900 40px ${FONT}`; c.fillText('BUMP24', 126, 100);
  c.fillStyle = '#ffffff'; c.font = `900 54px ${FONT}`; c.fillText(fit(c, '장보기 랭킹', lw - 50), 38, 182);
  tabs(c, 40, 216, lw - 60, 58, period);
  c.fillStyle = '#7f9cc4'; c.font = `800 21px ${FONT}`; c.fillText(fit(c, b.storeName || 'BUMP24', lw - 60), 42, 320);
  c.fillText('30초 동안 담은 최고 금액', 42, 350);
  rowsBlock(c, lw + 6, 40, w - lw - 46, 90, b.data[period] || [], period);
  footer(c, 40, h - 66, w - 86, 38, true);
}

// 반짝이(대각선 빛 줄기 + 바닥 후광): 셰이더 하나로 → 타일마다 1 draw. 정점색 r=화면 반짝이, g=바닥 후광
export function createBoardFxMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uNight: { value: 0 } },
    vertexShader: 'attribute vec3 color; varying vec2 vUv; varying vec3 vC; void main(){ vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT; uniform float uNight; varying vec2 vUv; varying vec3 vC;
      void main(){
        float p = fract(uT * 0.22) * 2.6 - 0.8; float d = vUv.x * 0.8 + vUv.y * 0.45 - p;
        float band = exp(-d * d * 260.0) * 0.55 + exp(-d * d * 30.0) * 0.12;
        float edge = 1.0 - smoothstep(0.0, 0.035, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        float shim = vC.r * (band + edge * (0.18 + 0.12 * sin(uT * 3.0)));
        vec2 q = vUv * 2.0 - 1.0; float halo = vC.g * pow(max(0.0, 1.0 - dot(q, q)), 1.6) * (0.08 + 0.5 * uNight);
        vec3 col = vec3(0.75, 0.9, 1.0) * shim + vec3(0.1, 0.45, 1.0) * halo;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}
