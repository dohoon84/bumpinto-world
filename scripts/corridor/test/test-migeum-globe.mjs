// [migeum-landing] 지구본(월드 게이트) 미금역: 판교와 같은 '지선 역' 방식 — 노선도 점·이름, 지역 현황 '열림 · 입장', ?migeum=0 이면 기존 그대로
//   node scripts/corridor/test/test-migeum-globe.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);

const S = await import('../../../src/corridor/globeStations.js');
const G = await import('../../../src/corridor/globeCorridor.js');
const R = await import('../../../src/regions/index.js');

// 1) 역 좌표 = migeum/index.json 의 역 (미금 기능 PR 이 합쳐진 뒤에만 파일이 있다 → 있으면 비교)
{
  assert.equal(S.MIGEUM_GLOBE_STATIONS.length, 1);
  const m = S.MIGEUM_GLOBE_STATIONS[0];
  assert.deepEqual([m.id, m.ko, m.en, m.branch], ['migeum', '미금', 'Migeum', 'jeongja']);
  assert.deepEqual(m.lines, ['수인분당선', '신분당선']);
  const f = path.join(root, 'public/corridor/migeum/index.json');
  if (existsSync(f)) {
    const st = JSON.parse(readFileSync(f, 'utf8')).stations;
    assert.deepEqual(S.MIGEUM_GLOBE_STATIONS.map((s) => [s.id, s.x, s.z, s.lines]), st.map((s) => [s.id, s.x, s.z, s.lines]), 'globe migeum = migeum index station');
    ok('globe station = public/corridor/migeum/index.json');
  } else ok(`globe station (${m.x}, ${m.z}) — migeum/index.json 없음(미금 기능 PR 전), 비교 건너뜀`);
}

// 2) 목록·역 수·이름 (판교와 같은 규칙)
{
  assert.ok(G.CORRIDOR_STATION_IDS.has('migeum') && G.OPEN_BRANCH_IDS.has('migeum'));
  assert.equal(G.CORRIDOR_STATION_COUNT, S.CORRIDOR_STATIONS.length + 1 + G.BRANCH_STATIONS.length);
  assert.equal(G.OPEN_BRANCH_STATIONS.length, G.BRANCH_STATIONS.length);
  assert.ok(G.OPEN_BRANCH_IDS.has('gangnam'), '강남 개통 시 지선에 포함');
  assert.deepEqual(G.corridorStationLabel('migeum'), { ko: '미금역', en: 'Migeum Station', short: 'Migeum' });
  ok(`globe list: ${G.CORRIDOR_STATION_COUNT} stations (branches ${G.BRANCH_STATIONS.map((s) => s.id).join('+')})`);
}

// 3) 노선도: 미금 점이 정자 남쪽에 보이고, 이름표가 겹치지 않으며, 지선 표시 여부와 상관없이 본선 배치는 같다
{
  const L = G.layoutCorridorMap(), off = G.layoutCorridorMap({ branches: [] });
  assert.deepEqual(L.items, off.items, 'main line layout independent of branches');
  const m = L.branches.find((b) => b.id === 'migeum'), j = L.items.find((p) => p.id === 'jeongja');
  assert.ok(m && m.from.id === 'jeongja' && m.side === 'left', 'migeum branch from jeongja');
  assert.ok(m.dy > j.dy && m.dy <= L.height, `migeum below jeongja inside map (${m.dy.toFixed(1)} / ${L.height})`);
  const left = [...L.items, ...L.branches].filter((x) => x.side === 'left' && x.id !== m.id);
  for (const it of left) assert.ok(Math.abs(it.dy - m.dy) >= 14, `label gap ${it.id} ${Math.abs(it.dy - m.dy).toFixed(1)}px`);
  const p = L.branches.find((b) => b.id === 'pangyo');
  for (const it of L.items.filter((x) => x.side === 'left')) assert.ok(!p || Math.abs(it.dy - p.dy) >= 14, `pangyo label gap ${it.id}`);
  ok(`corridor map: migeum dy ${m.dy.toFixed(1)}px (jeongja ${j.dy.toFixed(1)}px), labels ≥ 14px apart`);
}

// 4) ?migeum=0 → 지구본 목록에서 뺀다. 그때 노선도 범위는 미금 없이(= 이 PR 전과 같은 배치)
{
  assert.equal(G.migeumGlobeEnabled('?migeum=0'), false);
  assert.equal(G.migeumGlobeEnabled('?migeum=1'), true);
  assert.equal(G.migeumGlobeEnabled(''), true);
  const before = G.layoutCorridorMap({ branches: S.PANGYO_GLOBE_STATIONS, extent: S.PANGYO_GLOBE_STATIONS });
  assert.equal(Math.max(...before.items.map((x) => x.dy)), before.items.find((x) => x.id === 'jeongja').dy, 'without migeum jeongja is the southern end');
  assert.ok(!before.branches.some((b) => b.id === 'migeum'));
  ok('?migeum=0 flag: no migeum, previous map extent');
}

// 5) 지역 현황 항목 (판교와 같은 형식: 이름 · 짧은 설명 KO/EN · 좌표)
{
  const r = R.UPCOMING_REGIONS.find((x) => x.id === 'migeum'), pg = R.UPCOMING_REGIONS.find((x) => x.id === 'pangyo');
  assert.ok(r && pg);
  assert.deepEqual(Object.keys(r), Object.keys(pg), 'same fields as pangyo');
  assert.deepEqual([r.name, r.enName, r.desc, r.enDesc], ['미금역', 'Migeum Stn.', '출구 1–8번 · 탄천', 'Exits 1–8 · Tancheon']);
  const m = S.MIGEUM_GLOBE_STATIONS[0];
  assert.ok(Math.abs(r.lat - m.lat) < 1e-3 && Math.abs(r.lon - m.lon) < 1e-3, 'region pin at station');
  assert.equal(R.countryOf(r), 'KR');
  ok('region list entry (KO/EN) at station position');
}
