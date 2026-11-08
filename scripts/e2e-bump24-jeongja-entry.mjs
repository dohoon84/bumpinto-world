// 정자점 문 앞 'E 들어가기' — 쿼리 없는 기본 주소에서 6번 출구부터 걸어 들어가기.
//   PC 는 키보드 E, 모바일(844×390)은 터치 입장 버튼. ?bp24game · ?at · ?bp24 를 붙이지 않는다.
//   BASE=http://127.0.0.1:5173/ node scripts/e2e-bump24-jeongja-entry.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const B = (process.env.BASE || 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const OUT = process.env.OUT || 'artifacts';
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';

function assertBare(url, where) {
  const u = new URL(url);
  const banned = ['bp24', 'bp24game', 'bump24', 'bump24jeongja', 'at', 'shot'];
  for (const k of banned) assert.equal(u.searchParams.has(k), false, `${where} 에 ?${k} 가 있으면 안 됨: ${url}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const errs = [];

async function boot(page, kind) {
  page.on('pageerror', (e) => errs.push(`${kind}: ${e.message}`));
  await page.goto(B, { waitUntil: 'domcontentloaded', timeout: 120000 });
  assertBare(page.url(), `${kind} 첫 주소`);
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('#bw-launch-notice [data-close]')?.click());
  await page.waitForFunction(() => !document.getElementById('bw-launch-notice'), null, { timeout: 8000 }).catch(() => {});
  if (kind === 'pc') {
    await page.waitForSelector('[data-v2="guest"]', { timeout: 30000 });
    await page.click('[data-v2="guest"]');
    await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 30000 });
    await page.click('.v2-world button[data-corridor-open]');
    await page.waitForSelector('.v2-sel-slot button[data-v2-at="jeongja"]', { timeout: 30000 });
    await page.click('.v2-sel-slot button[data-v2-at="jeongja"]');
  } else {
    await page.waitForSelector('[data-act="pick"]', { timeout: 30000 });
    await page.click('[data-act="pick"]');
    await page.waitForSelector('[data-act="go"]', { timeout: 20000 });
    await page.click('[data-act="go"]');
  }
  await page.waitForSelector('#lobby-go', { timeout: 180000 });
  await page.evaluate(() => {
    const n = document.querySelector('#nick');
    if (n && !n.value.trim()) n.value = '테스터';
  });
  await page.click('#lobby-go');
  await page.waitForFunction(() => {
    const b = document.body;
    return window.__jj?.ready && window.__jj.player && !b.classList.contains('in-lobby') && !b.classList.contains('in-gate') && !b.classList.contains('in-mobile-landing');
  }, null, { timeout: 180000 });
  await page.waitForTimeout(800);
  assertBare(page.url(), `${kind} 입장 후`);
  const armed = await page.evaluate(() => !!window.__jj.bump24Game);
  assert.equal(armed, true, `${kind}: 기본 주소인데 들어가기 모듈이 없음`);
}

async function placeAtExit6(page) {
  const spot = await page.evaluate(() => {
    const exits = window.__jj.subway?.exits || [];
    const ex = exits.find((e) => String(e.ref) === '6');
    const st = window.__jj.jeongjaBp24?.stores?.find((s) => s.id === 'bump24-jeongja');
    if (!ex || !st?.door) return { ok: false, exits: exits.map((e) => e.ref), door: st?.door || null };
    const door = st.door;
    const dx = door[0] - ex.x, dz = door[1] - ex.z, L = Math.hypot(dx, dz) || 1;
    let x = ex.x + (dx / L) * 3, z = ex.z + (dz / L) * 3;
    const blocked = window.__jj.world.isBlocked;
    if (blocked(x, z)) {
      let found = false;
      for (let r = 1; r < 14 && !found; r += 0.8) {
        for (let a = 0; a < Math.PI * 2; a += 0.45) {
          const nx = ex.x + Math.cos(a) * r, nz = ex.z + Math.sin(a) * r;
          if (!blocked(nx, nz)) { x = nx; z = nz; found = true; break; }
        }
      }
    }
    const y = window.__jj.terrain ? window.__jj.terrain.getGroundHeight(x, z, 0) : 0;
    window.__jj.teleport(x, z, y);
    window.__jj.setMode('follow');
    document.activeElement?.blur?.();
    return { ok: true, x, z, ex: [ex.x, ex.z], door, startDist: Math.hypot(door[0] - x, door[1] - z) };
  });
  assert.equal(spot.ok, true, `6번 출구 또는 정자점 문이 없음 ${JSON.stringify(spot)}`);
  assert.ok(spot.startDist > 40, `출구가 문 바로 앞이다 (${spot.startDist})`);
  return spot;
}

async function planPath(page) {
  return page.evaluate(() => {
    const p = window.__jj.player.position;
    const st = window.__jj.jeongjaBp24.stores.find((s) => s.id === 'bump24-jeongja');
    const door = st.door;
    const blocked = (x, z) => window.__jj.world.isBlocked(x, z, 0.45);
    const step = 2.4;
    const key = (x, z) => `${Math.round(x / step)}_${Math.round(z / step)}`;
    const goal = { x: door[0] + 0.8, z: door[1] };
    const q = [{ x: p.x, z: p.z }];
    const prev = new Map([[key(p.x, p.z), null]]);
    const dirs = [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [step, -step], [-step, step], [-step, -step]];
    let found = null;
    for (let n = 0; n < 8000 && q.length && !found; n++) {
      const c = q.shift();
      if (Math.hypot(c.x - goal.x, c.z - goal.z) < step * 0.75) { found = c; break; }
      for (const [dx, dz] of dirs) {
        const nx = c.x + dx, nz = c.z + dz, k = key(nx, nz);
        if (prev.has(k) || blocked(nx, nz)) continue;
        prev.set(k, { x: c.x, z: c.z });
        q.push({ x: nx, z: nz });
      }
    }
    if (!found) return { ok: false, door, from: [p.x, p.z] };
    const chain = [];
    let c = found;
    const seen = new Set();
    while (c && !seen.has(key(c.x, c.z))) {
      seen.add(key(c.x, c.z));
      chain.push([+c.x.toFixed(2), +c.z.toFixed(2)]);
      const pr = prev.get(key(c.x, c.z));
      c = pr;
    }
    chain.reverse();
    chain.push([+goal.x.toFixed(2), +goal.z.toFixed(2)]);
    return { ok: true, chain, door };
  });
}

async function walkToPrompt(page) {
  await page.evaluate(() => document.activeElement?.blur?.());
  let route = await planPath(page);
  assert.equal(route.ok, true, `출구에서 문까지 걷는 길이 없음 ${JSON.stringify(route)}`);
  let wp = 1;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  const track = [];
  const t0 = Date.now();
  let hit = null;
  let stall = 0;
  let prevPos = null;
  let tick = 0;
  while (Date.now() - t0 < 120000) {
    await page.waitForTimeout(100);
    const v = await page.evaluate((target) => {
      const p = window.__jj.player.position;
      const st = window.__jj.jeongjaBp24.stores.find((s) => s.id === 'bump24-jeongja');
      const door = st.door;
      const dist = Math.hypot(door[0] - p.x, door[1] - p.z);
      const dx = target[0] - p.x, dz = target[1] - p.z;
      window.__jj.cam.yaw = Math.atan2(-dx, -dz);
      window.__jj.cam.mode = 'follow';
      const hint = document.querySelector('#b24-root .b24-hint');
      const text = hint?.innerText || '';
      return {
        dist, x: p.x, z: p.z, wpDist: Math.hypot(dx, dz), text,
        enter: /들어가기/.test(text),
        kbd: !!hint?.querySelector('kbd'),
        tap: !!hint?.querySelector('.b24-tapbtn'),
      };
    }, route.chain[Math.min(wp, route.chain.length - 1)]);
    tick += 1;
    if (tick % 15 === 1) track.push({ dist: +v.dist.toFixed(1), x: +v.x.toFixed(1), z: +v.z.toFixed(1), wp });
    if (v.enter) { hit = v; break; }
    if (v.wpDist < 2.6 && wp < route.chain.length - 1) wp += 1;
    const moved = prevPos ? Math.hypot(v.x - prevPos.x, v.z - prevPos.z) : 1;
    prevPos = { x: v.x, z: v.z };
    if (moved > 0.25) stall = 0;
    else if (++stall > 18) {
      route = await planPath(page);
      wp = Math.min(2, (route.chain?.length || 1) - 1);
      stall = 0;
      if (!route.ok) break;
    }
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  return { hit, track };
}

async function shot(page, name) {
  await page.evaluate(() => document.querySelector('.board-close')?.click());
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function runPc(page) {
  await boot(page, 'pc');
  const spot = await placeAtExit6(page);
  const walked = await walkToPrompt(page);
  assert.ok(walked.hit, `PC: 문 앞까지 걸어가도 E 들어가기가 안 뜸. 마지막 ${JSON.stringify(walked.track.at(-1))} 시작 ${spot.startDist.toFixed(0)}m`);
  const moved = Math.hypot(walked.hit.x - spot.x, walked.hit.z - spot.z);
  assert.ok(moved > 30, `PC: 거의 안 걷고 안내가 뜸 (${moved.toFixed(1)}m)`);
  assert.equal(walked.hit.kbd, true, 'PC 안내에 E 키가 없음');
  assert.equal(walked.hit.tap, false, 'PC 에 터치 버튼이 뜸');
  await page.evaluate(() => { window.__jj.cam.pitch = -0.12; window.__jj.cam.dist = 7.5; });
  await page.waitForTimeout(500);
  await shot(page, 'bump24-jeongja-entry-pc');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__jj.bump24Game?.active, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await shot(page, 'bump24-jeongja-entry-pc-interior');
  const inside = await page.evaluate(() => ({
    active: !!window.__jj.bump24Game.active,
    body: document.body.classList.contains('b24-inside'),
  }));
  assert.equal(inside.active, true, 'PC: E 로 매장에 안 들어감');
  assert.equal(inside.body, true, 'PC: 매장 안 표시가 없음');
  console.log('pc ok', { from: spot.startDist.toFixed(1), steps: walked.track.length, at: walked.hit.dist.toFixed(2) });
}

async function runMobile(page) {
  await boot(page, 'mobile');
  const spot = await placeAtExit6(page);
  const walked = await walkToPrompt(page);
  assert.ok(walked.hit, `모바일: 문 앞까지 걸어가도 들어가기 버튼이 안 뜸. 마지막 ${JSON.stringify(walked.track.at(-1))}`);
  const moved = Math.hypot(walked.hit.x - spot.x, walked.hit.z - spot.z);
  assert.ok(moved > 30, `모바일: 거의 안 걷고 안내가 뜸 (${moved.toFixed(1)}m)`);
  assert.equal(walked.hit.tap, true, '모바일 터치 입장 버튼이 없음');
  await page.evaluate(() => { window.__jj.cam.pitch = -0.08; window.__jj.cam.dist = 6.5; });
  await page.waitForTimeout(400);
  await shot(page, 'bump24-jeongja-entry-mobile');
  await page.click('#b24-root .b24-hint');
  await page.waitForFunction(() => window.__jj.bump24Game?.active, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await shot(page, 'bump24-jeongja-entry-mobile-interior');
  const inside = await page.evaluate(() => window.__jj.bump24Game.active && document.body.classList.contains('b24-inside'));
  assert.equal(inside, true, '모바일: 터치 버튼으로 매장에 안 들어감');
  console.log('mobile ok', { from: spot.startDist.toFixed(1), steps: walked.track.length, at: walked.hit.dist.toFixed(2) });
}

const pc = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await runPc(pc);
await pc.close();

const mobile = await browser.newPage({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await runMobile(mobile);
await mobile.close();

assert.deepEqual(errs, [], `page errors ${errs.join(' | ')}`);
console.log('e2e-bump24-jeongja-entry OK');
await browser.close();
