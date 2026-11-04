// [migeum-water] 미금 탄천 돌마교 브라우저 e2e + draw 비교 (헤드리스 Chromium 1개, 순서대로)
//   SHOT_DIR=/path E2E_URL=http://127.0.0.1:PORT/ node scripts/corridor/e2e-migeum-water.mjs
//   runs: on / off(?migeumwater=0) / nomg(?migeum=0) — 같은 뷰(돌마교 · 미금 하도 수면)의 draws·삼각형·스크린샷
//   on : 동쪽 둑(정자동) → 돌마교 → 서쪽 교대 → 돌마로 접속부까지 걷기, 같은 길 자전거(정자 카카오바이크 1대를 출발점으로 옮겨 탐)
//        매 샘플(100ms): 플레이어 Y · 한 샘플 하강(prev.y − y) · 상판 위 샘플 수 · 진행 거리. 페이지 오류 수.
//   off: 같은 걷기 — 띠 길·둑 조정이 없으면 동쪽 둑 끝에서 막히는지(=#17 상태)
//   E2E_NIGHT=1: hour=21 로 on 뷰만 찍음(night-*.png)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SHOT_DIR = process.env.SHOT_DIR; const BASE = process.env.E2E_URL;
if (!SHOT_DIR || !BASE) { console.error('SHOT_DIR, E2E_URL 필요'); process.exit(2); }
fs.mkdirSync(SHOT_DIR, { recursive: true });
const NIGHT = process.env.E2E_NIGHT === '1';
const ROUTE = [[868, 1334], [786.8, 1454], [773.3, 1473.2]]; // 동쪽 둑 위 돌마로(타일) → 돌마교(OSM 186410768) 서쪽 교대 → 돌마로 접속부(OSM 522780985) 끝
const VIEWS = [
  { name: 'dolma', x: 815, z: 1411, y: 0, dist: 95, pitch: 0.5, yaw: 0.55 },
  { name: 'channel', x: 640, z: 1312, y: null, dist: 75, pitch: 0.6, yaw: 2.3 },
];
const RUNS = (NIGHT ? [['on', '']] : [['on', ''], ['off', 'migeumwater=0'], ['nomg', 'migeum=0']]).filter(([t]) => !process.env.E2E_RUNS || process.env.E2E_RUNS.split(',').includes(t));
const Q = '?enter=1&name=e2e&ws=mock&bus=sim&rideSfx=0&rideVoice=0&noticePopup=0&npcs=0&taxis=0&police=0&trucks=0&roadbike=0&superbike=0' + (NIGHT ? '&hour=21' : '&evening=0');
const out = { runs: {}, errors: [] };

async function travel(page, mode, maxMs) {
  return page.evaluate(async ({ ROUTE, mode, maxMs }) => {
    const J = window.__jj, T = J.terrain, p = J.player.position;
    const [sx, sz] = ROUTE[0], [ex, ez] = ROUTE[1];
    await J.corridor.preload(sx, sz); await J.corridor.preload(ex, ez);
    J.teleport(sx, sz, 0); J.setMode('follow');
    await new Promise((r) => setTimeout(r, 1500));
    let bike = null;
    if (mode === 'bike') {
      const b = J.bikes.list.find((q) => !q.inst && q.mesh) || J.bikes.list[0]; if (!b) return { err: 'no bike' };
      const ux = ex - sx, uz = ez - sz, L = Math.hypot(ux, uz);
      b.x = p.x + (ux / L) * 0.6; b.z = p.z + (uz / L) * 0.6; b.y = T.getGroundHeight(b.x, b.z, p.y + 0.5); b.ry = Math.atan2(ux, uz); J.bikes.place(b);
      J.toggleRide(); bike = J.bikes.riding; if (!bike) return { err: 'mount failed' };
    }
    return { start: { x: +p.x.toFixed(1), y: +p.y.toFixed(2), z: +p.z.toFixed(1) }, bike: !!bike };
  }, { ROUTE, mode, maxMs });
}
async function drive(page, maxMs) {
  // 조향: 다음 경유점 방향으로 cam.yaw 맞추고 W 유지 (이동은 카메라 기준). 100ms 샘플
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let wp = 1;
  const S = { n: 0, maxDrop: 0, minY: Infinity, maxY: -Infinity, deck: 0, overChannel: 0, stuck: 0, path: [] };
  let prev = null, last = null;
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate(({ ROUTE, wp }) => {
      const J = window.__jj, T = J.terrain, rb = J.bikes.riding, o = rb ? { x: rb.x, z: rb.z, y: rb.y ?? J.player.position.y } : J.player.position;
      let w = wp; while (w < ROUTE.length && Math.hypot(ROUTE[w][0] - o.x, ROUTE[w][1] - o.z) < 3) w++;
      if (w < ROUTE.length) { const dx = ROUTE[w][0] - o.x, dz = ROUTE[w][1] - o.z; J.cam.yaw = Math.atan2(-dx, -dz); }
      const d = T.deckAt(o.x, o.z);
      return { x: o.x, y: o.y, z: o.z, wp: w, deck: !!(d && d.h > -0.05 && Math.abs(o.y - d.h) < 0.1), base: T.baseHeight(o.x, o.z), riding: !!rb };
    }, { ROUTE, wp });
    wp = s.wp; S.n++;
    if (prev) { S.maxDrop = Math.max(S.maxDrop, prev.y - s.y); if (Math.hypot(s.x - prev.x, s.z - prev.z) < 0.02) S.stuck++; else S.stuck = 0; }
    S.minY = Math.min(S.minY, s.y); S.maxY = Math.max(S.maxY, s.y); if (s.deck) S.deck++; if (s.base < -0.3) S.overChannel++;
    if (S.n % 10 === 0) S.path.push([+s.x.toFixed(1), +s.z.toFixed(1), +s.y.toFixed(2)]);
    prev = s; last = s;
    if (wp >= ROUTE.length || S.stuck > 30) break;
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  const [ex, ez] = ROUTE[ROUTE.length - 1];
  return { ...S, maxDrop: +S.maxDrop.toFixed(3), minY: +S.minY.toFixed(3), maxY: +S.maxY.toFixed(3), reached: wp >= ROUTE.length, lastWp: wp, end: [+last.x.toFixed(1), +last.z.toFixed(1), +last.y.toFixed(2)], distToEnd: +Math.hypot(last.x - ex, last.z - ez).toFixed(1), riding: last.riding, secs: +((Date.now() - t0) / 1000).toFixed(1) };
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, extra] of RUNS) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; page.on('pageerror', (e) => { errs.push(e.message); out.errors.push(tag + ': ' + e.message); });
  await page.addInitScript(() => {
    const st = { draws: 0, frames: 0 }; window.__probe = st;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) if (C) for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = C.prototype[fn]; C.prototype[fn] = function (...a) { st.draws++; return o.apply(this, a); }; }
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { st.frames++; cb(t); });
  });
  await page.goto(BASE + Q + (extra ? '&' + extra : ''));
  await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.getElementById('lobby-go').click());
  await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
  await page.waitForFunction(() => window.__jj.corridor?.life || !window.__jj.corridor, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const T = window.__jj.terrain;
    return { dolmaDeck: T.decks.filter((d) => d.road?.osm === 186410768).length, westAbutBase: T.baseHeight(786.8, 1454), geumgokBase: T.baseHeight(782.8, 1459.4) };
  });
  const views = {};
  for (const v of VIEWS) {
    await page.evaluate(async (v) => {
      const J = window.__jj; J.setMode('follow'); await J.corridor?.preload(v.x, v.z);
      J.teleport(v.x, v.z, v.y ?? undefined); Object.assign(J.cam, { dist: v.dist, pitch: v.pitch, yaw: v.yaw });
    }, v);
    await page.waitForTimeout(5000);
    const m = await page.evaluate(async () => {
      const st = window.__probe; st.draws = 0; st.frames = 0; const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 3000));
      const dt = (performance.now() - t0) / 1000, ri = window.__jj.renderer.info, p = window.__jj.player.position;
      return { fps: +(st.frames / dt).toFixed(1), drawsPerFrame: Math.round(st.draws / Math.max(1, st.frames)), calls: ri.render.calls, triangles: ri.render.triangles, geometries: ri.memory.geometries, py: +p.y.toFixed(2) };
    });
    const file = path.join(SHOT_DIR, `${NIGHT ? 'night-' : ''}${tag}-${v.name}.png`); await page.screenshot({ path: file });
    views[v.name] = { ...m, file }; console.log(tag, v.name, JSON.stringify(m));
  }
  const res = { info, views };
  if (!NIGHT && tag !== 'nomg') {
    res.walk0 = await travel(page, 'walk');
    res.walk = await drive(page, tag === 'on' ? 90000 : 40000);
    await page.screenshot({ path: path.join(SHOT_DIR, `${tag}-walk-end.png`) });
    console.log(tag, 'walk', JSON.stringify({ ...res.walk, path: undefined }));
    if (tag === 'on') {
      res.bike0 = await travel(page, 'bike');
      if (!res.bike0.err) {
        await page.waitForTimeout(300);
        res.bike = await drive(page, 60000);
        await page.screenshot({ path: path.join(SHOT_DIR, 'on-bike-end.png') });
        await page.evaluate(() => { if (window.__jj.bikes.riding) window.__jj.toggleRide(); });
      }
      console.log(tag, 'bike', JSON.stringify(res.bike0), JSON.stringify({ ...res.bike, path: undefined }));
    }
  }
  res.pageErrors = errs.length;
  out.runs[tag] = res;
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(SHOT_DIR, process.env.E2E_OUT || (NIGHT ? 'e2e-night.json' : 'e2e.json')), JSON.stringify(out, null, 1));
console.log('errors', out.errors.length, out.errors.slice(0, 5));
