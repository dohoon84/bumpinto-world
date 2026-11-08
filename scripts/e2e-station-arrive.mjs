// node scripts/e2e-station-arrive.mjs [--slow 2500] [--off] [--shots dir] [--artifacts dir]
//   [arrivefix] #43 회귀 확인: 역을 골라 들어올 때 정자역(기본 스폰) 50m 안에서 내 아바타가 '보이는' 프레임이 0개여야 한다.
//   경로: passport(?passport=1&at=) · lobby(게스트 로비) · ingame(미금 입장 뒤 게임 안 🌏 역 이동).
//   [pickfirst] #42: saved-passport · saved-lobby 는 정자 좌표의 이어하기(bw.uiv2.resume.v1)와 서버/로컬 위치(jeongja3d.place)가 있어도 고른 역 출구.
//   ui-pc-* · ui-mobile-* 는 시작화면에서 그 역을 직접 고른다. ui-pc-continue 는 '이어하기'가 저장 자리를 쓴다.
//   상세 타일 응답을 --slow ms 늦춘다. vite dev + headless chromium(swiftshader). 서버(phone)는 필요 없음.
//   --off 이면 ?arrivefix=0 (예전 동작, 비교용 — 실패가 정상). --artifacts 에 고른 역 스크린샷을 남긴다.
import net from 'node:net'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import path from 'node:path'; import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SLOW = +arg('--slow', 2500), OFF = process.argv.includes('--off'), SHOTS = arg('--shots', null), DEST = arg('--at', 'pangyo');
const ARTIFACTS = arg('--artifacts', null);
const JZ = { x: 0, z: 0 }, R = 50;
const PLACES = { pangyo: { x: 264.7, z: -3100.4 }, migeum: { x: 58.9, z: 1845 } };
const SAVED = { x: 15, y: 0, z: 18, ry: 0.4 }; // 정자 50m 안. 고른 역이 아니라 이 자리로 시작하면 실패
const DEV = '11111111-1111-4111-8111-111111111111';
const freePort = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(freePort(p + 1))); s.listen(p, '127.0.0.1', () => s.close(() => res(p))); });
const port = await freePort(5610);
const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { if (vite.exitCode == null) vite.kill('SIGTERM'); }; process.on('exit', stop);
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('vite timeout')), 60000); vite.stdout.on('data', (d) => { if (/Local:/.test(String(d))) { clearTimeout(t); res(); } }); });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let artifacts = ARTIFACTS;
try { if (artifacts) mkdirSync(artifacts, { recursive: true }); } catch { artifacts = null; }

async function run(kind, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const destId = opt.at || (kind === 'ingame' ? 'migeum' : DEST);
  await ctx.addInitScript(({ k, seed, dev, saved }) => {
    if (seed) {
      const t = Date.now();
      localStorage.setItem('jeongja3d.device', dev);
      localStorage.setItem('jeongja3d.place', JSON.stringify(saved));
      localStorage.setItem('bw.uiv2.resume.v1', JSON.stringify({ [`g:${dev}|jeongja`]: { ...saved, t } }));
      localStorage.setItem('bw.uiv2.lastStation', JSON.stringify({ region: 'jeongja', at: 'migeum', t: t - 8000 }));
    }
    if (k !== 'lobby') { localStorage.setItem('jeongja3d.profile', JSON.stringify({ name: 'probe', look: { color: '#3388ff', hair: 'short' } })); sessionStorage.setItem('jeongja3d.passport.active', '1'); }
    const t0 = performance.now(); window.__log = [];
    const tick = () => {
      const j = window.__jj, p = j?.player?.position, ld = document.getElementById('enter-loading');
      if (p) window.__log.push([Math.round(performance.now() - t0), +p.x.toFixed(1), +p.z.toFixed(1), j.player.visible ? 1 : 0, ld && !ld.hidden && getComputedStyle(ld).display !== 'none' ? 1 : 0, document.body.classList.contains('in-lobby') ? 1 : 0]);
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  }, { k: kind, seed: !!opt.seed, dev: DEV, saved: SAVED });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  if (SLOW) await page.route((u) => /\/corridor\/(.*\/)?tiles\//.test(u.pathname), async (r) => { await new Promise((s) => setTimeout(s, SLOW)); r.continue(); });
  const at0 = kind === 'ingame' ? 'migeum' : destId; // ingame: 미금으로 들어간 뒤 게임 안 지구본으로 DEST 이동
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
  const goal = PLACES[kind === 'ingame' ? DEST : destId];
  const lastVis = [...log].reverse().find((r) => r[3]);
  const endedM = lastVis && goal ? Math.hypot(lastVis[1] - goal.x, lastVis[2] - goal.z) : null;
  return { kind: opt.label || kind, query: q, seeded: !!opt.seed, slowMs: SLOW, frames: log.length, jeongjaVisibleFrames: bad.length, jeongjaVisibleMs: badMs, firstVisibleAt: firstVis?.[0] ?? null, firstVisiblePos: firstVis ? [firstVis[1], firstVis[2]] : null, visibleAtDestAt: arrive?.[0] ?? null, endedM: endedM == null ? null : +endedM.toFixed(1), loadingClosedAt: loadEnd, transitions, errs: errs.slice(0, 5) };
}

// 시작화면에서 역을 직접 고르거나(게스트·모바일) '이어하기'를 누른다. 정자 이어하기·로컬 위치가 저장돼 있어도 고른 역 출구로.
async function uiCase(kind) {
  const mobile = kind.includes('mobile');
  const cont = kind.endsWith('continue');
  const station = kind.endsWith('pangyo') ? 'pangyo' : 'migeum';
  const goal = cont ? SAVED : PLACES[station];
  const ctx = await browser.newContext({ viewport: mobile ? { width: 900, height: 420 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(({ dev, saved }) => {
    const t = Date.now();
    localStorage.setItem('jeongja3d.device', dev);
    localStorage.setItem('jeongja3d.place', JSON.stringify(saved));
    localStorage.setItem('bw.uiv2.resume.v1', JSON.stringify({ [`g:${dev}|jeongja`]: { ...saved, t } }));
    localStorage.setItem('bw.uiv2.lastStation', JSON.stringify({ region: 'jeongja', at: 'migeum', t: t - 8000 }));
    localStorage.setItem('jeongja3d.profile', JSON.stringify({ name: 'probe', look: { color: '#3388ff', hair: 'short' } }));
    const t0 = performance.now(); window.__log = [];
    const tick = () => {
      const j = window.__jj, p = j?.player?.position, ld = document.getElementById('enter-loading');
      if (p) window.__log.push([Math.round(performance.now() - t0), +p.x.toFixed(1), +p.z.toFixed(1), j.player.visible ? 1 : 0, ld && !ld.hidden && getComputedStyle(ld).display !== 'none' ? 1 : 0]);
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  }, { dev: DEV, saved: SAVED });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  if (SLOW) await page.route((u) => /\/corridor\/(.*\/)?tiles\//.test(u.pathname), async (r) => { await new Promise((s) => setTimeout(s, SLOW)); r.continue(); });
  await page.goto(`http://127.0.0.1:${port}/?${mobile ? 'mobile=1&' : ''}noticePopup=0${OFF ? '&arrivefix=0' : ''}`);
  if (cont) {
    await page.waitForSelector('[data-v2="continue"]', { timeout: 120000 });
    await page.click('[data-v2="continue"]');
  } else if (mobile) {
    await page.waitForSelector('#m-landing [data-act="pick"]', { timeout: 120000 });
    await page.click('#m-landing [data-act="pick"]');
    await page.waitForSelector(`#m-landing [data-stn="${station}"]`, { timeout: 30000 });
    await page.click(`#m-landing [data-stn="${station}"]`);
    await page.click('#m-landing [data-act="go"]');
  } else {
    await page.waitForSelector('[data-v2="guest"]', { timeout: 120000 });
    await page.click('[data-v2="guest"]');
    // 예전 지구본 목록에도 data-corridor-open 이 있어(CSS 로 숨김) v2 카드만 누른다
    const line = page.locator('.v2-world [data-corridor-open="1"]');
    await line.first().waitFor({ state: 'visible', timeout: 120000 });
    await line.first().click();
    const stn = page.locator(`.v2-picker button.v2-stn[data-v2-at="${station}"]`);
    await stn.waitFor({ state: 'visible', timeout: 60000 });
    await stn.click();
  }
  await page.waitForSelector('#lobby-go', { state: 'visible', timeout: 180000 });
  await page.waitForTimeout(600);
  await page.fill('#nick', 'probe').catch(() => {});
  await page.click('#lobby-go');
  try {
    await page.waitForFunction(({ x, z, cont: isCont }) => {
      const j = window.__jj, p = j?.player?.position;
      const ld = document.getElementById('enter-loading');
      if (!p || !j.player.visible) return false;
      if (ld && !ld.hidden) return false;
      return Math.hypot(p.x - x, p.z - z) < (isCont ? 40 : 300);
    }, { x: goal.x, z: goal.z, cont }, { timeout: 180000, polling: 200 });
  } catch (e) {
    const st = await page.evaluate(() => ({ last: (window.__log || []).slice(-4), pos: window.__jj?.player && { x: window.__jj.player.position.x, z: window.__jj.player.position.z, v: window.__jj.player.visible }, body: document.body.className, arriving: window.__jj?.arriving })).catch(() => null);
    await ctx.close();
    return { kind, pass: false, error: `${e.message} ${JSON.stringify(st)}`, errs: errs.slice(0, 5) };
  }
  await page.waitForTimeout(2000);
  if (artifacts) {
    const name = cont ? 'pc-continue.png' : `${mobile ? 'mobile' : 'pc'}-pick-${station}.png`;
    await page.screenshot({ path: path.join(artifacts, name) });
  }
  const log = await page.evaluate(() => window.__log || []);
  await ctx.close();
  const nearJz = (r) => Math.hypot(r[1] - JZ.x, r[2] - JZ.z) < R;
  const bad = cont ? [] : log.filter((r) => r[3] && nearJz(r));
  const lastVis = [...log].reverse().find((r) => r[3]);
  const dist = lastVis ? Math.hypot(lastVis[1] - goal.x, lastVis[2] - goal.z) : 9999;
  const pass = !errs.length && bad.length === 0 && dist < (cont ? 40 : 300);
  return { kind, pass, dist: +dist.toFixed(1), final: lastVis ? [lastVis[1], lastVis[2]] : null, jeongjaVisibleFrames: bad.length, errs: errs.slice(0, 5) };
}

let fail = 0;
const paths = arg('--paths', 'passport,lobby,ingame,saved-passport,saved-lobby,ui-pc-migeum,ui-pc-pangyo,ui-mobile-migeum,ui-mobile-pangyo,ui-pc-continue').split(',').filter(Boolean);
for (const kind of paths) {
  let r;
  try {
    if (kind === 'saved-passport') r = await run('passport', { seed: true, at: 'pangyo', label: kind });
    else if (kind === 'saved-lobby') r = await run('lobby', { seed: true, at: 'migeum', label: kind });
    else if (kind.startsWith('ui-')) r = await uiCase(kind);
    else r = await run(kind);
  } catch (e) {
    fail++;
    console.log(JSON.stringify({ kind, pass: false, error: String(e.message || e).slice(0, 500) }));
    continue;
  }
  const pass = r.pass != null ? r.pass : (r.jeongjaVisibleFrames === 0 && r.visibleAtDestAt != null && !r.errs.length && (r.endedM == null || r.endedM < 400));
  if (!pass) fail++;
  console.log(JSON.stringify({ ...r, pass }));
}
await browser.close(); stop();
console.log(fail ? `station-arrive e2e: ${fail} FAIL${OFF ? ' (expected with --off)' : ''}` : 'station-arrive e2e: all ok');
process.exit(fail && !OFF ? 1 : 0);
