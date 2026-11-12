// [depot] 범창고 내부 (지연 로드 청크) — 실측 84×120 m 외피 + 상세 구역(파렛트 랙 통로 2개 3.35 m, 랙 4.57 m, 상단 재고) + 입구 카트 보관소.
//   1인칭(눈높이 1.6 m)으로 240L 카트를 밀고, 선반 상품을 집어 카트 윗바구니·아래 받침대·유아석에 놓는다.
//   물리: cannon-es (이 청크에만 들어감). 카트 좌표계 안에서 상품만 시뮬레이션하고, 카트 가속도는 관성력으로 넣는다.
//   카트 주행: m = 27 kg + 짐, 굴림 저항 Crr·m·g, 출발 힘 2배, 미는 힘 133 N(처음 222 N), 회전 관성 Σm·r² (기획안 식 1~3).
//   계란: 판 위 접촉점·면적으로 알마다 힘을 나눠, 알마다 뽑은 파괴 하중(34±6 N)을 넘으면 그 알만 깨짐.
import { touchText } from './touchText.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PRODUCTS, BY_ID, CART, EGG } from './products.js';
import { buildCartGeometry, BASKET } from './cartModel.js';
import { buildProductGeometry, addProductShape } from './shapes.js';
import { createStaff } from './staff.js';
import { registerStockProducts } from './stockCatalog.js';
import { buildDepotCeiling } from './ceiling.js';
import { mountStock } from './stock.js';
import { createCheckout } from './checkout.js';
import { mountElectronics } from './electronics.js';
import { createShoppers } from './npcs.js';
import NPC_TYPES from './story/data/npc-types.json';

const W = 84, D = 120, CEIL = 9;
const DOOR = { x: 69, w: 8 };
const CORRAL = { x0: 74, x1: 82, z0: 2.5, z1: 9 };
const RACK_D = 2.2, AISLE = 3.35, BAY = 2.7, BEAMS = [1.85, 3.2, 4.5], RACK_H = 4.57;
const DETAIL = { z0: 14, bays: 10 }; // 상세 구역: z 14 ~ 41
const RACK_X = [50, 50 + RACK_D + AISLE, 50 + 2 * (RACK_D + AISLE)]; // 랙 왼쪽 x (통로 A: 52.2~55.55, 통로 B: 57.75~61.1)
const EYE = 1.6;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function labelTex(p) {
  return canvasTex(512, 256, (g) => {
    // 왼쪽 반: 옆면 라벨, 오른쪽 반: 윗면
    g.fillStyle = p.color; g.fillRect(0, 0, 512, 256);
    if (p.kind === 'box' || p.kind === 'soft') { g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 3; g.strokeRect(4, 4, 248, 248); }
    g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 40px "Pretendard","Noto Sans KR",sans-serif'; g.fillText(p.name.split(' ')[0], 128, 92);
    g.font = '800 26px "Pretendard","Noto Sans KR",sans-serif'; g.fillText(p.name.split(' ').slice(1).join(' ') || p.sub, 128, 138);
    g.font = '700 20px "Pretendard","Noto Sans KR",sans-serif'; g.fillText(p.sub, 128, 176);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(40, 200, 176, 34); g.fillStyle = '#13203d'; g.font = '900 22px "Pretendard",sans-serif';
    g.fillText(`${p.kg} kg · ${p.price.toLocaleString('ko-KR')}원`, 128, 218);
    // 윗면
    if (p.kind === 'egg') {
      g.fillStyle = '#d9c08f'; g.fillRect(256, 0, 256, 256);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) { g.fillStyle = '#f6e7cf'; g.beginPath(); g.ellipse(256 + 24 + i * 42, 26 + j * 51, 17, 21, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.ellipse(256 + 28 + i * 42, 32 + j * 51, 9, 11, 0, 0, 7); g.fill(); }
    } else if (p.id === 'water' || p.id === 'soda') {
      g.fillStyle = p.id === 'water' ? '#9fd3f5' : '#3b0b0b'; g.fillRect(256, 0, 256, 256);
      const nx = p.id === 'water' ? 3 : 4, ny = p.id === 'water' ? 2 : 3;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { g.fillStyle = p.id === 'water' ? '#1e88e5' : '#d32f2f'; g.beginPath(); g.arc(256 + (i + 0.5) * 256 / nx, (j + 0.5) * 256 / ny, 22, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(256 + (i + 0.5) * 256 / nx - 6, (j + 0.5) * 256 / ny - 6, 6, 0, 7); g.fill(); }
    } else {
      g.fillStyle = p.color; g.fillRect(256, 0, 256, 256); g.fillStyle = p.ink; g.font = '900 44px "Pretendard",sans-serif'; g.fillText(p.name.split(' ')[0], 384, 128);
    }
  });
}
// 캔버스 라벨(512×256: 왼쪽 옆면 · 오른쪽 윗면) — 디자인 텍스처를 못 받았을 때만 씀
function boxGeoLabeledCanvas(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setX(i, f === 2 ? 0.5 + uv.getX(i) * 0.5 : uv.getX(i) * 0.5); }
  return g;
}
// 디자인 상품 아틀라스(1024²): 왼쪽 위 = 앞(±z) · 오른쪽 위 = 옆(±x) · 왼쪽 아래 = 윗면(±y) · 오른쪽 아래 = 예비(빈 계란판)
const QUAD = { front: [0, 0.5], side: [0.5, 0.5], top: [0, 0], spare: [0.5, 0] };
function boxGeoAtlas(sx, sy, sz, topQuad = 'top') {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv, e = 3 / 1024;
  const faceQ = ['side', 'side', topQuad, topQuad, 'front', 'front'];
  for (let f = 0; f < 6; f++) { const [u0, v0] = QUAD[faceQ[f]]; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, u0 + e + uv.getX(i) * (0.5 - 2 * e), v0 + e + uv.getY(i) * (0.5 - 2 * e)); } }
  return g;
}
const ASSET = `${import.meta.env?.BASE_URL || '/'}depot/`;
async function loadDepotTextures(renderer) {
  const tl = new THREE.TextureLoader(), maxAniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const names = ['pk-melon', 'pk-meat', 'pk-egg', 'pk-water', 'pk-rice', 'pk-tissue', 'pk-ramen', 'pk-chips', 'pk-soda', 'aisle-01', 'aisle-02', 'aisle-03', 'aisle-05', 'hang-eggs-dairy', 'hang-water-drinks', 'hang-rice-grain', 'hang-ramen-snack', 'hang-household', 'rack-safety', 'floor-cart-only', 'floor-forklift', 'floor-hazard', 'egg-crack-1', 'egg-crack-2', 'yolk-puddle'];
  const out = {};
  await Promise.all(names.map((n) => tl.loadAsync(`${ASSET}${n}.webp`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; out[n] = t; }).catch(() => { /* 없으면 캔버스 대체 */ })));
  return out;
}

export async function buildDepotInterior({ renderer, isMobile = false, onExit, audio: audioIn = null, getAudioLevel = null } = {}) {
  // [depot-story] 오디오 탭: 매장 소리 이름(cart-grab·item-pick…)을 스토리 반응 감지로도 흘림. 공유 audio 객체는 건드리지 않고 감쌈.
  const audioTaps = [];
  const tap = (n, o) => { for (const f of audioTaps) { try { f(n, o || {}); } catch (e) { console.warn('[depot-story]', e); } } };
  const audio = audioIn ? Object.assign(Object.create(audioIn), { play: (n, o) => { tap(n, o); return audioIn.play(n, o); } }) : null;
  const audioOrTap = audio || { play: (n, o) => { tap(n, o); return false; } };
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const TX = await loadDepotTextures(renderer); for (const t of Object.values(TX)) keep(t);
  registerStockProducts();
  const boxGeoLabeled = (sx, sy, sz, q) => (TX['pk-egg'] ? boxGeoAtlas(sx, sy, sz, q) : boxGeoLabeledCanvas(sx, sy, sz));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 200);
  camera.rotation.order = 'YXZ';

  // ---------- 바닥·벽·천장 ----------
  const floorTex = keep(canvasTex(512, 512, (g) => {
    g.fillStyle = '#b9bcbf'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,60,60'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
    g.strokeStyle = 'rgba(70,70,70,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, 512, 512);
  }));
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(W / 6, D / 6);
  const floorM = keep(new THREE.MeshLambertMaterial({ map: floorTex }));
  const floorG = keep(new THREE.PlaneGeometry(W, D)); floorG.rotateX(-Math.PI / 2); floorG.translate(W / 2, 0, D / 2);
  scene.add(new THREE.Mesh(floorG, floorM));
  // 통로 바닥 노란 안전선
  const lineM = keep(new THREE.MeshBasicMaterial({ color: 0xf2b705 }));
  const lineG = keep(new THREE.PlaneGeometry(0.1, 1)); lineG.rotateX(-Math.PI / 2);
  const lines = new THREE.InstancedMesh(lineG, lineM, 8); const m4 = new THREE.Matrix4();
  let li = 0;
  for (const x of [RACK_X[0] + RACK_D + 0.15, RACK_X[1] - 0.15, RACK_X[1] + RACK_D + 0.15, RACK_X[2] - 0.15]) { m4.compose(new THREE.Vector3(x, 0.004, DETAIL.z0 + 13.5), new THREE.Quaternion(), new THREE.Vector3(1, 1, 27)); lines.setMatrixAt(li++, m4); }
  for (const z of [10.5, 12.0]) { m4.compose(new THREE.Vector3(57, 0.004, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 30)); lines.setMatrixAt(li++, m4); }
  lines.count = li; scene.add(lines);
  const wallM = keep(new THREE.MeshLambertMaterial({ color: 0x8b9298, side: THREE.BackSide }));
  const shellG = keep(new THREE.BoxGeometry(W, CEIL, D)); shellG.translate(W / 2, CEIL / 2 - 0.05, D / 2); // 바닥면과 z-fighting 방지
  const shellMesh = new THREE.Mesh(shellG, wallM); scene.add(shellMesh);
  const ceiling = buildDepotCeiling(scene, { renderer, keep, shellMesh });
  // 벽 구역 간판 (신선·냉동 등) — 실제 매장 동선 그림
  const zoneSign = (text, sub, x, z, ry, w = 14) => {
    const t = keep(canvasTex(1024, 256, (g) => { g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 1024, 256); g.fillStyle = '#F2C230'; g.fillRect(0, 214, 1024, 42); g.fillStyle = '#F3EADA'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 120px "Pretendard","Noto Sans KR",sans-serif'; g.fillText(text, 512, 100); g.fillStyle = '#123B2D'; g.font = '800 30px "Pretendard",sans-serif'; g.fillText(sub, 512, 236); }));
    const m = keep(new THREE.MeshBasicMaterial({ map: t })); const gg = keep(new THREE.PlaneGeometry(w, w / 4));
    const s = new THREE.Mesh(gg, m); s.position.set(x, 6.6, z); s.rotation.y = ry; scene.add(s);
  };
  zoneSign('신선·정육', 'FRESH MEAT · DAIRY · EGGS', 30, D - 0.1, Math.PI, 18);
  zoneSign('냉동', 'FROZEN', W - 0.1, 50, -Math.PI / 2, 12);
  zoneSign('범창고 BUMP DEPOT', '정자점 · 회원 아니어도 OK', 40, 0.1, 0, 22);

  // ---------- 파렛트 랙 (전 매장 인스턴스) ----------
  const upM = keep(new THREE.MeshLambertMaterial({ color: 0x4a5a6a })); // 랙 블루그레이 기둥 (팔레트 #4A5A6A, 주황 X)
  const beamM = keep(new THREE.MeshLambertMaterial({ color: 0x5c6d7e })); // 블루그레이 빔 (기둥보다 한 톤 밝게)
  const palM = keep(new THREE.MeshLambertMaterial({ color: 0xb08a58 }));
  const wrapM = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 }));
  const upG = keep(new THREE.BoxGeometry(0.09, RACK_H, 0.09)); upG.translate(0, RACK_H / 2, 0);
  const beamG = keep(new THREE.BoxGeometry(BAY, 0.13, 0.06));
  const palG = keep(new THREE.BoxGeometry(1.219, 0.14, 1.016)); palG.translate(0, 0.07, 0);
  const wrapG = keep(new THREE.BoxGeometry(1.16, 1.0, 0.98)); wrapG.translate(0, 0.5, 0);
  const racks = []; // {x0, z0, bays} 랙 한 줄
  for (const x of RACK_X) { racks.push({ x0: x, z0: DETAIL.z0, bays: DETAIL.bays, detail: true }); racks.push({ x0: x, z0: 47, bays: 10 }); }
  for (let k = 0; k < 6; k++) for (const z0 of [14, 47, 80]) racks.push({ x0: 14 + k * (RACK_D + AISLE), z0, bays: 10 });
  for (const z0 of [80]) for (const x of RACK_X) racks.push({ x0: x, z0, bays: 10 });
  let nUp = 0, nBeam = 0, nPal = 0, nWrap = 0;
  for (const r of racks) { nUp += (r.bays + 1) * 2; nBeam += r.bays * 2 * BEAMS.length; nPal += r.bays * 2 * 2 * 3; nWrap += r.bays * 2 * 2 * (r.detail ? 2 : 3); }
  const ups = new THREE.InstancedMesh(upG, upM, nUp), beams = new THREE.InstancedMesh(beamG, beamM, nBeam), pals = new THREE.InstancedMesh(palG, palM, nPal), wraps = new THREE.InstancedMesh(wrapG, wrapM, nWrap);
  const wrapTint = [0xf5f1e6, 0xe3eef8, 0xf8e6e1, 0xe9f3e2, 0xf3ecd8, 0xeee6f6];
  const col = new THREE.Color(), q0 = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  let iu = 0, ib = 0, ip = 0, iw = 0;
  const obstacles = []; // 2D AABB {x0,x1,z0,z1}
  const sellSlots = []; // 상세 랙 판매 파렛트 자리 {x, z, face(+1 동쪽 통로 / -1 서쪽)}
  for (const r of racks) {
    const len = r.bays * BAY;
    obstacles.push({ x0: r.x0, x1: r.x0 + RACK_D, z0: r.z0, z1: r.z0 + len });
    for (let b = 0; b <= r.bays; b++) for (const side of [0, 1]) { m4.makeTranslation(r.x0 + 0.05 + side * (RACK_D - 0.1), 0, r.z0 + b * BAY); ups.setMatrixAt(iu++, m4); }
    for (let b = 0; b < r.bays; b++) {
      const zc = r.z0 + b * BAY + BAY / 2;
      for (const side of [0, 1]) {
        const x = r.x0 + (side ? RACK_D - 0.03 : 0.03);
        for (const y of BEAMS) { m4.compose(pv.set(x, y, zc), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), s1); beams.setMatrixAt(ib++, m4); }
        const px = r.x0 + (side ? RACK_D - 0.55 : 0.55); // 파렛트 중심 (깊이 1.016)
        for (const dz of [-0.64, 0.64]) {
          const z = zc + dz;
          const levels = [0, BEAMS[0] + 0.07, BEAMS[1] + 0.07];
          for (let lv = 0; lv < 3; lv++) {
            m4.compose(pv.set(px, levels[lv], z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), s1); pals.setMatrixAt(ip++, m4);
            if (lv === 0 && r.detail) { sellSlots.push({ x: px, z, face: side ? 1 : -1, y: 0.14 }); continue; }
            const h = lv === 0 ? 1.3 : 1.15;
            m4.compose(pv.set(px, levels[lv] + 0.14, z), q0, new THREE.Vector3(1, h, 1)); wraps.setMatrixAt(iw, m4);
            col.setHex(wrapTint[(iw * 7 + lv) % wrapTint.length]); wraps.setColorAt(iw, col); iw++;
          }
        }
      }
    }
  }
  ups.count = iu; beams.count = ib; pals.count = ip; wraps.count = iw;
  scene.add(ups, beams, pals, wraps);
  ceiling.addRackAO?.(racks, RACK_D, BAY);
  // 벽(바깥 테두리)·계산대 자리도 장애물
  obstacles.push({ x0: -1, x1: 0.3, z0: 0, z1: D }, { x0: W - 0.3, x1: W + 1, z0: 0, z1: D }, { x0: 0, x1: W, z0: -1, z1: 0.3 }, { x0: 0, x1: W, z0: D - 0.3, z1: D + 1 });

  // ---------- 상품 (카트에 담을 때 쓸 상세 지오메트리 + 매장 진열은 stock.js 가 InstancedMesh·LOD 로) ----------
  const prodMeshes = [];
  const productGeo = (p) => buildProductGeometry(p, { boxGeo: boxGeoLabeled });
  const addPhysShape = (body, p) => addProductShape(body, p, CANNON);
  const prodGeo = {}, prodMat = {}; // 가전 코너(electronics.js)가 가전 박스는 직접 넣고, 구매 카드(ticket_*) 등은 여기 것을 씀
  for (const p of PRODUCTS) if (p.kind === 'ticket') prodGeo[p.id] = keep(productGeo(p));
  for (const p of PRODUCTS) { const t = TX[`pk-${p.tex || p.id}`] || keep(labelTex(p)); prodMat[p.id] = keep(new THREE.MeshLambertMaterial({ map: t })); }
  const stock = mountStock({ scene, keep, canvasTex, TX, racks, obstacles, wraps, boxGeoLabeled, isMobile });
  prodMeshes.push(...stock.prodMeshes);

  // ---------- 디자인 사인 (통로 번호 · 천장 걸이 · 랙 끝 안전 표지 · 바닥 스텐실) ----------
  const AISLE_C = [RACK_X[0] + RACK_D + AISLE / 2, RACK_X[1] + RACK_D + AISLE / 2];
  const signPlane = (tex, w, h, x, y, z, ry, { alpha = false, floor = false } = {}) => {
    if (!tex) return null;
    const m = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: alpha ? 0.5 : 0, polygonOffset: floor, polygonOffsetFactor: floor ? -2 : 0, polygonOffsetUnits: floor ? -2 : 0 }));
    const g = keep(new THREE.PlaneGeometry(w, h)); if (floor) g.rotateX(-Math.PI / 2);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o;
  };
  // 통로 번호: 랙 위(입구 쪽·안쪽 양면)
  [['aisle-01', AISLE_C[0]], ['aisle-02', AISLE_C[1]]].forEach(([n, x]) => {
    signPlane(TX[n], 2.6, 1.3, x, 5.4, DETAIL.z0 - 0.05, Math.PI); // 입구에서 보이는 면
    signPlane(TX[n], 2.6, 1.3, x, 5.4, DETAIL.z0 - 0.0, 0); // 통로 안에서 보이는 면 (반대쪽 끝에서 돌아볼 때)
  });
  signPlane(TX['aisle-03'], 2.6, 1.3, RACK_X[2] + RACK_D + AISLE / 2, 5.4, DETAIL.z0 - 0.05, Math.PI);
  signPlane(TX['aisle-05'], 2.6, 1.3, RACK_X[0] - AISLE / 2, 5.4, DETAIL.z0 - 0.05, Math.PI);
  // 천장 걸이 카테고리 사인 (양면 = 같은 텍스처 두 장)
  for (const [n, x, z] of [['hang-water-drinks', AISLE_C[0], 18.5], ['hang-eggs-dairy', AISLE_C[0], 28], ['hang-ramen-snack', AISLE_C[0], 37], ['hang-rice-grain', AISLE_C[1], 21], ['hang-household', AISLE_C[1], 33]]) {
    signPlane(TX[n], 3.2, 0.8, x, 6.1, z, 0, { alpha: true }); signPlane(TX[n], 3.2, 0.8, x, 6.1, z - 0.01, Math.PI, { alpha: true });
  }
  // 랙 끝 안전 표지 '위층 재고는 지게차가 꺼내요'
  for (const x of RACK_X) signPlane(TX['rack-safety'], 0.55, 1.1, x + RACK_D / 2, 1.55, DETAIL.z0 - 0.08, Math.PI);
  // 바닥 스텐실
  signPlane(TX['floor-cart-only'], 3.2, 1.6, 71.5, 0.006, 12.6, 0, { alpha: true, floor: true });
  signPlane(TX['floor-forklift'], 2.8, 2.8, 57, 0.006, 44, Math.PI, { alpha: true, floor: true });
  if (TX['floor-hazard']) { const t = TX['floor-hazard']; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(16, 1); signPlane(t, CORRAL.x1 - CORRAL.x0, 0.45, (CORRAL.x0 + CORRAL.x1) / 2, 0.006, CORRAL.z1 + 0.5, 0, { alpha: true, floor: true }); }

  // ---------- 카트 ----------
  const cg = buildCartGeometry(); keep(cg.wire); keep(cg.red); keep(cg.dark);
  const wireM = keep(new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.75, roughness: 0.32 }));
  const redM = keep(new THREE.MeshLambertMaterial({ color: 0xd8262c }));
  const darkM = keep(new THREE.MeshLambertMaterial({ color: 0x2b2d31 }));
  const cart = new THREE.Group(); cart.name = 'depot-cart';
  cart.add(new THREE.Mesh(cg.wire, wireM), new THREE.Mesh(cg.red, redM), new THREE.Mesh(cg.dark, darkM));
  const itemsRoot = new THREE.Group(); cart.add(itemsRoot);
  scene.add(cart);
  // 내 카트 표시(손 놓았을 때만): 위에 초록 화살표 + 바닥 링
  const markM = keep(new THREE.MeshBasicMaterial({ color: 0x2fd27a, transparent: true, opacity: 0.85, depthWrite: false }));
  const arrowG = keep(new THREE.ConeGeometry(0.12, 0.26, 4)); arrowG.rotateX(Math.PI); // 아래를 가리킴
  const ringG = keep(new THREE.RingGeometry(0.78, 0.86, 40)); ringG.rotateX(-Math.PI / 2);
  const marker = new THREE.Group(); const arrow = new THREE.Mesh(arrowG, markM); arrow.position.y = 1.55; const ring = new THREE.Mesh(ringG, markM); ring.position.y = 0.01;
  marker.add(arrow, ring); marker.visible = false; cart.add(marker);
  // 마우스로 가리킨 상품 테두리(노란 상자 선, 항상 위에 보임)
  const hlG = keep(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));
  const hlM = keep(new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true }));
  const hlBox = new THREE.LineSegments(hlG, hlM); hlBox.matrixAutoUpdate = false; hlBox.renderOrder = 10; hlBox.visible = false; scene.add(hlBox);
  // 보관소 카트들(겹쳐 꽂힌 줄) — 인스턴스 3개
  const corral = [new THREE.InstancedMesh(cg.wire, wireM, 14), new THREE.InstancedMesh(cg.red, redM, 14), new THREE.InstancedMesh(cg.dark, darkM, 14)];
  const corralPos = [];
  for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) corralPos.push({ x: CORRAL.x0 + 1.8 + row * 3.6, z: CORRAL.z0 + 0.7 + k * 0.3 });
  const setCorral = (n) => { corralPos.forEach((c, i) => { m4.compose(pv.set(c.x, 0, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), s1); for (const im of corral) im.setMatrixAt(i, m4); }); for (const im of corral) { im.count = n; im.instanceMatrix.needsUpdate = true; } };
  setCorral(14); scene.add(...corral);
  const railM = keep(new THREE.MeshLambertMaterial({ color: 0x1e5a45 }));
  const railG = keep(new THREE.BoxGeometry(0.05, 0.05, CORRAL.z1 - CORRAL.z0)); railG.translate(0, 0.95, (CORRAL.z0 + CORRAL.z1) / 2); // 보관소 가이드 레일(가는 봉)
  for (const x of [CORRAL.x0, CORRAL.x0 + 3.6 * 0 + 3.6, CORRAL.x0 + 7.2]) { const r = new THREE.Mesh(railG, railM); r.position.x = x; scene.add(r); }
  const corralSign = keep(canvasTex(512, 160, (g) => { g.fillStyle = '#f2b705'; g.fillRect(0, 0, 512, 160); g.fillStyle = '#13203d'; g.textAlign = 'center'; g.font = '900 54px "Pretendard",sans-serif'; g.fillText('🛒 카트 보관소', 256, 72); g.font = '700 26px "Pretendard",sans-serif'; g.fillText('240L 대형 카트 · 최대 240 kg', 256, 124); }));
  const csM = keep(new THREE.MeshBasicMaterial({ map: corralSign })); const csG = keep(new THREE.PlaneGeometry(2.6, 0.8));
  const cs = new THREE.Mesh(csG, csM); cs.position.set((CORRAL.x0 + CORRAL.x1) / 2, 2.3, CORRAL.z1 + 0.05); cs.rotation.y = 0; scene.add(cs);
  // 입구 유리문 (안에서 본 모습)
  const doorM = keep(new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.55 }));
  const doorG = keep(new THREE.PlaneGeometry(DOOR.w, 3.4)); const door = new THREE.Mesh(doorG, doorM); door.position.set(DOOR.x, 1.7, 0.12); scene.add(door);
  const exitTex = keep(canvasTex(256, 96, (g) => { g.fillStyle = '#1b8a3a'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#fff'; g.font = '900 40px "Pretendard",sans-serif'; g.textAlign = 'center'; g.fillText('출입구 EXIT', 128, 62); }));
  const exM = keep(new THREE.MeshBasicMaterial({ map: exitTex })); const exG = keep(new THREE.PlaneGeometry(1.6, 0.6)); const ex = new THREE.Mesh(exG, exM); ex.position.set(DOOR.x, 3.8, 0.15); scene.add(ex);

  // ---------- 물리 (카트 좌표계) ----------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = true; world.solver.iterations = 14; world.broadphase = new CANNON.NaiveBroadphase();
  const mItem = new CANNON.Material('item'), mCart = new CANNON.Material('cart'), mSoft = new CANNON.Material('soft');
  world.addContactMaterial(new CANNON.ContactMaterial(mItem, mCart, { friction: 0.45, restitution: 0.02 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mItem, mItem, { friction: 0.5, restitution: 0.02 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mSoft, mCart, { friction: 0.8, restitution: 0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mSoft, mItem, { friction: 0.8, restitution: 0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mSoft, mSoft, { friction: 0.85, restitution: 0 }));
  const B = BASKET, cartBody = new CANNON.Body({ mass: 0, material: mCart, type: CANNON.Body.STATIC });
  const addBox = (hx, hy, hz, x, y, z, rx = 0) => { cartBody.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(x, y, z), new CANNON.Quaternion().setFromEuler(rx, 0, 0)); };
  addBox(B.top.x, 0.01, (B.floor.z1 - B.floor.z0 + 0.3) / 2, 0, B.floorY - 0.01, (B.floor.z0 + B.floor.z1) / 2 - 0.1); // 바구니 바닥(아래 받침대의 천장도 됨)
  for (const sx of [-1, 1]) addBox(0.012, 0.25, 0.52, sx * (B.floor.x + 0.02), B.floorY + 0.24, -0.02); // 옆벽 (위 끝 = 테두리 높이)
  addBox(B.top.x, 0.26, 0.012, 0, B.floorY + 0.26, B.floor.z1 + 0.015); // 뒷벽
  { const dz = B.top.z0 - B.floor.z0, dy = B.top.yFront - B.floorY, L = Math.hypot(dz, dy), ang = Math.atan2(-dz, dy);
    addBox(B.top.x, L / 2 + 0.05, 0.012, 0, B.floorY + dy / 2, B.floor.z0 + dz / 2 - 0.012, -ang); } // 앞 경사벽
  // 유아석 판은 뒷벽에 접혀 있음(뒷벽 충돌체로 충분)
  addBox(B.tray.x + 0.02, 0.01, (B.tray.z1 - B.tray.z0) / 2, 0, B.tray.y - 0.01, (B.tray.z0 + B.tray.z1) / 2); // 아래 받침대
  for (const sx of [-1, 1]) addBox(0.008, 0.025, (B.tray.z1 - B.tray.z0) / 2, sx * (B.tray.x + 0.01), B.tray.y + 0.02, (B.tray.z0 + B.tray.z1) / 2);
  addBox(B.tray.x, 0.025, 0.008, 0, B.tray.y + 0.02, B.tray.z0 - 0.01);
  world.addBody(cartBody);
  // 카트 밑 바닥(받침대 아래로 빠진 물체용)
  world.addBody(new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: mCart, shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.05, 1.5)), position: new CANNON.Vec3(0, -0.05, 0) }));
  const LEVELS = {
    upper: { y: B.floorY, x: B.floor.x - 0.008, z1: B.floor.z1 - 0.003, frontZ: (y) => B.floor.z0 - (y - B.floorY) * ((B.floor.z0 - B.top.z0) / (B.top.yFront - B.floorY)) - 0.005, ceil: B.top.yFront + 0.38, vol: 0 },
    lower: { y: B.tray.y, x: B.tray.x - 0.005, z1: B.tray.z1 - 0.005, frontZ: () => B.tray.z0 + 0.005, ceil: B.floorY - 0.012, vol: 0 },
  };
  LEVELS.upper.vol = (2 * B.floor.x) * (B.floor.z1 - B.floor.z0 + 0.08) * (B.top.yFront - B.floorY + 0.04); // 모델 안쪽 부피 (m³)
  LEVELS.lower.vol = (2 * B.tray.x) * (B.tray.z1 - B.tray.z0) * (LEVELS.lower.ceil - B.tray.y);
  const staticObs = [];

  // ---------- 상태 ----------
  const items = []; // {p, body, mesh, level, eggs?}
  const st = {
    mode: 'walk', // walk | place
    hasCart: false,
    me: { x: DOOR.x + 1.5, z: 3.2, yaw: Math.PI }, // 입구 안쪽, 보관소 쪽
    head: { yaw: 0, pitch: -0.12 },
    cart: { x: (CORRAL.x0 + CORRAL.x1) / 2 - 3, z: CORRAL.z1 + 1.5, yaw: Math.PI, vx: 0, vz: 0, w: 0, ax: 0, az: 0 },
    held: null, ghost: null, level: 'upper', gx: 0, gz: 0, fx: 0, fz: 0, placedOnce: false, rotY: 0, tip: false, nudge: { x: 0, z: 0 },
    brokenEggs: 0, eggTotal: 0, t: 0, lastAccel: null, toastT: 0, shock: 0,
  };
  cart.visible = false;

  // ---------- HUD ----------
  const hud = document.createElement('div'); hud.id = 'depot-hud';
  hud.innerHTML = `<div class="dh-panel"><b>범창고</b><span class="dh-kg"></span></div><div class="dh-cross"></div><div class="dh-target"></div><div class="dh-toast"></div><div class="dh-help"></div>
  <div class="dh-btns"><button data-a="place">놓기</button><button data-a="rot">돌리기</button><button data-a="tip">눕히기</button><button data-a="level">위/아래</button><button data-a="cancel">취소</button></div>`;
  const css = document.createElement('style');
  css.textContent = `#depot-hud{position:fixed;inset:0;pointer-events:none;z-index:57;font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif;color:#fff}
#depot-hud .dh-panel{position:absolute;left:16px;top:84px;background:rgba(18,59,45,.88);border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.55;font-weight:600;max-width:340px}
#depot-hud .dh-panel b{color:#F2C230;margin-right:8px;font-size:14px}#depot-hud .dh-kg{display:block;white-space:pre-line}
#depot-hud .dh-cross{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 0 0 2px rgba(0,0,0,.35)}
#depot-hud .dh-target{position:absolute;left:50%;top:calc(50% + 22px);transform:translateX(-50%);background:rgba(255,255,255,.95);color:#13203d;border-radius:10px;padding:6px 12px;font-size:14px;font-weight:800;display:none;white-space:nowrap}
#depot-hud .dh-toast{position:absolute;left:16px;top:var(--dh-msg-top,200px);max-width:min(340px,calc(100vw - 32px));background:#c62828;color:#fff;border-radius:12px;padding:9px 14px;font-size:15px;line-height:1.4;font-weight:900;display:none;box-shadow:0 8px 24px rgba(0,0,0,.3)}
#depot-hud .dh-help{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);background:rgba(18,59,45,.82);border-radius:10px;padding:6px 12px;font-size:12.5px;font-weight:600;white-space:nowrap}
#depot-hud .dh-btns{position:absolute;right:16px;bottom:200px;display:none;flex-direction:column;gap:6px;pointer-events:auto}
#depot-hud .dh-btns button{font:inherit;font-weight:800;font-size:13px;border:0;border-radius:10px;padding:8px 12px;background:rgba(255,255,255,.92);color:#13203d}
#depot-hud.placing .dh-btns{display:flex}#depot-hud.placing .dh-cross{display:none}`;
  document.head.appendChild(css); document.body.appendChild(hud);
  const elPanel = hud.querySelector('.dh-panel'), elKg = hud.querySelector('.dh-kg'), elTarget = hud.querySelector('.dh-target'), elToast = hud.querySelector('.dh-toast'), elHelp = hud.querySelector('.dh-help');
  hud.querySelector('.dh-btns').addEventListener('click', (e) => { const a = e.target?.dataset?.a; if (a === 'place') place(); else if (a === 'rot') rotate(Math.PI / 2); else if (a === 'tip') { st.tip = !st.tip; } else if (a === 'level') toggleLevel(); else if (a === 'cancel') cancelPlace(); });
  function toast(msg, ms = 1800, bg = '#c62828') { elToast.textContent = isMobile ? touchText(msg) : msg; elToast.style.background = bg; elToast.style.display = 'block'; st.toastT = ms / 1000; }
  // ---------- 매장 직원 · 장난 감지 (staff.js) ----------
  const staff = createStaff({ scene, camera, hud, keep, canvasTex, toast, st, onSpeak: (text, lv, pos) => audio?.play('staff-talk', { text, level: lv, pos }), onAchieve: () => audio?.play('achievement'), getAvoid: () => floorItems.map((fi) => ({ x: fi.mesh.position.x, z: fi.mesh.position.z, r: 0.3 })).concat(checkout.avoid()), isBlocked: (x, z) => !!collide2D(x, z, 0.3), onEscort() {
    if (st.mode === 'place') cancelPlace();
    if (st.hasCart) { st.hasCart = false; const c = st.cart; c.vx = c.vz = c.w = 0; }
    st.me.x = DOOR.x + 1.5; st.me.z = 3.2; st.me.yaw = Math.PI; st.head.yaw = 0; st.head.pitch = -0.12;
    toast('직원이 입구까지 모셔다 드렸어요 🙇 (카트는 그 자리에 · 초록 화살표)', 3200, '#1E5A45');
  } });
  // 가전 코너 (입구 동쪽 복도). 장애물·픽 메시는 배열에 추가만 함.
  const elec = mountElectronics({ scene, keep, canvasTex, obstacles, prodMeshes, prodGeo, prodMat, audio, toast, isMobile });

  // ---------- 효과음(아주 짧게, WebAudio) ----------
  function blip(kind, extra) {
    const A = audioOrTap; // 소리 모듈이 없어도 스토리 탭은 받음
    if (kind === 'crack') A.play('egg-crack', extra || {});
    else if (kind === 'bump') A.play('cart-bump', extra || {});
    else if (kind === 'pick') A.play('item-pick', extra || {});
    else if (kind === 'place') A.play('item-place', extra || {});
    else if (kind === 'grab') A.play('cart-grab', extra || {});
    else if (kind === 'release') A.play('cart-release', extra || {});
    else if (kind === 'fall') A.play('item-fall', extra || {});
  }

  // ---------- 짐 ----------
  const eggGeo = keep(new THREE.SphereGeometry(1, 10, 8)); eggGeo.scale(0.022, 0.028, 0.022);
  const eggM = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const eggTrayM = keep(new THREE.MeshLambertMaterial({ color: 0xd2b27c }));
  const decalG = keep(new THREE.PlaneGeometry(1, 1)); decalG.rotateX(-Math.PI / 2);
  const decalMat = (t) => (t ? keep(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })) : null);
  const crack1M = decalMat(TX['egg-crack-1']), crack2M = decalMat(TX['egg-crack-2']), puddleM = decalMat(TX['yolk-puddle']);
  const splatG = keep(new THREE.CircleGeometry(0.03, 12)); splatG.rotateX(-Math.PI / 2);
  const splatM = keep(new THREE.MeshLambertMaterial({ color: 0xf5a300 }));
  const ghostM = keep(new THREE.MeshBasicMaterial({ color: 0x33dd66, transparent: true, opacity: 0.35, depthWrite: false }));
  const ghostEdgeM = keep(new THREE.LineBasicMaterial({ color: 0x1aff70 }));
  function itemDims(p, tip) { const [sx, sy, sz] = p.size; return tip ? [sx, sz, sy] : [sx, sy, sz]; } // 눕힌 상태의 축 정렬 크기(배치 계산용)
  const Y3 = new THREE.Vector3(0, 1, 0), qTip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const itemQuat = (rotY, tip, out = new THREE.Quaternion()) => { out.setFromAxisAngle(Y3, rotY); if (tip) out.multiply(qTip); return out; };
  function makeItemMesh(p) { // 원래 자세(눕힘·회전은 쿼터니언으로)
    const [sx, sy, sz] = p.size;
    const g = p.kind === 'egg' ? (TX['pk-egg'] ? boxGeoAtlas(sx, 0.045, sz, 'spare') : new THREE.BoxGeometry(sx, 0.045, sz)) : productGeo(p);
    const mesh = new THREE.Mesh(g, p.kind === 'egg' ? (TX['pk-egg'] ? prodMat.egg : eggTrayM) : prodMat[p.id]);
    mesh.userData.ownGeo = true;
    if (p.kind === 'egg') {
      g.translate(0, -sy / 2 + 0.0225, 0);
      const eggs = new THREE.InstancedMesh(eggGeo, eggM, 30); const th = [];
      for (let i = 0; i < 30; i++) { const cx = -sx / 2 + sx / 6 * ((i % 6) + 0.5), cz = -sz / 2 + sz / 5 * (Math.floor(i / 6) + 0.5); m4.makeTranslation(cx, -sy / 2 + 0.045, cz); eggs.setMatrixAt(i, m4); eggs.setColorAt(i, col.setHex(0xf6ead4)); th.push(Math.max(18, EGG.mean + EGG.sd * gauss())); }
      eggs.userData = { th, broken: new Array(30).fill(false), stage: new Uint8Array(30), force: new Float32Array(30), hold: new Uint8Array(30), cell: [sx / 6, sz / 5], top: -sy / 2 + 0.045 };
      // 파손 단계 데칼(디자인 fx): 1 실금 · 2 금+눌림 · 3~4 노른자 웅덩이 — 알 30칸마다 인스턴스, 처음엔 0 크기
      const fx = {};
      for (const [k, mat] of [['crack1', crack1M], ['crack2', crack2M], ['puddle', puddleM]]) {
        if (!mat) continue;
        const im = new THREE.InstancedMesh(decalG, mat, 30); m4.makeScale(0, 0, 0); for (let i = 0; i < 30; i++) im.setMatrixAt(i, m4);
        im.renderOrder = 3; im.frustumCulled = false; mesh.add(im); fx[k] = im;
      }
      eggs.userData.fx = fx;
      mesh.add(eggs); mesh.userData.eggs = eggs;
    }
    return mesh;
  }
  function disposeItemMesh(mesh) { if (mesh.userData.ownGeo) mesh.geometry.dispose(); mesh.userData.eggs?.dispose(); for (const im of Object.values(mesh.userData.eggs?.userData.fx || {})) im.dispose(); }
  const brokenIn = (mesh) => mesh.userData.eggs ? mesh.userData.eggs.userData.broken.filter(Boolean).length : 0;
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const loadKg = () => items.reduce((a, it) => a + it.p.kg, 0);
  const loadWon = () => items.reduce((a, it) => a + it.p.price, 0) - st.brokenEggs * Math.round(8480 / 30);

  const MAX_ITEMS = 40; // 카트 안 물리 물체 상한 (성능)
  function addItem(p, level, x, y, z, rotY, tip, reuse = null, quat = null) {
    const body = new CANNON.Body({ mass: p.kg, material: p.soft || p.kind === 'egg' ? mSoft : mItem });
    addPhysShape(body, p);
    body.position.set(x, y, z);
    const q = quat || itemQuat(rotY, tip); body.quaternion.set(q.x, q.y, q.z, q.w);
    body.linearDamping = p.kind === 'egg' ? 0.45 : 0.12; body.angularDamping = p.kind === 'egg' ? 0.85 : p.shape === 'sphere' ? 0.5 : 0.35; // 계란판은 튀지 않고 바로 자리 잡게
    body.sleepSpeedLimit = 0.05; body.sleepTimeLimit = 0.5;
    world.addBody(body);
    const mesh = reuse || makeItemMesh(p); itemsRoot.add(mesh); mesh.position.set(x, y, z); mesh.quaternion.copy(q);
    const it = { p, body, mesh, level, size: p.size.slice(), src: st.held?.src || null };
    items.push(it);
    if (p.kind === 'egg') { st.eggTotal += 30; st.brokenEggs += brokenIn(mesh); }
    for (const o of items) o.body.wakeUp();
    return it;
  }
  // 카트에서 빼기(메시는 넘겨줄 수 있게 남김)
  function detachItem(it) {
    const i = items.indexOf(it); if (i < 0) return;
    items.splice(i, 1); world.removeBody(it.body); itemsRoot.remove(it.mesh);
    if (it.mesh.userData.eggs) { st.eggTotal -= 30; st.brokenEggs -= brokenIn(it.mesh); }
    for (const o of items) o.body.wakeUp();
  }

  // ---------- 바닥에 떨어진 상품 (월드 좌표, 물리 없이 간단 낙하 후 정지 · 다시 집기 가능) ----------
  const floorRoot = new THREE.Group(); scene.add(floorRoot);
  const floorItems = [];
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  function settleQuat(p, q) { // 가장 위를 향한 면으로 눕히기
    if (p.shape === 'sphere') return { tq: q.clone(), half: p.size[1] / 2 };
    let best = 0, bd = -1, sign = 1; const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    ax.forEach((a, k) => { a.applyQuaternion(q); const d = Math.abs(a.y); if (d > bd) { bd = d; best = k; sign = Math.sign(a.y) || 1; } });
    const tq = new THREE.Quaternion().setFromUnitVectors(ax[best].clone().multiplyScalar(sign), Y3).multiply(q);
    return { tq, half: p.size[best] / 2 };
  }
  function toFloor(it) {
    const b = it.body;
    _m.compose(_p.set(b.position.x, b.position.y, b.position.z), _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), _s).premultiply(cart.matrixWorld);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); _m.decompose(wp, wq, new THREE.Vector3());
    const c = st.cart, v = new THREE.Vector3(b.velocity.x, b.velocity.y, b.velocity.z).applyAxisAngle(Y3, c.yaw); v.x += c.vx; v.z += c.vz;
    detachItem(it);
    addFloorItem(it.p, it.mesh, wp, wq, v, it.src); staff.onFloor(true);
    blip('fall', { kg: it.p.kg, pos: wp });
    toast(`${it.p.name} 바닥에 떨어짐 · 클릭해서 다시 집기`, 2000, '#8a5a00');
  }
  function addFloorItem(p, mesh, wp, wq, vel, src) {
    floorRoot.add(mesh); mesh.position.copy(wp); mesh.quaternion.copy(wq);
    const { tq, half } = settleQuat(p, wq);
    const fi = { p, mesh, vel: vel.clone(), tq, half, settled: false, src, size: p.size };
    floorItems.push(fi); return fi;
  }
  function tickFloor(dt) {
    for (const fi of floorItems) {
      if (fi.settled) continue;
      const m = fi.mesh; fi.vel.y -= 9.81 * dt; fi.vel.x *= 0.985; fi.vel.z *= 0.985;
      m.position.addScaledVector(fi.vel, dt); m.quaternion.slerp(fi.tq, Math.min(1, dt * 7));
      if (m.position.y <= fi.half) {
        const vImp = Math.max(0, -fi.vel.y); m.position.y = fi.half; m.quaternion.copy(fi.tq); fi.settled = true;
        blip('fall', { kg: fi.p.kg, pos: m.position });
        // 계란판 낙하: 알마다 F ≈ (알 1개 질량)·v / 4 ms — 같은 파괴 하중 분포(34±6 N)로 판정
        const eggs = m.userData.eggs;
        if (eggs && vImp > 0.5) { const U = eggs.userData; for (let i = 0; i < 30; i++) U.force[i] = 0.054 * vImp / 0.004 * (0.6 + Math.random() * 0.8); const before = brokenIn(m); for (let k = 0; k < 3; k++) resolveEggs([{ mesh: m }], true); U.force.fill(0); const n = brokenIn(m) - before; if (n) toast(`🥚 바닥에 떨어져 계란 ${n}개 깨짐`, 2400); }
      }
    }
  }
  function removeFloorItem(fi) { const i = floorItems.indexOf(fi); if (i >= 0) floorItems.splice(i, 1); floorRoot.remove(fi.mesh); }

  // ---------- 고스트 (놓기 미리보기) — 어디든 놓을 수 있음, 색은 안정도 힌트일 뿐 ----------
  let ghost = null;
  function setGhost(p) {
    if (ghost) { itemsRoot.remove(ghost); ghost.geometry.dispose(); ghost.children[0]?.geometry.dispose(); ghost = null; }
    if (!p) return;
    const g = new THREE.BoxGeometry(...p.size);
    ghost = new THREE.Mesh(g, ghostM); ghost.renderOrder = 5;
    ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), ghostEdgeM));
    itemsRoot.add(ghost);
  }
  function aabbOf(cx, cy, cz, [sx, sy, sz], rotY) {
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    const hx = (sx * c + sz * s) / 2, hz = (sx * s + sz * c) / 2, hy = sy / 2;
    return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy, z0: cz - hz, z1: cz + hz };
  }
  function bodyAabb(b) { b.updateAABB(); return { x0: b.aabb.lowerBound.x, x1: b.aabb.upperBound.x, y0: b.aabb.lowerBound.y, y1: b.aabb.upperBound.y, z0: b.aabb.lowerBound.z, z1: b.aabb.upperBound.z }; }
  const overlapXZ = (a, b, e = 0.002) => a.x0 < b.x1 - e && a.x1 > b.x0 + e && a.z0 < b.z1 - e && a.z1 > b.z0 + e;
  const clipXZ = (a, b) => ({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) });
  const areaXZ = (r) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
  const RIM_Y = (B.top.yFront + B.top.yRear) / 2;
  const basketFloor = { x0: -B.floor.x, x1: B.floor.x, z0: B.floor.z0, z1: B.floor.z1 };
  const trayRect = { x0: -B.tray.x, x1: B.tray.x, z0: B.tray.z0, z1: B.tray.z1 };
  // 놓을 자리: 가리킨 곳 그대로(자르지 않음). 바구니 안이면 바닥부터, 벽에 걸치면 테두리 위, 바깥이면 매장 바닥.
  // 겹치는 상품이 있으면 그 위로 올림. 안정도: 받치는 면적 비율 + 무게중심이 받침 영역 안인지.
  function solveGhost() {
    const p = st.held?.p; if (!p) return null;
    const dims = itemDims(p, st.tip), rot = st.rotY;
    const probe = aabbOf(0, 0, 0, dims, rot), hx = (probe.x1 - probe.x0) / 2, hz = (probe.z1 - probe.z0) / 2, h = dims[1];
    let x = st.gx + st.nudge.x, z = st.gz + st.nudge.z, where;
    if (st.level === 'lower') {
      where = Math.abs(x) <= B.tray.x + 0.05 && z >= B.tray.z0 - 0.05 && z <= B.tray.z1 + 0.05 ? 'lower' : 'floor';
    } else where = Math.abs(x) <= B.top.x + 0.04 && z >= B.top.z0 - 0.04 && z <= B.top.z1 + 0.04 ? 'basket' : 'floor';
    if (where === 'floor') { x = st.fx + st.nudge.x; z = st.fz + st.nudge.z; }
    const fp = { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
    if (where === 'basket' && (fp.x0 < -B.floor.x - 0.004 || fp.x1 > B.floor.x + 0.004 || fp.z1 > B.floor.z1 + 0.004 || fp.z0 < B.top.z0 - 0.004 || (fp.z0 < B.floor.z0 && fp.z0 < LEVELS.upper.frontZ(B.floorY + h)))) where = 'rim';
    const base = where === 'basket' ? B.floorY : where === 'rim' ? RIM_Y : where === 'lower' ? B.tray.y : 0;
    let y = base;
    const obs = where === 'floor' ? [] : items.filter((it) => (where === 'lower') === (it.level === 'lower')).map((it) => bodyAabb(it.body));
    for (let k = 0; k < 24; k++) {
      let moved = false;
      for (const o of obs) if (overlapXZ(fp, o) && o.y0 < y + h - 0.004 && o.y1 > y + 0.004) { y = o.y1 + 0.0005; moved = true; }
      if (!moved) break;
    }
    // 받침 영역
    const sup = [];
    if (Math.abs(y - base) < 0.002) {
      if (where === 'basket') sup.push(clipXZ(fp, basketFloor));
      else if (where === 'lower') sup.push(clipXZ(fp, trayRect));
      else if (where === 'floor') sup.push(fp);
      else if (where === 'rim') { // 철망 테두리(가는 선)
        for (const wx of [-B.floor.x - 0.02, B.floor.x + 0.02]) if (fp.x0 < wx && fp.x1 > wx) sup.push(clipXZ(fp, { x0: wx - 0.012, x1: wx + 0.012, z0: B.top.z0, z1: B.top.z1 }));
        if (fp.z0 < B.floor.z1 + 0.015 && fp.z1 > B.floor.z1 + 0.015) sup.push(clipXZ(fp, { x0: -B.top.x, x1: B.top.x, z0: B.floor.z1, z1: B.floor.z1 + 0.03 }));
        if (fp.z0 < B.top.z0 + 0.01 && fp.z1 > B.top.z0) sup.push(clipXZ(fp, { x0: -B.top.x, x1: B.top.x, z0: B.top.z0 - 0.01, z1: B.top.z0 + 0.02 }));
      }
    }
    for (const o of obs) if (overlapXZ(fp, o) && Math.abs(o.y1 - y) < 0.015) sup.push(clipXZ(fp, o));
    const supA = sup.reduce((a, r) => a + areaXZ(r), 0), fpA = areaXZ(fp), ratio = Math.min(1, supA / fpA);
    let state = 'red';
    if (sup.length && supA > 1e-5) {
      const hull = sup.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), x1: Math.max(a.x1, r.x1), z0: Math.min(a.z0, r.z0), z1: Math.max(a.z1, r.z1) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
      const margin = Math.min(x - hull.x0, hull.x1 - x, z - hull.z0, hull.z1 - z);
      const tall = h > 1.8 * Math.min(hx, hz) * 2 && p.shape !== 'cyl';
      if (margin < 0) state = 'red';
      else if (ratio < 0.5 || margin < 0.03 || where === 'rim' || (where !== 'floor' && y + h > B.top.yRear + 0.3) || (tall && where !== 'floor')) state = 'yellow';
      else state = 'green';
    }
    return { x, y: y + h / 2 + 0.003, z, ok: true, state, where, ratio, top: y + h };
  }
  let ghostSol = null;
  function toggleLevel() { st.level = st.level === 'upper' ? 'lower' : 'upper'; st.nudge.x = st.nudge.z = 0; st.gx = 0; st.gz = 0; }
  function rotate(a) { st.rotY = (st.rotY + a) % (Math.PI * 2); }

  // ---------- 집기·놓기 ----------
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let hover = null;
  // PC: 마우스 커서 위치에서 레이 (가운데 조준 불필요) · 모바일/키보드: 화면 가운데
  const mouse = { on: false, x: 0, y: 0 };
  const REACH = 4.5;
  function pickTarget(at) {
    ray.setFromCamera(at || (mouse.on ? ndc.set(mouse.x, mouse.y) : ndc.set(0, 0)), camera); ray.far = REACH;
    const loose = [...items.map((it) => it.mesh), ...floorItems.map((f) => f.mesh)];
    const hit = ray.intersectObjects([...prodMeshes, ...loose], false)[0];
    if (!hit) return null;
    const pid = hit.object.isInstancedMesh && hit.instanceId != null ? (hit.object.userData.pids?.[hit.instanceId] ?? hit.object.userData.pid) : null; // 구역별 합친 진열 메시는 인스턴스마다 SKU
    if (pid) return { kind: 'shelf', im: hit.object, id: hit.instanceId, p: BY_ID[pid], dist: hit.distance };
    const it = items.find((i) => i.mesh === hit.object); if (it) return { kind: 'cart', it, p: it.p, dist: hit.distance };
    const fi = floorItems.find((f) => f.mesh === hit.object); if (fi) return { kind: 'floor', fi, p: fi.p, dist: hit.distance };
    return null;
  }
  const hlS = new THREE.Matrix4();
  function updateHighlight() {
    if (!hover || st.mode !== 'walk') { hlBox.visible = false; dom.style.cursor = ''; return; }
    const [sx, sy, sz] = hover.p.size; hlS.makeScale(sx * 1.05, sy * 1.05, sz * 1.05);
    if (hover.kind === 'shelf') hover.im.getMatrixAt(hover.id, m4); else { const o = hover.kind === 'cart' ? hover.it.mesh : hover.fi.mesh; o.updateMatrixWorld(); m4.copy(o.matrixWorld); }
    hlBox.matrix.multiplyMatrices(m4, hlS); hlBox.matrixWorldNeedsUpdate = true;
    hlBox.visible = true; hlM.opacity = 0.75 + 0.25 * Math.sin(st.t * 8); dom.style.cursor = 'pointer';
  }
  // 기본 자세: 긴 변을 카트 길이 방향으로, 키 큰 봉지·박스는 눕혀서(넘어지지 않게)
  function autoPose(p) {
    const [sx, sy, sz] = p.size;
    st.rotY = sx > sz + 0.01 ? Math.PI / 2 : 0;
    st.tip = p.shape !== 'cyl' && p.shape !== 'sphere' && sy > 1.6 * Math.min(sx, sz);
  }
  function pick() {
    if (!hover || st.mode !== 'walk') return false;
    if (!st.hasCart && !cart.visible) { toast('먼저 입구 카트 보관소에서 카트를 잡으세요 (E)', 2200, '#1f4fa3'); return false; }
    const c = st.cart, d = Math.hypot(c.x - st.me.x, c.z - st.me.z);
    if (d > 7) { toast('카트가 너무 멀어요 · 카트 가까이에서 집어요', 1500, '#1f4fa3'); return false; }
    const h = hover; let restore = null, mesh = null, src = null;
    if (h.kind === 'shelf') {
      h.im.getMatrixAt(h.id, m4); const saved = m4.clone();
      m4.makeScale(0, 0, 0); h.im.setMatrixAt(h.id, m4); h.im.instanceMatrix.needsUpdate = true;
      src = { im: h.im, id: h.id, m: saved };
      restore = () => { h.im.setMatrixAt(h.id, saved); h.im.instanceMatrix.needsUpdate = true; };
    } else if (h.kind === 'cart') {
      const it = h.it, P = it.body.position.clone(), Q = it.body.quaternion.clone(), lv = it.level;
      detachItem(it); mesh = it.mesh; src = it.src;
      restore = () => { const q = new THREE.Quaternion(Q.x, Q.y, Q.z, Q.w); addItem(it.p, lv, P.x, P.y + 0.01, P.z, 0, false, mesh, q); };
    } else {
      const fi = h.fi; removeFloorItem(fi); mesh = fi.mesh; src = fi.src;
      restore = () => { floorRoot.add(fi.mesh); floorItems.push(fi); };
    }
    st.held = { p: h.p, src, mesh, restore };
    st.mode = 'place'; st.level = 'upper'; autoPose(h.p); st.nudge.x = st.nudge.z = 0;
    st.gx = 0; st.gz = -0.05; st.fx = 0; st.fz = -0.05;
    setGhost(h.p); hud.classList.add('placing'); blip('pick', { product: h.p }); hlBox.visible = false;
    return true;
  }
  function cancelPlace() {
    if (st.mode !== 'place') return;
    const h = st.held; st.held = null; h?.restore?.(); if (h?.p) tap('item-putback', { product: h.p }); // 스토리: 집었다 다시 내려놓기
    setGhost(null); st.mode = 'walk'; hud.classList.remove('placing');
  }
  function place() {
    if (st.mode !== 'place' || !ghostSol) return false;
    const h = st.held, p = h.p;
    if (ghostSol.where !== 'floor') {
      if (items.length >= MAX_ITEMS) { toast(`카트 안 상품은 ${MAX_ITEMS}개까지 (샘플 성능 상한)`, 1600, '#8a5a00'); return false; }
      if (loadKg() + p.kg > CART.maxLoad) { toast(`카트 허용 하중 ${CART.maxLoad} kg 초과`, 1600); return false; }
      addItem(p, ghostSol.where === 'lower' ? 'lower' : 'upper', ghostSol.x, ghostSol.y, ghostSol.z, st.rotY, st.tip, h.mesh);
      if (ghostSol.state === 'red') toast('위태위태… 떨어질 수 있어요', 1200, '#8a5a00');
    } else { // 매장 바닥에 내려놓기
      const q = itemQuat(st.rotY, st.tip); cart.updateMatrixWorld(true);
      _m.compose(_p.set(ghostSol.x, ghostSol.y + 0.02, ghostSol.z), q, _s).premultiply(cart.matrixWorld);
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); _m.decompose(wp, wq, new THREE.Vector3());
      addFloorItem(p, h.mesh || makeItemMesh(p), wp, wq, new THREE.Vector3(), h.src); staff.onFloor(false);
    }
    st.held = null; setGhost(null); st.mode = 'walk'; hud.classList.remove('placing'); blip('place', { kg: p.kg, product: p });
    if (ghostSol.state === 'yellow' || ghostSol.state === 'red') audio?.wobble?.();
    st.placedOnce = true;
    return true;
  }
  function removeLast() { // X: 마지막에 넣은 상품을 원래 선반으로
    const it = items[items.length - 1]; if (!it) return;
    detachItem(it); disposeItemMesh(it.mesh);
    if (it.src) { it.src.im.setMatrixAt(it.src.id, it.src.m); it.src.im.instanceMatrix.needsUpdate = true; }
  }

  // ---------- 계란 하중 ----------
  const up = new CANNON.Vec3(0, 1, 0), up3 = new THREE.Vector3(0, 1, 0);
  function eggLoads(dt) {
    const eggItems = items.filter((it) => it.mesh.userData.eggs);
    if (!eggItems.length) return;
    const byBody = new Map(items.map((it) => [it.body, it]));
    // 1) 위에서 아래로 하중 전달 (접촉 그래프)
    const supports = new Map(); // upper body -> [{lower, point(world in cart frame)}]
    for (const c of world.contacts) {
      const ny = c.ni.dot(up); if (Math.abs(ny) < 0.5) continue;
      const a = c.bi, b = c.bj; // ni: a→b
      let upper, lower, pt;
      if (ny > 0) { upper = b; lower = a; pt = new CANNON.Vec3().copy(a.position).vadd(c.ri); } else { upper = a; lower = b; pt = new CANNON.Vec3().copy(b.position).vadd(c.rj); }
      if (!byBody.has(upper)) continue;
      const rel = (upper.velocity.y - lower.velocity.y);
      (supports.get(upper) || supports.set(upper, []).get(upper)).push({ lower, pt, rel });
    }
    const load = new Map();
    const sorted = items.slice().sort((p, q) => q.body.position.y - p.body.position.y);
    for (const it of eggItems) it.mesh.userData.eggs.userData.force.fill(0);
    for (const it of sorted) {
      const L = (load.get(it.body) || 0) + it.p.kg * 9.81;
      const sup = supports.get(it.body); if (!sup?.length) continue;
      const share = L / sup.length;
      for (const s of sup) {
        load.set(s.lower, (load.get(s.lower) || 0) + share);
        const low = byBody.get(s.lower); const eggs = low?.mesh.userData.eggs; if (!eggs) continue;
        // 충격: 상대 속도 > 0.25 m/s 이면 F ≈ m·Δv/Δt (Δt 10 ms)
        const imp = Math.abs(s.rel) > 0.6 ? it.p.kg * Math.abs(s.rel) / 0.025 / sup.length : 0; // 살살 놓기·느린 접촉은 0, 진짜 충격만 (펄프 트레이 완충 Δt≈25 ms, 추정)
        const F = share + imp;
        const loc = low.body.pointToLocalFrame(s.pt);
        const U = eggs.userData, [cw, cd] = U.cell, [sx, , sz] = low.size;
        if (it.p.soft || it.p.kind === 'egg') { // 부드러운 포대·봉지, 그리고 계란판 위 계란판(펄프 판이 포개져 하중이 판 전체로): 겹친 면적 전체로 퍼짐
          const a = bodyAabb(it.body), bA = bodyAabb(low.body);
          const ox = Math.max(0, Math.min(a.x1, bA.x1) - Math.max(a.x0, bA.x0)), oz = Math.max(0, Math.min(a.z1, bA.z1) - Math.max(a.z0, bA.z0));
          const n = Math.max(1, Math.min(30, Math.round((ox * oz) / (cw * cd))));
          // 접촉점 근처부터 n 칸
          const idx = [...Array(30).keys()].sort((i, j) => dist2(i) - dist2(j)).slice(0, Math.max(1, Math.round(n / sup.length)));
          for (const i of idx) U.force[i] += F / idx.length;
          function dist2(i) { const cx = -sx / 2 + cw * ((i % 6) + 0.5), cz = -sz / 2 + cd * (Math.floor(i / 6) + 0.5); return (cx - loc.x) ** 2 + (cz - loc.z) ** 2; }
        } else { // 단단한 박스 모서리·면: 접촉점마다 가까운 알 2개
          const ci = Math.min(5, Math.max(0, Math.floor((loc.x + sx / 2) / cw))), cj = Math.min(4, Math.max(0, Math.floor((loc.z + sz / 2) / cd)));
          const nb = THREE.MathUtils.clamp(ci + (loc.x > -sx / 2 + cw * (ci + 0.5) ? 1 : -1), 0, 5); // 접촉점 쪽 이웃 알
          U.force[cj * 6 + ci] += F / 2; U.force[cj * 6 + nb] += F / 2;
        }
      }
    }
    resolveEggs(eggItems);
  }
  // 2) 임계 넘으면(3 프레임 이상 지속 또는 충격) 그 알만 깨짐 — 카트 안 하중·바닥 낙하 충격 공용
  function resolveEggs(eggItems, silent = false) {
    for (const it of eggItems) {
      const eggs = it.mesh.userData.eggs, U = eggs.userData; let newly = 0;
      const fx = U.fx || {}; let fxDirty = false;
      for (let i = 0; i < 30; i++) {
        if (U.broken[i]) continue;
        const r = U.force[i] / U.th[i];
        if (r > 1) U.hold[i]++; else U.hold[i] = 0;
        const smash = r > 2.5;
        eggs.getMatrixAt(i, m4); pv.setFromMatrixPosition(m4);
        if (U.hold[i] >= 3 || smash) {
          U.broken[i] = true; U.stage[i] = smash ? 4 : 3; newly++;
          // 알은 납작하게 · 노른자 웅덩이 데칼
          m4.compose(pv.setY(U.top + 0.004), q0, new THREE.Vector3(1.25, 0.22, 1.25)); eggs.setMatrixAt(i, m4); eggs.setColorAt(i, col.setHex(0xf2e2c4));
          const ps = smash ? 0.13 : 0.095;
          if (fx.puddle) { m4.compose(pv.setY(U.top + 0.016), new THREE.Quaternion().setFromAxisAngle(up3, Math.random() * 6.28), new THREE.Vector3(ps, 1, ps)); fx.puddle.setMatrixAt(i, m4); }
          else { const sp = new THREE.Mesh(splatG, splatM); sp.position.copy(pv).setY(U.top + 0.006); eggs.parent.add(sp); }
          if (fx.crack1) { m4.makeScale(0, 0, 0); fx.crack1.setMatrixAt(i, m4); }
          fxDirty = true;
        } else if (r >= 0.6 && U.stage[i] < (r >= 0.85 ? 2 : 1)) {
          // 금 단계는 누적 · 금 간 알은 임계값이 ×0.8 (다음에 먼저 깨짐)
          U.stage[i] = r >= 0.85 ? 2 : 1; U.th[i] *= 0.8;
          const im = U.stage[i] === 2 ? fx.crack2 : fx.crack1;
          if (U.stage[i] === 2) { m4.compose(pv, q0, new THREE.Vector3(1, 0.94, 1)); eggs.setMatrixAt(i, m4); if (fx.crack1) { m4.makeScale(0, 0, 0); fx.crack1.setMatrixAt(i, m4); } }
          if (im) { m4.compose(pv.clone().setY(U.top + 0.03), new THREE.Quaternion().setFromAxisAngle(up3, Math.random() * 6.28), new THREE.Vector3(0.04, 1, 0.04)); im.setMatrixAt(i, m4); }
          fxDirty = true; st.crackedEggs = (st.crackedEggs || 0) + 1;
        }
      }
      if (fxDirty) { for (const im of Object.values(fx)) im.instanceMatrix.needsUpdate = true; eggs.instanceMatrix.needsUpdate = true; }
      if (newly) { eggs.instanceMatrix.needsUpdate = true; eggs.instanceColor.needsUpdate = true; blip('crack', { n: newly, splat: newly >= 4, pos: { x: st.cart.x, y: 0.9, z: st.cart.z } }); staff.onEggsBroken(newly); if (!silent) { st.brokenEggs += newly; toast(`🥚 빠직! 계란 ${newly}개 깨짐 (${st.brokenEggs}/${st.eggTotal})`, 2400); } }
    }
  }

  // ---------- 카트 주행 ----------
  function inertia() {
    let I = CART.mass * (1.04 ** 2 + 0.585 ** 2) / 12;
    for (const it of items) { const p = it.body.position, [sx, , sz] = it.size; I += it.p.kg * (p.x * p.x + p.z * p.z + (sx * sx + sz * sz) / 12); }
    return I;
  }
  function collide2D(x, z, r) {
    for (const o of obstacles) {
      const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1));
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d < r) { if (d < 1e-6) return { nx: 0, nz: -1, pen: r }; return { nx: dx / d, nz: dz / d, pen: r - d }; }
    }
    return null;
  }
  function driveCart(dt, axes) {
    const c = st.cart, m = CART.mass + loadKg(), g = CART.g;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    let vl = c.vx * fx + c.vz * fz, vs = c.vx * rx + c.vz * rz;
    const f = axes.f || 0, vmax = axes.run ? CART.run : CART.walk;
    const Fr = CART.crr * m * g;
    let F = 0;
    if (f > 0) F = (Math.abs(vl) < 0.05 ? CART.pushPeak : CART.push) * f * THREE.MathUtils.clamp((vmax - vl) / 0.35, 0, 1);
    else if (f < 0) F = vl > 0.05 ? CART.push * f : CART.push * f * THREE.MathUtils.clamp((0.8 + vl) / 0.3, 0, 1);
    if (Math.abs(vl) < 0.02 && Math.abs(F) <= CART.breakaway * Fr) { vl = 0; } // 출발 힘을 못 넘으면 안 움직임
    else {
      const dir = Math.abs(vl) > 0.02 ? Math.sign(vl) : Math.sign(F);
      let a = (F - dir * Fr) / m; const nv = vl + a * dt;
      if (Math.sign(nv) !== Math.sign(vl) && Math.abs(vl) > 0.02 && F * vl <= 0) { vl = 0; a = 0; } else vl = nv;
    }
    vs -= (CART.latK * vs / m) * dt + Math.sign(vs) * Math.min(Math.abs(vs), Fr / m * dt);
    const I = inertia(), tau = -(axes.s || 0) * CART.handTorque, scrub = CART.scrubMu * m * g * CART.scrubArm;
    let al = (tau - 25 * c.w) / I;
    const nw = c.w + al * dt;
    if (!axes.s && Math.abs(nw) < scrub / I * dt) c.w = 0; else c.w = THREE.MathUtils.clamp(nw - Math.sign(nw) * Math.min(Math.abs(nw), scrub / I * dt), -1.6, 1.6);
    const ovx = c.vx, ovz = c.vz;
    c.yaw += c.w * dt;
    const fx2 = -Math.sin(c.yaw), fz2 = -Math.cos(c.yaw), rx2 = Math.cos(c.yaw), rz2 = -Math.sin(c.yaw);
    c.vx = fx2 * vl + rx2 * vs; c.vz = fz2 * vl + rz2 * vs;
    let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    // 카트 앞쪽 원 + 뒤쪽 원으로 충돌
    for (const off of [-0.32, 0.25]) {
      const px = nx + fx2 * -off, pz = nz + fz2 * -off;
      const hit = collide2D(px, pz, 0.36);
      if (hit) {
        nx += hit.nx * hit.pen; nz += hit.nz * hit.pen;
        const vn = c.vx * hit.nx + c.vz * hit.nz;
        if (vn < 0) { c.vx -= vn * hit.nx * 1.3; c.vz -= vn * hit.nz * 1.3; if (-vn > 0.35) { st.shock = Math.min(1, -vn); blip('bump', { pos: { x: c.x, y: 0.4, z: c.z }, gain: Math.min(1.2, -vn) }); } if (-vn > 1.2) staff.onRam(-vn - 1.2); }
      }
    }
    c.x = nx; c.z = nz;
    c.ax = (c.vx - ovx) / Math.max(dt, 1e-3); c.az = (c.vz - ovz) / Math.max(dt, 1e-3);
    // 0 → 1.2 m/s 걸린 시간 기록
    const sp = Math.hypot(c.vx, c.vz);
    if (sp < 0.03 && f > 0) st.accT = 0; else if (st.accT != null && sp < 1.0) st.accT += dt; else if (st.accT != null && sp >= 1.0) { st.lastAccel = st.accT; st.accT = null; }
    // 플레이어는 손잡이 뒤
    st.me.x = c.x - fx2 * 0.95; st.me.z = c.z - fz2 * 0.95; st.me.yaw = c.yaw;
  }
  function walk(dt, axes) {
    const me = st.me, yaw = me.yaw + st.head.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = fx * (axes.f || 0) + rx * (axes.s || 0), mz = fz * (axes.f || 0) + rz * (axes.s || 0); const l = Math.hypot(mx, mz);
    if (l > 0.01) { const sp = (axes.run ? 2.4 : 1.4) * Math.min(1, l); mx /= l; mz /= l; let nx = me.x + mx * sp * dt, nz = me.z + mz * sp * dt; const h = collide2D(nx, nz, 0.3); if (h) { nx += h.nx * h.pen; nz += h.nz * h.pen; } me.x = nx; me.z = nz; }
  }

  // ---------- 물리 스텝 (카트 좌표계 관성력) ----------
  const FIXED = 1 / 120;
  let acc = 0;
  function stepPhysics(dt) {
    if (!items.length) { st.shock = 0; return; }
    const c = st.cart, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    let axl = c.ax * rx + c.az * rz, azl = -(c.ax * fx + c.az * fz);
    if (st.shock) { const k = st.shock * 9; azl += k; st.shock = 0; } // 부딪힘: 앞으로 쏠림
    const strong = Math.hypot(axl, azl) > 0.7 || Math.abs(c.w) > 0.4;
    acc = Math.min(acc + dt, 4 * FIXED);
    while (acc >= FIXED) {
      for (const it of items) {
        const b = it.body; if (strong) b.wakeUp(); if (b.sleepState === CANNON.Body.SLEEPING) continue;
        const p = b.position, w2 = c.w * c.w;
        b.force.x += -b.mass * axl + b.mass * w2 * p.x; b.force.z += -b.mass * azl + b.mass * w2 * p.z;
      }
      world.step(FIXED); acc -= FIXED;
      eggLoads(FIXED);
    }
    for (const it of items.slice()) {
      const b = it.body, P = b.position;
      // 카트 밖으로 넘어가 테두리 아래로 떨어지면 → 매장 바닥 물체로 넘김
      const outside = Math.abs(P.x) > B.top.x + 0.05 || P.z < B.top.z0 - 0.08 || P.z > B.top.z1 + 0.1;
      if ((outside && P.y < 0.6) || P.y < -0.2) { toFloor(it); continue; }
      it.mesh.position.set(P.x, P.y, P.z); it.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const av = b.angularVelocity; if (audio && (av.x * av.x + av.y * av.y + av.z * av.z) > 1.6) audio.wobble({ x: st.cart.x, y: P.y, z: st.cart.z });
    }
  }

  // ---------- 카메라 ----------
  const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), camLocal = new THREE.Vector3();
  let camBlend = 0;
  function updateCamera(dt) {
    const c = st.cart;
    cart.position.set(c.x, 0, c.z); cart.rotation.y = c.yaw;
    if (st.camWorld) { camera.position.copy(st.camWorld.pos); camera.lookAt(st.camWorld.tgt); return; }
    if (st.camOv) { // 스샷·검증용 고정 시점 (카트 기준 좌표)
      cart.updateMatrixWorld(true);
      camera.position.copy(st.camOv.pos).applyMatrix4(cart.matrixWorld); camera.lookAt(st.camOv.tgt.clone().applyMatrix4(cart.matrixWorld));
      return;
    }
    if (st.mode === 'place') {
      camBlend = Math.min(1, camBlend + dt * 4);
      // 카트 위에서 내려다보기 (아래 받침대는 옆에서 낮게)
      if (st.level === 'upper') { camLocal.set(0.0, 1.72, 0.98); camTarget.set(0, 0.55, -0.12); }
      else { camLocal.set(0.95, 0.62, 0.95); camTarget.set(0, 0.24, 0.0); }
      camPos.copy(camLocal).applyMatrix4(cart.matrixWorld); const tgt = camTarget.clone().applyMatrix4(cart.matrixWorld);
      camera.position.lerp(camPos, camBlend < 1 ? Math.min(1, dt * 8) : 1); camera.lookAt(tgt);
      return;
    }
    camBlend = 0;
    const me = st.me, bob = st.hasCart ? Math.sin(st.t * 7) * Math.min(0.012, Math.hypot(c.vx, c.vz) * 0.01) : 0;
    camera.position.set(me.x, EYE + bob, me.z);
    camera.rotation.set(st.head.pitch, me.yaw + st.head.yaw, 0);
  }

  function updateHud() {
    const kg = loadKg(), c = st.cart, sp = Math.hypot(c.vx, c.vz);
    const fill = (lv) => { const v = items.filter((it) => it.level === lv).reduce((a, it) => a + it.size[0] * it.size[1] * it.size[2], 0); return Math.round(100 * v / LEVELS[lv].vol); };
    const lines = [];
    if (st.hasCart) {
      lines.push(`카트 ${CART.mass} kg + 짐 ${kg.toFixed(1)} kg = ${(CART.mass + kg).toFixed(1)} kg`);
      lines.push(`₩ ${loadWon().toLocaleString('ko-KR')} · ${sp.toFixed(2)} m/s${st.lastAccel != null ? ` · 0→1 m/s ${st.lastAccel.toFixed(1)}초` : ''}`);
      lines.push(`윗바구니 ${fill('upper')}% · 아래 받침대 ${fill('lower')}%${st.eggTotal ? ` · 🥚 깨짐 ${st.brokenEggs}/${st.eggTotal}` : ''}`);
    } else if (cart.visible) lines.push(`카트에서 손 놓음 · 초록 화살표 쪽 카트 옆에서 E${items.length ? ` (짐 ${items.length}개 그대로)` : ''}`);
    else lines.push('① 입구 카트 보관소에서 E 로 카트 잡기');
    if (staff.S.eggsToday) lines.push(`🧾 변상 예정 ₩ ${staff.damageWon.toLocaleString('ko-KR')} (오늘 깬 계란 ${staff.S.eggsToday}개 · 표시용)`);
    if (!st.placedOnce) lines.push(st.mode === 'place' ? '③ 카트 안을 클릭하면 그 자리에 놓여요' : st.hasCart || cart.visible ? '② 선반 상품을 마우스로 클릭(가운데 조준 X)' : '');
    elKg.textContent = lines.join('\n');
    const help = st.mode === 'place'
      ? `클릭 = 가리킨 곳에 놓기 · 우클릭/Esc 취소 · (선택) 휠·Q/E 돌리기 · R 눕히기 · Tab 아래 받침대 · 방향키 1 cm`
      : st.hasCart ? 'W/S 밀기 · A/D 방향 · 드래그 둘러보기 · 상품 클릭 = 집기 · 카트 속 상품도 클릭해 다시 집기 · G 카트 놓기'
        : 'WASD 걷기 · 드래그 둘러보기 · E 카트 잡기 · 출입구에서 E 나가기';
    if (elHelp.textContent !== help) elHelp.textContent = help;
    elTarget.style.background = ''; let coP = null;
    if (st.mode === 'place' && ghostSol) { elTarget.style.display = 'block'; elTarget.textContent = ghostSol.where === 'floor' ? '매장 바닥에 내려놓기' : { green: '안정적 — 여기 놓으면 OK', yellow: '흔들흔들 — 카트 움직이면 떨어질 수도', red: '위태위태 — 떨어질 것 같아요 (그래도 놓을 수 있음)' }[ghostSol.state]; elTarget.style.background = { green: '#e8fff0', yellow: '#fff6d6', red: '#ffe3e0' }[ghostSol.state]; }
    else if (st.mode === 'walk' && (coP = checkout.prompt())) { elTarget.style.display = 'block'; elTarget.textContent = coP.text; elTarget.style.background = coP.bg || ''; }
    else if (st.mode === 'walk' && nearMyCart()) { elTarget.style.display = 'block'; elTarget.style.background = ''; elTarget.textContent = `E 카트 잡기${items.length ? ` · 짐 ${items.length}개 그대로` : ''}${hover ? ` · 클릭 = ${hover.p.name} 집기` : ''}`; }
    else if (hover && st.mode === 'walk') { elTarget.style.display = 'block'; elTarget.style.background = ''; elTarget.textContent = `${hover.kind === 'floor' ? '(바닥) ' : hover.kind === 'cart' ? '(카트 속) ' : ''}${hover.p.name} · ${hover.p.kg} kg · ${hover.p.price.toLocaleString('ko-KR')}원 — 클릭/E 집기`; }
    else if (st.elecHover && st.mode === 'walk') { elTarget.style.display = 'block'; elTarget.style.background = ''; elTarget.textContent = st.elecHover.label; }
    else if (st.mode === 'walk' && nearCorral() && !st.hasCart) { elTarget.style.display = 'block'; elTarget.textContent = 'E 카트 잡기 (240L)'; }
    else if (st.mode === 'walk' && nearDoor() && !st.hasCart) { elTarget.style.display = 'block'; elTarget.textContent = 'E 나가기'; }
    else elTarget.style.display = 'none';
    if (isMobile) for (const el of [elKg, elHelp, elTarget]) touchEl(el);
  }
  // 터치: 키 이름 대신 탭/행동 버튼 문구 (원문은 data-raw 에 — mobileActs 가 버튼 라벨을 원문에서 뽑음)
  function touchEl(el) {
    const raw = el.textContent; if (raw === el.dataset.tt) return;
    const t = touchText(raw); el.dataset.raw = raw; el.dataset.tt = t; if (t !== raw) el.textContent = t;
  }
  const nearCorral = () => st.me.x > CORRAL.x0 - 1.5 && st.me.x < CORRAL.x1 + 1.5 && st.me.z > CORRAL.z0 - 1 && st.me.z < CORRAL.z1 + 2.5;
  const nearDoor = () => Math.abs(st.me.x - DOOR.x) < DOOR.w / 2 && st.me.z < 2.4;
  // 손 놓은 내 카트: 손잡이(카트 뒤)나 카트 몸통에서 1.5 m 안이면 잡을 수 있음 (바라볼 필요 없음)
  const cartDist = () => { const c = st.cart, hx = c.x + Math.sin(c.yaw) * 0.6, hz = c.z + Math.cos(c.yaw) * 0.6; return Math.min(Math.hypot(st.me.x - hx, st.me.z - hz), Math.hypot(st.me.x - c.x, st.me.z - c.z)); };
  const nearMyCart = () => !st.hasCart && cart.visible && cartDist() < 1.5;
  function regrabCart() {
    st.hasCart = true; const c = st.cart; c.vx = c.vz = c.w = 0;
    st.me.x = c.x + Math.sin(c.yaw) * 0.95; st.me.z = c.z + Math.cos(c.yaw) * 0.95; st.me.yaw = c.yaw; st.head.yaw = 0; st.head.pitch = -0.32;
    blip('grab'); toast('카트 다시 잡음', 900, '#1E5A45');
  }
  function grabCart() {
    st.hasCart = true; cart.visible = true; setCorral(13);
    const c = st.cart; c.x = st.me.x; c.z = st.me.z; c.yaw = st.me.yaw + st.head.yaw; st.head.yaw = 0; st.head.pitch = -0.32;
    c.x += -Math.sin(c.yaw) * 0.95; c.z += -Math.cos(c.yaw) * 0.95; c.vx = c.vz = c.w = 0;
    blip('grab');
  }
  function releaseCart() { st.hasCart = false; st.head.pitch = -0.1; st.cart.vx = st.cart.vz = st.cart.w = 0; blip('release'); }

  // ---------- 입력 ----------
  const dom = renderer.domElement;
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onMove = (e) => {
    if (e.pointerType === 'mouse') { const r0 = dom.getBoundingClientRect(); mouse.on = true; mouse.x = ((e.clientX - r0.left) / r0.width) * 2 - 1; mouse.y = -((e.clientY - r0.top) / r0.height) * 2 + 1; }
    if (st.mode !== 'place') return;
    const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const L = LEVELS[st.level];
    // 조준: ① 카트 속 상품 윗면 ② 바구니 입구(테두리 높이) ③ 받침 평면 순서 — 쌓인 짐이나 테두리를 가리켜도 그 자리로
    const aimAt = (h) => { const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h); pl.applyMatrix4(cart.matrixWorld); const v = ray.ray.intersectPlane(pl, new THREE.Vector3()); return v && cart.worldToLocal(v); };
    const ih = st.level === 'upper' && ray.intersectObjects(items.filter((it) => it.level === 'upper' && it.mesh !== st.held?.mesh).map((it) => it.mesh), true)[0];
    const rim = st.level === 'upper' && aimAt(RIM_Y), inTop = rim && Math.abs(rim.x) <= B.top.x + 0.12 && rim.z >= B.top.z0 - 0.12 && rim.z <= B.top.z1 + 0.12;
    const hit = ih ? cart.worldToLocal(ih.point.clone()) : inTop ? rim : aimAt(L.y);
    if (hit) { st.gx = hit.x; st.gz = hit.z; }
    const fh = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); // 매장 바닥(카트 밖에 놓기)
    if (fh) { cart.worldToLocal(fh); const d = Math.hypot(fh.x, fh.z), k = d > 2.2 ? 2.2 / d : 1; st.fx = fh.x * k; st.fz = fh.z * k; }
    st.nudge.x = st.nudge.z = 0;
  };
  const onUp = (e) => {
    const d = down; down = null; if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 500) return;
    if (e.target !== dom || checkout.busy) return;
    if (st.mode === 'place') { if (e.button === 2) cancelPlace(); else place(); return; }
    // 클릭한 그 자리의 상품 (마우스 위치 레이)
    if (e.pointerType === 'mouse') { const r0 = dom.getBoundingClientRect(); const t = pickTarget(new THREE.Vector2(((e.clientX - r0.left) / r0.width) * 2 - 1, -((e.clientY - r0.top) / r0.height) * 2 + 1)); if (t) hover = t; }
    if (!hover) { const r0 = dom.getBoundingClientRect(); ray.setFromCamera(ndc.set(((e.clientX - r0.left) / r0.width) * 2 - 1, -((e.clientY - r0.top) / r0.height) * 2 + 1), camera); ray.far = REACH; if (elec.handleClick(ray)) return; }
    if (hover) pick(); else if (nearMyCart()) regrabCart(); else if (!st.hasCart && nearCorral() && !cart.visible) grabCart();
  };
  const onWheel = (e) => { if (st.mode === 'place') { rotate(Math.sign(e.deltaY) * Math.PI / 12); e.preventDefault(); } };
  const onCtx = (e) => { if (st.mode === 'place') e.preventDefault(); };
  dom.addEventListener('pointerdown', onDown); dom.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); dom.addEventListener('wheel', onWheel, { passive: false }); dom.addEventListener('contextmenu', onCtx);

  function onKey(e) {
    const k = e.code;
    if (st.mode === 'place') {
      const stp = e.shiftKey ? 0.05 : 0.01;
      if (k === 'ArrowLeft' || k === 'KeyA') st.nudge.x -= stp; else if (k === 'ArrowRight' || k === 'KeyD') st.nudge.x += stp;
      else if (k === 'ArrowUp' || k === 'KeyW') st.nudge.z -= stp; else if (k === 'ArrowDown' || k === 'KeyS') st.nudge.z += stp;
      else if (k === 'KeyQ' && !e.repeat) rotate(Math.PI / 2); else if (k === 'KeyE' && !e.repeat) rotate(-Math.PI / 2);
      else if (k === 'KeyR' && !e.repeat) st.tip = !st.tip;
      else if (k === 'Tab' && !e.repeat) toggleLevel();
      else if ((k === 'Space' || k === 'Enter') && !e.repeat) place();
      else if (k === 'Escape' && !e.repeat) cancelPlace();
      e.preventDefault?.();
      if (st.held && (k === 'KeyR')) setGhost(st.held.p);
      return true;
    }
    if (e.repeat) return true;
    if (checkout.onKey(k)) return true; // 계산·출구·빈 박스
    if (k === 'KeyE' || k === 'Space') {
      if (nearMyCart()) regrabCart(); // 놓은 카트 옆에서는 E = 항상 카트 잡기 (상품은 클릭)
      else if (hover && (st.hasCart || cart.visible)) pick();
      else if (!hover && st.elecHover) { ray.setFromCamera(mouse.on ? ndc.set(mouse.x, mouse.y) : ndc.set(0, 0), camera); ray.far = REACH; elec.handleClick(ray); } // 가전 체험(냉장고 문·드럼·채널)
      else if (!st.hasCart && nearCorral() && cart.visible && items.length) toast(`내 카트(짐 ${items.length}개)는 ${Math.round(cartDist())} m 떨어진 초록 화살표 자리에 있어요`, 2600, '#1E5A45');
      else if (!st.hasCart && nearCorral()) grabCart();
      else if (st.hasCart && nearCorral() && !items.length) { releaseCart(); cart.visible = false; setCorral(14); }
      else if (!st.hasCart && nearDoor()) onExit?.();
      else if (hover && !st.hasCart) pick();
    } else if (k === 'KeyG' && st.hasCart) { releaseCart(); toast('카트 놓음 · 카트 옆에서 E 로 다시 잡기', 1600, '#1E5A45'); }
    else if (k === 'KeyX' && st.hasCart) removeLast();
    else if (k === 'Escape' && !st.hasCart && nearDoor()) onExit?.();
    return true;
  }

  // ---------- 계산대 구역 (checkout.js) ----------
  const checkout = createCheckout({ scene, camera, keep, canvasTex, hud, toast, st, items, cart, cg, cartMats: { wire: wireM, red: redM, dark: darkM }, obstacles, staff, brokenIn, onExit, ASSET, audio });

  // ---------- 프레임 ----------
  function update(dt, { look = [0, 0, 0], axes = { f: 0, s: 0 }, frozen = false } = {}) {
    dt = Math.min(dt, 0.05); st.t += dt;
    if (story?.locked) frozen = true; // 대화창·모드 선택 중엔 조작 잠금 (카트는 손 놓은 것처럼 감속)
    if (camera.aspect !== innerWidth / innerHeight) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
    if (st.mode === 'walk' && !frozen) {
      st.head.yaw += look[0] || 0; st.head.pitch = THREE.MathUtils.clamp(st.head.pitch - (look[1] || 0) * 0.8, -1.1, 0.6);
      if (checkout.busy) driveCart(dt, { f: 0, s: 0 }); // 계산 중엔 카트 고정 (둘러보기만)
      else if (st.hasCart) { st.head.yaw = THREE.MathUtils.clamp(st.head.yaw, -1.4, 1.4); driveCart(dt, axes); }
      else { if (Math.abs(st.head.yaw) > 0) { st.me.yaw += st.head.yaw; st.head.yaw = 0; } walk(dt, axes); }
    } else if (st.hasCart) driveCart(dt, { f: 0, s: 0 });
    cart.updateMatrixWorld(true);
    const shockNow = st.shock;
    stepPhysics(dt);
    st._shockNow = shockNow;
    if (st.mode === 'place' && st.held) {
      // 휠·키로 바뀐 눕힘 반영
      const want = itemDims(st.held.p, st.tip).join(); if (ghost?.userData.dims !== want) { setGhost(st.held.p); ghost.userData.dims = want; }
      ghostSol = solveGhost();
      if (ghost && ghostSol) {
        ghost.position.set(ghostSol.x, ghostSol.y, ghostSol.z); itemQuat(st.rotY, st.tip, ghost.quaternion);
        const C = { green: [0x33dd66, 0x1aff70], yellow: [0xffc400, 0xffd84a], red: [0xff4444, 0xff2222] }[ghostSol.state];
        ghostM.color.setHex(C[0]); ghostEdgeM.color.setHex(C[1]); ghostM.opacity = ghostSol.state === 'yellow' ? 0.3 + 0.15 * Math.sin(st.t * 10) : 0.35;
      }
    }
    tickFloor(dt);
    checkout.tick(dt); // 계산대 구역
    selfAvatar.position.set(st.me.x, 0, st.me.z); selfAvatar.rotation.y = st.me.yaw;
    updateCamera(dt);
    staff.tick(dt, { me: st.me, cartObj: st.cart, items, rimTop: B.top.yRear, cartHeld: st.hasCart, cartVisible: cart.visible });
    shoppers.tick(dt, { me: st.me, cart: cart.visible ? st.cart : null });
    story?.tick(dt);
    stock.tick(camera);
    detailCull(dt);
    hover = st.mode === 'walk' ? pickTarget() : null;
    if (st.mode === 'walk') { ray.setFromCamera(mouse.on ? ndc.set(mouse.x, mouse.y) : ndc.set(0, 0), camera); ray.far = REACH; st.elecHover = elec.probe(ray); }
    else st.elecHover = null;
    elec.tick(dt, { camera, me: st.me, cart: st.cart, shock: st._shockNow || 0, hud });
    updateHighlight();
    marker.visible = !st.hasCart && cart.visible; if (marker.visible) { arrow.position.y = 1.55 + Math.sin(st.t * 3) * 0.06; arrow.rotation.y += dt * 1.5; }
    if (st.toastT > 0) { st.toastT -= dt; if (st.toastT <= 0) elToast.style.display = 'none'; }
    { const pb = Math.round(Math.max(elPanel.getBoundingClientRect().bottom, story?.colBottom() || 0) + 10); if (pb !== st.msgTop) { st.msgTop = pb; hud.style.setProperty('--dh-msg-top', `${pb}px`); } const tb = elToast.style.display === 'block' ? Math.round(elToast.getBoundingClientRect().bottom + 8) : pb; if (tb !== st.msgTop2) { st.msgTop2 = tb; hud.style.setProperty('--dh-msg-top2', `${tb}px`); } const ach = st.achEl || (st.achEl = hud.querySelector('.dh-ach')); const ab = ach && ach.childElementCount ? Math.round(ach.getBoundingClientRect().bottom + 8) : tb; if (ab !== st.msgTop3) { st.msgTop3 = ab; hud.style.setProperty('--dh-msg-top3', `${ab}px`); } } // 알림은 왼쪽 정보 상자 바로 아래 (미니맵·폰 위젯과 안 겹침)
    updateHud();
    if (audio) {
      const c = st.cart;
      audio.tick(dt, { camera, cart: { held: st.hasCart, speed: Math.hypot(c.vx, c.vz), loadKg: loadKg(), x: c.x, z: c.z }, paused: frozen });
    }
  }
  // ---------- 손님 NPC 8유형 (npcs.js) — 기본은 꺼 둠, 스토리/자유 모드가 setActive 로 켬 ----------
  const shoppers = createShoppers({ scene, keep, obstacles, isBlocked: (x, z, r) => !!collide2D(x, z, r), types: NPC_TYPES.types, isMobile });
  shoppers.setActive([]);
  // 작은 소품 거리 컬링 (가전 코너·계산대·직원·집기): 반지름 < 2 m 메시가 카메라에서 DETAIL_R 넘게 멀면 레이어 0 에서 뺌.
  //   visible 은 각 모듈이 쓰므로 건드리지 않고 layers 로만. 움직이는 것(로봇·손님)도 matrixWorld 로 0.25 초마다 다시 잼.
  const DETAIL_R = isMobile ? 22 : 32, detailList = [];
  {
    const roots = [scene.getObjectByName('depot-electronics'), checkout.root, staff.root, stock.fxRoot, shoppers.root].filter(Boolean);
    for (const r of roots) r.traverse((o) => {
      if (!o.isMesh) return;
      const bs = o.isInstancedMesh ? (o.computeBoundingSphere(), o.boundingSphere) : (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere));
      if (!bs) return;
      o.updateWorldMatrix(true, false);
      const sc = o.matrixWorld.getMaxScaleOnAxis(), rad = bs.radius * sc;
      if (rad < 2) detailList.push({ o, c: bs.center.clone(), rad });
    });
  }
  let detailT = 0; const dv = new THREE.Vector3();
  function detailCull(dt) {
    if ((detailT -= dt) > 0) return; detailT = 0.25;
    const cp = camera.position;
    for (const d of detailList) {
      dv.copy(d.c).applyMatrix4(d.o.matrixWorld);
      const far = dv.distanceTo(cp) - d.rad > DETAIL_R;
      if (far) d.o.layers.disable(0); else d.o.layers.enable(0);
    }
  }
  function render(r) { r.render(scene, camera); }

  // ---------- 테스트·스샷용 ----------
  function stats() { let tris = 0, meshes = 0; scene.traverse((o) => { if (o.isMesh) { meshes++; const n = o.geometry.index ? o.geometry.index.count / 3 : (o.geometry.attributes.position?.count || 0) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } }); return { meshes, tris: Math.round(tris), items: items.length, bodies: world.bodies.length, products: prodMeshes.reduce((a, m) => a + m.count, 0), elec: elec.metrics() }; }
  // 같은 주행 모델로 0 → 1.2 m/s 시간, 1.2 m/s 에서 손 놓고/당겨 멈추는 거리, 제자리 90° 회전 시간
  function measure(extraKg) {
    const save = { ...st.cart }, saveItems = items.slice();
    const fake = extraKg > 0 ? [{ p: { kg: extraKg }, body: { position: { x: 0, z: 0.05 } }, size: [0.5, 0.3, 0.6] }] : [];
    items.length = 0; items.push(...fake);
    const c = st.cart; c.x = 57; c.z = 30; c.yaw = 0; c.vx = c.vz = c.w = 0; st.accT = null;
    const obsSave = obstacles.splice(0, obstacles.length);
    let t = 0; while (Math.hypot(c.vx, c.vz) < 1.0 && t < 30) { driveCart(1 / 120, { f: 1, s: 0 }); t += 1 / 120; }
    let tv = 0; while (tv < 12) { driveCart(1 / 120, { f: 1, s: 0 }); tv += 1 / 120; } const vTop = Math.hypot(c.vx, c.vz); // 계속 밀 때 최고 속도
    c.vx = 0; c.vz = -1.0; const z0 = c.z; let tc = 0; while (Math.hypot(c.vx, c.vz) > 0.01 && tc < 30) { driveCart(1 / 120, { f: 0, s: 0 }); tc += 1 / 120; }
    const coast = Math.abs(c.z - z0);
    c.x = 57; c.z = 30; c.vx = 0; c.vz = -1.0; c.yaw = 0; const z1 = c.z; let tb = 0; while (Math.hypot(c.vx, c.vz) > 0.01 && tb < 30) { driveCart(1 / 120, { f: -1, s: 0 }); tb += 1 / 120; if (c.vz > 0) break; }
    const brake = Math.abs(c.z - z1);
    c.vx = c.vz = c.w = 0; c.yaw = 0; let tt = 0; while (Math.abs(c.yaw) < Math.PI / 2 && tt < 30) { driveCart(1 / 120, { f: 0, s: 1 }); tt += 1 / 120; }
    obstacles.push(...obsSave); items.length = 0; items.push(...saveItems); Object.assign(st.cart, save);
    return { loadKg: extraKg, totalKg: CART.mass + extraKg, t0to1: +t.toFixed(2), vTop: +vTop.toFixed(2), coastM: +coast.toFixed(2), brakeM: +brake.toFixed(2), turn90s: +tt.toFixed(2), breakawayN: +(CART.breakaway * CART.crr * (CART.mass + extraKg) * CART.g).toFixed(0) };
  }

  // 바깥(game.js)이 이름표·말풍선 위치를 읽는 '내 아바타' 자리 — 1인칭이라 화면엔 안 그림
  const selfAvatar = new THREE.Object3D(); selfAvatar.userData = { jumpY: 0, sit: false };
  updateCamera(0);
  const api = {
    player: selfAvatar, scene, camera, update, render, onKey, stats, measure, st, items, LEVELS,
    get hover() { return hover; },
    mobileActs() { // 모바일 행동 버튼 (계산·출구·카트 잡기·집기·카트 놓기·놓기 등) — 터치 안내 문구의 「…」 와 같은 이름
      const c = checkout.mobileActs(); if (c) return c;
      const t = elTarget.style.display === 'block' ? (elTarget.dataset.raw ?? elTarget.textContent) : '', key = (code) => () => onKey({ code });
      if (st.mode === 'place') return [{ label: '놓기', icon: 'bag', run: key('Space') }, { label: '돌리기', icon: 'board', run: key('KeyQ'), gold: false }, { label: '놓기 취소', icon: 'stop', run: key('Escape'), gold: false }];
      const out = [];
      if (/^E /.test(t)) out.push({ label: t.slice(2).split(/ [·(]/)[0].trim(), icon: 'bag', run: key('KeyE') });
      else if (hover && /E 집기/.test(t)) out.push({ label: '집기', icon: 'bag', run: key('KeyE') });
      if (st.hasCart) out.push({ label: '카트 놓기', icon: 'stop', run: key('KeyG'), gold: false });
      return out.length ? out : null;
    },
    _dbg: {
      grabCart, releaseCart, place, cancelPlace, pick, removeLast, toggleLevel, rotate, solve: () => solveGhost(),
      setMe(x, z, yaw, pitch = -0.12) { st.me.x = x; st.me.z = z; st.me.yaw = yaw; st.head.yaw = 0; st.head.pitch = pitch; },
      setCart(x, z, yaw) { const c = st.cart; c.x = x; c.z = z; c.yaw = yaw; c.vx = c.vz = c.w = 0; st.me.x = x + Math.sin(yaw) * 0.95; st.me.z = z + Math.cos(yaw) * 0.95; st.me.yaw = yaw; },
      hold(id) { const p = BY_ID[id]; st.held = { p, src: null }; st.mode = 'place'; st.rotY = 0; st.tip = false; st.nudge.x = st.nudge.z = 0; setGhost(p); hud.classList.add('placing'); },
      setGhostAt(level, x, z, rotY = 0, tip = false) { st.level = level; st.gx = x; st.gz = z; st.fx = x; st.fz = z; st.rotY = rotY; st.tip = tip; st.nudge.x = st.nudge.z = 0; },
      drop(id, level, x, z, rotY = 0, tip = false) { api._dbg.hold(id); api._dbg.setGhostAt(level, x, z, rotY, tip); if (st.held && itemDims(st.held.p, tip).join() !== ghost?.userData.dims) { setGhost(st.held.p); ghost.userData.dims = itemDims(st.held.p, tip).join(); } ghostSol = solveGhost(); return place(); },
      firstOf(id) { const l = []; for (const m of prodMeshes) (m.userData.list || []).forEach((it, i) => { if ((m.userData.pids ? m.userData.pids[i] : m.userData.pid) === id) l.push(it); }); return l.length ? { ...l[Math.floor(l.length / 2)] } : null; },
      run(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) update(dt); },
      floorCount() { return floorItems.length; },
      clearFloor() { while (floorItems.length) { const fi = floorItems[0]; removeFloorItem(fi); disposeItemMesh(fi.mesh); } },
      ghostState() { return ghostSol && { where: ghostSol.where, state: ghostSol.state }; },
      mischief(kind, amt) { staff.mischief(kind, amt); }, staff: () => ({ ...staff.S, x: staff.root.position.x, z: staff.root.position.z, ach: staff.S.ach.slice() }), staffAt(x, z) { staff.root.position.set(x, 0, z); },
      co: checkout.dbg, ach: (t) => staff.achieve(t),
      shoppers: { on: (ids) => shoppers.setActive(ids || shoppers.list.map((n) => n.id)), list: () => shoppers.list.map((n) => ({ id: n.id, x: +n.x.toFixed(2), z: +n.z.toFixed(2), v: +n.v.toFixed(2), active: n.active, vis: n.mesh.visible })), edges: () => shoppers.nodes.map((n) => [n.x, n.z, n.nb.length]), place(id, x, z, yaw = 0) { const n = shoppers.list.find((q) => q.id === id); if (n) { n.x = x; n.z = z; n.yaw = yaw; n.stopT = 99; } }, go() { for (const n of shoppers.list) { n.stopT = 0; n.to = n.from; } } },
      elec: elec._dbg, openElecDoors: (v) => elec.openAllDoors(v),
      camAt(pos, tgt) { st.camOv = pos ? { pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt) } : null; st.camWorld = null; },
      camWorld(pos, tgt) { st.camWorld = pos ? { pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt) } : null; st.camOv = null; },
      settle(sec = 1.5) { for (let t = 0; t < sec; t += 1 / 60) { cart.updateMatrixWorld(true); stepPhysics(1 / 60); } },
      push(sec, f = 1, s = 0, run = false) { for (let t = 0; t < sec; t += 1 / 60) { driveCart(1 / 60, { f, s, run }); cart.updateMatrixWorld(true); stepPhysics(1 / 60); } },
    },
    dispose() {
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); dom.removeEventListener('wheel', onWheel); dom.removeEventListener('contextmenu', onCtx);
      elec.dispose(); staff.dispose(); checkout.dispose(); hud.remove(); css.remove();
      const seen = new Set();
      scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const mm of ms) if (!seen.has(mm)) { seen.add(mm); mm.map?.dispose(); mm.dispose(); }
        if (o.isInstancedMesh) o.dispose();
      });
      for (const d of disposables) if (!seen.has(d)) d.dispose?.();
      for (const b of world.bodies.slice()) world.removeBody(b);
      scene.clear();
    },
  };
  // ---------- 스토리 모드 (story/index.js, 지연 로드). ?depotStory=0 이면 끔 ----------
  let story = null, disposed = false;
  if (new URLSearchParams(location.search).get('depotStory') !== '0') {
    import('./story/index.js').then((m) => {
      if (disposed) return;
      story = m.createStory({ THREE, scene, keep, camera, st, items, loadKg, staff, checkout, shoppers, api, audio, isMobile, ASSET, onExit, getLevel: getAudioLevel });
      audioTaps.push((n, o) => story?.onAudio(n, o));
    }).catch((e) => console.warn('[depot-story]', e));
  }
  Object.defineProperty(api._dbg, 'story', { get: () => story });
  const dispose0 = api.dispose;
  api.dispose = () => { disposed = true; try { story?.dispose(); } catch (e) { console.warn('[depot-story]', e); } story = null; dispose0(); };
  return api;
}
