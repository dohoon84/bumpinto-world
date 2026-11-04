// [accounts] 클라이언트 계정 기능 스위치. 기본 꺼짐 — 정자는 그대로.
//   ?accounts=1  켜고 이 브라우저에 기억 (localStorage bw.accounts)
//   ?accounts=0  끄고 기억 지움
//   빌드 때 VITE_ACCOUNTS=1 이면 모두에게 켜짐
// 이 파일은 가볍게 둔다(presence.js 가 정적으로 가져옴). 로그인 UI·GIS 스크립트는 켜졌을 때만 동적으로 불러온다.
const KEY = 'bw.accounts';

export const GOOGLE_CLIENT_ID =
  import.meta.env?.VITE_GOOGLE_CLIENT_ID || '1011905802733-qpjjglquapnuacrq5v7tqordlotpdso3.apps.googleusercontent.com';

export function accountsOn() {
  try {
    const q = new URLSearchParams(location.search).get('accounts');
    if (q === '1' || q === 'on') localStorage.setItem(KEY, '1');
    else if (q === '0' || q === 'off') localStorage.removeItem(KEY);
    if (q === '0' || q === 'off') return false;
    if (import.meta.env?.VITE_ACCOUNTS === '1') return true;
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 계정 API 주소(쿠키가 같은 사이트로 가야 해서 보통 https://api.bumpinto.world 같은 커스텀 도메인).
 * VITE_ACCOUNT_API_URL > ?acctapi= > (없으면 '') — 빈 값이면 호출하는 쪽이 번호부 주소(smsBase)를 쓴다.
 */
export function accountApiOverride() {
  try {
    const q = new URLSearchParams(location.search).get('acctapi');
    if (q) return q.replace(/\/$/, '');
  } catch {}
  return String(import.meta.env?.VITE_ACCOUNT_API_URL || '').replace(/\/$/, '');
}

/** 계정 기능이 켜졌고 계정 API 주소가 따로 있으면, 웹소켓도 같은 주소로(세션 쿠키가 실리도록). 아니면 null */
export function accountWsUrl() {
  if (!accountsOn()) return null;
  const base = accountApiOverride();
  if (!base) return null;
  return base.replace(/^http/, 'ws') + '/ws';
}
