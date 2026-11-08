// [gangnam-bus] 시간표(402 막차 24:05) · 판교IC 끝과 강남역 사이 도로가 끊기지 않음 · 경부 본선을 안 타는 노선
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gangnamBusEnabled, nextBus, inService, BUS_CREDIT } from '../../../src/corridor/gangnamBus.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const J = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/transit.json'), 'utf8'));
const express = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/pangyo/express.json'), 'utf8'));
const end = express.lines.find((l) => l.id === 'mainNB').pts.at(-1);
const pts = J.pts;
assert.ok(Math.hypot(pts[0][0] - end[0], pts[0][1] - end[1]) < 1, '판교IC 끝과 이어짐');
const st = J.station || [-7097.7, -14453.3];
assert.ok(Math.hypot(pts.at(-1)[0] - st[0], pts.at(-1)[1] - st[1]) < 5, '강남역까지');
let worst = 0;
for (let i = 1; i < pts.length; i++) worst = Math.max(worst, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
assert.ok(worst <= 50, `구간 간격 ${worst.toFixed(1)}m`);
assert.ok(J.lengthM > 10000, '판교~강남 거리');
assert.ok(J.daeroAt > 7000 && J.daeroAt < J.lengthM, '양재 이후 강남대로');

const want = ['140', '400', '402', '470', '9404', '9408', '146', '341', '360', '740'];
assert.deepEqual(J.routes.map((r) => r.no), want);
for (const r of J.routes) {
  assert.equal(r.usesGyeongbu, false, `${r.no} 는 경부 본선에 올리지 않는다`);
  for (const k of ['weekday', 'saturday', 'holiday']) {
    assert.ok(r.timetable[k].firstTime && r.timetable[k].lastTime && r.timetable[k].term > 0, `${r.no} ${k}`);
  }
}
const r402 = J.routes.find((r) => r.no === '402');
assert.equal(r402.timetable.weekday.lastTime, '24:05');
assert.equal(r402.timetable.weekday.firstTime, '04:00');
assert.equal(r402.timetable.weekday.term, 9);
assert.equal(r402.timetable.saturday.term, 11);
assert.equal(r402.timetable.holiday.term, 13);
const n = nextBus(r402.timetable.weekday, 23 * 60 + 59);
assert.equal(n.label, '24:05');
assert.ok(n.waitMin > 0 && n.waitMin <= 6, `wait ${n.waitMin}`);
assert.equal(inService(r402.timetable.weekday, 23 * 60 + 59), true);
assert.equal(inService(r402.timetable.weekday, 2 * 60), false);
assert.equal(nextBus(J.routes.find((r) => r.no === '140').timetable.weekday, 4 * 60).label, '04:00');

assert.equal(gangnamBusEnabled(''), true);
assert.equal(gangnamBusEnabled('?gangnambus=0'), false);
assert.equal(gangnamBusEnabled('?gangnam=0'), false);
assert.equal(gangnamBusEnabled('?gangnam=0&gangnambus=1'), false);
assert.equal(J.meta.bus, BUS_CREDIT);
assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes(BUS_CREDIT));
assert.ok(fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').includes('BUS_CREDIT'));
assert.equal(/https?:\/\//.test(JSON.stringify(J.routes)), false);
assert.ok(J.routes.find((r) => r.no === '9404').onDaero === true && J.routes.find((r) => r.no === '9408').onDaero === true);
console.log('gangnam bus: timetable 24:05 · road continuous · no route on gyeongbu mainline OK');
