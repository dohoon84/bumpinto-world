// [tower] OSM man_made=storage_tank 발자국 → 원통형 탱크(가늘고 긴 발자국 = 수평 탱크, 둥글거나 정사각 = 수직 탱크)
// 모든 탱크를 재질별로 병합해 몇 개의 드로우콜로 그린다.
import * as THREE from 'three';
import { TILE, scaleUV, merge, beamGeo, cylGeo } from './towerTextures.js';

// 최소 면적 외접 사각형(발자국 변 방향 기준)
export function footprintOBB(o) {
  let best = null;
  for (let i = 0; i < o.length; i++) {
    const [ax, az] = o[i], [bx, bz] = o[(i + 1) % o.length], L = Math.hypot(bx - ax, bz - az); if (L < 0.4) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L; let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const [x, z] of o) { const s = x * ux + z * uz, t = -x * uz + z * ux; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const A = (s1 - s0) * (t1 - t0);
    if (!best || A < best.A) { const sc = (s0 + s1) / 2, tc = (t0 + t1) / 2; best = { A, l: s1 - s0, w: t1 - t0, ux, uz, cx: sc * ux - tc * uz, cz: sc * uz + tc * ux }; }
  }
  if (best && best.w > best.l) { const { l, w, ux, uz } = best; Object.assign(best, { l: w, w: l, ux: -uz, uz: ux }); }
  return best;
}

export function classifyTank(b) {
  const r = footprintOBB(b.o); if (!r) return null;
  const n = b.o.length, round = n >= 12;
  if (!round && r.l / r.w > 1.8) { // 수평 탱크: 지름 = 폭(높이 태그가 있으면 그보다 크지 않게)
    const D = Math.min(r.w, b.s === 'height' ? b.h : Infinity);
    return { type: 'h', x: r.cx, z: r.cz, ux: r.ux, uz: r.uz, L: r.l, D };
  }
  const D = round ? (r.l + r.w) / 2 : Math.min(r.l, r.w);
  const H = b.s === 'height' ? b.h : Math.min(24, Math.max(6, D * 2.4, Math.min(b.h, D * 3.2)));
  return { type: 'v', x: r.cx, z: r.cz, D, H };
}

export function createTanks(tanks, mats) {
  const body = [], support = [], pipe = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const t of tanks) {
    if (t.type === 'v') {
      const R = t.D / 2, skirt = Math.min(1.5, t.H * 0.12), dome = R * 0.45, hb = Math.max(1, t.H - skirt - dome);
      const c = new THREE.CylinderGeometry(R, R, hb, 32, 1, true); c.translate(t.x, skirt + hb / 2, t.z);
      scaleUV(c, (Math.PI * t.D) / TILE.steelU, hb / TILE.steelV); body.push(c);
      const d = new THREE.SphereGeometry(R, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2); d.scale(1, dome / R, 1); d.translate(t.x, skirt + hb, t.z);
      scaleUV(d, (Math.PI * t.D) / TILE.steelU, 0.5); body.push(d);
      const sk = new THREE.CylinderGeometry(R * 0.96, R * 1.02, skirt, 24); sk.translate(t.x, skirt / 2, t.z); support.push(sk);
      for (const k of [0.33, 0.66]) { const ring = new THREE.TorusGeometry(R + 0.03, Math.max(0.04, R * 0.025), 4, 32); ring.rotateX(Math.PI / 2); ring.translate(t.x, skirt + hb * k, t.z); support.push(ring); }
      if (t.D > 2) pipe.push(cylGeo(V(t.x + R + 0.25, 0.2, t.z), V(t.x + R + 0.25, skirt + hb + dome * 0.5, t.z), Math.max(0.08, R * 0.05), 6));
    } else {
      const R = t.D / 2, cap = R * 0.55, Lb = Math.max(1, t.L - 2 * cap), yc = 0.7 + R;
      const ang = Math.atan2(t.uz, t.ux), q = new THREE.Matrix4().makeRotationY(-ang), m = new THREE.Matrix4();
      const place = (g) => { g.applyMatrix4(q); g.translate(t.x, 0, t.z); return g; };
      const c = new THREE.CylinderGeometry(R, R, Lb, 32, 1, true); c.rotateZ(Math.PI / 2); c.translate(0, yc, 0);
      scaleUV(c, (Math.PI * t.D) / TILE.steelU, Lb / TILE.steelV); body.push(place(c));
      for (const s of [-1, 1]) {
        const d = new THREE.SphereGeometry(R, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2); d.scale(1, cap / R, 1);
        d.applyMatrix4(m.makeRotationZ(-s * Math.PI / 2)); d.translate(s * Lb / 2, yc, 0); scaleUV(d, (Math.PI * t.D) / TILE.steelU, 0.5); body.push(place(d));
      }
      const ns = Math.max(2, Math.round(Lb / 9));
      for (let i = 0; i < ns; i++) { // 새들 받침
        const x = -Lb / 2 + 1.2 + (i * (Lb - 2.4)) / (ns - 1);
        support.push(place(beamGeo(V(x, 0, 0), V(x, yc - R * 0.55, 0), 0.6, t.D * 0.85)));
        support.push(place(beamGeo(V(x, 0, 0), V(x, 0.25, 0), 1.2, t.D * 1.0)));
      }
      for (let x = -Lb / 2 + 3; x < Lb / 2 - 2; x += 6) { const ring = new THREE.TorusGeometry(R + 0.02, 0.05, 4, 32); ring.rotateY(Math.PI / 2); ring.translate(x, yc, 0); support.push(place(ring)); }
      // 끝단 배관: 캡 위 → 지면
      const e = Lb / 2 + cap * 0.5;
      pipe.push(place(cylGeo(V(e, yc + R * 0.6, 0), V(e + 0.9, yc + R * 0.6, 0), 0.12, 6)), place(cylGeo(V(e + 0.9, 0.1, 0), V(e + 0.9, yc + R * 0.6, 0), 0.12, 6)));
      pipe.push(place(cylGeo(V(-Lb / 2, yc + R + 0.15, 0), V(Lb / 2, yc + R + 0.15, 0), 0.1, 6))); // 상부 계장 라인
    }
  }
  const g = new THREE.Group(); g.name = 'tanks';
  for (const [list, mat] of [[body, mats.tank], [support, mats.tankSupport], [pipe, mats.pipe]]) {
    const geo = merge(list); if (!geo) continue; const mm = new THREE.Mesh(geo, mat); mm.castShadow = true; mm.receiveShadow = true; g.add(mm);
  }
  return g;
}
