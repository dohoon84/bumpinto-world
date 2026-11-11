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
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 20000, animations: 'disabled' });

async function viewpoints(page) {
  return page.evaluate(() => {
    const h = window.__jj.hangang;
    const ends = h.connectEnds || {};
    const js = ends.jamsuSouth || h.spawn;
    const jn = ends.jamsuNorth || { x: js.x - 340, z: js.z - 890 };
    const mid = { x: (js.x + jn.x) / 2, z: (js.z + jn.z) / 2 };
    const low = (h.levels?.waterY ?? -43) + 4;
    const yAt = (x, z, ref) => h.surfaceY(x, z, ref);
    const path = { x: js.x - 95, z: js.z + 14 };
    const terrace = { x: js.x - 220, z: js.z + 8 };
    return {
      js, jn, mid, path, terrace,
      waterY: h.levels?.waterY,
      yPath: yAt(path.x, path.z) ?? h.heightAt(path.x, path.z),
      yMidLow: yAt(mid.x, mid.z, low),
      yMidHigh: yAt(mid.x, mid.z, Infinity),
      yTerrace: yAt(terrace.x, terrace.z) ?? h.heightAt(terrace.x, terrace.z),
      yJsLow: yAt(js.x, js.z, low),
    };
  });
}

async function shootSet(page, suffix) {
  const v = await viewpoints(page);
  console.log('viewpoints', suffix, v);

  // 1) 잠수교 from the south-bank bike path, looking out along both decks
  {
    const x = v.path.x, z = v.path.z;
    const y = (v.yPath ?? -40) + 0.15;
    const yaw = look(x, z, v.mid.x, v.mid.z);
    await go(page, { x, z, y, yaw, dist: 5.6, pitch: 0.22, fov: 58 });
    await shot(page, `jamsu-from-bikepath-${suffix}`);
    console.log('wrote', `jamsu-from-bikepath-${suffix}.png`);
  }

  // 2) on the lower deck under 반포대교, looking along 잠수교 with a bit of river
  {
    const x = v.mid.x, z = v.mid.z;
    const y = (v.yMidLow ?? -40.3) + 0.12;
    const yaw = look(x, z, v.jn.x + 55, v.jn.z);
    await go(page, { x, z, y, yaw, dist: 8.2, pitch: -0.34, fov: 68 });
    await shot(page, `jamsu-under-banpo-${suffix}`);
    console.log('wrote', `jamsu-under-banpo-${suffix}.png`);
  }

  // 3) 반포한강공원 terraces, near the river edge west of the south abutment
  {
    const x = v.terrace.x, z = v.terrace.z;
    const y = (v.yTerrace ?? -40) + 0.12;
    const yaw = look(x, z, v.mid.x, v.mid.z);
    await go(page, { x, z, y, yaw, dist: 5.6, pitch: 0.22, fov: 60 });
    await shot(page, `park-terraces-${suffix}`);
    console.log('wrote', `park-terraces-${suffix}.png`);
  }

  // 4) aerial from the east so the two stacked decks separate
  {
    const x = v.mid.x + 540, z = v.mid.z + 90;
    const y = (v.yMidLow ?? -40) + 2;
    const yaw = look(x, z, v.mid.x, v.mid.z);
    await go(page, { x, z, y, yaw, dist: 820, pitch: 0.5, fov: 50, hidePlayer: true });
    await shot(page, `aerial-segment-${suffix}`);
    console.log('wrote', `aerial-segment-${suffix}.png`);
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
