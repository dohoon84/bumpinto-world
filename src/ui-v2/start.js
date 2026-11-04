// [ui-v2] 01a/01b 시작화면: 실제 게임 장면 배경(2장 크로스페이드 · 천천히 패닝) + 로고 + 시작하기 패널(Google / 게스트)
//   + 다시 온 사람에게 '마지막 역으로 이어하기'. 지구본(WebGL)은 여기서 만들지 않는다 — 게스트를 누른 뒤 월드 선택에서 연다.
//   배경은 JPG 2장(DOM)이라 WebGL 드로우콜 0. 화면을 떠나면 노드를 지워 이미지 메모리도 놓는다.
import { el, esc, ICON, headHtml, tagHtml } from './kit.js';
import { setTop, liveChip, langChip, contributeChip } from './topbar.js';
import { googleButton, requestGoogleSignIn, googleNotReadyText } from './google.js';
import { regionSummary, readLastStation } from './data.js';
import { tr, isEn, onLangChange } from '../i18n.js';
import { REPO_URL } from '../worldGate.js';
import { trackEvent } from '../analytics.js';

const SCENES = [
  { img: 'ui-v2/start-a.jpg', ko: '정자역 광장 · 실제 게임 화면', en: 'Jeongja Station Plaza · in-game' },
  { img: 'ui-v2/start-b.jpg', ko: '정자역 거리 · 실제 게임 화면', en: 'Jeongja streets · in-game' },
];
const SCENE_MS = 3000;

/**
 * @param {{ region: object, onGuest: () => void, onContinue: (last: {region:string, at:string|null}) => void, onGoogle?: (account) => void }} o
 */
export function openStart({ region, onGuest, onContinue, onGoogle }) {
  const base = import.meta.env.BASE_URL;
  const root = el('div', 'v2-screen v2-start');
  root.id = 'v2-start';
  root.innerHTML = `
    <div class="v2-start-bg">${SCENES.map((s, i) => `<div class="v2-bg${i === 0 ? ' on' : ''}" style="background-image:url('${base}${s.img}')"></div>`).join('')}</div>
    <div class="v2-shade-l"></div><div class="v2-shade-b"></div>
    <div class="v2-logo"></div>
    <section class="v2-panel v2-start-panel" aria-label="Start"></section>
    <div class="v2-scene-dots" aria-hidden="true"></div>
    <a class="v2-chip v2-studio" href="https://crazylabs.co.kr" target="_blank" rel="noopener"></a>`;
  document.body.appendChild(root);
  document.body.classList.add('v2-in-start');

  const logo = root.querySelector('.v2-logo');
  const panel = root.querySelector('.v2-start-panel');
  const dots = root.querySelector('.v2-scene-dots');
  const studio = root.querySelector('.v2-studio');
  const bgs = [...root.querySelectorAll('.v2-bg')];
  let scene = 0, msg = '', alive = true;

  const last = readLastStation();
  function render() {
    const sum = regionSummary();
    const kr = sum.by.KR || { open: 0, soon: 0 }, us = sum.by.US || { open: 0, soon: 0 };
    const soon = Object.values(sum.by).reduce((n, x) => n + x.soon, 0);
    logo.innerHTML = `
      ${tagHtml(tr('순차 오픈 · 글로벌 오픈월드', 'OPEN SOURCE · GLOBAL OPEN WORLD'), '#ffe169', { size: 14, cls: 'v2-logo-tag' })}
      <div class="v2-logo-row">${ICON.coin(96)}<h1>Bumpinto World</h1></div>
      <p class="v2-logo-sub">${esc(tr('다 같이 만들어 가는 오픈 월드', 'Walk real-world neighborhoods together'))}</p>`;
    panel.innerHTML = `
      ${headHtml(tr('시작하기', 'Start'), { size: 20 })}
      ${last ? `<button type="button" class="v2-btn primary v2-full" data-v2="continue">${esc(tr(`마지막 역으로 이어하기 · ${last.label}`, `Continue at ${last.label}`))}</button>
        <p class="v2-note">${esc(tr('지난번에 들어간 역 · 이 기기에 저장된 기록', 'Your last station · saved on this device'))}</p>` : ''}
      <div class="v2-gsi-slot"></div>
      <p class="v2-note">${esc(tr('잔액·기록이 계정에 저장돼요 · 다른 기기에서도 이어하기', 'Balance and records are saved to your account · continue on any device'))}</p>
      <button type="button" class="v2-btn secondary v2-full" data-v2="guest">${esc(tr('게스트로 계속', 'Continue as Guest'))}</button>
      <p class="v2-note">${esc(tr('게스트는 이 기기에만 저장 · 나중에 Google 연결 가능', 'Guests are saved on this device only · link Google later'))}</p>
      <p class="v2-msg" role="status" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
      <div class="v2-open-now">
        <span class="v2-open-k">${esc(tr('지금 열린 곳', 'Open now'))}</span>
        ${tagHtml(tr(`한국 열림 ${kr.open}`, `Korea ${kr.open} open`), '#20c997')}
        ${tagHtml(tr(`미국 열림 ${us.open}`, `USA ${us.open} open`), '#4cc9f0')}
        ${tagHtml(tr(`준비중 ${soon}`, `${soon} soon`), '#9eb4c6')}
      </div>`;
    const g = googleButton({ size: 'lg', label: 'signin', full: true });
    g.dataset.v2 = 'google';
    panel.querySelector('.v2-gsi-slot').replaceWith(g);
    panel.classList.toggle('has-continue', !!last);
    dots.innerHTML = SCENES.map((s, i) => `<i class="${i === scene ? 'on' : ''}"></i>`).join('') + `<span>${esc(isEn() ? SCENES[scene].en : SCENES[scene].ko)}</span>`;
    studio.innerHTML = `<small>${esc(tr('개발', 'Studio'))}</small><b>${esc(tr('크레이지랩스', 'CrazyLabs'))}</b>`;
    setTop([liveChip(region)], [langChip(), contributeChip(REPO_URL)]);
  }

  const timer = setInterval(() => {
    scene = (scene + 1) % SCENES.length;
    bgs.forEach((b, i) => b.classList.toggle('on', i === scene));
    const cap = dots.querySelector('span');
    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === scene));
    if (cap) cap.textContent = isEn() ? SCENES[scene].en : SCENES[scene].ko;
  }, SCENE_MS);

  const unsub = onLangChange(() => alive && render());
  function close() {
    if (!alive) return;
    alive = false;
    clearInterval(timer);
    unsub();
    document.body.classList.remove('v2-in-start');
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), 260);
  }

  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-v2]');
    if (!b) return;
    const k = b.dataset.v2;
    if (k === 'guest') { trackEvent('uiv2_start_guest'); close(); onGuest(); return; }
    if (k === 'continue' && last) { trackEvent('uiv2_start_continue', { region: last.region, at: last.at || '' }); close(); onContinue(last); return; }
    if (k === 'google') {
      trackEvent('uiv2_start_google');
      b.disabled = true;
      const r = await requestGoogleSignIn();
      b.disabled = false;
      if (r.ok) { close(); (onGoogle || onGuest)(r.account); return; }
      msg = r.reason === 'not_ready' ? googleNotReadyText() : tr('로그인하지 못했어요. 다시 시도하거나 게스트로 계속해 주세요.', 'Sign-in failed. Try again or continue as a guest.');
      const m = panel.querySelector('.v2-msg');
      m.hidden = false; m.textContent = msg;
    }
  });

  render();
  return { close };
}
