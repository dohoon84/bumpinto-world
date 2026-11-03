// node scripts/test-subway.mjs — [subway] 들어가기/나오기 상태 · 실제 출구(OSM) 투영·안내 · 대합실 배치(걸을 수 있는 곳) 순수 로직
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createSubwayState, FADE_SEC } from '../src/subway/state.js';
import { JEONGJA_EXITS, projectLatLon, compass, nearbyHints, resolveExits, groupExits, exitLabel, roadAxis, exitSide } from '../src/subway/exits.js';
import { HALL, GATE, WELLS, passageFor, walkable, passageAt, laneAt, staticBlockers } from '../src/subway/layout.js';
import { placeEntrance, toWorld, toLocal } from '../src/subway/entrance.js';
import * as THREE from 'three';
import { ZONE_BASE, ZONES, encodeZone, decodeZone, isZoneId, zoneSlot } from '../src/net/zones.js';
import { STATIONS, stationTheme, stationReach, corridorExits, stationZone, entranceLod, ENT_BUILD, ENT_DROP, ENT_SHOW, JEONGJA_THEME } from '../src/subway/stations.js';
import { LINES, LINE_ORDER, OSM_REF_TO_LINE } from '../src/subway/lines.js';
import { gyeongbuSoonAt, GYEONGBU_SOON } from '../src/world/gyeongbuSoon.js';
import { RemotePlayers } from '../src/net/remotePlayers.js';
import { STATE_HZ } from '../src/net/protocol.js';

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

// ---------- [zone] 대합실 프레즌스 ----------
{
  const Z = 'jeongja-station';
  assert.equal(ZONES[1], Z, '슬롯 번호는 바꾸지 않는다 (버전이 다른 클라이언트끼리 구역이 엇갈림)');
  const e = encodeZone(Z, -12.3, 4.5);
  assert.ok(e.x > ZONE_BASE - 5000 && e.zone === Z, '띠 좌표');
  const d = decodeZone(e.x, e.z);
  assert.equal(d.zone, Z); assert.ok(Math.abs(d.x + 12.3) < 1e-6 && d.z === 4.5, '실내 좌표 복원');
  assert.deepEqual(decodeZone(e.x, e.z, 'something-else').zone, Z, '좌표 띠가 우선 (서버가 zone 을 버려도 같은 결과)');
  assert.deepEqual(decodeZone(812.5, -3), { zone: '', x: 812.5, z: -3 }, '옛 클라이언트·바깥 = 구역 없음');
  assert.deepEqual(decodeZone('12', undefined), { zone: '', x: 12, z: 0 });
  assert.deepEqual(decodeZone(4, 5, Z), { zone: Z, x: 4, z: 5 }, '나중에 서버가 zone 을 그대로 전달하면 그것도 이해');
  assert.equal(decodeZone(4, 5, '<script>').zone, '', '이상한 zone 문자열은 무시');
  assert.equal(isZoneId('a'.repeat(60)), false);
  assert.equal(decodeZone(ZONE_BASE + 77 * 10000 + 3, 1).zone, 'zone#77', '모르는 슬롯도 바깥으로 새지 않음');
  // 코리더 역 대합실 슬롯 (덧붙이기만): 2..14 = 수내..잠실, 역 id 와 이름이 맞는다
  assert.deepEqual(ZONES.slice(2), STATIONS.filter((d) => d.id !== 'jeongja').map((d) => stationZone(d.id)), '역 대합실 구역 = stationsData 순서');
  for (const zid of ZONES.slice(1)) { assert.ok(isZoneId(zid)); const q = decodeZone(encodeZone(zid, 3, 4).x, 4); assert.equal(q.zone, zid); }
  assert.equal(zoneSlot('jamsil-station'), 14);
  assert.deepEqual(encodeZone('', 3, 4), { x: 3, z: 4 }, '바깥은 그대로');
  assert.ok(Math.abs(decodeZone(encodeZone(Z, 1e9, 0).x, 0).x) < 5000, '실내 좌표는 띠 안으로 잘림');
  // 서버(room.js / dev-relay)는 state 를 x,z,ry… 만 골라 다시 보낸다 → 띠 좌표만으로 동작해야 함
  const relay = (m) => ({ t: 'state', id: m.id, x: Number(m.x) || 0, z: Number(m.z) || 0, ry: Number(m.ry) || 0, moving: !!m.moving, riding: false, jy: 0, emote: m.emote || '', sit: '', afk: false, umb: '' });

  // RemotePlayers: 가짜 프레즌스·오버레이·Scene 두 개
  const handlers = {};
  const presence = { on: (t, fn) => ((handlers[t] ||= []).push(fn), presence) };
  const emit = (t, m) => (handlers[t] || []).forEach((fn) => fn(m));
  const el = () => ({ textContent: '', className: '', style: {}, classList: { toggle() {}, contains: () => false } });
  const said = [];
  const overlay = { items: new Set(), add(o) { const it = { ...o, el: el(), hidden: false, zone: o.zone || '' }; this.items.add(it); return it; }, remove(it) { this.items.delete(it); }, onSay: (m) => said.push(m) };
  const outdoor = new THREE.Scene(), interior = new THREE.Scene();
  let mePos = new THREE.Vector3(100, 0, 100);
  const bursts = [];
  const R = new RemotePlayers(outdoor, overlay, presence, () => mePos, null, null, { burst: (pos, k) => bursts.push(k), spawnZzz() {} });
  emit('welcome', { id: 'me', peers: [
    { id: 'A', name: '바깥A', x: 101, z: 100, ry: 0 },
    { id: 'B', name: '역안B', x: encodeZone(Z, 2, 3).x, z: 3, ry: 0 }, // 이미 대합실에 있던 사람 (welcome 목록의 x,z 로 구역 유지)
  ] });
  const A = R.peers.get('A'), B = R.peers.get('B');
  assert.equal(A.zone, ''); assert.equal(B.zone, Z);
  assert.equal(A.mesh.parent, outdoor); assert.equal(A.mesh.visible, true);
  assert.equal(B.mesh.visible, false, '바깥에서는 역 안 사람이 안 보임'); assert.notEqual(B.tag.zone, '', '이름표도 숨김');
  assert.deepEqual(R.list().map((p) => p.id), ['A'], '바깥 시스템(문·고양이·미니맵)엔 같은 구역만');
  assert.deepEqual(R.list({ all: true }).map((p) => `${p.id}:${p.zone}`), ['A:', `B:${Z}`]);
  // 바깥에서 보는데 A 가 입구로 들어감 → 그 자리에서 가라앉고 사라짐
  emit('state', relay({ id: 'A', ...encodeZone(Z, -20, 9), ry: 1 }));
  assert.equal(A.zone, Z); assert.ok(A.fx?.down, '들어가는 연출');
  R.update(0.2); assert.ok(A.mesh.visible && A.mesh.position.y < 0 && Math.abs(A.mesh.position.x - 101) < 0.5, '입구 자리에서 내려감');
  for (let i = 0; i < 10; i++) R.update(0.1);
  assert.equal(A.fx, null); assert.equal(A.mesh.visible, false, '다 내려가면 안 보임');
  assert.deepEqual(R.list(), [], '역 안 사람은 바깥 목록에서 빠짐');
  // 다른 구역 채팅·리액션은 안 보임
  emit('chat', { id: 'A', text: '안녕' }); emit('emote', { id: 'A', kind: 'cheer', combo: 1 });
  assert.equal(said.length, 0); assert.equal(bursts.length, 0);
  // 나도 대합실로 → 같은 구역 사람이 대합실 Scene 에, 실내 좌표로
  mePos = new THREE.Vector3(-18, 0, 8);
  R.setZone(Z, interior);
  assert.equal(A.mesh.parent, interior); assert.equal(A.mesh.visible, true); assert.equal(A.tag.zone, Z);
  assert.equal(B.mesh.parent, interior);
  R.update(0.05); assert.ok(Math.abs(A.mesh.position.x + 20) < 1e-6 && Math.abs(A.mesh.position.z - 9) < 1e-6 && A.mesh.position.y === 0, '실내 좌표');
  emit('chat', { id: 'A', text: '안녕' }); emit('emote', { id: 'A', kind: 'cheer', combo: 1 });
  assert.equal(said.length, 1); assert.equal(said[0].text, '안녕'); assert.deepEqual(bursts, ['cheer'], '같은 구역은 말풍선·리액션');
  emit('chat', { id: 'B', text: '멀리' }); assert.equal(said.length, 2, 'B (2,3) 도 30m 안');
  // 바깥 사람 C(옛 클라이언트, zone 없음)가 접속해서 돌아다님 → 안 보임
  emit('join', { peer: { id: 'C', name: '옛클라', x: 5, z: 5 } });
  const C = R.peers.get('C');
  emit('state', relay({ id: 'C', x: -18, z: 8, ry: 0 })); // 우연히 실내 좌표와 같은 바깥 좌표여도
  assert.equal(C.zone, ''); assert.equal(C.mesh.visible, false); assert.equal(C.mesh.parent, outdoor);
  emit('chat', { id: 'C', text: '바깥말' }); assert.equal(said.length, 2, '바깥 사람 말은 역 안에서 안 들림');
  assert.deepEqual(R.list().map((p) => p.id).sort(), ['A', 'B']);
  // A 가 나감 (바깥 좌표) → 대합실에서 사라짐, 바깥 Scene 으로
  emit('state', relay({ id: 'A', x: 1, z: -72.7, ry: 0 }));
  assert.equal(A.zone, ''); assert.equal(A.mesh.visible, false); assert.equal(A.mesh.parent, outdoor); assert.equal(A.fx, null, '안에서 볼 때는 연출 없음');
  // 나도 나감 → 바깥 사람 보이고, 역 안 B 는 숨김
  mePos = new THREE.Vector3(0, 0, -70);
  R.setZone('', null);
  assert.equal(A.mesh.visible, true); assert.equal(C.mesh.visible, true); assert.equal(B.mesh.visible, false); assert.equal(B.mesh.parent, outdoor);
  // B 가 나오면 출구 앞에서 올라옴
  emit('state', relay({ id: 'B', x: 1, z: -72.7, ry: 0 }));
  assert.ok(B.fx && !B.fx.down); R.update(0.1); assert.ok(B.mesh.visible && B.mesh.position.y < 0, '올라오는 중');
  for (let i = 0; i < 10; i++) R.update(0.1);
  assert.equal(B.mesh.position.y, 0); assert.equal(B.fx, null);
  R.remove('A'); R.remove('B'); R.remove('C');
  assert.equal(outdoor.children.filter((o) => o.isObject3D && o.type !== 'Scene').length, 0, '나간 사람 메시 정리');
  assert.ok(STATE_HZ > 0);
}
// ---------- 코리더 역 (stationsData.js = scripts/subway/build-stations.mjs, OSM) ----------
{
  const corr = JSON.parse(fs.readFileSync('data/osm_subway_corridor.json', 'utf8')).elements;
  const byId = new Map(corr.map((e) => [e.type + e.id, e]));
  const index = JSON.parse(fs.readFileSync('public/corridor/index.json', 'utf8'));
  const center = data.meta.center;
  const want = ['정자', '수내', '서현', '이매', '야탑', '모란', '태평', '가천대', '복정', '문정', '가락시장', '송파', '석촌', '잠실'];
  assert.deepEqual(STATIONS.map((d) => d.name), want, '도훈 요청 14역 (장지는 요청에 없어 뺌)');
  const expectLines = { 정자: 'suin,shin', 수내: 'suin', 서현: 'suin', 이매: 'suin,gg', 야탑: 'suin', 모란: 'suin,l8', 태평: 'suin', 가천대: 'suin', 복정: 'suin,l8', 문정: 'l8', 가락시장: 'l8,l3', 송파: 'l8', 석촌: 'l8,l9', 잠실: 'l8,l2' };
  for (const d of STATIONS) {
    assert.equal(d.lines.join(','), expectLines[d.name], `${d.name} 노선`);
    // 노선 근거: osmRoutes 의 relation 이 실제로 그 ref 이고, 이 역 노드를 stop 으로 가짐
    for (const k of d.lines) {
      assert.ok(d.osmRoutes[k].length > 0);
      for (const rid of d.osmRoutes[k]) { const r = byId.get('relation' + rid); assert.ok(r, `rel ${rid}`); assert.equal(OSM_REF_TO_LINE[r.tags.ref], k); assert.equal(r.tags.colour?.toUpperCase(), LINES[k].osmColour, `${k} OSM colour`); }
    }
    assert.ok(LINE_ORDER.indexOf(d.lines[0]) <= Math.min(...d.lines.map((k) => LINE_ORDER.indexOf(k))));
    assert.ok(d.route.stops.includes(d.name), `${d.name} 노선도에 자기 역`);
    // 출구: OSM subway_entrance 노드, ref 그대로, 렌더링 영역 안, 역 중심 300m 안
    assert.ok(d.exits.length >= 1);
    const refs = new Set();
    for (const e of d.exits) {
      const n = byId.get('node' + e.osm); assert.ok(n && n.tags.railway === 'subway_entrance', `${d.name} ${e.ref} OSM`);
      assert.equal(n.tags.ref == null ? null : String(n.tags.ref), e.ref); assert.ok(Math.abs(n.lat - e.lat) < 1e-7 && Math.abs(n.lon - e.lon) < 1e-7);
      assert.ok(!refs.has(e.ref), `${d.name} ${e.ref} 중복`); refs.add(e.ref);
      const p = projectLatLon(center, e.lat, e.lon);
      assert.ok(Math.hypot(p.x - d.x, p.z - d.z) < 450, `${d.name} ${e.ref} 역에서 450m 안 (잠실 롯데 쪽 출구는 ~410m)`);
      if (d.id === 'jeongja') { assert.equal(e.place, undefined, '정자역은 런타임 배치 (기존 그대로)'); continue; }
      assert.ok(index.tiles[Math.floor(p.x / 500) + '_' + Math.floor(p.z / 500)], `${d.name} ${e.ref} 코리더 타일 안`);
      assert.ok(e.place && e.place.bad === 0 && e.place.shift <= 18, `${d.name} ${e.ref} 출입구 자리 (bad ${e.place?.bad})`);
      assert.ok(Math.hypot(e.place.x - p.x, e.place.z - p.z) <= 18.1);
    }
    if (d.id !== 'jeongja') { const ix = index.stations.find((s) => s.id === d.id); assert.ok(ix && ix.x === d.x && ix.z === d.z && ix.nameEn === d.nameEn, `${d.name} 코리더 역 중심`); }
  }
  // 정자역 데이터는 1단계 출구 목록과 같다
  assert.deepEqual(STATIONS[0].exits.map((e) => [e.ref, e.osm]), JEONGJA_EXITS.map((e) => [e.ref, e.osm]));
  // 테마: 정자역은 1단계 문자열 그대로
  assert.equal(JEONGJA_THEME.map.title, '수인분당선 · 신분당선 (간략)'); assert.equal(JEONGJA_THEME.ad.sub, '정자역에서 걸어서 3분');
  assert.deepEqual(JEONGJA_THEME.wells.map((w) => w.ko), WELLS.map((w) => w.ko), '정자 승강장 방면 = layout WELLS');
  assert.deepEqual(JEONGJA_THEME.wells.map((w) => w.en), WELLS.map((w) => w.en));
  assert.equal(JEONGJA_THEME.transfer.key, 'shin'); assert.equal(JEONGJA_THEME.zone, 'jeongja-station');
  const jam = stationTheme(STATIONS.find((d) => d.id === 'jamsil'));
  assert.equal(jam.primary.key, 'l8'); assert.equal(jam.transfer.key, 'l2'); assert.equal(jam.zone, 'jamsil-station'); assert.equal(jam.map.me, '잠실');
  assert.equal(stationTheme(STATIONS.find((d) => d.id === 'munjeong')).transfer, null, '문정 = 8호선만');
  // 코리더 출구 → 대합실 통로 (나침반 방위), id 는 역마다 다름
  const allIds = new Set();
  for (const d of STATIONS.slice(1)) {
    const ex = corridorExits(d, center);
    for (const e of ex) { assert.ok(!allIds.has(e.id)); allIds.add(e.id); assert.ok(['n', 'e', 's', 'w'].includes(e.dir.id)); assert.ok(e.place); }
    const g = groupExits(ex); assert.equal(g.reduce((n, x) => n + x.exits.length, 0), ex.length);
    const ps = g.map((x) => ({ ...passageFor(x.dir), exits: x.exits }));
    for (const p of ps) assert.ok(walkable(p.mouth.x + p.out.x * 3, p.mouth.z + p.out.z * 3, 0.3, { passages: ps }), `${d.name} ${p.dir} 통로`);
    const sc = createSubwayState({ exits: ex }); assert.ok(sc.enter(ex[0].id)); assert.equal(sc.enter('x1'), false, '다른 역 출구 id 로는 안 됨');
  }
  // 거리별 출입구 만들기/지우기 (히스테리시스)
  assert.equal(entranceLod(ENT_BUILD + 1, false), 'none'); assert.equal(entranceLod(ENT_BUILD - 1, false), 'build');
  assert.equal(entranceLod(ENT_DROP - 1, true), 'hide'); assert.equal(entranceLod(ENT_DROP + 1, true), 'drop'); assert.equal(entranceLod(ENT_SHOW - 1, true), 'show');
  assert.ok(ENT_SHOW < ENT_BUILD && ENT_BUILD < ENT_DROP);
  { const jd = STATIONS.find((d) => d.id === 'jamsil'); const r = stationReach(jd, corridorExits(jd, center)); assert.ok(r > 380 && r < 430, `잠실 reach ${r}`); }
}
// ---------- [gyeongbu] 서울 방면 준비 중 ----------
assert.equal(gyeongbuSoonAt(-446, -1800), true, '경부 북쪽 끝');
assert.equal(gyeongbuSoonAt(-446, -1600), false); assert.equal(gyeongbuSoonAt(0, -1900), false, '경부 아닌 곳');
assert.ok(GYEONGBU_SOON.z > -1834, '도로 끝(-1834)보다 앞에서');
console.log('subway: state · exits · entrance placement · concourse layout · zone presence · corridor stations · gyeongbu OK');
