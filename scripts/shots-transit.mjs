// 버스/횡단보도 스크린샷: shot-5-bus.png (정자역 정류장에 정차한 버스), shot-6-crosswalk.png (보행 초록불 횡단보도)
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { console.log('[console]', m.type(), m.text()); } });
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(URL + '?shot=1');
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 120000 });
await wait(2500);

// ---- shot 5: 정자역(07624) 정류장에 정차한 버스 ----
const STOP_REF = process.env.STOP_REF || '07624';
const info5 = await page.evaluate((ref) => {
  const T = __jj.transit, src = T.source, stop = T.stops.find((s) => s.ref.split(';')[0] === ref);
  let bus = null;
  for (let k = 0; k < 600 && !bus; k++) {
    T.fastForward(1);
    bus = src.buses.find((b) => b.dwell > 2 && b.P.stops[b.stopIdx]?.stop === stop.id);
  }
  if (!bus) return { ok: false };
  bus.dwell = 60; // 촬영 동안 정차 유지
  const v = src.vehicles().find((x) => x.id === bus.id);
  const tr = stop.tr, hx = Math.sin(v.heading), hz = Math.cos(v.heading);
  // 플레이어: 쉘터 뒤쪽 인도, 카메라: 인도 쪽 + 버스 앞쪽 대각선
  __jj.setMode('follow');
  __jj.teleport(stop._pos.x - tr[0] * 2 + hx * 4, stop._pos.z - tr[1] * 2 + hz * 4);
  const cx = -tr[0] * 0.75 + hx * 0.66, cz = -tr[1] * 0.75 + hz * 0.66;
  Object.assign(__jj.cam, { yaw: Math.atan2(cx, cz), pitch: 0.2, dist: 19 });
  return { ok: true, stop: stop.name, ref: bus.P.ref, type: bus.P.type, bus: [v.x, v.z] };
}, STOP_REF);
console.log('shot5', JSON.stringify(info5));
await wait(2500);
await page.screenshot({ path: 'shot-5-bus.png' });
const panel5 = await page.evaluate(() => document.getElementById('stop-panel').innerText);
console.log('panel:', panel5.replace(/\n/g, ' | '));

// ---- shot 6: 정자역에서 가까운 신호 횡단보도, 보행 초록불 ----
const info6 = await page.evaluate(() => {
  const T = __jj.transit, st = __jj.data.station;
  const sig = T.crossings.filter((c) => c.sig && c.w >= 9).sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z));
  const c = sig[Number(new URLSearchParams(location.search).get('xi') || 0)];
  // 빨간불 -> 초록불로 바뀐 직후까지 진행
  let prev = T.pedLight(c);
  for (let k = 0; k < 1200; k++) { T.fastForward(0.1, 0.1); const s = T.pedLight(c); if (prev === 'red' && s === 'green') break; prev = s; }
  T.fastForward(2);
  const [dx, dz] = c.dir, nx = -dz, nz = dx;
  __jj.setMode('follow');
  __jj.teleport(c.x - nx * (c.w / 2 + 2.2) + dx * 1.5, c.z - nz * (c.w / 2 + 2.2) + dz * 1.5);
  // 카메라: 보행자 뒤, 횡단보도를 따라 건너편을 바라봄(약간 비스듬히)
  const yaw = Math.atan2(-nx + dx * 0.35, -nz + dz * 0.35);
  Object.assign(__jj.cam, { yaw, pitch: 0.3, dist: 15 });
  return { light: T.pedLight(c), road: c.road, kind: c.kind, w: c.w, cl: c.cl, at: [c.x, c.z] };
});
console.log('shot6', JSON.stringify(info6));
await wait(2000);
const light6 = await page.evaluate(() => { const T = __jj.transit, st = __jj.data.station; const c = T.crossings.filter((c) => c.sig && c.w >= 9).sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0]; return T.pedLight(c); });
await page.screenshot({ path: 'shot-6-crosswalk.png' });
console.log('light at capture', light6);

// 상태 점검: NPC 대기 횟수, 버스 수, 신호 대기 버스
await wait(15000);
const stat = await page.evaluate(() => ({ npcWaits: __jj.npcs.waitCount || 0, buses: __jj.transit.source.buses.length, xingStops: __jj.transit.source.buses.filter((b) => b.state === 'xing').length }));
console.log('stat', JSON.stringify(stat), 'errors', errors.length);
await browser.close();
