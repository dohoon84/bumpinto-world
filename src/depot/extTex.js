// [depot-ext] 범창고 바깥 캔버스 텍스처 — 외벽 골강판(브랜드 색), 간판 아틀라스(밤에도 밝음), 현수막·바닥 글씨 아틀라스.
//   한 아틀라스 = 한 재질 = 한 draw call. 디자이너 로고(public/depot/logo-*.webp)는 받으면 덮어 그린다(못 받으면 캔버스 글씨 그대로).
//   ⚠ 실제 마트·식품 상표 없음(전부 패러디). 팔레트: 창고 그린 #1E5A45 · 딥 그린 #123B2D · 크라프트 #C8965A · 크림 #F3EADA · 안전 노랑 #F2C230 · 특가 레드 #D9442E
import * as THREE from 'three';

export const C = { green: '#1E5A45', deep: '#123B2D', kraft: '#C8965A', cream: '#F3EADA', yellow: '#F2C230', red: '#D9442E', amber: '#E08A2C', char: '#22262A', rack: '#4A5A6A' };
const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const font = (w, px) => `${w} ${px}px ${FONT}`;
const BASE = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fitText(g, s, maxW, weight, px) { let p = px; g.font = font(weight, p); while (p > 8 && g.measureText(s).width > maxW) { p -= 2; g.font = font(weight, p); } return p; }
function loadImg(name) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `${BASE()}depot/${name}`; }); }

// 박스범(상자 호랑이) 간이 아이콘 — 로고 이미지를 못 받았을 때·작은 자리용
export function drawBoxBeom(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 100, s / 100);
  g.fillStyle = C.cream; rr(g, 0, 10, 100, 90, 14); g.fill();
  for (const ex of [14, 66]) { g.beginPath(); g.arc(ex + 10, 14, 13, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = C.kraft; rr(g, 6, 18, 88, 76, 10); g.fill();
  g.fillStyle = C.deep; for (const ex of [24, 76]) { g.beginPath(); g.arc(ex, 15, 6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#e4cfa6'; g.fillRect(42, 18, 16, 22);
  g.fillStyle = C.deep; for (const yy of [52, 66, 80]) { g.beginPath(); g.moveTo(6, yy - 4); g.lineTo(22, yy); g.lineTo(6, yy + 4); g.fill(); g.beginPath(); g.moveTo(94, yy - 4); g.lineTo(78, yy); g.lineTo(94, yy + 4); g.fill(); }
  g.beginPath(); g.arc(38, 58, 5, 0, Math.PI * 2); g.arc(62, 58, 5, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** 외벽 골강판: 아래 콘크리트 걸레받이 · 크림 골판 · 크라프트 띠 · 위 그린 처마. tone='green' 이면 입구 탑(짙은 초록 골판). 가로 8 m 한 장. */
export function wallTexture(tone = 'cream') {
  const [c, g] = canvas(256, 256);
  const base = tone === 'green' ? '#1f5c47' : '#e9dfcc', lite = tone === 'green' ? '#2a6c55' : '#f4ecdd', dark = tone === 'green' ? '#174a39' : '#d4c8b2';
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) { // 골(사다리꼴 리브): 밝은 윗면 · 어두운 옆면 그림자
    g.fillStyle = lite; g.fillRect(x + 2, 0, 6, 256);
    g.fillStyle = dark; g.fillRect(x + 8, 0, 2, 256);
    g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x + 10, 0, 6, 256);
  }
  if (tone !== 'green') {
    g.fillStyle = C.green; g.fillRect(0, 0, 256, 44); // 처마 띠
    g.fillStyle = 'rgba(255,255,255,.08)'; for (let x = 0; x < 256; x += 16) g.fillRect(x + 2, 0, 6, 44);
    g.fillStyle = C.kraft; g.fillRect(0, 44, 256, 9);
    g.fillStyle = '#9a9c98'; g.fillRect(0, 232, 256, 24); // 콘크리트 걸레받이
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 230, 256, 3);
  } else {
    g.fillStyle = C.deep; g.fillRect(0, 0, 256, 10);
    g.fillStyle = C.yellow; g.fillRect(0, 248, 256, 8);
  }
  g.fillStyle = 'rgba(0,0,0,.05)'; for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 2, 256); // 판 이음
  return tex(c, { repeat: true });
}

export function roofTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#b9bcbe'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) { g.fillStyle = x % 16 ? '#aeb2b5' : '#c4c7c9'; g.fillRect(x, 0, 4, 256); }
  return tex(c, { repeat: true });
}

export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#4b4f54'; g.fillRect(0, 0, 256, 256);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { const v = 60 + rnd() * 40 | 0; g.fillStyle = `rgba(${v},${v + 2},${v + 6},${0.35 + rnd() * 0.4})`; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,32,36,.18)'; g.beginPath(); g.ellipse(rnd() * 256, rnd() * 256, 20 + rnd() * 40, 10 + rnd() * 20, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  const t = tex(c, { repeat: true, aniso: 8 });
  return t;
}

// ---------- 아틀라스 ----------
class Atlas { // k < 1 이면 같은 배치를 작은 캔버스에(모바일: 메모리 1/4)
  constructor(w, h, k = 1) { [this.c, this.g] = canvas(Math.round(w * k), Math.round(h * k)); this.W = w; this.H = h; this.k = k; this.slots = {}; }
  slot(name, x, y, w, h) { this.slots[name] = { x, y, w, h, u0: x / this.W, u1: (x + w) / this.W, v0: 1 - (y + h) / this.H, v1: 1 - y / this.H }; return this.slots[name]; }
  draw(name, fn) { const s = this.slots[name], g = this.g, k = this.k; g.save(); g.scale(k, k); g.beginPath(); g.rect(s.x, s.y, s.w, s.h); g.clip(); g.translate(s.x, s.y); fn(g, s.w, s.h); g.restore(); }
}

/** 간판 아틀라스(밤에도 밝은 MeshBasic). 정면 큰 간판·탑 표지·LED 특가판·입구/출구·카트 보관소·이정표. */
export function signAtlas({ k = 1 } = {}) {
  const A = new Atlas(2048, 1536, k);
  A.slot('main', 0, 0, 2048, 512); // 정면 큰 간판 (4:1)
  A.slot('pyTop', 0, 512, 512, 512); // 탑 표지 위 (정사각)
  A.slot('pyMid', 512, 512, 1024, 256); // 탑 표지 가운데 BUMP DEPOT 정자점
  A.slot('pyLed', 512, 768, 1024, 256); // LED 특가판
  A.slot('enter', 1536, 512, 512, 128); // 입구 처마
  A.slot('exit', 1536, 640, 512, 128); // 출구 처마
  A.slot('cart', 1536, 768, 512, 128); // 카트 보관소
  A.slot('hours', 1536, 896, 512, 128); // 영업시간
  for (let i = 0; i < 4; i++) A.slot('post' + i, i * 512, 1024, 512, 192); // 이정표 4종
  A.slot('canopyLight', 0, 1216, 256, 64); // 처마 밑 조명 패널
  A.slot('glass', 256, 1216, 256, 256); // 자동문 유리(안쪽 매장 불빛)
  A.slot('pyBack', 512, 1216, 512, 256); // 탑 표지 아래 주차장 입구
  A.slot('white', 1024, 1216, 64, 64);
  A.slots.side = A.slots.main; // 옆벽 큰 간판 = 정면 간판과 같은 그림

  const drawMain = (logo) => A.draw('main', (g, w, h) => {
    g.fillStyle = C.green; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.cream; g.lineWidth = 10; rr(g, 14, 14, w - 28, h - 28, 26); g.stroke();
    if (logo) { const lh = 330, lw = lh * logo.width / logo.height; g.drawImage(logo, 90, (h - lh) / 2 - 10, lw, lh); g.fillStyle = C.cream; g.font = font(800, 120); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText('정자점', w - 90, h / 2 - 30); g.fillStyle = C.yellow; g.font = font(700, 48); g.fillText('크게 사면 크게 웃어요', w - 92, h / 2 + 86); }
    else { drawBoxBeom(g, 90, 110, 290); g.fillStyle = C.cream; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = font(900, 250); g.fillText('범창고', 430, h / 2 - 40); g.fillStyle = C.yellow; g.font = font(900, 88); g.fillText('B U M P   D E P O T', 440, h / 2 + 150); g.fillStyle = C.cream; g.font = font(800, 120); g.textAlign = 'right'; g.fillText('정자점', w - 90, h / 2 - 30); }
  });
  const drawPyTop = (icon) => A.draw('pyTop', (g, w, h) => {
    g.fillStyle = C.green; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.cream; g.lineWidth = 8; rr(g, 12, 12, w - 24, h - 24, 22); g.stroke();
    if (icon) g.drawImage(icon, 136, 40, 240, 240); else drawBoxBeom(g, 146, 46, 220);
    g.fillStyle = C.cream; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(900, 150); g.fillText('범창고', w / 2, 380);
    g.fillStyle = C.yellow; g.font = font(900, 46); g.fillText('B U M P  D E P O T', w / 2, 466);
  });
  drawMain(null); drawPyTop(null);
  A.draw('pyMid', (g, w, h) => {
    g.fillStyle = C.cream; g.fillRect(0, 0, w, h);
    g.fillStyle = C.deep; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(900, 104); g.fillText('창고형 할인점 · 정자점', w / 2, 100);
    g.fillStyle = C.green; g.font = font(800, 56); g.fillText('대용량 · 매일 낮은 가격 · 넓은 주차장', w / 2, 196);
  });
  A.draw('pyLed', (g, w, h) => {
    g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1d21'; for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) g.fillRect(x + 1, y + 1, 5, 5); // LED 도트 바탕
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#ff5a3c'; g.font = font(900, 74); g.fillText('오늘의 특가', 40, 70);
    g.fillStyle = '#ffd23a'; g.font = font(900, 74); g.textAlign = 'right'; g.fillText('범란 30구 6,980원', w - 40, 70);
    g.fillStyle = '#7dff8a'; g.font = font(800, 60); g.textAlign = 'left'; g.fillText('타임세일 15:00', 40, 186);
    g.fillStyle = '#ffffff'; g.textAlign = 'right'; g.fillText('주차 3시간 무료', w - 40, 186);
  });
  A.draw('enter', (g, w, h) => {
    g.fillStyle = C.deep; g.fillRect(0, 0, w, h);
    g.fillStyle = C.yellow; g.font = font(900, 62); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('범창고 입구 ▶', w / 2, 50);
    g.fillStyle = C.cream; g.font = font(800, 28); g.fillText('E N T R A N C E', w / 2, 103);
  });
  A.draw('exit', (g, w, h) => {
    g.fillStyle = C.deep; g.fillRect(0, 0, w, h);
    g.fillStyle = C.cream; g.font = font(900, 64); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('출구', 28, h / 2 + 2);
    g.fillStyle = C.yellow; g.font = font(800, 34); g.textAlign = 'right'; g.fillText('EXIT · 또 오세요!', w - 24, h / 2 + 2);
  });
  A.draw('cart', (g, w, h) => {
    g.fillStyle = C.green; g.fillRect(0, 0, w, h);
    g.fillStyle = C.cream; g.font = font(900, 58); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('카트 보관소', w / 2 - 40, h / 2 + 2);
    g.strokeStyle = C.yellow; g.lineWidth = 7; const x = w - 96, y = 34; g.beginPath(); g.moveTo(x - 20, y); g.lineTo(x, y); g.lineTo(x + 12, y + 44); g.lineTo(x + 56, y + 44); g.lineTo(x + 66, y + 10); g.lineTo(x + 4, y + 10); g.stroke();
    g.fillStyle = C.yellow; g.beginPath(); g.arc(x + 18, y + 58, 6, 0, 7); g.arc(x + 50, y + 58, 6, 0, 7); g.fill();
  });
  A.draw('hours', (g, w, h) => {
    g.fillStyle = C.cream; g.fillRect(0, 0, w, h);
    g.fillStyle = C.deep; g.font = font(800, 40); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('영업시간 10:00 – 23:00', w / 2, 44);
    g.fillStyle = C.red; g.font = font(700, 30); g.fillText('둘째·넷째 일요일 휴무 (아마도)', w / 2, 96);
  });
  const posts = [['범창고', '◀  650 m', '정자역에서 서남쪽 · 걸어서 9분'], ['범창고', '▶  150 m', '경부고속도로 건너편 · 지도 안내'], ['범창고', '▲  입구', '주차장 · 카트 보관소'], ['범창고 주차장', 'P  진입', '깃발 보이는 곳으로 · 3시간 무료']];
  posts.forEach(([a, b, c], i) => A.draw('post' + i, (g, w, h) => {
    g.fillStyle = C.green; g.fillRect(0, 0, w, h);
    g.fillStyle = C.yellow; g.fillRect(0, h - 14, w, 14);
    drawBoxBeom(g, 16, 22, 96);
    g.fillStyle = C.cream; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, a, 230, 900, 58); g.fillText(a, 128, 58);
    g.fillStyle = C.yellow; g.font = font(900, 52); g.textAlign = 'right'; g.fillText(b, w - 18, 58);
    g.fillStyle = C.cream; g.font = font(700, 32); g.textAlign = 'left'; g.fillText(c, 128, 138);
  }));
  A.draw('canopyLight', (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fffbe8'); gr.addColorStop(1, '#ffe9b0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  A.draw('glass', (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fc3d6'); gr.addColorStop(0.55, '#e8f1f2'); gr.addColorStop(1, '#c9d2cf'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(74,90,106,.55)'; for (let x = 10; x < w; x += 48) g.fillRect(x, 60, 30, 150); // 안쪽 랙 실루엣
    g.fillStyle = 'rgba(200,150,90,.8)'; for (let x = 14; x < w; x += 48) for (let y = 70; y < 200; y += 34) g.fillRect(x, y, 22, 18);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(90, 0); g.lineTo(20, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#2b3036'; g.fillRect(w / 2 - 3, 0, 6, h); g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
  });
  A.draw('pyBack', (g, w, h) => {
    g.fillStyle = C.yellow; g.fillRect(0, 0, w, h);
    g.fillStyle = C.deep; g.font = font(900, 92); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('P  주차장 입구', w / 2, h / 2);
  });
  A.draw('white', (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); });
  const t = tex(A.c, { aniso: 8 });
  // 디자이너 로고로 덮어 그리기 (받는 대로)
  let gone = false;
  Promise.all([loadImg('logo-rev.webp'), loadImg('logo-icon.webp')]).then(([logo, icon]) => {
    if (gone) return;
    if (logo) drawMain(logo);
    if (icon) drawPyTop(icon);
    if (logo || icon) t.needsUpdate = true;
  });
  return { tex: t, slots: A.slots, dispose() { gone = true; t.dispose(); } };
}

/** 현수막·깃발·트럭 도장·바닥 글씨 아틀라스(낮/밤 조명 받는 Lambert, 바닥 글씨는 알파). 가까이 올 때만 만든다. */
export function bannerAtlas({ k = 1 } = {}) {
  const A = new Atlas(2048, 2048, k);
  for (let i = 0; i < 5; i++) A.slot('vb' + i, i * 256, 0, 256, 1024); // 세로 현수막 5종
  A.slot('hb0', 1280, 0, 768, 160); A.slot('hb1', 1280, 160, 768, 160); A.slot('hb2', 1280, 320, 768, 160); // 가로 현수막
  A.slot('truck', 1280, 480, 768, 256); // 트럭 옆면
  A.slot('dock', 1280, 736, 256, 256); // 하역장 셔터
  A.slot('balloon', 1536, 736, 512, 128); // 풍선 아치 글씨
  for (let i = 0; i < 4; i++) A.slot('flag' + i, 1536 + i * 128, 864, 128, 512); // 깃발 4종 (128×512)
  const st = ['in', 'slow', 'dis', 'family', 'ev', 'kei', 'walk', 'nostop', 'out', 'cart', 'depot', 'shop'];
  st.forEach((n, i) => A.slot('st_' + n, (i % 4) * 320, 1024 + Math.floor(i / 4) * 160, 320, 160));
  A.slot('grass', 1280, 1024, 256, 256);
  A.slot('conc', 1536, 1376, 256, 256);
  A.slot('hedge', 1792, 1376, 256, 256);

  const vb = [
    [C.green, C.cream, C.yellow, 'GRAND OPEN', ['오픈', '기념', '대축제'], '정자점 첫 장보기'],
    [C.red, '#fff', C.yellow, 'TIME SALE', ['타임', '세일'], '매일 오후 3시 · 종 치면 달려요'],
    [C.yellow, C.deep, C.red, '30구 특가', ['범란', '6,980'], '1인 2판 · 깨지면 내 탓'],
    [C.deep, C.cream, C.yellow, '골드범 회원', ['시식', '무제한'], '유효기간 평생 (아마도)'],
    [C.kraft, C.deep, C.green, 'BULK!', ['크게', '사면', '크게', '웃어요'], '대용량이 진리'],
  ];
  vb.forEach(([bg, fg, acc, top, big, sub], i) => A.draw('vb' + i, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = acc; g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18);
    g.fillStyle = acc; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, top, w - 30, 900, 44); g.fillText(top, w / 2, 70);
    g.fillStyle = fg; const n = big.length, px = n > 3 ? 92 : 112; let y = 190;
    for (const s of big) { fitText(g, s, w - 26, 900, px); g.fillText(s, w / 2, y); y += px * 1.18; }
    drawBoxBeom(g, w / 2 - 50, h - 300, 100);
    g.fillStyle = fg; const lines = sub.split(' · '); let yy = h - 150; g.font = font(800, 30);
    for (const l of lines) { fitText(g, l, w - 30, 800, 32); g.fillText(l, w / 2, yy); yy += 40; }
  }));
  const hb = [[C.green, C.cream, '크게 사면 크게 웃어요 · 범창고 정자점'], [C.red, '#fff', '오픈 기념 대축제 · 전 품목 대용량 · 매일 낮은 가격'], [C.cream, C.deep, '카트는 크게, 계란은 살살 · 주차 3시간 무료']];
  hb.forEach(([bg, fg, s], i) => A.draw('hb' + i, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = C.yellow; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    drawBoxBeom(g, 18, 26, 106);
    g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'center'; fitText(g, s, w - 170, 900, 64); g.fillText(s, w / 2 + 60, h / 2 + 2);
  }));
  A.draw('truck', (g, w, h) => {
    g.fillStyle = C.cream; g.fillRect(0, 0, w, h);
    g.fillStyle = C.green; g.fillRect(0, h - 70, w, 70); g.fillStyle = C.kraft; g.fillRect(0, h - 82, w, 12);
    drawBoxBeom(g, 30, 30, 120);
    g.fillStyle = C.green; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = font(900, 104); g.fillText('범창고', 170, 92);
    g.fillStyle = C.kraft; g.font = font(900, 40); g.fillText('B U M P   D E P O T', 176, 158);
    g.fillStyle = C.cream; g.font = font(800, 36); g.textAlign = 'right'; g.fillText('오늘도 크게 실어 갑니다 · 신선 배송', w - 24, h - 35);
  });
  A.draw('dock', (g, w, h) => {
    g.fillStyle = '#b8bcc0'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) { g.fillStyle = '#a4a9ae'; g.fillRect(0, y + 7, w, 3); }
    g.fillStyle = C.yellow; g.fillRect(0, h - 20, w, 20); g.fillStyle = C.char; for (let x = -20; x < w; x += 28) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h); g.lineTo(x + 34, h - 20); g.lineTo(x + 20, h - 20); g.fill(); }
  });
  A.draw('balloon', (g, w, h) => {
    g.fillStyle = C.red; rr(g, 4, 4, w - 8, h - 8, 30); g.fill();
    g.fillStyle = '#fff'; g.font = font(900, 70); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GRAND OPEN!', w / 2, h / 2 + 4);
  });
  const fl = [[C.red, '#fff', '특가'], [C.green, C.yellow, '범창고'], [C.yellow, C.deep, 'OPEN'], [C.deep, C.cream, '대용량']];
  fl.forEach(([bg, fg, s], i) => A.draw('flag' + i, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.fillRect(0, 0, 12, h);
    g.save(); g.translate(w / 2 + 6, h / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, s, h - 60, 900, 84); g.fillText(s, 0, 4); g.restore();
  }));
  // 바닥 글씨(흰/노랑 페인트, 투명 바탕) — 글자 아래가 진행 방향(+v 가 멀리)
  const paint = (n, lines, col = '#f4f2ea', icon) => A.draw('st_' + n, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (icon) icon(g, w, h);
    lines.forEach(([s, px, y]) => { fitText(g, s, w - 20, 900, px); g.fillText(s, w / 2, y); });
  });
  paint('in', [['입구', 64, 54], ['▼ ▼', 54, 120]]);
  paint('slow', [['천천히', 70, 56], ['SLOW', 50, 122]]);
  paint('dis', [['장애인 전용', 46, 132]], '#ffffff', (g, w) => { g.lineWidth = 9; g.strokeStyle = '#fff'; const x = w / 2, y = 40; g.beginPath(); g.arc(x - 6, y + 34, 26, 0.3, Math.PI * 1.6); g.stroke(); g.beginPath(); g.arc(x + 4, y - 12, 9, 0, 7); g.fill(); g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + 2, y + 30); g.lineTo(x + 30, y + 30); g.lineTo(x + 40, y + 52); g.stroke(); });
  paint('family', [['임산부·가족', 50, 56], ['배려 주차', 50, 118]], '#ffffff');
  paint('ev', [['전기차', 60, 56], ['충전 전용', 46, 118]], '#ffffff');
  paint('kei', [['경차', 76, 80]]);
  paint('walk', [['보행자 통로', 50, 56], ['카트 조심', 44, 118]], '#ffffff');
  paint('nostop', [['정차 금지', 66, 80]], C.yellow);
  paint('out', [['출구', 64, 54], ['▲ ▲', 54, 120]]);
  paint('cart', [['카트', 64, 56], ['반납', 64, 120]], C.yellow);
  paint('depot', [['범창고', 70, 56], ['▼ 입구', 50, 122]], C.yellow);
  paint('shop', [['어서 오세요', 54, 80]], '#ffffff');
  A.draw('grass', (g, w, h) => { g.fillStyle = '#5d8a45'; g.fillRect(0, 0, w, h); let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 1500; i++) { g.fillStyle = r() > 0.5 ? '#6f9d52' : '#4f7a3a'; g.fillRect(r() * w, r() * h, 2, 3); } });
  A.draw('conc', (g, w, h) => { g.fillStyle = '#c9c6bd'; g.fillRect(0, 0, w, h); g.fillStyle = '#b5b2a9'; for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 1, 0, 2, h); g.fillRect(0, i * 64 - 1, w, 2); } });
  A.draw('hedge', (g, w, h) => { g.fillStyle = '#3e6b34'; g.fillRect(0, 0, w, h); let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? '#4f8240' : '#2f5628'; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 4, 0, 7); g.fill(); } });
  const t = tex(A.c, { aniso: 8 });
  return { tex: t, slots: A.slots, dispose() { t.dispose(); } };
}
