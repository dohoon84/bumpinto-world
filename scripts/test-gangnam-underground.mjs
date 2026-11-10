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
const open = L.shops.find((s) => !s.closed && s.rich) || L.shops.find((s) => !s.closed);
assert.ok(open, 'open shop');
assert.ok(walkable(open.cx, open.cz, 0.25, L), `shop interior ${open.name}`);
const closed = L.shops.find((s) => s.closed);
assert.ok(closed, 'some shuttered shops');
assert.ok(!walkable(closed.cx, closed.cz, 0.25, L), 'closed shop blocked');
assert.ok(L.shops.some((s) => (s.x1 - s.x0) > 5 || (s.z1 - s.z0) > 5), 'wide shops');
assert.ok(L.shops.some((s) => (s.x1 - s.x0) < 3.3 || (s.z1 - s.z0) < 3.3), 'narrow shops');
assert.ok(new Set(L.shops.map((s) => s.signColor)).size >= 6, 'varied sign colors');
assert.ok(L.carts.length >= 2, 'corridor carts');
assert.ok(L.saleRacks.length >= 4, 'sale racks');
assert.ok(L.mapBoards.length >= 2, 'floor maps');
assert.ok(!walkable(0, 45.2, 0.3, L), 'food table blocked');
assert.ok(!walkable(-9.5, 44.5, 0.3, L), 'food counter blocked');
for (const p of L.npcWays) assert.ok(walkable(p.x, p.z, 0.28, L), `npc way ${p.x},${p.z}`);
const shop = open;
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
