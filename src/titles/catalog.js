// [titles] 칭호 목록. 카르마 사다리는 server/phone/src/account/econ.js LADDERS 와 같은 이름·문턱.
//   store.grocery(장보기왕) 는 사다리 밖 BUMP24 상점 칭호 — 서버 지표가 아직 없다.
const T = (ko, en) => Object.freeze({ ko, en });

/** 등급이 올라갈수록 금속·광택·반짝임이 세진다. */
export const GRADES = Object.freeze({
  bronze: Object.freeze({ metal: '#8d5a32', rim: '#f0d2b0', emissive: '#5a3018', emit: 0.22, metalness: 0.72, roughness: 0.4, spark: '#ffd7a8', sparks: 5, rimEmit: 0.16 }),
  silver: Object.freeze({ metal: '#c5d0dc', rim: '#f7fbff', emissive: '#5c6b7c', emit: 0.28, metalness: 0.9, roughness: 0.22, spark: '#ffffff', sparks: 8, rimEmit: 0.32 }),
  gold: Object.freeze({ metal: '#e6b422', rim: '#fff6c2', emissive: '#a86b00', emit: 0.42, metalness: 0.92, roughness: 0.16, spark: '#fff3bf', sparks: 11, rimEmit: 0.5 }),
  legendary: Object.freeze({ metal: '#6d4dff', rim: '#ffe169', emissive: '#2c1478', emit: 0.62, metalness: 0.84, roughness: 0.1, spark: '#fff6c2', sparks: 16, rimEmit: 0.78 }),
  event: Object.freeze({ metal: '#1aa37c', rim: '#ffe169', emissive: '#085443', emit: 0.48, metalness: 0.82, roughness: 0.18, spark: '#fff3bf', sparks: 12, rimEmit: 0.55 }),
});

const GRADE_RANK = Object.freeze({ bronze: 1, silver: 2, gold: 3, event: 3, legendary: 4 });
export const gradeRank = (g) => GRADE_RANK[g] || 0;

function gradeFor(axis, index, count) {
  if (axis === 'store') return 'event';
  if (count >= 3) return ['bronze', 'gold', 'legendary'][index] || 'gold';
  if (count === 2) return index === 0 ? 'silver' : 'gold';
  return 'gold';
}

function step(axis, id, ko, en, at, index, count) {
  return Object.freeze({
    id, axis, at, tier: index, grade: gradeFor(axis, index, count),
    name: T(ko, en),
    blurb: axis === 'store'
      ? T('BUMP24 상점 칭호', 'BUMP24 store title')
      : T(`${axisLabel(axis).ko} ${at}`, `${axisLabel(axis).en} ${at}`),
    color: AXIS_COLOR[axis],
  });
}

export const AXIS_COLOR = Object.freeze({
  health: '#2fbf71', explore: '#f08c2e', transit: '#3b82f6', neighbor: '#ec5f9a', streak: '#8b6cff', store: '#20c997',
});
export const AXIS_ORDER = Object.freeze(['health', 'explore', 'transit', 'neighbor', 'streak', 'store']);
const AXIS_TEXT = Object.freeze({
  health: T('건강', 'Health'), explore: T('탐험', 'Explore'), transit: T('교통', 'Transit'),
  neighbor: T('이웃', 'Neighbor'), streak: T('꾸준함', 'Streak'), store: T('상점', 'Store'),
});
export const axisLabel = (axis) => AXIS_TEXT[axis] || T(axis, axis);

// LADDERS 순서·문턱 그대로. 3단은 동 → 금 → 전설, 2단은 은 → 금.
const LADDER = [
  ['health', [
    ['health.stroll', '산책러', 'Stroller', 100],
    ['health.walker', '정자 워커', 'Jeongja Walker', 1000],
    ['health.marathon', '탄천 마라토너', 'Tancheon Marathoner', 5000],
  ]],
  ['explore', [
    ['explore.alley', '골목 탐험가', 'Alley Explorer', 20],
    ['explore.map', '정자 지도장인', 'Jeongja Cartographer', 200],
  ]],
  ['transit', [
    ['transit.transfer', '환승의 달인', 'Transfer Master', 100],
    ['transit.vip', '교통카드 VIP', 'Transit Card VIP', 1000],
  ]],
  ['neighbor', [
    ['neighbor.hello', '반가운 이웃', 'Friendly Neighbor', 30],
    ['neighbor.captain', '동네 반장', 'Block Captain', 300],
  ]],
  ['streak', [
    ['streak.d7', '7일 연속', '7-day streak', 7],
    ['streak.d30', '30일 연속', '30-day streak', 30],
    ['streak.d100', '100일 연속', '100-day streak', 100],
  ]],
];

export const TITLES = Object.freeze([
  ...LADDER.flatMap(([axis, steps]) => steps.map((row, i) => step(axis, row[0], row[1], row[2], row[3], i, steps.length))),
  step('store', 'store.grocery', '장보기왕', 'Grocery Champion', null, 0, 1),
]);

const BY_ID = new Map(TITLES.map((t) => [t.id, t]));
const BY_KO = new Map(TITLES.filter((t) => t.axis !== 'store').map((t) => [`${t.axis}:${t.name.ko}`, t]));

export const titleById = (id) => BY_ID.get(id) || null;
export const titleByAxisKo = (axis, ko) => BY_KO.get(`${axis}:${ko}`) || null;

/** 프레즌스에 실어 보내는 칭호 id. 목록에 있는 것만. */
export function sanitizeTitleId(raw) {
  const s = String(raw || '').trim();
  if (!/^[a-z][a-z0-9.-]{0,40}$/.test(s)) return '';
  return BY_ID.has(s) ? s : '';
}

/** 서버 featured 와 같은 축 우선순위. 그 축에서 가장 높은 등급. */
export function featuredId(ids) {
  const have = new Set(ids);
  for (const axis of ['health', 'transit', 'explore', 'neighbor', 'streak', 'store']) {
    const mine = TITLES.filter((t) => t.axis === axis && have.has(t.id)).sort((a, b) => b.tier - a.tier || gradeRank(b.grade) - gradeRank(a.grade));
    if (mine.length) return mine[0].id;
  }
  return '';
}

export function titlesInAxis(axis) {
  return TITLES.filter((t) => t.axis === axis);
}

/** 금·이벤트·전설만 방 안 획득 알림에 실린다. 모르는 id 는 빈 문자열. */
export function announceTitleId(raw) {
  const id = sanitizeTitleId(raw);
  const t = id ? titleById(id) : null;
  if (!t || gradeRank(t.grade) < gradeRank('gold')) return '';
  return t.id;
}
