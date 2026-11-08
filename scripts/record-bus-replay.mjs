// [live-ride] 실시간 버스 재생 픽스처 녹화: node scripts/record-bus-replay.mjs [out.json] [gapSec=60]
//   게임과 같은 코드(RealtimeBusSource)로 배포된 프록시(jeongja-bus-proxy Worker)에 실제로 요청하고, 받은 응답(JSON)을 URL 그대로 저장한다.
//   위치(/locations)는 gapSec 간격으로 두 번 받아 '진짜' 두 스냅샷을 남긴다(지어낸 값 없음). 일일 한도 보호: 한 번 녹화 ≈ 노선 수×3 + 정류장 2 요청.
import './corridor/test/dom-shim.mjs';
import fs from 'node:fs';
const { createBusSource } = await import('../src/transit/busSource.js');
const PROXY = process.env.PROXY || 'https://jeongja-bus-proxy.xn0texn073.workers.dev';
const out = process.argv[2] || 'scripts/fixtures/bus-replay-jeongja.json', gap = Number(process.argv[3] || 60);
const T = JSON.parse(fs.readFileSync('public/transit.json', 'utf8'));
const rec = { note: 'RECORDED from the live proxy feed (not synthetic). Replayed by tests via URL match; /locations has snapshots[] in time order.', proxy: PROXY, recordedAt: new Date().toISOString(), responses: {}, locations: {} };
const real = globalThis.fetch;
let phase = 0;
globalThis.fetch = async (url) => {
  const r = await real(url); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  const u = new URL(url), key = u.pathname + u.search;
  if (u.pathname === '/locations') (rec.locations[key] ||= [])[phase] = { status: r.status, json: j, at: new Date().toISOString() };
  else rec.responses[key] = { status: r.status, json: j };
  return { ok: r.ok, status: r.status, json: async () => j };
};
const src = createBusSource('realtime', T, { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 }, { proxy: PROXY });
await src._refresh();
console.log('state', src.locState, src.locError, 'routes', src.trackedRouteIds.length, 'vehicles', src.liveVehicles.length);
// 도착 정보: 실시간 버스가 가장 많이 지나는 정류장 2곳(e2e 가 기다리는 곳)
const cnt = new Map();
for (const v of src.liveVehicles) for (const st of v.P.stops) cnt.set(st.stop, (cnt.get(st.stop) || 0) + 1);
const stops = [...cnt].sort((a, b) => b[1] - a[1]).map(([id]) => T.stops.find((s) => s.id === id)).filter((s) => s?.ref).slice(0, 2);
for (const s of stops) { await src._fetch(s.ref.split(';')[0]); console.log('arrivals', s.name, s.ref, src.cache.get(s.ref.split(';')[0])?.list?.length); }
rec.stops = stops.map((s) => ({ id: s.id, name: s.name, ref: s.ref, x: s.x, z: s.z }));
if (gap > 0) { await new Promise((r) => setTimeout(r, gap * 1000)); phase = 1; await src._pollLocations(); console.log('2nd snapshot vehicles', src.liveVehicles.length); }
fs.writeFileSync(out, JSON.stringify(rec));
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(1) + 'KB', Object.keys(rec.responses).length, 'responses', Object.keys(rec.locations).length, 'location routes');
