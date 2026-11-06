// [traffic-fix] 정자 밖 차량 시스템 교착 회귀 테스트: node scripts/test-traffic-fix-all.mjs
//   ① ?trafficfix 플래그가 코리더 차량·미금 차량·버스 시뮬에 모두 전달됨(0 이면 예전 동작)
//   ② 코리더 차량(CorridorCars): 문정역 시점 실제 차도·신호 4분 — 예전엔 합류·교차로에서 서로를 '앞차'로 본 두 차가 영구 정지 → 줄 전체 정체
//   ③ 버스 시뮬: 교착 사슬을 24대까지만 따라가 잠실 환승 거점의 큰 순환(25대+)을 못 찾던 문제 · 최후 안전망(다른 노선 뒤 30초)
import './corridor/test/dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Group } from 'three';
import { parseTrafficFix } from '../src/trafficFix.js';
import { parseTrafficFix as jzParse } from '../src/entities/jzTraffic.js';
import { createCorridorTraffic } from '../src/corridor/traffic.js';
import { MigeumCars, withMigeumDrive, MIGEUM_NPC_FILE } from '../src/corridor/migeumNpc.js';
import { MIGEUM_ROADS_FILE } from '../src/corridor/migeumRoads.js';
import { SimulatedBusSource, createBusSource } from '../src/transit/busSource.js';
import { CYCLE, hash } from '../src/transit/transit.js';
import { mergeMigeumBus } from '../src/corridor/migeumBus.js';
import { mergeLinkTransit } from '../src/corridor/pangyo.js';
import { extendLinkWithExpress } from '../src/corridor/pangyoExpress.js';

const R = (f) => JSON.parse(fs.readFileSync(new URL('../public/' + f, import.meta.url)));
let n = 0; const ok = (m) => console.log('ok', ++n, m);
const index = R('corridor/index.json'), base = R('corridor/base.json'), drive = R('corridor/drive.json'), CO = R('corridor/transit.json'), JZ = R('transit.json');
let simTime = 0; const off = new Map();
const pedLight = (c) => { if (!c.sig) return 'none'; if (!off.has(c.cl)) off.set(c.cl, hash('cl' + c.cl) * CYCLE); const t = ((simTime + off.get(c.cl)) % CYCLE - (c.g ? 30 : 0) + CYCLE) % CYCLE; return t < 20 ? 'green' : t < 26 ? 'blink' : 'red'; };
const crossings = base.crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= 10, cl: Math.round(c.x / 90) + ',' + Math.round(c.z / 90), g: Math.abs(c.dir[0]) > Math.abs(c.dir[1]) ? 1 : 0, depth: c.w >= 10 ? 2.2 : 1.8 }));
const corridor = (q, getBuses = () => []) => createCorridorTraffic(new Group(), { drive, crossings: { crossings, pedLight }, terrain: null, terrainT: null, world: { onRoad: () => false, isBlocked: () => false }, stations: index.stations, liveBox: index.meta.liveBox, getBuses, params: new URLSearchParams(q), overlay: null, hints: null });

// ① 플래그
assert.equal(jzParse, parseTrafficFix, '정자와 같은 파서');
for (const [q, v] of [['', true], ['trafficfix=0', false], ['trafficfix=off', false], ['trafficfix=1', true]]) assert.equal(parseTrafficFix(new URLSearchParams(q)), v);
{
  const on = corridor('cwalkers=0&ctrucks=0&ccars=4'), offT = corridor('cwalkers=0&ctrucks=0&ccars=4&trafficfix=0');
  assert.equal(on.cars.fix, true); assert.equal(on.cars.mutualYield, true);
  assert.equal(offT.cars.fix, false); assert.ok(!offT.cars.mutualYield);
  const npc = withMigeumDrive(R('corridor/' + MIGEUM_NPC_FILE), R('corridor/' + MIGEUM_ROADS_FILE), { ext: true }), mg = R('corridor/migeum/index.json');
  assert.equal(new MigeumCars({ npc, mg, base: 4, hour: () => 12 }).fix, true);
  assert.equal(new MigeumCars({ npc, mg, base: 4, hour: () => 12, fix: false }).fix, false, '미금 차량도 ?trafficfix=0 이면 예전 동작');
  assert.equal(new SimulatedBusSource(JZ, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }).fix, true);
  assert.equal(createBusSource('sim', JZ, { x0: -606, x1: 597.2, z0: -608, z1: 939.6 }, { fix: false }).fix, false);
  assert.equal(createBusSource('realtime', JZ, { x0: -606, x1: 597.2, z0: -608, z1: 939.6 }, { proxy: 'http://127.0.0.1:1', fix: false }).fallback.fix, false);
}
ok('?trafficfix 플래그: 코리더 차량 · 미금 차량 · 버스 시뮬(정자 sim·실시간 폴백) 모두 전달');

// ② 코리더 차량: 문정역 시점 4분
function corridorStill(fix, sec = 240, [fx, fz] = [1254, -13192]) {
  simTime = 0; off.clear();
  // 실제처럼 코리더 버스 시뮬도 같이(차량은 근처 버스를 피함)
  const bus = new SimulatedBusSource({ ...CO, crossings }, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true, fix });
  let near = [];
  const L = corridor('cwalkers=0' + (fix ? '' : '&trafficfix=0'), () => near), still = new Map(), dt = 1 / 30; let peak = 0;
  for (let i = 1; i <= sec * 30; i++) {
    simTime += dt;
    bus.update(dt, { pedLight }, { x: fx, z: fz });
    near = bus.vehicles().filter((v) => Math.hypot(v.x - fx, v.z - fz) < 450 && v.scale > 0.02);
    L.update(dt, fx, fz);
    for (const t of L.cars.list) if (t && !t.parked) still.set(t, t.v < 0.1 && t.state !== 'pickup' ? (still.get(t) || 0) + dt : 0);
    if (i % 300 === 0) peak = Math.max(peak, L.cars.list.filter((t) => t && !t.parked && (still.get(t) || 0) > 60).length);
  }
  return { peak, moving: L.cars.list.filter((t) => t && !t.parked && t.v > 0.5).length, stats: L.cars.stats0 };
}
{
  const a = corridorStill(false), b = corridorStill(true);
  assert.ok(a.peak >= 5, `재현: 예전 동작에서 문정 4분 안에 60초+ 정지 ${a.peak}대 (5대 이상이어야 재현)`);
  assert.equal(b.peak, 0, `수정 후 60초+ 정지 ${b.peak}대`);
  ok(`코리더 차량 문정 4분: 60초+ 정지 예전 ${a.peak}대 → 수정 ${b.peak}대 (움직이는 차 ${a.moving} → ${b.moving}, 최후 안전망 ${b.stats.stillMax}회)`);
}

// ③ 버스: 교착 사슬 길이 · 최후 안전망
{
  const mk = (fix) => new SimulatedBusSource({ ...CO, crossings: [] }, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true, fix });
  const ring = (k) => { const r = Array.from({ length: k }, (_, i) => ({ id: i, v: 0, state: 'queue', _blk: null })); r.forEach((b, i) => { b._blk = r[(i + 1) % k]; }); return r; };
  const on = mk(true), old = mk(false);
  for (const k of [2, 10, 24]) { const r = ring(k); assert.ok(on._cycle(r[0], r[1]) && old._cycle(r[0], r[1]), `순환 ${k}대`); }
  for (const k of [26, 70, 300]) { const r = ring(k); assert.ok(on._cycle(r[0], r[1]), `수정 후 순환 ${k}대를 찾아야`); assert.ok(!old._cycle(r[0], r[1]), `예전 동작은 ${k}대 순환을 못 찾음(재현)`); }
  const r = ring(40); r[20].state = 'dwell'; assert.ok(!on._cycle(r[0], r[1]), '정류장 정차 중인 버스에서 사슬이 끊김 = 교착 아님');
  // 최후 안전망: 다른 노선 버스 바로 뒤(같은 자리)에서 75초 넘게 섬 → 4초 무시, 같은 노선은 해당 없음
  const sim = mk(true); sim.buses = [];
  const P1 = sim.paths[0], P2 = sim.paths.find((p) => p !== P1);
  const b = sim._spawn(P1, 200), o = sim._spawn(P2, 200);
  const near = (S, b, o) => { S._buildGrid(null); Object.assign(o._q, b._q); for (const c of S._grid.values()) if (c.includes(b) && !c.includes(o)) c.push(o); }; // o 를 b 와 같은 칸에 둠
  near(sim, b, o);
  sim._conf = (x, y) => (x === b && y === o ? 10 : null); // o 가 내 길 위 10m 앞
  b.v = 0; b._still = 10;
  assert.equal(sim._ahead(b, 0.1)?.o?.id, o.id, '30초 전엔 앞차로 따라감');
  b._still = 80; assert.equal(sim._ahead(b, 0.1), null, '30초 넘으면 4초 무시'); assert.equal(sim.stats.stillMax, 1); assert.ok(b._ign > 0);
  const old2 = mk(false); old2.buses = []; const b2 = old2._spawn(old2.paths[0], 200), o2 = old2._spawn(old2.paths.find((p) => p !== old2.paths[0]), 200);
  near(old2, b2, o2); old2._conf = (x, y) => (x === b2 && y === o2 ? 10 : null); b2.v = 0; b2._still = 500;
  assert.equal(old2._ahead(b2, 0.1)?.o?.id, o2.id, '?trafficfix=0: 예전처럼 계속 기다림');
}
ok('버스 시뮬: 25대 이상 순환 교착도 찾음(예전 24대 한계) · 정차 버스에선 끊김 · 30초 최후 안전망 · ?trafficfix=0 예전 동작');

// ④ 버스 시뮬 통합: 게임과 같은 코리더 노선 조합(판교·미금 포함) · 잠실 시점 15분 — 예전엔 합류에서 끼어들 틈이 안 나 줄이 계속 길어짐
function busStill(fix, min = 15) {
  simTime = 0; off.clear();
  const LINK = R('corridor/pangyo/link.json'), EX = R('corridor/pangyo/express.json'), MG = R('corridor/migeum/bus.json');
  const data = mergeMigeumBus(mergeLinkTransit({ ...CO, crossings }, extendLinkWithExpress(LINK, EX)), MG.corridor);
  const sim = new SimulatedBusSource(data, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true, fix }), focus = { x: -726, z: -16218 }, DT = 0.25;
  const still = new Map(); let ever = 0, worst = 0;
  for (let k = 1; k * DT <= min * 60; k++) {
    simTime += DT; sim.update(DT, { pedLight }, focus);
    for (const b of sim.buses) { const w = b.v < 0.2 && b.state !== 'dwell' && b.state !== 'end' ? (still.get(b) || 0) + DT : 0; if (w > 60 && (still.get(b) || 0) <= 60) ever++; still.set(b, w); worst = Math.max(worst, w); }
  }
  return { ever, worst: Math.round(worst), stats: sim.stats };
}
{
  const a = busStill(false), b = busStill(true);
  assert.ok(a.ever >= 10 && a.worst > 150, `재현: 예전 동작 잠실 15분 60초+ 정지(정차 제외) ${a.ever}대`);
  // 수정 후: 영구 정체 없음 = 최장 정지 90초 미만 · 60초 넘는 버스 거의 없음(같은 노선 앞차가 막 빠져나가는 중 잠깐 1~2대는 허용)
  assert.ok(b.worst < 90 && b.ever <= 3, `수정 후 60초+ 정지 ${b.ever}대 (최장 ${b.worst}초)`);
  ok(`버스 시뮬 잠실 15분: 60초+ 정지(정류장 정차 제외) 예전 ${a.ever}대·최장 ${a.worst}초 → 수정 ${b.ever}대·최장 ${b.worst}초`);
}
console.log('test-traffic-fix-all: ok');
