// dev-relay + 브라우저 2개로 프레즌스/근접 채팅 확인 (npm run relay 먼저 실행)
import { chromium } from 'playwright';
const URL = (process.env.URL || 'http://localhost:4173/') + '?ws=ws://localhost:8787&noshadow=1';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mk = async (name) => { const p = await browser.newPage({ viewport: { width: 1100, height: 700 } }); p.on('pageerror', (e) => console.log(name, e.message)); await p.goto(URL + '&shot=1&npcs=0&name=' + encodeURIComponent(name)); await p.waitForFunction(() => window.__jj?.ready); return p; };
const a = await mk('도훈'), b = await mk('친구');
await a.evaluate(() => { const s = __jj.world.signPos; __jj.teleport(s.x + 4, s.z + 4); __jj.cam.dist = 10; __jj.cam.pitch = 0.3; });
await b.evaluate(() => { const s = __jj.world.signPos; __jj.teleport(s.x + 7, s.z + 6); __jj.cam.dist = 10; __jj.cam.pitch = 0.3; __jj.cam.yaw = 0.3; });
await b.waitForTimeout(2500);
await a.fill('#chat-input', '오 진짜 다른 사람이 보이네? 👋'); await a.press('#chat-input', 'Enter');
await b.waitForTimeout(1500);
const seen = await b.evaluate(() => [...document.querySelectorAll('.bubble.remote')].map((e) => e.style.display !== 'none' && e.textContent));
console.log('B sees remote bubble:', seen, 'status:', await b.textContent('#presence-status'));
await b.screenshot({ path: 'shot-4-multiplayer.png' });
await browser.close();
