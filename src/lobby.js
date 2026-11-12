// 입장 전 닉네임 + 외형 선택. 고르기 전에는 프레즌스에 접속하지 않는다.
import * as THREE from 'three';
import { releaseRenderer } from './releaseRenderer.js';
import { createAvatar } from './entities/avatar.js';
import { LOOK_CHOICES, LOOK_TABS, COLOR_FIELDS, PROFILE_KEY, sanitizeLook } from './look.js';
import { isEn, tr, toggleLang, onLangChange } from './i18n.js';
import { accountsOn } from './account/flags.js'; // [accounts] 가벼운 스위치만 — 계정 입장 UI 는 켜졌을 때만 동적으로

const ENTER_LINES = [
  '정자역 광장으로 걸어 들어가는 중',
  '정류장에 버스를 세우는 중',
  '카카오바이크를 길가에 두는 중',
  '밤 거리의 불을 켜는 중',
  '지인을 만날 자리를 찾는 중',
];
const ENTER_LINES_EN = [
  'Entering the 3D neighborhood…',
  'Preparing streets and landmarks…',
  'Parking bikes along the sidewalk…',
  'Lighting up the evening streets…',
  'Connecting to multiplayer relay…',
];
const ENTER_MIN_MS = 1200;
const ENTER_LINE_MS = 700;

function readProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; }
}

function createEnterScreen() {
  const root = document.createElement('div');
  root.id = 'enter-loading';
  root.hidden = true;
  root.innerHTML = `
    <div class="enter-card">
      <div class="enter-flight" hidden>
        <div class="enter-airport from">
          <span class="code"></span>
          <span class="city"></span>
        </div>
        <div class="enter-sky-track" aria-hidden="true">
          <div class="enter-sky-line"></div>
          <span class="enter-plane">✈️</span>
        </div>
        <div class="enter-airport to">
          <span class="code"></span>
          <span class="city"></span>
        </div>
      </div>
      <p class="enter-line" role="status" aria-live="polite"></p>
      <div class="enter-track" aria-hidden="true"><div class="enter-fill"></div></div>
    </div>`;
  document.body.appendChild(root);
  const card = root.querySelector('.enter-card');
  const flightBox = root.querySelector('.enter-flight');
  const fromCode = root.querySelector('.enter-airport.from .code');
  const fromCity = root.querySelector('.enter-airport.from .city');
  const toCode = root.querySelector('.enter-airport.to .code');
  const toCity = root.querySelector('.enter-airport.to .city');
  const planeEl = root.querySelector('.enter-plane');
  const line = root.querySelector('.enter-line');
  const fill = root.querySelector('.enter-fill');
  let creepRaf = 0;
  let lineTimer = 0;
  let running = false;
  let started = 0;
  let progress = 0;
  let minDuration = ENTER_MIN_MS;
  let token = 0;

  let isFlightMode = false;
  let activeLines = ENTER_LINES;

  const paint = () => {
    const pct = `${progress * 100}%`;
    fill.style.width = pct;
    if (planeEl) planeEl.style.left = `${Math.min(96, Math.max(4, progress * 92 + 4))}%`;
    if (isFlightMode && activeLines.length > 0) {
      const idx = Math.min(activeLines.length - 1, Math.floor(progress * activeLines.length));
      if (line.textContent !== activeLines[idx]) {
        line.textContent = activeLines[idx];
      }
    }
  };
  const creep = (elapsed) => {
    if (isFlightMode) {
      // 비행 모드: minDuration 동안 0 -> 0.92 까지 일정하고 여유 있게 순항
      const linear = Math.min(1, elapsed / Math.max(1000, minDuration));
      return Math.min(0.94, linear * 0.92);
    }
    return Math.min(0.95, 0.95 * (1 - Math.exp(-(elapsed / 1000) / 0.7)));
  };
  const stopCreep = () => { running = false; cancelAnimationFrame(creepRaf); };

  return {
    show(customLines = null, opts = null) {
      if (running || !root.hidden) return;
      const en = isEn();
      const flight = opts?.flight || null;
      if (flight?.from && flight?.to) {
        isFlightMode = true;
        card.classList.add('is-flight');
        flightBox.hidden = false;
        fromCode.textContent = `${flight.from.flag || '🛫'} ${flight.from.airportCode || 'DEP'}`;
        fromCity.textContent = en ? (flight.from.enAirportName || flight.from.enShortName || flight.from.shortName) : (flight.from.airportName || flight.from.shortName);
        toCode.textContent = `${flight.to.flag || '🛬'} ${flight.to.airportCode || 'ARR'}`;
        toCity.textContent = en ? (flight.to.enAirportName || flight.to.enShortName || flight.to.shortName) : (flight.to.airportName || flight.to.shortName);
        minDuration = opts?.minMs || 3600;
      } else {
        isFlightMode = false;
        card.classList.remove('is-flight');
        flightBox.hidden = true;
        minDuration = opts?.minMs || ENTER_MIN_MS;
      }
      const fallback = en ? ENTER_LINES_EN : ENTER_LINES;
      const lines = Array.isArray(customLines) && customLines.length ? customLines : fallback;
      activeLines = lines;
      const mine = ++token;
      running = true;
      progress = opts?.startProgress || 0;
      started = performance.now() - (progress * minDuration);
      line.textContent = lines[0];
      paint();
      clearInterval(lineTimer);
      if (!isFlightMode) {
        let i = 0;
        lineTimer = setInterval(() => {
          i = (i + 1) % lines.length;
          line.textContent = lines[i];
        }, ENTER_LINE_MS);
      }
      root.hidden = false;
      const tick = (now) => {
        if (!running || mine !== token) return;
        progress = creep(now - started);
        paint();
        creepRaf = requestAnimationFrame(tick);
      };
      creepRaf = requestAnimationFrame(tick);
    },
    cancel() {
      token += 1;
      stopCreep();
      clearInterval(lineTimer);
      root.hidden = true;
      progress = 0;
      paint();
    },
    async finish() {
      const mine = token;
      const wait = Math.max(0, minDuration - (performance.now() - started));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (!running || mine !== token) return;
      stopCreep();
      const from = Math.min(progress, 0.95);
      const t0 = performance.now();
      await new Promise((resolve) => {
        const step = (now) => {
          if (mine !== token) { resolve(); return; }
          const k = Math.min(1, (now - t0) / 320);
          progress = from + (1 - from) * (1 - (1 - k) ** 2);
          paint();
          if (k < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      if (mine !== token) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (mine !== token) return;
      clearInterval(lineTimer);
      root.hidden = true;
      progress = 0;
      paint();
    },
  };
}

let enterScreen;
export function getEnterScreen() {
  if (!enterScreen) enterScreen = createEnterScreen();
  return enterScreen;
}

export function openLobby({ sms, region = null, onJoin, onBack }) {
  const saved = readProfile();
  const look = sanitizeLook({ hair: 'short', top: 'hoodie', ...(saved?.look || {}) });
  const root = document.getElementById('lobby');
  root.innerHTML = `
    <form id="lobby-card" autocomplete="off">
      <div id="lobby-preview"></div>
      <div id="lobby-fields">
        <div class="lobby-top-bar">
          <h1 id="lobby-title"></h1>
          <div style="display:flex;gap:6px;align-items:center">
            <button type="button" id="lobby-lang-btn" class="lobby-back-btn"></button>
            <button type="button" id="lobby-back-globe" class="lobby-back-btn"></button>
          </div>
        </div>
        <p id="lobby-sub" class="sub"></p>
        <div id="lobby-acct" hidden>
          <div class="lobby-acct-who"><b id="lobby-acct-name"></b><span id="lobby-acct-note"></span></div>
          <button type="button" id="lobby-acct-edit" class="sub-btn"></button>
        </div>
        <div class="lobby-tabs" role="tablist">
          <button type="button" id="lobby-tab-join" class="tab on" data-mode="join" role="tab" aria-selected="true"></button>
          <button type="button" id="lobby-tab-login" class="tab" data-mode="login" role="tab" aria-selected="false"></button>
        </div>
        <div id="lobby-pane-join">
          <div class="lobby-row2">
            <label class="nick"><span id="lobby-nick-lbl"></span>
              <input id="nick" maxlength="16" />
            </label>
            <label class="nick lobby-pin-field"><span id="lobby-pin-lbl"></span>
              <input id="lobby-pin" type="password" inputmode="numeric" maxlength="6" />
            </label>
          </div>
          <p id="lobby-phone" class="phone-no"></p>
          <div id="lobby-look-tabs" class="look-tabs" role="tablist"></div>
          <div id="lobby-picks"></div>
        </div>
        <div id="lobby-pane-login" hidden>
          <p id="lobby-login-guide" class="login-guide"></p>
          <label class="nick"><span id="lobby-login-phone-lbl"></span>
            <input id="login-phone" inputmode="numeric" maxlength="13" placeholder="010-2000-0001" />
          </label>
          <label class="nick" style="margin-top:10px"><span id="lobby-login-pin-lbl"></span>
            <input id="login-pin" type="password" inputmode="numeric" maxlength="6" />
          </label>
          <button type="button" id="lobby-load" class="sub-btn"></button>
        </div>
        <p id="lobby-error"></p>
        <button type="submit" id="lobby-go"></button>
      </div>
    </form>`;

  let mode = 'join';
  let lastSession = null;
  const nick = root.querySelector('#nick');
  const pinInput = root.querySelector('#lobby-pin');
  const loginPhone = root.querySelector('#login-phone');
  const loginPin = root.querySelector('#login-pin');
  const paneJoin = root.querySelector('#lobby-pane-join');
  const paneLogin = root.querySelector('#lobby-pane-login');
  const loadBtn = root.querySelector('#lobby-load');
  const phoneLine = root.querySelector('#lobby-phone');
  const go = root.querySelector('#lobby-go');
  const backBtn = root.querySelector('#lobby-back-globe');
  const langBtn = root.querySelector('#lobby-lang-btn');
  const error = root.querySelector('#lobby-error');
  const picks = root.querySelector('#lobby-picks');

  const defaultLocalNick = () => (isEn() ? 'Explorer' : '로컬테스터');
  nick.value = saved?.name || (sms?.off ? defaultLocalNick() : '');
  if (saved?.display || saved?.phone) loginPhone.value = saved.display || saved.phone;

  let lookTab = 'basic';
  const lookTabBar = root.querySelector('#lobby-look-tabs');

  function renderLookTabs() {
    lookTabBar.innerHTML = '';
    for (const tab of LOOK_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'look-tab' + (tab.id === lookTab ? ' on' : '');
      b.dataset.lookTab = tab.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', tab.id === lookTab ? 'true' : 'false');
      b.textContent = tr(tab.label, tab.enLabel);
      b.addEventListener('click', () => {
        if (lookTab === tab.id) return;
        lookTab = tab.id;
        renderLookTabs();
        renderLookPane();
        updateFrameGoal();
      });
      lookTabBar.appendChild(b);
    }
  }

  function renderLookPane() {
    const en = isEn();
    picks.innerHTML = '';
    if (lookTab === 'color') {
      for (const field of COLOR_FIELDS) {
        const row = document.createElement('div');
        row.className = 'pick-row';
        row.innerHTML = `<div class="pick-label">${en ? field.enLabel : field.label}</div>`;
        const wrap = document.createElement('div');
        wrap.className = 'pick';
        wrap.dataset.colorKey = field.key;
        const cur = String(look[field.key] || '').toLowerCase();
        for (const color of field.colors) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'swatch' + (color.toLowerCase() === cur ? ' on' : '');
          b.style.background = color;
          b.title = color;
          b.addEventListener('click', () => {
            wrap.querySelectorAll('button').forEach((el) => el.classList.toggle('on', el === b));
            look[field.key] = color;
            show();
          });
          wrap.appendChild(b);
        }
        row.appendChild(wrap);
        picks.appendChild(row);
      }
      return;
    }
    for (const choice of LOOK_CHOICES) {
      if ((choice.tab || 'basic') !== lookTab) continue;
      const row = document.createElement('div');
      row.className = 'pick-row';
      row.innerHTML = `<div class="pick-label">${en ? (choice.enLabel || choice.label) : choice.label}</div>`;
      const wrap = document.createElement('div');
      wrap.className = 'pick';
      const current = String(look[choice.key] ?? '');
      for (const [value, koLbl, enLbl] of choice.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = en ? (enLbl || koLbl) : koLbl;
        b.dataset.k = choice.key;
        b.dataset.v = value;
        if (value === current) b.classList.add('on');
        b.addEventListener('click', () => {
          wrap.querySelectorAll('button').forEach((el) => el.classList.toggle('on', el === b));
          look[choice.key] = value;
          show();
        });
        wrap.appendChild(b);
      }
      row.appendChild(wrap);
      picks.appendChild(row);
    }
  }

  const view = root.querySelector('#lobby-preview');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  view.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a2744');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0.35, 1.2, 2.85);
  const camFrom = new THREE.Vector3(0.35, 1.2, 2.85);
  const camLook = new THREE.Vector3(0, 1.12, 0);
  const camTo = camFrom.clone();
  const lookTo = camLook.clone();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();
  const _box = new THREE.Box3();
  camera.lookAt(camLook);
  scene.add(new THREE.HemisphereLight('#d4e2ff', '#1a1612', 1.15));
  const sun = new THREE.DirectionalLight('#fff6e4', 1.45);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.3, 28), new THREE.MeshLambertMaterial({ color: '#243044' }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01;
  scene.add(floor);

  let avatar = null, spin = 0, raf = 0, snapFrame = true;
  function updateFrameGoal() {
    if (!avatar) return;
    const prevY = avatar.rotation.y;
    avatar.rotation.y = 0;
    avatar.updateMatrixWorld(true);
    _box.setFromObject(avatar);
    avatar.rotation.y = prevY;
    avatar.updateMatrixWorld(true);
    if (!Number.isFinite(_box.min.y) || !Number.isFinite(_box.max.y)) return;
    _box.min.y = Math.min(_box.min.y, 0) - 0.06;
    _box.max.y += 0.08;
    _box.getSize(_size);
    _box.getCenter(_center);
    const face = lookTab === 'face';
    let targetY = _center.y;
    let height = Math.max(_size.y, 0.9);
    let width = Math.max(_size.x, _size.z * 0.5, 0.45);
    if (face) {
      const top = _box.max.y;
      const chin = 1.16;
      targetY = (top + chin) * 0.5;
      height = Math.max(0.7, top - chin);
      width = 0.4;
    }
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = Math.max(0.45, camera.aspect || 1);
    const pad = face ? 1.18 : 1.24;
    const distH = (height * 0.5) / Math.tan(vFov / 2);
    const distW = (width * 0.5) / (Math.tan(vFov / 2) * aspect);
    const dist = Math.max(distH, distW) * pad + 0.2;
    lookTo.set(0, targetY, 0);
    camTo.set(dist * 0.1, targetY, dist);
  }
  const show = () => {
    if (avatar) scene.remove(avatar);
    avatar = createAvatar(sanitizeLook(look));
    scene.add(avatar);
    updateFrameGoal();
  };
  const fit = () => {
    const w = Math.max(1, view.clientWidth || 240);
    const h = Math.max(1, view.clientHeight || 320);
    const prevAspect = camera.aspect;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateFrameGoal();
    if (Math.abs(prevAspect - camera.aspect) > 0.05) snapFrame = true;
  };
  let lastTick = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.2, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    spin += dt * 0.72;
    if (avatar) avatar.rotation.y = Math.sin(spin) * 0.65;
    const k = snapFrame ? 1 : 1 - Math.exp(-dt / 0.16);
    snapFrame = false;
    camFrom.lerp(camTo, k);
    camLook.lerp(lookTo, k);
    camera.position.copy(camFrom);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  };
  show();
  fit();
  loop();
  const onResize = () => fit();
  addEventListener('resize', onResize);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  ro?.observe(view);

  const pickedLook = () => sanitizeLook({ ...look, hair: look.hair || 'short' });

  const showNumber = (session) => {
    if (session) lastSession = session;
    const s = session || lastSession;
    const en = isEn();
    if (s?.off) {
      const again = s?.place ? (en ? ' · Resumes at last position' : ' · 지난 위치에서 이어집니다') : '';
      phoneLine.textContent = en
        ? `🧪 Local Test Mode (No server account needed)${again}`
        : `🧪 로컬 테스트 모드 (실서버 계정 미생성)${again}`;
      return;
    }
    const again = s?.place ? (en ? ' · Resumes at last position' : ' · 지난 위치에서 이어집니다') : '';
    const pinBadge = s?.hasPin ? (en ? ' · PIN set' : ' · PIN 설정됨') : (en ? ' · No PIN' : ' · PIN 미설정');
    phoneLine.textContent = s?.display
      ? (en ? `My Number ${s.display}${again}${pinBadge}` : `내 번호 ${s.display}${again}${pinBadge}`)
      : (en ? 'Assigning virtual number…' : '번호 받는 중…');
    if (pinInput) {
      pinInput.placeholder = s?.hasPin
        ? (en ? '4–6 digits to change PIN' : '변경 시 숫자 4~6자리 입력')
        : (en ? 'For cross-device login' : '다른 기기 이어하기용');
    }
  };

  // [accounts] 구글 계정으로 로그인돼 있으면(/auth/me) 번호·PIN·캐릭터 고르기 없이 계정 캐릭터로 바로 입장.
  //   acct = null(게스트 — 지금 흐름 그대로) | { me, hasChar, editing, place }
  //   계정 캐릭터 = 번호부의 대표 캐릭터(me.primaryUserId). 아직 없으면(첫 로그인) 편집기를 PIN 없이 한 번 보여 주고, 입장할 때 계정에 저장한다.
  let acct = null;
  const card = root.querySelector('#lobby-card');
  const acctBox = root.querySelector('#lobby-acct');
  const acctEdit = root.querySelector('#lobby-acct-edit');
  function renderAccount() {
    const on = !!acct;
    card.classList.toggle('is-account', on);
    if (on) document.body.classList.add('bw-signed-in'); // ui-v2 상단 칩·로딩 문구가 '게스트' 대신 계정으로 (계정 세션은 입장 뒤에도 그대로)
    acctBox.hidden = !on;
    if (!on) return;
    const en = isEn();
    const who = acct.me?.account?.email || acct.me?.account?.name || '';
    root.querySelector('#lobby-sub').textContent = acct.hasChar
      ? tr('Google 계정으로 로그인됨 · 저장된 캐릭터로 바로 들어가요.', 'Signed in with Google · jump in with your saved character.')
      : tr('Google 계정으로 로그인됨 · 처음이네요! 캐릭터를 만들면 계정에 저장돼요.', 'Signed in with Google · first time here! Your character is saved to your account.');
    root.querySelector('#lobby-acct-name').textContent = nick.value.trim() || (acct.me?.account?.name || '');
    const again = acct.place ? (en ? ' · Resumes at last position' : ' · 지난 위치에서 이어집니다') : '';
    root.querySelector('#lobby-acct-note').textContent = `${en ? 'Google account' : 'Google 계정'}${who ? ` · ${who}` : ''}${again}`;
    acctEdit.hidden = !acct.hasChar;
    acctEdit.textContent = acct.editing ? tr('캐릭터 바꾸기 접기', 'Hide character editor') : tr('캐릭터 바꾸기', 'Change character');
    paneJoin.hidden = !acct.editing;
    paneLogin.hidden = true;
    mode = 'join';
    go.textContent = tr('입장하기', 'Enter World');
  }
  acctEdit.addEventListener('click', () => {
    if (!acct) return;
    acct.editing = !acct.editing;
    renderAccount();
    if (acct.editing) nick.focus();
  });
  nick.addEventListener('input', () => { if (acct) root.querySelector('#lobby-acct-name').textContent = nick.value.trim(); });

  function renderLobbyLocale() {
    const en = isEn();
    const title = en
      ? (region?.enLobbyTitle || region?.lobbyTitle || 'Enter World')
      : (region?.lobbyTitle || '정자역에 입장');
    root.querySelector('#lobby-title').textContent = title;
    if (langBtn) langBtn.textContent = en ? '🌐 KO' : '🌐 EN';
    if (backBtn) backBtn.textContent = tr('🌏 지구본으로', '🌏 Globe');
    root.querySelector('#lobby-sub').textContent = tr(
      '닉네임과 모습을 고르거나, 기존 번호로 이어서 들어오세요.',
      'Choose your nickname and look, or resume with your virtual phone number.',
    );
    root.querySelector('#lobby-tab-join').textContent = tr('내 캐릭터 입장', 'Join with Avatar');
    root.querySelector('#lobby-tab-login').textContent = tr('기존 번호로 이어하기', 'Resume with Number');
    root.querySelector('#lobby-nick-lbl').textContent = tr('닉네임', 'Nickname');
    nick.placeholder = tr('어떤 이름으로 만날까요?', 'What should people call you?');
    if (nick.value === '로컬테스터' && en) nick.value = 'Explorer';
    else if (nick.value === 'Explorer' && !en) nick.value = '로컬테스터';
    root.querySelector('#lobby-pin-lbl').innerHTML = en
      ? 'Recovery PIN <small>(4–6 digits)</small>'
      : '재입장 PIN <small>(숫자 4~6자리)</small>';
    renderLookTabs();
    root.querySelector('#lobby-login-guide').textContent = tr(
      '이전에 발급받은 휴대폰 번호와 설정해 둔 PIN(4~6자리)을 입력하면 닉네임·외형·위치·메시지를 그대로 이어받습니다.',
      'Enter your previously issued virtual phone number and PIN (4–6 digits) to restore your nickname, avatar, position, and messages.',
    );
    root.querySelector('#lobby-login-phone-lbl').textContent = tr('휴대폰 번호', 'Virtual Phone Number');
    root.querySelector('#lobby-login-pin-lbl').textContent = tr('비밀번호 (PIN 4~6자리)', 'PIN (4–6 digits)');
    loginPin.placeholder = tr('설정한 숫자 4~6자리', 'Enter your 4–6 digit PIN');
    loadBtn.textContent = tr('내 캐릭터 불러오기 (미리보기)', 'Load My Avatar (Preview)');
    go.textContent = mode === 'login'
      ? tr('인증하고 입장하기', 'Verify & Enter')
      : tr('입장하기', 'Enter World');
    renderLookPane();
    showNumber();
    renderAccount();
  }

  const unsubLang = onLangChange(() => renderLobbyLocale());
  renderLobbyLocale();
  nick.focus();

  const cleanupLobby = () => {
    ticket += 1;
    unsubLang();
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    ro?.disconnect();
    // 미리보기 캔버스를 바로 떼어 forceContextLoss 가 숨은 로비에서 늦게 터지지 않게 한다
    try { renderer.domElement.remove(); } catch { /* */ }
    try { view.replaceChildren(); } catch { /* */ }
    releaseRenderer(renderer);
  };

  langBtn?.addEventListener('click', () => {
    toggleLang();
  });

  backBtn?.addEventListener('click', () => {
    if (joining) return;
    cleanupLobby();
    onBack?.();
  });

  const syncLookButtons = () => {
    picks.querySelectorAll('button[data-k]').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === String(look[b.dataset.k] ?? ''));
    });
    picks.querySelectorAll('.pick[data-color-key]').forEach((wrap) => {
      const cur = String(look[wrap.dataset.colorKey] || '').toLowerCase();
      wrap.querySelectorAll('button.swatch').forEach((b) => {
        b.classList.toggle('on', b.title.toLowerCase() === cur);
      });
    });
  };

  const applyLoadedSession = (session) => {
    if (!session) return;
    if (session.name) nick.value = session.name;
    if (session.look) {
      Object.assign(look, sanitizeLook(session.look));
      syncLookButtons();
      show();
    }
    showNumber(session);
  };

  const setLobbyMode = (next) => {
    mode = next;
    error.textContent = '';
    root.querySelectorAll('.lobby-tabs .tab').forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('on', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    paneJoin.hidden = mode !== 'join';
    paneLogin.hidden = mode !== 'login';
    go.textContent = mode === 'login'
      ? tr('인증하고 입장하기', 'Verify & Enter')
      : tr('입장하기', 'Enter World');
    if (mode === 'login') loginPhone.focus();
    else nick.focus();
  };

  root.querySelectorAll('.lobby-tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => setLobbyMode(btn.dataset.mode));
  });

  loadBtn.addEventListener('click', async () => {
    const phone = loginPhone.value.trim();
    const pin = loginPin.value.trim();
    if (!phone) {
      error.textContent = tr('휴대폰 번호를 입력해 주세요.', 'Please enter your phone number.');
      loginPhone.focus();
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      error.textContent = tr('비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.', 'PIN must be 4 to 6 digits.');
      loginPin.focus();
      return;
    }
    error.textContent = '';
    loadBtn.disabled = true;
    try {
      const session = await sms.login({ phone, pin });
      ticket += 1;
      applyLoadedSession(session);
      loginPin.value = '';
      setLobbyMode('join');
    } catch (err) {
      error.textContent = err.message;
    } finally {
      loadBtn.disabled = false;
    }
  });

  let ticket = 0;
  const issue = (name, preview, pin) => {
    const mine = ++ticket;
    const fallbackName = isEn() ? 'Guest' : '손님';
    return sms.enter({ name: name || nick.value.trim() || fallbackName, look: pickedLook(), pin, preview }).then((session) => {
      if (mine === ticket) showNumber(session);
      return session;
    });
  };
  const guestPreview = () => issue(saved?.name, true).catch((err) => { phoneLine.textContent = err.message; });
  if (!accountsOn()) guestPreview();
  else {
    // 계정 확인이 끝날 때까지(최대 2.5초) 탭·PIN 을 숨겨 둔다 → 게스트면 지금 화면 그대로, 로그인돼 있으면 계정 입장
    card.classList.add('is-acct-checking');
    import('./account/lobbyAccount.js')
      .then((m) => m.detectLobbyAccount({ sms, saved, look, fallbackName: isEn() ? 'Guest' : '손님' }))
      .catch(() => null)
      .then((found) => {
        card.classList.remove('is-acct-checking');
        if (!found || !root.contains(card)) { if (root.contains(card)) guestPreview(); return; }
        ticket += 1; // 게스트 미리보기가 늦게 와서 덮어쓰지 않게
        acct = { me: found.me, hasChar: found.hasChar, editing: !found.hasChar, place: found.session?.place || null };
        if (found.session) applyLoadedSession(found.session);
        else if (found.name) nick.value = found.name;
        if (found.look) { Object.assign(look, sanitizeLook(found.look)); syncLookButtons(); show(); }
        renderAccount();
      });
  }

  const getRegionEnterLines = () => {
    if (isEn()) return region?.enLobbyEnterLines || region?.lobbyEnterLines || ENTER_LINES_EN;
    return region?.lobbyEnterLines || ENTER_LINES;
  };

  let joining = false;
  root.querySelector('#lobby-card').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (joining) return;

    if (mode === 'login') {
      const phone = loginPhone.value.trim();
      const pin = loginPin.value.trim();
      if (!phone) {
        error.textContent = tr('휴대폰 번호를 입력해 주세요.', 'Please enter your phone number.');
        loginPhone.focus();
        return;
      }
      if (!/^\d{4,6}$/.test(pin)) {
        error.textContent = tr('비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.', 'PIN must be 4 to 6 digits.');
        loginPin.focus();
        return;
      }
      error.textContent = '';
      joining = true;
      go.disabled = true;
      const screen = getEnterScreen();
      screen.show(getRegionEnterLines());
      let session;
      try {
        session = await sms.login({ phone, pin });
      } catch (err) {
        screen.cancel();
        error.textContent = err.message;
        go.disabled = false;
        joining = false;
        return;
      }
      const name = session.name || (isEn() ? 'Guest' : '손님');
      const picked = sanitizeLook(session.look || pickedLook());
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, look: picked, phone: session.phone, display: session.display })); } catch {}
      cleanupLobby();
      await onJoin(name, picked, session); // [arrivefix] 역 입장이면 도착(최대 8초)까지 로딩 화면 유지
      await screen.finish();
      return;
    }

    const name = nick.value.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!name) {
      error.textContent = tr('닉네임을 입력해 주세요.', 'Please enter a nickname.');
      nick.focus();
      return;
    }
    const pin = acct ? '' : pinInput.value.trim(); // [accounts] 로그인 상태에선 PIN 을 묻지도 쓰지도 않는다
    if (pin && !/^\d{4,6}$/.test(pin)) {
      error.textContent = tr('비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.', 'PIN must be 4 to 6 digits.');
      pinInput.focus();
      return;
    }
    error.textContent = '';
    joining = true;
    go.disabled = true;
    const screen = getEnterScreen();
    screen.show(getRegionEnterLines());
    let session;
    try { session = await issue(name, false, pin || undefined); }
    catch (err) {
      screen.cancel();
      error.textContent = err.message;
      go.disabled = false;
      joining = false;
      return;
    }
    if (acct && !acct.hasChar) {
      // [accounts] 첫 로그인: 방금 만든 캐릭터를 계정의 대표 캐릭터로 (서버가 이 기기 캐릭터를 primary 로 잡는다)
      try { const m = await import('./account/lobbyAccount.js'); await m.saveFirstCharacter({ sms }); } catch { /* 실패해도 입장은 된다 */ }
    }
    const picked = session.look || pickedLook();
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, look: picked, phone: session.phone, display: session.display })); } catch { /* 저장이 막혀 있어도 입장은 된다 */ }
    cleanupLobby();
    await onJoin(name, picked, session); // [arrivefix]
    await screen.finish();
  });
}
