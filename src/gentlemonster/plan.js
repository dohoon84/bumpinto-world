// [gentle-monster] 사옥 치수 (m). 건물 로컬 좌표: 원점 = 평면 중심(지면), +x 동, +z 남(도로·정문 쪽), +y 위.
//   근거: research.md — 하층 RC 5겹(1~5F) · 중층 PT 내민보(6~11F) · 상층 UHPC 십자 전망 박스(12~14F).
export const PLAN = {
  A: 18.5, B: 15.5, N: 5,            // 하층 평면(둥근 사각) 반치수 · 지수
  F1H: 5.0,                      // 1층 높이 (후퇴한 유리 + 기둥)
  TIER_H: 4.7, TIERS: 4,         // 2~5층 곡면 띠 (각 4.7m)
  SLAB: 0.6,
  floorY: { 1: 0.12, 2: 5.0, 3: 9.7, 4: 14.4, 5: 19.1 }, // 각 층 바닥면 높이
  midHalf: 12, midH: 24.6,       // 중층 정사각 20×20, 6층 × 4.1m
  wingOut: 18.5, wingHalfTop: 6.2, wingHalfBot: 4.6, topH: 13.5,
  GLASS_OFF: -3.2,               // 1층 유리선 (하층 외곽선 기준 안쪽)
  PORCH_OFF: -8.2,               // 정문 포치 깊이
};
PLAN.t0 = 4.4;                          // 첫 띠 바닥 (1층 천장 슬래브 아래)
PLAN.baseTop = PLAN.t0 + PLAN.TIER_H * PLAN.TIERS; // 23.2
PLAN.midTop = PLAN.baseTop + PLAN.midH;            // 47.8
PLAN.top = PLAN.midTop + PLAN.topH;                // 60.8

// 실내 배치 (건물 로컬 좌표)
PLAN.skin = -0.45;          // 실내 벽(안쪽 피부) offset
PLAN.walk = -0.95;          // 걸어 다닐 수 있는 한계 offset
PLAN.ceil = (n) => PLAN.floorY[n] - 0 + (n === 1 ? PLAN.t0 - PLAN.floorY[1] : (n === 5 ? 22.6 - PLAN.floorY[5] : PLAN.TIER_H - PLAN.SLAB * 2)); // 층 바닥 → 천장(슬래브 아래) 높이
PLAN.stair = { x0: 8.3, x1: 13.1, z0: -12.0, z1: -5.0, entryZ: -4.4 };      // 계단실
PLAN.elev = { x0: -1.6, x1: 3.2, z0: -12.0, z1: -7.2 };                  // 화물 엘리베이터 승강로
PLAN.escA = { x0: -14.4, x1: -9.6, zTop: -1.5, zBot: 8.0 };             // 1→2층 에스컬레이터 (서쪽, 남→북 오름)
PLAN.escB = { x0: 10.2, x1: 15.0, zTop: 8.5, zBot: -1.0 };               // 2→3층 에스컬레이터 (동쪽, 북→남 오름)
