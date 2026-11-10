// [pangyo-express] 판교 확장 3단계 — 판교IC고가차도 → 판교TG → 경부고속도로 서울 방향 합류 (pangyo/express.json, scripts/corridor/build-pangyo-express.mjs)
//   ?pangyoexpress=0 (또는 ?pangyo=0) 이면 요청·메시·버스 연장 전부 없음 → 2단계 그대로
//   - 구조물: 도로 상판·차선·방호벽·옹벽/상판 옆면·교각·요금소(캐노피·부스·하이패스/일반/버스 글자 표지, 로고 없음)·하이패스 게이트 → 메시 2개(낮 1 + 밤 조명 1)
//   - 판교 타일의 평면(0m) 고가차도 리본은 express.hide 서명과 같은 것만 빼고, 높이 있는 리본으로 대신 그림
//   - 버스: G8110 코리더 경로 끝에 램프 → 합류 → 본선 350m 를 이어 붙이고 끝에서 서서 사라짐(endStop)
//   - 높이: terrain 프록시(getVehicleHeight)에 고속도로 선 높이를 더함(보행자 getGroundHeight 는 그대로)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pangyoEnabled, PANGYO_DIR } from './pangyo.js';
import { ribbonGeo } from '../world.js';
import { watchEvening } from '../evening.js';
import { expressLayout } from './gyeongbuExpress.js';

export const PANGYO_EXPRESS_FILE = PANGYO_DIR + 'express.json';
export function pangyoExpressEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return pangyoEnabled(search) && new URLSearchParams(search).get('pangyoexpress') !== '0';
}

// ---------- 평면 고가차도 리본 숨기기 (타일 JSON 받은 직후, 원본 순서 유지) ----------
const near2 = (a, b) => Math.abs(a[0] - b[0]) < 0.25 && Math.abs(a[1] - b[1]) < 0.25;
export function filterExpressHidden(E, key, kind, j) {
  if (!E?.hide?.length || !j?.r?.length) return j;
  const hs = E.hide.filter((h) => h.key === key && h.kind === kind); if (!hs.length) return j;
  const hit = (r) => {
    if (Array.isArray(r)) { const f = r[2]; if (!f || f.length < 4) return false; const a = [f[0], f[1]], b = [f[f.length - 2], f[f.length - 1]]; return hs.some((h) => h.lk === r[1] && f.length / 2 === h.np && near2(a, h.a) && near2(b, h.b)); }
    return r.k === 'motorway_link' && r.p?.length && hs.some((h) => h.np === r.p.length && (h.n || '') === (r.n || '') && near2(r.p[0], h.a) && near2(r.p[r.p.length - 1], h.b));
  };
  const r = j.r.filter((x) => !hit(x));
  return r.length === j.r.length ? j : { ...j, r };
}

// ---------- 높이: 선 격자 ----------
export function expressHeightFn(E) {
  const CELL = 20, grid = new Map(), segs = [];
  for (const l of E.lines) for (let i = 1; i < l.pts.length; i++) {
    const a = l.pts[i - 1], b = l.pts[i], hw = Math.max(a[3], b[3]) / 2 + 1.5, s = { ax: a[0], az: a[1], ay: a[2], bx: b[0], bz: b[1], by: b[2], hw };
    segs.push(s);
    for (let x = Math.floor((Math.min(a[0], b[0]) - hw) / CELL); x <= Math.floor((Math.max(a[0], b[0]) + hw) / CELL); x++)
      for (let z = Math.floor((Math.min(a[1], b[1]) - hw) / CELL); z <= Math.floor((Math.max(a[1], b[1]) + hw) / CELL); z++) { const k = x * 100003 + z; (grid.get(k) || grid.set(k, []).get(k)).push(s); }
  }
  // (x, z) 의 고속도로 상판 높이(선 밖이면 null). dir 이 있으면 진행 방향이 선과 비슷한(cos > 0.7) 것만
  return function heightAt(x, z, dir = null) {
    const c = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)); if (!c) return null;
    let best = null;
    for (const s of c) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      if (Math.hypot(s.ax + dx * t - x, s.az + dz * t - z) > s.hw) continue;
      if (dir) { const L = Math.sqrt(L2); if ((dx * dir[0] + dz * dir[1]) / L < 0.7) continue; }
      const y = s.ay + (s.by - s.ay) * t; if (best == null || y > best) best = y;
    }
    return best;
  };
}
// 버스용 terrain 프록시: 선 위면 상판 높이(지금 높이 refY 보다 1.2m 넘게 높은 상판은 무시 → 고가 밑 대왕판교로 버스는 그대로 0m).
//   freshRef: 풀에서 새로 꺼낸 버스 메시의 기준 높이 — 진행 방향이 선과 같으면 상판, 선 위지만 방향이 다르면 0, 선 밖이면 null(기존 그대로)
export function withExpressTerrain(terrain, E) {
  if (!terrain || !E) return terrain;
  const h = expressHeightFn(E), base = terrain.getVehicleHeight || terrain.getGroundHeight;
  const getVehicleHeight = (x, z, refY = Infinity) => { const b = base(x, z, refY), e = h(x, z); return e == null || e > refY + 1.2 ? b : Math.max(b, e); };
  const freshRef = (x, z, heading) => { const e = h(x, z, [Math.sin(heading), Math.cos(heading)]); if (e != null) return e; return h(x, z) != null ? 0 : null; };
  return Object.assign(Object.create(terrain), { getVehicleHeight, vehicleY: getVehicleHeight, freshRef, expressHeight: h });
}
// link.json 의 G8110 코리더 경로에 고속도로 구간을 이어 붙인 사본(원본 객체는 그대로)
export function extendLinkWithExpress(L, E) {
  const B = E?.bus; if (!L?.corridor?.paths?.length || !B?.append?.length) return L;
  const paths = L.corridor.paths.map((p) => {
    if (p.route !== B.route) return p;
    const e = p.pts[p.pts.length - 1]; if (Math.hypot(e[0] - B.from[0], e[1] - B.from[1]) > 1) return p;
    return { ...p, pts: p.pts.concat(B.append), len: Math.round(p.len + B.addM), endStop: true, pangyoExpress: true };
  });
  return { ...L, corridor: { ...L.corridor, paths } };
}

// ---------- 메시 ----------

function loadGyeongbuTex(file) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  const tex = new THREE.TextureLoader().load(`${base}corridor/gyeongbu/${file}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 판교TG 차로. laneClear=주행 폭(섬과 섬 사이), pitch=섬 중심 간격. 버스(2.5m)보다 넓게 여유를 둔다. */
export function pangyoTollLayout(T) {
  const src = T?.booths;
  if (!src?.sets?.length) return null;
  const islandW = 1.9;
  const laneClear = 3.9;
  const pitch = islandW + laneClear; // 5.8
  const islandLen = 14;
  const sets = src.sets.map((S) => ({ ...S, at: S.at.slice(), dir: S.dir.slice() }));
  if (sets.length >= 2) {
    const a = sets[0], b = sets[1];
    const mx = (a.at[0] + b.at[0]) / 2, mz = (a.at[1] + b.at[1]) / 2;
    const dx = b.at[0] - a.at[0], dz = b.at[1] - a.at[1], L = Math.hypot(dx, dz) || 1;
    const want = Math.max(a.lanes, b.lanes) * pitch + 5;
    const ux = dx / L, uz = dz / L;
    a.at = [mx - ux * want / 2, mz - uz * want / 2];
    b.at = [mx + ux * want / 2, mz + uz * want / 2];
  }
  return { pitch, islandW, islandLen, laneClear, sets };
}

/** 요금소 기둥 발자국. 섬 중심과 같은 자리에만 세운다(차로 위 OSM 갠트리 기둥은 쓰지 않는다). */
export function pangyoTollSupports(layout, underside = 5.5) {
  if (!layout?.sets?.length) return [];
  const out = [];
  for (const S of layout.sets) {
    const ang = Math.atan2(S.dir[0], S.dir[1]);
    const px = S.dir[1], pz = -S.dir[0];
    for (let k = 0; k <= S.lanes; k++) {
      const o = (k - S.lanes / 2) * layout.pitch;
      const x = S.at[0] + px * o, z = S.at[1] + pz * o;
      out.push({
        x, z, w: 0.42, d: 0.42, ang, h: underside - 0.35,
        island: { x, z, w: layout.islandW, d: layout.islandLen, ang },
      });
    }
  }
  return out;
}

/** boxAt 과 같은 rotateY(ang) 기준의 회전 사각형 안인지. */
export function pointInRotatedRect(px, pz, cx, cz, w, d, ang) {
  const dx = px - cx, dz = pz - cz;
  const c = Math.cos(ang), s = Math.sin(ang);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= w / 2 + 0.04 && Math.abs(lz) <= d / 2 + 0.04;
}

export function pangyoTollLaneRects(layout) {
  if (!layout?.sets?.length) return [];
  const out = [];
  for (const S of layout.sets) {
    const ang = Math.atan2(S.dir[0], S.dir[1]);
    const px = S.dir[1], pz = -S.dir[0];
    for (let i = 0; i < S.lanes; i++) {
      const o = (i + 0.5 - S.lanes / 2) * layout.pitch;
      out.push({
        x: S.at[0] + px * o, z: S.at[1] + pz * o,
        w: layout.laneClear, d: layout.islandLen + 16, ang,
      });
    }
  }
  return out;
}

function addFacedSign(g, mat, w, h, x, y, z, face) {
  const nx = Math.sin(face), nz = Math.cos(face);
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x + nx * 0.03 * s, y, z + nz * 0.03 * s);
    m.rotation.y = s > 0 ? face : face + Math.PI;
    g.add(m);
  }
}

/** 판교TG 표지. 한국도로공사·하이패스 로고는 쓰지 않고 글자만 쓴다. 양면 모두 올바른 방향으로. */
function makePangyoTollSigns(T) {
  const layout = pangyoTollLayout(T);
  if (!layout) return null;
  const hipassMat = new THREE.MeshBasicMaterial({ map: loadGyeongbuTex('sign-hipass.png') });
  const generalMat = new THREE.MeshBasicMaterial({ map: loadGyeongbuTex('sign-general.png') });
  const busMat = new THREE.MeshBasicMaterial({ map: loadGyeongbuTex('sign-bus.png') });
  const fasciaMat = new THREE.MeshBasicMaterial({ map: loadGyeongbuTex('sign-toll.png') });
  const g = new THREE.Group();
  g.name = 'pangyoTollSigns';
  const { pitch, sets } = layout;
  const under = T.roof?.underside ?? 5.5;
  const thick = T.roof?.thick ?? 1.2;
  for (const S of sets) {
    const px = S.dir[1], pz = -S.dir[0];
    const face = Math.atan2(-S.dir[0], -S.dir[1]);
    for (let i = 0; i < S.lanes; i++) {
      const o = (i + 0.5 - S.lanes / 2) * pitch;
      const x = S.at[0] + px * o, z = S.at[1] + pz * o;
      const hipass = i >= S.lanes - 2;
      addFacedSign(g, hipass ? hipassMat : generalMat, 2.2, 0.6, x - S.dir[0] * 7.2, under - 0.55, z - S.dir[1] * 7.2, face);
      if (i === S.lanes - 1) {
        addFacedSign(g, busMat, 1.4, 0.4, x - S.dir[0] * 7.2, under - 1.05, z - S.dir[1] * 7.2, face);
      }
    }
    addFacedSign(g, fasciaMat, 16, 1.15, S.at[0] - S.dir[0] * 12.15, under + thick - 0.55, S.at[1] - S.dir[1] * 12.15, face);
  }
  return g;
}

const COL = { road: '#6b7077', mainRoad: '#61666d', line: '#f4f4f0', edge: '#e9e9e4', barrier: '#c9c7c0', side: '#b8b5ad', under: '#8e8b85', pier: '#aeaba3', wall: '#bdb6a8', canopy: '#e3e5e8', canopyEdge: '#9aa3ad', canopyUnder: '#c9ced4', island: '#d7d3c8', booth: '#eef1f4', boothGlass: '#7ea2bf', gantry: '#8a929b', lamp: '#fff2c8' };
const C3 = new THREE.Color();
function painted(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3); C3.set(color);
  for (let i = 0; i < n; i++) { a[i * 3] = C3.r; a[i * 3 + 1] = C3.g; a[i * 3 + 2] = C3.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g;
}
// 선을 따라 옆면(세로 띠): off = 중심선에서 옆 거리, top(i)/bot(i) = 점별 위/아래 높이
function sideStrip(pts, off, top, bot) {
  const pos = [], idx = [];
  const offAt = typeof off === 'function' ? off : () => off;
  const o0 = offAt(0);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const o = offAt(i);
    const x = pts[i][0] - dz * o, z = pts[i][1] + dx * o;
    pos.push(x, top(i), z, x, bot(i), z);
    if (i) { const k = (i - 1) * 2; if (o0 > 0) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function offsetPts(pts, off) {
  return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; return [p[0] - dz * off, p[1] + dx * off, p[2]]; });
}
function boxAt(w, h, d, x, y, z, ang = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ang) g.rotateY(ang); g.translate(x, y, z); return g; }
// 점선(차선 구분): 6m 칠, 12m 빔
function dashes(pts, off, y) {
  const P = offsetPts(pts, off), out = []; let acc = 0, on = true, cur = [P[0]], phase = 6;
  for (let i = 1; i < P.length; i++) {
    let a = P[i - 1]; const b = P[i]; let L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (L > 0) {
      const step = Math.min(L, phase - acc), t = step / L, m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      if (on) cur.push(m);
      acc += step; L -= step; a = m;
      if (acc >= phase - 1e-6) { if (on && cur.length > 1) out.push(ribbonGeo(cur, 0.15, y, false)); on = !on; acc = 0; phase = on ? 6 : 12; cur = [m]; }
    }
  }
  return out;
}
const runs = (l) => { const out = []; let cur = null; l.pts.forEach((p, i) => { if (l.draw?.[i] ?? 1) { if (!cur) out.push((cur = [])); cur.push(p); } else cur = null; }); return out.filter((r) => r.length > 1); };

function runLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

function piecesAway(pts, coverFn) {
  if (!coverFn) return [pts];
  const out = [];
  let cur = [];
  for (const p of pts) {
    const hw = Math.max(3.2, (p[3] || 8) / 2);
    if (!coverFn(p[0], p[1], hw)) cur.push(p);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.filter((r) => r.length > 1 && runLen(r) > 28);
}

function distToRun(x, z, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) best = d;
  }
  return best;
}

function dedupeChunks(chunks) {
  if (chunks.length < 2) return chunks;
  const scored = chunks.map((c, i) => ({ c, i, L: runLen(c) })).sort((a, b) => b.L - a.L);
  const drop = new Set();
  for (let i = 0; i < scored.length; i++) {
    if (drop.has(scored[i].i)) continue;
    for (let j = i + 1; j < scored.length; j++) {
      if (drop.has(scored[j].i)) continue;
      const b = scored[j].c;
      const step = Math.max(1, Math.floor(b.length / 14));
      let n = 0, near = 0;
      for (let k = 0; k < b.length; k += step) {
        n++;
        if (distToRun(b[k][0], b[k][1], scored[i].c) < 12) near++;
      }
      if (n && near / n >= 0.62) drop.add(scored[j].i);
    }
  }
  return chunks.filter((_, i) => !drop.has(i));
}

function towardCover(pts, fromStart, coverFn) {
  if (!coverFn || pts.length < 2) return false;
  const a = fromStart ? pts[0] : pts[pts.length - 1];
  const b = fromStart ? pts[1] : pts[pts.length - 2];
  const dx = a[0] - b[0], dz = a[1] - b[1], L = Math.hypot(dx, dz) || 1;
  const hw = Math.max(3.2, (a[3] || 8) / 2);
  return !!coverFn(a[0] + (dx / L) * 14, a[1] + (dz / L) * 14, hw);
}

function taperEnds(pts, coverFn, length = 28) {
  if (pts.length < 3 || length <= 0) return pts;
  const out = pts.map((p) => p.slice());
  const apply = (fromStart) => {
    const tip = fromStart ? out[0] : out[out.length - 1];
    // 이미 갓길로 줄어든 테이퍼, 또는 본선 안으로 잘린 고어는 폭을 더 줄이지 않는다.
    if ((tip[3] || 7) < 1.2) return;
    if (towardCover(pts, fromStart, coverFn)) return;
    let acc = 0;
    if (fromStart) {
      for (let i = 1; i < out.length && acc < length; i++) {
        acc += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
        const t = Math.max(0.55, acc / length);
        out[i - 1][3] = (out[i - 1][3] || 7) * t;
      }
    } else {
      for (let i = out.length - 1; i > 0 && acc < length; i--) {
        acc += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
        const t = Math.max(0.55, acc / length);
        out[i][3] = (out[i][3] || 7) * t;
      }
    }
  };
  apply(true); apply(false);
  return out;
}

function isExpressMainline(l) {
  return l?.role === 'mainline' || l?.id === 'mainNB' || l?.id === 'mainSB';
}

function nearestDeck(x, z, deckPts) {
  if (!deckPts || deckPts.length < 2) return null;
  let bestI = 1, bestT = 0, bestD = Infinity;
  for (let i = 1; i < deckPts.length; i++) {
    const ax = deckPts[i - 1][0], az = deckPts[i - 1][1];
    const bx = deckPts[i][0], bz = deckPts[i][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < bestD) { bestD = d; bestI = i; bestT = t; }
  }
  const ax = deckPts[bestI - 1][0], az = deckPts[bestI - 1][1];
  const bx = deckPts[bestI][0], bz = deckPts[bestI][1];
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  const hx = dx / L, hz = dz / L;
  return { i: bestI, t: bestT, d: bestD, x: ax + dx * bestT, z: az + dz * bestT, hx, hz, lx: hz, lz: -hx };
}

function walkDeckFrom(deckPts, near, dist) {
  if (!near) return near;
  if (Math.abs(dist) < 1e-6) return { x: near.x, z: near.z, hx: near.hx, hz: near.hz, lx: near.lx, lz: near.lz };
  if (dist > 0) {
    let x = near.x, z = near.z, i = near.i, remain = dist;
    let bx = deckPts[i][0], bz = deckPts[i][1];
    let seg = Math.hypot(bx - x, bz - z);
    while (remain > seg && i < deckPts.length - 1) {
      remain -= seg; x = bx; z = bz; i += 1;
      bx = deckPts[i][0]; bz = deckPts[i][1];
      seg = Math.hypot(bx - x, bz - z);
    }
    if (seg < 1e-9) return { x, z, hx: near.hx, hz: near.hz, lx: near.lx, lz: near.lz };
    const hx = (bx - x) / seg, hz = (bz - z) / seg;
    const t = Math.min(1, remain / seg);
    return { x: x + (bx - x) * t, z: z + (bz - z) * t, hx, hz, lx: hz, lz: -hx };
  }
  let x = near.x, z = near.z, idx = near.i - 1, remain = -dist;
  let ax = deckPts[idx][0], az = deckPts[idx][1];
  let seg = Math.hypot(x - ax, z - az);
  while (remain > seg && idx > 0) {
    remain -= seg; x = ax; z = az; idx -= 1;
    ax = deckPts[idx][0]; az = deckPts[idx][1];
    seg = Math.hypot(x - ax, z - az);
  }
  if (seg < 1e-9) {
    const j = Math.max(1, idx + 1);
    const dx = deckPts[j][0] - deckPts[j - 1][0], dz = deckPts[j][1] - deckPts[j - 1][1], L = Math.hypot(dx, dz) || 1;
    const hx = dx / L, hz = dz / L;
    return { x, z, hx, hz, lx: hz, lz: -hx };
  }
  const hx = (x - ax) / seg, hz = (z - az) / seg;
  const t = Math.min(1, remain / seg);
  return { x: x + (ax - x) * t, z: z + (az - z) * t, hx, hz, lx: hz, lz: -hx };
}

function offsetPtsVariable(pts, side, margin = 0.6) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const off = side * Math.max(0.15, (p[3] || 7) / 2 - margin);
    return [p[0] - dz * off, p[1] + dx * off, p[2]];
  });
}

function distFromEnd(pts, fromStart, i) {
  let L = 0;
  if (fromStart) {
    for (let k = 1; k <= i; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  } else {
    for (let k = pts.length - 1; k > i; k--) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  }
  return L;
}

function collectRuns(pts, pred) {
  const out = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    if (pred(i)) cur.push(i);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.filter((r) => r.length > 1).map((r) => r.map((i) => pts[i]));
}

const JOIN_Y = 0.22; // ribbonGeo +0.1 → 0.32m, 4+4(0.30)보다 살짝 위
const TAPER_LEN = 70;
const PARALLEL_LEN = 55;
const BLEND_LEN = 180;

function headsIntoCover(pts, fromStart, coverFn) {
  if (!coverFn || pts.length < 2) return false;
  const a = fromStart ? pts[0] : pts[pts.length - 1];
  const b = fromStart ? pts[1] : pts[pts.length - 2];
  const dx = a[0] - b[0], dz = a[1] - b[1], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  const hw = Math.max(3.2, (a[3] || 8) / 2);
  for (const d of [8, 16, 28, 45, 70]) {
    if (coverFn(a[0] + ux * d, a[1] + uz * d, hw)) return true;
  }
  return false;
}

/** 램프 끝을 4+4 갓길을 따라 보조차로로 붙인 뒤 폭을 0으로 줄인다. */
function joinEndToDeck(pts, fromStart, coverFn, deckPts) {
  if (!coverFn || !deckPts || pts.length < 2) return { pts, join: null };
  const tip = fromStart ? pts[0] : pts[pts.length - 1];
  const nxt = fromStart ? pts[1] : pts[pts.length - 2];
  const near = nearestDeck(tip[0], tip[1], deckPts);
  if (!near || near.d > 90) return { pts, join: null };
  // 본선 안으로 잘린 끝(요금소 부근 교차)은 그대로 두고, 본선 옆에서 끝나는 합류/분류만 테이퍼로 잇는다.
  if (headsIntoCover(pts, fromStart, coverFn)) return { pts, join: null };

  const layout = expressLayout();
  const lat = (tip[0] - near.x) * near.lx + (tip[1] - near.z) * near.lz;
  const side = lat >= 0 ? 1 : -1;
  const edge = side > 0 ? layout.sbOuterEdge : layout.nbOuterEdge;
  const auxW = Math.max(5.6, Math.min(7.2, tip[3] || 7));
  const overlap = 0.85;
  const innerOff = edge - side * overlap;
  const bdx = nxt[0] - tip[0], bdz = nxt[1] - tip[1], bL = Math.hypot(bdx, bdz) || 1;
  const bodyAlong = (bdx / bL) * near.hx + (bdz / bL) * near.hz;
  const extSign = bodyAlong >= 0 ? -1 : 1;
  const blendLen = Math.min(BLEND_LEN, Math.max(40, runLen(pts) * 0.55));

  const centerOff = (width) => innerOff + side * (width / 2);
  const atDeck = (along, width, y) => {
    const q = walkDeckFrom(deckPts, near, extSign * along);
    const off = centerOff(width);
    return [q.x + q.lx * off, q.z + q.lz * off, y, width];
  };

  const built = [];
  const nTaper = 8;
  for (let i = 0; i <= nTaper; i++) {
    const u = i / nTaper;
    const along = TAPER_LEN + PARALLEL_LEN - u * TAPER_LEN;
    const width = 0.4 + (auxW - 0.4) * (u * u * (3 - 2 * u));
    built.push(atDeck(along, width, JOIN_Y));
  }
  const nPar = 6;
  for (let i = 1; i <= nPar; i++) {
    const u = i / nPar;
    built.push(atDeck(PARALLEL_LEN * (1 - u), auxW, JOIN_Y));
  }
  const noseIndexBuilt = built.length - 1;

  const orig = fromStart ? pts : pts.slice().reverse();
  let acc = 0, cut = orig.length;
  const blended = [];
  for (let i = 1; i < orig.length; i++) {
    acc += Math.hypot(orig[i][0] - orig[i - 1][0], orig[i][1] - orig[i - 1][1]);
    if (acc >= blendLen) { cut = i; break; }
    const t = acc / blendLen;
    const sm = t * t * (3 - 2 * t);
    const ref = nearestDeck(orig[i][0], orig[i][1], deckPts);
    const parX = ref.x + ref.lx * centerOff(auxW);
    const parZ = ref.z + ref.lz * centerOff(auxW);
    blended.push([
      parX + (orig[i][0] - parX) * sm,
      parZ + (orig[i][1] - parZ) * sm,
      JOIN_Y + ((orig[i][2] || 0) - JOIN_Y) * sm,
      auxW + ((orig[i][3] || auxW) - auxW) * sm,
    ]);
  }
  const rest = orig.slice(cut);
  const forward = built.concat(blended, rest);
  const out = fromStart ? forward : forward.slice().reverse();
  const noseIndex = fromStart ? noseIndexBuilt : out.length - 1 - noseIndexBuilt;
  return {
    pts: out,
    join: {
      fromStart, side, auxW, edge, overlap, innerOff,
      taperLen: TAPER_LEN, parallelLen: PARALLEL_LEN, blendLen, noseIndex,
    },
  };
}

function joinChunkToDeck(pts, coverFn, deckPts) {
  if (!coverFn || !deckPts || pts.length < 2) return { pts, join: null };
  let out = pts, join = null;
  for (const fromStart of [true, false]) {
    const r = joinEndToDeck(out, fromStart, coverFn, deckPts);
    out = r.pts;
    if (r.join) join = r.join;
  }
  return { pts: out, join };
}

function addMergeGore(add, pts, join, deckPts) {
  if (!join || !deckPts || pts.length < 4) return;
  const { fromStart, side, edge, innerOff, noseIndex, auxW } = join;
  const n = pts.length;
  const i0 = Math.max(0, Math.min(n - 1, noseIndex));
  const dir = fromStart ? 1 : -1;
  const gore = [];
  for (let step = 0; step < 24; step++) {
    const i = i0 + dir * step;
    if (i < 1 || i > n - 2) break;
    const p = pts[i];
    const ref = nearestDeck(p[0], p[1], deckPts);
    const ex = ref.x + ref.lx * edge, ez = ref.z + ref.lz * edge;
    const a = pts[i - 1], b = pts[i + 1];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const towardDeck = (p[0] - 2 * dz - ref.x) * ref.lx + (p[1] + 2 * dx - ref.z) * ref.lz;
    const towardDeckN = (p[0] + 2 * dz - ref.x) * ref.lx + (p[1] - 2 * dx - ref.z) * ref.lz;
    const innerSgn = Math.abs(towardDeck - innerOff) < Math.abs(towardDeckN - innerOff) ? 1 : -1;
    const inner = [
      p[0] - dz * innerSgn * Math.max(0.2, (p[3] || auxW) / 2 - 0.15),
      p[1] + dx * innerSgn * Math.max(0.2, (p[3] || auxW) / 2 - 0.15),
    ];
    const gap = Math.hypot(inner[0] - ex, inner[1] - ez);
    if (step > 1 && gap > 12) break;
    if (gap < 0.6) continue;
    gore.push({
      mx: (ex + inner[0]) / 2, mz: (ez + inner[1]) / 2,
      w: gap, y: JOIN_Y, hx: ref.hx, hz: ref.hz, ex, ez, ix: inner[0], iz: inner[1],
    });
  }
  if (gore.length < 2) return;
  add(ribbonGeo(gore.map((g) => [g.mx, g.mz, g.y, g.w]), gore[0].w, 0.1, false), COL.road);
  const nChev = Math.min(7, gore.length);
  for (let k = 0; k < nChev; k++) {
    const g = gore[Math.round(k * (gore.length - 1) / Math.max(1, nChev - 1))];
    const slant = 1.7;
    const tip = fromStart ? -1 : 1; // 고어 코(평행 구간) 쪽
    // V: 양 끝이 분류 쪽으로, 중간이 코 쪽으로
    const a = [g.ex + g.hx * slant, g.ez + g.hz * slant, g.y];
    const c = [g.ix + g.hx * slant, g.iz + g.hz * slant, g.y];
    const b = [g.mx - g.hx * slant * 0.9 * tip, g.mz - g.hz * slant * 0.9 * tip, g.y];
    add(ribbonGeo([a, b], 0.55, 0.16, false), COL.edge);
    add(ribbonGeo([b, c], 0.55, 0.16, false), COL.edge);
  }
}

/** 본선 커버를 적용한 뒤에 실제로 그릴 램프·모터웨이 조각. 테스트에서 겹침을 검사한다. */
export function pangyoVisibleChunks(E, coverFn, deckPts = null) {
  const rawChunks = [];
  for (const l of E.lines || []) {
    // 4+4 가 있으면 OSM 경부 본선(mainNB/mainSB)은 그리지 않는다. 옆의 넓은 4차로 복제 차도가 되던 원인.
    if (coverFn && isExpressMainline(l)) continue;
    for (const raw of runs(l)) {
      for (const c of piecesAway(raw, coverFn)) {
        const joined = joinChunkToDeck(c, coverFn, deckPts);
        rawChunks.push({ k: l.k, pts: joined.pts, join: joined.join });
      }
    }
  }
  const kept = new Set(dedupeChunks(rawChunks.map((c) => c.pts)));
  return rawChunks.filter((c) => kept.has(c.pts));
}

function addVerticalPlane(add, width, height, cx, cy, cz, yaw, color) {
  const g = new THREE.PlaneGeometry(width, height);
  g.rotateY(yaw);
  g.translate(cx, cy, cz);
  add(g, color);
}

function addTollCanopy(add, night, T, layout) {
  const sets = layout?.sets;
  if (!sets?.length) return;
  const a = sets[0], b = sets[sets.length - 1];
  const mx = (a.at[0] + b.at[0]) / 2, mz = (a.at[1] + b.at[1]) / 2;
  const span = Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]);
  const extra = (Math.max(a.lanes, b.lanes) * layout.pitch) / 2 + 5;
  const across = span + extra * 2;
  const along = 24;
  const under = T.roof?.underside ?? 5.5;
  const thick = 1.4;
  const dx = a.dir[0], dz = a.dir[1];
  const px = dz, pz = -dx;
  const tAng = Math.atan2(dx, dz);
  const pAng = Math.atan2(px, pz);
  const cy = under + thick / 2;
  add(boxAt(across, thick, along, mx, cy, mz, tAng), COL.canopy);
  // 처마: 슬래브 위·아래를 덮어 아래에서 하늘이 새지 않게. 안쪽·바깥쪽 면을 따로 둔다.
  const fasciaH = thick + 0.32;
  const fy = under + thick / 2 - 0.08;
  const faces = [
    [mx + dx * (along / 2), mz + dz * (along / 2), across + 0.35, tAng],
    [mx - dx * (along / 2), mz - dz * (along / 2), across + 0.35, tAng + Math.PI],
    [mx + px * (across / 2), mz + pz * (across / 2), along + 0.35, pAng],
    [mx - px * (across / 2), mz - pz * (across / 2), along + 0.35, pAng + Math.PI],
  ];
  for (const [fx, fz, w, yaw] of faces) {
    addVerticalPlane(add, w, fasciaH, fx, fy, fz, yaw, COL.canopyEdge);
    addVerticalPlane(add, w, fasciaH, fx, fy, fz, yaw + Math.PI, COL.canopyUnder);
  }
  const soffit = new THREE.PlaneGeometry(across - 0.12, along - 0.12);
  soffit.rotateX(Math.PI / 2);
  soffit.rotateY(tAng);
  soffit.translate(mx, under - 0.02, mz);
  add(soffit, COL.canopyUnder);
  // 지붕 윗면: 테두리, 리브, 설비, 표지 띠
  add(boxAt(across + 0.4, 0.16, 0.42, mx + dx * (along / 2), under + thick + 0.08, mz + dz * (along / 2), tAng), '#b7bec6');
  add(boxAt(across + 0.4, 0.16, 0.42, mx - dx * (along / 2), under + thick + 0.08, mz - dz * (along / 2), tAng), '#b7bec6');
  add(boxAt(0.42, 0.16, along + 0.4, mx + px * (across / 2), under + thick + 0.08, mz + pz * (across / 2), tAng), '#b7bec6');
  add(boxAt(0.42, 0.16, along + 0.4, mx - px * (across / 2), under + thick + 0.08, mz - pz * (across / 2), tAng), '#b7bec6');
  for (let i = -4; i <= 4; i++) {
    add(boxAt(across - 1.4, 0.13, 0.28, mx + dx * (i * along / 10), under + thick + 0.08, mz + dz * (i * along / 10), tAng), '#c5ccd3');
  }
  add(boxAt(3.6, 1.05, 2.6, mx + px * 10 + dx * 3.2, under + thick + 0.62, mz + pz * 10 + dz * 3.2, tAng), '#8f98a2');
  add(boxAt(2.8, 0.72, 2.1, mx - px * 8.5 - dx * 4.4, under + thick + 0.46, mz - pz * 8.5 - dz * 4.4, tAng), '#7e8791');
  add(boxAt(1.5, 0.48, 1.3, mx + px * 3.5 - dx * 5.5, under + thick + 0.34, mz + pz * 3.5 - dz * 5.5, tAng), '#9aa3ad');
  add(boxAt(across * 0.58, 1.02, 0.16, mx - dx * (along / 2 + 0.24), under + thick - 0.52, mz - dz * (along / 2 + 0.24), tAng), '#1b5d38');
  for (const S of sets) {
    const sx = S.dir[1], sz = -S.dir[0];
    for (let i = 0; i < S.lanes; i++) {
      const o = (i + 0.5 - S.lanes / 2) * layout.pitch;
      const x = S.at[0] + sx * o, z = S.at[1] + sz * o;
      add(boxAt(layout.laneClear - 0.55, 0.06, 7.2, x, under - 0.05, z, tAng), '#e8d9a0');
      night.push(painted(boxAt(layout.laneClear - 0.55, 0.09, 7.2, x, under - 0.07, z, tAng), COL.lamp));
      add(boxAt(0.85, 0.32, 0.5, x, under - 0.3, z, tAng), '#2c333c');
    }
  }
}

export function buildPangyoExpress(E, opts = {}) {
  const g = new THREE.Group(); g.name = 'pangyoExpress';
  const day = [], night = [];
  const add = (geo, color) => { if (geo) day.push(painted(geo, color)); };
  const DECK = E.meta?.rule?.deck ?? 1.5;
  const coverFn = typeof opts.coverFn === 'function' ? opts.coverFn : null;
  const deckPts = Array.isArray(opts.deckPts) && opts.deckPts.length > 1 ? opts.deckPts : null;
  for (const { k, pts: P0, join } of pangyoVisibleChunks(E, coverFn, deckPts)) {
    const main = k === 'motorway';
    const P = taperEnds(P0, coverFn);
    const w = Math.max(...P.map((p) => p[3] || 0), P[0][3] || 7);
    const pts = P.map((p) => [p[0], p[1], p[2], p[3]]);
    add(ribbonGeo(pts, w, 0.1, false), main ? COL.mainRoad : COL.road);
    const grade = P.reduce((s, p) => s + p[2], 0) / P.length < 1.15;
    const joinLen = join ? (join.taperLen + join.parallelLen + join.blendLen * 0.7) : 0;
    const inJoin = (i) => !!(join && distFromEnd(pts, join.fromStart, i) < joinLen);
    let innerSgn = 0;
    if (join && deckPts) {
      const mid = Math.max(1, Math.min(pts.length - 2, join.noseIndex));
      const a = pts[mid - 1], b = pts[mid + 1];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const dPos = nearestDeck(pts[mid][0] - dz * 2, pts[mid][1] + dx * 2, deckPts).d;
      const dNeg = nearestDeck(pts[mid][0] + dz * 2, pts[mid][1] - dx * 2, deckPts).d;
      innerSgn = dPos < dNeg ? 1 : -1;
    }
    if (grade) {
      add(ribbonGeo(pts.map((p) => [p[0], p[1], 0.03, Math.max(5.5, (p[3] || w) + 6)]), w + 6, 0, false), '#5e7548');
      for (const sgn of [1, -1]) {
        if (join && innerSgn && sgn === innerSgn) continue;
        const embTop = (i) => pts[i][2] + 0.08;
        const embBot = () => 0.02;
        add(sideStrip(pts, (i) => sgn * ((pts[i][3] || w) / 2 + 0.2), embTop, embBot), '#6a7a4e');
        add(sideStrip(pts, (i) => sgn * ((pts[i][3] || w) / 2 + 7.5), embTop, embBot), '#567044');
      }
    }
    // 차선: 바깥 실선은 폭을 따라가고, 본선에 붙는 안쪽은 테이퍼가 끝날 때까지 점선
    for (const sgn of [1, -1]) {
      const edgePts = offsetPtsVariable(pts, sgn, 0.6);
      if (join && innerSgn && sgn === innerSgn) {
        const dashSrc = [];
        const solidSrc = [];
        for (let i = 0; i < pts.length; i++) {
          if (inJoin(i)) dashSrc.push(pts[i]);
          else solidSrc.push(pts[i]);
        }
        if (dashSrc.length > 1) {
          for (const d of dashes(offsetPtsVariable(dashSrc, innerSgn, 1.85), 0, 0.13)) add(d, COL.line);
        }
        if (solidSrc.length > 1) add(ribbonGeo(offsetPtsVariable(solidSrc, sgn, 0.6).map((p) => [p[0], p[1], p[2], 0.18]), 0.18, 0.13, false), COL.edge);
      } else {
        add(ribbonGeo(edgePts.map((p) => [p[0], p[1], p[2], 0.18]), 0.18, 0.13, false), COL.edge);
      }
    }
    const lanes = Math.max(1, Math.round((w - 1.2) / 3.3));
    if (lanes > 1) for (let k = 1; k < lanes; k++) for (const d of dashes(pts, -w / 2 + 0.6 + ((w - 1.2) * k) / lanes, 0.13)) add(d, COL.line);
    if (join && deckPts) addMergeGore(add, pts, join, deckPts);
    // 방호벽: 본선에 붙는 안쪽과 폭이 좁아진 끝은 세우지 않는다
    for (const sgn of [1, -1]) {
      const use = (i) => (pts[i][3] || w) >= 2 && !(join && innerSgn && sgn === innerSgn && inJoin(i));
      for (const run of collectRuns(pts, use)) {
        const top = (i) => run[i][2] + 1.0, bot = (i) => run[i][2] + 0.1;
        add(sideStrip(run, (i) => sgn * ((run[i][3] || w) / 2 + 0.4), top, bot), COL.barrier);
        add(sideStrip(run, (i) => sgn * ((run[i][3] || w) / 2), top, bot), COL.barrier);
        add(ribbonGeo(offsetPtsVariable(run, sgn, -0.2).map((p) => [p[0], p[1], p[2] + 0.9, 0.4]), 0.4, 0.1, false), COL.edge);
      }
      const bot2 = (i) => (pts[i][2] < 0.6 ? pts[i][2] + 0.1 : P[i][4] ? Math.max(0, pts[i][2] - DECK) : 0);
      if (!(join && innerSgn && sgn === innerSgn)) {
        add(sideStrip(pts, (i) => sgn * ((pts[i][3] || w) / 2 + 0.4), (i) => pts[i][2] + 0.1, bot2), P.some((p) => p[4]) ? COL.side : COL.wall);
      }
    }
    // 교량 밑면
    if (P.some((p) => p[4] && p[2] > 1.6)) add(ribbonGeo(pts.map((p, i) => [p[0], p[1], P[i][4] ? Math.max(0.02, p[2] - DECK) : 0.02, p[3] + 0.8]), w + 0.8, 0, false), COL.under); // 양면 재질이라 아래에서도 보임
  }
  // 교각: 기둥 2개 + 코핑(두부)
  for (const l of E.lines) for (const [x, z, top, ang, w] of l.piers || []) {
    if (coverFn && isExpressMainline(l)) continue;
    if (coverFn && coverFn(x, z, Math.max(3.2, (w || 8) / 2))) continue;
    if (Math.hypot(x + 482.05, z + 3232.35) < 90) continue;
    const ux = Math.cos(ang), uz = -Math.sin(ang), off = Math.max(2, w / 2 - 2.5);
    for (const s of [1, -1]) add(boxAt(1.4, top, 1.4, x + ux * off * s, top / 2, z + uz * off * s, ang), COL.pier);
    add(boxAt(w - 1, 1.0, 2.0, x, top - 0.5, z, ang), COL.pier);
  }
  // 요금소: 지붕(OSM 윤곽 돌출) + 섬/부스 + 기둥 — 일반형, 표지·로고 없음
  const T = E.toll;
  const layout = pangyoTollLayout(T);
  addTollCanopy(add, night, T, layout);
  for (const S of layout?.sets || []) {
    const ix = layout.islandW, iw = layout.islandLen, ih = (T.booths.island && T.booths.island[2]) || 2.4;
    const ang = Math.atan2(S.dir[0], S.dir[1]), px = S.dir[1], pz = -S.dir[0];
    const plazaW = S.lanes * layout.pitch + 4;
    add(boxAt(plazaW, 0.06, 36, S.at[0], 0.07, S.at[1], ang), '#555a60');
    for (let k = 0; k <= S.lanes; k++) {
      const o = (k - S.lanes / 2) * layout.pitch, x = S.at[0] + px * o, z = S.at[1] + pz * o;
      // 섬·부스·기둥은 같은 중심 — 기둥은 차로가 아니라 섬 위에만
      add(boxAt(ix, 0.28, iw, x, 0.24, z, ang), COL.island);
      add(boxAt(ix - 0.35, ih, 2.2, x, 0.35 + ih / 2, z, ang), COL.booth);
      add(boxAt(ix - 0.28, 0.9, 2.3, x, 0.35 + ih * 0.62, z, ang), COL.boothGlass);
      add(boxAt(0.42, T.roof.underside - 0.35, 0.42, x, 0.35 + (T.roof.underside - 0.35) / 2, z, ang), COL.gantry);
      night.push(painted(boxAt(ix - 0.2, 0.5, 2.32, x, 0.35 + ih * 0.62, z, ang), COL.lamp));
      // 광장 나팔: 섬 끝을 바깥으로 길게 빼 차로가 갈라져 보이게
      for (const sgn of [1, -1]) {
        add(boxAt(ix * 0.7, 0.22, 5.2, x + S.dir[0] * (iw / 2 + 3.8) * sgn, 0.2, z + S.dir[1] * (iw / 2 + 3.8) * sgn, ang), COL.island);
        add(boxAt(ix * 0.38, 0.16, 6.4, x + S.dir[0] * (iw / 2 + 9.4) * sgn, 0.16, z + S.dir[1] * (iw / 2 + 9.4) * sgn, ang), COL.island);
        add(boxAt(ix * 0.7, 0.3, 0.36, x + S.dir[0] * (iw / 2) * sgn, 0.26, z + S.dir[1] * (iw / 2) * sgn, ang), '#f5c518');
      }
    }
  }
  // [gyeongbu-bus] 판교TG 세부. 왼쪽(1차로 쪽) 2개 차로를 하이패스·버스로 두고, 로고는 쓰지 않는다.
  if (layout?.sets) {
    for (const S of layout.sets) {
      const ang = Math.atan2(S.dir[0], S.dir[1]);
      const px = S.dir[1], pz = -S.dir[0];
      for (let i = 0; i < S.lanes; i++) {
        const o = (i + 0.5 - S.lanes / 2) * layout.pitch;
        const x = S.at[0] + px * o, z = S.at[1] + pz * o;
        if (i >= S.lanes - 2) add(boxAt(layout.laneClear - 0.2, 0.045, 28, x, 0.12, z, ang), '#2a4a7a');
      }
    }
    if (T.booths.axis && T.roof) {
      const [A0, A1] = T.booths.axis;
      const ang = Math.atan2(A1[0] - A0[0], A1[1] - A0[1]);
      const mx = (A0[0] + A1[0]) / 2, mz = (A0[1] + A1[1]) / 2;
      const L = Math.hypot(A1[0] - A0[0], A1[1] - A0[1]) || 1;
      const nx = (A1[1] - A0[1]) / L, nz = -(A1[0] - A0[0]) / L;
      const y = T.roof.underside - 0.08;
      night.push(painted(boxAt(1.05, 0.07, L * 0.82, mx + nx * 3.8, y, mz + nz * 3.8, ang), COL.lamp));
      night.push(painted(boxAt(1.05, 0.07, L * 0.82, mx - nx * 3.8, y, mz - nz * 3.8, ang), COL.lamp));
    }
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const body = new THREE.Mesh(mergeGeometries(day.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color'].includes(k)) x.deleteAttribute(k); return x; })), mat);
  body.name = 'pangyoExpressBody'; body.receiveShadow = true; body.castShadow = true; g.add(body);
  const tollSigns = makePangyoTollSigns(T);
  if (tollSigns) g.add(tollSigns);
  let glow = null;
  if (night.length) {
    glow = new THREE.Mesh(mergeGeometries(night.map((x) => { const y = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'color'].includes(k)) y.deleteAttribute(k); return y; })), new THREE.MeshBasicMaterial({ vertexColors: true }));
    glow.name = 'pangyoExpressGlow'; glow.visible = false; g.add(glow);
  }
  for (const x of day) x.dispose(); for (const x of night) x.dispose();
  const unwatch = watchEvening((v) => { if (glow) glow.visible = v; });
  const tris = (m) => (m ? m.geometry.attributes.position.count / 3 : 0);
  return {
    group: g, body, glow,
    stats: () => ({ meshes: glow ? 2 : 1, tris: tris(body) + tris(glow), lines: E.lines.length }),
    dispose() { unwatch(); body.geometry.dispose(); mat.dispose(); if (glow) { glow.geometry.dispose(); glow.material.dispose(); } g.removeFromParent(); },
  };
}
