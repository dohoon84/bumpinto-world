// node scripts/test-building-colours.mjs — public/jeongja-colours.json 이 jeongja.json 건물과 맞는지, 어긋나면 버리는지 확인
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { prepareBuildingColours } from '../src/world/buildingColours.js';

const data = JSON.parse(fs.readFileSync('public/jeongja.json', 'utf8'));
const colours = JSON.parse(fs.readFileSync('public/jeongja-colours.json', 'utf8'));
const before = JSON.stringify(data.buildings);
assert.equal(colours.meta.buildings, data.buildings.length, 'jeongja.json 건물 수가 바뀜 → scripts/building-colours.mjs 다시 실행');
const st = prepareBuildingColours(data, colours);
assert.equal(st.dropped, 0); assert.equal(st.applied, data.buildings.length);
assert.ok([...st.byIdx.values()].every(({ tint }) => tint.r <= 1 && tint.g <= 1 && tint.b <= 1));
assert.equal(JSON.stringify(data.buildings), before, 'prepareBuildingColours 는 data 를 바꾸지 않는다');
for (const [, , , w, r] of colours.b) { assert.match(w, /^#[0-9a-f]{6}$/); assert.match(r, /^#[0-9a-f]{6}$/); }
// 수동 지정은 네이버 그린팩토리(62, 63, 884)만
const manual = colours.b.filter((e) => colours.meta.srcs[e[5]] === 'manual').map((e) => e[0]).sort((a, b) => a - b);
assert.deepEqual(manual, [62, 63, 884]);
// 중심점이 어긋난 항목은 버린다 (jeongja.json 재생성 대비)
const bad = structuredClone(colours); bad.b[0][1] += 10;
const st2 = prepareBuildingColours(data, bad);
assert.equal(st2.dropped, 1); assert.equal(st2.byIdx.has(bad.b[0][0]), false);
// 파일이 없거나 형식이 다르면(?colours=0 / 404 / 옛 포맷) null → 기존 모습
assert.equal(prepareBuildingColours(data, null), null);
assert.equal(prepareBuildingColours(data, { meta: { fields: ['idx', 'wall'] }, b: [[0, '#ffffff']] }), null);
console.log('test-building-colours: ok', JSON.stringify(st.bySrc), `${fs.statSync('public/jeongja-colours.json').size} B`);
