// [titles] 칭호 아이콘 슬롯. 그림은 public/titles/manifest.json 이 가리키는 SVG 다.
//   코드는 경로를 모른다. 파일을 바꾸거나 매니페스트 항목만 고치면 된다.
import { GRADES } from './catalog.js';

export const ICON_TIERS = Object.freeze(['bronze', 'silver', 'gold', 'legendary', 'event']);
const TIER_INK = Object.freeze({
  bronze: '#fff8e7', silver: '#1c2836', gold: '#3a2500', legendary: '#fff8e7', event: '#fff8e7',
});

/** 매니페스트 JSON → 슬롯 배열. 모르는 등급은 버린다. */
export function indexSlots(manifest) {
  const slots = manifest?.slots && typeof manifest.slots === 'object' ? manifest.slots : {};
  const out = [];
  for (const [id, row] of Object.entries(slots)) {
    if (!row || typeof row !== 'object') continue;
    if (!ICON_TIERS.includes(row.tier)) continue;
    const src = typeof row.src === 'string' ? row.src.trim() : '';
    if (!src || src.includes('..')) continue;
    out.push({ id, tier: row.tier, src, placeholder: row.placeholder !== false });
  }
  return out;
}

export function markLetter(title) {
  if (title?.id === 'streak.d100') return '100';
  if (title?.id === 'streak.d30') return '30';
  if (title?.id === 'streak.d7') return '7';
  const ko = title?.name?.ko || '';
  return [...ko][0] || '?';
}

let slots = new Map();
let rev = 0;
let ready = false;
const listeners = new Set();

export function iconRev() { return rev; }
export function iconsReady() { return ready; }
export function onIcons(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function gradeOf(title) { return slots.get(title?.id)?.tier || title?.grade || 'gold'; }

function absUrl(src, base) {
  const b = base.endsWith('/') ? base : `${base}/`;
  return b + src.replace(/^\//, '');
}

/** img 는 currentColor 를 물려받지 않는다. 등급 금속색으로 바꾼 SVG 를 쓴다. */
export function tintSvg(svg, color) {
  const hex = /^#[0-9a-fA-F]{3,8}$/.test(String(color || '')) ? String(color) : '#ffffff';
  return String(svg).split('currentColor').join(hex);
}

export function tierColor(grade) {
  return (GRADES[grade] || GRADES.gold).metal;
}

export function iconSrc(title) {
  const slot = title ? slots.get(title.id) : null;
  if (slot?.url) return slot.url;
  return placeholderDataUrl(title);
}

/** 얼굴 데칼. SVG 가 오면 같은 캔버스에 덮어 그린다. */
export function paintIcon(ctx, title, size, done) {
  drawPlaceholder(ctx, title, size);
  const apply = () => {
    const slot = slots.get(title.id);
    if (!slot?.url || typeof Image === 'undefined') { done?.(); return; }
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      done?.();
    };
    img.onerror = () => done?.();
    img.src = slot.url;
  };
  if (ready) apply();
  else onIcons(apply);
}

export function drawPlaceholder(ctx, title, size) {
  const grade = gradeOf(title);
  const g = GRADES[grade] || GRADES.gold;
  const ink = TIER_INK[grade] || '#fff';
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const R = s * 0.46;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = g.metal;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, s * 0.03);
  ctx.setLineDash([s * 0.05, s * 0.035]);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letter = markLetter(title);
  ctx.font = `700 ${Math.round(s * (letter.length > 2 ? 0.22 : 0.34))}px sans-serif`;
  ctx.fillText(letter, cx, cy - s * 0.04);
  ctx.font = `700 ${Math.round(s * 0.09)}px sans-serif`;
  ctx.fillText('PLACEHOLDER', cx, cy + s * 0.22);
}

const phCache = new Map();
function placeholderDataUrl(title) {
  if (typeof document === 'undefined') return '';
  const key = `${title?.id || ''}:${gradeOf(title)}`;
  if (phCache.has(key)) return phCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  drawPlaceholder(c.getContext('2d'), title, 128);
  const url = c.toDataURL('image/png');
  phCache.set(key, url);
  return url;
}

export async function loadTitleIcons(base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './') {
  try {
    const res = await fetch(`${base.endsWith('/') ? base : `${base}/`}titles/manifest.json`);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const next = new Map();
    const rows = indexSlots(json);
    await Promise.all(rows.map(async (slot) => {
      const file = absUrl(slot.src, base);
      let url = file;
      try {
        const svg = await fetch(file);
        if (svg.ok) {
          const text = await svg.text();
          url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tintSvg(text, tierColor(slot.tier)))}`;
        }
      } catch { /* 원본 경로로 둔다 */ }
      next.set(slot.id, { ...slot, url });
    }));
    slots = next;
  } catch (e) {
    console.warn('[titles] icon manifest', e?.message || e);
  }
  ready = true;
  rev += 1;
  phCache.clear();
  for (const fn of listeners) { try { fn(); } catch { /* 구독자 */ } }
}
