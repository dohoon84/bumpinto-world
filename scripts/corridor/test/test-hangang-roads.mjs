// [hangang] 반포·잠수교 경로가 지형을 따르고 연속인지.
//   node scripts/corridor/test/test-hangang-roads.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hangangEnabled, hangangMini } from '../../../src/corridor/landmarks/hangang.js';
import { makeHangangHeightAt, measureHangangLevels, jamsuDeckY, banpoDeckY } from '../../../src/corridor/landmarks/hangangTerrain.js';
import { inWater, pointInRing, polylineLen, projectOnLine } from '../../../src/corridor/landmarks/hangangCoords.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const dem = J('public/corridor/hangang/hangang-dem.json');
const osm = J('public/corridor/hangang/hangang-osm.json');
const heightAt = makeHangangHeightAt(dem, osm);
const lv = measureHangangLevels(dem, osm);
let n = 0;
const ok = (s) => { n++; console.log('ok', n, s); };

{
  assert.equal(hangangEnabled(''), true);
  assert.equal(hangangEnabled('?hangang=0'), false);
  assert.equal(hangangEnabled('?ntower=0'), true);
  ok('?hangang=0 opt-out; on by default');
}

{
  assert.ok(osm.jamsu?.outline?.pts?.length >= 8, '잠수교 outline');
  assert.ok(osm.jamsu?.centerline?.pts?.length >= 2, '잠수교 centerline');
  assert.equal(osm.jamsu.osm, 'relation/11173732');
  assert.equal(osm.jamsu.distanceTag, '795 m');
  assert.ok((osm.jamsu.outline.widthEst || 0) > 3, `widthEst ${osm.jamsu.outline.widthEst}`);
  const cl = polylineLen(osm.jamsu.centerline.pts);
  assert.ok(cl > 700 && cl < 1200, `centerline ${cl}`);
  ok(`잠수교 outline ${osm.jamsu.outline.pts.length} pts, widthEst ${osm.jamsu.outline.widthEst} m, centerline ${cl.toFixed(1)} m`);
}

{
  assert.ok(osm.banpo?.outline?.pts?.length >= 20, '반포대교 outline');
  assert.equal(osm.banpo.osm, 'way/1085504592');
  assert.equal(osm.banpo.layer, '2');
  assert.equal(osm.banpo.heightTag, '3');
  assert.ok((osm.banpo.outline.widthEst || 0) > 12, `banpo width ${osm.banpo.outline.widthEst}`);
  ok(`반포대교 outline ${osm.banpo.outline.pts.length} pts, widthEst ${osm.banpo.outline.widthEst} m, OSM height=${osm.banpo.heightTag}`);
}

{
  assert.ok(osm.park?.ring?.pts?.length >= 50, '반포한강공원 ring');
  assert.equal(osm.park.osm, 'way/418249072');
  assert.ok(osm.seorae?.ring?.pts?.length >= 10, '서래섬');
  assert.ok((osm.water?.outers || []).length >= 1, '한강 water outer');
  assert.equal(osm.water.osm, 'relation/152336');
  ok(`공원 ${osm.park.ring.pts.length} pts, 서래섬, 한강 outer ${osm.water.outers.length} inner ${osm.water.inners.length}`);
}

{
  const names = new Set((osm.ways || []).map((w) => w.name).filter(Boolean));
  assert.ok(names.has('한강남자전거길'), '한강남자전거길');
  assert.ok(names.has('한강북자전거길'), '한강북자전거길');
  assert.ok(names.has('잠수교'), '잠수교 way');
  assert.ok((osm.ways || []).some((w) => (w.name || '').includes('나들목')), '나들목');
  ok(`cycleways include 한강남/북 + 잠수교 + 나들목 (${osm.ways.length} ways)`);
}

{
  assert.ok(lv.waterSamples >= 20, `water samples ${lv.waterSamples}`);
  assert.ok(lv.waterEle > 0 && lv.waterEle < 20, `waterEle ${lv.waterEle}`);
  const ends = osm.connectEnds;
  const js = ends.jamsuSouth, jn = ends.jamsuNorth;
  assert.ok(js && jn, 'jamsu ends');
  const yS = jamsuDeckY(js.x, js.z, osm, lv);
  const yN = jamsuDeckY(jn.x, jn.z, osm, lv);
  const mid = { x: (js.x + jn.x) / 2, z: (js.z + jn.z) / 2 };
  const yM = jamsuDeckY(mid.x, mid.z, osm, lv);
  assert.ok(yM > lv.waterY + 1.5, `잠수교 mid ${yM} not above water ${lv.waterY}`);
  const bM = banpoDeckY(mid.x, mid.z, osm, lv, heightAt);
  assert.ok(bM > yM + 4, `반포대교 ${bM} should sit above 잠수교 ${yM}`);
  ok(`water ele ${lv.waterEle.toFixed(1)} (y=${lv.waterY.toFixed(1)}); 잠수교 y ${yS.toFixed(1)}..${yM.toFixed(1)}..${yN.toFixed(1)}; 반포 mid ${bM.toFixed(1)}`);
}

function resample2(pts, step = 4) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [[pts[0][0], pts[0][1]]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let ax = out[out.length - 1][0], az = out[out.length - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    let dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    while (acc + L >= step) {
      const t = (step - acc) / L;
      ax += dx * t; az += dz * t;
      out.push([ax, az]);
      dx = bx - ax; dz = bz - az; L = Math.hypot(dx, dz);
      acc = 0;
    }
    acc += L;
  }
  const last = pts[pts.length - 1];
  const p = out[out.length - 1];
  if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.3) out.push([last[0], last[1]]);
  return out;
}

{
  const bikes = (osm.ways || []).filter((w) => w.k === 'cycleway' || (w.name || '').includes('자전거') || w.name === '잠수교');
  assert.ok(bikes.length >= 10, `bike ways ${bikes.length}`);
  let samples = 0, maxGap = 0, gaps = 0;
  for (const w of bikes) {
    const pts = resample2(w.pts, 5);
    let prev = null;
    for (const [x, z] of pts) {
      const onJamsu = osm.jamsu?.outline?.pts && pointInRing(x, z, osm.jamsu.outline.pts);
      const nearJamsu = osm.jamsu?.centerline?.pts && (projectOnLine(x, z, osm.jamsu.centerline.pts)?.dist || 99) < 8;
      const y = (onJamsu || nearJamsu)
        ? jamsuDeckY(x, z, osm, lv)
        : heightAt(x, z);
      assert.ok(y == null || Number.isFinite(y), `NaN on ${w.name || w.id}`);
      if (y == null) { prev = null; continue; }
      // 경로가 수면 아래로 가라앉으면 안 됨
      assert.ok(y > lv.waterY - 0.2, `sank below water on ${w.name || w.id}: y=${y} water=${lv.waterY}`);
      if (prev) {
        const L = Math.hypot(x - prev.x, z - prev.z) || 1;
        const dy = Math.abs(y - prev.y);
        if (dy > maxGap) maxGap = dy;
        const limit = w.k === 'steps' ? 3.4 : 4.5;
        if (dy > limit) gaps++;
        assert.ok(dy <= limit + 0.01, `gap ${dy.toFixed(2)} over ${L.toFixed(1)}m on ${w.name || w.id}`);
      }
      prev = { x, z, y };
      samples++;
    }
  }
  ok(`${bikes.length} bike/walk-cycle ways, ${samples} samples, max step ${maxGap.toFixed(2)} m, over-limit ${gaps}`);
}

{
  const cl = resample2(osm.jamsu.centerline.pts, 4);
  let prev = null;
  for (const [x, z] of cl) {
    const y = jamsuDeckY(x, z, osm, lv);
    assert.ok(Number.isFinite(y), 'jamsu deck NaN');
    if (prev) {
      const dy = Math.abs(y - prev);
      assert.ok(dy < 1.2, `잠수교 deck jump ${dy}`);
    }
    prev = y;
  }
  ok(`잠수교 centerline continuous (${cl.length} samples)`);
}

{
  const ends = osm.connectEnds || {};
  for (const key of ['banpoEast', 'banpoWest', 'yongsanEast', 'yongsanWest', 'jamsuSouth', 'jamsuNorth']) {
    assert.ok(ends[key] && Number.isFinite(ends[key].x) && Number.isFinite(ends[key].z), key);
  }
  // 동단은 탄천/잠실 쪽(x 가 더 큼), 북단 잠수교는 남단보다 z 가 더 북쪽(더 작음)
  assert.ok(ends.banpoEast.x > ends.banpoWest.x, 'east of west');
  assert.ok(ends.jamsuNorth.z < ends.jamsuSouth.z, 'north of south');
  ok(`connect ends ready: east ${ends.banpoEast.x},${ends.banpoEast.z} · north-bank east ${ends.yongsanEast.x},${ends.yongsanEast.z}`);
}

{
  const mini = hangangMini(osm);
  assert.ok(mini.roads.length >= 8, `mini roads ${mini.roads.length}`);
  assert.ok((mini.parks || []).length >= 1, 'mini parks');
  assert.ok((mini.water || []).length >= 1, 'mini water');
  ok(`hangangMini roads ${mini.roads.length}, parks ${mini.parks.length}, water ${mini.water.length}`);
}

{
  assert.equal(osm.routes.hangangJongju.osm, 'relation/8280682');
  assert.equal(osm.routes.hangangJongju.network, 'ncn');
  assert.equal(osm.routes.tancheonBike.osm, 'relation/27411');
  ok('route relations recorded: 한강 종주 ncn + 탄천 rcn');
}

{
  // DEM 이 지형을 덮고, 끝점이 그리드 안에 있다
  const e = osm.connectEnds;
  for (const k of ['jamsuSouth', 'jamsuNorth', 'banpoEast', 'yongsanWest']) {
    const p = e[k];
    const y = heightAt(p.x, p.z);
    assert.ok(y != null && Number.isFinite(y), `${k} outside DEM ${p.x},${p.z}`);
  }
  ok(`DEM covers connect ends; grid ${dem.nx}×${dem.nz}, ele ${dem.eleMin}–${dem.eleMax}`);
}

console.log(`\n${n} checks passed`);
