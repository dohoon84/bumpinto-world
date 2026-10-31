// [ride] 세워주세요·안내 방송·정자 차도 병합 테스트: node scripts/corridor/test/test-ride-extras.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import { announceText, createRideSound } from '../../../src/ride/sound.js';
import { findStopAhead } from '../../../src/ride/route.js';
import { mergeLiveDrive } from '../../../src/corridor/traffic.js';

// 1) 안내 방송 문구
assert.equal(announceText('수내역', '정자역', false), '이번 정류장은 수내역입니다. 다음 정류장은 정자역입니다.');
assert.match(announceText('잠실역', null, false), /^이번 정류장은 종점, 잠실역입니다\.$/);
assert.equal(announceText('수내역', '정자역', true), 'This stop is 수내역. The next stop is 정자역.');
assert.match(announceText('잠실역', null, true), /잠실역.*last stop/);

// 2) 음성 없음·?rideVoice=0 은 조용히 무시
const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const s0 = createRideSound({ params: new URLSearchParams('rideVoice=0'), storage });
assert.equal(s0.muted, true);
assert.doesNotThrow(() => { s0.say('테스트'); s0.bell(); });
const s1 = createRideSound({ params: new URLSearchParams(''), storage });
assert.doesNotThrow(() => { s1.say('테스트'); s1.bell(); });
s1.setMuted(true); assert.equal(s1.muted, true);

// 3) findStopAhead: 교차로·신호·고속도로 피하고, 끝 근처면 null
const ways = [{ k: 'secondary' }, { k: 'secondary' }, { k: 'motorway' }, { k: 'tertiary' }];
const segs = [{ way: 0, sEnd: 100 }, { way: 1, sEnd: 200 }, { way: 2, sEnd: 400 }, { way: 3, sEnd: 600 }];
const t = { s: 0, v: 0, cum: [0, 600], segs, sigQ: [] };
let r = findStopAhead(t, ways);
assert.ok(r && r.s >= 22 && r.s < 100 - 16, 'first safe point on way 0 before the junction');
r = findStopAhead({ ...t, s: 70 }, ways);
assert.ok(r.s >= 116 && r.way === 1, 'skips the junction at 100 m');
r = findStopAhead({ ...t, s: 70, sigQ: [{ s: 120 }] }, ways);
assert.ok(r.s >= 138, 'skips ±18 m around a signal');
r = findStopAhead({ ...t, s: 190 }, ways);
assert.equal(r.way, 3, 'never stops on a motorway');
r = findStopAhead({ ...t, s: 70, v: 27.8 }, ways);
assert.ok(r.s >= 70 + 27.8 * 27.8 / 6 + 14, 'respects braking distance');
assert.equal(findStopAhead({ ...t, s: 575 }, ways), null, 'too close to the end');
r = findStopAhead(t, ways, { nearCrossing: (s) => s < 60 });
assert.ok(r.s >= 60, 'avoids crosswalks');

// 4) mergeLiveDrive: 상자 안 비서비스 도로만, 겹치는 구간 생략, jz 표시
const drive = { nodes: [[0, 0], [100, 0]], ways: [{ k: 'secondary', n: [0, 1] }] };
const live = { nodes: [[0, 0], [100, 0], [100, 100], [5000, 5000], [0, 100]], ways: [
  { k: 'secondary', n: [0, 1, 2] }, // 0>1 은 이미 있음 → 1>2 만 추가
  { k: 'service', n: [2, 4] }, // service 제외
  { k: 'tertiary', n: [2, 3] }, // 상자 밖 노드 → 1점 run 이라 제외
  { k: 'residential', n: [4, 2] },
] };
const box = { x0: -10, x1: 110, z0: -10, z1: 110 };
const { drive: m, added } = mergeLiveDrive(drive, live, box);
assert.equal(added, 2);
assert.equal(m.ways.length, 3);
assert.ok(m.ways.slice(1).every((w) => w.jz === 1));
assert.deepEqual(m.ways[1].n, [1, 2], 'shared edge deduped, node snapped to existing');
assert.equal(m.nodes.length, 4);
assert.equal(drive.ways.length, 1, 'input not mutated');
assert.equal(mergeLiveDrive(drive, null, box).added, 0);

console.log('test-ride-extras: ok');
