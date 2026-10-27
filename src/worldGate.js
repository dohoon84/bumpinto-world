// 입장 전 지구본. 해안선은 실제 국가 윤곽이고, 남한만 밝히고 정자동을 누르면 입장한다.
// 다음 오픈 예정 지역(기여자 모집 중)은 오른쪽 상단 패널에 리스팅한다.
import * as THREE from 'three';
import { MAP_W, MAP_H, LAND, KOREA } from './worldLand.js';
import { trackEvent } from './analytics.js';

const LAT0 = -56, LAT1 = 82;
const JEONGJA = { id: 'jeongja', name: '정자동', status: 'open', lat: 37.3665, lon: 127.10835 };

export const UPCOMING_REGIONS = [
  { id: 'sunae', name: '수내역', desc: '중앙공원 · 롯데백화점', lat: 37.3785, lon: 127.1144 },
  { id: 'seohyeon', name: '서현역', desc: 'AK플라자 · 로데오거리', lat: 37.3851, lon: 127.1236 },
  { id: 'imae', name: '이매역', desc: '성남아트센터 · 탄천', lat: 37.3958, lon: 127.1281 },
  { id: 'yatap', name: '야탑역', desc: '성남종합버스터미널 · 먹자골목', lat: 37.4114, lon: 127.1287 },
  { id: 'pangyo', name: '판교역', desc: '테크노밸리 · 화랑공원', lat: 37.3947, lon: 127.1112 },
  { id: 'gangnam', name: '강남역', desc: '강남대로 · 테헤란로', lat: 37.4979, lon: 127.0276 },
  { id: 'seongsu', name: '성수동', desc: '연무장길 · 서울숲', lat: 37.5445, lon: 127.0560 },
  { id: 'hongdae', name: '홍대입구', desc: '경의선숲길 · 걷고싶은거리', lat: 37.5572, lon: 126.9245 },
];

export const REPO_URL = 'https://github.com/dohoon84/bumpinto-world';
const DEFAULT_PHONE_BASE = import.meta.env?.VITE_PHONE_URL || 'https://jeongja-phone.xn0texn073.workers.dev';

function phoneStatsUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get('sms') === 'off') return '';
  if (params.get('sms') === 'local') return 'http://127.0.0.1:8789/stats';
  if (params.has('sms')) {
    const b = (params.get('sms') || '').replace(/\/$/, '');
    return b ? `${b}/stats` : '';
  }
  return `${DEFAULT_PHONE_BASE.replace(/\/$/, '')}/stats`;
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

  const upcomingListHtml = UPCOMING_REGIONS.map(
    (r) => `
      <li>
        <button type="button" class="gate-upcoming-item" data-region="${r.id}">
          <span class="dot"></span>
          <span class="name">${r.name}</span>
          <small>${r.desc}</small>
          <em>준비중</em>
        </button>
      </li>`,
  ).join('');

  root.innerHTML = `
    <div class="gate-telemetry" aria-live="polite">
      <div class="gate-telemetry-hd">
        <span class="gate-sat-dot"></span>
        <span>🛰️ 위성 실시간 관측 · 정자동 (37.37°N)</span>
      </div>
      <div class="gate-telemetry-grid">
        <div class="gate-stat-card">
          <small>현재 거리 산책 중</small>
          <strong id="gate-stat-online">관측 중…</strong>
        </div>
        <div class="gate-stat-card">
          <small>누적 등록 입주민</small>
          <strong id="gate-stat-residents">집계 중…</strong>
        </div>
      </div>
    </div>
    <aside class="gate-regions" aria-label="월드 지역 목록">
      <div class="gate-regions-hd">🌏 오픈 월드 지역 현황</div>
      <ul class="gate-regions-list">
        <li>
          <button type="button" class="gate-upcoming-item is-open" data-enter-now="1">
            <span class="dot open"></span>
            <span class="name">정자동 (정자역)</span>
            <small id="gate-jeongja-sub">성남시 분당구</small>
            <em>열림 · 입장</em>
          </button>
        </li>
        ${upcomingListHtml}
      </ul>
      <a href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="gate-regions-ft">
        + 내 동네 개척자로 참여하기 (GitHub)
      </a>
    </aside>
    <div class="gate-copy">
      <p class="kicker">순차 오픈 · 오픈소스</p>
      <h1>Bumpinto World</h1>
      <p class="lead">다 같이 만들어 가는 오픈 월드</p>
      <div class="rule"></div>
      <p class="note">지구본의 <b>정자동 · 열림</b>을 눌러 입장하세요</p>
      <div class="gate-links">
        <a href="${REPO_URL}" target="_blank" rel="noopener" class="gate-gh-btn">⭐ GitHub에서 함께 만들기</a>
      </div>
    </div>
    <div id="gate-region-toast" class="gate-toast" hidden></div>
    <a class="studio" href="https://crazylabs.co.kr" target="_blank" rel="noopener">
      <img src="${import.meta.env.BASE_URL}crazylabs-qr.svg" alt="크레이지랩스 사이트 QR" width="52" height="52" />
      <span>
        <small>개발 · 오픈소스 허브</small>
        <strong>크레이지랩스</strong>
        <em>crazylabs.co.kr</em>
      </span>
    </a>
    <canvas id="gate-globe"></canvas>
    <button type="button" id="gate-jeongja" hidden>
      <span>정자동 · 열림</span>
      <span id="gate-pin-badge" class="gate-pin-badge" hidden></span>
    </button>`;

  const canvas = root.querySelector('#gate-globe');
  const label = root.querySelector('#gate-jeongja');
  const pinBadge = root.querySelector('#gate-pin-badge');
  const statOnlineEl = root.querySelector('#gate-stat-online');
  const statResidentsEl = root.querySelector('#gate-stat-residents');
  const jeongjaSubEl = root.querySelector('#gate-jeongja-sub');
  const toast = root.querySelector('#gate-region-toast');

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
  const spot = lonLat(JEONGJA.lon, JEONGJA.lat, 1.02);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), new THREE.MeshBasicMaterial({ color: '#d4003b' }));
  pin.position.copy(spot);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshBasicMaterial({ color: '#f5a200', transparent: true, opacity: 0.7 }));
  halo.position.copy(spot);
  globe.add(earth, pin, halo);
  scene.add(air, globe);
  globe.rotation.y = -Math.atan2(spot.x, spot.z);

  let alive = true, raf = 0, drag = null, moved = 0, lastT = 0, toastTimer = 0, statsTimer = 0;

  async function refreshGateStats() {
    const url = phoneStatsUrl();
    if (!url || !alive) return;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      if (!alive || !j || !j.ok) return;
      const online = Math.max(0, Number(j.online || 0));
      const residents = Math.max(0, Number(j.residents || 0));
      if (statOnlineEl) {
        statOnlineEl.innerHTML = online > 0
          ? `<span class="live-num">${online}명</span> 활동 중`
          : `<span class="idle-num">0명</span> · 첫 산책자 대기 중`;
      }
      if (statResidentsEl) {
        statResidentsEl.innerHTML = `<span class="res-num">${residents.toLocaleString()}명</span>`;
      }
      if (jeongjaSubEl) {
        jeongjaSubEl.textContent = online > 0
          ? `성남시 분당구 · 🟢 ${online}명 산책 중`
          : `성남시 분당구 · 입주민 ${residents}명`;
      }
      if (pinBadge) {
        pinBadge.hidden = false;
        pinBadge.textContent = online > 0 ? `🟢 ${online}명 산책 중` : `입주민 ${residents}명`;
      }
    } catch {
      /* 네트워크 실패 시 조용히 무시 */
    }
  }
  refreshGateStats();
  statsTimer = setInterval(refreshGateStats, 12000);

  const fit = () => {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  const onResize = () => fit();
  const clearDrag = () => { drag = null; };
  const enter = () => {
    if (!alive) return;
    alive = false;
    clearTimeout(toastTimer);
    clearInterval(statsTimer);
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    removeEventListener('blur', clearDrag);
    renderer.dispose();
    earth.geometry.dispose();
    earth.material.map.dispose();
    earth.material.dispose();
    root.hidden = true;
    onEnter();
  };

  function showUpcomingToast(region) {
    trackEvent('upcoming_region_click', { region: region.id });
    toast.innerHTML = `
      <div class="gate-toast-head">
        <strong>📍 ${region.name} (${region.desc}) — 개척자 모집 중!</strong>
        <button type="button" class="gate-toast-close" aria-label="닫기">✕</button>
      </div>
      <p>이 지역의 OSM 데이터 변환·랜드마크·NPC를 첫 번째로 기여해 주시면 <b>${region.name} 개척자(Pioneer)</b>로 월드에 영구 등재됩니다.</p>
      <div class="gate-toast-actions">
        <a href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="gate-toast-btn primary">GitHub 기여 가이드 보기</a>
        <button type="button" class="gate-toast-btn" data-enter-now="1">정자동 먼저 입장하기</button>
      </div>`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 12000);
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('.gate-toast-close')) {
      toast.hidden = true;
      return;
    }
    if (e.target.closest('[data-enter-now]')) {
      toast.hidden = true;
      enter();
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
    if (!drag) {
      globe.rotation.y += dt * 0.22;
    }
    halo.scale.setScalar(1 + Math.sin(t * 0.004) * 0.35);
    globe.updateMatrixWorld(true);
    camDir.copy(camera.position).normalize();

    const world = pin.getWorldPosition(ndc);
    const facing = world.clone().normalize().dot(camDir) > 0.35;
    label.hidden = !facing;
    if (facing) {
      world.project(camera);
      label.style.left = `${(world.x * 0.5 + 0.5) * canvas.clientWidth}px`;
      label.style.top = `${(-world.y * 0.5 + 0.5) * canvas.clientHeight}px`;
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
    if (local.angleTo(spot) < 0.12) enter();
  });
  canvas.addEventListener('pointercancel', clearDrag);
  canvas.addEventListener('lostpointercapture', clearDrag);
  addEventListener('blur', clearDrag);
  label.addEventListener('click', enter);
  fit();
  addEventListener('resize', onResize);
  requestAnimationFrame(loop);
}
