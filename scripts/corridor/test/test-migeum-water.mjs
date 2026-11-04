// [migeum-water] 미금 탄천 띠 길·돌마교·수면 테스트: node scripts/corridor/test/test-migeum-water.mjs
//   1) water.json = build-migeum-water.mjs 결과  2) 플래그(?migeumwater=0 / ?migeum=0 → 요청 없음, 합치기 원본 불변)
//   3) 이음: 차도 조각 양끝 = 타일 도로 OSM 노드(또는 다른 띠 조각)  4) 돌마교 상판 0m · 하도 위 상판 · 건너는 동안 높이 끊김 없음
//   5) 둔치 길 = 둔치 높이(라이브 단면), 둑 길 = 0m  6) 수면 = 라이브 축 하도 안(둔치 아래) · 높이 = 라이브 수면 −6.6 (낙차 0)
//   7) 정자 라이브 bbox · 미금 띠 밖 높이 불변  8) 메시 +0 (리본·수면 같은 메시에 합침)
//   9) 둑 위치(bank): 띠 안 차도 = 둑 위 0m · 기본 단면보다 좁히기만 · 축이 다르면/꺼짐이면 그대로
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { migeumWaterEnabled, migeumChRoads, mergeMigeumWater, MIGEUM_WATER_FILE, applyMigeumBank } from '../../../src/corridor/migeumWater.js';
import { MIGEUM_DIR } from '../../../src/corridor/migeum.js';
import { mergeTancheon, channelWaterMesh } from '../../../src/corridor/tancheon.js';
import { createTerrain } from '../../../src/world/terrain.js';
import { roadMesh } from '../../../src/corridor/tileMesh.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const C = path.join(ROOT, 'public/corridor'), MD = path.join(C, 'migeum');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const W = J(path.join(MD, 'water.json')), base = J(path.join(C, 'base.json')), tan = J(path.join(C, 'tancheon.json'));
const cIndex = J(path.join(C, 'index.json')), mIndex = J(path.join(MD, 'index.json')), LB = cIndex.meta.liveBox;
const T0 = J(path.join(ROOT, 'public/terrain.json')), live = J(path.join(ROOT, 'public/jeongja.json'));
const BOX = W.meta.box;
let n = 0; const ok = (m) => { n++; console.log('ok', n, m); };
const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); };

// 1) 커밋 데이터 = 스크립트 결과
{
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mgwater-')), 'water.json');
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-migeum-water.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
  const a = J(tmp), b = structuredClone(W); delete a.meta.generated; delete b.meta.generated;
  assert.deepEqual(a, b, 'migeum/water.json 이 build-migeum-water.mjs 결과와 다름 — npm run corridor:migeumwater');
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  ok(`committed migeum/water.json = build-migeum-water.mjs (ch ${W.ch.length}, water ${W.water.length}, ${W.meta.stat.waterM2} m²)`);
}
// 2) 플래그 + 로더
{
  assert.equal(migeumWaterEnabled(''), true); assert.equal(migeumWaterEnabled('?migeumwater=0'), false);
  assert.equal(migeumWaterEnabled('?migeum=0'), false); assert.equal(migeumWaterEnabled('?migeum=0&migeumwater=1'), false);
  assert.deepEqual(migeumChRoads(null), []); const w0 = tan.water; assert.equal(mergeMigeumWater(w0, null), w0);
  const before = JSON.stringify(tan.water); const mw = mergeMigeumWater(tan.water, W); assert.equal(JSON.stringify(tan.water), before, 'tancheon water 원본 불변');
  assert.equal(mw.length, tan.water.length + W.water.length);
  const ch = migeumChRoads(W); ch[0].p[0][0] += 1; assert.notEqual(W.ch[0].p[0][0], ch[0].p[0][0], '사본');
  const { loadCorridorData } = await import('../../../src/corridor/index.js');
  const reqs = [];
  const fetchFn = async (u) => { reqs.push(u); const f = path.join(C, u.replace(/^\/corridor\//, '')); return fs.existsSync(f) ? { ok: true, json: async () => J(f) } : { ok: false }; };
  for (const [opt, want] of [[{ migeum: false }, false], [{ migeum: true, migeumWater: false }, false], [{ migeum: true, migeumWater: true }, true]]) {
    reqs.length = 0;
    const d = await loadCorridorData('/corridor/', { fetchFn, streams: false, ...opt });
    assert.equal(reqs.includes('/corridor/' + MIGEUM_WATER_FILE), want, JSON.stringify(opt));
    assert.equal(!!d.migeumWater, want);
  }
  assert.equal(MIGEUM_WATER_FILE, MIGEUM_DIR + 'water.json');
  ok('flags: ?migeumwater=0 / ?migeum=0 → water.json 요청 없음 · 합치기 원본 불변');
}
// 3) 이음
const tileRoads = [];
for (const k of Object.keys(mIndex.tiles)) for (const f of [path.join(MD, 'tiles', k + '.json'), cIndex.tiles[k] && path.join(C, 'tiles', k + '.json')]) if (f && fs.existsSync(f)) for (const r of J(f).r || []) tileRoads.push(r);
const CAR = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service']);
{
  const vtx = (x, z, self) => tileRoads.some((r) => r.p.some(([a, b]) => Math.hypot(a - x, b - z) < 0.15)) || W.ch.some((r) => r !== self && r.p.some(([a, b]) => Math.hypot(a - x, b - z) < 0.15));
  const onEdge = (x, z) => Math.min(Math.abs(x - BOX.x0), Math.abs(x - BOX.x1), Math.abs(z - BOX.z0), Math.abs(z - BOX.z1)) < 0.2;
  let ends = 0, joined = 0, edge = 0; const loose = [];
  for (const r of W.ch) for (const [x, z] of [r.p[0], r.p.at(-1)]) {
    ends++; if (vtx(x, z, r)) joined++; else if (onEdge(x, z)) edge++; else loose.push(`${r.k}${r.n ? ' ' + r.n : ''} ${r.osm} @${x},${z}`);
  }
  const car = W.ch.filter((r) => CAR.has(r.k));
  for (const r of car) for (const [x, z] of [r.p[0], r.p.at(-1)]) assert.ok(vtx(x, z, r), `차도 ${r.k} ${r.n || ''} ${r.osm} 끝 (${x},${z}) 안 이어짐`);
  assert.ok(car.some((r) => r.osm === 186410768 && r.br && r.n === undefined), '돌마교 조각');
  ok(`이음: 끝점 ${ends}개 중 타일/띠 길과 이어짐 ${joined} · 박스 경계 ${edge} · 그 밖 ${loose.length}${loose.length ? ' (' + loose.join('; ') + ')' : ''} — 차도 ${car.length}조각 양끝 전부 이어짐`);
}
// terrain: 라이브 + 코리더 축, base.ch (+ 미금 띠 길)
const TT = mergeTancheon(T0, tan), TB = applyMigeumBank(TT, W, T0);
const mk = (withW) => { const t = createTerrain(withW ? TB : TT, live); const roads = base.ch.map((r) => ({ ...r, p: r.p.map((p) => p.slice()) })).concat(withW ? migeumChRoads(W) : []); t.annotate({ roads, water: [], waterLines: [], parks: [] }); return { t, roads }; };
const OFF = mk(false), ON = mk(true), P = ON.t.params;
// 4) 돌마교
{
  const br = ON.roads.find((r) => r.osm === 186410768);
  assert.equal(br.deckH, 0, '돌마교 상판 = 도로 높이 0');
  const [a, b] = [br.p[0], br.p.at(-1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  assert.ok(Math.abs(L - W.meta.dolma.public.lengthM) < 2, `OSM 길이 ${L.toFixed(1)} vs 공개 102m`);
  let over = 0, minY = Infinity, maxJump = 0, prev = null, nS = 0;
  for (let u = -15; u <= L + 15; u += 0.5) for (const off of [-0.45, 0, 0.45]) {
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, x = a[0] + ux * u - uz * off * br.w, z = a[1] + uz * u + ux * off * br.w;
    const y = ON.t.getGroundHeight(x, z, 0.5); nS++;
    if (ON.t.baseHeight(x, z) < -0.3) over++;
    minY = Math.min(minY, y);
    if (off === 0) { if (prev != null) maxJump = Math.max(maxJump, Math.abs(y - prev)); prev = y; }
  }
  assert.ok(over > 100, '하도 위 구간 ' + over);
  assert.ok(minY > -0.05, `상판에서 꺼짐 ${minY}`);
  assert.ok(maxJump < 0.05, `높이 끊김 ${maxJump}`);
  // 꺼짐(OFF) 비교: 띠 길이 없으면 같은 자리는 하도로 떨어짐 = #17 상태
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  assert.ok(OFF.t.getGroundHeight(mid[0], mid[1], 0.5) < -5, '꺼짐이면 다리 없음(하도)');
  // 차량 높이도 상판
  assert.ok(Math.abs(ON.t.getVehicleHeight(mid[0], mid[1], 0.5)) < 0.05, 'vehicle on deck');
  ok(`돌마교(OSM 186410768, ${L.toFixed(1)}m, 폭 ${br.w}m): 상판 0m · ${nS}점(±0.45폭, 앞뒤 15m) 최저 ${minY.toFixed(3)} · 중앙선 최대 높이차 ${maxJump.toFixed(3)}m · 하도 위 ${over}점`);
}
// 5) 둔치 길·둑 길 높이
{
  let floorPts = 0, bad = 0, bankPts = 0;
  for (const r of ON.roads.filter((r) => W.ch.some((w) => w.osm === r.osm) && !r.br)) for (const p of r.p) {
    const [x, z, h] = p; if (h == null) continue;
    const g = ON.t.baseHeight(x, z);
    if (g <= P.FLOOR + 0.01) { floorPts++; if (h < g - 0.05) bad++; }
    else if (g > -0.05) bankPts++;
  }
  assert.equal(bad, 0, '지형 아래로 꺼진 띠 길 점');
  assert.ok(floorPts > 50 && bankPts > 5, `${floorPts} ${bankPts}`);
  ok(`띠 길 높이: 둔치 위 점 ${floorPts}개 = 둔치(${P.FLOOR}m) 이상 · 둑 위 점 ${bankPts}개 = 0m · 꺼짐 0`);
}
// 6) 수면
{
  let inside = 0, outside = 0, cnt = 0, onFloor = 0; // inside = 하상(수면이 보임) · onFloor = 둔치 높이(수면이 둔치 0.56m 아래라 가려짐) · outside = 비탈/둑 위(있으면 안 됨)
  const pir = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
  for (const w of W.water) {
    for (const [x, z] of w.o) assert.ok(x >= BOX.x0 - 0.1 && x <= BOX.x1 + 0.1 && z >= W.meta.waterZ0 - 0.1 && z <= BOX.z1 + 0.1);
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of w.o) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }
    for (let x = a; x <= c; x += 3) for (let z = b; z <= d; z += 3) {
      if (!pir(x, z, w.o) || w.holes.some((h) => pir(x, z, h))) continue;
      cnt++; const g = ON.t.baseHeight(x, z); if (g < P.FLOOR - 0.01) inside++; else if (g <= P.FLOOR + 0.01) onFloor++; else outside++;
    }
  }
  assert.equal(outside, 0, `비탈·둑 위 수면 ${outside}/${cnt}`); assert.ok(inside / cnt > 0.85, `하상 비율 ${inside}/${cnt}`);
  assert.equal(W.meta.level.dz, 0); assert.ok(Math.abs(W.meta.level.demReliefMedian - P.FLOOR * 0 - 7.6) <= W.meta.level.tol);
  const m = channelWaterMesh(mergeMigeumWater(tan.water, W), ON.t), m0 = channelWaterMesh(tan.water, ON.t);
  const pos = m.geometry.attributes.position; let yMin = Infinity, yMax = -Infinity, k = 0;
  for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); if (z < W.meta.waterZ0 - 0.1) continue; k++; yMin = Math.min(yMin, pos.getY(i)); yMax = Math.max(yMax, pos.getY(i)); }
  assert.ok(k > 0 && Math.abs(yMin - (P.WATER + 0.04)) < 1e-3 && Math.abs(yMax - yMin) < 1e-3, `수면 높이 ${yMin}..${yMax}`);
  // 라이브 수면(jeongja.json)과 높이 같음: 라이브 수면 폴리곤 높이 = WATER
  assert.equal(P.WATER, W.meta.level.water);
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  ok(`수면: 격자 ${cnt}점 중 하상 ${(100 * inside / cnt).toFixed(1)}% · 둔치 높이(가려짐) ${(100 * onFloor / cnt).toFixed(1)}% · 비탈/둑 0 · 높이 ${yMin.toFixed(2)} = 라이브 수면 ${P.WATER}+0.04 (낙차 0, DEM 둑−수로 중앙값 ${W.meta.level.demReliefMedian}m vs 게임 7.6m) · 수면 메시 1개 그대로 (삼각형 ${tris(m0.geometry)} → ${tris(m.geometry)})`);
}
// 7) 라이브 bbox · 띠 밖 높이 불변
{
  let cnt = 0, diff = 0;
  for (let x = LB.x0; x <= LB.x1; x += 6) for (let z = LB.z0; z <= LB.z1; z += 6) { cnt++; if (ON.t.getGroundHeight(x, z, 0.5) !== OFF.t.getGroundHeight(x, z, 0.5) || ON.t.baseHeight(x, z) !== OFF.t.baseHeight(x, z)) diff++; }
  assert.equal(diff, 0, `live bbox ${diff}/${cnt}`);
  let c2 = 0, d2 = 0;
  for (let x = BOX.x0; x <= BOX.x1; x += 8) for (let z = BOX.z0; z <= BOX.z1; z += 8) { if (OFF.t.baseHeight(x, z) > -0.05 && !W.ch.some((r) => r.p.some((p, i) => i && segD(x, z, r.p[i - 1][0], r.p[i - 1][1], p[0], p[1]) < r.w / 2 + 3))) { c2++; if (ON.t.getGroundHeight(x, z, 0.5) !== OFF.t.getGroundHeight(x, z, 0.5)) d2++; } }
  assert.equal(d2, 0);
  ok(`정자 liveBox ${cnt}점 · 미금 박스 띠 밖 ${c2}점 높이 동일`);
}
// 8) 메시 +0
{
  const chOff = roadMesh(base.ch.map((r) => ({ ...r }))), chOn = roadMesh(base.ch.map((r) => ({ ...r })).concat(migeumChRoads(W)));
  assert.ok(chOff && chOn && chOn.isMesh && chOff.isMesh, '리본 메시 하나');
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  ok(`메시 +0: 탄천 구간 리본 1개(삼각형 ${tris(chOff.geometry)} → ${tris(chOn.geometry)}), 수면 1개 — 다리 상판·교각·난간은 terrain 의 기존 합친 메시`);
}
// 9) 둑 위치
{
  const B = W.bank.R; assert.ok(B && !W.bank.L, '오른쪽(구미동) 둑만');
  for (let k = 0; k < B.top.length; k++) { const i = B.from + k; assert.ok(B.top[k] <= TT.prof.topR[i] + 1e-9 && B.toe[k] <= B.top[k] - 2 + 1e-9 && B.toe[k] > TT.prof.wR[i] + 1.2, `bank ${i}`); }
  assert.equal(TB.prof.topL, TT.prof.topL); assert.notEqual(TB.prof.topR, TT.prof.topR); assert.equal(TT.prof.topR[B.from + 40], 54, '원본 prof 불변');
  for (let i = 0; i < TB.prof.topR.length; i++) if (i < B.from || i >= B.from + B.top.length) assert.equal(TB.prof.topR[i], TT.prof.topR[i]);
  assert.equal(applyMigeumBank(TT, null, T0), TT); assert.equal(applyMigeumBank(TT, W, { ...T0, axis: T0.axis.slice(1) }), TT, '축 다르면 그대로');
  let carPts = 0, carBad = 0, worstOff = 0;
  for (const r of ON.roads.filter((r) => CAR.has(r.k) && !r.br && W.ch.some((w) => w.osm === r.osm))) for (const [x, z, h] of r.p) { carPts++; if (Math.abs(h) > 0.01) carBad++; }
  for (const r of W.ch.filter((r) => CAR.has(r.k) && !r.br)) for (const [x, z] of r.p) worstOff = Math.min(worstOff, OFF.t.baseHeight(x, z));
  assert.ok(worstOff < -1, '기본 단면이면 비탈');
  assert.equal(carBad, 0, `둑 위 차도 점 ${carBad}/${carPts}`);
  const brE = ON.roads.find((r) => r.osm === 186410768).p.map(([x, z]) => ON.t.baseHeight(x, z));
  assert.ok(brE.every((h) => h === 0), '돌마교 양끝 교대 = 둑 위 ' + brE);
  ok(`둑 위치: 오른쪽 둑 축 ${B.from}..${B.from + B.top.length - 1} (기본 top 54m → 최소 ${Math.min(...B.top)}m, 근거 OSM ${W.meta.bank.sides.R.evidenceOsm.join('/')}) · 띠 안 차도 ${carPts}점 전부 0m (기본 단면이면 최저 ${worstOff.toFixed(2)}m) · 돌마교 양끝 0m`);
}
console.log(`test-migeum-water: all ${n} ok`);
