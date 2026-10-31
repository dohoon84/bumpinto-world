// [bus-net] GBIS 실노선(220·9407·7007-1·380) 데이터·경계 연결·정류장 서비스 테스트: node scripts/corridor/test/test-bus-network.mjs [초]
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SimulatedBusSource } from '../../../src/transit/busSource.js';
import { mergeSimExtra } from '../../../src/transit/transit.js';

const SEC = Number(process.argv[2]) || 2400;
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../../public/${f}`, import.meta.url)));
const CO = read('corridor/transit.json'), JZ = read('transit.json'), X = read('corridor/jz-sim.json');
const BOX = { x0: -606, x1: 597.2, z0: -608, z1: 939.6 };
const name = new Map(CO.stops.map((s) => [s.id, s.name]));
const G = CO.paths.filter((p) => p.src === 'gbis');
const main = (ref, dir) => G.filter((p) => p.ref === ref && p.dir === dir).sort((a, b) => b.stops.length - a.stops.length)[0];

// 1) 노선·방향·주요 정류장
for (const ref of ['220', '9407', '7007-1', '380']) for (const dir of [0, 1]) assert.ok(main(ref, dir)?.stops.length >= 6, `${ref} dir${dir} 정류장`);
const names = (p) => p.stops.map((s) => name.get(s.stop) || '').join('|');
assert.match(names(main('220', 1)), /서현역.*야탑역.*모란/, '220 정자→서현→야탑→모란');
assert.match(names(main('220', 0)), /야탑역.*서현역/, '220 반대 방향');
assert.match(names(main('9407', 0)), /서현.*야탑.*모란.*복정.*탄천고가교/, '9407 정자→모란→복정→탄천고가교(서울 경계)');
assert.match(names(main('9407', 1)), /복정.*모란.*서현/, '9407 반대 방향');
for (const s of CO.stops.filter((s) => s.src === 'gbis')) assert.ok(s.name && Number.isFinite(s.x) && s.routes.length, 'GBIS 정류장 필드');

// 2) 정자 상자 경계: GBIS 조각이 상자 경계에서 끝나면 같은 번호·같은 방향 정자 경로(기본 transit.json 또는 시뮬 전용 jz-sim)가 8m 안에서 이어짐
const T = mergeSimExtra(JZ, X);
assert.equal(JZ.paths.length + X.paths.length, T.paths.length); assert.ok(T.paths.slice(JZ.paths.length).every((p) => p.simExtra));
assert.ok(!JZ.paths.some((p) => p.simExtra), 'mergeSimExtra 는 원본(정자 기본 데이터)을 바꾸지 않음');
const onBox = ([x, z]) => Math.min(Math.abs(x - BOX.x0), Math.abs(x - BOX.x1), Math.abs(z - BOX.z0), Math.abs(z - BOX.z1)) < 2 && x > BOX.x0 - 2 && x < BOX.x1 + 2 && z > BOX.z0 - 2 && z < BOX.z1 + 2;
const dirAt = (pts, i, j) => { const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
let links = 0; const miss = [];
for (const p of G) {
  const e = p.pts.at(-1), s = p.pts[0], de = dirAt(p.pts, p.pts.length - 2, p.pts.length - 1), ds = dirAt(p.pts, 0, 1);
  if (onBox(e)) { const q = T.paths.find((q) => q.ref === p.ref && Math.hypot(q.pts[0][0] - e[0], q.pts[0][1] - e[1]) < 8 && (() => { const d = dirAt(q.pts, 0, 1); return d[0] * de[0] + d[1] * de[1] > 0; })()); if (q) links++; else miss.push(`${p.ref}/${p.dir} 끝 ${e}`); }
  if (onBox(s)) { const q = T.paths.find((q) => q.ref === p.ref && Math.hypot(q.pts.at(-1)[0] - s[0], q.pts.at(-1)[1] - s[1]) < 8 && (() => { const d = dirAt(q.pts, q.pts.length - 2, q.pts.length - 1); return d[0] * ds[0] + d[1] * ds[1] > 0; })()); if (q) links++; else miss.push(`${p.ref}/${p.dir} 시작 ${s}`); }
}
console.log(`경계 연결 ${links}개${miss.length ? ' · 없음: ' + miss.join(', ') : ''}`);
assert.ok(links >= 8, '경계 연결');
assert.ok(!miss.some((m) => /^(220|9407)\//.test(m)), `220·9407 경계 끊김: ${miss}`);

// 3) 시뮬: 모든 GBIS 경로의 모든 정류장에서 버스가 실제로 정차(서비스), 간격 켬 상태에서 교착 없음
const sim = new SimulatedBusSource({ ...CO, crossings: [] }, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true });
const served = new Map(sim.paths.filter((p) => p.src === 'gbis').map((p) => [p, new Set()]));
const ctx = { pedLight: () => 'red' };
for (let t = 0; t < SEC; t += 0.2) {
  sim.update(0.2, ctx);
  for (const b of sim.buses) if (b.state === 'dwell' && b.dwell > 0 && b.stopIdx < b.P.stops.length) served.get(b.P)?.add(b.stopIdx);
}
let tot = 0, ok = 0; const bad = [];
for (const [p, set] of served) { tot += p.stops.length; ok += set.size; if (set.size < p.stops.length) bad.push(`${p.ref}/${p.dir} ${set.size}/${p.stops.length}`); }
console.log(`GBIS 정류장 정차 ${ok}/${tot} (${SEC}s)${bad.length ? ' · 미정차: ' + bad.join(', ') : ''}`);
assert.equal(ok, tot, '모든 GBIS 정류장에 정차');
// 4) 정자 ?bus=sim 시뮬 전용 경로(jz-sim)도 모든 정류장에 정차
const js = new SimulatedBusSource(T, BOX, { seed: 7, spacing: true }), jserved = new Map(js.paths.filter((p) => p.simExtra).map((p) => [p, new Set()]));
for (let t = 0; t < 900; t += 0.2) { js.update(0.2, ctx); for (const b of js.buses) if (b.state === 'dwell' && b.dwell > 0 && b.stopIdx < b.P.stops.length) jserved.get(b.P)?.add(b.stopIdx); }
const jt = [...jserved].reduce((a, [p, s]) => [a[0] + s.size, a[1] + p.stops.length], [0, 0]);
console.log(`정자 시뮬 전용 경로 ${jserved.size}개 정류장 정차 ${jt[0]}/${jt[1]}`);
assert.equal(jt[0], jt[1]);
console.log('test-bus-network: ok');
