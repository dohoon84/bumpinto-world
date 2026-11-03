// [subway] 2단계 승강장·열차: 량 수 · 스크린도어 번호 · 방면/이웃 역 · 열차 움직임 · 시간표(안내판과 같은 식) · 실시간 · 구역(덧붙이기만) · 주행
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRAIN, LINES, CAR_LEN, DOOR_OFF } from '../src/subway/lines.js';
import { STATIONS, stationTheme } from '../src/subway/stations.js';
import { LINE_STOPS } from '../src/subway/stationsData.js';
import { neighbors, rideStops, nextStops, platformLayout, doorAt, signText, announce, trainMotion, boardable, MOTION, simNextArrival, liveNextArrival, segmentProfile, segmentDist, platformZone, trainZone, isGameStop } from '../src/subway/ride.js';
import { simulatedRows, kstMinute } from '../src/subway/arrivals.js';
import { normalizeArrival } from '../server/phone/src/subway.js';
import { ZONES, zoneSlot, encodeZone, decodeZone, isZoneId } from '../src/net/zones.js';
import { createSubwayState } from '../src/subway/state.js';

// 량 수 (출처는 lines.js 주석): 수인분당·신분당·8·9 = 6, 2·3 = 10, 경강 = 4
assert.deepEqual(Object.fromEntries(Object.entries(TRAIN).map(([k, v]) => [k, v.cars])), { suin: 6, shin: 6, gg: 4, l2: 10, l3: 10, l8: 6, l9: 6 });
for (const k of Object.keys(LINES)) { assert.ok(TRAIN[k], k); assert.equal(TRAIN[k].doors, 4); assert.ok(LINE_STOPS[k]?.stops.length > 5, `${k} 역 목록`); }
// 스크린도어: 1-1 … N-4, 앞(+x) 칸부터, 간격
for (const [k, n] of [['suin', 24], ['l2', 40], ['gg', 16], ['l3', 40], ['shin', 24]]) {
  const lay = platformLayout(k);
  assert.equal(lay.doors.length, n, k); assert.equal(lay.trainLen, TRAIN[k].cars * CAR_LEN);
  assert.equal(lay.doors[0].label, '1-1'); assert.equal(lay.doors.at(-1).label, `${TRAIN[k].cars}-4`);
  for (let i = 1; i < lay.doors.length; i++) assert.ok(lay.doors[i].x < lay.doors[i - 1].x - 4, '앞에서 뒤로, 문 사이 > 4m');
  assert.ok(lay.doors[0].x < lay.half && lay.doors.at(-1).x > -lay.half, '승강장 안');
  assert.equal(doorAt(lay, lay.doors[5].x + 0.3)?.label, lay.doors[5].label); assert.equal(doorAt(lay, lay.doors[5].x + 1.5), null);
}
assert.ok(Math.abs(DOOR_OFF[0] - DOOR_OFF[1] - 4.7) < 0.01);
// 방면·이웃 역
const nb = (l, d, s) => { const r = neighbors(l, d, s); return [r.prev, r.next]; };
assert.deepEqual(nb('suin', 1, '정자'), ['미금', '수내'], '정자 수인분당 왕십리 방면: 미금 ← → 수내');
assert.deepEqual(nb('suin', 0, '정자'), ['수내', '미금']);
assert.deepEqual(nb('suin', 1, '복정'), ['가천대', '수서']);
assert.deepEqual(nb('shin', 0, '정자'), ['판교', '미금'], '신분당 광교 방면');
assert.deepEqual(nb('gg', 1, '이매'), ['판교', '삼동'], '경강 여주 방면');
assert.deepEqual(nextStops('l2', 0, '잠실', 2).length, 2, '2호선 순환');
assert.equal(nextStops('l2', 0, '잠실', 60).length, LINE_STOPS.l2.stops.length - 1, '순환선은 한 바퀴 전까지');
// 탈 수 있는 곳 (내릴 게임 역이 있어야)
const rs = rideStops('suin', 1, '정자');
assert.deepEqual(rs.filter((q) => q.game).map((q) => q.id), ['sunae', 'seohyeon', 'imae', 'yatap', 'moran', 'taepyeong', 'gachon', 'bokjeong']);
assert.ok(rs.every((q) => q.game), '정자 → 복정은 모두 게임 역');
assert.deepEqual(rideStops('suin', 0, '정자'), [], '정자 인천 방면: 내릴 게임 역 없음 → 탑승 막음');
const r8 = rideStops('l8', 1, '모란');
assert.equal(r8.at(-1).id, 'jamsil'); assert.ok(r8.some((q) => !q.game), '8호선 모란→잠실: 게임 밖 역(수진 등) 지나감');
assert.deepEqual(rideStops('gg', 1, '이매'), []); assert.deepEqual(rideStops('l2', 0, '잠실'), []); assert.deepEqual(rideStops('l9', 1, '석촌'), []);
for (const d of STATIONS) for (const l of d.lines) assert.ok(isGameStop(l, d.name), `${d.name} ${l}`);
// 간판·방송
const sg = signText(STATIONS[0], 'suin', 1);
assert.equal(sg.dirKo, LINES.suin.dirs[1].ko); assert.equal(sg.next, '수내'); assert.equal(sg.nextEn, 'Sunae'); assert.equal(sg.prevEn, null, '미금 = 게임 밖 → 영문 없음 (지어내지 않음)');
for (const k of ['approach', 'arrived', 'closing', 'next', 'depart', 'noAlight', 'last', 'noRide']) { const a = announce(k, { dirKo: '왕십리 방면', dirEn: 'for Wangsimni', name: '수내', nameEn: 'Sunae' }); assert.ok(a.ko && a.en, k); }
// 열차 움직임
assert.equal(trainMotion(-MOTION.APPROACH - 1).phase, 'away');
assert.ok(trainMotion(-1).off < 0 && trainMotion(-1).doors === 0);
assert.equal(trainMotion(10).doors, 1); assert.equal(trainMotion(MOTION.CLOSE_AT + MOTION.DOOR_SEC + 0.1).doors, 0);
assert.ok(trainMotion(MOTION.DWELL + 5).off > 0);
assert.ok(!boardable(0.5) && boardable(10) && !boardable(MOTION.CLOSE_AT + 1));
// 시간표: 안내판(simulatedRows)과 같은 '몇 분 후'
for (const d of STATIONS) {
  const th = stationTheme(d);
  for (const ms of [Date.UTC(2026, 10, 3, 3, 7, 0), Date.UTC(2026, 10, 3, 9, 41, 0)]) {
    const rows = simulatedRows(th, kstMinute(ms), th.id);
    rows.forEach((row) => {
      const di = th.lines.find((l) => l.key === row.line).dirs.findIndex((x) => x.ko === row.dest);
      const a = simNextArrival(row.line, di, th.id, ms);
      const wait = Math.round((a.at - ms) / 60000);
      assert.equal(row.msg, wait ? `약 ${wait}분 후` : '곧 도착', `${d.name} ${row.line} ${row.dest}`);
    });
  }
}
assert.equal(simNextArrival('suin', 1, 'jeongja', Date.UTC(2026, 10, 3, 18, 0, 0)), null, 'KST 03:00 운행 없음');
// 실시간 (이매 픽스처): 수인분당 상행 = 왕십리 방면 (dir 1) 도착, 경강 하행 = 여주 (dir 1) 3분
{
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/subway-arrival-imae.json', import.meta.url), 'utf8'));
  const n = normalizeArrival(fx);
  const a = liveNextArrival(n.trains, 'suin', 1, 5000, 5000);
  assert.equal(a.at, 5000); assert.equal(a.trainNo, '6130'); assert.equal(a.live, true); assert.equal(a.run, 6130);
  const g = liveNextArrival(n.trains, 'gg', 1, 5000, 5000);
  assert.ok(g && g.at > 5000 && g.at - 5000 <= 240e3, '경강 여주 방면 ~3분');
  const g2 = liveNextArrival(n.trains, 'gg', 1, 65000, 5000); assert.equal(g2.at - 65000, g.at - 5000 - 60000, '흐른 시간 빼기');
  assert.equal(liveNextArrival(n.trains, 'l2', 0, 5000, 5000), null);
  assert.equal(liveNextArrival(null, 'suin', 1, 0, 0), null);
}
// 구역: 1단계(0..14) 그대로, 승강장 42 + 열차 56 덧붙임 (113)
assert.equal(ZONES.length, 113); assert.equal(ZONES[1], 'jeongja-station'); assert.equal(ZONES[14], 'jamsil-station');
assert.equal(ZONES[15], 'jeongja-station/p-suin-0'); assert.equal(ZONES[57], 'train:suin-0-0'); assert.equal(ZONES[112], 'train:l2-1-3');
assert.equal(new Set(ZONES).size, ZONES.length);
for (const d of STATIONS) for (const l of d.lines) for (const di of [0, 1]) { const z = platformZone(d.id, l, di); assert.ok(isZoneId(z) && zoneSlot(z) > 14, z); }
for (const l of Object.keys(TRAIN)) for (const di of [0, 1]) for (const run of [0, 5, 6130, -1]) { const z = trainZone(l, di, run); assert.ok(zoneSlot(z) >= 57, z); }
for (const z of ['jeongja-station/p-suin-1', 'train:l8-1-2', 'jamsil-station']) {
  const e = encodeZone(z, 3.25, -1.5), b = decodeZone(e.x, e.z, e.zone);
  assert.equal(b.zone, z); assert.ok(Math.abs(b.x - 3.25) < 0.01 && Math.abs(b.z + 1.5) < 0.01);
}
// 주행: 정자→수내 실제 거리, 게임 밖 구간 1.2km 근사
{
  const d = segmentDist('정자', '수내'); assert.ok(d > 800 && d < 1800, `정자-수내 ${d}`);
  assert.equal(segmentDist('모란', '수진'), 1200);
  const p = segmentProfile(1200); assert.ok(Math.abs(p.T - 76.5) < 1); assert.equal(p.at(p.T + 1).s, 1200); assert.equal(p.at(p.T / 2).v, p.vmax);
  const q = segmentProfile(300); assert.ok(q.vmax < 22 && Math.abs(q.at(q.T).s - 300) < 1e-6);
}
// 열차로 다른 역: 떠난 역 = 바깥, 도착 역 = 안 (들어온 출구 없음)
{
  const ex = STATIONS[0].exits.map((e, i) => ({ ...e, id: 'e' + i }));
  const a = createSubwayState({ exits: ex }), b = createSubwayState({ exits: ex });
  assert.ok(a.enter('e0')); for (let i = 0; i < 100; i++) a.tick(0.1);
  assert.equal(a.phase, 'inside'); assert.ok(a.leaveByTrain()); assert.equal(a.phase, 'outside'); assert.equal(a.leaveByTrain(), false);
  assert.ok(b.arriveByTrain()); assert.equal(b.phase, 'inside'); assert.equal(b.entry, null); assert.equal(b.arriveByTrain(), false);
}
console.log('subway ride: car counts · screen doors · directions · ride stops · signs · motion · timetable = board · live (fixture) · zones · segments · station hop OK');
