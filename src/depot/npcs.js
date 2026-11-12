// [depot] 손님 NPC 8유형 (depot-story v0.4 npc/npc-types.json) — 사람 손님(동물 아님) + 카트, 통로 길찾기, 유형별 속도·습관.
//   유형마다 몸·카트·짐을 정점색 한 덩어리로 합쳐 메시 1개(그림자 없음) → 손님 8팀 = draw call 최대 8 (멀면 detailCull 이 뺌).
//   이동: 통로 x 열 × 가로 통로 z 줄 교차점 그래프(정적 장애물에 막힌 구간은 시작 때 빼 둠). 카트를 앞에 두고 밀며 걷고,
//   몸+카트 크기의 움직이는 AABB 를 obstacles 에 넣어 플레이어·카트가 통과하지 못하게 함.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const COLS = [17.9, 23.4, 29.0, 34.5, 40.1, 47.2, 53.9, 59.4, 64.8];
const ROWS = [44, 77, 107.2]; // 앞쪽 가로 통로(z≈13)는 계산대 줄 손님 자리라 비움
const EXTRA = [[69.4, 44], [69.4, 77], [69.4, 107.2], [76.5, 44]]; // 동쪽 계절 매대 옆, 전자 코너 뒤
const ZONES = {
  snack: [[29.0, 30], [34.5, 60]], water: [[53.9, 30], [59.4, 34]], deli: [[69.4, 107.2], [64.8, 107.2]], bakery: [[8, 26], [8, 30]],
  seasonal: [[69.4, 60], [69.4, 88]], produce: [[17.9, 107.2], [23.4, 107.2]], rice: [[40.1, 26], [47.2, 60]],
};
const C = {
  skin: '#f0cfae', skin2: '#e3b48c', jeans: '#3d5a8a', black: '#2a2c30', khaki: '#8a7a5a', white: '#f4f2ec', cream: '#efe6d2', mint: '#9fd8c0',
  yellow: '#f2c230', mustard: '#d9a62e', red: '#d9442e', olive: '#5d6b3a', brown: '#7a4e2c', kraft: '#c8965a', hairBk: '#1c1a1a', hairBr: '#5a3a22',
  wire: '#a9b2b8', wireDk: '#6c757b', handle: '#c62828', blue: '#2f6fb0', water: '#8cc4ec', plaid: '#8d6a48', gray: '#6b6f74', green: '#3f7a4a',
};

function part(list, geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  list.push(g);
}
const box = (list, w, h, d, color, x, y, z, rx, ry, rz) => part(list, new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);

/** 사람 한 명 (앞 = -z). o: {shirt, pants, hair, hat, s(키 배율), arms:'push'|'phone'|'shoulder', x, z, long, vest, bag, hairStyle} */
function person(L, o) {
  const s = o.s || 1, X = o.x || 0, Z = o.z || 0, y0 = o.y || 0;
  const B = (w, h, d, c, x, y, z, rx, ry, rz) => box(L, w * s, h * s, d * s, c, X + x * s, y0 + y * s, Z + z * s, rx, ry, rz);
  B(0.15, 0.08, 0.24, C.black, -0.09, 0.04, -0.03); B(0.15, 0.08, 0.24, C.black, 0.09, 0.04, -0.03); // 신발
  if (o.seated) { B(0.34, 0.14, 0.3, o.pants, 0, 0.5, -0.1); }
  else { B(0.14, 0.78, 0.16, o.pants, -0.09, 0.47, 0); B(0.14, 0.78, 0.16, o.pants, 0.09, 0.47, 0); }
  B(0.42, 0.62, 0.25, o.shirt, 0, 1.16, 0);
  if (o.vest) { B(0.44, 0.5, 0.27, o.vest, 0, 1.18, 0); B(0.12, 0.5, 0.272, o.shirt, 0, 1.2, 0); }
  if (o.stripes) for (const yy of [0.98, 1.12, 1.26, 1.4]) B(0.43, 0.04, 0.26, o.stripes, 0, yy, 0);
  if (o.apron) B(0.36, 0.7, 0.03, o.apron, 0, 1.0, -0.14);
  // 팔: 어깨(±0.26, 1.44)에서 rx 만큼 앞으로 듦 (rx 0 = 아래, π/2 = 앞, π = 위)
  const arm = (sx, rx) => {
    const cy = 1.44 - 0.28 * Math.cos(rx), cz = -0.28 * Math.sin(rx), hy2 = 1.44 - 0.56 * Math.cos(rx), hz = -0.56 * Math.sin(rx);
    B(0.11, 0.56, 0.12, o.sleeve || o.shirt, sx, cy, cz, rx); B(0.1, 0.1, 0.1, C.skin, sx, hy2, hz);
    return [sx, hy2, hz];
  };
  const hl = arm(-0.26, o.arms === 'phone' ? 1.75 : o.arms === 'none' ? 0.15 : 0.95);
  arm(0.26, o.arms === 'shoulder' ? Math.PI - 0.15 : o.arms === 'none' ? 0.15 : 0.95);
  if (o.arms === 'phone') B(0.08, 0.15, 0.02, C.black, hl[0] + 0.04, hl[1] + 0.06, hl[2] + 0.02, -0.4);
  const hy = 1.62, tilt = o.arms === 'phone' ? 0.35 : 0;
  B(0.26, 0.28, 0.25, C.skin, 0, hy, 0, tilt);
  B(0.07, 0.03, 0.01, C.hairBk, -0.06, hy + 0.02, -0.13, tilt); B(0.07, 0.03, 0.01, C.hairBk, 0.06, hy + 0.02, -0.13, tilt); // 눈
  const hair = o.hair || C.hairBk;
  if (o.hat === 'cap') { B(0.28, 0.1, 0.27, o.hatC, 0, hy + 0.17, 0); B(0.24, 0.025, 0.14, o.hatC, 0, hy + 0.13, -0.18); }
  else if (o.hat === 'bucket') { B(0.29, 0.12, 0.28, o.hatC, 0, hy + 0.18, 0); B(0.38, 0.025, 0.37, o.hatC, 0, hy + 0.12, 0); }
  else if (o.hat === 'visor') { B(0.28, 0.07, 0.27, hair, 0, hy + 0.16, 0.01); B(0.29, 0.05, 0.28, o.hatC, 0, hy + 0.1, 0); B(0.24, 0.02, 0.14, o.hatC, 0, hy + 0.1, -0.19); B(0.1, 0.18, 0.08, hair, 0, hy + 0.08, 0.17); }
  else if (o.hat === 'band') { B(0.28, 0.08, 0.27, hair, 0, hy + 0.16, 0.01); B(0.285, 0.05, 0.275, C.white, 0, hy + 0.1, 0); }
  else { B(0.28, 0.08, 0.27, hair, 0, hy + 0.16, 0.01); B(0.28, o.long ? 0.42 : 0.16, 0.06, hair, 0, hy + (o.long ? -0.06 : 0.06), 0.14); }
  if (o.bag) { B(0.06, 0.6, 0.27, o.bag, 0.0, 1.2, 0.0, 0, 0, 0.75); B(0.2, 0.18, 0.08, o.bag, 0.2, 0.95, 0.0); }
  if (o.shoulderLoad) B(0.3, 0.24, 0.2, o.shoulderLoad, 0.22, 1.74, 0.02);
}
/** 일반 카트 (손잡이 z = z0, 앞으로 -z). load: [[w,h,d,color,x,y,z], ...] 바구니 기준 */
function stdCart(L, z0 = -0.38, load = [], seatKid = null) {
  const zc = z0 - 0.5, y = 0.62;
  box(L, 0.56, 0.02, 0.86, C.wireDk, 0, y, zc);
  const e = 0.018, Hb = 0.42, Wb = 0.56, Db = 0.86;
  for (const sx of [-Wb / 2, Wb / 2]) { for (const yy of [Hb, Hb * 0.5]) box(L, e, e, Db, C.wire, sx, y + yy, zc); for (let k = 0; k <= 4; k++) box(L, e, Hb, e, C.wire, sx, y + Hb / 2, zc - Db / 2 + k * Db / 4); }
  for (const sz of [-Db / 2, Db / 2]) { for (const yy of [Hb, Hb * 0.5]) box(L, Wb, e, e, C.wire, 0, y + yy, zc + sz); for (let k = 1; k <= 3; k++) box(L, e, Hb, e, C.wire, -Wb / 2 + k * Wb / 4, y + Hb / 2, zc + sz); }
  box(L, 0.6, 0.04, 0.05, C.handle, 0, 1.08, z0 - 0.04); box(L, 0.03, 0.42, 0.03, C.wireDk, -0.27, 0.86, z0 + 0.02); box(L, 0.03, 0.42, 0.03, C.wireDk, 0.27, 0.86, z0 + 0.02);
  box(L, 0.5, 0.02, 0.7, C.wireDk, 0, 0.18, zc); // 아래 선반
  for (const [sx, sz] of [[-0.24, zc - 0.36], [0.24, zc - 0.36], [-0.24, zc + 0.36], [0.24, zc + 0.36]]) { box(L, 0.025, 0.5, 0.025, C.wireDk, sx, 0.38, sz); box(L, 0.05, 0.1, 0.1, C.black, sx, 0.05, sz); }
  for (const [w, h, d, c, x, yy, z, rx, ry, rz] of load) box(L, w, h, d, c, x, y + 0.01 + yy + h / 2, zc + z, rx, ry, rz);
  if (seatKid) person(L, { ...seatKid, s: 0.5, x: 0, z: z0 - 0.22, y: 0.42, seated: true });
}
function flatCart(L, z0 = -0.38, load = []) {
  const zc = z0 - 0.7;
  box(L, 0.72, 0.06, 1.3, C.gray, 0, 0.24, zc);
  box(L, 0.05, 0.85, 0.05, C.wireDk, -0.32, 0.65, z0 + 0.02); box(L, 0.05, 0.85, 0.05, C.wireDk, 0.32, 0.65, z0 + 0.02); box(L, 0.7, 0.05, 0.05, C.handle, 0, 1.06, z0 + 0.02);
  for (const [sx, sz] of [[-0.3, zc - 0.55], [0.3, zc - 0.55], [-0.3, zc + 0.55], [0.3, zc + 0.55]]) box(L, 0.06, 0.16, 0.14, C.black, sx, 0.09, sz);
  for (const [w, h, d, c, x, y, z] of load) box(L, w, h, d, c, x, 0.27 + y + h / 2, zc + z);
}

const LOOKS = {
  family: (L) => { person(L, { shirt: C.yellow, stripes: C.white, pants: C.jeans, hair: C.hairBr, x: -0.12 }); person(L, { shirt: C.mustard, pants: C.khaki, long: true, x: 0.62, z: -0.5, arms: 'none' }); stdCart(L, -0.38, [[0.2, 0.18, 0.2, C.red, -0.12, 0, 0.1], [0.14, 0.26, 0.14, '#f08a2c', 0.12, 0, -0.1], [0.24, 0.12, 0.2, C.yellow, 0.05, 0.18, 0.12]], { shirt: '#e8f0f6', pants: C.jeans, hair: C.hairBr }); },
  couple: (L) => { person(L, { shirt: C.cream, pants: C.jeans, hair: C.hairBk, x: -0.2 }); person(L, { shirt: C.mint, pants: C.white, hair: C.hairBr, x: 0.2 }); stdCart(L, -0.38, [[0.18, 0.3, 0.12, '#f3a33c', -0.1, 0, 0], [0.12, 0.3, 0.12, '#f28a2c', 0.08, 0, 0.12], [0.22, 0.22, 0.16, '#e86a8a', 0.1, 0.2, -0.15]]); },
  'bulk-boss': (L) => { person(L, { shirt: C.white, pants: C.black, hat: 'band', apron: C.kraft, s: 1.08 }); flatCart(L, -0.4, [[0.6, 0.18, 0.4, C.cream, 0, 0, -0.4], [0.6, 0.18, 0.4, C.cream, 0, 0.18, -0.4], [0.6, 0.18, 0.4, C.cream, 0, 0.36, -0.42], [0.55, 0.3, 0.45, C.kraft, 0, 0, 0.1], [0.55, 0.3, 0.45, C.kraft, 0, 0.3, 0.1], [0.5, 0.26, 0.4, '#b7834a', 0, 0.6, 0.12]]); },
  'sample-uncle': (L) => { person(L, { shirt: C.cream, vest: C.plaid, pants: C.brown, hat: 'bucket', hatC: '#b89a6a' }); stdCart(L, -0.38, [[0.12, 0.08, 0.1, C.yellow, 0.1, 0, 0.2]]); },
  'gym-bro': (L) => { person(L, { shirt: C.yellow, sleeve: C.skin, pants: C.black, arms: 'shoulder', shoulderLoad: C.water }); stdCart(L, -0.38, [[0.24, 0.26, 0.36, C.water, -0.12, 0, -0.1], [0.24, 0.26, 0.36, C.water, 0.13, 0, -0.1], [0.24, 0.26, 0.36, C.water, 0, 0, 0.26]]); },
  'sale-hunter': (L) => { person(L, { shirt: C.red, pants: '#2b3550', hat: 'visor', hatC: C.red, bag: C.brown }); stdCart(L, -0.38, [[0.34, 0.22, 0.3, C.yellow, 0, 0, 0], [0.1, 0.1, 0.1, C.red, 0.14, 0.22, 0.06]]); },
  'phone-zombie': (L) => { person(L, { shirt: C.yellow, pants: '#3c4048', arms: 'phone' }); stdCart(L, -0.38, [[0.16, 0.2, 0.12, C.white, 0.1, 0, 0.1]]); },
  'camping-dad': (L) => { person(L, { shirt: C.white, vest: C.olive, pants: C.khaki, hat: 'cap', hatC: C.olive }); stdCart(L, -0.38, [[0.42, 0.3, 0.34, C.kraft, -0.04, 0, -0.18], [0.36, 0.26, 0.28, C.blue, 0.06, 0, 0.22], [0.42, 0.04, 0.5, C.green, 0.36, 0.3, 0.05, 0, 0, 0.5]]); }, // 접이식 의자가 옆으로 삐져나옴
};
const WIDTH = { family: 0.95, couple: 0.6, 'bulk-boss': 0.5, 'camping-dad': 0.62 };

export function createShoppers({ scene, keep = (x) => x, obstacles, isBlocked, types, isMobile = false }) {
  const root = new THREE.Group(); root.name = 'depot-shoppers'; scene.add(root);
  const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  // 그래프: 정적 장애물로 막힌 구간 제거
  const nodes = [], key = (x, z) => `${x},${z}`, idx = new Map();
  const add = (x, z) => { const k = key(x, z); if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push({ x, z, nb: [] }); } return idx.get(k); };
  for (const x of COLS) for (const z of ROWS) add(x, z);
  for (const [x, z] of EXTRA) add(x, z);
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5); for (let i = 0; i <= n; i++) { const t = i / n; if (isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.5)) return false; } return true; };
  const link = (i, j) => { if (i === j || nodes[i].nb.includes(j)) return; if (clear(nodes[i], nodes[j])) { nodes[i].nb.push(j); nodes[j].nb.push(i); } };
  const byRow = new Map(), byCol = new Map();
  nodes.forEach((n, i) => { (byRow.get(n.z) || byRow.set(n.z, []).get(n.z)).push(i); (byCol.get(n.x) || byCol.set(n.x, []).get(n.x)).push(i); });
  for (const l of byRow.values()) { l.sort((a, b) => nodes[a].x - nodes[b].x); for (let k = 1; k < l.length; k++) link(l[k - 1], l[k]); }
  for (const l of byCol.values()) { l.sort((a, b) => nodes[a].z - nodes[b].z); for (let k = 1; k < l.length; k++) link(l[k - 1], l[k]); }
  const usable = nodes.map((n, i) => i).filter((i) => nodes[i].nb.length);
  const nearestNode = (x, z) => usable.reduce((b, i) => (Math.hypot(nodes[i].x - x, nodes[i].z - z) < Math.hypot(nodes[b].x - x, nodes[b].z - z) ? i : b), usable[0]);

  const list = [];
  const T = Object.fromEntries((types || []).map((t) => [t.id, t]));
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const START = { family: [29.0, 44], couple: [53.9, 77], 'bulk-boss': [47.2, 44], 'sample-uncle': [64.8, 107.2], 'gym-bro': [59.4, 44], 'sale-hunter': [40.1, 77], 'phone-zombie': [34.5, 44], 'camping-dad': [69.4, 77] };
  for (const id of Object.keys(LOOKS)) {
    const L = []; LOOKS[id](L);
    const g = keep(mergeGeometries(L)); L.forEach((x) => x.dispose()); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.name = `shopper-${id}`; mesh.matrixAutoUpdate = true;
    root.add(mesh);
    const [sx, sz] = START[id] || [47.2, 44];
    const n0 = nearestNode(sx, sz);
    const t = T[id] || {}, speed = t.speed || 1.1;
    const rect = { x0: 0, x1: 0, z0: 0, z1: 0, npc: id };
    list.push({ id, name: t.name || id, mesh, x: nodes[n0].x, z: nodes[n0].z, yaw: 0, from: n0, to: n0, prev: -1, speed, v: 0, stopT: 1 + rnd() * 3, phase: rnd() * 6, rect, active: true, sprintT: 0, visits: 0, inZoneT: 0, zone: '', len: id === 'bulk-boss' ? 1.95 : 1.45, half: WIDTH[id] || 0.42, skew: 0 });
  }
  const zoneOf = (x, z) => { for (const [k, pts] of Object.entries(ZONES)) for (const [zx, zz] of pts) if (Math.abs(zx - x) < 2.5 && Math.abs(zz - z) < 6) return k; return ''; };
  const WANT = { family: ['snack', 'produce'], couple: ['produce', 'snack'], 'bulk-boss': ['rice', 'water'], 'sample-uncle': ['deli', 'bakery'], 'gym-bro': ['water'], 'sale-hunter': ['snack', 'rice'], 'phone-zombie': [], 'camping-dad': ['seasonal'] };
  function pickNext(n) {
    const node = nodes[n.to], opts = node.nb.filter((j) => j !== n.prev);
    const pool = opts.length ? opts : node.nb; if (!pool.length) return n.to;
    // 관심 구역 쪽으로 약하게 끌림
    const want = WANT[n.id] || [];
    let best = pool[Math.floor(rnd() * pool.length)];
    if (want.length && rnd() < 0.6) {
      const tgt = ZONES[want[Math.floor(rnd() * want.length)]][0];
      best = pool.reduce((b, j) => (Math.hypot(nodes[j].x - tgt[0], nodes[j].z - tgt[1]) < Math.hypot(nodes[b].x - tgt[0], nodes[b].z - tgt[1]) ? j : b), pool[0]);
      if (best === n.prev && pool.length > 1 && rnd() < 0.5) best = pool[Math.floor(rnd() * pool.length)];
    }
    return best;
  }
  function setRect(n) {
    const fx = -Math.sin(n.yaw), fz = -Math.cos(n.yaw), cx = n.x + fx * (n.len / 2 - 0.25), cz = n.z + fz * (n.len / 2 - 0.25);
    const hx = Math.abs(fx) * n.len / 2 + Math.abs(fz) * n.half, hz = Math.abs(fz) * n.len / 2 + Math.abs(fx) * n.half;
    n.rect.x0 = cx - hx; n.rect.x1 = cx + hx; n.rect.z0 = cz - hz; n.rect.z1 = cz + hz;
  }
  for (const n of list) { setRect(n); obstacles.push(n.rect); }
  const OFF = { x0: -999, x1: -998, z0: -999, z1: -998 };

  function setActive(ids) {
    const on = new Set(ids);
    for (const n of list) { n.active = on.has(n.id); n.mesh.visible = n.active; if (!n.active) Object.assign(n.rect, OFF); else setRect(n); }
  }
  let t = 0;
  function tick(dt, { me, cart } = {}) {
    t += dt;
    for (const n of list) {
      if (!n.active) continue;
      const a = nodes[n.to];
      // 정지(유형별 습관)
      if (n.stopT > 0) { n.stopT -= dt; n.v = Math.max(0, n.v - dt * 3); }
      else {
        let vmax = n.speed;
        if (n.id === 'sale-hunter') { n.sprintT -= dt; if (n.sprintT < -6) n.sprintT = 4; vmax = n.sprintT > 0 ? 2.4 : 1.0; }
        // 앞에 플레이어·카트·다른 손님이 있으면 기다림
        const tx = a.x - n.x, tz = a.z - n.z, tl = Math.hypot(tx, tz) || 1, fx = tl > 0.1 ? tx / tl : -Math.sin(n.yaw), fz = tl > 0.1 ? tz / tl : -Math.cos(n.yaw); // 가는 방향 기준
        const ahead = (x, z, r) => { const dx = x - n.x, dz = z - n.z, f = dx * fx + dz * fz, s = Math.abs(dx * fz - dz * fx); return f > 0 && f < n.len + r && s < n.half + 0.5; };
        let blocked = (me && ahead(me.x, me.z, 0.6)) || (cart && ahead(cart.x, cart.z, 0.9));
        for (const o of list) if (o !== n && o.active && ahead(o.x, o.z, 0.8)) { blocked = true; break; }
        if (blocked) { n.waitT = (n.waitT || 0) + dt; vmax = 0; if (n.waitT > 3 + n.phase * 0.3) { const back = n.from; n.prev = n.to; n.from = n.to; n.to = back; n.waitT = 0; n.yaw = Math.atan2(-(nodes[back].x - n.x), -(nodes[back].z - n.z)); } } else n.waitT = 0;
        n.v += Math.sign(vmax - n.v) * Math.min(Math.abs(vmax - n.v), dt * 2.2);
      }
      const dx = a.x - n.x, dz = a.z - n.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        n.prev = n.from; n.from = n.to; n.to = pickNext(n);
        const z = zoneOf(a.x, a.z);
        if (z && (WANT[n.id] || []).includes(z)) { n.stopT = 3 + rnd() * 5; if (n.id === 'sample-uncle' && z === 'deli') n.visits++; }
        if (n.id === 'family' && rnd() < 0.35) n.stopT = 6 + rnd() * 4;
        if (n.id === 'phone-zombie' && rnd() < 0.45) { n.stopT = 10 + rnd() * 10; n.skew = (rnd() < 0.5 ? -1 : 1) * 0.45; }
        if (n.id === 'couple' && rnd() < 0.25) n.stopT = 3 + rnd() * 3;
      } else if (n.v > 0) {
        const step = Math.min(d, n.v * dt); n.x += dx / d * step; n.z += dz / d * step;
        const want = Math.atan2(-dx, -dz);
        let dy = want - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.yaw += dy * Math.min(1, dt * (n.id === 'bulk-boss' ? 2.5 : 5));
        // 갑자기 멈춤 (휴대폰) — 통로 한가운데에서
        if (n.id === 'phone-zombie' && n.stopT <= 0 && rnd() < dt * 0.04) { n.stopT = 10 + rnd() * 8; n.skew = (rnd() < 0.5 ? -1 : 1) * 0.45; }
        if (n.id === 'family' && n.stopT <= 0 && rnd() < dt * 0.02) n.stopT = 6 + rnd() * 4;
      }
      if (n.stopT <= 0) n.skew *= Math.max(0, 1 - dt * 2);
      const zig = n.id === 'couple' ? Math.sin(t * 0.9 + n.phase) * 0.28 : 0; // 둘이 의견이 달라 좌우로 흔들림
      const bob = n.v > 0.05 ? Math.abs(Math.sin(t * 7 * Math.max(0.6, n.v) + n.phase)) * 0.025 : 0;
      n.mesh.position.set(n.x + Math.cos(n.yaw) * zig, bob, n.z - Math.sin(n.yaw) * zig);
      n.mesh.rotation.y = n.yaw + n.skew + (n.id === 'couple' ? Math.sin(t * 0.9 + n.phase + 1) * 0.08 : 0);
      setRect(n);
      const z = zoneOf(n.x, n.z); if (z === n.zone) n.inZoneT += dt; else { n.zone = z; n.inZoneT = 0; }
    }
  }
  const near = (id, x, z, r) => list.find((n) => n.active && n.id === id && Math.hypot(n.x - x, n.z - z) < r) || null;
  function dispose() { for (const n of list) { const i = obstacles.indexOf(n.rect); if (i >= 0) obstacles.splice(i, 1); } root.removeFromParent(); }
  return { root, list, tick, setActive, near, nodes, dispose, get count() { return list.filter((n) => n.active).length; } };
}
