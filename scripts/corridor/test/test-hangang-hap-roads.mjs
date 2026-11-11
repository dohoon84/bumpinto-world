// [hangang] 2구간 연속성: 기존 탄천 북단 → 합수부 → banpoEast.
//   node scripts/corridor/test/test-hangang-hap-roads.mjs
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hangangEnabled } from '../../../src/corridor/landmarks/hangang.js';
import { makeHangangHeightAt, measureHangangLevels, blendOffset, waterYAt } from '../../../src/corridor/landmarks/hangangTerrain.js';
import { inWater, polylineLen } from '../../../src/corridor/landmarks/hangangCoords.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const hapOsm = J('public/corridor/hangang/hap-osm.json');
const hapDem = J('public/corridor/hangang/hap-dem.json');
const hanOsm = J('public/corridor/hangang/hangang-osm.json');
const heightAt = makeHangangHeightAt(hapDem, hapOsm);
const lv = measureHangangLevels(hapDem, hapOsm);
const blend = hapOsm.meta?.datumBlend;
let n = 0;
const ok = (s) => { n++; console.log('ok', n, s); };

{
  assert.equal(hangangEnabled(''), true);
  assert.equal(hangangEnabled('?hangang=0'), false);
  ok('?hangang=0 opt-out still covers hap (same flag)');
}

{
  assert.equal(hapOsm.meta?.segment, 'hap');
  assert.ok(hapOsm.meta?.datumBlend?.offset0 > 30, 'datumBlend offset0');
  assert.ok(Number.isFinite(hapOsm.meta.datumBlend.offsetSouth), 'offsetSouth from measured eleJoin');
  assert.ok(hapOsm.meta.datumBlend.eleJoin > 10 && hapOsm.meta.datumBlend.eleJoin < 30, `eleJoin ${hapOsm.meta.datumBlend.eleJoin}`);
  assert.equal(hapOsm.water?.han?.osm, 'relation/152336');
  assert.ok((hapOsm.water?.outers || []).length >= 2, '한강+탄천 outers');
  const han = hapOsm.water.outers[0];
  assert.ok((han.ids || []).includes(469332612), '한강 assembled from full relation members');
  ok(`water outers ${hapOsm.water.outers.length} (한강 assembled ${ (han.ids || []).length } ways), parks ${(hapOsm.parks || []).map((p) => p.name).join(', ')}`);
}

{
  const names = new Set((hapOsm.ways || []).map((w) => w.name).filter(Boolean));
  assert.ok(names.has('탄천 자전거길') || names.has('탄천 자전거도로'), '탄천 bike');
  assert.ok(names.has('한강남자전거길'), '한강남자전거길');
  assert.ok(names.has('올림픽대로'), '올림픽대로');
  assert.ok([...names].some((n) => n.includes('나들목')), '나들목');
  const br = new Set((hapOsm.bridges || []).map((b) => b.name));
  for (const need of ['잠실대교', '청담대교', '영동대교', '성수대교', '동호대교', '한남대교']) {
    assert.ok(br.has(need), need);
  }
  assert.ok(!(hapOsm.bridges || []).some((b) => b.name === '반포대교' || b.name === '잠수교'), 'no 반포/잠수교 redraw');
  ok(`named bridges ${[...br].join(', ')}; ways ${hapOsm.ways.length}`);
}

{
  const hap = hapOsm.spawns?.['tancheon-hap'];
  const jam = hapOsm.spawns?.jamwon;
  assert.ok(hap && Number.isFinite(hap.x) && Number.isFinite(hap.z), 'tancheon-hap spawn');
  assert.ok(jam && Number.isFinite(jam.x) && Number.isFinite(jam.z), 'jamwon spawn');
  const banpo = hanOsm.connectEnds?.banpoEast;
  assert.ok(banpo && Math.hypot(banpo.x + 8923.9, banpo.z + 16698.7) < 0.2, '1구간 banpoEast unchanged');
  ok(`spawns hap (${hap.x}, ${hap.z}) jamwon (${jam.x}, ${jam.z}); 1구간 banpoEast intact`);
}

function resample(pts, step = 3.0) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    let ax = out[out.length - 1][0], az = out[out.length - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    let dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    while (L > step) {
      const t = step / L;
      ax += dx * t; az += dz * t;
      out.push([ax, az]);
      dx = bx - ax; dz = bz - az; L = Math.hypot(dx, dz);
    }
  }
  const last = pts[pts.length - 1];
  const p = out[out.length - 1];
  if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.3) out.push([last[0], last[1]]);
  else { p[0] = last[0]; p[1] = last[1]; }
  return out;
}

{
  const start = hapOsm.connectEnds.tancheonSouth;
  const end = hapOsm.connectEnds.banpoEast;
  assert.ok(start && end, 'connect ends');
  assert.ok(Math.hypot(start.x - 32.2, start.z + 13552) < 0.2, 'start is existing 탄천 자전거도로 north end');
  assert.ok(Math.hypot(end.x + 8923.9, end.z + 16698.7) < 0.2, 'end is banpoEast');
  const spine = hapOsm.spine;
  assert.ok(spine && spine.length >= 50, `spine pts ${spine?.length}`);
  const d0 = Math.hypot(spine[0][0] - start.x, spine[0][1] - start.z);
  const d1 = Math.hypot(spine[spine.length - 1][0] - end.x, spine[spine.length - 1][1] - end.z);
  assert.ok(d0 < 2.0, `spine start ${d0} from 탄천 end`);
  assert.ok(d1 < 2.0, `spine end ${d1} from banpoEast`);

  let rawMax = 0;
  for (let i = 1; i < spine.length; i++) {
    const d = Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]);
    if (d > rawMax) rawMax = d;
  }
  // OSM vertices can sit 100–300 m apart on a straight bank; a jump (unconnected stitch)
  // would be flagged below as a river shortcut or a missing height sample.
  assert.ok(rawMax < 400, `raw max segment ${rawMax}`);

  const samples = resample(spine, 3.0);
  const GAP = 3.6;
  const JUMP_Y = 2.8;
  let maxGap = 0, maxDy = 0, floatN = 0, wetN = 0, missN = 0;
  const ys = [];
  for (let i = 0; i < samples.length; i++) {
    const [x, z] = samples[i];
    const y = heightAt(x, z);
    const wy = waterYAt(x, z, lv, blend);
    if (y == null) { missN++; continue; }
    ys.push(y);
    if (y < wy - 0.35) floatN++;
    if (inWater(x, z, hapOsm.water) && y <= wy + 0.15) wetN++;
    if (i > 0) {
      const gap = Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]);
      if (gap > maxGap) maxGap = gap;
      const prevY = heightAt(samples[i - 1][0], samples[i - 1][1]);
      if (prevY != null) {
        const dy = Math.abs(y - prevY);
        if (dy > maxDy) maxDy = dy;
      }
    }
  }
  assert.ok(maxGap <= GAP, `resampled gap ${maxGap} > ${GAP}`);
  assert.ok(maxDy <= JUMP_Y, `max |dy| ${maxDy} > ${JUMP_Y}`);
  assert.equal(missN, 0, `missing heightAt ${missN}`);
  assert.ok(floatN <= 2, `below-water (floating/sunk) samples ${floatN}`);
  assert.ok(wetN <= 8, `spine sitting in water ${wetN}`);
  const y0 = heightAt(start.x, start.z);
  assert.ok(y0 != null && Math.abs(y0 - (-6.2)) < 1.6, `south join y ${y0} should be near corridor −6`);
  const yB = heightAt(end.x, end.z);
  const yBoff = blendOffset(end.x, end.z, blend);
  assert.ok(Math.abs(yBoff) < 0.2, `banpoEast blend offset ${yBoff} should be ~0`);
  const hap = hapOsm.spawns['tancheon-hap'];
  const yH = heightAt(hap.x, hap.z);
  ok(`spine ${spine.length} raw / ${samples.length} @3m, ${polylineLen(spine).toFixed(1)} m, max raw seg ${rawMax.toFixed(1)} m, max gap ${maxGap.toFixed(2)} m, max |dy| ${maxDy.toFixed(2)} m, wet ${wetN}, float ${floatN}; y start ${y0.toFixed(2)} hap ${yH.toFixed(2)} banpo ${yB.toFixed(2)}`);
}

console.log(`\n${n} checks passed`);
