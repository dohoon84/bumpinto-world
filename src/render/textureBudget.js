// [mobile-profile] 폰에서 긴 변이 1024 를 넘는 텍스처를 같은 비율로 줄인다 (?mprof=0 이면 그대로).
//   GPU 업로드 뒤에, 다시 불러올 주소가 있는 이미지는 CPU 쪽 화상을 버린다 (컨텍스트 복구는 페이지 다시 열기).

import { mobileProfileEnabled } from '../mobile/profile.js';
import { isMobileMode } from '../mobile/flag.js';

export const MOBILE_TEX_MAX_EDGE = 1024;

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];

function texImage(tex) {
  return tex?.image || tex?.source?.data || null;
}

function dimOf(img) {
  if (!img) return { w: 0, h: 0 };
  const w = img.width || img.videoWidth || 0;
  const h = img.height || img.videoHeight || 0;
  return { w, h };
}

function skipTexture(tex) {
  if (!tex || !tex.isTexture) return true;
  if (tex.isCubeTexture || tex.isDepthTexture || tex.isVideoTexture || tex.isCompressedTexture) return true;
  if (tex.isRenderTargetTexture || tex.isFramebufferTexture) return true;
  const name = tex.name || '';
  if (name === 'PMREM.cubeUv' || /PMREM/i.test(name)) return true;
  return false;
}

function drawToCanvas(img, nw, nh) {
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!cv) return null;
  cv.width = nw;
  cv.height = nh;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  try {
    if (img.data && img.width && img.height && typeof ImageData !== 'undefined') {
      const tmp = document.createElement('canvas');
      tmp.width = img.width;
      tmp.height = img.height;
      const tctx = tmp.getContext('2d');
      const data = img.data instanceof Uint8ClampedArray ? img.data : new Uint8ClampedArray(img.data);
      tctx.putImageData(new ImageData(data, img.width, img.height), 0, 0);
      ctx.drawImage(tmp, 0, 0, nw, nh);
    } else {
      ctx.drawImage(img, 0, 0, nw, nh);
    }
  } catch {
    return null;
  }
  return cv;
}

export function downscaleTexture(tex, maxEdge = MOBILE_TEX_MAX_EDGE) {
  if (skipTexture(tex)) return null;
  if (tex.userData?.bwTexBudget === maxEdge) return null;
  const img = texImage(tex);
  const { w, h } = dimOf(img);
  if (!w || !h) return null;
  const edge = Math.max(w, h);
  if (edge <= maxEdge) {
    tex.userData.bwTexBudget = maxEdge;
    return null;
  }
  const scale = maxEdge / edge;
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const cv = drawToCanvas(img, nw, nh);
  if (!cv) return null;
  const src = (img && img.src) || tex.userData.imageSrc || '';
  if (src) tex.userData.imageSrc = src;
  tex.image = cv;
  if (tex.source) tex.source.data = cv;
  tex.needsUpdate = true;
  tex.userData.bwTexBudget = maxEdge;
  tex.userData.bwTexWas = { w, h };
  return { w, h, nw, nh, name: tex.name || src || '' };
}

export function collectSceneTextures(root) {
  const out = new Set();
  root?.traverse?.((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m) continue;
      for (const k of MAP_KEYS) if (m[k] && m[k].isTexture) out.add(m[k]);
    }
  });
  return [...out];
}

export function applyTextureBudget(root, { search, mobileMode, maxEdge = MOBILE_TEX_MAX_EDGE } = {}) {
  const mobile = mobileMode ?? (typeof isMobileMode === 'function' ? isMobileMode() : false);
  if (!mobileProfileEnabled(search, mobile)) return { changed: [], count: 0 };
  const changed = [];
  for (const tex of collectSceneTextures(root)) {
    const rec = downscaleTexture(tex, maxEdge);
    if (rec) changed.push(rec);
  }
  return { changed, count: changed.length };
}

function canRefetch(tex) {
  const src = tex.userData?.imageSrc;
  if (src && typeof src === 'string' && /^(https?:|\/)/.test(src) && !src.startsWith('data:')) return true;
  const img = texImage(tex);
  const url = img && img.src;
  if (url && typeof url === 'string' && /^(https?:|\/)/.test(url) && !url.startsWith('data:')) return true;
  return false;
}

/** GPU 에 올린 뒤, 다시 받을 주소가 있는 텍스처만 CPU 화상을 버린다. 캔버스·PMREM 은 유지. */
export function dropCpuSourcesAfterUpload(renderer, root) {
  if (!renderer || !root) return { dropped: 0 };
  let dropped = 0;
  for (const tex of collectSceneTextures(root)) {
    if (skipTexture(tex)) continue;
    if (!canRefetch(tex)) continue;
    if (tex.userData.bwCpuDropped) continue;
    const img = texImage(tex);
    const src = (img && img.src) || tex.userData.imageSrc;
    if (src) tex.userData.imageSrc = src;
    try { renderer.initTexture(tex); } catch { continue; }
    tex.image = null;
    if (tex.source) tex.source.data = null;
    tex.userData.bwCpuDropped = true;
    dropped++;
  }
  return { dropped };
}

export function textureBudgetEnabled(search, mobileMode) {
  return mobileProfileEnabled(search, mobileMode);
}
