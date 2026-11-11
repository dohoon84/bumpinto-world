// [hangang] 2구간 탄천·합수부·한강남 확인 샷.
//   BASE=http://127.0.0.1:5179/ OUT=/workspace/bw-hangang/artifacts/hangang-hap node scripts/shots-hangang-hap.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || '/workspace/bw-hangang/artifacts/hangang-hap';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--js-flags=--max-old-space-size=4096',
  ],
});
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&cityhall=0&pangyo=0&migeum=0&controlscard=0&ntower=0&at=tancheon-hap';

async function open(tag, { hour = 14, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1440), height: +(process.env.VH || 900) } });
  page.on('pageerror', (e) => { errs.push(`${tag}: ${e.message}`); console.error('pageerror', tag, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', tag, m.text()); });
  await page.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (route) => route.abort());
  const evening = hour >= 19 ? '&evening=1' : '&evening=0';
  await page.goto(`${B}?${Q}&hour=${hour}${evening}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.hangang, null, { timeout: 240000 });
  if (hour >= 19) {
    await page.evaluate(() => window.__jj.hangang?.setNight?.(1));
  }
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
  });
  return page;
}

async function go(page, { x, z, y, yaw = 0, dist = 22, pitch = 0.28, fov = 55, hidePlayer = false }) {
  await page.evaluate((o) => {
    const J = window.__jj;
    J.setMode('follow');
    J.teleport(o.x, o.z, o.y);
    if (J.player) {
      J.player.rotation.y = o.yaw;
      if (o.y != null) J.player.position.y = o.y;
      J.player.visible = !o.hidePlayer;
    }
    J.cam.distMin = 0.5;
    J.cam.distMax = 2800;
    J.cam.yaw = o.yaw;
    J.cam.pitch = o.pitch;
    J.cam.dist = o.dist;
    if (J.camera) {
      J.camera.fov = o.fov;
      J.camera.updateProjectionMatrix?.();
    }
    document.getElementById('stop-panel')?.classList.remove('open');
    document.getElementById('corridor-stop-panel')?.classList.remove('open');
    document.querySelectorAll('.tag, .emote-floater').forEach((el) => { el.style.display = 'none'; el.hidden = true; });
    J.hangang?.tickPlayer?.(0, J.player);
  }, { x, z, y, yaw, dist, pitch, fov, hidePlayer });
  await page.waitForTimeout(1800);
}

const look = (fromX, fromZ, toX, toZ) => Math.atan2(fromX - toX, fromZ - toZ);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const shot = (page, name) => (ONLY && !ONLY.test(name)) ? null : page.screenshot({ path: `${OUT}/${name}.png`, timeout: 150000, animations: 'disabled' });

async function viewpoints(page) {
  return page.evaluate(() => {
    const h = window.__jj.hangang;
    const ends = h.connectEnds || {};
    const hap = h.spawns?.['tancheon-hap'] || ends.tancheonHap;
    const jam = h.spawns?.jamwon;
    const banpo = ends.banpoEast || { x: -8923.9, z: -16698.7 };
    const yAt = (x, z, ref) => h.surfaceY?.(x, z, ref) ?? h.heightAt?.(x, z);
    const osm = h.hap && null;
    return { hap, jam, banpo, waterY: h.levels?.waterY ?? -43 };
  });
}

// richer viewpoints from page (needs hap osm on window or search scene)
async function findViews(page) {
  return page.evaluate(() => {
    const h = window.__jj.hangang;
    const hap = h.spawns?.['tancheon-hap'] || h.connectEnds?.tancheonHap;
    const jam = h.spawns?.jamwon;
    const banpo = h.connectEnds?.banpoEast || { x: -8923.9, z: -16698.7 };
    const yAt = (x, z, ref) => h.surfaceY?.(x, z, ref) ?? h.heightAt?.(x, z);
    // pick a tunnel cycleway near 합수부 / 잠실 by scanning path kept? not exposed.
    // Use known 잠실나들목-ish offset west of hap, or 청담나들목.
    const underpass = { x: hap.x + 200, z: hap.z + 80 };
    // 영동대교 / 성수대교 roughly west of hap along the south bank
    const underBridge = { x: hap.x - 900, z: hap.z - 250 };
    return {
      hap, jam, banpo,
      yHap: yAt(hap.x, hap.z, 20),
      yJam: jam ? yAt(jam.x, jam.z, 20) : null,
      yBanpo: yAt(banpo.x, banpo.z, 20),
      yUnder: yAt(underpass.x, underpass.z, 20),
      yBridge: yAt(underBridge.x, underBridge.z, 20),
      underpass, underBridge,
    };
  });
}

async function capture(page, tag) {
  const v = await findViews(page);
  console.log(tag, JSON.stringify(v));
  const yOf = async (x, z) => page.evaluate((p) => {
    const h = window.__jj.hangang;
    return h.surfaceY?.(p.x, p.z, 20) ?? h.heightAt?.(p.x, p.z);
  }, { x, z });

  // 1. 80 m west of the 탄천/한강남 join along way/359930771, looking WNW at the river
  const exit = { x: -3770.3, z: -16826.9 };
  await go(page, {
    x: exit.x, z: exit.z, y: await yOf(exit.x, exit.z),
    yaw: look(exit.x, exit.z, -4100, -16890),
    // 카메라가 올림픽대로 고가(way/46709880) 상판 높이에 걸리지 않게 낮게 둔다.
    dist: 14, pitch: 0.0, fov: 62,
  });
  await shot(page, `${tag}-01-hap-exit-v2`);

  // 2. 청담나들목 (way/700471394, tunnel=yes, layer=-1) just river-side of
  //    where it crosses 올림픽대로 way/46676451 at (-4129, -17145).
  const up = { x: -4112.2, z: -17151.4 };
  await go(page, {
    x: up.x, z: up.z, y: await yOf(up.x, up.z),
    yaw: look(up.x, up.z, -4129.0, -17145.0),
    // 카메라를 입구 밖, 소핏보다 낮게 두어 거더 앞면·난간과 터널 안 조명이 같이 보이게 한다.
    dist: 17, pitch: 0.0, fov: 60,
  });
  await shot(page, `${tag}-02-olympic-underpass-v2`);

  // 3. Beside 영동대교 (way/842101798): bike path 39 m from the outline, looking under the deck
  const br = { x: -4712.8, z: -17762.3 };
  const brY = await page.evaluate((p) => window.__jj.hangang?.heightAt?.(p.x, p.z), br);
  await go(page, {
    x: br.x, z: br.z, y: brY,
    yaw: look(br.x, br.z, -4679.1, -17820.0),
    dist: 13, pitch: -0.06, fov: 62,
  });
  await shot(page, `${tag}-03-under-bridge-v2`);

  // 4. Aerial of 합수부 from the river (north of the join, looking south).
  //    Same convention as 1구간 aerial: stand near the water, long dist, pitch +0.48.
  const hap = v.hap;
  const ax = hap.x + 80, az = hap.z - 480;
  await go(page, {
    x: ax, z: az, y: (v.yHap ?? -6) - 6,
    yaw: look(ax, az, hap.x - 20, hap.z + 30),
    dist: 420, pitch: 0.48, fov: 52, hidePlayer: true,
  });
  await shot(page, `${tag}-04-hap-aerial-v2`);

  // 5. Join into 반포 — just east of banpoEast on way/925101289, looking west
  const join = { x: -8919.5, z: -16713.4 };
  await go(page, {
    x: join.x, z: join.z, y: await yOf(join.x, join.z),
    yaw: look(join.x, join.z, -9000, -16640),
    dist: 16, pitch: 0.12, fov: 58,
  });
  await shot(page, `${tag}-05-banpo-join-v2`);
}

const TAGS = (process.env.TAGS || 'day,night').split(',');
if (TAGS.includes('day')) {
  const day = await open('day', { hour: 14 });
  await capture(day, 'day');
  await day.close();
}
if (TAGS.includes('night')) {
  const night = await open('night', { hour: 21 });
  await capture(night, 'night');
  await night.close();
}

await browser.close();
if (errs.length) {
  console.error('SHOT ERRORS', errs);
  process.exit(1);
}
console.log('wrote shots to', OUT);
