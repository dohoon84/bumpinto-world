// [ui-v2] 01a/01b 시작화면: 실제 게임 장면 배경(2장 크로스페이드 · 천천히 패닝) + 로고 + 시작하기 패널(Google / 게스트)
//   + 다시 온 사람에게 '마지막 역으로 이어하기'. 지구본(WebGL)은 여기서 만들지 않는다 — 게스트를 누른 뒤 월드 선택에서 연다.
//   배경은 JPG 2장(DOM)이라 WebGL 드로우콜 0. 화면을 떠나면 노드를 지워 이미지 메모리도 놓는다.
import { el, esc, ICON, headHtml, tagHtml } from './kit.js';
import { setTop, liveChip, langChip, contributeChip } from './topbar.js';
import { googleButton, requestGoogleSignIn, googleNotReadyText, GOOGLE_G_SVG } from './google.js';
import { regionSummary, readLastStation, stationLabel } from './data.js';
import { tr, isEn, onLangChange } from '../i18n.js';
import { REPO_URL } from '../worldGate.js';
import { trackEvent } from '../analytics.js';
import { mountBgVideo } from '../landing/bgVideo.js';

const SCENES = [
  { img: 'ui-v2/start-a.jpg', ko: '정자역 광장 · 실제 게임 화면', en: 'Jeongja Station Plaza · in-game' },
  { img: 'ui-v2/start-b.jpg', ko: '정자역 거리 · 실제 게임 화면', en: 'Jeongja streets · in-game' },
];
const SCENE_MS = 3000;

/**
 * 로그인된 계정(econ.getSession() 이 게스트가 아님)이면 '게스트로 계속' 대신 계정 이름이 붙은 '계속하기'(primary) — 두 번째 기기에서 로그인한 뒤 시작화면으로
 *   한 번 돌아왔을 때 '게스트'로 들어가 계정 잔액이 보이는 혼란을 없앤다. Google 버튼은 이 상태에서 숨긴다. 게스트 화면은 그대로.
 * @param {{ region: object, onGuest: () => void, onContinue: (last: {region:string, at:string|null}) => void, onGoogle?: (account) => void, onAccount?: (dest: {region:string, at:string|null, label:string}, session) => void, defaultAt?: string|null }} o
 *   '계속하기'(onAccount) = 게스트 게이트가 아니라 바로 입장 카드: 마지막 역이 있으면 그 역('마지막 역으로 이어하기'와 같은 곳), 없으면 기본 역(region · defaultAt).
 *   입장 카드의 계정 모드(#30 lobby.js is-account: 계정 캐릭터로 바로 입장)는 lobby 쪽이 스스로 판단 — 여기서는 그 훅에 기대지 않는다.
 */
export function openStart({ region, onGuest, onContinue, onGoogle, onAccount, defaultAt = null }) {
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
  // PC 배경 영상(기본 · ?bgvideo=0 끔). 재생('playing') 전·실패 시엔 기존 이미지 크로스페이드 그대로. 모바일에선 안 불러옴.
  const bgv = mountBgVideo({ host: root.querySelector('.v2-start-bg'), className: 'v2-bgvideo', onPlaying: () => root.classList.add('bgv-on') });
  // 계정 상태: null = 확인 중(아주 잠깐, 버튼을 숨겨 '게스트로 계속'이 번쩍 보이지 않게) → 게스트/로그인. 1.5초 안에 답이 없으면 게스트 화면
  let ses = null, checking = !document.body.classList.contains('mobile');
  let offSes = null;
  const signedIn = () => !!(ses && !ses.isGuest && (ses.signedIn ?? true));
  if (checking) {
    const done = (s) => { if (!alive) return; if (s) ses = s; if (checking || s) { checking = false; render(); } };
    setTimeout(() => done(null), 1500);
    import('./econ/index.js').then(({ econ }) => {
      if (!alive) return;
      offSes = econ.on('session', (s) => done(s));
      econ.getSession().then(done).catch(() => done(null));
    }).catch(() => done(null));
  }

  const last = readLastStation();
  const dest = () => last || { region: region.id, at: defaultAt || null, label: stationLabel(region.id, defaultAt || null) };
  function acctBlock() {
    const name = ses.displayName || tr('내 계정', 'My account');
    const av = `<span class="v2-acct-q on v2-start-av" aria-hidden="true">${esc([...name][0] || '•')}</span>`;
    return `<div class="v2-start-acct">${av}<div><b>${esc(name)}</b><span class="v2-note">${ses.provider === 'google' || !ses.provider ? `${GOOGLE_G_SVG(14)} ${esc(tr('Google 계정 · 로그인됨', 'Google account · signed in'))}` : esc(tr('계정 · 로그인됨', 'Account · signed in'))}</span></div></div>
      <button type="button" class="v2-btn primary v2-full v2-acct-go" data-v2="account">${esc(tr(`계속하기 · ${name}`, `Continue · ${name}`))}</button>
      <p class="v2-note">${esc(last ? tr(`지난번 역 · ${last.label} 입장 카드로 바로 · 이 계정 캐릭터·잔액 그대로`, `Straight to ${last.label} (your last station) · same account character and balance`) : tr(`${dest().label} 입장 카드로 바로 · 이 계정 캐릭터·잔액 그대로`, `Straight to ${dest().label} · same account character and balance`))}</p>`;
  }
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
      ${last && !signedIn() ? `<button type="button" class="v2-btn primary v2-full" data-v2="continue">${esc(tr(`마지막 역으로 이어하기 · ${last.label}`, `Continue at ${last.label}`))}</button>
        <p class="v2-note">${esc(tr('지난번에 들어간 역 · 이 기기에 저장된 기록', 'Your last station · saved on this device'))}</p>` : ''}
      ${checking ? `<p class="v2-note v2-checking">${esc(tr('계정 확인 중…', 'Checking your account…'))}</p>` : signedIn() ? acctBlock() : `<div class="v2-gsi-slot"></div>
      <p class="v2-note">${esc(tr('잔액·기록이 계정에 저장돼요 · 다른 기기에서도 이어하기', 'Balance and records are saved to your account · continue on any device'))}</p>
      <button type="button" class="v2-btn secondary v2-full" data-v2="guest">${esc(tr('게스트로 계속', 'Continue as Guest'))}</button>
      <p class="v2-note">${esc(tr('게스트는 이 기기에만 저장 · 나중에 Google 연결 가능', 'Guests are saved on this device only · link Google later'))}</p>`}
      <p class="v2-msg" role="status" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
      <div class="v2-open-now">
        <span class="v2-open-k">${esc(tr('지금 열린 곳', 'Open now'))}</span>
        ${tagHtml(tr(`한국 열림 ${kr.open}`, `Korea ${kr.open} open`), '#20c997')}
        ${tagHtml(tr(`미국 열림 ${us.open}`, `USA ${us.open} open`), '#4cc9f0')}
        ${tagHtml(tr(`준비중 ${soon}`, `${soon} soon`), '#9eb4c6')}
      </div>`;
    const slot = panel.querySelector('.v2-gsi-slot');
    if (slot) { const g = googleButton({ size: 'lg', label: 'signin', full: true }); g.dataset.v2 = 'google'; slot.replaceWith(g); }
    panel.classList.toggle('is-account', signedIn());
    panel.classList.toggle('has-continue', !!last && !signedIn());
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
    if (bgv) bgv.destroy();
    offSes?.();
    document.body.classList.remove('v2-in-start');
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), 260);
  }

  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-v2]');
    if (!b) return;
    const k = b.dataset.v2;
    if (k === 'guest') { trackEvent('uiv2_start_guest'); close(); onGuest(); return; }
    if (k === 'account') { const d = dest(); trackEvent('uiv2_start_account', { region: d.region, at: d.at || '', last: last ? 1 : 0 }); close(); (onAccount || onContinue)(d, ses); return; }
    if (k === 'continue' && last) { trackEvent('uiv2_start_continue', { region: last.region, at: last.at || '' }); close(); onContinue(last, ses); return; }
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
