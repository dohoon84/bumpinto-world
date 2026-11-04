// [mobile] 모바일 전용 시작화면 — PC 지구본(worldGate)을 줄인 게 아니라 가로 한 화면짜리 2단계:
//   1) 시작: 로고 + [입장할 곳 고르기] (+ 이 폰에 캐릭터가 있으면 [이어서 입장])
//   2) 지역 · 역 고르기: 왼쪽 지역 리스트, 오른쪽 역 칩 + 고른 역 카드 + 입장 버튼
// 고르면 PC 지구본과 같은 URL 규칙으로 game.js 에 넘긴다 (같은 지역이면 history.replaceState, 다른 지역이면 페이지 이동).
import { enterFullscreen, shouldShowHomeScreenHint, dismissHomeScreenHint } from './fullscreen.js';
import { OPEN_REGIONS, getCurrentRegion, getRegion, navigateToRegion } from '../regions/index.js';
import { OPEN_MAINLINE_STATIONS, OPEN_BRANCH_STATIONS, corridorName } from '../corridor/globeCorridor.js';
import { readSavedPassport, isPassportActive } from '../look.js';
import { isStarbaseLive } from '../worldGate.js';
import { isEn, toggleLang } from '../i18n.js';
import { mountBgVideo } from '../landing/bgVideo.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (ko, en) => (isEn() ? en : ko);
const BACK = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GLOBE = '<svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="8" cy="8" rx="2.8" ry="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.9 8 H14.1" stroke="currentColor" stroke-width="1.3"/></svg>';

function regionList() {
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.hostname.endsWith('.local')
    || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(location.hostname); // [mobile] LAN 으로 폰에서 열어 볼 때도 로컬과 같게
  return OPEN_REGIONS.map((r) => {
    const corridor = !!r.features?.corridor;
    const locked = r.id === 'starbase' && !isStarbaseLive() && !isLocal;
    return {
      id: r.id,
      title: corridor ? corridorName(isEn()) : t('스타베이스', 'Starbase'),
      sub: corridor ? t(`한국 · ${OPEN_MAINLINE_STATIONS.length + OPEN_BRANCH_STATIONS.length}개 역`, `Korea · ${OPEN_MAINLINE_STATIONS.length + OPEN_BRANCH_STATIONS.length} stations`) : t('미국 · 텍사스', 'USA · Texas'),
      stations: corridor ? [...OPEN_MAINLINE_STATIONS, ...OPEN_BRANCH_STATIONS] : null,
      locked,
    };
  });
}

export function mountLanding() {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'm-landing';
    document.body.classList.add('in-mobile-landing');
    document.body.appendChild(root);
    // ?bgvideo=1 미리보기: 재생이 시작돼야 배경 이미지를 걷는다 (그 전·실패 시엔 기존 landing.jpg 그대로)
    const bgv = mountBgVideo({ host: document.body, before: root, className: 'm-bgvideo', onPlaying: () => document.body.classList.add('m-bgvideo-on') });
    const dropBgv = () => { if (bgv) bgv.destroy(); document.body.classList.remove('m-bgvideo-on'); };
    const current = getCurrentRegion();
    const st = { view: 'start', region: current.id, station: 'jeongja' };

    const finish = () => { dropBgv(); root.remove(); document.body.classList.remove('in-mobile-landing'); resolve(); };
    const go = () => {
      try { goInner(); } catch (e) {
        // 안전망: 고른 값을 URL 에 못 넣었더라도 로비는 연다 (기본 입장)
        console.error('[mobile] landing go', e);
        try { const u = new URL(location.href); u.searchParams.set('enter', '1'); history.replaceState(null, '', u.toString()); } catch { /* noop */ }
        finish();
      }
    };
    const goInner = () => {
      const target = getRegion(st.region);
      const passport = isPassportActive() && !!readSavedPassport();
      const extra = { ...(passport ? { passport: 1 } : { enter: 1 }), from: current.id };
      const corridor = !!target.features?.corridor;
      if (corridor && st.station && st.station !== 'jeongja') extra.at = st.station;
      if (target.id !== current.id) { navigateToRegion(target.id, extra); return; }
      const url = new URL(location.href);
      for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
      history.replaceState(null, '', url.toString());
      finish();
    };
    const resume = () => {
      const url = new URL(location.href);
      url.searchParams.set('passport', '1');
      history.replaceState(null, '', url.toString());
      dropBgv();
      root.remove();
      document.body.classList.remove('in-mobile-landing');
      resolve();
    };

    const render = () => {
      const saved = readSavedPassport();
      if (st.view === 'start') {
        root.className = 'm-view-start';
        root.innerHTML = `
          <div class="m-shade"></div>
          <button type="button" class="m-icon-btn m-tr" data-act="lang" aria-label="${t('언어 바꾸기', 'Switch language')}">${GLOBE}<span>${isEn() ? 'KO' : 'EN'}</span></button>
          <div class="m-logo">
            <h1>Bumpinto World</h1>
            <p>${t('다 같이 만들어 가는 오픈 월드', 'An open world we build together')}</p>
          </div>
          <div class="m-sheet m-start-sheet">
            <h2>${t('시작하기', 'Start')}</h2>
            <button type="button" class="m-btn m-primary" data-act="pick">${t('입장할 곳 고르기', 'Choose where to start')}</button>
            ${saved ? `<button type="button" class="m-btn m-secondary" data-act="resume">${t('이어서 입장', 'Continue as')} · ${esc(saved.name)}</button>` : ''}
            <small>${saved ? t('이 폰에 저장된 캐릭터로 바로 들어가요', 'Jump back in with the character saved on this phone') : t('다음 화면에서 지역과 역을 고르고, 캐릭터를 만들어요', 'Pick a region and station, then make your character')}</small>
          </div>
          ${shouldShowHomeScreenHint() ? `<div class="m-a2hs" role="note"><span>${t('홈 화면에 추가하면 전체 화면으로 플레이할 수 있어요', 'Add to Home Screen to play in full screen')}</span><button type="button" data-act="a2hs-x" aria-label="${t('닫기', 'Close')}">✕</button></div>` : ''}
          <a class="m-chip m-bl" href="https://github.com/dohoon84/bumpinto-world" target="_blank" rel="noopener">⭐ ${t('GitHub에서 함께 만들기', 'Build it with us on GitHub')}</a>`;
        return;
      }
      const regions = regionList();
      const reg = regions.find((r) => r.id === st.region) || regions[0];
      const stn = reg.stations?.find((s) => s.id === st.station) || reg.stations?.[0];
      root.className = 'm-view-pick';
      root.innerHTML = `
        <div class="m-shade is-dim"></div>
        <div class="m-pick-top"><button type="button" class="m-icon-btn" data-act="back" aria-label="${t('뒤로', 'Back')}">${BACK}</button><h2>${t('어디서 시작할까요?', 'Where do you want to start?')}</h2></div>
        <div class="m-sheet m-regions">
          <div class="m-sec">${t('지역', 'Region')}</div>
          ${regions.map((r) => `<button type="button" class="m-region${r.id === reg.id ? ' on' : ''}" data-region="${r.id}" ${r.locked ? 'disabled' : ''}><b>${esc(r.title)}</b><span>${esc(r.locked ? t('곧 열려요', 'Opening soon') : r.sub)}</span></button>`).join('')}
        </div>
        <div class="m-sheet m-stations">
          ${reg.stations ? `
            <div class="m-sec-row"><span class="m-sec">${t('역 고르기 · 옆으로 밀어서 더 보기', 'Pick a station · swipe for more')}</span></div>
            <div class="m-line"></div>
            <div class="m-stn-scroll">${reg.stations.map((s) => `<button type="button" class="m-stn${s.id === stn.id ? ' on' : ''}" data-stn="${s.id}">${esc(isEn() ? s.en : s.ko)}</button>`).join('')}</div>
            <div class="m-picked"><div><b>${esc(isEn() ? `${stn.en} Stn.` : `${stn.ko}역`)}</b><span>${esc((stn.lines || []).join(' · '))}</span></div>
              <button type="button" class="m-btn m-primary" data-act="go">${esc(isEn() ? `Enter ${stn.en}` : `${stn.ko}역으로 입장`)}</button></div>`
            : `<div class="m-region-card" style="background-image:url('${import.meta.env.BASE_URL}promo/starbase-launch.jpg')"></div>
            <div class="m-picked"><div><b>${t('스타베이스 (TX)', 'Starbase, TX')}</b><span>${t('로드스터 쇼 · 발사 쇼', 'Roadster show · Launch show')}</span></div>
              <button type="button" class="m-btn m-primary" data-act="go">${t('스타베이스로 입장', 'Enter Starbase')}</button></div>`}
        </div>`;
      root.querySelector('.m-stn.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const act = b.dataset.act;
      // 시작·입장 탭(사용자 제스처)에서 전체 화면 시도 (Android Chrome. iOS 는 아무 일 없음)
      if (act === 'pick' || act === 'go' || act === 'resume') enterFullscreen();
      if (act === 'a2hs-x') { dismissHomeScreenHint(); b.parentElement?.remove(); return; }
      if (act === 'lang') { toggleLang(); render(); return; }
      if (act === 'pick') { st.view = 'pick'; render(); return; }
      if (act === 'resume') { resume(); return; }
      if (act === 'back') { st.view = 'start'; render(); return; }
      if (act === 'go') { b.disabled = true; go(); return; }
      if (b.dataset.region) { st.region = b.dataset.region; st.station = 'jeongja'; render(); return; }
      if (b.dataset.stn) { st.station = b.dataset.stn; render(); }
    });
    render();
  });
}
