// [accounts] 오른쪽 위 막대의 작은 로그인 칩 + 계정 패널. ?accounts=1 일 때만 game.js 가 동적으로 불러온다.
// 구글 로그인은 GIS ID 토큰 방식(팝업 / One Tap, redirect URI 없음). GIS 스크립트는 칩을 처음 누를 때만 받는다.
// 로그인 뒤 서버가 정한 대표 캐릭터 id 가 지금 기기 id 와 다르면, PIN 로그인과 같은 방식으로 기기 id 를 바꾸고 새로고침한다.
import { tr, isEn, onLangChange } from '../i18n.js';
import { accountApi } from './api.js';
import { GOOGLE_CLIENT_ID } from './flags.js';
import { googleSignIn, isLocalHost } from './signin.js';
import { ensureAccountConsent, fmtAgreedAt, legalHref } from './consent.js';
import './account.css';

const DEVICE_KEY = 'jeongja3d.device'; // src/sms.js 와 같은 키

const LINK_TEXT = {
  linked: () => tr('이 PC 를 계정에 연결했어요.', 'This PC is now linked to your account.'),
  already_linked: () => tr('이미 계정에 연결된 PC 예요.', 'This PC is already linked.'),
  linked_to_other_account: () =>
    tr('이 PC 는 다른 구글 계정에 연결돼 있어요. 이 PC 의 진행 상황은 옮기지 않았어요.', 'This PC is linked to a different Google account. Its progress was not moved.'),
  device_limit: () => tr('계정에 연결할 수 있는 PC 수(5대)를 넘었어요.', 'This account already has the maximum of 5 PCs.'),
  no_device: () => tr('기기 정보를 읽지 못했어요.', 'Could not read this device.'),
};

const ERR_TEXT = {
  accounts_disabled: () => tr('아직 로그인을 열지 않았어요.', 'Sign-in is not open yet.'),
  accounts_not_configured: () => tr('서버 설정이 아직 안 끝났어요.', 'The server is not configured yet.'),
  network: () => tr('서버에 연결하지 못했어요.', 'Could not reach the server.'),
  offline: () => tr('로컬 모드라 로그인할 수 없어요.', 'Sign-in is unavailable in local mode.'),
};
const errText = (e) => (ERR_TEXT[e] ? ERR_TEXT[e]() : tr(`로그인 실패 (${e || '알 수 없음'})`, `Sign-in failed (${e || 'unknown'})`));

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

/** @param {{ sms: { id: string } }} opts */
export function mountAccount({ sms } = {}) {
  const bar = document.getElementById('top-right-bar');
  if (!bar || document.getElementById('account-chip')) return null;
  const deviceId = () => sms?.id || localStorage.getItem(DEVICE_KEY) || '';

  const chip = document.createElement('button');
  chip.id = 'account-chip';
  chip.type = 'button';
  chip.className = 'board-launcher account-chip';
  chip.innerHTML = '<span class="board-icon" aria-hidden="true">👤</span><span class="board-label"></span>';
  const label = chip.querySelector('.board-label');
  bar.insertBefore(chip, bar.firstChild);

  const panel = document.createElement('div');
  panel.id = 'account-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="acct-head"></div>
    <div class="acct-body"></div>
    <div class="acct-gis" hidden></div>
    <div class="acct-msg" role="status"></div>
    <div class="acct-actions"></div>`;
  document.body.appendChild(panel);
  const $ = (sel) => panel.querySelector(sel);

  const state = { cfg: null, me: null, busy: false, msg: '' };

  function render() {
    const me = state.me;
    if (me?.account) {
      const bal = me.balance ? ` · ${fmt(me.balance.total)} bum` : '';
      label.textContent = `${me.account.name || tr('내 계정', 'Account')}${bal}`;
    } else {
      label.textContent = tr('로그인', 'Sign in');
    }
    chip.disabled = !!state.cfg && !state.cfg.enabled && !me;
    chip.title = chip.disabled ? tr('아직 로그인을 열지 않았어요', 'Sign-in is not open yet') : '';

    const head = $('.acct-head');
    const body = $('.acct-body');
    const actions = $('.acct-actions');
    actions.replaceChildren();
    if (me?.account) {
      head.textContent = me.account.name || tr('내 계정', 'My account');
      const rows = [];
      if (me.account.email) rows.push(`<div class="acct-row"><span>${tr('구글', 'Google')}</span><b></b></div>`);
      if (me.balance) {
        rows.push(`<div class="acct-row"><span>${tr('잔액', 'Balance')}</span><b>${fmt(me.balance.total)} bum</b></div>`);
      }
      rows.push(`<div class="acct-row"><span>${tr('연결된 PC', 'Linked PCs')}</span><b>${(me.devices || []).length}</b></div>`);
      if (me.stats) {
        const km = (me.stats.modes || []).reduce((a, r) => a + (r.m || 0), 0) / 1000;
        rows.push(`<div class="acct-row"><span>${tr('누적 이동', 'Distance')}</span><b>${km.toFixed(1)} km</b></div>`);
        rows.push(`<div class="acct-row"><span>${tr('접속한 날', 'Days played')}</span><b>${fmt(me.stats.loginDays)}</b></div>`);
      }
      body.innerHTML = rows.join('');
      const emailEl = body.querySelector('.acct-row b');
      if (me.account.email && emailEl) emailEl.textContent = me.account.email; // 사용자 값은 textContent 로만
      body.appendChild(consentPanel(me));
      actions.append(button(tr('로그아웃', 'Sign out'), logout));
    } else {
      head.textContent = tr('구글 계정으로 로그인', 'Sign in with Google');
      body.innerHTML = `<p class="acct-note">${tr(
        '로그인하면 여러 PC 에서 같은 캐릭터·선물·사진을 이어서 써요. 로그인 안 해도 지금처럼 놀 수 있어요.',
        'Sign in to keep the same character, gifts and photos across PCs. You can keep playing as a guest.',
      )}</p>`;
      actions.append(button(tr('구글로 계속', 'Continue with Google'), startLogin, 'primary'));
      // 로컬 시험(localhost·같은 와이파이 아이폰): 서버 DEV_LOGIN=1 일 때만 — 구글은 http LAN 출처를 받지 않음
      if (state.cfg?.devLogin && isLocalHost()) actions.append(button(tr('개발용 로그인 (로컬)', 'Dev sign-in (local)'), startDevLogin));
    }
    actions.append(button(tr('닫기', 'Close'), () => toggle(false)));
    $('.acct-msg').textContent = state.msg;
  }

  function button(text, fn, kind = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `acct-btn ${kind}`;
    b.textContent = text;
    b.disabled = state.busy;
    b.addEventListener('click', fn);
    return b;
  }

  function consentPanel(me) {
    const box = document.createElement('div');
    box.className = 'acct-legal';
    const c = me.consent || {};
    const agreed = fmtAgreedAt(c.termsAgreedAt || c.privacyAgreedAt, isEn() ? 'en' : 'ko');
    const termsA = document.createElement('a');
    termsA.href = legalHref('terms', state.cfg);
    termsA.target = '_blank';
    termsA.rel = 'noopener';
    termsA.textContent = tr('이용약관', 'Terms');
    const privA = document.createElement('a');
    privA.href = legalHref('privacy', state.cfg);
    privA.target = '_blank';
    privA.rel = 'noopener';
    privA.textContent = tr('개인정보처리방침', 'Privacy');
    const links = document.createElement('div');
    links.className = 'acct-legal-links';
    links.append(termsA, document.createTextNode(' · '), privA);
    box.appendChild(links);
    if (agreed) {
      const when = document.createElement('div');
      when.className = 'acct-legal-date';
      when.textContent = tr(`약관 동의일 ${agreed}`, `Agreed on ${agreed}`);
      box.appendChild(when);
    }
    const label = document.createElement('label');
    label.className = 'acct-check acct-market';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!c.marketingOptIn;
    input.disabled = !c.hasEmail || state.busy;
    input.addEventListener('change', async () => {
      const want = input.checked;
      input.disabled = true;
      const r = await accountApi.marketing(want);
      input.disabled = !c.hasEmail;
      if (!r.ok) {
        input.checked = !want;
        state.msg = r.error === 'no_email'
          ? tr('이메일 정보가 없어 소식 수신을 켤 수 없어요.', 'An email is required to turn on updates.')
          : tr(`저장하지 못했어요 (${r.error || '오류'})`, `Could not save (${r.error || 'error'})`);
        render();
        return;
      }
      if (r.consent) state.me = { ...state.me, consent: r.consent };
      state.msg = want
        ? tr('업데이트 소식을 이메일로 받아볼게요.', 'You will receive update emails.')
        : tr('업데이트 소식 수신을 껐어요.', 'Update emails are turned off.');
      render();
    });
    const span = document.createElement('span');
    span.textContent = c.hasEmail
      ? tr('새 지역 오픈·이벤트 소식을 이메일로 받아볼게요', 'Email me about new districts and events')
      : tr('이메일이 없어 소식 수신을 켤 수 없어요', 'An email is required for update emails');
    label.append(input, span);
    box.appendChild(label);
    return box;
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    chip.classList.toggle('active', open);
    if (open) render();
  }

  function adoptIfNeeded(primaryUserId) {
    const cur = deviceId();
    if (!primaryUserId || primaryUserId === cur) return false;
    state.msg = tr('계정 캐릭터로 바꾸는 중… 잠시 뒤 새로고침돼요.', 'Switching to your account character… reloading.');
    render();
    try { localStorage.setItem(DEVICE_KEY, primaryUserId); } catch { return false; }
    setTimeout(() => location.reload(), 1200);
    return true;
  }

  async function applyLogin(r) {
    if (!r) return;
    if (!r.ok) {
      state.msg = errText(r.error);
      render();
      return;
    }
    const linkMsg = LINK_TEXT[r.link?.status]?.() || '';
    const granted = (r.granted || []).reduce((a, g) => a + g.amount, 0);
    state.msg = [linkMsg, granted ? tr(`${fmt(granted)} bum 을 받았어요.`, `You received ${fmt(granted)} bum.`) : ''].filter(Boolean).join(' ');
    await refresh();
    try { dispatchEvent(new CustomEvent('bw:econ-changed', { detail: { reason: 'login' } })); } catch {}
    if (r.link?.status !== 'linked_to_other_account') adoptIfNeeded(r.primaryUserId);
  }

  async function startLogin() {
    state.msg = '';
    render();
    const r = await googleSignIn({ deviceId: deviceId(), clientId: state.cfg?.clientId || GOOGLE_CLIENT_ID });
    await applyLogin(r);
  }

  async function startDevLogin() {
    // 로컬 개발 로그인도 같은 약관 동의 창을 거친다
    await startLogin();
  }

  async function logout() {
    state.busy = true;
    render();
    await accountApi.logout(false);
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
    state.busy = false;
    state.me = null;
    state.msg = tr('로그아웃했어요. 손님으로 계속 놀 수 있어요.', 'Signed out. You can keep playing as a guest.');
    render();
  }

  async function refresh() {
    const r = await accountApi.me(deviceId());
    state.me = r.ok ? r : null;
    render();
    if (state.me?.consent?.needsTerms) {
      const c = await ensureAccountConsent({ me: state.me, cfg: state.cfg });
      if (!c.ok) {
        state.me = null;
        state.msg = tr('약관에 동의하지 않아 게스트로 계속해요.', 'You declined the terms and will continue as a guest.');
      } else if (c.me) {
        state.me = { ...state.me, ...c.me, consent: c.me.consent || state.me.consent };
      }
      render();
    }
    return state.me;
  }

  chip.addEventListener('click', () => toggle());
  onLangChange?.(() => render());

  (async () => {
    state.cfg = await accountApi.config();
    if (!state.cfg?.ok) state.cfg = { enabled: false };
    render();
    if (!state.cfg.enabled) return;
    const me = await refresh();
    // 다른 PC 에서 로그인해 대표 캐릭터가 정해졌는데 이 브라우저는 아직 예전 기기 id 를 쓰는 경우
    const mine = me?.devices?.find((d) => d.current);
    if (me?.primaryUserId && mine && mine.status !== 'primary') adoptIfNeeded(me.primaryUserId);
  })();

  render();
  return { refresh, open: () => toggle(true) };
}
