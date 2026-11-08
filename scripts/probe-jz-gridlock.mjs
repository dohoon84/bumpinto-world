// [jz-traffic] 정자역 사거리 교착 재현(노드, 실제 drive/transit 데이터 + 실제 신호 주기): node scripts/probe-jz-gridlock.mjs [분=10] [hour=20] [fix=1]
import './corridor/test/dom-shim.mjs';
import fs from 'node:fs';
import { Group } from 'three';
import { Taxis } from '../src/entities/taxis.js';
import { JzCars, deliveryStops } from '../src/entities/jzTraffic.js';
import { CYCLE, hash } from '../src/transit/transit.js';
const P = (f) => JSON.parse(fs.readFileSync(new URL('../public/' + f, import.meta.url)));
const drive = P('drive.json'), data = P('jeongja.json'), T = P('transit.json'), shops = P('jeongja-shops.json');
const MIN = Number(process.argv[2] || 10), HOUR = Number(process.argv[3] || 20), FIX = process.argv[4] ?? null;
const crossings = T.crossings.map((c) => ({ ...c, depth: c.sig ? 2.2 : 1.8 }));
let simTime = 0; const offsets = new Map();
const pedLight = (c) => { if (!c.sig) return 'none'; if (!offsets.has(c.cl)) offsets.set(c.cl, hash('cl' + c.cl) * CYCLE); const t = ((simTime + offsets.get(c.cl)) % CYCLE - (c.g ? 30 : 0) + CYCLE) % CYCLE; return t < 20 ? 'green' : t < 26 ? 'blink' : 'red'; };
const transit = { crossings, pedLight, source: { vehicles: () => [] } };
const world = { groundY: null };
const st = data.station;
const sigC = crossings.filter((c) => c.sig && c.w >= 9).sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
const CL = process.env.CL != null ? Number(process.env.CL) : sigC.cl; // CL=4: 느티로×성남대로 사거리
const cl = crossings.filter((c) => c.sig && c.cl === CL); const J = { x: cl.reduce((a, c) => a + c.x, 0) / cl.length, z: cl.reduce((a, c) => a + c.z, 0) / cl.length };
const taxis = new Taxis(new Group(), null, { drive, data, transit, world, count: 24 });
const opts = { drive, data, transit, world, taxis, base: 120, hour: () => HOUR, stops: deliveryStops(shops, data) };
if (FIX != null) opts.fix = FIX !== '0';
const s = new JzCars(opts); s.focus = { x: J.x, z: J.z };
const still = new Map(); const rows = [];
console.log(`junction cl=${CL} center=(${J.x.toFixed(1)},${J.z.toFixed(1)}) crossings=${cl.length} hour=${HOUR} fix=${FIX}`);
const dt = 1 / 30;
for (let i = 1; i <= MIN * 60 * 30; i++) {
  simTime += dt; s.update(dt);
  for (const t of s.list) if (t && !t.parked) { const k = t.rec; if (t.v < 0.1) still.set(k, (still.get(k) || 0) + dt); else still.set(k, 0); }
  if (i % (30 * 30) === 0) {
    let n = 0, mov = 0, st30 = 0, st60 = 0, box = 0, boxMoto = 0, q = 0;
    for (const t of s.list) if (t && !t.parked && !t.rec.off) {
      const d = Math.hypot(t.rec.x - J.x, t.rec.z - J.z); if (d > 120) continue; n++;
      if (t.v > 0.5) mov++; const w = still.get(t.rec) || 0; if (w > 30) st30++; if (w > 60) st60++; if (t.queued) q++;
      if (d < 22) { box++; if (t.moto) boxMoto++; }
    }
    const c = s.counts();
    const r = { t: Math.round(simTime), near: n, moving: mov, still30: st30, still60: st60, queued: q, box, boxMoto, stuck: c.stuck, deadlocks: c.deadlocks, taxiUnlocks: c.taxiUnlocks, cycles: c.cycles, chainStuck: c.chainStuck, stillMax: c.stillMax, recycled: c.recycled, reverts: c.reverts };
    rows.push(r); console.log(JSON.stringify(r));
  }
}
fs.writeFileSync(process.env.OUT || '/workspace/bw-traffic-jam-tools/probe-' + (FIX ?? 'def') + '.json', JSON.stringify(rows));
// DUMP=1: 60초 넘게 선 차량의 양보 사슬(누가 누구를 기다리는지)과 머리 차량 출력, DUMP_TAXI=1,2: 해당 택시 주변
if (process.env.DUMP) {
  const { obbGap } = await import('../src/entities/jzTraffic.js');
  const name = (r) => !r ? '-' : r.mine ? `j${r.ref.i}:${r.ref.kind}` : r.taxi ? `taxi${r.ref.i}` : r.bus ? 'bus' : 'ext';
  const nxt = (r) => r.mine ? (r.ref.yieldTo || r.ref.hitBy) : r.taxi ? r.ref._jzYield : null;
  const heads = new Set();
  for (const t of s.list) if (t && !t.parked && (still.get(t.rec) || 0) > 60 && Math.hypot(t.rec.x - J.x, t.rec.z - J.z) < 150) {
    let r = t.rec; const path = [r], vis = new Set([r]);
    for (;;) { const n = nxt(r); if (n) path.push(n); if (!n || vis.has(n)) break; vis.add(n); r = n; }
    const h = path[path.length - 1]; if (heads.has(h)) continue; heads.add(h);
    console.log('CHAIN len', path.length, 'from', name(t.rec), '→ head', name(h), 'cycle?', path.indexOf(h) < path.length - 1);
    for (const q of path.slice(-6)) { const o = q.ref; console.log('   ', name(q), `(${q.x.toFixed(1)},${q.z.toFixed(1)}) v=${(o.v || 0).toFixed(2)}`, q.mine ? `why=${o.why} q=${o.queued} y=${name(o.yieldTo)} hit=${name(o.hitBy)} stuckT=${o.stuckT.toFixed(1)}` : q.taxi ? `y=${name(o._jzYield)} state=${o.state}` : ''); }
  }
  for (const id of (process.env.DUMP_TAXI || '').split(',').filter(Boolean)) {
    const t = taxis.list[+id], r = t._jzRec;
    console.log(`TAXI${id} pos=(${r.x.toFixed(1)},${r.z.toFixed(1)}) v=${t.v} state=${t.state} yield=${name(t._jzYield)}`);
    for (const o of s.recs) if (o !== r && Math.hypot(o.x - r.x, o.z - r.z) < 14) console.log('   near', name(o), `(${o.x.toFixed(1)},${o.z.toFixed(1)}) gap=${obbGap(r, o).toFixed(2)} v=${(o.v || 0).toFixed(2)}`);
  }
}
