// [gyeongbu-bus] 서울요금소(서울TG). 성남시 분당구 궁내동 — 경부 본선, 판교IC 남쪽.
//   좌표는 공개 지도(37°21′54.57″N 127°6′12.06″E)를 정자 원점(37.3665, 127.10835)에 투영한 값.
//   부스 수·캐노피 크기는 게임 안 경부 차선(약 4차로 + 양쪽 연결로, 중심 간격 ~86m)에 맞춘 규칙 배치이다.
//   OSM 지붕 윤곽을 그대로 따라 그린 것은 아니다. 한국도로공사·하이패스 로고는 쓰지 않는다.
//   9004·1151 판교→강남 경로는 판교IC에서 북쪽으로 합류하므로 이 요금소를 지나지 않는다(정차하지 않음).
//   ?seoultg=0 이면 만들지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { watchEvening } from '../evening.js';

export const SEOUL_TG = Object.freeze({
  lat: 37.365158,
  lon: 127.10335,
  x: -442.4,
  z: 148.3,
  source: '궁내동 서울요금소 공개 좌표(위키·지도). 투영은 projectLatLon과 같음.',
});

export function seoulTollEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('seoultg') !== '0';
}

const COL = {
  canopy: '#e6e8ec', canopyEdge: '#9aa3ad', canopyUnder: '#c5cad1',
  island: '#d6d2c7', booth: '#eef1f4', glass: '#7ea2bf',
  pole: '#8a929b', barrier: '#c4c8ce', lamp: '#fff2c8',
  hipass: '#125a3a', general: '#1d4ed8', asphalt: '#5c6168',
};

function painted(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function boxAt(w, h, d, x, y, z, ang = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ang) g.rotateY(ang);
  g.translate(x, y, z);
  return g;
}

export function mountSeoulToll(scene, search = typeof location !== 'undefined' ? location.search : '') {
  if (!seoulTollEnabled(search)) return null;
  const { x: CX, z: CZ } = SEOUL_TG;
  const day = [], night = [];
  const add = (geo, color) => { if (geo) day.push(painted(geo, color)); };

  // 캐노피: 도로를 가로지르는 동쪽-서쪽 지붕 (교통은 남북)
  const canopyW = 108, canopyD = 26, thick = 1.15, under = 5.55;
  add(boxAt(canopyW, thick, canopyD, CX, under + thick / 2, CZ), COL.canopy);
  add(boxAt(canopyW + 0.6, 0.35, canopyD + 0.6, CX, under + thick + 0.05, CZ), COL.canopyEdge);
  add(boxAt(canopyW - 1.2, 0.08, canopyD - 1.2, CX, under - 0.05, CZ), COL.canopyUnder);
  night.push(painted(boxAt(canopyW - 4, 0.07, 1.1, CX, under - 0.08, CZ), COL.lamp));
  night.push(painted(boxAt(canopyW - 4, 0.07, 1.1, CX, under - 0.08, CZ - 7), COL.lamp));
  night.push(painted(boxAt(canopyW - 4, 0.07, 1.1, CX, under - 0.08, CZ + 7), COL.lamp));

  // 기둥: 캐노피 남북 가장자리
  for (let i = -5; i <= 5; i++) {
    const px = CX + i * 9.5;
    for (const sz of [CZ - 11.2, CZ + 11.2]) {
      add(boxAt(0.55, under - 0.2, 0.55, px, (under - 0.2) / 2, sz), COL.pole);
    }
  }

  // 부스·섬. 중앙(본선, x≈-438·-460)은 하이패스, 바깥은 일반. 차단기는 올려 두어 차가 막히지 않게.
  const xs = [];
  for (let i = -6; i <= 6; i++) xs.push(CX + i * 7.6);
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  const loadTex = (file) => {
    const tex = new THREE.TextureLoader().load(`${base}corridor/gyeongbu/${file}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const hipassTex = loadTex('sign-hipass.png');
  const generalTex = loadTex('sign-general.png');
  const hipassMat = new THREE.MeshBasicMaterial({ map: hipassTex });
  const generalMat = new THREE.MeshBasicMaterial({ map: generalTex });
  const signs = new THREE.Group();

  xs.forEach((bx, i) => {
    const inner = Math.abs(bx - CX) < 22; // 본선·중앙 쪽 = 하이패스
    add(boxAt(1.15, 0.28, 5.2, bx, 0.22, CZ), COL.island);
    add(boxAt(1.35, 2.35, 2.15, bx, 0.35 + 1.175, CZ), COL.booth);
    add(boxAt(1.42, 0.85, 0.12, bx, 1.85, CZ + (bx < CX ? 1.15 : -1.15)), COL.glass);
    night.push(painted(boxAt(1.38, 0.8, 2.2, bx, 1.85, CZ), COL.lamp));
    add(boxAt(0.45, under - 0.4, 0.45, bx, 0.3 + (under - 0.4) / 2, CZ), COL.pole);
    if (!inner) {
      // 일반 차단기 팔은 1.55m 높이에 올려 두어 NPC가 밑으로 지나간다(시각만, 충돌 없음).
      add(boxAt(3.2, 0.11, 0.11, bx + 1.7, 1.55, CZ), COL.barrier);
    }
    // 노란 섬 끝 — 접근 방향에서 차로가 갈라져 보이게
    add(boxAt(1.15, 0.32, 0.38, bx, 0.24, CZ - 2.55), '#f5c518');
    add(boxAt(1.15, 0.32, 0.38, bx, 0.24, CZ + 2.55), '#f5c518');
    // 남북 양쪽에 차로 표지(하이패스/일반). 교통은 남북이므로 표지도 그 방향을 본다.
    for (const [sz, rot] of [[CZ + canopyD / 2 + 0.12, 0], [CZ - canopyD / 2 - 0.12, Math.PI]]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.62), inner ? hipassMat : generalMat);
      board.position.set(bx, under - 0.55, sz);
      board.rotation.y = rot;
      signs.add(board);
      if (inner && Math.abs(bx - CX) < 10) {
        const bus = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.4), new THREE.MeshBasicMaterial({ map: loadTex('sign-bus.png') }));
        bus.position.set(bx, under - 1.05, sz);
        bus.rotation.y = rot;
        signs.add(bus);
      }
    }
  });

  // 하이패스 차로 바닥(본선 안쪽 4개 간격). 규칙 배치.
  for (let i = -2; i < 2; i++) {
    add(boxAt(5.8, 0.045, 24, CX + (i + 0.5) * 7.6, 0.11, CZ), '#2a4a7a');
  }

  // 캐노피 남북 파사드에 원작 표지. 운영사·브랜드 로고는 쓰지 않는다.
  const fasciaTex = loadTex('sign-toll.png');
  const fasciaMat = new THREE.MeshBasicMaterial({ map: fasciaTex, side: THREE.DoubleSide });
  for (const [sz, rot] of [[CZ + canopyD / 2 + 0.14, 0], [CZ - canopyD / 2 - 0.14, Math.PI]]) {
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.55), fasciaMat);
    fascia.position.set(CX, under + thick + 0.95, sz);
    fascia.rotation.y = rot;
    signs.add(fascia);
  }

  // 접근부 짧은 섬 라인(차로 안내)
  for (const sz of [CZ - 18, CZ + 18]) {
    for (let i = -6; i <= 6; i++) add(boxAt(0.35, 0.22, 2.4, CX + i * 7.6, 0.18, sz), COL.island);
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const prepared = day.map((x) => {
    const y = x.index ? x.toNonIndexed() : x;
    for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'color'].includes(k)) y.deleteAttribute(k);
    return y;
  });
  const body = new THREE.Mesh(mergeGeometries(prepared), mat);
  body.name = 'seoulTollBody';
  body.receiveShadow = true;
  body.castShadow = true;

  const g = new THREE.Group();
  g.name = 'seoulToll';
  g.add(body);
  g.add(signs);

  let glow = null;
  if (night.length) {
    const np = night.map((x) => {
      const y = x.index ? x.toNonIndexed() : x;
      for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'color'].includes(k)) y.deleteAttribute(k);
      return y;
    });
    glow = new THREE.Mesh(mergeGeometries(np), new THREE.MeshBasicMaterial({ vertexColors: true }));
    glow.name = 'seoulTollGlow';
    glow.visible = false;
    g.add(glow);
  }
  for (const x of day) x.dispose();
  for (const x of night) x.dispose();

  const unwatch = watchEvening((v) => { if (glow) glow.visible = v; });
  scene.add(g);
  return {
    group: g, body, glow,
    dispose() {
      unwatch();
      body.geometry.dispose(); mat.dispose();
      if (glow) { glow.geometry.dispose(); glow.material.dispose(); }
      g.removeFromParent();
    },
  };
}
