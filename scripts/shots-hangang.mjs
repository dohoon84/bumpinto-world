// [hangang] 반포한강공원·잠수교 확인 샷.
//   BASE=http://127.0.0.1:5179/ OUT=/workspace/bw-hangang/artifacts/hangang node scripts/shots-hangang.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5179/';
const OUT = process.env.OUT || '/workspace/bw-hangang/artifacts/hangang';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});
const errs = [];
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&cityhall=0&pangyo=0&migeum=0&controlscard=0&ntower=0&at=hangang';

async function open(tag, { hour = 14, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => { errs.push(`${tag}: ${e.message}`); console.error('pageerror', tag, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', tag, m.text()); });
  await page.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (route) => route.abort());
  const evening = hour >= 19 ? '&evening=1' : '&evening=0';
  await page.goto(`${B}?${Q}&hour=${hour}${evening}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.hangang, null, { timeout: 240000 });
  if (hour >= 19) {
    await page.evaluate(() => window.__jj.hangang?.setNight?.(1));
  }
  await page.waitForTimeout(1800);
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
    J.cam.distMax = 2500;
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
  }, { x, z, y, yaw, dist, pitch, fov, hidePlayer });
  await page.waitForTimeout(1800);
}

const look = (fromX, fromZ, toX, toZ) => Math.atan2(fromX - toX, fromZ - toZ);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 90000, animations: 'disabled' });

async function viewpoints(page) {
  return page.evaluate(() => {
    const h = window.__jj.hangang;
    const ends = h.connectEnds || {};
    const js = ends.jamsuSouth || h.spawn;
    const jn = ends.jamsuNorth || { x: js.x - 340, z: js.z - 890 };
    const mid = { x: (js.x + jn.x) / 2, z: (js.z + jn.z) / 2 };
    const low = (h.levels?.waterY ?? -43) + 4;
    const yAt = (x, z, ref) => h.surfaceY(x, z, ref);
    const waterY = h.levels?.waterY ?? -43;
    const landY = (x, z) => h.heightAt(x, z);
    // 남단 교대 바로 남쪽 자전거길 — 두 데크가 강을 건너는 모습이 보이게
    let path = { x: js.x - 14, z: js.z + 28 };
    for (const [x, z] of [[js.x - 14, js.z + 22], [js.x - 22, js.z + 34], [js.x - 8, js.z + 40], [js.x - 30, js.z + 36]]) {
      const y = landY(x, z);
      if (y != null && y > waterY + 1.4) { path = { x, z }; break; }
    }
    const rv = h.revetmentView;
    const terrace = rv
      ? { x: rv.x, z: rv.z, lookX: rv.lookX, lookZ: rv.lookZ, y: rv.y, waterX: rv.waterX, waterZ: rv.waterZ }
      : { x: js.x - 180, z: js.z + 20, lookX: mid.x, lookZ: mid.z, y: waterY + 3.8 };
    return {
      js, jn, mid, path, terrace,
      waterY,
      yPath: yAt(path.x, path.z) ?? landY(path.x, path.z),
      yMidLow: yAt(mid.x, mid.z, low),
      yMidHigh: yAt(mid.x, mid.z, Infinity),
      yTerrace: terrace.y ?? yAt(terrace.x, terrace.z) ?? landY(terrace.x, terrace.z),
      yJsLow: yAt(js.x, js.z, low),
    };
  });
}

async function shootSet(page, suffix) {
  const v = await viewpoints(page);
  console.log('viewpoints', suffix, v);

  // 1) eye level from the south-bank bike path toward 잠수교 / 반포대교
  {
    const x = v.path.x, z = v.path.z;
    const y = (v.yPath ?? -40) + 0.15;
    const yaw = look(x, z, v.mid.x, v.mid.z);
    await go(page, { x, z, y, yaw, dist: 5.0, pitch: 0.06, fov: 62 });
    await shot(page, `jamsu-from-bikepath-v5-${suffix}`);
    console.log('wrote', `jamsu-from-bikepath-v5-${suffix}.png`);
  }

  // 2) on the 잠수교 lower deck — lane markings, railings, bike/walk strip
  {
    const x = v.mid.x, z = v.mid.z;
    const y = (v.yMidLow ?? -40.3) + 0.12;
    const yaw = look(x, z, v.jn.x, v.jn.z);
    await go(page, { x, z, y, yaw, dist: 7.4, pitch: -0.18, fov: 66 });
    await shot(page, `jamsu-on-deck-v5-${suffix}`);
    console.log('wrote', `jamsu-on-deck-v5-${suffix}.png`);
  }

  // 3) under 반포대교, looking along 잠수교 with river and girders
  {
    const x = v.mid.x, z = v.mid.z;
    const y = (v.yMidLow ?? -40.3) + 0.12;
    const yaw = look(x, z, v.jn.x + 55, v.jn.z);
    await go(page, { x, z, y, yaw, dist: 8.2, pitch: -0.28, fov: 68 });
    await shot(page, `jamsu-under-banpo-v5-${suffix}`);
    console.log('wrote', `jamsu-under-banpo-v5-${suffix}.png`);
  }

  // 4) top step of the 계단식 호안, looking down to the river with both bridges
  {
    const tx = v.terrace.x, tz = v.terrace.z;
    // 윗단에서 수면과 두 다리를 함께 본다. 단 법선만 따르면 강만 보이거나
    // 잔디만 남을 수 있어 다리 중점과 섞는다.
    let lookX = v.terrace.lookX ?? v.mid.x, lookZ = v.terrace.lookZ ?? v.mid.z;
    if (v.terrace.waterX != null && v.terrace.waterZ != null) {
      lookX = v.terrace.waterX * 0.48 + v.mid.x * 0.52;
      lookZ = v.terrace.waterZ * 0.40 + v.mid.z * 0.60;
    }
    const dx = tx - lookX, dz = tz - lookZ;
    const L = Math.hypot(dx, dz) || 1;
    const x = tx + (dx / L) * 2.4;
    const z = tz + (dz / L) * 2.4;
    const y = (v.yTerrace ?? -39) + 0.55;
    const yaw = look(x, z, lookX, lookZ);
    await go(page, { x, z, y, yaw, dist: 5.2, pitch: 0.38, fov: 68, hidePlayer: true });
    await shot(page, `park-terraces-v5-${suffix}`);
    console.log('wrote', `park-terraces-v5-${suffix}.png`);
  }

  // 5) aerial from the river (north) side, park and both bridges in front, city behind
  {
    const x = v.mid.x + 40, z = v.mid.z - 420;
    const y = (v.waterY ?? -43) + 8;
    const yaw = look(x, z, v.mid.x, v.js.z + 80);
    await go(page, { x, z, y, yaw, dist: 680, pitch: 0.48, fov: 52, hidePlayer: true });
    await shot(page, `aerial-segment-v5-${suffix}`);
    console.log('wrote', `aerial-segment-v5-${suffix}.png`);
  }
}

const day = await open('day', { hour: 14 });
await shootSet(day, 'day');
await day.close();

const night = await open('night', { hour: 21 });
await shootSet(night, 'night');
await night.close();

await browser.close();
if (errs.length) {
  console.error('pageerrors', errs);
  process.exitCode = 1;
} else {
  console.log('shots ok', OUT);
}
