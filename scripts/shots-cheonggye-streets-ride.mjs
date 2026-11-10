import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5195/';
const OUT = process.env.OUT || path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });
const Q = 'lang=ko&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0&bp24game=0&controlscard=0';
function lookYaw(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(hour) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${B}?${Q}&hour=${hour}&enter=1&shot=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return page;
}
async function go(page, x, z, yaw = 0, dist = 28, pitch = 0.35) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj;
    J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z);
    J.player.rotation.y = yaw;
    J.cam.yaw = yaw;
    J.cam.pitch = pitch;
    J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForTimeout(2800);
}
async function waitStreets(page) {
  const info = await page.waitForFunction(() => {
    try { window.__jj?.subway?.ensureStation('cheonggyesan'); } catch {}
    const hits = [];
    const seen = new Set();
    const walk = (o, d = 0) => {
      if (!o || seen.has(o) || d > 12) return;
      seen.add(o);
      const n = o.name || '';
      if (/cheonggye/i.test(n)) {
        let bb = null;
        try {
          if (o.geometry) { o.geometry.computeBoundingBox?.(); const b = o.geometry.boundingBox; if (b) bb = { min: b.min.toArray(), max: b.max.toArray() }; }
        } catch {}
        hits.push({ name: n, vis: o.visible !== false, children: o.children?.length || 0, bb });
      }
      for (const c of o.children || []) walk(c, d + 1);
      if (o.parent && !seen.has(o.parent)) walk(o.parent, d + 1);
    };
    walk(window.__jj?.player);
    walk(window.__jj?.corridor?.group || window.__jj?.corridor?.root);
    return hits.length ? hits : false;
  }, null, { timeout: 90000 }).catch(() => null);
  const val = info ? await info.jsonValue?.().catch(() => null) || await page.evaluate(() => {
    const hits = [];
    const seen = new Set();
    const walk = (o, d = 0) => {
      if (!o || seen.has(o) || d > 14) return;
      seen.add(o);
      if (/cheonggye/i.test(o.name || '')) hits.push({ name: o.name, vis: o.visible !== false, children: o.children?.length || 0 });
      for (const c of o.children || []) walk(c, d + 1);
    };
    let r = window.__jj?.player; while (r?.parent) r = r.parent;
    walk(r);
    return hits;
  }) : [];
  console.log('scene cheonggye', JSON.stringify(val));
  await page.waitForTimeout(800);
}

const e1 = { x: -4782.8, z: -9114.0, ry: 0.377 };
const road = { x: -4794.27, z: -9104.80 };
const fx = Math.sin(e1.ry), fz = Math.cos(e1.ry);

const page = await open(14);
await waitStreets(page);
const nx = e1.x - fx * 9.5, nz = e1.z - fz * 9.5;
await go(page, nx, nz, lookYaw(nx, nz, e1.x + fx * 3, e1.z + fz * 3), 12, 0.10);
await page.screenshot({ path: path.join(OUT, 'route-cheonggye-station-near.png'), type: 'png' });
console.log('wrote near');

// stand on 청계산로 looking at the canopy
await go(page, road.x, road.z, lookYaw(road.x, road.z, e1.x, e1.z), 14, 0.12);
await page.screenshot({ path: path.join(OUT, 'route-cheonggye-station-road.png'), type: 'png' });
console.log('wrote road-from-street');

await go(page, e1.x, e1.z, 0.85, 110, 1.15);
await page.screenshot({ path: path.join(OUT, 'route-cheonggye-station-aerial.png'), type: 'png' });
console.log('wrote aerial');

const night = await open(20);
await waitStreets(night);
await go(night, nx, nz, lookYaw(nx, nz, e1.x + fx * 3, e1.z + fz * 3), 12, 0.10);
await night.screenshot({ path: path.join(OUT, 'route-cheonggye-station-night.png'), type: 'png' });
console.log('wrote night');
await go(night, road.x, road.z, lookYaw(road.x, road.z, e1.x, e1.z), 14, 0.12);
await night.screenshot({ path: path.join(OUT, 'route-cheonggye-station-road-night.png'), type: 'png' });
console.log('wrote road-night');
await night.close();

// 정자 → skip to 청계산입구
const until = (fn, t = 90000) => page.waitForFunction(fn, null, { timeout: t, polling: 120 });
try {
  await page.evaluate(() => {
    const e = window.__jj.subway.entrances.find((q) => q.exit.ref === '4') || window.__jj.subway.entrances[0];
    const s = Math.sin(e.ry), c = Math.cos(e.ry);
    window.__jj.teleport(e.x - s, e.z - c);
    window.__jj.player.rotation.y = e.ry;
    window.__jj.setMode('follow');
    window.__jj.cam.yaw = e.ry + Math.PI;
  });
  await page.waitForTimeout(600);
  await page.keyboard.down('KeyW');
  await until(() => window.__jj.subway.state.phase === 'inside' && window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.__jj.subway.toPlatform('shin', 1));
  await until(() => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping);
  await page.evaluate(() => window.__jj.subway.inside.callTrain(13));
  await until(() => window.__jj.subway.inside?.doorsNow > 0.9, 60000).catch(() => {});
  await page.evaluate(() => {
    const i = window.__jj.subway.inside;
    const d = i.lay.doors.find((q) => q.label === '3-2') || i.lay.doors[0];
    i.player.position.set(d.x, 0, -0.4);
    i.player.rotation.y = 0;
    i.cam.yaw = Math.PI;
  });
  await page.keyboard.down('KeyW');
  await until(() => window.__jj.subway.room === 'train' && !window.__jj.subway.swapping, 60000);
  await page.keyboard.up('KeyW');
  const hopped = await page.evaluate(() => {
    const i = window.__jj.subway.inside;
    let last = {};
    for (let n = 0; n < 500; n++) {
      const cur = i.segs?.[i.stopIndex];
      const at = i.stage === 'stop' && cur?.name === '청계산입구';
      if (at && i.canAlight) { last = { ok: true, n, stage: i.stage, name: cur.name, can: i.canAlight, elapsed: i.elapsed, segs: i.segs.map((s) => s.name) }; break; }
      i.skip(at ? 0.5 : 12);
      last = { ok: false, n, stage: i.stage, name: cur?.name, can: i.canAlight, elapsed: i.elapsed };
    }
    return last;
  });
  console.log('hopped', JSON.stringify(hopped));
  await page.screenshot({ path: path.join(OUT, 'route-ride-train-cheonggyesan.png'), type: 'png' });
  if (hopped.ok) {
    await page.evaluate(() => {
      const i = window.__jj.subway.inside, p = i.player.position;
      const d = i.doors.reduce((b, x) => (Math.abs(x - p.x) < Math.abs(b - x) ? x : b), i.doors[0]);
      p.set(d + 0.35, 0, -0.2);
      i.player.rotation.y = 0;
      i.cam.yaw = 0;
    });
    await page.keyboard.down('KeyW');
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      await page.waitForTimeout(120);
      if (await page.evaluate(() => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping)) break;
    }
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({ room: window.__jj.subway.room, station: window.__jj.subway.station?.name, phase: window.__jj.subway.state.phase }));
    console.log('alighted', after);
    await page.screenshot({ path: path.join(OUT, 'route-ride-alight-cheonggyesan.png'), type: 'png' });
    await page.evaluate(() => window.__jj.subway.toConcourse?.({ well: 1 }));
    await until(() => window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping, 60000).catch(() => {});
    await page.screenshot({ path: path.join(OUT, 'route-ride-cheonggyesan-concourse.png'), type: 'png' });
    await page.evaluate(() => {
      const S = window.__jj.subway;
      S.openChooser();
      const id = S.exits.find((e) => e.ref === '1')?.id || S.exits[0]?.id;
      if (id) S.choose(id);
      S.go();
    });
    await page.waitForTimeout(2800);
    const outside = await page.evaluate(() => ({ phase: window.__jj.subway.state.phase, room: window.__jj.subway.room }));
    console.log('exited', outside);
    await page.screenshot({ path: path.join(OUT, 'route-ride-cheonggyesan-exit.png'), type: 'png' });
  }
} catch (err) {
  console.error('ride failed', err);
  await page.screenshot({ path: path.join(OUT, 'route-ride-error.png'), type: 'png' }).catch(() => {});
}
await browser.close();
console.log('done');
