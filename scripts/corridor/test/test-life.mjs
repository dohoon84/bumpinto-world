// [life] 코리더 생활 레이어(보행 NPC·일반 차량·Steel Truck) 테스트: node scripts/corridor/test/test-life.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCorridorTraffic, pickTruckPaint } from '../../../src/corridor/traffic.js';
import { extractLifeHints, gatherLifeHints } from '../../../src/corridor/lifeHints.js';
import { Group } from 'three';

const D = new URL('../../../public/corridor/', import.meta.url);
const J = (f) => JSON.parse(fs.readFileSync(new URL(f, D)));
const index = J('index.json'), base = J('base.json'), drive = J('drive.json'), live = index.meta.liveBox;
const st = index.stations.find((s) => s.id === 'sunae');

// 수내 주변 타일: 힌트 + 판정용 도로·건물
const tiles = [], segs = [], rings = [];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
  const k = `${Math.floor(st.x / 500) + i}_${Math.floor(st.z / 500) + j}`, f = new URL('tiles/' + k + '.json', D);
  if (!fs.existsSync(f)) continue;
  const t = JSON.parse(fs.readFileSync(f)); tiles.push({ detail: { hints: extractLifeHints(t, live) } });
  for (const r of t.r) if (/^(primary|secondary|tertiary|trunk|residential|unclassified|service|motorway)/.test(r.k)) for (let n = 1; n < r.p.length; n++) segs.push([...r.p[n - 1], ...r.p[n], r.w / 2 + 0.6]);
  for (const b of t.b) rings.push(b.o);
}
const sd = (x, z, [ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * k, z - az - dz * k); };
const onRoad = (x, z) => segs.some((s) => Math.abs(s[0] - x) < 60 && Math.abs(s[1] - z) < 60 && sd(x, z, s) < s[4]) || segs.some((s) => Math.abs(s[2] - x) < 60 && Math.abs(s[3] - z) < 60 && sd(x, z, s) < s[4]);
const inRing = (x, z, o) => { let c = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) { const [xi, zi] = o[i], [xj, zj] = o[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const isBlocked = (x, z) => rings.some((o) => Math.abs(o[0][0] - x) < 150 && Math.abs(o[0][1] - z) < 150 && inRing(x, z, o));
const world = { onRoad, isBlocked, groundY: null };
const crossings = { crossings: base.crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= 10, cl: '0', g: 0 })), pedLight: () => 'red' };

function make(q = '') {
  return createCorridorTraffic(new Group(), { drive, crossings, terrain: null, terrainT: null, world, stations: index.stations, liveBox: live, getBuses: () => [], params: new URLSearchParams(q), overlay: null, hints: (x, z, r) => gatherLifeHints(tiles, x, z, r) });
}
const run = (T, sec = 8, x = st.x, z = st.z) => { for (let k = 0; k < sec * 10; k++) T.update(0.1, x, z); return T.stats(); };

// 1) 힌트: 정자 상자 안은 비어 있고 수내 근처엔 상가·아파트·주차 통로가 있다
const h = gatherLifeHints(tiles, st.x, st.z, 330);
assert.ok(h.spots.some((s) => s[2] === 'shop') && h.spots.some((s) => s[2] === 'apt'), 'shop/apt spots near 수내');
assert.ok(h.svc.length > 10, 'service roads (parking aisles) near 수내');
const jz = extractLifeHints({ b: [{ o: [[0, 0], [10, 0], [10, 10]], k: 'apartments' }], r: [{ p: [[0, 0], [20, 0]], w: 4, k: 'service' }] }, live);
assert.equal(jz.spots.length + jz.svc.length, 0, '정자 상자 안은 힌트 없음');

// 2) 기본값: 일반 차량 72(택시 22) + 주행 트럭 6, 주차 트럭 6, 보행 48
const T = make();
const s = run(T);
assert.equal(s.taxis, 22, 'taxi count kept at 22');
assert.equal(s.cars, 78, '72 cars + 6 driving trucks');
assert.equal(s.trucks, 6);
assert.equal(s.trucksParked, 6, JSON.stringify(s));
assert.ok(s.walkers >= 40, 'walkers placed ' + s.walkers);
assert.ok(T.cars.list.every((t) => !(t.truck && t.taxi)), 'trucks are never taxis (not hailable)');
assert.ok(T.cars.list.filter((t) => t.truck).every((t) => /^truck-[sp]$/.test(t.liv)));
assert.ok(s.carParts <= 18 + 16, 'instanced parts bounded: ' + s.carParts);
assert.ok(s.crowdParts < 40, 'crowd parts bounded: ' + s.crowdParts);
// 주차 트럭: 차도·건물과 겹치지 않음, 정자 밖
for (const p of T.parked) {
  assert.ok(!isBlocked(p.x, p.z), 'parked truck not inside a building');
  assert.ok(!(p.x >= live.x0 && p.x <= live.x1 && p.z >= live.z0 && p.z <= live.z1), 'not in 정자');
  assert.ok(Math.hypot(p.x - st.x, p.z - st.z) < 280);
}
// 보행 NPC: 정자 밖, 건물 안 아님, 장소 종류가 섞여 있음
for (const w of T.walkers) if (w.path) for (const [x, z] of w.path) { assert.ok(!(x >= live.x0 && x <= live.x1 && z >= live.z0 && z <= live.z1)); assert.ok(!isBlocked(x, z), 'walker path inside a building'); }
const kinds = Object.keys(s.walkerKinds).join(',');
assert.match(kinds, /station/); assert.match(kinds, /shop|apt/);
// 신호 횡단보도: 빨간불이면 횡단 구간에 들어가지 않는다
const X = T.walkers.filter((w) => w.cross && w.cross.c.sig);
for (const w of X) assert.ok(w.s <= w.cross.sIn + 1e-6 || w.s >= w.cross.sOut - 1e-6, 'waits at red');

// 3) URL 플래그
let t2 = make('ctrucks=0'); let s2 = run(t2, 3);
assert.equal(s2.trucks + s2.trucksParked, 0); assert.equal(s2.carParts, 18, 'no truck parts when ?ctrucks=0');
t2 = make('ctrucks=5'); s2 = run(t2, 3); assert.equal(s2.trucks, 3); assert.ok(s2.trucksParked <= 2);
t2 = make('ccars=48&ctaxi=0.46&cwalkers=10'); s2 = run(t2, 3); assert.equal(s2.taxis, 22); assert.equal(s2.cars, 48 + 6); assert.ok(s2.walkers <= 10);
t2 = make('cwalkers=0&ctrucks=0'); s2 = run(t2, 2); assert.equal(s2.walkers, 0); assert.equal(s2.crowdParts, 0);

// 4) 도색 고르기: 절반 스테인리스, 로고 없음(색만)
const n = { s: 0, p: 0 }; for (let i = 0; i < 1000; i++) n[pickTruckPaint((i + 0.5) / 1000).key === 'truck-s' ? 's' : 'p']++;
assert.ok(Math.abs(n.s - 500) < 10);

console.log('test-life: ok', JSON.stringify({ sunae: s }));
