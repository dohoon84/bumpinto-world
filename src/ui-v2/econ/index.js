// [econ] 선택 지점 — UI 는 여기의 `econ` 만 쓴다.
// 서버 원장이 준비되면(feat/economy-server) 아래 한 줄만 서버 클라이언트로 바꾼다:
//   import { createServerClient as createClient } from './serverClient.js';
import { createMockClient as createClient } from './mockClient.js';

/** @type {import('./api.js').EconClient} */
export const econ = createClient();
export { ERR, KARMA_AXES, KARMA_LABEL, QUEST_PERIODS, EVENTS, missingMethods } from './api.js';
