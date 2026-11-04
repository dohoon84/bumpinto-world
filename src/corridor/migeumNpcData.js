// [migeum-npc] 미금역 일대 NPC 밀도표 (순수 데이터/함수 — node 테스트에서 그대로 씀). 판교 #11 의 pangyoNpcData.js 와 같은 모양
//   미금은 업무지구가 아니라 역세권 상가·주거지: 출퇴근(역 출구)과 저녁 상가 쪽이 붐비고, 낮엔 장보기·병원·학원 오가는 사람 정도
//   보행 NPC: 코리더 보행 NPC 와 같은 아바타·같은 crowd(부품 종류 그대로) → draw call 0 추가. 라벨·소품·로고 없음
//   차량 NPC: jz-traffic(정자 일반 차량)과 같은 시뮬·같은 모델, 시간대 배수(densityFor)·종류 비율(mixFor)도 같은 함수를 쓴다

// 보행 NPC 상한: 판교(96)보다 작게. 배우 풀 = 상한(코리더 crowd 에 처음 한 번 등록 → 힙 ≈ 85kB/명, 60명 ≈ 5MB)
export const MAX_PEDS = 60;
// 시간(게임 시계) → 활성 인원. 출근 7:30–9:30 · 퇴근 18–20 최고, 점심·오후 장보기 중간, 밤 적게
const CURVE = [[0, 3], [5.5, 4], [7, 30], [8, 60], [9.5, 60], [10.5, 28], [12, 38], [13.5, 38], [15, 30], [17, 40], [18, 60], [20, 60], [21.5, 30], [23, 8], [24, 3]];
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
  if (h >= 11.5 && h < 14) return 'lunch';
  if (h >= 17.5 && h < 21) return 'evening';
  if (h >= 22 || h < 6) return 'night';
  return 'day';
}
// 장소 비중: exit(역 출입구 1–8번 앞) · walk(보도) · shop(1층 상가 앞)
export const PED_MIX = {
  morning: { exit: 0.6, walk: 0.3, shop: 0.1 },
  lunch: { exit: 0.15, walk: 0.35, shop: 0.5 },
  evening: { exit: 0.45, walk: 0.25, shop: 0.3 },
  day: { exit: 0.2, walk: 0.45, shop: 0.35 },
  night: { exit: 0.5, walk: 0.35, shop: 0.15 },
};
export function pedDensityAt(h) { const period = pedPeriod(h); return { count: Math.min(MAX_PEDS, pedCount(h)), period, mix: PED_MIX[period] }; }

// 차량: 기본 대수(시간대 배수 전). 정자(120)보다 적게 — 미금 박스의 '새 길'만 다닌다(큰길 구간은 코리더 차량)
export const MG_CARS_DEFAULT = 44, MG_CARS_MAX = 120;
// ?migeumcars=0 끔 · ?migeumcars=N 기본 대수
export function parseMigeumCars(params) {
  const v = params?.get?.('migeumcars');
  if (v == null || v === '') return { on: true, base: MG_CARS_DEFAULT };
  if (v === '0' || v === 'off' || v === 'false') return { on: false, base: 0 };
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? { on: true, base: Math.min(MG_CARS_MAX, n) } : { on: true, base: MG_CARS_DEFAULT };
}
