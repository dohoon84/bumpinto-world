// [범핑팡] B안 네온 오락실 블록·칸 스프라이트 — 일러스트 에셋
import { TILES, tileById, SPECIAL } from './tiles.js';

export const PANG_ASSETS = '/arcade/pang';
export const pangUrl = (p) => `${PANG_ASSETS}/${p}`;

const TILE_FILE = {
  bum: 'bear',
  coin: 'yellow',
  bike: 'green',
  bus: 'red',
  ramen: 'bowl',
  bento: 'box',
};

const CACHE = new Map();
const IMAGES = new Map();
const SIZE = 160;
const CELL_SIZE = 129;

function key(id, special) { return `${id}|${special || ''}`; }

function loadImage(src) {
  let img = IMAGES.get(src);
  if (img) return img;
  img = new Image();
  img.decoding = 'async';
  img.src = src;
  IMAGES.set(src, img);
  return img;
}

export function tileAssetPath(id, special = null) {
  const color = TILE_FILE[id] || TILE_FILE[tileById(id)?.id] || 'bear';
  if (special === 'bomb') return pangUrl('blocks/special/bomb.webp');
  if (special === 'color') return pangUrl('blocks/special/rainbow.webp');
  if (special === 'lineH') return pangUrl(`blocks/special/line-h-${color}.webp`);
  if (special === 'lineV') return pangUrl(`blocks/special/line-v-${color}.webp`);
  return pangUrl(`blocks/blk-${color}.webp`);
}

export function cellAssetPath(kind) {
  const name = kind === 'select' ? 'cell-select'
    : kind === 'hint' ? 'cell-hint'
    : kind === 'dark' ? 'cell-dark'
    : 'cell-light';
  return pangUrl(`board/${name}.webp`);
}

function paintWhenReady(canvas, img, size) {
  const paint = () => {
    if (!img.naturalWidth) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
  };
  if (img.complete) paint();
  else img.addEventListener('load', paint, { once: true });
}

export function getTileSprite(id, special = null, _blink = false) {
  const k = key(id, special);
  let c = CACHE.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  CACHE.set(k, c);
  const img = loadImage(tileAssetPath(id, special));
  paintWhenReady(c, img, SIZE);
  return c;
}

export function getCellSprite(kind = 'light') {
  const k = `cell|${kind}`;
  let c = CACHE.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = CELL_SIZE; c.height = CELL_SIZE;
  CACHE.set(k, c);
  const img = loadImage(cellAssetPath(kind));
  paintWhenReady(c, img, CELL_SIZE);
  return c;
}

export function clearSpriteCache() { CACHE.clear(); }

export function prewarmSprites() {
  for (const t of TILES) {
    getTileSprite(t.id, null, false);
    for (const s of Object.keys(SPECIAL)) getTileSprite(t.id, s, false);
  }
  for (const kind of ['light', 'dark', 'select', 'hint']) getCellSprite(kind);
}

export function mascotUrl(pose = 'wink') {
  const ok = new Set(['front', '34', 'back', 'cheer', 'wow', 'sad', 'wink', 'levelup']);
  const name = ok.has(pose) ? pose : 'wink';
  return pangUrl(`character/bum-${name}.webp`);
}
