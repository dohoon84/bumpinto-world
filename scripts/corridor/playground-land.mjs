// [playgrounds] 놀이터 조경 배치 (build-playgrounds.mjs 가 부른다 → public/corridor/playground-land.json)
//   위치는 OSM 놀이터 폴리곤(+ 그 놀이터를 품은 leisure=park/garden 폴리곤) 안에서만, 놀이터 id 시드로 결정론적으로 정한다.
//   OSM natural=tree 노드가 그 안에 있으면 그 나무를 먼저 심는다.
//   순서: 벤치(세트 옆) → 나무(경계 둘레, 세트와 수관이 안 겹치게) → 낮은 생울타리(경계 안쪽, 도로 쪽 입구는 비움)
//        → 관목 덤불(경계 가까이 많이) → 풀숲 무더기(빈 자리). 모두 건물·물·도로 리본·세트와 안 겹치게.
//   런타임(src/world/playgroundLand.js)과 맞춰야 하는 치수는 LAND 에 모아 json meta 로도 내보낸다.
import { inRing } from '../lib/world-geo.mjs';
import { area, perimeter, rectPoly, square, insidePoly, ptRing, seeded } from './lib/pg-geom.mjs';

export const LAND = {
  hedgeStep: 1.35,  // 생울타리 모듈 간격 (m, 모듈 길이 1.6 이라 살짝 겹쳐 이어짐)
  hedgeHalf: [0.8, 0.4],
  hedgeInset: 0.9,  // 폴리곤 경계에서 안쪽으로
  benchHalf: [0.85, 0.3],
  treeInset: 2.4, treeOut: 4.0, treeStep: 6.2, treeGap: 4.6, crownR: 2.0,
  grassHalf: 0.7,   // 풀숲 무더기 바닥 반폭 (런타임이 이 안에 포기 3개를 흩뿌림)
  bushR: 0.9,       // 덤불 배율 1 의 반폭
};
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** 링의 각 변에 대해 안쪽 법선 (오목 다각형도 변 중점에서 찍어 본다) */
function edges(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L; let nx = -uz, nz = ux;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (!inRing(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
    out.push({ a, L, ux, uz, nx, nz, ang: Math.atan2(uz, ux) });
  }
  return out;
}

/**
 * @param pg  { id, outer, holes, park: outer ring | null, sets: [{x,z,ry,s}], osmTrees: [[x,z]] }
 * @param ctx { clear(P, Pb?) → 건물·물·도로 리본 밖?, nearSet(P, margin) → 어떤 세트(여유 margin)와 겹침?,
 *              occupied: { hits(P), add(P) }, trees: { tooClose(x,z,d), add(x,z) }, roadGap(x,z) → 가장 가까운 도로 리본 가장자리까지 }
 */
export function planLand(pg, ctx) {
  const { id, outer, holes, park } = pg;
  const rnd = seeded('land:' + id);
  const A = area(outer), Per = perimeter(outer);
  const { clear, nearSet, occupied, trees } = ctx;
  const out = { t: [], b: [], h: [], u: [], g: [] };
  const free = (P, margin) => !nearSet(P, margin) && !occupied.hits(P);

  // 1) 벤치: 세트마다 최대 2개, 긴 변 가운데부터. 앉은 쪽이 세트를 본다(로컬 -z 가 세트 쪽).
  const [bhx, bhz] = LAND.benchHalf;
  for (const st of pg.sets) {
    const hx = (ctx.setW * st.s) / 2, hz = (ctx.setD * st.s) / 2, off = 1.0 + bhz;
    const cand = [[0, hz + off], [0, -hz - off], [-hx / 2, hz + off], [hx / 2, -hz - off], [hx / 2, hz + off], [-hx / 2, -hz - off], [hx + off, 0], [-hx - off, 0]];
    let n = 0; const placed = [];
    for (const [lx, lz] of cand) {
      if (n >= 2) break;
      const x = st.x + lx * Math.cos(st.ry) + lz * Math.sin(st.ry), z = st.z - lx * Math.sin(st.ry) + lz * Math.cos(st.ry);
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4)) continue;
      const ry = Math.atan2(-(st.x - x), -(st.z - z));
      const P = rectPoly(x, z, ry, bhx + 0.15, bhz + 0.15);
      if (!insidePoly(P, outer, holes, 0.2) || !free(P, 0.6) || !clear(P, rectPoly(x, z, ry, bhx + 0.5, bhz + 0.5))) continue;
      occupied.add(P); placed.push([x, z]); n++;
      out.b.push([r1(x), r1(z), r3(ry)]);
    }
  }

  // 2) 나무: OSM 나무 먼저, 그다음 경계 안쪽 treeInset 줄(+ 공원 안이면 경계 바깥 treeOut 줄)을 따라 treeStep 간격.
  //    수관(crownR×배율)이 세트 위를 덮지 않게, 줄기가 도로 리본에, 수관이 건물에 들지 않게.
  const cap = Math.min(24, Math.max(2, Math.round(Per / 8)));
  const zoneOk = (x, z, P, outside) => outside
    ? !!park && insidePoly(P, park, [], 1.5) && !inRing(x, z, outer) && ptRing(x, z, outer) <= 9
    : insidePoly(P, outer, holes, 0.8);
  const tryTree = (x, z, s, osm, outside, overhang = 0) => {
    const T = square(x, z, 0.5);
    if (!zoneOk(x, z, T, outside) || trees.tooClose(x, z, LAND.treeGap) || occupied.hits(T)) return false;
    if (nearSet(square(x, z, 0.05), LAND.crownR * s + 0.4 - overhang)) return false;
    if (!clear(square(x, z, 1.0), square(x, z, LAND.crownR * s))) return false;
    trees.add(x, z); occupied.add(T);
    out.t.push(osm ? [r1(x), r1(z), r2(s), 1] : [r1(x), r1(z), r2(s)]);
    return true;
  };
  for (const [x, z] of pg.osmTrees) {
    if (out.t.length >= cap) break;
    tryTree(x, z, 1, true, !inRing(x, z, outer));
  }
  const rings = [[outer, LAND.treeInset, false]];
  if (park) rings.push([outer, -LAND.treeOut, true]);
  for (const [ring, inset, outside] of rings) for (const e of edges(ring)) {
    for (let t = 2 + rnd() * 2.5; t <= e.L - 1.5; t += LAND.treeStep + rnd() * 1.2) {
      if (out.t.length >= cap) break;
      const s = 0.8 + rnd() * 0.35;
      if (rnd() < 0.12) continue; // 일정한 가로수처럼 보이지 않게 듬성듬성
      tryTree(e.a[0] + e.ux * t + e.nx * inset, e.a[1] + e.uz * t + e.nz * inset, s, false, outside);
    }
  }

  // 2b) 세트가 폴리곤을 거의 채운 작은 놀이터: 경계 가까이(1.6m) 작은 나무. 수관 아래쪽(지상 ~3m)만 세트 가장자리 위로 0.8m 까지 걸친다.
  if (out.t.length < 2) for (const e of edges(outer)) {
    for (let t = 1.5 + rnd() * 1.5; t <= e.L - 1.5 && out.t.length < 2 + Math.floor(Per / 30); t += 5.5) {
      tryTree(e.a[0] + e.ux * t + e.nx * 1.6, e.a[1] + e.uz * t + e.nz * 1.6, 0.7, false, false, 0.8);
    }
  }

  // 3) 생울타리: 경계 안쪽 hedgeInset 줄을 따라 모듈. 이어진 모듈은 한 줄(run)로 묶어 [x0, z0, ang, n].
  //    도로에 가장 가까운 지점 ±2m 는 입구로 비운다. 아주 작은 놀이터는 생략.
  if (A >= 220) {
    const [hhx, hhz] = LAND.hedgeHalf, step = LAND.hedgeStep, cands = [];
    for (const e of edges(outer)) {
      const runs = []; let cur = null;
      for (let t = 1.0; t <= e.L - 1.0 + 1e-6; t += step) {
        const x = e.a[0] + e.ux * t + e.nx * LAND.hedgeInset, z = e.a[1] + e.uz * t + e.nz * LAND.hedgeInset;
        const P = rectPoly(x, z, -e.ang, hhx, hhz);
        const ok = insidePoly(P, outer, holes, 0.1) && free(P, 1.0) && clear(P, rectPoly(x, z, -e.ang, hhx + 0.3, hhz + 0.3));
        if (ok) { if (!cur) runs.push((cur = { e, mods: [] })); cur.mods.push({ x, z, P }); } else cur = null;
      }
      cands.push(...runs);
    }
    // 입구: 모든 모듈 중 도로 리본에 가장 가까운 것 주변을 비운다
    let gate = null, gd = Infinity;
    for (const r of cands) for (const m of r.mods) { const d = ctx.roadGap(m.x, m.z); if (d < gd) { gd = d; gate = m; } }
    let count = 0;
    for (const r of cands) {
      let run = null;
      const flush = () => { if (run && run.n) out.h.push([r1(run.x), r1(run.z), r3(r.e.ang), run.n]); run = null; };
      for (const m of r.mods) {
        if ((gate && Math.hypot(m.x - gate.x, m.z - gate.z) < 2.2) || count >= 160) { flush(); continue; }
        if (!run) run = { x: m.x, z: m.z, n: 0 };
        run.n++; count++; occupied.add(m.P);
      }
      flush();
    }
  }

  // 4) 덤불·풀숲: 폴리곤 안 격자(지터)를 섞어 차례로. 덤불은 경계 5m 안쪽에 많이.
  const bb = outer.reduce((b, [x, z]) => ({ x0: Math.min(b.x0, x), z0: Math.min(b.z0, z), x1: Math.max(b.x1, x), z1: Math.max(b.z1, z) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
  const grid = [];
  for (let x = bb.x0 + 1.3; x < bb.x1; x += 2.6) for (let z = bb.z0 + 1.3; z < bb.z1; z += 2.6) grid.push([x + (rnd() - 0.5) * 1.6, z + (rnd() - 0.5) * 1.6]);
  const bushCap = Math.min(30, Math.round(4 + A / 90)), grassCap = Math.min(40, Math.round(6 + A / 60));
  for (const [x, z] of shuffle(grid.slice(), rnd)) {
    if (out.u.length >= bushCap) break;
    if (!inRing(x, z, outer)) continue;
    if (rnd() > (ptRing(x, z, outer) < 5 ? 0.45 : 0.1)) continue;
    const k = 0.7 + rnd() * 0.5, P = square(x, z, LAND.bushR * k);
    if (!insidePoly(P, outer, holes, 0.2) || !free(P, 0.8) || !clear(P)) continue;
    occupied.add(P); out.u.push([r1(x), r1(z), r2(k)]);
  }
  for (const [x, z] of shuffle(grid, rnd)) {
    if (out.g.length >= grassCap) break;
    if (!inRing(x, z, outer) || rnd() > 0.3) continue;
    const P = square(x, z, LAND.grassHalf);
    if (!insidePoly(P, outer, holes, 0.2) || !free(P, 0.5) || !clear(P)) continue;
    occupied.add(P); out.g.push([r1(x), r1(z)]);
  }
  return out;
}
