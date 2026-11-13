// [depot-story] 4일차 '무너지는 날' 놀이 기믹 — E04 보들범 산사태 · E12 꼬마 손님 길 찾기.
//   대본 day4-script.json(d4_025 E04 · d4_048 E12) 의 mission.start 가 index.js 를 거쳐 여기 기믹·소품·판정을 씀. 위치는 targets.json v0.6
//   (tissue-pyramid · kid-spot · customer-desk — 실제 장애물과 안 겹치는 것 확인).
//   그림 비용: E04 = 팩 InstancedMesh 1 + 남은 팩 화살표 InstancedMesh 1 + 반납 파렛트 1 (팩은 tissue 상품 재질·아틀라스 그대로)
//              E12 = 꼬마(유아석 판 포함, 정점 색 합친 메시) 1 + 고객센터 창구(정점 색 합친 메시) 1 + 창구 간판 1.
//   물리: 팩은 2D(바닥) 굴림 + 높이 낙하만. cannon 몸체 없음. 카트 짐(items · loadKg · 계산)에는 안 들어감.
//   순수 판정·물리(evalE04 · evalE12 · createSlide · createEscort)는 DOM 없이 node 테스트(scripts/test-depot-day4.mjs).

export const E04 = Object.freeze({ packs: 12, packKg: 4.5, timeLimitSec: 120, cap: 4, okMin: 8, scoopMaxSpeed: 1.6, unloadEvery: 0.3, packR: 0.27 });
export const E12 = Object.freeze({ speedLimit: 1.0, boardMaxSpeed: 0.6, boardR: 2.0, overGraceSec: 0.3, overFailSec: 5, failBumps: 2, bumpGapSec: 0.8, timeoutSec: 180 });
/** targets.json v0.6 위치: 보들범 피라미드 파렛트(통로 02 끝 교차 통로 입구) · 고객센터 창구(입구 옆) · 꼬마가 혼자 선 곳(메인 통로)
 *   pallet: 교차 통로 엔드캡 파렛트(x 56–57.3 · 61.55–62.85, z 41.3–42.4 · 45.6–46.7) 사이 빈 칸. 반납 = 파렛트 중심 2.5 m 안.
 *   desk: 셀프 계산대(z 6.88–7.52) 와 앞벽(z 0.3) 사이 — 앞뒤로 2.5 m 이상 통로가 남음. 손님은 +z 쪽(az 4.6)에서 창구를 봄. */
export const D4_SPOTS = Object.freeze({
  pallet: { id: 'tissue-pyramid', label: '보들범 피라미드 파렛트 (통로 02 끝)', x: 59.4, z: 43.0, ax: 59.4, az: 43.0, r: 2.5, y: 2.4, w: 1.0, d: 1.22 },
  desk: { id: 'customer-desk', label: '고객센터 창구 (입구 옆)', x: 60.5, z: 3.2, ax: 60.5, az: 4.6, r: 2.5, y: 2.6 },
  kid: { id: 'kid-spot', label: '꼬마 손님 (메인 통로)', x: 47.0, z: 30.0, r: 2.0, y: 2.0 },
});

/** E04 판정: 12팩·충돌 0 = 성공, 8팩 이상(또는 12팩+충돌) = 부분, 7팩 이하 = 실패, 하나도 안 건드리고 끝 = 놓침 */
export function evalE04({ returned = 0, collisions = 0, engaged = true } = {}, t = E04) {
  if (returned >= t.packs && collisions === 0) return 'success';
  if (returned >= t.okMin) return 'partial';
  if (!engaged && returned === 0) return 'missed';
  return 'fail';
}
/** E12 판정 (events.json judge): 충돌 2번 이상 또는 과속 누적 5초 초과 = 실패, 안 태우고 끝 = 놓침, 충돌 0·과속 0초(측정 여유 0.3초) = 성공, 나머지 = 부분 */
export function evalE12({ boarded = false, arrived = false, bumps = 0, overSec = 0 } = {}, t = E12) {
  if (bumps >= t.failBumps || overSec > t.overFailSec) return 'fail';
  if (!boarded) return 'missed';
  if (!arrived) return 'partial';
  return bumps === 0 && overSec < t.overGraceSec ? 'success' : 'partial';
}

// 고정 시드 난수 (테스트·스샷이 늘 같은 산사태)
export function seeded(seed = 4) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/**
 * 굴러다니는 보들범 팩 12개 (2D 바닥 굴림 + 낙하). collide(x, z, r) → {nx, nz, pen}|null 은 interior 의 collide2D.
 *   step(dt, cart) · cart = {x, z, vx, vz, yaw, held}. 카트로 천천히(≤1.6 m/s) 닿으면 담김(최대 6), 빠르면 튕겨 굴러감.
 *   반납 존(pallet r) 안에 카트가 있으면 0.3초마다 한 팩씩 내려 쌓음.
 */
export function createSlide({ collide = () => null, rnd = seeded(4), spot = D4_SPOTS.pallet, t = E04, onEvent = () => {} } = {}) {
  const P = [];
  // 피라미드(파렛트 위 3층)가 통로 쪽으로 무너짐: 팩은 파렛트 바깥 둘레(통로 쪽 −x · 앞뒤 ±z)에서 높이를 가진 채 떨어지며 굴러감
  //   (파렛트 장애물 안에서 시작하면 밀려나며 속도를 잃으므로 바깥에서 시작)
  const hw = (spot.w || 1) / 2 + t.packR + 0.02, hd = (spot.d || 1.2) / 2 + t.packR + 0.02;
  for (let i = 0; i < t.packs; i++) {
    const layer = i < 6 ? 0 : i < 10 ? 1 : 2, side = i % 3; // 0: 통로 쪽(−x) · 1: 앞(−z) · 2: 뒤(+z)
    const u = (rnd() - 0.5) * 0.9, sp = 1.6 + rnd() * 2.4 + layer * 0.7;
    const x = side === 0 ? spot.x - hw : spot.x + u * (spot.w || 1) * 0.5 - 0.25, z = side === 0 ? spot.z + u * (spot.d || 1.2) : spot.z + (side === 1 ? -hd : hd);
    const a = side === 0 ? -Math.PI / 2 + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.9) : (side === 1 ? Math.PI : 0) + (rnd() - 0.5) * 0.9; // 진행 방향(0 = +z)
    P.push({ i, x, z, y: 0.3 + layer * 0.34, vy: 0.3 + rnd() * 0.7, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, yaw: rnd() * Math.PI, roll: 0, ax: 1, az: 0, state: 'loose', slot: -1, n: -1 });
  }
  const S = { packs: P, carried: 0, returned: 0, kicks: 0, scooped: 0, unloadT: 0, settled: false };
  const cartPts = (c) => { const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); return [[c.x + fx * 0.32, c.z + fz * 0.32], [c.x - fx * 0.25, c.z - fz * 0.25]]; };
  function slot() { const used = new Set(P.filter((p) => p.state === 'cart').map((p) => p.slot)); for (let k = 0; k < t.cap; k++) if (!used.has(k)) return k; return -1; }
  /** dt 가 길면(느린 기기) 1/30 초 이하로 나눠 돎 — 최대 0.25 초까지 따라잡음 */
  function step(dt, cart) { dt = Math.min(dt, 0.25); const n = Math.max(1, Math.ceil(dt * 30 - 1e-6)); for (let k = 0; k < n; k++) sub(dt / n, cart); return S; }
  function sub(dt, cart) {
    let moving = 0;
    for (const p of P) {
      if (p.state !== 'loose') continue;
      // 낙하 (피라미드에서 떨어짐) · 바닥에 닿으면 작게 튐
      if (p.y > 0 || p.vy > 0) { p.vy -= 9.8 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; if (Math.abs(p.vy) > 1.2) { p.vy = -p.vy * 0.25; onEvent('land', p); } else p.vy = 0; } }
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 0) { // 구름 마찰 (바닥에 있을 때만 크게)
        const dec = (p.y > 0.02 ? 0.4 : 1.6) * dt, k = Math.max(0, sp - dec) / sp; p.vx *= k; p.vz *= k;
        if (sp > 0.05) { p.ax = -p.vz / sp; p.az = p.vx / sp; p.roll += sp / 0.19 * dt; } // 진행 방향의 수직 축으로 굴림
      }
      if (Math.hypot(p.vx, p.vz) < 0.05) { p.vx = p.vz = 0; const q = Math.PI / 2, r = Math.round(p.roll / q) * q; p.roll += (r - p.roll) * Math.min(1, dt * 8); } else moving++; // 멈추면 면으로 눕힘
      let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
      const h = collide(nx, nz, t.packR);
      if (h) { nx += h.nx * h.pen; nz += h.nz * h.pen; const vn = p.vx * h.nx + p.vz * h.nz; if (vn < 0) { p.vx -= 1.5 * vn * h.nx; p.vz -= 1.5 * vn * h.nz; if (-vn > 0.8) onEvent('hit', p); } }
      p.x = nx; p.z = nz;
    }
    // 팩끼리 밀어냄
    for (let a = 0; a < P.length; a++) {
      const A = P[a]; if (A.state !== 'loose') continue;
      for (let b = a + 1; b < P.length; b++) {
        const B = P[b]; if (B.state !== 'loose') continue;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), m = t.packR * 2 * 0.9;
        if (d < m && d > 1e-4) { const ux = dx / d, uz = dz / d, o = (m - d) / 2; A.x -= ux * o; A.z -= uz * o; B.x += ux * o; B.z += uz * o; const rv = (B.vx - A.vx) * ux + (B.vz - A.vz) * uz; if (rv < 0) { A.vx += rv * ux * 0.5; A.vz += rv * uz * 0.5; B.vx -= rv * ux * 0.5; B.vz -= rv * uz * 0.5; } }
      }
    }
    // 카트: 담기 · 튕기기 · (놓아 둔 카트는 벽처럼)
    if (cart) {
      const csp = Math.hypot(cart.vx || 0, cart.vz || 0), pts = cartPts(cart);
      for (const p of P) {
        if (p.state !== 'loose' || p.y > 0.6) continue;
        let best = null; for (const [px, pz] of pts) { const d = Math.hypot(p.x - px, p.z - pz); if (!best || d < best.d) best = { d, px, pz }; }
        if (best.d > 0.36 + t.packR) continue;
        const psp = Math.hypot(p.vx, p.vz);
        if (cart.held && csp <= t.scoopMaxSpeed && psp < 1.0 && S.carried < t.cap) { p.state = 'cart'; p.slot = slot(); p.vx = p.vz = p.vy = 0; S.carried++; S.scooped++; onEvent('scoop', p); continue; }
        const ux = (p.x - best.px) / (best.d || 1), uz = (p.z - best.pz) / (best.d || 1), pen = 0.36 + t.packR - best.d;
        p.x += ux * pen; p.z += uz * pen;
        if (cart.held && csp > 0.3) { p.vx = (cart.vx || 0) * 1.1 + ux * 0.8; p.vz = (cart.vz || 0) * 1.1 + uz * 0.8; S.kicks++; onEvent(S.carried >= t.cap ? 'full' : 'kick', p); }
        else { const vn = p.vx * ux + p.vz * uz; if (vn < 0) { p.vx -= 1.4 * vn * ux; p.vz -= 1.4 * vn * uz; } if (cart.held && S.carried >= t.cap) onEvent('full', p); } // 굴러와 부딪힌 팩은 튕김
      }
      // 반납: 카트(또는 플레이어)가 파렛트 존 안 → 한 팩씩 내림
      const inZone = Math.hypot(cart.x - spot.ax, cart.z - spot.az) < spot.r || Math.hypot(cart.x - spot.x, cart.z - spot.z) < spot.r;
      if (S.carried > 0 && inZone) {
        S.unloadT -= dt;
        if (S.unloadT <= 0) { S.unloadT = t.unloadEvery; const p = P.filter((q) => q.state === 'cart').sort((a, b) => b.slot - a.slot)[0]; p.state = 'returned'; p.n = S.returned++; p.slot = -1; S.carried--; onEvent('return', p); }
      } else S.unloadT = 0.15;
    }
    S.settled = moving === 0;
  }
  const loose = () => P.filter((p) => p.state === 'loose');
  /** 가장 가까운 남은 팩 (카트가 꽉 차면 null) */
  function nearestLoose(x, z) { let b = null, bd = 1e9; for (const p of P) if (p.state === 'loose') { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return b; }
  return { S, P, step, loose, nearestLoose, get carried() { return S.carried; }, get returned() { return S.returned; } };
}

/** E12 호위 상태: 태우기 → 속도·충돌 세기 → 도착 */
export function createEscort({ t = E12 } = {}) {
  const S = { boarded: false, arrived: false, bumps: 0, overSec: 0, overNow: false, lastBumpT: -9, warnT: 0, speed: 0, maxSpeed: 0 };
  return {
    S,
    /** 매 틱: 탑승 중 속도(m/s) — 1.0 넘으면 과속 시간 누적, 경고는 4초에 한 번 (반환 true = 지금 경고 띄울 때) */
    tick(dt, speed) {
      S.speed = speed; if (!S.boarded || S.arrived) { S.overNow = false; return false; }
      S.maxSpeed = Math.max(S.maxSpeed, speed);
      S.overNow = speed > t.speedLimit + 0.02;
      if (S.overNow) S.overSec += dt;
      S.warnT -= dt;
      if (S.overNow && S.warnT <= 0) { S.warnT = 4; return true; }
      return false;
    },
    board() { if (S.boarded) return false; S.boarded = true; return true; },
    /** 충돌 1회 (같은 부딪힘이 여러 번 안 세지게 0.8초 간격) → 반환 true = 새로 셈 */
    bump(now) { if (!S.boarded || S.arrived || now - S.lastBumpT < t.bumpGapSec) return false; S.lastBumpT = now; S.bumps++; return true; },
    arrive() { if (!S.boarded) return false; S.arrived = true; return true; },
    failed: () => S.bumps >= t.failBumps || S.overSec > t.overFailSec,
    result: () => evalE12(S, t),
  };
}

// ---------------------------------------------------------------- 3D (브라우저) ----------------------------------------------------------------
function colored(THREE, geo, hex) { const g = geo.index ? geo.toNonIndexed() : geo; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
function mergeColored(THREE, parts) { // parts: [geo, hex, x, y, z, rx?, ry?, rz?, sx?, sy?, sz?]  — mergeGeometries 없이 같은 속성끼리 이어 붙임
  const gs = parts.map(([g, hex, x, y, z, rx = 0, ry = 0, rz = 0]) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)); const c = colored(THREE, g, hex); c.applyMatrix4(m); g.dispose?.(); return c; });
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of gs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.computeBoundingSphere();
  return out;
}

/**
 * 4일차 소품. look(id) → {geo, mat} 는 interior 의 상품 지오메트리(박스 12삼각형)·재질(아틀라스 텍스처) 재사용.
 *   obstacles 에는 사건 동안만 파렛트·창구 사각형을 넣고 끝나면 뺌.
 */
export function createDay4Props({ THREE, scene, keep, cartObj, look, obstacles, isMobile = false }) {
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), m4 = new THREE.Matrix4(), ax = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const BASKET_FLOOR = 0.47, PACK = [0.5, 0.33, 0.4];
  let packs = null, arrows = null, pallet = null, palObs = null, slide = null, kid = null, desk = null, deskObs = null, t = 0;
  const yawQ = (yaw) => q2.setFromAxisAngle(UP, yaw); // v(위치)는 건드리지 않음
  function ensurePacks() {
    if (packs) return;
    const L = look?.('tissue');
    const geo = L?.geo || keep(new THREE.BoxGeometry(...PACK)), mat = L?.mat || keep(new THREE.MeshLambertMaterial({ color: 0xf2f2f6 }));
    packs = new THREE.InstancedMesh(geo, mat, E04.packs); packs.name = 'story-bodeul-packs'; packs.frustumCulled = false; packs.castShadow = false;
    const ag = keep(new THREE.ConeGeometry(0.13, 0.26, 4, 1)); ag.rotateX(Math.PI);
    arrows = new THREE.InstancedMesh(ag, keep(new THREE.MeshBasicMaterial({ color: 0xffc21a })), E04.packs); arrows.name = 'story-bodeul-arrows'; arrows.frustumCulled = false;
    const pg = keep(new THREE.BoxGeometry(D4_SPOTS.pallet.w, 0.14, D4_SPOTS.pallet.d)); pg.translate(0, 0.07, 0);
    pallet = new THREE.Mesh(pg, keep(new THREE.MeshLambertMaterial({ color: 0xb08a58 }))); pallet.name = 'story-bodeul-pallet';
    pallet.position.set(D4_SPOTS.pallet.x, 0, D4_SPOTS.pallet.z);
  }
  /** 굴림 상태 → 인스턴스 행렬 */
  function drawPacks() {
    if (!packs || !slide) return;
    cartObj.updateMatrixWorld?.();
    let na = 0;
    for (const p of slide.P) {
      if (p.state === 'loose') {
        ax.set(p.ax, 0, p.az); if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0); ax.normalize();
        q.setFromAxisAngle(ax, p.roll).multiply(yawQ(p.yaw));
        const lift = Math.abs(Math.sin(p.roll * 2)) * 0.05; // 모서리로 넘어갈 때 살짝 들림
        m4.compose(v.set(p.x, PACK[1] / 2 + p.y + lift, p.z), q, s1); packs.setMatrixAt(p.i, m4);
        if (na < E04.packs) { m4.compose(v.set(p.x, 1.25 + Math.sin(t * 3.2 + p.i) * 0.08, p.z), yawQ(t * 2 + p.i), s1); arrows.setMatrixAt(na++, m4); }
      } else if (p.state === 'cart') {
        const k = p.slot, layer = k >> 1, zz = k % 2 ? 0.22 : -0.16;
        m4.compose(v.set((k % 3 - 1) * 0.02, BASKET_FLOOR + PACK[1] / 2 + layer * PACK[1], zz), q.setFromAxisAngle(UP, (k % 2 ? 0.05 : -0.04) + layer * 0.06), s1);
        m4.premultiply(cartObj.matrixWorld); packs.setMatrixAt(p.i, m4);
      } else if (p.state === 'gone') { m4.makeScale(0, 0, 0); packs.setMatrixAt(p.i, m4);
      } else { // 반납: 파렛트 위 2층 (2 × 3 × 2)
        const n = p.n, layer = n >= 6 ? 1 : 0, k = n % 6, S = D4_SPOTS.pallet;
        m4.compose(v.set(S.x + (k % 2 - 0.5) * 0.48, 0.14 + PACK[1] / 2 + layer * PACK[1], S.z + ((k / 2 | 0) - 1) * 0.4), yawQ(Math.PI / 2 + ((n * 7) % 3 - 1) * 0.03), s1);
        packs.setMatrixAt(p.i, m4);
      }
    }
    packs.instanceMatrix.needsUpdate = true;
    arrows.count = na; arrows.instanceMatrix.needsUpdate = true;
  }
  function buildKid() { // 사람 꼬마 손님(가족 손님의 아이) — 동물·박스 마스코트 아님. 정점 색 합친 메시 1개
    const SK = 0xf0cfae, HAIR = 0x2a1d16, SHIRT = 0xf2c230, PANTS = 0x3d5a8a;
    const parts = [
      [new THREE.BoxGeometry(0.4, 0.03, 0.22), 0xd8262c, 0, 0.8, 0.35], // 펼친 유아석 판
      [new THREE.CylinderGeometry(0.1, 0.12, 0.26, 8, 1), SHIRT, 0, 0.96, 0.36], // 노란 티셔츠
      [new THREE.SphereGeometry(0.105, 10, 8), SK, 0, 1.2, 0.36], // 얼굴
      [new THREE.SphereGeometry(0.112, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), HAIR, 0, 1.215, 0.375], // 머리카락(정수리·뒤통수)
      [new THREE.SphereGeometry(0.014, 6, 4), 0x111111, -0.037, 1.21, 0.262], [new THREE.SphereGeometry(0.014, 6, 4), 0x111111, 0.037, 1.21, 0.262], // 눈
      [new THREE.BoxGeometry(0.04, 0.012, 0.01), 0xc0504d, 0, 1.165, 0.262], // 웃는 입
      [new THREE.SphereGeometry(0.022, 6, 4), SK, -0.105, 1.2, 0.36], [new THREE.SphereGeometry(0.022, 6, 4), SK, 0.105, 1.2, 0.36], // 귀(사람)
      [new THREE.CapsuleGeometry(0.032, 0.12, 2, 6), SHIRT, -0.125, 0.98, 0.33, 0, 0, 0.5], [new THREE.CapsuleGeometry(0.032, 0.12, 2, 6), SHIRT, 0.125, 0.98, 0.33, 0, 0, -0.5], // 팔
      [new THREE.SphereGeometry(0.03, 6, 4), SK, -0.165, 0.91, 0.31], [new THREE.SphereGeometry(0.03, 6, 4), SK, 0.165, 0.91, 0.31], // 손
      [new THREE.CapsuleGeometry(0.04, 0.14, 2, 6), PANTS, -0.05, 0.76, 0.25, -0.6, 0, 0], [new THREE.CapsuleGeometry(0.04, 0.14, 2, 6), PANTS, 0.05, 0.76, 0.25, -0.6, 0, 0], // 다리(얼굴 쪽으로 내림)
      [new THREE.BoxGeometry(0.06, 0.05, 0.1), 0xffffff, -0.05, 0.69, 0.18], [new THREE.BoxGeometry(0.06, 0.05, 0.1), 0xffffff, 0.05, 0.69, 0.18], // 운동화
    ];
    const g = keep(mergeColored(THREE, parts));
    // 얼굴이 -z(카트 앞)을 보게 그린 뒤 180° 돌려 손잡이(플레이어) 쪽 +z 를 보게 · 0.72배(유아석 판 높이 0.8 기준)로 줄여 앞 시야를 덜 가림
    g.translate(0, -0.8, -0.36); g.rotateY(Math.PI); g.scale(0.72, 0.72, 0.72); g.translate(0, 0.8, 0.36);
    const m = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true }))); m.name = 'story-lost-kid';
    return m;
  }
  function buildDesk() {
    const S = D4_SPOTS.desk, parts = [
      [new THREE.BoxGeometry(2.6, 1.05, 0.7), 0x1e5a45, 0, 0.525, 0], // 창구 몸통(범창고 초록)
      [new THREE.BoxGeometry(2.7, 0.05, 0.8), 0xe8e2d4, 0, 1.075, 0.02], // 상판
      [new THREE.BoxGeometry(2.6, 0.12, 0.02), 0xf2c230, 0, 0.82, 0.36], // 노란 띠
      [new THREE.BoxGeometry(0.06, 1.5, 0.06), 0x6c757b, -1.2, 1.8, -0.2], [new THREE.BoxGeometry(0.06, 1.5, 0.06), 0x6c757b, 1.2, 1.8, -0.2], // 간판 기둥
    ];
    const g = keep(mergeColored(THREE, parts));
    const m = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true }))); m.name = 'story-service-desk'; m.position.set(S.x, 0, S.z);
    let sign = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#1E5A45'; x.fillRect(0, 0, 512, 128); x.fillStyle = '#F2C230'; x.fillRect(0, 108, 512, 20);
      x.fillStyle = '#fff'; x.font = '900 58px Pretendard, "Noto Sans KR", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('고객센터', 256, 52);
      x.font = '700 22px Pretendard, sans-serif'; x.fillStyle = '#d6efe2'; x.fillText('분실물 · 미아 · 환불', 256, 94);
      const tx = keep(new THREE.CanvasTexture(c)); tx.colorSpace = THREE.SRGBColorSpace; if (isMobile) tx.generateMipmaps = false;
      sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.5, 0.62)), keep(new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }))); sign.name = 'story-service-sign'; sign.position.set(S.x, 2.5, S.z - 0.2);
    }
    return { m, sign };
  }
  const addObs = (o) => { obstacles?.push(o); return o; };
  const rmObs = (o) => { if (!o || !obstacles) return; const i = obstacles.indexOf(o); if (i >= 0) obstacles.splice(i, 1); };
  let kidState = 'off', hideT = 0;
  const api = {
    /** E04 시작: 피라미드 무너짐 (팩 12개 생성) */
    startSlide(opts = {}) {
      ensurePacks(); slide = createSlide({ ...opts });
      scene.add(packs, arrows, pallet); packs.visible = arrows.visible = pallet.visible = true;
      rmObs(palObs); const S = D4_SPOTS.pallet; palObs = addObs({ x0: S.x - S.w / 2, x1: S.x + S.w / 2, z0: S.z - S.d / 2, z1: S.z + S.d / 2, story: 'e04' });
      hideT = 0; drawPacks(); return slide;
    },
    get slide() { return slide; },
    /** E04 끝: 남은 팩·화살표 치움(반납한 팩은 파렛트에 15초 더 보였다가 정리) */
    endSlide(keepSec = 15) { if (!slide) return; for (const p of slide.P) if (p.state !== 'returned') p.state = 'gone'; slide.S.carried = 0; if (arrows) arrows.visible = false; drawPacks(); hideT = keepSec; },
    clearSlide() { slide = null; hideT = 0; packs?.removeFromParent(); arrows?.removeFromParent(); pallet?.removeFromParent(); rmObs(palObs); palObs = null; },
    /** E12: 꼬마 off → standing(통로) → riding(유아석) → desk(창구 앞) */
    kid(state, at = D4_SPOTS.kid) {
      kidState = state;
      if (state === 'off') { kid?.removeFromParent(); return; }
      kid ||= buildKid();
      if (state === 'riding') { kid.position.set(0, 0, 0); kid.rotation.set(0, 0, 0); cartObj.add(kid); return; }
      // 통로·창구에선 유아석 판 높이(0.8)만큼 내려 바닥에 앉은 모습 (판 = 작은 빨간 매트). 메시 원점이 꼬마 중심(z 0.36)에서 벗어나 있어 보정
      kid.removeFromParent(); kid.rotation.set(0, Math.PI, 0); kid.position.set(at.x, -0.78, at.z + 0.36); scene.add(kid); // 얼굴은 -z (입구 쪽)
    },
    get kidState() { return kidState; },
    desk(on) {
      if (on) { if (!desk) desk = buildDesk(); scene.add(desk.m); if (desk.sign) scene.add(desk.sign); if (!deskObs) { const S = D4_SPOTS.desk; deskObs = addObs({ x0: S.x - 1.35, x1: S.x + 1.35, z0: S.z - 0.4, z1: S.z + 0.4, story: 'e12' }); } return; }
      desk?.m.removeFromParent(); desk?.sign?.removeFromParent(); rmObs(deskObs); deskObs = null;
    },
    tick(dt, cart) {
      t += dt;
      if (slide && packs?.parent) {
        if (hideT <= 0 || slide.S.carried) slide.step(dt, cart);
        drawPacks();
        if (hideT > 0 && (hideT -= dt) <= 0) api.clearSlide();
      }
      if (kidState === 'standing' && kid) kid.position.y = -0.78 + Math.abs(Math.sin(t * 5)) * 0.04; // 콩콩 (손 흔들며 기다림)
    },
    stats() { return { packs: !!packs?.parent, arrows: arrows?.parent ? arrows.count : 0, pallet: !!pallet?.parent, kid: kidState, desk: !!desk?.m.parent, obstacles: [palObs, deskObs].filter(Boolean).length }; },
    dispose() { api.clearSlide(); api.kid('off'); api.desk(false); },
  };
  return api;
}
