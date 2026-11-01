// node scripts/test-ground-floor-shops.mjs — public/jeongja-shops.json 이 jeongja.json 건물과 맞는지, 어긋나면 버리는지 확인
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { prepareShops, shopBandHeight, isShopFront, SHOP_GF_H } from '../src/world/groundFloorShops.js';

const data = JSON.parse(fs.readFileSync('public/jeongja.json', 'utf8'));
const shops = JSON.parse(fs.readFileSync('public/jeongja-shops.json', 'utf8'));
const st = prepareShops(data, shops);
assert.equal(st.dropped, 0, 'jeongja.json 이 바뀜 → scripts/ground-floor-shops.mjs 다시 실행');
assert.equal(st.byIdx.size, shops.b.length);
for (const [idx, e] of st.byIdx) {
  assert.equal(e.b, data.buildings[idx]);
  assert.ok(e.count >= 1 && Array.isArray(e.names) && e.cat);
}
// 중심점이 어긋난 항목은 버린다
const bad = structuredClone(shops); bad.b[0][3] += 10;
const st2 = prepareShops(data, bad);
assert.equal(st2.dropped, 1); assert.equal(st2.byIdx.has(bad.b[0][0]), false);
// 파일 없음(?shops=0 / 404) → null
assert.equal(prepareShops(data, null), null);
// 1층 띠 높이: 낮은 건물은 벽 전체, 높은 건물은 1층만, 공중 건물·가게 없음은 0
const e = st.byIdx.values().next().value;
assert.equal(shopBandHeight(e, { h: 3.5 }, 3.5), 3.5);
assert.equal(shopBandHeight(e, { h: 20 }, 20), SHOP_GF_H);
assert.equal(shopBandHeight(e, { h: 20, mh: 5 }, 20), 0);
assert.equal(shopBandHeight(e, { h: 2 }, 2), 0);
assert.equal(shopBandHeight(undefined, { h: 20 }, 20), 0);
assert.ok(isShopFront({ h: 10 }) && !isShopFront({ h: 10, mh: 4 }));
console.log('test-ground-floor-shops: ok', `${st.byIdx.size} buildings`, `${fs.statSync('public/jeongja-shops.json').size} B`);
