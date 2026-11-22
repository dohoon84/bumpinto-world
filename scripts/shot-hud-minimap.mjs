// [v4b] PC HUD v3 원형 미니맵 확인 (shot=1 이면 ui-v2 가 꺼져서 따로). node scripts/shot-hud-minimap.mjs PORT OUTDIR [at=seongsu,...]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [PORT = '5311', OUT = '/tmp/hudmm', ATS = 'seongsu'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = {};
for (const at of ATS.split(',')) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/?ws=mock&at=${at}&hour=14&weather=clear&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0&hud=v3`, { timeout: 180000 });
  const t0 = Date.now(); let k = 0;
  while (Date.now() - t0 < 420000) {
    if (await page.evaluate(() => !!window.__jj?.ready)) break;
    // 입장 흐름: 눈에 보이는 시작/입장/게스트 버튼을 누른다
    await page.evaluate(() => { const re = /입장|시작|들어가|게스트|Guest|Enter|Start|Play|둘러보기|Continue|계속|확인|OK/i; for (const b of document.querySelectorAll('button, [role=button], a.btn')) { const r = b.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && re.test(b.textContent || '')) { b.click(); return; } } }).catch(() => {});
    if (++k % 10 === 0) await page.screenshot({ path: `${OUT}/boot-${at}-${k}.png` });
    await page.waitForTimeout(3000);
  }
  const ready = await page.evaluate(() => !!window.__jj?.ready);
  if (ready) {
    await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (/Enter World|월드 입장/.test(b.textContent || '') && b.getBoundingClientRect().width) { b.click(); break; } });
    await page.waitForTimeout(6000);
    await page.evaluate(async (at) => { const J = window.__jj; if (at === 'seongsu') { await J.corridor.ensureNear?.(-4377.3, -18946.7, { urgent: true }); await J.teleport(-4377.3, -18946.7, 0.05); J.cam.yaw = -0.32; } }, at);
    await page.waitForFunction(() => window.__jj?.seongsu?.ready, null, { timeout: 300000 });
    await page.evaluate(() => { const J = window.__jj; J.teleport(-4377.3, -18946.7, 0.05); });
    await page.waitForTimeout(8000);
    await page.evaluate(() => window.__h3mm?.toggle?.(true));
    await page.waitForTimeout(6000);
  }
  await page.screenshot({ path: `${OUT}/hud-minimap-${at}.png` });
  if (ready && process.env.TOUR === '1') { // 다른 동네로 순간이동하며 미니맵 이름 확인
    const spots = await page.evaluate(() => { const J = window.__jj, st = (n) => (J.corridor.stations || []).find((s) => s.name === n || s.name === n + '역'); const out = []; const add = (k, p) => { if (p && Number.isFinite(p.x)) out.push([k, p.x, p.z]); };
      add('명동', { x: -10915.6, z: -21492.5 }); const nt = J.namsan?.tower; add('남산', nt ? { x: (nt.ox ?? nt.x) + 44, z: (nt.oz ?? nt.z) + 6 } : null); add('강남역', st('강남')); add('판교역', st('판교')); add('정자역', J.data?.station); add('미금역', st('미금')); add('한강(합수부)', { x: -3850, z: -18100 }); return out; });
    res[at + ':tour'] = [];
    for (const [k, x, z] of spots) {
      await page.evaluate(async ([x, z]) => { const J = window.__jj; await J.corridor.ensureNear?.(x, z, { urgent: true }); await J.teleport(x, z); }, [x, z]).catch(() => {});
      await page.waitForTimeout(9000);
      const t = await page.evaluate(() => document.querySelector('.h3-mm-plaque')?.textContent || '');
      res[at + ':tour'].push([k, Math.round(x), Math.round(z), t]); console.log('tour', k, t);
      await page.screenshot({ path: `${OUT}/hud-minimap-tour-${k}.png`, clip: { x: 1060, y: 80, width: 220, height: 230 } });
    }
  }
  res[at] = await page.evaluate(() => ({ ready: !!window.__jj?.ready, h3: !!window.__h3mm, open: window.__h3mm?.stats?.().open, plaque: [...document.querySelectorAll('.h3-mm-plaque')].map((e) => e.textContent).filter(Boolean), pos: window.__jj?.player ? [Math.round(window.__jj.player.position.x), Math.round(window.__jj.player.position.z)] : null })).catch((e) => ({ err: String(e) }));
  res[at].errors = errors.slice(0, 5);
  console.log(at, JSON.stringify(res[at]));
  await page.context().close();
}
fs.writeFileSync(`${OUT}/hud-minimap.json`, JSON.stringify(res, null, 1));
await browser.close();
