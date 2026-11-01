// 정자 라이브맵 데이터 빌드 스크립트 공통 (scripts/ground-floor-shops.mjs, scripts/building-colours.mjs)
//   - 게임과 같은 투영(scripts/convert.mjs: jeongja.json meta.center 기준 미터, x=동, z=남)
//   - 풋프린트 기하(점-다각형, bbox, 중심점)와 bbox 격자 인덱스
import fs from 'node:fs';
export { ringCentroid } from '../../src/world/keyedBuildings.js'; // 런타임 중심점 확인과 같은 식

export const cliArg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

/** jeongja.json 을 읽고 (lat, lon) -> [x, z] 투영을 돌려준다 */
export function loadWorld(file) {
  const world = JSON.parse(fs.readFileSync(file, 'utf8'));
  const C = world.meta.center;
  const kx = Math.cos((C.lat * Math.PI) / 180) * 111320, kz = 110540;
  return { world, proj: (lat, lon) => [(lon - C.lon) * kx, -(lat - C.lat) * kz] };
}

export function inRing(x, z, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
export const inPolygon = (x, z, outer, holes) => inRing(x, z, outer) && !(holes || []).some((h) => inRing(x, z, h));

export const bboxOf = (ring) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return { x0, z0, x1, z1 }; };

/** bbox 를 cell(m) 격자 칸에 등록하는 공간 인덱스. at(x,z) = 그 칸 목록, near(bb) = bb 가 걸친 칸들의 합집합 */
export function bboxGrid(cell) {
  const map = new Map();
  const span = (bb, fn) => {
    for (let gx = Math.floor(bb.x0 / cell); gx <= Math.floor(bb.x1 / cell); gx++)
      for (let gz = Math.floor(bb.z0 / cell); gz <= Math.floor(bb.z1 / cell); gz++) fn(gx + ',' + gz);
  };
  return {
    add(bb, i) { span(bb, (k) => { if (!map.has(k)) map.set(k, []); map.get(k).push(i); }); },
    at: (x, z) => map.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)) || [],
    near(bb) { const s = new Set(); span(bb, (k) => { for (const i of map.get(k) || []) s.add(i); }); return s; },
  };
}
