// 강남역 지하상가 배치 (three 없음). PLAN.md 참고.
// +x 동(테헤란로), +z 남(양재), y 위. 바닥 y=0.
// 출구 묶음은 역 중심 나침반이 아니라 실제 도로 방향을 따른다 (가정은 PLAN 7장).

export const CEIL = 3.25;
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
  phone: { wall: '#2b3035', accent: '#22b8cf', floor: '#3b4148', ko: '폰케이스', en: 'Phone cases' },
  cafe: { wall: '#fff4e6', accent: '#d9480f', floor: '#ead3b5', ko: '카페', en: 'Cafe' },
  snack: { wall: '#fff0e4', accent: '#e8590c', floor: '#efd0ae', ko: '분식', en: 'Snacks' },
  shoes: { wall: '#f2ebe2', accent: '#8d6e63', floor: '#e2d2c0', ko: '신발', en: 'Shoes' },
  flower: { wall: '#ebfbee', accent: '#2f9e44', floor: '#d3f9d8', ko: '꽃집', en: 'Flowers' },
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
export const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });

function pickName(type, i) {
  const list = NAMES[type] || NAMES.fashion;
  return list[i % list.length];
}

function pushShop(list, type, i, namePair, axis, side, xA, xB, zA, zB, extra = {}) {
  const [name, nameEn] = namePair;
  list.push({
    id: list.length, type, name, nameEn, axis, side,
    x0: xA, x1: xB, z0: zA, z1: zB,
    cx: (xA + xB) / 2, cz: (zA + zB) / 2,
    interior: rect(xA + 0.16, xB - 0.16, zA + 0.16, zB - 0.16),
    rich: i % 3 === 0,
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
  while (x + SHOP_W <= x1 + 0.05) {
    mk(x, x + SHOP_W, i);
    x += SHOP_W; i++;
  }
  if (x1 - x >= 2.15) { mk(x, x1, i); i++; }
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
  while (z + SHOP_W <= z1 + 0.05) { mk(z, z + SHOP_W, i); z += SHOP_W; i++; }
  if (z1 - z >= 2.15) { mk(z, z1, i); i++; }
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
    // 남동 옆문 (south wing east wall)
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

export function buildLayout(exits = []) {
  const shops = [];
  let n = 0;
  // 동서 본선: 북쪽 점포 (서쪽만 — 북동쪽은 2호선 개찰 홀)
  n = shopAlongX(shops, EW.x0 + 1.2 + SHOP_W, PLAZA.x0 - 0.4, -HALF, -1, ['cosmetics', 'fashion', 'accessories', 'cosmetics', 'shoes'], n);
  n = shopAlongX(shops, 30.4, EW.x1 - 1.2, -HALF, -1, ['phone', 'accessories', 'fashion'], n);
  // 동서 본선: 남쪽 점포 (교차 광장은 비움)
  n = shopAlongX(shops, EW.x0 + 1.2, PLAZA.x0 - 0.4, HALF, 1, ['fashion', 'accessories', 'fashion', 'cosmetics'], n);
  n = shopAlongX(shops, PLAZA.x1 + 0.4, EW.x1 - 1.2, HALF, 1, ['fashion', 'accessories', 'shoes', 'fashion'], n);
  // 북쪽 날개
  n = shopAlongZ(shops, NORTH_Z + 2.2, -HALF - 0.4, -HALF, -1, ['phone', 'accessories', 'phone'], n);
  n = shopAlongZ(shops, NORTH_Z + 2.2, L2HALL.z1 - 0.8, HALF, 1, ['accessories', 'phone', 'flower'], n);
  // 남쪽 날개 (푸드존 앞뒤). 출구 옆문은 z≈56 부근을 비운다.
  n = shopAlongZ(shops, HALF + 0.4, FOOD.z0 - 0.5, -HALF, -1, ['fashion', 'cosmetics', 'cafe', 'accessories'], n);
  n = shopAlongZ(shops, HALF + 0.4, FOOD.z0 - 0.5, HALF, 1, ['fashion', 'snack', 'shoes', 'fashion'], n);
  n = shopAlongZ(shops, FOOD.z1 + 0.4, 55.2, -HALF, -1, ['cafe', 'accessories'], n);
  n = shopAlongZ(shops, FOOD.z1 + 0.4, 55.2, HALF, 1, ['cafe', 'phone'], n);

  // 교차 광장 카페 키오스크 (걸어 들어가는 매장은 아님, 카운터)
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

  // 2호선 개찰 (홀 남쪽, 본선으로 남향). 신분당 개찰 (푸드존 남쪽, 북에서 남으로).
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

  const walks = [
    rect(EW.x0, EW.x1, -HALF, HALF), // 동서 본선
    rect(-HALF, HALF, NORTH_Z, -HALF), // 북쪽 날개
    rect(-HALF, HALF, HALF, SOUTH_Z), // 남쪽 날개 중앙
    rect(L2HALL.x0, L2HALL.x1, L2HALL.z0, L2HALL.z1), // 2호선 홀
    rect(HALF, L2HALL.x0 + 0.2, -HALF, -8.15), // 본선 → 2호선 홀 이음
    rect(-FOOD.hw, FOOD.hw, FOOD.z0, FOOD.z1), // 푸드존 확장
    ...shops.map((s) => s.interior),
  ];
  // 출구 통로 (바깥 끝 2m 는 계단이라 못 감)
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
  for (const f of cafes) blockers.push(rect(f.x - f.w / 2, f.x + f.w / 2, f.z - f.d / 2, f.z + f.d / 2));
  for (const cab of cabs) blockers.push(rect(cab.x - 0.16, cab.x + 0.16, cab.z - 0.85, cab.z + 0.85));
  // 개찰 펜스 (레인 밖)
  blockers.push(rect(L2HALL.x0, 14.4, -8.32, -7.98));
  blockers.push(rect(l2xs[l2xs.length - 1] + 0.7, L2HALL.x1, -8.32, -7.98));
  blockers.push(rect(-HALF, shinxs[0] - 0.7, 59.98, 60.32));
  blockers.push(rect(shinxs[shinxs.length - 1] + 0.7, HALF, 59.98, 60.32));
  // 가게 벽 (앞면 출입구만 비움)
  for (const s of shops) {
    if (s.axis === 'x') {
      blockers.push(rect(s.x0, s.x0 + 0.14, s.z0, s.z1));
      blockers.push(rect(s.x1 - 0.14, s.x1, s.z0, s.z1));
      if (s.side < 0) blockers.push(rect(s.x0, s.x1, s.z0, s.z0 + 0.14));
      else blockers.push(rect(s.x0, s.x1, s.z1 - 0.14, s.z1));
      const mid = s.cx, gap = OPEN_W / 2;
      if (s.side < 0) { // 남쪽 앞면(본선 쪽) = z1
        blockers.push(rect(s.x0, mid - gap, s.z1 - 0.14, s.z1 + 0.08));
        blockers.push(rect(mid + gap, s.x1, s.z1 - 0.14, s.z1 + 0.08));
      } else {
        blockers.push(rect(s.x0, mid - gap, s.z0 - 0.08, s.z0 + 0.14));
        blockers.push(rect(mid + gap, s.x1, s.z0 - 0.08, s.z0 + 0.14));
      }
    } else {
      blockers.push(rect(s.x0, s.x1, s.z0, s.z0 + 0.14));
      blockers.push(rect(s.x0, s.x1, s.z1 - 0.14, s.z1));
      if (s.side < 0) blockers.push(rect(s.x0, s.x0 + 0.14, s.z0, s.z1));
      else blockers.push(rect(s.x1 - 0.14, s.x1, s.z0, s.z1));
      const mid = s.cz, gap = OPEN_W / 2;
      if (s.side < 0) {
        blockers.push(rect(s.x1 - 0.14, s.x1 + 0.08, s.z0, mid - gap));
        blockers.push(rect(s.x1 - 0.14, s.x1 + 0.08, mid + gap, s.z1));
      } else {
        blockers.push(rect(s.x0 - 0.08, s.x0 + 0.14, s.z0, mid - gap));
        blockers.push(rect(s.x0 - 0.08, s.x0 + 0.14, mid + gap, s.z1));
      }
    }
  }
  for (const w of wells) {
    blockers.push(rect(w.x0 - 0.08, w.x1 + 0.08, w.z0 - 0.05, w.z1 - 0.4)); // 구덩이. 남쪽 입구 띠는 남겨 두어 걸어 들어가게 한다
  }

  return {
    shops, passages, columns, benches, restrooms, kiosks, cafes, foodStands,
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
