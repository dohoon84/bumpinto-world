// [subway] 정적 지오메트리 합치기 + 글자 아틀라스 (draw call 줄이기)
//   createBuilder(): box/quad 를 꼭짓점 색으로 쌓은 뒤 build() 한 번에 BufferGeometry 하나로 합친다.
//   createAtlas(): 캔버스 한 장에 간판 글자를 모아 그리고 UV 사각형을 돌려준다 (간판 전부 = 텍스처 1장, draw call 1).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

export function createBuilder() {
  const pos = [], nor = [], col = [], uv = [], idx = [];
  let base = null; // 현재 프레임(Matrix4) — 출구마다 위치·방향
  const nm = new THREE.Matrix3();
  function push(g, m, color, uvRect, shade) {
    const full = base ? base.clone().multiply(m) : m;
    nm.getNormalMatrix(full);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const o = pos.length / 3;
    _c.set(color);
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(full); pos.push(v.x, v.y, v.z);
      const ly = P.getY(i);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      const k = shade ? shade(ly, i) : 1;
      col.push(_c.r * k, _c.g * k, _c.b * k);
      if (uvRect) uv.push(uvRect.u0 + U.getX(i) * (uvRect.u1 - uvRect.u0), uvRect.v0 + U.getY(i) * (uvRect.v1 - uvRect.v0));
      else uv.push(0, 0);
    }
    const I = g.index.array;
    for (let i = 0; i < I.length; i++) idx.push(I[i] + o);
    g.dispose();
  }
  const mat = (x, y, z, ry = 0, rx = 0, sx = 1, sy = 1, sz = 1, rz = 0) =>
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)).clone();
  return {
    frame(m) { base = m; },
    // 중심 (x,y,z), 크기 (sx,sy,sz)
    box(x, y, z, sx, sy, sz, color, { ry = 0, rx = 0, rz = 0, shade = null } = {}) {
      push(new THREE.BoxGeometry(1, 1, 1), mat(x, y, z, ry, rx, sx, sy, sz, rz), color, null, shade);
    },
    // 바닥 기준 박스 (y0 ~ y0+h)
    block(x, y0, z, sx, h, sz, color, o) { this.box(x, y0 + h / 2, z, sx, h, sz, color, o); },
    // 세운 사각형(기본 +z 를 봄). uv 가 있으면 아틀라스 영역
    quad(x, y, z, w, h, color, { ry = 0, rx = 0, uv = null } = {}) {
      push(new THREE.PlaneGeometry(w, h), mat(x, y, z, ry, rx), color, uv);
    },
    cyl(x, y0, z, r, h, color, seg = 8) {
      const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
      push(g, mat(x, y0 + h / 2, z), color);
    },
    get count() { return idx.length / 3; },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      return g;
    },
  };
}

// 행 단위로 쌓는 간단한 아틀라스. draw(ctx, w, h) 는 (0,0) 기준으로 그린다.
export function createAtlas(size = 1024, height = size, name = 'atlas') {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = height;
  const ctx = cv.getContext('2d');
  let x = 0, y = 0, rowH = 0;
  const PAD = 2;
  return {
    canvas: cv,
    add(w, h, draw) {
      w = Math.ceil(w); h = Math.ceil(h);
      if (x + w + PAD > size) { x = 0; y += rowH + PAD; rowH = 0; }
      if (y + h > height) { console.warn(`[subway] ${name} full: ${w}x${h} at y=${y}`); return { u0: 0, v0: 0, u1: 0.001, v1: 0.001 }; }
      ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); draw(ctx, w, h); ctx.restore();
      const r = { u0: (x + 0.5) / size, u1: (x + w - 0.5) / size, v0: 1 - (y + h - 0.5) / height, v1: 1 - (y + 0.5) / height };
      x += w + PAD; rowH = Math.max(rowH, h);
      return r;
    },
    used: () => ({ w: size, h: height, y: y + rowH }),
    texture() {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
      return t;
    },
  };
}

export const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
export const LINE = { suin: '#F5A200', shin: '#D4003B' }; // 수인분당선 노랑 · 신분당선 빨강 (비공식 근사색)

// 간판 공통 그리기 도우미
export function fitText(ctx, text, maxW, px, weight = 700) {
  let s = px;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 8 && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = `${weight} ${s}px ${FONT}`; }
  return s;
}
export function lineBadge(ctx, x, y, h, color, text) {
  ctx.font = `800 ${Math.round(h * 0.56)}px ${FONT}`;
  const w = ctx.measureText(text).width + h * 0.7;
  ctx.fillStyle = color; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  return w;
}
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// 출구 번호 타일 (일반 스타일: 노란 바탕 + 검은 숫자, 공식 로고 아님)
export function exitNumber(ctx, x, y, s, ref) {
  ctx.fillStyle = '#FFC20E'; roundRect(ctx, x, y, s, s, s * 0.12); ctx.fill();
  if (!ref) return;
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(s * 0.78)}px ${FONT}`; ctx.fillText(ref, x + s / 2, y + s / 2 + s * 0.04);
}
