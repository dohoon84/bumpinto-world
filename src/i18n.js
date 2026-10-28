// 글로벌 유저 대응 한/영 UI 다국어(KO / EN) 모듈
// - 월드 속 건물 간판·지명·현지 NPC 대사는 그 동네 고유 언어(정자동=한국어, 스타베이스=영어)를 유지하고,
// - 내 조작 화면(지구본, 로비, HUD, 버튼, 리액션 바, 채팅, 접속자 패널, 휴대폰)은 유저 언어(KO / EN)를 따른다.

const LANG_KEY = 'jeongja3d.lang';
const listeners = new Set();

function detectInitialLang() {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('lang')?.trim().toLowerCase();
    if (q === 'en' || q === 'ko') {
      try { localStorage.setItem(LANG_KEY, q); } catch {}
      return q;
    }
  }
  try {
    const saved = localStorage.getItem(LANG_KEY)?.trim().toLowerCase();
    if (saved === 'en' || saved === 'ko') return saved;
  } catch {}
  if (typeof navigator !== 'undefined') {
    const nav = (navigator.language || navigator.userLanguage || 'ko').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : 'en';
  }
  return 'ko';
}

let currentLang = detectInitialLang();

export function getLang() {
  return currentLang;
}

export function isEn() {
  return currentLang === 'en';
}

export function tr(koText, enText) {
  return currentLang === 'en' ? enText : koText;
}

export function setLang(next) {
  const norm = String(next || '').trim().toLowerCase() === 'en' ? 'en' : 'ko';
  if (norm === currentLang) return currentLang;
  currentLang = norm;
  try { localStorage.setItem(LANG_KEY, norm); } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = norm;
  }
  for (const fn of listeners) {
    try { fn(norm); } catch {}
  }
  return currentLang;
}

export function toggleLang() {
  return setLang(currentLang === 'en' ? 'ko' : 'en');
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
