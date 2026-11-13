// [depot-story] 6일차 '마감 후' 기믹 — E07 폐점 후 카트 경주 · E08 새벽 3시 비밀 창고 칸.
//   대본 day6-script.json(d6_034 E07 · d6_061 E08) 의 mission.start 가 index.js 를 거쳐 여기 판정·상태·소품을 씀.
//   그림 비용: 출발선 체크무늬 + 출발 아치 = 정점 색 합친 메시 1개(≈150 삼각형), 범이 고스트 카트 1개(반투명 ≈36),
//              지게차 2대 = 몸통(정점 색 합친 메시) + 불빛 원뿔(가산 반투명) 각 1개 → 4 draw, 금빛 박스 1개(12).
//              야간·새벽 조명은 기존 Light 3개 세기만 낮춤(셰이더 재컴파일 없음) + DOM 손전등 비네트 1개.
//   순수 판정·상태(evalE07 · evalE08 · createRace · createStealth · raceCourse)는 DOM 없이 node 테스트(scripts/test-depot-day6.mjs).

/** E07 수치. 75초·3바퀴·50kg 은 events.json 값. vMul: 마감 후 경주 동안 카트 최고 속도 배수(평소 달리기 2.52 m/s 로는 76 m × 3 = 228 m 를 75초에 못 돎 → 4.0 m/s) */
export const E07 = Object.freeze({ laps: 3, timeLimitSec: 75, minLoadKg: 50, startWithinSec: 90, waitMaxSec: 240, countdownSec: 3, startR: 3.0, cpR: [3.0, 2.6], rivalFinishSec: 70, stumbleSec: 2.5, stumbleAtLap: [1, 3], dropsFail: 3, vMul: 1.6, recallSec: 60 });
/** E08 수치. 원뿔 40°·9 m · 0.5초 · 2번 = 실패 · 240초 · 손전등 끄면 속도 ×0.6(대신 불빛에 덜 띔: 보이는 거리 ×0.55) */
export const E08 = Object.freeze({ timeLimitSec: 240, startWithinSec: 90, coneDeg: 40, rangeM: 9, caughtSec: 0.5, caughtMax: 2, lookSec: 6, offSpeedMul: 0.6, darkRangeMul: 0.55, boxKg: 30, shelfR: 2.2, matR: 2.5, cpR: 3.0, graceSec: 2.5, noiseR: 14, recallSec: 60 });

/** E07 판정: 3바퀴 ≤ 75초 && 범이보다 먼저 && 떨어뜨림 0 = 성공 · (이김 && 1–2개) 또는 (≤ 75초 && 짐) = 부분 · 75초 초과·3개 이상·못 끝냄 = 실패 */
export function evalE07({ finished = false, timeSec = 0, beatRival = false, drops = 0 } = {}, t = E07) {
  if (!finished || timeSec > t.timeLimitSec || drops >= t.dropsFail) return 'fail';
  return beatRival && drops === 0 ? 'success' : 'partial';
}
/** E08 판정: 입구 도착 && 걸림 0 = 성공 · 1 = 부분 · 2번 걸림·240초 초과 = 실패 · 박스를 안 꺼냄(90초) = 놓침 */
export function evalE08({ picked = false, arrived = false, caught = 0, timeUp = false } = {}, t = E08) {
  if (!picked) return 'missed';
  if (caught >= t.caughtMax || timeUp || !arrived) return 'fail';
  return caught === 0 ? 'success' : 'partial';
}

/** 경주 코스: 출발선 → 특가 매대(교차 통로) → 통로 01 계란 코너 → 출발선. 고스트(범이)가 따라가는 길 = 실제 통로 가운데 */
export function raceCourse(tg = {}) {
  const at = (id, fx, fz) => (tg[id] ? { x: tg[id].x, z: tg[id].z } : { x: fx, z: fz });
  const start = at('race-start', 47, 13), cp0 = at('timesale-endcap', 47, 44), cp1 = at('aisle-01-eggs', 55, 28.6);
  const ax = 53.9; // 통로 01 가운데 (랙 52.35–55.55)
  const path = [{ x: 47.9, z: 13 }, { x: 47.9, z: 44.9 }, { x: ax, z: 44.9 }, { x: ax, z: 28.6 }, { x: ax, z: 13 }, { x: 47.9, z: 13 }];
  let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return { start, cps: [cp0, cp1], path, lapLen: len };
}
/** 폴리라인 위 거리 d (한 바퀴 안) → {x,z,dx,dz} */
export function alongPath(path, len, d) {
  let r = ((d % len) + len) % len;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (r <= l || i === path.length - 1) { const k = l ? Math.min(1, r / l) : 0; return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / (l || 1), dz: (b.z - a.z) / (l || 1) }; }
    r -= l;
  }
  return { ...path[0], dx: 0, dz: 1 };
}

/**
 * E07 상태 기계. step(dt, {x, z, kg, drops, engaged}) — x,z = 카트(없으면 나). 이벤트: lowLoad · count · go · cp · lap · stumble · rivalLap · end
 *   wait: 출발선(3 m) 안 + 짐 50kg 이상 → 3초 카운트다운 → run. 50kg 미만이면 lowLoad(d6_035) 한 번(나갔다 오면 다시).
 *   놓침: 90초 동안 출발선에도 안 오고 범쌀도 안 담음(engaged=false) 또는 240초 넘게 출발 안 함.
 *   run: 체크포인트 순서대로(특가 매대 3 m → 계란 코너 2.6 m → 출발선 3 m) = 1바퀴. 범이 고스트는 정해진 속도 + 1·3바퀴 중간에 2.5초 멈춤.
 */
export function createRace({ course = raceCourse(), t = E07, onEvent = () => {} } = {}) {
  const C = course, total = C.lapLen * t.laps, stops = t.stumbleAtLap.length * t.stumbleSec;
  const pace = total / Math.max(10, t.rivalFinishSec - stops);
  const S = { t: 0, phase: 'wait', countT: 0, runT: 0, lap: 0, cp: 0, low: false, drops0: null, drops: 0, rival: { d: 0, lap: 0, stumble: 0, stumbled: 0, finishT: -1 }, done: false, result: null, reason: '', finishT: -1, pace };
  const near = (p, r, o) => Math.hypot(o.x - p.x, o.z - p.z) < r;
  function finish(reason) {
    if (S.done) return; S.done = true; S.reason = reason; S.phase = 'done';
    S.result = reason === 'missed' ? 'missed' : evalE07({ finished: reason === 'finish', timeSec: S.runT, beatRival: S.rival.finishT < 0 || S.runT < S.rival.finishT, drops: S.drops }, t);
    onEvent('end', S.result);
  }
  function stepRival(dt) {
    const R = S.rival; if (R.finishT >= 0) return;
    if (R.stumble > 0) { R.stumble -= dt; return; }
    R.d += pace * dt;
    const lapNow = Math.floor(R.d / C.lapLen); if (lapNow > R.lap) { R.lap = lapNow; onEvent('rivalLap', R.lap); }
    const inLap = R.d - R.lap * C.lapLen, want = t.stumbleAtLap[R.stumbled];
    if (want != null && R.lap + 1 === want && inLap >= C.lapLen * 0.5) { R.stumbled++; R.stumble = t.stumbleSec; onEvent('stumble', R.stumbled); }
    if (R.d >= total) { R.d = total; R.finishT = S.runT; onEvent('rivalFinish', S.runT); }
  }
  return {
    S, course: C,
    step(dt, o = {}) {
      if (S.done) return S;
      S.t += dt;
      const me = { x: o.x ?? 1e3, z: o.z ?? 1e3 };
      if (S.phase === 'wait') {
        const at = near(C.start, t.startR, me);
        if (at && (o.kg || 0) >= t.minLoadKg) { S.phase = 'count'; S.countT = t.countdownSec; onEvent('count'); }
        else if (at && !S.low) { S.low = true; onEvent('lowLoad', o.kg || 0); }
        else if (!at) S.low = false;
        if (S.phase === 'wait' && ((S.t >= t.startWithinSec && !o.engaged && !at) || S.t >= t.waitMaxSec)) finish('missed');
        return S;
      }
      if (S.phase === 'count') { S.countT -= dt; if (S.countT <= 0) { S.phase = 'run'; S.runT = 0; S.drops0 = o.drops || 0; onEvent('go'); } return S; }
      S.runT += dt; S.drops = Math.max(0, (o.drops || 0) - (S.drops0 || 0));
      stepRival(dt);
      const tgt = S.cp < 2 ? C.cps[S.cp] : C.start, r = S.cp < 2 ? t.cpR[S.cp] : t.startR;
      if (near(tgt, r, me)) {
        if (S.cp < 2) { S.cp++; onEvent('cp', S.cp); } else { S.lap++; S.cp = 0; onEvent('lap', S.lap); if (S.lap >= t.laps) { S.finishT = S.runT; finish('finish'); return S; } }
      }
      if (S.drops >= t.dropsFail) finish('drops');
      else if (S.runT > t.timeLimitSec) finish('time');
      return S;
    },
    /** 고스트 위치 (run 전엔 출발선 옆) */
    rivalPos() { const p = alongPath(C.path, C.lapLen, S.rival.d); return { x: p.x + (S.phase === 'run' ? 0 : 1.2), z: p.z + (S.phase === 'run' ? 0 : 0.4), yaw: Math.atan2(-p.dx, -p.dz), stumbling: S.rival.stumble > 0 }; },
    left: () => (S.phase === 'run' ? t.timeLimitSec - S.runT : t.timeLimitSec),
    result: () => S.result || evalE07({ finished: false }, t),
  };
}

/** 지게차 순찰선: 사각형 긴 축 가운데 줄을 왕복 (끝 1 m 안쪽). trim = {a, b, c}: 시작·끝·가운데 줄 좌표를 덮어씀 */
export function laneLine(r, trim = r.trim || {}) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w >= d) { const z = trim.c ?? (r.z0 + r.z1) / 2; return { a: { x: trim.a ?? r.x0 + 1, z }, b: { x: trim.b ?? r.x1 - 1, z } }; }
  const x = trim.c ?? (r.x0 + r.x1) / 2; return { a: { x, z: trim.a ?? r.z0 + 1 }, b: { x, z: trim.b ?? r.z1 - 1 } };
}
/** 실제 매장 기준 순찰선: 교차 통로(fl-2)는 특가 파렛트(x 45.25–46.55, z 43.45–44.55)·보들범 피라미드(z ≤ 43.6) 앞에서 돌아감 → x 48.2–71, z 44.8 */
export const LANE_TRIM = { 'forklift-lane-cross': { a: 48.2, b: 71, c: 44.8 } };
export function forkliftLanes(tg = {}, ids = ['forklift-lane-back', 'forklift-lane-cross']) { return ids.map((id) => tg[id] && tg[id].x0 != null ? { ...tg[id], trim: LANE_TRIM[id] } : null).filter(Boolean); }
/** 점 p 가 지게차 f 의 불빛 원뿔(반각 coneDeg/2, 거리 range) 안인가 */
export function inCone(f, p, coneDeg, range) {
  const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz); if (d > range) return false; if (d < 0.6) return true;
  const c = (dx * f.dx + dz * f.dz) / d; return c >= Math.cos(coneDeg / 2 * Math.PI / 180);
}
/**
 * E08 상태 기계. step(dt, {x, z, light}) — x,z = 카트(없으면 나), light = 손전등 켬. 이벤트: pick · cp · spotStart · caught · reset · arrive · end
 *   박스를 꺼내기 전엔 원뿔에 걸려도 셈 안 함(그냥 경고음). 꺼낸 뒤 원뿔 안 0.5초 = 걸림 → 마지막 체크포인트로(박스는 그대로), 2번 = 실패.
 *   noise(x,z): 어두운 곳 cart-bump → 가까운 지게차가 6초 그쪽을 봄.
 */
export function createStealth({ lanes = [], speeds = [], shelf, mat, cps = [], t = E08, onEvent = () => {} } = {}) {
  const F = lanes.map((r, i) => { const L = laneLine(r); return { i, a: L.a, b: L.b, x: L.a.x + (L.b.x - L.a.x) * (0.3 + 0.4 * i), z: L.a.z + (L.b.z - L.a.z) * (0.3 + 0.4 * i), dir: i % 2 ? -1 : 1, dx: 0, dz: 0, speed: speeds[i] || 1.3, seeT: 0, lookT: 0, look: null }; });
  const S = { t: 0, picked: false, pickT: -1, caught: 0, cp: -1, last: null, arrived: false, done: false, result: null, reason: '', grace: 0, seen: false };
  function finish(reason) { if (S.done) return; S.done = true; S.reason = reason; S.result = evalE08({ picked: S.picked, arrived: S.arrived, caught: S.caught, timeUp: reason === 'time' }, t); onEvent('end', S.result); }
  function moveF(f, dt) {
    if (f.lookT > 0) { f.lookT -= dt; const dx = f.look.x - f.x, dz = f.look.z - f.z, d = Math.hypot(dx, dz) || 1; f.dx = dx / d; f.dz = dz / d; return; }
    const tg = f.dir > 0 ? f.b : f.a, dx = tg.x - f.x, dz = tg.z - f.z, d = Math.hypot(dx, dz);
    if (d < f.speed * dt) { f.x = tg.x; f.z = tg.z; f.dir *= -1; return; }
    f.dx = dx / d; f.dz = dz / d; f.x += f.dx * f.speed * dt; f.z += f.dz * f.speed * dt;
  }
  F.forEach((f) => moveF(f, 0.001));
  return {
    S, F,
    step(dt, o = {}) {
      if (S.done) return S;
      S.t += dt; for (const f of F) moveF(f, dt);
      const me = { x: o.x ?? 1e3, z: o.z ?? 1e3 };
      if (!S.picked) {
        if (Math.hypot(me.x - shelf.x, me.z - shelf.z) < t.shelfR) { S.picked = true; S.pickT = S.t; S.cp = 0; S.last = { x: shelf.x, z: shelf.z }; onEvent('pick'); }
        else if (S.t >= t.startWithinSec) { finish('missed'); return S; }
      }
      if (S.picked) for (let i = S.cp + 1; i < cps.length; i++) if (Math.hypot(me.x - cps[i].x, me.z - cps[i].z) < t.cpR) { S.cp = i; S.last = { x: cps[i].x, z: cps[i].z }; onEvent('cp', i); }
      const range = t.rangeM * (o.light === false ? t.darkRangeMul : 1);
      if (S.grace > 0) S.grace -= dt;
      let any = false;
      for (const f of F) {
        const inside = inCone(f, me, t.coneDeg, range);
        f.seeT = inside ? f.seeT + dt : Math.max(0, f.seeT - dt * 2);
        if (inside) any = true;
        if (S.picked && S.grace <= 0 && f.seeT >= t.caughtSec) {
          S.caught++; F.forEach((g) => { g.seeT = 0; }); S.grace = t.graceSec; onEvent('caught', S.caught, f.i);
          if (S.caught >= t.caughtMax) { finish('caught'); return S; }
          onEvent('reset', S.last); break;
        }
      }
      if (any && !S.seen) onEvent('spotStart'); S.seen = any;
      if (S.picked && Math.hypot(me.x - mat.x, me.z - mat.z) < t.matR) { S.arrived = true; onEvent('arrive'); finish('arrive'); return S; }
      if (S.t > t.timeLimitSec) finish('time');
      return S;
    },
    noise(x, z) { let b = null, bd = t.noiseR; for (const f of F) { const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; b = f; } } if (b) { b.lookT = t.lookSec; b.look = { x, z }; } return b; },
    result: () => S.result || evalE08({ picked: S.picked, arrived: S.arrived, caught: S.caught, timeUp: true }, t),
  };
}

// ---------------------------------------------------------------- 3D·DOM (브라우저) ----------------------------------------------------------------
function quad(pos, col, x0, z0, x1, z1, y, c) { const v = [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]; for (const [x, z] of v) { pos.push(x, y, z); col.push(c[0], c[1], c[2]); } }
/** 축 맞춘 상자(정점 색) → pos/col/nrm 배열에 36정점 */
function box(pos, col, cx, cy, cz, sx, sy, sz, c, nrm) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const F = [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]]];
  for (const [a, b, cc, d, n] of F) for (const p of [a, b, cc, a, cc, d]) { pos.push(...p); col.push(c[0], c[1], c[2]); nrm?.push(...n); }
}
const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
function geo(THREE, keep, pos, col, nrm) { const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); else g.computeVertexNormals(); g.computeBoundingSphere(); return g; }

/**
 * 6일차 소품: 출발선·아치(메시 1) · 범이 고스트 카트(1) · 지게차 2대(몸통 + 원뿔) · 금빛 박스(카트 위 / 비밀 칸) · 야간 조명 · 손전등 비네트 · 경주/잠입 HUD.
 */
export function createDay6Props({ THREE, scene, keep, cartObj = null, isMobile = false, tg = {}, onLight = () => {} }) {
  let line = null, ghost = null, lifts = [], gold = null, goldShelf = null, hud = null, css = null, vig = null, night = 0, saved = null, lightOn = true;
  function buildLine() {
    const pos = [], col = [], nrm = [], W = [0.96, 0.96, 0.94], K = [0.1, 0.1, 0.12], O = [0.95, 0.55, 0.12], R = tg['race-start'] || { x0: 44, x1: 50, z0: 12.5, z1: 13.5 };
    const n = 12, m = 2, dx = (R.x1 - R.x0) / n, dz = (R.z1 - R.z0) / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { quad(pos, col, R.x0 + i * dx, R.z0 + j * dz, R.x0 + (i + 1) * dx, R.z0 + (j + 1) * dz, 0.012, (i + j) % 2 ? K : W); for (let k = 0; k < 6; k++) nrm.push(0, 1, 0); }
    // 밤 전용 출발 아치: 기둥 2 + 위 띠(주황) — 계산대 쪽(남쪽) 가장자리에 세움
    box(pos, col, R.x0 + 0.1, 1.35, (R.z0 + R.z1) / 2, 0.16, 2.7, 0.16, O, nrm); box(pos, col, R.x1 - 0.1, 1.35, (R.z0 + R.z1) / 2, 0.16, 2.7, 0.16, O, nrm);
    box(pos, col, (R.x0 + R.x1) / 2, 2.6, (R.z0 + R.z1) / 2, R.x1 - R.x0, 0.32, 0.08, O, nrm);
    for (let i = 0; i < 10; i++) box(pos, col, R.x0 + 0.5 + i * 0.55, 2.6, (R.z0 + R.z1) / 2 + 0.05, 0.22, 0.22, 0.02, i % 2 ? K : W, nrm); // 아치 체크무늬
    const mesh = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), keep(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 })));
    mesh.name = 'story-race-line'; mesh.renderOrder = 1; return mesh;
  }
  function buildGhost() { // 가벼운 카트 실루엣(바구니 + 손잡이 + 바퀴 받침) 반투명 주황
    const pos = [], col = [], c = [1, 0.62, 0.2];
    box(pos, col, 0, 0.75, 0, 0.56, 0.42, 0.86, c); box(pos, col, 0, 1.0, 0.48, 0.56, 0.05, 0.05, c); box(pos, col, 0, 0.25, 0, 0.5, 0.06, 0.8, c);
    const m = new THREE.Mesh(geo(THREE, keep, pos, col), keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false })));
    m.name = 'story-ghost-cart'; return m;
  }
  let liftGeo = null, coneGeo = null, coneMat = null, liftMat = null;
  function buildLift() {
    if (!liftGeo) {
      const pos = [], col = [], Y = hex(0xe8b51e), D = hex(0x2a2c30), G = hex(0x8a8e94), A = hex(0xff8a10);
      box(pos, col, 0, 0.55, 0.15, 1.1, 0.8, 1.6, Y); box(pos, col, 0, 1.25, 0.45, 1.0, 0.08, 0.9, D); // 몸통 · 지붕
      for (const x of [-0.45, 0.45]) { box(pos, col, x, 0.85, 1.0, 0.06, 1.7, 0.06, D); box(pos, col, x, 1.85, -0.75, 0.08, 2.9, 0.08, G); } // 지붕 기둥 · 마스트
      box(pos, col, -0.2, 0.08, -1.25, 0.12, 0.05, 1.0, G); box(pos, col, 0.2, 0.08, -1.25, 0.12, 0.05, 1.0, G); // 포크(앞 = -z)
      for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.75], [0.5, 0.75]]) box(pos, col, x, 0.18, z, 0.16, 0.36, 0.36, D);
      box(pos, col, 0, 1.36, 0.45, 0.16, 0.14, 0.16, A); // 경광등
      liftGeo = geo(THREE, keep, pos, col); liftMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x221a08 }));
      const cone = keep(new THREE.ConeGeometry(Math.tan(E08.coneDeg / 2 * Math.PI / 180) * E08.rangeM, E08.rangeM, 18, 1, true)); cone.translate(0, -E08.rangeM / 2, 0); cone.rotateX(Math.PI / 2); // 꼭짓점 = 원점, -z 로 펼침
      coneGeo = cone; coneMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    }
    const g = new THREE.Group(); g.name = 'story-forklift';
    const body = new THREE.Mesh(liftGeo, liftMat); g.add(body);
    const cone = new THREE.Mesh(coneGeo, coneMat.clone()); keep(cone.material); cone.position.set(0, 1.2, -0.9); cone.rotation.x = -0.12; cone.renderOrder = 2; g.add(cone); g.userData.cone = cone;
    return g;
  }
  let goldGeo = null, goldMat = null;
  function goldMesh() { // 정점 색 상자 3개(몸통·뚜껑·띠) 합친 메시 1개 — 텍스처 없음
    if (!goldGeo) {
      const pos = [], col = [], nrm = [], G = hex(0xe0a91e), L = hex(0xffd862), B = hex(0x8a5a00);
      box(pos, col, 0, 0, 0, 0.46, 0.3, 0.4, G, nrm); box(pos, col, 0, 0.17, 0, 0.5, 0.05, 0.44, L, nrm); box(pos, col, 0, 0.01, 0, 0.07, 0.33, 0.42, B, nrm);
      goldGeo = geo(THREE, keep, pos, col, nrm); goldMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x7a5200 }));
    }
    const m = new THREE.Mesh(goldGeo, goldMat); m.name = 'story-gold-box'; return m;
  }
  function ensureCss() {
    if (css || typeof document === 'undefined') return;
    css = document.createElement('style'); css.id = 'dp-d6-css';
    css.textContent = `#dp-d6{position:fixed;left:50%;transform:translateX(-50%);bottom:${isMobile ? 96 : 26}px;z-index:40;display:flex;gap:10px;align-items:center;font:600 13px Pretendard,"Noto Sans KR",sans-serif;color:#fff;pointer-events:none}
#dp-d6 .bx{background:rgba(20,24,30,.8);border-radius:12px;padding:8px 13px;min-width:${isMobile ? 150 : 220}px}
#dp-d6 .big{font:900 26px Pretendard,sans-serif;letter-spacing:.5px}#dp-d6 .rw{display:flex;justify-content:space-between;gap:12px;font-size:12px;opacity:.9}
#dp-d6 .lt{pointer-events:auto;border:0;border-radius:50%;width:${isMobile ? 74 : 62}px;height:${isMobile ? 74 : 62}px;background:#f2c230;color:#222;font:800 12px Pretendard,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4);cursor:pointer}
#dp-d6 .lt.off{background:#3a3f47;color:#ddd}
#dp-d6-vig{position:fixed;inset:0;pointer-events:none;z-index:38;transition:background .25s}
#dp-d6-cnt{position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);z-index:41;font:900 120px Pretendard,sans-serif;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.6);pointer-events:none;animation:dpd6c .9s ease-out forwards}@keyframes dpd6c{from{opacity:1;transform:translate(-50%,-50%) scale(1.3)}to{opacity:0;transform:translate(-50%,-50%) scale(.9)}}`;
    document.head.appendChild(css);
  }
  const keyL = (e) => { if (e.code === 'KeyL' && !e.repeat && hud?.dataset.kind === 'stealth' && !document.body.classList.contains('dp-story-lock') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) { e.preventDefault(); e.stopPropagation(); api.setLight(!lightOn); onLight(lightOn); } };
  function vignette() {
    if (typeof document === 'undefined') return;
    if (night < 2) { vig?.remove(); vig = null; return; }
    if (!vig) { ensureCss(); vig = document.createElement('div'); vig.id = 'dp-d6-vig'; document.body.appendChild(vig); }
    vig.style.background = lightOn ? 'radial-gradient(ellipse 34% 46% at 50% 62%, rgba(0,0,0,0) 0%, rgba(0,0,0,.25) 55%, rgba(2,4,10,.82) 100%)' : 'radial-gradient(ellipse 60% 60% at 50% 60%, rgba(2,4,10,.45) 0%, rgba(2,4,10,.9) 100%)';
  }
  const api = {
    /** 출발선·아치 on/off */
    raceLine(on) { if (on) { line ||= buildLine(); scene.add(line); } else line?.removeFromParent(); },
    ghost(pos) { if (!pos) { ghost?.removeFromParent(); return; } ghost ||= buildGhost(); if (!ghost.parent) scene.add(ghost); ghost.position.set(pos.x, pos.stumbling ? -0.05 : 0, pos.z); ghost.rotation.set(0, pos.yaw, pos.stumbling ? 0.35 : 0); },
    /** 지게차 n대 on/off · update(F) */
    lifts(n) { while (lifts.length > n) lifts.pop().removeFromParent(); while (lifts.length < n) { const g = buildLift(); scene.add(g); lifts.push(g); } },
    updateLifts(F, hot = []) { F.forEach((f, i) => { const g = lifts[i]; if (!g) return; g.position.set(f.x, 0, f.z); g.rotation.y = Math.atan2(-f.dx, -f.dz); const c = g.userData.cone.material; c.color.setHex(hot[i] ? 0xff5a3a : 0xfff1a8); c.opacity = hot[i] ? 0.26 : 0.16; }); },
    /** 금빛 박스: 'shelf' 비밀 칸(뒤 벽) · 'cart' 카트 위 · null 치움 */
    gold(where, at) {
      if (where === 'shelf') { goldShelf ||= goldMesh(); goldShelf.position.set(at.x, 0.62, at.z); goldShelf.rotation.y = 0; scene.add(goldShelf); gold?.removeFromParent(); return; }
      goldShelf?.removeFromParent();
      if (where === 'cart' && cartObj) { gold ||= goldMesh(); gold.position.set(0, 1.08, 0.1); cartObj.add(gold); return; }
      gold?.removeFromParent();
    },
    /** 야간 조명: 0 평소 · 1 마감 후 반쯤 끔(경주) · 2 새벽 3시(손전등) — 기존 Light 세기·배경·안개만 바꿈 */
    night(level) {
      if (level === night) return; night = level;
      if (!saved) { saved = { lights: [], bg: scene.background?.clone?.() || null, fog: scene.fog ? { c: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far } : null, env: scene.environmentIntensity }; scene.traverse((o) => { if (o.isLight) saved.lights.push([o, o.intensity]); }); }
      const k = level === 0 ? 1 : level === 1 ? 0.55 : 0.28;
      for (const [o, i] of saved.lights) o.intensity = i * k;
      if (saved.env != null) scene.environmentIntensity = saved.env * k;
      const dark = new THREE.Color(level === 2 ? 0x0b1018 : 0x3a4048);
      if (scene.background?.isColor && saved.bg) scene.background.copy(level ? dark : saved.bg);
      if (scene.fog && saved.fog) { scene.fog.color.copy(level ? dark : saved.fog.c); scene.fog.near = level === 2 ? 14 : level ? 35 : saved.fog.near; scene.fog.far = level === 2 ? 46 : level ? 90 : saved.fog.far; }
      if (level === 0) saved = null;
      vignette();
    },
    get nightLevel() { return night; },
    setLight(on) { lightOn = !!on; vignette(); const b = hud?.querySelector('.lt'); if (b) { b.classList.toggle('off', !lightOn); b.innerHTML = `🔦<br>${lightOn ? '켜짐' : '꺼짐'}${isMobile ? '' : ' L'}`; } },
    get light() { return lightOn; },
    countdown(n) { if (typeof document === 'undefined') return; ensureCss(); const e = document.createElement('div'); e.id = 'dp-d6-cnt'; e.textContent = n; document.body.appendChild(e); setTimeout(() => e.remove(), 950); },
    /** HUD: kind 'race' | 'stealth' | null */
    hud(kind) {
      if (typeof document === 'undefined') return;
      if (!kind) { hud?.remove(); hud = null; window.removeEventListener('keydown', keyL, true); return; }
      if (hud?.dataset.kind === kind) return; hud?.remove(); ensureCss();
      hud = document.createElement('div'); hud.id = 'dp-d6'; hud.dataset.kind = kind;
      hud.innerHTML = kind === 'race' ? '<div class="bx"><div class="big tv">1:15</div><div class="rw"><span class="lv">바퀴 0/3</span><span class="rv">범이 0/3</span></div><div class="rw"><span class="kv">짐 0 kg</span><span class="dv">떨어뜨림 0</span></div></div>'
        : `<div class="bx"><div class="rw"><span>새벽 3시 · 금빛 박스</span><b class="bv">비밀 칸으로</b></div><div class="rw"><span class="cv">걸림 0/2</span><span class="tv">4:00</span></div></div><button class="lt" type="button">🔦<br>켜짐${isMobile ? '' : ' L'}</button>`;
      hud.querySelector('.lt')?.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); api.setLight(!lightOn); onLight(lightOn); });
      document.body.appendChild(hud);
      if (kind === 'stealth') window.addEventListener('keydown', keyL, true);
    },
    updateHud(o = {}) {
      if (!hud) return; const q = (s) => hud.querySelector(s); const mm = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
      if (hud.dataset.kind === 'race') { q('.tv').textContent = o.phase === 'wait' ? '출발선으로' : o.phase === 'count' ? '준비…' : mm(o.left); q('.lv').textContent = `바퀴 ${o.lap}/${o.laps}`; q('.rv').textContent = `범이 ${Math.min(o.laps, o.rivalLap)}/${o.laps}${o.stumbling ? ' (꽈당)' : ''}`; q('.kv').textContent = `짐 ${Math.round(o.kg)} kg${o.kg < 50 ? ' (50kg 필요)' : ''}`; q('.dv').textContent = `떨어뜨림 ${o.drops}`; }
      else { q('.bv').textContent = o.picked ? '입구 매트까지' : '뒤쪽 벽 비밀 칸으로'; q('.cv').textContent = `걸림 ${o.caught}/2${o.seeing ? ' · ⚠ 불빛!' : ''}`; q('.tv').textContent = mm(o.left); }
    },
    stats() { return { line: !!line?.parent, ghost: !!ghost?.parent, lifts: lifts.length, gold: !!gold?.parent || !!goldShelf?.parent, night, hud: hud?.dataset.kind || null, vig: !!vig }; },
    dispose() { api.raceLine(false); api.ghost(null); api.lifts(0); api.gold(null); api.hud(null); api.night(0); vig?.remove(); vig = null; css?.remove(); css = null; },
  };
  return api;
}
