// [traffic-fix] 미금 차량 NPC(MigeumCars = JzCars 상속) 교착 재현(노드): node scripts/probe-migeum-gridlock.mjs [분=15] [hour=18] [fix=1|0] [base=44]
//   미금 차도 그래프(npc.json + roads.json) · 코리더 횡단보도 신호(같은 주기) · 시점 = 미금역. 60초 넘게 선 차량 수를 30초마다 센다.
import './corridor/test/dom-shim.mjs';
import fs from 'node:fs';
import { MigeumCars, withMigeumDrive, MIGEUM_NPC_FILE } from '../src/corridor/migeumNpc.js';
import { MIGEUM_ROADS_FILE } from '../src/corridor/migeumRoads.js';
import { CYCLE, hash } from '../src/transit/transit.js';
const R = (f) => JSON.parse(fs.readFileSync(new URL('../public/corridor/' + f, import.meta.url)));
const MIN = Number(process.argv[2] || 15), HOUR = Number(process.argv[3] || 18), FIX = (process.argv[4] ?? '1') !== '0', BASE = Number(process.argv[5] || 44);
const npc = withMigeumDrive(R(MIGEUM_NPC_FILE), R(MIGEUM_ROADS_FILE), { ext: true }), mg = R('migeum/index.json'), base = R('base.json');
let simTime = 0; const off = new Map();
const pedLight = (c) => { if (!c.sig) return 'none'; if (!off.has(c.cl)) off.set(c.cl, hash('cl' + c.cl) * CYCLE); const t = ((simTime + off.get(c.cl)) % CYCLE - (c.g ? 30 : 0) + CYCLE) % CYCLE; return t < 20 ? 'green' : t < 26 ? 'blink' : 'red'; };
const B = npc.meta.box;
const crossings = base.crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= 10, cl: Math.round(c.x / 90) + ',' + Math.round(c.z / 90), g: Math.abs(c.dir[0]) > Math.abs(c.dir[1]) ? 1 : 0, depth: c.w >= 10 ? 2.2 : 1.8 })).filter((c) => c.x > B.x0 - 50 && c.x < B.x1 + 50 && c.z > B.z0 - 50 && c.z < B.z1 + 50);
const sim = new MigeumCars({ npc, mg, transit: { crossings, pedLight, source: { vehicles: () => [] } }, base: BASE, hour: () => HOUR, fix: FIX });
const st = npc.meta.station; sim.focus = { x: st.x, z: st.z };
const still = new Map(), rows = []; const dt = 1 / 30;
for (let i = 1; i <= MIN * 60 * 30; i++) {
  simTime += dt; sim.update(dt);
  for (const t of sim.list) if (t && !t.parked && t.rec) still.set(t.rec, t.v < 0.1 ? (still.get(t.rec) || 0) + dt : 0);
  if (i % (30 * 30) === 0) {
    let n = 0, s60 = 0; for (const t of sim.list) if (t && !t.parked && t.rec && !t.rec.off) { n++; if ((still.get(t.rec) || 0) > 60) s60++; }
    rows.push({ t: Math.round(simTime), cars: n, still60: s60 });
  }
}
const c = sim.counts(), peak = Math.max(...rows.map((r) => r.still60));
console.log(`migeum hour=${HOUR} fix=${FIX ? 1 : 0} crossings=${crossings.length} peak still60 ${peak} last ${JSON.stringify(rows.at(-1))} stats ${JSON.stringify({ stuck: c.stuck, deadlocks: c.deadlocks, taxiUnlocks: c.taxiUnlocks, cycles: c.cycles, chainStuck: c.chainStuck, stillMax: c.stillMax, respawns: c.respawns })}`);
