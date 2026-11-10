// [범편의점] 합치기 10단계 — 원작 과일 이름/그림 없음
export const TUB_INNER_W = 318;
export const TUB_INNER_H = 454;
export const RADIUS_K = 3 ** (1 / 9); // ≈ 1.12983
export const MAX_STAGE = 10;
export const SPAWN_MAX = 5;
export const GAMEOVER_HOLD = 1.2;
export const BUM_BONUS = 5120;
export const DANGER_Y_FRAC = 0.08;
export const SPRITE_PAD = 1.1; // 에셋 캔버스 = 논리 지름 × 1.10

export const STAGES = [
  { stage: 1, id: 'coin', name: '동전', score: 0, radiusRatio: 1 },
  { stage: 2, id: 'candy', name: '사탕', score: 10, radiusRatio: RADIUS_K },
  { stage: 3, id: 'snack', name: '과자', score: 20, radiusRatio: RADIUS_K ** 2 },
  { stage: 4, id: 'drink', name: '음료', score: 40, radiusRatio: RADIUS_K ** 3 },
  { stage: 5, id: 'kimbap', name: '삼각김밥', score: 80, radiusRatio: RADIUS_K ** 4 },
  { stage: 6, id: 'lunch', name: '도시락', score: 160, radiusRatio: RADIUS_K ** 5 },
  { stage: 7, id: 'basket', name: '장바구니', score: 320, radiusRatio: RADIUS_K ** 6 },
  { stage: 8, id: 'cart', name: '카트', score: 640, radiusRatio: RADIUS_K ** 7 },
  { stage: 9, id: 'store', name: '편의점', score: 1280, radiusRatio: RADIUS_K ** 8 },
  { stage: 10, id: 'bum', name: '범', score: 2560, radiusRatio: 3 },
];

const BY_STAGE = Object.fromEntries(STAGES.map((s) => [s.stage, s]));
const BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

export function stageInfo(stage) { return BY_STAGE[stage] || BY_STAGE[1]; }
export function stageById(id) { return BY_ID[id] || BY_STAGE[1]; }
export function scoreForStage(stage) { return stageInfo(stage).score || 0; }

/** 1단계 지름 = 통 안쪽 너비 / STAGE1_DIAM_DIV (예전 9보다 조금 커서 통이 빨리 찬다) */
export const STAGE1_DIAM_DIV = 8.35;
export function radiusFor(stage, tubW = TUB_INNER_W) {
  const n = Math.max(1, Math.min(MAX_STAGE, stage | 0));
  return (tubW / (STAGE1_DIAM_DIV * 2)) * (RADIUS_K ** (n - 1));
}

export function dangerY(tubH = TUB_INNER_H) { return tubH * DANGER_Y_FRAC; }
