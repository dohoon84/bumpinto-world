// [ui-v2] Google 로그인 버튼 + #21(feat/accounts, ?accounts=1) 연결 지점.
//
// 버튼 모양은 Google 공식 "Sign in with Google" 브랜딩 가이드(라이트 테마)를 따른다:
//   https://developers.google.com/identity/branding-guidelines
//   - 흰 바탕 #FFFFFF · 1px 안쪽 테두리 #747775 · 글자 #1F1F1F · Google Sans(없으면 Roboto/Arial) Medium 14/20
//   - 공식 4색 "G" 로고(아래 SVG는 Google 제공 버튼 HTML 의 로고 패스 그대로, 색·비율 바꾸지 않음)
//   - 기본 높이 40 · 좌우 12 · 로고 20 · 로고-글자 10. 게임 패널의 다른 버튼 높이(48)에 맞춰 1.2배로 비율 그대로 키움
//     (가이드: "비율을 지키면 크기는 바꿀 수 있음") → 높이 48 · 좌우 14.4 · 로고 24 · 간격 12 · 글자 16.8
//   - 문구: 권장 문구의 현지화 "Google 계정으로 로그인" / "Sign in with Google"
//
// 연결 지점(#21 머지 후):
//   import { registerGoogleSignIn } from './ui-v2/google.js';
//   registerGoogleSignIn(async () => { ...GIS 팝업(src/account/ui.js 의 startLogin) ... return { name, email } | null; });
//   등록된 핸들러가 없으면(지금) 버튼은 "아직 준비 중" 안내만 하고 게스트 흐름은 그대로 동작한다.
import { tr } from '../i18n.js';

export const GOOGLE_G_SVG = (s = 20) => `<svg class="v2-gsi-g" width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.83 2.3-8.11 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>`;

let handler = null;
const listeners = new Set();

/** #21 이 GIS 로그인 함수를 등록하는 곳. fn: () => Promise<{ name?, email? } | null> */
export function registerGoogleSignIn(fn) {
  handler = typeof fn === 'function' ? fn : null;
  for (const l of listeners) { try { l(!!handler); } catch {} }
}
export const googleSignInReady = () => !!handler;
export const onGoogleReady = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** 버튼 클릭 → 등록된 로그인 실행. 없으면 { ok:false, reason:'not_ready' } */
export async function requestGoogleSignIn() {
  if (!handler) return { ok: false, reason: 'not_ready' };
  try {
    const account = await handler();
    return account ? { ok: true, account } : { ok: false, reason: 'cancelled' };
  } catch (e) {
    return { ok: false, reason: 'error', error: e };
  }
}

/**
 * 공식 가이드 버튼. size: 'lg'(48, 패널 기본) | 'sm'(32 = 0.8배, 입장 카드의 작은 링크 자리)
 * label 은 권장 문구 3종 중 하나: signin | continue | save(=저장하기: 게스트 → 계정 연결)
 */
export function googleButton({ size = 'lg', label = 'signin', full = false } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `v2-gsi v2-gsi-${size}${full ? ' v2-gsi-full' : ''}`;
  const text = label === 'continue' ? tr('Google 계정으로 계속하기', 'Continue with Google')
    : label === 'save' ? tr('Google 계정으로 저장하기', 'Continue with Google')
      : tr('Google 계정으로 로그인', 'Sign in with Google');
  b.innerHTML = `<span class="v2-gsi-icon">${GOOGLE_G_SVG(size === 'sm' ? 16 : 24)}</span><span class="v2-gsi-label">${text}</span>`;
  b.setAttribute('aria-label', text);
  return b;
}

export const googleNotReadyText = () => tr(
  'Google 로그인은 곧 열려요. 지금은 게스트로 계속해 주세요 (이 기기에 저장, 나중에 연결 가능).',
  'Google sign-in opens soon. Please continue as a guest for now (saved on this device; you can link later).',
);
