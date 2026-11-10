import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const B = process.env.BASE || 'http://127.0.0.1:5371/';
const OUT = process.env.OUT || '/workspace/bw-gangnam-underground/artifacts/gunder-walk';
await mkdir(OUT, { recursive: true });

const Q = 'enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&bgm=0&noticePopup=0&hour=14&weather=clear&subwayVoice=0';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });

const until = (fn, arg, t = 90000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });

await page.goto(B + '?' + Q, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 });
await page.waitForTimeout(800);

const st = await page.evaluate(() => {
  const s = __jj.subway.ensureStation('gangnam');
  return {
    ok: !!s,
    exits: (s?.ent?.list || []).map((e) => ({ id: e.exit.id, ref: e.exit.ref, x: +e.x.toFixed(1), z: +e.z.toFixed(1), ry: +e.ry.toFixed(3) })),
  };
});
assert.ok(st.ok && st.exits.length >= 8, 'gangnam entrances');
const e11 = st.exits.find((e) => e.ref === '11') || st.exits[0];
await page.evaluate((id) => __jj.subway.enterById(id), e11.id);
await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 45000);
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const i = __jj.subway.inside;
  return { kind: i?.kind, shops: i?.stats?.()?.shops, closed: i?.stats?.()?.closed, hasSet: typeof i?.setView === 'function' };
});
console.log('inside', JSON.stringify(info));
assert.ok(info.hasSet, 'setView');

async function shotShop(key, pick) {
  const shop = await page.evaluate((fnSrc) => {
    const i = __jj.subway.inside;
    const fn = eval(`(${fnSrc})`);
    const s = fn(i.layout.shops) || i.layout.shops.find((q) => !q.closed);
    const yaw = s.axis === 'x' ? (s.side > 0 ? Math.PI : 0) : (s.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const px = s.axis === 'x' ? s.cx : (s.side > 0 ? s.x0 + 1.05 : s.x1 - 1.05);
    const pz = s.axis === 'x' ? (s.side > 0 ? s.z0 + 1.05 : s.z1 - 1.05) : s.cz;
    i.setView(px, pz, yaw, 0.08, 3.2);
    return { name: s.name, type: s.type, axis: s.axis, side: s.side, cx: s.cx, cz: s.cz };
  }, pick.toString());
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${key}.png` });
  console.log(key, shop);
  return shop;
}

await shotShop('shop-in-fashion', (shops) => shops.find((q) => !q.closed && q.type === 'fashion' && q.rich && q.axis === 'x'));
await shotShop('shop-in-cosmetics', (shops) => shops.find((q) => !q.closed && q.type === 'cosmetics' && q.axis === 'x' && q.side < 0));
await shotShop('shop-in-cafe', (shops) => shops.find((q) => !q.closed && q.type === 'cafe'));

// 예전에 막혀 있던 남북→2호선 모서리 통로
await page.evaluate(() => {
  const i = __jj.subway.inside;
  i.setView(1.1, -6.15, -Math.PI / 2, 0.06, 5.6);
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/corridor-branch-l2.png` });

// 2호선 앞마당 (동서 복도에서 북쪽으로)
await page.evaluate(() => {
  const i = __jj.subway.inside;
  i.setView(21.2, -2.4, 0, 0.1, 6.2);
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/l2-apron.png` });

// 셔터로 닫힌 빈 틈 (직원만)
await page.evaluate(() => {
  const i = __jj.subway.inside;
  const s = i.layout.shops.find((q) => q.closed && q.name === '직원만')
    || i.layout.shops.find((q) => q.closed && q.name === '창고칸')
    || i.layout.shops.find((q) => q.closed);
  const yaw = s.axis === 'x' ? (s.side > 0 ? Math.PI : 0) : (s.side > 0 ? -Math.PI / 2 : Math.PI / 2);
  const px = s.axis === 'x' ? s.cx : (s.side > 0 ? s.x0 - 2.3 : s.x1 + 2.3);
  const pz = s.axis === 'x' ? (s.side > 0 ? s.z0 - 2.3 : s.z1 + 2.3) : s.cz;
  i.setView(px, pz, yaw, 0.05, 4.0);
  window.__seal = { name: s.name, nameEn: s.nameEn, cx: s.cx, cz: s.cz, x0: s.x0, x1: s.x1 };
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/closed-staff-only.png` });
console.log('seal', await page.evaluate(() => window.__seal));

const filtered = errs.filter((e) => !/ResizeObserver|favicon|ws=mock/i.test(e));
if (filtered.length) console.log('errors', filtered.slice(0, 12));
assert.ok(filtered.length === 0, filtered.slice(0, 6).join('\n'));
console.log('shots-gunder-walk OK', OUT);
await browser.close();
