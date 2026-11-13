// [depot-story] 5일차 '미행' 놀이 기믹 — E05 수상한 손님 미행 · E06 바닥은 용암입니다.
//   대본 day5-script.json(d5_018 E05 · d5_052 E06) 의 mission.start 가 index.js 를 거쳐 여기 판정·상태·소품을 씀.
//   그림 비용: E05 = 새 메시 없음(기존 spy 손님 NPC 를 연출로 움직임) + DOM HUD(거리 띠·의심 게이지·촬영 버튼)
//              E06 = 바닥 데칼(통로 01 입구 연결선 + 도착 칸 체크무늬) 정점 색 합친 메시 1개(≈70 삼각형) + 붉은 테두리 DOM 1개.
//   순수 판정·상태(evalE05 · evalE06 · createTail · createLava · buildSpyRoute)는 DOM 없이 node 테스트(scripts/test-depot-day5.mjs).

export const E05 = Object.freeze({ durationSec: 90, minDist: 4, maxDist: 12, noiseLimit: 1.5, loseSec: 10, spottedMax: 2, grabs: 10, photoAt: 10, photoWindowSec: 2, missedSec: 60,
  susNear6: 25, susNear4: 40, susHide: -30, susCalm: -5, susReset: 40, hideR: 1.2, hideSpeed: 0.2, arriveSec: 74, grabGap: 1.1, finalGrabGap: 2.2, photoMaxDist: 13 });
export const E06 = Object.freeze({ timeLimitSec: 60, waterPacks: 3, outsideFailSec: 3, okEps: 0.05, missedSec: 60, wheelLong: 0.42, wheelLat: 0.26 });
/** 실제 장애물 기준으로 바꾼 위치: 노란 띠 서쪽(x 42–51.4)은 계산대 칸막이 끝(z 4.55–11.8)이 띠를 0.2 m 만 남기고 막아서 카트가 못 지나감 → 도착 칸을 동쪽 끝(입구 쪽)으로 */
export const LAVA_GOAL = Object.freeze({ id: 'lava-goal', label: '용암 도착 칸 (노란 띠 동쪽 끝)', x: 66.5, z: 11.25, r: 0, x0: 64.0, x1: 69.0, z0: 10.5, z1: 12.0 });

/** E05 판정: 촬영 + 들킴 0 = 성공, 촬영 + 들킴 1 = 부분, 놓침·2번 들킴·창 놓침 = 실패, 60초 동안 12 m 안에 한 번도 안 옴 = 놓침 */
export function evalE05({ photo = false, spotted = 0, contact = true } = {}, t = E05) {
  if (photo) return spotted === 0 ? 'success' : spotted < t.spottedMax ? 'partial' : 'fail';
  return contact ? 'fail' : 'missed'; // 촬영 못 함: 놓침(12 m 초과 10초)·2번 들킴·창 놓침 = 실패, 한 번도 12 m 안에 안 옴 = 놓침
}
/** E06 판정: 60초 안에 도착 칸(범샘물 3팩) + 선 밖 0초 = 성공, ≤3초 = 부분, 3초 초과·시간 초과 = 실패, 안전 구역에 한 번도 안 들어감 = 놓침 */
export function evalE06({ started = false, arrived = false, outsideSec = 0, timeUp = false } = {}, t = E06) {
  if (!started) return 'missed';
  if (outsideSec > t.outsideFailSec) return 'fail';
  if (!arrived || timeUp) return 'fail';
  return outsideSec <= t.okEps ? 'success' : 'partial';
}

/**
 * 반값(spy) 미행 경로: 통로 01 생수 → 앞 가로 통로(z 13.2) → 통로 02 쌀·휴지 → 교차 통로(z 44) → 안마의자 앞 → 특가 매대.
 *   점마다 grabs(특가 스티커 상품 담기)·wait(멈춤). 장애물(랙·엔드캡 파렛트·안마의자·특가 파렛트 45.25–46.55)과 안 겹치게 고른 좌표.
 *   T(sec) 에 특가 매대 도착하도록 걷는 속도를 맞춤 → 10번째 담기 ≈ 83초.
 */
export function buildSpyRoute(tg = {}, t = E05) {
  const at = (id, fx, fz) => (tg[id] ? [tg[id].x, tg[id].z] : [fx, fz]);
  const [wx] = at('aisle-01-water', 53.9, 18.5), [hx] = at('aisle-02-household', 59.4, 33);
  const pts = [
    { x: wx, z: 18.5, grabs: 2, side: 1, yaw: 0 }, // 통로 01 생수 (시작)
    { x: wx, z: 13.2 }, { x: hx, z: 13.2 },
    { x: hx, z: 21.0, grabs: 2, side: -1 }, // 통로 02 쌀
    { x: hx, z: 33.0, grabs: 2, side: 1 }, // 통로 02 휴지
    { x: hx, z: 44.0 }, { x: 64.1, z: 44.0 },
    { x: 64.1, z: 37.4, wait: 2.5, look: -Math.PI / 2 }, // 안마의자(64.9–67.15, z 38.15–39.4) 앞에서 힐끔
    { x: 64.1, z: 44.0 },
    { x: 47.3, z: 44.0, grabs: 4, gap: t.finalGrabGap, side: 1, look: Math.PI / 2 }, // 특가 매대 (파렛트 45.25–46.55 동쪽)
  ];
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  let stops = 0; for (let i = 0; i < pts.length - 1; i++) stops += (pts[i].grabs || 0) * (pts[i].gap || t.grabGap) + (pts[i].wait || 0);
  const speed = Math.max(0.8, Math.min(1.5, len / Math.max(10, t.arriveSec - stops)));
  return { pts, len, speed };
}

/**
 * E05 상태 기계. step(dt, o) · o = {me:{x,z}, speed, kg, hiding, bump}. spy 위치(S.x,S.z,yaw,v)는 여기서 움직이고 index.js 가 NPC 에 씀.
 *   의심(judge): 6 m 안 소음(속도 × (1 + 짐/100)) > 1.5 → 초당 +25, 4 m 안 → 초당 +40, cart-bump → 100, 랙 끝 숨기(멈춤) → 초당 −30,
 *   (그 밖엔 6 m 밖이면 초당 −5로 천천히 식음). 100 → 들킴 1번, 게이지 40.
 */
export function createTail({ route = buildSpyRoute(), t = E05, onEvent = () => {} } = {}) {
  const P = route.pts;
  const S = { x: P[0].x, z: P[0].z, yaw: P[0].yaw ?? 0, v: 0, seg: 0, phase: 'stop', stopT: 0, grabsLeft: P[0].grabs || 0, grabs: 0, t: 0, picking: false, side: 1,
    dist: 99, sus: 0, spotted: 0, contact: false, farT: 0, photo: false, photoT: -1, grab10T: -1, done: false, result: null, reason: '', turnT: 0, firstContactT: -1 };
  S.stopT = (P[0].gap || t.grabGap);
  function nextGrabOrMove() {
    const p = P[S.seg];
    if (S.grabsLeft > 0) { S.stopT = p.gap || t.grabGap; S.phase = 'stop'; return; }
    if (S.phase === 'stop' && p.wait && !S.waited) { S.waited = true; S.stopT = p.wait; return; }
    if (S.seg >= P.length - 1) { S.phase = 'end'; S.v = 0; return; }
    S.phase = 'walk'; S.waited = false;
  }
  function grab() {
    S.grabs++; S.grabsLeft--; onEvent('grab', S.grabs);
    if (S.grabs === t.photoAt) S.grab10T = S.t;
  }
  function finish(result, reason) { if (S.done) return; S.done = true; S.result = result; S.reason = reason; onEvent('end', result); }
  function spot(why) {
    S.spotted++; S.sus = t.susReset; S.turnT = 1.6; onEvent('spotted', S.spotted, why);
    if (!S.photo && S.spotted >= t.spottedMax) finish('fail', 'spotted');
  }
  return {
    S, route,
    step(dt, o = {}) {
      if (S.done) return S;
      S.t += dt;
      // ---- spy 이동 ----
      if (S.turnT > 0) { S.turnT -= dt; S.v = 0; const dx = (o.me?.x ?? S.x) - S.x, dz = (o.me?.z ?? S.z) - S.z; S.yaw = Math.atan2(-dx, -dz); } // 들킴: 뒤돌아봄
      else if (S.phase === 'stop') {
        S.v = 0; S.stopT -= dt; S.picking = S.grabsLeft > 0;
        const p = P[S.seg]; if (p.look != null) S.yaw = p.look; S.side = p.side || 1;
        if (S.stopT <= 0) { if (S.grabsLeft > 0) grab(); nextGrabOrMove(); }
      } else if (S.phase === 'walk') {
        S.picking = false;
        const b = P[S.seg + 1], dx = b.x - S.x, dz = b.z - S.z, d = Math.hypot(dx, dz), stepL = route.speed * dt;
        S.v = route.speed;
        if (d <= stepL) { S.x = b.x; S.z = b.z; S.seg++; S.grabsLeft = b.grabs || 0; S.waited = false; S.phase = 'stop'; S.stopT = b.grabs ? (b.gap || t.grabGap) : 0; if (!b.grabs) nextGrabOrMove(); }
        else { S.x += dx / d * stepL; S.z += dz / d * stepL; let dy = Math.atan2(-dx, -dz) - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); S.yaw += dy * Math.min(1, dt * 6); }
      }
      // ---- 거리·의심 ----
      const me = o.me || { x: 1e3, z: 1e3 }, d = Math.hypot(me.x - S.x, me.z - S.z); S.dist = d;
      if (d <= t.maxDist && !S.contact) { S.contact = true; S.firstContactT = S.t; }
      const noise = (o.speed || 0) * (1 + (o.kg || 0) / 100);
      let rate = 0;
      if (d < t.minDist) rate = t.susNear4; else if (d < 6 && noise > t.noiseLimit) rate = t.susNear6;
      else if (o.hiding) rate = t.susHide; else if (d >= 6) rate = t.susCalm;
      const before = S.sus; S.sus = Math.max(0, Math.min(100, S.sus + rate * dt));
      if (o.bump && d < t.maxDist + 3) { S.sus = 100; onEvent('bump'); } // cart-bump 소리 = 즉시 100
      if (rate > 0 && Math.floor(before / 20) !== Math.floor(S.sus / 20)) onEvent('rise', S.sus);
      if (S.sus >= 100) spot(o.bump ? 'bump' : d < t.minDist ? 'close' : 'noise');
      if (S.done) return S;
      // ---- 놓침·창 ----
      if (S.contact) { S.farT = d > t.maxDist ? S.farT + dt : 0; if (S.farT > t.loseSec) { finish('fail', 'lost'); return S; } }
      else if (S.t >= t.missedSec) { finish('missed', 'noContact'); return S; }
      if (S.grab10T >= 0 && !S.photo && S.t > S.grab10T + t.photoWindowSec) { finish('fail', 'window'); return S; }
      if (S.t > t.durationSec + 8 && !S.photo) finish('fail', 'time');
      return S;
    },
    /** 촬영(F·버튼) → 'ok' | 'early' | 'far' | 'late' */
    photo() {
      if (S.done) return 'late';
      const near10 = S.grabs >= t.photoAt - 1 && (S.grab10T >= 0 ? S.t - S.grab10T <= t.photoWindowSec : P[S.seg].grabs && S.grabs === t.photoAt - 1 && S.phase === 'stop' && S.stopT <= t.photoWindowSec);
      if (!near10) { if (S.dist < 6) S.sus = Math.min(100, S.sus + 20); return 'early'; }
      if (S.dist > t.photoMaxDist) return 'far';
      S.photo = true; S.photoT = S.t; finish(evalE05({ photo: true, spotted: S.spotted }, t), 'photo');
      return 'ok';
    },
    result: () => S.result || evalE05({ photo: S.photo, spotted: S.spotted, contact: S.contact }, t),
  };
}

/** 사각형 안 (rect = {x0,x1,z0,z1}) */
export const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
/** 카트 바퀴 4개(또는 걸을 때 발 1점) */
export function wheels(c, t = E06) {
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), out = [];
  for (const a of [t.wheelLong, -t.wheelLong]) for (const b of [t.wheelLat, -t.wheelLat]) out.push([c.x + fx * a + rx * b, c.z + fz * a + rz * b]);
  return out;
}
/**
 * E06 용암 상태. zones = 안전 구역 사각형들, goal = 도착 칸. step(dt, {cart:{x,z,yaw}|null, me:{x,z}, water}) → 이벤트 'start' | 'burn' | 'cool' | 'arrive' | 'end'
 *   시작: 처음으로 바퀴 4개가 다 안전 구역 안 → 60초·선 밖 시간 셈. 바퀴 하나라도 밖 = 선 밖.
 */
export function createLava({ zones = [], goal = LAVA_GOAL, t = E06, onEvent = () => {} } = {}) {
  const S = { t: 0, started: false, startT: -1, outsideSec: 0, out: false, arrived: false, done: false, result: null, needWater: false };
  const safe = (x, z) => zones.some((r) => inRect(r, x, z));
  function finish(r) { if (S.done) return; S.done = true; S.result = r; onEvent('end', r); }
  return {
    S, safe,
    step(dt, o = {}) {
      if (S.done) return S;
      S.t += dt;
      const pts = o.cart ? wheels(o.cart, t) : o.me ? [[o.me.x, o.me.z]] : [];
      const allIn = pts.length > 0 && pts.every(([x, z]) => safe(x, z));
      if (!S.started) {
        if (allIn) { S.started = true; S.startT = S.t; onEvent('start'); }
        else if (S.t >= t.missedSec) finish('missed');
        return S;
      }
      const out = !allIn;
      if (out) { S.outsideSec += dt; if (!S.out) onEvent('burn'); } else if (S.out) onEvent('cool');
      S.out = out;
      if (S.outsideSec > t.outsideFailSec) { finish('fail'); return S; }
      const c = o.cart || o.me;
      if (c && inRect(goal, c.x, c.z)) {
        if ((o.water || 0) >= t.waterPacks) { S.arrived = true; onEvent('arrive'); finish(evalE06({ started: true, arrived: true, outsideSec: S.outsideSec }, t)); return S; }
        if (!S.needWater) { S.needWater = true; onEvent('needWater'); }
      } else S.needWater = false;
      if (S.t - S.startT > t.timeLimitSec) finish('fail');
      return S;
    },
    get elapsed() { return S.started ? S.t - S.startT : 0; },
    result: () => S.result || evalE06({ started: S.started, arrived: S.arrived, outsideSec: S.outsideSec, timeUp: true }, t),
  };
}

// ---------------------------------------------------------------- 3D·DOM (브라우저) ----------------------------------------------------------------
function quad(pos, col, x0, z0, x1, z1, y, c) { // 바닥 사각형 2삼각형 (위를 봄)
  const v = [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]];
  for (const [x, z] of v) { pos.push(x, y, z); col.push(c[0], c[1], c[2]); }
}
/**
 * 5일차 소품: 용암 바닥 데칼(연결선 + 도착 칸 체크무늬) 메시 1개 · 미행 HUD · 용암 붉은 테두리.
 */
export function createDay5Props({ THREE, scene, keep, isMobile = false, tg = {}, onPhoto = () => {} }) {
  let decal = null, hud = null, glow = null, css = null;
  function buildDecal() {
    const pos = [], col = [], Y = [1, 0.8, 0.1], W = [0.95, 0.95, 0.92], K = [0.12, 0.12, 0.14];
    const L = tg['lava-link-01'] || { x0: 52.35, x1: 55.4, z0: 12, z1: 14 };
    quad(pos, col, L.x0 - 0.05, L.z0, L.x0 + 0.05, L.z1 + 0.05, 0.013, Y); quad(pos, col, L.x1 - 0.05, L.z0, L.x1 + 0.05, L.z1 + 0.05, 0.013, Y); // 통로 01 노란 선 두 줄을 띠까지 이음
    const G = LAVA_GOAL, n = 10, m = 3, dx = (G.x1 - G.x0) / n, dz = (G.z1 - G.z0) / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) quad(pos, col, G.x0 + i * dx, G.z0 + j * dz, G.x0 + (i + 1) * dx, G.z0 + (j + 1) * dz, 0.012, (i + j) % 2 ? K : W);
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, keep(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 }))); mesh.name = 'story-lava-decal'; mesh.renderOrder = 1;
    return mesh;
  }
  function ensureCss() {
    if (css || typeof document === 'undefined') return;
    css = document.createElement('style'); css.id = 'dp-d5-css';
    css.textContent = `#dp-d5{position:fixed;left:50%;transform:translateX(-50%);bottom:${isMobile ? 96 : 26}px;z-index:40;display:flex;gap:10px;align-items:center;font:600 13px Pretendard,"Noto Sans KR",sans-serif;color:#fff;pointer-events:none}
#dp-d5 .bx{background:rgba(20,24,30,.78);border-radius:12px;padding:7px 11px;min-width:${isMobile ? 150 : 210}px}
#dp-d5 .rw{display:flex;justify-content:space-between;font-size:11px;opacity:.85;margin-bottom:3px}
#dp-d5 .bar{position:relative;height:9px;border-radius:5px;background:#3a3f47;overflow:hidden;margin-bottom:6px}
#dp-d5 .ok{position:absolute;top:0;bottom:0;background:#3f9a5e}
#dp-d5 .mk{position:absolute;top:-2px;width:4px;height:13px;margin-left:-2px;background:#fff;border-radius:2px}
#dp-d5 .sus{height:100%;background:linear-gradient(90deg,#f2c230,#e5533d);width:0}
#dp-d5 .cam{pointer-events:auto;border:0;border-radius:50%;width:${isMobile ? 74 : 62}px;height:${isMobile ? 74 : 62}px;background:#f2f2f2;color:#222;font:800 13px Pretendard,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4);cursor:pointer}
#dp-d5 .cam.hot{background:#f2c230;animation:dpd5 .6s infinite alternate}
@keyframes dpd5{to{transform:scale(1.08)}}
#dp-d5-glow{position:fixed;inset:0;pointer-events:none;z-index:39;box-shadow:inset 0 0 90px 30px rgba(230,60,20,.55);opacity:0;transition:opacity .15s}
#dp-d5-glow.on{opacity:1}
#dp-d5-flash{position:fixed;inset:0;background:#fff;pointer-events:none;z-index:41;animation:dpd5f .35s forwards}@keyframes dpd5f{from{opacity:.85}to{opacity:0}}`;
    document.head.appendChild(css);
  }
  const keyF = (e) => { if (e.code === 'KeyF' && !e.repeat && hud && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) { e.preventDefault(); onPhoto(); } };
  const api = {
    /** 용암 데칼 on/off */
    lava(on) {
      if (on) { decal ||= buildDecal(); scene.add(decal); } else decal?.removeFromParent();
    },
    /** 미행 HUD on/off · update({dist, sus, grabs, hot}) */
    tailHud(on) {
      if (typeof document === 'undefined') return;
      if (!on) { hud?.remove(); hud = null; window.removeEventListener('keydown', keyF, true); return; }
      if (hud) return;
      ensureCss();
      hud = document.createElement('div'); hud.id = 'dp-d5';
      hud.innerHTML = `<div class="bx"><div class="rw"><span>거리</span><b class="dv">– m</b></div><div class="bar"><div class="ok" style="left:${4 / 16 * 100}%;width:${8 / 16 * 100}%"></div><div class="mk"></div></div>
<div class="rw"><span>의심</span><b class="sv">0</b></div><div class="bar"><div class="sus"></div></div><div class="rw" style="margin:0"><span>특가 담기</span><b class="gv">0/10</b></div></div>
<button class="cam" type="button">📷<br>${isMobile ? '촬영' : '촬영 F'}</button>`;
      hud.querySelector('.cam').addEventListener('click', (e) => { e.stopPropagation(); onPhoto(); });
      document.body.appendChild(hud);
      window.addEventListener('keydown', keyF, true);
    },
    updateHud({ dist = 99, sus = 0, grabs = 0, hot = false, spotted = 0 } = {}) {
      if (!hud) return;
      hud.querySelector('.dv').textContent = `${dist > 30 ? '30+' : dist.toFixed(1)} m`;
      hud.querySelector('.mk').style.left = `${Math.min(100, dist / 16 * 100)}%`;
      hud.querySelector('.sus').style.width = `${sus}%`;
      hud.querySelector('.sv').textContent = `${Math.round(sus)}${spotted ? ` · 들킴 ${spotted}` : ''}`;
      hud.querySelector('.gv').textContent = `${grabs}/10`;
      hud.querySelector('.cam').classList.toggle('hot', hot);
    },
    flash() { if (typeof document === 'undefined') return; const f = document.createElement('div'); f.id = 'dp-d5-flash'; document.body.appendChild(f); setTimeout(() => f.remove(), 400); },
    /** 선 밖(용암) 붉은 테두리 */
    burn(on) {
      if (typeof document === 'undefined') return;
      if (on && !glow) { ensureCss(); glow = document.createElement('div'); glow.id = 'dp-d5-glow'; document.body.appendChild(glow); }
      glow?.classList.toggle('on', !!on);
    },
    stats() { return { decal: !!decal?.parent, hud: !!hud, glow: !!glow?.classList.contains('on') }; },
    dispose() { api.lava(false); api.tailHud(false); glow?.remove(); glow = null; css?.remove(); css = null; },
  };
  return api;
}
