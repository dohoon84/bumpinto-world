import { chromium } from 'playwright';
export async function open(q = '', { port = 5198, w = 1280, h = 800, mobile = false } = {}) {
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--enable-precise-memory-info','--js-flags=--expose-gc'] });
  const p = await b.newPage(mobile ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: w, height: h } });
  const errs = [];
  p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
  p.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } if (/\[depot/.test(m.text())) console.log('LOG', m.text().slice(0,300)); });
  await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${port}/?enter=1&name=Tester&ws=mock&weather=clear${/[&?]hour=/.test(q) ? "" : "&hour=14"}&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1${q}`, { timeout: 180000 });
  await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
  const bootMs = Date.now() - t0;
  return { b, p, errs, bootMs };
}
export const cam = (p, o) => p.evaluate((o) => { const J = window.__jj; if (o.tp) J.teleport(o.tp[0], o.tp[1]); Object.assign(J.cam, o.cam || {}); }, o);
