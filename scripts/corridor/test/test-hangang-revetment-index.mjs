// 합수부 호안 최근접 검색: 격자와 선형 스캔이 같은 샘플을 고르는지.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inWater } from '../../../src/corridor/landmarks/hangangCoords.js';
import {
  makeShoreIndex, nearestShoreIndexed, nearestShoreLinear, SHORE_SEARCH_R,
} from '../../../src/corridor/landmarks/hangangTerrain.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

function resampleShore(raw, step = 3.2) {
  const out = [];
  for (let i = 1; i < raw.length; i++) {
    const ax = raw[i - 1].x, az = raw[i - 1].z, bx = raw[i].x, bz = raw[i].z;
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, sx: raw[i].sx, sz: raw[i].sz });
    }
  }
  if (raw.length) out.push(raw[raw.length - 1]);
  return out;
}

// 테스트용으로 수면 외곽을 따라 대충 샘플을 만든다(본 메시와 같은 체인이 아니어도, 동일 입력에 대한 일치만 보면 된다).
function samplesFromWater(osm, step = 8) {
  const out = [];
  for (const ring of osm?.water?.outers || []) {
    const pts = ring.o || ring.pts || ring;
    if (!pts || pts.length < 2 || !Array.isArray(pts[0])) continue;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      const sx = -dz, sz = dx;
      const n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, sx, sz });
      }
    }
  }
  return out;
}

const hapOsm = J('public/corridor/hangang/hap-osm.json');
const hapDem = J('public/corridor/hangang/hap-dem.json');
const samples = samplesFromWater(hapOsm, 3.2);
assert.ok(samples.length > 1000, `enough shore samples (${samples.length})`);
const index = makeShoreIndex(samples, SHORE_SEARCH_R);

const x0 = hapDem.x0, z0 = hapDem.z0, x1 = hapDem.x0 + (hapDem.nx - 1) * hapDem.dx, z1 = hapDem.z0 + (hapDem.nz - 1) * hapDem.dz;
let miss = 0, checked = 0, maxD2 = 0;
const step = 40; // 40 m grid across the hap DEM
for (let z = z0; z <= z1; z += step) {
  for (let x = x0; x <= x1; x += step) {
    const a = nearestShoreLinear(samples, x, z);
    const b = nearestShoreIndexed(index, x, z);
    checked++;
    if (a !== b) {
      // 둘 다 null 이면 같음. 하나만 있거나 객체가 다르면 실패
      if (a == null && b == null) continue;
      miss++;
      if (miss <= 5) console.error('mismatch', x, z, a && { x: a.x, z: a.z }, b && { x: b.x, z: b.z });
    } else if (a) {
      const d2 = (x - a.x) ** 2 + (z - a.z) ** 2;
      if (d2 > maxD2) maxD2 = d2;
    }
  }
}
assert.equal(miss, 0, `index must pick the same sample as linear (${miss}/${checked} mismatches)`);

// 타이밍 (참고). 합수부 정점 수에 가깝게 반복
const nx = (hapDem.nx - 1) * (hapOsm.meta?.demSub ?? 1) + 1;
const nz = (hapDem.nz - 1) * (hapOsm.meta?.demSub ?? 1) + 1;
const xs = [], zs = [];
for (let j = 0; j < nz; j += 2) {
  for (let i = 0; i < nx; i += 2) {
    xs.push(hapDem.x0 + (i / (hapOsm.meta?.demSub ?? 1)) * hapDem.dx);
    zs.push(hapDem.z0 + (j / (hapOsm.meta?.demSub ?? 1)) * hapDem.dz);
  }
}
const t0 = performance.now();
for (let i = 0; i < xs.length; i++) nearestShoreLinear(samples, xs[i], zs[i]);
const linMs = performance.now() - t0;
const t1 = performance.now();
for (let i = 0; i < xs.length; i++) nearestShoreIndexed(index, xs[i], zs[i]);
const idxMs = performance.now() - t1;

console.log(`hangang-revetment-index: ${checked} cells compared, 0 mismatches, samples=${samples.length}`);
console.log(`timing (every 2nd hap vertex): linear ${linMs.toFixed(1)}ms, indexed ${idxMs.toFixed(1)}ms, n=${xs.length}`);
console.log('hangang-revetment-index ok');
