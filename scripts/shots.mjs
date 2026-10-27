// 헤드리스 Chromium(WebGL, SwiftShader)으로 스크린샷 3장 생성
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(URL + '?view=overview&shot=1');
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 120000 });
await wait(4000);
await page.screenshot({ path: 'shot-1-overview.png' });
console.log('overview ok');

// 거리 뷰: NPC 옆으로 순간이동 → 말풍선
await page.evaluate(() => { __jj.setMode('follow'); __jj.cam.dist = 9; __jj.cam.pitch = 0.22; });
await page.evaluate(() => __jj.nearNpc(0, 2.5));
await wait(2500);
await page.evaluate(() => { const n = __jj.npcs.list[0], p = __jj.player.position; __jj.cam.yaw = Math.atan2(p.x - n.pos.x, p.z - n.pos.z) + 0.5; });
await wait(1500);
await page.screenshot({ path: 'shot-2-street-npc.png' });
console.log('street ok');

// 다른 각도: 정자역 표지판 + 가짜 원격 플레이어 + 내 채팅
await page.evaluate(() => { const s = __jj.world.signPos; __jj.teleport(s.x + 9, s.z + 9); __jj.cam.dist = 22; __jj.cam.pitch = 0.38; __jj.cam.yaw = 0.8; });
await wait(1500);
await page.fill('#chat-input', '안녕하세요! 정자역 3D 테스트 중 ㅋㅋ');
await page.press('#chat-input', 'Enter');
await wait(2500);
await page.screenshot({ path: 'shot-3-station-chat.png' });
console.log('station ok');
const info = await page.evaluate(() => ({ npcs: __jj.npcs.list.map((n) => n.def.name), gl: (() => { const c = document.querySelector('canvas'); const g = c.getContext('webgl2'); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })() }));
console.log(JSON.stringify(info));
await browser.close();
