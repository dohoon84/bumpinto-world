// [md-trees] 명동 ↔ 남산(오르미·케이블카 들머리) 사이 나무가 땅에서 떠 있지 않은지.
//   씬의 모든 나무 줄기 인스턴스(5각 원기둥 InstancedMesh — 남산 숲·명동 가로수 공통)의 밑동 높이를
//   플레이어가 서는 땅(terrain.getGroundHeight — 명동은 명동 땅, 남산은 남산 땅)과 비교한다.
//   밑동 − 땅 > 0.3 m 인 나무가 하나라도 있으면 실패. 땅에 1.5 m 넘게 박힌 나무도 실패(줄기 없이 잎만 보인다).
//   node scripts/corridor/test/test-myeongdong-trees.mjs <vite port>   (npm run myeongdong:trees — MYEONGDONG_WALK_PORT, 기본 5231)
import { chromium } from 'playwright';
const PORT = /^\d+$/.test(process.argv[2] || '') ? process.argv[2] : process.env.MYEONGDONG_WALK_PORT;
if (!PORT) { console.log('test-myeongdong-trees: skipped (no vite port)'); process.exit(0); }
const FLOAT = 0.3, BURY = 1.5;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?ws=mock&at=myeongdong&hour=14&weather=clear&shot=1&noticePopup=0&controlscard=0`);
await page.waitForFunction(() => window.__jj?.ready && window.__jj?.myeongdong?.ready, null, { timeout: 300000 });
const res = await page.evaluate(async ({ FLOAT, BURY }) => {
  const J = window.__jj, md = J.myeongdong, T = J.terrain;
  // 퇴계로·소공로 들머리(케이블카 가는 길)에 서서 남산까지 지어지게
  const px = -11215, pz = -21530;
  await J.corridor.preload?.(px, pz); await J.teleport(px, pz, md.surfaceY(px, pz));
  for (let i = 0; i < 40 && !J.namsan?.ready; i++) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 4000));
  let sc = J.player; while (sc.parent) sc = sc.parent; sc.updateMatrixWorld(true);
  const A = md.apron || { x0: -11530, z0: -22300, x1: -10455, z1: -21300 };
  const R = 450; // 명동 바깥 띠 + 450 m (남산 북쪽 기슭·오르미·케이블카 승강장까지)
  const near = (x, z) => x > A.x0 - R && x < A.x1 + R && z > A.z0 - R && z < A.z1 + R;
  const m = new J.player.matrix.constructor(), v = new J.player.position.constructor(), q = new J.player.quaternion.constructor(), s = new J.player.scale.constructor();
  const meshes = [], bad = []; let n = 0, nMd = 0, worstUp = -Infinity, worstDown = Infinity;
  sc.traverse((o) => {
    if (!o.isInstancedMesh || o.geometry.type !== 'CylinderGeometry' || o.geometry.parameters.radialSegments !== 5) return;
    o.geometry.computeBoundingBox(); const by = o.geometry.boundingBox.min.y;
    let path = []; for (let a = o; a; a = a.parent) path.unshift(a.name || a.type);
    let k = 0;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); m.decompose(v, q, s);
      const baseY = v.y + by * s.y; // 줄기 밑동
      if (!near(v.x, v.z)) continue;
      k++; n++; const inMd = !!md.owns(v.x, v.z) || md.surfaceY(v.x, v.z) != null; if (inMd) nMd++;
      const g = T.getGroundHeight(v.x, v.z, baseY + 0.5);
      const d = baseY - g; worstUp = Math.max(worstUp, d); worstDown = Math.min(worstDown, d);
      if ((d > FLOAT || d < -BURY) && bad.length < 40) bad.push({ x: +v.x.toFixed(1), z: +v.z.toFixed(1), d: +d.toFixed(2), md: inMd, mesh: path.slice(1, 4).join('/') });
    }
    if (k) meshes.push({ path: path.slice(1, 4).join('/'), n: k });
  });
  return { n, nMd, worstUp: +worstUp.toFixed(2), worstDown: +worstDown.toFixed(2), bad, meshes, namsan: !!J.namsan?.ready };
}, { FLOAT, BURY });
await browser.close();
console.log(JSON.stringify(res, null, 1));
const fails = [];
if (!res.namsan) fails.push('namsan not built');
if (res.n < 100) fails.push(`too few trees checked (${res.n})`);
if (res.bad.length) fails.push(`${res.bad.length}+ trees off the ground (float > ${FLOAT} m or buried > ${BURY} m)`);
if (errors.length) fails.push('console errors: ' + errors.slice(0, 3).join(' | '));
if (fails.length) { console.error('test-myeongdong-trees FAIL:', fails.join('; ')); process.exit(1); }
console.log(`test-myeongdong-trees ok — ${res.n} trees (명동 땅 ${res.nMd}), worst +${res.worstUp} / ${res.worstDown} m`);
