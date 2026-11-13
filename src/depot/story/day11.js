// [depot-story] 11일차: E20 카트 열차 정리 — 판정(순수) + 열차(따라오는 줄, 순수) + 범창고 카트 5대(InstancedMesh 1).
//   열차는 내 손잡이 뒤(hitch = 플레이어 뒤 0.45 m)가 지나간 길(trail)을 그대로 따라감 → 모퉁이를 안 깎음. 뒤로 밀면 줄이 뒤로 밀림.
//   끼우기: 열차 꼬리(없으면 hitch)가 세워 둔 카트 0.8 m(+반 길이) 안 · 1.0 m/s 이하. 끊김: 1.2 m/s 넘게 초당 70° 넘게 0.2초 → 맨 뒤 칸이 그 자리에 섬.
import { box, hex, geo } from './day6.js';

export const E20 = Object.freeze({ timeLimitSec: 120, startWithinSec: 60, carts: 5, cartKg: 18, linkR: 0.8, linkMaxSpeed: 1.0, breakDegPerSec: 70, breakMinSpeed: 1.2, breakHoldSec: 0.2, breakCoolSec: 1.5, hitchM: 0.45, firstM: 0.7, gapM: 0.95, halfLen: 0.48, carR: 0.3, hitGapSec: 1.0 });

/** 판정 (events.json E20 judge) — 5대인데 끊김 2+ 또는 매대 3+ 은 '부분'으로 봄(표에 없는 칸, README 기본값) */
export function evalE20({ arrived = false, linked = 0, breaks = 0, rackHits = 0, engaged = true } = {}, t = E20) {
  if (!engaged) return 'missed';
  if (!arrived) return 'fail';
  if (linked >= t.carts) return breaks === 0 && rackHits === 0 ? 'success' : 'partial';
  return linked === t.carts - 1 ? 'partial' : 'fail';
}
/** 세워 둔 카트 방향: 통로(z 14–41) 안은 통로 따라(z), 교차 통로·앞쪽 띠는 x 방향 */
export const strayYaw = (p) => (p.z > 14 && p.z < 41 ? 0 : Math.PI / 2);
/** 축 맞춘 카트 사각형 (yaw 0 = 길이 축 z) */
export function strayRect(c, t = E20) { const alongZ = Math.abs(Math.cos(c.yaw)) > 0.7, hl = t.halfLen, hw = 0.3; return alongZ ? { x0: c.x - hw, x1: c.x + hw, z0: c.z - hl, z1: c.z + hl } : { x0: c.x - hl, x1: c.x + hl, z0: c.z - hw, z1: c.z + hw }; }

function along(tr, s) { // 길(머리부터)에서 거리 s 의 점 + 머리 쪽 방향
  let acc = 0;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i], L = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + L >= s && L > 1e-6) { const k = (s - acc) / L; return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (a.x - b.x) / L, dz: (a.z - b.z) / L }; }
    acc += L;
  }
  const a = tr[tr.length - 2] || tr[0], b = tr[tr.length - 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: b.x, z: b.z, dx: (a.x - b.x) / L || 0, dz: (a.z - b.z) / L || 1 };
}
const trailLen = (tr) => { let s = 0; for (let i = 1; i < tr.length; i++) s += Math.hypot(tr[i].x - tr[i - 1].x, tr[i].z - tr[i - 1].z); return s; };

/**
 * 열차 상태 기계. strays: [{x,z,yaw}] · step(dt, {x,z,yaw,speed,held}, now) — x,z,yaw = 플레이어(손잡이 뒤가 hitch), yaw = 카트 yaw(앞 = -sin,-cos).
 *   isBlocked(x,z,r): 고정 장애물(랙·벽)에 닿나 → rackHits. 이벤트: link(i) · break(i) · rack(i)
 */
export function createTrain({ strays = [], t = E20, isBlocked = () => false, onEvent = () => {} } = {}) {
  const C = strays.map((p, i) => ({ i, x: p.x, z: p.z, yaw: p.yaw ?? strayYaw(p), state: 'stray', touch: false, lastHit: -99 }));
  const S = { linked: [], breaks: 0, rackHits: 0, engaged: false, brkT: 0, lastBreak: -99, kg: 0 };
  let trail = [];
  const need = () => t.firstM + Math.max(0, S.linked.length - 1) * t.gapM + t.halfLen + 0.6;
  function tail(h, fx, fz) { if (!S.linked.length) return { ...h, dx: fx, dz: fz }; const c = C[S.linked[S.linked.length - 1]], dx = Math.sin(c.yaw), dz = Math.cos(c.yaw); return { x: c.x - dx * t.halfLen, z: c.z - dz * t.halfLen, dx, dz }; } // 칸 yaw: (sin, cos) = 머리 쪽
  function place() {
    S.linked.forEach((ci, k) => { const p = along(trail, t.firstM + k * t.gapM); const c = C[ci]; c.x = p.x; c.z = p.z; c.yaw = Math.atan2(p.dx, p.dz); });
  }
  return {
    S, C, get trail() { return trail; },
    step(dt, o, tNow = 0) {
      if (!o?.held) { S.brkT = 0; return S; }
      const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw), h = { x: o.x - fx * t.hitchM, z: o.z - fz * t.hitchM };
      if (!trail.length) trail = [h, { x: h.x - fx * 0.01, z: h.z - fz * 0.01 }];
      // 길 갱신: 앞으로 가면 머리에 점 추가, 뒤로 밀면 머리 점을 먹고 꼬리를 같은 거리만큼 뒤로 늘림
      const h0 = trail[0], h1 = trail[1], mv = Math.hypot(h.x - h0.x, h.z - h0.z);
      const back = h1 && ((h.x - h0.x) * (h0.x - h1.x) + (h.z - h0.z) * (h0.z - h1.z)) < 0;
      if (back && trail.length >= 2) {
        let eat = mv; trail[0] = h;
        while (trail.length > 2 && Math.hypot(trail[1].x - h.x, trail[1].z - h.z) < 0.05) trail.splice(1, 1);
        const a = trail[trail.length - 2], b = trail[trail.length - 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        trail[trail.length - 1] = { x: b.x + (b.x - a.x) / L * eat, z: b.z + (b.z - a.z) / L * eat }; eat = 0;
      } else if (mv > 0.08) trail.unshift(h); else trail[0] = h;
      // 길이 자르기
      let acc = 0; for (let i = 1; i < trail.length; i++) { acc += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].z - trail[i - 1].z); if (acc > need() + 1.5) { trail.length = i + 1; break; } }
      place();
      // 끼우기
      const tp = tail(h, fx, fz);
      for (const c of C) {
        if (c.state !== 'stray' || S.linked.length >= t.carts) continue;
        if (o.speed <= t.linkMaxSpeed && Math.hypot(c.x - tp.x, c.z - tp.z) <= t.linkR + t.halfLen && (c.x - tp.x) * tp.dx + (c.z - tp.z) * tp.dz <= 0.25) { // 꼬리 뒤쪽만
          // 길 꼬리를 이 카트 쪽으로 이어 붙임 → 순간이동 없이 줄에 들어옴
          const end = trail[trail.length - 1], cx = c.x, cz = c.z;
          if (trailLen(trail) < need()) trail.push({ x: cx, z: cz });
          const dx = cx - end.x, dz = cz - end.z, L = Math.hypot(dx, dz) || 1; trail.push({ x: cx + dx / L * (t.gapM + 0.6), z: cz + dz / L * (t.gapM + 0.6) });
          c.state = 'linked'; S.linked.push(c.i); S.engaged = true; S.kg = S.linked.length * t.cartKg; place(); onEvent('link', c.i); break;
        }
      }
      // 끊김: 빠른데 급하게 꺾음
      if (S.linked.length && o.speed > t.breakMinSpeed && Math.abs(o.yawRate || 0) > t.breakDegPerSec) S.brkT += dt; else S.brkT = 0;
      if (S.brkT >= t.breakHoldSec && tNow - S.lastBreak > t.breakCoolSec) {
        S.brkT = 0; S.lastBreak = tNow; const ci = S.linked.pop(); const c = C[ci]; c.state = 'stray'; S.breaks++; S.kg = S.linked.length * t.cartKg; onEvent('break', ci);
      }
      // 매대·벽 충돌(칸마다 새로 닿을 때 1번)
      for (const ci of S.linked) { const c = C[ci], on = !!isBlocked(c.x, c.z, t.carR); if (on && !c.touch && tNow - c.lastHit > t.hitGapSec) { c.lastHit = tNow; S.rackHits++; onEvent('rack', ci); } c.touch = on; }
      return S;
    },
    nearestStray(x, z) { let b = null, bd = 1e9; for (const c of C) if (c.state === 'stray') { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; b = c; } } return b; },
    /** 도착 후: 열차 칸을 보관소 줄로 */
    park(at) { C.forEach((c, k) => { c.state = 'parked'; c.x = at.x - 1.6 + k * 0.8; c.z = at.z; c.yaw = 0; }); S.linked.length = 0; trail = []; },
  };
}

/** 범창고 카트(정점 색, 길이 축 = 로컬 z, 손잡이 = -z) — 회색 바구니 + 초록 손잡이 */
export function storeCartParts(pos, col, nrm) {
  const G = hex(0xb9c0c8), D = hex(0x7d858e), H = hex(0x2c8a5a), K = hex(0x222222);
  box(pos, col, 0, 0.78, 0.04, 0.56, 0.42, 0.82, G, nrm); box(pos, col, 0, 0.58, 0.04, 0.5, 0.04, 0.78, D, nrm); box(pos, col, 0, 0.3, 0, 0.5, 0.04, 0.86, D, nrm);
  box(pos, col, 0, 1.02, -0.44, 0.58, 0.06, 0.06, H, nrm); box(pos, col, -0.27, 0.86, -0.42, 0.03, 0.3, 0.03, D, nrm); box(pos, col, 0.27, 0.86, -0.42, 0.03, 0.3, 0.03, D, nrm);
  for (const [x, z] of [[-0.22, -0.36], [0.22, -0.36], [-0.22, 0.38], [0.22, 0.38]]) box(pos, col, x, 0.07, z, 0.08, 0.14, 0.08, K, nrm);
}
export function createDay11Props({ THREE, scene, keep }) {
  let im = null, n = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  function build() { const pos = [], col = [], nrm = []; storeCartParts(pos, col, nrm); const m = new THREE.InstancedMesh(geo(THREE, keep, pos, col, nrm), keep(new THREE.MeshLambertMaterial({ vertexColors: true })), E20.carts); m.name = 'story-cart-train'; m.frustumCulled = false; return m; }
  const api = {
    /** 카트들: C = [{x,z,yaw}] (yaw: 머리 쪽 (sin,cos)) · null 치움 */
    carts(C) {
      if (!C) { im?.removeFromParent(); n = 0; return; }
      im ||= build(); if (!im.parent) scene.add(im);
      n = Math.min(E20.carts, C.length); im.count = n;
      for (let i = 0; i < n; i++) { const c = C[i]; q.setFromAxisAngle(UP, c.yaw + Math.PI); m4.compose(v.set(c.x, 0, c.z), q, s1); im.setMatrixAt(i, m4); } // 손잡이(-z 로컬)가 머리 쪽
      im.instanceMatrix.needsUpdate = true;
    },
    stats: () => ({ carts: im?.parent ? n : 0 }),
    dispose() { api.carts(null); },
  };
  return api;
}
