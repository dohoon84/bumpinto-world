// [live-ride] 실시간 모드(?bus=realtime) 탑승 e2e — 실제 피드 녹화(scripts/fixtures/bus-replay-jeongja.json)를 프록시 URL 그대로 재생.
//   버스 훅(setupBus·ff·teleport) 없음: 실시간 버스가 녹화된 정류장에서 나와 다음 정류장에 스스로 서면(실제 시간) → PC 는 E, 모바일은 '버스 타기' 로 탄다
//   → 출발 뒤 하차 벨(E / '하차 벨') → 다음 정류장에서 내림. 유일한 상태 조작: 플레이어를 그 정류장 쉘터 옆에 세움(걷기 대신).
//   위치 응답(/locations)은 플레이어가 정류장에 선 뒤에 내보낸다(녹화 스냅샷 순서대로) — 버스가 정류장에 오는 장면부터 보기 위해.
// 사용: BASE=http://127.0.0.1:4862 OUT=/workspace/bw-mobile-shots/rt [DEV=pc,mobile] [WAIT=150]
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4862', OUT = process.env.OUT || '/tmp/rt', WAIT = +(process.env.WAIT || 150);
const DEVS = (process.env.DEV || 'pc,mobile').split(',');
// 헤드리스(소프트웨어 GL)는 프레임이 느려 게임 시간이 실제보다 늦게 간다(dt 상한 0.1s) → 화면을 작게·무거운 장식을 끄고 돌린다(버스·탑승 로직 무관)
const LIGHT = process.env.LIGHT ?? '&shadow=0&npcs=0&trucks=0&taxis=0&streams=0&shops=0&colours=0&streetlights=0&playgrounds=0&police=0&tank=0&roadster=0&bike=0&tower=0';
const R = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-replay-jeongja.json', import.meta.url)));
// 기다릴 정류장 = 녹화 때 실시간 버스가 가장 많이 지나던 정류장 중 녹화 위치 다음 정류장(정자2동행정복지센터 07090, 북쪽 방향). 같은 이름 건너편(07093)과 구분하려고 id 로
const STOP_ID = +(process.env.STOP_ID || R.stops[1].id), STOP = R.stops.find((x) => x.id === STOP_ID)?.name || String(STOP_ID);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const res = []; let fails = 0;
const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'} ${n}${i ? ' — ' + i : ''}`); if (!c) fails++; console.log(res.at(-1)); return c; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const DEV of DEVS) {
  const mob = DEV === 'mobile';
  const ctx = mob ? await b.newContext({ viewport: { width: +(process.env.MW || 852), height: +(process.env.MH || 393) }, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' }) : await b.newContext({ viewport: { width: +(process.env.PW || 1280), height: +(process.env.PH || 720) }, locale: 'ko-KR' });
  // 재생 프록시: 녹화된 URL 만 응답(나머지 404 → 게임이 시뮬로 폴백), /locations 는 release() 뒤에 스냅샷 순서대로
  let release; const go = new Promise((r) => { release = r; }); const seen = new Map(); let served = 0;
  await ctx.route(new URL(R.proxy).origin + '/**', async (route) => {
    const u = new URL(route.request().url()), k = u.pathname + u.search; served++;
    const hdr = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (R.locations[k]) { await go; const i = seen.get(k) || 0; seen.set(k, i + 1); const L = R.locations[k][Math.min(i, R.locations[k].length - 1)]; return route.fulfill({ status: L.status, headers: hdr, body: JSON.stringify(L.json) }); }
    const r = R.responses[k]; if (!r) return route.fulfill({ status: 404, headers: hdr, body: '{"error":"not recorded"}' });
    return route.fulfill({ status: r.status, headers: hdr, body: JSON.stringify(r.json) });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ev = (fn, a) => p.evaluate(fn, a);
  const shot = (n) => p.screenshot({ path: `${OUT}-${DEV}-${n}.png`, timeout: 120000 }).catch(() => {});
  const tap = async (sel) => { const r = await p.locator(sel).first().boundingBox(); if (!r) return false; await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); return true; };
  await p.goto(`${BASE}/?${mob ? 'mobile=1&' : ''}noticePopup=0&enter=1&at=jeongja&safe=59&bus=realtime${LIGHT}`);
  await p.waitForSelector('#nick', { state: 'visible', timeout: 150000 });
  await p.fill('#nick', '실시간테스트'); if (mob) await tap('#lobby-go'); else await p.click('#lobby-go');
  await p.waitForFunction(() => window.__jj?.ready && !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 180000 });
  const mode = await ev(() => ({ rt: !!__jj.transit?.rideSim?.source?.fallback, ride: !!__jj.transit?.rideSim }));
  ok(`${DEV}: realtime source with boarding (rideSim on fallback)`, mode.rt && mode.ride, JSON.stringify(mode));
  // 정류장 쉘터 앞(차도 쪽 3m, 사람이 버스 기다리는 자리)에 선다
  const at = await ev((name) => { const rs = __jj.transit.rideSim; const s = rs.stopById.get(name); if (!s?._pos) return null; const tr = s.tr || [0, 1]; const x = s._pos.x + tr[0] * 3, z = s._pos.z + tr[1] * 3; __jj.player.position.set(x, __jj.player.position.y, z); return { x, z, id: s.id }; }, STOP_ID);
  ok(`${DEV}: standing at ${STOP} (${STOP_ID})`, !!at);
  await p.waitForTimeout(3000);
  const g0 = await ev(() => __jj.transit.rideSim.sim.t || 0);
  release(); const t0 = Date.now();
  await shot('0-at-stop');
  // 실시간 버스가 와서 서기를 기다림
  let st = null, hint = '', panel = '', approach = [];
  while (Date.now() - t0 < WAIT * 1000) {
    st = await ev((mob) => {
      const F = __jj.transit.rideSim.sim, P = __jj.player.position, lv = F.buses.filter((x) => x.live);
      const near = lv.map((x) => { const q = x.P; let i = 1; while (i < q.cum.length - 1 && q.cum[i] < x.s) i++; return { id: x.id, s: +x.s.toFixed(1), v: +x.v.toFixed(2), state: x.state }; });
      const btn = mob ? document.querySelector('#m-hud [data-act="ride"]') : document.querySelector('[data-ride="e"].board');
      return { can: !!__jj.ride.canBoardBus, lab: btn && !btn.hidden && btn.offsetParent ? btn.textContent.trim() : '', live: near, hint: document.querySelector('#m-hud .m-bus-wait')?.textContent?.trim() || '', panel: document.querySelector('#stop-panel.open .hd')?.textContent?.trim() || '' };
    }, mob);
    if (st.hint) hint = st.hint; if (st.panel) panel = st.panel; approach.push(st.live.map((x) => `${x.s}@${x.v}`).join(','));
    if (st.can && st.lab) break;
    await p.waitForTimeout(500);
  }
  const tw = (Date.now() - t0) / 1000, gt = (await ev(() => __jj.transit.rideSim.sim.t || 0)) - g0;
  console.log(`  (${DEV}: game time ${gt.toFixed(0)}s over ${tw.toFixed(0)}s wall)`);
  ok(`${DEV}: live bus stopped here → board ${mob ? "'버스 타기'" : 'E prompt'} shown`, !!(st?.can && st?.lab), `after ${tw.toFixed(0)}s · "${st?.lab}" · live ${JSON.stringify(st?.live)}`);
  if (mob) ok(`${DEV}: waiting hint`, /버스 기다리는 중/.test(hint), hint);
  ok(`${DEV}: stop panel open`, !!panel, panel);
  if (!(st?.can && st?.lab)) { await shot('1-no-btn'); await ctx.close(); continue; }
  await shot('1-board-prompt');
  if (mob) await tap('#m-hud [data-act="ride"]'); else await p.keyboard.press('KeyE');
  const on = await p.waitForFunction(() => __jj.ride.ride?.mode === 'bus', null, { timeout: 20000 }).then(() => true, () => false);
  const rb = on ? await ev(() => { const r = __jj.ride.ride; const nx = r.P.stops[r.b.stopIdx + 1]; return { id: r.b.id, live: r.b.live, ride: r.b.ride, ref: r.P.ref, s: r.b.s, next: nx?.stop, nextName: __jj.transit.rideSim.stopById.get(nx?.stop)?.name }; }) : null;
  ok(`${DEV}: boarded a LIVE bus`, on && !!rb?.live && rb.ride === true, JSON.stringify(rb));
  if (!on) { await ctx.close(); continue; }
  // 출발 대기 → 벨
  await p.waitForFunction(() => __jj.ride.ride && !__jj.ride.ride.dwell, null, { timeout: 600000 }).catch(() => {});
  await p.waitForTimeout(2500); await shot('2-riding');
  const sMove = await ev(() => __jj.ride.ride?.b.s);
  ok(`${DEV}: bus departed and moves`, sMove > rb.s + 3, `s ${rb.s.toFixed(1)} → ${sMove?.toFixed(1)}`);
  if (mob) await tap('#m-hud [data-act="ride"]'); else await p.keyboard.press('KeyE');
  const bell = await ev(() => !!__jj.ride.ride?.bell);
  ok(`${DEV}: bell pressed`, bell);
  // 주행 중 위치가 뒤로 튀지 않음(고무줄 없음) + 하차
  let prev = sMove, back = 0;
  const t1 = Date.now();
  while (Date.now() - t1 < 900000) { const s = await ev(() => __jj.ride.ride?.b.s ?? null); if (s == null) break; if (s < prev - 0.5) back++; prev = s; await p.waitForTimeout(300); }
  const off = await ev((id) => { const rs = __jj.transit.rideSim; const s = rs.stopById.get(id); const P = __jj.player.position; return { ride: !!__jj.ride.ride, d: s?._pos ? Math.hypot(s._pos.x - P.x, s._pos.z - P.z) : null, last: __jj.ride.log?.list?.()?.at?.(-1) || null }; }, rb.next);
  ok(`${DEV}: no backward jumps while aboard`, back === 0, `${back} backward samples`);
  ok(`${DEV}: alighted at the next stop ${rb.nextName}`, !off.ride && off.d != null && off.d < 15, `d=${off.d?.toFixed(1)}m`);
  await p.waitForTimeout(1500); await shot('3-alighted');
  ok(`${DEV}: no page errors`, !errs.length, errs.slice(0, 2).join(' | '));
  console.log(`  (${DEV}: ${served} proxy requests served from the recording)`);
  await ctx.close();
}
await b.close();
console.log(`\n${res.length - fails}/${res.length} passed`);
process.exit(fails ? 1 : 0);
