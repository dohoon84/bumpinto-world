// [accounts] 약관·수신동의 UI. HTML 오버레이라 WebGL draw/tris 추가 없음.
//   - 로그인 창 체크박스(mountConsentFields)
//   - 기존 회원의 차단 동의 모달(ensureAccountConsent). 거절 시 로그아웃 후 게스트.
import { tr } from '../i18n.js';
import { accountApi } from './api.js';
import './account.css';

export const TERMS_VERSION = '2026-11-13';
export const PRIVACY_VERSION = '2026-11-13';
export const TERMS_PATH = '/terms.html';
export const PRIVACY_PATH = '/privacy.html';

export function legalHref(kind, cfg) {
  const fromCfg = kind === 'privacy' ? cfg?.consent?.privacyUrl : cfg?.consent?.termsUrl;
  if (fromCfg && /^(https?:)?\/\//.test(fromCfg)) return fromCfg;
  const path = fromCfg || (kind === 'privacy' ? PRIVACY_PATH : TERMS_PATH);
  try {
    return new URL(path, location.origin).href;
  } catch {
    return path;
  }
}

export function versionsFrom(cfg) {
  return {
    termsVersion: cfg?.consent?.termsVersion || TERMS_VERSION,
    privacyVersion: cfg?.consent?.privacyVersion || PRIVACY_VERSION,
  };
}

export function fmtAgreedAt(ms, lang) {
  const n = Number(ms);
  if (!n) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(n));
  } catch {
    return '';
  }
}

function fieldHtml({ termsHref, privacyHref, marketingDefault = false }) {
  const tTerms = tr('이용약관', 'Terms of Service');
  const tPrivacy = tr('개인정보처리방침', 'Privacy Policy');
  return `
    <div class="acct-consent">
      <label class="acct-check"><input type="checkbox" data-consent="terms"> <span>${tr('[필수] ', '[Required] ')}<a href="${termsHref}" target="_blank" rel="noopener">${tTerms}</a>${tr(' 동의', ' agreement')}</span></label>
      <label class="acct-check"><input type="checkbox" data-consent="privacy"> <span>${tr('[필수] ', '[Required] ')}<a href="${privacyHref}" target="_blank" rel="noopener">${tPrivacy}</a>${tr(' 동의', ' agreement')}</span></label>
      <label class="acct-check"><input type="checkbox" data-consent="marketing"${marketingDefault ? ' checked' : ''}> <span>${tr('[선택] 새 지역 오픈·이벤트 소식을 이메일로 받아볼게요', '[Optional] Email me about new districts and events')}</span></label>
    </div>`;
}

/**
 * 로그인 창·계정 칩 로그인 영역에 필수/선택 체크박스를 붙인다.
 * @returns {{ requiredOk: () => boolean, payload: () => object, onChange: (fn) => void }}
 */
export function mountConsentFields(host, { cfg, marketingDefault = false } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = fieldHtml({
    termsHref: legalHref('terms', cfg),
    privacyHref: legalHref('privacy', cfg),
    marketingDefault,
  });
  host.appendChild(wrap);
  const terms = wrap.querySelector('[data-consent="terms"]');
  const privacy = wrap.querySelector('[data-consent="privacy"]');
  const marketing = wrap.querySelector('[data-consent="marketing"]');
  const requiredOk = () => !!(terms.checked && privacy.checked);
  const payload = () => ({ ...versionsFrom(cfg), marketingOptIn: !!marketing.checked });
  const listeners = [];
  const fire = () => listeners.forEach((fn) => fn(requiredOk()));
  terms.addEventListener('change', fire);
  privacy.addEventListener('change', fire);
  marketing.addEventListener('change', fire);
  wrap.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
  return {
    requiredOk,
    payload,
    onChange(fn) { listeners.push(fn); fn(requiredOk()); },
    root: wrap,
  };
}

let consentGate = null;

function closeModal(wrap) {
  try { wrap.remove(); } catch { /* noop */ }
  document.body.classList.remove('acct-consent-blocking');
}

/**
 * 기존 로그인 계정에 약관 재동의가 필요하면 차단 모달을 띄운다.
 * 배경 클릭으로는 닫히지 않는다. Escape 또는 '동의하지 않음' → 로그아웃 후 { ok:false, declined:true }.
 * 이미 동의한 상태면 { ok:true, me } 를 바로 반환.
 */
export async function ensureAccountConsent({ me, cfg } = {}) {
  if (!me?.consent?.needsTerms) return { ok: true, me };
  if (consentGate) return consentGate;
  consentGate = (async () => {
    const conf = cfg || (await accountApi.config().catch(() => null));
    const result = await new Promise((resolve) => {
      let done = false;
      const wrap = document.createElement('div');
      wrap.className = 'acct-signin acct-reconsent';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.innerHTML = `<div class="acct-signin-card">
        <div class="acct-head"></div>
        <p class="acct-note"></p>
        <div class="acct-fields"></div>
        <div class="acct-msg" role="status"></div>
        <div class="acct-actions"></div>
      </div>`;
      const $ = (s) => wrap.querySelector(s);
      $('.acct-head').textContent = tr('이용약관에 동의해 주세요', 'Please agree to the terms');
      $('.acct-note').textContent = tr(
        '서비스 이용과 계정 유지를 위해 이용약관과 개인정보처리방침 동의가 필요해요. 동의하지 않으면 게스트로 계속할 수 있어요.',
        'To keep using your account, please agree to the Terms and Privacy Policy. If you decline, you can continue as a guest.',
      );
      const fields = mountConsentFields($('.acct-fields'), { cfg: conf, marketingDefault: !!me.consent?.marketingOptIn });
      const agree = document.createElement('button');
      agree.type = 'button';
      agree.className = 'acct-btn primary';
      agree.textContent = tr('동의하고 계속', 'Agree and continue');
      agree.disabled = true;
      const declineBtn = document.createElement('button');
      declineBtn.type = 'button';
      declineBtn.className = 'acct-btn';
      declineBtn.textContent = tr('동의하지 않음', 'Decline');
      fields.onChange((ok) => { agree.disabled = !ok; });
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        finish({ agreed: false });
      };
      const finish = (v) => {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        closeModal(wrap);
        resolve(v);
      };
      // 배경 클릭은 무시한다. 같은 클릭이 시작화면 '계속하기'로 새어나가지 않게 막는다.
      const absorbBackdrop = (e) => {
        if (e.target !== wrap) return;
        e.preventDefault();
        e.stopPropagation();
      };
      wrap.addEventListener('pointerdown', absorbBackdrop);
      wrap.addEventListener('click', absorbBackdrop);
      declineBtn.addEventListener('click', () => finish({ agreed: false }));
      document.addEventListener('keydown', onKey, true);
      agree.addEventListener('click', async () => {
        if (!fields.requiredOk() || done) return;
        agree.disabled = true;
        $('.acct-msg').textContent = tr('저장하는 중…', 'Saving…');
        const r = await accountApi.consent(fields.payload());
        if (!r.ok) {
          $('.acct-msg').textContent = tr(`저장하지 못했어요 (${r.error || '오류'})`, `Could not save (${r.error || 'error'})`);
          agree.disabled = false;
          return;
        }
        finish({ agreed: true, me: { ...me, ...r, consent: r.consent || me.consent }, marketing: r.marketing });
      });
      $('.acct-actions').append(agree, declineBtn);
      document.body.classList.add('acct-consent-blocking');
      document.body.appendChild(wrap);
    });
    if (!result.agreed) {
      await accountApi.logout(false).catch(() => {});
      try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
      try { dispatchEvent(new CustomEvent('bw:econ-changed', { detail: { reason: 'logout' } })); } catch {}
      return { ok: false, declined: true };
    }
    try { dispatchEvent(new CustomEvent('bw:econ-changed', { detail: { reason: 'consent' } })); } catch {}
    return { ok: true, me: result.me };
  })();
  try {
    return await consentGate;
  } finally {
    consentGate = null;
  }
}
