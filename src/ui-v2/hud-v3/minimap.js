// [hud-v3-minimap] WoW 식 원형 미니맵 — PC HUD v3 에서 index.js 가 붙인다. 끄면(N · 지도·이동 → 미니맵) rAF·캐시 전부 해제 = 비용 0.
//   3D 카메라·렌더 타깃을 하나도 더 만들지 않는다: 2D 캔버스 하나 + 500m 청크(코리더 타일과 같은 격자)별 오프스크린 캔버스.
//   청크는 도로·공원·물·건물 외곽을 한 번만 그려 두고, 프레임마다(≈18fps, 바뀐 게 없으면 건너뜀) 이동·회전해 붙이고 점(역·정류장·접속자·경로)만 그린다.
//   데이터: 라이브 동네(window.__jj.data = jeongja.json / starbase.json) + 코리더 상세 타일(corridor.miniTiles(), 타일 언로드 시 같이 사라짐) + 남산(namsan.mini: 광장·도로·케이블카).
//   좌표: x 동쪽, z 남쪽(북쪽 = -z) → 화면 기본은 북쪽이 위. 회전 모드는 카메라가 보는 방향이 위.
//   길 안내: 게임에 아직 경로 기능이 없어 이벤트로 받는다 — dispatchEvent(new CustomEvent('bw:nav-route', { detail: { points: [[x, z], …], dest: { x, z, label } } })) · detail null 이면 지움.
import { tr, onLangChange } from '../../i18n.js';
import { icon } from './icons.js';

const LS_KEY = 'bw.hud.v3.minimap';
const ZOOMS = [70, 120, 200, 320]; // 반지름(m). 작을수록 확대
const CHUNK = 500;
const FRAME_MS = 55; // ≈18fps
const D = 176; // 지도 원 지름(CSS px)
const R = D / 2;
const MAJOR = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'busway']);
const MINOR = new Set(['tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'road', 'rest_area']);
const LINE_COLOR = { 신분당선: '#d4003b', 수인분당선: '#f5a200', 경강선: '#0054a6', '2호선': '#00a84d', '3호선': '#ef7c1c', '8호선': '#e6186c', '9호선': '#bdb092' };

const $ = (id) => document.getElementById(id);
const jj = () => window.__jj || null;

function loadPrefs() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (j && typeof j === 'object') return { on: j.on !== false, rot: !!j.rot, zi: Math.max(0, Math.min(ZOOMS.length - 1, j.zi | 0 || 1)) }; } catch { /* 막힘 */ }
  return { on: true, rot: false, zi: 1 };
}
const prefs = loadPrefs();
const savePrefs = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch { /* noop */ } };

let root = null, cv = null, ctx = null, compass = null, plaque = null, raf = 0, last = 0, sig = '';
let route = null; // { pts: [[x,z]], dest: {x,z,label} }
let hover = null; // { x, y } CSS px (원 안 좌표)
let navHits = []; // [bp24nav] 이번 프레임 매장 아이콘 (클릭 판정)
const chunks = new Map(); // key → { c, s, ver, used }
let liveIdx = null; // { data, map: Map(chunkKey → feats) }
let namsanIdx = null; // { mini, map }
const bboxOf = new WeakMap();
const stats = { frames: 0, ms: 0, msMax: 0, chunkMs: 0, chunkRenders: 0, bytes: 0 };
let onChange = () => {};

export const minimapOn = () => prefs.on;
export function mountMinimap({ onToggle } = {}) {
  if (root) return;
  onChange = onToggle || onChange;
  addEventListener('bw:nav-route', (e) => setRoute(e.detail));
  onLangChange(() => { if (root) paintChrome(); });
  window.__h3mm = { setRoute, stats: () => ({ ...stats, chunks: chunks.size, canvases: [...chunks.values()].map((c) => `${c.c.width}x${c.c.height}`), prefs: { ...prefs }, open: !!root?.isConnected && prefs.on }), toggle, setZoom: (i) => setZoom(i), setRot: (v) => setRot(v), get navHits() { return navHits; } };
  if (prefs.on) open();
}
export function toggle(force) {
  const on = typeof force === 'boolean' ? force : !prefs.on;
  prefs.on = on; savePrefs();
  if (on) open(); else close();
  onChange(on);
}

function syncCornerPhone(on) {
  // [hud-v3] 원형 미니맵이 켜져 있으면 우측 하단 #phone(사각 코너맵) 숨김 + phone.tick 스킵(CPU). 끄면 다시 표시.
  document.body.classList.toggle('h3-mm-on', !!on);
  dispatchEvent(new Event('bw:hud-layout'));
}
function open() {
  if (!root) build();
  root.hidden = false;
  syncCornerPhone(true);
  if (!raf) { last = 0; sig = ''; raf = requestAnimationFrame(loop); }
}
function close() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (root) root.hidden = true;
  syncCornerPhone(false);
  // 닫으면 캐시 전부 버림(메모리 0). 다시 열면 보이는 청크만 다시 그린다(청크당 수 ms)
  for (const c of chunks.values()) { c.c.width = 0; c.c.height = 0; }
  chunks.clear(); liveIdx = null; namsanIdx = null; stats.bytes = 0;
}

function build() {
  root = document.createElement('div');
  root.id = 'h3-mm';
  root.innerHTML = `<div class="h3-mm-ring"><canvas class="h3-mm-cv" width="${D}" height="${D}"></canvas><div class="h3-mm-glass"></div>
    <div class="h3-mm-compass"><b class="n">N</b><i class="e">E</i><i class="s">S</i><i class="w">W</i></div></div>
    <button type="button" class="h3-mm-b h3-mm-rot" data-mm="rot"></button>
    <button type="button" class="h3-mm-b h3-mm-close" data-mm="close"></button>
    <button type="button" class="h3-mm-b h3-mm-zin" data-mm="in"></button>
    <button type="button" class="h3-mm-b h3-mm-zout" data-mm="out"></button>
    <div class="h3-mm-plaque"></div>`;
  document.body.appendChild(root);
  cv = root.querySelector('canvas');
  ctx = cv.getContext('2d');
  compass = root.querySelector('.h3-mm-compass');
  plaque = root.querySelector('.h3-mm-plaque');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mm]');
    if (b) {
      const k = b.dataset.mm;
      if (k === 'rot') setRot(!prefs.rot);
      else if (k === 'close') toggle(false);
      else if (k === 'in') setZoom(prefs.zi - 1);
      else if (k === 'out') setZoom(prefs.zi + 1);
      b.blur(); return;
    }
    if (e.target === cv || e.target.closest('.h3-mm-glass')) {
      const rect = cv.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (cv.width / Math.max(1, rect.width));
      const sy = (e.clientY - rect.top) * (cv.height / Math.max(1, rect.height));
      const hit = navHits.find((h) => (h.sx - sx) ** 2 + (h.sy - sy) ** 2 < h.r * h.r);
      if (hit && window.__jj?.bp24Nav?.guide?.(hit.id)) return; // [bp24nav] 매장 아이콘 → 문 앞 안내. 다른 클릭은 예전대로 위에서 보기
      const v = $('btn-view'); if (v && !v.hidden) v.click();
    }
  });
  const glass = root.querySelector('.h3-mm-glass');
  glass.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); hover = { x: e.clientX - r.left, y: e.clientY - r.top }; sig = ''; });
  glass.addEventListener('mouseleave', () => { hover = null; sig = ''; });
  glass.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(prefs.zi + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  paintChrome();
}
function paintChrome() {
  const t = (k, ko, en, key = '') => { const b = root.querySelector(`[data-mm="${k}"]`); const l = tr(ko, en) + (key ? ` (${key})` : ''); b.title = l; b.setAttribute('aria-label', l); };
  root.setAttribute('aria-label', tr('미니맵', 'Minimap'));
  root.querySelector('.h3-mm-glass').title = tr('미니맵 · 누르면 위에서 보기 (휠: 확대/축소)', 'Minimap · click for overview (wheel: zoom)');
  t('rot', prefs.rot ? '북쪽 고정으로' : '미니맵 회전', prefs.rot ? 'North up' : 'Rotate minimap');
  t('close', '미니맵 닫기', 'Hide minimap', 'N');
  t('in', '확대', 'Zoom in');
  t('out', '축소', 'Zoom out');
  root.querySelector('[data-mm="rot"]').innerHTML = icon(prefs.rot ? 'compass' : 'rotate', 14);
  root.querySelector('[data-mm="close"]').innerHTML = icon('close', 12);
  root.querySelector('[data-mm="in"]').innerHTML = icon('plus', 14);
  root.querySelector('[data-mm="out"]').innerHTML = icon('minus', 14);
  root.classList.toggle('rot', prefs.rot);
  root.querySelector('[data-mm="rot"]').classList.toggle('on', prefs.rot);
  root.querySelector('[data-mm="in"]').disabled = prefs.zi <= 0;
  root.querySelector('[data-mm="out"]').disabled = prefs.zi >= ZOOMS.length - 1;
  plaqueText = '';
  sig = '';
}
function setZoom(i) { const z = Math.max(0, Math.min(ZOOMS.length - 1, i)); if (z === prefs.zi) return; prefs.zi = z; savePrefs(); if (root) paintChrome(); }
function setRot(v) { prefs.rot = !!v; savePrefs(); if (root) { paintChrome(); if (!prefs.rot) setCompass(0, true); } }

export function setRoute(d) {
  const pts = d?.points?.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  route = pts?.length >= 2 || d?.dest ? { pts: pts || [], dest: d?.dest || (pts?.length ? { x: pts.at(-1)[0], z: pts.at(-1)[1] } : null) } : null;
  sig = '';
}

// ---------------- 데이터 ----------------
const ck = (i, j) => `${i},${j}`;
function bb(f) {
  let b = bboxOf.get(f); if (b) return b;
  const pts = f.p || f.o; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  if (pts) for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const w = (f.w || 0) / 2; b = [x0 - w, z0 - w, x1 + w, z1 + w]; bboxOf.set(f, b); return b;
}
const KINDS = ['roads', 'parks', 'water', 'waterLines', 'buildings'];
const MINI_KINDS = [...KINDS, 'plazas'];
const emptyFeats = () => ({ roads: [], parks: [], water: [], waterLines: [], buildings: [], plazas: [] });
/** 라이브 동네 데이터 → 청크별 목록(참조만). 데이터가 바뀌면(지역 이동) 다시 */
function live() {
  const data = jj()?.data; if (!data) return null;
  if (liveIdx?.data === data) return liveIdx.map;
  const map = new Map();
  for (const k of KINDS) for (const f of data[k] || []) {
    const [x0, z0, x1, z1] = bb(f); if (!Number.isFinite(x0)) continue;
    for (let i = Math.floor(x0 / CHUNK); i <= Math.floor(x1 / CHUNK); i++) for (let j = Math.floor(z0 / CHUNK); j <= Math.floor(z1 / CHUNK); j++) {
      const key = ck(i, j); let m = map.get(key); if (!m) map.set(key, (m = emptyFeats())); m[k].push(f);
    }
  }
  liveIdx = { data, map };
  return map;
}
function corridorTiles() {
  const c = jj()?.corridor; if (!c?.miniTiles) return null;
  const m = new Map(); for (const t of c.miniTiles()) m.set(ck(Math.round(t.x0 / CHUNK), Math.round(t.z0 / CHUNK)), t);
  return m;
}
function namsanFeats() {
  const mini = jj()?.namsan?.mini; if (!mini) return null;
  if (namsanIdx?.mini === mini) return namsanIdx.map;
  const map = new Map();
  for (const k of MINI_KINDS) for (const f of mini[k] || []) {
    const [x0, z0, x1, z1] = bb(f); if (!Number.isFinite(x0)) continue;
    for (let i = Math.floor(x0 / CHUNK); i <= Math.floor(x1 / CHUNK); i++) for (let j = Math.floor(z0 / CHUNK); j <= Math.floor(z1 / CHUNK); j++) {
      const key = ck(i, j); let m = map.get(key); if (!m) map.set(key, (m = emptyFeats())); m[k].push(f);
    }
  }
  namsanIdx = { mini, map };
  return map;
}
/** 청크 한 칸에 들어갈 것: 라이브 + 그 칸과 이웃 8칸 코리더 타일(타일 경계를 넘는 길도 끊기지 않게) */
function featsFor(i, j, L, T, N) {
  const out = emptyFeats(); const x0 = i * CHUNK, z0 = j * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
  const hit = (f) => { const b = bb(f); return b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0; };
  const lv = L?.get(ck(i, j)); if (lv) for (const k of KINDS) out[k].push(...lv[k]);
  const nv = N?.get(ck(i, j)); if (nv) for (const k of MINI_KINDS) out[k].push(...(nv[k] || []));
  if (T) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const t = T.get(ck(i + di, j + dj)); if (!t) continue;
    for (const k of KINDS) for (const f of t.data[k] || []) if (hit(f)) out[k].push(f);
  }
  return out;
}
function verFor(i, j, T, data, N) {
  let v = data ? 'L' : '';
  if (T) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (T.has(ck(i + di, j + dj))) v += `${di}${dj}`;
  if (N?.has(ck(i, j))) v += 'N';
  return v;
}

function ring(c, pts) { for (let i = 0; i < pts.length; i++) { const [x, z] = pts[i]; if (i) c.lineTo(x, z); else c.moveTo(x, z); } c.closePath(); }
function line(c, pts) { c.beginPath(); for (let i = 0; i < pts.length; i++) { const [x, z] = pts[i]; if (i) c.lineTo(x, z); else c.moveTo(x, z); } c.stroke(); }
/** 청크 캔버스 (투명 바탕). s = px/m */
function renderChunk(i, j, s, F) {
  const t0 = performance.now();
  const n = Math.max(8, Math.ceil(CHUNK * s));
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d');
  g.setTransform(s, 0, 0, s, -i * CHUNK * s, -j * CHUNK * s);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const px = (v) => v / s; // 화면 px → 월드 m
  g.fillStyle = 'rgba(52, 150, 98, .42)';
  for (const p of F.parks) if (p.o?.length > 2) { g.beginPath(); ring(g, p.o); for (const h of p.holes || []) if (h.length > 2) ring(g, h); g.fill('evenodd'); }
  g.fillStyle = 'rgba(64, 152, 226, .85)';
  for (const p of F.water) if (p.o?.length > 2) { g.beginPath(); ring(g, p.o); for (const h of p.holes || []) if (h.length > 2) ring(g, h); g.fill('evenodd'); }
  g.strokeStyle = 'rgba(64, 152, 226, .85)';
  for (const w of F.waterLines) if (w.p?.length > 1) { g.lineWidth = Math.max(px(2.5), w.w || 4); line(g, w.p); }
  g.fillStyle = 'rgba(213, 203, 187, .62)';
  for (const p of F.plazas || []) if (p.o?.length > 2) { g.beginPath(); ring(g, p.o); g.fill(); }
  g.fillStyle = 'rgba(160, 186, 218, .2)';
  if (s >= 0.4) for (const b of F.buildings) if (b.o?.length > 2) { g.beginPath(); ring(g, b.o); g.fill(); }
  const roads = F.roads;
  // 보행로(가늘게) → 차도 테두리 → 차도 속(작은 길 → 큰 길)
  g.strokeStyle = 'rgba(214, 196, 150, .55)';
  g.lineWidth = px(s >= 0.6 ? 1.2 : 0.8);
  if (s >= 0.3) for (const r of roads) if (!MAJOR.has(r.k) && !MINOR.has(r.k) && r.k !== 'aerialway' && r.p?.length > 1) line(g, r.p);
  // 광장 가장자리(보행로처럼) + 케이블카 선
  g.strokeStyle = 'rgba(214, 196, 150, .8)';
  g.lineWidth = px(1.6);
  for (const p of F.plazas || []) if (p.o?.length > 2) { g.beginPath(); ring(g, p.o); g.stroke(); }
  g.strokeStyle = 'rgba(232, 210, 150, .95)';
  g.lineWidth = px(s >= 0.4 ? 2.2 : 1.6);
  g.setLineDash([px(7), px(4)]);
  for (const r of roads) if (r.k === 'aerialway' && r.p?.length > 1) line(g, r.p);
  g.setLineDash([]);
  const car = roads.filter((r) => (MAJOR.has(r.k) || MINOR.has(r.k)) && r.p?.length > 1);
  const wOf = (r) => { const mj = MAJOR.has(r.k); return Math.min(px(mj ? 9 : 6), Math.max(px(mj ? 3.6 : 2.4), (r.w || (mj ? 12 : 6)) * (mj ? 0.85 : 0.75))); };
  g.strokeStyle = 'rgba(6, 12, 24, .7)';
  for (const r of car) { g.lineWidth = wOf(r) + px(2); line(g, r.p); }
  g.strokeStyle = 'rgba(178, 194, 214, .95)';
  for (const r of car) if (!MAJOR.has(r.k)) { g.lineWidth = wOf(r); line(g, r.p); }
  g.strokeStyle = '#f0dca4';
  for (const r of car) if (MAJOR.has(r.k)) { g.lineWidth = wOf(r); line(g, r.p); }
  const ms = performance.now() - t0;
  stats.chunkRenders++; stats.chunkMs = stats.chunkMs ? stats.chunkMs * 0.8 + ms * 0.2 : ms;
  return c;
}

// ---------------- 매 프레임 ----------------
function loop(now) {
  raf = requestAnimationFrame(loop);
  if (now - last < FRAME_MS) return;
  last = now;
  const cl = document.body.classList;
  if (cl.contains('in-gate') || cl.contains('in-lobby') || document.hidden) return;
  const J = jj(); const P = J?.player; if (!P) return;
  draw(now, J, P);
}

let headSm = null;
function draw(now, J, P) {
  const x = P.position.x, z = P.position.z;
  const viewYaw = J.cam?.mode === 'overview' ? (J.ov?.yaw ?? 0) : (J.cam?.yaw ?? 0);
  const theta = prefs.rot ? viewYaw : 0; // 화면 회전각: 카메라 정면(-sin, -cos) 이 위로
  const face = P.rotation.y; // 몸 방향 (sin, cos)
  const peers = J.remotes?.list?.() || [];
  const s0 = `${x.toFixed(1)}|${z.toFixed(1)}|${theta.toFixed(3)}|${face.toFixed(2)}|${prefs.zi}|${peers.map((p) => `${p.x | 0},${p.z | 0}`).join(';')}|${hover ? `${hover.x | 0},${hover.y | 0}` : ''}|${route ? route.pts.length : 0}`;
  if (s0 === sig && now - lastFull < 1000) return; // 바뀐 게 없으면 건너뜀 (1초에 한 번은 다시: 늦게 도착한 타일 반영)
  sig = s0; lastFull = now;
  const t0 = performance.now();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.round(D * dpr);
  if (cv.width !== W) { cv.width = W; cv.height = W; }
  const g = ctx;
  const viewR = ZOOMS[prefs.zi];
  const k = R / viewR; // CSS px / m
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, D, D);
  g.save();
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
  const bgG = g.createRadialGradient(R, R, R * 0.2, R, R, R);
  bgG.addColorStop(0, 'rgba(16, 30, 52, .76)'); bgG.addColorStop(1, 'rgba(8, 16, 30, .9)');
  g.fillStyle = bgG; g.fillRect(0, 0, D, D);

  // 청크 붙이기
  const cs = Math.min(1.5, Math.max(0.2, Math.round(k * dpr * 20) / 20)); // 청크 해상도(px/m) — 확대 단계마다 하나
  const L = live(), T = corridorTiles(), N = namsanFeats();
  const reach = viewR * 1.42 + 20; // 회전해도 원을 덮는 반경
  g.save();
  g.translate(R, R); g.rotate(theta); g.scale(k, k); g.translate(-x, -z);
  g.imageSmoothingEnabled = true;
  let budget = 2; // 한 번에 새로 그리는 청크 수 (첫 열림 끊김 방지)
  for (let i = Math.floor((x - reach) / CHUNK); i <= Math.floor((x + reach) / CHUNK); i++) for (let j = Math.floor((z - reach) / CHUNK); j <= Math.floor((z + reach) / CHUNK); j++) {
    const key = ck(i, j), ver = verFor(i, j, T, L?.has(key), N); let c = chunks.get(key);
    if (!ver) { if (c) dropChunk(key); continue; }
    if (!c || c.s !== cs || c.ver !== ver) {
      if (budget <= 0) { if (c) c.used = now; else continue; } else {
        budget--; if (c) dropChunk(key);
        const F = featsFor(i, j, L, T, N);
        c = { c: renderChunk(i, j, cs, F), s: cs, ver, used: now }; chunks.set(key, c); stats.bytes += c.c.width * c.c.height * 4;
      }
    }
    c.used = now;
    g.drawImage(c.c, i * CHUNK, j * CHUNK, CHUNK, CHUNK);
  }
  g.restore();
  if (now - lastEvict > 1500) { lastEvict = now; for (const [key, c] of chunks) if (now - c.used > 2000) dropChunk(key); }

  const cos = Math.cos(theta), sin = Math.sin(theta);
  const toS = (wx, wz) => { const dx = (wx - x) * k, dz = (wz - z) * k; return [R + dx * cos - dz * sin, R + dx * sin + dz * cos]; };
  const inC = (sx, sy, m = 0) => (sx - R) ** 2 + (sy - R) ** 2 < (R - m) ** 2;

  // 길 안내 경로
  if (route?.pts.length >= 2) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); route.pts.forEach(([wx, wz], n) => { const [sx, sy] = toS(wx, wz); if (n) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
    g.strokeStyle = 'rgba(8, 16, 30, .75)'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#4cc9f0'; g.lineWidth = 4; g.stroke();
    g.setLineDash([2, 7]); g.lineDashOffset = -(now / 60) % 9; g.strokeStyle = 'rgba(255, 255, 255, .9)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
  }

  // 역·정류장
  const showStops = prefs.zi <= 1;
  const labelAll = prefs.zi === 0;
  let hov = null, hovD = 12 * 12;
  const labels = [];
  if (showStops) for (const st of busStops(J)) {
    const [sx, sy] = toS(st.x, st.z); if (!inC(sx, sy, 3)) continue;
    g.fillStyle = '#0b1424'; g.fillRect(sx - 3.2, sy - 3.2, 6.4, 6.4);
    g.fillStyle = '#4a9bff'; g.fillRect(sx - 2.2, sy - 2.2, 4.4, 4.4);
    if (hover) { const d = (hover.x - sx) ** 2 + (hover.y - sy) ** 2; if (d < hovD) { hovD = d; hov = { sx, sy, t: st.name, bus: 1 }; } }
  }
  for (const st of subwayStations(J)) {
    const [sx, sy] = toS(st.x, st.z); if (!inC(sx, sy, 4)) continue;
    const cols = (st.lines || []).map((l) => LINE_COLOR[l]).filter(Boolean);
    g.beginPath(); g.arc(sx, sy, 6.5, 0, Math.PI * 2); g.fillStyle = '#0b1424'; g.fill();
    g.beginPath(); g.arc(sx, sy, 5.2, 0, Math.PI * 2); g.fillStyle = cols[0] || '#d4003b'; g.fill();
    if (cols[1]) { g.beginPath(); g.arc(sx, sy, 5.2, -Math.PI / 2, Math.PI / 2); g.fillStyle = cols[1]; g.fill(); }
    g.beginPath(); g.arc(sx, sy, 2.2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    const name = tr(st.name, st.nameEn || st.name);
    if (labelAll) labels.push({ sx, sy: sy - 10, t: name });
    if (hover) { const d = (hover.x - sx) ** 2 + (hover.y - sy) ** 2; if (d < hovD * 1.4) { hovD = d; hov = { sx, sy, t: name }; } }
  }

  // [namsan] 케이블카 탑승 위치 (회현 하부 · 남산타워 상부). 정류장 OSM 좌표.
  // 멀리 보면 긴 라벨이 원 테두리에 잘리므로 짧은 이름 + 원 안쪽으로 앵커를 민다.
  const cableFar = prefs.zi >= 2;
  for (const st of cableStations(J)) {
    const [sx, sy] = toS(st.x, st.z); if (!inC(sx, sy, 4)) continue;
    drawCableMark(g, sx, sy);
    const name = cableFar
      ? tr(st.shortLabel || st.label, st.shortLabelEn || st.labelEn || st.label)
      : tr(st.label, st.labelEn || st.label);
    labels.push(fitCableLabel(sx, sy, name));
    if (hover) { const d = (hover.x - sx) ** 2 + (hover.y - sy) ** 2; if (d < hovD * 1.5) { hovD = d; hov = { sx, sy, t: name }; } }
  }

  // [bp24nav] 편의점 아이콘. 길찾기가 꺼져 있으면 points 가 비어 기존 점과 같다.
  navHits = [];
  const nav = J.bp24Nav;
  if (nav?.on && nav.logo) {
    for (const st of nav.points()) {
      const [sx, sy] = toS(st.x, st.z);
      if (!inC(sx, sy, 2)) continue;
      g.beginPath(); g.arc(sx, sy, 8, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = '#0d1a33'; g.stroke();
      g.drawImage(nav.logo, sx - 6, sy - 6, 12, 12);
      navHits.push({ sx, sy, r: 12, id: st.id, name: st.name });
      if (hover) { const d = (hover.x - sx) ** 2 + (hover.y - sy) ** 2; if (d < hovD) { hovD = d; hov = { sx, sy, t: st.name }; } }
    }
  }

  // 목적지 (원 밖이면 테두리에 화살표)
  if (route?.dest) {
    const [sx, sy] = toS(route.dest.x, route.dest.z);
    if (inC(sx, sy, 8)) drawFlag(g, sx, sy);
    else {
      const a = Math.atan2(sy - R, sx - R), ex = R + Math.cos(a) * (R - 9), ey = R + Math.sin(a) * (R - 9);
      g.save(); g.translate(ex, ey); g.rotate(a);
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -6); g.lineTo(-2, 0); g.lineTo(-5, 6); g.closePath();
      g.fillStyle = '#ffe169'; g.strokeStyle = '#0b1424'; g.lineWidth = 1.6; g.fill(); g.stroke(); g.restore();
    }
    if (hover && route.dest.label) { const d = (hover.x - sx) ** 2 + (hover.y - sy) ** 2; if (d < hovD) { hovD = d; hov = { sx, sy: sy - 6, t: route.dest.label }; } }
  }

  // 다른 접속자 (작은 점)
  for (const p of peers) {
    const [sx, sy] = toS(p.x, p.z); if (!inC(sx, sy, 3)) continue;
    g.beginPath(); g.arc(sx, sy, 3.6, 0, Math.PI * 2); g.fillStyle = '#0b1424'; g.fill();
    g.beginPath(); g.arc(sx, sy, 2.6, 0, Math.PI * 2); g.fillStyle = '#7ff0c8'; g.fill();
    if (hover) { const d = (hover.x - sx) ** 2 + (hover.y - sy) ** 2; if (d < hovD) { hovD = d; hov = { sx, sy, t: String(p.name || tr('손님', 'Guest')).slice(0, 12) }; } }
  }

  // 글자 (확대 최대일 때 역 이름 · 마우스 올린 것)
  g.font = '800 11px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'bottom'; g.lineJoin = 'round';
  if (hov && !labels.some((l) => l.t === hov.t)) labels.push({ sx: hov.sx, sy: hov.sy - 8, t: hov.t, hi: 1 });
  for (const l of labels) {
    const lx = l.fit ? l.sx : Math.max(R - 70, Math.min(R + 70, l.sx));
    const ly = l.fit ? l.sy : Math.max(16, l.sy);
    g.lineWidth = 3.2; g.strokeStyle = 'rgba(8, 16, 30, .92)'; g.strokeText(l.t, lx, ly);
    g.fillStyle = l.hi ? '#ffe169' : '#e8f2f8'; g.fillText(l.t, lx, ly);
  }

  // 내 화살표 (가운데, 몸 방향)
  const fx = Math.sin(face), fz = Math.cos(face);
  const ang = Math.atan2(fx * sin + fz * cos, fx * cos - fz * sin);
  g.save(); g.translate(R, R); g.rotate(ang);
  g.beginPath(); g.moveTo(11, 0); g.lineTo(-7.5, -8); g.lineTo(-3, 0); g.lineTo(-7.5, 8); g.closePath();
  g.shadowColor = 'rgba(0, 0, 0, .55)'; g.shadowBlur = 4;
  g.fillStyle = '#ffe169'; g.fill(); g.shadowBlur = 0;
  g.lineWidth = 1.5; g.strokeStyle = '#3a2a00'; g.stroke();
  g.restore();
  g.restore(); // clip

  setCompass(theta);
  updatePlaque(J, x, z);
  const ms = performance.now() - t0;
  stats.frames++; stats.ms = stats.ms ? stats.ms * 0.9 + ms * 0.1 : ms; if (stats.frames > 5) stats.msMax = Math.max(stats.msMax, ms);
}
let lastFull = 0, lastEvict = 0;
function dropChunk(key) { const c = chunks.get(key); if (!c) return; stats.bytes -= c.c.width * c.c.height * 4; c.c.width = 0; c.c.height = 0; chunks.delete(key); }

function drawFlag(g, sx, sy) {
  g.beginPath(); g.arc(sx, sy, 8, 0, Math.PI * 2); g.fillStyle = 'rgba(255, 225, 105, .25)'; g.fill();
  g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); g.fillStyle = '#ffe169'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0b1424'; g.stroke();
  g.beginPath(); g.arc(sx, sy, 1.8, 0, Math.PI * 2); g.fillStyle = '#0b1424'; g.fill();
}

let stCache = null, stKey = null;
function subwayStations(J) {
  const c = J.corridor, d = J.data;
  if (stKey !== c || stCache?.d !== d) {
    stKey = c;
    const list = (c?.stations || []).map((s) => ({ x: s.x, z: s.z, name: s.name, nameEn: s.nameEn, lines: s.lines }));
    if (d?.station && !list.some((s) => Math.hypot(s.x - d.station.x, s.z - d.station.z) < 80)) {
      const nm = String(d.station.name || '').replace(/역$/, '');
      list.push({ x: d.station.x, z: d.station.z, name: nm, nameEn: nm === '정자' ? 'Jeongja' : nm, lines: J.region?.id === 'starbase' ? [] : ['신분당선', '수인분당선'] });
    }
    stCache = list; stCache.d = d;
  }
  return stCache;
}
function busStops(J) {
  const a = J.transit?.stops || [], b = J.corridor?.life?.buses?.stops || [];
  return b.length ? a.concat(b) : a;
}
function cableStations(J) {
  return J?.namsan?.mini?.cableStations || J?.namsan?.cable?.stations || [];
}
function fitCableLabel(sx, sy, text) {
  const hw = Math.max(24, String(text || '').length * 5.7);
  const pad = Math.min(46, Math.max(18, hw * 0.48));
  const clamp = (x, y) => {
    const dx = x - R, dy = y - R, d = Math.hypot(dx, dy), maxR = R - pad;
    if (d <= maxR) return [x, y];
    const k = maxR / (d || 1);
    return [R + dx * k, R + dy * k];
  };
  let lx = sx, ly = sy < R * 0.38 ? sy + 16 : sy - 12;
  [lx, ly] = clamp(lx, ly);
  return { sx: lx, sy: ly, t: text, fit: 1 };
}
function drawCableMark(g, sx, sy) {
  g.beginPath(); g.arc(sx, sy, 7.2, 0, Math.PI * 2); g.fillStyle = '#0b1424'; g.fill();
  g.beginPath(); g.arc(sx, sy, 5.8, 0, Math.PI * 2); g.fillStyle = '#e8b44c'; g.fill();
  g.fillStyle = '#1a1520';
  g.fillRect(sx - 3.2, sy - 0.5, 6.4, 4.3);
  g.fillRect(sx - 0.55, sy - 4.3, 1.1, 4);
  g.beginPath(); g.moveTo(sx - 3.4, sy - 4.1); g.lineTo(sx + 3.4, sy - 4.1); g.lineWidth = 1.2; g.strokeStyle = '#1a1520'; g.stroke();
  g.fillStyle = '#f4f0e6';
  g.fillRect(sx - 2.5, sy + 0.25, 2.05, 1.85);
  g.fillRect(sx + 0.45, sy + 0.25, 2.05, 1.85);
}
let plaqueText = '', plaqueAt = 0;
function updatePlaque(J, x, z) {
  const now = performance.now(); if (now - plaqueAt < 500 && plaqueText) return; plaqueAt = now;
  let best = null, bd = Infinity;
  for (const s of subwayStations(J)) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  let t;
  const nt = J.namsan?.tower;
  const nd = nt ? Math.hypot((nt.ox ?? nt.x) - x, (nt.oz ?? nt.z) - z) : Infinity;
  if (J.region?.id === 'starbase') t = 'Starbase';
  else if (Number.isFinite(nd) && nd < 2800) t = tr('남산', 'Namsan');
  else if (best && bd < 900) t = tr(`${best.name}역${bd > 250 ? ' 근처' : ''}`, `${best.nameEn || best.name}${bd > 250 ? ' area' : ' Stn.'}`);
  else t = tr('분당', 'Bundang');
  if (t !== plaqueText) { plaqueText = t; plaque.textContent = t; }
}
let compAng = null;
function setCompass(theta, force = false) {
  if (!force && compAng != null && Math.abs(theta - compAng) < 0.008) return;
  compAng = theta;
  const deg = (theta * 180) / Math.PI;
  compass.style.transform = deg ? `rotate(${deg.toFixed(2)}deg)` : '';
  for (const n of compass.children) n.style.transform = deg ? `rotate(${(-deg).toFixed(2)}deg)` : '';
}
