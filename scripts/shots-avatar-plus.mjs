// 아바타 꾸미기 확장 스크린샷.
//   npm run build && npx vite preview --port 5195 --strictPort --host 127.0.0.1
//   BASE=http://127.0.0.1:5195/ OUT=artifacts node scripts/shots-avatar-plus.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5195/';
const OUT = process.env.OUT || path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });

const LINEUP = [
  { gender: 'm', face: 'round', hair: 'short', top: 'hoodie', color: '#4f7cff', pants: '#3b4252' },
  {
    gender: 'f', face: 'round', hair: 'long', hairColor: '#2a211c', eyes: 'smile', brows: 'arch', mouth: 'smile',
    blush: '1', top: 'hoodie', color: '#ff6b6b', pants: '#2d3436', shoes: '#f4efe4',
    hat: 'beanie', hatColor: '#e64980', glasses: 'round', bag: 'backpack', bagColor: '#3b4252',
    earrings: 'stud',
  },
  {
    gender: 'm', face: 'square', hair: 'short', hairColor: '#1a1a1a', eyes: 'sharp', brows: 'angry', mouth: 'grin',
    beard: 'full', top: 'long', color: '#2d3436', pants: '#1a1a1a', shoes: '#1a1a1a',
    hat: 'cap', hatColor: '#f59f00', glasses: 'sun', bag: 'backpack', bagColor: '#4f7cff',
  },
  {
    gender: 'f', face: 'round', hair: 'pony', hairColor: '#6b4423', eyes: 'sleepy', brows: 'worry', mouth: 'pout',
    freckles: '1', top: 'hoodie', pattern: 'stripe', color: '#20c997', pants: '#3b4252',
    bag: 'crossbody', bagColor: '#f4efe4', neck: 'scarf', watch: '1',
  },
  {
    gender: 'f', face: 'round', hair: 'medium', hairColor: '#c9a227', eyes: 'sparkle', brows: 'arch', mouth: 'smile',
    mole: 'cheek', blush: '1', eyeColor: '#844685', top: 'short', color: '#845ef7', pants: '#f4efe4', shoes: '#845ef7',
    hat: 'beret', hatColor: '#2d3436', earrings: 'hoop', neck: 'necklace', bag: 'tote', bagColor: '#f4efe4',
  },
  {
    gender: 'f', face: 'round', hair: 'long', hairColor: '#1a1a1a', eyes: 'wink', brows: 'straight', mouth: 'cat',
    blush: '1', top: 'short', color: '#e64980', pants: '#2d3436',
    hat: 'catear', hatColor: '#2a211c', bag: 'tote', bagColor: '#ff6b6b', earrings: 'hoop',
  },
  {
    gender: 'm', face: 'square', hair: 'short', eyes: 'round', brows: 'straight', mouth: 'none',
    top: 'long', pattern: 'block', color: '#4f7cff', pants: '#243044', shoes: '#2d3436',
    hat: 'helmet', hatColor: '#20c997', mask: 'cloth', bag: 'backpack', bagColor: '#2d3436',
  },
  {
    gender: 'm', face: 'long', hair: 'medium', hairColor: '#4a3428', eyes: 'round', brows: 'arch', mouth: 'smile',
    glasses: 'square', top: 'hoodie', color: '#f59f00', pants: '#3b4252', shoes: '#8d6e63',
    hat: 'bucket', hatColor: '#f59f00', bag: 'crossbody', bagColor: '#2d3436', watch: '1',
  },
  {
    gender: 'm', face: 'round', hair: 'bald', beard: 'goatee', hairColor: '#2a211c', eyes: 'round', brows: 'angry',
    mouth: 'grin', top: 'short', color: '#2d3436', pants: '#1a1a1a',
    hat: 'band', hatColor: '#ff6b6b', glasses: 'square', bag: 'backpack', bagColor: '#845ef7',
  },
  {
    gender: 'f', face: 'long', hair: 'pony', hairColor: '#d76a6a', eyes: 'sparkle', brows: 'arch', mouth: 'open',
    blush: '1', freckles: '1', mole: 'lip', skin: '#e8c4a8', eyeColor: '#1f4e79',
    top: 'hoodie', color: '#f4efe4', pants: '#e64980', shoes: '#f4efe4',
    hat: 'cap', hatColor: '#4f7cff', bag: 'backpack', bagColor: '#e64980', neck: 'necklace', earrings: 'stud',
  },
];

const LOBBY_LOOK = LINEUP[1];
const Q = 'ws=mock&bus=sim&weather=clear&noticePopup=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&roadbike=0&superbike=0&pangyonpc=0&gangnamnpc=0';

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const errs = [];

async function openWorld() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${B}?${Q}&hour=14&shot=1&enter=1&name=Tester`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__jj?.ready && window.__jj?.createAvatar, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  return page;
}

async function placeLineup(page) {
  return page.evaluate((looks) => {
    const J = window.__jj;
    J.player.visible = false;
    const sign = J.world?.signPos || { x: 8, z: 6 };
    const x0 = sign.x + 6;
    const z0 = sign.z + 2;
    const y0 = J.terrain?.getGroundHeight?.(x0, z0, 0) ?? 0;
    const spawned = [];
    looks.forEach((look, i) => {
      const mesh = J.createAvatar(look);
      const x = x0 + (i - (looks.length - 1) / 2) * 1.15;
      const z = z0;
      const y = J.terrain?.getGroundHeight?.(x, z, y0) ?? y0;
      mesh.position.set(x, y, z);
      mesh.rotation.y = Math.PI; // 카메라를 바라보게
      J.player.parent.add(mesh);
      spawned.push({ x, y, z });
    });
    const mid = spawned[Math.floor(spawned.length / 2)];
    J.teleport(mid.x, mid.z + 0.2, mid.y);
    J.player.rotation.y = Math.PI;
    J.setMode?.('follow');
    J.cam.yaw = 0;
    J.cam.pitch = 0.12;
    J.cam.dist = 8.4;
    window.__plusLineup = spawned;
    return { mid, sign: { x: sign.x, z: sign.z }, count: spawned.length };
  }, LINEUP);
}

async function aim(page, { dist, pitch = 0.08, yaw = 0, lift = 0, back = 0, side = 0 }) {
  await page.evaluate(({ dist, pitch, yaw, lift, back, side }) => {
    const J = window.__jj;
    const pts = window.__plusLineup;
    const mid = pts[Math.floor(pts.length / 2)];
    const cam = J.camera;
    const tx = mid.x + side;
    const ty = mid.y + 1.35 + lift;
    const tz = mid.z + back;
    const cx = tx + Math.sin(yaw) * dist;
    const cy = ty + Math.sin(pitch) * dist + 0.2;
    const cz = tz + Math.cos(yaw) * dist;
    J.setMode?.('free');
    cam.position.set(cx, cy, cz);
    cam.lookAt(tx, ty, tz);
    if (J.cam) { J.cam.dist = dist; J.cam.pitch = pitch; J.cam.yaw = yaw; }
  }, { dist, pitch, yaw, lift, back, side });
  await page.waitForTimeout(700);
}

function shot(page, name) {
  return page.screenshot({ path: `${OUT}/${name}.png` });
}

const world = await openWorld();
const info = await placeLineup(world);
console.log('lineup', info);
await world.waitForTimeout(2200);
await aim(world, { dist: 9.2, pitch: 0.08, yaw: 0 });
await shot(world, 'avatar-plus-lineup');

await aim(world, { dist: 3.4, pitch: 0.04, yaw: 0.12, lift: 0.28 });
await shot(world, 'avatar-plus-faces');

// 3/4 close-up so the printed face follows the head curve
await world.evaluate(() => {
  const J = window.__jj;
  const pts = window.__plusLineup;
  const i = 4;
  const p = pts[i];
  const cam = J.camera;
  J.setMode?.('free');
  cam.position.set(p.x + 0.55, p.y + 1.72, p.z + 0.72);
  cam.lookAt(p.x, p.y + 1.62, p.z);
});
await world.waitForTimeout(600);
await shot(world, 'avatar-plus-face-flush');

await aim(world, { dist: 6.6, pitch: 0.16, yaw: Math.PI, lift: 0.05 });
await shot(world, 'avatar-plus-back');

// lobby desktop
const lobbyLook = { name: '범프', look: LOBBY_LOOK };
const lobbyDesk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
lobbyDesk.on('pageerror', (e) => errs.push('lobby: ' + e.message));
await lobbyDesk.addInitScript((profile) => {
  localStorage.setItem('jeongja3d.profile', JSON.stringify(profile));
}, lobbyLook);
await lobbyDesk.goto(`${B}?${Q}&enter=1&hour=14`, { timeout: 180000, waitUntil: 'domcontentloaded' });
await lobbyDesk.waitForSelector('#lobby-card', { timeout: 240000 });
await lobbyDesk.waitForTimeout(2500);
await lobbyDesk.evaluate(() => {
  const fields = document.querySelector('#lobby-fields');
  if (fields) fields.scrollTop = 0;
});
await shot(lobbyDesk, 'avatar-plus-lobby');
// scrolled to items so more categories are visible too
await lobbyDesk.evaluate(() => {
  const fields = document.querySelector('#lobby-fields');
  if (fields) fields.scrollTop = Math.min(fields.scrollHeight, 380);
});
await lobbyDesk.waitForTimeout(400);
await shot(lobbyDesk, 'avatar-plus-lobby-items');

const lobbyMob = await browser.newPage({ viewport: { width: 390, height: 844 } });
lobbyMob.on('pageerror', (e) => errs.push('lobby-m: ' + e.message));
await lobbyMob.addInitScript((profile) => {
  localStorage.setItem('jeongja3d.profile', JSON.stringify(profile));
}, lobbyLook);
await lobbyMob.goto(`${B}?${Q}&enter=1&hour=14&mobile=1`, { timeout: 180000, waitUntil: 'domcontentloaded' });
await lobbyMob.waitForSelector('#lobby-card', { timeout: 240000 });
await lobbyMob.waitForTimeout(2500);
await lobbyMob.evaluate(() => {
  const card = document.querySelector('#lobby-card');
  card?.scrollIntoView({ block: 'start' });
});
await shot(lobbyMob, 'avatar-plus-lobby-mobile');

await browser.close();
if (errs.length) {
  console.log('page errors:');
  for (const e of errs.slice(0, 12)) console.log(' -', e);
}
console.log('wrote shots to', OUT);
