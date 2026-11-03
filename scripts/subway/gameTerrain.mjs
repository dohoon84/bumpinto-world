// [subway] node 에서 게임과 같은 지형 (다리 상판·보행교·하천 계단·제방) — build-stations.mjs · test-subway.mjs 공용
//   game.js: createTerrain(corridorTerrainData(terrain.json, corridor)) → annotate(정자) → corridor 가 탄천·지류 다리 annotate
//   (src/corridor/index.js 의 corridorTerrainData 는 그 모듈이 브라우저 전용 import 를 가져 node 에서 못 불러 같은 식을 여기 둔다)
import fs from 'node:fs';
import path from 'node:path';
import { createTerrain } from '../../src/world/terrain.js';
import { mergeTancheon } from '../../src/corridor/tancheon.js';

export function gameTerrain(ROOT) {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const base = rd('public/corridor/base.json'), tancheon = rd('public/corridor/tancheon.json'), streams = rd('public/corridor/streams.json');
  const T0 = rd('public/terrain.json'), TM = mergeTancheon(T0, tancheon);
  const terrain = createTerrain(TM !== T0 && streams?.streams?.length ? { ...TM, streams } : TM, rd('public/jeongja.json'));
  const jz = rd('public/jeongja.json');
  terrain.annotate(jz);
  const SD = terrain.streams ? streams : null;
  const cp = (r) => ({ ...r, p: r.p.map((q) => q.slice()) });
  terrain.annotate({ roads: base.ch.concat(SD?.mainBridges || []).map(cp).concat(SD ? SD.bridges.map(cp) : []), water: [], waterLines: [], parks: base.chParks.map((q) => ({ ...q })) });
  return { terrain, jz };
}
