// 얼굴을 머리 표면에 그려 넣는 텍스처. 눈·눈썹·입·볼터치·주근깨·점·수염은
// 메시를 붙이지 않고 캔버스에 인쇄한 뒤 머리 앞면 UV에 얹는다.
import * as THREE from 'three';

const SIZE = 256;
const MAX_CACHE = 96;
const matCache = new Map();
const geoCache = {};

function hexRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function darken(hex, amt) {
  const { r, g, b } = hexRgb(hex);
  const k = 1 - amt;
  const h = (n) => Math.max(0, Math.min(255, Math.round(n * k))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function faceKey(look, expr) {
  return [
    look.skin, look.eyes, look.brows, look.mouth,
    look.blush, look.freckles, look.mole,
    look.eyeColor, look.beard, look.hairColor, expr || 'idle',
  ].join('|');
}

function drawBrow(ctx, x, y, side, kind, color) {
  if (!kind || kind === 'none') return;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  if (kind === 'straight') {
    ctx.moveTo(x - 20 * side, y);
    ctx.lineTo(x + 18 * side, y);
  } else if (kind === 'angry') {
    ctx.moveTo(x - 20 * side, y + 6);
    ctx.lineTo(x + 18 * side, y - 7);
  } else if (kind === 'worry') {
    ctx.moveTo(x - 20 * side, y - 6);
    ctx.lineTo(x + 18 * side, y + 6);
  } else {
    ctx.moveTo(x - 20 * side, y + 2);
    ctx.quadraticCurveTo(x, y - 10, x + 18 * side, y + 1);
  }
  ctx.stroke();
}

function drawOpenEye(ctx, x, y, kind, color) {
  const ink = color || '#222222';
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (kind === 'smile') {
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y + 6, 16, Math.PI * 1.08, Math.PI * -0.08, true);
    ctx.stroke();
    return;
  }
  if (kind === 'sleepy') {
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 16, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 2);
    ctx.quadraticCurveTo(x, y - 8, x + 18, y - 2);
    ctx.stroke();
    return;
  }
  if (kind === 'sharp') {
    ctx.beginPath();
    ctx.moveTo(x - 22, y);
    ctx.quadraticCurveTo(x, y - 16, x + 22, y - 2);
    ctx.quadraticCurveTo(x, y + 14, x - 22, y);
    ctx.fill();
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.ellipse(x + 5, y - 3, 4.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // round + sparkle (and wink's open eye)
  const ry = kind === 'sparkle' ? 20 : 18;
  const rx = kind === 'sparkle' ? 18 : 17;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7f1e6';
  ctx.beginPath();
  ctx.ellipse(x + 5, y - 6, kind === 'sparkle' ? 5.5 : 4.2, kind === 'sparkle' ? 5.5 : 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === 'sparkle') {
    ctx.fillStyle = '#fff8';
    ctx.beginPath();
    ctx.ellipse(x - 7, y + 5, 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x + 16, y - 20);
    ctx.lineTo(x + 19, y - 12);
    ctx.lineTo(x + 27, y - 15);
    ctx.lineTo(x + 20, y - 9);
    ctx.lineTo(x + 24, y - 2);
    ctx.lineTo(x + 16, y - 8);
    ctx.closePath();
    ctx.fill();
  }
}

function drawClosedEye(ctx, x, y, color) {
  ctx.strokeStyle = color || '#222222';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y + 4, 15, Math.PI * 1.08, Math.PI * -0.08, true);
  ctx.stroke();
}

function drawMouth(ctx, kind, y, color) {
  if (!kind || kind === 'none') return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'smile') {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, y - 6, 22, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (kind === 'grin') {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(100, y - 2);
    ctx.quadraticCurveTo(128, y + 22, 156, y - 2);
    ctx.quadraticCurveTo(128, y + 8, 100, y - 2);
    ctx.fill();
    ctx.fillStyle = '#f2d0b0';
    ctx.beginPath();
    ctx.moveTo(110, y + 1);
    ctx.quadraticCurveTo(128, y + 10, 146, y + 1);
    ctx.lineTo(146, y + 3);
    ctx.quadraticCurveTo(128, y + 6, 110, y + 3);
    ctx.fill();
  } else if (kind === 'pout') {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, y + 8, 10, Math.PI * 1.15, Math.PI * -0.15, true);
    ctx.stroke();
  } else if (kind === 'open') {
    ctx.beginPath();
    ctx.ellipse(128, y + 4, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'cat') {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(118, y + 2, 10, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(138, y + 2, 10, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
}

function drawBeard(ctx, kind, hairColor) {
  if (kind !== 'goatee' && kind !== 'full') return;
  const col = darken(hairColor || '#2a211c', 0.12);
  ctx.fillStyle = col;
  // 콧수염
  ctx.beginPath();
  ctx.ellipse(112, 158, 18, 8, -0.2, 0, Math.PI * 2);
  ctx.ellipse(144, 158, 18, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  if (kind !== 'full') return;
  ctx.beginPath();
  ctx.ellipse(128, 198, 36, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(62, 150, 16, 32, 0.15, 0, Math.PI * 2);
  ctx.ellipse(194, 150, 16, 32, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(88, 172, 22, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(168, 172, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintFace(look, expr) {
  const cnv = document.createElement('canvas');
  cnv.width = SIZE;
  cnv.height = SIZE;
  const ctx = cnv.getContext('2d');
  const skin = look.skin || '#f2d0b0';
  const eye = look.eyeColor || '#222222';
  const hair = look.hairColor || '#2a211c';
  const lip = darken(skin, 0.28);
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, SIZE, SIZE);

  if (look.blush === '1') {
    ctx.fillStyle = 'rgba(232, 112, 132, 0.32)';
    ctx.beginPath();
    ctx.ellipse(78, 156, 26, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(178, 156, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.freckles === '1') {
    ctx.fillStyle = darken(skin, 0.22);
    for (const [x, y] of [[72, 148], [86, 156], [68, 160], [184, 148], [170, 157], [190, 161], [96, 152], [160, 152]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const browKind = expr === 'cry' && look.brows === 'none' ? 'worry'
    : expr === 'angry' ? 'angry'
      : (look.brows || 'none');
  const browCol = darken(hair, 0.05);
  drawBrow(ctx, 90, 86, 1, browKind, browCol);
  drawBrow(ctx, 166, 86, -1, browKind, browCol);

  const eyeKind = look.eyes || 'round';
  const leftX = 90, rightX = 166, eyeY = 118;
  if (expr === 'blink') {
    drawClosedEye(ctx, leftX, eyeY, eye);
    drawClosedEye(ctx, rightX, eyeY, eye);
  } else if (expr === 'sleepy') {
    drawOpenEye(ctx, leftX, eyeY, 'sleepy', eye);
    drawOpenEye(ctx, rightX, eyeY, 'sleepy', eye);
  } else if (eyeKind === 'wink') {
    drawOpenEye(ctx, leftX, eyeY, expr === 'smile' ? 'smile' : 'round', eye);
    drawClosedEye(ctx, rightX, eyeY, eye);
  } else if (expr === 'smile' && (eyeKind === 'round' || eyeKind === 'sparkle')) {
    drawOpenEye(ctx, leftX, eyeY, 'smile', eye);
    drawOpenEye(ctx, rightX, eyeY, 'smile', eye);
  } else {
    drawOpenEye(ctx, leftX, eyeY, eyeKind, eye);
    drawOpenEye(ctx, rightX, eyeY, eyeKind, eye);
  }

  if (look.mole === 'cheek') {
    ctx.fillStyle = darken(skin, 0.45);
    ctx.beginPath();
    ctx.arc(174, 152, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.mole === 'lip') {
    ctx.fillStyle = darken(skin, 0.45);
    ctx.beginPath();
    ctx.arc(148, 174, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBeard(ctx, look.beard, hair);

  let mouth = look.mouth || 'none';
  if (expr === 'smile' && (mouth === 'none' || mouth === 'pout')) mouth = 'smile';
  if (expr === 'cry') mouth = mouth === 'grin' ? 'pout' : (mouth === 'none' ? 'pout' : mouth);
  if (expr === 'pout') mouth = 'pout';
  drawMouth(ctx, mouth, 180, lip);

  if (expr === 'cry') {
    ctx.fillStyle = '#7eb6d9';
    ctx.beginPath();
    ctx.ellipse(86, 148, 4, 10, 0.15, 0, Math.PI * 2);
    ctx.ellipse(170, 150, 4, 12, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  return cnv;
}

export function projectFrontUVs(geometry, kind) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (kind === 'box') {
      if (z > 0.2) {
        uv.setXY(i, 0.5 + x / 0.46, 0.5 + y / 0.5);
      } else {
        uv.setXY(i, 0.015, 0.015);
      }
    } else {
      const r = 0.26;
      if (z > -0.015) {
        const s = 0.9;
        uv.setXY(i, 0.5 + (x / r) * 0.5 * s, 0.5 + (y / r) * 0.5 * s);
      } else {
        uv.setXY(i, 0.015, 0.015);
      }
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

export function getHeadGeometry(face) {
  const key = face === 'square' ? 'square' : 'round';
  if (!geoCache[key]) {
    geoCache[key] = projectFrontUVs(
      key === 'square' ? new THREE.BoxGeometry(0.46, 0.5, 0.42) : new THREE.SphereGeometry(0.26, 10, 8),
      key === 'square' ? 'box' : 'sphere',
    );
  }
  return geoCache[key];
}

export function getFaceMaterial(look, expr = 'idle') {
  const key = faceKey(look, expr);
  const hit = matCache.get(key);
  if (hit) {
    matCache.delete(key);
    matCache.set(key, hit);
    return hit;
  }
  // node 테스트(jsdom 없음)에서는 캔버스 대신 피부색만 쓴다.
  if (typeof document === 'undefined') {
    const mat = new THREE.MeshLambertMaterial({ color: look?.skin || '#f2d0b0' });
    matCache.set(key, mat);
    if (matCache.size > MAX_CACHE) {
      const oldest = matCache.keys().next().value;
      const old = matCache.get(oldest);
      matCache.delete(oldest);
      old?.map?.dispose?.();
      old?.dispose?.();
    }
    return mat;
  }
  const tex = new THREE.CanvasTexture(paintFace(look, expr));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff });
  matCache.set(key, mat);
  if (matCache.size > MAX_CACHE) {
    const oldest = matCache.keys().next().value;
    const old = matCache.get(oldest);
    matCache.delete(oldest);
    old?.map?.dispose?.();
    old?.dispose?.();
  }
  return mat;
}

export function applyFaceExpression(head, look, expr = 'idle') {
  if (!head || !look) return;
  head.material = getFaceMaterial(look, expr);
}
