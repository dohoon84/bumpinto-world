// [ssg-facade] 명동 안을 오가고(신세계 광장 ↔ 남대문시장 ↔ 명동길) 멀리 갔다 돌아와도 GPU 메모리(geometries·textures·programs)가 늘지 않는지.
//   node scripts/corridor/test/test-myeongdong-leak.mjs <vite port>
import { chromium } from 'playwright';
const PORT = process.argv[2] || process.env.MYEONGDONG_WALK_PORT || '5231';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=21&shot=1&noticePopup=0&controlscard=0`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
const r = await page.evaluate(async () => {
  const J = window.__jj, md = J.myeongdong, R = J.renderer, wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const spots = [[-11249, -21566], [-11380, -21455], [-10980, -21800], [-11258, -21545]];
  const go = async (x, z) => { await J.teleport(x, z, md.surfaceY?.(x, z) ?? undefined); await wait(3500); };
  const mem = () => ({ g: R.info.memory.geometries, t: R.info.memory.textures, p: R.info.programs?.length ?? 0 });
  const out = [];
  for (let c = 0; c < 4; c++) { for (const [x, z] of spots) await go(x, z); out.push({ cycle: c, ...mem() }); }
  // 멀리(정자) 갔다가 돌아오기 2번
  for (let c = 0; c < 2; c++) { await J.teleport(0, 0); await wait(6000); const far = mem(); for (const [x, z] of spots) await go(x, z); out.push({ away: c, far, ...mem() }); }
  return out;
});
await browser.close();
console.log(JSON.stringify(r));
// 첫 바퀴는 처음 보는 것(간판 글자 등)이 올라가는 중 · 정자는 처음 가면 동네가 지어져 남는다 → 같은 일을 두 번 했을 때 늘지 않아야 한다
const fails = [], grow = (a, b) => b.g > a.g + 20 || b.t > a.t + 3 || b.p > a.p + 2;
const c2 = r[2], c3 = r[3], a0 = r[4], a1 = r[5], base = a0, last = a1;
if (grow(c2, c3)) fails.push(`명동 안 오가기에서 늘어남: ${JSON.stringify(c2)} → ${JSON.stringify(c3)}`);
if (grow(a0, a1) || grow(a0.far, a1.far)) fails.push(`멀리 갔다 오기에서 늘어남: ${JSON.stringify(a0)} → ${JSON.stringify(a1)}`);
if (errors.length) fails.push('console errors: ' + errors.slice(0, 3).join(' | '));
if (fails.length) { console.error('test-myeongdong-leak FAIL:', fails.join('; ')); process.exit(1); }
console.log(`test-myeongdong-leak ok — in 명동 cycles geos ${c2.g}→${c3.g} tex ${c2.t}→${c3.t}; away+back geos ${base.g}→${last.g}, tex ${base.t}→${last.t}, programs ${base.p}→${last.p}`);
