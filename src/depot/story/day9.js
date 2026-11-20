// [depot-story] 9일차 '할머니 대 시식 부대' — E17 떡볶이 수레 2호점(sample-wagon + slosh) · E18 반값 대신 장보기(handOver).
//   대본 day9-script.json(d9_023 E17 · d9_051 E18). 수레는 카트 앞 고리에 걸림(카트 질량 +40 kg = st.extraKg), 속도 판정은 E12, 출렁은 E13 급제동 + cart-bump.
//   그림 비용: 수레(솥·바퀴·고리, 정점 색 메시 1) · 국물 자국(원판 1, 넘쳤을 때만) · 입구 2호 시식대(메시 1) · 출렁 HUD(DOM).
//   순수 판정·상태(evalE17 · evalE18 · createWagon · handOverPick)는 DOM 없이 node 테스트(scripts/test-depot-day9.mjs).
import { box, hex, geo } from './day6.js';

export const E17 = Object.freeze({ timeoutSec: 180, speedLimit: 1.2, overGraceSec: 4, overFailSec: 8, spillAt: 3, wagonKg: 40, brakeDv: 0.5, brakeMinSpeed: 0.8, attachR: 2.0, attachMaxSpeed: 0.6, bumpGapSec: 0.8, sloshGapSec: 0.6, arriveMaxSpeed: 0.8 });
export const E18 = Object.freeze({ timeoutSec: 150, handOverR: 2.5, items: ['water', 'tissue', 'egg'] });
/** 수레를 거는 자리 (시식 코너 동쪽 통로 — 시식대 장애물 x 2.1–10.9, z 38.8–42.2 밖) · 2호 시식대(입구 안쪽, sample-corner-2 서쪽 옆) */
export const D9_SPOTS = Object.freeze({ wagon: { x: 11.4, z: 37.4 }, stand: { x: 62.9, z: 10.9 }, chairSpy: { x: 64.3, z: 37.6, yaw: Math.PI / 2 } });

/** E17 판정: 도착 && 출렁 ≤1 && 과속 ≤4초 성공 · 출렁 2 또는 과속 4~8초 부분 · 출렁 3 · 과속 >8초 · 180초 실패 · 안 걺 = 놓침 */
export function evalE17({ attached = false, arrived = false, slosh = 0, overSec = 0, timeUp = false } = {}, t = E17) {
  if (!attached) return 'missed';
  if (slosh >= t.spillAt || overSec > t.overFailSec) return 'fail';
  if (!arrived || timeUp) return 'fail';
  return slosh <= 1 && overSec <= t.overGraceSec ? 'success' : 'partial';
}
/** E18 판정: 세 개 && 알 0 성공 · 세 개 && 알 ≥1 부분 · 150초 안에 못 옴 실패 · 하나도 안 담음 = 놓침 */
export function evalE18({ have = 0, need = 3, eggs = 0, arrived = false, timeUp = false } = {}) {
  if (have >= need && arrived) return eggs > 0 ? 'partial' : 'success';
  if (timeUp || !arrived) return have > 0 ? 'fail' : 'missed';
  return 'fail';
}
/** handOver: 카트 속 상품 중 목록(id 마다 1개)만 고름 → 넘길 상품 배열 */
export function handOverPick(items, ids = E18.items) { const left = [...ids], out = []; for (const it of [...items].reverse()) { const k = left.indexOf(it.p?.id); if (k >= 0) { out.push(it); left.splice(k, 1); } } return out; }

/** 수레 상태: 걸기 → (0.25초 틱) 과속 누적 · 급제동 출렁 · 쿵 출렁 → 도착 */
export function createWagon({ t = E17 } = {}) {
  const S = { attached: false, arrived: false, spilled: false, slosh: 0, overSec: 0, lastSp: 0, lastSlosh: -9, lastBump: -9, warnT: 0, maxSpeed: 0, speed: 0 };
  function slosh(now) { if (!S.attached || S.arrived || S.spilled || now - S.lastSlosh < t.sloshGapSec) return 0; S.lastSlosh = now; S.slosh++; if (S.slosh >= t.spillAt) S.spilled = true; return S.slosh; }
  return {
    S,
    attach() { if (S.attached) return false; S.attached = true; return true; },
    /** 틱(dt ≈ 0.25초): sp = 카트 속도. 반환 {over: 경고 띄울 때, slosh: 이번 틱 출렁 번호(0 = 없음)} */
    tick(dt, sp, now) {
      const out = { over: false, slosh: 0 }; S.speed = sp;
      if (!S.attached || S.arrived || S.spilled) { S.lastSp = sp; return out; }
      S.maxSpeed = Math.max(S.maxSpeed, sp);
      if (sp > t.speedLimit + 0.02) { S.overSec += dt; S.warnT -= dt; if (S.warnT <= 0) { S.warnT = 3; out.over = true; } } else S.warnT = 0;
      const dv = S.lastSp - sp; if (dv > t.brakeDv && S.lastSp > t.brakeMinSpeed) out.slosh = slosh(now);
      S.lastSp = sp; return out;
    },
    /** cart-bump · 손님과 쿵 → 출렁 1 (0.8초 간격) */
    bump(now) { if (now - S.lastBump < t.bumpGapSec) return 0; S.lastBump = now; return slosh(now); },
    arrive() { if (!S.attached || S.spilled) return false; S.arrived = true; return true; },
    failed: () => S.spilled || S.overSec > t.overFailSec,
    result: (timeUp = false) => evalE17({ ...S, timeUp }, t),
  };
}

// ---------------------------------------------------------------- 3D·DOM (브라우저) ----------------------------------------------------------------
export function createDay9Props({ THREE, scene, keep, cartObj = null, isMobile = false }) {
  let wagon = null, puddle = null, stand = null, hud = null, css = null, where = null;
  const lam = () => keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  function buildWagon() { // 떡볶이 수레: 바퀴 달린 받침 + 스테인리스 솥(빨간 국물) + 앞 고리 막대 (로컬 +z = 카트 쪽)
    const pos = [], col = [], nrm = [], W = hex(0x8a5a2b), K = hex(0x222222), St = hex(0xc6cbd1), R = hex(0xd8352a), Y = hex(0xf2c230);
    box(pos, col, 0, 0.42, 0, 0.7, 0.06, 0.9, W, nrm); box(pos, col, 0, 0.26, 0, 0.62, 0.28, 0.06, W, nrm);
    for (const [x, z] of [[-0.3, -0.35], [0.3, -0.35], [-0.3, 0.35], [0.3, 0.35]]) box(pos, col, x, 0.1, z, 0.08, 0.2, 0.2, K, nrm);
    box(pos, col, 0, 0.66, 0, 0.56, 0.42, 0.56, St, nrm); box(pos, col, 0, 0.88, 0, 0.5, 0.02, 0.5, R, nrm); // 솥 + 국물
    for (let i = 0; i < 6; i++) box(pos, col, -0.15 + (i % 3) * 0.15, 0.9, -0.1 + (i >> 1 & 1) * 0.2, 0.1, 0.03, 0.03, hex(0xf6e7c8), nrm); // 떡
    box(pos, col, 0, 0.5, 0.62, 0.05, 0.05, 0.34, K, nrm); box(pos, col, 0, 0.45, 0.47, 0.72, 0.1, 0.03, Y, nrm); // 앞 고리 + 노란 띠
    const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), lam()); m.name = 'story-tteok-wagon'; return m;
  }
  function buildPuddle() { const g = keep(new THREE.CircleGeometry(0.9, 18)); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ color: 0xc8301f, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }))); m.name = 'story-soup-puddle'; return m; }
  function buildStand() { // 입구 2호 시식대: 범창고 초록 테이블 + 노란 띠 + 작은 간판 기둥(글자 없음)
    const pos = [], col = [], nrm = [], G = hex(0x1e5a45), Y = hex(0xf2c230), Wt = hex(0xe8e2d4);
    box(pos, col, 0, 0.42, 0, 1.4, 0.84, 0.6, G, nrm); box(pos, col, 0, 0.86, 0, 1.5, 0.05, 0.7, Wt, nrm); box(pos, col, 0, 0.7, 0.305, 1.4, 0.1, 0.01, Y, nrm);
    box(pos, col, -0.68, 1.4, -0.2, 0.05, 1.1, 0.05, hex(0x6c757b), nrm); box(pos, col, -0.68, 1.95, -0.2, 0.5, 0.3, 0.04, Y, nrm);
    for (let i = 0; i < 5; i++) box(pos, col, -0.4 + i * 0.2, 0.9, 0.1, 0.12, 0.03, 0.12, hex(0xffffff), nrm); // 시식 컵
    const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), lam()); m.name = 'story-sample-stand-2'; return m;
  }
  function ensureCss() {
    if (css || typeof document === 'undefined') return;
    css = document.createElement('style'); css.id = 'dp-d9-css';
    css.textContent = `#dp-d9{position:fixed;left:50%;transform:translateX(-50%);bottom:${isMobile ? 96 : 26}px;z-index:40;background:rgba(14,22,40,.86);color:#fff;border-radius:12px;padding:8px 13px;font:700 12.5px Pretendard,"Noto Sans KR",sans-serif;min-width:${isMobile ? 170 : 250}px;pointer-events:none;display:flex;gap:12px;align-items:center;justify-content:space-between}
#dp-d9 .s{display:flex;gap:5px}#dp-d9 .s i{width:16px;height:16px;border-radius:50%;border:2px solid #ffb39a;display:block}#dp-d9 .s i.on{background:#e0412f;border-color:#e0412f}#dp-d9 b.over{color:#ff7a6a}`;
    document.head.appendChild(css);
  }
  const api = {
    /** 수레: 'floor' {x,z,yaw} · 'cart' 카트 앞 고리 · 'stand' 2호 시식대 옆 · 'spilled' 그 자리 + 국물 자국 · null */
    wagon(state, p = D9_SPOTS.wagon) {
      where = state;
      if (!state) { wagon?.removeFromParent(); puddle?.removeFromParent(); return; }
      wagon ||= buildWagon();
      if (state === 'cart' && cartObj) { wagon.removeFromParent(); wagon.position.set(0, 0, -1.08); wagon.rotation.set(0, 0, 0); cartObj.add(wagon); puddle?.removeFromParent(); return; }
      if (state === 'spilled' && cartObj && wagon.parent === cartObj) { cartObj.updateMatrixWorld?.(); const w = wagon.getWorldPosition(new THREE.Vector3()); p = { x: w.x, z: w.z, yaw: 0 }; }
      wagon.removeFromParent(); wagon.position.set(p.x, 0, p.z); wagon.rotation.set(0, p.yaw || 0, state === 'spilled' ? 0.0 : 0); scene.add(wagon);
      if (state === 'spilled') { puddle ||= buildPuddle(); puddle.position.set(p.x, 0.012, p.z - 0.6); scene.add(puddle); } else puddle?.removeFromParent();
    },
    get wagonState() { return where; },
    stand(on) { if (!on) { stand?.removeFromParent(); return; } stand ||= buildStand(); if (!stand.parent) scene.add(stand); stand.position.set(D9_SPOTS.stand.x, 0, D9_SPOTS.stand.z); },
    /** 출렁 HUD — o: null · {slosh, spill, speed, limit, over} */
    hud(o) {
      if (typeof document === 'undefined') return;
      if (!o) { hud?.remove(); hud = null; return; }
      ensureCss(); if (!hud) { hud = document.createElement('div'); hud.id = 'dp-d9'; document.body.appendChild(hud); }
      hud.innerHTML = `<span>🍲 국물 출렁</span><span class="s">${Array.from({ length: o.spill || 3 }, (_, i) => `<i class="${i < o.slosh ? 'on' : ''}"></i>`).join('')}</span><b class="${o.speed > o.limit + 0.02 ? 'over' : ''}">${o.speed.toFixed(1)} / ${o.limit} m/s${o.over >= 0.5 ? ` · 과속 ${o.over.toFixed(1)}초` : ''}</b>`;
    },
    stats() { return { wagon: where, stand: !!stand?.parent, puddle: !!puddle?.parent, hud: !!hud }; },
    dispose() { api.wagon(null); api.stand(false); api.hud(null); css?.remove(); css = null; },
  };
  return api;
}
