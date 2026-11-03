// [pangyo-water] 정자→판교 탄천 수위 + 판교 지류 테스트: node scripts/corridor/test/test-pangyo-water.mjs
//   1) water.json = build-pangyo-water.mjs 결과(OSM 원본이 있을 때)  2) 플래그·합치기(원본 불변, ?pangyowater=0 / ?pangyo=0 끔)
//   3) 정자 라이브 bbox 전수 동일 + 낙차 구간 밖 본류 단면 동일  4) 기준점: 궁내교 7.6m / 양현교 상판→하상 9.0m(공개 9m), 수면 단조 하강
//   5) 둔치 길·계단·가로등 기준 = 낙차 반영 둔치  6) 수면 메시가 낙차를 따라감(틈 없음)  7) 운중천 판교 타일에서 파임·이어짐
//   8) 도로·건물(하도 밖) 높이 불변
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pangyoWaterEnabled, attachMainDrop, mergePangyoStreams, dropWaterGeometry } from '../../../src/corridor/pangyoWater.js';
const { mergeTancheon } = await import('../../../src/corridor/tancheon.js');
const { createTerrain } = await import('../../../src/world/terrain.js');
const { flatGeo } = await import('../../../src/world.js');
const { CROSSINGS } = await import('../build-pangyo-link.mjs');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'));
const T0 = J('terrain.json'), ext = J('corridor/tancheon.json'), data = J('jeongja.json'), S = J('corridor/streams.json'), W = J('corridor/pangyo/water.json');
const CI = J('corridor/index.json'), LB = CI.meta.liveBox, base = J('corridor/base.json');
let n = 0; const ok = (m) => { n++; console.log('ok', n, m); };

// 1) 커밋 데이터 = 스크립트 결과
{
  const OSM = path.resolve(ROOT, '../bumpinto-world/data/raw/osm_merged.json');
  if (fs.existsSync(OSM)) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pgwater-')), 'water.json');
    execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-pangyo-water.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
    const a = JSON.parse(fs.readFileSync(tmp, 'utf8')), b = structuredClone(W); delete a.meta.generated; delete b.meta.generated;
    assert.deepEqual(a, b, 'water.json 이 build-pangyo-water.mjs 결과와 다름 — npm run corridor:pangyowater');
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    ok('committed water.json matches build-pangyo-water.mjs');
  } else console.log('skip 1: OSM 원본 없음', OSM);
}

const M = mergeTancheon(T0, ext);
const MA = attachMainDrop(M, W), SA = mergePangyoStreams(S, W);
// 2) 플래그 + 합치기
{
  assert.equal(pangyoWaterEnabled(''), true); assert.equal(pangyoWaterEnabled('?pangyowater=0'), false); assert.equal(pangyoWaterEnabled('?pangyo=0'), false); assert.equal(pangyoWaterEnabled('?pangyo=0&pangyowater=1'), false);
  assert.equal(attachMainDrop(M, null), M); assert.equal(mergePangyoStreams(S, null), S);
  assert.equal(attachMainDrop({ ...M, axis: M.axis.slice(0, -1) }, W).mainDrop, undefined, '축 길이 다르면 안 붙임');
  assert.equal(attachMainDrop(T0, W), T0, '라이브 축만이면 안 붙임');
  assert.ok(MA.mainDrop && MA.axis === M.axis && M.mainDrop === undefined);
  const before = JSON.stringify(S); mergePangyoStreams(S, W); assert.equal(JSON.stringify(S), before, 'streams.json 원본 불변');
  const ids = SA.streams.map((s) => s.id);
  assert.ok(!W.streams.replace.some((r) => S.streams.find((s) => s.id === r) && ids.filter((i) => i === r).length > 1), '운중천 중복 없음');
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!SA.stairs.some((st) => st.river === '운중천' && !W.streams.stairs.includes(st)), '옛 운중천 계단 제거');
  ok(`flags (?pangyowater=0, ?pangyo=0 off) + merge: ${S.streams.length} → ${SA.streams.length} streams, axis guard`);
}

const off = createTerrain({ ...M, streams: S }, data), on = createTerrain({ ...MA, streams: SA }, data);
const P = on.params;
// 3) 라이브 bbox + 낙차 밖
{
  let cnt = 0, diff = 0;
  for (let x = LB.x0; x <= LB.x1; x += 4) for (let z = LB.z0; z <= LB.z1; z += 4) { cnt++; if (on.baseHeight(x, z) !== off.baseHeight(x, z) || on.renderHeight(x, z) !== off.renderHeight(x, z) || on.waterSurface(x, z) !== off.waterSurface(x, z) || on.waterLineY(x, z) !== off.waterLineY(x, z)) diff++; }
  assert.equal(diff, 0, `live bbox ${diff}/${cnt} 다름`);
  const { from, dz } = W.main; let sec = 0;
  for (let i = 0; i < M.axis.length - 1; i += 7) {
    if (i >= from - 1 && i <= from + dz.length) continue;
    const [x, z] = M.axis[i], [x2, z2] = M.axis[i + 1], L = Math.hypot(x2 - x, z2 - z), nx = -(z2 - z) / L, nz = (x2 - x) / L;
    for (let d = -60; d <= 60; d += 3) { const px = x + nx * d, pz = z + nz * d; if (on.streams.height(px, pz) < 0 || off.streams.height(px, pz) < 0) continue; sec++; assert.equal(on.baseHeight(px, pz), off.baseHeight(px, pz), `axis ${i} d ${d}`); }
  }
  assert.equal(on.mainDrop(...M.axis[from - 5]), 0); assert.equal(off.mainDrop, null);
  ok(`live bbox ${cnt} samples identical; ${sec} main-channel samples outside the drop (i<${from} or >${from + dz.length}) identical`);
}

// 4) 기준점 + 단조 하강
{
  const decks = createTerrain({ ...MA, streams: SA }, data);
  decks.annotate(data);
  decks.annotate({ roads: base.ch.map((r) => ({ ...r, p: r.p.map((p) => p.slice()) })), water: [], waterLines: [], parks: [] });
  const rep = [];
  for (const c of CROSSINGS) {
    const q = on.project(...c.at), [x, z] = M.axis[q.i];
    const bed = on.baseHeight(x, z), water = on.waterSurface(x, z), floor = on.floorAt(x, z);
    let deckH = -Infinity; for (let d = -30; d <= 30; d += 1) { const dk = decks.deckAt(x, z + d); if (dk) deckH = Math.max(deckH, dk.h); }
    assert.equal(deckH, 0, `${c.name} 상판 0`);
    const want = c.public.heightM ?? (c.dem.reliefM[0] + c.dem.reliefM[1]) / 2;
    assert.ok(Math.abs(deckH - bed - want) <= 0.45, `${c.name} 상판→하상 ${(deckH - bed).toFixed(2)} vs ${want}`);
    rep.push(`${c.name} 상판→하상 ${(deckH - bed).toFixed(1)}m (공개 ${c.public.heightM ? c.public.heightM + 'm' : '—'}, DEM ${c.dem.reliefM.join('~')}m) · 수면까지 ${(deckH - water).toFixed(1)}m · 둔치 ${floor.toFixed(1)}`);
  }
  const yh = W.meta.anchors['양현교'];
  assert.ok(Math.abs(on.baseHeight(...M.axis[yh.i]) - (P.BED - 1.4)) < 1e-6, '양현교 하상 −9.0');
  const gq = on.project(...CROSSINGS[0].at).i; let prev = Infinity, mono = 0, minW = 0;
  for (let i = gq; i < W.main.from + W.main.dz.length; i++) {
    // 본류 수면 (지류 합류부 몇 m 는 지류 수면이 위에 겹침 — tributary-depth 와 같은 방식, off 에서도 그럼)
    const [x, z] = M.axis[i], w = on.mainWater(x, z), f = on.floorAt(x, z), b = on.baseHeight(x, z), ws = on.waterSurface(x, z);
    assert.ok(f > w && w > b && ws != null && ws >= w - 1e-6, `axis ${i} 둔치 ${f} > 수면 ${w} > 하상 ${b} (${ws})`);
    if (on.streams.waterAt(x, z) == null) assert.equal(ws, w);
    if (i <= yh.i) { assert.ok(w <= prev + 1e-6, `수면 하강 ${i}`); mono++; prev = w; }
    minW = Math.min(minW, w);
  }
  ok(`${rep.join(' · ')} · 궁내교→양현교 ${mono}점 수면 단조 하강 (최저 ${minW.toFixed(2)})`);
}

// 5) 둔치 길·계단·가로등
{
  let nSt = 0;
  for (const st of on.stairs) {
    const fb = st.flight?.[1] || st.b; if (!fb) continue;
    const d = on.mainDrop(fb[0], fb[1]); if (d > -0.05) continue;
    nSt++; assert.ok(Math.abs(on.getGroundHeight(fb[0], fb[1], P.FLOOR + d + 0.3) - (P.FLOOR + d)) < 0.35, `계단 아래 끝 = 둔치 ${fb}`);
  }
  let walk = 0;
  for (let i = W.main.from; i < W.main.from + W.main.dz.length; i += 25) {
    const [x, z] = M.axis[i], [x2, z2] = M.axis[i + 1], L = Math.hypot(x2 - x, z2 - z), nx = -(z2 - z) / L, nz = (x2 - x) / L;
    for (const s of [-1, 1]) { const px = x + nx * s * 28, pz = z + nz * s * 28, h = on.baseHeight(px, pz); if (Math.abs(off.baseHeight(px, pz) - P.FLOOR) > 1e-6 || on.streams.height(px, pz) < 0) continue; walk++; assert.ok(Math.abs(h - on.floorAt(px, pz)) < 1e-4, `둔치 ${px},${pz}`); assert.ok(Math.abs(on.getGroundHeight(px, pz, h + 0.5) - h) < 0.05); }
  }
  assert.ok(walk > 100, `둔치 샘플 ${walk}`);
  ok(`bank floor follows the drop at ${walk} samples, ${nSt} main stairs reach the lowered floor`);
}

// 6) 수면 메시
{
  const g = flatGeo(ext.water.map((w) => ({ ...w, h: P.WATER })), 0.04);
  const t0 = Date.now(), g2 = dropWaterGeometry(g, on), ms = Date.now() - t0, pos = g2.attributes.position;
  let worst = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const v = [0, 1, 2].map((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]);
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) for (const t of [0, 0.5]) { const x = v[a][0] + (v[b][0] - v[a][0]) * t, z = v[a][2] + (v[b][2] - v[a][2]) * t, y = v[a][1] + (v[b][1] - v[a][1]) * t; worst = Math.max(worst, Math.abs(y - (on.mainWater(x, z) + 0.04))); }
  }
  assert.ok(worst < 0.03, `수면 메시 오차 ${worst}`);
  assert.equal(dropWaterGeometry(g, off), g, 'off → 원래 메시');
  // 틈: 모든 변이 짝(또는 바깥 경계)을 가짐 — 중점에서 만나는 T 자 이음 없음
  const key = (i) => Math.round(pos.getX(i) * 100) + ',' + Math.round(pos.getZ(i) * 100), E = new Map();
  for (let i = 0; i < pos.count; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const k = [key(i + a), key(i + b)].sort().join('|'); E.set(k, (E.get(k) || 0) + 1); }
  const P0 = g.index ? g.toNonIndexed().attributes.position : g.attributes.position, E0 = new Map(), key0 = (i) => Math.round(P0.getX(i) * 100) + ',' + Math.round(P0.getZ(i) * 100);
  for (let i = 0; i < P0.count; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const k = [key0(i + a), key0(i + b)].sort().join('|'); E0.set(k, (E0.get(k) || 0) + 1); }
  const b1 = [...E.values()].filter((c) => c === 1).length, b0 = [...E0.values()].filter((c) => c === 1).length;
  assert.ok(b1 <= b0 * 2, `경계 변 ${b0} → ${b1}`);
  ok(`water mesh ${g2.userData.trisIn} → ${g2.userData.tris} tris (${g2.userData.splits} splits, ${ms}ms), max error ${worst.toFixed(3)}m, boundary edges ${b0} → ${b1}`);
}

// 7) 지류
{
  const u = on.streams.list.find((s) => s.id === '429222895'), gt = on.streams.list.find((s) => s.name === '금토천');
  assert.ok(u && gt && gt.into === u.id && u.into === 'tancheon');
  let full = 0, sunk = 0, pg = 0;
  const inPg = (x, z) => Object.keys(W.streams.tiles).some((k) => { const [a, b] = k.split('_').map(Number), T = CI.meta.tile || 500; return x >= a * T && x < (a + 1) * T && z >= b * T && z < (b + 1) * T; });
  for (let i = 30; i < u.iE - 30; i += 5) { const [x, z] = u.axis[i]; full++; assert.equal(u.sc[i], 1, `운중천 ${i} 끊김`); const h = on.baseHeight(x, z); if (h <= -u.D - 0.5) sunk++; if (inPg(x, z)) pg++; }
  assert.ok(sunk / full > 0.95, `운중천 파임 ${sunk}/${full}`);
  const [cx, cz] = u.axis[u.N - 1], fl = on.floorAt(cx, cz);
  assert.ok(Math.abs(u.F[u.N - 1] - fl) < 0.05, `합류 끝 = 탄천 둔치 ${u.F[u.N - 1]} vs ${fl}`);
  const old = off.streams.list.filter((s) => W.streams.replace.includes(s.id));
  ok(`운중천 D ${u.D}m continuous ${full} samples (${pg} in pangyo/corridor tiles), sunk ${sunk}, ends at Tancheon floor ${fl.toFixed(2)} (was ${old.length} pieces, D ${old.map((s) => s.D).join('/')}) · 금토천 D ${gt.D}m → 운중천`);
}

// 8) 도로·건물(하도 밖) 불변
{
  const bx = on.mainDropBox; let cnt = 0, diff = 0, bad = 0;
  for (let x = Math.min(bx[0], -700); x <= Math.max(bx[2], 1800); x += 6) for (let z = Math.min(bx[1], -4300); z <= -700; z += 6) {
    cnt++; const a = on.baseHeight(x, z), b = off.baseHeight(x, z); if (a === b) continue; diff++;
    if (!(b < 0 && a < b && on.mainDrop(x, z) < 0) && !(on.streams.height(x, z) < 0) && !(off.streams.height(x, z) < 0)) { bad++; if (bad < 6) console.log('   changed', x, z, b, a); }
  }
  assert.equal(bad, 0, `하도 밖 높이 바뀜 ${bad}`);
  let roads = 0, rdiff = 0;
  for (const r of base.ch) for (const [x, z] of r.p) { if (off.baseHeight(x, z) < -0.05 || on.streams.height(x, z) < 0 || off.streams.height(x, z) < 0) continue; roads++; if (on.baseHeight(x, z) !== off.baseHeight(x, z)) rdiff++; }
  assert.equal(rdiff, 0);
  ok(`${cnt} grid samples: ${diff} changed, all inside the Tancheon channel or a tributary channel · ${roads} street-level road points unchanged`);
}
console.log(`pangyo-water: all ${n} checks passed`);
