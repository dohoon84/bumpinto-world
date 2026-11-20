// [gentle-monster] 오브제 도감 — 전부 원본 디자인(실제 전시물 복제 아님): 규모·재질·움직임·낯섦만 닮게.
import * as THREE from 'three';
import { Rig, crumple, hash3, mat } from './rig.js';
import { mulberry } from './geo.js';

const W = 0xefece6, BLK = 0x16171a, SILV = 0xdfe3e8;

/** 잠자는 그레이하운드 — 길이 ~8.5m, 은빛 갑판. 머리는 +x. */
export function hound(r, { fur = 0xd9d4c9, plate = SILV } = {}) {
  const dk = 0xb9b3a7;
  r.ell('fur', 2.5, 0.9, 1.0, { x: -0.2, y: 0.95, color: fur });          // 몸통
  r.ell('fur', 1.6, 1.15, 1.02, { x: 1.7, y: 1.05, color: fur });           // 가슴(깊게)
  r.ell('fur', 1.3, 0.62, 0.78, { x: -1.9, y: 0.82, color: fur });          // 잘록한 허리
  for (const s of [-1, 1]) r.ell('fur', 1.15, 0.95, 0.6, { x: -2.9, y: 0.88, z: s * 0.68, color: fur }); // 엉덩이
  for (const s of [-1, 1]) { // 접힌 앞다리
    r.limb('fur', [2.2, 0.28, s * 0.62], [3.9, 0.22, s * 0.62], 0.26, 0.2, { color: fur });
    r.ell('fur', 0.36, 0.2, 0.28, { x: 4.1, y: 0.2, z: s * 0.62, color: dk });
    r.limb('fur', [-3.0, 0.3, s * 1.05], [-1.2, 0.26, s * 1.18], 0.3, 0.22, { color: fur }); // 뒷다리 접힘
    r.ell('fur', 0.5, 0.2, 0.3, { x: -1.1, y: 0.2, z: s * 1.2, color: dk });
  }
  // 목 + 머리 (앞다리 위에 올림)
  r.limb('fur', [2.6, 1.0, 0.1], [3.7, 0.62, 0.15], 0.62, 0.42, { color: fur });
  r.ell('fur', 0.78, 0.42, 0.4, { x: 4.15, y: 0.5, z: 0.15, rz: -0.12, color: fur });
  r.ell('fur', 0.95, 0.26, 0.24, { x: 4.95, y: 0.4, z: 0.15, rz: -0.1, color: fur });
  r.ell('matte', 0.16, 0.13, 0.15, { x: 5.82, y: 0.45, z: 0.15, color: BLK });
  for (const s of [-1, 1]) { // 접힌 귀, 감은 눈
    r.ell('fur', 0.5, 0.06, 0.2, { x: 3.7, y: 0.78, z: 0.15 + s * 0.42, ry: s * 0.2, rz: 0.4, color: dk });
    r.box('matte', 0.3, 0.025, 0.04, { x: 4.55, y: 0.62, z: 0.15 + s * 0.31, ry: s * -0.15, color: BLK });
  }
  // 꼬리
  const cur = new THREE.CatmullRomCurve3([new THREE.Vector3(-3.8, 0.9, 0), new THREE.Vector3(-4.4, 0.6, 0.9), new THREE.Vector3(-3.4, 0.22, 1.9), new THREE.Vector3(-1.8, 0.2, 2.1)]);
  r.add('fur', new THREE.TubeGeometry(cur, 18, 0.2, 8, false), { color: fur });
  // 은빛 등 갑판(겹친 판) + 목 고리 + 허리 띠
  for (let i = 0; i < 10; i++) { const x = -2.6 + i * 0.58, h = 1.0 + 0.28 * Math.sin(i / 9 * Math.PI); r.ell('chrome', 0.46, 0.07, 0.62 - i * 0.012, { x, y: h + (i > 5 ? 0.12 : 0), rz: -0.12 + i * 0.01, color: plate }); }
  r.add('chrome', new THREE.TorusGeometry(0.62, 0.07, 8, 28), { x: 3.1, y: 0.82, z: 0.12, ry: Math.PI / 2, rx: 0.0, rz: 0.55, color: plate });
  r.add('chrome', new THREE.TorusGeometry(0.72, 0.045, 8, 28), { x: -0.9, y: 0.72, z: 0, ry: Math.PI / 2, color: plate });
}
/** 숨쉬는 가슴 (따로 애니메이션) */
export function houndChest(r, fur = 0xd9d4c9) { r.ell('fur', 1.05, 0.9, 0.92, { y: 0, color: fur }); }

/** 쪼그려 앉은 / 무릎 꿇은 거인(무인 로봇형). pose: 'crouch'|'kneel'. 높이 ~3.6m */
export function giant(r, { pose = 'crouch', body = W, joint = BLK, bodyKey = 'gloss', visor = 'glass', shades = false, accent = null } = {}) {
  const P = pose === 'crouch'
    ? { hip: [0, 1.25, -0.2], neck: [0, 2.55, 0.55], head: [0, 3.0, 0.9], knee: [0.46, 1.15, 0.85], foot: [0.44, 0.12, 0.45], sh: [0.62, 2.45, 0.5], el: [0.92, 1.45, 1.05], hd: [0.8, 0.28, 1.6] }
    : { hip: [0, 1.55, -0.1], neck: [0, 3.0, 0.1], head: [0, 3.5, 0.2], knee: [0.42, 0.18, 0.95], foot: [0.44, 0.12, -0.55], sh: [0.7, 2.9, 0.1], el: [0.85, 2.1, 0.55], hd: [0.55, 1.5, 1.05] };
  const k = bodyKey;
  r.limb(k, P.hip, P.neck, 0.5, 0.58, { color: body });            // 몸통
  r.ell(k, 0.72, 0.55, 0.5, { x: P.neck[0], y: P.neck[1] - 0.15, z: P.neck[2] - 0.02, rx: pose === 'crouch' ? 0.6 : 0.1, color: body }); // 가슴판
  r.ell(k, 0.62, 0.45, 0.5, { x: P.hip[0], y: P.hip[1] - 0.05, z: P.hip[2], color: body });   // 골반
  r.ell('mech', 0.3, 0.3, 0.3, { x: P.neck[0], y: P.neck[1] + 0.22, z: P.neck[2] + 0.1, color: joint }); // 목
  r.ell(k, 0.4, 0.44, 0.46, { x: P.head[0], y: P.head[1], z: P.head[2], color: body });                  // 머리
  if (shades) {
    r.box('gloss', 0.74, 0.14, 0.1, { x: P.head[0], y: P.head[1] + 0.02, z: P.head[2] + 0.43, rx: -0.05, color: 0x090a0c });
    for (const s of [-1, 1]) r.ell('gloss', 0.19, 0.12, 0.05, { x: P.head[0] + s * 0.2, y: P.head[1] + 0.02, z: P.head[2] + 0.45, color: 0x050607 });
    r.ell('chrome', 0.2, 0.2, 0.06, { x: P.head[0], y: P.head[1] - 0.2, z: P.head[2] + 0.4, color: 0xdcdfe3 });
  } else {
    r.ell('gloss', 0.34, 0.16, 0.12, { x: P.head[0], y: P.head[1] + 0.02, z: P.head[2] + 0.34, color: 0x0a0b0e });
  }
  for (const s of [-1, 1]) {
    const hp = [s * 0.34, P.hip[1], P.hip[2]], kn = [s * P.knee[0], P.knee[1], P.knee[2]], ft = [s * P.foot[0], P.foot[1], P.foot[2]];
    r.limb(k, hp, kn, 0.3, 0.24, { color: body });           // 허벅지
    r.limb(k, kn, ft, 0.24, 0.2, { color: body });            // 정강이
    r.ell('mech', 0.27, 0.27, 0.27, { x: kn[0], y: kn[1], z: kn[2], color: joint });
    r.ell(k, 0.26, 0.12, 0.44, { x: ft[0], y: 0.1, z: ft[2] + 0.2, color: body });
    const sh = [s * P.sh[0], P.sh[1], P.sh[2]], el = [s * P.el[0], P.el[1], P.el[2]], hd = [s * P.hd[0], P.hd[1], P.hd[2]];
    r.ell(k, 0.34, 0.3, 0.34, { x: sh[0], y: sh[1], z: sh[2], color: body });
    r.limb(k, sh, el, 0.2, 0.17, { color: body });
    r.limb(k, el, hd, 0.17, 0.14, { color: body });
    r.ell('mech', 0.18, 0.18, 0.18, { x: el[0], y: el[1], z: el[2], color: joint });
    r.ell(k, 0.2, 0.15, 0.26, { x: hd[0], y: hd[1] - 0.05, z: hd[2] + 0.1, color: body });
    if (accent != null) r.box('gloss', 0.1, 0.5, 0.34, { x: sh[0] + s * 0.1, y: sh[1] - 0.3, z: sh[2] - 0.1, color: accent });
  }
}

/** 크롬 마네킹(구겨진 호일) — 서 있거나 비튼 포즈. 높이 ~1.9m */
export function mannequin(r, seed = 1, { lean = 0.1, arm = 0.5 } = {}) {
  const rnd = mulberry(seed * 977);
  const sub = new Rig();
  sub.limb('chrome', [0, 0.95, 0], [0, 1.55, 0.02], 0.2, 0.26, { color: 0xe9ecef, caps: true });  // 몸통
  sub.ell('chrome', 0.3, 0.22, 0.2, { y: 1.58, color: 0xe9ecef });
  sub.ell('chrome', 0.15, 0.19, 0.16, { y: 1.88, z: 0.03, color: 0xe9ecef });
  for (const s of [-1, 1]) {
    sub.limb('chrome', [s * 0.14, 0.95, 0], [s * 0.15, 0.5, 0.05 + rnd() * 0.08], 0.11, 0.08, { color: 0xe9ecef });
    sub.limb('chrome', [s * 0.15, 0.5, 0.05], [s * 0.14, 0.04, 0], 0.08, 0.06, { color: 0xe9ecef });
    sub.limb('chrome', [s * 0.3, 1.58, 0], [s * (0.42 + arm * 0.2), 1.2, 0.1 + rnd() * 0.2], 0.075, 0.06, { color: 0xe9ecef });
    sub.limb('chrome', [s * (0.42 + arm * 0.2), 1.2, 0.1], [s * (0.3 + rnd() * 0.3), 0.85 + rnd() * 0.3, 0.3], 0.06, 0.05, { color: 0xe9ecef });
  }
  for (const it of sub.items) {
    const g = it.geo.clone(); g.applyMatrix4(it.m); const c = crumple(g, 0.028, 5, seed * 7 + hash3(it.m.elements[12], it.m.elements[13], 1) * 10); g.dispose();
    r.add(it.key, c, { color: it.color, rx: lean * 0 }); // 변환은 r 쪽 스택
  }
}

/** 하얀 보행 로봇: 가는 다리, 큰 몸통, 검정 관절. 높이 ~4.2m */
export function walkerBot(r, { body = 0xf2f0ea } = {}) {
  r.ell('gloss', 0.95, 0.7, 0.8, { y: 3.2, color: body });
  r.ell('gloss', 0.7, 0.4, 0.62, { y: 3.85, z: 0.15, color: body });
  r.ell('gloss', 0.32, 0.22, 0.12, { y: 3.9, z: 0.72, color: 0x0b0c0f });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hip = [sx * 0.7, 2.95, sz * 0.55], kn = [sx * 1.25, 1.7, sz * 0.8], ft = [sx * 1.0, 0.08, sz * 1.0];
    r.limb('gloss', hip, kn, 0.18, 0.14, { color: body });
    r.limb('gloss', kn, ft, 0.14, 0.1, { color: body });
    r.ell('mech', 0.22, 0.22, 0.22, { x: hip[0], y: hip[1], z: hip[2], color: BLK });
    r.ell('mech', 0.17, 0.17, 0.17, { x: kn[0], y: kn[1], z: kn[2], color: BLK });
    r.ell('matte', 0.16, 0.06, 0.2, { x: ft[0], y: 0.06, z: ft[2], color: BLK });
  }
}

/** 버섯 한 개 (지름 d, 높이 h) — 반질한 갓 + 점 */
export function mushroom(r, { d = 1.2, h = 1.4, cap = 0xd8433a, stem = 0xf3efe4, spots = 0xffffff, lean = 0, seed = 1 } = {}) {
  const rnd = mulberry(seed);
  r.push({ rx: lean * 0.6, rz: lean });
  r.add('gloss', new THREE.LatheGeometry([[0.0, 0], [h * 0.12, 0.02], [h * 0.1, h * 0.5], [h * 0.13, h * 0.95], [0.001, h]].map(([x, y]) => new THREE.Vector2(d * x / h * 0.5, y)), 14), { color: stem });
  const cp = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; cp.push(new THREE.Vector2(Math.cos(a) * d * 0.5 + (i === 0 ? 0.0 : 0), Math.sin(a) * d * 0.27)); }
  r.add('gloss', new THREE.LatheGeometry(cp.reverse(), 22), { y: h * 0.92, color: cap });
  for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, rr = rnd() * d * 0.28; r.ell('gloss', d * 0.045, d * 0.02, d * 0.045, { x: Math.cos(a) * rr, y: h * 0.92 + d * 0.255 * Math.sqrt(Math.max(0.1, 1 - (rr / (d * 0.5)) ** 2)) , z: Math.sin(a) * rr, color: spots, lo: true }); }
  r.pop();
}

/** 씨앗 꼬투리(Nudake 풍 설치): 세로 홈이 있는 매달린 방울. 높이 h */
export function pod(r, { h = 1.3, w = 0.45, color = 0xe8dcc0, glow = false, seed = 1 } = {}) {
  const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(Math.max(0.001, Math.sin(Math.pow(t, 0.78) * Math.PI) * w * (1 + 0.1 * Math.sin(t * 12))), -t * h)); }
  r.add('matte', new THREE.LatheGeometry(pts, 10), { color });
  r.ell('metal', w * 0.22, 0.05, w * 0.22, { y: 0.02, color: 0xc9a24a, lo: true });
  if (glow) r.ell('lamp', w * 0.5, h * 0.3, w * 0.5, { y: -h * 0.55, color: 0xffd9a0, lo: true });
}

/** 합판 껍질 조각 — 자작 합판 띠 하나가 알 모양 둘레를 나선으로 감으며 아래로 벗겨져 나온다. 높이 ~3.8m */
export function plyShell(r, { R = 1.35, turns = 3.4, key = 'ply' } = {}) {
  const N = 300, M = 4, T = 0.035, cy = R * 1.45;
  const at = (t, v) => {
    const th = 0.16 + t * 2.55 + v * 0.17, ph = t * turns * Math.PI * 2;
    const peel = Math.max(0, t - 0.7) / 0.3;
    const rr = R * (1 + 0.6 * peel * peel);
    const y = Math.cos(th) * R * 1.32 * (1 - 0.35 * peel) - peel * peel * 0.55;
    return [Math.sin(th) * rr * Math.cos(ph), cy + y, Math.sin(th) * rr * Math.sin(ph) * 0.92];
  };
  const P = []; for (let i = 0; i <= N; i++) { const row = []; for (let j = 0; j <= M; j++) row.push(at(i / N, j / M * 2 - 1)); P.push(row); }
  const nrm = (i, j) => { const a = P[Math.min(N, i + 1)][j], b = P[Math.max(0, i - 1)][j], c = P[i][Math.min(M, j + 1)], d = P[i][Math.max(0, j - 1)]; const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; const p = P[i][j]; const out = (p[0] * n[0] + (p[1] - cy) * n[1] + p[2] * n[2]) > 0 ? 1 : -1; return n.map((x) => x / l * out); };
  const off = (i, j, s) => { const n = nrm(i, j), p = P[i][j]; return [p[0] + n[0] * T * s, p[1] + n[1] * T * s, p[2] + n[2] * T * s]; };
  const pos = [], col = []; const c3 = new THREE.Color();
  const tri = (a, b, c, hex) => { pos.push(...a, ...b, ...c); c3.set(hex); for (let k = 0; k < 3; k++) col.push(c3.r, c3.g, c3.b); };
  const quad = (a, b, c, d, hex) => { tri(a, b, c, hex); tri(a, c, d, hex); };
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    quad(off(i, j, 1), off(i + 1, j, 1), off(i + 1, j + 1, 1), off(i, j + 1, 1), 0xe6cfa6);       // 바깥 면 (밝은 자작)
    quad(off(i, j, -1), off(i, j + 1, -1), off(i + 1, j + 1, -1), off(i + 1, j, -1), 0xc9a878);   // 안쪽 면
  }
  const L = 5; // 가장자리 적층(합판 켜)
  for (const j of [0, M]) for (let i = 0; i < N; i++) for (let l = 0; l < L; l++) {
    const s0 = -1 + 2 * l / L, s1 = -1 + 2 * (l + 1) / L, hex = l % 2 ? 0x8a6238 : 0xf0dcb4;
    quad(off(i, j, s0), off(i + 1, j, s0), off(i + 1, j, s1), off(i, j, s1), hex);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  r.add(key, g);
  r.ell('ply', R * 0.9, R * 1.18, R * 0.82, { y: cy, color: 0x6e4f30 });
  r.ell('matte', 0.5, 0.05, 0.5, { y: 0.03, color: 0x1a1a1a });
  r.cyl('matte', 0.12, 0.6, { y: 0.3, color: 0x1a1a1a, lo: true });
}
/** 병(향수/에센스) — 어두운 유리 + 라벨 */
export function bottle(r, { h = 0.22, w = 0.07, color = 0xf2efe6, cap = 0x1a1a1a, shape = 0 } = {}) {
  if (shape === 0) { r.cyl('gloss', w, h * 0.78, { y: h * 0.39, color, lo: true }); r.cyl('matte', w * 0.55, h * 0.24, { y: h * 0.9, color: cap, lo: true }); }
  else if (shape === 1) { r.ell('gloss', w * 1.15, h * 0.45, w * 1.15, { y: h * 0.45, color }); r.cyl('chrome', w * 0.5, h * 0.2, { y: h * 1.0, color: 0xd9dde2, lo: true }); }
  else { r.box('gloss', w * 2, h * 0.8, w * 1.4, { y: h * 0.4, color }); r.box('matte', w * 1.2, h * 0.22, w * 0.9, { y: h * 0.9, color: cap }); }
}

/** 선글라스 한 쌍 (작음) */
export function shades(r, { s = 1, frame = 0x0b0b0d, lens = 0x1a2430, ry = 0 } = {}) {
  r.push({ ry, sx: s, sy: s, sz: s });
  for (const sx of [-1, 1]) { r.add('gloss', new THREE.TorusGeometry(0.032, 0.006, 6, 16), { x: sx * 0.036, color: frame }); r.add('gloss', new THREE.CircleGeometry(0.03, 14), { x: sx * 0.036, z: 0.001, color: lens }); r.box('matte', 0.004, 0.004, 0.07, { x: sx * 0.07, z: -0.035, color: frame }); }
  r.box('gloss', 0.026, 0.006, 0.006, { color: frame });
  r.pop();
}

/** 접시·컵 (Nuflaat 풍 도자기) */
export function cup(r, { s = 1, color = 0xe9e4d6 } = {}) {
  const pts = [[0, 0], [0.035, 0], [0.045, 0.012], [0.055, 0.05], [0.05, 0.06], [0.048, 0.055], [0.04, 0.012], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  r.add('gloss', new THREE.LatheGeometry(pts, 14), { color });
}
export function plate(r, { s = 1, color = 0xe9e4d6, r0 = 0.14 } = {}) {
  const pts = [[0, 0.006], [r0, 0.008], [r0 * 1.12, 0.022], [r0 * 1.1, 0.026], [r0 * 0.98, 0.012], [0, 0.011]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  r.add('gloss', new THREE.LatheGeometry(pts, 20), { color });
}
