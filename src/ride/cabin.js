// [ride] 탈 수 있는 버스: 라이브/코리더와 같은 createBus 모델에 (1) 반투명 창문 (2) 실내 바닥·좌석 을 더한 복제본.
//   - 원본 모델/텍스처 캐시는 건드리지 않는다(캔버스를 복사해 창문 띠만 투명하게 만든 새 텍스처).
//   - 차체는 양면 렌더 → 밖에서는 창 너머로 승객이, 안(창가 1인칭)에서는 벽·창틀 너머로 바깥이 보인다.
//   - 좌석 좌표(seats)는 차체 로컬(앞 = +z, 문 = -x). 좌석 번호는 모든 클라이언트에서 같다(동기화에 사용).
import * as THREE from 'three';
import { createBus } from '../transit/busModel.js';
import { liveryOf } from '../transit/livery.js';

// busModel.js BODY 와 같은 값(창문 띠 위치만 필요). 원본 파일을 바꾸지 않으려고 복제.
const WIN = { city: { winB: 0.36, winT: 0.86, floor: 0.32, H: 3.15, W: 2.5 }, coach: { winB: 0.46, winT: 0.86, floor: 0.45, H: 3.5, W: 2.5 }, mini: { winB: 0.38, winT: 0.86, floor: 0.32, H: 2.95, W: 2.3 } };
const glassCache = new Map();

function glassTex(src, rects) {
  const img = src.image; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,0.62)';
  for (const [l, t, w, h] of rects) x.fillRect(l, t, w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
}

const seatMat = new THREE.MeshLambertMaterial({ color: '#3b5f8a' });
const floorMat = new THREE.MeshLambertMaterial({ color: '#5d646b' });
const poleMat = new THREE.MeshLambertMaterial({ color: '#f2c230' });

export function createRideBus(ref, type, name = '') {
  const g = createBus(ref, type, name);
  const body = g.children[0];
  const lvBody = liveryOf(type).body, b = WIN[lvBody] || WIN.city;
  const L = g.userData.L, W = b.W, bodyH = b.H - b.floor;
  // 반투명 창(옆 2면 + 앞유리 + 뒤창)
  const key = ref + '|' + type;
  if (!glassCache.has(key)) {
    const m = body.material;
    const side = (tx) => { const H = tx.image.height, Wd = tx.image.width; const Y = (v) => (1 - v) * H; return glassTex(tx, [[0, Y(b.winT), Wd, Y(b.winB) - Y(b.winT)]]); };
    const front = (tx) => { const H = tx.image.height, Wd = tx.image.width; const Y = (v) => (1 - v) * H; return glassTex(tx, [[12, Y(0.87), Wd - 24, Y(lvBody === 'coach' ? 0.5 : 0.36) - Y(0.87)]]); };
    const rear = (tx) => { const H = tx.image.height, Wd = tx.image.width; const Y = (v) => (1 - v) * H; return glassTex(tx, [[30, Y(0.86), Wd - 60, Y(0.62) - Y(0.86)]]); };
    glassCache.set(key, [side(m[0].map), side(m[1].map), front(m[4].map), rear(m[5].map)]);
  }
  const [gl, gr, gf, gb] = glassCache.get(key);
  const mk = (map) => new THREE.MeshLambertMaterial({ map, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const roof = body.material[2].clone(); roof.side = THREE.DoubleSide;
  body.material = [mk(gl), mk(gr), roof, body.material[3], mk(gf), mk(gb)];
  const own = g.userData.own; // [memory] disposeBus 가 함께 해제(창 텍스처는 glassCache 공유라 제외)
  if (own) for (const m of body.material) if (!own.mats.includes(m)) own.mats.push(m);
  body.renderOrder = 2; body.castShadow = true;
  // 저녁 실내등 판(불투명)은 창을 가리므로 숨김(헤드램프 등 다른 조명은 그대로)
  g.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial && o.material.color?.getHex() === 0xffe3b8) o.visible = false; });
  // 실내: 바닥 + 좌석(앞을 보는 2+2 배열, 문 구간 비움) + 손잡이 기둥
  const inner = new THREE.Group(); inner.name = 'rideCabin';
  const fl = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.04, L - 0.3), floorMat); fl.position.y = b.floor + 0.02; inner.add(fl);
  const seats = [];
  const seatGeo = new THREE.BoxGeometry(0.46, 0.1, 0.44); seatGeo.translate(0, 0.42, 0);
  const backGeo = new THREE.BoxGeometry(0.46, 0.62, 0.08); backGeo.translate(0, 0.74, -0.24);
  const doorZ = [[L / 2 - 2.6, L / 2], [L * 0.0 - 0.9, L * 0.0 + 0.9]]; // 앞문·중문 근처(문 쪽 = -x)
  const xs = [W / 2 - 0.36, W / 2 - 0.84, -(W / 2 - 0.84), -(W / 2 - 0.36)]; // +x 창가, +x 통로, -x 통로, -x 창가
  for (let z = L / 2 - 3.0; z > -L / 2 + 0.8; z -= 0.86) {
    for (let k = 0; k < 4; k++) {
      if (k >= 2 && doorZ.some(([a, c]) => z > a && z < c)) continue;
      const pos = new THREE.Vector3(xs[k], b.floor, z);
      const s = new THREE.Mesh(seatGeo, seatMat); s.position.copy(pos); inner.add(s);
      const bk = new THREE.Mesh(backGeo, seatMat); bk.position.copy(pos); inner.add(bk);
      seats.push({ local: pos, window: k === 0 || k === 3, side: k < 2 ? 'left' : 'right' });
    }
  }
  for (const z of [L / 2 - 2.8, 0, -L / 2 + 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, bodyH, 6), poleMat); p.position.set(-0.2, b.floor + bodyH / 2, z); inner.add(p); }
  if (own) { const gs = new Set(); inner.traverse((o) => { if (o.isMesh) gs.add(o.geometry); }); own.geos.push(...gs); }
  g.add(inner);
  // 창가 좌석을 앞에서부터 우선(좌석 번호 고정)
  const order = seats.map((s, i) => i).sort((a, c) => (seats[c].window - seats[a].window) || (seats[c].local.z - seats[a].local.z));
  g.userData.ride = { seats, order, floor: b.floor, W, L, H: b.H, winY0: b.floor + bodyH * b.winB, winY1: b.floor + bodyH * b.winT };
  return g;
}
