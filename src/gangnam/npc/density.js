// [gangnam-npc] 강남 보행 밀도. 저녁(18–21시)이 가장 붐비고, 심야는 적다.
//   차량 대수의 시간 배수는 정자 jz-traffic 의 densityFor 를 그대로 쓴다 (여기 두지 않음).

export const MAX_PEDS = 48;
export const MAX_PEDS_MOBILE = 18;
export const GN_CARS_DEFAULT = 26;
export const GN_CARS_MOBILE = 12;
export const GN_CARS_MAX = 80;

const CURVE = [[0, 4], [5, 4], [7, 22], [8.5, 36], [11, 28], [13, 30], [16, 32], [18, 46], [20, 48], [21.5, 30], [23, 10], [24, 4]];

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
