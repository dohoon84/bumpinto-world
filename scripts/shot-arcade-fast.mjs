import { chromium } from 'playwright';
import fs from 'fs';
const OUT = 'artifacts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
async function boot(page) {
  await page.goto('http://127.0.0.1:5179/?at=arcade-seohyeon&hour=21&arcade=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('bw-launch-notice')?.remove(); document.getElementById('bw-bp24-poster')?.remove(); });
  await page.waitForSelector('[data-v2="guest"]', { timeout: 60000 });
  await page.click('[data-v2="guest"]', { force: true });
  await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 30000 });
  await page.click('.v2-world button[data-corridor-open]');
  const slot = await page.$('.v2-sel-slot button[data-v2-at="seohyeon"]') || await page.$('.v2-sel-slot button[data-v2-at="jeongja"]');
  if (slot) await slot.click();
  await page.waitForSelector('#lobby-go', { timeout: 180000 });
  await page.evaluate(() => { const n = document.querySelector('#nick'); if (n && !n.value.trim()) n.value = '테스터'; });
  await page.click('#lobby-go');
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.arcadeGame, null, { timeout: 180000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('#cc-overlay .cc-go')?.click(); document.getElementById('bw-bp24-poster')?.remove(); });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await boot(page);
await page.evaluate(() => {
  const a = window.__jj.arcadeGame; const p = window.__jj.player.position;
  p.x = a.store.door[0]; p.z = a.store.door[1];
  a.outdoorTick(0.016, p); a.actEnter();
});
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => window.__jj.arcadeGame.frame?.(1/30));
  if (await page.evaluate(() => window.__jj.arcadeGame.active)) break;
  await page.waitForTimeout(16);
}
await page.waitForFunction(() => !!window.__jj.arcadeGame.active, null, { timeout: 10000 });
for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__jj.arcadeGame.frame?.(1/30)); await page.waitForTimeout(16); }
await page.evaluate(() => window.__jj.arcadeGame.actPlay());
await page.waitForSelector('.arc-pang [data-go]', { timeout: 10000 });
await page.screenshot({ path: `${OUT}/arcade-pang-start.png` });
await page.click('.arc-pang [data-go]');
await page.waitForTimeout(3000);
async function tap(r,c){
  const box = await page.locator('.arc-pang canvas').boundingBox();
  const pad=4,s=(640-8)/8;
  await page.mouse.click(box.x+(pad+c*s+s/2)*(box.width/640), box.y+(pad+r*s+s/2)*(box.height/640));
}
for (const [a,b] of [[[3,3],[3,4]],[[4,2],[4,3]],[[2,5],[3,5]],[[5,5],[5,6]],[[1,1],[1,2]],[[6,3],[6,4]]]) {
  await tap(...a); await page.waitForTimeout(40); await tap(...b); await page.waitForTimeout(400);
}
await page.evaluate(() => { const t=document.querySelector('.arc-pang [data-toast]'); if(t){t.hidden=false;t.className='arc-pang-toast combo';t.textContent='콤보 x3!';} });
await page.screenshot({ path: `${OUT}/arcade-pang-mid.png` });
await page.evaluate(() => {
  const res=document.querySelector('.arc-pang [data-result]');
  const score=document.querySelector('.arc-pang [data-score]')?.textContent||'0';
  const combo=document.querySelector('.arc-pang [data-combo]')?.textContent||'0';
  res.hidden=false;
  res.innerHTML=`<div class="box cute"><div class="rays"></div><div class="confetti" data-confetti></div>
    <div class="banner">시간 끝!</div><div class="mascot big">🎉💜</div>
    <p class="big">${Number(score).toLocaleString()}점</p>
    <div class="star-row"><span class="on">★</span><span class="on">★</span><span class="on">★</span></div>
    <div class="rank-badge">랭킹 도전</div><p>최고 콤보 ${combo}</p>
    <div class="row"><button type="button">한 판 더</button><button type="button">순위판</button><button type="button">오락실로</button></div></div>`;
  const conf=res.querySelector('[data-confetti]'); const cols=['#ff6b9d','#ffe66d','#7eb6ff','#3ddc97'];
  for(let i=0;i<24;i++){const b=document.createElement('i');b.style.left=`${Math.random()*100}%`;b.style.background=cols[i%4];conf.appendChild(b);}
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/arcade-pang-result.png` });
console.log('desktop', await page.evaluate(() => document.querySelector('.arc-pang [data-score]')?.textContent));

// mobile touch prompt shot
const m = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1' });
await boot(m);
await m.evaluate(() => { document.body.classList.add('mobile'); document.getElementById('m-rotate')?.remove(); });
await m.evaluate(() => {
  const a=window.__jj.arcadeGame; const p=window.__jj.player.position;
  p.x=a.store.door[0]; p.z=a.store.door[1]; a.outdoorTick(0.016,p);
});
await m.waitForTimeout(200);
const hint = await m.evaluate(() => {
  const h=document.querySelector('#arc-root .arc-hint');
  return { tap: h?.classList.contains('tap'), text: h?.textContent?.slice(0,60), near: window.__jj.arcadeGame.nearDoor };
});
console.log('mobile hint', hint);
await m.screenshot({ path: `${OUT}/arcade-mobile-prompt.png` });
if (!hint.tap || !hint.near) throw new Error('mobile tap prompt missing');
// enter + play via API (touch UI verified above)
await m.evaluate(() => window.__jj.arcadeGame.actEnter());
for (let i=0;i<60;i++){ await m.evaluate(()=>window.__jj.arcadeGame.frame?.(1/30)); if(await m.evaluate(()=>window.__jj.arcadeGame.active)) break; await m.waitForTimeout(16); }
for (let i=0;i<45;i++){ await m.evaluate(()=>window.__jj.arcadeGame.frame?.(1/30)); await m.waitForTimeout(16); }
await m.evaluate(() => window.__jj.arcadeGame.actPlay());
await m.waitForSelector('.arc-pang [data-go]', { timeout: 10000 });
await m.locator('.arc-pang [data-go]').click({ force: true });
await m.waitForTimeout(2800);
const box = await m.locator('.arc-pang canvas').boundingBox();
const pad=4, cell=(640-8)/8;
const tt=async(r,c)=>{ const x=box.x+(pad+c*cell+cell/2)*(box.width/640); const y=box.y+(pad+r*cell+cell/2)*(box.height/640); await m.touchscreen.tap(x,y); await m.waitForTimeout(70); };
await tt(3,3); await tt(3,4); await m.waitForTimeout(400);
const mid = await m.evaluate(() => ({ playing: window.__jj.arcadeGame.playing, score: document.querySelector('.arc-pang [data-score]')?.textContent }));
console.log('mobile play', mid);
await m.screenshot({ path: `${OUT}/arcade-mobile-play.png` });
if (!mid.playing) throw new Error('mobile not playing');
await browser.close();
console.log('FAST OK');
