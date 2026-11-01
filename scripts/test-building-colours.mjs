// node scripts/test-building-colours.mjs — public/jeongja-colours.json 이 jeongja.json 건물과 맞는지, 어긋나면 버리는지 확인
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { prepareBuildingColours } from '../src/world/buildingColours.js';

const load = () => JSON.parse(fs.readFileSync('public/jeongja.json', 'utf8'));
const colours = JSON.parse(fs.readFileSync('public/jeongja-colours.json', 'utf8'));
const data = load();
assert.equal(colours.meta.buildings, data.buildings.length, 'jeongja.json 건물 수가 바뀜 → scripts/building-colours.mjs 다시 실행');
const st = prepareBuildingColours(data, colours);
assert.equal(st.dropped, 0); assert.equal(st.applied, data.buildings.length);
assert.ok(data.buildingColours && data.buildings.every((b) => b.fc && b.fc.tint.r <= 1 && b.fc.tint.g <= 1 && b.fc.tint.b <= 1));
for (const [, , , w, r] of colours.b) { assert.match(w, /^#[0-9a-f]{6}$/); assert.match(r, /^#[0-9a-f]{6}$/); }
// 수동 지정은 네이버 그린팩토리(62, 63, 884)만
const manual = colours.b.filter((e) => colours.meta.srcs[e[5]] === 'manual').map((e) => e[0]).sort((a, b) => a - b);
assert.deepEqual(manual, [62, 63, 884]);
// 중심점이 어긋난 항목은 버린다 (jeongja.json 재생성 대비)
const bad = structuredClone(colours); bad.b[0][1] += 10;
const d2 = load(); const st2 = prepareBuildingColours(d2, bad);
assert.equal(st2.dropped, 1); assert.equal(d2.buildings[bad.b[0][0]].fc, undefined);
// 파일이 없으면(?colours=0) 아무것도 붙지 않는다
const d3 = load(); assert.equal(prepareBuildingColours(d3, null), null); assert.ok(!d3.buildingColours && d3.buildings.every((b) => !b.fc));
console.log('test-building-colours: ok', JSON.stringify(st.bySrc), `${fs.statSync('public/jeongja-colours.json').size} B`);
