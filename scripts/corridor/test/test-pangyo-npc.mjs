// [pangyo-npc] 판교 IT 직장인 NPC 데이터 + 런타임 테스트: node scripts/corridor/test/test-pangyo-npc.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { ROLES, rolePool, roleLabel, LINES, MAX_NPC, densityAt, npcPeriod } from '../../../src/corridor/pangyoNpcData.js';
import { createPangyoNpc, pangyoNpcEnabled, propShared, PANGYO_NPC_FILE } from '../../../src/corridor/pangyoNpc.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const data = J(path.join(ROOT, 'public/corridor', PANGYO_NPC_FILE));
const pg = J(path.join(ROOT, 'public/corridor/pangyo/index.json'));
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };

// 1) 커밋된 데이터 = 스크립트 결과 (data/osm_pangyo_npc_raw.json 기준, 생성 시각만 다름)
{
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pangyo-npc-')), 'out.json');
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-pangyo-npc.mjs'), `--out=${tmp}`], { cwd: ROOT, stdio: 'pipe' });
  const a = J(tmp), b = structuredClone(data); delete a.meta.generated; delete b.meta.generated;
  assert.deepEqual(a, b, 'pangyo-npc.json 이 build-pangyo-npc.mjs 결과와 다름');
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  ok('committed pangyo-npc.json matches build output');
}

// 2) 회사: OSM id 가 있고 이니셜 한 글자, 좌표가 판교 일대(정자 원점 남북 2.5–4km 북쪽)
{
  assert.ok(data.companies.length >= 3);
  for (const c of data.companies) {
    assert.match(c.osm, /^(node|way|relation)\/\d+$/);
    assert.match(c.initial, /^[A-Z]$/);
    assert.ok(['platform', 'game', 'security'].includes(c.kind));
    assert.ok(c.x > -800 && c.x < 1200 && c.z < -2800 && c.z > -4200, `${c.key} 좌표 이상 ${c.x},${c.z}`);
    assert.ok(!('name' in c), '회사 이름은 데이터에 넣지 않는다');
  }
  assert.ok(data.food.length > 10 && data.food.every((f) => f.length === 3 && 'rc'.includes(f[2])));
  ok('companies have OSM ids, initials only');
}

// 3) 라벨·대사에 회사 이름이 없다 (이니셜만)
{
  const BAN = /카카오|kakao|크래프톤|krafton|네이버|naver|안랩|ahnlab|nhn|스마일게이트|smilegate|엔씨|ncsoft|더존|douzone|넥슨|nexon/i;
  const texts = [];
  for (const kind of ['platform', 'game', 'security']) for (const role of rolePool(kind)) for (const en of [false, true]) texts.push(roleLabel({ initial: 'K', role }, en));
  for (const p of Object.values(LINES)) for (const [ko, en] of p) texts.push(ko, en);
  for (const t of texts) assert.ok(!BAN.test(t), `회사 이름 포함: ${t}`);
  assert.equal(roleLabel({ initial: 'N', role: ['디자이너', 'Designer'] }, false), 'N사 디자이너');
  assert.equal(roleLabel({ initial: 'N', role: ['디자이너', 'Designer'] }, true), 'N Co. Designer');
  assert.ok(ROLES.common.length >= 15 && ROLES.common.every((r) => r.length === 2 && r[0] && r[1]));
  ok('labels/lines use initials only, KO/EN');
}

// 4) 시간대 밀도: 출퇴근·점심 > 한낮 > 밤
{
  const c = (h) => densityAt(h).count;
  assert.equal(npcPeriod(8.5), 'morning'); assert.equal(npcPeriod(12.5), 'lunch'); assert.equal(npcPeriod(19), 'evening'); assert.equal(npcPeriod(15), 'day'); assert.equal(npcPeriod(23), 'night');
  assert.ok(c(9) > c(15) && c(19) > c(15) && c(12.5) > c(15) && c(15) > c(23) && c(3) <= 3);
  for (let h = 0; h < 24; h += 0.25) { const d = densityAt(h); assert.ok(d.count >= 0 && d.count <= MAX_NPC); assert.ok(Math.abs(Object.values(d.mix).reduce((s, v) => s + v, 0) - 1) < 1e-9, `mix 합 ${h}`); }
  assert.ok(densityAt(12.5).mix.food >= 0.4 && densityAt(8.5).mix.station >= 0.4);
  ok('time-of-day density schedule');
}

// 5) 플래그
{
  assert.equal(pangyoNpcEnabled(''), true);
  assert.equal(pangyoNpcEnabled('?pangyonpc=0'), false);
  assert.equal(pangyoNpcEnabled('?pangyo=0'), false);
  assert.equal(pangyoNpcEnabled('?hour=8&pangyonpc=1'), true);
  ok('?pangyonpc=0 / ?pangyo=0 flags');
}

// 6) 소품: 정점 색 병합 3종 + 공유 재질 1개 (crowd 에서 +3 draw call)
{
  const P = propShared();
  assert.equal(P, propShared());
  for (const k of ['badge', 'cup', 'laptop']) assert.ok(P[k].isBufferGeometry && P[k].attributes.color);
  assert.ok(P.mat.vertexColors && P.mat.isMeshLambertMaterial);
  ok('props: 3 merged geometries, 1 shared material');
}

// 7) 런타임: 가짜 crowd 로 배치·밀도·컬링·장소 검사
{
  let hour = 8.5;
  const regs = [], keys = new Set();
  const crowd = {
    register(root) { const list = []; root.traverse((o) => { if (o.isMesh) { const m = o.material; const lam = m.isMeshLambertMaterial && !m.vertexColors && !m.map; keys.add(lam ? 'L|' + o.geometry.uuid : 'M|' + m.uuid + o.geometry.uuid); list.push(o); } }); regs.push(list); return list; },
    n: 0, add() { this.n++; },
  };
  const N = createPangyoNpc({ pg, fetchJson: async () => data, getHour: () => hour });
  await N.loading;
  assert.equal(N.actors.length, MAX_NPC);
  N.register(crowd);
  assert.equal(regs.length, MAX_NPC);
  const P = propShared(), propKeys = [...keys].filter((k) => k.startsWith('M|' + P.mat.uuid));
  assert.equal(propKeys.length, 3, '소품 부품 종류 = 3');
  const run = (x, z, f = 300) => { for (let i = 0; i < f; i++) { crowd.n = 0; N.render(crowd, 0.1, x, z); } };
  run(265, -3110);
  assert.equal(N.stats.period, 'morning');
  assert.equal(N.stats.active, densityAt(8.5).count);
  assert.ok(N.stats.byKind.station >= N.stats.active * 0.3, '아침: 역 출구 위주');
  const ex = pg.stations.flatMap((s) => s.exits);
  for (const a of N.actors) if (a.kind === 'station') assert.ok(ex.some((e) => Math.hypot(a.path[0][0] - e.x, a.path[0][1] - e.z) < 2 || Math.hypot(a.path.at(-1)[0] - e.x, a.path.at(-1)[1] - e.z) < 2));
  for (const a of N.actors) if (a.path) assert.match(a.tag ? a.tag.el.textContent : 'K', /^[A-Z]/);
  const deckActors = N.actors.filter((a) => a.kind === 'deck' && a.path);
  const deckH = pg.landmarks.find((l) => l.model === 'pangyoDeck').parts.map((q) => q.h);
  assert.ok(deckActors.length > 0 && deckActors.every((a) => deckH.includes(a.yFix)), '데크 위 사람은 데이터의 데크 상판 높이');
  // 이니셜: 역·식당·데크 NPC 는 위치 확인된 모든 회사 이니셜이 고르게, 회사 입구는 자기 회사
  const mix = {}, inits = [...new Set(data.companies.map((c) => c.initial))];
  for (let r = 0; r < 12; r++) {
    for (const a of N.actors) if (a.path) {
      if (a.kind === 'company') assert.equal(a.who.initial, a.spot.company.initial);
      else mix[a.who.initial] = (mix[a.who.initial] || 0) + 1;
    }
    for (const a of N.actors) a.path && (a.leaving = true);
    run(265, -3110, 120);
  }
  const tot = Object.values(mix).reduce((s, v) => s + v, 0);
  for (const i of inits) assert.ok((mix[i] || 0) / tot > 0.5 / inits.length, `이니셜 ${i} 비율 ${JSON.stringify(mix)}`);
  assert.ok((mix.K || 0) / tot < 1.6 / inits.length, `K 쏠림 ${JSON.stringify(mix)}`);
  console.log('   initial mix (station/food/deck):', JSON.stringify(mix));
  // 점심: 식당·광장 위주
  hour = 12.5; run(265, -3110, 30);
  for (const a of N.actors) a.path && (a.leaving = true);
  run(265, -3110, 1200);
  assert.equal(N.stats.period, 'lunch');
  assert.ok((N.stats.byKind.food || 0) + (N.stats.byKind.deck || 0) > (N.stats.byKind.station || 0), '점심: 식당·광장 > 역');
  // 밤: 적게
  hour = 23; run(265, -3110, 1500);
  assert.ok(N.stats.active <= densityAt(23).count && N.stats.placed <= densityAt(23).count + 2, `밤 ${N.stats.placed}`);
  // 멀리(정자)에선 그리지 않음
  hour = 8.5; run(0, 0, 50);
  assert.equal(N.stats.visible, 0); assert.equal(crowd.n, 0);
  // 바닥 타일이 없으면 배치하지 않음
  const N2 = createPangyoNpc({ pg, fetchJson: async () => data, getHour: () => 8.5, tileReady: () => false });
  await N2.loading; N2.register(crowd);
  for (let i = 0; i < 100; i++) N2.render(crowd, 0.1, 265, -3110);
  assert.equal(N2.stats.placed, 0);
  // 데크를 올리면(다른 작업: 10–12m) NPC 도 데이터 높이를 따라간다
  const pgHi = JSON.parse(JSON.stringify(pg)); for (const q of pgHi.landmarks.find((l) => l.model === 'pangyoDeck').parts) { q.mh = 10.5; q.h = 11.5; }
  const N3 = createPangyoNpc({ pg: pgHi, fetchJson: async () => data, getHour: () => 12.5 });
  await N3.loading; N3.register(crowd);
  for (let i = 0; i < 400; i++) N3.render(crowd, 0.1, 255, -3115);
  const d3 = N3.actors.filter((a) => a.kind === 'deck' && a.path);
  assert.ok(d3.length > 0 && d3.every((a) => a.yFix === 11.5 && Math.abs(a.mesh.position.y - 11.5) < 1e-6), '데크 높이 변경 추종');
  ok('runtime placement, density, culling, tile gating, initial mix, deck height follows data');
}

// 8) 데이터 없으면 조용히 비활성
{
  const N = createPangyoNpc({ pg, fetchJson: async () => null, getHour: () => 8.5 });
  await N.loading; N.register({ register: () => [] });
  for (let i = 0; i < 20; i++) N.render({ add() {} }, 0.1, 265, -3110);
  assert.equal(N.stats.placed, 0);
  N.dispose();
  ok('missing data → no NPCs');
}
console.log(`pangyo-npc: ${n} ok`);
