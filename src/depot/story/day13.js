// [depot-story] 13일차: E22 무대 설치(정밀 주차) — 판정·칸 상태(순수) + 칸 데칼(InstancedMesh 1) · 범콜라 팩(InstancedMesh 1) · 무대 판(메시 1) · 방송실 문(메시 1)
//   + 레시피 쪽지 그림(반쪽 13일차 / 두 쪽 14일차, 대화창 cutIn 캔버스).
//   내려놓기: 칸 1.1 m 안에서 0.15 m/s 이하로 1.5초 멈추면 카트의 범콜라(soda) 1팩을 그 칸에(되돌릴 수 없음). 맞음 = 0.6 m 안 && 방향 20° 안.
import { box, hex, geo } from './day6.js';

export const E22 = Object.freeze({ timeLimitSec: 180, slots: 4, tolM: 0.6, tolDeg: 20, holdSec: 1.5, maxSpeed: 0.15, zoneM: 1.1, item: 'soda' });
/** 카트 진행 방향(도) — 0 = +z(매장 안쪽). 카트 앞 = (-sin yaw, -cos yaw) */
export const cartHeadingDeg = (yaw) => Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) * 180 / Math.PI;
export const angDiff = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };
/** 판정 (events.json E22 judge) */
export function evalE22({ ok = 0, placed = 0, timeUp = false } = {}, t = E22) {
  if (placed === 0) return 'missed';
  if (timeUp && placed < t.slots) return 'fail';
  return ok >= t.slots ? 'success' : ok >= 2 ? 'partial' : 'fail';
}
/** 칸 상태 기계. slots: [{x,z,headingDeg}] · step(dt, {x,z,yaw,speed,packs}) → onEvent('place', i, ok) · ('hold', i, k) */
export function createParking({ slots = [], t = E22, onEvent = () => {} } = {}) {
  const P = slots.map((s, i) => ({ i, x: s.x, z: s.z, h: s.headingDeg || 0, filled: false, ok: false, d: 0, a: 0 }));
  const S = { placed: 0, ok: 0, hold: 0, at: -1, done: false };
  return {
    S, P,
    step(dt, o) {
      if (S.done) return S;
      let best = null, bd = t.zoneM;
      for (const p of P) { if (p.filled) continue; const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = p; } }
      if (!best || !(o.packs > 0) || o.speed > t.maxSpeed) { S.hold = 0; S.at = best ? best.i : -1; return S; }
      if (S.at !== best.i) { S.hold = 0; S.at = best.i; }
      S.hold += dt; onEvent('hold', best.i, Math.min(1, S.hold / t.holdSec));
      if (S.hold >= t.holdSec) {
        const a = angDiff(cartHeadingDeg(o.yaw), best.h); best.filled = true; best.d = bd; best.a = a; best.ok = bd <= t.tolM && a <= t.tolDeg;
        S.placed++; if (best.ok) S.ok++; S.hold = 0; onEvent('place', best.i, best.ok);
        if (S.placed >= P.length) S.done = true;
      }
      return S;
    },
  };
}

// ---------------------------------------------------------------- 3D·DOM (브라우저) ----------------------------------------------------------------
/** 칸 데칼: 노란 테두리 1.2×1.2 m + 화살표(+z) — 정점 색 */
function slotParts(pos, col, nrm) {
  const Y = hex(0xf2d21e), W = hex(0xfafafa), y = 0.012, h = 0.006;
  box(pos, col, 0, y, -0.6, 1.2, h, 0.06, Y, nrm); box(pos, col, 0, y, 0.6, 1.2, h, 0.06, Y, nrm); box(pos, col, -0.6, y, 0, 0.06, h, 1.2, Y, nrm); box(pos, col, 0.6, y, 0, 0.06, h, 1.2, Y, nrm);
  box(pos, col, 0, y, -0.1, 0.12, h, 0.6, W, nrm); box(pos, col, -0.1, y, 0.22, 0.12, h, 0.2, W, nrm); box(pos, col, 0.1, y, 0.22, 0.12, h, 0.2, W, nrm); box(pos, col, 0, y, 0.34, 0.14, h, 0.14, W, nrm);
}
/** 방송실 문: 앞벽에 붙은 문틀 + 반쯤 열린 문짝 + 틈 불빛 (로컬 원점 = 벽 앞 바닥, +z = 매장 안쪽) */
function doorParts(pos, col, nrm, open = 0.7) {
  const F = hex(0x4a4f57), D = hex(0x8e9aa6), L = hex(0xffe6a0), K = hex(0x222222);
  box(pos, col, -0.55, 1.1, 0.04, 0.08, 2.2, 0.08, F, nrm); box(pos, col, 0.55, 1.1, 0.04, 0.08, 2.2, 0.08, F, nrm); box(pos, col, 0, 2.22, 0.04, 1.18, 0.1, 0.08, F, nrm);
  box(pos, col, 0, 1.08, 0.01, 1.0, 2.12, 0.02, L, nrm); // 문 안쪽 불빛
  const c = Math.cos(open), s = Math.sin(open); // 경첩 x -0.5, 문짝 길이 1.0 — 회전된 상자 대신 4토막
  for (let k = 0; k < 4; k++) { const r = 0.125 + k * 0.25; box(pos, col, -0.5 + c * r, 1.08, 0.04 + s * r, 0.26 * Math.max(c, 0.3), 2.1, 0.26 * Math.max(s, 0.3), D, nrm); }
  box(pos, col, -0.5 + c * 0.85, 1.05, 0.06 + s * 0.85, 0.05, 0.05, 0.05, K, nrm); // 손잡이
  box(pos, col, 0, 2.5, 0.05, 0.9, 0.22, 0.04, hex(0xb71c1c), nrm); // ON AIR 표시(빨강)
}
export const DOOR_AT = Object.freeze({ x: 57.8, z: 0.32 }); // 앞벽(z 0.3) · 고객센터 창구(60.5) 서쪽 — 창구 앞 통로·출입문(65–73) 안 막음

export function createDay13Props({ THREE, scene, keep, look = null }) {
  let decals = null, packs = null, plank = null, door = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), e = new THREE.Euler();
  const lam = () => keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  function packGeo() {
    const L = look?.('soda'); if (L?.geo) return { g: L.geo, m: L.mat, h: 0.306, y0: 0.153 }; // 상품 상자 지오메트리는 가운데 원점
    const pos = [], col = [], nrm = []; box(pos, col, 0, 0.155, 0, 0.39, 0.31, 0.29, hex(0xb71c1c), nrm); return { g: geo(THREE, keep, pos, col, nrm), m: lam(), h: 0.31, y0: 0 };
  }
  const api = {
    /** 칸 데칼: P = [{x,z,h}] · null 치움 */
    slots(P) {
      if (!P) { decals?.removeFromParent(); return; }
      if (!decals) { const pos = [], col = [], nrm = []; slotParts(pos, col, nrm); decals = new THREE.InstancedMesh(geo(THREE, keep, pos, col, nrm), lam(), 4); decals.name = 'story-stage-slots'; decals.frustumCulled = false; decals.renderOrder = 1; }
      if (!decals.parent) scene.add(decals);
      decals.count = Math.min(4, P.length);
      P.slice(0, 4).forEach((p, i) => { q.setFromAxisAngle(UP, (p.h || 0) * Math.PI / 180); m4.compose(v.set(p.x, 0, p.z), q, sc); decals.setMatrixAt(i, m4); });
      decals.instanceMatrix.needsUpdate = true;
    },
    /** 범콜라 팩: P = [{x,z,filled,ok,a}] — 삐뚤면 기울여 놓음 · plank: 'level' | 'tilt' | null */
    packs(P, plankMode = null) {
      if (!P) { packs?.removeFromParent(); plank?.removeFromParent(); return; }
      if (!packs) { const G = packGeo(); packs = new THREE.InstancedMesh(G.g, G.m, 4); packs.name = 'story-stage-cola'; packs.frustumCulled = false; packs.userData.h = G.h; packs.userData.y0 = G.y0; }
      if (!packs.parent) scene.add(packs);
      let n = 0;
      for (const p of P) { if (!p.filled) continue; e.set(0, (p.ok ? 0 : (p.i % 2 ? 1 : -1) * Math.min(0.6, (p.a || 25) * Math.PI / 180)), 0); q.setFromEuler(e); m4.compose(v.set(p.x + (p.ok ? 0 : 0.18), packs.userData.y0, p.z + (p.ok ? 0 : -0.12)), q, sc); packs.setMatrixAt(n++, m4); }
      packs.count = n; packs.instanceMatrix.needsUpdate = true;
      if (!plankMode || n < 4) { plank?.removeFromParent(); return; }
      if (!plank) { const pos = [], col = [], nrm = []; box(pos, col, 0, 0, 0, 7.4, 0.08, 1.6, hex(0xc89a5a), nrm); box(pos, col, 0, 0.05, 0, 7.0, 0.02, 1.3, hex(0x7a3fc0), nrm); plank = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), lam()); plank.name = 'story-stage-plank'; }
      const cx = P.reduce((a, p) => a + p.x, 0) / P.length, cz = P.reduce((a, p) => a + p.z, 0) / P.length, y = (packs.userData.h || 0.31) + 0.04;
      plank.position.set(cx, y, cz); plank.rotation.set(0, 0, plankMode === 'tilt' ? 0.035 : 0); if (!plank.parent) scene.add(plank);
    },
    /** 방송실 문(반쯤 열림) */
    door(on) {
      if (!on) { door?.removeFromParent(); return; }
      if (!door) { const pos = [], col = [], nrm = []; doorParts(pos, col, nrm); door = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), lam()); door.name = 'story-pa-door'; door.position.set(DOOR_AT.x, 0, DOOR_AT.z); }
      if (!door.parent) scene.add(door);
    },
    stats: () => ({ slots: decals?.parent ? decals.count : 0, packs: packs?.parent ? packs.count : 0, plank: plank?.parent ? (plank.rotation.z ? 'tilt' : 'level') : null, door: !!door?.parent }),
    dispose() { api.slots(null); api.packs(null); api.door(null); },
  };
  return api;
}

/** 레시피 쪽지: 'half' = 오미숙의 반쪽(13일차) · 'full' = 두 쪽 맞춘 계란말이 카드(14일차) */
export function recipeCanvas(kind = 'half', w = 480, h = 320) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#2d2a26'; g.fillRect(0, 0, w, h);
  const paper = (x, y, pw, ph, rot, tint) => { g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate(rot); g.fillStyle = tint; g.fillRect(-pw / 2, -ph / 2, pw, ph); g.strokeStyle = 'rgba(120,90,40,.35)'; g.lineWidth = 2; g.strokeRect(-pw / 2 + 6, -ph / 2 + 6, pw - 12, ph - 12); g.restore(); };
  const egg = (cx, cy, r, half) => { g.save(); if (half) { g.beginPath(); g.rect(half < 0 ? cx - r * 1.5 : cx, cy - r * 1.5, r * 1.5, r * 3); g.clip(); } g.fillStyle = '#fffaf0'; g.beginPath(); g.ellipse(cx, cy, r * 1.25, r, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#7a5a2a'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#f2b51e'; g.beginPath(); g.arc(cx + r * 0.1, cy, r * 0.45, 0, Math.PI * 2); g.fill(); g.restore(); };
  g.font = '700 18px Pretendard, sans-serif'; g.fillStyle = '#5a4120';
  if (kind === 'half') {
    paper(w * 0.24, h * 0.12, w * 0.4, h * 0.76, -0.05, '#e9d9a8');
    egg(w * 0.64, h * 0.46, 46, -1); // 오른쪽 가장자리에서 끊긴 계란 반쪽
    g.fillText('국물 반 국자 —', w * 0.3, h * 0.78); g.fillStyle = 'rgba(122,63,192,.85)'; g.fillText('M.', w * 0.3, h * 0.24);
    g.strokeStyle = '#9a8a6a'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.64, h * 0.1); g.lineTo(w * 0.64, h * 0.9); g.stroke(); g.setLineDash([]);
  } else {
    paper(w * 0.12, h * 0.1, w * 0.38, h * 0.8, -0.03, '#e9d9a8'); paper(w * 0.5, h * 0.1, w * 0.38, h * 0.8, 0.02, '#efe2b8');
    egg(w * 0.5, h * 0.42, 50, 0);
    g.fillStyle = '#5a4120'; g.font = '800 22px Pretendard, sans-serif'; g.fillText('말순 분식 계란말이', w * 0.27, h * 0.76);
    g.font = '600 15px Pretendard, sans-serif'; g.fillText('범란 3알 · 국물 반 국자 · 약불', w * 0.28, h * 0.84);
  }
  return c;
}
