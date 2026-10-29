// 입장 전 지구본. 해안선은 실제 국가 윤곽이고, 오픈된 동네(정자동 · Starbase, TX) 핀을 누르면 입장한다.
// 다음 오픈 예정 지역(기여자 모집 중)은 오른쪽 상단 패널에 리스팅한다.
import * as THREE from 'three';
import { MAP_W, MAP_H, LAND, KOREA } from './worldLand.js';
import { trackEvent } from './analytics.js';
import { OPEN_REGIONS, UPCOMING_REGIONS, getCurrentRegion, getRegion } from './regions/index.js';
import { isEn, tr, toggleLang, onLangChange } from './i18n.js';

export { OPEN_REGIONS, UPCOMING_REGIONS };

const LAT0 = -56, LAT1 = 82;
export const REPO_URL = 'https://github.com/dohoon84/bumpinto-world';
const DEFAULT_PHONE_BASE = import.meta.env?.VITE_PHONE_URL || 'https://jeongja-phone.xn0texn073.workers.dev';

// 스타베이스 정식 오픈 시각: 2026-10-29 11:00:00 KST (UTC+9)
export const STARBASE_OPEN_AT = Date.parse('2026-10-29T11:00:00+09:00');

function isLocalHost() {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
}

function isForceUnlocked() {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.get('unlock') === '1' || params.get('starbase') === 'open';
}

export function starbaseRemainingMs(now = Date.now()) {
  if (isForceUnlocked()) return 0;
  return Math.max(0, STARBASE_OPEN_AT - now);
}

export function isStarbaseLive(now = Date.now()) {
  return starbaseRemainingMs(now) <= 0;
}

function formatHms(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return { hh, mm, ss, text: `${hh}:${mm}:${ss}` };
}

function phoneStatsUrl(regionId = 'jeongja') {
  const params = new URLSearchParams(location.search);
  const smsParam = params.get('sms');
  const q = `?region=${encodeURIComponent(regionId)}`;
  if (smsParam === 'off') return '';
  if (smsParam === 'local') return `http://127.0.0.1:8789/stats${q}`;
  if (smsParam === 'prod' || smsParam === 'live') return `${DEFAULT_PHONE_BASE.replace(/\/$/, '')}/stats${q}`;
  if (params.has('sms')) {
    const b = (smsParam || '').replace(/\/$/, '');
    return b ? `${b}/stats${q}` : '';
  }
  if (isLocalHost()) return '';
  return `${DEFAULT_PHONE_BASE.replace(/\/$/, '')}/stats${q}`;
}

function unproj(px, py) {
  return [px / MAP_W * 360 - 180, LAT1 - (py / MAP_H) * (LAT1 - LAT0)];
}
function parseRings(d) {
  const rings = [];
  let ring = [];
  for (const m of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (m[1] === 'Z') {
      if (ring.length > 2) rings.push(ring);
      ring = [];
    } else {
      const [x, y] = m[2].split(',').map(Number);
      ring.push(unproj(x, y));
    }
  }
  return rings;
}
function paint(ctx, rings, w, h, fill) {
  ctx.fillStyle = fill;
  for (const ring of rings) {
    let min = Infinity, max = -Infinity;
    const pts = ring.map(([lon, lat]) => {
      const x = (lon + 180) / 360 * w;
      min = Math.min(min, x);
      max = Math.max(max, x);
      return [x, (90 - lat) / 180 * h];
    });
    if (max - min > w * 0.5) continue;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
}
function earthTexture() {
  const w = 2048, h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a5278');
  sky.addColorStop(1, '#123e5c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  paint(ctx, parseRings(LAND), w, h, '#9aafc0');
  paint(ctx, parseRings(KOREA), w, h, '#b6ef62');
  // 텍사스 보카치카(Starbase) 주변 해안 하이라이트 글로우
  for (const r of OPEN_REGIONS) {
    if (r.id === 'jeongja') continue;
    const gx = ((r.lon + 180) / 360) * w;
    const gy = ((90 - r.lat) / 180) * h;
    const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, 24);
    grad.addColorStop(0, 'rgba(76, 201, 240, 0.95)');
    grad.addColorStop(0.5, 'rgba(182, 239, 98, 0.55)');
    grad.addColorStop(1, 'rgba(76, 201, 240, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(gx, gy, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function lonLat(lon, lat, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function openWorldGate({ onEnter }) {
  const root = document.getElementById('world-gate');
  root.hidden = false;
  const activeRegion = getCurrentRegion();
  // 카운트다운 기간에는 지구본이 처음부터 스타베이스나 정자동을 볼 수 있게 하되, 배너 클릭 시 즉시 스타베이스로 포커스
  let focusedRegionId = activeRegion.id;

  const pinButtonsHtml = OPEN_REGIONS.map(
    (r) => `
      <button
        type="button"
        id="${r.id === 'jeongja' ? 'gate-jeongja' : `gate-${r.id}`}"
        class="gate-open-pin ${r.globePinStyle === 'us' ? 'pin-us' : 'pin-kr'}"
        data-enter-region="${r.id}"
        hidden
      >
        <span class="pin-text">${isEn() ? (r.enGlobePinText || r.globePinText) : r.globePinText}</span>
        <span id="gate-pin-badge-${r.id}" class="gate-pin-badge" hidden></span>
      </button>`,
  ).join('');

  root.innerHTML = `
    <div class="gate-telemetry" aria-live="polite">
      <div class="gate-telemetry-hd">
        <span class="gate-sat-dot"></span>
        <span id="gate-telemetry-title"></span>
      </div>
      <div class="gate-telemetry-grid">
        <div class="gate-stat-card">
          <small id="gate-stat-online-lbl"></small>
          <strong id="gate-stat-online">…</strong>
        </div>
        <div class="gate-stat-card">
          <small id="gate-stat-res-lbl"></small>
          <strong id="gate-stat-residents">…</strong>
        </div>
      </div>
    </div>
    <div id="gate-launch-hero" class="gate-launch-hero" aria-live="polite">
      <p id="gate-launch-kicker" class="gate-launch-kicker"></p>
      <div class="gate-launch-clock" role="timer">
        <div class="flip-group">
          <div class="flip-pair">
            <div class="flip-card" id="flip-h1"><span>0</span></div>
            <div class="flip-card" id="flip-h2"><span>0</span></div>
          </div>
          <span class="flip-unit" id="flip-lbl-h">HOURS</span>
        </div>
        <span class="flip-sep">:</span>
        <div class="flip-group">
          <div class="flip-pair">
            <div class="flip-card" id="flip-m1"><span>0</span></div>
            <div class="flip-card" id="flip-m2"><span>0</span></div>
          </div>
          <span class="flip-unit" id="flip-lbl-m">MINUTES</span>
        </div>
        <span class="flip-sep">:</span>
        <div class="flip-group">
          <div class="flip-pair">
            <div class="flip-card" id="flip-s1"><span>0</span></div>
            <div class="flip-card" id="flip-s2"><span>0</span></div>
          </div>
          <span class="flip-unit" id="flip-lbl-s">SECONDS</span>
        </div>
      </div>
      <h2 id="gate-launch-title" class="gate-launch-title"></h2>
      <p id="gate-launch-sub" class="gate-launch-sub"></p>
      <div id="gate-polaroids" class="gate-polaroids"></div>
    </div>
    <aside class="gate-regions" aria-label="World Regions">
      <div class="gate-regions-top">
        <div id="gate-regions-hd" class="gate-regions-hd"></div>
        <button type="button" id="gate-lang-btn" class="lang-switch-btn" title="Switch UI Language (KO / EN)"></button>
      </div>
      <ul id="gate-regions-list" class="gate-regions-list"></ul>
      <a id="gate-regions-ft" href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="gate-regions-ft"></a>
    </aside>
    <div class="gate-copy">
      <p id="gate-kicker" class="kicker"></p>
      <h1>Bumpinto World</h1>
      <p id="gate-lead" class="lead"></p>
      <div id="gate-focus-bar" class="gate-focus-bar" role="group"></div>
      <div class="rule"></div>
      <p id="gate-note" class="note"></p>
      <div class="gate-links">
        <a id="gate-gh-btn" href="${REPO_URL}" target="_blank" rel="noopener" class="gate-gh-btn"></a>
      </div>
    </div>
    <div id="gate-region-toast" class="gate-toast" hidden></div>
    <a class="studio" href="https://crazylabs.co.kr" target="_blank" rel="noopener">
      <img src="${import.meta.env.BASE_URL}crazylabs-qr.svg" alt="CrazyLabs QR" width="52" height="52" />
      <span>
        <small id="gate-studio-sub"></small>
        <strong id="gate-studio-name"></strong>
        <em>crazylabs.co.kr</em>
      </span>
    </a>
    <canvas id="gate-globe"></canvas>
    ${pinButtonsHtml}`;

  const canvas = root.querySelector('#gate-globe');
  const statOnlineEl = root.querySelector('#gate-stat-online');
  const statResidentsEl = root.querySelector('#gate-stat-residents');
  const telemetryTitleEl = root.querySelector('#gate-telemetry-title');
  const regionsListEl = root.querySelector('#gate-regions-list');
  const focusBarEl = root.querySelector('#gate-focus-bar');
  const langBtn = root.querySelector('#gate-lang-btn');
  const toast = root.querySelector('#gate-region-toast');
  const heroEl = root.querySelector('#gate-launch-hero');
  const flipCards = [
    root.querySelector('#flip-h1'),
    root.querySelector('#flip-h2'),
    root.querySelector('#flip-m1'),
    root.querySelector('#flip-m2'),
    root.querySelector('#flip-s1'),
    root.querySelector('#flip-s2'),
  ];
  const prevDigits = ['', '', '', '', '', ''];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0.15, 3.15);
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#1c3c28', 1.35));
  const sun = new THREE.DirectionalLight('#fff6e4', 1.5);
  sun.position.set(2.4, 1.2, 3);
  scene.add(sun);

  const globe = new THREE.Group();
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 48),
    new THREE.MeshLambertMaterial({ map: earthTexture() }),
  );
  const air = new THREE.Mesh(
    new THREE.SphereGeometry(1.06, 48, 32),
    new THREE.MeshBasicMaterial({ color: '#d4e2ff', transparent: true, opacity: 0.12, side: THREE.BackSide }),
  );
  globe.add(earth);

  const pinMarkers = OPEN_REGIONS.map((r) => {
    const spot = lonLat(r.lon, r.lat, 1.02);
    const pinColor = r.id === 'starbase' ? '#0b3d91' : '#d4003b';
    const haloColor = r.id === 'starbase' ? '#4cc9f0' : '#f5a200';
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 12, 10),
      new THREE.MeshBasicMaterial({ color: pinColor }),
    );
    pin.position.copy(spot);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 16, 12),
      new THREE.MeshBasicMaterial({ color: haloColor, transparent: true, opacity: 0.72 }),
    );
    halo.position.copy(spot);
    globe.add(pin, halo);
    const btnEl = root.querySelector(r.id === 'jeongja' ? '#gate-jeongja' : `#gate-${r.id}`);
    const badgeEl = root.querySelector(`#gate-pin-badge-${r.id}`);
    return { region: r, spot, pin, halo, btnEl, badgeEl };
  });

  scene.add(air, globe);

  const initialMarker = pinMarkers.find((m) => m.region.id === activeRegion.id) || pinMarkers[0];
  globe.rotation.y = -Math.atan2(initialMarker.spot.x, initialMarker.spot.z);
  globe.rotation.x = Math.max(-0.35, Math.min(0.35, (initialMarker.region.lat - 28) * 0.006));

  let alive = true, raf = 0, drag = null, moved = 0, lastT = 0, toastTimer = 0, statsTimer = 0, countdownTimer = 0;
  let targetRotY = null;
  let targetRotX = null;
  let pauseSpinUntil = 0;
  let pinHovered = false;
  let wasStarbaseLive = isStarbaseLive();

  for (const m of pinMarkers) {
    if (!m.btnEl) continue;
    m.btnEl.addEventListener('pointerenter', () => { pinHovered = true; });
    m.btnEl.addEventListener('pointerleave', () => { pinHovered = false; });
  }

  function updateCountdownUi() {
    if (!alive) return;
    const en = isEn();
    const rem = starbaseRemainingMs();
    const live = rem <= 0;
    if (live !== wasStarbaseLive) {
      wasStarbaseLive = live;
      renderGateLocale();
    }
    const sbMarker = pinMarkers.find((m) => m.region.id === 'starbase');
    const sbListEm = root.querySelector('[data-enter-region="starbase"] em');
    const sbListItem = root.querySelector('[data-enter-region="starbase"]');
    root.classList.toggle('is-countdown-active', !live);

    if (live) {
      if (heroEl) heroEl.hidden = true;
      if (sbMarker?.btnEl) {
        sbMarker.btnEl.classList.remove('is-countdown');
        const txt = sbMarker.btnEl.querySelector('.pin-text');
        if (txt) txt.textContent = en ? (sbMarker.region.enGlobePinText || sbMarker.region.globePinText) : sbMarker.region.globePinText;
      }
      if (sbListItem) {
        sbListItem.classList.remove('is-countdown');
        sbListItem.classList.add('is-open');
      }
      if (sbListEm) sbListEm.textContent = en ? 'OPEN · Enter' : '열림 · 입장';
      return;
    }

    if (heroEl) heroEl.hidden = false;
    const { hh, mm, ss, text } = formatHms(rem);
    const nextDigits = [hh[0], hh[1], mm[0], mm[1], ss[0], ss[1]];
    for (let i = 0; i < 6; i++) {
      const card = flipCards[i];
      if (!card) continue;
      if (prevDigits[i] !== nextDigits[i]) {
        const hadPrev = prevDigits[i] !== '';
        prevDigits[i] = nextDigits[i];
        const span = card.querySelector('span');
        if (span) span.textContent = nextDigits[i];
        if (hadPrev) {
          card.classList.remove('is-flipping');
          void card.offsetWidth;
          card.classList.add('is-flipping');
        }
      }
    }

    if (sbMarker?.btnEl) {
      sbMarker.btnEl.classList.add('is-countdown');
      const txt = sbMarker.btnEl.querySelector('.pin-text');
      if (txt) txt.textContent = `Starbase, TX · ${text}`;
      if (sbMarker.badgeEl) {
        sbMarker.badgeEl.hidden = false;
        sbMarker.badgeEl.textContent = '11:00 KST';
      }
    }
    if (sbListItem) {
      sbListItem.classList.add('is-countdown');
    }
    if (sbListEm) {
      sbListEm.textContent = text;
    }
  }

  function renderGateLocale() {
    const en = isEn();
    const live = isStarbaseLive();
    const focused = getRegion(focusedRegionId);
    if (telemetryTitleEl) {
      telemetryTitleEl.textContent = en ? (focused.enTelemetryLabel || focused.telemetryLabel) : focused.telemetryLabel;
    }
    root.querySelector('#gate-stat-online-lbl').textContent = tr('현재 거리 산책 중', 'Exploring Now');
    root.querySelector('#gate-stat-res-lbl').textContent = tr('누적 등록 입주민', 'Registered Citizens');
    const openCount = live ? OPEN_REGIONS.length : 1;
    root.querySelector('#gate-regions-hd').textContent = tr(
      `🌏 오픈 월드 지역 현황 (${openCount}곳 오픈${live ? '' : ' · 1곳 카운트다운'})`,
      `🌏 Open World Regions (${openCount} Live${live ? '' : ' · 1 Countdown'})`,
    );
    if (langBtn) langBtn.textContent = en ? '🌐 KO 한국어' : '🌐 EN English';
    root.querySelector('#gate-regions-ft').textContent = tr(
      '+ 내 동네 개척자로 참여하기 (GitHub)',
      '+ Contribute Your Neighborhood (GitHub)',
    );
    root.querySelector('#gate-kicker').textContent = tr('순차 오픈 · 글로벌 오픈월드', 'OPEN SOURCE · 3D REAL-WORLD METAVERSE');
    root.querySelector('#gate-lead').textContent = tr(
      '다 같이 만들어 가는 오픈 월드 · Korea & USA',
      'Walk real-world neighborhoods together · Korea & USA',
    );
    root.querySelector('#gate-note').innerHTML = live
      ? tr(
          '지구본의 <b class="gate-note-link" data-enter-region="jeongja">정자동 · 열림</b> 또는 <b class="gate-note-link" data-enter-region="starbase">🚀 Starbase, TX · OPEN</b>을 눌러 입장하세요',
          'Click <b class="gate-note-link" data-enter-region="jeongja">🇰🇷 Jeongja-dong</b> or <b class="gate-note-link" data-enter-region="starbase">🚀 Starbase, TX</b> on the globe to enter',
        )
      : tr(
          '지구본의 <b class="gate-note-link" data-enter-region="jeongja">정자동 · 열림</b>으로 입장하거나 <b>🚀 Starbase, TX 오픈 카운트다운</b>을 확인하세요',
          'Enter <b class="gate-note-link" data-enter-region="jeongja">🇰🇷 Jeongja-dong</b> now or check the <b>🚀 Starbase, TX Launch Countdown</b>',
        );
    root.querySelector('#gate-gh-btn').textContent = tr('⭐ GitHub에서 함께 만들기', '⭐ Build Together on GitHub');
    root.querySelector('#gate-studio-sub').textContent = tr('개발 · 오픈소스 허브', 'Created by · Open Source Hub');
    root.querySelector('#gate-studio-name').textContent = tr('크레이지랩스', 'CrazyLabs');

    const base = import.meta.env.BASE_URL;
    root.querySelector('#gate-launch-kicker').textContent = en
      ? 'STARBASE, TX · BOCA CHICA · GRAND OPENING'
      : 'STARBASE, TX · 첫 해외 지역 오픈 카운트다운';
    root.querySelector('#gate-launch-title').textContent = en
      ? 'Starbase, Texas Opens at 11:00 AM KST (Oct 29)'
      : '미국 텍사스 스타베이스 · 10월 29일 11:00 KST 정식 오픈';
    root.querySelector('#gate-launch-sub').innerHTML = en
      ? 'Direct flights from Incheon (ICN) to Starbase, TX (BRO) open at 11:00 AM KST — here is what awaits you inside:'
      : '11시 정각 인천공항(ICN) → 텍사스 스타베이스(BRO) 노선이 열리면 아래 경험들을 직접 만나보실 수 있습니다';
    const polaroidsEl = root.querySelector('#gate-polaroids');
    if (polaroidsEl) {
      const items = [
        {
          img: `${base}promo/starbase-launch.jpg`,
          tag: 'EVERY 5 MIN LIVE',
          title: en ? '145m Starship Launch & Catch' : '145m 스타십 발사 & 젓가락 캐치',
          sub: en ? 'Full-stack liftoff, hot-staging & Mechazilla catch' : '33기 랩터 점화·이륙부터 메카질라 부스터 캐치까지',
        },
        {
          img: `${base}promo/starbase-truck.jpg`,
          tag: 'DRIVABLE · KEY F',
          title: en ? 'Drive the Steel Truck' : '스틸 트럭(사이버트럭) 직접 운전',
          sub: en ? '20 angular pickups parked across Starbase (130 km/h)' : '8가지 컬러 20대 배치 · F 키로 탑승해 130km/h 질주',
        },
        {
          img: `${base}promo/starbase-roadster.jpg`,
          tag: 'STUNT SHOW · KEY R',
          title: en ? 'Rocket Roadster Jump Show' : '로켓 로드스터 점프 쇼',
          sub: en ? 'Inverted loop ramp, air thrusters & 5-car jump' : '곡선 루프 흡착 주행·공중 백플립·차량 5대 점프',
        },
      ];
      polaroidsEl.innerHTML = items
        .map(
          (p) => `
          <div class="polaroid-card" data-focus-region="starbase">
            <div class="polaroid-photo">
              <img src="${p.img}" alt="${p.title}" loading="eager" />
              <span class="polaroid-tag">${p.tag}</span>
            </div>
            <div class="polaroid-caption">
              <strong>${p.title}</strong>
              <span>${p.sub}</span>
            </div>
          </div>`,
        )
        .join('');
    }

    const openListHtml = OPEN_REGIONS.map(
      (r) => {
        const isSbCountdown = r.id === 'starbase' && !live;
        return `
        <li>
          <button type="button" class="gate-upcoming-item ${isSbCountdown ? 'is-countdown' : 'is-open'} ${r.id === 'starbase' ? 'is-us' : ''}" data-enter-region="${r.id}">
            <span class="dot ${isSbCountdown ? 'countdown' : 'open'}"></span>
            <span class="name">${en ? (r.enName || r.name) : r.name}</span>
            <small id="gate-sub-${r.id}">${en ? (r.enSub || r.sub) : r.sub}</small>
            <em>${isSbCountdown ? '⏱️ 11:00 KST' : (en ? 'OPEN · Enter' : '열림 · 입장')}</em>
          </button>
        </li>`;
      },
    ).join('');

    const upcomingListHtml = UPCOMING_REGIONS.map(
      (r) => `
        <li>
          <button type="button" class="gate-upcoming-item" data-region="${r.id}">
            <span class="dot"></span>
            <span class="name">${en ? (r.enName || r.name) : r.name}</span>
            <small>${en ? (r.enDesc || r.desc) : r.desc}</small>
            <em>${en ? 'Soon' : '준비중'}</em>
          </button>
        </li>`,
    ).join('');
    regionsListEl.innerHTML = openListHtml + upcomingListHtml;

    focusBarEl.innerHTML = OPEN_REGIONS.map(
      (r) => `
        <button type="button" class="gate-focus-chip ${r.id === focusedRegionId ? 'on' : ''}" data-focus-region="${r.id}">
          ${r.id === 'starbase' ? tr('🇺🇸 Starbase, TX 보기', '🇺🇸 View Starbase, TX') : tr('🇰🇷 정자동 보기', '🇰🇷 View Jeongja, KR')}
        </button>`,
    ).join('');

    for (const m of pinMarkers) {
      const txtEl = m.btnEl?.querySelector('.pin-text');
      if (txtEl) txtEl.textContent = en ? (m.region.enGlobePinText || m.region.globePinText) : m.region.globePinText;
    }
    updateCountdownUi();
    refreshGateStats();
  }

  function focusRegionOnGlobe(regionId) {
    const marker = pinMarkers.find((m) => m.region.id === regionId);
    if (!marker) return;
    focusedRegionId = marker.region.id;
    const desiredY = -Math.atan2(marker.spot.x, marker.spot.z);
    const diff = Math.atan2(Math.sin(desiredY - globe.rotation.y), Math.cos(desiredY - globe.rotation.y));
    targetRotY = globe.rotation.y + diff;
    targetRotX = Math.max(-0.35, Math.min(0.35, (marker.region.lat - 28) * 0.006));
    pauseSpinUntil = performance.now() + 6000;
    if (telemetryTitleEl) {
      telemetryTitleEl.textContent = isEn() ? (marker.region.enTelemetryLabel || marker.region.telemetryLabel) : marker.region.telemetryLabel;
    }
    root.querySelectorAll('[data-focus-region]').forEach((el) => {
      el.classList.toggle('on', el.dataset.focusRegion === regionId);
    });
  }

  async function refreshGateStats() {
    if (!alive) return;
    const en = isEn();
    const live = isStarbaseLive();
    let totalOnline = 0;
    let totalResidents = 0;
    let anyLive = false;

    for (const m of pinMarkers) {
      const subEl = root.querySelector(`#gate-sub-${m.region.id}`);
      const baseSub = en ? (m.region.enSub || m.region.sub) : m.region.sub;
      if (m.region.id === 'starbase' && !live) {
        if (subEl) subEl.textContent = en ? 'Opens Oct 29, 11:00 KST' : '10월 29일 11:00 KST 오픈';
        continue;
      }
      const url = phoneStatsUrl(m.region.id);
      if (!url) {
        if (subEl) subEl.textContent = `${baseSub} · ${en ? '🧪 Local Mode' : '🧪 로컬 테스트 모드'}`;
        if (m.badgeEl) {
          m.badgeEl.hidden = false;
          m.badgeEl.textContent = en ? '🧪 Local' : '🧪 로컬 모드';
        }
        continue;
      }
      try {
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (!alive || !j || !j.ok) continue;
        anyLive = true;
        const online = Math.max(0, Number(j.online || 0));
        const residents = Math.max(0, Number(j.residents || 0));
        totalOnline += online;
        totalResidents += residents;
        if (subEl) {
          subEl.textContent = online > 0
            ? `${baseSub} · 🟢 ${en ? `${online} online` : `${online}명 산책 중`}`
            : `${baseSub} · ${en ? `${residents} citizens` : `입주민 ${residents}명`}`;
        }
        if (m.badgeEl) {
          m.badgeEl.hidden = false;
          m.badgeEl.textContent = online > 0
            ? (en ? `🟢 ${online} online` : `🟢 ${online}명 산책 중`)
            : (en ? `Citizens ${residents}` : `입주민 ${residents}명`);
        }
      } catch {
        /* 네트워크 실패 시 조용히 무시 */
      }
    }

    if (!anyLive) {
      if (statOnlineEl) statOnlineEl.innerHTML = en ? `<span class="idle-num">Local Mode</span> · Offline` : `<span class="idle-num">로컬 모드</span> · 집계 제외`;
      if (statResidentsEl) statResidentsEl.innerHTML = en ? `<span class="res-num">Test Env</span>` : `<span class="res-num">테스트 환경</span>`;
      return;
    }
    if (statOnlineEl) {
      statOnlineEl.innerHTML = totalOnline > 0
        ? (en ? `<span class="live-num">${totalOnline}</span> active` : `<span class="live-num">${totalOnline}명</span> 활동 중`)
        : (en ? `<span class="idle-num">0</span> · Waiting for explorers` : `<span class="idle-num">0명</span> · 첫 산책자 대기 중`);
    }
    if (statResidentsEl) {
      statResidentsEl.innerHTML = en
        ? `<span class="res-num">${totalResidents.toLocaleString()}</span>`
        : `<span class="res-num">${totalResidents.toLocaleString()}명</span>`;
    }
  }

  const unsubLang = onLangChange(() => {
    if (alive) renderGateLocale();
  });
  renderGateLocale();
  statsTimer = setInterval(refreshGateStats, 12000);
  countdownTimer = setInterval(updateCountdownUi, 250);

  const fit = () => {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  const onResize = () => fit();
  const clearDrag = () => { drag = null; };
  const enter = (regionId = activeRegion.id, forceBypass = false) => {
    if (!alive) return;
    const chosen = getRegion(regionId);
    if (chosen.id === 'starbase' && !isStarbaseLive() && !forceBypass) {
      focusRegionOnGlobe('starbase');
      return;
    }
    trackEvent('globe_enter_region', { region: chosen.id });
    alive = false;
    unsubLang();
    clearTimeout(toastTimer);
    clearInterval(statsTimer);
    clearInterval(countdownTimer);
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    removeEventListener('blur', clearDrag);
    renderer.dispose();
    earth.geometry.dispose();
    earth.material.map.dispose();
    earth.material.dispose();
    root.hidden = true;
    onEnter(chosen.id);
  };

  function showStarbaseCountdownToast() {
    trackEvent('starbase_countdown_click');
    const en = isEn();
    const { text } = formatHms(starbaseRemainingMs());
    const localBtn = isLocalHost()
      ? `<button type="button" class="gate-toast-btn primary" data-force-enter="starbase">${en ? '🧪 Local Test Enter' : '🧪 로컬 테스트 바로 입장'}</button>`
      : '';
    toast.innerHTML = en
      ? `
        <div class="gate-toast-head">
          <strong>🚀 Starbase, TX — Grand Opening at 11:00 KST (<span id="gate-toast-cd">T−${text}</span>)</strong>
          <button type="button" class="gate-toast-close" aria-label="Close">✕</button>
        </div>
        <p>Flights from Incheon (ICN) to Starbase, TX (BRO) open at <b>11:00 AM KST on Oct 29</b>! Experience the 145m Mechazilla Starship Launch &amp; Catch Show, Roadster Jump Show, and drivable Steel Trucks.</p>
        <div class="gate-toast-actions">
          ${localBtn}
          <button type="button" class="gate-toast-btn ${localBtn ? '' : 'primary'}" data-enter-region="jeongja">Explore Jeongja, KR First</button>
        </div>`
      : `
        <div class="gate-toast-head">
          <strong>🚀 스타베이스 (Starbase, TX) — 11:00 정식 오픈 (<span id="gate-toast-cd">T−${text}</span>)</strong>
          <button type="button" class="gate-toast-close" aria-label="닫기">✕</button>
        </div>
        <p><b>10월 29일 오전 11:00 (KST)</b>에 인천공항(ICN) → 텍사스 스타베이스(BRO) 직항 노선이 열립니다! 145m 메카질라 스타십 발사·젓가락 캐치 쇼, 로드스터 점프 쇼, 직접 운전하는 스틸 트럭(사이버트럭)을 만나보세요.</p>
        <div class="gate-toast-actions">
          ${localBtn}
          <button type="button" class="gate-toast-btn ${localBtn ? '' : 'primary'}" data-enter-region="jeongja">정자동 먼저 산책하기</button>
        </div>`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 14000);
  }

  function showUpcomingToast(region) {
    trackEvent('upcoming_region_click', { region: region.id });
    const en = isEn();
    const rName = en ? (region.enName || region.name) : region.name;
    const rDesc = en ? (region.enDesc || region.desc) : region.desc;
    toast.innerHTML = en
      ? `
        <div class="gate-toast-head">
          <strong>📍 ${rName} (${rDesc}) — Pioneer Wanted!</strong>
          <button type="button" class="gate-toast-close" aria-label="Close">✕</button>
        </div>
        <p>Be the first to convert OSM data, landmarks, or NPCs for this district and get permanently credited as the <b>${rName} Pioneer</b>!</p>
        <div class="gate-toast-actions">
          <a href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="gate-toast-btn primary">Contributing Guide</a>
          <button type="button" class="gate-toast-btn" data-enter-region="jeongja">Enter Jeongja, KR</button>
        </div>`
      : `
        <div class="gate-toast-head">
          <strong>📍 ${rName} (${rDesc}) — 개척자 모집 중!</strong>
          <button type="button" class="gate-toast-close" aria-label="닫기">✕</button>
        </div>
        <p>이 지역의 OSM 데이터 변환·랜드마크·NPC를 첫 번째로 기여해 주시면 <b>${rName} 개척자(Pioneer)</b>로 월드에 영구 등재됩니다.</p>
        <div class="gate-toast-actions">
          <a href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="gate-toast-btn primary">GitHub 기여 가이드 보기</a>
          <button type="button" class="gate-toast-btn" data-enter-region="jeongja">정자동 먼저 입장하기</button>
        </div>`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 12000);
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#gate-lang-btn')) {
      toggleLang();
      return;
    }
    if (e.target.closest('.gate-regions-top')) {
      const regionsAside = root.querySelector('.gate-regions');
      if (regionsAside) regionsAside.classList.toggle('is-expanded');
      return;
    }
    if (e.target.closest('.gate-toast-close')) {
      toast.hidden = true;
      return;
    }
    const forceBtn = e.target.closest('[data-force-enter]');
    if (forceBtn) {
      toast.hidden = true;
      enter(forceBtn.dataset.forceEnter, true);
      return;
    }
    if (e.target.closest('#gate-launch-hero')) {
      focusRegionOnGlobe('starbase');
      return;
    }
    const focusBtn = e.target.closest('[data-focus-region]');
    if (focusBtn) {
      focusRegionOnGlobe(focusBtn.dataset.focusRegion);
      return;
    }
    const enterBtn = e.target.closest('[data-enter-region]') || e.target.closest('[data-enter-now]');
    if (enterBtn) {
      toast.hidden = true;
      const targetId = enterBtn.dataset.enterRegion || 'jeongja';
      enter(targetId);
      return;
    }
    const regionBtn = e.target.closest('[data-region]');
    if (regionBtn) {
      const found = UPCOMING_REGIONS.find((r) => r.id === regionBtn.dataset.region);
      if (found) showUpcomingToast(found);
    }
  });

  const ndc = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const loop = (t) => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = lastT ? Math.min(0.08, Math.max(0.004, (t - lastT) / 1000)) : 1 / 60;
    lastT = t;
    if (drag) {
      targetRotY = null;
      targetRotX = null;
    } else if (targetRotY != null) {
      const dy = targetRotY - globe.rotation.y;
      const dx = (targetRotX ?? globe.rotation.x) - globe.rotation.x;
      globe.rotation.y += dy * Math.min(1, dt * 7.5);
      globe.rotation.x += dx * Math.min(1, dt * 7.5);
      if (Math.abs(dy) < 0.004 && Math.abs(dx) < 0.004) {
        globe.rotation.y = targetRotY;
        if (targetRotX != null) globe.rotation.x = targetRotX;
        targetRotY = null;
        targetRotX = null;
      }
    } else if (!pinHovered && t > pauseSpinUntil) {
      globe.rotation.y += dt * 0.18;
    }
    const pulse = 1 + Math.sin(t * 0.004) * 0.35;
    globe.updateMatrixWorld(true);
    camDir.copy(camera.position).normalize();

    for (const m of pinMarkers) {
      m.halo.scale.setScalar(pulse);
      const world = m.pin.getWorldPosition(ndc);
      const facing = world.clone().normalize().dot(camDir) > 0.32;
      if (m.btnEl) {
        m.btnEl.hidden = !facing;
        if (facing) {
          world.project(camera);
          m.btnEl.style.left = `${(world.x * 0.5 + 0.5) * canvas.clientWidth}px`;
          m.btnEl.style.top = `${(-world.y * 0.5 + 0.5) * canvas.clientHeight}px`;
        }
      }
    }
    renderer.render(scene, camera);
  };
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    moved = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    globe.rotation.y += dx * 0.005;
    globe.rotation.x = Math.max(-0.45, Math.min(0.45, globe.rotation.x + dy * 0.003));
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    drag = null;
    if (moved > 8) return;
    const rect = canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    ), camera);
    const hit = ray.intersectObject(earth)[0];
    if (!hit) return;
    const local = globe.worldToLocal(hit.point.clone());
    for (const m of pinMarkers) {
      if (local.angleTo(m.spot) < 0.14) {
        enter(m.region.id);
        return;
      }
    }
  });
  canvas.addEventListener('pointercancel', clearDrag);
  canvas.addEventListener('lostpointercapture', clearDrag);
  addEventListener('blur', clearDrag);
  fit();
  addEventListener('resize', onResize);
  requestAnimationFrame(loop);
}
