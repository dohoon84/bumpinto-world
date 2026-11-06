// [bump24game] 파란 장바구니(망사 텍스처, alphaTest) + 담긴 상품 쌓기(위로 삐져나옴) + 넘침
import * as THREE from 'three';
import { BASKET_MAX_KG, SHAPES, ProductBatch, productAtlasCached, scoreOf } from './products.js';

const L = 0.48, W = 0.33, HB = 0.27, FL = 0.03; // 안 길이(x)·폭(z)·높이, 위로 벌어짐
const SOLID = [0.02, 0.86, 0.98, 0.99];
const MESH = [0.0, 0.0, 1.0, 0.8];

function basketTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#2f86ff'); g.addColorStop(1, '#1356c4');
  c.fillStyle = g; c.fillRect(0, 0, 512, 256);
  // 망사 구멍(투명) — 아래 80%(v 0..0.8 → 캔버스 y 51..256)
  c.globalCompositeOperation = 'destination-out';
  const cols = 14, rows = 5, x0 = 10, y0 = 62, cw = (512 - 20) / cols, ch = (256 - 72) / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + i * cw + 4, y = y0 + j * ch + 4, w = cw - 8, h = ch - 9, r = 6;
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  // 윗 테 하이라이트 + 로고 띠
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, 6, 512, 4);
  c.fillStyle = '#ffffff'; c.font = '900 26px "Pretendard","Noto Sans KR",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BUMP24', 256, 32);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function remap(g, r) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1])); return g; }
function buildBasketGeometry() {
  const parts = [];
  const wall = (w0, w1, h, x, z, ry) => { // 사다리꼴 벽(아래 w0, 위 w1)
    const g = new THREE.PlaneGeometry(1, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i) + 0.5, xx = p.getX(i); p.setXYZ(i, xx * (w0 + (w1 - w0) * yy), yy * h, 0); }
    g.computeVertexNormals(); remap(g, [0, 0.02, 1, 0.8]); g.rotateY(ry); g.translate(x, 0.015, z); g.rotateX(0); return g;
  };
  // 벽은 위로 갈수록 바깥으로 벌어지게 기울임
  const tilt = Math.atan2(FL, HB);
  const front = wall(L, L + FL * 2, HB, 0, 0, 0); front.rotateX(tilt); front.translate(0, 0, W / 2); parts.push(front);
  const back = wall(L, L + FL * 2, HB, 0, 0, Math.PI); back.rotateX(-tilt); back.translate(0, 0, -W / 2); parts.push(back);
  const left = wall(W, W + FL * 2, HB, 0, 0, -Math.PI / 2); left.rotateZ(tilt); left.translate(-L / 2, 0, 0); parts.push(left);
  const right = wall(W, W + FL * 2, HB, 0, 0, Math.PI / 2); right.rotateZ(-tilt); right.translate(L / 2, 0, 0); parts.push(right);
  const bottom = new THREE.PlaneGeometry(L, W); bottom.rotateX(-Math.PI / 2); bottom.translate(0, 0.015, 0); remap(bottom, MESH); parts.push(bottom);
  // 바닥 다리(받침) + 윗 테두리(두꺼운 띠)
  const TL = L + FL * 2 + 0.02, TW = W + FL * 2 + 0.02;
  for (const [w, d, x, z] of [[TL, 0.022, 0, TW / 2], [TL, 0.022, 0, -TW / 2], [0.022, TW, TL / 2, 0], [0.022, TW, -TL / 2, 0]]) { const b = new THREE.BoxGeometry(w, 0.03, d); b.translate(x, HB + 0.01, z); remap(b, SOLID); parts.push(b); }
  for (const [w, d, x, z] of [[L, 0.02, 0, W / 2], [L, 0.02, 0, -W / 2], [0.02, W, L / 2, 0], [0.02, W, -L / 2, 0]]) { const b = new THREE.BoxGeometry(w, 0.02, d); b.translate(x, 0.01, z); remap(b, SOLID); parts.push(b); }
  // 손잡이 2개(양 긴 변에서 올라와 가운데서 만남)
  for (const s of [-1, 1]) {
    const t = new THREE.TorusGeometry(0.16, 0.011, 6, 18, Math.PI); t.rotateX(s * 0.42); t.translate(0, HB + 0.02, s * (TW / 2 - 0.01)); remap(t, SOLID); parts.push(t);
  }
  const nonIdx = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const a of ['position', 'normal', 'uv']) { const arr = []; for (const g of nonIdx) arr.push(...g.attributes[a].array); out.setAttribute(a, new THREE.Float32BufferAttribute(arr, a === 'uv' ? 2 : 3)); }
  for (const g of parts) g.dispose(); for (const g of nonIdx) g.dispose();
  out.computeBoundingSphere();
  return out;
}

export function createBasket({ maxKg = BASKET_MAX_KG } = {}) {
  const tex = basketTexture();
  const material = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.0 });
  const geometry = buildBasketGeometry();
  const group = new THREE.Group(); group.scale.setScalar(1.22);
  const body = new THREE.Mesh(geometry, material); group.add(body);
  const contentsMat = new THREE.MeshStandardMaterial({ map: productAtlasCached().tex, roughness: 0.42 });
  let contents = new THREE.Mesh(new THREE.BufferGeometry(), contentsMat); group.add(contents);
  const items = []; // { item, sale, t }
  let weight = 0, score = 0, stunned = 0, bounce = 0, swing = 0;
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

  function relayout() {
    const b = new ProductBatch();
    let x = -L / 2 + 0.01, z = -W / 2 + 0.01, y = 0.03, rowD = 0, layerH = 0, k = 0;
    for (const { item } of items) {
      const S = SHAPES[item.shape]; let fx, fz, fh, rx = 0, rz = 0, ry = 0;
      if (['bagSnack', 'pouch', 'ice', 'gift'].includes(item.shape)) { fx = S.w; fz = S.h; fh = S.d; rx = -Math.PI / 2; } // 앞면이 위로
      else if (['pet', 'soju', 'wine', 'hot'].includes(item.shape)) { fx = S.h; fz = S.d; fh = S.w; rz = -Math.PI / 2; } // 눕힘
      else { fx = S.w; fz = S.d; fh = S.h; }
      fx = Math.min(fx, L - 0.02); fz = Math.min(fz, W - 0.02);
      if (x + fx > L / 2 - 0.005) { x = -L / 2 + 0.01; z += rowD + 0.005; rowD = 0; }
      if (z + fz > W / 2 - 0.005) { x = -L / 2 + 0.01; z = -W / 2 + 0.01; y += layerH * 0.82; layerH = 0; rowD = 0; }
      const j = Math.sin(k * 12.9898 + 1.3) * 0.5; k++;
      let px = x + fx / 2, py = y, pz = z + fz / 2;
      if (rx) { py = y + fh / 2; pz = z + fz; } // 앞면 위: -z 로 뻗음
      if (rz) { px = x; py = y + fh / 2; } // 눕힌 병: +x 로 뻗음
      _e.set(rx + j * 0.1, ry + (rx || rz ? 0 : j * 0.5), rz + j * 0.08, 'XYZ'); _q.setFromEuler(_e);
      _m.compose(_p.set(px, py, pz), _q, _s);
      b.add(item, _m);
      x += fx + 0.006; rowD = Math.max(rowD, fz); layerH = Math.max(layerH, fh);
    }
    contents.geometry.dispose();
    contents.geometry = items.length ? b.build() : new THREE.BufferGeometry();
  }

  const api = {
    geometry, material, group,
    get items() { return items; },
    get weight() { return weight; },
    get score() { return score; },
    get fill() { return weight / maxKg; },
    get stunned() { return stunned; },
    maxKg,
    /** 담기. 무게 넘치면 overflow=true (호출 쪽에서 spill) */
    add(item, { sale = false } = {}) {
      items.push({ item, sale, t: performance.now() }); weight += item.weight; score += scoreOf(item, sale ? [item.id] : []);
      relayout(); bounce = 1;
      return { overflow: weight > maxKg + 1e-6 };
    },
    /** 위에서부터 n 개 쏟기 → 쏟은 목록 */
    spill(n) {
      const out = [];
      for (let i = 0; i < n && items.length; i++) { const it = items.splice(Math.floor(items.length * (0.5 + Math.random() * 0.5)), 1)[0]; weight -= it.item.weight; score -= scoreOf(it.item, it.sale ? [it.item.id] : []); out.push(it.item); }
      relayout(); stunned = 0.9; swing = 1;
      return out;
    },
    removeLast() { const it = items.pop(); if (!it) return null; weight -= it.item.weight; score -= scoreOf(it.item, it.sale ? [it.item.id] : []); relayout(); bounce = 0.5; return it; },
    clear() { items.length = 0; weight = 0; score = 0; relayout(); },
    update(dt, owner, held) {
      stunned = Math.max(0, stunned - dt);
      bounce = Math.max(0, bounce - dt * 4); swing = Math.max(0, swing - dt * 1.5);
      if (!held || !owner) return;
      // 오른손에 든 위치(아바타 기준) + 걸음 흔들림 + 담을 때 살짝 튐
      const t = performance.now() / 1000, sy = owner.rotation.y;
      const ox = -0.42, oz = 0.1; // 오른쪽(아바타 -x)·약간 앞
      const wx = Math.cos(sy) * ox + Math.sin(sy) * oz, wz = -Math.sin(sy) * ox + Math.cos(sy) * oz;
      group.position.set(owner.position.x + wx, 0.3 + Math.sin(bounce * Math.PI) * 0.06, owner.position.z + wz);
      group.rotation.set(Math.sin(t * 9) * 0.03 * (owner.userData.moving ? 1 : 0.3) + Math.sin(t * 30) * 0.2 * swing, sy + Math.PI / 2, Math.sin(t * 25) * 0.15 * swing);
    },
    worldTop(v) { v.set(0, HB + 0.05, 0); group.localToWorld(v); return v; },
    dispose() { tex.dispose(); material.dispose(); geometry.dispose(); contents.geometry.dispose(); contentsMat.dispose(); },
  };
  return api;
}
