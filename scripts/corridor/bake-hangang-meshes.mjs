// 한강 1구간·합수부 지형 메시를 public/corridor/hangang 에 양자화·gzip 으로 구워 둔다.
//   node scripts/corridor/bake-hangang-meshes.mjs
import './test/dom-shim.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { createHangangTerrain } from '../../src/corridor/landmarks/hangangTerrain.js';
import { encodeHangangTerrainBake, HANGANG_TERRAIN_BAKE_FILE, HAP_TERRAIN_BAKE_FILE, HANGANG_DEM_UV_SCALE } from '../../src/corridor/landmarks/hangangMeshBake.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

function bakeOne(label, file, dem, osm) {
  const parent = new THREE.Group();
  const t0 = performance.now();
  const land = createHangangTerrain({ parent, dem, osm, skipBake: true });
  const raw = encodeHangangTerrainBake(land.group, {
    revetmentView: land.revetmentView,
    uvOrigin: dem ? [dem.x0, dem.z0] : null,
    uvScale: HANGANG_DEM_UV_SCALE,
  });
  const gz = zlib.gzipSync(Buffer.from(raw), { level: 9 });
  const dest = path.join(ROOT, 'public/corridor', file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, gz);
  const oldBin = dest.replace(/\.gz$/, '');
  if (oldBin !== dest && fs.existsSync(oldBin)) fs.unlinkSync(oldBin);
  const ms = performance.now() - t0;
  console.log(
    label,
    'wrote', path.relative(ROOT, dest),
    'raw', (raw.length / 1048576).toFixed(3) + 'MB',
    'gzip9', (gz.length / 1048576).toFixed(3) + 'MB',
    Math.round(ms) + 'ms',
    'view', !!land.revetmentView,
  );
  return { dest, raw: raw.length, gzip: gz.length };
}

const s1 = bakeOne('s1', HANGANG_TERRAIN_BAKE_FILE, J('public/corridor/hangang/hangang-dem.json'), J('public/corridor/hangang/hangang-osm.json'));
const hap = bakeOne('hap', HAP_TERRAIN_BAKE_FILE, J('public/corridor/hangang/hap-dem.json'), J('public/corridor/hangang/hap-osm.json'));
console.log('total raw', ((s1.raw + hap.raw) / 1048576).toFixed(3) + 'MB', 'gzip9', ((s1.gzip + hap.gzip) / 1048576).toFixed(3) + 'MB');
