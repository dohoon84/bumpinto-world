// [mobile] 모바일 모드 부팅: body.mobile + 화면 회전 안내 + (URL 로 바로 입장하는 경우가 아니면) 모바일 전용 시작화면.
//   시작화면에서 고른 지역·역은 PC 지구본과 같은 URL 규칙(?enter=1 / ?passport=1 · ?from= · ?at=)으로 game.js 에 넘긴다.
import './mobile.css';
import { mountLanding } from './landing.js';
import { isEn } from '../i18n.js';
import { installWebAppMeta } from './fullscreen.js';
import { installScrollLock } from './scrollLock.js'; // [mobile-scroll-lock]

function prepDocument() {
  document.body.classList.add('mobile');
  try { installScrollLock(); } catch { /* 없어도 게임은 된다 */ }
  try { installWebAppMeta(); } catch { /* 머리 태그는 없어도 된다 */ }
  // 노치·홈 인디케이터 영역까지 그리고 env(safe-area-inset-*) 로 피한다 (데스크톱 브라우저에선 효과 없음)
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';
  // iOS Safari/Chrome: 두 손가락 핀치가 페이지 확대로 새지 않게 (게임 핀치 줌은 캔버스 pointer 이벤트로)
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  // 테스트용 안전 영역 흉내: ?safe=59 (좌우 59 · 아래 21, iPhone 가로) 또는 ?safe=왼,오,아래
  const sp = new URLSearchParams(location.search).get('safe');
  if (sp) {
    const px = (v) => `${parseInt(v, 10) || 0}px`;
    const [l, r = l, b = '21'] = sp.split(',');
    const st = document.body.style;
    st.setProperty('--sa-l', px(l)); st.setProperty('--sa-r', px(r)); st.setProperty('--sa-b', px(b));
    document.body.classList.add('m-safe-sim');
    if ((parseInt(r, 10) || 0) > (parseInt(l, 10) || 0)) document.body.classList.add('m-safe-r'); // 아일랜드가 오른쪽
  }
  if (!document.getElementById('m-rotate')) {
    const r = document.createElement('div');
    r.id = 'm-rotate';
    r.innerHTML = `<div class="m-rotate-card">
      <svg width="96" height="96" viewBox="0 0 120 120" aria-hidden="true"><rect x="38" y="14" width="44" height="80" rx="9" fill="none" stroke="#e8f2f8" stroke-width="4"/><rect x="20" y="58" width="80" height="44" rx="9" fill="#ffe169" fill-opacity=".18" stroke="#ffe169" stroke-width="4"/><path d="M92 30 A30 30 0 0 1 104 52" fill="none" stroke="#ffe169" stroke-width="4" stroke-linecap="round"/><path d="M98 52 L104 54 L108 47" fill="none" stroke="#ffe169" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <b>${isEn() ? 'Rotate to landscape' : '가로로 돌려 주세요'}</b>
      <p>${isEn() ? 'Bumpinto World plays in landscape.' : 'Bumpinto World는 가로 화면에서 플레이해요.'}</p>
      <small>${isEn() ? 'If rotation is locked, turn the lock off' : '세로로 고정돼 있으면 화면 회전 잠금을 꺼 주세요'}</small>
    </div>`;
    document.body.appendChild(r);
  }
}

export async function bootMobile() {
  prepDocument();
  const p = new URLSearchParams(location.search);
  // 이미 입장 경로(다른 지역에서 넘어옴 · 이어하기 · 스크린샷)면 시작화면 없이 바로 게임
  if (p.get('enter') === '1' || p.get('passport') === '1' || p.has('from') || p.has('shot')) return;
  await mountLanding();
}
