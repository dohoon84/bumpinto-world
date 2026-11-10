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
  await page.waitForTimeout(wait);
}

function streetInfo() {
  return window.__jj && (() => {
    const J = window.__jj;
    const st = J.gangnamStreet;
    const names = [];
    J.scene?.traverse?.((o) => { if (o.isInstancedMesh && o.name?.startsWith?.('gnStreet')) names.push({ name: o.name, count: o.count }); });
    return { stats: st?.stats || null, meshes: names, visible: !!st?.root?.visible };
  })();
}

// 22012 중앙 BRT 섬 (두 busway 사이)
const ISLAND = { x: -7261.0, z: -14834.9, yaw: 1.945 };
const fx = Math.sin(ISLAND.yaw), fz = Math.cos(ISLAND.yaw);
const rx = Math.cos(ISLAND.yaw), rz = -Math.sin(ISLAND.yaw);
const TOP = { x: ISLAND.x, z: ISLAND.z, yaw: 0.374, dist: 52, pitch: 1.38 };
const NIGHT = {
  x: ISLAND.x + fx * 10 + rx * -5,
  z: ISLAND.z + fz * 10 + rz * -5,
  yaw: ISLAND.yaw - 0.42,
  dist: 13,
  pitch: 0.30,
};

const day = await open({ hour: 14 });
await surface(day, TOP.x, TOP.z, TOP.yaw, TOP.dist, TOP.pitch, 7500);
await day.evaluate(() => {
  const el = document.createElement('div');
  el.id = 'gn8-legend';
  el.style.cssText = 'position:fixed;left:16px;top:16px;z-index:9999;background:rgba(8,10,16,.72);color:#f3f5f8;padding:10px 12px;font:13px/1.45 sans-serif;border-radius:8px;pointer-events:none';
  el.innerHTML = '탑다운 · 강남역(중) 22012<br><span style="color:#ff6b55">■</span> 빨강 = 중앙버스전용차로<br><span style="color:#c5ccd6">■</span> 섬 위 = 쉘터·벤치·파일런';
  document.body.appendChild(el);
});
await day.screenshot({ path: `${OUT}/gnight8-busstop-top.png` });
const topInfo = await day.evaluate(streetInfo);
await day.close();

const night = await open({ hour: 21 });
await surface(night, NIGHT.x, NIGHT.z, NIGHT.yaw, NIGHT.dist, NIGHT.pitch, 8000);
const veh = await night.evaluate(() => {
  const J = window.__jj;
  const keys = Object.keys(J || {}).filter((k) => /npc|car|bus|traffic|gangnam|veh/i.test(k));
  const names = [];
  let near = 0;
  J.scene?.traverse?.((o) => {
    const n = o.name || '';
    if (/car|bus|veh|npc|traffic|fleet/i.test(n)) names.push({ name: n, type: o.type, count: o.count });
    if (o.isInstancedMesh && /car|bus|veh|npc/i.test(n) && o.count) near += o.count;
  });
  return { keys, names: names.slice(0, 24), near };
});
await night.screenshot({ path: `${OUT}/gnight8-busstop-night.png` });
const nightInfo = await night.evaluate(streetInfo);
await night.close();
await browser.close();
console.log(JSON.stringify({ out: OUT, top: TOP, night: NIGHT, topInfo, nightInfo, veh }, null, 2));
