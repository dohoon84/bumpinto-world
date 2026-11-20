// [depot-underpass] 정자동 '토끼굴' — 두산타워 앞 횡단보도를 건너 경부고속도로 밑을 지나는 보행 지하통로 (범창고 가는 길).
//   실제: 성남시 분당구 정자동 184-1 지하통로. 두산타워 쪽(동) 입구는 횡단보도에서 내려오는 20 m 지붕 계단(나무), 터널은 차량 통행 불가·조명 밝음,
//   반대편(서)은 한국도로공사 교통센터(대왕판교로 246, 금곡동) 쪽으로 나온다. (성남시 2025-08-13 보도자료 · 네이버 블로그 후기)
//   게임 안: 일직선 한 줄(축) 위에 [동 계단 20 m] [터널 116 m] [서 계단 20 m]. 계단 윗부분 13 m 는 뚫린 도랑(스텐실 구멍), 나머지는 땅 밑(덮임).
//   · 바닥: terrain.addGroundSurface — 플레이어가 이미 도랑/터널 안(refY 가 바닥 근처)일 때만 그 높이. 지상(refY≈0)에선 아무 영향 없음 → 터널 위 고속도로는 그대로 걷고 달림.
//   · 벽: 폭 3.5 m 밖은 표면이 안 잡혀 0 m(지상) → canMove 단차 > 0.5 로 막힘. 도랑 둘레 난간(0.45 m)은 blocks().
//   · 그리기: 구멍 = 스텐실 mark(1000) → 깊이 비우기(1001) → 땅 밑 전부(1002, 한 메시·아틀라스) = draw call 3. 지상 횡단보도 줄무늬 1 → 총 4.
//     땅 밑에 있는 내 아바타는 renderOrder 1003 으로 다시 그려 구멍 안에서 보이게 한다(지상 깊이에 가려 구멍 밖에선 안 보임).
//   · 카메라: 터널(덮인 구간) 안에서는 붐을 터널 부피 안으로 줄이고 마지막에 한 번 더 가둔다.
//   ?underpass=0 이면 만들지 않음.
import * as THREE from 'three';
import { createAtlas, fitText, roundRect, FONT } from '../subway/geom.js';

// ---------- 배치 (월드 좌표, 정자 로컬) ----------
export const UP = (() => {
  const O = [-352.0, 308.0], E = [-508.0, 308.0]; // 축을 x 와 나란히: 벽이 축과 나란해야 벽을 따라 미끄러진다(축별 충돌)
  const L = Math.hypot(E[0] - O[0], E[1] - O[1]);
  const ux = (E[0] - O[0]) / L, uz = (E[1] - O[1]) / L;
  return Object.freeze({
    O, E, L, ux, uz, nx: -uz, nz: ux,   // n = 진행 방향(서쪽) 기준 오른쪽(= 북쪽, −z)
    HALF: 2.0,        // 안쪽 벽까지 반폭
    WALK: 1.75,       // 걸을 수 있는 반폭 (벽에서 0.25 m 띄움)
    STAIR: 20,        // 계단 수평 길이
    N: 22, DROP: 0.2, // 22단 × 0.2 m = 4.4 m
    DEPTH: 4.4, CLEAR: 3.0, OPEN: 15,
    DOOR_AFTER_EXIT: 192, // 서쪽 출구 → 범창고 문 (대략 m)
  });
})();
const RUN = UP.STAIR / UP.N;
const S_E = UP.STAIR, S_W = UP.L - UP.STAIR;

// 지상 횡단보도 (OSM way 1273791616 의 양 끝): 두산타워 쪽 인도 → 분당수서로 양방향 → 서쪽 인도(계단 입구 앞)
export const CROSSWALK = Object.freeze({ a: [-307.0, 321.8], b: [-349.0, 311.9] });
// 길찾기 점 (범창고 안내선용): 횡단보도 서쪽 끝 → 계단 위 → 터널 → 서쪽 출구 위
export const UNDERPASS_ROUTE = Object.freeze([[-349.0, 311.9], [UP.O[0], UP.O[1]], [UP.E[0], UP.E[1]]]);

const toWorld = (s, t) => [UP.O[0] + UP.ux * s + UP.nx * t, UP.O[1] + UP.uz * s + UP.nz * t];
export function locate(x, z) {
  const dx = x - UP.O[0], dz = z - UP.O[1];
  return { s: dx * UP.ux + dz * UP.uz, t: dx * UP.nx + dz * UP.nz };
}
// 계단식 바닥 높이 (s ∈ [0, L])
export function floorAt(s) {
  if (s < S_E) return -UP.DROP * Math.min(UP.N, Math.floor(Math.max(0, s) / RUN));
  if (s < S_W) return -UP.DEPTH;
  return -UP.DROP * Math.min(UP.N, Math.floor(Math.max(0, UP.L - s) / RUN));
}
const smoothDrop = (s) => (UP.DEPTH / UP.STAIR) * s;
// 땅 밑 천장 아래면 높이 (열린 구간은 +∞)
export function ceilAt(s) {
  const u = Math.min(s, UP.L - s);
  if (u < UP.OPEN) return Infinity;
  if (u < UP.STAIR) return UP.CLEAR - smoothDrop(u);
  return UP.CLEAR - UP.DEPTH;
}
const inRange = (s) => s >= 0 && s <= UP.L;

// ---------- 메시 조립 ----------
function mesher(tileWhite) {
  const pos = [], col = [], uv = [], nor = [];
  const c = new THREE.Color();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  function tri(p, q, r, color, k, uvs) {
    A.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); B.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]); N.crossVectors(A, B).normalize();
    c.set(color);
    for (let i = 0; i < 3; i++) { pos.push(...[p, q, r][i]); col.push(c.r * k, c.g * k, c.b * k); uv.push(...uvs[i]); nor.push(N.x, N.y, N.z); }
  }
  const M = {
    // 네 점(둘레 순서) 사각형. k = 밝기, uvr = {u0,v0,u1,v1} 이면 a=좌하 b=우하 c=우상 d=좌상
    quad(a, b, cc, d, color, k = 1, uvr = null) {
      const w = uvr || tileWhite;
      const ua = [w.u0, w.v0], ub = [w.u1, w.v0], uc = [w.u1, w.v1], ud = [w.u0, w.v1];
      tri(a, b, cc, color, k, [ua, ub, uc]); tri(a, cc, d, color, k, [ua, uc, ud]);
    },
    // 축 좌표 상자: s0..s1 · t0..t1 · y0..y1
    box(s0, s1, t0, t1, y0, y1, color, kk = {}) {
      const P = (s, t, y) => { const [x, z] = toWorld(s, t); return [x, y, z]; };
      const top = kk.top ?? 1, side = kk.side ?? 0.82, bot = kk.bot ?? 0.62;
      M.quad(P(s0, t0, y1), P(s1, t0, y1), P(s1, t1, y1), P(s0, t1, y1), color, top);
      M.quad(P(s0, t1, y0), P(s1, t1, y0), P(s1, t0, y0), P(s0, t0, y0), color, bot);
      M.quad(P(s0, t0, y0), P(s1, t0, y0), P(s1, t0, y1), P(s0, t0, y1), color, side);
      M.quad(P(s1, t1, y0), P(s0, t1, y0), P(s0, t1, y1), P(s1, t1, y1), color, side);
      M.quad(P(s0, t1, y0), P(s0, t0, y0), P(s0, t0, y1), P(s0, t1, y1), color, side * 0.95);
      M.quad(P(s1, t0, y0), P(s1, t1, y0), P(s1, t1, y1), P(s1, t0, y1), color, side * 0.95);
    },
    // 높이가 s 에 따라 변하는 띠 (바닥·천장·벽 면 한 칸): 가로 s0→s1, 세로 y(s) 구간
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeBoundingSphere();
      return g;
    },
    get verts() { return pos.length / 3; },
  };
  return M;
}

// ---------- 간판 아틀라스 ----------
const GREEN = '#1E5A45', GOLD = '#F2C230', CREAM = '#F3EADA';
function signTile(ctx, w, h, { ko, en, sub, arrow = null, bg = GREEN, fg = '#fff', accent = GOLD }) {
  ctx.fillStyle = bg; roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = accent; roundRect(ctx, 7, 7, w - 14, h - 14, 11); ctx.stroke();
  ctx.textBaseline = 'middle';
  const padL = arrow === 'L' ? h * 0.95 : 26, padR = arrow === 'R' ? h * 0.95 : 26;
  const tw = w - padL - padR;
  ctx.textAlign = 'left'; ctx.fillStyle = fg;
  fitText(ctx, ko, tw, Math.round(h * 0.38), 900); ctx.fillText(ko, padL, h * 0.34);
  ctx.fillStyle = accent; fitText(ctx, en, tw, Math.round(h * 0.2), 800); ctx.fillText(en, padL, h * 0.63);
  if (sub) { ctx.fillStyle = '#d6e7de'; fitText(ctx, sub, tw, Math.round(h * 0.17), 700); ctx.fillText(sub, padL, h * 0.85); }
  if (arrow) { // 화면 기준 ◀ ▶
    const cx = arrow === 'L' ? h * 0.46 : w - h * 0.46, cy = h / 2, r = h * 0.3, d = arrow === 'L' ? -1 : 1;
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(cx + d * r, cy); ctx.lineTo(cx - d * r * 0.7, cy - r); ctx.lineTo(cx - d * r * 0.7, cy + r); ctx.closePath(); ctx.fill();
  }
}
function plaqueTile(ctx, w, h) {
  ctx.fillStyle = '#2b3036'; roundRect(ctx, 2, 2, w - 4, h - 4, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  fitText(ctx, '정자동 지하보도 (토끼굴)', w - 40, Math.round(h * 0.34), 900); ctx.fillText('정자동 지하보도 (토끼굴)', w / 2, h * 0.3);
  ctx.fillStyle = GOLD; fitText(ctx, 'Jeongja Pedestrian Underpass', w - 40, Math.round(h * 0.2), 800); ctx.fillText('Jeongja Pedestrian Underpass', w / 2, h * 0.58);
  ctx.fillStyle = '#c9d1d9'; fitText(ctx, '경부고속도로 아래 · 보행자 전용 · 약 140 m', w - 40, Math.round(h * 0.16), 700); ctx.fillText('경부고속도로 아래 · 보행자 전용 · 약 140 m', w / 2, h * 0.84);
}

// ---------- 마운트 ----------
export function mountUnderpass({ scene, overlay = null, terrain, getPlayer, getBikeState = null, search = typeof location !== 'undefined' ? location.search : '' } = {}) {
  const prm = new URLSearchParams(search);
  if (prm.get('underpass') === '0' || !terrain?.addGroundSurface) return null;

  // 1) 걸을 수 있는 표면
  const MAXSTEP = 0.55;
  const surface = (x, z, refY) => {
    const dx = x - UP.O[0], dz = z - UP.O[1];
    if (dx > 6 || dx < UP.E[0] - UP.O[0] - 6) return null; // 빠른 거름 (축은 거의 x 방향)
    const s = dx * UP.ux + dz * UP.uz, t = dx * UP.nx + dz * UP.nz;
    if (s < 0 || s > UP.L || Math.abs(t) > UP.WALK) return null;
    const f = floorAt(s);
    if (!(refY - f <= MAXSTEP)) return null; // 지상(또는 Infinity) 에서 온 값은 무시 → 터널 위 고속도로는 그대로
    return f;
  };
  const offSurface = terrain.addGroundSurface(surface);

  // 2) 간판 아틀라스
  const ATW = 1024, ATH = 1024;
  const atlas = createAtlas(ATW, ATH, 'underpass');
  const SW = 504, SH = 160;
  const tile = (o) => atlas.add(SW, SH, (c, w, h) => signTile(c, w, h, o));
  const tGateE = tile({ ko: '토끼굴 · 지하보도', en: 'UNDERPASS  ·  Under the Expressway', sub: '범창고 · 한국도로공사 방면 (서쪽)' });
  const tGateW = tile({ ko: '토끼굴 · 지하보도', en: 'UNDERPASS  ·  Jeongja / Doosan Tower', sub: '두산타워 · 정자역 방면 (동쪽)' });
  const tDepotOut = tile({ ko: '범창고 BUMP DEPOT', en: 'This way ← about 190 m', sub: '남쪽으로 쭉 · 대왕판교로 쪽 큰 건물', arrow: 'L' });
  const tDepotCW = tile({ ko: '범창고  BUMP DEPOT', en: 'Cross here, then the Underpass (토끼굴)', sub: '횡단보도 건너 지하보도(토끼굴) · 도보 약 4분' });
  const tCross = tile({ ko: '지하보도 입구', en: 'Underpass entrance', sub: '이 앞 계단으로 내려가세요  ▼' });
  const depotDist = [];
  const tWallDepot = [], tWallDoosan = [];
  for (const s of [44, 82, 120]) {
    const d = Math.round((UP.L - s + UP.DOOR_AFTER_EXIT) / 10) * 10;
    tWallDepot.push([s, tile({ ko: '범창고 BUMP DEPOT', en: `West exit  ›  ${d} m to the store`, sub: `서쪽 출구까지 ${Math.round((UP.L - s - 20) / 5) * 5} m`, arrow: 'L' })]);
    depotDist.push(d);
  }
  for (const s of [44, 82, 120]) {
    tWallDoosan.push([s, tile({ ko: '두산타워 · 정자역', en: `East exit  ›  Doosan Tower`, sub: `동쪽 출구까지 ${Math.round((s - 20) / 5) * 5} m`, arrow: 'L', bg: '#233a5c' })]);
  }
  const tPlaque = atlas.add(SW, SH, (c, w, h) => plaqueTile(c, w, h));
  const white = atlas.add(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  const tex = atlas.texture();

  // 3) 땅 밑 + 지상 구조 (한 메시)
  const M = mesher(white);
  const P3 = (s, t, y) => { const [x, z] = toWorld(s, t); return [x, y, z]; };
  const H = UP.HALF, HW = UP.WALK;
  const WOOD = '#b98a57', WOOD_D = '#8a6238', CONC = '#c9c6bd', CONC_D = '#a7a49b', TILE = '#e4e1d8', FLOOR_A = '#9b9a95', FLOOR_B = '#8e8d88';
  const lampK = (s) => 0.82 + 0.18 * Math.pow(Math.cos((s / 8) * Math.PI), 2); // 8 m 마다 밝은 곳
  const sh = (s, y) => Math.max(0.55, 1 + y * 0.045) * lampK(s); // 깊을수록 살짝 어둡게

  // 3a) 계단 (동: s 0..20, 서: s 136..156) — 디딤판(나무) + 챌판
  const stairs = (sFrom, dir) => {
    for (let k = 0; k < UP.N; k++) {
      const a = sFrom + dir * k * RUN, b = sFrom + dir * (k + 1) * RUN, s0 = Math.min(a, b), s1 = Math.max(a, b);
      const y = -UP.DROP * k, mid = (s0 + s1) / 2;
      const kk = sh(mid, y);
      M.quad(P3(s0, -H, y), P3(s1, -H, y), P3(s1, H, y), P3(s0, H, y), k % 2 ? WOOD : '#c4955f', kk);
      M.quad(P3(s0, -H, y - UP.DROP), P3(s0, H, y - UP.DROP), P3(s0, H, y), P3(s0, -H, y), WOOD_D, kk * 0.7); // 챌판(안쪽 면) — 반대쪽은 이중면 아님이라 양방향 모두
      M.quad(P3(s1, -H, y - UP.DROP), P3(s1, H, y - UP.DROP), P3(s1, H, y), P3(s1, -H, y), WOOD_D, kk * 0.7);
      M.quad(P3(s0, -H, y + 0.002), P3(s1, -H, y + 0.002), P3(s1, -H + 0.12, y + 0.002), P3(s0, -H + 0.12, y + 0.002), '#e5ad00', kk); // 코 미끄럼 방지 띠(양끝)
      M.quad(P3(s0, H - 0.12, y + 0.002), P3(s1, H - 0.12, y + 0.002), P3(s1, H, y + 0.002), P3(s0, H, y + 0.002), '#e5ad00', kk);
    }
  };
  stairs(0, 1);
  stairs(UP.L, -1);
  // 윗단(s<RUN) 앞 포장 + 서쪽도 : 지면과 맞닿는 곳이 비어 보이지 않게 얇은 포장
  // 3b) 터널 바닥 (s 20..136): 2 m 마다 색 교대, 가운데 안내선
  for (let s = S_E; s < S_W - 1e-6; s += 2) {
    const e = Math.min(s + 2, S_W), c = ((s - S_E) / 2) % 2 ? FLOOR_A : FLOOR_B, kk = lampK(s + 1);
    M.quad(P3(s, -H, -UP.DEPTH), P3(e, -H, -UP.DEPTH), P3(e, H, -UP.DEPTH), P3(s, H, -UP.DEPTH), c, kk);
  }
  M.quad(P3(S_E, -0.07, -UP.DEPTH + 0.004), P3(S_W, -0.07, -UP.DEPTH + 0.004), P3(S_W, 0.07, -UP.DEPTH + 0.004), P3(S_E, 0.07, -UP.DEPTH + 0.004), GREEN, 0.95);
  // 3c) 벽 — 계단 구간은 칸마다 높이가 달라서 한 칸씩, 터널은 4 m 칸
  const wallCols = [];
  for (let k = 0; k < UP.N; k++) wallCols.push([k * RUN, (k + 1) * RUN]);
  wallCols.push([S_E, S_W]);
  for (let k = 0; k < UP.N; k++) wallCols.push([S_W + k * RUN, S_W + (k + 1) * RUN]);
  const wallTop = (s) => { const c = ceilAt(s); return Number.isFinite(c) ? c : 0.0; };
  for (const [s0, s1] of wallCols) {
    const long = s1 - s0 > 10;
    const steps = long ? Math.ceil((s1 - s0) / 4) : 1;
    for (let i = 0; i < steps; i++) {
      const a = s0 + ((s1 - s0) * i) / steps, b = s0 + ((s1 - s0) * (i + 1)) / steps, mid = (a + b) / 2;
      const yb = floorAt(mid) - UP.DROP, ta = Number.isFinite(ceilAt(a)) ? ceilAt(a) : 0.0, tb = Number.isFinite(ceilAt(b)) ? ceilAt(b) : 0.0;
      const kk = sh(mid, yb);
      for (const t of [-H, H]) {
        const col = (Math.abs(t) > 0 && !long) ? CONC : TILE;
        M.quad(P3(a, t, yb), P3(b, t, yb), P3(b, t, tb), P3(a, t, ta), col, kk * 0.92);
      }
    }
  }
  void wallTop;
  // 벽 녹색 띠(범창고 색, 터널 안내선) — 벽 높이 1.0~1.18 (바닥 기준)
  for (const t of [-H + 0.005, H - 0.005]) {
    const tt = t < 0 ? -H + 0.005 : H - 0.005;
    M.quad(P3(S_E, tt, -UP.DEPTH + 1.0), P3(S_W, tt, -UP.DEPTH + 1.0), P3(S_W, tt, -UP.DEPTH + 1.2), P3(S_E, tt, -UP.DEPTH + 1.2), GREEN, 0.95);
  }
  // 3d) 천장 + 조명 (덮인 구간: 동 s 13..20 경사, 20..136 평평, 서 136..143 경사)
  const ceilQuad = (a, b) => {
    const ca = ceilAt(a), cb = ceilAt(b);
    M.quad(P3(a, -H, ca), P3(b, -H, cb), P3(b, H, cb), P3(a, H, ca), '#d9d6cd', 0.9 * lampK((a + b) / 2));
  };
  for (const [a0, a1] of [[UP.OPEN, UP.STAIR]]) for (let s = a0; s < a1 - 1e-6; s += 1) ceilQuad(s, Math.min(s + 1, a1));
  for (const [a0, a1] of [[UP.L - UP.STAIR, UP.L - UP.OPEN]]) for (let s = a0; s < a1 - 1e-6; s += 1) ceilQuad(s, Math.min(s + 1, a1));
  for (let s = S_E; s < S_W - 1e-6; s += 8) ceilQuad(s, Math.min(s + 8, S_W));
  // 조명(LED 띠): 터널 8 m 마다 + 계단 덮인 구간 + 열린 도랑 벽 아래 (밝은 면)
  for (let s = S_E + 3; s < S_W - 2; s += 8) {
    const y = ceilAt(s) - 0.012;
    M.quad(P3(s, -0.55, y), P3(s + 2.4, -0.55, y), P3(s + 2.4, 0.55, y), P3(s, 0.55, y), '#fff7e0', 1.35);
  }
  for (const s of [15.9, 18.6]) for (const [ss, dd] of [[s, 0], [UP.L - s - 1.0, 0]]) {
    void dd; const y = ceilAt(ss) - 0.012; M.quad(P3(ss, -0.5, y), P3(ss + 1.0, -0.5, y), P3(ss + 1.0, 0.5, y), P3(ss, 0.5, y), '#fff7e0', 1.35);
  }
  // 3e) 도랑 끝 이마(린텔): 열린 구간이 끝나는 곳에서 천장 위~지면 사이를 막아 구멍으로 땅속이 비치지 않게
  for (const [s, sd] of [[UP.OPEN, 1], [UP.L - UP.OPEN, -1]]) {
    void sd; const c = ceilAt(s + (s < 50 ? 0.01 : -0.01));
    M.quad(P3(s, -H, c), P3(s, H, c), P3(s, H, 0.02), P3(s, -H, 0.02), CONC_D, 0.8);
  }
  // 3f) 도랑 난간·측벽 윗면 (지상: 높이 0.45, 도랑 길이 0~13 / 143~156) + 나무 손잡이(계단 경사 따라)
  for (const [a, b] of [[0.9, UP.OPEN + 0.25], [UP.L - UP.OPEN - 0.25, UP.L - 0.9]]) {
    for (const [t0, t1] of [[-H - 0.25, -H], [H, H + 0.25]]) M.box(a, b, t0, t1, -0.3, 0.45, CONC, { top: 1.05, side: 0.9 });
  }
  const rail = (sFrom, dir, tt) => {
    const s0 = sFrom, s1 = sFrom + dir * (UP.OPEN + 0.1);
    const yTop0 = 0.95, yTop1 = 0.95 - smoothDrop(UP.OPEN + 0.1) + 0.1;
    const rs = (s, y) => P3(s, tt, y);
    // 얇은 막대 (위 + 옆 면)
    M.quad(rs(s0, yTop0), rs(s1, yTop1), rs(s1, yTop1 + 0.06), rs(s0, yTop0 + 0.06), WOOD, 1);
    M.quad(P3(s0, tt - 0.04, yTop0 + 0.06), P3(s1, tt - 0.04, yTop1 + 0.06), P3(s1, tt + 0.04, yTop1 + 0.06), P3(s0, tt + 0.04, yTop0 + 0.06), '#d3a56d', 1);
  };
  for (const tt of [-HW + 0.1, HW - 0.1]) { rail(0.3, 1, tt); rail(UP.L - 0.3, -1, tt); }
  // 3g) 지붕 있는 나무 계단(그늘막): 기둥·보·서까래 — 지붕 널은 틈을 둬서 위에서 아래가 보임
  const pergola = (sFrom, dir) => {
    const top = 2.75;
    for (let i = 0; i < 5; i++) {
      const s = sFrom + dir * (0.9 + i * 3.6);
      for (const t of [-H + 0.08, H - 0.08]) {
        const f = floorAt(s);
        M.box(s - 0.08, s + 0.08, t - 0.08, t + 0.08, f, top, WOOD_D, { top: 1, side: 0.85 });
      }
      M.box(s - 0.1, s + 0.1, -H - 0.1, H + 0.1, top, top + 0.2, WOOD, { top: 1.02, side: 0.9 });
    }
    for (let j = 0; j < 9; j++) { // 서까래: 진행 방향 널 (가로로 9개)
      const t = -H + 0.1 + (j * (2 * H - 0.2)) / 8;
      M.box(Math.min(sFrom, sFrom + dir * 15.3) - 0.1, Math.max(sFrom, sFrom + dir * 15.3) + 0.1, t - 0.05, t + 0.05, top + 0.2, top + 0.27, WOOD, { top: 1.02, side: 0.9 });
    }
  };
  pergola(0, 1); pergola(UP.L, -1);
  // 3h) 간판 (이중면 판 + 기둥)
  const board = (s, t, y, w, h, uvr, faceDir) => { // faceDir: +1 이면 +s 쪽(터널 안 방향)을 바라봄(읽는 사람은 −s 쪽에서 오는 게 아님) ; 사각형: 읽는 사람 기준 좌→우
    // 읽는 사람이 +s 방향(서쪽)을 보고 서 있으면 오른쪽 = n(+t). 그 반대면 −n.
    const r = faceDir > 0 ? 1 : -1;
    M.quad(P3(s, t - r * w / 2, y - h / 2), P3(s, t + r * w / 2, y - h / 2), P3(s, t + r * w / 2, y + h / 2), P3(s, t - r * w / 2, y + h / 2), '#ffffff', 1, uvr);
  };
  // 입구 문 간판 (두 면): 동쪽 계단 시작 보 위쪽 / 서쪽 계단 시작 보
  board(-0.05, 0, 3.4, 3.0, 0.94, tGateE, +1);     // 동쪽 입구: 동쪽(−s)에서 서쪽을 보고 오는 사람이 읽음 (가장 동쪽 면)
  board(0.12, 0, 3.4, 3.0, 0.94, tGateW, -1);      // 같은 보의 안쪽 면: 계단을 올라 나오는(동쪽을 보는) 사람
  board(UP.L - 0.12, 0, 3.4, 3.0, 0.94, tGateE, +1);   // 서쪽 출구: 터널에서 올라와 서쪽을 보는 사람 → 범창고
  board(UP.L + 0.05, 0, 3.4, 3.0, 0.94, tGateW, -1);   // 서쪽에서 동쪽을 보고 들어가는 사람 → 두산타워 방면
  // 간판 매다는 줄 (기둥 2개)
  for (const s of [0.06, UP.L - 0.06]) for (const t of [-1.6, 1.6]) M.box(s - 0.04, s + 0.04, t - 0.04, t + 0.04, 2.95, 3.9, '#4a4d52');
  // 터널 안 벽 간판 (오른쪽 벽: 범창고 ◀, 왼쪽 벽: 두산타워 ◀) + 입구 안내판
  for (const [s, uvr] of tWallDepot) { // 오른쪽 벽(t=+H): 서쪽(+s)으로 가는 사람이 오른쪽을 봄 → 읽는 사람은 −n 방향을 보고 서 있음
    const [x, z] = toWorld(s, H - 0.012);
    const r = [-UP.ux, -UP.uz]; // 화면 오른쪽 = 동쪽(−u)
    const y = -UP.DEPTH + 1.75, w = 2.4, hh = 0.75;
    M.quad([x - r[0] * w / 2, y - hh / 2, z - r[1] * w / 2], [x + r[0] * w / 2, y - hh / 2, z + r[1] * w / 2], [x + r[0] * w / 2, y + hh / 2, z + r[1] * w / 2], [x - r[0] * w / 2, y + hh / 2, z - r[1] * w / 2], '#ffffff', 1, uvr);
  }
  for (const [s, uvr] of tWallDoosan) { // 왼쪽 벽(t=−H): 동쪽으로 가는 사람이 오른쪽(= −n)을 봄. 읽는 사람 화면 오른쪽 = +u
    const [x, z] = toWorld(s + 14, -H + 0.012);
    const r = [UP.ux, UP.uz];
    const y = -UP.DEPTH + 1.75, w = 2.4, hh = 0.75;
    M.quad([x - r[0] * w / 2, y - hh / 2, z - r[1] * w / 2], [x + r[0] * w / 2, y - hh / 2, z + r[1] * w / 2], [x + r[0] * w / 2, y + hh / 2, z + r[1] * w / 2], [x - r[0] * w / 2, y + hh / 2, z - r[1] * w / 2], '#ffffff', 1, uvr);
  }
  for (const side of [-1, 1]) { // 터널 들머리 설명판(양쪽 벽)
    const s = S_E + 4, [x, z] = toWorld(s, side * (H - 0.012));
    const r = side > 0 ? [-UP.ux, -UP.uz] : [UP.ux, UP.uz];
    const y = -UP.DEPTH + 1.75, w = 2.8, hh = 0.875;
    M.quad([x - r[0] * w / 2, y - hh / 2, z - r[1] * w / 2], [x + r[0] * w / 2, y - hh / 2, z + r[1] * w / 2], [x + r[0] * w / 2, y + hh / 2, z + r[1] * w / 2], [x - r[0] * w / 2, y + hh / 2, z - r[1] * w / 2], '#ffffff', 1, tPlaque);
  }
  // 3i) 지상 길가 표지: 횡단보도 서쪽 끝(계단 입구 앞) · 두산타워 쪽 횡단보도 시작 · 서쪽 출구 앞
  const post = (x, z, faceYaw, uvr, w = 2.6) => { // faceYaw: 판이 바라보는 방향(+z 기준, three yaw). 읽는 사람 화면 오른쪽 = (cosYaw, −sinYaw)
    const hh = w * (SH / SW), y = 2.75;
    const r = [Math.cos(faceYaw), -Math.sin(faceYaw)];
    for (const sg of [1]) {
      const ox = x + Math.sin(faceYaw) * 0.07, oz = z + Math.cos(faceYaw) * 0.07;
      M.quad([ox - r[0] * w / 2, y - hh / 2, oz - r[1] * w / 2], [ox + r[0] * w / 2, y - hh / 2, oz + r[1] * w / 2], [ox + r[0] * w / 2, y + hh / 2, oz + r[1] * w / 2], [ox - r[0] * w / 2, y + hh / 2, oz - r[1] * w / 2], '#ffffff', 1, uvr);
      void sg;
    }
    // 뒷면
    const bx = x - Math.sin(faceYaw) * 0.07, bz = z - Math.cos(faceYaw) * 0.07;
    M.quad([bx + r[0] * w / 2, y - hh / 2, bz + r[1] * w / 2], [bx - r[0] * w / 2, y - hh / 2, bz - r[1] * w / 2], [bx - r[0] * w / 2, y + hh / 2, bz - r[1] * w / 2], [bx + r[0] * w / 2, y + hh / 2, bz + r[1] * w / 2], '#ffffff', 0.9, uvr);
    M.box ? null : null;
  };
  const pole = (x, z) => { // 세로 기둥 (월드 축 정렬 작은 상자)
    const [ps, pt] = [(x - UP.O[0]) * UP.ux + (z - UP.O[1]) * UP.uz, (x - UP.O[0]) * UP.nx + (z - UP.O[1]) * UP.nz];
    M.box(ps - 0.06, ps + 0.06, pt - 0.06, pt + 0.06, 0, 3.4, '#3b4046');
  };
  const postAt = (x, z, yaw, uvr) => { pole(x, z); post(x, z, yaw, uvr); };
  postAt(-350.4, 314.2, Math.PI / 2, tCross);    // 횡단보도 서쪽 끝: 건너온(서쪽을 보는) 사람이 읽도록 동쪽(+x)을 향함
  postAt(-303.6, 325.4, Math.PI / 2, tDepotCW);   // 두산타워 쪽 횡단보도 시작 (서쪽을 보고 걸어오는 사람)
  postAt(-514.5, 312.4, Math.PI / 2, tDepotOut);  // 서쪽 출구 앞 (서쪽을 보고 나오는 사람, 범창고는 왼쪽=남쪽)

  const geo = M.geometry();
  const stats = { verts: M.verts };

  // 4) 구멍(스텐실) — 동 s 0..13 · 서 143..156
  const mk = new THREE.BufferGeometry();
  {
    const pos = [];
    const q = (s0, s1) => { const a = toWorld(s0, -H), b = toWorld(s1, -H), c = toWorld(s1, H), d = toWorld(s0, H), y = 0.135; pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]); };
    q(0, UP.OPEN); q(UP.L - UP.OPEN, UP.L);
    mk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  // 5) 지상 횡단보도 줄무늬 (분당수서로 양방향 차로 위)
  const zebra = new THREE.BufferGeometry();
  {
    const pos = [], col = [], uv = [];
    const [ax, az] = CROSSWALK.a, [bx, bz] = CROSSWALK.b, dl = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / dl, dz = (bz - az) / dl, px = -dz, pz = dx; // 걷는 방향 d, 가로 p
    const bar = (s0, s1, hw = 2.2) => {
      const y = 0.135, A = [ax + dx * s0 - px * hw, az + dz * s0 - pz * hw], B = [ax + dx * s1 - px * hw, az + dz * s1 - pz * hw], C = [ax + dx * s1 + px * hw, az + dz * s1 + pz * hw], D = [ax + dx * s0 + px * hw, az + dz * s0 + pz * hw];
      for (const p of [A, B, C, A, C, D]) { pos.push(p[0], y, p[1]); col.push(0.96, 0.96, 0.94); uv.push(0.5, 0.5); }
    };
    for (const [from, to] of [[0.8, 14.6], [26.4, 42.0]]) for (let s = from; s < to - 0.4; s += 1.0) bar(s, s + 0.5);
    zebra.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    zebra.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    zebra.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    zebra.computeVertexNormals();
  }

  // 6) 메시 올리기
  const group = new THREE.Group(); group.name = 'underpass';
  const mats = [];
  const under = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, side: THREE.DoubleSide, toneMapped: false }));
  under.renderOrder = 1002; under.name = 'underpass-body'; under.frustumCulled = true; mats.push(under.material);
  const S = { stencilWrite: true, stencilRef: 1 };
  const markMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide, ...S, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  const markMesh = new THREE.Mesh(mk, markMat); markMesh.renderOrder = 1000; markMesh.name = 'underpass-mark'; mats.push(markMat);
  const clearMat = new THREE.ShaderMaterial({
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main(){ gl_FragDepth = 1.0; gl_FragColor = vec4(0.0); }',
    colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth, side: THREE.DoubleSide, ...S, stencilFunc: THREE.EqualStencilFunc,
  });
  const clearMesh = new THREE.Mesh(mk, clearMat); clearMesh.renderOrder = 1001; clearMesh.name = 'underpass-clear'; mats.push(clearMat);
  const zebraMesh = new THREE.Mesh(zebra, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  zebraMesh.name = 'underpass-zebra'; zebraMesh.renderOrder = 2; mats.push(zebraMesh.material);
  // 구멍 근처에서만 평가 — 멀리선 통째로 숨김
  group.add(zebraMesh, markMesh, clearMesh, under);
  scene.add(group);

  // 7) 이름표
  const labels = [];
  if (overlay?.add) {
    const w = (s, text) => { const [x, z] = toWorld(s, 0); const v = new THREE.Vector3(x, 4.4, z); return overlay.add({ cls: 'label up-label', text, getPos: () => v, maxDist: 90, minDist: 0 }); };
    labels.push(w(0, '🚶 토끼굴 지하보도 → 범창고'), w(UP.L, '🚶 토끼굴 서쪽 출구 · 범창고 190 m'));
  }

  // 8) 충돌(난간) + 상태
  const inStrip = (s, t, r) => {
    for (const [a, b] of [[0.9, UP.OPEN + 0.25], [UP.L - UP.OPEN - 0.25, UP.L - 0.9]]) if (s > a - r && s < b + r && Math.abs(t) > H - r && Math.abs(t) < H + 0.25 + r) return true;
    return false;
  };
  const blocks = (x, z, r = 0.3) => {
    const dx = x - UP.O[0]; if (dx > 8 || dx < UP.E[0] - UP.O[0] - 8) return false;
    const { s, t } = locate(x, z);
    return s > -2 && s < UP.L + 2 && inStrip(s, t, Math.min(r, 0.3));
  };

  // 아바타 renderOrder: 땅 밑(구멍 안)에서는 1003 으로 구멍 뒤에 다시 그린다
  let lastPlayer = null, lastUnder = false;
  const setOrder = (obj, on) => obj.traverse((o) => { if (o.isMesh || o.isSprite || o.isLine || o.isPoints) { if (on) { if (o.userData._upRO == null) o.userData._upRO = o.renderOrder; o.renderOrder = 1003; } else if (o.userData._upRO != null) { o.renderOrder = o.userData._upRO; delete o.userData._upRO; } } });
  function isUnder(p) {
    if (!p || p.y > -0.12) return false;
    const { s, t } = locate(p.x, p.z);
    return inRange(s) && Math.abs(t) < H + 0.3;
  }
  // 덮인 터널 안에서는 카메라에 보일 리 없는 바깥 도시(건물·코리더·가로등 묶음)를 통째로 끈다 → draw call·그림자 패스 절약 (1000 이하 유지). 나오면 원래 켜져 있던 것만 되켜짐
  const OUTDOOR = ['jeongja-world', 'bp24Stores', 'corridor', 'playgrounds', 'streetlights', 'pangyoLamps', 'migeumLamps', 'gangnamNight', 'gangnamAds', 'gangnamNightlife', 'gangnamBrt'];
  const hidden = [];
  const style = typeof document !== 'undefined' ? document.createElement('style') : null;
  if (style) { style.textContent = 'body.bw-underpass .label:not(.up-label){display:none!important}'; document.head.appendChild(style); }
  function setDeep(on) {
    if (on && !hidden.length) {
      for (const ch of scene.children) if (OUTDOOR.includes(ch.name) && ch.visible) { ch.visible = false; hidden.push(ch); }
      if (hidden.length) document.body?.classList.add('bw-underpass');
    } else if (!on && hidden.length) {
      for (const ch of hidden) ch.visible = true;
      hidden.length = 0; document.body?.classList.remove('bw-underpass');
    }
  }
  function tick(player) {
    if (!player) return;
    const P = player.position;
    const near = Math.abs(P.x - (UP.O[0] + UP.E[0]) / 2) < 120 && Math.abs(P.z - UP.O[1]) < 120;
    group.visible = near || under.userData.keep === true;
    setDeep(covered(P));
    const u = isUnder(P);
    if (player !== lastPlayer || u !== lastUnder) {
      if (lastPlayer && lastPlayer !== player) setOrder(lastPlayer, false);
      setOrder(player, u);
      lastPlayer = player; lastUnder = u;
    }
  }
  // 덮인 터널 안인가 (카메라를 가둬야 함)
  function covered(P) {
    if (!P || P.y > -0.6) return false;
    const { s, t } = locate(P.x, P.z);
    return inRange(s) && Math.abs(t) < H + 0.3 && Math.min(s, UP.L - s) >= UP.OPEN + 0.5;
  }
  // 카메라 점이 터널 부피 밖이면 true (붐 줄이기용)
  function camBlocked(x, y, z) {
    const { s, t } = locate(x, z);
    if (!inRange(s) || Math.abs(t) > WALK_CAM) return true;
    return y > Math.min(ceilAt(s) - 0.22, -0.12) || y < floorAt(s) + 0.3;
  }
  const WALK_CAM = 1.75;
  function clampCamera(pos, P) {
    if (!covered(P)) return false;
    const { s, t } = locate(pos.x, pos.z);
    const cs = Math.max(0.3, Math.min(UP.L - 0.3, s)), ct = Math.max(-WALK_CAM, Math.min(WALK_CAM, t));
    const fl = floorAt(cs) + 0.35, ce = Math.min(ceilAt(cs) - 0.25, -0.15);
    const y = Math.max(fl, Math.min(ce, pos.y));
    if (cs === s && ct === t && y === pos.y) return false;
    const [x, z] = toWorld(cs, ct);
    pos.set(x, y, z);
    return true;
  }
  return {
    group, blocks, tick, covered, camBlocked, clampCamera, locate, stats,
    isUnder: (p) => isUnder(p),
    zone: (x, z) => { const { s, t } = locate(x, z); return inRange(s) && Math.abs(t) < H + 0.3 ? s : null; },
    dispose() {
      setDeep(false); style?.remove(); offSurface(); scene.remove(group);
      geo.dispose(); mk.dispose(); zebra.dispose(); for (const m of mats) m.dispose(); tex.dispose();
      for (const it of labels) overlay?.remove?.(it);
      if (lastPlayer) setOrder(lastPlayer, false);
    },
  };
}
export { FONT };
