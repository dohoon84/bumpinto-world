// [gangnam-bus] 판교IC 끝 → 경부고속도로 → 양재IC → 강남대로 → 강남역.
//   도로: OpenStreetMap way (ODbL). 버스: 서울시 T Data 정적 JSON (uploads). 실시간 API 없음.
//   node scripts/corridor/build-gangnam-bus.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CENTER = { lat: 37.3665, lon: 127.10835 };
const KX = Math.cos((CENTER.lat * Math.PI) / 180) * 111320;
const KZ = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (lat, lon) => [r1((lon - CENTER.lon) * KX), r1(-(lat - CENTER.lat) * KZ)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const OSM = [
  process.env.GYEONGBU_OSM || '/tmp/gyeongbu.json',
  process.env.YANGJAE_OSM || '/tmp/yangjae.json',
  process.env.SEOCHO_OSM || '/tmp/seocho.json',
].filter((f) => fs.existsSync(f));
const BUS = process.env.GANGNAM_BUS_JSON || '/home/ubuntu/.cursor/projects/agent-repos-bumpinto-world/uploads/gangnam-bus-routes_5fd7.json';
const EXPRESS = path.join(root, 'public/corridor/pangyo/express.json');
const OUT = path.join(root, 'public/corridor/gangnam/transit.json');

if (!OSM.length) { console.error('OSM json 없음'); process.exit(1); }
if (!fs.existsSync(BUS)) { console.error('버스 JSON 없음', BUS); process.exit(1); }

const express = JSON.parse(fs.readFileSync(EXPRESS, 'utf8'));
const nb = express.lines.find((l) => l.id === 'mainNB');
const START = nb.pts[nb.pts.length - 1].slice(0, 2);
const STATION = [-7097.7, -14453.3];

const rawWays = new Map();
for (const f of OSM) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const w of j.elements || []) {
    if (!w.geometry || w.geometry.length < 2 || rawWays.has(w.id)) continue;
    const name = w.tags?.name || '';
    const hw = w.tags?.highway || '';
    const gyeongbu = name === '경부고속도로' && (hw === 'motorway' || hw === 'trunk');
    const daero = name === '강남대로' && hw === 'primary';
    const ramp = name === '양재대로' && (hw === 'primary' || hw === 'trunk');
    if (!gyeongbu && !daero && !ramp) continue;
    rawWays.set(w.id, {
      id: w.id, name, hw,
      kind: gyeongbu ? 'gyeongbu' : daero ? 'daero' : 'ramp',
      pts: w.geometry.map((g) => proj(g.lat, g.lon)),
    });
  }
}
const ways = [...rawWays.values()];

function projectOn(seq, p) {
  let best = Infinity, at = 0, pt = seq[0], seg = 0;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
    const q = [a[0] + dx * t, a[1] + dz * t];
    const d = dist(q, p);
    if (d < best) { best = d; at = t; pt = q; seg = i; }
  }
  return { d: best, pt, seg };
}

function follow(from, allow, pred, maxD = 40) {
  let p = from.slice();
  const used = new Set();
  const out = [];
  for (let n = 0; n < 100; n++) {
    let best = null;
    for (const w of ways) {
      if (used.has(w.id) || !allow(w)) continue;
      for (const rev of [false, true]) {
        const seq = rev ? [...w.pts].reverse() : w.pts;
        const hit = projectOn(seq, p);
        if (hit.d > maxD) continue;
        const end = seq[seq.length - 1];
        if (dist(end, p) < 12) continue;
        const score = pred(p, end, w);
        if (score == null) continue;
        if (!best || score < best.score) best = { w, seq, hit, end, score };
      }
    }
    if (!best) break;
    used.add(best.w.id);
    for (const q of best.seq.slice(best.hit.seg)) out.push({ p: q, kind: best.w.kind, id: best.w.id });
    p = best.end;
    if (dist(p, STATION) < 30) break;
  }
  return out;
}

// 1) 경부 본선만 북쪽(z 감소)으로. 양재IC(z≈-10770)에서 멈춘다. 서초IC 본선은 강남역이 아니라 서초대로로 빠진다.
const gy = follow(START, (w) => w.kind === 'gyeongbu', (p, end) => (end[1] < p[1] - 8 ? end[1] : null));
const gyCut = [];
for (const s of gy) { gyCut.push(s); if (s.p[1] < -10760) break; }
let line = [{ p: START.slice(), kind: 'gyeongbu', id: 0 }, ...gyCut];
// 2) 양재대로 → 강남대로. 강남역에 가까워지는 길만.
const tip = line[line.length - 1].p;
function routeCity(from) {
  const edges = [];
  for (const w of ways) if (w.kind === 'ramp' || w.kind === 'daero') {
    edges.push([w, w.pts]);
    edges.push([w, [...w.pts].reverse()]);
  }
  const nodes = [{ p: from.slice(), cost: 0, prev: -1, kind: 'gyeongbu', seq: [] }];
  const q = [0];
  const best = new Map();
  let found = -1;
  while (q.length && nodes.length < 4000) {
    let bi = 0;
    for (let i = 1; i < q.length; i++) if (nodes[q[i]].cost < nodes[q[bi]].cost) bi = i;
    const id = q.splice(bi, 1)[0];
    const cur = nodes[id];
    const key = `${cur.p[0].toFixed(0)},${cur.p[1].toFixed(0)}`;
    if (best.has(key)) continue;
    best.set(key, id);
    if (cur.kind === 'daero' && dist(cur.p, STATION) < 40) { found = id; break; }
    const lim = cur.prev < 0 ? 180 : 40;
    for (const [w, seq] of edges) {
      const hit = projectOn(seq, cur.p);
      if (hit.d > lim) continue;
      const end = seq[seq.length - 1];
      if (dist(end, cur.p) < 10) continue;
      const cost = cur.cost + hit.d + dist(hit.pt, end);
      nodes.push({ p: end.slice(), cost, prev: id, kind: w.kind, seq: seq.slice(hit.seg), id: w.id });
      q.push(nodes.length - 1);
    }
  }
  const seq = [];
  for (let i = found; i > 0; i = nodes[i].prev) seq.push(nodes[i]);
  seq.reverse();
  return seq;
}
const city = routeCity(tip);
for (const step of city) for (const q of (step.seq.length ? step.seq : [step.p])) line.push({ p: q, kind: step.kind, id: step.id });

// 40m 간격으로 줄이고, 시작점은 판교IC 끝과 같게
function densify(src, step) {
  const out = [{ p: src[0].p.slice(), kind: src[0].kind, id: src[0].id }];
  for (let i = 1; i < src.length; i++) {
    const a = out[out.length - 1].p, b = src[i].p, d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ p: [r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t)], kind: src[i].kind, id: src[i].id });
    }
  }
  return out;
}
line[0].p = START.slice();
const slim = densify(line, 40);
if (dist(slim[slim.length - 1].p, STATION) > 8 && dist(slim[slim.length - 1].p, STATION) < 50) {
  slim.push({ p: STATION.slice(), kind: 'daero', id: slim.at(-1).id });
}

let len = 0;
const pts = slim.map((s, i) => {
  if (i) len += dist(slim[i - 1].p, s.p);
  return [s.p[0], s.p[1], r1(len), s.kind === 'daero' ? 'daero' : 'gyeongbu'];
});
const daeroAt = pts.find((p) => p[3] === 'daero')?.[2] ?? len;

const bus = JSON.parse(fs.readFileSync(BUS, 'utf8'));
function nearRoad(lat, lng) {
  const q = proj(lat, lng);
  let best = Infinity, at = 0, kind = 'gyeongbu';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2));
    const d = Math.hypot(a[0] + dx * t - q[0], a[1] + dz * t - q[1]);
    if (d < best) { best = d; at = a[2] + (b[2] - a[2]) * t; kind = b[3]; }
  }
  return { d: best, at, kind, x: q[0], z: q[1] };
}

const GN = { lat: 37.4979, lon: 127.0276 };
const nearStation = (s) => Math.hypot((s.lng - GN.lon) * KX, -(s.lat - GN.lat) * KZ) < 450;

const routes = bus.routes.map((r) => {
  let gyeongbuM = 0;
  for (let i = 1; i < r.stops.length; i++) {
    const a = nearRoad(r.stops[i - 1].lat, r.stops[i - 1].lng);
    const b = nearRoad(r.stops[i].lat, r.stops[i].lng);
    const hop = Math.hypot((r.stops[i].lng - r.stops[i - 1].lng) * KX, -(r.stops[i].lat - r.stops[i - 1].lat) * KZ);
    if (hop > 400 && a.d < 220 && b.d < 220 && a.kind === 'gyeongbu' && b.kind === 'gyeongbu' && a.at < daeroAt && b.at < daeroAt) gyeongbuM += hop;
  }
  const stops = r.stops.filter(nearStation).map((s) => {
    const q = proj(s.lat, s.lng);
    return { seq: s.seq, name: s.name, arsId: s.arsId, x: q[0], z: q[1] };
  });
  const onDaero = r.stops.map((s) => nearRoad(s.lat, s.lng)).filter((h) => h.kind === 'daero' && h.d < 70);
  return {
    no: r.routeNo,
    id: r.routeId,
    turnSeq: r.turnSeq,
    usesGyeongbu: gyeongbuM > 800,
    gyeongbuM: Math.round(gyeongbuM),
    onDaero: onDaero.length >= 2,
    timetable: {
      weekday: r.timetable.weekday,
      saturday: r.timetable.saturday,
      holiday: r.timetable.holiday,
    },
    stops,
  };
});

const out = {
  meta: {
    generated: new Date().toISOString(),
    road: 'OpenStreetMap ways (© OpenStreetMap contributors, ODbL). 경부고속도로 motorway·trunk + 양재IC에서 강남대로 primary. 판교IC 기존 express.json mainNB 끝에서 잇는다.',
    roadFetched: '2026-11-08',
    bus: bus.source,
    license: bus.license,
    provider: bus.provider,
    fetchedAt: bus.fetchedAt,
    note: '10개 검증 노선은 정류소 좌표상 판교IC~양재IC 경부 본선을 타지 않는다. 9404는 분당내곡로, 9408은 헌릉로. 경부 본선에는 올리지 않고, 강남대로에 정류소가 있는 노선만 그 구간을 달린다.',
  },
  station: STATION,
  anchor: START,
  daeroAt,
  lengthM: r1(len),
  pts,
  routes,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`wrote ${OUT} ${kb}KB len ${len.toFixed(0)}m pts ${pts.length} daeroAt ${daeroAt} endGap ${dist(pts.at(-1), STATION).toFixed(1)} startGap ${dist(pts[0], START).toFixed(1)}`);
for (const r of routes) console.log(r.no, 'gyeongbu', r.usesGyeongbu, r.gyeongbuM + 'm', 'daero', r.onDaero, 'stops', r.stops.length, 'last', r.timetable.weekday.lastTime);
