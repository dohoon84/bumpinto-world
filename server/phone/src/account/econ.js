// [accounts] 1단계 경제 상수 — /workspace/bw-economy-v1/plan.html §8 웰컴 지급 표 그대로.
//   웰컴 20,000 bum (무료, 계정당 1회, 키 welcome:{account_id})
//   베타 감사 10,000 bum (무료, 오픈 전에 만들어진 기기를 연결한 계정, 오픈 후 30일 이내, 키 beta:{account_id} + 기기당 1회 beta-dev:{device_id})
// 금액은 클라이언트가 정하지 않는다. 가격표 버전은 원장 행마다 price_table_version 으로 남는다(D1 price_table 에 같은 값이 시드됨).
export const PRICE_TABLE_VERSION = 1;
export const WELCOME_FREE_BUM = 20000;
export const BETA_FREE_BUM = 10000;
export const BETA_WINDOW_DAYS = 30;
export const LEDGER_KINDS = new Set(["paid", "free"]);
