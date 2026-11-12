// [weekly-titles] 기본 켜짐. ?titles=0 이면 끔.
export const TITLE_IDS = Object.freeze(['title_bigspender', 'title_flexregular', 'title_bogohunter']);
export const TITLE_BY_RANK = Object.freeze({ 1: 'title_bigspender', 2: 'title_flexregular', 3: 'title_bogohunter' });
export const RANK_BY_TITLE = Object.freeze({ title_bigspender: 1, title_flexregular: 2, title_bogohunter: 3 });

function paramsOf(search) {
  if (search instanceof URLSearchParams) return search;
  try { return new URLSearchParams(search || (typeof location !== 'undefined' ? location.search : '')); } catch { return new URLSearchParams(); }
}

export function titlesEnabled(search) {
  return paramsOf(search).get('titles') !== '0';
}

/** ?titlePreview=1|2|3|bigspender|flexregular|bogohunter|title_bigspender — 내 머리 위에 가짜 칭호 */
export function titlePreviewId(search) {
  const raw = String(paramsOf(search).get('titlePreview') || paramsOf(search).get('titleDemo') || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === '1' || raw === 'bigspender' || raw === 'title_bigspender') return 'title_bigspender';
  if (raw === '2' || raw === 'flexregular' || raw === 'title_flexregular') return 'title_flexregular';
  if (raw === '3' || raw === 'bogohunter' || raw === 'title_bogohunter' || raw === '1+1') return 'title_bogohunter';
  return null;
}

/** 미리보기에서 획득 연출을 쓸지. 기본 켬. ?titleEarn=0 이면 평소 상태만. */
export function titlePreviewEarn(search) {
  return !!titlePreviewId(search) && paramsOf(search).get('titleEarn') !== '0';
}

export function prefersReducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function useHalfAtlas(search) {
  const q = paramsOf(search);
  if (q.get('titleAtlas') === '0.5' || q.get('titleAtlas') === 'half') return true;
  if (q.get('titleAtlas') === '1') return false;
  try {
    const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    if (dpr <= 1.5) return true;
  } catch { /* */ }
  return false;
}
