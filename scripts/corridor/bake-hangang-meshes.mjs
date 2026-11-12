// 한강 1구간·합수부 지형 메시를 public/corridor/hangang 에 구워 둔다.
//   node scripts/corridor/bake-hangang-meshes.mjs
import './test/dom-shim.mjs';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { createHangangTerrain } from '../../src/corridor/landmarks/hangangTerrain.js';
import { encodeHangangTerrainBake, HANGANG_TERRAIN_BAKE_FILE, HAP_TERRAIN_BAKE_FILE } from '../../src/corridor/landmarks/hangangMeshBake.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

function bakeOne(label, file, dem, osm) {
  const parent = new THREE.Group();
  const t0 = performance.now();
  const land = createHangangTerrain({ parent: parent, dem, osm, skipBake: true });
  const bin = encodeHangangTerrainBake(land.group, { revetmentView: land.revetmentView });
  const dest = path.join(ROOT, 'public/corridor', file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bin);
  const ms = performance.now() - t0;
  console.log(label, 'wrote', path.relative(ROOT, dest), (bin.length / 1048576).toFixed(2) + 'MB', Math.round(ms) + 'ms', 'view', !!land.revetmentView);
  return dest;
}

bakeOne('s1', HANGANG_TERRAIN_BAKE_FILE, J('public/corridor/hangang/hangang-dem.json'), J('public/corridor/hangang/hangang-osm.json'));
bakeOne('hap', HAP_TERRAIN_BAKE_FILE, J('public/corridor/hangang/hap-dem.json'), J('public/corridor/hangang/hap-osm.json'));
