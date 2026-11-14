// [myeongdong-cathedral] 성당 실내 드나들기 3번 — 힙·지오메트리·텍스처가 늘지 않는지 + 실내 draw/tris
//   [cathedral-sit] 장의자 앉기(C)·움직이면 일어서기·C 로 일어서기, 기도하는 사람 수
//   [cathedral-bgm] 들어가면 성당 배경음으로 크로스페이드, 나오면 원래 BGM — 오디오 노드·타이머가 늘지 않는지, 반복 이음매 넘기기
//   node scripts/corridor/test/test-cathedral-cycles.mjs <vite port>
import { chromium } from 'playwright';
const PORT = process.argv[2] || process.env.MYEONGDONG_WALK_PORT || '5231';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0&mobile=1`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
await page.waitForTimeout(5000);
// 소리: 사용자 입력 한 번(키) → BGM 시작 (shot 모드는 입장 절차를 건너뛰므로 enter 를 직접)
await page.keyboard.press('Shift');
await page.evaluate(() => { const b = window.__jj.bgm; b?.player?.enter?.(); });
await page.waitForFunction(() => window.__jj.bgm?.debug?.state?.().playing, null, { timeout: 30000 }).catch(() => {});
const NC = +(process.env.CYCLES || 3);
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const goIn = () => ev(async () => {
  const J = window.__jj, md = J.myeongdong, F = md.cathedral.frame, R = J.renderer;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const [x, z] = md.cathedralAt((F.uT + F.uBF) / 2, 0); J.setMode('follow'); J.teleport(x, z, md.surfaceY(x, z));
  const f0 = R.info.render.frame; await sleep(3600); const t = performance.now(); while (R.info.render.frame < f0 + 3 && performance.now() - t < 20000) await sleep(100);
});
const goOut = () => ev(async () => {
  const J = window.__jj, md = J.myeongdong, F = md.cathedral.frame;
  const [x, z] = md.cathedralAt(F.uF + 40, 0); J.setMode('follow'); J.teleport(x, z, md.surfaceY(x, z));
  await new Promise((r) => setTimeout(r, 3600));
});
const snap = () => ev(async () => {
  const J = window.__jj, R = J.renderer; window.gc?.(); await new Promise((r) => setTimeout(r, 300)); window.gc?.();
  const st = J.bgm?.debug?.state?.() || null;
  return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: R.info.memory.geometries, tex: R.info.memory.textures, draws: R.info.render.calls, tris: R.info.render.triangles,
    inside: J.myeongdong.inCathedral(J.player.position.x, J.player.position.z), interiorVisible: !!J.myeongdong.cathedralInterior?.group?.visible,
    audio: st && { playing: st.playing, mus: st.mus, amb: st.amb } };
});
/** 장의자 옆 통로에 서서 C → 앉음, 움직이면 일어섬, 다시 C → 앉음, C → 일어섬 */
async function sitTest(i) {
  const r = await ev(async (i) => {
    const J = window.__jj, md = J.myeongdong, F = md.cathedral.frame;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const u = F.uT + F.BAY * (1.2 + i * 0.9), [x, z] = md.cathedralAt(u, 0.55); J.teleport(x, z, md.surfaceY(x, z)); await sleep(800);
    J.toggleSit(); await sleep(400);
    const p = J.player.position, [pu, pv] = md.cathedralUV(p.x, p.z);
    return { pose: J.pose, pew: J.pew, seat: [+pu.toFixed(2), +pv.toFixed(2)], y: +(p.y - md.cathedral.floor).toFixed(2), ry: +J.player.rotation.y.toFixed(3), inside: md.inCathedral(p.x, p.z) };
  }, i);
  check(r.pose.sit === 'bench' && r.pose.pew && r.pew.seated, `cycle ${i}: C 로 장의자에 앉지 못함 ${JSON.stringify(r)}`);
  check(Math.abs(r.seat[1]) > 1.1, `cycle ${i}: 통로(가운데)에 앉음 ${JSON.stringify(r.seat)}`);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
  const r2 = await ev(() => ({ pose: window.__jj.pose, pew: window.__jj.pew }));
  check(!r2.pose.sit && !r2.pose.pew, `cycle ${i}: 움직였는데 일어서지 않음 ${JSON.stringify(r2)}`);
  await page.keyboard.press('KeyC'); await page.waitForTimeout(400);
  const r3 = await ev(() => window.__jj.pose);
  check(r3.sit === 'bench' && r3.pew, `cycle ${i}: C 키로 다시 앉지 못함 ${JSON.stringify(r3)}`);
  await page.keyboard.press('KeyC'); await page.waitForTimeout(400);
  const r4 = await ev(() => window.__jj.pose);
  check(!r4.sit && !r4.pew, `cycle ${i}: C 키로 일어서지 못함 ${JSON.stringify(r4)}`);
  return { sat: r, standAfterMove: !r2.pose.sit, cAgain: r3.sit, cStand: !r4.sit };
}
const out = [];
await goOut(); out.push({ at: 'outside-0', ...(await snap()) });
let seam = null;
for (let i = 1; i <= NC; i++) {
  await goIn();
  const ins = { at: 'inside-' + i, ...(await snap()) };
  ins.sit = await sitTest(i);
  if (i === 1) { // 반복 이음매: 끝 1.2초 전으로 → 다른 요소가 0초부터 이어받는가
    seam = await ev(async () => { const d = window.__jj.bgm?.debug; if (!d?.seekAmbLoop?.(1.2)) return null; const a = d.state().amb; await new Promise((r) => setTimeout(r, 4200)); const b = d.state().amb; return { before: a.els, after: b.els, timers: b.timers }; });
  }
  ins.worshippers = await ev(() => window.__jj.myeongdong.cathedralInterior?.worshippers);
  out.push(ins);
  await goOut();
  out.push({ at: 'outside-' + i, ...(await snap()) });
}
const interior = await ev(() => window.__jj.myeongdong.cathedralInterior?.stats);
console.log(JSON.stringify({ cycles: out, seam, interior }, null, 1));
const o = out.filter((c) => c.at.startsWith('outside')), ins = out.filter((c) => c.at.startsWith('inside'));
const dHeap = o[o.length - 1].heapMB - o[1].heapMB, dGeo = o[o.length - 1].geos - o[1].geos, dTex = o[o.length - 1].tex - o[1].tex;
console.log(`cycle growth after 1st build: heap ${dHeap.toFixed(1)} MB · geometries ${dGeo} · textures ${dTex}`);
// 소리: 안 = 성당(월드 곡 0), 밖 = 월드 곡(성당 꺼짐·멈춤·src 비움), 노드 수 고정, 타이머 0
const A = (c) => c.audio;
if (A(ins[0])) {
  for (const c of ins) check(c.audio.amb.id === 'cathedral' && c.audio.amb.gain > 0.95 && c.audio.mus < 0.05 && c.audio.amb.els.some((e) => !e.paused), `${c.at}: 성당 소리로 안 바뀜 ${JSON.stringify(c.audio)}`);
  for (const c of o.slice(1)) check(!c.audio.amb.id && c.audio.mus > 0.95 && c.audio.amb.timers === 0 && c.audio.amb.els.every((e) => e.paused && !e.src), `${c.at}: 밖에서 성당 소리가 남음 ${JSON.stringify(c.audio)}`);
  const nodes = new Set(o.slice(1).map((c) => c.audio.amb.nodes)); check(nodes.size === 1 && [...nodes][0] === 5, `오디오 노드가 늘어남 ${[...nodes]}`);
  check(seam && seam.after.some((e) => !e.paused && e.src && e.t > 0.5 && e.t < 4.5 && e.g > 0.9) && seam.after.some((e) => e.paused), `반복 이음매에서 이어받지 못함 ${JSON.stringify(seam)}`);
} else fails.push('BGM 이 시작되지 않음 (오디오 확인 못 함)');
for (const c of ins) { check(c.inside && c.interiorVisible, `${c.at}: 실내 아님`); check(c.draws < 200, `${c.at}: draws ${c.draws} ≥ 200`); check(c.worshippers?.n >= 12, `${c.at}: 기도하는 사람 ${c.worshippers?.n}`); }
console.log('errors', errors.slice(0, 10));
console.log('fails', fails);
await browser.close();
// 텍스처는 미니맵 타일·폰 화면 등 시간에 따라 늦게 올라오는 게 1~2장 있다(CYCLES=6 에서 3회차 이후 평탄) → 2장까지 허용
if (errors.length || fails.length || dGeo > 0 || dTex > 2 || dHeap > 8) process.exit(1);
