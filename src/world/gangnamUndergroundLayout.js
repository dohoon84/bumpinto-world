// 강남역 지하상가 배치 (three 없음). PLAN.md 참고.
// +x 동(테헤란로), +z 남(양재), y 위. 바닥 y=0.
// 출구 묶음은 역 중심 나침반이 아니라 실제 도로 방향을 따른다 (가정은 PLAN 7장).

export const CEIL = 3.55;
export const HALF = 3.8;
export const SHOP_D = 5.15;
export const SHOP_W = 3.9;
export const OPEN_W = 2.25;
export const EW = { x0: -50, x1: 50 };
export const NORTH_Z = -30;
export const SOUTH_Z = 68;
export const PLAZA = { x0: -10.2, x1: 10.2 };
export const FOOD = { z0: 40, z1: 54, hw: 13 };
export const L2HALL = { x0: 12.2, x1: 30.2, z0: -27.5, z1: -8.15 };
export const PASSAGE_LEN = 6.2;
export const DROP = 4.2;
export const RUN = DROP / Math.tan(Math.PI / 6);

export const TYPES = {
  fashion: { wall: '#f3ece1', accent: '#e8590c', floor: '#e7d8c4', ko: '의류', en: 'Fashion' },
  accessories: { wall: '#fff0f6', accent: '#e64980', floor: '#f7e0eb', ko: '액세서리', en: 'Accessories' },
  cosmetics: { wall: '#fff5f5', accent: '#f06595', floor: '#f8e4e8', ko: '화장품', en: 'Beauty' },
  phone: { wall: '#eef3f6', accent: '#22b8cf', floor: '#e3ebf0', ko: '폰케이스', en: 'Phone cases' },
  cafe: { wall: '#fff4e6', accent: '#d9480f', floor: '#ead3b5', ko: '카페', en: 'Cafe' },
  snack: { wall: '#fff0e4', accent: '#e8590c', floor: '#efd0ae', ko: '분식', en: 'Snacks' },
  shoes: { wall: '#f2ebe2', accent: '#8d6e63', floor: '#e2d2c0', ko: '신발', en: 'Shoes' },
  flower: { wall: '#ebfbee', accent: '#2f9e44', floor: '#d3f9d8', ko: '꽃집', en: 'Flowers' },
};

export const SIGN_COLORS = {
  fashion: ['#e8590c', '#c2255c', '#1c7ed6', '#2b8a3e', '#e67700', '#495057'],
  accessories: ['#e64980', '#be4bdb', '#f06595', '#ae3ec9', '#d6336c'],
  cosmetics: ['#f06595', '#e64980', '#fa5252', '#ff6b6b', '#d6336c'],
  phone: ['#1098ad', '#1c7ed6', '#15aabf', '#0b7285', '#3bc9db'],
  cafe: ['#d9480f', '#c05621', '#e8590c', '#862e2e'],
  snack: ['#e8590c', '#f08c00', '#d9480f', '#c2255c'],
  shoes: ['#8d6e63', '#5f3dc4', '#495057', '#795548'],
  flower: ['#2f9e44', '#37b24d', '#e64980', '#f08c00'],
};

// 전부 지어낸 이름. 실제 지하상가 상호·브랜드는 쓰지 않는다.
export const NAMES = {
  fashion: [
    ['늘봄옷장', 'Always Spring'], ['골목니트', 'Alley Knit'], ['노란단추', 'Yellow Button'],
    ['가벼운옷', 'Light Wear'], ['구름셔츠', 'Cloud Shirt'], ['작은옷가게', 'Little Closet'],
    ['봄날옷', 'Spring Day'], ['느린바느질', 'Slow Stitch'], ['흰옷가게', 'White Rack'],
    ['골목청바지', 'Alley Denim'], ['오늘셔츠', 'Today Shirt'], ['단정한옷', 'Neat Wear'],
    ['무지개옷장', 'Rainbow Rack'], ['초록소매', 'Green Sleeve'], ['가벼운발걸음', 'Light Step'],
    ['오후옷장', 'Afternoon'], ['얇은코트', 'Thin Coat'], ['골목후드', 'Alley Hood'],
  ],
  accessories: [
    ['반짝상점', 'Twinkle'], ['작은고리', 'Little Hoop'], ['달빛귀걸이', 'Moonlight'],
    ['은실가게', 'Silver Thread'], ['구슬상자', 'Bead Box'], ['얇은목걸이', 'Thin Chain'],
    ['골목반지', 'Alley Ring'], ['반짝이점', 'Spark Shop'], ['작은핀', 'Tiny Pin'],
    ['아침리본', 'Morning Ribbon'], ['둥근귀걸이', 'Round Earring'],
  ],
  cosmetics: [
    ['분홍거울', 'Pink Mirror'], ['맑은결', 'Clear Glow'], ['고운화장', 'Soft Color'],
    ['새벽크림', 'Dawn Cream'], ['작은화장대', 'Little Vanity'], ['보송파우더', 'Soft Powder'],
    ['이슬화장', 'Dew Beauty'], ['고운손', 'Gentle Hands'],
  ],
  phone: [
    ['케이스골목', 'Case Alley'], ['필름가게', 'Film Shop'], ['얇은보호막', 'Thin Film'],
    ['그림케이스', 'Picture Case'], ['작은통신', 'Little Phone'], ['골목케이스', 'Alley Case'],
  ],
  cafe: [
    ['깊은잔', 'Deep Cup'], ['작은로스터', 'Little Roast'], ['밤사이커피', 'Night Coffee'],
    ['따뜻한컵', 'Warm Cup'], ['골목원두', 'Alley Beans'], ['이른모닝', 'Early Morning'],
  ],
  snack: [
    ['김밥골목', 'Gimbap Alley'], ['호떡집', 'Hotteok House'], ['어묵한그릇', 'One Fishcake'],
    ['계란빵가게', 'Egg Bread'], ['분식코너', 'Snack Corner'], ['튀김접시', 'Fry Plate'],
    ['떡볶이골목', 'Tteokbokki Lane'], ['따뜻한어묵', 'Warm Eomuk'],
  ],
  shoes: [
    ['편한구두', 'Easy Shoes'], ['흰운동화', 'White Sneaker'], ['골목구두', 'Alley Shoes'],
    ['느린신발', 'Slow Shoes'],
  ],
  flower: [
    ['작은꽃집', 'Little Flowers'], ['아침꽃다발', 'Morning Bouquet'],
  ],
};

const inR = (r, x, z, m = 0) => r && x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
export const rect = (x0, x1, z0, z1) => ({
  x0: Math.min(x0, x1), x1: Math.max(x0, x1),
  z0: Math.min(z0, z1), z1: Math.max(z0, z1),
});
const DOOR_PAD = 1.15;

function pickName(type, i) {
  const list = NAMES[type] || NAMES.fashion;
  return list[i % list.length];
}

function nextWidth(i, remain) {
  const r = i % 8;
  let w = SHOP_W;
  if (r === 0) w = 5.55;
  else if (r === 3) w = 3.05;
  else if (r === 6) w = 4.55;
  if (w > remain) w = remain;
  return w;
}

function pushShop(list, type, i, namePair, axis, side, xA, xB, zA, zB, extra = {}) {
  const [name, nameEn] = namePair;
  const span = axis === 'x' ? xB - xA : zB - zA;
  const pal = SIGN_COLORS[type] || SIGN_COLORS.fashion;
  list.push({
    id: list.length, type, name, nameEn, axis, side,
    x0: xA, x1: xB, z0: zA, z1: zB,
    cx: (xA + xB) / 2, cz: (zA + zB) / 2,
    interior: rect(xA + 0.16, xB - 0.16, zA + 0.16, zB - 0.16),
    rich: i % 3 === 0,
    closed: i % 12 === 4,
    openW: Math.min(2.2, Math.max(1.35, span - 1.15)),
    signColor: pal[i % pal.length],
    ...extra,
  });
}

function shopAlongX(list, x0, x1, zFront, side, zoneTypes, start) {
  // side < 0: interior goes north (-z). side > 0: south (+z).
  let i = start, x = x0;
  const mk = (xA, xB, i) => {
    const type = zoneTypes[i % zoneTypes.length];
    const zA = side < 0 ? zFront - SHOP_D : zFront;
    const zB = side < 0 ? zFront : zFront + SHOP_D;
    pushShop(list, type, i, pickName(type, i), 'x', side, xA, xB, zA, zB, { zFront });
  };
  while (x + 2.15 <= x1 + 0.05) {
    const w = nextWidth(i, x1 - x);
    if (w < 2.15) break;
    mk(x, x + w, i);
    x += w; i++;
  }
  return i;
}

function shopAlongZ(list, z0, z1, xFront, side, zoneTypes, start) {
  // side < 0: interior goes west (-x). side > 0: east (+x).
  let i = start, z = z0;
  const mk = (zA, zB, i) => {
    const type = zoneTypes[i % zoneTypes.length];
    const xA = side < 0 ? xFront - SHOP_D : xFront;
    const xB = side < 0 ? xFront : xFront + SHOP_D;
    pushShop(list, type, i, pickName(type, i + 17), 'z', side, xA, xB, zA, zB, { xFront, rich: i % 3 === 1 });
  };
  while (z + 2.15 <= z1 + 0.05) {
    const w = nextWidth(i, z1 - z);
    if (w < 2.15) break;
    mk(z, z + w, i);
    z += w; i++;
  }
  return i;
}

function byRef(exits, refs) {
  const set = new Set(refs.map(String));
  return exits.filter((e) => set.has(String(e.ref)));
}

function makePassage(id, wall, c, half, exits) {
  const out = wall === 'w' ? { x: -1, z: 0 } : wall === 'e' ? { x: 1, z: 0 } : wall === 'n' ? { x: 0, z: -1 } : { x: 0, z: 1 };
  let mouth, rec;
  if (wall === 'w') {
    mouth = { x: EW.x0 + 1.5, z: c };
    rec = rect(EW.x0 - PASSAGE_LEN, EW.x0, c - half, c + half);
  } else if (wall === 'e') {
    mouth = { x: EW.x1 - 1.5, z: c };
    rec = rect(EW.x1, EW.x1 + PASSAGE_LEN, c - half, c + half);
  } else if (wall === 'n') {
    mouth = { x: c, z: NORTH_Z + 1.5 };
    rec = rect(c - half, c + half, NORTH_Z - PASSAGE_LEN, NORTH_Z);
  } else if (wall === 's-e') {
    mouth = { x: HALF + SHOP_D - 0.2, z: c };
    rec = rect(HALF + SHOP_D, HALF + SHOP_D + PASSAGE_LEN, c - half, c + half);
    return { id, wall: 'e', c, half, exits, mouth: { x: HALF - 0.4, z: c }, out: { x: 1, z: 0 }, rect: rec, sidePass: true };
  } else {
    mouth = { x: -(HALF + SHOP_D - 0.2), z: c };
    rec = rect(-(HALF + SHOP_D + PASSAGE_LEN), -(HALF + SHOP_D), c - half, c + half);
    return { id, wall: 'w', c, half, exits, mouth: { x: -(HALF - 0.4), z: c }, out: { x: -1, z: 0 }, rect: rec, sidePass: true };
  }
  return { id, wall, c, half, exits, mouth, out, rect: rec };
}

function faceRy(shop) {
  if (shop.axis === 'x') return shop.side < 0 ? 0 : Math.PI;
  return shop.side < 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function buildLayout(exits = []) {
  const shops = [];
  let n = 0;
  n = shopAlongX(shops, EW.x0 + 1.2 + SHOP_W, PLAZA.x0 - 0.4, -HALF, -1, ['cosmetics', 'fashion', 'accessories', 'cosmetics', 'shoes'], n);
  n = shopAlongX(shops, 30.4, EW.x1 - 1.2, -HALF, -1, ['phone', 'accessories', 'fashion'], n);
  n = shopAlongX(shops, EW.x0 + 1.2, PLAZA.x0 - 0.4, HALF, 1, ['fashion', 'accessories', 'fashion', 'cosmetics'], n);
  n = shopAlongX(shops, PLAZA.x1 + 0.4, EW.x1 - 1.2, HALF, 1, ['fashion', 'accessories', 'shoes', 'fashion'], n);
  n = shopAlongZ(shops, NORTH_Z + 2.2, -HALF - 0.4, -HALF, -1, ['phone', 'accessories', 'phone'], n);
  n = shopAlongZ(shops, NORTH_Z + 2.2, L2HALL.z1 - 0.8, HALF, 1, ['accessories', 'phone', 'flower'], n);
  n = shopAlongZ(shops, HALF + 0.4, FOOD.z0 - 0.5, -HALF, -1, ['fashion', 'cosmetics', 'cafe', 'accessories'], n);
  n = shopAlongZ(shops, HALF + 0.4, FOOD.z0 - 0.5, HALF, 1, ['fashion', 'snack', 'shoes', 'fashion'], n);
  n = shopAlongZ(shops, FOOD.z1 + 0.4, 55.2, -HALF, -1, ['cafe', 'accessories'], n);
  n = shopAlongZ(shops, FOOD.z1 + 0.4, 55.2, HALF, 1, ['cafe', 'phone'], n);

  function sealGap(axis, side, a0, a1, front, namePair) {
    if (a1 - a0 < 0.45) return;
    if (axis === 'x') {
      const zA = side < 0 ? front - SHOP_D : front;
      const zB = side < 0 ? front : front + SHOP_D;
      pushShop(shops, 'fashion', n, namePair, 'x', side, a0, a1, zA, zB, {
        zFront: front, closed: true, rich: false,
      });
    } else {
      const xA = side < 0 ? front - SHOP_D : front;
      const xB = side < 0 ? front : front + SHOP_D;
      pushShop(shops, 'fashion', n, namePair, 'z', side, xA, xB, a0, a1, {
        xFront: front, closed: true, rich: false,
      });
    }
    n++;
  }
  const rowEnd = (axis, side, front, pred) => {
    const row = shops.filter((q) => q.axis === axis && q.side === side
      && (axis === 'x' ? Math.abs(q.zFront - front) < 0.05 : Math.abs(q.xFront - front) < 0.05)
      && pred(q));
    if (!row.length) return null;
    return {
      start: Math.min(...row.map((q) => (axis === 'x' ? q.x0 : q.z0))),
      end: Math.max(...row.map((q) => (axis === 'x' ? q.x1 : q.z1))),
    };
  };
  // 상점 줄이 채우지 못한 앞면은 셔터로 닫아, 열린 길처럼 보이지 않게 한다.
  const ewnWest = rowEnd('x', -1, -HALF, (q) => q.x1 < 0);
  if (ewnWest) sealGap('x', -1, ewnWest.end, PLAZA.x0, -HALF, ['준비중', 'Coming Soon']);
  const ewnEast = rowEnd('x', -1, -HALF, (q) => q.x0 > 20);
  if (ewnEast) sealGap('x', -1, ewnEast.end, EW.x1 - 1.2, -HALF, ['직원만', 'Staff Only']);
  const ewsWest = rowEnd('x', 1, HALF, (q) => q.x1 < 0);
  if (ewsWest) sealGap('x', 1, ewsWest.end, PLAZA.x0, HALF, ['준비중', 'Coming Soon']);
  const ewsEast = rowEnd('x', 1, HALF, (q) => q.x0 > 0);
  if (ewsEast) sealGap('x', 1, ewsEast.end, EW.x1 - 1.2, HALF, ['창고칸', 'Storage']);

  const cafes = [
    { name: '깊은잔', nameEn: 'Deep Cup', x: -6.4, z: 0.2, w: 4.2, d: 3.2 },
    { name: '따뜻한컵', nameEn: 'Warm Cup', x: 6.4, z: 0.2, w: 4.2, d: 3.2 },
  ];

  const foodStands = [
    { name: '김밥골목', nameEn: 'Gimbap Alley', x: -9.5, z: 44.5, w: 4.4, d: 3.0, type: 'snack' },
    { name: '호떡집', nameEn: 'Hotteok House', x: -9.5, z: 49.5, w: 4.4, d: 3.0, type: 'snack' },
    { name: '어묵한그릇', nameEn: 'One Fishcake', x: 9.5, z: 44.5, w: 4.4, d: 3.0, type: 'snack' },
    { name: '분식코너', nameEn: 'Snack Corner', x: 9.5, z: 49.5, w: 4.4, d: 3.0, type: 'snack' },
    { name: '밤사이커피', nameEn: 'Night Coffee', x: 0, z: 52.4, w: 5.2, d: 2.6, type: 'cafe' },
  ];

  const tables = [
    { x: -4.2, z: 46.5 }, { x: 0, z: 45.2 }, { x: 4.2, z: 46.5 },
    { x: -3.4, z: 49.4 }, { x: 3.4, z: 49.4 },
  ];

  const passages = [
    makePassage('east', 'e', 0, 2.6, byRef(exits, ['1', '12'])),
    makePassage('west', 'w', 0, 2.6, byRef(exits, ['8', '9'])),
    makePassage('north', 'n', 0, 2.6, byRef(exits, ['10', '11'])),
    makePassage('se', 's-e', 56.6, 2.5, byRef(exits, ['2', '3', '4'])),
    makePassage('sw', 's-w', 56.6, 2.5, byRef(exits, ['5', '6', '7'])),
  ];

  const columns = [];
  for (const x of [-42, -32, -22, -14, 14, 22, 32, 42]) {
    columns.push({ x, z: -2.15 }, { x, z: 2.15 });
  }
  for (const z of [-24, -16, 12, 22, 32, 58]) {
    columns.push({ x: -2.15, z }, { x: 2.15, z });
  }
  columns.push({ x: -8.2, z: -2.1 }, { x: 8.2, z: -2.1 });

  const benches = [];
  for (const x of [-38, -26, -16, 16, 26, 38]) {
    benches.push({ x, z: 2.55, ry: 0 }, { x, z: -2.55, ry: Math.PI });
  }
  for (const z of [14, 24, 34]) benches.push({ x: 2.55, z, ry: Math.PI / 2 }, { x: -2.55, z, ry: -Math.PI / 2 });
  for (const x of [-6, 6]) benches.push({ x, z: 47.2, ry: 0 });

  const restrooms = [
    { x: EW.x0 + 1.2 + SHOP_W / 2, z: -HALF - SHOP_D / 2, w: SHOP_W - 0.2, d: SHOP_D - 0.35, label: '화장실' },
    { x: 13.6, z: -18.4, w: 3.6, d: 3.2, label: '화장실' },
    { x: -11.6, z: 52.5, w: 3.6, d: 2.4, label: '화장실' },
  ];

  const kiosks = [
    { x: 0, z: 2.55, w: 1.2, d: 1.0, kind: 'info' },
    { x: -3.1, z: -2.4, w: 1.1, d: 0.9, kind: 'dir' },
  ];

  const carts = [
    { x: -19.5, z: 0, w: 1.35, d: 0.88, kind: 'snack' },
    { x: 19.5, z: 0, w: 1.35, d: 0.88, kind: 'acc' },
    { x: 0, z: 17.6, w: 1.28, d: 0.92, kind: 'flower' },
  ];

  const saleRacks = [];
  const saleStands = [];
  for (const s of shops) {
    if (s.closed) continue;
    const ry = faceRy(s);
    let fx, fz;
    if (s.axis === 'x') { fx = s.cx; fz = s.side < 0 ? s.z1 + 0.72 : s.z0 - 0.72; }
    else { fx = s.side < 0 ? s.x1 + 0.72 : s.x0 - 0.72; fz = s.cz; }
    const ax = s.axis === 'x' ? 1 : 0, az = s.axis === 'z' ? 1 : 0;
    if ((s.type === 'fashion' || s.type === 'accessories' || s.type === 'shoes') && s.id % 2 === 0) {
      saleRacks.push({ x: fx - ax * 1.38, z: fz - az * 1.38, ry, type: s.type });
    }
    if (s.id % 5 === 2) {
      saleStands.push({ x: fx + ax * 1.15, z: fz + az * 1.15, ry, kind: s.id % 2 ? 'sale' : 'price' });
    }
  }

  const mapBoards = [
    { x: 0.05, z: -2.62, w: 3.35, d: 0.22, ry: 0 },
    { x: 2.72, z: 39.15, w: 0.2, d: 2.15, ry: -Math.PI / 2 },
  ];

  const l2xs = [];
  for (let k = 0; k < 7; k++) l2xs.push(15.15 + k * 1.35);
  const shinxs = [];
  for (let k = 0; k < 6; k++) shinxs.push(-3.375 + k * 1.35);
  const lanes = [
    ...l2xs.map((x, i) => ({ group: 'l2', i, x, z: -8.15, axis: 'z' })),
    ...shinxs.map((x, i) => ({ group: 'shin', i, x, z: 60.15, axis: 'z' })),
  ];
  const cabs = [
    ...l2xs.map((x) => x - 0.675).concat(l2xs[l2xs.length - 1] + 0.675).map((x) => ({ x, z: -8.15, group: 'l2' })),
    ...shinxs.map((x) => x - 0.675).concat(shinxs[shinxs.length - 1] + 0.675).map((x) => ({ x, z: 60.15, group: 'shin' })),
  ];

  const wells = [
    { id: 'l2-0', cx: 17.6, x0: 14.6, x1: 20.6, z0: -25.6, z1: -18.4, ko: '내선순환', en: 'Inner Circle' },
    { id: 'l2-1', cx: 25.6, x0: 22.6, x1: 28.6, z0: -25.6, z1: -18.4, ko: '외선순환', en: 'Outer Circle' },
  ];
  const transfer = { x: 0, z: 62.6, hw: 4.2 };

  const npcWays = [
    { x: 0, z: 0 }, { x: -40, z: 0 }, { x: 40, z: 0 }, { x: 0, z: -22 },
    { x: 0, z: 22 }, { x: 0, z: 36 }, { x: 0, z: 47.7 }, { x: 21, z: -12 },
    { x: -1.5, z: 43.5 }, { x: 1.5, z: 50.6 },
  ];

  const alongFront = (s, t, depth) => {
    if (s.axis === 'x') return { x: s.cx + t, z: s.side < 0 ? s.z1 - depth : s.z0 + depth };
    return { x: s.side < 0 ? s.x1 - depth : s.x0 + depth, z: s.cz + t };
  };
  const around = (s, p, hw, hd) => (s.axis === 'x'
    ? rect(p.x - hw, p.x + hw, p.z - hd, p.z + hd)
    : rect(p.x - hd, p.x + hd, p.z - hw, p.z + hw));

  const walks = [
    rect(EW.x0, EW.x1, -HALF, HALF),
    rect(-HALF, HALF, NORTH_Z, -HALF),
    rect(-HALF, HALF, HALF, SOUTH_Z),
    // 십자로 교차점: 복도 사각형이 맞닿기만 해서 반경 0.3 으로는 건너지 못했다.
    rect(-HALF, HALF, -HALF - DOOR_PAD, -HALF + DOOR_PAD),
    rect(-HALF, HALF, HALF - DOOR_PAD, HALF + DOOR_PAD),
    rect(L2HALL.x0, L2HALL.x1, L2HALL.z0, L2HALL.z1),
    // 2호선 홀과 동서 복도를 잇는 앞마당 (예전 사각형은 z0>z1 이라 한 칸도 걷지 못했음)
    rect(L2HALL.x0, L2HALL.x1, L2HALL.z1 - DOOR_PAD, -HALF + DOOR_PAD),
    // 남북 북측에서 2호선 앞마당으로 이어지는 모서리 통로
    rect(HALF - DOOR_PAD, L2HALL.x0 + DOOR_PAD, L2HALL.z1 - DOOR_PAD, -HALF),
    rect(-FOOD.hw, FOOD.hw, FOOD.z0, FOOD.z1),
    ...shops.filter((q) => !q.closed).map((q) => q.interior),
    ...shops.filter((q) => !q.closed).map((q) => {
      const gap = (q.openW || OPEN_W) / 2;
      if (q.axis === 'x') {
        const zf = q.side < 0 ? q.z1 : q.z0;
        return rect(q.cx - gap, q.cx + gap, zf - DOOR_PAD, zf + DOOR_PAD);
      }
      const xf = q.side < 0 ? q.x1 : q.x0;
      return rect(xf - DOOR_PAD, xf + DOOR_PAD, q.cz - gap, q.cz + gap);
    }),
  ];
  for (const p of passages) {
    const R = p.rect;
    if (p.wall === 'w' && !p.sidePass) walks.push(rect(R.x0 + 2.1, EW.x0 + 1.1, R.z0 + 0.15, R.z1 - 0.15));
    else if (p.wall === 'e' && !p.sidePass) walks.push(rect(EW.x1 - 1.1, R.x1 - 2.1, R.z0 + 0.15, R.z1 - 0.15));
    else if (p.wall === 'n') walks.push(rect(R.x0 + 0.15, R.x1 - 0.15, R.z0 + 2.1, NORTH_Z + 1.1));
    else if (p.sidePass && p.wall === 'e') walks.push(rect(HALF - 0.6, R.x1 - 2.1, R.z0 + 0.15, R.z1 - 0.15));
    else if (p.sidePass && p.wall === 'w') walks.push(rect(R.x0 + 2.1, -HALF + 0.6, R.z0 + 0.15, R.z1 - 0.15));
  }

  const blockers = [];
  for (const c of columns) blockers.push(rect(c.x - 0.38, c.x + 0.38, c.z - 0.38, c.z + 0.38));
  for (const b of benches) blockers.push(rect(b.x - 0.85, b.x + 0.85, b.z - 0.28, b.z + 0.28));
  for (const r of restrooms) blockers.push(rect(r.x - r.w / 2, r.x + r.w / 2, r.z - r.d / 2, r.z + r.d / 2));
  for (const k of kiosks) blockers.push(rect(k.x - k.w / 2, k.x + k.w / 2, k.z - k.d / 2, k.z + k.d / 2));
  for (const f of foodStands) blockers.push(rect(f.x - f.w / 2, f.x + f.w / 2, f.z - f.d / 2, f.z + f.d / 2));
  for (const f of cafes) {
    blockers.push(rect(f.x - f.w / 2, f.x + f.w / 2, f.z - f.d / 2, f.z + f.d / 2));
    for (const dx of [-1.1, 1.1]) {
      blockers.push(rect(f.x + dx - 0.3, f.x + dx + 0.3, f.z - 1.55 - 0.3, f.z - 1.55 + 0.3));
    }
  }
  for (const t of tables) blockers.push(rect(t.x - 0.98, t.x + 0.98, t.z - 0.98, t.z + 0.98));
  for (const k of carts) blockers.push(rect(k.x - k.w / 2, k.x + k.w / 2, k.z - k.d / 2, k.z + k.d / 2));
  for (const r of saleRacks) blockers.push(rect(r.x - 0.48, r.x + 0.48, r.z - 0.28, r.z + 0.28));
  for (const r of saleStands) blockers.push(rect(r.x - 0.28, r.x + 0.28, r.z - 0.22, r.z + 0.22));
  for (const m of mapBoards) blockers.push(rect(m.x - m.w / 2, m.x + m.w / 2, m.z - m.d / 2, m.z + m.d / 2));
  for (const cab of cabs) blockers.push(rect(cab.x - 0.16, cab.x + 0.16, cab.z - 0.85, cab.z + 0.85));
  blockers.push(rect(L2HALL.x0, 14.4, -8.32, -7.98));
  blockers.push(rect(l2xs[l2xs.length - 1] + 0.7, L2HALL.x1, -8.32, -7.98));
  blockers.push(rect(-HALF, shinxs[0] - 0.7, 59.98, 60.32));
  blockers.push(rect(shinxs[shinxs.length - 1] + 0.7, HALF, 59.98, 60.32));
  for (const s of shops) {
    const gap = (s.openW || OPEN_W) / 2;
    if (s.axis === 'x') {
      blockers.push(rect(s.x0, s.x0 + 0.14, s.z0, s.z1));
      blockers.push(rect(s.x1 - 0.14, s.x1, s.z0, s.z1));
      if (s.side < 0) blockers.push(rect(s.x0, s.x1, s.z0, s.z0 + 0.14));
      else blockers.push(rect(s.x0, s.x1, s.z1 - 0.14, s.z1));
      if (s.closed) {
        if (s.side < 0) blockers.push(rect(s.x0, s.x1, s.z1 - 0.14, s.z1 + 0.08));
        else blockers.push(rect(s.x0, s.x1, s.z0 - 0.08, s.z0 + 0.14));
      } else {
        const mid = s.cx;
        if (s.side < 0) {
          blockers.push(rect(s.x0, mid - gap, s.z1 - 0.14, s.z1 + 0.08));
          blockers.push(rect(mid + gap, s.x1, s.z1 - 0.14, s.z1 + 0.08));
        } else {
          blockers.push(rect(s.x0, mid - gap, s.z0 - 0.08, s.z0 + 0.14));
          blockers.push(rect(mid + gap, s.x1, s.z0 - 0.08, s.z0 + 0.14));
        }
      }
    } else {
      blockers.push(rect(s.x0, s.x1, s.z0, s.z0 + 0.14));
      blockers.push(rect(s.x0, s.x1, s.z1 - 0.14, s.z1));
      if (s.side < 0) blockers.push(rect(s.x0, s.x0 + 0.14, s.z0, s.z1));
      else blockers.push(rect(s.x1 - 0.14, s.x1, s.z0, s.z1));
      if (s.closed) {
        if (s.side < 0) blockers.push(rect(s.x1 - 0.14, s.x1 + 0.08, s.z0, s.z1));
        else blockers.push(rect(s.x0 - 0.08, s.x0 + 0.14, s.z0, s.z1));
      } else {
        const mid = s.cz;
        if (s.side < 0) {
          blockers.push(rect(s.x1 - 0.14, s.x1 + 0.08, s.z0, mid - gap));
          blockers.push(rect(s.x1 - 0.14, s.x1 + 0.08, mid + gap, s.z1));
        } else {
          blockers.push(rect(s.x0 - 0.08, s.x0 + 0.14, s.z0, mid - gap));
          blockers.push(rect(s.x0 - 0.08, s.x0 + 0.14, mid + gap, s.z1));
        }
      }
    }
  }
  for (const w of wells) {
    blockers.push(rect(w.x0 - 0.08, w.x1 + 0.08, w.z0 - 0.05, w.z1 - 0.4));
  }
  // 열린 가게 안의 카운터·진열대는 걸어 들어갈 수 있지만 통과하지는 못하게 막는다.
  for (const q of shops) {
    if (q.closed) continue;
    const span = q.axis === 'x' ? q.x1 - q.x0 : q.z1 - q.z0;
    const back = alongFront(q, 0, SHOP_D - 0.38);
    blockers.push(around(q, back, Math.max(0.4, span / 2 - 0.32), 0.22));
    if (q.type === 'fashion' || q.type === 'shoes') {
      blockers.push(around(q, alongFront(q, q.type === 'shoes' ? 0 : 0.1, 1.62), 0.78, 0.25));
      const side0 = alongFront(q, -(span / 2 - 0.28), 0.65);
      const side1 = alongFront(q, -(span / 2 - 0.28), 0.65 + 7 * 0.48);
      if (q.axis === 'x') blockers.push(rect(side0.x - 0.12, side0.x + 0.12, side0.z, side1.z));
      else blockers.push(rect(side0.x, side1.x, side0.z - 0.12, side0.z + 0.12));
      const rackTs = span > 4.3 ? [-1.15, 1.15] : [0];
      for (const depth of [1.1, 2.45, 3.55]) {
        for (const t of rackTs) blockers.push(around(q, alongFront(q, t, depth), 0.48, 0.14));
      }
    } else if (q.type === 'accessories' || q.type === 'cosmetics' || q.type === 'phone') {
      blockers.push(around(q, alongFront(q, 0, 1.45), Math.min(1.05, span / 2 - 0.3), 0.26));
    } else if (q.type === 'cafe') {
      blockers.push(around(q, alongFront(q, 0, 2.1), 1.23, 0.36));
    } else if (q.type === 'snack') {
      blockers.push(around(q, alongFront(q, 0, 2.05), 1.28, 0.37));
    } else if (q.type === 'flower') {
      for (const t of [-1.1, -0.35, 0.35, 1.1]) {
        blockers.push(around(q, alongFront(q, t, 2.0), 0.22, 0.22));
      }
    }
  }

  return {
    shops, passages, columns, benches, restrooms, kiosks, cafes, foodStands,
    tables, carts, saleRacks, saleStands, mapBoards, npcWays,
    lanes, cabs, wells, transfer, walks, blockers, l2xs, shinxs,
  };
}

export function walkable(x, z, r, L, { laneOpen = () => true } = {}) {
  if (!L.walks.some((w) => inR(w, x, z, -r))) return false;
  if (L.blockers.some((b) => inR(b, x, z, r))) return false;
  for (const ln of L.lanes) {
    if (laneOpen(ln)) continue;
    if (Math.abs(x - ln.x) < 0.45 + r && Math.abs(z - ln.z) < 0.7 + r) return false;
  }
  return true;
}

export function passageAt(x, z, passages) {
  for (const p of passages) {
    const R = p.rect;
    if (inR(R, x, z, 0.4)) return p;
  }
  return null;
}

export function laneAt(x, z, L, zr = 1.35) {
  let best = -1, bd = zr;
  L.lanes.forEach((ln, i) => {
    const d = Math.hypot(x - ln.x, z - ln.z);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function nearWellTop(x, z, wells) {
  return wells.find((w) => x > w.x0 && x < w.x1 && z > w.z1 - 1.6 && z < w.z1 + 0.8) || null;
}

export function wellMouth(x, z, wells) {
  return wells.find((w) => x > w.x0 && x < w.x1 && z > w.z1 - 0.55 && z < w.z1 + 0.35) || null;
}

export function nearTransfer(x, z, t) {
  return Math.abs(x - t.x) < t.hw && z > t.z;
}

export function nearBench(x, z, benches, r = 1.15) {
  return benches.find((b) => Math.hypot(x - b.x, z - b.z) < r) || null;
}

export { inR };
