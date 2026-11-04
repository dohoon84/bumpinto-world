// [econ-mobile] PC 경제 UI 스타일(body.ui-v2:not(.mobile) 아래)을 모바일(body.mobile.m-econ)에서 그대로 다시 쓴다.
//   PC CSS 파일은 건드리지 않고, 빌드 때 ?raw 로 글자만 받아 선택자 앞부분만 바꿔 <style> 로 넣는다.
//   → PC 쪽 키트·패널 스타일이 바뀌면 모바일도 따라간다. 모바일 전용 모양은 econ-m.css 가 위에서 덮는다.
import econCss from '../../ui-v2/econ-ui/econ-ui.css?raw';
import kitCss from '../../ui-v2/ui-v2.css?raw';

const PC = 'body.ui-v2:not(.mobile)';
export const SCOPE = 'body.mobile.m-econ';

/** 최상위 규칙 단위로 나눈다(@keyframes·@media 같은 중괄호 묶음은 통째로). */
export function splitRules(css) {
  const out = [];
  let depth = 0, start = 0;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { out.push(css.slice(start, i + 1).trim()); start = i + 1; } }
  }
  return out.filter(Boolean);
}

/** ui-v2.css 에서는 공통 키트(.v2-*)와 코인 연출만: id(#hud·#v2-top·#lobby…)가 붙은 PC 화면 규칙은 뺀다. */
export function kitRules(css) {
  return splitRules(css).filter((r) => {
    if (r.startsWith('@')) return false;
    const sel = r.slice(0, r.indexOf('{'));
    if (sel.trim() === PC) return true; // 색 토큰(--v2-*)
    return /\.v2-/.test(sel) && !/#/.test(sel);
  });
}

export function rescope(css) { return css.split(PC).join(SCOPE); }

export function mobileEconCss() {
  return [...kitRules(kitCss).map(rescope), rescope(econCss.replace(/\/\*[\s\S]*?\*\//g, ''))].join('\n');
}

export function injectEconCss() {
  if (document.getElementById('m-econ-pc-css')) return;
  const st = document.createElement('style');
  st.id = 'm-econ-pc-css';
  st.textContent = mobileEconCss();
  // econ-m.css(모바일 덮어쓰기)보다 앞에 둬야 같은 선택자 우선순위에서 모바일 쪽이 이긴다
  document.head.prepend(st);
}
