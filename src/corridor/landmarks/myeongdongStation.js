// [myeongdong] 명동역(4호선) 출구 캐노피 + '서울 첫날 코스' 길안내(명동역 → 남산오르미 → 케이블카 하부정류장).
//   출구 = OSM subway_entrance 노드 10개. 유리 지붕 캐노피·4호선 표지·노란 출구 번호(아틀라스).
//   길안내 = 실제 OSM 길 그래프 최단 경로 위 쉐브론 + 이정표, 남산오르미(경사형 엘리베이터) 레일·정류장·움직이는 캐빈.
//   draw: 캐노피 틀 1 + 유리 1 + 아틀라스(표지·쉐브론·이정표) 1 + 오르미 캐빈 2.
import * as THREE from 'three';
import { GeoBuf, hex3, distToSeg, hash01 } from './myeongdongGeo.js';
import { MYEONGDONG_SPAWN } from './myeongdongFlags.js';

const CAR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link']);
// 남산 케이블카 하부정류장(OSM way/383097725 중심) · 상부(남산타워, way/61855801 첫 노드). namsan 데이터가 없을 때 대비
const CABLE_LOWER = { x: -10995.2, z: -21019.5 };
const CABLE_UPPER = { x: -10710.4, z: -20546.4 };
const COURSE_START_EXIT = '3'; // 퇴계로 남쪽(남산 쪽) 출구 — 길 하나 덜 건넌다
const SPAWN_EXIT = '6'; // 명동8길(중앙로) 입구

function nearestCarSeg(ways, x, z, maxD = 26) {
  let best = null, bd = maxD;
  for (const w of ways) {
    if (!CAR.has(w.k)) continue;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i];
      const d = distToSeg(x, z, a[0], a[1], b[0], b[1]);
      if (d < bd) { bd = d; best = { w, a, b, d }; }
    }
  }
  return best;
}

/** 실제 길 그래프 다익스트라 (차도는 1.6배 비용: 보도·골목을 선호) */
function shortestPath(ways, from, to) {
  const key = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const nodes = new Map(); // key → { p, e: [[k, cost]] }
  const node = (p) => { const k = key(p); let n = nodes.get(k); if (!n) nodes.set(k, (n = { p, e: [] })); return k; };
  for (const w of ways) {
    if (w.tun) continue;
    const mul = CAR.has(w.k) ? 1.6 : w.k === 'steps' ? 1.3 : 1;
    for (let i = 1; i < w.pts.length; i++) {
      const a = node(w.pts[i - 1]), b = node(w.pts[i]);
      const c = Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]) * mul;
      nodes.get(a).e.push([b, c]); nodes.get(b).e.push([a, c]);
    }
  }
  const nearest = (q) => { let bk = null, bd = Infinity; for (const [k, n] of nodes) { const d = Math.hypot(n.p[0] - q[0], n.p[1] - q[1]); if (d < bd && n.e.length) { bd = d; bk = k; } } return bk; };
  const s = nearest(from), t = nearest(to);
  if (!s || !t) return null;
  const dist = new Map([[s, 0]]), prev = new Map(), done = new Set();
  const heap = [[0, s]];
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  heap.length = 0; push([0, s]);
  while (heap.length) {
    const [d, k] = pop();
    if (done.has(k)) continue; done.add(k);
    if (k === t) break;
    for (const [k2, c] of nodes.get(k).e) { const nd = d + c; if (nd < (dist.get(k2) ?? Infinity)) { dist.set(k2, nd); prev.set(k2, k); push([nd, k2]); } }
  }
  if (!done.has(t)) return null;
  const out = []; for (let k = t; k; k = prev.get(k)) { out.push(nodes.get(k).p); if (k === s) break; }
  out.reverse();
  return [from, ...out, to];
}

/** 법선 n 쪽이 앞면이 되게 정점 순서를 맞춰 넣는다 (텍스트가 뒤집히지 않게 uv 도 같이) */
function facedQuad(buf, a, b, c, d, uv, n) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) buf.quad(a, b, c, d, uv, null, n);
  else buf.quad(b, a, d, c, [uv[2], uv[1], uv[0], uv[3]], null, n);
}

function resample(pts, step) {
  const out = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    for (let s = carry; s < L; s += step) out.push({ x: a[0] + tx * s, z: a[1] + tz * s, tx, tz });
    carry = (carry - L) % step; if (carry < 0) carry += step;
  }
  return out;
}

export function createMyeongdongStation({ parent, data, land, atlas, overlay, roadAt, bldAt, namsan }) {
  const { heightAt } = land;
  const g = new THREE.Group(); g.name = 'myeongdong-station'; parent.add(g);
  const st = data.station || { x: -10791.5, z: -21488.7 };
  const ways = (data.ways || []).filter((w) => w.pts?.length >= 2);
  const frame = new GeoBuf({ uv: false, color: true });
  const glass = new GeoBuf({ uv: false, color: false });
  const signs = new GeoBuf({ uv: true, color: false });
  const U = (n) => atlas.uv(n);
  const steel = hex3('#5d6670'), granite = hex3('#8d8a85'), dark = hex3('#1a1c20'), stair = hex3('#4a4d52'), blue = hex3('#00A5DE');
  const blockers = []; // { cx, cz, ax, az, hl, hw }

  // ---------- 출구 캐노피 ----------
  const exits = [];
  for (const e of data.exits || []) {
    const seg = nearestCarSeg(ways, e.x, e.z);
    let tx = 1, tz = 0;
    if (seg) { const L = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]) || 1; tx = (seg.b[0] - seg.a[0]) / L; tz = (seg.b[1] - seg.a[1]) / L; }
    // 도로에서 먼 쪽 법선
    let nx = -tz, nz = tx;
    if (seg) {
      const mx = (seg.a[0] + seg.b[0]) / 2, mz = (seg.a[1] + seg.b[1]) / 2;
      const px = mx + (e.x - mx), pz = mz + (e.z - mz);
      // 노드에서 도로 중심선 쪽 방향의 반대
      const d0 = distToSeg(px + nx, pz + nz, seg.a[0], seg.a[1], seg.b[0], seg.b[1]), d1 = distToSeg(px - nx, pz - nz, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
      if (d1 > d0) { nx = -nx; nz = -nz; }
    }
    // 차도·건물에서 비켜 세우기
    let cx = e.x, cz = e.z;
    for (let k = 0; k < 12; k++) {
      const onCar = roadAt(cx, cz, 1.9, CAR);
      if (!onCar) break;
      cx += nx * 0.5; cz += nz * 0.5;
    }
    for (let k = 0; k < 6 && bldAt(cx, cz, 1.8); k++) { cx -= nx * 0.4; cz -= nz * 0.4; }
    // 계단 입구 방향: 출구 6은 명동8길 쪽, 나머지는 해시
    let dir = hash01(+e.ref || 1, 5) < 0.5 ? 1 : -1;
    if (e.ref === SPAWN_EXIT) dir = ((-10909.7 - cx) * tx + (-21492 - cz) * tz) > 0 ? 1 : -1;
    const ax = tx * dir, az = tz * dir; // 입구(열린 쪽) 방향
    const hl = 3.6, hw = 1.65, gy = heightAt(cx, cz);
    const rx = -az, rz = ax; // 입구를 바라볼 때 왼쪽→오른쪽 축
    const P = (u, v, y) => [cx + ax * u + rx * v, gy + y, cz + az * u + rz * v];
    const ry = Math.atan2(ax, az) - Math.PI / 2; // box 로컬 x → (ax,az)
    // 화강암 옆벽(난간) + 뒷벽
    for (const s of [-1, 1]) frame.box(...P(0, s * (hw - 0.12), 0.55), hl * 2, 1.1, 0.24, ry, undefined, granite);
    frame.box(...P(-hl + 0.12, 0, 0.55), 0.24, 1.1, hw * 2, ry, undefined, granite);
    // 계단 구멍 (어두운 바닥 + 계단 줄무늬)
    frame.quad(P(-hl + 0.25, -hw + 0.25, 0.04), P(hl, -hw + 0.25, 0.04), P(hl, hw - 0.25, 0.04), P(-hl + 0.25, hw - 0.25, 0.04), undefined, dark, [0, 1, 0]);
    for (let s = -hl + 0.6; s < hl - 0.2; s += 0.42) frame.quad(P(s, -hw + 0.3, 0.06), P(s + 0.16, -hw + 0.3, 0.06), P(s + 0.16, hw - 0.3, 0.06), P(s, hw - 0.3, 0.06), undefined, stair, [0, 1, 0]);
    // 기둥 6 + 지붕 테두리
    for (const u of [-hl + 0.15, 0, hl - 0.15]) for (const s of [-1, 1]) frame.box(...P(u, s * (hw - 0.12), 1.65), 0.12, 2.2, 0.12, ry, undefined, steel);
    const roofY0 = 2.75, roofY1 = 3.15; // 뒤가 높은 경사 유리
    for (const s of [-1, 1]) frame.box(...P(0, s * (hw - 0.05), (roofY0 + roofY1) / 2), hl * 2 + 0.2, 0.14, 0.1, ry, undefined, steel);
    glass.quad(P(hl + 0.1, -hw, roofY0), P(hl + 0.1, hw, roofY0), P(-hl - 0.1, hw, roofY1), P(-hl - 0.1, -hw, roofY1));
    glass.quad(P(hl + 0.1, hw, roofY0 - 0.02), P(hl + 0.1, -hw, roofY0 - 0.02), P(-hl - 0.1, -hw, roofY1 - 0.02), P(-hl - 0.1, hw, roofY1 - 0.02));
    // 옆 유리벽
    for (const s of [-1, 1]) glass.quad(P(-hl, s * (hw - 0.1), 1.1), P(hl, s * (hw - 0.1), 1.1), P(hl, s * (hw - 0.1), roofY0), P(-hl, s * (hw - 0.1), roofY1));
    // 입구 위 표지판 (앞·뒤): 4호선 명동 + 출구 번호
    const sy = roofY0 + 0.05;
    const nIn = [ax, 0, az];
    facedQuad(signs, P(hl + 0.16, -hw * 0.95, sy), P(hl + 0.16, hw * 0.95 - 0.7, sy), P(hl + 0.16, hw * 0.95 - 0.7, sy + 0.62), P(hl + 0.16, -hw * 0.95, sy + 0.62), U('station'), nIn);
    // 왼쪽→오른쪽 축이 바깥에서 보면 반대 → 앞면 정점 순서 고정: 오른손 법칙으로 nIn 쪽
    const exitUV = U('exit' + Math.min(12, +e.ref || 1));
    facedQuad(signs, P(hl + 0.16, hw * 0.95 - 0.66, sy), P(hl + 0.16, hw * 0.95, sy), P(hl + 0.16, hw * 0.95, sy + 0.62), P(hl + 0.16, hw * 0.95 - 0.66, sy + 0.62), exitUV, nIn);
    // 뒤쪽(도로에서 보이게) 큰 번호
    facedQuad(signs, P(-hl - 0.16, hw * 0.4, sy - 0.2), P(-hl - 0.16, -hw * 0.4, sy - 0.2), P(-hl - 0.16, -hw * 0.4, sy + 0.62), P(-hl - 0.16, hw * 0.4, sy + 0.62), exitUV, [-ax, 0, -az]);
    // 4호선 기둥 표지 (파란 원통 대신 각기둥 + 표지판)
    frame.box(...P(hl + 0.6, hw + 0.4, 1.4), 0.16, 2.8, 0.16, ry, undefined, steel);
    frame.box(...P(hl + 0.6, hw + 0.4, 2.95), 0.5, 0.5, 0.08, ry + Math.PI / 2, undefined, blue);
    blockers.push({ cx, cz, ax, az, hl: hl + 0.1, hw: hw + 0.05 });
    exits.push({ ref: e.ref, x: +cx.toFixed(1), z: +cz.toFixed(1), door: { x: cx + ax * (hl + 1.6), z: cz + az * (hl + 1.6) }, ax, az, osm: e.osm });
  }
  // ---------- 스폰 (6번 출구 계단 위, 명동8길을 보게) ----------
  const ex6 = exits.find((e) => e.ref === SPAWN_EXIT);
  let spawn = { ...MYEONGDONG_SPAWN };
  let spawnFace = 0;
  if (ex6) {
    let sx = ex6.door.x, sz = ex6.door.z;
    for (let k = 0; k < 8 && (roadAt(sx, sz, 0.6, CAR) || bldAt(sx, sz, 0.6)); k++) { sx -= ex6.az * 0.4; sz += ex6.ax * 0.4; }
    spawn = { x: +sx.toFixed(2), z: +sz.toFixed(2), y: heightAt(sx, sz), name: '명동역 6번 출구' };
    const tgt = [-10914, -21600];
    spawnFace = Math.atan2(-(tgt[0] - sx), -(tgt[1] - sz)); // cam.yaw: forward = (-sin, -cos)
  }

  // ---------- 길안내: 명동역 3번 출구 → 남산오르미 → 케이블카 ----------
  const oreumi = data.oreumi?.pts?.length >= 2 ? data.oreumi.pts : [[-11039.5, -21056.0], [-11012.7, -20997.7]];
  const foot = oreumi[0], top = oreumi[oreumi.length - 1];
  const exStart = exits.find((e) => e.ref === COURSE_START_EXIT) || exits[0];
  const startP = exStart ? [exStart.door.x, exStart.door.z] : [st.x, st.z];
  const path = shortestPath(ways, startP, foot) || [startP, foot];
  let pathLen = 0; for (let i = 1; i < path.length; i++) pathLen += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  const guideY = (x, z) => heightAt(x, z) + (land.inBox(x, z) ? 0.2 : 0.35);
  {
    const samples = resample(path, 5.5);
    for (let i = 1; i < samples.length - 1; i++) {
      const s = samples[i];
      let x = s.x, z = s.z;
      const car = roadAt(x, z, 0, CAR);
      if (car) {
        // 차도 위면 진행 방향 오른쪽 보도로
        let moved = false;
        for (const side of [1, -1]) {
          const ox = -s.tz * side, oz = s.tx * side; // 오른쪽 = (-tz, tx)? (진행 방향 기준 화면상 오른쪽)
          for (let d = car.w / 2 + 1.2; d <= car.w / 2 + 3; d += 0.6) {
            const qx = s.x + ox * d, qz = s.z + oz * d;
            if (!roadAt(qx, qz, 0, CAR) && !bldAt(qx, qz, 0.5)) { x = qx; z = qz; moved = true; break; }
          }
          if (moved) break;
        }
        if (!moved) continue;
      }
      if (bldAt(x, z, 0.3)) continue;
      const hwq = 0.6, hlq = 0.6, rx = -s.tz, rz = s.tx;
      // 모서리마다 땅 높이(남산 비탈에서 판이 땅에 묻히지 않게)
      const C = (a, b) => { const qx = x + rx * a * hwq + s.tx * b * hlq, qz = z + rz * a * hwq + s.tz * b * hlq; return [qx, guideY(qx, qz), qz]; };
      facedQuad(signs, C(-1, -1), C(1, -1), C(1, 1), C(-1, 1), U('guide'), [0, 1, 0]);
    }
  }
  // 이정표: 출발·약 110 m 마다·오르미 앞
  const boards = [];
  {
    const marks = resample(path, 110).map((s) => [s.x, s.z, s.tx, s.tz]);
    const end = path[path.length - 1], pre = path[path.length - 2] || startP;
    const eL = Math.hypot(end[0] - pre[0], end[1] - pre[1]) || 1;
    marks.push([end[0] - (end[0] - pre[0]) / eL * 4, end[1] - (end[1] - pre[1]) / eL * 4, (end[0] - pre[0]) / eL, (end[1] - pre[1]) / eL]);
    for (const [mx0, mz0, tx, tz] of marks) {
      // 길가로 2.6 m (진행 방향 오른쪽), 막혀 있으면 왼쪽
      let px = null, pz = null;
      for (const side of [1, -1]) for (const d of [2.6, 4.2, 6]) {
        if (px != null) break;
        const qx = mx0 - tz * side * d, qz = mz0 + tx * side * d;
        if (!roadAt(qx, qz, 0.4, CAR) && !bldAt(qx, qz, 0.6)) { px = qx; pz = qz; }
      }
      if (px == null) continue;
      const y = heightAt(px, pz);
      frame.box(px, y + 1.25, pz, 0.12, 2.5, 0.12, 0, undefined, steel);
      // 판: 진행 방향을 마주 보게(사람이 걸어오며 읽음) — 양면
      const nx = -tx, nz = -tz, rx = nz, rz = -nx, bw = 1.9, bh = 0.6, by = y + 2.0;
      facedQuad(signs, [px - rx * bw / 2, by, pz - rz * bw / 2], [px + rx * bw / 2, by, pz + rz * bw / 2], [px + rx * bw / 2, by + bh, pz + rz * bw / 2], [px - rx * bw / 2, by + bh, pz - rz * bw / 2], U('guideBoard'), [nx, 0, nz]);
      facedQuad(signs, [px + rx * bw / 2 + tx * 0.03, by, pz + rz * bw / 2 + tz * 0.03], [px - rx * bw / 2 + tx * 0.03, by, pz - rz * bw / 2 + tz * 0.03], [px - rx * bw / 2 + tx * 0.03, by + bh, pz - rz * bw / 2 + tz * 0.03], [px + rx * bw / 2 + tx * 0.03, by + bh, pz + rz * bw / 2 + tz * 0.03], U('guideBoard'), [-nx, 0, -nz]);
      frame.box(px, by + bh / 2, pz + 0.0, bw + 0.08, bh + 0.08, 0.03, Math.atan2(rx, rz) - Math.PI / 2, undefined, hex3('#0c2236'));
      boards.push({ x: px, z: pz });
    }
  }

  // ---------- 남산오르미 (경사형 엘리베이터) ----------
  const yF = heightAt(foot[0], foot[1]), yT = heightAt(top[0], top[1]);
  const oL = Math.hypot(top[0] - foot[0], top[1] - foot[1]);
  const otx = (top[0] - foot[0]) / oL, otz = (top[1] - foot[1]) / oL, orx = -otz, orz = otx;
  const deckY = (t) => Math.max(yF + (yT - yF) * t, heightAt(foot[0] + otx * oL * t, foot[1] + otz * oL * t)) + 0.9;
  {
    const concrete = hex3('#a7a49d'), rail = hex3('#c8ccd1');
    const N = Math.ceil(oL / 4);
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const P = (t, s, dy) => [foot[0] + otx * oL * t + orx * s, deckY(t) + dy, foot[1] + otz * oL * t + orz * s];
      // 상판
      frame.quad(P(t0, -1.4, 0), P(t0, 1.4, 0), P(t1, 1.4, 0), P(t1, -1.4, 0), undefined, concrete);
      for (const s of [-0.7, 0.7]) frame.quad(P(t0, s - 0.06, 0.12), P(t0, s + 0.06, 0.12), P(t1, s + 0.06, 0.12), P(t1, s - 0.06, 0.12), undefined, rail);
      // 옆면
      for (const s of [-1, 1]) {
        const a = P(t0, s * 1.4, 0), b = P(t1, s * 1.4, 0);
        const ga = [a[0], heightAt(a[0], a[2]) - 0.3, a[2]], gb = [b[0], heightAt(b[0], b[2]) - 0.3, b[2]];
        if (s > 0) frame.quad(ga, gb, b, a, undefined, concrete); else frame.quad(gb, ga, a, b, undefined, concrete);
      }
      // 기둥 (8 m 마다)
      if (i % 2 === 0) { const c = P(t0, 0, 0); const gy0 = heightAt(c[0], c[2]); if (c[1] - gy0 > 1.2) frame.box(c[0], (c[1] + gy0) / 2, c[2], 0.5, c[1] - gy0, 0.5, 0, undefined, concrete); }
    }
    // 승강장 두 곳 (유리 상자)
    for (const [p, y, t] of [[foot, deckY(0), 0], [top, deckY(1), 1]]) {
      const cx = p[0] - otx * (t ? -2.4 : 2.4), cz = p[1] - otz * (t ? -2.4 : 2.4);
      const ry = Math.atan2(otx, otz);
      frame.box(cx, y - 0.45, cz, 4.4, 0.3, 4.6, ry, undefined, hex3('#8d8a85'));
      frame.box(cx, y + 2.6, cz, 4.8, 0.25, 5.0, ry, undefined, hex3('#e8eaec'));
      for (const [du, dv] of [[-2.2, -2.3], [2.2, -2.3], [-2.2, 2.3], [2.2, 2.3]]) {
        const c = Math.cos(ry), s = Math.sin(ry);
        frame.box(cx + du * c + dv * s, y + 1.05, cz - du * s + dv * c, 0.14, 3.0, 0.14, ry, undefined, steel);
      }
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const side of [-1, 1]) {
        const ox = side * 2.2 * c, oz = -side * 2.2 * s;
        const a = [cx + ox - 2.3 * s, y - 0.3, cz + oz - 2.3 * c], b = [cx + ox + 2.3 * s, y - 0.3, cz + oz + 2.3 * c];
        glass.quad(a, b, [b[0], y + 2.5, b[2]], [a[0], y + 2.5, a[2]]);
      }
    }
  }
  // 캐빈 (움직임)
  const cabin = new THREE.Group(); cabin.name = 'myeongdong-oreumi-cabin';
  const cabFrame = new GeoBuf({ uv: false, color: true }), cabGlass = new GeoBuf({ uv: false });
  cabFrame.box(0, 0.15, 0, 2.2, 0.3, 3.0, 0, undefined, hex3('#e9edf0'));
  cabFrame.box(0, 2.45, 0, 2.3, 0.2, 3.1, 0, undefined, hex3('#e9edf0'));
  cabFrame.box(0, 2.6, 0, 1.6, 0.12, 0.5, 0, undefined, blue);
  for (const [x, z] of [[-1.05, -1.45], [1.05, -1.45], [-1.05, 1.45], [1.05, 1.45]]) cabFrame.box(x, 1.3, z, 0.1, 2.3, 0.1, 0, undefined, hex3('#7b858f'));
  cabGlass.box(0, 1.3, 0, 2.1, 2.1, 2.9, 0, undefined, null, 63 - 48);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const frameMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const cf = new THREE.Mesh(cabFrame.build(), frameMat), cgm = new THREE.Mesh(cabGlass.build(), glassMat);
  cabin.add(cf, cgm); cabin.rotation.y = Math.atan2(otx, otz);
  g.add(cabin);

  // ---------- 메시 ----------
  const fm = new THREE.Mesh(frame.build(), frameMat); fm.name = 'myeongdong-station-frame'; fm.castShadow = true; fm.receiveShadow = true; g.add(fm);
  const gm = new THREE.Mesh(glass.build(), glassMat); gm.name = 'myeongdong-station-glass'; gm.renderOrder = 2; g.add(gm);
  const signMat = new THREE.MeshLambertMaterial({ map: atlas.texture, emissive: '#ffffff', emissiveMap: atlas.texture, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const sm = new THREE.Mesh(signs.build(), signMat); sm.name = 'myeongdong-station-signs'; g.add(sm);

  // ---------- 이름표 ----------
  if (overlay) {
    overlay.add({ cls: 'label landmark', text: '🚇 명동역 Myeongdong Stn. · 4호선 Line 4', getPos: () => new THREE.Vector3(st.x - 40, heightAt(st.x, st.z) + 12, st.z), maxDist: 900, minDist: 10 });
    for (const e of exits) overlay.add({ cls: 'label', text: `${e.ref}번 출구 Exit ${e.ref}`, getPos: () => new THREE.Vector3(e.x, heightAt(e.x, e.z) + 4.4, e.z), maxDist: 70, minDist: 3 });
    overlay.add({ cls: 'label landmark', text: '🚡 남산오르미 Namsan Oreumi → 🚠 케이블카 Cable Car', getPos: () => new THREE.Vector3(foot[0], yF + 7, foot[1]), maxDist: 600, minDist: 6 });
  }

  // ---------- 코스 (미니게임 C 훅) ----------
  const lower = namsan?.cable?.lower || CABLE_LOWER;
  const course = [
    { id: 'myeongdong-exit', ko: `명동역 ${exStart?.ref || ''}번 출구`, en: `Myeongdong Stn. Exit ${exStart?.ref || ''}`, x: startP[0], z: startP[1] },
    { id: 'oreumi-foot', ko: '남산오르미 승강장', en: 'Namsan Oreumi (inclined lift)', x: foot[0], z: foot[1] },
    { id: 'oreumi-top', ko: '남산오르미 위', en: 'Oreumi top', x: top[0], z: top[1] },
    { id: 'cable-lower', ko: '남산 케이블카 하부정류장', en: 'Namsan Cable Car (lower)', x: lower.x, z: lower.z },
    { id: 'ntower', ko: 'N서울타워', en: 'N Seoul Tower', x: CABLE_UPPER.x, z: CABLE_UPPER.z },
  ];

  // ---------- 충돌 ----------
  function isBlocked(x, z, r = 0.4) {
    for (const b of blockers) {
      const dx = x - b.cx, dz = z - b.cz;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      const u = dx * b.ax + dz * b.az, v = -dx * b.az + dz * b.ax;
      if (Math.abs(u) < b.hl + r && Math.abs(v) < b.hw + r) return true;
    }
    return false;
  }
  function near(x, z, r = 4) {
    for (const b of blockers) if (Math.hypot(x - b.cx, z - b.cz) < b.hl + r) return true;
    if (distToSeg(x, z, foot[0], foot[1], top[0], top[1]) < r + 2) return true;
    for (const b of boards) if (Math.hypot(x - b.x, z - b.z) < r * 0.4) return true;
    return false;
  }

  let t = 0;
  return {
    group: g,
    spawn,
    spawnFace,
    near,
    isBlocked,
    info: { x: st.x, z: st.z, name: '명동', nameEn: 'Myeongdong', line: '4호선', color: '#00A5DE', exits: exits.map((e) => ({ ref: e.ref, x: e.x, z: e.z })), pathLen: Math.round(pathLen) },
    mini: { x: st.x, z: st.z, name: '명동', nameEn: 'Myeongdong', lines: ['4호선'], exits: exits.map((e) => ({ ref: e.ref, x: e.x, z: e.z })), guide: path.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]), oreumi: [foot, top] },
    course,
    guidePath: path,
    setNight(v) { signMat.emissiveIntensity = 0.25 + v * 0.95; },
    update(dt) {
      // 오르미 캐빈: 정류장에서 6초 쉬고 25초 동안 오르내림
      t = (t + dt) % 62;
      const ph = t < 6 ? 0 : t < 31 ? (t - 6) / 25 : t < 37 ? 1 : 1 - (t - 37) / 25;
      const s = ph * ph * (3 - 2 * ph);
      cabin.position.set(foot[0] + otx * oL * s, deckY(s) + 0.2, foot[1] + otz * oL * s);
    },
  };
}
