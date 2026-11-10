import assert from 'node:assert/strict';
import { buildLayout, walkable } from '../src/world/gangnamUndergroundLayout.js';
const exits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((ref) => ({
  id: `gangnam-x${ref}`, ref: String(ref),
}));
const L = buildLayout(exits);
const refs = L.passages.flatMap((p) => p.exits.map((e) => String(e.ref))).sort((a, b) => +a - +b);
assert.deepEqual(refs, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
assert.equal(new Set(refs).size, 12);
assert.ok(L.shops.length >= 50, `shops ${L.shops.length}`);
assert.ok(L.shops.length <= 120, `shops ${L.shops.length}`);
assert.ok(walkable(0, 0, 0.3, L), 'plaza');
assert.ok(walkable(-30, 0, 0.3, L), 'west corridor');
assert.ok(walkable(30, 0, 0.3, L), 'east corridor');
assert.ok(walkable(0, 30, 0.3, L), 'south wing');
assert.ok(walkable(0, 47, 0.3, L), 'food');
assert.ok(walkable(21, -12, 0.3, L), 'line2 hall');
assert.ok(!walkable(0, -80, 0.3, L), 'outside north');
assert.ok(!walkable(80, 0, 0.3, L), 'outside east');
// 가게 안
const shop = L.shops.find((s) => s.rich) || L.shops[0];
assert.ok(walkable(shop.cx, shop.cz, 0.25, L), `shop interior ${shop.name}`);
// 가게 뒷벽 밖
if (shop.axis === 'x' && shop.side < 0) assert.ok(!walkable(shop.cx, shop.z0 - 0.5, 0.25, L));
// 이름에 실제 브랜드가 없는지 대략 검사
const joined = L.shops.map((s) => s.name).join(' ');
for (const ban of ['스타벅스', '이마트', '토니모리', '공차', '메가커피', '크리스피', '올리브영', '다이소']) {
  assert.ok(!joined.includes(ban), ban);
}
console.log(JSON.stringify({
  shops: L.shops.length,
  types: L.shops.reduce((a, s) => (a[s.type] = (a[s.type] || 0) + 1, a), {}),
  passages: L.passages.map((p) => ({ id: p.id, refs: p.exits.map((e) => e.ref) })),
  benches: L.benches.length,
  columns: L.columns.length,
}));
console.log('test-gangnam-underground layout OK');
