// 정자역 주변 툰 vs 원본 비교 스크린샷 + draw/tris
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { existsSync } = require('node:fs');

const PORT = process.env.PORT || '5388';
const OUT = process.env.OUT || '/workspace/toon-shots';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
await mkdir(OUT, { recursive: true });

const BASE_Q = 'ws=mock&enter=1&shot=1&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0&weather=clear&memhud=0';

const yawLook = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

const SPOTS = {
  spawn: {
    // 입장 직후: 정자역 표지 옆 기본 스폰, 기본 카메라
    useSpawn: true, yaw: Math.PI * 0.85, pitch: 0.32, dist: 14,
  },
  fountain: {
    // 광장 분수대·빈백, 뒤에 킨스타워/SK-U타워
    x: -74, z: 8, yaw: Math.PI, pitch: 0.26, dist: 16,
  },
  towers: {
    // 역에서 서쪽, 킨스타워·SK-U타워 파사드(창이 읽히는지)
    x: -100, z: 20, yaw: yawLook(-100, 20, -159, 52.4), pitch: 0.18, dist: 18,
  },
  boundary: {
    // 반경 ~300 m 서쪽 경계에서 역·타워 쪽을 바라봄
    x: -306, z: 6, yaw: yawLook(-306, 6, -6.6, 6.4), pitch: 0.2, dist: 24,
  },
};

const CASES = [
  { name: 'desk-day', hour: 15, vp: { width: 1280, height: 800 }, mobile: false, spots: ['spawn', 'fountain', 'towers', 'boundary'] },
  { name: 'desk-night', hour: 22, vp: { width: 1280, height: 800 }, mobile: false, spots: ['spawn', 'fountain', 'towers'] },
  { name: 'mob-day', hour: 15, vp: { width: 844, height: 390 }, mobile: true, spots: ['spawn', 'fountain', 'boundary'] },
  { name: 'mob-night', hour: 22, vp: { width: 844, height: 390 }, mobile: true, spots: ['spawn', 'fountain'] },
];

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

function launchArgs() {
  return ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
}

async function openPage(browser, { hour, vp, mobile, toon }) {
  const errors = [];
  const ctxOpts = { viewport: vp };
  if (mobile) {
    Object.assign(ctxOpts, { deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_MOBILE });
  }
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 240));
  });
  const q = `${BASE_Q}&hour=${hour}${toon ? '' : '&toon=0'}${mobile ? '&mobile=1' : ''}`;
  await page.goto(`http://127.0.0.1:${PORT}/?${q}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, { timeout: 240000 });
  await page.evaluate(() => { window.__jj?.wake?.(); document.getElementById('lobby-go')?.click(); });
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}

async function pose(page, spotKey) {
  const s = { key: spotKey, ...SPOTS[spotKey] };
  await page.evaluate((s) => {
    const j = window.__jj;
    j.wake?.();
    j.setMode?.('follow');
    let x = s.x, z = s.z;
    if (s.useSpawn) {
      const sp = j.world?.signPos;
      x = (sp?.x ?? -6.6) + 4;
      z = (sp?.z ?? 6.4) + 4;
    }
    j.teleport(x, z);
    j.cam.yaw = s.yaw;
    j.cam.pitch = s.pitch;
    j.cam.dist = s.dist;
  }, s);
  await page.waitForTimeout(1800);
  // instancer 통계(draw 증가 원인 확인)
  const inst = await page.evaluate(() => window.__jj?.perfmem?.instancer?.stats || window.__jj?.perfmem?.stats || null);
  return inst;
}

async function stats(page) {
  return page.evaluate(() => {
    const r = window.__jj?.renderer;
    const info = r?.info?.render || {};
    const mem = r?.info?.memory || {};
    const toon = window.__jj?.toon || null;
    return {
      calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines,
      geometries: mem.geometries, textures: mem.textures,
      toon,
    };
  });
}

async function shot(page, path) {
  await page.screenshot({ path, type: 'png' });
}

const results = [];
const browser = await chromium.launch({ executablePath: CHROME, args: launchArgs() });

for (const c of CASES) {
  for (const toon of [true, false]) {
    const tag = toon ? 'toon' : 'orig';
    console.log('load', c.name, tag);
    const { ctx, page, errors } = await openPage(browser, { ...c, toon });
    const toonInfo = await page.evaluate(() => window.__jj?.toon || null);
    console.log('  ready toonInfo=', JSON.stringify(toonInfo), 'errors', errors.length);
    for (const sp of c.spots) {
      const inst = await pose(page, sp);
      const st = await stats(page);
      st.inst = inst;
      const file = `${c.name}-${sp}-${tag}.png`;
      const path = `${OUT}/${file}`;
      await shot(page, path);
      results.push({ case: c.name, spot: sp, tag, file, path, ...st, errors: [...errors] });
      console.log('  ', file, 'draws', st.calls, 'tris', st.triangles, 'errs', errors.length);
    }
    await ctx.close();
  }
}

await writeFile(`${OUT}/metrics.json`, JSON.stringify(results, null, 2));
console.log('WROTE', `${OUT}/metrics.json`);
await browser.close();
