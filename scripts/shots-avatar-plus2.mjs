// 로비 꾸미기 탭·미리보기 프레이밍 스크린샷
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:5296/';
const OUT = process.env.OUT || path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });

const LOOK = {
  gender: 'f', face: 'round', hair: 'long', hairColor: '#2a211c',
  eyes: 'wink', brows: 'straight', mouth: 'cat', blush: '1',
  top: 'short', color: '#e64980', pants: '#2d3436', shoes: '#f4efe4',
  hat: 'catear', hatColor: '#2a211c', glasses: 'round',
  earrings: 'hoop', bag: 'tote', bagColor: '#ff6b6b', neck: 'necklace',
};
const Q = 'ws=mock&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0&npcs=0&taxis=0&police=0&trucks=0&clife=0&bike=0&pangyonpc=0&gangnamnpc=0';
const profile = { name: '범프', look: LOOK };

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

async function openLobby(viewport, extra = '') {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript((p) => {
    localStorage.setItem('jeongja3d.profile', JSON.stringify(p));
  }, profile);
  await page.goto(`${B}?${Q}&enter=1&hour=14${extra}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lobby-look-tabs', { timeout: 240000 });
  await page.waitForTimeout(1800);
  return page;
}

async function clickTab(page, id) {
  await page.click(`#lobby-look-tabs .look-tab[data-look-tab="${id}"]`);
  await page.waitForTimeout(id === 'face' ? 1600 : 900);
}

const desk = await openLobby({ width: 1280, height: 860 });
await clickTab(desk, 'basic');
await desk.screenshot({ path: `${OUT}/avatar-plus2-lobby-basic.png` });
await clickTab(desk, 'face');
await desk.screenshot({ path: `${OUT}/avatar-plus2-lobby-face.png` });
await clickTab(desk, 'item');
await desk.screenshot({ path: `${OUT}/avatar-plus2-lobby-item.png` });
await clickTab(desk, 'color');
await desk.screenshot({ path: `${OUT}/avatar-plus2-lobby-color.png` });

const mob = await openLobby({ width: 844, height: 390 }, '&mobile=1');
await clickTab(mob, 'item');
await mob.screenshot({ path: `${OUT}/avatar-plus2-lobby-mobile.png` });

await browser.close();
console.log('plus2 shots done');
