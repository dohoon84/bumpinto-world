// [myeongdong] 간판·네온·가게 앞면·노점 메뉴·역 표지를 캔버스 하나(2048²)에 그린 아틀라스.
//   명동의 간판·쇼윈도·노점은 전부 이 텍스처 한 장을 쓰는 병합 메시 1개로 그린다(draw 1).
//   상호는 모두 지어낸 이름이다(실제 브랜드·상표 아님). 한국어·영어(+中文·日本語 한 줄)로 외국인 관광객 거리 느낌을 낸다.
import * as THREE from 'three';

export const MD_FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","Gothic A1","Noto Sans CJK KR",sans-serif';

// [ko, en, bg, fg, accent] — 화장품 거리가 절반 이상
export const SHOP_SIGNS = [
  ['범프뷰티', 'BUMP BEAUTY', '#ff4f9a', '#ffffff', '#ffe169'],
  ['모찌스킨', 'MOCHI SKIN', '#ffffff', '#e8457c', '#f7b6cf'],
  ['꿀광연구소', 'HONEY GLOW LAB', '#ffc53d', '#3a2400', '#ffffff'],
  ['듀드롭', 'DEWDROP', '#13b6c9', '#ffffff', '#c8f6ff'],
  ['달팽이크림', 'SNAIL SOUL', '#2f8f5b', '#ffffff', '#c9f0a8'],
  ['피치필', 'PEACH PEEL', '#ff8f6b', '#ffffff', '#ffe0cf'],
  ['시카클라우드', 'CICA CLOUD', '#e9f6ec', '#2c7a52', '#79c99a'],
  ['로즈앤문', 'ROSE & MOON', '#2a1f4d', '#ffd1e8', '#ff79b5'],
  ['아쿠아민트', 'AQUA MINT', '#00c2a8', '#ffffff', '#b8fff3'],
  ['케이글로우', 'K-GLOW', '#111111', '#ff5ccf', '#5cf2ff'],
  ['네이처범프', 'NATURE BUMP', '#5fae3e', '#ffffff', '#e4ffcf'],
  ['마스크팩 10+10', 'MASK PACK 10+10', '#ff2d55', '#ffffff', '#ffe169'],
  ['비건클레이', 'VEGAN CLAY', '#d9c3a5', '#4a3622', '#ffffff'],
  ['선앤스노우', 'SUN & SNOW', '#3a7bff', '#ffffff', '#ffe169'],
  ['립피랩', 'LIPPY LAB', '#c3002f', '#ffffff', '#ffb3c4'],
  ['글로우팜', 'GLOW FARM', '#7a3cff', '#ffffff', '#ffd6ff'],
  ['환전 EXCHANGE', '兌換 · 両替 · ¥ $ €', '#0d3b8c', '#ffe169', '#ffffff'],
  ['TAX FREE', '免税 · 免税店 · 즉시환급', '#e60012', '#ffffff', '#ffe169'],
  ['범프24', 'BP24 · 24시 편의점', '#1d2b53', '#ffe169', '#4cc9f0'],
  ['범프 커피', 'BUMP COFFEE', '#4b2e1e', '#f6e6c8', '#ffb35c'],
  ['구름칼국수', 'CLOUD NOODLE · 手打麵', '#f4efe2', '#7a1f1f', '#c9a36b'],
  ['만두나라', 'DUMPLING LAND', '#ffffff', '#c3002f', '#ffd166'],
  ['K-POP 굿즈', 'K-POP STAR SHOP', '#120b2e', '#ff4fd8', '#46f0ff'],
  ['양말 3켤레 5000', 'SOCKS 3 FOR ₩5,000', '#ffe169', '#1a1a1a', '#ff4f9a'],
  ['폰케이스', 'PHONE CASE', '#222831', '#00e0ff', '#ffffff'],
  ['약국', 'PHARMACY · 藥局', '#ffffff', '#16a34a', '#16a34a'],
  ['치킨킹', 'FRIED CHICKEN · 炸鸡', '#ffb703', '#7a1f00', '#ffffff'],
  ['SALE 50%', 'SUMMER · WINTER · ALL DAY', '#ff006e', '#ffffff', '#ffe169'],
  ['한복대여', 'HANBOK RENTAL · 韓服', '#7b2cbf', '#ffe8fb', '#ffd166'],
  ['노래방', 'KARAOKE · カラオケ', '#0a0a0a', '#39ff14', '#ff2079'],
  ['숯불갈비', 'K-GRILL · 烤肉', '#3b0d0c', '#ffcf8b', '#ff7b00'],
  ['명동 기념품', 'SOUVENIR · お土産', '#005f73', '#ffffff', '#ee9b00'],
  ['안경나라', 'OPTICAL · メガネ', '#f1f5f9', '#0f172a', '#38bdf8'],
  ['코스메 1+1', 'コスメ · 化妆品 · BEAUTY', '#ff7eb6', '#ffffff', '#ffffff'],
  ['호텔 범핀', 'HOTEL BUMPIN', '#14213d', '#fca311', '#e5e5e5'],
  ['떡볶이공작소', 'TTEOKBOKKI FACTORY', '#e63946', '#ffffff', '#ffd166'],
];
// 세로 돌출 간판 (한 글자씩 세로로)
export const V_SIGNS = [
  ['화장품', '#ff4f9a', '#ffffff'], ['환전', '#0d3b8c', '#ffe169'], ['약국', '#ffffff', '#16a34a'], ['노래방', '#0a0a0a', '#39ff14'],
  ['칼국수', '#f4efe2', '#7a1f1f'], ['호텔', '#14213d', '#fca311'], ['만두', '#ffffff', '#c3002f'], ['치킨', '#ffb703', '#7a1f00'],
  ['카페', '#4b2e1e', '#f6e6c8'], ['한복', '#7b2cbf', '#ffe8fb'], ['면세점', '#e60012', '#ffffff'], ['안경', '#f1f5f9', '#0f172a'],
  ['BEAUTY', '#111111', '#ff5ccf'], ['COSME', '#00c2a8', '#ffffff'], ['SALE', '#ffe169', '#e60012'], ['K-POP', '#120b2e', '#46f0ff'],
];
// 노점 메뉴 [ko, en, price, bg, fg]
export const STALL_MENUS = [
  ['떡볶이', 'TTEOKBOKKI', '₩4,000', '#e63946', '#ffffff'],
  ['호떡', 'HOTTEOK', '₩2,000', '#f4a261', '#2b1600'],
  ['계란빵', 'EGG BREAD', '₩2,500', '#ffd166', '#2b1600'],
  ['닭꼬치', 'CHICKEN SKEWER', '₩5,000', '#9d0208', '#ffe8d6'],
  ['랍스터 치즈구이', 'LOBSTER CHEESE', '₩15,000', '#d00000', '#ffffff'],
  ['딸기모찌', 'STRAWBERRY MOCHI', '₩5,000', '#ffafcc', '#7a0b3a'],
  ['회오리감자', 'TORNADO POTATO', '₩5,000', '#ffb703', '#1d1d1d'],
  ['어묵', 'FISH CAKE · おでん', '₩1,500', '#1d3557', '#f1faee'],
  ['군밤', 'ROASTED CHESTNUT', '₩5,000', '#6b3e26', '#ffe8c2'],
  ['붕어빵', 'BUNGEOPPANG', '₩3,000', '#e9c46a', '#3b1f00'],
  ['탕후루', 'TANGHULU', '₩4,000', '#ff4d6d', '#ffffff'],
  ['고기만두', 'DUMPLINGS', '₩4,000', '#f8f9fa', '#9d0208'],
];
export const NEON = { pink: '#ff3fb4', cyan: '#2ef2ff', violet: '#a35cff', green: '#3dff7a', yellow: '#ffe14a', white: '#fff6e8', orange: '#ff8a1f', red: '#ff2b3a', warm: '#ffd38a', l4: '#00A5DE' };

function rnd32(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function fitFont(g, text, maxW, size, weight = 900) {
  let s = size;
  g.font = `${weight} ${s}px ${MD_FONT}`;
  while (s > 8 && g.measureText(text).width > maxW) { s -= 1; g.font = `${weight} ${s}px ${MD_FONT}`; }
  return s;
}

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawHSign(g, w, h, [ko, en, bg, fg, ac], i) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // 테두리 네온 띠
  g.strokeStyle = ac; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
  const r = rnd32(91 + i * 7);
  // 로고 동그라미
  g.fillStyle = ac; g.beginPath(); g.arc(h * 0.55, h / 2, h * 0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = bg; g.font = `900 ${h * 0.34}px ${MD_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(en).trim()[0] || '★', h * 0.55, h / 2 + 1);
  g.textAlign = 'left';
  const x0 = h * 1.0, tw = w - x0 - 16;
  g.fillStyle = fg;
  fitFont(g, ko, tw, h * 0.5);
  g.fillText(ko, x0, h * 0.4);
  g.globalAlpha = 0.92;
  fitFont(g, en, tw, h * 0.24, 800);
  g.fillText(en, x0 + 2, h * 0.78);
  g.globalAlpha = 1;
  if (r() < 0.35) { g.fillStyle = ac; g.fillRect(w - 26, 14, 10, h - 28); }
}

function drawVSign(g, w, h, [txt, bg, fg]) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.globalAlpha = 0.85; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); g.globalAlpha = 1;
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ascii = /^[A-Z0-9\- ]+$/.test(txt);
  const chars = [...txt];
  const step = (h - 30) / chars.length;
  const fs = Math.min(w * 0.72, step * (ascii ? 0.95 : 0.86));
  g.font = `900 ${fs}px ${MD_FONT}`;
  chars.forEach((c, k) => g.fillText(c, w / 2, 15 + step * (k + 0.5)));
}

function drawStorefront(g, w, h, i) {
  const r = rnd32(1777 + i * 13);
  const pal = [['#fff3f7', '#ff7eb6'], ['#f3fbff', '#22b8cf'], ['#fffaf0', '#f59f00'], ['#f5f5f5', '#495057'], ['#fff0f6', '#c2255c'], ['#f1fff4', '#2f9e44'], ['#fff9db', '#e67700'], ['#f8f0ff', '#7048e8']][i % 8];
  // 실내 (밝은 조명)
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, pal[0]); gr.addColorStop(1, '#d9d4cf');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // 진열대 + 상품 점
  const shelves = 4;
  for (let s = 0; s < shelves; s++) {
    const y = h * 0.18 + s * h * 0.17;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(8, y + 16, w - 16, 3);
    for (let x = 12; x < w - 12; x += 7 + r() * 5) {
      const ph = 6 + r() * 10;
      g.fillStyle = r() < 0.5 ? pal[1] : `hsl(${Math.floor(r() * 360)},70%,${55 + r() * 25}%)`;
      g.fillRect(x, y + 16 - ph, 4 + r() * 3, ph);
    }
  }
  // 천장 조명
  g.fillStyle = 'rgba(255,255,255,.95)';
  for (let x = 20; x < w; x += 46) g.fillRect(x, 6, 26, 4);
  // 문 + 유리 반사
  const dx = i % 2 ? w * 0.62 : w * 0.12, dw = w * 0.26;
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(dx, h * 0.22, dw, h * 0.78);
  g.strokeStyle = '#2b2b2b'; g.lineWidth = 3; g.strokeRect(dx, h * 0.22, dw, h * 0.78);
  g.fillStyle = 'rgba(255,255,255,.22)';
  g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.25, 0); g.lineTo(w * 0.36, 0); g.lineTo(w * 0.11, h); g.fill();
  // 유리창 프레임
  g.fillStyle = '#26282c';
  g.fillRect(0, 0, w, 4); g.fillRect(0, h - 8, w, 8); g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
  // 창 스티커
  g.fillStyle = pal[1]; g.font = `900 ${h * 0.09}px ${MD_FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const stick = ['1+1', 'SALE', 'OPEN', '免税', 'WELCOME', '50%', 'NEW', 'TAX FREE'][i % 8];
  g.fillText(stick, i % 2 ? w * 0.08 : w * 0.45, h * 0.95);
}

function drawMenu(g, w, h, [ko, en, price, bg, fg]) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'left';
  fitFont(g, ko, w * 0.62, h * 0.48);
  g.fillText(ko, 10, h * 0.36);
  fitFont(g, en, w * 0.62, h * 0.22, 800);
  g.fillText(en, 11, h * 0.78);
  g.textAlign = 'right';
  fitFont(g, price, w * 0.34, h * 0.3, 900);
  g.fillText(price, w - 10, h * 0.5);
  g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
}

function drawFood(g, w, h, i) {
  const r = rnd32(4242 + i * 31);
  g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, w, h); // 스테인리스 판
  g.fillStyle = '#c7ccd1'; g.fillRect(3, 3, w - 6, h - 6);
  const kinds = [
    () => { g.fillStyle = '#d62828'; for (let k = 0; k < 90; k++) { const x = 10 + r() * (w - 20), y = 8 + r() * (h - 16); g.fillRect(x, y, 10, 4); } }, // 떡볶이
    () => { for (let k = 0; k < 8; k++) { g.fillStyle = '#c47a2c'; g.beginPath(); g.ellipse(18 + k * ((w - 30) / 8), h / 2, 12, 10, 0, 0, 6.3); g.fill(); g.fillStyle = '#e9a85a'; g.beginPath(); g.arc(14 + k * ((w - 30) / 8), h / 2 - 3, 4, 0, 6.3); g.fill(); } }, // 호떡
    () => { for (let k = 0; k < 9; k++) { g.fillStyle = '#e9b44c'; g.fillRect(8 + k * ((w - 16) / 9), h * 0.2, (w - 40) / 9, h * 0.6); g.fillStyle = '#fff4c2'; g.beginPath(); g.arc(8 + k * ((w - 16) / 9) + 10, h / 2, 6, 0, 6.3); g.fill(); } }, // 계란빵
    () => { for (let k = 0; k < 12; k++) { g.fillStyle = '#5c3a1e'; g.fillRect(8 + k * ((w - 16) / 12), 6, 2, h - 12); g.fillStyle = k % 2 ? '#9c2a10' : '#b5491a'; g.fillRect(4 + k * ((w - 16) / 12), h * 0.25, 10, h * 0.5); } }, // 꼬치
    () => { for (let k = 0; k < 6; k++) { g.fillStyle = '#e85d04'; g.beginPath(); g.ellipse(22 + k * ((w - 40) / 6), h / 2, 16, 8, 0.3, 0, 6.3); g.fill(); g.fillStyle = '#ffd166'; g.fillRect(14 + k * ((w - 40) / 6), h / 2 - 3, 16, 5); } }, // 랍스터
    () => { for (let k = 0; k < 14; k++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(12 + k * ((w - 20) / 14), h / 2, 7, 0, 6.3); g.fill(); g.fillStyle = '#e63946'; g.beginPath(); g.arc(12 + k * ((w - 20) / 14), h / 2 - 3, 3, 0, 6.3); g.fill(); } }, // 모찌
  ];
  kinds[i % kinds.length]();
}

function drawStationSign(g, w, h) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f2a44'; g.fillRect(0, h - 18, w, 18);
  g.fillStyle = '#00A5DE'; g.beginPath(); g.arc(h * 0.45, h * 0.44, h * 0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = `900 ${h * 0.4}px ${MD_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('4', h * 0.45, h * 0.46);
  g.textAlign = 'left'; g.fillStyle = '#111827';
  g.font = `900 ${h * 0.42}px ${MD_FONT}`; g.fillText('명동', h * 0.9, h * 0.34);
  g.font = `800 ${h * 0.2}px ${MD_FONT}`; g.fillStyle = '#374151'; g.fillText('Myeongdong  明洞', h * 0.92, h * 0.68);
  g.fillStyle = '#fff'; g.font = `700 ${12}px ${MD_FONT}`; g.fillText('지하철 4호선 Line 4', h * 0.9, h - 9);
}

function drawExitNo(g, w, h, n) {
  g.fillStyle = '#ffd200'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111'; g.font = `900 ${h * (String(n).length > 1 ? 0.62 : 0.78)}px ${MD_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), w / 2, h / 2 + 2);
}

function drawGuide(g, w, h) {
  g.fillStyle = '#0b7fb0'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  // 위쪽(+v)을 가리키는 쉐브론 두 개
  for (const y0 of [h * 0.15, h * 0.55]) {
    g.beginPath(); g.moveTo(w * 0.2, y0 + h * 0.28); g.lineTo(w * 0.5, y0); g.lineTo(w * 0.8, y0 + h * 0.28); g.lineTo(w * 0.8, y0 + h * 0.4); g.lineTo(w * 0.5, y0 + h * 0.12); g.lineTo(w * 0.2, y0 + h * 0.4); g.closePath(); g.fill();
  }
}

function drawGuideBoard(g, w, h) {
  g.fillStyle = '#123a5c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffe169'; g.fillRect(0, 0, w, 10);
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = `900 ${h * 0.25}px ${MD_FONT}`; g.fillText('🚠 남산케이블카 →', 18, h * 0.36);
  g.font = `800 ${h * 0.16}px ${MD_FONT}`; g.fillText('Namsan Cable Car · 남산오르미 Oreumi', 20, h * 0.68);
  g.font = `700 ${h * 0.12}px ${MD_FONT}`; g.fillStyle = '#bfe3ff'; g.fillText('N서울타워 N Seoul Tower', 20, h * 0.88);
}

function drawPlain(g, w, h, color) { g.fillStyle = color; g.fillRect(0, 0, w, h); }

/** 명동 아틀라스. uv(name) → [u0, v0, u1, v1] (three 텍스처 좌표, flipY 반영) */
export function createMyeongdongAtlas() {
  const W = 2048, H = 2048, PAD = 4;
  const items = [];
  SHOP_SIGNS.forEach((s, i) => items.push({ name: 'h' + i, w: 500, h: 96, draw: (g, w, h) => drawHSign(g, w, h, s, i) }));
  for (let i = 0; i < 16; i++) items.push({ name: 'front' + i, w: 248, h: 160, draw: (g, w, h) => drawStorefront(g, w, h, i) });
  V_SIGNS.forEach((s, i) => items.push({ name: 'v' + i, w: 80, h: 368, draw: (g, w, h) => drawVSign(g, w, h, s) }));
  STALL_MENUS.forEach((s, i) => items.push({ name: 'menu' + i, w: 248, h: 64, draw: (g, w, h) => drawMenu(g, w, h, s) }));
  for (let i = 0; i < 6; i++) items.push({ name: 'food' + i, w: 248, h: 56, draw: (g, w, h) => drawFood(g, w, h, i) });
  items.push({ name: 'station', w: 512, h: 128, draw: drawStationSign });
  for (let n = 1; n <= 12; n++) items.push({ name: 'exit' + n, w: 56, h: 56, draw: (g, w, h) => drawExitNo(g, w, h, n) });
  items.push({ name: 'guide', w: 96, h: 96, draw: drawGuide });
  items.push({ name: 'guideBoard', w: 512, h: 160, draw: drawGuideBoard });
  for (const [k, c] of Object.entries(NEON)) items.push({ name: 'neon-' + k, w: 24, h: 24, draw: (g, w, h) => drawPlain(g, w, h, c) });
  for (const [k, c] of Object.entries({ steel: '#b8bec6', dark: '#2a2d33', glass: '#9fd3e6', canopyRed: '#d62828', canopyBlue: '#1d4e89', canopyGreen: '#2a9d8f', canopyYellow: '#f4a261', white: '#ffffff', black: '#0b0b0d' })) {
    items.push({ name: 'c-' + k, w: 24, h: 24, draw: (g, w, h) => drawPlain(g, w, h, c) });
  }
  // 높이 내림차순 선반 패킹
  items.sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    const w = it.w + PAD * 2, h = it.h + PAD * 2;
    if (x + w > W) { x = 0; y += rowH; rowH = 0; }
    it.x = x + PAD; it.y = y + PAD; x += w; rowH = Math.max(rowH, h);
  }
  const usedH = y + rowH;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const map = new Map();
  if (!canvas) {
    for (const it of items) map.set(it.name, [it.x / W, 1 - (it.y + it.h) / H, (it.x + it.w) / W, 1 - it.y / H]);
    return { texture: null, uv: (n) => map.get(n) || [0, 0, 0.001, 0.001], usedH, items };
  }
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (const it of items) {
    g.save();
    g.translate(it.x, it.y);
    g.beginPath(); g.rect(0, 0, it.w, it.h); g.clip();
    it.draw(g, it.w, it.h);
    g.restore();
    // 밉맵 번짐 방지: 가장자리 픽셀을 PAD 만큼 늘린다
    g.drawImage(canvas, it.x, it.y, it.w, 1, it.x, it.y - PAD, it.w, PAD);
    g.drawImage(canvas, it.x, it.y + it.h - 1, it.w, 1, it.x, it.y + it.h, it.w, PAD);
    g.drawImage(canvas, it.x, it.y - PAD, 1, it.h + PAD * 2, it.x - PAD, it.y - PAD, PAD, it.h + PAD * 2);
    g.drawImage(canvas, it.x + it.w - 1, it.y - PAD, 1, it.h + PAD * 2, it.x + it.w, it.y - PAD, PAD, it.h + PAD * 2);
    // 반 텍셀 안쪽으로 UV 를 잡는다
    map.set(it.name, [(it.x + 0.5) / W, 1 - (it.y + it.h - 0.5) / H, (it.x + it.w - 0.5) / W, 1 - (it.y + 0.5) / H]);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.name = 'myeongdong-atlas';
  return { texture, canvas, uv: (n) => map.get(n) || map.get('c-white'), usedH, items };
}

export { rr as roundRectPath };
