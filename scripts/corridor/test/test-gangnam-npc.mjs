// [gangnam-npc] 강남 보행·차량·횡단보도. 미금 배치 루프·정자 JzCars 를 그대로 쓰는지, 섬 밖으로 새지 않는지.
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { buildGangnamNpcData, busSegs, segDist, BUS_CLEAR_M, onDriveRoad } from '../../../src/gangnam/npc/rules.js';
import { gangnamNpcEnabled } from '../../../src/gangnam/npc/flags.js';
import { pedDensityAt, pedPeriod, pedCount, PED_MIX, GREETINGS, parseGangnamCars, MAX_PEDS, carViewTarget, inStreetView } from '../../../src/gangnam/npc/density.js';
import { GangnamCars, createGangnamTraffic } from '../../../src/gangnam/npc/cars.js';
import { mountGangnamNpc } from '../../../src/gangnam/npc/mount.js';
import { pedDensityAt as migeumPedDensityAt } from '../../../src/corridor/migeumNpcData.js';
import { migeumNpcEnabled, combineCrowds, createMigeumPeds } from '../../../src/corridor/migeumNpc.js';
import { parseJzCars, JzCars } from '../../../src/entities/jzTraffic.js';
import { obbGap } from '../../../src/entities/jzTraffic.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);

const index = J('public/corridor/gangnam/index.json');
const tiles = Object.keys(index.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
const built = buildGangnamNpcData(tiles, index);
const B = index.meta.box;
const buses = busSegs(tiles);
const st = index.stations[0];

{
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gn-npc-')), 'out.json');
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-gangnam-npc.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
  const a = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const b = J('public/corridor/gangnam/npc.json');
  delete a.meta.generated; delete b.meta.generated;
  assert.deepEqual(a, b, 'gangnam/npc.json 이 build-gangnam-npc.mjs 와 다름');
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  ok('npc.json matches builder');
}

{
  assert.equal(built.meta.yeoksamInside, false);
  assert.equal(built.meta.yeoksam.length, 0);
  assert.ok(built.meta.gangnamCrossing.length >= 1);
  assert.ok(built.crossings.length >= 4 && built.crossings.length <= 16, `횡단 ${built.crossings.length}`);
  const roads = new Set(built.crossings.map((c) => c.road));
  assert.ok(roads.has('강남대로') && roads.has('테헤란로'));
  for (const c of built.crossings) {
    assert.equal(c.name, '강남역사거리');
    assert.ok(c.x >= B.x0 && c.x <= B.x1 && c.z >= B.z0 && c.z <= B.z1);
    assert.ok(c.w >= 10);
    assert.ok(Math.hypot(c.x - st.x, c.z - st.z) < 280, c.id);
    assert.ok(Math.hypot(c.dir[0], c.dir[1]) > 0.9);
  }
  ok(`crossings ${built.crossings.length}, 역삼역사거리 박스 밖`);
}

{
  assert.ok(built.drive.nodes.length > 40 && built.drive.ways.length > 40);
  const names = new Set(built.drive.ways.map((w) => w.name));
  assert.deepEqual([...names].sort(), ['강남대로', '테헤란로']);
  let slotN = 0, slotBad = 0;
  for (const w of built.drive.ways) {
    assert.equal(w.ow, 1);
    assert.equal(w.k, 'primary');
    assert.ok(w.slot?.length >= 1 && w.slot.length <= 4);
    for (const i of w.n) {
      const [x, z] = built.drive.nodes[i];
      assert.ok(x >= B.x0 - 0.2 && x <= B.x1 + 0.2 && z >= B.z0 - 0.2 && z <= B.z1 + 0.2, `${x},${z}`);
    }
    if (w.name === '강남대로' && w.w >= 24) {
      const a = built.drive.nodes[w.n[0]], b = built.drive.nodes[w.n[1]];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      const lx = -dz / L, lz = dx / L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      for (const li of w.slot) {
        const off = w.w / 2 - (li + 0.5) * (w.w / w.lanes);
        const x = mx + lx * off, z = mz + lz * off;
        let clear = Infinity;
        for (const s of buses) clear = Math.min(clear, segDist(x, z, s.a, s.b) - s.w / 2);
        slotN++;
        if (buses.some((s) => segDist(mx, mz, s.a, s.b) < 30) && clear < BUS_CLEAR_M) slotBad++;
      }
    }
  }
  assert.equal(slotBad, 0, `버스 칸에 들어간 차로 ${slotBad}/${slotN}`);
  assert.equal(built.exits.length, 12);
  assert.deepEqual(built.exits.map((e) => e.ref), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  for (const [x, z] of built.walk) {
    assert.ok(x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1);
  }
  for (const e of built.exits) {
    const near = built.walk.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 18);
    assert.ok(near, `출입구 ${e.ref} 옆에 인도 점 없음`);
  }
  ok(`drive ${built.drive.nodes.length}/${built.drive.ways.length}, walk ${built.walk.length}, bus lanes clear ${slotN}`);
}

{
  assert.equal(gangnamNpcEnabled(''), true);
  assert.equal(gangnamNpcEnabled('?gangnamnpc=0'), false);
  assert.equal(gangnamNpcEnabled('?gangnam=0'), false);
  assert.equal(gangnamNpcEnabled('?gangnam=0&gangnamnpc=1'), false);
  assert.equal(pedPeriod(19), 'evening');
  assert.equal(pedPeriod(15), 'day');
  assert.equal(pedPeriod(23), 'night');
  assert.ok(pedCount(19) > pedCount(15) && pedCount(15) > pedCount(23) && pedCount(3) <= 6);
  assert.equal(pedCount(14), 20);
  assert.ok(pedCount(21) > pedCount(14) && pedCount(19) >= pedCount(21));
  assert.ok(carViewTarget(19) > carViewTarget(14) && carViewTarget(21) > carViewTarget(14));
  assert.ok(carViewTarget(14) >= 8 && carViewTarget(14) <= 12);
  assert.ok(carViewTarget(14, { mobile: true }) <= 12 && carViewTarget(19, { mobile: true }) <= 12);
  const eve = pedDensityAt(19), day = pedDensityAt(15), night = pedDensityAt(23), mob = pedDensityAt(19, { mobile: true });
  assert.ok(eve.count > day.count && day.count > night.count);
  assert.ok(mob.count < eve.count && mob.count <= 18);
  assert.ok(eve.count <= MAX_PEDS);
  for (const m of Object.values(PED_MIX)) {
    assert.ok(Math.abs(m.exit + m.walk - 1) < 1e-9);
    assert.deepEqual(Object.keys(m).sort(), ['exit', 'walk']);
  }
  const brand = /스타벅스|나이키|삼성|애플|현대|cgv|logo|nike|apple/i;
  for (const g of GREETINGS) {
    assert.ok(['ko', 'en', 'ja'].includes(g.lang));
    assert.ok(g.text.length > 0 && g.text.length < 40);
    assert.ok(!brand.test(g.text), g.text);
  }
  assert.equal(parseGangnamCars(new URLSearchParams('')).base, 26);
  assert.equal(parseGangnamCars(new URLSearchParams(''), { mobile: true }).base, 12);
  assert.equal(parseGangnamCars(new URLSearchParams('gangnamcars=0')).on, false);
  ok('flags, evening > day > night, mobile fewer, greetings text only');
}

{
  assert.equal(migeumPedDensityAt(19).count, 60);
  assert.equal(migeumNpcEnabled('?migeumnpc=0'), false);
  assert.equal(migeumNpcEnabled(''), true);
  assert.equal(parseJzCars(new URLSearchParams('')).base, 120);
  const pg = { stats: { active: 1 }, register() {}, render() {} };
  assert.equal(combineCrowds([pg, null]), pg);
  assert.equal(combineCrowds([null, null]), null);
  const srcJz = fs.readFileSync(path.join(ROOT, 'src/entities/jzTraffic.js'), 'utf8');
  const srcMg = fs.readFileSync(path.join(ROOT, 'src/corridor/migeumNpc.js'), 'utf8');
  assert.ok(!srcJz.includes('gangnam'));
  assert.ok(!srcMg.includes("gangnam/npc"));
  assert.equal(JzCars.prototype._laneOffset === GangnamCars.prototype._laneOffset, false);
  const drive = J('public/corridor/drive.json');
  let inside = 0;
  for (const p of drive.nodes) if (p[0] >= B.x0 && p[0] <= B.x1 && p[1] >= B.z0 && p[1] <= B.z1) inside++;
  assert.equal(inside, 0, '정자·코리더 drive 노드가 강남 박스 안');
  const mgBox = J('public/corridor/migeum/index.json').meta.box;
  const overlap = !(B.x1 < mgBox.x0 || mgBox.x1 < B.x0 || B.z1 < mgBox.z0 || mgBox.z1 < B.z0);
  assert.equal(overlap, false);
  const live = J('public/corridor/index.json').meta.liveBox;
  const liveHit = !(B.x1 < live.x0 || live.x1 < B.x0 || B.z1 < live.z0 || live.z1 < B.z0);
  assert.equal(liveHit, false);
  ok('정자·미금 밀도·플래그·그래프는 강남과 분리');
}

{
  const onCar = (x, z) => built.drive.ways.some((w) => w.n.some((id, i) => i > 0 && segDist(x, z, built.drive.nodes[w.n[i - 1]], built.drive.nodes[id]) < w.w / 2 + 0.35));
  const npc = { ...built, meta: { ...built.meta, box: B, station: { x: st.x, z: st.z } }, stops: [] };
  const group = new THREE.Group();
  let clock = 0;
  const { buildCorridorCrossings } = await import('../../../src/corridor/crossings.js');
  const cross = buildCorridorCrossings(group, npc.crossings, { getSimTime: () => clock });
  for (const ch of cross.group.children) ch.castShadow = false;
  const findPhase = (road, phase) => {
    const c = cross.crossings.find((q) => q.road === road);
    for (let t = 0; t < 60; t += 0.25) { clock = t; if (cross.pedLight(c) === phase) return { t, c }; }
    return null;
  };
  const green = findPhase('강남대로', 'green');
  const red = findPhase('강남대로', 'red');
  assert.ok(green && red && green.t !== red.t);
  const tr = createGangnamTraffic(group, {
    drive: npc.drive, box: B, station: { x: st.x, z: st.z }, base: 24, hour: () => 19,
    transit: { crossings: cross.crossings, pedLight: cross.pedLight, source: { vehicles: () => [] } },
    world: null,
  });
  const focus = { x: green.c.x, z: green.c.z };
  let maxOut = 0, samples = 0, busHits = 0, minGap = Infinity, stopped = 0, moving = 0;
  const step = (sec, phaseClock) => {
    const dt = 0.05;
    for (let k = 0; k < sec / dt; k++) {
      clock = phaseClock;
      tr.update(dt, focus);
      if (k % 10) continue;
      const act = tr.sim.list.filter((t) => t && !t.parked && t.rec && !t.rec.off);
      for (const t of act) {
        const { x, z } = t.rec; samples++;
        maxOut = Math.max(maxOut, B.x0 - x, x - B.x1, B.z0 - z, z - B.z1);
        let clear = Infinity;
        for (const s of buses) clear = Math.min(clear, segDist(x, z, s.a, s.b) - s.w / 2);
        if (clear < 1.2) busHits++;
        if (Math.hypot(x - focus.x, z - focus.z) < 22 && t.v < 0.4 && t.why === 'sig') stopped++;
        if (Math.hypot(x - focus.x, z - focus.z) < 18 && t.v > 4) moving++;
      }
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const a = act[i].rec, b = act[j].rec;
        if (Math.abs(a.x - b.x) < 14 && Math.abs(a.z - b.z) < 14) minGap = Math.min(minGap, obbGap(a, b));
      }
    }
  };
  step(12, green.t);
  const stoppedGreen = stopped;
  stopped = 0; moving = 0;
  step(12, red.t);
  assert.ok(stoppedGreen >= 5, `초록(차 정지) 표본 ${stoppedGreen}`);
  assert.ok(moving >= 3, `빨강(차 진행) 표본 ${moving}`);
  assert.ok(maxOut < 8, `박스 밖 ${maxOut.toFixed(2)}m`);
  assert.ok(busHits / Math.max(1, samples) < 0.02, `버스 차로 ${busHits}/${samples}`);
  assert.ok(minGap > -0.15, `겹침 ${minGap}`);
  assert.equal(tr.stats().drawCalls, 1);
  assert.deepEqual(tr.obstacles(0, 0, 5000), []);
  assert.ok(tr.obstacles(focus.x, focus.z, 30).length >= 0);
  tr.dispose();
  ok(`cars: green-stop ${stoppedGreen}, red-move ${moving}, box ${maxOut.toFixed(1)}m, bus ${busHits}/${samples}, gap ${minGap.toFixed(2)}, jeongja obstacles 0`);
}

{
  const npc = built;
  const onCar = (x, z) => npc.drive.ways.some((w) => {
    for (let i = 1; i < w.n.length; i++) if (segDist(x, z, npc.drive.nodes[w.n[i - 1]], npc.drive.nodes[w.n[i]]) < w.w / 2 + 0.2) return true;
    return false;
  });
  let fetches = 0;
  const api = mountGangnamNpc({
    scene: new THREE.Group(), params: new URLSearchParams(''), gangnam: index, mobile: false,
    fetchJson: () => { fetches++; return Promise.resolve(npc); },
    isFree: (x, z) => !onCar(x, z), freeSpot: (x, z) => ({ x, z }), tileReady: () => true, getHour: () => 19,
  });
  assert.ok(api);
  api.update(0.1, 0, 0);
  assert.equal(fetches, 0, '정자에서는 npc.json 을 받지 않음');
  assert.deepEqual(api.obstacles(9, 9, 80), []);
  api.update(0.1, st.x, st.z);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const crowd = { register: () => [], add() {} };
  for (let k = 0; k < 80; k++) api.update(0.1, st.x, st.z);
  const s = api.stats();
  const placed0 = s.peds.placed, draws0 = s.draws;
  assert.equal(fetches, 1);
  assert.ok(s.ready);
  assert.ok(placed0 >= 12, JSON.stringify(s.peds));
  assert.ok(draws0 <= 20, `draws ${draws0}`);
  assert.ok(s.cars.drawn > 0);
  const crossAt = built.crossings[0];
  for (let k = 0; k < 40; k++) api.update(0.1, crossAt.x, crossAt.z, 0.4);
  const crossers = api.peds.actors.filter((a) => a.cross && a.path);
  assert.ok(crossers.length >= 1, '횡단 경로 없음');
  const a = crossers.find((p) => {
    const mid = p.path[Math.floor(p.path.length / 2)];
    return api.crossings.some((c) => Math.hypot(c.x - mid[0], c.z - mid[1]) < 8);
  }) || crossers[0];
  const mid = a.path[Math.floor(a.path.length / 2)];
  const mine = api.crossings.slice().sort((p, q) => Math.hypot(p.x - mid[0], p.z - mid[1]) - Math.hypot(q.x - mid[0], q.z - mid[1]))[0];
  assert.ok(mine, '횡단 경로 옆 신호 없음');
  api.seek(mine, 'red');
  a.dir = 1; a.s = 0; a.idle = 0;
  const s0 = a.s;
  for (let k = 0; k < 15; k++) api.update(0.05, mid[0], mid[1]);
  const held = a.s < 0.45;
  api.seek(mine, 'green');
  a.dir = 1; a.s = 0; a.idle = 0;
  for (let k = 0; k < 25; k++) api.update(0.1, mid[0], mid[1]);
  assert.ok(held, `빨간불에 움직임 ${s0} → ${a.s} (${mine.road} ${api.pedLight(mine)})`);
  assert.ok(a.s > 1.2, `초록불에 안 건넘 s=${a.s}`);
  const line = api.shoutNearest(a.mesh.position.x, a.mesh.position.z);
  const tourist = api.peds.actors.find((p) => p.tourist && p.path) || a;
  const shouted = api.shoutNearest(tourist.mesh.position.x, tourist.mesh.position.z);
  assert.ok(shouted?.text && !/스타벅스|logo/i.test(shouted.text));
  api.update(0.1, 0, 0);
  assert.equal(api.peds.stats.asleep, true);
  assert.equal(mountGangnamNpc({ scene: new THREE.Group(), params: new URLSearchParams('gangnamnpc=0'), gangnam: index }), null);
  assert.equal(mountGangnamNpc({ scene: new THREE.Group(), params: new URLSearchParams('gangnam=0'), gangnam: index }), null);
  const mob = mountGangnamNpc({
    scene: new THREE.Group(), params: new URLSearchParams(''), gangnam: index, mobile: true,
    fetchJson: async () => npc, isFree: () => true, tileReady: () => true, getHour: () => 19,
  });
  mob.update(0.1, st.x, st.z);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  for (let k = 0; k < 30; k++) mob.update(0.1, st.x, st.z);
  assert.ok(mob.stats().peds.target <= 18, JSON.stringify(mob.stats().peds));
  assert.ok(mob.stats().cars.total <= 20);
  void crowd; void line;
  ok(`peds placed ${placed0}, draws ${draws0}, crossers ${crossers.length}, asleep away, mobile cap`);
}

{
  const CAM = { x: -7299.3, z: -14894.8, yaw: 0.38 };
  const npc = built;
  const onCar = (x, z) => npc.drive.ways.some((w) => {
    for (let i = 1; i < w.n.length; i++) if (segDist(x, z, npc.drive.nodes[w.n[i - 1]], npc.drive.nodes[w.n[i]]) < w.w / 2 + 0.2) return true;
    return false;
  });
  let hour = 14;
  const view = mountGangnamNpc({
    scene: new THREE.Group(), params: new URLSearchParams(''), gangnam: index, mobile: false,
    fetchJson: async () => npc, isFree: (x, z) => !onCar(x, z), freeSpot: (x, z) => ({ x, z }), tileReady: () => true,
    getHour: () => hour,
  });
  const camOf = (yaw) => {
    const dist = 36, pitch = 0.58, aim = 4;
    const bx = Math.sin(yaw), bz = Math.cos(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cam = new THREE.PerspectiveCamera(55, 1280 / 800, 0.3, 5000);
    cam.position.set(CAM.x + bx * dist * cp, 1.6 + dist * sp, CAM.z + bz * dist * cp);
    cam.lookAt(CAM.x - bx * aim * cp, 1.6 - aim * sp, CAM.z - bz * aim * cp);
    cam.updateMatrixWorld();
    return cam;
  };
  const recognizable = (yaw, pxMin = 46) => {
    const cam = camOf(yaw);
    return view.peds.actors.filter((a) => {
      if (!a.path) return false;
      const p = a.mesh.position;
      const q = new THREE.Vector3(p.x, 1.1, p.z).project(cam);
      const d = Math.hypot(p.x - cam.position.x, 1.1 - cam.position.y, p.z - cam.position.z);
      return q.z < 1 && Math.abs(q.x) < 0.88 && q.y > -0.85 && q.y < 0.75 && d < 60 && 2166 / d >= pxMin;
    }).length;
  };
  const countView = () => {
    const peds = recognizable(CAM.yaw);
    const cars = view.traffic.sim.list.filter((t) => t && !t.parked && t.rec && !t.rec.off && inStreetView(t.rec.x, t.rec.z, CAM.x, CAM.z, CAM.yaw)).length;
    return { peds, cars };
  };
  view.update(0.1, CAM.x, CAM.z, CAM.yaw);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  for (let k = 0; k < 50; k++) view.update(0.1, CAM.x, CAM.z, CAM.yaw);
  const day = countView();
  assert.ok(day.peds >= 15 && day.peds <= 25, `낮 보행 ${day.peds}`);
  assert.ok(day.cars >= 8 && day.cars <= 12, `낮 차량 ${day.cars}`);
  hour = 21;
  view.traffic.sim.retarget(false);
  for (let k = 0; k < 40; k++) view.update(0.1, CAM.x, CAM.z, CAM.yaw);
  const eve = countView();
  assert.ok(eve.peds >= day.peds + 4, `21시 보행 ${eve.peds} vs 낮 ${day.peds}`);
  assert.ok(eve.cars > day.cars, `21시 차량 ${eve.cars} vs 낮 ${day.cars}`);
  let gap = Infinity, out = 0, bus = 0;
  const buses = busSegs(tiles);
  for (const t of view.traffic.sim.list) if (t && !t.parked && t.rec && !t.rec.off) {
    const { x, z } = t.rec;
    out = Math.max(out, B.x0 - x, x - B.x1, B.z0 - z, z - B.z1);
    let clear = Infinity;
    for (const s of buses) clear = Math.min(clear, segDist(x, z, s.a, s.b) - s.w / 2);
    if (clear < 1.2) bus++;
  }
  const act = view.traffic.sim.list.filter((t) => t && !t.parked && t.rec && !t.rec.off);
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    if (Math.abs(act[i].rec.x - act[j].rec.x) < 14 && Math.abs(act[i].rec.z - act[j].rec.z) < 14) gap = Math.min(gap, obbGap(act[i].rec, act[j].rec));
  }
  assert.ok(out < 3, `박스 밖 ${out}`);
  assert.equal(bus, 0, `버스 차로 ${bus}`);
  assert.ok(gap > -0.15, `겹침 ${gap}`);
  ok(`화면 밀도 낮 보행 ${day.peds}·차 ${day.cars} / 21시 보행 ${eve.peds}·차 ${eve.cars}`);

  const onRoadPed = (x, z) => onDriveRoad(npc.drive, x, z, 0.25) && !view.peds.onZebra(x, z);
  for (const yaw of [0.2, 1.1, 2.4, 3.6, CAM.yaw]) {
    for (let k = 0; k < 25; k++) view.update(0.1, CAM.x, CAM.z, yaw);
    for (const a of view.peds.actors) if (a.path) {
      const p = a.mesh.position;
      assert.ok(!onRoadPed(p.x, p.z), `yaw ${yaw} 차도 위 보행 ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
  }
  const innerIds = () => view.peds.actors.filter((a) => a.path && Math.hypot(a.mesh.position.x - CAM.x, a.mesh.position.z - CAM.z) < 18).map((a) => a.i).sort();
  const carIds = () => view.traffic.sim.list.filter((t) => t && !t.parked && t.rec && Math.hypot(t.rec.x - CAM.x, t.rec.z - CAM.z) < 22).map((t) => t.i).sort();
  for (let k = 0; k < 15; k++) view.update(0.1, CAM.x, CAM.z, CAM.yaw);
  const p0 = innerIds(), c0 = carIds();
  view.update(0.1, CAM.x, CAM.z, CAM.yaw + Math.PI / 2);
  const p1 = innerIds(), c1 = carIds();
  const diff = (a, b) => a.filter((id) => !b.includes(id)).length + b.filter((id) => !a.includes(id)).length;
  assert.ok(diff(p0, p1) <= 2, `한 프레임 보행 출입 ${diff(p0, p1)}`);
  assert.ok(diff(c0, c1) <= 2, `한 프레임 차량 출입 ${diff(c0, c1)}`);
  ok(`인도 유지 · yaw ${p0.length}명 가운데 한 프레임 변화 ${diff(p0, p1)}`);
}

{
  const loader = { box: { x0: -1, x1: 1, z0: -1, z1: 1 }, data: { walk: [[0, 0]], stops: [] }, near: () => true, load: () => Promise.resolve(null) };
  const peds = createMigeumPeds({ mg: { stations: [] }, loader, isFree: () => true, getHour: () => 12, count: 4, force: 0 });
  assert.equal(peds.actors.length, 4);
  assert.equal(typeof peds.render, 'function');
  ok('미금 createMigeumPeds 기본 인자 그대로');
}

console.log(`\n${n} gangnam npc checks passed`);
