// 선물함 아이템 정의. 서버·릴레이·브라우저가 이 목록만 본다.
// 새 아이템은 GIFT_ITEMS 에 객체를 하나 추가한다.
//   seedQty  세상에 그 아이템이 하나도 없을 때 레드 탱크 관리자에게 넣는 수량
//   unit     선물 한 번에 차감·전달되는 개수
//   unitName 뱃지/버튼에 쓰는 단위 (대, 개)
//   vehId    있으면, 보유가 1 이상일 때만 그 탈것을 다른 사람에게 중계
// 소환·탑승 같은 화면 동작은 여기 넣지 않는다. 그런 아이템은 src/game.js 의 customGiftIds 에 id 를 넣고 동작을 따로 연결한다.
// 설명: addons/roadbike/README.md

export const GIFT_ITEMS = [
  {
    id: 'roadbike-cr1',
    icon: '🚲',
    name: 'CR·1 로드바이크',
    enName: 'CR·1 Road Bike',
    seedQty: 10, // 아직 아무도 없을 때 레드 탱크 관리자에게 넣는 수량
    unit: 1, // 선물 1회에 넘어가는 개수
    unitName: '대',
    vehId: 902, // 이 수량이 1 이상일 때만 중계하는 탈것 id
  },
  {
    id: 'roadbike-cr1-white',
    icon: '🚲',
    name: 'CR·1 로드바이크 화이트',
    enName: 'CR·1 Road Bike White',
    seedQty: 10,
    unit: 1,
    unitName: '대',
    vehId: 903,
  },
];

const byId = new Map(GIFT_ITEMS.map((it) => [it.id, it]));

export function giftItem(id) {
  return byId.get(id) || null;
}

export function giftItemByVeh(vehId) {
  const id = vehId | 0;
  return GIFT_ITEMS.find((it) => it.vehId === id) || null;
}

export function giftUnit(id) {
  const n = giftItem(id)?.unit;
  return Math.max(1, Math.floor(Number(n) || 1));
}

/** @returns {number} */
export function qtyOf(list, itemId) {
  if (!itemId || !Array.isArray(list)) return 0;
  let n = 0;
  for (const g of list) {
    if (typeof g === 'string') {
      if (g === itemId) n += 1;
      continue;
    }
    if (g && g.id === itemId) n += Math.max(0, Math.floor(Number(g.qty) || 0));
  }
  return n;
}

/** 카탈로그에 있는 아이템만, id 당 수량 하나로 모은다. */
export function normalizeHoldings(raw) {
  const totals = new Map();
  if (!Array.isArray(raw)) return [];
  for (const g of raw) {
    const id = typeof g === 'string' ? g : g?.id;
    if (!giftItem(id)) continue;
    const add = typeof g === 'string' ? 1 : Math.max(0, Math.floor(Number(g.qty) || 0));
    if (add > 0) totals.set(id, (totals.get(id) || 0) + add);
  }
  return GIFT_ITEMS
    .filter((it) => (totals.get(it.id) || 0) > 0)
    .map((it) => ({ id: it.id, qty: totals.get(it.id) }));
}

/** 다른 아이템 수량은 유지한 채 한 종류의 보유만 바꾼다. */
export function withQty(list, itemId, qty) {
  if (!giftItem(itemId)) return normalizeHoldings(list);
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const base = normalizeHoldings(list).filter((g) => g.id !== itemId);
  if (n > 0) base.push({ id: itemId, qty: n });
  return normalizeHoldings(base);
}

/** 로컬/목업에서 첫 접속자에게 주는 초기 보유. */
export function seedList() {
  return GIFT_ITEMS
    .filter((it) => Math.floor(Number(it.seedQty) || 0) > 0)
    .map((it) => ({ id: it.id, qty: Math.floor(Number(it.seedQty) || 0) }));
}
