// [seongsu-v4] 위에서 아래로 광선 → 처음 맞는 메시 이름·재질색 집계 (청담 북단 땅 확인용, 헤드리스)
import { chromium } from 'playwright';
const [PORT = '5311', CX = '-3760', CZ = '-18350', R = '300', STEP = '15'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(`http://localhost:${PORT}/?ws=mock&at=seongsu&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready && window.__jj.seongsu?.ready, null, { timeout: 240000 });
await page.evaluate(([x, z]) => { const J = window.__jj; J.player.position.set(x, 2, z); J.setMode?.('overview'); }, [+CX, +CZ]);
await page.waitForTimeout(25000);
const out = await page.evaluate(([cx, cz, r]) => {
  const J = window.__jj; let sc = J.player; while (sc.parent) sc = sc.parent;
  const rows = [];
  sc.traverse((o) => {
    if (!o.isMesh) return; let vis = true; for (let a = o; a; a = a.parent) if (!a.visible) vis = false; if (!vis) return;
    const g = o.geometry; if (!g?.attributes?.position) return; g.computeBoundingBox?.(); const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (bb.max.x < cx - r || bb.min.x > cx + r || bb.max.z < cz - r || bb.min.z > cz + r) return;
    const path = []; for (let a = o; a.parent; a = a.parent) path.unshift(a.name || a.type);
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    rows.push({ p: path.slice(-3).join('/'), tris: Math.round((g.index ? g.index.count : g.attributes.position.count) / 3), col: m?.color?.getHexString?.(), vc: !!m?.vertexColors, map: !!m?.map, y: [+bb.min.y.toFixed(1), +bb.max.y.toFixed(1)], sz: [Math.round(bb.max.x - bb.min.x), Math.round(bb.max.z - bb.min.z)] });
  });
  return rows;
}, [+CX, +CZ, +R]);
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
