// [범핑팡] 캔버스 2× 귀여운 캐릭터 스프라이트 (오리지널, 텍스트 라벨 없음)
import { TILES, tileById, SPECIAL } from './tiles.js';

const CACHE = new Map();
const SIZE = 128; // 2× crisp base

function key(id, special, blink) {
  return `${id}|${special || ''}|${blink ? 1 : 0}`;
}

/** Offscreen canvas sprite; redrawn rarely (blink toggles). */
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
  const S = SIZE, cx = S / 2, cy = S / 2 + 2;
  ctx.clearRect(0, 0, S, S);

  // soft ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(cx, S - 14, S * 0.32, 8, 0, 0, Math.PI * 2); ctx.fill();

  // body blob (chubby circle)
  const r = S * 0.38;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.22, tile.color);
  g.addColorStop(1, tile.accent);
  ctx.fillStyle = g;
  roundBlob(ctx, cx, cy, r);
  ctx.fill();

  // outline
  ctx.strokeStyle = 'rgba(20,24,40,0.35)';
  ctx.lineWidth = 3;
  roundBlob(ctx, cx, cy, r);
  ctx.stroke();

  // feature accents (silhouette helpers — still face-forward cute)
  drawFeature(ctx, tile, cx, cy, r);

  // blush
  ctx.fillStyle = tile.blush;
  ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(cx - r * 0.42, cy + r * 0.12, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.42, cy + r * 0.12, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // eyes — big and shiny
  const eyeY = cy - r * 0.08;
  const eyeDX = r * 0.28;
  const eyeR = r * 0.18;
  if (blink) {
    ctx.strokeStyle = '#1a2236';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
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
      ctx.beginPath(); ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      // shine
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex - eyeR * 0.28, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + eyeR * 0.22, eyeY + eyeR * 0.2, eyeR * 0.16, 0, Math.PI * 2); ctx.fill();
    }
  }

  // smile
  ctx.strokeStyle = '#1a2236';
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.18, cy + r * 0.28);
  ctx.quadraticCurveTo(cx, cy + r * 0.42, cx + r * 0.18, cy + r * 0.28);
  ctx.stroke();

  // tiny highlight blob on cheek/top
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.18, r * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();

  if (special) drawSpecialMark(ctx, special, cx, cy, r);
}

function roundBlob(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
}

function drawFeature(ctx, tile, cx, cy, r) {
  const f = tile.feature;
  if (f === 'ears') {
    // soft bear-like round ears (original mascot vibe, not copying any IP)
    for (const s of [-1, 1]) {
      const ex = cx + s * r * 0.78, ey = cy - r * 0.78;
      ctx.fillStyle = tile.accent;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tile.blush;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.16, 0, Math.PI * 2); ctx.fill();
    }
  } else if (f === 'shine') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    star(ctx, cx + r * 0.55, cy - r * 0.55, 5, r * 0.14, r * 0.06);
    ctx.fill();
  } else if (f === 'helmet') {
    ctx.fillStyle = tile.accent;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.62, r * 0.62, r * 0.38, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a2236';
    ctx.fillRect(cx - r * 0.62, cy - r * 0.62, r * 1.24, r * 0.1);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.15, cy - r * 0.78, r * 0.2, r * 0.1, -0.3, 0, Math.PI * 2); ctx.fill();
  } else if (f === 'wheels') {
    ctx.fillStyle = tile.accent;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + s * r * 0.55, cy + r * 0.7, r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx + s * r * 0.55, cy + r * 0.7, r * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tile.accent;
    }
  } else if (f === 'steam') {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = cx - r * 0.25 + i * r * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, cy - r * 0.85);
      ctx.quadraticCurveTo(x + 6, cy - r * 1.05, x, cy - r * 1.2);
      ctx.stroke();
    }
  } else if (f === 'bow') {
    ctx.fillStyle = '#ff6b9d';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.lineTo(cx - r * 0.28, cy - r * 0.55);
    ctx.lineTo(cx, cy - r * 0.65);
    ctx.lineTo(cx + r * 0.28, cy - r * 0.55);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.7, r * 0.08, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSpecialMark(ctx, special, cx, cy, r) {
  const meta = SPECIAL[special];
  // cute badge at bottom
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.55, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = meta?.color || '#ffe66d';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.55, r * 0.28, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = meta?.color || '#ff9f1c';
  ctx.font = `900 ${Math.floor(r * 0.36)}px "Apple Color Emoji",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const mark = special === 'lineH' ? '↔' : special === 'lineV' ? '↕' : special === 'bomb' ? '✦' : '★';
  ctx.fillText(mark, cx, cy + r * 0.57);
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

/** Prewarm open-eye sprites for all tiles (call once on mount). */
export function prewarmSprites() {
  for (const t of TILES) {
    getTileSprite(t.id, null, false);
    getTileSprite(t.id, null, true);
    for (const s of Object.keys(SPECIAL)) getTileSprite(t.id, s, false);
  }
}
