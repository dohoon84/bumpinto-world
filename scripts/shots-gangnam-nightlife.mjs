// [gangnam-nightlife] 강남 밤거리 스크린샷. vite preview 가 떠 있어야 한다.
//   BASE=http://127.0.0.1:5221/ OUT=/opt/cursor/artifacts node scripts/shots-gangnam-nightlife.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5221/';
const OUT = process.env.OUT || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/google/chrome/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// 기본 강남 NPC 켜짐(?gangnamnpc 생략). 정자 전용 NPC/택시만 꺼서 샷을 가볍게.
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
  await page.waitForFunction(() => {
    const n = window.__jj?.gangnamNpc?.stats?.();
    return n?.ready && (n.cars?.drawn > 0 || n.cars?.total > 0);
  }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(wait);
}

function fleetInfo() {
  return window.__jj && (() => {
    const J = window.__jj;
    const nl = J.gangnamNightlife;
    const npc = J.gangnamNpc;
    const loop = nl?.root?.getObjectByName?.('gnightCars') || J.scene?.getObjectByName?.('gnightCars');
    const list = npc?.traffic?.sim?.list || [];
    const pts = [];
    for (const t of list) {
      if (!t || t.parked) continue;
      pts.push({ x: t.mesh.position.x, z: t.mesh.position.z, kind: t.kind, L: t.K?.L || 4.6 });
    }
    let minD = Infinity, close = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        if (d < minD) minD = d;
        const need = (pts[i].L + pts[j].L) * 0.45;
        if (d < need) close++;
      }
    }
    return {
      nl: nl?.stats || null,
      npc: npc?.stats?.() || null,
      loopFleet: !!loop,
      npcCars: pts.length,
      minPairM: Number.isFinite(minD) ? +minD.toFixed(2) : null,
      tightPairs: close,
    };
  })();
}

const night = await open({ hour: 21 });
await surface(night, -7150, -14590, 0.22, 34, 0.16, 8000);
await night.screenshot({ path: `${OUT}/gnight5-daero.png` });
const daero = await night.evaluate(fleetInfo);

await surface(night, -7140, -14530, 0.35, 200, 1.05, 7000);
await night.screenshot({ path: `${OUT}/gnight5-aerial.png` });
const aerial = await night.evaluate(fleetInfo);
await night.close();
await browser.close();
console.log(JSON.stringify({ out: OUT, daero, aerial }, null, 2));
