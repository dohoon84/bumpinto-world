// [econ] 선택 지점 — UI 는 여기의 `econ` 만 쓴다.
// [integration] 계정 기능(?accounts=1 · VITE_ACCOUNTS=1 · npm run dev:all)이 켜지면 서버 클라이언트(#30), 아니면 로컬 mock(#29 데모).
//   서버 클라이언트는 계정 기능이 꺼져 있으면 어차피 "영구 게스트 · 무료" 로 동작하지만, 꺼진 상태의 데모(?demo=econ)는 mock 을 그대로 쓴다.
import { accountsOn } from '../../account/flags.js';
import { createMockClient } from './mockClient.js';
import { createServerClient } from './serverClient.js';

/** @type {import('./api.js').EconClient} */
export const econ = accountsOn() ? createServerClient() : createMockClient();
// [fix-entry-account] mock 의 '예시 계정' 로그인은 데모(?demo=econ · ?econ=mock)에서만. 그 밖(일반 npm run dev 등)에선
//   localStorage 에 남은 mock 로그인을 게스트로 되돌린다 — 입장 카드(/auth/me)는 계정이 없으니 시작 화면도 같은 상태(게스트)여야 한다.
if (!accountsOn()) {
  let explicit = false;
  try { const q = new URLSearchParams(location.search); explicit = q.get('demo') === 'econ' || q.get('econ') === 'mock'; } catch { /* node 테스트 */ }
  if (!explicit) econ.getSession().then((ses) => { if (ses?.signedIn) econ.dev?.signOut?.(); }).catch(() => {}); // start.js 의 getSession 보다 먼저 끝난다
}
export { ERR, KARMA_AXES, KARMA_LABEL, QUEST_PERIODS, EVENTS, missingMethods } from './api.js';
