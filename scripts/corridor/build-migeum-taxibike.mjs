// [migeum-taxibike] 미금역 택시 승차 지점 + 카카오바이크 자리: public/corridor/migeum/taxibike.json
//   OSM 미금 범위에 amenity=taxi / taxi=* / amenity=bicycle_rental 이 0개(data/osm_migeum_taxibike_raw.json) → 실제 위치를 지어내지 않고 '규칙'으로 둔다.
//   택시(정자 taxis.js 규칙과 같은 방식): OSM 출입구마다 가장 가까운 primary/secondary 차도(코리더 차도 그래프 + 아래 미금 연장)를
//     TAXI_D(40m) 안에서 찾아, 그 차도 가장자리(중심선 투영점 + 출입구 쪽으로 폭/2)에 승차 지점 1개. 없으면 skipped 에 이유와 함께 남김.
//     런타임은 이 점들을 코리더 택시의 '출입구' 목록에 덧붙인다(진행방향 오른쪽 갓길일 때만 정차 — taxis.js 그대로).
//   미금 차도 연장: 코리더 drive.json 은 성남대로가 돌마로 교차점(z≈1820.6)에서 끝나고 돌마로가 없다. 연장(역 320m 안 primary/secondary 7 way)은
//     공용 미금 차도 그래프 public/corridor/migeum/roads.json 의 x 몫(scripts/corridor/build-migeum-roads.mjs)을 그대로 쓴다 → 택시·코리더 차·미금 차량 NPC 가 같은 길 목록.
//     런타임 합치기는 life.js(withMigeumCorridorRoads) 한 곳. 이 파일에는 더 이상 차도를 싣지 않는다.
//   자전거(정자 bike.js 규칙): 역 중심 RADIUS 115m 안의 보도(footway/path/pedestrian)를 3m 간격으로 표본 → 길마다 첫 점 +4m 뒤 GAP 36m 간격,
//     길 옆 ±0.5m/0 중 건물(아래 뜬 건물 제외)·차도(폭/2+0.6) 밖인 곳, 역 표지판 3.5m 안 제외, 역에서 가까운 순으로 SEPARATION 18m · 최대 24대.
//   사용: node scripts/corridor/build-migeum-taxibike.mjs [--check]  (--check: 파일과 빌드 결과가 같은지만 확인)
import fs from 'node:fs';
import path from 'node:path';
import { migeumCorridorExt, MIGEUM_ROADS_FILE } from '../../src/corridor/migeumRoads.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const OUT = 'public/corridor/migeum/taxibike.json';
const MIGEUM_ROADS = 'public/corridor/' + MIGEUM_ROADS_FILE;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

export const RULE = { TAXI_D: 40, TAXI_KINDS: ['primary', 'secondary'], DRIVE_R: 320, RADIUS: 115, GAP: 36, SEPARATION: 18, MAX: 24, SIDEWALK: ['footway', 'path', 'pedestrian'], SEED: 23 };
const CAR_KINDS = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified', 'service', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link']); // tileMesh.js 와 같음

const seg = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); const px = ax + dx * t, pz = az + dz * t; return { d: Math.hypot(x - px, z - pz), px, pz, t }; };
function inRing(x, z, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }
const nearRing = (x, z, ring, r) => inRing(x, z, ring) || ring.some((p, i) => i && seg(x, z, ...ring[i - 1], ...p).d < r);

export function buildTaxiBike() {
  const mi = rd('public/corridor/migeum/index.json');
  const st = mi.stations.find((s) => s.name === '미금') || mi.stations[0];
  const cd = rd('public/corridor/drive.json');
  const q = rd('data/osm_migeum_taxibike_raw.json');
  const tiles = Object.keys(mi.tiles || {}).length ? Object.keys(mi.tiles) : fs.readdirSync(path.join(ROOT, 'public/corridor/migeum/tiles')).map((f) => f.replace('.json', ''));
  const T = tiles.sort().map((k) => rd(`public/corridor/migeum/tiles/${k}.json`));

  // --- 미금 차도 연장 = 공용 roads.json 의 x 몫(코리더 그래프에 없는 primary/secondary, 역 반경 DRIVE_R 안) ---
  const { nodes, ways } = migeumCorridorExt(rd(MIGEUM_ROADS));
  const cdKey = new Set(cd.nodes.map((n) => r1(n[0]) + ',' + r1(n[1])));
  const joined = nodes.filter((n) => cdKey.has(n[0] + ',' + n[1])).length;

  // --- 택시 승차 지점 ---
  const graph = [];
  for (const w of cd.ways) if (RULE.TAXI_KINDS.includes(w.k)) for (let i = 1; i < w.n.length; i++) graph.push({ a: cd.nodes[w.n[i - 1]], b: cd.nodes[w.n[i]], w, src: 'corridor' });
  for (const w of ways) for (let i = 1; i < w.n.length; i++) graph.push({ a: nodes[w.n[i - 1]], b: nodes[w.n[i]], w, src: 'migeum' });
  const points = [], skipped = [];
  for (const e of st.exits) {
    let best = null;
    for (const g of graph) { const s = seg(e.x, e.z, g.a[0], g.a[1], g.b[0], g.b[1]); if (!best || s.d < best.s.d) best = { s, g }; }
    if (!best || best.s.d > RULE.TAXI_D) { skipped.push({ ref: e.ref, why: `primary/secondary 차도가 ${RULE.TAXI_D}m 안에 없음`, d: best ? r1(best.s.d) : null }); continue; }
    const { s, g } = best, hw = g.w.w / 2;
    const ux = (e.x - s.px) / (s.d || 1), uz = (e.z - s.pz) / (s.d || 1);
    const off = Math.min(hw, s.d); // 출입구가 차도 안쪽(드묾)이면 출입구 자리
    // 진행방향(a→b) 기준 출입구가 오른쪽인지(taxis.js: v>0 이 오른쪽). 양방향 길은 어느 한쪽 방향 차로가 항상 오른쪽
    const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1], L = Math.hypot(dx, dz) || 1;
    const v = ((e.x - g.a[0]) * -dz + (e.z - g.a[1]) * dx) / L;
    const right = g.w.ow === 0 ? true : g.w.ow === 1 ? v > 0 : v < 0;
    points.push({ ref: e.ref, x: r2(s.px + ux * off), z: r2(s.pz + uz * off), exit: [e.x, e.z], road: g.w.name || null, k: g.w.k, way: g.w.id, w: g.w.w, ow: g.w.ow, d: r1(s.d), src: g.src, right });
  }

  // --- 카카오바이크 자리 ---
  let seed = RULE.SEED;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sign = st.signAt || { x: st.x, z: st.z };
  const B = [], R = [];
  for (const t of T) { for (const b of t.b || []) if ((b.mh || 0) < 2.5) B.push(b.o); for (const r of t.r || []) if (CAR_KINDS.has(r.k)) R.push(r); }
  const onRoad = (x, z) => R.some((r) => r.p.some((p, i) => i && seg(x, z, ...r.p[i - 1], ...p).d < r.w / 2 + 0.6));
  const blocked = (x, z) => B.some((o) => nearRing(x, z, o, 0.4));
  const raw = [];
  for (const t of T) for (const r of t.r || []) {
    if (!RULE.SIDEWALK.includes(r.k)) continue;
    const pts = r.p, inside = []; let s = 0, insideLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.2) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, steps = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k < steps; k++) {
        const mid = ((k + 0.5) / steps) * L, x = ax + dx * mid, z = az + dz * mid;
        if (Math.hypot(x - st.x, z - st.z) > RULE.RADIUS) continue;
        inside.push({ x, z, dx, dz, s: s + mid }); insideLen += L / steps;
      }
      s += L;
    }
    if (!inside.length) continue;
    let next = inside[0].s + 4, placed = 0;
    for (const p of inside) { if (p.s + 0.01 < next) continue; raw.push(p); placed++; next = p.s + RULE.GAP; }
    if (!placed && insideLen > 9) raw.push(inside[Math.floor(inside.length / 2)]);
  }
  const spots = [];
  for (const p of raw) {
    let hit = null;
    for (const side of [0.5, -0.5, 0]) {
      const x = p.x - p.dz * side, z = p.z + p.dx * side;
      if (Math.hypot(x - sign.x, z - sign.z) < 3.5) continue;
      if (blocked(x, z) || onRoad(x, z)) continue;
      hit = { x, z, ry: Math.atan2(p.dx, p.dz) + (rnd() - 0.5) * 0.5, d: Math.hypot(x - st.x, z - st.z) };
      break;
    }
    if (hit) spots.push(hit);
  }
  spots.sort((a, b) => a.d - b.d);
  const bikes = [];
  for (const s of spots) {
    if (bikes.length >= RULE.MAX) break;
    if (bikes.some((b) => Math.hypot(b[0] - s.x, b[1] - s.z) < RULE.SEPARATION)) continue;
    bikes.push([r2(s.x), r2(s.z), r2(s.ry)]);
  }

  return {
    meta: {
      attribution: '© OpenStreetMap contributors (ODbL)',
      note: 'OSM 미금 범위 택시 승강장·대여 자전거 0개 → 규칙 배치(실제 승강장·대여소 위치 아님). 규칙은 scripts/corridor/build-migeum-taxibike.mjs 머리말',
      osm: { query: 'data/query_migeum_taxibike.overpassql', result: 'data/osm_migeum_taxibike_raw.json', osm_base: q.osm_base || null, counts: q.counts || null },
      rule: RULE,
      station: { name: st.name, x: st.x, z: st.z },
    },
    taxi: { points, skipped, ext: { ways: ways.length, nodes: nodes.length, joined, from: MIGEUM_ROADS } },
    bike: { centre: { x: st.x, z: st.z }, radius: RULE.RADIUS, max: RULE.MAX, raw: raw.length, spots: bikes },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const out = JSON.stringify(buildTaxiBike());
  if (process.argv.includes('--check')) {
    const cur = fs.readFileSync(path.join(ROOT, OUT), 'utf8');
    if (cur !== out) { console.error('taxibike.json 이 빌드 결과와 다름'); process.exit(1); }
    console.log('taxibike.json ok');
  } else {
    fs.writeFileSync(path.join(ROOT, OUT), out);
    const d = JSON.parse(out);
    console.log(OUT, (out.length / 1024).toFixed(1) + 'KB', 'taxi', d.taxi.points.length, 'skip', d.taxi.skipped.length, 'ext ways', d.taxi.ext.ways, 'nodes', d.taxi.ext.nodes, 'joined', d.taxi.ext.joined, 'bikes', d.bike.spots.length, '/ raw', d.bike.raw);
  }
}
