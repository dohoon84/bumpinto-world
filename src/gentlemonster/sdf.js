// [gentle-monster] 부드러운 유기체 오브제용 SDF → 메시 (naive surface nets).
//   SDF 장면: 둥근 원뿔(캡슐)·타원체·둥근 박스를 smooth-union 으로 이어 붙이고, 판 이음선(홈)·구김(노이즈) 을 더한다.
//   정점마다 가장 가까운 부품의 색을 정점색으로 칠한다.
import * as THREE from 'three';

const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/** 값 노이즈 (부드러운 3D) */
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) r += h3(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
  return r;
}

export class SDF {
  constructor() { this.prims = []; this.grooves = []; this.noise = null; this.box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; }
  _grow(x0, y0, z0, x1, y1, z1) { const b = this.box; b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0); b[2] = Math.min(b[2], z0); b[3] = Math.max(b[3], x1); b[4] = Math.max(b[4], y1); b[5] = Math.max(b[5], z1); }
  /** 둥근 원뿔: a→b, 반지름 ra→rb. k = 앞 부품과 이을 때 부드러움(m) */
  cone(a, b, ra, rb = ra, { k = 0.08, color = 0xffffff, sub = false } = {}) {
    const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / (l2 || 1e-9);
    const f = (x, y, z) => { // iq round cone
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const yv = px * bx + py * by + pz * bz, zv = yv - l2;
      const qx = px * l2 - bx * yv, qy = py * l2 - by * yv, qz = pz * l2 - bz * yv, x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * l2, z2 = zv * zv * l2, kk = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yv) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    };
    const m = Math.max(ra, rb); if (!sub) this._grow(Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m);
    this.prims.push({ f, k, color, sub }); return this;
  }
  /** 타원체 (중심 c, 반지름 r=[rx,ry,rz], 회전 rot=[rx,ry,rz] 라디안) */
  ell(c, r, { k = 0.08, color = 0xffffff, rot = null, sub = false } = {}) {
    const inv = rot ? new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')).invert().elements : null;
    const f = (x, y, z) => {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (inv) { const tx = inv[0] * px + inv[4] * py + inv[8] * pz, ty = inv[1] * px + inv[5] * py + inv[9] * pz, tz = inv[2] * px + inv[6] * py + inv[10] * pz; px = tx; py = ty; pz = tz; }
      const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]), k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
    };
    const m = Math.max(...r); if (!sub) this._grow(c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m);
    this.prims.push({ f, k, color, sub }); return this;
  }
  /** 둥근 박스 (중심, 반치수, 모서리 반경, 회전) */
  rbox(c, h, rad, { k = 0.06, color = 0xffffff, rot = null, sub = false } = {}) {
    const inv = rot ? new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')).invert().elements : null;
    const f = (x, y, z) => {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (inv) { const tx = inv[0] * px + inv[4] * py + inv[8] * pz, ty = inv[1] * px + inv[5] * py + inv[9] * pz, tz = inv[2] * px + inv[6] * py + inv[10] * pz; px = tx; py = ty; pz = tz; }
      const qx = Math.abs(px) - h[0] + rad, qy = Math.abs(py) - h[1] + rad, qz = Math.abs(pz) - h[2] + rad;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rad;
    };
    const m = Math.hypot(...h); if (!sub) this._grow(c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m);
    this.prims.push({ f, k, color, sub }); return this;
  }
  /** 이음선 홈: 평면 n·p = o 근처를 depth 만큼 파낸다. within(x,y,z) 로 영역 제한 */
  groove(n, o, { w = 0.012, depth = 0.012, within = null } = {}) { const l = Math.hypot(...n); this.grooves.push({ n: n.map((v) => v / l), o, w, depth, within }); return this; }
  setNoise(amp, freq, octave2 = 0.5) { this.noise = { amp, freq, octave2 }; return this; }

  eval(x, y, z) {
    let d = 1e9;
    for (const p of this.prims) { const di = p.f(x, y, z); d = p.sub ? Math.max(d, -di) : smin(d, di, p.k); }
    for (const g of this.grooves) { if (g.within && !g.within(x, y, z)) continue; const t = Math.abs(g.n[0] * x + g.n[1] * y + g.n[2] * z - g.o); if (t < g.w) { const s = 1 - t / g.w; d += g.depth * s * s * (3 - 2 * s); } }
    if (this.noise) { const { amp, freq, octave2 } = this.noise; d += amp * ((vnoise(x * freq, y * freq, z * freq) - 0.5) + octave2 * (vnoise(x * freq * 2.7 + 7, y * freq * 2.7, z * freq * 2.7) - 0.5)); }
    return d;
  }
  colorAt(x, y, z) { let best = 1e9, col = 0xffffff; for (const p of this.prims) { if (p.sub) continue; const di = p.f(x, y, z); if (di < best) { best = di; col = p.color; } } return col; }

  /** surface nets 로 메시. step = 격자 간격(m) */
  mesh(step = 0.04, { pad = 0.06 } = {}) {
    const b = this.box, x0 = b[0] - pad, y0 = b[1] - pad, z0 = b[2] - pad;
    const nx = Math.ceil((b[3] + pad - x0) / step) + 1, ny = Math.ceil((b[4] + pad - y0) / step) + 1, nz = Math.ceil((b[5] + pad - z0) / step) + 1;
    const V = new Float32Array(nx * ny * nz);
    const id = (i, j, k) => i + nx * (j + ny * k);
    // 거친 격자(4칸) 먼저 → 표면에서 먼 곳은 보간값으로 채워 계산을 크게 줄인다
    const S = 4, cnx = Math.ceil((nx - 1) / S) + 1, cny = Math.ceil((ny - 1) / S) + 1, cnz = Math.ceil((nz - 1) / S) + 1, cs = step * S;
    const Cg = new Float32Array(cnx * cny * cnz), ci = (i, j, k) => i + cnx * (j + cny * k);
    for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) Cg[ci(i, j, k)] = this.eval(x0 + i * cs, y0 + j * cs, z0 + k * cs);
    const far = cs * 0.95;
    for (let k = 0; k < nz; k++) { const K = Math.min(cnz - 2, (k / S) | 0), fz = k / S - K;
      for (let j = 0; j < ny; j++) { const J = Math.min(cny - 2, (j / S) | 0), fy = j / S - J;
        for (let i = 0; i < nx; i++) { const I = Math.min(cnx - 2, (i / S) | 0), fx = i / S - I;
          const c000 = Cg[ci(I, J, K)], c100 = Cg[ci(I + 1, J, K)], c010 = Cg[ci(I, J + 1, K)], c110 = Cg[ci(I + 1, J + 1, K)], c001 = Cg[ci(I, J, K + 1)], c101 = Cg[ci(I + 1, J, K + 1)], c011 = Cg[ci(I, J + 1, K + 1)], c111 = Cg[ci(I + 1, J + 1, K + 1)];
          const mn = Math.min(Math.abs(c000), Math.abs(c100), Math.abs(c010), Math.abs(c110), Math.abs(c001), Math.abs(c101), Math.abs(c011), Math.abs(c111));
          if (mn > far && (c000 > 0) === (c111 > 0) && (c000 > 0) === (c100 > 0) && (c000 > 0) === (c011 > 0)) {
            const a = c000 + (c100 - c000) * fx, b = c010 + (c110 - c010) * fx, c = c001 + (c101 - c001) * fx, d = c011 + (c111 - c011) * fx;
            V[id(i, j, k)] = (a + (b - a) * fy) * (1 - fz) + (c + (d - c) * fy) * fz;
          } else V[id(i, j, k)] = this.eval(x0 + i * step, y0 + j * step, z0 + k * step);
        } } }
    const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
    const pos = [], idx = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = V[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; cv[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, bb] of E) {
        const va = cv[a], vb = cv[bb]; if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += (a & 1) + t * ((bb & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((bb >> 1) & 1) - ((a >> 1) & 1)); sz += ((a >> 2) & 1) + t * (((bb >> 2) & 1) - ((a >> 2) & 1)); n++;
      }
      cellV[cid(i, j, k)] = pos.length / 3;
      pos.push(x0 + (i + sx / n) * step, y0 + (j + sy / n) * step, z0 + (k + sz / n) * step);
    }
    // 면: 부호가 바뀌는 격자 모서리마다 주변 4칸의 정점을 잇는다
    const quad = (a, b2, c, d, flip) => { if (a < 0 || b2 < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, d, c, a, c, b2); else idx.push(a, b2, c, a, c, d); };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const va = V[id(i, j, k)], vb = V[id(i + 1, j, k)]; if ((va < 0) === (vb < 0)) continue; quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)], va < 0); }
    for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const va = V[id(i, j, k)], vb = V[id(i, j + 1, k)]; if ((va < 0) === (vb < 0)) continue; quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i - 1, j, k)], cellV[cid(i, j, k)], cellV[cid(i, j, k - 1)], va < 0); }
    for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const va = V[id(i, j, k)], vb = V[id(i, j, k + 1)]; if ((va < 0) === (vb < 0)) continue; quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)], va < 0); }
    // 표면으로 한 번 끌어당기고, 기울기로 법선, 부품 색
    const nor = new Float32Array(pos.length), col = new Float32Array(pos.length), e = step * 0.5, c3 = new THREE.Color();
    for (let v = 0; v < pos.length; v += 3) {
      let x = pos[v], y = pos[v + 1], z = pos[v + 2];
      for (let it = 0; it < 2; it++) {
        const d = this.eval(x, y, z), gx = this.eval(x + e, y, z) - this.eval(x - e, y, z), gy = this.eval(x, y + e, z) - this.eval(x, y - e, z), gz = this.eval(x, y, z + e) - this.eval(x, y, z - e), gl = Math.hypot(gx, gy, gz) || 1;
        if (it === 0) { const s = Math.max(-step * 0.5, Math.min(step * 0.5, d)); x -= gx / gl * s; y -= gy / gl * s; z -= gz / gl * s; }
        else { nor[v] = gx / gl; nor[v + 1] = gy / gl; nor[v + 2] = gz / gl; }
      }
      pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
      c3.set(this.colorAt(x, y, z)); col[v] = c3.r; col[v + 1] = c3.g; col[v + 2] = c3.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }
}
