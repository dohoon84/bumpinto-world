// [titles] 기본 켜짐. ?titles=0|off|no 면 연출·도감·머리 위 표시·프레즌스 칭호를 끈다.
//   ?titledemo=<titleId> 는 입장 직후 그 칭호의 획득 연출을 한 번 강제로 튼다.

const OFF = new Set(['0', 'off', 'no', 'false']);

function flagOn(search, key) {
  try {
    const q = new URLSearchParams(search.startsWith('?') || search.includes('=') ? search : '').get(key);
    if (q == null) return true;
    return !OFF.has(String(q).toLowerCase());
  } catch {
    return true;
  }
}

export function titlesEnabled(search = '') {
  return flagOn(search, 'titles');
}

export const titleFxOn = (search = '') => flagOn(search, 'titlefx');
export const titleRarityOn = (search = '') => flagOn(search, 'titlerarity');
export const titleCheerOn = (search = '') => flagOn(search, 'titlecheer');

export function titleDemoId(search = '', known = null) {
  try {
    const q = new URLSearchParams(search.startsWith('?') || search.includes('=') ? search : '').get('titledemo');
    if (!q) return '';
    const id = String(q).trim();
    if (known && !known(id)) return '';
    return id;
  } catch {
    return '';
  }
}
