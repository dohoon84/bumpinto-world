// [depot] 범창고 계산대 구역 (앞벽 z 0.3 ~ 13, x 2 ~ 63) — 창고형 마트 계산 흐름 전체.
//   계산대 11줄(유인 7 · 마감 4) + 셀프 계산대 6대, 긴 컨베이어(칸막이), 캐셔 NPC 스캔, 무거운 건 핸드 스캐너로 카트째,
//   고객 표시기 합계, 결제(표시·연습용 — 실제 bum/원 차감 없음, 서버 쓰기 없음), 영수증 출력 애니메이션(디자이너 영수증 양식),
//   포장대·무료 빈 박스 코너, 출구 영수증 확인(직원 형광펜 줄긋기 / 파손 0건이면 '참 잘했어요' 도장), 줄 서는 NPC 손님(인스턴싱).
//   오디오용 이벤트: window 'depot:sfx' CustomEvent { detail: { name, ... } } — 이름은 depot-coord.md 참고.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CO = {
  LANES: 11, X0: 16, DX: 3.6, BELT: { z0: 7.0, z1: 11.7, y: 0.86, w: 0.56 }, SCAN_Z: 6.85, REG: { z0: 5.5, z1: 7.0 }, BAG: { z0: 4.55, z1: 5.5 },
  STAFFED: [0, 1, 3, 4, 6, 8, 10], NPC_LANES: [0, 1, 4, 6, 10], // 3·8번은 비어 있는 유인 계산대(플레이어용)
  KIOSK: [[56.4, 7.2], [58.9, 7.2], [61.4, 7.2], [56.4, 10.4], [58.9, 10.4], [61.4, 10.4]],
  EXIT: { x: 6, w: 5 }, CHECK: { x: 9.4, z: 2.0 }, BOXC: { x0: 2, x1: 12, z0: 4, z1: 12 }, TABLES: [17.6, 24.8, 32, 39.2, 46.4, 53.6],
};
export const laneX = (k) => CO.X0 + k * CO.DX;
const beltX = (k) => laneX(k) - 1.05;
const EGG_WON = Math.round(8480 / 30);
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}`;
// 오디오: D 스트림 audio.play(name, opts) 가 있으면 그 이름으로, 항상 window 'depot:sfx' 이벤트도 보냄
const AUDIO_NAME = { 'checkout.scan': 'checkout-scan', 'checkout.scan.handheld': 'checkout-scan', 'checkout.belt.start': 'checkout-belt', 'checkout.belt.stop': 'checkout-belt', 'checkout.receipt.print': 'checkout-printer', 'checkout.pay': 'checkout-pay', 'checkout.done': 'checkout-done', 'checkout.receipt.check': 'checkout-done', 'checkout.box.take': 'item-pick', 'checkout.unload': 'item-place' };
let AUDIO = null;
const sfx = (name, extra = {}) => {
  try { window.dispatchEvent(new CustomEvent('depot:sfx', { detail: { name, ...extra } })); } catch { /* 이벤트 없음 */ }
  const a = AUDIO_NAME[name]; if (!a || !AUDIO?.play) return;
  try { AUDIO.play(a, { ...extra, ...(name.startsWith('checkout.belt') ? { on: name.endsWith('start'), id: `belt-${extra.lane ?? 0}` } : {}), ...(name === 'checkout.box.take' ? { material: 'cardboard' } : {}) }); } catch { /* 소리 없어도 됨 */ }
};
const CASHIERS = ['박스범', '스캔범', '바코범', '계산범', '영수범', '포장범', '카트범'];
const FORTUNE = ['계란은 맨 위에', '오늘은 쌀을 아래칸에', '급정거는 계란의 적', '빈 박스는 무료, 인내심은 유료', '카트는 밀 때보다 멈출 때가 어렵다', '시식 코너는 두 바퀴까지'];

export function createCheckout(ctx) {
  const { scene, camera, keep, canvasTex, hud, toast, st, items, cart, cg, obstacles, staff, brokenIn, ASSET } = ctx; AUDIO = ctx.audio || null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  const yawQ = (y) => q.setFromAxisAngle(UP, y);
  const tl = new THREE.TextureLoader(), TX = {};
  for (const n of ['co-floor-arrow', 'co-stamp-beom', 'co-member-card']) tl.load(`${ASSET}${n}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; TX[n] = t; keep(t); if (n === 'co-floor-arrow') { arrowM.map = t; arrowM.needsUpdate = true; arrowMesh.visible = true; } });
  const stampImg = new Image(); stampImg.src = `${ASSET}co-stamp-beom.webp`;
  const L = (c) => keep(new THREE.MeshLambertMaterial({ color: c }));
  const M = { green: L(0x1e5a45), steel: L(0xa9b1b8), dark: L(0x22262a), cream: L(0xf3eada), kraft: L(0xc8965a), wood: L(0xb98a55) };
  const parts = { green: [], steel: [], dark: [], cream: [], kraft: [], wood: [] };
  const box = (mat, w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); parts[mat].push(g); };
  const cyl = (mat, r, h, x, y, z, seg = 8) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y, z); parts[mat].push(g); };
  const obs = (x0, x1, z0, z1) => obstacles.push({ x0, x1, z0, z1, co: true });
  const root = new THREE.Group(); scene.add(root);

  // ---------- 계산대 줄 ----------
  const beltLen = CO.BELT.z1 - CO.BELT.z0, beltZc = (CO.BELT.z0 + CO.BELT.z1) / 2;
  const beltTopGeos = [];
  for (let k = 0; k < CO.LANES; k++) {
    const bx = beltX(k);
    box('green', 0.8, 0.8, beltLen + 0.1, bx, 0.4, beltZc); // 컨베이어 몸통
    for (const s of [-1, 1]) box('steel', 0.06, 0.07, beltLen + 0.1, bx + s * 0.32, CO.BELT.y + 0.01, beltZc); // 옆 레일
    box('steel', 0.84, 0.05, 0.12, bx, CO.BELT.y, CO.BELT.z1 + 0.05);
    const bt = new THREE.PlaneGeometry(CO.BELT.w, beltLen); bt.rotateX(-Math.PI / 2); bt.translate(bx, CO.BELT.y + 0.006, beltZc); beltTopGeos.push(bt);
    // 계산 스테이션 (스캐너 유리 · 금전등록기 · 영수증 프린터)
    box('green', 0.8, 0.94, CO.REG.z1 - CO.REG.z0, bx, 0.47, (CO.REG.z0 + CO.REG.z1) / 2);
    box('dark', 0.5, 0.02, 0.36, bx, 0.95, CO.SCAN_Z);
    box('dark', 0.34, 0.24, 0.26, bx - 0.18, 1.06, 5.85); box('dark', 0.3, 0.2, 0.03, bx - 0.18, 1.3, 5.8, 0.5); // 단말기 + 캐셔 화면
    box('cream', 0.2, 0.12, 0.18, bx + 0.22, 1.0, 5.75); // 영수증 프린터
    box('steel', 0.8, 0.06, CO.BAG.z1 - CO.BAG.z0, bx, 0.82, (CO.BAG.z0 + CO.BAG.z1) / 2); // 나오는 쪽 선반
    for (const dz of [0.1, 0.85]) box('steel', 0.05, 0.8, 0.05, bx + 0.35, 0.4, CO.BAG.z0 + dz);
    // 고객 표시기 기둥 + 번호 큐브 기둥
    cyl('steel', 0.025, 0.5, bx + 0.32, 1.17, 5.62); box('dark', 0.4, 0.27, 0.04, bx + 0.32, 1.52, 5.62);
    cyl('steel', 0.04, 1.7, bx, 1.8, 5.2);
    // 캐셔 발판 · 칸막이
    box('dark', 0.95, 0.03, 2.2, bx - 0.92, 0.015, 6.3);
    obs(bx - 0.42, bx + 0.42, CO.BAG.z0, CO.BELT.z1 + 0.1); obs(bx - 1.42, bx - 0.42, 5.1, 7.6);
  }
  // 셀프 계산대
  for (const [kx, kz] of CO.KIOSK) {
    box('cream', 0.7, 0.92, 0.55, kx, 0.46, kz); box('green', 0.72, 0.08, 0.57, kx, 0.95, kz); box('dark', 0.36, 0.02, 0.3, kx - 0.12, 1.0, kz + 0.05);
    cyl('steel', 0.03, 0.45, kx + 0.18, 1.2, kz - 0.15); box('dark', 0.46, 0.34, 0.05, kx + 0.05, 1.5, kz - 0.18);
    box('steel', 0.55, 0.05, 0.5, kx + 0.68, 0.8, kz); for (const dx of [0.45, 0.9]) box('steel', 0.04, 0.8, 0.04, kx + dx, 0.4, kz + 0.2);
    obs(kx - 0.4, kx + 0.98, kz - 0.32, kz + 0.32);
  }
  // 포장대 (앞벽 쪽)
  for (const tx of CO.TABLES) {
    box('kraft', 2.6, 0.05, 0.9, tx, 0.9, 2.6); for (const [dx, dz] of [[-1.2, -0.38], [1.2, -0.38], [-1.2, 0.38], [1.2, 0.38]]) box('steel', 0.05, 0.88, 0.05, tx + dx, 0.44, 2.6 + dz);
    box('steel', 2.5, 0.04, 0.8, tx, 0.25, 2.6); box('dark', 0.18, 0.1, 0.1, tx - 1.0, 0.98, 2.35); // 테이프 디스펜서
    obs(tx - 1.32, tx + 1.32, 2.12, 3.08);
  }
  // 출구 영수증 확인대
  box('green', 0.7, 1.05, 0.5, CO.CHECK.x, 0.525, CO.CHECK.z); box('cream', 0.76, 0.04, 0.56, CO.CHECK.x, 1.07, CO.CHECK.z);
  obs(CO.CHECK.x - 0.4, CO.CHECK.x + 0.4, CO.CHECK.z - 0.3, CO.CHECK.z + 0.3);
  // 출구 문틀
  for (const s of [-1, 1]) box('steel', 0.12, 3.4, 0.18, CO.EXIT.x + s * CO.EXIT.w / 2, 1.7, 0.2); box('steel', CO.EXIT.w + 0.24, 0.16, 0.18, CO.EXIT.x, 3.45, 0.2);
  // 빈 박스 코너 파렛트
  const PALS = [[3.6, 6], [3.6, 9.2], [7.2, 6], [7.2, 9.2], [10.4, 7.6]];
  for (const [px, pz] of PALS) { box('wood', 1.2, 0.14, 1.0, px, 0.07, pz); obs(px - 0.62, px + 0.62, pz - 0.52, pz + 0.52); }
  box('kraft', 1.3, 0.9, 0.9, 10.4, 0.45, 10.4); obs(9.7, 11.1, 9.9, 10.9); // 박스 수거함
  for (const [k, list] of Object.entries(parts)) if (list.length) { const g = keep(mergeGeometries(list)); list.forEach((x) => x.dispose()); const m = new THREE.Mesh(g, M[k]); root.add(m); }

  // 컨베이어 벨트(고무, 흐르는 텍스처 1장 공유)
  const beltTex = keep(canvasTex(64, 256, (g) => { g.fillStyle = '#26292c'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#34383c'; for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 64, 6); }));
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(1, beltLen * 3);
  const beltM = keep(new THREE.MeshLambertMaterial({ map: beltTex }));
  root.add(new THREE.Mesh(keep(mergeGeometries(beltTopGeos)), beltM)); beltTopGeos.forEach((g) => g.dispose());

  // 계산대 번호 큐브 (디자이너 '계산대 07' 양식, 11개를 아틀라스 1장 · 지오메트리 1개로)
  const cubeTex = keep(canvasTex(1024, 768, (g) => {
    for (let k = 0; k < 12; k++) {
      const x = (k % 4) * 256, y = Math.floor(k / 4) * 256, open = CO.STAFFED.includes(k), self = k === 11;
      g.fillStyle = '#123b2d'; g.fillRect(x, y, 256, 256); g.fillStyle = open || self ? '#1E5A45' : '#4a524e'; g.fillRect(x + 8, y + 8, 240, 240);
      g.textAlign = 'center'; g.fillStyle = '#F3EADA'; g.font = '800 34px "Pretendard",sans-serif'; g.fillText(self ? '셀프' : '계산대', x + 128, y + 58);
      g.fillStyle = open || self ? '#F2C230' : '#9aa39e'; g.font = `900 ${self ? 76 : 120}px "Pretendard",sans-serif`; g.fillText(self ? 'SELF' : String(k + 1).padStart(2, '0'), x + 128, y + (self ? 160 : 176));
      g.fillStyle = '#123b2d'; g.beginPath(); g.roundRect(x + 38, y + 196, 180, 40, 20); g.fill(); g.fillStyle = '#F3EADA'; g.font = '700 22px "Pretendard",sans-serif'; g.fillText(self ? '카드 전용' : open ? '카트 · 대량 구매' : '계산 마감', x + 128, y + 224);
    }
  }));
  const cubeGeos = [];
  const addCube = (cell, x, y, z, s) => {
    const g = new THREE.BoxGeometry(s, s, s), uv = g.attributes.uv, u0 = (cell % 4) / 4, v0 = 1 - (Math.floor(cell / 4) + 1) / 3;
    for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 4); if (f === 2 || f === 3) uv.setXY(i, u0 + 0.01, v0 + 0.01); else uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 3); }
    g.translate(x, y, z); cubeGeos.push(g);
  };
  for (let k = 0; k < CO.LANES; k++) addCube(k, beltX(k), 2.95, 5.2, 0.62);
  addCube(11, 58.9, 3.2, 8.8, 0.9);
  root.add(new THREE.Mesh(keep(mergeGeometries(cubeGeos)), keep(new THREE.MeshBasicMaterial({ map: cubeTex })))); cubeGeos.forEach((g) => g.dispose());
  // 계산대 켜짐 등 (초록 = 열림, 빨강 = 마감)
  const lampG = keep(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 10)), lamps = new THREE.InstancedMesh(lampG, keep(new THREE.MeshBasicMaterial()), CO.LANES), col = new THREE.Color();
  for (let k = 0; k < CO.LANES; k++) { m4.makeTranslation(beltX(k), 3.35, 5.2); lamps.setMatrixAt(k, m4); lamps.setColorAt(k, col.setHex(CO.STAFFED.includes(k) ? 0x35e07a : 0xe0453a)); }
  lamps.computeBoundingSphere(); root.add(lamps);

  // 패널류 (표시기 대기 화면 · 셀프 화면 · 마감 줄 · 안내판) — 텍스처 하나에 모아 지오메트리 1개
  const panelTex = keep(canvasTex(1024, 512, (g) => {
    // [0] 표시기 대기 (0,0,512,256)
    g.fillStyle = '#0f2a20'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#F2C230'; g.font = '900 54px "Pretendard",sans-serif'; g.textAlign = 'center'; g.fillText('어서오세요', 256, 110); g.fillStyle = '#F3EADA'; g.font = '700 30px "Pretendard",sans-serif'; g.fillText('범창고 정자점 · 회원카드 준비', 256, 170);
    // [1] 셀프 화면 (512,0)
    g.fillStyle = '#1E5A45'; g.fillRect(512, 0, 512, 256); g.fillStyle = '#fff'; g.font = '900 48px "Pretendard",sans-serif'; g.fillText('셀프 계산', 768, 96); g.font = '700 28px "Pretendard",sans-serif'; g.fillText('상품을 스캐너에 대 주세요', 768, 150); g.fillStyle = '#F2C230'; g.fillRect(612, 186, 312, 44); g.fillStyle = '#123b2d'; g.font = '800 26px "Pretendard",sans-serif'; g.fillText('시작하기 ▶', 768, 217);
    // [2] 계산 마감 띠 (0,256,512,128)
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f2b705' : '#13203d'; g.beginPath(); g.moveTo(i * 36 - 20, 256); g.lineTo(i * 36 + 16, 256); g.lineTo(i * 36 - 20, 384); g.lineTo(i * 36 - 56, 384); g.fill(); }
    g.fillStyle = '#fff'; g.fillRect(96, 278, 320, 84); g.fillStyle = '#D9442E'; g.font = '900 52px "Pretendard",sans-serif'; g.fillText('계산 마감', 256, 340);
    // [3] 빈 박스 코너 안내 (512,256,512,256)
    g.fillStyle = '#C8965A'; g.fillRect(512, 256, 512, 256); g.fillStyle = '#5a3a1a'; g.fillRect(524, 268, 488, 232); g.fillStyle = '#C8965A'; g.fillRect(532, 276, 472, 216);
    g.fillStyle = '#3a2410'; g.font = '900 64px "Pretendard",sans-serif'; g.fillText('📦 무료 빈 박스', 768, 360); g.font = '800 32px "Pretendard",sans-serif'; g.fillText('FREE BOXES · 포장은 셀프', 768, 412); g.font = '700 24px "Pretendard",sans-serif'; g.fillText('테이프는 포장대에 있어요', 768, 456);
    // [4] 계산대 간판 (0,384,512,128)
    g.fillStyle = '#1E5A45'; g.fillRect(0, 384, 512, 128); g.fillStyle = '#F2C230'; g.font = '900 64px "Pretendard",sans-serif'; g.fillText('계산대  CHECKOUT', 256, 468);
  }));
  const panelGeos = [];
  const panel = (rect, w, h, x, y, z, ry = 0) => { const [u0, v0, u1, v1] = rect, g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); if (ry) g.rotateY(ry); g.translate(x, y, z); panelGeos.push(g); };
  const R_IDLE = [0, 0.5, 0.5, 1], R_SELF = [0.5, 0.5, 1, 1], R_CLOSED = [0, 0.25, 0.5, 0.5], R_BOX = [0.5, 0, 1, 0.5], R_SIGN = [0, 0, 0.5, 0.25];
  for (let k = 0; k < CO.LANES; k++) {
    panel(R_IDLE, 0.36, 0.22, beltX(k) + 0.32, 1.52, 5.643);
    if (!CO.STAFFED.includes(k)) { panel(R_CLOSED, 1.6, 0.4, laneX(k) + 0.25, 0.95, 12.0); panel(R_CLOSED, 1.6, 0.4, laneX(k) + 0.25, 0.95, 11.99, Math.PI); }
  }
  for (const [kx, kz] of CO.KIOSK) { const g0 = panelGeos.length; panel(R_SELF, 0.42, 0.3, kx + 0.05, 1.5, kz - 0.15); panelGeos[g0].rotateX(0); }
  panel(R_BOX, 3.2, 1.6, 7.2, 2.6, 12.6, Math.PI); panel(R_BOX, 3.2, 1.6, 7.2, 2.6, 12.61);
  for (const x of [22, 40]) { panel(R_SIGN, 6, 1.5, x, 4.6, 13.2); panel(R_SIGN, 6, 1.5, x, 4.6, 13.19, Math.PI); }
  root.add(new THREE.Mesh(keep(mergeGeometries(panelGeos)), keep(new THREE.MeshBasicMaterial({ map: panelTex, side: THREE.FrontSide })))); panelGeos.forEach((g) => g.dispose());
  // 바닥 화살표 '계산대' (디자이너 스텐실)
  const arrowGeos = [];
  for (const k of CO.STAFFED) { const g = new THREE.PlaneGeometry(1.5, 0.75); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(laneX(k) + 0.2, 0.007, 13.0); arrowGeos.push(g); }
  const arrowM = keep(new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const arrowMesh = new THREE.Mesh(keep(mergeGeometries(arrowGeos)), arrowM); arrowMesh.visible = false; root.add(arrowMesh); arrowGeos.forEach((g) => g.dispose());
  // 출구 유리 · EXIT 사인
  const exitGlass = new THREE.Mesh(keep(new THREE.PlaneGeometry(CO.EXIT.w, 3.3)), keep(new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.5 }))); exitGlass.position.set(CO.EXIT.x, 1.65, 0.12); root.add(exitGlass);
  const exitSignTex = keep(canvasTex(512, 160, (g) => { g.fillStyle = '#1b8a3a'; g.fillRect(0, 0, 512, 160); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '900 64px "Pretendard",sans-serif'; g.fillText('출구 EXIT 🏃', 256, 82); g.font = '700 28px "Pretendard",sans-serif'; g.fillText('영수증을 보여 주세요', 256, 132); }));
  const exitSign = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.4, 0.75)), keep(new THREE.MeshBasicMaterial({ map: exitSignTex }))); exitSign.position.set(CO.EXIT.x, 3.95, 0.16); root.add(exitSign);

  // ---------- 빈 박스 (인스턴스 1개: 파렛트·포장대·수거함) ----------
  const kraftTex = keep(canvasTex(256, 256, (g) => { g.fillStyle = '#c8965a'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(90,58,26,.35)'; g.fillRect(0, 120, 256, 16); g.fillRect(120, 0, 16, 256); g.fillStyle = 'rgba(60,36,16,.55)'; g.font = '900 30px "Pretendard",sans-serif'; g.textAlign = 'center'; g.fillText('범창고', 64, 70); g.fillText('THIS SIDE UP', 190, 210); }));
  const boxM = keep(new THREE.MeshLambertMaterial({ map: kraftTex })), unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
  const boxList = [];
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const [px, pz] of PALS.slice(0, 4)) { let y = 0.14; for (let lv = 0; lv < 5; lv++) { const h = 0.22 + rnd() * 0.18; for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) { if (lv === 4 && rnd() < 0.5) continue; const w = 0.5 + rnd() * 0.08, d = 0.42 + rnd() * 0.06; boxList.push([px + dx, y + h / 2, pz + dz, w, h, d, (rnd() - 0.5) * 0.2]); } y += h; } }
  for (let i = 0; i < 9; i++) boxList.push([10.4 + (rnd() - 0.5) * 0.8, 0.14 + 0.09 + i * 0.04, 7.6 + (rnd() - 0.5) * 0.4, 1.0, 0.035, 0.75, rnd()]); // 납작하게 접은 박스 더미
  for (let i = 0; i < 4; i++) boxList.push([10.1 + rnd() * 0.6, 1.0 + rnd() * 0.15, 10.3 + rnd() * 0.3, 0.42, 0.32, 0.38, rnd() * 1.2]); // 수거함에서 삐져나온 박스
  for (const tx of CO.TABLES) { boxList.push([tx + 0.5, 1.08, 2.62, 0.55, 0.32, 0.45, 0.1], [tx - 0.3, 0.27 + 0.18, 2.6, 0.6, 0.36, 0.5, -0.2]); }
  const boxes = new THREE.InstancedMesh(unitBox, boxM, boxList.length);
  boxList.forEach(([x, y, z, w, h, d, ry], i) => { m4.compose(v3.set(x, y, z), yawQ(ry), new THREE.Vector3(w, h, d)); boxes.setMatrixAt(i, m4); });
  boxes.computeBoundingSphere(); root.add(boxes);

  // ---------- 사람 (캐셔 · 출구 직원 · 손님) — 인스턴스 4개 ----------
  const legG = keep(new THREE.BoxGeometry(0.32, 0.84, 0.18)); legG.translate(0, 0.42, 0);
  const torsoG = keep(new THREE.CylinderGeometry(0.19, 0.22, 0.64, 8)); torsoG.translate(0, 1.16, 0);
  const headG = keep(new THREE.SphereGeometry(0.14, 10, 8)); headG.translate(0, 1.62, 0);
  const hairG = keep(new THREE.SphereGeometry(0.148, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)); hairG.translate(0, 1.64, -0.01);
  const shopperCols = [0x2f6fb3, 0xd9442e, 0x7b5aa6, 0xe0a030, 0x3a8f6a, 0x5a6470, 0xc0567a, 0x2a2f3a];
  const people = []; // {x, z, yaw, col, kind, ph}
  const cashierAt = (k) => ({ x: beltX(k) - 0.9, z: 6.3, yaw: Math.PI / 2 });
  for (let i = 0; i < CO.STAFFED.length; i++) { const c = cashierAt(CO.STAFFED[i]); people.push({ ...c, col: 0x1e5a45, kind: 'cashier', lane: CO.STAFFED[i], ph: i }); }
  people.push({ x: 58.9, z: 12.2, yaw: Math.PI, col: 0x1e5a45, kind: 'attendant', ph: 0 });
  people.push({ x: CO.CHECK.x + 0.55, z: CO.CHECK.z + 0.05, yaw: -Math.PI / 2, col: 0x1e5a45, kind: 'checker', ph: 0 });
  const checker = people[people.length - 1];
  // 손님 (줄마다 2명: 계산 중 1 · 대기 1)
  const shoppers = [];
  CO.NPC_LANES.forEach((k, li) => { for (let j = 0; j < 2; j++) { const s = { lane: k, slot: j, z: j ? 12.9 : 9.2, tz: j ? 12.9 : 9.2, wait: 4 + ((li * 3 + j * 5) % 7), state: j ? 'queue' : 'serve', col: shopperCols[(li * 2 + j) % shopperCols.length], scale: 1, items: 3 + ((li + j) % 3) }; shoppers.push(s); people.push({ x: 0, z: 0, yaw: 0, col: s.col, kind: 'shopper', ref: s, ph: li + j }); } });
  const NP = people.length;
  const legI = new THREE.InstancedMesh(legG, M.dark, NP), torsoI = new THREE.InstancedMesh(torsoG, keep(new THREE.MeshLambertMaterial()), NP), headI = new THREE.InstancedMesh(headG, keep(new THREE.MeshLambertMaterial({ color: 0xf0c9a0 })), NP), hairI = new THREE.InstancedMesh(hairG, keep(new THREE.MeshLambertMaterial({ color: 0x2a1d14 })), NP);
  const pI = [legI, torsoI, headI, hairI]; for (const im of pI) { im.frustumCulled = false; root.add(im); }
  people.forEach((p, i) => torsoI.setColorAt(i, col.setHex(p.col)));
  // 손님 카트 (카트 모델 재사용, 인스턴스 3개) · 벨트 위 손님 상품
  const npcCart = [new THREE.InstancedMesh(cg.wire, ctx.cartMats.wire, shoppers.length), new THREE.InstancedMesh(cg.red, ctx.cartMats.red, shoppers.length), new THREE.InstancedMesh(cg.dark, ctx.cartMats.dark, shoppers.length)];
  for (const im of npcCart) { im.frustumCulled = false; root.add(im); }
  const npcItemG = keep(new THREE.BoxGeometry(1, 1, 1)), NBI = 5, npcItems = new THREE.InstancedMesh(npcItemG, keep(new THREE.MeshLambertMaterial({ map: kraftTex })), CO.NPC_LANES.length * NBI + shoppers.length * 3);
  npcItems.frustumCulled = false; root.add(npcItems);
  const itemCols = [0xffffff, 0xcfe9fb, 0xf4c430, 0xe8b0a0, 0xb71c1c, 0x9ad08a];
  for (let i = 0; i < npcItems.count; i++) npcItems.setColorAt(i, col.setHex(itemCols[i % itemCols.length]));
  // 칸막이 바 (벨트 위 '다음 손님')
  const divG = keep(new THREE.BoxGeometry(0.5, 0.05, 0.05)), dividers = new THREE.InstancedMesh(divG, keep(new THREE.MeshLambertMaterial({ color: 0xd9442e })), CO.LANES + 1);
  for (let k = 0; k < CO.LANES; k++) { m4.makeTranslation(beltX(k), CO.BELT.y + 0.035, CO.BELT.z1 - 0.3); dividers.setMatrixAt(k, m4); }
  m4.makeScale(0, 0, 0); dividers.setMatrixAt(CO.LANES, m4); dividers.computeBoundingSphere(); root.add(dividers);

  // ---------- 플레이어 계산 ----------
  const css = document.createElement('style');
  css.textContent = `#depot-hud .co-scan{position:absolute;left:16px;top:var(--dh-msg-top3,var(--dh-msg-top,200px));background:rgba(18,59,45,.94);border-radius:16px;padding:12px 18px;min-width:200px;box-shadow:0 10px 26px rgba(0,0,0,.35);display:none;animation:coPop .22s ease-out}
#depot-hud .co-scan b{display:block;color:#F2C230;font-size:15px}#depot-hud .co-scan .n{font-size:20px;font-weight:900}#depot-hud .co-scan .p{font-size:30px;font-weight:900;letter-spacing:-.5px}
#depot-hud .co-scan.bad{background:#D9442E}#depot-hud .co-scan.bad b{color:#fff}
@keyframes coPop{from{transform:scale(.85);opacity:.3}to{transform:none;opacity:1}}
#depot-hud .co-pay{position:absolute;box-sizing:border-box;left:16px;top:var(--dh-msg-top3,var(--dh-msg-top,200px));width:min(330px,calc(100vw - 32px));background:#FBF7EE;color:#22262A;border-radius:16px;padding:14px 16px 12px;box-shadow:0 14px 34px rgba(0,0,0,.4);pointer-events:auto;display:none}
#depot-hud .co-pay h3{margin:0 0 8px;font-size:16px;color:#1E5A45}#depot-hud .co-pay .r{display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding:2px 0}
#depot-hud .co-pay .r.red{color:#D9442E}#depot-hud .co-pay .tot{border-top:2px dashed #c9bfa8;margin-top:6px;padding-top:6px;font-size:22px;font-weight:900}
#depot-hud .co-pay img{position:absolute;right:-12px;top:6px;width:100px;border-radius:8px;transform:rotate(6deg);box-shadow:0 6px 14px rgba(0,0,0,.3);animation:coCard .5s ease-out}
#depot-hud .co-pay h3{padding-right:96px}
@keyframes coCard{from{transform:translateX(60px) rotate(8deg);opacity:0}}
#depot-hud .co-pay button{font:inherit;font-weight:900;border:0;border-radius:10px;padding:9px 10px;margin-top:8px;width:100%;background:#1E5A45;color:#F3EADA;font-size:14px;cursor:pointer}
#depot-hud .co-pay button.alt{background:#e7dfcd;color:#22262A;margin-top:6px}#depot-hud .co-pay .note{font-size:11px;color:#6b6f72;margin-top:6px;font-weight:600}
#depot-hud .co-rcpt{position:absolute;left:16px;top:var(--dh-msg-top3,var(--dh-msg-top,200px));width:250px;max-height:calc(100vh - var(--dh-msg-top3,var(--dh-msg-top,200px)) - 170px);overflow:auto;pointer-events:auto;display:none;filter:drop-shadow(0 10px 22px rgba(0,0,0,.35));scrollbar-width:none}
#depot-hud .co-rcpt canvas{width:100%;display:block;clip-path:inset(0 0 100% 0);transition:clip-path 2.3s linear}#depot-hud .co-rcpt.on canvas{clip-path:inset(0 0 0 0)}
#depot-hud .co-rcpt .x{position:sticky;top:6px;float:right;margin-right:6px;background:#1E5A45;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:900;cursor:pointer;z-index:2}
#depot-hud .co-chip{position:absolute;left:16px;top:var(--dh-msg-top3,var(--dh-msg-top,200px));background:#FBF7EE;color:#1E5A45;border-radius:12px;padding:7px 12px;font-weight:900;font-size:13px;pointer-events:auto;cursor:pointer;display:none;box-shadow:0 6px 16px rgba(0,0,0,.3)}
@media (max-width:560px){#depot-hud .co-rcpt{width:190px}#depot-hud .co-scan{top:40%;min-width:160px}#depot-hud .co-scan .p{font-size:24px}}

body.mobile #depot-hud .co-pay,body.mobile #depot-hud .co-rcpt,body.mobile #depot-hud .co-chip,body.mobile #depot-hud .co-scan{left:50%;transform:translateX(-50%);top:calc(var(--m-t,12px) + 54px)}
body.mobile #depot-hud .co-pay{width:min(330px,calc(100vw - 32px));max-height:calc(100vh - var(--m-t,12px) - 66px);overflow:auto;padding:10px 12px}
body.mobile #depot-hud .co-pay button{min-height:44px}
body.mobile #depot-hud .co-rcpt{width:210px;max-height:calc(100vh - var(--m-t,12px) - 66px)}
body.mobile #depot-hud .co-scan{animation:none}
body.mobile #depot-hud .dh-panel{top:calc(var(--m-t,12px) + 52px);max-width:min(230px,27vw);font-size:11.5px;line-height:1.4;padding:6px 10px}
body.mobile #depot-hud .dh-panel b{font-size:12.5px}
body.mobile #depot-hud .dh-toast{max-width:min(230px,27vw);font-size:13px;padding:7px 11px;max-height:calc(4.2em + 14px);overflow:hidden}
body.mobile #depot-hud .dh-ach{max-width:min(230px,27vw)}body.mobile #depot-hud .dh-ach div{font-size:12.5px;padding:6px 11px}
body.mobile #depot-hud .dh-ach div:not(:last-child){display:none}
body.mobile #depot-hud.co-busy .dh-target,body.mobile #depot-hud.co-rc .dh-target,body.mobile #depot-hud.co-busy .dh-help,body.mobile #depot-hud.co-rc .dh-help{display:none!important}
@media (max-height:500px){body.mobile #depot-hud .co-pay img{width:72px;top:4px}body.mobile #depot-hud .co-pay h3{padding-right:70px;margin-bottom:4px}body.mobile #depot-hud .co-pay .r{padding:0}}`;
  document.head.appendChild(css);
  const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; hud.appendChild(d); return d; };
  const elScan = el('co-scan'), elPay = el('co-pay'), elRc = el('co-rcpt', '<div class="x" title="접기">–</div>'), elChip = el('co-chip');
  const rcCanvas = document.createElement('canvas'); elRc.appendChild(rcCanvas);
  elRc.querySelector('.x').addEventListener('click', () => { elRc.style.display = 'none'; elChip.style.display = co.receipt ? 'block' : 'none'; });
  elChip.addEventListener('click', () => { elChip.style.display = 'none'; elRc.style.display = 'block'; elRc.classList.add('on'); });
  elPay.addEventListener('click', (e) => { const a = e.target?.dataset?.a; if (a === 'card' || a === 'cash') pay(a); else if (a === 'cancel') abort(); });

  // 고객 표시기 (활성 계산대 1개만 실시간 캔버스)
  const dispCanvas = document.createElement('canvas'); dispCanvas.width = 512; dispCanvas.height = 300;
  const dispTex = keep(new THREE.CanvasTexture(dispCanvas)); dispTex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.4, 0.26)), keep(new THREE.MeshBasicMaterial({ map: dispTex }))); disp.visible = false; root.add(disp);
  function drawDisplay(last) {
    const g = dispCanvas.getContext('2d'); g.fillStyle = '#0f2a20'; g.fillRect(0, 0, 512, 300); g.textAlign = 'left';
    g.fillStyle = '#9fd3b8'; g.font = '700 26px "Pretendard",sans-serif'; g.fillText(co.self ? '셀프 계산' : `계산대 ${String(co.lane + 1).padStart(2, '0')} · 캐셔 ${co.cashier}`, 24, 44);
    if (last) { g.fillStyle = last.bad ? '#ff8a7a' : '#F3EADA'; g.font = '800 34px "Pretendard",sans-serif'; g.fillText(last.name.slice(0, 14), 24, 104); g.textAlign = 'right'; g.fillText(`${last.bad ? '−' : ''}${won(Math.abs(last.won))}`, 488, 150); }
    g.textAlign = 'left'; g.fillStyle = '#F3EADA'; g.font = '700 28px "Pretendard",sans-serif'; g.fillText(`${co.count}개`, 24, 250);
    g.textAlign = 'right'; g.fillStyle = '#F2C230'; g.font = '900 60px "Pretendard",sans-serif'; g.fillText(`₩${won(co.total)}`, 488, 262);
    dispTex.needsUpdate = true;
  }
  // 핸드 스캐너(캐셔 손) + 레이저
  const gun = new THREE.Group(); const gunM = keep(new THREE.MeshLambertMaterial({ color: 0x2a2f36 })), gunY = keep(new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
  const gb = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.07, 0.17)), gunM); const gh = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.12, 0.05)), gunY); gh.position.set(0, -0.08, 0.04); gun.add(gb, gh); gun.visible = false; root.add(gun);
  const laserGeo = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]));
  const laser = new THREE.Line(laserGeo, keep(new THREE.LineBasicMaterial({ color: 0xff2020, depthTest: false, transparent: true }))); laser.renderOrder = 10; laser.visible = false; root.add(laser);
  // 영수증 3D (프린터에서 밀려 나옴)
  const rcTex = keep(new THREE.CanvasTexture(rcCanvas)); rcTex.colorSpace = THREE.SRGBColorSpace;
  const rcG = keep(new THREE.PlaneGeometry(1, 1)); rcG.translate(0, -0.5, 0);
  const rc3d = new THREE.Mesh(rcG, keep(new THREE.MeshBasicMaterial({ map: rcTex, side: THREE.DoubleSide, transparent: true, alphaTest: 0.2 }))); rc3d.visible = false; root.add(rc3d);

  const co = { phase: 'idle', lane: -1, self: false, total: 0, count: 0, lines: [], fly: [], belt: [], heavy: [], t: 0, scanT: 0, unloadT: 0, paidItems: null, checked: false, receipt: null, cashier: '', boxes: 0, startT: 0 };
  const cartPose = () => st.cart;
  function laneAtCart() {
    if (!st.hasCart) return null; const c = cartPose();
    for (let k = 0; k < CO.LANES; k++) if (Math.abs(c.x - laneX(k) - 0.1) < 1.1 && c.z > 7.4 && c.z < 14) return { k, self: false, open: CO.STAFFED.includes(k) };
    for (let j = 0; j < CO.KIOSK.length; j++) { const [kx, kz] = CO.KIOSK[j]; if (Math.abs(c.x - kx - 0.1) < 0.9 && c.z > kz + 0.5 && c.z < kz + 2.6) return { k: j, self: true, open: true }; }
    return null;
  }
  const paidValid = () => co.paidItems && co.paidItems.length === items.length && co.paidItems.every((it, i) => it === items[i]);
  const nearExit = () => Math.abs(st.me.x - CO.EXIT.x) < CO.EXIT.w / 2 + 1.2 && st.me.z < 3.4;
  const nearBoxes = () => st.me.x > CO.BOXC.x0 - 0.5 && st.me.x < CO.BOXC.x1 + 0.5 && st.me.z > CO.BOXC.z0 - 0.8 && st.me.z < CO.BOXC.z1 + 1 && PALS.some(([px, pz]) => Math.hypot(st.me.x - px, st.me.z - pz) < 2.0);

  function start(spot) {
    if (!items.length) { toast('카트가 비어 있어요 · 상품을 담고 오세요', 1800, '#1f4fa3'); return; }
    co.phase = 'unload'; co.lane = spot.k; co.self = spot.self; co.total = 0; co.count = 0; co.lines = []; co.fly = []; co.belt = []; co.t = 0; co.scanT = 0; co.unloadT = 0.3; co.checked = false; co.paidItems = null; co.startT = st.t;
    co.cashier = co.self ? '셀프' : CASHIERS[spot.k % CASHIERS.length];
    const c = cartPose(); c.vx = c.vz = c.w = 0;
    if (co.self) { const [kx, kz] = CO.KIOSK[spot.k]; c.x = kx + 0.15; c.z = kz + 1.35; c.yaw = 0; co.scanPos = new THREE.Vector3(kx - 0.12, 1.05, kz + 0.05); co.bagPos = new THREE.Vector3(kx + 0.68, 0.84, kz); }
    else { c.x = laneX(spot.k) + 0.15; c.z = 9.6; c.yaw = 0; co.scanPos = new THREE.Vector3(beltX(spot.k), 0.98, CO.SCAN_Z); co.bagPos = new THREE.Vector3(beltX(spot.k), 0.86, 5.0); }
    st.me.x = c.x; st.me.z = c.z + 0.95; st.me.yaw = 0; st.head.yaw = co.self ? 0.15 : 0.75; st.head.pitch = -0.38;
    // 이 줄의 손님은 뒤로 비켜 섬
    for (const s of shoppers) if (s.lane === spot.k) { s.state = 'hold'; s.tz = 13.3 + s.slot * 1.6; }
    const list = items.slice();
    co.queue = list.filter((it) => it.p.kg < 10 && it.p.kind !== 'bulk');
    co.heavy = list.filter((it) => !co.queue.includes(it)).map((it, i) => ({ it, t: 0.9 + i * 1.0, done: false }));
    disp.visible = true; if (co.self) { const [kx, kz] = CO.KIOSK[spot.k]; disp.position.set(kx + 0.05, 1.5, kz - 0.152); disp.rotation.set(0, 0, 0); disp.scale.set(1.05, 1.15, 1); } else { disp.position.set(beltX(spot.k) + 0.32, 1.52, 5.645); disp.rotation.set(0, 0, 0); disp.scale.set(1, 1, 1); }
    drawDisplay(null);
    if (!co.self) { const g = dividers; m4.makeScale(0, 0, 0); g.setMatrixAt(spot.k, m4); g.instanceMatrix.needsUpdate = true; }
    hud.classList.add('co-busy');
    sfx('checkout.start', { lane: spot.k + 1, self: co.self }); if (!co.self) sfx('checkout.belt.start', { lane: spot.k, pos: { x: beltX(spot.k), y: 0.9, z: beltZc } });
    toast(co.self ? '셀프 계산 시작 · 상품이 하나씩 스캐너로 가요' : `계산대 ${String(spot.k + 1).padStart(2, '0')} · 캐셔 ${co.cashier}가 계산해 드려요 (무거운 건 카트째 스캔)`, 2600, '#1E5A45');
  }
  function scanLine(it, handheld) {
    const bad = it.p.kind === 'egg' ? brokenIn(it.mesh) : 0;
    co.lines.push({ id: it.p.id, name: it.p.name, won: it.p.price, kg: it.p.kg });
    co.total += it.p.price; co.count++;
    if (bad) { const w = bad * EGG_WON; co.lines.push({ name: `파손 교환 · ${it.p.name} ${bad}/30알`, won: -w, bad: true, eggs: bad }); co.total -= w; }
    sfx(handheld ? 'checkout.scan.handheld' : 'checkout.scan', { id: it.p.id, won: it.p.price });
    elScan.className = `co-scan${bad ? ' bad' : ''}`; elScan.style.display = 'none'; void elScan.offsetWidth; elScan.style.display = 'block';
    elScan.innerHTML = `<b>삑!${handheld ? ' (카트째 핸드 스캔)' : ''}</b><div class="n">${it.p.name}</div><div class="p">${won(it.p.price)}원</div>${bad ? `<b>파손 교환 −${won(bad * EGG_WON)}원</b>` : ''}`;
    co.scanHide = 1.4;
    drawDisplay({ name: it.p.name, won: it.p.price, bad: false });
  }
  function flyerOf(it) {
    const f = it.mesh.clone(true); it.mesh.getWorldPosition(f.position); it.mesh.getWorldQuaternion(f.quaternion); root.add(f); it.mesh.visible = false;
    const bb = new THREE.Box3().setFromObject(f), h = bb.max.y - bb.min.y, d = bb.max.z - bb.min.z;
    return { it, mesh: f, h, d, from: f.position.clone(), q0: f.quaternion.clone(), t: 0, state: 'arc' };
  }
  function tickPlayer(dt) {
    if (co.phase === 'idle' || co.phase === 'done') return;
    co.t += dt;
    if (co.scanHide > 0) { co.scanHide -= dt; if (co.scanHide <= 0) elScan.style.display = 'none'; }
    const k = co.lane, bxk = co.self ? co.scanPos.x : beltX(k);
    if (co.phase === 'unload') {
      // 1) 카트에서 하나씩 꺼내기
      co.unloadT -= dt;
      const lastOnBelt = co.belt[co.belt.length - 1];
      const roomAtStart = co.self ? co.belt.length === 0 && !co.fly.some((f) => f.state === 'arc') : !lastOnBelt || lastOnBelt.z < CO.BELT.z1 - 0.35 - lastOnBelt.d / 2 - 0.12;
      if (co.unloadT <= 0 && co.queue.length && roomAtStart) {
        const it = co.queue.shift(), f = flyerOf(it); co.fly.push(f); co.unloadT = co.self ? 0.9 : 0.5;
        f.to = co.self ? co.scanPos.clone().setY(co.scanPos.y + f.h / 2 + 0.06) : new THREE.Vector3(bxk, CO.BELT.y + f.h / 2 + 0.01, CO.BELT.z1 - 0.3 - f.d / 2);
        f.qt = f.q0.clone();
        sfx('checkout.unload', { id: it.p.id });
      }
      for (const f of co.fly) if (f.state === 'arc') {
        f.t = Math.min(1, f.t + dt / 0.45); const e = f.t * f.t * (3 - 2 * f.t);
        f.mesh.position.lerpVectors(f.from, f.to, e); f.mesh.position.y += Math.sin(Math.PI * f.t) * 0.35; f.mesh.quaternion.slerpQuaternions(f.q0, f.qt, e);
        if (f.t >= 1) { f.state = co.self ? 'scan' : 'belt'; f.z = f.mesh.position.z; if (!co.self) co.belt.push(f); else { f.wait = 0.25; co.belt.push(f); } }
      }
      // 2) 벨트 → 스캐너 (앞 상품 뒤에 줄 서서)
      if (!co.self) {
        let limit = CO.SCAN_Z + 0.02;
        for (let i = 0; i < co.belt.length; i++) {
          const f = co.belt[i], stopZ = limit + f.d / 2;
          f.z = Math.max(stopZ, f.z - 0.55 * dt); f.mesh.position.z = f.z;
          if (i === 0 && f.z <= stopZ + 1e-3) { f.wait = (f.wait ?? 0.28) - dt; if (f.wait <= 0) { scanLine(f.it, false); co.belt.shift(); f.state = 'bag'; f.t = 0; f.from = f.mesh.position.clone(); i--; cashierSwing = 0.3; continue; } }
          limit = f.z + f.d / 2 + 0.06;
        }
      } else if (co.belt.length) { const f = co.belt[0]; f.wait -= dt; if (f.wait <= 0) { scanLine(f.it, false); co.belt.shift(); f.state = 'bag'; f.t = 0; f.from = f.mesh.position.clone(); } }
      // 3) 스캔한 상품은 끝 선반에 쌓임
      for (const f of co.fly) if (f.state === 'bag') {
        if (f.t === 0) { co.bagH = co.bagH || 0; f.to = co.bagPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (co.bagStack = (co.bagStack || 0) + 1) > 3 ? 0.25 : 0, (Math.random() - 0.5) * 0.4)); f.to.y += f.h / 2; }
        f.t = Math.min(1, f.t + dt / 0.5); f.mesh.position.lerpVectors(f.from, f.to, f.t); if (f.t >= 1) f.state = 'rest';
      }
      // 4) 무거운 건 카트째 핸드 스캔
      for (const h of co.heavy) if (!h.done && co.t > h.t) { h.done = true; scanLine(h.it, true); laserT = 0.35; laserTo = h.it.mesh.getWorldPosition(new THREE.Vector3()); cashierSwing = 0.4; }
      const done = !co.queue.length && !co.belt.length && co.fly.every((f) => f.state === 'rest') && co.heavy.every((h) => h.done);
      if (done) { co.phase = 'pay'; co.payT = 0.5; if (!co.self) sfx('checkout.belt.stop', { lane: k, pos: { x: beltX(k), y: 0.9, z: beltZc } }); if (!co.self) { m4.makeTranslation(beltX(k), CO.BELT.y + 0.035, CO.BELT.z1 - 0.3); dividers.setMatrixAt(k, m4); dividers.instanceMatrix.needsUpdate = true; } }
    } else if (co.phase === 'pay' && co.payT != null) {
      co.payT -= dt; if (co.payT <= 0) { co.payT = null; showPay(); }
    } else if (co.phase === 'print') {
      co.printT += dt; const p = Math.min(1, co.printT / 2.3);
      const W = 0.16, H = W * rcCanvas.height / rcCanvas.width;
      rc3d.scale.set(W, Math.max(0.001, H * p), 1); rcTex.repeat.set(1, p); rcTex.offset.set(0, 1 - p);
      if (co.printT > 2.6) finish();
    }
    // 캐셔 손 스캐너 · 레이저
    if (!co.self && co.phase !== 'idle') {
      const c = cashierAt(k); cashierSwing = Math.max(0, cashierSwing - dt);
      gun.visible = true; gun.position.set(c.x + 0.42, 1.08 + cashierSwing * 0.4, c.z + 0.35 + cashierSwing * 0.5); gun.rotation.set(-0.4 - cashierSwing, Math.PI / 2, 0);
    }
    if (laserT > 0) { laserT -= dt; laser.visible = true; const a = gun.visible ? gun.position : camera.position; laser.position.copy(a); const d = laserTo.clone().sub(a); laser.scale.set(1, 1, d.length()); laser.lookAt(laserTo); laser.material.opacity = 0.5 + 0.5 * Math.sin(st.t * 60); } else laser.visible = false;
  }
  let cashierSwing = 0, laserT = 0, laserTo = new THREE.Vector3();
  function totals() {
    const sub = co.lines.filter((l) => !l.bad).reduce((a, l) => a + l.won, 0), exch = co.lines.filter((l) => l.bad).reduce((a, l) => a + l.won, 0);
    const inCartBroken = co.lines.filter((l) => l.bad).reduce((a, l) => a + l.eggs, 0);
    const storeEggs = Math.max(0, (staff?.S.eggsToday || 0) - inCartBroken), dmg = storeEggs * EGG_WON; // 카트 밖(매장)에서 깬 계란 = 변상 (표시용)
    return { sub, exch, dmg, storeEggs, total: sub + exch + dmg, kg: co.lines.filter((l) => !l.bad).reduce((a, l) => a + l.kg, 0) };
  }
  function showPay() {
    const T = totals(); co.T = T;
    elPay.innerHTML = `${TX['co-member-card'] ? `<img src="${ASSET}co-member-card.webp" alt="">` : ''}<h3>${co.self ? '셀프 계산' : `계산대 ${String(co.lane + 1).padStart(2, '0')}`} · 결제</h3>
<div class="r"><span>상품 ${co.count}개 소계</span><span>${won(T.sub)}원</span></div>
${T.exch ? `<div class="r red"><span>파손 교환 (카트 속 깨진 계란)</span><span>${won(T.exch)}원</span></div>` : ''}
${T.dmg ? `<div class="r red"><span>변상 · 매장에서 깬 계란 ${T.storeEggs}알</span><span>+${won(T.dmg)}원</span></div>` : ''}
<div class="r tot"><span>합계</span><span>${won(T.total)}원</span></div>
<div style="clear:both;font-size:12.5px;font-weight:700;color:#1E5A45;margin-top:4px">"회원카드 보여 주세요~" · 골드범 회원 확인 ✔</div>
<button data-a="card">💳 범카드로 결제 (E)</button><button class="alt" data-a="cash">현금(원)으로 결제</button><button class="alt" data-a="cancel">계산 취소 (Esc)</button>
<div class="note">연습용 결제 화면이에요 · 실제 bum·원은 빠져나가지 않아요 (표시용)</div>`;
    elPay.style.display = 'block'; drawDisplay({ name: '합계', won: T.total });
    if (!co.self) { const c = cashierAt(co.lane); co.say = '회원카드 보여 주세요~'; void c; }
    sfx('checkout.total', { won: T.total });
  }
  function pay(method = 'card') {
    if (co.phase !== 'pay' || co.payT != null) return;
    elPay.style.display = 'none'; co.phase = 'print'; co.printT = 0; co.method = method;
    sfx('checkout.pay', { method, won: co.T.total, practice: true });
    drawReceipt(0); co.receipt = { total: co.T.total, at: new Date() };
    // 3D 영수증: 프린터 입구에 매달려 길어짐
    rc3d.visible = true;
    if (co.self) { const [kx, kz] = CO.KIOSK[co.lane]; rc3d.position.set(kx + 0.3, 1.06, kz + 0.1); rc3d.rotation.set(-0.15, 0, 0); } else { rc3d.position.set(beltX(co.lane) + 0.22, 1.02, 5.85); rc3d.rotation.set(-0.2, 0, 0); }
    elRc.style.display = 'block'; elRc.classList.remove('on'); elChip.style.display = 'none'; void elRc.offsetWidth; elRc.classList.add('on'); elRc.scrollTop = 0;
    sfx('checkout.receipt.print', { lines: co.lines.length });
    drawDisplay({ name: method === 'card' ? '범카드 승인 ✔' : '현금 결제 ✔', won: co.T.total });
  }
  function finish() {
    for (const f of co.fly) { root.remove(f.mesh); f.it.mesh.visible = true; }
    co.fly = []; co.belt = []; co.bagStack = 0; co.phase = 'done'; co.paidItems = items.slice(); gun.visible = false; hud.classList.remove('co-busy');
    for (const s of shoppers) if (s.state === 'hold') { s.state = s.slot ? 'queue' : 'serve'; s.tz = s.slot ? 12.9 : 9.2; }
    staff?.achieve?.(co.lines.some((l) => l.bad) ? '계란 깨고도 당당하게 계산' : `첫 계산 완료 — ${won(co.T.total)}원`);
    toast('계산 완료! 출구(왼쪽 끝 초록 EXIT)에서 영수증을 보여 주세요', 3600, '#1E5A45');
    co.rcHideT = 9; co.rc3dT = 12; sfx('checkout.done', { won: co.T.total });
  }
  function abort() {
    for (const f of co.fly) { root.remove(f.mesh); f.it.mesh.visible = true; }
    co.fly = []; co.belt = []; co.bagStack = 0; co.phase = 'idle'; elPay.style.display = 'none'; elScan.style.display = 'none'; gun.visible = false; disp.visible = false; hud.classList.remove('co-busy');
    for (const s of shoppers) if (s.state === 'hold') { s.state = s.slot ? 'queue' : 'serve'; s.tz = s.slot ? 12.9 : 9.2; }
    if (!co.self && co.lane >= 0) { m4.makeTranslation(beltX(co.lane), CO.BELT.y + 0.035, CO.BELT.z1 - 0.3); dividers.setMatrixAt(co.lane, m4); dividers.instanceMatrix.needsUpdate = true; }
    if (!co.self && co.lane >= 0) sfx('checkout.belt.stop', { lane: co.lane }); sfx('checkout.cancel'); toast('계산 취소 · 상품은 카트에 그대로', 1600, '#8a5a00');
  }

  // ---------- 영수증 (디자이너 receipt-long 양식 · 런타임 캔버스) ----------
  function drawReceipt(mark) {
    const T = co.T, grouped = []; for (const l of co.lines) { if (l.bad) { grouped.push({ ...l }); continue; } const g = grouped.find((x) => x.id === l.id && !x.bad); if (g) { g.qty++; g.won += l.won; } else grouped.push({ ...l, qty: 1 }); }
    const W = 512, rowH = 30, H = Math.min(2048, 470 + grouped.length * rowH + (T.exch ? rowH : 0) + (T.dmg ? rowH : 0) + 250);
    rcCanvas.width = W; rcCanvas.height = H; const g = rcCanvas.getContext('2d');
    g.clearRect(0, 0, W, H); g.fillStyle = '#FBF8F1'; g.beginPath(); g.moveTo(0, 10); for (let x = 0; x <= W; x += 16) g.lineTo(x, x % 32 ? 0 : 10); g.lineTo(W, H - 10); for (let x = W; x >= 0; x -= 16) g.lineTo(x, x % 32 ? H : H - 10); g.closePath(); g.fill();
    const ink = '#22262A', grey = '#6b6f72', red = '#D9442E', pad = 30; let y = 54;
    g.fillStyle = ink; g.textAlign = 'center'; g.font = '900 34px "Pretendard",sans-serif'; g.fillText('범창고 정자점', W / 2, y); y += 26;
    g.font = '600 15px "Pretendard",sans-serif'; g.fillStyle = grey; g.fillText('BUMP DEPOT · 회원제 창고형 마트 (패러디)', W / 2, y); y += 30;
    const d = co.receipt?.at || new Date(), ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    g.textAlign = 'left'; g.font = '600 16px "Pretendard",sans-serif'; g.fillStyle = ink; g.fillText(ds, pad, y); g.textAlign = 'right'; g.fillText(co.self ? '셀프 계산대' : `계산대 ${String(co.lane + 1).padStart(2, '0')}`, W - pad, y); y += 22;
    g.textAlign = 'left'; g.fillText(`캐셔 ${co.cashier}`, pad, y); g.textAlign = 'right'; g.fillText('골드범 1234-****-9012', W - pad, y); y += 16;
    const dash = () => { g.strokeStyle = '#c9bfa8'; g.setLineDash([6, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); g.setLineDash([]); };
    dash(); y += 26; g.fillStyle = grey; g.font = '600 14px "Pretendard",sans-serif'; g.textAlign = 'left'; g.fillText('상품', pad, y); g.textAlign = 'right'; g.fillText('수량', W - 150, y); g.fillText('금액', W - pad, y); y += 26;
    g.font = '600 17px "Pretendard",sans-serif';
    for (const l of grouped) { g.fillStyle = l.bad ? red : ink; g.textAlign = 'left'; g.fillText(l.name.slice(0, 20), pad, y); g.textAlign = 'right'; if (!l.bad) g.fillText(String(l.qty), W - 150, y); g.fillText(won(l.won), W - pad, y); y += rowH; }
    y -= 8; dash(); y += 28;
    g.fillStyle = ink; g.textAlign = 'left'; g.fillText('소계', pad, y); g.textAlign = 'right'; g.fillText(won(T.sub), W - pad, y); y += rowH;
    if (T.exch) { g.fillStyle = red; g.textAlign = 'left'; g.fillText('파손 교환 (계란)', pad, y); g.textAlign = 'right'; g.fillText(won(T.exch), W - pad, y); y += rowH; }
    if (T.dmg) { g.fillStyle = red; g.textAlign = 'left'; g.fillText(`변상 · 매장에서 깬 계란 ${T.storeEggs}알`, pad, y); g.textAlign = 'right'; g.fillText(`+${won(T.dmg)}`, W - pad, y); y += rowH; }
    y -= 8; dash(); y += 44; co.totY = y;
    if (mark > 0 && !co.stamp) { g.save(); g.translate(pad - 6, y - 16); g.rotate(-0.045); g.fillStyle = 'rgba(255,70,110,.42)'; g.beginPath(); g.roundRect(0, -14, (W - 2 * pad + 12) * mark, 30, 14); g.fill(); g.restore(); }
    g.fillStyle = ink; g.textAlign = 'left'; g.font = '800 22px "Pretendard",sans-serif'; g.fillText('합계', pad, y); g.textAlign = 'right'; g.font = '900 38px "Pretendard",sans-serif'; g.fillText(`${won(T.total)}원`, W - pad, y); y += 26;
    g.font = '600 14px "Pretendard",sans-serif'; g.fillStyle = grey; g.textAlign = 'right'; g.fillText(`${co.method === 'cash' ? '현금' : '범카드'} · 연습 결제(실제 차감 없음)`, W - pad, y); y += 14;
    dash(); y += 28; g.font = '600 16px "Pretendard",sans-serif'; g.fillStyle = ink;
    const eggsCart = co.lines.filter((l) => l.bad).reduce((a, l) => a + l.eggs, 0);
    for (const [a, b] of [['카트 총무게', `${(T.kg + 27).toFixed(1)} kg`], ['  상품 + 카트 27.0', `${T.kg.toFixed(1)} + 27.0`], ['깨진 계란 (카트 속 / 매장)', `${eggsCart} / ${T.storeEggs}`], ['걸린 시간', `${Math.max(1, Math.round((st.t - co.startT) / 60 + (st.t / 60) * 0))}분대`]]) { g.textAlign = 'left'; g.fillText(a, pad, y); g.textAlign = 'right'; g.fillText(b, W - pad, y); y += 24; }
    y += 6; g.fillStyle = ink; let bx = 96; for (let i = 0; i < 64; i++) { const w = ((i * 7 + co.count) % 3) + 1; g.fillRect(bx, y, w * 2, 56); bx += w * 2 + 3; if (bx > W - 96) break; } y += 74;
    g.textAlign = 'center'; g.font = '800 17px "Pretendard",sans-serif'; g.fillText('출구에서 영수증을 보여 주세요', W / 2, y); y += 24; g.font = '600 15px "Pretendard",sans-serif'; g.fillStyle = grey; g.fillText(`오늘의 범 운세: ${FORTUNE[(co.count + co.lines.length) % FORTUNE.length]}`, W / 2, y);
    if (co.stamp) { g.save(); g.translate(W - 120, co.totY - 60); g.rotate(-0.25); g.strokeStyle = red; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 66, 0, Math.PI * 2); g.stroke(); if (stampImg.complete && stampImg.naturalWidth) { g.globalAlpha = 0.85; g.drawImage(stampImg, -42, -52, 84, 84); g.globalAlpha = 1; } g.fillStyle = red; g.font = '900 20px "Pretendard",sans-serif'; g.textAlign = 'center'; g.fillText('참 잘했어요', 0, 50); g.restore(); }
    rcTex.needsUpdate = true;
  }

  // ---------- 출구 영수증 확인 ----------
  function checkReceipt() {
    co.checked = true; co.markT = 0; co.stamp = co.T && !co.T.exch && !co.T.dmg;
    elChip.style.display = 'none'; elRc.style.display = 'block'; elRc.classList.add('on'); co.rcHideT = 6;
    sfx('checkout.receipt.check', { stamp: !!co.stamp }); checker.raise = 1.2;
    staff?.achieve?.(co.stamp ? '영수증 도장 — 참 잘했어요' : '출구 통과 (형광펜 쓱)');
    toast(co.stamp ? '직원: 파손 0건! 참 잘했어요 도장 쾅 🐯 · E 로 나가기' : '직원: 확인했습니다~ 또 오세요! (형광펜 쓱) · E 로 나가기', 3200, '#1E5A45');
    if (co.stamp) drawReceipt(1);
  }

  // ---------- NPC 손님 ----------
  function tickNpc(dt) {
    const pc = cartPose();
    for (const s of shoppers) {
      if (s.state === 'serve') { s.tz = 9.2; s.wait -= dt; if (s.wait <= 0) { s.state = 'leave'; s.tz = 4.2; } }
      else if (s.state === 'queue') { const ahead = shoppers.find((o) => o !== s && o.lane === s.lane && (o.state === 'serve' || o.state === 'leave')); s.tz = 12.9; if (!ahead) { s.state = 'serve'; s.wait = 7 + Math.random() * 6; } }
      else if (s.state === 'leave' && s.z < 4.35) { s.state = 'queue'; s.z = 13.4; s.scale = 0; s.tz = 12.9; s.items = 3 + Math.floor(Math.random() * 3); } // 출구 쪽으로 나가고 줄 끝에서 새 손님
      // 플레이어 카트가 바로 앞이면 멈춤
      const blockedByMe = Math.abs(pc.x - laneX(s.lane)) < 1.0 && pc.z < s.z && s.z - pc.z < 2.2 && s.tz < s.z;
      if (!blockedByMe) { const dz = s.tz - s.z; s.z += Math.sign(dz) * Math.min(Math.abs(dz), 0.9 * dt); s.moving = Math.abs(dz) > 0.02; } else s.moving = false;
      s.scale = Math.min(1, s.scale + dt * 2.5);
    }
    // 행렬
    let ni = 0;
    shoppers.forEach((s, i) => {
      const x = laneX(s.lane) + 0.15; m4.compose(v3.set(x, 0, s.z), yawQ(Math.PI), new THREE.Vector3(s.scale, s.scale, s.scale)); for (const im of npcCart) im.setMatrixAt(i, m4);
      // 카트 속 상품 몇 개 (계산 중이면 벨트 위로)
      for (let j = 0; j < 3; j++) { const inCart = !(s.state === 'serve' && s.wait < 6); m4.compose(v3.set(x + (j - 1) * 0.15, 0.62 + (j % 2) * 0.12, s.z - 0.1 + (j % 2) * 0.12), yawQ(j), new THREE.Vector3(0.22 * s.scale * (inCart ? 1 : 0), 0.18 * s.scale, 0.2 * s.scale)); npcItems.setMatrixAt(ni++, m4); }
    });
    CO.NPC_LANES.forEach((k, li) => {
      const s = shoppers.find((o) => o.lane === k && o.state === 'serve');
      for (let j = 0; j < NBI; j++) {
        const on = s && s.wait < 6 && co.lane !== k, zz = CO.BELT.z1 - 0.4 - (((st.t * 0.5 + j * 0.85 + li) % 4.6));
        const sc = on && zz > CO.SCAN_Z + 0.1 ? 1 : 0; m4.compose(v3.set(beltX(k) + ((j * 37) % 5 - 2) * 0.04, CO.BELT.y + 0.1, zz), yawQ(j * 0.7), new THREE.Vector3(0.26 * sc, 0.18 * sc, 0.22 * sc)); npcItems.setMatrixAt(ni++, m4);
      }
    });
    npcItems.instanceMatrix.needsUpdate = true; for (const im of npcCart) im.instanceMatrix.needsUpdate = true;
    // 사람 (캐셔는 스캔 동작으로 살짝 숙임)
    people.forEach((p, i) => {
      let x = p.x, z = p.z, yaw = p.yaw, bob = 0, lean = 0;
      if (p.kind === 'shopper') { const s = p.ref; x = laneX(s.lane) + 0.15; z = s.z + 0.95; yaw = Math.PI; bob = s.moving ? Math.abs(Math.sin(st.t * 8 + p.ph)) * 0.04 : 0; }
      if (p.kind === 'cashier') { const busy = co.lane === p.lane && co.phase === 'unload' && !co.self ? 1 : shoppers.some((s) => s.lane === p.lane && s.state === 'serve' && s.wait < 6) ? 0.6 : 0; lean = busy * (0.12 + 0.1 * Math.sin(st.t * 6 + p.ph)); }
      if (p.kind === 'checker' && p.raise > 0) { p.raise -= 1 / 60; lean = -0.15 * Math.sin(p.raise * 8); }
      const sc = p.kind === 'shopper' ? p.ref.scale : 1;
      m4.compose(v3.set(x, bob, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, 0, 'YXZ')), new THREE.Vector3(sc, sc, sc));
      for (const im of pI) im.setMatrixAt(i, m4);
    });
    for (const im of pI) im.instanceMatrix.needsUpdate = true;
  }

  // ---------- 공개 ----------
  function tick(dt) {
    beltTex.offset.y = (beltTex.offset.y + dt * 0.55 * 3) % 1; // 벨트 흐름 (모든 줄 공유)
    tickNpc(dt); tickPlayer(dt);
    { const on = elRc.style.display === 'block'; if (on !== co.rcOn) { co.rcOn = on; hud.classList.toggle('co-rc', on); } }
    if (co.phase === 'done') {
      if (co.rcHideT > 0) { co.rcHideT -= dt; if (co.rcHideT <= 0) { elRc.style.display = 'none'; elChip.style.display = 'block'; elChip.textContent = `🧾 영수증 ${won(co.T.total)}원${co.checked ? ' · 확인 ✔' : ' (출구에서 보여 주기)'}`; } }
      if (co.rc3dT > 0) { co.rc3dT -= dt; if (co.rc3dT <= 0) { rc3d.visible = false; disp.visible = false; } }
      if (co.checked && co.markT != null && co.markT < 1 && !co.stamp) { co.markT = Math.min(1, co.markT + dt / 0.45); drawReceipt(co.markT); }
      if (co.paidItems && !paidValid() && !co.warned) { co.warned = true; toast('계산 뒤에 상품이 바뀌었어요 · 다시 계산해 주세요', 2400, '#8a5a00'); co.paidItems = null; co.checked = false; }
    }
  }
  function prompt() {
    if (co.phase === 'unload') return { text: co.self ? '셀프 계산 중… 삑 삑' : `계산 중… 캐셔 ${co.cashier}가 스캔하고 있어요`, bg: '#e8fff0' };
    if (co.phase === 'pay') return { text: 'E 범카드로 결제 · Esc 취소 (연습용 · 실제 차감 없음)', bg: '#fff6d6' };
    if (co.phase === 'print') return { text: '영수증 출력 중… 지이잉', bg: '#e8fff0' };
    const spot = laneAtCart();
    if (spot && !paidValid()) return spot.open ? { text: `E 계산 시작 · ${spot.self ? '셀프 계산대' : `계산대 ${String(spot.k + 1).padStart(2, '0')}`} (상품 ${items.length}개)` } : { text: '계산 마감된 줄이에요 · 초록불 계산대로 가 주세요', bg: '#ffe3e0' };
    if (nearExit()) {
      if (items.length && !paidValid()) return { text: '계산 먼저 해 주세요 · 계산대는 오른쪽 → (초록불)', bg: '#ffe3e0' };
      if (items.length && !co.checked) return { text: 'E 영수증 보여 주기 (출구 직원)' };
      return { text: 'E 출구로 나가기' };
    }
    if (nearBoxes() && st.mode === 'walk') return { text: `E 빈 박스 챙기기 (무료${co.boxes ? ` · ${co.boxes}개 챙김` : ''})` };
    return null;
  }
  const boxGeoSmall = keep(new THREE.BoxGeometry(0.42, 0.28, 0.36));
  function takeBox() {
    if (!cart.visible) { toast('카트가 있어야 빈 박스를 실을 수 있어요', 1500, '#1f4fa3'); return; }
    if (co.boxes >= 3) { toast('빈 박스는 3개면 충분해요 ^^', 1400, '#8a5a00'); return; }
    const b = new THREE.Mesh(boxGeoSmall, boxM); b.position.set(-0.12 + co.boxes * 0.12, 0.28 + co.boxes * 0.06, 0.02 - co.boxes * 0.05); b.rotation.y = co.boxes * 0.3; cart.add(b); (co.boxMeshes ||= []).push(b); co.boxes++; // 아래 받침대에 (물리 없이 장식)
    sfx('checkout.box.take'); toast('📦 빈 박스 챙김 · 아래 받침대에 실었어요 (무료)', 1600, '#8a5a00');
    if (co.boxes === 1) staff?.achieve?.('빈 박스 챙기기 — 창고형 마트 고수');
  }
  function onKey(k) {
    if (co.phase === 'pay') { if (k === 'KeyE' || k === 'Enter' || k === 'Space') pay('card'); else if (k === 'Escape') abort(); return true; }
    if (co.phase === 'unload' || co.phase === 'print') { if (k === 'Escape' && co.phase === 'unload') abort(); return true; }
    if (k !== 'KeyE' && k !== 'Space') return false;
    const spot = laneAtCart();
    if (spot && !paidValid()) { if (spot.open) start(spot); else toast('계산 마감된 줄이에요 · 초록불 계산대로', 1600, '#8a5a00'); return true; }
    if (nearExit()) {
      if (items.length && !paidValid()) { toast('계산 먼저 해 주세요 — 계산대는 오른쪽이에요', 1800, '#D9442E'); return true; }
      if (items.length && !co.checked) { checkReceipt(); return true; }
      sfx('checkout.exit'); ctx.onExit?.(); return true;
    }
    if (nearBoxes() && !st.hasCart) { takeBox(); return true; }
    if (nearBoxes() && st.hasCart) { takeBox(); return true; }
    return false;
  }
  // 모바일 상황별 행동 버튼 (mobile/hud.js 가 0.5초마다 읽음) — PC 의 E/Esc 를 그대로 탭으로
  function mobileActs() {
    if (co.phase === 'pay') return [{ label: '범카드 결제', icon: 'bag', run: () => pay('card') }, { label: '현금 결제', icon: 'bag', run: () => pay('cash'), gold: false }, { label: '계산 취소', icon: 'stop', run: () => abort(), gold: false }];
    if (co.phase === 'unload') return [{ label: '계산 취소', icon: 'stop', run: () => abort(), gold: false }];
    if (co.phase === 'print') return [];
    const p = prompt();
    if (!p || !p.text.startsWith('E ')) return null;
    const label = p.text.slice(2).split(/ [·(]/)[0].trim();
    return [{ label, icon: nearExit() ? 'door' : nearBoxes() ? 'bag' : 'board', run: () => onKey('KeyE') }];
  }
  return {
    tick, onKey, prompt, CO, mobileActs,
    get busy() { return co.phase === 'unload' || co.phase === 'pay' || co.phase === 'print'; },
    avoid() { return shoppers.map((s) => ({ x: laneX(s.lane) + 0.15, z: s.z, r: 0.7 })).concat([{ x: CO.CHECK.x, z: CO.CHECK.z, r: 0.5 }]); },
    dbg: { hide(v) { root.visible = !v; }, start(k, self = false) { start({ k, self, open: true }); }, pay, check: checkReceipt, abort, state: () => ({ phase: co.phase, lane: co.lane, total: co.total, count: co.count, lines: co.lines.length, paid: !!paidValid(), checked: co.checked, T: co.T, boxes: co.boxes }), takeBox, shoppers: () => shoppers.map((s) => ({ lane: s.lane, z: +s.z.toFixed(2), state: s.state })) },
    dispose() { css.remove(); elScan.remove(); elPay.remove(); elRc.remove(); elChip.remove(); for (const b of co.boxMeshes || []) cart.remove(b); },
  };
}
