// [seongsu-mobile] 폰 가로(844x390) 메모리 측정: JS heap(CDP) + GL 텍스처/버퍼 바이트(원장) + draws/tris
//   node scripts/probe-mobile-mem.mjs <port> <at> [extra query]   → JSON 한 줄
import { chromium } from 'playwright';
const [PORT = '5391', AT = 'seongsu', EXTRA = ''] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: +(process.env.DPR || 3), isMobile: true, hasTouch: true, userAgent: UA });
await ctx.addInitScript(() => {
  const L = { tex: new Map(), buf: new Map(), peakTex: 0, peakBuf: 0, lost: 0 };
  window.__glL = L;
  const bpp = (t) => (t === 0x1406 ? 4 : t === 0x140B || t === 0x8D61 ? 2 : 1);
  const ch = (f) => ({ 0x1908: 4, 0x1907: 3, 0x1903: 1, 0x1909: 1, 0x190A: 2, 0x8227: 2, 0x8D94: 4 })[f] || 4;
  const sum = (m) => { let b = 0; for (const v of m.values()) b += v; return b; };
  const upd = () => { L.peakTex = Math.max(L.peakTex, sum(L.tex)); L.peakBuf = Math.max(L.peakBuf, sum(L.buf)); };
  L.now = () => ({ tex: sum(L.tex), buf: sum(L.buf), ntex: L.tex.size, nbuf: L.buf.size });
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const st = new WeakMap(); // gl → {tex,buf,texUnit binding}
    const S = (gl) => { let s = st.get(gl); if (!s) st.set(gl, s = { t: new Map(), b: new Map() }); return s; };
    const w = (n, f) => { const o = P[n]; if (!o) return; P[n] = function (...a) { try { f.call(this, ...a); } catch { /* */ } return o.apply(this, a); }; };
    w('bindTexture', function (t, tex) { S(this).t.set(t, tex); });
    w('bindBuffer', function (t, b) { S(this).b.set(t, b); });
    w('deleteTexture', (tex) => { L.tex.delete(tex); });
    w('deleteBuffer', (b) => { L.buf.delete(b); });
    w('texStorage2D', function (t, lv, fmt, w2, h) { const tex = S(this).t.get(t); if (tex) L.tex.set(tex, w2 * h * 4 * (lv > 1 ? 1.34 : 1)); upd(); });
    w('texStorage3D', function (t, lv, fmt, w2, h, d) { const tex = S(this).t.get(t); if (tex) L.tex.set(tex, w2 * h * d * 4); upd(); });
    w('texImage2D', function (t, lv, ifmt, ...r) { if (lv) return; const tex = S(this).t.get(t >= 0x8515 && t <= 0x851A ? 0x8513 : t); if (!tex) return; let w2, h, f, ty; if (r.length >= 6) { [w2, h, , f, ty] = r; } else { const src = r[2]; w2 = src?.width || src?.videoWidth || 0; h = src?.height || src?.videoHeight || 0; f = r[0]; ty = r[1]; } const face = t >= 0x8515 && t <= 0x851A ? 6 : 1; L.tex.set(tex, (w2 * h * ch(f) * bpp(ty)) * face); upd(); });
    w('compressedTexImage2D', function (t, lv, f, w2, h) { if (lv) return; const tex = S(this).t.get(t); if (tex) L.tex.set(tex, w2 * h); upd(); });
    w('bufferData', function (t, d) { const b = S(this).b.get(t); if (!b) return; L.buf.set(b, typeof d === 'number' ? d : d?.byteLength || 0); upd(); });
  }
  const cvs = []; window.__cvs = cvs;
  const oce = Document.prototype.createElement;
  Document.prototype.createElement = function (t, ...r) { const e = oce.call(this, t, ...r); if (String(t).toLowerCase() === 'canvas') cvs.push({ r: new WeakRef(e), st: (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:]*/, '')).join(' < ') }); return e; };
  if (typeof OffscreenCanvas === 'function') { const O = OffscreenCanvas; window.OffscreenCanvas = function (w, h) { const e = new O(w, h); cvs.push({ r: new WeakRef(e), st: 'Offscreen ' + (new Error().stack || '').split('\n')[2]?.trim() }); return e; }; window.OffscreenCanvas.prototype = O.prototype; }
  L.canvas = () => { let n = 0, px = 0; const by = {}; for (const c of cvs) { const e = c.r.deref(); if (!e || !e.width) continue; n++; const a = e.width * e.height * 4; px += a; const k = c.st.split(' < ')[0]; by[k] = (by[k] || 0) + a; } return { n, mb: +(px / 1048576).toFixed(1), top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(v / 1048576).toFixed(1)}MB ${k}`) }; };
  addEventListener('webglcontextlost', () => { L.lost++; }, true);
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
if (process.env.PROF) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 65536 }); }
const errors = [];
const t0 = Date.now();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const built = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errors.push(t.slice(0, 200)); if (/lazy-built|built in/.test(t)) built.push(`${Math.round((Date.now() - t0) / 1000)}s ${t.slice(0, 90)}`); });
let peakHeap = 0, journeyPre = null; const samples = [];
const sample = async (tag) => { try { const { metrics } = await cdp.send('Performance.getMetrics'); const h = metrics.find((m) => m.name === 'JSHeapUsedSize').value; peakHeap = Math.max(peakHeap, h); const g = await page.evaluate(() => window.__glL?.now?.() || null).catch(() => null); samples.push({ t: Date.now() - t0, tag, heap: Math.round(h / 1048576), tex: g ? Math.round(g.tex / 1048576) : null, buf: g ? Math.round(g.buf / 1048576) : null }); } catch { /* */ } };
const iv = setInterval(() => sample('poll'), 700);
const q = `ws=mock&enter=1&at=${AT}&hour=${process.env.HOUR || 15}&weather=clear&noticePopup=0&controlscard=0&bgm=0&subwayVoice=0&subwayRt=0${EXTRA ? '&' + EXTRA : ''}`;
await page.goto(`http://localhost:${PORT}/?${q}`, { timeout: 180000 });
await page.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
await page.evaluate(() => document.getElementById('lobby-go')?.click());
// 게임 안으로 들어가고 랜드마크 지연 빌드가 끝날 때까지
const settle = +(process.env.SETTLE || 40000);
if (process.env.CHURN) { setTimeout(async () => { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }, settle - 15000); }
const tEnd = Date.now() + settle;
while (Date.now() < tEnd) { await page.waitForTimeout(2000); }
if (process.env.JOURNEY) { // [journey] 먼저 AT 에서 놀다가 성수로 (지하철·순간이동처럼 preload → teleport)
  const pre = await page.evaluate(() => window.__glL.now());
  journeyPre = { tex: +(pre.tex / 1048576).toFixed(1), buf: +(pre.buf / 1048576).toFixed(1) };
  await page.evaluate(async (g) => { const J = window.__jj, s = g ? { x: g[0], z: g[1] } : { x: -4377.3, z: -18946.7 }; await J.corridor.preload(s.x, s.z); J.teleport(s.x, s.z); }, process.env.GOTO ? process.env.GOTO.split(',').map(Number) : null);
  const t2 = Date.now() + 40000; while (Date.now() < t2) await page.waitForTimeout(2000);
}
clearInterval(iv);
await sample('end');
await cdp.send('HeapProfiler.collectGarbage');
const canvasLive = await page.evaluate(() => window.__glL.canvas());
const liveHeap = Math.round((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize').value / 1048576);
const fin = await page.evaluate(async () => {
  const J = window.__jj, R = J.renderer; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  const L = window.__glL; const n = L.now();
  return { draws: R.info.render.calls, tris: R.info.render.triangles, geos: R.info.memory.geometries, textures: R.info.memory.textures, glTexMB: +(n.tex / 1048576).toFixed(1), glBufMB: +(n.buf / 1048576).toFixed(1), peakTexMB: +(L.peakTex / 1048576).toFixed(1), peakBufMB: +(L.peakBuf / 1048576).toFixed(1), lost: L.lost, pr: R.getPixelRatio(), db: [R.getContext().drawingBufferWidth, R.getContext().drawingBufferHeight], pos: [Math.round(J.player.position.x), Math.round(J.player.position.z)], mobileBody: document.body.className.slice(0, 120), ssReady: !!J.seongsu?.ready, fogFar: Math.round(J.player.parent ? (() => { let sc = J.player; while (sc.parent) sc = sc.parent; return sc.fog?.far || 0; })() : 0), ready: { namsan: !!J.namsan?.ready, hangang: !!J.hangang?.ready, myeongdong: !!J.myeongdong?.ready, seongsu: !!J.seongsu?.ready } };
});
const out = { at: AT, extra: EXTRA, peakHeapMB: Math.round(peakHeap / 1048576), liveHeapMB: liveHeap, canvas: canvasLive, ...fin, journeyPre, errors: errors.slice(0, 8), built, timeline: process.env.TL ? samples : undefined };
if (process.env.PROF || process.env.CHURN) {
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const byFn = new Map(), bySrc = new Map();
  const walk = (n, stack) => {
    const f = n.callFrame; const here = `${f.functionName || '(anon)'} ${(f.url || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${f.lineNumber + 1}`;
    const st = [...stack, { here, url: f.url || '' }];
    if (n.selfSize) {
      byFn.set(here, (byFn.get(here) || 0) + n.selfSize);
      // 가장 안쪽 src/ 프레임 (three 등 라이브러리를 건너뛰고 우리 코드)
      for (let i = st.length - 1; i >= 0; i--) { if (/\/src\//.test(st[i].url)) { bySrc.set(st[i].here, (bySrc.get(st[i].here) || 0) + n.selfSize); break; } }
    }
    for (const c of n.children || []) walk(c, st);
  };
  walk(profile.head, []);
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${(v / 1048576).toFixed(1)}MB ${k}`);
  out.profFn = top(byFn); out.profSrc = top(bySrc);
}
console.log(JSON.stringify(out, null, process.env.PROF ? 1 : 0));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
