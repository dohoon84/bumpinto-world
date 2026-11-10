// ui-v2 역 선택에 남산서울타워 항목이 보이는지, 입장하면 광장에 떨어지는지 확인하는 스크린샷.
//   BASE=http://127.0.0.1:4173/ OUT=/workspace/bw-ntower/artifacts node scripts/shots-ntower-picker.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const B = (process.env.BASE || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const OUT = process.env.OUT || '/workspace/bw-ntower/artifacts';
fs.mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME || (fs.existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : '/usr/local/bin/google-chrome');
const OFF = 'lang=ko&noticePopup=0&bp24poster=0&bgm=0&ws=mock&bus=sim&weather=clear&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&controlscard=0&hour=21&evening=1';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const errs = [];

async function dismissNotice(page) {
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#bw-launch-notice [data-close]')?.click());
  await page.waitForFunction(() => !document.getElementById('bw-launch-notice'), null, { timeout: 8000 }).catch(() => {});
}

async function openPicker(page) {
  await page.waitForSelector('[data-v2="guest"]', { timeout: 120000 });
  await page.locator('[data-v2="guest"]').click({ force: true, timeout: 60000 });
  await page.waitForSelector('.v2-world button[data-corridor-open]', { timeout: 60000 });
  await page.click('.v2-world button[data-corridor-open]');
  await page.waitForSelector('.v2-picker .v2-map', { timeout: 30000 });
}

try {
  // 1) 기본 역 선택: 태그·칩이 보이고 기존 레이아웃은 그대로
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => { errs.push(e.message); console.error('pageerror', e.message); });
  await page.goto(`${B}?${OFF}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await dismissNotice(page);
  await openPicker(page);

  const vis = await page.evaluate(() => {
    const chip = document.querySelector('.v2-picker .v2-lm[data-v2-at="ntower"]');
    const tags = [...document.querySelectorAll('.v2-picker .v2-tags .v2-tag')].map((t) => t.textContent.trim());
    const lotte = document.querySelector('.v2-picker .v2-lm[data-v2-at="lotte"]');
    const map = document.querySelector('.v2-picker .v2-map');
    const cr = (el) => {
      if (!el || !map) return null;
      const a = el.getBoundingClientRect(), b = map.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height, text: el.textContent.trim() };
    };
    return {
      tags,
      hasChip: !!chip,
      chip: cr(chip),
      lotte: cr(lotte),
      map: map ? { w: map.getBoundingClientRect().width, h: map.getBoundingClientRect().height } : null,
      sel: document.querySelector('.v2-sel')?.innerText || '',
    };
  });
  console.log('picker', JSON.stringify(vis, null, 2));
  assert.equal(vis.hasChip, true, '남산서울타워 .v2-lm 칩이 없음');
  assert.ok(vis.tags.includes('남산서울타워'), `태그 목록에 남산서울타워 없음: ${vis.tags.join(',')}`);
  assert.ok(vis.lotte, '롯데월드타워 칩이 사라지면 안 됨');
  // 두 칩이 겹치면 안 됨
  if (vis.chip && vis.lotte) {
    const a = vis.chip, b = vis.lotte;
    const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    assert.equal(overlap, false, `남산 칩과 롯데 칩이 겹침: ${JSON.stringify({ a, b })}`);
  }
  await page.screenshot({ path: `${OUT}/ntower-picker-entry.png`, timeout: 60000 });

  // 2) 칩에 올리면 하단 행이 '남산서울타워 선택됨 / 남산서울타워에 입장'
  await page.hover('.v2-picker .v2-lm[data-v2-at="ntower"]');
  await page.waitForFunction(() => document.querySelector('.v2-sel-slot .v2-sel b')?.textContent?.includes('남산서울타워'), null, { timeout: 5000 });
  const row = await page.evaluate(() => document.querySelector('.v2-sel')?.innerText || '');
  console.log('selected row', row.replace(/\s+/g, ' '));
  assert.match(row, /남산서울타워 선택됨/);
  assert.match(row, /남산서울타워에 입장/);
  await page.screenshot({ path: `${OUT}/ntower-picker-selected.png`, timeout: 60000 });

  // 3) 입장하면 남산 광장(타워가 정상 정상)에서 시작
  await page.click('.v2-sel-slot button[data-v2-at="ntower"]');
  await page.waitForSelector('#lobby-go', { timeout: 180000 });
  await page.evaluate(() => {
    const n = document.querySelector('#nick');
    if (n && !n.value.trim()) n.value = '테스터';
  });
  await page.click('#lobby-go');
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.namsan && window.__jj.player, null, { timeout: 240000 });
  for (let i = 0; i < 40; i++) {
    const shown = await page.evaluate(() => {
      const load = document.getElementById('enter-loading');
      return !!(load && !load.hidden && getComputedStyle(load).display !== 'none');
    });
    if (!shown) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => {
    document.querySelector('#bw-launch-notice [data-close], .bpp-close, .bpp-x, [data-never]')?.click();
  });
  await page.waitForTimeout(400);

  const land = await page.evaluate(() => {
    const J = window.__jj;
    const n = J.namsan;
    const p = J.player.position;
    const spawn = n.spawn;
    const dist = Math.hypot(p.x - spawn.x, p.z - spawn.z);
    const dy = Math.abs(p.y - n.spawnY());
    return {
      x: p.x, y: p.y, z: p.z,
      spawn, spawnY: n.spawnY(),
      dist, dy,
      tipY: n.tower.tipY,
      baseY: n.baseY,
      tx: n.tower.ox,
      tz: n.tower.oz,
    };
  });
  console.log('landing', JSON.stringify(land, null, 2));
  assert.ok(land.dist < 12, `광장에서 너무 멂: ${land.dist.toFixed(2)}m`);
  assert.ok(land.dy < 4, `광장 높이가 안 맞음: dy=${land.dy.toFixed(2)}`);
  assert.ok(land.y > land.baseY - 1, `정상 높이가 아님 y=${land.y} baseY=${land.baseY}`);
  // 광장 착지를 확인한 뒤, 타워 전체가 보이게 카메라만 공식 야경 근경으로 맞춘다
  const look = (fromX, fromZ, toX, toZ) => Math.atan2(fromX - toX, fromZ - toZ);
  const cx = land.tx + 50, cz = land.tz + 12, cy = land.baseY + 42;
  await page.evaluate((o) => {
    const J = window.__jj;
    J.setMode('follow');
    J.teleport(o.x, o.z, o.y);
    if (J.player) {
      J.player.rotation.y = o.yaw;
      J.player.position.y = o.y;
      J.player.visible = false;
    }
    J.cam.distMin = 0.5;
    J.cam.distMax = 2500;
    J.cam.yaw = o.yaw;
    J.cam.pitch = o.pitch;
    J.cam.dist = o.dist;
    if (J.camera) { J.camera.fov = o.fov; J.camera.updateProjectionMatrix?.(); }
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
    const hint = document.getElementById('namsan-cable-hint');
    if (hint) hint.style.display = 'none';
    document.querySelectorAll('.tag, .emote-floater').forEach((el) => { el.style.display = 'none'; el.hidden = true; });
  }, { x: cx, z: cz, y: cy, yaw: look(cx, cz, land.tx, land.tz), dist: 58, pitch: -0.5, fov: 74 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/ntower-picker-landing.png`, timeout: 120000 });

  // 4) ?ntower=0 이면 항목이 숨겨진다
  const off = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await off.goto(`${B}?${OFF}&ntower=0`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await dismissNotice(off);
  await openPicker(off);
  const hidden = await off.evaluate(() => ({
    chip: !!document.querySelector('.v2-picker .v2-lm[data-v2-at="ntower"]'),
    tags: [...document.querySelectorAll('.v2-picker .v2-tags .v2-tag')].map((t) => t.textContent.trim()),
  }));
  console.log('ntower=0', hidden);
  assert.equal(hidden.chip, false, '?ntower=0 인데 칩이 보임');
  assert.ok(!hidden.tags.includes('남산서울타워'), '?ntower=0 인데 태그가 보임');
  await off.screenshot({ path: `${OUT}/ntower-picker-flag-off.png`, timeout: 60000 });
  await off.close();
  await page.close();

  if (errs.length) {
    console.error('page errors', errs);
    process.exit(1);
  }
  console.log('ok', OUT);
} finally {
  await browser.close();
}
