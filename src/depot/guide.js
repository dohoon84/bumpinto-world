// [depot-live] 목적지 안내 (스토리 사건·미션): 떠 있는 표지 + 바닥 화살표 길(통로 따라) + 화면 밖이면 가장자리 화살표 + 미니맵 핀 + 도착 반짝.
//   길찾기: 0.5 m 격자(정적 장애물 0.38 m 부풀림) A* + 통로 가운데로 가게 벽 가까운 칸에 비용. 격자·힙·경로는 미리 잡은 typed array (프레임마다 할당 없음).
//   그리기: 화살표 InstancedMesh 1 + 표지(뿔·바닥 고리·빛기둥) 3 = draw call 4. 대화창이 열리면 숨김(setHidden).
import * as THREE from 'three';

const CELL = 0.5, X0 = -1, Z0 = -1, NX = 176, NZ = 246, N = NX * NZ;
const MAX_PATH = 600, MAX_CHEV = 56, CHEV_GAP = 1.1;

export function createGuide({ scene, camera, keep = (x) => x, obstacles, isMobile = false, canvasTex }) {
  // ---------- 격자 ----------
  const blocked = new Uint8Array(N), clear = new Uint8Array(N), cost = new Float32Array(N);
  function rasterize() {
    blocked.fill(0);
    const pad = 0.38;
    for (let i = 0; i < NX; i++) { blocked[i] = 1; blocked[(NZ - 1) * NX + i] = 1; }
    for (let j = 0; j < NZ; j++) { blocked[j * NX] = 1; blocked[j * NX + NX - 1] = 1; }
    for (const o of obstacles) {
      if (o.npc || o.x0 < -100) continue; // 움직이는 손님 AABB 는 뺌
      const i0 = Math.max(0, Math.floor((o.x0 - pad - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((o.x1 + pad - X0) / CELL));
      const j0 = Math.max(0, Math.floor((o.z0 - pad - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((o.z1 + pad - Z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * NX + i] = 1;
    }
    // 벽까지 거리(칸) — 두 번 훑기(chamfer)
    const D = new Uint16Array(N);
    for (let k = 0; k < N; k++) D[k] = blocked[k] ? 0 : 999;
    for (let j = 1; j < NZ; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i; D[k] = Math.min(D[k], D[k - 1] + 1, D[k - NX] + 1, D[k - NX - 1] + 1, D[k - NX + 1] + 1); }
    for (let j = NZ - 2; j >= 0; j--) for (let i = NX - 2; i > 0; i--) { const k = j * NX + i; D[k] = Math.min(D[k], D[k + 1] + 1, D[k + NX] + 1, D[k + NX + 1] + 1, D[k + NX - 1] + 1); }
    for (let k = 0; k < N; k++) { clear[k] = Math.min(255, D[k]); cost[k] = 1 + 2.2 * Math.max(0, 4 - D[k]) / 4; } // 벽에서 2 m 안쪽이면 비싸게 → 통로 가운데
  }
  rasterize();
  const cellOf = (x, z) => { const i = Math.max(0, Math.min(NX - 1, Math.round((x - X0) / CELL))), j = Math.max(0, Math.min(NZ - 1, Math.round((z - Z0) / CELL))); return j * NX + i; };
  function freeNear(k) { // 막힌 칸이면 가장 가까운 빈 칸 (나선)
    if (!blocked[k]) return k;
    const ci = k % NX, cj = (k / NX) | 0;
    for (let r = 1; r < 14; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
      const q = j * NX + i; if (!blocked[q]) return q;
    }
    return k;
  }
  // A* (8방향)
  const g = new Float32Array(N), came = new Int32Array(N), stamp = new Uint32Array(N), closed = new Uint32Array(N);
  const heapK = new Int32Array(N), heapF = new Float32Array(N); let hn = 0, run = 0;
  const push = (k, f) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapK[i] = heapK[p]; heapF[i] = heapF[p]; i = p; } heapK[i] = k; heapF[i] = f; };
  const pop = () => { const top = heapK[0], lk = heapK[--hn], lf = heapF[hn]; let i = 0; for (;;) { let c = i * 2 + 1; if (c >= hn) break; if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= lf) break; heapK[i] = heapK[c]; heapF[i] = heapF[c]; i = c; } heapK[i] = lk; heapF[i] = lf; return top; };
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  const raw = new Int32Array(MAX_PATH * 4);
  const path = new Float32Array(MAX_PATH * 2); let pathN = 0, pathLen = 0;
  function solve(sx, sz, tx, tz) {
    run++; hn = 0;
    const s = freeNear(cellOf(sx, sz)), t = freeNear(cellOf(tx, tz));
    const ti = t % NX, tj = (t / NX) | 0;
    const h = (k) => { const di = Math.abs((k % NX) - ti), dj = Math.abs(((k / NX) | 0) - tj); return (di + dj + (Math.SQRT2 - 2) * Math.min(di, dj)); };
    g[s] = 0; stamp[s] = run; came[s] = -1; push(s, h(s));
    let found = false, it = 0;
    while (hn > 0 && it++ < 60000) {
      const k = pop(); if (closed[k] === run) continue; closed[k] = run;
      if (k === t) { found = true; break; }
      const ki = k % NX, kj = (k / NX) | 0;
      for (let d = 0; d < 8; d++) {
        const i = ki + DI[d], j = kj + DJ[d]; if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        const q = j * NX + i; if (blocked[q] || closed[q] === run) continue;
        if (d >= 4 && (blocked[kj * NX + i] || blocked[j * NX + ki])) continue; // 모서리 자르기 금지
        const ng = g[k] + DC[d] * cost[q];
        if (stamp[q] !== run || ng < g[q]) { stamp[q] = run; g[q] = ng; came[q] = k; push(q, ng + h(q)); }
      }
    }
    if (!found) { pathN = 2; path[0] = sx; path[1] = sz; path[2] = tx; path[3] = tz; pathLen = Math.hypot(tx - sx, tz - sz); return false; }
    let n = 0; for (let k = t; k >= 0 && n < MAX_PATH * 4; k = came[k]) raw[n++] = k;
    // 뒤집어서 2칸마다 한 점 + 끝점은 실제 좌표
    pathN = 0; pathLen = 0;
    const put = (x, z) => { if (pathN >= MAX_PATH) return; if (pathN) pathLen += Math.hypot(x - path[pathN * 2 - 2], z - path[pathN * 2 - 1]); path[pathN * 2] = x; path[pathN * 2 + 1] = z; pathN++; };
    put(sx, sz);
    for (let m = n - 2; m > 0; m -= 3) { const k = raw[m]; put(X0 + (k % NX) * CELL, Z0 + ((k / NX) | 0) * CELL); }
    put(X0 + (t % NX) * CELL, Z0 + ((t / NX) | 0) * CELL);
    // 부드럽게 (가운데 점 평균 2번)
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < pathN - 1; i++) { path[i * 2] = (path[i * 2 - 2] + path[i * 2] * 2 + path[i * 2 + 2]) / 4; path[i * 2 + 1] = (path[i * 2 - 1] + path[i * 2 + 1] * 2 + path[i * 2 + 3]) / 4; }
    pathLen = 0; for (let i = 1; i < pathN; i++) pathLen += Math.hypot(path[i * 2] - path[i * 2 - 2], path[i * 2 + 1] - path[i * 2 - 1]);
    return true;
  }

  // ---------- 그림 ----------
  const root = new THREE.Group(); root.name = 'depot-guide'; scene.add(root); root.visible = false;
  const chevT = keep(canvasTex(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.lineJoin = 'round'; c.lineCap = 'round';
    const chev = (lw, col) => { c.beginPath(); c.moveTo(22, 92); c.lineTo(64, 40); c.lineTo(106, 92); c.lineWidth = lw; c.strokeStyle = col; c.stroke(); };
    chev(34, '#123B2D'); chev(20, '#F2C230');
  }));
  const chevM = keep(new THREE.MeshBasicMaterial({ map: chevT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }));
  const chevG = keep(new THREE.PlaneGeometry(0.62, 0.62)); chevG.rotateX(-Math.PI / 2); // +z 가 화살표 끝… 아래에서 yaw 로 맞춤
  const chev = new THREE.InstancedMesh(chevG, chevM, MAX_CHEV); chev.frustumCulled = false; chev.renderOrder = 3; chev.count = 0; root.add(chev);
  const yel = keep(new THREE.MeshBasicMaterial({ color: 0xf2c230, toneMapped: false }));
  const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(0.28, 0.5, 4)), yel); cone.rotation.x = Math.PI; root.add(cone);
  const ringM = keep(new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const ringG = keep(new THREE.RingGeometry(0.82, 1.0, 40)); ringG.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringG, ringM); ring.renderOrder = 3; root.add(ring);
  const beamM = keep(new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  const beamG = keep(new THREE.CylinderGeometry(0.16, 0.34, 5.2, 10, 1, true)); beamG.translate(0, 2.6, 0);
  const beam = new THREE.Mesh(beamG, beamM); root.add(beam);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  // ---------- 화면 가장자리 화살표 (DOM 1개) ----------
  const edge = document.createElement('div'); edge.id = 'dp-guide-edge';
  edge.innerHTML = '<i></i><b></b>';
  const css = document.createElement('style');
  css.textContent = `#dp-guide-edge{position:fixed;left:0;top:0;z-index:57;pointer-events:none;display:none;width:0;height:0;font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif}
#dp-guide-edge i{position:absolute;left:-19px;top:-19px;width:38px;height:38px;border-radius:50%;background:#F2C230;border:3px solid #123B2D;box-shadow:0 4px 0 rgba(18,59,45,.4)}
#dp-guide-edge i::after{content:'';position:absolute;left:11px;top:8px;border-left:10px solid #123B2D;border-top:8px solid transparent;border-bottom:8px solid transparent;transform-origin:3px 8px}
#dp-guide-edge b{position:absolute;left:-40px;top:22px;width:80px;text-align:center;font-size:12px;font-weight:900;color:#123B2D;text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap}
#dp-guide-edge.m i{width:32px;height:32px;left:-16px;top:-16px}#dp-guide-edge.m i::after{left:9px;top:6px}#dp-guide-edge.m b{top:18px;font-size:11px}`;
  document.head.appendChild(css); document.body.appendChild(edge); if (isMobile) edge.classList.add('m');
  const arrowEl = edge.querySelector('i'), distEl = edge.querySelector('b');
  const AVOID = ['#depot-hud .dh-panel', '#h3-mm', '#dp-story .chip', '#dp-story .gear', '#dp-story .rx', '#m-joy', '.m-actions', '#m-hud .m-tg', '.co-chip', '#depot-hud .dh-help', '#dp-story .mcard', '#dp-story .mchip'];
  const rects = []; let rectT = 0;
  const safe = { l: 0, r: 0 }; // 노치(가로 화면): env(safe-area-inset-*) — 모바일은 viewport-fit=cover
  let probe = null;
  function readSafe() {
    if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)'; document.body.appendChild(probe); }
    const cs = getComputedStyle(probe); safe.l = parseFloat(cs.paddingLeft) || 0; safe.r = parseFloat(cs.paddingRight) || 0;
  }
  function refreshRects() {
    rects.length = 0;
    for (const sel of AVOID) for (const el of document.querySelectorAll(sel)) { if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue; const r = el.getBoundingClientRect(); if (r.width > 2 && r.height > 2) rects.push(r); }
  }
  const hit = (x, y, pad) => { for (const r of rects) if (x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad) return true; return false; };

  // ---------- 상태 ----------
  const S = { target: null, hidden: false, t: 0, solveT: 0, sx: 1e9, sz: 1e9, flash: 0, arrivedAt: 0, onScreen: true, edgeOn: false, lastKey: '' };
  function set(tg) {
    const key = tg ? `${tg.x.toFixed(2)},${tg.z.toFixed(2)}` : '';
    if (key === S.lastKey && !!tg === !!S.target) { if (tg) S.target = tg; return; }
    S.lastKey = key; S.target = tg || null; S.solveT = 0; S.sx = 1e9; pathN = 0; pathLen = 0;
    root.visible = !!tg && !S.hidden; if (!tg) { chev.count = 0; edge.style.display = 'none'; S.edgeOn = false; }
  }
  function setHidden(h) { if (h === S.hidden) return; S.hidden = h; root.visible = !!S.target && !h; if (h) { edge.style.display = 'none'; S.edgeOn = false; } }
  function arrive() { S.flash = 1; } // 고리가 커지며 반짝
  function tick(dt, me) {
    S.t += dt;
    if (S.flash > 0) { S.flash = Math.max(0, S.flash - dt * 1.4); const k = 1 + (1 - S.flash) * 2.2; ring.scale.set(k, 1, k); ringM.opacity = 0.9 * S.flash; if (!S.target) { root.visible = S.flash > 0 && !S.hidden; cone.visible = beam.visible = false; chev.count = 0; } }
    const tg = S.target; if (!tg) return;
    cone.visible = beam.visible = true;
    if (S.hidden) return;
    // 경로: 0.5초마다 또는 1.2 m 넘게 움직이면
    S.solveT -= dt;
    if (S.solveT <= 0 || Math.hypot(me.x - S.sx, me.z - S.sz) > 1.2) { S.solveT = 0.6; S.sx = me.x; S.sz = me.z; solve(me.x, me.z, tg.ax ?? tg.x, tg.az ?? tg.z); }
    // 표지
    const bob = Math.sin(S.t * 3) * 0.08;
    cone.position.set(tg.x, (tg.y || 2.3) + bob, tg.z); cone.rotation.y = S.t * 1.6;
    if (S.flash <= 0) { const p = 1 + Math.sin(S.t * 4) * 0.06; ring.scale.set((tg.r || 2) * 0.55 * p, 1, (tg.r || 2) * 0.55 * p); ringM.opacity = 0.75; }
    ring.position.set(tg.ax ?? tg.x, 0.03, tg.az ?? tg.z); beam.position.set(tg.x, 0, tg.z);
    // 바닥 화살표: 경로를 따라 CHEV_GAP 간격, 흐르듯 이동(phase). 내 발밑 1 m 은 비움. 30 m 까지만.
    const phase = (S.t * 1.3) % CHEV_GAP;
    let cnt = 0, acc = 0, want = 1.0 + phase;
    for (let i = 1; i < pathN && cnt < MAX_CHEV; i++) {
      const ax = path[i * 2 - 2], az = path[i * 2 - 1], bx = path[i * 2], bz = path[i * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az); if (L < 1e-4) continue;
      const yaw = Math.atan2(bx - ax, bz - az);
      while (want <= acc + L && cnt < MAX_CHEV) {
        const t = (want - acc) / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (want > pathLen - 0.8 || want > 30) { want = 1e9; break; }
        const fade = Math.min(1, (want - 1) / 1.2) * Math.min(1, (30 - want) / 4);
        q.setFromEuler(e.set(0, yaw + Math.PI, 0)); sc.set(fade, 1, fade);
        m4.compose(v.set(x, 0.035, z), q, sc); chev.setMatrixAt(cnt++, m4);
        want += CHEV_GAP;
      }
      acc += L;
    }
    chev.count = cnt; chev.instanceMatrix.needsUpdate = true;
    // 화면 밖이면 가장자리 화살표
    if ((rectT -= dt) <= 0) { rectT = 0.5; refreshRects(); if (isMobile) readSafe(); }
    v.set(tg.x, 1.4, tg.z).applyMatrix4(camera.matrixWorldInverse);
    const behind = v.z > 0;
    v.applyMatrix4(camera.projectionMatrix);
    let nx = v.x, ny = v.y; if (behind) { nx = -nx; ny = -ny; }
    const on = !behind && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.9;
    if (on) { if (S.edgeOn) { edge.style.display = 'none'; S.edgeOn = false; } }
    else {
      const W = innerWidth, H = innerHeight, mx = isMobile ? 34 + Math.max(safe.l, safe.r) : 42, my = isMobile ? 30 : 42;
      let ax = nx, ay = -ny; const m = Math.max(Math.abs(ax) / 1, Math.abs(ay) / 1) || 1; ax /= m; ay /= m;
      if (behind && Math.abs(ax) < 0.2 && ay < 0) ay = 1; // 바로 뒤 → 아래쪽
      let x = W / 2 + ax * (W / 2 - mx), y = H / 2 + ay * (H / 2 - my);
      // HUD 상자와 겹치면 가장자리를 따라 밀어냄
      if (hit(x, y, 26)) {
        const alongX = Math.abs(ay) > Math.abs(ax) * (W / H) * 0.9; let ok = false;
        for (let s = 1; s < 40 && !ok; s++) for (const sg of [1, -1]) {
          const tx = alongX ? Math.min(W - mx, Math.max(mx, x + sg * s * 18)) : x, ty = alongX ? y : Math.min(H - my, Math.max(my, y + sg * s * 18));
          if (!hit(tx, ty, 26)) { x = tx; y = ty; ok = true; break; }
        }
      }
      edge.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
      arrowEl.style.transform = `rotate(${Math.atan2(ay, ax).toFixed(2)}rad)`;
      if (!S.edgeOn) { edge.style.display = 'block'; S.edgeOn = true; }
    }
    const dtxt = `${Math.round(dist(me))} m`; if (distEl.textContent !== dtxt) distEl.textContent = dtxt;
  }
  function dist(me) { if (!S.target) return 0; return pathN > 1 ? Math.max(0, pathLen) : Math.hypot(me.x - S.target.x, me.z - S.target.z); }
  /** 미니맵(매장 안): 원 안에 매장 평면 + 경로 + 목적지 핀. g 는 CSS px 좌표, R 반지름, me 플레이어 */
  let plan = null;
  function planCanvas() {
    if (plan) return plan;
    const s = 2; plan = document.createElement('canvas'); plan.width = Math.ceil(NX * CELL * s); plan.height = Math.ceil(NZ * CELL * s);
    const c = plan.getContext('2d'); c.fillStyle = '#d9e6dd'; c.fillRect(0, 0, plan.width, plan.height);
    c.fillStyle = '#5c7a6a';
    for (const o of obstacles) { if (o.npc || o.x0 < -100) continue; c.fillRect((o.x0 - X0) * s, (o.z0 - Z0) * s, Math.max(1, (o.x1 - o.x0) * s), Math.max(1, (o.z1 - o.z0) * s)); }
    plan.s = s; return plan;
  }
  function mmDraw(g2, R, me, yaw = 0) {
    const p = planCanvas(), k = R / 26; // 반지름 26 m 보기
    g2.save(); g2.translate(R, R); g2.scale(k, k); g2.translate(-me.x, -me.z);
    g2.globalAlpha = 0.92; g2.drawImage(p, X0, Z0, p.width / p.s, p.height / p.s); g2.globalAlpha = 1;
    if (S.target && pathN > 1) {
      g2.beginPath(); g2.moveTo(path[0], path[1]); for (let i = 1; i < pathN; i++) g2.lineTo(path[i * 2], path[i * 2 + 1]);
      g2.lineWidth = 0.9; g2.setLineDash([1.2, 1.0]); g2.strokeStyle = '#d18b00'; g2.stroke(); g2.setLineDash([]);
    }
    g2.restore();
    if (S.target) { // 핀 (원 밖이면 테두리)
      let px = R + (S.target.x - me.x) * k, py = R + (S.target.z - me.z) * k; const dx = px - R, dy = py - R, d = Math.hypot(dx, dy);
      if (d > R - 10) { px = R + dx / d * (R - 10); py = R + dy / d * (R - 10); }
      g2.beginPath(); g2.arc(px, py - 9, 6.5, Math.PI * 0.8, Math.PI * 2.2); g2.lineTo(px, py); g2.closePath(); g2.fillStyle = '#F2C230'; g2.fill(); g2.lineWidth = 2; g2.strokeStyle = '#123B2D'; g2.stroke();
      g2.beginPath(); g2.arc(px, py - 9, 2.3, 0, Math.PI * 2); g2.fillStyle = '#123B2D'; g2.fill();
    }
    // 나 (가운데 화살표)
    g2.save(); g2.translate(R, R); g2.rotate(-yaw);
    g2.beginPath(); g2.moveTo(0, -10); g2.lineTo(7, 7); g2.lineTo(0, 3); g2.lineTo(-7, 7); g2.closePath(); g2.fillStyle = '#ffe169'; g2.fill(); g2.lineWidth = 1.5; g2.strokeStyle = '#3a2a00'; g2.stroke();
    g2.restore();
  }
  return {
    root, set, setHidden, tick, arrive, dist, mmDraw, solve, rasterize,
    get target() { return S.target; },
    _dbg: () => ({ pathN, pathLen: +pathLen.toFixed(1), chev: chev.count, edge: S.edgeOn, hidden: S.hidden, target: S.target && { x: S.target.x, z: S.target.z } }),
    dispose() { edge.remove(); probe?.remove(); css.remove(); root.removeFromParent(); chev.dispose(); },
  };
}
