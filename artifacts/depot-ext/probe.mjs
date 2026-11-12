import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
await p.goto('http://127.0.0.1:5198/?enter=1&name=T&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1&at=depot', { timeout: 180000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 240000 });
const r = await p.evaluate(() => {
  const J = window.__jj, d = J.data;
  const near = d.roads.filter(r => r.p.some(([x,z]) => x > -700 && x < -350 && z > 350 && z < 800));
  return { station: d.station, keys: Object.keys(d), n: near.length, roads: near.map(r => ({ k: r.k, n: r.name, w: r.w, lanes: r.lanes, keys: Object.keys(r), p: r.p.filter(([x,z]) => x > -760 && x < -300 && z > 250 && z < 900).map(([x,z]) => [Math.round(x), Math.round(z)]) })) };
});
console.log(JSON.stringify(r));
await b.close();
