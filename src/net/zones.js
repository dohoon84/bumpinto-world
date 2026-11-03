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

export const ZONES = Object.freeze([
  '',                 // 0: 바깥 (쓰지 않음)
  'jeongja-station',  // 1: 정자역 대합실 (1단계)
]);
const SLOT = new Map(ZONES.map((z, i) => [z, i]));

const ZONE_RE = /^[a-z0-9][a-z0-9:/_-]{0,47}$/;
export const isZoneId = (z) => typeof z === 'string' && ZONE_RE.test(z);

export function zoneSlot(zone) {
  return SLOT.get(zone) || 0;
}

// 실내 좌표 → 전송 좌표. 모르는 구역이나 바깥이면 그대로.
export function encodeZone(zone, x, z) {
  const slot = zoneSlot(zone);
  if (!slot) return { x, z };
  const lx = Math.max(-HALF + 1, Math.min(HALF - 1, Number(x) || 0));
  return { x: ZONE_BASE + slot * ZONE_STRIDE + lx, z: Number(z) || 0, zone };
}

// 받은 좌표(+선택 zone 필드) → { zone, x, z } (실내면 실내 좌표)
export function decodeZone(x, z, zoneField) {
  x = Number(x) || 0; z = Number(z) || 0;
  if (x >= BAND_MIN) {
    const slot = Math.round((x - ZONE_BASE) / ZONE_STRIDE);
    const lx = x - ZONE_BASE - slot * ZONE_STRIDE;
    const zone = ZONES[slot] || (isZoneId(zoneField) ? zoneField : `zone#${slot}`);
    return { zone, x: lx, z };
  }
  if (isZoneId(zoneField)) return { zone: zoneField, x, z };
  return { zone: '', x, z };
}
