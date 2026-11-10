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
async function open(hour) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${B}?${Q}&hour=${hour}&enter=1&shot=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('lobby-go')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2200);
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
async function waitName(page, names, ms = 60000) {
  await page.waitForFunction((names) => {
    const root = window.__jj?.corridor?.root?.parent || window.__jj?.world?.group;
    const sub = window.__jj?.subway;
    if (sub) {
      try { for (const id of ['cheonggyesan', 'pangyo']) sub.ensureStation(id); } catch {}
    }
    let ok = false;
    const hit = new Set(names);
    root?.traverse?.((o) => { if (hit.has(o.name)) ok = true; });
    if (sub?.entrances?.some((e) => e.exit?.id?.includes('cheonggyesan') || e.exit?.id?.includes('pangyo'))) ok = true;
    return ok;
  }, names, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(700);
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { shots: [], ride: {}, errors: [] };

const e1 = { x: -4782.8, z: -9114.0, ry: 0.377 };
const fx = Math.sin(e1.ry), fz = Math.cos(e1.ry);
const page = await open(14);

// --- 청계산 낮 ---
await page.evaluate(() => window.__jj.subway?.ensureStation('cheonggyesan'));
const nx = e1.x - fx * 9.5, nz = e1.z - fz * 9.5;
await go(page, nx, nz, lookYaw(nx, nz, e1.x + fx * 3, e1.z + fz * 3), 12, 0.10);
await waitName(page, ['cheonggyeStationSign', 'cheonggyeLocalStreets', 'cheonggyeEntrances']);
await page.screenshot({ path: path.join(OUT, 'route-cheonggye-station-near.png'), type: 'png' });
report.shots.push('route-cheonggye-station-near.png');
console.log('wrote route-cheonggye-station-near.png');

const rx = e1.x - fx * 15.5, rz = e1.z - fz * 15.5;
await go(page, rx, rz, lookYaw(rx, rz, e1.x + fx * 1.5, e1.z + fz * 1.5), 16.5, 0.10);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, 'route-cheonggye-station-road.png'), type: 'png' });
report.shots.push('route-cheonggye-station-road.png');
console.log('wrote route-cheonggye-station-road.png');

await go(page, e1.x, e1.z, 0.2, 95, 1.12);
await page.waitForTimeout(1600);
await page.screenshot({ path: path.join(OUT, 'route-cheonggye-station-aerial.png'), type: 'png' });
report.shots.push('route-cheonggye-station-aerial.png');
console.log('wrote route-cheonggye-station-aerial.png');

await go(page, -7780, -14680, lookYaw(-7780, -14680, -7500, -15180), 26, 0.16);
await page.waitForTimeout(1600);
await page.screenshot({ path: path.join(OUT, 'route-audit-gangnam-approach.png'), type: 'png' });
report.shots.push('route-audit-gangnam-approach.png');
console.log('wrote route-audit-gangnam-approach.png');

// --- 판교 낮 ---
const p1 = await page.evaluate(() => {
  const st = window.__jj.subway.ensureStation('pangyo');
  const e = st?.ent?.list?.find((q) => q.exit.ref === '1') || st?.ent?.list?.[0];
  return e ? { x: e.x, z: e.z, ry: e.ry, id: e.exit.id, n: st.ent.list.length, refs: st.ent.list.map((q) => q.exit.ref) } : null;
});
report.pangyoEntrance = p1;
console.log('pangyo entrance', p1);
if (p1) {
  const px = p1.x - Math.sin(p1.ry) * 7.2, pz = p1.z - Math.cos(p1.ry) * 7.2;
  await go(page, px, pz, lookYaw(px, pz, p1.x + Math.sin(p1.ry) * 2, p1.z + Math.cos(p1.ry) * 2), 11, 0.12);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, 'route-pangyo-station-day.png'), type: 'png' });
  report.shots.push('route-pangyo-station-day.png');
  console.log('wrote route-pangyo-station-day.png');

  const sx = p1.x - Math.sin(p1.ry) * 3.1, sz = p1.z - Math.cos(p1.ry) * 3.1;
  await go(page, sx, sz, lookYaw(sx, sz, p1.x + Math.sin(p1.ry) * 4.2, p1.z + Math.cos(p1.ry) * 4.2), 6.4, 0.42);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, 'route-pangyo-station-stairs.png'), type: 'png' });
  report.shots.push('route-pangyo-station-stairs.png');
  console.log('wrote route-pangyo-station-stairs.png');
}

// --- night page ---
const night = await open(20);
await night.evaluate(() => { window.__jj.subway?.ensureStation('cheonggyesan'); window.__jj.subway?.ensureStation('pangyo'); });
await go(night, nx, nz, lookYaw(nx, nz, e1.x + fx * 3, e1.z + fz * 3), 12, 0.10);
await waitName(night, ['cheonggyeStationSign', 'cheonggyeEntrances']);
await night.screenshot({ path: path.join(OUT, 'route-cheonggye-station-night.png'), type: 'png' });
report.shots.push('route-cheonggye-station-night.png');
console.log('wrote route-cheonggye-station-night.png');

if (p1) {
  const px = p1.x - Math.sin(p1.ry) * 7.2, pz = p1.z - Math.cos(p1.ry) * 7.2;
  await go(night, px, pz, lookYaw(px, pz, p1.x + Math.sin(p1.ry) * 2, p1.z + Math.cos(p1.ry) * 2), 11, 0.12);
  await night.waitForTimeout(1800);
  await night.screenshot({ path: path.join(OUT, 'route-pangyo-station-night.png'), type: 'png' });
  report.shots.push('route-pangyo-station-night.png');
  console.log('wrote route-pangyo-station-night.png');
}
await night.close();

// --- ride proof: 정자 → 판교 → 청계산입구 ---
const until = (fn, t = 120000) => page.waitForFunction(fn, null, { timeout: t, polling: 120 });
try {
  await page.evaluate(() => {
    const e = window.__jj.subway.entrances.find((q) => q.exit.ref === '4') || window.__jj.subway.entrances[0];
    const s = Math.sin(e.ry), c = Math.cos(e.ry);
    window.__jj.teleport(e.x - s, e.z - c);
    window.__jj.player.rotation.y = e.ry;
    window.__jj.setMode('follow');
    window.__jj.cam.yaw = e.ry + Math.PI;
  });
  await page.waitForTimeout(1000);
  await page.keyboard.down('KeyW');
  await until(() => window.__jj.subway.state.phase === 'inside' && window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping);
  await page.keyboard.up('KeyW');
  report.ride.enteredJeongja = await page.evaluate(() => ({ station: window.__jj.subway.station.name, room: window.__jj.subway.room }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'route-ride-jeongja-concourse.png'), type: 'png' });
  report.shots.push('route-ride-jeongja-concourse.png');

  await page.evaluate(() => window.__jj.subway.toPlatform('shin', 1));
  await until(() => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping);
  report.ride.fromJeongja = await page.evaluate(() => ({
    station: window.__jj.subway.station.name,
    dir: window.__jj.subway.inside.sign?.dirKo,
    next: window.__jj.subway.inside.sign?.next,
    rides: window.__jj.subway.inside.rides.map((q) => ({ name: q.name, game: q.game, pass: !!q.pass, id: q.id })),
  }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'route-ride-jeongja-platform.png'), type: 'png' });
  report.shots.push('route-ride-jeongja-platform.png');

  async function boardAndAlight(wantName, slug) {
    await page.evaluate(() => window.__jj.subway.inside.callTrain(13));
    await until(() => window.__jj.subway.inside?.doorsNow > 0.9, 60000).catch(() => {});
    await page.waitForTimeout(800);
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
    await page.waitForTimeout(600);
    for (let k = 0; k < 240; k++) {
      const st = await page.evaluate((want) => {
        const i = window.__jj.subway.inside;
        const cur = i.segs?.[i.stopIndex];
        if (i.stage !== 'stop' || cur?.name !== want) i.skip?.(1);
        return { stage: i.stage, name: i.segs?.[i.stopIndex]?.name, game: i.segs?.[i.stopIndex]?.game, can: i.canAlight };
      }, wantName);
      if (st.stage === 'stop' && st.name === wantName) break;
    }
    await until(() => window.__jj.subway.inside?.canAlight === true, 30000);
    const atStop = await page.evaluate(() => {
      const i = window.__jj.subway.inside;
      return { name: i.segs[i.stopIndex].name, game: i.segs[i.stopIndex].game, rides: i.segs.map((s) => ({ name: s.name, game: s.game })) };
    });
    await page.screenshot({ path: path.join(OUT, `route-ride-train-${slug}.png`), type: 'png' });
    report.shots.push(`route-ride-train-${slug}.png`);
    await page.evaluate(() => {
      const i = window.__jj.subway.inside, p = i.player.position;
      const d = i.doors.reduce((b, x) => (Math.abs(x - p.x) < Math.abs(b - p.x) ? x : b), i.doors[0]);
      p.set(d + 0.35, 0, -0.2);
      i.player.rotation.y = 0;
      i.cam.yaw = 0;
      i.cam.pitch = 0.02;
      i.cam.dist = 0.9;
    });
    await page.waitForTimeout(400);
    await page.keyboard.down('KeyW');
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      await page.waitForTimeout(120);
      const room = await page.evaluate(() => window.__jj.subway.room);
      if (room === 'platform' && !(await page.evaluate(() => window.__jj.subway.swapping))) break;
    }
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({ room: window.__jj.subway.room, station: window.__jj.subway.station.name }));
    report.ride[slug] = { atStop, after };
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `route-ride-alight-${slug}.png`), type: 'png' });
    report.shots.push(`route-ride-alight-${slug}.png`);
    return after;
  }

  const atPangyo = await boardAndAlight('판교', 'pangyo');
  await page.evaluate(() => window.__jj.subway.toConcourse?.({ well: 1 }));
  await until(() => window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping, 60000).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'route-ride-pangyo-concourse.png'), type: 'png' });
  report.shots.push('route-ride-pangyo-concourse.png');
  // 출구로 나가기
  await page.evaluate(() => {
    const S = window.__jj.subway;
    S.openChooser();
    const id = S.exits.find((e) => e.ref === '1')?.id || S.exits[0]?.id;
    if (id) S.choose(id);
    S.go();
  });
  await until(() => window.__jj.subway.room !== 'concourse' && !window.__jj.subway.active || window.__jj.subway.state.phase !== 'inside', 60000).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'route-ride-pangyo-exit.png'), type: 'png' });
  report.shots.push('route-ride-pangyo-exit.png');
  report.ride.exitedPangyo = await page.evaluate(() => ({ active: window.__jj.subway.active, room: window.__jj.subway.room, station: window.__jj.subway.station?.name, phase: window.__jj.subway.state.phase }));

  // 다시 판교 승강장에서 청계산입구까지
  await page.evaluate(() => {
    window.__jj.subway.ensureStation('pangyo');
    window.__jj.subway.enterById('pangyo-x1');
  });
  await until(() => window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping, 60000);
  await page.evaluate(() => window.__jj.subway.toPlatform('shin', 1));
  await until(() => window.__jj.subway.room === 'platform' && !window.__jj.subway.swapping);
  const atCg = await boardAndAlight('청계산입구', 'cheonggyesan');
  await page.evaluate(() => window.__jj.subway.toConcourse?.({ well: 1 }));
  await until(() => window.__jj.subway.room === 'concourse' && !window.__jj.subway.swapping, 60000).catch(() => {});
  await page.screenshot({ path: path.join(OUT, 'route-ride-cheonggyesan-concourse.png'), type: 'png' });
  report.shots.push('route-ride-cheonggyesan-concourse.png');
  await page.evaluate(() => {
    const S = window.__jj.subway;
    S.openChooser();
    const id = S.exits.find((e) => e.ref === '1')?.id || S.exits[0]?.id;
    if (id) S.choose(id);
    S.go();
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'route-ride-cheonggyesan-exit.png'), type: 'png' });
  report.shots.push('route-ride-cheonggyesan-exit.png');
  report.ride.exitedCheonggyesan = await page.evaluate(() => ({ active: window.__jj.subway.active, room: window.__jj.subway.room, station: window.__jj.subway.station?.name, phase: window.__jj.subway.state.phase }));
  report.ride.ok = atPangyo.station === '판교' && atCg.station === '청계산입구';
} catch (err) {
  report.errors.push(String(err && err.stack || err));
  console.error('ride proof failed', err);
  await page.screenshot({ path: path.join(OUT, 'route-ride-error.png'), type: 'png' }).catch(() => {});
}

fs.writeFileSync(path.join(OUT, 'route-cheonggye-pangyo-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
