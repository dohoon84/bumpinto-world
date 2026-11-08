// [hud-v3-minimap] 미니맵 스크린샷 (1440x900 · 1280x800, 게스트, ga=off) + 콘솔 오류·성능 수치.
//   BASE=http://127.0.0.1:5173 OUT=/tmp/bw-hud-v3-shots node scripts/shots-hud-v3-minimap.mjs
//   판교(입장) → 북쪽 위 / 회전 / 확대 / 축소 / 경로 → 정자로 순간이동 → 북쪽 위 + 경로. 끄면(?hud 없음) 미니맵 없음 확인.
//   경로: 게임에 길 안내 기능이 아직 없어, 근처 도로 그래프에서 최단 경로를 구해 'bw:nav-route' 이벤트로 넣는다(데모).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || '/tmp/bw-hud-v3-shots';
mkdirSync(OUT, { recursive: true });
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const report = [];

async function enter(p, v3) {
  await p.goto(`${BASE}/?noticePopup=0&ga=off${v3 ? '&hud=v3' : '&hud=off'}`, { timeout: 120000 });
  await p.waitForSelector('[data-v2=guest]', { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.locator('[data-v2=guest]').first().click({ force: true });
  await p.waitForSelector('[data-enter-at=pangyo]', { state: 'attached', timeout: 60000 }); await p.waitForTimeout(2000);
  await p.locator('[data-enter-at=pangyo]:visible').first().click({ force: true });
  await p.waitForSelector('#lobby-go', { state: 'visible', timeout: 90000 }); await p.waitForTimeout(3500);
  if (await p.locator('#nick').isVisible().catch(() => false) && !(await p.inputValue('#nick').catch(() => '')).trim()) await p.fill('#nick', '도훈');
  await p.locator('#lobby-go').first().click({ force: true });
  await p.waitForFunction(() => !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-lobby') && !document.getElementById('btn-leave').hidden, null, { timeout: 180000 });
  await p.waitForFunction(() => { const l = document.getElementById('enter-loading'); return !l || l.hidden || getComputedStyle(l).display === 'none'; }, null, { timeout: 180000 });
  await p.waitForTimeout(5000);
}

// 근처 도로(라이브 + 코리더 타일) 그래프에서 from → to 최단 경로 (데모용)
const ROUTE_FN = ({ tx, tz, label }) => {
  const J = window.__jj, P = J.player.position;
  const roads = [...(J.data?.roads || [])];
  for (const t of J.corridor?.miniTiles?.() || []) roads.push(...t.data.roads);
  const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const nodes = new Map(); const adj = new Map();
  const add = (a, b, d) => { (adj.get(a) || adj.set(a, []).get(a)).push([b, d]); };
  for (const r of roads) { if (!r.p || r.k === 'motorway' || r.k === 'motorway_link') continue; for (let i = 1; i < r.p.length; i++) { const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i]; const a = key(ax, az), b = key(bx, bz); nodes.set(a, [ax, az]); nodes.set(b, [bx, bz]); const d = Math.hypot(bx - ax, bz - az); add(a, b, d); add(b, a, d); } }
  const near = (x, z) => { let best = null, bd = Infinity; for (const [k, [nx, nz]] of nodes) { const d = Math.hypot(nx - x, nz - z); if (d < bd && adj.get(k)?.length) { bd = d; best = k; } } return best; };
  const s = near(P.x, P.z), g = near(tx, tz);
  const dist = new Map([[s, 0]]), prev = new Map(), done = new Set(); const q = [[0, s]];
  while (q.length) { q.sort((a, b) => a[0] - b[0]); const [d, u] = q.shift(); if (done.has(u)) continue; done.add(u); if (u === g) break; for (const [v, w] of adj.get(u) || []) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); q.push([nd, v]); } } }
  if (!dist.has(g)) return { ok: false };
  const pts = []; for (let u = g; u; u = prev.get(u)) pts.unshift(nodes.get(u));
  pts.unshift([P.x, P.z]);
  dispatchEvent(new CustomEvent('bw:nav-route', { detail: { points: pts, dest: { x: pts.at(-1)[0], z: pts.at(-1)[1], label } } }));
  return { ok: true, n: pts.length, len: Math.round(dist.get(g)) };
};

async function run({ w, h, v3 }) {
  const b = await chromium.launch({ args: GL });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ko-KR' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(120000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const tag = `${v3 ? 'v3' : 'off'}-${w}`;
  await enter(p, v3);
  const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/minimap-${tag}-${name}.png` }); console.log('shot', `minimap-${tag}-${name}`); };
  const info = { tag };
  if (!v3) {
    info.mm = await p.evaluate(() => ({ el: !!document.getElementById('h3-mm'), api: !!window.__h3mm, bodyV3: document.body.classList.contains('hud-v3'), keep: !!window.__jj?.corridor?.miniTiles?.().length }));
    await p.keyboard.press('KeyN'); await p.waitForTimeout(400);
    info.mmAfterN = await p.evaluate(() => !!document.getElementById('h3-mm'));
    await shot('flag-off');
  } else {
    const mm = (f) => p.evaluate(f);
    await mm(() => { window.__h3mm.toggle(true); window.__h3mm.setRot(false); window.__h3mm.setZoom(1); });
    await p.evaluate(() => { window.__jj.cam.yaw = 0.6; });
    await p.waitForTimeout(1500);
    await shot('pangyo-northup');
    info.rect = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : 'hidden'; }; return { mm: r('#h3-mm .h3-mm-ring'), plaque: r('#h3-mm .h3-mm-plaque'), bar: r('#h3-bar'), online: r('#h3-online'), bgm: r('#bgm'), phone: r('#phone'), trk: r('#ve-hud .ve-trk') }; });
    // 걸으면 따라 움직이는지
    const p0 = await p.evaluate(() => { const P = window.__jj.player.position; return [P.x, P.z, window.__h3mm.stats().frames]; });
    await p.mouse.click(Math.round(w / 2), Math.round(h / 2)); await p.keyboard.down('KeyW'); await p.waitForTimeout(1800); await p.keyboard.up('KeyW');
    const p1 = await p.evaluate(() => { const P = window.__jj.player.position; return [P.x, P.z, window.__h3mm.stats().frames]; });
    info.walk = { moved: Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 10) / 10, framesDrawn: p1[2] - p0[2] };
    await shot('pangyo-walked');
    await mm(() => window.__h3mm.setRot(true));
    await shot('pangyo-rotated');
    await mm(() => { window.__h3mm.setRot(false); window.__h3mm.setZoom(0); });
    await shot('pangyo-zoom-in');
    // 마우스 올리면 역 이름
    await mm(() => window.__h3mm.setZoom(3));
    await shot('pangyo-zoom-out');
    await mm(() => window.__h3mm.setZoom(1));
    info.routePangyo = await p.evaluate(ROUTE_FN, { tx: 420, tz: -3230, label: '목적지' });
    await shot('pangyo-route');
    await mm(() => window.__h3mm.setRot(true));
    await shot('pangyo-route-rotated');
    await mm(() => window.__h3mm.setRot(false));
    // 단축키 N: 끄기 → 켜기, 입력 중 무시
    await p.mouse.click(Math.round(w / 2), Math.round(h / 2));
    await p.keyboard.press('KeyN'); await p.waitForTimeout(300);
    info.keyN = { off: await mm(() => window.__h3mm.stats().open), chunksAfterOff: await mm(() => window.__h3mm.stats().chunks), lsAfterOff: await mm(() => localStorage.getItem('bw.hud.v3.minimap')) };
    await p.keyboard.press('KeyN'); await p.waitForTimeout(300);
    info.keyN.on = await mm(() => window.__h3mm.stats().open);
    info.keyN.bikeMuted = await mm(() => localStorage.getItem('bikeAudioMuted'));
    await p.focus('#chat-input').catch(() => {}); await p.keyboard.type('n'); await p.waitForTimeout(300);
    info.keyN.typing = await mm(() => ({ open: window.__h3mm.stats().open, val: document.getElementById('chat-input')?.value }));
    await p.evaluate(() => { const c = document.getElementById('chat-input'); if (c) { c.value = ''; c.blur(); } });
    // 메뉴 항목
    await p.click('[data-h3="map"]'); await p.waitForTimeout(400);
    info.menu = await p.evaluate(() => [...document.querySelectorAll('#h3-drop .h3-item')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    await shot('map-menu');
    await p.click('#h3-drop [data-act="minimap"]'); await p.waitForTimeout(400);
    info.menuToggle = await mm(() => ({ open: window.__h3mm.stats().open, sw: document.querySelector('#h3-drop [data-act="minimap"] .h3-sw')?.classList.contains('on') }));
    await p.click('#h3-drop [data-act="minimap"]'); await p.waitForTimeout(400);
    await p.keyboard.press('Escape');
    // 정자로
    await p.evaluate(async () => { const J = window.__jj; const s = J.corridor ? J.corridor.freeSpot(40, 60) : { x: 40, z: 60 }; J.teleport(s.x, s.z); J.cam.yaw = 0; await J.corridor?.preload?.(s.x, s.z); });
    await p.waitForTimeout(3000);
    await shot('jeongja-northup');
    info.routeJeongja = await p.evaluate(ROUTE_FN, { tx: 330, tz: 300, label: '정자동 카페거리' });
    await shot('jeongja-route');
    await mm(() => window.__h3mm.setZoom(0));
    await shot('jeongja-zoom-in');
    await mm(() => { window.__h3mm.setZoom(2); window.__h3mm.setRot(true); });
    await p.evaluate(() => { window.__jj.cam.yaw = 2.2; });
    await shot('jeongja-rotated');
    // 성능: 2초 동안 그리기 시간
    await mm(() => { window.__h3mm.setZoom(1); window.__h3mm.setRot(false); });
    await p.waitForTimeout(2500);
    info.perf = await mm(() => window.__h3mm.stats());
    info.heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  }
  info.errors = errs;
  report.push(info);
  console.log(JSON.stringify(info, null, 1));
  await b.close();
}

const ONLY = process.env.ONLY || '';
for (const v3 of [true, false]) for (const [w, h] of [[1440, 900], [1280, 800]]) if (!ONLY || ONLY === `${v3 ? 'v3' : 'off'}-${w}`) await run({ w, h, v3 });
const bad = report.filter((r) => r.errors.length);
console.log(bad.length ? `CONSOLE ERRORS in ${bad.map((r) => r.tag).join(', ')}` : 'console errors: 0');
