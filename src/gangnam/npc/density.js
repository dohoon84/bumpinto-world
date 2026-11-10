// [gangnam-npc] 강남 보행 밀도. 저녁(18–21시)이 가장 붐비고, 심야는 적다.
//   차량 종류 비율만 정자 mixFor 를 쓴다. 대수는 carViewTarget (화면 안에 모음).

export const MAX_PEDS = 64;
export const MAX_PEDS_MOBILE = 18;
export const GN_CARS_DEFAULT = 26;
export const GN_CARS_MOBILE = 12;
export const GN_CARS_MAX = 80;

// 활성 인원은 화면(플레이어 앞뒤 약 50m) 안에 몰아 둔다. 풀 MAX_PEDS 는 그대로라 힙은 늘지 않는다.
//   14시 ≈ 20, 18–21시 ≈ 34–36, 21시(샷)도 낮보다 많다. 심야는 적다.
// 가까운 인도부터 채운다. 낮 22명이면 화면 가운데 인도에 15~25명, 21시는 그 다음 칸까지 더 채운다.
const CURVE = [[0, 6], [5, 6], [7, 14], [8.5, 16], [11, 18], [14, 20], [16, 20], [18, 48], [20, 48], [21, 48], [21.5, 30], [23, 10], [24, 6]];

// 따라보기 카메라(yaw 방향 30m 앞, 그 뒤를 봄)가 또렷이 담는 구간. ahead 는 yaw 방향.
// 따라보기 카메라가 길을 내려다보는 쪽(yaw 반대, 화면 가운데~위). 렌즈 밑의 가까운 바닥은 빼 둔다.
export const STREET_VIEW = { ahead0: -42, ahead1: -4, lat: 18, nearM: 70 };

export function viewOffset(x, z, fx, fz, yaw) {
  const dx = x - fx, dz = z - fz;
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  return { ahead: dx * sx + dz * sz, lat: Math.abs(-dx * sz + dz * sx), d: Math.hypot(dx, dz) };
}

export function inStreetView(x, z, fx, fz, yaw, box = STREET_VIEW) {
  const o = viewOffset(x, z, fx, fz, yaw);
  return o.d <= box.nearM && o.ahead >= box.ahead0 && o.ahead <= box.ahead1 && o.lat <= box.lat;
}

// 데스크톱 화면 안 목표 대수. 저녁·밤이 낮보다 많다(강남 밤거리). 모바일은 상한 12.
export function carViewTarget(h, { mobile = false } = {}) {
  if (mobile) return Math.min(GN_CARS_MOBILE, Math.max(6, Math.round(GN_CARS_MOBILE * (h >= 17 && h < 21.5 ? 1 : 0.85))));
  const p = pedPeriod(h);
  if (p === 'evening') return 28;
  if (p === 'morning') return 14;
  if (p === 'night') return 14;
  return 11;
}

export function pedCount(h) {
  h = ((h % 24) + 24) % 24;
  for (let i = 1; i < CURVE.length; i++) {
    const [h0, n0] = CURVE[i - 1], [h1, n1] = CURVE[i];
    if (h <= h1) return Math.round(n0 + ((n1 - n0) * (h - h0)) / (h1 - h0));
  }
  return CURVE[CURVE.length - 1][1];
}

export function pedPeriod(h) {
  h = ((h % 24) + 24) % 24;
  if (h >= 7 && h < 10) return 'morning';
  if (h >= 17 && h < 21.5) return 'evening';
  if (h >= 22 || h < 6) return 'night';
  return 'day';
}

// exit = 출입구 1–12 앞, walk = 강남대로·테헤란로 인도. 합 1.
export const PED_MIX = {
  morning: { exit: 0.55, walk: 0.45 },
  evening: { exit: 0.42, walk: 0.58 },
  day: { exit: 0.28, walk: 0.72 },
  night: { exit: 0.48, walk: 0.52 },
};

export function pedDensityAt(h, { mobile = false } = {}) {
  const period = pedPeriod(h);
  let count = Math.min(MAX_PEDS, pedCount(h));
  if (mobile) count = Math.min(MAX_PEDS_MOBILE, Math.max(period === 'night' ? 3 : 6, Math.round(count * 0.4)));
  return { count, period, mix: PED_MIX[period] };
}

// 말풍선. 글만. 상호·로고 없음.
export const GREETINGS = [
  { lang: 'ko', text: '안녕하세요' },
  { lang: 'ko', text: '처음 와 봤어요' },
  { lang: 'ko', text: '역이 어디예요?' },
  { lang: 'en', text: 'Hello!' },
  { lang: 'en', text: 'Excuse me' },
  { lang: 'en', text: 'Which way is the station?' },
  { lang: 'ja', text: 'こんにちは' },
  { lang: 'ja', text: 'すみません' },
  { lang: 'ja', text: '駅はどちらですか' },
];

export function parseGangnamCars(params, { mobile = false } = {}) {
  const v = params?.get?.('gangnamcars');
  const fallback = mobile ? GN_CARS_MOBILE : GN_CARS_DEFAULT;
  if (v == null || v === '') return { on: true, base: fallback };
  if (v === '0' || v === 'off' || v === 'false') return { on: false, base: 0 };
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? { on: true, base: Math.min(GN_CARS_MAX, n) } : { on: true, base: fallback };
}
