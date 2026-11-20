// [depot] 가전 코너 — 입구 동쪽 복도 x 64.0–83.7, z 13.0–40.5 (A 계산대 띠 z ≤ 13 과 겹치지 않음).
//   입구에서 정면으로 보이는 독립형 TV 월(x 67–81.5, z 29.7): 85·75·65·55형 35대를 베젤 얇게 붙여 걸고,
//   화면 전부를 셰이더 InstancedMesh 하나로 그림(벽 전체가 한 화면처럼 이어지는 데모 ↔ 화면마다 같은 장면). 바닥 빛 번짐, 브랜드 띠, 줄마다 가격 레일.
//   앞쪽: TV 박스 거치대(책처럼 꽂힘) · 소형가전 파렛트 · 스탠드 TV 3대 + 타워 스피커 데모.
//   TV 월 뒤: 4도어 냉장고 6대(스테인리스·블랙 글라스·화이트·김치냉장고, 문 열면 안이 밝고 선반·음식), 드럼세탁기·건조기 6대(클릭/E = 드럼 회전),
//            노트북·태블릿·모니터·주방 소형가전 테이블, 고가 케이지 + 구매 카드, 로봇청소기 시연장(2대가 돌아다님), 안마의자.
//   최적화: 고정 형상은 정점색 메시 3개(무광·유광·발광)로 합침, 움직이는 부품은 종류별 InstancedMesh, 글자는 2048² 아틀라스 한 장,
//           화면 밖이면 그룹 숨김, 멀면 TV 셰이더는 평균색만, 모바일은 CHEAP 셰이더(노이즈 1옥타브·루프 축소).
//   소리: audio.play — elec-tv / elec-fridge-open / elec-fridge-close / elec-washer / elec-vac (stream D 이벤트 이름).
//   staff.js 는 수정하지 않음(카트가 TV에 부딪히면 화면만 깜빡, 충돌은 기존 장애물 경로).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BY_ID } from './products.js';

export const ELEC_ZONE = { x0: 64.0, x1: 83.7, z0: 13.0, z1: 40.5 };
const WALL = { x0: 67.0, x1: 81.5, z: 29.7, t: 0.5, y0: 0.3, y1: 5.1 };
const FRONT_Z = WALL.z - WALL.t / 2; // TV 가 붙는 면(-z, 입구 쪽)
const BACK_Z = WALL.z + WALL.t / 2;
// 전시 패널 외곽(스탠드 제외). real = 같은 급 공개 사양, derived = 16:9 대각선 계산
const TVD = {
  85: { w: 1.891, h: 1.087, src: 'real 1891×1087×57mm (85형 2024 4K, sony.jp K-XR70 사양)' },
  75: { w: 1.668, h: 0.960, src: 'derived 75" 16:9 = 1660×934mm + 베젤(est)' },
  65: { w: 1.445, h: 0.832, src: 'derived 65" 16:9 = 1439×809mm + 베젤(est)' },
  55: { w: 1.230, h: 0.710, src: 'derived 55" 16:9 = 1218×685mm + 베젤(est)' },
};
// [인치, 대수, 화면 아래 y]
const ROWS = [[55, 11, 0.90], [65, 9, 1.78], [75, 8, 2.78], [85, 7, 3.91]];
const DISPLAY = {
  fridge: { w: 0.914, h: 1.787, d: 0.918, src: 'real 914×1787×918mm 146kg (870L 4도어 공개 사양)' },
  washer: { w: 0.686, h: 0.984, d: 0.85, src: 'real 686×984×850mm 105kg (24kg 드럼 공개 사양)' },
  robot: { r: 0.175, h: 0.0965, src: 'real 353×350×96.5mm (라이다 로봇청소기 PDF)' },
  laptop: { w: 0.357, d: 0.25, src: 'est 16인치' }, tablet: { w: 0.25, h: 0.174, src: 'est 11인치' },
  monitor: { w: 0.62, h: 0.37, src: 'derived 27" 16:9 598×336 + 베젤' },
  micro: { w: 0.489, h: 0.275, d: 0.374, src: 'est 23L 외형(포장 552×326×423 안쪽)' },
  fryer: { r: 0.165, h: 0.32, src: 'est 5.5L 바스켓형' },
};
const CHANNELS = ['남산 야경', '탄천 자연', 'HDR 컬러', '바닷속'];
const CH_AVG = [[0.32, 0.2, 0.42], [0.38, 0.62, 0.48], [0.7, 0.4, 0.65], [0.12, 0.42, 0.62]];
const SEG = 14;
// 가격표 (게임 가안 = est)
const TAGS = {
  tv85: { name: '범비전 85형 4K', sub: 'BUMPVISION · 120Hz · 박스 31.9kg', price: 2490000, sale: true },
  tv75: { name: '범비전 75형 4K', sub: 'BUMPVISION · 120Hz · 박스 52kg', price: 1890000 },
  tv65: { name: '범비전 65형 4K', sub: 'BUMPVISION · 박스 37kg', price: 1290000 },
  tv55: { name: '범비전 55형 4K', sub: 'BUMPVISION · 박스 29kg', price: 849000, sale: true },
  fridge: { name: '범쿨 4도어 870L', sub: '문 열어 보세요 · 클릭/E', price: 1890000 },
  kimchi: { name: '범쿨 김치냉장고', sub: '스탠드형 4도어 · 체험', price: 1590000 },
  washer: { name: '범워시 드럼 21kg', sub: '클릭/E = 드럼 돌려 보기', price: 1090000 },
  dryer: { name: '범드라이 20kg', sub: '히트펌프 건조기', price: 1190000 },
  fryer: { name: '범에어프라이어 5.5L', sub: '에어프라이어', price: 89000, sale: true },
  micro: { name: '범레인지 25L', sub: '전자레인지', price: 149000 },
  cooker: { name: '범밥 10인분', sub: 'IH 전기밥솥', price: 129000 },
  robot: { name: '범청소 로봇', sub: '라이다 · 시연 중', price: 349000 },
  chair: { name: '범안마 체어', sub: '클릭/E 체험', price: 2490000 },
  laptop: { name: '범북 16', sub: '노트북 · 박스는 앞 파렛트', price: 1490000 },
  tablet: { name: '범패드 11', sub: '태블릿 · 체험용', price: 459000 },
  monitor: { name: '범비전 27 게이밍', sub: '165Hz 모니터', price: 329000, sale: true },
  speaker: { name: '범사운드 타워', sub: '클릭/E 들어보기', price: 590000 },
  headset: { name: '범음 헤드폰', sub: '오버이어', price: 199000 },
  console: { name: '범스테이션', sub: '게임기', price: 599000 },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const col = new THREE.Color(), Z3 = new THREE.Vector3(0, 0, 1), Y3 = new THREE.Vector3(0, 1, 0);
const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const F = (w, s) => `${w} ${s}px "Pretendard","Noto Sans KR",sans-serif`;

// 정점색 지오메트리 모음 → 하나로 합치기
class GeoBag {
  constructor() { this.parts = []; }
  add(g, color, m) {
    g = g.index ? g.toNonIndexed() : g; // 인덱스 유무 섞이지 않게
    g.deleteAttribute('uv'); if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3); col.set(color);
    const nr = this.shade && g.attributes.normal;
    for (let i = 0; i < n; i++) { const k = nr ? 0.6 + 0.4 * Math.max(0, nr.getX(i) * 0.36 + nr.getY(i) * 0.82 + nr.getZ(i) * -0.45) : 1; c[i * 3] = col.r * k; c[i * 3 + 1] = col.g * k; c[i * 3 + 2] = col.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); this.parts.push(g); return g;
  }
  // ---- 냉장고 속 일반 식품 (로고 없음, 저폴리) — 기준점 = 바닥 중앙 ----
  // 발광(Basic) 재질에 담는 것은 this.shade=true 로 면 방향 음영을 정점색에 구움 → 조명 없이도 입체로 읽힘, draw 추가 없음
  cy(rt, rb, h, seg, x, y, z, color, open = true) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), color, mat4(x, y + h / 2, z)); }
  bottle(x, y, z, r, h, body, cap, label = null, simple = false) { // 몸통 · 라벨 띠 · 어깨 · 목 · 뚜껑 (simple = 모바일: 몸통·어깨·뚜껑)
    this.cy(r, r * 0.97, h * 0.58, 6, x, y, z, body); if (label != null && !simple) this.cy(r * 1.02, r * 1.01, h * 0.26, 6, x, y + h * 0.17, z, label);
    this.cy(r * 0.36, r, h * 0.16, 6, x, y + h * 0.58, z, body); if (!simple) this.cy(r * 0.34, r * 0.36, h * 0.1, 6, x, y + h * 0.74, z, body);
    this.cy(r * 0.42, r * 0.42, simple ? h * 0.2 : h * 0.1, 6, x, y + (simple ? h * 0.74 : h * 0.84), z, cap, false);
  }
  carton(x, y, z, w, h, body, roof, label) { // 우유팩: 몸통 · 라벨 띠 · 박공 지붕(삼각기둥) · 접합 날개
    this.box(w, h, w, x, y + h / 2, z, body); this.box(w * 1.012, h * 0.36, w * 1.012, x, y + h * 0.42, z, label);
    const g = w * 0.42, hw = w / 2, P = [-hw, 0, -hw, hw, 0, -hw, 0, g, -hw, hw, 0, hw, -hw, 0, hw, 0, g, hw, -hw, 0, -hw, 0, g, -hw, 0, g, hw, -hw, 0, -hw, 0, g, hw, -hw, 0, hw, hw, 0, -hw, hw, 0, hw, 0, g, hw, hw, 0, -hw, 0, g, hw, 0, g, -hw];
    for (let t = 0; t < P.length; t += 9) for (let q = 0; q < 3; q++) { const v = P[t + 3 + q]; P[t + 3 + q] = P[t + 6 + q]; P[t + 6 + q] = v; } // 바깥이 앞면이 되게 감기 뒤집기
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.computeVertexNormals();
    this.add(geo, roof, mat4(x, y + h, z)); this.box(w * 0.08, w * 0.16, w * 1.0, x, y + h + g + w * 0.05, z, roof);
  }
  jar(x, y, z, r, h, food, lid) { this.cy(r, r, h, 6, x, y, z, food); this.cy(r * 1.04, r * 1.04, h * 0.22, 6, x, y + h, z, lid, false); }
  cup(x, y, z, r, h, body, foil) { this.cy(r, r * 0.8, h, 6, x, y, z, body); this.add(new THREE.CircleGeometry(r * 1.02, 6), foil, mat4(x, y + h + 0.001, z, -Math.PI / 2)); } // 요거트 컵 + 은박 뚜껑
  tub(x, y, z, w, h, d, food, lid) { this.box(w, h, d, x, y + h / 2, z, food); this.box(w + 0.006, 0.014, d + 0.006, x, y + h + 0.007, z, lid); } // 반찬통: 내용물 색 몸통 + 색 뚜껑
  ball(x, y, z, r, color, sy = 1) { this.add(new THREE.IcosahedronGeometry(r, 0), color, mat4(x, y + r * sy, z, 0, 0, 0, 1, sy, 1)); }
  eggs(x, y, z, nx = 5, nz = 2) { this.box(nx * 0.05 + 0.01, 0.03, nz * 0.05 + 0.01, x, y + 0.015, z, 0xcbb894); this.box(nx * 0.05 + 0.01, 0.05, 0.008, x, y + 0.055, z - nz * 0.025 - 0.01, 0xc4ad85, 0, -0.35); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) this.add(new THREE.OctahedronGeometry(0.021), (i + j) % 3 ? 0xf1e2c6 : 0xe9cfa4, mat4(x + (i - (nx - 1) / 2) * 0.05, y + 0.045, z + (j - (nz - 1) / 2) * 0.05, 0, 0.4, 0, 1, 1.3, 1)); } // 계란판 + 열린 뚜껑
  meat(x, y, z, flesh) { this.box(0.2, 0.024, 0.14, x, y + 0.012, z, 0xf2f2ef); this.box(0.165, 0.022, 0.105, x, y + 0.035, z, flesh); this.box(0.05, 0.002, 0.03, x + 0.05, y + 0.047, z + 0.03, 0xf4f1e6); } // 랩 씌운 고기 트레이 + 가격 스티커
  box(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, mat4(x, y, z, rx, ry, rz)); }
  cyl(rt, rb, h, seg, x, y, z, color, rx = 0, ry = 0, rz = 0, open = false) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), color, mat4(x, y, z, rx, ry, rz)); }
  disc(r, seg, x, y, z, color, rx = 0, ry = 0) { return this.add(new THREE.CircleGeometry(r, seg), color, mat4(x, y, z, rx, ry, 0)); }
  torus(R, r, x, y, z, color, rx = 0, ry = 0, seg = 20) { return this.add(new THREE.TorusGeometry(R, r, 6, seg), color, mat4(x, y, z, rx, ry, 0)); }
  build() { if (!this.parts.length) return null; const g = mergeGeometries(this.parts); for (const p of this.parts) p.dispose(); this.parts = []; return g; }
}
function insideTube(r, h, seg) { // 안쪽에서 보는 원통(드럼 안벽)
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true); const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
  const nm = g.attributes.normal; for (let i = 0; i < nm.count; i++) nm.setXYZ(i, -nm.getX(i), -nm.getY(i), -nm.getZ(i));
  return g;
}

// ---------- TV 화면 셰이더 (TV 월 + 스탠드 TV + 노트북·태블릿·모니터 전부 draw 1) ----------
const SCREEN_VS = /* glsl */`
attribute vec4 aRect; attribute float aMode;
varying vec2 vUv; varying vec4 vRect; varying float vMode;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv; vRect = aRect; vMode = aMode;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const SCREEN_FS = /* glsl */`
uniform float uTime, uChan, uNext, uMix, uSpan, uLogoA, uLod, uWallAspect, uBright, uFlick;
uniform vec3 uAvg; uniform sampler2D uLogo;
varying vec2 vUv; varying vec4 vRect; varying float vMode;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.), f.x), f.y); }
#ifdef CHEAP
float fbm(vec2 p) { return n2(p) * .75; }
#define FISH 2
#define CAUS 1
#else
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.03; a *= .5; } return s; }
#define FISH 5
#define CAUS 3
#endif
vec3 pal(float x) { return .5 + .5 * cos(6.2831 * (x + vec3(0., .33, .67))); }
vec3 scnNight(vec2 p, float a, float t) {
  vec3 col = mix(vec3(.98, .47, .26), vec3(.05, .05, .2), smoothstep(.22, .95, p.y));
  col = mix(col, vec3(.42, .14, .45), smoothstep(.4, .62, p.y) * (1. - smoothstep(.62, .9, p.y)) * .55);
  vec2 sc = floor(p * 70.); col += step(.988, h21(sc)) * smoothstep(.55, .9, p.y) * (.55 + .45 * sin(t * 3. + h21(sc) * 40.));
  float tx = a * .56;
  float m = .33 + .11 * exp(-pow((p.x - tx) / (a * .17), 2.)) + .018 * sin(p.x * 9.) + .02 * fbm(vec2(p.x * 4., 1.));
  if (p.y < m) col = vec3(.035, .045, .085) + vec3(.02, .05, .02) * fbm(p * 30.);
  float peak = .33 + .11 + .018 * sin(tx * 9.) + .01;
  float k = clamp((p.y - peak) / .3, 0., 1.);
  if (p.y > peak - .03 && p.y < peak + .3 && abs(p.x - tx) < mix(.013, .004, k)) col = vec3(.06, .07, .11);
  vec2 pd = (p - vec2(tx, peak + .2)) * vec2(1., 2.4);
  if (length(pd) < .032) col = vec3(.12, .12, .18) + vec3(1., .8, .5) * step(.45, fract(p.x * 90.)) * step(abs(pd.y), .012) * .9;
  col += vec3(1., .25, .2) * smoothstep(.013, .0, length(p - vec2(tx, peak + .31))) * step(.5, fract(t * .8)) * 1.5;
  // 강 건너 빌딩 스카이라인: 폭이 다른 빌딩 + 작은 창문 격자(층·칸 사이 여백) + 옥상 경고등
  float bx = floor(p.x * 34.), bh = .15 + .12 * h21(vec2(bx, 3.)) * h21(vec2(bx, 9.)) + .05 * step(.82, h21(vec2(bx, 5.)));
  if (p.y > .125 && p.y < bh) {
    col = vec3(.03, .035, .07) + .02 * h21(vec2(bx, 1.));
    vec2 wp = vec2(p.x * 34. - bx, (p.y - .125) * 260.), wc = floor(wp * vec2(7., 1.));
    float win = step(.18, fract(wp.x * 7.)) * step(.3, fract(wp.y)) * step(.08, wp.x) * step(wp.x, .92);
    float lit = step(.42, h21(wc + bx * 13.)) * (.75 + .25 * sin(t * .7 + h21(wc + 2.) * 20.));
    col += win * lit * mix(vec3(1., .78, .42), vec3(.72, .86, 1.), step(.6, h21(wc + 7. + bx))) * .85;
    col += vec3(1., .15, .1) * step(bh - .006, p.y) * step(abs(wp.x - .5), .06) * step(.5, fract(t * .6 + bx * .37)) * 2.;
  }
  if (p.y < .125) {
    float rip = sin(p.x * 70. + t * 2. + sin(p.y * 120.) * 2.) * .5 + .5;
    col = vec3(.02, .03, .08) + (vec3(1., .62, .3) * .4 + vec3(.3, .5, 1.) * .12) * rip * smoothstep(.0, .125, p.y);
  }
  return col;
}
vec3 scnNature(vec2 p, float a, float t) {
  vec3 col = mix(vec3(.62, .84, 1.), vec3(.16, .46, .95), p.y);
  float d = length(p - vec2(a * .76, .78));
  col += vec3(1., .9, .6) * (smoothstep(.085, .07, d) + .28 * exp(-d * 6.));
  float c = fbm(vec2(p.x * 2. - t * .06, p.y * 4.));
  col = mix(col, vec3(1.), smoothstep(.55, .8, c) * smoothstep(.45, .75, p.y));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float hg = .5 - .13 * fi + .06 * sin(p.x * (1.4 + fi) + fi * 2. + t * .03 * (fi + 1.)) + .035 * fbm(vec2(p.x * 3. + fi * 7., fi));
    vec3 g = mix(vec3(.36, .62, .45), vec3(.12, .5, .16), fi / 2.) * (.82 + .3 * fbm(p * vec2(22., 30.) + fi));
    if (p.y < hg) col = g;
  }
  float r = abs(p.y - (.11 + .035 * sin(p.x * 2. + 1.)));
  if (r < .026) col = mix(vec3(.42, .72, 1.), vec3(1.), .45 * step(.72, fract(p.x * 26. - t * .9)));
  vec2 fg = p * vec2(70., 50.);
  if (p.y < .2 && h21(floor(fg)) > .92) col = mix(col, mix(vec3(1., .42, .62), vec3(1., .9, .3), h21(floor(fg) + 1.)), smoothstep(.42, .2, length(fract(fg) - .5)));
  return col;
}
vec3 scnPlasma(vec2 p, float a, float t) {
  float v = sin(p.x * 3. + t) + sin(p.y * 4. + t * .7) + sin(p.x * 2. + p.y * 3. + t * 1.3) + sin(length(p - vec2(a * .5, .5)) * 8. - t * 2.);
  return pow(pal(v * .25 + t * .05), vec3(1.5)) * 1.35;
}
vec3 scnOcean(vec2 p, float a, float t) {
  vec3 col = mix(vec3(.0, .12, .3), vec3(.05, .55, .8), p.y);
  vec2 q = p * 6.; float c = 0.;
  for (int i = 0; i < CAUS; i++) { float fi = float(i); q += vec2(sin(q.y * 1.3 + t * .6 + fi), cos(q.x * 1.1 - t * .5 + fi)) * .35; c += abs(sin(q.x + q.y)); }
  col += vec3(.3, .8, 1.) * pow(1. - c / float(CAUS), 4.) * .9 * p.y;
  for (int i = 0; i < FISH; i++) {
    float fi = float(i);
    vec2 f = vec2(mod(t * .13 * (1. + fi * .3) + fi * 1.7, a + .4) - .2, .28 + .11 * fi + .04 * sin(t + fi));
    vec3 fc = mix(vec3(1., .55, .15), vec3(.95, .95, .3), fi / 4.);
    col = mix(col, fc, smoothstep(.034, .028, length((p - f) * vec2(1., 2.6))));
  }
  col = mix(col, vec3(.85, .75, .5) * (.8 + .2 * n2(p * 40.)), smoothstep(.1, .08, p.y + .02 * sin(p.x * 5.)));
  return col;
}
vec3 scn(float k, vec2 p, float a, float t) {
  if (k < .5) return scnNight(p, a, t);
  if (k < 1.5) return scnNature(p, a, t);
  if (k < 2.5) return scnPlasma(p, a, t);
  return scnOcean(p, a, t);
}
void main() {
  #include <logdepthbuf_fragment>
  float own = step(.5, vMode);
  float span = uSpan * (1. - own);
  vec2 uv = mix(vUv, mix(vRect.xy, vRect.zw, vUv), span);
  float a = mix(16. / 9., uWallAspect, span);
  vec2 p = vec2(uv.x * a, uv.y);
  vec3 c;
  if (uLod > .5) c = uAvg;
  else if (own > .5) c = scn(mod(uChan + vMode, 4.), p, a, uTime + vMode * 7.);
  else { c = scn(uChan, p, a, uTime); if (uMix > .001) c = mix(c, scn(uNext, p, a, uTime), uMix); }
  if (uLogoA > .001 && own < .5) {
    vec2 lc = (p - vec2(a * .5, .5)) / vec2(min(a * .62, 1.3), min(a * .62, 1.3) * .25) + .5;
    if (lc.x > 0. && lc.x < 1. && lc.y > 0. && lc.y < 1.) { vec4 L = texture2D(uLogo, lc); c = mix(c * (1. - .55 * uLogoA), L.rgb, L.a * uLogoA); }
  }
  if (uFlick > 0. && own < .5) {
    float n = h21(floor(vUv * vec2(90., 60.)) + floor(uTime * 24.));
    c = mix(c, vec3(n) * vec3(.9, 1., .95), clamp(uFlick * 1.4, 0., .9));
    if (fract(uTime * 6.3) < uFlick * .45) c *= .08;
  }
  vec2 e = abs(vUv - .5) * 2.;
  c *= 1. - .22 * pow(max(e.x, e.y), 6.);
  c += .045 * smoothstep(.18, .0, abs(vUv.x - vUv.y * .6 - .2));
  gl_FragColor = vec4(pow(max(c * uBright, 0.), vec3(2.2)), 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const GLOW_VS = `varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const GLOW_FS = `uniform vec3 uCol; uniform float uK; varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  float f = pow(1. - vUv.y, 2.4) * smoothstep(0., .08, vUv.x) * smoothstep(1., .92, vUv.x);
  float cols = .74 + .26 * sin(vUv.x * 40.); gl_FragColor = vec4(uCol * f * cols * uK, 1.); }`;

// 가전 박스 형상(UV 4분할). 모듈 수준에 둬서, 상품 객체(BY_ID, 모듈 전역)에 붙는 p.geo 가 매장 장면 클로저를 붙잡지 않게 한다.
const QUAD = { front: [0, 0.5], side: [0.5, 0.5], top: [0, 0], back: [0.5, 0] };
function elecBoxGeo(sx, sy, sz, res) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv, e = 2 / res;
  const faceQ = ['side', 'side', 'top', 'top', 'front', 'back'];
  for (let f = 0; f < 6; f++) { const [u0, v0] = QUAD[faceQ[f]]; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, u0 + e + uv.getX(i) * (0.5 - 2 * e), v0 + e + uv.getY(i) * (0.5 - 2 * e)); } }
  return g;
}
const elecGeoFactory = (size, res) => () => elecBoxGeo(...size, res);

export function mountElectronics({ scene, keep, canvasTex, obstacles, prodMeshes, prodGeo, prodMat, audio = null, toast = null, isMobile = false }) {
  const root = new THREE.Group(); root.name = 'depot-electronics'; scene.add(root);
  const stat = new GeoBag(), gloss = new GeoBag(), glow = new GeoBag();
  const tvHits = [];
  const targets = []; // {kind, i, box, label}
  const tgt = (kind, i, x0, y0, z0, x1, y1, z1, label) => targets.push({ kind, i, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)), label });
  const ob = (x0, x1, z0, z1, flicker = false) => { const o = { x0, x1, z0, z1 }; obstacles.push(o); if (flicker) tvHits.push(o); return o; };
  const sfx = (name, opts) => { try { audio?.play?.(name, opts); } catch { /* 소리 없어도 됨 */ } };
  const S = { t: 0, chan: 0, segT: 0, mix: 0, flick: 0, visible: true, fridges: [], washers: [], robots: [], speakerT: 0, chairT: 0, tvOn: false, vacOn: false, lod: 0 };
  const rack = 0x4a5a6a, dark = 0x15181c, white = 0xf2f3f1, cream = 0xf3eada, green = 0x1e5a45, post = 0x9aa3ad;

  // ---------- 아틀라스 2048² (간판·가격표) ----------
  const AT = 2048, cells = {}; let cx = 0, cy = 0, rowH = 0;
  const atlasCanvas = document.createElement('canvas'); atlasCanvas.width = AT; atlasCanvas.height = AT;
  const ag = atlasCanvas.getContext('2d');
  const cell = (key, w, h, draw) => { if (cx + w > AT) { cx = 0; cy += rowH; rowH = 0; } ag.save(); ag.translate(cx, cy); ag.beginPath(); ag.rect(0, 0, w, h); ag.clip(); draw(ag, w, h); ag.restore(); cells[key] = { u0: (cx + 1) / AT, u1: (cx + w - 1) / AT, v0: 1 - (cy + h - 1) / AT, v1: 1 - (cy + 1) / AT }; cx += w; rowH = Math.max(rowH, h); };
  cell('header', 2048, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0f2f24'); gr.addColorStop(1, '#123B2D'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#F2C230'; g.fillRect(0, h - 22, w, 22);
    g.fillStyle = '#F3EADA'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = F(900, 132); g.fillText('BUMPVISION', 70, 112);
    g.fillStyle = '#F2C230'; g.font = F(900, 118); g.fillText('범비전 TV', 900, 112);
    g.textAlign = 'right'; g.fillStyle = '#F3EADA'; g.font = F(800, 58); g.fillText('4K · HDR · 120Hz', w - 70, 80); g.font = F(700, 40); g.fillText('55 · 65 · 75 · 85형  —  박스는 앞 거치대에서 카트로', w - 70, 160);
  });
  cell('back', 1024, 256, (g, w) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, w, 256); g.fillStyle = '#F2C230'; g.fillRect(0, 214, w, 42);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 96); g.fillText('생활 · 주방가전', w / 2, 100);
    g.fillStyle = '#123B2D'; g.font = F(800, 30); g.fillText('냉장고 · 세탁기 · 노트북 · 로봇청소기 · 안마의자', w / 2, 236);
  });
  cell('hang', 1024, 256, (g, w, h) => {
    g.fillStyle = '#1E5A45'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 26); g.fill(); g.fillStyle = '#F2C230'; g.fillRect(8, h - 64, w - 16, 18);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 104); g.fillText('가전 · TV', w / 2, 98); g.font = F(800, 34); g.fillText('ELECTRONICS · 범비전 · 범전자', w / 2, 168);
  });
  cell('zone', 1024, 256, (g, w) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, w, 256); g.fillStyle = '#F2C230'; g.fillRect(0, 214, w, 42);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 110); g.fillText('가전', w / 2, 100);
    g.fillStyle = '#123B2D'; g.font = F(800, 28); g.fillText('BUMPVISION · 범전자 체험 · 구매 카드', w / 2, 236);
  });
  cell('floor', 1024, 256, (g, w) => {
    g.fillStyle = '#1E5A45'; g.beginPath(); g.roundRect(0, 70, w, 116, 20); g.fill();
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 72); g.fillText('가전 · TV 월  ↑', w / 2, 130);
  });
  cell('cage', 1024, 256, (g, w, h) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, w, h); g.fillStyle = '#F2C230'; g.fillRect(0, 0, 16, h); g.fillRect(w - 16, 0, 16, h);
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 72); g.fillText('고가 상품 케이지', w / 2, 90);
    g.font = F(700, 32); g.fillText('구매 카드를 뽑아 계산대로 가세요  ·  잠김', w / 2, 180);
  });
  cell('robotSign', 512, 256, (g, w, h) => {
    g.fillStyle = '#F2C230'; g.fillRect(0, 0, w, h); g.fillStyle = '#22262A'; for (let i = -4; i < 20; i++) { g.beginPath(); g.moveTo(i * 40, h); g.lineTo(i * 40 + 20, h); g.lineTo(i * 40 + 40, h - 30); g.lineTo(i * 40 + 20, h - 30); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 58); g.fillText('범봇 시연 중', w / 2, 80); g.font = F(800, 30); g.fillText('밟지 마세요 · 부딪히면 돌아가요', w / 2, 150);
  });
  for (const [k, tg] of Object.entries(TAGS)) cell(`tag-${k}`, 512, 256, (g, w) => {
    g.fillStyle = '#FBF7EE'; g.fillRect(0, 0, w, 256); g.fillStyle = tg.sale ? '#D9442E' : '#1E5A45'; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#F3EADA'; g.font = F(800, 26); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(tg.sale ? '범창고 특가' : '범창고 정자점 · 가전', 22, 37);
    g.fillStyle = '#22262A'; g.font = F(800, 38); g.fillText(tg.name, 22, 102, w - 44); g.fillStyle = '#5a5f63'; g.font = F(600, 24); g.fillText(tg.sub, 22, 138, w - 44);
    g.textAlign = 'right'; g.fillStyle = tg.sale ? '#D9442E' : '#22262A'; g.font = F(800, 72); g.fillText(tg.price.toLocaleString('ko-KR'), 458, 226); g.font = F(800, 32); g.fillText('원', 498, 226);
    g.fillStyle = '#22262A'; for (let i = 0; i < 22; i++) g.fillRect(22 + i * 6, 172, (i * 7) % 3 + 1, 56);
  });
  const atlasTex = keep(new THREE.CanvasTexture(atlasCanvas)); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4;
  const signParts = [];
  const quad = (key, w, h, x, y, z, ry = 0, rx = 0) => { const c = cells[key]; const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, c.u0 + uv.getX(i) * (c.u1 - c.u0), c.v0 + uv.getY(i) * (c.v1 - c.v0)); g.applyMatrix4(mat4(x, y, z, rx, ry, 0)); signParts.push(g); };
  const tagAt = (key, x, y, z, ry = Math.PI, s = 1) => quad(`tag-${key}`, 0.44 * s, 0.22 * s, x, y, z, ry);

  // ---------- 구역 표시 ----------
  quad('zone', 8, 2, 83.55, 6.2, 22, -Math.PI / 2);
  quad('hang', 4.2, 1.05, 74.25, 6.6, 16.6, Math.PI); quad('hang', 4.2, 1.05, 74.25, 6.6, 16.62, 0);
  stat.box(0.02, 0.85, 0.02, 72.6, 7.55, 16.61, post); stat.box(0.02, 0.85, 0.02, 75.9, 7.55, 16.61, post);
  quad('floor', 3.6, 0.9, 74.25, 0.008, 17.4, Math.PI, -Math.PI / 2);
  glow.box(19.5, 0.004, 0.08, 73.85, 0.004, 13.05, 0xf2c230); // 구역 안전선 (A 띠 z ≤ 13 바깥)

  // ---------- TV 월 ----------
  const WW = WALL.x1 - WALL.x0, WH = WALL.y1 - WALL.y0, WX = (WALL.x0 + WALL.x1) / 2;
  stat.box(WW + 0.3, WH + 0.2, WALL.t, WX, (WALL.y0 + WALL.y1) / 2, WALL.z, 0x23282f);
  stat.box(WW + 0.5, WALL.y0, WALL.t + 0.4, WX, WALL.y0 / 2, WALL.z, 0x1a1d22);
  gloss.box(WW + 0.5, 0.02, WALL.t + 0.4, WX, WALL.y0 + 0.002, WALL.z, 0x2b3038);
  stat.box(WW + 0.5, 1.3, 0.24, WX, WALL.y1 + 0.72, WALL.z - 0.03, 0x123b2d);
  quad('header', WW - 0.2, 1.21, WX, WALL.y1 + 0.72, FRONT_Z - 0.16, Math.PI);
  quad('back', 6, 1.5, WX, 3.6, BACK_Z + 0.01, 0); quad('header', 6, 0.75, WX, WALL.y1 + 0.72, BACK_Z + 0.1, 0);
  glow.box(WW + 0.5, 0.03, 0.02, WX, WALL.y1 + 0.06, FRONT_Z - 0.13, 0xfff4d8);
  glow.box(WW + 0.5, 0.025, 0.02, WX, WALL.y0 + 0.03, FRONT_Z - 0.21, 0x9fd8ff);
  for (const sx of [-1, 1]) glow.box(0.03, WH, 0.02, WX + sx * (WW / 2 + 0.14), (WALL.y0 + WALL.y1) / 2, FRONT_Z - 0.01, 0x9fd8ff);
  ob(WALL.x0 - 0.25, WALL.x1 + 0.25, WALL.z - 0.45, WALL.z + 0.45, true);
  const scr = []; // {x,y,z,w,h,ry,rx,rect,mode}
  const bez = []; // 베젤 인스턴스
  for (const [inch, n, y0] of ROWS) {
    const { w, h } = TVD[inch], pitch = (WW - 0.3) / n, yc = y0 + h / 2;
    stat.box(WW - 0.1, 0.1, 0.12, WX, y0 - 0.085, FRONT_Z - 0.06, 0xe8ebee); // 가격 레일
    gloss.box(WW - 0.1, 0.012, 0.13, WX, y0 - 0.03, FRONT_Z - 0.06, 0xbfc6cc);
    for (let i = 0; i < n; i++) {
      const x = WALL.x0 + 0.15 + pitch * (i + 0.5);
      bez.push({ x, y: yc, z: FRONT_Z - 0.028, w: w + 0.012, h: h + 0.012, d: 0.05, ry: 0 });
      const u0 = (WALL.x1 - (x + w / 2)) / WW, u1 = (WALL.x1 - (x - w / 2)) / WW; // 보는 사람 오른쪽 = -x
      scr.push({ x, y: yc, z: FRONT_Z - 0.0545, w, h, ry: Math.PI, rect: [u0, (yc - h / 2 - WALL.y0) / WH, u1, (yc + h / 2 - WALL.y0) / WH], mode: 0 });
      glow.box(0.01, 0.006, 0.004, x + w / 2 - 0.04, yc - h / 2 - 0.002, FRONT_Z - 0.055, 0xff3b30);
      glow.box(0.06, 0.006, 0.004, x, yc - h / 2 - 0.002, FRONT_Z - 0.055, 0xd8dde2);
      quad(`tag-tv${inch}`, 0.2, 0.1, x, y0 - 0.085, FRONT_Z - 0.121, Math.PI);
    }
  }
  tgt('tvwall', 0, WALL.x0, WALL.y0, FRONT_Z - 0.3, WALL.x1, WALL.y1, FRONT_Z + 0.05, 'TV 월');
  const glowM = keep(new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color() }, uK: { value: 0.5 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glowG = keep(new THREE.PlaneGeometry(WW + 1.2, 7)); glowG.rotateX(-Math.PI / 2);
  const floorGlow = new THREE.Mesh(glowG, glowM); floorGlow.position.set(WX, 0.012, FRONT_Z - 3.5); floorGlow.renderOrder = 2; root.add(floorGlow);

  // ---------- 스탠드 TV 3대 + 타워 스피커 (z 26.2) ----------
  const HZ = 26.2;
  [[69.6, 55], [74.25, 65], [78.9, 55]].forEach(([x, inch], i) => {
    const { w, h } = TVD[inch], cw = inch === 65 ? 1.8 : 1.5;
    stat.box(cw, 0.42, 0.42, x, 0.21, HZ, i === 1 ? 0x3a3027 : 0xe9e4dc); stat.box(cw - 0.04, 0.02, 0.36, x, 0.425, HZ, 0x2a2420);
    gloss.box(cw * 0.45, 0.012, 0.22, x, 0.44, HZ, 0x30353c); gloss.box(0.06, 0.06, 0.04, x, 0.47, HZ + 0.02, 0x30353c);
    const yc = 0.5 + h / 2;
    bez.push({ x, y: yc, z: HZ + 0.04, w: w + 0.012, h: h + 0.012, d: 0.04, ry: 0 });
    scr.push({ x, y: yc, z: HZ + 0.0195, w, h, ry: Math.PI, mode: 1 + i });
    if (inch === 65) gloss.box(1.0, 0.065, 0.09, x, 0.5, HZ - 0.15, 0x22262a);
    tagAt(inch === 65 ? 'tv65' : 'tv55', x, 0.3, HZ - 0.215, Math.PI, 0.8);
    ob(x - cw / 2, x + cw / 2, HZ - 0.25, HZ + 0.25, true);
  });
  const coneG = new GeoBag(); coneG.cyl(1, 0.55, 0.3, 18, 0, 0, 0.15, 0x2b2f35, Math.PI / 2); coneG.cyl(0.32, 0.32, 0.2, 12, 0, 0, 0.0, 0x9aa3ad, Math.PI / 2);
  const cones = new THREE.InstancedMesh(keep(coneG.build()), keep(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30 })), 6);
  const coneSpots = [];
  for (const sx of [-1, 1]) {
    const x = 74.25 + sx * 1.32; stat.box(0.26, 1.06, 0.32, x, 0.53, HZ, 0x2f241b); stat.box(0.24, 0.94, 0.006, x, 0.56, HZ - 0.163, 0x1c1f24);
    coneSpots.push([x, 0.92, 0.035], [x, 0.66, 0.08], [x, 0.36, 0.08]);
  }
  tgt('speaker', 0, 72.8, 0, HZ - 0.4, 75.7, 1.7, HZ + 0.3, '스피커');
  tagAt('speaker', 74.25 + 1.32, 1.18, HZ - 0.17, Math.PI, 0.7);
  const setCones = (pulse) => { coneSpots.forEach(([x, y, r], i) => { const k = 1 + (i % 3 === 0 ? pulse * 0.2 : pulse); _m.compose(_v.set(x, y, HZ - 0.166 - pulse * 0.01), _q.set(0, 1, 0, 0), new THREE.Vector3(r, r, r * k)); cones.setMatrixAt(i, _m); }); cones.instanceMatrix.needsUpdate = true; };
  setCones(0); root.add(cones);

  // ---------- 상자 그림 (앞=왼쪽 위 · 옆=오른쪽 위 · 윗면=왼쪽 아래 · 뒤=오른쪽 아래, 뒤는 앞을 180° 돌려 인쇄) ----------
  // 대형 TV 박스는 카트에 눕히면 뒷면(-z)이 위로 오고 글자 윗변이 카트 앞쪽을 향함 → 손잡이 쪽에서 바로 읽힘.
  const ART = { tv55: 'tv', tv65: 'tv', tv75: 'tv', tv85: 'tv', fridge: 'fridge', washer: 'washer', dryer: 'washer', fryer: 'fryer', micro: 'micro', cooker: 'cooker', vac: 'robot', laptop: 'laptop', headset: 'headset', console: 'console' };
  function boxArt(p) {
    const big = ART[p.id] === 'tv' || p.size[1] > 0.9, W = big ? 1024 : 512, q = W / 2;
    const [sx, sy, sz] = p.size, bg = p.color, ink = p.ink;
    return canvasTex(W, W, (g) => {
      const face = (ox, oy, fw, fh, draw, rot = false) => {
        const k = 640 / Math.max(fw, fh), cw = Math.max(48, Math.round(fw * k)), ch = Math.max(48, Math.round(fh * k));
        const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d'); draw(x, cw, ch);
        g.save(); if (rot) { g.translate(ox + q, oy + q); g.rotate(Math.PI); g.drawImage(c, 0, 0, q, q); } else g.drawImage(c, ox, oy, q, q); g.restore();
      };
      const front = (x, w, h) => {
        x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
        const u = Math.min(w, h), a = ART[p.id];
        x.fillStyle = '#1E5A45'; x.fillRect(0, h * 0.84, w, h * 0.16); x.fillStyle = '#F2C230'; x.fillRect(0, h * 0.82, w, h * 0.02);
        x.fillStyle = '#F3EADA'; x.font = F(900, u * 0.085); x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(a === 'tv' ? 'BUMPVISION' : '범전자', w * 0.04, h * 0.92);
        x.textAlign = 'right'; x.font = F(800, u * 0.065); x.fillText(`${p.kg} kg`, w * 0.96, h * 0.92);
        x.textAlign = 'left'; x.fillStyle = ink;
        if (a === 'tv') {
          const inch = +p.id.slice(2), tw = w * 0.56, th = tw * 9 / 16, tx = w * 0.05, ty = h * 0.1;
          x.fillStyle = '#16191d'; x.fillRect(tx - 6, ty - 6, tw + 12, th + 12);
          const gr = x.createLinearGradient(0, ty, 0, ty + th); gr.addColorStop(0, '#2b1a5a'); gr.addColorStop(0.55, '#f07a4a'); gr.addColorStop(0.56, '#121a2e'); gr.addColorStop(1, '#0a0f1c'); x.fillStyle = gr; x.fillRect(tx, ty, tw, th);
          x.fillStyle = '#0b0e16'; x.beginPath(); x.moveTo(tx, ty + th * 0.62); for (let i = 0; i <= 20; i++) x.lineTo(tx + tw * i / 20, ty + th * (0.62 - 0.14 * Math.exp(-(((i - 11) / 4) ** 2)))); x.lineTo(tx + tw, ty + th); x.lineTo(tx, ty + th); x.fill();
          x.fillRect(tx + tw * 0.548, ty + th * 0.2, tw * 0.008, th * 0.3);
          x.fillStyle = '#ffd27a'; for (let i = 0; i < 40; i++) x.fillRect(tx + ((i * 37) % 97) / 97 * tw, ty + th * (0.66 + ((i * 13) % 7) / 30), 3, 3);
          x.fillStyle = ink; x.font = F(900, u * 0.3); x.fillText(`${inch}`, w * 0.65, h * 0.3); x.font = F(900, u * 0.075); x.fillText('범비전 4K UHD', w * 0.65, h * 0.52, w * 0.33);
          x.font = F(700, u * 0.05); x.fillText(`${inch}형 (${Math.round(inch * 2.54)}cm) · HDR`, w * 0.65, h * 0.62, w * 0.33); x.fillText('세워서 운반 · 2인 권장', w * 0.65, h * 0.7, w * 0.33);
          x.strokeStyle = '#D9442E'; x.lineWidth = u * 0.012; const gx = w * 0.06, gy = h * 0.74; x.beginPath(); x.moveTo(gx, gy - u * 0.05); x.lineTo(gx + u * 0.06, gy - u * 0.05); x.lineTo(gx + u * 0.03, gy); x.lineTo(gx + u * 0.03, gy + u * 0.04); x.stroke();
          x.fillStyle = '#D9442E'; x.font = F(800, u * 0.045); x.fillText('파손주의', gx + u * 0.09, gy - u * 0.005);
        } else {
          x.font = F(900, u * 0.11); x.fillText(p.name, w * 0.06, h * 0.13, w * 0.9);
          x.font = F(700, u * 0.06); x.fillText(p.sub, w * 0.06, h * 0.25, w * 0.9);
          x.strokeStyle = ink; x.lineWidth = u * 0.014; const cxm = w * 0.5, cym = h * 0.55, s = u * 0.2;
          if (a === 'fridge') { x.strokeRect(cxm - s, cym - s * 1.4, s * 2, s * 2.9); x.beginPath(); x.moveTo(cxm, cym - s * 1.4); x.lineTo(cxm, cym + s * 0.4); x.moveTo(cxm - s, cym + s * 0.4); x.lineTo(cxm + s, cym + s * 0.4); x.moveTo(cxm - s, cym + s * 0.95); x.lineTo(cxm + s, cym + s * 0.95); x.stroke(); }
          else if (a === 'washer') { x.strokeRect(cxm - s, cym - s * 1.1, s * 2, s * 2.3); x.beginPath(); x.arc(cxm, cym + s * 0.25, s * 0.62, 0, 7); x.stroke(); }
          else if (a === 'fryer') { x.beginPath(); x.roundRect(cxm - s * 0.8, cym - s * 0.9, s * 1.6, s * 1.8, s * 0.4); x.stroke(); x.strokeRect(cxm - s * 0.6, cym, s * 1.2, s * 0.6); }
          else if (a === 'micro') { x.strokeRect(cxm - s * 1.3, cym - s * 0.7, s * 2.6, s * 1.4); x.strokeRect(cxm - s * 1.15, cym - s * 0.55, s * 1.7, s * 1.1); x.fillStyle = '#2fd27a'; x.fillRect(cxm + s * 0.75, cym - s * 0.45, s * 0.4, s * 0.15); }
          else if (a === 'robot') { x.beginPath(); x.arc(cxm, cym, s * 0.9, 0, 7); x.stroke(); x.beginPath(); x.arc(cxm, cym - s * 0.25, s * 0.22, 0, 7); x.stroke(); }
          else if (a === 'cooker') { x.beginPath(); x.ellipse(cxm, cym, s, s * 0.7, 0, 0, 7); x.stroke(); x.fillStyle = '#D9442E'; x.fillRect(cxm - s * 0.3, cym - s * 0.1, s * 0.6, s * 0.15); }
          else if (a === 'laptop' || a === 'console') { x.strokeRect(cxm - s * 1.2, cym - s * 0.5, s * 2.4, s); x.fillStyle = '#F2C230'; x.fillRect(cxm - s * 1.0, cym - s * 0.3, s * 2.0, s * 0.6); }
          else if (a === 'headset') { x.beginPath(); x.arc(cxm, cym, s * 0.8, Math.PI, 0); x.stroke(); x.fillStyle = ink; x.fillRect(cxm - s * 0.95, cym - s * 0.1, s * 0.35, s * 0.6); x.fillRect(cxm + s * 0.6, cym - s * 0.1, s * 0.35, s * 0.6); }
        }
      };
      face(0, 0, sx, sy, front);
      face(q, q, sx, sy, front, true);
      face(q, 0, sz, sy, (x, w, h) => {
        x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = '#1E5A45'; x.fillRect(0, h * 0.84, w, h * 0.16);
        x.save(); x.translate(w / 2, h * 0.42); if (h > w * 1.6) x.rotate(-Math.PI / 2); x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
        const L = Math.max(w, h); x.font = F(900, Math.min(L * 0.08, Math.min(w, h) * 0.45)); x.fillText(p.name, 0, 0, L * 0.9); x.restore();
        x.fillStyle = '#F3EADA'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = F(800, Math.min(w, h) * 0.1); x.fillText(`${p.kg} kg`, w / 2, h * 0.92);
      });
      face(0, q, sx, sz, (x, w, h) => {
        x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = '#22262A'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = F(900, Math.min(w, h) * 0.4); x.fillText(`↑ 이 면이 위 · ${p.name} · 파손주의 ↑`, w / 2, h / 2, w * 0.96);
      });
    });
  }
  for (const id of Object.keys(ART)) {
    const p = BY_ID[id]; if (!p) continue;
    const res = (ART[id] === 'tv' || p.size[1] > 0.9) ? 1024 : 512;
    prodMat[id] = keep(new THREE.MeshLambertMaterial({ map: keep(boxArt(p)) }));
    p.geo = elecGeoFactory(p.size, res); // 카트에 담을 때 만드는 메시도 같은 UV (shapes.js 훅)
    prodGeo[id] = keep(p.geo());
  }
  function stackBoxes(id, list) {
    if (!list.length || !BY_ID[id]) return null;
    const im = new THREE.InstancedMesh(prodGeo[id], prodMat[id], list.length);
    list.forEach((it, i) => { _m.compose(_v.set(it.x, it.y, it.z), _q.setFromAxisAngle(Y3, it.rot || 0), _s); im.setMatrixAt(i, _m); });
    im.count = list.length; im.userData.pid = id; im.userData.list = list; im.computeBoundingSphere();
    root.add(im); prodMeshes.push(im);
    return im;
  }
  const pallet = (x, z, sx = 1.219, sz = 1.016) => {
    stat.box(sx, 0.025, sz, x, 0.1275, z, 0xc49a62); stat.box(sx, 0.02, sz, x, 0.01, z, 0xb08a58);
    for (const dz of [-1, 0, 1]) stat.box(sx, 0.09, 0.1, x, 0.065, z + dz * (sz / 2 - 0.05), 0xa07a48);
  };

  // ---------- 앞 섬: TV 박스 거치대 (책처럼 꽂힘, 앞면이 입구를 봄) ----------
  const cradle = (pid, xc, z0, n) => {
    const p = BY_ID[pid]; if (!p) return;
    const [sx, sy, sz] = p.size, pitch = sz + 0.02, L = n * pitch + 0.12, list = [];
    stat.box(sx + 0.16, 0.12, L, xc, 0.06, z0 + L / 2, rack);
    for (const sgn of [-1, 1]) { stat.box(0.05, 1.05, 0.05, xc + sgn * (sx / 2 + 0.06), 0.6, z0 + 0.03, rack); stat.box(0.05, 1.05, 0.05, xc + sgn * (sx / 2 + 0.06), 0.6, z0 + L - 0.03, rack); stat.box(0.04, 0.04, L, xc + sgn * (sx / 2 + 0.06), 1.1, z0 + L / 2, rack); }
    glow.box(sx + 0.16, 0.012, 0.004, xc, 0.115, z0 - 0.002, 0xf2c230);
    stat.box(sx + 0.16, 1.05, 0.02, xc, 0.645, z0 + L + 0.01, rack); // 뒤판
    for (let i = 0; i < n; i++) list.push({ x: xc, y: 0.12 + sy / 2 + 0.002, z: z0 + 0.06 + pitch * (i + 0.5), rot: Math.PI });
    ob(xc - sx / 2 - 0.12, xc + sx / 2 + 0.12, z0, z0 + L, true);
    stackBoxes(pid, list);
    tagAt(pid, xc, 1.32, z0 - 0.01, Math.PI, 1.1); stat.box(0.03, 0.22, 0.03, xc, 1.21, z0 + 0.03, post);
  };
  cradle('tv85', 66.25, 13.5, 6);
  cradle('tv75', 68.65, 13.5, 6);
  cradle('tv65', 70.8, 13.5, 7);
  cradle('tv55', 72.75, 13.5, 7);
  const palletStack = (pid, x, z, maxH) => {
    const p = BY_ID[pid]; if (!p) return [];
    const [sx, sy, sz] = p.size; pallet(x, z);
    const nA = Math.max(1, Math.floor(1.2 / sx)), nD = Math.max(1, Math.floor(1.0 / sz)), nY = Math.max(1, Math.floor(maxH / sy)), out = [];
    for (let y = 0; y < nY; y++) for (let a = 0; a < nA; a++) for (let d = 0; d < nD; d++) {
      if (y === nY - 1 && (a + d) % 3 === 0 && nA * nD > 2) continue; // 팔린 자리
      out.push({ x: x - (nA * sx) / 2 + sx * (a + 0.5), y: 0.14 + sy * (y + 0.5) + 0.001, z: z - (nD * sz) / 2 + sz * (d + 0.5), rot: Math.PI });
    }
    return out;
  };
  const frontStock = [['fryer', 75.0, 14.0], ['micro', 76.3, 14.0], ['vac', 77.6, 14.0], ['cooker', 78.9, 14.0], ['console', 80.2, 14.0], ['laptop', 75.0, 15.25], ['headset', 76.3, 15.25]];
  const stockLists = {};
  for (const [pid, x, z] of frontStock) { (stockLists[pid] ||= []).push(...palletStack(pid, x, z, (pid === 'headset' ? 0.28 : pid === 'laptop' ? 0.7 : 1.15) * (isMobile ? 0.6 : 1))); if (z < 15) { tagAt(pid === 'vac' ? 'robot' : pid, x, 1.55, z - 0.53, Math.PI, 0.8); stat.box(0.025, 1.45, 0.025, x, 0.72, z - 0.52, post); } else tagAt(pid, x + 0.62, 0.5, z, -Math.PI / 2, 0.7); }
  ob(74.35, 80.85, 13.45, 14.55); ob(74.35, 76.95, 14.7, 15.8);
  for (const [pid, list] of Object.entries(stockLists)) stackBoxes(pid, list);

  // ---------- TV 월 뒤: 냉장고 6 (+z 를 봄, 등은 벽) ----------
  const FR = DISPLAY.fridge, FZ = BACK_Z + 0.03 + FR.d / 2, fFront = FZ + FR.d / 2;
  const doorY0 = FR.h * 0.42, doorH = FR.h - doorY0 - 0.012, doorW = FR.w / 2 - 0.004, drH = (doorY0 - 0.05) / 2;
  const doorOuterGeo = (side) => { // 경첩 = 원점, side +1 이면 +x 로 뻗음. 앞 = +z. 흰 정점색 × 인스턴스 색 = 마감
    const b = new GeoBag();
    b.box(doorW, doorH, 0.05, side * doorW / 2, doorH / 2, 0.025, 0xffffff);
    b.box(doorW - 0.03, doorH - 0.03, 0.004, side * doorW / 2, doorH / 2, 0.051, 0xeef0f2); // 앞판 (살짝 다른 면 → 테두리 각)
    b.box(0.018, doorH * 0.7, 0.026, side * (doorW - 0.035), doorH * 0.5, 0.083, 0xd0d3d6); // 세로 바 손잡이
    b.box(0.016, 0.02, 0.036, side * (doorW - 0.035), doorH * 0.17, 0.066, 0xd0d3d6); b.box(0.016, 0.02, 0.036, side * (doorW - 0.035), doorH * 0.83, 0.066, 0xd0d3d6);
    return b.build();
  };
  const doorInnerGeo = (side) => { // 문 안쪽 라이너 + 도어 포켓 + 병 (흰색 고정, 발광)
    const b = new GeoBag();
    b.box(doorW * 0.88, doorH * 0.9, 0.012, side * doorW / 2, doorH / 2, -0.006, 0xf7f9fa);
    for (let k = 0; k < 4; k++) { b.box(doorW * 0.8, 0.07, 0.1, side * doorW / 2, 0.15 + k * 0.24, -0.06, 0xdfeef6); b.box(doorW * 0.8, 0.012, 0.004, side * doorW / 2, 0.175 + k * 0.24, -0.0115, 0xb8d4e2); }
    // 도어 포켓 (안쪽 = -z): 아래 1L 병 · 주스/바나나우유 팩 · 소스병 · 잼 병. 모바일은 위 두 칸을 덜어냄
    b.shade = true; const sx = (u) => side * u, zb = -0.062, Y = (k) => 0.116 + k * 0.24;
    const M = isMobile;
    if (M) { b.bottle(sx(0.11), Y(0), zb, 0.037, 0.25, 0xd4ecf5, 0x2a6fdb, null, true); b.bottle(sx(0.23), Y(0), zb, 0.037, 0.25, 0xf2a03a, 0xf2f2ef, null, true); }
    else { b.bottle(sx(0.085), Y(0), zb, 0.037, 0.25, 0xd4ecf5, 0x2a6fdb, 0x2a6fdb); b.bottle(sx(0.175), Y(0), zb, 0.037, 0.25, 0xf2a03a, 0xf2f2ef, 0x2fae5b); b.bottle(sx(0.265), Y(0), zb, 0.037, 0.25, 0xa8d46e, 0x2fae5b, 0xf6f3e6); }
    b.carton(sx(0.1), Y(1), zb, 0.068, 0.14, 0xf8f8f4, 0x3f7fd6, 0x3f7fd6); b.carton(sx(0.19), Y(1), zb, 0.068, 0.14, 0xf8f8f4, 0xe9c43a, 0xe9c43a); if (!M) b.carton(sx(0.28), Y(1), zb, 0.068, 0.14, 0xf8f8f4, 0xe2862a, 0xe2862a);
    if (!M) { b.bottle(sx(0.1), Y(2), zb, 0.026, 0.16, 0x7a2416, 0xf2f2ef); b.bottle(sx(0.19), Y(2), zb, 0.026, 0.16, 0xe0442e, 0x2fae5b); b.bottle(sx(0.28), Y(2), zb, 0.026, 0.16, 0xf3d36b, 0xd9442e);
      b.jar(sx(0.1), Y(3), zb, 0.034, 0.08, 0xb3263a, 0xf2f2ef); b.jar(sx(0.19), Y(3), zb, 0.034, 0.08, 0xe7a23a, 0x2fae5b); b.jar(sx(0.28), Y(3), zb, 0.034, 0.08, 0x6b3a1e, 0xd9442e); }
    b.shade = false;
    b.box(0.006, doorH * 0.9, 0.02, side * 0.004, doorH / 2, -0.004, 0x9aa3ad); // 가스켓
    if (side < 0) { b.box(0.13, 0.2, 0.004, side * doorW * 0.5, doorH * 0.62, 0.054, 0x0e1216); b.box(0.09, 0.03, 0.002, side * doorW * 0.5, doorH * 0.66, 0.057, 0x5fd4ff); b.box(0.09, 0.012, 0.002, side * doorW * 0.5, doorH * 0.6, 0.057, 0x2fd27a); b.box(0.02, 0.02, 0.002, side * doorW * 0.5 - 0.035, doorH * 0.555, 0.057, 0xe8ecef); b.box(0.02, 0.02, 0.002, side * doorW * 0.5 + 0.035, doorH * 0.555, 0.057, 0xe8ecef); } // 디스플레이(발광)
    return b.build();
  };
  const drawerGeoOuter = () => { const b = new GeoBag(); b.box(FR.w - 0.008, drH - 0.01, 0.05, 0, 0, 0.025, 0xffffff); b.box(FR.w * 0.6, 0.02, 0.026, 0, drH * 0.3, 0.075, 0xd0d3d6); return b.build(); };
  const drawerGeoInner = () => {
    const b = new GeoBag(), D = FR.d - 0.2;
    b.box(FR.w - 0.1, 0.012, D, 0, -drH / 2 + 0.03, -D / 2, 0xe6eef3);
    for (const sx of [-1, 1]) b.box(0.012, drH - 0.06, D, sx * (FR.w / 2 - 0.05), 0, -D / 2, 0xe6eef3);
    b.box(FR.w - 0.1, drH - 0.06, 0.012, 0, 0, -D, 0xe6eef3);
    b.shade = true; const fy = -drH / 2 + 0.036; // 서랍(신선칸): 고기·생선 트레이, 당근·양파·파프리카
    b.meat(-0.25, fy, -0.16, 0xc63f48); b.meat(0.0, fy, -0.16, 0xee9a74);
    b.ball(0.2, fy, -0.12, 0.045, 0xe8791f, 0.8); b.ball(0.28, fy, -0.2, 0.045, 0xd8a95a, 0.85); b.ball(0.2, fy, -0.27, 0.05, 0xd8342b, 0.85);
    return b.build();
  };
  const FINISH = [[0xc9ced3, 'fridge'], [0xc2c7cc, 'fridge'], [0x1b1e23, 'fridge'], [0x23272d, 'fridge'], [0xeeeeea, 'kimchi'], [0xb7c7c2, 'kimchi']]; // 스테인리스 2 · 블랙 글라스 2 · 김치냉장고 2
  const fridgeX = (i) => 67.65 + i * 1.0;
  FINISH.forEach(([fc, label], i) => {
    const x = fridgeX(i), w = FR.w, h = FR.h, d = FR.d;
    gloss.box(w, h, 0.04, x, h / 2, FZ - d / 2 + 0.02, fc);
    gloss.box(0.04, h, d, x - w / 2 + 0.02, h / 2, FZ, fc); gloss.box(0.04, h, d, x + w / 2 - 0.02, h / 2, FZ, fc);
    gloss.box(w, 0.04, d, x, h - 0.02, FZ, fc); gloss.box(w, 0.05, d, x, 0.025, FZ, fc);
    stat.box(w - 0.08, 0.03, d - 0.05, x, doorY0 - 0.01, FZ, 0xd8dde0); stat.box(w - 0.08, 0.02, d - 0.05, x, doorY0 / 2 + 0.03, FZ, 0xd8dde0);
    gloss.box(w - 0.008, drH - 0.01, 0.05, x, 0.05 + drH * 0.5, fFront - 0.025, fc); gloss.box(w * 0.6, 0.02, 0.026, x, 0.05 + drH * 0.8, fFront + 0.013, 0xd0d3d6);
    stat.box(w - 0.02, 0.05, 0.02, x, 0.025, fFront - 0.01, 0x22262a);
    const iz = FZ - d / 2 + 0.06;
    glow.box(w - 0.09, doorH - 0.05, 0.02, x, doorY0 + doorH / 2, iz, 0xeef5fa);
    glow.box(0.02, doorH - 0.05, d - 0.12, x - w / 2 + 0.05, doorY0 + doorH / 2, FZ - 0.01, 0xe1ebf2); glow.box(0.02, doorH - 0.05, d - 0.12, x + w / 2 - 0.05, doorY0 + doorH / 2, FZ - 0.01, 0xe1ebf2);
    glow.box(w - 0.09, 0.02, d - 0.12, x, doorY0 + doorH - 0.04, FZ - 0.01, 0xffffff);
    glow.box(0.25, 0.012, 0.03, x, doorY0 + doorH - 0.055, FZ + 0.2, 0xfffbe8); // 천장 LED 바
    for (let k = 0; k < 3; k++) {
      const sy = doorY0 + 0.2 + k * 0.28; gloss.box(w - 0.1, 0.01, d - 0.16, x, sy, FZ - 0.02, 0xbcd6e4);
    }
    if (label === 'kimchi') for (let j = 0; j < 3; j++) glow.box(0.24, 0.16, 0.3, x - 0.27 + j * 0.27, doorY0 + 0.1, FZ, 0xd9442e);
    S.fridges.push({ x, open: 0, want: 0, t: 0, fc });
    tgt('fridge', i, x - w / 2, 0, fFront - 0.1, x + w / 2, h, fFront + 0.2, label === 'kimchi' ? '김치냉장고 문' : '냉장고 문');
    if (i % 2 === 0) tagAt(label, x + 0.5, h + 0.18, fFront - 0.3, 0, 0.9);
  });
  { // 선반 식품 세트 1벌을 만들어 냉장고 6대에 인스턴스 (draw 1) — 양배추·반찬통·계란판·우유·요거트·병·과일 그릇
    const f = new GeoBag(), sh = (k) => doorY0 + 0.2 + k * 0.28 + 0.005;
    const L = isMobile; // 모바일: 뒷줄·쌓인 것 덜어냄
    let y = sh(0); f.ball(-0.27, y, -0.12, 0.11, 0x9fcf6e, 0.9); f.ball(-0.29, y + 0.012, -0.1, 0.095, 0xc9e6a2, 0.95); // 양배추(겉잎 · 속잎)
    const tubC = [[0xc9402e, 0x2fae5b], [0x6f9a3a, 0xf2c230], [0xe7c35a, 0x2a6fdb], [0x8a5a2e, 0xd9442e], [0xd9442e, 0x22262a], [0xf1ead8, 0x2fae5b]];
    for (let c = 0; c < 3; c++) for (let l = 0; l < (L ? 1 : 3); l++) { const [fc, lc] = tubC[(c * 2 + l) % 6]; f.tub(-0.08 + c * 0.14, y + l * 0.066, -0.15, 0.125, 0.052, 0.1, fc, lc); } // 반찬통 3줄 × 3단
    f.tub(-0.06, y, -0.02, 0.1, 0.045, 0.08, 0x9b2d22, 0xf2c230); f.tub(0.06, y, -0.02, 0.1, 0.045, 0.08, 0xe4d08a, 0x2a6fdb); if (!L) f.tub(0.3, y, -0.03, 0.1, 0.07, 0.1, 0xf4f1e8, 0x22262a); // 앞줄 작은 통 · 두부
    y = sh(1); f.eggs(-0.22, y, -0.03, L ? 4 : 6, 2); // 계란 12구 (모바일 8구)
    for (let c = 0; c < (L ? 2 : 3); c++) f.carton(-0.03 + c * 0.085, y, -0.16, 0.075, 0.19, 0xfafaf7, [0x3f7fd6, 0xd9442e, 0x2fae5b][c], [0x3f7fd6, 0xd9442e, 0x2fae5b][c]); // 우유·저지방·두유
    for (let r = 0; r < (L ? 1 : 2); r++) for (let c = 0; c < 4; c++) f.cup(0.23 + (c % 2) * 0.065, y + (c > 1 ? 0.062 : 0), -0.02 - r * 0.075, 0.03, 0.06, [0xf6f1ea, 0xf2b8c6, 0xf7e08a, 0xd6c3ef][(c + r) % 4], 0xd7dadd); // 요거트 2×2 묶음 (2단)
    y = sh(2); f.bottle(-0.33, y, -0.14, 0.034, 0.2, 0xd4ecf5, 0x2a6fdb, 0x2a6fdb, L); f.bottle(-0.255, y, -0.14, 0.034, 0.2, 0xf2a03a, 0xf2f2ef, 0x2fae5b, L); if (!L) f.bottle(-0.18, y, -0.14, 0.034, 0.2, 0xe9e2c8, 0x7a4b12, 0x7a4b12);
    f.cy(0.11, 0.065, 0.055, 8, 0.04, y, -0.08, 0xf0f3f5); // 과일 그릇 + 사과·오렌지·배·귤·포도
    f.ball(0.0, y + 0.035, -0.1, 0.038, 0xd8342b); f.ball(0.08, y + 0.035, -0.08, 0.038, 0xf39a1e); f.ball(0.04, y + 0.05, -0.04, 0.036, 0xd9cf6a); if (!L) f.ball(0.04, y + 0.06, -0.12, 0.035, 0xc22c2a);
    f.jar(0.22, y, -0.12, 0.036, 0.09, 0xb3263a, 0xf2f2ef); f.jar(0.3, y, -0.12, 0.036, 0.09, 0xe7a23a, 0x2fae5b); if (!L) f.tub(0.26, y, -0.02, 0.12, 0.05, 0.08, 0xf7f1e2, 0xd9442e);
    const foodGeo = keep(f.build()), foodMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2c2e }));
    const food = new THREE.InstancedMesh(foodGeo, foodMat, FINISH.length);
    FINISH.forEach((_, i) => { _m.makeTranslation(fridgeX(i), 0, FZ); food.setMatrixAt(i, _m); });
    food.computeBoundingSphere(); root.add(food);
  }
  ob(fridgeX(0) - FR.w / 2, fridgeX(5) + FR.w / 2, BACK_Z, fFront + 0.08);
  const nF = FINISH.length;
  const doorMat = keep(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x6a6e72 }));
  const innerMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const mkInst = (geo, mat, n) => { const im = new THREE.InstancedMesh(keep(geo), mat, n); im.frustumCulled = false; root.add(im); return im; };
  const dROut = mkInst(doorOuterGeo(1), doorMat, nF), dLOut = mkInst(doorOuterGeo(-1), doorMat, nF);
  const dRIn = mkInst(doorInnerGeo(1), innerMat, nF), dLIn = mkInst(doorInnerGeo(-1), innerMat, nF);
  const drOut = mkInst(drawerGeoOuter(), doorMat, nF), drIn = mkInst(drawerGeoInner(), innerMat, nF);
  S.fridges.forEach((f, i) => { col.set(f.fc); dROut.setColorAt(i, col); dLOut.setColorAt(i, col); drOut.setColorAt(i, col); });
  const spillTex = keep(canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 20, 4, 64, 40, 90); r.addColorStop(0, 'rgba(220,240,255,1)'); r.addColorStop(1, 'rgba(220,240,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));
  const spillG = new THREE.PlaneGeometry(1.2, 1.4); spillG.rotateX(-Math.PI / 2);
  const spill = mkInst(spillG, keep(new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })), nF); spill.renderOrder = 2;
  const spillScale = new THREE.Vector3();
  const setDoors = () => {
    S.fridges.forEach((f, i) => {
      const s = 0.5 - 0.5 * Math.cos(Math.PI * f.open), ang = 1.95 * s;
      _m.compose(_v.set(f.x - FR.w / 2 + 0.002, doorY0 + 0.006, fFront), _q.setFromAxisAngle(Y3, -ang), _s); dROut.setMatrixAt(i, _m); dRIn.setMatrixAt(i, _m);
      _m.compose(_v.set(f.x + FR.w / 2 - 0.002, doorY0 + 0.006, fFront), _q.setFromAxisAngle(Y3, ang), _s); dLOut.setMatrixAt(i, _m); dLIn.setMatrixAt(i, _m);
      _m.compose(_v.set(f.x, 0.05 + drH * 1.5 + 0.004, fFront + 0.36 * s), _q.identity(), _s); drOut.setMatrixAt(i, _m); drIn.setMatrixAt(i, _m);
      _m.compose(_v.set(f.x, 0.014, fFront + 0.7), _q.identity(), spillScale.setScalar(Math.max(0.001, s))); spill.setMatrixAt(i, _m);
    });
    for (const im of [dROut, dLOut, dRIn, dLIn, drOut, drIn, spill]) im.instanceMatrix.needsUpdate = true;
  };
  setDoors();

  // ---------- 드럼세탁기 3 · 건조기 3 (+z 를 봄) ----------
  const WA = DISPLAY.washer, WZ = BACK_Z + 0.03 + WA.d / 2, wFront = WZ + WA.d / 2, drumR = 0.215, drumY = 0.5;
  const washX = (i) => 73.75 + i * 0.76;
  const drumG = new GeoBag();
  drumG.add(new THREE.CircleGeometry(drumR, 24), 0x8f969d);
  for (let k = 0; k < 3; k++) drumG.box(0.04, drumR * 0.7, 0.03, Math.cos(k * 2.094) * drumR * 0.6, Math.sin(k * 2.094) * drumR * 0.6, 0.012, 0xc9cfd5, 0, 0, k * 2.094 + Math.PI / 2);
  for (let k = 0; k < 6; k++) { const a = k * 1.3 + 0.4, r = drumR * (0.25 + (k % 3) * 0.2); drumG.add(new THREE.CircleGeometry(0.06 + (k % 2) * 0.03, 8), [0xd9442e, 0x2a6fdb, 0xf2c230, 0xffffff, 0x2fbf71, 0x9b59b6][k], mat4(Math.cos(a) * r, Math.sin(a) * r, 0.02)); }
  const drums = mkInst(drumG.build(), keep(new THREE.MeshLambertMaterial({ vertexColors: true })), 6);
  const wGlass = mkInst(new THREE.CircleGeometry(drumR + 0.03, 28), keep(new THREE.MeshPhongMaterial({ color: 0x1a2630, transparent: true, opacity: 0.42, depthWrite: false, shininess: 120, specular: 0x999999 })), 6); wGlass.renderOrder = 3;
  for (let i = 0; i < 6; i++) {
    const x = washX(i), dryer = i >= 3, w = WA.w, h = WA.h, d = WA.d, bc = dryer ? 0x2a2e34 : white, hole = 0.24;
    stat.box(w, h, d - 0.205, x, h / 2, WZ - 0.1025, bc);
    for (const sx of [-1, 1]) gloss.box(0.02, h, 0.205, x + sx * (w / 2 - 0.01), h / 2, wFront - 0.1025, bc);
    gloss.box(w, 0.02, 0.205, x, h - 0.01, wFront - 0.1025, bc); gloss.box(w, 0.02, 0.205, x, 0.01, wFront - 0.1025, bc);
    gloss.box(w, h - (drumY + hole), 0.02, x, (h + drumY + hole) / 2, wFront - 0.01, bc); gloss.box(w, drumY - hole, 0.02, x, (drumY - hole) / 2, wFront - 0.01, bc);
    gloss.box(w / 2 - hole, hole * 2, 0.02, x - (w / 2 + hole) / 2, drumY, wFront - 0.01, bc); gloss.box(w / 2 - hole, hole * 2, 0.02, x + (w / 2 + hole) / 2, drumY, wFront - 0.01, bc);
    stat.add(new THREE.RingGeometry(drumR + 0.008, 0.345, 32), dryer ? 0x30353c : 0xe4e6e8, mat4(x, drumY, wFront + 0.001));
    gloss.box(w, 0.16, 0.012, x, h - 0.09, wFront + 0.006, dryer ? 0x16191d : 0x30353c);
    glow.box(0.16, 0.05, 0.004, x + 0.12, h - 0.09, wFront + 0.014, dryer ? 0xffb34d : 0x5fd4ff);
    for (let k = 0; k < 4; k++) glow.box(0.018, 0.018, 0.004, x - 0.05 + k * 0.035, h - 0.13, wFront + 0.014, 0xe8ecef);
    gloss.cyl(0.035, 0.035, 0.03, 16, x - 0.2, h - 0.09, wFront + 0.02, 0xc9ced3, Math.PI / 2);
    gloss.torus(drumR + 0.045, 0.03, x, drumY, wFront + 0.02, 0xaeb5bc);
    gloss.box(0.03, 0.12, 0.03, x + drumR + 0.06, drumY, wFront + 0.04, 0xaeb5bc);
    stat.add(insideTube(drumR + 0.01, 0.2, 20), 0x6d747b, mat4(x, drumY, wFront - 0.1, Math.PI / 2, 0, 0)); stat.disc(drumR + 0.01, 20, x, drumY, wFront - 0.199, 0x50565c);
    stat.box(w, 0.04, 0.04, x, 0.02, wFront - 0.02, 0x22262a);
    _m.compose(_v.set(x, drumY, wFront - 0.17), _q.identity(), _s); drums.setMatrixAt(i, _m);
    _m.compose(_v.set(x, drumY, wFront + 0.035), _q.identity(), _s); wGlass.setMatrixAt(i, _m);
    S.washers.push({ x, ang: 0, w: 0, t: 0, dryer, on: false });
    tgt(dryer ? 'dryer' : 'washer', i, x - w / 2, 0, wFront - 0.1, x + w / 2, h, wFront + 0.2, dryer ? '건조기' : '드럼세탁기');
  }
  tagAt('washer', washX(1), WA.h + 0.15, wFront - 0.2, 0, 0.9); tagAt('dryer', washX(4), WA.h + 0.15, wFront - 0.2, 0, 0.9);
  ob(washX(0) - WA.w / 2, washX(5) + WA.w / 2, BACK_Z, wFront + 0.06);
  const bigList = { fridge: [], washer: [], dryer: [] };
  [['fridge', 78.95], ['washer', 80.15], ['dryer', 81.3]].forEach(([id, x]) => {
    const p = BY_ID[id]; if (!p) return;
    pallet(x, 30.75, 1.1, 1.1); bigList[id].push({ x, y: 0.14 + p.size[1] / 2 + 0.001, z: 30.75, rot: 0 });
  });
  ob(78.4, 81.85, 30.2, 31.3);
  for (const [id, list] of Object.entries(bigList)) stackBoxes(id, list);

  // ---------- 체험 테이블 (z 34.6, -z 를 봄): 노트북·태블릿 / 모니터 / 주방 소형가전 ----------
  const TZ = 34.6, TD = 0.8, TH = 0.82, tFront = TZ - TD / 2;
  const table = (x0, x1) => {
    gloss.box(x1 - x0, 0.04, TD, (x0 + x1) / 2, TH, TZ, 0xf7f7f5); stat.box(x1 - x0 - 0.04, TH - 0.04, TD - 0.06, (x0 + x1) / 2, (TH - 0.04) / 2, TZ, green);
    stat.box(x1 - x0 - 0.04, 0.06, 0.006, (x0 + x1) / 2, TH - 0.08, tFront + 0.028, 0xc8965a); ob(x0, x1, TZ - TD / 2, TZ + TD / 2);
  };
  table(65.0, 70.4); table(71.0, 75.2); table(75.8, 81.6);
  const silver = 0xaab2ba;
  for (let i = 0; i < 4; i++) { // 노트북: 본체 18 mm · 덮개 12 mm, 107° 열림
    const x = 65.5 + i * 0.68, { w, d } = DISPLAY.laptop, bz = TZ - 0.08, c = [silver, 0x30353c, silver, 0x8e9aa6][i];
    gloss.box(w, 0.018, d, x, TH + 0.029, bz, c);
    stat.box(w * 0.88, 0.002, d * 0.42, x, TH + 0.039, bz + 0.03, 0x1e2126);
    stat.box(w * 0.3, 0.002, d * 0.22, x, TH + 0.039, bz - 0.08, 0x7e868e);
    const beta = 0.3, hz = bz + d / 2, hy = TH + 0.038, cyy = hy + Math.cos(beta) * d / 2, czz = hz + Math.sin(beta) * d / 2, nn = 0.0065;
    gloss.add(new THREE.BoxGeometry(w, d, 0.012), c, mat4(x, cyy, czz, beta, 0, 0));
    scr.push({ x, y: cyy + Math.sin(beta) * nn, z: czz - Math.cos(beta) * nn, w: w * 0.92, h: d * 0.86, ry: Math.PI, rx: -beta, mode: 1 + (i % 3) });
  }
  tagAt('laptop', 66.5, TH - 0.2, tFront - 0.005, Math.PI, 0.7);
  for (let i = 0; i < 3; i++) { // 태블릿 (스탠드에 뒤로 18° 기울임)
    const x = 68.4 + i * 0.6, { w, h } = DISPLAY.tablet, tilt = 0.32, tz = TZ - 0.05, ty = TH + 0.045 + (h / 2) * Math.cos(tilt);
    gloss.box(0.12, 0.012, 0.14, x, TH + 0.026, tz + 0.02, post); gloss.box(0.03, 0.12, 0.02, x, TH + 0.08, tz + 0.06, post, 0, 0.32);
    gloss.box(0.16, 0.02, 0.03, x, TH + 0.04, tz - Math.sin(tilt) * h / 2, post);
    gloss.add(new THREE.BoxGeometry(w + 0.012, h + 0.012, 0.008), 0x30353c, mat4(x, ty, tz, tilt, 0, 0));
    scr.push({ x, y: ty + Math.sin(tilt) * 0.0046, z: tz - Math.cos(tilt) * 0.0046, w, h, ry: Math.PI, rx: -tilt, mode: 1 + ((i + 1) % 3) });
  }
  tagAt('tablet', 69.0, TH - 0.2, tFront - 0.005, Math.PI, 0.7);
  for (let i = 0; i < 4; i++) { // 게이밍 모니터
    const x = 71.55 + i * 1.03, { w, h } = DISPLAY.monitor;
    gloss.box(0.26, 0.012, 0.2, x, TH + 0.026, TZ, 0x22262a); gloss.box(0.04, 0.32, 0.03, x, TH + 0.18, TZ + 0.06, 0x22262a);
    gloss.box(w + 0.02, h + 0.02, 0.03, x, TH + 0.42, TZ + 0.03, dark);
    glow.box(w * 0.7, 0.008, 0.004, x, TH + 0.42 - h / 2 - 0.006, TZ + 0.012, [0xff2bd6, 0x2bd9ff, 0x7aff2b, 0xffb02b][i]);
    scr.push({ x, y: TH + 0.42, z: TZ + 0.014, w, h, ry: Math.PI, mode: 1 + (i % 3) });
  }
  tagAt('monitor', 73.1, TH - 0.2, tFront - 0.005, Math.PI, 0.7);
  const fryCol = [[0xf2f3f1, 0x30353c], [0x2b2f35, 0x1a1d22], [0xb8d8cf, 0xf2f3f1]];
  for (let i = 0; i < 3; i++) { // 에어프라이어 — 둥근 몸통 + 앞 바스켓 서랍 + 위 디스플레이
    const x = 76.25 + i * 0.5, { r, h } = DISPLAY.fryer, [b1, b2] = fryCol[i], z = TZ, y0 = TH + 0.02;
    gloss.cyl(r * 0.92, r, h * 0.9, 18, x, y0 + h * 0.45, z, b1); gloss.cyl(r * 0.8, r * 0.92, h * 0.1, 18, x, y0 + h * 0.95, z, b1);
    gloss.box(r * 1.35, h * 0.42, 0.05, x, y0 + h * 0.27, z - r + 0.012, b2);
    gloss.box(0.05, 0.035, 0.09, x, y0 + h * 0.33, z - r - 0.05, b2); gloss.box(0.05, 0.08, 0.03, x, y0 + h * 0.29, z - r - 0.08, b2);
    gloss.box(r * 1.1, 0.06, 0.012, x, y0 + h * 0.72, z - r * 0.88, 0x101317, 0, -0.35);
    glow.box(0.07, 0.025, 0.004, x, y0 + h * 0.725, z - r * 0.9 - 0.01, 0xff7a2b, 0, -0.35);
    stat.cyl(r * 0.7, r * 0.7, 0.005, 16, x, y0 + h + 0.002, z + 0.02, 0x9aa3ad);
  }
  tagAt('fryer', 76.75, TH - 0.2, tFront - 0.005, Math.PI, 0.7);
  for (let i = 0; i < 2; i++) { // 전자레인지 — 은색/흰색 몸, 블랙 글라스 문 + 비치는 안 + 조작부
    const { w, h, d } = DISPLAY.micro, x = 78.2 + i * 0.58, z = TZ + 0.05, y = TH + 0.02 + h / 2, fz = z - d / 2, bc = i ? 0xf2f3f1 : 0xc9ced3;
    gloss.box(w, h, d, x, y, z, bc);
    gloss.box(w * 0.7, h * 0.86, 0.008, x - w * 0.13, y, fz - 0.004, 0x0f1216);
    glow.box(w * 0.42, h * 0.5, 0.002, x - w * 0.17, y, fz - 0.009, 0x3b2c18);
    glow.add(new THREE.CircleGeometry(0.075, 16), 0x7a6a50, mat4(x - w * 0.17, y - h * 0.16, fz - 0.011, 0, 0, 0, 1, 0.3, 1));
    gloss.box(0.014, h * 0.62, 0.03, x + w * 0.2, y, fz - 0.02, 0xd6d9dc);
    stat.box(w * 0.22, h * 0.86, 0.006, x + w * 0.36, y, fz - 0.003, 0x30353c);
    glow.box(w * 0.15, 0.03, 0.002, x + w * 0.36, y + h * 0.3, fz - 0.007, 0x4dff88);
    for (let k = 0; k < 6; k++) glow.box(0.018, 0.012, 0.002, x + w * 0.32 + (k % 2) * 0.04, y + h * 0.1 - ((k / 2) | 0) * 0.03, fz - 0.007, 0xc9ced3);
  }
  tagAt('micro', 78.5, TH - 0.2, tFront - 0.005, Math.PI, 0.7);
  for (let i = 0; i < 2; i++) { // 밥솥
    const x = 79.75 + i * 0.4, z = TZ, y0 = TH + 0.02, r = 0.13, bc = i ? 0xf2f3f1 : 0x30353c;
    gloss.cyl(r, r * 0.95, 0.17, 22, x, y0 + 0.085, z, bc);
    gloss.add(new THREE.SphereGeometry(r * 0.98, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), bc, mat4(x, y0 + 0.17, z, 0, 0, 0, 1, 0.42, 1));
    gloss.box(0.09, 0.04, 0.05, x, y0 + 0.2, z - r * 0.75, 0xc9ced3); glow.box(0.05, 0.022, 0.004, x, y0 + 0.13, z - r - 0.002, i ? 0xd9442e : 0x5fd4ff);
  }
  tagAt('cooker', 80.0, TH - 0.2, tFront - 0.005, Math.PI, 0.7);

  // ---------- 고가 케이지 + 구매 카드 (x 70.2–74.6, z 37.2–40.3, 카운터는 -z 통로 쪽) ----------
  const CX = 72.4, CZ = 38.75, CW = 4.4, CD = 3.1, CH = 2.4, mesh = 0x4a5a6a;
  stat.box(CW, 0.08, CD, CX, 0.04, CZ, mesh);
  for (let i = 0; i <= 18; i++) { const x = CX - CW / 2 + (CW * i) / 18; stat.box(0.02, CH, 0.02, x, CH / 2, CZ + CD / 2, mesh); stat.box(0.02, 0.85, 0.02, x, 1.975, CZ - CD / 2, mesh); }
  for (let i = 0; i <= 12; i++) { const z = CZ - CD / 2 + (CD * i) / 12; stat.box(0.02, CH, 0.02, CX - CW / 2, CH / 2, z, mesh); stat.box(0.02, CH, 0.02, CX + CW / 2, CH / 2, z, mesh); }
  for (const y of [0.08, 1.15, CH]) { stat.box(CW, 0.04, 0.04, CX, y, CZ - CD / 2, mesh); stat.box(CW, 0.04, 0.04, CX, y, CZ + CD / 2, mesh); stat.box(0.04, 0.04, CD, CX - CW / 2, y, CZ, mesh); stat.box(0.04, 0.04, CD, CX + CW / 2, y, CZ, mesh); }
  stat.box(CW - 0.1, 1.15, 0.35, CX, 0.575, CZ - CD / 2 + 0.05, 0x3a4652); gloss.box(CW - 0.05, 0.03, 0.42, CX, 1.16, CZ - CD / 2 + 0.05, 0xe8ebee);
  quad('cage', 2.6, 0.65, CX, 2.05, CZ - CD / 2 - 0.03, Math.PI);
  ob(CX - CW / 2, CX + CW / 2, CZ - CD / 2, CZ + CD / 2);
  gloss.box(1.8, 0.04, 0.6, CX, 1.1, CZ + 0.6, 0xf7f7f5); stat.box(1.76, 1.06, 0.56, CX, 0.55, CZ + 0.6, green);
  gloss.box(0.104, 0.39, 0.26, CX + 0.4, 1.12 + 0.195, CZ + 0.6, 0x1a1d22); glow.box(0.004, 0.28, 0.02, CX + 0.4 - 0.054, 1.12 + 0.2, CZ + 0.6, 0x5fd4ff);
  gloss.box(0.104, 0.39, 0.26, CX + 0.7, 1.12 + 0.195, CZ + 0.6, 0xf2f3f1);
  { const { w, d } = DISPLAY.laptop, x = CX - 0.4, bz = CZ + 0.55, b = 0.3, cyy = 1.138 + Math.cos(b) * d / 2, czz = bz + d / 2 + Math.sin(b) * d / 2; gloss.box(w, 0.018, d, x, 1.129, bz, silver); gloss.add(new THREE.BoxGeometry(w, d, 0.012), silver, mat4(x, cyy, czz, b, 0, 0)); scr.push({ x, y: cyy + Math.sin(b) * 0.0065, z: czz - Math.cos(b) * 0.0065, w: w * 0.92, h: d * 0.86, ry: Math.PI, rx: -b, mode: 2 }); }
  const ticketTex = {};
  function ticketMat(p) {
    if (ticketTex[p.id]) return ticketTex[p.id];
    const t = keep(canvasTex(512, 768, (g) => {
      g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 512, 768); g.fillStyle = '#F3EADA'; g.fillRect(16, 16, 480, 736);
      g.fillStyle = '#1E5A45'; g.fillRect(16, 16, 480, 90);
      g.fillStyle = '#F2C230'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 48); g.fillText('구매 카드', 256, 62);
      g.fillStyle = '#123B2D'; g.font = F(900, 44); g.fillText(p.name.replace('구매 카드 ', ''), 256, 200); g.font = F(700, 28); g.fillText('범창고 정자점', 256, 260);
      g.fillStyle = '#D9442E'; g.font = F(900, 52); g.fillText(p.price.toLocaleString('ko-KR') + '원', 256, 360);
      g.fillStyle = '#22262A'; g.font = F(700, 24); g.fillText('이 카드를 계산대에 주세요', 256, 430); g.fillText('본품은 직원이 찾아 드립니다', 256, 470);
      for (let i = 0; i < 28; i++) g.fillRect(80 + i * 12, 540, (i * 5) % 4 + 2, 90);
      g.font = F(600, 20); g.fillText('TICKET  ·  BUMP DEPOT', 256, 690);
    }));
    ticketTex[p.id] = keep(new THREE.MeshLambertMaterial({ map: t }));
    return ticketTex[p.id];
  }
  ['ticket_tv85', 'ticket_laptop', 'ticket_console'].forEach((id, i) => {
    const p = BY_ID[id]; if (!p) return;
    const list = [];
    for (let k = 0; k < 3; k++) list.push({ x: CX - 0.9 + i * 0.9 + k * 0.13, y: 1.175 + p.size[1] / 2, z: CZ - CD / 2 - 0.02, rot: Math.PI / 2 });
    const im = new THREE.InstancedMesh(prodGeo[id], ticketMat(p), list.length);
    list.forEach((it, n) => { _m.compose(_v.set(it.x, it.y, it.z), _q.setFromAxisAngle(Y3, it.rot), _s); im.setMatrixAt(n, _m); });
    im.count = list.length; im.userData.pid = id; im.userData.list = list; im.computeBoundingSphere();
    root.add(im); prodMeshes.push(im);
  });

  // ---------- 로봇청소기 시연장 (x 76.2–83.3, z 37.2–40.3) ----------
  const PEN = { x0: 76.2, x1: 83.3, z0: 37.2, z1: 40.3 };
  for (const [x0, z0, x1, z1] of [[PEN.x0, PEN.z0, PEN.x1, PEN.z0], [PEN.x0, PEN.z1, PEN.x1, PEN.z1], [PEN.x0, PEN.z0, PEN.x0, PEN.z1], [PEN.x1, PEN.z0, PEN.x1, PEN.z1]]) {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = x1 === x0 ? Math.PI / 2 : 0;
    stat.box(L, 0.08, 0.04, (x0 + x1) / 2, 0.28, (z0 + z1) / 2, green, ry); stat.box(L, 0.18, 0.02, (x0 + x1) / 2, 0.12, (z0 + z1) / 2, cream, ry);
  }
  stat.box(PEN.x1 - PEN.x0, 0.006, PEN.z1 - PEN.z0, (PEN.x0 + PEN.x1) / 2, 0.003, (PEN.z0 + PEN.z1) / 2, 0x8a6a45);
  for (let k = 0; k < 5; k++) stat.box(PEN.x1 - PEN.x0 - 0.02, 0.0075, 0.012, (PEN.x0 + PEN.x1) / 2, 0.003, PEN.z0 + 0.55 + k * 0.55, 0x6e5235);
  stat.box(1.6, 0.0075, 1.0, PEN.x0 + 1.3, 0.004, PEN.z0 + 1.6, 0xd9cbb6);
  stat.box(0.42, 0.45, 0.35, PEN.x1 - 0.35, 0.225, PEN.z1 - 0.3, 0x22262a); glow.box(0.08, 0.02, 0.004, PEN.x1 - 0.35, 0.36, PEN.z1 - 0.476, 0x2fd27a);
  quad('robotSign', 1.0, 0.5, (PEN.x0 + PEN.x1) / 2, 0.62, PEN.z0 - 0.03, Math.PI); stat.box(0.03, 0.4, 0.03, (PEN.x0 + PEN.x1) / 2 - 0.45, 0.3, PEN.z0, post); stat.box(0.03, 0.4, 0.03, (PEN.x0 + PEN.x1) / 2 + 0.45, 0.3, PEN.z0, post);
  tagAt('robot', PEN.x0 + 0.9, 0.62, PEN.z0 - 0.03, Math.PI, 0.9);
  ob(PEN.x0 - 0.05, PEN.x1 + 0.05, PEN.z0 - 0.05, PEN.z1 + 0.05);
  const rb = new GeoBag(), RR = DISPLAY.robot.r, RH = DISPLAY.robot.h;
  rb.cyl(RR, RR, RH * 0.8, 28, 0, RH * 0.4, 0, 0xf2f3f1); rb.cyl(RR + 0.004, RR + 0.004, RH * 0.35, 28, 0, RH * 0.32, 0, 0x2b2f35);
  rb.cyl(0.05, 0.05, 0.03, 16, 0, RH * 0.8 + 0.015, -0.04, 0x22262a);
  rb.box(0.12, 0.004, 0.012, 0, RH * 0.8 + 0.002, 0.07, 0x1e5a45); rb.box(0.06, 0.004, 0.02, 0, RH * 0.8 + 0.002, 0.11, 0x2fd27a);
  rb.box(0.006, 0.006, 0.09, -RR * 0.7, 0.008, RR * 0.7, 0x1c1f24, 0.6); rb.box(0.006, 0.006, 0.09, RR * 0.7, 0.008, RR * 0.7, 0x1c1f24, -0.6);
  const robots = mkInst(rb.build(), keep(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60 })), 2);
  S.robots = [{ x: 78.0, z: 38.6, yaw: 0.6, v: 0.3, turn: 0, back: 0 }, { x: 81.0, z: 39.4, yaw: 2.6, v: 0.3, turn: 0, back: 0 }];
  tgt('robot', 0, PEN.x0, 0, PEN.z0, PEN.x1, 0.45, PEN.z1, '범봇');
  function robotsTick(dt) {
    S.robots.forEach((r, i) => {
      if (r.back > 0) { r.back -= dt; r.x -= Math.sin(r.yaw) * 0.12 * dt; r.z -= Math.cos(r.yaw) * 0.12 * dt; if (r.back <= 0) r.turn = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.6); }
      else if (Math.abs(r.turn) > 0.01) { const s = Math.sign(r.turn) * Math.min(Math.abs(r.turn), 1.8 * dt); r.yaw += s; r.turn -= s; }
      else {
        const nx = r.x + Math.sin(r.yaw) * r.v * dt, nz = r.z + Math.cos(r.yaw) * r.v * dt, m = RR + 0.03;
        const o = S.robots[1 - i], hitOther = Math.hypot(nx - o.x, nz - o.z) < RR * 2 + 0.02;
        if (nx < PEN.x0 + m || nx > PEN.x1 - m || nz < PEN.z0 + m || nz > PEN.z1 - m || hitOther || (nx > PEN.x1 - 0.6 && nz > PEN.z1 - 0.55)) r.back = 0.35;
        else { r.x = nx; r.z = nz; r.yaw += Math.sin(S.t * 0.7 + i * 2) * 0.12 * dt; }
      }
      _m.compose(_v.set(r.x, 0.004, r.z), _q.setFromAxisAngle(Y3, r.yaw), _s); robots.setMatrixAt(i, _m);
    });
    robots.instanceMatrix.needsUpdate = true;
  }
  robotsTick(0);

  // ---------- 안마의자 2 (x 64.9–67.2, -z 를 봄) ----------
  const MZ = 38.8;
  const RB = (w, h, d, r = 0.05) => isMobile ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.05, h / 2.05, d / 2.05)); // 모바일은 각진 상자(폴리곤 절약)
  for (let i = 0; i < 2; i++) {
    // 셸(유광 하드커버) + 쿠션(가죽) + 다리 마사지부 — 실제 안마의자처럼 둥근 덩어리, 등받이 뒤로 젖힘
    const x = 65.4 + i * 1.3, shell = i ? 0x26282c : 0xf3f0ea, cush = i ? 0x6b4632 : 0xd8c4a6, dk = i ? 0x141517 : 0x8f8676;
    const C = new THREE.Matrix4().makeTranslation(x, 0, MZ);
    const put = (bag, g, col, m) => bag.add(g, col, new THREE.Matrix4().multiplyMatrices(C, m));
    const backF = new THREE.Matrix4().multiplyMatrices(mat4(0, 0.5, 0.3), mat4(0, 0, 0, 0.3)); // 등받이 프레임 (뒤로 0.3rad)
    const inBack = (lx, ly, lz, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().multiplyMatrices(backF, mat4(lx, ly, lz, rx, ry, rz));
    const legF = new THREE.Matrix4().multiplyMatrices(mat4(0, 0.5, -0.33), mat4(0, 0, 0, 0.42)); // 다리부 (앞으로 뻗음)
    const inLeg = (lx, ly, lz) => new THREE.Matrix4().multiplyMatrices(legF, mat4(lx, ly, lz));
    put(stat, RB(0.64, 0.2, 0.78, 0.06), dk, mat4(0, 0.1, 0.02));
    put(gloss, RB(0.5, 0.15, 0.62, 0.06), cush, mat4(0, 0.47, -0.03));
    for (const sg of [-1, 1]) {
      put(gloss, RB(0.16, 0.46, 0.9, 0.07), shell, mat4(sg * 0.33, 0.55, 0.0));
      put(gloss, RB(0.13, 0.06, 0.66, 0.03), cush, mat4(sg * 0.33, 0.8, -0.04));
      put(glow, new THREE.BoxGeometry(0.004, 0.025, 0.6), i ? 0xffb347 : 0x5fd4ff, mat4(sg * 0.412, 0.55, 0.0));
      put(gloss, RB(0.1, 0.36, 0.26, 0.04), shell, inBack(sg * 0.28, 0.98, 0.02)); // 머리 날개
    }
    put(gloss, RB(0.66, 1.12, 0.22, 0.09), shell, inBack(0, 0.56, 0.12));
    put(gloss, RB(0.46, 0.92, 0.1, 0.05), cush, inBack(0, 0.5, -0.03));
    for (let k = 0; k < 4; k++) put(stat, new THREE.BoxGeometry(0.4, 0.012, 0.012), dk, inBack(0, 0.18 + k * 0.2, -0.082)); // 쿠션 퀼팅 홈
    put(gloss, new THREE.CapsuleGeometry(0.075, 0.26, 2, 8), cush, inBack(0, 1.02, -0.06, 0, 0, Math.PI / 2)); // 목베개
    put(gloss, RB(0.5, 0.5, 0.22, 0.07), shell, inLeg(0, -0.25, 0));
    for (const sg of [-1, 1]) put(stat, RB(0.17, 0.4, 0.06, 0.03), cush, inLeg(sg * 0.11, -0.24, -0.1)); // 발 홈 2개
    put(gloss, RB(0.07, 0.03, 0.16, 0.012), 0x1c1e21, mat4(0.33, 0.845, -0.25)); // 리모컨
    put(glow, new THREE.BoxGeometry(0.05, 0.004, 0.08), 0x5fd4ff, mat4(0.33, 0.862, -0.25));
    tgt('chair', i, x - 0.45, 0, MZ - 0.7, x + 0.45, 1.5, MZ + 0.6, '안마의자');
  }
  ob(64.9, 67.15, MZ - 0.65, MZ + 0.62);
  tagAt('chair', 66.05, 1.1, MZ - 0.72, Math.PI, 0.8); stat.box(0.03, 1.0, 0.03, 66.05, 0.5, MZ - 0.7, post);

  // ---------- 화면 InstancedMesh (draw 1) + 베젤 InstancedMesh (크기별 스케일, draw 1) ----------
  const logoTex = keep(canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(10,14,20,.78)'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 40); g.fill();
    g.strokeStyle = '#F2C230'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(900, 108); g.fillText('BUMPVISION', w / 2, 108);
    g.fillStyle = '#F2C230'; g.font = F(800, 46); g.fillText('범비전 · 4K HDR · 120Hz', w / 2, 196);
  }, false));
  const scrGeo = keep(new THREE.PlaneGeometry(1, 1));
  const rect = new Float32Array(scr.length * 4), mode = new Float32Array(scr.length);
  scr.forEach((s, i) => { rect.set(s.rect || [0, 0, 1, 1], i * 4); mode[i] = s.mode; });
  scrGeo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4)); scrGeo.setAttribute('aMode', new THREE.InstancedBufferAttribute(mode, 1));
  const scrU = { uTime: { value: 0 }, uChan: { value: 0 }, uNext: { value: 1 }, uMix: { value: 0 }, uSpan: { value: 1 }, uLogoA: { value: 0 }, uLod: { value: 0 }, uWallAspect: { value: WW / WH }, uBright: { value: 1.12 }, uFlick: { value: 0 }, uAvg: { value: new THREE.Vector3(...CH_AVG[0]) }, uLogo: { value: logoTex } };
  const scrM = keep(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, scrU]), vertexShader: SCREEN_VS, fragmentShader: SCREEN_FS, fog: true, defines: isMobile ? { CHEAP: 1 } : {} }));
  scrM.uniforms.uLogo.value = logoTex; scrM.uniforms.uAvg.value = scrU.uAvg.value;
  const screens = new THREE.InstancedMesh(scrGeo, scrM, scr.length);
  scr.forEach((s, i) => { _m.compose(_v.set(s.x, s.y, s.z), _q.setFromEuler(_e.set(s.rx || 0, s.ry || 0, 0, 'YXZ')), new THREE.Vector3(s.w, s.h, 1)); screens.setMatrixAt(i, _m); });
  screens.computeBoundingSphere(); root.add(screens);
  const bezels = mkInst(new THREE.BoxGeometry(1, 1, 1), keep(new THREE.MeshPhongMaterial({ color: 0x15181c, shininess: 80, specular: 0x444a50 })), bez.length);
  bez.forEach((b, i) => { _m.compose(_v.set(b.x, b.y, b.z), _q.setFromAxisAngle(Y3, b.ry), new THREE.Vector3(b.w, b.h, b.d)); bezels.setMatrixAt(i, _m); });

  // ---------- 합친 고정 메시 (무광 · 유광 · 발광 · 글자) ----------
  const statMesh = new THREE.Mesh(keep(stat.build()), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
  const glossMesh = new THREE.Mesh(keep(gloss.build()), keep(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x55595e })));
  const glowMesh = new THREE.Mesh(keep(glow.build()), keep(new THREE.MeshBasicMaterial({ vertexColors: true })));
  const signGeo = keep(mergeGeometries(signParts)); for (const g of signParts) g.dispose();
  const signMesh = new THREE.Mesh(signGeo, keep(new THREE.MeshBasicMaterial({ map: atlasTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
  root.add(statMesh, glossMesh, glowMesh, signMesh);

  // ---------- 체험 직원 (가벼움, 경로 찾기 없음) ----------
  const staffRoot = new THREE.Group();
  {
    const skin = keep(new THREE.MeshLambertMaterial({ color: 0xf0c9a0 })), shirt = keep(new THREE.MeshLambertMaterial({ color: 0xf3eada })), pants = keep(new THREE.MeshLambertMaterial({ color: 0x2a3340 }));
    const greenM = keep(new THREE.MeshLambertMaterial({ color: 0x1e5a45 }));
    const legG = keep(new THREE.BoxGeometry(0.14, 0.82, 0.16)); legG.translate(0, -0.41, 0);
    const legL = new THREE.Mesh(legG, pants), legR = new THREE.Mesh(legG, pants); legL.position.set(-0.1, 0.84, 0); legR.position.set(0.1, 0.84, 0);
    const torso = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.22, 0.62, 10)), shirt); torso.position.y = 1.15;
    const apronTex = keep(canvasTex(256, 320, (g) => {
      g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 256, 320); g.fillStyle = '#F3EADA'; g.textAlign = 'center';
      g.font = F(900, 48); g.fillText('가전', 128, 110); g.font = F(700, 22); g.fillText('BUMPVISION', 128, 150);
      g.fillStyle = '#C8965A'; g.fillRect(40, 196, 176, 6); g.fillStyle = '#F3EADA'; g.font = F(800, 24); g.fillText('직원 범숙', 128, 250);
    }));
    const apron = new THREE.Mesh(keep(new THREE.BoxGeometry(0.36, 0.78, 0.02)), [greenM, greenM, greenM, greenM, keep(new THREE.MeshLambertMaterial({ map: apronTex })), greenM]); apron.position.set(0, 1.06, 0.215);
    const armG = keep(new THREE.BoxGeometry(0.1, 0.6, 0.12)); armG.translate(0, -0.3, 0);
    const armL = new THREE.Mesh(armG, shirt), armR = new THREE.Mesh(armG, shirt); armL.position.set(-0.27, 1.43, 0); armR.position.set(0.27, 1.43, 0);
    const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.15, 14, 10)), skin); head.position.y = 1.62;
    const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.155, 0.16, 0.08, 14)), greenM); cap.position.y = 1.72;
    const brim = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.015, 0.12)), greenM); brim.position.set(0, 1.69, 0.16);
    staffRoot.add(legL, legR, torso, apron, armL, armR, head, cap, brim);
    staffRoot.userData = { armL, armR };
  }
  staffRoot.position.set(71.6, 0, 19.4); root.add(staffRoot);
  const LINES = [
    '85인치는 카트에 눕혀서 실어 보세요~',
    '고가 상품은 구매 카드를 뽑아 계산대로 가시면 됩니다',
    '냉장고·세탁기는 열어 보고 돌려 보셔도 돼요 (체험용)',
    '85인치 박스가 31.9 kg, 가로 2 m 넘어요. 둘이 드세요',
    '카트로 TV를 받으면 화면이 지지직해요 ^^;',
    'TV 월 누르면 채널이 바뀌어요',
  ];
  let lineI = 0, lineT = 2.5, bubbleT = 0, bubbleText = '';
  const bubble = document.createElement('div');
  bubble.className = 'dh-elec-bubble';
  bubble.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:#fff;color:#13203d;border:3px solid #1E5A45;border-radius:16px;padding:8px 14px;font-size:14px;font-weight:800;white-space:nowrap;display:none;box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;z-index:57';
  const elecCss = document.createElement('style');
  elecCss.textContent = '#depot-hud .dh-elec-bubble:after{content:\'\';position:absolute;left:50%;bottom:-12px;margin-left:-9px;border:9px solid transparent;border-top-color:#1E5A45;border-bottom:0}';
  document.head.appendChild(elecCss);

  // ---------- 상호작용 ----------
  const hitP = new THREE.Vector3();
  const LIM = { tvwall: 16, robot: 5.5, speaker: 6, chair: 3.6, fridge: 3.6, washer: 3.6, dryer: 3.6 };
  function aim(ray) {
    let best = null;
    for (const t of targets) {
      const h = ray.ray.intersectBox(t.box, hitP); if (!h) continue;
      const d = h.distanceTo(ray.ray.origin);
      if (d <= (LIM[t.kind] || 3.6) && (!best || d < best.d)) best = { t, d };
    }
    const sh = ray.intersectObject(staffRoot, true)[0];
    if (sh && sh.distance < 4.5 && (!best || sh.distance < best.d)) best = { t: { kind: 'staff' }, d: sh.distance };
    return best?.t || null;
  }
  const hintOf = (t) => { const h = hint0(t); return isMobile ? h.replace(/^클릭(\/E)? =/, '탭 =') : h; };
  const hint0 = (t) => {
    if (!t) return '';
    if (t.kind === 'fridge') return S.fridges[t.i].want ? `클릭/E = ${t.label} 닫기` : `클릭/E = ${t.label} 열기 · 안에 불 들어와요`;
    if (t.kind === 'washer' || t.kind === 'dryer') return `클릭/E = ${t.label} 돌려 보기`;
    if (t.kind === 'chair') return S.chairT > 0 ? '안마 체험 중… 💆' : '클릭/E = 안마의자 체험';
    if (t.kind === 'speaker') return '클릭/E = 스피커 들어보기';
    if (t.kind === 'robot') return '클릭/E = 범봇에게 인사';
    if (t.kind === 'tvwall') return `클릭/E = 채널 바꾸기 (지금: ${CHANNELS[S.chan]})`;
    if (t.kind === 'staff') return '클릭 = 가전 직원에게 물어보기';
    return '';
  };
  function nextChannel() { S.chan = (S.chan + 1) % CHANNELS.length; S.segT = 0; S.mix = 0; }
  function act(t) {
    if (!t) return false;
    const c = t.box ? t.box.getCenter(new THREE.Vector3()) : staffRoot.position, pos = { x: c.x, y: c.y, z: c.z };
    if (t.kind === 'fridge') { const f = S.fridges[t.i]; f.want = f.want ? 0 : 1; f.t = 0; sfx(f.want ? 'elec-fridge-open' : 'elec-fridge-close', { pos: { x: f.x, y: 1.2, z: fFront } }); }
    else if (t.kind === 'washer' || t.kind === 'dryer') { const w = S.washers[t.i]; w.t = 7; if (!w.on) { w.on = true; sfx('elec-washer', { on: true, id: `w${t.i}`, pos }); } toast?.(w.dryer ? '🌀 건조기 회전 시연 — 히트펌프라 뽀송' : '🌀 드럼 회전 시연 — 탈수 흉내', 1600, '#1E5A45'); }
    else if (t.kind === 'chair') { S.chairT = 6; toast?.('💆 안마 체험 중… "아 거기 거기"', 2400, '#5a3b2a'); }
    else if (t.kind === 'speaker') { S.speakerT = 8; toast?.('🔊 범사운드 데모 재생 중', 1600, '#1E5A45'); }
    else if (t.kind === 'robot') { S.robots[0].turn = Math.PI; toast?.('🤖 범봇: "삐빅, 청소 중이에요!"', 1600, '#22262A'); }
    else if (t.kind === 'tvwall') { nextChannel(); toast?.(`📺 BUMPVISION 채널: ${CHANNELS[S.chan]}`, 1400, '#123B2D'); }
    else if (t.kind === 'staff') { lineI = (lineI + 1) % LINES.length; bubbleText = LINES[lineI]; bubbleT = 4.5; }
    return true;
  }
  function probe(ray) { const t = aim(ray); return t ? { label: hintOf(t), kind: t.kind } : null; }
  function handleClick(ray) { return act(aim(ray)); }
  function nearTv(px, pz) {
    for (const o of tvHits) { const qx = Math.max(o.x0, Math.min(px, o.x1)), qz = Math.max(o.z0, Math.min(pz, o.z1)); if (Math.hypot(px - qx, pz - qz) < 1.15) return true; }
    return false;
  }

  // ---------- 프레임 ----------
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const zoneBox = new THREE.Box3(new THREE.Vector3(ELEC_ZONE.x0, 0, ELEC_ZONE.z0), new THREE.Vector3(ELEC_ZONE.x1, 8.5, ELEC_ZONE.z1));
  const wallC = new THREE.Vector3(WX, 3, FRONT_Z);
  const lodFar = isMobile ? 30 : 48;
  function tick(dt, { camera, me, cart, shock = 0, hud } = {}) {
    S.t += dt;
    const sp = cart ? Math.hypot(cart.vx || 0, cart.vz || 0) : 0;
    if (cart && (shock > 0.3 || sp > 0.9) && nearTv(cart.x, cart.z)) S.flick = Math.max(S.flick, 0.55 + Math.min(0.5, shock || sp * 0.2));
    if (S.flick > 0) S.flick = Math.max(0, S.flick - dt);
    S.segT += dt; if (S.segT > SEG) nextChannel();
    S.mix = S.segT > SEG - 1.2 ? (S.segT - (SEG - 1.2)) / 1.2 : 0;
    let vis = true;
    if (camera) { camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm); vis = frustum.intersectsBox(zoneBox); }
    root.visible = vis; S.visible = vis;
    const dCam = camera ? camera.position.distanceTo(wallC) : 10;
    const tvOn = vis && dCam < 30; if (tvOn !== S.tvOn) { S.tvOn = tvOn; sfx('elec-tv', { on: tvOn, id: 'wall', pos: { x: WX, y: 3, z: FRONT_Z } }); }
    const dVac = camera ? Math.hypot(camera.position.x - (PEN.x0 + PEN.x1) / 2, camera.position.z - (PEN.z0 + PEN.z1) / 2) : 99;
    const vacOn = dVac < 14; if (vacOn !== S.vacOn) { S.vacOn = vacOn; S.robots.forEach((r, i) => sfx('elec-vac', { on: vacOn, id: `vac${i}`, pos: { x: r.x, y: 0.05, z: r.z } })); }
    S.washers.forEach((w, i) => { if (w.on && w.t <= 0) { w.on = false; sfx('elec-washer', { on: false, id: `w${i}`, pos: { x: w.x, y: 0.5, z: wFront } }); } });
    if (!vis) return;
    const u = scrM.uniforms; u.uTime.value = S.t; u.uChan.value = S.chan; u.uNext.value = (S.chan + 1) % 4; u.uMix.value = S.mix; u.uFlick.value = S.flick;
    const ph = S.segT / SEG; u.uSpan.value = ph < 0.5 ? 1 : ph < 0.56 ? 1 - (ph - 0.5) / 0.06 : 0;
    u.uLogoA.value = ph > 0.38 && ph < 0.5 ? Math.min(1, (ph - 0.38) / 0.03, (0.5 - ph) / 0.03) : 0;
    S.lod = dCam > lodFar ? 1 : 0; u.uLod.value = S.lod;
    const a = CH_AVG[S.chan], b = CH_AVG[(S.chan + 1) % 4]; u.uAvg.value.set(a[0] + (b[0] - a[0]) * S.mix, a[1] + (b[1] - a[1]) * S.mix, a[2] + (b[2] - a[2]) * S.mix);
    glowM.uniforms.uCol.value.setRGB(u.uAvg.value.x, u.uAvg.value.y, u.uAvg.value.z); glowM.uniforms.uK.value = (0.42 + 0.08 * Math.sin(S.t * 1.7)) * (S.flick > 0 ? 0.5 + Math.random() * 0.5 : 1);
    let doorDirty = false;
    S.fridges.forEach((f) => {
      if (f.want) { f.t += dt; if (f.t > 12) { f.want = 0; sfx('elec-fridge-close', { pos: { x: f.x, y: 1.2, z: fFront } }); } }
      const nv = f.open + Math.sign(f.want - f.open) * Math.min(Math.abs(f.want - f.open), dt * 1.6);
      if (nv !== f.open) { f.open = nv; doorDirty = true; }
    });
    if (doorDirty) setDoors();
    S.washers.forEach((w, i) => {
      const want = w.t > 0 ? (w.t > 1.5 ? 14 : w.t * 9) : 0.25; w.t = Math.max(0, w.t - dt);
      w.w += (want - w.w) * Math.min(1, dt * 1.2); w.ang += w.w * dt;
      const shake = w.w > 8 ? (Math.random() - 0.5) * 0.004 : 0;
      _m.compose(_v.set(w.x + shake, drumY + shake, wFront - 0.17), _q.setFromAxisAngle(Z3, w.ang), _s); drums.setMatrixAt(i, _m);
    });
    drums.instanceMatrix.needsUpdate = true;
    robotsTick(dt);
    if (S.speakerT > 0) { S.speakerT -= dt; const beat = Math.max(0, Math.sin(S.t * Math.PI * 2 * 2.05)) ** 6; setCones(S.speakerT > 0 ? beat * 0.6 : 0); }
    if (S.chairT > 0) S.chairT -= dt;
    if (me) {
      const d = Math.hypot(me.x - staffRoot.position.x, me.z - staffRoot.position.z);
      if (d < 8) staffRoot.rotation.y = Math.atan2(me.x - staffRoot.position.x, me.z - staffRoot.position.z);
      lineT -= dt;
      if (d < 5 && lineT <= 0) { bubbleText = LINES[lineI % LINES.length]; lineI++; bubbleT = 4.2; lineT = 11; }
      if (d > 8) bubbleT = Math.min(bubbleT, 0.2);
    }
    const sw = Math.sin(S.t * 2) * 0.04, ud = staffRoot.userData; ud.armL.rotation.x = -0.15 + sw; ud.armR.rotation.x = -0.15 - sw;
    if (bubbleT > 0) {
      bubbleT -= dt;
      if (!bubble.parentNode && hud) hud.appendChild(bubble);
      if (camera && bubble.parentNode) {
        const v = _v.set(staffRoot.position.x, 2.05, staffRoot.position.z).project(camera);
        const show = bubbleT > 0 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
        bubble.style.display = show ? 'block' : 'none'; bubble.textContent = bubbleText;
        if (show) { bubble.style.left = `${Math.max(8, Math.min(innerWidth - 8, (v.x + 1) / 2 * innerWidth))}px`; bubble.style.top = `${Math.max(40, (1 - v.y) / 2 * innerHeight)}px`; }
      }
    } else if (bubble.parentNode) bubble.style.display = 'none';
  }

  function metrics() {
    let tris = 0, meshes = 0, instanced = 0, instCount = 0, draws = 0;
    root.traverse((o) => {
      if (o.isMesh) {
        meshes++; draws += Array.isArray(o.material) ? o.material.length : 1;
        const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
        const c = o.isInstancedMesh ? o.count : 1; tris += n * c;
        if (o.isInstancedMesh) { instanced++; instCount += o.count; }
      }
    });
    return { zone: 'electronics', meshes, draws, instanced, instCount, tris: Math.round(tris), screens: scr.length, lod: S.lod, flickerT: +S.flick.toFixed(2), visible: S.visible, cheap: !!isMobile };
  }
  function openAllDoors(v = true) { for (const f of S.fridges) { f.want = v ? 1 : 0; f.t = 0; } }
  function dispose() {
    S.washers.forEach((w, i) => { if (w.on) sfx('elec-washer', { on: false, id: `w${i}` }); });
    if (S.tvOn) sfx('elec-tv', { on: false, id: 'wall' });
    if (S.vacOn) S.robots.forEach((r, i) => sfx('elec-vac', { on: false, id: `vac${i}` }));
    bubble.remove(); elecCss.remove(); scene.remove(root);
  }
  return {
    root, zone: ELEC_ZONE, tick, probe, handleClick, metrics, openAllDoors, dispose, staffRoot, tvHits,
    _dbg: { setAudio(a) { audio = a; }, openAllDoors, flicker: (t = 0.7) => { S.flick = t; }, metrics, act: (kind, i = 0) => act(targets.find((t) => t.kind === kind && t.i === i)), nextChannel, setSeg(t) { S.segT = t; }, S, targets, openFridge(i, v = true) { const f = S.fridges[i]; f.want = v ? 1 : 0; f.t = 0; f.open = v ? 1 : 0; setDoors(); } },
  };
}
