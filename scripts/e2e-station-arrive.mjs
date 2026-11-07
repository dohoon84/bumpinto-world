// node scripts/e2e-station-arrive.mjs [--slow 2500] [--off] [--shots dir]
//   [arrivefix] #43 회귀 확인: 역을 골라 들어올 때 정자역(기본 스폰) 50m 안에서 내 아바타가 '보이는' 프레임이 0개여야 한다.
//   경로 3개: passport(?passport=1&at= 로그인 상태 입장) · lobby(게스트 로비 입장) · ingame(미금 입장 뒤 게임 안 🌏 로 역 이동 = #43 신고 상황). 상세 타일 응답을 --slow ms 늦춘다.
//   vite dev 를 띄우고 headless chromium(swiftshader) 으로 매 프레임 위치·보임·로딩 화면을 기록. 서버(phone)는 필요 없음(입장 요청 실패 → 오프라인 세션).
//   --off 이면 ?arrivefix=0 (예전 동작, 비교용 — 실패가 정상).
import net from 'node:net'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import path from 'node:path'; import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SLOW = +arg('--slow', 2500), OFF = process.argv.includes('--off'), SHOTS = arg('--shots', null), DEST = arg('--at', 'pangyo');
const JZ = { x: 0, z: 0 }, R = 50;
const freePort = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(freePort(p + 1))); s.listen(p, '127.0.0.1', () => s.close(() => res(p))); });
const port = await freePort(5610);
const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { if (vite.exitCode == null) vite.kill('SIGTERM'); }; process.on('exit', stop);
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('vite timeout')), 60000); vite.stdout.on('data', (d) => { if (/Local:/.test(String(d))) { clearTimeout(t); res(); } }); });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function run(kind) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((k) => {
    if (k !== 'lobby') { localStorage.setItem('jeongja3d.profile', JSON.stringify({ name: 'probe', look: { color: '#3388ff', hair: 'short' } })); sessionStorage.setItem('jeongja3d.passport.active', '1'); }
    const t0 = performance.now(); window.__log = [];
    const tick = () => {
      const j = window.__jj, p = j?.player?.position, ld = document.getElementById('enter-loading');
      if (p) window.__log.push([Math.round(performance.now() - t0), +p.x.toFixed(1), +p.z.toFixed(1), j.player.visible ? 1 : 0, ld && !ld.hidden && getComputedStyle(ld).display !== 'none' ? 1 : 0, document.body.classList.contains('in-lobby') ? 1 : 0]);
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  }, kind);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  if (SLOW) await page.route((u) => /\/corridor\/(.*\/)?tiles\//.test(u.pathname), async (r) => { await new Promise((s) => setTimeout(s, SLOW)); r.continue(); });
  const at0 = kind === 'ingame' ? 'migeum' : DEST; // ingame: 미금으로 들어간 뒤 게임 안 지구본으로 DEST 이동
  const q = `${kind === 'lobby' ? 'enter=1' : 'passport=1'}&at=${at0}${OFF ? '&arrivefix=0' : ''}`;
  await page.goto(`http://127.0.0.1:${port}/?${q}`);
  if (kind === 'lobby') {
    await page.waitForSelector('#lobby-go', { state: 'visible', timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.fill('#nick', 'probe').catch(() => {});
    await page.click('#lobby-go');
  }
  // 입장 후 아바타가 보이고 로딩 화면이 닫힐 때까지 + 여유
  try { await page.waitForFunction(() => window.__jj?.player?.visible && !(document.getElementById('enter-loading') && !document.getElementById('enter-loading').hidden), null, { timeout: 150000, polling: 200 }); }
  catch (e) { const st = await page.evaluate(() => ({ last: window.__log.slice(-3), arriving: window.__jj?.arriving, body: document.body.className })).catch(() => null); throw new Error(`entry never finished: ${JSON.stringify(st)} errs=${JSON.stringify(errs)}`); }
  await page.waitForTimeout(6000);
  if (kind === 'ingame') {
    await page.waitForFunction(() => window.__jj?.player?.visible && Math.hypot(window.__jj.player.position.x - 58.9, window.__jj.player.position.z - 1845) < 300, null, { timeout: 150000, polling: 200 }); // 미금에 도착한 뒤
    await page.waitForTimeout(4000);
    await page.evaluate(() => { window.__log.length = 0; });
    await page.evaluate((d) => window.__jj.gateEnter(d), DEST);
    await page.waitForFunction(() => window.__jj?.player?.visible && Math.hypot(window.__jj.player.position.x - 58.9, window.__jj.player.position.z - 1845) > 300 && !(document.getElementById('enter-loading') && !document.getElementById('enter-loading').hidden), null, { timeout: 150000, polling: 200 });
    await page.waitForTimeout(6000);
  }
  const log = await page.evaluate(() => window.__log);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${kind}-${OFF ? 'off' : 'on'}.png`) });
  await ctx.close();
  const near = (r) => Math.hypot(r[1] - JZ.x, r[2] - JZ.z) < R;
  const bad = log.filter((r) => r[3] && near(r));
  const badMs = bad.length ? bad[bad.length - 1][0] - bad[0][0] : 0;
  const loadEnd = log.find((r, i) => i && !r[4] && log[i - 1][4])?.[0] ?? null;
  const firstVis = log.find((r) => r[3]);
  const arrive = log.find((r) => r[3] && !near(r));
  let prev = ''; const transitions = []; for (const r of log) { const k = r.slice(1).join(','); if (k !== prev) { transitions.push(r); prev = k; } }
  return { kind, query: q, slowMs: SLOW, frames: log.length, jeongjaVisibleFrames: bad.length, jeongjaVisibleMs: badMs, firstVisibleAt: firstVis?.[0] ?? null, firstVisiblePos: firstVis ? [firstVis[1], firstVis[2]] : null, visibleAtDestAt: arrive?.[0] ?? null, loadingClosedAt: loadEnd, transitions, errs: errs.slice(0, 5) };
}
let fail = 0;
for (const kind of (arg('--paths', 'passport,lobby,ingame')).split(',')) {
  const r = await run(kind);
  const pass = r.jeongjaVisibleFrames === 0 && r.visibleAtDestAt != null && !r.errs.length;
  if (!pass) fail++;
  console.log(JSON.stringify({ ...r, pass }));
}
await browser.close(); stop();
console.log(fail ? `station-arrive e2e: ${fail} FAIL${OFF ? ' (expected with --off)' : ''}` : 'station-arrive e2e: all ok');
process.exit(fail && !OFF ? 1 : 0);
