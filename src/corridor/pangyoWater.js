// [pangyo-water] 정자→판교 탄천 수위 + 판교 지류(운중천·금토천) — pangyo/water.json (scripts/corridor/build-pangyo-water.mjs)
//   main   : 합친 탄천 축 점마다 둑 대비 낙차 dz(≤0). terrain.js 가 둔치·수면·하상·본류 계단·낮은 보도교에 더한다
//            (둑·도로·다리 상판 0m 는 그대로 → 다리 밑 높이가 |dz| 만큼 커짐: 양현교 상판→하상 7.6 → 9.0m = 공개 자료 높이)
//   streams: streams.json 에 덧붙일 판교 지류 + 판교 타일을 지나 이어지는 운중천(streams.json 운중천 두 조각을 대신)
//   ?pangyowater=0 (또는 ?pangyo=0) 이면 요청 없음 → 탄천·지류·타일 데이터 원본 그대로
import * as THREE from 'three';
import { PANGYO_DIR, pangyoEnabled } from './pangyo.js';

export const PANGYO_WATER_FILE = PANGYO_DIR + 'water.json';

export function pangyoWaterEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return pangyoEnabled(search) && new URLSearchParams(search).get('pangyowater') !== '0';
}

// 합친 탄천 T 에 낙차를 붙인 새 T. 축 길이·끝점이 빌드 때와 다르면(라이브/코리더 축이 바뀜) 붙이지 않음 → 예전 그대로
export function attachMainDrop(T, W) {
  const m = W?.main;
  if (!T?.axis || !m?.dz?.length || T.axis.length !== m.axisN) return T;
  const a = T.axis[m.from], b = T.axis[m.from + m.dz.length - 1];
  if (!a || !b || Math.hypot(a[0] - m.axisCheck[0][0], a[1] - m.axisCheck[0][1]) > 0.2 || Math.hypot(b[0] - m.axisCheck[1][0], b[1] - m.axisCheck[1][1]) > 0.2) return T;
  return { ...T, mainDrop: { from: m.from, dz: m.dz } };
}

// streams.json 사본 + 판교 지류. 바뀌는 하천(운중천)의 옛 조각·계단은 빼고, 타일 컷은 빌드가 겹침을 확인한 칸만 덮어씀
export function mergePangyoStreams(S, W) {
  const X = W?.streams;
  if (!S?.streams || !X?.streams?.length) return S;
  const rep = new Set(X.replace || []);
  const gone = new Set(S.streams.filter((s) => rep.has(s.id)).map((s) => s.name).filter(Boolean));
  return {
    ...S,
    streams: S.streams.filter((s) => !rep.has(s.id)).concat(X.streams),
    stairs: (S.stairs || []).filter((st) => !gone.has(st.river)).concat(X.stairs || []),
    bridges: (S.bridges || []).concat(X.bridges || []),
    fords: (S.fords || []).concat(X.fords || []),
    tiles: { ...S.tiles, ...X.tiles },
    lod: { ...S.lod, ...X.lod },
    pangyoWater: true,
  };
}

// 탄천 수면 폴리곤 메시(수평 한 장, 삼각형이 수 km 걸침)를 낙차에 맞게: 높이가 직선에서 tol 넘게 벗어나는 변을 반으로 나누고
// (양쪽 삼각형이 같은 변을 같이 나눔 → 틈 없음) 정점 높이 = WATER + dz + 0.04. 낙차가 없는 곳(dz 일정)은 그대로
export function dropWaterGeometry(g, terrain, { tol = 0.02, minLen = 3, passes = 14 } = {}) {
  if (!g || !terrain?.mainDrop) return g;
  const src = g.index ? g.toNonIndexed() : g, P = src.attributes.position;
  const Y0 = P.getY(0) - terrain.params.WATER; // flatGeo 의 띄움(0.04)
  // 정점 xz 를 합쳐 공유 (ShapeGeometry 합친 것이라 같은 자리 정점이 여럿)
  const vx = [], vz = [], key = new Map(), tris = [];
  const vid = (x, z) => { const k = Math.round(x * 100) + ',' + Math.round(z * 100); let i = key.get(k); if (i == null) { i = vx.length; vx.push(x); vz.push(z); key.set(k, i); } return i; };
  for (let i = 0; i < P.count; i += 3) tris.push([vid(P.getX(i), P.getZ(i)), vid(P.getX(i + 1), P.getZ(i + 1)), vid(P.getX(i + 2), P.getZ(i + 2))]);
  const bx = terrain.mainDropBox;
  const dz = [], D = (i) => (dz[i] ??= terrain.mainDrop(vx[i], vz[i]));
  const bad = (a, b) => {
    const L = Math.hypot(vx[b] - vx[a], vz[b] - vz[a]); if (L < minLen) return false;
    if (bx && (Math.max(vx[a], vx[b]) < bx[0] || Math.min(vx[a], vx[b]) > bx[2] || Math.max(vz[a], vz[b]) < bx[1] || Math.min(vz[a], vz[b]) > bx[3])) return false; // 낙차 구간 밖 (dz = 0)
    const n = Math.min(16, Math.ceil(L / 8));
    for (let k = 1; k < n; k++) { const t = k / n, h = terrain.mainDrop(vx[a] + (vx[b] - vx[a]) * t, vz[a] + (vz[b] - vz[a]) * t); if (Math.abs(h - (D(a) + (D(b) - D(a)) * t)) > tol) return true; }
    return false;
  };
  const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  let list = tris, splits = 0;
  const ok = new Set(); // 이미 괜찮다고 본 변 (다음 회차에 다시 재지 않음)
  for (let pass = 0; pass < passes; pass++) {
    const mid = new Map();
    for (const t of list) for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], k = ek(a, b); if (mid.has(k) || ok.has(k)) continue; if (!bad(a, b)) { ok.add(k); continue; } { mid.set(k, vx.length); vx.push((vx[a] + vx[b]) / 2); vz.push((vz[a] + vz[b]) / 2); } }
    if (!mid.size) break;
    splits += mid.size;
    const next = [];
    for (const [a, b, c] of list) {
      const m = [mid.get(ek(a, b)), mid.get(ek(b, c)), mid.get(ek(c, a))], n = m.filter((v) => v != null).length;
      if (!n) { next.push([a, b, c]); continue; }
      if (n === 3) { next.push([a, m[0], m[2]], [m[0], b, m[1]], [m[2], m[1], c], [m[0], m[1], m[2]]); continue; }
      // 1~2 변: 나뉜 변의 중점에서 부채꼴로 (순서 유지 → 감김 방향 그대로)
      const ring = [a, m[0], b, m[1], c, m[2]].filter((v) => v != null), s = ring.findIndex((v, i) => i > 0 && m.includes(v) && v != null);
      const r = ring.slice(s).concat(ring.slice(0, s));
      for (let i = 1; i < r.length - 1; i++) next.push([r[0], r[i], r[i + 1]]);
    }
    list = next;
  }
  const W = terrain.params.WATER, pos = new Float32Array(list.length * 9);
  let o = 0;
  for (const t of list) for (const i of t) { pos[o++] = vx[i]; pos[o++] = W + D(i) + Y0; pos[o++] = vz[i]; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.userData = { trisIn: tris.length, tris: list.length, splits };
  if (src !== g) src.dispose();
  return out;
}
