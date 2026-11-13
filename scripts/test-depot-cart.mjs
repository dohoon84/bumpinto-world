// [depot] 카트 짐 겹침·집기 판정 회귀 테스트 (DOM 없음) — node scripts/test-depot-cart.mjs (npm run depot:cart:test)
//   도훈 제보: 범쌀 20kg 포대 안에 보들범 30롤이 박혀 보이고, 클릭/E 가 다른 상품을 집음.
import assert from 'node:assert/strict';
import { orientedAabb, overlapDepth, findSpot, stackY, rayObb, nearestHit } from '../src/depot/cartPack.js';
import { BY_ID } from '../src/depot/products.js';
import { BASKET as B } from '../src/depot/cartModel.js';

const Q0 = { x: 0, y: 0, z: 0, w: 1 };
const qY = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const mul = (a, b) => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });
const qTip = { x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) };

// ---------- orientedAabb ----------
{ const a = orientedAabb({ x: 0, y: 0, z: 0 }, Q0, [0.4, 0.13, 0.6]); assert.ok(Math.abs(a.x1 - 0.2) < 1e-9 && Math.abs(a.y1 - 0.065) < 1e-9 && Math.abs(a.z1 - 0.3) < 1e-9); }
{ const a = orientedAabb({ x: 0, y: 0, z: 0 }, qY(Math.PI / 2), [0.4, 0.13, 0.6]); assert.ok(Math.abs(a.x1 - 0.3) < 1e-9 && Math.abs(a.z1 - 0.2) < 1e-9, 'rotY 90° swaps x/z'); }
{ const a = orientedAabb({ x: 0, y: 0, z: 0 }, qTip, [0.3, 0.42, 0.13]); assert.ok(Math.abs(a.y1 - 0.065) < 1e-9 && Math.abs(a.z1 - 0.21) < 1e-9, 'tip lays y onto z'); }

// ---------- 카트에 섞어 담기: 같은 곳을 계속 가리켜도 안 겹침 ----------
const UPPER = { base: B.floorY, ceil: B.top.yRear + 0.5, region: { x0: -B.floor.x, x1: B.floor.x, z0: B.floor.z0, z1: B.floor.z1 } };
const LOWER = { base: B.tray.y, ceil: B.floorY - 0.012, region: { x0: -B.tray.x, x1: B.tray.x, z0: B.tray.z0, z1: B.tray.z1 } };
function packAll(seq, L) {
  const placed = [], out = [];
  for (const [id, x, z, rotY = 0, tip = false] of seq) {
    const p = BY_ID[id]; assert.ok(p, id);
    const q = tip ? mul(qY(rotY), qTip) : qY(rotY), probe = orientedAabb({ x: 0, y: 0, z: 0 }, q, p.size), hx = probe.x1, hz = probe.z1, h = probe.y1 - probe.y0;
    const s = findSpot({ hx, hz, h, x, z, base: L.base, obs: placed.map((o) => o.a), ceil: Math.max(L.ceil, L === UPPER ? L.base + h + 0.001 : -1), region: L.region });
    out.push({ id, ...s });
    if (s.full) continue;
    const c = { x: s.x, y: s.y + h / 2 + 0.003, z: s.z };
    placed.push({ id, c, q, size: p.size, a: orientedAabb(c, q, p.size) });
  }
  return { placed, out };
}
const noOverlap = (placed, tag) => { for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) { const d = overlapDepth(placed[i].a, placed[j].a); assert.ok(d <= 0.002, `${tag}: ${placed[i].id} × ${placed[j].id} overlap ${(d * 100).toFixed(1)} cm ${JSON.stringify([placed[i].a, placed[j].a])}`); } };
const inside = (placed, L, tag) => { for (const o of placed) { assert.ok(o.a.x0 >= L.region.x0 - 1e-6 - 0.3 && o.a.x1 <= L.region.x1 + 0.3, `${tag} ${o.id} x`); assert.ok(o.a.y0 >= L.base - 1e-6, `${tag} ${o.id} sits on/above base`); } };

// 도훈 스샷 상황: 범쌀 20kg 바닥 → 보들범 30롤을 같은 자리 가리켜 놓기 → 작은 것들
{
  const { placed, out } = packAll([['rice', 0, 0.05], ['tissue', 0, 0.05, Math.PI / 2], ['chips', 0.02, 0.0, 0, true], ['bottle', 0.1, 0.1], ['meat', -0.05, 0.05], ['egg', 0, -0.1], ['ramen', 0, 0.05]], UPPER);
  noOverlap(placed, 'rice+tissue+small'); inside(placed, UPPER, 'upper');
  const rice = placed.find((o) => o.id === 'rice'), tissue = placed.find((o) => o.id === 'tissue');
  assert.ok(tissue.a.y0 >= rice.a.y1 - 1e-6, `tissue sits on top of rice (${tissue.a.y0.toFixed(3)} ≥ ${rice.a.y1.toFixed(3)})`);
  assert.ok(placed.every((o) => o.a.y1 <= UPPER.ceil + 1e-6), 'nothing above the upper ceiling');
  console.log('mixed upper:', out.map((s) => `${s.id}${s.full ? '(full)' : s.moved ? '(moved)' : ''}@${s.y.toFixed(2)}`).join(' '));
}
// 무작위 섞어 담기 200회 (가리킨 곳 아무 데나, 90° 회전·눕힘 섞음)
{
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ids = ['rice', 'tissue', 'ramen', 'chips', 'water', 'soda', 'egg', 'melon', 'meat', 'bottle'];
  let full = 0, moved = 0, n = 0;
  for (let k = 0; k < 200; k++) {
    const L = k % 3 ? UPPER : LOWER;
    const seq = Array.from({ length: 4 + Math.floor(rnd() * 10) }, () => [ids[Math.floor(rnd() * ids.length)], (rnd() - 0.5) * 0.5, L.region.z0 + rnd() * (L.region.z1 - L.region.z0), Math.floor(rnd() * 4) * Math.PI / 2, rnd() < 0.15]);
    const { placed, out } = packAll(seq, L);
    noOverlap(placed, `random #${k}`); inside(placed, L, `random #${k}`);
    assert.ok(placed.every((o) => o.a.y1 <= Math.max(L.ceil, L.base + (o.a.y1 - o.a.y0)) + 0.004), `random #${k}: under ceiling`);
    full += out.filter((s) => s.full).length; moved += out.filter((s) => s.moved).length; n += out.length;
  }
  assert.ok(full > 0, 'random fill reaches "cart full" at least sometimes');
  console.log(`random: ${n} drops · moved to a free spot ${moved} · full ${full} · 0 overlaps`);
}
// 아래 받침대: 생수 2L×6 위에 또 생수 → 바구니 바닥(0.458 m) 뚫지 않게 옆자리, 자리 없으면 full
{
  const { placed, out } = packAll([['soda', 0, -0.15], ['water', 0, -0.15], ['water', 0, -0.15], ['soda', 0, -0.15], ['water', 0, -0.15]], LOWER);
  noOverlap(placed, 'lower'); assert.ok(placed.every((o) => o.a.y1 <= LOWER.ceil + 1e-6), 'lower tray items stay under the basket floor');
  assert.equal(out[1].moved, true, 'second case moved beside the first'); assert.ok(out.some((s) => s.full), 'lower tray reports full');
  console.log('lower:', out.map((s) => `${s.id}${s.full ? '(full)' : s.moved ? '(moved)' : ''}`).join(' '));
}
// 집었다 취소: 그 사이 위 짐이 내려앉은 자리 → 되돌릴 때 겹치는 짐 위로
{
  const tissueFallen = orientedAabb({ x: 0, y: B.floorY + 0.165, z: 0.05 }, qY(Math.PI / 2), BY_ID.tissue.size);
  const riceOld = orientedAabb({ x: 0, y: B.floorY + 0.065, z: 0.05 }, Q0, BY_ID.rice.size);
  assert.ok(overlapDepth(riceOld, tissueFallen) > 0.05, 'naive restore would overlap');
  const y0 = stackY(riceOld, riceOld.y1 - riceOld.y0, riceOld.y0 + 0.01, [tissueFallen]);
  assert.ok(y0 >= tissueFallen.y1 - 1e-6, 'restore lifts the rice on top of the fallen tissue');
}

// ---------- 집기: 레이 → 각자 상자 중 가장 가까운 것 ----------
{
  // 범쌀 위에 보들범 (손잡이 뒤 위에서 비스듬히 내려다봄)
  const { placed } = packAll([['rice', 0, 0.05], ['tissue', 0, 0.05], ['bottle', 0.18, -0.3]], UPPER);
  const eye = { x: 0, y: 2.4, z: 0.9 };
  const aim = (t) => { const dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z, l = Math.hypot(dx, dy, dz); return { x: dx / l, y: dy / l, z: dz / l }; };
  const pickAt = (t) => nearestHit(placed.map((o) => ({ id: o.id, dist: rayObb(eye, aim(t), o.c, o.q, o.size) })), 4.5)?.id ?? null;
  if (process.env.DBG) console.log(placed.map((o) => [o.id, o.a]));
  // 위에서 보이는 면(윗면 가운데)을 가리키면 그 상품 — 바로 뒤나 아래 상품이 아님
  for (const o of placed.filter((q) => q.id !== 'rice')) assert.equal(pickAt({ x: o.c.x, y: o.a.y1 - 0.002, z: o.c.z }), o.id, `aim top of ${o.id}`);
  // 범쌀: 보들범이 덮지 않은 윗면 뒤쪽 띠 · 보들범 아래 옆면 띠 → 쌀
  const rice = placed.find((o) => o.id === 'rice'), tissue = placed.find((o) => o.id === 'tissue');
  assert.ok(tissue.a.z1 < rice.a.z1 - 0.05, 'tissue leaves a strip of rice top uncovered');
  assert.equal(pickAt({ x: 0, y: rice.a.y1 - 0.002, z: rice.a.z1 - 0.02 }), 'rice', 'aim the uncovered rice top strip');
  // 보들범 윗면 가장자리(쌀 바로 위) → 보들범
  assert.equal(pickAt({ x: 0, y: tissue.a.y1 - 0.002, z: tissue.a.z1 - 0.01 }), 'tissue', 'aim tissue top edge');
  assert.equal(pickAt({ x: 0, y: rice.a.y0 + 0.03, z: rice.a.z1 }), 'rice', 'aim rice front strip under the tissue');
  // 빈 곳 → 없음
  assert.equal(pickAt({ x: 0, y: 0.2, z: 3 }), null);
  // 상자 안에서 쏘면 거리 0 (가장 가까움)
  assert.equal(rayObb({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, Q0, [1, 1, 1]), 0);
  // 회전 상자
  assert.ok(Math.abs(rayObb({ x: -2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, qY(Math.PI / 2), [0.4, 0.1, 1.0]) - 1.5) < 1e-9, 'rotated OBB hit distance');
  assert.equal(rayObb({ x: -2, y: 0, z: 0.3 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, qY(Math.PI / 2), [0.4, 0.1, 1.0]), null, 'rotated OBB miss');
  assert.equal(nearestHit([{ id: 'a', dist: 2 }, { id: 'b', dist: 1 }, { id: 'c', dist: null }]).id, 'b');
  assert.equal(nearestHit([{ id: 'a', dist: 5 }], 4.5), null, 'beyond reach');
}
console.log('depot cart pack/pick: ok');
