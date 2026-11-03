// node scripts/test-subway.mjs — [subway] 들어가기/나오기 상태 · 실제 출구(OSM) 투영·안내 · 대합실 배치(걸을 수 있는 곳) 순수 로직
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createSubwayState, FADE_SEC } from '../src/subway/state.js';
import { JEONGJA_EXITS, projectLatLon, compass, nearbyHints, resolveExits, groupExits, exitLabel, roadAxis, exitSide } from '../src/subway/exits.js';
import { HALL, GATE, WELLS, passageFor, walkable, passageAt, laneAt, staticBlockers } from '../src/subway/layout.js';
import { placeEntrance, toWorld, toLocal } from '../src/subway/entrance.js';

// ---------- 상태 ----------
const ex = [{ id: 'x1' }, { id: 'x2' }, { id: 'x6' }];
const S = createSubwayState({ exits: ex });
const run = (sec) => { const ev = []; for (let t = 0; t < sec; t += 0.05) ev.push(...S.tick(0.05)); return ev; };
assert.equal(S.phase, 'outside'); assert.equal(S.active, false); assert.equal(S.interior, false);
assert.equal(S.enter('x9'), false, '없는 출구로는 못 들어감');
assert.equal(S.openChooser(), false); assert.equal(S.choose('x1'), false);
assert.ok(S.enter('x2'));
assert.equal(S.enter('x1'), false, '들어가는 중 두 번 들어가기 없음');
assert.equal(S.phase, 'entering'); assert.ok(S.busy); assert.equal(S.interior, false, '페이드 아웃 동안은 바깥을 그림');
assert.equal(S.fadeAlpha(), 0);
S.tick(FADE_SEC / 2); assert.ok(S.fadeAlpha() > 0.4 && S.fadeAlpha() < 0.6);
assert.deepEqual(S.tick(FADE_SEC / 2 + 0.001), ['load']); assert.equal(S.phase, 'arriving'); assert.ok(S.interior); assert.equal(S.canWalk, false);
assert.ok(S.fadeAlpha() > 0.5, '대합실 페이드 인 시작은 어두움');
assert.deepEqual(run(FADE_SEC + 0.1), ['ready']); assert.equal(S.phase, 'inside'); assert.ok(S.canWalk); assert.equal(S.fadeAlpha(), 0);
assert.deepEqual(run(3), [], '안에서는 이벤트 없음');
// 출구 고르기: 기본 = 들어온 출구, 순환, 취소
assert.ok(S.openChooser()); assert.equal(S.phase, 'choosing'); assert.equal(S.pick, 1); assert.equal(S.canWalk, false);
assert.equal(S.move(1), 2); assert.equal(S.move(1), 0); assert.equal(S.move(-1), 2);
assert.ok(S.cancel()); assert.equal(S.phase, 'inside');
assert.ok(S.openChooser()); assert.equal(S.pick, 1, '다시 열면 다시 들어온 출구');
assert.equal(S.choose('x7'), false);
assert.ok(S.choose('x6')); assert.equal(S.target, 'x6'); assert.equal(S.phase, 'leaving'); assert.ok(S.interior);
assert.deepEqual(S.tick(FADE_SEC), ['unload']); assert.equal(S.phase, 'returning'); assert.equal(S.interior, false); assert.ok(S.busy);
assert.deepEqual(run(FADE_SEC + 0.1), ['done']); assert.equal(S.phase, 'outside'); assert.equal(S.busy, false);
// 고르지 않고 choose() → 강조된(들어온) 출구
assert.ok(S.enter('x1')); run(FADE_SEC * 2 + 0.2); assert.ok(S.openChooser()); assert.ok(S.choose()); assert.equal(S.target, 'x1');
run(FADE_SEC * 2 + 0.2); assert.equal(S.phase, 'outside');
// 큰 dt 한 번에도 단계를 건너뛰지 않음 (프레임 끊김)
assert.ok(S.enter('x2')); assert.deepEqual(S.tick(5), ['load']); assert.deepEqual(S.tick(5), ['ready']);

// ---------- 출구 (OSM) ----------
assert.equal(JEONGJA_EXITS.length, 6);
assert.deepEqual(JEONGJA_EXITS.map((e) => e.ref), ['1', '2', '3', '4', '5', '6']);
for (const e of JEONGJA_EXITS) assert.ok(Number.isInteger(e.osm) && e.lat > 37.36 && e.lat < 37.37 && e.lon > 127.10 && e.lon < 127.11);
// repo 의 OSM 원본과 좌표·ref 가 같다
const raw = JSON.parse(fs.readFileSync('data/osm_raw_osmapi.json', 'utf8'));
const nodes = new Map((raw.elements || []).filter((n) => n.type === 'node' && n.tags?.railway === 'subway_entrance').map((n) => [n.id, n]));
for (const e of JEONGJA_EXITS) {
  const n = nodes.get(e.osm); assert.ok(n, `OSM ${e.osm} 없음`);
  assert.equal(String(n.tags.ref), e.ref); assert.ok(Math.abs(n.lat - e.lat) < 1e-6 && Math.abs(n.lon - e.lon) < 1e-6);
}
const data = JSON.parse(fs.readFileSync('public/jeongja.json', 'utf8'));
{ const o = projectLatLon(data.meta.center, data.meta.center.lat, data.meta.center.lon); assert.ok(o.x === 0 && o.z === 0); }
assert.equal(compass(0, -10).id, 'n'); assert.equal(compass(10, 0).id, 'e'); assert.equal(compass(0, 10).id, 's'); assert.equal(compass(-10, 1).id, 'w');
const exits = resolveExits(data);
assert.equal(exits.length, 6);
const byRef = Object.fromEntries(exits.map((e) => [e.ref, e]));
assert.ok(Math.abs(byRef['1'].x - 5.7) < 0.2 && Math.abs(byRef['1'].z - 31.4) < 0.2, '1번 출구 투영');
assert.ok(byRef['5'].z < -150, '5번은 북쪽 멀리');
// 성남대로 기준: 1·2·6 동쪽, 3·4·5 서쪽 / 5·6 역 북쪽, 1·2·3 남쪽
assert.deepEqual(exits.map((e) => e.dir.id).join(''), 'eewwwe');
assert.deepEqual(exits.map((e) => e.dir.end || '-').join(''), 'sss-nn');
assert.ok(byRef['6'].dir.ko.includes('성남대로 동쪽') && byRef['6'].dir.en.includes('east side'));
{ const ax = roadAxis(data.roads, data.station); assert.ok(ax && Math.abs(ax.dz) > 0.95 && ax.dz < 0, '성남대로는 남북 방향'); assert.ok(ax.x < -15 && ax.x > -28, '왕복 차로 가운데'); }
assert.equal(exitSide(5, 5, { x: 0, z: 0 }, null).id, compass(5, 5).id, '큰길 없으면 나침반');
assert.equal(exitSide(0, -50, { x: 0, z: 0 }, { x: 0, z: 0, dx: 1, dz: 0 }).id, 'n', '동서 큰길이면 북/남 쪽');
for (const e of exits) { assert.equal(e.id, 'x' + e.ref); assert.ok(e.hints.length <= 2); }
assert.ok(exits.some((e) => e.hints.length), '주변 건물 안내가 하나는 있음');
assert.deepEqual(resolveExits(data, [{ ref: null, osm: 1, lat: 37.3665, lon: 127.1083 }]).map((e) => [e.id, e.ref]), [['n0', null]], 'ref 없으면 번호를 짓지 않음');
assert.equal(exitLabel({ ref: null }), '출구'); assert.equal(exitLabel(byRef['3'], true), 'Exit 3'); assert.equal(exitLabel(byRef['3']), '3번 출구');
assert.deepEqual(nearbyHints(0, 0, [{ kind: 'plaza', text: 'A', x: 10, z: 0 }, { kind: 'plaza', text: 'A', x: 5, z: 0 }, { kind: 'road', text: 'R', x: 1, z: 0 }, { kind: 'landmark', text: 'B', x: 0, z: 30 }, { kind: 'plaza', text: 'Far', x: 900, z: 0 }]), ['A', 'B']);
const groups = groupExits(exits);
assert.deepEqual(groups.map((g) => g.dir), groups.map((g) => g.dir).sort((a, b) => ['w', 'n', 'e', 's'].indexOf(a) - ['w', 'n', 'e', 's'].indexOf(b)));
assert.equal(groups.reduce((n, g) => n + g.exits.length, 0), 6, '모든 출구가 통로 하나에 속함');
assert.deepEqual(groups.map((g) => g.dir + ':' + g.exits.map((e) => e.ref).join('')), ['w:345', 'e:126']);

// ---------- 바깥 출입구 배치 ----------
{
  const e = { x: 10, z: 20, ry: 0.7 };
  const p = toWorld(e, 1.2, 3.4), q = toLocal(e, p.x, p.z);
  assert.ok(Math.abs(q.u - 1.2) < 1e-9 && Math.abs(q.w - 3.4) < 1e-9, 'toWorld/toLocal 역함수');
  const roads = [{ p: [[0, -50], [0, 50]], w: 16, k: 'primary' }];
  const free = placeEntrance({ x: 12, z: 0 }, { roads, station: { x: 12, z: -30 }, isFree: () => true });
  assert.equal(free.bad, 0); assert.equal(free.shift, 0);
  // 큰길과 나란히, 역(북쪽) 쪽으로 내려감: +w = (sin ry, cos ry) ≈ (0, -1)
  assert.ok(Math.abs(Math.sin(free.ry)) < 1e-6 && Math.cos(free.ry) < 0);
  // 원래 자리가 막혔으면 조금 옮김
  const moved = placeEntrance({ x: 12, z: 0 }, { roads, station: { x: 0, z: 0 }, isFree: (x) => x > 15 });
  assert.ok(moved.shift > 0 && moved.shift <= 6.01 && moved.bad === 0);
}

// ---------- 대합실 배치 ----------
const passages = groups.map((g) => ({ ...passageFor(g.dir), exits: g.exits }));
assert.equal(GATE.lanes.length, 7); assert.equal(GATE.cab.length, 8);
for (const p of passages) {
  assert.ok(walkable(p.mouth.x, p.mouth.z, 0.3, { passages }), `${p.dir} 통로 입구에 설 수 있음`);
  const deep = { x: p.mouth.x + p.out.x * 5.5, z: p.mouth.z + p.out.z * 5.5 };
  assert.ok(walkable(deep.x, deep.z, 0.3, { passages }), `${p.dir} 통로 안 걸을 수 있음`);
  assert.equal(passageAt(deep.x, deep.z, passages), p, `${p.dir} 통로 안 → 출구 고르기`);
  assert.equal(passageAt(p.mouth.x, p.mouth.z, passages), null, '대합실 입구에서는 아직 아님');
  // 통로 사이 틈 없이 대합실 → 통로 끝까지 이어진다
  for (let k = 0; k <= 52; k++) { const d = k * 0.1; assert.ok(walkable(p.mouth.x + p.out.x * d, p.mouth.z + p.out.z * d, 0.3, { passages }), `${p.dir} ${d.toFixed(1)}m`); }
  assert.equal(walkable(p.mouth.x + p.out.x * 9, p.mouth.z + p.out.z * 9, 0.3, { passages }), false, '통로 끝 계단은 못 올라감');
}
assert.equal(walkable(HALL.x0 - 1, 9, 0.3, { passages }), false, '벽 밖');
for (const w of WELLS) {
  assert.equal(walkable(w.cx, 6, 0.3, { passages }), false, '계단·에스컬레이터 구멍은 못 들어감');
  assert.equal(walkable(w.cx, 2.2, 0.3, { passages }), true, '계단 앞까지는 감');
}
// 개찰구: 열린 통로로만 지나감, 펜스는 못 지나감
const lane = 3, lx = GATE.lanes[lane];
assert.equal(laneAt(lx, -1.0), lane); assert.equal(laneAt(lx, 3), -1); assert.equal(laneAt(GATE.cab[0], 0), -1);
assert.equal(walkable(lx, 0, 0.25, { passages, laneOpen: () => false }), false, '닫힌 개찰구');
assert.equal(walkable(lx, 0, 0.25, { passages, laneOpen: () => true }), true, '열린 개찰구');
assert.equal(walkable(-20, 0, 0.25, { passages }), false, '펜스');
assert.equal(walkable(GATE.cab[2], 0, 0.25, { passages }), false, '개찰구 몸체');
// 길이 막히지 않음: 각 출구 통로 → 개찰구 앞 (격자 BFS)
{
  const step = 0.25, r = 0.3, key = (i, j) => i * 1000 + j;
  const ok = (i, j) => walkable(HALL.x0 - 8 + i * step, HALL.z0 - 8 + j * step, r, { passages, blockers: staticBlockers(), laneOpen: () => true });
  const start = passages[0].mouth, si = Math.round((start.x - HALL.x0 + 8) / step), sj = Math.round((start.z - HALL.z0 + 8) / step);
  const seen = new Set([key(si, sj)]), q = [[si, sj]];
  while (q.length) { const [i, j] = q.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a > 400 || b > 200 || seen.has(key(a, b)) || !ok(a, b)) continue; seen.add(key(a, b)); q.push([a, b]); } }
  const reach = (x, z) => seen.has(key(Math.round((x - HALL.x0 + 8) / step), Math.round((z - HALL.z0 + 8) / step)));
  for (const p of passages) assert.ok(reach(p.mouth.x, p.mouth.z), `${p.dir} 통로 ↔ 다른 통로`);
  assert.ok(reach(lx, -1.5) && reach(lx, 1.5), '개찰구 앞뒤');
  for (const w of WELLS) assert.ok(reach(w.cx, 2.2), '승강장 계단 앞');
}
console.log('subway: state · exits · entrance placement · concourse layout OK');
