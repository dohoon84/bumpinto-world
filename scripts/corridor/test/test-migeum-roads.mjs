// [migeum-roads] 미금 차도 그래프 하나(roads.json)의 주인 규칙 테스트: node scripts/corridor/test/test-migeum-roads.mjs
//   데이터 재현 · OSM 조각마다 주인 하나 · 미금 연장 7 way(=#24) · 코리더 그래프 이음 · 미금 NPC 그래프(포털) · 두 시스템 차로 안 겹침 · 플래그 · life 연결
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Group } from 'three';
import { MIGEUM_ROADS_FILE, migeumCorridorRoadsOn, migeumRoadOwner, migeumCorridorExt, mergeMigeumDrive, withMigeumCorridorRoads, migeumLocalGraph } from '../../../src/corridor/migeumRoads.js';
import { createCorridorLife } from '../../../src/corridor/life.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const R = J('public/corridor/' + MIGEUM_ROADS_FILE), drive = J('public/corridor/drive.json'), raw = J('data/osm_migeum_raw.json'), mg = J('public/corridor/migeum/index.json');
const B = mg.meta.box, ST = R.meta.station;
let n = 0; const ok = (s) => { n++; console.log('ok', n, s); };
const key = (p) => p[0] + ',' + p[1];
const segD = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz); };

// 1) 커밋된 roads.json = 빌드 결과
execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-migeum-roads.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
ok(`committed migeum/roads.json matches build (${R.nodes.length} nodes, ${R.ways.length} pieces, c ${R.meta.stats.c} · x ${R.meta.stats.x} · m ${R.meta.stats.m})`);

// 2) 조각마다 주인 하나, OSM 실재 way 만, 같은 구간이 두 조각에 없음
{
  const ids = new Set(drive.ways.map((w) => w.id)), osm = new Map(raw.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
  const seen = new Set();
  for (const w of R.ways) {
    assert.ok(['c', 'x', 'm'].includes(w.own), `own ${w.own}`);
    assert.ok(osm.has(w.id), `OSM 에 없는 way ${w.id}`);
    assert.equal(ids.has(w.id), w.own === 'c', `way ${w.id}: drive.json 에 있으면 c, 없으면 x/m`);
    if (w.own === 'x') assert.ok(['primary', 'secondary'].includes(w.k));
    assert.ok(!/motorway/.test(w.k) || w.own === 'c', '고속도로는 코리더 몫일 때만');
    for (let i = 1; i < w.n.length; i++) { const s = [key(R.nodes[w.n[i - 1]]), key(R.nodes[w.n[i]])].sort().join('|'); assert.ok(!seen.has(s), `같은 구간이 두 조각에: ${w.id}`); seen.add(s); }
  }
  for (const i of R.edge) { const [x, z] = R.nodes[i]; assert.ok(Math.min(Math.abs(x - B.x0), Math.abs(x - B.x1), Math.abs(z - B.z0), Math.abs(z - B.z1)) < 0.06, `edge 노드 ${i} 가 경계 위가 아님`); }
  ok(`one owner per piece, ${seen.size} unique segments, all OSM ways, ${R.edge.length} box-edge nodes`);
}

// 3) 미금 연장 = #24 의 7 way · 18 노드(3개는 drive.json 성남대로 끝과 공유) · 역 320m 규칙
const ext = migeumCorridorExt(R), merged = withMigeumCorridorRoads(drive, R);
{
  assert.equal(ext.ways.length, 7); assert.equal(ext.nodes.length, 18);
  assert.deepEqual([...new Set(ext.ways.map((w) => w.name))].sort(), ['돌마로', '성남대로']);
  assert.deepEqual(ext.ways.map((w) => w.id).sort(), [277606822, 441623994, 564521936, 942754565, 942754566, 942754568, 942754570]);
  for (const w of ext.ways) assert.ok(w.n.some((i) => Math.hypot(ext.nodes[i][0] - ST.x, ext.nodes[i][1] - ST.z) <= 320));
  const dk = new Set(drive.nodes.map((p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10)));
  const joined = ext.nodes.filter((p) => dk.has(Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10))).length;
  assert.equal(joined, 3);
  assert.equal(merged.ways.length, drive.ways.length + 7); assert.equal(merged.nodes.length, drive.nodes.length + 15);
  assert.equal(merged.ways.filter((w) => w.mg).length, 7);
  assert.equal(drive.ways.length, 3467, '원본 drive.json 은 그대로');
  assert.equal(mergeMigeumDrive(merged, ext), merged, '두 번 덧붙여도 같음');
  assert.equal(withMigeumCorridorRoads(drive, null), drive);
  ok(`corridor extension: 7 ways / 18 nodes (3 joined) → drive ${drive.ways.length}→${merged.ways.length} ways`);
}

// 4) 미금 NPC 그래프: 미금 몫만 · 코리더 몫과 닿는 노드는 모두 포털 · 경계 노드도 포털
const G = { on: migeumLocalGraph(R, { ext: true }), off: migeumLocalGraph(R, { ext: false }) };
for (const [mode, g] of Object.entries(G)) {
  const ext = mode === 'on', P = new Set(g.portals.map((i) => key(g.nodes[i])));
  const corrNodes = new Set(R.ways.filter((w) => migeumRoadOwner(w, { ext }) === 'corridor').flatMap((w) => w.n.map((i) => key(R.nodes[i]))));
  const corrIds = new Set(R.ways.filter((w) => migeumRoadOwner(w, { ext }) === 'corridor').map((w) => w.id));
  for (const w of g.ways) { assert.ok(!drive.ways.some((d) => d.id === w.id)); assert.ok(R.ways.some((r) => r.id === w.id && (r.own === 'm' || (!ext && r.own === 'x'))), `미금 그래프에 미금 몫 아닌 길 ${w.id}`); }
  for (const p of g.nodes) if (corrNodes.has(key(p))) assert.ok(P.has(key(p)), `코리더 몫 길과 닿는 노드 ${key(p)} 가 포털 아님`);
  for (const w of g.ways) for (let i = 1; i < w.n.length; i++) { // 미금 그래프 구간이 코리더 몫 조각 구간과 같지 않음
    const s = [key(g.nodes[w.n[i - 1]]), key(g.nodes[w.n[i]])].sort().join('|');
    for (const r of R.ways) if (corrIds.has(r.id) && migeumRoadOwner(r, { ext }) === 'corridor') for (let j = 1; j < r.n.length; j++) assert.notEqual([key(R.nodes[r.n[j - 1]]), key(R.nodes[r.n[j]])].sort().join('|'), s);
  }
}
assert.deepEqual([G.off.nodes.length, G.off.ways.length, G.off.portals.length], [271, 47, 26], '?migeumtaxi=0: #26 원래 그래프와 같은 크기');
assert.deepEqual([G.on.nodes.length, G.on.ways.length, G.on.portals.length], [261, 44, 31]);
ok(`migeum NPC graph: ext on ${G.on.nodes.length}/${G.on.ways.length}/${G.on.portals.length} portals · ext off ${G.off.nodes.length}/${G.off.ways.length}/${G.off.portals.length}`);

// 5) 두 시스템 차로가 겹치지 않음: 미금 몫 구간(2m 표본)이 코리더 몫 차도 띠((폭1+폭2)/2) 안에 들어가지 않음
//    포털 근처(띠+2m)는 교차점이라 제외. 고가(br=1, 분당수서로 금곡고가차도)와 그 아래 길은 높이가 달라 제외
for (const [mode, g] of Object.entries(G)) {
  const ext = mode === 'on', P = g.portals.map((i) => g.nodes[i]);
  const C = []; for (const w of R.ways) if (migeumRoadOwner(w, { ext }) === 'corridor') for (let i = 1; i < w.n.length; i++) C.push({ a: R.nodes[w.n[i - 1]], b: R.nodes[w.n[i]], w });
  let samples = 0, hit = 0, levels = 0;
  for (const w of g.ways) for (let i = 1; i < w.n.length; i++) {
    const a = g.nodes[w.n[i - 1]], b = g.nodes[w.n[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s <= L; s += 2) {
      const x = a[0] + ((b[0] - a[0]) * s) / L, z = a[1] + ((b[1] - a[1]) * s) / L; samples++;
      const dp = Math.min(...P.map((p) => Math.hypot(p[0] - x, p[1] - z)));
      for (const c of C) { const need = (w.w + c.w.w) / 2; if (segD(x, z, c.a, c.b) < need && dp > need + 2) { if (!!w.br !== !!c.w.br) levels++; else hit++; } }
    }
  }
  assert.equal(hit, 0, `ext ${mode}: 같은 높이 겹침 ${hit}`);
  ok(`no shared lane (ext ${mode}): ${samples} samples, 0 same-level overlaps (${levels} under the 금곡 overpass, different level)`);
}

// 6) 플래그
assert.equal(migeumCorridorRoadsOn(''), true); assert.equal(migeumCorridorRoadsOn('?migeumtaxi=0'), false); assert.equal(migeumCorridorRoadsOn('?migeum=0'), false);
assert.equal(migeumCorridorRoadsOn(new URLSearchParams('migeumnpc=0')), true); assert.equal(migeumCorridorRoadsOn(new URLSearchParams('migeum=0&migeumtaxi=1')), false);
assert.equal(migeumRoadOwner({ own: 'x' }, { ext: true }), 'corridor'); assert.equal(migeumRoadOwner({ own: 'x' }, { ext: false }), 'migeum');
assert.equal(migeumRoadOwner({ own: 'c' }, { ext: false }), 'corridor'); assert.equal(migeumRoadOwner({ own: 'm' }), 'migeum');
ok('flags: migeumtaxi=0 / migeum=0 → extension belongs to 미금 NPC (or nobody), migeumnpc=0 does not change ownership');

// 7) life.js 연결: 켜면 코리더 차량 그래프 +7 way, ?migeumtaxi=0·?migeum=0 이면 roads.json 요청 없음 · 그래프 그대로
{
  const index = J('public/corridor/index.json'), base = J('public/corridor/base.json');
  const crossings = { crossings: base.crossings.map((c, i) => ({ ...c, id: 'cc' + i, sig: c.w >= 10, cl: '0', g: 0 })), pedLight: () => 'red' };
  const world = { onRoad: () => true, isBlocked: () => false, groundY: null };
  const realFetch = globalThis.fetch; const asked = [];
  globalThis.fetch = async (u) => { u = String(u); asked.push(u); const f = path.join(ROOT, 'public/corridor', u.replace(/^\/corridor\//, '')); return fs.existsSync(f) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) } : { ok: false, json: async () => null }; };
  const run = async (q) => {
    asked.length = 0;
    const life = createCorridorLife({ root: new Group(), baseUrl: '/corridor/', crossings, terrain: null, terrainT: null, world, overlay: null, stations: index.stations, liveBox: index.meta.liveBox, params: new URLSearchParams('cbus=0&cwalkers=0&ctrucks=0&' + q), proxy: null, mode: 'sim' });
    await life.loading;
    return { ways: life.traffic?.cars?.ways?.length, mg: life.traffic?.cars?.ways?.filter((w) => w.mg).length, roads: asked.some((u) => u.endsWith(MIGEUM_ROADS_FILE)) };
  };
  try {
    const on = await run(''), off = await run('migeumtaxi=0'), nomg = await run('migeum=0'), npcOff = await run('migeumnpc=0');
    assert.deepEqual(on, { ways: 3474, mg: 7, roads: true }); assert.deepEqual(npcOff, on);
    assert.deepEqual(off, { ways: 3467, mg: 0, roads: false }); assert.deepEqual(nomg, off);
    ok(`life: corridor car graph on ${on.ways} (+${on.mg}) · migeumtaxi=0 ${off.ways} · migeum=0 ${nomg.ways} (no roads.json request)`);
  } finally { globalThis.fetch = realFetch; }
}
console.log('test-migeum-roads: all', n, 'ok');
