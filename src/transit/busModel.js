// 로우폴리 절차적 버스 모델: 노선 유형별 차체(저상 시내 / 직행좌석 코치 / 마을 중형) + 캔버스 텍스처 도색
import * as THREE from 'three';
import { liveryOf } from './livery.js';
import { isEvening, watchEvening } from '../evening.js';
import { addVehicleLamp } from '../vehicleLights.js';

const BODY = {
  city:  { L: 11.0, W: 2.5, H: 3.15, floor: 0.32, winB: 0.36, winT: 0.86, pillar: 1.25, doors: [[0.05, 0.16], [0.55, 0.66]], wheels: [0.2, 0.74] },
  coach: { L: 12.0, W: 2.5, H: 3.5, floor: 0.45, winB: 0.46, winT: 0.86, pillar: 1.6, doors: [[0.03, 0.12]], wheels: [0.2, 0.76], bays: true },
  mini:  { L: 8.6, W: 2.3, H: 2.95, floor: 0.32, winB: 0.38, winT: 0.86, pillar: 1.1, doors: [[0.04, 0.15], [0.5, 0.6]], wheels: [0.2, 0.78] },
};
const texCache = new Map();
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

function led(x, text, cx, cy, size, w, h) {
  x.fillStyle = '#111'; x.fillRect(cx - w / 2, cy - h / 2, w, h);
  x.fillStyle = '#ffb21c'; x.font = `bold ${size}px "Noto Sans KR", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#ff8a00'; x.shadowBlur = 6; x.fillText(text, cx, cy + 1); x.shadowBlur = 0;
}

// 옆면. frontRight: 캔버스 오른쪽이 차량 앞쪽인지. doorSide: 승강문 쪽(우측)
function drawSide(ref, lv, b, frontRight, doorSide) {
  const W = 1024, H = 300, c = mk(W, H), x = c.getContext('2d');
  const X = (u) => (frontRight ? u : 1 - u) * W; // u: 0=뒤, 1=앞
  const Y = (v) => (1 - v) * H; // v: 0=바닥, 1=지붕
  const col = lv.color;
  if (lv.plain) { // 고속/시외: 흰 바탕 + 남색 띠
    x.fillStyle = '#f3f3f3'; x.fillRect(0, 0, W, H);
    x.fillStyle = lv.accent; x.fillRect(0, Y(0.3), W, H * 0.07); x.fillStyle = '#9aa6bf'; x.fillRect(0, Y(0.2), W, H * 0.03);
  } else {
    // G버스(2006~) 계열 단순화: 차체 전체 노선색 + 앞쪽 아래 흰색 스윕 + 지붕 라인
    x.fillStyle = col; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.beginPath(); x.moveTo(X(1), Y(0.0)); x.lineTo(X(0.42), Y(0.0));
    x.bezierCurveTo(X(0.58), Y(0.05), X(0.75), Y(0.22), X(1), Y(0.3)); x.closePath(); x.fill();
    if (lv.wave) { // M버스 물결무늬(파랑)
      x.strokeStyle = lv.accent; x.lineWidth = 9;
      for (let k = 0; k < 3; k++) { x.beginPath(); for (let u = 0; u <= 1.001; u += 0.02) { const yy = Y(0.17 + k * 0.06 + Math.sin(u * 9 + k) * 0.025); u ? x.lineTo(X(u), yy) : x.moveTo(X(u), yy); } x.stroke(); }
    }
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(lv === liveryOf('village') ? '마을버스' : 'G BUS', X(0.3), Y(0.17));
  }
  // 창문 띠 + 기둥
  x.fillStyle = '#1d2733'; x.fillRect(0, Y(b.winT), W, Y(b.winB) - Y(b.winT));
  x.fillStyle = 'rgba(160,200,230,0.25)'; x.fillRect(0, Y(b.winT), W, (Y(b.winB) - Y(b.winT)) * 0.35);
  x.fillStyle = lv.plain ? '#e8e8e8' : col;
  for (let m = 0; m < b.L; m += b.pillar) x.fillRect(X(m / b.L) - 5, Y(b.winT), 10, Y(b.winB) - Y(b.winT));
  // 문(우측)
  if (doorSide) for (const [u0, u1] of b.doors) {
    const a = X(1 - u1), d = X(1 - u0), l = Math.min(a, d), w = Math.abs(d - a);
    x.fillStyle = '#2a3542'; x.fillRect(l, Y(b.winT + 0.02), w, Y(b.floor * 0.2) - Y(b.winT + 0.02));
    x.strokeStyle = '#cfd6de'; x.lineWidth = 5; x.strokeRect(l + 3, Y(b.winT), w - 6, Y(b.floor * 0.2) - Y(b.winT));
    x.beginPath(); x.moveTo(l + w / 2, Y(b.winT)); x.lineTo(l + w / 2, Y(b.floor * 0.2)); x.stroke();
  } else { x.fillStyle = '#1d2733'; x.fillRect(X(0.92), Y(b.winT), X(1) - X(0.92), Y(b.winB - 0.12) - Y(b.winT)); }
  // 측면 LED 노선번호(앞문 근처 창 안)
  const u = doorSide ? 1 - (b.doors[0][1] + 0.08) : 0.82;
  led(x, ref, X(u), Y(b.winB + 0.1), 30, 120, 40);
  // 화물칸(코치)
  if (b.bays) { x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 3; for (const u0 of [0.3, 0.45, 0.6]) x.strokeRect(X(u0), Y(0.27), (frontRight ? 1 : -1) * W * 0.12, Y(0.06) - Y(0.27)); }
  // 휠하우스
  x.fillStyle = '#222';
  for (const uw of b.wheels) { x.beginPath(); x.arc(X(1 - uw), H, 0.62 / b.H * H, Math.PI, 0); x.fill(); }
  return tex(c);
}
function drawFront(ref, lv, b, name) {
  const W = 300, H = 380, c = mk(W, H), x = c.getContext('2d');
  const Y = (v) => (1 - v) * H;
  x.fillStyle = lv.plain ? '#f3f3f3' : lv.color; x.fillRect(0, 0, W, H);
  // 행선판
  led(x, `${ref}  ${name}`.slice(0, 14), W / 2, Y(0.93), 34, W * 0.9, 46);
  // 앞유리
  x.fillStyle = '#1d2733'; x.beginPath(); x.roundRect(12, Y(0.87), W - 24, Y(b.bays ? 0.5 : 0.36) - Y(0.87), 10); x.fill();
  x.fillStyle = 'rgba(170,210,240,0.25)'; x.fillRect(18, Y(0.86), W - 36, 30);
  if (b.bays) { x.fillStyle = lv.plain ? '#f3f3f3' : lv.color; x.fillRect(W / 2 - 3, Y(0.87), 6, Y(0.5) - Y(0.87)); }
  // 하단: 흰 범퍼 + 헤드램프
  x.fillStyle = lv.plain ? lv.accent : '#f4f4f4'; x.fillRect(0, Y(0.2), W, Y(0.0) - Y(0.2));
  x.fillStyle = '#fffbe0'; x.fillRect(16, Y(0.16), 56, 22); x.fillRect(W - 72, Y(0.16), 56, 22);
  x.fillStyle = '#333'; x.fillRect(W / 2 - 60, Y(0.06), 120, 26);
  x.fillStyle = '#fff'; x.font = 'bold 16px sans-serif'; x.textAlign = 'center'; x.fillText('경기 70자 ' + (1000 + (ref.length * 977) % 9000), W / 2, Y(0.06) + 19);
  return tex(c);
}
function drawRear(ref, lv, b) {
  const W = 300, H = 380, c = mk(W, H), x = c.getContext('2d');
  const Y = (v) => (1 - v) * H;
  x.fillStyle = lv.plain ? '#f3f3f3' : lv.color; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1d2733'; x.fillRect(30, Y(0.86), W - 60, Y(0.62) - Y(0.86));
  led(x, ref, W / 2, Y(0.52), 44, 160, 54);
  x.fillStyle = '#c0262d'; x.fillRect(14, Y(0.3), 40, 50); x.fillRect(W - 54, Y(0.3), 40, 50);
  x.fillStyle = '#333'; x.fillRect(0, Y(0.08), W, Y(0) - Y(0.08));
  return tex(c);
}

// [memory] 노선(ref|type)별 도색 텍스처는 참조 카운트로 관리한다. 살아 있는 버스(보이는 것·풀에 숨긴 것)가
//   하나라도 쓰면 절대 해제하지 않고, 아무도 안 쓰는 노선은 최근 사용 순으로 IDLE_MAX 개까지만 남긴다.
//   해제된 노선이 다시 나오면 같은 그리기 함수로 다시 만든다(결과 동일).
const IDLE_MAX = 12;
let useSeq = 0;
function textures(ref, type, name) {
  const k = ref + '|' + type;
  let e = texCache.get(k);
  if (!e) {
    const lv = liveryOf(type), b = BODY[lv.body];
    e = { left: drawSide(ref, lv, b, false, false), right: drawSide(ref, lv, b, true, true), front: drawFront(ref, lv, b, name), rear: drawRear(ref, lv, b), lv, b, refs: 0, used: 0, key: k };
    texCache.set(k, e);
  }
  e.used = ++useSeq;
  return e;
}
function freeEntry(e) {
  for (const t of [e.left, e.right, e.front, e.rear]) {
    t.dispose();
    const c = t.image; if (c && 'width' in c) { c.width = 0; c.height = 0; } // 캔버스 백킹 메모리 반환
    t.image = null;
  }
  texCache.delete(e.key);
}
function trimTextures() {
  const idle = [...texCache.values()].filter((e) => e.refs <= 0);
  if (idle.length <= IDLE_MAX) return;
  idle.sort((a, b) => a.used - b.used);
  for (let i = 0; i < idle.length - IDLE_MAX; i++) freeEntry(idle[i]);
}
export const busTextureStats = () => {
  let refd = 0, idle = 0; for (const e of texCache.values()) (e.refs > 0 ? refd++ : idle++);
  return { routes: texCache.size, inUse: refd, idle, idleMax: IDLE_MAX };
};
// 버스 하나가 만든 지오메트리·재질만 해제(공유 바퀴·허브·실내등 재질, 램프 공유 자원은 유지)하고 텍스처 참조를 돌려준다.
export function disposeBus(g) {
  const u = g?.userData; if (!u || u.disposed || !u.own) return;
  u.disposed = true;
  u.releaseLights?.(); u.releaseLights = null;
  g.removeFromParent();
  for (const x of u.own.geos) x.dispose();
  for (const x of u.own.mats) x.dispose();
  for (const x of u.own.texs || []) x.dispose();
  const e = texCache.get(u.texKey);
  if (e && e === u.texEntry) { e.refs--; trimTextures(); }
}

const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 10); wheelGeo.rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 8); hubGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: '#1b1b1b' }), hubMat = new THREE.MeshLambertMaterial({ color: '#b9bec4' });
const cabinMat = new THREE.MeshBasicMaterial({ color: '#ffe3b8' });

function addEveningLights(g, b, own) {
  const bodyH = b.H - b.floor;
  const band = b.winT - b.winB;
  const winH = bodyH * band * 0.88;
  const winY = b.floor + bodyH * (b.winB + band * 0.5);
  const lights = new THREE.Group();
  const sideGeo = new THREE.BoxGeometry(0.05, winH, b.L * 0.82); own.geos.push(sideGeo);
  for (const sx of [-1, 1]) {
    const pane = new THREE.Mesh(sideGeo, cabinMat);
    pane.position.set(sx * (b.W / 2 + 0.03), winY, -b.L * 0.02);
    lights.add(pane);
  }
  const frontWin = new THREE.Mesh(new THREE.BoxGeometry(b.W * 0.76, bodyH * band * 0.72, 0.045), cabinMat);
  frontWin.position.set(0, b.floor + bodyH * (b.winB + band * 0.52), b.L / 2 + 0.03);
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(b.W * 0.58, bodyH * band * 0.42, 0.045), cabinMat);
  rearWin.position.set(0, b.floor + bodyH * (b.winB + band * 0.62), -b.L / 2 - 0.03);
  own.geos.push(frontWin.geometry, rearWin.geometry);
  lights.add(frontWin, rearWin);
  const headY = b.floor + bodyH * 0.16;
  const tailY = b.floor + bodyH * 0.26;
  for (const sx of [-1, 1]) {
    addVehicleLamp(lights, {
      x: sx * b.W * 0.32, y: headY, z: b.L / 2 + 0.12, kind: 'head',
      lens: [0.72, 0.34], glow: [1.35, 0.78], beam: [7.2, 1.05],
    });
    addVehicleLamp(lights, {
      x: sx * b.W * 0.36, y: tailY, z: -b.L / 2 - 0.1, dir: -1, kind: 'tail',
      lens: [0.46, 0.26], glow: [0.82, 0.46], beam: [2.4, 0.42],
    });
  }
  lights.visible = isEvening();
  g.add(lights);
  return watchEvening((on) => { lights.visible = on; });
}

// 앞 = +z. 우측(승강문) = -x
export function createBus(ref, type, name = '') {
  const T = textures(ref, type, name), b = T.b, lv = T.lv;
  const g = new THREE.Group();
  const bodyH = b.H - b.floor;
  const roofCol = lv.plain ? '#e9e9e9' : new THREE.Color(lv.color).offsetHSL(0, -0.05, 0.05);
  const mats = [
    new THREE.MeshLambertMaterial({ map: T.left }), new THREE.MeshLambertMaterial({ map: T.right }),
    new THREE.MeshLambertMaterial({ color: roofCol }), new THREE.MeshLambertMaterial({ color: '#222' }),
    new THREE.MeshLambertMaterial({ map: T.front }), new THREE.MeshLambertMaterial({ map: T.rear }),
  ];
  const body = new THREE.Mesh(new THREE.BoxGeometry(b.W, bodyH, b.L), mats);
  body.position.y = b.floor + bodyH / 2; body.castShadow = true; g.add(body);
  // 지붕 에어컨/배터리 팩
  const pod = new THREE.Mesh(new THREE.BoxGeometry(b.W * 0.7, 0.28, b.L * (b.bays ? 0.25 : 0.45)), new THREE.MeshLambertMaterial({ color: '#d9dde2' }));
  pod.position.set(0, b.H + 0.14, b.bays ? -b.L * 0.1 : -b.L * 0.05); pod.castShadow = true; g.add(pod);
  // 하부 스커트
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(b.W * 0.92, b.floor, b.L * 0.96), new THREE.MeshLambertMaterial({ color: '#2b2f33' }));
  skirt.position.y = b.floor / 2 + 0.05; g.add(skirt);
  // 바퀴 (뒤 바퀴 코치는 복륜 느낌으로 2축)
  for (const u of b.wheels.concat(b.bays ? [b.wheels[0] + 0.1] : [])) for (const sx of [-1, 1]) {
    const z = (0.5 - u) * b.L * -1; // u: 앞에서부터 비율
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(sx * (b.W / 2 - 0.12), 0.5, (0.5 - u) * b.L); g.add(w);
    const h = new THREE.Mesh(hubGeo, hubMat); h.position.copy(w.position); h.position.x += sx * 0.01; g.add(h);
    void z;
  }
  // 사이드미러
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.18), wheelMat); m.position.set(sx * (b.W / 2 + 0.25), b.H - 0.7, b.L / 2 - 0.2); g.add(m); }
  // [memory] 이 버스가 직접 만든 자원 목록(disposeBus 가 해제). 공유 자원(wheelGeo/hubGeo/wheelMat/hubMat/cabinMat/램프)은 제외.
  const own = { geos: [], mats: [...mats], texs: [] };
  g.traverse((o) => { if (o.isMesh && o.geometry !== wheelGeo && o.geometry !== hubGeo) { own.geos.push(o.geometry); for (const m of [].concat(o.material)) if (m !== wheelMat && m !== hubMat && !own.mats.includes(m)) own.mats.push(m); } });
  const releaseLights = addEveningLights(g, b, own);
  T.refs++;
  g.userData = { L: b.L, type, ref, releaseLights, own, texKey: ref + '|' + type, texEntry: T };
  return g;
}
export const busLength = (type) => BODY[liveryOf(type).body].L;
