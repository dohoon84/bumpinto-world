// [seongsu-v3] 장면 무거운 메시 목록: 이름 경로 · 삼각형 · bbox 크기 · 성수역에서 거리 (헤드리스)
import { chromium } from 'playwright';
const [PORT = '5311', W = '1280', H = '800'] = process.argv.slice(2);
const MOBILE = +W < 900;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, isMobile: MOBILE, hasTouch: MOBILE });
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0${MOBILE ? '&mobile=1' : ''}`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForFunction(() => window.__jj.seongsu?.ready, null, { timeout: 240000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const J = window.__jj; let sc = J.player; while (sc.parent) sc = sc.parent;
  const rows = []; const B = new (J.player.position.constructor === Object ? Object : J.player.position.constructor)();
  sc.traverse((o) => {
    if (!o.isMesh) return; let vis = true; for (let a = o; a; a = a.parent) if (!a.visible) vis = false;
    const g = o.geometry; const n = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    if (n < 15000) return;
    const path = []; for (let a = o; a.parent; a = a.parent) path.unshift(a.name || a.type);
    g.computeBoundingBox?.(); const bb = g.boundingBox; const s = bb ? [Math.round(bb.max.x - bb.min.x), Math.round(bb.max.z - bb.min.z)] : null;
    const c = bb ? o.localToWorld(bb.getCenter(B.clone())) : null;
    rows.push({ p: path.join('/'), n: Math.round(n / 1000) + 'k', vis, inst: !!o.isInstancedMesh, size: s, c: c ? [Math.round(c.x), Math.round(c.z)] : null, mat: o.material?.type });
  });
  return rows.sort((a, b) => parseInt(b.n) - parseInt(a.n));
});
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
