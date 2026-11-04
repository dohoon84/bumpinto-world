// [migeum-npc] 미금 보행·차량 NPC 데이터 + 런타임 테스트: node scripts/corridor/test/test-migeum-npc.mjs
//   데이터 재현성 · 차도 그래프(박스 안·새 길·포털) · 밀도표 · 플래그 · 차량 시뮬(박스 경계·차로·무겹침·새 타일 길) · 보행 배치 · 렌더(draw call 1)
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { MAX_PEDS, pedDensityAt, pedPeriod, PED_MIX, parseMigeumCars, MG_CARS_DEFAULT } from '../../../src/corridor/migeumNpcData.js';
import { migeumNpcEnabled, migeumNpcLoader, createMigeumPeds, combineCrowds, MigeumCars, createMigeumTraffic, mountMigeumNpc, MIGEUM_NPC_FILE } from '../../../src/corridor/migeumNpc.js';
import { obbGap } from '../../../src/entities/jzTraffic.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const npc = J('public/corridor/' + MIGEUM_NPC_FILE), mg = J('public/corridor/migeum/index.json');
const B = mg.meta.box;
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };
const segD = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz); };

// 1) 커밋된 데이터 = 스크립트 결과(생성 시각만 다름)
{
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mg-npc-')), 'out.json');
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-migeum-npc.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
  const a = JSON.parse(fs.readFileSync(tmp, 'utf8')), b = structuredClone(npc); delete a.meta.generated; delete b.meta.generated;
  assert.deepEqual(a, b, 'migeum/npc.json 이 build-migeum-npc.mjs 결과와 다름');
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  ok('committed migeum/npc.json matches build output');
}

// 2) 차도 그래프: 박스 안 · 코리더 drive.json 과 way 중복 없음 · 고속도로 없음 · 경계 노드는 포털 · 새 타일 차도 위
const tiles = Object.keys(mg.tiles).map((k) => ({ k, mode: mg.tiles[k].mode, ...J(`public/corridor/migeum/tiles/${k}.json`) }));
const tileRoads = tiles.flatMap((t) => t.r.filter((r) => !/footway|path|steps|cycleway|pedestrian|track/.test(r.k)));
{
  const D = npc.drive, corr = new Set(J('public/corridor/drive.json').ways.map((w) => w.id)), P = new Set(D.portals);
  assert.ok(D.nodes.length > 150 && D.ways.length > 30, `그래프 크기 ${D.nodes.length}/${D.ways.length}`);
  for (const [x, z] of D.nodes) assert.ok(x >= B.x0 - 0.06 && x <= B.x1 + 0.06 && z >= B.z0 - 0.06 && z <= B.z1 + 0.06, `박스 밖 노드 ${x},${z}`);
  for (const w of D.ways) { assert.ok(!corr.has(w.id), `코리더 차도와 중복 ${w.id}`); assert.ok(!/motorway/.test(w.k)); assert.ok(w.n.length >= 2 && w.w >= 6); assert.ok([-1, 0, 1].includes(w.ow)); }
  D.nodes.forEach(([x, z], i) => { const edge = Math.min(Math.abs(x - B.x0), Math.abs(x - B.x1), Math.abs(z - B.z0), Math.abs(z - B.z1)) < 0.06; if (edge) assert.ok(P.has(i), `경계 노드 ${i} 가 포털이 아님`); });
  assert.ok(P.size >= 10);
  // 새 타일 길: 그래프 구간 중점이 미금 타일 차도 띠(폭/2 + 4m) 안
  let on = 0, all = 0;
  for (const w of D.ways) for (let i = 1; i < w.n.length; i++) {
    const a = D.nodes[w.n[i - 1]], b = D.nodes[w.n[i]], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; all++;
    if (tileRoads.some((r) => r.p.some((p, j) => j > 0 && segD(mx, mz, r.p[j - 1], p) < r.w / 2 + 4))) on++;
  }
  assert.ok(on / all > 0.95, `타일 차도 위 구간 비율 ${on}/${all}`);
  assert.ok(npc.walk.length > 500 && npc.stops.length > 10);
  for (const [x, z] of npc.walk) assert.ok(Math.hypot(x - npc.meta.station.x, z - npc.meta.station.z) < 451);
  ok(`drive graph: ${D.nodes.length} nodes / ${D.ways.length} ways, in box, no corridor dup, ${P.size} portals, ${on}/${all} on tile roads`);
}

// 3) 밀도표
{
  const c = (h) => pedDensityAt(h).count;
  assert.equal(pedPeriod(8), 'morning'); assert.equal(pedPeriod(12.5), 'lunch'); assert.equal(pedPeriod(19), 'evening'); assert.equal(pedPeriod(15), 'day'); assert.equal(pedPeriod(23), 'night');
  assert.ok(c(8.5) > c(15) && c(19) > c(15) && c(12.5) > c(15) && c(15) > c(23) && c(3) <= 4);
  for (let h = 0; h < 24; h += 0.25) { const d = pedDensityAt(h); assert.ok(d.count >= 0 && d.count <= MAX_PEDS); assert.ok(Math.abs(Object.values(d.mix).reduce((s, v) => s + v, 0) - 1) < 1e-9); }
  for (const m of Object.values(PED_MIX)) assert.deepEqual(Object.keys(m).sort(), ['exit', 'shop', 'walk']);
  assert.ok(PED_MIX.morning.exit >= 0.5 && PED_MIX.lunch.shop >= 0.4);
  ok('ped density table (rush hours > day > night)');
}

// 4) 플래그
{
  assert.equal(migeumNpcEnabled(''), true);
  assert.equal(migeumNpcEnabled('?migeumnpc=0'), false);
  assert.equal(migeumNpcEnabled('?migeum=0'), false);
  assert.equal(migeumNpcEnabled('?migeum=0&migeumnpc=1'), false);
  assert.deepEqual(parseMigeumCars(new URLSearchParams('')), { on: true, base: MG_CARS_DEFAULT });
  assert.equal(parseMigeumCars(new URLSearchParams('migeumcars=0')).on, false);
  assert.equal(parseMigeumCars(new URLSearchParams('migeumcars=999')).base, 120);
  const pg = { stats: { active: 1 }, register() {}, render() {} };
  assert.equal(combineCrowds([pg, null]), pg, '미금이 꺼지면 판교 훅 그대로');
  assert.equal(combineCrowds([null, null]), null);
  ok('?migeumnpc=0 / ?migeum=0 / ?migeumcars flags; extraCrowd unchanged when off');
}

// 5) 차량 시뮬: 박스 경계 · 차로 위 · 무겹침 · 새 타일 길
{
  const st = npc.meta.station, ways = npc.drive.ways, N = npc.drive.nodes;
  const sim = new MigeumCars({ npc, mg, base: 60, hour: () => 14 });
  sim.focus = { x: st.x, z: st.z };
  const newT = new Set(tiles.filter((t) => t.mode === 'new').map((t) => t.k));
  let maxOut = 0, offRoad = 0, samples = 0, inNew = 0, minGap = Infinity, maxN = 0;
  const roadD = (x, z) => { let best = Infinity; for (const w of ways) for (let i = 1; i < w.n.length; i++) { const d = segD(x, z, N[w.n[i - 1]], N[w.n[i]]) - w.w / 2; if (d < best) best = d; } return best; };
  const T = 150, dt = 0.05;
  for (let k = 0; k < T / dt; k++) {
    if (k === Math.round(60 / dt)) sim.focus = { x: 400, z: 2100 }; // 시점 이동: 박스 남동쪽
    sim.update(dt);
    if (k % 20) continue;
    const act = sim.list.filter((t) => t && !t.parked && t.rec && !t.rec.off && !(t.fade > 0));
    maxN = Math.max(maxN, act.length);
    for (const t of act) {
      const { x, z } = t.rec; samples++;
      maxOut = Math.max(maxOut, B.x0 - x, x - B.x1, B.z0 - z, z - B.z1);
      if (roadD(x, z) > 0.8) offRoad++;
      if (newT.has(`${Math.floor(x / 500)}_${Math.floor(z / 500)}`)) inNew++;
    }
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) { const a = act[i].rec, b = act[j].rec; if (Math.abs(a.x - b.x) < 12 && Math.abs(a.z - b.z) < 12) minGap = Math.min(minGap, obbGap(a, b)); }
  }
  const c = sim.counts();
  assert.ok(maxN >= 20, `활성 차량 ${maxN}`);
  assert.ok(maxOut <= 1.5, `박스 밖으로 ${maxOut.toFixed(2)}m`);
  assert.ok(offRoad / samples < 0.01, `차도 밖 ${offRoad}/${samples}`);
  assert.ok(inNew / samples > 0.5, `새 타일 위 비율 ${inNew}/${samples}`);
  assert.ok(minGap > -0.06, `겹침 ${minGap}`);
  assert.ok(Object.keys(c.byKind).length >= 4, '종류 여러 개');
  ok(`car sim 150s: max ${maxN} cars, box overshoot ${maxOut.toFixed(2)}m, off-road ${offRoad}/${samples}, in new tiles ${(100 * inNew / samples).toFixed(0)}%, min gap ${minGap.toFixed(2)}m, respawns ${c.respawns}`);
}

// 6) 렌더: BatchedMesh 하나(draw call ≤ 1), 지연 생성(박스 밖이면 아무것도 안 만듦)
{
  const g = new THREE.Group();
  const tr = createMigeumTraffic(g, { npc, mg, base: 30, hour: () => 14 });
  tr.update(0.1, { x: npc.meta.station.x, z: npc.meta.station.z });
  const s = tr.stats();
  assert.equal(g.children.length, 1); assert.ok(tr.mesh.isBatchedMesh);
  assert.ok(s.drawn > 0 && s.drawCalls === 1, JSON.stringify(s));
  tr.dispose(); assert.equal(g.children.length, 0);
  const loader = migeumNpcLoader({ mg, fetchJson: async () => npc });
  const root = new THREE.Group(), m = mountMigeumNpc(root, { mg, loader, params: new URLSearchParams(''), world: null });
  m.update(0.1, 0, 0); // 정자 근처
  assert.equal(root.children.length, 0); assert.equal(loader.data, null, '정자에서는 npc.json 요청 안 함');
  m.update(0.1, npc.meta.station.x, npc.meta.station.z); await loader.load(); m.update(0.1, npc.meta.station.x, npc.meta.station.z);
  assert.equal(root.children.length, 1); assert.ok(m.stats().total > 0);
  const off = mountMigeumNpc(new THREE.Group(), { mg, loader, params: new URLSearchParams('migeumcars=0'), world: null });
  off.update(0.1, npc.meta.station.x, npc.meta.station.z); assert.equal(off.traffic, null);
  ok('BatchedMesh 1 draw call, lazy mount near box only, ?migeumcars=0');
}

// 7) 보행 NPC: 출입구·보도·상가 앞에 배치, 같은 crowd, 박스에서 멀면 잠
{
  const D = npc.drive;
  const onCar = (x, z) => D.ways.some((w) => w.n.some((id, i) => i > 0 && segD(x, z, D.nodes[w.n[i - 1]], D.nodes[id]) < w.w / 2 + 0.3));
  const isFree = (x, z) => !onCar(x, z);
  const loader = migeumNpcLoader({ mg, fetchJson: async () => npc }); await loader.load();
  let added = 0, reg = 0;
  const crowd = { register: () => { reg++; return []; }, add: () => { added++; } };
  const peds = createMigeumPeds({ mg, loader, isFree, freeSpot: (x, z) => ({ x, z }), getHour: () => 8.5, count: 40 });
  peds.register(crowd); assert.equal(reg, 40);
  const st = npc.meta.station;
  for (let k = 0; k < 120; k++) peds.render(crowd, 0.1, st.x, st.z);
  assert.ok(peds.stats.placed >= 25, JSON.stringify(peds.stats)); assert.ok(added > 0);
  assert.ok((peds.stats.byKind.exit || 0) > 0 && (peds.stats.byKind.walk || 0) > 0, JSON.stringify(peds.stats.byKind));
  for (const a of peds.actors) if (a.path) { const p = a.mesh.position; assert.ok(isFree(p.x, p.z), '차도 위 보행자'); }
  const placed = peds.stats.placed, kinds = JSON.stringify(peds.stats.byKind);
  peds.render(crowd, 0.1, 0, 0); // 정자로
  assert.equal(peds.stats.asleep, true); assert.ok(peds.actors.every((a) => !a.mesh.visible));
  ok(`peds: ${placed} placed at 08:30 (${kinds}), off car lanes, asleep away from box`);
}
console.log(`migeum-npc: ${n} ok`);
