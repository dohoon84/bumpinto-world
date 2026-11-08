// [bp24-poster] BUMP24 이벤트 포스터. 매장 앞이 아니라 첫 화면 팝업.
// 다시 보지 않기 → localStorage. X·배경·닫기 → 다음 로드에 다시.
// 기간이 끝나면 안 띄움. 끝 시각은 BP24_POSTER_END (기본 2026-11-16 00:00 KST).
//   빌드 전에 VITE_BP24_POSTER_END 로 바꿀 수 있다.
// v3 교체: public/bump24-poster.webp 만 같은 이름으로 바꾸면 된다 (BP24_POSTER_SRC).
// ?bp24poster=0 이면 끔. ?shot 은 캡처용이라 띄우지 않는다.
// 이 팝업을 닫은 뒤에만 모바일 오픈 안내가 나온다 (main.js). 둘은 겹치지 않는다.

export const BP24_POSTER_DISMISS_KEY = 'bw.bump24.poster.dismiss';
export const BP24_POSTER_SRC = '/bump24-poster.webp';

const DEFAULT_END = '2026-11-16T00:00:00+09:00';

function endFromEnv() {
  try {
    const v = import.meta.env?.VITE_BP24_POSTER_END;
    if (v) return String(v);
  } catch { /* node 테스트에는 env 가 없다 */ }
  return DEFAULT_END;
}

export const BP24_POSTER_END = endFromEnv();

export function posterEndMs(end = BP24_POSTER_END) {
  const t = Date.parse(end);
  return Number.isFinite(t) ? t : Date.parse(DEFAULT_END);
}

export function dismissPosterForever(storage = globalThis.localStorage) {
  try { storage?.setItem(BP24_POSTER_DISMISS_KEY, '1'); } catch { /* 저장소가 막혀 있으면 이번만 닫힘 */ }
}

export function shouldShowPoster(params, storage = globalThis.localStorage, now = Date.now(), end = BP24_POSTER_END) {
  if (params?.get?.('bp24poster') === '0') return false;
  if (params?.has?.('shot')) return false;
  try { if (storage?.getItem(BP24_POSTER_DISMISS_KEY) === '1') return false; } catch { /* 읽기 실패면 보여 준다 */ }
  return now < posterEndMs(end);
}

const CSS = `
#bw-bp24-poster{position:fixed;inset:0;z-index:5100;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));background:rgba(4,8,18,.72);overflow:hidden;font-family:inherit}
#bw-bp24-poster .bpp-card{display:flex;flex-direction:column;align-items:center;width:100%;height:100%;max-height:100%;min-height:0;gap:10px}
#bw-bp24-poster .bpp-frame{flex:1 1 auto;min-height:0;min-width:0;width:100%;display:flex;align-items:center;justify-content:center}
#bw-bp24-poster .bpp-shot{position:relative;max-width:min(720px,100%);line-height:0}
#bw-bp24-poster img{display:block;max-width:100%;max-height:calc(100dvh - 110px);width:auto;height:auto;object-fit:contain;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45)}
#bw-bp24-poster .bpp-x{position:absolute;top:8px;right:8px;z-index:1;width:44px;height:44px;border:0;border-radius:12px;background:rgba(8,14,28,.82);color:#fff;font-size:22px;line-height:1;cursor:pointer}
#bw-bp24-poster .bpp-row{flex:0 0 auto;display:flex;gap:8px;width:100%;justify-content:center}
#bw-bp24-poster .bpp-never,#bw-bp24-poster .bpp-close{min-height:44px;padding:0 16px;border-radius:12px;font:inherit;font-size:15px;font-weight:800;cursor:pointer}
#bw-bp24-poster .bpp-never{border:1px solid rgba(255,255,255,.28);background:rgba(8,14,28,.72);color:#e8f2f8}
#bw-bp24-poster .bpp-close{border:0;background:linear-gradient(180deg,#ffe169,#ffb703);color:#3a2a00}
`;

export function showPoster({ params = new URLSearchParams(location.search), storage, now = Date.now(), end = BP24_POSTER_END } = {}) {
  if (!shouldShowPoster(params, storage, now, end) || document.getElementById('bw-bp24-poster')) return null;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'bw-bp24-poster';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '편의점을 털어라');
  root.innerHTML = `<div class="bpp-card">
    <div class="bpp-frame"><div class="bpp-shot">
      <img src="${BP24_POSTER_SRC}" alt="BUMP24 편의점을 털어라">
      <button type="button" class="bpp-x" data-close aria-label="닫기">×</button>
    </div></div>
    <div class="bpp-row">
      <button type="button" class="bpp-never" data-never>다시 보지 않기</button>
      <button type="button" class="bpp-close" data-close>닫기</button>
    </div>
  </div>`;
  let done = false;
  let resolve = () => {};
  const closed = new Promise((r) => { resolve = r; });
  const finish = (forever) => {
    if (done) return;
    done = true;
    if (forever) dismissPosterForever(storage);
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    style.remove();
    resolve();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close]')) finish(false);
    else if (e.target.closest('[data-never]')) finish(true);
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(root);
  root.querySelector('.bpp-close')?.focus();
  return { close: () => finish(false), closed };
}
