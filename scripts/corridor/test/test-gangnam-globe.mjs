// [gangnam] 지구본에서 강남은 열린 역. ?gangnam=0 이면 준비중으로 돌아간다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const G = await import('../../../src/corridor/globeCorridor.js');
const S = await import('../../../src/corridor/globeStations.js');
const R = await import('../../../src/regions/index.js');

assert.equal(G.gangnamGlobeEnabled(''), true);
assert.equal(G.gangnamGlobeEnabled('?gangnam=0'), false);
assert.equal(G.gangnamGlobeEnabled('?gangnam=0&gangnamsub=1'), false);
assert.ok(G.OPEN_BRANCH_IDS.has('gangnam') && G.CORRIDOR_STATION_IDS.has('gangnam'));
const g = S.GANGNAM_GLOBE_STATIONS[0];
assert.equal(g.branch, 'jamsil');
assert.deepEqual(g.lines, ['2호선', '신분당선']);
assert.deepEqual([g.x, g.z], [-7097.7, -14453.3]);

const reg = R.UPCOMING_REGIONS.find((x) => x.id === 'gangnam');
assert.equal(R.regionBlurb(reg, false, true), '강남 개통 · 2호선 · 신분당선');
assert.equal(R.regionBlurb(reg, false, false), '강남대로 · 테헤란로');
assert.equal(R.regionBlurb(reg, true, true), 'Gangnam open · Line 2 · Shinbundang');
const shown = R.UPCOMING_REGIONS.filter((x) => !G.CORRIDOR_STATION_IDS.has(x.id));
assert.ok(!shown.some((x) => x.id === 'gangnam'), '열린 강남은 준비중 목록에 없다');

const L = G.layoutCorridorMap();
const dot = L.branches.find((b) => b.id === 'gangnam');
assert.ok(dot && dot.from.id === 'jamsil');
const left = [...L.items, ...L.branches].filter((x) => x.side === 'left' && x.id !== 'gangnam');
for (const it of left) assert.ok(Math.abs((it.labelDy ?? it.dy) - dot.labelDy) >= 14, `gangnam label vs ${it.id}`);

if (!process.env.GANGNAM_GLOBE_CHILD) {
  const off = spawnSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.location = { search: '?gangnam=0' };
    const G = await import(${JSON.stringify(pathToFileURL(path.join(root, 'src/corridor/globeCorridor.js')).href)});
    const R = await import(${JSON.stringify(pathToFileURL(path.join(root, 'src/regions/index.js')).href)});
    if (G.OPEN_BRANCH_IDS.has('gangnam')) throw new Error('still open');
    const up = R.UPCOMING_REGIONS.filter((r) => !G.CORRIDOR_STATION_IDS.has(r.id));
    if (!up.some((r) => r.id === 'gangnam')) throw new Error('not upcoming');
    if (!G.OPEN_BRANCH_IDS.has('migeum') || !G.OPEN_BRANCH_IDS.has('pangyo')) throw new Error('other branches dropped');
  `], { cwd: root, encoding: 'utf8' });
  assert.equal(off.status, 0, off.stderr || off.stdout);
}
console.log('gangnam globe: open, ?gangnam=0 upcoming OK');
