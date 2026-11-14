// [myeongdong] 명동 지역 데이터·플래그·노선도 연결 검사 (브라우저 없이)
//   node scripts/corridor/test/test-myeongdong.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { MYEONGDONG_BOUNDS as B, MYEONGDONG_SPAWN as S, MYEONGDONG_LINK, myeongdongEnabled, inMyeongdong, LINE4_COLOR } from '../../../src/corridor/landmarks/myeongdongFlags.js';
import { LINE4, LINES } from '../../../src/subway/lines.js';
import { MYEONGDONG_LANDMARK, myeongdongGlobeEnabled } from '../../../src/corridor/globeCorridor.js';

const d = JSON.parse(fs.readFileSync(new URL('../../../public/corridor/myeongdong/myeongdong.json', import.meta.url)));
let n = 0; const ok = (m) => console.log(`ok ${++n} ${m}`);

assert.equal(myeongdongEnabled('?myeongdong=0'), false); assert.equal(myeongdongEnabled(''), true);
assert.equal(myeongdongGlobeEnabled('?ntower=0'), false); assert.equal(myeongdongGlobeEnabled(''), true);
ok('flags ?myeongdong=0 / ?ntower=0');

assert.ok(inMyeongdong(S.x, S.z), 'spawn inside bounds');
assert.ok(B.z1 === -21300 && MYEONGDONG_LINK.z0 === B.z1, 'box abuts namsan / link');
ok(`spawn ${S.name} inside region box`);

assert.equal(d.station.line, '4호선'); assert.ok(inMyeongdong(d.station.x, d.station.z));
assert.ok(d.exits.length >= 8 && d.exits.every((e) => inMyeongdong(e.x, e.z, 30)));
ok(`명동역 ${d.exits.length} exits (OSM)`);

assert.ok(d.cathedral?.o?.length >= 8 && d.cathedral.h > 15);
assert.ok(d.oreumi?.pts?.length >= 2);
ok('cathedral outline + 남산오르미 line');

assert.ok(d.buildings.length > 800 && d.shops.length > 1000 && d.ways.length > 300);
const toegye = d.ways.filter((w) => /퇴계로/.test(w.n || ''));
assert.ok(toegye.every((w) => !w.w || w.w < 15), '퇴계로 one-way carriageway ≤ 15 m');
ok(`dense data: ${d.buildings.length} bld · ${d.shops.length} shops · ${d.ways.length} ways`);

assert.equal(LINE4.color, LINE4_COLOR); assert.equal(LINE4.subwayId, 1004);
assert.ok(!Object.values(LINES).some((l) => l.key === 'l4') && !('l4' in LINES), 'Line 4 display-only (no platform yet)');
assert.deepEqual(MYEONGDONG_LANDMARK.lines, ['4호선']);
ok('Line 4 display data + route-map landmark chip entry');
console.log(`test-myeongdong: ${n} ok`);
