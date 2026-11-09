import { chromium } from 'playwright';
import fs from 'fs';
const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || 'artifacts';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
fs.mkdirSync(OUT, { recursive: true });

async function boot(page) {
  await page.goto(B + '?at=arcade-seohyeon&hour=21&arcade=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('bw-launch-notice')?.remove(); document.getElementById('bw-bp24-poster')?.remove(); });
  await page.waitForSelector('[data-v2="guest"]', { timeout: 60000, state: 'attached' });
  await page.locator('[data-v2="guest"]').click({ force: true });
  await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 30000 });
  await page.click('.v2-world button[data-corridor-open]');
  const slot = await page.$('.v2-sel-slot button[data-v2-at="seohyeon"]') || await page.$('.v2-sel-slot button[data-v2-at="jeongja"]');
  if (slot) await slot.click();
  await page.waitForSelector('#lobby-go', { timeout: 180000 });
  await page.evaluate(() => { const n = document.querySelector('#nick'); if (n && !n.value.trim()) n.value = '테스터'; });
  await page.click('#lobby-go');
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.arcadeGame, null, { timeout: 180000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('#cc-overlay .cc-go')?.click(); document.getElementById('bw-bp24-poster')?.remove(); });
}
async function enterPang(page) {
  await page.evaluate(() => {
    const a = window.__jj.arcadeGame; const p = window.__jj.player.position;
    p.x = a.store.door[0]; p.z = a.store.door[1];
    a.outdoorTick(0.016, p); a.onKey({ code: 'KeyE', repeat: false });
  });
  await page.waitForFunction(() => !!window.__jj?.arcadeGame?.active && !window.__jj.arcadeGame.busy, null, { timeout: 25000 });
  await page.evaluate(() => window.__jj.arcadeGame.onKey({ code: 'KeyF', repeat: false }));
  await page.waitForSelector('.arc-pang', { timeout: 10000 });
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});

// Portrait 390
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await boot(page);
  await enterPang(page);
  await page.evaluate(() => {
    document.body.classList.add('mobile');
    document.querySelector('.arc-pang')?.classList.add('is-touch');
    document.querySelector('.arc-pang')?.classList.remove('is-desk', 'is-landscape');
    const o = document.querySelector('.arc-pang [data-orient]'); if (o) o.hidden = true;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(200);
  // start
  console.log('start', await page.evaluate(() => ({
    lv: document.querySelector('[data-lv]')?.textContent,
    howto: document.querySelector('.howto-body p')?.textContent?.slice(0, 40),
    time: document.querySelector('[data-time]')?.textContent,
  })));
  await page.screenshot({ path: `${OUT}/pang-lvl-port-start.png` });

  // mid with Lv badge — hide intro, fake mid state; best = max(best, current)
  await page.evaluate(() => {
    document.querySelector('[data-intro]').hidden = true;
    document.querySelector('[data-lv]').textContent = '6';
    document.querySelector('[data-score]').textContent = '4280';
    const bestEl = document.querySelector('[data-best]');
    const cur = 4280;
    const prev = Number(bestEl?.textContent || 0) || 0;
    if (bestEl) bestEl.textContent = String(Math.max(prev, cur));
    document.querySelector('[data-time]').textContent = '18';
    document.querySelector('[data-bar]').style.width = '60%';
    document.querySelector('[data-gauge]').style.width = '72%';
    document.querySelector('[data-combo]').textContent = 'x3';
    document.querySelector('[data-gauge-wrap]')?.classList.add('glow');
    const t = document.querySelector('[data-toast]');
    t.hidden = false; t.className = 'arc-pang-toast combo'; t.textContent = '콤보 x3!';
    document.querySelector('[data-mascot]')?.classList.add('cheer');
    const say = document.querySelector('[data-mascot-say]'); if (say) { say.hidden = false; say.textContent = '콤보 x3!'; }
  });
  await page.screenshot({ path: `${OUT}/pang-lvl-port-mid.png` });

  // level-up moment — confetti + banner mid-bounce (~0.45s)
  await page.evaluate(() => {
    document.querySelector('[data-toast]').hidden = true;
    const host = document.querySelector('[data-lu-confetti]');
    if (host) {
      host.innerHTML = '';
      const cols = ['#ff6b9d', '#ffe66d', '#7eb6ff', '#3ddc97', '#c084fc', '#ff9f1c', '#fff'];
      for (let i = 0; i < 42; i++) {
        const bit = document.createElement('i');
        bit.className = i % 3 === 0 ? 'star' : 'bit';
        bit.style.left = `${8 + Math.random() * 84}%`;
        bit.style.background = cols[i % cols.length];
        bit.style.animationDelay = `${Math.random() * 0.2}s`;
        bit.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
        host.appendChild(bit);
      }
    }
    const lu = document.querySelector('[data-levelup]');
    lu.hidden = false;
    lu.classList.remove('pop');
    void lu.offsetWidth;
    lu.classList.add('pop');
    document.querySelector('[data-lu-lv]').textContent = '7';
    document.querySelector('[data-lv]').textContent = '7';
    document.querySelector('.arc-pang').classList.add('is-levelup');
    document.querySelector('[data-lv-wrap]')?.classList.add('lv-pulse');
    document.querySelector('[data-bar]').style.width = '100%';
    document.querySelector('[data-time]').textContent = '30';
    document.querySelector('[data-time-wrap]')?.classList.add('refill');
  });
  await page.waitForTimeout(450); // mid scale-bounce peak
  await page.screenshot({ path: `${OUT}/pang-lvl-port-levelup.png` });

  // danger
  await page.evaluate(() => {
    document.querySelector('[data-levelup]').hidden = true;
    document.querySelector('.arc-pang').classList.remove('is-levelup');
    document.querySelector('.arc-pang').classList.add('is-danger', 'is-urgent');
    document.querySelector('[data-vignette]').hidden = false;
    document.querySelector('[data-time]').textContent = '3';
    document.querySelector('[data-bar]').style.width = '10%';
    document.querySelector('[data-time-wrap]')?.classList.add('urgent');
    document.querySelector('[data-lv]').textContent = '9';
  });
  await page.screenshot({ path: `${OUT}/pang-lvl-port-danger.png` });

  // result
  await page.evaluate(() => {
    document.querySelector('[data-vignette]').hidden = true;
    document.querySelector('.arc-pang').classList.remove('is-danger', 'is-urgent');
    const r = document.querySelector('[data-result]');
    r.hidden = false;
    r.innerHTML = `<div class="box cute result-v2">
      <div class="banner">시간 끝!</div>
      <div class="mascot big result-bum">🏆</div>
      <div class="result-lv">도달 <b>Lv.9</b></div>
      <p class="big">12450점</p>
      <div class="star-row"><span class="on">★</span><span class="on">★</span><span class="dim">★</span></div>
      <div class="rank-badge">랭킹 도전</div>
      <p class="sub">최고 콤보 6 · 배율 ×1.96</p>
      <div class="row"><button type="button" class="candy-go">한 판 더</button><button type="button">순위판</button><button type="button">오락실로</button></div>
    </div>`;
  });
  await page.screenshot({ path: `${OUT}/pang-lvl-port-result.png` });
  await page.close();
}

// Desktop mid
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await boot(page);
  await enterPang(page);
  await page.evaluate(() => {
    document.querySelector('[data-intro]').hidden = true;
    document.querySelector('[data-lv]').textContent = '4';
    document.querySelector('[data-score]').textContent = '2100';
    document.querySelector('[data-time]').textContent = '22';
    document.querySelector('[data-bar]').style.width = '73%';
    document.querySelector('[data-gauge]').style.width = '55%';
    document.querySelector('[data-combo]').textContent = 'x2';
  });
  console.log('desk', await page.evaluate(() => document.querySelector('.arc-pang')?.className));
  await page.screenshot({ path: `${OUT}/pang-lvl-desk-mid.png` });
  await page.close();
}

await browser.close();
console.log('done');
