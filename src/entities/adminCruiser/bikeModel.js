// [bike] 'Admin Cruiser' — 비비드 블랙 소프테일 팻보이 스타일 크루저 (사진 참고, 절차적 지오메트리 + 캔버스 텍스처, 로고/상표 없음)
// 로컬 좌표: +z 앞, +x = 왼쪽(사진에서 보이는 쪽: 프라이머리 커버·킥스탠드), y 위. 원점 = 두 바퀴 접지점 중앙(지면).
// 사양: 전장 2370 mm, 휠베이스 1665 mm, 차량중량 304 kg, 연료탱크 18.9 L, 앞 18" / 뒤 18" (160/60R18, 240/40R18)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BDIM = { L: 2.37, WB: 1.665, R: 0.325, RIM: 0.2286, FW: 0.16, RW: 0.24, SEAT: 0.675, MASS: 304, TANK_L: 18.9, RAKE: Math.PI / 6 };
const AX = BDIM.WB / 2, R = BDIM.R;
const NECK = new THREE.Vector3(0, 0.975, 0.399); // 조향축 상단(헤드파이프). 앞 차축 = NECK + (0,-0.65,0.4335)

// ---------- 텍스처 ----------
const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
// 솔리드 디스크 휠: 가공 알루미늄 + 림 둘레 사각 컷아웃 링 + 검은 허브 (로고 없음)
function discTex(rear) {
  const [c, x] = cv(512); x.translate(256, 256); const S = 252;
  const g = x.createRadialGradient(-40, -60, 10, 0, 0, S); g.addColorStop(0, '#f3f4f5'); g.addColorStop(0.55, '#c9ccd0'); g.addColorStop(1, '#9ea2a7');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, S, 0, 7); x.fill();
  // 가공 동심원 결
  for (let r = 40; r < S; r += 3) { x.strokeStyle = `rgba(255,255,255,${0.05 + (r % 7) * 0.012})`; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, r, 0, 7); x.stroke(); }
  x.strokeStyle = '#6c7075'; x.lineWidth = 5; x.beginPath(); x.arc(0, 0, S - 4, 0, 7); x.stroke();
  // 사각 컷아웃 링
  const n = rear ? 22 : 20, r0 = S * 0.73, r1 = S * 0.92;
  for (let i = 0; i < n; i++) {
    x.save(); x.rotate((i / n) * Math.PI * 2);
    const w = ((2 * Math.PI * r0) / n) * 0.62;
    x.fillStyle = '#101113'; x.fillRect(-w / 2, r0, w, r1 - r0);
    x.strokeStyle = '#e9ebed'; x.lineWidth = 2; x.strokeRect(-w / 2 - 1, r0 - 1, w + 2, r1 - r0 + 2);
    x.restore();
  }
  x.strokeStyle = '#2b2d30'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, S * 0.69, 0, 7); x.stroke();
  // 안쪽 면: 뒤는 얇은 검은 링 두 줄, 허브
  if (rear) { x.strokeStyle = '#33363a'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, S * 0.5, 0, 7); x.stroke(); }
  x.fillStyle = '#1a1b1d'; x.beginPath(); x.arc(0, 0, S * 0.24, 0, 7); x.fill();
  x.fillStyle = '#d9dbde'; x.beginPath(); x.arc(0, 0, S * 0.1, 0, 7); x.fill();
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; x.fillStyle = '#b8bbbf'; x.beginPath(); x.arc(Math.cos(a) * S * 0.17, Math.sin(a) * S * 0.17, 6, 0, 7); x.fill(); }
  return tex(c);
}
function rotorTex() { // 드릴드 브레이크 디스크(검정 캐리어 + 은색 마찰면 + 구멍)
  const [c, x] = cv(256); x.translate(128, 128);
  x.fillStyle = '#9da1a6'; x.beginPath(); x.arc(0, 0, 126, 0, 7); x.fill();
  x.fillStyle = '#18191b'; x.beginPath(); x.arc(0, 0, 88, 0, 7); x.fill();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; x.fillStyle = '#2a2c2f'; x.beginPath(); x.arc(Math.cos(a) * 60, Math.sin(a) * 60, 9, 0, 7); x.fill(); }
  x.fillStyle = '#26282b';
  for (let k = 0; k < 2; k++) for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2 + k * 0.13, r = 100 + k * 14; x.beginPath(); x.arc(Math.cos(a) * r, Math.sin(a) * r, 3.2, 0, 7); x.fill(); }
  const t = tex(c); return t;
}
function tireTex() { // 크루저 트레드(사이드 쪽은 매끈)
  const [c, x] = cv(256, 32); x.fillStyle = '#1b1c1e'; x.fillRect(0, 0, 256, 32); x.fillStyle = '#0d0e0f';
  for (let i = 0; i < 40; i++) { x.fillRect(i * 6.4, 9, 2.4, 6); x.fillRect(i * 6.4 + 3.2, 17, 2.4, 6); }
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
function finTex() { // 실린더 냉각핀: 검정 + 은색 핀 끝 (세로 반복)
  const [c, x] = cv(16, 64); x.fillStyle = '#101113'; x.fillRect(0, 0, 16, 64);
  for (let i = 0; i < 8; i++) { x.fillStyle = '#9a9ea3'; x.fillRect(0, i * 8, 16, 1); x.fillStyle = '#3a3d41'; x.fillRect(0, i * 8 + 1, 16, 1); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function makeEnv(renderer) { // 야외 반사용 환경맵 (하늘 + 벽돌빛 수평선 + 모래 지면)
  const sc = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), col = [];
  const top = new THREE.Color('#6aaee8'), hor = new THREE.Color('#f4f6f8'), gnd = new THREE.Color('#7f8184'), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10; const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.5)) : hor.clone().lerp(gnd, Math.min(1, -y * 5)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // 밝은 창/하늘 패널 몇 개 → 크롬에 하이라이트
  const pl = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  for (const [x, y, z] of [[6, 4, 5], [-7, 3, -2], [0, 8, -6]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), pl); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); }
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.02); pm.dispose(); g.dispose();
  return rt.texture;
}

// ---------- 지오메트리 헬퍼 ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tube = (pts, r, seg = 24, rs = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false);
// 휀더: 차축 기준 (z,y) 평면의 원호를 따라 둥근 단면(가운데 볼록 + 옆 스커트)을 스윕. a: +z 에서 +y 방향 각도
function fenderGeo(r, halfW, depth, skirt, a0, a1, n = 28) {
  const sec = [[-halfW, r - skirt], [-halfW, r]];
  for (let i = 1; i < 12; i++) { const t = -Math.PI / 2 + (i / 12) * Math.PI; sec.push([halfW * Math.sin(t), r + depth * Math.cos(t)]); }
  sec.push([halfW, r], [halfW, r - skirt]);
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, c = Math.cos(a), s = Math.sin(a); for (let j = 0; j < sec.length; j++) { const [x, rr] = sec[j]; pos.push(x, rr * s, rr * c); uv.push(i / n, j / (sec.length - 1)); } }
  const m = sec.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + m; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// 측면 프로파일(z,y)을 x 방향 두께로 돌출 + 둥근 베벨
function sideExtrude(pts, depth, bevel = 0.03) {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 4, curveSegments: 16 });
  g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); // shape (z,y) → 로컬 (z,y), 돌출 방향 → x
  return g;
}
function tyreGeo(halfW, rimR, outR) { // 둥근 사각 단면 회전체 (축 = x)
  const pts = [], n = 18;
  pts.push(new THREE.Vector2(rimR, -halfW * 0.82));
  for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + (i / n) * Math.PI, e = 0.55; const cx = Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), e), sy = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), e);
    const midR = (rimR + outR) / 2 + 0.004, hr = (outR - rimR) / 2 + 0.006; pts.push(new THREE.Vector2(midR + hr * cx, halfW * sy)); }
  pts.push(new THREE.Vector2(rimR, halfW * 0.82));
  const g = new THREE.LatheGeometry(pts, 40); g.rotateZ(Math.PI / 2); return g;
}

let shared = null;
function getShared(renderer) {
  if (shared) return shared;
  const env = makeEnv(renderer);
  const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, ...o });
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: '#0b0c0e', metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 1.1 }), // 비비드 블랙
    paintRed: new THREE.MeshPhysicalMaterial({ color: '#b8121f', metalness: 0.38, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 1.25 }), // 크림슨 레드 탱크
    satin: std({ color: '#141518', metalness: 0.4, roughness: 0.55 }), // 프레임/스윙암
    chrome: std({ color: '#eef0f2', metalness: 1, roughness: 0.09, envMapIntensity: 1.25 }),
    alu: std({ color: '#c4c7cb', metalness: 0.9, roughness: 0.3 }),
    eng: std({ color: '#ffffff', map: finTex(), metalness: 0.45, roughness: 0.5 }),
    engDark: std({ color: '#17181a', metalness: 0.55, roughness: 0.45 }),
    rubber: std({ color: '#ffffff', map: tireTex(), metalness: 0, roughness: 0.92 }),
    rubberPlain: std({ color: '#151617', metalness: 0, roughness: 0.9 }),
    seat: std({ color: '#0d0d0e', metalness: 0.05, roughness: 0.62 }),
    discF: std({ color: '#ffffff', map: discTex(false), metalness: 0.55, roughness: 0.32, envMapIntensity: 1.2 }),
    discR: std({ color: '#ffffff', map: discTex(true), metalness: 0.55, roughness: 0.32, envMapIntensity: 1.2 }),
    rotor: std({ color: '#ffffff', map: rotorTex(), metalness: 0.8, roughness: 0.35, transparent: false }),
    lamp: new THREE.MeshBasicMaterial({ color: '#fbfbf2' }),
    tail: new THREE.MeshStandardMaterial({ color: '#7a0d10', emissive: '#c0141a', emissiveIntensity: 0.6, roughness: 0.3 }),
    tailOn: new THREE.MeshBasicMaterial({ color: '#ff2a2a' }),
    amber: new THREE.MeshStandardMaterial({ color: '#d9781c', emissive: '#7a3a05', emissiveIntensity: 0.6, roughness: 0.35 }),
    glass: std({ color: '#cfd8e0', metalness: 1, roughness: 0.02 }),
  };
  const G = {
    tyreF: tyreGeo(BDIM.FW / 2, BDIM.RIM, R), tyreR: tyreGeo(BDIM.RW / 2, BDIM.RIM, R),
    discF: new THREE.CylinderGeometry(BDIM.RIM + 0.006, BDIM.RIM + 0.006, BDIM.FW * 0.8, 40).rotateZ(Math.PI / 2),
    discR: new THREE.CylinderGeometry(BDIM.RIM + 0.006, BDIM.RIM + 0.006, BDIM.RW * 0.82, 40).rotateZ(Math.PI / 2),
    rotor: new THREE.CylinderGeometry(0.15, 0.15, 0.008, 32).rotateZ(Math.PI / 2),
  };
  shared = { M, G };
  return shared;
}

// 캡: CylinderGeometry 재질 그룹 [옆면, 윗캡, 아랫캡]
const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; return o; };

export function createBike(renderer, { tankColor = 'black' } = {}) {
  const { M, G } = getShared(renderer);
  const root = new THREE.Group(); root.name = 'adminCruiser';
  const lean = new THREE.Group(); root.add(lean); // 롤(기울기) 피벗 = 접지선
  // 뒷바퀴 접지점(0, 0, -AX)을 축으로 앞바퀴를 드는 윌리(Wheelie) 피벗
  const wheelie = new THREE.Group(); wheelie.position.set(0, 0, -AX); lean.add(wheelie);
  const wheelieFrame = new THREE.Group(); wheelieFrame.position.set(0, 0, AX); wheelie.add(wheelieFrame);
  const body = new THREE.Group(); wheelieFrame.add(body);
  const add = (g, m, p, r, parent = body) => { const o = mesh(g, m); if (p) o.position.copy(p); if (r) o.rotation.set(r[0], r[1], r[2] || 0); parent.add(o); return o; };

  // ---- 바퀴 ----
  const wheel = (front) => {
    const spin = new THREE.Group();
    spin.add(mesh(front ? G.tyreF : G.tyreR, M.rubber));
    spin.add(mesh(front ? G.discF : G.discR, [M.alu, front ? M.discF : M.discR, front ? M.discF : M.discR]));
    if (front) { const r = mesh(G.rotor, [M.alu, M.rotor, M.rotor]); r.position.x = BDIM.FW * 0.4 + 0.012; spin.add(r); }
    else { // 왼쪽 벨트 풀리 링(검정) + 오른쪽 작은 디스크
      const p = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24).rotateZ(Math.PI / 2), [M.satin, M.engDark, M.engDark]); p.position.x = BDIM.RW * 0.41 + 0.012; spin.add(p);
      const rr = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.008, 28).rotateZ(Math.PI / 2), [M.alu, M.rotor, M.rotor]); rr.position.x = -(BDIM.RW * 0.41 + 0.01); spin.add(rr);
    }
    return spin;
  };
  const rearSpin = wheel(false); rearSpin.position.set(0, R, -AX); body.add(rearSpin);

  // ---- 앞 조향부: 레이크 30° 축을 따라 회전 ----
  const forkRoot = new THREE.Group(); forkRoot.position.copy(NECK); forkRoot.rotation.x = -BDIM.RAKE; body.add(forkRoot);
  const steer = new THREE.Group(); forkRoot.add(steer);
  const up = new THREE.Group(); up.rotation.x = BDIM.RAKE; steer.add(up); // 넥 기준 '차체 축' 좌표로 되돌림
  const FA = V(0, R - NECK.y, AX - NECK.z); // 넥 기준 앞 차축
  const frontSpin = wheel(true); frontSpin.position.copy(FA); up.add(frontSpin);
  // 포크(축 방향 = steer 로컬 -y). 위: 크롬 이너튜브, 아래: 은색 슬라이더
  for (const sx of [1, -1]) {
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.5, 12), M.chrome, V(sx * 0.105, -0.28, 0.05), null, steer);
    add(new THREE.CylinderGeometry(0.034, 0.03, 0.34, 12), M.alu, V(sx * 0.105, -0.62, 0.05), null, steer);
    add(new THREE.SphereGeometry(0.034, 10, 8), M.alu, V(sx * 0.105, -0.79, 0.05), null, steer);
  }
  add(new THREE.BoxGeometry(0.27, 0.035, 0.09), M.alu, V(0, -0.02, 0.03), null, steer); // 트리플 클램프
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8).rotateZ(Math.PI / 2), M.chrome, V(0, -0.79, 0.05), null, steer); // 차축
  add(new THREE.BoxGeometry(0.03, 0.07, 0.05), M.satin, V(0.125, -0.67, -0.04), null, steer); // 캘리퍼(왼쪽)
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), M.amber, V(0.14, -0.56, 0.085), [Math.PI / 2, 0, 0], steer); // 포크 리플렉터
  // 헤드라이트 나셀(검정 페인트) + 둥근 헤드라이트
  add(new THREE.SphereGeometry(1, 20, 14).scale(0.15, 0.16, 0.15), M.paint, V(0, -0.07, 0.05), null, up);
  const bucket = add(new THREE.CylinderGeometry(0.125, 0.11, 0.1, 28).rotateX(Math.PI / 2), M.chrome, V(0, -0.08, 0.17), null, up);
  add(new THREE.CircleGeometry(0.108, 28), M.lamp, V(0, -0.08, 0.222), null, up);
  add(new THREE.TorusGeometry(0.109, 0.008, 6, 28), M.paint, V(0, -0.08, 0.222), null, up);
  void bucket;
  add(new THREE.BoxGeometry(0.11, 0.06, 0.05), M.chrome, V(0, 0.07, 0.02), null, up); // 라이저
  // 핸들바(크롬, 풀백) + 그립 + 레버 + 미러
  const barPts = (s) => [V(s * 0.44, 0.16, -0.21), V(s * 0.33, 0.165, -0.18), V(s * 0.16, 0.16, -0.05), V(s * 0.04, 0.12, 0.02)];
  add(tube([...barPts(1), ...barPts(-1).reverse()], 0.016, 40), M.chrome, null, null, up);
  const grips = [];
  for (const sx of [1, -1]) {
    const gp = add(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 10).rotateZ(Math.PI / 2), M.rubberPlain, V(sx * 0.43, 0.16, -0.205), [0, sx * 0.25, 0], up);
    const marker = new THREE.Object3D(); marker.position.set(sx * 0.41, 0.17, -0.2); up.add(marker); grips[sx > 0 ? 0 : 1] = marker;
    add(new THREE.BoxGeometry(0.17, 0.012, 0.025), M.chrome, V(sx * 0.33, 0.15, -0.14), [0, -sx * 0.35, 0], up); // 레버
    add(new THREE.BoxGeometry(0.06, 0.045, 0.05), M.chrome, V(sx * 0.27, 0.16, -0.16), null, up); // 스위치 하우징
    add(tube([V(sx * 0.26, 0.17, -0.16), V(sx * 0.29, 0.3, -0.18), V(sx * 0.31, 0.42, -0.2)], 0.007, 8, 6), M.chrome, null, null, up);
    const mir = add(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 20).rotateX(Math.PI / 2), M.chrome, V(sx * 0.32, 0.46, -0.21), [0.2, sx * 0.25, 0], up);
    void gp; void mir;
    add(new THREE.SphereGeometry(0.028, 10, 8).scale(1, 1, 1.3), M.amber, V(sx * 0.17, -0.07, 0.12), null, up); // 앞 방향지시등
  }
  // 앞 휀더 (조향과 함께)
  const ff = add(fenderGeo(0.348, 0.1, 0.03, 0.055, 0.42, 2.25), M.paint, FA, null, up); ff.material = M.paint;

  // ---- 탱크(18.9 L 볼륨) + 크롬 콘솔 ----
  const tankMat = tankColor === 'red' ? M.paintRed : M.paint;
  const tankTop = add(new THREE.SphereGeometry(1, 28, 18).scale(0.185, 0.135, 0.34), tankMat, V(0, 0.85, 0.1), [-0.09, 0, 0]);
  const tankBot = add(new THREE.SphereGeometry(1, 20, 10).scale(0.15, 0.07, 0.28), tankMat, V(0, 0.76, 0.1), [-0.08, 0, 0]); // 아래쪽 볼륨
  add(new THREE.SphereGeometry(1, 16, 8).scale(0.045, 0.02, 0.22), M.chrome, V(0, 0.982, 0.06), [-0.09, 0, 0]); // 대시 콘솔
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), M.chrome, V(0.08, 0.972, 0.24)); // 주유구 캡

  // ---- 시트 (계단식: 낮은 라이더 디시 + 높은 텐덤 쿠션) ----
  const seatG = sideExtrude([[-0.05, 0.79], [-0.12, 0.73], [-0.3, 0.68], [-0.44, 0.7], [-0.5, 0.76], [-0.53, 0.8], [-0.55, 0.62], [-0.2, 0.6], [-0.05, 0.7]], 0.36, 0.04);
  add(seatG, M.seat);
  add(sideExtrude([[-0.54, 0.79], [-0.6, 0.84], [-0.8, 0.84], [-0.86, 0.8], [-0.84, 0.76], [-0.56, 0.75]], 0.28, 0.05), M.seat);

  // ---- 뒤 휀더 + 크롬 스트럿 커버 + 사이드 테일라이트 ----
  add(fenderGeo(0.345, 0.15, 0.028, 0.07, 0.62, 2.72), M.paint, V(0, R, -AX));
  for (const sx of [1, -1]) {
    add(tube([V(sx * 0.16, 0.64, -0.5), V(sx * 0.165, 0.6, -0.82), V(sx * 0.165, 0.52, -1.06)], 0.014, 16, 6), M.chrome);
    add(new THREE.BoxGeometry(0.012, 0.025, 0.11), M.tail, V(sx * 0.172, 0.565, -0.95), [0.35, 0, 0]);
  }
  const tailC = add(new THREE.BoxGeometry(0.1, 0.03, 0.025), M.tail, V(0, 0.53, -1.15), [-0.5, 0, 0]);
  add(new THREE.BoxGeometry(0.17, 0.12, 0.006), M.satin, V(0, 0.38, -1.18), [-0.35, 0, 0]); // 번호판 자리(무지)
  for (const sx of [1, -1]) add(new THREE.SphereGeometry(0.025, 10, 8).scale(1, 1, 1.4), M.amber, V(sx * 0.14, 0.47, -1.12));

  // ---- 프레임/스윙암(검정) ----
  add(tube([V(0, 0.95, 0.37), V(0, 0.8, 0.05), V(0, 0.66, -0.3), V(0, 0.64, -0.75)], 0.028, 24), M.satin); // 백본
  for (const sx of [1, -1]) {
    add(tube([V(sx * 0.03, 0.9, 0.37), V(sx * 0.08, 0.55, 0.32), V(sx * 0.1, 0.2, 0.18), V(sx * 0.1, 0.16, -0.1), V(sx * 0.11, 0.2, -0.4), V(sx * 0.12, 0.42, -0.5), V(sx * 0.12, 0.62, -0.4)], 0.022, 32), M.satin);
    add(new THREE.BoxGeometry(0.035, 0.06, 0.42).translate(0, 0, -0.21), M.satin, V(sx * 0.15, 0.33, -0.42), [0.02, 0, 0]); // 스윙암
  }
  add(new THREE.BoxGeometry(0.02, 0.05, 0.5), M.satin, V(0.165, 0.39, -0.58), [0.17, 0, 0]); // 벨트(왼쪽, 사진의 검은 사선)
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.34, 8).rotateZ(Math.PI / 2), M.chrome, V(0, R, -AX)); // 뒤 차축
  add(new THREE.SphereGeometry(1, 14, 10).scale(0.03, 0.12, 0.2), M.paint, V(0.11, 0.53, -0.3)); // 사이드 커버
  add(new THREE.SphereGeometry(1, 14, 10).scale(0.03, 0.12, 0.2), M.paint, V(-0.11, 0.53, -0.3));

  // ---- V-트윈 엔진 (45° V, 검정 핀 + 크롬 로커커버) ----
  const finG = new THREE.CylinderGeometry(0.095, 0.1, 0.25, 20, 1, false);
  const cyl = (z, tilt) => {
    const g = new THREE.Group(); g.position.set(0, 0.43, z); g.rotation.x = tilt; body.add(g);
    add(finG, [M.eng, M.engDark, M.engDark], V(0, 0.125, 0), null, g);
    add(new THREE.BoxGeometry(0.21, 0.07, 0.2), M.engDark, V(0, 0.28, 0), null, g); // 헤드
    add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.11, 0.06, 0.11), M.chrome, V(0, 0.315, 0), null, g); // 로커커버
    return g;
  };
  cyl(0.17, 0.39); cyl(-0.02, -0.39);
  add(new THREE.SphereGeometry(1, 20, 14).scale(0.15, 0.13, 0.2), M.alu, V(0, 0.33, 0.07)); // 크랭크케이스
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20).rotateZ(Math.PI / 2), M.chrome, V(0.15, 0.33, 0.14)); // 타이머 커버
  add(new THREE.BoxGeometry(0.2, 0.16, 0.2), M.engDark, V(0, 0.36, -0.24)); // 미션
  // 왼쪽 프라이머리 커버(크롬 빈 모양) + 더비 커버
  add(new THREE.SphereGeometry(1, 24, 14).scale(0.06, 0.12, 0.27), M.chrome, V(0.135, 0.29, -0.16), [0.12, 0, 0]);
  add(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 24).rotateZ(Math.PI / 2), M.chrome, V(0.19, 0.29, -0.06));
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20).rotateZ(Math.PI / 2), M.chrome, V(0.17, 0.25, 0.04));
  // 오른쪽 에어클리너(크롬 원판)
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.055, 28).rotateZ(Math.PI / 2), M.chrome, V(-0.15, 0.52, 0.08));
  add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2).scale(0.025, 0.08, 0.08), M.chrome, V(-0.178, 0.52, 0.08));
  add(new THREE.TorusGeometry(0.105, 0.006, 6, 28).rotateY(Math.PI / 2), M.engDark, V(-0.179, 0.52, 0.08));
  add(new THREE.SphereGeometry(1, 12, 8).scale(0.04, 0.07, 0.06), M.satin, V(0.09, 0.52, -0.05)); // 혼/스로틀바디

  // ---- 배기(오른쪽, 크롬 2-into-1 + 머플러) ----
  add(tube([V(-0.04, 0.6, 0.3), V(-0.1, 0.48, 0.38), V(-0.17, 0.28, 0.3), V(-0.2, 0.22, 0.05), V(-0.21, 0.24, -0.2)], 0.024, 30), M.chrome);
  add(tube([V(-0.06, 0.6, -0.12), V(-0.17, 0.5, -0.14), V(-0.21, 0.34, -0.17), V(-0.215, 0.26, -0.28)], 0.022, 24), M.chrome);
  const muf = add(new THREE.CylinderGeometry(0.068, 0.072, 0.62, 20).rotateX(Math.PI / 2), M.chrome, V(-0.225, 0.275, -0.58), [-0.08, 0, 0]);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16).rotateX(Math.PI / 2), M.engDark, V(-0.225, 0.3, -0.895), [-0.08, 0, 0]); // 팁 안쪽
  void muf;
  const exhaust = new THREE.Object3D(); exhaust.position.set(-0.225, 0.3, -0.92); body.add(exhaust); // 연기 발생 지점

  // ---- 발판(플로어보드) + 페달 ----
  for (const sx of [1, -1]) {
    add(new THREE.BoxGeometry(0.11, 0.022, 0.28), M.rubberPlain, V(sx * 0.31, 0.3, 0.34), [0.12, 0, 0]);
    add(new THREE.BoxGeometry(0.12, 0.012, 0.29), M.chrome, V(sx * 0.31, 0.285, 0.34), [0.12, 0, 0]);
    add(tube([V(sx * 0.12, 0.25, 0.25), V(sx * 0.25, 0.28, 0.32)], 0.012, 4, 6), M.chrome);
  }
  add(tube([V(0.3, 0.32, 0.47), V(0.25, 0.36, 0.5), V(0.19, 0.3, 0.36)], 0.01, 8, 6), M.chrome); // 시프터
  // 킥스탠드(왼쪽) — 주차 중일 때만
  const stand = add(new THREE.CylinderGeometry(0.012, 0.014, 0.36, 8), M.satin, V(0.2, 0.13, 0.02), [0, 0, 0.95]);

  // 범퍼 높이 체크용 그림자 받는 자체는 지면이 처리
  root.userData = { lean, wheelie, wheelieFrame, body, steer, frontSpin, rearSpin, grips, exhaust, stand, tail: [tailC], tankMeshes: [tankTop, tankBot], tankColor, up };
  return root;
}
export function setBikeBrake(bike, on, M = shared?.M) { if (!M) return; for (const t of bike.userData.tail) t.material = on ? M.tailOn : M.tail; }
export function setBikeTankColor(bike, tankColor = 'black', M = shared?.M) {
  if (!M || !bike?.userData?.tankMeshes) return;
  const key = tankColor === 'red' ? 'red' : 'black';
  const mat = key === 'red' ? M.paintRed : M.paint;
  for (const m of bike.userData.tankMeshes) m.material = mat;
  bike.userData.tankColor = key;
}
