// [jz-traffic] 정자 일반 차량 NPC 모델: 배달 오토바이·스쿠터·경차·해치백·세단·SUV·승합차·전기차·포터형 1톤 트럭·택배 탑차·편의점 배송 탑차
//   - 모두 박스/원기둥으로 만든 로우폴리(새 에셋 없음). ⚠ 상표·로고·회사명 없음(일반화 디자인)
//   - 종류마다 지오메트리 하나로 병합(position·normal·color + tint·glow 속성) → InstancedMesh 1개 = draw call 1개/종류
//     tint=1 인 부품(차체)만 인스턴스 색을 곱하고, 나머지(유리·타이어·라이트·탑승자)는 고정 정점 색.
//     glow=1 인 부품(전조등·후미등)은 저녁에 스스로 빛남(uniform 하나) → 저녁 조명도 추가 draw call 없음
//   - 좌표: +z 가 앞, y=0 이 노면
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const GLASS = '#27313c', TIRE = '#1b1b1d', RIM = '#8d9298', TRIM = '#2b2e33', HEAD = '#fff4d0', TAIL = '#c8202a', PLATE = '#f1f1ee', EVPLATE = '#5fa8e0';

// 부품 조립기: 각 부품을 비인덱스 지오메트리로 바꿔 정점 속성(color/tint/glow)을 채운 뒤 병합
function builder() {
  const parts = [];
  const push = (g, color, { tint = 0, glow = 0 } = {}) => {
    const geo = g.index ? g.toNonIndexed() : g; geo.deleteAttribute('uv');
    const n = geo.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3), ti = new Float32Array(n).fill(tint), gl = new Float32Array(n).fill(glow);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('tint', new THREE.BufferAttribute(ti, 1)); geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    parts.push(geo); return geo;
  };
  const box = (w, h, l, x, y, z, color, o) => { const g = new THREE.BoxGeometry(w, h, l); g.translate(x, y, z); return push(g, color, o); };
  const wheel = (r, w, x, y, z) => { const g = new THREE.CylinderGeometry(r, r, w, 10); g.rotateZ(Math.PI / 2); g.translate(x, y, z); push(g, TIRE); const h = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8); h.rotateZ(Math.PI / 2); h.translate(x, y, z); push(h, RIM); };
  // 옆에서 본 다각형(z, y 점 목록)을 폭 w 로 x 방향 돌출
  const side = (pts, w, x, color, o) => { const s = new THREE.Shape(); s.moveTo(-pts[0][0], pts[0][1]); for (const [z, y] of pts.slice(1)) s.lineTo(-z, y); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(x - w / 2, 0, 0); return push(g, color, o); };
  const sphere = (r, x, y, z, color, o) => { const g = new THREE.SphereGeometry(r, 8, 6); g.translate(x, y, z); return push(g, color, o); };
  const done = () => { const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); g.computeBoundingSphere(); return g; };
  return { box, wheel, side, sphere, done };
}

// 승용차 공통: 아래 차체(틴트) + 유리 캐빈(사다리꼴) + 지붕(틴트) + 바퀴·범퍼·등·번호판
function car(o) {
  const B = builder(), { L, W, top, roof, cf, cr, rf, rr, wr = 0.33, gl = 0.18 } = o, hl = L / 2;
  B.box(W, top - gl, L, 0, (top + gl) / 2, 0, '#fff', { tint: 1 }); // 아래 차체
  if (o.hood) B.box(W - 0.04, 0.08, hl - cf, 0, top + 0.04, (hl + cf) / 2, '#fff', { tint: 1 }); // 보닛 살짝 높임
  B.side([[cf, top], [cr, top], [rr, roof - 0.04], [rf, roof - 0.04]], W - 0.12, 0, GLASS); // 캐빈 유리
  B.box(W - 0.2, 0.07, rf - rr + 0.02, 0, roof, (rf + rr) / 2, '#fff', { tint: 1 }); // 지붕
  if (o.pillar) for (const s of [-1, 1]) B.box(0.05, roof - top - 0.06, 0.12, s * (W / 2 - 0.07), (roof + top) / 2, (cf + cr) / 2 + 0.2, '#fff', { tint: 1 }); // B필러
  if (o.rails) for (const s of [-1, 1]) B.box(0.06, 0.06, rf - rr - 0.2, s * (W / 2 - 0.2), roof + 0.06, (rf + rr) / 2, TRIM);
  for (const z of [hl - (o.wf ?? 0.95), -hl + (o.wb ?? 0.95)]) for (const s of [-1, 1]) B.wheel(wr, 0.24, s * (W / 2 - 0.08), wr, z);
  B.box(W + 0.02, 0.2, 0.16, 0, gl + 0.24, hl + 0.02, TRIM); B.box(W + 0.02, 0.2, 0.16, 0, gl + 0.24, -hl - 0.02, TRIM); // 범퍼
  if (o.ev) { B.box(W - 0.2, 0.06, 0.04, 0, top - 0.12, hl + 0.01, HEAD, { glow: 1 }); B.box(W - 0.16, 0.07, 0.04, 0, top - 0.1, -hl - 0.01, TAIL, { glow: 1 }); } // 전기차: 그릴 없이 가로 라이트 바
  else {
    B.box(W * 0.5, 0.14, 0.04, 0, top - 0.24, hl + 0.01, TRIM); // 그릴
    for (const s of [-1, 1]) { B.box(0.36, 0.13, 0.05, s * (W / 2 - 0.3), top - 0.16, hl + 0.01, HEAD, { glow: 1 }); B.box(0.3, 0.14, 0.05, s * (W / 2 - 0.26), top - 0.16, -hl - 0.01, TAIL, { glow: 1 }); }
  }
  B.box(0.52, 0.12, 0.03, 0, gl + 0.4, hl + 0.1, o.ev ? EVPLATE : PLATE); B.box(0.52, 0.12, 0.03, 0, gl + 0.48, -hl - 0.05, o.ev ? EVPLATE : PLATE);
  if (o.slide) B.box(0.02, 0.03, 1.4, W / 2 + 0.005, top + 0.25, -0.4, TRIM); // 승합차 슬라이딩 도어 레일
  return B.done();
}

// 캡오버 1톤 트럭(포터형): 앞 캡(틴트) + 적재함(평판+낮은 문짝) 또는 탑(박스)
function truck(o) {
  const B = builder(), L = 5.1, W = 1.74, hl = L / 2, cabL = 1.55, cz = hl - cabL / 2, fl = 0.86;
  B.box(W, 1.15, cabL, 0, 0.62 + 0.575, cz, o.cabTint ? '#fff' : o.cab, { tint: o.cabTint ? 1 : 0 }); // 캡 몸체(고정색 캡이면 tint 0)
  B.box(W - 0.14, 0.55, 0.04, 0, 1.45, hl + 0.005, GLASS); // 앞유리
  for (const s of [-1, 1]) B.box(0.04, 0.45, 0.8, s * (W / 2 + 0.003), 1.47, cz + 0.15, GLASS); // 옆 창
  B.box(W - 0.06, 0.12, cabL - 0.1, 0, 1.83, cz, o.cabTint ? '#fff' : o.cab, { tint: o.cabTint ? 1 : 0 });
  B.box(W + 0.04, 0.22, 0.14, 0, 0.5, hl + 0.03, TRIM); // 앞 범퍼
  for (const s of [-1, 1]) { B.box(0.3, 0.16, 0.05, s * (W / 2 - 0.26), 0.78, hl + 0.01, HEAD, { glow: 1 }); B.box(0.22, 0.14, 0.05, s * (W / 2 - 0.2), 0.62, -hl - 0.01, TAIL, { glow: 1 }); }
  B.box(0.52, 0.12, 0.03, 0, 0.5, hl + 0.11, PLATE);
  const bedL = L - cabL - 0.08, bz = -hl + bedL / 2;
  B.box(0.9, 0.22, bedL, 0, 0.62, bz, TRIM); // 프레임
  if (o.box) {
    B.box(W + 0.12, 1.75, bedL, 0, fl + 0.875, bz, o.box); // 탑(알루미늄 박스)
    if (o.stripe) B.box(W + 0.13, 0.22, bedL - 0.3, 0, fl + 0.55, bz, '#fff', { tint: 1 }); // 편의점 배송: 색 띠(로고 없음)
    B.box(W + 0.1, 0.04, 0.03, 0, fl + 0.9, -hl - 0.005, '#9aa0a6'); // 뒷문 경첩선
  } else {
    B.box(W + 0.1, 0.08, bedL, 0, fl, bz, '#9aa0a6'); // 적재함 바닥
    for (const s of [-1, 1]) B.box(0.05, 0.42, bedL, s * (W / 2 + 0.03), fl + 0.25, bz, '#c9ccd1'); // 옆 문짝(알루미늄)
    B.box(W + 0.1, 0.42, 0.05, 0, fl + 0.25, -hl + 0.03, '#c9ccd1'); // 뒷문
    B.box(W + 0.1, 0.9, 0.06, 0, fl + 0.45, hl - cabL - 0.06, '#5b6067'); // 캡 뒤 보호 프레임
    if (o.load) B.box(1.1, 0.4, 1.0, 0.1, fl + 0.24, bz - 0.4, o.load); // 짐(박스 더미)
  }
  for (const [z, w] of [[hl - 0.7, 0.24], [-hl + 1.15, 0.36]]) for (const s of [-1, 1]) B.wheel(0.3, w, s * (W / 2 - 0.12), 0.3, z);
  return B.done();
}

// 스쿠터(+배달 박스) + 헬멧 쓴 운전자
function scooter(o) {
  const B = builder(), bodyT = o.delivery ? 0 : 1, body = o.delivery ? '#2a2d32' : '#fff';
  for (const z of [0.64, -0.62]) B.wheel(0.25, 0.1, 0, 0.25, z);
  B.box(0.3, 0.14, 0.75, 0, 0.36, 0.0, body, { tint: bodyT }); // 발판
  B.side([[0.82, 0.3], [0.5, 0.3], [0.42, 1.05], [0.62, 1.08]], 0.34, 0, body, { tint: bodyT }); // 앞 카울
  B.side([[-0.2, 0.36], [-0.82, 0.48], [-0.86, 0.7], [-0.12, 0.66]], 0.34, 0, body, { tint: bodyT }); // 뒤 카울
  B.box(0.3, 0.08, 0.55, 0, 0.74, -0.4, TRIM); // 시트
  B.box(0.62, 0.04, 0.04, 0, 1.1, 0.5, TRIM); // 핸들
  B.box(0.16, 0.1, 0.05, 0, 0.98, 0.66, HEAD, { glow: 1 }); B.box(0.14, 0.06, 0.04, 0, 0.66, -0.87, TAIL, { glow: 1 });
  B.box(0.24, 0.1, 0.03, 0, 0.5, -0.86, PLATE);
  if (o.delivery) { B.box(0.5, 0.06, 0.4, 0, 0.8, -0.72, TRIM); B.box(0.46, 0.44, 0.44, 0, 1.06, -0.72, '#fff', { tint: 1 }); B.box(0.47, 0.03, 0.45, 0, 1.12, -0.72, '#e9e9e6'); } // 짐대 + 배달통(색만, 로고 없음)
  const jacket = o.delivery ? '#2b3038' : '#3d4652', pants = '#25272b', skin = '#e2bfa0';
  B.box(0.34, 0.12, 0.4, 0, 0.84, -0.2, pants); // 허벅지
  for (const s of [-1, 1]) B.box(0.12, 0.42, 0.12, s * 0.12, 0.58, 0.16, pants); // 정강이(발판 위)
  B.side([[-0.08, 0.86], [-0.34, 0.86], [-0.24, 1.42], [0.0, 1.4]], 0.38, 0, jacket); // 상체(앞으로 약간 숙임)
  for (const s of [-1, 1]) B.side([[-0.04, 1.36], [-0.12, 1.26], [0.46, 1.08], [0.5, 1.15]], 0.09, s * 0.22, jacket); // 팔
  B.box(0.1, 0.06, 0.06, 0, 1.47, -0.1, skin); // 목
  B.sphere(0.165, 0, 1.62, -0.1, o.delivery ? '#eeeeec' : '#1d1f22'); // 헬멧
  B.box(0.24, 0.1, 0.06, 0, 1.6, 0.05, '#20262e'); // 바이저
  return B.done();
}

// 종류 정의: 크기(외곽 L×W, m) · 속도 배수 · 가속 · 색 목록 [색, 가중치]
const CAR_PAINT = [['#f3f3f0', 30], ['#1b1d20', 20], ['#c6cbd0', 14], ['#7c828a', 12], ['#263555', 5], ['#9e2024', 3], ['#cdbf9f', 3], ['#2f62a8', 3], ['#3c5a46', 2], ['#9cc3dc', 2], ['#5a3a2a', 2]];
const KEI_PAINT = [['#f3f3f0', 28], ['#c6cbd0', 14], ['#e6c437', 8], ['#9cc3dc', 10], ['#f09aa0', 5], ['#7fb08a', 6], ['#1b1d20', 10], ['#9e2024', 6], ['#7c828a', 10], ['#f3e4c8', 6]];
const EV_PAINT = [['#f3f3f0', 30], ['#9aa3ad', 18], ['#1b1d20', 14], ['#3d74a8', 14], ['#bcd7e6', 10], ['#5b6168', 10], ['#7a2a30', 4]];
const PORTER_PAINT = [['#1f4f9a', 45], ['#f3f3f0', 45], ['#c6cbd0', 10]];
const BOX_PAINT = [['#c8202a', 22], ['#f3f3f0', 18], ['#1b1d20', 18], ['#1f63c4', 14], ['#25b3a2', 12], ['#f2b705', 8], ['#ef7d22', 8]];
const SCOOT_PAINT = [['#f3f3f0', 30], ['#1b1d20', 25], ['#c8202a', 12], ['#9cc3dc', 10], ['#7c828a', 15], ['#e6c437', 8]];
const STRIPE_PAINT = [['#2e9b4f', 30], ['#7a3fa0', 25], ['#ef7d22', 20], ['#1f63c4', 25]];
export const KINDS = {
  moto: { label: '배달 오토바이', L: 1.95, W: 0.75, vf: 1.18, acc: 3.2, moto: true, paint: BOX_PAINT, build: () => scooter({ delivery: true }) },
  scooter: { label: '스쿠터', L: 1.9, W: 0.72, vf: 1.05, acc: 2.8, moto: true, paint: SCOOT_PAINT, build: () => scooter({ delivery: false }) },
  kei: { label: '경차', L: 3.6, W: 1.6, vf: 0.95, acc: 2.0, paint: KEI_PAINT, build: () => car({ L: 3.6, W: 1.6, top: 0.92, roof: 1.68, cf: 1.0, cr: -1.72, rf: 0.55, rr: -1.74, wr: 0.28, wf: 0.6, wb: 0.6, pillar: 1 }) },
  hatch: { label: '해치백', L: 4.2, W: 1.78, vf: 1.0, acc: 2.1, paint: CAR_PAINT, build: () => car({ L: 4.2, W: 1.78, top: 0.9, roof: 1.47, cf: 1.0, cr: -1.98, rf: 0.18, rr: -1.78, wr: 0.31, wf: 0.75, wb: 0.7, hood: 1 }) },
  sedan: { label: '승용차', L: 4.85, W: 1.84, vf: 1.0, acc: 2.0, paint: CAR_PAINT, build: () => car({ L: 4.85, W: 1.84, top: 0.9, roof: 1.44, cf: 1.15, cr: -1.3, rf: 0.42, rr: -0.82, hood: 1 }) },
  suv: { label: 'SUV', L: 4.7, W: 1.9, vf: 1.0, acc: 2.0, paint: CAR_PAINT, build: () => car({ L: 4.7, W: 1.9, top: 1.05, roof: 1.74, cf: 1.2, cr: -2.2, rf: 0.5, rr: -2.12, wr: 0.38, wf: 0.95, wb: 0.9, gl: 0.24, hood: 1, rails: 1 }) },
  van: { label: '승합차', L: 5.15, W: 1.98, vf: 0.95, acc: 1.8, paint: CAR_PAINT.filter(([c]) => c !== '#9e2024'), build: () => car({ L: 5.15, W: 1.98, top: 1.0, roof: 1.96, cf: 1.65, cr: -2.48, rf: 0.95, rr: -2.48, wr: 0.36, wf: 0.85, wb: 0.95, gl: 0.22, slide: 1, pillar: 1 }) },
  ev: { label: '전기차', L: 4.65, W: 1.88, vf: 1.02, acc: 2.6, ev: true, paint: EV_PAINT, build: () => car({ L: 4.65, W: 1.88, top: 0.88, roof: 1.52, cf: 1.4, cr: -1.98, rf: 0.38, rr: -1.45, wr: 0.34, ev: 1 }) },
  porter: { label: '1톤 트럭', L: 5.1, W: 1.86, vf: 0.92, acc: 1.6, truck: true, paint: PORTER_PAINT, build: () => truck({ cabTint: true, load: '#b98a5a' }) },
  parcel: { label: '택배 탑차', L: 5.1, W: 1.86, vf: 0.9, acc: 1.5, truck: true, paint: PORTER_PAINT, build: () => truck({ cabTint: true, box: '#e9eaec' }) },
  cvs: { label: '편의점 배송 탑차', L: 5.1, W: 1.86, vf: 0.9, acc: 1.5, truck: true, paint: STRIPE_PAINT, build: () => truck({ cabTint: false, cab: '#f3f3f0', box: '#eef0f2', stripe: 1 }) },
};

export function pickWeighted(list, r) { let tot = 0; for (const x of list) tot += x[1]; r *= tot; for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[list.length - 1][0]; }

// 공유 재질: Lambert + 정점 색. tint 속성만큼 인스턴스 색을 곱하고, 저녁엔 glow 부품이 자체 발광
let MAT = null;
export function vehicleMaterial() {
  if (MAT) return MAT;
  const eve = { value: 0 };
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEve = eve;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tint;\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <color_vertex>', 'vColor = vec4(1.0);\nvColor.rgb *= color.rgb;\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb *= mix(vec3(1.0), instanceColor.rgb, tint);\n#endif\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uEve;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uEve * 1.4;');
  };
  m.customProgramCacheKey = () => 'jz-vehicle-v2';
  m.userData.eve = eve;
  return (MAT = m);
}

let GEO = null;
export function kindGeometry(k) { GEO ||= {}; return (GEO[k] ||= KINDS[k].build()); }
