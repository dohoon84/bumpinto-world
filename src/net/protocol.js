// 멀티플레이 프레즌스 프로토콜 (JSON 메시지). 서버 구현(PartyKit / Durable Objects / dev-relay)과 공유.
//
// client -> server
//   { t: 'hello', name, color, look }               접속 직후 1회. look는 src/look.js 외형
//   { t: 'state', x, z, ry, moving, veh? }           위치 (최대 ~10Hz). [truck] veh = { id, ry, v, st, wh? } 트럭 운전 중. [bike] 관리자 크루저는 id 900(블랙)/901(레드)
//   { t: 'chat', text }                              채팅(서버는 보낸 사람 제외 브로드캐스트, 근접 필터는 클라이언트에서)
//   { t: 'weather', mode }                           관리자만. mode 'rain' 이면 그 지역 전체 비를 고정, '' 이면 실시간
// server -> client
//   { t: 'welcome', id, peers: [Peer], weather? }    weather 는 그 지역에 고정된 날씨('', 'rain')
//   { t: 'weather', mode }
//   { t: 'join', peer: Peer }                        Peer = { id, name, color, look, x, z, ry }
//   { t: 'leave', id }
//   { t: 'state', id, x, z, ry, moving }
//   { t: 'chat', id, text }
export const STATE_HZ = 10;
export const CHAT_RADIUS = 30; // m — 이 거리 안의 플레이어 채팅만 말풍선으로 보임(근접 채팅)
