// [gangnam-nightlife] 강남 밤거리 스크린샷. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5221/ OUT=/workspace/bw-gangnam-nightlife/artifacts node scripts/shots-gangnam-nightlife.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5221/';
const OUT = process.env.OUT || '/workspace/bw-gangnam-nightlife/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const Q = 'enter=1&name=Tester&ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0';

async function open({ w = 1280, h = 800, hour = 21, extra = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${B}?${Q}&hour=${hour}&shot=1${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  return page;
}
async function surface(page, x, z, yaw = 0, dist = 22, pitch = 0.38, wait = 9000) {
  await page.evaluate(async ({ x, z, yaw, dist, pitch }) => {
    const J = window.__jj; J.setMode('follow');
    if (J.corridor) await J.corridor.preload(x, z);
    J.teleport(x, z); J.player.rotation.y = yaw; J.cam.yaw = yaw; J.cam.pitch = pitch; J.cam.dist = dist;
  }, { x, z, yaw, dist, pitch });
  await page.waitForFunction(() => window.__jj?.gangnamStreet?.stats?.loaded, null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => window.__jj?.gangnamBrt?.stats?.loaded, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(wait);
}

const ISLAND = { x: -7261.0, z: -14834.9, yaw: 1.945 };
const fx = Math.sin(ISLAND.yaw), fz = Math.cos(ISLAND.yaw);
const rx = Math.cos(ISLAND.yaw), rz = -Math.sin(ISLAND.yaw);
const TOP = { x: ISLAND.x, z: ISLAND.z, yaw: 0.374, dist: 52, pitch: 1.38 };

async function stage(page) {
  return page.evaluate(() => {
    const brt = window.__jj?.gangnamBrt;
    if (!brt?.stageAt) return { ok: false };
    return { ok: true, ...brt.stageAt('22012'), stats: { ...brt.stats } };
  });
}

function reviewInfo() {
  return window.__jj && (() => {
    const J = window.__jj;
    const vs = J.gangnamBrt?.vehicles?.() || [];
    const island = { x: -7261.0, z: -14834.9 };
    const near = vs.map((v) => ({
      ref: v.ref, type: v.type, state: v.state,
      d: Math.hypot(v.x - island.x, v.z - island.z),
      x: +v.x.toFixed(1), z: +v.z.toFixed(1), heading: +v.heading.toFixed(3),
    })).filter((v) => v.d < 80).sort((a, b) => a.d - b.d);
    const names = [];
    J.scene?.traverse?.((o) => { if (o.name?.startsWith?.('gnStreet') || o.name === 'gangnamBrt') names.push({ name: o.name, type: o.type, count: o.count, children: o.children?.length }); });
    return {
      brt: J.gangnamBrt?.stats || null,
      street: J.gangnamStreet?.stats || null,
      npc: J.gangnamNpc?.stats?.() || null,
      near,
    };
  })();
}

// --- day 3/4 ---
const day = await open({ hour: 14 });
await surface(day, ISLAND.x + fx * 12 + rx * -6, ISLAND.z + fz * 12 + rz * -6, ISLAND.yaw - 0.5, 16, 0.32, 7000);
const dayStage = await stage(day);
await day.waitForTimeout(400);
await day.screenshot({ path: `${OUT}/gnight9-brt-day.png` });
const dayInfo = await day.evaluate(reviewInfo);
await day.close();

// --- aerial top ---
const top = await open({ hour: 14 });
await surface(top, TOP.x, TOP.z, TOP.yaw, TOP.dist, TOP.pitch, 7500);
const topStage = await stage(top);
await top.waitForTimeout(400);
await top.evaluate(() => {
  const el = document.createElement('div');
  el.id = 'gn9-legend';
  el.style.cssText = 'position:fixed;left:16px;top:16px;z-index:9999;background:rgba(8,10,16,.72);color:#f3f5f8;padding:10px 12px;font:13px/1.45 sans-serif;border-radius:8px;pointer-events:none';
  el.innerHTML = '탑다운 · 중앙버스전용차로 양방향<br><span style="color:#ff6b55">■</span> 빨강 = 버스전용차로 · 버스는 중앙 · 차는 바깥';
  document.body.appendChild(el);
});
await top.screenshot({ path: `${OUT}/gnight9-brt-top.png` });
const topInfo = await top.evaluate(reviewInfo);
await top.close();

// --- night dwell ---
const NIGHT = {
  x: ISLAND.x + fx * 12 + rx * -6,
  z: ISLAND.z + fz * 12 + rz * -6,
  yaw: ISLAND.yaw - 0.5,
  dist: 16,
  pitch: 0.32,
};
const night = await open({ hour: 21 });
await surface(night, NIGHT.x, NIGHT.z, NIGHT.yaw, NIGHT.dist, NIGHT.pitch, 8000);
const nightStage = await stage(night);
const framed = await night.evaluate(() => {
  const r = window.__jj.gangnamBrt?.stageAt('22012');
  const bus = r?.dwell?.[0] || null;
  return { bus: bus && { ref: bus.ref, type: bus.type, state: bus.state, x: bus.x, z: bus.z } };
});
await night.waitForTimeout(500);
await night.screenshot({ path: `${OUT}/gnight9-brt-dwell-night.png` });
const nightInfo = await night.evaluate(reviewInfo);
await night.close();
await browser.close();
console.log(JSON.stringify({ out: OUT, dayStage, topStage, nightStage, framed, dayInfo, topInfo, nightInfo }, null, 2));
