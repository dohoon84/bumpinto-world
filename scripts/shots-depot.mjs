// [depot] 범창고 샘플 스크린샷·측정 — node scripts/shots-depot.mjs [baseUrl]
// 결과: artifacts/depot/*.png, artifacts/depot/metrics.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:5191/';
const OUT = new URL('../artifacts/depot/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = 'enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
p.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
const only = process.env.ONLY || '';
const shot = async (name) => { await p.waitForTimeout(600); await p.screenshot({ path: OUT + name }); console.log('shot', name); };
const metric = (label) => p.evaluate(async (label) => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 300)); window.gc?.();
  const J = window.__jj, info = J.renderer.info;
  await new Promise((r) => requestAnimationFrame(r));
  info.autoReset = false; info.reset(); // 한 프레임 동안의 render() 호출 전부 합산
  await new Promise((r) => requestAnimationFrame(() => r()));
  info.autoReset = true;
  return { label, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geometries: info.memory.geometries, textures: info.memory.textures, drawCalls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length };
}, label);
const metrics = { runs: [] };

await p.goto(`${BASE}?${Q}&at=depot`, { timeout: 180000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await p.waitForTimeout(5000);
if (!only) {
  await p.evaluate(() => { const J = window.__jj; J.teleport(-160, 300); J.cam.yaw = Math.PI; });
  await p.waitForTimeout(4000);
  metrics.runs.push(await metric('outside-jeongja (내부 모듈 미로드)'));
}
await p.evaluate(() => { const J = window.__jj; J.teleport(-470, 452); J.cam.yaw = Math.PI * 0.86; J.cam.pitch = 0.2; J.cam.dist = 26; });
await p.waitForTimeout(4000);
await shot('01-exterior.png');
await p.evaluate(() => { const J = window.__jj; J.teleport(-492, 493.5); J.cam.yaw = Math.PI; J.cam.pitch = 0.12; J.cam.dist = 7; });
await p.waitForTimeout(2500);
await shot('01b-exterior-door.png');
metrics.runs.push(await metric('outside-depot-door (외피만, 내부 모듈 prefetch)'));
await p.evaluate(() => window.__jj.depot.enter());
await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 90000 });
await p.waitForTimeout(1500);
await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.setMe(72.6, 13.2, -0.5, -0.22); });
await shot('02-entrance-corral.png');
metrics.runs.push(await metric('inside-depot (빈 카트)'));
metrics.inside = await p.evaluate(() => window.__jj.depot.interior.stats());
await p.evaluate(() => { const I = window.__jj.depot.interior, d = I._dbg; d.setMe(77, 11, 0); d.grabCart(); d.setCart(53.9, 40, 0); d.push(1.4, 1); });
await p.waitForTimeout(400);
await shot('03-push-empty-aisle.png');
await p.evaluate(() => { const I = window.__jj.depot.interior, d = I._dbg; d.setCart(53.9, 30, 0); d.hold('egg'); d.setGhostAt('upper', -0.08, -0.12, 0); });
await shot('04-place-preview.png');
await p.evaluate(() => window.__jj.depot.interior._dbg.cancelPlace());
const loadLog = await p.evaluate(() => {
  const I = window.__jj.depot.interior, d = I._dbg, r = [];
  r.push(['soda', d.drop('soda', 'lower', 0, -0.2, 0)]);
  r.push(['water', d.drop('water', 'lower', 0, 0.3, 0)]);
  r.push(['rice', d.drop('rice', 'upper', 0, 0.5, 0)]);
  d.settle(0.6);
  r.push(['egg', d.drop('egg', 'upper', 0, -0.3, 0)]);
  r.push(['tissue', d.drop('tissue', 'upper', 0, 0.5, Math.PI / 2)]);
  d.settle(0.6);
  r.push(['chips', d.drop('chips', 'upper', 0, 0.5, 0, true)]);
  d.settle(2);
  return { r, kg: I.items.reduce((a, it) => a + it.p.kg, 0), broken: I.st.brokenEggs };
});
console.log('load', JSON.stringify(loadLog));
metrics.loaded = loadLog;
await p.evaluate(() => { const I = window.__jj.depot.interior, d = I._dbg; d.setCart(53.9, 30, 0.25); d.camAt([1.35, 1.35, 1.25], [0, 0.45, 0]); });
await shot('05-cart-loaded-both-levels.png');
await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.camAt(null); d.setCart(53.9, 30, 0); });
await shot('05b-loaded-first-person.png');
metrics.runs.push(await metric('inside-depot (짐 실음)'));
const crush = await p.evaluate(() => {
  const I = window.__jj.depot.interior, d = I._dbg;
  while (I.items.length) d.removeLast();
  d.drop('egg', 'upper', 0, -0.15, 0);
  d.settle(0.5);
  d.drop('water', 'upper', 0, -0.15, 0);
  d.settle(0.8);
  const a = I.st.brokenEggs;
  d.drop('soda', 'upper', 0, -0.15, Math.PI / 2);
  d.settle(1.5);
  return { afterWater: a, afterSoda: I.st.brokenEggs, total: I.st.eggTotal, cracked: I.st.crackedEggs || 0 };
});
await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.camAt([0.75, 1.25, 0.25], [0, 0.6, -0.15]); });
await shot('06a-egg-crush-loaded.png');
await p.evaluate(() => { const I = window.__jj.depot.interior, d = I._dbg; d.removeLast(); d.removeLast(); });
console.log('crush', JSON.stringify(crush));
metrics.crush = crush;
await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.camAt([0.0, 0.98, 0.22], [0, 0.5, -0.2]); });
await shot('06-egg-crush.png');
await p.evaluate(() => { const d = window.__jj.depot.interior._dbg; d.camAt(null); });
// ---------- 3차 플레이테스트 반영분 ----------
const ev = (fn, arg) => p.evaluate(fn, arg);
const clear = () => ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.camAt(null); while (I.items.length) d.removeLast(); d.clearFloor(); });
await clear();
// 10. 통로 한가운데서 손 놓은 카트 → 다시 잡기 안내
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.setCart(53.9, 30, 0); d.drop('rice', 'upper', 0, 0.1, 0); d.drop('water', 'upper', 0, -0.2, 0); d.run(1); d.releaseCart(); d.setMe(54.6, 31.2, 0); d.camAt([1.1, 1.75, 1.9], [0, 0.7, -0.3]); d.run(0.2); });
metrics.regrab = await ev(() => ({ near: true, target: document.querySelector('#depot-hud .dh-target')?.textContent }));
await shot('10-regrab-prompt-mid-aisle.png');
// 11. 마우스 호버 하이라이트 (화면 가운데 아님)
await ev(() => { const I = window.__jj.depot.interior; I._dbg.camAt(null); I.onKey({ code: 'KeyE' }); I._dbg.setCart(53.9, 30, 0); I.st.head.pitch = -0.2; I._dbg.run(0.1); });
await p.mouse.move(1010, 470); await p.waitForTimeout(1500);
metrics.hover = await ev(() => { const h = window.__jj.depot.interior.hover; return h && { kind: h.kind, id: h.p.id }; });
await shot('11-mouse-hover-offcenter.png');
await p.mouse.move(640, 790);
// 12. 걸친(오버행) 미리보기 — 노랑/빨강
metrics.ghost = await ev(() => { const d = window.__jj.depot.interior._dbg, r = {}; d.hold('ramen'); d.setGhostAt('upper', 0.33, 0.0, 0); d.run(0.1); r.over = d.ghostState(); d.setGhostAt('upper', 0.18, 0.15, 0); d.run(0.1); r.edge = d.ghostState(); d.camAt([0.9, 1.6, 1.1], [0, 0.7, 0]); return r; });
await shot('12-overhang-preview.png');
// 13. 위태롭게 쌓고 카트를 밀면 → 무너져 바닥으로
metrics.topple = await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.cancelPlace();
  d.drop('ramen', 'upper', 0.3, 0.0, 0); d.drop('tissue', 'upper', 0.2, -0.1, 0); d.drop('chips', 'upper', 0.25, 0.1, 0); d.drop('soda', 'upper', 0.1, 0.2, 0); d.drop('melon', 'upper', 0.1, -0.1, 0);
  d.push(0.8, 1, 0, true); d.push(0.5, -1, 1); d.run(2.5);
  return { inCart: I.items.map((it) => it.p.id), floor: d.floorCount ? d.floorCount() : undefined }; });
await ev(() => window.__jj.depot.interior._dbg.camAt([0.4, 2.9, 2.8], [0, 0.15, -0.3]));
await shot('13-toppled-floor-items.png');
// 14. 상자 아닌 상품 — 선반과 카트
await clear();
const mel = await ev(() => window.__jj.depot.interior._dbg.firstOf('melon'));
await ev((m) => { const d = window.__jj.depot.interior._dbg; d.setCart(m.x - 2.6, m.z, 0); d.releaseCart(); d.setMe(m.x - 2.6, m.z + 3, 0); d.camAt([-0.3, 1.6, -2.4], [2.6, 0.5, 0]); }, mel);
await shot('14a-nonbox-shelf.png');
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.camAt(null); d.setMe(53.9, 31, 0); I.onKey({ code: 'KeyE' }); d.setCart(53.9, 30, 0);
  d.drop('soda', 'upper', 0.08, 0.0, 0); d.drop('water', 'upper', 0, 0.25, 0); d.drop('melon', 'upper', -0.12, -0.25, 0); d.drop('meat', 'upper', 0.1, -0.3, 0); d.drop('bottle', 'upper', 0.15, 0.3, 0); d.drop('chips', 'upper', 0, 0, 0); d.drop('rice', 'lower', 0, 0, 0);
  d.run(2.5); d.camAt([1.0, 1.6, 0.9], [0, 0.6, 0]); });
await shot('14b-nonbox-in-cart.png');
// 15. HUD 겹침 없음 (1인칭, 퀘스트 패널 숨김)
await ev(() => { const d = window.__jj.depot.interior._dbg; d.camAt(null); d.setCart(53.9, 30, 0); d.run(0.2); });
metrics.hud = await ev(() => { const v = document.getElementById('ve-hud'), pn = document.querySelector('#depot-hud .dh-panel').getBoundingClientRect(); return { veHudDisplay: v ? getComputedStyle(v).display : 'none(absent)', panel: [pn.left, pn.top, pn.width, pn.height].map(Math.round) }; });
await shot('15-hud-no-overlap.png');
// 16. 계란 살살 넣기 (깨짐 0)
await clear();
metrics.gentle = await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.setCart(53.9, 30, 0); d.drop('egg', 'upper', -0.08, 0.15, 0); d.drop('egg', 'upper', -0.08, -0.2, 0); d.run(3); d.camAt([0.75, 1.5, 0.6], [0, 0.55, -0.05]); return { broken: I.st.brokenEggs, eggs: I.st.eggTotal }; });
await shot('16-eggs-gentle-no-break.png');
// 17. 계란탑
metrics.tower = await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; for (let k = 0; k < 6; k++) { d.drop('egg', 'upper', -0.08, 0.15, 0); d.run(0.8); } d.camAt([0.55, 2.0, 0.85], [0, 0.85, 0.1]); const S = d.staff(); return { towerBest: S.towerBest, ach: S.ach, broken: I.st.brokenEggs }; });
await shot('17-egg-tower.png');
// 18. 직원 말풍선
await ev(() => { const d = window.__jj.depot.interior._dbg; d.camAt(null); d.setCart(53.9, 30, 0); d.staffAt(53.9, 24); d.mischief('egg', 4); d.run(3.5); d.setMe(53.9, 30.95, 0, -0.05); });
metrics.staff = await ev(() => { const S = window.__jj.depot.interior._dbg.staff(); return { mode: S.mode, line: S.line, score: +S.score.toFixed(1) }; });
await shot('18-staff-bubble.png');
await ev(() => { const d = window.__jj.depot.interior._dbg; d.run(4.6); d.mischief('ram', 6); d.run(1.2); });
metrics.staff2 = await ev(() => { const S = window.__jj.depot.interior._dbg.staff(); return { mode: S.mode, line: S.line, score: +S.score.toFixed(1) }; });
await shot('18b-staff-annoyed.png');
console.log('round3', JSON.stringify({ regrab: metrics.regrab, hover: metrics.hover, ghost: metrics.ghost, topple: metrics.topple, hud: metrics.hud, gentle: metrics.gentle, tower: metrics.tower, staff: metrics.staff, staff2: metrics.staff2 }));
metrics.runs.push(await metric('inside-depot (3차: 직원·상품·계란 실음)'));
metrics.inside3 = await ev(() => window.__jj.depot.interior.stats());
await ev(() => { const d = window.__jj.depot.interior._dbg; d.camAt(null); });
await clear();
metrics.speed = await p.evaluate(() => { const I = window.__jj.depot.interior; return [0, 40, 100, 160].map((kg) => I.measure(kg)); });
console.log('speed', JSON.stringify(metrics.speed));
await p.evaluate(() => { const I = window.__jj.depot.interior; while (I.items.length) I._dbg.removeLast(); window.__jj.depot.leave(); });
await p.waitForFunction(() => !window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 30000 });
await p.waitForTimeout(1500);
metrics.runs.push(await metric('outside-depot-door (나온 뒤)'));
if (!only) {
  await p.evaluate(() => { const J = window.__jj; J.teleport(-160, 300); });
  await p.waitForTimeout(4000);
  metrics.runs.push(await metric('outside-jeongja (나온 뒤)'));
}
const sp = metrics.speed;
await p.setContent(`<html><body style="margin:0;background:#0d1a33;font-family:'Noto Sans KR',sans-serif;color:#fff;padding:36px 44px">
<h1 style="margin:0 0 6px;font-size:30px">범창고 240L 카트 — 빈 카트 vs 무거운 카트</h1>
<div style="color:#f2b705;font-weight:700;margin-bottom:22px">같은 주행 모델(구름저항 Crr 0.03 · 미는 힘 186 N · 출발 311 N = 실측 133/222 N × 1.4 게임 보정)로 게임 안에서 측정 · 카트 자체 27 kg</div>
<table style="border-collapse:collapse;font-size:19px;width:100%">
<tr style="color:#9fb3d9;text-align:left"><th style="width:80px">짐</th><th style="width:90px">총 질량</th><th>0→1 m/s</th><th>계속 밀 때 최고 속도</th><th>1 m/s에서 손 놓고 굴러가는 거리</th><th>1 m/s에서 당겨 멈추는 거리</th><th>제자리 90° 회전</th><th>출발에 필요한 힘</th></tr>
${sp.map((s) => `<tr style="border-top:1px solid #2a3d66"><td style="padding:12px 0">${s.loadKg} kg</td><td>${s.totalKg} kg</td><td><b>${s.t0to1} 초</b></td><td>${s.vTop} m/s</td><td>${s.coastM} m</td><td>${s.brakeM} m</td><td>${s.turn90s} 초</td><td>${s.breakawayN} N</td></tr>`).join('')}
</table>
<div style="margin-top:22px;color:#c9d6f0;font-size:16px">계란 실험: 계란판 위 생수 2L×6 → ${crush.afterWater}개 깨짐, 그 위 탄산 24캔 추가 → 누적 ${crush.afterSoda}/${crush.total}개</div>
</body></html>`);
await p.setViewportSize({ width: 1440, height: 600 });
await p.screenshot({ path: OUT + '07-speed-empty-vs-heavy.png' });
metrics.errors = errs;
writeFileSync(OUT + 'metrics.json', JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics.runs, null, 1));
console.log('ERRORS', errs.length);
await b.close();
