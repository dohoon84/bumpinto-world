// [zone] 실내 공간(지하철 대합실·승강장·열차 등) 프레즌스 구역.
//
// 같은 방(Durable Object Room)에 접속한 사람끼리, 같은 실내 구역에 있을 때만 서로 보이게 한다.
// 서버는 state 를 정해진 필드만 골라 다시 보내므로(server/phone/src/room.js) 새 필드 zone 은 지금 서버에서 사라진다.
// 그래서 서버를 바꾸지 않고도 동작하도록, 실내 좌표를 바깥 월드에서 아주 먼 "구역 띠" 좌표로 옮겨 보낸다.
//
//   보낼 때   x = ZONE_BASE + slot·ZONE_STRIDE + 실내x,  z = 실내z,  zone = 'jeongja-station' (참고용, 서버가 지원하면 그대로 씀)
//   받을 때   x 가 띠 안이면 → slot 으로 구역 이름, 실내 좌표 복원
//             띠 밖이고 zone 문자열이 있으면 → 그 구역 (서버가 나중에 zone 을 그대로 전달하게 되는 경우)
//             둘 다 아니면 → 바깥 ('')
//
// - x, z 는 서버가 숫자로 그대로 저장·전달하므로 새로 들어온 사람의 welcome 목록에도 구역이 유지된다.
// - zone 을 모르는 옛 클라이언트는 이 사람을 바깥 1000km 밖에 있는 사람으로 보게 된다 → 화면·이름표에 안 보임.
// - 슬롯은 덧붙이기만 한다(번호를 바꾸면 버전이 다른 클라이언트끼리 구역이 엇갈림).
//   2단계 이후: 'jeongja-station/platform-wangsimni', 'jeongja-station/platform-suwon', 열차는 'train:<편성>' → TRAIN_SLOT0 + 편성 번호.
export const ZONE_BASE = 1_000_000;
export const ZONE_STRIDE = 10_000;
const HALF = ZONE_STRIDE / 2;
const BAND_MIN = ZONE_BASE - HALF;

const PLATFORMS = [
  ['jeongja', 'suin'], ['jeongja', 'shin'], ['sunae', 'suin'], ['seohyeon', 'suin'], ['imae', 'suin'], ['imae', 'gg'],
  ['yatap', 'suin'], ['moran', 'suin'], ['moran', 'l8'], ['taepyeong', 'suin'], ['gachon', 'suin'], ['bokjeong', 'suin'], ['bokjeong', 'l8'],
  ['munjeong', 'l8'], ['garak', 'l8'], ['garak', 'l3'], ['songpa', 'l8'], ['seokchon', 'l8'], ['seokchon', 'l9'], ['jamsil', 'l8'], ['jamsil', 'l2'],
];
const TRAIN_LINES = ['suin', 'shin', 'gg', 'l8', 'l3', 'l9', 'l2'];
function PLATFORM_ZONES() { const z = []; for (const [id, l] of PLATFORMS) for (const d of [0, 1]) z.push(`${id}-station/p-${l}-${d}`); return z; } // 42개 (15~56)
function TRAIN_ZONES() { const z = []; for (const l of TRAIN_LINES) for (const d of [0, 1]) for (let k = 0; k < 4; k++) z.push(`train:${l}-${d}-${k}`); return z; } // 56개 (57~112)
export const ZONES = Object.freeze([
  '',                 // 0: 바깥 (쓰지 않음)
  'jeongja-station',  // 1: 정자역 대합실 (1단계)
  // 코리더 역 대합실 (2026-11-03 추가, 정자역 대합실 틀 재사용). 순서 = 정자 → 잠실 노선 순, 덧붙이기만
  'sunae-station',     // 2: 수내
  'seohyeon-station',  // 3: 서현
  'imae-station',      // 4: 이매
  'yatap-station',     // 5: 야탑
  'moran-station',     // 6: 모란
  'taepyeong-station', // 7: 태평
  'gachon-station',    // 8: 가천대
  'bokjeong-station',  // 9: 복정
  'munjeong-station',  // 10: 문정
  'garak-station',     // 11: 가락시장
  'songpa-station',    // 12: 송파
  'seokchon-station',  // 13: 석촌
  'jamsil-station',    // 14: 잠실
  // 2단계 승강장·열차 (2026-11-03 추가). 승강장 = 역 × 노선 × 방면(0/1, lines.js dirs 순), 열차 = 노선 × 방면 × 편성 슬롯 0..3
  //   (아래 표를 펼친 순서 그대로 15번부터. 덧붙이기만 — 표 순서·내용을 바꾸지 말 것)
  ...PLATFORM_ZONES(),
  ...TRAIN_ZONES(),
  // 장지 (8호선 복정~문정, 2026-11-03 같은 날 추가 — 처음에 실수로 빠졌던 역). 덧붙이기만: 113 대합실, 114·115 승강장 방면 0/1
  'jangji-station',          // 113
  'jangji-station/p-l8-0',   // 114
  'jangji-station/p-l8-1',   // 115
  // [migeum-sub] 미금 (수인분당 K231 · 신분당 D13, 2026-11-04 추가). 덧붙이기만: 116 대합실, 117·118 수인분당 방면 0/1, 119·120 신분당 방면 0/1
  //   ?migeumsub=0 이어도 슬롯은 그대로 둔다 (번호 고정 — 그 구역에 들어갈 길만 없음). 열차 구역은 기존 suin·shin 슬롯 그대로
  'migeum-station',          // 116
  'migeum-station/p-suin-0', // 117
  'migeum-station/p-suin-1', // 118
  'migeum-station/p-shin-0', // 119
  'migeum-station/p-shin-1', // 120
  // [gangnam] 강남 (2호선 · 신분당선, 2026-11-08). 덧붙이기만: 121 대합실, 122·123 2호선, 124·125 신분당.
  //   ?gangnamsub=0 이어도 슬롯은 그대로. 열차 구역은 기존 l2·shin 슬롯.
  'gangnam-station',          // 121
  'gangnam-station/p-l2-0',   // 122
  'gangnam-station/p-l2-1',   // 123
  'gangnam-station/p-shin-0', // 124
  'gangnam-station/p-shin-1', // 125
  // [gyeongbu-bus] 판교(신분당·경강) · 청계산입구(신분당), 2026-11-10. 덧붙이기만.
  //   ?gangnamsub=0 이어도 슬롯은 그대로. 열차 구역은 기존 shin·gg 슬롯.
  'pangyo-station',                // 126
  'pangyo-station/p-shin-0',       // 127
  'pangyo-station/p-shin-1',       // 128
  'pangyo-station/p-gg-0',         // 129
  'pangyo-station/p-gg-1',         // 130
  'cheonggyesan-station',          // 131
  'cheonggyesan-station/p-shin-0', // 132
  'cheonggyesan-station/p-shin-1', // 133
]);
const SLOT = new Map(ZONES.map((z, i) => [z, i]));

const ZONE_RE = /^[a-z0-9][a-z0-9:/_-]{0,47}$/;
export const isZoneId = (z) => typeof z === 'string' && ZONE_RE.test(z);

export function zoneSlot(zone) {
  return SLOT.get(zone) || 0;
}

// [subway-sync] 열차 편성: 'train:<l>-<d>-<k>/r<0..999>' — 슬롯은 앞부분(ZONES 그대로, 새 구역 없음),
//   편성 번호는 z 띠에 (z = 실내z + RUN_Z·(r+1), 실내 |z| < 2). 예전 클라이언트는 z 가 멀리 떨어진 사람으로 볼 뿐 (같은 칸에 안 겹침)
export const RUN_Z = 20;
const RUN_RE = /^(train:[a-z0-9-]+)\/r(\d{1,3})$/;
// 실내 좌표 → 전송 좌표. 모르는 구역이나 바깥이면 그대로.
export function encodeZone(zone, x, z) {
  const rm = typeof zone === 'string' ? RUN_RE.exec(zone) : null;
  const slot = zoneSlot(rm ? rm[1] : zone);
  if (!slot) return { x, z };
  const lx = Math.max(-HALF + 1, Math.min(HALF - 1, Number(x) || 0));
  return { x: ZONE_BASE + slot * ZONE_STRIDE + lx, z: (Number(z) || 0) + (rm ? RUN_Z * (Number(rm[2]) + 1) : 0), zone };
}

// 받은 좌표(+선택 zone 필드) → { zone, x, z } (실내면 실내 좌표)
export function decodeZone(x, z, zoneField) {
  x = Number(x) || 0; z = Number(z) || 0;
  if (x >= BAND_MIN) {
    const slot = Math.round((x - ZONE_BASE) / ZONE_STRIDE);
    const lx = x - ZONE_BASE - slot * ZONE_STRIDE;
    const zone = ZONES[slot] || (isZoneId(zoneField) ? zoneField : `zone#${slot}`);
    if (zone.startsWith('train:') && Math.abs(z) >= RUN_Z / 2) { const r = Math.round(z / RUN_Z) - 1; return { zone: `${zone}/r${r}`, x: lx, z: z - RUN_Z * (r + 1) }; } // [subway-sync]
    return { zone, x: lx, z };
  }
  if (isZoneId(zoneField)) return { zone: zoneField, x, z };
  return { zone: '', x, z };
}
