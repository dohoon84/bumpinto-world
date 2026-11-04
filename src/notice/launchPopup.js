// [notice-launch] 첫 화면(지구본·로비 진입 전) 모바일 오픈 안내 모달. 게시판/게임과 독립(자체 CSS).
// '다시 보지 않기' 체크 후 닫으면 localStorage bw.notice.mobileLaunch.v1 = '1' → 다시 안 뜸.
// 체크 없이 닫으면 이번 탭(sessionStorage)에서만 숨김. ?noticePopup=0 이면 끔. ?enter/passport/from/shot 입장 경로에선 안 띄움.
import { isEn, onLangChange } from '../i18n.js';

export const LAUNCH_NOTICE_KEY = 'bw.notice.mobileLaunch.v1';

const TEXT = {
  ko: {
    title: '모바일 버전이 열렸어요!',
    body: ['여러분의 관심 덕분에 모바일 버전을 예정보다 먼저 열게 되었습니다. 관심 가져 주셔서 진심으로 감사드립니다.'],
    noteTitle: '안내 말씀 드립니다',
    note: '기존에 PC로 이용하시던 분은 PC에서 먼저 구글 로그인을 해 주세요. 그다음 모바일에서 같은 구글 계정으로 로그인하시면, 쓰시던 전화번호와 캐릭터, 기록을 그대로 이어서 이용하실 수 있습니다.',
    never: '다시 보지 않기', ok: '확인', close: '닫기',
  },
  en: {
    title: 'The mobile version is here!',
    body: ['Thanks to your interest, we were able to open the mobile version earlier than planned. Thank you so much for your support.'],
    noteTitle: 'A quick note',
    note: "If you've been playing on PC, please sign in with Google on your PC first. Then sign in on mobile with the same Google account, and your phone number, character and records will carry over just as they are.",
    never: "Don't show again", ok: 'Got it', close: 'Close',
  },
};

const CSS = `
#bw-launch-notice{position:fixed;inset:0;z-index:5000;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));background:rgba(5,10,24,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:inherit}
#bw-launch-notice .bln-card{position:relative;width:min(460px,100%);max-height:100%;overflow:auto;box-sizing:border-box;padding:26px 24px 20px;border-radius:20px;border:1px solid rgba(255,225,105,.35);background:linear-gradient(180deg,rgba(18,30,62,.94),rgba(10,18,40,.94));color:#e8f2f8;box-shadow:0 20px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)}
#bw-launch-notice .bln-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#e8f2f8;font-size:20px;cursor:pointer}
#bw-launch-notice .bln-kicker{display:inline-block;margin-bottom:10px;padding:4px 10px;border-radius:999px;background:rgba(255,225,105,.16);color:#ffe169;font-size:12px;font-weight:800}
#bw-launch-notice h2{margin:0 40px 12px 0;font-size:22px;line-height:1.3;font-weight:900;color:#ffe169}
#bw-launch-notice p{margin:0 0 12px;font-size:15px;line-height:1.65;word-break:keep-all}
#bw-launch-notice .bln-note{margin:4px 0 16px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
#bw-launch-notice .bln-note b{display:block;margin-bottom:6px;color:#ffe169;font-size:14px}
#bw-launch-notice .bln-note p{margin:0;font-size:14px}
#bw-launch-notice .bln-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
#bw-launch-notice label{display:inline-flex;align-items:center;gap:8px;min-height:40px;font-size:14px;color:#b9cadb;cursor:pointer}
#bw-launch-notice input{width:18px;height:18px;accent-color:#ffc83d}
#bw-launch-notice .bln-ok{min-width:120px;height:44px;padding:0 20px;border:0;border-radius:12px;background:linear-gradient(180deg,#ffe169,#ffb703);color:#3a2a00;font:inherit;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 14px rgba(255,183,3,.3)}
@media (max-height:480px){#bw-launch-notice .bln-card{padding:16px 18px 12px}#bw-launch-notice h2{font-size:19px;margin-bottom:8px}#bw-launch-notice p{font-size:14px;line-height:1.5;margin-bottom:8px}#bw-launch-notice .bln-note{margin:2px 0 10px;padding:10px 12px}}
`;

export function shouldShowLaunchNotice(params, storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  if (params?.get?.('noticePopup') === '0') return false;
  if (['enter', 'passport'].some((k) => params?.get?.(k) === '1') || params?.has?.('from') || params?.has?.('shot')) return false;
  try { if (storage?.getItem(LAUNCH_NOTICE_KEY) === '1') return false; } catch {}
  try { if (session?.getItem(LAUNCH_NOTICE_KEY) === '1') return false; } catch {}
  return true;
}

export function showLaunchNotice({ params = new URLSearchParams(location.search) } = {}) {
  if (!shouldShowLaunchNotice(params) || document.getElementById('bw-launch-notice')) return null;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'bw-launch-notice';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const render = () => {
    const t = isEn() ? TEXT.en : TEXT.ko;
    const checked = root.querySelector('input')?.checked || false;
    root.innerHTML = `<div class="bln-card" aria-labelledby="bln-title">
      <button type="button" class="bln-x" data-close aria-label="${t.close}">×</button>
      <span class="bln-kicker">📱 ${isEn() ? 'Notice' : '공지'}</span>
      <h2 id="bln-title">${t.title}</h2>
      ${t.body.map((s) => `<p>${s}</p>`).join('')}
      <div class="bln-note"><b>${t.noteTitle}</b><p>${t.note}</p></div>
      <div class="bln-row"><label><input type="checkbox"${checked ? ' checked' : ''}> ${t.never}</label>
      <button type="button" class="bln-ok" data-close>${t.ok}</button></div></div>`;
  };
  render();
  const off = onLangChange?.(render);
  const close = () => {
    const never = root.querySelector('input')?.checked;
    try { (never ? localStorage : sessionStorage).setItem(LAUNCH_NOTICE_KEY, '1'); } catch {}
    try { off?.(); } catch {}
    root.remove(); style.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(root);
  root.querySelector('.bln-ok')?.focus();
  return { close };
}
