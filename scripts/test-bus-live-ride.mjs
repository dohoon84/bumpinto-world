// [live-ride] 실시간 모드 탑승용 '실시간이 운전하는 버스' 오프라인 테스트: node scripts/test-bus-live-ride.mjs
//   실제 프록시 피드를 녹화한 픽스처(scripts/fixtures/bus-replay-jeongja.json, record-bus-replay.mjs 로 녹화 — 지어낸 값 없음)를
//   URL 그대로 재생해서, 게임과 같은 RealtimeBusSource 로 → 정류장 정차(15–25s)·부드러운 감가속·cap(실시간보다 앞서지 않음)·
//   다음 조회 때 점프 없음·타고 있으면 순간이동 무시·실패 시 시뮬 복귀 를 확인한다. ★ 표시 입력만 테스트 전용 합성값(순간이동 흉내).
import './corridor/test/dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createBusSource, LIVE_DWELL, LIVE_HOLD, SNAP_M, FADE_S } = await import('../src/transit/busSource.js');
const R = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-replay-jeongja.json', import.meta.url)));
const T = JSON.parse(fs.readFileSync(new URL('../public/transit.json', import.meta.url)));
const C = { pedLight: () => 'red' }; // 보행 신호 빨강 = 차량 진행
let n = 0; const ok = (m) => console.log('  ok', ++n, m);
let snap = 0, fail = false;
globalThis.fetch = async (url) => {
  if (fail) throw new Error('offline');
  const u = new URL(url), k = u.pathname + u.search, L = R.locations[k];
  const r = L ? L[Math.min(snap, L.length - 1)] : R.responses[k];
  if (!r) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: r.status < 400, status: r.status, json: async () => r.json };
};
const src = createBusSource('realtime', T, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { proxy: R.proxy });
const F = src.fallback;
for (let i = 0; i < 300; i++) F.update(0.2, C); // 시뮬이 먼저 돌던 상태(실시간 응답 전)
const simBefore = F.buses.length;
await src._refresh();
assert.equal(src.locState, 'ok', src.locError);
const live = F.buses.filter((b) => b.live);
assert.ok(live.length >= 1, 'live buses injected into the fallback sim');
assert.equal(live.length, src.liveVehicles.length);
for (const b of live) {
  assert.equal(b.id, b.live, 'vehicle id = live id (hideIds/boarding match)');
  assert.equal(b.state, 'dwell', 'GBIS stationSeq → dwelling at that stop');
  assert.ok(b.dwell >= LIVE_DWELL * 0.8 - 1e-9 && b.dwell <= LIVE_DWELL * 1.3 + 1e-9, `dwell ${b.dwell.toFixed(1)}s in 14.4–23.4s`);
}
const lp = src.livePathSet;
assert.ok(lp.size > 0 && [...lp].every((P) => F.livePaths.has(P)));
const fading = F.buses.filter((b) => !b.live && lp.has(b.P));
assert.ok(fading.every((b) => b.leave > 0), 'sim buses on live paths fade out');
ok(`recorded feed (${R.recordedAt}): ${live.length} live buses at their GBIS stop, dwell ${live.map((b) => b.dwell.toFixed(1)).join('/')}s · ${fading.length} sim buses on live paths fading (sim had ${simBefore})`);
// 페이드 후 사라짐 + 실시간 경로엔 시뮬 배차 없음, 다른 경로 시뮬은 유지
for (let i = 0; i < 10; i++) F.update(0.2, C);
assert.equal(F.buses.filter((b) => !b.live && lp.has(b.P)).length, 0, 'no sim buses left/spawned on live paths');
assert.ok(F.buses.some((b) => !lp.has(b.P)), 'other paths keep sim buses');
const vis = src.vehicles(); assert.ok(live.every((b) => vis.some((v) => v.id === b.id && v.live)), 'vehicles() lists live buses');
ok('sim buses on live paths gone after fade; non-live paths still simulated; vehicles() = fallback');
// 주행: 감가속 한도·후진 없음·cap 넘지 않음·다음 정류장 정차(15–25s)·cap 정류장에서 대기
const b = live[0], P = b.P, nextStop = P.stops[b.stopIdx + 1], dt = 0.1;
let prevS = b.s, prevV = 0, maxDV = 0, dwellAt = null, dwellT = 0, arrived = false, t = 0;
for (; t < 200; t += dt) {
  F.update(dt, C);
  assert.ok(b.s >= prevS - 1e-9, 'never backwards'); assert.ok(b.s <= b.capS + 0.05, 'never past the cap');
  if (!(b.state === "dwell" && prevV < 0.8)) maxDV = Math.max(maxDV, Math.abs(b.v - prevV) / dt); // 정차 직전 0.8m/s 미만 → 0 스냅은 제외(시뮬과 같은 정차 처리)
  if (b.state === 'dwell' && Math.abs(b.s - nextStop.s) < 1.5) { arrived = true; dwellT += dt; dwellAt ??= t; }
  prevS = b.s; prevV = b.v;
}
assert.ok(arrived, 'stopped at the next stop'); assert.ok(dwellT >= 14 && dwellT <= 24, `dwell at next stop ${dwellT.toFixed(1)}s`);
assert.ok(maxDV <= 3.61, `smooth accel/decel (max |dv/dt| ${maxDV.toFixed(2)} ≤ 3.6 = sim braking cap 2·DEC)`);
ok(`drives ${nextStop ? T.stops.find((s) => s.id === nextStop.stop)?.name : '?'}: arrived t=${dwellAt?.toFixed(0)}s, dwell ${dwellT.toFixed(1)}s, max |a| ${maxDV.toFixed(2)} m/s², cap ${b.capS.toFixed(0)}m not passed`);
// cap 정류장 대기(다음 조회 전): 정차 시간 + 최대 LIVE_HOLD 동안 문 열고 기다림 → 그 뒤엔 문 닫고 그 자리
for (; t < 600; t += dt) F.update(dt, C);
assert.ok(Math.abs(b.s - b.capS) < 1.5, 'waits at the cap stop until the next GPS update');
ok(`waits at cap stop (${b.s.toFixed(0)}m) — held up to ${LIVE_HOLD}s with doors open, then idles until the next poll`);
// 다음 조회(실제 두 번째 스냅샷, 같은 정류장): 뒤로 점프 없음
snap = 1; const s1 = b.s; await src._pollLocations(); assert.equal(b.s, s1, 'next poll behind us → no rubber-band');
ok('2nd recorded snapshot: position kept (no backward jump), cap = next stop');
// ★ 테스트 전용 합성 입력: 순간이동(조회 공백) — 안 탄 버스는 SNAP_M 넘으면 그 자리로(페이드인), 탄 버스는 무시
const far = { id: b.live, P, s: Math.min(P.L - 1, b.s + SNAP_M + 50) };
const other = live[1] || null;
if (other) {
  other.ride = true; const so = other.s;
  F.syncLive([far, { id: other.live, P: other.P, s: Math.max(0, other.s - SNAP_M - 10) }], lp);
  assert.equal(other.s, so, 'ridden bus is never moved by live data');
  assert.ok(other.leave == null, 'ridden bus never fades');
} else F.syncLive([far], lp);
assert.ok(Math.abs(b.s - far.s) < 1e-6 && b.age === 0, 'teleport > SNAP_M → placed, fades in');
ok(`teleport > ${SNAP_M}m: idle bus re-placed with ${FADE_S}s fade-in; ridden bus untouched${other ? '' : ' (single live bus: ridden check skipped)'}`);
// 실시간에서 사라짐: 안 탄 버스는 페이드아웃, 탄 버스는 계속
F.syncLive([], lp);
assert.ok(b.leave > 0, 'vanished → fade out'); if (other) assert.ok(other.leave == null && !other.done);
ok('vanished from feed → fade out (ridden bus keeps running)');
// 실패 → 시뮬 복귀(실시간 버스는 cap 없이 계속, 시뮬 배차 재개)
fail = true; src.nextPoll = 0; src.inflight = false; src.update(0.1, C); await new Promise((r) => setTimeout(r, 10));
assert.equal(src.locState, 'error'); assert.equal(F.livePaths, null);
assert.ok(F.buses.filter((x) => x.live).length === 0 && (!other || other.capS == null));
const before = F.buses.length; for (let i = 0; i < 600; i++) F.update(0.2, C);
assert.ok(F.buses.some((x) => lp.has(x.P) && !x.live && x !== other), 'sim resumes on formerly-live paths');
ok(`feed failure → sim fallback (live released, sim spawning again: ${before}→${F.buses.length})`);
console.log(`bus-live-ride: ${n} passed`);
