// [depot] 매장 전체 상품 카탈로그 — 패러디 범 브랜드, 로고·실존 상표 없음.
//   size m(가로 x · 높이 y · 깊이 z), kg, 가격 원. data 태그는 real / derived / est 만.
//   기존 PRODUCTS(egg, water, rice, …)는 그대로 두고, 여기 목록을 registerStockProducts() 로 합친다.
import { PRODUCTS, BY_ID } from './products.js';

// 창고형 할인점 대용량 기준. 출처가 있으면 real/derived, 없으면 est(근거는 note).
export const STOCK_PRODUCTS = [
  // ----- 음료 -----
  { id: 'juice', name: '범주스 1.8L×6', sub: '사과 100% 과즙', size: [0.32, 0.30, 0.22], kg: 11.4, price: 14980, color: '#f3c44d', ink: '#6a2a00', kind: 'box',
    data: { size: 'est 1.8L 펫 ×6 트레이 (병 지름 ~90mm)', kg: 'derived 1.8×6 + PET·트레이 약 0.6kg', price: 'est 게임 가안' } },
  { id: 'ion', name: '범이온 1.5L×12', sub: '이온음료 18L', size: [0.39, 0.306, 0.286], kg: 18.6, price: 15980, color: '#3aa0d8', ink: '#fff', kind: 'box',
    data: { size: 'derived 1.5L×12 케이스 390×286×306mm (Henderson 동형)', kg: 'est 내용물 18kg + PET', price: 'est 게임 가안' } },
  { id: 'tea', name: '범보리차 1.5L×12', sub: '무라벨 차음료', size: [0.39, 0.306, 0.286], kg: 18.4, price: 12980, color: '#d9b48a', ink: '#4a2a12', kind: 'box',
    data: { size: 'derived 1.5L×12 케이스 동형', kg: 'est', price: 'est 게임 가안' } },
  // ----- 라면·즉석 -----
  { id: 'cupramen', name: '범컵면 12입', sub: '대컵 110g ×12', size: [0.46, 0.13, 0.34], kg: 1.55, price: 12900, color: '#e2572a', ink: '#fff6d6', kind: 'box',
    data: { size: 'est 대컵 Ø110×H120 4×3 배열', kg: 'derived 110g×12 + 트레이 0.23kg', price: 'est 게임 가안' } },
  { id: 'ricepack', name: '범즉석밥 24입', sub: '백미 210g ×24', size: [0.47, 0.22, 0.32], kg: 5.3, price: 26900, color: '#f4efe3', ink: '#8a1d1d', kind: 'box',
    data: { size: 'est 210g 컵 원통 2단 트레이', kg: 'derived 0.21×24 + 포장 0.26kg', price: 'est 창고형 할인가 가안' } },
  { id: 'canned', name: '범참치 24캔', sub: '살코기 150g ×24', size: [0.42, 0.16, 0.28], kg: 4.6, price: 24900, color: '#2f6f9e', ink: '#fff', kind: 'box',
    data: { size: 'est 150g 캔 4×6 슬리브', kg: 'derived 0.15×24 + 캔·박스 1.0kg', price: 'est 게임 가안' } },
  { id: 'sauce', name: '범고추장 2.5kg', sub: '태양초 맛 페일', size: [0.17, 0.18, 0.17], kg: 2.65, price: 11900, color: '#8b1e1e', ink: '#f6e7cf', kind: 'box',
    data: { size: 'est 원형 페일에 가까운 상자 대용 170mm', kg: 'derived 2.5kg + 용기 0.15kg', price: 'est 게임 가안' } },
  // ----- 과자 -----
  { id: 'choco', name: '범초코파이 48입', sub: '개별포장 48개', size: [0.38, 0.18, 0.26], kg: 1.92, price: 13900, color: '#5a2a1a', ink: '#f6e7cf', kind: 'box',
    data: { size: 'est 파이 지름 70mm 스택 박스', kg: 'est 개당 35~40g ×48 + 박스', price: 'est 게임 가안' } },
  { id: 'cookie', name: '범쿠키 1.5kg', sub: '버터맛 대용량 봉지', size: [0.28, 0.36, 0.12], kg: 1.52, price: 9990, color: '#e8c07a', ink: '#5a2a00', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'z', pillowFaces: ['side', 'side', 'top', 'top', 'front', 'front'],
    data: { size: 'est', kg: 'derived 1.5kg + 봉지 20g', price: 'est 게임 가안' } },
  { id: 'cereal', name: '범시리얼 1.2kg×2', sub: '옥수수 플레이크', size: [0.40, 0.32, 0.16], kg: 2.5, price: 12980, color: '#f2d04b', ink: '#1e4a8a', kind: 'box',
    data: { size: 'est 대용량 상자 2입 슬리브', kg: 'derived 1.2×2 + 상자', price: 'est 게임 가안' } },
  // ----- 곡물 -----
  { id: 'grain', name: '범잡곡 8kg', sub: '혼합곡 봉지', size: [0.32, 0.12, 0.48], kg: 8.05, price: 21900, color: '#c9a66b', ink: '#3a2412', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y', pillowFaces: ['side', 'side', 'top', 'top', 'side', 'side'],
    data: { size: 'est 8kg 포대 채운 두께 120mm', kg: 'real 8kg + 포대 50g', price: 'est 게임 가안' } },
  { id: 'flour', name: '범밀가루 5kg×2', sub: '중력분', size: [0.36, 0.16, 0.28], kg: 10.2, price: 8990, color: '#f3efe6', ink: '#4a3a28', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y',
    data: { size: 'est 5kg 봉지 2입', kg: 'derived 5×2 + 포장', price: 'est 게임 가안' } },
  // ----- 생활·세제·주방 -----
  { id: 'detergent', name: '범세제 5.5L', sub: '일반 세탁용 액상', size: [0.22, 0.34, 0.14], kg: 5.7, price: 14990, color: '#2f6fb0', ink: '#fff', kind: 'box',
    data: { size: 'est 핸들형 통 외접 상자', kg: 'derived 비중 ≈1.03 ×5.5L + 통', price: 'est 창고형 할인가 가안' } },
  { id: 'dishsoap', name: '범주방세제 2.5L×2', sub: '레몬향', size: [0.28, 0.28, 0.14], kg: 5.2, price: 9990, color: '#3cb54a', ink: '#fff', kind: 'box',
    data: { size: 'est 2.5L 리필 2입', kg: 'derived 2.5×2 + 포장', price: 'est 게임 가안' } },
  { id: 'towel', name: '범키친타월 12롤', sub: '2겹 60매', size: [0.28, 0.28, 0.22], kg: 1.8, price: 15900, color: '#f7f3ea', ink: '#1E5A45', kind: 'soft', soft: true, shape: 'rolls', grid: [3, 2],
    data: { size: 'est 롤 Ø90×H220 3×2×2단 중 한 단 높이로 단순화', kg: 'est', price: 'est 게임 가안' } },
  { id: 'wrap', name: '범랩 30cm×500m', sub: '업소용 랩 2입', size: [0.33, 0.10, 0.18], kg: 1.15, price: 12900, color: '#e8f4fb', ink: '#0d5ea8', kind: 'box',
    data: { size: 'est 업소용 랩 박스 2입', kg: 'est', price: 'est 게임 가안' } },
  { id: 'foil', name: '범호일 30cm×100m', sub: '알루미늄 호일 2입', size: [0.33, 0.08, 0.16], kg: 1.05, price: 11900, color: '#cfcfd4', ink: '#22262A', kind: 'box',
    data: { size: 'est', kg: 'est', price: 'est 게임 가안' } },
  { id: 'trashbag', name: '범종량제 100매', sub: '75L 쓰레기봉투', size: [0.30, 0.12, 0.22], kg: 1.4, price: 18900, color: '#3a3a3a', ink: '#f3eada', kind: 'box',
    data: { size: 'est', kg: 'est', price: 'est 지자체 봉투 대용 가안(패러디)' } },
  // ----- 냉장 -----
  { id: 'milk', name: '범우유 1L×10', sub: '흰우유 살균', size: [0.36, 0.20, 0.15], kg: 10.4, price: 12900, color: '#f4f6fa', ink: '#1e4a8a', kind: 'box',
    data: { size: 'est 1L 가블탑 10입 트레이 360×150×200', kg: 'derived 1.03×10 + 팩·트레이', price: 'est 게임 가안' } },
  { id: 'yogurt', name: '범요거트 2kg', sub: '플레인 대용량 통', size: [0.19, 0.16, 0.19], kg: 2.12, price: 7990, color: '#fff6f0', ink: '#c45a2a', kind: 'box',
    data: { size: 'est 2kg 원통 통 외접', kg: 'derived 2kg + 통 120g', price: 'est 게임 가안' } },
  { id: 'cheese', name: '범치즈 1.8kg', sub: '슬라이스 96매', size: [0.28, 0.10, 0.20], kg: 1.88, price: 18900, color: '#f5d76e', ink: '#6a3a00', kind: 'box',
    data: { size: 'est', kg: 'derived 1.8kg + 포장', price: 'est 게임 가안' } },
  { id: 'butter', name: '범버터 454g×4', sub: '무염 블록 4입', size: [0.24, 0.10, 0.16], kg: 1.9, price: 15900, color: '#f3e27a', ink: '#5a3a00', kind: 'box',
    data: { size: 'est 454g 블록(북미 1 lb) 4입', kg: 'derived 0.454×4 + 포장', price: 'est 게임 가안' } },
  // ----- 냉동 -----
  { id: 'mandu', name: '범만두 1.4kg×2', sub: '고기만두 두 봉', size: [0.32, 0.10, 0.24], kg: 2.85, price: 15980, color: '#c9454a', ink: '#fff', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y',
    data: { size: 'est 납작 냉동 봉지 2입', kg: 'derived 1.4×2 + 봉지', price: 'est 게임 가안' } },
  { id: 'pizza', name: '범피자 3판', sub: '페퍼로니 냉동', size: [0.33, 0.16, 0.33], kg: 1.95, price: 18900, color: '#d9442e', ink: '#fff6d6', kind: 'box',
    data: { size: 'est 12인치급 납작 상자 3단', kg: 'est 판당 ~600g + 상자', price: 'est 게임 가안' } },
  { id: 'icecream', name: '범아이스크림 4L', sub: '바닐라 패일', size: [0.21, 0.19, 0.21], kg: 2.2, price: 12900, color: '#f7f1de', ink: '#6a4a20', kind: 'box',
    data: { size: 'est 4L 원통 패일 외접', kg: 'est 오버런 있는 아이스크림 ~2.1kg + 통', price: 'est 게임 가안' } },
  { id: 'friedrice', name: '범볶음밥 6입', sub: '김치볶음밥 650g ×6', size: [0.40, 0.12, 0.28], kg: 4.05, price: 16900, color: '#e8a03a', ink: '#3a1a00', kind: 'box',
    data: { size: 'est 납작 파우치 6입 박스', kg: 'derived 0.65×6 + 박스', price: 'est 게임 가안' } },
  { id: 'dumpling2', name: '범왕교자 1.8kg', sub: '냉동 교자', size: [0.30, 0.08, 0.22], kg: 1.85, price: 12980, color: '#8a2a1a', ink: '#f6e7cf', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y',
    data: { size: 'est', kg: 'derived 1.8kg + 봉지', price: 'est 게임 가안' } },
  // ----- 정육·수산 -----
  { id: 'beef', name: '범한우 등심', sub: '구이용 1kg 트레이', size: [0.28, 0.055, 0.20], kg: 1.08, price: 58900, color: '#a8323a', ink: '#fff', kind: 'tray', shape: 'tray',
    data: { size: 'est 대형 스티로폼 트레이 280×200', kg: 'est 고기 1kg + 트레이·랩 80g', price: 'est 게임 가안(한우 등심 시세 변동 큼)' } },
  { id: 'salmon', name: '범연어 필렛', sub: '생연어 1kg', size: [0.32, 0.06, 0.18], kg: 1.08, price: 32900, color: '#e07a62', ink: '#fff', kind: 'tray', shape: 'tray',
    data: { size: 'est 필렛 트레이 320×180', kg: 'est 1kg + 트레이', price: 'est 게임 가안' } },
  { id: 'mackerel', name: '범고등어 10팩', sub: '순살 구이용', size: [0.36, 0.10, 0.26], kg: 2.4, price: 24900, color: '#9fb2c2', ink: '#1a2a3a', kind: 'box',
    data: { size: 'est 진공팩 10입 박스', kg: 'est', price: 'est 게임 가안' } },
  { id: 'chicken', name: '범닭 생닭 2마리', sub: '토종 아닌 일반 1.1kg×2', size: [0.30, 0.14, 0.24], kg: 2.3, price: 14900, color: '#f3d3b0', ink: '#5a2a1a', kind: 'tray', shape: 'tray',
    data: { size: 'est', kg: 'est 1.1×2 + 포장', price: 'est 게임 가안' } },
  // ----- 과일·채소 -----
  { id: 'apple', name: '범사과 5kg', sub: '세척 사과 박스', size: [0.40, 0.22, 0.30], kg: 5.3, price: 19900, color: '#d9442e', ink: '#fff', kind: 'box',
    data: { size: 'est 5kg 골판지 과일 상자', kg: 'derived 5kg + 상자 0.3kg', price: 'est 게임 가안' } },
  { id: 'mandarin', name: '범귤 5kg', sub: '노지 감귤 박스', size: [0.38, 0.20, 0.28], kg: 5.25, price: 15900, color: '#f08a28', ink: '#4a2200', kind: 'box',
    data: { size: 'est 5kg 골판지 상자', kg: 'derived 5kg + 상자', price: 'est 게임 가안' } },
  { id: 'onion', name: '범양파 5kg', sub: '망 포대', size: [0.32, 0.18, 0.28], kg: 5.05, price: 7990, color: '#c9a45a', ink: '#3a2412', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y',
    data: { size: 'est 5kg 망 포대', kg: 'real 5kg + 망 50g', price: 'est 게임 가안' } },
  { id: 'cabbage', name: '범배추 3포기', sub: '김장용 절임 전', size: [0.46, 0.28, 0.32], kg: 7.5, price: 9900, color: '#dce8c8', ink: '#2a4a1a', kind: 'box',
    data: { size: 'est 3포기 묶음 외형', kg: 'est 포기당 2.3~2.7kg', price: 'est 시세 변동 큼 · 게임 가안' } },
  { id: 'banana', name: '범바나나 3송이', sub: '실속 박스', size: [0.40, 0.16, 0.26], kg: 4.2, price: 8900, color: '#f2d04b', ink: '#4a3a00', kind: 'box',
    data: { size: 'est', kg: 'est 송이당 ~1.3kg ×3 + 박스', price: 'est 게임 가안' } },
  // ----- 베이커리 -----
  { id: 'muffin', name: '범머핀 12입', sub: '초코칩 대용량 박스', size: [0.40, 0.12, 0.30], kg: 1.15, price: 12900, color: '#7a3a1a', ink: '#f6e7cf', kind: 'box',
    data: { size: 'est 머핀 Ø80 4×3 한 단 박스', kg: 'est 개당 ~90g ×12 + 박스', price: 'est 게임 가안' } },
  { id: 'croissant', name: '범크루아상 12입', sub: '버터 크루아상', size: [0.38, 0.12, 0.26], kg: 0.95, price: 14900, color: '#e8c07a', ink: '#5a2a00', kind: 'box',
    data: { size: 'est 12입 페이퍼 박스', kg: 'est 개당 ~70g ×12 + 박스', price: 'est 게임 가안' } },
  { id: 'bread', name: '범식빵 3봉', sub: '우유식빵 900g×3', size: [0.32, 0.16, 0.36], kg: 2.8, price: 9900, color: '#f3e6c8', ink: '#6a3a10', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y',
    data: { size: 'est 식빵 봉 3입', kg: 'derived 0.9×3 + 포장', price: 'est 게임 가안' } },
  { id: 'rotisserie', name: '범로스트치킨', sub: '통닭 한 마리 온열', size: [0.24, 0.16, 0.16], kg: 1.15, price: 9900, color: '#c45a1a', ink: '#fff', kind: 'tray', shape: 'tray',
    data: { size: 'est 용기 지름 240mm', kg: 'est 완제품 ~1.1kg + 용기', price: 'est 게임 가안' } },
  // ----- 주류 (패러디) -----
  { id: 'beer', name: '범맥주 500ml×24', sub: '라거 캔 한 박스', size: [0.41, 0.17, 0.27], kg: 12.6, price: 28900, color: '#c8963a', ink: '#1a1a12', kind: 'box',
    data: { size: 'est 500ml 캔 24입 표준 케이스', kg: 'derived 0.5×24 + 캔·박스 ~0.6kg', price: 'est 게임 가안' } },
  { id: 'soju', name: '범소주 360ml×20', sub: '깔끔한 맛 한 박스', size: [0.36, 0.24, 0.30], kg: 8.4, price: 21900, color: '#1a3a4a', ink: '#f3eada', kind: 'box',
    data: { size: 'est 360ml 병 20입 케이스', kg: 'derived 0.36×20 + 병·박스', price: 'est 게임 가안' } },
  // ----- 의류·잡화 -----
  { id: 'socks', name: '범양말 10족', sub: '일상용 크루 삭스', size: [0.28, 0.12, 0.20], kg: 0.55, price: 12900, color: '#2a3a4a', ink: '#f3eada', kind: 'soft', soft: true,
    data: { size: 'est 비닐 팩', kg: 'est', price: 'est 게임 가안' } },
  { id: 'towelset', name: '범수건 6장', sub: '면 타월 세트', size: [0.35, 0.16, 0.28], kg: 1.6, price: 19900, color: '#e8eef4', ink: '#1E5A45', kind: 'soft', soft: true,
    data: { size: 'est 접은 타월 팩', kg: 'est 장당 ~250g ×6 + 밴드', price: 'est 게임 가안' } },
  // ----- 계절·캠핑·김장 -----
  { id: 'duvet', name: '범이불 차렵', sub: '싱글 사계절', size: [0.50, 0.22, 0.38], kg: 2.4, price: 39900, color: '#4a6a8a', ink: '#fff', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y',
    data: { size: 'est 압축 팩', kg: 'est', price: 'est 게임 가안' } },
  { id: 'hotpack', name: '범핫팩 40매', sub: '붙이는 타입', size: [0.28, 0.16, 0.18], kg: 1.3, price: 8990, color: '#d9442e', ink: '#fff', kind: 'box',
    data: { size: 'est', kg: 'est', price: 'est 게임 가안' } },
  { id: 'kimchi', name: '범김장통 60L', sub: '김장 전용 사각통', size: [0.52, 0.36, 0.38], kg: 2.1, price: 24900, color: '#d44a2a', ink: '#fff', kind: 'box',
    data: { size: 'est 60L 사각 김치통', kg: 'est 빈 통 무게', price: 'est 게임 가안' } },
  { id: 'tent', name: '범텐트 4인용', sub: '원터치 캠핑 텐트', size: [0.62, 0.28, 0.28], kg: 4.8, price: 79000, color: '#2d6a45', ink: '#f3eada', kind: 'box',
    data: { size: 'est 캐리백 형태를 상자로 단순화', kg: 'est 4인용 원터치 평균', price: 'est 게임 가안' } },
  { id: 'chair', name: '범캠핑체어', sub: '접이식 2개입', size: [0.86, 0.18, 0.22], kg: 5.6, price: 39900, color: '#3a3a3a', ink: '#f2c230', kind: 'box',
    data: { size: 'est 접힌 프레임 2입', kg: 'est 개당 ~2.7kg ×2 + 가방', price: 'est 게임 가안' } },
  // ----- 펫 -----
  { id: 'petfood', name: '범사료 8kg', sub: '성견 건식', size: [0.36, 0.14, 0.52], kg: 8.1, price: 32900, color: '#6a4a28', ink: '#f3eada', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'y',
    data: { size: 'est 8kg 사료 포대', kg: 'real 8kg + 포대', price: 'est 게임 가안' } },
  { id: 'petpad', name: '범배변패드 100매', sub: '대형 패드', size: [0.46, 0.18, 0.32], kg: 3.4, price: 22900, color: '#e8eef4', ink: '#1e4a8a', kind: 'box',
    data: { size: 'est', kg: 'est', price: 'est 게임 가안' } },
  { id: 'pettreat', name: '범펫간식 1.2kg', sub: '져키 대용량', size: [0.26, 0.28, 0.12], kg: 1.25, price: 15900, color: '#c45a2a', ink: '#fff', kind: 'bag', soft: true, shape: 'pillow', pillowAxis: 'z',
    data: { size: 'est', kg: 'derived 1.2kg + 봉지', price: 'est 게임 가안' } },
];

export function registerStockProducts() {
  for (const p of STOCK_PRODUCTS) {
    if (!BY_ID[p.id]) { PRODUCTS.push(p); BY_ID[p.id] = p; }
  }
  return STOCK_PRODUCTS;
}

// 통로·구역별 진열 SKU (선반용). 앞쪽이 주력.
export const AISLE_PLAN = {
  // 왼쪽 랙 사이 통로 (x 중심) × z 블록 A 14–41
  kitchen: ['wrap', 'foil', 'dishsoap', 'towel'],
  household: ['tissue', 'detergent', 'trashbag', 'towel'],
  snack: ['chips', 'choco', 'cookie', 'cereal'],
  grainAisle: ['rice', 'grain', 'flour', 'sauce'],
  ramenAisle: ['ramen', 'cupramen', 'ricepack', 'canned'],
  drinks: ['water', 'soda', 'juice', 'ion', 'tea', 'bottle'],
  riceRamen: ['rice', 'ramen', 'cupramen', 'grain'],
  // z 블록 B 47–74
  sauceAisle: ['sauce', 'canned', 'wrap', 'foil'],
  snack2: ['chips', 'choco', 'cookie', 'cereal'],
  drinks2: ['water', 'soda', 'juice', 'ion', 'tea'],
  household2: ['tissue', 'detergent', 'dishsoap', 'trashbag'],
  instant2: ['ramen', 'cupramen', 'ricepack', 'canned'],
  paper: ['tissue', 'towel', 'wrap'],
  // z 블록 C 80–107
  cerealAisle: ['cereal', 'cookie', 'choco', 'flour'],
  cannedAisle: ['canned', 'sauce', 'ricepack', 'cupramen'],
  drinks3: ['ion', 'tea', 'juice', 'water'],
  household3: ['detergent', 'dishsoap', 'trashbag', 'tissue'],
};

export const PICKABLE_IDS = new Set([
  'egg', 'water', 'rice', 'tissue', 'ramen', 'chips', 'soda', 'melon', 'meat', 'bottle',
  'juice', 'ion', 'cupramen', 'ricepack', 'choco', 'cookie', 'grain', 'detergent',
  'milk', 'yogurt', 'cheese', 'mandu', 'pizza', 'icecream', 'beef', 'salmon',
  'apple', 'mandarin', 'onion', 'muffin', 'croissant', 'bread', 'beer', 'soju',
  'socks', 'petfood', 'kimchi', 'tent', 'rotisserie', 'chicken',
]);
