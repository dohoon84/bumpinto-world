// [accounts] 구글 로그인(GIS ID 토큰) 공용 함수 — 계정 칩(ui.js)과 ui-v2 의 registerGoogleSignIn 훅(econ serverClient)이 같이 쓴다.
//   - GIS 스크립트는 처음 부를 때만 받는다(?accounts=1 이 아니면 아무도 부르지 않음).
//   - One Tap 이 안 뜨는 환경(쿨다운·서드파티 쿠키 차단)을 위해 작은 창에 Google 공식 버튼을 그린다.
//   - 로컬(localhost·사설 LAN) + 서버 DEV_LOGIN=1 이면 같은 창에 '개발용 로그인' 버튼(POST /auth/dev)도 보인다 — 배포 주소에서는 서버가 404.
//   - 로그인 전에 필수 약관·개인정보처리방침 동의를 받고, 선택 마케팅 수신동의를 함께 보낸다.
import { tr } from '../i18n.js';
import { accountApi, accountBase } from './api.js';
import { GOOGLE_CLIENT_ID } from './flags.js';
import { mountConsentFields } from './consent.js';
import './account.css';

export const DEVICE_KEY = 'jeongja3d.device'; // src/sms.js 와 같은 키
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisPromise = null;
export function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('gis')));
      s.onerror = () => { gisPromise = null; reject(new Error('gis')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

export const currentDeviceId = () => { try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; } };

/** 서버가 정한 대표 캐릭터 id 가 지금 기기 id 와 다르면 바꾸고 새로고침(PIN 로그인과 같은 방식). 바꿨으면 true */
export function adoptPrimary(primaryUserId, { delayMs = 1200 } = {}) {
  const cur = currentDeviceId();
  if (!primaryUserId || primaryUserId === cur) return false;
  try { localStorage.setItem(DEVICE_KEY, primaryUserId); } catch { return false; }
  setTimeout(() => location.reload(), delayMs);
  return true;
}

// localhost · 사설 LAN(RFC1918, 같은 와이파이의 아이폰). 실제 허용은 서버가 정한다(/auth/config devLogin, DEV_LOGIN=1 일 때만)
export const isLocalHost = (h = location.hostname) => /^(localhost|\[::1\]|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(h);
const isLocal = () => isLocalHost();

export async function devLogin(deviceId, consent = {}) {
  const base = accountBase();
  if (!base) return { ok: false, error: 'offline' };
  try {
    const res = await fetch(`${base}/auth/dev`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, name: '개발 계정', sub: 'local', ...consent }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data, ok: !!data.ok && res.ok };
  } catch { return { ok: false, error: 'network' }; }
}

/**
 * 로그인 창을 띄우고 끝날 때까지 기다린다.
 * @returns {Promise<null | { ok: boolean, error?: string, account?: object, granted?: Array, link?: object, primaryUserId?: string }>}
 *   null = 사용자가 닫음
 */
export async function googleSignIn({ deviceId = currentDeviceId(), clientId } = {}) {
  const cfg = await accountApi.config().catch(() => null);
  if (cfg && cfg.ok === false && cfg.error) return { ok: false, error: cfg.error };
  if (cfg && cfg.enabled === false) return { ok: false, error: 'accounts_disabled' };
  const id = clientId || cfg?.clientId || GOOGLE_CLIENT_ID;
  const showDev = isLocal() && !!cfg?.devLogin;

  return new Promise((resolve) => {
    let done = false;
    const wrap = document.createElement('div');
    wrap.className = 'acct-signin';
    wrap.setAttribute('role', 'dialog');
    wrap.innerHTML = `<div class="acct-signin-card"><div class="acct-head"></div><div class="acct-fields"></div><div class="acct-gis"></div><div class="acct-gis-wait" hidden></div><div class="acct-msg" role="status"></div><div class="acct-actions"></div></div>`;
    const $ = (s) => wrap.querySelector(s);
    $('.acct-head').textContent = tr('Google 계정으로 로그인', 'Sign in with Google');
    const fields = mountConsentFields($('.acct-fields'), { cfg });
    const wait = $('.acct-gis-wait');
    wait.textContent = tr('위 필수 항목에 동의하면 로그인이 열려요.', 'Agree to the required items to enable sign-in.');
    const gis = $('.acct-gis');
    const finish = (v) => {
      if (done) return;
      done = true;
      try { window.google?.accounts?.id?.cancel(); } catch {}
      wrap.remove();
      resolve(v);
    };
    const onResult = (r) => {
      if (r?.ok) return finish(r);
      $('.acct-msg').textContent = tr(`로그인 실패 (${r?.error || '알 수 없음'})`, `Sign-in failed (${r?.error || 'unknown'})`);
    };
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'acct-btn'; close.textContent = tr('닫기', 'Close');
    close.addEventListener('click', () => finish(null));
    let devBtn = null;
    if (showDev) {
      devBtn = document.createElement('button');
      devBtn.type = 'button'; devBtn.className = 'acct-btn'; devBtn.textContent = tr('개발용 로그인 (로컬)', 'Dev sign-in (local)');
      devBtn.disabled = true;
      devBtn.addEventListener('click', async () => {
        if (!fields.requiredOk()) return;
        onResult(await devLogin(deviceId, fields.payload()));
      });
      $('.acct-actions').append(devBtn);
    }
    $('.acct-actions').append(close);
    document.body.appendChild(wrap);

    const setEnabled = (ok) => {
      gis.hidden = !ok;
      wait.hidden = ok;
      if (devBtn) devBtn.disabled = !ok;
    };
    fields.onChange(setEnabled);

    loadGis().then((google) => {
      if (done) return;
      google.accounts.id.initialize({
        client_id: id,
        callback: async (resp) => {
          if (!resp?.credential) return;
          if (!fields.requiredOk()) {
            $('.acct-msg').textContent = tr('필수 약관에 동의해 주세요.', 'Please agree to the required terms.');
            return;
          }
          $('.acct-msg').textContent = tr('확인 중…', 'Checking…');
          onResult(await accountApi.google(resp.credential, deviceId, fields.payload()));
        },
        ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true, context: 'signin',
      });
      google.accounts.id.renderButton(gis, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill' });
      // One Tap 은 필수 동의 전이면 띄우지 않는다
      fields.onChange((ok) => { if (ok && !done) { try { google.accounts.id.prompt(); } catch {} } });
    }).catch(() => {
      if (!done) $('.acct-msg').textContent = tr('구글 로그인 스크립트를 불러오지 못했어요.', 'Could not load Google sign-in.');
    });
  });
}
