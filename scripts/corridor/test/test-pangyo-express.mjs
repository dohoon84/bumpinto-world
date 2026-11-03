// [pangyo-express] 판교 확장 3단계(판교IC고가차도 → 판교TG → 경부 서울 방향 합류) 데이터·런타임 테스트: node scripts/corridor/test/test-pangyo-express.mjs
//   1) express.json = build-pangyo-express.mjs 결과(OSM·DEM 추출본이 있을 때 --check)
//   2) 높이 규칙: 위로 넘는 교차마다 상판 6.0m = 시설한계 4.5 + 상판 1.5, 경사 ≤ 5%(+여유), 모든 선 양 끝 0m(지면에 닿음)
//   3) 합류 연속: 램프 끝 = 본선(서울 방향) 위 한 점(위치 1m · 높이 0.3m 안), 반대 방향 연결로 시작 = 하행 본선 분기점
//   4) 숨김: hide 서명마다 해당 타일(tiles/lod)에서 정확히 1개만 빠짐, 다른 타일·?pangyoexpress=0 은 그대로
//   5) 플래그: ?pangyoexpress=0 · ?pangyo=0 이면 꺼짐
//   6) 버스: G8110 경로 연장(2단계 끝에서 이어짐, 연장 구간 0.5m 마다 고속도로 선 폭 안), 높이 프록시로 주행(한 걸음 변화 ≤ 0.5m, 최고 6m), 고가 밑 대왕판교로 차량은 0m 유지,
//      시뮬에서 끝까지 가서 서고(state end) 3초 안팎 뒤 사라짐, 1초 넘게 멈춘 동안 스케일 1
//   7) 메시: 2개(낮 + 밤 조명), 삼각형 < 40k, NaN 없음
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mergeLinkTransit, PANGYO_LINK_FILE } from '../../../src/corridor/pangyo.js';
import { pangyoExpressEnabled, PANGYO_EXPRESS_FILE, filterExpressHidden, expressHeightFn, withExpressTerrain, extendLinkWithExpress, buildPangyoExpress } from '../../../src/corridor/pangyoExpress.js';
import { SimulatedBusSource } from '../../../src/transit/busSource.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8'));
const E = J('corridor/' + PANGYO_EXPRESS_FILE), L = J('corridor/' + PANGYO_LINK_FILE), CO = J('corridor/transit.json');
let n = 0; const ok = (m) => { n++; console.log('ok', n, m); };
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const line = (id) => E.lines.find((l) => l.id === id);

// 1)
if (fs.existsSync(path.join(ROOT, 'data/osm_pangyo_express.json')) && fs.existsSync(path.join(ROOT, 'data/dem_pangyo_express.json'))) {
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-pangyo-express.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
  ok('committed express.json matches build-pangyo-express.mjs --check');
} else console.log('skip 1: 추출본 없음');

// 2)
{
  const R = E.meta.rule, top = R.clearance + R.deck; let nOver = 0, maxG = 0;
  for (const l of E.lines) {
    const m = E.meta.lines[l.id];
    for (const o of m.over || []) { nOver++; assert.ok(o.clearance >= 4.5 - 1e-6, `${l.id} ${o.name} 시설한계 ${o.clearance}`); assert.ok(o.deckTop >= top - 1e-6, `${l.id} ${o.name} 상판 ${o.deckTop}`); }
    // 교차 지점 실제 높이(선 위 최근접점)
    for (const o of m.over || []) { let best = 1e9, y = 0; for (const p of l.pts) { const d = d2(p, o.at); if (d < best) { best = d; y = p[2]; } } assert.ok(best < 6 && y >= top - 0.05, `${l.id} ${o.name} 교차점 높이 ${y} (거리 ${best.toFixed(1)})`); }
    for (let i = 1; i < l.pts.length; i++) { const g = Math.abs(l.pts[i][2] - l.pts[i - 1][2]) / Math.max(0.5, d2(l.pts[i], l.pts[i - 1])); maxG = Math.max(maxG, g); }
    assert.ok(l.pts.every((p) => Number.isFinite(p[2]) && p[2] >= 0 && p[2] <= top + 1e-6), `${l.id} 높이 범위`);
  }
  assert.ok(maxG <= R.grade + 0.012, `최대 경사 ${(maxG * 100).toFixed(1)}%`);
  for (const id of ['mainNB', 'mainSB', 'eb']) { const l = line(id); assert.equal(l.pts[0][2], 0, `${id} 시작 0m`); assert.equal(l.pts.at(-1)[2], 0, `${id} 끝 0m`); }
  assert.equal(line('route').pts[0][2], 0, 'route 시작 0m');
  ok(`height: 위로 넘는 교차 ${nOver}곳 모두 상판 ${top}m(시설한계 ${R.clearance} + 상판 ${R.deck}), 최대 경사 ${(maxG * 100).toFixed(1)}%, 선 끝 0m`);
}

// 3)
{
  const r = line('route'), nb = line('mainNB'), e = r.pts.at(-1);
  let best = 1e9, y = 0; for (let i = 1; i < nb.pts.length; i++) { const a = nb.pts[i - 1], b = nb.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((e[0] - a[0]) * dx + (e[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(a[0] + dx * t - e[0], a[1] + dz * t - e[1]); if (d < best) { best = d; y = a[2] + (b[2] - a[2]) * t; } }
  assert.ok(best < 1, `램프 끝 - 본선 거리 ${best.toFixed(2)}`); assert.ok(Math.abs(y - e[2]) < 0.3, `램프 끝 높이 ${e[2]} vs 본선 ${y.toFixed(2)}`);
  const eb0 = line('eb').pts[0], sb = line('mainSB'); let bd = 1e9, by = 0; for (const p of sb.pts) { const d = d2(p, eb0); if (d < bd) { bd = d; by = p[2]; } }
  assert.ok(bd < 3 && Math.abs(by - eb0[2]) < 0.3, `반대 방향 연결로 시작 - 하행 본선 ${bd.toFixed(1)}m 높이 ${eb0[2]} vs ${by}`);
  ok(`merge: 램프 끝이 본선(서울 방향) 위 ${best.toFixed(2)}m · 높이차 ${Math.abs(y - e[2]).toFixed(2)}m`);
}

// 4)
{
  const groups = new Map(); for (const h of E.hide) { const k = h.kind + '/' + h.key; groups.set(k, (groups.get(k) || 0) + 1); }
  for (const [k, cnt] of groups) {
    const [kind, key] = k.split('/'), j = J(`corridor/${PANGYO_DIR_OF()}${kind}/${key}.json`), f = filterExpressHidden(E, key, kind, j);
    assert.equal(j.r.length - f.r.length, cnt, `${k} 숨김 ${j.r.length - f.r.length} / ${cnt}`);
    assert.equal(filterExpressHidden(null, key, kind, j), j, 'E 없으면 그대로');
  }
  const other = J(`corridor/${PANGYO_DIR_OF()}tiles/1_-6.json`); assert.equal(filterExpressHidden(E, '1_-6', 'tiles', other), other, '다른 타일은 그대로');
  ok(`hide: ${[...groups].map(([k, c]) => `${k}×${c}`).join(' ')}`);
}
function PANGYO_DIR_OF() { return PANGYO_EXPRESS_FILE.replace(/express\.json$/, ''); }

// 5)
assert.equal(pangyoExpressEnabled(''), true); assert.equal(pangyoExpressEnabled('?pangyoexpress=0'), false); assert.equal(pangyoExpressEnabled('?pangyo=0'), false); assert.equal(pangyoExpressEnabled('?pangyolink=0'), true);
ok('flags: ?pangyoexpress=0 · ?pangyo=0 끔');

// 6)
{
  const X = extendLinkWithExpress(L, E), P0 = L.corridor.paths.find((p) => p.route === E.bus.route), P1 = X.corridor.paths.find((p) => p.route === E.bus.route);
  assert.notEqual(P0, P1); assert.equal(P0.endStop, undefined, '원본 불변'); assert.equal(P1.endStop, true);
  assert.ok(d2(P0.pts.at(-1), E.bus.from) <= 1, '연장 시작 = 2단계 경로 끝');
  const pts = P1.pts, maxGap = d2(E.bus.append[0], P0.pts.at(-1));
  assert.ok(maxGap < 40, `이음 간격 ${maxGap.toFixed(1)}`); // 그 사이 직선도 아래 '선 밖' 검사에 들어감
  // 경로가 램프·본선 폭 안을 지남(연장 부분 1m 마다)
  const h = expressHeightFn(E), flat = { getGroundHeight: () => 0, getVehicleHeight: () => 0 }, T = withExpressTerrain(flat, E);
  const ext = pts.slice(P0.pts.length - 1), dense = [];
  for (let i = 1; i < ext.length; i++) { const a = ext[i - 1], b = ext[i], k = Math.max(1, Math.ceil(d2(a, b) / 0.5)); for (let j = 0; j < k; j++) dense.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
  const off = dense.filter(([x, z]) => h(x, z) == null).length;
  assert.ok(off === 0, `연장 경로 ${off}/${dense.length} 점이 고속도로 선 밖`);
  // 2단계 경로 전체(판교 박스 안)부터 높이 주행
  const all = []; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], k = Math.max(1, Math.ceil(d2(a, b) / 0.5)); for (let j = 0; j < k; j++) all.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
  let y = 0, maxStep = 0, top = 0; for (const [x, z] of all) { const ny = T.getVehicleHeight(x, z, y); maxStep = Math.max(maxStep, Math.abs(ny - y)); top = Math.max(top, ny); y = ny; }
  assert.ok(maxStep <= 0.5, `한 걸음 높이 변화 ${maxStep.toFixed(2)}`); assert.ok(top >= 5.9, `최고 ${top}`);
  // 고가 밑 대왕판교로: 지면 차량(ref 0) 은 0m, 새 메시 기준도 0
  const dw = E.meta.lines.route.over.find((o) => o.name === '대왕판교로'), r = line('route');
  let k0 = 0; for (let i = 0; i < r.pts.length; i++) if (d2(r.pts[i], dw.at) < d2(r.pts[k0], dw.at)) k0 = i;
  const a = r.pts[Math.max(0, k0 - 1)], b = r.pts[k0 + 1], hd = Math.atan2(b[0] - a[0], b[1] - a[1]);
  assert.equal(T.getVehicleHeight(dw.at[0], dw.at[1], 0), 0, '고가 밑 지면 차량 0m');
  assert.equal(T.freshRef(dw.at[0], dw.at[1], hd + Math.PI / 2), 0, '가로지르는 방향 새 메시 0m');
  assert.ok(T.freshRef(dw.at[0], dw.at[1], hd) >= 5.9, '같은 방향 새 메시는 상판');
  assert.equal(T.freshRef(1000, 1000, 0), null, '선 밖은 null(기존 그대로)');
  // 시뮬
  const TT = mergeLinkTransit(CO, X), sim = new SimulatedBusSource({ ...TT, crossings: [] }, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { seed: 7, spacing: true });
  const P = sim.paths.find((p) => p.ref === 'G8110' && p.endStop); assert.ok(P, '시뮬 경로 endStop');
  let tr = null, endAt = null, gone = null, minScaleStop = 1;
  for (let t = 0; t < 2400 && gone == null; t += 0.2) {
    sim.update(0.2, { pedLight: () => 'red' });
    if (!tr) tr = sim.buses.find((b) => b.P === P && b.s > P.L - 400) || null;
    if (tr) {
      if (!sim.buses.includes(tr)) { gone = t; break; }
      if (tr.state === 'end' && endAt == null) endAt = t;
      if (endAt != null && t - endAt < 1.2) { const v = sim.vehicles().find((q) => q.id === tr.id); minScaleStop = Math.min(minScaleStop, v.scale); }
    }
  }
  assert.ok(endAt != null, '끝에서 정차(state end)'); assert.ok(gone != null && gone - endAt >= 2.5 && gone - endAt <= 4, `정차 후 사라짐 ${gone - endAt}`);
  assert.ok(P.L - 1 - tr.s < 1.6 || tr.s >= P.L, '끝 1m 앞에서 섬'); assert.equal(minScaleStop, 1, '멈춘 직후엔 그대로 보임');
  ok(`bus: 연장 ${Math.round(P1.len - P0.len)}m(점 ${ext.length}), 높이 한 걸음 ≤ ${maxStep.toFixed(2)}m 최고 ${top}m, 고가 밑 0m, 끝에서 정차 ${(gone - endAt).toFixed(1)}초 뒤 사라짐`);
}

// 7)
{
  const b = buildPangyoExpress(E), s = b.stats(), pos = b.body.geometry.attributes.position.array;
  assert.equal(s.meshes, 2); assert.ok(s.tris < 40000, `tris ${s.tris}`); assert.ok(!pos.some((v) => !Number.isFinite(v)), 'NaN');
  assert.equal(b.glow.visible, false, '낮엔 조명 끔'); b.dispose();
  ok(`mesh: ${s.meshes}개 ${s.tris} tris`);
}
console.log('pangyo-express: all', n, 'checks passed');
