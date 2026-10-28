// 입장 전 닉네임 + 외형 선택. 고르기 전에는 프레즌스에 접속하지 않는다.
import * as THREE from 'three';
import { createAvatar } from './entities/avatar.js';
import { LOOK_CHOICES, OUTFIT_COLORS, PROFILE_KEY, sanitizeLook } from './look.js';

const ENTER_LINES = [
  '정자역 광장으로 걸어 들어가는 중',
  '정류장에 버스를 세우는 중',
  '카카오바이크를 길가에 두는 중',
  '밤 거리의 불을 켜는 중',
  '지인을 만날 자리를 찾는 중',
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
      <p class="enter-line" role="status" aria-live="polite"></p>
      <div class="enter-track" aria-hidden="true"><div class="enter-fill"></div></div>
    </div>`;
  document.body.appendChild(root);
  const line = root.querySelector('.enter-line');
  const fill = root.querySelector('.enter-fill');
  let creepRaf = 0;
  let lineTimer = 0;
  let running = false;
  let started = 0;
  let progress = 0;
  let token = 0;

  const paint = () => { fill.style.width = `${progress * 100}%`; };
  const creep = (elapsed) => Math.min(0.95, 0.95 * (1 - Math.exp(-(elapsed / 1000) / 0.7)));
  const stopCreep = () => { running = false; cancelAnimationFrame(creepRaf); };

  return {
    show() {
      if (running || !root.hidden) return;
      const mine = ++token;
      running = true;
      progress = 0;
      started = performance.now();
      paint();
      let i = 0;
      line.textContent = ENTER_LINES[0];
      clearInterval(lineTimer);
      lineTimer = setInterval(() => {
        i = (i + 1) % ENTER_LINES.length;
        line.textContent = ENTER_LINES[i];
      }, ENTER_LINE_MS);
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
      const wait = Math.max(0, ENTER_MIN_MS - (performance.now() - started));
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
function getEnterScreen() {
  if (!enterScreen) enterScreen = createEnterScreen();
  return enterScreen;
}

export function openLobby({ sms, onJoin, onBack }) {
  const saved = readProfile();
  const look = sanitizeLook({ hair: 'short', top: 'hoodie', ...(saved?.look || {}) });
  const root = document.getElementById('lobby');
  root.innerHTML = `
    <form id="lobby-card" autocomplete="off">
      <div id="lobby-preview"></div>
      <div id="lobby-fields">
        <div class="lobby-top-bar">
          <h1>정자역에 입장</h1>
          <button type="button" id="lobby-back-globe" class="lobby-back-btn">🌏 지구본으로</button>
        </div>
        <p class="sub">닉네임과 모습을 고르거나, 기존 번호로 이어서 들어오세요.</p>
        <div class="lobby-tabs" role="tablist">
          <button type="button" class="tab on" data-mode="join" role="tab" aria-selected="true">내 캐릭터 입장</button>
          <button type="button" class="tab" data-mode="login" role="tab" aria-selected="false">기존 번호로 이어하기</button>
        </div>
        <div id="lobby-pane-join">
          <div class="lobby-row2">
            <label class="nick">닉네임
              <input id="nick" maxlength="16" placeholder="어떤 이름으로 만날까요?" />
            </label>
            <label class="nick">재입장 PIN <small>(숫자 4~6자리)</small>
              <input id="lobby-pin" type="password" inputmode="numeric" maxlength="6" placeholder="다른 기기 이어하기용" />
            </label>
          </div>
          <p id="lobby-phone" class="phone-no">번호 받는 중…</p>
          <div id="lobby-picks"></div>
          <div class="pick-label">옷 색</div>
          <div id="color-picks" class="pick"></div>
        </div>
        <div id="lobby-pane-login" hidden>
          <p class="login-guide">이전에 발급받은 휴대폰 번호와 설정해 둔 PIN(4~6자리)을 입력하면 닉네임·외형·위치·메시지를 그대로 이어받습니다.</p>
          <label class="nick">휴대폰 번호
            <input id="login-phone" inputmode="numeric" maxlength="13" placeholder="010-2000-0001" />
          </label>
          <label class="nick" style="margin-top:10px">비밀번호 (PIN 4~6자리)
            <input id="login-pin" type="password" inputmode="numeric" maxlength="6" placeholder="설정한 숫자 4~6자리" />
          </label>
          <button type="button" id="lobby-load" class="sub-btn">내 캐릭터 불러오기 (미리보기)</button>
        </div>
        <p id="lobby-error"></p>
        <button type="submit" id="lobby-go">입장하기</button>
      </div>
    </form>`;

  let mode = 'join';
  const nick = root.querySelector('#nick');
  const pinInput = root.querySelector('#lobby-pin');
  const loginPhone = root.querySelector('#login-phone');
  const loginPin = root.querySelector('#login-pin');
  const paneJoin = root.querySelector('#lobby-pane-join');
  const paneLogin = root.querySelector('#lobby-pane-login');
  const loadBtn = root.querySelector('#lobby-load');
  nick.value = saved?.name || (sms?.off ? '로컬테스터' : '');
  if (saved?.display || saved?.phone) loginPhone.value = saved.display || saved.phone;
  const error = root.querySelector('#lobby-error');
  const picks = root.querySelector('#lobby-picks');

  for (const choice of LOOK_CHOICES) {
    const row = document.createElement('div');
    row.className = 'pick-row';
    row.innerHTML = `<div class="pick-label">${choice.label}</div>`;
    const wrap = document.createElement('div');
    wrap.className = 'pick';
    const current = choice.key === 'glasses' ? (look.glasses ? '1' : '0') : look[choice.key];
    for (const [value, label] of choice.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.k = choice.key;
      b.dataset.v = value;
      if (value === current) b.classList.add('on');
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((el) => el.classList.toggle('on', el === b));
        if (choice.key === 'glasses') look.glasses = value === '1';
        else look[choice.key] = value;
        show();
      });
      wrap.appendChild(b);
    }
    row.appendChild(wrap);
    picks.appendChild(row);
  }

  const colors = root.querySelector('#color-picks');
  for (const color of OUTFIT_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (color === look.color ? ' on' : '');
    b.style.background = color;
    b.title = color;
    b.addEventListener('click', () => {
      colors.querySelectorAll('button').forEach((el) => el.classList.toggle('on', el === b));
      look.color = color;
      show();
    });
    colors.appendChild(b);
  }

  const view = root.querySelector('#lobby-preview');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  view.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a2744');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0.35, 1.2, 2.85);
  camera.lookAt(0, 1.12, 0);
  scene.add(new THREE.HemisphereLight('#d4e2ff', '#1a1612', 1.15));
  const sun = new THREE.DirectionalLight('#fff6e4', 1.45);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.3, 28), new THREE.MeshLambertMaterial({ color: '#243044' }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01;
  scene.add(floor);

  let avatar = null, spin = 0, raf = 0;
  const show = () => {
    if (avatar) scene.remove(avatar);
    avatar = createAvatar(sanitizeLook(look));
    scene.add(avatar);
  };
  const fit = () => {
    const w = view.clientWidth || 240, h = view.clientHeight || 320;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  const loop = () => {
    raf = requestAnimationFrame(loop);
    spin += 0.012;
    if (avatar) avatar.rotation.y = Math.sin(spin) * 0.65;
    renderer.render(scene, camera);
  };
  show();
  fit();
  loop();
  const onResize = () => fit();
  addEventListener('resize', onResize);
  nick.focus();

  const phoneLine = root.querySelector('#lobby-phone');
  const go = root.querySelector('#lobby-go');
  const backBtn = root.querySelector('#lobby-back-globe');
  const pickedLook = () => sanitizeLook({ ...look, hair: look.hair || 'short' });

  const cleanupLobby = () => {
    ticket += 1;
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    renderer.dispose();
  };

  backBtn?.addEventListener('click', () => {
    if (joining) return;
    cleanupLobby();
    onBack?.();
  });

  const syncLookButtons = () => {
    picks.querySelectorAll('button[data-k]').forEach((b) => {
      const k = b.dataset.k;
      const cur = k === 'glasses' ? (look.glasses ? '1' : '0') : look[k];
      b.classList.toggle('on', b.dataset.v === cur);
    });
    colors.querySelectorAll('button.swatch').forEach((b) => {
      b.classList.toggle('on', b.title === look.color);
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

  const showNumber = (session) => {
    if (session?.off) {
      const again = session?.place ? ' · 지난 위치에서 이어집니다' : '';
      phoneLine.textContent = `🧪 로컬 테스트 모드 (실서버 계정 미생성)${again}`;
      return;
    }
    const again = session?.place ? ' · 지난 위치에서 이어집니다' : '';
    const pinBadge = session?.hasPin ? ' · PIN 설정됨' : ' · PIN 미설정';
    phoneLine.textContent = session?.display ? `내 번호 ${session.display}${again}${pinBadge}` : '번호 받는 중…';
    if (pinInput) {
      pinInput.placeholder = session?.hasPin ? '변경 시 숫자 4~6자리 입력' : '다른 기기 이어하기용';
    }
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
    go.textContent = mode === 'login' ? '인증하고 입장하기' : '입장하기';
    if (mode === 'login') loginPhone.focus();
    else nick.focus();
  };

  root.querySelectorAll('.lobby-tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => setLobbyMode(btn.dataset.mode));
  });

  loadBtn.addEventListener('click', async () => {
    const phone = loginPhone.value.trim();
    const pin = loginPin.value.trim();
    if (!phone) { error.textContent = '휴대폰 번호를 입력해 주세요.'; loginPhone.focus(); return; }
    if (!/^\d{4,6}$/.test(pin)) { error.textContent = '비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.'; loginPin.focus(); return; }
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
    return sms.enter({ name: name || nick.value.trim() || '손님', look: pickedLook(), pin, preview }).then((session) => {
      if (mine === ticket) showNumber(session);
      return session;
    });
  };
  issue(saved?.name, true).catch((err) => { phoneLine.textContent = err.message; });

  let joining = false;
  root.querySelector('#lobby-card').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (joining) return;

    if (mode === 'login') {
      const phone = loginPhone.value.trim();
      const pin = loginPin.value.trim();
      if (!phone) { error.textContent = '휴대폰 번호를 입력해 주세요.'; loginPhone.focus(); return; }
      if (!/^\d{4,6}$/.test(pin)) { error.textContent = '비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.'; loginPin.focus(); return; }
      error.textContent = '';
      joining = true;
      go.disabled = true;
      const screen = getEnterScreen();
      screen.show();
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
      const name = session.name || '손님';
      const picked = sanitizeLook(session.look || pickedLook());
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, look: picked, phone: session.phone, display: session.display })); } catch {}
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      renderer.dispose();
      onJoin(name, picked, session);
      await screen.finish();
      return;
    }

    const name = nick.value.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!name) { error.textContent = '닉네임을 입력해 주세요.'; nick.focus(); return; }
    const pin = pinInput.value.trim();
    if (pin && !/^\d{4,6}$/.test(pin)) {
      error.textContent = '비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.';
      pinInput.focus();
      return;
    }
    error.textContent = '';
    joining = true;
    go.disabled = true;
    const screen = getEnterScreen();
    screen.show();
    let session;
    try { session = await issue(name, false, pin || undefined); }
    catch (err) {
      screen.cancel();
      error.textContent = err.message;
      go.disabled = false;
      joining = false;
      return;
    }
    const picked = session.look || pickedLook();
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, look: picked, phone: session.phone, display: session.display })); } catch { /* 저장이 막혀 있어도 입장은 된다 */ }
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    renderer.dispose();
    onJoin(name, picked, session);
    await screen.finish();
  });
}
