// [tower] 발사탑/스타쉽/탱크용 절차적 캔버스 텍스처 + 공용 재질 (외부 에셋 없음, 로고/문자 없음)
// UV 는 "미터 / 타일크기" 로 지오메트리에서 맞추므로 텍스처 repeat 은 1 로 고정해 재질을 공유한다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TILE = { steelU: 7.0686, steelV: 7.2, heatU: 3.2, heatV: 3.325, concrete: 8 }; // 텍스처 1장이 덮는 실제 크기(m)

const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 스테인리스: 1.8m 링 4단(=7.2m) × 원주 1/4(=7.07m, 직경 9m 기준) — 브러시 결 + 링/패널 용접선 + 패널별 톤 차이
function stainless(seed = 7, base = 188) {
  const W = 1024, H = 1024, [c, x] = cv(W, H), r = rng(seed);
  x.fillStyle = `rgb(${base},${base + 3},${base + 7})`; x.fillRect(0, 0, W, H);
  const ringH = H / 4;
  for (let i = 0; i < 4; i++) {
    const n = 3, off = (i % 2) * (W / n / 2);
    for (let j = 0; j < n + 1; j++) { // 패널별 톤
      const t = (r() - 0.5) * 18; x.fillStyle = `rgba(${t > 0 ? 255 : 0},${t > 0 ? 255 : 0},${t > 0 ? 255 : 0},${Math.abs(t) / 255 * 2.2})`;
      x.fillRect(off + (j - 1) * (W / n), i * ringH, W / n, ringH);
    }
  }
  for (let k = 0; k < 5000; k++) { // 브러시 결(가로)
    const y = r() * H, x0 = r() * W, L = 30 + r() * 220, l = r() > 0.5;
    x.strokeStyle = l ? `rgba(255,255,255,${0.03 + r() * 0.06})` : `rgba(40,45,55,${0.03 + r() * 0.06})`;
    x.lineWidth = 1; x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + L, y + (r() - 0.5) * 2); x.stroke();
  }
  for (let k = 0; k < 18; k++) { // 옅은 얼룩
    const g = x.createRadialGradient(r() * W, r() * H, 0, r() * W, r() * H, 40 + r() * 120);
    g.addColorStop(0, `rgba(120,105,90,${0.05 + r() * 0.06})`); g.addColorStop(1, 'rgba(120,105,90,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  for (let i = 0; i <= 4; i++) { const y = i * ringH; x.fillStyle = 'rgba(60,60,64,0.75)'; x.fillRect(0, y - 2, W, 3); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, y + 1, W, 1); }
  for (let i = 0; i < 4; i++) { const n = 3, off = (i % 2) * (W / n / 2); for (let j = 0; j <= n; j++) { const xx = (off + j * (W / n)) % W; x.fillStyle = 'rgba(70,70,75,0.55)'; x.fillRect(xx - 1, i * ringH, 2, ringH); } }
  return tex(c);
}

// 검은 육각 내열 타일: 가로 10개 / 세로 12줄(짝수, 이음매 없이 반복). 타일마다 톤 편차, 드물게 회색 교체 타일
function heatTiles(seed = 3) {
  const cols = 10, rows = 12, W = 1024, w = W / cols, rad = w / Math.sqrt(3), H = Math.round(rows * 1.5 * rad);
  const [c, x] = cv(W, H), r = rng(seed);
  x.fillStyle = '#56575b'; x.fillRect(0, 0, W, H);
  const hex = (cx, cy) => { x.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; x.lineTo(cx + Math.cos(a) * (rad - 2.2), cy + Math.sin(a) * (rad - 2.2)); } x.closePath(); };
  for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) {
    const cx = i * w + (j & 1 ? w / 2 : 0), cy = j * 1.5 * rad;
    const v = r(), g = v > 0.996 ? 85 + r() * 25 : 20 + r() * 16;
    for (const [dx, dy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) {
      hex(cx + dx, cy + dy);
      const gr = x.createLinearGradient(cx + dx - rad, cy + dy - rad, cx + dx + rad, cy + dy + rad);
      gr.addColorStop(0, `rgb(${g + 10},${g + 10},${g + 12})`); gr.addColorStop(1, `rgb(${g - 6},${g - 6},${g - 4})`);
      x.fillStyle = gr; x.fill();
    }
  }
  return tex(c);
}

// 격자 철골: 짙은 회색 도장 + 그을음/녹 얼룩 + 볼트 점
function latticeSteel(seed = 11) {
  const W = 256, [c, x] = cv(W, W), r = rng(seed);
  x.fillStyle = '#6f7378'; x.fillRect(0, 0, W, W);
  for (let k = 0; k < 900; k++) { const v = r() > 0.5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.05})`; x.fillRect(r() * W, r() * W, 2 + r() * 10, 2 + r() * 10); }
  for (let k = 0; k < 14; k++) { x.fillStyle = `rgba(120,80,50,${0.05 + r() * 0.07})`; x.fillRect(r() * W, r() * W, 3 + r() * 6, 20 + r() * 80); }
  x.fillStyle = 'rgba(30,30,30,0.5)'; for (let i = 8; i < W; i += 32) { x.fillRect(6, i, 3, 3); x.fillRect(W - 9, i, 3, 3); }
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, W, 3); x.fillRect(0, W - 3, W, 3);
  return tex(c);
}

function concrete(seed = 5) {
  const W = 512, [c, x] = cv(W, W), r = rng(seed);
  x.fillStyle = '#a19d94'; x.fillRect(0, 0, W, W);
  for (let k = 0; k < 4000; k++) { const v = r() > 0.5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.05})`; x.fillRect(r() * W, r() * W, 1 + r() * 4, 1 + r() * 4); }
  for (let k = 0; k < 10; k++) { const g = x.createRadialGradient(r() * W, r() * W, 0, r() * W, r() * W, 30 + r() * 90); g.addColorStop(0, 'rgba(70,65,60,0.12)'); g.addColorStop(1, 'rgba(70,65,60,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); }
  x.fillStyle = 'rgba(90,88,84,0.6)'; x.fillRect(0, 0, W, 2); x.fillRect(0, 0, 2, W);
  return tex(c);
}

// 핫스테이징 링: 스테인리스 바탕에 세로 환기구(어두운 슬롯) 24개
function hotStageRing() {
  const W = 1024, H = 128, [c, x] = cv(W, H);
  x.fillStyle = '#b8bbbf'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) { const x0 = (i + 0.5) * (W / 24); x.fillStyle = '#1a1b1d'; x.fillRect(x0 - 14, 18, 28, H - 36); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(x0 - 14, 18, 28, 2); }
  x.fillStyle = 'rgba(60,60,64,0.8)'; x.fillRect(0, 0, W, 4); x.fillRect(0, H - 4, W, 4);
  return tex(c);
}

// 그리드핀 셀(마름모 격자) — 알파 텍스처
function gridFin() {
  const W = 256, [c, x] = cv(W, W);
  x.clearRect(0, 0, W, W); x.strokeStyle = '#fff'; x.lineWidth = 7;
  for (let k = -W; k <= 2 * W; k += 32) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + W, W); x.stroke(); x.beginPath(); x.moveTo(k, W); x.lineTo(k + W, 0); x.stroke(); }
  x.lineWidth = 16; x.strokeRect(0, 0, W, W);
  return tex(c, false);
}

// 간단한 하늘 그라데이션 환경맵(스테인리스 반사용) — scene.environment 는 건드리지 않고 재질에만 적용
function envMap(renderer) {
  const s = new THREE.Scene(), g = new THREE.SphereGeometry(100, 32, 16), col = [];
  const top = new THREE.Color('#6fb6e8'), hor = new THREE.Color('#eef7fb'), gnd = new THREE.Color('#a39577');
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 100; const cc = t >= 0 ? hor.clone().lerp(top, Math.pow(t, 0.5)) : hor.clone().lerp(gnd, Math.min(1, -t * 4)); col.push(cc.r, cc.g, cc.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5) }));
  sunDisc.position.set(-45, 90, 35); s.add(sunDisc);
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(s, 0.03).texture; pm.dispose(); g.dispose();
  return t;
}

let MATS = null;
export function towerMaterials(renderer) {
  if (MATS) return MATS;
  const env = renderer ? envMap(renderer) : null;
  const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1, ...o });
  const steelTex = stainless(7), tankTex = stainless(21, 205), latTex = latticeSteel(), conTex = concrete();
  MATS = {
    env,
    stainless: std({ map: steelTex, metalness: 0.85, roughness: 0.33, color: '#ffffff' }),
    stainlessDark: std({ map: steelTex, metalness: 0.8, roughness: 0.42, color: '#c9ccd0' }),
    tiles: std({ map: heatTiles(), metalness: 0.05, roughness: 0.82 }),
    tileFlat: std({ color: '#1d1e20', metalness: 0.05, roughness: 0.85 }),
    hsr: std({ map: hotStageRing(), metalness: 0.75, roughness: 0.38 }),
    engine: std({ color: '#3d3935', metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
    engineInner: std({ color: '#8a6a4a', metalness: 0.6, roughness: 0.5, side: THREE.BackSide }),
    dark: std({ color: '#1b1c1e', metalness: 0.3, roughness: 0.8, side: THREE.DoubleSide }),
    finFrame: std({ color: '#55585c', metalness: 0.7, roughness: 0.45 }),
    gridFin: std({ color: '#5a5d61', metalness: 0.7, roughness: 0.45, alphaMap: gridFin(), alphaTest: 0.5, side: THREE.DoubleSide }),
    lattice: std({ map: latTex, metalness: 0.45, roughness: 0.7 }),
    latticeDark: std({ map: latTex, metalness: 0.45, roughness: 0.75, color: '#8a8d92' }),
    pad: std({ color: '#151515', metalness: 0, roughness: 0.95 }),
    hydraulic: std({ color: '#c8ccd0', metalness: 0.9, roughness: 0.2 }),
    concrete: std({ map: conTex, metalness: 0, roughness: 0.95 }),
    concreteDark: std({ map: conTex, metalness: 0, roughness: 0.95, color: '#6b6862' }),
    tank: std({ map: tankTex, metalness: 0.5, roughness: 0.48, color: '#f4f5f6', envMapIntensity: 0.7 }),
    tankSupport: std({ map: latTex, metalness: 0.3, roughness: 0.8, color: '#9a9ca0' }),
    pipe: std({ color: '#a7abb0', metalness: 0.8, roughness: 0.35 }),
    redLight: new THREE.MeshBasicMaterial({ color: '#ff2a1a' }),
  };
  return MATS;
}

// ---- 지오메트리 유틸 ----
export function scaleUV(g, su, sv, ou = 0, ov = 0) { const uv = g.attributes.uv; if (!uv) return g; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov); return g; }
// position/normal/uv 만 남기고 비인덱스로 통일해 병합
export function merge(list) {
  const gs = list.filter(Boolean).map((g) => {
    let n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    n.morphAttributes = {}; n.clearGroups(); return n;
  });
  return gs.length ? mergeGeometries(gs) : null;
}
// a→b 를 잇는 부재(단면 w×d) 행렬. 단위 부재 지오메트리는 Y 축으로 길이 1, 원점 중심
const _Y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _s = new THREE.Vector3();
export function memberMatrix(a, b, w, d = w, out = new THREE.Matrix4()) {
  _d.subVectors(b, a); const L = _d.length(); _d.divideScalar(L || 1);
  _q.setFromUnitVectors(_Y, _d); _m.addVectors(a, b).multiplyScalar(0.5); _s.set(w, L, d);
  return out.compose(_m, _q, _s);
}
// a→b 를 잇는 박스 지오메트리(병합용)
export function beamGeo(a, b, w, d = w) { const g = new THREE.BoxGeometry(1, 1, 1); g.applyMatrix4(memberMatrix(a, b, w, d)); return g; }
export function cylGeo(a, b, r, seg = 10) { const g = new THREE.CylinderGeometry(1, 1, 1, seg, 1); g.applyMatrix4(memberMatrix(a, b, r, r)); return g; }
