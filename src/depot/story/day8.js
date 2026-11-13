// [depot-story] 8일차 '보라색 월요일' (2주차 첫날) — E15 보라 카트 행렬 · E16 보라 전단지 바람 + 2주차 등장인물(경쟁 마트 팀장·보라 조끼 직원) 소품.
//   대본 day8-script.json(w2_000 일차 카드 → w2_001 A·B 분기 → d8_020 합류 · d8_031 E16 · d8_052 E15) 의 mission.start 가 index.js 를 거쳐 여기 판정·상태·소품을 씀.
//   그림 비용: 보라 카트 3대 = InstancedMesh 1 · 보라 조끼 직원 3명 = InstancedMesh 1 · 팀장 = 정점 색 메시 1 · 전단지 16장 = InstancedMesh 1 ·
//              보라 시식 천막(9일차, 매장 밖) 1 · 전단지 재활용함 1. 행렬 카트는 사건 동안 story 장애물(사각형 3개, 제자리에서 값만 바꿈).
//   순수 판정·상태(evalE15 · evalE16 · weekStartVitality · convoyPath · createConvoy · createFlyers)는 DOM 없이 node 테스트(scripts/test-depot-day8.mjs).
import { box, hex, geo, alongPath } from './day6.js';

/** E15 수치(events.json tuning·convoy). spacing = 카트 길이 + 간격 2.4 m (중심 사이 3.7 m) */
export const E15 = Object.freeze({ timeLimitSec: 240, speed: 1.3, gapM: 2.4, pauseSec: 4, carts: 3, cartKg: 60, cartLen: 1.3, cartW: 0.8, hitGapSec: 1.0, failHits: 2, failEggs: 7, contactR: 0.44, nearM: 3 });
/** E16 수치. pickR = 카트 앞·뒤 원 중심에서 0.5 m, 1.0 m/s 이하로 지나가면 붙음 · 1.8 m/s 넘으면 1.2초마다 1장 떨어짐 */
export const E16 = Object.freeze({ timeLimitSec: 60, flyers: 16, need: 12, okMin: 8, pickR: 0.5, pickMaxSpeed: 1.0, blowOffSpeed: 1.8, blowEverySec: 1.2, blowR: 0.9, scatterSec: 1.4 });
/** 2주차 시작 활기 = floor(1주차 최종 / 2), 최대 40 (README weekStart) */
export function weekStartVitality(w1, cap = 40) { return Math.max(0, Math.min(cap, Math.floor((Number(w1) || 0) / 2))); }
/** 2주차 하루 끝 활기 (events.json week2Vitality): 성공 = 표 값, 부분 = 절반 내림, 실패·놓침 = 0 */
export function week2Gain(r, val) { return r === 'success' ? val : r === 'partial' ? Math.floor(val / 2) : 0; }

/** E15 판정: 도착 && 충돌 0 && 알 0 = 성공 · 충돌 1 또는 알 1~6 = 부분 · 충돌 ≥2 · 알 ≥7 · 240초 초과 = 실패 · 재료를 하나도 안 담고 240초 = 놓침 */
export function evalE15({ arrived = false, hits = 0, eggs = 0, timeUp = false, engaged = true } = {}, t = E15) {
  if (hits >= t.failHits || eggs >= t.failEggs) return 'fail';
  if (timeUp || !arrived) return engaged ? 'fail' : 'missed';
  return hits === 0 && eggs === 0 ? 'success' : 'partial';
}
/** E16 판정: 12장 이상 성공 · 8~11 부분 · 7 이하 실패 · 전단지 범위에 한 번도 안 옴 = 놓침 */
export function evalE16({ scooped = 0, engaged = true } = {}, t = E16) {
  if (!engaged && scooped === 0) return 'missed';
  return scooped >= t.need ? 'success' : scooped >= t.okMin ? 'partial' : 'fail';
}

/** 행렬 고리 (targets convoy-loop.path) — 앞 랙(z 14–41) 과 특가 매대(45.25–46.55, 43.45–44.55)를 비켜 메인 통로 x 47.6 · 앞쪽 띠 z 13 으로 옮김 */
export function convoyPath(tg = {}) {
  const src = tg['convoy-loop']?.path || [[47, 14], [47, 44], [59.4, 44], [59.4, 14]];
  const xs = src.map((p) => p[0]), zs = src.map((p) => p[1]);
  const x0 = Math.max(47.6, Math.min(...xs)), x1 = Math.max(...xs), z0 = Math.min(13, Math.min(...zs)), z1 = Math.max(...zs);
  const path = [{ x: x0, z: z0 }, { x: x0, z: z1 }, { x: x1, z: z1 }, { x: x1, z: z0 }, { x: x0, z: z0 }];
  let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  const pause = tg['timesale-endcap'] || { x: 47, z: 44 };
  // 멈춤 지점: 고리 위에서 특가 매대에 가장 가까운 점 (교차 통로 모퉁이 조금 지나)
  let best = 0, bd = 1e9; for (let d = 0; d < len; d += 0.25) { const p = alongPath(path, len, d), q = Math.hypot(p.x - pause.x, p.z - pause.z); if (q < bd) { bd = q; best = d; } }
  return { path, len, pauseD: best + 0.6 };
}
/** 축 맞춘 카트 사각형 (진행 방향 dx,dz 로 길이 축 결정) */
export function cartRect(p, t = E15) { const alongX = Math.abs(p.dx) > Math.abs(p.dz), hx = (alongX ? t.cartLen : t.cartW) / 2, hz = (alongX ? t.cartW : t.cartLen) / 2; return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz }; }
const rectD = (r, x, z) => Math.hypot(x - Math.max(r.x0, Math.min(x, r.x1)), z - Math.max(r.z0, Math.min(z, r.z1)));

/**
 * 보라 카트 행렬: 카트 3대가 고리를 1.3 m/s 로 돎(앞 카트 기준, 뒤 카트는 3.7 m 씩 뒤). 앞 카트가 특가 매대 앞을 지날 때마다 4초 멈춤.
 *   contacts(pts, now) — 카트 앞·뒤 원(pts)이 행렬 카트 사각형에 새로 닿으면 그 카트 번호 (같은 카트 1초 안 연속은 1번, 붙어 있는 동안은 안 셈).
 */
export function createConvoy({ route = convoyPath(), t = E15, startD = null, onEvent = () => {} } = {}) {
  const spacing = t.cartLen + t.gapM;
  const S = { d: startD ?? route.len - 4, pauseT: 0, lapPaused: -1, hits: 0, carts: [], running: true };
  const C = Array.from({ length: t.carts }, (_, i) => ({ i, x: 0, z: 0, dx: 0, dz: 1, yaw: 0, rect: { x0: 0, x1: 0, z0: 0, z1: 0 }, touch: false, lastHit: -99 }));
  function place() {
    for (const c of C) {
      const p = alongPath(route.path, route.len, S.d - c.i * spacing);
      c.x = p.x; c.z = p.z; c.dx = p.dx; c.dz = p.dz; c.yaw = Math.atan2(p.dx, p.dz);
      Object.assign(c.rect, cartRect(p, t));
    }
    S.carts = C;
  }
  place();
  return {
    S, C, route,
    step(dt) {
      if (!S.running) return S;
      if (S.pauseT > 0) { S.pauseT -= dt; if (S.pauseT <= 0) onEvent('go'); return S; }
      const lap = Math.floor(S.d / route.len), into = S.d - lap * route.len, nd = S.d + t.speed * dt, nInto = nd - lap * route.len;
      if (S.lapPaused !== lap && into < route.pauseD && nInto >= route.pauseD) { S.lapPaused = lap; S.d = lap * route.len + route.pauseD; S.pauseT = t.pauseSec; place(); onEvent('pause'); return S; }
      S.d = nd; place(); return S;
    },
    /** 카트 원 중심들 → 새로 닿은 행렬 카트 번호 배열 (S.hits 증가) */
    contacts(pts, tNow) {
      const out = [];
      for (const c of C) {
        const on = pts.some(([x, z]) => rectD(c.rect, x, z) < t.contactR);
        if (on && !c.touch && tNow - c.lastHit > t.hitGapSec) { c.lastHit = tNow; S.hits++; out.push(c.i); }
        c.touch = on;
      }
      return out;
    },
    nearest(x, z) { let bd = 1e9, b = null; for (const c of C) { const d = rectD(c.rect, x, z); if (d < bd) { bd = d; b = c; } } return { d: bd, c: b }; },
    paused: () => S.pauseT > 0,
  };
}

/** 전단지 16장: 자동문(문 가운데)에서 날려 flyer-zone 안에 흩뿌림 → 카트로 천천히 지나가면 붙음 */
export function createFlyers({ zone = { x0: 62, x1: 72, z0: 4, z1: 11 }, door = { x: 69, z: 0.8 }, rnd = Math.random, collide = () => null, t = E16, onEvent = () => {} } = {}) {
  const F = [];
  for (let i = 0; i < t.flyers; i++) {
    let x = 0, z = 0;
    for (let k = 0; k < 30; k++) { x = zone.x0 + 0.4 + rnd() * (zone.x1 - zone.x0 - 0.8); z = zone.z0 + 0.4 + rnd() * (zone.z1 - zone.z0 - 0.8); if (!collide(x, z, 0.3) && F.every((f) => Math.hypot(f.tx - x, f.tz - z) > 0.55)) break; }
    F.push({ i, state: 'fly', t: -i * 0.05, fx: door.x + (rnd() - 0.5) * 2, fz: door.z, tx: x, tz: z, x: door.x, z: door.z, y: 1.2, yaw: rnd() * Math.PI, vx: 0, vz: 0, slot: -1 });
  }
  const S = { scooped: 0, onCart: 0, dropped: 0, blowT: 0, engaged: false };
  const free = () => { const used = new Set(F.filter((f) => f.state === 'cart').map((f) => f.slot)); for (let k = 0; k < t.flyers; k++) if (!used.has(k)) return k; return 0; };
  return {
    S, F,
    /** cart: {x,z,yaw,speed,held} · inZone: 카트·플레이어가 범위 안 */
    step(dt, cart, inZone) {
      if (inZone) S.engaged = true;
      for (const f of F) {
        if (f.state === 'fly') { // 문에서 날아와 내려앉음 (펄럭)
          f.t += dt; const k = Math.max(0, Math.min(1, f.t / t.scatterSec)), e = 1 - (1 - k) * (1 - k);
          f.x = f.fx + (f.tx - f.fx) * e; f.z = f.fz + (f.tz - f.fz) * e; f.y = 0.004 + Math.sin(k * Math.PI) * 1.1 + (1 - k) * 0.2; f.yaw += dt * 5;
          if (k >= 1) { f.state = 'floor'; f.y = 0.004; }
        } else if (f.state === 'blown') {
          f.t += dt; const k = Math.min(1, f.t / 0.7);
          let nx = f.x + f.vx * dt, nz = f.z + f.vz * dt; if (collide(nx, nz, 0.15)) { nx = f.x; nz = f.z; f.vx = f.vz = 0; }
          f.x = nx; f.z = nz; f.vx *= 0.9; f.vz *= 0.9; f.y = 0.004 + Math.sin(k * Math.PI) * 0.45; f.yaw += dt * 6;
          if (k >= 1) { f.state = 'floor'; f.y = 0.004; }
        }
      }
      if (!cart || !cart.held) return S;
      const fx = -Math.sin(cart.yaw), fz = -Math.cos(cart.yaw), pts = [[cart.x + fx * 0.32, cart.z + fz * 0.32], [cart.x - fx * 0.25, cart.z - fz * 0.25]];
      for (const f of F) {
        if (f.state !== 'floor') continue;
        const d = Math.min(...pts.map(([x, z]) => Math.hypot(f.x - x, f.z - z)));
        if (d < t.pickR && cart.speed <= t.pickMaxSpeed) { f.state = 'cart'; f.slot = free(); S.scooped++; S.onCart++; S.engaged = true; onEvent('scoop', f); }
        else if (d < t.blowR && cart.speed > t.pickMaxSpeed + 0.2) { const a = Math.atan2(f.x - cart.x, f.z - cart.z); f.state = 'blown'; f.t = 0; f.vx = Math.sin(a) * cart.speed * 0.9; f.vz = Math.cos(a) * cart.speed * 0.9; onEvent('blow', f); }
      }
      if (cart.speed > t.blowOffSpeed && S.onCart > 0) {
        S.blowT -= dt;
        if (S.blowT <= 0) {
          S.blowT = t.blowEverySec; const f = F.filter((q) => q.state === 'cart').sort((a, b) => b.slot - a.slot)[0];
          f.state = 'blown'; f.t = 0; f.slot = -1; f.x = cart.x - fx * 0.8; f.z = cart.z - fz * 0.8; f.vx = -fx * 1.2; f.vz = -fz * 1.2; S.onCart--; S.scooped--; S.dropped++; onEvent('drop', f);
        }
      } else S.blowT = 0.4;
      return S;
    },
    left: () => F.filter((f) => f.state !== 'cart').length,
    nearest(x, z) { let b = null, bd = 1e9; for (const f of F) if (f.state === 'floor') { const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; b = f; } } return b; },
  };
}

// ---------------------------------------------------------------- 3D·DOM (브라우저) ----------------------------------------------------------------
/** 사람(정점 색 상자 묶음): 다리·신발·몸통·팔·머리·머리카락 + 옵션(조끼·소품). 얼굴은 +z */
export function personParts(pos, col, nrm, { legs, shoes = 0x1a1a1a, top, skin = 0xf0c8a0, hair = 0x1a1a1a, vest = null, hairLong = false, prop = null } = {}) {
  const L = hex(legs), K = hex(shoes), T = hex(top), S = hex(skin), H = hex(hair);
  box(pos, col, -0.1, 0.42, 0, 0.15, 0.84, 0.19, L, nrm); box(pos, col, 0.1, 0.42, 0, 0.15, 0.84, 0.19, L, nrm);
  box(pos, col, -0.1, 0.04, 0.04, 0.16, 0.08, 0.28, K, nrm); box(pos, col, 0.1, 0.04, 0.04, 0.16, 0.08, 0.28, K, nrm);
  box(pos, col, 0, 1.16, 0, 0.46, 0.66, 0.26, T, nrm);
  if (vest != null) { const V = hex(vest); box(pos, col, 0, 1.14, 0.005, 0.5, 0.56, 0.28, V, nrm); box(pos, col, 0, 1.2, 0.146, 0.16, 0.2, 0.01, hex(0xf2f2ee), nrm); } // 보라 조끼 + 흰 이름표(글자 없음)
  box(pos, col, -0.29, 1.14, 0.02, 0.11, 0.6, 0.13, T, nrm); box(pos, col, 0.29, 1.14, 0.02, 0.11, 0.6, 0.13, T, nrm);
  box(pos, col, 0, 1.64, 0, 0.25, 0.29, 0.25, S, nrm); box(pos, col, 0, 1.8, -0.02, 0.27, 0.07, 0.27, H, nrm);
  if (hairLong) { box(pos, col, 0, 1.62, -0.12, 0.29, 0.32, 0.06, H, nrm); box(pos, col, -0.135, 1.64, -0.02, 0.03, 0.26, 0.22, H, nrm); box(pos, col, 0.135, 1.64, -0.02, 0.03, 0.26, 0.22, H, nrm); }
  box(pos, col, -0.06, 1.67, 0.126, 0.03, 0.03, 0.005, hex(0x111111), nrm); box(pos, col, 0.06, 1.67, 0.126, 0.03, 0.03, 0.005, hex(0x111111), nrm); // 눈
  if (prop === 'stopwatch') { box(pos, col, 0.3, 0.88, 0.12, 0.1, 0.12, 0.04, hex(0xc8ccd2), nrm); box(pos, col, 0.3, 0.88, 0.142, 0.07, 0.08, 0.005, hex(0xf4f4f0), nrm); }
}
export function purpleCartParts(pos, col, nrm) { // 보라 대형 카트(길이 축 = 로컬 z, 손잡이 = +z) — 7일차 반기철 카트와 같은 색
  const P = hex(0x7a3fc0), D = hex(0x3a2160), K = hex(0x222222);
  box(pos, col, 0, 0.82, 0, 0.78, 0.6, 1.2, P, nrm); box(pos, col, 0, 0.5, 0, 0.72, 0.06, 1.12, D, nrm); box(pos, col, 0, 1.12, 0.66, 0.74, 0.06, 0.06, D, nrm);
  for (const [x, z] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) box(pos, col, x, 0.1, z, 0.12, 0.2, 0.12, K, nrm);
}

/**
 * 8·9일차 소품: 경쟁 마트 팀장(1) · 보라 조끼 직원 3 + 보라 카트 3(InstancedMesh 2) · 전단지 16(InstancedMesh 1) · 보라 시식 천막 · 전단지 재활용함 · 2주차 도장 카드(DOM).
 */
export function createDay8Props({ THREE, scene, keep, cartObj = null, isMobile = false }) {
  let boss = null, carts = null, crew = null, flyers = null, tent = null, bin = null, css = null, card = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  const lam = (o = {}) => keep(new THREE.MeshLambertMaterial({ vertexColors: true, ...o }));
  function buildBoss() { // 경쟁 마트 팀장: 50대 초반 여자 — 진보라 재킷 · 회색 바지 · 단발 · 스톱워치 (사람, 동물·마스코트 아님)
    const pos = [], col = [], nrm = [];
    personParts(pos, col, nrm, { legs: 0x55575e, top: 0x4b2a7a, hair: 0x2b2420, hairLong: true, prop: 'stopwatch', skin: 0xeec3a0 });
    box(pos, col, 0, 1.36, 0.135, 0.14, 0.26, 0.01, hex(0xe9e3f2), nrm); // 블라우스 깃
    const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), lam()); m.name = 'story-rivalboss'; return m;
  }
  function buildCrew() { const pos = [], col = [], nrm = []; personParts(pos, col, nrm, { legs: 0x2e3440, top: 0xe6e2ee, vest: 0x8a4fd0, hair: 0x1c1c1c }); const im = new THREE.InstancedMesh(geo(THREE, keep, pos, col, nrm), lam(), 3); im.name = 'story-purple-squad'; im.frustumCulled = false; return im; }
  function buildCarts() { const pos = [], col = [], nrm = []; purpleCartParts(pos, col, nrm); const im = new THREE.InstancedMesh(geo(THREE, keep, pos, col, nrm), lam({ emissive: 0x140820 }), 3); im.name = 'story-purple-convoy'; im.frustumCulled = false; return im; }
  function buildFlyers() {
    const g = keep(new THREE.PlaneGeometry(0.22, 0.31)); g.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(g, keep(new THREE.MeshLambertMaterial({ color: 0x9a5ee0, side: THREE.DoubleSide, emissive: 0x1a0830 })), E16.flyers); im.name = 'story-purple-flyers'; im.frustumCulled = false; return im;
  }
  function buildTent() { // 보라 시식 천막(매장 밖 보도) — 기둥 4 + 지붕 + 앞 테이블 (글자·로고 없음)
    const pos = [], col = [], nrm = [], P = hex(0x7a3fc0), W = hex(0xf2eefa), G = hex(0x9aa0a8);
    for (const [x, z] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]]) box(pos, col, x, 1.1, z, 0.06, 2.2, 0.06, G, nrm);
    box(pos, col, 0, 2.25, 0, 3.0, 0.12, 2.4, P, nrm); box(pos, col, 0, 2.42, 0, 2.2, 0.22, 1.6, P, nrm); for (let i = 0; i < 6; i++) box(pos, col, -1.25 + i * 0.5, 2.1, 1.21, 0.25, 0.18, 0.02, i % 2 ? W : P, nrm);
    box(pos, col, 0, 0.74, 0.8, 2.2, 0.06, 0.6, W, nrm); box(pos, col, 0, 0.37, 0.8, 2.1, 0.7, 0.5, P, nrm);
    const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), lam()); m.name = 'story-rival-tent'; return m;
  }
  function buildBin() { const pos = [], col = [], nrm = []; box(pos, col, 0, 0.4, 0, 0.5, 0.8, 0.4, hex(0x2c8a5a), nrm); box(pos, col, 0, 0.82, 0, 0.54, 0.05, 0.44, hex(0x8a4fd0), nrm); box(pos, col, 0, 0.55, 0.205, 0.3, 0.2, 0.01, hex(0xf2f2ee), nrm); const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), lam()); m.name = 'story-flyer-bin'; return m; }
  function ensureCss() {
    if (css || typeof document === 'undefined') return;
    css = document.createElement('style'); css.id = 'dp-d8-css';
    css.textContent = `#dp-d8c{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:60;pointer-events:none;background:#fffaf0;border:3px solid #1e5a45;border-radius:16px;padding:14px 18px 12px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:800 14px Pretendard,"Noto Sans KR",sans-serif;color:#1e5a45;text-align:center;animation:dpd8 .4s}
#dp-d8c h4{margin:0 0 8px;font:900 17px Pretendard,sans-serif}#dp-d8c .row{display:flex;gap:${isMobile ? 6 : 9}px;justify-content:center}#dp-d8c .row i{width:${isMobile ? 30 : 38}px;height:${isMobile ? 30 : 38}px;border-radius:50%;border:3px dashed #9bb8a8;display:block}#dp-d8c .row i.on{border:3px solid #d9a21a;background:radial-gradient(circle,#fff6c8,#f2c230)}#dp-d8c p{margin:8px 0 0;font-weight:700;color:#4d6b5d}
@keyframes dpd8{0%{transform:translate(-50%,-50%) scale(.6);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}`;
    document.head.appendChild(css);
  }
  const qT = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0);
  let crewMode = null; // null | 'parked' | 'convoy'
  const api = {
    /** 팀장: {x,z,yaw} · null 치움 */
    boss(p) { if (!p) { boss?.removeFromParent(); return; } boss ||= buildBoss(); if (!boss.parent) scene.add(boss); boss.position.set(p.x, 0, p.z); boss.rotation.y = p.yaw || 0; },
    bossPos: () => (boss?.parent ? { x: boss.position.x, z: boss.position.z } : null),
    /** 보라 조끼 직원 + 카트: 'parked' (입구 안쪽 한 줄) · 'convoy' (updateConvoy 로 움직임) · null 치움. hideLast: 3번 카트는 반기철(손님 NPC)이 밂 */
    squad(mode, at = null, hideLast = false) {
      crewMode = mode;
      if (!mode) { carts?.removeFromParent(); crew?.removeFromParent(); return; }
      carts ||= buildCarts(); crew ||= buildCrew(); if (!carts.parent) scene.add(carts, crew);
      crew.count = hideLast ? 2 : 3;
      if (mode === 'parked' && at) api.updateConvoy([0, 1, 2].map((i) => ({ x: at.x - 1.3 + i * 1.3, z: at.z + 2.4, dx: 0, dz: 1, yaw: 0 })));
    },
    get crewMode() { return crewMode; },
    /** cs: [{x,z,yaw}] — 카트 손잡이(+z 로컬) 뒤 0.75 m 에 직원 */
    updateConvoy(cs, walking = false) {
      if (!carts?.parent) return;
      const tt = performance.now() / 1000;
      cs.forEach((c, i) => {
        q.setFromAxisAngle(UP, c.yaw + Math.PI); m4.compose(v.set(c.x, 0, c.z), q, s1); carts.setMatrixAt(i, m4); // 카트 앞(-z 로컬)이 진행 방향
        const bx = c.x - Math.sin(c.yaw) * 1.25, bz = c.z - Math.cos(c.yaw) * 1.25;
        q.setFromAxisAngle(UP, c.yaw); m4.compose(v.set(bx, walking ? Math.abs(Math.sin(tt * 6 + i)) * 0.03 : 0, bz), q, s1); crew.setMatrixAt(i, m4);
      });
      carts.instanceMatrix.needsUpdate = true; crew.instanceMatrix.needsUpdate = true;
    },
    /** 전단지 그리기: F = createFlyers().F · null 치움 */
    flyers(F) {
      if (!F) { flyers?.removeFromParent(); return; }
      flyers ||= buildFlyers(); if (!flyers.parent) scene.add(flyers);
      if (cartObj) cartObj.updateMatrixWorld?.();
      for (const f of F) {
        if (f.state === 'cart' && cartObj) { const k = f.slot; m4.compose(v.set(((k * 37) % 9 - 4) * 0.07, 0.13 + (k % 3) * 0.012, ((k * 53) % 11 - 5) * 0.08), q.setFromAxisAngle(UP, k * 0.7), s1); m4.premultiply(cartObj.matrixWorld); flyers.setMatrixAt(f.i, m4); continue; }
        if (f.state === 'cart' || f.state === 'gone') { flyers.setMatrixAt(f.i, Z0); continue; }
        const tilt = f.state === 'floor' ? 0 : Math.sin(f.yaw * 1.7) * 0.6;
        q.setFromAxisAngle(UP, f.yaw); if (tilt) q.multiply(qT.setFromAxisAngle(AX, tilt));
        m4.compose(v.set(f.x, f.y, f.z), q, s1); flyers.setMatrixAt(f.i, m4);
      }
      flyers.instanceMatrix.needsUpdate = true;
    },
    tent(p) { if (!p) { tent?.removeFromParent(); return; } tent ||= buildTent(); if (!tent.parent) scene.add(tent); tent.position.set(p.x, 0, p.z); tent.rotation.y = 0; },
    bin(p) { if (!p) { bin?.removeFromParent(); return; } bin ||= buildBin(); if (!bin.parent) scene.add(bin); bin.position.set(p.x, 0, p.z); },
    /** 2주차 도장 카드 (2.8초) */
    stampCard(n = 0, ending = 'A') {
      if (typeof document === 'undefined') return; ensureCss(); card?.remove();
      card = document.createElement('div'); card.id = 'dp-d8c';
      card.innerHTML = `<h4>2주차 단골 도장 카드</h4><div class="row">${Array.from({ length: 7 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div><p>${ending === 'A' ? '1주차 금도장 카드는 액자에 넣었어요' : '8일차부터 새 카드 · 0/7'}</p>`;
      document.body.appendChild(card); const c = card; setTimeout(() => { c.remove(); if (card === c) card = null; }, 2800);
    },
    stats() { return { boss: !!boss?.parent, squad: crewMode, crew: crew?.parent ? crew.count : 0, carts: carts?.parent ? 3 : 0, flyers: !!flyers?.parent, tent: !!tent?.parent, bin: !!bin?.parent, card: !!card }; },
    clearStage() { api.boss(null); api.squad(null); },
    dispose() { api.clearStage(); api.flyers(null); api.tent(null); api.bin(null); card?.remove(); card = null; css?.remove(); css = null; },
  };
  return api;
}
