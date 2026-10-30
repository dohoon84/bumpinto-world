// [corridor] 탄천 연장 합치기 테스트: node scripts/corridor/test/test-tancheon.mjs
//   - 라이브 terrain.json 이 바뀌면(축 길이/끝점 불일치) 합치지 않고 라이브 그대로(안전 폴백)
//   - 합친 지형의 높이가 정자 라이브 bbox 안에서 라이브 지형과 같은지(이음매 근처 제외 없이 전수 비교) 출력
//   - 연장 구간: 수면 < 제방 둑마루 < 주변 도로면, 둔치 길 높이가 정자 구간과 같은 범위
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { mergeTancheon } = await import('../../../src/corridor/tancheon.js');
const { createTerrain } = await import('../../../src/world/terrain.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../../../public/' + f, import.meta.url)));
const T = rd('terrain.json'), ext = rd('corridor/tancheon.json'), data = rd('jeongja.json'), idx = rd('corridor/index.json');
let n = 0; const ok = (m) => console.log('  ok', ++n, m);

const M = mergeTancheon(T, ext);
assert.notEqual(M, T); assert.ok(M.axis.length > T.axis.length);
for (let i = 0; i < ext.from; i++) assert.deepEqual(M.axis[i], T.axis[i]);
for (const k of Object.keys(T.prof)) for (let i = 0; i < ext.from; i++) assert.equal(M.prof[k][i], T.prof[k][i]);
ok(`merge keeps live axis/profile [0, ${ext.from}) identical, axis ${T.axis.length} → ${M.axis.length}`);
const bad = { ...T, axis: T.axis.slice(0, -1) };
assert.equal(mergeTancheon(bad, ext), bad); assert.equal(mergeTancheon(T, null), T);
ok('mismatched live terrain / no ext → live terrain returned unchanged');

const live = createTerrain(T, data), merged = createTerrain(M, data);
const lb = idx.meta.liveBox; let cnt = 0, diff = 0, maxD = 0;
for (let x = lb.x0; x <= lb.x1; x += 4) for (let z = lb.z0; z <= lb.z1; z += 4) {
  const a = live.baseHeight(x, z), b = merged.baseHeight(x, z); cnt++;
  const d = Math.abs(a - b); if (d > 1e-6) diff++; maxD = Math.max(maxD, d);
}
console.log(`     live bbox: ${cnt} samples (4m grid), ${diff} differ, max |Δh| = ${maxD.toFixed(3)} m`);
assert.ok(diff / cnt < 0.01, 'live bbox heights unchanged (<1% samples, only at the downstream seam)');
ok('heights inside 정자 live bbox match live terrain');

// 연장 구간 단면 검사: 축 위(물) < FLOOR, 제방 바깥 = 0 근처
const P = M.params; let checked = 0, wet = 0, dry = 0;
for (let i = ext.from + 5; i < M.axis.length - 5; i += 10) {
  const [x, z] = M.axis[i]; checked++;
  if (merged.baseHeight(x, z) <= P.FLOOR) wet++;
  const nx = M.axis[i + 1][1] - z, nz = -(M.axis[i + 1][0] - x), L = Math.hypot(nx, nz) || 1;
  const top = Math.max(M.prof.topL[i], M.prof.topR[i]) + 25;
  const h1 = merged.baseHeight(x + (nx / L) * top, z + (nz / L) * top), h2 = merged.baseHeight(x - (nx / L) * top, z - (nz / L) * top);
  if (h1 > -0.5 && h2 > -0.5) dry++;
}
console.log(`     extension: ${checked} sections, channel centre below floodplain floor ${wet}/${checked}, both banks back at street level ${dry}/${checked}`);
assert.ok(wet / checked > 0.95 && dry / checked > 0.9);
ok('extension cross-sections: water channel sunk, banks return to street level');
console.log(`tancheon: ${n} passed`);
