// [depot] 범창고 샘플 상품 7종 — 패러디 이름, 로고 없음. 크기 m(가로 x · 높이 y · 깊이 z), 무게 kg, 가격 원.
//   real: 출처가 있는 값 / est: 추정(근거는 note). 기획안 Page '대용량 상품 카탈로그' 와 같은 숫자.
export const PRODUCTS = [
  { id: 'egg', name: '범란 30구', sub: '대란 1,560g', size: [0.305, 0.07, 0.305], kg: 1.63, price: 8480, color: '#e9d3a8', ink: '#7a4b12', kind: 'egg',
    data: { size: 'real 트레이 300~310×300~310×51mm(Kunze) + 알 높이', kg: 'real 대란 1,560g(SSG)+트레이 70g', price: 'real SSG 8,480원' } },
  { id: 'water', name: '범샘물 2L×6', sub: '먹는샘물 12L', size: [0.272, 0.315, 0.22], kg: 13.0, price: 3498, color: '#cfe9fb', ink: '#0d5ea8', kind: 'box', shape: 'bottles', grid: [3, 2], labelU: [0, 1 / 3],
    data: { size: 'real 272×220×315mm', kg: 'real 13.0kg (후지 2L×6 사양)', price: 'derived 코스트코 2L×6×6 20,990원 ÷ 6' } },
  { id: 'rice', name: '범쌀 20kg', sub: '햅쌀 상등급', size: [0.4, 0.13, 0.6], kg: 20.0, price: 63243, color: '#f3efe2', ink: '#8a1d1d', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y', pillowFaces: ['side', 'side', 'top', 'top', 'side', 'side'],
    data: { size: 'est 포대 415×635mm(팩마트, 평면) → 채운 두께 130mm 추정', kg: 'real 20kg', price: 'real KAMIS 2026-11-11 소매 평균' } },
  { id: 'tissue', name: '보들범 30롤', sub: '3겹 40m 화장지', size: [0.5, 0.33, 0.4], kg: 4.5, price: 22490, color: '#f7f7fb', ink: '#2a6fdb', kind: 'soft', soft: true, shape: 'rolls', grid: [5, 4],
    data: { size: 'est 롤 폭 96~98mm(다나와) × 5×3×2단 배열', kg: 'est 측정 필요', price: 'real 코스트코 매장가 22,490원(블로그)' } },
  { id: 'ramen', name: '범라면 40봉', sub: '얼큰한 맛 한 박스', size: [0.54, 0.3, 0.39], kg: 4.8, price: 29900, color: '#d9473b', ink: '#fff6d6', kind: 'box',
    data: { size: 'est 봉지 40개 박스 외형 추정', kg: 'real 4.8kg (11번가 40봉 총중량)', price: 'est 미확인' } },
  { id: 'chips', name: '와삭범 감자칩', sub: '소금맛 500g', size: [0.3, 0.42, 0.13], kg: 0.5, price: 8990, color: '#f4c430', ink: '#7b1fa2', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'z', pillowFaces: ['side', 'side', 'top', 'top', 'front', 'front'],
    data: { size: 'est', kg: 'est', price: 'est' } },
  { id: 'soda', name: '범콜라 1.5L×12', sub: '탄산 18L', size: [0.39, 0.306, 0.286], kg: 18.5, price: 34160, color: '#b71c1c', ink: '#ffffff', kind: 'box', shape: 'bottles', grid: [4, 3], labelU: [0.1, 0.9],
    data: { size: 'real 390×286×306mm (Henderson 12×1.5L 케이스)', kg: 'est 내용물 18kg + PET', price: 'real 34,160원 최저가(폴센트)' } },
  // 2차: 상자 아닌 모양
  { id: 'melon', name: '범수박 1통', sub: '당도 11 Brix 이상', size: [0.25, 0.25, 0.25], kg: 7.0, price: 19900, color: '#3f8f3a', ink: '#fff', kind: 'round', shape: 'sphere',
    data: { size: 'est 지름 25cm (중간 크기 수박)', kg: 'est 6~8kg 대과 평균', price: 'est 게임 가안' } },
  { id: 'meat', name: '범한돈 삼겹살', sub: '구이용 1kg 트레이', size: [0.26, 0.05, 0.19], kg: 1.05, price: 25900, color: '#c9454a', ink: '#fff', kind: 'tray', shape: 'tray',
    data: { size: 'est 대형 스티로폼 트레이 260×190', kg: 'est 고기 1kg + 트레이·랩 50g', price: 'est 게임 가안' } },
  { id: 'bottle', name: '범샘물 2L 낱병', sub: '먹는샘물 2L', size: [0.09, 0.315, 0.09], kg: 2.04, price: 650, color: '#cfe9fb', ink: '#0d5ea8', kind: 'bottle', shape: 'cyl', tex: 'water',
    data: { size: 'est 2L×6 묶음 272×220×315 에서 병 1개 ≈ Ø90×315', kg: 'est 물 2kg + PET 약 40g', price: 'derived 2L×6 3,498원 ÷ 6 ≈ 583 → 650원(낱개 가안)' } },
];
export const BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// 카트(참고 이미지 1040×585×1020mm, 앞 깊이 440mm, 휠베이스 745mm) + 기획안 물리 상수
export const CART = {
  mass: 27, // kg (240L 금속 카트, Cart-city)
  maxLoad: 240, // kg 허용 하중
  crr: 0.03, // 경질 우레탄 0.025~0.035 (CasterHQ)
  breakaway: 2, // 출발 힘 = 굴림 저항 × 1.5~3 (CasterHQ) → 2
  // 게임 보정 GAME_BOOST ×1.4 (플레이테스트: 너무 느림). 실측 기준값: 미는 힘 133 N(30 lb, NIOSH/Snook) · 처음 222 N(50 lb) · 걷기 1.3 m/s
  push: 133 * 1.4, // N
  pushPeak: 222 * 1.4, // N
  g: 9.81,
  walk: 1.3 * 1.4, run: 1.8 * 1.4, // m/s
  handTorque: 2 * 133 * 0.29 * 1.3, // N·m 두 손 반대로 (손잡이 반폭 0.29 m, 추정) × 게임 보정
  scrubMu: 0.3, scrubArm: 0.05, // 회전 바퀴 마찰 토크 (기획안 식 2, 추정)
  latK: 150, // N·s/m 옆 미끄럼 감쇠 (추정)
};
export const EGG = { mean: 34, sd: 6, axialMean: 41 }; // N, 계란 한 알 파괴 하중 (ICF11: 옆 34±6, 세로 41±8)
