// [gyeongbu-bus] 9004·1151 본선 120km/h, ETA, 시간표, 버스전용차로, gangnambus=0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gangnamBusEnabled } from '../../../src/corridor/gangnamBus.js';
import { GYEONGGI_BUS_CREDIT, gyeongbuExpressEnabled } from '../../../src/corridor/gyeongbuExpress.js';
import { SEOUL_TG, seoulTollEnabled } from '../../../src/world/seoulToll.js';
import {
  speedMs, rideSpeedMs, travelSeconds, nextExpress, headwayMin, carLaneIndex, busLaneIndex, MS_TO_KMH,
} from '../../../src/corridor/gyeongbuSpeed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const J = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/gyeongbu-express.json'), 'utf8'));
const drive = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/drive.json'), 'utf8'));
const r9004 = J.routes.find((r) => r.no === '9004');
const r1151 = J.routes.find((r) => r.no === '1151');
const mid = (J.main0 + J.main1) / 2;
const cruise = speedMs(mid, J) * MS_TO_KMH;
assert.ok(Math.abs(cruise - 120) < 1, `본선 ${cruise.toFixed(2)} km/h`);
assert.equal(rideSpeedMs(J, mid), speedMs(mid, J));
assert.ok(Math.abs(speedMs(0, J) * MS_TO_KMH - 50) < 1, '도시 구간은 50 km/h');
const atJoin = speedMs(J.main0, J) * MS_TO_KMH;
assert.ok(atJoin > 55 && atJoin < 115, `램프 중간 ${atJoin.toFixed(1)}`);

const from = r1151.stops.find((s) => s.name.startsWith('판교역.낙생육교'));
const to = r1151.stops.find((s) => s.name.startsWith('신분당선강남역'));
const eta = travelSeconds(J, from.s, to.s);
const etaFine = travelSeconds(J, from.s, to.s, 8);
assert.ok(Math.abs(eta - etaFine) < 3, `적분 차이 ${Math.abs(eta - etaFine).toFixed(2)}s`);
assert.ok(Math.abs(eta - J.eta.seconds) < 3, `표기 ${J.eta.seconds} 계산 ${eta.toFixed(1)}`);
assert.equal(J.eta.from, from.name);

assert.equal(r9004.timetable.weekday.first, '05:00');
assert.equal(r9004.timetable.weekday.last, '23:20');
assert.equal(r9004.timetable.weekday.firstFromGangnam, '05:30');
assert.equal(r9004.timetable.weekday.lastFromGangnam, '00:00');
assert.equal(r1151.timetable.weekday.first, '05:20');
assert.equal(r1151.timetable.weekday.last, '23:00');
assert.equal(r1151.timetable.weekday.firstFromGangnam, '06:20');
assert.equal(r1151.timetable.weekday.lastFromGangnam, '00:00');
assert.equal(headwayMin(r9004.timetable.weekday, 8 * 60), 5);
assert.equal(headwayMin(r9004.timetable.weekday, 14 * 60), 20);
assert.equal(headwayMin(r1151.timetable.weekday, 8 * 60), 1);
assert.equal(headwayMin(r1151.timetable.holiday, 14 * 60), 12);
assert.equal(nextExpress(r9004.timetable.weekday, 5 * 60).label, '05:00');
assert.equal(nextExpress(r1151.timetable.weekday, 5 * 60 + 20).label, '05:20');
assert.equal(nextExpress(r9004.timetable.weekday, 14 * 60, { fromGangnam: true }).label.length, 5);
for (const r of J.routes) for (const s of r.stops) assert.equal(/미정차|경유/.test(s.name), false, s.name);
assert.ok(r1151.stops.some((s) => s.name.startsWith('판교역.낙생육교')));
assert.ok(r9004.stops.some((s) => s.name.startsWith('강남역5번출구')));

const gyeongbu = drive.ways.filter((w) => w.name === '경부고속도로');
assert.ok(gyeongbu.length >= 1);
for (const w of gyeongbu) {
  const bus = busLaneIndex(w.lanes);
  const lw = w.w / w.lanes;
  const busOff = w.w / 2 - (bus + 0.5) * lw;
  for (let li = 0; li < w.lanes; li++) {
    const use = carLaneIndex(w.lanes, li);
    assert.notEqual(use, bus, `경부 버스전용차로 ${bus}`);
    const off = w.w / 2 - (use + 0.5) * lw;
    assert.ok(Math.abs(off - busOff) > 0.5);
  }
}

assert.equal(gangnamBusEnabled('?gangnambus=0'), false);
assert.equal(gangnamBusEnabled('?gangnam=0'), false);
assert.equal(gyeongbuExpressEnabled(''), true);
assert.equal(gyeongbuExpressEnabled('?expressbus=0'), false);
assert.equal(gyeongbuExpressEnabled('?gangnambus=0'), false);
assert.equal(J.meta.attribution, GYEONGGI_BUS_CREDIT);
assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes(GYEONGGI_BUS_CREDIT));
assert.ok(fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').includes('GYEONGGI_BUS_CREDIT'));
assert.ok(fs.readFileSync(path.join(root, 'src/corridor/index.js'), 'utf8').includes('get(GYEONGBU_EXPRESS_FILE)'));
assert.ok(fs.readFileSync(path.join(root, 'src/corridor/gyeongbuExpress.js'), 'utf8').includes("expressBusGeo(no)"));

assert.equal(seoulTollEnabled(''), true);
assert.equal(seoulTollEnabled('?seoultg=0'), false);
const live = JSON.parse(fs.readFileSync(path.join(root, 'public/drive.json'), 'utf8'));
const gy = live.ways.filter((w) => w.name === '경부고속도로');
assert.ok(gy.length >= 1);
let near = Infinity;
for (const w of gy) for (const ni of w.n || []) {
  const n = live.nodes[ni];
  const d = Math.hypot(n[0] - SEOUL_TG.x, n[1] - SEOUL_TG.z);
  if (d < near) near = d;
}
assert.ok(near < 25, `서울TG가 경부에서 ${near.toFixed(1)}m`);
console.log(`gyeongbu express: ${cruise.toFixed(0)} km/h, 판교→강남 ${Math.round(eta)}s, cars off bus lane OK, 서울TG ${near.toFixed(0)}m`);
