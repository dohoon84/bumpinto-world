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
  ['스트릿무드', 'STREET MOOD · 潮流', '#111111', '#ffffff', '#ff3b3b'],
  ['데일리룩', 'DAILY LOOK · FASHION', '#f2efe9', '#222222', '#b08560'],
  ['슈즈범프', 'SHOE BUMP · 운동화 · 鞋', '#ff6b00', '#ffffff', '#111111'],
  ['스니커랩', 'SNEAKER LAB', '#1a1a1a', '#c8ff00', '#ffffff'],
  ['구름다방', 'CLOUD CAFE · 咖啡', '#efe8dc', '#4b2e1e', '#c9a36b'],
  ['밀크티하우스', 'MILK TEA HOUSE · 奶茶', '#f6d6b8', '#5a3a24', '#ffffff'],
  ['명동환전소', 'MONEY EXCHANGE · 換錢 · 両替', '#ffe169', '#0d3b8c', '#0d3b8c'],
  ['하늘약국', 'SKY PHARMACY · 藥局 · 薬局', '#16a34a', '#ffffff', '#ffffff'],
];
/** 1층 가게 종류 → 쓸 수 있는 간판(SHOP_SIGNS 번호). 노래방(29)·호텔(34)은 위층 간판에만 */
export const SIGN_TYPES = {
  beauty: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 33],
  fashion: [27, 28, 32, 36, 37, 23, 24],
  shoes: [38, 39],
  cafe: [19, 40, 41],
  exchange: [16, 42],
  convenience: [18],
  pharmacy: [25, 43],
  souvenir: [31, 22],
  restaurant: [20, 21, 26, 30, 35],
};
// 가게 앞 X배너(세로 입간판) [위 큰 글, 아래 작은 글, bg, fg]
export const X_BANNERS = [
  ['1+1', 'EVENT · 이벤트', '#e60012', '#ffffff'],
  ['TAX FREE', '즉시환급 · 免税', '#ffffff', '#e60012'],
  ['70%', 'SALE · 세일', '#ff2d55', '#ffe169'],
  ['10+10', 'MASK PACK · 마스크팩', '#ff7eb6', '#ffffff'],
  ['NEW', 'K-BEAUTY · 新品', '#13b6c9', '#ffffff'],
  ['2+1', 'SUN CARE · 선크림', '#ffc53d', '#3a2400'],
];
// 세로 돌출 간판 (한 글자씩 세로로)
export const V_SIGNS = [
  ['화장품', '#ff4f9a', '#ffffff'], ['환전', '#0d3b8c', '#ffe169'], ['약국', '#ffffff', '#16a34a'], ['노래방', '#0a0a0a', '#39ff14'],
  ['칼국수', '#f4efe2', '#7a1f1f'], ['호텔', '#14213d', '#fca311'], ['만두', '#ffffff', '#c3002f'], ['치킨', '#ffb703', '#7a1f00'],
  ['카페', '#4b2e1e', '#f6e6c8'], ['한복', '#7b2cbf', '#ffe8fb'], ['면세점', '#e60012', '#ffffff'], ['안경', '#f1f5f9', '#0f172a'],
  ['BEAUTY', '#111111', '#ff5ccf'], ['COSME', '#00c2a8', '#ffffff'], ['SALE', '#ffe169', '#e60012'], ['K-POP', '#120b2e', '#46f0ff'],
];
// 노점 메뉴 [ko, en, price, bg, fg]
// 노점 메뉴 [ko, en, price, bg, fg] — 번호 = myeongdongFood.js 음식 종류
export const STALL_MENUS = [
  ['떡볶이·어묵', 'TTEOKBOKKI & FISH CAKE', '₩4,000', '#e63946', '#ffffff'],
  ['계란빵', 'EGG BREAD', '₩2,500', '#ffd166', '#2b1600'],
  ['회오리감자', 'TORNADO POTATO', '₩5,000', '#ffb703', '#1d1d1d'],
  ['랍스터 치즈구이', 'GRILLED LOBSTER', '₩20,000', '#d00000', '#ffffff'],
  ['대왕문어꼬치', 'GIANT OCTOPUS SKEWER', '₩12,000', '#7b2cbf', '#ffffff'],
  ['호떡', 'HOTTEOK · SWEET PANCAKE', '₩2,000', '#f4a261', '#2b1600'],
  ['딸기 탕후루', 'STRAWBERRY TANGHULU', '₩4,000', '#ff4d6d', '#ffffff'],
  ['군밤', 'ROASTED CHESTNUTS', '₩5,000', '#6b3e26', '#ffe8c2'],
  ['닭꼬치', 'CHICKEN SKEWER', '₩5,000', '#9d0208', '#ffe8d6'],
  ['붕어빵', 'FISH BUN · 3 FOR', '₩3,000', '#e9c46a', '#3b1f00'],
  ['딸기모찌', 'STRAWBERRY MOCHI', '₩5,000', '#ffafcc', '#7a0b3a'],
  ['고기만두', 'STEAMED DUMPLINGS', '₩4,000', '#f8f9fa', '#9d0208'],
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

function drawXBanner(g, w, h, [big, small, bg, fg]) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
  fitFont(g, big, w - 10, w * 0.5); g.fillText(big, w / 2, h * 0.3);
  const parts = small.split(' · ');
  parts.forEach((p, k) => { fitFont(g, p, w - 10, w * 0.17, 800); g.fillText(p, w / 2, h * 0.55 + k * w * 0.22); });
  g.globalAlpha = 0.35; g.fillRect(8, h * 0.45, w - 16, 2); g.globalAlpha = 1;
}

function drawTag(g, w, h, [ko, en, price, bg, fg]) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h * 0.42);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg; fitFont(g, ko, w - 8, h * 0.3); g.fillText(ko, w / 2, h * 0.22);
  g.fillStyle = '#111'; fitFont(g, price, w - 8, h * 0.32); g.fillText(price, w / 2, h * 0.6);
  g.fillStyle = '#444'; fitFont(g, en, w - 6, h * 0.14, 800); g.fillText(en, w / 2, h * 0.87);
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
/** tick 을 주면 항목마다 쉬어 가는 Promise 를 돌려준다 (지연 빌드에서 긴 작업 하나가 프레임을 막지 않게) */
export function createMyeongdongAtlas(tick = null) {
  const W = 2048, H = 2048, PAD = 4;
  const items = [];
  SHOP_SIGNS.forEach((s, i) => items.push({ name: 'h' + i, w: 500, h: 96, draw: (g, w, h) => drawHSign(g, w, h, s, i) }));
  X_BANNERS.forEach((s, i) => items.push({ name: 'xb' + i, w: 64, h: 192, draw: (g, w, h) => drawXBanner(g, w, h, s) }));
  V_SIGNS.forEach((s, i) => items.push({ name: 'v' + i, w: 80, h: 368, draw: (g, w, h) => drawVSign(g, w, h, s) }));
  STALL_MENUS.forEach((s, i) => items.push({ name: 'menu' + i, w: 248, h: 64, draw: (g, w, h) => drawMenu(g, w, h, s) }));
  STALL_MENUS.forEach((s, i) => items.push({ name: 'tag' + i, w: 120, h: 72, draw: (g, w, h) => drawTag(g, w, h, s) }));
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
  // 항목마다 작은 캔버스에 그리고 가장자리를 PAD 만큼 늘린 뒤(밉맵 번짐 방지) 아틀라스에 한 번 붙인다.
  //   (2048² 캔버스를 자기 자신에 drawImage 하면 매번 전체 스냅샷이 떠서 수 초가 걸렸다)
  const sc = document.createElement('canvas'), sg = sc.getContext('2d');
  const paint = (it) => {
    const w = it.w + PAD * 2, h = it.h + PAD * 2;
    if (sc.width < w || sc.height < h) { sc.width = Math.max(sc.width, w); sc.height = Math.max(sc.height, h); }
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, w, h);
    sg.save(); sg.translate(PAD, PAD); sg.beginPath(); sg.rect(0, 0, it.w, it.h); sg.clip();
    it.draw(sg, it.w, it.h);
    sg.restore();
    sg.drawImage(sc, PAD, PAD, it.w, 1, PAD, 0, it.w, PAD);
    sg.drawImage(sc, PAD, PAD + it.h - 1, it.w, 1, PAD, PAD + it.h, it.w, PAD);
    sg.drawImage(sc, PAD, 0, 1, h, 0, 0, PAD, h);
    sg.drawImage(sc, PAD + it.w - 1, 0, 1, h, PAD + it.w, 0, PAD, h);
    g.drawImage(sc, 0, 0, w, h, it.x - PAD, it.y - PAD, w, h);
    // 반 텍셀 안쪽으로 UV 를 잡는다
    map.set(it.name, [(it.x + 0.5) / W, 1 - (it.y + it.h - 0.5) / H, (it.x + it.w - 0.5) / W, 1 - (it.y + 0.5) / H]);
  };
  if (tick) return (async () => { for (const it of items) { paint(it); await tick('md-atlas'); } return finish(); })();
  for (const it of items) paint(it);
  return finish();
  function finish() {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.name = 'myeongdong-atlas';
  return { texture, canvas, uv: (n) => map.get(n) || map.get('c-white'), usedH, items };
  }
}

export { rr as roundRectPath };
