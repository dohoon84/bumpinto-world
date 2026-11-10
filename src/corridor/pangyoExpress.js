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
    addFacedSign(g, fasciaMat, 16, 1.55, S.at[0] - S.dir[0] * 12.2, under + thick + 0.85, S.at[1] - S.dir[1] * 12.2, face);
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
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const x = pts[i][0] - dz * off, z = pts[i][1] + dx * off;
    pos.push(x, top(i), z, x, bot(i), z);
    if (i) { const k = (i - 1) * 2; if (off > 0) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
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

export function buildPangyoExpress(E) {
  const g = new THREE.Group(); g.name = 'pangyoExpress';
  const day = [], night = [];
  const add = (geo, color) => { if (geo) day.push(painted(geo, color)); };
  const DECK = E.meta?.rule?.deck ?? 1.5;
  for (const l of E.lines) for (const P of runs(l)) {
    const main = l.k === 'motorway', w = P[0][3];
    const pts = P.map((p) => [p[0], p[1], p[2], p[3]]);
    add(ribbonGeo(pts, w, 0.1, false), main ? COL.mainRoad : COL.road);
    // 차선: 양 끝 실선 + 차로 경계 점선(OSM lanes, 폭 규칙 3.3m — 데이터의 폭에서 역산)
    add(ribbonGeo(offsetPts(pts, w / 2 - 0.6).map((p) => [p[0], p[1], p[2], 0.18]), 0.18, 0.13, false), COL.edge);
    add(ribbonGeo(offsetPts(pts, -(w / 2 - 0.6)).map((p) => [p[0], p[1], p[2], 0.18]), 0.18, 0.13, false), COL.edge);
    const lanes = Math.max(1, Math.round((w - 1.2) / 3.3));
    if (lanes > 1) for (let k = 1; k < lanes; k++) for (const d of dashes(pts, -w / 2 + 0.6 + ((w - 1.2) * k) / lanes, 0.13)) add(d, COL.line);
    // 방호벽(콘크리트, 높이 0.9 · 폭 0.4 — 기본값) 양쪽
    for (const sgn of [1, -1]) {
      const o = sgn * (w / 2 + 0.2), top = (i) => pts[i][2] + 1.0, bot = (i) => pts[i][2] + 0.1;
      add(sideStrip(pts, o + sgn * 0.2, top, bot), COL.barrier); add(sideStrip(pts, o - sgn * 0.2, top, bot), COL.barrier);
      add(ribbonGeo(offsetPts(pts, o).map((p) => [p[0], p[1], p[2] + 0.9, 0.4]), 0.4, 0.1, false), COL.edge);
      // 상판 옆면(교량: 두께 DECK) · 옹벽(비교량: 0m 까지) — 0.6m 넘게 뜬 곳
      const bot2 = (i) => (pts[i][2] < 0.6 ? pts[i][2] + 0.1 : P[i][4] ? Math.max(0, pts[i][2] - DECK) : 0);
      add(sideStrip(pts, sgn * (w / 2 + 0.4), (i) => pts[i][2] + 0.1, bot2), P.some((p) => p[4]) ? COL.side : COL.wall);
    }
    // 교량 밑면
    if (P.some((p) => p[4] && p[2] > 1.6)) add(ribbonGeo(pts.map((p, i) => [p[0], p[1], P[i][4] ? Math.max(0.02, p[2] - DECK) : 0.02, p[3] + 0.8]), w + 0.8, 0, false), COL.under); // 양면 재질이라 아래에서도 보임
  }
  // 교각: 기둥 2개 + 코핑(두부)
  for (const l of E.lines) for (const [x, z, top, ang, w] of l.piers || []) {
    const ux = Math.cos(ang), uz = -Math.sin(ang), off = Math.max(2, w / 2 - 2.5);
    for (const s of [1, -1]) add(boxAt(1.4, top, 1.4, x + ux * off * s, top / 2, z + uz * off * s, ang), COL.pier);
    add(boxAt(w - 1, 1.0, 2.0, x, top - 0.5, z, ang), COL.pier);
  }
  // 요금소: 지붕(OSM 윤곽 돌출) + 섬/부스 + 기둥 — 일반형, 표지·로고 없음
  const T = E.toll;
  if (T?.roof?.ring?.length > 3) {
    const r = T.roof.ring.slice(0, -1), sh = new THREE.Shape(r.map(([x, z]) => new THREE.Vector2(x, -z)));
    const ex = new THREE.ExtrudeGeometry(sh, { depth: T.roof.thick, bevelEnabled: false }); ex.rotateX(-Math.PI / 2); ex.translate(0, T.roof.underside, 0);
    // 윗면 · 옆면(테두리) · 밑면 색을 면 법선으로 나눠 칠함
    const geo = ex.index ? ex.toNonIndexed() : ex; if (geo !== ex) ex.dispose(); geo.computeVertexNormals();
    const P2 = geo.attributes.position, N2 = geo.attributes.normal, c2 = new Float32Array(P2.count * 3), ct = new THREE.Color(COL.canopy), cs = new THREE.Color(COL.canopyEdge), cu = new THREE.Color(COL.canopyUnder);
    for (let i = 0; i < P2.count; i++) { const ny = N2.getY(i), c = ny > 0.5 ? ct : ny < -0.5 ? cu : cs; c2.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(c2, 3)); if (geo.attributes.uv) geo.deleteAttribute('uv');
    day.push(geo);
    // 밤: 지붕 밑 조명 띠(긴 축 따라)
    const [A0, A1] = T.booths.axis, L = Math.hypot(A1[0] - A0[0], A1[1] - A0[1]), ang = Math.atan2(A1[0] - A0[0], A1[1] - A0[1]);
    night.push(painted(boxAt(1.2, 0.08, L * 0.9, (A0[0] + A1[0]) / 2, T.roof.underside - 0.06, (A0[1] + A1[1]) / 2, ang), COL.lamp));
  }
  const layout = pangyoTollLayout(T);
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
  for (const G of T?.gantries || []) {
    const ang = Math.atan2(G.dir[0], G.dir[1]), px = G.dir[1], pz = -G.dir[0], hs = G.span / 2;
    for (const s of [1, -1]) add(boxAt(0.45, G.h, 0.45, G.at[0] + px * hs * s, G.h / 2, G.at[1] + pz * hs * s, ang), COL.gantry);
    add(boxAt(0.6, 0.9, G.span + 0.6, G.at[0], G.h - 0.45, G.at[1], ang + Math.PI / 2), COL.gantry);
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
