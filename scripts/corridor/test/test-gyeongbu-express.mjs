// [gyeongbu-bus] 9004·1151 본선 120km/h, ETA, 시간표, 버스전용차로, gangnambus=0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gangnamBusEnabled } from '../../../src/corridor/gangnamBus.js';
import { GYEONGGI_BUS_CREDIT, gyeongbuExpressEnabled } from '../../../src/corridor/gyeongbuExpress.js';
import { SEOUL_TG, seoulTollEnabled } from '../../../src/world/seoulToll.js';
import { cheonggyeTerrainEnabled } from '../../../src/corridor/cheonggyeTerrain.js';
import { rideStops, isGameStop, isPassStop } from '../../../src/subway/ride.js';
import { STATIONS } from '../../../src/subway/roster.js';
import {
  speedMs, rideSpeedMs, travelSeconds, nextExpress, headwayMin, carLaneIndex, busLaneIndex, MS_TO_KMH,
} from '../../../src/corridor/gyeongbuSpeed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const J = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gangnam/gyeongbu-express.json'), 'utf8'));
const drive = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/drive.json'), 'utf8'));
const r9004 = J.routes.find((r) => r.no === '9004');
const r1151 = J.routes.find((r) => r.no === '1151');
const mid = (J.main0 + J.main1) / 2;
const cruise = speedMs(mid, J) * MS_TO_KMH;
assert.ok(Math.abs(cruise - 120) < 1, `본선 ${cruise.toFixed(2)} km/h`);
assert.equal(rideSpeedMs(J, mid), speedMs(mid, J));
assert.ok(Math.abs(speedMs(0, J) * MS_TO_KMH - 50) < 1, '도시 구간은 50 km/h');
const atJoin = speedMs(J.main0, J) * MS_TO_KMH;
assert.ok(atJoin > 55 && atJoin < 115, `램프 중간 ${atJoin.toFixed(1)}`);

const from = r1151.stops.find((s) => s.name.startsWith('판교역.낙생육교'));
const to = r1151.stops.find((s) => s.name.startsWith('신분당선강남역'));
const eta = travelSeconds(J, from.s, to.s);
const etaFine = travelSeconds(J, from.s, to.s, 8);
assert.ok(Math.abs(eta - etaFine) < 3, `적분 차이 ${Math.abs(eta - etaFine).toFixed(2)}s`);
assert.ok(Math.abs(eta - J.eta.seconds) < 3, `표기 ${J.eta.seconds} 계산 ${eta.toFixed(1)}`);
assert.equal(J.eta.from, from.name);

assert.equal(r9004.timetable.weekday.first, '05:00');
assert.equal(r9004.timetable.weekday.last, '23:20');
assert.equal(r9004.timetable.weekday.firstFromGangnam, '05:30');
assert.equal(r9004.timetable.weekday.lastFromGangnam, '00:00');
assert.equal(r1151.timetable.weekday.first, '05:20');
assert.equal(r1151.timetable.weekday.last, '23:00');
assert.equal(r1151.timetable.weekday.firstFromGangnam, '06:20');
assert.equal(r1151.timetable.weekday.lastFromGangnam, '00:00');
assert.equal(headwayMin(r9004.timetable.weekday, 8 * 60), 5);
assert.equal(headwayMin(r9004.timetable.weekday, 14 * 60), 20);
assert.equal(headwayMin(r1151.timetable.weekday, 8 * 60), 1);
assert.equal(headwayMin(r1151.timetable.holiday, 14 * 60), 12);
assert.equal(nextExpress(r9004.timetable.weekday, 5 * 60).label, '05:00');
assert.equal(nextExpress(r1151.timetable.weekday, 5 * 60 + 20).label, '05:20');
assert.equal(nextExpress(r9004.timetable.weekday, 14 * 60, { fromGangnam: true }).label.length, 5);
for (const r of J.routes) for (const s of r.stops) assert.equal(/미정차|경유/.test(s.name), false, s.name);
assert.ok(r1151.stops.some((s) => s.name.startsWith('판교역.낙생육교')));
assert.ok(r9004.stops.some((s) => s.name.startsWith('강남역5번출구')));

const gyeongbu = drive.ways.filter((w) => w.name === '경부고속도로');
assert.ok(gyeongbu.length >= 1);
for (const w of gyeongbu) {
  const bus = busLaneIndex(w.lanes);
  const lw = w.w / w.lanes;
  const busOff = w.w / 2 - (bus + 0.5) * lw;
  for (let li = 0; li < w.lanes; li++) {
    const use = carLaneIndex(w.lanes, li);
    assert.notEqual(use, bus, `경부 버스전용차로 ${bus}`);
    const off = w.w / 2 - (use + 0.5) * lw;
    assert.ok(Math.abs(off - busOff) > 0.5);
  }
}

assert.equal(gangnamBusEnabled('?gangnambus=0'), false);
assert.equal(gangnamBusEnabled('?gangnam=0'), false);
assert.equal(gyeongbuExpressEnabled(''), true);
assert.equal(gyeongbuExpressEnabled('?expressbus=0'), false);
assert.equal(gyeongbuExpressEnabled('?gangnambus=0'), false);
assert.equal(J.meta.attribution, GYEONGGI_BUS_CREDIT);
assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes(GYEONGGI_BUS_CREDIT));
assert.ok(fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').includes('GYEONGGI_BUS_CREDIT'));
assert.ok(fs.readFileSync(path.join(root, 'src/corridor/index.js'), 'utf8').includes('get(GYEONGBU_EXPRESS_FILE)'));
assert.ok(fs.readFileSync(path.join(root, 'src/corridor/gyeongbuExpress.js'), 'utf8').includes("createBus(no, 'express'"));

assert.equal(seoulTollEnabled(''), true);
assert.equal(seoulTollEnabled('?seoultg=0'), false);
const live = JSON.parse(fs.readFileSync(path.join(root, 'public/drive.json'), 'utf8'));
const gy = live.ways.filter((w) => w.name === '경부고속도로');
assert.ok(gy.length >= 1);
let near = Infinity;
for (const w of gy) for (const ni of w.n || []) {
  const n = live.nodes[ni];
  const d = Math.hypot(n[0] - SEOUL_TG.x, n[1] - SEOUL_TG.z);
  if (d < near) near = d;
}
assert.ok(near < 25, `서울TG가 경부에서 ${near.toFixed(1)}m`);
assert.equal(cheonggyeTerrainEnabled(''), true);
assert.equal(cheonggyeTerrainEnabled('?cgterrain=0'), false);
const dem = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gyeongbu/cheonggye-dem.json'), 'utf8'));
assert.equal(dem.h.length, dem.nx * dem.nz);
assert.ok(Math.max(...dem.h) > 400, '청계산 DEM peak');
assert.ok(dem.road.length > 40);
const PANGYO_TG = { x: -482.05, z: -3232.35 };
let tgNear = Infinity;
for (const p of J.pts) {
  if (p[3] !== 'approach') continue;
  const d = Math.hypot(p[0] - PANGYO_TG.x, p[1] - PANGYO_TG.z);
  if (d < tgNear) tgNear = d;
}
assert.ok(tgNear < 25, `판교TG가 접근로에서 ${tgNear.toFixed(1)}m`);
assert.ok(fs.readFileSync(path.join(root, 'src/corridor/pangyoExpress.js'), 'utf8').includes('makePangyoTollSigns'));
const gySrc = fs.readFileSync(path.join(root, 'src/corridor/gyeongbuExpress.js'), 'utf8');
assert.ok(gySrc.includes('function expresswayDeck'));
assert.ok(gySrc.includes('gyeongbuGrassApron'));
assert.ok(gySrc.includes('gyeongbuDirectionSigns'));
assert.ok(gySrc.includes('서울') && gySrc.includes('양재') && gySrc.includes('강남'));
const bld = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gyeongbu/cheonggye-buildings.json'), 'utf8'));
assert.ok(bld.buildings.length > 40, 'OSM 청계산입구 건물');
assert.ok(bld.entrances.length >= 2, '신분당선 출입구');
assert.ok(bld.entrances.every((e) => e.osm && e.lat && e.lon && e.ref), '출입구는 OSM 노드 좌표·ref');
assert.deepEqual(bld.entrances.map((e) => e.ref).sort(), ['1', '2']);
assert.ok(bld.buildings.every((b) => b.o?.length >= 4 && b.h > 0));
const srcT = fs.readFileSync(path.join(root, 'src/corridor/cheonggyeTerrain.js'), 'utf8');
assert.ok(srcT.includes('buildingMeshes'));
assert.ok(srcT.includes('cheonggyeBarrierPanels'));
assert.ok(srcT.includes('cheonggyeStationSign'));
assert.ok(srcT.includes('청계산입구'));
assert.ok(srcT.includes('지하철 시스템'));
assert.ok(srcT.includes('cheonggyeLocalStreets'));
assert.ok(srcT.includes('cheonggyeBusStop'));
assert.ok(!srcT.includes('4.55, 1.42') && !srcT.includes('PlaneGeometry(4.55'), '큰 두 기둥 간판을 키 높이 폴 사인으로 줄였다');
const streets = JSON.parse(fs.readFileSync(path.join(root, 'public/corridor/gyeongbu/cheonggye-streets.json'), 'utf8'));
assert.ok(streets.roads.some((r) => r.name === '청계산로' && r.k === 'tertiary'));
assert.ok(streets.roads.some((r) => r.name === '원터길'));
assert.ok(streets.crossings.some((c) => c.k === 'zebra'));
assert.ok(streets.stops.some((s) => s.ref === '22401' && s.name === '청계산입구역'));
assert.ok(srcT.includes('dressBuildingList') && srcT.includes('호텔'));
assert.ok(gySrc.includes('gyeongbuGangnamSeam'));
const pangyoSrc = fs.readFileSync(path.join(root, 'src/corridor/pangyoExpress.js'), 'utf8');
assert.ok(pangyoSrc.includes('export function pangyoTollLayout'));
assert.ok(pangyoSrc.includes('laneClear = 3.9'));
assert.ok(!/sign-toll\.png.*DoubleSide/.test(pangyoSrc));
const seoulSrc = fs.readFileSync(path.join(root, 'src/world/seoulToll.js'), 'utf8');
assert.ok(!seoulSrc.includes('i * 9.5'));
assert.ok(!/sign-toll\.png.*DoubleSide/.test(seoulSrc));
assert.ok(fs.readFileSync(path.join(root, 'src/transit/busModel.js'), 'utf8').includes('coach3'));

assert.ok(STATIONS.some((s) => s.id === 'pangyo' && s.lines.includes('shin') && s.lines.includes('gg') && s.exits.length === 4));
assert.ok(STATIONS.some((s) => s.id === 'cheonggyesan' && s.name === '청계산입구' && s.exits.length === 2));
assert.equal(isGameStop('shin', '판교'), true);
assert.equal(isGameStop('shin', '청계산입구'), true);
assert.equal(isGameStop('gg', '판교'), true);
assert.equal(isPassStop('shin', '판교'), false);
assert.equal(isPassStop('shin', '청계산입구'), false);
const shinToSinsa = rideStops('shin', 1, '정자');
assert.ok(shinToSinsa.find((r) => r.name === '판교' && r.game && !r.pass));
assert.ok(shinToSinsa.find((r) => r.name === '청계산입구' && r.game && !r.pass));
assert.ok(shinToSinsa.find((r) => r.name === '강남' && r.game));
assert.deepEqual(rideStops('shin', 0, '판교').filter((r) => r.game).map((r) => r.id), ['jeongja', 'migeum']);
assert.equal(rideStops('shin', 1, '판교').at(-1).id, 'gangnam');

console.log(`gyeongbu express: ${cruise.toFixed(0)} km/h, 판교→강남 ${Math.round(eta)}s, cars off bus lane OK, 서울TG ${near.toFixed(0)}m`);
