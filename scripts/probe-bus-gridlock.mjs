// [traffic-fix] 버스 교착 재현(노드): node scripts/probe-bus-gridlock.mjs [분=15] [fix=1|0]
//   게임과 같은 데이터 조합으로 SimulatedBusSource 를 신호 주기(CYCLE)와 함께 돌려 '정차(dwell)가 아닌데 60초 넘게 멈춘 버스' 수를 센다.
//   정자 실시간 폴백(spacing 끔, 원본 transit.json) · 정자 ?bus=sim(jz-sim.json + 판교 8110 + 미금 노선 조각) · 코리더(판교·미금 노선 포함, 횡단보도 신호)
import './corridor/test/dom-shim.mjs';
import fs from 'node:fs';
import { SimulatedBusSource } from '../src/transit/busSource.js';
import { CYCLE, hash, mergeSimExtra } from '../src/transit/transit.js';
import { mergeMigeumBus } from '../src/corridor/migeumBus.js';
import { mergeLinkTransit } from '../src/corridor/pangyo.js';
import { extendLinkWithExpress } from '../src/corridor/pangyoExpress.js';
const R = (f) => JSON.parse(fs.readFileSync(new URL('../public/' + f, import.meta.url)));
const MIN = Number(process.argv[2] || 15), FIX = (process.argv[3] ?? '1') !== '0', DT = Number(process.env.DT || 0.25);
const JZ = R('transit.json'), X = R('corridor/jz-sim.json'), LINK = R('corridor/pangyo/link.json'), MG = R('corridor/migeum/bus.json'), EX = R('corridor/pangyo/express.json');
const CO = R('corridor/transit.json'), base = R('corridor/base.json');
const JZB = { x0: -606, x1: 597.2, z0: -608, z1: 939.6 }, BIG = { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 };
let simTime = 0;
const mkLight = () => { const off = new Map(); return (c) => { if (!c.sig) return 'none'; if (!off.has(c.cl)) off.set(c.cl, hash('cl' + c.cl) * CYCLE); const t = ((simTime + off.get(c.cl)) % CYCLE - (c.g ? 30 : 0) + CYCLE) % CYCLE; return t < 20 ? 'green' : t < 26 ? 'blink' : 'red'; }; };
const coX = base.crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= 10, cl: Math.round(c.x / 90) + ',' + Math.round(c.z / 90), g: Math.abs(c.dir[0]) > Math.abs(c.dir[1]) ? 1 : 0, depth: c.w >= 10 ? 2.2 : 1.8 }));
const jzSim = mergeMigeumBus(mergeSimExtra(mergeSimExtra(JZ, X), LINK.live), MG.live, { flag: 'simExtra' });
const coSim = mergeMigeumBus(mergeLinkTransit({ ...CO, crossings: coX }, extendLinkWithExpress(LINK, EX)), MG.corridor);
const cases = [
  ['정자 실시간 폴백(spacing 끔)', JZ, JZB, false, null],
  ['정자 ?bus=sim', jzSim, JZB, true, null],
  ['코리더 시뮬(서현 시점)', coSim, BIG, true, { x: 1432, z: -1938 }],
  ['코리더 시뮬(판교 시점)', coSim, BIG, true, { x: 265, z: -3100 }],
  ['코리더 시뮬(미금 시점)', coSim, BIG, true, { x: 59, z: 1845 }],
  ['코리더 시뮬(잠실 시점)', coSim, BIG, true, { x: -726, z: -16218 }],
];
const out = {};
for (const [name, data, bounds, spacing, focus] of cases) {
  simTime = 0; const pedLight = mkLight();
  const sim = new SimulatedBusSource(data, bounds, { seed: 7, spacing, fix: FIX });
  const still = new Map(); let peak = 0, ever = 0, worst = 0; const evers = new Set(), byReason = {};
  for (let k = 1; k * DT <= MIN * 60; k++) {
    simTime += DT; sim.update(DT, { pedLight }, focus || undefined);
    for (const b of sim.buses) { const w = b.v < 0.2 && b.state !== 'dwell' && b.state !== 'end' ? (still.get(b) || 0) + DT : 0; still.set(b, w); if (w > 60 && !evers.has(b)) { evers.add(b); byReason[b.state] = (byReason[b.state] || 0) + 1; } worst = Math.max(worst, w); }
    if (k % Math.round(30 / DT) === 0) { const n = sim.buses.filter((b) => (still.get(b) || 0) > 60).length; peak = Math.max(peak, n); }
  }
  const r = { buses: sim.buses.length, done: sim.stats.done, peakStill60: peak, everStill60: evers.size, byState: byReason, worstStillSec: Math.round(worst), giveUp: sim.stats.giveUp ?? null, stillMax: sim.stats.stillMax ?? null, bay2: sim.stats.bay2 ?? null };
  out[name] = r; console.log(name, `fix=${FIX ? 1 : 0}`, JSON.stringify(r));
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
