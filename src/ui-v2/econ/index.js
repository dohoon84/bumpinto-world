// [econ] 선택 지점 — UI 는 여기의 `econ` 만 쓴다.
// [integration] 계정 기능(?accounts=1 · VITE_ACCOUNTS=1 · npm run dev:all)이 켜지면 서버 클라이언트(#30), 아니면 로컬 mock(#29 데모).
//   서버 클라이언트는 계정 기능이 꺼져 있으면 어차피 "영구 게스트 · 무료" 로 동작하지만, 꺼진 상태의 데모(?demo=econ)는 mock 을 그대로 쓴다.
import { accountsOn } from '../../account/flags.js';
import { createMockClient } from './mockClient.js';
import { createServerClient } from './serverClient.js';

/** @type {import('./api.js').EconClient} */
export const econ = accountsOn() ? createServerClient() : createMockClient();
export { ERR, KARMA_AXES, KARMA_LABEL, QUEST_PERIODS, EVENTS, missingMethods } from './api.js';
