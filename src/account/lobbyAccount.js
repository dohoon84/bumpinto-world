// [accounts] 입장 카드(lobby.js)의 계정 모드 — ?accounts=1 / VITE_ACCOUNTS=1 일 때만 lobby.js 가 동적으로 불러온다.
//   로그인 판정 = 세션 쿠키로 GET /auth/me (econ·계정 칩과 같은 출처). '로컬 테스트 모드' 줄(번호부 sms.off)과는 따로다.
//   계정 캐릭터 = 번호부(Durable Object)의 대표 캐릭터 me.primaryUserId → 미리보기 /join(preview) 으로 이름·모습·위치를 읽는다(덮어쓰지 않음).
import { accountApi } from './api.js';
import './lobby.css';

const ME_TIMEOUT_MS = 2500;

/**
 * @returns {Promise<null | { me: object, hasChar: boolean, session?: object, name?: string, look?: object }>}
 *   null = 게스트(로그인 안 됨·계정 서버 없음·시간 초과) → 입장 카드는 지금 그대로
 */
export async function detectLobbyAccount({ sms, saved, look, fallbackName }) {
  const me = await Promise.race([
    accountApi.me(sms?.id || '').catch(() => null),
    new Promise((r) => setTimeout(() => r(null), ME_TIMEOUT_MS)),
  ]);
  if (!me?.ok || !me.account) return null;
  const primary = me.primaryUserId || null;
  if (sms && !sms.off) {
    if (!primary) return { me, hasChar: false, name: saved?.name || me.account.name || '' }; // 첫 로그인: 미리보기로 빈 캐릭터를 만들지 않는다
    sms.useId?.(primary); // 다른 기기에서 만든 계정 캐릭터면 이 기기도 그 캐릭터로 (새로고침 없이)
    try {
      const session = await sms.enter({ name: saved?.name || me.account.name || fallbackName, look, preview: true });
      return { me, hasChar: true, session };
    } catch {
      return { me, hasChar: !!saved, name: saved?.name || me.account.name || '', look: saved?.look };
    }
  }
  // 번호부가 꺼진 로컬(일반 npm run dev 등): 이 기기에 저장된 캐릭터를 계정 캐릭터로 쓴다
  return { me, hasChar: !!saved?.name, name: saved?.name || me.account.name || '', look: saved?.look };
}

/** 첫 로그인에서 방금 만든 캐릭터(이 기기 id)를 계정에 붙인다 → 서버가 primary 로 잡음 */
export async function saveFirstCharacter({ sms }) {
  if (!sms || sms.off || !sms.id) return null;
  const r = await accountApi.link(sms.id).catch(() => null);
  return r?.ok ? r : null;
}
