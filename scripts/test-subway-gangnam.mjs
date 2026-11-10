// [gangnam] 강남역 지하철: 플래그 · 기존 역 오프셋 그대로 · 정자/미금·잠실↔강남 · 출구 1–12 = OSM · 구역 121..125 · 실시간 없으면 시간표 근사
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectLatLon } from '../src/subway/exits.js';

const ON = process.env.GANGNAM !== '0' && process.env.GANGNAMSUB !== '0';
const { gangnamSubEnabled, STATIONS, STATIONS_BASE, EXT_STATIONS } = await import('../src/subway/roster.js');
const { STATIONS: ALL, LINE_STOPS } = await import('../src/subway/stationsData.js');
const R = await import('../src/subway/ride.js');
const { ZONES, zoneSlot } = await import('../src/net/zones.js');
const { ALLOWED, subwayArrival } = await import('../server/phone/src/subway.js');
const { createArrivalFeed, simulatedRows } = await import('../src/subway/arrivals.js');
const { stationTheme } = await import('../src/subway/stations.js');
const { GAP_STOPS } = await import('../src/subway/stopCoords.js');

assert.equal(gangnamSubEnabled('?gangnamsub=0'), false);
assert.equal(gangnamSubEnabled('?gangnam=0'), false);
assert.equal(gangnamSubEnabled('?gangnam=0&gangnamsub=1'), false);
assert.equal(gangnamSubEnabled(''), true);
assert.equal(STATIONS_BASE.length, 15);
assert.equal(STATIONS.some((d) => d.id === 'gangnam'), ON);
assert.equal(EXT_STATIONS.some((d) => d.id === 'gangnam'), ON);
assert.deepEqual(STATIONS.filter((d) => !d.ext).map((d) => d.id), STATIONS_BASE.map((d) => d.id));

const base = JSON.parse(fs.readFileSync(new URL('./fixtures/subway-line-offsets-base.json', import.meta.url), 'utf8'));
const now = {};
for (const l of Object.keys(LINE_STOPS)) for (const d of [0, 1]) now[`${l}-${d}`] = Object.fromEntries(R.lineOffsets(l, d));
const gapNames = new Set(Object.keys(GAP_STOPS));
const diff = [];
for (const [k, m] of Object.entries(base)) for (const [s, v] of Object.entries(m)) if (now[k][s] !== v) diff.push(`${k}:${s}`);
const extra = diff.filter((k) => {
  const name = k.slice(k.indexOf(':') + 1);
  if (name === '미금' || name === '강남') return false;
  if (ON && gapNames.has(name)) return false; // 강남으로 가는 게임 밖 역만 실거리로 바뀜
  return true;
});
assert.deepEqual(extra, [], '기존 게임 역 오프셋 그대로 ' + extra.join(','));
if (!ON) assert.ok(!diff.some((k) => k.endsWith(':강남') || [...gapNames].some((n) => k.endsWith(':' + n))), '꺼지면 강남 구간 오프셋도 예전 값');

const G = ALL.find((d) => d.id === 'gangnam');
assert.equal(G.nameEn, 'Gangnam'); assert.deepEqual(G.lines, ['l2', 'shin']); assert.equal(G.ext, 'gangnam');
assert.deepEqual(G.exits.map((e) => e.ref), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
const raw = JSON.parse(fs.readFileSync(new URL('../data/osm_gangnam_raw.json', import.meta.url), 'utf8')).elements;
const ent = new Map(raw.filter((e) => e.type === 'node' && e.tags?.railway === 'subway_entrance').map((e) => [e.id, e]));
const center = JSON.parse(fs.readFileSync(new URL('../public/jeongja.json', import.meta.url), 'utf8')).meta.center;
for (const e of G.exits) {
  const o = ent.get(e.osm); assert.ok(o, e.ref); assert.equal(o.tags.ref, e.ref); assert.equal(o.lat, e.lat); assert.equal(o.lon, e.lon);
  assert.equal(e.place.bad, 0, e.ref);
  const p = projectLatLon(center, e.lat, e.lon);
  assert.ok(Math.hypot(e.place.x - p.x, e.place.z - p.z) < 20, `출구 ${e.ref} OSM에서 ${Math.hypot(e.place.x - p.x, e.place.z - p.z).toFixed(1)}m`);
}
for (const id of G.osmStations) assert.ok(raw.some((e) => e.id === id && e.tags?.name === '강남' && e.tags['name:en'] === 'Gangnam'));

assert.deepEqual(ZONES.slice(121), ['gangnam-station', 'gangnam-station/p-l2-0', 'gangnam-station/p-l2-1', 'gangnam-station/p-shin-0', 'gangnam-station/p-shin-1']);
assert.equal(zoneSlot(R.platformZone('gangnam', 'l2', 0)), 122);
assert.equal(zoneSlot(R.platformZone('gangnam', 'shin', 1)), 125);
assert.equal(ZONES.length, 126);

if (ON) {
  const shin = R.rideStops('shin', 1, '정자');
  assert.equal(shin.at(-1).id, 'gangnam');
  assert.ok(shin.filter((q) => !q.game).map((q) => q.name).join() === '판교,청계산입구,양재시민의숲,양재');
  assert.deepEqual(shin.filter((q) => q.pass).map((q) => q.name), ['판교', '청계산입구', '양재시민의숲', '양재']);
  for (const q of shin.filter((s) => s.pass)) assert.equal(R.alightAllowed(q), false, q.name);
  assert.equal(R.alightAllowed(shin.at(-1)), true, '강남에서는 내린다');
  const passSay = R.announce('noAlight', { name: '양재', pass: true });
  assert.ok(passSay.ko.includes('통과 — 준비 중인 역') && !/[가-힣]/.test(passSay.ja));
  assert.ok(R.announce('next', { name: '강남', nameEn: 'Gangnam', opening: true }).ko.includes('강남 개통'));
  const back = R.rideStops('shin', 0, '강남');
  assert.ok(back.some((q) => q.id === 'jeongja') && back.at(-1).id === 'migeum');
  const l2 = R.rideStops('l2', 0, '잠실');
  assert.equal(l2.at(-1).id, 'gangnam');
  assert.deepEqual(l2.filter((q) => !q.game).map((q) => q.name), ['잠실새내', '종합운동장', '삼성', '선릉', '역삼']);
  assert.ok(l2.filter((q) => q.pass).every((q) => R.alightAllowed(q) === false));
  assert.deepEqual(l2.filter((q) => q.pass).map((q) => q.name), ['잠실새내', '종합운동장', '삼성', '선릉', '역삼']);
  assert.equal(R.alightAllowed(l2.at(-1)), true);
  const back2 = R.rideStops('l2', 1, '강남');
  assert.equal(back2.at(-1).id, 'jamsil');
  // 게임 밖 구간은 OSM 좌표. 정자→판교는 1.2km 가 아니다.
  const d = R.segmentDist('정자', '판교');
  const a = GAP_STOPS['판교'];
  assert.ok(Math.abs(d - Math.hypot(a.x, a.z)) < 1e-6 && d > 2000, `정자-판교 ${d}`);
  assert.equal(R.segmentDist('모란', '수진'), 1200, '표에 없는 구간은 1.2km');
  const seg = R.rideTimeline('정자', shin);
  const gang = seg.find((s) => s.id === 'gangnam');
  const offJ = R.stationOffsetSec('shin', 1, 'jeongja'), offG = R.stationOffsetSec('shin', 1, 'gangnam');
  assert.ok(Math.abs(offG - offJ - gang.arr) < 0.05, `승강장 오프셋 ${offG - offJ} vs 타임라인 ${gang.arr}`);
  const seg2 = R.rideTimeline('잠실', l2);
  const g2 = seg2.find((s) => s.id === 'gangnam');
  const oL = R.stationOffsetSec('l2', 0, 'jamsil'), oG = R.stationOffsetSec('l2', 0, 'gangnam');
  assert.ok(Math.abs(oG - oL - g2.arr) < 0.05, `잠실 오프셋 ${oG - oL} vs ${g2.arr}`);
  assert.ok(gang.arr > 120 && g2.arr > 120, '구간이 1.2km×칸수보다 OSM 거리로 더 김');
  const theme = stationTheme(G);
  assert.equal(theme.nameEn, 'Gangnam'); assert.equal(theme.primary.key, 'l2'); assert.equal(theme.transfer.key, 'shin');
  assert.equal(theme.lines[0].en, 'Line 2'); assert.equal(theme.lines[1].en, 'Shinbundang Line');
}

assert.ok(ALLOWED.includes('강남'));
{
  const url = new URL('https://w.example/subway/arrival?station=' + encodeURIComponent('강남'));
  const r = await subwayArrival(new Request(url), {}, {}, url, { waitUntil: (p) => p });
  assert.equal(r.status, 200); assert.equal((await r.json()).reason, 'no_key');
}
{
  const th = stationTheme(G); const t = Date.UTC(2026, 10, 8, 6, 0, 0);
  const old = createArrivalFeed({ theme: th, base: 'https://w.example', now: () => t, fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: 'unknown_station' }), { status: 400 }) });
  await old._poll(); const g = old.get();
  assert.equal(g.live, false); assert.deepEqual(g.rows, simulatedRows(th, t, th.id));
  assert.ok(g.rows.some((row) => row.line === 'l2') && g.rows.some((row) => row.line === 'shin'));
}

// 좌표 표 = OSM 투영
for (const [name, s] of Object.entries(GAP_STOPS)) {
  const p = projectLatLon(center, s.lat, s.lon);
  assert.equal(p.x, s.x, name); assert.equal(p.z, s.z, name);
}

if (!ON) {
  assert.equal(R.isPassStop('shin', '양재'), false);
  assert.equal(R.isPassStop('l2', '역삼'), false);
}
if (!process.env.GANGNAM_CHILD) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, GANGNAM_CHILD: '1', GANGNAMSUB: ON ? '0' : '1' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
}
console.log(`subway gangnam (${ON ? 'on' : 'off'}): exits 1–12 OSM · zones 121..125 · 정자/잠실↔강남 · worker no_key → sim OK`);
