/* global CanvasRenderingContext2D */
// [text-orientation] 글씨 면 거울상 검사.
//   1) 단위: textQuad 가 어떤 순서로 점을 받아도 u 가 보는 사람 오른쪽 / 앞면 감기 / mirroredTextTris 가 거울을 잡는지
//   2) 장면(headless, PORT 를 주면): 명동을 띄워 글씨 텍스처를 쓰는 모든 메시에 auditTextMeshes → 위반 0 이어야 통과
//   node scripts/corridor/test/test-text-mirror.mjs [port]
import { GeoBuf } from '../../../src/corridor/landmarks/myeongdongGeo.js';
import { textQuad, mirroredTextTris } from '../../../src/corridor/landmarks/textQuad.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail++; };
const R = [[0, 0, 1, 1]];
// 앞 법선 4방향 + 위(바닥 표지) · 점 순서 정/역
const cases = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0.6, 0, 0.8]];
for (const n of cases) for (const rev of [false, true]) {
  const rx = n[2], rz = -n[0]; // 오른쪽
  let a = [-rx, 0, -rz], b = [rx, 0, rz]; if (rev) [a, b] = [b, a];
  const buf = new GeoBuf({ uv: true });
  textQuad(buf, a, b, [b[0], 1, b[2]], [a[0], 1, a[2]], [0, 0, 1, 1], n);
  const geo = buf.build(); const r = mirroredTextTris(geo, R);
  const P = geo.attributes.position, U = geo.attributes.uv;
  // u=0 인 점이 보는 사람 왼쪽인지
  let left = null; for (let i = 0; i < 4; i++) if (U.getX(i) === 0 && U.getY(i) === 0) left = [P.getX(i), P.getZ(i)];
  const wn = (() => { const i = geo.index.array; const p = (k) => [P.getX(i[k]), P.getY(i[k]), P.getZ(i[k])]; const A = p(0), B = p(1), C = p(2); const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]; return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; })();
  ok(r.mirrored === 0 && r.checked === 2 && left[0] * rx + left[1] * rz < 0 && wn[0] * n[0] + wn[2] * n[2] > 0, `textQuad n=${n} rev=${rev}: 거울 아님 · u0 왼쪽 · 앞면 감기`);
}
{ // 옛 facedQuad 방식(감기만 뒤집고 UV 는 따라감)은 거울로 잡혀야 한다
  const buf = new GeoBuf({ uv: true }); const n = [0, 0, 1];
  const a = [1, 0, 0], b = [-1, 0, 0], c = [-1, 1, 0], d = [1, 1, 0]; // a→b 가 왼쪽 방향
  buf.quad(b, a, d, c, [1, 0, 0, 1], null, n); // facedQuad 의 뒤집기
  ok(mirroredTextTris(buf.build(), R).mirrored === 2, '옛 facedQuad 뒤집기 = 거울로 검출');
}
{ // 명동 아틀라스: 모든 칸이 캔버스 안 (넘치면 UV 가 밖을 가리켜 번호판·메뉴가 빈 칸이 된다)
  const { createMyeongdongAtlas } = await import('../../../src/corridor/landmarks/myeongdongAtlas.js');
  const a = createMyeongdongAtlas(); const bad = a.items.filter((it) => { const r = a.uv(it.name); return r.some((v) => v < 0 || v > 1); });
  ok(a.usedH <= a.H && bad.length === 0, `명동 아틀라스 ${a.items.length}칸 · 높이 ${a.usedH}/${a.H} · 밖 UV ${bad.length}`);
}
const PORT = process.argv[2];
if (PORT) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  // 글씨가 그려진 캔버스 표시 (fillText/strokeText) → 아틀라스 표시가 없는 다른 지역 텍스처도 검사
  await page.addInitScript(() => { const C = CanvasRenderingContext2D.prototype; for (const k of ['fillText', 'strokeText']) { const f = C[k]; C[k] = function (...a) { if (String(a[0] ?? '').trim()) this.canvas.__hasText = true; return f.apply(this, a); }; } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=${process.env.AT || 'myeongdong'}&hour=21&weather=clear&shot=1&noticePopup=0&controlscard=0`);
  await page.waitForFunction((at) => window.__jj?.ready && (at !== 'myeongdong' || window.__jj?.myeongdong?.ready), process.env.AT || 'myeongdong', { timeout: 300000 });
  await page.waitForTimeout(8000);
  const res = await page.evaluate(async () => {
    const { auditTextMeshes } = await import('/src/corridor/landmarks/textQuad.js');
    let sc = window.__jj.player; while (sc.parent) sc = sc.parent;
    return auditTextMeshes(sc);
  });
  console.log(JSON.stringify(res, null, 1));
  ok(res.meshes > 0 && res.tris > 0, `장면 글씨 메시 ${res.meshes}개 · 삼각형 ${res.tris}개 검사`);
  ok(res.violations.length === 0, `장면 위반 ${res.violations.length}건`);
  ok(errors.length === 0, `콘솔 오류 ${errors.length}건 ${errors.slice(0, 3).join(' | ')}`);
  await browser.close();
}
console.log(fail ? `test-text-mirror: ${fail} FAIL` : 'test-text-mirror: ok');
process.exit(fail ? 1 : 0);
