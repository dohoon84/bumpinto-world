// [범핑팡] 2× 귀여운 캐릭터 — 실루엣이 서로 다르게 (귀·모자·바퀴·면발·코인테두리·도시락)
import { TILES, tileById, SPECIAL } from './tiles.js';

const CACHE = new Map();
const SIZE = 160;

function key(id, special, blink) { return `${id}|${special || ''}|${blink ? 1 : 0}`; }

export function getTileSprite(id, special = null, blink = false) {
  const k = key(id, special, blink);
  let c = CACHE.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  paintCharacter(c.getContext('2d'), tileById(id), special, blink);
  CACHE.set(k, c);
  return c;
}
export function clearSpriteCache() { CACHE.clear(); }

function paintCharacter(ctx, tile, special, blink) {
  const S = SIZE, cx = S / 2, cy = S / 2 + 4;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(cx, S - 12, S * 0.34, 9, 0, 0, Math.PI * 2); ctx.fill();

  const f = tile.feature;
  const r = S * 0.40;

  // body shape by silhouette
  if (f === 'coin') paintCoinBody(ctx, tile, cx, cy, r);
  else if (f === 'wheels') paintBusBody(ctx, tile, cx, cy, r);
  else if (f === 'steam') paintBowlBody(ctx, tile, cx, cy, r);
  else if (f === 'bow') paintBentoBody(ctx, tile, cx, cy, r);
  else paintRoundBody(ctx, tile, cx, cy, r);

  // feature accents that break silhouette further
  drawFeature(ctx, tile, cx, cy, r);
  paintFace(ctx, tile, cx, cy, r, blink);
  if (special) drawSpecialMark(ctx, special, cx, cy, r);
}

function paintRoundBody(ctx, tile, cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r);
  g.addColorStop(0, '#fff'); g.addColorStop(0.2, tile.color); g.addColorStop(1, tile.accent);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,40,0.35)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

function paintCoinBody(ctx, tile, cx, cy, r) {
  // thick coin disc with rim
  ctx.fillStyle = tile.accent;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 4, cx, cy, r);
  g.addColorStop(0, '#fff8d0'); g.addColorStop(0.35, tile.color); g.addColorStop(1, tile.accent);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(180,120,0,0.55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  // edge notches
  ctx.strokeStyle = tile.accent; ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.lineTo(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05);
    ctx.stroke();
  }
}

function paintBusBody(ctx, tile, cx, cy, r) {
  const w = r * 1.7, h = r * 1.35, x = cx - w / 2, y = cy - h / 2 + 4;
  roundRect(ctx, x, y, w, h, r * 0.35);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#fff'); g.addColorStop(0.25, tile.color); g.addColorStop(1, tile.accent);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,40,0.35)'; ctx.lineWidth = 3; ctx.stroke();
  // window strip
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  roundRect(ctx, x + 8, y + 10, w - 16, h * 0.28, 6); ctx.fill();
}

function paintBowlBody(ctx, tile, cx, cy, r) {
  // bowl
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.05, cy - r * 0.15);
  ctx.quadraticCurveTo(cx - r * 1.1, cy + r * 0.95, cx, cy + r * 1.05);
  ctx.quadraticCurveTo(cx + r * 1.1, cy + r * 0.95, cx + r * 1.05, cy - r * 0.15);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#fff'); g.addColorStop(0.35, tile.color); g.addColorStop(1, tile.accent);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,40,0.35)'; ctx.lineWidth = 3; ctx.stroke();
  // broth surface
  ctx.fillStyle = 'rgba(255,200,120,0.55)';
  ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.1, r * 0.85, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
}

function paintBentoBody(ctx, tile, cx, cy, r) {
  const w = r * 1.65, h = r * 1.45, x = cx - w / 2, y = cy - h / 2;
  roundRect(ctx, x, y, w, h, r * 0.22);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#fff'); g.addColorStop(0.3, tile.color); g.addColorStop(1, tile.accent);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,40,0.35)'; ctx.lineWidth = 3; ctx.stroke();
  // lid seam
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 6, cy - r * 0.15); ctx.lineTo(x + w - 6, cy - r * 0.15); ctx.stroke();
}

function paintFace(ctx, tile, cx, cy, r, blink) {
  ctx.fillStyle = tile.blush; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(cx - r * 0.42, cy + r * 0.1, r * 0.15, r * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.42, cy + r * 0.1, r * 0.15, r * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const eyeY = cy - r * 0.06, eyeDX = r * 0.28, eyeR = r * 0.17;
  if (blink) {
    ctx.strokeStyle = '#1a2236'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * eyeDX - eyeR * 0.7, eyeY);
      ctx.quadraticCurveTo(cx + s * eyeDX, eyeY + 2, cx + s * eyeDX + eyeR * 0.7, eyeY);
      ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      const ex = cx + s * eyeDX;
      ctx.fillStyle = '#1a2236';
      ctx.beginPath(); ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex - eyeR * 0.28, eyeY - eyeR * 0.32, eyeR * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + eyeR * 0.2, eyeY + eyeR * 0.18, eyeR * 0.14, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.strokeStyle = '#1a2236'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.16, cy + r * 0.28);
  ctx.quadraticCurveTo(cx, cy + r * 0.42, cx + r * 0.16, cy + r * 0.28);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.38, cy - r * 0.4, r * 0.16, r * 0.1, -0.4, 0, Math.PI * 2); ctx.fill();
}

function drawFeature(ctx, tile, cx, cy, r) {
  const f = tile.feature;
  if (f === 'ears') {
    for (const s of [-1, 1]) {
      const ex = cx + s * r * 0.82, ey = cy - r * 0.82;
      ctx.fillStyle = tile.accent;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tile.blush;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(20,24,40,0.3)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.38, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (f === 'shine') {
    // already have coin rim; add sparkle
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    star(ctx, cx + r * 0.55, cy - r * 0.55, 5, r * 0.18, r * 0.08);
    ctx.fill();
  } else if (f === 'helmet') {
    ctx.fillStyle = '#1a2236';
    ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.55, r * 0.72, r * 0.42, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = tile.accent;
    ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.62, r * 0.62, r * 0.32, 0, Math.PI, 0); ctx.fill();
    // visor
    ctx.fillStyle = 'rgba(100,200,255,0.55)';
    ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.42, r * 0.5, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  } else if (f === 'wheels') {
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#1a2236';
      ctx.beginPath(); ctx.arc(cx + s * r * 0.55, cy + r * 0.78, r * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ddd';
      ctx.beginPath(); ctx.arc(cx + s * r * 0.55, cy + r * 0.78, r * 0.08, 0, Math.PI * 2); ctx.fill();
    }
  } else if (f === 'steam') {
    // noodle swirl
    ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.55, cy - r * 0.05 + i * 7);
      ctx.bezierCurveTo(cx - r * 0.1, cy - r * 0.35 + i * 7, cx + r * 0.1, cy + r * 0.2 + i * 7, cx + r * 0.55, cy - r * 0.1 + i * 7);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const x = cx - r * 0.25 + i * r * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, cy - r * 0.75);
      ctx.quadraticCurveTo(x + 8, cy - r * 1.0, x, cy - r * 1.2);
      ctx.stroke();
    }
  } else if (f === 'bow') {
    ctx.fillStyle = '#ff6b9d';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.95);
    ctx.lineTo(cx - r * 0.38, cy - r * 0.55);
    ctx.lineTo(cx, cy - r * 0.68);
    ctx.lineTo(cx + r * 0.38, cy - r * 0.55);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.75, r * 0.1, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSpecialMark(ctx, special, cx, cy, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.55, r * 0.3, 0, Math.PI * 2); ctx.fill();
  const col = special === 'bomb' ? '#ff9f1c' : special === 'color' ? '#ffe66d' : '#5b8cff';
  ctx.strokeStyle = col; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.55, r * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = col;
  ctx.font = `900 ${Math.floor(r * 0.38)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const mark = special === 'lineH' ? '↔' : special === 'lineV' ? '↕' : special === 'bomb' ? '✦' : '★';
  ctx.fillText(mark, cx, cy + r * 0.57);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function star(ctx, x, y, n, outer, inner) {
  ctx.moveTo(x, y - outer);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const b = a + Math.PI / n;
    ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
    ctx.lineTo(x + Math.cos(b) * inner, y + Math.sin(b) * inner);
  }
  ctx.closePath();
}

export function prewarmSprites() {
  for (const t of TILES) {
    getTileSprite(t.id, null, false);
    getTileSprite(t.id, null, true);
    for (const s of Object.keys(SPECIAL)) getTileSprite(t.id, s, false);
  }
}
