// [gyeongbu-bus] 판교·청계산입구 승강장: 개찰구에서 멈추던 오류(mz 스코프) + 신분당 신사/광교 탑승 경로.
//   재현: 대합실 update 가 개찰구 통로(|z|<1.3)에서 mz 를 참조하면 ReferenceError 로 프레임이 죽어 게임이 멈춘다.
//   (강남 개통 af479a9 가 if (f||s) 블록 안의 mz 를 블록 밖에서 씀)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STATIONS } from '../src/subway/roster.js';
import { stationTheme } from '../src/subway/stations.js';
import {
  rideStops, neighbors, signText, platformLayout, simNextArrival, stationOffsetSec,
  rideTimeline, platformZone, isGameStop, isPassStop,
} from '../src/subway/ride.js';
import { routeMapData } from '../src/subway/routeMap.js';
import { ZONES, zoneSlot, encodeZone } from '../src/net/zones.js';
import { ALLOWED } from '../server/phone/src/subway.js';
import { simulatedRows } from '../src/subway/arrivals.js';

const pangyo = STATIONS.find((s) => s.id === 'pangyo');
const cheong = STATIONS.find((s) => s.id === 'cheonggyesan');
const jeongja = STATIONS.find((s) => s.id === 'jeongja');
assert.ok(pangyo && cheong && jeongja, '판교·청계산입구·정자가 역 목록에 있어야 한다');
assert.equal(isGameStop('shin', '판교'), true);
assert.equal(isGameStop('gg', '판교'), true);
assert.equal(isGameStop('shin', '청계산입구'), true);
assert.equal(isPassStop('shin', '판교'), false);
assert.equal(isPassStop('shin', '청계산입구'), false);

// ---------- 개찰구에서 멈추던 오류 (mz 가 update 스코프에 있어야 함) ----------
const concourse = fs.readFileSync(new URL('../src/subway/concourse.js', import.meta.url), 'utf8');
const updateFn = concourse.match(/function update\(dt[\s\S]*?\n  function render\(/)?.[0];
assert.ok(updateFn, 'concourse update() 를 찾는다');
assert.match(updateFn, /let towardWell = false,\s*mz = 0;/);
assert.match(updateFn, /tapLane\(li, 'me', mz < -0\.2 \? 'out' : 'in'\)/);
assert.doesNotMatch(updateFn, /let mx = [^;\n]*, mz = /);
// 재현: 예전처럼 if (f||s) { let mz } 이면 개찰구 앞에서 ReferenceError
assert.throws(() => {
  const f = 1, s = 0, nearGate = true;
  if (f || s) { let mz = 1; void mz; }
  const li = nearGate ? 0 : -1;
  if (li >= 0) void (mz < -0.2 ? 'out' : 'in');
}, { name: 'ReferenceError' });

// ---------- 판교에서 신분당 양방향 탑승 ----------
const t0 = Date.now();
const toGwang = rideStops('shin', 0, '판교');
const toSinsa = rideStops('shin', 1, '판교');
assert.deepEqual(toGwang.filter((q) => q.game).map((q) => q.id), ['jeongja', 'migeum'], '판교 광교 방면: 정자·미금에서 내린다');
assert.equal(toSinsa.at(-1).id, 'gangnam', '판교 신사 방면: 강남에서 내린다');
assert.ok(toSinsa.some((q) => q.name === '청계산입구' && q.game && q.id === 'cheonggyesan'));
assert.deepEqual(toSinsa.filter((q) => q.pass).map((q) => q.name), ['양재시민의숲', '양재']);

const ggPangyo = rideStops('gg', 0, '판교');
const ggYeoju = rideStops('gg', 1, '판교');
assert.deepEqual(ggPangyo, [], '경강 판교 방면: 종점이라 탈 곳 없음');
assert.deepEqual(ggYeoju.filter((q) => q.game).map((q) => q.id), ['imae'], '경강 여주 방면: 이매에서 내린다');

// ---------- 청계산입구·정자 회귀 ----------
const fromCheongSinsa = rideStops('shin', 1, '청계산입구');
const fromCheongGwang = rideStops('shin', 0, '청계산입구');
assert.equal(fromCheongSinsa.at(-1).id, 'gangnam');
assert.deepEqual(fromCheongGwang.filter((q) => q.game).map((q) => q.id), ['pangyo', 'jeongja', 'migeum']);
const fromJeongjaSinsa = rideStops('shin', 1, '정자');
assert.ok(fromJeongjaSinsa.some((q) => q.id === 'pangyo' && q.game));
assert.ok(fromJeongjaSinsa.some((q) => q.id === 'cheonggyesan' && q.game));
assert.equal(fromJeongjaSinsa.at(-1).id, 'gangnam');

// ---------- 시간표·오프셋·타임라인 (무한 루프·NaN 이면 여기서 멈춤/실패) ----------
const noon = Date.UTC(2026, 10, 10, 3, 0, 0); // 12:00 KST
for (const [def, line, dir] of [
  [pangyo, 'shin', 0], [pangyo, 'shin', 1], [pangyo, 'gg', 0], [pangyo, 'gg', 1],
  [cheong, 'shin', 0], [cheong, 'shin', 1],
  [jeongja, 'shin', 0], [jeongja, 'shin', 1], [jeongja, 'suin', 1],
]) {
  const label = `${def.name} ${line} ${dir}`;
  const lay = platformLayout(line);
  assert.ok(lay.doors.length > 0 && Number.isFinite(lay.half), label);
  const sg = signText(def, line, dir);
  assert.ok(sg.dirKo && sg.name === def.name, label);
  const nb = neighbors(line, dir, def.name);
  assert.ok(nb.prev || nb.next, label);
  const off = stationOffsetSec(line, dir, def.id);
  assert.equal(Number.isFinite(off), true, `${label} offset ${off}`);
  const a = simNextArrival(line, dir, def.id, noon);
  assert.ok(a && Number.isFinite(a.at) && Number.isFinite(a.run), `${label} simNextArrival`);
  const zone = platformZone(def.id, line, dir);
  assert.ok(zoneSlot(zone) > 0, `${label} zone ${zone}`);
  const enc = encodeZone(zone, 0, -2);
  assert.ok(Number.isFinite(enc.x) && Number.isFinite(enc.z), `${label} encodeZone`);
  const map = routeMapData(def, line);
  assert.ok(map && map.meIdx >= 0 && map.stops[map.meIdx].name === def.name, label);
}
const tlSinsa = rideTimeline('판교', toSinsa);
const tlGwang = rideTimeline('판교', toGwang);
assert.ok(tlSinsa.length && tlSinsa.every((s) => Number.isFinite(s.arr) && Number.isFinite(s.dep) && Number.isFinite(s.prof.T)));
assert.ok(tlGwang.length && tlGwang.every((s) => Number.isFinite(s.arr) && Number.isFinite(s.dep)));
assert.ok(Date.now() - t0 < 1000, `스케줄/경로 계산이 ${Date.now() - t0}ms 걸려 멈춘 것처럼 보임`);

const theme = stationTheme(pangyo);
assert.equal(theme.primary.key, 'shin');
assert.equal(theme.transfer.key, 'gg');
assert.deepEqual(ZONES.slice(126, 134), [
  'pangyo-station', 'pangyo-station/p-shin-0', 'pangyo-station/p-shin-1',
  'pangyo-station/p-gg-0', 'pangyo-station/p-gg-1',
  'cheonggyesan-station', 'cheonggyesan-station/p-shin-0', 'cheonggyesan-station/p-shin-1',
]);
assert.ok(ALLOWED.includes('판교') && ALLOWED.includes('청계산입구'));
const rows = simulatedRows(theme, noon, theme.id);
assert.ok(rows.some((r) => r.line === 'shin' && r.dest.includes('신사')));
assert.ok(rows.some((r) => r.line === 'shin' && r.dest.includes('광교')));

console.log('subway pangyo: gate mz scope fixed · 신사→강남 · 광교→정자/미금 · zones 126..133 · 청계산입구/정자 OK');
