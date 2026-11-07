// 지역마다 매장 밖·문 앞(E 들어가기) 한 장. OUT=... node scripts/shots-bump24-stores.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const B = 'http://127.0.0.1:5173/';
const OUT = process.env.OUT || 'artifacts';
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  ['정자', 'bump24-jeongja'],
  ['미금', 'bump24-mg67'],
  ['판교', 'bump24-pg100'],
  ['야탑', 'bump24-cr19405'],
  ['잠실', 'bump24-cr4276'],
  ['수내', 'bump24-cr5253'],
  ['서현', 'bump24-cr9344'],
  ['이매', 'bump24-cr18719'],
  ['모란', 'bump24-cr12446'],
  ['가천대', 'bump24-cr16082'],
  ['복정', 'bump24-cr7769'],
  ['장지', 'bump24-cr7801'],
  ['문정', 'bump24-cr10571'],
  ['가락시장', 'bump24-cr7944'],
  ['송파', 'bump24-cr140'],
  ['석촌', 'bump24-cr3086'],
];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

for (const [region, at] of shots) {
  const url = `${B}?shot=1&hour=14&at=${at}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 120000 });
  const id = at === 'bump24-jeongja' ? 'bump24-jeongja' : at.slice('bump24-'.length);
  const found = await page.waitForFunction((want) => {
    const lists = [];
    try { lists.push(...(window.__jj.bump24Game?._dbg?.stores || [])); } catch { /* 아직 */ }
    try { lists.push(...(window.__jj.jeongjaBp24?.stores || [])); } catch { /* 정자 외 */ }
    return lists.some((s) => s.id === want) || null;
  }, id, { timeout: 45000 }).then(() => true).catch(() => false);
  if (!found) { console.log('miss', region, at); continue; }
  await page.evaluate((want) => {
    const lists = [...(window.__jj.bump24Game?._dbg?.stores || []), ...(window.__jj.jeongjaBp24?.stores || [])];
    const st = lists.find((s) => s.id === want);
    const ox = -st.b[0], oz = -st.b[1];
    const x = st.door[0] + ox * 2.2, z = st.door[1] + oz * 2.2;
    const y = window.__jj.terrain ? window.__jj.terrain.getGroundHeight(x, z, 0) : 0;
    window.__jj.teleport(x, z, y);
    window.__jj.setMode('follow');
    window.__jj.cam.yaw = st.face;
    window.__jj.cam.pitch = -0.18;
    window.__jj.cam.dist = 16;
  }, id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/bump24-stores-${region}-ext.png` });
  await page.evaluate((want) => {
    const lists = [...(window.__jj.bump24Game?._dbg?.stores || []), ...(window.__jj.jeongjaBp24?.stores || [])];
    const st = lists.find((s) => s.id === want);
    const ox = -st.b[0], oz = -st.b[1];
    const x = st.door[0] + ox * 1.3, z = st.door[1] + oz * 1.3;
    const y = window.__jj.terrain ? window.__jj.terrain.getGroundHeight(x, z, 0) : 0;
    window.__jj.teleport(x, z, y);
    window.__jj.cam.yaw = st.face;
    window.__jj.cam.pitch = -0.04;
    window.__jj.cam.dist = 6.2;
  }, id);
  await page.waitForFunction(() => (document.querySelector('.b24-hint')?.textContent || '').includes('들어가기'), null, { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/bump24-stores-${region}-entry.png` });
  const hint = await page.locator('.b24-hint').textContent().catch(() => '');
  console.log(region, at, (hint || '').replace(/\s+/g, ' ').slice(0, 40));
}
await browser.close();
