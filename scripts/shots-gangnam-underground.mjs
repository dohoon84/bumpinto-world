import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const B = process.env.BASE || 'http://127.0.0.1:4761/';
const OUT = process.env.OUT || '/workspace/bw-gangnam-underground/artifacts';
await mkdir(OUT, { recursive: true });

const Q = 'enter=1&name=Tester&ws=mock&shot=1&lang=ko&subwayRt=0&bgm=0&noticePopup=0&hour=21&weather=clear&subwayVoice=0';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });

const until = (fn, arg, t = 90000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });

await page.goto(B + '?' + Q, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(800);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 });
await page.waitForTimeout(1200);

const st = await page.evaluate(() => {
  const s = __jj.subway.ensureStation('gangnam');
  return {
    ok: !!s,
    x: s?.x, z: s?.z,
    exits: (s?.ent?.list || []).map((e) => ({ id: e.exit.id, ref: e.exit.ref, x: +e.x.toFixed(1), z: +e.z.toFixed(1), ry: +e.ry.toFixed(3) })),
  };
});
console.log('station', JSON.stringify(st));
assert.ok(st.ok && st.exits.length >= 8, 'gangnam entrances');

const e11 = st.exits.find((e) => e.ref === '11') || st.exits[0];
await page.evaluate((e) => {
  const s = Math.sin(e.ry), c = Math.cos(e.ry);
  __jj.teleport(e.x - s * 8, e.z - c * 8);
  __jj.player.rotation.y = e.ry;
  __jj.setMode('follow');
  __jj.cam.yaw = e.ry + Math.PI;
  __jj.cam.pitch = 0.22;
  __jj.cam.dist = 9;
}, e11);
await page.waitForTimeout(2800);
await page.screenshot({ path: `${OUT}/gunder-street.png` });

await page.evaluate((e) => {
  const s = Math.sin(e.ry), c = Math.cos(e.ry);
  __jj.teleport(e.x - s * 2.2, e.z - c * 2.2);
  __jj.player.rotation.y = e.ry;
  __jj.cam.yaw = e.ry + Math.PI;
  __jj.cam.pitch = -0.18;
  __jj.cam.dist = 5.5;
}, e11);
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/gunder-stairs-out.png` });

await page.evaluate((id) => __jj.subway.enterById(id), e11.id);
await until(() => __jj.subway.room === 'concourse' && !__jj.subway.swapping, null, 45000);
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const i = __jj.subway.inside;
  return { kind: i?.kind, shops: i?.stats?.()?.shops, pos: [i?.player.position.x, i?.player.position.z], hasSet: typeof i?.setView === 'function' };
});
console.log('inside', JSON.stringify(info));
assert.ok(info.hasSet, 'setView');

// 들어오는 계단에서 빛 쪽을 봄
await page.evaluate(() => {
  const i = __jj.subway.inside;
  const p = i.passages.find((q) => q.id === 'north') || i.passages[0];
  i.setView(p.mouth.x, p.mouth.z, Math.atan2(p.out.x, p.out.z), 0.12, 5.5);
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/gunder-stairs.png` });

await page.evaluate(() => { const i = __jj.subway.inside; i.setView(-22, 0.15, -Math.PI / 2, 0.1, 7.4); });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/gunder-corridor.png` });

await page.evaluate(() => {
  const i = __jj.subway.inside;
  const s = i.layout.shops.find((q) => !q.closed && q.type === 'fashion' && q.axis === 'x' && q.side > 0 && q.cx > 14) || i.layout.shops.find((q) => !q.closed && q.type === 'fashion') || i.layout.shops[0];
  const yaw = s.axis === 'x' ? (s.side > 0 ? Math.PI : 0) : (s.side > 0 ? -Math.PI / 2 : Math.PI / 2);
  const px = s.axis === 'x' ? s.cx - 0.85 : (s.side > 0 ? s.x0 - 2.2 : s.x1 + 2.2);
  const pz = s.axis === 'x' ? (s.side > 0 ? s.z0 - 2.2 : s.z1 + 2.2) : s.cz - 0.85;
  i.setView(px, pz, yaw, 0.04, 3.7);
  window.__shop = { name: s.name, type: s.type, cx: s.cx, cz: s.cz, axis: s.axis, side: s.side, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/gunder-shopfront.png` });
console.log('shop', await page.evaluate(() => window.__shop));

await page.evaluate(() => {
  const i = __jj.subway.inside, s = window.__shop;
  const yaw = s.axis === 'x' ? (s.side > 0 ? Math.PI : 0) : (s.side > 0 ? -Math.PI / 2 : Math.PI / 2);
  const px = s.axis === 'x' ? s.cx : (s.side > 0 ? s.x0 + 0.85 : s.x1 - 0.85);
  const pz = s.axis === 'x' ? (s.side > 0 ? s.z0 + 0.85 : s.z1 - 0.85) : s.cz;
  i.setView(px, pz, yaw, 0.05, 3.1);
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/gunder-shopin.png` });

await page.evaluate(() => { const i = __jj.subway.inside; i.setView(0.4, 46.6, 0.35, 0.12, 8.0); });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/gunder-food.png` });

await page.evaluate(() => { const i = __jj.subway.inside; i.setView(-1.6, 58.4, Math.PI - 0.15, 0.08, 4.4); });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/gunder-gates.png` });

await page.evaluate(() => {
  const i = __jj.subway.inside;
  i.setView(24, 0.35, Math.PI / 2 + 0.52, 0.0, 3.15);
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/gunder-exitsign.png` });

const stats = await page.evaluate(() => __jj.subway.inside.stats());
console.log('stats', JSON.stringify(stats));
if (errs.length) console.log('errors', errs.slice(0, 12));
assert.ok(errs.filter((e) => !/ResizeObserver|favicon/i.test(e)).length === 0, errs.slice(0, 6).join('\n'));
console.log('shots-gangnam-underground OK', OUT);
await browser.close();
