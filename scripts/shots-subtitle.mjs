// [subway] 안내 자막(화면 위 가운데) · 안내 줄(아래 조작 줄 위) 스크린샷 + 안내 음성 호출 확인 (가짜 음성 목록 주입 — 헤드리스는 소리 없음)
//   BASE=http://127.0.0.1:4410/ OUT=/workspace/bw-subway-shots W=1280 H=800 SUFFIX= node scripts/shots-subtitle.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:4410/';
const OUT = process.env.OUT || '/workspace/bw-subway-shots';
const W = +(process.env.W || 1280), H = +(process.env.H || 800), SUF = process.env.SUFFIX || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
// speechSynthesis 대역: 음성 3개(ko-KR·en-US·ja-JP), speak 를 기록하고 글자 수만큼 뒤에 onend
await page.addInitScript(() => {
  const log = (window.__tts = []);
  const fake = { speaking: false, getVoices: () => [{ lang: 'ko-KR', name: 'fake-ko' }, { lang: 'en-US', name: 'fake-en' }, { lang: 'ja-JP', name: 'fake-ja' }], addEventListener() {},
    speak(u) { log.push({ text: u.text, lang: u.lang, volume: u.volume, t: performance.now() }); fake.speaking = true; setTimeout(() => { fake.speaking = false; u.onend?.(); }, 300 + u.text.length * 25); },
    cancel() { log.push({ cancel: true, t: performance.now() }); fake.speaking = false; } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
});
const JA = process.env.JA !== '0'; // JA=0 → ?subwayJa=0 (일본어 자막·음성 없음)
await page.goto(B + `?enter=1&name=Tester&ws=mock&lang=ko&subwayRt=0&noticePopup=0&bgmDebug=1${JA ? '' : '&subwayJa=0'}`, { timeout: 120000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('lobby-go')?.click());
await page.waitForFunction(() => !document.body.classList.contains('in-lobby') && !document.body.classList.contains('in-gate'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
const until = (fn, arg, t = 120000) => page.waitForFunction(fn, arg, { timeout: t, polling: 100 });
const rects = () => page.evaluate(() => { const o = {}; for (const id of ['subway-sub', 'subway-hint', 'bgm', 'top-right-bar', 'buttons', 'hud', 'emote-bar', 'chat', 'handset']) { const el = document.getElementById(id); if (!el) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || +cs.opacity === 0) continue; const r = el.getBoundingClientRect(); if (r.width && r.height) o[id] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; } return o; });
const overlap = (a, b) => a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function checkLayout(r, k) {
  for (const id of ['bgm', 'top-right-bar', 'buttons', 'hud', 'emote-bar', 'chat', 'handset']) assert.ok(!overlap(r['subway-sub'], r[id]), `${k}: 자막이 #${id} 와 겹침 ${JSON.stringify(r)}`);
  for (const id of ['emote-bar', 'chat', 'handset']) if (r['subway-hint']) assert.ok(!overlap(r['subway-hint'], r[id]), `${k}: 안내가 #${id} 와 겹침 ${JSON.stringify(r)}`);
  if (r['subway-hint'] && r['emote-bar']) assert.ok(r['emote-bar'][1] - r['subway-hint'][3] >= 10, `${k}: 안내와 아래 줄 간격`);
}
const report = { W, H, steps: [] };
await page.evaluate(() => { const e = __jj.subway.entrances.find((q) => q.exit.ref === '4'); const s = Math.sin(e.ry), c = Math.cos(e.ry); __jj.teleport(e.x - s, e.z - c); __jj.player.rotation.y = e.ry; __jj.setMode('follow'); __jj.cam.yaw = e.ry + Math.PI; });
await page.waitForTimeout(1200);
await page.keyboard.down('KeyW');
await until(() => __jj.subway.state.phase === 'inside' && __jj.subway.room === 'concourse' && !__jj.subway.swapping);
await page.keyboard.up('KeyW');
await page.waitForTimeout(800);
await page.evaluate(() => __jj.subway.toPlatform('suin', 1));
await until(() => __jj.subway.room === 'platform' && !__jj.subway.swapping);
await page.waitForTimeout(1000);
// 승강장: 열차 호출 → '들어오고 있습니다' 자막 + 안내 줄
await page.evaluate(() => __jj.subway.inside.callTrain(13));
await page.evaluate(() => __jj.subway.inside.setView(-6, -2.4, -Math.PI / 2 - 0.4, 0.15, 6));
await until(() => +getComputedStyle(document.getElementById('subway-sub')).opacity > 0.9, null, 30000);
await page.waitForTimeout(600);
let r = await rects(); report.steps.push({ k: 'platform', r, sub: await page.evaluate(() => document.getElementById('subway-sub').innerText) }); checkLayout(r, 'platform');
assert.equal(await page.evaluate(() => !!document.querySelector('#subway-sub small[lang=ja]')), JA, '일본어 자막 줄');
await page.screenshot({ path: `${OUT}/subtitle-top-platform${SUF}.png` });
// 음성: 차임 뒤 ko → en → ja (겹치지 않게)
await until((n) => (window.__tts || []).filter((x) => x.text).length >= n, JA ? 3 : 2, 30000).catch(async (e) => { console.log('DEBUG', JSON.stringify(await page.evaluate(() => ({ tts: window.__tts, ev: __jj.subway.voice.events, en: __jj.subway.voice.enabled, bgm: __jj.bgm ? [__jj.bgm.player.muted, __jj.bgm.player.volume] : null, U: typeof SpeechSynthesisUtterance })))); throw e; });
report.duckWhileSpeaking = await page.evaluate(() => ({ active: __jj.subway.voiceActive, duck: __jj.bgm?.debug?.state?.().duck ?? null }));
const tts1 = await page.evaluate(() => window.__tts.slice());
const ev1 = await page.evaluate(() => __jj.subway.voice.events.slice());
// 앞에 다른 안내(취소된 것 포함)가 끼어 있을 수 있다 → '들어오고' 한국어 줄부터 본다
const seq = tts1.filter((x) => x.text), i0 = seq.findIndex((x) => x.lang === 'ko-KR' && /들어오고/.test(x.text));
assert.ok(i0 >= 0, 'approach ko line: ' + JSON.stringify(tts1));
assert.equal(seq[i0 + 1]?.lang, 'en-US', JSON.stringify(tts1));
for (let k = i0 + 1; k < Math.min(seq.length, i0 + 3); k++) assert.ok(seq[k].t - seq[k - 1].t >= 300, '겹치지 않음');
if (JA) { assert.equal(seq[i0 + 2]?.lang, 'ja-JP', JSON.stringify(tts1)); assert.ok(seq[i0 + 2].text.startsWith('まもなく、'), seq[i0 + 2].text); }
else { await page.waitForTimeout(4000); assert.ok(!(await page.evaluate(() => window.__tts.some((x) => x.lang === 'ja-JP'))), '?subwayJa=0 → 일본어 음성 없음'); }
assert.ok(ev1.some((e) => e.t === 'chime'), '차임');
report.tts = tts1; report.voiceEvents = ev1;
// 문 열림 → 타기
await until(() => __jj.subway.inside?.stage == null && document.getElementById('subway-sub').innerText.includes('내리는'), null, 30000).catch(() => {});
await page.waitForTimeout(3500);
await page.evaluate(() => { const i = __jj.subway.inside, d = i.lay.doors.find((q) => q.label === '3-2'); i.player.position.set(d.x, 0, -0.4); i.player.rotation.y = 0; i.cam.yaw = Math.PI; });
await page.keyboard.down('KeyW');
await until(() => __jj.subway.room === 'train' && !__jj.subway.swapping, null, 30000);
await page.keyboard.up('KeyW');
const cancelled = await page.evaluate(() => window.__tts.some((x) => x.cancel) || !__jj.subway.voice.active);
report.cancelOnLeave = cancelled;
// 열차: 출발 → '다음 역은 수내역입니다' 자막 (앉은 자리에서)
await page.evaluate(() => __jj.subway.inside.toggleSit());
await page.evaluate(() => __jj.subway.inside.skip(30));
await until(() => document.getElementById('subway-sub').innerText.includes('다음 역은'), null, 60000);
await page.evaluate(() => { const i = __jj.subway.inside; i.cam.pitch = 0.12; i.cam.dist = 2.2; i.cam.yaw = Math.PI / 2; });
await page.waitForTimeout(900);
assert.equal((await page.evaluate(() => document.getElementById('subway-sub').innerText)).includes('次は、スネ、スネです。'), JA, '열차 일본어 자막');
r = await rects(); report.steps.push({ k: 'train', r, sub: await page.evaluate(() => document.getElementById('subway-sub').innerText), hint: await page.evaluate(() => document.getElementById('subway-hint').innerText) }); checkLayout(r, 'train');
await page.screenshot({ path: `${OUT}/subtitle-top-train${SUF}.png` });
report.tts2 = await page.evaluate(() => window.__tts.slice(-4));
report.duck = await page.evaluate(() => __jj.bgm?.debug?.state?.().duck ?? null); report.voiceActive = await page.evaluate(() => __jj.subway.voiceActive);
report.errors = errs;
fs.writeFileSync(`${OUT}/subtitle-report${SUF}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ steps: report.steps, cancelOnLeave: report.cancelOnLeave, tts: report.tts.map((t) => t.lang || 'cancel'), duck: report.duck, duckWhileSpeaking: report.duckWhileSpeaking, errs }, null, 0));
await browser.close();
