// [범편의점] 에셋 경로 · 이미지 캐시
export const MERGE_ASSETS = '/arcade/merge';
export const mergeUrl = (p) => `${MERGE_ASSETS}/${p}`;

const IMAGES = new Map();

export function loadImage(src) {
  let img = IMAGES.get(src);
  if (img) return img;
  img = new Image();
  img.decoding = 'async';
  img.src = src;
  IMAGES.set(src, img);
  return img;
}

export function itemUrl(id, dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 2) || 2) {
  const tag = dpr >= 2.45 ? '@3x' : '@2x';
  return mergeUrl(`items/item-${id}${tag}.png`);
}

export function itemImage(id, dpr) { return loadImage(itemUrl(id, dpr)); }

export function bumUrl(pose = 'front') {
  const ok = new Set(['front', 'wink', 'cheer', 'sad']);
  return mergeUrl(`character/bum-${ok.has(pose) ? pose : 'front'}.png`);
}

export function prewarmMerge(dpr) {
  const ids = ['coin', 'candy', 'snack', 'drink', 'kimbap', 'lunch', 'basket', 'cart', 'store', 'bum'];
  for (const id of ids) itemImage(id, dpr);
  loadImage(mergeUrl('tub/frame.png'));
  loadImage(mergeUrl('tub/danger-line.png'));
  loadImage(mergeUrl('tub/drop-indicator.png'));
  for (const p of ['front', 'wink', 'cheer', 'sad']) loadImage(bumUrl(p));
}

export function clearMergeImages() { IMAGES.clear(); }
