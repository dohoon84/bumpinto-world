// 매장 1곳과 N곳을 한 호스트에 올렸을 때 draw(메시 수)와 지오메트리 바이트.
// 실내는 플레이어 근처만 만들고, 나머지는 외부 메시로 합친다.
import fs from 'fs';

const ctx = new Proxy(function () { return ctx; }, {
  get(t, p) {
    if (p === 'canvas') return { width: 1024, height: 256 };
    if (p === 'measureText') return () => ({ width: 80 });
    return ctx;
  },
  apply() { return ctx; },
});
globalThis.Path2D = class { constructor() {} };
globalThis.document = { createElement: () => ({ width: 1024, height: 256, getContext: () => ctx }) };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { measureBp24Host, prepareJeongjaBp24, resolveBp24, bp24TileKey } = await import('../src/corridor/bp24.js');
const { BP24_PLACEMENTS } = await import('../src/corridor/bp24Locations.js');

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(new URL(rel, import.meta.url))); } catch { return null; }
}
function merge(a, b) {
  if (!b) return a;
  if (!a) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (Array.isArray(v) && v.length) out[k] = (a[k] || []).concat(v);
  return out;
}

const jeongja = readJson('../public/jeongja.json');
const prepared = prepareJeongjaBp24(structuredClone(jeongja), '');
const one = prepared.filter((s) => s.id === 'bump24-jeongja');
const many = prepared;

function hostOf(list, at) {
  const before = process.memoryUsage().heapUsed;
  const stat = measureBp24Host(list, at);
  const after = process.memoryUsage().heapUsed;
  return { ...stat, heapDelta: after - before };
}

const at = { x: one[0].center[0], z: one[0].center[1] };
const a = hostOf(one, at);
const b = hostOf(many, at);
console.log(JSON.stringify({
  one: { n: a.n, drawsFar: a.far.draws, bytesFar: a.far.bytes, drawsNear: a.near.draws, bytesNear: a.near.bytes, drawsAll: a.all.draws, bytesAll: a.all.bytes, heapDelta: a.heapDelta },
  jeongjaHost: { n: b.n, drawsFar: b.far.draws, bytesFar: b.far.bytes, drawsNear: b.near.draws, bytesNear: b.near.bytes, drawsAll: b.all.draws, bytesAll: b.all.bytes, heapDelta: b.heapDelta },
}, null, 2));

const groups = new Map();
for (const spec of BP24_PLACEMENTS) {
  if (spec.world === 'jeongja' || spec.id === 'seongnam-cityhall') continue;
  const key = bp24TileKey(spec);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(spec);
}
let best = null;
for (const [key, specs] of groups) {
  if (!best || specs.length > best.specs.length) best = { key, specs };
}
let tile = readJson(`../public/corridor/tiles/${best.key}.json`);
tile = merge(tile, readJson(`../public/corridor/pangyo/tiles/${best.key}.json`));
tile = merge(tile, readJson(`../public/corridor/migeum/tiles/${best.key}.json`));
const resolved = best.specs.map((s) => resolveBp24(s, tile)).filter(Boolean);
if (resolved.length) {
  const farAt = { x: resolved[0].center[0] + 5000, z: resolved[0].center[1] };
  const nearAt = { x: resolved[0].center[0], z: resolved[0].center[1] };
  const tileHost = hostOf(resolved, nearAt);
  const tileFar = measureBp24Host(resolved, farAt);
  console.log(JSON.stringify({
    tile: best.key,
    n: resolved.length,
    drawsFar: tileFar.far.draws,
    bytesFar: tileFar.far.bytes,
    drawsNear: tileHost.near.draws,
    bytesNear: tileHost.near.bytes,
    drawsIfAllInterior: tileHost.all.draws,
    bytesIfAllInterior: tileHost.all.bytes,
  }, null, 2));
}
