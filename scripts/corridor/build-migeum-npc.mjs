// [migeum-npc] 미금역 일대 차량·보행 NPC 데이터: public/corridor/migeum/npc.json
//   (차도 그래프는 여기 없다 → 공유 migeum/roads.json · scripts/corridor/build-migeum-roads.mjs · src/corridor/migeumRoads.js migeumLocalGraph.
//    코리더 차량·택시(#24)와 같은 파일·같은 주인 규칙으로 미금 차량 NPC 몫만 런타임에 고른다)
//   walk  : 보도 지점 [x, z] — 보행 가능 길(차도면 가장자리 바깥 1.8m 양쪽, 보행로면 가운데) 위 20m 간격, 역 450m 안
//   stops : 1층 상가(commercial·retail 건물) 중심 [x, z] — 배달 오토바이 정차 후보
//   좌표는 코리더와 같은 로컬 미터(정자 원점). 실제 차량·사람 위치 데이터 아님(시뮬레이션)
//   사용: node scripts/corridor/build-migeum-npc.mjs [--out=public/corridor/migeum/npc.json]
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/migeum/npc.json'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;
const MG = J('public/corridor/migeum/index.json'), B = MG.meta.box;
const ST = MG.stations[0];
const inB = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;

// ---------- 보도 지점 · 상가 ----------
const tiles = Object.keys(MG.tiles).sort().map((k) => J(`public/corridor/migeum/tiles/${k}.json`));
const WALK_R = 450, STEP = 20, CARK = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'trunk', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link']);
const near = ([x, z]) => Math.hypot(x - ST.x, z - ST.z) < WALK_R;
const walk = [], seen = new Set();
const add = (x, z) => { const k = Math.round(x / 6) + ',' + Math.round(z / 6); if (seen.has(k) || !inB([x, z]) || !near([x, z])) return; seen.add(k); walk.push([r1(x), r1(z)]); };
for (const t of tiles) for (const r of t.r) {
  if (!r.walk || /motorway/.test(r.k)) continue;
  const car = CARK.has(r.k), off = car ? r.w / 2 + 1.8 : 0;
  let carry = 0;
  for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let s = carry; s < L; s += STEP) {
      const x = ax + ux * s, z = az + uz * s;
      if (off) { add(x - uz * off, z + ux * off); add(x + uz * off, z - ux * off); } else add(x, z);
    }
    carry = (carry - L) % STEP; if (carry < 0) carry += STEP;
  }
}
walk.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
const stops = [];
for (const t of tiles) for (const b of t.b) if ((b.k === 'commercial' || b.k === 'retail') && b.o?.length) {
  let x = 0, z = 0; for (const p of b.o) { x += p[0]; z += p[1]; } x /= b.o.length; z /= b.o.length;
  if (inB([x, z])) stops.push([r1(x), r1(z)]);
}
stops.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

const out = {
  meta: {
    attribution: '© OpenStreetMap contributors (ODbL)',
    note: '미금 차량·보행 NPC 시뮬레이션용(도로 그래프·보도 지점). 차량·사람 위치는 실제 데이터 아님',
    generated: new Date().toISOString(), source: { osm: MG.meta.source?.osm || null, drive: 'migeum/roads.json (공유 차도 그래프, 미금 몫은 런타임 migeumLocalGraph)' },
    box: B, station: { x: ST.x, z: ST.z }, stats: { walk: walk.length, stops: stops.length },
  },
  walk, stops,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('migeum npc.json', JSON.stringify(out.meta.stats), (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
