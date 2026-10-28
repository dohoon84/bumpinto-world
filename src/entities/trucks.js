// [truck] 주차된 'Steel Truck' 들 + 탑승/운전/하차 + (가능하면) 멀티플레이 동기화
//   ?trucks=N (기본 20, 0=끔)  ?truckColors=stainless,black,red,...  F 키: 탑승/하차
import * as THREE from 'three';
import { createTruck, setBrake, DIM, COLORS } from './truckModel.js';

const DRIVE_KINDS = new Set(['secondary', 'tertiary', 'residential', 'service', 'unclassified', 'primary', 'trunk']);
const MAX_V = 100 / 3.6, BOOST_V = 130 / 3.6, REV_V = 25 / 3.6;
const HL = DIM.L / 2, HW = DIM.W / 2;
// 차체 외곽 샘플 점(로컬 x,z) — 건물 충돌 판정용
const HULL = [];
for (const z of [-HL, -HL / 2, 0, HL / 2, HL]) for (const x of [-HW, HW]) HULL.push([x, z]);
HULL.push([0, HL], [0, -HL]);

function pointInRing(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }

export function createTrucks({ scene, overlay, world, data, params, camera, cam, player, renderer, terrain, presence, remotes, spawn }) {
  const N = Math.max(0, Math.min(60, Number(params.get('trucks') ?? 20) || 0));
  if (!N) return null;
  const keys = (params.get('truckColors') || '').split(',').map((s) => s.trim()).filter((k) => COLORS[k]);
  const palette = keys.length ? keys : ['stainless', 'black', 'white', 'red', 'blue', 'green', 'tan', 'orange'];
  const me = { truck: null, near: null, saved: null, lastYawInput: -10, t: 0 };
  const baseBlocked = world.isBlocked; // 트럭 자체는 제외한 건물 충돌
  const ground = (x, z, ref = 0) => (terrain ? terrain.getGroundHeight(x, z, ref) : 0);
  const inWater = (x, z) => (data.water || []).some((w) => pointInRing(x, z, w.o));

  // ---------- 배치: 앵커(도착지점·마을·빌드사이트·발사장) 근처 차도 가장자리에 평행 주차 ----------
  const L = (n) => data.labels.find((l) => l.text === n);
  const anchor = (n, cnt, avoid = []) => { const l = L(n); return l ? { x: l.x, z: l.z, cnt, avoid } : null; };
  const t1 = L('Starbase Integration Tower 1'), t2 = L('Starbase Integration Tower 2');
  const pad = [t1, t2].filter(Boolean).map((t) => ({ x: t.x, z: t.z, r: 70 })); // 발사대/화염 구역은 피함
  const anchors = [
    { x: spawn.x, z: spawn.z, cnt: 4, avoid: [] },
    anchor('Astropub', 3), anchor('Starbase City Hall', 2),
    anchor('Starfactory', 3), anchor('Gigabay', 2),
    anchor('Starhopper', 3, pad), anchor('Pad 2', 2, pad), anchor('Starbase Integration Tower 1', 1, pad),
  ].filter(Boolean);
  const placed = [];
  const fits = (x, z, h, margin = 0.6) => {
    const c = Math.cos(h), s = Math.sin(h);
    for (const [lx, lz] of [[-HW - margin, -HL - margin], [HW + margin, -HL - margin], [-HW - margin, HL + margin], [HW + margin, HL + margin], [-HW - margin, 0], [HW + margin, 0], [0, 0]]) {
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      if (baseBlocked(wx, wz, 0.2) || inWater(wx, wz)) return false;
    }
    return true;
  };
  const candidates = (a) => {
    const out = [];
    for (const r of data.roads) {
      if (!DRIVE_KINDS.has(r.k)) continue;
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], len = Math.hypot(bx - ax, bz - az); if (len < 8) continue;
        const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
        for (let t = 4; t < len - 4; t += 7.5) {
          const cx = ax + ux * t, cz = az + uz * t, d = Math.hypot(cx - a.x, cz - a.z); if (d > 260) continue;
          for (const sd of [1, -1]) {
            const off = r.w >= 7 ? r.w / 2 - 1.25 : r.w / 2 + 1.4; // 넓은 도로는 갓길 안쪽, 좁은 길은 길 옆
            out.push({ x: cx + nx * off * sd, z: cz + nz * off * sd, h: Math.atan2(ux, uz) + (sd < 0 ? Math.PI : 0), d: d + (sd < 0 ? 0.5 : 0) });
          }
        }
      }
    }
    return out.sort((p, q) => p.d - q.d);
  };
  for (const a of anchors) {
    let n = 0;
    for (const c of candidates(a)) {
      if (n >= a.cnt || placed.length >= N) break;
      if (Math.hypot(c.x - spawn.x, c.z - spawn.z) < 6) continue;
      if (a.avoid.some((p) => Math.hypot(c.x - p.x, c.z - p.z) < p.r)) continue;
      if (placed.some((p) => Math.hypot(c.x - p.x, c.z - p.z) < (n === 0 ? 14 : 8))) continue;
      if (!fits(c.x, c.z, c.h)) continue;
      placed.push(c); n++;
    }
  }
  // 남는 수는 정자역(도착지) 주변 도로에 계속 채움
  if (placed.length < N) for (const c of candidates({ x: spawn.x, z: spawn.z })) {
    if (placed.length >= N) break;
    if (Math.hypot(c.x - spawn.x, c.z - spawn.z) < 6 || placed.some((p) => Math.hypot(c.x - p.x, c.z - p.z) < 8) || !fits(c.x, c.z, c.h)) continue;
    placed.push(c);
  }

  const list = placed.map((p, i) => {
    const color = palette[i % palette.length], mesh = createTruck(color, renderer);
    const y = ground(p.x, p.z);
    mesh.position.set(p.x, y, p.z); mesh.rotation.y = p.h; scene.add(mesh);
    const tr = { id: i, color, mesh, x: p.x, z: p.z, y, h: p.h, v: 0, steer: 0, spin: 0, pitch: 0, driver: null, remote: null, home: { ...p } };
    tr.label = overlay.add({ cls: 'label truck', text: '🛻 Steel Truck · ' + COLORS[color].name, getPos: () => tmpV.set(tr.x, tr.y + 2.35, tr.z), maxDist: 45, minDist: 6 });
    return tr;
  });
  const tmpV = new THREE.Vector3();

  // 트럭끼리/플레이어와의 충돌: 차체를 앞뒤 원 3개로 근사
  const circles = (tr, x = tr.x, z = tr.z, h = tr.h) => { const s = Math.sin(h), c = Math.cos(h); return [-1.9, 0, 1.9].map((o) => [x + s * o, z + c * o]); };
  const hitTruck = (x, z, r, skip = null) => { for (const t of list) { if (t === skip || Math.abs(t.x - x) > 5 || Math.abs(t.z - z) > 5) continue; for (const [cx, cz] of circles(t)) if (Math.hypot(cx - x, cz - z) < 1.05 + r) return t; } return null; };
  // 걷는 플레이어/NPC 도 주차된 트럭을 통과하지 않도록 world.isBlocked 확장 (탑승 중인 트럭은 플레이어가 그 위치에 있으므로 제외)
  world.isBlocked = (x, z, r = 0.35) => baseBlocked(x, z, r) || !!hitTruck(x, z, r, me.truck);

  // ---------- UI ----------
  const css = document.createElement('style');
  css.textContent = `.label.truck{font-size:11px;font-weight:600;background:rgba(255,255,255,.72)}
#trk-prompt{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);display:none;font:600 14px system-ui,sans-serif;color:#fff;background:rgba(20,28,40,.82);padding:8px 14px;border-radius:12px;border:0;cursor:pointer;z-index:7;box-shadow:0 2px 10px #0004}
#trk-prompt kbd{background:#fff;color:#222;border-radius:4px;padding:0 6px;margin-right:6px;font:700 13px system-ui}
#trk-hud{position:fixed;right:236px;bottom:18px;display:none;text-align:right;color:#fff;background:rgba(15,23,36,.84);padding:10px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);font-family:system-ui,sans-serif;text-shadow:0 1px 4px #0009;box-shadow:0 4px 16px rgba(0,0,0,.28);z-index:7;pointer-events:none}
#trk-hud .v{font:800 46px/1 system-ui}#trk-hud .u{font:600 14px system-ui;opacity:.85}#trk-hud .k{font:12px system-ui;opacity:.9;margin-top:4px}`;
  document.head.appendChild(css);
  const prompt = document.createElement('button'); prompt.id = 'trk-prompt'; document.body.appendChild(prompt);
  const hud = document.createElement('div'); hud.id = 'trk-hud'; hud.innerHTML = '<span class="v">0</span> <span class="u">km/h</span><div class="k">F: Get out / 내리기 · Shift: Boost · WASD/↑↓←→</div>'; document.body.appendChild(hud);
  const hudV = hud.querySelector('.v');
  prompt.onclick = () => toggle();
  addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) return;
    if (e.code === 'KeyF' && !e.repeat) toggle();
  });

  const nearest = () => {
    const P = player.position; let best = null, bd = 4.2;
    for (const t of list) { if (t.remote) continue; const s = Math.sin(t.h), c = Math.cos(t.h), dx = P.x - t.x, dz = P.z - t.z;
      const lz = dx * s + dz * c, lx = dx * c - dz * s; // 로컬 좌표
      const d = Math.hypot(Math.max(0, Math.abs(lx) - HW), Math.max(0, Math.abs(lz) - HL)); if (d < bd) { bd = d; best = t; } }
    return best;
  };
  function enter(t) {
    me.truck = t; t.driver = 'me'; t.v = 0; player.visible = false;
    me.saved = { dist: cam.dist, pitch: cam.pitch }; cam.dist = 11.5; cam.pitch = 0.2; cam.yaw = t.h + Math.PI;
    hud.style.display = 'block'; t.label.hidden = true;
  }
  function exit() {
    const t = me.truck; if (!t) return;
    me.truck = null; t.driver = null; t.v = 0; t.steer = 0; setBrake(t.mesh, false); player.visible = true; t.label.hidden = false;
    const s = Math.sin(t.h), c = Math.cos(t.h);
    // 운전석(왼쪽 = 로컬 +x, 차가 +z를 향하므로) → 오른쪽 → 뒤 → 앞 순으로 비어 있는 땅 찾기
    const opts = [[HW + 0.9, 0.6], [-(HW + 0.9), 0.6], [HW + 0.9, -1.2], [-(HW + 0.9), -1.2], [0, -(HL + 1.0)], [0, HL + 1.0], [HW + 2.2, 0], [-(HW + 2.2), 0]];
    let px = t.x + (HW + 0.9) * c, pz = t.z - (HW + 0.9) * s;
    for (const [lx, lz] of opts) { const x = t.x + lx * c + lz * s, z = t.z - lx * s + lz * c; if (!baseBlocked(x, z) && !hitTruck(x, z, 0.35)) { px = x; pz = z; break; } }
    player.position.set(px, ground(px, pz, t.y), pz); player.rotation.y = t.h;
    if (me.saved) { cam.dist = me.saved.dist; cam.pitch = me.saved.pitch; }
    hud.style.display = 'none';
  }
  function toggle() { if (me.truck) exit(); else { const t = nearest(); if (t) enter(t); } }

  // ---------- 물리(아케이드 자전거 모델) ----------
  const poseFits = (t, x, z, h) => {
    const s = Math.sin(h), c = Math.cos(h), b = world.bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return false;
    for (const [lx, lz] of HULL) if (baseBlocked(x + lx * c + lz * s, z - lx * s + lz * c, 0.05)) return false;
    for (const [cx, cz] of circles(t, x, z, h)) if (hitTruck(cx, cz, 1.05, t)) return false;
    return true;
  };
  function drive(t, dt, f, s, boost) {
    const fwd = t.v >= 0;
    // 가속/브레이크/후진
    if (f > 0) t.v += (t.v < 0 ? 14 : (boost ? 8.5 : 5.5) * (1 - Math.max(0, t.v) / (boost ? BOOST_V : MAX_V) * 0.6)) * f * dt;
    else if (f < 0) t.v += (t.v > 0.3 ? -14 : -4) * -f * dt;
    else t.v -= Math.sign(t.v) * Math.min(Math.abs(t.v), (1.2 + 0.012 * t.v * t.v) * dt); // 구름저항+공기저항
    t.v = THREE.MathUtils.clamp(t.v, -REV_V, boost ? BOOST_V : Math.max(MAX_V, Math.min(t.v, BOOST_V) - 6 * dt));
    // 조향: 저속에선 크게, 고속에선 작게 (최대 바퀴각 ~33°)
    const maxSt = 0.58 / (1 + Math.abs(t.v) / 14);
    t.steer += THREE.MathUtils.clamp(s * maxSt - t.steer, -2.5 * dt, 2.5 * dt);
    const yawRate = (t.v / DIM.WB) * Math.tan(-t.steer);
    const nh = t.h + yawRate * dt, nx = t.x + Math.sin(nh) * t.v * dt, nz = t.z + Math.cos(nh) * t.v * dt;
    if (poseFits(t, nx, nz, nh)) { t.x = nx; t.z = nz; t.h = nh; }
    else if (poseFits(t, nx, t.z, t.h)) { t.x = nx; t.v *= 0.7; } // 벽 따라 미끄러짐
    else if (poseFits(t, t.x, nz, t.h)) { t.z = nz; t.v *= 0.7; }
    else { t.v = -t.v * 0.2; me.bump = 0.25; } // 충돌: 튕김
    t.brake = (f < 0 && t.v > 0.3) || (f > 0 && t.v < -0.3);
    void fwd;
  }
  // 지형 높이/기울기 + 바퀴 회전/조향 시각화
  const pose = (t, dt) => {
    const s = Math.sin(t.h), c = Math.cos(t.h);
    const yf = ground(t.x + s * DIM.WB / 2, t.z + c * DIM.WB / 2, t.y), yr = ground(t.x - s * DIM.WB / 2, t.z - c * DIM.WB / 2, t.y);
    t.y = (yf + yr) / 2; const pitch = -Math.atan2(yf - yr, DIM.WB);
    t.pitch += (pitch - t.pitch) * Math.min(1, dt * 10);
    const m = t.mesh; m.position.set(t.x, t.y, t.z); m.rotation.set(t.pitch, t.h, 0, 'YXZ');
    t.spin += (t.v / DIM.R) * dt;
    for (const w of m.userData.wheels) { w.spin.rotation.x = t.spin; w.steer.rotation.y = w.front ? -t.steer : 0; }
    // 가감속에 따른 차체 피칭/롤(아주 약하게)
    const acc = (t.v - (t.pv ?? t.v)) / Math.max(dt, 1e-3); t.pv = t.v;
    t.lean = THREE.MathUtils.lerp(t.lean || 0, THREE.MathUtils.clamp(-acc * 0.004, -0.03, 0.03), Math.min(1, dt * 6));
    t.roll = THREE.MathUtils.lerp(t.roll || 0, THREE.MathUtils.clamp(t.steer * t.v * 0.0018, -0.035, 0.035), Math.min(1, dt * 6));
    m.userData.body.rotation.set(t.lean, 0, t.roll); m.userData.body.position.y = 0;
  };
  for (const t of list) pose(t, 0.016);

  // ---------- 멀티플레이: state 메시지에 veh{id,ry,v,st} 를 실어 보냄. 받은 쪽은 해당 트럭을 그 플레이어가 운전하는 것으로 표시 ----------
  const remoteDrivers = new Map(); // peerId -> truck
  if (presence) {
    presence.on('state', (m) => {
      const prev = remoteDrivers.get(m.id);
      if (m.veh && list[m.veh.id] && list[m.veh.id] !== me.truck) {
        const t = list[m.veh.id];
        if (prev && prev !== t) { prev.remote = null; }
        t.remote = { tx: m.x, tz: m.z, th: +m.veh.ry || 0, v: +m.veh.v || 0, st: +m.veh.st || 0 }; t.driver = m.id; remoteDrivers.set(m.id, t);
        const p = remotes?.peers.get(m.id); if (p) p.mesh.visible = false;
      } else if (prev) { prev.remote = null; prev.driver = null; prev.v = 0; remoteDrivers.delete(m.id); const p = remotes?.peers.get(m.id); if (p) p.mesh.visible = true; }
    });
    presence.on('leave', (m) => { const t = remoteDrivers.get(m.id); if (t) { t.remote = null; t.driver = null; t.v = 0; remoteDrivers.delete(m.id); } });
  }

  const api = {
    list,
    get driving() { return !!me.truck; },
    get current() { return me.truck; },
    enter: (i) => enter(list[i]), exit, nearest,
    // 메인 루프에서 걷기 이동 전에 호출. 운전 중이면 true (걷기 이동 생략)
    update(dt, f, s, run, lookYaw) {
      me.t += dt;
      const t = me.truck;
      if (t && Math.hypot(player.position.x - t.x, player.position.z - t.z) > 3) { // 쇼(L/R)·H 키 등으로 순간이동됨 → 트럭은 그 자리에 두고 하차 처리
        const keep = player.position.clone(); exit(); player.position.copy(keep);
      }
      if (me.truck) {
        drive(t, dt, f, s, run);
        player.position.set(t.x, t.y, t.z); player.rotation.y = t.h;
        if (Math.abs(lookYaw) > 1e-4) me.lastYawInput = me.t;
        if (cam.mode === 'follow' && me.t - me.lastYawInput > 1.5) { // 체이스 캠: 마우스로 돌려본 뒤 1.5초 지나면 차 뒤로 복귀
          const want = (t.v < -0.5 ? t.h : t.h + Math.PI), d = Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw));
          cam.yaw += d * Math.min(1, dt * (Math.abs(t.v) > 1 ? 3 : 1));
        }
        hudV.textContent = Math.round(Math.abs(t.v) * 3.6);
        setBrake(t.mesh, t.brake);
      }
      for (const tr of list) {
        if (tr.remote) { // 원격 운전자: 10Hz 상태 보간
          const r = tr.remote, k = Math.min(1, dt * 8);
          tr.x += (r.tx - tr.x) * k; tr.z += (r.tz - tr.z) * k; tr.h += Math.atan2(Math.sin(r.th - tr.h), Math.cos(r.th - tr.h)) * k; tr.v = r.v; tr.steer += (r.st - tr.steer) * k;
        } else if (tr !== me.truck && Math.abs(tr.v) > 0.01) tr.v = 0;
        if (tr === me.truck || tr.remote || tr.dirty !== false) { pose(tr, dt); tr.dirty = !!(tr === me.truck || tr.remote); }
      }
      // 탑승 프롬프트
      if (!me.truck) {
        const n = nearest(); me.near = n;
        if (n) { prompt.style.display = 'block'; prompt.innerHTML = '<kbd>F</kbd>Get in / 탑승 · Steel Truck'; } else prompt.style.display = 'none';
      } else { prompt.style.display = 'block'; prompt.innerHTML = '<kbd>F</kbd>Get out / 내리기'; }
      return !!me.truck;
    },
    // presence.sendState 에 합쳐 보낼 필드
    net() { const t = me.truck; return t ? { ry: t.h, moving: Math.abs(t.v) > 0.3, veh: { id: t.id, ry: +t.h.toFixed(3), v: +t.v.toFixed(2), st: +t.steer.toFixed(3) } } : null; },
  };
  return api;
}
