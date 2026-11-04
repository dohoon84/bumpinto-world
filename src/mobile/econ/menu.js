// [econ-mobile] ☰ 메뉴 시트(Figma 02)에 'bum' 묶음을 덧붙인다. src/mobile/hud.js 의 fillMenu 가 다시 그릴 때마다 붙인다.
//   타일 모양은 기존 .m-tile 그대로. 누르면 메뉴를 닫고(스크림 클릭) 해당 시트를 연다.
const svg = (body, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const IC = {
  quest: '<rect x="4" y="4" width="16" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8.5" y="2.5" width="7" height="4" rx="1.5" fill="currentColor"/><path d="M8 13 L11 16 L16.5 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 10 H21.5" stroke="currentColor" stroke-width="2.4"/><path d="M6 15 H11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  karma: '<path d="M12 2.5 L14.4 9.6 L21.5 12 L14.4 14.4 L12 21.5 L9.6 14.4 L2.5 12 L9.6 9.6 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  bike: '<circle cx="6" cy="16.5" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16.5" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 16.5 L10 9 H15.5 L18 16.5 M10 9 L12.5 16.5 H6 M14 6 H17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  out: '<path d="M10 4 H5 V20 H10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 12 H21 M17 8 L21 12 L17 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function mountMenuSection({ open, link, isDemo, econ, tr, esc, GOOGLE_G_SVG }) {
  let guest = true;
  econ.getSession().then((s) => { guest = s.isGuest; });
  econ.on('session', (s) => { guest = s.isGuest; });
  const closeMenu = () => document.querySelector('#m-hud .m-scrim:not([hidden])')?.click();
  const build = (body) => {
    const tiles = [
      ['04a', svg(IC.quest), tr('할 일', 'Quests')],
      ['07', svg(IC.card), tr('교통카드', 'Transit card')],
      ['06', svg(IC.karma), tr('카르마 · 업적', 'Karma · Achievements')],
      ['11', svg(IC.bike), tr('탈것 상점', 'Vehicle shop')],
    ];
    if (guest) tiles.push(['link', `<span class="m-econ-gt">${GOOGLE_G_SVG(18)}</span>`, tr('구글 계정 연동하고 bum 받기', 'Link Google account to earn bum'), 'gold']);
    else if (econ.isMock && econ.dev && isDemo()) tiles.push(['devout', svg(IC.out), tr('개발 로그아웃', 'Dev sign out')]);
    const sec = document.createElement('div');
    sec.className = 'm-econ-sec';
    sec.innerHTML = `<p class="m-sec">bum</p><div class="m-tiles m-econ-tiles">${tiles.map(([k, ic, label, tone]) => `<button type="button" class="m-tile${tone ? ` is-${tone}` : ''}" data-econ="${k}">${ic}<span>${esc(label)}</span></button>`).join('')}</div>`;
    sec.addEventListener('click', (e) => {
      const k = e.target.closest('[data-econ]')?.dataset.econ; if (!k) return;
      e.stopPropagation();
      closeMenu();
      if (k === 'link') link();
      else if (k === 'devout') econ.dev.reset();
      else open(k);
    });
    body.prepend(sec);
  };
  const attach = () => {
    const body = document.querySelector('#m-hud .m-menu-body');
    if (!body) return false;
    const ensure = () => { if (!body.querySelector('.m-econ-sec') && body.childElementCount) build(body); };
    new MutationObserver(ensure).observe(body, { childList: true });
    ensure();
    return true;
  };
  if (!attach()) { const mo = new MutationObserver(() => { if (attach()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); }
}
