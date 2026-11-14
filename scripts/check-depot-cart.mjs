// [depot] 카트 겹침·집기 브라우저 검증 — node scripts/check-depot-cart.mjs [baseUrl] [desktop|mobile] [outDir]
//   섞어 담기(범쌀 20kg·보들범 30롤·작은 상품 + 아래 받침대) → 주행 → 보이는 크기 상자끼리 겹침 없음(SAT)
//   카트 속 상품마다 그 윗면을 실제 마우스 클릭 / 터치 탭 → 바로 그 상품이 집힘 · 취소해도 안 겹침
//   스샷: 짐 가득 + 집기 테두리 (1280×800 · 844×390 가로)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:5341/';
const MODE = process.argv[3] || 'desktop', MOB = MODE === 'mobile';
const OUT = process.argv[4] || new URL('../artifacts/depot-cart/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const Q = `enter=1&name=Tester&ws=mock&weather=clear&hour=14&noticePopup=0&bgm=0&subwayVoice=0&controlscard=0&shot=1&depotStory=0&at=depot${MOB ? '&mobile=1' : ''}`;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await b.newContext(MOB ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
p.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('CONSOLEERR', m.text().slice(0, 300)); } });
await p.route(/\.(woff2?|ttf|otf|eot)(\?|$)/i, (r) => r.abort());
const ev = (f, a) => p.evaluate(f, a);
const fail = []; const check = (ok, msg) => { if (!ok) { fail.push(msg); console.log('FAIL', msg); } };

await p.goto(`${BASE}?${Q}`, { timeout: 240000 });
await p.waitForFunction(() => window.__jj?.ready, null, { timeout: 300000 });
await ev(() => window.__jj.teleport(-492, 493.5));
await p.waitForTimeout(1500);
await ev(() => window.__jj.depot.enter());
await p.waitForFunction(() => window.__jj.depot.active && !window.__jj.depot.busy, null, { timeout: 120000 });
await p.waitForTimeout(1500);

// 진열 상품끼리 겹침 (다른 상품이 같은 자리에 박혀 있으면 집기를 빼앗음) — 인스턴스 OBB SAT, 1 cm 넘는 쌍 0
const shelf = await p.evaluate(async () => {
  const T = await import('/node_modules/.vite/deps/three.js');
  const I = window.__jj.depot.interior; const meshes = []; I.scene.traverse((o) => { if (o.isInstancedMesh && (o.userData.pids || o.userData.pid) && o.userData.list) meshes.push(o); });
  const boxes = []; const m = new T.Matrix4(), bb = new T.Box3();
  for (const im of meshes) { im.updateMatrixWorld(true); const g = im.geometry; if (!g.boundingBox) g.computeBoundingBox(); for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); m.premultiply(im.matrixWorld); bb.copy(g.boundingBox).applyMatrix4(m); const L = im.userData.list[i]; const e = m.elements, gb = g.boundingBox; const ax = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]]; const sc = ax.map((a) => Math.hypot(...a)); const c = new T.Vector3().addVectors(gb.min, gb.max).multiplyScalar(0.5).applyMatrix4(m); boxes.push({ id: im.userData.pids?.[i] ?? im.userData.pid, pick: L?.pickable !== false, a: bb.clone(), o: { C: [c.x, c.y, c.z], ax: ax.map((a, k) => a.map((v) => v / (sc[k] || 1))), h: [(gb.max.x - gb.min.x) / 2 * sc[0], (gb.max.y - gb.min.y) / 2 * sc[1], (gb.max.z - gb.min.z) / 2 * sc[2]] }, zero: sc[0] < 1e-6 }); } }
  const grid = new Map(), C = 1; const key = (x, z) => `${x},${z}`;
  boxes.forEach((o, k) => { for (let x = Math.floor(o.a.min.x / C); x <= Math.floor(o.a.max.x / C); x++) for (let z = Math.floor(o.a.min.z / C); z <= Math.floor(o.a.max.z / C); z++) { const kk = key(x, z); (grid.get(kk) || grid.set(kk, []).get(kk)).push(k); } });
  const seen = new Set(), bad = [], kinds = {}; let pairs = 0;
  for (const list of grid.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = boxes[list[i]], B = boxes[list[j]]; const pk = list[i] < list[j] ? `${list[i]}-${list[j]}` : `${list[j]}-${list[i]}`; if (seen.has(pk)) continue; seen.add(pk);
    if (!A.pick && !B.pick) continue; if (A.zero || B.zero) continue;
    let d = Math.min(A.a.max.x - B.a.min.x, B.a.max.x - A.a.min.x, A.a.max.y - B.a.min.y, B.a.max.y - A.a.min.y, A.a.max.z - B.a.min.z, B.a.max.z - A.a.min.z);
    if (d > 0.01) { const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2], cr = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]]; const P = A.o, Q = B.o; const axes = [...P.ax, ...Q.ax]; for (const a of P.ax) for (const c of Q.ax) axes.push(cr(a, c)); const D = [Q.C[0] - P.C[0], Q.C[1] - P.C[1], Q.C[2] - P.C[2]]; for (const L of axes) { const l = Math.hypot(...L); if (l < 1e-6) continue; const n = L.map((v) => v / l); const ra = P.h.reduce((s2, h, i2) => s2 + h * Math.abs(dot(P.ax[i2], n)), 0), rb = Q.h.reduce((s2, h, i2) => s2 + h * Math.abs(dot(Q.ax[i2], n)), 0); d = Math.min(d, ra + rb - Math.abs(dot(D, n))); } }
    if (d > 0.01) { pairs++; kinds[`${A.id}×${B.id}`] = (kinds[`${A.id}×${B.id}`] || 0) + 1; if (bad.length < 12) bad.push(`${A.id}${A.pick ? '*' : ''}×${B.id}${B.pick ? '*' : ''} ${(d * 100).toFixed(1)}cm @${A.a.min.x.toFixed(1)},${A.a.min.y.toFixed(2)},${A.a.min.z.toFixed(1)}`); }
  }
  return { meshes: meshes.length, instances: boxes.length, pickable: boxes.filter((o) => o.pick).length, overlapPairs: pairs, kinds, sample: bad };
});
console.log('shelf', JSON.stringify(shelf));
check(shelf.overlapPairs === 0, `shelf overlaps: ${JSON.stringify(shelf.kinds)}`);
if (!MOB) { await ev(() => window.__jj.depot.interior._dbg.camWorld([6.3, 1.75, 15.2], [6.3, 0.95, 19.5])); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/shelf-bakery-lanes-1280x800.png` }); await ev(() => window.__jj.depot.interior._dbg.camWorld(null)); }

// 보이는 크기 상자(OBB) 쌍 겹침 깊이 — SAT 15축
await ev(() => {
  window.__cartOverlaps = (tol = 0.015) => {
    const I = window.__jj.depot.interior, out = [];
    const obb = (it) => { const m = it.mesh; m.updateMatrixWorld(true); const e = m.matrixWorld.elements; const ax = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]].map((a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }); const S = it.p.shape, k = S === 'pillow' ? [0.94, 0.92, 0.94] : S === 'cyl' ? [0.85, 1, 0.85] : [1, 1, 1]; return { C: [e[12], e[13], e[14]], ax, h: it.size.map((v, i) => v / 2 * k[i]), sphere: S === 'sphere' }; }; // 포대 가장자리는 얇고(충돌체와 같은 비율) 낱병은 원기둥
    const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2], cr = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
    const pen = (A, B) => { const axes = [...A.ax, ...B.ax]; for (const a of A.ax) for (const c of B.ax) axes.push(cr(a, c)); let min = 1e9; const D = [B.C[0] - A.C[0], B.C[1] - A.C[1], B.C[2] - A.C[2]]; for (const L of axes) { const l = Math.hypot(...L); if (l < 1e-6) continue; const n = L.map((v) => v / l); const ra = A.h.reduce((s, h, i) => s + h * Math.abs(dot(A.ax[i], n)), 0), rb = B.h.reduce((s, h, i) => s + h * Math.abs(dot(B.ax[i], n)), 0); min = Math.min(min, ra + rb - Math.abs(dot(D, n))); } return min; };
    const O = I.items.map(obb);
    for (let i = 0; i < O.length; i++) for (let j = i + 1; j < O.length; j++) { if (O[i].sphere || O[j].sphere) continue; const v = pen(O[i], O[j]); if (v > tol) out.push(`${I.items[i].p.id}×${I.items[j].p.id} ${(v * 100).toFixed(1)}cm`); }
    return out;
  };
});
const load = await ev(() => {
  const I = window.__jj.depot.interior, d = I._dbg, r = [];
  d.setMe(77, 11, 0); d.grabCart(); d.setCart(53.9, 30, 0); I.st.depenLog = [];
  // 도훈 제보 순서: 범쌀 20kg → 같은 자리에 보들범 30롤 → 작은 것들 (자꾸 같은 곳을 가리켜도)
  for (const [id, lv, x, z, rot, tip] of [['rice', 'upper', 0, 0.05, 0], ['tissue', 'upper', 0, 0.05, Math.PI / 2], ['chips', 'upper', 0.0, 0.05, 0, true], ['bottle', 'upper', 0.2, -0.3, 0], ['meat', 'upper', -0.1, 0.05, 0], ['egg', 'upper', 0, 0.05, 0],
    ['soda', 'lower', 0, -0.15, 0], ['water', 'lower', 0, -0.15, 0], ['water', 'lower', 0, -0.15, 0], ['ramen', 'upper', 0, 0.05, 0], ['ramen', 'upper', 0, 0.05, 0]]) {
    const ok = d.drop(id, lv, x, z, rot, tip); r.push(`${id}${ok ? '' : '(막음)'}`); if (!ok) d.cancelPlace(); d.settle(0.4);
  }
  d.settle(1.5);
  return { r, n: I.items.length, kg: +I.items.reduce((a, it) => a + it.p.kg, 0).toFixed(1), floor: d.floorIds() };
});
console.log('load', JSON.stringify(load));
let ov = await ev(() => window.__cartOverlaps()); console.log('overlap after load', ov); check(!ov.length, `overlap after load: ${ov}`);
check(load.r.some((s) => s.includes('(막음)')), 'cart-full / tray-full refusal happened');
// 스샷: 손잡이 뒤 1인칭 쪽 시점, 화면 가운데(마우스도 가운데)를 보들범 윗면에 → 집기 테두리
const aimId = 'tissue';
await ev((id) => { const I = window.__jj.depot.interior, d = I._dbg, it = I.items.find((x) => x.p.id === id) || I.items[0]; const b = it.body; b.updateAABB(); d.camAt([0.08, 1.78, 1.18], [b.position.x, b.aabb.upperBound.y - 0.03, b.position.z]); }, aimId);
await p.waitForTimeout(500);
if (!MOB) { const vp = p.viewportSize(); await p.mouse.move(vp.width / 2, vp.height / 2); }
await p.waitForTimeout(900);
const hov = await ev(() => { const h = window.__jj.depot.interior.hoverItem(); return h && { kind: h.kind, id: h.p.id }; });
const tip = await ev(() => document.querySelector('#depot-hud .dh-target')?.textContent || '');
console.log('hover', JSON.stringify(hov), tip);
check(hov && hov.kind === 'cart', `shot hover is a cart item (${JSON.stringify(hov)})`);
const shotName = `${OUT}/cart-mixed-pick-${MOB ? '844x390' : '1280x800'}.png`;
await p.screenshot({ path: shotName }); console.log('shot', shotName);
if (!MOB) await p.mouse.move(5, 5); // 집기 검사 전에 커서 치움

// 집기: 위에서 내려다보는 고정 시점 → 각 상품 윗면 가운데(덮이지 않은 것)를 실제 클릭/탭
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.setCart(53.9, 30, 0); d.camAt([0, 2.15, 1.05], [0, 0.55, -0.05]); });
await p.waitForTimeout(800);
const findTargets = () => ev(async () => {
  const T = await import('/node_modules/.vite/deps/three.js');
  const I = window.__jj.depot.interior, cam = I.camera, W = innerWidth, H = innerHeight, out = [];
  const rc = new T.Raycaster(), meshes = I.items.map((it) => it.mesh);
  for (const it of I.items) {
    if (it.level !== 'upper') continue;
    const v0 = it.body.velocity, w0 = it.body.angularVelocity; if (Math.hypot(v0.x, v0.y, v0.z) > 0.02 || Math.hypot(w0.x, w0.y, w0.z) > 0.1) continue; // 아직 움직이는 짐은 건너뜀 (클릭 순간 자리가 바뀜)
    const [sx, sy, sz] = it.size;
    // 후보: 윗면 가운데·네 귀퉁이 쪽 · 옆면들 (상품 로컬 좌표) → 화면에서 '보이는 첫 메시'가 이 상품인 점 하나
    const cands = [[0, 0.5, 0], [0.3, 0.5, 0.3], [-0.3, 0.5, 0.3], [0.3, 0.5, -0.3], [-0.3, 0.5, -0.3], [0, 0, 0.5], [0, 0, -0.5], [0.5, 0, 0], [-0.5, 0, 0], [0, -0.5, 0]];
    for (const [a, c, e] of cands) {
      const v = new T.Vector3(a * sx * 0.98, c * sy * 0.98, e * sz * 0.98); it.mesh.updateMatrixWorld(true); v.applyMatrix4(it.mesh.matrixWorld);
      const ndc = v.clone().project(cam); if (Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95 || ndc.z > 1) continue;
      rc.setFromCamera(new T.Vector2(ndc.x, ndc.y), cam);
      const hit = rc.intersectObjects(meshes, false)[0];
      if (!hit || hit.object !== it.mesh || Math.abs(hit.distance - cam.position.distanceTo(v)) > 0.03) continue; // 이 점이 화면에 보임
      // 또렷이 보이는 곳만 (가장자리 몇 픽셀 틈 X): 주변 ±8 px 도 같은 상품
      const k = W < 900 ? 8 : 16, px = k / W, py = k / H; // 모바일 가로는 화면이 작아 ±4 px
      if (![[px, 0], [-px, 0], [0, py], [0, -py]].every(([dx, dy]) => { rc.setFromCamera(new T.Vector2(ndc.x + dx, ndc.y + dy), cam); return rc.intersectObjects(meshes, false)[0]?.object === it.mesh; })) continue;
      out.push({ id: it.p.id, sx: Math.round((ndc.x + 1) / 2 * W), sy: Math.round((1 - ndc.y) / 2 * H) }); break;
    }
  }
  return out;
});
await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; for (let k = 0; k < 10 && I.items.some((x) => x.body.sleepState !== 2); k++) d.settle(0.5); });
const targets = await findTargets(); console.log('targets', JSON.stringify(targets));
const picks = [], tested = new Set();
for (let k = 0; k < 8; k++) {
  let t = null;
  for (let r = 0; r < 4 && !t; r++) { t = (await findTargets()).find((q) => !tested.has(q.id)); if (!t) await ev(() => window.__jj.depot.interior._dbg.settle(1.5)); } // 움직이는 짐은 멈출 때까지
  if (!t) break; tested.add(t.id); // 매번 다시 찾음 (집었다 취소하면 짐이 움직임)
  const pre = await ev(([x, y]) => window.__jj.depot.interior._dbg.pickAt(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), [t.sx, t.sy]);
  check(pre?.id === t.id, `${MODE} same-frame pick resolution at the visible ${t.id} → ${pre?.id}`); // 판정 로직 (보이는 메시 레이 = 정답)
  if (MOB) await p.touchscreen.tap(t.sx, t.sy); else await p.mouse.click(t.sx, t.sy); // 실제 입력 경로
  await p.waitForTimeout(300);
  const got = await ev(() => { const I = window.__jj.depot.interior; return { mode: I.st.mode, held: I.st.held?.p?.id || null }; });
  picks.push(`${t.id}→${got.held}`);
  check(got.held === t.id, `${MODE} ${MOB ? 'tap' : 'click'} at ${t.id} → got ${got.held} (same-frame pickAt: ${pre?.id})`);
  await ev(() => { const I = window.__jj.depot.interior, d = I._dbg; d.cancelPlace(); for (let k = 0; k < 10 && I.items.some((x) => x.body.sleepState !== 2); k++) d.settle(0.5); });
  const o2 = await ev(() => window.__cartOverlaps()); check(!o2.length, `overlap after cancel ${t.id}: ${o2}`);
  if (o2.length && process.env.DBG) console.log(await ev(() => window.__jj.depot.interior.items.map((it) => { const b = it.body; return `${it.p.id} p(${b.position.x.toFixed(3)},${b.position.y.toFixed(3)},${b.position.z.toFixed(3)}) q(${b.quaternion.x.toFixed(2)},${b.quaternion.y.toFixed(2)},${b.quaternion.z.toFixed(2)},${b.quaternion.w.toFixed(2)}) sleep${b.sleepState}`; }).join('\n')));
}
console.log('picks', picks.join(' '));
check(tested.size >= 3, `enough visible cart items clicked (${tested.size})`);
check(tested.has('rice') && tested.has('tissue'), 'rice (bottom, under the tissue) and tissue both clicked');

const metric = await ev(async () => { window.gc?.(); const J = window.__jj, info = J.renderer.info; await new Promise((r) => requestAnimationFrame(r)); info.autoReset = false; info.reset(); await new Promise((r) => requestAnimationFrame(() => r())); info.autoReset = true; return { draws: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }; });
console.log('metric', JSON.stringify(metric));
console.log('depenetration fixes', await ev(() => window.__jj.depot.interior.st.depenFixes || 0));
if (process.env.DBG) console.log(await ev(() => (window.__jj.depot.interior.st.depenLog || []).join('\n')));
await ev(() => { const d = window.__jj.depot.interior._dbg; d.push(3, 1); d.push(2, 1, 1); d.push(1.2, -1); d.settle(2); });
ov = await ev(() => window.__cartOverlaps()); console.log('overlap after drive', ov); check(!ov.length, `overlap after drive: ${ov}`);
const floorAfter = await ev(() => window.__jj.depot.interior._dbg.floorIds()); console.log('fell to floor', floorAfter);
const res = { mode: MODE, load, floorAfter, targets: targets.length, picks, hover: hov, tip, metric, errors: errs, fail };
writeFileSync(`${OUT}/check-${MODE}.json`, JSON.stringify(res, null, 1));
console.log(fail.length || errs.length ? `FAILED ${fail.length} checks, ${errs.length} console errors` : 'cart check ok');
await b.close();
process.exit(fail.length || errs.length ? 1 : 0);
