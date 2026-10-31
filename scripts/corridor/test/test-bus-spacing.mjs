// [bus-net] 버스 간격(노선 무관)·정류장 2번째 칸·교착 없음 테스트: node scripts/corridor/test/test-bus-spacing.mjs [초]
//   정자 시뮬(public/transit.json)·코리더(public/corridor/transit.json)를 spacing 끔/켬으로 같은 시간 돌려
//   겹침 시간 비율(같은 방향 두 버스 차체가 실제로 겹친 프레임), 완주 대수(처리량), 오래 멈춘 버스(교착)를 비교한다.
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SimulatedBusSource, createBusSource } from '../../../src/transit/busSource.js';
import { busLength } from '../../../src/transit/busModel.js';

const SEC = Number(process.argv[2]) || 900, DT = 0.1;
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../../public/${f}`, import.meta.url)));
const JZ = read('transit.json'), CO = read('corridor/transit.json');
const JZ_BOUNDS = { x0: -606, x1: 597.2, z0: -608, z1: 939.6 }, BIG = { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 };

function run(data, bounds, spacing, { dt = DT, sec = SEC, focus = null } = {}) {
  const sim = new SimulatedBusSource(data, bounds, { seed: 7, spacing });
  const ctx = { pedLight: () => 'red' };
  let ov = 0, frames = 0, stuck = 0, moving = 0, samples = 0;
  const still = new Map();
  for (let t = 0; t < sec; t += dt) {
    sim.update(dt, ctx, focus || undefined); frames++;
    let vs = sim.vehicles(); const grid = new Map();
    if (focus) vs = vs.filter((v) => Math.hypot(v.x - focus.x, v.z - focus.z) < 450); // 화면에 그려지는 반경만
    for (const v of vs) { const k = `${Math.floor(v.x / 20)},${Math.floor(v.z / 20)}`; (grid.get(k) || grid.set(k, []).get(k)).push(v); }
    let any = false;
    for (const a of vs) {
      const cx = Math.floor(a.x / 20), cz = Math.floor(a.z / 20);
      for (let i = -1; i <= 1 && !any; i++) for (let j = -1; j <= 1 && !any; j++) for (const b of grid.get(`${cx + i},${cz + j}`) || []) {
        if (b.id <= a.id) continue;
        const dh = Math.abs(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading)));
        if (dh >= 0.5) continue;
        const hx = Math.sin(a.heading), hz = Math.cos(a.heading), dx = b.x - a.x, dz = b.z - a.z;
        // 차체가 실제로 겹침: 진행 방향 거리 < 평균 길이 - 0.5m, 옆 거리 < 차폭(2.3m)
        if (Math.abs(dx * hx + dz * hz) < (busLength(a.type) + busLength(b.type)) / 2 - 0.5 && Math.abs(dx * hz - dz * hx) < 2.3) { any = true; break; }
      }
      if (any) break;
    }
    if (any) ov++;
    if (frames % Math.round(1 / dt) === 0) for (const b of sim.buses) {
      samples++; if (b.v > 0.5) moving++;
      const w = b.v < 0.2 && b.state !== 'dwell' ? (still.get(b) || 0) + 1 : 0; still.set(b, w);
      if (w === 90) stuck++; // 90초 넘게 (정차 아닌데) 멈춤
    }
  }
  return { ovPct: (100 * ov) / frames, done: sim.stats.done, buses: sim.buses.length, moving: moving / samples, stuck, stats: sim.stats };
}
const fmt = (r) => `overlap ${r.ovPct.toFixed(1)}% · 완주 ${r.done} · 운행 중 ${r.buses} · 움직이는 비율 ${(r.moving * 100).toFixed(0)}% · 90s+ 정지 ${r.stuck} · 2번째칸 ${r.stats.bay2} · 교착포기 ${r.stats.giveUp}`;
const res = {};
for (const [name, data, bounds] of [['정자 sim', JZ, JZ_BOUNDS], ['corridor', { ...CO, crossings: [] }, BIG]]) {
  const off = run(data, bounds, false), on = run(data, bounds, true);
  console.log(`${name} (${SEC}s)\n  끔: ${fmt(off)}\n  켬: ${fmt(on)}`);
  res[name] = { off, on };
  assert.ok(on.ovPct < 2, `${name}: 겹침 ${on.ovPct.toFixed(1)}% (2% 미만이어야)`);
  assert.ok(on.done >= off.done * 0.85, `${name}: 처리량 ${on.done} < 끔 ${off.done} 의 85%`);
  assert.ok(on.stuck <= Math.max(2, off.stuck), `${name}: 교착 ${on.stuck}`);
}
// 실제 게임처럼 30fps·플레이어 위치(focus) 기준으로 돌렸을 때(간격 계산 반경·16Hz 갱신 경로) 렌더 반경 안 겹침
for (const [nm, f] of [['서현', { x: 1432, z: -1938 }], ['잠실', { x: -919, z: -16183 }]]) {
  const r = run({ ...CO, crossings: [] }, BIG, true, { dt: 1 / 30, sec: Math.min(SEC, 300), focus: f });
  console.log(`corridor 30fps focus ${nm}: ${fmt(r)}`);
  assert.ok(r.ovPct < 2, `focus ${nm}: 겹침 ${r.ovPct.toFixed(1)}%`);
}
// 실시간 모드(정자 기본)의 폴백 시뮬은 spacing 이 꺼져 있어야(정자 기본 동작 불변)
const rt = createBusSource('realtime', JZ, JZ_BOUNDS, { proxy: 'http://127.0.0.1:1' });
assert.equal(rt.fallback.spacing, false);
assert.equal(createBusSource('sim', JZ, JZ_BOUNDS).spacing, true);
console.log('test-bus-spacing: ok');
