// [subway] 2단계 승강장·열차: 량 수 · 스크린도어 번호 · 방면/이웃 역 · 열차 움직임 · 시간표(안내판과 같은 식) · 실시간 · 구역(덧붙이기만) · 주행
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRAIN, LINES, CAR_LEN, DOOR_OFF } from '../src/subway/lines.js';
import { STATIONS, stationTheme } from '../src/subway/stations.js';
import { LINE_STOPS } from '../src/subway/stationsData.js';
import { neighbors, rideStops, nextStops, platformLayout, doorAt, signText, announce, trainMotion, boardable, MOTION, simNextArrival, liveNextArrival, segmentProfile, segmentDist, platformZone, trainZone, isGameStop, trainRunZone, rideTimeline, rideState, snapLive, calledArrival, stationOffsetSec, liveSlots } from '../src/subway/ride.js';
import { createServerClock } from '../src/subway/clock.js';
import { simulatedRows, kstMinute } from '../src/subway/arrivals.js';
import { jaName, jaDir } from '../src/subway/ja.js';
import { normalizeArrival } from '../server/phone/src/subway.js';
import { ZONES, zoneSlot, encodeZone, decodeZone, isZoneId } from '../src/net/zones.js';
import { createSubwayState } from '../src/subway/state.js';
const MG = STATIONS.some((d) => d.id === 'migeum'); // [migeum-sub] 미금 지하철 켜짐 (기본). MIGEUMSUB=0 이면 확장 전 그대로 확인
const GN = STATIONS.some((d) => d.id === 'gangnam'); // [gangnam] 강남 지하철 켜짐 (기본). GANGNAMSUB=0 이면 정자 신사 방면·잠실 내선은 내릴 역 없음

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
if (MG) { // [migeum-sub] 미금이 켜지면 정자 남쪽 방면(수인분당 수원·인천, 신분당 광교)은 미금까지 탈 수 있다
  assert.deepEqual(rideStops('suin', 0, '정자'), [{ name: '미금', game: true, id: 'migeum' }], '정자 인천 방면: 미금에서 내림');
  assert.deepEqual(rideStops('shin', 0, '정자'), [{ name: '미금', game: true, id: 'migeum' }], '정자 광교 방면: 미금에서 내림');
  if (GN) {
    const up = rideStops('shin', 1, '정자');
    assert.equal(up.at(-1).id, 'gangnam', '정자 신사 방면: 강남에서 내림 (판교는 게임 역 아님)');
    assert.ok(up.some((q) => q.name === '판교' && !q.game));
    const fromMg = rideStops('shin', 1, '미금');
    assert.equal(fromMg[0].id, 'jeongja'); assert.equal(fromMg.at(-1).id, 'gangnam');
  } else {
    assert.deepEqual(rideStops('shin', 1, '정자'), [], '정자 신사 방면: 아직 없음 (판교 지하철 없음)');
    assert.deepEqual(rideStops('shin', 1, '미금'), [{ name: '정자', game: true, id: 'jeongja' }]);
  }
  assert.deepEqual(rideStops('suin', 1, '미금')[0], { name: '정자', game: true, id: 'jeongja' });
  assert.deepEqual(rideStops('suin', 0, '미금'), [], '미금 수원 방면: 오리~ 게임 역 없음');
} else {
  assert.deepEqual(rideStops('suin', 0, '정자'), [], '정자 인천 방면: 내릴 게임 역 없음 → 탑승 막음');
  assert.deepEqual(rideStops('shin', 0, '정자'), [], '정자 광교 방면: 내릴 게임 역 없음');
}
const r8 = rideStops('l8', 1, '모란');
assert.equal(r8.at(-1).id, 'jamsil'); assert.ok(r8.some((q) => !q.game), '8호선 모란→잠실: 게임 밖 역(수진 등) 지나감');
assert.deepEqual(rideStops('gg', 1, '이매'), []); assert.deepEqual(rideStops('l9', 1, '석촌'), []);
if (GN) { const l2 = rideStops('l2', 0, '잠실'); assert.equal(l2.at(-1).id, 'gangnam'); assert.ok(l2.some((q) => q.name === '역삼' && !q.game)); }
else assert.deepEqual(rideStops('l2', 0, '잠실'), []);
for (const d of STATIONS) for (const l of d.lines) assert.ok(isGameStop(l, d.name), `${d.name} ${l}`);
// 간판·방송
const sg = signText(STATIONS[0], 'suin', 1);
assert.equal(sg.dirKo, LINES.suin.dirs[1].ko); assert.equal(sg.next, '수내'); assert.equal(sg.nextEn, 'Sunae'); assert.equal(sg.prevEn, MG ? 'Migeum' : null, MG ? '미금 = 게임 역 (OSM name:en)' : '미금 = 게임 밖 → 영문 없음 (지어내지 않음)');
for (const k of ['approach', 'arrived', 'closing', 'next', 'depart', 'noAlight', 'last', 'noRide']) { const a = announce(k, { dirKo: '왕십리 방면', dirEn: 'for Wangsimni', name: '수내', nameEn: 'Sunae' }); assert.ok(a.ko && a.en && a.ja, k); assert.ok(!/[가-힣]/.test(a.ja), `${k}: 일본어에 한글 없음 ${a.ja}`); }
{ // [subway-ja] 일본어 안내 문구 · 역 이름 가타카나 (한국어 발음)
  assert.equal(sg.dirJa, 'ワンシムニ方面');
  const o = { dirKo: '왕십리 방면', dirEn: 'for Wangsimni', dirJa: 'ワンシムニ方面', name: '수내', nameEn: 'Sunae' };
  assert.equal(announce('depart', o).ja, '次は、スネ、スネです。');
  assert.equal(announce('next', { ...o, name: '이매', transferJa: 'キョンガン線', door: 'left' }).ja, 'まもなく、イメ、イメです。キョンガン線にお乗り換えいただけます。お出口は左側です。');
  assert.ok(announce('next', { ...o, door: 'left' }).ko.endsWith('내리실 문은 왼쪽입니다.') && announce('next', o).ko === '이번 역은 수내, 수내역입니다.', '문 안내는 door 줄 때만');
  assert.ok(announce('approach', o).ja.startsWith('まもなく、ワンシムニ方面行きの電車が到着します。'));
  assert.ok(announce('noAlight', { ...o, name: '미금' }).ja.includes('ミグム駅') && announce('noAlight', o).ja.includes('準備中'));
  assert.equal(announce('arrived', { dirKo: '내선순환', dirEn: 'Inner Circle', dirJa: '内回り' }).ja, '内回りの電車です。お降りのお客様を先にお通しください。');
  assert.equal(announce('closing').ja, 'ドアが閉まります。ご注意ください。');
  assert.ok(announce('depart', { name: '정자' }).ja.includes('チョンジャ'), 'dirJa·nameJa 없으면 ja.js 규칙');
  const K = { 정자: 'チョンジャ', 수내: 'スネ', 서현: 'ソヒョン', 이매: 'イメ', 야탑: 'ヤタプ', 모란: 'モラン', 태평: 'テピョン', 가천대: 'カチョンデ', 복정: 'ポクチョン', 장지: 'チャンジ', 왕십리: 'ワンシムニ', 강남: 'カンナム', 잠실: 'チャムシル', 판교: 'パンギョ', 수원: 'スウォン', 인천: 'インチョン', 광교: 'クァンギョ', 신림: 'シルリム', 독립문: 'トンニムムン', 종로3가: 'チョンノサムガ', 원인재: 'ウォニンジェ' };
  for (const [ko, ja] of Object.entries(K)) assert.equal(jaName(ko), ja, ko);
  assert.equal(jaDir('수원·인천 방면'), 'スウォン・インチョン方面'); assert.equal(jaDir('외선순환'), '外回り');
  for (const L of Object.values(LINES)) { assert.ok(L.ja, L.key); for (const d of L.dirs) assert.ok(d.ja && !/[가-힣]/.test(d.ja), d.ko); }
  for (const L of Object.values(LINE_STOPS)) for (const n of L.stops) assert.ok(/^[ァ-ヶー・0-9]+$/.test(jaName(n)), `${n} → ${jaName(n)}`);
}
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
    const rows = simulatedRows(th, ms, th.id);
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
// 구역: 1단계(0..14) 그대로, 승강장 42 + 열차 56 덧붙임 (113) + 장지 대합실·승강장 2 (116)
assert.equal(ZONES.length, 126); assert.deepEqual(ZONES.slice(116, 121), ['migeum-station', 'migeum-station/p-suin-0', 'migeum-station/p-suin-1', 'migeum-station/p-shin-0', 'migeum-station/p-shin-1'], '[migeum-sub] 미금 116..120 덧붙임'); assert.deepEqual(ZONES.slice(121), ['gangnam-station', 'gangnam-station/p-l2-0', 'gangnam-station/p-l2-1', 'gangnam-station/p-shin-0', 'gangnam-station/p-shin-1'], '[gangnam] 121..125'); assert.equal(ZONES[113], 'jangji-station'); assert.equal(ZONES[114], 'jangji-station/p-l8-0'); assert.equal(ZONES[115], 'jangji-station/p-l8-1'); assert.equal(ZONES[1], 'jeongja-station'); assert.equal(ZONES[14], 'jamsil-station');
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
// [subway-sync] 같은 열차 = 같은 순간: 노선 시간표 · 열차 안 타임라인 · 실시간 격자 · 부른 열차 · 편성 구역 · 서버 시계
{
  const T0 = Date.UTC(2026, 10, 3, 3, 7, 0); // KST 12:07
  for (const [line, dir, from] of [['suin', 1, '정자'], ['suin', 0, '수내'], ['l8', 0, '복정'], ['l2', 0, '잠실']]) {
    const rides = rideStops(line, dir, from); if (!rides.length) continue;
    const a = simNextArrival(line, dir, from, T0), segs = rideTimeline(from, rides);
    assert.ok(a && Number.isInteger(a.run));
    for (const g of segs) { // 탄 역 열차(run)가 다음 역들에 서는 순간 = 그 역 시간표의 같은 run
      const b = simNextArrival(line, dir, g.name, a.at + g.arr * 1000 - 500);
      if (!b) continue;
      assert.equal(b.run, a.run, `${line}${dir} ${from}→${g.name} run`);
      assert.ok(Math.abs(b.at - (a.at + g.arr * 1000)) < 1, `${line}${dir} ${from}→${g.name} at`);
    }
    assert.equal(simNextArrival(line, dir, from, a.at).at, a.at, '정차 순간은 그 열차'); assert.equal(simNextArrival(line, dir, from, a.at + 1).run, a.run + 1);
  }
  // 타임라인: board → close → run → stop … → 종착 문 닫힘 = 강제 하차. 같은 e 면 같은 상태 (순수 함수)
  const segs = rideTimeline('정자', rideStops('suin', 1, '정자'));
  assert.equal(rideState(segs, 10).stage, 'board'); assert.equal(rideState(segs, 10).open, 1);
  assert.equal(rideState(segs, MOTION.CLOSE_AT + 3).stage, 'close'); assert.equal(rideState(segs, MOTION.CLOSE_AT + 3).open, 0);
  const g0 = segs[0], mid = rideState(segs, (g0.dep + g0.arr) / 2);
  assert.equal(mid.stage, 'run'); assert.ok(mid.v > 0 && mid.open === 0);
  const st = rideState(segs, g0.arr + 10); assert.equal(st.stage, 'stop'); assert.equal(st.i, 0); assert.equal(st.open, 1);
  assert.equal(rideState(segs, g0.arr + MOTION.DWELL + 1).stage, 'run');
  const last = segs[segs.length - 1]; assert.ok(!rideState(segs, last.arr + 5).end && rideState(segs, last.arr + MOTION.CLOSE_AT + 0.1).end);
  assert.deepEqual(rideState(segs, 123.4), rideState(segs, 123.4));
  // 실시간: 같은 열차를 다른 역에서 봐도(격자 반 칸 안 오차) 같은 run, 같은 응답이면 조회 시각과 무관
  const off = stationOffsetSec('suin', 1, '수내') - stationOffsetSec('suin', 1, '정자');
  const o0 = stationOffsetSec('suin', 1, '정자') * 1000, base = T0 + o0 + 180e3 + 3e3;
  const j = snapLive('suin', 1, 'jeongja', { at: base }), s2 = snapLive('suin', 1, '수내', { at: base + off * 1000 + 20e3 });
  assert.equal(j.run, s2.run); assert.ok(j.live && Math.abs(j.at - base) <= 30e3);
  const fx = [{ line: 'suin', updn: '상행', code: 99, etaSec: 120, trainNo: 'S1' }, { line: 'suin', updn: '상행', code: 1, trainNo: 'S0' }];
  const ls = liveSlots(fx, 'suin', 1, T0); assert.deepEqual(ls.map((q) => q.at), [T0, T0 + 120e3]);
  // 부른 열차: 공유 격자 → 1초 차이로 불러도 같은 열차
  const c1 = calledArrival('suin', 1, 'jeongja', T0 + 100, 13), c2 = calledArrival('suin', 1, 'jeongja', T0 + 1100, 13);
  assert.ok(c1.at - (T0 + 100) >= 13e3 && c1.at - (T0 + 100) < 18.1e3);
  if (Math.floor((T0 + 100 + 13e3 - stationOffsetSec('suin', 1, '정자') * 1000) / 5000) === Math.floor((T0 + 1100 + 13e3 - stationOffsetSec('suin', 1, '정자') * 1000 - 1) / 5000)) assert.equal(c1.run, c2.run);
  // 편성 구역: 슬롯(run%4) 그대로 + run%1000 은 z 에. 다른 run 이면 다른 구역, 예전 슬롯 구역과도 다름
  for (const run of [0, 7, 999, 4123456, -3]) for (const zz of [-1.4, 0, 1.4]) {
    const z = trainRunZone('suin', 1, run); assert.ok(isZoneId(z) && zoneSlot(z.split('/r')[0]) >= 57, z);
    const e = encodeZone(z, 2.5, zz), b = decodeZone(e.x, e.z, e.zone);
    assert.equal(b.zone, z); assert.ok(Math.abs(b.z - zz) < 1e-6 && Math.abs(b.x - 2.5) < 0.01);
  }
  assert.notEqual(trainRunZone('suin', 1, 1), trainRunZone('suin', 1, 5)); assert.equal(trainRunZone('suin', 1, 5).split('/r')[0], trainZone('suin', 1, 5));
  // 서버 시계: offset = s − (c+r)/2, 왕복 짧은 샘플, 샘플 없으면 로컬
  let L = 5e6; const ck = createServerClock({ local: () => L });
  assert.equal(ck.serverNow(), L); assert.ok(!ck.synced);
  ck.add({ c: L - 400, s: L + 8000 - 200 + 150, r: L }); assert.equal(ck.offset, 8150);
  ck.add({ c: L - 20, s: L + 8000 - 10, r: L }); L += 600; assert.equal(ck.offset, 8000);
  assert.ok(!ck.add({ c: L, s: L, r: L - 5 }), '거꾸로 된 샘플 무시');
  assert.equal(ck.serverNow(), L + 8000);
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
