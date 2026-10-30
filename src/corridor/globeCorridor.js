// [corridor] 지구본(월드 게이트)의 '분당–잠실 구간' 핀 — 정자 핀 자리를 대신하는 묶음 핀 1개(정자도 분당이라 구간의 첫 역).
// 16km 구간은 지구본 배율에서 1~2px 이라 역 핀을 따로 찍으면 겹친다. 그래서 묶음 핀을 누르거나
// 휠로 한국 쪽을 확대하면 실제 역 좌표(OSM)대로 그린 세로 노선도가 펼쳐지고, 역을 고르면 그 역 출구 앞 인도에서 시작한다.
// 노선도의 정자는 기존 정자 입장(data-enter-region="jeongja")과 똑같다. ?corridor=0 이면 worldGate 가 이 모듈을 아예 마운트하지 않는다.
import * as THREE from 'three';
import { CORRIDOR_ORIGIN, CORRIDOR_STATIONS, CORRIDOR_LANDMARK } from './globeStations.js';

export function corridorGlobeEnabled(params = new URLSearchParams(location.search), region) {
  return !!region?.features?.corridor && params.get('corridor') !== '0';
}
export const CORRIDOR_STATION_IDS = new Set(CORRIDOR_STATIONS.map((s) => s.id));
// 정자 포함 역 수 (롯데월드타워는 역이 아니라 랜드마크)
export const CORRIDOR_STATION_COUNT = CORRIDOR_STATIONS.length + 1;
export const corridorName = (en) => (en ? 'Bundang–Jamsil Line' : '분당–잠실 구간');

const CSS = `
.gate-open-pin.gate-corridor-pin.is-open { box-shadow: 0 0 0 2px #fff, 0 4px 14px rgba(0,0,0,.28); }
.gate-corridor-pin .gate-pin-badge { color: #fff; }
#world-gate .gate-country { list-style: none; display: flex; flex-direction: column; gap: 5px; }
#world-gate .gate-country-hd { width: 100%; display: flex; align-items: center; gap: 7px; padding: 7px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.1); color: #fff; font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; transition: background .15s, border-color .15s; }
#world-gate .gate-country-hd:hover { background: rgba(31,95,191,.35); border-color: rgba(142,200,239,.45); }
#world-gate .gate-country.is-expanded > .gate-country-hd { border-color: rgba(255,225,105,.55); background: rgba(255,225,105,.12); }
#world-gate .gate-country-hd .flag { font-size: 14px; line-height: 1; }
#world-gate .gate-country-hd .name { font-weight: 800; }
#world-gate .gate-country-hd small { color: #9eb4c6; font-size: 10.5px; flex: 1; }
#world-gate .gate-country-hd em { font-style: normal; font-size: 10.5px; font-weight: 700; color: #bcd0e4; }
#world-gate .gate-country-hd .chev { color: #ffe169; font-size: 11px; width: 10px; text-align: center; }
#world-gate .gate-country-list { list-style: none; margin: 0 0 3px; padding: 0 0 0 10px; display: flex; flex-direction: column; gap: 5px; border-left: 2px solid rgba(255,225,105,.28); margin-left: 8px; }
#world-gate .gate-country-list[hidden] { display: none; }
#gate-corridor-map { position: absolute; z-index: 5; width: 344px; padding: 10px 12px 10px; border-radius: 14px; background: rgba(10, 20, 36, .9); border: 1px solid rgba(110, 198, 255, .26); box-shadow: 0 10px 30px rgba(0,0,0,.4); color: #e8f2f8; pointer-events: auto; }
#gate-corridor-map[hidden] { display: none !important; }
#gate-corridor-map .gcm-hd { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 800; }
#gate-corridor-map .gcm-hd small { display: block; font-size: 11px; font-weight: 600; color: #9eb4c6; }
#gate-corridor-map .gcm-close { border: 0; background: rgba(255,255,255,.1); color: #fff; border-radius: 8px; padding: 2px 8px; cursor: pointer; font: inherit; }
#gate-corridor-map .gcm-body { position: relative; margin-top: 8px; }
#gate-corridor-map svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
#gate-corridor-map .gcm-stn { position: absolute; transform: translateY(-50%); display: inline-flex; align-items: baseline; gap: 5px; padding: 1px 7px; border: 0; border-radius: 7px; background: transparent; color: #fff; font: inherit; font-size: 12.5px; font-weight: 800; line-height: 17px; white-space: nowrap; cursor: pointer; }
#gate-corridor-map .gcm-stn small { font-size: 10.5px; font-weight: 600; color: #9eb4c6; }
#gate-corridor-map .gcm-stn.left { flex-direction: row-reverse; }
#gate-corridor-map .gcm-stn:hover, #gate-corridor-map .gcm-stn:focus-visible, #gate-corridor-map .gcm-stn.is-hot { background: linear-gradient(90deg, #d4003b 50%, #f5a200 50%); outline: none; }
#gate-corridor-map .gcm-stn:hover small, #gate-corridor-map .gcm-stn.is-hot small { color: #fff; }
#gate-corridor-map .gcm-stn.is-live { color: #ffe169; }
#gate-corridor-map .gcm-dot { fill: #fff; stroke: #122033; stroke-width: 2; transition: r .12s; }
#gate-corridor-map .gcm-dot.is-hot { fill: #ffe169; r: 7px; }
#gate-corridor-map .gcm-ft { margin-top: 8px; min-height: 30px; font-size: 11.5px; font-weight: 600; color: #cfe0ee; line-height: 1.35; }
`;

const LINE_COLOR = { '수인분당선': '#f5a200', '신분당선': '#d31145', '8호선': '#e6186c', '2호선': '#33a23d', '3호선': '#fe5b10', '9호선': '#bdb092', '경강선': '#0054a6' };
const lineEn = (l) => ({ '수인분당선': 'Suin-Bundang', '신분당선': 'Shinbundang', '8호선': 'Line 8', '2호선': 'Line 2', '3호선': 'Line 3', '9호선': 'Line 9', '경강선': 'Gyeonggang' }[l] || l);

// 펼친 노선도 레이아웃(px): 실제 x(동)/z(남) 좌표를 같은 축척으로 옮기고, 이름표는 좌우로 번갈아 둔다(겹침 방지).
export function layoutCorridorMap({ height = 430, width = 320 } = {}) {
  const pts = [{ ...CORRIDOR_ORIGIN, live: true }, ...CORRIDOR_STATIONS];
  const zs = pts.map((p) => p.z).concat(CORRIDOR_LANDMARK.z), xs = pts.map((p) => p.x).concat(CORRIDOR_LANDMARK.x);
  const zMin = Math.min(...zs), zMax = Math.max(...zs), xMin = Math.min(...xs), xMax = Math.max(...xs);
  const pad = 12, k = (height - pad * 2) / (zMax - zMin);
  const mapW = (xMax - xMin) * k, x0 = (width - mapW) / 2;
  const px = (x) => x0 + (x - xMin) * k, py = (z) => pad + (z - zMin) * k;
  const colL = x0 - 14, colR = x0 + mapW + 14;
  const items = pts.map((p, i) => ({ ...p, dx: px(p.x), dy: py(p.z), side: i % 2 ? 'right' : 'left' }));
  const last = items[items.length - 1];
  const lm = { ...CORRIDOR_LANDMARK, dx: px(CORRIDOR_LANDMARK.x), dy: py(CORRIDOR_LANDMARK.z), side: last.side === 'left' ? 'right' : 'left', landmark: true };
  return { items, landmark: lm, colL, colR, width, height, k };
}

export function mountGlobeCorridor({ root, camera, anchorSpot, globe, isEn, onEnterStation, onFocus }) {
  if (!document.getElementById('gate-corridor-css')) {
    const st = document.createElement('style'); st.id = 'gate-corridor-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const pin = document.createElement('button');
  pin.type = 'button'; pin.id = 'gate-corridor'; pin.className = 'gate-open-pin pin-kr gate-corridor-pin'; pin.hidden = true;
  pin.innerHTML = '<span class="pin-text"></span><span class="gate-pin-badge"></span>';
  const panel = document.createElement('div'); panel.id = 'gate-corridor-map'; panel.hidden = true;
  root.append(pin, panel);

  const L = layoutCorridorMap();
  // dismissed: 사용자가 닫으면(✕·Esc·핀) 확대 상태여도 자동으로 다시 펼치지 않는다 — 한 번 줌아웃해야 다시 자동 펼침
  let open = false, autoOpened = false, dismissed = false, hovering = false, hot = null;
  let dist = camera.position.length(), distTarget = dist, zoomed = false;
  const DIST0 = dist, DIST_MIN = 1.55, AUTO_OPEN = 2.35;
  const camDir0 = camera.position.clone().normalize(), camDir = camDir0.clone();
  const look0 = new THREE.Vector3(0, camera.position.y, 0), look = new THREE.Vector3(), aim = new THREE.Vector3();

  function lineText(s) {
    if (s.live) return isEn() ? '🚇 Jeongja Stn. · Suin-Bundang · Shinbundang — the original Jeongja-dong (same entry as before)' : '🚇 정자역 · 수인분당선 · 신분당선 — 기존 정자동 그대로 입장';
    if (s.landmark) return isEn() ? '🏙️ Lotte World Tower 555 m — start at the tower plaza (Jamsil)' : '🏙️ 롯데월드타워 555m — 타워 앞 광장에서 시작 (잠실)';
    const lines = (s.lines || []).map((l) => (isEn() ? lineEn(l) : l)).join(' · ');
    return isEn() ? `🚇 ${s.en} Stn. · ${lines} — start on the sidewalk by an exit` : `🚇 ${s.ko}역 · ${lines} — 역 출구 앞 인도에서 시작`;
  }
  function render() {
    const en = isEn();
    pin.querySelector('.pin-text').textContent = en ? `🚇 ${corridorName(true)} · ${CORRIDOR_STATION_COUNT} stations` : `🚇 ${corridorName(false)} · ${CORRIDOR_STATION_COUNT}개 역`;
    pin.querySelector('.gate-pin-badge').textContent = open ? '▴' : (en ? '▾ Expand' : '▾ 펼치기');
    pin.classList.toggle('is-open', open);
    const all = [...L.items, L.landmark];
    let seg = '';
    for (let i = 1; i < L.items.length; i++) {
      const a = L.items[i - 1], b = L.items[i];
      const shared = (a.lines || ['수인분당선']).find((l) => (b.lines || []).includes(l)) || (b.lines || [])[0];
      seg += `<line x1="${a.dx}" y1="${a.dy}" x2="${b.dx}" y2="${b.dy}" stroke="${LINE_COLOR[shared] || '#9eb4c6'}" stroke-width="4" stroke-linecap="round"/>`;
    }
    const leaders = all.map((s) => `<line x1="${s.dx}" y1="${s.dy}" x2="${s.side === 'left' ? L.colL : L.colR}" y2="${s.dy + (s.landmark ? -12 : 0)}" stroke="rgba(158,180,198,.45)" stroke-width="1"/>`).join('');
    const dots = all.map((s) => s.landmark
      ? `<rect data-dot="${s.id}" class="gcm-dot" x="${s.dx - 4}" y="${s.dy - 4}" width="8" height="8" transform="rotate(45 ${s.dx} ${s.dy})"/>`
      : `<circle data-dot="${s.id}" class="gcm-dot" cx="${s.dx}" cy="${s.dy}" r="${s.live ? 5 : 4.5}"/>`).join('');
    const labels = all.map((s) => {
      const main = en ? s.en : s.ko, sub = en ? s.ko : s.en;
      const pos = s.side === 'left' ? `right:${L.width - L.colL}px` : `left:${L.colR}px`;
      const top = s.dy + (s.landmark ? -12 : 0);
      const attr = s.live ? 'data-enter-region="jeongja"' : `data-corridor-at="${s.id}"`;
      return `<button type="button" class="gcm-stn ${s.side} ${s.live ? 'is-live' : ''}" ${attr} data-hot="${s.id}" style="${pos};top:${top}px">${s.landmark ? '🏙️ ' : ''}${main}<small>${sub}</small></button>`;
    }).join('');
    panel.innerHTML = `
      <div class="gcm-hd"><div>🚇 ${corridorName(en)}<small>${en ? `Jeongja → Jamsil · ${CORRIDOR_STATION_COUNT} stations · pick one to start` : `정자 → 잠실 · ${CORRIDOR_STATION_COUNT}개 역 · 시작할 역을 고르세요`}</small></div>
        <button type="button" class="gcm-close" aria-label="${en ? 'Close' : '닫기'}">✕</button></div>
      <div class="gcm-body" style="height:${L.height}px;width:${L.width}px"><svg width="${L.width}" height="${L.height}">${seg}${leaders}${dots}</svg>${labels}</div>
      <div class="gcm-ft">${en ? 'Real station positions (OpenStreetMap). Scroll to zoom the globe.' : '실제 역 위치(OpenStreetMap) 기준 · 휠로 지구본 확대/축소'}</div>`;
    hot = null;
  }
  function setHot(id) {
    if (hot === id) return;
    hot = id;
    panel.querySelectorAll('[data-hot]').forEach((el) => el.classList.toggle('is-hot', el.dataset.hot === id));
    panel.querySelectorAll('[data-dot]').forEach((el) => el.classList.toggle('is-hot', el.dataset.dot === id));
    const s = [...L.items, L.landmark].find((x) => x.id === id);
    const ft = panel.querySelector('.gcm-ft');
    if (ft) ft.textContent = s ? lineText(s) : (isEn() ? 'Real station positions (OpenStreetMap). Scroll to zoom the globe.' : '실제 역 위치(OpenStreetMap) 기준 · 휠로 지구본 확대/축소');
  }
  function setOpen(v, auto = false) {
    if (!v && !auto) dismissed = true; else if (v && !auto) dismissed = false;
    if (open === v) return;
    open = v; autoOpened = v && auto;
    panel.hidden = !v;
    render();
    if (v) onFocus?.();
  }
  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (distTarget > 2.0) distTarget = 2.0;
  });
  panel.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-hot]'); setHot(b ? b.dataset.hot : null); });
  panel.addEventListener('pointerleave', () => setHot(null));
  panel.addEventListener('focusin', (e) => { const b = e.target.closest('[data-hot]'); if (b) setHot(b.dataset.hot); });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.gcm-close')) { e.stopPropagation(); setOpen(false); hovering = false; return; }
    const b = e.target.closest('[data-corridor-at]');
    if (b) { e.stopPropagation(); b.classList.add('is-hot'); onEnterStation(b.dataset.corridorAt); }
    // 정자(data-enter-region="jeongja")는 기존 게이트 클릭 처리로 그대로 넘긴다
  });
  for (const el of [pin, panel]) {
    el.addEventListener('pointerenter', () => { hovering = true; });
    el.addEventListener('pointerleave', () => { hovering = false; });
  }
  const onKey = (e) => { if (e.key === 'Escape' && open) setOpen(false); };
  addEventListener('keydown', onKey);
  const canvas = root.querySelector('#gate-globe');
  const onWheel = (e) => {
    e.preventDefault();
    distTarget = Math.max(DIST_MIN, Math.min(DIST0, distTarget * Math.exp(e.deltaY * 0.0012)));
  };
  canvas?.addEventListener('wheel', onWheel, { passive: false });

  const world = camera.position.clone();
  return {
    render,
    holding: () => hovering || open,
    toggle: (v = !open) => { setOpen(v); if (v && distTarget > 2.0) distTarget = 2.0; },
    isOpen: () => open,
    zoomTo: (d) => { distTarget = Math.max(DIST_MIN, Math.min(DIST0, d)); },
    update(dt, facingDot = 0.32) {
      if (Math.abs(distTarget - dist) > 1e-4) dist += (distTarget - dist) * Math.min(1, dt * 6);
      // 확대할수록 카메라를 정자/코리더 쪽으로 기울여 화면 가운데로 (확대 0 이면 기존 카메라 그대로)
      const f = Math.max(0, Math.min(1, (DIST0 - dist) / (DIST0 - DIST_MIN)));
      if (f > 1e-4 || zoomed) {
        aim.copy(globe.localToWorld(world.copy(anchorSpot))).normalize();
        camDir.copy(camDir0).lerp(aim, f).normalize();
        camera.position.copy(camDir).multiplyScalar(dist);
        camera.lookAt(look.copy(look0).multiplyScalar(1 - f));
        zoomed = f > 1e-4;
        if (!zoomed) { camera.position.copy(camDir0).multiplyScalar(DIST0); camera.rotation.set(0, 0, 0); }
      }
      const p = globe.localToWorld(world.copy(anchorSpot));
      const facing = p.clone().normalize().dot(camDir) > facingDot;
      if (dist > AUTO_OPEN + 0.15) dismissed = false;
      if (dist < AUTO_OPEN && facing && !open && !dismissed) setOpen(true, true);
      else if (dist > AUTO_OPEN + 0.15 && open && autoOpened) setOpen(false, true);
      pin.hidden = !facing;
      if (!facing) { panel.hidden = true; return; }
      p.project(camera);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H;
      pin.style.left = `${sx}px`; pin.style.top = `${sy}px`;
      if (open) {
        panel.hidden = false;
        const pw = panel.offsetWidth || 344, ph = panel.offsetHeight || 520;
        // 기본은 핀 왼쪽(오른쪽 위 지역 목록과 겹치지 않게), 자리가 없으면 오른쪽
        let left = sx - 150 - pw; if (left < 8) left = Math.min(W - pw - 8, sx + 150);
        const top = Math.max(104, Math.min(H - ph - 8, sy - ph * 0.5));
        panel.style.left = `${left}px`; panel.style.top = `${top}px`;
      }
    },
    dispose() {
      removeEventListener('keydown', onKey);
      canvas?.removeEventListener('wheel', onWheel);
    },
  };
}
