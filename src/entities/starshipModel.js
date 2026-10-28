// [tower] 범용 2단 초대형 로켓(부스터 + 우주선) 로우~미드폴리 모델. 로고/문자 없음.
// 로컬 좌표: 원점 = 해당 단의 바닥 중심, +Y 위, ±X = 젓가락 팔이 오는 옆면(캐치 핀 위치), +Z = 우주선 배(내열 타일) 방향
import * as THREE from 'three';
import { TILE, scaleUV, merge, beamGeo } from './towerTextures.js';

export const R = 4.5;                 // 동체 반지름(직경 9 m)
export const BOOSTER = { h: 71, pinY: 65.4, hsr: 2.2 }; // 부스터 높이(핫스테이징 링 제외), 캐치 핀 높이
export const SHIP = { h: 52, body: 33, pinY: 31.4 };    // 우주선 전체 높이, 원통부 길이, 캐치 핀 높이
const PIN = { out: 1.25, h: 0.7, w: 0.9 };              // 캐치 핀: 동체 밖으로 1.25 m
export const PIN_HALF = PIN.h / 2;

const C = 2 * Math.PI * R;
const steelCyl = (y0, y1, th0 = 0, thL = Math.PI * 2, seg = 64) => {
  const g = new THREE.CylinderGeometry(R, R, y1 - y0, seg, Math.max(1, Math.round((y1 - y0) / 6)), true, th0, thL);
  g.translate(0, (y0 + y1) / 2, 0);
  return scaleUV(g, (C * thL) / (2 * Math.PI) / TILE.steelU, (y1 - y0) / TILE.steelV, 0, y0 / TILE.steelV);
};

// 라프터 엔진 노즐(벨) — 목(throat)에서 출구까지 Lathe
function bellGeo(rExit = 0.62, len = 2.7) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.24 + (rExit - 0.24) * Math.pow(t, 0.7), -t * len)); }
  const g = new THREE.LatheGeometry(pts, 20); return g;
}
function engines(list, topY, rExit, len) {
  const bells = [], inner = [], heads = [];
  for (const [x, z] of list) {
    const b = bellGeo(rExit, len); b.translate(x, topY, z); bells.push(b);
    const hd = new THREE.CylinderGeometry(0.32, 0.4, 0.9, 10); hd.translate(x, topY + 0.45, z); heads.push(hd);
    const ib = bellGeo(rExit * 0.97, len * 0.98); ib.translate(x, topY - 0.02, z); inner.push(ib);
  }
  return { bells: merge(bells), inner: merge(inner), heads: merge(heads) };
}
const ring = (n, r, off = 0) => Array.from({ length: n }, (_, i) => [Math.cos(off + (i * 2 * Math.PI) / n) * r, Math.sin(off + (i * 2 * Math.PI) / n) * r]);

function pins(y, mats) { // ±X 방향 캐치 핀(팔 위 레일에 얹힘)
  const g = [];
  for (const s of [-1, 1]) {
    g.push(beamGeo(new THREE.Vector3(s * (R - 0.3), y, 0), new THREE.Vector3(s * (R + PIN.out), y, 0), PIN.h, PIN.w));
    g.push(beamGeo(new THREE.Vector3(s * (R + 0.05), y - 1.4, 0), new THREE.Vector3(s * (R + 0.05), y + 1.0, 0), 0.25, 1.6)); // 보강판
  }
  const m = new THREE.Mesh(merge(g), mats.finFrame); m.castShadow = true; return m;
}

// 그리드핀: 동체에서 바깥으로 뻗는 수평 패널(셀 축 = 로켓 축). 깊이 0.9 m
function gridFins(y, mats, angles) {
  const frames = [], cells = [], acts = [];
  const L = 3.3, W = 4.0, D = 0.9;
  for (const a of angles) {
    const ux = Math.cos(a), uz = Math.sin(a), tx = -uz, tz = ux; // 반경 / 접선
    const P = (rr, tt, yy) => new THREE.Vector3(ux * rr + tx * tt, yy, uz * rr + tz * tt);
    const r0 = R + 0.9, r1 = R + 0.9 + L;
    for (const yy of [y - D / 2 + 0.06, y + D / 2 - 0.06]) {
      frames.push(beamGeo(P(r0, -W / 2, yy), P(r1, -W / 2, yy), 0.14, 0.14), beamGeo(P(r0, W / 2, yy), P(r1, W / 2, yy), 0.14, 0.14));
      frames.push(beamGeo(P(r0, -W / 2, yy), P(r0, W / 2, yy), 0.14, 0.14), beamGeo(P(r1, -W / 2, yy), P(r1, W / 2, yy), 0.14, 0.14));
    }
    for (const [rr, tt] of [[r0, -W / 2], [r0, W / 2], [r1, -W / 2], [r1, W / 2]]) frames.push(beamGeo(P(rr, tt, y - D / 2), P(rr, tt, y + D / 2), 0.14, 0.14));
    // 셀 판: 위/아래 두 장 + 측벽 대신 알파 판 2장(접선 방향) — 옆에서 보면 마름모 격자가 보임
    for (const yy of [y - D / 2 + 0.02, y + D / 2 - 0.02]) {
      const p = new THREE.PlaneGeometry(L, W); p.rotateX(-Math.PI / 2);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx, 0, tz));
      p.applyMatrix4(m); p.translate(ux * (r0 + L / 2), yy, uz * (r0 + L / 2)); cells.push(p);
    }
    for (const s of [-1, 1]) { const p = new THREE.PlaneGeometry(L, D); const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx, 0, tz)); p.applyMatrix4(m); p.translate(ux * (r0 + L / 2) + tx * s * W * 0.25, y, uz * (r0 + L / 2) + tz * s * W * 0.25); cells.push(p); }
    acts.push(beamGeo(P(R - 0.4, 0, y), P(r0 + 0.1, 0, y), 1.1, 1.4)); // 구동기 하우징
    acts.push(beamGeo(P(R - 0.2, 0, y - 1.6), P(R - 0.2, 0, y + 1.0), 0.8, 2.2));
  }
  const g = new THREE.Group();
  const f = new THREE.Mesh(merge(frames), mats.finFrame), c = new THREE.Mesh(merge(cells), mats.gridFin), a = new THREE.Mesh(merge(acts), mats.stainlessDark);
  f.castShadow = c.castShadow = a.castShadow = true; g.add(f, c, a); return g;
}

export function createBooster(mats, { topCap = false } = {}) {
  const g = new THREE.Group(); g.name = 'booster';
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
  add(steelCyl(0, BOOSTER.h), mats.stainless);
  const inner = new THREE.CylinderGeometry(R - 0.06, R - 0.06, 4.2, 48, 1, true); inner.translate(0, 2.1, 0); add(inner, mats.dark, false);
  const plate = new THREE.CircleGeometry(R - 0.06, 48); plate.rotateX(Math.PI / 2); plate.translate(0, 3.3, 0); add(plate, mats.dark, false);
  // 33기: 중앙 3 + 내측 10 + 외측 20
  const pos = [...ring(3, 0.95, 0.3), ...ring(10, 2.35), ...ring(20, 3.78, Math.PI / 20)];
  const e = engines(pos, 3.3, 0.58, 2.8);
  add(e.bells, mats.engine); add(e.inner, mats.engineInner, false); add(e.heads, mats.dark, false);
  // 레이스웨이(배선 덕트) 2줄 + 하단 스커트 보강 띠
  const rw = [];
  for (const a of [Math.PI * 0.62, Math.PI * 1.38]) { const x = Math.sin(a) * (R + 0.2), z = Math.cos(a) * (R + 0.2); rw.push(beamGeo(new THREE.Vector3(x, 5, z), new THREE.Vector3(x, 63.5, z), 0.55, 0.45)); }
  add(merge(rw), mats.stainlessDark);
  const band = new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.35, 64, 1, true); band.translate(0, 4.2, 0); add(band, mats.dark);
  // 핫스테이징 링
  const hsr = new THREE.CylinderGeometry(R, R, BOOSTER.hsr, 64, 1, true); hsr.translate(0, BOOSTER.h + BOOSTER.hsr / 2, 0); scaleUV(hsr, 1, 1); add(hsr, mats.hsr);
  const hsrIn = new THREE.CylinderGeometry(R - 0.1, R - 0.1, BOOSTER.hsr, 48, 1, true); hsrIn.translate(0, BOOSTER.h + BOOSTER.hsr / 2, 0); add(hsrIn, mats.dark, false);
  const dome = new THREE.SphereGeometry(R - 0.1, 40, 10, 0, Math.PI * 2, 0, Math.PI * 0.32); dome.scale(1, 0.45, 1); dome.translate(0, BOOSTER.h - 0.2, 0); add(dome, mats.stainlessDark, false);
  if (topCap) { const cap = new THREE.CylinderGeometry(R, R, 0.2, 48); cap.translate(0, BOOSTER.h + BOOSTER.hsr, 0); add(cap, mats.dark); }
  g.add(gridFins(BOOSTER.pinY + 2.6, mats, [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]));
  g.add(pins(BOOSTER.pinY, mats));
  return g;
}

// 탄젠트 오지브 노즈콘 반지름 (y: 원통 끝에서부터의 높이)
const NOSE_L = SHIP.h - SHIP.body, RHO = (R * R + NOSE_L * NOSE_L) / (2 * R);
export const noseR = (y) => Math.max(0, Math.sqrt(RHO * RHO - y * y) + R - RHO);

export function createShip(mats) {
  const g = new THREE.Group(); g.name = 'ship';
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
  // 배(+Z) 쪽 반원+α 는 내열 타일, 등 쪽은 스테인리스
  const bellyL = Math.PI * 1.12, b0 = -bellyL / 2, back0 = bellyL / 2, backL = Math.PI * 2 - bellyL;
  const tileCyl = new THREE.CylinderGeometry(R + 0.03, R + 0.03, SHIP.body - 2.2, 64, 6, true, b0, bellyL); tileCyl.translate(0, 2.2 + (SHIP.body - 2.2) / 2, 0);
  scaleUV(tileCyl, (R * bellyL) / TILE.heatU, (SHIP.body - 2.2) / TILE.heatV);
  add(tileCyl, mats.tiles);
  add(steelCyl(0, SHIP.body, back0, backL), mats.stainless);
  add(steelCyl(0, 2.2, b0, bellyL), mats.stainless); // 하단 스커트는 맨 강판
  // 노즈콘 (Lathe, 위로 갈수록 좁아짐)
  const prof = []; const N = 28;
  for (let i = 0; i <= N; i++) { const y = (i / N) * (NOSE_L - 0.6); prof.push(new THREE.Vector2(noseR(y), y)); }
  prof.push(new THREE.Vector2(0.001, NOSE_L - 0.25));
  const len = prof.reduce((s, p, i) => (i ? s + p.distanceTo(prof[i - 1]) : 0), 0);
  const noseTile = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x + 0.03, p.y)), 48, b0, bellyL); noseTile.translate(0, SHIP.body, 0);
  scaleUV(noseTile, (R * bellyL) / TILE.heatU * 0.6, len / TILE.heatV); add(noseTile, mats.tiles);
  const noseSteel = new THREE.LatheGeometry(prof, 48, back0, backL); noseSteel.translate(0, SHIP.body, 0);
  scaleUV(noseSteel, (R * backL) / TILE.steelU * 0.6, len / TILE.steelV); add(noseSteel, mats.stainless);
  // 하부: 엔진 6기(해면용 3 + 진공용 3) + 바닥판
  const plate = new THREE.CircleGeometry(R - 0.05, 48); plate.rotateX(Math.PI / 2); plate.translate(0, 1.6, 0); add(plate, mats.dark, false);
  const sl = engines(ring(3, 1.0, Math.PI / 2), 1.6, 0.65, 1.3), vac = engines(ring(3, 3.0, -Math.PI / 2), 1.6, 1.15, 1.5);
  add(merge([sl.bells, vac.bells]), mats.engine); add(merge([sl.inner, vac.inner]), mats.engineInner, false);
  // 플랩: ±X 옆, 배 쪽(+Z)으로 치우친 평면. 배 쪽 면은 검은 타일, 반대 면은 스테인리스
  const zf = 1.1, rootX = (y) => Math.sqrt(Math.max(0, (y > SHIP.body ? noseR(y - SHIP.body) : R) ** 2 - zf * zf));
  const flap = (pts, side) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(side * x, y)));
    const ex = new THREE.ExtrudeGeometry(sh, { depth: 0.42, bevelEnabled: false }); ex.translate(0, 0, zf - 0.21);
    scaleUV(ex, 1 / TILE.steelU, 1 / TILE.steelV); add(ex, mats.stainlessDark);
    const face = new THREE.ShapeGeometry(sh); face.translate(0, 0, zf + 0.23); scaleUV(face, 1 / TILE.heatU, 1 / TILE.heatV); add(face, mats.tiles, false);
    // 힌지 페어링
    const ys = pts.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    add(beamGeo(new THREE.Vector3(side * (rootX(y0 + 0.5) - 0.2), y0 + 0.3, zf), new THREE.Vector3(side * (rootX(y1 - 0.5) - 0.2), y1 - 0.3, zf), 0.9, 1.1), mats.stainlessDark);
  };
  for (const s of [-1, 1]) {
    flap([[rootX(1.2), 1.2], [rootX(1.2) + 3.9, 2.6], [rootX(10) + 3.4, 8.8], [rootX(11.5), 11.5]], s); // 후방 플랩
    const y0 = SHIP.body + 3.2, y1 = SHIP.body + 10.5;
    flap([[rootX(y0) - 0.1, y0], [rootX(y0) + 2.5, y0 + 1.0], [rootX(y1) + 1.2, y1 - 0.6], [rootX(y1) - 0.1, y1]], s); // 전방 플랩
  }
  // 등 쪽 레이스웨이 + 캐치 핀
  add(beamGeo(new THREE.Vector3(0, 2.5, -R - 0.18), new THREE.Vector3(0, SHIP.body + 2, -R - 0.18), 0.6, 0.4), mats.stainlessDark);
  g.add(pins(SHIP.pinY, mats));
  return g;
}
