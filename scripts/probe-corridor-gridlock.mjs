// [traffic-fix] 코리더 차량(CorridorCars: 코리더 택시·일반 차량·주행 Steel Truck — 수내~잠실·판교·미금 큰길) 교착 재현(노드)
//   node scripts/probe-corridor-gridlock.mjs [분=15] [fix=1|0] [focus=sunae,seohyeon,pangyo,...]
//   실제 public/corridor/drive.json · base.json 횡단보도(코리더와 같은 신호 주기) · 코리더 버스 시뮬(transit.json) 을 같이 돌리고
//   시점(focus) 주변 상자 안 차량의 '60초 넘게 정지' 수를 30초마다 센다.
import './corridor/test/dom-shim.mjs';
import fs from 'node:fs';
import { Group } from 'three';
import { createCorridorTraffic } from '../src/corridor/traffic.js';
import { SimulatedBusSource } from '../src/transit/busSource.js';
import { CYCLE, hash } from '../src/transit/transit.js';
const D = new URL('../public/corridor/', import.meta.url);
const J = (f) => JSON.parse(fs.readFileSync(new URL(f, D)));
const index = J('index.json'), base = J('base.json'), drive = J('drive.json'), T = J('transit.json'), live = index.meta.liveBox;
const MIN = Number(process.argv[2] || 15), FIX = process.argv[3] ?? '1';
const FOCI = { sunae: [522, -1316], seohyeon: [1325, -2035], imae: [1767, -3147], yatap: [1801, -4952], pangyo: [265, -3100], migeum: [59, 1845], jamsil: [-726, -16218], gachon: [1625, -9086], moran: [1838, -7349], taepyeong: [1716, -8093], bokjeong: [1625, -11524], jangji: [1568, -12424], munjeong: [1254, -13192], garak: [910, -13931], songpa: [339, -14726], seokchon: [-110, -15343] };
const pick = (process.argv[4] || Object.keys(FOCI).join(',')).split(',');
let simTime = 0;
const list = base.crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= 10, cl: Math.round(c.x / 90) + ',' + Math.round(c.z / 90), g: Math.abs(c.dir[0]) > Math.abs(c.dir[1]) ? 1 : 0, depth: c.w >= 10 ? 2.2 : 1.8 }));
const offsets = new Map();
const pedLight = (c) => { if (!c.sig) return 'none'; if (!offsets.has(c.cl)) offsets.set(c.cl, hash('cl' + c.cl) * CYCLE); const t = ((simTime + offsets.get(c.cl)) % CYCLE - (c.g ? 30 : 0) + CYCLE) % CYCLE; return t < 20 ? 'green' : t < 26 ? 'blink' : 'red'; };
const crossings = { crossings: list, pedLight };
const world = { onRoad: () => false, isBlocked: () => false, groundY: null };
const out = {};
for (const name of pick) {
  const [fx, fz] = FOCI[name]; simTime = 0;
  const bus = new SimulatedBusSource({ ...T, crossings: list }, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true });
  let near = [];
  const q = new URLSearchParams('cwalkers=0' + (FIX === '0' ? '&trafficfix=0' : FIX === '1' ? '' : ''));
  const L = createCorridorTraffic(new Group(), { drive, crossings, terrain: null, terrainT: null, world, stations: index.stations, liveBox: live, getBuses: () => near, params: q, overlay: null, hints: null });
  const cars = L.cars, still = new Map(), rows = [];
  const dt = 1 / 30;
  for (let i = 1; i <= MIN * 60 * 30; i++) {
    simTime += dt;
    bus.update(dt, { pedLight }, { x: fx, z: fz });
    near = bus.vehicles().filter((v) => Math.hypot(v.x - fx, v.z - fz) < 450 && v.scale > 0.02);
    L.update(dt, fx, fz);
    for (const t of cars.list) if (t && !t.parked) still.set(t, t.v < 0.1 && t.state !== 'pickup' ? (still.get(t) || 0) + dt : 0);
    if (i % (30 * 30) === 0) {
      let n = 0, mov = 0, s30 = 0, s60 = 0, s120 = 0;
      for (const t of cars.list) if (t && !t.parked) { n++; if (t.v > 0.5) mov++; const w = still.get(t) || 0; if (w > 30) s30++; if (w > 60) s60++; if (w > 120) s120++; }
      const r = { t: Math.round(simTime), cars: n, moving: mov, still30: s30, still60: s60, still120: s120, ...(cars.stats0 ? { fix: cars.stats0 } : {}) };
      rows.push(r);
    }
  }
  const last = rows[rows.length - 1], peak60 = Math.max(...rows.map((r) => r.still60));
  out[name] = { rows, peak60, last };
  console.log(name, `fix=${FIX}`, 'peak still60', peak60, 'last', JSON.stringify(last));
  if (process.env.DUMP) for (const t of cars.list) if (t && !t.parked && (still.get(t) || 0) > 60) { const p = t.mesh.position; console.log('  stuck', t.i, t.taxi ? 'taxi' : t.truck ? 'truck' : 'car', p.x.toFixed(1), p.z.toFixed(1), 'still', (still.get(t) || 0).toFixed(0), 'why', t._why || '', 'lead', t._lead ?? ''); }
}
fs.writeFileSync(process.env.OUT || `/workspace/bw-traffic-jam-tools/corridor-f${FIX}-${pick.join('_')}.json`, JSON.stringify(out));
