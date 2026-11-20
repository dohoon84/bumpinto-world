// [gentle-monster] 걷기: 바닥 높이(층·경사·구멍) + 충돌(AABB·원·선분) + 3인칭 카메라(실내에서 벽에 박히지 않게 당긴다)
import * as THREE from 'three';
import { pointInPoly } from './shell.js';

const R = 0.32; // 플레이어 반지름
const STEP_UP = 0.46, DROP = 1.1;

export function createWorldPhysics({ regions, colliders, circles = [], segments = [], bounds = 118 }) {
  const aabbs = colliders.filter((c) => c.t === 'a');
  circles = [...circles];
  /** (x,z) 에서 cur 높이 근처에 선 수 있는 가장 높은 면 → y 또는 null */
  function support(x, z, cur) {
    let best = null;
    for (const r of regions) {
      let y = null;
      if (r.t === 'F') {
        if (!pointInPoly(r.poly, x, z)) continue;
        let hole = false; for (const h of r.holes) if (x > h[0] && x < h[1] && z > h[2] && z < h[3]) { hole = true; break; }
        if (hole) continue; y = r.y;
      } else if (r.t === 'f') { if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue; y = r.y; }
      else if (r.t === 'r') { if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue; const t = (z - r.z0) / (r.z1 - r.z0); y = r.y0 + (r.y1 - r.y0) * t; }
      else if (r.t === 'O') { if (Math.abs(x) > bounds || Math.abs(z) > bounds) continue; y = r.y; }
      if (y == null) continue;
      if (y <= cur + STEP_UP && y >= cur - DROP && (best == null || y > best)) best = y;
    }
    return best;
  }
  function blocked(x, z, y) {
    for (const c of aabbs) {
      if (y < c.y0 || y > c.y1 - 0.2) continue;
      if (x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R) {
        // 둥근 모서리: 박스 바깥 모서리는 원으로
        const cx = Math.max(c.x0, Math.min(x, c.x1)), cz = Math.max(c.z0, Math.min(z, c.z1));
        if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return true;
      }
    }
    for (const c of circles) { if (y < c.y0 || y > c.y1 - 0.2) continue; if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + R) ** 2) return true; }
    for (const s of segments) {
      if (y < s.y0 - 0.1 || y > s.y1 - 0.2) continue;
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1, l2 = dx * dx + dz * dz || 1;
      let t = ((x - s.x1) * dx + (z - s.z1) * dz) / l2; t = Math.max(0, Math.min(1, t));
      const px = s.x1 + dx * t, pz = s.z1 + dz * t; if ((x - px) ** 2 + (z - pz) ** 2 < (R + 0.05) ** 2) return true;
    }
    return false;
  }
  function tryMove(p, dx, dz) {
    const tryAt = (nx, nz) => { const y = support(nx, nz, p.y); if (y == null) return false; if (blocked(nx, nz, p.y)) return false; p.x = nx; p.z = nz; p.y = y; return true; };
    if (tryAt(p.x + dx, p.z + dz)) return true;
    if (dx !== 0 && tryAt(p.x + dx, p.z)) return true;
    if (dz !== 0 && tryAt(p.x, p.z + dz)) return true;
    return false;
  }
  /** 카메라 빈 공간 검사: 점이 벽·기둥·천장 안인가 */
  function camBlocked(x, y, z, ceilY) {
    if (ceilY != null && y > ceilY - 0.15) return true;
    for (const c of aabbs) { if (y < c.y0 + 0.1 || y > c.y1) continue; if (x > c.x0 - 0.2 && x < c.x1 + 0.2 && z > c.z0 - 0.2 && z < c.z1 + 0.2) return true; }
    for (const c of circles) { if (y < c.y0 || y > c.y1) continue; if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.15) ** 2) return true; }
    return false;
  }
  const addColliders = (a = [], c = []) => { for (const x of a) if (x.t === 'a') aabbs.push(x); circles.push(...c); };
  return { support, blocked, tryMove, camBlocked, addColliders };
}

export function createWalker({ physics, avatar, camera, start, ceilingAt }) {
  const p = { x: start.x, z: start.z, y: physics.support(start.x, start.z, 0.5) ?? 0.03 };
  const st = { yaw: (start.yaw ?? 0) + Math.PI, camYaw: start.yaw ?? 0, pitch: 0.16, dist: 5.2, dMax: 5.2, speed: 0, moving: false };
  const keys = new Set(); const stick = { x: 0, y: 0 };
  const onKey = (e, d) => { const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { if (d) keys.add(k); else keys.delete(k); if (k.startsWith('arrow')) e.preventDefault(); } };
  addEventListener('keydown', (e) => onKey(e, true)); addEventListener('keyup', (e) => onKey(e, false)); addEventListener('blur', () => keys.clear());
  const tmp = new THREE.Vector3();
  function update(dt) {
    let mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + stick.x;
    let mz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + stick.y;
    const mag = Math.hypot(mx, mz); st.moving = mag > 0.08;
    if (st.moving) {
      mx /= Math.max(1, mag); mz /= Math.max(1, mag);
      const sp = (keys.has('shift') || mag > 1.6 ? 5.6 : 3.2) * Math.min(1, mag);
      const cy = st.camYaw, c = Math.cos(cy), s = Math.sin(cy);
      // 카메라가 -forward 쪽에 있다: 앞 = (-sin, -cos)
      const wx = mx * c + mz * s, wz = -mx * s + mz * c;
      const dx = wx * sp * dt, dz = wz * sp * dt;
      physics.tryMove(p, dx, dz);
      const target = Math.atan2(wx, wz); let d = target - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); st.yaw += d * Math.min(1, dt * 12);
      st.speed = sp;
    } else st.speed = 0;
    avatar.position.set(p.x, p.y, p.z); avatar.rotation.y = st.yaw;
    // 카메라
    const ceilY = ceilingAt ? ceilingAt(p.x, p.z, p.y) : null;
    const tx = p.x, ty = p.y + 1.45, tz = p.z;
    const cp = Math.cos(st.pitch), sp2 = Math.sin(st.pitch);
    const dirx = Math.sin(st.camYaw) * cp, diry = sp2, dirz = Math.cos(st.camYaw) * cp;
    let d = st.dist, ok = 0.35;
    for (let t = 0.35; t <= d; t += 0.2) { if (physics.camBlocked(tx + dirx * t, ty + diry * t, tz + dirz * t, ceilY)) break; ok = t; }
    d = Math.min(d, ok);
    st.dEff = d;
    camera.position.set(tx + dirx * d, ty + diry * d, tz + dirz * d);
    tmp.set(tx, ty - 0.1, tz); camera.lookAt(tmp);
    avatar.visible = d > 0.8 && !st.hide;
  }
  return { p, st, update, keys, stick, teleport(o) { if (o.x != null) { p.x = o.x; p.z = o.z; p.y = physics.support(o.x, o.z, o.y ?? 0.5) ?? (o.y ?? 0.03); } if (o.yaw != null) { st.camYaw = o.yaw; st.yaw = o.faceYaw ?? (o.yaw + Math.PI); } if (o.pitch != null) st.pitch = o.pitch; if (o.dist != null) { st.dist = o.dist; st.dMax = o.dist; } } };
}
